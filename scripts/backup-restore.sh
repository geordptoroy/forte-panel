#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Uso:
  scripts/backup-restore.sh backup
  scripts/backup-restore.sh verify BACKUP_DIR
  CONFIRM_RESTORE=YES RESTORE_SESSION_DIR=/path scripts/backup-restore.sh restore BACKUP_DIR

Variáveis:
  DATABASE_URL          URL do PostgreSQL (obrigatória para backup/restore)
  WHATSAPP_SESSION_DIR  diretório atual das sessões (padrão: /app/sessions)
  WHATSAPP_SESSION_ENCRYPTION_KEY chave AES de 32 bytes; nunca é escrita no backup
  BACKUP_DIR            destino do backup (padrão: ./backups)
  RESTORE_SESSION_DIR   diretório de destino da sessão restaurada
  CONFIRM_RESTORE=YES   confirmação obrigatória para operação destrutiva
EOF
}

command=${1:-}
backup_dir=${BACKUP_DIR:-./backups}
session_dir=${WHATSAPP_SESSION_DIR:-/app/sessions}

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Comando obrigatório ausente: $1" >&2; exit 1; }
}

require_database_url() {
  [[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL é obrigatória" >&2; exit 1; }
}

require_session_key() {
  [[ -n "${WHATSAPP_SESSION_ENCRYPTION_KEY:-}" ]] || {
    echo "WHATSAPP_SESSION_ENCRYPTION_KEY é obrigatória para backup/restore" >&2
    exit 1
  }
  session_key_sha256=$(printf '%s' "$WHATSAPP_SESSION_ENCRYPTION_KEY" | sha256sum | cut -d' ' -f1)
}

backup() {
  require_command pg_dump
  require_command sha256sum
  require_command tar
  require_database_url
  require_session_key
  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"
  local stamp archive session_archive manifest
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  archive="$backup_dir/postgres-$stamp.dump"
  session_archive="$backup_dir/whatsapp-sessions-$stamp.tar.gz"
  manifest="$backup_dir/manifest-$stamp.txt"
  pg_dump "$DATABASE_URL" --format=custom --no-owner --file="$archive"
  if [[ -d "$session_dir" ]]; then
    tar --exclude='.session.lock' -czf "$session_archive" -C "$session_dir" .
  else
    echo "Aviso: diretório de sessão não existe; backup de sessão não criado" >&2
    tar -czf "$session_archive" -T /dev/null
  fi
  chmod 600 "$archive" "$session_archive"
  {
    printf 'created_at=%s\n' "$stamp"
    printf 'postgres_file=%s\n' "$(basename "$archive")"
    printf 'postgres_sha256=%s\n' "$(sha256sum "$archive" | cut -d' ' -f1)"
    printf 'session_file=%s\n' "$(basename "$session_archive")"
    printf 'session_sha256=%s\n' "$(sha256sum "$session_archive" | cut -d' ' -f1)"
    printf 'session_key_sha256=%s\n' "$session_key_sha256"
  } > "$manifest"
  chmod 600 "$manifest"
  echo "Backup criado em $backup_dir (manifest: $(basename "$manifest"))"
}

verify() {
  require_command pg_restore
  require_command sha256sum
  require_command tar
  local dir=${1:-}
  [[ -n "$dir" && -d "$dir" ]] || { echo "Informe um diretório de backup existente" >&2; exit 1; }
  local manifest
  manifest=$(find "$dir" -maxdepth 1 -name 'manifest-*.txt' -type f | sort | tail -n 1)
  [[ -n "$manifest" ]] || { echo "Manifesto não encontrado" >&2; exit 1; }
  local postgres_file session_file session_key_hash
  postgres_file=$(sed -n 's/^postgres_file=//p' "$manifest")
  session_file=$(sed -n 's/^session_file=//p' "$manifest")
  session_key_hash=$(sed -n 's/^session_key_sha256=//p' "$manifest")
  [[ -f "$dir/$postgres_file" ]] || { echo "Dump PostgreSQL ausente" >&2; exit 1; }
  [[ -f "$dir/$session_file" ]] || { echo "Arquivo de sessão ausente" >&2; exit 1; }
  [[ "$session_key_hash" =~ ^[0-9a-f]{64}$ ]] || { echo "Fingerprint da chave de sessão ausente ou inválido" >&2; exit 1; }
  pg_restore --list "$dir/$postgres_file" >/dev/null
  tar -tzf "$dir/$session_file" >/dev/null
  [[ "$(sha256sum "$dir/$postgres_file" | cut -d' ' -f1)" == "$(sed -n 's/^postgres_sha256=//p' "$manifest")" ]] || { echo "Hash do dump PostgreSQL diverge" >&2; exit 1; }
  [[ "$(sha256sum "$dir/$session_file" | cut -d' ' -f1)" == "$(sed -n 's/^session_sha256=//p' "$manifest")" ]] || { echo "Hash do backup de sessão diverge" >&2; exit 1; }
  echo "Backup verificável: $(basename "$manifest")"
}

restore() {
  [[ "${CONFIRM_RESTORE:-}" == "YES" ]] || { echo "Restore exige CONFIRM_RESTORE=YES" >&2; exit 1; }
  require_command pg_restore
  require_command tar
  require_command realpath
  require_command mktemp
  require_database_url
  require_session_key
  local dir=${1:-}
  local target=${RESTORE_SESSION_DIR:-}
  [[ -n "$dir" && -d "$dir" ]] || { echo "Informe um diretório de backup existente" >&2; exit 1; }
  [[ -n "$target" ]] || { echo "RESTORE_SESSION_DIR é obrigatória; nunca sobrescreva a sessão ativa" >&2; exit 1; }
  [[ "$(realpath -m "$target")" != "$(realpath -m "$session_dir")" ]] || { echo "RESTORE_SESSION_DIR não pode ser a sessão ativa" >&2; exit 1; }
  verify "$dir" >/dev/null
  local manifest postgres_file session_file expected_key_hash staging
  manifest=$(find "$dir" -maxdepth 1 -name 'manifest-*.txt' -type f | sort | tail -n 1)
  postgres_file=$(sed -n 's/^postgres_file=//p' "$manifest")
  session_file=$(sed -n 's/^session_file=//p' "$manifest")
  expected_key_hash=$(sed -n 's/^session_key_sha256=//p' "$manifest")
  [[ "$session_key_sha256" == "$expected_key_hash" ]] || { echo "A chave de sessão não corresponde ao backup" >&2; exit 1; }
  pg_restore "$DATABASE_URL" --clean --if-exists --no-owner "$dir/$postgres_file"
  staging=$(mktemp -d)
  trap 'rm -rf "$staging"' RETURN
  tar -xzf "$dir/$session_file" -C "$staging"
  chmod -R u=rwX,go= "$staging"
  mkdir -p "$target"
  rm -rf "$target"/* "$target"/.[!.]* "$target"/..?* 2>/dev/null || true
  cp -a "$staging"/. "$target"/
  echo "Restore concluído; valide readiness, sessão e tenant antes de reabrir o tráfego"
}

case "$command" in
  backup) backup ;;
  verify) verify "${2:-}" ;;
  restore) restore "${2:-}" ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
