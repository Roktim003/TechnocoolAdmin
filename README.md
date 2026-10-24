# StockBook

Inventory management for an HVAC contractor (2 warehouses; LG / Daikin / Dunham-Bush).
This repository contains **Module 0** (foundation, authentication, users & roles), **Module 1** (product catalog), **Module 2** (warehouses & stock in / out), **Module 3** (opening stock import, stock counts, notifications & low-stock alerts), **Module 4** (suppliers & purchase orders) and **Module 5** (projects & project costing).
Reports and the dashboard come in later modules.

- **Stack:** Next.js 15 (App Router, TypeScript strict) · REST route handlers + thin server actions · PostgreSQL + Prisma 6 · Zod · JWT access tokens + rotating refresh tokens · RBAC with warehouse scope · Redis + BullMQ · S3-compatible storage (MinIO in dev) + sharp · ExcelJS · OpenAPI generated from Zod · handwritten CSS Modules · Pino · Vitest · Docker / Coolify
- **Locale:** timezone Asia/Dhaka, currency BDT.

---

## Quick start (Docker)

```bash
docker compose up --build
```

Then open **http://localhost:3000** and log in with the default admin:

| Username | Password |
|---|---|
| `admin` | `ChangeMe123!` |

(Set `ADMIN_USERNAME` / `ADMIN_PASSWORD` before the first start to choose your own. The seed only creates the admin if that username does not exist yet, so changing the variables later does nothing. Change the password from **Users & roles → Set password**.)

