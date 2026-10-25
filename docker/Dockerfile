# syntax=docker/dockerfile:1.7
# StockBook production image. One image, several commands (see docker/entrypoint.sh):
#   web | worker | migrate | backup | restore-test | integrity | check-env | smoke-test
#
#   docker build -f docker/Dockerfile --build-arg APP_VERSION=0.7.0 --build-arg GIT_COMMIT=$(git rev-parse HEAD) -t stockbook:0.7.0 .
#
# Base images are pinned by digest: update them on purpose (and rebuild), never by accident.

ARG NODE_IMAGE=node:22.22.0-alpine3.22@sha256:7aa86fa052f6e4b101557ccb56717cb4311be1334381f526fe013418fe157384

# ── deps: full install for building ─────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── build: prisma client, Next.js standalone, worker / ops / seed bundles ───
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── prod-deps: runtime node_modules only (worker, ops, seed and the prisma CLI) ──
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npx prisma generate && npm cache clean --force

# ── runner ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

# chromium: the worker renders PDFs. postgresql16-client: pg_dump / pg_restore for backups and
# restore tests (same major version as the server). openssl: backup encryption in scripts.
# Fonts: Noto (Latin + Bengali, so Bangla names render in PDFs), IBM Plex added below.
RUN apk add --no-cache libc6-compat openssl tzdata tini chromium nss freetype harfbuzz fontconfig \
      font-noto font-noto-bengali postgresql16-client \
  && mkdir -p /usr/share/fonts/ibm-plex

# IBM Plex Sans / Mono (the app font) as system fonts for Chromium, from the pinned npm packages.
COPY --from=deps /app/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff \
                 /app/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff \
                 /app/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff \
                 /app/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff \
                 /usr/share/fonts/ibm-plex/
RUN fc-cache -f >/dev/null

ARG APP_VERSION=0.0.0
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_MANUAL_SIG_HANDLE=true \
    PDF_BROWSER_PATH=/usr/bin/chromium \
    TZ=Asia/Dhaka \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKUP_DIR=/backups \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
  && mkdir -p /backups && chown nextjs:nodejs /backups && chmod 700 /backups

COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs scripts/backup.sh scripts/restore.sh scripts/smoke-test.mjs ./scripts/
COPY --chown=nextjs:nodejs docker/entrypoint.sh docker/healthcheck.sh ./docker/
RUN chmod 755 ./docker/entrypoint.sh ./docker/healthcheck.sh ./scripts/backup.sh ./scripts/restore.sh

USER nextjs
EXPOSE 3000
VOLUME ["/backups"]

# web: GET /api/v1/health; worker: its heartbeat file is fresh (docker/healthcheck.sh).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD ["/app/docker/healthcheck.sh"]

# tini forwards SIGTERM to node, which shuts down gracefully (SHUTDOWN_TIMEOUT_MS).
ENTRYPOINT ["/sbin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["web"]
