#!/usr/bin/env bash
set -Eeuo pipefail

compose_file="${COMPOSE_FILE:-docker-compose.yml}"
env_file="${ENV_FILE:-.env}"
services=(postgres_panel redis_panel forte-panel forte-panel-worker forte-whatsapp)

if [[ ! -f "$env_file" ]]; then
  echo "Arquivo $env_file não encontrado. Crie-o a partir de .env.local.example." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado no PATH." >&2
  exit 1
fi

compose=(docker compose --env-file "$env_file" -f "$compose_file")

echo "Atualizando imagens..."
"${compose[@]}" pull "${services[@]}"
echo "Iniciando Forte Panel..."
"${compose[@]}" up -d --force-recreate "${services[@]}"
echo
echo "Stack iniciada. Estado atual:"
"${compose[@]}" ps
