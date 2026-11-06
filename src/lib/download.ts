/**
 * Downloads a same-origin file (e.g. a generated PDF) by clicking a temporary link.
 *
 * Not window.open: PDFs are ready only after polling, and browsers silently block a new tab
 * opened after an await as a pop-up. A download link click is not blocked.
 */
export function downloadFile(url: string, fileName?: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName ?? "";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
