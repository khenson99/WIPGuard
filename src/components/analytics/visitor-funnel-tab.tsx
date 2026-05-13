"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Link2,
  DollarSign,
  ExternalLink,
  Filter,
  FlaskConical,
  PanelsTopLeft,
  UserRound,
  Users,
} from "lucide-react";
import type {
  AnalyticsDashboardData,
  EnrichmentProvider,
  VisitorFunnelBreakdownRow,
  VisitorFunnelRecord,
} from "@/lib/analytics/types";
import { DrilldownPanel } from "./drilldown-panel";
import { StatCard } from "./stat-card";

interface RecordsResponse {
  records: VisitorFunnelRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface EnrichmentActionResponse {
  accepted: number;
  dryRun?: boolean;
  preview?: Array<Record<string, unknown>>;
  stored: number;
  received: number;
  mode: "pull" | "native" | "normalized";
  provider: string;
  message?: string;
  error?: string;
}

interface ProviderActionState {
  pending: boolean;
  tone: "neutral" | "success" | "warning" | "error";
  message: string | null;
}

interface ProviderSetupGuide {
  envVars: string[];
  steps: string[];
  requestExample: string;
}

const STAGE_LABELS: Record<string, string> = {
  visitors: "Visitors",
  identified: "Identified",
  demo_booked: "Demo Booked",
  kanban_card_created: "Lead Magnet Submitted",
  trial_started: "Trials Started",
  paid_customer: "Paid Customers",
};

const STAGE_ICONS = [
  Users,
  UserRound,
  CalendarRange,
  PanelsTopLeft,
  FlaskConical,
  DollarSign,
] as const;

const DEFAULT_PROVIDER_ACTION_STATE: ProviderActionState = {
  pending: false,
  tone: "neutral",
  message: null,
};

const PROVIDER_SAMPLE_PAYLOADS: Record<
  Exclude<EnrichmentProvider, "unify">,
  Record<string, unknown>
> = {
  clay: {
    dryRun: true,
    rows: [
      {
        rowId: "sample-row-1",
        workEmail: "sample@example.com",
        companyDomain: "example.com",
        fullName: "Sample Buyer",
        companyName: "Example Co",
        confidence: 87,
        capturedUrl: "https://wipguard.ai/demo",
        referrerUrl: "https://www.reddit.com/r/revops",
        occurredAt: "2026-03-08T12:00:00.000Z",
      },
    ],
  },
  rb2b: {
    dryRun: true,
    "Business Email": "sample@example.com",
    "First Name": "Sample",
    "Last Name": "Buyer",
    "Company Name": "Example Co",
    Website: "https://example.com",
    "Captured URL": "https://wipguard.ai/pricing",
    Referrer: "https://www.reddit.com/r/startups",
    "Seen At": "2026-03-08T12:00:00.000Z",
  },
};

const PROVIDER_SETUP_GUIDES: Record<EnrichmentProvider, ProviderSetupGuide> = {
  unify: {
    envVars: [
      "UNIFY_DATA_API_KEY",
      "UNIFY_FUNNEL_OBJECT_NAME",
      "UNIFY_FUNNEL_SYNC_ENABLED=true",
      "UNIFY_FUNNEL_CURSOR_OVERLAP_MINUTES=60",
    ],
    steps: [
      "Use Unify as the scheduled source of record for website visitor records.",
      "Set the Unify API env vars in the app and keep /api/cron/sync enabled.",
      "Use Pull now or Replay 24h here to validate the object mapping before relying on cron.",
      "Optional: if you prefer push delivery, set UNIFY_FUNNEL_ENRICH_SECRET and post normalized payloads to the same endpoint.",
    ],
    requestExample: JSON.stringify(
      {
        mode: "pull",
        updatedAfter: "2026-03-10T00:00:00.000Z",
        maxRecords: 100,
      },
      null,
      2,
    ),
  },
  clay: {
    envVars: [
      "CLAY_FUNNEL_ENRICH_SECRET",
      "VISITOR_FUNNEL_ENRICH_SECRET (shared fallback)",
    ],
    steps: [
      "Create a Clay webhook or HTTP action that POSTs row payloads into Imladris.",
      "Prefer an x-webhook-secret header; Imladris also accepts bearer auth or token query params.",
      "Map Clay columns to identity fields like email, companyDomain, companyName, capturedUrl, and occurredAt.",
      "Run Validate sample here after configuring the destination to confirm the payload normalizes cleanly.",
    ],
    requestExample: JSON.stringify(PROVIDER_SAMPLE_PAYLOADS.clay, null, 2),
  },
  rb2b: {
    envVars: [
      "RB2B_FUNNEL_ENRICH_SECRET",
      "VISITOR_FUNNEL_ENRICH_SECRET (shared fallback)",
    ],
    steps: [
      "Point RB2B's webhook destination at Imladris's enrichment endpoint.",
      "If RB2B cannot send a custom header, append ?token=<secret> to the destination URL and store that same secret in Imladris.",
      "RB2B payloads normalize best when Business Email, Company Name, Website, Captured URL, and Seen At are present.",
      "Use Validate sample here to verify the endpoint accepts the expected RB2B field names before sending live traffic.",
    ],
    requestExample: JSON.stringify(PROVIDER_SAMPLE_PAYLOADS.rb2b, null, 2),
  },
};

function providerActionToneClass(tone: ProviderActionState["tone"]): string {
  if (tone === "success") return "text-emerald-600";
  if (tone === "warning") return "text-amber-600";
  if (tone === "error") return "text-rose-600";
  return "text-muted-foreground";
}

function initialProviderActionState(): Record<EnrichmentProvider, ProviderActionState> {
  return {
    unify: { ...DEFAULT_PROVIDER_ACTION_STATE },
    clay: { ...DEFAULT_PROVIDER_ACTION_STATE },
    rb2b: { ...DEFAULT_PROVIDER_ACTION_STATE },
  };
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatStage(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replaceAll("_", " ");
}

function formatMilestone(record: VisitorFunnelRecord, stage: string): string {
  const milestone = record.milestones.find((entry) => entry.stage === stage);
  if (!milestone?.occurredAt) return "—";
  return new Date(milestone.occurredAt).toLocaleDateString();
}

function providerGuideSummary(provider: EnrichmentProvider): string {
  if (provider === "unify") return "Pull setup";
  if (provider === "clay") return "Webhook setup";
  return "Webhook + token setup";
}

function buildCsvRows(records: VisitorFunnelRecord[]): string[][] {
  return records.map((record) => [
    record.anonymousId,
    record.firstTouchChannel ?? "",
    record.firstTouchSource ?? "",
    record.firstTouchCampaign ?? "",
    record.deepestStage,
    record.firstSeenAt,
    record.lastSeenAt,
    record.identities?.map((identity) => `${identity.type}:${identity.value}`).join(" | ") ?? "",
  ]);
}

export function VisitorFunnelTab({ data }: { data: AnalyticsDashboardData | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const sessionRole =
    typeof (session?.user as { role?: unknown } | undefined)?.role === "string"
      ? ((session?.user as { role: string }).role ?? null)
      : null;
  const funnel = data?.visitorFunnel;
  const isAdmin = sessionRole === "admin";
  const [recordsState, setRecordsState] = useState<{
    href: string | null;
    payload: RecordsResponse | null;
    error: string | null;
  }>({
    href: null,
    payload: null,
    error: null,
  });
  const [providerActionState, setProviderActionState] = useState<
    Record<EnrichmentProvider, ProviderActionState>
  >(() => initialProviderActionState());

  const recordsHref = (() => {
    const hrefValue = funnel?.recordsApi.href;
    if (typeof window === "undefined" || !hrefValue) return null;
    const href = new URL(hrefValue, window.location.origin);
    href.searchParams.set("page", "1");
    href.searchParams.set("pageSize", "10");
    return `${href.pathname}${href.search}`;
  })();

  useEffect(() => {
    if (!isAdmin || !recordsHref) return;

    let active = true;
    const controller = new AbortController();

    void fetch(recordsHref, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Preview request failed (${response.status})`);
        }
        const payload = (await response.json()) as RecordsResponse;
        if (!active) return;
        setRecordsState({
          href: recordsHref,
          payload,
          error: null,
        });
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        setRecordsState({
          href: recordsHref,
          payload: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load visitor preview.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isAdmin, recordsHref]);

  if (!funnel) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        No visitor funnel data is available for the selected range.
      </div>
    );
  }

  const updateFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  };

  const refreshSection = () => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.set("vfSyncAt", Date.now().toString());
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  };

  const updateProviderAction = (
    provider: EnrichmentProvider,
    nextState: ProviderActionState,
  ) => {
    setProviderActionState((current) => ({
      ...current,
      [provider]: nextState,
    }));
  };

  const runUnifyPull = async (windowHours: number | null) => {
    updateProviderAction("unify", {
      pending: true,
      tone: "neutral",
      message: windowHours ? `Replaying the last ${windowHours} hours…` : "Pulling latest Unify records…",
    });

    try {
      const body: Record<string, unknown> = {
        mode: "pull",
      };
      if (windowHours) {
        body.updatedAfter = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
      }

      const response = await fetch("/api/v1/analytics/funnel/enrich/unify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as EnrichmentActionResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? `Unify pull failed (${response.status})`);
      }

      const tone = payload.received > 0 ? "success" : "warning";
      const message =
        payload.received > 0
          ? `Pulled ${payload.received} signals. Stored ${payload.stored}, accepted ${payload.accepted}.`
          : payload.message ?? "No new enrichment signals were found.";

      updateProviderAction("unify", {
        pending: false,
        tone,
        message,
      });
      refreshSection();
    } catch (error) {
      updateProviderAction("unify", {
        pending: false,
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to pull Unify records.",
      });
    }
  };

  const runProviderValidation = async (
    provider: Exclude<EnrichmentProvider, "unify">,
  ) => {
    updateProviderAction(provider, {
      pending: true,
      tone: "neutral",
      message: `Validating ${provider === "clay" ? "Clay" : "RB2B"} sample payload…`,
    });

    try {
      const response = await fetch(`/api/v1/analytics/funnel/enrich/${provider}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(PROVIDER_SAMPLE_PAYLOADS[provider]),
      });
      const payload = (await response.json().catch(() => ({}))) as EnrichmentActionResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? `Sample validation failed (${response.status})`);
      }

      updateProviderAction(provider, {
        pending: false,
        tone: payload.received > 0 ? "success" : "warning",
        message:
          payload.message ??
          (payload.received > 0
            ? `Validated ${payload.received} sample signal${payload.received === 1 ? "" : "s"}.`
            : "No enrichment signals were found in the sample payload."),
      });
    } catch (error) {
      updateProviderAction(provider, {
        pending: false,
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to validate sample payload.",
      });
    }
  };

