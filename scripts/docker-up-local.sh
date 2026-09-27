#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
compose_file="${COMPOSE_FILE:-docker-compose.local.yml}"
env_file="${ENV_FILE:-.env}"
services=(postgres_panel redis_panel forte-panel forte-panel-worker forte-whatsapp)

command -v docker >/dev/null 2>&1 || { echo "Docker não encontrado no PATH." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não está disponível." >&2; exit 1; }

ENV_FILE="$env_file" ./scripts/docker-init-local.sh
compose=(docker compose --env-file "$env_file" -f "$compose_file")

if [[ "${FORTE_PULL:-1}" == "1" ]]; then
  echo "[docker-up] Baixando imagens do Compose..."
  "${compose[@]}" pull "${services[@]}"
else
  echo "[docker-up] FORTE_PULL=0: usando imagens locais/cacheadas."
fi

echo "[docker-up] Subindo PostgreSQL, Redis, painel, worker e gateway..."
"${compose[@]}" up -d --remove-orphans "${services[@]}"

echo
echo "[docker-up] Estado dos serviços:"
"${compose[@]}" ps

echo
echo "[docker-up] Painel: http://localhost:${PANEL_PORT:-3002}"
echo "[docker-up] PostgreSQL fica apenas na rede Docker; migrations são executadas pelo container do painel (RUN_MIGRATIONS=true)."
echo "[docker-up] Logs: ${compose[*]} logs -f forte-panel forte-panel-worker"
