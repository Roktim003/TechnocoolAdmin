# Security review

Scope: the StockBook web app, REST API (`/api/v1`), Server Actions, worker and the production image, as of version 0.7.0 (Module 7). Reviewed against the **OWASP Top 10 (2021)** and the **OWASP API Security Top 10 (2023)**. Every row points at code and at a test that would fail if the control broke. Hosting-level controls (firewall, TLS certificate, OS patching) depend on the server, which is not chosen yet; they are listed under [Open items](#open-items).

How the main controls are enforced:

- **Every route** goes through `authedRoute` / `publicRoute` (`src/shared/http/route.ts`), which applies authentication, the permission check, warehouse scope, rate limits, body limits, idempotency, sensitive-field stripping, error mapping and logging in one place.
- **Every Server Action** goes through `authedAction` (`src/shared/http/action.ts`). A test fails if a `"use server"` file exports anything else (`tests/integration/admin-pages-actions.test.ts`).
- **The authorization matrix** (`tests/integration/authorization-matrix.test.ts`, snapshot [authorization-matrix.md](authorization-matrix.md)) discovers every `route.ts` on disk, calls all **198 endpoints** as anonymous, Admin, Accounts, Manager, Store Manager (Warehouse A) and Store Manager limited to Warehouse B, and compares with the expected rule. CI fails on a changed status **or on a route that has no rule**.

## OWASP Top 10 (2021)

| # | Risk | Controls | Evidence |
|---|---|---|---|
| A01 | Broken access control | Permission per module and level on every route; warehouse scope applied in services and queries (not in the UI); objects in another warehouse answer 403/404; Admin-only system pages check `users FULL` on the server. **Found and fixed by the matrix in this module:** serial numbers were readable across warehouses (`GET /serials`, `/serials/{id}`); now scoped like stock (`stock-query.service.ts`, `prisma-inventory.store.ts`). | `authorization-matrix.test.ts` (198 × 6), `admin-pages-actions.test.ts` (actions can't bypass scope), `roles.test.ts`, `inventory-workflow.test.ts` |
| A02 | Cryptographic failures | bcrypt cost 12 in production (startup refuses less); JWT secrets ≥ 32 bytes, must differ, placeholders refused in production; refresh tokens stored hashed; cookies `HttpOnly`, `SameSite=Lax`, `Secure` (`COOKIE_SECURE`); HSTS when `APP_URL` is https; backups AES-256 (PBKDF2-SHA256, 200k iterations) and only encrypted dumps go off-site; export links HMAC-signed, 1 hour. | `config.test.ts`, `hardening.test.ts` (bcrypt cost, HSTS), unit `hardening.test.ts` (encryption round-trip, wrong key), `auth.test.ts` |
| A03 | Injection | Prisma parameterised queries; reports use the `sql` tagged template (bound parameters). The few `$queryRawUnsafe` calls take constant SQL, generated identifiers (escaped) or bound parameters — never request text. Zod validates every input. React escapes output; CSP blocks inline script. PDFs are rendered from internal templates with JavaScript disabled. | `src/modules/reporting/infrastructure/sql.ts`, `prisma-ops.store.ts`; `reports.test.ts`; unit `hardening.test.ts` (CSP) |
| A04 | Insecure design | Append-only ledger enforced by database triggers (StockMovement, SerialMovement, AuditLog, lines of posted entries); corrections only by reversal / adjustment; stock-changing POSTs need an `Idempotency-Key`; approvals with separation of roles; nightly integrity check that reports and never fixes. | `data-integrity.test.ts`, `idempotency.test.ts`, `inventory-posting.test.ts` |
| A05 | Security misconfiguration | Env validated at start (fails closed); CSP with per-request nonce (`script-src 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`/`unsafe-eval` in production), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP; CORS closed unless `CORS_ORIGINS` lists an origin, never with credentials; non-root container, `no-new-privileges`; PostgreSQL and Redis on an internal network with no published ports; errors never return stack traces. | unit + integration `hardening.test.ts` (headers, CORS), CI `image` job (`id -u` = 1001) |
| A06 | Vulnerable and outdated components | `npm run audit:deps` in CI fails on any high/critical advisory not in `security/audit-allowlist.json`; each exception has a reason and an expiry date (CI fails again when it passes). Base images pinned by digest. Upgraded in this module: nodemailer 10, sharp 0.35, puppeteer-core 25, Vitest 4 (removes the critical tinypool advisory), esbuild 0.28. | `scripts/audit-deps.mjs`, `.github/workflows/ci.yml` (`security`) |
| A07 | Identification and authentication failures | Lockout after 5 failures in 15 minutes (429 + `Retry-After`); Admin-set passwords ≥ 10 characters and not on the common-password list; refresh-token rotation with reuse detection (family revoked); web sessions end after 30 minutes idle (refresh refused); Admin **Log out all devices** revokes refresh tokens and invalidates issued access tokens; refresh rate-limited per IP. | `auth.test.ts`, `hardening.test.ts` (idle timeout, logout all, refresh limit), `identity-rules.test.ts` |
| A08 | Software and data integrity failures | No deserialisation of untrusted objects; uploads checked by content (sharp), not name; CI builds the image from the lockfile (`npm ci`), tags it with the commit, scans for secrets (gitleaks, whole history). Backups carry a SHA-256 and are restore-tested monthly. | `catalog-photos.test.ts`, `backup-restore.test.ts`, `.gitleaks.toml` |
| A09 | Security logging and monitoring failures | Immutable audit log for every change (actor, IP, request id, before/after); login history; structured JSON logs (request id, user, route, status, duration) with secrets, tokens and cost fields redacted at any depth; Sentry when configured; Admin alerts on failed backups, restore tests, integrity checks and job failure spikes. | unit `hardening.test.ts` (log redaction), `system.test.ts`, `admin-pages-actions.test.ts` (alerts) |
| A10 | Server-side request forgery | The server fetches no user-supplied URLs. Puppeteer allows only `data:` and `about:blank` (every other request is aborted) and runs templates with JavaScript off. S3 / SMTP endpoints come only from configuration. | unit `hardening.test.ts` (`isAllowedPdfRequest`), `src/modules/inventory/infrastructure/pdf.ts` |

## OWASP API Security Top 10 (2023)

| # | Risk | Controls | Evidence |
|---|---|---|---|
| API1 | Broken object level authorization | Every object read or write is checked against the caller's warehouses (entries, stock, serials, counts, POs receivable, projects' stock); jobs and exports are visible only to the requester; signed download links. | matrix "Store Mgr (B only)" column; `report-exports.test.ts` |
| API2 | Broken authentication | As A07. Bearer (mobile) and cookie (web) paths share one verifier; cookie mutations need a same-origin check (CSRF). | `auth.test.ts` (CSRF, bearer, cookie) |
| API3 | Broken object property level authorization | Sensitive fields (cost, value, margin, supplier prices) are stripped from responses by role flag (`seeCost`) in one place; create schemas whitelist fields (extras ignored), **update schemas are strict** (unknown fields → 400), so status, cost or passwords can't be set through a generic PATCH. | `sensitive-fields.test.ts` (unit + integration), `hardening.test.ts` (mass assignment) |
| API4 | Unrestricted resource consumption | Rate limits per user (300 API calls/min, 10 exports or PDFs/min), per IP for refresh, per username for login — Redis, 429 + `Retry-After`; JSON bodies ≤ 1 MB and uploads ≤ `MAX_UPLOAD_MB` checked before parsing (413); page size ≤ 100 for lists, ≤ 200 for report screens; every request array has a `max()`; report queries read-only with a statement timeout; exports capped (Excel 100,000 rows, PDF 5,000); one Chromium, restarted every 50 PDFs. | `hardening.test.ts` (limits, 413), `reports.test.ts` |
| API5 | Broken function level authorization | Permission level per route (VIEW / CREATE / APPROVE / FULL) declared next to the handler and verified for all roles by the matrix; Server Actions use the same check. | `authorization-matrix.test.ts`, `admin-pages-actions.test.ts` |
| API6 | Unrestricted access to sensitive business flows | Posting, approving and reversing are separate permissions; idempotency keys prevent double posting on retries; below-cost sales need an explicit confirmation; negative stock is refused inside the posting transaction (row locks). Load test: 10 users posting to the same products, no negatives, no deadlocks ([performance.md](performance.md)). | `inventory-posting.test.ts`, `tests/load/stockbook.js` |
| API7 | Server-side request forgery | As A10. | — |
| API8 | Security misconfiguration | As A05; Swagger UI at `/api/docs` has its own nonce CSP and only documents (every protected call still needs a token). | `hardening.test.ts` |
| API9 | Improper inventory management | One versioned API (`/api/v1`); OpenAPI generated from the same Zod schemas and tested for completeness; the matrix fails on any route that is not listed, so nothing ships undocumented or untested. | `system.test.ts` (OpenAPI completeness), `authorization-matrix.test.ts` |
| API10 | Unsafe consumption of APIs | The only outbound integrations are S3-compatible storage and SMTP, both configured by the operator; storage objects are re-validated (images by content) and served only through authenticated routes. | `catalog-photos.test.ts` |

## Accepted risks (reviewed exceptions)

From `security/audit-allowlist.json` (expire 2027-01-31; CI fails after that date):

| Advisory | Package | Why it is acceptable now | Fix |
|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 | zod 3.25 | Memory exhaustion on huge constrained collections: bodies are capped at 1 MB before Zod sees them, and every request array has a `max()`. | Zod 4 + zod-to-openapi 8 (separate change: every schema) |
| GHSA-ggr8-5vv4-36mx | deepmerge-ts via the Prisma 6 CLI | Only merges the CLI's own config at migrate / generate time. | Prisma 7 |
| GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 | postcss inside Next 15 | Build time only, on StockBook's own stylesheets. | Next.js 16 |

Other known limits:

- **Rate limiting fails open** if Redis is down, so an outage doesn't lock everybody out. Readiness reports Redis down, and login lockout still applies once Redis is back.
- **`style-src 'unsafe-inline'`** is needed for React style attributes. Scripts stay nonce-only, so this doesn't allow script execution.
- **No MFA.** It is not in the requirements; Admin accounts should use long unique passwords.
- **Swagger UI** loads its assets from cdn.jsdelivr.net (nonce'd, `/api/docs` only).

## Open items

To do when the server and domain exist (not app code):

1. TLS certificate on the reverse proxy. Then set `APP_URL=https://…`, `COOKIE_SECURE=true`, and `TRUST_PROXY=true` only if the proxy sets `X-Forwarded-*`.
2. Firewall: only 80/443 (and SSH) open; port 3000 reachable only from the proxy.
3. OS security updates; Docker log rotation (set in the compose file).
4. `BACKUP_ENCRYPTION_KEY` and off-site storage: keep the key in a password manager, separate from the server. A lost key means unreadable backups.
5. `SENTRY_DSN` (optional) and an uptime monitor on `/api/v1/health/ready`.
6. Re-run the matrix, `npm run audit:deps` and gitleaks before go-live ([go-live.md](go-live.md)).
