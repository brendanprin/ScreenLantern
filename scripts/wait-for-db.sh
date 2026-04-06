#!/bin/sh

set -eu

READY_DATABASE_URL=${DATABASE_URL%%\?*}

echo "Waiting for PostgreSQL..."

until psql "$READY_DATABASE_URL" -Atqc "SELECT 1" >/dev/null 2>&1; do
  sleep 1
done

echo "PostgreSQL is ready."
