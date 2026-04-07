#!/bin/sh

set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: /bin/sh ./scripts/docker-standup.sh <compose-file> <app-url>"
  exit 1
fi

COMPOSE_FILE=$1
APP_URL=$2

echo "Starting ScreenLantern with $COMPOSE_FILE..."
docker compose -f "$COMPOSE_FILE" up --build -d

echo "Waiting for ScreenLantern at $APP_URL..."
ATTEMPT=0
until curl -fsS "$APP_URL/sign-in" >/dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))

  if [ "$ATTEMPT" -ge 60 ]; then
    echo "ScreenLantern did not become ready at $APP_URL within 120 seconds."
    exit 1
  fi

  sleep 2
done

echo "ScreenLantern is ready at $APP_URL."
echo "The streaming-sync sidecar handles Netflix sync automatically."
echo "Trigger a manual sync from Settings, or wait for the scheduled interval."
