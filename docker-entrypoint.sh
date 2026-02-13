#!/bin/sh
set -e

echo "Running Prisma migrations..."

# If using Railway's public proxy, append sslmode=require for prisma migrate
MIGRATE_URL="$DATABASE_URL"
case "$DATABASE_URL" in
  *".railway.internal"*) ;;
  *"?"*) MIGRATE_URL="${DATABASE_URL}&sslmode=require" ;;
  *) MIGRATE_URL="${DATABASE_URL}?sslmode=require" ;;
esac

DATABASE_URL="$MIGRATE_URL" node /app/prisma-cli/build/index.js migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting server..."
exec node server.js
