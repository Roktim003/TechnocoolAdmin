"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { ProductOption } from "./types";
import styles from "./stock.module.css";

interface Props {
  value: ProductOption | null;
  onChange: (p: ProductOption | null) => void;
  label?: string;
  /** Only active products (new receipts and issues can't use discontinued ones). */
  activeOnly?: boolean;
  invalid?: boolean;
}

/** Search-as-you-type product picker (code, name, model, barcode). */
export function ProductPicker({ value, onChange, label = "Product", activeOnly = true, invalid }: Props) {
  const id = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<{ data: ProductOption[] }>("/products", { query: { q, pageSize: 12, sort: "name", status: activeOnly ? "ACTIVE" : undefined } })
        .then((r) => {
          setItems(r.data);
          setActive(0);
        })
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, activeOnly]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (p: ProductOption) => {
    onChange(p);
    setOpen(false);
    setQ("");
  };

  if (value) {
    return (
      <div className={styles.pickerChosen}>
        <div>
          <div>{value.name}</div>
          <div className={styles.lineMeta}>
            <span className={styles.mono}>{value.code}</span>
            {value.model ? ` · ${value.model}` : ""} · {value.unit.code}
            {value.trackSerial ? " · serial tracked" : ""}
          </div>
        </div>
        <button type="button" className={styles.linkButton} onClick={() => onChange(null)} aria-label={`Change product ${value.code}`}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className={styles.picker} ref={box}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        className={`${styles.cellInput} ${invalid ? styles.cellInputError : ""}`}
        placeholder="Search code, name or model…"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && open && items[active]) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && items.length > 0 ? (
        <ul className={styles.pickerList} id={`${id}-list`} role="listbox">
          {items.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" className={`${styles.pickerItem} ${i === active ? styles.pickerActive : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                <span className={styles.mono}>{p.code}</span> — {p.name}
                {p.model ? <span className={styles.muted}> · {p.model}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
