#!/bin/sh
set -e

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/prisma/migrations}"
if [ ! -d "$MIGRATIONS_DIR" ] && [ -d "prisma/migrations" ]; then
  MIGRATIONS_DIR="prisma/migrations"
fi

if [ -z "${MIGRATIONS_MODE+x}" ]; then
  if [ -d "$MIGRATIONS_DIR" ] && find "$MIGRATIONS_DIR" -maxdepth 1 -type d -name "*ceo_metric*" | grep -q .; then
    MIGRATIONS_MODE="strict"
  else
    MIGRATIONS_MODE="best-effort"
  fi
fi

case "$MIGRATIONS_MODE" in
  skip)
    echo "Skipping migrations (MIGRATIONS_MODE=skip)"
    ;;
  strict)
    echo "Running migrations (MIGRATIONS_MODE=strict)..."
    node /app/migrate.cjs
    ;;
  best-effort|*)
    echo "Running migrations (MIGRATIONS_MODE=best-effort)..."
    if ! node /app/migrate.cjs; then
      echo "WARNING: migrations failed; starting server anyway"
    fi
    ;;
esac

echo "Starting server..."
export HOSTNAME=${HOSTNAME:-0.0.0.0}

# --max-old-space-size: BAND-AID, not a fix. Sizes the V8 heap to the Railway
# container instead of V8's ~4 GB default so a regression of the analytics
# leak degrades slowly instead of crash-cycling every ~20 minutes. Keep this
# below the container memory limit (leave ~2 GB for non-heap RSS). Override
# via NODE_MAX_OLD_SPACE_MB in Railway service variables.
# --expose-gc: required by /api/cron/sync, which calls gc() between sync
# phases to release provider payload buffers (see executeCronSync).
NODE_MAX_OLD_SPACE_MB="${NODE_MAX_OLD_SPACE_MB:-6144}"
exec node --expose-gc --max-old-space-size="${NODE_MAX_OLD_SPACE_MB}" server.js
