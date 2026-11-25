"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField, Toggle } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage, upload } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import { PhotoManager } from "./PhotoManager";
import type { CatalogCaps, CatalogDto, CategoryDto, PhotoDto, ProductDto, UnitDto } from "./types";
import styles from "./catalog.module.css";

// Same as the server's PRODUCT_CODE_PATTERN (catalog/domain/rules.ts).
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}$/;
const CODE_MESSAGE = "Use 2–31 characters: A–Z, 0–9 and '-', starting with a letter or digit.";
// Barcode: printable characters, no spaces (CreateProductSchema.barcode).
const BARCODE = /^[\x21-\x7E]+$/;

const LABELS: Record<string, string> = {
  name: "Item name",
  code: "Code / SKU",
  catalogId: "Brand",
  model: "Model number",
  categoryId: "Category",
  unitId: "Unit of measure",
  purchaseCost: "Purchase cost",
  sellingPrice: "Selling price",
  minStockLevel: "Min stock level",
  barcode: "Barcode",
  warrantyMonths: "Warranty",
  defaultSupplierName: "Default supplier",
  countryOfOrigin: "Country of origin",
  hsCode: "HS code",
  capacity: "Capacity",
  refrigerant: "Refrigerant",
  powerSupply: "Power supply",
  dimensionsWeight: "Dimensions / weight",
  purchaseUnitId: "Purchase unit",
  purchaseUnitFactor: "Conversion factor",
  specifications: "Specifications / notes",
};

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

/** A warehouse as GET /opening-stock/warehouses returns it. */
interface OpeningWarehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  openingLocked: boolean;
}
interface OpeningRow {
  qty: string;
  cost: string;
  serials: string;
}
const EMPTY_OPENING: OpeningRow = { qty: "", cost: "", serials: "" };

/** Serial numbers typed one per line or comma-separated (stored upper-case, as the server does). */
const serialList = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

/**
 * Browser-side checks of the opening stock rows with a quantity (same rules as an OPENING entry):
 * quantity > 0 (whole for serial-tracked products), a unit cost (or the purchase cost) with up to
 * 4 decimals, and for serial-tracked products exactly as many distinct serials as the quantity.
 */
