#!/bin/sh
set -eu

: "${TARGET_URL:?TARGET_URL is required}"

HEADER_NAME="${CRON_HEADER_NAME:-x-cron-secret}"
SECRET="${CRON_SYNC_SECRET:-${INTEGRATION_SYNC_SECRET:-}}"

if [ -z "${SECRET}" ]; then
  echo "Missing CRON_SYNC_SECRET or INTEGRATION_SYNC_SECRET"
  exit 1
fi

echo "POST ${TARGET_URL}"
curl -fsS -X POST "${TARGET_URL}" \
  -H "${HEADER_NAME}: ${SECRET}" \
  -H "content-type: application/json" \
  --data '{}'
echo "ok"

