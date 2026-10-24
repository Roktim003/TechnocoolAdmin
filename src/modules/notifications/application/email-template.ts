/** Minimal Carbon-style HTML email: white card on a grey page, IBM Plex (with fallbacks), blue links. */

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FONT = `'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif`;

export interface EmailContent {
  title: string;
  /** Plain text paragraphs. */
  paragraphs: string[];
  /** Absolute URL for the call to action. */
  link?: string | null;
  linkLabel?: string;
  /** Optional table (header row + rows), e.g. the low-stock digest. */
  table?: { head: string[]; rows: string[][]; alignRight?: number[] };
  footer?: string;
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const right = new Set(c.table?.alignRight ?? []);
  const table = c.table
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
<tr>${c.table.head.map((h, i) => `<th style="text-align:${right.has(i) ? "right" : "left"};padding:8px;background:#e0e0e0;font-weight:600">${esc(h)}</th>`).join("")}</tr>
${c.table.rows.map((r) => `<tr>${r.map((v, i) => `<td style="padding:8px;border-bottom:1px solid #e0e0e0;text-align:${right.has(i) ? "right" : "left"}">${esc(v)}</td>`).join("")}</tr>`).join("\n")}
</table>`
    : "";
  const button = c.link
    ? `<p style="margin:24px 0 0"><a href="${esc(c.link)}" style="display:inline-block;background:#0f62fe;color:#ffffff;text-decoration:none;padding:11px 16px;font-size:14px">${esc(c.linkLabel ?? "Open in StockBook")}</a></p>
<p style="margin:12px 0 0;font-size:12px;color:#525252">Or open <a href="${esc(c.link)}" style="color:#0f62fe">${esc(c.link)}</a></p>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${FONT};color:#161616">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff">
<tr><td style="padding:16px 24px;border-bottom:1px solid #e0e0e0;font-size:14px"><strong>StockBook</strong></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;font-weight:400;line-height:1.4">${esc(c.title)}</h1>
${c.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${esc(p)}</p>`).join("\n")}
${table}
${button}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e0e0e0;font-size:12px;color:#6f6f6f">${esc(c.footer ?? "You get this email because of your StockBook notification settings. Change them under Settings → Notifications.")}</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    c.title,
    "",
    ...c.paragraphs,
    ...(c.table ? ["", c.table.head.join(" | "), ...c.table.rows.map((r) => r.join(" | "))] : []),
    ...(c.link ? ["", `${c.linkLabel ?? "Open in StockBook"}: ${c.link}`] : []),
    "",
    "--",
    c.footer ?? "StockBook notification settings: Settings → Notifications.",
  ].join("\n");
  return { html, text };
}
