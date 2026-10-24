import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** Right-align (numbers, actions). */
  align?: "end";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  loading?: boolean;
  emptyMessage?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Makes rows clickable (also Enter / Space when the row is focused). */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
}

/** Data table with a toolbar slot; wide tables scroll horizontally inside their tile. */
export function DataTable<T>({ columns, rows, rowKey, caption, loading, emptyMessage = "No results.", toolbar, footer, onRowClick, rowLabel }: DataTableProps<T>) {
  return (
    <div className={styles.container}>
      {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
      <div className={styles.scroll} role="region" aria-label={caption} tabIndex={0}>
        <table className={styles.table} aria-busy={loading || undefined}>
          {caption ? <caption className="visually-hidden">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={[c.className, c.align === "end" ? styles.end : ""].filter(Boolean).join(" ")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.message}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.message}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={[loading ? styles.stale : "", onRowClick ? styles.clickable : ""].filter(Boolean).join(" ") || undefined}
                  onClick={onRowClick ? (e) => !(e.target as HTMLElement).closest("a,button,input,select") && onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={[c.className, c.align === "end" ? styles.end : ""].filter(Boolean).join(" ")}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
