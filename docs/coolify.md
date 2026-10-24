# Deploying StockBook on Coolify (Contabo VPS)

StockBook runs as **two services built from one Docker image**, plus managed PostgreSQL and Redis, and an S3-compatible bucket for files:

| Coolify resource | Type | Command | Notes |
|---|---|---|---|
| `stockbook-db` | PostgreSQL 16 | — | Coolify database resource |
| `stockbook-redis` | Redis 7 | — | Coolify database resource. AOF persistence recommended (BullMQ) |
| `stockbook-app` | Application (Dockerfile) | default (`node server.js`) | Public domain, port 3000. `RUN_MIGRATIONS=true` |
| `stockbook-worker` | Application (Dockerfile) | `node dist/worker.js` | No domain. `RUN_MIGRATIONS=false` |

## 1. Databases

1. **+ New → Database → PostgreSQL 16.** Note the *internal* connection URL (e.g. `postgresql://user:pass@stockbook-db:5432/postgres`). Append `?schema=public`.
2. **+ New → Database → Redis 7.** Note the internal URL (e.g. `redis://default:pass@stockbook-redis:6379`).
3. Enable scheduled backups for PostgreSQL (Coolify → database → Backups), e.g. daily to S3-compatible storage.
4. **Object storage:** create a **private** bucket (e.g. Contabo Object Storage → Buckets) and an access key. Product photos, and later invoices and challans, are stored there. Set up backups or versioning with your provider.

## 2. App service

1. **+ New → Application → (your Git repo)**, build pack **Dockerfile**, Dockerfile location `docker/Dockerfile`.
2. **Ports exposes:** `3000`. **Domain:** `https://stockbook.example.com`.
3. **Health check:** path `/api/v1/health`, port 3000.
4. **Environment variables** (mark secrets as such):

```
NODE_ENV=production
APP_URL=https://stockbook.example.com
TRUST_PROXY=true
TZ=Asia/Dhaka
DATABASE_URL=<internal postgres url>?schema=public
REDIS_URL=<internal redis url>
REDIS_KEY_PREFIX=sb:
JWT_ACCESS_SECRET=<48+ random chars>
REFRESH_TOKEN_SECRET=<48+ random chars, different>
COOKIE_SECURE=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong initial password>
ADMIN_NAME=System Administrator
RUN_MIGRATIONS=true
LOG_LEVEL=info
SERVICE_NAME=stockbook-app
S3_ENDPOINT=https://eu2.contabostorage.com
S3_REGION=default
S3_BUCKET=<private bucket name>
S3_ACCESS_KEY_ID=<access key>
S3_SECRET_ACCESS_KEY=<secret key>
S3_FORCE_PATH_STYLE=true
S3_AUTO_CREATE_BUCKET=false
SEED_SAMPLE_DATA=false
COMPANY_NAME=<company name printed on GRNs, challans and invoices>
SMTP_HOST=<smtp server, e.g. smtp.gmail.com or your provider>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp user>
SMTP_PASSWORD=<smtp password / app password>
SMTP_FROM=StockBook <no-reply@your-domain.com>
```

`SEED_SAMPLE_DATA=false` starts production with empty suppliers, customers and projects (the sample ones are for demos).

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Release:** on every deploy the container's entrypoint (`docker/entrypoint.sh`) runs `prisma migrate deploy` and then the idempotent seed (`node dist/seed.js`) before `node server.js` starts. A failed migration stops the container, so Coolify keeps the previous version running.

## 3. Worker service

Create a second application from the **same repository and Dockerfile** (Coolify builds the same image), then:

- **Custom start command:** `node dist/worker.js` (Coolify: *Configuration → General → Start command*, or a custom Docker run option).
- **No domain, no exposed port.** Disable the health check (the worker has no HTTP server).
- **Environment:** the same variables as the app, including the `S3_*` ones (the worker reads import files from storage and stores generated PDFs there), but `RUN_MIGRATIONS=false` and `SERVICE_NAME=stockbook-worker`.

The worker also sends email (queue `email`, retried with exponential backoff), validates opening-stock imports, checks low-stock crossings after postings and sends the daily low-stock digest (a repeatable job it schedules on start, 09:00 Asia/Dhaka by default). Give it the same `SMTP_*` variables as the app. Leave `SMTP_HOST` empty to run without email (in-app notifications still work).

The image includes Chromium and fonts (`PDF_BROWSER_PATH` is preset), which the worker uses to render stock documents (GRN, challan, invoice) to PDF; nothing else to install.

Deploy the app first, then the worker, so migrations finish before the worker connects. The worker logs `worker started` on boot. To check the queue end-to-end, run `npm run queue:test` from a machine that can reach the same Redis: the worker logs `ping job processed` and the script prints the result.

## 4. Proxy / security notes

- Coolify's proxy (Traefik/Caddy) terminates TLS and sets `X-Forwarded-For` / `X-Forwarded-Host` / `X-Forwarded-Proto`. `TRUST_PROXY=true` makes the app use them for client IPs (login history, audit) and the CSRF same-origin check.
- If the app is served on several hostnames, list the extra origins in `TRUSTED_ORIGINS`.
- `COOKIE_SECURE=true` is required in production (cookies are sent over HTTPS only).
- Swagger UI (`/api/docs`) loads its assets from cdn.jsdelivr.net. The API itself still needs a token for every protected call.

## 5. First login

Open `https://stockbook.example.com/login` and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Then create users under **Users & roles**, and set a new admin password from the same screen.
