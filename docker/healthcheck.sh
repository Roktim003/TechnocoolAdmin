#!/bin/sh
# Container HEALTHCHECK, the same for every command of the image:
#   worker (and the backup worker): it touches a heartbeat file every 30 s → healthy while that
#           file is younger than 2 minutes;
#   web:    no heartbeat file → GET /api/v1/health (liveness, no dependencies) must answer.
f="${TMPDIR:-/tmp}/stockbook-worker.alive"
if [ -f "$f" ]; then
  age=$(( $(date +%s) - $(date -r "$f" +%s) ))
  [ "$age" -lt 120 ] || exit 1
  exit 0
fi
wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null 2>&1 || exit 1
