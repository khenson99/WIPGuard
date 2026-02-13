#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$ROOT_DIR/logs/status-sync-$(date +%Y%m%d-%H%M%S).log"
RUN_TEAM_PATTERN="/Users/kylehenson/.codex/skills/ralph-team-loop/scripts/run-team.sh"

mkdir -p "$ROOT_DIR/logs"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] status sync watcher started" | tee -a "$LOG_FILE"

while pgrep -f "$RUN_TEAM_PATTERN" >/dev/null; do
  {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] sync tick"
    "$ROOT_DIR/scripts/sync_statuses.sh"
  } >> "$LOG_FILE" 2>&1
  sleep 30
done

{
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] run-team process not found; final sync"
  "$ROOT_DIR/scripts/sync_statuses.sh"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] watcher exiting"
} >> "$LOG_FILE" 2>&1
