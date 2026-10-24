import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { hasLevel } from "@/shared/rbac/levels";
import { BusinessRuleError } from "@/shared/errors/app-error";
import { d, money, ZERO, type Dec } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import { fiscalYear, formatDocNumber, todayInDhaka } from "../domain/numbering";
import { normalizeSerial } from "../domain/rules";
import type { Condition } from "../domain/types";
import { draftRef, type StockPostingService } from "./posting.service";
import { noEvents, type InventoryActor, type InventoryEvents, type InventoryStore, type InventoryUnitOfWork, type WarehouseRef } from "./ports";

/* ───────────────────────────── types ───────────────────────────── */

export type CountScope = "ALL" | "CATALOG" | "CATEGORY" | "SELECTED_PRODUCTS";
export type CountStatus = "DRAFT" | "COUNTING" | "SUBMITTED" | "APPROVED" | "CANCELLED";
export type SerialResult = "FOUND" | "MISSING" | "UNEXPECTED";

export interface CountLineRecord {
  id: string;
  product: { id: string; code: string; name: string; unitCode: string; barcode: string | null; model: string | null; trackSerial: boolean };
  condition: Condition;
  systemQty: string | null;
  countedQty: string | null;
  notCounted: boolean;
  countedBy: { id: string; name: string } | null;
  countedAt: Date | null;
  recountRequested: boolean;
  note: string | null;
  serials: { serial: string; result: SerialResult }[];
}

export interface CountRecord {
  id: string;
  number: string;
  warehouse: WarehouseRef;
  scope: CountScope;
  scopeIds: string[];
  blindCount: boolean;
  status: CountStatus;
  notes: string | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  recountRequestedAt: Date | null;
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  adjustmentEntry: { id: string; number: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  lines: CountLineRecord[];
}

export interface CountSummary {
  id: string;
  number: string;
  warehouse: WarehouseRef;
  scope: CountScope;
  blindCount: boolean;
  status: CountStatus;
  createdBy: { id: string; name: string };
  startedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  lineCount: number;
  countedCount: number;
  adjustmentEntry: { id: string; number: string | null } | null;
}

export interface CountFilters {
  status?: CountStatus;
  warehouseId?: string;
  /** COUNTING or SUBMITTED. */
  active?: boolean;
}

export interface CountStore {
  create(data: { number: string; warehouseId: string; scope: CountScope; scopeIds: string[]; blindCount: boolean; notes: string | null; createdById: string }, lines: { productId: string; condition: Condition }[]): Promise<string>;
  get(id: string): Promise<CountRecord | null>;
  /** SELECT … FOR UPDATE on the count row (or FOR SHARE for line updates), then loads it. */
  lock(id: string, mode?: "update" | "share"): Promise<CountRecord | null>;
  list(q: ListQuery<CountFilters>, warehouseIds: string[]): Promise<{ items: CountSummary[]; total: number }>;
  update(id: string, data: Partial<{ status: CountStatus; scope: CountScope; scopeIds: string[]; blindCount: boolean; notes: string | null; warehouseId: string; startedAt: Date; submittedAt: Date | null; submittedById: string | null; approvedAt: Date; approvedById: string; cancelledAt: Date; recountRequestedAt: Date; adjustmentEntryId: string }>): Promise<void>;
  replaceLines(id: string, lines: { productId: string; condition: Condition }[]): Promise<void>;
  addLines(id: string, lines: { productId: string; condition: Condition }[]): Promise<void>;
  /** Locks one line FOR UPDATE. */
  lockLine(countId: string, lineId: string): Promise<CountLineRecord | null>;
  updateLine(lineId: string, data: Partial<{ systemQty: string; countedQty: string | null; notCounted: boolean; countedById: string | null; countedAt: Date | null; recountRequested: boolean; note: string | null }>): Promise<void>;
  setLineSerials(lineId: string, serials: { serial: string; result: SerialResult }[]): Promise<void>;
  flagRecount(countId: string, lineIds: string[]): Promise<number>;
  /** Products a scope covers: active products, plus any product with stock in the warehouse. */
  scopeProducts(warehouseId: string, scope: CountScope, ids: string[]): Promise<string[]>;
  /** On-hand per product and condition in the warehouse. */
  onHand(warehouseId: string, productIds: string[]): Promise<Map<string, string>>;
  /** Serials expected on the shelf: product|condition → serial texts. */
  expectedSerials(warehouseId: string, productIds: string[]): Promise<Map<string, string[]>>;
  /** Products' current average cost. */
  avgCosts(productIds: string[]): Promise<Map<string, string>>;
}

const lineKey = (productId: string, condition: Condition) => `${productId}|${condition}`;
const ACTIVE: CountStatus[] = ["COUNTING", "SUBMITTED"];

export function countSnapshot(c: CountRecord) {
  return { number: c.number, status: c.status, warehouse: c.warehouse.code, scope: c.scope, blindCount: c.blindCount, lines: c.lines.length };
}

/** Variance of a line (null until counted). */
export function lineVariance(l: CountLineRecord): Dec | null {
  if (l.systemQty === null || (l.countedQty === null && !l.notCounted)) return null;
  return d(l.countedQty ?? "0").minus(d(l.systemQty));
}

export const countErrors = {
  wrongStatus: (action: string, status: string) => new BusinessRuleError(`Can't ${action} a count that is ${status.toLowerCase()}.`, "INVALID_STATUS"),
  notCounted: (n: number) =>
    new BusinessRuleError(`${n} line(s) have no counted quantity. Count them, or mark them "not counted = 0".`, "LINES_NOT_COUNTED"),
  recountPending: (n: number) => new BusinessRuleError(`${n} line(s) flagged for recount haven't been counted again yet.`, "RECOUNT_PENDING"),
  selfApproval: () => new ForbiddenError("You submitted this count, so another approver must review it.", "FORBIDDEN"),
  noLines: () => new BusinessRuleError("This scope has no products to count.", "NO_LINES"),
  serialMismatch: (code: string) =>
    new BusinessRuleError(`Serial records for ${code} don't match its stock quantity, so the count can't be posted. Fix the serial records first.`, "SERIAL_MISMATCH"),
};

/* ───────────────────────────── service ───────────────────────────── */

export class CountService {
  constructor(private readonly d: { uow: InventoryUnitOfWork; posting: StockPostingService; events?: InventoryEvents }) {}

