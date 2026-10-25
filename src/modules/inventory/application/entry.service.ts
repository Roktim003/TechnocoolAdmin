import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { hasLevel } from "@/shared/rbac/levels";
import { d, type Dec } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import { fiscalYear, formatDocNumber, todayInDhaka } from "../domain/numbering";
import { allowsDiscontinued, assertCondition, assertEditable, assertProjectStatus, assertSerialCount, available, CANCELLABLE, normalizeSerial } from "../domain/rules";
import { ENTRY_TYPE_META, takesStock, type EntryType } from "../domain/types";
import type { CreateEntryInput, EntryFilters, EntryInput, LandedCostInput, ReceiveInput } from "./dto";
import { draftRef, type StockPostingService } from "./posting.service";
import { notifyProjectMaterial } from "./project-events";
import { receiptEvent, receiptListener } from "./receipts";
import {
  balanceKey,
  noEvents,
  type EntryEvent,
  type EntryRecord,
  type EntryWrite,
  type InventoryActor,
  type InventoryEvents,
  type InventorySettings,
  type InventoryStore,
  type InventoryUnitOfWork,
  type ProductInfo,
} from "./ports";

type Warning = { line: number | null; code: string; message: string };

/** What the audit trail stores for an entry. */
export function entrySnapshot(e: EntryRecord) {
  return {
    number: e.number ?? e.draftRef,
    type: e.type,
    status: e.status,
    entryDate: e.entryDate,
    warehouse: e.warehouse.code,
    toWarehouse: e.toWarehouse?.code ?? null,
    supplier: e.supplier?.name ?? null,
    customer: e.customer?.name ?? null,
    project: e.project?.code ?? null,
    costTotal: e.costTotal,
    grandTotal: e.grandTotal,
    lines: e.lines.map((l) => ({ product: l.product.code, qty: l.qty, unitPrice: l.unitPrice, unitCostBdt: l.unitCostBdt, condition: l.condition, serials: l.serials.map((s) => s.serial) })),
  };
}

export class EntryService {
  constructor(private readonly d: { uow: InventoryUnitOfWork; posting: StockPostingService; events?: InventoryEvents }) {}

  private get store() {
    return this.d.uow.store;
  }

  /** After commit: notifications for the events, then a low-stock check of the products touched. */
  private async emit(events: EntryEvent[], e: EntryRecord, actor: InventoryActor, shortage: EntryRecord | null = null): Promise<void> {
    const ev = this.d.events ?? noEvents;
    for (const event of events) await ev.entry(event, e, { actorId: actor.actorId, shortage });
    await ev.stockChanged([...new Set([...e.lines, ...(shortage?.lines ?? [])].map((l) => l.productId))]);
    // GRNs against a PO: the purchasing side notifies the PO creator.
    const kind = events.includes("reversed") ? "reversed" : (events.includes("posted") || events.includes("approved")) && e.status === "POSTED" ? "posted" : null;
    const receipt = kind ? receiptEvent(e, actor.actorId) : null;
    if (kind && receipt) await receiptListener().committed(kind, receipt).catch(() => undefined);
    // Issues / returns: the projects module re-checks the project's cost against its contract.
    if (kind) await notifyProjectMaterial(e);
  }

  private postedEvents = (e: EntryRecord): EntryEvent[] => (e.type === "TRANSFER" ? ["dispatched"] : ["posted"]);

  /* ───────────────────────────── reads ───────────────────────────── */

  list(actor: InventoryActor, query: ListQuery<EntryFilters>) {
    return this.store.listEntries(query, {
      warehouseIds: actor.warehouseIds,
      userId: actor.actorId,
      awaitingApprovalFor: query.filters.awaitingMyApproval && hasLevel(actor.level, "APPROVE") ? actor.actorId : undefined,
      awaitingReceiptFor: query.filters.awaitingMyReceipt ? actor.warehouseIds : undefined,
    });
  }

  async get(actor: InventoryActor, id: string): Promise<EntryRecord> {
    const e = await this.store.entry(id);
    if (!e) throw new NotFoundError("Stock entry");
    if (!actor.warehouseIds.includes(e.warehouse.id) && !(e.toWarehouse && actor.warehouseIds.includes(e.toWarehouse.id))) throw InventoryErrors.outOfScope(e.warehouse.name);
    return e;
  }

