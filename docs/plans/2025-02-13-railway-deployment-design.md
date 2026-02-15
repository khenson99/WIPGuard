# WIPGuard Railway Deployment Design

## Decision: Railway-only (no Vercel)

WIPGuard uses Socket.IO attached to the Node.js HTTP server via a Pages API route.
Vercel is serverless and cannot support persistent WebSocket connections.
The PRD also requires Redis Pub/Sub and integrations (HubSpot, Calendar, Gmail, Slack),
all needing long-lived server processes. Railway runs a persistent Node.js process,
so everything works without refactoring.

## Architecture

- **Next.js service** on Railway (Dockerfile-based deploy from GitHub)
- **PostgreSQL** via Railway's managed Postgres plugin
- Auto-deploy on push to `main` (after CI passes on GitHub Actions)

## Canonical Config Locations

- Docker build: repo root `Dockerfile`
- Docker ignore: repo root `.dockerignore`
- Railway config: repo root `railway.json`
- CI workflow: repo root `.github/workflows/ci.yml`
- Root command entrypoints: repo root `package.json` (delegates to `app/`)

## Implementation Steps

### 1. Add `output: "standalone"` to next.config.ts

Required for Docker-optimized Next.js builds. Produces a self-contained `server.js`.

### 2. Create multi-stage Dockerfile at repo root

- Stage 1 (`deps`): Install node_modules
- Stage 2 (`builder`): Copy `app/`, generate Prisma client, build Next.js
- Stage 3 (`runner`): Production image with standalone output + static/public assets + migration runner

### 3. Create repo-root `.dockerignore`

Exclude node_modules, .git, .env, .next from Docker context.

### 4. Add repo-root `railway.json` (optional)

Configure build and deploy settings: Dockerfile path, health check, restart policy.

### 5. Environment variables on Railway

| Variable | Source |
|---|---|
| `DATABASE_URL` | Auto-injected by Railway Postgres plugin |
| `GOOGLE_CLIENT_ID` | Manual (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Manual (from Google Cloud Console) |
| `NEXTAUTH_SECRET` | Manual (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Railway domain URL |
| `PORT` | Auto-set by Railway |

### 6. Prisma migration strategy

Run migrations at container startup via `app/docker-entrypoint.sh` using `migrate.cjs`.
This applies pending SQL migrations before the Next.js server starts.

### 7. Google OAuth redirect URI

Add Railway domain to authorized redirect URIs in Google Cloud Console:
`https://<app>.up.railway.app/api/auth/callback/google`

## What does NOT change

- No Socket.IO refactoring
- No CORS changes
- No separate back-end service
- All API routes work as-is
- GitHub Actions CI continues to run lint/typecheck/build from `app` via root workflow defaults
