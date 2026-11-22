import { LETTERHEAD_DATA_URI, LETTERHEAD_LANDSCAPE_DATA_URI } from "./letterhead-data";

/**
 * The company pad (letterhead) for A4 PDFs: the pad image fills every page and the document is
 * laid out in its white area. Portrait is the pad as designed; landscape (wide reports) is
 * composed from the same artwork by scripts/build-letterhead.mjs.
 *
 * Chromium clips page content to the @page margins, so the page has no margins and the white
 * area is kept clear by a wrapper table instead: its header and footer rows are empty spacers,
 * which Chromium repeats on every page, and its side padding is the left / right margin.
 */
export type PadOrientation = "portrait" | "landscape";

const SIDE = "14mm";
const PADS = {
  // top: below the pad's header. bottom: clears the dealer logos plus one line for the footer
  // text, which sits at `foot` from the bottom edge.
  portrait: { image: LETTERHEAD_DATA_URI, width: "210mm", height: "297mm", top: "36mm", bottom: "34mm", foot: "28mm" },
  landscape: { image: LETTERHEAD_LANDSCAPE_DATA_URI, width: "297mm", height: "210mm", top: "31mm", bottom: "32mm", foot: "26mm" },
} as const;

/** Use in place of the template's own `@page` rule. Written to win over a template's bare `table` / `tr` / `td` rules. */
export function letterheadCss(orientation: PadOrientation = "portrait"): string {
  const pad = PADS[orientation];
  return `@page { size: A4 ${orientation}; margin: 0; }
  .pad { position: fixed; top: 0; left: 0; width: ${pad.width}; height: ${pad.height}; z-index: -1; }
  table.sheet { width: 100%; border-collapse: collapse; border: 0; }
  table.sheet > thead { display: table-header-group; }
  table.sheet > tfoot { display: table-footer-group; }
  table.sheet > tbody > tr { break-inside: auto; page-break-inside: auto; }
  table.sheet > thead > tr > td, table.sheet > tfoot > tr > td, table.sheet > tbody > tr > td { padding: 0 ${SIDE}; border: 0; background: none; }
  table.sheet table tr, table.sheet .sign { break-inside: avoid; }
  .sheet-top { height: ${pad.top}; }
  .sheet-bottom { height: ${pad.bottom}; }`;
}

/** Position of a template's fixed footer line ("printed by …"): just above the pad's dealer logos. */
export function letterheadFootCss(orientation: PadOrientation = "portrait"): string {
  return `bottom: ${PADS[orientation].foot}; left: ${SIDE}; right: ${SIDE};`;
}

/**
 * Chromium footer template (`htmlToPdf({ footerTemplate })`) for multi-page documents: `text` on the
 * left and "Page x of y" on the right, on the same line as `letterheadFootCss`. Chromium draws it
 * over the page even though the page has no margins. `text` must already be HTML-escaped.
 */
export function letterheadPageFooter(text: string, orientation: PadOrientation = "portrait"): string {
  return `<div style="font-family:Arial,sans-serif;font-size:7px;color:#8d8d8d;width:100%;padding:0 ${SIDE};margin-bottom:${PADS[orientation].foot};display:flex;justify-content:space-between;"><span>${text}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

export const LETTERHEAD_CSS = letterheadCss();
export const LETTERHEAD_FOOT_CSS = letterheadFootCss();

/** Wraps the document's flowing content. Fixed elements (footer line, watermark) go after it. */
export function onLetterhead(content: string, orientation: PadOrientation = "portrait"): string {
  return `<img class="pad" src="${PADS[orientation].image}" alt="">
<table class="sheet">
<thead><tr><td><div class="sheet-top"></div></td></tr></thead>
<tfoot><tr><td><div class="sheet-bottom"></div></td></tr></tfoot>
<tbody><tr><td>
${content}
</td></tr></tbody>
</table>`;
}
