#!/bin/sh
set -e
if [ "$MIGRATE_ON_START" = "true" ]; then
  echo "Running database migrations..."
  /migrate
fi
exec /server
