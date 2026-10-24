"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import type { ReceivableDto, ReceivableSummaryDto } from "../../purchases/_components/types";
import { ProductPicker } from "./ProductPicker";
import {
  CHARGE_TYPES,
  ENTRY_TYPE_META,
  formatAmount,
  formatQty,
  newKey,
  TYPE_GROUPS,
  type CustomerDto,
  type EntryDto,
  type EntryType,
  type ProductOption,
  type StockCaps,
  type SupplierDto,
  type WarehouseDto,
} from "./types";
import styles from "./stock.module.css";

interface Line {
  key: string;
  product: ProductOption | null;
  qty: string;
  unitPrice: string;
  condition: "GOOD" | "DAMAGED";
  serials: string;
  originalLineId: string | null;
  /** Receiving against a PO: the PO line (its price is applied server-side). */
  poLineId: string | null;
}

interface Charge {
  key: string;
  type: (typeof CHARGE_TYPES)[number][0];
  mode: "PERCENT_OF_GOODS" | "AMOUNT_BDT";
  value: string;
  includeInCost: boolean;
  label: string;
}

interface Calc {
  nextNumber: string;
  postingMode: "POSTED_IMMEDIATELY" | "DISPATCHED_IMMEDIATELY" | "PENDING_VERIFICATION";
  lines: { available: string; insufficient: boolean; unitPrice?: string; amount?: string; unitCostBdt?: string; landedUnitCost?: string | null; costAmount?: string; belowCost: boolean; avgCostBefore?: string }[];
  charges: { amountBdt?: string }[];
  totals: Record<string, string | null | undefined>;
  warnings: { line: number | null; code: string; message: string }[];
}

type Header = Record<string, string>;

const HEADER_FIELDS = [
  "poNumberText",
  "supplierInvoiceNo",
  "lcNo",
  "billOfEntryNo",
  "challanNo",
  "siteAddress",
  "receivedBy",
  "vehicle",
  "reason",
  "description",
  "customerPhone",
  "customerAddress",
  "notes",
] as const;

const CONDITION_TYPES: EntryType[] = ["RETURN_FROM_SITE", "DAMAGE_WRITE_OFF", "RETURN_TO_SUPPLIER"];
const OUT_SERIAL_TYPES: EntryType[] = ["ISSUE_TO_PROJECT", "SALE", "RETURN_TO_SUPPLIER", "DAMAGE_WRITE_OFF", "TRANSFER"];

let lineSeq = 0;
const emptyLine = (): Line => ({ key: `l${++lineSeq}`, product: null, qty: "", unitPrice: "", condition: "GOOD", serials: "", originalLineId: null, poLineId: null });
const GRN_TYPES: EntryType[] = ["GRN_LOCAL", "GRN_IMPORT"];
const trimZeros = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
const parseSerials = (s: string) => s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

function fromEntry(e: EntryDto): { header: Header; lines: Line[]; charges: Charge[] } {
  const header: Header = {
    entryDate: e.entryDate,
    warehouseId: e.warehouse.id,
    toWarehouseId: e.toWarehouse?.id ?? "",
    supplierId: e.supplier?.id ?? "",
    customerId: e.customer?.id ?? "",
    projectId: e.project?.id ?? "",
    originalEntryId: e.originalEntry?.id ?? "",
    currency: e.currency,
    exchangeRate: e.exchangeRate,
    discountAmount: e.discountAmount === "0.00" ? "" : e.discountAmount,
    vatPercent: e.vatPercent,
    notes: e.notes ?? "",
  };
  for (const f of HEADER_FIELDS) if (f !== "notes") header[f] = (e.references as Record<string, string | null>)[f] ?? "";
  return {
    header,
    lines: e.lines.map((l) => ({
      key: `l${++lineSeq}`,
      product: { id: l.product.id, code: l.product.code, name: l.product.name, model: null, unit: { code: l.product.unitCode }, sellingPrice: "", trackSerial: l.product.trackSerial, status: "ACTIVE" },
      qty: String(l.qty).includes(".") ? String(l.qty).replace(/\.?0+$/, "") : String(l.qty),
      unitPrice: "unitPrice" in l && l.unitPrice ? String(l.unitPrice) : "",
      condition: l.condition,
      serials: l.serials.map((s) => s.serial).join("\n"),
      originalLineId: l.originalLineId,
      poLineId: l.purchaseOrderLineId,
    })),
    charges: e.charges.map((c) => ({ key: c.id, type: c.type as Charge["type"], mode: c.mode as Charge["mode"], value: "value" in c && c.value ? String(c.value) : "", includeInCost: c.includeInCost, label: c.label ?? "" })),
  };
}

interface Props {
  caps: StockCaps;
  warehouses: WarehouseDto[];
  /** Editing a draft or rejected entry. */
  entry?: EntryDto;
  defaultVat: string;
  /** Receive against this purchase order (from "Receive goods" on the PO: /stock?tab=new&po=…). */
  initialPoId?: string;
  /** Query-param prefill (e.g. "Issue material" on a project: ?type=ISSUE_TO_PROJECT&project=…&warehouse=…). */
  prefill?: { type?: EntryType; projectId?: string; warehouseId?: string };
}

/** GET projects/options: just what this form needs. */
interface ProjectOption {
  id: string;
  code: string;
  name: string;
  status: string;
  defaultWarehouse: { id: string; code: string; name: string } | null;
}

