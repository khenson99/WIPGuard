#!/usr/bin/env bash
set -euo pipefail

MAX_ITERATIONS=20
MAX_ASSIGNMENTS_PER_ITERATION=2
SCOPE_LABEL=""
TEAM_STATE_PATH="${RLP_TEAM_STATE_PATH:-.ralph-team/team-state.json}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/agents"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope-label) SCOPE_LABEL="${2:-}"; shift 2 ;;
    --max-iterations) MAX_ITERATIONS="${2:-}"; shift 2 ;;
    --max-assignments) MAX_ASSIGNMENTS_PER_ITERATION="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f ".ralph-team/config.json" ]]; then
  echo "Error: .ralph-team/config.json not found. Run ./scripts/ralph-team-v2/init.sh first." >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: claude (Claude Code) not found in PATH." >&2
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh not found in PATH." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq not found in PATH." >&2
  exit 1
fi

mkdir -p .ralph-team/current-tasks
if [[ ! -f "$TEAM_STATE_PATH" ]]; then
  echo "Error: team state file not found at $TEAM_STATE_PATH." >&2
  echo "Fix: run: RLP_TEAM_STATE_PATH=\"$TEAM_STATE_PATH\" ./scripts/ralph-team-v2/init.sh" >&2
  exit 1
fi

# Optional: source local secrets (gitignored under .ralph-team/).
SECRETS_ENV_PATH="${RLP_SECRETS_ENV:-.ralph-team/secrets.env}"
if [[ -f "$SECRETS_ENV_PATH" ]]; then
  # shellcheck disable=SC1090
  source "$SECRETS_ENV_PATH"
fi

