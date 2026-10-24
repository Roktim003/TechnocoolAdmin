"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, Toggle } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { ProductPicker } from "../../_components/ProductPicker";
import type { ProductOption, WarehouseDto } from "../../_components/types";
import { SCOPE_LABEL, type CountDto } from "./count-types";
import styles from "../../_components/stock.module.css";

type Scope = "ALL" | "CATALOG" | "CATEGORY" | "SELECTED_PRODUCTS";

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

  useEffect(() => {
    api<{ data: { id: string; name: string; isActive: boolean }[] }>("/catalogs").then((r) => setCatalogs(r.data.filter((c) => c.isActive))).catch(() => undefined);
    api<{ data: { id: string; name: string; isActive: boolean }[] }>("/categories").then((r) => setCategories(r.data.filter((c) => c.isActive))).catch(() => undefined);
  }, []);

  const toggle = (id: string, on: boolean) => setIds((xs) => (on ? [...xs, id] : xs.filter((x) => x !== id)));

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const scopeIds = scope === "SELECTED_PRODUCTS" ? picked.map((p) => p.id) : scope === "ALL" ? [] : ids;
      const c = (await api<{ data: CountDto }>("/stock-counts", { method: "POST", body: { warehouseId, scope, scopeIds, blindCount: blind, notes: notes || null } })).data;
      router.push(`/stock/counts/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className={styles.stack} style={{ maxWidth: 760 }}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      <section className={styles.section}>
        <div className={styles.stack}>
          <SelectField label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
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
              <ProductPicker value={null} activeOnly={false} onChange={(p) => p && !picked.some((x) => x.id === p.id) && setPicked((xs) => [...xs, p])} label="Add a product" />
              <div className={styles.chips}>
                {picked.map((p) => (
                  <button key={p.id} type="button" className={styles.chip} onClick={() => setPicked((xs) => xs.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.code}`}>
                    {p.code} ✕
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {scope === "ALL" ? <p className={styles.muted}>All active products, plus anything with stock in this warehouse.</p> : null}
          <Toggle label="Blind count" description="Counters don't see the system quantity; approvers still do." checked={blind} onChange={setBlind} />
          <TextAreaField label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>
      <div className={styles.footerActions} style={{ marginLeft: 0 }}>
        <Button kind="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={create} disabled={saving || !warehouseId || (scope !== "ALL" && !(scope === "SELECTED_PRODUCTS" ? picked.length : ids.length))}>
          {saving ? "Creating…" : "Create count"}
        </Button>
      </div>
    </div>
  );
}
