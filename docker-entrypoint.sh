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
    # Fast path: a read-only currency check (one connection, one query)
    # instead of the full lock + apply loop. On Railway the apply already
    # happened in preDeployCommand (railway.json) before the previous
    # deploy stopped, so this is the common path and keeps boot short.
    # Strict semantics are preserved: pending or unverifiable schema falls
    # through to the full run, and any failure there still aborts boot.
    if node /app/migrate.cjs --check; then
      echo "Migrations current; skipping apply (MIGRATIONS_MODE=strict)"
    else
      echo "Running migrations (MIGRATIONS_MODE=strict)..."
      node /app/migrate.cjs
    fi
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
exec node server.js
