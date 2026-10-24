"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField, Toggle } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage, upload } from "@/lib/api-client";
import { PhotoManager } from "./PhotoManager";
import type { CatalogCaps, CatalogDto, CategoryDto, PhotoDto, ProductDto, UnitDto } from "./types";
import styles from "./catalog.module.css";

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const QTY = /^\d{1,11}(\.\d{1,3})?$/;

type Values = Record<
  | "name" | "code" | "catalogId" | "model" | "categoryId" | "unitId" | "purchaseCost" | "sellingPrice"
  | "minStockLevel" | "barcode" | "warrantyMonths" | "defaultSupplierId" | "defaultSupplierName" | "source" | "countryOfOrigin" | "hsCode"
  | "capacity" | "refrigerant" | "powerSupply" | "dimensionsWeight" | "status" | "purchaseUnitId" | "purchaseUnitFactor" | "specifications",
  string
>;

function initialValues(p: ProductDto | null, catalogId: string | null): Values {
  const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    name: s(p?.name),
    code: s(p?.code),
    catalogId: p?.catalog.id ?? catalogId ?? "",
    model: s(p?.model),
    categoryId: s(p?.category.id),
    unitId: s(p?.unit.id),
    purchaseCost: s(p?.purchaseCost),
    sellingPrice: s(p?.sellingPrice),
    minStockLevel: s(p?.minStockLevel),
    barcode: s(p?.barcode),
    warrantyMonths: s(p?.warrantyMonths),
    defaultSupplierId: s(p?.defaultSupplierId),
    // Legacy free text only (a linked supplier's name is not kept as text).
    defaultSupplierName: p?.defaultSupplierId ? "" : s(p?.defaultSupplierName),
    source: s(p?.source),
    countryOfOrigin: s(p?.countryOfOrigin),
    hsCode: s(p?.hsCode),
    capacity: s(p?.capacity),
    refrigerant: s(p?.refrigerant),
    powerSupply: s(p?.powerSupply),
    dimensionsWeight: s(p?.dimensionsWeight),
    status: p?.status ?? "ACTIVE",
    purchaseUnitId: s(p?.purchaseUnit?.id),
    purchaseUnitFactor: s(p?.purchaseUnitFactor),
    specifications: s(p?.specifications),
  };
}

const num = (n: number | string, text: ReactNode) => (
  <>
    <span className={styles.num} aria-hidden="true">
      {n}
    </span>
    {text}
  </>
);

type CodeState = { state: "idle" | "checking" | "available" | "taken" | "invalid" };

interface Props {
  caps: CatalogCaps;
  product: ProductDto | null;
  initialCatalogId: string | null;
}

