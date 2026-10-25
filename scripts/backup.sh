#!/bin/sh
# StockBook database backup (the same format as the nightly backup job).
#
#   DATABASE_URL=postgresql://user:pass@host:5432/stockbook \
#   BACKUP_ENCRYPTION_KEY=... \
#   scripts/backup.sh [output-dir]          # default: $BACKUP_DIR or ./backups
#
# Writes stockbook-YYYYMMDD-HHMMSS-manual.dump.enc (pg_dump custom format, compressed, then
# AES-256 encrypted with openssl) — or .dump without BACKUP_ENCRYPTION_KEY — and prints its path.
# Needs pg_dump 16 and openssl (both are in the StockBook image: `docker compose run --rm backup sh`).
set -eu
( set -o pipefail 2>/dev/null ) && set -o pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${1:-${BACKUP_DIR:-./backups}}"
mkdir -p "$OUT_DIR"

# libpq rejects Prisma-only parameters (schema, connection_limit…): drop them, keep the rest (e.g. sslmode).
DB_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])(schema|connection_limit|pool_timeout|pgbouncer|statement_cache_size|socket_timeout|connect_timeout)=[^&]*&?/\1/g; s/[?&]$//')

STAMP=$(TZ=Asia/Dhaka date +%Y%m%d-%H%M%S)
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  NAME="stockbook-${STAMP}-manual.dump.enc"
else
  NAME="stockbook-${STAMP}-manual.dump"
  echo "warning: BACKUP_ENCRYPTION_KEY is not set: the backup is NOT encrypted" >&2
fi
FILE="$OUT_DIR/$NAME"
TMP="$FILE.partial"
trap 'rm -f "$TMP"' EXIT INT TERM
umask 077

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  pg_dump --format=custom --compress=6 --no-owner --no-privileges --dbname="$DB_URL" \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt -pass env:BACKUP_ENCRYPTION_KEY > "$TMP"
else
  pg_dump --format=custom --compress=6 --no-owner --no-privileges --dbname="$DB_URL" > "$TMP"
fi

mv "$TMP" "$FILE"
trap - EXIT INT TERM
SIZE=$(wc -c < "$FILE" | tr -d ' ')
echo "backup written: $FILE ($SIZE bytes)" >&2
echo "$FILE"
