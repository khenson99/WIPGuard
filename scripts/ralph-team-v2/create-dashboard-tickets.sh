#!/usr/bin/env bash
set -euo pipefail

# Creates the 4 dashboard tickets scoped to label `enhancement` and adds them to
# the user Project #4 (khenson99). Safe to re-run (dedupes by exact title match).
#
# Requires: gh authenticated with `project` scope.

REPO="khenson99/WIPGuard"
OWNER_LOGIN="khenson99"
PROJECT_NUMBER=4

retry() {
  local max=${1:?}; shift
  local attempt=0
  until "$@"; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge $max ]]; then
      return 1
    fi
    sleep $((attempt * 2))
  done
}

project_id() {
  retry 8 gh api graphql \
    -f query='query($login:String!,$number:Int!){user(login:$login){projectV2(number:$number){id}}}' \
    -f login="$OWNER_LOGIN" -F number="$PROJECT_NUMBER" \
    -q '.data.user.projectV2.id'
}

issue_id() {
  local number="$1"
  retry 8 gh api graphql \
    -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){id}}}' \
    -f owner='khenson99' -f name='WIPGuard' -F number="$number" \
    -q '.data.repository.issue.id'
}

add_to_project() {
  local proj_id="$1"
  local content_id="$2"
  retry 8 gh api graphql \
    -f query='mutation($projectId:ID!,$contentId:ID!){addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){item{id}}}' \
    -f projectId="$proj_id" -f contentId="$content_id" \
    -q '.data.addProjectV2ItemById.item.id' >/dev/null
}

search_issue_number_by_title() {
  local title="$1"
  local q
  q=$(jq -rn --arg q "repo:${REPO} in:title \\\"${title}\\\"" '$q|@uri')
  retry 8 gh api -X GET "search/issues?q=$q" -q '.items[0].number // empty' 2>/dev/null || true
}

create_issue() {
  local title="$1"
  local body_file="$2"
  shift 2
  local -a labels=("$@")

  local existing
  existing="$(search_issue_number_by_title "$title")"
  if [[ -n "$existing" ]]; then
    echo "$existing"
    return 0
  fi

  local -a args=( -f title="$title" -f body="$(cat "$body_file")" )
  for lab in "${labels[@]}"; do
    args+=( -f "labels[]=${lab}" )
  done

  retry 8 gh api -X POST "repos/${REPO}/issues" "${args[@]}" -q .number
}

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

PROJ_ID="$(project_id)"
echo "Project ID: $PROJ_ID"

cat > "$TMPDIR/t1.md" <<'EOF'
Goal: make `/dashboard` (first page after login) more visual and less text-heavy.

Primary files:
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/dashboard/personalized-dashboard.tsx`
- Reuse existing chart components in `src/components/charts/*` (notably `donut-chart.tsx`, `stacked-bar-chart.tsx`).

UI/UX requirements:
1) Add a **“My Workload” donut chart** using existing payload counts:
   - segments: Blocked (`myBlocked.length`), Overdue (`myOverdue.length`), Due Soon (`myDueSoon.length`), Active (`myActive.length`)
   - show center label/value (total tasks in those buckets)
   - include a legend next to the chart (labels + counts).
2) Add a **“Team Status Overview” chart** using `team.taskStatusOverview` (stacked bar or donut is fine; prefer stacked bar for readability).
3) Replace/condense long copy so that above-the-fold is primarily **KPI cards + charts**.
4) Keep existing sections (Recommended Next Actions, Task lists, Projects) but make them more skimmable (tighter spacing, cap visible items with “View more”).

Accessibility:
- charts/legend must have clear labels; interactive elements must be reachable by keyboard.

Acceptance criteria:
- `/dashboard` renders both charts with real data and looks good in dark mode.
- No regressions to stale-cache behavior, refresh behavior, or navigation to `/tasks?task=...`.
EOF

T1="$(create_issue '[Dashboard] Visual refresh: charts + reduced text density' "$TMPDIR/t1.md" enhancement agent:frontend repo:frontend type:feature priority:high status:ready)"
echo "Ticket1: #$T1"
add_to_project "$PROJ_ID" "$(issue_id "$T1")"

cat > "$TMPDIR/t2.md" <<'EOF'
Goal: add lightweight time-series data so the dashboard can show sparklines.

Update `GET /api/dashboard/personalized` (`src/app/api/dashboard/personalized/route.ts`) to include:
- `personal.completedByDay`: last **14 days** inclusive, array of `{ date: "YYYY-MM-DD", count: number }`
  - counts tasks where `status="DONE"` and `updatedAt` falls on that day and responsible includes current user.

Update the client validator in `src/components/dashboard/personalized-dashboard.tsx` to allow the new field (optional at first, required once frontend uses it).

Acceptance criteria:
- endpoint still returns existing fields unchanged
- `completedByDay` is stable (always 14 entries, zero-filled days)
- unit test coverage added/updated (vitest) for the bucketing helper
EOF

T2="$(create_issue '[Dashboard API] Add completion trend series for sparklines' "$TMPDIR/t2.md" enhancement agent:backend repo:backend type:feature priority:medium status:ready)"
echo "Ticket2: #$T2"
add_to_project "$PROJ_ID" "$(issue_id "$T2")"

cat > "$TMPDIR/t3.md" <<EOF
Blocked by: #$T2 (needs \`personal.completedByDay\`).

Add a “Focus” interaction model to \`PersonalizedDashboard\`:
- clicking donut legend items (Blocked/Overdue/Due Soon/Active) changes the visible focused TaskList section (within the dashboard).
- add keyboard support: legend items behave like buttons.

Use existing \`src/components/charts/spark-line.tsx\` to add a sparkline to the “Completed (7d)” KPI card using \`completedByDay\`.

Keep drilldown simple:
- focused tasks still navigate via existing \`router.push(/tasks?task=ID)\` on click.

Acceptance criteria:
- clicking a chart segment/legend item updates the focused list deterministically
- sparkline renders when there are 2+ points; hidden otherwise
EOF

T3="$(create_issue '[Dashboard] Interactivity: click-to-focus + sparklines in KPIs' "$TMPDIR/t3.md" enhancement agent:frontend repo:frontend type:feature priority:medium status:blocked)"
echo "Ticket3: #$T3"
add_to_project "$PROJ_ID" "$(issue_id "$T3")"

cat > "$TMPDIR/t4.md" <<EOF
Blocked by: #$T1, #$T2, #$T3.

Add/extend tests in:
- \`src/components/dashboard/personalized-dashboard.test.tsx\`

Required test scenarios:
1) renders charts when cached data is present
2) focus changes when clicking legend items
3) keyboard Enter/Space triggers focus change
4) stale-cache “fetch fails” behavior remains intact

Add a basic a11y assertion strategy (at minimum: presence of accessible names/labels for chart sections and focus controls).
EOF

T4="$(create_issue '[Dashboard] QA/a11y: tests for charts + focus interactions' "$TMPDIR/t4.md" enhancement agent:qa repo:frontend type:test priority:low status:blocked)"
echo "Ticket4: #$T4"
add_to_project "$PROJ_ID" "$(issue_id "$T4")"

echo "✅ Tickets ready: #$T1 #$T2 #$T3 #$T4"

