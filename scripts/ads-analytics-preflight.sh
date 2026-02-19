#!/usr/bin/env bash
set -euo pipefail

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
