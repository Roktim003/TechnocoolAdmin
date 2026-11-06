"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { APP_TIMEZONE } from "@/shared/config/constants";
import { Icon } from "./Icon";
import styles from "./DateInput.module.css";

/**
 * Gr8r Studio date / month picker. Like Select, a hidden native <input type="date|month"> stays
 * the source of truth, so `value` / `onChange={(e) => e.target.value}` / `name` work exactly as
 * with the native input ("2026-11-07" / "2026-11"). A styled button opens a calendar popover,
 * portalled to <body> and positioned in page coordinates.
 *
 * Keyboard: ← → ↑ ↓ move by day / week, PageUp / PageDown by month (+Shift: year),
 * Home / End to the start / end of the week, Enter or Space picks, Esc closes.
 */
export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  type: "date" | "month";
  /** Class for the visible trigger button. */
  className?: string;
  /** id goes on the trigger so <label htmlFor> focuses it. */
  id?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WIDTH = 288;

interface Ymd {
  y: number;
  m: number; // 0-11
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = ({ y, m, d }: Ymd) => `${y}-${pad(m + 1)}-${pad(d)}`;
const isoMonth = (y: number, m: number) => `${y}-${pad(m + 1)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());

function parse(v: string | undefined | null): Ymd | null {
  const x = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v ?? "");
  if (!x) return null;
  return { y: Number(x[1]), m: Number(x[2]) - 1, d: x[3] ? Number(x[3]) : 1 };
}

/** Moves by days / months, clamping the day to the target month (31 Jan + 1 month → 28 Feb). */
function shift(p: Ymd, days: number, months = 0): Ymd {
  if (months) {
    const t = new Date(p.y, p.m + months, 1);
    return { y: t.getFullYear(), m: t.getMonth(), d: Math.min(p.d, daysIn(t.getFullYear(), t.getMonth())) };
  }
  const t = new Date(p.y, p.m, p.d + days);
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}

function display(type: "date" | "month", v: string): string {
  const p = parse(v);
  if (!p) return "";
  return type === "month" ? `${MONTHS[p.m]} ${p.y}` : `${pad(p.d)} ${MONTHS[p.m]} ${p.y}`;
}

/** Set the hidden input's value and fire a real input event so React's onChange runs. */
function commit(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function DateInput({ type, className, id, value, min, max, disabled, required, placeholder, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy, "aria-label": ariaLabel, ...native }: DateInputProps) {
  const auto = useId();
  const triggerId = id ?? `${auto}-trigger`;
  const gridId = `${auto}-grid`;
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const current = typeof value === "string" ? value : (input.current?.value ?? "");
  const lo = typeof min === "string" && min ? min : null;
  const hi = typeof max === "string" && max ? max : null;
  const today = todayIso();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months">(type === "month" ? "months" : "days");
  const [cursor, setCursor] = useState<Ymd>(() => parse(current) ?? parse(today)!);
  const [pos, setPos] = useState<CSSProperties>({});

  const dayOk = (iso: string) => (!lo || iso >= lo) && (!hi || iso <= hi);
  const monthOk = (y: number, m: number) => {
    const k = isoMonth(y, m);
    return (!lo || k >= lo.slice(0, 7)) && (!hi || k <= hi.slice(0, 7));
  };

  const place = useCallback(() => {
    const t = trigger.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 340;
    const below = window.innerHeight - r.bottom;
    const up = below < h + 12 && r.top > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)) + window.scrollX;
    setPos({ left, top: (up ? r.top - h - 4 : r.bottom + 4) + window.scrollY });
  }, []);

  function openPop() {
    if (disabled) return;
    setCursor(parse(current) ?? parse(today)!);
    setView(type === "month" ? "months" : "days");
    place();
    setOpen(true);
  }

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  }, []);

  function choose(v: string) {
    if (input.current) commit(input.current, v);
    close();
  }

  // Position once rendered (its height decides flip-up), focus the grid, follow inner scrolling / resize.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    grid.current?.focus();
    const onScroll = (e: Event) => {
      if (e.target === document || pop.current?.contains(e.target as Node)) return;
      place();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place, close]);

  // Re-focus the grid when switching between the day and month views.
  useLayoutEffect(() => {
    if (open) grid.current?.focus();
  }, [view, open]);

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openPop();
    }
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const months = view === "months";
    const step: Record<string, () => Ymd> = months
      ? {
          ArrowLeft: () => shift(cursor, 0, -1),
          ArrowRight: () => shift(cursor, 0, 1),
          ArrowUp: () => shift(cursor, 0, -3),
          ArrowDown: () => shift(cursor, 0, 3),
          PageUp: () => shift(cursor, 0, -12),
          PageDown: () => shift(cursor, 0, 12),
        }
      : {
          ArrowLeft: () => shift(cursor, -1),
          ArrowRight: () => shift(cursor, 1),
          ArrowUp: () => shift(cursor, -7),
          ArrowDown: () => shift(cursor, 7),
          PageUp: () => shift(cursor, 0, e.shiftKey ? -12 : -1),
          PageDown: () => shift(cursor, 0, e.shiftKey ? 12 : 1),
          Home: () => shift(cursor, -new Date(cursor.y, cursor.m, cursor.d).getDay()),
          End: () => shift(cursor, 6 - new Date(cursor.y, cursor.m, cursor.d).getDay()),
        };
    if (step[e.key]) {
      e.preventDefault();
      setCursor(step[e.key]!());
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (months) pickMonth(cursor.y, cursor.m);
      else if (dayOk(isoDay(cursor))) choose(isoDay(cursor));
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Don't also close a surrounding modal (it listens on document).
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (months && type === "date") setView("days");
      else close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      close();
    }
  }

  function pickMonth(y: number, m: number) {
    if (!monthOk(y, m)) return;
    if (type === "month") return choose(isoMonth(y, m));
    setCursor((c) => ({ y, m, d: Math.min(c.d, daysIn(y, m)) }));
    setView("days");
  }

  // ── Day grid: 6 weeks starting on the Sunday on or before the 1st ──
  const first = new Date(cursor.y, cursor.m, 1);
  const start = shift({ y: cursor.y, m: cursor.m, d: 1 }, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => shift(start, i));
  const selected = current;
  const cursorIso = isoDay(cursor);
  const canPrev = view === "days" ? !lo || isoMonth(cursor.y, cursor.m) > lo.slice(0, 7) : !lo || String(cursor.y) > lo.slice(0, 4);
  const canNext = view === "days" ? !hi || isoMonth(cursor.y, cursor.m) < hi.slice(0, 7) : !hi || String(cursor.y) < hi.slice(0, 4);
  const thisMonth = today.slice(0, 7);
  const todayAllowed = type === "month" ? monthOk(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1) : dayOk(today);
  const shown = display(type, current);

  return (
    <span className={styles.wrap}>
      <input ref={input} type={type} {...native} value={value} tabIndex={-1} aria-hidden="true" className={styles.native} disabled={disabled} />
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${auto}-pop`}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
        disabled={disabled}
        className={[styles.trigger, open ? styles.open : "", className].filter(Boolean).join(" ")}
        onClick={() => (open ? close() : openPop())}
        onKeyDown={onTriggerKey}
      >
        <span className={[styles.value, shown ? "" : styles.placeholder].filter(Boolean).join(" ")}>{shown || placeholder || (type === "month" ? "Select month" : "Select date")}</span>
        <Icon name="calendar" size={15} className={styles.icon} />
      </button>
      {open
        ? createPortal(
            <div ref={pop} id={`${auto}-pop`} className={styles.pop} style={{ ...pos, width: WIDTH }} role="dialog" aria-label={type === "month" ? "Choose month" : "Choose date"}>
              <div className={styles.head}>
                <button type="button" className={styles.nav} onClick={() => setCursor(shift(cursor, 0, view === "days" ? -1 : -12))} disabled={!canPrev} aria-label={view === "days" ? "Previous month" : "Previous year"}>
                  <Icon name="chevronLeft" size={16} />
                </button>
                {view === "days" ? (
                  <button type="button" className={styles.title} onClick={() => setView("months")} aria-label={`${MONTHS_LONG[cursor.m]} ${cursor.y}, choose month`}>
                    {MONTHS_LONG[cursor.m]} {cursor.y}
                    <Icon name="chevronDown" size={13} className={styles.titleChevron} />
                  </button>
                ) : (
                  <span className={styles.titleStatic}>{cursor.y}</span>
                )}
                <button type="button" className={styles.nav} onClick={() => setCursor(shift(cursor, 0, view === "days" ? 1 : 12))} disabled={!canNext} aria-label={view === "days" ? "Next month" : "Next year"}>
                  <Icon name="chevronRight" size={16} />
                </button>
              </div>

              {view === "days" ? (
                <>
                  <div className={styles.week} aria-hidden="true">
                    {WEEKDAYS.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </div>
                  <div ref={grid} id={gridId} role="grid" tabIndex={0} className={styles.days} aria-activedescendant={`${gridId}-${cursorIso}`} onKeyDown={onGridKey}>
                    {cells.map((c) => {
                      const iso = isoDay(c);
                      const ok = dayOk(iso);
                      return (
                        <div
                          key={iso}
                          id={`${gridId}-${iso}`}
                          role="gridcell"
                          aria-selected={iso === selected}
                          aria-disabled={!ok || undefined}
                          aria-label={`${c.d} ${MONTHS_LONG[c.m]} ${c.y}${iso === today ? ", today" : ""}`}
                          className={[styles.day, c.m !== cursor.m ? styles.outside : "", iso === today ? styles.today : "", iso === selected ? styles.selected : "", iso === cursorIso ? styles.cursor : "", ok ? "" : styles.off].filter(Boolean).join(" ")}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => ok && choose(iso)}
                        >
                          {c.d}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div ref={grid} id={gridId} role="grid" tabIndex={0} className={styles.months} aria-activedescendant={`${gridId}-m${cursor.m}`} onKeyDown={onGridKey}>
                  {MONTHS.map((name, m) => {
                    const ok = monthOk(cursor.y, m);
                    const k = isoMonth(cursor.y, m);
                    return (
                      <div
                        key={name}
                        id={`${gridId}-m${m}`}
                        role="gridcell"
                        aria-selected={k === selected.slice(0, 7)}
                        aria-disabled={!ok || undefined}
                        aria-label={`${MONTHS_LONG[m]} ${cursor.y}`}
                        className={[styles.month, k === thisMonth ? styles.today : "", k === selected.slice(0, 7) ? styles.selected : "", m === cursor.m ? styles.cursor : "", ok ? "" : styles.off].filter(Boolean).join(" ")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickMonth(cursor.y, m)}
                      >
                        {name}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={styles.foot}>
                {!required && current ? (
                  <button type="button" className={styles.link} onClick={() => choose("")}>
                    Clear
                  </button>
                ) : (
                  <span />
                )}
                {todayAllowed ? (
                  <button type="button" className={styles.link} onClick={() => choose(type === "month" ? thisMonth : today)}>
                    {type === "month" ? "This month" : "Today"}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
