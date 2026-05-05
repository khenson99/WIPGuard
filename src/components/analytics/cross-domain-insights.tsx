"use client";

import type { AnalyticsSectionId, CrossDomainInsights } from "@/lib/analytics/types";

const SECTION_LABELS: Record<AnalyticsSectionId, string> = {
  "website-traffic": "Website Traffic",
  "social-media": "Social Media",
  finance: "Finance",
  "sales-pipeline": "Sales & Pipeline",
  retention: "Retention",
  "customer-success": "Customer Success",
  "customer-journey": "Customer Journey",
  "demo-analytics": "Demo Analytics",
  "process-analytics": "Process Analytics",
};

function StatusDot({ status }: { status: "green" | "yellow" | "red" }) {
  const cls = status === "red" ? "bg-red-500" : status === "yellow" ? "bg-amber-500" : "bg-emerald-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

interface CrossDomainInsightsPanelProps {
  data: CrossDomainInsights | null;
}

export function CrossDomainInsightsPanel({ data }: CrossDomainInsightsPanelProps) {
  if (!data) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Cross-Domain Overview</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cross-domain insights will appear as metric history accumulates.
        </p>
      </section>
    );
  }

  const sections: AnalyticsSectionId[] = ["website-traffic", "social-media", "finance", "sales-pipeline"];

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Cross-Domain Overview</h2>
        <p className="mt-1 text-xs text-muted-foreground">{data.narrative}</p>
      </div>

      {/* Overall Health Bar */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section Health</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {sections.map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background p-2.5">
              <StatusDot status={data.overallHealth[s]} />
              <span className="text-xs font-medium text-foreground">{SECTION_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Risks */}
      {data.topRisks.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Risks</h3>
          <div className="space-y-2">
            {data.topRisks.map((risk, i) => (
              <div key={i} className="rounded-lg border border-border/70 bg-background p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      risk.severity === "critical" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600"
                    }`}
                  >
                    {risk.severity.toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-foreground">{risk.title}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Affects: {risk.sections.map((s) => SECTION_LABELS[s]).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notable Correlations */}
      {data.correlations.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notable Correlations
          </h3>
          <div className="space-y-1">
            {data.correlations.slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2">
                <span className="text-xs text-foreground">{c.interpretation}</span>
                <span
                  className={`text-[11px] font-medium ${
                    c.correlation > 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  r={c.correlation.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
