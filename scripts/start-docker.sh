#!/usr/bin/env bash
set -Eeuo pipefail

compose_file="${COMPOSE_FILE:-docker-compose.yml}"
env_file="${ENV_FILE:-.env}"
services=(postgres_panel redis_panel forte-panel forte-panel-worker forte-whatsapp)

reset=false
if [[ "${1:-}" == "--reset" ]]; then
  if [[ "${2:-}" != "--confirm-reset" || "${3:-}" != "APAGAR-TUDO" ]]; then
    echo "Reset abortado. Para apagar somente a stack Forte Panel, use: $0 --reset --confirm-reset APAGAR-TUDO" >&2
    exit 2
  fi
  reset=true
elif [[ $# -ne 0 ]]; then
  echo "Uso: $0 [--reset --confirm-reset APAGAR-TUDO]" >&2
  exit 2
fi

if [[ ! -f "$env_file" ]]; then
  echo "Arquivo $env_file não encontrado. Crie-o a partir de .env.local.example." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado no PATH." >&2
  exit 1
fi

compose=(docker compose --env-file "$env_file" -f "$compose_file")

if [[ "$reset" == true ]]; then
  echo "Reset explícito: removendo apenas containers, volumes e imagens da stack Forte Panel."
  "${compose[@]}" down --volumes --remove-orphans --rmi all
fi

echo "Baixando as imagens GHCR latest..."
"${compose[@]}" pull "${services[@]}"
echo "Iniciando Forte Panel a partir das imagens baixadas..."
"${compose[@]}" up -d --force-recreate "${services[@]}"
echo
echo "Stack iniciada. Estado atual:"
"${compose[@]}" ps

if [[ "$reset" == true ]]; then
  echo "A stack foi reposta sem afetar outros projetos Docker."
else
  echo "Atualização concluída sem apagar volumes nem dados."
fi
