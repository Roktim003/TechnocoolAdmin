import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * HTML → PDF with a headless Chromium. Runs only in the worker process. The browser comes from
 * PDF_BROWSER_PATH, or the first one found: Alpine's chromium (Docker image), then Chrome / Edge.
 *
 * One shared browser per worker process: at most PDF_CONCURRENCY pages render at a time, and the
 * browser is restarted after PDF_BROWSER_RESTART_AFTER documents to keep its memory in check.
 *
 * Only internal templates are rendered: every network request (http, https, file, ws…) is
 * aborted, so a template value can never make Chromium fetch a URL (no SSRF). Fonts and images
 * are embedded as data: URIs. JavaScript is disabled in the page.
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

const positive = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : def;
};
const concurrency = () => positive(process.env.PDF_CONCURRENCY, 1);
const restartAfter = () => positive(process.env.PDF_BROWSER_RESTART_AFTER, 50);

/** Requests a page may make: only inline data. Everything else is aborted. */
export function isAllowedPdfRequest(url: string): boolean {
  return url.startsWith("data:") || url === "about:blank";
}

interface Pool {
  browser: Promise<Browser> | null;
  /** Documents rendered by the current browser. */
  rendered: number;
  active: number;
  waiting: (() => void)[];
  /** Total browsers launched by this process (for tests and the jobs page). */
  launches: number;
}

const g = globalThis as unknown as { __sbPdfPool?: Pool };
const pool = (): Pool => (g.__sbPdfPool ??= { browser: null, rendered: 0, active: 0, waiting: [], launches: 0 });

async function launch(): Promise<Browser> {
  const executablePath = browserPath();
  if (!executablePath) throw new Error("No Chromium/Chrome/Edge found for PDF rendering. Set PDF_BROWSER_PATH.");
  pool().launches++;
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none", "--disable-extensions", "--disable-background-networking", "--no-first-run"],
  });
}

async function acquire(): Promise<void> {
  const p = pool();
  if (p.active < concurrency()) {
    p.active++;
    return;
  }
  await new Promise<void>((resolve) => p.waiting.push(resolve));
}

function release(): void {
  const p = pool();
  const next = p.waiting.shift();
  if (next) next();
  else p.active--;
}

/** The shared browser, (re)launched when missing, disconnected, or due for a restart. */
async function browser(): Promise<Browser> {
  const p = pool();
  if (p.browser && p.rendered >= restartAfter() && p.active === 1) {
    const old = p.browser;
    p.browser = null;
    p.rendered = 0;
    await old.then((b) => b.close()).catch(() => undefined);
  }
  if (p.browser) {
    const b = await p.browser.catch(() => null);
    if (b?.connected) return b;
    p.browser = null;
  }
  p.browser = launch();
  p.rendered = 0;
  p.browser.catch(() => (p.browser = null));
  return p.browser;
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Uint8Array> {
  await acquire();
  const p = pool();
  try {
    const b = await browser();
    p.rendered++;
    const page = await b.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (r) => (isAllowedPdfRequest(r.url()) ? r.continue() : r.abort("blockedbyclient")));
      await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: !opts.landscape && !opts.footerTemplate,
        landscape: opts.landscape ?? false,
        ...(opts.footerTemplate ? { displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: opts.footerTemplate } : {}),
        ...(opts.margin ? { margin: opts.margin } : {}),
        timeout: 120_000,
      });
      return new Uint8Array(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    release();
  }
}

/** Closes the shared browser (worker shutdown). */
export async function closePdfBrowser(): Promise<void> {
  const p = pool();
  const b = p.browser;
  p.browser = null;
  p.rendered = 0;
  if (b) await b.then((x) => x.close()).catch(() => undefined);
}

export const pdfPoolStats = () => ({ launches: pool().launches, rendered: pool().rendered, active: pool().active, waiting: pool().waiting.length });
