#!/bin/sh
set -e
cat /tmp/reapply.sql
docker run --rm --env-file /tmp/bluearm-api.env -v /tmp/reapply.sql:/reapply.sql --entrypoint sh postgres:16-alpine -c 'psql "$DATABASE_URL" -f /reapply.sql'
docker run --rm --entrypoint /migrate --env-file /tmp/bluearm-api.env bluearm-api:latest
echo REAL_FORCE_DONE
