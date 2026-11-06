"use client";

import { useEffect } from "react";

/** React marks DOM nodes it owns with a `__reactFiber$…` key once they are hydrated or client-rendered. */
const owned = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber"));

/** Header text without screen-reader-only parts ("Remove", "Actions"): those aren't shown as labels. */
function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && node.classList.contains("visually-hidden")) return "";
  return Array.from(node.childNodes).map(visibleText).join("");
}

/**
 * Gives table cells a `data-label` with their column header's text (respecting colspan), so
 * CSS can show tables as labelled cards on phones (see `.lines` in stock.module.css).
 * DataTable renders its own labels (`data-labelled`) and is skipped.
 *
 * Only rows React already owns are touched: changing server-rendered markup before React has
 * hydrated it causes a hydration mismatch. Rows not hydrated yet are retried shortly after;
 * a MutationObserver keeps new rows labelled. Renders nothing.
 */
export function TableLabels() {
  useEffect(() => {
    let frame = 0;
    let retry = 0;
    let tries = 0;

    const label = () => {
      frame = 0;
      let pending = false;
      for (const table of document.querySelectorAll<HTMLTableElement>("main table:not([data-labelled])")) {
        const head = table.tHead?.rows[0];
        if (!head) continue;
        const names: string[] = [];
        for (const th of Array.from(head.cells)) {
          const text = visibleText(th).replace(/\s+/g, " ").trim();
          for (let i = 0; i < (th.colSpan || 1); i++) names.push(text);
        }
        for (const body of Array.from(table.tBodies)) {
          for (const row of Array.from(body.rows)) {
            if (!owned(row)) {
              pending = true;
              continue;
            }
            let col = 0;
            for (const cell of Array.from(row.cells)) {
              const name = names[col] ?? "";
              // Only cells that line up with one named header column get a label.
              if (cell.colSpan > 1 || !name) cell.removeAttribute("data-label");
              else if (cell.getAttribute("data-label") !== name) cell.setAttribute("data-label", name);
              col += cell.colSpan || 1;
            }
          }
        }
      }
      // Some rows weren't hydrated yet: look again in a moment (for up to ~15 s).
      if (pending && tries++ < 30) retry = window.setTimeout(schedule, 500);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(label);
    };

    schedule();
    const obs = new MutationObserver(() => {
      tries = 0;
      schedule();
    });
    obs.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      clearTimeout(retry);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
