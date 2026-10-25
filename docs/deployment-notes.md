# Deployment notes

Server-agnostic: what runs, what it needs, in which order, and how to go back. The server, domain, mail account and off-site storage are not chosen yet; nothing here depends on them. `docker-compose.prod.yml` is a working reference stack — use it as is on any Docker host, or copy its services into your platform.

## Services

One image (`docker/Dockerfile`, non-root user `nextjs` 1001, Node 22 Alpine, pinned by digest) runs every StockBook process; the command picks the role.

| Service | Command | Port | Needs | Notes |
|---|---|---|---|---|
| `migrate` | `migrate` | — | postgres, redis | One-off per release: pre-migration backup → `prisma migrate deploy` → idempotent seed. Exits 0. |
| `web` | `web` | 3000 | postgres, redis, storage | Next.js. The only service that is exposed (behind your HTTPS proxy). |
| `worker` | `worker` | — | postgres, redis, storage, SMTP (optional) | All queues except `backups` (`WORKER_QUEUES=*,!backups`): email, imports, PDFs, exports, schedules, alerts, integrity check. Has Chromium + IBM Plex + Noto Sans Bengali. |
| `backup` | `worker` | — | postgres, redis, `/backups` volume | Only the `backups` queue (`WORKER_QUEUES=backups`): nightly backup, monthly restore test, the Admin buttons. Has `pg_dump` / `pg_restore` 16. |
| `postgres` | PostgreSQL 16 | none | volume `pgdata` | Never published; internal network only. |
| `redis` | Redis 7, AOF on, `noeviction`, password | none | volume `redisdata` | Never published. Queues and sessions only — not backed up (see [backup-restore.md](backup-restore.md)). |

Other one-off commands from the same image: `backup`, `restore-test`, `integrity`, `check-env` (prints what is not set up yet), `smoke-test`, `node dist/seed-large.js` (test data — never on real data).

Volumes to keep: `pgdata`, `redisdata`, `backups`, and your file storage bucket (or `miniodata` with the local profile).

## Environment variables

Every variable is in [.env.example](../.env.example) (purpose, example, required or optional, secret or not), validated at start by `src/shared/config/env.ts`: a missing or invalid value stops the process with a clear message. [.env.prod.example](../.env.prod.example) is the short list the compose file reads.

**Required:** `APP_URL`, `DATABASE_URL` (built from `POSTGRES_PASSWORD` in the compose file), `REDIS_URL` (from `REDIS_PASSWORD`), `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_SECRET` (each ≥ 32 bytes, different from each other, no placeholder text), `ADMIN_USERNAME`, `ADMIN_PASSWORD` (≥ 10 characters, used once by the seed), `S3_*` for file storage.

**Fill in later** (all optional; the app runs and says so on **Admin → System health** until they are set):

| Variables | Until they are set |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No email leaves the server. Each email is logged with status `NOT_SENT_SMTP_MISSING`; in-app notifications work. Warning: "Email is not set up yet". |
| `BACKUP_ENCRYPTION_KEY` | Backups are written unencrypted and are never copied off-site. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET` | Backups stay in the `/backups` volume only. Warning: "Off-site backup not set up yet: backups are only on this server". |
| `SENTRY_DSN` | Errors go to the logs only. |
| `CORS_ORIGINS` | Cross-origin browser calls are refused (mobile apps and same-origin web are not affected). |

When the domain exists: set `APP_URL=https://…`, `COOKIE_SECURE=true` (HSTS is sent automatically when `APP_URL` is https), and `TRUST_PROXY=true` if a reverse proxy sets `X-Forwarded-*`.

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Never commit `.env.prod`; CI scans every commit with gitleaks.

## Start order

1. `postgres` and `redis` healthy.
2. `migrate` runs to completion (exit 0). A failed backup or migration exits non-zero and nothing new starts.
3. `web`, `worker` and `backup` start.

The compose file enforces this with `depends_on` (`service_completed_successfully` for `migrate`). Web and worker never migrate on their own.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d          # whole stack, in order
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm web check-env
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm -e SMOKE_URL=http://web:3000 \
  -e SMOKE_USERNAME=… -e SMOKE_PASSWORD=… web smoke-test
