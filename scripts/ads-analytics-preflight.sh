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
  "GOOGLE_ADS_DEVELOPER_TOKEN"
  "GOOGLE_ADS_CUSTOMER_ID"
  "GOOGLE_ADS_REFRESH_TOKEN"
  "GOOGLE_ADS_CLIENT_ID"
  "GOOGLE_ADS_CLIENT_SECRET"
  "META_ACCESS_TOKEN"
  "META_AD_ACCOUNT_ID"
  "META_PAGE_ID"
  "REDDIT_CLIENT_ID"
  "REDDIT_CLIENT_SECRET"
  "REDDIT_AD_ACCOUNT_ID"
  "REDDIT_USER_AGENT"
  "WEBFLOW_API_TOKEN"
  "WEBFLOW_SITE_ID"
  "SEMRUSH_API_TOKEN"
  "SEMRUSH_DOMAIN"
)

optional_vars=(
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID"
)

missing_required=()
echo "=== Ads Analytics Env Preflight ==="
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
echo "Optional variables:"
for key in "${optional_vars[@]}"; do
  value="${!key-}"
  if [[ -n "${value}" ]]; then
    echo "  [set] ${key}"
  else
    echo "  [not set] ${key}"
  fi
done

echo
if [[ ${#missing_required[@]} -gt 0 ]]; then
  echo "Result: FAILED (${#missing_required[@]} required variables missing)"
  printf 'Missing keys: %s\n' "$(IFS=', '; echo "${missing_required[*]}")"
  exit 1
fi

echo "Result: PASS (all required ad analytics env vars are set)"

echo
echo "=== Meta Ads Token Preflight ==="
node ./scripts/meta-ads-token-preflight.mjs
