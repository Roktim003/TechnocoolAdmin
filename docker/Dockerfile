# syntax=docker/dockerfile:1.7
# One image, two services:
#   app    → default CMD (Next.js standalone server, runs migrations + seed first when RUN_MIGRATIONS=true)
#   worker → command: node dist/worker.js

ARG NODE_VERSION=22.12.0

# ── deps: full install for building ─────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── build: prisma client, Next.js standalone, worker + seed bundles ─────────
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── prod-deps: runtime node_modules only (worker, seed and prisma CLI need them) ──
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npx prisma generate

# ── runner ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
# chromium + fonts: the worker renders stock documents (GRN, challan, invoice) to PDF.
RUN apk add --no-cache libc6-compat openssl tzdata tini chromium nss freetype harfbuzz ttf-dejavu font-noto
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PDF_BROWSER_PATH=/usr/bin/chromium-browser \
    TZ=Asia/Dhaka \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "server.js"]
