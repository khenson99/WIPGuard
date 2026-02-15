"use client";

import { useState } from "react";
import {
  CheckCircle, Circle, Target, AlertTriangle,
  Users, Shield, Database, Zap, TrendingUp,
} from "lucide-react";
import type { AnalyticsDashboardData, ActionItem } from "@/lib/analytics/types";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// Default action plan based on common bottlenecks
function generateActionPlan(data: AnalyticsDashboardData): ActionItem[] {
  const funnel = data.hubspot?.funnel;
  const items: ActionItem[] = [];
  let id = 1;

  // Week 1: Demo No-Shows
  if (!funnel || funnel.noShowRate > 10) {
    items.push(
      { id: `a${id++}`, title: "Implement SMS reminders (24h + 1h before demo)", stream: "demo-noshows", week: 1, owner: "Sales", priority: "critical", completed: false, description: "Set up automated SMS via HubSpot workflows for demo confirmations" },
      { id: `a${id++}`, title: "Reduce booking window to 48 hours max", stream: "demo-noshows", week: 1, owner: "Sales", priority: "critical", completed: false, description: "Shorter lead time = higher show rates" },
      { id: `a${id++}`, title: "Add calendar holds + Zoom link in booking confirmation", stream: "demo-noshows", week: 1, owner: "Ops", priority: "high", completed: false },
    );
  }

  // Week 1-2: Pipeline Leaks
  if (!funnel || funnel.unlikely > 20) {
    items.push(
      { id: `a${id++}`, title: "Audit all 'Unlikely' deals — archive or re-engage", stream: "pipeline-leaks", week: 1, owner: "Sales", priority: "critical", completed: false, description: "Review each deal; set 7-day deadline for response or close" },
      { id: `a${id++}`, title: "Build re-engagement email sequence for stale deals", stream: "pipeline-leaks", week: 2, owner: "Marketing", priority: "high", completed: false },
      { id: `a${id++}`, title: "Define qualification criteria (BANT/MEDDIC)", stream: "pipeline-leaks", week: 2, owner: "Sales", priority: "high", completed: false },
    );
  }

  // Week 2-3: Churn & Retention
  if (!funnel || funnel.churn > 5) {
    items.push(
      { id: `a${id++}`, title: "Implement 30/60/90 day customer check-in cadence", stream: "churn-retention", week: 2, owner: "CS", priority: "critical", completed: false },
      { id: `a${id++}`, title: "Build health score dashboard for at-risk accounts", stream: "churn-retention", week: 3, owner: "Ops", priority: "high", completed: false },
      { id: `a${id++}`, title: "Create churn prevention playbook with save offers", stream: "churn-retention", week: 3, owner: "CS", priority: "medium", completed: false },
    );
  }

  // Week 3-4: Process & Data
  items.push(
    { id: `a${id++}`, title: "Clean HubSpot pipeline — standardize stages & properties", stream: "process-data", week: 3, owner: "Ops", priority: "high", completed: false },
    { id: `a${id++}`, title: "Set up automated weekly pipeline report", stream: "process-data", week: 4, owner: "Ops", priority: "medium", completed: false },
    { id: `a${id++}`, title: "Define and document sales SLAs (response time, follow-up)", stream: "process-data", week: 4, owner: "Sales", priority: "medium", completed: false },
  );

  return items;
}

function calculateProjectedImpact(data: AnalyticsDashboardData) {
  const funnel = data.hubspot?.funnel;
  if (!funnel) return null;

  const noShowReduction = Math.round(funnel.noShows * 0.5); // 50% reduction target
  const additionalDemos = noShowReduction;
  const additionalClosedDeals = Math.round(additionalDemos * (funnel.winRate / 100) * 0.6);
  const unlikelyWins = Math.round(funnel.unlikely * 0.15); // 15% re-engagement
  const churnReduction = Math.round(funnel.churn * 0.3); // 30% save rate
  const totalRevenueImpact =
    (additionalClosedDeals + unlikelyWins) * funnel.avgDealSize +
    churnReduction * funnel.avgDealSize * 0.5;

  return {
    additionalDemos,
    additionalClosedDeals,
    unlikelyWins,
    churnReduction,
    totalRevenueImpact,
  };
}

