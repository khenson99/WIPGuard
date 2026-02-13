#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = os.environ.get("REPO", "khenson99/WIPGuard")
PROJECT_OWNER = os.environ.get("PROJECT_OWNER", "khenson99")
PROJECT_NUMBER = os.environ.get("PROJECT_NUMBER", "4")
TEAM_STATE_PATH = Path(os.environ.get("TEAM_STATE_PATH", ".ralph-team/team-state.json"))

if not TEAM_STATE_PATH.exists():
    print(f"team-state file not found: {TEAM_STATE_PATH}", file=sys.stderr)
    sys.exit(1)


def run_json(cmd):
    out = subprocess.check_output(cmd, text=True)
    return json.loads(out)


def run(cmd):
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def map_ticket_to_label(ticket_status: str) -> str:
    status = (ticket_status or "").strip().lower().replace("_", "-")
    if status in {"done", "completed", "closed"}:
        return "status:done"
    if status == "blocked":
        return "status:blocked"
    if status in {"assigned", "in-progress", "pr-open", "working", "in-review", "review"}:
        return "status:in-progress"
    if status in {"ready", "todo", "not-started", "pending"}:
        return "status:ready"
    return "status:ready"


def map_label_to_project_status(label: str) -> str:
    if label == "status:done":
        return "Done"
    if label in {"status:in-progress", "status:blocked"}:
        return "In Progress"
    return "Todo"


project = run_json(["gh", "project", "view", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"])
project_id = project["id"]

field_list = run_json(["gh", "project", "field-list", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"])
status_field = next((f for f in field_list.get("fields", []) if f.get("name") == "Status"), None)
if not status_field:
    print("could not find Status field", file=sys.stderr)
    sys.exit(1)
status_field_id = status_field["id"]
option_by_name = {opt["name"]: opt["id"] for opt in status_field.get("options", [])}
for needed in ("Todo", "In Progress", "Done"):
    if needed not in option_by_name:
        print(f"missing option '{needed}' in project status field", file=sys.stderr)
        sys.exit(1)

items = run_json([
    "gh", "project", "item-list", PROJECT_NUMBER, "--owner", PROJECT_OWNER,
    "--limit", "200", "--format", "json"
])
item_by_issue = {}
project_status_by_issue = {}
for item in items.get("items", []):
    content = item.get("content") or {}
    if content.get("type") != "Issue":
        continue
    issue_num = str(content.get("number"))
    item_by_issue[issue_num] = item.get("id")
    project_status_by_issue[issue_num] = item.get("status")

issues = run_json([
    "gh", "issue", "list", "--repo", REPO,
    "--state", "all", "--limit", "200", "--json", "number,labels,state"
])
status_label_by_issue = {}
issue_state_by_issue = {}
for issue in issues:
    labels = [lab.get("name", "") for lab in issue.get("labels", [])]
    status_labels = [x for x in labels if x.startswith("status:")]
    issue_num = str(issue.get("number"))
    status_label_by_issue[issue_num] = status_labels[0] if status_labels else ""
    issue_state_by_issue[issue_num] = (issue.get("state") or "").upper()

team_state = json.loads(TEAM_STATE_PATH.read_text(encoding="utf-8"))
tickets = team_state.get("tickets", {})

labels_updated = 0
project_updated = 0

for issue_num, ticket_data in tickets.items():
    ticket_status = str((ticket_data or {}).get("status", ""))
    target_label = map_ticket_to_label(ticket_status)
    current_label = status_label_by_issue.get(issue_num, "")
    issue_state = issue_state_by_issue.get(issue_num, "")

    # Closed issues are considered done regardless of stale status labels.
    if issue_state == "CLOSED":
        target_label = "status:done"

    # Skip mutating labels on closed issues; keep project status authoritative.
    if issue_state != "CLOSED" and current_label != target_label:
        cmd = [
            "gh", "issue", "edit", issue_num, "-R", REPO,
            "--add-label", target_label,
            "--remove-label", "status:ready",
            "--remove-label", "status:in-progress",
            "--remove-label", "status:blocked",
            "--remove-label", "status:done",
        ]
        run(cmd)
        print(f"issue #{issue_num} label: {current_label or 'none'} -> {target_label}")
        labels_updated += 1
        status_label_by_issue[issue_num] = target_label

    target_project_status = map_label_to_project_status(target_label)
    current_project_status = project_status_by_issue.get(issue_num)
    item_id = item_by_issue.get(issue_num)

    if item_id and current_project_status != target_project_status:
        option_id = option_by_name[target_project_status]
        run([
            "gh", "project", "item-edit",
            "--id", item_id,
            "--project-id", project_id,
            "--field-id", status_field_id,
            "--single-select-option-id", option_id,
        ])
        print(f"project item #{issue_num} status: {current_project_status or 'none'} -> {target_project_status}")
        project_updated += 1
        project_status_by_issue[issue_num] = target_project_status

print(f"sync complete: labels_updated={labels_updated} project_status_updated={project_updated}")
