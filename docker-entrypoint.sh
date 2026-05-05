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
exec node server.js
