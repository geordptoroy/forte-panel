#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[forte-panel] applying database migrations"
  corepack pnpm drizzle-kit migrate
fi

if [ "${1:-web}" = "worker" ]; then
  echo "[forte-panel] starting WhatsApp worker"
  exec node dist/worker.js
fi

echo "[forte-panel] starting server on port ${PORT:-3000}"
exec node dist/index.js
