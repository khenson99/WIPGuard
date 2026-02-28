#!/usr/bin/env bash
set -euo pipefail

# Repo-local Ralph Team Loop runner (v2 ergonomics, v1 routing).
# - Ensures required local state directories exist.
# - Does NOT overwrite existing .ralph-team/config.json.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p .ralph-team/{agents,prompts,current-tasks,logs}

if [[ ! -f ".ralph-team/config.json" ]]; then
  echo "Error: .ralph-team/config.json not found. This repo already expects a configured Ralph setup." >&2
  echo "Fix: create it with the v1 init (or copy from another initialized worktree)." >&2
  exit 1
fi

# Allow isolated team-state files per scoped run.
TEAM_STATE_PATH="${RLP_TEAM_STATE_PATH:-.ralph-team/team-state.json}"

# Ensure knowledge files exist (accumulated per-role learnings).
for f in architect backend frontend qa design-enforcer reviewer; do
  [[ -f ".ralph-team/agents/${f}.md" ]] || printf "# %s Agent — Accumulated Knowledge\n\n" "$f" > ".ralph-team/agents/${f}.md"
done

[[ -f .ralph-team/progress.txt ]] || : > .ralph-team/progress.txt
[[ -f .ralph-team/architecture-decisions.md ]] || printf "# Architecture Decisions\n\n" > .ralph-team/architecture-decisions.md

# Ensure team-state exists.
if [[ ! -f "$TEAM_STATE_PATH" ]]; then
  cat > "$TEAM_STATE_PATH" <<'JSON'
{
  "tickets": {},
  "agents": {
    "architect": { "status": "idle", "current_ticket": null, "iterations": 0 },
    "backend": { "status": "idle", "current_ticket": null, "iterations": 0 },
    "frontend": { "status": "idle", "current_ticket": null, "iterations": 0 },
    "qa": { "status": "idle", "current_ticket": null, "iterations": 0 },
    "design-enforcer": { "status": "idle", "current_ticket": null, "iterations": 0 },
    "reviewer": { "status": "idle", "current_ticket": null, "iterations": 0 }
  },
  "sprint": {
    "status": "not_started",
    "total_tickets": 0,
    "completed_tickets": 0,
    "blocked_tickets": 0,
    "iteration": 0
  }
}
JSON
fi

echo "✅ Repo-local ralph-team-v2 initialized (ensured .ralph-team/* directories exist)."
echo "   Agents specs: $SCRIPT_DIR/agents"
echo "   Team state: ${TEAM_STATE_PATH}"