const STREAM_CONFIG = {
  "demo-noshows": { label: "Demo No-Shows", icon: AlertTriangle, color: "#fbbf24" },
  "pipeline-leaks": { label: "Pipeline Leaks", icon: Target, color: "#fc5a29" },
  "churn-retention": { label: "Churn & Retention", icon: Shield, color: "#ef4444" },
  "process-data": { label: "Process & Data", icon: Database, color: "#4379f0" },
} as const;

export function ActionPlanTab({ data }: { data: AnalyticsDashboardData | null }) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);

  if (!data) return <EmptyState />;

  const actionItems = generateActionPlan(data);
  const impact = calculateProjectedImpact(data);

  const toggleItem = (id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredItems = activeWeek
    ? actionItems.filter((i) => i.week === activeWeek)
    : actionItems;

  const completedCount = actionItems.filter((i) => completedIds.has(i.id)).length;
  const progressPct = actionItems.length > 0 ? (completedCount / actionItems.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">4-Week Improvement Sprint</h3>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {actionItems.length} tasks complete
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-primary">{progressPct.toFixed(0)}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Projected Impact */}
      {impact && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <ImpactCard
            label="Additional Demos"
            value={`+${impact.additionalDemos}`}
            icon={<Users className="h-4 w-4 text-yellow-500" />}
          />
          <ImpactCard
            label="Additional Closes"
            value={`+${impact.additionalClosedDeals}`}
            icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
          />
          <ImpactCard
            label="Unlikely Wins"
            value={`+${impact.unlikelyWins}`}
            icon={<Zap className="h-4 w-4 text-primary" />}
          />
          <ImpactCard
            label="Churn Saved"
            value={`+${impact.churnReduction}`}
            icon={<Shield className="h-4 w-4 text-blue-500" />}
          />
          <ImpactCard
            label="Revenue Impact"
            value={fmt$(impact.totalRevenueImpact)}
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
            highlight
          />
        </div>
      )}

      {/* Week Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveWeek(null)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            activeWeek === null
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All Weeks
        </button>
        {[1, 2, 3, 4].map((w) => (
          <button
            key={w}
            onClick={() => setActiveWeek(w)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeWeek === w
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Week {w}
          </button>
        ))}
      </div>

      {/* Action Items by Stream */}
      {(Object.keys(STREAM_CONFIG) as Array<keyof typeof STREAM_CONFIG>).map((stream) => {
        const items = filteredItems.filter((i) => i.stream === stream);
        if (items.length === 0) return null;

        const config = STREAM_CONFIG[stream];
        const StreamIcon = config.icon;

        return (
          <div key={stream} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${config.color}15` }}
              >
                <StreamIcon className="h-4 w-4" style={{ color: config.color }} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {items.filter((i) => completedIds.has(i.id)).length}/{items.length}
              </span>
            </div>
            <div className="space-y-1">
              {items.map((item) => {
                const isComplete = completedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                  >
                    {isComplete ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm ${isComplete ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={item.priority} />
                      <span className="text-[10px] text-muted-foreground">W{item.week}</span>
                      <span className="text-[10px] text-muted-foreground">{item.owner}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImpactCard({
  label, value, icon, highlight,
}: {
  label: string; value: string; icon: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <div className="mb-1 flex items-center gap-1.5">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className={`text-lg font-bold tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = {
    critical: "bg-red-500/10 text-red-500",
    high: "bg-yellow-500/10 text-yellow-500",
    medium: "bg-blue-500/10 text-blue-500",
  }[priority] || "bg-secondary text-muted-foreground";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${config}`}>
      {priority}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No data to generate action plan</p>
        <p className="text-xs text-muted-foreground">Connect your data sources to see recommendations</p>
      </div>
    </div>
  );
}
