#!/bin/sh
# Release step for the app service: apply migrations and run the idempotent seed,
# then exec the container command (node server.js, or node dist/worker.js for the worker).
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[release] prisma migrate deploy"
  node node_modules/prisma/build/index.js migrate deploy
  echo "[release] seed"
  node dist/seed.js
fi

exec "$@"