  const previewIsCurrent = Boolean(
    isAdmin && recordsHref && recordsState.href === recordsHref
  );
  const previewRecords = previewIsCurrent ? recordsState.payload?.records ?? [] : [];
  const previewTotal = previewIsCurrent ? recordsState.payload?.pagination.total ?? 0 : 0;
  const previewError = previewIsCurrent ? recordsState.error : null;
  const previewLoading = Boolean(isAdmin && recordsHref && !previewIsCurrent);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Anonymous Visit to Customer Funnel</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              First-party visit cohorts joined to de-anonymization, demo, lead magnet, trial, and paid conversion milestones.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => updateFilter("quickFilter", "all")}
              className={`rounded-md px-3 py-1.5 text-xs ${
                funnel.filters.quickFilter === "all"
                  ? "bg-foreground text-background"
                  : "border border-border bg-background text-muted-foreground"
              }`}
            >
              All Channels
            </button>
            <button
              type="button"
              onClick={() => updateFilter("quickFilter", "reddit")}
              className={`rounded-md px-3 py-1.5 text-xs ${
                funnel.filters.quickFilter === "reddit"
                  ? "bg-[#ff4500] text-white"
                  : "border border-border bg-background text-muted-foreground"
              }`}
            >
              Reddit Only
            </button>
            <button
              type="button"
              onClick={() => updateFilter("knownOnly", funnel.filters.knownOnly ? null : "true")}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                funnel.filters.knownOnly
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              Known Only
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <select
            value={funnel.filters.stage}
            onChange={(event) => updateFilter("stage", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All stages</option>
            {funnel.stages.map((stage) => (
              <option key={stage.stage} value={stage.stage}>
                {stage.label}
              </option>
            ))}
          </select>
          <select
            value={funnel.filters.channel}
            onChange={(event) => updateFilter("channel", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All channels</option>
            {funnel.availableChannels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
          <select
            value={funnel.filters.source ?? "all"}
            onChange={(event) => updateFilter("source", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All sources</option>
            {funnel.availableSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select
            value={funnel.filters.campaign ?? "all"}
            onChange={(event) => updateFilter("campaign", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All campaigns</option>
            {funnel.availableCampaigns.map((campaign) => (
              <option key={campaign} value={campaign}>
                {campaign}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        {funnel.stages.map((stage, index) => {
          const Icon = STAGE_ICONS[index] ?? Users;
          return (
            <StatCard
              key={stage.stage}
              label={stage.label}
              value={stage.count}
              subtitle={`Visitors: ${pct(stage.conversionFromVisitors)} · Prev: ${pct(stage.conversionFromPrevious)}`}
              icon={Icon}
            />
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Weekly Trend</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Cohort entry and milestone counts by ISO week.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              Closed-won reference: {funnel.secondaryMetrics.closedWonCount.toLocaleString()}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Week</th>
                  <th className="pb-2 pr-4 font-medium">Visitors</th>
                  <th className="pb-2 pr-4 font-medium">Identified</th>
                  <th className="pb-2 pr-4 font-medium">Demo</th>
                  <th className="pb-2 pr-4 font-medium">Lead Magnet</th>
                  <th className="pb-2 pr-4 font-medium">Trial</th>
                  <th className="pb-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {funnel.trends.map((row) => (
                  <tr key={row.week} className="border-t border-border">
                    <td className="py-2 pr-4 text-foreground">{row.week}</td>
                    <td className="py-2 pr-4">{row.visitors.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.identified.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.demo_booked.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.kanban_card_created.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.trial_started.toLocaleString()}</td>
                    <td className="py-2">{row.paid_customer.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Action Overlap</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Visitors who completed multiple downstream actions in the range.
          </p>
          <div className="mt-4 space-y-2">
            {funnel.overlaps.map((overlap) => (
              <div key={overlap.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span className="text-foreground">{overlap.key.replaceAll("_", " ").replace("+", " + ")}</span>
                <span className="font-medium text-foreground">{overlap.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownCard title="Channels" rows={funnel.channelBreakdown} />
        <BreakdownCard title="Sources" rows={funnel.sourceBreakdown} />
        <BreakdownCard title="Campaigns" rows={funnel.campaignBreakdown} />
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Provider Health</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Operational status for UNIFY scheduled pulls and Clay / RB2B push ingestion.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              Admin-only operational metadata
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {funnel.enrichmentStatus.alerts.length > 0 ? (
              <div className="xl:col-span-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  {funnel.enrichmentStatus.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl border px-4 py-3 ${
                        alert.severity === "critical"
                          ? "border-rose-500/30 bg-rose-500/10"
                          : "border-amber-500/30 bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <CircleAlert
                          className={`mt-0.5 h-4 w-4 ${
                            alert.severity === "critical" ? "text-rose-600" : "text-amber-600"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Last signal: {formatTimestamp(alert.lastSignalAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {funnel.enrichmentStatus.providers.map((providerStatus) => {
              const state = !providerStatus.syncConfigured
                ? { label: "Not Configured", cls: "bg-rose-500/10 text-rose-600", icon: CircleAlert }
                : providerStatus.stale
                  ? { label: "Stale", cls: "bg-amber-500/10 text-amber-600", icon: Clock3 }
                  : providerStatus.totalSignals === 0
                    ? { label: "Waiting", cls: "bg-amber-500/10 text-amber-600", icon: Clock3 }
                    : { label: "Healthy", cls: "bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
              const StatusIcon = state.icon;
              const actionState = providerActionState[providerStatus.provider];
              const setupGuide = PROVIDER_SETUP_GUIDES[providerStatus.provider];

              return (
                <div key={providerStatus.provider} className="rounded-xl border border-border bg-background px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{providerStatus.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {providerStatus.deliveryMode === "cron_pull" ? "Cron pull" : "Webhook push"}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${state.cls}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {state.label}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-border px-3 py-2">
                      <p className="text-muted-foreground">Signals</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {providerStatus.acceptedSignals.toLocaleString()} / {providerStatus.totalSignals.toLocaleString()}
                      </p>
                      <p className="mt-1 text-muted-foreground">Accepted {pct(providerStatus.acceptedRate)}</p>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-2">
                      <p className="text-muted-foreground">Config</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {providerStatus.syncConfigured ? "Ready" : "Missing"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Auth {providerStatus.authConfigured ? "set" : "missing"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Last signal</span>
                      <span className="text-right text-foreground">{formatTimestamp(providerStatus.lastSignalAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Last accepted</span>
                      <span className="text-right text-foreground">{formatTimestamp(providerStatus.lastAcceptedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Endpoint</span>
                      <code className="text-right text-[11px] text-foreground">{providerStatus.endpointPath}</code>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">{providerStatus.note}</p>

                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Link2 className="h-3.5 w-3.5" />
                    {providerStatus.syncEnabled ? "Enabled" : "Disabled"}
                  </div>

                  <details className="mt-4 rounded-lg border border-border bg-card/60 px-3 py-3 text-xs">
                    <summary className="cursor-pointer list-none font-medium text-foreground">
                      {providerGuideSummary(providerStatus.provider)}
                    </summary>
                    <div className="mt-3 space-y-3 text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground">Required config</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {setupGuide.envVars.map((envVar) => (
                            <code
                              key={envVar}
                              className="rounded bg-background px-2 py-1 text-[11px] text-foreground"
                            >
                              {envVar}
                            </code>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="font-medium text-foreground">Setup steps</p>
                        <ul className="mt-2 space-y-1.5 pl-4">
                          {setupGuide.steps.map((step) => (
                            <li key={step} className="list-disc">
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-foreground">Endpoint</p>
                          <code className="text-[11px] text-foreground">
                            {providerStatus.endpointPath}
                          </code>
                        </div>
                        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background p-3 text-[11px] text-foreground">
                          <code>{setupGuide.requestExample}</code>
                        </pre>
                      </div>
                    </div>
                  </details>

                  {providerStatus.provider === "unify" ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void runUnifyPull(null)}
                          disabled={actionState.pending || !providerStatus.syncConfigured}
                          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionState.pending ? "Pulling..." : "Pull now"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runUnifyPull(24)}
                          disabled={actionState.pending || !providerStatus.syncConfigured}
                          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionState.pending ? "Working..." : "Replay 24h"}
                        </button>
                      </div>

                      {actionState.message ? (
                        <p className={`text-xs ${providerActionToneClass(actionState.tone)}`}>
                          {actionState.message}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void runProviderValidation(
                              providerStatus.provider === "clay" ? "clay" : "rb2b",
                            )
                          }
                          disabled={actionState.pending}
                          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionState.pending ? "Validating..." : "Validate sample"}
                        </button>
                      </div>

                      {actionState.message ? (
                        <p className={`text-xs ${providerActionToneClass(actionState.tone)}`}>
                          {actionState.message}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <DrilldownPanel
        title="Admin Record Preview"
        subtitle="Top visitor rows with identity and milestone evidence."
        statusLine={
          isAdmin
            ? previewLoading
              ? "Loading admin preview…"
              : `${previewTotal} total matching visitors`
            : "Admin role required for row-level identity drill-down."
        }
        csvExport={
          isAdmin && previewRecords.length > 0
            ? {
                filename: `visitor-funnel-preview-${new Date().toISOString().slice(0, 10)}.csv`,
                headers: [
                  "Anonymous ID",
                  "Channel",
                  "Source",
                  "Campaign",
                  "Deepest Stage",
                  "First Seen",
                  "Last Seen",
                  "Identities",
                ],
                rows: () => buildCsvRows(previewRecords),
              }
            : undefined
        }
        isEmpty={!isAdmin || (!previewLoading && previewRecords.length === 0)}
        emptyMessage={isAdmin ? previewError ?? "No matching visitor records." : "Admin access required."}
      >
        <div className="space-y-2">
          {previewRecords.map((record) => (
            <div key={record.visitorId} className="rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {record.firstTouchSource ?? "unknown source"} / {record.firstTouchChannel ?? "unknown channel"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.anonymousId} · {new Date(record.firstSeenAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deepest Stage</p>
                  <p className="text-sm font-semibold text-foreground">{formatStage(record.deepestStage)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-xs lg:grid-cols-3">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">Milestones</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>Demo: {formatMilestone(record, "demo_booked")}</div>
                    <div>Lead magnet: {formatMilestone(record, "kanban_card_created")}</div>
                    <div>Trial: {formatMilestone(record, "trial_started")}</div>
                    <div>Paid: {formatMilestone(record, "paid_customer")}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">Identity Links</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {(record.identities ?? []).slice(0, 4).map((identity) => (
                      <div key={`${identity.type}:${identity.value}`}>
                        {identity.type}: {identity.value} ({identity.provenance})
                      </div>
                    ))}
                    {(record.identities?.length ?? 0) === 0 ? <div>None</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">Provider Evidence</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {(record.providers ?? []).slice(0, 4).map((provider) => (
                      <div key={provider.provider}>
                        {provider.provider}: {provider.signalCount} signals{provider.accepted ? " accepted" : ""}
                      </div>
                    ))}
                    {(record.providers?.length ?? 0) === 0 ? <div>None</div> : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {isAdmin && funnel.recordsApi.href ? (
          <div className="mt-4 flex justify-end">
            <a
              href={funnel.recordsApi.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Open records API
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}
      </DrilldownPanel>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: VisitorFunnelBreakdownRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Top acquisition slices in the current filter context.</p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{row.key}</p>
              <p className="text-xs text-muted-foreground">{row.visitors.toLocaleString()} visitors</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Identified {row.identified} · Demo {row.demoBooked} · Lead magnet {row.kanbanCards} · Trial {row.trialsStarted} · Paid {row.paidCustomers}
            </p>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No breakdown rows in the selected range.</p>
        ) : null}
      </div>
    </div>
  );
}
