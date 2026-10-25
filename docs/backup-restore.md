# Backup and restore

## What is backed up, when

| When | Trigger | Who runs it |
|---|---|---|
| Every night 2:00 AM (Asia/Dhaka) | `SCHEDULED` | `backup` service (BullMQ queue `backups`) |
| Before every migration | `PRE_MIGRATION` | the `migrate` command (skipped only on the very first deploy, when the database is empty). If the backup fails, the migration does not run. |
| **Admin → System health → Back up now** | `MANUAL` | `backup` service; audited (`system.backup.requested`) |
| By hand | `MANUAL` | `scripts/backup.sh`, or `docker compose … run --rm backup backup` |

Each backup is `pg_dump -Fc` (custom format, compressed) of the whole database. With `BACKUP_ENCRYPTION_KEY` set it is encrypted on the way to disk (AES-256-CBC, key from PBKDF2-SHA256 with 200,000 iterations; OpenSSL-compatible, so `openssl enc -d` can open it without StockBook). It is written to `BACKUP_DIR` (`/backups`, the `backups` volume) as `stockbook-YYYYMMDD-HHMMSS-<trigger>.dump[.enc]`, written to a temporary name first and renamed when complete, with a SHA-256 recorded on the `BackupRun` row.

**Off-site** (when `BACKUP_S3_*` is set): the encrypted file is uploaded to `<BACKUP_S3_BUCKET>/<BACKUP_S3_PREFIX>/db/` (prefix default `stockbook`), and the attachments bucket (product photos, entry and PO attachments, generated PDFs) is synced to `<prefix>/attachments/` (new and changed objects; nothing is deleted off-site when a file is deleted in the app). Unencrypted dumps never leave the server: without `BACKUP_ENCRYPTION_KEY` the off-site copy is skipped and System health says why.

**Retention**, the same in both places: the newest backup of each of the last **14 days**, **8 ISO weeks** and **12 months**; everything else is deleted after each successful backup. Pre-migration and manual backups count like any other.

**Until off-site storage is set up**, System health shows "Off-site backup not set up yet: backups are only on this server". A disk failure would then lose both the database and its backups — set `BACKUP_S3_*` and `BACKUP_ENCRYPTION_KEY` before go-live (or copy `/backups` elsewhere by other means).

**Failures** are recorded (`BackupRun.status = FAILED`, with the error) and every Admin gets an in-app notification (and email once SMTP is set). System health warns when the last successful backup is older than 26 hours.

### Why Redis is not backed up

Redis holds only things that can be lost or rebuilt: job queues (repeatable schedules are re-registered when the worker starts; a lost one-off job such as an export is simply requested again), rate-limit counters, idle-session timestamps, login-failure counters and idempotency keys. Every business record — stock, ledger, entries, users, audit log, email log, notifications, backup history — is in PostgreSQL. Redis runs with AOF so a normal restart loses nothing; after a Redis loss users sign in again (their idle-session key is gone) and nothing else changes.

## Restore tests

A backup that was never restored is not a backup. On the **1st of every month at 4:00 AM**, and on **Admin → System health → Test restore**, the `backup` service:

1. takes the newest backup (the local copy; the off-site one when nothing is left locally), decrypts it;
2. creates a temporary database `sb_restore_test_<timestamp>` on the same server and `pg_restore`s into it;
3. checks it: every core table exists, row counts match the counts recorded at backup time, and the full integrity check (below) passes on the restored data;
4. drops the temporary database (always, also on failure) and records a `RestoreTestRun` (passed / failed, duration, problems).

A failed test notifies Admins. System health shows the last test and warns when none passed in the last 35 days.

## Restoring for real

> Stop `web`, `worker` and `backup` first, so nothing writes during the restore. Entries made after the backup was taken are lost — export the Audit log or note them before you start.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop web worker backup
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backup sh
  # inside the container (the backups volume is at /backups):
  ls -lt /backups
  BACKUP_ENCRYPTION_KEY=… scripts/restore.sh /backups/stockbook-20261024-020000-scheduled.dump.enc "$DATABASE_URL"
  # the database is not empty → type its name to confirm; tables are dropped and replaced
  exit
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm web integrity    # must print only PASS
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d web worker backup
```

`scripts/restore.sh <file> <database-url> [--yes]`:

- works with `.dump.enc` (needs `BACKUP_ENCRYPTION_KEY`) and plain `.dump`;
- refuses to touch a non-empty database until you type its name (`--yes` skips the prompt — for scripts only);
- prints the number of entries and movements and the latest entry date when it is done.

To restore from the off-site copy, download `<prefix>/db/<file>` from the backup bucket into `/backups` first (any S3 client). To restore attachments, copy `<prefix>/attachments/` back into the files bucket.

**Restoring onto a new server:** start only `postgres` (and `redis`), create the database, restore as above, then run `migrate` (applies any migrations newer than the backup) and start the rest. Use the same `JWT_*` secrets to keep mobile sessions valid, or new ones to sign everybody out.

## Integrity check

Every night at **2:30 AM** (after the backup) and on **Admin → System health → Check integrity now**, a read-only check (one repeatable-read transaction; it never changes anything) compares:

| Check | Means |
|---|---|
| Balances = ledger | Every stock balance equals the sum of its movements |
| Average cost = ledger | Each product's cost record equals the latest ledger value |
| No negative stock | No balance below zero |
| Reserved = pending lines | Reserved quantity equals the pending OUT / TRANSFER lines |
| Serial status = last movement | Each serial's status and place match its latest serial movement |
| PO received = GRNs | Each PO line's received quantity equals its posted GRN lines |
| Unique document numbers | No document number is used twice |

Results are stored in `IntegrityCheckRun` and shown on System health; a failure notifies Admins with the failing checks and example rows. **The check only reports.** Fixing a difference is a decision for the Admin and Accounts (usually an adjustment entry, with a reason) — never automatic.

The ledger itself cannot be edited: database triggers refuse `UPDATE` / `DELETE` on `StockMovement`, `SerialMovement`, `AuditLog`, and on the lines of posted, received or reversed entries (`prisma/migrations/20261029000000_operations`; tests in `tests/integration/data-integrity.test.ts`). Corrections are always new entries (reversal, adjustment).

## Testing the scripts

`tests/integration/backup-restore.test.ts` (its own CI step) runs `scripts/backup.sh` and `scripts/restore.sh` against a temporary database, checks that the encrypted file opens with plain `openssl`, the confirmation prompt, the job path (local + MinIO off-site), retention and a restore test.
