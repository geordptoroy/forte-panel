#!/usr/bin/env bash
set -Eeuo pipefail

base_url="${STAGING_BASE_URL:-}"
if [[ -z "$base_url" ]]; then
  echo "STAGING_BASE_URL must be set, for example https://staging.example.com" >&2
  exit 2
fi
base_url="${base_url%/}"

check_json_endpoint() {
  local name="$1"
  local path="$2"
  local expected_status="$3"
  local expected_field="$4"
  local body_file
  body_file="$(mktemp)"
  trap 'rm -f "$body_file"' RETURN

  local http_code
  http_code="$(curl --fail-with-body --silent --show-error --max-time 15 \
    --output "$body_file" --write-out '%{http_code}' "$base_url$path")" || {
    echo "$name request failed: $base_url$path" >&2
    cat "$body_file" >&2 || true
    return 1
  }

  if [[ "$http_code" != "$expected_status" ]]; then
    echo "$name returned HTTP $http_code, expected $expected_status" >&2
    cat "$body_file" >&2
    return 1
  fi

  if ! grep -q '"status"[[:space:]]*:[[:space:]]*"'"$expected_field"'"' "$body_file"; then
    echo "$name did not report status=$expected_field" >&2
    cat "$body_file" >&2
    return 1
  fi

  echo "$name OK ($http_code): $(tr '\n' ' ' < "$body_file")"
}

check_json_endpoint "liveness" "/api/v1/health" "200" "ok"
check_json_endpoint "readiness" "/api/v1/ready" "200" "ready"
