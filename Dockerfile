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
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone server (includes traced node_modules via serverExternalPackages)
COPY --from=builder /app/.next/standalone ./
# Copy static assets
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets
COPY --from=builder /app/public ./public
# Copy Prisma schema + migrations for runtime migrate deploy
COPY --from=builder /app/prisma ./prisma
# Copy generated Prisma client (output to src/generated/prisma)
COPY --from=builder /app/src/generated ./src/generated

# Install prisma CLI in isolated directory for running migrations at startup
RUN mkdir -p /app/prisma-cli && cd /app/prisma-cli && npm init -y && npm install prisma@7.4.0

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node /app/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma && node server.js"]