  /* ───────────────────────────── create / edit ───────────────────────────── */

  async create(actor: InventoryActor, input: CreateEntryInput): Promise<EntryRecord> {
    this.assertCanCreate(actor, input.type as EntryType, input.warehouseId);
    if (input.action === "post" && !hasLevel(actor.level, "FULL")) throw InventoryErrors.postNotAllowed();
    const settings = await this.store.settings();
    const write = await this.toWrite(this.store, input, settings, actor);
    if (write.type === "OPENING" && (await this.store.openingLocked(write.warehouseId))) throw InventoryErrors.openingLocked((await this.store.warehouse(write.warehouseId))?.name ?? "this warehouse");

    const id = await this.d.uow.transaction(async (store) => {
      // Lock the PO before the new lines reference it (their FK share locks would otherwise deadlock concurrent GRNs).
      if (write.purchaseOrderId) await receiptListener().lock(store.tx, write.purchaseOrderId);
      const id = await store.createEntry({ ...write, draftRef: draftRef(), status: "DRAFT", createdById: actor.actorId });
      const created = (await store.entry(id))!;
      await store.audit.record(actor, { action: "stock_entry.create", entityType: "StockEntry", entityId: id, after: entrySnapshot(created) });
      // A row inserted by this transaction is invisible to all others, so it needs no lock: reuse the load.
      if (input.action !== "draft") await this.submitOrPost(store, id, actor, input.action, input.confirmBelowCost, created);
      return id;
    });
    const e = (await this.store.entry(id))!;
    if (input.action === "submit") await this.emit(["submitted"], e, actor);
    if (input.action === "post") await this.emit(this.postedEvents(e), e, actor);
    return e;
  }

  async update(actor: InventoryActor, id: string, input: EntryInput): Promise<EntryRecord> {
    const settings = await this.store.settings();
    await this.d.uow.transaction(async (store) => {
      const before = await store.lockEntry(id);
      if (!before) throw new NotFoundError("Stock entry");
      assertEditable(before.status);
      if (before.createdBy.id !== actor.actorId) throw InventoryErrors.notCreator("edit");
      this.assertCanCreate(actor, input.type as EntryType, input.warehouseId);
      await store.replaceEntry(id, await this.toWrite(store, input, settings, actor));
      const after = (await store.entry(id))!;
      await store.audit.record(actor, { action: "stock_entry.update", entityType: "StockEntry", entityId: id, before: entrySnapshot(before), after: entrySnapshot(after) });
    });
    return (await this.store.entry(id))!;
  }

  private assertCanCreate(actor: InventoryActor, type: EntryType, warehouseId: string): void {
    if (type === "OPENING" && !hasLevel(actor.level, "FULL")) throw InventoryErrors.fullOnly("Opening stock");
    if (!actor.warehouseIds.includes(warehouseId)) throw InventoryErrors.outOfScope();
  }

