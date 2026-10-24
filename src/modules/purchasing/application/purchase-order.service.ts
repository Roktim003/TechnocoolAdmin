import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { hasLevel } from "@/shared/rbac/levels";
import { d } from "@/modules/inventory/domain/decimal";
import { fiscalYear, formatDocNumber, todayInDhaka } from "@/modules/inventory/domain/numbering";
import { PurchasingErrors } from "../domain/errors";
import { isOverdue, poTotals, remainingQty, statusAfterReceipts } from "../domain/rules";
import { AMENDABLE, CANCELLABLE, EDITABLE, grnTypeFor, OPEN, poTypeFor, RECEIVABLE, type PoStatus } from "../domain/types";
import type { AmendPoInput, CalculatePoInput, CreatePoInput, EmailPoInput, PoFilters, PoInput, PriceHistoryFilters } from "./dto";
import {
  noNotifier,
  type PoDocumentQueue,
  type PoEvent,
  type PoRecord,
  type PoWrite,
  type PurchasingActor,
  type PurchasingNotifier,
  type PurchasingStore,
  type PurchasingUnitOfWork,
  type StockDirectory,
} from "./ports";

/** What the audit trail stores for a PO. */
export function poSnapshot(po: PoRecord) {
  return {
    number: po.number ?? po.draftRef,
    status: po.status,
    revision: po.revision,
    type: po.type,
    supplier: po.supplier.code,
    currency: po.currency,
    exchangeRate: po.exchangeRate,
    poDate: po.poDate,
    expectedDeliveryDate: po.expectedDeliveryDate,
    deliverTo: po.deliverTo.code,
    project: po.project?.code ?? null,
    supplierQuoteRef: po.supplierQuoteRef,
    discountAmount: po.discountAmount,
    vatPercent: po.vatPercent,
    subtotal: po.subtotal,
    vatAmount: po.vatAmount,
    total: po.total,
    totalBdt: po.totalBdt,
    lines: po.lines.map((l) => ({ id: l.id, product: l.product.code, qty: l.qty, unitPrice: l.unitPrice, amount: l.amount, receivedQty: l.receivedQty, pendingReceiptQty: l.pendingReceiptQty })),
  };
}