if [[ -z "${GH_TOKEN:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
  export GH_TOKEN="$GITHUB_TOKEN"
fi
if [[ -z "${GH_TOKEN:-}" && -n "${RLP_GH_TOKEN:-}" ]]; then
  export GH_TOKEN="$RLP_GH_TOKEN"
fi

if ! gh api user --jq .login >/dev/null 2>&1; then
  echo "Error: gh cannot authenticate to GitHub (github.com)." >&2
  gh auth status -h github.com || true
  exit 2
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [[ -z "$REPO" ]]; then
  echo "Error: unable to determine repo (gh repo view failed)." >&2
  exit 1
fi

REPO_TYPE="$(jq -r '.repo_type' .ralph-team/config.json 2>/dev/null || echo unknown)"
DETECTED_STACK="$(jq -c '.detected_stack' .ralph-team/config.json 2>/dev/null || echo '{}')"

echo "🏗️  Starting Team Loop (Repo-local ralph-team-v2)"
echo "   Repo: $REPO"
echo "   Repo type: $REPO_TYPE"
if [[ -n "$SCOPE_LABEL" ]]; then
  echo "   Scope label: $SCOPE_LABEL"
fi
echo "   Max iterations: $MAX_ITERATIONS"
echo "   Max assignments/iteration: $MAX_ASSIGNMENTS_PER_ITERATION"

urlencode() {
  jq -rn --arg v "$1" '$v|@uri'
}

fetch_open_items_json() {
  local label="${1:-}"
  local url="repos/${REPO}/issues?state=open&per_page=100"
  if [[ -n "$label" ]]; then
    url="${url}&labels=$(urlencode "$label")"
  fi
  gh api -X GET "$url" 2>/dev/null || echo "[]"
}

issue_json_for_number() {
  local num="$1"
  gh api -X GET "repos/${REPO}/issues/${num}" 2>/dev/null || echo "{}"
}

extract_issues() {
  jq '[.[] | select(.pull_request | not) | {
    number,
    title,
    body,
    assignees: ((.assignees // []) | map({login: .login})),
    labels: ((.labels // []) | map({name: .name}))
  }]'
}

extract_prs() {
  jq '[.[] | select(.pull_request) | {
    number,
    title,
    labels: ((.labels // []) | map({name: .name})),
    reviewDecision: null
  }]'
}

parse_json_action_plan() {
  python3 - <<'PY'
import json, re, sys
text = sys.stdin.read()
text = text.strip()
if not text:
  print("{}")
  sys.exit(0)
try:
  print(json.dumps(json.loads(text)))
  sys.exit(0)
except Exception:
  pass
m = re.search(r"\{[\s\S]*\}", text)
if not m:
  print("{}")
  sys.exit(0)
try:
  print(json.dumps(json.loads(m.group(0))))
except Exception:
  print("{}")
PY
}

run_agent() {
  local AGENT_ROLE="$1"
  local TICKET_NUMBER="$2"
  local AGENT_MAX_ITERATIONS="${3:-$MAX_ITERATIONS}"

  local AGENT_SPEC="$AGENTS_DIR/${AGENT_ROLE}.md"
  if [[ ! -f "$AGENT_SPEC" ]]; then
    echo "  ⚠️  No agent spec found for: $AGENT_ROLE ($AGENT_SPEC)" >&2
    return 1
  fi

  local KNOWLEDGE_FILE=".ralph-team/agents/${AGENT_ROLE}.md"
  local TASK_FILE=".ralph-team/current-tasks/${AGENT_ROLE}.json"

  local TICKET_JSON
  TICKET_JSON="$(issue_json_for_number "$TICKET_NUMBER")"
  local TICKET_TITLE
  TICKET_TITLE="$(echo "$TICKET_JSON" | jq -r '.title // ""' 2>/dev/null)"
  local TICKET_BODY
  TICKET_BODY="$(echo "$TICKET_JSON" | jq -r '.body // ""' 2>/dev/null)"

  cat > "$TASK_FILE" <<JSON
{
  "ticket_number": $TICKET_NUMBER,
  "agent": "$AGENT_ROLE",
  "repo": "$REPO",
  "repo_type": "$REPO_TYPE",
  "scope_label": "${SCOPE_LABEL:-}",
  "detected_stack": $DETECTED_STACK
}
JSON

  local iter=0
  while [[ $iter -lt $AGENT_MAX_ITERATIONS ]]; do
    iter=$((iter + 1))
    echo "    ── $AGENT_ROLE iteration $iter / $AGENT_MAX_ITERATIONS ──"

    local PROGRESS_TAIL=""
    PROGRESS_TAIL="$(tail -50 .ralph-team/progress.txt 2>/dev/null || echo "No progress yet")"

    local PROMPT_FILE
    PROMPT_FILE="$(mktemp -t ralph-agent-prompt.XXXXXX)"
    cat >"$PROMPT_FILE" <<AGENT_PROMPT_EOF
You are the $AGENT_ROLE agent in a repo-local Ralph Team Loop (v2 ergonomics, v1 routing).

## Role Spec
$(cat "$AGENT_SPEC")

## Assignment
Ticket #$TICKET_NUMBER: $TICKET_TITLE

$TICKET_BODY

## Context
- Repo: $REPO
- Repo type: $REPO_TYPE
- Detected stack: $DETECTED_STACK
- Iteration: $iter of $AGENT_MAX_ITERATIONS

## Accumulated Knowledge
$(cat "$KNOWLEDGE_FILE" 2>/dev/null || echo "No accumulated knowledge yet")

## Recent Progress
$PROGRESS_TAIL

## Instructions
1) Implement the ticket in this repo.
2) Add/adjust tests according to the ticket Test Plan.
3) Open a PR that closes the issue.
4) Update .ralph-team/progress.txt with learnings.
5) Update .ralph-team/agents/${AGENT_ROLE}.md with discovered patterns.
6) When done, output: <promise>TICKET_DONE</promise>
7) If blocked, output: <promise>BLOCKED</promise> with a reason.
AGENT_PROMPT_EOF

    local PROMPT
    PROMPT="$(cat "$PROMPT_FILE")"
    rm -f "$PROMPT_FILE" 2>/dev/null || true

    local OUTPUT=""
    OUTPUT="$(claude -p "$PROMPT" --dangerously-skip-permissions </dev/null 2>&1)" || true

    mkdir -p .ralph-team/logs >/dev/null 2>&1 || true
    printf '%s\n' "$OUTPUT" > ".ralph-team/logs/${AGENT_ROLE}-issue-${TICKET_NUMBER}-iter-${iter}.log" 2>/dev/null || true

    if echo "$OUTPUT" | grep -q "<promise>TICKET_DONE</promise>"; then
      echo "    ✅ $AGENT_ROLE completed ticket #$TICKET_NUMBER"
      jq --arg tn "$TICKET_NUMBER" --arg role "$AGENT_ROLE" \
        '.tickets[$tn].status = "pr-open" | .tickets[$tn].agent = $role
         | (.agents[$role].status) = "idle" | (.agents[$role].current_ticket) = null' \
        "$TEAM_STATE_PATH" > /tmp/team-state-tmp.json && mv /tmp/team-state-tmp.json "$TEAM_STATE_PATH"
      return 0
    fi

    if echo "$OUTPUT" | grep -q "<promise>BLOCKED</promise>"; then
      local REASON=""
      REASON="$(echo "$OUTPUT" | grep -A1 "BLOCKED" | tail -1 | head -c 200)"
      echo "    🚫 $AGENT_ROLE blocked on ticket #$TICKET_NUMBER: $REASON"
      jq --arg tn "$TICKET_NUMBER" --arg role "$AGENT_ROLE" --arg reason "$REASON" \
        '.tickets[$tn].status = "blocked" | .tickets[$tn].agent = $role | .tickets[$tn].blocked_reason = $reason
         | (.agents[$role].status) = "idle" | (.agents[$role].current_ticket) = null' \
        "$TEAM_STATE_PATH" > /tmp/team-state-tmp.json && mv /tmp/team-state-tmp.json "$TEAM_STATE_PATH"
      return 2
    fi

    echo "    ... $AGENT_ROLE still working"
    sleep 1
  done

  echo "    ⚠️  $AGENT_ROLE hit max iterations on ticket #$TICKET_NUMBER"
  return 1
}