  /**
   * Fills defaults: date, prices (sales default to the selling price), VAT, currency; normalises
   * serials. GRNs against a purchase order take supplier, currency, rate and prices from the PO.
   * With `warnings` (preview), over-receipt is reported instead of thrown.
   */
  private async toWrite(store: InventoryStore, input: EntryInput, settings: InventorySettings, actor: InventoryActor, warnings?: Warning[]): Promise<EntryWrite> {
    const type = input.type as EntryType;
    const products = new Map((await store.products(input.lines.map((l) => l.productId))).map((p) => [p.id, p]));
    for (const l of input.lines) if (!products.has(l.productId)) throw InventoryErrors.unknown("product");
    const meta = ENTRY_TYPE_META[type];
    const write: EntryWrite = {
      type,
      entryDate: input.entryDate ?? todayInDhaka(),
      warehouseId: input.warehouseId,
      toWarehouseId: type === "TRANSFER" ? (input.toWarehouseId ?? null) : null,
      supplierId: input.supplierId ?? null,
      customerId: input.customerId ?? null,
      projectId: input.projectId ?? null,
      originalEntryId: input.originalEntryId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      poNumberText: input.poNumberText ?? null,
      supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      lcNo: input.lcNo ?? null,
      billOfEntryNo: input.billOfEntryNo ?? null,
      challanNo: input.challanNo ?? null,
      siteAddress: input.siteAddress ?? null,
      receivedBy: input.receivedBy ?? null,
      vehicle: input.vehicle ?? null,
      reason: input.reason ?? null,
      description: input.description ?? null,
      customerPhone: input.customerPhone ?? null,
      customerAddress: input.customerAddress ?? null,
      notes: input.notes ?? null,
      currency: type === "GRN_IMPORT" ? ((input.currency as EntryWrite["currency"]) ?? "BDT") : "BDT",
      exchangeRate: type === "GRN_IMPORT" ? (input.exchangeRate ?? "1") : "1",
      discountAmount: type === "SALE" ? (input.discountAmount ?? "0") : "0",
      vatPercent: type === "SALE" ? (input.vatPercent ?? settings.defaultSalesVatPercent) : "0",
      lines: input.lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: type === "SALE" ? (l.unitPrice ?? products.get(l.productId)!.sellingPrice) : meta.price === "COST_BDT" || meta.price === "COST_FOREIGN" ? (l.unitPrice ?? "0") : "0",
        condition: (l.condition as "GOOD" | "DAMAGED") ?? "GOOD",
        originalLineId: l.originalLineId ?? null,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        note: l.note ?? null,
        serials: (l.serials ?? []).map(normalizeSerial).filter(Boolean),
      })),
      charges: type === "GRN_IMPORT" ? input.charges.map((c) => ({ type: c.type, mode: c.mode, value: c.value, includeInCost: c.includeInCost, label: c.label ?? null })) : [],
    };
    if (write.purchaseOrderId) await this.applyPurchaseOrder(store, write, input, actor, products, warnings);
    else for (const l of write.lines) l.purchaseOrderLineId = null;
    return write;
  }

  /** GRN against a PO: the PO decides supplier, currency, rate and prices; quantities are checked against what is still to come. */
  private async applyPurchaseOrder(store: InventoryStore, w: EntryWrite, input: EntryInput, actor: InventoryActor, products: Map<string, ProductInfo>, warnings?: Warning[]): Promise<void> {
    if (w.type !== "GRN_LOCAL" && w.type !== "GRN_IMPORT") throw InventoryErrors.purchaseOrderMismatch("Only GRNs can be received against a purchase order.");
    const t = await receiptListener().terms(store.tx, w.purchaseOrderId!);
    if (w.type !== t.grnType) throw InventoryErrors.purchaseOrderMismatch(`${t.number} is ${t.grnType === "GRN_IMPORT" ? "an imported PO: receive it with a GRN (Imported)" : "a local PO: receive it with a GRN (Local)"}.`);
    if (w.supplierId && w.supplierId !== t.supplierId) throw InventoryErrors.purchaseOrderMismatch(`The supplier doesn't match purchase order ${t.number}.`);
    w.supplierId = t.supplierId;
    w.currency = w.type === "GRN_IMPORT" ? t.currency : "BDT";
    // Only users who can see costs may override the PO rate (e.g. the customs rate).
    w.exchangeRate = w.type === "GRN_IMPORT" ? (actor.canSeeCost && input.exchangeRate ? input.exchangeRate : t.exchangeRate) : "1";
    w.poNumberText = t.number;
    const byId = new Map(t.lines.map((l) => [l.purchaseOrderLineId, l]));
    const byProduct = new Map(t.lines.map((l) => [l.productId, l]));
    const used = new Map<string, Dec>();
    w.lines.forEach((l, i) => {
      const code = products.get(l.productId)!.code;
      const pl = l.purchaseOrderLineId ? byId.get(l.purchaseOrderLineId) : byProduct.get(l.productId);
      if (!pl || pl.productId !== l.productId) throw InventoryErrors.notOnPurchaseOrder(code, t.number);
      l.purchaseOrderLineId = pl.purchaseOrderLineId;
      l.unitPrice = pl.unitPrice; // server-side: never the client's price
      const total = (used.get(pl.purchaseOrderLineId) ?? d(0)).plus(d(l.qty));
      used.set(pl.purchaseOrderLineId, total);
      if (total.gt(d(pl.remaining))) {
        const err = InventoryErrors.overReceipt(code, l.productId, d(pl.remaining).toFixed(3), total.toFixed(3), t.number, `lines.${i}.qty`);
        if (warnings) warnings.push({ line: i, code: "OVER_RECEIPT", message: err.message });
        else throw err;
      }
    });
  }

  /* ───────────────────────────── validation ───────────────────────────── */

  /** Business rules checked before an entry is submitted or posted (inside the transaction). */
  async validate(store: InventoryStore, e: EntryRecord): Promise<void> {
    if (!e.lines.length) throw InventoryErrors.noLines();
    if (!e.warehouse.isActive) throw InventoryErrors.inactive("Warehouse", e.warehouse.name);
    if (e.entryDate > todayInDhaka()) throw InventoryErrors.futureDate();
    if (e.type === "OPENING" && (await store.openingLocked(e.warehouse.id))) throw InventoryErrors.openingLocked(e.warehouse.name);

    const need = (v: unknown, path: string, message: string) => {
      if (!v) throw InventoryErrors.required(path, message);
    };
    switch (e.type) {
      case "GRN_IMPORT":
      case "GRN_LOCAL":
      case "RETURN_TO_SUPPLIER":
        need(e.supplier, "supplierId", "Choose a supplier.");
        if (!e.supplier!.isActive) throw InventoryErrors.inactive("Supplier", e.supplier!.name);
        break;
      case "SALE":
        need(e.customer, "customerId", "Choose a customer.");
        if (!e.customer!.isActive) throw InventoryErrors.inactive("Customer", e.customer!.name);
        break;
      case "ISSUE_TO_PROJECT":
      case "RETURN_FROM_SITE":
        need(e.project, "projectId", "Choose a project.");
        assertProjectStatus(e.type, e.project!);
        break;
      case "TRANSFER":
        need(e.toWarehouse, "toWarehouseId", "Choose the destination warehouse.");
        if (e.toWarehouse!.id === e.warehouse.id) throw InventoryErrors.sameWarehouse();
        if (!e.toWarehouse!.isActive) throw InventoryErrors.inactive("Warehouse", e.toWarehouse!.name);
        break;
      case "DAMAGE_WRITE_OFF":
        need(e.reason, "reason", "Give a reason for the write-off.");
        break;
    }

    // Lines: product state, condition, serials.
    const seen = new Set<string>();
    for (const l of e.lines) {
      if (l.product.status === "DISCONTINUED" && !allowsDiscontinued(e.type)) throw InventoryErrors.discontinued(l.product.code);
      assertCondition(e.type, l.condition);
      if (l.product.trackSerial) assertSerialCount(l.product.code, l.qty, l.serials.map((s) => s.serial));
      else if (l.serials.length) throw InventoryErrors.required("lines", `${l.product.code} does not track serial numbers; remove them.`);
      for (const s of l.serials) {
        const k = `${l.productId}|${s.serial}`;
        if (seen.has(k)) throw InventoryErrors.serialDuplicate(s.serial);
        seen.add(k);
      }
    }

    // Links to the original issue / GRN.
    if (e.originalEntry) {
      const o = e.originalEntry;
      if (e.type === "RETURN_FROM_SITE") {
        if (o.type !== "ISSUE_TO_PROJECT" || o.status !== "POSTED") throw InventoryErrors.originalMismatch("The original entry must be a posted issue to project.");
        if (o.projectId !== e.project?.id) throw InventoryErrors.originalMismatch("The original issue was for a different project.");
        const original = (await store.entry(o.id))!;
        for (const l of e.lines) {
          let ol = l.originalLineId ? original.lines.find((x) => x.id === l.originalLineId) : undefined;
          if (l.originalLineId && !ol) throw InventoryErrors.originalMismatch("A line refers to a line of a different entry.");
          if (!ol) {
            const candidates = original.lines.filter((x) => x.productId === l.productId);
            if (candidates.length === 1) {
              ol = candidates[0]!;
              await store.updateLine(l.id, { originalLineId: ol.id });
              l.originalLineId = ol.id;
            }
          }
          if (ol) {
            if (ol.productId !== l.productId) throw InventoryErrors.originalMismatch("A returned line's product doesn't match the original issue line.");
            const left = d(ol.qty).minus(d(await store.returnedQty(ol.id, e.id)));
            if (d(l.qty).gt(left)) throw InventoryErrors.returnExceeds(l.product.code, left.toFixed(3));
          }
        }
      } else if (e.type === "RETURN_TO_SUPPLIER") {
        if (!["GRN_IMPORT", "GRN_LOCAL"].includes(o.type) || o.status !== "POSTED") throw InventoryErrors.originalMismatch("The original entry must be a posted GRN.");
        if (o.supplierId !== e.supplier?.id) throw InventoryErrors.originalMismatch("The original GRN was from a different supplier.");
      } else {
        throw InventoryErrors.originalMismatch("Only returns can refer to an original entry.");
      }
    }
  }

  /* ───────────────────────────── workflow ───────────────────────────── */

  /** Submit → PENDING (reserving stock), or post immediately. Runs inside the caller's transaction. */
  private async submitOrPost(store: InventoryStore, id: string, actor: InventoryActor, action: "submit" | "post", confirmBelowCost?: boolean, created?: EntryRecord): Promise<void> {
    const e = created ?? (await store.lockEntry(id))!;
    await this.validate(store, e);
    const settings = await store.settings();

    if (action === "post") {
      if (!hasLevel(actor.level, "FULL")) throw InventoryErrors.postNotAllowed();
      if (e.type === "DAMAGE_WRITE_OFF" && settings.adminWriteOffNeedsApproval) throw InventoryErrors.writeOffNeedsApproval();
      // validate() keeps e in step with what it writes (originalLineId), so posting can use it as is.
      const after = await this.d.posting.post(store, id, actor, { confirmBelowCost, locked: e });
      await store.audit.record(actor, { action: "stock_entry.post", entityType: "StockEntry", entityId: id, before: { status: e.status }, after: { ...entrySnapshot(after), belowCostConfirmed: after.belowCostConfirmed } });
      return;
    }

    // Submit: preview totals with today's costs, check the price rule early, hold the stock.
    const fresh = (await store.entry(id))!;
    const preview = await this.d.posting.compute(store, fresh, await store.costs(fresh.lines.map((l) => l.productId)));
    const belowCost = this.d.posting.assertPriceRule(fresh, preview, actor, settings, confirmBelowCost);
    await this.d.posting.reserve(store, fresh);
    await this.d.posting.holdReceipt(store, fresh, actor);
    await this.d.posting.saveComputed(store, fresh, preview);
    await store.updateEntry(id, {
      status: "PENDING",
      submittedAt: new Date(),
      number: e.number ?? (await this.d.posting.numberFor(store, e, settings)),
      rejectionReason: null,
      verifiedById: null,
      verifiedAt: null,
      belowCostConfirmed: belowCost,
      ...this.d.posting.totals(preview),
    });
    await store.audit.record(actor, { action: "stock_entry.submit", entityType: "StockEntry", entityId: id, before: { status: e.status }, after: { status: "PENDING" } });
  }

  async submit(actor: InventoryActor, id: string, confirmBelowCost?: boolean): Promise<EntryRecord> {
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (!["DRAFT", "REJECTED"].includes(e.status)) throw InventoryErrors.wrongStatus("submit", e.status);
      if (e.createdBy.id !== actor.actorId) throw InventoryErrors.notCreator("submit");
      if (!actor.warehouseIds.includes(e.warehouse.id)) throw InventoryErrors.outOfScope(e.warehouse.name);
      await this.submitOrPost(store, id, actor, "submit", confirmBelowCost);
    });
    const e = (await this.store.entry(id))!;
    await this.emit(["submitted"], e, actor);
    return e;
  }

  /** Posts a draft directly (inventory FULL). */
  async postDraft(actor: InventoryActor, id: string, confirmBelowCost?: boolean): Promise<EntryRecord> {
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (!["DRAFT", "REJECTED"].includes(e.status)) throw InventoryErrors.wrongStatus("post", e.status);
      if (!actor.warehouseIds.includes(e.warehouse.id)) throw InventoryErrors.outOfScope(e.warehouse.name);
      await this.submitOrPost(store, id, actor, "post", confirmBelowCost);
    });
    const e = (await this.store.entry(id))!;
    await this.emit(this.postedEvents(e), e, actor);
    return e;
  }

  private assertVerifier(actor: InventoryActor, e: EntryRecord): void {
    if (!actor.warehouseIds.includes(e.warehouse.id)) throw InventoryErrors.outOfScope(e.warehouse.name);
    if (e.createdBy.id === actor.actorId) throw InventoryErrors.selfApproval();
  }

  /** Approve → the posting engine (transfers are dispatched). */
  async approve(actor: InventoryActor, id: string, confirmBelowCost?: boolean): Promise<EntryRecord> {
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (e.status !== "PENDING") throw InventoryErrors.wrongStatus("approve", e.status);
      this.assertVerifier(actor, e);
      await this.validate(store, e);
      const after = await this.d.posting.post(store, id, actor, { confirmBelowCost: confirmBelowCost ?? e.belowCostConfirmed, approverId: actor.actorId, locked: e });
      await store.audit.record(actor, {
        action: "stock_entry.approve",
        entityType: "StockEntry",
        entityId: id,
        before: { status: "PENDING" },
        after: { ...entrySnapshot(after), belowCostConfirmed: after.belowCostConfirmed },
      });
    });
    const e = (await this.store.entry(id))!;
    await this.emit(e.type === "TRANSFER" ? ["approved", "dispatched"] : ["approved"], e, actor);
    return e;
  }

  async reject(actor: InventoryActor, id: string, reason: string): Promise<EntryRecord> {
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (e.status !== "PENDING") throw InventoryErrors.wrongStatus("reject", e.status);
      this.assertVerifier(actor, e);
      await this.d.posting.release(store, e, actor.actorId);
      await store.updateEntry(id, { status: "REJECTED", rejectionReason: reason, verifiedById: actor.actorId, verifiedAt: new Date() });
      await store.audit.record(actor, { action: "stock_entry.reject", entityType: "StockEntry", entityId: id, before: { status: "PENDING" }, after: { status: "REJECTED", reason } });
    });
    const e = (await this.store.entry(id))!;
    await this.emit(["rejected"], e, actor);
    return e;
  }

  /** The creator can cancel a draft, pending or rejected entry (FULL users can cancel anyone's). */
  async cancel(actor: InventoryActor, id: string): Promise<EntryRecord> {
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (!CANCELLABLE.includes(e.status)) throw InventoryErrors.wrongStatus("cancel", e.status);
      if (e.createdBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw InventoryErrors.notCreator("cancel");
      if (e.status === "PENDING") await this.d.posting.release(store, e, actor.actorId);
      await store.updateEntry(id, { status: "CANCELLED", cancelledAt: new Date() });
      await store.audit.record(actor, { action: "stock_entry.cancel", entityType: "StockEntry", entityId: id, before: { status: e.status }, after: { status: "CANCELLED" } });
    });
    const e = (await this.store.entry(id))!;
    await this.emit(["cancelled"], e, actor);
    return e;
  }

  async reverse(actor: InventoryActor, id: string, reason: string): Promise<{ original: EntryRecord; reversal: EntryRecord }> {
    const revId = await this.d.uow.transaction(async (store) => {
      const e = await store.entry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (!actor.warehouseIds.includes(e.warehouse.id)) throw InventoryErrors.outOfScope(e.warehouse.name);
      const revId = await this.d.posting.reverse(store, id, actor, reason);
      const rev = (await store.entry(revId))!;
      await store.audit.record(actor, { action: "stock_entry.reverse", entityType: "StockEntry", entityId: id, before: { status: e.status }, after: { status: "REVERSED", reason, reversal: rev.number } });
      await store.audit.record(actor, { action: "stock_entry.create", entityType: "StockEntry", entityId: revId, after: entrySnapshot(rev) });
      return revId;
    });
    const original = (await this.store.entry(id))!;
    await this.emit(["reversed"], original, actor);
    return { original, reversal: (await this.store.entry(revId))! };
  }

  /** Confirms a transfer at the destination (user must have the destination warehouse in scope). */
  async receive(actor: InventoryActor, id: string, input: ReceiveInput): Promise<{ entry: EntryRecord; shortageEntry: EntryRecord | null }> {
    const shortageId = await this.d.uow.transaction(async (store) => {
      const e = await store.entry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (!e.toWarehouse || !actor.warehouseIds.includes(e.toWarehouse.id)) throw InventoryErrors.outOfScope(e.toWarehouse?.name);
      const shortageId = await this.d.posting.receive(store, id, actor, input);
      const after = (await store.entry(id))!;
      await store.audit.record(actor, { action: "stock_entry.receive", entityType: "StockEntry", entityId: id, before: { status: "DISPATCHED" }, after: { status: "RECEIVED", lines: after.lines.map((l) => ({ product: l.product.code, sent: l.qty, received: l.receivedQty })) } });
      if (shortageId) {
        const wo = (await store.entry(shortageId))!;
        await store.audit.record(actor, { action: "stock_entry.create", entityType: "StockEntry", entityId: shortageId, after: entrySnapshot(wo) });
      }
      return shortageId;
    });
    const entry = (await this.store.entry(id))!;
    const shortageEntry = shortageId ? await this.store.entry(shortageId) : null;
    await this.emit(["received"], entry, actor, shortageEntry);
    return { entry, shortageEntry };
  }

  /* ───────────────────────────── calculate (preview) ───────────────────────────── */

  /**
   * Computes lines, landed cost, totals, availability and warnings without saving anything,
   * using the same computation the posting engine runs.
   */
  async calculate(actor: InventoryActor, input: EntryInput) {
    const store = this.store;
    const settings = await store.settings();
    if (!actor.warehouseIds.includes(input.warehouseId)) throw InventoryErrors.outOfScope();
    const warnings: Warning[] = [];
    const write = await this.toWrite(store, input, settings, actor, warnings);
    const type = write.type;
    const products = new Map((await store.products(write.lines.map((l) => l.productId))).map((p) => [p.id, p]));
    const costs = await store.costs(write.lines.map((l) => l.productId));

    // A transient record so the shared compute() can run.
    const pseudo = {
      type,
      exchangeRate: write.exchangeRate,
      discountAmount: write.discountAmount,
      vatPercent: write.vatPercent,
      originalEntry: write.originalEntryId ? { id: write.originalEntryId } : null,
      charges: write.charges.map((c, i) => ({ ...c, id: String(i), amountBdt: "0" })),
      lines: write.lines.map((l, i) => ({ ...l, id: String(i), product: products.get(l.productId)! })),
    } as unknown as EntryRecord;
    const calc = await this.d.posting.compute(store, pseudo, costs);

    const keys = write.lines.map((l) => ({ productId: l.productId, warehouseId: write.warehouseId, condition: l.condition }));
    const balances = await store.balances(keys);
    const requested = new Map<string, ReturnType<typeof d>>();

    const lines = write.lines.map((l, i) => {
      const p = products.get(l.productId)!;
      const k = balanceKey(keys[i]!);
      const b = balances.get(k);
      const avail = available(b?.qtyOnHand ?? "0", b?.qtyReserved ?? "0");
      requested.set(k, (requested.get(k) ?? d(0)).plus(d(l.qty)));
      const short = takesStock(type) && requested.get(k)!.gt(d(avail));
      if (short) warnings.push({ line: i, code: "INSUFFICIENT_STOCK", message: `Only ${avail} of ${p.code} available in this warehouse.` });
      if (calc.lines[i]!.belowCost) warnings.push({ line: i, code: "BELOW_COST", message: `${p.code} is priced below average cost.` });
      if (p.status === "DISCONTINUED" && !allowsDiscontinued(type)) warnings.push({ line: i, code: "PRODUCT_DISCONTINUED", message: `${p.code} is discontinued.` });
      if (p.trackSerial && !d(l.qty).eq(l.serials.length)) warnings.push({ line: i, code: "SERIAL_COUNT", message: `${p.code} needs ${d(l.qty).toFixed(0)} serial number(s); ${l.serials.length} entered.` });
      return {
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        condition: l.condition,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        available: avail,
        insufficient: short,
        ...calc.lines[i]!,
      };
    });
    if (type === "SALE" && d(write.discountAmount).gt(d(calc.totals.subtotal))) warnings.push({ line: null, code: "DISCOUNT_TOO_HIGH", message: "Discount is more than the subtotal." });
    const freeze = await store.activeCount(write.warehouseId, write.lines.map((l) => l.productId));
    if (freeze) warnings.push({ line: null, code: "COUNT_IN_PROGRESS", message: `Stock count ${freeze.number} is in progress for some of these products in this warehouse; the entry can't be posted until it ends.` });
    if (type === "OPENING" && (await store.openingLocked(write.warehouseId))) warnings.push({ line: null, code: "OPENING_LOCKED", message: "Opening stock for this warehouse is locked." });

    const fy = fiscalYear(new Date(`${write.entryDate}T00:00:00Z`), settings.fiscalYearStartMonth);
    const prefix = ENTRY_TYPE_META[type].prefix;
    const full = hasLevel(actor.level, "FULL");
    return {
      type,
      nextNumber: formatDocNumber(prefix, fy, await store.peekNumber(prefix, fy)),
      postingMode: full && !(type === "DAMAGE_WRITE_OFF" && settings.adminWriteOffNeedsApproval) ? (type === "TRANSFER" ? "DISPATCHED_IMMEDIATELY" : "POSTED_IMMEDIATELY") : "PENDING_VERIFICATION",
      currency: write.currency,
      exchangeRate: write.exchangeRate,
      purchaseOrderId: write.purchaseOrderId ?? null,
      supplierId: write.supplierId,
      lines,
      charges: write.charges.map((c, i) => ({ ...c, amountBdt: calc.charges[i]!.amountBdt })),
      totals: calc.totals,
      warnings,
    };
  }

  /* ───────────────────────────── landed cost (verifier) ───────────────────────────── */

  /**
   * A verifier who can see costs sets the landed-cost charges and the exchange rate (customs rate)
   * of a pending import GRN before approving it. The Store Manager who received it never sees costs.
   */
  async updateLandedCost(actor: InventoryActor, id: string, input: LandedCostInput): Promise<EntryRecord> {
    if (!hasLevel(actor.level, "APPROVE") || !actor.canSeeCost) throw InventoryErrors.landedCostNotAllowed();
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(id);
      if (!e) throw new NotFoundError("Stock entry");
      if (!actor.warehouseIds.includes(e.warehouse.id)) throw InventoryErrors.outOfScope(e.warehouse.name);
      if (e.type !== "GRN_IMPORT") throw InventoryErrors.purchaseOrderMismatch("Landed-cost charges only apply to imported GRNs.");
      if (e.status !== "PENDING") throw InventoryErrors.wrongStatus("change the landed cost of", e.status);
      const snap = (x: EntryRecord) => ({
        exchangeRate: x.exchangeRate,
        costTotal: x.costTotal,
        charges: x.charges.map((c) => ({ type: c.type, mode: c.mode, value: c.value, includeInCost: c.includeInCost, label: c.label, amountBdt: c.amountBdt })),
      });
      await store.replaceCharges(id, input.charges.map((c) => ({ type: c.type, mode: c.mode, value: c.value, includeInCost: c.includeInCost, label: c.label ?? null })));
      if (input.exchangeRate) await store.updateEntry(id, { exchangeRate: input.exchangeRate });
      const fresh = (await store.entry(id))!;
      const preview = await this.d.posting.compute(store, fresh, await store.costs(fresh.lines.map((l) => l.productId)));
      await this.d.posting.saveComputed(store, fresh, preview);
      await store.updateEntry(id, this.d.posting.totals(preview));
      const after = (await store.entry(id))!;
      await store.audit.record(actor, { action: "stock_entry.landed_cost", entityType: "StockEntry", entityId: id, before: snap(e), after: snap(after) });
    });
    return (await this.store.entry(id))!;
  }
}
