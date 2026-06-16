#!/bin/sh
# Daily database retention/pruning trigger.
#
# Deploy as a Railway cron service (see railway.json for the schedule) with:
#   TARGET_URL          e.g. https://<app-host>/api/cron/db-prune?wait=1
#   CRON_SYNC_SECRET    same secret the app's /api/cron/* routes check
#
# Use ?wait=1 in TARGET_URL so the cron container's exit code reflects the
# prune result and Railway's ON_FAILURE restart policy can retry it.
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
