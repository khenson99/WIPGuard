export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCredentials } from "@/lib/analytics/credentials";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { getAuthenticatedUser } from "@/lib/session-user";
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
import { HARD_STALE_GRACE_MS } from "@/lib/analytics/snapshots";
import { snapshotKeyQueryVariants } from "@/lib/integrations/provider-registry";

function aggregateStatus(statuses: SectionStatus[]): SectionStatus {
  if (statuses.every((status) => status === "connected")) return "connected";
  if (statuses.some((status) => status === "degraded")) return "degraded";
  if (statuses.some((status) => status === "connected")) return "partial";
  return "missing";
}

const DOMAIN_SNAPSHOT_KEYS: Partial<Record<AnalyticsSubSection["dataDomain"], string[]>> = {
  hubspot: snapshotKeyQueryVariants(["hubspot"]),
  salesPerformance: snapshotKeyQueryVariants(["salesPerformance"]),
  stripe: snapshotKeyQueryVariants(["stripe"]),
  mercury: snapshotKeyQueryVariants(["mercury"]),
  googleWorkspace: snapshotKeyQueryVariants(["googleWorkspace"]),
  slack: snapshotKeyQueryVariants(["slack"]),
  googleAnalytics: snapshotKeyQueryVariants(["googleAnalytics"]),
  googleAds: snapshotKeyQueryVariants(["googleAds"]),
  metaAds: snapshotKeyQueryVariants(["metaAds"]),
  metaPage: snapshotKeyQueryVariants(["metaPage"]),
  redditAds: snapshotKeyQueryVariants(["redditAds"]),
  webflow: snapshotKeyQueryVariants(["webflow"]),
  coda: snapshotKeyQueryVariants(["coda"]),
  semrush: snapshotKeyQueryVariants(["semrush"]),
  pylon: snapshotKeyQueryVariants(["pylon"]),
};

