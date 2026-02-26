#!/bin/sh
set -e

echo "Running migrations..."
node /app/migrate.cjs

echo "Starting server..."
export HOSTNAME=${HOSTNAME:-0.0.0.0}
exec node server.js
