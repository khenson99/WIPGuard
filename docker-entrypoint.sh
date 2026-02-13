#!/bin/sh
set -e

echo "Running migrations..."
node /app/migrate.cjs

echo "Starting server..."
exec node server.js
