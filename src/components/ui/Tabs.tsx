"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
}

/** Underline tabs (selected = 2px primary bottom border). Panels are rendered by the caller. */
export function Tabs<K extends string>({ items, selected, onChange, label }: { items: TabItem<K>[]; selected: K; onChange: (key: K) => void; label: string }) {
  const id = useId();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    const next = items[(index + delta + items.length) % items.length]!;
    onChange(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {items.map((item, i) => {
        const active = item.key === selected;
        return (
          <button
            key={item.key}
            id={`${id}-${item.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`${styles.tab} ${active ? styles.selected : ""}`}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control: 1px dark border; selected = dark fill + white text. */
export function ContentSwitcher<K extends string>({ items, selected, onChange, label }: { items: TabItem<K>[]; selected: K; onChange: (key: K) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className={styles.switcher}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.key === selected}
          className={`${styles.switch} ${item.key === selected ? styles.switchSelected : ""}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
