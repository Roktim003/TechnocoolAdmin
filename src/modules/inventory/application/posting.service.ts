import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { hasLevel } from "@/shared/rbac/levels";
import { computeEntry, type CalcResult } from "../domain/calculate";
import { applyExactOut, applyIn, fromCostState, toCostState, type CostState } from "../domain/cost";
import { d, money, ZERO, type Dec } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import { fiscalYear, formatDocNumber, todayInDhaka } from "../domain/numbering";
import { assertSerialCount } from "../domain/rules";
import { ENTRY_TYPE_META, SERIAL_OUT_STATUS, takesStock, type Condition, type ProductCostState, type SerialStatus } from "../domain/types";
import { receiptEvent, receiptListener } from "./receipts";
import { balanceKey, sortKeys, type BalanceKey, type BalanceRow, type EntryRecord, type InventoryActor, type InventorySettings, type InventoryStore, type LineRecord, type MovementInsert } from "./ports";

export interface PostOptions {
  confirmBelowCost?: boolean;
  /** Set when posting is the result of an approval. */
  approverId?: string;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];
const now = () => new Date();

function ensure(balances: Map<string, BalanceRow>, key: BalanceKey): BalanceRow {
  const k = balanceKey(key);
  let row = balances.get(k);
  if (!row) {
    row = { ...key, qtyOnHand: "0.000", qtyReserved: "0.000" };
    balances.set(k, row);
  }
  return row;
}

/**
 * The posting engine. Every path that changes stock — direct post, approval, transfer dispatch
 * and receipt, reservation, reversal — goes through these methods, always inside the caller's
 * database transaction and always locking ProductCost rows, then StockBalance rows, in sorted
 * order (productId, warehouseId, condition) so concurrent postings can't deadlock.
 */
export class StockPostingService {
  /** Assigns the entry's document number (gap-free, from the locked DocumentSequence row). */
  async numberFor(store: InventoryStore, e: Pick<EntryRecord, "type" | "entryDate">, settings: InventorySettings): Promise<string> {
    const fy = fiscalYear(new Date(`${e.entryDate}T00:00:00Z`), settings.fiscalYearStartMonth);
    const prefix = ENTRY_TYPE_META[e.type].prefix;
    return formatDocNumber(prefix, fy, await store.nextNumber(prefix, fy));
  }

