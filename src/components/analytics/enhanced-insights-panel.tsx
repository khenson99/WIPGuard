"use client";

import { useCallback, useState } from "react";
import type {
  AnalyticsSectionId,
  DiscussionQuestion,
  EnhancedRecommendation,
  EnhancedSectionInsights,
  HealthCheck,
  MetricAnomaly,
  MetricForecast,
  ScenarioPlan,
} from "@/lib/analytics/types";
import { Sparkline } from "@/components/analytics/sparkline";

// ── Feedback hook ──

function useFeedback() {
  const [sent, setSent] = useState<Set<string>>(new Set());

  const submit = useCallback(async (insightId: string, action: "USEFUL" | "NOT_USEFUL") => {
    if (sent.has(insightId)) return;
    setSent((prev) => new Set(prev).add(insightId));
    try {
      await fetch("/api/analytics/insights/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightId, action }),
      });
    } catch {
      // non-critical
    }
  }, [sent]);

  return { sent, submit };
}

// ── Sub-components ──

function SeverityBadge({ severity }: { severity: "critical" | "warning" }) {
  const cls = severity === "critical" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{severity.toUpperCase()}</span>;
}

function StatusDot({ status }: { status: "green" | "yellow" | "red" }) {
  const cls = status === "red" ? "bg-red-500" : status === "yellow" ? "bg-amber-500" : "bg-emerald-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "P0" ? "bg-red-500/15 text-red-500" :
    priority === "P1" ? "bg-amber-500/15 text-amber-600" :
    "bg-blue-500/15 text-blue-500";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{priority}</span>;
}

function FeedbackButtons({
  id,
  sent,
  onSubmit,
}: {
  id: string;
  sent: Set<string>;
  onSubmit: (id: string, action: "USEFUL" | "NOT_USEFUL") => void;
}) {
  if (sent.has(id)) {
    return <span className="text-[11px] text-muted-foreground">Thanks!</span>;
  }
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onSubmit(id, "USEFUL")}
        className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600"
        title="Useful"
      >
        +1
      </button>
      <button
        type="button"
        onClick={() => onSubmit(id, "NOT_USEFUL")}
        className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
        title="Not useful"
      >
        -1
      </button>
    </div>
  );
}

// ── Section: Narrative ──