```

## Health

| URL | Meaning | Use for |
|---|---|---|
| `GET /api/v1/health` | Liveness: the process answers (version, commit, uptime). No dependency checks. | Container / proxy health check (the image's `HEALTHCHECK` uses it). |
| `GET /api/v1/health/ready` | Readiness: database, Redis, file storage, queue and a worker heartbeat younger than 2 minutes. 503 if any is down or while shutting down. | Load balancer "send traffic" check, smoke test, uptime monitor. |
| **Admin → System health** | Version, uptime, database size, storage, last backup / restore test / integrity check, email status, worker heartbeat, warnings. | People. |
| **Admin → Background jobs** | Per-queue counts, failed jobs with Retry. Admins are notified when failures in the last hour pass `FAILED_JOBS_ALERT_THRESHOLD`. | People. |

The worker containers have no HTTP port; their `HEALTHCHECK` checks the heartbeat file the worker refreshes every 30 s.

## Shutdown

`SIGTERM` (`docker stop`) is graceful: web stops taking new requests (503 + `Retry-After`), finishes in-flight ones, then closes the database, Redis and queues; the worker finishes its current jobs. Both give up after `SHUTDOWN_TIMEOUT_MS` (25 s) — compose waits 30 s (`stop_grace_period`). A job cut off at the limit is picked up again by another worker (BullMQ stalled-job check); every job is safe to run twice.

## Sizing

Set per service; defaults suit 8 GB.

| Variable | 8 GB server | 12 GB server | What it is |
|---|---|---|---|
| `WEB_DB_POOL` | 10 | 15 | Prisma connections for web |
| `WORKER_DB_POOL` | 5 | 8 | Prisma connections for the worker |
| `WEB_NODE_MEMORY_MB` / `WEB_MEM_LIMIT` | 768 / 1g | 1024 / 1536m | V8 heap / container limit, web |
| `WORKER_NODE_MEMORY_MB` / `WORKER_MEM_LIMIT` | 768 / 1536m | 1024 / 2g | Worker (Chromium runs inside this limit) |
| `PDF_CONCURRENCY` | 1 | 2 | PDFs rendered at once |
| `PDF_BROWSER_RESTART_AFTER` | 50 | 50 | Chromium restarts after this many PDFs (bounds its memory) |
| `POSTGRES_SHARED_BUFFERS` / `POSTGRES_EFFECTIVE_CACHE_SIZE` | 512MB / 1536MB | 1GB / 3GB | PostgreSQL memory |
| `POSTGRES_MAX_CONNECTIONS` | 100 | 100 | Must exceed the sum of all pools (+ backups, migrations) |
| `REDIS_MAXMEMORY` | 256mb | 512mb | Redis refuses writes beyond this (`noeviction`); watch it on System health |

Measured numbers for these settings are in [performance.md](performance.md).

## Releases and migrations

1. CI builds and tags the image with the commit (`ghcr.io/<owner>/<repo>:<sha>`) on `main`. There is no deploy step: pull the tag on the server and set `STOCKBOOK_IMAGE`.
2. `docker compose … up -d` runs `migrate` first (with a `PRE_MIGRATION` backup), then replaces `web`, `worker` and `backup`.
3. Run the smoke test.

Migrations follow **expand → migrate → contract**, so the previous release still runs against the new schema:

- **Expand** (release N): add tables, nullable columns, new enum values, indexes. Never rename or drop in the same release as the code change.
- **Migrate** (release N): code writes both shapes; backfill data in a migration or a job.
- **Contract** (release N+1 or later): drop the old column or table once no running release reads it.

## Rollback

| Situation | What to do |
|---|---|
| New release misbehaves, migration was expand-only (the normal case) | Point `STOCKBOOK_IMAGE` back to the previous tag and `up -d web worker backup`. The old code runs on the expanded schema. Do not run `migrate` with the old image. |
| `migrate` failed | Nothing new started; the previous containers keep running. Fix and release again. A failed migration is listed by `prisma migrate status`; resolve it (`prisma migrate resolve`) before retrying. |
| Data is damaged, or a contract migration must be undone | Stop `web`, `worker`, `backup`; restore the `PRE_MIGRATION` backup with `scripts/restore.sh` ([backup-restore.md](backup-restore.md)); start the previous image. Entries posted after that backup are lost, so note them first (Audit log). |
