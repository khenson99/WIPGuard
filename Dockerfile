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
# Ensure runtime dependencies required by health checks and migration runner
# (for example `pg`) are present in the final image.
COPY --from=deps /app/node_modules ./node_modules
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
# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Verify migrate.cjs exists
RUN ls -la /app/migrate.cjs /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
