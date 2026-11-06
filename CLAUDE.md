# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**TechnoCool Inventory** (code name **StockBook**, still used for the repo, package, database, bucket and internal keys) — inventory management for **Techno Cool Associates**, an HVAC contractor (2 warehouses; LG / Daikin / Dunham-Bush). Next.js 15 App Router (TypeScript strict) · PostgreSQL + Prisma 6 · Zod · Redis + BullMQ · S3-compatible storage (MinIO in dev) · handwritten CSS Modules · Vitest. Locale: timezone Asia/Dhaka, currency BDT, fiscal year July–June.

`README.md` is the detailed spec (business rules per module, permissions tables, endpoints, env vars). Read the relevant module section before changing behaviour there. `docs/coolify.md` covers deployment.

## Commands

```bash
docker compose up -d postgres redis minio   # dev infra
npm run dev                                  # Next.js (turbopack)
npm run worker:dev                           # BullMQ worker (separate process, needed for imports, PDFs, emails, schedules)
npm run lint && npm run typecheck
npm run db:migrate                           # create a migration after editing prisma/schema.prisma
npm run db:deploy && npm run db:seed         # apply migrations + idempotent seed
npm run db:reset                             # drop, re-migrate, re-seed dev DB
```

Tests:

```bash
npm run test:db:up            # throw-away postgres :5433, redis :6380, minio :9100
npm run test:unit             # no DB/Redis needed
npm run test:integration
npx vitest run tests/integration/inventory-posting.test.ts      # single file
npx vitest run tests/unit/levels.test.ts -t "name of test"      # single test
npm run test:db:down
```

- Integration tests hit real route handlers with real `NextRequest`s against real Postgres/Redis/MinIO (nothing mocked); import tests run a BullMQ worker in-process. Files run serially (`fileParallelism: false`) because they share one DB.
- The test DB name must contain `test` — the suite truncates every table. Override with `TEST_DATABASE_URL` / `TEST_REDIS_URL` / `TEST_S3_ENDPOINT`. Test env lives in `tests/setup/test-env.ts`; helpers in `tests/helpers/`.

## Architecture

Each business module in `src/modules/<name>/` (identity, audit, catalog, inventory, notifications, purchasing, projects, overheads, reporting) uses clean-architecture layers:

- `domain/` — types, rules, errors, pure calculations. **ESLint forbids** importing Prisma, Next, React, ioredis, bullmq or outer layers here.
- `application/` — services holding all business logic, Zod DTOs (`dto.ts`), ports (`ports.ts`).
- `infrastructure/` — Prisma stores / unit of work, Excel/PDF generation, adapters.
- `interface/` — HTTP handlers (`http.ts`), mappers, OpenAPI registrations, job processors, and `container.ts` — the module's lazy composition root (e.g. `inventory()` returns the wired services).

Cross-module wiring (event subscriptions, etc.) happens in `src/modules/bootstrap.ts` → `wireModules()`. Cross-cutting infra is in `src/shared/` (http, auth, rbac, pagination, idempotency, storage, money, events, queue, openapi, …).

**Request flow:** `src/app/api/v1/**/route.ts` files are one-liners that re-export a module handler (`export const GET = xHandlers.list`). Handlers are built with the `authedRoute(...)` wrapper in `src/shared/http/route.ts`, which does the JSON envelope, request id, error mapping, cookie-or-bearer auth, CSRF, permission check, idempotency, and **automatic sensitive-field stripping** of every authenticated response. Handlers only parse → call service → map.

**Worker** (`src/worker/index.ts`, processors in `src/worker/processors` and module `interface/jobs.ts`) is a separate process bundled by esbuild into `dist/worker.js`. Queue work with `getQueue(QUEUES.x)`.

## Web UI

Pages live in `src/app/(app)/…`; shared components in `src/components/{ui,shell,charts}`, browser helpers in `src/lib/`. The UI calls the same `/api/v1` endpoints as the mobile apps via `src/lib/api-client.ts` (cookie auth, auto-refresh on 401). Login is the only server action. No CSS framework: CSS Modules + design tokens. Reuse the pieces below instead of building new ones.

### Look and layout