  private get store() {
    return this.d.uow.store;
  }
  private get events() {
    return this.d.events ?? noEvents;
  }

  private inScope(actor: InventoryActor, c: { warehouse: { id: string; name: string } }) {
    if (!actor.warehouseIds.includes(c.warehouse.id)) throw InventoryErrors.outOfScope(c.warehouse.name);
  }

  /** Approvers in the count's warehouse see system quantities even in blind counts. */
  canSeeSystem(actor: InventoryActor, c: CountRecord): boolean {
    return !c.blindCount || ["APPROVED", "CANCELLED"].includes(c.status) || (hasLevel(actor.level, "APPROVE") && actor.warehouseIds.includes(c.warehouse.id));
  }

  list(actor: InventoryActor, q: ListQuery<CountFilters>) {
    return this.store.counts.list(q, actor.warehouseIds);
  }

  async get(actor: InventoryActor, id: string): Promise<CountRecord> {
    const c = await this.store.counts.get(id);
    if (!c) throw new NotFoundError("Stock count");
    this.inScope(actor, c);
    return c;
  }

  private async linesFor(store: InventoryStore, warehouseId: string, scope: CountScope, scopeIds: string[]) {
    if (scope !== "ALL" && !scopeIds.length) throw new ValidationError("Choose at least one item for the scope.", [{ path: "scopeIds", message: "Choose at least one item." }]);
    const productIds = await store.counts.scopeProducts(warehouseId, scope, scopeIds);
    if (!productIds.length) throw countErrors.noLines();
    return productIds.map((productId) => ({ productId, condition: "GOOD" as Condition }));
  }

