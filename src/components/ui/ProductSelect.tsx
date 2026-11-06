"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ProductSelect.module.css";

/** The fields the dropdown shows for each product. */
export interface ProductSelectItem {
  id: string;
  code: string;
  name: string;
  model?: string | null;
}

interface Props<T extends ProductSelectItem> {
  /** Loads the products matching the search text ("" = the first page). */
  search: (q: string) => Promise<T[]>;
  onSelect: (p: T) => void;
  /** Accessible name of the button and the list. */
  label: string;
  /** Text on the button (e.g. "Select product…" or the chosen product). */
  text?: string;
  /** True when `text` is a placeholder rather than a chosen value (shown muted). */
  placeholder?: boolean;
  /** Input-look class for the button, so it matches the surrounding form. */
  className?: string;
  invalid?: boolean;
  invalidClassName?: string;
  /** Lets an outer <label htmlFor> point at the button. */
  id?: string;
}

/**
 * The app's product dropdown: a button that opens a panel with its own search box
 * (name, code, model, barcode) above the results. Arrow keys move, Enter picks, Esc closes.
 *
 * The panel is portalled to <body> (so table scroll areas can't clip it) and positioned
 * absolutely in page coordinates, so it scrolls with the page and stays under the button.
 */
export function ProductSelect<T extends ProductSelectItem>({ search, onSelect, label, text = "Select product…", placeholder = true, className, invalid, invalidClassName, id: buttonId }: Props<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // `search` is usually an inline function; keep the latest without re-running the effect.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchRef
        .current(q.trim())
        .then((r) => {
          if (!live) return;
          setItems(r);
          setActive(0);
        })
        .catch(() => live && setItems([]))
        .finally(() => live && setLoading(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  // Close on a click outside the button and the panel.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (trigger.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Page coordinates: page scrolling moves the panel with the button for free. Only
  // resizes and inner scroll areas (e.g. a table scrolling sideways) re-place it.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: Math.max(r.width, 380) });
    };
    place();
    const onScroll = (e: Event) => {
      if (e.target !== document) place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) input.current?.focus();
  }, [open, pos]);

  // Keep the highlighted row visible while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    setOpen(false);
    setQ("");
    trigger.current?.focus();
  };

  const choose = (p: T) => {
    setOpen(false);
    setQ("");
    onSelect(p);
  };

  return (
    <>
      <button
        ref={trigger}
        id={buttonId}
        type="button"
        className={[className, styles.trigger, invalid ? invalidClassName : ""].filter(Boolean).join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={buttonId ? undefined : label}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={placeholder ? styles.placeholder : styles.value}>{text}</span>
        <span aria-hidden className={styles.chevron}>
          ▾
        </span>
      </button>
      {open && pos
        ? createPortal(
            <div ref={panel} className={styles.panel} style={pos}>
              <div className={styles.searchWrap}>
                <input
                  ref={input}
                  className={styles.search}
                  type="search"
                  placeholder="Search by name, code or model…"
                  aria-label={`Search ${label.toLowerCase()}`}
                  value={q}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-activedescendant={items[active] ? `${id}-opt-${active}` : undefined}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
                    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                    else if (e.key === "Enter") {
                      if (items[active]) choose(items[active]);
                    } else if (e.key === "Escape") close();
                    else if (e.key === "Tab") return setOpen(false);
                    else return;
                    e.preventDefault();
                  }}
                />
              </div>
              <ul ref={listRef} className={styles.list} id={listId} role="listbox" aria-label={label}>
                {items.map((p, i) => (
                  <li key={p.id} id={`${id}-opt-${i}`} data-index={i} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`${styles.item} ${i === active ? styles.active : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(p)}
                    >
                      <span className={styles.name}>{p.name}</span>
                      <span className={styles.meta}>
                        <span className={styles.code}>{p.code}</span>
                        {p.model ? ` · ${p.model}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {!items.length ? <li className={styles.empty}>{loading ? "Searching…" : q.trim() ? `No products match “${q.trim()}”.` : "No products."}</li> : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
