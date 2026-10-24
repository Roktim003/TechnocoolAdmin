"use client";

import { useEffect, useId, useState } from "react";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api-client";
import { DATE_TOKENS, isDateToken } from "@/modules/reporting/domain/schedule";
import type { Lookups, ParamDef } from "./types";
import styles from "./reports.module.css";

/**
 * The filter fields of one report. Dates offer relative periods ("Start of this month", "Today",
 * …) or a fixed date: schedules keep the relative ones, so each email covers a fresh period.
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
    case "warehouse":
      return (
        <SelectField label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
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
        <SelectField label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
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
        <SelectField label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
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
          <SelectField label={p.label} value={value} onChange={(e) => onChange(e.target.value)}>
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

function ProductParam({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const listId = useId();
  const [text, setText] = useState("");
  const [options, setOptions] = useState<{ id: string; code: string; name: string }[]>([]);
  useEffect(() => {
    if (!value) setText("");
  }, [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ data: typeof options }>("/reports/lookups/products", { query: { q: text } })
        .then((r) => setOptions(r.data))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <>
      <TextField
        label={label}
        list={listId}
        value={text || (value ? (options.find((o) => o.id === value)?.code ?? "Selected product") : "")}
        placeholder="Code or name"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const hit = options.find((o) => `${o.code} · ${o.name}` === v);
          onChange(hit ? hit.id : "");
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={`${o.code} · ${o.name}`} />
        ))}
      </datalist>
    </>
  );
}