  async create(actor: InventoryActor, input: { warehouseId: string; scope: CountScope; scopeIds?: string[]; blindCount?: boolean; notes?: string | null }): Promise<CountRecord> {
    if (!actor.warehouseIds.includes(input.warehouseId)) throw InventoryErrors.outOfScope();
    const id = await this.d.uow.transaction(async (store) => {
      const wh = await store.warehouse(input.warehouseId);
      if (!wh) throw InventoryErrors.unknown("warehouse");
      if (!wh.isActive) throw InventoryErrors.inactive("Warehouse", wh.name);
      const scopeIds = input.scope === "ALL" ? [] : [...new Set(input.scopeIds ?? [])];
      const lines = await this.linesFor(store, wh.id, input.scope, scopeIds);
      const settings = await store.settings();
      const fy = fiscalYear(new Date(`${todayInDhaka()}T00:00:00Z`), settings.fiscalYearStartMonth);
      const number = formatDocNumber("SC", fy, await store.nextNumber("SC", fy));
      const id = await store.counts.create({ number, warehouseId: wh.id, scope: input.scope, scopeIds, blindCount: input.blindCount ?? false, notes: input.notes ?? null, createdById: actor.actorId }, lines);
      const c = (await store.counts.get(id))!;
      await store.audit.record(actor, { action: "stock_count.create", entityType: "StockCount", entityId: id, after: countSnapshot(c) });
      return id;
    });
    return (await this.store.counts.get(id))!;
  }