The `app` container runs `prisma migrate deploy` and the idempotent seed on start (`RUN_MIGRATIONS=true`), then starts Next.js. The `worker` container runs the BullMQ worker from the same image. `minio` is the private photo storage (console at http://localhost:9001, `minioadmin` / `minioadmin`).

| URL | What |
|---|---|
| http://localhost:3000/login | Web login |
| http://localhost:3000/users | Users & roles (Admin only) |
| http://localhost:3000/catalog | Product catalog |
| http://localhost:9001 | MinIO console (dev storage) |
| http://localhost:3000/api/docs | Swagger UI |
| http://localhost:3000/api/v1/openapi.json | OpenAPI 3.1 document |
| http://localhost:3000/api/v1/health | Health check (DB + Redis) |

## Local development (hot reload)

Requirements: Node.js ≥ 20.18, Docker (for PostgreSQL and Redis).

```bash
cp .env.example .env               # then edit secrets
docker compose up -d postgres redis minio
npm install
npm run db:deploy                  # apply migrations
npm run db:seed                    # warehouses A/B, 4 roles, admin user
npm run dev                        # http://localhost:3000
npm run worker                     # in a second terminal: BullMQ worker
npm run queue:test                 # optional: enqueue a ping job and wait for the worker
```

> **npm 11+:** install scripts are blocked unless allowed. `package.json#allowScripts` already allows the ones Prisma and esbuild need. If you change those package versions, run `npm install-scripts approve <pkg>`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate` + Next.js standalone build + worker/seed bundles in `dist/` |
| `npm start` | Start the built app (non-Docker) |
| `npm run worker` / `worker:dev` | BullMQ worker (watch mode with `:dev`) |
| `npm run queue:test` | Enqueue the `ping` test job and print the worker's result |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | All tests (unit + integration) |
| `npm run test:unit` / `test:integration` | Only one project |
| `npm run test:db:up` / `test:db:down` | Throw-away PostgreSQL (5433) + Redis (6380) + MinIO (9100) for tests |
| `npm run db:migrate` | Create a new migration (development) |
| `npm run db:deploy` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Idempotent seed |
| `npm run db:reset` | Drop, re-migrate and re-seed the dev database |

## Tests

Integration tests call the real route handlers with real `NextRequest`s against a real PostgreSQL, Redis and MinIO; import tests run a real BullMQ worker in-process. Nothing is mocked.

```bash
npm run test:db:up        # postgres-test :5433, redis-test :6380, minio-test :9100
npm test                  # unit + integration
npm run test:db:down
```

Use other servers with `TEST_DATABASE_URL`, `TEST_REDIS_URL` and `TEST_S3_ENDPOINT`. The database name must contain `test`; the suite truncates every table. Unit tests (`npm run test:unit`) need neither database nor Redis.

What is covered: login success / wrong password / unknown user / lockout after 5 failures / disabled user; refresh rotation and reuse → family revoked; cookie and bearer auth on `/auth/me`; CSRF on cookie mutations; logout; 403 for non-Admins on all admin endpoints; user create (409 duplicate, 400 no warehouse, 422 unknown role); pagination / sort / search / filters; disable and password-set revoking sessions; custom role create / copy / edit / delete (422 when in use); Admin role locked; permission changes applying immediately; sensitive-field stripping per role; idempotency replay / 409 / expiry / per-user scope; audit rows; login-history filters; health; OpenAPI completeness; BullMQ ping job. Unit tests cover level comparison, guards, domain rules, field filtering, list-query parsing, the CSRF check, Dhaka date bounds and audit sanitisation.

## Architecture

```
src/
  app/
    (auth)/login/            login page (server action)
    (app)/                   authenticated shell + pages (users, coming-soon modules)
    api/v1/...               REST route handlers — one line each, bound to module handlers
    api/docs/                Swagger UI
  modules/
    identity/                auth, users, roles, permissions, warehouses, login history
      domain/                types, rules, domain errors, seed definitions (no Prisma/Next)
      application/           services (all business logic) + Zod DTOs + ports
      infrastructure/        Prisma repositories, unit of work, bcrypt, token codec, Redis adapters
      interface/             HTTP handlers, server actions, mappers, OpenAPI registrations
    audit/                   reusable audit-log service (application / infrastructure / interface)
    catalog/                 catalogs (brands), categories, units, products, photos, Excel import/export
  shared/
    http/                    route wrapper (envelope, request id, errors, auth, CSRF, idempotency), health
    auth/                    JWT, cookies, CSRF, the single cookie-or-bearer resolver
    rbac/                    levels, requirePermission / requireWarehouse, filterSensitiveFields
    pagination/              page / pageSize / sort / q / filters parser
    idempotency/             Idempotency-Key storage
    storage/                 private S3 adapter + image validation/thumbnails (reused for invoices etc. later)
    money/                   decimal-string money & quantity parsing (no floats)
    config/ logger/ db/ redis/ queue/ openapi/ time/ validation/ errors/
  worker/                    BullMQ worker entry (separate process)
  components/                handwritten UI kit (ui/) and app shell (shell/)
  styles/tokens.css          every design token as a CSS variable
```

- Route handlers and server actions only **parse → call service → map**. The web UI calls the same `/api/v1` endpoints as the mobile apps (login is the one server action, and it calls the same `AuthService`).
- The domain layer imports nothing from Prisma or Next.js (enforced by ESLint).
- Mutating services write an audit row in the **same transaction** as the change.

### Adding a module later

1. Create `src/modules/<name>/{domain,application,infrastructure,interface}`.
2. Add the module key to `ModuleKey` (Prisma enum + `MODULE_KEYS` in `shared/rbac/levels.ts`) if it's new, plus a migration.
3. Wrap handlers with `authedRoute({ permission: ["<module>", "VIEW"] }, …)`. Call `requireWarehouse(ctx.principal, id)` for warehouse-scoped data.
4. Name money fields from `SENSITIVE_FIELDS` (`unitCost`, `profit`, `margin`, `contractValue`…), or add yours there. Every authenticated response is filtered automatically.
5. Inject `AuditService` and call `record()` inside your transactions.
6. Register paths in `interface/openapi.ts` and import it from `shared/openapi/document.ts`.
7. Queue work with `getQueue("<name>")` and add a processor to `src/worker/index.ts`.
8. POST endpoints get `Idempotency-Key` support for free (stock movements should require it from clients).
9. Notify people with `notifications().service.publish({ type, userIds, title, body, link })` **after** your transaction commits; add the type to `NOTIFICATION_TYPES` (the seed upserts it) and resolve recipients with `notifications().recipients`. Email goes through the `email` queue automatically per user preference.

## API conventions

- Base path `/api/v1`, JSON only. Every response has an `X-Request-Id` header (an incoming one is echoed if valid).
- Success `{ "data": …, "meta": { page, pageSize, total, totalPages } }` (`meta` only on lists). Error `{ "error": { code, message, details[], requestId } }`.
- Status codes: 200/201/204 · 400 validation · 401 unauthenticated · 403 forbidden / CSRF / disabled / locked · 404 · 409 conflict · 422 business rule · 429 rate limit · 500.
- Lists: `?page=1&pageSize=20` (max 100) `&sort=name,-createdAt&q=search&status=active&roleId=…`.
- `Idempotency-Key` on POST: the same key + same body replays the stored response (`Idempotent-Replayed: true`) for 24 h; the same key + a different body returns 409. Keys are per user.

## Authentication

| | Web | Mobile |
|---|---|---|
| Login | `POST /api/v1/auth/login` `{username, password}` (or the login page) | same, with `"client": "mobile"` |
| Tokens | HttpOnly `sb_at` (path `/`, 15 min) + `sb_rt` (path `/api/v1/auth`, 30 days), SameSite=Lax, Secure when `COOKIE_SECURE=true` | `accessToken` + `refreshToken` in the JSON body |
| Calls | cookie, sent automatically | `Authorization: Bearer <accessToken>` |
| Refresh | `POST /auth/refresh` (no body) | `POST /auth/refresh` `{refreshToken}` |
| CSRF | Origin/Referer must match `APP_URL` / host on mutations | not needed |

- Refresh tokens are 256-bit random strings, stored as HMAC-SHA256, and rotated on every refresh. Re-using an old token revokes the whole token family (that login on that device).
- 5 failed attempts for a username within 15 minutes **locks** the account until an Admin sets a new password. Unknown usernames get a 429 after the limit.
- Disabling a user or setting their password revokes every refresh token **and** bumps a token version, so their current access tokens stop working on the next request.
- Users cannot change their own password; only Admin (`users = FULL`) can, with a minimum of 8 characters.
- Every attempt is recorded in login history (user, time, IP, user agent, client, result).

## RBAC

Modules `dashboard, catalog, inventory, purchasing, projects, reports, users`, each with a level `NONE < VIEW < CREATE < APPROVE < FULL`. Roles also carry three flags: `seeCost`, `seeProfit`, `seeMargin`. Each user is scoped to one or more warehouses. Permissions live in PostgreSQL and are cached in Redis; the cache is invalidated whenever a role or user changes, so edits apply on the user's next request. Admin is locked: always FULL with every flag, and cannot be edited or deleted.

## Product catalog (Module 1)

The master list of everything the company stocks. Each product belongs to a **catalog** (one per brand; seeded: LG, Daikin, Dunham-Bush), a **category** (Split AC, Cassette AC, Ducted AC, VRF / VRV, Chiller, Fan coil unit, AHU, Accessories, Piping, Electrical, Controls) and a base **unit** (pcs, set, m, roll, kg, ltr, sheet, box). Later modules pick products from here.

| Permission (`catalog`) | Can |
|---|---|
| VIEW | list and view products, catalogs, categories, units, photos and history |
| CREATE | add products, and manage photos of products they created |
| FULL | edit, discontinue / reactivate, manage catalogs / categories / units, import, export |

Seeded: Admin FULL; Accounts, Manager, Store Manager VIEW.

Rules:
- **Code / SKU** is stored upper-case, must match `^[A-Z0-9][A-Z0-9-]{1,30}$`, is unique, and **can never change** (`PATCH` with a different code → 422 `CODE_IMMUTABLE`). Barcodes are unique when present.
- Products are **never deleted**. Set them DISCONTINUED: they stay in history, and later modules won't let you pick them.
- A catalog or category with products can't be deleted (422); deactivate it instead. Inactive catalogs, categories and units can't be chosen for new or changed products (422).
- **`purchaseCost` is sensitive.** It is stripped from every API response (lists, detail, history, export, template) unless the role has `seeCost`, and roles without `seeCost` can't set it (their new products start at 0). Selling price is visible to everyone with VIEW.
- Money is `Decimal(14,2)` in PostgreSQL and a decimal string (`"85000.00"`) in the API, never a JS float.
- Every create, update, status change and photo change writes an audit row; `GET /products/:id/history` shows them.

Endpoints (all under `/api/v1`; details in Swagger):
- `catalogs`, `categories`, `units`: list, create, update; catalogs and categories can also be deleted when unused.
- `products`: list with `q`, `catalogId`, `categoryId`, `status`, `source`, `trackSerial` and sort `name|code|createdAt|sellingPrice`; `products/:id`, `/discontinue`, `/reactivate`, `/history`; `products/by-code/:code`, `products/by-barcode/:barcode`, `products/check-code?code=`.
- Photos: `POST products/:id/photos` (multipart `file`; JPG / PNG / WebP checked by content; ≤ 5 MB each; ≤ 10 per product), `PATCH|DELETE products/:id/photos/:photoId` (`isPrimary`, `sortOrder`), `GET products/:id/photos/:photoId/file?variant=thumb`.
- Import / export: `products/import/template`, `POST products/import` (multipart `file` + `mode=validate|commit`, returns a `jobId`), `products/import/:jobId`, `products/export` (same filters as the list).

**Import:** download the template (it has a Lists sheet and dropdowns), fill it in and upload it. The file is stored privately and processed by the **worker**. `validate` checks every row (required fields, formats, unknown or inactive references, duplicate codes and barcodes in the file and in the database) and writes nothing. `commit` re-validates and creates all products in **one transaction**; any error means nothing is written. Limit: 2000 rows or 10 MB per file.

UI: `/catalog` (brand cards, filters, table, and export / import / settings for FULL), `/catalog/new`, `/catalog/:id` (gallery, details, history), `/catalog/:id/edit`, `/catalog/import`, `/catalog/settings` (categories, units, catalogs).

## Warehouses & stock in / out (Module 2)

Code: `src/modules/inventory/{domain,application,infrastructure,interface}`. Quantities are `Decimal(14,3)`, money `Decimal(14,2)` and unit / average costs `Decimal(14,4)`; the domain computes with decimal.js (half-up) and values cross the API as strings. JS floats are never used for stock or money.

### Entry types

| Type | Prefix | Effect | Price on the line |
|---|---|---|---|
| Purchase receipt — imported | `GRN-I` | + stock | foreign unit price × exchange rate, plus landed-cost charges |
| Purchase receipt — local | `GRN-L` | + stock | BDT unit cost |
| Return from site | `RTN` | + stock (GOOD or DAMAGED) | cost of the original issue line (else current average) |
| Opening stock (FULL only) | `OPN` | + stock | BDT unit cost |
| Issue to project | `ISS` | − stock | current average cost |
| Sale / delivery | `SAL` | − stock | selling price (defaults to the product's); entry discount + VAT |
| Return to supplier | `RTS` | − stock (GOOD or DAMAGED) | current average cost |
| Damage / loss write-off | `DMG` | − stock (GOOD or DAMAGED), reason required | current average cost |
| Transfer | `TRF` | − from, in transit, + to on receipt | average cost (company-wide, so unchanged) |
| Reversal (system) | `REV` | exact inverse of the original | the original's values |
| Stock adjustment (system, from a count) | `ADJ` | per line: GAIN (+) or LOSS (−) | current average cost |

Numbers are `{PREFIX}-{FY}-{0001}` where FY runs July–June (`2627` = Jul 2026 – Jun 2027). They come from a `DocumentSequence` row locked `FOR UPDATE` inside the posting transaction, so they are gap-free and unique under concurrency; drafts have no number (only a draft reference) and get one when submitted or posted.

### Posting engine

`StockPostingService` is the only code that changes stock. Every path (direct post, approve, receive, reverse) runs in one database transaction that:
1. locks the entry row, then the products' `ProductCost` rows and the `StockBalance` rows **in sorted order** (product, warehouse, condition) so concurrent posts can't deadlock, then the number sequence;
2. recomputes the entry from the locked rows with the same `computeEntry()` the calculate endpoint uses (so the preview and the posted values agree);
3. refuses to go negative (`422 INSUFFICIENT_STOCK`; database CHECK constraints are a second guard), appends `StockMovement` rows (append-only: a trigger blocks UPDATE/DELETE), updates balances, average cost, serials and reservations, and writes the audit log.

**Cost method:** weighted average per product across all warehouses (`ProductCost`). Receipts add value; issues take qty × average. Taking the **last** units takes exactly the remaining value, so zero stock never carries a rounding residue; at zero stock the last average is kept. Import landed cost: `% of goods` and fixed BDT charges marked "in cost" are spread over lines by goods value (the last line takes the rounding remainder); charges not in cost (e.g. adjustable VAT / AIT) are recorded and shown in the total payable only.

### Workflow and statuses

`DRAFT → PENDING → POSTED` (or `REJECTED → edit → PENDING` again, or `CANCELLED`); transfers go `PENDING → DISPATCHED → RECEIVED`; posted entries can become `REVERSED`.
- Users with inventory **FULL** (Admin) can post directly; others **submit** for verification. Submitting an outgoing entry or transfer **reserves** the stock (and serials), so `available = on hand − reserved`.
- An approver needs inventory **APPROVE**, the entry's warehouse in scope, and must not be the creator. **Reject** needs a reason and releases the reservation; the creator can edit and resubmit. The creator (or FULL) can **cancel**.
- **Reverse** (FULL, reason required) creates a `REV` entry that undoes stock and cost exactly. It is refused if stock would go negative, if serials have moved on, or if other entries depend on it (e.g. a received transfer, or returns against an issue).
- Setting `adminWriteOffNeedsApproval`: when on, even Admin's write-offs need verification.
- **Transfers:** dispatch moves stock into `StockInTransit`; the destination receives. A shortfall is booked to DAMAGED stock at the destination with a PENDING write-off (`reason = "Transfer shortage"`).
- **DAMAGED** stock can only be written off or returned to the supplier. Issues need a PLANNING / RUNNING project; returns are refused for CLOSED projects.
- **Sales below average cost** → `422 BELOW_COST`, unless an Admin sends `confirmBelowCost: true` (and `allowAdminBelowCostSale` is on); the override is audit-logged.
- Costs are removed from every response for roles without `seeCost` (entries, calculate, balances, ledger, PDFs); on entries priced at cost (all except sales) the line price and totals are hidden too. Profit needs `seeProfit`.
- Every stock-changing `POST` **requires** an `Idempotency-Key` header (`400 IDEMPOTENCY_KEY_REQUIRED` otherwise); a replay returns the first response.

| Permission (`inventory`) | Can |
|---|---|
| VIEW | entries, stock levels, ledger, serials, suppliers / customers / projects (own warehouses) |
| CREATE | create, edit and submit entries; receive transfers; attachments |
| APPROVE | approve / reject other people's entries |
| FULL | post directly, opening stock, reverse, masters, inventory settings |

Seeded: Admin FULL; Accounts and Manager APPROVE; Store Manager CREATE.

Endpoints (under `/api/v1`, details in Swagger):
- `stock-entries` (list with `type`, `status`, `warehouseId`, party, `productId`, dates, `awaitingMyApproval`, `awaitingMyReceipt`), `POST stock-entries` (`action: draft|submit|post`), `POST stock-entries/calculate`, `GET|PATCH stock-entries/:id`, `POST stock-entries/:id/{submit,post,approve,reject,cancel,reverse,receive}`.
- Attachments: `GET|POST stock-entries/:id/attachments` (PDF / JPG / PNG / WebP by content, ≤ 10 MB, ≤ 20 per entry), `GET|DELETE stock-entries/:id/attachments/:attachmentId`.
- Documents: `POST stock-entries/:id/documents` (`kind` optional) queues a PDF (GRN, delivery challan, sales invoice, return / write-off / transfer / reversal note) that the **worker** renders with headless Chromium; poll `GET documents/:jobId`, download with `?download=1`.
- Stock: `stock/balances`, `stock/products/:productId` (stock card + ledger), `stock/availability?productId&warehouseId`, `stock/movements`; `serials`, `serials/:id` (with history).
- Masters: `customers` (suppliers: see Module 4; projects: see Module 5): list, create, get, update, `/:id/deactivate`. `inventory-settings`: GET / PATCH (FULL).

UI: `/stock` (tabs New entry · Entries · Pending verification · Stock levels, plus a banner for transfers to receive), `/stock/:id` (details, timeline, approve / reject / reverse / receive, attachments, PDFs), `/stock/:id/edit`, `/stock/products/:productId` (stock card), `/stock/settings`, `/serials`, `/masters` (customers; `?tab=suppliers` redirects to `/purchases`, `?tab=projects` to `/projects`). The old `/inventory` address redirects to `/stock`.

Seed: the inventory settings row (VAT 15 %), and — only when the tables are empty and `SEED_SAMPLE_DATA` is not `false` — sample suppliers (LG, Daikin, Dunham-Bush, a local pipe supplier), customers and projects `PRJ-001`, `PRJ-002` (see Module 5 for the sample costing).

## Opening stock, stock counts & alerts (Module 3)

Code: `src/modules/inventory` (opening import, counts, low stock — all stock changes still go through `StockPostingService`) and the new, reusable `src/modules/notifications`.

### Go-live procedure (opening stock)

1. **Prepare** the catalog first (products with codes, units, serial tracking, minimum levels).
2. **Download the template** at `/stock/opening` (or `GET /api/v1/opening-stock/template`). Sheet 1 is the data (Warehouse code, Product code, Condition, Quantity, Unit cost (BDT), Serial numbers, Note); *Lists* has the valid warehouse and active product codes; *Help* explains each column. The data sheet has no example row, so nothing sample-like can be imported by mistake.
3. **Fill it in**: one row per product + warehouse + condition. Rows repeating the same product, warehouse, condition **and** cost are added together (with a warning); a different cost for the same key is an error. Serial-tracked products need whole quantities and exactly that many comma-separated serials.
4. **Upload** (inventory FULL). The worker validates every row: product exists and is ACTIVE, warehouse exists / is active / in your scope / not locked, qty > 0 (3 dp), cost ≥ 0 (4 dp), serial count = qty, no duplicate serials in the file or in the database, no conflicting duplicates. Results: row, column and message per problem, plus a per-warehouse summary (lines, qty, value — value only with `seeCost`).
5. **Fix and re-upload** until there are no errors. Nothing is posted until step 6.
6. **Import and post**: one `OPENING` entry per warehouse, through the posting engine, all in **one transaction** (any failure → nothing posted). Everything is re-checked inside the transaction (locks, product status, serials, count freezes). Committing again does nothing (`alreadyCommitted: true`); the request needs an `Idempotency-Key`.
7. **Check** stock levels and a few stock cards.
8. **Lock** each warehouse (Admin): `POST /warehouses/:id/lock-opening`. From then on OPENING entries and imports for it get `422 OPENING_LOCKED`. Unlocking needs Admin + a reason (`POST /warehouses/:id/unlock-opening`), and both are audit-logged.

### Stock count procedure

1. **Create** a count (`/stock/counts` → New count; inventory ≥ CREATE): warehouse, scope — whole warehouse (active products + anything in stock), by brand, by category, or selected products — optional **blind** mode, notes. Number `SC-{FY}-0001`. While DRAFT nothing is frozen.
2. **Print a count sheet** if you count on paper (PDF from the worker; blind counts print without system quantities for counters).
3. **Start counting**: takes the snapshot of system quantities (on hand, per condition; a damaged line is added where damaged stock exists) and **freezes** the counted products in that warehouse. Any posting, submit (reservation), approval, transfer receipt or reversal touching them there gets `422 COUNT_IN_PROGRESS` naming the count; other products and other warehouses carry on. Starting takes the warehouse lock exclusively (postings take it shared), so a snapshot never races a posting.
4. **Count** on phones: scan a barcode or type a code to jump to a line; enter the quantity (± buttons, Enter saves) or, for serial-tracked items, scan each serial (counted qty = serials found). Several people can count at once; each line records who counted it. Filters: not counted yet / recount / counted. Blind mode hides system quantities and expected serials from counters.
5. **Submit**: every line needs a count, or is explicitly marked *not counted = 0* (the submit dialog can do this for all remaining lines).
6. **Review & approve** (inventory ≥ APPROVE, warehouse in scope, not the person who submitted): variance table sorted by largest value difference (values only with `seeCost`), MISSING / UNEXPECTED serials. Either **request a recount** of chosen lines (back to COUNTING, lines flagged until re-counted) or **approve**: one `STOCK_ADJUSTMENT` entry (`ADJ-{FY}-0001`, lines only where something differs) is posted — gains valued at the current average cost, losses removed at it; MISSING serials become WRITTEN_OFF, UNEXPECTED ones are created IN_STOCK. Zero variance → no entry. Then the products are released.
7. **Cancel** (creator or FULL) any time before approval: releases the products, no stock change.

### Notifications and low-stock alerts

- In-app notifications for every event below; email too when the user's preference allows (`/settings/notifications`; defaults per type). Header bell: unread badge (polled every 60 s), latest 10, *Mark all as read*, full list at `/notifications`.

| Event | Recipients |
|---|---|
| Entry submitted for verification | users with inventory ≥ APPROVE in that warehouse, except the creator |
| Entry approved / rejected (with reason) | the creator |
| Transfer dispatched | users scoped to the destination warehouse |
| Transfer received with a shortage | approvers of the source warehouse |
| Stock count submitted | approvers of that warehouse |
| Recount requested / count approved | the count's creator and counters |
| Product below minimum | users of the low-stock roles (alert settings; default Admin, Manager) |

- **Low stock**: after each commit a queue job checks the touched products; when total *available* GOOD stock (on hand − reserved, all warehouses) crosses from ≥ minimum to < minimum, one alert fires; it re-arms once stock is back at or above the minimum (`LowStockState`). `/stock/low-stock` lists every product below its minimum with per-warehouse availability, short-by and suggested reorder (2 × minimum − available), filters and Excel export, and *Create PO* (see Module 4).
- **Daily digest**: BullMQ repeatable job (default 09:00 Asia/Dhaka) emailing the full list to low-stock recipients who keep it on. Alert settings (inventory FULL, on `/stock/settings`): recipient roles, digest on/off and time.

Endpoints: `stock-counts` (+ `/:id`, `/start`, `/lines/:lineId` (PUT), `/submit`, `/approve`, `/request-recount`, `/cancel`, `/variance`, `/sheet`), `opening-stock/template`, `opening-stock/imports` (+ `/:id`, `/:id/commit`), `opening-stock/warehouses`, `warehouses/:id/lock-opening|unlock-opening`, `stock/low-stock` (+ `/export`), `alert-settings`, `notifications` (+ `/unread-count`, `/:id/read`, `/read-all`), `notification-preferences`. Start / submit / approve / recount / cancel / commit need an `Idempotency-Key`.

### Email (SMTP) setup

Email is sent only by the worker, through the `email` BullMQ queue (exponential backoff; every attempt updates `EmailLog` with QUEUED → SENT / FAILED, or SKIPPED when SMTP isn't configured). Templates are plain HTML cards (white card, IBM Plex with fallbacks, blue links) plus a text version.

| Variable | Meaning |
|---|---|
| `SMTP_HOST` | SMTP server. Empty = email off (logged as SKIPPED). docker compose: `mailpit` (inbox http://localhost:8025) |
| `SMTP_PORT` | 587 (STARTTLS) or 465 (TLS) |
| `SMTP_SECURE` | `true` for port 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | credentials (leave empty for servers without auth) |
| `SMTP_FROM` | sender, e.g. `StockBook <no-reply@your-domain.com>` |
| `EMAIL_RETRY_DELAY_MS` | first retry delay (default 30000; doubles each attempt) |
| `EMAIL_MAX_ATTEMPTS` | tries before FAILED (default 5) |

Users need an email address on their user record to receive emails.

## Purchases: suppliers & purchase orders (Module 4)

Code: `src/modules/purchasing` (domain / application / infrastructure / interface). Suppliers moved here from inventory (same table, now with `code` SUP-001…, `brandsSupplied`, `paymentTermsNote`, `defaultCurrency`, `notes`). UI: `/purchases` (tabs: Purchase orders · Pending approval · Overdue · Suppliers), `/purchases/new`, `/purchases/:id`, `/purchases/suppliers/:id`, `/purchases/settings`.

**Inventory never imports purchasing.** Inventory defines a `ReceiptListener` port (`src/modules/inventory/application/ports.ts`); purchasing registers its implementation at startup (`wireModules()` in `src/modules/bootstrap.ts`, called from `instrumentation.ts`, the worker and the test setup). Inventory calls it **inside the stock-posting transaction**, so a GRN and the PO quantities commit or roll back together.

### PO lifecycle

| Status | How it gets there | Next |
|---|---|---|
| DRAFT | Save draft (purchasing ≥ CREATE), or *Create PO* on the low-stock list | edit, submit, cancel |
| PENDING_APPROVAL | Submit — the number `PO-{FY}-0001` is assigned; approvers are notified | approve, reject, cancel |
| REJECTED | Reject with a reason (creator notified) | edit and resubmit, cancel |
| APPROVED | Approve (purchasing ≥ APPROVE, warehouse in scope; **own PO only with FULL**). *Save & approve* does it in one step | mark sent, receive, amend, cancel |
| SENT | Mark as sent (optionally email the PO PDF to the supplier) | receive, amend, cancel |
| PARTLY_RECEIVED | automatic, on a posted GRN | receive, amend, **close** |
| FULLY_RECEIVED | automatic, when every line is received | — |
| CLOSED | Close with a reason (only from PARTLY_RECEIVED, no GRN pending): the rest won't come | — |
| CANCELLED | Cancel with a reason — only while nothing was received and no GRN is pending | — |

- **Local POs** (local supplier): ৳, discount and VAT % (default from purchasing settings). **Imported POs** (foreign supplier): the supplier's currency with an indicative exchange rate (required to submit) and a BDT equivalent; duties and charges are added on the GRN.
- **Amend** (approver; APPROVED / SENT / PARTLY_RECEIVED): change quantities, prices, lines, expected date, rate / discount / VAT with a reason. The previous version is saved as a `PurchaseOrderRevision` (snapshot + list of changes; price changes are hidden from roles without `seeCost`). A line can't go below received + pending receipt (`422 AMEND_BELOW_RECEIVED`). The status is recalculated.
- **Overdue**: expected delivery date before today and still APPROVED / SENT / PARTLY_RECEIVED. Flagged in lists and on the PO, listed under *Overdue*, and emailed in a **daily 09:00 (Asia/Dhaka) digest** to purchasing ≥ CREATE users of the delivery warehouse.
- **Prices are costs**: unit prices, amounts and totals are only returned to roles with `seeCost` (`totalBdt`, `unitPriceBdt`, `totalOrderedBdt` are also in the global sensitive-field list). The price history (`/products/:id/price-history`, `/suppliers/:id/price-history`, the product page's *Price history* tab) needs `seeCost`.
- Seed permissions: Admin FULL, Manager CREATE, Accounts VIEW, Store Manager NONE.

### Receiving goods against a PO (GRN link)

1. On the PO, **Receive goods (GRN)** opens the stock entry form (`/stock?tab=new&po=…`) pre-filled: GRN type (local / imported), warehouse, supplier, currency, rate and one line per product still due. A banner names the PO; **Unlink PO** turns it into an ordinary GRN. A GRN form without a PO also offers the open POs of that warehouse/supplier.
2. Anyone with inventory ≥ CREATE in the warehouse can do this — **a Store Manager (purchasing NONE) receives without seeing any price**: the receivable endpoints list quantities only, and the server copies each line's unit price from the PO (client prices are ignored; only a `seeCost` user may override the exchange rate, e.g. with the customs rate).
3. **Over-receipt is blocked**: a line may not exceed ordered − received − pending → `422 OVER_RECEIPT` with `meta.remaining`. To receive more, an approver amends the PO first. Concurrent GRNs are serialised by locking the PO and its lines (`FOR UPDATE`) at the start of the transaction, before stock rows (lock order PO → cost → balance).
4. **Submitting** a GRN for verification holds its quantities as `pendingReceiptQty`; rejecting or cancelling it releases them. **Posting** (direct or by approval) moves them to `receivedQty` and updates the PO status in the same transaction; **reversing** a GRN takes them back off (status back to SENT / PARTLY_RECEIVED). A DB check keeps `receivedQty + pendingReceiptQty ≤ qty`.
5. **Landed cost**: on a pending imported GRN, a verifier with inventory ≥ APPROVE and `seeCost` sets the customs rate and the duties / charges (`PUT /stock-entries/:id/landed-cost`, the *Landed cost* panel on the GRN), then approves.
6. The PO creator is notified of each posted GRN and when the PO is fully received.

### Low stock → Create PO

Tick products on `/stock/low-stock` (or the row's *Create PO*): one **draft PO per default supplier** (`Product.defaultSupplierId`), quantity = suggested reorder, price = that supplier's last approved price (local: else the product's purchase cost), rate = the supplier's last rate. Products without an active default supplier come back as *unassigned*. Migration `20261026000000_purchasing` linked existing `defaultSupplierName` texts to supplier records by name; unmatched texts are kept and listed in the migration output and an audit-log row (`migration.product_default_supplier`).

### Notifications (purchasing)

| Event | Recipients |
|---|---|
| PO submitted | purchasing ≥ APPROVE in the delivery warehouse, except the creator |
| PO approved / rejected (with reason) | the creator |
| Goods received against a PO / PO fully received | the creator (not the person who posted) |
| Overdue digest (email, daily 09:00) | purchasing ≥ CREATE users of the warehouse |

The worker renders the PO PDF (`documents` queue, job `purchase-order`) and emails it to the supplier (`email` queue, PDF attached, optional cc).

Endpoints: `suppliers` (+ `/:id`, `/:id/deactivate`, `/:id/purchase-orders`, `/:id/price-history`), `purchase-orders` (+ `/calculate`, `/from-low-stock`, `/receivable`, `/:id`, `/:id/submit|approve|reject|mark-sent|close|cancel|amend|email|documents|receivable`, `/:id/attachments` (+ `/:attachmentId`)), `products/:id/price-history`, `purchasing-settings`, `stock-entries/:id/landed-cost`. Workflow POSTs need an `Idempotency-Key`.

## Projects & project costing (Module 5)

Code: `src/modules/projects` (domain / application / infrastructure / interface). The project master moved here from inventory (same `Project` table, now with client contact, type, dates, site engineer, contract value, notes and close fields). UI: `/projects` (status chips, search, card grid), `/projects/new`, `/projects/:id` (summary, tabs *Material used · Issue / return history · Labour, transport & other · Documents · Activity*), `/projects/:id/edit`. `/masters?tab=projects` redirects to `/projects`.

**Projects never touch stock tables directly.** Inventory exposes an `InventoryProjectQuery` port (material per project, serials at site, issue/return entries, open entries) and calls a `ProjectStockListener` after an issue or return is posted, approved or reversed; projects registers it in `wireModules()`.

### Project costing rules

- There is no BOQ. **Material cost comes only from posted stock movements**: `ISSUE_TO_PROJECT` minus `RETURN_FROM_SITE` (GOOD and DAMAGED), each at the ledger unit cost of the movement; reversals cancel the original. Draft, pending or rejected entries don't count.
- **Other costs** are entered by hand: `LABOUR`, `TRANSPORT`, `OTHER` (date, description, amount, payee, reference, receipts). A cost is never deleted: it is **voided** with a reason (projects FULL) and leaves the totals.
- `totalCost = net material + labour + transport + other`; `margin = contractValue − totalCost`; `marginPercent = margin ÷ contractValue × 100`; `costUsedPercent = totalCost ÷ contractValue × 100`. Without a contract value, margin, margin % and cost-used % are `null`.
- **Visibility**: cost amounts need `seeCost`; `contractValue`, `margin`, `marginPercent` and `costUsedPercent` need `seeMargin` (filtered in the API, for every response). The contract value can be set or changed only with projects FULL **and** `seeMargin`; each change is audit-logged with the old and new value.
- **Cost alerts**: when cost used reaches **90 %** and **100 %** of the contract value, users with `seeMargin` and projects ≥ VIEW are notified once per threshold (worker job `cost-alert-check` on the `projects` queue, queued after a cost is added or voided, the contract value changes, or an issue / return is posted or reversed). If cost falls back below a threshold, it re-arms.
- **Cost statement PDF** (`POST /projects/:id/documents`, needs `seeCost`): material, other costs and totals; the contract & margin section only for `seeMargin`.

### Statuses

| From → to | Who (projects level) | Reason |
|---|---|---|
| PLANNING → RUNNING | CREATE | — |
| RUNNING → ON_HOLD, ON_HOLD → RUNNING | CREATE | required |
| RUNNING → COMPLETED (sets the actual end date) | CREATE | — |
| COMPLETED → RUNNING (reopen) | FULL | required |
| COMPLETED → CLOSED | FULL | required |
| CLOSED → COMPLETED (undo close) | Admin only | required |

- **Material** can be issued only to PLANNING / RUNNING projects (ON_HOLD: "resume it first"); returns are accepted for every status except CLOSED.
- **Closing** is refused while an issue / return is PENDING verification or a transfer for the project is unreceived (`422 PROJECT_HAS_OPEN_ENTRIES`, with the entry numbers). A CLOSED project is read-only: no edits, no costs.
- Every change is kept in `ProjectStatusHistory`; the site engineer (if a user) is notified of status changes made by someone else.
- Permissions (module `projects`): VIEW read; CREATE create, edit details (not the contract value), add costs, status changes above; FULL also close / reopen, void costs, contract value. Seed: Admin FULL, Manager CREATE, Accounts VIEW, Store Manager NONE. `GET /projects/options` (id, code, name, status, warehouse; `?type=ISSUE_TO_PROJECT|RETURN_FROM_SITE` filters by status) is also open to inventory ≥ CREATE and purchasing ≥ CREATE, so a Store Manager can pick a project on the stock form.

Endpoints: `projects` (+ `/options`, `/site-engineers`, `/:id`, `/:id/deactivate`, `/:id/status`, `/:id/status-history`, `/:id/activity`, `/:id/material`, `/:id/movements`, `/:id/costs`, `/:id/costs/:costId/void`, `/:id/documents`, `/:id/attachments` (+ `/:attachmentId`), `/:id/costs/:costId/attachments` (+ `/:attachmentId`)). Status, add-cost and void POSTs need an `Idempotency-Key`. *Issue material* on a project opens `/stock?type=ISSUE_TO_PROJECT&project=…` pre-filled (warehouse = the project's supplying warehouse).

Seed (sample data on): PRJ-001 running with issues, a return (part damaged), labour and transport; PRJ-002 planning; a retail fit-out on hold; a residence completed at about 90 % of its contract value with one voided cost.

## Reports, dashboard & scheduled emails (Module 6)

Code: `src/modules/reporting` (domain / application / infrastructure / interface). UI: `/reports` (tabs *Reports (14) · Scheduled emails (n)*) and the dashboard at `/` → `/dashboard`. Charts: `src/components/charts/Chart.tsx` (in-house SVG: bar, hbar, line, stacked, donut; Carbon palette; tooltip, *View as table*, empty state).

**Reporting is read-only.** Every report query runs in a `READ ONLY` transaction with `statement_timeout` (`REPORT_QUERY_TIMEOUT_MS`, default 30 s). A slow query fails with `503 QUERY_TIMEOUT` ("Narrow the filters…"). Aggregation, sorting and paging happen in PostgreSQL. Reporting never calls another module's write services.

### Permissions (module `reports`)

| Level | Can |
|---|---|
| NONE | nothing (403 on every reports endpoint; the page shows a locked state) |
| VIEW | run and export every report; create and manage **own** schedules (recipients: users only) |
| FULL | also manage everyone's schedules and send to **external** email addresses |

Seed: Admin FULL, Accounts FULL, Manager NONE, Store Manager NONE.

These rules apply in the API and in the export and email code, for every report, chart, Excel/PDF file and scheduled email:

- **Columns**: cost needs `seeCost`, profit needs `seeProfit`, and contract/margin needs `seeMargin`. Accounts sees profit but not margin. A hidden column is absent from the JSON and from both file formats; totals and charts follow the same rule.
- **Rows**: always limited to the user's warehouses. A `warehouseId` outside them gets 403, never an empty report.

### The 14 reports

| # | Report (`id`) | Columns (flag) | Filters |
|---|---|---|---|
| 1 | Stock summary (`stock-summary`) | code, product, brand, category, one column per warehouse, damaged, reserved, available, in transit, total, avg cost (cost), value (cost); chart: value by brand (quantity without cost) | warehouse, brand, category, search, include zero stock |
| 2 | Stock movement (`stock-movement`) | date, entry no., type, warehouse, product code / name, in, out, unit cost (cost), value (cost) | date range, warehouse, brand, category, product, entry type |
| 3 | Stock aging (`stock-aging`) | code, product, brand, qty 0–30 / 31–90 / 91–180 / 180+ days, total, oldest receipt, value per bucket (cost), total value (cost); donut by bucket | warehouse, brand, category, search, *age as of* |
| 4 | Low stock (`low-stock`) | code, product, brand, unit, available, minimum, short by, suggested order; row action **Create PO** (purchasing ≥ CREATE only) | warehouse, brand, category, search |
| 5 | Serial lookup (`serial-lookup`) | serial, product, status, current location, last entry, date | serial (partial), status, product, warehouse |
| 6 | Open POs & pending deliveries (`open-pos`) | PO, supplier, product, ordered, received, pending receipt, remaining, expected, delivery (overdue), PO status | supplier, warehouse, overdue only, search |
| 7 | Purchases by supplier (`purchases-by-supplier`) | code, supplier, type, POs, ordered value (cost), GRNs, received imported / local / total at landed cost (cost) | date range, supplier, warehouse |
| 8 | Price history (`price-history`) | product, date, source (PO / GRN), document, supplier, currency, unit price (cost), unit price BDT (cost), change vs previous (cost); line chart | product, supplier, brand, date range, search |
| 9 | Project cost summary (`project-cost-summary`) | code, project, client, status, material / labour / transport / other / total cost (cost), contract value, margin, margin % (margin) | status, date range (costs in the period), search |
| 10 | Material by project (`material-by-project`) | project, product, unit, issued, returned, net, net cost (cost) | project, brand, category, date range, search |
| 11 | Sales (`sales`) | date, invoice, customer, warehouse, items, sales ex VAT, VAT, incl. VAT, cost (cost), profit and margin % (profit) | date range, customer, warehouse, search |
| 12 | Damage & loss (`damage-loss`) | date, entry, type (write-off / count shortage), reason, warehouse, items, value (cost), status | date range, warehouse, status, search |
| 13 | Pending verification (`pending`) | number, what, date, created by, warehouse, items, value (cost), waiting (days); row action *Open* | what (entry / count / PO / transfer), warehouse |
| 14 | Audit log (`audit-log`) | date/time, user, action, record type, record, before → after summary (hidden fields scrubbed) | date range, user, record type, action |

### Endpoints

- **Reports**:
  - `GET /reports` (catalog with this user's columns)
  - `GET /reports/:id/run` → `{ data: rows, meta, totals, chart, report, params }`; page size ≤ 200; filters are query parameters; dates accept `YYYY-MM-DD` or tokens such as `monthStart`, `today`, `-30d`, `lastMonthStart`
  - `GET /reports/lookups` (+ `/products`)
- **Exports**:
  - `POST /reports/:id/exports {format: xlsx|pdf, params, sort?}` → `202 {jobId}`; writes an audit row (`report.export`)
  - `GET /exports/:jobId` (requester only) → status plus a **signed download link valid for 1 hour** (`/exports/:jobId/download?expires&signature`; no session needed)
  - Excel streams up to 100,000 rows. A PDF shows the first 5,000 rows with a note; its totals still cover every row.
- **Schedules**:
  - `GET|POST /report-schedules`, `GET|PATCH|DELETE /report-schedules/:id`
  - `POST /report-schedules/:id/pause|resume|run-now`
  - `GET /report-schedules/:id/runs`, `GET /report-schedules/:id/runs/:runId/files/:index`
  - Create, edit, delete, pause, resume and run-now are audited.
- **Dashboard**: `GET /dashboard` (dashboard ≥ VIEW).

### Files

- **Excel** (ExcelJS streaming writer):
  - header block: StockBook, report title, filters used, "Generated … (Asia/Dhaka) by …"
  - header row 6: bold, light gray, frozen, with autofilter
  - number formats (`#,##0.00` for BDT), a totals row and a summary block
  - a *Chart data* sheet when the report has a chart
- **PDF** (Puppeteer in the worker):
  - embedded IBM Plex Sans, a black header rule, title and filter summary
  - KPI tiles and the chart as inline SVG
  - a table whose header repeats on every page
  - landscape for wide reports; footer "Page x of y" with the generated date

### Scheduled emails

- **Timing**:
  - Daily, weekly (day of week) or monthly (day 1–31; **31 = the last day of every month**, so February runs on the 28th/29th)
  - at `HH:mm` Asia/Dhaka, as Excel, PDF or both
  - relative date filters are resolved at each run, so "last month" is always last month
- **Scheduler**: a BullMQ job scheduler ticks every minute (`scheduler-tick` on the `reports` queue). It claims due schedules with `FOR UPDATE SKIP LOCKED`, so two workers never send the same schedule twice. It then moves `nextRunAt` forward and queues a `schedule-run`.
- **Each run uses the owner's permissions at run time**:
  - If the owner is disabled or lost Reports access, the run is skipped and marked FAILED, and every Admin is notified (`REPORT_SCHEDULE_FAILED`, in-app and email).
  - A user recipient gets the email only if they have reports ≥ VIEW. Their file contains only the columns and warehouses that **both** they and the owner may see; files are generated per audience.
  - External addresses get the owner's view, only while the owner has FULL.
  - Recipients skipped at run time are listed in the run's history.
- **Run history**: lists every file. A file can be downloaded only by someone who sees at least everything it was made for.

### Dashboard

- **Layout**: a KPI row, a two-column chart grid (one column on phones), then lists. Every tile links to a report, or to the module screen when the user has no Reports access.
- **KPIs**:
  - stock value (`seeCost`), low stock, waiting for **my** approval, open POs, overdue POs, running projects, transfers to receive
- **Charts**:
  - stock value by brand (quantity without `seeCost`)
  - in vs out per day for 30 days
  - top 10 issued products this month
  - project cost vs contract (`seeMargin`)
- **Lists**: low stock top 5, my pending approvals, my recent entries, recent activity (10).
- **Visibility**: widgets the user can't see are omitted (no money at all for a Store Manager).
- **Caching**:
  - Shared widgets are cached in Redis for 60 s per role permissions + flags + warehouse scope + admin flag. Personal widgets are computed per user.
  - Inventory, purchasing and projects publish a *data changed* event after each committed transaction (`src/shared/events/change-events.ts`). Reporting subscribes in `wireModules()` and clears the cache.

### Adding a report

1. Write a definition with `defineReport({...})` in `src/modules/reporting/infrastructure/reports/<group>.ts`:
   - `meta`: id, number, title, group, description, landscape
   - `params` (reuse `P.*`), `sortFields` / `defaultSort`
   - `columns(warehouses)` built with `text` / `qtyCol` / `moneyCol` / `percentCol` / `dateCol` / `tagCol`, each with its `requires` flag
   - `totals`, an optional `chart(flags)` and `rowAction`
   - `query(db, params, req, ctx)`
2. In `query`:
   - always filter by `ctx.scope` (the user's warehouses, or the chosen one)
   - page in SQL with `LIMIT req.pageSize OFFSET req.offset` and `orderBy(req.sort, …)`
   - return `rowsOnly(rows)` when `!req.summary`
   - return values as decimal strings (`money`, `qty`), with `_links` for linked columns
3. Add it to `REPORTS` in `infrastructure/registry.ts`.
4. Add any new cost/profit/margin field name to `src/shared/rbac/sensitive-fields.ts`.
5. Add a fixture test in `tests/integration/reports.test.ts`.

The application layer validates filters, enforces scope and strips hidden columns, totals and charts. Exports, schedules and the screen all go through it.

### Performance

Measured by `tests/integration/report-performance.test.ts` (PostgreSQL 16 in Docker on the dev laptop): 50,000 ledger movements, 200 products, 2 warehouses, one year of dates. Indexes added: `StockMovement (warehouseId, postedAt)`, `(productId, postedAt)`, `StockEntry (type, status, entryDate)`, `AuditLog (entityType, createdAt)`, `(action, createdAt)`.

| Query | Time |
|---|---|
| Stock summary (page of 50, sorted by value) | 36 ms |
| Stock movement, 90 days (12,467 rows, page of 200) | 48 ms |
| Stock movement, year to date, sorted by quantity (40,688 rows) | 127 ms |
| Stock aging | 402 ms |

The test fails above 2 s.

## File storage

`src/shared/storage` is an S3-compatible adapter (`put`, `get`, `delete`). The bucket is **private**: the app reads files and serves them only through authenticated routes such as `/api/v1/products/:id/photos/:photoId/file`, so mobile apps fetch images with their bearer token. Uploaded images are checked by content with sharp (not by file name or declared type) and stored as the original plus a 400px WebP thumbnail.

| Variable | Dev (MinIO, docker compose) | Production example (Contabo Object Storage) |
|---|---|---|
| `S3_ENDPOINT` | `http://minio:9000` (`http://localhost:9000` outside Docker) | `https://eu2.contabostorage.com` |
| `S3_REGION` | `us-east-1` | `default` (any value the provider accepts) |
| `S3_BUCKET` | `stockbook` | your private bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `minioadmin` / `minioadmin` | from the provider's panel |
| `S3_FORCE_PATH_STYLE` | `true` | `true` for Contabo and MinIO; `false` for AWS virtual-hosted style |
| `S3_AUTO_CREATE_BUCKET` | `true` | `false` (create the bucket yourself) |

Dev uses the `bitnamilegacy/minio` image because the upstream `minio/minio` image is no longer published on Docker Hub.

## Deployment

See [docs/coolify.md](docs/coolify.md) for Coolify on a Contabo VPS (two services from one image + PostgreSQL + Redis).

## Environment

Every variable is documented in [.env.example](.env.example) and validated at startup by `src/shared/config/env.ts`.
#   T e c h n o c o o l A d m i n  
 