- **Brand:** app name `APP_NAME` ("TechnoCool Inventory", `src/shared/config/constants.ts`); company name on documents is `COMPANY_NAME` (env, "Techno Cool Associates"). Logo files are in `public/brand/` (sidebar `logo-64.png`, login `logo-128.png`, favicons, `apple-touch-icon.png`, `icon-192.png` for pop-ups); PDFs embed `LOGO_DATA_URI` from `src/shared/brand/logo-data.ts` (generated, regenerate if the logo changes). Don't hard-code the app name in new UI text: use `APP_NAME`.
- **Tokens only.** Every colour, size and radius is a CSS variable in `src/styles/tokens.css` (Gr8r Studio design system). **Never hard-code colours** in CSS modules: dark mode depends on it.
- **Dark mode:** `<html data-theme="light|dark">`, set before paint by `THEME_SCRIPT` (`src/lib/theme.ts`, inlined in `app/layout.tsx`). Users pick Light / Dark / System in the top-bar `ThemeSwitch` (stored in localStorage). Dark values are the `[data-theme="dark"]` block at the end of `tokens.css`. A subtree that must stay light gets `data-theme="light"` (e.g. `SpreadsheetView`). Printing switches to light.
- **Responsive:** breakpoints **900px** (sidebar becomes a slide-in drawer, opened by `MobileNav`'s ☰ button; `html[data-nav="open"]`) and **671px** (phones). On phones `DataTable` rows and `.lines` tables (`stock/_components/stock.module.css`) become labelled cards; labels are the column headers in `data-label` (rendered by DataTable; filled in for other tables by `shell/TableLabels.tsx` only once React owns the rows, because setting attributes before hydration causes a mismatch). Sticky `.footer` action bars go two per row. Don't give tables or toolbars fixed widths that push the page wider than the screen; check new screens at 390px.
- **Destructive actions** (Cancel entry / PO / count, Reject, Reverse, Remove file) use `<Button kind="danger">` (red).

### Components

- **Dropdowns:** `SelectField` / `Select` render a custom menu over a hidden native `<select>`, so `onChange(e => e.target.value)` works as usual. Lists with more than 5 options get a search box; pass `searchable` for every entity list (warehouse, supplier, customer, project, PO, user, brand, category, unit).
- **Picking a product:** always `ProductSelect` (button → panel with its own search box, server-side `search(q)`). Line tables use the wrapper `stock/_components/ProductPicker.tsx`; the reports filter searches `/reports/lookups/products`.
- **Dates / months:** `<TextField type="date">` / `type="month"` renders the calendar `DateInput` over a hidden native input, so `value`, `min` / `max` and `onChange(e => e.target.value)` (`"2026-11-07"` / `"2026-11"`) work as before. No raw `<input type="date">`.
- **Choosing a file in a form:** `FilePicker` (controlled `file` / `onChange`): drop zone → card with preview, name, size, Change / Remove; refuses a wrong type or over 10 MB at once. No raw `<input type="file">`.
- **Modals:** `Modal` (form with `noValidate`; Esc / backdrop close; focus goes to the first field when it opens). Its open/close effect depends only on `open`, so callers may pass an inline `onClose`.
- **Confirmations:** never `window.confirm` / `alert`. `await confirmDialog({ title, message, confirmText, cancelText?, danger? })` (`components/ui/ConfirmDialog.tsx`, rendered by `<ConfirmHost/>` in AppShell). Name the action on the button ("Cancel count", "Remove file"), not "OK"; focus starts on the back-out button.
- **Generated files (PDF and Excel):** never `window.open` after an `await` (browsers block it). Open `PdfViewer` with a `PdfRequest` whose `load()` starts the job and resolves `{ url, fileName }` when ready (documents: `waitForDocument(jobId, …)` from `src/lib/documents.ts`; report exports: poll `/exports/:jobId`). `format: "xlsx"` shows Excel in `SpreadsheetView` (ExcelJS loaded on demand; merges, frozen header, number formats, sheet tabs, first 2,000 rows). For a plain download use `downloadFile()` from `src/lib/download.ts`.
- **Popovers** (Select menus, ProductSelect panel, DateInput calendar) are portalled to `<body>` and positioned **absolutely in page coordinates** (`rect + window.scrollY`), so they scroll with the page and aren't clipped by table scroll areas. Don't use `position: fixed` + scroll listeners for them.
- **Notifications:** the top-bar `NotificationBell` polls `/notifications/unread-count`, shows the count in the tab title, and (opt-in per browser, `src/lib/browser-popups.ts`) shows desktop pop-ups for new notifications while no StockBook tab has focus. No service worker: closed tabs get nothing.

### Forms and validation

- Check in the browser before calling the API and show **every** problem at once (the server stops at the first): red field + message under it + `<FormProblems>` summary at the top, re-checked live after the first submit attempt.
- Helpers in `src/lib/validation.ts`: `rules.*` (required, maxLength, email, phone, money, qty, rate, integer, percent, notBefore, …), `collect()`, `revealProblems()`. Rules must mirror the module's Zod DTO (lengths, decimals, required fields).
- `TextField kind="money|qty|rate|integer|percent|phone"` blocks invalid characters while typing and sets the mobile keyboard; for raw `<input>`s use `sanitize(kind, value)`.
- Map server `details[].path` (e.g. `lines.0.qty`) back onto the fields; show a general message only when the server error has no field details.
- Reference implementations: `projects/_components/ProjectForm.tsx` (plain form) and `stock/_components/EntryForm.tsx` (line table: `check()` / `mapServerErrors()`, per-line keys `line:<key>:<field>`).

## Invariants to preserve

- **Money/quantities never use JS floats.** DB: qty `Decimal(14,3)`, money `Decimal(14,2)`, unit/avg cost `Decimal(14,4)`. Compute with decimal.js (half-up); API values are decimal strings (`"85000.00"`). Use `src/shared/money`.
- **Sensitive fields:** cost/profit/margin fields must be named per `src/shared/rbac/sensitive-fields.ts` (`unitCost`, `profit`, `margin`, `contractValue`, …) or added there; they're stripped based on the role's `seeCost` / `seeProfit` / `seeMargin` flags. This also applies to exports, PDFs, reports, charts and totals.
- **RBAC:** modules × levels `NONE < VIEW < CREATE < APPROVE < FULL`, plus warehouse scope. Use `authedRoute({ permission: ["<module>", "VIEW"] }, …)` and `requireWarehouse(ctx.principal, id)` for warehouse-scoped data. Out-of-scope warehouse → 403, never empty results. New module keys need the Prisma enum + `MODULE_KEYS` in `shared/rbac/levels.ts` + a migration.
- **Stock changes only via `StockPostingService`** (`modules/inventory/application/posting.service.ts`): one transaction, rows locked in sorted order (deadlock avoidance), recompute with the same `computeEntry()` as the preview, refuse negative stock, append-only `StockMovement` (DB trigger blocks UPDATE/DELETE). Weighted-average cost per product company-wide. Document numbers `{PREFIX}-{FY}-{0001}` come from a `DocumentSequence` row locked `FOR UPDATE` (gap-free).
- Stock-changing POSTs **require** an `Idempotency-Key` header.
- **Audit:** mutating services write the audit row in the **same transaction** as the change.
- **Notifications / change events** are published **after** the transaction commits (`notifications().service.publish(...)`; new types go in `NOTIFICATION_TYPES`). Data-changed events (`src/shared/events/change-events.ts`) clear the dashboard cache.
- **Reporting is read-only**: queries run in `READ ONLY` transactions with a statement timeout, aggregate/page in SQL, and never call other modules' write services. Adding a report: see README "Adding a report" (`defineReport` + `REPORTS` registry + fixture test).
- Products are never deleted (DISCONTINUED); product codes are immutable.
- Storage bucket is private; files are served only through authenticated routes. Uploaded images are validated by content with sharp.
- New endpoints: register paths in the module's `interface/openapi.ts` and import it from `shared/openapi/document.ts` (an integration test checks OpenAPI completeness).

API envelope: success `{ data, meta? }`, error `{ error: { code, message, details[], requestId } }`. 422 = business rule, 409 = conflict. Lists: `?page&pageSize(≤100)&sort=name,-createdAt&q=…`.

## Notes

- npm 11+ blocks install scripts unless listed in `package.json#allowScripts`; update that list when bumping Prisma/esbuild/sharp versions.
- Default dev admin: `admin` / `ChangeMe123!` (seed only creates it if missing). Seeded roles: Admin, Accounts, Manager, Store Manager (README has each module's permission table).
- **PDF rendering on Windows dev machines** uses the installed Chrome/Edge (`PDF_BROWSER_PATH` overrides). If PDFs fail with "Failed to launch the browser process: Code: 0", Edge has a pending update: close all Edge windows (or reboot) and try again.
- **Email in dev:** set `SMTP_HOST=localhost`, `SMTP_PORT=1025` to send through the Mailpit container (inbox http://localhost:8025). With `SMTP_HOST` empty, emails are skipped.
- **Windows shell:** don't rewrite source files with PowerShell `Get-Content -Raw` / `Set-Content` (Windows PowerShell 5.1 reads UTF-8 as ANSI and adds a BOM, corrupting `৳`, `—`, `·`). Use the editor tools or Node scripts.
- After UI changes, check the browser console for hydration warnings (Next shows "1 Issue" in dev) and try the screen at phone width.