const draftRef = () => `DRAFT-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
const now = () => new Date();
const plainQty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);
const plainPrice = (v: string) => d(v).toString();

/** A change recorded on an amendment; `price` changes are hidden from roles without seeCost. */
export interface RevisionChange {
  text: string;
  price: boolean;
}

export class PurchaseOrderService {
  constructor(
    private readonly d: {
      uow: PurchasingUnitOfWork;
      notifier?: PurchasingNotifier;
      stock?: StockDirectory;
      documents?: PoDocumentQueue;
      today?: () => string;
    },
  ) {}

  private get store() {
    return this.d.uow.store;
  }
  private today() {
    return (this.d.today ?? todayInDhaka)();
  }
  private async notify(event: PoEvent, id: string, actor: PurchasingActor) {
    const po = await this.store.po(id);
    if (po) await (this.d.notifier ?? noNotifier).po(event, po, { actorId: actor.actorId });
  }

  /* ───────────────────────────── reads ───────────────────────────── */

  list(actor: PurchasingActor, q: ListQuery<PoFilters>) {
    return this.store.listPos(q, { warehouseIds: actor.warehouseIds, today: this.today() });
  }

  async get(actor: PurchasingActor, id: string): Promise<PoRecord> {
    const po = await this.store.po(id);
    if (!po) throw new NotFoundError("Purchase order");
    this.assertScope(actor, po);
    return po;
  }

  /** Detail page: the PO with its linked GRNs, revisions, attachments and workflow history. */
  async detail(actor: PurchasingActor, id: string) {
    const po = await this.get(actor, id);
    const [receipts, revisions, attachments, history] = await Promise.all([this.store.receipts(id), this.store.revisions(id), this.store.attachments(id), this.store.history(id)]);
    return { po, receipts, revisions, attachments, history, today: this.today() };
  }

  isOverdue(po: PoRecord) {
    return isOverdue(po, this.today());
  }

  private assertScope(actor: PurchasingActor, po: Pick<PoRecord, "deliverTo">) {
    if (!actor.warehouseIds.includes(po.deliverTo.id)) throw PurchasingErrors.outOfScope(po.deliverTo.name);
  }

  /* ───────────────────────────── write model ───────────────────────────── */

  /**
   * Resolves and checks a create / edit request: supplier active (its type fixes the PO type and
   * currency), deliver-to warehouse active and in scope, project, products active and listed
   * once, totals computed server-side.
   */
  private async toWrite(store: PurchasingStore, actor: PurchasingActor, input: PoInput, existing?: PoRecord): Promise<PoWrite> {
    const supplier = await store.supplier(input.supplierId);
    if (!supplier) throw PurchasingErrors.unknown("supplier");
    if (!supplier.isActive) throw PurchasingErrors.inactiveSupplier(supplier.name);
    const type = poTypeFor(supplier.type);
    if (existing && existing.type !== type) throw PurchasingErrors.supplierTypeChange();

    const wh = await store.warehouse(input.deliverToWarehouseId);
    if (!wh) throw PurchasingErrors.unknown("warehouse");
    if (!wh.isActive) throw PurchasingErrors.inactive("Warehouse", wh.name);
    if (!actor.warehouseIds.includes(wh.id)) throw PurchasingErrors.outOfScope(wh.name);
    if (input.projectId) {
      const p = await store.project(input.projectId);
      if (!p) throw PurchasingErrors.unknown("project");
      if (!p.isActive) throw PurchasingErrors.inactive("Project", p.code);
    }

    if (!input.lines.length) throw PurchasingErrors.noLines();
    await this.assertProducts(store, input.lines.map((l) => l.productId));

    const settings = await store.settings();
    const local = type === "LOCAL";
    const poDate = input.poDate ?? this.today();
    if (input.expectedDeliveryDate && input.expectedDeliveryDate < poDate) throw PurchasingErrors.dateOrder();
    const header = {
      type,
      currency: local ? ("BDT" as const) : supplier.defaultCurrency,
      // "0" on an imported draft means "rate not entered yet" (required to submit / approve).
      exchangeRate: local ? "1" : (input.exchangeRate ?? "0"),
      discountAmount: local ? (input.discountAmount ?? "0") : "0",
      vatPercent: local ? (input.vatPercent ?? settings.defaultVatPercent) : "0",
    };
    const totals = poTotals({ ...header, lines: input.lines });
    if (local && d(header.discountAmount).gt(d(totals.subtotal))) throw PurchasingErrors.discountTooHigh();
    return {
      supplierId: supplier.id,
      ...header,
      poDate,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      deliverToWarehouseId: wh.id,
      projectId: input.projectId ?? null,
      supplierQuoteRef: input.supplierQuoteRef ?? null,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      total: totals.total,
      totalBdt: totals.totalBdt,
      discountAmount: totals.discountAmount,
      vatPercent: totals.vatPercent,
      terms: input.terms !== undefined ? input.terms : existing ? existing.terms : settings.defaultTerms,
      notes: input.notes ?? null,
      lines: input.lines.map((l, i) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, amount: totals.lines[i]!.amount, note: l.note ?? null })),
    };
  }

  /** Products must exist, be ACTIVE and appear once. */
  private async assertProducts(store: PurchasingStore, ids: string[], allowExisting: string[] = []) {
    const products = new Map((await store.products(ids)).map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const id of ids) {
      const p = products.get(id);
      if (!p) throw PurchasingErrors.unknown("product");
      if (seen.has(id)) throw PurchasingErrors.duplicateProduct(p.code);
      seen.add(id);
      if (p.status !== "ACTIVE" && !allowExisting.includes(id)) throw PurchasingErrors.discontinued(p.code);
    }
    return products;
  }

  /** Everything a PO needs before it can go for approval or be approved. */
  private assertComplete(po: PoRecord) {
    if (!po.lines.length) throw PurchasingErrors.noLines();
    for (const l of po.lines) if (!d(l.unitPrice).gt(0)) throw PurchasingErrors.priceRequired(l.product.code);
    if (po.type === "IMPORTED" && !d(po.exchangeRate).gt(0)) throw PurchasingErrors.rateRequired();
    if (!po.supplier.isActive) throw PurchasingErrors.inactiveSupplier(po.supplier.name);
    for (const l of po.lines) if (l.product.status !== "ACTIVE") throw PurchasingErrors.discontinued(l.product.code);
  }

  private async numberFor(store: PurchasingStore, po: Pick<PoRecord, "poDate">) {
    const fy = fiscalYear(new Date(`${po.poDate}T00:00:00Z`), await store.fiscalYearStartMonth());
    return formatDocNumber("PO", fy, await store.nextNumber("PO", fy));
  }

  /* ───────────────────────────── create / edit / calculate ───────────────────────────── */

  async calculate(actor: PurchasingActor, input: CalculatePoInput) {
    const store = this.store;
    const supplier = await store.supplier(input.supplierId);
    if (!supplier) throw PurchasingErrors.unknown("supplier");
    const type = poTypeFor(supplier.type);
    const settings = await store.settings();
    const local = type === "LOCAL";
    const header = {
      type,
      currency: local ? ("BDT" as const) : supplier.defaultCurrency,
      exchangeRate: local ? "1" : (input.exchangeRate ?? "0"),
      discountAmount: local ? (input.discountAmount ?? "0") : "0",
      vatPercent: local ? (input.vatPercent ?? settings.defaultVatPercent) : "0",
    };
    const totals = poTotals({ ...header, lines: input.lines });
    const warnings: { line: number | null; code: string; message: string }[] = [];
    if (!supplier.isActive) warnings.push({ line: null, code: "INACTIVE_SUPPLIER", message: `Supplier '${supplier.name}' is inactive.` });
    if (local && d(header.discountAmount).gt(d(totals.subtotal))) warnings.push({ line: null, code: "DISCOUNT_TOO_HIGH", message: "Discount is more than the subtotal." });
    if (!local && !d(header.exchangeRate).gt(0)) warnings.push({ line: null, code: "RATE_REQUIRED", message: "Enter the exchange rate to see the BDT equivalent." });
    const products = new Map((await store.products(input.lines.map((l) => l.productId))).map((p) => [p.id, p]));
    input.lines.forEach((l, i) => {
      const p = products.get(l.productId);
      if (p && p.status !== "ACTIVE") warnings.push({ line: i, code: "PRODUCT_DISCONTINUED", message: `${p.code} is discontinued.` });
      if (!d(l.unitPrice).gt(0)) warnings.push({ line: i, code: "PRICE_REQUIRED", message: `Enter a unit price for ${p?.code ?? "this line"}.` });
    });
    const poDate = input.poDate ?? this.today();
    const fy = fiscalYear(new Date(`${poDate}T00:00:00Z`), await store.fiscalYearStartMonth());
    return {
      type,
      currency: header.currency,
      exchangeRate: header.exchangeRate,
      nextNumber: formatDocNumber("PO", fy, await store.peekNumber("PO", fy)),
      approvalMode: hasLevel(actor.level, "APPROVE") ? "CAN_APPROVE" : "NEEDS_APPROVAL",
      lines: totals.lines,
      totals: { subtotal: totals.subtotal, discountAmount: totals.discountAmount, vatPercent: totals.vatPercent, vatAmount: totals.vatAmount, total: totals.total, totalBdt: totals.totalBdt },
      warnings,
    };
  }

  async create(actor: PurchasingActor, input: CreatePoInput): Promise<PoRecord> {
    if (input.action === "approve" && !hasLevel(actor.level, "APPROVE")) throw PurchasingErrors.approverOnly();
    const write = await this.toWrite(this.store, actor, input);
    const id = await this.d.uow.transaction(async (store) => {
      const id = await store.createPo({ ...write, draftRef: draftRef(), createdById: actor.actorId });
      await store.audit.record(actor, { action: "purchase_order.create", entityType: "PurchaseOrder", entityId: id, after: poSnapshot((await store.po(id))!) });
      if (input.action === "submit") await this.submitIn(store, id, actor);
      if (input.action === "approve") await this.approveIn(store, id, actor);
      return id;
    });
    if (input.action === "submit") await this.notify("submitted", id, actor);
    return (await this.store.po(id))!;
  }

  async update(actor: PurchasingActor, id: string, input: PoInput): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      const before = await store.lockPo(id);
      if (!before) throw new NotFoundError("Purchase order");
      this.assertScope(actor, before);
      if (!EDITABLE.includes(before.status)) throw PurchasingErrors.wrongStatus("edit", before.status);
      if (before.createdBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw PurchasingErrors.notCreator("edit");
      await store.replacePo(id, await this.toWrite(store, actor, input, before));
      await store.audit.record(actor, { action: "purchase_order.update", entityType: "PurchaseOrder", entityId: id, before: poSnapshot(before), after: poSnapshot((await store.po(id))!) });
    });
    return (await this.store.po(id))!;
  }

  /* ───────────────────────────── approval workflow ───────────────────────────── */

  private async submitIn(store: PurchasingStore, id: string, actor: PurchasingActor) {
    const po = (await store.lockPo(id))!;
    if (!EDITABLE.includes(po.status)) throw PurchasingErrors.wrongStatus("submit", po.status);
    if (po.createdBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw PurchasingErrors.notCreator("submit");
    this.assertComplete(po);
    await store.updatePo(id, { status: "PENDING_APPROVAL", submittedAt: now(), number: po.number ?? (await this.numberFor(store, po)), rejectionReason: null, rejectedById: null, rejectedAt: null });
    await store.audit.record(actor, { action: "purchase_order.submit", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "PENDING_APPROVAL" } });
  }

  /** Approve (also "Save & approve" from a draft). Self-approval only with purchasing FULL. */
  private async approveIn(store: PurchasingStore, id: string, actor: PurchasingActor) {
    const po = (await store.lockPo(id))!;
    if (!["DRAFT", "REJECTED", "PENDING_APPROVAL"].includes(po.status)) throw PurchasingErrors.wrongStatus("approve", po.status);
    if (!hasLevel(actor.level, "APPROVE")) throw PurchasingErrors.approverOnly();
    this.assertScope(actor, po);
    if (po.createdBy.id === actor.actorId && !hasLevel(actor.level, "FULL")) throw PurchasingErrors.selfApproval();
    this.assertComplete(po);
    const at = now();
    await store.updatePo(id, {
      status: "APPROVED",
      approvedById: actor.actorId,
      approvedAt: at,
      submittedAt: po.submittedAt ?? at,
      number: po.number ?? (await this.numberFor(store, po)),
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    });
    await store.audit.record(actor, { action: "purchase_order.approve", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "APPROVED", total: po.total, totalBdt: po.totalBdt } });
  }

  private async locked(store: PurchasingStore, id: string, actor: PurchasingActor) {
    const po = await store.lockPo(id);
    if (!po) throw new NotFoundError("Purchase order");
    this.assertScope(actor, po);
    return po;
  }

  async submit(actor: PurchasingActor, id: string): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      await this.locked(store, id, actor);
      await this.submitIn(store, id, actor);
    });
    await this.notify("submitted", id, actor);
    return (await this.store.po(id))!;
  }

  async approve(actor: PurchasingActor, id: string): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      await this.locked(store, id, actor);
      await this.approveIn(store, id, actor);
    });
    await this.notify("approved", id, actor);
    return (await this.store.po(id))!;
  }

  async reject(actor: PurchasingActor, id: string, reason: string): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      const po = await this.locked(store, id, actor);
      if (po.status !== "PENDING_APPROVAL") throw PurchasingErrors.wrongStatus("reject", po.status);
      if (!hasLevel(actor.level, "APPROVE")) throw PurchasingErrors.approverOnly();
      if (po.createdBy.id === actor.actorId && !hasLevel(actor.level, "FULL")) throw PurchasingErrors.selfApproval();
      await store.updatePo(id, { status: "REJECTED", rejectionReason: reason, rejectedById: actor.actorId, rejectedAt: now() });
      await store.audit.record(actor, { action: "purchase_order.reject", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "REJECTED", reason } });
    });
    await this.notify("rejected", id, actor);
    return (await this.store.po(id))!;
  }

  async markSent(actor: PurchasingActor, id: string, opts: { emailSupplier?: boolean; to?: string; message?: string | null } = {}): Promise<{ po: PoRecord; email: { jobId: string; to: string } | null }> {
    await this.d.uow.transaction(async (store) => {
      const po = await this.locked(store, id, actor);
      if (po.status !== "APPROVED") throw PurchasingErrors.wrongStatus("mark as sent", po.status);
      await store.updatePo(id, { status: "SENT", sentAt: now() });
      await store.audit.record(actor, { action: "purchase_order.mark_sent", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "SENT" } });
    });
    const email = opts.emailSupplier ? await this.email(actor, id, { to: opts.to, message: opts.message ?? null }) : null;
    return { po: (await this.store.po(id))!, email };
  }

  /** Queues the PO PDF and an email with it to the supplier (worker; email queue; logged). */
  async email(actor: PurchasingActor, id: string, input: EmailPoInput): Promise<{ jobId: string; to: string }> {
    const po = await this.get(actor, id);
    if (!["APPROVED", "SENT", "PARTLY_RECEIVED", "FULLY_RECEIVED"].includes(po.status)) throw PurchasingErrors.wrongStatus("email", po.status);
    const to = input.to ?? po.supplier.email;
    if (!to) throw PurchasingErrors.noSupplierEmail(po.supplier.name);
    if (!this.d.documents) throw new Error("PO document queue is not configured.");
    // A supplier copy always shows prices: it is the order itself.
    const { jobId } = await this.d.documents.enqueue({ purchaseOrderId: id, userId: actor.actorId, userName: actor.name, showPrices: true, email: { to, cc: input.cc ?? null, message: input.message ?? null } });
    await this.d.uow.store.audit.record(actor, { action: "purchase_order.email", entityType: "PurchaseOrder", entityId: id, after: { to, cc: input.cc ?? null, jobId, number: po.number } });
    return { jobId, to };
  }

  /** A PDF for the viewer (prices only with seeCost). */
  async document(actor: PurchasingActor, id: string) {
    const po = await this.get(actor, id);
    if (po.status === "DRAFT") throw PurchasingErrors.wrongStatus("print", po.status);
    if (!this.d.documents) throw new Error("PO document queue is not configured.");
    return this.d.documents.enqueue({ purchaseOrderId: id, userId: actor.actorId, userName: actor.name, showPrices: actor.canSeeCost });
  }

  /** Accept a short delivery: only a partly received PO with nothing pending. */
  async close(actor: PurchasingActor, id: string, reason: string): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      const po = await this.locked(store, id, actor);
      if (po.status !== "PARTLY_RECEIVED") throw PurchasingErrors.wrongStatus("close", po.status);
      if (po.lines.some((l) => d(l.pendingReceiptQty).gt(0))) throw PurchasingErrors.pendingReceipts();
      await store.updatePo(id, { status: "CLOSED", closedReason: reason, closedById: actor.actorId, closedAt: now() });
      await store.audit.record(actor, {
        action: "purchase_order.close",
        entityType: "PurchaseOrder",
        entityId: id,
        before: { status: po.status },
        after: { status: "CLOSED", reason, notReceived: po.lines.filter((l) => remainingQty(l).gt(0)).map((l) => ({ product: l.product.code, qty: remainingQty(l).toFixed(3) })) },
      });
    });
    return (await this.store.po(id))!;
  }

  async cancel(actor: PurchasingActor, id: string, reason: string): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      const po = await this.locked(store, id, actor);
      // Receipts first: "goods were received" explains a refusal better than the status does.
      if (po.lines.some((l) => d(l.receivedQty).gt(0) || d(l.pendingReceiptQty).gt(0))) throw PurchasingErrors.hasReceipts();
      if (!CANCELLABLE.includes(po.status)) throw PurchasingErrors.wrongStatus("cancel", po.status);
      await store.updatePo(id, { status: "CANCELLED", cancelledReason: reason, cancelledById: actor.actorId, cancelledAt: now() });
      await store.audit.record(actor, { action: "purchase_order.cancel", entityType: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: "CANCELLED", reason } });
    });
    return (await this.store.po(id))!;
  }

  /* ───────────────────────────── amendment ───────────────────────────── */

  /**
   * Amends an approved PO: quantities, prices, new or removed lines, expected date (and rate /
   * discount / VAT). Saves the PO as it was in a revision with the reason and what changed.
   * A line can't go below what is already received plus pending receipt.
   */
  async amend(actor: PurchasingActor, id: string, input: AmendPoInput): Promise<PoRecord> {
    await this.d.uow.transaction(async (store) => {
      const po = await this.locked(store, id, actor);
      if (!AMENDABLE.includes(po.status)) throw PurchasingErrors.wrongStatus("amend", po.status);
      const local = po.type === "LOCAL";
      const changes: RevisionChange[] = [];
      const lineInputs = input.lines ?? po.lines.map((l) => ({ id: l.id, productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, note: l.note }));

      // Lines: match existing ones by id; the rest are new.
      const existing = new Map(po.lines.map((l) => [l.id, l]));
      const kept = new Set<string>();
      const update: { id: string; qty: string; unitPrice: string; amount: string; note: string | null }[] = [];
      const add: { productId: string; qty: string; unitPrice: string; amount: string; note: string | null }[] = [];
      await this.assertProducts(store, lineInputs.map((l) => l.productId), po.lines.map((l) => l.productId));
      const newProducts = new Map((await store.products(lineInputs.map((l) => l.productId))).map((p) => [p.id, p]));
      for (const l of lineInputs) {
        const old = l.id ? existing.get(l.id) : po.lines.find((x) => x.productId === l.productId);
        if (l.id && !old) throw PurchasingErrors.receiptMismatch("A line does not belong to this purchase order.");
        if (old) {
          if (old.productId !== l.productId) throw PurchasingErrors.lineProductChange();
          kept.add(old.id);
          const min = d(old.receivedQty).plus(d(old.pendingReceiptQty));
          if (d(l.qty).lt(min)) throw PurchasingErrors.amendBelowReceived(old.product.code, plainQty(min.toFixed(3)));
          if (!d(l.qty).eq(d(old.qty))) changes.push({ text: `${old.product.code}: quantity ${plainQty(old.qty)} → ${plainQty(d(l.qty).toFixed(3))}`, price: false });
          if (!d(l.unitPrice).eq(d(old.unitPrice))) changes.push({ text: `${old.product.code}: unit price ${plainPrice(old.unitPrice)} → ${plainPrice(l.unitPrice)} ${po.currency}`, price: true });
          update.push({ id: old.id, qty: l.qty, unitPrice: l.unitPrice, amount: "0", note: l.note ?? old.note });
        } else {
          const p = newProducts.get(l.productId)!;
          if (p.status !== "ACTIVE") throw PurchasingErrors.discontinued(p.code);
          if (!d(l.unitPrice).gt(0)) throw PurchasingErrors.priceRequired(p.code);
          changes.push({ text: `Added ${p.code} × ${plainQty(d(l.qty).toFixed(3))}`, price: false });
          changes.push({ text: `${p.code}: unit price ${plainPrice(l.unitPrice)} ${po.currency}`, price: true });
          add.push({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, amount: "0", note: l.note ?? null });
        }
      }
      for (const l of update) if (!d(l.unitPrice).gt(0)) throw PurchasingErrors.priceRequired(existing.get(l.id)!.product.code);
      const remove = po.lines.filter((l) => !kept.has(l.id));
      for (const l of remove) {
        if (d(l.receivedQty).gt(0) || d(l.pendingReceiptQty).gt(0)) throw PurchasingErrors.removeReceivedLine(l.product.code);
        changes.push({ text: `Removed ${l.product.code}`, price: false });
      }

      // Header.
      const header = {
        expectedDeliveryDate: input.expectedDeliveryDate !== undefined ? input.expectedDeliveryDate : po.expectedDeliveryDate,
        exchangeRate: !local && input.exchangeRate ? input.exchangeRate : po.exchangeRate,
        discountAmount: local && input.discountAmount !== undefined ? input.discountAmount : po.discountAmount,
        vatPercent: local && input.vatPercent !== undefined ? input.vatPercent : po.vatPercent,
      };
      if (header.expectedDeliveryDate && header.expectedDeliveryDate < po.poDate) throw PurchasingErrors.dateOrder();
      if (header.expectedDeliveryDate !== po.expectedDeliveryDate) changes.push({ text: `Expected delivery ${po.expectedDeliveryDate ?? "—"} → ${header.expectedDeliveryDate ?? "—"}`, price: false });
      if (!d(header.exchangeRate).eq(d(po.exchangeRate))) changes.push({ text: `Exchange rate ${plainPrice(po.exchangeRate)} → ${plainPrice(header.exchangeRate)}`, price: true });
      if (!d(header.discountAmount).eq(d(po.discountAmount))) changes.push({ text: `Discount ${po.discountAmount} → ${d(header.discountAmount).toFixed(2)}`, price: true });
      if (!d(header.vatPercent).eq(d(po.vatPercent))) changes.push({ text: `VAT ${plainPrice(po.vatPercent)}% → ${plainPrice(header.vatPercent)}%`, price: false });
      if (!changes.length) throw PurchasingErrors.noChanges();

      // Totals over the new set of lines (existing order first, then the new ones).
      const all = [...update.map((u) => ({ qty: u.qty, unitPrice: u.unitPrice })), ...add.map((a) => ({ qty: a.qty, unitPrice: a.unitPrice }))];
      const totals = poTotals({ type: po.type, lines: all, discountAmount: header.discountAmount, vatPercent: header.vatPercent, exchangeRate: header.exchangeRate });
      if (local && d(totals.discountAmount).gt(d(totals.subtotal))) throw PurchasingErrors.discountTooHigh();
      update.forEach((u, i) => (u.amount = totals.lines[i]!.amount));
      add.forEach((a, i) => (a.amount = totals.lines[update.length + i]!.amount));

      const revision = po.revision + 1;
      await store.addRevision({ poId: id, revision, changedById: actor.actorId, reason: input.reason, snapshot: poSnapshot(po), changes });
      await store.amendPo(
        id,
        { expectedDeliveryDate: header.expectedDeliveryDate, exchangeRate: header.exchangeRate, discountAmount: totals.discountAmount, vatPercent: totals.vatPercent, subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total, totalBdt: totals.totalBdt },
        { update, add, remove: remove.map((l) => l.id) },
      );
      const fresh = (await store.po(id))!;
      const status = statusAfterReceipts(po.status, po.sentAt, fresh.lines);
      await store.updatePo(id, { revision, status });
      await store.audit.record(actor, { action: "purchase_order.amend", entityType: "PurchaseOrder", entityId: id, before: poSnapshot(po), after: { ...poSnapshot({ ...fresh, revision, status }), reason: input.reason } });
    });
    return (await this.store.po(id))!;
  }

  /* ───────────────────────────── receiving (read side) ───────────────────────────── */

  /**
   * What a GRN can still receive: lines with remaining quantities, the GRN type, deliver-to
   * warehouse, supplier, currency and rate. Prices are added by the mapper only with seeCost.
   */
  async receivable(actor: PurchasingActor, id: string) {
    const po = await this.get(actor, id);
    return {
      po,
      receivable: RECEIVABLE.includes(po.status),
      grnType: grnTypeFor(po.type),
      lines: po.lines.map((l) => ({ line: l, remaining: remainingQty(l).toFixed(3) })),
    };
  }

  /** Open POs to receive against (GRN form). */
  receivableList(actor: PurchasingActor, q: ListQuery<PoFilters>) {
    return this.store.listPos({ ...q, filters: { ...q.filters, receivable: true } }, { warehouseIds: actor.warehouseIds, today: this.today() });
  }

  /* ───────────────────────────── low stock → POs ───────────────────────────── */

  /**
   * Creates draft POs for low-stock products: one per default supplier, with the suggested
   * quantity and the last approved price from that supplier (or the catalog purchase cost for
   * local suppliers). Products without a default supplier come back as `unassigned`, for the
   * new-PO form.
   */
  async fromLowStock(actor: PurchasingActor, input: { productIds: string[]; warehouseId?: string | null }) {
    const store = this.store;
    const ids = [...new Set(input.productIds)];
    const products = (await store.products(ids)).filter((p) => p.status === "ACTIVE");
    if (!products.length) throw PurchasingErrors.nothingToOrder();
    const warehouseId = input.warehouseId ?? (await store.warehouses(actor.warehouseIds)).filter((w) => w.isActive).sort((a, b) => a.code.localeCompare(b.code))[0]?.id;
    if (!warehouseId) throw PurchasingErrors.outOfScope();
    const suggestions = new Map((await (this.d.stock?.lowStock(ids, input.warehouseId ?? null) ?? Promise.resolve([]))).map((s) => [s.productId, s]));
    const qtyOf = (productId: string) => {
      const s = suggestions.get(productId);
      return s && d(s.suggestedQty).gt(0) ? s.suggestedQty : "1";
    };

    const groups = new Map<string, typeof products>();
    const unassigned: { product: (typeof products)[number]; suggestedQty: string }[] = [];
    for (const p of products) {
      const supplier = p.defaultSupplierId ? await store.supplier(p.defaultSupplierId) : null;
      if (!supplier || !supplier.isActive) unassigned.push({ product: p, suggestedQty: qtyOf(p.id) });
      else groups.set(supplier.id, [...(groups.get(supplier.id) ?? []), p]);
    }

    const created: PoRecord[] = [];
    for (const [supplierId, items] of groups) {
      const supplier = (await store.supplier(supplierId))!;
      const type = poTypeFor(supplier.type);
      const currency = type === "LOCAL" ? "BDT" : supplier.defaultCurrency;
      const lines = [];
      for (const p of items) {
        const last = await store.lastPrice(p.id, supplierId, currency);
        lines.push({ productId: p.id, qty: qtyOf(p.id), unitPrice: last?.unitPrice ?? (type === "LOCAL" ? p.purchaseCost : "0"), note: null });
      }
      const rate = type === "IMPORTED" ? ((await store.lastRate(supplierId, currency)) ?? undefined) : undefined;
      created.push(
        await this.create(actor, {
          action: "draft",
          supplierId,
          deliverToWarehouseId: warehouseId,
          exchangeRate: rate,
          notes: "Created from the low-stock list.",
          lines,
        } as CreatePoInput),
      );
    }
    return { created, unassigned, warehouseId };
  }

  /* ───────────────────────────── price history, digest ───────────────────────────── */

  priceHistory(actor: PurchasingActor, q: ListQuery<PriceHistoryFilters>) {
    if (!actor.canSeeCost) throw PurchasingErrors.priceHistoryNeedsCost();
    return this.store.priceHistory(q);
  }

  /** Daily digest of overdue POs (worker, 09:00 Asia/Dhaka). */
  async overdueDigest(): Promise<{ purchaseOrders: number; emailed: number }> {
    const today = this.today();
    const pos = (await this.store.overdue(today)).filter((p) => OPEN.includes(p.status as PoStatus));
    if (!pos.length) return { purchaseOrders: 0, emailed: 0 };
    return { purchaseOrders: pos.length, emailed: await (this.d.notifier ?? noNotifier).overdueDigest(pos, today) };
  }
}
