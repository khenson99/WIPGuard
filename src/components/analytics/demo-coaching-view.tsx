"use client";

import { FileText, Gauge, Link as LinkIcon, MessageSquare, Target } from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

function scoreTone(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

export function DemoCoachingView({ data }: { data: AnalyticsDashboardData | null }) {
  const demo = data?.demoAnalytics;
  const analyzed = (demo?.demos ?? [])
    .filter((record) => !record.isUpcoming && record.analysisStatus === "ready")
    .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

  if (!demo || analyzed.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CoachingStat label="Analyzed Demos" value={demo.analyzedDemoCount.toLocaleString()} icon={Target} />
        <CoachingStat label="Avg Quality Score" value={demo.avgDemoQualityScore ? `${demo.avgDemoQualityScore}` : "—"} icon={Gauge} />
        <CoachingStat label="Transcript Coverage" value={`${demo.transcriptCoveragePct}%`} icon={LinkIcon} />
        <CoachingStat label="Top Gap Theme" value={demo.topGapThemes[0]?.label ?? "—"} icon={MessageSquare} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ThemePanel title="Common Strength Themes" items={demo.topStrengthThemes} emptyLabel="No recurring strengths yet" />
        <ThemePanel title="Common Gap Themes" items={demo.topGapThemes} emptyLabel="No recurring gaps yet" negative />
      </div>

      <div className="space-y-4">
        {analyzed.map((record) => (
          <article key={`${record.dealId}:${record.meetingId ?? "fallback"}`} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{record.dealName}</h3>
                <p className="text-xs text-muted-foreground">
                  {record.meetingTitle ?? "Historical demo"} · {new Date(record.scheduledAt).toLocaleString()}
                </p>
              </div>
              <div className={`text-sm font-semibold ${scoreTone(record.qualityScore)}`}>
                {record.qualityScore != null ? `${record.qualityScore}/100` : "Unscored"}
              </div>
            </div>

            <p className="mt-3 text-sm text-foreground">{record.qualitySummary ?? "No coaching summary available."}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {record.outcomeConfidence && (
                <MetaPill label={`Outcome confidence: ${record.outcomeConfidence}`} />
              )}
              {record.transcriptMatchConfidence != null && (
                <MetaPill label={`Transcript match: ${Math.round(record.transcriptMatchConfidence * 100)}%`} />
              )}
              <MetaPill label={`Transcript: ${record.transcriptStatus}`} />
              <MetaPill label={`Analysis: ${record.analysisStatus}`} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ListCard title="Strengths" items={record.strengths} />
              <ListCard title="Gaps" items={record.gaps} negative />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <MemoCard title="Coaching Memo" content={record.coachingMemo} />
              <MemoCard title="Next-Step Memo" content={record.nextStepMemo} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ListCard title="Customer Signals" items={record.customerSignals} />
              <ListCard title="Recommended Next Steps" items={record.nextSteps} />
            </div>

            {record.transcriptSourceUrl && (
              <a
                href={record.transcriptSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                {record.transcriptSourceTitle ?? "Open transcript"}
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function CoachingStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Target;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-background/60 px-2 py-1">
      {label}
    </span>
  );
}

function ThemePanel({
  title,
  items,
  emptyLabel,
  negative = false,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  emptyLabel: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
              <span className={negative ? "text-red-500" : "text-foreground"}>{item.label}</span>
              <span className="tabular-nums text-muted-foreground">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListCard({
  title,
  items,
  negative = false,
}: {
  title: string;
  items: string[];
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None captured.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item} className={negative ? "text-red-500" : "text-foreground"}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemoCard({ title, content }: { title: string; content: string | null }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {content?.trim() || "No memo available yet."}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No transcript-backed demo coaching is available yet</p>
        <p className="text-xs text-muted-foreground">Match Google Drive transcripts to past demos to populate this view</p>
      </div>
    </div>
  );
}
