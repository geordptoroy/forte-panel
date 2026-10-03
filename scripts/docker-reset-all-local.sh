#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${FORTE_DOCKER_RESET_CONFIRM:-}" != "APAGAR-TUDO" ]]; then
  echo "Abortado. Este reset apaga dados locais da stack Forte Panel. Confirme com:" >&2
  echo "  FORTE_DOCKER_RESET_CONFIRM=APAGAR-TUDO $0" >&2
  exit 2
fi

exec "$root_dir/scripts/start-docker.sh" --reset --confirm-reset APAGAR-TUDO
