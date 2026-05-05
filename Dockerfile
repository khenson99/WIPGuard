# ── Stage 1: Install dependencies ──────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (standalone output)
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────
FROM node:22-alpine3.21 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Force cache invalidation
ARG BUILDTIME=2026-02-13T2130
RUN echo "Build: ${BUILDTIME}" > /app/.build-info

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone server (includes traced node_modules via serverExternalPackages)
COPY --from=builder /app/.next/standalone ./
# Next.js standalone output already includes a minimal traced `node_modules/`.
# Avoid copying the full dependency tree into the runtime image (large and slow).
RUN node -e "require('pg'); require('@prisma/adapter-pg'); require('@prisma/client/runtime/client')"
# Copy static assets
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets
COPY --from=builder /app/public ./public
# Copy Prisma schema + migrations for runtime migrate deploy
COPY --from=builder /app/prisma ./prisma
# Copy generated Prisma client (output to src/generated/prisma)
COPY --from=builder /app/src/generated ./src/generated
# Ensure Next.js cache dir is writable by the runtime user
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next
# Copy lightweight migration runner (uses pg from standalone trace)
COPY --from=builder /app/migrate.cjs ./migrate.cjs
# Copy ops scripts used by runbooks (e.g. OAuth scope backfills)
COPY --from=builder /app/scripts/backfill-google-oauth-scope-aliases.cjs ./scripts/backfill-google-oauth-scope-aliases.cjs
# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Verify migrate.cjs exists
RUN ls -la /app/migrate.cjs /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
