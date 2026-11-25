#!/bin/sh
set -e
case "$1" in
  migrate)
    # `prisma migrate deploy` as its own step (never at app start)
    cd /app/packages/db && npx --yes prisma@7.10.1 migrate deploy
    ;;
  serve)
    exec node apps/web/server.js
    ;;
  *)
    exec "$@"
    ;;
esac
