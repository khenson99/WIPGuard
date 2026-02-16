export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCredentials } from "@/lib/analytics/credentials";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  ANALYTICS_SUB_SECTIONS,
  type AnalyticsSubSection,
} from "@/lib/analytics/section-registry";

type SectionStatus = "connected" | "partial" | "missing";

function aggregateStatus(statuses: SectionStatus[]): SectionStatus {
  if (statuses.every((status) => status === "connected")) return "connected";
  if (statuses.some((status) => status === "connected" || status === "partial")) return "partial";
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

    const [creds, tasksByStatus, overdueTasks, activeProjects, contributors] = await Promise.all([
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
    ]);

    const totalTasks = tasksByStatus.reduce((sum, item) => sum + item._count.status, 0);
    const activeContributors = contributors.filter((entry) => Boolean(entry.changedBy)).length;

    const domainConnected: Record<AnalyticsSubSection["dataDomain"], boolean> = {
      hubspot: Boolean(creds.hubspotToken),
      stripe: Boolean(creds.stripeKey),
      mercury: Boolean(creds.mercuryKey),
      googleWorkspace: Boolean(creds.googleWorkspaceAccessToken),
      slack: Boolean(creds.slackAccessToken),
      googleAnalytics: Boolean(creds.gaPropertyId && creds.gaClientEmail && creds.gaPrivateKey),
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
      semrush: Boolean(creds.semrushApiToken),
      pylon: Boolean(creds.pylonApiKey),
      product: true,
      decisionDashboard: true,
      flowMetrics: true,
      flowRisk: true,
      observability: true,
    };

    const primarySections = ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
      const children = ANALYTICS_SUB_SECTIONS.filter((child) => child.parentId === primary.id).map((child) => {
        const status: SectionStatus = domainConnected[child.dataDomain] ? "connected" : "missing";
        return {
          id: child.id,
          label: child.label,
          href: child.path,
          status,
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

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("GET /api/analytics/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics summary" }, { status: 500 });
  }
}
