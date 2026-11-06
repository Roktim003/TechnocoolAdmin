"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import styles from "./Select.module.css";

/**
 * Gr8r Studio select. A hidden native <select> stays the source of truth (value, name, onChange,
 * form submission all work as before); a styled button and popover menu sit on top of it.
 * Lists longer than FILTER_AT options, and every `searchable` one, get a search box. Keyboard:
 * ↑ ↓ Home End Enter Esc Tab, and type-ahead when there is no search box.
 *
 * The menu is portalled to <body> and positioned in page coordinates, so it scrolls with the
 * page and stays under the button.
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Class for the visible trigger button (it takes the place of the select visually). */
  className?: string;
  /** id goes on the trigger so <label htmlFor> focuses it. */
  id?: string;
  /** Always show the search box (lists of suppliers, projects, warehouses, …), however short. */
  searchable?: boolean;
}

interface Item {
  kind: "option" | "group";
  label: string;
  value: string;
  disabled: boolean;
  index: number; // option index in the native select (-1 for groups)
}

const FILTER_AT = 5;

/** Set the native select's value and fire a real change event so React's onChange runs. */
function pick(sel: HTMLSelectElement, value: string) {
  if (sel.value === value) return;
  sel.value = value;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

function readItems(sel: HTMLSelectElement): Item[] {
  const out: Item[] = [];
  let i = 0;
  for (const node of Array.from(sel.children)) {
    if (node instanceof HTMLOptGroupElement) {
      out.push({ kind: "group", label: node.label, value: "", disabled: true, index: -1 });
      for (const o of Array.from(node.children)) {
        if (o instanceof HTMLOptionElement) out.push({ kind: "option", label: o.text, value: o.value, disabled: o.disabled || node.disabled, index: i++ });
      }
    } else if (node instanceof HTMLOptionElement) {
      out.push({ kind: "option", label: node.text, value: node.value, disabled: node.disabled, index: i++ });
    }
  }
  return out;
}

export function Select({ className, id, children, disabled, searchable,"aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy, ...native }: SelectProps) {
  const auto = useId();
  const triggerId = id ?? `${auto}-trigger`;
  const listId = `${auto}-list`;
  const sel = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const [label, setLabel] = useState("");
  const [placeholder, setPlaceholder] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(-1);
  const [filter, setFilter] = useState("");
  const [pos, setPos] = useState<CSSProperties>({});

  // Keep the trigger text in step with the native select (controlled value, new options, etc.).
  const sync = useCallback(() => {
    const s = sel.current;
    if (!s) return;
    const o = s.options[s.selectedIndex];
    setLabel(o?.text ?? "");
    setPlaceholder(!o || o.value === "");
  }, []);
  useLayoutEffect(sync);

  const shown = filter ? items.filter((it) => it.kind === "option" && it.label.toLowerCase().includes(filter.toLowerCase())) : items;
  const options = shown.filter((it) => it.kind === "option" && !it.disabled);
  const withFilter = !!searchable || items.filter((it) => it.kind === "option").length > FILTER_AT;

  const place = useCallback(() => {
    const t = trigger.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 280;
    const below = window.innerHeight - r.bottom;
    const up = below < h + 12 && r.top > below;
    const width = Math.max(r.width, 180);
    const left = Math.min(r.left, window.innerWidth - width - 8) + window.scrollX;
    // Page coordinates (the menu is position: absolute on <body>), so page scrolling carries it along.
    setPos({ left, width, top: (up ? r.top - h - 4 : r.bottom + 4) + window.scrollY });
  }, []);

  function openMenu() {
    const s = sel.current;
    if (!s || disabled) return;
    const list = readItems(s);
    setItems(list);
    setFilter("");
    setActive(list.findIndex((it) => it.kind === "option" && it.index === s.selectedIndex));
    place();
    setOpen(true);
  }

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  }, []);

  function choose(it: Item | undefined) {
    const s = sel.current;
    if (!s || !it || it.kind !== "option" || it.disabled) return;
    pick(s, it.value);
    sync();
    close();
  }

  // Position after the menu renders (its height decides flip-up), then follow scroll / resize.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    if (withFilter) filterRef.current?.focus();
    const onScroll = (e: Event) => {
      // Page scrolling already carries the menu along; only inner scroll areas move the button.
      if (e.target === document || menu.current?.contains(e.target as Node)) return;
      place();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place, close, withFilter]);

  // Keep the active option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, filter]);

  // After filtering, move the highlight to the first match.
  useEffect(() => {
    if (open && filter) setActive(shown.findIndex((it) => it.kind === "option" && !it.disabled));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function move(delta: number) {
    if (!options.length) return;
    const cur = options.findIndex((o) => shown.indexOf(o) === active);
    const next = cur < 0 ? (delta > 0 ? 0 : options.length - 1) : Math.min(options.length - 1, Math.max(0, cur + delta));
    setActive(shown.indexOf(options[next]!));
  }

  function typeAhead(ch: string) {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + ch.toLowerCase(), at: now };
    const hit = options.find((o) => o.label.toLowerCase().startsWith(typed.current.text));
    if (hit) setActive(shown.indexOf(hit));
  }

  function onKey(e: KeyboardEvent<HTMLElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(shown.indexOf(options[0]!));
        break;
      case "End":
        e.preventDefault();
        setActive(shown.indexOf(options[options.length - 1]!));
        break;
      case "Enter":
        e.preventDefault();
        choose(shown[active]);
        break;
      case "Escape":
        e.preventDefault();
        // Don't also close a surrounding modal: it listens on document, where React's own listener lives too.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (!withFilter && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (e.key === " ") {
            e.preventDefault();
            choose(shown[active]);
          } else typeAhead(e.key);
        }
    }
  }

  const selectedIndex = sel.current?.selectedIndex ?? -1;
  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <span className={styles.wrap}>
      <select ref={sel} {...native} disabled={disabled} tabIndex={-1} aria-hidden="true" data-native-select="" className={styles.native} onChange={(e) => {
        native.onChange?.(e);
        sync();
      }}>
        {children}
      </select>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={withFilter ? undefined : activeId}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={native.required || undefined}
        disabled={disabled}
        className={[styles.trigger, open ? styles.open : "", className].filter(Boolean).join(" ")}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKey}
      >
        <span className={[styles.value, placeholder ? styles.placeholder : ""].filter(Boolean).join(" ")}>{label || " "}</span>
        <Icon name="chevronDown" size={13} className={styles.chevron} />
      </button>
      {open
        ? createPortal(
            <div ref={menu} className={styles.menu} style={pos} onKeyDown={withFilter ? onKey : undefined}>
              {withFilter ? (
                <div className={styles.filterWrap}>
                  <Icon name="search" size={13} className={styles.filterIcon} />
                  <input
                    ref={filterRef}
                    className={styles.filter}
                    placeholder="Search…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={activeId}
                    aria-label="Filter options"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              ) : null}
              <div id={listId} role="listbox" aria-labelledby={triggerId} className={styles.list}>
                {shown.length === 0 ? <div className={styles.none}>No matches</div> : null}
                {shown.map((it, i) =>
                  it.kind === "group" ? (
                    <div key={`g${i}`} role="presentation" className={styles.group}>
                      {it.label}
                    </div>
                  ) : (
                    <div
                      key={`${it.index}`}
                      id={`${listId}-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={it.index === selectedIndex}
                      aria-disabled={it.disabled || undefined}
                      className={[styles.item, i === active ? styles.active : "", it.disabled ? styles.disabled : "", it.value === "" ? styles.placeholder : ""].filter(Boolean).join(" ")}
                      onMouseEnter={() => !it.disabled && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(it)}
                    >
                      <span className={styles.itemLabel}>{it.label || " "}</span>
                      {it.index === selectedIndex ? <Icon name="check" size={14} className={styles.check} /> : null}
                    </div>
                  ),
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
