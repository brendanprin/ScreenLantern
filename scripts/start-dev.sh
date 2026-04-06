#!/bin/sh

set -eu

READY_DATABASE_URL=${DATABASE_URL%%\?*}

sh ./scripts/wait-for-db.sh

echo "Generating Prisma client..."
npm run db:generate

echo "Applying Prisma migrations..."
npx prisma migrate deploy

if [ "${SEED_DEMO_DATA:-0}" = "1" ]; then
  USER_COUNT=$(psql "$READY_DATABASE_URL" -Atqc 'SELECT COUNT(*) FROM "User";' 2>/dev/null || echo "0")

  if [ "$USER_COUNT" = "0" ]; then
    echo "Seeding demo data..."
    npm run db:seed
  else
    echo "Skipping seed because existing users were found."
  fi
fi

echo "Starting Next.js development server..."
exec npx next dev --hostname 0.0.0.0 --port "${PORT:-3000}"