export function ProductForm({ caps, product, initialCatalogId }: Props) {
  const router = useRouter();
  const editing = !!product;
  const [v, setV] = useState<Values>(() => initialValues(product, initialCatalogId));
  const [trackSerial, setTrackSerial] = useState(product?.trackSerial ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [catalogs, setCatalogs] = useState<CatalogDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [photos, setPhotos] = useState<PhotoDto[]>(product?.photos ?? []);
  const [pending, setPending] = useState<File[]>([]);
  const [code, setCode] = useState<CodeState>({ state: "idle" });
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newCategoryError, setNewCategoryError] = useState<string>();
  // One key per form session: a double-submit or retry can't create two products.
  const idempotencyKey = useMemo(() => `product-${crypto.randomUUID()}`, []);

  // Suppliers (purchasing). Roles that can't list them keep the free-text field.
  const [suppliers, setSuppliers] = useState<{ id: string; code: string; name: string; isActive: boolean }[] | null>(null);
  useEffect(() => {
    api<{ data: { id: string; code: string; name: string; isActive: boolean }[] }>("/suppliers", { query: { pageSize: 100 } })
      .then((r) => setSuppliers(r.data))
      .catch(() => setSuppliers(null));
  }, []);

  useEffect(() => {
    Promise.all([api<{ data: CatalogDto[] }>("/catalogs"), api<{ data: CategoryDto[] }>("/categories"), api<{ data: UnitDto[] }>("/units")])
      .then(([c, cat, u]) => {
        setCatalogs(c.data);
        setCategories(cat.data);
        setUnits(u.data);
      })
      .catch((err) => setFormError(errorMessage(err)));
  }, []);

  // Live code availability check (create only).
  useEffect(() => {
    if (editing) return;
    const value = v.code.trim().toUpperCase();
    if (!value) return setCode({ state: "idle" });
    if (!CODE_PATTERN.test(value)) return setCode({ state: "invalid" });
    setCode({ state: "checking" });
    const t = setTimeout(() => {
      api<{ data: { available: boolean } }>("/products/check-code", { query: { code: value } })
        .then((r) => setCode({ state: r.data.available ? "available" : "taken" }))
        .catch(() => setCode({ state: "idle" }));
    }, 400);
    return () => clearTimeout(t);
  }, [v.code, editing]);

  const set = (key: keyof Values) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = key === "code" ? e.target.value.toUpperCase() : e.target.value;
    setV((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  // Inactive options stay selectable only if the product already uses them.
  const usable = <T extends { id: string; isActive: boolean }>(list: T[], current: string | undefined) => list.filter((x) => x.isActive || x.id === current);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const strip = (s: string) => s.trim().replace(/,/g, "");
    if (!v.name.trim()) e.name = "Item name is required.";
    if (!editing) {
      if (!v.code.trim()) e.code = "Code is required.";
      else if (!CODE_PATTERN.test(v.code.trim())) e.code = "2–31 characters: A–Z, 0–9 and '-', starting with a letter or digit.";
      else if (code.state === "taken") e.code = "This code is already in use.";
    }
    if (!v.catalogId) e.catalogId = "Choose a brand.";
    if (!v.categoryId) e.categoryId = "Choose a category.";
    if (!v.unitId) e.unitId = "Choose a unit.";
    if (!MONEY.test(strip(v.sellingPrice))) e.sellingPrice = v.sellingPrice ? "Enter an amount ≥ 0 with at most 2 decimals." : "Selling price is required.";
    if (caps.seeCost && !MONEY.test(strip(v.purchaseCost))) e.purchaseCost = v.purchaseCost ? "Enter an amount ≥ 0 with at most 2 decimals." : "Purchase cost is required.";
    if (v.minStockLevel && !QTY.test(strip(v.minStockLevel))) e.minStockLevel = "Enter a number ≥ 0 (up to 3 decimals).";
    if (v.warrantyMonths && !/^\d{1,3}$/.test(v.warrantyMonths.trim())) e.warrantyMonths = "Whole months, 0–600.";
    if (v.purchaseUnitId && !v.purchaseUnitFactor) e.purchaseUnitFactor = "Enter how many base units are in one purchase unit.";
    if (!v.purchaseUnitId && v.purchaseUnitFactor) e.purchaseUnitId = "Choose the purchase unit.";
    if (v.purchaseUnitFactor && (!QTY.test(strip(v.purchaseUnitFactor)) || !/[1-9]/.test(v.purchaseUnitFactor))) e.purchaseUnitFactor = "Enter a number greater than 0.";
    return e;
  }

  async function addCategory() {
    if (!newCategory?.trim()) return setNewCategoryError("Enter a name.");
    try {
      const c = (await api<{ data: CategoryDto }>("/categories", { method: "POST", body: { name: newCategory.trim() } })).data;
      setCategories((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
      setV((prev) => ({ ...prev, categoryId: c.id }));
      setNewCategory(null);
      setNewCategoryError(undefined);
    } catch (err) {
      setNewCategoryError(err instanceof ApiError ? (err.fieldErrors().name ?? err.message) : errorMessage(err));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.values(found).some(Boolean)) {
      setFormError("Fix the highlighted fields and try again.");
      return;
    }

    const { code: _code, purchaseCost, status, ...fields } = v;
    // Status changes go through Discontinue / Reactivate once the product exists.
    const body = { ...fields, trackSerial, ...(editing ? {} : { status }), ...(caps.seeCost ? { purchaseCost } : {}) };
    setSaving(true);
    try {
      if (editing) {
        await api(`/products/${product.id}`, { method: "PATCH", body });
        router.push(`/catalog/${product.id}?saved=1`);
        router.refresh();
        return;
      }
      const created = (await api<{ data: ProductDto }>("/products", { method: "POST", body: { ...body, code: v.code.trim() }, headers: { "Idempotency-Key": idempotencyKey } })).data;
      if (pending.length) {
        const fd = new FormData();
        pending.forEach((f) => fd.append("file", f, f.name));
        try {
          await upload(`/products/${created.id}/photos`, fd);
        } catch (err) {
          router.push(`/catalog/${created.id}?saved=1&photoError=${encodeURIComponent(errorMessage(err))}`);
          return;
        }
      }
      router.push(`/catalog/${created.id}?saved=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  const codeHint =
    code.state === "available" ? (
      <span className={`${styles.codeStatus} ${styles.ok}`}>✓ Available. Must be unique. Can’t be changed after saving.</span>
    ) : code.state === "taken" ? (
      <span className={`${styles.codeStatus} ${styles.bad}`}>Already used by another product.</span>
    ) : code.state === "checking" ? (
      "Checking…"
    ) : (
      "Must be unique. Can’t be changed after saving."
    );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {formError ? (
        <Notification kind="error" title={editing ? "Could not save changes" : "Could not create product"} onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}

      <section className={styles.section} aria-labelledby="sec-basic">
        <h2 id="sec-basic" className={styles.sectionTitle}>
          Basic details
        </h2>
        <p className={styles.sectionHelp}>Fields marked * are required.</p>
        <div className={styles.grid}>
          <TextField label={num(1, "Item name *")} value={v.name} onChange={set("name")} error={errors.name} fieldClassName={styles.full} placeholder="e.g. LG Dual Inverter Split AC 1.5 Ton" />
          <TextField
            label={num(2, "Code / SKU *")}
            value={v.code}
            onChange={set("code")}
            error={errors.code || (code.state === "invalid" && v.code ? "2–31 characters: A–Z, 0–9 and '-', starting with a letter or digit." : undefined)}
            helper={editing ? "Codes can’t be changed after saving." : codeHint}
            readOnly={editing}
            disabled={editing}
            mono
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="LG-S18ET"
          />
          <div />
          <SelectField label={num("3a", "Brand (catalog) *")} value={v.catalogId} onChange={set("catalogId")} error={errors.catalogId}>
            <option value="">Choose a brand</option>
            {usable(catalogs, product?.catalog.id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </SelectField>
          <TextField label={num("3b", "Model number")} value={v.model} onChange={set("model")} error={errors.model} mono placeholder="S4-Q18KL3AA" />
          <div>
            <SelectField label={num(4, "Category *")} value={v.categoryId} onChange={set("categoryId")} error={errors.categoryId}>
              <option value="">Choose a category</option>
              {usable(categories, product?.category.id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </SelectField>
            {caps.canManage ? (
              newCategory === null ? (
                <button type="button" className={styles.linkButton} onClick={() => setNewCategory("")}>
                  + New category
                </button>
              ) : (
                <div className={styles.inlineAdd}>
                  <TextField label="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} error={newCategoryError} autoFocus />
                  <Button size="sm" onClick={addCategory}>
                    Add
                  </Button>
                  <Button kind="ghost" size="sm" onClick={() => setNewCategory(null)}>
                    Cancel
                  </Button>
                </div>
              )
            ) : null}
          </div>
          <SelectField label={num(5, "Unit of measure *")} value={v.unitId} onChange={set("unitId")} error={errors.unitId} helper="Stock is always counted in this unit.">
            <option value="">Choose a unit</option>
            {units
              .filter((u) => u.isActive || u.id === product?.unit.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
          </SelectField>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sec-photo">
        <h2 id="sec-photo" className={styles.sectionTitle}>
          <span className={styles.num} aria-hidden="true">
            7
          </span>
          Photo
        </h2>
        <p className={styles.sectionHelp}>{editing ? "Changes to photos are saved immediately." : "Photos are uploaded when you save the product."}</p>
        <PhotoManager productId={product?.id} photos={photos} onPhotosChange={setPhotos} pending={pending} onPendingChange={setPending} onError={setFormError} />
      </section>

      <section className={styles.section} aria-labelledby="sec-price">
        <h2 id="sec-price" className={styles.sectionTitle}>
          <span className={styles.num} aria-hidden="true">
            6
          </span>
          Price
        </h2>
        <p className={styles.sectionHelp}>Amounts in BDT.</p>
        <div className={styles.grid}>
          {caps.seeCost ? (
            <TextField label="Purchase cost (BDT) *" inputMode="decimal" value={v.purchaseCost} onChange={set("purchaseCost")} error={errors.purchaseCost} placeholder="0.00" />
          ) : null}
          <TextField label="Selling price (BDT) *" inputMode="decimal" value={v.sellingPrice} onChange={set("sellingPrice")} error={errors.sellingPrice} placeholder="0.00" />
        </div>
        <p className={styles.note}>Cost can later update automatically from purchases (average cost).</p>
      </section>

      <section className={styles.section} aria-labelledby="sec-optional">
        <h2 id="sec-optional" className={styles.sectionTitle}>
          Optional details
        </h2>
        <p className={styles.sectionHelp}>Fill in what you know; everything here can be added later.</p>
        <div className={styles.grid3}>
          <TextField label="Min stock level" inputMode="decimal" value={v.minStockLevel} onChange={set("minStockLevel")} error={errors.minStockLevel} helper="For low-stock alerts." />
          <TextField label="Barcode" value={v.barcode} onChange={set("barcode")} error={errors.barcode} mono />
          <TextField label="Warranty (months)" inputMode="numeric" value={v.warrantyMonths} onChange={set("warrantyMonths")} error={errors.warrantyMonths} />
          {suppliers ? (
            <SelectField
              label="Default supplier"
              value={v.defaultSupplierId}
              onChange={set("defaultSupplierId")}
              error={errors.defaultSupplierId}
              helper={!v.defaultSupplierId && v.defaultSupplierName ? `Unlinked: “${v.defaultSupplierName}”. Pick the supplier record.` : "Low stock → Create PO uses it."}
            >
              <option value="">None</option>
              {suppliers
                .filter((x) => x.isActive || x.id === v.defaultSupplierId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.code})
                  </option>
                ))}
            </SelectField>
          ) : (
            <TextField label="Default supplier" value={v.defaultSupplierName} onChange={set("defaultSupplierName")} error={errors.defaultSupplierName} />
          )}
          <SelectField label="Source" value={v.source} onChange={set("source")}>
            <option value="">Not set</option>
            <option value="IMPORTED">Imported</option>
            <option value="LOCAL">Local</option>
          </SelectField>
          <TextField label="Country of origin" value={v.countryOfOrigin} onChange={set("countryOfOrigin")} error={errors.countryOfOrigin} />
          <TextField label="HS code" value={v.hsCode} onChange={set("hsCode")} error={errors.hsCode} mono />
          <TextField label="Capacity" value={v.capacity} onChange={set("capacity")} error={errors.capacity} placeholder="1.5 Ton / 18,000 BTU" />
          <TextField label="Refrigerant" value={v.refrigerant} onChange={set("refrigerant")} error={errors.refrigerant} placeholder="R32" />
          <TextField label="Power supply" value={v.powerSupply} onChange={set("powerSupply")} error={errors.powerSupply} placeholder="220-240V / 1Ph / 50Hz" />
          <TextField label="Dimensions / weight" value={v.dimensionsWeight} onChange={set("dimensionsWeight")} error={errors.dimensionsWeight} />
          <SelectField label="Status" value={v.status} onChange={set("status")} disabled={editing} helper={editing ? "Use Discontinue / Reactivate on the product page." : undefined}>
            <option value="ACTIVE">Active</option>
            <option value="DISCONTINUED">Discontinued</option>
          </SelectField>
          <SelectField label="Purchase unit" value={v.purchaseUnitId} onChange={set("purchaseUnitId")} error={errors.purchaseUnitId} helper="If bought in a different unit, e.g. roll.">
            <option value="">Same as base unit</option>
            {units
              .filter((u) => u.isActive || u.id === product?.purchaseUnit?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
          </SelectField>
          <TextField
            label="Conversion factor"
            inputMode="decimal"
            value={v.purchaseUnitFactor}
            onChange={set("purchaseUnitFactor")}
            error={errors.purchaseUnitFactor}
            helper={
              v.purchaseUnitId && v.unitId
                ? `1 ${units.find((u) => u.id === v.purchaseUnitId)?.code ?? ""} = ${v.purchaseUnitFactor || "?"} ${units.find((u) => u.id === v.unitId)?.code ?? ""}`
                : "Base units in one purchase unit, e.g. 50."
            }
          />
          <div className={styles.full}>
            <Toggle
              label="Track serial numbers"
              checked={trackSerial}
              onChange={setTrackSerial}
              description="Turn on for items with a serial number on each unit (e.g. outdoor / indoor units). Stock in and out will then ask for the serial number of every piece."
            />
          </div>
          <TextAreaField label="Specifications / notes" value={v.specifications} onChange={set("specifications")} error={errors.specifications} fieldClassName={styles.full} rows={5} />
        </div>
      </section>

      <div className={styles.footer}>
        <Link href={editing ? `/catalog/${product.id}` : "/catalog"} className={styles.secondaryLink}>
          Cancel
        </Link>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save product"}
        </Button>
      </div>
    </form>
  );
}
