"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, Toggle } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import { ProductPicker } from "../../_components/ProductPicker";
import type { ProductOption, WarehouseDto } from "../../_components/types";
import { SCOPE_LABEL, type CountDto } from "./count-types";
import styles from "../../_components/stock.module.css";

type Scope = "ALL" | "CATALOG" | "CATEGORY" | "SELECTED_PRODUCTS";

const LABELS: Record<string, string> = { warehouseId: "Warehouse", scopeIds: "What to count", notes: "Notes" };

export function NewCountForm({ warehouses }: { warehouses: WarehouseDto[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [scope, setScope] = useState<Scope>("ALL");
  const [ids, setIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<ProductOption[]>([]);
  const [blind, setBlind] = useState(false);
  const [notes, setNotes] = useState("");
  const [catalogs, setCatalogs] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(false);

  useEffect(() => {
    api<{ data: { id: string; name: string; isActive: boolean }[] }>("/catalogs").then((r) => setCatalogs(r.data.filter((c) => c.isActive))).catch(() => undefined);
    api<{ data: { id: string; name: string; isActive: boolean }[] }>("/categories").then((r) => setCategories(r.data.filter((c) => c.isActive))).catch(() => undefined);
  }, []);

  const toggle = (id: string, on: boolean) => setIds((xs) => (on ? [...xs, id] : xs.filter((x) => x !== id)));
  const scopeIds = scope === "SELECTED_PRODUCTS" ? picked.map((p) => p.id) : scope === "ALL" ? [] : ids;

  // Browser-side checks (same rules as the server); every problem is shown at once.
  const problems = collect(
    ["warehouseId", rules.chosen(warehouseId, "a warehouse")],
    ["scopeIds", scope === "ALL" || scopeIds.length ? undefined : scope === "SELECTED_PRODUCTS" ? "Add at least one product." : scope === "CATALOG" ? "Tick at least one catalog." : "Tick at least one category."],
    ["notes", rules.maxLength(notes, 1000)],
  );
  const shownErrors = { ...serverErrors, ...(attempt ? problems : {}) };

  // A server error on a field disappears once the form is edited.
  useEffect(() => setServerErrors({}), [warehouseId, scope, ids, picked, notes]);

  async function create() {
    setAttempt(true);
    setError(null);
    if (Object.keys(problems).length) {
      revealProblems();
      return;
    }
    setSaving(true);
    setServerErrors({});
    try {
      const c = (await api<{ data: CountDto }>("/stock-counts", { method: "POST", body: { warehouseId, scope, scopeIds, blindCount: blind, notes: notes.trim() || null } })).data;
      router.push(`/stock/counts/${c.id}`);
    } catch (err) {
      const fields = err instanceof ApiError ? Object.fromEntries(Object.entries(err.fieldErrors()).map(([k, v]) => [k.startsWith("scopeIds") ? "scopeIds" : k, v])) : {};
      setServerErrors(fields);
      setError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
      revealProblems();
      setSaving(false);
    }
  }

  return (
    <div className={styles.stack} style={{ maxWidth: 760 }}>
      {error ? (
        <Notification kind="error" onClose={() => setError(null)}>
          {error}
        </Notification>
      ) : null}
      {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}
      <section className={styles.section}>
        <div className={styles.stack}>
          <SelectField searchable label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} error={shownErrors.warehouseId}>
            {warehouses.length ? null : <option value="">No warehouse available</option>}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className={styles.muted} style={{ marginBottom: "var(--space-3)" }}>
              What to count
            </legend>
            <div className={styles.typeList} role="radiogroup">
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={scope === s} className={`${styles.typeOption} ${scope === s ? styles.typeSelected : ""}`} onClick={() => (setScope(s), setIds([]))}>
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
          {scope === "CATALOG" || scope === "CATEGORY" ? (
            <div className={styles.grid}>
              {(scope === "CATALOG" ? catalogs : categories).map((x) => (
                <Checkbox key={x.id} label={x.name} checked={ids.includes(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} />
              ))}
            </div>
          ) : null}
          {scope === "SELECTED_PRODUCTS" ? (
            <div>
              <ProductPicker value={null} activeOnly={false} onChange={(p) => p && !picked.some((x) => x.id === p.id) && setPicked((xs) => [...xs, p])} label="Add a product" invalid={!!shownErrors.scopeIds} />
              <div className={styles.chips}>
                {picked.map((p) => (
                  <button key={p.id} type="button" className={styles.chip} onClick={() => setPicked((xs) => xs.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.code}`}>
                    {p.code} ✕
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {shownErrors.scopeIds ? (
            <p className={styles.lineWarn} role="alert">
              {shownErrors.scopeIds}
            </p>
          ) : null}
          {scope === "ALL" ? <p className={styles.muted}>All active products, plus anything with stock in this warehouse.</p> : null}
          <Toggle label="Blind count" description="Counters don't see the system quantity; approvers still do." checked={blind} onChange={setBlind} />
          <TextAreaField label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} error={shownErrors.notes} />
        </div>
      </section>
      <div className={styles.footerActions} style={{ marginLeft: 0 }}>
        <Button kind="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={create} disabled={saving}>
          {saving ? "Creating…" : "Create count"}
        </Button>
      </div>
    </div>
  );
}
