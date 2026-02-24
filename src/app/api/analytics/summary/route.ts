export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCredentials } from "@/lib/analytics/credentials";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  ANALYTICS_SUB_SECTIONS,
  type AnalyticsSubSection,
} from "@/lib/analytics/section-registry";
import {
  deriveDomainSectionStatus,
  type SectionStatus,
} from "@/lib/analytics/summary-health";
import { buildSummaryChildDiagnostics } from "@/lib/analytics/route-meta";

function aggregateStatus(statuses: SectionStatus[]): SectionStatus {
  if (statuses.every((status) => status === "connected")) return "connected";
  if (statuses.some((status) => status === "degraded")) return "degraded";
  if (statuses.some((status) => status === "connected")) return "partial";
  return "missing";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = parseAnalyticsTimeRange(request.nextUrl.searchParams);
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T23:59:59.999Z`);

    const [creds, tasksByStatus, overdueTasks, activeProjects, contributors, latestSnapshots] = await Promise.all([
      getCredentials(session.user.id),
      prisma.task.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.task.count({
        where: {
          status: { not: "DONE" },
          dueDate: { lt: to },
        },
      }),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.statusHistory.findMany({
        where: {
          changedAt: { gte: from, lte: to },
          changedBy: { not: null },
        },
        distinct: ["changedBy"],
        select: { changedBy: true },
      }),
      prisma.analyticsSnapshot.findMany({
        where: {
          userId: session.user.id,
          rangePreset: range.preset,
          toDate: to,
          providerKey: {
            in: [
              "hubspot",
              "stripe",
              "mercury",
              "googleAnalytics",
              "googleAds",
              "metaAds",
              "metaPage",
              "redditAds",
              "webflow",
              "coda",
              "semrush",
              "pylon",
              "googleWorkspace",
              "slack",
            ],
          },
        },
        select: {
          providerKey: true,
          status: true,
          expiresAt: true,
          capturedAt: true,
          lastError: true,
        },
        orderBy: [{ capturedAt: "desc" }],
      }),
    ]);

    const totalTasks = tasksByStatus.reduce((sum, item) => sum + item._count.status, 0);
    const activeContributors = contributors.filter((entry) => Boolean(entry.changedBy)).length;
    const now = Date.now();

    const latestSnapshotByProvider = new Map<
      string,
      {
        status: AnalyticsSnapshotStatus;
        stale: boolean;
        capturedAt: string;
        lastError: string | null;
      }
    >();

    for (const snapshot of latestSnapshots) {
      if (latestSnapshotByProvider.has(snapshot.providerKey)) continue;
      latestSnapshotByProvider.set(snapshot.providerKey, {
        status: snapshot.status,
        stale: snapshot.expiresAt.getTime() < now,
        capturedAt: snapshot.capturedAt.toISOString(),
        lastError: snapshot.lastError,
      });
    }

    const domainConnected: Record<AnalyticsSubSection["dataDomain"], boolean> = {
      hubspot: Boolean(creds.hubspotToken),
      stripe: Boolean(creds.stripeKey),
      mercury: Boolean(creds.mercuryKey),
      googleWorkspace: Boolean(creds.googleWorkspaceAccessToken),
      slack: Boolean(creds.slackAccessToken),
      googleAnalytics: Boolean(
        creds.gaPropertyId &&
          ((creds.gaClientEmail && creds.gaPrivateKey) ||
            (process.env.GA_REFRESH_TOKEN &&
              process.env.GOOGLE_CLIENT_ID &&
              process.env.GOOGLE_CLIENT_SECRET))
      ),
      googleAds: Boolean(
        creds.googleAdsDevToken &&
          creds.googleAdsCustomerId &&
          creds.googleAdsRefreshToken &&
          creds.googleAdsClientId &&
          creds.googleAdsClientSecret
      ),
      metaAds: Boolean(creds.metaAccessToken && creds.metaAdAccountId),
      metaPage: Boolean(creds.metaAccessToken && creds.metaPageId),
      redditAds: Boolean(
        creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId
      ),
      webflow: Boolean(creds.webflowApiToken && creds.webflowSiteId),
      coda: Boolean(creds.codaApiToken && creds.codaDocId),
      semrush: Boolean(creds.semrushApiToken && creds.semrushDomain),
      pylon: Boolean(creds.pylonApiKey),
      financePlanning: Boolean(creds.stripeKey || creds.mercuryKey),
      financeForecast: Boolean(creds.stripeKey || creds.mercuryKey),
      financePnl: Boolean(creds.stripeKey || creds.mercuryKey),
      financeUnitEconomics: Boolean(creds.stripeKey),
      product: true,
      decisionDashboard: true,
      flowMetrics: true,
      flowRisk: true,
      observability: true,
      customerJourney: true,
      demoAnalytics: true,
      processAnalytics: true,
    };

    const domainSnapshotKey: Partial<Record<AnalyticsSubSection["dataDomain"], string>> = {
      hubspot: "hubspot",
      stripe: "stripe",
      mercury: "mercury",
      googleWorkspace: "googleWorkspace",
      slack: "slack",
      googleAnalytics: "googleAnalytics",
      googleAds: "googleAds",
      metaAds: "metaAds",
      metaPage: "metaPage",
      redditAds: "redditAds",
      webflow: "webflow",
      coda: "coda",
      semrush: "semrush",
      pylon: "pylon",
    };

    const primarySections = ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
      const children = ANALYTICS_SUB_SECTIONS.filter((child) => child.parentId === primary.id).map((child) => {
        const configured = domainConnected[child.dataDomain];
        const snapshotKey = domainSnapshotKey[child.dataDomain];
        const latestSnapshot = snapshotKey ? latestSnapshotByProvider.get(snapshotKey) : null;
        const status = deriveDomainSectionStatus({
          configured,
          requiresSnapshot: Boolean(snapshotKey),
          snapshotStatus:
            latestSnapshot?.status === AnalyticsSnapshotStatus.SUCCESS
              ? "SUCCESS"
              : latestSnapshot?.status === AnalyticsSnapshotStatus.ERROR
                ? "ERROR"
                : null,
          snapshotStale: latestSnapshot?.stale ?? false,
        });
        return {
          id: child.id,
          label: child.label,
          href: child.path,
          status,
          ...buildSummaryChildDiagnostics({
            snapshotStatus:
              latestSnapshot?.status === AnalyticsSnapshotStatus.SUCCESS
                ? "SUCCESS"
                : latestSnapshot?.status === AnalyticsSnapshotStatus.ERROR
                  ? "ERROR"
                  : null,
            capturedAt: latestSnapshot?.capturedAt ?? null,
            lastError: latestSnapshot?.lastError ?? null,
          }),
        };
      });

      const status = aggregateStatus(children.map((child) => child.status));
      return {
        id: primary.id,
        label: primary.label,
        description: primary.description,
        href: primary.path,
        status,
        integrationCount: children.length,
        connectedCount: children.filter((child) => child.status === "connected").length,
        children,
      };
    });

    const connectedPrimary = primarySections.filter((section) => section.status !== "missing").length;
    const disciplineCoverage = Math.round((connectedPrimary / primarySections.length) * 100);
    const isPartial = primarySections.some((section) => section.status === "degraded" || section.status === "partial");

    return NextResponse.json(
      {
        meta: {
          servedAt: new Date().toISOString(),
          isPartial,
        },
        generatedAt: new Date().toISOString(),
        timeRange: range,
        highlights: {
          totalTasks,
          overdueTasks,
          activeProjects,
          activeContributors,
          disciplineCoverage,
        },
        primarySections,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/analytics/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics summary" }, { status: 500 });
  }
}
