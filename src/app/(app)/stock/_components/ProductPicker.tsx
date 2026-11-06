"use client";

import { ProductSelect } from "@/components/ui/ProductSelect";
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

/** Product cell for entry, PO and count lines: the shared product dropdown, or the chosen product with "Change". */
export function ProductPicker({ value, onChange, label = "Product", activeOnly = true, invalid }: Props) {
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
    <div className={styles.picker}>
      <ProductSelect<ProductOption>
        label={label}
        className={styles.cellInput}
        invalid={invalid}
        invalidClassName={styles.cellInputError}
        search={(q) => api<{ data: ProductOption[] }>("/products", { query: { q: q || undefined, pageSize: 20, sort: "name", status: activeOnly ? "ACTIVE" : undefined } }).then((r) => r.data)}
        onSelect={onChange}
      />
    </div>
  );
}