const SUMMARY_SNAPSHOT_KEYS = [
  ...new Set(Object.values(DOMAIN_SNAPSHOT_KEYS).flatMap((snapshotKeys) => snapshotKeys ?? [])),
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = parseAnalyticsTimeRange(request.nextUrl.searchParams);
    const to = new Date(`${range.to}T23:59:59.999Z`);
    const integrationOwnerUserId = resolveIntegrationOwnerUserId(user.id);
    const now = Date.now();
    const nowDate = new Date(now);

    const [creds, latestSnapshots] = await Promise.all([
      getCredentials(integrationOwnerUserId),
      prisma.analyticsSnapshot.findMany({
        where: {
          userId: integrationOwnerUserId,
          rangePreset: range.preset,
          toDate: to,
          capturedAt: { lte: nowDate },
          providerKey: {
            in: SUMMARY_SNAPSHOT_KEYS,
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
    const [retentionTenantCount, latestRetentionRun, retentionArdaGroups, retentionArdaTenantRecords] = await Promise.all([
      user.organizationId
        ? prisma.retentionTenantCurrent.count({
            where: { organizationId: user.organizationId },
          })
        : Promise.resolve(0),
      user.organizationId
        ? prisma.retentionSyncRun.findFirst({
            where: { organizationId: user.organizationId },
            orderBy: [{ startedAt: "desc" }],
            select: {
              startedAt: true,
              lastError: true,
              status: true,
            },
          })
        : Promise.resolve(null),
      user.organizationId
        ? prisma.retentionSourceRecord.groupBy({
            by: ["objectType"],
            where: {
              organizationId: user.organizationId,
              source: "ARDA",
            },
            _count: {
              _all: true,
            },
          })
        : Promise.resolve([]),
      user.organizationId
        ? prisma.retentionSourceRecord.findMany({
            where: {
              organizationId: user.organizationId,
              source: "ARDA",
              objectType: "tenant",
            },
            select: {
              payload: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const retentionArdaCounts = new Map(
      retentionArdaGroups.map((group) => [group.objectType, group._count._all])
    );
    const retentionArdaActivityRecords =
      (retentionArdaCounts.get("order") ?? 0) +
      (retentionArdaCounts.get("card") ?? 0) +
      (retentionArdaCounts.get("item") ?? 0);
    const retentionArdaFallbackTenants = retentionArdaTenantRecords.reduce((count, record) => {
      const payload =
        record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
          ? (record.payload as Record<string, unknown>)
          : {};
      const cards = typeof payload.userDetailsCardCount === "number" ? payload.userDetailsCardCount : 0;
      const items = typeof payload.userDetailsItemCount === "number" ? payload.userDetailsItemCount : 0;
      const orders = typeof payload.userDetailsOrderCount === "number" ? payload.userDetailsOrderCount : 0;
      return cards > 0 || items > 0 || orders > 0 ? count + 1 : count;
    }, 0);
    const retentionFallbackOnly =
      retentionTenantCount > 0 &&
      (retentionArdaCounts.get("tenant") ?? 0) > 0 &&
      retentionArdaActivityRecords === 0 &&
      retentionArdaFallbackTenants > 0;

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
      if (snapshot.capturedAt.getTime() > now) continue;
      if (latestSnapshotByProvider.has(snapshot.providerKey)) continue;
      latestSnapshotByProvider.set(snapshot.providerKey, {
        status: snapshot.status,
        stale: snapshot.expiresAt.getTime() + HARD_STALE_GRACE_MS < now,
        capturedAt: snapshot.capturedAt.toISOString(),
        lastError: snapshot.lastError,
      });
    }

    function latestSnapshotForKeys(snapshotKeys: string[] | undefined) {
      if (!snapshotKeys) return null;
      return snapshotKeys
        .map((snapshotKey) => latestSnapshotByProvider.get(snapshotKey) ?? null)
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
        .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0] ?? null;
    }

    const domainConnected: Record<AnalyticsSubSection["dataDomain"], boolean> = {
      hubspot: Boolean(creds.hubspotToken),
      salesPerformance: Boolean(creds.hubspotToken),
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
      metaAds: Boolean(creds.metaAdsAccessToken && creds.metaAdAccountId),
      metaPage: Boolean(creds.metaPageAccessToken && creds.metaPageId),
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
      financeMonthlyHistory: Boolean(creds.stripeKey || creds.mercuryKey),
      financeAiBrief: Boolean(creds.stripeKey || creds.mercuryKey),
      product: true,
      customerJourney: true,
      visitorFunnel: true,
      demoAnalytics: true,
      processAnalytics: true,
    };

    const primarySections = ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
      if (primary.id === "retention") {
        const latestRetentionErrored = latestRetentionRun?.status === "ERROR";
        const status: SectionStatus =
          retentionTenantCount > 0
            ? retentionFallbackOnly || latestRetentionErrored
              ? "degraded"
              : "connected"
            : latestRetentionErrored
              ? "degraded"
              : "missing";
        return {
          id: primary.id,
          label: primary.label,
          description: primary.description,
          href: primary.path,
          status,
          integrationCount: 1,
          connectedCount: retentionTenantCount > 0 ? 1 : 0,
          children: [
            {
              id: "retention",
              label: "Retention",
              href: primary.path,
              status,
              lastSnapshotAt: latestRetentionRun?.startedAt.toISOString() ?? null,
              lastError: latestRetentionRun?.status === "ERROR" ? latestRetentionRun.lastError ?? null : null,
            },
          ],
        };
      }

      const children = ANALYTICS_SUB_SECTIONS.filter((child) => child.parentId === primary.id).map((child) => {
        const configured = domainConnected[child.dataDomain];
        const snapshotKeys = DOMAIN_SNAPSHOT_KEYS[child.dataDomain];
        const latestSnapshot = latestSnapshotForKeys(snapshotKeys);
        const status = deriveDomainSectionStatus({
          configured,
          requiresSnapshot: Boolean(snapshotKeys),
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
    const degradedPrimary = primarySections.filter((section) => section.status === "degraded" || section.status === "partial").length;
    const missingPrimary = primarySections.filter((section) => section.status === "missing").length;
    const connectedIntegrations = primarySections.reduce((sum, section) => sum + section.connectedCount, 0);
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
          connectedSections: connectedPrimary,
          degradedSections: degradedPrimary,
          missingSections: missingPrimary,
          connectedIntegrations,
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
