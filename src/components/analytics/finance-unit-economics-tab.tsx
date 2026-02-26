"use client";

import { useMemo } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import {
  fmt$,
  fmtPct,
  SectionCard,
  InsightCard,
  AlertBanner,
} from "@/components/analytics/dashboard-primitives";
import { StatCard } from "@/components/analytics/stat-card";
import { RingStat } from "@/components/analytics/bar-display";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import {
  computeUnitEconomics,
  type UnitEconomicsData,
} from "@/lib/analytics/unit-economics";
import { fmtRatio, ltvCacSeverity } from "@/lib/analytics/finance-utils";

/* ── Helpers ─────────────────────────────────────────── */

function ratioColor(ratio: number): string {
  if (ratio >= 3) return "#22c55e"; // green-500
  if (ratio >= 1) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

function paybackSeverity(months: number): "success" | "warning" | "critical" {
  if (months <= 12) return "success";
  if (months <= 18) return "warning";
  return "critical";
}

function marginSeverity(pct: number): "success" | "info" | "warning" {
  if (pct >= 70) return "success";
  if (pct >= 50) return "info";
  return "warning";
}

/* ── Component ───────────────────────────────────────── */

export function FinanceUnitEconomicsTab({
  data,
}: {
  data: AnalyticsDashboardData | null;
}) {
  const ue = useMemo(
    () =>
      computeUnitEconomics(
        data?.stripe ?? null,
        data?.mercury ?? null,
        data?.hubspot ?? null,
      ),
    [data],
  );

  // Alerts
  const alerts: {
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
  }[] = [];

  if (ue.ltvCacRatio < 1) {
    alerts.push({
      severity: "critical",
      title: `LTV:CAC ratio is ${fmtRatio(ue.ltvCacRatio)} (below 1.0)`,
      description:
        "You are spending more to acquire a customer than they generate in lifetime value. Immediately review acquisition spend and focus on retention.",
    });
  }

  if (ue.paybackMonths > 18) {
    alerts.push({
      severity: "warning",
      title: `Payback period is ${ue.paybackMonths.toFixed(1)} months`,
      description:
        "A payback period over 18 months puts cash flow at risk. Look for ways to increase ARPA or reduce acquisition costs.",
    });
  }

  if (ue.grossMarginPct < 50) {
    alerts.push({
      severity: "info",
      title: `Gross margin at ${fmtPct(ue.grossMarginPct)}`,
      description:
        "Gross margin below 50% limits scalability. Consider pricing changes or reducing cost of delivery.",
    });
  }

  // Insights
  const insights = useMemo(() => {
    const items: {
      title: string;
      insight: string;
      action?: string;
      severity: "critical" | "warning" | "info" | "success";
    }[] = [];

    // LTV:CAC health
    const ltvSev = ltvCacSeverity(ue.ltvCacRatio);
    items.push({
      title: "LTV:CAC Health",
      insight:
        ue.ltvCacRatio >= 3
          ? `Ratio of ${fmtRatio(ue.ltvCacRatio)} is healthy. You recover acquisition costs efficiently.`
          : ue.ltvCacRatio >= 1
            ? `Ratio of ${fmtRatio(ue.ltvCacRatio)} is below the 3x target. Improve retention or reduce CAC.`
            : `Ratio of ${fmtRatio(ue.ltvCacRatio)} means you lose money on every customer acquired.`,
      action:
        ue.ltvCacRatio < 3
          ? "Focus on increasing retention, upselling, or reducing acquisition spend."
          : undefined,
      severity: ltvSev,
    });

    // Payback period
    const pbSev = paybackSeverity(ue.paybackMonths);
    items.push({
      title: "Payback Period",
      insight:
        ue.paybackMonths <= 12
          ? `${ue.paybackMonths.toFixed(1)} months is excellent. Cash invested in acquisition is recovered quickly.`
          : `${ue.paybackMonths.toFixed(1)} months to recover CAC. Target under 12 months for healthy cash flow.`,
      action:
        ue.paybackMonths > 12
          ? "Increase onboarding speed, raise initial plan pricing, or reduce CAC."
          : undefined,
      severity: pbSev === "critical" ? "critical" : pbSev === "warning" ? "warning" : "success",
    });

    // Gross margin
    const gmSev = marginSeverity(ue.grossMarginPct);
    items.push({
      title: "Gross Margin",
      insight:
        ue.grossMarginPct >= 70
          ? `${fmtPct(ue.grossMarginPct)} gross margin is strong for a SaaS business.`
          : `${fmtPct(ue.grossMarginPct)} gross margin is below the 70% SaaS benchmark.`,
      action:
        ue.grossMarginPct < 70
          ? "Audit hosting, support, and infrastructure costs for optimization."
          : undefined,
      severity: gmSev === "success" ? "success" : gmSev === "info" ? "info" : "warning",
    });

    // Growth efficiency
    if (ue.magicNumber !== null) {
      items.push({
        title: "Growth Efficiency",
        insight:
          ue.magicNumber >= 0.75
            ? `Magic number of ${ue.magicNumber.toFixed(2)} indicates efficient growth. Consider increasing spend.`
            : ue.magicNumber >= 0.5
              ? `Magic number of ${ue.magicNumber.toFixed(2)} is moderate. Growth spend is returning reasonable revenue.`
              : `Magic number of ${ue.magicNumber.toFixed(2)} suggests inefficient growth. Each dollar spent returns less than $0.50 in ARR.`,
        action:
          ue.magicNumber < 0.5
            ? "Re-evaluate marketing channels and focus on higher-converting funnels."
            : undefined,
        severity:
          ue.magicNumber >= 0.75
            ? "success"
            : ue.magicNumber >= 0.5
              ? "info"
              : "warning",
      });
    }

    return items;
  }, [ue]);

  // Empty state
  if (!data?.stripe) {
    return (
      <FinanceDataEmptyState
        title="Unit economics data is unavailable"
        message="Connect Stripe to calculate LTV, CAC, and other unit economics metrics."
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner
              key={i}
              severity={a.severity}
              title={a.title}
              description={a.description}
            />
          ))}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Lifetime Value"
          value={fmt$(ue.ltv)}
          subtitle="LTV"
        />
        <StatCard
          label="Acquisition Cost"
          value={fmt$(ue.cac)}
          subtitle="CAC"
        />
        <StatCard
          label="LTV:CAC"
          value={fmtRatio(ue.ltvCacRatio)}
          changeType={
            ltvCacSeverity(ue.ltvCacRatio) === "success"
              ? "positive"
              : ltvCacSeverity(ue.ltvCacRatio) === "critical"
                ? "negative"
                : "neutral"
          }
        />
      </div>

      {/* LTV:CAC Visual */}
      <SectionCard
        title="LTV:CAC Ratio"
        subtitle="Target a ratio of 3x or above for sustainable growth"
      >
        <div className="flex items-center justify-center py-4">
          <RingStat
            value={ue.ltvCacRatio}
            max={5}
            label="LTV:CAC"
            color={ratioColor(ue.ltvCacRatio)}
            size={130}
          />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {ue.ltvCacRatio >= 3
            ? "Healthy ratio -- efficient customer acquisition."
            : ue.ltvCacRatio >= 1
              ? "Below target -- room for improvement in retention or acquisition costs."
              : "Critical -- acquisition cost exceeds lifetime value."}
        </p>
      </SectionCard>

      {/* Detail Metrics Grid */}
      <SectionCard title="Detail Metrics" subtitle="Supporting unit economics indicators">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Payback Period
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {ue.paybackMonths.toFixed(1)} months
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Gross Margin
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {fmtPct(ue.grossMarginPct)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              ARPA
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {fmt$(ue.arpa)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">per month</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Magic Number
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {ue.magicNumber !== null ? ue.magicNumber.toFixed(2) : "N/A"}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Insights Grid */}
      {insights.length > 0 && (
        <SectionCard title="Unit Economics Insights" subtitle="Assessment and recommendations">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {insights.map((ins, i) => (
              <InsightCard
                key={i}
                title={ins.title}
                insight={ins.insight}
                action={ins.action}
                severity={ins.severity}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
