#!/usr/bin/env bash
set -euo pipefail

MAX_ITERATIONS=10
SCOPE_LABEL=""
TEAM_STATE_PATH="${RLP_TEAM_STATE_PATH:-.ralph-team/team-state.json}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/agents"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope-label) SCOPE_LABEL="${2:-}"; shift 2 ;;
    --max-iterations) MAX_ITERATIONS="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f ".ralph-team/config.json" ]]; then
  echo "Error: .ralph-team/config.json not found. Run ./scripts/ralph-team-v2/init.sh first." >&2
  exit 1
fi
if [[ ! -f "$TEAM_STATE_PATH" ]]; then
  echo "Error: team state file not found at $TEAM_STATE_PATH." >&2
  echo "Fix: run: RLP_TEAM_STATE_PATH=\"$TEAM_STATE_PATH\" ./scripts/ralph-team-v2/init.sh" >&2
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

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [[ -z "$REPO" ]]; then
  echo "Error: unable to determine repo (gh repo view failed)." >&2
  exit 1
fi

REPO_TYPE="$(jq -r .repo_type .ralph-team/config.json 2>/dev/null || echo unknown)"
DETECTED_STACK="$(jq -c .detected_stack .ralph-team/config.json 2>/dev/null || echo '{}')"

CODEX_BIN="${CODEX_REAL_BIN:-}"
if [[ -z "$CODEX_BIN" ]]; then
  CODEX_BIN="$(command -v codex 2>/dev/null || true)"
fi

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

extract_pr_numbers() {
  jq -r '.[] | select(.pull_request) | .number'
}

echo "🧪 Starting Reviewer Loop (Repo-local ralph-team-v2)"
echo "   Repo: $REPO"
if [[ -n "$SCOPE_LABEL" ]]; then
  echo "   Scope label: $SCOPE_LABEL"
fi
echo "   Max iterations: $MAX_ITERATIONS"

ITER=0
while [[ $ITER -lt $MAX_ITERATIONS ]]; do
  ITER=$((ITER + 1))
  echo ""
  echo "=== Reviewer Iteration $ITER / $MAX_ITERATIONS ==="

  OPEN_ITEMS_JSON="$(fetch_open_items_json "$SCOPE_LABEL")"
  PR_NUMS="$(echo "$OPEN_ITEMS_JSON" | extract_pr_numbers | tr '\n' ' ' | xargs echo -n || true)"

  if [[ -z "${PR_NUMS:-}" ]]; then
    echo "No open scoped PRs to review."
    IN_PROGRESS="$(jq "[.tickets[] | select(.status == \"in-progress\" or .status == \"pr-open\" or .status == \"in_progress\")] | length" "$TEAM_STATE_PATH" 2>/dev/null || echo "0")"
    if [[ "$IN_PROGRESS" == "0" ]]; then
      echo "No open scoped PRs and no in-progress tickets. Review complete."
      {
        echo "--- Reviewer Complete ---"
        echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "Iterations used: $ITER"
        echo ""
      } >> .ralph-team/progress.txt
      exit 0
    fi
    echo "$IN_PROGRESS tickets still in progress; waiting for PRs..."
    sleep 10
    continue
  fi

  for PR_NUM in $PR_NUMS; do
    PR_TITLE="$(gh pr view "$PR_NUM" --json title -q .title 2>/dev/null || echo "")"
    PR_BODY="$(gh pr view "$PR_NUM" --json body -q .body 2>/dev/null || echo "")"

    echo ""
    echo "Reviewing PR #$PR_NUM: $PR_TITLE"

    PR_DIFF="$(gh pr diff "$PR_NUM" 2>/dev/null || true)"
    [[ -n "$PR_DIFF" ]] || PR_DIFF="(Unable to fetch diff via gh pr diff)"

    PR_COMMENTS="$(gh pr view "$PR_NUM" --json reviews --jq ".reviews[].body" 2>/dev/null || true)"
    [[ -n "$PR_COMMENTS" ]] || PR_COMMENTS="(No reviews yet)"

    PROMPT="$(cat <<PROMPT_EOF
You are the Reviewer agent for a repo-local Ralph Team Loop. Your job is to review PRs for correctness, quality, testing, and accessibility.

Context:
- Repo: $REPO
- Repo type: $REPO_TYPE
- Detected stack: $DETECTED_STACK
- Scope label: ${SCOPE_LABEL:-none}
- Iteration: $ITER of $MAX_ITERATIONS

PR #$PR_NUM: $PR_TITLE

PR Body:
$PR_BODY

Previous Reviews:
$PR_COMMENTS

Diff:
$PR_DIFF

Agent Specification:
$(cat "$AGENTS_DIR/reviewer.md")

Current Progress & Learnings:
$(cat .ralph-team/progress.txt 2>/dev/null || echo "(No progress log yet)")

Instructions:
- Review this PR according to your agent specification.
- After your review, take ONE of these actions:
  - APPROVE: gh pr review $PR_NUM --approve --body "approval message" && gh pr merge $PR_NUM --squash --delete-branch
  - CHANGES: gh pr review $PR_NUM --request-changes --body "detailed feedback"
  - CLOSE: gh pr close $PR_NUM --comment "reason"
- Output one of:
  - <promise>PR_${PR_NUM}_APPROVED</promise>
  - <promise>PR_${PR_NUM}_CHANGES_REQUESTED</promise>
  - <promise>PR_${PR_NUM}_CLOSED</promise>
PROMPT_EOF
)"

    if [[ -n "$CODEX_BIN" ]]; then
      OUTPUT="$("$CODEX_BIN" exec --full-auto "$PROMPT" 2>&1 || true)"
      echo "$OUTPUT"
    else
      echo "codex not found in PATH; skipping automated review actions."
      OUTPUT=""
    fi

    if [[ -n "$OUTPUT" ]] && echo "$OUTPUT" | grep -q "<promise>PR_${PR_NUM}_APPROVED</promise>"; then
      echo "PR #$PR_NUM ($PR_TITLE): APPROVED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    elif [[ -n "$OUTPUT" ]] && echo "$OUTPUT" | grep -q "<promise>PR_${PR_NUM}_CHANGES_REQUESTED</promise>"; then
      echo "PR #$PR_NUM ($PR_TITLE): CHANGES REQUESTED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    elif [[ -n "$OUTPUT" ]] && echo "$OUTPUT" | grep -q "<promise>PR_${PR_NUM}_CLOSED</promise>"; then
      echo "PR #$PR_NUM ($PR_TITLE): CLOSED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    fi

    sleep 2
  done

  sleep 5
done

echo "Reviewer hit max iterations ($MAX_ITERATIONS)."
exit 1
