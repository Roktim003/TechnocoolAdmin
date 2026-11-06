"use client";

import { useEffect, useId, useState } from "react";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import fieldStyles from "@/components/ui/Field.module.css";
import { ProductSelect } from "@/components/ui/ProductSelect";
import { api } from "@/lib/api-client";
import { DATE_TOKENS, isDateToken, isMonthToken, MONTH_TOKENS } from "@/modules/reporting/domain/schedule";
import type { Lookups, ParamDef } from "./types";
import styles from "./reports.module.css";

/**
 * The filter fields of one report. Dates offer relative periods ("Start of this month", "Today",
 * …) or a fixed date, months relative months ("This month", "5 months ago", …) or a fixed month:
 * schedules keep the relative ones, so each email covers a fresh period.
 */
export function FilterFields({ params, values, onChange, lookups }: { params: ParamDef[]; values: Record<string, string>; onChange: (key: string, value: string) => void; lookups: Lookups | null }) {
  return (
    <>
      {params.map((p) => (
        <div key={p.key} className={p.kind === "text" ? styles.filterWide : styles.filter}>
          <Param p={p} value={values[p.key] ?? ""} onChange={(v) => onChange(p.key, v)} lookups={lookups} />
        </div>
      ))}
    </>
  );
}

function Param({ p, value, onChange, lookups }: { p: ParamDef; value: string; onChange: (v: string) => void; lookups: Lookups | null }) {
  const any = <option value="">All</option>;
  switch (p.kind) {
    case "dateFrom":
    case "dateTo":
    case "date":
      return <DateParam label={p.label} value={value} onChange={onChange} allowEmpty={p.default === undefined} />;
    case "monthFrom":
    case "monthTo":
      return <MonthParam label={p.label} value={value} onChange={onChange} />;
    case "warehouse":
      return (
        <SelectField searchable label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">All my warehouses</option>
          {lookups?.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </SelectField>
      );
    case "catalog":
    case "category":
    case "customer":
    case "user": {
      const list = p.kind === "catalog" ? lookups?.catalogs : p.kind === "category" ? lookups?.categories : p.kind === "customer" ? lookups?.customers : lookups?.users;
      return (
        <SelectField searchable label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
          {any}
          {list?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </SelectField>
      );
    }
    case "project":
    case "supplier": {
      const list = p.kind === "project" ? lookups?.projects : lookups?.suppliers;
      return (
        <SelectField searchable label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
          {any}
          {list?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} · {x.name}
            </option>
          ))}
        </SelectField>
      );
    }
    case "select":
      return (
        <SelectField label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
          {any}
          {p.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      );
    case "boolean":
      return (
        <div className={styles.checkField}>
          <Checkbox label={p.label} checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "")} />
        </div>
      );
    case "product":
      return <ProductParam label={p.label} value={value} onChange={onChange} />;
    default:
      if (p.key === "entityType" && lookups?.recordTypes.length) {
        return (
          <SelectField searchable label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
            {any}
            {lookups.recordTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
        );
      }
      return <TextField label={p.label} value={value} placeholder={p.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

function DateParam({ label, value, onChange, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; allowEmpty: boolean }) {
  const custom = value !== "" && !isDateToken(value);
  const [showDate, setShowDate] = useState(custom);
  useEffect(() => setShowDate(value !== "" && !isDateToken(value)), [value]);
  return (
    <div className={styles.dateParam}>
      <SelectField
        label={label}
        value={showDate ? "custom" : value}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setShowDate(true);
            onChange(new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10));
          } else onChange(e.target.value);
        }}
      >
        {allowEmpty ? <option value="">Any</option> : null}
        {Object.entries(DATE_TOKENS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
        <option value="custom">A specific date…</option>
      </SelectField>
      {showDate ? <TextField label={<span className="visually-hidden">{label} date</span>} type="date" value={custom ? value : ""} onChange={(e) => onChange(e.target.value)} /> : null}
    </div>
  );
}

/** A month: a relative month ("This month", "5 months ago", …) or a specific month (YYYY-MM). */
function MonthParam({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const custom = value !== "" && !isMonthToken(value);
  const [showMonth, setShowMonth] = useState(custom);
  useEffect(() => setShowMonth(value !== "" && !isMonthToken(value)), [value]);
  return (
    <div className={styles.dateParam}>
      <SelectField
        label={label}
        value={showMonth ? "custom" : value}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setShowMonth(true);
            onChange(new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 7));
          } else onChange(e.target.value);
        }}
      >
        {Object.entries(MONTH_TOKENS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
        <option value="custom">A specific month…</option>
      </SelectField>
      {showMonth ? <TextField label={<span className="visually-hidden">{label} month</span>} type="month" value={custom ? value.slice(0, 7) : ""} onChange={(e) => onChange(e.target.value)} /> : null}
    </div>
  );
}

type LookupProduct = { id: string; code: string; name: string };

/** Product filter: the app's product dropdown (search inside the list) plus a clear button. */
function ProductParam({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [chosen, setChosen] = useState<LookupProduct | null>(null);
  useEffect(() => {
    if (!value) setChosen(null);
  }, [value]);
  const text = chosen && chosen.id === value ? `${chosen.code} · ${chosen.name}` : value ? "Selected product" : "All products";
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <div className={styles.productFilter}>
        <ProductSelect<LookupProduct>
          id={id}
          label={label}
          text={text}
          placeholder={!value}
          className={fieldStyles.input}
          search={(q) => api<{ data: LookupProduct[] }>("/reports/lookups/products", { query: { q } }).then((r) => r.data)}
          onSelect={(p) => {
            setChosen(p);
            onChange(p.id);
          }}
        />
        {value ? (
          <button type="button" className={styles.productClear} onClick={() => onChange("")} aria-label={`Clear ${label.toLowerCase()}`}>
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
