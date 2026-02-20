#!/usr/bin/env bash
set -euo pipefail

load_env_defaults() {
  local env_file="$1"
  [[ -f "${env_file}" ]] || return 1

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "${line}" || "${line:0:1}" == "#" ]] && continue
    line="${line#export }"
    [[ "${line}" == *"="* ]] || continue

    local key="${line%%=*}"
    local raw_value="${line#*=}"

    key="${key%"${key##*[![:space:]]}"}"
    raw_value="${raw_value#"${raw_value%%[![:space:]]*}"}"

    [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ -n "${!key+x}" ]] && continue

    local value="${raw_value}"
    if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value//\\n/$'\n'}"
      value="${value//\\\"/\"}"
    elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    else
      value="${value%%#*}"
      value="${value%"${value##*[![:space:]]}"}"
    fi

    export "${key}=${value}"
  done < "${env_file}"

  return 0
}

loaded_env_file=""
if load_env_defaults ".env.local"; then
  loaded_env_file=".env.local"
elif load_env_defaults ".env"; then
  loaded_env_file=".env"
fi

required_vars=(
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
  "NEXTAUTH_URL"
)

recommended_vars=(
  "INTEGRATION_TOKEN_SECRET"
)

missing_required=()
missing_recommended=()

echo "=== Integrations Runtime Env Preflight ==="
echo
if [[ -n "${loaded_env_file}" ]]; then
  echo "Loaded local defaults from ${loaded_env_file} (shell environment takes precedence)."
  echo
fi

echo "Required variables:"
for key in "${required_vars[@]}"; do
  value="${!key-}"
  if [[ -n "${value}" ]]; then
    echo "  [ok] ${key}"
  else
    echo "  [missing] ${key}"
    missing_required+=("${key}")
  fi
done

echo
echo "Recommended variables:"
for key in "${recommended_vars[@]}"; do
  value="${!key-}"
  if [[ -n "${value}" ]]; then
    echo "  [set] ${key}"
  else
    echo "  [not set] ${key}"
    missing_recommended+=("${key}")
  fi
done

echo
if [[ ${#missing_required[@]} -gt 0 ]]; then
  echo "Result: FAILED (${#missing_required[@]} required variables missing)"
  printf 'Missing required keys: %s\n' "$(IFS=', '; echo "${missing_required[*]}")"
  exit 1
fi

if [[ ${#missing_recommended[@]} -gt 0 ]]; then
  echo "Result: PASS with warnings"
  printf 'Missing recommended keys: %s\n' "$(IFS=', '; echo "${missing_recommended[*]}")"
  echo "Note: INTEGRATION_TOKEN_SECRET is recommended to keep encrypted integration tokens decryptable across secret rotations."
  exit 0
fi

echo "Result: PASS (all required and recommended runtime env vars are set)"
