#!/usr/bin/env bash
set -euo pipefail

CYCLES=3
SCOPE_LABEL=""
MAX_TEAM_ITERATIONS=20
MAX_REVIEWER_ITERATIONS=10

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cycles) CYCLES="${2:-}"; shift 2 ;;
    --scope-label) SCOPE_LABEL="${2:-}"; shift 2 ;;
    --team-iterations) MAX_TEAM_ITERATIONS="${2:-}"; shift 2 ;;
    --reviewer-iterations) MAX_REVIEWER_ITERATIONS="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

echo "🔁 Running repo-local ralph-team-v2 all-cycles"
echo "   Cycles: $CYCLES"
[[ -n "$SCOPE_LABEL" ]] && echo "   Scope label: $SCOPE_LABEL"

"$SCRIPT_DIR/init.sh"

for ((i=1; i<=CYCLES; i++)); do
  echo ""
  echo "===== Cycle $i / $CYCLES ====="
  "$SCRIPT_DIR/run-team.sh" --scope-label "$SCOPE_LABEL" --max-iterations "$MAX_TEAM_ITERATIONS" --max-assignments 2 || true
  "$SCRIPT_DIR/run-reviewer.sh" --scope-label "$SCOPE_LABEL" --max-iterations "$MAX_REVIEWER_ITERATIONS" || true
done

echo "✅ Completed $CYCLES cycle(s)."

