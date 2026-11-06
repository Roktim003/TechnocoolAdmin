"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules, sanitize, type Problems } from "@/lib/validation";
import { poTotals } from "@/modules/purchasing/domain/rules";
import { formatMoney } from "@/shared/time/format";
import { ProductPicker } from "../../stock/_components/ProductPicker";
import { formatAmount, newKey, type ProductOption, type WarehouseDto } from "../../stock/_components/types";
import type { PoDetailDto, PurchasesCaps, SupplierDto } from "./types";
import styles from "../../stock/_components/stock.module.css";
import p from "./purchases.module.css";

interface Line {
  key: string;
  product: ProductOption | null;
  qty: string;
  unitPrice: string;
  note: string;
}

interface Calc {
  type: "LOCAL" | "IMPORTED";
  currency: string;
  exchangeRate: string;
  nextNumber: string;
  approvalMode: "CAN_APPROVE" | "NEEDS_APPROVAL";
  lines: { amount?: string; amountBdt?: string }[];
  totals?: { subtotal: string; discountAmount: string; vatPercent: string; vatAmount: string; total: string; totalBdt: string };
  warnings: { line: number | null; code: string; message: string }[];
}

type Header = Record<string, string>;

let lineSeq = 0;
const emptyLine = (): Line => ({ key: `p${++lineSeq}`, product: null, qty: "", unitPrice: "", note: "" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
const trimZeros = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);
const nul = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

type Action = "draft" | "submit" | "approve";

/** Unit prices / exchange rates (Price4Schema): up to 10 digits and 4 decimals. */
export const price4 = (v: string | null | undefined, positive = false) =>
  rules.rate(v, { positive }) ?? (v && v.trim().replace(/,/g, "").split(".")[0]!.length > 10 ? "Use at most 10 digits before the decimal point." : undefined);

/** Two-decimal amount strings ("1500.00") compared exactly, without floats. */
const cents = (v: string) => BigInt(v.replace(".", ""));

const LABELS: Record<string, string> = {
  supplierId: "Supplier",
  supplierQuoteRef: "Supplier quote ref.",
  poDate: "PO date",
  expectedDeliveryDate: "Expected delivery",
  deliverToWarehouseId: "Deliver to warehouse",
  projectId: "Project",
  exchangeRate: "Exchange rate",
  discountAmount: "Discount",
  vatPercent: "VAT %",
  terms: "Terms & conditions",
  notes: "Internal notes",
  lines: "Products",
};
const LINE_FIELD: Record<string, string> = { product: "product", qty: "quantity", unitPrice: "unit price", note: "note" };

function fromPo(po: PoDetailDto): { header: Header; lines: Line[] } {
  return {
    header: {
      supplierId: po.supplier.id,
      poDate: po.poDate,
      expectedDeliveryDate: po.expectedDeliveryDate ?? "",
      deliverToWarehouseId: po.deliverTo.id,
      projectId: po.project?.id ?? "",
      supplierQuoteRef: po.supplierQuoteRef ?? "",
      exchangeRate: po.exchangeRate === "0" || Number(po.exchangeRate) === 0 ? "" : trimZeros(po.exchangeRate),
      discountAmount: po.discountAmount && Number(po.discountAmount) ? po.discountAmount : "",
      vatPercent: trimZeros(po.vatPercent),
      terms: po.terms ?? "",
      notes: po.notes ?? "",
    },
    lines: po.lines.map((l) => ({
      key: `p${++lineSeq}`,
      product: { id: l.product.id, code: l.product.code, name: l.product.name, model: null, unit: { code: l.product.unitCode }, sellingPrice: "", trackSerial: l.product.trackSerial, status: l.product.status },
      qty: trimZeros(l.qty),
      unitPrice: l.unitPrice ? trimZeros(l.unitPrice) : "",
      note: l.note ?? "",
    })),
  };
}

interface Props {
  caps: PurchasesCaps;
  warehouses: WarehouseDto[];
  defaults: { terms: string | null; vatPercent: string };
  /** Editing a draft or rejected PO. */
  po?: PoDetailDto;
  initialSupplierId?: string;
}

export function PoForm({ caps, warehouses, defaults, po, initialSupplierId }: Props) {
  const router = useRouter();
  const myWarehouses = warehouses.filter((w) => caps.warehouseIds.includes(w.id) && w.isActive);
  const initial = po ? fromPo(po) : null;
  const [header, setHeader] = useState<Header>(
    initial?.header ?? {
      supplierId: initialSupplierId ?? "",
      poDate: today(),
      expectedDeliveryDate: "",
      deliverToWarehouseId: myWarehouses[0]?.id ?? "",
      projectId: "",
      supplierQuoteRef: "",
      exchangeRate: "",
      discountAmount: "",
      vatPercent: defaults.vatPercent,
      terms: defaults.terms ?? "",
      notes: "",
    },
  );
  const [lines, setLines] = useState<Line[]>(initial?.lines.length ? initial.lines : [emptyLine()]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [projects, setProjects] = useState<{ id: string; code: string; name: string }[]>([]);
  const [calc, setCalc] = useState<Calc | null>(null);
  // Field errors from the server; line errors are keyed `line:<line key>:<field>`.
  const [serverErrors, setErrors] = useState<Record<string, string>>({});
  // The last save the user tried: from then on the form checks itself live and marks what's wrong.
  const [attempt, setAttempt] = useState<Action | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const keyRef = useRef(newKey());

  useEffect(() => {
    api<{ data: SupplierDto[] }>("/suppliers", { query: { isActive: "true", pageSize: 100 } }).then((r) => setSuppliers(r.data)).catch(() => undefined);
    api<{ data: { id: string; code: string; name: string }[] }>("/projects/options").then((r) => setProjects(r.data)).catch(() => undefined);
  }, []);

  const set = (k: string, v: string) => setHeader((h) => ({ ...h, [k]: v }));
  const supplier = suppliers.find((s) => s.id === header.supplierId) ?? (po && po.supplier.id === header.supplierId ? { ...po.supplier, defaultCurrency: po.currency } : undefined);
  const imported = supplier ? supplier.type === "FOREIGN" : po?.type === "IMPORTED";
  const currency = imported ? (calc?.currency ?? supplier?.defaultCurrency ?? "USD") : "BDT";

  const payload = useCallback(() => {
    const body: Record<string, unknown> = {
      supplierId: header.supplierId,
      poDate: header.poDate || undefined,
      expectedDeliveryDate: header.expectedDeliveryDate || undefined,
      deliverToWarehouseId: header.deliverToWarehouseId,
      projectId: header.projectId || null,
      supplierQuoteRef: nul(header.supplierQuoteRef),
      terms: nul(header.terms),
      notes: nul(header.notes),
      lines: lines.filter((l) => l.product).map((l) => ({ productId: l.product!.id, qty: l.qty || "0", unitPrice: l.unitPrice || "0", note: nul(l.note) })),
    };
    if (imported) body.exchangeRate = header.exchangeRate || undefined;
    else Object.assign(body, { discountAmount: header.discountAmount || "0", vatPercent: header.vatPercent || undefined });
    return body;
  }, [header, lines, imported]);

  // Live totals (debounced). Without seeCost the API returns no amounts, only warnings.
  useEffect(() => {
    const body = payload();
    if (!body.supplierId) return setCalc(null);
    const t = setTimeout(() => {
      api<{ data: Calc }>("/purchase-orders/calculate", { method: "POST", body })
        .then((r) => setCalc(r.data))
        .catch(() => setCalc(null));
    }, 350);
    return () => clearTimeout(t);
  }, [payload]);

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Server field errors describe the form as it was sent: drop them once the user edits it
  // (the live check below keeps marking whatever is still wrong).
  useEffect(() => {
    setErrors((e) => (Object.keys(e).length ? {} : e));
  }, [header, lines]);

  /** Local POs: the discount can't be more than the subtotal (same rounding as the server). */
  function discountOver(): string | undefined {
    const discount = header.discountAmount?.trim().replace(/,/g, "");
    const sent = lines.filter((l) => l.product).map((l) => ({ qty: l.qty.trim() || "0", unitPrice: l.unitPrice.trim() || "0" }));
    if (!discount || !/[1-9]/.test(discount) || !sent.length || sent.some((l) => rules.qty(l.qty) || price4(l.unitPrice))) return undefined;
    const t = poTotals({ type: "LOCAL", lines: sent, discountAmount: discount, vatPercent: "0", exchangeRate: "1" });
    return cents(t.discountAmount) > cents(t.subtotal) ? "The discount can't be more than the subtotal." : undefined;
  }

  /**
   * What is missing or wrong, checked in the browser so the user sees every problem at once
   * (the server stops at the first). A draft needs a supplier, warehouse, products and valid
   * numbers; submitting or approving also needs unit prices above 0 and (imported) the rate.
   */
  function check(action: Action): Problems {
    const full = action !== "draft";
    const out = collect(
      ["supplierId", rules.chosen(header.supplierId, "a supplier")],
      ["supplierQuoteRef", rules.maxLength(header.supplierQuoteRef, 100)],
      ["expectedDeliveryDate", rules.notBefore(header.expectedDeliveryDate, header.poDate || today(), "Expected delivery can't be before the PO date.")],
      ["deliverToWarehouseId", rules.chosen(header.deliverToWarehouseId, "the warehouse to deliver to")],
      ["exchangeRate", imported ? (price4(header.exchangeRate, true) ?? (full && !header.exchangeRate?.trim() ? "Enter the exchange rate (needed to submit or approve)." : undefined)) : undefined],
      ["discountAmount", imported ? undefined : (rules.money(header.discountAmount) ?? discountOver())],
      ["vatPercent", imported ? undefined : rules.percent(header.vatPercent)],
      ["terms", rules.maxLength(header.terms, 5000)],
      ["notes", rules.maxLength(header.notes, 2000)],
    );
    const firstLine = new Map<string, number>();
    lines.forEach((l, i) => {
      const k = (f: string) => `line:${l.key}:${f}`;
      if (!l.product) {
        if (l.qty.trim() || l.unitPrice.trim() || l.note.trim()) out[k("product")] = "Choose a product, or remove the line.";
        return;
      }
      const seen = firstLine.get(l.product.id);
      if (seen !== undefined) out[k("product")] = `Already on line ${seen + 1}. Use one line with the total quantity.`;
      else firstLine.set(l.product.id, i);
      const qty = rules.required(l.qty, "a quantity") ?? rules.qty(l.qty, { positive: true });
      if (qty) out[k("qty")] = qty;
      const price = price4(l.unitPrice, full) ?? (full && !l.unitPrice.trim() ? "Enter a unit price greater than 0." : undefined);
      if (price) out[k("unitPrice")] = price;
      const note = rules.maxLength(l.note, 500);
      if (note) out[k("note")] = note;
    });
    if (!lines.some((l) => l.product)) out.lines = "Add at least one product.";
    else if (lines.filter((l) => l.product).length > 200) out.lines = "A PO can have at most 200 products.";
    return out;
  }

  /** Server paths `lines.<n>.<field>` count only lines with a product; map them to the rows on screen. */
  function mapServerErrors(fieldErrors: Record<string, string>): Record<string, string> {
    const sent = lines.filter((l) => l.product);
    const out: Record<string, string> = {};
    for (const [path, message] of Object.entries(fieldErrors)) {
      const m = /^lines\.(\d+)(?:\.(\w+))?/.exec(path);
      const line = m ? sent[Number(m[1])] : undefined;
      if (line) out[`line:${line.key}:${m![2] === "qty" || m![2] === "unitPrice" || m![2] === "note" ? m![2] : "product"}`] = message;
      else out[path] = message;
    }
    return out;
  }

  async function save(action: Action) {
    setAttempt(action);
    setFormError(null);
    if (Object.keys(check(action)).length) {
      revealProblems();
      return;
    }
    setSaving(action);
    setErrors({});
    const body = payload();
    try {
      let id: string;
      if (po) {
        await api(`/purchase-orders/${po.id}`, { method: "PATCH", body });
        if (action !== "draft") await api(`/purchase-orders/${po.id}/${action}`, { method: "POST", headers: { "Idempotency-Key": keyRef.current } });
        id = po.id;
      } else {
        id = (await api<{ data: { id: string } }>("/purchase-orders", { method: "POST", body: { action, ...body }, headers: { "Idempotency-Key": keyRef.current } })).data.id;
      }
      router.push(`/purchases/${id}?saved=${action}`);
      router.refresh();
    } catch (err) {
      keyRef.current = newKey();
      const fields = err instanceof ApiError ? mapServerErrors(err.fieldErrors()) : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setFormError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
      revealProblems();
    } finally {
      setSaving(null);
    }
  }

  const problems = attempt ? check(attempt) : {};
  const errors: Record<string, string> = { ...serverErrors, ...problems };
  const lineError = (l: Line, f: string) => errors[`line:${l.key}:${f}`];
  const labels: Record<string, string> = { ...LABELS };
  lines.forEach((l, i) => {
    for (const [f, name] of Object.entries(LINE_FIELD)) labels[`line:${l.key}:${f}`] = `Line ${i + 1} ${name}`;
  });

  const t = calc?.totals;
  const canApprove = calc?.approvalMode === "CAN_APPROVE" && (!po || po.createdBy.id !== caps.userId || caps.canFull);
  const priceLabel = `Unit price (${currency === "BDT" ? "৳" : currency})`;

  return (
    <div className={styles.stack}>
      {formError ? (
        <Notification kind="error" title="Couldn't save the purchase order" onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}
      <FormProblems problems={problems} labels={labels} />
      {po?.status === "REJECTED" && po.rejectionReason ? (
        <Notification kind="warning" title={`Rejected by ${po.rejectedBy?.name ?? "approver"}`}>
          {po.rejectionReason} — fix it and submit again.
        </Notification>
      ) : null}

      <Step n={1} id="po-supplier" title="Supplier" aside={calc ? <span className={styles.muted}>Number on submit: <span className={styles.mono}>{po?.number ?? calc.nextNumber}</span></span> : null}>
        <div className={styles.grid}>
          <SelectField searchable
            label="Supplier"
            value={header.supplierId}
            onChange={(e) => set("supplierId", e.target.value)}
            error={errors.supplierId}
            helper={supplier ? (imported ? `Foreign supplier: imported PO in ${supplier.defaultCurrency}.` : "Local supplier: PO in ৳ with VAT.") : "Foreign suppliers get imported POs in their currency."}
          >
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
            {po && !suppliers.some((s) => s.id === po.supplier.id) ? <option value={po.supplier.id}>{po.supplier.name}</option> : null}
          </SelectField>
          <TextField label="Supplier quote ref." value={header.supplierQuoteRef ?? ""} onChange={(e) => set("supplierQuoteRef", e.target.value)} error={errors.supplierQuoteRef} />
          <TextField label="PO date" type="date" value={header.poDate ?? ""} onChange={(e) => set("poDate", e.target.value)} error={errors.poDate} />
          <TextField label="Expected delivery" type="date" min={header.poDate} value={header.expectedDeliveryDate ?? ""} onChange={(e) => set("expectedDeliveryDate", e.target.value)} error={errors.expectedDeliveryDate} helper="Shown as overdue after this date." />
        </div>
      </Step>

      <Step n={2} id="po-delivery" title="Delivery">
        <div className={styles.grid}>
          <SelectField searchable label="Deliver to warehouse" value={header.deliverToWarehouseId ?? ""} onChange={(e) => set("deliverToWarehouseId", e.target.value)} error={errors.deliverToWarehouseId}>
            {myWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          <SelectField searchable label="Project (optional)" value={header.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)} error={errors.projectId} helper="For goods bought for a specific project.">
            <option value="">None</option>
            {projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} — {x.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Step>

      <Step n={3} id="po-lines" title="Products" aside={errors.lines ? <span className={styles.negative}>{errors.lines}</span> : null}>
        <div className={styles.linesWrap}>
          <table className={styles.lines}>
            <thead>
              <tr>
                <th style={{ width: "38%" }}>Product</th>
                <th className={styles.right}>Qty</th>
                <th className={styles.right}>{priceLabel}</th>
                {caps.seeCost ? <th className={styles.right}>Amount</th> : null}
                <th>Note</th>
                <th>
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const c = calc?.lines[lines.filter((x, j) => x.product && j < i).length];
                const warn = calc?.warnings.filter((w) => w.line === lines.filter((x, j) => x.product && j < i).length && l.product);
                return (
                  <tr key={l.key}>
                    <td>
                      <ProductPicker
                        value={l.product}
                        onChange={(prod) => {
                          const cost = (prod as (ProductOption & { purchaseCost?: string }) | null)?.purchaseCost;
                          updateLine(l.key, { product: prod, unitPrice: l.unitPrice || (!imported && cost && Number(cost) > 0 ? trimZeros(cost) : "") });
                        }}
                        invalid={!!lineError(l, "product") || (!!errors.lines && i === 0 && !l.product)}
                      />
                      {lineError(l, "product") ? <div className={styles.lineWarn}>{lineError(l, "product")}</div> : null}
                      {warn?.map((w) => (
                        <div key={w.code} className={styles.lineWarn}>
                          {w.message}
                        </div>
                      ))}
                    </td>
                    <td className={styles.right}>
                      <input
                        className={`${styles.cellInput} ${lineError(l, "qty") ? styles.cellInputError : ""}`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Quantity, line ${i + 1}`}
                        aria-invalid={lineError(l, "qty") ? true : undefined}
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: sanitize("qty", e.target.value) })}
                      />
                      {lineError(l, "qty") ? <div className={styles.lineWarn}>{lineError(l, "qty")}</div> : l.product ? <div className={styles.lineMeta}>{l.product.unit.code}</div> : null}
                    </td>
                    <td className={styles.right}>
                      <input
                        className={`${styles.cellInput} ${lineError(l, "unitPrice") ? styles.cellInputError : ""}`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`${priceLabel}, line ${i + 1}`}
                        aria-invalid={lineError(l, "unitPrice") ? true : undefined}
                        value={l.unitPrice}
                        onChange={(e) => updateLine(l.key, { unitPrice: sanitize("rate", e.target.value) })}
                      />
                      {lineError(l, "unitPrice") ? <div className={styles.lineWarn}>{lineError(l, "unitPrice")}</div> : null}
                    </td>
                    {caps.seeCost ? <td className={`${styles.right} ${styles.num}`}>{l.product && c?.amount ? formatAmount(c.amount, currency) : "—"}</td> : null}
                    <td>
                      <input
                        className={`${styles.cellInput} ${lineError(l, "note") ? styles.cellInputError : ""}`}
                        aria-label={`Note, line ${i + 1}`}
                        aria-invalid={lineError(l, "note") ? true : undefined}
                        value={l.note}
                        onChange={(e) => updateLine(l.key, { note: e.target.value })}
                      />
                      {lineError(l, "note") ? <div className={styles.lineWarn}>{lineError(l, "note")}</div> : null}
                    </td>
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
      </Step>

      <Step n={4} id="po-amounts" title="Amounts & terms">
        <div className={styles.summary}>
          <div className={styles.grid}>
            {imported ? (
              <TextField
                label={`Exchange rate (৳ per ${currency})`}
                kind="rate"
                value={header.exchangeRate ?? ""}
                onChange={(e) => set("exchangeRate", e.target.value)}
                error={errors.exchangeRate}
                placeholder="122.50"
                helper="Indicative, for the BDT equivalent. The customs rate is set on the GRN."
              />
            ) : (
              <>
                <TextField label="Discount (৳)" kind="money" value={header.discountAmount ?? ""} onChange={(e) => set("discountAmount", e.target.value)} error={errors.discountAmount} />
                <TextField label="VAT %" kind="percent" value={header.vatPercent ?? ""} onChange={(e) => set("vatPercent", e.target.value)} error={errors.vatPercent} />
              </>
            )}
            <TextAreaField label="Terms & conditions" rows={5} value={header.terms ?? ""} onChange={(e) => set("terms", e.target.value)} error={errors.terms} fieldClassName={styles.full} helper="Printed on the PO." />
            <TextAreaField label="Internal notes" rows={2} value={header.notes ?? ""} onChange={(e) => set("notes", e.target.value)} error={errors.notes} fieldClassName={styles.full} helper="Not printed." />
          </div>
          <div className={styles.stack}>
            {calc?.warnings.filter((w) => w.line === null).length ? (
              <Notification kind="warning" title="Check before submitting">
                <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                  {calc.warnings
                    .filter((w) => w.line === null)
                    .map((w) => (
                      <li key={w.code}>{w.message}</li>
                    ))}
                </ul>
              </Notification>
            ) : null}
            {t ? (
              <dl className={styles.totals}>
                <dt>Subtotal</dt>
                <dd>{formatAmount(t.subtotal, currency)}</dd>
                {!imported ? (
                  <>
                    <dt>Discount</dt>
                    <dd>− {formatMoney(t.discountAmount)}</dd>
                    <dt>VAT {t.vatPercent}%</dt>
                    <dd>{formatMoney(t.vatAmount)}</dd>
                  </>
                ) : null}
                <dt className={styles.grand}>Total</dt>
                <dd className={styles.grand}>{formatAmount(t.total, currency)}</dd>
                {imported ? (
                  <>
                    <dt>BDT equivalent</dt>
                    <dd>{Number(t.totalBdt) ? formatMoney(t.totalBdt) : "—"}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className={styles.muted}>{caps.seeCost ? "Choose a supplier and add products to see totals." : "Totals are visible to roles that can see costs."}</p>
            )}
            {calc ? <p className={styles.muted}>{calc.approvalMode === "CAN_APPROVE" ? "You can approve this PO yourself (Save & approve)." : "Submitting sends it to the purchasing approvers."}</p> : null}
          </div>
        </div>
      </Step>

      <div className={styles.footer}>
        <span className={styles.muted}>{po ? `Editing ${po.displayNumber}` : "New purchase order"}</span>
        <div className={styles.footerActions}>
          <Button kind="ghost" onClick={() => router.back()} disabled={!!saving}>
            Cancel
          </Button>
          <Button kind="secondary" onClick={() => save("draft")} disabled={!!saving}>
            {saving === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button kind={canApprove ? "secondary" : "primary"} onClick={() => save("submit")} disabled={!!saving}>
            {saving === "submit" ? "Submitting…" : "Submit for approval"}
          </Button>
          {canApprove ? (
            <Button onClick={() => save("approve")} disabled={!!saving}>
              {saving === "approve" ? "Approving…" : "Save & approve"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Step({ n, id, title, aside, children }: { n: number; id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={`${styles.sectionTitle} ${p.stepTitle}`}>
          <span className={p.stepNumber} aria-hidden="true">
            {n}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
