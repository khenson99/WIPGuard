#!/bin/sh
set -e

echo "Running Prisma migrations..."
node /app/prisma-cli/build/index.js migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting server..."
exec node server.js