export function EntryForm({ caps, warehouses, entry, defaultVat, initialPoId, prefill }: Props) {
  const router = useRouter();
  const myWarehouses = warehouses.filter((w) => caps.warehouseIds.includes(w.id) && w.isActive);
  const initial = useMemo(() => (entry ? fromEntry(entry) : null), [entry]);
  const [type, setType] = useState<EntryType>((entry?.type as EntryType) ?? prefill?.type ?? "GRN_LOCAL");
  const [header, setHeader] = useState<Header>(
    initial?.header ?? {
      entryDate: today(),
      warehouseId: (prefill?.warehouseId && myWarehouses.some((w) => w.id === prefill.warehouseId) ? prefill.warehouseId : myWarehouses[0]?.id) ?? "",
      projectId: prefill?.projectId ?? "",
      currency: "USD",
      exchangeRate: "",
      vatPercent: defaultVat,
    },
  );
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [emptyLine()]);
  const [charges, setCharges] = useState<Charge[]>(initial?.charges ?? []);
  const [confirmBelowCost, setConfirmBelowCost] = useState(false);
  const [calc, setCalc] = useState<Calc | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [originals, setOriginals] = useState<EntryDto[]>([]);
  const [serialOptions, setSerialOptions] = useState<Record<string, string[]>>({});
  const keyRef = useRef<string>(newKey());
  const [activeCounts, setActiveCounts] = useState<{ id: string; number: string; status: string }[]>([]);
  const [po, setPo] = useState<ReceivableDto | null>(null);
  const [poOptions, setPoOptions] = useState<ReceivableSummaryDto[]>([]);
  const [poError, setPoError] = useState<string | null>(null);

  /** Links the GRN to a PO: type, warehouse, supplier and currency follow the PO; lines default to what is still due. */
  const linkPo = useCallback(async (id: string, keepLines = false) => {
    setPoError(null);
    try {
      const r = (await api<{ data: ReceivableDto }>(`/purchase-orders/${id}/receivable`)).data;
      if (!keepLines && !r.receivable) return setPoError(`${r.number} can't be received against (${r.status.replace(/_/g, " ").toLowerCase()}).`);
      setPo(r);
      setType(r.grnType as EntryType);
      setHeader((h) => ({
        ...h,
        warehouseId: r.warehouse.id,
        supplierId: r.supplier.id,
        currency: r.currency,
        exchangeRate: h.exchangeRate || (Number(r.exchangeRate) ? trimZeros(r.exchangeRate) : ""),
        poNumberText: r.number ?? "",
      }));
      if (!keepLines) {
        const due = r.lines.filter((l) => Number(l.remainingQty) > 0);
        setLines(
          due.length
            ? due.map((l) => ({
                ...emptyLine(),
                product: { id: l.product.id, code: l.product.code, name: l.product.name, model: null, unit: { code: l.product.unitCode }, sellingPrice: "", trackSerial: l.product.trackSerial, status: l.product.status },
                qty: trimZeros(l.remainingQty),
                poLineId: l.purchaseOrderLineId,
              }))
            : [emptyLine()],
        );
      }
    } catch (err) {
      setPoError(errorMessage(err));
    }
  }, []);

  const unlinkPo = () => {
    setPo(null);
    setHeader((h) => ({ ...h, poNumberText: "" }));
    setLines((ls) => ls.map((l) => ({ ...l, poLineId: null })));
  };

  useEffect(() => {
    if (entry?.purchaseOrder) void linkPo(entry.purchaseOrder.id, true);
    else if (initialPoId) void linkPo(initialPoId);
  }, [entry, initialPoId, linkPo]);

  // Open POs this GRN could be received against (no prices in this list).
  useEffect(() => {
    if (!GRN_TYPES.includes(type) || po || !header.warehouseId) return setPoOptions([]);
    api<{ data: ReceivableSummaryDto[] }>("/purchase-orders/receivable", { query: { warehouseId: header.warehouseId, supplierId: header.supplierId || undefined, type: type === "GRN_IMPORT" ? "IMPORTED" : "LOCAL", pageSize: 50 } })
      .then((r) => setPoOptions(r.data))
      .catch(() => setPoOptions([]));
  }, [type, po, header.warehouseId, header.supplierId]);

  // Warn when the chosen warehouse has a stock count in progress (its products are frozen).
  useEffect(() => {
    if (!header.warehouseId) return setActiveCounts([]);
    api<{ data: { id: string; number: string; status: string }[] }>("/stock-counts", { query: { warehouseId: header.warehouseId, active: "true", pageSize: 10 } })
      .then((r) => setActiveCounts(r.data))
      .catch(() => setActiveCounts([]));
  }, [header.warehouseId]);

  const meta = ENTRY_TYPE_META[type];
  const needs = {
    supplier: ["GRN_IMPORT", "GRN_LOCAL", "RETURN_TO_SUPPLIER"].includes(type),
    customer: type === "SALE",
    project: ["ISSUE_TO_PROJECT", "RETURN_FROM_SITE"].includes(type),
    toWarehouse: type === "TRANSFER",
    original: ["RETURN_FROM_SITE", "RETURN_TO_SUPPLIER"].includes(type),
    price: meta.price !== "AUTO",
    condition: CONDITION_TYPES.includes(type),
    charges: type === "GRN_IMPORT",
  };
  const set = (k: string, v: string) => setHeader((h) => ({ ...h, [k]: v }));

  useEffect(() => {
    api<{ data: SupplierDto[] }>("/suppliers", { query: { active: "true", pageSize: 100 } }).then((r) => setSuppliers(r.data)).catch(() => undefined);
    api<{ data: CustomerDto[] }>("/customers", { query: { active: "true", pageSize: 100 } }).then((r) => setCustomers(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (type !== "ISSUE_TO_PROJECT" && type !== "RETURN_FROM_SITE") return;
    api<{ data: ProjectOption[] }>("/projects/options", { query: { type } })
      .then((r) => setProjects(r.data))
      .catch(() => setProjects([]));
  }, [type]);

  // Original entry choices for returns (posted issues to the project / GRNs from the supplier).
  const partyId = type === "RETURN_FROM_SITE" ? header.projectId : type === "RETURN_TO_SUPPLIER" ? header.supplierId : "";
  useEffect(() => {
    if (!needs.original || !partyId) return setOriginals([]);
    const query = type === "RETURN_FROM_SITE" ? { type: "ISSUE_TO_PROJECT", status: "POSTED", projectId: partyId, pageSize: 50 } : { status: "POSTED", supplierId: partyId, pageSize: 50 };
    api<{ data: EntryDto[] }>("/stock-entries", { query })
      .then((r) => setOriginals(r.data.filter((e) => e.type !== "REVERSAL" && (type === "RETURN_FROM_SITE" || e.type.startsWith("GRN")))))
      .catch(() => setOriginals([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, partyId]);

  // Serials in stock at the source warehouse, for outgoing serial-tracked lines.
  const serialProducts = lines.filter((l) => l.product?.trackSerial).map((l) => l.product!.id).join(",");
  useEffect(() => {
    if (!OUT_SERIAL_TYPES.includes(type) || !header.warehouseId || !serialProducts) return;
    const ids = [...new Set(serialProducts.split(","))];
    Promise.all(
      ids.map((productId) =>
        api<{ data: { serial: string }[] }>("/serials", { query: { productId, warehouseId: header.warehouseId, status: lines.find((l) => l.product?.id === productId)?.condition === "DAMAGED" ? "DAMAGED" : "IN_STOCK", pageSize: 100 } })
          .then((r) => [productId, r.data.map((s) => s.serial)] as const)
          .catch(() => [productId, []] as const),
      ),
    ).then((rows) => setSerialOptions(Object.fromEntries(rows)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, header.warehouseId, serialProducts]);

  const payload = useCallback(() => {
    const body: Record<string, unknown> = {
      type,
      entryDate: header.entryDate || undefined,
      warehouseId: header.warehouseId,
      toWarehouseId: needs.toWarehouse ? header.toWarehouseId || null : null,
      supplierId: needs.supplier ? header.supplierId || null : null,
      customerId: needs.customer ? header.customerId || null : null,
      projectId: needs.project ? header.projectId || null : null,
      originalEntryId: needs.original ? header.originalEntryId || null : null,
      ...(po ? { purchaseOrderId: po.purchaseOrderId } : {}),
      lines: lines
        .filter((l) => l.product)
        .map((l) => ({
          productId: l.product!.id,
          qty: l.qty || "0",
          // Against a PO the server takes the PO price; no client price is sent.
          ...(po ? (l.poLineId ? { purchaseOrderLineId: l.poLineId } : {}) : needs.price && l.unitPrice !== "" ? { unitPrice: l.unitPrice } : {}),
          ...(needs.condition ? { condition: l.condition } : {}),
          ...(l.product!.trackSerial ? { serials: parseSerials(l.serials) } : {}),
          ...(l.originalLineId && header.originalEntryId ? { originalLineId: l.originalLineId } : {}),
        })),
      charges: needs.charges ? charges.filter((c) => c.value !== "").map(({ key: _k, label, ...c }) => ({ ...c, label: label || null })) : [],
    };
    for (const f of HEADER_FIELDS) body[f] = header[f]?.trim() ? header[f]!.trim() : null;
    if (type === "GRN_IMPORT") Object.assign(body, { currency: header.currency, exchangeRate: header.exchangeRate || undefined });
    if (type === "SALE") Object.assign(body, { discountAmount: header.discountAmount || "0", vatPercent: header.vatPercent || undefined });
    return body;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, header, lines, charges, po]);

  // Live calculation (debounced): totals, costs, availability, warnings.
  useEffect(() => {
    const body = payload();
    if (!body.warehouseId || !(body.lines as unknown[]).length) return setCalc(null);
    if (type === "GRN_IMPORT" && !header.exchangeRate) return setCalc(null);
    const t = setTimeout(() => {
      api<{ data: Calc }>("/stock-entries/calculate", { method: "POST", body })
        .then((r) => {
          setCalc(r.data);
          setCalcError(null);
        })
        .catch((err) => {
          setCalc(null);
          setCalcError(err instanceof ApiError && err.status === 400 ? null : errorMessage(err));
        });
    }, 350);
    return () => clearTimeout(t);
  }, [payload, type, header.exchangeRate]);

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save(action: "draft" | "submit" | "post") {
    setSaving(action);
    setErrors({});
    setFormError(null);
    const body = payload();
    try {
      let saved: EntryDto;
      if (entry) {
        saved = (await api<{ data: EntryDto }>(`/stock-entries/${entry.id}`, { method: "PATCH", body })).data;
        if (action !== "draft") {
          saved = (await api<{ data: EntryDto }>(`/stock-entries/${entry.id}/${action}`, { method: "POST", body: confirmBelowCost ? { confirmBelowCost: true } : {}, headers: { "Idempotency-Key": keyRef.current } })).data;
        }
      } else {
        saved = (await api<{ data: EntryDto }>("/stock-entries", { method: "POST", body: { action, ...body, ...(confirmBelowCost ? { confirmBelowCost: true } : {}) }, headers: { "Idempotency-Key": keyRef.current } })).data;
      }
      router.push(`/stock/${saved.id}?saved=${action}`);
      router.refresh();
    } catch (err) {
      keyRef.current = newKey(); // the request failed: the next attempt is a new action
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError(errorMessage(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  const belowCost = calc?.warnings.some((w) => w.code === "BELOW_COST") ?? false;
  const blocking = calc?.warnings.some((w) => ["INSUFFICIENT_STOCK", "SERIAL_COUNT", "OVER_RECEIPT"].includes(w.code)) ?? false;
  // The server matches by PO line, else by product.
  const poLine = (l: Line) => (po ? po.lines.find((x) => (l.poLineId ? x.purchaseOrderLineId === l.poLineId : x.product.id === l.product?.id)) : undefined);
  const postLabel = calc?.postingMode === "DISPATCHED_IMMEDIATELY" ? "Dispatch" : "Post";
  const canPostDirect = caps.canFull && calc?.postingMode !== "PENDING_VERIFICATION";
  const priceLabel = meta.price === "COST_FOREIGN" ? `Unit price (${header.currency || "foreign"})` : meta.price === "SELLING" ? "Selling price (৳)" : "Unit cost (৳)";
  const t = calc?.totals ?? {};

  return (
    <div className={styles.stack}>
      {activeCounts.length ? (
        <Notification kind="warning" title="Stock count in progress">
          {activeCounts.map((c, i) => (
            <span key={c.id}>
              {i ? ", " : ""}
              <a href={`/stock/counts/${c.id}`}>{c.number}</a>
            </span>
          ))}{" "}
          is counting this warehouse. Entries for the counted products can&apos;t be posted until the count is approved or cancelled.
        </Notification>
      ) : null}
      {formError ? (
        <Notification kind="error" title="Couldn't save the entry" onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}
      {poError ? (
        <Notification kind="error" title="Purchase order" onClose={() => setPoError(null)}>
          {poError}
        </Notification>
      ) : null}
      {po ? (
        <Notification kind="info" title={`Receiving against ${po.number}`}>
          <div className={styles.banner} style={{ marginBottom: 0 }}>
            <span>
              {po.supplier.name} → {po.warehouse.name}. Quantities default to what is still due; prices come from the purchase order
              {type === "GRN_IMPORT" ? " (landed costs are added at verification)" : ""}. You can&apos;t receive more than ordered.
            </span>
            <span className={styles.footerActions}>
              <a href={`/purchases/${po.purchaseOrderId}`} target="_blank" rel="noopener noreferrer">
                Open PO
              </a>
              {!entry ? (
                <Button kind="ghost" size="sm" onClick={unlinkPo}>
                  Unlink PO
                </Button>
              ) : null}
            </span>
          </div>
        </Notification>
      ) : null}

      <section className={styles.section} aria-labelledby="entry-type">
        <div className={styles.sectionHead}>
          <h2 id="entry-type" className={styles.sectionTitle}>
            Entry type
          </h2>
          {calc ? <span className={styles.muted}>Next number: <span className={styles.mono}>{calc.nextNumber}</span></span> : null}
        </div>
        <div className={styles.typeGroups} role="radiogroup" aria-labelledby="entry-type">
          {TYPE_GROUPS.map((g) => (
            <div key={g.label}>
              <div className={styles.typeGroupLabel}>{g.label}</div>
              <div className={styles.typeList}>
                {g.types
                  .filter((tp) => tp !== "OPENING" || caps.canFull)
                  .map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      role="radio"
                      aria-checked={type === tp}
                      disabled={(!!entry && entry.type !== tp) || (!!po && type !== tp)}
                      className={`${styles.typeOption} ${type === tp ? styles.typeSelected : ""}`}
                      onClick={() => {
                        setType(tp);
                        setConfirmBelowCost(false);
                      }}
                    >
                      {ENTRY_TYPE_META[tp].label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="entry-details">
        <h2 id="entry-details" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Details
        </h2>
        <div className={styles.grid}>
          <TextField label="Date" type="date" max={today()} value={header.entryDate ?? ""} onChange={(e) => set("entryDate", e.target.value)} error={errors.entryDate} />
          <SelectField label={type === "TRANSFER" ? "From warehouse" : "Warehouse"} value={header.warehouseId ?? ""} onChange={(e) => set("warehouseId", e.target.value)} error={errors.warehouseId} disabled={!!po} helper={po ? "The PO's delivery warehouse." : undefined}>
            {myWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          {needs.toWarehouse ? (
            <SelectField label="To warehouse" value={header.toWarehouseId ?? ""} onChange={(e) => set("toWarehouseId", e.target.value)} error={errors.toWarehouseId}>
              <option value="">Choose…</option>
              {warehouses
                .filter((w) => w.isActive && w.id !== header.warehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </SelectField>
          ) : null}
          {needs.supplier ? (
            <SelectField
              label="Supplier"
              value={header.supplierId ?? ""}
              onChange={(e) => {
                set("supplierId", e.target.value);
                const s = suppliers.find((x) => x.id === e.target.value);
                if (s && type === "GRN_IMPORT" && s.currency !== "BDT") set("currency", s.currency);
              }}
              error={errors.supplierId}
              disabled={!!po}
            >
              <option value="">Choose…</option>
              {suppliers
                .filter((s) => type !== "GRN_IMPORT" || s.type === "FOREIGN" || s.id === header.supplierId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              {po && !suppliers.some((s) => s.id === po.supplier.id) ? <option value={po.supplier.id}>{po.supplier.name}</option> : null}
            </SelectField>
          ) : null}
          {GRN_TYPES.includes(type) && !po ? (
            <SelectField
              label="Purchase order (optional)"
              value=""
              onChange={(e) => e.target.value && void linkPo(e.target.value)}
              error={errors.purchaseOrderId}
              helper={poOptions.length ? "Receive against an approved PO: quantities and prices are filled from it." : "No open purchase orders for this warehouse" + (header.supplierId ? " and supplier." : ".")}
            >
              <option value="">Not against a PO</option>
              {poOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} · {o.supplier.name} · {formatQty(o.remainingQty)} due
                </option>
              ))}
            </SelectField>
          ) : null}
          {needs.customer ? (
            <SelectField
              label="Customer"
              value={header.customerId ?? ""}
              onChange={(e) => {
                set("customerId", e.target.value);
                const c = customers.find((x) => x.id === e.target.value);
                if (c && !header.customerPhone) set("customerPhone", c.phone ?? "");
                if (c && !header.customerAddress) set("customerAddress", c.address ?? "");
              }}
              error={errors.customerId}
            >
              <option value="">Choose…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          ) : null}
          {needs.project ? (
            <SelectField
              label="Project"
              value={header.projectId ?? ""}
              onChange={(e) => {
                set("projectId", e.target.value);
                // New entries take the project's supplying warehouse when it is one of mine.
                const p = projects.find((x) => x.id === e.target.value);
                if (!entry && p?.defaultWarehouse && myWarehouses.some((w) => w.id === p.defaultWarehouse!.id)) set("warehouseId", p.defaultWarehouse.id);
              }}
              error={errors.projectId}
              helper={type === "ISSUE_TO_PROJECT" ? "Planning or running projects only." : "Not for closed projects."}
            >
              <option value="">Choose…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
              {entry?.project && !projects.some((p) => p.id === entry.project!.id) ? (
                <option value={entry.project.id}>
                  {entry.project.code} — {entry.project.name}
                </option>
              ) : null}
            </SelectField>
          ) : null}
          {needs.original ? (
            <SelectField
              label={type === "RETURN_FROM_SITE" ? "Original issue (optional)" : "Original GRN (optional)"}
              value={header.originalEntryId ?? ""}
              onChange={(e) => {
                set("originalEntryId", e.target.value);
                setLines((ls) => ls.map((l) => ({ ...l, originalLineId: null })));
              }}
              error={errors.originalEntryId}
              helper={type === "RETURN_FROM_SITE" ? "Returns are valued at the original issue's cost." : undefined}
            >
              <option value="">None</option>
              {originals.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} · {o.entryDate}
                </option>
              ))}
            </SelectField>
          ) : null}
          {type === "GRN_IMPORT" ? (
            <>
              <SelectField label="Currency" value={header.currency ?? "USD"} onChange={(e) => set("currency", e.target.value)} error={errors.currency} disabled={!!po}>
                {["USD", "EUR", "CNY", "MYR", "THB", "BDT"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </SelectField>
              <TextField
                label="Exchange rate (৳ per unit)"
                inputMode="decimal"
                value={header.exchangeRate ?? ""}
                onChange={(e) => set("exchangeRate", e.target.value)}
                error={errors.exchangeRate}
                placeholder="122.50"
                disabled={!!po && !caps.seeCost}
                helper={po ? (caps.seeCost ? "From the PO; change it to the customs rate if known." : "From the PO. The verifier sets the customs rate.") : undefined}
              />
              <TextField label="LC number" value={header.lcNo ?? ""} onChange={(e) => set("lcNo", e.target.value)} />
              <TextField label="Bill of entry no." value={header.billOfEntryNo ?? ""} onChange={(e) => set("billOfEntryNo", e.target.value)} />
            </>
          ) : null}
          {["GRN_IMPORT", "GRN_LOCAL"].includes(type) ? (
            <>
              <TextField label="PO number" value={header.poNumberText ?? ""} onChange={(e) => set("poNumberText", e.target.value)} disabled={!!po} helper={po ? undefined : "Free text, for POs outside the system."} />
              <TextField label="Supplier invoice no." value={header.supplierInvoiceNo ?? ""} onChange={(e) => set("supplierInvoiceNo", e.target.value)} />
            </>
          ) : null}
          {["GRN_LOCAL", "ISSUE_TO_PROJECT", "SALE", "TRANSFER", "RETURN_TO_SUPPLIER"].includes(type) ? (
            <TextField label="Challan no." value={header.challanNo ?? ""} onChange={(e) => set("challanNo", e.target.value)} />
          ) : null}
          {type === "ISSUE_TO_PROJECT" ? <TextField label="Site address" value={header.siteAddress ?? ""} onChange={(e) => set("siteAddress", e.target.value)} /> : null}
          {["ISSUE_TO_PROJECT", "RETURN_FROM_SITE"].includes(type) ? (
            <TextField label={type === "ISSUE_TO_PROJECT" ? "Received by (site)" : "Returned by"} value={header.receivedBy ?? ""} onChange={(e) => set("receivedBy", e.target.value)} />
          ) : null}
          {["ISSUE_TO_PROJECT", "SALE", "TRANSFER"].includes(type) ? <TextField label="Vehicle" value={header.vehicle ?? ""} onChange={(e) => set("vehicle", e.target.value)} placeholder="DHA-METRO-11-2233" /> : null}
          {type === "SALE" ? (
            <>
              <TextField label="Customer phone" value={header.customerPhone ?? ""} onChange={(e) => set("customerPhone", e.target.value)} />
              <TextField label="Delivery address" value={header.customerAddress ?? ""} onChange={(e) => set("customerAddress", e.target.value)} />
              <TextField label="Discount (৳)" inputMode="decimal" value={header.discountAmount ?? ""} onChange={(e) => set("discountAmount", e.target.value)} error={errors.discountAmount} />
              <TextField label="VAT %" inputMode="decimal" value={header.vatPercent ?? ""} onChange={(e) => set("vatPercent", e.target.value)} error={errors.vatPercent} />
            </>
          ) : null}
          {["DAMAGE_WRITE_OFF", "RETURN_TO_SUPPLIER", "RETURN_FROM_SITE"].includes(type) ? (
            <TextField label={type === "DAMAGE_WRITE_OFF" ? "Reason (required)" : "Reason"} value={header.reason ?? ""} onChange={(e) => set("reason", e.target.value)} error={errors.reason} fieldClassName={styles.full} />
          ) : null}
          {type === "OPENING" ? <TextField label="Description" value={header.description ?? ""} onChange={(e) => set("description", e.target.value)} fieldClassName={styles.full} /> : null}
          <TextAreaField label="Notes" rows={2} value={header.notes ?? ""} onChange={(e) => set("notes", e.target.value)} fieldClassName={styles.full} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="entry-lines">
        <div className={styles.sectionHead}>
          <h2 id="entry-lines" className={styles.sectionTitle}>
            Products
          </h2>
          {errors.lines ? <span className={styles.negative}>{errors.lines}</span> : null}
        </div>
        <div className={styles.linesWrap}>
          <table className={styles.lines}>
            <thead>
              <tr>
                <th style={{ width: "36%" }}>Product</th>
                <th className={styles.right}>Qty</th>
                {needs.price ? <th className={styles.right}>{priceLabel}</th> : null}
                {needs.condition ? <th>Condition</th> : null}
                {caps.seeCost || type === "SALE" ? <th className={styles.right}>{type === "SALE" ? "Amount" : "Cost"}</th> : null}
                <th>
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const c = calc?.lines[lines.filter((x, j) => x.product && j < i).length];
                const lc = l.product ? c : undefined;
                const serials = parseSerials(l.serials);
                const options = serialOptions[l.product?.id ?? ""] ?? [];
                const original = originals.find((o) => o.id === header.originalEntryId);
                return (
                  <tr key={l.key}>
                    <td>
                      <ProductPicker
                        value={l.product}
                        activeOnly={!["RETURN_FROM_SITE", "RETURN_TO_SUPPLIER", "DAMAGE_WRITE_OFF", "TRANSFER"].includes(type)}
                        onChange={(p) => updateLine(l.key, { product: p, unitPrice: p && type === "SALE" ? p.sellingPrice : l.unitPrice, serials: "" })}
                      />
                      {lc && OUT_SERIAL_TYPES.concat("TRANSFER").includes(type) ? (
                        <div className={lc.insufficient ? styles.lineWarn : styles.lineMeta}>
                          Available: {formatQty(lc.available)} {l.product?.unit.code}
                          {caps.seeCost && lc.unitCostBdt ? ` · avg cost ${formatMoney(lc.unitCostBdt)}` : ""}
                        </div>
                      ) : null}
                      {poLine(l) ? (
                        <div className={styles.lineMeta}>
                          PO line: ordered {formatQty(poLine(l)!.orderedQty)} · received {formatQty(poLine(l)!.receivedQty)}
                          {Number(poLine(l)!.pendingReceiptQty) ? ` · pending ${formatQty(poLine(l)!.pendingReceiptQty)}` : ""} · due {formatQty(poLine(l)!.remainingQty)}
                        </div>
                      ) : po && l.product ? (
                        <div className={styles.lineWarn}>Not on {po.number}: it will be refused.</div>
                      ) : null}
                      {lc?.belowCost ? <div className={styles.lineWarn}>Below average cost{caps.seeCost && lc.avgCostBefore ? ` (${formatMoney(lc.avgCostBefore)})` : ""}.</div> : null}
                      {original && l.product ? (
                        <SelectField
                          label="Original line"
                          value={l.originalLineId ?? ""}
                          onChange={(e) => updateLine(l.key, { originalLineId: e.target.value || null })}
                          fieldClassName={styles.serialBox}
                        >
                          <option value="">Match automatically</option>
                          {original.lines
                            .filter((ol) => ol.product.id === l.product!.id)
                            .map((ol) => (
                              <option key={ol.id} value={ol.id}>
                                Line {ol.lineNo} · {formatQty(ol.qty)}
                              </option>
                            ))}
                        </SelectField>
                      ) : null}
                      {l.product?.trackSerial ? (
                        <div className={styles.serialBox}>
                          <TextAreaField
                            label={`Serial numbers (${serials.length} of ${l.qty || 0})`}
                            rows={2}
                            value={l.serials}
                            onChange={(e) => updateLine(l.key, { serials: e.target.value })}
                            helper="One per line, or separated by commas. Scanners work here."
                          />
                          {options.length ? (
                            <div className={styles.chips} aria-label="Serials in stock">
                              {options.slice(0, 40).map((s) => {
                                const on = serials.some((x) => x.toUpperCase() === s);
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                                    aria-pressed={on}
                                    onClick={() => updateLine(l.key, { serials: (on ? serials.filter((x) => x.toUpperCase() !== s) : [...serials, s]).join("\n") })}
                                  >
                                    {s}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className={styles.right}>
                      <input className={styles.cellInput} inputMode="decimal" aria-label={`Quantity, line ${i + 1}`} value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                      {l.product ? <div className={styles.lineMeta}>{l.product.unit.code}</div> : null}
                    </td>
                    {needs.price && po ? (
                      <td className={`${styles.right} ${styles.num}`}>
                        {caps.seeCost && poLine(l)?.unitPrice ? formatAmount(poLine(l)!.unitPrice, type === "GRN_IMPORT" ? po.currency : "BDT") : <span className={styles.muted}>From PO</span>}
                        {type === "GRN_IMPORT" && caps.seeCost && lc?.landedUnitCost ? <div className={styles.lineMeta}>Landed {formatMoney(lc.landedUnitCost)}</div> : null}
                      </td>
                    ) : needs.price ? (
                      <td className={styles.right}>
                        <input className={styles.cellInput} inputMode="decimal" aria-label={`${priceLabel}, line ${i + 1}`} value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} />
                        {type === "GRN_IMPORT" && caps.seeCost && lc?.landedUnitCost ? <div className={styles.lineMeta}>Landed {formatMoney(lc.landedUnitCost)}</div> : null}
                      </td>
                    ) : null}
                    {needs.condition ? (
                      <td>
                        <select className={styles.cellInput} aria-label={`Condition, line ${i + 1}`} value={l.condition} onChange={(e) => updateLine(l.key, { condition: e.target.value as Line["condition"], serials: "" })}>
                          <option value="GOOD">Good</option>
                          <option value="DAMAGED">Damaged</option>
                        </select>
                      </td>
                    ) : null}
                    {caps.seeCost || type === "SALE" ? (
                      <td className={`${styles.right} ${styles.num}`}>{type === "SALE" ? formatMoney(lc?.amount) : formatMoney(lc?.costAmount)}</td>
                    ) : null}
                    <td>
                      <Button kind="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}>
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button kind="secondary" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            + Add product
          </Button>
        </div>
      </section>

      {needs.charges ? (
        <section className={styles.section} aria-labelledby="entry-charges">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="entry-charges" className={styles.sectionTitle}>
                Landed cost charges
              </h2>
              <p className={styles.sectionHelp}>Charges marked “in cost” are spread over the lines by goods value. Others (e.g. adjustable VAT/AIT) are recorded but not added to stock cost.</p>
            </div>
            <Button kind="secondary" size="sm" onClick={() => setCharges((cs) => [...cs, { key: newKey(), type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "", includeInCost: true, label: "" }])}>
              + Add charge
            </Button>
          </div>
          {charges.length ? (
            <div className={styles.linesWrap}>
              <table className={styles.lines}>
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Basis</th>
                    <th className={styles.right}>Value</th>
                    <th>In cost</th>
                    <th className={styles.right}>Amount (৳)</th>
                    <th>
                      <span className="visually-hidden">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c, i) => {
                    const upd = (patch: Partial<Charge>) => setCharges((cs) => cs.map((x) => (x.key === c.key ? { ...x, ...patch } : x)));
                    return (
                      <tr key={c.key}>
                        <td>
                          <select className={styles.cellInput} aria-label={`Charge type ${i + 1}`} value={c.type} onChange={(e) => upd({ type: e.target.value as Charge["type"], includeInCost: !["IMPORT_VAT", "AIT"].includes(e.target.value) })}>
                            {CHARGE_TYPES.map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                          {c.type === "OTHER" ? <input className={styles.cellInput} style={{ marginTop: "var(--space-2)" }} aria-label="Charge label" placeholder="Label" value={c.label} onChange={(e) => upd({ label: e.target.value })} /> : null}
                        </td>
                        <td>
                          <select className={styles.cellInput} aria-label={`Charge basis ${i + 1}`} value={c.mode} onChange={(e) => upd({ mode: e.target.value as Charge["mode"] })}>
                            <option value="PERCENT_OF_GOODS">% of goods</option>
                            <option value="AMOUNT_BDT">Amount ৳</option>
                          </select>
                        </td>
                        <td className={styles.right}>
                          <input className={styles.cellInput} inputMode="decimal" aria-label={`Charge value ${i + 1}`} value={c.value} onChange={(e) => upd({ value: e.target.value })} />
                        </td>
                        <td>
                          <Checkbox label="In cost" checked={c.includeInCost} onChange={(e) => upd({ includeInCost: e.target.checked })} />
                        </td>
                        <td className={`${styles.right} ${styles.num}`}>{formatMoney(calc?.charges[charges.filter((x, j) => x.value !== "" && j < i).length]?.amountBdt)}</td>
                        <td>
                          <Button kind="ghost" size="sm" aria-label={`Remove charge ${i + 1}`} onClick={() => setCharges((cs) => cs.filter((x) => x.key !== c.key))}>
                            ✕
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>No charges yet: stock cost will be the converted goods value.</p>
          )}
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="entry-summary">
        <h2 id="entry-summary" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Summary
        </h2>
        <div className={styles.summary}>
          <div className={styles.stack}>
            {calcError ? <Notification kind="error">{calcError}</Notification> : null}
            {calc?.warnings.length ? (
              <Notification kind="warning" title="Check before saving">
                <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                  {calc.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </Notification>
            ) : null}
            {belowCost && caps.canFull ? <Checkbox label="I confirm this sale below average cost (recorded in the audit log)" checked={confirmBelowCost} onChange={(e) => setConfirmBelowCost(e.target.checked)} /> : null}
            {calc ? (
              <p className={styles.muted}>
                {calc.postingMode === "PENDING_VERIFICATION"
                  ? takesStockLabel(type)
                  : calc.postingMode === "DISPATCHED_IMMEDIATELY"
                    ? "Dispatching moves the stock into transit; the destination warehouse receives it."
                    : "Posting updates stock and cost immediately."}
              </p>
            ) : (
              <p className={styles.muted}>Add products {type === "GRN_IMPORT" ? "and the exchange rate " : ""}to see totals.</p>
            )}
          </div>
          <dl className={styles.totals}>
            {type === "GRN_IMPORT" ? (
              <>
                <dt>Goods ({header.currency})</dt>
                <dd>{formatAmount(sumForeign(lines), header.currency)}</dd>
              </>
            ) : null}
            {t.subtotal !== undefined ? (
              <>
                <dt>{type === "GRN_IMPORT" ? "Goods (৳)" : "Subtotal"}</dt>
                <dd>{formatMoney(t.subtotal)}</dd>
              </>
            ) : null}
            {type === "GRN_IMPORT" && t.chargesIncluded !== undefined ? (
              <>
                <dt>Charges in cost</dt>
                <dd>{formatMoney(t.chargesIncluded)}</dd>
                <dt>Charges not in cost</dt>
                <dd>{formatMoney(t.chargesExcluded)}</dd>
              </>
            ) : null}
            {type === "SALE" ? (
              <>
                <dt>Discount</dt>
                <dd>− {formatMoney(t.discountAmount)}</dd>
                <dt>VAT {t.vatPercent ? `${t.vatPercent}%` : ""}</dt>
                <dd>{formatMoney(t.vatAmount)}</dd>
              </>
            ) : null}
            {t.grandTotal !== undefined && t.grandTotal !== null ? (
              <>
                <dt className={styles.grand}>{type === "SALE" ? "Total" : type === "GRN_IMPORT" ? "Total payable" : "Total"}</dt>
                <dd className={styles.grand}>{formatMoney(t.grandTotal)}</dd>
              </>
            ) : null}
            {caps.seeCost && t.costTotal !== undefined ? (
              <>
                <dt>Stock value</dt>
                <dd>{formatMoney(t.costTotal)}</dd>
              </>
            ) : null}
            {caps.seeProfit && t.profit ? (
              <>
                <dt>Profit</dt>
                <dd className={Number(t.profit) < 0 ? styles.negative : styles.positive}>{formatMoney(t.profit)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </section>

      <div className={styles.footer}>
        <span className={styles.muted}>{entry ? `Editing ${entry.displayNumber}` : "New entry"}</span>
        <div className={styles.footerActions}>
          <Button kind="ghost" onClick={() => router.back()} disabled={!!saving}>
            Cancel
          </Button>
          <Button kind="secondary" onClick={() => save("draft")} disabled={!!saving}>
            {saving === "draft" ? "Saving…" : "Save draft"}
          </Button>
          {canPostDirect ? (
            <>
              {type !== "OPENING" ? (
                <Button kind="secondary" onClick={() => save("submit")} disabled={!!saving || blocking}>
                  {saving === "submit" ? "Submitting…" : "Submit for verification"}
                </Button>
              ) : null}
              <Button onClick={() => save("post")} disabled={!!saving || blocking || (belowCost && !confirmBelowCost)}>
                {saving === "post" ? `${postLabel}ing…` : postLabel}
              </Button>
            </>
          ) : (
            <Button onClick={() => save("submit")} disabled={!!saving || blocking || (belowCost && !caps.canFull)}>
              {saving === "submit" ? "Submitting…" : "Submit for verification"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function takesStockLabel(type: EntryType) {
  const out = ENTRY_TYPE_META[type].direction === "OUT" || type === "TRANSFER";
  return `This entry needs verification by an approver.${out ? " Submitting reserves the stock until it is approved or rejected." : ""}`;
}

/** Foreign goods total, for display only (exact: summed in integer ten-thousandths). */
function sumForeign(lines: Line[]): string {
  let total = 0n;
  for (const l of lines) {
    if (!l.product || !/^\d+(\.\d{1,3})?$/.test(l.qty) || !/^\d+(\.\d{1,4})?$/.test(l.unitPrice)) continue;
    // qty (3 dp) × price (4 dp) = 7 dp; keep 4.
    total += (toScaled(l.qty, 3) * toScaled(l.unitPrice, 4)) / 1000n;
  }
  const s = total.toString().padStart(5, "0");
  return `${s.slice(0, -4)}.${s.slice(-4)}`;
}

function toScaled(v: string, dp: number): bigint {
  const [i, f = ""] = v.split(".");
  return BigInt(`${i}${f.padEnd(dp, "0").slice(0, dp)}`);
}
