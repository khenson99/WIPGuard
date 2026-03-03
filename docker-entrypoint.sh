#!/bin/sh
set -e

MIGRATIONS_MODE="${MIGRATIONS_MODE:-best-effort}"

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
