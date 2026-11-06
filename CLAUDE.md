# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**StockBook** — inventory management for an HVAC contractor (2 warehouses; LG / Daikin / Dunham-Bush). Next.js 15 App Router (TypeScript strict) · PostgreSQL + Prisma 6 · Zod · Redis + BullMQ · S3-compatible storage (MinIO in dev) · handwritten CSS Modules · Vitest. Locale: timezone Asia/Dhaka, currency BDT, fiscal year July–June.

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

Each business module in `src/modules/<name>/` (identity, audit, catalog, inventory, notifications, purchasing, projects, reporting) uses clean-architecture layers:

- `domain/` — types, rules, errors, pure calculations. **ESLint forbids** importing Prisma, Next, React, ioredis, bullmq or outer layers here.
- `application/` — services holding all business logic, Zod DTOs (`dto.ts`), ports (`ports.ts`).
- `infrastructure/` — Prisma stores / unit of work, Excel/PDF generation, adapters.
- `interface/` — HTTP handlers (`http.ts`), mappers, OpenAPI registrations, job processors, and `container.ts` — the module's lazy composition root (e.g. `inventory()` returns the wired services).

Cross-module wiring (event subscriptions, etc.) happens in `src/modules/bootstrap.ts` → `wireModules()`. Cross-cutting infra is in `src/shared/` (http, auth, rbac, pagination, idempotency, storage, money, events, queue, openapi, …).

**Request flow:** `src/app/api/v1/**/route.ts` files are one-liners that re-export a module handler (`export const GET = xHandlers.list`). Handlers are built with the `authedRoute(...)` wrapper in `src/shared/http/route.ts`, which does the JSON envelope, request id, error mapping, cookie-or-bearer auth, CSRF, permission check, idempotency, and **automatic sensitive-field stripping** of every authenticated response. Handlers only parse → call service → map.

**Web UI** (`src/app/(app)/…`, components in `src/components/{ui,shell,charts}`) calls the same `/api/v1` endpoints as the mobile apps via `src/lib/api-client.ts` (cookie auth, auto-refresh on 401). Login is the only server action. Design tokens are CSS variables in `src/styles/tokens.css`; no CSS framework.

Shared UI patterns — reuse these instead of building new ones:

- **Dropdowns:** `SelectField` / `Select` (`components/ui`) render a custom menu over a hidden native `<select>` (so `onChange(e => e.target.value)` works as usual). Lists with more than 5 options get a search box automatically; pass `searchable` to force it — do this for every entity list (warehouse, supplier, customer, project, PO, user, brand, category, unit).
- **Picking a product:** always `ProductSelect` (`components/ui/ProductSelect.tsx`: button → panel with its own search box, server-side search via a `search(q)` prop). Line tables use the wrapper `stock/_components/ProductPicker.tsx`; the reports filter uses `/reports/lookups/products`.
- **Popovers** (Select menus, ProductSelect panel) are portalled to `<body>` and positioned **absolutely in page coordinates** (`rect + window.scrollY`), so they scroll with the page and aren't clipped by table scroll areas. Don't use `position: fixed` + scroll listeners for them.
- **Generated files (PDF and Excel):** never `window.open` after an `await` (browsers block it as a pop-up). Open `PdfViewer` (`components/ui/PdfViewer.tsx`) with a `PdfRequest` whose `load()` starts the job and resolves `{ url, fileName }` when the file is ready (documents: `waitForDocument(jobId, …)` from `src/lib/documents.ts`; report exports: poll `/exports/:jobId`). Set `format: "xlsx"` for Excel: it renders in `SpreadsheetView` (ExcelJS loaded on demand; grid, merges, frozen header, number formats, sheet tabs, first 2,000 rows). The viewer shows a loader, then the file with Print / Download (/ New tab for PDFs). For a plain download use `downloadFile()` from `src/lib/download.ts`.
- **PDF rendering on Windows dev machines** uses the installed Chrome/Edge (`PDF_BROWSER_PATH` overrides). If PDFs fail with "Failed to launch the browser process: Code: 0", Edge has a pending update: close all Edge windows (or reboot) and try again.
- **Form validation:** check in the browser before calling the API and show **every** problem at once (the server stops at the first): red field (`error` prop / `cellInputError`) + message under it + a summary list at the top, re-checked live after the first attempt. Map server `details[].path` (e.g. `lines.0.qty`) back onto the fields. See `stock/_components/EntryForm.tsx` (`check()` / `mapServerErrors()`).
- **Destructive actions** (Cancel entry / PO / count, Reject, Reverse) use `<Button kind="danger">` (red).
- **Dates / months:** `<TextField type="date">` / `type="month"` renders the custom calendar `DateInput` (`components/ui/DateInput.tsx`): hidden native input underneath, so `value` / `onChange(e => e.target.value)` (`"2026-11-07"` / `"2026-11"`) and `min` / `max` work as before. Don't use a raw `<input type="date">`.
- **Choosing a file in a form:** `FilePicker` (`components/ui/FilePicker.tsx`, controlled `file` / `onChange`): drop zone → card with preview, name, size, Change / Remove; refuses wrong type / over 10 MB at once. Don't show a raw `<input type="file">`.
- **Dark mode:** `<html data-theme="light|dark">`, set before paint by `THEME_SCRIPT` (`src/lib/theme.ts`, in `app/layout.tsx`); the choice (Light / Dark / System) is the top-bar `ThemeSwitch`, stored in localStorage. The dark values are the `[data-theme="dark"]` block at the end of `tokens.css`, so **never hard-code colours** in CSS modules: use tokens. A subtree that must stay light gets `data-theme="light"` (e.g. `SpreadsheetView`). Printing switches to light.
- **Form validation helpers:** `src/lib/validation.ts` (`rules.*`, `collect()`, `revealProblems()`), `<FormProblems>` for the summary, and `TextField kind="money|qty|rate|integer|percent|phone"` to block invalid characters while typing. `ProjectForm.tsx` is the reference implementation.
- **Responsive:** breakpoints 900px (sidebar becomes a slide-in drawer opened by `MobileNav`'s ☰ button; `html[data-nav="open"]`) and 671px (phones). On phones `DataTable` rows and `.lines` tables (stock.module.css) become labelled cards: labels come from the column headers (`data-label`, rendered by DataTable; filled in for other tables by `TableLabels` once React owns the rows — never set it before hydration). Sticky `.footer` action bars go 2-per-row. Don't give tables or toolbars fixed widths that push the page wider than the screen; check with a 390px viewport.
- **Confirmations:** never `window.confirm` / `alert`. Use `await confirmDialog({ title, message, confirmText, cancelText?, danger? })` from `components/ui/ConfirmDialog.tsx` (rendered by `<ConfirmHost/>` in AppShell, built on `Modal`). Name the action on the button ("Cancel count", "Remove file"), not "OK"; focus starts on the back-out button.

**Worker** (`src/worker/index.ts`, processors in `src/worker/processors` and module `interface/jobs.ts`) is a separate process bundled by esbuild into `dist/worker.js`. Queue work with `getQueue(QUEUES.x)`.

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
- Default dev admin: `admin` / `ChangeMe123!` (seed only creates it if missing).
