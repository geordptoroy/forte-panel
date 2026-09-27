#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
env_file="${ENV_FILE:-.env}"
example_file="${ENV_EXAMPLE_FILE:-.env.docker.example}"

if [[ -f "$env_file" ]]; then
  echo "[docker-init] $env_file já existe; não será sobrescrito."
  exit 0
fi
[[ -f "$example_file" ]] || { echo "[docker-init] Exemplo não encontrado: $example_file" >&2; exit 1; }

cp "$example_file" "$env_file"
python3 - "$env_file" <<'PY'
from pathlib import Path
import secrets
import sys

path = Path(sys.argv[1])
values = {
    "CHANGE_ME_LOCAL_ADMIN_PASSWORD": f"local-{secrets.token_urlsafe(18)}",
    "CHANGE_ME_JWT_SECRET": secrets.token_urlsafe(48),
    "CHANGE_ME_POSTGRES_PASSWORD": secrets.token_urlsafe(30),
    "CHANGE_ME_BAILEYS_API_KEY": secrets.token_urlsafe(30),
    "CHANGE_ME_BAILEYS_WEBHOOK_SECRET": secrets.token_urlsafe(30),
}
text = path.read_text()
for placeholder, value in values.items():
    text = text.replace(placeholder, value)
path.write_text(text)
PY
chmod 600 "$env_file"

echo "[docker-init] Criado $env_file com segredos aleatórios locais (permissão 600)."
echo "[docker-init] Login local: $(grep '^LOCAL_ADMIN_EMAIL=' "$env_file" | cut -d= -f2-)"
echo "[docker-init] Senha local salva em $env_file; não a publique nem faça commit."
