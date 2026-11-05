"use client";

import { Icon } from "./Icon";
import { Select } from "./Select";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizes?: number[];
  onChange: (page: number, pageSize: number) => void;
}

export function Pagination({ page, pageSize, total, pageSizes = [10, 20, 50, 100], onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={styles.pagination}>
      <div className={styles.size}>
        <span aria-hidden="true">Items per page:</span>
        <span className={styles.sizeSelect}>
          <Select aria-label="Items per page" value={pageSize} onChange={(e) => onChange(1, Number(e.target.value))} className={styles.select}>
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </span>
      </div>
      <span className={styles.range}>
        {from}–{to} of {total} items
      </span>
      <span className={styles.pages}>
        Page {page} of {totalPages}
      </span>
      <div className={styles.nav}>
        <button type="button" className={styles.button} onClick={() => onChange(page - 1, pageSize)} disabled={page <= 1} aria-label="Previous page">
          <Icon name="chevronLeft" size={15} />
        </button>
        <button type="button" className={styles.button} onClick={() => onChange(page + 1, pageSize)} disabled={page >= totalPages} aria-label="Next page">
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}
