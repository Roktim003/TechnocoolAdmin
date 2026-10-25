#!/bin/sh
# Restore a StockBook backup into a database.
#
#   BACKUP_ENCRYPTION_KEY=... scripts/restore.sh <backup-file> <target-database-url> [--yes]
#
# - <backup-file>: a .dump.enc (encrypted) or .dump file made by the backup job or backup.sh.
# - <target-database-url>: the database to restore into; it must already exist (createdb).
# - If the target already has tables, you are asked to type its name before anything is
#   replaced (or pass --yes in scripts). Its existing StockBook tables are dropped and replaced.
#
# Needs pg_restore 16, psql and openssl (all in the StockBook image).
set -eu
( set -o pipefail 2>/dev/null ) && set -o pipefail

FILE="${1:-}"
TARGET="${2:-}"
YES="${3:-}"
if [ -z "$FILE" ] || [ -z "$TARGET" ]; then
  echo "usage: $0 <backup-file> <target-database-url> [--yes]" >&2
  exit 64
fi
[ -f "$FILE" ] || { echo "backup file not found: $FILE" >&2; exit 66; }

DB_URL=$(printf '%s' "$TARGET" | sed -E 's/([?&])(schema|connection_limit|pool_timeout|pgbouncer|statement_cache_size|socket_timeout|connect_timeout)=[^&]*&?/\1/g; s/[?&]$//')
DB_NAME=$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://[^/]*/([^?]*).*$#\1#')

TABLES=$(psql "$DB_URL" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
CLEAN=""
if [ "$TABLES" != "0" ]; then
  echo "The database '$DB_NAME' is not empty ($TABLES tables). Restoring REPLACES its data." >&2
  if [ "$YES" != "--yes" ]; then
    printf "Type the database name (%s) to continue: " "$DB_NAME" >&2
    read -r ANSWER
    [ "$ANSWER" = "$DB_NAME" ] || { echo "Cancelled: nothing was changed." >&2; exit 1; }
  fi
  CLEAN="--clean --if-exists"
fi

case "$FILE" in
  *.enc)
    : "${BACKUP_ENCRYPTION_KEY:?this backup is encrypted: set BACKUP_ENCRYPTION_KEY}"
    # shellcheck disable=SC2086
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:BACKUP_ENCRYPTION_KEY -in "$FILE" \
      | pg_restore --no-owner --no-privileges --exit-on-error $CLEAN --dbname="$DB_URL"
    ;;
  *)
    # shellcheck disable=SC2086
    pg_restore --no-owner --no-privileges --exit-on-error $CLEAN --dbname="$DB_URL" "$FILE"
    ;;
esac

ENTRIES=$(psql "$DB_URL" -At -c 'SELECT count(*) FROM "StockEntry"')
MOVES=$(psql "$DB_URL" -At -c 'SELECT count(*) FROM "StockMovement"')
LATEST=$(psql "$DB_URL" -At -c 'SELECT COALESCE(MAX("entryDate")::text, '\''none'\'') FROM "StockEntry"')
echo "restored into '$DB_NAME': $ENTRIES stock entries, $MOVES movements, latest entry date $LATEST" >&2