function openingProblems(rows: OpeningWarehouse[], opening: Record<string, OpeningRow>, trackSerial: boolean, purchaseCost: string): [string, string | undefined][] {
  return rows.flatMap((w) => {
    const row = opening[w.id] ?? EMPTY_OPENING;
    const key = (f: keyof OpeningRow) => `opening:${w.id}:${f}`;
    const qtyProblem = rules.qty(row.qty, { positive: true, whole: trackSerial });
    const cost = row.cost.trim() || purchaseCost.trim();
    const out: [string, string | undefined][] = [
      [key("qty"), qtyProblem],
      [key("cost"), cost ? rules.rate(cost) : "Enter the unit cost, or a purchase cost above."],
    ];
    if (trackSerial && !qtyProblem) {
      const serials = serialList(row.serials);
      const qty = Number(row.qty);
      out.push([
        key("serials"),
        serials.length !== qty
          ? `Enter ${qty} serial number${qty === 1 ? "" : "s"} (${serials.length} entered).`
          : new Set(serials).size !== serials.length
            ? "A serial number is entered twice."
            : undefined,
      ]);
    }
    return out;
  });
}

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
  const [attempt, setAttempt] = useState(false);
  const [catalogs, setCatalogs] = useState<CatalogDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [photos, setPhotos] = useState<PhotoDto[]>(product?.photos ?? []);
  const [pending, setPending] = useState<File[]>([]);
  const [code, setCode] = useState<CodeState>({ state: "idle" });
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newCategoryError, setNewCategoryError] = useState<string>();
  const [newCategoryAttempt, setNewCategoryAttempt] = useState(false);
  // One key per form session: a double-submit or retry can't create two products.
  const idempotencyKey = useMemo(() => `product-${crypto.randomUUID()}`, []);

  // Opening stock posted with a new product (inventory FULL + seeCost): one OPENING entry per warehouse.
  const offerOpening = !editing && caps.canAddOpeningStock;
  const [openingWarehouses, setOpeningWarehouses] = useState<OpeningWarehouse[] | null>(null);
  const [opening, setOpening] = useState<Record<string, OpeningRow>>({});
  const openingKeys = useMemo(() => new Map<string, string>(), []);
  useEffect(() => {
    if (!offerOpening) return;
    api<{ data: OpeningWarehouse[] }>("/opening-stock/warehouses")
      .then((r) => setOpeningWarehouses(r.data.filter((w) => w.isActive)))
      .catch(() => setOpeningWarehouses([]));
  }, [offerOpening]);
  const setOpeningField = (warehouseId: string, field: keyof OpeningRow) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setOpening((prev) => ({ ...prev, [warehouseId]: { ...EMPTY_OPENING, ...prev[warehouseId], [field]: value } }));
    const key = `opening:${warehouseId}:${field}`;
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };
  /** Warehouses with a quantity entered. */
  const openingRows = (openingWarehouses ?? []).filter((w) => !w.openingLocked && opening[w.id]?.qty.trim());

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

  // Browser-side checks (same rules as CreateProductSchema / UpdateProductSchema); every problem is shown at once.
  const codeValue = v.code.trim();
  const factorBlank = !v.purchaseUnitFactor.trim();
  const problems = collect(
    ["name", rules.required(v.name, "the item name") ?? rules.maxLength(v.name, 200)],
    [
      "code",
      editing
        ? undefined
        : // Optional: left empty, the server makes it from the model number.
          codeValue && (!CODE_PATTERN.test(codeValue) ? CODE_MESSAGE : code.state === "taken" ? "This code is already used by another product. Enter a different one." : undefined),
    ],
    // Brand, category and unit are optional: left empty they become "Other", "Other" and "pcs".
    ["model", rules.required(v.model, "the model number") ?? rules.maxLength(v.model, 100)],
    // Prices are optional: left empty they are saved as 0.00.
    ["purchaseCost", caps.seeCost ? rules.money(v.purchaseCost) : undefined],
    ["sellingPrice", rules.money(v.sellingPrice)],
    ["minStockLevel", rules.qty(v.minStockLevel)],
    ["barcode", rules.maxLength(v.barcode, 64) ?? (v.barcode.trim() && !BARCODE.test(v.barcode.trim()) ? "Use letters, digits and symbols only, without spaces." : undefined)],
    ["warrantyMonths", rules.integer(v.warrantyMonths, { min: 0, max: 600 })],
    ["defaultSupplierName", suppliers ? undefined : rules.maxLength(v.defaultSupplierName, 200)],
    ["countryOfOrigin", rules.maxLength(v.countryOfOrigin, 100)],
    ["hsCode", rules.maxLength(v.hsCode, 20)],
    ["capacity", rules.maxLength(v.capacity, 100)],
    ["refrigerant", rules.maxLength(v.refrigerant, 50)],
    ["powerSupply", rules.maxLength(v.powerSupply, 100)],
    ["dimensionsWeight", rules.maxLength(v.dimensionsWeight, 200)],
    // Purchase unit and factor come as a pair; the factor must be > 0 (assertPurchaseUnit).
    ["purchaseUnitId", !v.purchaseUnitId && !factorBlank ? "Choose the purchase unit, or clear the conversion factor." : undefined],
    [
      "purchaseUnitFactor",
      v.purchaseUnitId && factorBlank ? "Enter how many base units are in one purchase unit." : (rules.qty(v.purchaseUnitFactor, { positive: true })),
    ],
    ["specifications", rules.maxLength(v.specifications, 5000)],
    ...openingProblems(openingRows, opening, trackSerial, v.purchaseCost),
  );
  const shownErrors: Record<string, string | undefined> = { ...errors, ...(attempt ? problems : {}) };
  const OPENING_FIELD = { qty: "quantity", cost: "unit cost", serials: "serial numbers" } as const;
  const problemLabels: Record<string, string> = { ...LABELS };
  for (const w of openingWarehouses ?? []) for (const [f, label] of Object.entries(OPENING_FIELD)) problemLabels[`opening:${w.id}:${f}`] = `Opening stock, ${w.name}: ${label}`;

  // Inline "+ New category": name required, at most 60 characters (CreateCategorySchema).
  const newCategoryProblem = newCategory === null ? undefined : (rules.required(newCategory, "a name") ?? rules.maxLength(newCategory, 60));
  const shownNewCategoryError = newCategoryError ?? (newCategoryAttempt ? newCategoryProblem : undefined);

  async function addCategory() {
    setNewCategoryAttempt(true);
    setNewCategoryError(undefined);
    if (newCategory === null || newCategoryProblem) return;
    try {
      const c = (await api<{ data: CategoryDto }>("/categories", { method: "POST", body: { name: newCategory.trim() } })).data;
      setCategories((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
      setV((prev) => ({ ...prev, categoryId: c.id }));
      closeNewCategory();
    } catch (err) {
      setNewCategoryError(err instanceof ApiError ? (err.fieldErrors().name ?? err.message) : errorMessage(err));
    }
  }

  function closeNewCategory() {
    setNewCategory(null);
    setNewCategoryError(undefined);
    setNewCategoryAttempt(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempt(true);
    setFormError(null);
    if (Object.keys(problems).length) {
      revealProblems();
      return;
    }
    setErrors({});

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
      // The product exists from here on: problems with photos or opening stock are shown on its page.
      const after = new URLSearchParams({ saved: "1" });
      if (pending.length) {
        const fd = new FormData();
        pending.forEach((f) => fd.append("file", f, f.name));
        try {
          await upload(`/products/${created.id}/photos`, fd);
        } catch (err) {
          after.set("photoError", errorMessage(err));
        }
      }
      const posted: string[] = [];
      for (const w of openingRows) {
        const row = opening[w.id] ?? EMPTY_OPENING;
        if (!openingKeys.has(w.id)) openingKeys.set(w.id, `opening-${crypto.randomUUID()}`);
        try {
          const entry = (
            await api<{ data: { number: string | null } }>("/stock-entries", {
              method: "POST",
              headers: { "Idempotency-Key": openingKeys.get(w.id)! },
              body: {
                action: "post",
                type: "OPENING",
                warehouseId: w.id,
                notes: "Opening stock entered with the new product.",
                lines: [{ productId: created.id, qty: row.qty.trim(), unitPrice: (row.cost.trim() || v.purchaseCost).trim(), ...(trackSerial ? { serials: serialList(row.serials) } : {}) }],
              },
            })
          ).data;
          posted.push(entry.number ?? w.code);
        } catch (err) {
          after.set("stockError", `${w.name}: ${errorMessage(err)}`);
          break;
        }
      }
      if (posted.length) after.set("stockPosted", posted.join(", "));
      router.push(`/catalog/${created.id}?${after.toString()}`);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setFormError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
      revealProblems();
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
      "Optional: left empty, the model number is used. Must be unique. Can’t be changed after saving."
    );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {formError ? (
        <Notification kind="error" title={editing ? "Could not save changes" : "Could not create product"} onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}
      {attempt ? <FormProblems problems={problems} labels={problemLabels} /> : null}

      <section className={styles.section} aria-labelledby="sec-basic">
        <h2 id="sec-basic" className={styles.sectionTitle}>
          Basic details
        </h2>
        <p className={styles.sectionHelp}>Fields marked * are required.</p>
        <div className={styles.grid}>
          <TextField label={num(1, "Item name *")} value={v.name} onChange={set("name")} error={shownErrors.name} fieldClassName={styles.full} placeholder="e.g. LG Dual Inverter Split AC 1.5 Ton" />
          <TextField
            label={num(2, "Code / SKU")}
            value={v.code}
            onChange={set("code")}
            error={shownErrors.code || (!editing && code.state === "invalid" && v.code ? CODE_MESSAGE : undefined)}
            helper={editing ? "Codes can’t be changed after saving." : codeHint}
            readOnly={editing}
            disabled={editing}
            mono
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="LG-S18ET"
          />
          <div />
          <SelectField searchable label={num("3a", "Brand (catalog)")} value={v.catalogId} onChange={set("catalogId")} error={shownErrors.catalogId} helper={editing ? undefined : "Left empty: Other."}>
            <option value="">Choose a brand</option>
            {usable(catalogs, product?.catalog.id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </SelectField>
          <TextField label={num("3b", "Model number *")} value={v.model} onChange={set("model")} error={shownErrors.model} mono placeholder="S4-Q18KL3AA" />
          <div>
            <SelectField searchable label={num(4, "Category")} value={v.categoryId} onChange={set("categoryId")} error={shownErrors.categoryId} helper={editing ? undefined : "Left empty: Other."}>
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
                  <TextField
                    label="New category name"
                    value={newCategory}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      setNewCategoryError(undefined);
                    }}
                    onKeyDown={(e) => {
                      // Enter adds the category instead of submitting the whole product form.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addCategory();
                      }
                    }}
                    error={shownNewCategoryError}
                    autoFocus
                  />
                  <Button size="sm" onClick={addCategory}>
                    Add
                  </Button>
                  <Button kind="ghost" size="sm" onClick={closeNewCategory}>
                    Cancel
                  </Button>
                </div>
              )
            ) : null}
          </div>
          <SelectField searchable label={num(5, "Unit of measure")} value={v.unitId} onChange={set("unitId")} error={shownErrors.unitId} helper={editing ? "Stock is always counted in this unit." : "Stock is always counted in this unit. Left empty: pcs."}>
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
        <p className={styles.sectionHelp}>Amounts in BDT. Optional: left empty, a price is saved as 0.00.</p>
        <div className={styles.grid}>
          {caps.seeCost ? (
            <TextField label="Purchase cost (BDT)" kind="money" value={v.purchaseCost} onChange={set("purchaseCost")} error={shownErrors.purchaseCost} placeholder="0.00" />
          ) : null}
          <TextField label="Selling price (BDT)" kind="money" value={v.sellingPrice} onChange={set("sellingPrice")} error={shownErrors.sellingPrice} placeholder="0.00" />
        </div>
        <p className={styles.note}>Cost can later update automatically from purchases (average cost).</p>
      </section>

      <section className={styles.section} aria-labelledby="sec-optional">
        <h2 id="sec-optional" className={styles.sectionTitle}>
          Optional details
        </h2>
        <p className={styles.sectionHelp}>Fill in what you know; everything here can be added later.</p>
        <div className={styles.grid3}>
          <TextField label="Min stock level" kind="qty" value={v.minStockLevel} onChange={set("minStockLevel")} error={shownErrors.minStockLevel} helper="For low-stock alerts." />
          <TextField label="Barcode" value={v.barcode} onChange={set("barcode")} error={shownErrors.barcode} mono spellCheck={false} />
          <TextField label="Warranty (months)" kind="integer" value={v.warrantyMonths} onChange={set("warrantyMonths")} error={shownErrors.warrantyMonths} helper="0 to 600." />
          {suppliers ? (
            <SelectField searchable
              label="Default supplier"
              value={v.defaultSupplierId}
              onChange={set("defaultSupplierId")}
              error={shownErrors.defaultSupplierId}
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
            <TextField label="Default supplier" value={v.defaultSupplierName} onChange={set("defaultSupplierName")} error={shownErrors.defaultSupplierName} />
          )}
          <SelectField label="Source" value={v.source} onChange={set("source")} error={shownErrors.source}>
            <option value="">Not set</option>
            <option value="IMPORTED">Imported</option>
            <option value="LOCAL">Local</option>
          </SelectField>
          <TextField label="Country of origin" value={v.countryOfOrigin} onChange={set("countryOfOrigin")} error={shownErrors.countryOfOrigin} />
          <TextField label="HS code" value={v.hsCode} onChange={set("hsCode")} error={shownErrors.hsCode} mono />
          <TextField label="Capacity" value={v.capacity} onChange={set("capacity")} error={shownErrors.capacity} placeholder="1.5 Ton / 18,000 BTU" />
          <TextField label="Refrigerant" value={v.refrigerant} onChange={set("refrigerant")} error={shownErrors.refrigerant} placeholder="R32" />
          <TextField label="Power supply" value={v.powerSupply} onChange={set("powerSupply")} error={shownErrors.powerSupply} placeholder="220-240V / 1Ph / 50Hz" />
          <TextField label="Dimensions / weight" value={v.dimensionsWeight} onChange={set("dimensionsWeight")} error={shownErrors.dimensionsWeight} />
          <SelectField label="Status" value={v.status} onChange={set("status")} disabled={editing} helper={editing ? "Use Discontinue / Reactivate on the product page." : undefined}>
            <option value="ACTIVE">Active</option>
            <option value="DISCONTINUED">Discontinued</option>
          </SelectField>
          <SelectField searchable label="Purchase unit" value={v.purchaseUnitId} onChange={set("purchaseUnitId")} error={shownErrors.purchaseUnitId} helper="If bought in a different unit, e.g. roll.">
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
            kind="qty"
            value={v.purchaseUnitFactor}
            onChange={set("purchaseUnitFactor")}
            error={shownErrors.purchaseUnitFactor}
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
          <TextAreaField label="Specifications / notes" value={v.specifications} onChange={set("specifications")} error={shownErrors.specifications} fieldClassName={styles.full} rows={5} />
        </div>
      </section>

      {offerOpening ? (
        <section className={styles.section} aria-labelledby="sec-opening">
          <h2 id="sec-opening" className={styles.sectionTitle}>
            Opening stock (optional)
          </h2>
          <p className={styles.sectionHelp}>
            Stock you already have of this product. Saving posts an opening stock entry for each warehouse with a quantity. Leave empty to add stock later (Stock in / out). Unit cost
            left empty: the purchase cost.
          </p>
          {openingWarehouses === null ? (
            <p className={styles.sectionHelp}>Loading warehouses…</p>
          ) : openingWarehouses.length === 0 ? (
            <p className={styles.sectionHelp}>No warehouses available.</p>
          ) : (
            <div className={styles.grid}>
              {openingWarehouses.map((w) => {
                const row = opening[w.id] ?? EMPTY_OPENING;
                const err = (f: keyof OpeningRow) => shownErrors[`opening:${w.id}:${f}`];
                return w.openingLocked ? (
                  <p key={w.id} className={`${styles.sectionHelp} ${styles.full}`}>
                    <strong>{w.name}:</strong> opening stock is locked. Receive stock with a GRN (Stock in / out) instead.
                  </p>
                ) : (
                  <div key={w.id} className={`${styles.grid} ${styles.full}`}>
                    <TextField
                      label={`${w.name}: quantity`}
                      kind="qty"
                      value={row.qty}
                      onChange={setOpeningField(w.id, "qty")}
                      error={err("qty")}
                      helper={units.find((u) => u.id === v.unitId)?.code ?? "pcs"}
                    />
                    <TextField label={`${w.name}: unit cost (BDT)`} kind="rate" value={row.cost} onChange={setOpeningField(w.id, "cost")} error={err("cost")} placeholder={v.purchaseCost || "0.00"} />
                    {trackSerial && row.qty.trim() ? (
                      <TextAreaField
                        label={`${w.name}: serial numbers *`}
                        value={row.serials}
                        onChange={setOpeningField(w.id, "serials")}
                        error={err("serials")}
                        fieldClassName={styles.full}
                        rows={3}
                        helper="One per line (or separated by commas): exactly as many as the quantity."
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

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
