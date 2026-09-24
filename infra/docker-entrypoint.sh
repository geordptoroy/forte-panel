#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[forte-panel] applying database migrations"
  corepack pnpm drizzle-kit migrate
fi

echo "[forte-panel] starting server on port ${PORT:-3000}"
exec node dist/index.js