  /** Edit a DRAFT count (creator or FULL): scope, blind mode, notes. */
  async update(actor: InventoryActor, id: string, input: { scope?: CountScope; scopeIds?: string[]; blindCount?: boolean; notes?: string | null }): Promise<CountRecord> {
    await this.d.uow.transaction(async (store) => {
      const c = await store.counts.lock(id);
      if (!c) throw new NotFoundError("Stock count");
      this.inScope(actor, c);
      if (c.status !== "DRAFT") throw countErrors.wrongStatus("edit", c.status);
      if (c.createdBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw InventoryErrors.notCreator("edit");
      const scope = input.scope ?? c.scope;
      const scopeIds = scope === "ALL" ? [] : [...new Set(input.scopeIds ?? c.scopeIds)];
      if (input.scope !== undefined || input.scopeIds !== undefined) await store.counts.replaceLines(id, await this.linesFor(store, c.warehouse.id, scope, scopeIds));
      await store.counts.update(id, { scope, scopeIds, ...(input.blindCount !== undefined ? { blindCount: input.blindCount } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) });
      const after = (await store.counts.get(id))!;
      await store.audit.record(actor, { action: "stock_count.update", entityType: "StockCount", entityId: id, before: countSnapshot(c), after: countSnapshot(after) });
    });
    return (await this.store.counts.get(id))!;
  }

  /**
   * Start counting: takes the warehouse lock exclusively (postings wait), snapshots on-hand
   * quantities, adds lines for damaged stock, and from now on the products are frozen.
   */
  async start(actor: InventoryActor, id: string): Promise<CountRecord> {
    await this.d.uow.transaction(async (store) => {
      const peek = await store.counts.get(id);
      if (!peek) throw new NotFoundError("Stock count");
      this.inScope(actor, peek);
      await store.lockWarehouses([peek.warehouse.id], "exclusive");
      const c = (await store.counts.lock(id))!;
      if (c.status !== "DRAFT") throw countErrors.wrongStatus("start", c.status);
      const productIds = [...new Set(c.lines.map((l) => l.product.id))];
      const other = await store.activeCount(c.warehouse.id, productIds);
      if (other) throw InventoryErrors.countInProgress(other.number, c.warehouse.name, []);

      const onHand = await store.counts.onHand(c.warehouse.id, productIds);
      const missing = productIds.filter((p) => d(onHand.get(lineKey(p, "DAMAGED")) ?? "0").gt(0) && !c.lines.some((l) => l.product.id === p && l.condition === "DAMAGED"));
      if (missing.length) await store.counts.addLines(id, missing.map((productId) => ({ productId, condition: "DAMAGED" as Condition })));
      const fresh = (await store.counts.get(id))!;
      for (const l of fresh.lines) await store.counts.updateLine(l.id, { systemQty: d(onHand.get(lineKey(l.product.id, l.condition)) ?? "0").toFixed(3) });
      await store.counts.update(id, { status: "COUNTING", startedAt: new Date() });
      await store.audit.record(actor, { action: "stock_count.start", entityType: "StockCount", entityId: id, before: { status: "DRAFT" }, after: { status: "COUNTING", lines: fresh.lines.length } });
    });
    return (await this.store.counts.get(id))!;
  }

  /**
   * Records a counted line. Tracked products: the counted quantity is the number of serials
   * found; expected serials not found are MISSING, found serials not expected are UNEXPECTED.
   */
  async countLine(actor: InventoryActor, id: string, lineId: string, input: { countedQty?: string | null; serials?: string[]; notCounted?: boolean; note?: string | null }): Promise<CountRecord> {
    await this.d.uow.transaction(async (store) => {
      const c = await store.counts.lock(id, "share");
      if (!c) throw new NotFoundError("Stock count");
      this.inScope(actor, c);
      if (c.status !== "COUNTING") throw countErrors.wrongStatus("count", c.status);
      const line = await store.counts.lockLine(id, lineId);
      if (!line) throw new NotFoundError("Count line");
      const note = input.note !== undefined ? input.note : line.note;

      if (input.notCounted) {
        await store.counts.updateLine(lineId, { countedQty: "0.000", notCounted: true, countedById: actor.actorId, countedAt: new Date(), recountRequested: false, note });
        if (line.product.trackSerial) await store.counts.setLineSerials(lineId, await this.serialResults(store, c, line, []));
        return;
      }

      if (line.product.trackSerial) {
        const found = [...new Set((input.serials ?? []).map(normalizeSerial).filter(Boolean))];
        if (input.countedQty !== undefined && input.countedQty !== null && !d(input.countedQty).eq(found.length)) {
          throw new ValidationError(`${line.product.code} tracks serial numbers: scan each unit (counted quantity = serials found).`, [{ path: "serials", message: "Counted quantity must equal the number of serials.", code: "SERIAL_COUNT" }]);
        }
        const results = await this.serialResults(store, c, line, found);
        await store.counts.setLineSerials(lineId, results);
        await store.counts.updateLine(lineId, { countedQty: d(found.length).toFixed(3), notCounted: false, countedById: actor.actorId, countedAt: new Date(), recountRequested: false, note });
        return;
      }

      if (input.countedQty === undefined || input.countedQty === null) throw new ValidationError("Enter the counted quantity.", [{ path: "countedQty", message: "Enter the counted quantity." }]);
      await store.counts.updateLine(lineId, { countedQty: d(input.countedQty).toFixed(3), notCounted: false, countedById: actor.actorId, countedAt: new Date(), recountRequested: false, note });
    });
    return (await this.store.counts.get(id))!;
  }

  /** FOUND / UNEXPECTED / MISSING for a tracked line, refusing serials that are recorded elsewhere. */
  private async serialResults(store: InventoryStore, c: CountRecord, line: CountLineRecord, found: string[]) {
    const expected = new Set((await store.counts.expectedSerials(c.warehouse.id, [line.product.id])).get(lineKey(line.product.id, line.condition)) ?? []);
    const others = c.lines.filter((l) => l.product.id === line.product.id && l.id !== line.id).flatMap((l) => l.serials.filter((s) => s.result !== "MISSING").map((s) => s.serial));
    const unexpected = found.filter((s) => !expected.has(s));
    for (const s of found) if (others.includes(s)) throw InventoryErrors.serialUnavailable(s, "it is already counted on the other condition's line");
    if (unexpected.length) {
      for (const ex of await store.serialsByText(line.product.id, unexpected)) {
        const present = ["IN_STOCK", "RESERVED", "IN_TRANSIT", "DAMAGED"].includes(ex.status);
        if (present) {
          const where = ex.warehouseId === c.warehouse.id ? `listed as ${ex.status.toLowerCase().replace(/_/g, " ")} here — count it on the ${ex.status === "DAMAGED" ? "damaged" : "good"} line` : `recorded as ${ex.status.toLowerCase().replace(/_/g, " ")} in another warehouse`;
          throw InventoryErrors.serialUnavailable(ex.serial, where);
        }
      }
    }
    return [
      ...found.map((serial) => ({ serial, result: (expected.has(serial) ? "FOUND" : "UNEXPECTED") as SerialResult })),
      ...[...expected].filter((s) => !found.includes(s)).map((serial) => ({ serial, result: "MISSING" as SerialResult })),
    ];
  }

  async submit(actor: InventoryActor, id: string, opts: { markUncountedAsZero?: boolean } = {}): Promise<CountRecord> {
    await this.d.uow.transaction(async (store) => {
      const c = await store.counts.lock(id);
      if (!c) throw new NotFoundError("Stock count");
      this.inScope(actor, c);
      if (c.status !== "COUNTING") throw countErrors.wrongStatus("submit", c.status);
      const recount = c.lines.filter((l) => l.recountRequested);
      if (recount.length) throw countErrors.recountPending(recount.length);
      const open = c.lines.filter((l) => l.countedQty === null && !l.notCounted);
      if (open.length && !opts.markUncountedAsZero) throw countErrors.notCounted(open.length);
      for (const l of open) {
        await store.counts.updateLine(l.id, { countedQty: "0.000", notCounted: true, countedById: actor.actorId, countedAt: new Date() });
        if (l.product.trackSerial) await store.counts.setLineSerials(l.id, await this.serialResults(store, c, l, []));
      }
      await store.counts.update(id, { status: "SUBMITTED", submittedAt: new Date(), submittedById: actor.actorId });
      await store.audit.record(actor, { action: "stock_count.submit", entityType: "StockCount", entityId: id, before: { status: "COUNTING" }, after: { status: "SUBMITTED", markedZero: open.length } });
    });
    const c = (await this.store.counts.get(id))!;
    await this.events.count("submitted", this.eventInfo(c), { actorId: actor.actorId });
    return c;
  }

  private assertApprover(actor: InventoryActor, c: CountRecord) {
    this.inScope(actor, c);
    if (!hasLevel(actor.level, "APPROVE")) throw new ForbiddenError("Approving a stock count requires APPROVE access to inventory.");
    if (c.submittedBy?.id === actor.actorId) throw countErrors.selfApproval();
  }

  async requestRecount(actor: InventoryActor, id: string, lineIds: string[]): Promise<CountRecord> {
    let flagged = 0;
    await this.d.uow.transaction(async (store) => {
      const c = await store.counts.lock(id);
      if (!c) throw new NotFoundError("Stock count");
      if (c.status !== "SUBMITTED") throw countErrors.wrongStatus("request a recount of", c.status);
      this.assertApprover(actor, c);
      const ids = [...new Set(lineIds)];
      const unknown = ids.filter((x) => !c.lines.some((l) => l.id === x));
      if (unknown.length || !ids.length) throw new ValidationError("Choose lines of this count to recount.", [{ path: "lineIds", message: "Choose at least one line of this count." }]);
      flagged = await store.counts.flagRecount(id, ids);
      await store.counts.update(id, { status: "COUNTING", recountRequestedAt: new Date(), submittedAt: null, submittedById: null });
      await store.audit.record(actor, { action: "stock_count.request_recount", entityType: "StockCount", entityId: id, before: { status: "SUBMITTED" }, after: { status: "COUNTING", lines: c.lines.filter((l) => ids.includes(l.id)).map((l) => l.product.code) } });
    });
    const c = (await this.store.counts.get(id))!;
    await this.events.count("recount", { ...this.eventInfo(c), recountLines: flagged }, { actorId: actor.actorId });
    return c;
  }

  /**
   * Approve: posts one STOCK_ADJUSTMENT with the differences (gains at average cost, losses
   * removed at average cost), writes off MISSING serials and brings UNEXPECTED ones into
   * stock, then unfreezes. No differences → no entry.
   */
  async approve(actor: InventoryActor, id: string): Promise<CountRecord> {
    let productIds: string[] = [];
    await this.d.uow.transaction(async (store) => {
      const c = await store.counts.lock(id);
      if (!c) throw new NotFoundError("Stock count");
      if (c.status !== "SUBMITTED") throw countErrors.wrongStatus("approve", c.status);
      this.assertApprover(actor, c);

      const lines: { productId: string; qty: string; condition: Condition; adjustDirection: "GAIN" | "LOSS"; serials: string[] }[] = [];
      for (const l of c.lines) {
        const v = lineVariance(l);
        if (v === null) throw countErrors.notCounted(1);
        if (l.product.trackSerial) {
          const missing = l.serials.filter((s) => s.result === "MISSING").map((s) => s.serial);
          const unexpected = l.serials.filter((s) => s.result === "UNEXPECTED").map((s) => s.serial);
          if (!v.eq(unexpected.length - missing.length)) throw countErrors.serialMismatch(l.product.code);
          if (missing.length) lines.push({ productId: l.product.id, qty: d(missing.length).toFixed(3), condition: l.condition, adjustDirection: "LOSS", serials: missing });
          if (unexpected.length) lines.push({ productId: l.product.id, qty: d(unexpected.length).toFixed(3), condition: l.condition, adjustDirection: "GAIN", serials: unexpected });
        } else if (!v.isZero()) {
          lines.push({ productId: l.product.id, qty: v.abs().toFixed(3), condition: l.condition, adjustDirection: v.gt(0) ? "GAIN" : "LOSS", serials: [] });
        }
      }

      const at = new Date();
      // Unfreeze first (same transaction), so the adjustment itself may post.
      await store.counts.update(id, { status: "APPROVED", approvedAt: at, approvedById: actor.actorId });
      let entryNumber: string | null = null;
      if (lines.length) {
        const entryId = await store.createEntry({
          type: "STOCK_ADJUSTMENT",
          entryDate: todayInDhaka(),
          warehouseId: c.warehouse.id,
          toWarehouseId: null,
          supplierId: null,
          customerId: null,
          projectId: null,
          originalEntryId: null,
          poNumberText: null,
          supplierInvoiceNo: null,
          lcNo: null,
          billOfEntryNo: null,
          challanNo: null,
          siteAddress: null,
          receivedBy: null,
          vehicle: null,
          reason: `Stock count ${c.number}`,
          description: `Differences found by stock count ${c.number} (${c.warehouse.name}).`,
          customerPhone: null,
          customerAddress: null,
          notes: c.notes,
          currency: "BDT",
          exchangeRate: "1",
          discountAmount: "0",
          vatPercent: "0",
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: "0", condition: l.condition, originalLineId: null, adjustDirection: l.adjustDirection, note: null, serials: l.serials })),
          charges: [],
          draftRef: draftRef(),
          status: "DRAFT",
          createdById: c.submittedBy?.id ?? actor.actorId,
        });
        await this.d.posting.post(store, entryId, actor, { approverId: actor.actorId });
        await store.counts.update(id, { adjustmentEntryId: entryId });
        const entry = (await store.entry(entryId))!;
        entryNumber = entry.number;
        productIds = [...new Set(lines.map((l) => l.productId))];
        await store.audit.record(actor, { action: "stock_entry.post", entityType: "StockEntry", entityId: entryId, after: { number: entry.number, type: entry.type, fromCount: c.number, costTotal: entry.costTotal, lines: entry.lines.map((x) => ({ product: x.product.code, qty: x.qty, direction: x.adjustDirection, unitCostBdt: x.unitCostBdt, serials: x.serials.map((s) => s.serial) })) } });
      }
      await store.audit.record(actor, { action: "stock_count.approve", entityType: "StockCount", entityId: id, before: { status: "SUBMITTED" }, after: { status: "APPROVED", adjustment: entryNumber, adjustedLines: lines.length } });
    });
    const c = (await this.store.counts.get(id))!;
    await this.events.count("approved", this.eventInfo(c), { actorId: actor.actorId });
    if (productIds.length) await this.events.stockChanged(productIds);
    return c;
  }

  /** Creator or FULL, any time before approval: unfreezes, no stock change. */
  async cancel(actor: InventoryActor, id: string): Promise<CountRecord> {
    await this.d.uow.transaction(async (store) => {
      const c = await store.counts.lock(id);
      if (!c) throw new NotFoundError("Stock count");
      this.inScope(actor, c);
      if (!["DRAFT", ...ACTIVE].includes(c.status)) throw countErrors.wrongStatus("cancel", c.status);
      if (c.createdBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw InventoryErrors.notCreator("cancel");
      await store.counts.update(id, { status: "CANCELLED", cancelledAt: new Date() });
      await store.audit.record(actor, { action: "stock_count.cancel", entityType: "StockCount", entityId: id, before: { status: c.status }, after: { status: "CANCELLED" } });
    });
    return (await this.store.counts.get(id))!;
  }

  /** Variance summary; values (at current average cost) only for roles with seeCost. */
  async variance(actor: InventoryActor, id: string) {
    const c = await this.get(actor, id);
    const visible = this.canSeeSystem(actor, c);
    const costs = actor.canSeeCost ? await this.store.counts.avgCosts([...new Set(c.lines.map((l) => l.product.id))]) : new Map<string, string>();
    let gainQty = ZERO;
    let lossQty = ZERO;
    let gainValue = ZERO;
    let lossValue = ZERO;
    const lines = [];
    for (const l of c.lines) {
      const v = lineVariance(l);
      const missing = l.serials.filter((s) => s.result === "MISSING").map((s) => s.serial);
      const unexpected = l.serials.filter((s) => s.result === "UNEXPECTED").map((s) => s.serial);
      if ((v === null || v.isZero()) && !missing.length && !unexpected.length) continue;
      const value = v === null ? null : money(v.times(d(costs.get(l.product.id) ?? "0")));
      if (v && v.gt(0)) {
        gainQty = gainQty.plus(v);
        if (value) gainValue = gainValue.plus(value);
      } else if (v && v.lt(0)) {
        lossQty = lossQty.plus(v.abs());
        if (value) lossValue = lossValue.plus(value.abs());
      }
      lines.push({ line: l, variance: v, varianceValue: value, missing, unexpected });
    }
    lines.sort((a, b) => (b.varianceValue ?? ZERO).abs().comparedTo((a.varianceValue ?? ZERO).abs()) || (b.variance ?? ZERO).abs().comparedTo((a.variance ?? ZERO).abs()));
    const counted = c.lines.filter((l) => l.countedQty !== null || l.notCounted).length;
    return {
      count: c,
      visible,
      progress: { total: c.lines.length, counted },
      totals: { linesWithVariance: lines.length, gainQty: gainQty.toFixed(3), lossQty: lossQty.toFixed(3), gainValue: gainValue.toFixed(2), lossValue: lossValue.toFixed(2), netValue: gainValue.minus(lossValue).toFixed(2) },
      lines,
    };
  }

  private eventInfo(c: CountRecord) {
    return {
      id: c.id,
      number: c.number,
      warehouse: c.warehouse,
      createdById: c.createdBy.id,
      submittedById: c.submittedBy?.id ?? null,
      counterIds: [...new Set(c.lines.map((l) => l.countedBy?.id).filter((x): x is string => !!x))],
    };
  }
}
