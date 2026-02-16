"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { OverviewTab } from "@/components/analytics/overview-tab";
import { SalesFunnelTab } from "@/components/analytics/sales-funnel-tab";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { MarketingTabNew } from "@/components/analytics/marketing-tab-new";
import { TasksTab } from "@/components/analytics/tasks-tab";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { ANALYTICS_SECTION_REGISTRY, getAnalyticsSectionById } from "@/lib/analytics/section-registry";

interface AnalyticsSectionPageProps {
  sectionId: string;
}

function GenericPayloadView({ title, payload }: { title: string; payload: unknown }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      <pre className="overflow-auto rounded-md bg-secondary p-3 text-xs text-foreground">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

export function AnalyticsSectionPage({ sectionId }: AnalyticsSectionPageProps) {
  const router = useRouter();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardData | null>(null);
  const [auxPayload, setAuxPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const section = getAnalyticsSectionById(sectionId);

  const dataKey = useMemo(() => {
    switch (sectionId) {
      case "hubspot":
        return "hubspot";
      case "stripe":
        return "stripe";
      case "mercury":
        return "mercury";
      case "google-analytics":
        return "googleAnalytics";
      case "google-ads":
        return "googleAds";
      case "meta-ads":
        return "metaAds";
      case "meta-page":
        return "metaPage";
      case "reddit-ads":
        return "redditAds";
      case "webflow":
        return "webflow";
      case "coda":
        return "coda";
      case "semrush":
        return "semrush";
      default:
        return null;
    }
  }, [sectionId]);

  useEffect(() => {
    if (!section) {
      setError("Section not found");
      setLoading(false);
      return;
    }

    const fetchSection = async () => {
      setLoading(true);
      setError(null);
      try {
        const needsAnalyticsData =
          ["overview", "sales", "finance", "marketing", "tasks"].includes(sectionId) ||
          Boolean(dataKey);

        if (needsAnalyticsData) {
          const response = await fetch("/api/analytics", { cache: "no-store" });
          const payload = (await response.json()) as AnalyticsDashboardData;
          setAnalyticsData(payload);
        }

        if (sectionId === "decision-dashboard") {
          const response = await fetch("/api/analytics/decision-dashboard", { cache: "no-store" });
          setAuxPayload(await response.json());
        } else if (sectionId === "flow-metrics") {
          const response = await fetch("/api/flow/metrics", { cache: "no-store" });
          setAuxPayload(await response.json());
        } else if (sectionId === "flow-risk") {
          const response = await fetch("/api/flow/risk", { cache: "no-store" });
          setAuxPayload(await response.json());
        } else if (sectionId === "observability") {
          const response = await fetch("/api/ops/observability", { cache: "no-store" });
          setAuxPayload(await response.json());
        } else {
          setAuxPayload(null);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load section");
      } finally {
        setLoading(false);
      }
    };

    fetchSection();
  }, [sectionId, section, dataKey]);

  if (!section) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Unknown section. <Link href="/analytics" className="text-primary">Back to analytics</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{section.label}</h1>
          <p className="text-xs text-muted-foreground">Standalone analytics section view.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.refresh()}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Refresh
          </button>
          <Link
            href="/analytics"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Back to Summary
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {ANALYTICS_SECTION_REGISTRY.map((candidate) => (
          <Link
            key={candidate.id}
            href={candidate.path}
            className={`rounded-md px-2 py-1 text-xs ${
              candidate.id === section.id
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {candidate.label}
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading section...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>
      ) : (
        <>
          {sectionId === "overview" && <OverviewTab data={analyticsData} />}
          {sectionId === "sales" && <SalesFunnelTab data={analyticsData} />}
          {sectionId === "finance" && <FinanceTab data={analyticsData} />}
          {sectionId === "marketing" && <MarketingTabNew data={analyticsData} />}
          {sectionId === "tasks" && <TasksTab data={analyticsData} />}

          {dataKey && analyticsData && (
            <GenericPayloadView
              title={`${section.label} Data`}
              payload={(analyticsData as unknown as Record<string, unknown>)[dataKey] ?? null}
            />
          )}

          {auxPayload && (
            <GenericPayloadView
              title={`${section.label} Report`}
              payload={auxPayload}
            />
          )}
        </>
      )}
    </div>
  );
}
