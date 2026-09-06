#!/bin/sh
set -e
docker run --rm --env-file /tmp/bluearm-api.env -v /tmp/reapply.sql:/reapply.sql postgres:16-alpine sh -c 'psql "$DATABASE_URL" -f /reapply.sql'
docker run --rm --env-file /tmp/bluearm-api.env bluearm-api:latest /migrate
echo FORCE_MIGRATE_DONE
