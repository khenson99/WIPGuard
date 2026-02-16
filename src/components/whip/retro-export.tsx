"use client";

import { useCallback, useState } from "react";
import type { PlannedVsUnplannedResult, FlowRiskIntelligenceReport, WhipTask } from "./types";

interface RetroExportProps {
  sprintName: string | null;
  sprintData: PlannedVsUnplannedResult | null;
  riskReport: FlowRiskIntelligenceReport | null;
  tasks: WhipTask[];
}

type ExportFormat = "markdown" | "json";

function buildMarkdown(
  sprintName: string,
  sprintData: PlannedVsUnplannedResult,
  riskReport: FlowRiskIntelligenceReport | null,
  tasks: WhipTask[]
): string {
  const { summary } = sprintData;
  const totalTasks = summary.totalPlanned + summary.totalUnplanned;
  const creepPercent =
    totalTasks > 0
      ? Math.round((summary.totalUnplanned / totalTasks) * 100)
      : 0;
  const completionRate =
    totalTasks > 0
      ? Math.round(
          ((summary.plannedDone + summary.unplannedDone) / totalTasks) * 100
        )
      : 0;

  const lines: string[] = [
    `# Sprint Retrospective: ${sprintName}`,
    "",
    `> Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    "",
    "## Scope Summary",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Planned tasks | ${summary.totalPlanned} (${summary.plannedDone} done) |`,
    `| Unplanned tasks | ${summary.totalUnplanned} (${summary.unplannedDone} done) |`,
    `| Scope creep ratio | ${creepPercent}% |`,
    `| Sprint completion | ${completionRate}% |`,
    "",
  ];

  // Unplanned task additions
  const unplannedTasks = tasks.filter((t) => t.unplanned);
  if (unplannedTasks.length > 0) {
    lines.push("## Unplanned Tasks Added");
    lines.push("");
    for (const t of unplannedTasks) {
      const reason = t.unplannedReason
        ? ` _(${t.unplannedReason.replace(/_/g, " ").toLowerCase()})_`
        : "";
      const owner =
        t.responsible.length > 0
          ? ` -- ${t.responsible[0].name ?? t.responsible[0].email}`
          : "";
      lines.push(
        `- **[${t.priority}]** ${t.title}${reason}${owner} (${t.status.replace(/_/g, " ").toLowerCase()})`
      );
    }
    lines.push("");
  }

  // WIP pressure
  if (riskReport && riskReport.wipPressure.people.length > 0) {
    const people = riskReport.wipPressure.people;
    const overloaded = people.filter((p) => p.overloaded);

    lines.push("## WIP Pressure");
    lines.push("");
    lines.push("| Assignee | Active | Limit | Pressure | Status |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const p of people) {
      const label = p.overloaded ? "OVERLOADED" : "OK";
      lines.push(
        `| ${p.name ?? p.email ?? "Unknown"} | ${p.activeTaskCount} | ${p.wipLimit} | ${Math.round(p.pressureScore)}% | ${label} |`
      );
    }
    lines.push("");

    if (overloaded.length > 0) {
      lines.push(
        `> **${overloaded.length}** team member${overloaded.length !== 1 ? "s" : ""} exceeded WIP limits during this sprint.`
      );
      lines.push("");
    }
  }

  // Recommendations
  if (riskReport && riskReport.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (const rec of riskReport.recommendations) {
      lines.push(`- **${rec.severity.toUpperCase()}** -- ${rec.title}: ${rec.rationale}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildJson(
  sprintName: string,
  sprintData: PlannedVsUnplannedResult,
  riskReport: FlowRiskIntelligenceReport | null,
  tasks: WhipTask[]
): string {
  const { summary } = sprintData;
  const totalTasks = summary.totalPlanned + summary.totalUnplanned;

  const payload = {
    sprint: sprintName,
    generatedAt: new Date().toISOString(),
    scope: {
      totalPlanned: summary.totalPlanned,
      plannedDone: summary.plannedDone,
      totalUnplanned: summary.totalUnplanned,
      unplannedDone: summary.unplannedDone,
      creepPercent:
        totalTasks > 0
          ? Math.round((summary.totalUnplanned / totalTasks) * 100)
          : 0,
      completionPercent:
        totalTasks > 0
          ? Math.round(
              ((summary.plannedDone + summary.unplannedDone) / totalTasks) * 100
            )
          : 0,
    },
    unplannedTasks: tasks
      .filter((t) => t.unplanned)
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        reason: t.unplannedReason,
        owner:
          t.responsible.length > 0
            ? t.responsible[0].name ?? t.responsible[0].email
            : null,
      })),
    wipPressure: riskReport
      ? riskReport.wipPressure.people.map((p) => ({
          name: p.name ?? p.email ?? "Unknown",
          activeTaskCount: p.activeTaskCount,
          wipLimit: p.wipLimit,
          pressureScore: Math.round(p.pressureScore),
          overloaded: p.overloaded,
        }))
      : [],
    recommendations: riskReport
      ? riskReport.recommendations.map((r) => ({
          severity: r.severity,
          title: r.title,
          rationale: r.rationale,
        }))
      : [],
  };

  return JSON.stringify(payload, null, 2);
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function RetroExport({
  sprintName,
  sprintData,
  riskReport,
  tasks,
}: RetroExportProps) {
  const [copied, setCopied] = useState(false);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!sprintData || !sprintName) return;

      if (format === "markdown") {
        const md = buildMarkdown(sprintName, sprintData, riskReport, tasks);
        const filename = `retro-${sprintName.replace(/\s+/g, "-").toLowerCase()}.md`;
        downloadFile(md, filename, "text/markdown");
      } else {
        const json = buildJson(sprintName, sprintData, riskReport, tasks);
        const filename = `retro-${sprintName.replace(/\s+/g, "-").toLowerCase()}.json`;
        downloadFile(json, filename, "application/json");
      }
    },
    [sprintName, sprintData, riskReport, tasks]
  );

  const handleCopyMarkdown = useCallback(async () => {
    if (!sprintData || !sprintName) return;
    const md = buildMarkdown(sprintName, sprintData, riskReport, tasks);
    await copyToClipboard(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sprintName, sprintData, riskReport, tasks]);

  if (!sprintData) {
    return (
      <div className="h-24 animate-pulse rounded-lg border border-border bg-muted" />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Sprint Retrospective Export
        </h3>
        <span className="text-xs text-muted-foreground">
          {sprintName ?? "No sprint selected"}
        </span>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Generate a retrospective summary with scope creep data, WIP pressure
        metrics, and recommendations.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleExport("markdown")}
          disabled={!sprintData}
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Download Markdown
        </button>
        <button
          type="button"
          onClick={() => handleExport("json")}
          disabled={!sprintData}
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={handleCopyMarkdown}
          disabled={!sprintData}
          className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>
      </div>
    </div>
  );
}
