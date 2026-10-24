import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

/**
 * HTML → PDF with a headless Chromium. Runs only in the worker process. The browser comes from
 * PDF_BROWSER_PATH, or the first one found: Alpine's chromium (Docker image), then Chrome / Edge.
 */
const CANDIDATES = [
  process.env.PDF_BROWSER_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function browserPath(): string | null {
  return CANDIDATES.find((p): p is string => !!p && existsSync(p)) ?? null;
}

export interface PdfOptions {
  landscape?: boolean;
  /** Chromium footer template (e.g. page "x of y"); needs a bottom margin. */
  footerTemplate?: string;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Uint8Array> {
  const executablePath = browserPath();
  if (!executablePath) throw new Error("No Chromium/Chrome/Edge found for PDF rendering. Set PDF_BROWSER_PATH.");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    // No network: the document is self-contained.
    await page.setRequestInterception(true);
    page.on("request", (r) => (r.url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: !opts.landscape && !opts.footerTemplate,
      landscape: opts.landscape ?? false,
      ...(opts.footerTemplate ? { displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: opts.footerTemplate } : {}),
      ...(opts.margin ? { margin: opts.margin } : {}),
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