  /** Same computation the calculate endpoint runs, fed with the given (locked or live) costs. */
  async compute(store: InventoryStore, e: EntryRecord, costs: Map<string, ProductCostState>): Promise<CalcResult> {
    const originalCosts = new Map<string, string>();
    if (e.type === "RETURN_FROM_SITE" && e.originalEntry) {
      const original = await store.entry(e.originalEntry.id);
      for (const l of original?.lines ?? []) originalCosts.set(l.id, l.unitCostBdt);
    }
    return computeEntry({
      type: e.type,
      lines: e.lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        condition: l.condition,
        originalUnitCost: l.originalLineId ? (originalCosts.get(l.originalLineId) ?? null) : null,
        direction: l.adjustDirection,
      })),
      charges: e.charges.map((c) => ({ type: c.type, mode: c.mode, value: c.value, includeInCost: c.includeInCost })),
      exchangeRate: e.exchangeRate,
      discountAmount: e.discountAmount,
      vatPercent: e.vatPercent,
      costs,
    });
  }

  /** Sale lines below average cost are refused unless an Admin explicitly confirms (and the setting allows it). */
  assertPriceRule(e: EntryRecord, calc: CalcResult, actor: InventoryActor, settings: InventorySettings, confirm: boolean | undefined): boolean {
    if (e.type !== "SALE") return false;
    if (d(e.discountAmount).gt(d(calc.totals.subtotal))) throw InventoryErrors.discountTooHigh();
    const below = calc.lines.map((l, i) => (l.belowCost ? e.lines[i]!.product.code : null)).filter((x): x is string => !!x);
    if (!below.length) return false;
    if (confirm && hasLevel(actor.level, "FULL") && settings.allowAdminBelowCostSale) return true;
    throw InventoryErrors.belowCost(uniq(below));
  }

  /* ───────────────────────────── post ───────────────────────────── */

  /** Posts a DRAFT or PENDING entry (transfers: dispatches it). */
  async post(store: InventoryStore, entryId: string, actor: InventoryActor, opts: PostOptions = {}): Promise<void> {
    const e = await store.lockEntry(entryId);
    if (!e) throw new NotFoundError("Stock entry");
    if (!["DRAFT", "PENDING"].includes(e.status)) throw InventoryErrors.wrongStatus("post", e.status);
    if (e.type === "REVERSAL") throw InventoryErrors.wrongStatus("post", e.status);
    if (!e.lines.length) throw InventoryErrors.noLines();
    const settings = await store.settings();
    const meta = ENTRY_TYPE_META[e.type];
    const isTransfer = e.type === "TRANSFER";
    const wh = e.warehouse;
    const productIds = uniq(e.lines.map((l) => l.productId)).sort();
    if (e.type === "OPENING" && (await store.openingLocked(wh.id))) throw InventoryErrors.openingLocked(wh.name);
    await this.assertNotFrozen(store, wh, productIds, e);

    // 1. Locks: the purchase order (if any), costs, then balances, all sorted. Missing rows are created first by the store.
    if (e.purchaseOrder) await receiptListener().lock(store.tx, e.purchaseOrder.id);
    const costs = await store.lockCosts(productIds);
    const keys = sortKeys(uniq(e.lines.map((l) => balanceKey({ productId: l.productId, warehouseId: wh.id, condition: l.condition }))).map((k) => {
      const [productId, warehouseId, condition] = k.split("|");
      return { productId: productId!, warehouseId: warehouseId!, condition: condition as Condition };
    }));
    const balances = await store.lockBalances(keys);
    const own = new Map((await store.reservations(e.id)).map((r) => [balanceKey(r), d(r.qty)]));

    // 2. Availability (never negative): on hand − reserved by others ≥ quantity.
    if (takesStock(e.type)) this.assertAvailable(e, e.lines, balances, own);
    if (meta.direction === "ADJUST") this.assertAvailable(e, e.lines.filter((l) => l.adjustDirection === "LOSS"), balances, own);

    // 3. Costs, computed from the locked cost rows.
    const calc = await this.compute(store, e, costs);
    const belowCostConfirmed = this.assertPriceRule(e, calc, actor, settings, opts.confirmBelowCost);

    // 5. Serials (before movements, so a bad serial aborts the whole transaction).
    await this.postSerials(store, e);

    // 4. Movements, balances, product cost.
    const states = new Map<string, CostState>(productIds.map((p) => [p, toCostState(costs.get(p))]));
    const movements: MovementInsert[] = [];
    const transit = new Map<string, { qty: Dec; value: Dec }>();
    for (const [i, line] of e.lines.entries()) {
      const c = calc.lines[i]!;
      const key = { productId: line.productId, warehouseId: wh.id, condition: line.condition };
      const b = ensure(balances, key);
      const qty = d(line.qty);
      const value = d(c.costAmount);
      let state = states.get(line.productId)!;
      let signedQty = qty;
      let signedValue = value;

      if (meta.direction === "IN" || (meta.direction === "ADJUST" && line.adjustDirection === "GAIN")) {
        state = applyIn(state, qty, value);
      } else {
        signedQty = qty.neg();
        signedValue = value.neg();
        if (!isTransfer) state = applyExactOut(state, qty, value).state;
        else {
          const t = transit.get(line.productId) ?? { qty: ZERO, value: ZERO };
          transit.set(line.productId, { qty: t.qty.plus(qty), value: t.value.plus(value) });
        }
      }
      const onHand = d(b.qtyOnHand).plus(signedQty);
      if (onHand.lt(0)) throw InventoryErrors.insufficientStock(line.product.code, b.qtyOnHand, line.qty, wh.name, line.condition);
      if (meta.direction === "ADJUST" && onHand.lt(d(b.qtyReserved))) throw InventoryErrors.adjustmentBelowReserved(line.product.code, wh.name);
      b.qtyOnHand = onHand.toFixed(3);
      states.set(line.productId, state);
      movements.push({
        entryId: e.id,
        lineId: line.id,
        productId: line.productId,
        warehouseId: wh.id,
        condition: line.condition,
        qtyChange: signedQty.toFixed(3),
        unitCost: c.unitCostBdt,
        valueChange: money(signedValue).toFixed(2),
        balanceAfter: b.qtyOnHand,
        avgCostAfter: state.avgCost.toFixed(4),
      });
    }

    // 6. Release this entry's reservation together with the stock it held.
    for (const [k, q] of own) {
      const b = balances.get(k);
      if (b) b.qtyReserved = d(b.qtyReserved).minus(q).toFixed(3);
    }
    for (const k of keys) await store.saveBalance(balances.get(balanceKey(k))!);
    if (!isTransfer) for (const p of productIds) await store.saveCost(p, fromCostState(states.get(p)!));
    for (const [productId, t] of transit) await store.addInTransit(e.id, productId, t.qty.toFixed(3), t.value.toFixed(2));
    await store.insertMovements(movements);
    await store.deleteReservations(e.id);
    await this.saveComputed(store, e, calc);

    const number = e.number ?? (await this.numberFor(store, e, settings));
    // GRNs against a purchase order: received quantities and PO status, in this same transaction.
    const receipt = receiptEvent({ ...e, number }, actor.actorId);
    if (receipt) await receiptListener().posted(store.tx, receipt, { fromPending: e.status === "PENDING" });

    const at = now();
    await store.updateEntry(e.id, {
      number,
      status: isTransfer ? "DISPATCHED" : "POSTED",
      postedAt: at,
      ...(isTransfer ? { dispatchedAt: at } : {}),
      ...(opts.approverId ? { verifiedById: opts.approverId, verifiedAt: at } : {}),
      belowCostConfirmed,
      ...this.totals(calc),
    });
  }

  /**
   * The stock-count freeze: while a count is COUNTING or SUBMITTED, its products can't move in
   * its warehouse. The warehouse advisory lock (shared) is taken first, so a count starting at
   * the same moment either sees this posting in its snapshot or makes the posting wait.
   */
  async assertNotFrozen(store: InventoryStore, wh: { id: string; name: string }, productIds: string[], e?: EntryRecord): Promise<void> {
    await store.lockWarehouses([wh.id], "shared");
    const c = await store.activeCount(wh.id, productIds);
    if (!c) return;
    const codes = e ? uniq(e.lines.filter((l) => c.productIds.includes(l.productId)).map((l) => l.product.code)) : [];
    throw InventoryErrors.countInProgress(c.number, wh.name, codes);
  }

  private assertAvailable(e: EntryRecord, lines: LineRecord[], balances: Map<string, BalanceRow>, own: Map<string, Dec>): void {
    const need = new Map<string, { qty: Dec; line: LineRecord }>();
    for (const l of lines) {
      const k = balanceKey({ productId: l.productId, warehouseId: e.warehouse.id, condition: l.condition });
      const cur = need.get(k);
      need.set(k, { qty: (cur?.qty ?? ZERO).plus(d(l.qty)), line: l });
    }
    for (const [k, { qty, line }] of need) {
      const b = balances.get(k);
      const available = d(b?.qtyOnHand).minus(d(b?.qtyReserved)).plus(own.get(k) ?? ZERO);
      if (available.lt(qty)) throw InventoryErrors.insufficientStock(line.product.code, available.toFixed(3), qty.toFixed(3), e.warehouse.name, line.condition);
    }
  }

  totals(calc: CalcResult) {
    return {
      subtotal: calc.totals.subtotal,
      vatAmount: calc.totals.vatAmount,
      grandTotal: calc.totals.grandTotal,
      costTotal: calc.totals.costTotal,
      discountAmount: calc.totals.discountAmount,
      vatPercent: calc.totals.vatPercent,
    };
  }

  async saveComputed(store: InventoryStore, e: EntryRecord, calc: CalcResult): Promise<void> {
    for (const [i, line] of e.lines.entries()) {
      const c = calc.lines[i]!;
      await store.updateLine(line.id, { unitCostBdt: c.unitCostBdt, landedUnitCost: c.landedUnitCost, amount: c.amount, costAmount: c.costAmount });
    }
    for (const [i, ch] of e.charges.entries()) await store.updateCharge(ch.id, calc.charges[i]!.amountBdt);
  }

  /* ───────────────────────────── serials ───────────────────────────── */

  private async postSerials(store: InventoryStore, e: EntryRecord): Promise<void> {
    const typeDir = ENTRY_TYPE_META[e.type].direction;
    const isCount = e.type === "STOCK_ADJUSTMENT";
    for (const line of e.lines) {
      if (!line.product.trackSerial) continue;
      const dir = typeDir === "ADJUST" ? (line.adjustDirection === "GAIN" ? "IN" : "OUT") : typeDir;
      const texts = line.serials.map((s) => s.serial);
      assertSerialCount(line.product.code, line.qty, texts);
      const existing = new Map((await store.serialsByText(line.productId, texts)).map((s) => [s.serial, s]));

      for (const serial of texts) {
        const ex = existing.get(serial);
        let target: SerialStatus;
        let data: { status: SerialStatus; warehouseId: string | null; projectId: string | null; customerId: string | null; supplierId: string | null; reservedEntryId: null };

        if (dir === "IN") {
          target = (e.type === "RETURN_FROM_SITE" || isCount) && line.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK";
          if (isCount) {
            // Found in a count but not expected: back into stock, unless it is recorded as present somewhere.
            if (ex && !["RETURNED_TO_SUPPLIER", "WRITTEN_OFF", "ISSUED", "SOLD"].includes(ex.status)) throw InventoryErrors.serialExists(serial, ex.status);
          } else if (e.type === "RETURN_FROM_SITE") {
            if (ex && ex.status !== "ISSUED") throw InventoryErrors.serialUnavailable(serial, `it is ${ex.status.toLowerCase().replace(/_/g, " ")}, not issued to a site`);
            if (ex && e.project && ex.projectId && ex.projectId !== e.project.id) throw InventoryErrors.serialUnavailable(serial, "it was issued to another project");
          } else if (ex && !["RETURNED_TO_SUPPLIER", "WRITTEN_OFF"].includes(ex.status)) {
            throw InventoryErrors.serialExists(serial, ex.status);
          }
          data = { status: target, warehouseId: e.warehouse.id, projectId: null, customerId: null, supplierId: e.supplier?.id ?? ex?.supplierId ?? null, reservedEntryId: null };
        } else {
          const base: SerialStatus = line.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK";
          if (!ex) throw InventoryErrors.serialUnavailable(serial, "it is not in stock");
          const mine = ex.status === "RESERVED" && ex.reservedEntryId === e.id;
          if (ex.warehouseId !== e.warehouse.id) throw InventoryErrors.serialUnavailable(serial, `it is not in ${e.warehouse.name}`);
          if (!mine && !(ex.status === base && !ex.reservedEntryId)) throw InventoryErrors.serialUnavailable(serial, `it is ${ex.status.toLowerCase().replace(/_/g, " ")}`);
          target = SERIAL_OUT_STATUS[e.type]!;
          data = {
            status: target,
            warehouseId: null,
            projectId: e.type === "ISSUE_TO_PROJECT" ? (e.project?.id ?? null) : null,
            customerId: e.type === "SALE" ? (e.customer?.id ?? null) : null,
            supplierId: e.type === "RETURN_TO_SUPPLIER" ? (e.supplier?.id ?? ex.supplierId) : ex.supplierId,
            reservedEntryId: null,
          };
        }

        const id = ex ? ex.id : (await store.createSerial({ productId: line.productId, serial, ...data })).id;
        if (ex) await store.updateSerial(ex.id, data);
        await store.addSerialMovement({ serialId: id, entryId: e.id, fromStatus: ex?.status ?? null, toStatus: target, fromWarehouseId: ex?.warehouseId ?? null, toWarehouseId: data.warehouseId });
        await store.linkLineSerial(line.id, serial, id);
      }
    }
  }

  /* ───────────────────────────── reservations ───────────────────────────── */

  /** Holds stock (and serials) for a PENDING out / transfer entry so nobody else can promise it. */
  async reserve(store: InventoryStore, e: EntryRecord): Promise<void> {
    if (!takesStock(e.type)) return;
    await this.assertNotFrozen(store, e.warehouse, uniq(e.lines.map((l) => l.productId)), e);
    const need = new Map<string, { key: BalanceKey; qty: Dec; line: LineRecord }>();
    for (const l of e.lines) {
      const key = { productId: l.productId, warehouseId: e.warehouse.id, condition: l.condition };
      const k = balanceKey(key);
      need.set(k, { key, qty: (need.get(k)?.qty ?? ZERO).plus(d(l.qty)), line: l });
    }
    const keys = sortKeys([...need.values()].map((n) => n.key));
    const balances = await store.lockBalances(keys);
    for (const k of keys) {
      const n = need.get(balanceKey(k))!;
      const b = ensure(balances, k);
      const available = d(b.qtyOnHand).minus(d(b.qtyReserved));
      if (available.lt(n.qty)) throw InventoryErrors.insufficientStock(n.line.product.code, available.toFixed(3), n.qty.toFixed(3), e.warehouse.name, k.condition);
      b.qtyReserved = d(b.qtyReserved).plus(n.qty).toFixed(3);
      await store.saveBalance(b);
    }
    await store.addReservations(e.id, keys.map((k) => ({ ...k, qty: need.get(balanceKey(k))!.qty.toFixed(3) })));

    for (const line of e.lines) {
      if (!line.product.trackSerial) continue;
      const texts = line.serials.map((s) => s.serial);
      assertSerialCount(line.product.code, line.qty, texts);
      const base: SerialStatus = line.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK";
      const found = new Map((await store.serialsByText(line.productId, texts)).map((s) => [s.serial, s]));
      for (const serial of texts) {
        const s = found.get(serial);
        if (!s) throw InventoryErrors.serialUnavailable(serial, "it is not in stock");
        if (s.warehouseId !== e.warehouse.id) throw InventoryErrors.serialUnavailable(serial, `it is not in ${e.warehouse.name}`);
        if (s.status !== base || s.reservedEntryId) throw InventoryErrors.serialUnavailable(serial, s.reservedEntryId ? "it is reserved by another entry" : `it is ${s.status.toLowerCase().replace(/_/g, " ")}`);
        await store.updateSerial(s.id, { status: "RESERVED", reservedEntryId: e.id });
        await store.addSerialMovement({ serialId: s.id, entryId: e.id, fromStatus: s.status, toStatus: "RESERVED", fromWarehouseId: s.warehouseId, toWarehouseId: s.warehouseId });
        await store.linkLineSerial(line.id, serial, s.id);
      }
    }
  }

  /** A submitted GRN against a purchase order holds its quantities on the PO (pendingReceiptQty). */
  async holdReceipt(store: InventoryStore, e: EntryRecord, actor: InventoryActor): Promise<void> {
    const receipt = receiptEvent(e, actor.actorId);
    if (receipt) await receiptListener().pending(store.tx, receipt);
  }

  /** Gives back what `reserve` (and `holdReceipt`) held (reject / cancel). */
  async release(store: InventoryStore, e: EntryRecord, actorId = e.createdBy.id): Promise<void> {
    const receipt = e.status === "PENDING" ? receiptEvent(e, actorId) : null;
    if (receipt) await receiptListener().released(store.tx, receipt);
    const rows = sortKeys(await store.reservations(e.id));
    if (rows.length) {
      const balances = await store.lockBalances(rows);
      for (const r of rows) {
        const b = ensure(balances, r);
        b.qtyReserved = d(b.qtyReserved).minus(d(r.qty)).toFixed(3);
        await store.saveBalance(b);
      }
      await store.deleteReservations(e.id);
    }
    for (const s of await store.serialsReservedBy(e.id)) {
      const line = e.lines.find((l) => l.productId === s.productId && l.serials.some((x) => x.serial === s.serial));
      const back: SerialStatus = line?.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK";
      await store.updateSerial(s.id, { status: back, reservedEntryId: null });
      await store.addSerialMovement({ serialId: s.id, entryId: e.id, fromStatus: "RESERVED", toStatus: back, fromWarehouseId: s.warehouseId, toWarehouseId: s.warehouseId });
    }
  }

  /* ───────────────────────────── transfers: receive ───────────────────────────── */

  /**
   * Confirms a dispatched transfer at the destination. Received units go into GOOD stock; any
   * shortfall goes into the destination's DAMAGED stock and a PENDING write-off is created for it.
   * Returns the id of that write-off, if any.
   */
  async receive(store: InventoryStore, entryId: string, actor: InventoryActor, input: { lines: { lineId: string; receivedQty: string; receivedSerials?: string[] }[]; notes?: string | null }): Promise<string | null> {
    const e = await store.lockEntry(entryId);
    if (!e) throw new NotFoundError("Stock entry");
    if (e.type !== "TRANSFER" || e.status !== "DISPATCHED") throw InventoryErrors.wrongStatus("receive", e.status);
    const dest = e.toWarehouse!;
    const byLine = new Map(input.lines.map((l) => [l.lineId, l]));
    for (const l of e.lines) if (!byLine.has(l.id)) throw new ValidationError(`Enter the received quantity for ${l.product.code}.`, [{ path: "lines", message: "Every line needs a received quantity." }]);

    const productIds = uniq(e.lines.map((l) => l.productId)).sort();
    await this.assertNotFrozen(store, dest, productIds, e);
    const costs = await store.lockCosts(productIds);
    const plan = e.lines.map((l) => {
      const received = d(byLine.get(l.id)!.receivedQty);
      if (received.lt(0) || received.gt(d(l.qty))) throw InventoryErrors.receiveQty(l.product.code);
      if (l.product.trackSerial && !received.isInteger()) throw InventoryErrors.serialFractional(l.product.code);
      return { line: l, received, short: d(l.qty).minus(received) };
    });
    const keys = sortKeys(
      uniq(plan.flatMap((p) => [p.received.gt(0) ? `${p.line.productId}|${dest.id}|GOOD` : null, p.short.gt(0) ? `${p.line.productId}|${dest.id}|DAMAGED` : null]).filter((x): x is string => !!x)).map((k) => {
        const [productId, warehouseId, condition] = k.split("|");
        return { productId: productId!, warehouseId: warehouseId!, condition: condition as Condition };
      }),
    );
    const balances = await store.lockBalances(keys);
    const movements: MovementInsert[] = [];
    const shortages: { productId: string; qty: string; serials: string[] }[] = [];

    for (const p of plan) {
      const unit = d(p.line.unitCostBdt);
      const valueReceived = p.short.isZero() ? d(p.line.costAmount) : money(p.received.times(unit));
      const valueShort = d(p.line.costAmount).minus(valueReceived);
      const avg = toCostState(costs.get(p.line.productId)).avgCost.toFixed(4);
      for (const [qty, value, condition] of [
        [p.received, valueReceived, "GOOD"],
        [p.short, valueShort, "DAMAGED"],
      ] as const) {
        if (qty.isZero()) continue;
        const b = ensure(balances, { productId: p.line.productId, warehouseId: dest.id, condition });
        b.qtyOnHand = d(b.qtyOnHand).plus(qty).toFixed(3);
        movements.push({ entryId: e.id, lineId: p.line.id, productId: p.line.productId, warehouseId: dest.id, condition, qtyChange: qty.toFixed(3), unitCost: p.line.unitCostBdt, valueChange: value.toFixed(2), balanceAfter: b.qtyOnHand, avgCostAfter: avg });
      }
      await store.updateLine(p.line.id, { receivedQty: p.received.toFixed(3) });

      // Serials: arrived → IN_STOCK at destination; missing → DAMAGED there, pending write-off.
      let missing: string[] = [];
      if (p.line.product.trackSerial) {
        const sent = p.line.serials.map((s) => s.serial);
        const arrived = p.short.isZero() ? sent : (byLine.get(p.line.id)!.receivedSerials ?? []).map((s) => s.trim().toUpperCase());
        if (!p.received.eq(arrived.length) || arrived.some((s) => !sent.includes(s)) || new Set(arrived).size !== arrived.length) {
          throw new ValidationError(`Tick exactly ${p.received.toFixed(0)} serial number(s) that arrived for ${p.line.product.code}.`, [{ path: "lines", message: "Received serials don't match the received quantity.", code: "SERIAL_COUNT" }]);
        }
        missing = sent.filter((s) => !arrived.includes(s));
        const found = new Map((await store.serialsByText(p.line.productId, sent)).map((s) => [s.serial, s]));
        for (const serial of sent) {
          const s = found.get(serial)!;
          const ok = arrived.includes(serial);
          const to: SerialStatus = ok ? "IN_STOCK" : "DAMAGED";
          await store.updateSerial(s.id, { status: to, warehouseId: dest.id });
          await store.addSerialMovement({ serialId: s.id, entryId: e.id, fromStatus: s.status, toStatus: to, fromWarehouseId: null, toWarehouseId: dest.id });
          if (!ok) await store.linkLineSerial(p.line.id, serial, s.id, false);
        }
      }
      if (p.short.gt(0)) shortages.push({ productId: p.line.productId, qty: p.short.toFixed(3), serials: missing });
    }

    for (const k of keys) await store.saveBalance(balances.get(balanceKey(k))!);
    await store.insertMovements(movements);
    await store.clearInTransit(e.id);
    await store.updateEntry(e.id, { status: "RECEIVED", receivedById: actor.actorId, receivedAt: now(), ...(input.notes ? { notes: [e.notes, `Receipt: ${input.notes}`].filter(Boolean).join("\n") } : {}) });

    if (!shortages.length) return null;
    // The shortfall becomes a PENDING write-off of the destination's damaged stock.
    const settings = await store.settings();
    const writeOffId = await store.createEntry({
      type: "DAMAGE_WRITE_OFF",
      entryDate: todayInDhaka(),
      warehouseId: dest.id,
      toWarehouseId: null,
      supplierId: null,
      customerId: null,
      projectId: null,
      originalEntryId: null,
      relatedEntryId: e.id,
      poNumberText: null,
      supplierInvoiceNo: null,
      lcNo: null,
      billOfEntryNo: null,
      challanNo: e.number,
      siteAddress: null,
      receivedBy: null,
      vehicle: e.vehicle,
      reason: "Transfer shortage",
      description: `Shortage on receipt of transfer ${e.number ?? e.draftRef} from ${e.warehouse.name}.`,
      customerPhone: null,
      customerAddress: null,
      notes: null,
      currency: "BDT",
      exchangeRate: "1",
      discountAmount: "0",
      vatPercent: "0",
      lines: shortages.map((s) => ({ productId: s.productId, qty: s.qty, unitPrice: "0", condition: "DAMAGED" as const, originalLineId: null, note: null, serials: s.serials })),
      charges: [],
      draftRef: draftRef(),
      status: "DRAFT",
      createdById: actor.actorId,
    });
    const wo = (await store.entry(writeOffId))!;
    await this.reserve(store, wo);
    const preview = await this.compute(store, wo, await store.costs(wo.lines.map((l) => l.productId)));
    await this.saveComputed(store, wo, preview);
    await store.updateEntry(writeOffId, { status: "PENDING", submittedAt: now(), number: await this.numberFor(store, wo, settings), ...this.totals(preview) });
    return writeOffId;
  }

  /* ───────────────────────────── reversal ───────────────────────────── */

  /**
   * Reverses a posted entry with the exact inverse movements at the originally recorded
   * costs, in a new REVERSAL entry. Refuses if stock would go negative or serials moved on.
   */
  async reverse(store: InventoryStore, entryId: string, actor: InventoryActor, reason: string): Promise<string> {
    const e = await store.lockEntry(entryId);
    if (!e) throw new NotFoundError("Stock entry");
    if (e.type === "REVERSAL") throw InventoryErrors.notReversible("A reversal can't itself be reversed.");
    if (e.type === "TRANSFER" && e.status === "RECEIVED") throw InventoryErrors.notReversible("This transfer was already received. Create a transfer back instead.");
    if (!(e.status === "POSTED" || (e.type === "TRANSFER" && e.status === "DISPATCHED"))) throw InventoryErrors.wrongStatus("reverse", e.status);
    const linked = e.referencedBy.filter((r) => r.status === "POSTED" || r.status === "PENDING");
    if (linked.length) throw InventoryErrors.notReversible(`Entries ${linked.map((r) => r.number ?? r.id).join(", ")} refer to this one. Reverse or cancel them first.`);

    // The PO first (before the reversal row references it), as in post().
    if (e.purchaseOrder) await receiptListener().lock(store.tx, e.purchaseOrder.id);
    const settings = await store.settings();
    const original = await store.entryMovements(e.id);
    for (const w of uniq(original.map((m) => m.warehouseId)).sort()) {
      const name = original.find((m) => m.warehouseId === w)!.warehouse.name;
      await this.assertNotFrozen(store, { id: w, name }, uniq(original.filter((m) => m.warehouseId === w).map((m) => m.productId)), e);
    }
    const revId = await store.createEntry({
      ...stripEntry(e),
      type: "REVERSAL",
      entryDate: todayInDhaka(),
      reason,
      draftRef: draftRef(),
      status: "DRAFT",
      createdById: actor.actorId,
      reversalOfId: e.id,
      lines: e.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, condition: l.condition, originalLineId: null, note: l.note, serials: l.serials.map((s) => s.serial) })),
      charges: [],
    });
    const rev = (await store.entry(revId))!;
    const lineMap = new Map(e.lines.map((l, i) => [l.id, rev.lines[i]!.id]));

    const productIds = uniq(original.map((m) => m.productId)).sort();
    const costs = await store.lockCosts(productIds);
    const keys = sortKeys(uniq(original.map((m) => balanceKey(m))).map((k) => {
      const [productId, warehouseId, condition] = k.split("|");
      return { productId: productId!, warehouseId: warehouseId!, condition: condition as Condition };
    }));
    const balances = await store.lockBalances(keys);
    const states = new Map<string, CostState>(productIds.map((p) => [p, toCostState(costs.get(p))]));
    const movements: MovementInsert[] = [];
    const codes = new Map(e.lines.map((l) => [l.productId, l.product.code]));
    const whNames = new Map([[e.warehouse.id, e.warehouse.name], ...(e.toWarehouse ? [[e.toWarehouse.id, e.toWarehouse.name] as const] : [])]);

    for (const m of original) {
      const qty = d(m.qtyChange).neg();
      let value = d(m.valueChange).neg();
      const b = ensure(balances, m);
      const onHand = d(b.qtyOnHand).plus(qty);
      if (onHand.lt(0) || (qty.lt(0) && onHand.lt(d(b.qtyReserved)))) throw InventoryErrors.reversalNegative(codes.get(m.productId) ?? m.productId, whNames.get(m.warehouseId) ?? "the warehouse");
      b.qtyOnHand = onHand.toFixed(3);
      let state = states.get(m.productId)!;
      if (e.type !== "TRANSFER") {
        if (qty.lt(0)) {
          // Undo a receipt: take out exactly what it brought in.
          const out = applyExactOut(state, qty.neg(), value.neg());
          state = out.state;
          value = out.value.neg();
        } else {
          state = applyIn(state, qty, value);
        }
      }
      states.set(m.productId, state);
      movements.push({ entryId: revId, lineId: m.lineId ? (lineMap.get(m.lineId) ?? null) : null, productId: m.productId, warehouseId: m.warehouseId, condition: m.condition, qtyChange: qty.toFixed(3), unitCost: m.unitCost, valueChange: value.toFixed(2), balanceAfter: b.qtyOnHand, avgCostAfter: state.avgCost.toFixed(4) });
    }

    // Serials go back to where they were before the original entry.
    const sm = await store.serialMovementsOfEntry(e.id);
    const perSerial = new Map<string, { first: (typeof sm)[number]; last: (typeof sm)[number] }>();
    for (const row of sm) {
      const cur = perSerial.get(row.serialId);
      perSerial.set(row.serialId, { first: cur?.first ?? row, last: row });
    }
    const serialRecords = new Map((await store.serialsById([...perSerial.keys()])).map((s) => [s.id, s]));
    for (const [serialId, { first, last }] of perSerial) {
      const s = serialRecords.get(serialId)!;
      if (last.latestEntryId !== e.id || s.status !== last.toStatus) throw InventoryErrors.serialsMovedOn(s.serial);
      const back: SerialStatus = first.fromStatus ?? "WRITTEN_OFF";
      await store.updateSerial(serialId, {
        status: back,
        warehouseId: first.fromStatus ? first.fromWarehouseId : null,
        projectId: back === "ISSUED" ? (e.project?.id ?? s.projectId) : null,
        customerId: back === "SOLD" ? (e.customer?.id ?? s.customerId) : null,
        reservedEntryId: null,
      });
      await store.addSerialMovement({ serialId, entryId: revId, fromStatus: s.status, toStatus: back, fromWarehouseId: s.warehouseId, toWarehouseId: first.fromStatus ? first.fromWarehouseId : null });
      const line = rev.lines.find((l) => l.productId === s.productId && l.serials.some((x) => x.serial === s.serial));
      if (line) await store.linkLineSerial(line.id, s.serial, serialId);
    }

    for (const k of keys) await store.saveBalance(balances.get(balanceKey(k))!);
    if (e.type !== "TRANSFER") for (const p of productIds) await store.saveCost(p, fromCostState(states.get(p)!));
    else await store.clearInTransit(e.id);
    await store.insertMovements(movements);
    for (const [i, l] of e.lines.entries()) {
      await store.updateLine(rev.lines[i]!.id, { unitCostBdt: l.unitCostBdt, landedUnitCost: l.landedUnitCost, amount: l.amount, costAmount: l.costAmount });
    }
    const at = now();
    await store.updateEntry(revId, {
      status: "POSTED",
      number: await this.numberFor(store, rev, settings),
      postedAt: at,
      verifiedById: actor.actorId,
      verifiedAt: at,
      subtotal: e.subtotal,
      vatAmount: e.vatAmount,
      grandTotal: e.grandTotal,
      costTotal: e.costTotal,
      discountAmount: e.discountAmount,
      vatPercent: e.vatPercent,
    });
    await store.updateEntry(e.id, { status: "REVERSED", reversedAt: at, reversalReason: reason });
    const receipt = receiptEvent(e, actor.actorId);
    if (receipt) await receiptListener().reversed(store.tx, receipt);
    return revId;
  }
}

/** Temporary reference for drafts; the real number is assigned on submit / post. */
export function draftRef(): string {
  return `DRAFT-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function stripEntry(e: EntryRecord) {
  return {
    warehouseId: e.warehouse.id,
    toWarehouseId: e.toWarehouse?.id ?? null,
    supplierId: e.supplier?.id ?? null,
    customerId: e.customer?.id ?? null,
    projectId: e.project?.id ?? null,
    originalEntryId: null,
    poNumberText: e.poNumberText,
    supplierInvoiceNo: e.supplierInvoiceNo,
    lcNo: e.lcNo,
    billOfEntryNo: e.billOfEntryNo,
    challanNo: e.challanNo,
    siteAddress: e.siteAddress,
    receivedBy: e.receivedBy,
    vehicle: e.vehicle,
    description: `Reversal of ${e.number}`,
    customerPhone: e.customerPhone,
    customerAddress: e.customerAddress,
    notes: null,
    currency: e.currency,
    exchangeRate: e.exchangeRate,
    discountAmount: e.discountAmount,
    vatPercent: e.vatPercent,
  };
}