ARCHITECT_ITER=0
while [[ $ARCHITECT_ITER -lt $MAX_ITERATIONS ]]; do
  ARCHITECT_ITER=$((ARCHITECT_ITER + 1))
  echo ""
  echo "━━━ Architect Iteration $ARCHITECT_ITER / $MAX_ITERATIONS ━━━"

  OPEN_ITEMS_JSON="$(fetch_open_items_json "$SCOPE_LABEL")"
  OPEN_ISSUES_JSON="$(echo "$OPEN_ITEMS_JSON" | extract_issues)"
  OPEN_PRS_JSON="$(echo "$OPEN_ITEMS_JSON" | extract_prs)"

  ARCH_PROMPT_FILE="$(mktemp -t ralph-architect-prompt.XXXXXX)"
  cat >"$ARCH_PROMPT_FILE" <<ARCH_PROMPT_EOF
You are the Architect agent for a repo-local Ralph Team Loop.

## Scope (Hard Constraint)
If a scope label was provided ("$SCOPE_LABEL"), you MUST only assign tickets present in the scoped Open Issues list below.

## Agent Specification
$(cat "$AGENTS_DIR/architect.md")

## Current Team State
$(cat "$TEAM_STATE_PATH")

## Open Issues
$OPEN_ISSUES_JSON

## Open PRs
$OPEN_PRS_JSON

## Recent Progress
$(tail -50 .ralph-team/progress.txt 2>/dev/null || echo "No progress yet")

## Context
- Repo: $REPO
- Repo type: $REPO_TYPE
- Detected stack: $DETECTED_STACK
- Iteration: $ARCHITECT_ITER of $MAX_ITERATIONS

Hard constraint: assign AT MOST $MAX_ASSIGNMENTS_PER_ITERATION tickets in this iteration.
Respond with ONLY valid JSON (no markdown).
ARCH_PROMPT_EOF
  ARCH_PROMPT="$(cat "$ARCH_PROMPT_FILE")"
  rm -f "$ARCH_PROMPT_FILE" 2>/dev/null || true

  ARCH_OUTPUT="$(claude -p "$ARCH_PROMPT" --dangerously-skip-permissions 2>&1)" || true
  ACTION_PLAN="$(echo "$ARCH_OUTPUT" | parse_json_action_plan)"

  SPRINT_COMPLETE="$(echo "$ACTION_PLAN" | jq -r '.sprint_complete // false' 2>/dev/null || echo false)"
  SPRINT_BLOCKED="$(echo "$ACTION_PLAN" | jq -r '.sprint_blocked // false' 2>/dev/null || echo false)"
  if [[ "$SPRINT_COMPLETE" == "true" ]]; then
    echo "🎉 Sprint complete."
    exit 0
  fi
  if [[ "$SPRINT_BLOCKED" == "true" ]]; then
    echo "🚫 Sprint blocked."
    exit 2
  fi

  ASSIGNMENTS="$(echo "$ACTION_PLAN" | jq -c '.assignments // []' 2>/dev/null || echo '[]')"
  NUM_ASSIGNMENTS="$(echo "$ASSIGNMENTS" | jq 'length' 2>/dev/null || echo 0)"
  if [[ "$NUM_ASSIGNMENTS" -gt 0 ]]; then
    echo "  📝 Architect assigned $NUM_ASSIGNMENTS ticket(s)"
    echo "$ASSIGNMENTS" | jq -c ".[0:${MAX_ASSIGNMENTS_PER_ITERATION}][]?" | while read -r assignment; do
      TICKET="$(echo "$assignment" | jq -r '.ticket')"
      AGENT="$(echo "$assignment" | jq -r '.agent')"
      NOTES="$(echo "$assignment" | jq -r '.notes // \"\"')"

      echo ""
      echo "  ─── Dispatching $AGENT for ticket #$TICKET ───"
      [[ -n "$NOTES" ]] && echo "  Notes: $NOTES"

      jq --arg tn "$TICKET" --arg agent "$AGENT" \
        '.tickets[$tn] = {"status": "in-progress", "agent": $agent}
         | (.agents[$agent].status) = "working"
         | (.agents[$agent].current_ticket) = ($tn | tonumber)' \
        "$TEAM_STATE_PATH" > /tmp/team-state-tmp.json && mv /tmp/team-state-tmp.json "$TEAM_STATE_PATH" 2>/dev/null || true

      run_agent "$AGENT" "$TICKET" "$MAX_ITERATIONS" || true
    done
  else
    SUMMARY="$(echo "$ACTION_PLAN" | jq -r '.summary // \"No assignments\"' 2>/dev/null || echo "No assignments")"
    echo "  ℹ️  $SUMMARY"
  fi

  sleep 2
done

echo "⚠️  Architect hit max iterations ($MAX_ITERATIONS)."
exit 1