function NarrativeBlock({ headline, body }: { headline: string; body: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <p className="text-sm font-semibold text-foreground">{headline}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

// ── Section: Health Checks ──

function HealthGrid({ checks }: { checks: HealthCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Health Checks</h3>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {checks.map((check) => (
          <div key={check.metricKey} className="rounded-lg border border-border/70 bg-background p-2.5">
            <div className="flex items-center gap-1.5">
              <StatusDot status={check.status} />
              <span className="text-xs font-medium text-foreground">{check.label}</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {typeof check.currentValue === "number" ? check.currentValue.toFixed(1) : check.currentValue}
            </p>
            {check.forecastWarning && (
              <p className="mt-0.5 text-[11px] text-amber-600">Forecast: approaching threshold</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Anomalies ──

function AnomalyCards({
  anomalies,
  feedback,
}: {
  anomalies: MetricAnomaly[];
  feedback: ReturnType<typeof useFeedback>;
}) {
  if (anomalies.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anomalies</h3>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {anomalies.map((a) => (
          <article key={a.metricKey} className="rounded-lg border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={a.severity} />
                <span className="text-sm font-medium text-foreground">{a.label}</span>
              </div>
              <FeedbackButtons id={`anom-${a.metricKey}`} sent={feedback.sent} onSubmit={feedback.submit} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Sparkline
                data={a.history}
                anomalyIndices={[a.history.length - 1]}
                className="shrink-0"
              />
              <div className="text-xs text-muted-foreground">
                <p>Current: <span className="font-medium text-foreground">{a.currentValue.toFixed(2)}</span></p>
                <p>Expected: {a.expectedValue.toFixed(2)} (z={a.zScore.toFixed(1)})</p>
              </div>
            </div>
            {a.possibleCauses.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {a.possibleCauses.slice(0, 2).map((cause) => (
                  <p key={cause} className="text-[11px] text-muted-foreground">- {cause}</p>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

// ── Section: Forecasts ──

function ForecastCards({ forecasts }: { forecasts: MetricForecast[] }) {
  if (forecasts.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forecasts</h3>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {forecasts.slice(0, 6).map((fc) => {
          const forecastValues = fc.forecast30d.map((p) => p.value);
          const trendIcon = fc.trendDirection === "up" ? "\u2191" : fc.trendDirection === "down" ? "\u2193" : "\u2192";
          return (
            <div key={fc.metricKey} className="rounded-lg border border-border/70 bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{fc.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  Conf. {(fc.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Sparkline data={fc.history} forecast={forecastValues.slice(0, 7)} className="shrink-0" />
                <div className="text-xs">
                  <p className="text-foreground">
                    {trendIcon} {fc.currentValue.toFixed(1)}
                  </p>
                  <p className="text-muted-foreground">
                    30d: {forecastValues[forecastValues.length - 1]?.toFixed(1) ?? "n/a"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section: Recommendations ──

function RecommendationCards({
  recommendations,
  feedback,
}: {
  recommendations: EnhancedRecommendation[];
  feedback: ReturnType<typeof useFeedback>;
}) {
  if (recommendations.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</h3>
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <article key={rec.id} className="rounded-lg border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={rec.priority} />
                <span className="text-sm font-medium text-foreground">{rec.title}</span>
              </div>
              <FeedbackButtons id={rec.id} sent={feedback.sent} onSubmit={feedback.submit} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rec.description}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
              <span className="text-foreground">{rec.expectedImpact}</span>
              <span className="text-muted-foreground">Effort: {rec.effort}</span>
              <span className="text-muted-foreground">{rec.projectedDelta}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ── Section: Discussion Questions ──

function QuestionsBlock({ questions }: { questions: DiscussionQuestion[] }) {
  if (questions.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discussion Questions</h3>
      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q.id} className="rounded-lg border border-border/70 bg-background p-3">
            <p className="text-xs font-medium text-foreground">{q.question}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{q.context}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Scenarios ──

function ScenariosBlock({ scenarios }: { scenarios: ScenarioPlan[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (scenarios.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenario Planning</h3>
      <div className="space-y-2">
        {scenarios.map((s) => (
          <div key={s.id} className="rounded-lg border border-border/70 bg-background">
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <span className="text-xs font-medium text-foreground">{s.title}</span>
              <span className="text-[11px] text-muted-foreground">{expandedId === s.id ? "−" : "+"}</span>
            </button>
            {expandedId === s.id && (
              <div className="border-t border-border/50 px-3 pb-3 pt-2">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="pb-1 text-left font-medium">Metric</th>
                      <th className="pb-1 text-right font-medium">Current</th>
                      <th className="pb-1 text-right font-medium">Best</th>
                      <th className="pb-1 text-right font-medium">Expected</th>
                      <th className="pb-1 text-right font-medium">Worst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.expected.map((exp, i) => (
                      <tr key={exp.metricKey} className="text-foreground">
                        <td className="py-0.5 text-left">{exp.label}</td>
                        <td className="py-0.5 text-right">{exp.current.toFixed(1)}</td>
                        <td className="py-0.5 text-right text-emerald-600">{s.best[i]?.projected.toFixed(1)}</td>
                        <td className="py-0.5 text-right">{exp.projected.toFixed(1)}</td>
                        <td className="py-0.5 text-right text-red-500">{s.worst[i]?.projected.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──

interface EnhancedInsightsPanelProps {
  section: AnalyticsSectionId;
  insights: EnhancedSectionInsights | null;
}

export function EnhancedInsightsPanel({ section, insights }: EnhancedInsightsPanelProps) {
  const feedback = useFeedback();

  if (!insights) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Enhanced Insights</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          No enhanced insights available. Insights improve as metric history accumulates.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4">
      <NarrativeBlock headline={insights.narrative.headline} body={insights.narrative.body} />
      <HealthGrid checks={insights.healthChecks} />
      <AnomalyCards anomalies={insights.anomalies} feedback={feedback} />
      <ForecastCards forecasts={insights.forecasts} />
      <RecommendationCards recommendations={insights.recommendations} feedback={feedback} />
      <QuestionsBlock questions={insights.questions} />
      <ScenariosBlock scenarios={insights.scenarios} />
    </section>
  );
}
