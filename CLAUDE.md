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
