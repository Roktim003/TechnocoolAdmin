#!/bin/sh
# StockBook container entrypoint. One image, several commands:
#
#   web           Next.js server (port 3000)
#   worker        background worker (WORKER_QUEUES picks the queues; default all)
#   migrate       one-off release step: backup → prisma migrate deploy → seed. Run it before
#                 starting a new version; web and worker never migrate on their own.
#   backup        one-off backup now          (node dist/ops.js backup)
#   restore-test  one-off restore test        (node dist/ops.js restore-test)
#   integrity     one-off integrity check     (node dist/ops.js integrity)
#   check-env     validate the configuration  (node dist/ops.js check-env)
#   smoke-test    post-deploy checks against SMOKE_URL (scripts/smoke-test.mjs)
#
# Anything else is executed as given (e.g. `sh`).
set -e

# NODE_MEMORY_MB caps the V8 heap of this process (see docs/deployment-notes.md for sizes).
if [ -n "${NODE_MEMORY_MB:-}" ]; then
  export NODE_OPTIONS="--max-old-space-size=${NODE_MEMORY_MB} ${NODE_OPTIONS:-}"
fi

migrate() {
  if [ "${BACKUP_BEFORE_MIGRATE:-true}" = "true" ]; then
    echo "[migrate] backup before migrating"
    if ! node dist/ops.js backup --trigger PRE_MIGRATION; then
      echo "[migrate] the pre-migration backup failed: not migrating (set BACKUP_BEFORE_MIGRATE=false to skip it)" >&2
      exit 1
    fi
  fi
  echo "[migrate] prisma migrate deploy"
  node node_modules/prisma/build/index.js migrate deploy
  echo "[migrate] seed (idempotent)"
  node dist/seed.js
}

case "${1:-web}" in
  web)
    # Legacy single-container setups: RUN_MIGRATIONS=true migrates before starting.
    if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then migrate; fi
    exec node server.js
    ;;
  worker)
    exec node dist/worker.js
    ;;
  migrate)
    migrate
    ;;
  backup | restore-test | integrity | check-env)
    exec node dist/ops.js "$@"
    ;;
  smoke-test)
    shift
    exec node scripts/smoke-test.mjs "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
