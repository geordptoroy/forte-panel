#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
compose_file="${COMPOSE_FILE:-docker-compose.local.yml}"
env_file="${ENV_FILE:-.env}"

cat >&2 <<'WARNING'
ATENÇÃO: este comando é destrutivo.
Ele remove recursos Docker não utilizados globalmente nesta máquina:
- containers do Compose local;
- volumes do Compose local (PostgreSQL, Redis e sessão WhatsApp);
- imagens não utilizadas e imagens dos serviços do Compose;
- redes não utilizadas;
- cache de build. A reinstalação posterior deve usar `docker compose pull`, sem `docker compose build`.
Também pode afetar OUTROS projetos Docker parados/não utilizados no mesmo computador.
Não desinstala o Docker nem apaga arquivos fora do armazenamento Docker.
WARNING

if [[ "${FORTE_DOCKER_RESET_CONFIRM:-}" != "APAGAR-TUDO" ]]; then
  echo "Abortado. Para confirmar conscientemente, use:" >&2
  echo "  FORTE_DOCKER_RESET_CONFIRM=APAGAR-TUDO $0" >&2
  exit 2
fi

command -v docker >/dev/null 2>&1 || { echo "Docker não encontrado no PATH." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não está disponível." >&2; exit 1; }

if [[ -f "$env_file" ]]; then
  docker compose --env-file "$env_file" -f "$compose_file" down --volumes --remove-orphans --rmi all || true
else
  docker compose -f "$compose_file" down --volumes --remove-orphans --rmi all || true
fi

# A limpeza abaixo é global no Docker local e é o que reduz o espaço ocupado.
docker system prune --all --force --volumes
docker builder prune --all --force
docker network prune --force || true
docker volume prune --all --force || true

echo
echo "[docker-reset] Limpeza concluída. Uso atual do Docker:"
docker system df || true
