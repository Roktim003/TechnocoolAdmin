# TechnoCool Inventory API: mobile quick reference

Every `/api/v1` endpoint for the Android and iOS apps: URL, who may call it, parameters, request body, status codes and one real request and response.

- **Base URL:** `https://<your-domain>/api/v1` (local: `http://localhost:3000/api/v1`). Paths below are relative to it.
- **Auth:** `POST /auth/login` with `"client": "mobile"` returns a JWT access token (15 minutes) and a refresh token (30 days). Send `Authorization: Bearer <accessToken>` on every other call. Details in section 3.
- **Name:** the product is TechnoCool Inventory; "StockBook" in this file is its code name.
- **Examples are shortened:** a list in example JSON shows its first item and `// … N more`; a long response that repeats an earlier one says `same record as in <endpoint>`. Each endpoint has one example here.
- **Full reference:** [StockBook-API-Mobile.md](StockBook-API-Mobile.md) has every example (errors, other roles) with complete JSON. The live spec is `GET /api/v1/openapi.json` (Swagger UI at `/api/docs`).

## All 204 endpoints

**3. Sign-in, tokens and profile**

| Method | URL | Purpose |
|---|---|---|
| POST | `/auth/login` | Log in with username + password |
| POST | `/auth/refresh` | Rotate the refresh token and get a new access token |
| GET | `/auth/me` | Current user, role, permissions, sensitive-data flags and warehouses |
| POST | `/auth/logout` | Log out (revoke this login's refresh tokens) |
| GET | `/warehouses` | List warehouses |

**4. Home: dashboard**

| Method | URL | Purpose |
|---|---|---|
| GET | `/dashboard` | The role-aware dashboard |

**5. Notifications and push**

| Method | URL | Purpose |
|---|---|---|
| GET | `/notifications` | List my notifications |
| GET | `/notifications/unread-count` | Unread count (for the header bell) |
| POST | `/notifications/{id}/read` | Mark one as read |
| POST | `/notifications/read-all` | Mark all as read |
| GET | `/notification-preferences` | My notification preferences |
| PATCH | `/notification-preferences` | Change email and push preferences |
| POST | `/push-devices` | Register this phone for push notifications |
| GET | `/push-devices` | My phones registered for push |
| DELETE | `/push-devices/{id}` | Stop push to this phone |

**6. Products and scanning**

| Method | URL | Purpose |
|---|---|---|
| GET | `/products` | List products |
| GET | `/products/{id}` | Get a product (with photos) |
| GET | `/products/by-barcode/{barcode}` | Find a product by barcode |
| GET | `/products/by-code/{code}` | Find a product by code |
| GET | `/products/{id}/photos/{photoId}/file` | Download a photo (authenticated proxy) |
| GET | `/products/{id}/history` | Audit history of a product |
| GET | `/products/{id}/price-history` | A product's purchase price history |
| GET | `/catalogs` | List catalogs |
| GET | `/categories` | List categories |
| GET | `/units` | List units |
| POST | `/products` | Create a product |
| PATCH | `/products/{id}` | Update a product |
| GET | `/products/check-code` | Check whether a product code is free |
| POST | `/products/{id}/discontinue` | Discontinue a product (never deleted; can't be picked in new entries) |
| POST | `/products/{id}/reactivate` | Reactivate a discontinued product |
| POST | `/products/{id}/photos` | Upload photos |
| PATCH | `/products/{id}/photos/{photoId}` | Set primary photo or move it |
| DELETE | `/products/{id}/photos/{photoId}` | Delete a photo |
| POST | `/catalogs` | Create a catalog (brand) |
| PATCH | `/catalogs/{id}` | Rename / deactivate a catalog (brand) |
| DELETE | `/catalogs/{id}` | Delete a catalog (brand) |
| POST | `/categories` | Create a category |
| PATCH | `/categories/{id}` | Rename / deactivate a category |
| DELETE | `/categories/{id}` | Delete a category |
| POST | `/units` | Create a unit of measure |
| PATCH | `/units/{id}` | Rename / deactivate a unit of measure |
| GET | `/products/import/template` | Download the Excel import template |
| POST | `/products/import` | Upload an .xlsx import (runs in the background) |
| GET | `/products/import/{jobId}` | Import job status and row-level results |
| GET | `/products/export` | Export the filtered product list to Excel |

**7. Stock levels and serial numbers**

| Method | URL | Purpose |
|---|---|---|
| GET | `/stock/balances` | Stock levels by product |
| GET | `/stock/products/{productId}` | A product's stock card and ledger |
| GET | `/stock/availability` | Available quantity of a product in a warehouse |
| GET | `/stock/movements` | Stock ledger (append-only movements) |
| GET | `/serials` | List serial numbers |
| GET | `/serials/{id}` | A serial number, where it came in and its history |

**8. Stock in / out (entries)**

| Method | URL | Purpose |
|---|---|---|
| GET | `/stock-entries` | List stock entries |
| POST | `/stock-entries/calculate` | Preview an entry's totals and costs (saves nothing) |
| POST | `/stock-entries` | Create a stock entry |
| GET | `/stock-entries/{id}` | Get a stock entry |
| PATCH | `/stock-entries/{id}` | Edit a draft or rejected entry |
| POST | `/stock-entries/{id}/submit` | Submit for verification |
| POST | `/stock-entries/{id}/post` | Post a draft or rejected entry directly |
| POST | `/stock-entries/{id}/approve` | Approve (verify) a pending entry |
| POST | `/stock-entries/{id}/reject` | Reject a pending entry |
| POST | `/stock-entries/{id}/cancel` | Cancel a draft, pending or rejected entry |
| POST | `/stock-entries/{id}/reverse` | Reverse a posted entry |
| POST | `/stock-entries/{id}/receive` | Receive a dispatched transfer |
| PUT | `/stock-entries/{id}/landed-cost` | Set landed-cost charges / customs rate of a pending import GRN |
| PATCH | `/stock-entries/{id}/import-shipment` | Edit the import document details of a GRN (Imported) |
| GET | `/stock-entries/{id}/attachments` | List an entry's attachments |
| POST | `/stock-entries/{id}/attachments` | Upload attachments or import document files |
| GET | `/stock-entries/{id}/attachments/{attachmentId}` | Download an attachment |
| GET | `/stock-entries/{id}/attachments/{attachmentId}/download` | Download or view an attachment |
| DELETE | `/stock-entries/{id}/attachments/{attachmentId}` | Remove an attachment |
| POST | `/stock-entries/{id}/documents` | Queue a printable PDF |
| GET | `/documents/{jobId}` | Document job status, or the PDF with ?download=1 |

**9. Stock counts**

| Method | URL | Purpose |
|---|---|---|
| GET | `/stock-counts` | List stock counts |
| POST | `/stock-counts` | Create a stock count (DRAFT) |
| GET | `/stock-counts/{id}` | Get a stock count |
| PATCH | `/stock-counts/{id}` | Edit a draft count |
| POST | `/stock-counts/{id}/start` | Start counting (snapshot + freeze) |
| PUT | `/stock-counts/{id}/lines/{lineId}` | Record a counted line |
| POST | `/stock-counts/{id}/submit` | Submit for approval |
| GET | `/stock-counts/{id}/variance` | Variance summary |
| POST | `/stock-counts/{id}/request-recount` | Request a recount of chosen lines |
| POST | `/stock-counts/{id}/approve` | Approve and post the adjustment |
| POST | `/stock-counts/{id}/cancel` | Cancel a count |
| GET | `/stock-counts/{id}/sheet` | Queue a printable count sheet (PDF) |

**10. Low stock and alerts**

| Method | URL | Purpose |
|---|---|---|
| GET | `/stock/low-stock` | Products below their minimum |
| GET | `/stock/low-stock/export` | Low-stock list as Excel |
| GET | `/alert-settings` | Low-stock alert settings |
| PATCH | `/alert-settings` | Update alert settings |

**11. Purchase orders**

| Method | URL | Purpose |
|---|---|---|
| GET | `/purchase-orders` | List purchase orders |
| GET | `/purchase-orders/{id}` | Get a purchase order |
| POST | `/purchase-orders/calculate` | Calculate PO totals without saving |
| POST | `/purchase-orders` | Create a purchase order |
| PATCH | `/purchase-orders/{id}` | Edit a draft or rejected PO |
| POST | `/purchase-orders/{id}/submit` | Submit for approval |
| POST | `/purchase-orders/{id}/approve` | Approve |
| POST | `/purchase-orders/{id}/reject` | Reject |
| POST | `/purchase-orders/{id}/mark-sent` | Mark sent |
| GET | `/purchase-orders/receivable` | Purchase orders open for receiving |
| GET | `/purchase-orders/{id}/receivable` | What a GRN can still receive |
| POST | `/purchase-orders/{id}/amend` | Amend an approved PO |
| POST | `/purchase-orders/{id}/close` | Close (accept a short delivery) |
| POST | `/purchase-orders/{id}/cancel` | Cancel |
| POST | `/purchase-orders/{id}/email` | Email the PO to the supplier |
| POST | `/purchase-orders/{id}/documents` | Queue the PO PDF |
| POST | `/purchase-orders/from-low-stock` | Create POs from low-stock products |
| GET | `/purchase-orders/{id}/attachments` | List a PO's attachments |
| POST | `/purchase-orders/{id}/attachments` | Attach files (quotation, proforma invoice) |
| GET | `/purchase-orders/{id}/attachments/{attachmentId}` | Download a PO attachment |
| DELETE | `/purchase-orders/{id}/attachments/{attachmentId}` | Remove an attachment |

**12. Projects and project costs**

| Method | URL | Purpose |
|---|---|---|
| GET | `/projects` | List projects |
| GET | `/projects/options` | Projects for the stock entry form |
| GET | `/projects/site-engineers` | Users to pick as site engineer |
| GET | `/projects/{id}` | Get a project |
| POST | `/projects` | Create a project |
| PATCH | `/projects/{id}` | Edit a project |
| POST | `/projects/{id}/status` | Change a project's status |
| GET | `/projects/{id}/status-history` | Status history |
| POST | `/projects/{id}/deactivate` | Deactivate a project |
| GET | `/projects/{id}/material` | Material used |
| GET | `/projects/{id}/movements` | Issue / return history |
| GET | `/projects/{id}/activity` | Activity |
| GET | `/projects/{id}/costs` | Other costs & overheads |
| POST | `/projects/{id}/costs` | Add a cost or an overhead |
| PATCH | `/projects/{id}/costs/{costId}` | Edit an overhead |
| POST | `/projects/{id}/costs/{costId}/void` | Void a cost |
| GET | `/projects/{id}/costs/{costId}/history` | History of a cost line |
| GET | `/projects/{id}/costs/{costId}/attachments` | Cost receipts: list |
| POST | `/projects/{id}/costs/{costId}/attachments` | Cost receipts: upload |
| GET | `/projects/{id}/costs/{costId}/attachments/{attachmentId}` | Cost receipts: download |
| DELETE | `/projects/{id}/costs/{costId}/attachments/{attachmentId}` | Cost receipts: remove |
| GET | `/projects/{id}/attachments` | Project documents (work order, drawings, handover papers, site photos): list |
| POST | `/projects/{id}/attachments` | Project documents (work order, drawings, handover papers, site photos): upload |
| GET | `/projects/{id}/attachments/{attachmentId}` | Project documents (work order, drawings, handover papers, site photos): download |
| DELETE | `/projects/{id}/attachments/{attachmentId}` | Project documents (work order, drawings, handover papers, site photos): remove |
| POST | `/projects/{id}/documents` | Cost statement PDF |

**13. Warehouse costs (overheads)**

| Method | URL | Purpose |
|---|---|---|
| GET | `/warehouse-costs` | List overhead costs |
| POST | `/warehouse-costs` | Add an overhead cost |
| GET | `/warehouse-costs/{id}` | Get an overhead cost |
| PATCH | `/warehouse-costs/{id}` | Edit an overhead cost |
| POST | `/warehouse-costs/{id}/void` | Void an overhead cost |
| GET | `/warehouse-costs/{id}/history` | History of an overhead cost |
| GET | `/warehouse-costs/summary` | Monthly summary |
| GET | `/warehouse-costs/summary/export` | Monthly summary as Excel |
| GET | `/warehouse-costs/{id}/attachments` | Receipts and bills: list |
| POST | `/warehouse-costs/{id}/attachments` | Receipts and bills: upload |
| GET | `/warehouse-costs/{id}/attachments/{attachmentId}` | Receipts and bills: download |
| DELETE | `/warehouse-costs/{id}/attachments/{attachmentId}` | Receipts and bills: remove |

**14. Reports and exports**

| Method | URL | Purpose |
|---|---|---|
| GET | `/reports` | The reports catalog |
| GET | `/reports/{id}/run` | Run a report (one page) |
| GET | `/reports/lookups` | Filter options |
| GET | `/reports/lookups/products` | Product search for filters |
| POST | `/reports/{id}/exports` | Export a report to Excel or PDF |
| GET | `/exports/{jobId}` | Export status |
| GET | `/exports/{jobId}/download` | Download an export (signed link) |

**15. Customers and suppliers**

| Method | URL | Purpose |
|---|---|---|
| GET | `/customers` | List customers |
| GET | `/customers/{id}` | Get a customer |
| POST | `/customers` | Create a customer |
| PATCH | `/customers/{id}` | Update a customer |
| POST | `/customers/{id}/deactivate` | Deactivate a customer |
| GET | `/suppliers` | List suppliers |
| GET | `/suppliers/{id}` | Get a supplier |
| GET | `/suppliers/{id}/purchase-orders` | A supplier's purchase orders |
| GET | `/suppliers/{id}/price-history` | A supplier's price history |
| POST | `/suppliers` | Create a supplier |
| PATCH | `/suppliers/{id}` | Update a supplier |
| POST | `/suppliers/{id}/deactivate` | Deactivate a supplier |

**16. Admin and setup (website only)**

| Method | URL | Purpose |
|---|---|---|
| GET | `/users` | List users |
| POST | `/users` | Create a user |
| GET | `/users/{id}` | Get a user |
| PATCH | `/users/{id}` | Update a user (not the password) |
| POST | `/users/{id}/password` | Set a user's password (Admin only) |
| POST | `/users/{id}/disable` | Disable a user |
| POST | `/users/{id}/enable` | Re-enable a disabled user |
| GET | `/roles` | List roles with permissions, flags and user counts |
| GET | `/roles/matrix` | Roles × modules permission matrix (overview grid) |
| POST | `/roles` | Create a custom role (blank or copied from another role) |
| GET | `/roles/{id}` | Get a role |
| PATCH | `/roles/{id}` | Edit a role's name, permission levels and sensitive-data flags |
| DELETE | `/roles/{id}` | Delete a custom role |
| GET | `/login-history` | Login attempts (success, wrong password, locked, disabled…) |
| GET | `/audit-logs` | Audit trail of create / update / delete / disable / password changes |
| GET | `/inventory-settings` | Inventory settings |
| PATCH | `/inventory-settings` | Update inventory settings |
| GET | `/purchasing-settings` | Purchasing settings |
| PATCH | `/purchasing-settings` | Update purchasing settings |
| GET | `/opening-stock/warehouses` | Opening lock status per warehouse |
| GET | `/opening-stock/template` | Download the opening-stock template |
| POST | `/opening-stock/imports` | Upload a filled template |
| GET | `/opening-stock/imports` | Recent imports |
| GET | `/opening-stock/imports/{id}` | Import status, row errors and per-warehouse summary |
| POST | `/opening-stock/imports/{id}/commit` | Import and post |
| POST | `/warehouses/{id}/lock-opening` | Lock opening stock (go-live) |
| POST | `/warehouses/{id}/unlock-opening` | Unlock opening stock |
| GET | `/report-schedules` | List schedules |
| POST | `/report-schedules` | Create a schedule |
| GET | `/report-schedules/{id}` | Get a schedule |
| PATCH | `/report-schedules/{id}` | Edit a schedule |
| POST | `/report-schedules/{id}/pause` | Pause a schedule |
| POST | `/report-schedules/{id}/resume` | Resume a schedule (next run recalculated) |
| POST | `/report-schedules/{id}/run-now` | Run a schedule now |
| GET | `/report-schedules/{id}/runs` | Run history |
| GET | `/report-schedules/{id}/runs/{runId}/files/{index}` | Download a run's file |
| DELETE | `/report-schedules/{id}` | Delete a schedule |
| GET | `/health` | Liveness / readiness: checks PostgreSQL and Redis |

## 1. Start here

StockBook is the inventory system of an HVAC contractor in Bangladesh: two warehouses (A and B), LG, Daikin and Dunham-Bush air conditioners, copper pipe and accessories. The mobile app and the website use the **same** REST API, so everything the website can do is available here. This document lists every endpoint, feature by feature, in the order the app needs them: sign-in first, then the home screen, scanning, stock, approvals, counts, purchases, projects, overheads and reports. Admin and setup endpoints used only by the website are at the end.

### 1.1 Servers

| Environment | Base URL | Notes |
|---|---|---|
| Production | https://<your-domain>/api/v1 | HTTPS only. Ask the team for the domain. |
| Local (web dev server) | http://localhost:3000/api/v1 | From the Android emulator use http://10.0.2.2:3000/api/v1; from a phone on Wi-Fi use the PC's LAN IP. |
| OpenAPI spec | GET /api/v1/openapi.json | Machine-readable spec (OpenAPI 3.1) of everything in this document. You can generate a client from it. |

### 1.2 Locale

- Timezone **Asia/Dhaka** (UTC+6). Timestamps are ISO 8601 in UTC (`2026-11-05T08:01:09.088Z`): convert to local time for display. Business dates are plain `YYYY-MM-DD` (the Dhaka calendar day); months are `YYYY-MM` or the first day of the month.
- Currency **BDT** (৳). Imported purchases may be in USD, EUR, CNY, … with an exchange rate.
- Fiscal year **July–June**. Document numbers carry it: `GRN-I-2627-0004` = 4th imported GRN of FY 2026-27. Drafts have a temporary reference such as `DRAFT-7K2QPM` until they get a number on submit or post.
- Numbers: display BDT with Indian grouping (`৳ 3,48,62,000.00`). The API never formats numbers.

### 1.3 The flow of a typical session

1. `POST /auth/login` with `client: "mobile"` → store the access token and refresh token in secure storage (Keychain / Keystore).
2. `GET /auth/me` → the user's role, permissions, flags (may they see cost, profit, margin?) and warehouses. Build the tabs and menus from it.
3. `POST /push-devices` with the FCM token → the phone starts receiving push notifications.
4. `GET /dashboard`, `GET /notifications/unread-count` → the home screen.
5. Work: lists, details, create entries (with an `Idempotency-Key`), approve, scan, upload photos…
6. On `401`: call `POST /auth/refresh` once, retry the request; if the refresh fails, go to the login screen.
7. Sign-out: `DELETE /push-devices/{id}`, then `POST /auth/logout`, then delete the tokens.

## 2. Conventions (read once, apply everywhere)

### 2.1 Request headers

| Header | When | Value |
|---|---|---|
| Authorization | Every call except login, refresh, logout and health | `Bearer <accessToken>` |
| Content-Type | Requests with a JSON body | `application/json` (file uploads: `multipart/form-data`, set by your HTTP client) |
| Idempotency-Key | **Required** on stock-changing POSTs (list in Appendix C); accepted on other POSTs | A new UUID per user action, reused on retries of that same action (8–128 chars: letters, digits, `- _ : .`) |
| Accept-Language | Not used | Messages are English. |

> Don't send an `Origin` header from the native app (native HTTP clients don't by default). Origin checks only apply to the website's cookie sessions; bearer requests skip them.

### 2.2 Response envelope

Every JSON response has the same shape. Success: `data` (an object or a list) plus `meta` on lists. Error: one `error` object. Every response also has an `X-Request-Id` header — log it and include it in bug reports.

```http
// Success (single object)
{ "data": { "id": "…", "name": "Warehouse A" } }

// Success (list)
{ "data": [ { … }, { … } ], "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }

// Error
{
  "error": {
    "code": "BUSINESS_RULE",
    "message": "Not enough stock of LG-S4-Q18KL3AA in Warehouse A: 4 available, 6 requested.",
    "details": [ { "path": "lines.0.qty", "message": "…", "code": "INSUFFICIENT_STOCK", "meta": { … } } ],
    "requestId": "b0c7…"
  }
}
```

`message` is written for people: show it to the user as it is. Use `code` and `details[].code` for logic, `details[].path` to put the message under the right form field (`lines.0.qty` = first line's quantity).

### 2.3 Status codes

| Status | Meaning | What the app should do |
|---|---|---|
| 200 / 201 | OK / created | Use `data`. 201 responses may carry a `Location` header. |
| 202 | Accepted (background job queued) | Poll the job (PDFs, exports, imports) — see 2.9. |
| 204 | Done, no body | Nothing to read (deletes, logout). |
| 400 VALIDATION_ERROR | The request is malformed or a field is invalid | Show `details[].message` next to `details[].path`. Unknown fields are rejected too (bodies are strict). |
| 401 UNAUTHENTICATED / TOKEN_EXPIRED | No token, bad token or expired access token | Refresh once and retry; if refresh fails, go to login. |
| 401 INVALID_CREDENTIALS | Wrong username or password (login) | Show the message. |
| 403 FORBIDDEN | Role lacks the permission, or the record is in a warehouse the user can't access | Hide the action; show the message. Out-of-scope data is 403, never an empty list. |
| 403 ACCOUNT_DISABLED / ACCOUNT_LOCKED | Login blocked | Tell the user to ask an Admin. |
| 404 NOT_FOUND | No such record (also for a malformed id in the path) | Show "not found" and go back. |
| 409 CONFLICT | Duplicate (e.g. code already used) or an idempotency clash | Show the message; `details[].path` names the field. |
| 409 IDEMPOTENCY_KEY_REUSED / IDEMPOTENCY_IN_PROGRESS | Same key with a different body / the first request is still running | Use a new key for a new action; wait and retry for in-progress. |
| 422 BUSINESS_RULE | Valid request, but a business rule says no (not enough stock, wrong status, own entry…) | Show the message; `details[].code` says which rule. |
| 429 RATE_LIMITED | Too many login attempts | Wait a few minutes. |
| 503 QUERY_TIMEOUT | A report took too long | Narrow the filters and retry. |
| 500 INTERNAL_ERROR | Bug | Show a generic error; report the request id. |

### 2.4 Lists: paging, sorting, search, filters

- `page` (1-based, default 1) and `pageSize` (default 20, **max 100**). `meta.total` and `meta.totalPages` tell you when to stop (infinite scroll: load the next page until `page = totalPages`).
- `sort`: comma-separated field names, `-` prefix for descending, e.g. `sort=-entryDate,number`. Each endpoint lists its sortable fields.
- `q`: free-text search (names, codes, numbers…). Field filters (e.g. `warehouseId`, `status`, `dateFrom`) are listed per endpoint. Booleans are `true` / `false`.
- Some small reference lists (warehouses, catalogs, categories, units, roles) are not paginated and return everything.

### 2.5 Numbers, money and quantities

- Money and quantities are **decimal strings**, never JSON numbers, so nothing is lost to floating point: quantities `"12.000"` (3 decimals), money `"85000.00"` (2), unit / average costs `"61240.5000"` (4), percentages `"15.00"`.
- Send decimals as strings too (`"qty": "6"`, `"unitPrice": "200.00"`). Integer counts (pages, file sizes) are plain numbers.
- Use a decimal type in the app (e.g. `BigDecimal` on Android, `Decimal` on iOS, `decimal.js` in React Native) for any sum you show.
- Some catalog values come back trimmed (`"minStockLevel": "5"`) while stock values are fixed scale (`"20.000"`). Parse, don't compare strings.

### 2.6 Who sees what: permissions, money fields and warehouses

Every user has one **role**. A role gives a level per module — `NONE < VIEW < CREATE < APPROVE < FULL` — and three flags: `seeCost`, `seeProfit`, `seeMargin`. Overhead figures additionally need the `overheads` module ≥ VIEW **and** `seeCost`. `GET /auth/me` returns all of it; use it to show or hide tabs, buttons and columns. The API enforces the same rules, so hiding is only for a clean UI.

| Role (default) | dashboard | catalog | inventory | purchasing | projects | reports | users | overheads | Flags |
|---|---|---|---|---|---|---|---|---|---|
| Admin | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | cost, profit, margin |
| Accounts | VIEW | VIEW | APPROVE | VIEW | VIEW | FULL | NONE | FULL | cost, profit |
| Manager | VIEW | VIEW | APPROVE | CREATE | CREATE | NONE | NONE | NONE | cost |
| Store Manager | VIEW | VIEW | CREATE | NONE | NONE | NONE | NONE | NONE | none |

> Admins can edit roles and create new ones, so never hard-code role names: always read `permissions` and `flags` from `/auth/me`.

- **Money fields are removed, not blanked.** For a user without `seeCost`, fields such as `unitCost`, `avgCost`, `stockValue`, `costTotal` are simply absent from the JSON (not `null`). Treat every money field as optional. The full list is in Appendix B.
- **Warehouse scope.** Users see only their own warehouses (`/auth/me` → `warehouses`). Asking for another warehouse's record or list returns **403**, not an empty result. Default lists are already limited to the user's warehouses.
- **Levels.** VIEW: read. CREATE: create drafts / submit. APPROVE: verify others' work. FULL: everything, including posting directly, reversing and settings.

### 2.7 Idempotency (safe retries)

Mobile networks drop. Every call that changes stock (create / submit / post / approve / receive / reverse an entry, count start / submit / approve…) **requires** an `Idempotency-Key` header. Create one UUID when the user taps the button and reuse it if you retry that same request. The server stores the first response for 24 hours:

- Same key + same body again → the **first response is replayed** (with header `idempotent-replayed: true`); nothing happens twice.
- Same key + a different body → `409 IDEMPOTENCY_KEY_REUSED` (you reused a key for a new action — generate a new one).
- Same key while the first request is still running → `409 IDEMPOTENCY_IN_PROGRESS` (wait a moment and retry).
- Missing header where required → `400 IDEMPOTENCY_KEY_REQUIRED`.
- **Every answer below 500 is stored, errors included.** If the server said 422 (e.g. not enough stock) and the user fixes the form, send the corrected request with a **new** key — the old key would just replay the old 422.
- Keys are per user and per endpoint path. Uploads (multipart) and PATCH / PUT don't use keys.

### 2.8 Files: uploads and downloads

- Uploads are `multipart/form-data` with the file(s) in the field `file` (several `file` parts allowed where noted) plus any other fields as text parts. Images are checked by their content (a renamed file is rejected). Typical limits: 10 MB per file, PDF / JPG / PNG (photos: JPG / PNG / WebP).
- Phone photos: resize to about 2000 px on the long side and compress (JPEG 80 %) before upload — faster on mobile data and well within limits.
- Uploads don't use `Idempotency-Key`: if you retry an upload after a timeout, the file may be added twice. Re-read the attachment list before retrying.
- Downloads (photos, attachments, PDFs) go through authenticated endpoints: send the `Authorization` header (for image views too, e.g. Glide / Coil / SDWebImage headers). `url` / `thumbnailUrl` / `downloadUrl` fields are paths relative to the server (`/api/v1/…`): prefix the server origin. `?inline=1` asks for `Content-Disposition: inline` (view instead of download).
- Report exports return a **signed link** valid for one hour that works without a token — hand it to the share sheet or browser.

### 2.9 Background jobs (PDFs, exports, imports)

Slow work runs on a background worker. The request returns `202 Accepted` with a `jobId` (and a `Location` header). Poll the status endpoint every 1–2 seconds (stop after about a minute) until `status` is `completed` (then use the download link) or `failed` (show `error`). Statuses: `queued → processing → completed | failed`.

| Job | Start | Poll |
|---|---|---|
| Entry PDF (GRN, challan, invoice, note) | POST /stock-entries/{id}/documents | GET /documents/{jobId} |
| PO PDF | POST /purchase-orders/{id}/documents | GET /documents/{jobId} |
| Project cost statement PDF | POST /projects/{id}/documents | GET /documents/{jobId} |
| Report export (Excel / PDF) | POST /reports/{id}/exports | GET /exports/{jobId} |
| Product import (web) | POST /products/import | GET /products/import/{jobId} |
| Opening stock import (web) | POST /opening-stock/imports | GET /opening-stock/imports/{id} |

### 2.10 Ids, codes and statuses

- Ids are UUIDs. A malformed id in the path returns 404.
- Product codes are unique and never change. Products are never deleted: they become `DISCONTINUED` (lists include them unless you filter `status=ACTIVE`, which product pickers should do).
- Enums are upper-case strings (`GRN_IMPORT`, `PENDING`, `ANDROID`). The tables in each chapter and the OpenAPI spec list every value. Don't break on a value you don't know — show it as text.

## 3. Sign-in, tokens and profile

Screens: S-01 Splash, S-02 Login, S-39 Profile. The app uses **bearer tokens**: login with `client: "mobile"` returns an access token (a JWT, valid **15 minutes** — see `accessTokenExpiresIn`) and a refresh token (valid **30 days**, renewed on every refresh). The website uses cookies instead; ignore those.

### Token handling

- Send `Authorization: Bearer <accessToken>` on every call. Keep both tokens in secure storage.
- Refresh **before** expiry (e.g. when less than a minute is left) or **after** a 401 `TOKEN_EXPIRED`. Retry the failed request once with the new token.
- **Every refresh returns a new refresh token; the old one dies.** Store the new pair immediately.
- **Only one refresh at a time.** If two requests fail together, let one refresh and the other wait for it. Presenting an already-used refresh token is treated as theft: the server revokes that whole sign-in session (`REFRESH_TOKEN_REUSED`) and the user must log in again.
- Splash (S-01): if a refresh token is stored, call refresh; success → Home, failure → Login.
- Account rules: 5 wrong passwords within 15 minutes lock the account (`ACCOUNT_LOCKED`) until an Admin sets a new password; disabled users get `ACCOUNT_DISABLED`; too many attempts from one place give `429`. When an Admin disables a user or sets their password, the user's tokens stop working at once (401).

#### POST /auth/login — Log in with username + password

| | |
|---|---|
| **Auth** | None (public) |
| **Mobile screens** | S-02 |

`client: "web"` (default) sets HttpOnly cookies `sb_at` (access) and `sb_rt` (refresh, path /api/v1/auth). `client: "mobile"` returns `accessToken` + `refreshToken` in the body. After 5 failed attempts in 15 minutes the account is locked until an Admin sets a new password.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `username` | string | Yes | 1–64 chars |
| `password` | string | Yes | 1–128 chars |
| `client` | web \| mobile |  | `mobile` returns tokens in the body; `web` sets HttpOnly cookies · default "web" |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 429 Rate limited

**Example: Sign in from the mobile app  (as Admin)**

*Request*

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "Admin-pass-123",
  "client": "mobile"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "me": {
      "user": {
        "id": "72b30be4-8e5e-444d-bd75-1321e1c6a40b",
        "username": "admin",
        "name": "System Administrator",
        "phone": null,
        "email": null,
        "lastLoginAt": "2026-11-05T08:01:09.088Z"
      },
      "role": {
        "id": "2c2d2b5c-7466-49f6-877e-a0123328676e",
        "name": "Admin",
        "isLocked": true
      },
      "permissions": {
        "dashboard": "FULL",
        "catalog": "FULL",
        "inventory": "FULL",
        "purchasing": "FULL",
        "projects": "FULL",
        "reports": "FULL",
        "users": "FULL",
        "overheads": "FULL"
      },
      "flags": {
        "seeCost": true,
        "seeProfit": true,
        "seeMargin": true
      },
      "warehouses": [
        {
          "id": "679657a8-b803-4b11-94da-1f935226970a",
          "code": "A",
          "name": "Warehouse A"
        },
        // … 1 more
      ]
    },
    "accessTokenExpiresIn": 900,
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5…(327 chars)",
    "refreshToken": "laQ0DUUpwLWEHv9sa2Kt3Fc8…(43 chars)",
    "refreshTokenExpiresAt": "2026-12-05T08:01:09.095Z"
  }
}
```

*More examples in the full reference:* Sign in as a Store Manager  (as Store Manager) · Error: wrong username or password · Error: missing fields · Error: account disabled

#### POST /auth/refresh — Rotate the refresh token and get a new access token

| | |
|---|---|
| **Auth** | None (public) |

Mobile: send `refreshToken` in the body; new tokens are returned in the body. Web: send no body; the `sb_rt` cookie is used and new cookies are set. Every refresh invalidates the presented token. Re-using an old token revokes every token of that login (token family).

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `refreshToken` | string |  | Mobile: the refresh token. Web: omit; the HttpOnly cookie is used. · 16–256 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Get a new access token (rotates the refresh token)**

> Call when any request returns 401 TOKEN_EXPIRED / UNAUTHENTICATED. Store BOTH new tokens: the old refresh token stops working.

*Request*

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "laQ0DUUpwLWEHv9sa2Kt3Fc8…(43 chars)"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /auth/login */ }
}
```

*More examples in the full reference:* Error: refresh token already used (whole session revoked)

#### GET /auth/me — Current user, role, permissions, sensitive-data flags and warehouses

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Mobile screens** | S-01, S-39 (and every launch) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked

**Example: Who am I (Admin)  (as Admin)**

*Request*

```http
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "user": {
      "id": "72b30be4-8e5e-444d-bd75-1321e1c6a40b",
      "username": "admin",
      "name": "System Administrator",
      "phone": null,
      "email": null,
      "lastLoginAt": "2026-11-05T08:01:09.088Z"
    },
    "role": {
      "id": "2c2d2b5c-7466-49f6-877e-a0123328676e",
      "name": "Admin",
      "isLocked": true
    },
    "permissions": {
      "dashboard": "FULL",
      "catalog": "FULL",
      "inventory": "FULL",
      "purchasing": "FULL",
      "projects": "FULL",
      "reports": "FULL",
      "users": "FULL",
      "overheads": "FULL"
    },
    "flags": {
      "seeCost": true,
      "seeProfit": true,
      "seeMargin": true
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      },
      // … 1 more
    ]
  }
}
```

*More examples in the full reference:* Who am I (Store Manager: no cost flags, limited modules)  (as Store Manager) · Error: no token / expired token

#### POST /auth/logout — Log out (revoke this login's refresh tokens)

| | |
|---|---|
| **Auth** | None (public) |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `refreshToken` | string |  | Mobile: the refresh token. Web: omit; the HttpOnly cookie is used. · 16–256 chars |

**Responses:** 204 Logged out; auth cookies cleared · 400 Validation error · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Sign out (revokes the refresh token)**

> Call DELETE /push-devices/{id} first, then this. Then delete both tokens from the phone.

*Request*

```http
POST /api/v1/auth/logout
Content-Type: application/json

{
  "refreshToken": "k5i6x23Wq28tbZ5iolj--9sh…(43 chars)"
}
```

*Response*

```http
HTTP 204 No Content
```

#### GET /warehouses — List warehouses

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Mobile screens** | Warehouse switcher (S-03), pickers |

User administrators see all warehouses; other users see only the warehouses they are assigned to.

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked

**Example: My warehouses  (as Admin)**

*Request*

```http
GET /api/v1/warehouses
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "679657a8-b803-4b11-94da-1f935226970a",
      "code": "A",
      "name": "Warehouse A",
      "isActive": true
    },
    // … 1 more
  ]
}
```

## 4. Home: dashboard

Screen S-03. One call returns every tile, chart and list the user may see, already filtered by role, flags and warehouses. Render widgets in the order given; skip kinds you don't know.

- `kind: "kpi"` — a tile: `title`, `value` (number, or a decimal string when `valueType` is `money`), `tone` (`default` / `warning` / `danger` → colour), `caption`, `link`.
- `kind: "chart"` — `chart.type` (`bar`, `hbar`, `line`, `stacked`, `donut`), `chart.valueType` (`money` / `number`), `chart.series` (names, for multi-series), `chart.points[]` with `label` and `values[]` (one per series; usually decimal strings, sometimes plain numbers — parse both). Offer a "View as table" from the same points.
- The response is `{ data: Widget[], cached, generatedAt }`: KPIs first, then charts, then lists. Stock value and the by-brand chart include stock in transit.
- `kind: "list"` — `rows[]` with `primary`, `secondary`, `meta`, optional `tag {label, kind}` and `link`; `empty` is the text to show when there are no rows.
- `link` values are website paths (see the link table in chapter 5). Map them to app screens.
- Shared widgets are cached for 60 seconds on the server; pull-to-refresh simply calls the endpoint again.

#### GET /dashboard — The role-aware dashboard

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `dashboard` ≥ VIEW |
| **Mobile screens** | S-03 |

Widgets the caller may not see are omitted (money only with `seeCost`; project contract vs cost only with `seeMargin`, on full cost with overhead access and on direct cost without; the KPIs `overheadsThisMonth` and `overheadsNotCharged` only with overhead access, i.e. `overheads` ≥ VIEW + `seeCost`). Shared widgets are cached for 60 s per role, flags (incl. overhead access) and warehouse scope and cleared when stock, purchasing, project or overhead data change.

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Dashboard (all widgets)  (as Admin)**

> KPI tiles first, then charts, then lists. Money values are decimal strings; counts are numbers.

*Request*

```http
GET /api/v1/dashboard
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "stock-value",
      "kind": "kpi",
      "title": "Stock value",
      "value": "1791490.83",
      "valueType": "money",
      "tone": "default",
      "caption": "At average cost, your warehouses",
      "link": "/reports?r=stock-summary"
    },
    // … 2 more
  ],
  "cached": false,
  "generatedAt": "2026-11-05T08:10:39.323Z"
}
```

*More examples in the full reference:* Dashboard without money (Store Manager)  (as Store Manager)

## 5. Notifications and push

Screens: S-04 Notifications inbox, S-05 Notification settings, bell badge on Home. Every event creates an in-app notification for the right people; it is also pushed to their phones (Firebase Cloud Messaging) unless they turned push off for that type, and emailed when their email preference is on.

### Push setup (Firebase Cloud Messaging)

1. Add Firebase to the app (Android: `google-services.json`; iOS: `GoogleService-Info.plist` + an APNs key in the Firebase project). Ask the team for the Firebase project.
2. After sign-in (and on every app start, and in `onNewToken`), get the FCM registration token and call `POST /push-devices`. Keep the returned `id`.
3. On sign-out, call `DELETE /push-devices/{id}` **before** `POST /auth/logout`.
4. When a push arrives / is tapped, read its `data`: `notificationId`, `type`, `link`. Open the screen for `link` and call `POST /notifications/{notificationId}/read`. Refresh the bell count.
5. iOS shows the unread count as the app badge (sent with every push).

```http
// FCM message the app receives (HTTP v1)
{
  "notification": { "title": "GRN-I-2627-0003 needs verification", "body": "Submitted by Rahim Uddin, Warehouse A." },
  "data": { "notificationId": "8c1d…", "type": "STOCK_ENTRY_SUBMITTED", "link": "/stock/5b0e…" },
  "android": { "priority": "HIGH", "notification": { "sound": "default" } },
  "apns": { "payload": { "aps": { "sound": "default", "badge": 3 } } }
}
```

### Links in notifications and widgets

Links are website paths. Map them to app screens:

| Link | Open |
|---|---|
| /stock/{entryId} | Entry detail (S-15). `#receive` at the end: open the receive screen (S-16). |
| /stock/counts/{countId} | Count (S-20 counting, or S-21 review for approvers). |
| /stock/products/{productId} | Product detail / stock card (S-08). |
| /stock/low-stock | Low stock (S-10). |
| /stock?tab=entries… | Entries list (S-11); `status=` and `mine=1` are filters. |
| /purchases/{poId} | Purchase order detail (S-25). |
| /projects/{projectId} | Project detail (S-27). |
| /reports?r={reportId} | Report viewer (S-36). |

### Notification types

| type | Label | Sent when | Push | Email by default |
|---|---|---|---|---|
| `STOCK_ENTRY_SUBMITTED` | Entry waiting for verification | Someone submitted a stock entry in your warehouse for you to approve. | Yes (can be turned off) | On |
| `STOCK_ENTRY_APPROVED` | Your entry was approved | A stock entry you created was approved and posted. | Yes (can be turned off) | Off |
| `STOCK_ENTRY_REJECTED` | Your entry was rejected | A stock entry you created was rejected, with the reason. | Yes (can be turned off) | On |
| `TRANSFER_DISPATCHED` | Transfer on its way | Goods were dispatched to your warehouse. | Yes (can be turned off) | On |
| `TRANSFER_SHORTAGE` | Transfer received short | A transfer from your warehouse arrived with a shortage. | Yes (can be turned off) | On |
| `STOCK_COUNT_SUBMITTED` | Stock count waiting for approval | A stock count in your warehouse was submitted for review. | Yes (can be turned off) | On |
| `STOCK_COUNT_RECOUNT` | Recount requested | An approver asked for some lines of a count to be counted again. | Yes (can be turned off) | On |
| `STOCK_COUNT_APPROVED` | Stock count approved | A count you created or counted was approved. | Yes (can be turned off) | Off |
| `LOW_STOCK` | Product below minimum | A product's available stock fell below its minimum level. | Yes (can be turned off) | On |
| `LOW_STOCK_DIGEST` | Daily low-stock digest | A morning email listing every product below its minimum. | No (email only) | On |
| `PO_SUBMITTED` | Purchase order waiting for approval | A purchase order was submitted for you to approve. | Yes (can be turned off) | On |
| `PO_APPROVED` | Your purchase order was approved | A purchase order you created was approved. | Yes (can be turned off) | Off |
| `PO_REJECTED` | Your purchase order was rejected | A purchase order you created was rejected, with the reason. | Yes (can be turned off) | On |
| `PO_GOODS_RECEIVED` | Goods received against your PO | A GRN against a purchase order you created was posted. | Yes (can be turned off) | Off |
| `PO_FULLY_RECEIVED` | Purchase order fully received | Everything on a purchase order you created has been received. | Yes (can be turned off) | On |
| `PROJECT_COST_ALERT` | Project cost near the contract value | A project's total cost reached 90% or 100% of its contract value. | Yes (can be turned off) | On |
| `PROJECT_STATUS_CHANGED` | Your project changed status | A project you are the site engineer of was started, put on hold, completed, closed or reopened. | Yes (can be turned off) | Off |
| `REPORT_SCHEDULE_FAILED` | Scheduled report failed | A scheduled report email could not run (for example its owner was disabled or lost access). | Yes (can be turned off) | On |
| `PO_OVERDUE_DIGEST` | Daily overdue purchase orders | A 9:00 AM email listing purchase orders past their expected delivery date. | No (email only) | On |

#### GET /notifications — List my notifications

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own notifications |
| **Mobile screens** | S-04 |

Newest first; filter `unread`, `type`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: createdAt · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `unread` | boolean | Only unread |
| `type` | string or null | max 60 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked

**Example: My notifications, newest first  (as Manager)**

*Request*

```http
GET /api/v1/notifications?pageSize=2
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "265a56a4-bc05-498d-a4ff-01c88130741e",
      "type": "STOCK_ENTRY_SUBMITTED",
      "title": "ISS-2627-0002 needs verification",
      "body": "Rahim Uddin submitted a issue to project in Warehouse A (1 item).",
      "link": "/stock/4ebb9b25-a4d8-40d3-88ba-222521b59b72",
      "readAt": null,
      "createdAt": "2026-11-05T08:01:10.093Z"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 2,
    "totalPages": 1
  }
}
```

*More examples in the full reference:* Only unread  (as Manager)

#### GET /notifications/unread-count — Unread count (for the header bell)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own notifications |
| **Mobile screens** | Bell badge (S-03) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked

**Example: Unread count (for the bell badge)  (as Manager)**

*Request*

```http
GET /api/v1/notifications/unread-count
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "count": 2
  }
}
```

#### POST /notifications/{id}/read — Mark one as read

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own notifications |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 404 Not found

**Example: Mark one as read (when the user opens it)  (as Manager)**

*Request*

```http
POST /api/v1/notifications/265a56a4-bc05-498d-a4ff-01c88130741e/read
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "265a56a4-bc05-498d-a4ff-01c88130741e",
    "type": "STOCK_ENTRY_SUBMITTED",
    "title": "ISS-2627-0002 needs verification",
    "body": "Rahim Uddin submitted a issue to project in Warehouse A (1 item).",
    "link": "/stock/4ebb9b25-a4d8-40d3-88ba-222521b59b72",
    "readAt": "2026-11-05T08:01:10.129Z",
    "createdAt": "2026-11-05T08:01:10.093Z"
  }
}
```

#### POST /notifications/read-all — Mark all as read

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own notifications |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked

**Example: Mark all as read  (as Manager)**

*Request*

```http
POST /api/v1/notifications/read-all
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "updated": 1
  }
}
```

#### GET /notification-preferences — My notification preferences

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own notifications |
| **Mobile screens** | S-05 |

In-app is always on; email per type (defaults per type); push per type (on by default, none for email-only types).

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked

**Example: My preferences (per type: email and push)  (as Manager)**

*Request*

```http
GET /api/v1/notification-preferences
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "type": "STOCK_ENTRY_SUBMITTED",
      "label": "Entry waiting for verification",
      "description": "Someone submitted a stock entry in your warehouse for you to approve.",
      "inApp": true,
      "email": true,
      "push": true
    },
    // … 2 more
  ]
}
```

#### PATCH /notification-preferences — Change email and push preferences

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own notifications |
| **Mobile screens** | S-05 |

Each item changes only the channels it gives (`email`, `push` or both).

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `preferences` | array of object | Yes | at least 1 item, at most 50 items |
| `preferences[].type` | string | Yes | 1–60 chars |
| `preferences[].email` | boolean |  |  |
| `preferences[].push` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked

**Example: Turn push off and email on for some types  (as Manager)**

*Request*

```http
PATCH /api/v1/notification-preferences
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "preferences": [
    {
      "type": "STOCK_ENTRY_APPROVED",
      "push": false
    },
    // … 1 more
  ]
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "type": "STOCK_ENTRY_SUBMITTED",
      "label": "Entry waiting for verification",
      "description": "Someone submitted a stock entry in your warehouse for you to approve.",
      "inApp": true,
      "email": true,
      "push": true
    },
    // … 2 more
  ]
}
```

*More examples in the full reference:* Error: push for an email-only type  (as Manager)

#### POST /push-devices — Register this phone for push notifications

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own phones |
| **Mobile screens** | After sign-in / app start |

Send the FCM registration token after sign-in, on every app start and whenever Firebase rotates it. Re-registering the same token updates it (200); a token last used by someone else moves to the caller. At most 10 phones per user (the one seen least recently is dropped). Each push carries `data.notificationId`, `data.type` and `data.link` (an app path such as `/stock/{id}`); iOS gets the unread count as the badge.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `token` | string | Yes | FCM registration token from the Firebase Messaging SDK (Android and iOS) · 20–1024 chars |
| `platform` | ANDROID \| IOS | Yes |  |
| `deviceName` | string or null |  | max 100 chars |
| `appVersion` | string or null |  | max 40 chars |

**Responses:** 200 Already registered (refreshed) · 201 Registered · 400 Validation error · 401 Not authenticated, or token expired / revoked

**Example: Register this phone for push (first time)  (as Manager)**

> Call after sign-in, on every app start, and when Firebase gives a new token.

*Request*

```http
POST /api/v1/push-devices
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "token": "fJ3kX9w2QeO4p1Lr:APA91bH…(109 chars)",
  "platform": "ANDROID",
  "deviceName": "Karim's Galaxy A15",
  "appVersion": "1.0.0"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "82ee956e-a433-4a11-a1ed-7432acff7598",
    "platform": "ANDROID",
    "deviceName": "Karim's Galaxy A15",
    "appVersion": "1.0.0",
    "lastSeenAt": "2026-11-05T08:01:10.157Z",
    "createdAt": "2026-11-05T08:01:10.160Z"
  }
}
```

*More examples in the full reference:* Register again on app start (refreshes it)  (as Manager) · Error: bad platform  (as Manager)

#### GET /push-devices — My phones registered for push

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own phones |

Most recently seen first.

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked

**Example: My registered phones  (as Manager)**

*Request*

```http
GET /api/v1/push-devices
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "82ee956e-a433-4a11-a1ed-7432acff7598",
      "platform": "ANDROID",
      "deviceName": "Karim's Galaxy A15",
      "appVersion": "1.0.1",
      "lastSeenAt": "2026-11-05T08:01:10.167Z",
      "createdAt": "2026-11-05T08:01:10.160Z"
    }
  ]
}
```

#### DELETE /push-devices/{id} — Stop push to this phone

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Any signed-in user; only their own phones |
| **Mobile screens** | Sign out (S-39) |

Call it on sign-out, before `POST /auth/logout`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 204 Removed · 401 Not authenticated, or token expired / revoked · 404 Not found

**Example: Stop push to this phone (on sign-out)  (as Manager)**

*Request*

```http
DELETE /api/v1/push-devices/82ee956e-a433-4a11-a1ed-7432acff7598
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

*More examples in the full reference:* Error: not found (already removed, or not yours)  (as Manager)

## 6. Products and scanning

Screens: S-06 Scanner, S-07 Product list, S-08 Product detail. Products belong to a **catalog** (the brand: LG, Daikin, Dunham-Bush…), a **category** (Split AC, VRF / VRV, Piping…) and a **unit** (pcs, m, set…). Stock per warehouse is in chapter 7.

### Scanning (S-06)

1. Barcode scanned → `GET /products/by-barcode/{barcode}`. 404 → try the next step.
2. Typed or scanned code → `GET /products/by-code/{code}` (case-insensitive; URL-encode the code).
3. Still nothing → treat it as a serial: `GET /serials?q={text}` (chapter 7). One hit → serial result sheet.
4. Nothing at all → "No product or serial matches …".

- Product pickers (adding lines to an entry) should call `GET /products?status=ACTIVE&q=…`; discontinued products can't be used in new entries.
- `purchaseCost` is a cost field: it is missing for users without `seeCost`. Price history needs `seeCost` too (403 otherwise) — hide that tab.
- Photos: `thumbnailUrl` (400 px WebP, already has `?variant=thumb`) for lists, `url` for full screen; both need the bearer token. Responses are cacheable for 5 minutes (`Cache-Control: private, max-age=300`). Photo changes don't change the product's `updatedAt`. `isPrimary` marks the cover photo; the product's `thumbnailUrl` is the primary photo's.
- Catalogs, categories and units are small, unpaginated lists that include inactive entries: filter on `isActive` in pickers. Unit codes are lower-case and can't change.
- Catalog quantities come back trimmed (`"minStockLevel": "5"`); stock quantities are fixed-scale (`"20.000"`).

### 6.1 Look up

#### GET /products — List products

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |
| **Mobile screens** | S-07, product picker (S-13) |

Search `q` matches name, code, model and barcode. `purchaseCost` is removed from the response unless the role has `seeCost`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: name, code, createdAt, sellingPrice · e.g. name |
| `q` | string | Free-text search · max 200 chars |
| `catalogId` | string (uuid) or null |  |
| `categoryId` | string (uuid) or null |  |
| `status` | ACTIVE \| DISCONTINUED or null | ACTIVE \| DISCONTINUED (case-insensitive) |
| `source` | IMPORTED \| LOCAL or null | IMPORTED \| LOCAL (case-insensitive) |
| `trackSerial` | boolean |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List products (first page)  (as Admin)**

> Default sort is name. Summary rows; use GET /products/{id} for the full record.

*Request*

```http
GET /api/v1/products?page=1&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "01174ebb-383a-45ce-8918-ac28e31cd3f3",
      "code": "CU-PIPE-1-4",
      "name": "Copper pipe 1/4\" (6.35 mm) soft-drawn",
      "model": "LWC 1/4 x 0.71",
      "catalog": {
        "id": "69632794-ca16-4e7f-81e1-f06c92cd15ef",
        "name": "Mueller"
      },
      "category": {
        "id": "1279494f-0169-41b9-875a-0f7cd9911c1b",
        "name": "Piping"
      },
      "unit": {
        "id": "2d72d39d-a101-4de8-937f-f676840abd59",
        "code": "m",
        "name": "Metre"
      },
      "sellingPrice": "420.00",
      "purchaseCost": "310.00",
      "status": "ACTIVE",
      "source": "IMPORTED",
      "trackSerial": false,
      "barcode": null,
      "thumbnailUrl": null,
      "updatedAt": "2026-11-05T08:04:42.162Z"
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 6,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Search by name, code, model or barcode  (as Store Manager) · Filter and sort  (as Admin) · Products of one brand  (as Admin)

#### GET /products/{id} — Get a product (with photos)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |
| **Mobile screens** | S-08 |

`purchaseCost` is removed from the response unless the role has `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a product  (as Admin)**

*Request*

```http
GET /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "16d267d1-b41d-45c0-b75e-f12f99c4dcf4",
    "code": "LG-S4-Q18KL3AA",
    "name": "LG Dual Inverter split AC 1.5 Ton",
    "model": "S4-Q18KL3AA",
    "catalog": {
      "id": "6684b64d-5f18-4810-aea2-f567833b1b8b",
      "name": "LG"
    },
    "category": {
      "id": "415509bf-6956-4369-a021-7b57f6267ade",
      "name": "Split AC"
    },
    "unit": {
      "id": "59890e12-a36b-408e-87d2-fab226afdcae",
      "code": "set",
      "name": "Set"
    },
    "sellingPrice": "79500.00",
    "purchaseCost": "61800.00",
    "status": "ACTIVE",
    "source": "LOCAL",
    "trackSerial": true,
    "barcode": "8806098765432",
    "thumbnailUrl": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/053ee55e-4561-46f8-8808-692066604692/file?variant=thumb",
    "updatedAt": "2026-11-05T08:04:42.248Z",
    "purchaseUnit": null,
    "purchaseUnitFactor": null,
    "minStockLevel": "8",
    "warrantyMonths": 12,
    "defaultSupplierId": "58f6fa17-5164-4fdd-8740-884ce4e1de9f",
    "defaultSupplier": {
      "id": "58f6fa17-5164-4fdd-8740-884ce4e1de9f",
      "name": "LG Electronics Bangladesh"
    },
    "defaultSupplierName": "LG Electronics Bangladesh",
    "countryOfOrigin": "Bangladesh",
    "hsCode": "8415.10",
    "capacity": "1.5 Ton / 18,000 BTU",
    "refrigerant": "R32",
    "powerSupply": "220-240V / 1Ph / 50Hz",
    "dimensionsWeight": "Indoor 837×308×189 mm, 8.7 kg; outdoor 717×483×230 mm, 26 kg",
    "specifications": "Dual inverter compressor, 10-year compressor warranty, Gold Fin anti-corrosion coil, Wi-Fi ready (ThinQ).",
    "discontinuedAt": null,
    "photos": [
      {
        "id": "1b60fb89-af00-451c-8aae-fcb71653f9ee",
        "isPrimary": false,
        "sortOrder": 0,
        "contentType": "image/png",
        "sizeBytes": 18770,
        "width": 1000,
        "height": 750,
        "url": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/1b60fb89-af00-451c-8aae-fcb71653f9ee/file",
        "thumbnailUrl": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/1b60fb89-af00-451c-8aae-fcb71653f9ee/file?variant=thumb",
        "createdAt": "2026-11-05T08:04:42.682Z"
      },
      // … 1 more
    ],
    "createdBy": {
      "id": "171ab95b-9f2f-4ce2-a525-ec4f56084c83",
      "name": "System Administrator"
    },
    "updatedBy": {
      "id": "171ab95b-9f2f-4ce2-a525-ec4f56084c83",
      "name": "System Administrator"
    },
    "createdAt": "2026-11-05T08:04:42.100Z"
  }
}
```

*More examples in the full reference:* Get a product (no cost visibility)  (as Store Manager)

#### GET /products/by-barcode/{barcode} — Find a product by barcode

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |
| **Mobile screens** | S-06 |

`purchaseCost` is removed from the response unless the role has `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `barcode` | string |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Look up by scanned barcode  (as Store Manager)**

> For the scanner: exact match on the product's barcode.

*Request*

```http
GET /api/v1/products/by-barcode/4548848123457
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "77a13310-c4d3-4e09-ad61-39bab82bfc5e",
    "code": "DK-FXFQ63AVM",
    "name": "Daikin VRV ceiling cassette 2.0 Ton",
    "model": "FXFQ63AVM",
    "catalog": {
      "id": "497251e2-c08a-450d-aad8-a2c7d8df4688",
      "name": "Daikin"
    },
    "category": {
      "id": "5c5e3c79-d238-4387-be82-c302251333bf",
      "name": "VRF / VRV"
    },
    "unit": {
      "id": "59890e12-a36b-408e-87d2-fab226afdcae",
      "code": "set",
      "name": "Set"
    },
    "sellingPrice": "145000.00",
    "status": "ACTIVE",
    "source": "IMPORTED",
    "trackSerial": true,
    "barcode": "4548848123457",
    "thumbnailUrl": null,
    "updatedAt": "2026-11-05T08:04:42.133Z",
    "purchaseUnit": null,
    "purchaseUnitFactor": null,
    "minStockLevel": "2",
    "warrantyMonths": 24,
    "defaultSupplierId": "9f65bc59-cb07-460d-9d0e-c01ef74e9f57",
    "defaultSupplier": {
      "id": "9f65bc59-cb07-460d-9d0e-c01ef74e9f57",
      "name": "Daikin Airconditioning (Thailand)"
    },
    "defaultSupplierName": "Daikin Airconditioning (Thailand)",
    "countryOfOrigin": "Thailand",
    "hsCode": "8415.81",
    "capacity": "2.0 Ton / 7.1 kW",
    "refrigerant": "R410A",
    "powerSupply": "220-240V / 1Ph / 50Hz",
    "dimensionsWeight": null,
    "specifications": "Round-flow 4-way cassette indoor unit for VRV IV systems; panel BYCQ125EAF sold separately.",
    "discontinuedAt": null,
    "photos": [],
    "createdBy": {
      "id": "171ab95b-9f2f-4ce2-a525-ec4f56084c83",
      "name": "System Administrator"
    },
    "updatedBy": null,
    "createdAt": "2026-11-05T08:04:42.133Z"
  }
}
```

*More examples in the full reference:* Error: barcode not found  (as Store Manager)

#### GET /products/by-code/{code} — Find a product by code

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |
| **Mobile screens** | S-06 |

Case-insensitive. `purchaseCost` is removed from the response unless the role has `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `code` | string |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Look up by code  (as Store Manager)**

> Case-insensitive. URL-encode the code. Same body as GET /products/{id}.

*Request*

```http
GET /api/v1/products/by-code/lg-s4-q18kl3aa
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /products/by-barcode/{barcode} */ }
}
```

#### GET /products/{id}/photos/{photoId}/file — Download a photo (authenticated proxy)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |

The bucket is private; images are only served through this route.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `photoId` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `variant` | original \| thumb | default "original" |

**Responses:** 200 Image · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Download the original image  (as Store Manager)**

> Authenticated image proxy (the bucket is private): send the Bearer token when loading images. Use the url / thumbnailUrl from the photo object.

*Request*

```http
GET /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/053ee55e-4561-46f8-8808-692066604692/file
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: image/png
Content-Disposition: inline; filename="053ee55e-4561-46f8-8808-692066604692.png"

<binary file: 24,778 bytes>
```

*More examples in the full reference:* Download the thumbnail  (as Store Manager)

#### GET /products/{id}/history — Audit history of a product

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |

Who changed what and when. `purchaseCost` is removed from the response unless the role has `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer |  |
| `pageSize` | integer | max 100 |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Change history of a product  (as Admin)**

> Audit entries for this product (create, update, photo changes, discontinue …), newest first, with before/after snapshots. Cost fields are hidden from roles without seeCost.

*Request*

```http
GET /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/history?pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "3acc4622-e1d1-407d-b1ce-c55b10984315",
      "action": "product.update",
      "entityType": "Product",
      "entityId": "16d267d1-b41d-45c0-b75e-f12f99c4dcf4",
      "before": {
        "code": "LG-S4-Q18KL3AA",
        "name": "LG Dual Inverter split AC 1.5 Ton",
        "unit": "set",
        "model": "S4-Q18KL3AA",
        "hsCode": "8415.10",
        "source": "LOCAL",
        "status": "ACTIVE",
        "barcode": "8806098765432",
        "catalog": "LG",
        "capacity": "1.5 Ton / 18,000 BTU",
        "category": "Split AC",
        "powerSupply": "220-240V / 1Ph / 50Hz",
        "refrigerant": "R32",
        "trackSerial": true,
        "purchaseCost": "61000.00",
        "purchaseUnit": null,
        "sellingPrice": "78000.00",
        "minStockLevel": "5",
        "specifications": "Dual inverter compressor, 10-year compressor warranty, Gold Fin anti-corrosion coil.",
        "warrantyMonths": 12,
        "countryOfOrigin": "Bangladesh",
        "defaultSupplier": "LG Electronics Bangladesh",
        "dimensionsWeight": "Indoor 837×308×189 mm, 8.7 kg; outdoor 717×483×230 mm, 26 kg",
        "purchaseUnitFactor": null,
        "defaultSupplierName": null
      },
      "after": {
        "code": "LG-S4-Q18KL3AA",
        "name": "LG Dual Inverter split AC 1.5 Ton",
        "unit": "set",
        "model": "S4-Q18KL3AA",
        "hsCode": "8415.10",
        "source": "LOCAL",
        "status": "ACTIVE",
        "barcode": "8806098765432",
        "catalog": "LG",
        "capacity": "1.5 Ton / 18,000 BTU",
        "category": "Split AC",
        "powerSupply": "220-240V / 1Ph / 50Hz",
        "refrigerant": "R32",
        "trackSerial": true,
        "purchaseCost": "61800.00",
        "purchaseUnit": null,
        "sellingPrice": "79500.00",
        "minStockLevel": "8",
        "specifications": "Dual inverter compressor, 10-year compressor warranty, Gold Fin anti-corrosion coil, Wi-Fi ready (ThinQ).",
        "warrantyMonths": 12,
        "countryOfOrigin": "Bangladesh",
        "defaultSupplier": "LG Electronics Bangladesh",
        "dimensionsWeight": "Indoor 837×308×189 mm, 8.7 kg; outdoor 717×483×230 mm, 26 kg",
        "purchaseUnitFactor": null,
        "defaultSupplierName": null
      },
      "ip": null,
      "requestId": "d29ed723-67e4-497e-baf1-7608edca09c0",
      "createdAt": "2026-11-05T08:04:42.263Z",
      "user": {
        "id": "171ab95b-9f2f-4ce2-a525-ec4f56084c83",
        "name": "System Administrator",
        "username": "admin"
      }
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 2,
    "totalPages": 1
  }
}
```

#### GET /products/{id}/price-history — A product's purchase price history

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `seeCost` and `purchasing` or `catalog` ≥ VIEW |

PO lines of approved POs (date, PO, supplier, currency, unit price, BDT equivalent), newest first.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: poDate · e.g. -poDate |
| `q` | string | Free-text search · max 200 chars |
| `productId` | string (uuid) or null |  |
| `supplierId` | string (uuid) or null |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Purchase price history  (as Admin)**

> Lines of approved purchase orders, newest first. Requires seeCost and catalog or purchasing VIEW.

*Request*

```http
GET /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/price-history?pageSize=5
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "poId": "e3510905-c562-4529-86dd-d773b17462bb",
      "poNumber": "PO-2627-0002",
      "poDate": "2026-10-30",
      "status": "APPROVED",
      "supplier": {
        "id": "58f6fa17-5164-4fdd-8740-884ce4e1de9f",
        "code": "SUP-001",
        "name": "LG Electronics Bangladesh"
      },
      "product": {
        "id": "16d267d1-b41d-45c0-b75e-f12f99c4dcf4",
        "code": "LG-S4-Q18KL3AA",
        "name": "LG Dual Inverter split AC 1.5 Ton",
        "unitCode": "set"
      },
      "currency": "BDT",
      "qty": "20.000",
      "unitPrice": "61800.0000",
      "exchangeRate": "1.0000",
      "unitPriceBdt": "61800.0000"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 5,
    "total": 2,
    "totalPages": 1
  }
}
```

*More examples in the full reference:* Price history in a foreign currency  (as Admin) · Error: role can't see cost  (as Store Manager)

#### GET /catalogs — List catalogs

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |

Includes inactive ones (`isActive`).

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List brand catalogs  (as Store Manager)**

> Not paginated; ordered by sortOrder. productCount counts every product (active and discontinued).

*Request*

```http
GET /api/v1/catalogs
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "6684b64d-5f18-4810-aea2-f567833b1b8b",
      "name": "LG",
      "description": "LG Electronics air conditioning",
      "isActive": true,
      "sortOrder": 1,
      "productCount": 2,
      "createdAt": "2026-11-05T08:04:41.649Z",
      "updatedAt": "2026-11-05T08:04:41.649Z"
    },
    // … 2 more
  ]
}
```

#### GET /categories — List categories

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |

Includes inactive ones (`isActive`).

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List categories  (as Store Manager)**

> Not paginated: returns every category (active and inactive) with its product count.

*Request*

```http
GET /api/v1/categories
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "ce2f23ed-ab93-4984-9914-4f24376c54d9",
      "name": "AHU",
      "isActive": true,
      "productCount": 0,
      "createdAt": "2026-11-05T08:04:41.691Z",
      "updatedAt": "2026-11-05T08:04:41.691Z"
    },
    // … 2 more
  ]
}
```

#### GET /units — List units

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |

Includes inactive ones (`isActive`).

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List units  (as Store Manager)**

> Not paginated.

*Request*

```http
GET /api/v1/units
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "77dcf3cd-29e8-4faa-a1e9-089a32c53809",
      "code": "box",
      "name": "Box",
      "isActive": true,
      "createdAt": "2026-11-05T08:04:41.731Z",
      "updatedAt": "2026-11-05T08:04:41.731Z"
    },
    // … 2 more
  ]
}
```

### 6.2 Manage the catalog (catalog CREATE / FULL — mostly web)

#### POST /products — Create a product

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ CREATE |
| **Idempotency-Key** | Optional (header) — recommended |

Only `name` and `model` are required. Code is stored upper-case and can't be changed later. Roles without seeCost can't set purchaseCost (it starts at 0). `purchaseCost` is removed from the response unless the role has `seeCost`.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `code` | string |  | Optional. Stored upper-case, immutable after creation. Left out: made from the model number (`S4 Q18/KL3AA` → `S4-Q18-KL3AA`, then `-2`, `-3`… if taken). |
| `name` | string | Yes | 1–200 chars |
| `catalogId` | string (uuid) |  | Optional brand. Left out: the "Other" brand. |
| `model` | string | Yes | 1–100 chars. Can't be cleared later (PATCH with an empty model → 400). |
| `categoryId` | string (uuid) |  | Optional. Left out: the "Other" category. |
| `unitId` | string (uuid) |  | Optional base unit. Left out: `pcs`. |
| `purchaseCost` | string |  | Optional, BDT. Left out or empty: 0.00 (it then updates from purchases). Sensitive: only roles with seeCost may read or set it. |
| `sellingPrice` | string |  | Optional, BDT, up to 2 decimals. Left out or empty: 0.00. |
| `purchaseUnitId` | string (uuid) or null |  | Unit the product is bought in (e.g. roll); requires purchaseUnitFactor |
| `purchaseUnitFactor` | string or number or null |  | Base units per purchase unit (e.g. 50 when 1 roll = 50 m) |
| `minStockLevel` | string or number or null |  |  |
| `barcode` | string or null |  | Unique when present · max 64 chars |
| `trackSerial` | boolean |  |  |
| `warrantyMonths` | integer or null |  | min 0, max 600 |
| `defaultSupplierId` | string (uuid) or null |  | Default supplier (see /suppliers) |
| `defaultSupplierName` | string or null |  | Legacy free text; ignored when defaultSupplierId is set · max 200 chars |
| `source` | IMPORTED \| LOCAL or null |  |  |
| `countryOfOrigin` | string or null |  | max 100 chars |
| `hsCode` | string or null |  | max 20 chars |
| `capacity` | string or null |  | max 100 chars |
| `refrigerant` | string or null |  | max 50 chars |
| `powerSupply` | string or null |  | max 100 chars |
| `dimensionsWeight` | string or null |  | max 200 chars |
| `specifications` | string or null |  | max 5000 chars |
| `status` | ACTIVE \| DISCONTINUED |  |  |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Create a product  (as Admin)**

> Requires catalog CREATE. purchaseCost is required for roles that can see cost. Idempotency-Key is optional here but makes retries safe.

*Request*

```http
POST /api/v1/products
Authorization: Bearer <accessToken>
Idempotency-Key: 09cb4ef9-2999-4edd-ad91-c93108c04fcd
Content-Type: application/json

{
  "code": "LG-S4-Q18KL3AA",
  "name": "LG Dual Inverter split AC 1.5 Ton",
  "catalogId": "6684b64d-5f18-4810-aea2-f567833b1b8b",
  "model": "S4-Q18KL3AA",
  "categoryId": "415509bf-6956-4369-a021-7b57f6267ade",
  "unitId": "59890e12-a36b-408e-87d2-fab226afdcae",
  "purchaseCost": "61000.00",
  "sellingPrice": "78000.00",
  "minStockLevel": "5",
  "barcode": "8806098765432",
  "trackSerial": true,
  "warrantyMonths": 12,
  "defaultSupplierId": "58f6fa17-5164-4fdd-8740-884ce4e1de9f",
  "source": "LOCAL",
  "countryOfOrigin": "Bangladesh",
  "hsCode": "8415.10",
  "capacity": "1.5 Ton / 18,000 BTU",
  "refrigerant": "R32",
  "powerSupply": "220-240V / 1Ph / 50Hz",
  "dimensionsWeight": "Indoor 837×308×189 mm, 8.7 kg; outdoor 717×483×230 mm, 26 kg",
  "specifications": "Dual inverter compressor, 10-year compressor warranty, Gold Fin anti-corrosion coil."
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4

{
  "data": { /* same record as in GET /products/{id} */ }
}
```

*More examples in the full reference:* Create a product bought in another unit (copper pipe)  (as Admin) · Error: duplicate code  (as Admin) · Error: validation failed  (as Admin) · Error: role without permission  (as Store Manager)

#### PATCH /products/{id} — Update a product

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |

Sending a different `code` → 422 CODE_IMMUTABLE. `purchaseCost` is removed from the response unless the role has `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `code` | string |  | May be sent but must equal the current code (422 CODE_IMMUTABLE otherwise) |
| `name` | string |  | 1–200 chars |
| `catalogId` | string (uuid) |  |  |
| `model` | string or null |  | max 100 chars |
| `categoryId` | string (uuid) |  |  |
| `unitId` | string (uuid) |  |  |
| `purchaseCost` | string |  | Sensitive: only roles with seeCost may read or set it. Required for those roles on create. |
| `sellingPrice` | string |  | BDT, decimal string with up to 2 decimals |
| `purchaseUnitId` | string (uuid) or null |  | Unit the product is bought in (e.g. roll); requires purchaseUnitFactor |
| `purchaseUnitFactor` | string or number or null |  | Base units per purchase unit (e.g. 50 when 1 roll = 50 m) |
| `minStockLevel` | string or number or null |  |  |
| `barcode` | string or null |  | Unique when present · max 64 chars |
| `trackSerial` | boolean |  |  |
| `warrantyMonths` | integer or null |  | min 0, max 600 |
| `defaultSupplierId` | string (uuid) or null |  | Default supplier (see /suppliers) |
| `defaultSupplierName` | string or null |  | Legacy free text; ignored when defaultSupplierId is set · max 200 chars |
| `source` | IMPORTED \| LOCAL or null |  |  |
| `countryOfOrigin` | string or null |  | max 100 chars |
| `hsCode` | string or null |  | max 20 chars |
| `capacity` | string or null |  | max 100 chars |
| `refrigerant` | string or null |  | max 50 chars |
| `powerSupply` | string or null |  | max 100 chars |
| `dimensionsWeight` | string or null |  | max 200 chars |
| `specifications` | string or null |  | max 5000 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Update price and stock level  (as Admin)**

> Requires catalog FULL. Partial update: send only changed fields; "" clears an optional text field.

*Request*

```http
PATCH /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "sellingPrice": "79500.00",
  "purchaseCost": "61800.00",
  "minStockLevel": "8",
  "specifications": "Dual inverter compressor, 10-year compressor warranty, Gold Fin anti-corrosion coil, Wi-Fi ready (ThinQ)."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /products/{id} */ }
}
```

*More examples in the full reference:* Error: product code is immutable  (as Admin)

#### GET /products/check-code — Check whether a product code is free

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ VIEW |

Used by the form's live check.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `code` | string | max 64 chars, default "" |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Check a new code is free  (as Admin)**

> Use while the user types a code: the code is normalised (trimmed, upper-case) and checked for format and uniqueness.

*Request*

```http
GET /api/v1/products/check-code?code=lg-s4-q18kl3aa
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "code": "LG-S4-Q18KL3AA",
    "valid": true,
    "available": true
  }
}
```

#### POST /products/{id}/discontinue — Discontinue a product (never deleted; can't be picked in new entries)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Discontinue a product  (as Admin)**

> Requires catalog FULL. No body. Products are never deleted; discontinued ones stay in history but can't be used in new entries.

*Request*

```http
POST /api/v1/products/332b82bb-88f7-4433-997a-301927ad55ef/discontinue
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /products/{id} */ }
}
```

*More examples in the full reference:* Error: already discontinued  (as Admin)

#### POST /products/{id}/reactivate — Reactivate a discontinued product

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Reactivate a product  (as Admin)**

> Requires catalog FULL. No body.

*Request*

```http
POST /api/v1/products/332b82bb-88f7-4433-997a-301927ad55ef/reactivate
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /products/{id} */ }
}
```

#### POST /products/{id}/photos — Upload photos

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ CREATE |

(FULL, or CREATE on products you created). JPG / PNG / WebP checked by content, ≤ 5 MB each, ≤ 10 per product. Send one or more `file` parts. The first photo of a product becomes primary.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | file or array of file | Yes |  |

**Responses:** 201 Uploaded · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Upload photos  (as Admin)**

> multipart/form-data, one or more files in field "file" (or "files"). JPEG/PNG/WebP, ≤ 5 MB each, ≤ 10 per product; checked by content. The first photo of a product becomes primary. A 400px WebP thumbnail is made for each.

*Request*

```http
POST /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file = <file indoor-front.jpg, image/jpeg, 20,603 bytes>
file = <file indoor-side.png, image/png, 24,778 bytes>
file = <file outdoor-unit.png, image/png, 18,770 bytes>
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": [
    {
      "id": "8f17289b-879c-4e7c-9a94-37d0cfbb8f0b",
      "isPrimary": true,
      "sortOrder": 0,
      "contentType": "image/jpeg",
      "sizeBytes": 20603,
      "width": 1600,
      "height": 1200,
      "url": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/8f17289b-879c-4e7c-9a94-37d0cfbb8f0b/file",
      "thumbnailUrl": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/8f17289b-879c-4e7c-9a94-37d0cfbb8f0b/file?variant=thumb",
      "createdAt": "2026-11-05T08:04:42.677Z"
    },
    // … 2 more
  ]
}
```

#### PATCH /products/{id}/photos/{photoId} — Set primary photo or move it

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ CREATE |

(FULL, or CREATE on products you created). Returns all photos in order.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `photoId` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `isPrimary` | true |  | Make this the primary photo |
| `sortOrder` | integer |  | New 0-based position · min 0, max 9 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Make a photo primary  (as Admin)**

> Returns the product's full photo list in order. The primary photo's thumbnail is the product's thumbnailUrl.

*Request*

```http
PATCH /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/053ee55e-4561-46f8-8808-692066604692
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "isPrimary": true
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "8f17289b-879c-4e7c-9a94-37d0cfbb8f0b",
      "isPrimary": false,
      "sortOrder": 0,
      "contentType": "image/jpeg",
      "sizeBytes": 20603,
      "width": 1600,
      "height": 1200,
      "url": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/8f17289b-879c-4e7c-9a94-37d0cfbb8f0b/file",
      "thumbnailUrl": "/api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/8f17289b-879c-4e7c-9a94-37d0cfbb8f0b/file?variant=thumb",
      "createdAt": "2026-11-05T08:04:42.677Z"
    },
    // … 2 more
  ]
}
```

*More examples in the full reference:* Move a photo  (as Admin)

#### DELETE /products/{id}/photos/{photoId} — Delete a photo

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` ≥ CREATE |

(FULL, or CREATE on products you created). If it was primary, the next photo becomes primary.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `photoId` | string (uuid) |  |

**Responses:** 204 Deleted · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Delete a photo  (as Admin)**

> Empty 204 response. If the primary photo is deleted, the first remaining photo becomes primary.

*Request*

```http
DELETE /api/v1/products/16d267d1-b41d-45c0-b75e-f12f99c4dcf4/photos/8f17289b-879c-4e7c-9a94-37d0cfbb8f0b
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

#### POST /catalogs — Create a catalog (brand)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 1–60 chars |
| `description` | string or null |  | max 200 chars |
| `sortOrder` | integer |  | min 0, max 9999 |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse)

**Example: Create a brand catalog  (as Admin)**

> Requires catalog FULL. Names are unique case-insensitively.

*Request*

```http
POST /api/v1/catalogs
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Gree",
  "description": "Gree Electric — wall-mount split and cassette AC",
  "sortOrder": 4
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "bc5419e2-fc92-49dc-9544-c2c8fb2f55a8",
    "name": "Gree",
    "description": "Gree Electric — wall-mount split and cassette AC",
    "isActive": true,
    "sortOrder": 4,
    "productCount": 0,
    "createdAt": "2026-11-05T08:04:41.953Z",
    "updatedAt": "2026-11-05T08:04:41.953Z"
  }
}
```

#### PATCH /catalogs/{id} — Rename / deactivate a catalog (brand)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–60 chars |
| `description` | string or null |  | max 200 chars |
| `sortOrder` | integer |  | min 0, max 9999 |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse)

**Example: Rename and deactivate a catalog  (as Admin)**

> Send only the fields to change. Inactive catalogs can't be chosen for new products.

*Request*

```http
PATCH /api/v1/catalogs/bc5419e2-fc92-49dc-9544-c2c8fb2f55a8
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Gree Electric",
  "description": "Not stocked this season",
  "isActive": false
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "bc5419e2-fc92-49dc-9544-c2c8fb2f55a8",
    "name": "Gree Electric",
    "description": "Not stocked this season",
    "isActive": false,
    "sortOrder": 4,
    "productCount": 0,
    "createdAt": "2026-11-05T08:04:41.953Z",
    "updatedAt": "2026-11-05T08:04:41.980Z"
  }
}
```

#### DELETE /catalogs/{id} — Delete a catalog (brand)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |

Blocked (422) while products use it — deactivate it instead.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 204 Deleted · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Delete an unused catalog  (as Admin)**

> Only catalogs with no products can be deleted (otherwise 422 CATALOG_IN_USE). Empty 204 response.

*Request*

```http
DELETE /api/v1/catalogs/bc5419e2-fc92-49dc-9544-c2c8fb2f55a8
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

*More examples in the full reference:* Error: catalog still has products  (as Admin)

#### POST /categories — Create a category

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 1–60 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse)

**Example: Create a category  (as Admin)**

*Request*

```http
POST /api/v1/categories
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Ventilation fan"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "fcd96c7e-9b24-4037-b31a-43dec2745ac9",
    "name": "Ventilation fan",
    "isActive": true,
    "productCount": 0,
    "createdAt": "2026-11-05T08:04:42.001Z",
    "updatedAt": "2026-11-05T08:04:42.001Z"
  }
}
```

#### PATCH /categories/{id} — Rename / deactivate a category

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–60 chars |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse)

**Example: Rename a category  (as Admin)**

*Request*

```http
PATCH /api/v1/categories/fcd96c7e-9b24-4037-b31a-43dec2745ac9
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Ventilation & exhaust fan"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "fcd96c7e-9b24-4037-b31a-43dec2745ac9",
    "name": "Ventilation & exhaust fan",
    "isActive": true,
    "productCount": 0,
    "createdAt": "2026-11-05T08:04:42.001Z",
    "updatedAt": "2026-11-05T08:04:42.014Z"
  }
}
```

#### DELETE /categories/{id} — Delete a category

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |

Blocked (422) while products use it — deactivate it instead.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 204 Deleted · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Delete an unused category  (as Admin)**

> Only categories with no products can be deleted (otherwise 422 CATEGORY_IN_USE).

*Request*

```http
DELETE /api/v1/categories/fcd96c7e-9b24-4037-b31a-43dec2745ac9
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

#### POST /units — Create a unit of measure

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `code` | string | Yes |  |
| `name` | string | Yes | 1–60 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse)

**Example: Create a unit  (as Admin)**

> The code is stored lower-case (1–10 letters/digits, starting with a letter) and can't be changed later.

*Request*

```http
POST /api/v1/units
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "code": "PAIR",
  "name": "Pair"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "cd1ecc00-fece-4309-adbe-bc38210e1e50",
    "code": "pair",
    "name": "Pair",
    "isActive": true,
    "createdAt": "2026-11-05T08:04:42.048Z",
    "updatedAt": "2026-11-05T08:04:42.048Z"
  }
}
```

#### PATCH /units/{id} — Rename / deactivate a unit of measure

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–60 chars |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse)

**Example: Rename a unit  (as Admin)**

> Only name and isActive can change; sending code is a 400.

*Request*

```http
PATCH /api/v1/units/cd1ecc00-fece-4309-adbe-bc38210e1e50
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Pair (indoor + outdoor)"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "cd1ecc00-fece-4309-adbe-bc38210e1e50",
    "code": "pair",
    "name": "Pair (indoor + outdoor)",
    "isActive": true,
    "createdAt": "2026-11-05T08:04:42.048Z",
    "updatedAt": "2026-11-05T08:04:42.060Z"
  }
}
```

### 6.3 Excel import and export (web only)

#### GET /products/import/template — Download the Excel import template

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Mobile app** | Not used (web / admin only) |

Headers, one example row, and a Lists sheet with the valid catalogs, categories and units.

**Responses:** 200 Excel template · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Download the import template  (as Admin)**

> Excel file with a Products sheet (headers + example row) and a Lists sheet of valid brands, categories and units. The cost column is omitted for roles without seeCost.

*Request*

```http
GET /api/v1/products/import/template
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="stockbook-product-import-template.xlsx"

<binary file: 11,572 bytes>
```

#### POST /products/import — Upload an .xlsx import (runs in the background)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Mobile app** | Not used (web / admin only) |

`mode`: `validate` (dry run, nothing written) or `commit` (all-or-nothing in one transaction). Duplicate codes in the file or the database are reported per row.

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | file | Yes |  |
| `mode` | validate \| commit |  | default "validate" |

**Responses:** 202 Queued · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Upload a file to validate  (as Admin)**

> Requires catalog FULL. multipart/form-data: file (.xlsx made from the template, ≤ 10 MB) and mode = validate (default, writes nothing) | commit. Processed in the background: poll the Location URL.

*Request*

```http
POST /api/v1/products/import
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file = <file dunham-bush-fcu.xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, 8,809 bytes>
mode = validate
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/products/import/4c39e17b-5cd3-43ee-9841-e61a599ed48e

{
  "data": {
    "jobId": "4c39e17b-5cd3-43ee-9841-e61a599ed48e",
    "mode": "validate",
    "status": "queued"
  }
}
```

#### GET /products/import/{jobId} — Import job status and row-level results

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Mobile app** | Not used (web / admin only) |

Only the user who uploaded the file can see the job.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `jobId` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Validation result with row errors  (as Admin)**

> status: queued → processing → completed | failed. Row numbers are Excel rows (header = row 1). Only the uploader can read a job (others get 404).

*Request*

```http
GET /api/v1/products/import/4c39e17b-5cd3-43ee-9841-e61a599ed48e
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "jobId": "4c39e17b-5cd3-43ee-9841-e61a599ed48e",
    "mode": "validate",
    "status": "completed",
    "fileName": "dunham-bush-fcu.xlsx",
    "result": {
      "totalRows": 3,
      "validRows": 1,
      "committed": false,
      "createdCount": 0,
      "errors": [
        {
          "row": 3,
          "field": "Code / SKU",
          "message": "Code 'LG-S4-Q18KL3AA' already exists in the catalog."
        },
        // … 2 more
      ]
    },
    "failedReason": null
  }
}
```

*More examples in the full reference:* Import completed  (as Admin)

#### GET /products/export — Export the filtered product list to Excel

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `catalog` = FULL |
| **Mobile app** | Not used (web / admin only) |

Same filters as GET /products. The purchase cost column is only included with seeCost.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: name, code, createdAt, sellingPrice · e.g. name |
| `q` | string | Free-text search · max 200 chars |
| `catalogId` | string (uuid) or null |  |
| `categoryId` | string (uuid) or null |  |
| `status` | ACTIVE \| DISCONTINUED or null | ACTIVE \| DISCONTINUED (case-insensitive) |
| `source` | IMPORTED \| LOCAL or null | IMPORTED \| LOCAL (case-insensitive) |
| `trackSerial` | boolean |  |

**Responses:** 200 Excel file · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Export products to Excel  (as Admin)**

> Requires catalog FULL. Takes the same filters / q / sort as GET /products (no paging). Cost columns only for roles with seeCost.

*Request*

```http
GET /api/v1/products/export?status=ACTIVE&sort=code
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="products-20261105-1404.xlsx"

<binary file: 8,228 bytes>
```

## 7. Stock levels and serial numbers

Screens: S-08 stock card, S-09 Stock levels, S-22 Serial search, S-23 Serial detail, availability hints in S-13. Stock is kept per product, warehouse and condition (GOOD / DAMAGED). **Available = good on hand − reserved** (reserved = held by submitted entries waiting for verification). Average cost is weighted, company-wide per product (cost fields need `seeCost`).

#### GET /stock/balances — Stock levels by product

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-09 |

Good, damaged, reserved and in-transit quantities per warehouse in scope. Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: code, name, total · e.g. code |
| `q` | string | Free-text search · max 200 chars |
| `productId` | string (uuid) or null |  |
| `catalogId` | string (uuid) or null |  |
| `categoryId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null |  |
| `condition` | GOOD \| DAMAGED or null |  |
| `belowMinimum` | boolean |  |
| `inStock` | boolean | Only products with stock (on hand, damaged or in transit) |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Stock levels in Warehouse A (Admin: with value)  (as Admin)**

> One row per product with per-warehouse GOOD / DAMAGED / reserved / in-transit figures.

*Request*

```http
GET /api/v1/stock/balances?warehouseId=2ec58960-a6ac-4429-b613-7eeda826ef96&inStock=true&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "product": {
        "id": "f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7",
        "code": "CU-PIPE-58",
        "name": "Copper pipe 5/8\" (15.88 mm), soft-drawn",
        "unitCode": "m",
        "minStockLevel": "100",
        "trackSerial": false,
        "status": "ACTIVE",
        "catalogName": "Generic",
        "categoryName": "Piping"
      },
      "warehouses": [
        {
          "warehouseId": "2ec58960-a6ac-4429-b613-7eeda826ef96",
          "code": "A",
          "good": "156.000",
          "damaged": "0.000",
          "reserved": "0.000",
          "available": "156.000"
        }
      ],
      "onHand": "156.000",
      "reserved": "0.000",
      "available": "156.000",
      "damaged": "0.000",
      "inTransit": "0.000",
      "total": "156.000",
      "avgCost": "980.0000",
      "stockValue": "152880.00",
      "belowMinimum": false
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 4,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Stock levels as a Store Manager (no cost / value)  (as Store Manager (Warehouse A)) · Products below their minimum level  (as Store Manager (Warehouse B))

#### GET /stock/products/{productId} — A product's stock card and ledger

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-08 |

Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `productId` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: postedAt · e.g. -postedAt |
| `q` | string | Free-text search · max 200 chars |
| `productId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null |  |
| `entryId` | string (uuid) or null |  |
| `type` | GRN_IMPORT \| GRN_LOCAL \| RETURN_FROM_SITE \| OPENING \| ISSUE_TO_PROJECT \| SALE \| RETURN_TO_SUPPLIER \| DAMAGE_WRITE_OFF \| TRANSFER \| REVERSAL \| STOCK_ADJUSTMENT or null |  |
| `dateFrom` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `dateTo` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Stock card: product per warehouse, in transit, ledger  (as Admin)**

> data.movements is paged (meta). Filters as /stock/movements.

*Request*

```http
GET /api/v1/stock/products/2f83c5fa-45a9-453b-a75a-83d904e7f3df?pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "product": {
      "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
      "code": "LG-S4-Q18KL3AA",
      "name": "LG Dual Inverter split AC 1.5 Ton",
      "trackSerial": false,
      "status": "ACTIVE",
      "sellingPrice": "85000.00",
      "countryOfOrigin": null
    },
    "level": {
      "product": {
        "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
        "code": "LG-S4-Q18KL3AA",
        "name": "LG Dual Inverter split AC 1.5 Ton",
        "unitCode": "set",
        "minStockLevel": "5",
        "trackSerial": false,
        "status": "ACTIVE",
        "catalogName": "LG",
        "categoryName": "Split AC"
      },
      "warehouses": [
        {
          "warehouseId": "2ec58960-a6ac-4429-b613-7eeda826ef96",
          "code": "A",
          "good": "8.000",
          "damaged": "0.000",
          "reserved": "2.000",
          "available": "6.000"
        },
        // … 1 more
      ],
      "onHand": "8.000",
      "reserved": "2.000",
      "available": "6.000",
      "damaged": "0.000",
      "inTransit": "4.000",
      "total": "12.000",
      "avgCost": "61000.0000",
      "stockValue": "732000.00",
      "belowMinimum": false
    },
    "inTransit": [
      {
        "entryId": "85c0568d-0fa2-4f3f-b9f3-a500cd3cb23a",
        "number": "TRF-2627-0001",
        "fromCode": "A",
        "toCode": "B",
        "qty": "4.000"
      }
    ],
    "movements": [
      {
        "id": "98856c92-0d7f-4469-9445-86c396fb831b",
        "seq": "15",
        "postedAt": "2026-11-05T08:12:37.920Z",
        "entry": {
          "id": "85c0568d-0fa2-4f3f-b9f3-a500cd3cb23a",
          "number": "TRF-2627-0001",
          "type": "TRANSFER"
        },
        "product": {
          "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
          "code": "LG-S4-Q18KL3AA",
          "name": "LG Dual Inverter split AC 1.5 Ton"
        },
        "warehouse": {
          "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
          "code": "A",
          "name": "Warehouse A"
        },
        "condition": "GOOD",
        "qtyChange": "-4.000",
        "unitCost": "61000.0000",
        "valueChange": "-244000.00",
        "balanceAfter": "8.000",
        "avgCostAfter": "61000.0000"
      },
      // … 2 more
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 6,
    "totalPages": 2
  }
}
```

#### GET /stock/availability — Available quantity of a product in a warehouse

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-13 ("Available 14 in A") |

available = on hand − reserved (GOOD). Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| productId * | string (uuid) |  |
| warehouseId * | string (uuid) |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Available quantity (on hand − reserved)  (as Store Manager (Warehouse A))**

> Use before submitting an outgoing entry. avgCost hidden without seeCost.

*Request*

```http
GET /api/v1/stock/availability?productId=2f83c5fa-45a9-453b-a75a-83d904e7f3df&warehouseId=2ec58960-a6ac-4429-b613-7eeda826ef96
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "productId": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
    "warehouseId": "2ec58960-a6ac-4429-b613-7eeda826ef96",
    "onHand": "20.000",
    "reserved": "8.000",
    "available": "12.000",
    "damaged": "0.000",
    "damagedReserved": "0.000",
    "damagedAvailable": "0.000"
  }
}
```

*More examples in the full reference:* Available quantity (Admin sees average cost)  (as Admin) · Error: warehouse outside my scope  (as Store Manager (Warehouse B))

#### GET /stock/movements — Stock ledger (append-only movements)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-08 "See all" |

Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: postedAt · e.g. -postedAt |
| `q` | string | Free-text search · max 200 chars |
| `productId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null |  |
| `entryId` | string (uuid) or null |  |
| `type` | GRN_IMPORT \| GRN_LOCAL \| RETURN_FROM_SITE \| OPENING \| ISSUE_TO_PROJECT \| SALE \| RETURN_TO_SUPPLIER \| DAMAGE_WRITE_OFF \| TRANSFER \| REVERSAL \| STOCK_ADJUSTMENT or null |  |
| `dateFrom` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `dateTo` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Ledger of one product in one warehouse  (as Admin)**

> Append-only movements, newest first. valueChange / avgCostAfter need seeCost.

*Request*

```http
GET /api/v1/stock/movements?productId=f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7&warehouseId=2ec58960-a6ac-4429-b613-7eeda826ef96&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "84c0b141-5be8-48a7-9891-259d691dbc34",
      "seq": "22",
      "postedAt": "2026-11-05T08:12:38.359Z",
      "entry": {
        "id": "64b0211f-c6c8-4f2a-a4d1-b02556b55a11",
        "number": "REV-2627-0001",
        "type": "REVERSAL"
      },
      "product": {
        "id": "f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7",
        "code": "CU-PIPE-58",
        "name": "Copper pipe 5/8\" (15.88 mm), soft-drawn"
      },
      "warehouse": {
        "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
        "code": "A",
        "name": "Warehouse A"
      },
      "condition": "GOOD",
      "qtyChange": "-300.000",
      "unitCost": "980.0000",
      "valueChange": "-294000.00",
      "balanceAfter": "156.000",
      "avgCostAfter": "980.0000"
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 7,
    "totalPages": 3
  }
}
```

*More examples in the full reference:* Ledger filtered by entry type (Store Manager)  (as Store Manager (Warehouse A))

#### GET /serials — List serial numbers

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-06, S-22 |

Search `q` by serial.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: serial, updatedAt · e.g. serial |
| `q` | string | Free-text search · max 200 chars |
| `productId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null |  |
| `status` | IN_STOCK \| RESERVED \| IN_TRANSIT \| ISSUED \| SOLD \| RETURNED_TO_SUPPLIER \| WRITTEN_OFF \| DAMAGED or null |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Serial numbers of a product  (as Store Manager (Warehouse A))**

*Request*

```http
GET /api/v1/serials?productId=2acff611-accb-4a97-a453-309592633d92&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "bed7d8ab-7e61-4308-a0d7-250f706940d8",
      "productId": "2acff611-accb-4a97-a453-309592633d92",
      "serial": "E6KF004521",
      "status": "ISSUED",
      "warehouseId": null,
      "projectId": "f71237a3-cc8f-4f1c-8cab-a4d1830c12b1",
      "customerId": null,
      "supplierId": "a8d10cf4-4c62-4e50-98d5-1d6b85cae932",
      "reservedEntryId": null,
      "productCode": "DK-FXFQ63AVM",
      "productName": "Daikin VRV ceiling-mounted cassette indoor unit 7.1 kW",
      "warehouseCode": null,
      "projectCode": "PRJ-001",
      "customerName": null
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 6,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Serials in stock in Warehouse A  (as Store Manager (Warehouse A)) · Find a serial (q)  (as Store Manager (Warehouse A))

#### GET /serials/{id} — A serial number, where it came in and its history

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-23 |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Serial detail: where it came in and its history  (as Store Manager (Warehouse A))**

> cameIn = the GRN / opening entry that brought it in (supplier, B/E, BL, origin).

*Request*

```http
GET /api/v1/serials/04d507bb-eab5-4ba1-9ae2-4ee0c75cbcdc
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "04d507bb-eab5-4ba1-9ae2-4ee0c75cbcdc",
    "productId": "2acff611-accb-4a97-a453-309592633d92",
    "serial": "E6KF004523",
    "status": "SOLD",
    "warehouseId": null,
    "projectId": null,
    "customerId": "310bd190-5439-4523-9a9f-7e7d40d214ea",
    "supplierId": "a8d10cf4-4c62-4e50-98d5-1d6b85cae932",
    "reservedEntryId": null,
    "productCode": "DK-FXFQ63AVM",
    "productName": "Daikin VRV ceiling-mounted cassette indoor unit 7.1 kW",
    "warehouseCode": null,
    "projectCode": null,
    "customerName": "Green Tower Developers Ltd.",
    "cameIn": {
      "entry": {
        "id": "75a127bd-aaa6-44b7-9bb7-4791c4db484e",
        "number": "GRN-I-2627-0001",
        "type": "GRN_IMPORT"
      },
      "entryDate": "2026-11-05",
      "warehouseCode": "A",
      "supplierName": "Daikin Airconditioning (Thailand)",
      "countryOfOrigin": "Thailand",
      "blNo": "MAEU-240915377",
      "boeNo": "C-2026-0042",
      "boeDate": "2026-10-27"
    },
    "history": [
      {
        "id": "bf4e9d20-0e1b-44eb-989b-92b932e28008",
        "at": "2026-11-05T08:12:34.264Z",
        "fromStatus": null,
        "toStatus": "IN_STOCK",
        "entry": {
          "id": "75a127bd-aaa6-44b7-9bb7-4791c4db484e",
          "number": "GRN-I-2627-0001",
          "type": "GRN_IMPORT"
        },
        "fromWarehouse": null,
        "toWarehouse": "A"
      },
      // … 1 more
    ]
  }
}
```

## 8. Stock in / out (entries)

Screens: S-11 Entries list, S-12 Choose type, S-13 New / edit entry, S-14 Import documents, S-15 Entry detail, S-16 Receive transfer, S-17 Reason sheet. **Every stock change is an entry.** An entry has a type, a warehouse, lines (product, quantity, optional serials / price / condition) and moves through statuses.

| type | Name | Direction | Number | Needs |
|---|---|---|---|---|
| `GRN_IMPORT` | GRN · Imported | In | GRN-I-… | supplier, currency + rate, import documents (BL, CO, PL, CI, B/E), landed cost |
| `GRN_LOCAL` | GRN · Local | In | GRN-L-… | supplier, unit prices |
| `RETURN_FROM_SITE` | Return from site | In | RTN-… | project; optional original issue; condition GOOD / DAMAGED |
| `OPENING` | Opening stock | In | OPN-… | FULL only, web |
| `ISSUE_TO_PROJECT` | Issue to project | Out | ISS-… | project (Planning / Running), site address, received by |
| `SALE` | Sale / delivery | Out | SAL-… | customer, selling prices, discount, VAT % |
| `RETURN_TO_SUPPLIER` | Return to supplier | Out | RTS-… | supplier; optional original GRN |
| `DAMAGE_WRITE_OFF` | Damage / loss write-off | Out | DMG-… | reason |
| `TRANSFER` | Transfer | Move | TRF-… | destination warehouse; received at the other end |
| REVERSAL / STOCK_ADJUSTMENT | System entries | — | REV-… / ADJ-… | created by reverse and by approved counts |

### Statuses and actions

- `DRAFT` — saved, can be edited; has a `draftRef`, no number yet. Actions: edit (PATCH), submit, post (FULL), cancel.
- `PENDING` — submitted for verification; out-going stock is **reserved**. An approver of that warehouse (not the creator) approves (→ posted) or rejects with a reason (→ `REJECTED`).
- `REJECTED` — back to the creator to edit and resubmit, or cancel.
- `POSTED` — stock and cost updated; can only be reversed (FULL, with a reason) → `REVERSED`.
- `DISPATCHED` → `RECEIVED` — transfers: posting dispatches the goods (in transit); the destination warehouse receives them, and any shortage becomes a damaged write-off for verification.
- `CANCELLED` — drafts / pending / rejected entries cancelled by the creator.

`action` on create: `draft` (save only), `submit` (verification), `post` (FULL only, posts immediately). Before saving, call `POST /stock-entries/calculate` with the same body to show totals, the next number and warnings (not enough stock, priced below cost, serial count mismatch, import documents missing, a count in progress) — it never saves.

- **Use the `actions` object** on every entry (`edit`, `submit`, `post`, `approve`, `reject`, `cancel`, `reverse`, `receive`, `editLandedCost`, `editImportDocs`, `waitingForOtherApprover`): it is worked out for the current user, so show exactly those buttons.
- Drafts have `number: null` plus `draftRef` / `displayNumber`, and their amounts are `"0.00"` until submitted: show draft totals from `calculate`. The number is given on submit or post; cancelled entries keep theirs, so numbers can have gaps.
- **`PATCH /stock-entries/{id}` replaces the whole entry**: send `type`, `warehouseId`, every line and every optional field you want to keep (omitted ones are cleared). `PATCH …/import-shipment` works the same way. Editing a rejected entry leaves it `REJECTED` until you submit it again.
- Transfers: approve (or a FULL user's post) dispatches them (`DISPATCHED`, stock in transit); the destination receives with `POST …/receive`, which returns `{entry, shortageEntry}`: a shortfall becomes damaged stock plus a pending write-off (reason "Transfer shortage").
- Reverse returns `{original, reversal}` (a `REV-…` entry is created).
- Approving your own entry, a warehouse outside the user's scope and a direct post without FULL are **403 with empty `details`**; business rules (not enough stock, serials, below cost, import documents) are **422** with `details[].code` (Appendix A). `details[].meta` values are strings.
- Saved entries use fixed decimals (`"6.000"`, `"1450.0000"`, `"2.00"`); `calculate` echoes your input format (`"6"`, `"1450"`).
- Attachments: multipart `file` (repeatable), `docType` (`BL`, `CO`, `PL`, `CI`, `BOE` for import documents; omit for ordinary attachments such as challans and photos), optional `label`; returns the list of new files. Removing a file from a posted entry needs a reason (`?reason=…`, or a JSON body).
- PDFs: `POST …/documents {kind}` (the kind must fit the type, e.g. a sale allows `SALES_INVOICE` or `DELIVERY_CHALLAN`; drafts can't be printed) → poll `GET /documents/{jobId}` → download with `?download=1`. Only the requester can read the job.
- List search `q` also matches BL, CI, B/E, CO, PL and container numbers; `containerNo` is an exact (case-insensitive) match.

> The app's Approvals inbox (S-18) is built from three lists: `GET /stock-entries?awaitingMyApproval=true`, `GET /stock-counts?status=SUBMITTED` (chapter 9) and `GET /purchase-orders?status=PENDING_APPROVAL` (chapter 11).

#### GET /stock-entries — List stock entries

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-11, S-18 |

Only entries in the caller's warehouses are visible (403 otherwise). Filters: type, status, warehouse, party, product, dates, `awaitingMyApproval`, `awaitingMyReceipt`, and the import documents: `blNo`, `ciNo`, `boeNo`, `containerNo`, `countryOfOrigin`. `q` also matches BL, CI, B/E, CO and PL numbers and container numbers. Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: entryDate, createdAt, number · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `type` | GRN_IMPORT \| GRN_LOCAL \| RETURN_FROM_SITE \| OPENING \| ISSUE_TO_PROJECT \| SALE \| RETURN_TO_SUPPLIER \| DAMAGE_WRITE_OFF \| TRANSFER \| REVERSAL \| STOCK_ADJUSTMENT or null |  |
| `status` | DRAFT \| PENDING \| POSTED \| REJECTED \| CANCELLED \| REVERSED \| DISPATCHED \| RECEIVED or null |  |
| `warehouseId` | string (uuid) or null |  |
| `projectId` | string (uuid) or null |  |
| `customerId` | string (uuid) or null |  |
| `supplierId` | string (uuid) or null |  |
| `productId` | string (uuid) or null |  |
| `createdById` | string (uuid) or null |  |
| `purchaseOrderId` | string (uuid) or null |  |
| `dateFrom` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `dateTo` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |
| `awaitingMyApproval` | boolean | Pending entries I can verify (in my warehouses, not created by me) |
| `awaitingMyReceipt` | boolean | Dispatched transfers to my warehouses |
| `blNo` | string or null | Bill of Lading no. (partial match) · max 100 chars |
| `ciNo` | string or null | Commercial Invoice no. (partial match) · max 100 chars |
| `boeNo` | string or null | Bill of Entry no. (partial match) · max 100 chars |
| `containerNo` | string or null | Container no. (exact, case-insensitive) · max 20 chars |
| `countryOfOrigin` | string or null | Country of origin on the CO or on a line (case-insensitive) · max 100 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Pending entries waiting for my verification  (as Manager (Warehouses A + B))**

> PENDING entries in my warehouses that someone else created.

*Request*

```http
GET /api/v1/stock-entries?awaitingMyApproval=true&pageSize=3&sort=createdAt
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "1f736630-6ecf-4050-8e73-d612d3fc3e29",
      "number": "GRN-I-2627-0002",
      "draftRef": "DRAFT-90D6963C08",
      "displayNumber": "GRN-I-2627-0002",
      "type": "GRN_IMPORT",
      "typeLabel": "Purchase receipt (GRN) — Imported",
      "direction": "IN",
      "status": "PENDING",
      "entryDate": "2026-11-05",
      "warehouse": {
        "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
        "code": "A",
        "name": "Warehouse A"
      },
      "toWarehouse": null,
      "supplier": {
        "id": "aa95e2c9-b262-46af-b6a0-f37bd3c549fd",
        "name": "Dunham-Bush (Malaysia)"
      },
      "customer": null,
      "project": null,
      "originalEntry": null,
      "reversalOf": null,
      "reversedBy": null,
      "relatedEntry": null,
      "relatedEntries": [],
      "purchaseOrder": null,
      "references": {
        "poNumberText": null,
        "supplierInvoiceNo": null,
        "lcNo": "LC-0142-26-0412",
        "billOfEntryNo": null,
        "challanNo": null,
        "siteAddress": null,
        "receivedBy": "Karim Hossain",
        "vehicle": null,
        "reason": null,
        "description": null,
        "customerPhone": null,
        "customerAddress": null
      },
      "notes": null,
      "currency": "MYR",
      "exchangeRate": "26.3000",
      "discountAmount": "0.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "subtotal": "618050.00",
      "grandTotal": "618050.00",
      "costTotal": "618050.00",
      "belowCostConfirmed": false,
      "itemCount": 1,
      "totalQty": "10.000",
      "lines": [
        {
          "id": "d3bb9bc9-19c5-40d2-8ec4-071409191b3e",
          "lineNo": 1,
          "product": {
            "id": "a223ecd2-57eb-4f05-9dc9-5507b49bd46b",
            "code": "DB-FCU-1200",
            "name": "Dunham-Bush ceiling-concealed fan coil unit 1200 CFM",
            "unitCode": "set",
            "trackSerial": false
          },
          "qty": "10.000",
          "unitPrice": "2350.0000",
          "amount": "618050.00",
          "unitCostBdt": "61805.0000",
          "landedUnitCost": "61805.0000",
          "costAmount": "618050.00",
          "condition": "GOOD",
          "originalLineId": null,
          "receivedQty": null,
          "adjustDirection": null,
          "purchaseOrderLineId": null,
          "countryOfOrigin": "Malaysia",
          "note": null,
          "serials": []
        }
      ],
      "charges": [],
      "attachmentCount": 1,
      "importShipment": {
        "blNo": "ONEYKULB2610457",
        "blDate": "2026-10-14",
        "shippingLine": "Ocean Network Express",
        "vesselVoyage": null,
        "portOfLoading": "Port Klang, Malaysia",
        "portOfDischarge": "Chattogram",
        "containerNumbers": [
          "ONEU5523190"
        ],
        "coNo": null,
        "coDate": null,
        "countryOfOrigin": null,
        "coIssuingAuthority": null,
        "plNo": null,
        "plDate": null,
        "packageCount": null,
        "grossWeightKg": null,
        "netWeightKg": null,
        "ciNo": null,
        "ciDate": null,
        "ciCurrency": null,
        "ciValue": null,
        "incoterm": null,
        "boeNo": null,
        "boeDate": null,
        "customsStation": null
      },
      "importDocFileCount": 1,
      "documentsChecklist": [
        {
          "docType": "BL",
          "label": "Bill of Lading",
          "numberFilled": true,
          "fileCount": 1,
          "required": true,
          "complete": true
        },
        // … 2 more
      ],
      "createdBy": {
        "id": "aadf8b8b-280e-4e60-80cf-126d8d85b254",
        "name": "Karim Hossain"
      },
      "verifiedBy": null,
      "receivedByUser": null,
      "rejectionReason": null,
      "reversalReason": null,
      "submittedAt": "2026-11-05T08:12:34.817Z",
      "verifiedAt": null,
      "postedAt": null,
      "dispatchedAt": null,
      "receivedAt": null,
      "cancelledAt": null,
      "reversedAt": null,
      "createdAt": "2026-11-05T08:12:34.758Z",
      "updatedAt": "2026-11-05T08:12:34.823Z",
      "timeline": [
        {
          "event": "CREATED",
          "at": "2026-11-05T08:12:34.758Z",
          "by": "Karim Hossain"
        },
        // … 1 more
      ],
      "actions": {
        "edit": false,
        "submit": false,
        "post": false,
        "approve": true,
        "reject": true,
        "cancel": false,
        "reverse": false,
        "receive": false,
        "editLandedCost": true,
        "waitingForOtherApprover": false,
        "editImportDocs": true
      }
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 3,
    "totalPages": 1
  }
}
```

*More examples in the full reference:* Filter by status and type  (as Manager (Warehouses A + B)) · Transfers waiting for me to receive  (as Store Manager (Warehouse B)) · Latest entries (Admin)  (as Admin) · My entries as a Store Manager (no costs)  (as Store Manager (Warehouse A)) · Search by BL number (q)  (as Admin) · Filter imports by container no. and B/E no.  (as Admin) · Entries of a project in a date range  (as Manager (Warehouses A + B))

#### POST /stock-entries/calculate — Preview an entry's totals and costs (saves nothing)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Mobile screens** | S-13 step 3 (Review) |

Same calculation the posting engine uses. Includes availability and warnings. Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `type` | GRN_IMPORT \| GRN_LOCAL \| RETURN_FROM_SITE \| OPENING \| ISSUE_TO_PROJECT \| SALE \| RETURN_TO_SUPPLIER \| DAMAGE_WRITE_OFF \| TRANSFER | Yes |  |
| `entryDate` | string |  | Defaults to today (Asia/Dhaka). Can't be in the future. |
| `warehouseId` | string (uuid) | Yes | The warehouse (the 'from' warehouse for transfers) |
| `toWarehouseId` | string (uuid) or null |  |  |
| `supplierId` | string (uuid) or null |  |  |
| `customerId` | string (uuid) or null |  |  |
| `projectId` | string (uuid) or null |  |  |
| `originalEntryId` | string (uuid) or null |  | Returns from site: the issue. Returns to supplier: the GRN. |
| `purchaseOrderId` | string (uuid) or null |  | GRNs only: receive against an approved purchase order. Supplier and GRN type must match the PO, products must be on it, quantities can't exceed what is still to be received (422 OVER_RECEIPT). Unit prices and currency come from the PO server-side (client prices are ignored); imports take the PO exchange rate unless a user with seeCost sends one (customs rate). |
| `poNumberText` | string or null |  | max 100 chars |
| `supplierInvoiceNo` | string or null |  | max 100 chars |
| `lcNo` | string or null |  | max 100 chars |
| `billOfEntryNo` | string or null |  | max 100 chars |
| `challanNo` | string or null |  | max 100 chars |
| `siteAddress` | string or null |  | max 300 chars |
| `receivedBy` | string or null |  | max 100 chars |
| `vehicle` | string or null |  | max 100 chars |
| `reason` | string or null |  | max 300 chars |
| `description` | string or null |  | max 2000 chars |
| `customerPhone` | string or null |  | max 30 chars |
| `customerAddress` | string or null |  | max 300 chars |
| `notes` | string or null |  | max 2000 chars |
| `currency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  |  |
| `exchangeRate` | string |  |  |
| `discountAmount` | string |  | BDT, decimal string with up to 2 decimals |
| `vatPercent` | string |  | Sales only. Defaults to the inventory setting. |
| `lines` | array of object |  | at most 200 items, default [] |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string |  | Foreign cost (imports), BDT cost (local GRN / opening), selling price (sales; defaults to the product's selling price). Ignored for other types. |
| `lines[].condition` | GOOD \| DAMAGED |  | Returns from site: condition of the returned goods. Write-offs / returns to supplier: which balance to take from. |
| `lines[].originalLineId` | string (uuid) or null |  |  |
| `lines[].purchaseOrderLineId` | string (uuid) or null |  | GRNs against a PO: the PO line (matched by product when omitted) |
| `lines[].serials` | array of string |  | Required (exactly qty) for serial-tracked products · at most 1000 items |
| `lines[].countryOfOrigin` | string or null |  | GRN (Imported) only. Defaults to the product's country of origin, else the Certificate of Origin's. · max 100 chars |
| `lines[].note` | string or null |  | max 500 chars |
| `charges` | array of object |  | Imports only: landed-cost charges · at most 20 items, default [] |
| `charges[].type` | CUSTOMS_DUTY \| AIT \| IMPORT_VAT \| FREIGHT \| INSURANCE \| CNF \| OTHER | Yes |  |
| `charges[].mode` | PERCENT_OF_GOODS \| AMOUNT_BDT | Yes |  |
| `charges[].value` | string | Yes |  |
| `charges[].includeInCost` | boolean |  | default true |
| `charges[].label` | string or null |  | max 100 chars |
| `confirmBelowCost` | boolean |  | Admin only: allow a sale priced below average cost |
| `importShipment` | object or null |  | GRN (Imported) only (400 for other types): the shipment documents. Omit to keep the stored details. `billOfEntryNo` is still accepted and fills boeNo when it is empty. |
| `importShipment.blNo` | string or null |  | max 100 chars |
| `importShipment.blDate` | string or null |  |  |
| `importShipment.shippingLine` | string or null |  | max 150 chars |
| `importShipment.vesselVoyage` | string or null |  | max 150 chars |
| `importShipment.portOfLoading` | string or null |  | max 150 chars |
| `importShipment.portOfDischarge` | string or null |  | max 150 chars |
| `importShipment.containerNumbers` | array of string |  | Container numbers (stored upper-case) · at most 100 items |
| `importShipment.coNo` | string or null |  | max 100 chars |
| `importShipment.coDate` | string or null |  |  |
| `importShipment.countryOfOrigin` | string or null |  | max 100 chars |
| `importShipment.coIssuingAuthority` | string or null |  | max 150 chars |
| `importShipment.plNo` | string or null |  | max 100 chars |
| `importShipment.plDate` | string or null |  |  |
| `importShipment.packageCount` | integer or null |  | min 0, max 1000000 |
| `importShipment.grossWeightKg` | string |  |  |
| `importShipment.netWeightKg` | string |  |  |
| `importShipment.ciNo` | string or null |  | max 100 chars |
| `importShipment.ciDate` | string or null |  |  |
| `importShipment.ciCurrency` | BDT \| USD \| EUR \| CNY \| MYR \| THB or null |  |  |
| `importShipment.ciValue` | string |  | Invoice value in the CI currency. Hidden without seeCost; users without seeCost can't set it. |
| `importShipment.incoterm` | EXW \| FOB \| CFR \| CIF \| OTHER |  |  |
| `importShipment.boeNo` | string or null |  | max 100 chars |
| `importShipment.boeDate` | string or null |  |  |
| `importShipment.customsStation` | string or null |  | max 150 chars |
| `entryId` | string (uuid) or null |  | Editing a saved entry: counts its uploaded import document files in the checklist |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 422 Business rule violated

**Example: Preview: GRN (Imported) landed cost — import documents missing  (as Admin)**

> Saves nothing; same computation as posting. No Idempotency-Key needed. Warnings never block.

*Request*

```http
POST /api/v1/stock-entries/calculate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "type": "GRN_IMPORT",
  "warehouseId": "2ec58960-a6ac-4429-b613-7eeda826ef96",
  "supplierId": "a8d10cf4-4c62-4e50-98d5-1d6b85cae932",
  "currency": "USD",
  "exchangeRate": "122.50",
  "lcNo": "LC-0142-26-0388",
  "supplierInvoiceNo": "DKT-CI-26-0915",
  "notes": "VRV indoor units for the Gulshan Office Tower project.",
  "lines": [
    {
      "productId": "2acff611-accb-4a97-a453-309592633d92",
      "qty": 6,
      "unitPrice": "1450",
      "serials": [
        "E6KF004521",
        // … 2 more
      ]
    }
  ],
  "charges": [
    {
      "type": "CUSTOMS_DUTY",
      "mode": "PERCENT_OF_GOODS",
      "value": "25",
      "includeInCost": true,
      "label": "CD 25 %"
    },
    // … 2 more
  ],
  "importShipment": {
    "blNo": "MAEU-240915377",
    "ciNo": "DKT-CI-26-0915",
    "ciCurrency": "USD",
    "ciValue": "8700.00"
  }
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "type": "GRN_IMPORT",
    "nextNumber": "GRN-I-2627-0001",
    "postingMode": "POSTED_IMMEDIATELY",
    "currency": "USD",
    "exchangeRate": "122.50",
    "purchaseOrderId": null,
    "supplierId": "a8d10cf4-4c62-4e50-98d5-1d6b85cae932",
    "lines": [
      {
        "productId": "2acff611-accb-4a97-a453-309592633d92",
        "qty": "6",
        "condition": "GOOD",
        "purchaseOrderLineId": null,
        "countryOfOrigin": "Thailand",
        "available": "0.000",
        "insufficient": false,
        "unitCostBdt": "225031.2500",
        "landedUnitCost": "225031.2500",
        "costAmount": "1350187.50",
        "goodsBdt": "1065750.00",
        "chargeShare": "284437.50",
        "avgCostBefore": "0.0000",
        "belowCost": false,
        "unitPrice": "1450",
        "amount": "1065750.00"
      }
    ],
    "charges": [
      {
        "type": "CUSTOMS_DUTY",
        "mode": "PERCENT_OF_GOODS",
        "includeInCost": true,
        "label": "CD 25 %",
        "value": "25",
        "amountBdt": "266437.50"
      },
      // … 2 more
    ],
    "totals": {
      "goodsTotal": "1065750.00",
      "chargesIncluded": "284437.50",
      "chargesExcluded": "213150.00",
      "subtotal": "1065750.00",
      "discountAmount": "0.00",
      "netAmount": "1065750.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "grandTotal": "1563337.50",
      "costTotal": "1350187.50"
    },
    "warnings": [
      {
        "line": null,
        "code": "IMPORT_DOCS_MISSING",
        "message": "Needed before posting: Bill of Lading (BL): file; Commercial Invoice (CI): file; Bill of Entry (BOE): number and file."
      }
    ],
    "documentsChecklist": [
      {
        "docType": "BL",
        "label": "Bill of Lading",
        "numberFilled": true,
        "fileCount": 0,
        "required": true,
        "complete": false
      },
      // … 2 more
    ]
  }
}
```

*More examples in the full reference:* Preview a saved import GRN (entryId): documents checklist complete  (as Admin) · Preview: issue with warnings (not enough stock, serials missing)  (as Store Manager (Warehouse A)) · Preview: sale totals with VAT, discount and profit  (as Admin) · Preview: same sale as a Store Manager (selling prices, no cost / profit)  (as Store Manager (Warehouse A))

#### POST /stock-entries — Create a stock entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-13 |

`action`: draft (save), submit (→ PENDING, reserves stock for OUT/transfer), post (FULL only; posts immediately). Opening stock is FULL only. Changes stock: `Idempotency-Key` header required. Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `action` | draft \| submit \| post | Yes | draft: save only. submit: send for verification (reserves stock). post: post immediately (inventory FULL). |
| `type` | GRN_IMPORT \| GRN_LOCAL \| RETURN_FROM_SITE \| OPENING \| ISSUE_TO_PROJECT \| SALE \| RETURN_TO_SUPPLIER \| DAMAGE_WRITE_OFF \| TRANSFER | Yes |  |
| `entryDate` | string |  | Defaults to today (Asia/Dhaka). Can't be in the future. |
| `warehouseId` | string (uuid) | Yes | The warehouse (the 'from' warehouse for transfers) |
| `toWarehouseId` | string (uuid) or null |  |  |
| `supplierId` | string (uuid) or null |  |  |
| `customerId` | string (uuid) or null |  |  |
| `projectId` | string (uuid) or null |  |  |
| `originalEntryId` | string (uuid) or null |  | Returns from site: the issue. Returns to supplier: the GRN. |
| `purchaseOrderId` | string (uuid) or null |  | GRNs only: receive against an approved purchase order. Supplier and GRN type must match the PO, products must be on it, quantities can't exceed what is still to be received (422 OVER_RECEIPT). Unit prices and currency come from the PO server-side (client prices are ignored); imports take the PO exchange rate unless a user with seeCost sends one (customs rate). |
| `poNumberText` | string or null |  | max 100 chars |
| `supplierInvoiceNo` | string or null |  | max 100 chars |
| `lcNo` | string or null |  | max 100 chars |
| `billOfEntryNo` | string or null |  | max 100 chars |
| `challanNo` | string or null |  | max 100 chars |
| `siteAddress` | string or null |  | max 300 chars |
| `receivedBy` | string or null |  | max 100 chars |
| `vehicle` | string or null |  | max 100 chars |
| `reason` | string or null |  | max 300 chars |
| `description` | string or null |  | max 2000 chars |
| `customerPhone` | string or null |  | max 30 chars |
| `customerAddress` | string or null |  | max 300 chars |
| `notes` | string or null |  | max 2000 chars |
| `currency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  |  |
| `exchangeRate` | string |  |  |
| `discountAmount` | string |  | BDT, decimal string with up to 2 decimals |
| `vatPercent` | string |  | Sales only. Defaults to the inventory setting. |
| `lines` | array of object |  | at most 200 items, default [] |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string |  | Foreign cost (imports), BDT cost (local GRN / opening), selling price (sales; defaults to the product's selling price). Ignored for other types. |
| `lines[].condition` | GOOD \| DAMAGED |  | Returns from site: condition of the returned goods. Write-offs / returns to supplier: which balance to take from. |
| `lines[].originalLineId` | string (uuid) or null |  |  |
| `lines[].purchaseOrderLineId` | string (uuid) or null |  | GRNs against a PO: the PO line (matched by product when omitted) |
| `lines[].serials` | array of string |  | Required (exactly qty) for serial-tracked products · at most 1000 items |
| `lines[].countryOfOrigin` | string or null |  | GRN (Imported) only. Defaults to the product's country of origin, else the Certificate of Origin's. · max 100 chars |
| `lines[].note` | string or null |  | max 500 chars |
| `charges` | array of object |  | Imports only: landed-cost charges · at most 20 items, default [] |
| `charges[].type` | CUSTOMS_DUTY \| AIT \| IMPORT_VAT \| FREIGHT \| INSURANCE \| CNF \| OTHER | Yes |  |
| `charges[].mode` | PERCENT_OF_GOODS \| AMOUNT_BDT | Yes |  |
| `charges[].value` | string | Yes |  |
| `charges[].includeInCost` | boolean |  | default true |
| `charges[].label` | string or null |  | max 100 chars |
| `confirmBelowCost` | boolean |  | Admin only: allow a sale priced below average cost |
| `importShipment` | object or null |  | GRN (Imported) only (400 for other types): the shipment documents. Omit to keep the stored details. `billOfEntryNo` is still accepted and fills boeNo when it is empty. |
| `importShipment.blNo` | string or null |  | max 100 chars |
| `importShipment.blDate` | string or null |  |  |
| `importShipment.shippingLine` | string or null |  | max 150 chars |
| `importShipment.vesselVoyage` | string or null |  | max 150 chars |
| `importShipment.portOfLoading` | string or null |  | max 150 chars |
| `importShipment.portOfDischarge` | string or null |  | max 150 chars |
| `importShipment.containerNumbers` | array of string |  | Container numbers (stored upper-case) · at most 100 items |
| `importShipment.coNo` | string or null |  | max 100 chars |
| `importShipment.coDate` | string or null |  |  |
| `importShipment.countryOfOrigin` | string or null |  | max 100 chars |
| `importShipment.coIssuingAuthority` | string or null |  | max 150 chars |
| `importShipment.plNo` | string or null |  | max 100 chars |
| `importShipment.plDate` | string or null |  |  |
| `importShipment.packageCount` | integer or null |  | min 0, max 1000000 |
| `importShipment.grossWeightKg` | string |  |  |
| `importShipment.netWeightKg` | string |  |  |
| `importShipment.ciNo` | string or null |  | max 100 chars |
| `importShipment.ciDate` | string or null |  |  |
| `importShipment.ciCurrency` | BDT \| USD \| EUR \| CNY \| MYR \| THB or null |  |  |
| `importShipment.ciValue` | string |  | Invoice value in the CI currency. Hidden without seeCost; users without seeCost can't set it. |
| `importShipment.incoterm` | EXW \| FOB \| CFR \| CIF \| OTHER |  |  |
| `importShipment.boeNo` | string or null |  | max 100 chars |
| `importShipment.boeDate` | string or null |  |  |
| `importShipment.customsStation` | string or null |  | max 150 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Create: GRN (Local) posted directly  (as Admin)**

> action=post needs inventory FULL. unitPrice = BDT unit cost. Numbered GRN-L-{FY}-{0001} on posting.

*Request*

```http
POST /api/v1/stock-entries
Authorization: Bearer <accessToken>
Idempotency-Key: 9e7d47e1-e4b3-4399-b4e0-d770ec1bf686
Content-Type: application/json

{
  "action": "post",
  "type": "GRN_LOCAL",
  "warehouseId": "2ec58960-a6ac-4429-b613-7eeda826ef96",
  "supplierId": "db78c5fb-354a-4d8f-8123-5fb880a5417e",
  "poNumberText": "LGEB-PO-26-1187",
  "supplierInvoiceNo": "LGEB-INV-552810",
  "challanNo": "LGEB-DC-77310",
  "receivedBy": "Karim Hossain",
  "vehicle": "Dhaka Metro-Ta 11-2233",
  "notes": "Delivered to Warehouse A, Tejgaon.",
  "lines": [
    {
      "productId": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
      "qty": 20,
      "unitPrice": "61000"
    }
  ]
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/stock-entries/1381f982-0ffa-48a2-ab95-6ca0948c41e8

{
  "data": {
    "id": "1381f982-0ffa-48a2-ab95-6ca0948c41e8",
    "number": "GRN-L-2627-0001",
    "draftRef": "DRAFT-69172D0F61",
    "displayNumber": "GRN-L-2627-0001",
    "type": "GRN_LOCAL",
    "typeLabel": "Purchase receipt (GRN) — Local",
    "direction": "IN",
    "status": "POSTED",
    "entryDate": "2026-11-05",
    "warehouse": {
      "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
      "code": "A",
      "name": "Warehouse A"
    },
    "toWarehouse": null,
    "supplier": {
      "id": "db78c5fb-354a-4d8f-8123-5fb880a5417e",
      "name": "LG Electronics Bangladesh"
    },
    "customer": null,
    "project": null,
    "originalEntry": null,
    "reversalOf": null,
    "reversedBy": null,
    "relatedEntry": null,
    "relatedEntries": [],
    "purchaseOrder": null,
    "references": {
      "poNumberText": "LGEB-PO-26-1187",
      "supplierInvoiceNo": "LGEB-INV-552810",
      "lcNo": null,
      "billOfEntryNo": null,
      "challanNo": "LGEB-DC-77310",
      "siteAddress": null,
      "receivedBy": "Karim Hossain",
      "vehicle": "Dhaka Metro-Ta 11-2233",
      "reason": null,
      "description": null,
      "customerPhone": null,
      "customerAddress": null
    },
    "notes": "Delivered to Warehouse A, Tejgaon.",
    "currency": "BDT",
    "exchangeRate": "1.0000",
    "discountAmount": "0.00",
    "vatPercent": "0.00",
    "vatAmount": "0.00",
    "subtotal": "1220000.00",
    "grandTotal": "1220000.00",
    "costTotal": "1220000.00",
    "belowCostConfirmed": false,
    "itemCount": 1,
    "totalQty": "20.000",
    "lines": [
      {
        "id": "b6b35739-8803-4b92-a670-dc115af43bd3",
        "lineNo": 1,
        "product": {
          "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
          "code": "LG-S4-Q18KL3AA",
          "name": "LG Dual Inverter split AC 1.5 Ton",
          "unitCode": "set",
          "trackSerial": false
        },
        "qty": "20.000",
        "unitPrice": "61000.0000",
        "amount": "1220000.00",
        "unitCostBdt": "61000.0000",
        "landedUnitCost": null,
        "costAmount": "1220000.00",
        "condition": "GOOD",
        "originalLineId": null,
        "receivedQty": null,
        "adjustDirection": null,
        "purchaseOrderLineId": null,
        "note": null,
        "serials": []
      }
    ],
    "charges": [],
    "attachmentCount": 0,
    "createdBy": {
      "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
      "name": "Aminul Haque"
    },
    "verifiedBy": null,
    "receivedByUser": null,
    "rejectionReason": null,
    "reversalReason": null,
    "submittedAt": null,
    "verifiedAt": null,
    "postedAt": "2026-11-05T08:12:33.227Z",
    "dispatchedAt": null,
    "receivedAt": null,
    "cancelledAt": null,
    "reversedAt": null,
    "createdAt": "2026-11-05T08:12:33.037Z",
    "updatedAt": "2026-11-05T08:12:33.229Z",
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:12:33.037Z",
        "by": "Aminul Haque"
      },
      // … 1 more
    ],
    "actions": {
      "edit": false,
      "submit": false,
      "post": false,
      "approve": false,
      "reject": false,
      "cancel": false,
      "reverse": true,
      "receive": false,
      "editLandedCost": false,
      "waitingForOtherApprover": false,
      "editImportDocs": false
    }
  }
}
```

*More examples in the full reference:* Create: GRN (Imported) draft with landed cost and import documents  (as Admin) · Create: GRN (Imported) submitted by a Store Manager (no costs shown)  (as Store Manager (Warehouse A)) · Create: Issue to project (submit for verification, serials)  (as Store Manager (Warehouse A)) · Create: Sale saved as draft (no number yet)  (as Store Manager (Warehouse A)) · Create: Return from site (good + damaged), posted  (as Admin) · Create: Sale with VAT and discount (serial-tracked line)  (as Admin) · Create: Return to supplier (damaged unit, warranty)  (as Admin) · Create: Damage write-off (submit)  (as Store Manager (Warehouse A)) · Create: Transfer A → B (dispatched)  (as Admin) · Retry with the same key and body: the first response is replayed  (as Admin) · Issue material to the project  (as Admin) · Return material from site  (as Admin) · Receive goods against a PO (GRN)  (as Store Manager) · Error: not enough stock (reserved stock counts)  (as Store Manager (Warehouse A)) · Error: Store Manager can't post directly  (as Store Manager (Warehouse A)) · Error: validation (quantity must be greater than 0)  (as Store Manager (Warehouse A)) · Error: serial-tracked line without serials  (as Store Manager (Warehouse A)) · Error: selling below average cost  (as Admin) · Error: Idempotency-Key header missing  (as Admin) · Error: same key with a different body  (as Admin) · Error: receiving more than is still due (422 OVER_RECEIPT)  (as Store Manager)

#### GET /stock-entries/{id} — Get a stock entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-15 |

Only entries in the caller's warehouses are visible (403 otherwise). Includes lines, charges, serials, timeline and allowed actions. Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get: GRN (Imported) with documents checklist, files and warnings  (as Admin)**

*Request*

```http
GET /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "75a127bd-aaa6-44b7-9bb7-4791c4db484e",
    "number": "GRN-I-2627-0001",
    "draftRef": "DRAFT-9BD3935110",
    "displayNumber": "GRN-I-2627-0001",
    "type": "GRN_IMPORT",
    "typeLabel": "Purchase receipt (GRN) — Imported",
    "direction": "IN",
    "status": "POSTED",
    "entryDate": "2026-11-05",
    "warehouse": {
      "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
      "code": "A",
      "name": "Warehouse A"
    },
    "toWarehouse": null,
    "supplier": {
      "id": "a8d10cf4-4c62-4e50-98d5-1d6b85cae932",
      "name": "Daikin Airconditioning (Thailand)"
    },
    "customer": null,
    "project": null,
    "originalEntry": null,
    "reversalOf": null,
    "reversedBy": null,
    "relatedEntry": null,
    "relatedEntries": [],
    "purchaseOrder": null,
    "references": {
      "poNumberText": null,
      "supplierInvoiceNo": "DKT-CI-26-0915",
      "lcNo": "LC-0142-26-0388",
      "billOfEntryNo": "C-2026-0042",
      "challanNo": null,
      "siteAddress": null,
      "receivedBy": null,
      "vehicle": null,
      "reason": null,
      "description": null,
      "customerPhone": null,
      "customerAddress": null
    },
    "notes": "VRV indoor units for the Gulshan Office Tower project.",
    "currency": "USD",
    "exchangeRate": "122.5000",
    "discountAmount": "0.00",
    "vatPercent": "0.00",
    "vatAmount": "0.00",
    "subtotal": "1065750.00",
    "grandTotal": "1563337.50",
    "costTotal": "1350187.50",
    "belowCostConfirmed": false,
    "itemCount": 1,
    "totalQty": "6.000",
    "lines": [
      {
        "id": "aa478c02-4b5d-44bd-a3f4-3932b4a705d8",
        "lineNo": 1,
        "product": {
          "id": "2acff611-accb-4a97-a453-309592633d92",
          "code": "DK-FXFQ63AVM",
          "name": "Daikin VRV ceiling-mounted cassette indoor unit 7.1 kW",
          "unitCode": "set",
          "trackSerial": true
        },
        "qty": "6.000",
        "unitPrice": "1450.0000",
        "amount": "1065750.00",
        "unitCostBdt": "225031.2500",
        "landedUnitCost": "225031.2500",
        "costAmount": "1350187.50",
        "condition": "GOOD",
        "originalLineId": null,
        "receivedQty": null,
        "adjustDirection": null,
        "purchaseOrderLineId": null,
        "countryOfOrigin": "Thailand",
        "note": null,
        "serials": [
          {
            "serial": "E6KF004521",
            "received": true
          },
          // … 2 more
        ]
      }
    ],
    "charges": [
      {
        "id": "eb4c0f37-acf9-4cd9-af90-132184114278",
        "type": "CUSTOMS_DUTY",
        "mode": "PERCENT_OF_GOODS",
        "includeInCost": true,
        "label": "CD 25 %",
        "value": "25.0000",
        "amountBdt": "266437.50"
      },
      // … 2 more
    ],
    "attachmentCount": 3,
    "importShipment": {
      "blNo": "MAEU-240915377",
      "blDate": "2026-10-08",
      "shippingLine": "Maersk",
      "vesselVoyage": "MAERSK KOWLOON / 443W",
      "portOfLoading": "Laem Chabang, Thailand",
      "portOfDischarge": "Chattogram",
      "containerNumbers": [
        "MSKU7781234"
      ],
      "coNo": "TH-CO-2026-118734",
      "coDate": "2026-10-06",
      "countryOfOrigin": "Thailand",
      "coIssuingAuthority": "The Thai Chamber of Commerce",
      "plNo": "DKT-PL-26-0915",
      "plDate": "2026-10-06",
      "packageCount": 12,
      "grossWeightKg": "212.400",
      "netWeightKg": "176.000",
      "ciNo": "DKT-CI-26-0915",
      "ciDate": "2026-10-05",
      "ciCurrency": "USD",
      "ciValue": "8700.00",
      "incoterm": "CIF",
      "boeNo": "C-2026-0042",
      "boeDate": "2026-10-27",
      "customsStation": "Chattogram Custom House"
    },
    "importDocFileCount": 3,
    "documentsChecklist": [
      {
        "docType": "BL",
        "label": "Bill of Lading",
        "numberFilled": true,
        "fileCount": 1,
        "required": true,
        "complete": true
      },
      // … 2 more
    ],
    "createdBy": {
      "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
      "name": "Aminul Haque"
    },
    "verifiedBy": null,
    "receivedByUser": null,
    "rejectionReason": null,
    "reversalReason": null,
    "submittedAt": null,
    "verifiedAt": null,
    "postedAt": "2026-11-05T08:12:34.301Z",
    "dispatchedAt": null,
    "receivedAt": null,
    "cancelledAt": null,
    "reversedAt": null,
    "createdAt": "2026-11-05T08:12:33.647Z",
    "updatedAt": "2026-11-05T08:12:34.303Z",
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:12:33.647Z",
        "by": "Aminul Haque"
      },
      // … 1 more
    ],
    "actions": {
      "edit": false,
      "submit": false,
      "post": false,
      "approve": false,
      "reject": false,
      "cancel": false,
      "reverse": true,
      "receive": false,
      "editLandedCost": false,
      "waitingForOtherApprover": false,
      "editImportDocs": true
    },
    "importDocsRequiredToPost": [
      "BL",
      // … 2 more
    ],
    "importAttachments": {
      "BL": [
        {
          "id": "acdeb92d-085a-4deb-a1ad-95febe8028df",
          "fileName": "MAEU-240915377-BL.pdf",
          "mimeType": "application/pdf",
          "size": 94,
          "label": null,
          "docType": "BL",
          "uploadedBy": {
            "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
            "name": "Aminul Haque"
          },
          "createdAt": "2026-11-05T08:12:33.880Z",
          "uploadedAt": "2026-11-05T08:12:33.880Z",
          "url": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df",
          "downloadUrl": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df/download",
          "thumbnailUrl": null
        }
      ],
      "CO": [],
      "PL": [],
      "CI": [
        {
          "id": "416c70ca-e064-4597-996b-23003db309d0",
          "fileName": "DKT-CI-26-0915.pdf",
          "mimeType": "application/pdf",
          "size": 98,
          "label": null,
          "docType": "CI",
          "uploadedBy": {
            "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
            "name": "Aminul Haque"
          },
          "createdAt": "2026-11-05T08:12:33.942Z",
          "uploadedAt": "2026-11-05T08:12:33.942Z",
          "url": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/416c70ca-e064-4597-996b-23003db309d0",
          "downloadUrl": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/416c70ca-e064-4597-996b-23003db309d0/download",
          "thumbnailUrl": null
        }
      ],
      "BOE": [
        {
          "id": "831e5218-42d8-4909-8e41-1e21950da9db",
          "fileName": "IMG_20261105_101522.jpg",
          "mimeType": "image/jpeg",
          "size": 6680,
          "label": "B/E C-2026-0042",
          "docType": "BOE",
          "uploadedBy": {
            "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
            "name": "Aminul Haque"
          },
          "createdAt": "2026-11-05T08:12:34.047Z",
          "uploadedAt": "2026-11-05T08:12:34.047Z",
          "url": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/831e5218-42d8-4909-8e41-1e21950da9db",
          "downloadUrl": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/831e5218-42d8-4909-8e41-1e21950da9db/download",
          "thumbnailUrl": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/831e5218-42d8-4909-8e41-1e21950da9db/download?variant=thumb"
        }
      ],
      "OTHER": []
    },
    "importWarnings": []
  }
}
```

*More examples in the full reference:* Get: posted issue as the Store Manager who created it  (as Store Manager (Warehouse A)) · Get: GRN (Local) as Admin (costs and totals)  (as Admin) · Get: same GRN as a Store Manager (no cost, price or totals)  (as Store Manager (Warehouse A)) · Error: entry in a warehouse outside my scope  (as Store Manager (Warehouse B))

#### PATCH /stock-entries/{id} — Edit a draft or rejected entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Mobile screens** | S-13 (edit) |

Creator only.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `type` | GRN_IMPORT \| GRN_LOCAL \| RETURN_FROM_SITE \| OPENING \| ISSUE_TO_PROJECT \| SALE \| RETURN_TO_SUPPLIER \| DAMAGE_WRITE_OFF \| TRANSFER | Yes |  |
| `entryDate` | string |  | Defaults to today (Asia/Dhaka). Can't be in the future. |
| `warehouseId` | string (uuid) | Yes | The warehouse (the 'from' warehouse for transfers) |
| `toWarehouseId` | string (uuid) or null |  |  |
| `supplierId` | string (uuid) or null |  |  |
| `customerId` | string (uuid) or null |  |  |
| `projectId` | string (uuid) or null |  |  |
| `originalEntryId` | string (uuid) or null |  | Returns from site: the issue. Returns to supplier: the GRN. |
| `purchaseOrderId` | string (uuid) or null |  | GRNs only: receive against an approved purchase order. Supplier and GRN type must match the PO, products must be on it, quantities can't exceed what is still to be received (422 OVER_RECEIPT). Unit prices and currency come from the PO server-side (client prices are ignored); imports take the PO exchange rate unless a user with seeCost sends one (customs rate). |
| `poNumberText` | string or null |  | max 100 chars |
| `supplierInvoiceNo` | string or null |  | max 100 chars |
| `lcNo` | string or null |  | max 100 chars |
| `billOfEntryNo` | string or null |  | max 100 chars |
| `challanNo` | string or null |  | max 100 chars |
| `siteAddress` | string or null |  | max 300 chars |
| `receivedBy` | string or null |  | max 100 chars |
| `vehicle` | string or null |  | max 100 chars |
| `reason` | string or null |  | max 300 chars |
| `description` | string or null |  | max 2000 chars |
| `customerPhone` | string or null |  | max 30 chars |
| `customerAddress` | string or null |  | max 300 chars |
| `notes` | string or null |  | max 2000 chars |
| `currency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  |  |
| `exchangeRate` | string |  |  |
| `discountAmount` | string |  | BDT, decimal string with up to 2 decimals |
| `vatPercent` | string |  | Sales only. Defaults to the inventory setting. |
| `lines` | array of object |  | at most 200 items, default [] |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string |  | Foreign cost (imports), BDT cost (local GRN / opening), selling price (sales; defaults to the product's selling price). Ignored for other types. |
| `lines[].condition` | GOOD \| DAMAGED |  | Returns from site: condition of the returned goods. Write-offs / returns to supplier: which balance to take from. |
| `lines[].originalLineId` | string (uuid) or null |  |  |
| `lines[].purchaseOrderLineId` | string (uuid) or null |  | GRNs against a PO: the PO line (matched by product when omitted) |
| `lines[].serials` | array of string |  | Required (exactly qty) for serial-tracked products · at most 1000 items |
| `lines[].countryOfOrigin` | string or null |  | GRN (Imported) only. Defaults to the product's country of origin, else the Certificate of Origin's. · max 100 chars |
| `lines[].note` | string or null |  | max 500 chars |
| `charges` | array of object |  | Imports only: landed-cost charges · at most 20 items, default [] |
| `charges[].type` | CUSTOMS_DUTY \| AIT \| IMPORT_VAT \| FREIGHT \| INSURANCE \| CNF \| OTHER | Yes |  |
| `charges[].mode` | PERCENT_OF_GOODS \| AMOUNT_BDT | Yes |  |
| `charges[].value` | string | Yes |  |
| `charges[].includeInCost` | boolean |  | default true |
| `charges[].label` | string or null |  | max 100 chars |
| `confirmBelowCost` | boolean |  | Admin only: allow a sale priced below average cost |
| `importShipment` | object or null |  | GRN (Imported) only (400 for other types): the shipment documents. Omit to keep the stored details. `billOfEntryNo` is still accepted and fills boeNo when it is empty. |
| `importShipment.blNo` | string or null |  | max 100 chars |
| `importShipment.blDate` | string or null |  |  |
| `importShipment.shippingLine` | string or null |  | max 150 chars |
| `importShipment.vesselVoyage` | string or null |  | max 150 chars |
| `importShipment.portOfLoading` | string or null |  | max 150 chars |
| `importShipment.portOfDischarge` | string or null |  | max 150 chars |
| `importShipment.containerNumbers` | array of string |  | Container numbers (stored upper-case) · at most 100 items |
| `importShipment.coNo` | string or null |  | max 100 chars |
| `importShipment.coDate` | string or null |  |  |
| `importShipment.countryOfOrigin` | string or null |  | max 100 chars |
| `importShipment.coIssuingAuthority` | string or null |  | max 150 chars |
| `importShipment.plNo` | string or null |  | max 100 chars |
| `importShipment.plDate` | string or null |  |  |
| `importShipment.packageCount` | integer or null |  | min 0, max 1000000 |
| `importShipment.grossWeightKg` | string |  |  |
| `importShipment.netWeightKg` | string |  |  |
| `importShipment.ciNo` | string or null |  | max 100 chars |
| `importShipment.ciDate` | string or null |  |  |
| `importShipment.ciCurrency` | BDT \| USD \| EUR \| CNY \| MYR \| THB or null |  |  |
| `importShipment.ciValue` | string |  | Invoice value in the CI currency. Hidden without seeCost; users without seeCost can't set it. |
| `importShipment.incoterm` | EXW \| FOB \| CFR \| CIF \| OTHER |  |  |
| `importShipment.boeNo` | string or null |  | max 100 chars |
| `importShipment.boeDate` | string or null |  |  |
| `importShipment.customsStation` | string or null |  | max 150 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Edit a rejected entry  (as Store Manager (Warehouse A))**

> Creator only, DRAFT or REJECTED. Send the WHOLE entry (type, warehouseId, lines…): it replaces the saved one.

*Request*

```http
PATCH /api/v1/stock-entries/4b0f1ab9-8c74-4c4d-a354-caea49b6d2c2
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "type": "DAMAGE_WRITE_OFF",
  "warehouseId": "2ec58960-a6ac-4429-b613-7eeda826ef96",
  "reason": "Pipe kinked during unloading (re-measured: 4 m)",
  "notes": "Photo attached.",
  "lines": [
    {
      "productId": "f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7",
      "qty": "4"
    }
  ]
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "4b0f1ab9-8c74-4c4d-a354-caea49b6d2c2",
    "number": "DMG-2627-0001",
    "draftRef": "DRAFT-5F6F3FFDB8",
    "displayNumber": "DMG-2627-0001",
    "type": "DAMAGE_WRITE_OFF",
    "typeLabel": "Damage / loss write-off",
    "direction": "OUT",
    "status": "REJECTED",
    "entryDate": "2026-11-05",
    "warehouse": {
      "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
      "code": "A",
      "name": "Warehouse A"
    },
    "toWarehouse": null,
    "supplier": null,
    "customer": null,
    "project": null,
    "originalEntry": null,
    "reversalOf": null,
    "reversedBy": null,
    "relatedEntry": null,
    "relatedEntries": [],
    "purchaseOrder": null,
    "references": {
      "poNumberText": null,
      "supplierInvoiceNo": null,
      "lcNo": null,
      "billOfEntryNo": null,
      "challanNo": null,
      "siteAddress": null,
      "receivedBy": null,
      "vehicle": null,
      "reason": "Pipe kinked during unloading (re-measured: 4 m)",
      "description": null,
      "customerPhone": null,
      "customerAddress": null
    },
    "notes": "Photo attached.",
    "currency": "BDT",
    "exchangeRate": "1.0000",
    "discountAmount": "0.00",
    "vatPercent": "0.00",
    "vatAmount": "0.00",
    "belowCostConfirmed": false,
    "itemCount": 1,
    "totalQty": "4.000",
    "lines": [
      {
        "id": "04bd1374-ae03-4092-9e00-820a8fc330d4",
        "lineNo": 1,
        "product": {
          "id": "f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7",
          "code": "CU-PIPE-58",
          "name": "Copper pipe 5/8\" (15.88 mm), soft-drawn",
          "unitCode": "m",
          "trackSerial": false
        },
        "qty": "4.000",
        "condition": "GOOD",
        "originalLineId": null,
        "receivedQty": null,
        "adjustDirection": null,
        "purchaseOrderLineId": null,
        "note": null,
        "serials": []
      }
    ],
    "charges": [],
    "attachmentCount": 0,
    "createdBy": {
      "id": "aadf8b8b-280e-4e60-80cf-126d8d85b254",
      "name": "Karim Hossain"
    },
    "verifiedBy": {
      "id": "0c72b9b8-5769-44cf-8efa-d2809e8a9785",
      "name": "Nadia Rahman"
    },
    "receivedByUser": null,
    "rejectionReason": "Please re-measure (challan says 4 m) and attach a photo of the damaged pipe.",
    "reversalReason": null,
    "submittedAt": "2026-11-05T08:12:37.176Z",
    "verifiedAt": "2026-11-05T08:12:37.247Z",
    "postedAt": null,
    "dispatchedAt": null,
    "receivedAt": null,
    "cancelledAt": null,
    "reversedAt": null,
    "createdAt": "2026-11-05T08:12:37.112Z",
    "updatedAt": "2026-11-05T08:12:37.309Z",
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:12:37.112Z",
        "by": "Karim Hossain"
      },
      // … 2 more
    ],
    "actions": {
      "edit": true,
      "submit": true,
      "post": false,
      "approve": false,
      "reject": false,
      "cancel": true,
      "reverse": false,
      "receive": false,
      "editLandedCost": false,
      "waitingForOtherApprover": false,
      "editImportDocs": false
    }
  }
}
```

#### POST /stock-entries/{id}/submit — Submit for verification

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |

Creator only. → PENDING; OUT and transfer entries reserve their stock and serials. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `confirmBelowCost` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Submit a draft for verification  (as Store Manager (Warehouse A))**

> Creator only. DRAFT or REJECTED → PENDING; gets its number, reserves stock. Body optional.

*Request*

```http
POST /api/v1/stock-entries/8267a5a1-19b6-4cec-9059-beeca7a9f6bc/submit
Authorization: Bearer <accessToken>
Idempotency-Key: 66f5cc2f-f4f1-4c8d-80ac-706d7df17991
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "8267a5a1-19b6-4cec-9059-beeca7a9f6bc",
    "number": "SAL-2627-0001",
    "draftRef": "DRAFT-8D3575B1B9",
    "displayNumber": "SAL-2627-0001",
    "type": "SALE",
    "typeLabel": "Sale / delivery",
    "direction": "OUT",
    "status": "PENDING",
    "entryDate": "2026-11-05",
    "warehouse": {
      "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
      "code": "A",
      "name": "Warehouse A"
    },
    "toWarehouse": null,
    "supplier": null,
    "customer": {
      "id": "3d36175b-0322-41b7-a458-c5e68d8a50b0",
      "name": "Walk-in customer"
    },
    "project": null,
    "originalEntry": null,
    "reversalOf": null,
    "reversedBy": null,
    "relatedEntry": null,
    "relatedEntries": [],
    "purchaseOrder": null,
    "references": {
      "poNumberText": null,
      "supplierInvoiceNo": null,
      "lcNo": null,
      "billOfEntryNo": null,
      "challanNo": null,
      "siteAddress": null,
      "receivedBy": null,
      "vehicle": null,
      "reason": null,
      "description": null,
      "customerPhone": "+880 1819 220044",
      "customerAddress": "House 12, Road 5, Dhanmondi, Dhaka"
    },
    "notes": null,
    "currency": "BDT",
    "exchangeRate": "1.0000",
    "discountAmount": "0.00",
    "vatPercent": "15.00",
    "vatAmount": "25500.00",
    "subtotal": "170000.00",
    "grandTotal": "195500.00",
    "belowCostConfirmed": false,
    "itemCount": 1,
    "totalQty": "2.000",
    "lines": [
      {
        "id": "92e6a303-b196-4c27-aa2f-385eae09e566",
        "lineNo": 1,
        "product": {
          "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
          "code": "LG-S4-Q18KL3AA",
          "name": "LG Dual Inverter split AC 1.5 Ton",
          "unitCode": "set",
          "trackSerial": false
        },
        "qty": "2.000",
        "unitPrice": "85000.0000",
        "amount": "170000.00",
        "condition": "GOOD",
        "originalLineId": null,
        "receivedQty": null,
        "adjustDirection": null,
        "purchaseOrderLineId": null,
        "note": null,
        "serials": []
      }
    ],
    "charges": [],
    "attachmentCount": 0,
    "createdBy": {
      "id": "aadf8b8b-280e-4e60-80cf-126d8d85b254",
      "name": "Karim Hossain"
    },
    "verifiedBy": null,
    "receivedByUser": null,
    "rejectionReason": null,
    "reversalReason": null,
    "submittedAt": "2026-11-05T08:12:35.239Z",
    "verifiedAt": null,
    "postedAt": null,
    "dispatchedAt": null,
    "receivedAt": null,
    "cancelledAt": null,
    "reversedAt": null,
    "createdAt": "2026-11-05T08:12:35.138Z",
    "updatedAt": "2026-11-05T08:12:35.243Z",
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:12:35.138Z",
        "by": "Karim Hossain"
      },
      // … 1 more
    ],
    "actions": {
      "edit": false,
      "submit": false,
      "post": false,
      "approve": false,
      "reject": false,
      "cancel": true,
      "reverse": false,
      "receive": false,
      "editLandedCost": false,
      "waitingForOtherApprover": true,
      "editImportDocs": false
    }
  }
}
```

*More examples in the full reference:* Resubmit after rejection  (as Store Manager (Warehouse A))

#### POST /stock-entries/{id}/post — Post a draft or rejected entry directly

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Idempotency-Key** | Required (header) |

Write-offs need verification when the setting is on (422 APPROVAL_REQUIRED). GRN (Imported): 422 IMPORT_DOCS_MISSING until every required document has a number and a file. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `confirmBelowCost` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Post a draft directly (Admin)  (as Admin)**

> inventory FULL. Body optional ({ confirmBelowCost } for sales).

*Request*

```http
POST /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/post
Authorization: Bearer <accessToken>
Idempotency-Key: 6cfa4b69-decc-4a1d-a075-642261fb047b
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "75a127bd-aaa6-44b7-9bb7-4791c4db484e",
    "number": "GRN-I-2627-0001",
    "draftRef": "DRAFT-9BD3935110",
    "displayNumber": "GRN-I-2627-0001",
    "type": "GRN_IMPORT",
    "typeLabel": "Purchase receipt (GRN) — Imported",
    "direction": "IN",
    "status": "POSTED",
    "entryDate": "2026-11-05",
    "warehouse": {
      "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
      "code": "A",
      "name": "Warehouse A"
    },
    "toWarehouse": null,
    "supplier": {
      "id": "a8d10cf4-4c62-4e50-98d5-1d6b85cae932",
      "name": "Daikin Airconditioning (Thailand)"
    },
    "customer": null,
    "project": null,
    "originalEntry": null,
    "reversalOf": null,
    "reversedBy": null,
    "relatedEntry": null,
    "relatedEntries": [],
    "purchaseOrder": null,
    "references": {
      "poNumberText": null,
      "supplierInvoiceNo": "DKT-CI-26-0915",
      "lcNo": "LC-0142-26-0388",
      "billOfEntryNo": "C-2026-0042",
      "challanNo": null,
      "siteAddress": null,
      "receivedBy": null,
      "vehicle": null,
      "reason": null,
      "description": null,
      "customerPhone": null,
      "customerAddress": null
    },
    "notes": "VRV indoor units for the Gulshan Office Tower project.",
    "currency": "USD",
    "exchangeRate": "122.5000",
    "discountAmount": "0.00",
    "vatPercent": "0.00",
    "vatAmount": "0.00",
    "subtotal": "1065750.00",
    "grandTotal": "1563337.50",
    "costTotal": "1350187.50",
    "belowCostConfirmed": false,
    "itemCount": 1,
    "totalQty": "6.000",
    "lines": [
      {
        "id": "aa478c02-4b5d-44bd-a3f4-3932b4a705d8",
        "lineNo": 1,
        "product": {
          "id": "2acff611-accb-4a97-a453-309592633d92",
          "code": "DK-FXFQ63AVM",
          "name": "Daikin VRV ceiling-mounted cassette indoor unit 7.1 kW",
          "unitCode": "set",
          "trackSerial": true
        },
        "qty": "6.000",
        "unitPrice": "1450.0000",
        "amount": "1065750.00",
        "unitCostBdt": "225031.2500",
        "landedUnitCost": "225031.2500",
        "costAmount": "1350187.50",
        "condition": "GOOD",
        "originalLineId": null,
        "receivedQty": null,
        "adjustDirection": null,
        "purchaseOrderLineId": null,
        "countryOfOrigin": "Thailand",
        "note": null,
        "serials": [
          {
            "serial": "E6KF004521",
            "received": true
          },
          // … 2 more
        ]
      }
    ],
    "charges": [
      {
        "id": "eb4c0f37-acf9-4cd9-af90-132184114278",
        "type": "CUSTOMS_DUTY",
        "mode": "PERCENT_OF_GOODS",
        "includeInCost": true,
        "label": "CD 25 %",
        "value": "25.0000",
        "amountBdt": "266437.50"
      },
      // … 2 more
    ],
    "attachmentCount": 3,
    "importShipment": {
      "blNo": "MAEU-240915377",
      "blDate": "2026-10-08",
      "shippingLine": "Maersk",
      "vesselVoyage": "MAERSK KOWLOON / 443W",
      "portOfLoading": "Laem Chabang, Thailand",
      "portOfDischarge": "Chattogram",
      "containerNumbers": [
        "MSKU7781234"
      ],
      "coNo": "TH-CO-2026-118734",
      "coDate": "2026-10-06",
      "countryOfOrigin": "Thailand",
      "coIssuingAuthority": "The Thai Chamber of Commerce",
      "plNo": "DKT-PL-26-0915",
      "plDate": "2026-10-06",
      "packageCount": 12,
      "grossWeightKg": "212.400",
      "netWeightKg": "176.000",
      "ciNo": "DKT-CI-26-0915",
      "ciDate": "2026-10-05",
      "ciCurrency": "USD",
      "ciValue": "8700.00",
      "incoterm": "CIF",
      "boeNo": "C-2026-0042",
      "boeDate": "2026-10-27",
      "customsStation": "Chattogram Custom House"
    },
    "importDocFileCount": 3,
    "documentsChecklist": [
      {
        "docType": "BL",
        "label": "Bill of Lading",
        "numberFilled": true,
        "fileCount": 1,
        "required": true,
        "complete": true
      },
      // … 2 more
    ],
    "createdBy": {
      "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
      "name": "Aminul Haque"
    },
    "verifiedBy": null,
    "receivedByUser": null,
    "rejectionReason": null,
    "reversalReason": null,
    "submittedAt": null,
    "verifiedAt": null,
    "postedAt": "2026-11-05T08:12:34.301Z",
    "dispatchedAt": null,
    "receivedAt": null,
    "cancelledAt": null,
    "reversedAt": null,
    "createdAt": "2026-11-05T08:12:33.647Z",
    "updatedAt": "2026-11-05T08:12:34.303Z",
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:12:33.647Z",
        "by": "Aminul Haque"
      },
      // … 1 more
    ],
    "actions": {
      "edit": false,
      "submit": false,
      "post": false,
      "approve": false,
      "reject": false,
      "cancel": false,
      "reverse": true,
      "receive": false,
      "editLandedCost": false,
      "waitingForOtherApprover": false,
      "editImportDocs": true
    }
  }
}
```

*More examples in the full reference:* Error: import documents missing (no files yet)  (as Admin)

#### POST /stock-entries/{id}/approve — Approve (verify) a pending entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ APPROVE |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-15, S-18 |

Not the creator; warehouse in scope. Posts it (transfers become DISPATCHED). GRN (Imported): 422 IMPORT_DOCS_MISSING until every required document has a number and a file. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `confirmBelowCost` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Approve: import GRN after landed cost and documents  (as Manager (Warehouses A + B))**

*Request*

```http
POST /api/v1/stock-entries/1f736630-6ecf-4050-8e73-d612d3fc3e29/approve
Authorization: Bearer <accessToken>
Idempotency-Key: 5055e9bd-4f71-4137-a01f-d2a8c8b2e423
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-entries/{id}/post */ }
}
```

*More examples in the full reference:* Approve: Manager verifies a Store Manager's issue  (as Manager (Warehouses A + B)) · Error: approving my own entry  (as Manager (Warehouses A + B))

#### POST /stock-entries/{id}/reject — Reject a pending entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ APPROVE |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-17 |

Reason required; releases the reservation. The creator can edit and resubmit. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Reject with a reason  (as Manager (Warehouses A + B))**

> Releases the reservation. The creator can edit (PATCH) and resubmit; the number is kept.

*Request*

```http
POST /api/v1/stock-entries/4b0f1ab9-8c74-4c4d-a354-caea49b6d2c2/reject
Authorization: Bearer <accessToken>
Idempotency-Key: 3e6b2fbd-424a-46e3-83a8-8fdeb373abfd
Content-Type: application/json

{
  "reason": "Please re-measure (challan says 4 m) and attach a photo of the damaged pipe."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-entries */ }
}
```

#### POST /stock-entries/{id}/cancel — Cancel a draft, pending or rejected entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |

Creator or FULL. Releases any reservation. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Cancel a pending entry (releases the reservation)  (as Manager (Warehouses A + B))**

> Creator (or inventory FULL); DRAFT, PENDING or REJECTED. No body. Idempotency-Key optional.

*Request*

```http
POST /api/v1/stock-entries/777abb47-964b-4ad5-a555-9dd477e82d0b/cancel
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-entries */ }
}
```

#### POST /stock-entries/{id}/reverse — Reverse a posted entry

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Idempotency-Key** | Required (header) |

Reason required. Creates a REVERSAL entry that undoes the stock and cost exactly. Refused (422) if stock would go negative, serials have moved on, or later entries depend on it. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Reverse a posted entry  (as Admin)**

> inventory FULL, reason required. Creates a REV entry that undoes stock and cost exactly; the original becomes REVERSED.

*Request*

```http
POST /api/v1/stock-entries/fabe23e1-bfb0-4545-bb2f-00a64b520529/reverse
Authorization: Bearer <accessToken>
Idempotency-Key: ac167d3d-a552-4dbb-8fba-5aa321292100
Content-Type: application/json

{
  "reason": "Duplicate entry — challan NPF-2611-118 was already received on GRN-L-2627-0002"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "original": {
      "id": "fabe23e1-bfb0-4545-bb2f-00a64b520529",
      "number": "GRN-L-2627-0003",
      "draftRef": "DRAFT-13E8709464",
      "displayNumber": "GRN-L-2627-0003",
      "type": "GRN_LOCAL",
      "typeLabel": "Purchase receipt (GRN) — Local",
      "direction": "IN",
      "status": "REVERSED",
      "entryDate": "2026-11-05",
      "warehouse": {
        "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
        "code": "A",
        "name": "Warehouse A"
      },
      "toWarehouse": null,
      "supplier": {
        "id": "52950eff-39d5-42d4-89a2-9e9dcc2b2745",
        "name": "Nawabpur Pipe & Fittings"
      },
      "customer": null,
      "project": null,
      "originalEntry": null,
      "reversalOf": null,
      "reversedBy": {
        "id": "64b0211f-c6c8-4f2a-a4d1-b02556b55a11",
        "number": "REV-2627-0001"
      },
      "relatedEntry": null,
      "relatedEntries": [],
      "purchaseOrder": null,
      "references": {
        "poNumberText": null,
        "supplierInvoiceNo": null,
        "lcNo": null,
        "billOfEntryNo": null,
        "challanNo": "NPF-2611-118",
        "siteAddress": null,
        "receivedBy": null,
        "vehicle": null,
        "reason": null,
        "description": null,
        "customerPhone": null,
        "customerAddress": null
      },
      "notes": null,
      "currency": "BDT",
      "exchangeRate": "1.0000",
      "discountAmount": "0.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "subtotal": "294000.00",
      "grandTotal": "294000.00",
      "costTotal": "294000.00",
      "belowCostConfirmed": false,
      "itemCount": 1,
      "totalQty": "300.000",
      "lines": [
        {
          "id": "c1d7bb9b-905b-469a-a573-529c975c228c",
          "lineNo": 1,
          "product": {
            "id": "f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7",
            "code": "CU-PIPE-58",
            "name": "Copper pipe 5/8\" (15.88 mm), soft-drawn",
            "unitCode": "m",
            "trackSerial": false
          },
          "qty": "300.000",
          "unitPrice": "980.0000",
          "amount": "294000.00",
          "unitCostBdt": "980.0000",
          "landedUnitCost": null,
          "costAmount": "294000.00",
          "condition": "GOOD",
          "originalLineId": null,
          "receivedQty": null,
          "adjustDirection": null,
          "purchaseOrderLineId": null,
          "note": null,
          "serials": []
        }
      ],
      "charges": [],
      "attachmentCount": 0,
      "createdBy": {
        "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
        "name": "Aminul Haque"
      },
      "verifiedBy": null,
      "receivedByUser": null,
      "rejectionReason": null,
      "reversalReason": "Duplicate entry — challan NPF-2611-118 was already received on GRN-L-2627-0002",
      "submittedAt": null,
      "verifiedAt": null,
      "postedAt": "2026-11-05T08:12:33.549Z",
      "dispatchedAt": null,
      "receivedAt": null,
      "cancelledAt": null,
      "reversedAt": "2026-11-05T08:12:38.361Z",
      "createdAt": "2026-11-05T08:12:33.462Z",
      "updatedAt": "2026-11-05T08:12:38.370Z",
      "timeline": [
        {
          "event": "CREATED",
          "at": "2026-11-05T08:12:33.462Z",
          "by": "Aminul Haque"
        },
        // … 2 more
      ],
      "actions": {
        "edit": false,
        "submit": false,
        "post": false,
        "approve": false,
        "reject": false,
        "cancel": false,
        "reverse": false,
        "receive": false,
        "editLandedCost": false,
        "waitingForOtherApprover": false,
        "editImportDocs": false
      }
    },
    "reversal": {
      "id": "64b0211f-c6c8-4f2a-a4d1-b02556b55a11",
      "number": "REV-2627-0001",
      "draftRef": "DRAFT-786CAD4B5A",
      "displayNumber": "REV-2627-0001",
      "type": "REVERSAL",
      "typeLabel": "Reversal",
      "direction": "INVERSE",
      "status": "POSTED",
      "entryDate": "2026-11-05",
      "warehouse": {
        "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
        "code": "A",
        "name": "Warehouse A"
      },
      "toWarehouse": null,
      "supplier": {
        "id": "52950eff-39d5-42d4-89a2-9e9dcc2b2745",
        "name": "Nawabpur Pipe & Fittings"
      },
      "customer": null,
      "project": null,
      "originalEntry": null,
      "reversalOf": {
        "id": "fabe23e1-bfb0-4545-bb2f-00a64b520529",
        "number": "GRN-L-2627-0003"
      },
      "reversedBy": null,
      "relatedEntry": null,
      "relatedEntries": [],
      "purchaseOrder": null,
      "references": {
        "poNumberText": null,
        "supplierInvoiceNo": null,
        "lcNo": null,
        "billOfEntryNo": null,
        "challanNo": "NPF-2611-118",
        "siteAddress": null,
        "receivedBy": null,
        "vehicle": null,
        "reason": "Duplicate entry — challan NPF-2611-118 was already received on GRN-L-2627-0002",
        "description": "Reversal of GRN-L-2627-0003",
        "customerPhone": null,
        "customerAddress": null
      },
      "notes": null,
      "currency": "BDT",
      "exchangeRate": "1.0000",
      "discountAmount": "0.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "subtotal": "294000.00",
      "grandTotal": "294000.00",
      "costTotal": "294000.00",
      "belowCostConfirmed": false,
      "itemCount": 1,
      "totalQty": "300.000",
      "lines": [
        {
          "id": "62205be5-2696-4d12-9b31-bc9b8d8f86dc",
          "lineNo": 1,
          "product": {
            "id": "f40d9be5-1d7a-4ba6-afaf-18b4aa7ed2c7",
            "code": "CU-PIPE-58",
            "name": "Copper pipe 5/8\" (15.88 mm), soft-drawn",
            "unitCode": "m",
            "trackSerial": false
          },
          "qty": "300.000",
          "unitPrice": "980.0000",
          "amount": "294000.00",
          "unitCostBdt": "980.0000",
          "landedUnitCost": null,
          "costAmount": "294000.00",
          "condition": "GOOD",
          "originalLineId": null,
          "receivedQty": null,
          "adjustDirection": null,
          "purchaseOrderLineId": null,
          "note": null,
          "serials": []
        }
      ],
      "charges": [],
      "attachmentCount": 0,
      "createdBy": {
        "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
        "name": "Aminul Haque"
      },
      "verifiedBy": {
        "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
        "name": "Aminul Haque"
      },
      "receivedByUser": null,
      "rejectionReason": null,
      "reversalReason": null,
      "submittedAt": null,
      "verifiedAt": "2026-11-05T08:12:38.361Z",
      "postedAt": "2026-11-05T08:12:38.361Z",
      "dispatchedAt": null,
      "receivedAt": null,
      "cancelledAt": null,
      "reversedAt": null,
      "createdAt": "2026-11-05T08:12:38.328Z",
      "updatedAt": "2026-11-05T08:12:38.366Z",
      "timeline": [
        {
          "event": "CREATED",
          "at": "2026-11-05T08:12:38.328Z",
          "by": "Aminul Haque"
        },
        // … 1 more
      ],
      "actions": {
        "edit": false,
        "submit": false,
        "post": false,
        "approve": false,
        "reject": false,
        "cancel": false,
        "reverse": false,
        "receive": false,
        "editLandedCost": false,
        "waitingForOtherApprover": false,
        "editImportDocs": false
      }
    }
  }
}
```

*More examples in the full reference:* Error: already reversed  (as Admin)

#### POST /stock-entries/{id}/receive — Receive a dispatched transfer

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-16 |

Destination warehouse in scope. A shortfall is booked to DAMAGED stock at the destination with a PENDING write-off for verification. Changes stock: `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `lines` | array of object | Yes | at least 1 item |
| `lines[].lineId` | string (uuid) | Yes |  |
| `lines[].receivedQty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].receivedSerials` | array of string |  | Serial-tracked lines with a shortage: the serials that arrived |
| `notes` | string or null |  | max 500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Receive a transfer with a shortage  (as Store Manager (Warehouse B))**

> Destination warehouse in scope + inventory CREATE. A shortfall goes to DAMAGED stock at B with a PENDING write-off (shortageEntry). Serial lines with a shortage: send receivedSerials.

*Request*

```http
POST /api/v1/stock-entries/85c0568d-0fa2-4f3f-b9f3-a500cd3cb23a/receive
Authorization: Bearer <accessToken>
Idempotency-Key: b476db11-7765-4951-806b-f1a42c7daef3
Content-Type: application/json

{
  "lines": [
    {
      "lineId": "f594aefe-a7d5-486e-bc61-59451d708daa",
      "receivedQty": "3"
    },
    // … 2 more
  ],
  "notes": "One LG unit missing from the truck."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "entry": {
      "id": "85c0568d-0fa2-4f3f-b9f3-a500cd3cb23a",
      "number": "TRF-2627-0001",
      "draftRef": "DRAFT-5A7E3053DD",
      "displayNumber": "TRF-2627-0001",
      "type": "TRANSFER",
      "typeLabel": "Transfer between warehouses",
      "direction": "MOVE",
      "status": "RECEIVED",
      "entryDate": "2026-11-05",
      "warehouse": {
        "id": "2ec58960-a6ac-4429-b613-7eeda826ef96",
        "code": "A",
        "name": "Warehouse A"
      },
      "toWarehouse": {
        "id": "e82160d8-bbeb-4705-bf5c-ba3e7829bc9d",
        "code": "B",
        "name": "Warehouse B"
      },
      "supplier": null,
      "customer": null,
      "project": null,
      "originalEntry": null,
      "reversalOf": null,
      "reversedBy": null,
      "relatedEntry": null,
      "relatedEntries": [
        {
          "id": "fa5f1440-7be9-4a86-bf02-5667927ccd73",
          "number": "DMG-2627-0003",
          "type": "DAMAGE_WRITE_OFF",
          "status": "PENDING"
        }
      ],
      "purchaseOrder": null,
      "references": {
        "poNumberText": null,
        "supplierInvoiceNo": null,
        "lcNo": null,
        "billOfEntryNo": null,
        "challanNo": "TC-A-1105-01",
        "siteAddress": null,
        "receivedBy": null,
        "vehicle": "Dhaka Metro-Ta 11-2233",
        "reason": null,
        "description": null,
        "customerPhone": null,
        "customerAddress": null
      },
      "notes": "For the Uttara showroom job.\nReceipt: One LG unit missing from the truck.",
      "currency": "BDT",
      "exchangeRate": "1.0000",
      "discountAmount": "0.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "belowCostConfirmed": false,
      "itemCount": 3,
      "totalQty": "35.000",
      "lines": [
        {
          "id": "f594aefe-a7d5-486e-bc61-59451d708daa",
          "lineNo": 1,
          "product": {
            "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
            "code": "LG-S4-Q18KL3AA",
            "name": "LG Dual Inverter split AC 1.5 Ton",
            "unitCode": "set",
            "trackSerial": false
          },
          "qty": "4.000",
          "condition": "GOOD",
          "originalLineId": null,
          "receivedQty": "3.000",
          "adjustDirection": null,
          "purchaseOrderLineId": null,
          "note": null,
          "serials": []
        },
        // … 2 more
      ],
      "charges": [],
      "attachmentCount": 0,
      "createdBy": {
        "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
        "name": "Aminul Haque"
      },
      "verifiedBy": null,
      "receivedByUser": {
        "id": "3240fbfd-102c-4f16-b978-d47e54f47ced",
        "name": "Shafiqul Islam"
      },
      "rejectionReason": null,
      "reversalReason": null,
      "submittedAt": null,
      "verifiedAt": null,
      "postedAt": "2026-11-05T08:12:37.930Z",
      "dispatchedAt": "2026-11-05T08:12:37.930Z",
      "receivedAt": "2026-11-05T08:12:38.151Z",
      "cancelledAt": null,
      "reversedAt": null,
      "createdAt": "2026-11-05T08:12:37.793Z",
      "updatedAt": "2026-11-05T08:12:38.152Z",
      "timeline": [
        {
          "event": "CREATED",
          "at": "2026-11-05T08:12:37.793Z",
          "by": "Aminul Haque"
        },
        // … 2 more
      ],
      "actions": {
        "edit": false,
        "submit": false,
        "post": false,
        "approve": false,
        "reject": false,
        "cancel": false,
        "reverse": false,
        "receive": false,
        "editLandedCost": false,
        "waitingForOtherApprover": false,
        "editImportDocs": false
      }
    },
    "shortageEntry": {
      "id": "fa5f1440-7be9-4a86-bf02-5667927ccd73",
      "number": "DMG-2627-0003",
      "draftRef": "DRAFT-594A5395F7",
      "displayNumber": "DMG-2627-0003",
      "type": "DAMAGE_WRITE_OFF",
      "typeLabel": "Damage / loss write-off",
      "direction": "OUT",
      "status": "PENDING",
      "entryDate": "2026-11-05",
      "warehouse": {
        "id": "e82160d8-bbeb-4705-bf5c-ba3e7829bc9d",
        "code": "B",
        "name": "Warehouse B"
      },
      "toWarehouse": null,
      "supplier": null,
      "customer": null,
      "project": null,
      "originalEntry": null,
      "reversalOf": null,
      "reversedBy": null,
      "relatedEntry": {
        "id": "85c0568d-0fa2-4f3f-b9f3-a500cd3cb23a",
        "number": "TRF-2627-0001",
        "type": "TRANSFER"
      },
      "relatedEntries": [],
      "purchaseOrder": null,
      "references": {
        "poNumberText": null,
        "supplierInvoiceNo": null,
        "lcNo": null,
        "billOfEntryNo": null,
        "challanNo": "TRF-2627-0001",
        "siteAddress": null,
        "receivedBy": null,
        "vehicle": "Dhaka Metro-Ta 11-2233",
        "reason": "Transfer shortage",
        "description": "Shortage on receipt of transfer TRF-2627-0001 from Warehouse A.",
        "customerPhone": null,
        "customerAddress": null
      },
      "notes": null,
      "currency": "BDT",
      "exchangeRate": "1.0000",
      "discountAmount": "0.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "belowCostConfirmed": false,
      "itemCount": 1,
      "totalQty": "1.000",
      "lines": [
        {
          "id": "399fc95a-789a-4fb8-859a-61fd07755ede",
          "lineNo": 1,
          "product": {
            "id": "2f83c5fa-45a9-453b-a75a-83d904e7f3df",
            "code": "LG-S4-Q18KL3AA",
            "name": "LG Dual Inverter split AC 1.5 Ton",
            "unitCode": "set",
            "trackSerial": false
          },
          "qty": "1.000",
          "condition": "DAMAGED",
          "originalLineId": null,
          "receivedQty": null,
          "adjustDirection": null,
          "purchaseOrderLineId": null,
          "note": null,
          "serials": []
        }
      ],
      "charges": [],
      "attachmentCount": 0,
      "createdBy": {
        "id": "3240fbfd-102c-4f16-b978-d47e54f47ced",
        "name": "Shafiqul Islam"
      },
      "verifiedBy": null,
      "receivedByUser": null,
      "rejectionReason": null,
      "reversalReason": null,
      "submittedAt": "2026-11-05T08:12:38.189Z",
      "verifiedAt": null,
      "postedAt": null,
      "dispatchedAt": null,
      "receivedAt": null,
      "cancelledAt": null,
      "reversedAt": null,
      "createdAt": "2026-11-05T08:12:38.160Z",
      "updatedAt": "2026-11-05T08:12:38.194Z",
      "timeline": [
        {
          "event": "CREATED",
          "at": "2026-11-05T08:12:38.160Z",
          "by": "Shafiqul Islam"
        },
        // … 1 more
      ],
      "actions": {
        "edit": false,
        "submit": false,
        "post": false,
        "approve": false,
        "reject": false,
        "cancel": true,
        "reverse": false,
        "receive": false,
        "editLandedCost": false,
        "waitingForOtherApprover": true,
        "editImportDocs": false
      }
    }
  }
}
```

#### PUT /stock-entries/{id}/landed-cost — Set landed-cost charges / customs rate of a pending import GRN

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ APPROVE **and** the `seeCost` flag (warehouse in scope) |

Only for PENDING `GRN_IMPORT` entries, before approval: replaces the charges, optionally sets `exchangeRate`, recomputes costs. Audit-logged (`stock_entry.landed_cost`).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `exchangeRate` | string |  | Customs rate (BDT per unit of the GRN currency) |
| `charges` | array of object | Yes | Replaces all landed-cost charges · at most 20 items |
| `charges[].type` | CUSTOMS_DUTY \| AIT \| IMPORT_VAT \| FREIGHT \| INSURANCE \| CNF \| OTHER | Yes |  |
| `charges[].mode` | PERCENT_OF_GOODS \| AMOUNT_BDT | Yes |  |
| `charges[].value` | string | Yes |  |
| `charges[].includeInCost` | boolean |  | default true |
| `charges[].label` | string or null |  | max 100 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Set landed-cost charges and the customs rate  (as Manager (Warehouses A + B))**

> PENDING import GRN only; inventory APPROVE + seeCost. Replaces all charges. includeInCost=false charges (adjustable VAT / AIT) are shown in grandTotal only.

*Request*

```http
PUT /api/v1/stock-entries/1f736630-6ecf-4050-8e73-d612d3fc3e29/landed-cost
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "exchangeRate": "26.45",
  "charges": [
    {
      "type": "CUSTOMS_DUTY",
      "mode": "PERCENT_OF_GOODS",
      "value": "10",
      "includeInCost": true,
      "label": "CD 10 %"
    },
    // … 2 more
  ]
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-entries/{id}/post */ }
}
```

#### PATCH /stock-entries/{id}/import-shipment — Edit the import document details of a GRN (Imported)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Mobile screens** | S-14 |

GRN (Imported) only (400 otherwise). The creator while DRAFT / PENDING / REJECTED, a verifier (APPROVE, warehouse in scope) on a PENDING entry, inventory FULL at any time (also after posting). Replaces all document fields. `ciValue` needs seeCost (kept otherwise). Audit-logged with before / after; never changes stock or costs.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `blNo` | string or null |  | max 100 chars |
| `blDate` | string or null |  |  |
| `shippingLine` | string or null |  | max 150 chars |
| `vesselVoyage` | string or null |  | max 150 chars |
| `portOfLoading` | string or null |  | max 150 chars |
| `portOfDischarge` | string or null |  | max 150 chars |
| `containerNumbers` | array of string |  | Container numbers (stored upper-case) · at most 100 items |
| `coNo` | string or null |  | max 100 chars |
| `coDate` | string or null |  |  |
| `countryOfOrigin` | string or null |  | max 100 chars |
| `coIssuingAuthority` | string or null |  | max 150 chars |
| `plNo` | string or null |  | max 100 chars |
| `plDate` | string or null |  |  |
| `packageCount` | integer or null |  | min 0, max 1000000 |
| `grossWeightKg` | string |  |  |
| `netWeightKg` | string |  |  |
| `ciNo` | string or null |  | max 100 chars |
| `ciDate` | string or null |  |  |
| `ciCurrency` | BDT \| USD \| EUR \| CNY \| MYR \| THB or null |  |  |
| `ciValue` | string |  | Invoice value in the CI currency. Hidden without seeCost; users without seeCost can't set it. |
| `incoterm` | EXW \| FOB \| CFR \| CIF \| OTHER |  |  |
| `boeNo` | string or null |  | max 100 chars |
| `boeDate` | string or null |  |  |
| `customsStation` | string or null |  | max 150 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Correct document details after posting (Admin)  (as Admin)**

> Send ALL document fields: omitted fields are cleared. After posting only inventory FULL may edit.

*Request*

```http
PATCH /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/import-shipment
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "blNo": "MAEU-240915377",
  "blDate": "2026-10-08",
  "shippingLine": "Maersk",
  "vesselVoyage": "MAERSK KOWLOON / 444W",
  "portOfLoading": "Laem Chabang, Thailand",
  "portOfDischarge": "Chattogram",
  "containerNumbers": [
    "MSKU 7781234"
  ],
  "coNo": "TH-CO-2026-118734",
  "coDate": "2026-10-06",
  "countryOfOrigin": "Thailand",
  "coIssuingAuthority": "The Thai Chamber of Commerce",
  "plNo": "DKT-PL-26-0915",
  "plDate": "2026-10-06",
  "packageCount": 12,
  "grossWeightKg": "212.400",
  "netWeightKg": "176.000",
  "ciNo": "DKT-CI-26-0915",
  "ciDate": "2026-10-05",
  "ciCurrency": "USD",
  "ciValue": "8700.00",
  "incoterm": "CIF",
  "boeNo": "C-2026-0042",
  "boeDate": "2026-10-27",
  "customsStation": "Chattogram Custom House"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /stock-entries/{id} */ }
}
```

*More examples in the full reference:* Verifier completes the shipment documents of a pending GRN  (as Manager (Warehouses A + B))

#### GET /stock-entries/{id}/attachments — List an entry's attachments

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

Filter `docType` (BL, CO, PL, CI, BOE, OTHER).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `docType` | BL \| CO \| PL \| CI \| BOE \| OTHER |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: List an entry's files  (as Admin)**

*Request*

```http
GET /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "acdeb92d-085a-4deb-a1ad-95febe8028df",
      "fileName": "MAEU-240915377-BL.pdf",
      "mimeType": "application/pdf",
      "size": 94,
      "label": null,
      "docType": "BL",
      "uploadedBy": {
        "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
        "name": "Aminul Haque"
      },
      "createdAt": "2026-11-05T08:12:33.880Z",
      "uploadedAt": "2026-11-05T08:12:33.880Z",
      "url": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df",
      "downloadUrl": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df/download",
      "thumbnailUrl": null
    },
    // … 2 more
  ]
}
```

*More examples in the full reference:* List files of one document type (?docType=BOE)  (as Store Manager (Warehouse A))

#### POST /stock-entries/{id}/attachments — Upload attachments or import document files

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Mobile screens** | S-14, S-15 |

multipart/form-data. Field `file` (repeatable; `files` also accepted), optional `label` and `docType`. Works with the bearer token (mobile apps, e.g. a phone photo).

**Without docType** (ordinary attachments): PDF, JPG, PNG or WebP detected from content; ≤ 10 MB each, ≤ 20 per entry.

**With docType** (GRN Imported only, 400 otherwise): PDF, JPG or PNG detected from the content (magic bytes, not the name); ≤ 10 MB each; ≤ 10 files per document type. File names are sanitised; files are stored privately under imports/{entryId}/{docType}/. Images get a thumbnail. Allowed: the creator while DRAFT / PENDING / REJECTED, a verifier on a PENDING entry, inventory FULL at any time. Audit-logged.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | array of file | Yes |  |
| `label` | string |  |  |
| `docType` | BL \| CO \| PL \| CI \| BOE \| OTHER |  |  |

**Responses:** 201 Uploaded · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Upload import document: Bill of Lading scan (PDF)  (as Admin)**

> multipart/form-data: file (repeatable) + docType = BL | CO | PL | CI | BOE | OTHER. PDF / JPG / PNG, ≤ 10 MB, checked by content.

*Request*

```http
POST /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file = <file MAEU-240915377-BL.pdf, application/pdf, 94 bytes>
docType = BL
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": [
    {
      "id": "acdeb92d-085a-4deb-a1ad-95febe8028df",
      "fileName": "MAEU-240915377-BL.pdf",
      "mimeType": "application/pdf",
      "size": 94,
      "label": null,
      "docType": "BL",
      "uploadedBy": {
        "id": "6ae4eae8-7855-42a6-98ae-de7f799f9f6e",
        "name": "Aminul Haque"
      },
      "createdAt": "2026-11-05T08:12:33.880Z",
      "uploadedAt": "2026-11-05T08:12:33.880Z",
      "url": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df",
      "downloadUrl": "/api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df/download",
      "thumbnailUrl": null
    }
  ]
}
```

*More examples in the full reference:* Upload import document: phone photo of the Bill of Entry  (as Admin) · Upload an ordinary attachment (photo, no docType)  (as Store Manager (Warehouse A)) · Error: file type checked by content (renamed .exe)  (as Admin)

#### GET /stock-entries/{id}/attachments/{attachmentId} — Download an attachment

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 200 The file · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: View a file inline  (as Store Manager (Warehouse A))**

> Binary response (Content-Disposition: inline). Same as …/download?inline=1.

*Request*

```http
GET /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="MAEU-240915377-BL.pdf"

<binary file: 94 bytes>
```

#### GET /stock-entries/{id}/attachments/{attachmentId}/download — Download or view an attachment

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

Only entries in the caller's warehouses are visible (403 otherwise). Streamed through this authenticated route (never a public link). `?inline=1` to view in the browser, `?variant=thumb` for an image's thumbnail.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `inline` | 1 |  |
| `variant` | thumb |  |

**Responses:** 200 The file (PDF, JPG, PNG; thumbnails are WebP) · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Download a file  (as Store Manager (Warehouse A))**

> Binary, Content-Disposition: attachment. ?inline=1 to view in place.

*Request*

```http
GET /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/acdeb92d-085a-4deb-a1ad-95febe8028df/download
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="MAEU-240915377-BL.pdf"

<binary file: 94 bytes>
```

*More examples in the full reference:* Thumbnail of an image (?variant=thumb)  (as Store Manager (Warehouse A))

#### DELETE /stock-entries/{id}/attachments/{attachmentId} — Remove an attachment

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |

Import document files: the uploader while the entry is not posted; inventory FULL at any time, and a `reason` (JSON body or ?reason=) is required once the entry is posted. Audit-logged.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string |  | 3–500 chars |

**Responses:** 204 Removed · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Remove a file (posted entry, with reason)  (as Admin)**

> 204, no body. Reason as JSON body or ?reason=. Before posting the uploader can remove their own file without a reason.

*Request*

```http
DELETE /api/v1/stock-entries/75a127bd-aaa6-44b7-9bb7-4791c4db484e/attachments/9b4dfb9d-5b79-48c3-b1ee-9f3dba6d2958
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reason": "Duplicate scan of the commercial invoice"
}
```

*Response*

```http
HTTP 204 No Content
```

*More examples in the full reference:* Error: removing a file from a posted entry needs a reason  (as Admin)

#### POST /stock-entries/{id}/documents — Queue a printable PDF

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

GRN, challan, invoice, return/write-off/transfer/reversal note. Rendered by the worker; poll the returned job. Cost columns follow the caller's seeCost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `kind` | GRN \| DELIVERY_CHALLAN \| SALES_INVOICE \| RETURN_NOTE \| WRITE_OFF_NOTE \| TRANSFER_CHALLAN \| REVERSAL_NOTE \| ADJUSTMENT_NOTE |  | Defaults by entry type (a sale can also print a delivery challan) |

**Responses:** 202 Queued · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Queue a sales invoice PDF  (as Admin)**

> 202 Accepted. kind defaults by type (sale → SALES_INVOICE). The worker renders it; poll GET /documents/{jobId}.

*Request*

```http
POST /api/v1/stock-entries/3b3f54f0-8be6-4b43-b60c-9e64cb8b4157/documents
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/documents/b34156a6-33d3-456b-9689-3b9981d53267

{
  "data": {
    "jobId": "b34156a6-33d3-456b-9689-3b9981d53267",
    "kind": "SALES_INVOICE",
    "status": "queued"
  }
}
```

*More examples in the full reference:* Queue a delivery challan for the same sale (kind)  (as Store Manager (Warehouse A))

#### GET /documents/{jobId} — Document job status, or the PDF with ?download=1

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |

Only the user who requested it.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `jobId` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `download` | 1 |  |

**Responses:** 200 Job status (JSON) or the PDF · 401 Not authenticated, or token expired / revoked · 404 Not found · 422 Business rule violated

**Example: Document status: queued  (as Admin)**

> status: queued | processing | completed | failed. Only the requester can see the job.

*Request*

```http
GET /api/v1/documents/b34156a6-33d3-456b-9689-3b9981d53267
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "jobId": "b34156a6-33d3-456b-9689-3b9981d53267",
    "kind": "SALES_INVOICE",
    "entryId": "3b3f54f0-8be6-4b43-b60c-9e64cb8b4157",
    "status": "queued",
    "fileName": null,
    "downloadUrl": null,
    "failedReason": null
  }
}
```

*More examples in the full reference:* Document status: completed (with downloadUrl)  (as Admin) · Download the PDF (?download=1)  (as Admin)

## 9. Stock counts

Screens: S-19 Count list, S-20 Counting screen, S-21 Count review. Flow: create (`DRAFT`) → start (`COUNTING`, lines are created for the scope) → count lines → submit (`SUBMITTED`) → an approver reviews the variance → request a recount of some lines (back to counting for those lines) or approve (`APPROVED`: gains and losses are posted as an adjustment). Cancel is possible before approval.

- **Blind counts** hide the system quantity and variance from counters; only approvers see them (`GET /stock-counts/{id}/variance`).
- Serial-tracked lines are counted by scanning serials (`serials` on the line), the counted quantity is the number of serials.
- Start / submit / approve / recount / cancel need an `Idempotency-Key`. Counting a line (PUT) and editing a draft (PATCH) don't.
- **Use the `actions` object** on every count response (`edit`, `start`, `count`, `submit`, `approve`, `requestRecount`, `cancel`, `printSheet`): it is worked out for the caller, so show exactly those buttons.
- Blind counts, field by field: counters get `systemVisible: false`, no `systemQty` / `variance` keys, serials without a result and no missing serials; `GET …/variance` returns `lines: []` for them. Approvers of the warehouse always see everything; everyone does once the count is approved or cancelled. Money (`varianceValue`, `gainValue`, `lossValue`, `netValue`) needs `seeCost`.
- Lines can be counted only while the count is `COUNTING`; counting a line clears its `recountRequested`. Submit's body is optional; `{"markUncountedAsZero": true}` counts every remaining line as 0.
- The count's `updatedAt` doesn't change when lines are counted: use `lines[].countedAt` to detect changes. The count sheet (`GET …/sheet`) is a PDF job: it returns 202 and you poll `GET /documents/{jobId}`.

#### GET /stock-counts — List stock counts

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-19, S-18 |

Own warehouses. Filters: status, warehouseId, active.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: createdAt, number, startedAt · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `status` | DRAFT \| COUNTING \| SUBMITTED \| APPROVED \| CANCELLED or null |  |
| `warehouseId` | string (uuid) or null |  |
| `active` | boolean | COUNTING or SUBMITTED only |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Active counts in Warehouse A  (as Store Manager)**

> active=true → COUNTING or SUBMITTED only.

*Request*

```http
GET /api/v1/stock-counts?warehouseId=582d9a1b-24ca-4c79-b38f-4e6560e0d0f5&active=true&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "ace3de67-2fce-405d-9599-76e3bcb66e8f",
      "number": "SC-2627-0001",
      "warehouse": {
        "id": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
        "code": "A",
        "name": "Warehouse A"
      },
      "scope": "SELECTED_PRODUCTS",
      "blindCount": true,
      "status": "COUNTING",
      "createdBy": {
        "id": "ea476101-50d2-4822-848c-8731da082410",
        "name": "Rahim Uddin"
      },
      "startedAt": "2026-11-05T08:06:30.708Z",
      "submittedAt": null,
      "approvedAt": null,
      "createdAt": "2026-11-05T08:06:30.585Z",
      "progress": {
        "total": 4,
        "counted": 3
      },
      "adjustmentEntry": null
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 1,
    "totalPages": 1
  }
}
```

*More examples in the full reference:* List counts (newest first, page 1)  (as Manager) · Filter: approved counts in Warehouse A  (as Manager)

#### POST /stock-counts — Create a stock count (DRAFT)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Optional (header) — recommended |

Lines come from the scope: ALL / CATALOG / CATEGORY (active products plus anything in stock) or SELECTED_PRODUCTS. Number SC-{FY}-0001.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `warehouseId` | string (uuid) | Yes |  |
| `scope` | ALL \| CATALOG \| CATEGORY \| SELECTED_PRODUCTS | Yes |  |
| `scopeIds` | array of string (uuid) |  | Catalog, category or product ids (not for ALL) · at most 5000 items |
| `blindCount` | boolean |  | Counters can't see the system quantity |
| `notes` | string or null |  | max 1000 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 422 Business rule violated

**Example: Create a blind count (DRAFT)  (as Store Manager)**

> Idempotency-Key optional here. Scope: ALL, CATALOG, CATEGORY or SELECTED_PRODUCTS (scopeIds = catalog / category / product ids). Nothing is frozen while DRAFT.

*Request*

```http
POST /api/v1/stock-counts
Authorization: Bearer <accessToken>
Idempotency-Key: 77a01f15-183c-44be-9ee3-0b7b9459188e
Content-Type: application/json

{
  "warehouseId": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
  "scope": "SELECTED_PRODUCTS",
  "scopeIds": [
    "360cbe9b-22b4-443f-ac86-ea05dfca8bc4",
    // … 1 more
  ],
  "blindCount": true,
  "notes": "Quarterly blind count"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "ace3de67-2fce-405d-9599-76e3bcb66e8f",
    "number": "SC-2627-0001",
    "warehouse": {
      "id": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
      "code": "A",
      "name": "Warehouse A"
    },
    "scope": "SELECTED_PRODUCTS",
    "scopeIds": [
      "360cbe9b-22b4-443f-ac86-ea05dfca8bc4",
      // … 1 more
    ],
    "blindCount": true,
    "systemVisible": false,
    "status": "DRAFT",
    "notes": "Quarterly blind count",
    "createdBy": {
      "id": "ea476101-50d2-4822-848c-8731da082410",
      "name": "Rahim Uddin"
    },
    "submittedBy": null,
    "approvedBy": null,
    "adjustmentEntry": null,
    "startedAt": null,
    "submittedAt": null,
    "approvedAt": null,
    "cancelledAt": null,
    "recountRequestedAt": null,
    "createdAt": "2026-11-05T08:06:30.585Z",
    "updatedAt": "2026-11-05T08:06:30.585Z",
    "progress": {
      "total": 2,
      "counted": 0,
      "recount": 0
    },
    "lines": [
      {
        "id": "85b363f7-e3bc-4f68-88dc-d298b2ac7709",
        "product": {
          "id": "162c619d-57b3-4af8-a7ac-f3df08ebea06",
          "code": "DK-FXFQ63AVM",
          "name": "Daikin VRV ceiling cassette 7.1 kW",
          "unitCode": "pcs",
          "barcode": null,
          "model": "FXFQ63AVM",
          "trackSerial": true
        },
        "condition": "GOOD",
        "countedQty": null,
        "notCounted": false,
        "countedBy": null,
        "countedAt": null,
        "recountRequested": false,
        "note": null,
        "serials": []
      },
      // … 1 more
    ],
    "actions": {
      "edit": true,
      "start": true,
      "count": false,
      "submit": false,
      "approve": false,
      "requestRecount": false,
      "cancel": true,
      "printSheet": true
    }
  }
}
```

*More examples in the full reference:* Error: no products chosen for the scope  (as Store Manager)

#### GET /stock-counts/{id} — Get a stock count

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

Blind counts hide system qty, variance and expected serials from non-approvers.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a draft count  (as Store Manager)**

> 'actions' tells the app which buttons to show for this caller. Blind count + counter: no systemQty / variance fields at all (in a normal count systemQty is null until start).

*Request*

```http
GET /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

*More examples in the full reference:* Blind count as seen by the counter  (as Store Manager (counter)) · Same count as seen by the approver  (as Manager (approver)) · Counter view after approval (system qty visible)  (as Store Manager (counter)) · Normal count: counters see system qty  (as Store Manager (counter))

#### PATCH /stock-counts/{id} — Edit a draft count

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |

Creator or FULL; DRAFT only. Changing the scope rebuilds the lines.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `scope` | ALL \| CATALOG \| CATEGORY \| SELECTED_PRODUCTS |  |  |
| `scopeIds` | array of string (uuid) |  | at most 5000 items |
| `blindCount` | boolean |  |  |
| `notes` | string or null |  | max 1000 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Edit a draft: add copper pipe to the scope  (as Store Manager)**

> DRAFT only; creator or inventory FULL. scopeIds replaces the whole list (lines are rebuilt).

*Request*

```http
PATCH /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "scopeIds": [
    "360cbe9b-22b4-443f-ac86-ea05dfca8bc4",
    // … 2 more
  ],
  "notes": "Quarterly blind count: racks 1-4 (split ACs, VRV cassettes, copper pipe)"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

#### POST /stock-counts/{id}/start — Start counting (snapshot + freeze)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |

`Idempotency-Key` header required. Snapshots on-hand quantities. While COUNTING or SUBMITTED, postings that touch the counted products in this warehouse get 422 COUNT_IN_PROGRESS.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Start counting (snapshot + freeze)  (as Store Manager)**

> Snapshots system quantities and freezes these products in Warehouse A (postings get 422 COUNT_IN_PROGRESS). A DAMAGED line is added where damaged stock exists. Blind: the counter's response has no systemQty / variance.

*Request*

```http
POST /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/start
Authorization: Bearer <accessToken>
Idempotency-Key: e900ed67-b708-4e57-8fce-386681ed6096
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

*More examples in the full reference:* Error: Idempotency-Key header missing  (as Store Manager)

#### PUT /stock-counts/{id}/lines/{lineId} — Record a counted line

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Mobile screens** | S-20 |

COUNTING only. Tracked products: send the serials found (counted qty = serials); expected-but-not-found → MISSING, found-but-not-expected → UNEXPECTED. Records who counted.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `lineId` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `countedQty` | string |  | Untracked products. Tracked products: the number of serials |
| `serials` | array of string |  | Tracked products: the serials found · at most 2000 items |
| `notCounted` | boolean |  | Mark "not counted = 0" |
| `note` | string or null |  | max 500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Count a line (quantity)  (as Store Manager)**

> Returns the whole count. A line can be updated until the count is submitted; countedBy records who counted it.

*Request*

```http
PUT /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/lines/1d94c3d5-b241-4043-a221-a59c8ceda34f
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "countedQty": "23",
  "note": "Racks 1-2"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

*More examples in the full reference:* Count a serial-tracked line (scan serials)  (as Store Manager) · A second counter counts copper pipe (decimal qty)  (as Store Manager (2nd counter)) · Recount a flagged line  (as Store Manager) · Error: counting a line of a submitted count  (as Store Manager)

#### POST /stock-counts/{id}/submit — Submit for approval

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |

`Idempotency-Key` header required. Every line needs a counted qty, or send markUncountedAsZero. Recount lines must be counted again first.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `markUncountedAsZero` | boolean |  | Mark every line without a count as "not counted = 0" |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Submit, marking uncounted lines as 0  (as Store Manager)**

> The uncounted DAMAGED line becomes countedQty 0 with notCounted: true. Approvers of the warehouse are notified.

*Request*

```http
POST /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/submit
Authorization: Bearer <accessToken>
Idempotency-Key: 436cd3fd-1474-4a17-95ef-f1445bf5c0c6
Content-Type: application/json

{
  "markUncountedAsZero": true
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

*More examples in the full reference:* Submit again after the recount (no body)  (as Store Manager) · Error: lines not counted yet  (as Store Manager) · Error: recount not done yet  (as Store Manager)

#### GET /stock-counts/{id}/variance — Variance summary

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-21 |

Lines with a difference, largest value first; gain / loss quantities. Values (`varianceValue`, `gainValue`, `lossValue`, `netValue`, `totalValue`) are removed without `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Variance as the counter (blind: hidden)  (as Store Manager (counter))**

> Blind counts hide the variance from counters until approval.

*Request*

```http
GET /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/variance
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "countId": "ace3de67-2fce-405d-9599-76e3bcb66e8f",
    "number": "SC-2627-0001",
    "status": "SUBMITTED",
    "systemVisible": false,
    "progress": {
      "total": 4,
      "counted": 4
    },
    "totals": {
      "linesWithVariance": null
    },
    "lines": []
  }
}
```

*More examples in the full reference:* Variance for the approver (with values)  (as Manager (approver)) · Variance for a role without seeCost (no values)  (as Store Manager)

#### POST /stock-counts/{id}/request-recount — Request a recount of chosen lines

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ APPROVE (warehouse in scope, not the person who submitted) |
| **Idempotency-Key** | Required (header) |

`Idempotency-Key` header required. Back to COUNTING with the lines flagged.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `lineIds` | array of string (uuid) | Yes | at least 1 item, at most 5000 items |
| `note` | string or null |  | max 500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Request a recount of one line  (as Manager (approver))**

> Back to COUNTING; chosen lines get recountRequested: true until counted again. The creator and counters are notified. (note is accepted but currently not stored or returned.)

*Request*

```http
POST /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/request-recount
Authorization: Bearer <accessToken>
Idempotency-Key: 4223b48a-34a6-470a-b624-ff9faeb56df3
Content-Type: application/json

{
  "lineIds": [
    "1d94c3d5-b241-4043-a221-a59c8ceda34f"
  ],
  "note": "1 set short: please recheck rack 2"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

#### POST /stock-counts/{id}/approve — Approve and post the adjustment

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ APPROVE (warehouse in scope, not the person who submitted) |
| **Idempotency-Key** | Required (header) |

`Idempotency-Key` header required. Posts one STOCK_ADJUSTMENT (gains at average cost, losses removed at average cost; MISSING serials written off, UNEXPECTED ones into stock) and unfreezes. No variance → no entry.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Approve: posts the stock adjustment  (as Manager (approver))**

> No body. Posts one STOCK_ADJUSTMENT (ADJ-…) for the differences at average cost; MISSING serials are written off, UNEXPECTED ones added to stock; products are unfrozen. Zero variance → adjustmentEntry: null.

*Request*

```http
POST /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/approve
Authorization: Bearer <accessToken>
Idempotency-Key: cadd57fa-fedb-4856-a9d3-790f459cc74d
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

*More examples in the full reference:* Error: Store Manager can't approve  (as Store Manager)

#### POST /stock-counts/{id}/cancel — Cancel a count

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE |
| **Idempotency-Key** | Required (header) |

`Idempotency-Key` header required. Creator or FULL, before approval. Unfreezes; no stock change.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Cancel a count in progress  (as Store Manager (creator))**

> No body. Creator or inventory FULL, any time before approval. Unfreezes the products; no stock change.

*Request*

```http
POST /api/v1/stock-counts/992dfb36-2ed6-4e2a-908f-19d960f47843/cancel
Authorization: Bearer <accessToken>
Idempotency-Key: 8e4a0b64-01f5-4cb1-9a4e-2572d09331c9
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in POST /stock-counts */ }
}
```

#### GET /stock-counts/{id}/sheet — Queue a printable count sheet (PDF)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

Rendered by the worker; poll GET /documents/{jobId}. Blind counts print without system qty for counters.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 202 Queued · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Queue a printable count sheet (PDF)  (as Store Manager)**

> 202: rendered by the worker. Poll GET /documents/{jobId} (Location header), then download with ?download=1. Blind counts print without system qty for counters.

*Request*

```http
GET /api/v1/stock-counts/ace3de67-2fce-405d-9599-76e3bcb66e8f/sheet
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/documents/d2a111a7-c7e0-4f3d-a9ee-f8ea88e6ce19

{
  "data": {
    "jobId": "d2a111a7-c7e0-4f3d-a9ee-f8ea88e6ce19",
    "kind": "COUNT_SHEET",
    "status": "queued"
  }
}
```

## 10. Low stock and alerts

Screen S-10. A product is low when its total available GOOD stock (all warehouses) is below its minimum level. The list shows how much it is short by and a suggested order quantity (2 × minimum − available). Purchasing users can turn a selection into draft purchase orders (`POST /purchase-orders/from-low-stock`, chapter 11).

#### GET /stock/low-stock — Products below their minimum

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-10 |

Available = GOOD on hand − reserved. Totals are company-wide (or one warehouse with warehouseId); per-warehouse columns for the caller's warehouses. Sort by shortBy (default), code, name.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: shortBy, code, name · e.g. -shortBy |
| `q` | string | Free-text search · max 200 chars |
| `catalogId` | string (uuid) or null |  |
| `categoryId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null | Use only this warehouse's available quantity |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Products below their minimum  (as Manager)**

> Available = on hand − reserved (GOOD stock). totalAvailable is company-wide; suggestedQty = 2 × minimum − available. Default sort: -shortBy.

*Request*

```http
GET /api/v1/stock/low-stock?pageSize=2
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "product": {
        "id": "dfce0998-4f93-44ed-82da-d95741d2e82f",
        "code": "CU-PIPE-14",
        "name": "Copper pipe 1/4\" (6.35 mm) soft-drawn",
        "unitCode": "m",
        "catalogName": "Local supply",
        "categoryName": "Piping"
      },
      "warehouses": [
        {
          "warehouseId": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
          "code": "A",
          "available": "296.500"
        },
        // … 1 more
      ],
      "totalAvailable": "416.500",
      "minStockLevel": "500.000",
      "shortBy": "83.500",
      "suggestedQty": "583.500"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 3,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Filter: LG products, Warehouse B only  (as Manager)

#### GET /stock/low-stock/export — Low-stock list as Excel

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile app** | Not used (web / admin only) |

Same filters as the list.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: shortBy, code, name · e.g. -shortBy |
| `q` | string | Free-text search · max 200 chars |
| `catalogId` | string (uuid) or null |  |
| `categoryId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null | Use only this warehouse's available quantity |

**Responses:** 200 Workbook · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Export the low-stock list to Excel  (as Manager)**

> Same filters as the list (all matching rows, no paging).

*Request*

```http
GET /api/v1/stock/low-stock/export?categoryId=1d77b4cf-16f8-4904-bf20-5656a3cce894
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="low-stock-2026-11-05.xlsx"

<binary file: 7,024 bytes>
```

#### GET /alert-settings — Low-stock alert settings

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

Recipient roles and the daily digest (default 09:00 Asia/Dhaka).

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Low-stock alert settings  (as Admin)**

> Inventory FULL. roles = all roles, to pick recipients from.

*Request*

```http
GET /api/v1/alert-settings
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "lowStockRoleIds": [
      "a73a1d74-8665-47e7-93cf-9048d251ebd7",
      // … 1 more
    ],
    "digestEnabled": true,
    "digestTime": "09:00",
    "roles": [
      {
        "id": "210e7883-2bfd-42df-ade6-8202e35fc24b",
        "name": "Accounts"
      },
      // … 2 more
    ]
  }
}
```

#### PATCH /alert-settings — Update alert settings

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

Reschedules the digest job. Audit-logged.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `lowStockRoleIds` | array of string (uuid) |  | at most 50 items |
| `digestEnabled` | boolean |  |  |
| `digestTime` | string |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Add Store Managers, move the digest to 08:30  (as Admin)**

> Send only the fields to change. digestTime is HH:mm (24-hour, Asia/Dhaka).

*Request*

```http
PATCH /api/v1/alert-settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "lowStockRoleIds": [
    "a73a1d74-8665-47e7-93cf-9048d251ebd7",
    // … 2 more
  ],
  "digestEnabled": true,
  "digestTime": "08:30"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "lowStockRoleIds": [
      "a73a1d74-8665-47e7-93cf-9048d251ebd7",
      // … 2 more
    ],
    "digestEnabled": true,
    "digestTime": "08:30",
    "roles": [
      {
        "id": "210e7883-2bfd-42df-ade6-8202e35fc24b",
        "name": "Accounts"
      },
      // … 2 more
    ]
  }
}
```

## 11. Purchase orders

Screens: S-24 Purchase orders, S-25 PO detail. Creating and amending POs is done on the website; the app lists them, shows details, approves / rejects, marks them sent, receives goods (opens the GRN form prefilled from `GET /purchase-orders/{id}/receivable`) and shares the PDF. Prices and totals need `seeCost`.

| Status | How it gets there | Next |
|---|---|---|
| `DRAFT` | Created with `action: "draft"`; number not yet given (`displayNumber` = draft ref) | edit, submit, cancel |
| `PENDING_APPROVAL` | submit (gets its number `PO-2627-0001`) | approve, reject |
| `REJECTED` | reject (with a reason) | edit and submit again (keeps its number), cancel |
| `APPROVED` | approve (purchasing APPROVE, not your own PO); or create with `action: "approve"` | mark sent, amend, receive, cancel |
| `SENT` | mark sent (optionally emails the supplier) | receive, amend |
| PARTLY_RECEIVED / FULLY_RECEIVED | set automatically by posted GRNs (a reversed GRN recalculates it) | close (only when partly received and no GRN is pending) |
| CLOSED / CANCELLED | close the rest / cancel while nothing is received or pending | — |

- **Use the `actions` object** on every PO (`approve`, `reject`, `markSent`, `receive`, `close`, `cancel`, `pdf`, …): it applies the same rules as the API for the current user, so show exactly those buttons.
- **Receiving (Store Manager):** a Store Manager has purchasing NONE, so `GET /purchase-orders` is 403 for them. Use `GET /purchase-orders/receivable` (POs that can be received in my warehouses) and `GET /purchase-orders/{id}/receivable` (remaining quantities) — they never return prices. Then create a GRN with `purchaseOrderId`; supplier, currency and prices come from the PO (prices the app sends are ignored). Receiving more than is due → 422 `OVER_RECEIPT` with `meta.remaining`.
- By default **Accounts can't approve POs** (purchasing VIEW); Admin and roles with purchasing APPROVE can, but never their own PO.
- Editing (PATCH) a PO replaces its lines with new line ids: always re-read the PO before amending.
- Prices, totals and the supplier price history need `seeCost` (price history is 403 without it).

#### GET /purchase-orders — List purchase orders

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |
| **Mobile screens** | S-24, S-18 |

Only POs delivering to the caller's warehouses are visible. Filters: status, supplierId, type, warehouseId, projectId, productId, `overdue=true` (expected date before today, Asia/Dhaka, and still approved / sent / partly received), dateFrom / dateTo (PO date), `q` (number, quotation ref, supplier). Unit prices, amounts and totals (`unitPrice`, `amount`, `subtotal`, `discountAmount`, `vatAmount`, `total`, `totalBdt`) are only returned with `seeCost`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: poDate, number, createdAt, expectedDeliveryDate, total · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `status` | DRAFT \| PENDING_APPROVAL \| REJECTED \| APPROVED \| SENT \| PARTLY_RECEIVED \| FULLY_RECEIVED \| CLOSED \| CANCELLED or null |  |
| `supplierId` | string (uuid) or null |  |
| `type` | LOCAL \| IMPORTED or null |  |
| `warehouseId` | string (uuid) or null |  |
| `projectId` | string (uuid) or null |  |
| `productId` | string (uuid) or null |  |
| `overdue` | boolean | Expected delivery before today and still approved / sent / partly received |
| `receivable` | boolean | Approved, sent or partly received |
| `dateFrom` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `dateTo` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List purchase orders (newest first)  (as Admin)**

> Default sort -createdAt. Only POs delivering to the caller's warehouses. `actions` says which buttons to show.

*Request*

```http
GET /api/v1/purchase-orders?pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "01db7bfb-dd7f-4e5b-a0d4-5558c714edf8",
      "number": "PO-2627-0004",
      "draftRef": "DRAFT-BFF9D1B334",
      "displayNumber": "PO-2627-0004",
      "type": "LOCAL",
      "status": "PENDING_APPROVAL",
      "statusLabel": "Pending approval",
      "revision": 0,
      "supplier": {
        "id": "6f159560-ed51-4b2f-ba94-0a31cb00f5be",
        "code": "SUP-001",
        "name": "LG Electronics Bangladesh",
        "type": "LOCAL",
        "email": "b2b@lg.example.com",
        "isActive": true
      },
      "currency": "BDT",
      "exchangeRate": "1.0000",
      "poDate": "2026-11-05",
      "expectedDeliveryDate": "2026-11-25",
      "overdue": false,
      "deliverTo": {
        "id": "7301d4df-5f35-4eb6-a22c-43c67be429f5",
        "code": "B",
        "name": "Warehouse B"
      },
      "project": null,
      "supplierQuoteRef": "LGEB/Q/2026/0431",
      "vatPercent": "15.00",
      "discountAmount": "0.00",
      "subtotal": "366000.00",
      "vatAmount": "54900.00",
      "total": "420900.00",
      "totalBdt": "420900.00",
      "terms": "1. Prices are fixed for this order.\n2. Deliver to the warehouse named above with a delivery challan quoting this PO number.\n3. Goods are subject to inspection on receipt; damaged units will be returned.\n4. Payment as per the agreed terms after receipt of goods and invoice.",
      "notes": null,
      "progress": {
        "orderedQty": "6.000",
        "receivedQty": "0.000",
        "pendingQty": "0.000",
        "percent": 0
      },
      "lines": [
        {
          "id": "08fdc799-e377-4be3-bd23-f9c317333151",
          "lineNo": 1,
          "product": {
            "id": "399190ed-9ba8-4df8-9974-a5d254b0774b",
            "code": "LG-S4-Q18KL3AA",
            "name": "LG Dual Inverter split AC 1.5 Ton",
            "unitCode": "set",
            "status": "ACTIVE",
            "trackSerial": false
          },
          "qty": "6.000",
          "receivedQty": "0.000",
          "pendingReceiptQty": "0.000",
          "remainingQty": "6.000",
          "unitPrice": "61000.0000",
          "amount": "366000.00",
          "note": null
        }
      ],
      "attachmentCount": 0,
      "createdBy": {
        "id": "c7a71b11-bbeb-4147-bb85-f38c7c6c9867",
        "name": "Shafiqul Islam"
      },
      "approvedBy": null,
      "rejectedBy": null,
      "rejectionReason": null,
      "closedReason": null,
      "cancelledReason": null,
      "submittedAt": "2026-11-05T08:09:10.624Z",
      "approvedAt": null,
      "rejectedAt": null,
      "sentAt": null,
      "closedAt": null,
      "cancelledAt": null,
      "createdAt": "2026-11-05T08:09:10.574Z",
      "updatedAt": "2026-11-05T08:09:10.651Z",
      "actions": {
        "edit": false,
        "submit": false,
        "approve": true,
        "reject": true,
        "markSent": false,
        "email": false,
        "receive": false,
        "amend": false,
        "close": false,
        "cancel": true,
        "pdf": true,
        "waitingForOtherApprover": false
      }
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 6,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Approval inbox (status filter)  (as Admin) · Search by supplier, number or quote ref  (as Manager) · List without See cost (no prices or totals)  (as Site Engineer (no See cost)) · Error: no purchasing permission (403)  (as Store Manager)

#### GET /purchase-orders/{id} — Get a purchase order

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |
| **Mobile screens** | S-25 |

Only POs delivering to the caller's warehouses are visible. Lines with ordered / received / pending / remaining, linked GRNs, revisions, timeline, attachments. Unit prices, amounts and totals (`unitPrice`, `amount`, `subtotal`, `discountAmount`, `vatAmount`, `total`, `totalBdt`) are only returned with `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a PO — full detail (Admin, with prices)  (as Admin)**

> Includes receipts (GRNs), revisions (with snapshot), attachments and the status timeline (every reject / resubmit round).

*Request*

```http
GET /api/v1/purchase-orders/f8c7034b-8ce2-4677-b5a3-9cdb89b04d00
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "f8c7034b-8ce2-4677-b5a3-9cdb89b04d00",
    "number": "PO-2627-0002",
    "draftRef": "DRAFT-AF78D0C2C0",
    "displayNumber": "PO-2627-0002",
    "type": "LOCAL",
    "status": "CLOSED",
    "statusLabel": "Closed",
    "revision": 1,
    "supplier": {
      "id": "6f159560-ed51-4b2f-ba94-0a31cb00f5be",
      "code": "SUP-001",
      "name": "LG Electronics Bangladesh",
      "type": "LOCAL",
      "email": "b2b@lg.example.com",
      "isActive": true
    },
    "currency": "BDT",
    "exchangeRate": "1.0000",
    "poDate": "2026-11-05",
    "expectedDeliveryDate": "2026-12-05",
    "overdue": false,
    "deliverTo": {
      "id": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
      "code": "A",
      "name": "Warehouse A"
    },
    "project": null,
    "supplierQuoteRef": "LGEB/Q/2026/0412-R1",
    "vatPercent": "15.00",
    "discountAmount": "45000.00",
    "subtotal": "2260000.00",
    "vatAmount": "332250.00",
    "total": "2547250.00",
    "totalBdt": "2547250.00",
    "terms": "1. Prices are fixed for this order.\n2. Deliver to the warehouse named above with a delivery challan quoting this PO number.\n3. Goods are subject to inspection on receipt; damaged units will be returned.\n4. Payment as per the agreed terms after receipt of goods and invoice.",
    "notes": "Stock for the Uttara and Dhanmondi residential installations.",
    "progress": {
      "orderedQty": "35.000",
      "receivedQty": "18.000",
      "pendingQty": "0.000",
      "percent": 51
    },
    "lines": [
      {
        "id": "624700b1-cb56-4416-9f84-a03431e17bc2",
        "lineNo": 1,
        "product": {
          "id": "399190ed-9ba8-4df8-9974-a5d254b0774b",
          "code": "LG-S4-Q18KL3AA",
          "name": "LG Dual Inverter split AC 1.5 Ton",
          "unitCode": "set",
          "status": "ACTIVE",
          "trackSerial": false
        },
        "qty": "25.000",
        "receivedQty": "12.000",
        "pendingReceiptQty": "0.000",
        "remainingQty": "0.000",
        "unitPrice": "61000.0000",
        "amount": "1525000.00",
        "note": null
      },
      // … 1 more
    ],
    "attachmentCount": 0,
    "createdBy": {
      "id": "62c7ba0b-ae58-4a64-a6a4-8af57f9e5221",
      "name": "Tanvir Hasan"
    },
    "approvedBy": {
      "id": "440330d7-8dd0-4356-9eec-2404204e04d5",
      "name": "Arif Rahman"
    },
    "rejectedBy": null,
    "rejectionReason": null,
    "closedReason": "LG can't supply the balance before February; it will be re-ordered on a new PO.",
    "cancelledReason": null,
    "submittedAt": "2026-11-05T08:09:08.566Z",
    "approvedAt": "2026-11-05T08:09:08.735Z",
    "rejectedAt": null,
    "sentAt": "2026-11-05T08:09:08.869Z",
    "closedAt": "2026-11-05T08:09:10.159Z",
    "cancelledAt": null,
    "createdAt": "2026-11-05T08:09:08.069Z",
    "updatedAt": "2026-11-05T08:09:10.161Z",
    "actions": {
      "edit": false,
      "submit": false,
      "approve": false,
      "reject": false,
      "markSent": false,
      "email": false,
      "receive": false,
      "amend": false,
      "close": false,
      "cancel": false,
      "pdf": true,
      "waitingForOtherApprover": false
    },
    "receipts": [
      {
        "id": "f2fbeeca-f063-4930-8968-7817904019f8",
        "number": "GRN-L-2627-0001",
        "displayNumber": "GRN-L-2627-0001",
        "type": "GRN_LOCAL",
        "status": "POSTED",
        "entryDate": "2026-11-05",
        "totalQty": "18.000",
        "createdBy": {
          "id": "c51ed4aa-1921-4bd8-a1bc-d55ee81d498e",
          "name": "Kamal Hossain"
        }
      }
    ],
    "revisions": [
      {
        "id": "933d2773-5d6b-4314-af3b-c67cc941a892",
        "revision": 1,
        "changedBy": {
          "id": "440330d7-8dd0-4356-9eec-2404204e04d5",
          "name": "Arif Rahman"
        },
        "reason": "LG revised the 2.0 Ton price; 5 more 1.5 Ton for the Bashundhara showroom.",
        "changes": [
          "LG-S4-Q18KL3AA: quantity 20 → 25",
          // … 2 more
        ],
        "createdAt": "2026-11-05T08:09:10.020Z",
        "snapshot": {
          "type": "LOCAL",
          "lines": [
            {
              "id": "624700b1-cb56-4416-9f84-a03431e17bc2",
              "qty": "20.000",
              "amount": "1220000.00",
              "product": "LG-S4-Q18KL3AA",
              "unitPrice": "61000.0000",
              "receivedQty": "12.000",
              "pendingReceiptQty": "0.000"
            },
            // … 1 more
          ],
          "total": "2208000.00",
          "number": "PO-2627-0002",
          "poDate": "2026-11-05",
          "status": "PARTLY_RECEIVED",
          "project": null,
          "currency": "BDT",
          "revision": 0,
          "subtotal": "1965000.00",
          "supplier": "SUP-001",
          "totalBdt": "2208000.00",
          "deliverTo": "A",
          "vatAmount": "288000.00",
          "vatPercent": "15.00",
          "exchangeRate": "1.0000",
          "discountAmount": "45000.00",
          "supplierQuoteRef": "LGEB/Q/2026/0412-R1",
          "expectedDeliveryDate": "2026-11-20"
        }
      }
    ],
    "attachments": [],
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:09:08.097Z",
        "by": "Tanvir Hasan"
      },
      // … 2 more
    ]
  }
}
```

*More examples in the full reference:* Same PO without See cost (prices removed)  (as Site Engineer (no See cost)) · Imported PO (USD) — sent, with an attachment  (as Manager)

#### POST /purchase-orders/calculate — Calculate PO totals without saving

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ CREATE |
| **Mobile app** | Not used (web / admin only) |

Line amounts, subtotal, discount, VAT, total and BDT equivalent; the next PO number; warnings. Totals only with seeCost.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `supplierId` | string (uuid) | Yes |  |
| `poDate` | string |  | Defaults to today (Asia/Dhaka) |
| `expectedDeliveryDate` | string |  |  |
| `deliverToWarehouseId` | string (uuid) |  |  |
| `projectId` | string (uuid) or null |  |  |
| `supplierQuoteRef` | string or null |  | max 100 chars |
| `exchangeRate` | string |  | Imported POs: required to submit / approve (indicative BDT per unit) |
| `discountAmount` | string |  | Local POs only |
| `vatPercent` | string |  | Local POs only (defaults to the purchasing setting) |
| `terms` | string or null |  | max 5000 chars |
| `notes` | string or null |  | max 2000 chars |
| `lines` | array of object |  | at most 200 items, default [] |
| `lines[].id` | string (uuid) or null |  | Amendments: the existing line (omit for a new line) |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string | Yes | In the PO currency. Must be > 0 to submit or approve. |
| `lines[].note` | string or null |  | max 500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Preview an imported PO (USD @ 122.50)  (as Manager)**

> Nothing is saved; no Idempotency-Key. Type and currency follow the supplier; nextNumber is a peek, not a reservation. Web PO form only.

*Request*

```http
POST /api/v1/purchase-orders/calculate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "supplierId": "4d56d6cf-a1b5-48aa-bd99-d8178917f05d",
  "deliverToWarehouseId": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
  "exchangeRate": "122.50",
  "lines": [
    {
      "productId": "9c4d9137-ec46-4077-a1d3-683d1926a8c2",
      "qty": "12",
      "unitPrice": "1450.00"
    },
    // … 2 more
  ]
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "type": "IMPORTED",
    "currency": "USD",
    "exchangeRate": "122.50",
    "nextNumber": "PO-2627-0001",
    "approvalMode": "NEEDS_APPROVAL",
    "lines": [
      {
        "amount": "17400.00"
      },
      // … 2 more
    ],
    "totals": {
      "subtotal": "37916.00",
      "discountAmount": "0.00",
      "vatPercent": "0.00",
      "vatAmount": "0.00",
      "total": "37916.00",
      "totalBdt": "4644710.00"
    },
    "warnings": []
  }
}
```

*More examples in the full reference:* Preview a local PO with discount and VAT  (as Admin) · Preview with warnings (no rate, a price missing)  (as Manager)

#### POST /purchase-orders — Create a purchase order

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ CREATE |
| **Idempotency-Key** | Required (header) |
| **Mobile app** | Not used (web / admin only) |

`action`: draft, submit (→ PENDING_APPROVAL, number PO-{FY}-0001 assigned, approvers notified) or approve (Save & approve: purchasing APPROVE; approving your own PO needs FULL). Supplier must be active; its type fixes the PO type (LOCAL / IMPORTED) and the currency. Products must be ACTIVE and appear once; qty > 0; unit price > 0 to submit / approve. Local: discount + VAT %. Imported: exchange rate required to submit / approve, no VAT / discount. `Idempotency-Key` header required. Unit prices, amounts and totals (`unitPrice`, `amount`, `subtotal`, `discountAmount`, `vatAmount`, `total`, `totalBdt`) are only returned with `seeCost`.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `action` | draft \| submit \| approve | Yes | draft: save. submit: send for approval (number assigned). approve: Save & approve (purchasing APPROVE; own PO only with FULL). |
| `supplierId` | string (uuid) | Yes |  |
| `poDate` | string |  | Defaults to today (Asia/Dhaka) |
| `expectedDeliveryDate` | string |  |  |
| `deliverToWarehouseId` | string (uuid) | Yes |  |
| `projectId` | string (uuid) or null |  |  |
| `supplierQuoteRef` | string or null |  | max 100 chars |
| `exchangeRate` | string |  | Imported POs: required to submit / approve (indicative BDT per unit) |
| `discountAmount` | string |  | Local POs only |
| `vatPercent` | string |  | Local POs only (defaults to the purchasing setting) |
| `terms` | string or null |  | max 5000 chars |
| `notes` | string or null |  | max 2000 chars |
| `lines` | array of object |  | at most 200 items, default [] |
| `lines[].id` | string (uuid) or null |  | Amendments: the existing line (omit for a new line) |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string | Yes | In the PO currency. Must be > 0 to submit or approve. |
| `lines[].note` | string or null |  | max 500 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Create a draft imported PO (Daikin, USD)  (as Manager)**

> Web only (mobile doesn't create POs). action: draft | submit | approve. A draft has no number yet (displayNumber = draftRef).

*Request*

```http
POST /api/v1/purchase-orders
Authorization: Bearer <accessToken>
Idempotency-Key: 73692d44-9758-4234-9a46-d2faf13e83a6
Content-Type: application/json

{
  "action": "draft",
  "supplierId": "4d56d6cf-a1b5-48aa-bd99-d8178917f05d",
  "deliverToWarehouseId": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
  "projectId": "0568a744-79c6-4b95-8a46-7708ced9e885",
  "expectedDeliveryDate": "2026-12-20",
  "supplierQuoteRef": "DAT/QTN/2026/1187",
  "exchangeRate": "122.50",
  "terms": "1. Payment: irrevocable LC at sight.\n2. Shipment: CIF Chattogram by sea; partial shipment not allowed.\n3. Warranty: 18 months from shipment.",
  "notes": "Indoor and outdoor units for Gulshan Office Tower, floors 5–8.",
  "lines": [
    {
      "productId": "9c4d9137-ec46-4077-a1d3-683d1926a8c2",
      "qty": "12",
      "unitPrice": "1450.00",
      "note": "With BYCQ125EEF decoration panel"
    },
    // … 2 more
  ]
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

*More examples in the full reference:* Create and submit a local PO in one step (LG, BDT)  (as Manager) · Save & approve in one step (Admin)  (as Admin) · Error: imported PO submitted without exchange rate (400)  (as Manager)

#### PATCH /purchase-orders/{id} — Edit a draft or rejected PO

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ CREATE |
| **Mobile app** | Not used (web / admin only) |

Creator (or FULL). Replaces header and lines. A supplier change must keep the PO type.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `supplierId` | string (uuid) | Yes |  |
| `poDate` | string |  | Defaults to today (Asia/Dhaka) |
| `expectedDeliveryDate` | string |  |  |
| `deliverToWarehouseId` | string (uuid) | Yes |  |
| `projectId` | string (uuid) or null |  |  |
| `supplierQuoteRef` | string or null |  | max 100 chars |
| `exchangeRate` | string |  | Imported POs: required to submit / approve (indicative BDT per unit) |
| `discountAmount` | string |  | Local POs only |
| `vatPercent` | string |  | Local POs only (defaults to the purchasing setting) |
| `terms` | string or null |  | max 5000 chars |
| `notes` | string or null |  | max 2000 chars |
| `lines` | array of object |  | at most 200 items, default [] |
| `lines[].id` | string (uuid) or null |  | Amendments: the existing line (omit for a new line) |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string | Yes | In the PO currency. Must be > 0 to submit or approve. |
| `lines[].note` | string or null |  | max 500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Edit a rejected PO (add the discount)  (as Manager)**

> Web only. DRAFT or REJECTED POs, by the creator (or FULL). Send the whole PO: lines replace the existing ones (new line ids). Status stays REJECTED until resubmitted.

*Request*

```http
PATCH /api/v1/purchase-orders/f8c7034b-8ce2-4677-b5a3-9cdb89b04d00
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "supplierId": "6f159560-ed51-4b2f-ba94-0a31cb00f5be",
  "deliverToWarehouseId": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
  "expectedDeliveryDate": "2026-11-20",
  "supplierQuoteRef": "LGEB/Q/2026/0412-R1",
  "discountAmount": "45000.00",
  "vatPercent": "15",
  "notes": "Stock for the Uttara and Dhanmondi residential installations.",
  "lines": [
    {
      "productId": "399190ed-9ba8-4df8-9974-a5d254b0774b",
      "qty": "20",
      "unitPrice": "61000.00"
    },
    // … 1 more
  ]
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

#### POST /purchase-orders/{id}/submit — Submit for approval

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ CREATE |
| **Idempotency-Key** | Required (header) |

DRAFT / REJECTED → PENDING_APPROVAL (creator or FULL). Notifies users with purchasing ≥ APPROVE. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Submit a draft for approval  (as Manager)**

> No body. Assigns the gap-free number PO-{FY}-{0001} and notifies the approvers.

*Request*

```http
POST /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/submit
Authorization: Bearer <accessToken>
Idempotency-Key: abbec9a5-9edf-465e-861c-a0cf4b7834d5
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

#### POST /purchase-orders/{id}/approve — Approve

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-25, S-18 |

PENDING_APPROVAL (or a draft: Save & approve) → APPROVED. Only FULL users may approve their own PO. Notifies the creator. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Approve a pending PO  (as Admin)**

> No body. Needs purchasing APPROVE and the deliver-to warehouse in scope; the creator is notified.

*Request*

```http
POST /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/approve
Authorization: Bearer <accessToken>
Idempotency-Key: 0ae74c17-d4da-4059-91c6-6978d94138f2
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

*More examples in the full reference:* Error: approving your own PO (403)  (as Procurement Head (purchasing APPROVE)) · Error: missing Idempotency-Key (400)  (as Admin)

#### POST /purchase-orders/{id}/reject — Reject

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-17 |

PENDING_APPROVAL → REJECTED with a reason; the creator can edit and resubmit. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Reject with a reason  (as Admin)**

> Reason required (3–500 chars). The creator is notified and can edit and resubmit; the number is kept.

*Request*

```http
POST /api/v1/purchase-orders/f8c7034b-8ce2-4677-b5a3-9cdb89b04d00/reject
Authorization: Bearer <accessToken>
Idempotency-Key: 5feea13a-d094-4246-af17-510816c45262
Content-Type: application/json

{
  "reason": "LG offered a BDT 45,000 project discount on this quote. Add it and resubmit."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

#### POST /purchase-orders/{id}/mark-sent — Mark sent

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-25 |

APPROVED → SENT (records sentAt). `emailSupplier: true` also emails the PDF to the supplier. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `emailSupplier` | boolean |  | Also email the PO PDF to the supplier |
| `to` | string (email) |  | max 200 chars |
| `message` | string or null |  | max 2000 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Mark sent and email the PO to the supplier  (as Admin)**

> Body optional. With emailSupplier: true the PDF is queued and emailed (to defaults to the supplier's email); `email` in the response has the job.

*Request*

```http
POST /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/mark-sent
Authorization: Bearer <accessToken>
Idempotency-Key: 02d9cd6c-7144-46c6-b4d2-f1092134e2c3
Content-Type: application/json

{
  "emailSupplier": true,
  "message": "Please find our purchase order attached. Kindly confirm the ETD Chattogram."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "c6b0715c-2d08-4526-bfcb-8c7dd096cb0e",
    "number": "PO-2627-0001",
    "draftRef": "DRAFT-33B8A2D19D",
    "displayNumber": "PO-2627-0001",
    "type": "IMPORTED",
    "status": "SENT",
    "statusLabel": "Sent",
    "revision": 0,
    "supplier": {
      "id": "4d56d6cf-a1b5-48aa-bd99-d8178917f05d",
      "code": "SUP-002",
      "name": "Daikin Airconditioning (Thailand)",
      "type": "FOREIGN",
      "email": "export@daikin.example.com",
      "isActive": true
    },
    "currency": "USD",
    "exchangeRate": "122.5000",
    "poDate": "2026-11-05",
    "expectedDeliveryDate": "2026-12-20",
    "overdue": false,
    "deliverTo": {
      "id": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
      "code": "A",
      "name": "Warehouse A"
    },
    "project": {
      "id": "0568a744-79c6-4b95-8a46-7708ced9e885",
      "code": "PRJ-001",
      "name": "Gulshan Office Tower — VRV installation"
    },
    "supplierQuoteRef": "DAT/QTN/2026/1187",
    "vatPercent": "0.00",
    "discountAmount": "0.00",
    "subtotal": "37916.00",
    "vatAmount": "0.00",
    "total": "37916.00",
    "totalBdt": "4644710.00",
    "terms": "1. Payment: irrevocable LC at sight.\n2. Shipment: CIF Chattogram by sea; partial shipment not allowed.\n3. Warranty: 18 months from shipment.",
    "notes": "Indoor and outdoor units for Gulshan Office Tower, floors 5–8.",
    "progress": {
      "orderedQty": "26.000",
      "receivedQty": "0.000",
      "pendingQty": "0.000",
      "percent": 0
    },
    "lines": [
      {
        "id": "3a251a22-ad74-462c-b367-4fe21d08b58c",
        "lineNo": 1,
        "product": {
          "id": "9c4d9137-ec46-4077-a1d3-683d1926a8c2",
          "code": "DK-FXFQ63AVM",
          "name": "Daikin VRV ceiling cassette 2.0 Ton",
          "unitCode": "set",
          "status": "ACTIVE",
          "trackSerial": false
        },
        "qty": "12.000",
        "receivedQty": "0.000",
        "pendingReceiptQty": "0.000",
        "remainingQty": "12.000",
        "unitPrice": "1450.0000",
        "amount": "17400.00",
        "note": "With BYCQ125EEF decoration panel"
      },
      // … 2 more
    ],
    "attachmentCount": 0,
    "createdBy": {
      "id": "62c7ba0b-ae58-4a64-a6a4-8af57f9e5221",
      "name": "Tanvir Hasan"
    },
    "approvedBy": {
      "id": "440330d7-8dd0-4356-9eec-2404204e04d5",
      "name": "Arif Rahman"
    },
    "rejectedBy": null,
    "rejectionReason": null,
    "closedReason": null,
    "cancelledReason": null,
    "submittedAt": "2026-11-05T08:09:06.601Z",
    "approvedAt": "2026-11-05T08:09:07.264Z",
    "rejectedAt": null,
    "sentAt": "2026-11-05T08:09:07.542Z",
    "closedAt": null,
    "cancelledAt": null,
    "createdAt": "2026-11-05T08:09:06.183Z",
    "updatedAt": "2026-11-05T08:09:07.543Z",
    "actions": {
      "edit": false,
      "submit": false,
      "approve": false,
      "reject": false,
      "markSent": false,
      "email": true,
      "receive": true,
      "amend": true,
      "close": false,
      "cancel": true,
      "pdf": true,
      "waitingForOtherApprover": false
    },
    "receipts": [],
    "revisions": [],
    "attachments": [],
    "timeline": [
      {
        "event": "CREATED",
        "at": "2026-11-05T08:09:06.213Z",
        "by": "Tanvir Hasan"
      },
      // … 2 more
    ],
    "email": {
      "jobId": "5a3d5ee2-59e2-46da-9130-9a799f1e5bf9",
      "to": "export@daikin.example.com"
    }
  }
}
```

*More examples in the full reference:* Mark sent (no email)  (as Admin)

#### GET /purchase-orders/receivable — Purchase orders open for receiving

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |

Purchasing VIEW or inventory CREATE. Approved / sent / partly received POs delivering to your warehouses (no prices).

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: poDate, number · e.g. -poDate |
| `q` | string | Free-text search · max 200 chars |
| `warehouseId` | string (uuid) or null |  |
| `supplierId` | string (uuid) or null |  |
| `type` | LOCAL \| IMPORTED or null |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: POs open for receiving (GRN screen)  (as Store Manager)**

> Approved, sent or partly received POs in the caller's warehouses. Works with inventory CREATE alone; never includes prices.

*Request*

```http
GET /api/v1/purchase-orders/receivable?warehouseId=67dcd0df-1138-423b-8ddb-02f3e40c8bf3&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "c6b0715c-2d08-4526-bfcb-8c7dd096cb0e",
      "number": "PO-2627-0001",
      "status": "SENT",
      "type": "IMPORTED",
      "poDate": "2026-11-05",
      "expectedDeliveryDate": "2026-12-20",
      "supplier": {
        "id": "4d56d6cf-a1b5-48aa-bd99-d8178917f05d",
        "name": "Daikin Airconditioning (Thailand)"
      },
      "deliverTo": {
        "id": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
        "code": "A"
      },
      "remainingQty": "26.000"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 2,
    "totalPages": 1
  }
}
```

#### GET /purchase-orders/{id}/receivable — What a GRN can still receive

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW **or** `inventory` ≥ CREATE (a Store Manager receiving goods), deliver-to warehouse in scope |
| **Mobile screens** | S-25 → S-13 (Receive goods) |

Remaining quantities, GRN type, warehouse, supplier, currency and rate; unit prices only with seeCost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: What can still be received (Store Manager — no prices)  (as Store Manager)**

> Pre-fills the GRN: grnType, warehouse, supplier and remainingQty per line. unitPrice only for See cost.

*Request*

```http
GET /api/v1/purchase-orders/f8c7034b-8ce2-4677-b5a3-9cdb89b04d00/receivable
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "purchaseOrderId": "f8c7034b-8ce2-4677-b5a3-9cdb89b04d00",
    "number": "PO-2627-0002",
    "status": "SENT",
    "receivable": true,
    "grnType": "GRN_LOCAL",
    "warehouse": {
      "id": "67dcd0df-1138-423b-8ddb-02f3e40c8bf3",
      "code": "A",
      "name": "Warehouse A"
    },
    "supplier": {
      "id": "6f159560-ed51-4b2f-ba94-0a31cb00f5be",
      "code": "SUP-001",
      "name": "LG Electronics Bangladesh",
      "type": "LOCAL"
    },
    "project": null,
    "currency": "BDT",
    "exchangeRate": "1.0000",
    "lines": [
      {
        "purchaseOrderLineId": "624700b1-cb56-4416-9f84-a03431e17bc2",
        "product": {
          "id": "399190ed-9ba8-4df8-9974-a5d254b0774b",
          "code": "LG-S4-Q18KL3AA",
          "name": "LG Dual Inverter split AC 1.5 Ton",
          "unitCode": "set",
          "status": "ACTIVE",
          "trackSerial": false
        },
        "orderedQty": "20.000",
        "receivedQty": "0.000",
        "pendingReceiptQty": "0.000",
        "remainingQty": "20.000"
      },
      // … 1 more
    ]
  }
}
```

*More examples in the full reference:* After a partial GRN: remaining quantities (Admin — with prices)  (as Admin)

#### POST /purchase-orders/{id}/amend — Amend an approved PO

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |
| **Mobile app** | Not used (web / admin only) |

APPROVED / SENT / PARTLY_RECEIVED: change quantities, prices, lines, expected date (rate / discount / VAT). Saves a revision snapshot with the reason and increments `revision`. A line can't go below received + pending (422 AMEND_BELOW_RECEIVED). `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |
| `expectedDeliveryDate` | string or null |  |  |
| `exchangeRate` | string |  |  |
| `discountAmount` | string |  | BDT, decimal string with up to 2 decimals |
| `vatPercent` | string |  |  |
| `lines` | array of object |  | The full new list of lines (existing ones by id). Omit to keep the lines. · at least 1 item, at most 200 items |
| `lines[].id` | string (uuid) or null |  | Amendments: the existing line (omit for a new line) |
| `lines[].productId` | string (uuid) | Yes |  |
| `lines[].qty` | string | Yes | Decimal string with up to 3 decimals |
| `lines[].unitPrice` | string | Yes | In the PO currency. Must be > 0 to submit or approve. |
| `lines[].note` | string or null |  | max 500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Amend an approved PO (quantity, price, date)  (as Admin)**

> Web only. Needs APPROVE. Existing lines by id; omit `lines` to keep them. Saves revision 1 with a snapshot; a line can't go below received + pending.

*Request*

```http
POST /api/v1/purchase-orders/f8c7034b-8ce2-4677-b5a3-9cdb89b04d00/amend
Authorization: Bearer <accessToken>
Idempotency-Key: db4a4dd8-6645-4733-a6a1-b9fca400c684
Content-Type: application/json

{
  "reason": "LG revised the 2.0 Ton price; 5 more 1.5 Ton for the Bashundhara showroom.",
  "expectedDeliveryDate": "2026-12-05",
  "lines": [
    {
      "id": "624700b1-cb56-4416-9f84-a03431e17bc2",
      "productId": "399190ed-9ba8-4df8-9974-a5d254b0774b",
      "qty": "25",
      "unitPrice": "61000.00"
    },
    // … 1 more
  ]
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

#### POST /purchase-orders/{id}/close — Close (accept a short delivery)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |

Only PARTLY_RECEIVED with nothing pending → CLOSED with a reason. Remaining quantities can no longer be received. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Close a partly received PO (accept short delivery)  (as Admin)**

> Only PARTLY_RECEIVED with no GRN pending. remainingQty becomes 0 and no more GRNs are accepted.

*Request*

```http
POST /api/v1/purchase-orders/f8c7034b-8ce2-4677-b5a3-9cdb89b04d00/close
Authorization: Bearer <accessToken>
Idempotency-Key: e942c35c-a8eb-4d42-9c5f-dbaf5ec7ea64
Content-Type: application/json

{
  "reason": "LG can't supply the balance before February; it will be re-ordered on a new PO."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

*More examples in the full reference:* Error: close a PO with nothing received (422)  (as Admin)

#### POST /purchase-orders/{id}/cancel — Cancel

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |

Only when nothing was received or is pending (draft / pending approval / rejected / approved / sent). Reason required. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Cancel an approved PO (nothing received)  (as Admin)**

> Reason required. Allowed from DRAFT, PENDING_APPROVAL, REJECTED, APPROVED or SENT while nothing is received or pending.

*Request*

```http
POST /api/v1/purchase-orders/fd7010b4-caa0-48c4-bb52-a9f5f2dac45c/cancel
Authorization: Bearer <accessToken>
Idempotency-Key: bec37d4f-a07b-4f4f-a657-ca066ce81a63
Content-Type: application/json

{
  "reason": "Site switched to pre-insulated pipe; ordered from another supplier."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /purchase-orders/{id} */ }
}
```

*More examples in the full reference:* Error: cancel after goods were received (422)  (as Admin)

#### POST /purchase-orders/{id}/email — Email the PO to the supplier

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope) |
| **Idempotency-Key** | Required (header) |

Queues the PDF (worker) and an email with it attached to the supplier's address (or `to`), via the email queue; logged in EmailLog and the audit log. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json) — optional**

| Field | Type | Req. | Description |
|---|---|---|---|
| `to` | string (email) |  | Defaults to the supplier's email · max 200 chars |
| `cc` | string (email) |  | max 200 chars |
| `message` | string or null |  | max 2000 chars |

**Responses:** 202 Queued · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Email the PO again (with CC)  (as Admin)**

> 202: a worker renders the PDF and sends it (prices always shown: it's the order). Body optional; `to` defaults to the supplier's email.

*Request*

```http
POST /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/email
Authorization: Bearer <accessToken>
Idempotency-Key: af7dbdcc-dd26-4a1d-b190-ffcb4140e0df
Content-Type: application/json

{
  "cc": "accounts@technocool.example.com",
  "message": "Please send the proforma invoice so we can open the LC."
}
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/documents/b3ec6894-0434-43e1-b21b-c31fd1acffb0

{
  "data": {
    "jobId": "b3ec6894-0434-43e1-b21b-c31fd1acffb0",
    "to": "export@daikin.example.com",
    "status": "queued"
  }
}
```

#### POST /purchase-orders/{id}/documents — Queue the PO PDF

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |

Only POs delivering to the caller's warehouses are visible. Rendered by the worker (company header, supplier block, lines, totals, terms, signature lines). Poll and download with GET /documents/{jobId} (`?download=1`). Prices only with seeCost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 202 Queued · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Queue the PO PDF  (as Manager)**

> No body, no Idempotency-Key. Poll the Location (GET /documents/{jobId}) until ready, then download. Prices only if the caller has See cost; drafts can't be printed (422).

*Request*

```http
POST /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/documents
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/documents/0c748c50-c7a0-4cf8-b024-9dd70331055f

{
  "data": {
    "jobId": "0c748c50-c7a0-4cf8-b024-9dd70331055f",
    "kind": "PURCHASE_ORDER",
    "status": "queued"
  }
}
```

#### POST /purchase-orders/from-low-stock — Create POs from low-stock products

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ CREATE |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-10 (Create PO) |

One DRAFT PO per default supplier, with the suggested reorder quantity and the last approved price. Products without a default supplier are returned in `unassigned` (for the new-PO form). `Idempotency-Key` header required.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `productIds` | array of string (uuid) | Yes | at least 1 item, at most 200 items |
| `warehouseId` | string (uuid) or null |  | Deliver-to warehouse (default: your first warehouse) |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 422 Business rule violated

**Example: Create draft POs from low-stock products  (as Admin)**

> One DRAFT per default supplier, with the suggested quantity and the last approved price (local: catalog purchase cost). Products without a default supplier come back in `unassigned`.

*Request*

```http
POST /api/v1/purchase-orders/from-low-stock
Authorization: Bearer <accessToken>
Idempotency-Key: 1c0f79e4-d0fa-4384-99a5-8a93187fccd8
Content-Type: application/json

{
  "productIds": [
    "cd3e307b-2e79-4c61-8e08-16674a8276a3",
    // … 2 more
  ],
  "warehouseId": "7301d4df-5f35-4eb6-a22c-43c67be429f5"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "created": [
      {
        "id": "8b5878b6-9485-4825-8452-9d93e3dd4ccc",
        "number": null,
        "draftRef": "DRAFT-390C673C73",
        "displayNumber": "DRAFT-390C673C73",
        "type": "LOCAL",
        "status": "DRAFT",
        "statusLabel": "Draft",
        "revision": 0,
        "supplier": {
          "id": "6f159560-ed51-4b2f-ba94-0a31cb00f5be",
          "code": "SUP-001",
          "name": "LG Electronics Bangladesh",
          "type": "LOCAL",
          "email": "b2b@lg.example.com",
          "isActive": true
        },
        "currency": "BDT",
        "exchangeRate": "1.0000",
        "poDate": "2026-11-05",
        "expectedDeliveryDate": null,
        "overdue": false,
        "deliverTo": {
          "id": "7301d4df-5f35-4eb6-a22c-43c67be429f5",
          "code": "B",
          "name": "Warehouse B"
        },
        "project": null,
        "supplierQuoteRef": null,
        "vatPercent": "15.00",
        "discountAmount": "0.00",
        "subtotal": "894000.00",
        "vatAmount": "134100.00",
        "total": "1028100.00",
        "totalBdt": "1028100.00",
        "terms": "1. Prices are fixed for this order.\n2. Deliver to the warehouse named above with a delivery challan quoting this PO number.\n3. Goods are subject to inspection on receipt; damaged units will be returned.\n4. Payment as per the agreed terms after receipt of goods and invoice.",
        "notes": "Created from the low-stock list.",
        "progress": {
          "orderedQty": "12.000",
          "receivedQty": "0.000",
          "pendingQty": "0.000",
          "percent": 0
        },
        "lines": [
          {
            "id": "9e5d25fd-0b72-421b-9201-eb3f2cb31d1d",
            "lineNo": 1,
            "product": {
              "id": "cd3e307b-2e79-4c61-8e08-16674a8276a3",
              "code": "LG-S4-Q24K23AA",
              "name": "LG Dual Inverter split AC 2.0 Ton",
              "unitCode": "set",
              "status": "ACTIVE",
              "trackSerial": false
            },
            "qty": "12.000",
            "receivedQty": "0.000",
            "pendingReceiptQty": "0.000",
            "remainingQty": "12.000",
            "unitPrice": "74500.0000",
            "amount": "894000.00",
            "note": null
          }
        ],
        "attachmentCount": 0,
        "createdBy": {
          "id": "440330d7-8dd0-4356-9eec-2404204e04d5",
          "name": "Arif Rahman"
        },
        "approvedBy": null,
        "rejectedBy": null,
        "rejectionReason": null,
        "closedReason": null,
        "cancelledReason": null,
        "submittedAt": null,
        "approvedAt": null,
        "rejectedAt": null,
        "sentAt": null,
        "closedAt": null,
        "cancelledAt": null,
        "createdAt": "2026-11-05T08:09:05.913Z",
        "updatedAt": "2026-11-05T08:09:05.913Z",
        "actions": {
          "edit": true,
          "submit": true,
          "approve": true,
          "reject": false,
          "markSent": false,
          "email": false,
          "receive": false,
          "amend": false,
          "close": false,
          "cancel": true,
          "pdf": false,
          "waitingForOtherApprover": false
        }
      },
      // … 1 more
    ],
    "unassigned": [
      {
        "product": {
          "id": "8708633a-9a97-4088-9871-347aff3446a0",
          "code": "INS-NBR-12",
          "name": "NBR insulation tube 1/2 in x 2 m",
          "unitCode": "pcs"
        },
        "suggestedQty": "200.000"
      }
    ],
    "warehouseId": "7301d4df-5f35-4eb6-a22c-43c67be429f5"
  }
}
```

#### GET /purchase-orders/{id}/attachments — List a PO's attachments

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |

Only POs delivering to the caller's warehouses are visible.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: List a PO's attachments  (as Site Engineer (no See cost))**

> purchasing VIEW. `url` is the authenticated download path below.

*Request*

```http
GET /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/attachments
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "0dec2e7f-3aed-45b2-94de-5953bbb66721",
      "fileName": "PI-DAT-2026-1187.pdf",
      "mimeType": "application/pdf",
      "size": 110,
      "label": "Proforma invoice",
      "uploadedBy": {
        "id": "62c7ba0b-ae58-4a64-a6a4-8af57f9e5221",
        "name": "Tanvir Hasan"
      },
      "createdAt": "2026-11-05T08:09:07.787Z",
      "url": "/api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/attachments/0dec2e7f-3aed-45b2-94de-5953bbb66721"
    },
    // … 1 more
  ]
}
```

#### POST /purchase-orders/{id}/attachments — Attach files (quotation, proforma invoice)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ CREATE |

multipart/form-data `file` (PDF, JPG, PNG, WebP; ≤ 10 MB; ≤ 20 per PO) and optional `label`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | file | Yes |  |
| `label` | string |  |  |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Attach the supplier's proforma invoice (PDF)  (as Manager)**

> multipart/form-data: one or more `file` (or `files`) parts + optional `label`. PDF, JPEG, PNG or WebP (checked by content), max 10 MB each, max 20 files per PO.

*Request*

```http
POST /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/attachments
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file = <file PI-DAT-2026-1187.pdf, application/pdf, 110 bytes>
label = Proforma invoice
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": [
    {
      "id": "0dec2e7f-3aed-45b2-94de-5953bbb66721",
      "fileName": "PI-DAT-2026-1187.pdf",
      "mimeType": "application/pdf",
      "size": 110,
      "label": "Proforma invoice",
      "uploadedBy": {
        "id": "62c7ba0b-ae58-4a64-a6a4-8af57f9e5221",
        "name": "Tanvir Hasan"
      },
      "createdAt": "2026-11-05T08:09:07.787Z",
      "url": "/api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/attachments/0dec2e7f-3aed-45b2-94de-5953bbb66721"
    }
  ]
}
```

#### GET /purchase-orders/{id}/attachments/{attachmentId} — Download a PO attachment

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |

**Example: Download an attachment  (as Site Engineer (no See cost))**

> Returns the file bytes (inline disposition, private cache 5 min). Send the Bearer token — the bucket is private, there are no public URLs.

*Request*

```http
GET /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/attachments/0dec2e7f-3aed-45b2-94de-5953bbb66721
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="PI-DAT-2026-1187.pdf"

<binary file: 110 bytes>
```

#### DELETE /purchase-orders/{id}/attachments/{attachmentId} — Remove an attachment

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |

Uploader or purchasing FULL.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 204 Removed · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Remove an attachment  (as Manager)**

> 204, empty body. Only the uploader or a purchasing FULL user may remove a file.

*Request*

```http
DELETE /api/v1/purchase-orders/c6b0715c-2d08-4526-bfcb-8c7dd096cb0e/attachments/3004987a-240f-42ca-bbdc-30092bdf1445
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

## 12. Projects and project costs

Screens: S-26 Project list, S-27 Project detail, S-28 Material tab, S-29 Other costs & overheads, S-30 Add / edit cost, S-31 Cost history. A project's cost = **material** (issued − returned, at cost) + **labour, transport, other** costs (direct cost) + **overheads** (store charge, holding cost, established cost) = full cost. Margin = contract value − cost.

| Move | Reason | Who |
|---|---|---|
| PLANNING → RUNNING (start) | — | projects CREATE |
| RUNNING → ON_HOLD, ON_HOLD → RUNNING | required | projects CREATE |
| RUNNING → COMPLETED (sets `actualEndDate`) | — | projects CREATE |
| COMPLETED → RUNNING (reopen), COMPLETED → CLOSED | required | projects FULL |
| CLOSED → COMPLETED | required | Admin |

- Any other move → 422 `INVALID_TRANSITION`. `actions.transitions[]` on the project lists the moves this user may make, with `reasonRequired` — build the Change status sheet from it.
- Material can be **issued** only to PLANNING or RUNNING projects; **returns** are allowed for any status except CLOSED.
- **Money by role** (fields are left out, not null): costs and amounts need `seeCost`; `contractValue`, `margin`, `marginPercent`, `costUsedPercent` need `seeMargin`; `storeChargeCost`, `holdingCost`, `establishmentCost`, `overheadCost`, `fullCost`, `directMargin*` need overheads ≥ VIEW + `seeCost`.
- `totalCost` is always the **direct** cost (material + labour + transport + other). `fullCost` adds overheads. `margin` is on full cost for users with overhead access, on direct cost for everyone else.
- Users without overhead access never see overhead lines: they are dropped from lists, subtotals and activity, and their PATCH / void / history / attachments return **404**.
- Only **overhead** lines can be edited (with a reason; required on closed projects). Labour, transport and other lines are voided and added again. Lines are never deleted; voided ones show with `includeVoided=true`.
- Use `actions` (`addCost`, `addOverhead`, `editOverhead`, `upload`, …) to show buttons: e.g. Accounts can add overheads but not labour costs.
- Status changes, adding a cost and voiding need an `Idempotency-Key`. Uploads don't use one: a retried upload adds the file twice.
- `GET /projects` returns `meta.statusCounts` (for the status chips); it ignores the `status` filter but applies the others.

#### GET /projects — List projects

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |
| **Mobile screens** | S-26 |

Projects are company-wide (not warehouse-scoped). Each item has its summary totals. `meta.statusCounts` counts per status (for the filter chips). Sort: name, code, startDate, createdAt, totalCost. Cost amounts (`netMaterialCost`, `labourCost`, `transportCost`, `otherCost`, `totalCost`, …) only with `seeCost`; `contractValue`, `margin`, `marginPercent`, `costUsedPercent` only with `seeMargin`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: name, code, startDate, createdAt, totalCost · e.g. -code |
| `q` | string | Free-text search · max 200 chars |
| `status` | PLANNING \| RUNNING \| ON_HOLD \| COMPLETED \| CLOSED or null |  |
| `projectType` | OFFICE \| HOSPITAL \| INSTITUTION \| RETAIL \| INDUSTRIAL \| RESIDENTIAL \| OTHER or null |  |
| `siteEngineerUserId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null | Supplying (default) warehouse |
| `active` | boolean |  |
| `dateFrom` | string or null | Start date from · e.g. 2026-10-01 |
| `dateTo` | string or null | Start date to · e.g. 2026-10-31 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List projects  (as Admin)**

> Default sort -code. Each card carries the same role-filtered summary as GET /projects/{id}. meta.statusCounts counts every status for the filter chips.

*Request*

```http
GET /api/v1/projects?page=1&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "415cd411-290f-439c-9802-9dd42166017b",
      "code": "PRJ-004",
      "name": "Uttara Sector 7 residence — 8 split units",
      "clientName": "Mr. Shafiqul Islam",
      "clientContactPerson": null,
      "clientPhone": "+880 1712 334455",
      "clientEmail": null,
      "siteAddress": "House 21, Road 14, Sector 7, Uttara, Dhaka 1230",
      "projectType": "RESIDENTIAL",
      "projectTypeLabel": "Residential",
      "status": "PLANNING",
      "statusLabel": "Planning",
      "defaultWarehouse": {
        "id": "3f4b2277-ad3e-47f6-85e9-6912f6c4ee81",
        "code": "B",
        "name": "Warehouse B"
      },
      "startDate": "2026-11-15",
      "expectedEndDate": "2026-12-10",
      "actualEndDate": null,
      "siteEngineer": null,
      "siteEngineerName": "Jahid Hasan",
      "notes": null,
      "closedAt": null,
      "closedBy": null,
      "closeReason": null,
      "createdBy": {
        "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
        "name": "Rafiq Ahmed"
      },
      "isActive": true,
      "summary": {
        "netMaterialCost": "0.00",
        "issuedCost": "0.00",
        "returnedCost": "0.00",
        "labourCost": "0.00",
        "transportCost": "0.00",
        "otherCost": "0.00",
        "totalCost": "0.00",
        "directCost": "0.00",
        "storeChargeCost": "0.00",
        "holdingCost": "0.00",
        "establishmentCost": "0.00",
        "overheadCost": "0.00",
        "fullCost": "0.00",
        "contractValue": null,
        "margin": null,
        "marginPercent": null,
        "directMargin": null,
        "directMarginPercent": null,
        "costUsedPercent": null,
        "directCostUsedPercent": null
      },
      "contractValue": null,
      "createdAt": "2026-11-05T08:09:30.108Z",
      "updatedAt": "2026-11-05T08:09:30.108Z",
      "actions": {
        "edit": true,
        "editContractValue": true,
        "addCost": true,
        "voidCost": true,
        "addOverhead": true,
        "editOverhead": true,
        "overheadReasonRequired": false,
        "seeOverheads": true,
        "upload": true,
        "issueMaterial": true,
        "returnMaterial": true,
        "costStatement": true,
        "transitions": []
      }
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 4,
    "totalPages": 2,
    "statusCounts": {
      "PLANNING": 2,
      "RUNNING": 2,
      "ON_HOLD": 0,
      "COMPLETED": 0,
      "CLOSED": 0
    }
  }
}
```

*More examples in the full reference:* Filter: running, supplied from warehouse A, search  (as Admin) · List as Manager (no margin, no overheads)  (as Manager)

#### GET /projects/options — Projects for the stock entry form

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ CREATE (or projects VIEW / purchasing CREATE) |
| **Mobile screens** | Project pickers (S-13) |

`type=ISSUE_TO_PROJECT`: active planning / running projects; `RETURN_FROM_SITE`: any status but closed. Only id, code, name, status and default warehouse.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `type` | ISSUE_TO_PROJECT \| RETURN_FROM_SITE or null | Entry type: issues need planning / running projects; returns any status but closed. Omitted: any status but closed. |
| `q` | string | max 100 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Projects to pick on an issue  (as Store Manager)**

> Open to inventory ≥ CREATE (Store Managers have projects NONE). type=ISSUE_TO_PROJECT → planning / running; RETURN_FROM_SITE → any status but closed.

*Request*

```http
GET /api/v1/projects/options?type=ISSUE_TO_PROJECT
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "767373ce-ac4d-4b53-a145-4c0842812b33",
      "code": "PRJ-001",
      "name": "Gulshan Office Tower — VRV installation",
      "status": "RUNNING",
      "defaultWarehouse": {
        "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
        "code": "A",
        "name": "Warehouse A"
      }
    },
    // … 2 more
  ]
}
```

*More examples in the full reference:* Projects to pick on a return, with search  (as Store Manager)

#### GET /projects/site-engineers — Users to pick as site engineer

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |

Active users, id and name only.

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Users to pick as site engineer  (as Admin)**

> Needs projects ≥ CREATE. Send the chosen id as siteEngineerUserId (that user is notified of status changes).

*Request*

```http
GET /api/v1/projects/site-engineers
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "4ca54f88-c242-4ede-a577-ad68bd282999",
      "name": "Kamal Hossain"
    },
    // … 2 more
  ]
}
```

#### GET /projects/{id} — Get a project

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |
| **Mobile screens** | S-27 |

Projects are company-wide (not warehouse-scoped). Details and summary tiles. Cost amounts (`netMaterialCost`, `labourCost`, `transportCost`, `otherCost`, `totalCost`, …) only with `seeCost`; `contractValue`, `margin`, `marginPercent`, `costUsedPercent` only with `seeMargin`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a project — full view  (as Admin)**

> seeCost + seeMargin + overheads: contractValue; summary with overheads, fullCost, margin on full cost and directMargin. actions tells the app which buttons to show.

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "ae568b45-76ac-416e-b088-094345250291",
    "code": "PRJ-003",
    "name": "Green Tower — 24-floor VRF installation",
    "clientName": "Green Tower Developers Ltd.",
    "clientContactPerson": "Engr. Faisal Karim (Project Director)",
    "clientPhone": "+880 1811 452931",
    "clientEmail": "procurement@greentower.example.com",
    "siteAddress": "Plot 14, Road 11, Banani, Dhaka 1213",
    "projectType": "OFFICE",
    "projectTypeLabel": "Office",
    "status": "COMPLETED",
    "statusLabel": "Completed",
    "defaultWarehouse": {
      "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
      "code": "A",
      "name": "Warehouse A"
    },
    "startDate": "2026-09-01",
    "expectedEndDate": "2027-02-28",
    "actualEndDate": "2026-11-05",
    "siteEngineer": {
      "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
      "name": "Rafiq Ahmed"
    },
    "siteEngineerName": "Rafiq Ahmed",
    "notes": "LG Multi V 5: 4 outdoor units on the roof, 26 ceiling cassettes (floors 1–24, 2 extra on floor 24).",
    "closedAt": null,
    "closedBy": null,
    "closeReason": null,
    "createdBy": {
      "id": "601ed8d4-3f33-4e9e-b158-b637e8f6d5e9",
      "name": "Mahbub Alam"
    },
    "isActive": true,
    "summary": {
      "netMaterialCost": "8705000.00",
      "issuedCost": "8835000.00",
      "returnedCost": "130000.00",
      "labourCost": "770000.00",
      "transportCost": "83000.00",
      "otherCost": "45000.00",
      "totalCost": "9603000.00",
      "directCost": "9603000.00",
      "storeChargeCost": "174100.00",
      "holdingCost": "38000.00",
      "establishmentCost": "192750.00",
      "overheadCost": "404850.00",
      "fullCost": "10007850.00",
      "contractValue": "12850000.00",
      "margin": "2842150.00",
      "marginPercent": "22.12",
      "directMargin": "3247000.00",
      "directMarginPercent": "25.27",
      "costUsedPercent": "77.88",
      "directCostUsedPercent": "74.73"
    },
    "contractValue": "12850000.00",
    "createdAt": "2026-11-05T08:09:30.031Z",
    "updatedAt": "2026-11-05T08:09:32.018Z",
    "actions": {
      "edit": true,
      "editContractValue": true,
      "addCost": true,
      "voidCost": true,
      "addOverhead": true,
      "editOverhead": true,
      "overheadReasonRequired": false,
      "seeOverheads": true,
      "upload": true,
      "issueMaterial": false,
      "returnMaterial": true,
      "costStatement": true,
      "transitions": [
        {
          "toStatus": "RUNNING",
          "label": "Reopen",
          "reasonRequired": true
        },
        // … 1 more
      ]
    }
  }
}
```

*More examples in the full reference:* Get a project — costs and overheads, no margin  (as Accounts) · Get a project — direct cost only  (as Manager) · Error: no projects access  (as Store Manager)

#### POST /projects — Create a project

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |
| **Idempotency-Key** | Optional (header) — recommended |

Code PRJ-001… assigned automatically; starts as PLANNING or RUNNING. `contractValue` only with projects FULL + seeMargin (403 otherwise).

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 1–150 chars |
| `clientName` | string | Yes | 1–150 chars |
| `status` | PLANNING \| RUNNING \| ON_HOLD \| COMPLETED \| CLOSED |  | Starting status: PLANNING or RUNNING |
| `clientContactPerson` | string or null |  | max 100 chars |
| `clientPhone` | string or null |  | max 30 chars |
| `clientEmail` | string (email) or null |  | max 200 chars |
| `siteAddress` | string or null |  | max 300 chars |
| `projectType` | OFFICE \| HOSPITAL \| INSTITUTION \| RETAIL \| INDUSTRIAL \| RESIDENTIAL \| OTHER |  |  |
| `defaultWarehouseId` | string (uuid) or null |  | Supplying warehouse (default for issues) |
| `startDate` | string |  |  |
| `expectedEndDate` | string |  |  |
| `siteEngineerUserId` | string (uuid) or null |  | A user (notified of status changes) |
| `siteEngineerName` | string or null |  | Free text when the engineer isn't a user · max 100 chars |
| `contractValue` | string |  | Only projects FULL + seeMargin |
| `notes` | string or null |  | max 2000 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Create a project  (as Admin)**

> Code PRJ-### is assigned on save. contractValue needs projects FULL + seeMargin. Starting status: PLANNING (default) or RUNNING.

*Request*

```http
POST /api/v1/projects
Authorization: Bearer <accessToken>
Idempotency-Key: ce6d3e1f-e408-4cc6-b295-77627d044f73
Content-Type: application/json

{
  "name": "Green Tower — 24-floor VRF installation",
  "clientName": "Green Tower Developers Ltd.",
  "clientContactPerson": "Engr. Faisal Karim (Procurement)",
  "clientPhone": "+880 1811 452930",
  "clientEmail": "procurement@greentower.example.com",
  "siteAddress": "Plot 14, Road 11, Banani, Dhaka 1213",
  "projectType": "OFFICE",
  "status": "PLANNING",
  "defaultWarehouseId": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
  "startDate": "2026-09-01",
  "expectedEndDate": "2027-02-28",
  "siteEngineerUserId": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
  "contractValue": "12500000.00",
  "notes": "LG Multi V 5: 4 outdoor units on the roof, 24 ceiling cassettes (floors 1–24)."
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/projects/ae568b45-76ac-416e-b088-094345250291

{
  "data": { /* same record as in GET /projects/{id} */ }
}
```

*More examples in the full reference:* Create a project (Manager, no contract value)  (as Manager) · Error: Manager sets a contract value  (as Manager) · Error: validation  (as Admin)

#### PATCH /projects/{id} — Edit a project

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |

Not the status (see /status). `contractValue`: projects FULL + seeMargin; the old and new values are audit-logged. Closed projects are read-only (422 PROJECT_CLOSED).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–150 chars |
| `clientName` | string |  | 1–150 chars |
| `clientContactPerson` | string or null |  | max 100 chars |
| `clientPhone` | string or null |  | max 30 chars |
| `clientEmail` | string (email) or null |  | max 200 chars |
| `siteAddress` | string or null |  | max 300 chars |
| `projectType` | OFFICE \| HOSPITAL \| INSTITUTION \| RETAIL \| INDUSTRIAL \| RESIDENTIAL \| OTHER |  |  |
| `defaultWarehouseId` | string (uuid) or null |  | Supplying warehouse (default for issues) |
| `startDate` | string |  |  |
| `expectedEndDate` | string |  |  |
| `siteEngineerUserId` | string (uuid) or null |  | A user (notified of status changes) |
| `siteEngineerName` | string or null |  | Free text when the engineer isn't a user · max 100 chars |
| `contractValue` | string |  | Only projects FULL + seeMargin |
| `notes` | string or null |  | max 2000 chars |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Edit project details  (as Manager)**

> Send only the fields that change. Projects ≥ CREATE; the contract value needs FULL + seeMargin. CLOSED projects are read-only (422 PROJECT_CLOSED).

*Request*

```http
PATCH /api/v1/projects/ae568b45-76ac-416e-b088-094345250291
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "clientContactPerson": "Engr. Faisal Karim (Project Director)",
  "clientPhone": "+880 1811 452931",
  "notes": "LG Multi V 5: 4 outdoor units on the roof, 26 ceiling cassettes (floors 1–24, 2 extra on floor 24)."
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "ae568b45-76ac-416e-b088-094345250291",
    "code": "PRJ-003",
    "name": "Green Tower — 24-floor VRF installation",
    "clientName": "Green Tower Developers Ltd.",
    "clientContactPerson": "Engr. Faisal Karim (Project Director)",
    "clientPhone": "+880 1811 452931",
    "clientEmail": "procurement@greentower.example.com",
    "siteAddress": "Plot 14, Road 11, Banani, Dhaka 1213",
    "projectType": "OFFICE",
    "projectTypeLabel": "Office",
    "status": "PLANNING",
    "statusLabel": "Planning",
    "defaultWarehouse": {
      "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
      "code": "A",
      "name": "Warehouse A"
    },
    "startDate": "2026-09-01",
    "expectedEndDate": "2027-02-28",
    "actualEndDate": null,
    "siteEngineer": {
      "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
      "name": "Rafiq Ahmed"
    },
    "siteEngineerName": "Rafiq Ahmed",
    "notes": "LG Multi V 5: 4 outdoor units on the roof, 26 ceiling cassettes (floors 1–24, 2 extra on floor 24).",
    "closedAt": null,
    "closedBy": null,
    "closeReason": null,
    "createdBy": {
      "id": "601ed8d4-3f33-4e9e-b158-b637e8f6d5e9",
      "name": "Mahbub Alam"
    },
    "isActive": true,
    "summary": {
      "netMaterialCost": "0.00",
      "issuedCost": "0.00",
      "returnedCost": "0.00",
      "labourCost": "0.00",
      "transportCost": "0.00",
      "otherCost": "0.00",
      "totalCost": "0.00",
      "directCost": "0.00"
    },
    "createdAt": "2026-11-05T08:09:30.031Z",
    "updatedAt": "2026-11-05T08:09:30.181Z",
    "actions": {
      "edit": true,
      "editContractValue": false,
      "addCost": true,
      "voidCost": false,
      "addOverhead": false,
      "editOverhead": false,
      "overheadReasonRequired": false,
      "seeOverheads": false,
      "upload": true,
      "issueMaterial": true,
      "returnMaterial": true,
      "costStatement": true,
      "transitions": [
        {
          "toStatus": "RUNNING",
          "label": "Start (running)",
          "reasonRequired": false
        }
      ]
    }
  }
}
```

*More examples in the full reference:* Change the contract value (variation order)  (as Admin)

#### POST /projects/{id}/status — Change a project's status

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-27 (Change status), S-17 |

`Idempotency-Key` header required. Allowed: PLANNING→RUNNING; RUNNING↔ON_HOLD (reason); RUNNING→COMPLETED (sets actualEndDate); COMPLETED→RUNNING (FULL, reason); COMPLETED→CLOSED (FULL, reason; 422 PROJECT_HAS_OPEN_ENTRIES while entries are pending or transfers unreceived); CLOSED→COMPLETED (Admin, reason). Others: 422 INVALID_TRANSITION. The site engineer is notified.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `toStatus` | PLANNING \| RUNNING \| ON_HOLD \| COMPLETED \| CLOSED | Yes |  |
| `reason` | string |  | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Start the project (planning → running)  (as Admin)**

> Allowed moves for this user are in actions.transitions (with reasonRequired) of GET /projects/{id}.

*Request*

```http
POST /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/status
Authorization: Bearer <accessToken>
Idempotency-Key: 7638c1ed-de52-4ca4-abe3-cd19df42d897
Content-Type: application/json

{
  "toStatus": "RUNNING"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /projects/{id} */ }
}
```

*More examples in the full reference:* Put on hold (reason required)  (as Manager) · Mark completed  (as Manager) · Close the project  (as Admin) · Error: missing Idempotency-Key  (as Admin) · Error: invalid status move  (as Manager)

#### GET /projects/{id}/status-history — Status history

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Status history  (as Admin)**

> Newest first.

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/status-history
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "0520ae1c-4b3c-4356-aa57-68a2a2f48de9",
      "fromStatus": "RUNNING",
      "toStatus": "COMPLETED",
      "fromLabel": "Running",
      "toLabel": "Completed",
      "changedBy": {
        "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
        "name": "Rafiq Ahmed"
      },
      "reason": null,
      "at": "2026-11-05T08:09:32.021Z"
    },
    // … 2 more
  ]
}
```

#### POST /projects/{id}/deactivate — Deactivate a project

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` = FULL |

Never deleted; inactive projects can't receive issues.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Deactivate a project  (as Admin)**

> Projects FULL. No body. Hides the project from pickers (isActive false); same as PATCH {isActive:false}.

*Request*

```http
POST /api/v1/projects/415cd411-290f-439c-9802-9dd42166017b/deactivate
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /projects/{id} */ }
}
```

#### GET /projects/{id}/material — Material used

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |
| **Mobile screens** | S-28 |

Projects are company-wide (not warehouse-scoped). Per product, from posted issues and returns (reversals netted; DAMAGED returns count as returned), at the unit costs recorded in the stock ledger; serial numbers still at the site. Costs with seeCost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Material used  (as Admin)**

> Per product: issued, returned (of which damaged), net, serials still at site. Cost fields need seeCost; summary is the same as GET /projects/{id}.

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/material
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "lines": [
      {
        "product": {
          "id": "2d9efeb6-3857-46a5-9980-b3005297a96b",
          "code": "CU-PIPE-5-8",
          "name": "Copper pipe 5/8\" (15.88 mm), soft drawn",
          "unitCode": "m",
          "trackSerial": false
        },
        "issuedQty": "480.000",
        "returnedQty": "40.000",
        "returnedDamagedQty": "0.000",
        "netQty": "440.000",
        "issuedCost": "456000.00",
        "returnedCost": "38000.00",
        "netCost": "418000.00",
        "serialsAtSite": []
      },
      // … 2 more
    ],
    "totals": {
      "issuedCost": "8835000.00",
      "returnedCost": "130000.00",
      "netMaterialCost": "8705000.00"
    },
    "summary": {
      "netMaterialCost": "8705000.00",
      "issuedCost": "8835000.00",
      "returnedCost": "130000.00",
      "labourCost": "0.00",
      "transportCost": "0.00",
      "otherCost": "0.00",
      "totalCost": "8705000.00",
      "directCost": "8705000.00",
      "storeChargeCost": "0.00",
      "holdingCost": "0.00",
      "establishmentCost": "0.00",
      "overheadCost": "0.00",
      "fullCost": "8705000.00",
      "contractValue": "12850000.00",
      "margin": "4145000.00",
      "marginPercent": "32.26",
      "directMargin": "4145000.00",
      "directMarginPercent": "32.26",
      "costUsedPercent": "67.74",
      "directCostUsedPercent": "67.74"
    }
  }
}
```

#### GET /projects/{id}/movements — Issue / return history

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped). Issues, returns and their reversals (not drafts). `costTotal` with seeCost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: entryDate · e.g. -entryDate |
| `q` | string | Free-text search · max 200 chars |
| `type` | ISSUE_TO_PROJECT \| RETURN_FROM_SITE \| REVERSAL or null |  |
| `status` | PENDING \| POSTED \| REJECTED \| CANCELLED \| REVERSED or null |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Issue / return history  (as Admin)**

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/movements?page=1&pageSize=2
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "6172d424-edb0-4e56-a389-d270fdf02d9d",
      "number": "RTN-2627-0001",
      "displayNumber": "RTN-2627-0001",
      "type": "RETURN_FROM_SITE",
      "status": "POSTED",
      "entryDate": "2026-10-28",
      "warehouse": {
        "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
        "code": "A",
        "name": "Warehouse A"
      },
      "itemCount": 2,
      "totalQty": "41.000",
      "costTotal": "130000.00",
      "reversalOf": null,
      "createdBy": {
        "id": "601ed8d4-3f33-4e9e-b158-b637e8f6d5e9",
        "name": "Mahbub Alam"
      },
      "postedAt": "2026-10-28T04:00:00.000Z"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 3,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Filter: returns only  (as Admin)

#### GET /projects/{id}/activity — Activity

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped). Status history and the project's audit log as readable lines (amounts per the caller's flags).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Activity  (as Admin)**

> Status history plus readable audit lines (newest first).

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/activity
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "statusHistory": [
      {
        "id": "0520ae1c-4b3c-4356-aa57-68a2a2f48de9",
        "fromStatus": "RUNNING",
        "toStatus": "COMPLETED",
        "fromLabel": "Running",
        "toLabel": "Completed",
        "changedBy": {
          "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
          "name": "Rafiq Ahmed"
        },
        "reason": null,
        "at": "2026-11-05T08:09:32.021Z"
      },
      // … 2 more
    ],
    "audit": [
      {
        "id": "2f7cccdf-7e4c-4a61-8d37-cd1e93fb7f96",
        "action": "project.status",
        "at": "2026-11-05T08:09:32.022Z",
        "by": "Rafiq Ahmed",
        "text": "Status: Running → Completed"
      },
      // … 2 more
    ]
  }
}
```

#### GET /projects/{id}/costs — Other costs & overheads

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |
| **Mobile screens** | S-29 |

Projects are company-wide (not warehouse-scoped). Voided costs only with `includeVoided=true`. `subtotals`: per category, of non-voided costs (seeCost; `costsTotal` = labour + transport + other; overhead subtotals with overhead access). Overhead lines only with overheads ≥ VIEW + seeCost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `category` | LABOUR \| TRANSPORT \| OTHER \| STORE_CHARGE \| HOLDING \| ESTABLISHMENT or null |  |
| `includeVoided` | boolean |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Other costs & overheads  (as Admin)**

> kind DIRECT / OVERHEAD. Voided lines are left out unless includeVoided=true. subtotals.costsTotal = labour + transport + other.

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "costs": [
      {
        "id": "e76889f8-35a1-41ad-8ad5-5851eee1f5a1",
        "date": "2026-11-01",
        "category": "ESTABLISHMENT",
        "categoryLabel": "Established cost (overhead)",
        "kind": "OVERHEAD",
        "description": "Established cost share — head office overhead",
        "amount": "192750.00",
        "vendorOrPayee": null,
        "referenceNo": "OH-EC-GT-2611",
        "periodFrom": "2026-09-01",
        "periodTo": "2026-11-30",
        "basisNote": "1.5% of contract value (BDT 1,28,50,000.00)",
        "updatedBy": null,
        "updatedAt": "2026-11-05T08:09:31.211Z",
        "actions": {
          "edit": true,
          "void": true,
          "history": true
        },
        "createdBy": {
          "id": "601ed8d4-3f33-4e9e-b158-b637e8f6d5e9",
          "name": "Mahbub Alam"
        },
        "voided": false,
        "voidedAt": null,
        "voidedBy": null,
        "voidReason": null,
        "attachmentCount": 0,
        "createdAt": "2026-11-05T08:09:31.211Z"
      },
      // … 2 more
    ],
    "subtotals": {
      "labourCost": "770000.00",
      "transportCost": "83000.00",
      "otherCost": "45000.00",
      "costsTotal": "898000.00",
      "storeChargeCost": "176700.00",
      "holdingCost": "76000.00",
      "establishmentCost": "192750.00",
      "overheadCost": "445450.00"
    }
  }
}
```

*More examples in the full reference:* Same list without overhead access  (as Manager) · Filter: holding cost incl. voided lines  (as Accounts)

#### POST /projects/{id}/costs — Add a cost or an overhead

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW, plus the category's rule |
| **Idempotency-Key** | Required (header) |
| **Mobile screens** | S-30 |

Overheads (STORE_CHARGE, HOLDING, ESTABLISHMENT) need overheads ≥ CREATE and seeCost to add, edit or void, at any project status (a `reason` on CLOSED projects); they are hidden (lines, amounts, history) from users without overheads ≥ VIEW + seeCost. LABOUR / TRANSPORT / OTHER keep their rules (projects ≥ CREATE to add, FULL to void, not on closed projects). `Idempotency-Key` header required. Queues the cost-alert check.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `date` | string |  | Defaults to today (Asia/Dhaka) |
| `category` | LABOUR \| TRANSPORT \| OTHER \| STORE_CHARGE \| HOLDING \| ESTABLISHMENT | Yes | LABOUR / TRANSPORT / OTHER need projects ≥ CREATE. STORE_CHARGE / HOLDING / ESTABLISHMENT (overheads) need overheads ≥ CREATE and seeCost. |
| `description` | string | Yes | 1–300 chars |
| `amount` | string | Yes | BDT, decimal string with up to 2 decimals |
| `vendorOrPayee` | string or null |  | max 150 chars |
| `referenceNo` | string or null |  | max 100 chars |
| `periodFrom` | string |  | Overheads only: first month the charge covers (stored as the 1st) |
| `periodTo` | string |  | Overheads only: last month the charge covers (stored as the last day) |
| `basisNote` | string or null |  | Overheads only: how the amount was worked out, e.g. "2% of material issued" (information only) · max 300 chars |
| `reason` | string |  | Required for an overhead on a CLOSED project |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Add labour  (as Manager)**

> LABOUR / TRANSPORT / OTHER need projects ≥ CREATE; never edited (void and re-add); not on CLOSED projects. date defaults to today (Asia/Dhaka).

*Request*

```http
POST /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs
Authorization: Bearer <accessToken>
Idempotency-Key: 1acf31c0-ad1e-4b1c-aafe-8f4f2e260406
Content-Type: application/json

{
  "category": "LABOUR",
  "date": "2026-09-30",
  "description": "Installation crew — floors 1–12 (14 technicians, 3 weeks)",
  "amount": "350000.00",
  "vendorOrPayee": "Shapla Engineering Works",
  "referenceNo": "SEW/GT/0930"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "a50655e0-3d62-4add-b2b6-5bd390e42cdd",
    "date": "2026-09-30",
    "category": "LABOUR",
    "categoryLabel": "Labour",
    "kind": "DIRECT",
    "description": "Installation crew — floors 1–12 (14 technicians, 3 weeks)",
    "amount": "350000.00",
    "vendorOrPayee": "Shapla Engineering Works",
    "referenceNo": "SEW/GT/0930",
    "actions": {
      "edit": false,
      "void": false,
      "history": true
    },
    "createdBy": {
      "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
      "name": "Rafiq Ahmed"
    },
    "voided": false,
    "voidedAt": null,
    "voidedBy": null,
    "voidReason": null,
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:30.983Z",
    "warnings": []
  }
}
```

*More examples in the full reference:* Add an overhead: store charge  (as Accounts) · Error: Manager adds an overhead  (as Manager)

#### PATCH /projects/{id}/costs/{costId} — Edit an overhead

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Mobile screens** | S-30 |

Overhead lines only (422 COST_NOT_EDITABLE for labour / transport / other: void and add again). Overheads (STORE_CHARGE, HOLDING, ESTABLISHMENT) need overheads ≥ CREATE and seeCost to add, edit or void, at any project status (a `reason` on CLOSED projects); they are hidden (lines, amounts, history) from users without overheads ≥ VIEW + seeCost. LABOUR / TRANSPORT / OTHER keep their rules (projects ≥ CREATE to add, FULL to void, not on closed projects). Omitted fields keep their value; audit-logged with before / after and the reason; project figures update immediately.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `date` | string |  |  |
| `category` | LABOUR \| TRANSPORT \| OTHER \| STORE_CHARGE \| HOLDING \| ESTABLISHMENT |  | Another overhead category only |
| `description` | string |  | 1–300 chars |
| `amount` | string |  | BDT, decimal string with up to 2 decimals |
| `vendorOrPayee` | string or null |  | max 150 chars |
| `referenceNo` | string or null |  | max 100 chars |
| `periodFrom` | string |  | Overheads only: first month the charge covers (stored as the 1st) |
| `periodTo` | string |  | Overheads only: last month the charge covers (stored as the last day) |
| `basisNote` | string or null |  | Overheads only: how the amount was worked out, e.g. "2% of material issued" (information only) · max 300 chars |
| `reason` | string |  | Why it changed; required on a CLOSED project |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Edit an overhead with a reason  (as Accounts)**

> Overhead lines only, at any status. Omitted fields keep their value. reason is optional but kept in the history; required on CLOSED projects.

*Request*

```http
PATCH /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/86eb0e5d-360e-4dcf-92e0-0efd4fe099b8
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "amount": "174100.00",
  "basisNote": "2% of net material issued (BDT 87,05,000.00)",
  "reason": "Recalculated on net material after the 28 Oct site return"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "86eb0e5d-360e-4dcf-92e0-0efd4fe099b8",
    "date": "2026-10-31",
    "category": "STORE_CHARGE",
    "categoryLabel": "Store charge",
    "kind": "OVERHEAD",
    "description": "Store charge — Warehouse A handling of material issued Sep–Oct",
    "amount": "174100.00",
    "vendorOrPayee": null,
    "referenceNo": "OH-SC-GT-2610",
    "periodFrom": "2026-09-01",
    "periodTo": "2026-10-31",
    "basisNote": "2% of net material issued (BDT 87,05,000.00)",
    "updatedBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "updatedAt": "2026-11-05T08:09:31.323Z",
    "actions": {
      "edit": true,
      "void": true,
      "history": true
    },
    "createdBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "voided": false,
    "voidedAt": null,
    "voidedBy": null,
    "voidReason": null,
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:31.142Z",
    "warnings": []
  }
}
```

*More examples in the full reference:* Edit an overhead on a closed project  (as Accounts) · Error: a labour line can't be edited  (as Admin) · Error: closed project, no reason  (as Accounts)

#### POST /projects/{id}/costs/{costId}/void — Void a cost

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Idempotency-Key** | Required (header) |

`Idempotency-Key` header required. With a reason; kept for audit and excluded from totals. Labour / transport / other: projects FULL, not on closed projects. Overheads: overheads ≥ CREATE + seeCost, any status.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Void a duplicate overhead line  (as Accounts)**

> Never deleted: voided lines leave the totals and stay in the history. Direct costs: projects FULL; overheads: overheads ≥ CREATE.

*Request*

```http
POST /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/54cc0fe5-a129-4c4a-89e0-45dbc4286ab6/void
Authorization: Bearer <accessToken>
Idempotency-Key: b45cf01a-276c-4a49-8208-64f9cf042553
Content-Type: application/json

{
  "reason": "Entered twice — duplicate of the Sep–Oct holding line"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "54cc0fe5-a129-4c4a-89e0-45dbc4286ab6",
    "date": "2026-10-31",
    "category": "HOLDING",
    "categoryLabel": "Holding cost",
    "kind": "OVERHEAD",
    "description": "Holding cost — 4 outdoor units held at Warehouse A before roof lifting",
    "amount": "38000.00",
    "vendorOrPayee": null,
    "referenceNo": "OH-HC-GT-2610",
    "periodFrom": "2026-09-01",
    "periodTo": "2026-10-31",
    "basisNote": null,
    "updatedBy": null,
    "updatedAt": "2026-11-05T08:09:31.372Z",
    "actions": {
      "edit": false,
      "void": false,
      "history": true
    },
    "createdBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "voided": true,
    "voidedAt": "2026-11-05T08:09:31.371Z",
    "voidedBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "voidReason": "Entered twice — duplicate of the Sep–Oct holding line",
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:31.244Z"
  }
}
```

*More examples in the full reference:* Error: already voided  (as Accounts)

#### GET /projects/{id}/costs/{costId}/history — History of a cost line

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |
| **Mobile screens** | S-31 |

Projects are company-wide (not warehouse-scoped). Its audit trail, oldest first: created / edited (old → new) / voided, who, when and why. Overhead lines only with overhead access (404 otherwise).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: History of an overhead line  (as Accounts)**

> Oldest first: CREATED, EDITED (changes[] old → new, amountBefore), VOIDED. Overhead lines are 404 for users without overhead access.

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/86eb0e5d-360e-4dcf-92e0-0efd4fe099b8/history
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "cost": {
      "id": "86eb0e5d-360e-4dcf-92e0-0efd4fe099b8",
      "date": "2026-10-31",
      "category": "STORE_CHARGE",
      "categoryLabel": "Store charge",
      "kind": "OVERHEAD",
      "description": "Store charge — Warehouse A handling of material issued Sep–Oct",
      "amount": "174100.00",
      "vendorOrPayee": null,
      "referenceNo": "OH-SC-GT-2610",
      "periodFrom": "2026-09-01",
      "periodTo": "2026-10-31",
      "basisNote": "2% of net material issued (BDT 87,05,000.00)",
      "updatedBy": {
        "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
        "name": "Nusrat Jahan"
      },
      "updatedAt": "2026-11-05T08:09:31.323Z",
      "actions": {
        "edit": true,
        "void": true,
        "history": true
      },
      "createdBy": {
        "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
        "name": "Nusrat Jahan"
      },
      "voided": false,
      "voidedAt": null,
      "voidedBy": null,
      "voidReason": null,
      "attachmentCount": 0,
      "createdAt": "2026-11-05T08:09:31.142Z"
    },
    "history": [
      {
        "id": "d797fab6-cbb0-4306-aff8-694fc5bbcf3e",
        "action": "CREATED",
        "at": "2026-11-05T08:09:31.144Z",
        "by": {
          "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
          "name": "Nusrat Jahan"
        },
        "amount": "176700.00",
        "changes": [],
        "reason": null
      },
      // … 1 more
    ]
  }
}
```

#### GET /projects/{id}/costs/{costId}/attachments — Cost receipts: list

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Receipts of a cost  (as Manager)**

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/a50655e0-3d62-4add-b2b6-5bd390e42cdd/attachments
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "03e18ac0-26e9-47a6-83e5-4b8d948069a9",
      "fileName": "shapla-bill-sep-page1.jpg",
      "mimeType": "image/jpeg",
      "size": 6682,
      "label": "Labour bill — Shapla Engineering",
      "uploadedBy": {
        "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
        "name": "Rafiq Ahmed"
      },
      "createdAt": "2026-11-05T08:09:31.530Z",
      "url": "/api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/a50655e0-3d62-4add-b2b6-5bd390e42cdd/attachments/03e18ac0-26e9-47a6-83e5-4b8d948069a9"
    },
    // … 1 more
  ]
}
```

#### POST /projects/{id}/costs/{costId}/attachments — Cost receipts: upload

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |

PDF, JPG, PNG or WebP (checked by content), up to 10 MB each.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | file | Yes |  |
| `label` | string |  |  |

**Responses:** 201 Uploaded · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Attach receipt photos to a cost  (as Manager)**

> multipart/form-data: one or more `file` / `files` parts (PDF, JPG, PNG, WebP checked by content, ≤ 10 MB each) and an optional `label`. Overhead lines need overheads ≥ CREATE instead of projects ≥ CREATE.

*Request*

```http
POST /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/a50655e0-3d62-4add-b2b6-5bd390e42cdd/attachments
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

files = <file shapla-bill-sep-page1.jpg, image/jpeg, 6,682 bytes>
files = <file shapla-bill-sep-page2.jpg, image/jpeg, 4,711 bytes>
label = Labour bill — Shapla Engineering
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": [
    {
      "id": "03e18ac0-26e9-47a6-83e5-4b8d948069a9",
      "fileName": "shapla-bill-sep-page1.jpg",
      "mimeType": "image/jpeg",
      "size": 6682,
      "label": "Labour bill — Shapla Engineering",
      "uploadedBy": {
        "id": "2f728b84-7c66-4f5f-aa2e-bb3332cff1b8",
        "name": "Rafiq Ahmed"
      },
      "createdAt": "2026-11-05T08:09:31.530Z",
      "url": "/api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/a50655e0-3d62-4add-b2b6-5bd390e42cdd/attachments/03e18ac0-26e9-47a6-83e5-4b8d948069a9"
    },
    // … 1 more
  ]
}
```

*More examples in the full reference:* Attach a bill to an overhead line  (as Accounts)

#### GET /projects/{id}/costs/{costId}/attachments/{attachmentId} — Cost receipts: download

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 200 The file · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Download a receipt  (as Manager)**

> Returns the file bytes (inline). Use the `url` from the list with the bearer token.

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/a50655e0-3d62-4add-b2b6-5bd390e42cdd/attachments/03e18ac0-26e9-47a6-83e5-4b8d948069a9
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: image/jpeg
Content-Disposition: inline; filename="shapla-bill-sep-page1.jpg"

<binary file: 6,682 bytes>
```

#### DELETE /projects/{id}/costs/{costId}/attachments/{attachmentId} — Cost receipts: remove

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |

The uploader or projects FULL.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `costId` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 204 Removed · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Remove a receipt  (as Manager)**

*Request*

```http
DELETE /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/costs/a50655e0-3d62-4add-b2b6-5bd390e42cdd/attachments/c7507f40-a1a0-4821-882e-d75ee0c2fde9
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

#### GET /projects/{id}/attachments — Project documents (work order, drawings, handover papers, site photos): list

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Project documents  (as Admin)**

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/attachments
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "5536db39-37ee-496c-9c0c-d0a119da9d19",
      "fileName": "GT-work-order-signed.pdf",
      "mimeType": "application/pdf",
      "size": 70,
      "label": "Signed work order",
      "uploadedBy": {
        "id": "601ed8d4-3f33-4e9e-b158-b637e8f6d5e9",
        "name": "Mahbub Alam"
      },
      "createdAt": "2026-11-05T08:09:31.661Z",
      "url": "/api/v1/projects/ae568b45-76ac-416e-b088-094345250291/attachments/5536db39-37ee-496c-9c0c-d0a119da9d19"
    },
    // … 2 more
  ]
}
```

#### POST /projects/{id}/attachments — Project documents (work order, drawings, handover papers, site photos): upload

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |

PDF, JPG, PNG or WebP (checked by content), up to 10 MB each.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | file | Yes |  |
| `label` | string |  |  |

**Responses:** 201 Uploaded · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Upload the work order  (as Admin)**

> Project documents: work order, drawings, handover papers, site photos. multipart/form-data `file` / `files` + optional `label`; projects ≥ CREATE.

*Request*

```http
POST /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/attachments
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file = <file GT-work-order-signed.pdf, application/pdf, 70 bytes>
label = Signed work order
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": [
    {
      "id": "5536db39-37ee-496c-9c0c-d0a119da9d19",
      "fileName": "GT-work-order-signed.pdf",
      "mimeType": "application/pdf",
      "size": 70,
      "label": "Signed work order",
      "uploadedBy": {
        "id": "601ed8d4-3f33-4e9e-b158-b637e8f6d5e9",
        "name": "Mahbub Alam"
      },
      "createdAt": "2026-11-05T08:09:31.661Z",
      "url": "/api/v1/projects/ae568b45-76ac-416e-b088-094345250291/attachments/5536db39-37ee-496c-9c0c-d0a119da9d19"
    }
  ]
}
```

*More examples in the full reference:* Upload site photos  (as Manager)

#### GET /projects/{id}/attachments/{attachmentId} — Project documents (work order, drawings, handover papers, site photos): download

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |

Projects are company-wide (not warehouse-scoped).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 200 The file · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Download a project document  (as Admin)**

*Request*

```http
GET /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/attachments/5536db39-37ee-496c-9c0c-d0a119da9d19
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="GT-work-order-signed.pdf"

<binary file: 70 bytes>
```

#### DELETE /projects/{id}/attachments/{attachmentId} — Project documents (work order, drawings, handover papers, site photos): remove

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ CREATE |

The uploader or projects FULL.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 204 Removed · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Remove a project document  (as Manager)**

*Request*

```http
DELETE /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/attachments/a40d818a-40c8-482a-afad-f8d4145795b8
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

#### POST /projects/{id}/documents — Cost statement PDF

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `projects` ≥ VIEW |
| **Mobile screens** | S-27 (Cost statement PDF) |

Projects are company-wide (not warehouse-scoped). Requires seeCost. Queued for the worker; poll `GET /documents/{jobId}`. The contract / margin section only for seeMargin.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 202 Queued · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Cost statement PDF  (as Admin)**

> Queued for the worker (202). Poll GET /documents/{jobId} (Location header). Needs seeCost; the contract / margin section only with seeMargin, overheads only with overhead access.

*Request*

```http
POST /api/v1/projects/ae568b45-76ac-416e-b088-094345250291/documents
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/documents/2d7665c0-1b3c-44a9-af17-e6269b13de0a

{
  "data": {
    "jobId": "2d7665c0-1b3c-44a9-af17-e6269b13de0a",
    "kind": "PROJECT_COST_STATEMENT",
    "status": "queued"
  }
}
```

## 13. Warehouse costs (overheads)

Screens: S-32 Warehouse cost entries, S-33 Add / edit, S-34 Monthly summary. Admin and Accounts only (overheads module + `seeCost`). Monthly **store charge** and **holding cost** per warehouse, and the company's **established cost**. The summary compares holding cost with the average stock value of each warehouse.

- `month` is sent as `YYYY-MM` and returned as `YYYY-MM-01`; up to next month is allowed (`MONTH_TOO_FAR` otherwise).
- `GET /warehouse-costs` returns `totals.amount` next to `data` and `meta` (the total of **all** matching lines, not just the page) — show it in the Total card.
- Edits need a reason; lines are voided (with a reason), never deleted. Voiding needs an `Idempotency-Key`.

#### GET /warehouse-costs — List overhead costs

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |
| **Mobile screens** | S-32 |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access. Filters scope, warehouseId, category, monthFrom / monthTo (YYYY-MM), includeVoided; `q` searches description, payee, reference. `totals.amount`: non-voided total of all matching lines.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: month, amount, createdAt, category · e.g. -month |
| `q` | string | Free-text search · max 200 chars |
| `scope` | WAREHOUSE \| COMPANY or null |  |
| `warehouseId` | string (uuid) or null |  |
| `category` | STORE_CHARGE \| HOLDING \| ESTABLISHMENT or null |  |
| `monthFrom` | string or null |  |
| `monthTo` | string or null |  |
| `includeVoided` | boolean |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List overhead costs  (as Accounts)**

> Default sort -month. totals.amount is the sum of every matching (non-voided) line, not just this page.

*Request*

```http
GET /api/v1/warehouse-costs?page=1&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "a6e03c20-2f2f-4c60-9231-6888fedf8bdb",
      "scope": "COMPANY",
      "warehouse": null,
      "category": "ESTABLISHMENT",
      "categoryLabel": "Established cost (overhead)",
      "month": "2026-11-01",
      "amount": "648500.00",
      "description": "Head office rent, admin salaries, utilities and vehicles — November",
      "vendorOrPayee": null,
      "referenceNo": "HO-OH-2611",
      "createdBy": {
        "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
        "name": "Nusrat Jahan"
      },
      "updatedBy": null,
      "voided": false,
      "voidedAt": null,
      "voidedBy": null,
      "voidReason": null,
      "attachmentCount": 0,
      "createdAt": "2026-11-05T08:09:32.543Z",
      "updatedAt": "2026-11-05T08:09:32.543Z",
      "actions": {
        "edit": true,
        "void": true,
        "upload": true
      }
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 19,
    "totalPages": 7
  },
  "totals": {
    "amount": "3451800.00"
  }
}
```

*More examples in the full reference:* Filter: warehouse A store charge, Sep–Nov  (as Accounts) · Filter: incl. voided lines  (as Accounts) · Error: no overheads access  (as Manager) · Error: warehouse outside your scope  (as Accounts (warehouse A only))

#### POST /warehouse-costs — Add an overhead cost

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ CREATE and `seeCost` |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile screens** | S-33 |

WAREHOUSE scope: STORE_CHARGE or HOLDING, `warehouseId` required. COMPANY scope: ESTABLISHMENT, no warehouse (400 SCOPE_CATEGORY / WAREHOUSE_REQUIRED / WAREHOUSE_NOT_ALLOWED). Amount > 0; month at most one month ahead (400 MONTH_TOO_FAR). Several lines per warehouse, month and category are allowed. Never changes stock value. Audit-logged with before / after.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `scope` | WAREHOUSE \| COMPANY | Yes | WAREHOUSE: store charge / holding (warehouseId required). COMPANY: established cost (no warehouse). |
| `warehouseId` | string (uuid) or null |  |  |
| `category` | STORE_CHARGE \| HOLDING \| ESTABLISHMENT | Yes |  |
| `month` | string | Yes | YYYY-MM (stored as the first day of the month) |
| `amount` | string | Yes | BDT, decimal string with up to 2 decimals |
| `description` | string | Yes | 1–300 chars |
| `vendorOrPayee` | string or null |  | max 150 chars |
| `referenceNo` | string or null |  | max 100 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse)

**Example: Store charge for warehouse A  (as Accounts)**

> WAREHOUSE scope: STORE_CHARGE or HOLDING with warehouseId. month is YYYY-MM (stored as the 1st), at most next month. Several lines per warehouse / month / category are fine. Idempotency-Key optional (a replay returns the same row).

*Request*

```http
POST /api/v1/warehouse-costs
Authorization: Bearer <accessToken>
Idempotency-Key: 9ec48147-27f3-4194-889b-cf2ffa02f4c7
Content-Type: application/json

{
  "scope": "WAREHOUSE",
  "warehouseId": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
  "category": "STORE_CHARGE",
  "month": "2026-09",
  "amount": "185000.00",
  "description": "Warehouse A rent — Tejgaon I/A, September 2026",
  "vendorOrPayee": "Haque Properties Ltd.",
  "referenceNo": "RENT-WA-2609"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/warehouse-costs/1826d859-be2d-4344-be23-449b34426272

{
  "data": {
    "id": "1826d859-be2d-4344-be23-449b34426272",
    "scope": "WAREHOUSE",
    "warehouse": {
      "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
      "code": "A",
      "name": "Warehouse A"
    },
    "category": "STORE_CHARGE",
    "categoryLabel": "Store charge",
    "month": "2026-09-01",
    "amount": "185000.00",
    "description": "Warehouse A rent — Tejgaon I/A, September 2026",
    "vendorOrPayee": "Haque Properties Ltd.",
    "referenceNo": "RENT-WA-2609",
    "createdBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "updatedBy": null,
    "voided": false,
    "voidedAt": null,
    "voidedBy": null,
    "voidReason": null,
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:32.234Z",
    "updatedAt": "2026-11-05T08:09:32.234Z",
    "actions": {
      "edit": true,
      "void": true,
      "upload": true
    },
    "warnings": []
  }
}
```

*More examples in the full reference:* Company established cost  (as Admin) · Error: month too far ahead  (as Accounts)

#### GET /warehouse-costs/{id} — Get an overhead cost

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get an overhead cost  (as Accounts)**

*Request*

```http
GET /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05",
    "scope": "WAREHOUSE",
    "warehouse": {
      "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
      "code": "A",
      "name": "Warehouse A"
    },
    "category": "STORE_CHARGE",
    "categoryLabel": "Store charge",
    "month": "2026-10-01",
    "amount": "185000.00",
    "description": "Warehouse A rent — Tejgaon I/A, October 2026",
    "vendorOrPayee": "Haque Properties Ltd.",
    "referenceNo": "RENT-WA-2610",
    "createdBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "updatedBy": null,
    "voided": false,
    "voidedAt": null,
    "voidedBy": null,
    "voidReason": null,
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:32.339Z",
    "updatedAt": "2026-11-05T08:09:32.339Z",
    "actions": {
      "edit": true,
      "void": true,
      "upload": true
    }
  }
}
```

#### PATCH /warehouse-costs/{id} — Edit an overhead cost

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ CREATE and `seeCost` |
| **Mobile screens** | S-33 |

Omitted fields keep their value; optional `reason` kept in the history. WAREHOUSE scope: STORE_CHARGE or HOLDING, `warehouseId` required. COMPANY scope: ESTABLISHMENT, no warehouse (400 SCOPE_CATEGORY / WAREHOUSE_REQUIRED / WAREHOUSE_NOT_ALLOWED). Amount > 0; month at most one month ahead (400 MONTH_TOO_FAR). Several lines per warehouse, month and category are allowed. Never changes stock value. Audit-logged with before / after.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `scope` | WAREHOUSE \| COMPANY |  |  |
| `warehouseId` | string (uuid) or null |  |  |
| `category` | STORE_CHARGE \| HOLDING \| ESTABLISHMENT |  |  |
| `month` | string |  | YYYY-MM (stored as the first day of the month) |
| `amount` | string |  | BDT, decimal string with up to 2 decimals |
| `description` | string |  | 1–300 chars |
| `vendorOrPayee` | string or null |  | max 150 chars |
| `referenceNo` | string or null |  | max 100 chars |
| `reason` | string |  | Why it changed (kept in the history) |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Edit with a reason  (as Accounts)**

> Omitted fields keep their value; scope and category must still agree. The reason is kept in the history. Voided lines can't be edited (422).

*Request*

```http
PATCH /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "amount": "195000.00",
  "description": "Warehouse A rent — Tejgaon I/A, October 2026 (renewed lease)",
  "reason": "Rent increased from October under the renewed lease"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05",
    "scope": "WAREHOUSE",
    "warehouse": {
      "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
      "code": "A",
      "name": "Warehouse A"
    },
    "category": "STORE_CHARGE",
    "categoryLabel": "Store charge",
    "month": "2026-10-01",
    "amount": "195000.00",
    "description": "Warehouse A rent — Tejgaon I/A, October 2026 (renewed lease)",
    "vendorOrPayee": "Haque Properties Ltd.",
    "referenceNo": "RENT-WA-2610",
    "createdBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "updatedBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "voided": false,
    "voidedAt": null,
    "voidedBy": null,
    "voidReason": null,
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:32.339Z",
    "updatedAt": "2026-11-05T08:09:32.604Z",
    "actions": {
      "edit": true,
      "void": true,
      "upload": true
    },
    "warnings": []
  }
}
```

#### POST /warehouse-costs/{id}/void — Void an overhead cost

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ CREATE and `seeCost` |
| **Idempotency-Key** | Required (header) |

With a reason; excluded from totals, kept for history. `Idempotency-Key` header required.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Void a duplicate line  (as Accounts)**

> Idempotency-Key required. Voided lines leave the totals and the summary; they are kept for history.

*Request*

```http
POST /api/v1/warehouse-costs/434565b8-f25f-42e6-b556-755db32199d1/void
Authorization: Bearer <accessToken>
Idempotency-Key: e9ad4481-3fd5-4733-b202-40a8cc73f7ad
Content-Type: application/json

{
  "reason": "Duplicate of the October holding entry for Warehouse B"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "434565b8-f25f-42e6-b556-755db32199d1",
    "scope": "WAREHOUSE",
    "warehouse": {
      "id": "3f4b2277-ad3e-47f6-85e9-6912f6c4ee81",
      "code": "B",
      "name": "Warehouse B"
    },
    "category": "HOLDING",
    "categoryLabel": "Holding cost",
    "month": "2026-10-01",
    "amount": "27900.00",
    "description": "Electricity, night guard and stock insurance — October",
    "vendorOrPayee": "DPDC / Green Delta Insurance",
    "referenceNo": "HLD-WB-2610",
    "createdBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "updatedBy": null,
    "voided": true,
    "voidedAt": "2026-11-05T08:09:32.625Z",
    "voidedBy": {
      "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
      "name": "Nusrat Jahan"
    },
    "voidReason": "Duplicate of the October holding entry for Warehouse B",
    "attachmentCount": 0,
    "createdAt": "2026-11-05T08:09:32.424Z",
    "updatedAt": "2026-11-05T08:09:32.626Z",
    "actions": {
      "edit": false,
      "void": false,
      "upload": false
    }
  }
}
```

#### GET /warehouse-costs/{id}/history — History of an overhead cost

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access. Its audit trail, oldest first: created, edited (old → new), voided, receipts added / removed — who, when, why.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: History of an overhead cost  (as Accounts)**

> Oldest first: CREATE, UPDATE (changes[] old → new), VOID, ATTACHMENT_ADD, ATTACHMENT_REMOVE.

*Request*

```http
GET /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/history
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": { /* same record as in GET /projects/{id}/costs/{costId}/history */ }
}
```

#### GET /warehouse-costs/summary — Monthly summary

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |
| **Mobile screens** | S-34 |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access. Per month and warehouse in scope: store charge, holding, total, average stock value and holding % of it; the company's established cost; the month's total. Default: the last 6 months; at most 36.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `monthFrom` | string or null | Default: 5 months before monthTo |
| `monthTo` | string or null | Default: this month |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Monthly summary  (as Accounts)**

> Per month and warehouse: store charge, holding, total, average stock value (mean of daily closing values from the ledger; the current month up to today) and holding % of it; plus the company established cost. Defaults: monthTo = this month, monthFrom = 5 months before. At most 36 months.

*Request*

```http
GET /api/v1/warehouse-costs/summary?monthFrom=2026-09&monthTo=2026-11
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "monthFrom": "2026-09-01",
    "monthTo": "2026-11-01",
    "months": [
      {
        "month": "2026-09-01",
        "warehouses": [
          {
            "warehouse": {
              "id": "4872431f-9b0a-4856-b39a-12f3e34c0a42",
              "code": "A",
              "name": "Warehouse A"
            },
            "storeChargeCost": "281000.00",
            "holdingCost": "64500.00",
            "warehouseTotal": "345500.00",
            "averageStockValue": "11338533.33",
            "holdingPercent": "0.57"
          },
          // … 1 more
        ],
        "company": {
          "establishmentCost": "640000.00"
        },
        "total": "1134000.00"
      },
      // … 2 more
    ]
  }
}
```

#### GET /warehouse-costs/summary/export — Monthly summary as Excel

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access. Same months and figures as the summary, as an .xlsx download.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `monthFrom` | string or null | Default: 5 months before monthTo |
| `monthTo` | string or null | Default: this month |

**Responses:** 200 The workbook · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Monthly summary as Excel  (as Accounts)**

> Same query as the summary; returns an .xlsx file (attachment).

*Request*

```http
GET /api/v1/warehouse-costs/summary/export?monthFrom=2026-09&monthTo=2026-11
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="warehouse-costs-2026-09-to-2026-11.xlsx"

<binary file: 7,646 bytes>
```

#### GET /warehouse-costs/{id}/attachments — Receipts and bills: list

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Receipts and bills  (as Accounts)**

*Request*

```http
GET /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/attachments
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "170c4952-5b37-465b-88de-3f5da69a80a2",
      "fileName": "haque-properties-rent-receipt-oct.pdf",
      "mimeType": "application/pdf",
      "size": 68,
      "label": "Rent receipt — October",
      "uploadedBy": {
        "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
        "name": "Nusrat Jahan"
      },
      "createdAt": "2026-11-05T08:09:32.693Z",
      "url": "/api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/attachments/170c4952-5b37-465b-88de-3f5da69a80a2"
    },
    // … 1 more
  ]
}
```

#### POST /warehouse-costs/{id}/attachments — Receipts and bills: upload

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ CREATE and `seeCost` |

multipart `file` (repeatable): PDF, JPG, PNG or WebP (checked by content), up to 10 MB each, 20 per cost.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | array of file | Yes |  |
| `label` | string |  |  |

**Responses:** 201 Uploaded · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Attach the rent receipt  (as Accounts)**

> multipart/form-data: `file` / `files` (PDF, JPG, PNG, WebP by content, ≤ 10 MB) + optional `label`. Overheads ≥ CREATE.

*Request*

```http
POST /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/attachments
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

files = <file haque-properties-rent-receipt-oct.pdf, application/pdf, 68 bytes>
files = <file rent-receipt-photo.jpg, image/jpeg, 6,682 bytes>
label = Rent receipt — October
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": [
    {
      "id": "170c4952-5b37-465b-88de-3f5da69a80a2",
      "fileName": "haque-properties-rent-receipt-oct.pdf",
      "mimeType": "application/pdf",
      "size": 68,
      "label": "Rent receipt — October",
      "uploadedBy": {
        "id": "8c212329-ebcd-4646-9a75-7f778bc9d049",
        "name": "Nusrat Jahan"
      },
      "createdAt": "2026-11-05T08:09:32.693Z",
      "url": "/api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/attachments/170c4952-5b37-465b-88de-3f5da69a80a2"
    },
    // … 1 more
  ]
}
```

#### GET /warehouse-costs/{id}/attachments/{attachmentId} — Receipts and bills: download

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise) |

Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 200 The file · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Download a receipt  (as Accounts)**

*Request*

```http
GET /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/attachments/170c4952-5b37-465b-88de-3f5da69a80a2
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="haque-properties-rent-receipt-oct.pdf"

<binary file: 68 bytes>
```

#### DELETE /warehouse-costs/{id}/attachments/{attachmentId} — Receipts and bills: remove

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `overheads` ≥ CREATE and `seeCost` |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `attachmentId` | string (uuid) |  |

**Responses:** 204 Removed · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Remove a receipt  (as Accounts)**

*Request*

```http
DELETE /api/v1/warehouse-costs/d3bac2aa-01e1-4d3d-b1d6-fc11eba09c05/attachments/7ade113a-9ea0-4e6a-abd4-43cd2b4fc931
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

## 14. Reports and exports

Screens: S-35 Reports catalog, S-36 Report viewer. `GET /reports` lists the reports the user may run, with each report's filters and columns. Running a report returns rows (paged), totals and an optional chart, with hidden columns already removed for the user's role. Exports (Excel / PDF) run in the background and give a signed download link.

| Report id | What it shows |
|---|---|
| `stock-summary` | Quantity per product with one column per warehouse (`wh_A`, `wh_B`), damaged, reserved, available, in transit, total; average cost and value with `seeCost`. |
| `stock-movement` | Every posted ledger line in a date range: in / out, unit cost, value change; BL and B/E numbers on imported GRNs. |
| `stock-aging` | Stock on hand in 0–30 / 31–90 / 91–180 / 180+ day buckets (FIFO), quantity and value; donut chart. |
| `low-stock` | Products below their minimum: short by, suggested order; "Create PO" row action. |
| `serial-lookup` | Find a unit by part of its serial: status, current location, last entry, B/E no., origin. |
| `open-pos` | Approved / sent PO lines still to be delivered, with an overdue flag. |
| `purchases-by-supplier` | POs and ordered value per supplier; GRNs received (imported / local) with BL / B/E numbers. |
| `price-history` | Purchase prices per product over time with % change; line chart. |
| `project-cost-summary` | Per project: material, labour, transport, other, overheads, full cost, contract value and margins (by role). |
| `material-by-project` | Issued, returned and net quantity and cost per project × product. |
| `sales` | Invoices: ex-VAT, VAT, incl-VAT; cost, profit and profit % (by role). |
| `damage-loss` | Write-offs and count shortages with loss value and status (pending included). |
| `pending` | Everything waiting: entries, counts, POs and transfers in transit, with days waiting; "Open" row action. |
| `audit-log` | Who did what, with a before → after summary. |
| `import-shipments` | One row per imported GRN: BL / CI / B/E data, landed cost, file count, document completeness. |
| `warehouse-holding-cost` | Monthly store charge + holding cost per warehouse vs average stock value (overhead access). |
| `overheads-spent-vs-charged` | Monthly overheads entered vs charged to projects (overhead access). |

- A run returns `data` (rows of the page), `meta` (paging), `totals` (over **all** rows), `chart` (or null), `report` (title, `columns`, totals definition, `rowAction`) and `params` (the filters as understood, with relative dates resolved).
- Columns the user may not see are absent from `report.columns`, the rows, the totals and the chart. Build the table from `report.columns` only.
- Links inside rows are in `row._links[columnKey]`; the row action's link is `row._links._action`; the Create PO product id is `row._id`. Links are website paths (map them as in chapter 5).
- Date presets: pass `dateFrom` / `dateTo` as dates, or relative tokens such as `today`, `monthStart`, `thisMonth` (see `params` in the examples). Ledger reports (stock movement, aging, serial lookup, material by project) filter on the posting time; sales, damage, purchases, price history, import shipments and pending on the entry date.
- Export: `POST …/exports` → 202 `{jobId, status: "queued"}` → poll `GET /exports/{jobId}` (`queued` → `processing` → `completed` | `failed`) → `downloadUrl` is a signed link valid for one hour that needs no token (a new one on every status call). Only the requester can read the job (others get 404).
- A warehouse filter keeps the other warehouse's column in stock summary (its values are null): hide null columns if you like.

#### GET /reports — The reports catalog

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403) |
| **Mobile screens** | S-35 |

Lists the reports this caller may run (15, or all 17 with overhead access) with their filters and the columns / totals / chart this caller gets. Columns, totals and charts the caller's role may not see are absent (cost → `seeCost`, profit → `seeProfit`, contract / margin → `seeMargin`, overheads → `overheads` ≥ VIEW + `seeCost`), in JSON, Excel and PDF alike. Reports 16–17 (overheads) need overhead access as a whole (403 otherwise; not listed in the catalog). Without overhead access, project cost and margin are on direct cost; with it, margin is on full cost (direct + overheads). Audit log rows about overheads are hidden without overhead access. Rows are limited to the caller's warehouses; a `warehouseId` outside them is 403.

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Report catalog  (as Admin)**

> Every report this user may run, with its filters (params), sort keys, visible columns, totals, chart spec and row action. scheduleCount = schedules this user can see.

*Request*

```http
GET /api/v1/reports
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "stock-summary",
      "number": 1,
      "title": "Stock summary",
      "group": "Stock",
      "description": "Quantity on hand per product and warehouse (good stock), damaged, reserved, available, in transit and value at average cost.",
      "landscape": true,
      "params": [
        {
          "key": "warehouseId",
          "label": "Warehouse",
          "kind": "warehouse"
        },
        // … 2 more
      ],
      "sortFields": [
        "code",
        // … 2 more
      ],
      "defaultSort": "code",
      "columns": [
        {
          "key": "code",
          "label": "Code",
          "type": "text",
          "align": "start",
          "requires": "none",
          "sortKey": "code",
          "link": true,
          "width": 18
        },
        // … 2 more
      ],
      "totals": [
        {
          "key": "products",
          "label": "Products",
          "type": "number",
          "requires": "none",
          "decimals": 0
        },
        // … 2 more
      ],
      "chart": {
        "type": "bar",
        "title": "Stock value by brand",
        "valueType": "money",
        "requires": "seeCost"
      },
      "rowAction": null
    },
    // … 2 more
  ],
  "scheduleCount": 0
}
```

*More examples in the full reference:* Error: role without Reports access  (as Store Manager)

#### GET /reports/{id}/run — Run a report (one page)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403) |
| **Mobile screens** | S-36 |

Filters are query parameters (see `params`; dates accept YYYY-MM-DD or tokens such as `monthStart`, `today`, `-30d`; months accept YYYY-MM or tokens such as `thisMonth`, `lastMonth`, `-5m`, `fiscalYearStart`). Aggregation and paging happen in the database; queries stop after 30 s (503 QUERY_TIMEOUT). Columns, totals and charts the caller's role may not see are absent (cost → `seeCost`, profit → `seeProfit`, contract / margin → `seeMargin`, overheads → `overheads` ≥ VIEW + `seeCost`), in JSON, Excel and PDF alike. Reports 16–17 (overheads) need overhead access as a whole (403 otherwise; not listed in the catalog). Without overhead access, project cost and margin are on direct cost; with it, margin is on full cost (direct + overheads). Audit log rows about overheads are hidden without overhead access. Rows are limited to the caller's warehouses; a `warehouseId` outside them is 403.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | stock-summary \| stock-movement \| stock-aging \| low-stock \| serial-lookup \| open-pos \| purchases-by-supplier \| price-history \| project-cost-summary \| material-by-project \| sales \| damage-loss \| pending \| audit-log \| import-shipments \| warehouse-holding-cost \| overheads-spent-vs-charged |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer |  |
| `pageSize` | integer | max 200 |
| `sort` | string |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 503 The query took longer than 30 seconds

**Example: Stock summary, sorted by value  (as Admin)**

> One column per warehouse (wh_A, wh_B). totals cover every row, not just the page.

*Request*

```http
GET /api/v1/reports/stock-summary/run?sort=-value&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "code": "LG-S4-Q18KL3AA",
      "name": "LG Dual Inverter split AC 1.5 Ton",
      "brand": "LG",
      "category": "Split AC",
      "wh_A": "4.000",
      "wh_B": "6.000",
      "damaged": "0.000",
      "reserved": "1.000",
      "available": "9.000",
      "inTransit": "3.000",
      "total": "13.000",
      "avgCost": "60833.33",
      "stockValue": "790833.33",
      "_links": {
        "code": "/stock/products/c7fd6b2e-1cb2-4843-a03c-d06d4dc97d8e"
      }
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 5,
    "totalPages": 2
  },
  "totals": {
    "products": 5,
    "total": "153.000",
    "stockValue": "1791490.83"
  },
  "chart": {
    "type": "bar",
    "title": "Stock value by brand",
    "valueType": "money",
    "requires": "seeCost",
    "points": [
      {
        "label": "LG",
        "values": [
          "1165433.33"
        ]
      },
      // … 2 more
    ]
  },
  "report": {
    "id": "stock-summary",
    "number": 1,
    "title": "Stock summary",
    "group": "Stock",
    "description": "Quantity on hand per product and warehouse (good stock), damaged, reserved, available, in transit and value at average cost.",
    "landscape": true,
    "columns": [
      {
        "key": "code",
        "label": "Code",
        "type": "text",
        "align": "start",
        "requires": "none",
        "sortKey": "code",
        "link": true,
        "width": 18
      },
      // … 2 more
    ],
    "totals": [
      {
        "key": "products",
        "label": "Products",
        "type": "number",
        "requires": "none",
        "decimals": 0
      },
      // … 2 more
    ],
    "rowAction": null
  },
  "params": {}
}
```

*More examples in the full reference:* Stock summary without cost (columns removed)  (as Sales Desk) · Stock summary, one warehouse and brand  (as Admin) · Stock movement, last 30 days in Warehouse A (relative dates)  (as Admin) · Stock movement, page 2  (as Admin) · Stock aging  (as Admin) · Low stock (with Create PO row action)  (as Admin) · Serial number lookup  (as Admin) · Open POs, overdue only  (as Admin) · Purchases by supplier  (as Admin) · Price history of one product  (as Admin) · Project cost summary (running projects)  (as Admin) · Project cost summary without margin (Accounts)  (as Accounts) · Material by project  (as Admin) · Sales, last 30 days  (as Admin) · Sales without cost or profit  (as Sales Desk) · Damage & loss  (as Admin) · Pending verification  (as Admin) · Audit log, stock entries only  (as Admin) · Import shipments  (as Admin) · Warehouse holding cost by month  (as Admin) · Overheads: spent vs charged to projects  (as Admin) · Error: unknown report id  (as Admin) · Error: invalid filter (end date before start date)  (as Admin)

#### GET /reports/lookups — Filter options

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403) |
| **Mobile screens** | S-36 filter sheet |

Warehouses (the caller's), brands, categories, projects, suppliers, customers, users and audit record types.

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Filter options  (as Admin)**

> Options for the filter dropdowns (warehouses limited to the user's scope).

*Request*

```http
GET /api/v1/reports/lookups
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "warehouses": [
      {
        "id": "41d33bdf-7f08-4274-a8c4-7a0b04d5cac7",
        "code": "A",
        "name": "Warehouse A"
      },
      // … 1 more
    ],
    "catalogs": [
      {
        "id": "2decd7a3-0d56-47de-87cf-359160a40a5c",
        "name": "LG"
      },
      // … 2 more
    ],
    "categories": [
      {
        "id": "f3aa6433-4b97-42f6-b891-9d4f8bd3d569",
        "name": "AHU"
      },
      // … 2 more
    ],
    "projects": [
      {
        "id": "013f0e85-13cb-4004-935b-8ee3bc1a985b",
        "code": "PRJ-001",
        "name": "Gulshan Office Tower — VRV installation"
      },
      // … 1 more
    ],
    "suppliers": [
      {
        "id": "1fac20ea-429e-4383-9143-d7dafe0d3cb6",
        "code": "SUP-002",
        "name": "Daikin Airconditioning (Thailand)"
      },
      // … 2 more
    ],
    "customers": [
      {
        "id": "5137c1e7-ff16-47b7-8e57-5205f4f59ee5",
        "name": "Green Tower Developers Ltd."
      },
      // … 1 more
    ],
    "users": [
      {
        "id": "0bfa52cf-d063-4ce4-b563-c054cbaaeb84",
        "name": "Farhana Islam",
        "username": "farhana"
      },
      // … 2 more
    ],
    "recordTypes": [
      "Product",
      // … 2 more
    ]
  }
}
```

#### GET /reports/lookups/products — Product search for filters

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403) |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `q` | string |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Product search for the product filter  (as Admin)**

> At most 20 matches by code, name or model.

*Request*

```http
GET /api/v1/reports/lookups/products?q=LG
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "3377cf67-1569-4b01-9a44-7deeca516900",
      "code": "LG-ARNU24GTRB4",
      "name": "LG Multi V ceiling cassette 2.0 Ton"
    },
    // … 1 more
  ]
}
```

#### POST /reports/{id}/exports — Export a report to Excel or PDF

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403) |
| **Mobile screens** | S-36 export sheet |

Validates the filters, writes an audit row (`report.export`) and queues the file (worker). Excel streams up to 100,000 rows; PDF shows the first 5,000. Poll `GET /exports/{jobId}`. Columns, totals and charts the caller's role may not see are absent (cost → `seeCost`, profit → `seeProfit`, contract / margin → `seeMargin`, overheads → `overheads` ≥ VIEW + `seeCost`), in JSON, Excel and PDF alike. Reports 16–17 (overheads) need overhead access as a whole (403 otherwise; not listed in the catalog). Without overhead access, project cost and margin are on direct cost; with it, margin is on full cost (direct + overheads). Audit log rows about overheads are hidden without overhead access. Rows are limited to the caller's warehouses; a `warehouseId` outside them is 403.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | stock-summary \| stock-movement \| stock-aging \| low-stock \| serial-lookup \| open-pos \| purchases-by-supplier \| price-history \| project-cost-summary \| material-by-project \| sales \| damage-loss \| pending \| audit-log \| import-shipments \| warehouse-holding-cost \| overheads-spent-vs-charged |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `format` | xlsx \| pdf | Yes |  |
| `params` | object |  |  |
| `sort` | string |  | max 200 chars |

**Responses:** 202 Queued · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Export to Excel  (as Admin)**

> Filters are validated now (400/403 here, not in the worker); the file is built by the worker. Poll GET /exports/{jobId}.

*Request*

```http
POST /api/v1/reports/stock-summary/exports
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "format": "xlsx",
  "params": {
    "warehouseId": "41d33bdf-7f08-4274-a8c4-7a0b04d5cac7"
  },
  "sort": "-value"
}
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/exports/74fe42df-a862-4341-b34c-2788caeec7ab

{
  "data": {
    "jobId": "74fe42df-a862-4341-b34c-2788caeec7ab",
    "reportId": "stock-summary",
    "format": "xlsx",
    "status": "queued"
  }
}
```

*More examples in the full reference:* Export to PDF  (as Admin)

#### GET /exports/{jobId} — Export status

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403) |

Only the requester sees their job. When completed, `downloadUrl` is a signed link valid for 1 hour.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `jobId` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Export status: queued  (as Admin)**

> status: queued → processing → completed | failed.

*Request*

```http
GET /api/v1/exports/74fe42df-a862-4341-b34c-2788caeec7ab
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "jobId": "74fe42df-a862-4341-b34c-2788caeec7ab",
    "reportId": "stock-summary",
    "format": "xlsx",
    "status": "queued",
    "fileName": null,
    "rows": null,
    "downloadUrl": null,
    "expiresAt": null,
    "failedReason": null
  }
}
```

*More examples in the full reference:* Export status: completed (signed link)  (as Admin) · Error: another user's export job  (as Sales Desk)

#### GET /exports/{jobId}/download — Download an export (signed link)

| | |
|---|---|
| **Auth** | None (public) |

No session needed: `expires` and `signature` (HMAC) are the authorisation; the link stops working after 1 hour.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `jobId` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| expires * | string |  |
| signature * | string |  |

**Responses:** 200 The file (xlsx or pdf) · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse)

**Example: Download the Excel file  (as Anyone with the link)**

> No session: the expires + signature query parameters are the authorisation.

*Request*

```http
GET /api/v1/exports/74fe42df-a862-4341-b34c-2788caeec7ab/download?expires=1793869840498&signature=169da8c23e2c17b8a2bea21d57a0da3168d77cf1323520725ea7e13c50867bde
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="stock-summary-2026-11-05.xlsx"

<binary file: 8,431 bytes>
```

*More examples in the full reference:* Error: expired or tampered link  (as Anyone with the link)

## 15. Customers and suppliers

Screen S-37 (read-only on mobile). Customers are used on sales; suppliers on GRNs, returns and purchase orders. Masters are never deleted: they are deactivated.

#### GET /customers — List customers

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |
| **Mobile screens** | S-37, customer picker (S-13) |

Filter `active`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: name, createdAt · e.g. name |
| `q` | string | Free-text search · max 200 chars |
| `active` | boolean | true: active only, false: inactive only |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List active customers  (as Store Manager (Warehouse A))**

*Request*

```http
GET /api/v1/customers?active=true&sort=name&pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "310bd190-5439-4523-9a9f-7e7d40d214ea",
      "name": "Green Tower Developers Ltd.",
      "contactPerson": "Procurement",
      "phone": "+880 1811 000000",
      "email": "procurement@greentower.example.com",
      "address": "Banani, Dhaka",
      "isActive": true,
      "createdAt": "2026-11-05T08:12:32.087Z",
      "updatedAt": "2026-11-05T08:12:32.087Z"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 2,
    "totalPages": 1
  }
}
```

#### GET /customers/{id} — Get a customer

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` ≥ VIEW |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a customer  (as Store Manager (Warehouse A))**

*Request*

```http
GET /api/v1/customers/e4a89933-71ed-456a-923c-616df7e4ff4c
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "e4a89933-71ed-456a-923c-616df7e4ff4c",
    "name": "Rahman Textiles Ltd.",
    "contactPerson": "Mr. Habibur Rahman",
    "phone": "+880 1712 345678",
    "email": "purchase@rahmantextiles.example.com",
    "address": "Plot 14, BSCIC Industrial Area, Tongi, Gazipur",
    "isActive": true,
    "createdAt": "2026-11-05T08:12:32.955Z",
    "updatedAt": "2026-11-05T08:12:32.955Z"
  }
}
```

#### POST /customers — Create a customer

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 1–150 chars |
| `contactPerson` | string or null |  | max 100 chars |
| `phone` | string or null |  | max 30 chars |
| `email` | string (email) or null |  | max 200 chars |
| `address` | string or null |  | max 300 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse)

**Example: Create a customer  (as Admin)**

> inventory FULL.

*Request*

```http
POST /api/v1/customers
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Rahman Textiles Ltd.",
  "contactPerson": "Mr. Habibur Rahman",
  "phone": "+880 1712 345678",
  "email": "purchase@rahmantextiles.example.com",
  "address": "Plot 14, BSCIC Industrial Area, Tongi, Gazipur"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json

{
  "data": {
    "id": "e4a89933-71ed-456a-923c-616df7e4ff4c",
    "name": "Rahman Textiles Ltd.",
    "contactPerson": "Mr. Habibur Rahman",
    "phone": "+880 1712 345678",
    "email": "purchase@rahmantextiles.example.com",
    "address": "Plot 14, BSCIC Industrial Area, Tongi, Gazipur",
    "isActive": true,
    "createdAt": "2026-11-05T08:12:32.955Z",
    "updatedAt": "2026-11-05T08:12:32.955Z"
  }
}
```

*More examples in the full reference:* Error: a customer with the same name exists  (as Admin)

#### PATCH /customers/{id} — Update a customer

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–150 chars |
| `contactPerson` | string or null |  | max 100 chars |
| `phone` | string or null |  | max 30 chars |
| `email` | string (email) or null |  | max 200 chars |
| `address` | string or null |  | max 300 chars |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse)

**Example: Update phone and address  (as Admin)**

> Send only the fields to change.

*Request*

```http
PATCH /api/v1/customers/e4a89933-71ed-456a-923c-616df7e4ff4c
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "phone": "+880 1712 345679",
  "address": "Plot 14–16, BSCIC Industrial Area, Tongi, Gazipur"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "e4a89933-71ed-456a-923c-616df7e4ff4c",
    "name": "Rahman Textiles Ltd.",
    "contactPerson": "Mr. Habibur Rahman",
    "phone": "+880 1712 345679",
    "email": "purchase@rahmantextiles.example.com",
    "address": "Plot 14–16, BSCIC Industrial Area, Tongi, Gazipur",
    "isActive": true,
    "createdAt": "2026-11-05T08:12:32.955Z",
    "updatedAt": "2026-11-05T08:12:32.982Z"
  }
}
```

#### POST /customers/{id}/deactivate — Deactivate a customer

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

Never deleted; inactive records can't be picked on new entries.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Deactivate a customer  (as Admin)**

> No body. Inactive customers can't be used on new sales; reactivate with PATCH { isActive: true }.

*Request*

```http
POST /api/v1/customers/e4a89933-71ed-456a-923c-616df7e4ff4c/deactivate
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "e4a89933-71ed-456a-923c-616df7e4ff4c",
    "name": "Rahman Textiles Ltd.",
    "contactPerson": "Mr. Habibur Rahman",
    "phone": "+880 1712 345679",
    "email": "purchase@rahmantextiles.example.com",
    "address": "Plot 14–16, BSCIC Industrial Area, Tongi, Gazipur",
    "isActive": false,
    "createdAt": "2026-11-05T08:12:32.955Z",
    "updatedAt": "2026-11-05T08:12:32.995Z"
  }
}
```

#### GET /suppliers — List suppliers

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW **or** `inventory` ≥ VIEW (GRN screens) |
| **Mobile screens** | S-37, supplier picker (S-13) |

Filters: `q`, `type`, `isActive` (alias `active`), `brand`.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: name, code, createdAt · e.g. name |
| `q` | string | Free-text search · max 200 chars |
| `type` | LOCAL \| FOREIGN or null |  |
| `isActive` | boolean | true: active only, false: inactive only |
| `active` | boolean | Alias of isActive (Module 2) |
| `brand` | string or null | Matches 'brands supplied' · max 100 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List suppliers  (as Admin)**

> Default sort name. Filters: type (LOCAL | FOREIGN), isActive, brand; q matches name, code, contact, phone, email, brands.

*Request*

```http
GET /api/v1/suppliers?pageSize=3&sort=name
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "5b375a3e-001a-45b0-9edc-fe897518a933",
      "code": "SUP-005",
      "name": "Banani Copper & Insulation Co.",
      "type": "LOCAL",
      "defaultCurrency": "BDT",
      "currency": "BDT",
      "contactPerson": "Jahangir Alam",
      "phone": "+880 1715 223355",
      "email": "sales@bananicopper.example.com",
      "address": "Kemal Ataturk Avenue, Banani, Dhaka",
      "brandsSupplied": "Copper pipe, NBR insulation, brass fittings, drain pipe",
      "paymentTermsNote": "30 days after delivery",
      "notes": "Delivers to both warehouses within 48 hours.",
      "isActive": false,
      "openPoCount": 0,
      "createdAt": "2026-11-05T08:09:05.513Z",
      "updatedAt": "2026-11-05T08:09:05.573Z"
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 5,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Foreign suppliers only  (as Manager) · Search suppliers from the GRN screen  (as Store Manager)

#### GET /suppliers/{id} — Get a supplier

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |

Purchasing or inventory VIEW. Includes open PO count, last purchase date and (with seeCost) the ordered value.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a supplier with stats  (as Admin)**

> stats.totalOrderedBdt only for See cost.

*Request*

```http
GET /api/v1/suppliers/4d56d6cf-a1b5-48aa-bd99-d8178917f05d
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "4d56d6cf-a1b5-48aa-bd99-d8178917f05d",
    "code": "SUP-002",
    "name": "Daikin Airconditioning (Thailand)",
    "type": "FOREIGN",
    "defaultCurrency": "USD",
    "currency": "USD",
    "contactPerson": "Export team",
    "phone": "+66 2 000 0000",
    "email": "export@daikin.example.com",
    "address": "Bangkok, Thailand",
    "brandsSupplied": "Daikin",
    "paymentTermsNote": "LC at sight",
    "notes": null,
    "isActive": true,
    "openPoCount": 1,
    "createdAt": "2026-11-05T08:09:04.358Z",
    "updatedAt": "2026-11-05T08:09:04.358Z",
    "stats": {
      "openPoCount": 1,
      "poCount": 1,
      "lastPurchaseDate": "2026-11-05",
      "productCount": 3,
      "totalOrderedBdt": "4644710.00"
    }
  }
}
```

#### GET /suppliers/{id}/purchase-orders — A supplier's purchase orders

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |

Only POs delivering to the caller's warehouses are visible. Same filters as /purchase-orders. Unit prices, amounts and totals (`unitPrice`, `amount`, `subtotal`, `discountAmount`, `vatAmount`, `total`, `totalBdt`) are only returned with `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: poDate, number, createdAt, expectedDeliveryDate, total · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `status` | DRAFT \| PENDING_APPROVAL \| REJECTED \| APPROVED \| SENT \| PARTLY_RECEIVED \| FULLY_RECEIVED \| CLOSED \| CANCELLED or null |  |
| `supplierId` | string (uuid) or null |  |
| `type` | LOCAL \| IMPORTED or null |  |
| `warehouseId` | string (uuid) or null |  |
| `projectId` | string (uuid) or null |  |
| `productId` | string (uuid) or null |  |
| `overdue` | boolean | Expected delivery before today and still approved / sent / partly received |
| `receivable` | boolean | Approved, sent or partly received |
| `dateFrom` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `dateTo` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: A supplier's purchase orders  (as Manager)**

> purchasing VIEW. Same filters and item shape as GET /purchase-orders.

*Request*

```http
GET /api/v1/suppliers/6f159560-ed51-4b2f-ba94-0a31cb00f5be/purchase-orders?pageSize=2
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [ /* same record as in GET /purchase-orders */ ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 3,
    "totalPages": 2
  }
}
```

#### GET /suppliers/{id}/price-history — A supplier's price history

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |

Only POs delivering to the caller's warehouses are visible. and `seeCost` (403 otherwise). PO lines of approved POs, newest first.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: poDate · e.g. -poDate |
| `q` | string | Free-text search · max 200 chars |
| `productId` | string (uuid) or null |  |
| `supplierId` | string (uuid) or null |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: A supplier's price history  (as Accounts)**

> Approved POs only, newest first; filter by productId. Needs See cost (403 otherwise).

*Request*

```http
GET /api/v1/suppliers/6f159560-ed51-4b2f-ba94-0a31cb00f5be/price-history?pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "poId": "f8c7034b-8ce2-4677-b5a3-9cdb89b04d00",
      "poNumber": "PO-2627-0002",
      "poDate": "2026-11-05",
      "status": "CLOSED",
      "supplier": {
        "id": "6f159560-ed51-4b2f-ba94-0a31cb00f5be",
        "code": "SUP-001",
        "name": "LG Electronics Bangladesh"
      },
      "product": {
        "id": "399190ed-9ba8-4df8-9974-a5d254b0774b",
        "code": "LG-S4-Q18KL3AA",
        "name": "LG Dual Inverter split AC 1.5 Ton",
        "unitCode": "set"
      },
      "currency": "BDT",
      "qty": "25.000",
      "unitPrice": "61000.0000",
      "exchangeRate": "1.0000",
      "unitPriceBdt": "61000.0000"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 2,
    "totalPages": 1
  }
}
```

#### POST /suppliers — Create a supplier

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

The code (SUP-001…) is assigned automatically. Names are unique (case-insensitive).

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 1–150 chars |
| `type` | LOCAL \| FOREIGN |  |  |
| `defaultCurrency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  |  |
| `currency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  | Deprecated alias of defaultCurrency (Module 2) |
| `contactPerson` | string or null |  | max 100 chars |
| `phone` | string or null |  | max 30 chars |
| `email` | string (email) or null |  | max 200 chars |
| `address` | string or null |  | max 300 chars |
| `brandsSupplied` | string or null |  | max 300 chars |
| `paymentTermsNote` | string or null |  | max 500 chars |
| `notes` | string or null |  | max 2000 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse)

**Example: Create a local supplier  (as Admin)**

> Needs purchasing FULL. The code (SUP-005) is assigned by the server; type FOREIGN suppliers get imported POs.

*Request*

```http
POST /api/v1/suppliers
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Banani Copper & Insulation Co.",
  "type": "LOCAL",
  "defaultCurrency": "BDT",
  "contactPerson": "Jahangir Alam",
  "phone": "+880 1715 223344",
  "email": "sales@bananicopper.example.com",
  "address": "Kemal Ataturk Avenue, Banani, Dhaka",
  "brandsSupplied": "Copper pipe, NBR insulation, brass fittings",
  "paymentTermsNote": "15 days credit",
  "notes": "Delivers to both warehouses within 48 hours."
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/suppliers/5b375a3e-001a-45b0-9edc-fe897518a933

{
  "data": {
    "id": "5b375a3e-001a-45b0-9edc-fe897518a933",
    "code": "SUP-005",
    "name": "Banani Copper & Insulation Co.",
    "type": "LOCAL",
    "defaultCurrency": "BDT",
    "currency": "BDT",
    "contactPerson": "Jahangir Alam",
    "phone": "+880 1715 223344",
    "email": "sales@bananicopper.example.com",
    "address": "Kemal Ataturk Avenue, Banani, Dhaka",
    "brandsSupplied": "Copper pipe, NBR insulation, brass fittings",
    "paymentTermsNote": "15 days credit",
    "notes": "Delivers to both warehouses within 48 hours.",
    "isActive": true,
    "openPoCount": 0,
    "createdAt": "2026-11-05T08:09:05.513Z",
    "updatedAt": "2026-11-05T08:09:05.513Z"
  }
}
```

#### PATCH /suppliers/{id} — Update a supplier

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` = FULL |

`isActive: true` reactivates.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–150 chars |
| `type` | LOCAL \| FOREIGN |  |  |
| `defaultCurrency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  |  |
| `currency` | BDT \| USD \| EUR \| CNY \| MYR \| THB |  | Deprecated alias of defaultCurrency |
| `contactPerson` | string or null |  | max 100 chars |
| `phone` | string or null |  | max 30 chars |
| `email` | string (email) or null |  | max 200 chars |
| `address` | string or null |  | max 300 chars |
| `brandsSupplied` | string or null |  | max 300 chars |
| `paymentTermsNote` | string or null |  | max 500 chars |
| `notes` | string or null |  | max 2000 chars |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse)

**Example: Update contact details and payment terms  (as Admin)**

> Partial update: send only the fields that change.

*Request*

```http
PATCH /api/v1/suppliers/5b375a3e-001a-45b0-9edc-fe897518a933
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "phone": "+880 1715 223355",
  "paymentTermsNote": "30 days after delivery",
  "brandsSupplied": "Copper pipe, NBR insulation, brass fittings, drain pipe"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "5b375a3e-001a-45b0-9edc-fe897518a933",
    "code": "SUP-005",
    "name": "Banani Copper & Insulation Co.",
    "type": "LOCAL",
    "defaultCurrency": "BDT",
    "currency": "BDT",
    "contactPerson": "Jahangir Alam",
    "phone": "+880 1715 223355",
    "email": "sales@bananicopper.example.com",
    "address": "Kemal Ataturk Avenue, Banani, Dhaka",
    "brandsSupplied": "Copper pipe, NBR insulation, brass fittings, drain pipe",
    "paymentTermsNote": "30 days after delivery",
    "notes": "Delivers to both warehouses within 48 hours.",
    "isActive": true,
    "openPoCount": 0,
    "createdAt": "2026-11-05T08:09:05.513Z",
    "updatedAt": "2026-11-05T08:09:05.546Z"
  }
}
```

#### POST /suppliers/{id}/deactivate — Deactivate a supplier

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |

Never deleted; inactive suppliers can't get new POs or GRNs.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Deactivate a supplier  (as Admin)**

> No body. Inactive suppliers stay on old POs but can't be chosen for new ones (422 INACTIVE_SUPPLIER).

*Request*

```http
POST /api/v1/suppliers/5b375a3e-001a-45b0-9edc-fe897518a933/deactivate
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "5b375a3e-001a-45b0-9edc-fe897518a933",
    "code": "SUP-005",
    "name": "Banani Copper & Insulation Co.",
    "type": "LOCAL",
    "defaultCurrency": "BDT",
    "currency": "BDT",
    "contactPerson": "Jahangir Alam",
    "phone": "+880 1715 223355",
    "email": "sales@bananicopper.example.com",
    "address": "Kemal Ataturk Avenue, Banani, Dhaka",
    "brandsSupplied": "Copper pipe, NBR insulation, brass fittings, drain pipe",
    "paymentTermsNote": "30 days after delivery",
    "notes": "Delivers to both warehouses within 48 hours.",
    "isActive": false,
    "openPoCount": 0,
    "createdAt": "2026-11-05T08:09:05.513Z",
    "updatedAt": "2026-11-05T08:09:05.573Z"
  }
}
```

## 16. Admin and setup (website only)

These endpoints exist for the website's admin pages. The mobile app doesn't need them, but they are documented so the reference is complete.

### 16.1 Users and roles

#### GET /users — List users

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

Search (`q`) matches name, username, phone and email.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: name, username, createdAt, lastLoginAt, status · e.g. name |
| `q` | string | Free-text search · max 200 chars |
| `status` | active \| disabled or null | active \| disabled |
| `roleId` | string (uuid) or null |  |
| `warehouseId` | string (uuid) or null |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List users (search, page)  (as Admin)**

*Request*

```http
GET /api/v1/users?q=a&pageSize=2&sort=name
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "cc6b764f-4b51-4ed1-b464-aa7466c7c5f4",
      "username": "karim.manager",
      "name": "Karim Hossain",
      "phone": "+8801811000222",
      "email": "karim@technocool.com.bd",
      "status": "active",
      "isLocked": false,
      "role": {
        "id": "db6cd5df-05b3-472c-be74-b704b89c1de2",
        "name": "Manager"
      },
      "warehouses": [
        {
          "id": "679657a8-b803-4b11-94da-1f935226970a",
          "code": "A",
          "name": "Warehouse A"
        },
        // … 1 more
      ],
      "lastLoginAt": null,
      "createdAt": "2026-11-05T08:01:09.293Z",
      "updatedAt": "2026-11-05T08:01:09.293Z"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 4,
    "totalPages": 2
  }
}
```

*More examples in the full reference:* Error: no permission for this module  (as Store Manager)

#### POST /users — Create a user

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

Username is case-insensitive and unique; at least one warehouse is required.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 1–100 chars |
| `username` | string | Yes | Case-insensitive; stored lower-case |
| `phone` | string or null |  | max 20 chars |
| `email` | string (email) or null |  | max 200 chars |
| `roleId` | string (uuid) | Yes |  |
| `warehouseIds` | array of string (uuid) | Yes | At least one warehouse id · at least 1 item, at most 50 items |
| `password` | string | Yes | 8–128 chars |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Create a Store Manager for Warehouse A  (as Admin)**

*Request*

```http
POST /api/v1/users
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Rahim Uddin",
  "username": "rahim.store",
  "password": "Rahim-2026!",
  "phone": "+8801711000111",
  "email": "rahim@technocool.com.bd",
  "roleId": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
  "warehouseIds": [
    "679657a8-b803-4b11-94da-1f935226970a"
  ]
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/users/101938e4-f941-4001-9d92-0ba19dc1ff9b

{
  "data": {
    "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
    "username": "rahim.store",
    "name": "Rahim Uddin",
    "phone": "+8801711000111",
    "email": "rahim@technocool.com.bd",
    "status": "active",
    "isLocked": false,
    "role": {
      "id": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
      "name": "Store Manager"
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      }
    ],
    "lastLoginAt": null,
    "createdAt": "2026-11-05T08:01:09.267Z",
    "updatedAt": "2026-11-05T08:01:09.267Z"
  }
}
```

*More examples in the full reference:* Error: username already taken  (as Admin)

#### GET /users/{id} — Get a user

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a user  (as Admin)**

*Request*

```http
GET /api/v1/users/101938e4-f941-4001-9d92-0ba19dc1ff9b
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
    "username": "rahim.store",
    "name": "Rahim Uddin",
    "phone": "+8801711000111",
    "email": "rahim@technocool.com.bd",
    "status": "active",
    "isLocked": false,
    "role": {
      "id": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
      "name": "Store Manager"
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      }
    ],
    "lastLoginAt": null,
    "createdAt": "2026-11-05T08:01:09.267Z",
    "updatedAt": "2026-11-05T08:01:09.267Z"
  }
}
```

#### PATCH /users/{id} — Update a user (not the password)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

You cannot change your own role. Send only the fields to change.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 1–100 chars |
| `username` | string |  | Case-insensitive; stored lower-case |
| `phone` | string or null |  | max 20 chars |
| `email` | string (email) or null |  | max 200 chars |
| `roleId` | string (uuid) |  |  |
| `warehouseIds` | array of string (uuid) |  | At least one warehouse id · at least 1 item, at most 50 items |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Give a user both warehouses  (as Admin)**

*Request*

```http
PATCH /api/v1/users/101938e4-f941-4001-9d92-0ba19dc1ff9b
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "warehouseIds": [
    "679657a8-b803-4b11-94da-1f935226970a",
    // … 1 more
  ],
  "phone": "+8801711000999"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
    "username": "rahim.store",
    "name": "Rahim Uddin",
    "phone": "+8801711000999",
    "email": "rahim@technocool.com.bd",
    "status": "active",
    "isLocked": false,
    "role": {
      "id": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
      "name": "Store Manager"
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      },
      // … 1 more
    ],
    "lastLoginAt": null,
    "createdAt": "2026-11-05T08:01:09.267Z",
    "updatedAt": "2026-11-05T08:01:09.355Z"
  }
}
```

#### POST /users/{id}/password — Set a user's password (Admin only)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

Users cannot change their own password. Unlocks a locked account and revokes all of the user's sessions.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `password` | string | Yes | 8–128 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Set a new password (also unlocks the account)  (as Admin)**

> Signs the user out of every device.

*Request*

```http
POST /api/v1/users/101938e4-f941-4001-9d92-0ba19dc1ff9b/password
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "password": "Rahim-2026-new!"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
    "username": "rahim.store",
    "name": "Rahim Uddin",
    "phone": "+8801711000999",
    "email": "rahim@technocool.com.bd",
    "status": "active",
    "isLocked": false,
    "role": {
      "id": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
      "name": "Store Manager"
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      },
      // … 1 more
    ],
    "lastLoginAt": null,
    "createdAt": "2026-11-05T08:01:09.267Z",
    "updatedAt": "2026-11-05T08:01:09.378Z"
  }
}
```

#### POST /users/{id}/disable — Disable a user

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

Revokes all of the user's sessions immediately. You cannot disable yourself.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Disable a user  (as Admin)**

*Request*

```http
POST /api/v1/users/101938e4-f941-4001-9d92-0ba19dc1ff9b/disable
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
    "username": "rahim.store",
    "name": "Rahim Uddin",
    "phone": "+8801711000999",
    "email": "rahim@technocool.com.bd",
    "status": "disabled",
    "isLocked": false,
    "role": {
      "id": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
      "name": "Store Manager"
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      },
      // … 1 more
    ],
    "lastLoginAt": null,
    "createdAt": "2026-11-05T08:01:09.267Z",
    "updatedAt": "2026-11-05T08:01:09.396Z"
  }
}
```

#### POST /users/{id}/enable — Re-enable a disabled user

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Enable a user again  (as Admin)**

*Request*

```http
POST /api/v1/users/101938e4-f941-4001-9d92-0ba19dc1ff9b/enable
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
    "username": "rahim.store",
    "name": "Rahim Uddin",
    "phone": "+8801711000999",
    "email": "rahim@technocool.com.bd",
    "status": "active",
    "isLocked": false,
    "role": {
      "id": "c91bf72c-f8ea-4977-9feb-f99888dfbb08",
      "name": "Store Manager"
    },
    "warehouses": [
      {
        "id": "679657a8-b803-4b11-94da-1f935226970a",
        "code": "A",
        "name": "Warehouse A"
      },
      // … 1 more
    ],
    "lastLoginAt": null,
    "createdAt": "2026-11-05T08:01:09.267Z",
    "updatedAt": "2026-11-05T08:01:09.420Z"
  }
}
```

#### GET /roles — List roles with permissions, flags and user counts

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List roles  (as Admin)**

*Request*

```http
GET /api/v1/roles
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "2c2d2b5c-7466-49f6-877e-a0123328676e",
      "name": "Admin",
      "description": "Full access to everything. Locked.",
      "isLocked": true,
      "permissions": {
        "dashboard": "FULL",
        "catalog": "FULL",
        "inventory": "FULL",
        "purchasing": "FULL",
        "projects": "FULL",
        "reports": "FULL",
        "users": "FULL",
        "overheads": "FULL"
      },
      "flags": {
        "seeCost": true,
        "seeProfit": true,
        "seeMargin": true
      },
      "userCount": 1,
      "permissionVersion": 1,
      "createdAt": "2026-11-05T08:01:08.866Z",
      "updatedAt": "2026-11-05T08:01:08.866Z"
    },
    // … 2 more
  ]
}
```

#### GET /roles/matrix — Roles × modules permission matrix (overview grid)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Permission matrix (modules × roles)  (as Admin)**

*Request*

```http
GET /api/v1/roles/matrix
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "modules": [
      {
        "key": "dashboard",
        "label": "Dashboard"
      },
      // … 2 more
    ],
    "roles": [
      {
        "id": "2c2d2b5c-7466-49f6-877e-a0123328676e",
        "name": "Admin",
        "isLocked": true,
        "userCount": 1,
        "permissions": {
          "dashboard": "FULL",
          "catalog": "FULL",
          "inventory": "FULL",
          "purchasing": "FULL",
          "projects": "FULL",
          "reports": "FULL",
          "users": "FULL",
          "overheads": "FULL"
        },
        "flags": {
          "seeCost": true,
          "seeProfit": true,
          "seeMargin": true
        }
      },
      // … 2 more
    ]
  }
}
```

#### POST /roles — Create a custom role (blank or copied from another role)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string | Yes | 2–50 chars |
| `description` | string or null |  | max 200 chars |
| `copyFromRoleId` | string (uuid) |  | Start with the permissions and flags of this role; omit for a blank role (all NONE) |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Create a role, starting from Store Manager  (as Admin)**

*Request*

```http
POST /api/v1/roles
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Site Engineer",
  "description": "Receives material at project sites",
  "copyFromRoleId": "c91bf72c-f8ea-4977-9feb-f99888dfbb08"
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/roles/290eb06d-b0f3-4bd4-a78b-e4521eea8493

{
  "data": {
    "id": "290eb06d-b0f3-4bd4-a78b-e4521eea8493",
    "name": "Site Engineer",
    "description": "Receives material at project sites",
    "isLocked": false,
    "permissions": {
      "dashboard": "VIEW",
      "catalog": "VIEW",
      "inventory": "CREATE",
      "purchasing": "NONE",
      "projects": "NONE",
      "reports": "NONE",
      "users": "NONE",
      "overheads": "NONE"
    },
    "flags": {
      "seeCost": false,
      "seeProfit": false,
      "seeMargin": false
    },
    "userCount": 0,
    "permissionVersion": 1,
    "createdAt": "2026-11-05T08:01:09.440Z",
    "updatedAt": "2026-11-05T08:01:09.440Z"
  }
}
```

#### GET /roles/{id} — Get a role

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a role  (as Admin)**

*Request*

```http
GET /api/v1/roles/290eb06d-b0f3-4bd4-a78b-e4521eea8493
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "290eb06d-b0f3-4bd4-a78b-e4521eea8493",
    "name": "Site Engineer",
    "description": "Receives material at project sites",
    "isLocked": false,
    "permissions": {
      "dashboard": "VIEW",
      "catalog": "VIEW",
      "inventory": "CREATE",
      "purchasing": "NONE",
      "projects": "NONE",
      "reports": "NONE",
      "users": "NONE",
      "overheads": "NONE"
    },
    "flags": {
      "seeCost": false,
      "seeProfit": false,
      "seeMargin": false
    },
    "userCount": 0,
    "permissionVersion": 1,
    "createdAt": "2026-11-05T08:01:09.440Z",
    "updatedAt": "2026-11-05T08:01:09.440Z"
  }
}
```

#### PATCH /roles/{id} — Edit a role's name, permission levels and sensitive-data flags

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

The Admin role is locked (422).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `name` | string |  | 2–50 chars |
| `description` | string or null |  | max 200 chars |
| `permissions` | object |  | Only the modules you send are changed |
| `permissions.dashboard` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.catalog` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.inventory` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.purchasing` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.projects` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.reports` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.users` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `permissions.overheads` | NONE \| VIEW \| CREATE \| APPROVE \| FULL |  | Ordered: NONE < VIEW < CREATE < APPROVE < FULL |
| `flags` | object |  |  |
| `flags.seeCost` | boolean | Yes | May see cost fields |
| `flags.seeProfit` | boolean | Yes | May see profit fields |
| `flags.seeMargin` | boolean | Yes | May see contract value & margin fields |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 409 Conflict (duplicate, idempotency key reuse) · 422 Business rule violated

**Example: Change permissions and flags  (as Admin)**

*Request*

```http
PATCH /api/v1/roles/290eb06d-b0f3-4bd4-a78b-e4521eea8493
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "permissions": {
    "projects": "VIEW",
    "inventory": "CREATE"
  },
  "flags": {
    "seeCost": false
  }
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "290eb06d-b0f3-4bd4-a78b-e4521eea8493",
    "name": "Site Engineer",
    "description": "Receives material at project sites",
    "isLocked": false,
    "permissions": {
      "dashboard": "VIEW",
      "catalog": "VIEW",
      "inventory": "CREATE",
      "purchasing": "NONE",
      "projects": "VIEW",
      "reports": "NONE",
      "users": "NONE",
      "overheads": "NONE"
    },
    "flags": {
      "seeCost": false,
      "seeProfit": false,
      "seeMargin": false
    },
    "userCount": 0,
    "permissionVersion": 2,
    "createdAt": "2026-11-05T08:01:09.440Z",
    "updatedAt": "2026-11-05T08:01:09.467Z"
  }
}
```

#### DELETE /roles/{id} — Delete a custom role

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

Blocked (422) for the Admin role and for roles that still have users.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 204 Deleted · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Delete an unused role  (as Admin)**

*Request*

```http
DELETE /api/v1/roles/290eb06d-b0f3-4bd4-a78b-e4521eea8493
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

#### GET /login-history — Login attempts (success, wrong password, locked, disabled…)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: createdAt, result · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `userId` | string (uuid) or null |  |
| `result` | SUCCESS \| WRONG_PASSWORD \| LOCKED \| DISABLED \| UNKNOWN_USER \| RATE_LIMITED or null | SUCCESS \| WRONG_PASSWORD \| LOCKED \| DISABLED \| UNKNOWN_USER \| RATE_LIMITED |
| `from` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `to` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Sign-in history (filter by result)  (as Admin)**

*Request*

```http
GET /api/v1/login-history?pageSize=3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "c67b01d2-c2c6-446b-b286-fc5c15abd033",
      "usernameAttempted": "rahim.store",
      "result": "SUCCESS",
      "client": "mobile",
      "ip": null,
      "userAgent": "vitest",
      "createdAt": "2026-11-05T08:01:09.501Z",
      "user": {
        "id": "101938e4-f941-4001-9d92-0ba19dc1ff9b",
        "name": "Rahim Uddin",
        "username": "rahim.store"
      }
    },
    // … 2 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 3,
    "total": 5,
    "totalPages": 2
  }
}
```

#### GET /audit-logs — Audit trail of create / update / delete / disable / password changes

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `users` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: createdAt, action, entityType · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `userId` | string (uuid) or null | Actor user id |
| `entityType` | string or null | max 64 chars · e.g. User |
| `entityId` | string or null | max 64 chars |
| `action` | string or null | max 64 chars · e.g. user.update |
| `from` | string or null | Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-01 |
| `to` | string or null | Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time · e.g. 2026-10-31 |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Audit log (filter by entity)  (as Admin)**

*Request*

```http
GET /api/v1/audit-logs?entityType=User&pageSize=2
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [ /* same record as in GET /products/{id}/history */ ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 7,
    "totalPages": 4
  }
}
```

### 16.2 Settings

#### GET /inventory-settings — Inventory settings

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Read inventory settings  (as Admin)**

> inventory FULL only. Default: VAT 15 %, CI + BOE needed before an import GRN can be posted.

*Request*

```http
GET /api/v1/inventory-settings
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "defaultSalesVatPercent": "15.00",
    "adminWriteOffNeedsApproval": false,
    "allowAdminBelowCostSale": true,
    "fiscalYearStartMonth": 7,
    "importDocsRequiredToPost": [
      "CI",
      // … 1 more
    ]
  }
}
```

*More examples in the full reference:* Error: Store Manager can't read settings  (as Store Manager (Warehouse A))

#### PATCH /inventory-settings — Update inventory settings

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

Audit-logged.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `defaultSalesVatPercent` | string |  |  |
| `adminWriteOffNeedsApproval` | boolean |  |  |
| `allowAdminBelowCostSale` | boolean |  |  |
| `importDocsRequiredToPost` | array of BL \| CO \| PL \| CI \| BOE |  | Import documents (BL, CO, PL, CI, BOE) that need a number and a file before a GRN (Imported) can be posted · at most 5 items |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Also require the Bill of Lading before posting import GRNs  (as Admin)**

> Send only the settings to change.

*Request*

```http
PATCH /api/v1/inventory-settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "importDocsRequiredToPost": [
    "BL",
    // … 2 more
  ],
  "defaultSalesVatPercent": "15"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "defaultSalesVatPercent": "15.00",
    "adminWriteOffNeedsApproval": false,
    "allowAdminBelowCostSale": true,
    "fiscalYearStartMonth": 7,
    "importDocsRequiredToPost": [
      "BL",
      // … 2 more
    ]
  }
}
```

#### GET /purchasing-settings — Purchasing settings

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` ≥ VIEW |
| **Mobile app** | Not used (web / admin only) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Read purchasing settings  (as Manager)**

*Request*

```http
GET /api/v1/purchasing-settings
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "defaultTerms": "1. Prices are fixed for this order.\n2. Deliver to the warehouse named above with a delivery challan quoting this PO number.\n3. Goods are subject to inspection on receipt; damaged units will be returned.\n4. Payment as per the agreed terms after receipt of goods and invoice.",
    "defaultVatPercent": "15.00"
  }
}
```

#### PATCH /purchasing-settings — Update purchasing settings

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `purchasing` = FULL |
| **Mobile app** | Not used (web / admin only) |

Default PO terms and VAT %. Audit-logged.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `defaultTerms` | string or null |  | max 5000 chars |
| `defaultVatPercent` | string |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Update default PO terms and VAT  (as Admin)**

> Needs purchasing FULL. New local POs default to this VAT % and these terms.

*Request*

```http
PATCH /api/v1/purchasing-settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "defaultTerms": "1. Prices are fixed for this order.\n2. Deliver to the warehouse named above with a delivery challan quoting this PO number.\n3. Goods are subject to inspection on receipt; damaged units will be returned.\n4. Payment as per the agreed terms after receipt of goods and invoice.",
  "defaultVatPercent": "15"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "defaultTerms": "1. Prices are fixed for this order.\n2. Deliver to the warehouse named above with a delivery challan quoting this PO number.\n3. Goods are subject to inspection on receipt; damaged units will be returned.\n4. Payment as per the agreed terms after receipt of goods and invoice.",
    "defaultVatPercent": "15.00"
  }
}
```

### 16.3 Opening stock (go-live)

#### GET /opening-stock/warehouses — Opening lock status per warehouse

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Opening-lock status per warehouse  (as Admin)**

*Request*

```http
GET /api/v1/opening-stock/warehouses
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
      "code": "A",
      "name": "Warehouse A",
      "isActive": true,
      "openingLocked": false,
      "openingLockedAt": null,
      "openingLockedBy": null
    },
    // … 1 more
  ]
}
```

*More examples in the full reference:* After locking Warehouse A  (as Admin)

#### GET /opening-stock/template — Download the opening-stock template

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

Columns: Warehouse code, Product code, Condition, Quantity, Unit cost (BDT), Serial numbers, Note. A Lists sheet has the valid warehouses and active products.

**Responses:** 200 Template · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Download the opening-stock template  (as Admin)**

> Excel file with 3 sheets: 'Opening stock' (headers only), 'Lists' (valid warehouse and product codes), 'Help'.

*Request*

```http
GET /api/v1/opening-stock/template
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="stockbook-opening-stock-template.xlsx"

<binary file: 14,795 bytes>
```

#### POST /opening-stock/imports — Upload a filled template

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

Multipart `file` (.xlsx ≤ 10 MB, ≤ 5000 rows). The worker validates it; poll GET /opening-stock/imports/{id}.

**Request body (multipart/form-data)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `file` | file | Yes |  |

**Responses:** 202 Queued for validation · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Upload a filled template (first try, with mistakes)  (as Admin)**

> multipart/form-data with one field 'file' (.xlsx, max 10 MB). Returns 202: a worker validates it; poll GET /opening-stock/imports/{id} until status is VALID or INVALID.

*Request*

```http
POST /api/v1/opening-stock/imports
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file = <file opening-stock-go-live.xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, 9,604 bytes>
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json
Location: /api/v1/opening-stock/imports/f3109156-bc50-4153-92ac-6c1a2a3056b3

{
  "data": {
    "id": "f3109156-bc50-4153-92ac-6c1a2a3056b3",
    "fileName": "opening-stock-go-live.xlsx",
    "status": "QUEUED",
    "totalRows": 0,
    "validLines": 0,
    "errors": [],
    "warnings": [],
    "summary": [],
    "entries": [],
    "failedReason": null,
    "createdBy": {
      "id": "6543835a-6c8c-4ba5-a959-53f4d0084f53",
      "name": "System Administrator"
    },
    "createdAt": "2026-11-05T08:06:29.527Z",
    "committedAt": null
  }
}
```

#### GET /opening-stock/imports — Recent imports

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: Recent imports (latest 10)  (as Admin)**

*Request*

```http
GET /api/v1/opening-stock/imports
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "adef85f1-cb15-42d5-adcc-804b167debae",
      "fileName": "opening-stock-go-live-v2.xlsx",
      "status": "COMMITTED",
      "totalRows": 11,
      "validLines": 10,
      "errors": [],
      "warnings": [
        {
          "row": 7,
          "field": "Product code",
          "message": "Merged with row 6 (same product, warehouse and condition): quantities added."
        }
      ],
      "summary": [
        {
          "lines": 6,
          "totalQty": "584.000",
          "totalValue": "2674150.00",
          "warehouseId": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
          "warehouseCode": "A"
        },
        // … 1 more
      ],
      "entries": [
        {
          "id": "5d032678-d2c1-4aaf-bfce-4bc630e4414a",
          "number": "OPN-2627-0001",
          "warehouse": "A"
        },
        // … 1 more
      ],
      "failedReason": null,
      "createdBy": {
        "id": "6543835a-6c8c-4ba5-a959-53f4d0084f53",
        "name": "System Administrator"
      },
      "createdAt": "2026-11-05T08:06:29.758Z",
      "committedAt": "2026-11-05T08:06:30.282Z"
    },
    // … 1 more
  ]
}
```

#### GET /opening-stock/imports/{id} — Import status, row errors and per-warehouse summary

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Mobile app** | Not used (web / admin only) |

Values (`varianceValue`, `gainValue`, `lossValue`, `netValue`, `totalValue`) are removed without `seeCost`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Validation result: INVALID with row errors  (as Admin)**

> Each error has the Excel row, the column and a message. Fix the file and upload it again; nothing was posted.

*Request*

```http
GET /api/v1/opening-stock/imports/f3109156-bc50-4153-92ac-6c1a2a3056b3
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "f3109156-bc50-4153-92ac-6c1a2a3056b3",
    "fileName": "opening-stock-go-live.xlsx",
    "status": "INVALID",
    "totalRows": 5,
    "validLines": 1,
    "errors": [
      {
        "row": 3,
        "field": "Warehouse code",
        "message": "Unknown warehouse 'C'. Use a code from the Lists sheet."
      },
      // … 2 more
    ],
    "warnings": [],
    "summary": [
      {
        "lines": 1,
        "totalQty": "24.000",
        "totalValue": "1464000.00",
        "warehouseId": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
        "warehouseCode": "A"
      }
    ],
    "entries": [],
    "failedReason": null,
    "createdBy": {
      "id": "6543835a-6c8c-4ba5-a959-53f4d0084f53",
      "name": "System Administrator"
    },
    "createdAt": "2026-11-05T08:06:29.527Z",
    "committedAt": null
  }
}
```

*More examples in the full reference:* Validation result: VALID with per-warehouse summary  (as Admin)

#### POST /opening-stock/imports/{id}/commit — Import and post

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `inventory` = FULL |
| **Idempotency-Key** | Required (header) |
| **Mobile app** | Not used (web / admin only) |

`Idempotency-Key` header required. Only when there are no errors. One OPENING entry per warehouse through the posting engine, all in one transaction. Committing again changes nothing (alreadyCommitted: true).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found · 422 Business rule violated

**Example: Import and post (one OPENING entry per warehouse)  (as Admin)**

> Idempotency-Key required. All-or-nothing: any failure posts nothing. Committing again returns alreadyCommitted: true.

*Request*

```http
POST /api/v1/opening-stock/imports/adef85f1-cb15-42d5-adcc-804b167debae/commit
Authorization: Bearer <accessToken>
Idempotency-Key: da7d7e9d-0d45-4265-90a0-f9eef88af954
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "adef85f1-cb15-42d5-adcc-804b167debae",
    "fileName": "opening-stock-go-live-v2.xlsx",
    "status": "COMMITTED",
    "totalRows": 11,
    "validLines": 10,
    "errors": [],
    "warnings": [
      {
        "row": 7,
        "field": "Product code",
        "message": "Merged with row 6 (same product, warehouse and condition): quantities added."
      }
    ],
    "summary": [
      {
        "lines": 6,
        "totalQty": "584.000",
        "totalValue": "2674150.00",
        "warehouseId": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
        "warehouseCode": "A"
      },
      // … 1 more
    ],
    "entries": [
      {
        "id": "5d032678-d2c1-4aaf-bfce-4bc630e4414a",
        "number": "OPN-2627-0001",
        "warehouse": "A"
      },
      // … 1 more
    ],
    "failedReason": null,
    "createdBy": {
      "id": "6543835a-6c8c-4ba5-a959-53f4d0084f53",
      "name": "System Administrator"
    },
    "createdAt": "2026-11-05T08:06:29.758Z",
    "committedAt": "2026-11-05T08:06:30.282Z",
    "alreadyCommitted": false
  }
}
```

#### POST /warehouses/{id}/lock-opening — Lock opening stock (go-live)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

Admin only. Afterwards OPENING entries and imports for the warehouse get 422 OPENING_LOCKED. Audit-logged.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Lock opening stock for Warehouse A (go-live)  (as Admin)**

> Admin only. Idempotency-Key optional. Afterwards OPENING entries and imports for A get 422 OPENING_LOCKED.

*Request*

```http
POST /api/v1/warehouses/582d9a1b-24ca-4c79-b38f-4e6560e0d0f5/lock-opening
Authorization: Bearer <accessToken>
Idempotency-Key: f789f9cb-8ce6-469a-b521-230149e7b461
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
    "code": "A",
    "name": "Warehouse A",
    "isActive": true,
    "openingLocked": true,
    "openingLockedAt": "2026-11-05T08:06:30.479Z",
    "openingLockedBy": {
      "id": "6543835a-6c8c-4ba5-a959-53f4d0084f53",
      "name": "System Administrator"
    }
  }
}
```

#### POST /warehouses/{id}/unlock-opening — Unlock opening stock

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Idempotency-Key** | Optional (header) — recommended |
| **Mobile app** | Not used (web / admin only) |

Admin only, reason required (audit-logged).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reason` | string | Yes | 3–500 chars |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Unlock opening stock (Admin, with a reason)  (as Admin)**

> Admin only; reason (3–500 characters) is required and audit-logged.

*Request*

```http
POST /api/v1/warehouses/582d9a1b-24ca-4c79-b38f-4e6560e0d0f5/unlock-opening
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reason": "20 m of 3/8 copper pipe found in an unopened carton"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "582d9a1b-24ca-4c79-b38f-4e6560e0d0f5",
    "code": "A",
    "name": "Warehouse A",
    "isActive": true,
    "openingLocked": false,
    "openingLockedAt": null,
    "openingLockedBy": null
  }
}
```

### 16.4 Scheduled report emails

#### GET /report-schedules — List schedules

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL.

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | 1-based page number · min 1, default 1 · e.g. 1 |
| `pageSize` | integer | Items per page (max 100) · min 1, max 100, default 20 · e.g. 20 |
| `sort` | string | Comma-separated fields, '-' prefix for descending. Allowed: createdAt, nextRunAt, reportId · e.g. -createdAt |
| `q` | string | Free-text search · max 200 chars |
| `reportId` | string | max 60 chars |
| `ownerId` | string (uuid) | Reports FULL only (others always see their own) |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked)

**Example: List schedules  (as Admin)**

> Reports FULL sees everyone's schedules; VIEW sees only their own.

*Request*

```http
GET /api/v1/report-schedules
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "b9e92a75-a966-4914-bffe-71c4b0f7a5b7",
      "reportId": "sales",
      "reportTitle": "Sales report",
      "reportNumber": 11,
      "params": {
        "dateTo": "lastMonthEnd",
        "dateFrom": "lastMonthStart"
      },
      "frequency": "MONTHLY",
      "dayOfWeek": null,
      "dayOfMonth": 1,
      "time": "10:00",
      "description": "Monthly · 1st 10:00 AM",
      "format": "XLSX",
      "recipientUserIds": [
        "d897c97a-d7ba-4f66-8095-5c22bcb14dcc"
      ],
      "externalEmails": [],
      "isActive": true,
      "owner": {
        "id": "d897c97a-d7ba-4f66-8095-5c22bcb14dcc",
        "name": "Nusrat Jahan"
      },
      "nextRunAt": "2026-12-01T04:00:00.000Z",
      "lastRunAt": null,
      "lastStatus": null,
      "createdAt": "2026-11-05T08:10:41.903Z",
      "updatedAt": "2026-11-05T08:10:41.903Z"
    },
    // … 1 more
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

#### POST /report-schedules — Create a schedule

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Every user recipient must have `reports` ≥ VIEW. Times are Asia/Dhaka; `dayOfMonth` 31 means the last day of each month. Audited.

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reportId` | string | Yes | 1–60 chars |
| `params` | object |  |  |
| `frequency` | DAILY \| WEEKLY \| MONTHLY | Yes |  |
| `dayOfWeek` | integer or null |  | WEEKLY: 0 = Sunday … 6 = Saturday · min 0, max 6 |
| `dayOfMonth` | integer or null |  | MONTHLY: 1–31 (31 = the last day of every month) · min 1, max 31 |
| `time` | string | Yes | Asia/Dhaka |
| `format` | XLSX \| PDF \| BOTH | Yes |  |
| `recipientUserIds` | array of string (uuid) |  | at most 50 items, default [] |
| `externalEmails` | array of string (email) |  | Reports FULL only · at most 20 items, default [] |
| `isActive` | boolean |  | default true |

**Responses:** 201 Created · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Create a weekly schedule  (as Admin)**

> dayOfWeek 0 = Sunday; time is Asia/Dhaka; nextRunAt is UTC. External emails need Reports FULL.

*Request*

```http
POST /api/v1/report-schedules
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reportId": "stock-summary",
  "params": {
    "includeZero": "false"
  },
  "frequency": "WEEKLY",
  "dayOfWeek": 0,
  "time": "09:00",
  "format": "XLSX",
  "recipientUserIds": [
    "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
    // … 1 more
  ],
  "externalEmails": [
    "md.office@stockbook.example.com"
  ]
}
```

*Response*

```http
HTTP 201 Created
Content-Type: application/json
Location: /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85

{
  "data": {
    "id": "5ca3b580-de41-431a-ac8c-731873dd9b85",
    "reportId": "stock-summary",
    "reportTitle": "Stock summary",
    "reportNumber": 1,
    "params": {
      "includeZero": "false"
    },
    "frequency": "WEEKLY",
    "dayOfWeek": 0,
    "dayOfMonth": null,
    "time": "09:00",
    "description": "Weekly · Sunday 9:00 AM",
    "format": "XLSX",
    "recipientUserIds": [
      "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      // … 1 more
    ],
    "externalEmails": [
      "md.office@stockbook.example.com"
    ],
    "isActive": true,
    "owner": {
      "id": "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      "name": "System Administrator"
    },
    "nextRunAt": "2026-11-08T03:00:00.000Z",
    "lastRunAt": null,
    "lastStatus": null,
    "createdAt": "2026-11-05T08:10:41.882Z",
    "updatedAt": "2026-11-05T08:10:41.882Z"
  }
}
```

*More examples in the full reference:* Create a monthly schedule (last month's sales)  (as Accounts) · Error: recipient without Reports access  (as Admin)

#### GET /report-schedules/{id} — Get a schedule

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Get a schedule  (as Admin)**

*Request*

```http
GET /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "5ca3b580-de41-431a-ac8c-731873dd9b85",
    "reportId": "stock-summary",
    "reportTitle": "Stock summary",
    "reportNumber": 1,
    "params": {
      "includeZero": "false"
    },
    "frequency": "WEEKLY",
    "dayOfWeek": 0,
    "dayOfMonth": null,
    "time": "09:00",
    "description": "Weekly · Sunday 9:00 AM",
    "format": "XLSX",
    "recipientUserIds": [
      "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      // … 1 more
    ],
    "externalEmails": [
      "md.office@stockbook.example.com"
    ],
    "isActive": true,
    "owner": {
      "id": "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      "name": "System Administrator"
    },
    "nextRunAt": "2026-11-08T03:00:00.000Z",
    "lastRunAt": null,
    "lastStatus": null,
    "createdAt": "2026-11-05T08:10:41.882Z",
    "updatedAt": "2026-11-05T08:10:41.882Z"
  }
}
```

#### PATCH /report-schedules/{id} — Edit a schedule

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Audited.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Request body (application/json)**

| Field | Type | Req. | Description |
|---|---|---|---|
| `reportId` | string |  | 1–60 chars |
| `params` | object |  |  |
| `frequency` | DAILY \| WEEKLY \| MONTHLY |  |  |
| `dayOfWeek` | integer or null |  | WEEKLY: 0 = Sunday … 6 = Saturday · min 0, max 6 |
| `dayOfMonth` | integer or null |  | MONTHLY: 1–31 (31 = the last day of every month) · min 1, max 31 |
| `time` | string |  | Asia/Dhaka |
| `format` | XLSX \| PDF \| BOTH |  |  |
| `recipientUserIds` | array of string (uuid) |  | at most 50 items |
| `externalEmails` | array of string (email) |  | at most 20 items |
| `isActive` | boolean |  |  |

**Responses:** 200 OK · 400 Validation error · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Move it to Thursday 5:30 PM  (as Admin)**

> Send only the fields to change; nextRunAt is recomputed when the timing changes.

*Request*

```http
PATCH /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "dayOfWeek": 4,
  "time": "17:30"
}
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "5ca3b580-de41-431a-ac8c-731873dd9b85",
    "reportId": "stock-summary",
    "reportTitle": "Stock summary",
    "reportNumber": 1,
    "params": {
      "includeZero": "false"
    },
    "frequency": "WEEKLY",
    "dayOfWeek": 4,
    "dayOfMonth": null,
    "time": "17:30",
    "description": "Weekly · Thursday 5:30 PM",
    "format": "XLSX",
    "recipientUserIds": [
      "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      // … 1 more
    ],
    "externalEmails": [
      "md.office@stockbook.example.com"
    ],
    "isActive": true,
    "owner": {
      "id": "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      "name": "System Administrator"
    },
    "nextRunAt": "2026-11-05T11:30:00.000Z",
    "lastRunAt": null,
    "lastStatus": null,
    "createdAt": "2026-11-05T08:10:41.882Z",
    "updatedAt": "2026-11-05T08:10:41.946Z"
  }
}
```

#### POST /report-schedules/{id}/pause — Pause a schedule

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Audited.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Pause  (as Admin)**

> nextRunAt becomes null.

*Request*

```http
POST /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85/pause
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "5ca3b580-de41-431a-ac8c-731873dd9b85",
    "reportId": "stock-summary",
    "reportTitle": "Stock summary",
    "reportNumber": 1,
    "params": {
      "includeZero": "false"
    },
    "frequency": "WEEKLY",
    "dayOfWeek": 4,
    "dayOfMonth": null,
    "time": "17:30",
    "description": "Weekly · Thursday 5:30 PM",
    "format": "XLSX",
    "recipientUserIds": [
      "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      // … 1 more
    ],
    "externalEmails": [
      "md.office@stockbook.example.com"
    ],
    "isActive": false,
    "owner": {
      "id": "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      "name": "System Administrator"
    },
    "nextRunAt": null,
    "lastRunAt": null,
    "lastStatus": null,
    "createdAt": "2026-11-05T08:10:41.882Z",
    "updatedAt": "2026-11-05T08:10:41.963Z"
  }
}
```

#### POST /report-schedules/{id}/resume — Resume a schedule (next run recalculated)

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Audited.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Resume  (as Admin)**

*Request*

```http
POST /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85/resume
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "id": "5ca3b580-de41-431a-ac8c-731873dd9b85",
    "reportId": "stock-summary",
    "reportTitle": "Stock summary",
    "reportNumber": 1,
    "params": {
      "includeZero": "false"
    },
    "frequency": "WEEKLY",
    "dayOfWeek": 4,
    "dayOfMonth": null,
    "time": "17:30",
    "description": "Weekly · Thursday 5:30 PM",
    "format": "XLSX",
    "recipientUserIds": [
      "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      // … 1 more
    ],
    "externalEmails": [
      "md.office@stockbook.example.com"
    ],
    "isActive": true,
    "owner": {
      "id": "c848a832-2290-4bd3-a3b6-e25f2744e4f8",
      "name": "System Administrator"
    },
    "nextRunAt": "2026-11-05T11:30:00.000Z",
    "lastRunAt": null,
    "lastStatus": null,
    "createdAt": "2026-11-05T08:10:41.882Z",
    "updatedAt": "2026-11-05T08:10:41.977Z"
  }
}
```

#### POST /report-schedules/{id}/run-now — Run a schedule now

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Queues a run with the owner's current permissions; the regular schedule is unchanged. Audited.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 202 Queued · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Run now  (as Admin)**

> Queues an immediate run (the regular schedule is unchanged). Poll GET …/runs for the result.

*Request*

```http
POST /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85/run-now
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 202 Accepted
Content-Type: application/json

{
  "data": {
    "runId": "a28e46a4-220d-4371-bb9c-96c998eccc37",
    "status": "RUNNING"
  }
}
```

#### GET /report-schedules/{id}/runs — Run history

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Query parameters (all optional unless marked)**

| Name | Type | Description |
|---|---|---|
| `page` | integer | min 1, default 1 |
| `pageSize` | integer | min 1, max 100, default 20 |

**Responses:** 200 OK · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Run history  (as Admin)**

> One file per audience (recipients with different visibility get different files). downloadable = this user may download it.

*Request*

```http
GET /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85/runs
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": [
    {
      "id": "a28e46a4-220d-4371-bb9c-96c998eccc37",
      "trigger": "MANUAL",
      "status": "SUCCESS",
      "startedAt": "2026-11-05T08:10:41.990Z",
      "finishedAt": "2026-11-05T08:10:42.162Z",
      "error": null,
      "rowCount": 5,
      "emailed": 3,
      "files": [
        {
          "index": 0,
          "name": "stock-summary-2026-11-05.xlsx",
          "format": "XLSX",
          "downloadable": true
        },
        // … 1 more
      ]
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

#### GET /report-schedules/{id}/runs/{runId}/files/{index} — Download a run's file

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Only when the caller can see everything the file was generated for (flags and warehouses).

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |
| `runId` | string (uuid) |  |
| `index` | integer |  |

**Responses:** 200 The file (xlsx or pdf) · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Download a run's file  (as Admin)**

*Request*

```http
GET /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85/runs/a28e46a4-220d-4371-bb9c-96c998eccc37/files/0
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="stock-summary-2026-11-05.xlsx"

<binary file: 8,621 bytes>
```

#### DELETE /report-schedules/{id} — Delete a schedule

| | |
|---|---|
| **Auth** | Authorization: Bearer <accessToken> |
| **Who can call** | Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's |
| **Mobile app** | Not used (web / admin only) |

External email addresses need FULL. Audited.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | string (uuid) |  |

**Responses:** 204 Deleted · 401 Not authenticated, or token expired / revoked · 403 Forbidden (missing permission, CSRF rejected, account disabled/locked) · 404 Not found

**Example: Delete a schedule  (as Admin)**

*Request*

```http
DELETE /api/v1/report-schedules/5ca3b580-de41-431a-ac8c-731873dd9b85
Authorization: Bearer <accessToken>
```

*Response*

```http
HTTP 204 No Content
```

### 16.5 System

#### GET /health — Liveness / readiness: checks PostgreSQL and Redis

| | |
|---|---|
| **Auth** | None (public) |

> Use it for a "server reachable?" check on the login screen.

**Responses:** 200 OK · 503 A dependency is down

**Example: Health check (no auth)**

*Request*

```http
GET /api/v1/health
```

*Response*

```http
HTTP 200 OK
Content-Type: application/json

{
  "data": {
    "status": "ok",
    "checks": {
      "database": {
        "status": "up",
        "latencyMs": 2
      },
      "redis": {
        "status": "up",
        "latencyMs": 1
      }
    },
    "time": "2026-11-05T08:01:09.535Z"
  }
}
```

## Appendix A. Business-rule codes

A `422` (and some `400` / `403`) error carries a machine-readable reason in `details[].code`. The `message` is always readable by people, so the app normally just shows it; use the code when the app should react (e.g. offer "Submit for verification instead").

| details[].code | Module | Meaning |
|---|---|---|
| `ALREADY_ACTIVE` | catalog | This product is already active. |
| `ALREADY_DISCONTINUED` | catalog | This product is already discontinued. |
| `CATALOG_IN_USE` | catalog | This catalog has … product…. Deactivate it instead of deleting. |
| `CATEGORY_IN_USE` | catalog | This category is used by … product…. Deactivate it instead of deleting. |
| `CODE_IMMUTABLE` | catalog | A product's code can't be changed after it is created. |
| `custom` | catalog | Enter an amount ≥ 0 with at most 2 decimals. |
| `INACTIVE_CATALOG` | catalog | Catalog '…' is inactive. Choose an active catalog. |
| `INACTIVE_CATEGORY` | catalog | Category '…' is inactive. Choose an active category. |
| `INACTIVE_SUPPLIER` | catalog | Supplier '…' is inactive. |
| `INACTIVE_UNIT` | catalog | Unit '…' is inactive. Choose an active unit. |
| `invalid_string` | catalog | Code must be 2–31 characters: A–Z, 0–9 and '-', starting with a letter or digit. |
| `invalid_type` | catalog | Choose a brand. |
| `PHOTO_LIMIT` | catalog | A product can have at most … photos. |
| `PURCHASE_FACTOR_INVALID` | catalog | The purchase unit conversion factor must be greater than 0. |
| `PURCHASE_UNIT_INCOMPLETE` | catalog | Set both the purchase unit and its conversion factor, or neither. |
| `too_small` | catalog | Item name is required. |
| `UNKNOWN_CATALOG` | catalog | The selected catalog does not exist. |
| `UNKNOWN_CATEGORY` | catalog | The selected category does not exist. |
| `UNKNOWN_SUPPLIER` | catalog | The selected default supplier does not exist. |
| `UNKNOWN_UNIT` | catalog | The selected unit does not exist. |
| `CANNOT_CHANGE_OWN_ROLE` | identity | You cannot change your own role. |
| `CANNOT_DISABLE_SELF` | identity | You cannot disable your own account. |
| `invalid_enum_value` | identity | Invalid enum value. Expected 'ANDROID' \| 'IOS', received 'WINDOWS' |
| `LAST_ADMIN` | identity | At least one active user must keep the Admin role. |
| `ROLE_IN_USE` | identity | This role is assigned to … user…. Move them to another role before deleting it. |
| `ROLE_LOCKED` | identity | The Admin role is locked and cannot be edited or deleted. |
| `UNKNOWN_ROLE` | identity | The selected role does not exist. |
| `UNKNOWN_WAREHOUSE` | identity | One or more selected warehouses do not exist or are inactive. |
| `APPROVAL_REQUIRED` | inventory | Write-offs need verification (inventory settings). Submit it for verification instead. |
| `ATTACHMENT_LIMIT` | inventory | A document can have at most … files (…). |
| `BELOW_COST` | inventory | Selling price is below average cost for …. |
| `CONDITION_NOT_ALLOWED` | inventory | Condition DAMAGED is only allowed on returns from site, write-offs and returns to supplier. |
| `COUNT_IN_PROGRESS` | inventory | Stock count … is in progress in …… |
| `DAMAGED_NOT_ALLOWED` | inventory | Damaged stock can't be issued, sold or transferred — only written off or returned to the supplier. |
| `DISCOUNT_TOO_HIGH` | inventory | Discount can't be more than the subtotal. |
| `FILE_TOO_LARGE` | inventory | Each file must be 10 MB or smaller. |
| `FUTURE_DATE` | inventory | The entry date can't be in the future. |
| `IMPORT_DOCS_MISSING` | inventory | Import documents missing before posting: …. |
| `IMPORT_DOCS_NOT_ALLOWED` | inventory | … only apply to GRN (Imported) entries. |
| `INSUFFICIENT_STOCK` | inventory | Not enough …stock of … in …: … available, … requested. |
| `INVALID_FILE_TYPE` | inventory | Import documents must be PDF, JPG or PNG files. |
| `INVALID_STATUS` | inventory | Can't … an entry that is …. |
| `LINES_NOT_COUNTED` | inventory | 1 line(s) have no counted quantity. Count them, or mark them "not counted = 0". |
| `NOT_EDITABLE` | inventory | Only draft or rejected entries can be edited (this one is …). |
| `OPENING_LOCKED` | inventory | Opening stock for … is locked. An Admin must unlock it (with a reason) first. |
| `OVER_RECEIPT` | inventory | Only … of … is still to be received on … (… entered). To receive more, an approver must amend the PO first. |
| `PRODUCT_DISCONTINUED` | inventory | … is discontinued and can't be used in new entries. |
| `PRODUCT_NOT_ON_PO` | inventory | … is not on purchase order …. |
| `PROJECT_STATUS` | inventory | Project … is …; …. |
| `REASON_REQUIRED` | inventory | Give a reason to remove a file from a posted entry. |
| `RECOUNT_PENDING` | inventory | 1 line(s) flagged for recount haven't been counted again yet. |
| `RETURN_EXCEEDS` | inventory | Only … of … from the original entry can still be returned. |
| `REVERSAL_NEGATIVE_STOCK` | inventory | Reversing would make stock of … in … negative. |
| `SAME_WAREHOUSE` | inventory | Choose a different destination warehouse. |
| `SERIAL_COUNT` | inventory | … tracks serial numbers: enter exactly … serial number(s) (got …). |
| `SERIAL_DUPLICATE` | inventory | Serial … is listed twice. |
| `SERIAL_EXISTS` | inventory | Serial … already exists (…). |
| `SERIAL_UNAVAILABLE` | inventory | Serial … can't be used: …. |
| `SERIALS_MOVED` | inventory | Serial … has moved since this entry was posted, so the entry can't be reversed. |
| `COST_VOIDED` | overheads | This cost is already voided. |
| `MONTH_TOO_FAR` | overheads | The month can't be more than one month in the future. |
| `SCOPE_CATEGORY` | overheads | A warehouse cost is a store charge or a holding cost. |
| `WAREHOUSE_NOT_ALLOWED` | overheads | A company cost has no warehouse. |
| `WAREHOUSE_REQUIRED` | overheads | Choose the warehouse. |
| `COST_NOT_EDITABLE` | projects | Only overhead costs (store charge, holding, established cost) can be edited. Void a labour, transport or other cost and add it again. |
| `INVALID_TRANSITION` | projects | A project can't go from … to …. |
| `PROJECT_CLOSED` | projects | Project … is closed; it can't be changed. |
| `PROJECT_HAS_OPEN_ENTRIES` | projects | The project can't be closed while stock entries are still open: …. Approve, reject or receive them first. |
| `AMEND_BELOW_RECEIVED` | purchasing | … can't go below … (already received or pending receipt). |
| `DUPLICATE_PRODUCT` | purchasing | … is on the PO twice. Use one line with the total quantity. |
| `LINE_PRODUCT_FIXED` | purchasing | A PO line's product can't be changed. Remove the line and add a new one. |
| `NO_CHANGES` | purchasing | Nothing changed: amend at least one quantity, price, line or date. |
| `NOTHING_TO_ORDER` | purchasing | None of the selected products can be ordered (they must be active). |
| `PO_HAS_RECEIPTS` | purchasing | Goods were already received (or a GRN is pending) against this PO, so it can't be cancelled. Close it instead. |
| `PO_NOT_RECEIVABLE` | purchasing | Purchase order … is …: goods can be received only while it is approved, sent or partly received. |
| `PO_PENDING_RECEIPTS` | purchasing | A GRN against this PO is waiting for verification. Approve or reject it first. |
| `PO_TYPE_FIXED` | purchasing | The PO type is fixed once created: choose a supplier of the same type (local / foreign). |
| `PRICE_REQUIRED` | purchasing | Enter a unit price greater than 0 for …. |
| `EXPORT_NOT_READY` | reporting | The export isn't ready yet. |
| `EXPORT_TOO_LARGE` | reporting | This export has … rows; the limit is …. Narrow the filters and try again. |

## Appendix B. Money fields removed by role

The API removes these keys (at any depth) from every response for users without the flag. They are absent, not `null`.

| Flag | Field names |
|---|---|
| seeCost | cost, purchaseCost, unitCost, costPrice, purchasePrice, landedCost, averageCost, totalCost, costValue, unitCostBdt, landedUnitCost, costAmount, costTotal, avgCost, avgCostBefore, avgCostAfter, valueChange, stockValue, transitValue, goodsBdt, chargeShare, varianceValue, gainValue, lossValue, netValue, totalValue, totalBdt, unitPriceBdt, totalOrderedBdt, issuedCost, returnedCost, netCost, netMaterialCost, materialCost, labourCost, transportCost, otherCost, costsTotal, orderedValueBdt, receivedValueBdt, importedValueBdt, localValueBdt, unitPriceForeign, priceChangePercent, pendingValue, valueAge0to30, valueAge31to90, valueAge91to180, valueAge180plus, salesCost, netCostValue, ciValue, landedCostTotal |
| seeProfit | profit, grossProfit, netProfit, profitAmount, profitPercent |
| seeMargin | margin, marginPercent, marginAmount, contractValue, costUsedPercent |
| overheads ≥ VIEW + seeCost | storeChargeCost, holdingCost, establishmentCost, overheadCost, fullCost, directMargin, directMarginPercent, directCostUsedPercent, overheadsThisMonth, overheadsNotCharged, overheadPercentOfDirect |

Some modules remove more than these names: entries priced at cost (every type except SALE) also drop `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts without `seeCost`; purchase orders drop prices and totals.

## Appendix C. Endpoints that require an Idempotency-Key

| Endpoint |
|---|
| POST /stock-entries |
| POST /stock-entries/{id}/submit |
| POST /stock-entries/{id}/post |
| POST /stock-entries/{id}/approve |
| POST /stock-entries/{id}/reject |
| POST /stock-entries/{id}/cancel |
| POST /stock-entries/{id}/reverse |
| POST /stock-entries/{id}/receive |
| POST /stock-counts/{id}/start |
| POST /stock-counts/{id}/submit |
| POST /stock-counts/{id}/approve |
| POST /stock-counts/{id}/request-recount |
| POST /stock-counts/{id}/cancel |
| POST /opening-stock/imports/{id}/commit |
| POST /purchase-orders |
| POST /purchase-orders/{id}/submit |
| POST /purchase-orders/{id}/approve |
| POST /purchase-orders/{id}/reject |
| POST /purchase-orders/{id}/mark-sent |
| POST /purchase-orders/{id}/close |
| POST /purchase-orders/{id}/cancel |
| POST /purchase-orders/{id}/amend |
| POST /purchase-orders/{id}/email |
| POST /purchase-orders/from-low-stock |
| POST /projects/{id}/status |
| POST /projects/{id}/costs |
| POST /projects/{id}/costs/{costId}/void |
| POST /warehouse-costs/{id}/void |
