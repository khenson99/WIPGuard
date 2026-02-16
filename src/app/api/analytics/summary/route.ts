export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCredentials } from "@/lib/analytics/credentials";
import { computeDecisionDashboard } from "@/lib/analytics/decision-dashboard";
import { computeFlowAnalytics } from "@/lib/flow/analytics";
import { computeFlowRiskIntelligence } from "@/lib/flow/risk-intelligence";
import { prisma } from "@/lib/prisma";
import { getOutboxOperationalMetrics } from "@/lib/outbox-worker";
import { evaluateObservabilitySlos } from "@/lib/observability/slo";
import { ANALYTICS_SECTION_REGISTRY } from "@/lib/analytics/section-registry";

interface SectionSummary {
  id: string;
  label: string;
  kind: "aggregate" | "source" | "ops";
  status: "connected" | "partial" | "missing";
  lastUpdatedAt: string | null;
  href: string;
  note?: string;
}

function bool(value: unknown): boolean {
  return Boolean(value && (typeof value !== "string" || value.trim().length > 0));
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const userId = session.user.id;
    const creds = await getCredentials(userId);

    const tasksByStatus = await prisma.task.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    const totalTasks = tasksByStatus.reduce((sum, item) => sum + item._count.status, 0);
    const overdueTasks = await prisma.task.count({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
    });

    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);

    const [flowMetrics, flowRisk, decision, outboxMetrics, connections, rules] =
      await Promise.all([
        computeFlowAnalytics({ from: defaultFrom, to: now, interval: "week" }),
        computeFlowRiskIntelligence({ config: {} }),
        computeDecisionDashboard({ config: {} }),
        getOutboxOperationalMetrics(prisma),
        prisma.integrationConnection.findMany({
          select: {
            provider: true,
            status: true,
            lastSyncedAt: true,
            lastError: true,
          },
        }),
        prisma.integrationRule.findMany({
          where: { enabled: true },
          select: {
            provider: true,
            enabled: true,
            lastRunAt: true,
            lastError: true,
          },
        }),
      ]);

    const observability = evaluateObservabilitySlos({
      outboxMetrics,
      connections: connections.map((connection) => ({
        provider: connection.provider,
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
        lastError: connection.lastError,
      })),
      rules: rules.map((rule) => ({
        provider: rule.provider,
        enabled: rule.enabled,
        lastRunAt: rule.lastRunAt?.toISOString() ?? null,
        lastError: rule.lastError,
      })),
      now,
    });

    const flowRiskAlertCount =
      flowRisk.fixedDateAlerts.length +
      flowRisk.staleDependencyChains.length +
      flowRisk.chronicBlockers.length;

    const sectionStatusById: Record<string, SectionSummary["status"]> = {
      overview: "connected",
      sales: bool(creds.hubspotToken) ? "connected" : "missing",
      finance: bool(creds.stripeKey) || bool(creds.mercuryKey) ? "connected" : "missing",
      marketing:
        bool(creds.gaPropertyId && creds.gaClientEmail && creds.gaPrivateKey) ||
        bool(
          creds.googleAdsDevToken &&
            creds.googleAdsCustomerId &&
            creds.googleAdsRefreshToken &&
            creds.googleAdsClientId &&
            creds.googleAdsClientSecret
        ) ||
        bool(creds.metaAccessToken && (creds.metaAdAccountId || creds.metaPageId)) ||
        bool(
          creds.redditClientId &&
            creds.redditClientSecret &&
            creds.redditRefreshToken &&
            creds.redditAdAccountId
        )
          ? "connected"
          : "missing",
      tasks: "connected",
      hubspot: bool(creds.hubspotToken) ? "connected" : "missing",
      stripe: bool(creds.stripeKey) ? "connected" : "missing",
      mercury: bool(creds.mercuryKey) ? "connected" : "missing",
      "google-analytics": bool(creds.gaPropertyId && creds.gaClientEmail && creds.gaPrivateKey)
        ? "connected"
        : "missing",
      "google-ads": bool(
        creds.googleAdsDevToken &&
          creds.googleAdsCustomerId &&
          creds.googleAdsRefreshToken &&
          creds.googleAdsClientId &&
          creds.googleAdsClientSecret
      )
        ? "connected"
        : "missing",
      "meta-ads": bool(creds.metaAccessToken && creds.metaAdAccountId) ? "connected" : "missing",
      "meta-page": bool(creds.metaAccessToken && creds.metaPageId) ? "connected" : "missing",
      "reddit-ads": bool(
        creds.redditClientId &&
          creds.redditClientSecret &&
          creds.redditRefreshToken &&
          creds.redditAdAccountId
      )
        ? "connected"
        : "missing",
      webflow: bool(creds.webflowApiToken && creds.webflowSiteId) ? "connected" : "missing",
      coda: bool(creds.codaApiToken && creds.codaDocId) ? "connected" : "missing",
      semrush: bool(creds.semrushApiToken) ? "connected" : "missing",
      "decision-dashboard": "connected",
      "flow-metrics": "connected",
      "flow-risk": flowRiskAlertCount > 0 ? "partial" : "connected",
      observability: observability.slos.some((slo) => slo.breached) ? "partial" : "connected",
    };

    const sectionLastUpdatedById: Record<string, string | null> = {
      "decision-dashboard": decision.generatedAt,
      "flow-metrics": flowMetrics.generatedAt,
      "flow-risk": flowRisk.generatedAt,
    };

    const sectionNoteById: Record<string, string | undefined> = {
      tasks: `${totalTasks} total tasks, ${overdueTasks} overdue`,
      "flow-risk": `${flowRiskAlertCount} active alerts`,
    };

    const sections: SectionSummary[] = ANALYTICS_SECTION_REGISTRY.map((section) => ({
      id: section.id,
      label: section.label,
      kind: section.kind,
      status: sectionStatusById[section.id] ?? "missing",
      lastUpdatedAt: sectionLastUpdatedById[section.id] ?? now.toISOString(),
      href: section.path,
      note: sectionNoteById[section.id],
    }));

    return NextResponse.json({
      generatedAt: now.toISOString(),
      highlights: {
        totalTasks,
        overdueTasks,
        flowLeadTimeP50:
          flowMetrics.leadTime.p50 === null
            ? null
            : Math.round(flowMetrics.leadTime.p50 * 24 * 100) / 100,
        activeFlowAlerts: flowRiskAlertCount,
        reliabilityScore: decision.northStar.flowReliabilityScore,
      },
      sections,
    });
  } catch (error) {
    console.error("GET /api/analytics/summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics summary" },
      { status: 500 }
    );
  }
}
