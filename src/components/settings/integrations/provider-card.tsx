"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { descriptorsForProvider } from "@/components/settings/integrations/rule-descriptors";
import { credentialSourceLabel, type RemediationStep } from "@/components/settings/integrations/remediation";
import { RuleEditor } from "@/components/settings/integrations/rule-editor";
import type {
  HubSpotDiagnosticsResponse,
  HubSpotDriftReport,
  IntegrationItem,
  RuleLoadState,
} from "@/components/settings/integrations/types";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getHealthTone(item: IntegrationItem): {
  tone: "success" | "warning" | "danger" | "muted";
  label: string;
} {
  if (!item.connected) {
    if (item.status === "ERROR" || item.syncHealth === "error") {
      return { tone: "danger", label: "Error" };
    }
    return { tone: "muted", label: "Not connected" };
  }

  if (item.syncHealth === "healthy") return { tone: "success", label: "Connected" };
  if (item.syncHealth === "degraded") return { tone: "warning", label: "Connected (degraded)" };
  if (item.syncHealth === "error") return { tone: "danger", label: "Connected (error)" };

  return { tone: "muted", label: "Connected" };
}

function getRuleStatusLabel(state: RuleLoadState): { label: string; tone: "danger" | "muted" | "success" } {
  if (state.loading) return { label: "Loading", tone: "muted" };
  if (state.error || state.rule?.lastError) return { label: "Error", tone: "danger" };
  if (state.rule?.enabled) return { label: "Enabled", tone: "success" };
  return { label: "Disabled", tone: "muted" };
}

interface ProviderCardProps {
  item: IntegrationItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  attentionCount: number;
  loadingProviderAction: string | null;
  remediationSteps: RemediationStep[];
  ruleStates: Record<string, RuleLoadState>;
  onStartOAuthConnect: (slug: string) => void;
  onDisconnect: (slug: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  codaToken: string;
  codaDocInput: string;
  onCodaTokenChange: (value: string) => void;
  onCodaDocChange: (value: string) => void;
  onConnectCoda: () => Promise<void>;
  onRuleReload: (ruleId: string) => Promise<void>;
  onRuleSave: (
    ruleId: string,
    payload: {
      enabled?: boolean;
      statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
      config: Record<string, unknown>;
    }
  ) => Promise<void>;
  onRuleRun: (
    ruleId: string,
    payload?: { dryRun?: boolean; payload?: Record<string, unknown> }
  ) => Promise<void>;
  onChannelRoutingAddPolicy: (ruleId: string, policy: Record<string, unknown>) => Promise<void>;
  onChannelRoutingRemovePolicy: (ruleId: string, policyIndex: number) => Promise<void>;
  hubspotDiagnostics: {
    loading: boolean;
    error: string | null;
    data: HubSpotDiagnosticsResponse | null;
    driftLoading: boolean;
    driftReport: HubSpotDriftReport | null;
  };
  onReloadHubspotDiagnostics: () => Promise<void>;
  onRunHubspotDrift: () => Promise<void>;
}

export function ProviderCard({
  item,
  isExpanded,
  onToggleExpand,
  attentionCount,
  loadingProviderAction,
  remediationSteps,
  ruleStates,
  onStartOAuthConnect,
  onDisconnect,
  onRefresh,
  codaToken,
  codaDocInput,
  onCodaTokenChange,
  onCodaDocChange,
  onConnectCoda,
  onRuleReload,
  onRuleSave,
  onRuleRun,
  onChannelRoutingAddPolicy,
  onChannelRoutingRemovePolicy,
  hubspotDiagnostics,
  onReloadHubspotDiagnostics,
  onRunHubspotDrift,
}: ProviderCardProps) {
  const contentId = useId();

  const rules = useMemo(
    () =>
      descriptorsForProvider(item.slug)
        .map((descriptor) => ({ descriptor, state: ruleStates[descriptor.id] }))
        .filter((entry) => Boolean(entry.state)),
    [item.slug, ruleStates]
  );

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        const aHasError = Boolean(a.state?.rule?.lastError);
        const bHasError = Boolean(b.state?.rule?.lastError);
        return Number(bHasError) - Number(aHasError);
      }),
    [rules]
  );

  const hasRuleErrors = sortedRules.some((entry) => Boolean(entry.state?.rule?.lastError));
  const health = getHealthTone(item);

  const [openRuleId, setOpenRuleId] = useState<string | null>(null);
  const didUserToggleRuleRef = useRef(false);

  useEffect(() => {
    if (!isExpanded || didUserToggleRuleRef.current) {
      return;
    }

    const firstFailingRule = sortedRules.find((entry) => Boolean(entry.state?.rule?.lastError));
    setOpenRuleId(firstFailingRule?.descriptor.id ?? null);
  }, [isExpanded, sortedRules]);

  useEffect(() => {
    if (!openRuleId) {
      return;
    }

    const stillExists = sortedRules.some((entry) => entry.descriptor.id === openRuleId);
    if (!stillExists) {
      setOpenRuleId(null);
    }
  }, [openRuleId, sortedRules]);

  const toggleRule = (ruleId: string) => {
    didUserToggleRuleRef.current = true;
    setOpenRuleId((previous) => (previous === ruleId ? null : ruleId));
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={`Toggle ${item.name}`}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronRight
            className={`mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{item.name}</h3>
              {health.tone === "success" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-xs text-[var(--success)]">
                  <CheckCircle2 className="h-3 w-3" />
                  {health.label}
                </span>
              ) : health.tone === "warning" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning)]/10 px-2 py-0.5 text-xs text-[var(--warning)]">
                  <AlertTriangle className="h-3 w-3" />
                  {health.label}
                </span>
              ) : health.tone === "danger" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-xs text-[var(--danger)]">
                  <AlertTriangle className="h-3 w-3" />
                  {health.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  <Link2Off className="h-3 w-3" />
                  {health.label}
                </span>
              )}
              {attentionCount > 0 ? (
                <span className="inline-flex rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-[11px] text-[var(--warning)]">
                  {attentionCount} attention
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {item.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          {item.authType === "oauth" ? (
            item.status === "CONNECTED" ? (
              <>
                <button
                  type="button"
                  onClick={() => onStartOAuthConnect(item.slug)}
                  disabled={!item.configured || loadingProviderAction === item.slug}
                  className="btn-primary-theme rounded-md px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  Reconnect
                </button>
                <button
                  type="button"
                  onClick={() => onDisconnect(item.slug)}
                  disabled={loadingProviderAction === item.slug}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  {loadingProviderAction === item.slug ? "Disconnecting..." : "Disconnect"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onStartOAuthConnect(item.slug)}
                disabled={!item.configured || loadingProviderAction === item.slug}
                className="btn-primary-theme inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs disabled:opacity-60"
              >
                <Link2 className="h-3.5 w-3.5" />
                Connect
              </button>
            )
          ) : null}

          <button
            type="button"
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div id={contentId} className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Connection:</span>{" "}
                {item.connected ? `Connected as ${item.accountLabel || "unknown account"}` : "Not connected"}
              </p>
              <p>
                <span className="font-medium text-foreground">Connected At:</span> {formatDate(item.connectedAt)}
              </p>
              <p>
                <span className="font-medium text-foreground">Credential Source:</span>{" "}
                {credentialSourceLabel(item.credentialSource)}
              </p>
              {item.syncHealthReason ? (
                <p>
                  <span className="font-medium text-foreground">Data Health:</span> {item.syncHealthReason}
                </p>
              ) : null}
              {item.lastError ? (
                <p className="text-[var(--danger)]">
                  <span className="font-medium">Last Error:</span> {item.lastError}
                </p>
              ) : null}
              {!item.configured && item.authType === "oauth" ? (
                <p className="text-[var(--warning)]">Missing env: {item.missingEnv.join(", ")}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p className="mb-1 text-sm font-medium text-foreground">Resolution Options</p>
              <ul className="space-y-1">
                {remediationSteps.map((step) => (
                  <li key={step.id} className="rounded-md border border-border px-2 py-1">
                    <p className="font-medium text-foreground">{step.title}</p>
                    <p>{step.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {item.slug === "coda" ? (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">Coda Connection + Doc Configuration</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Coda Doc URL or Doc ID
                  <input
                    type="text"
                    value={codaDocInput}
                    onChange={(event) => onCodaDocChange(event.target.value)}
                    placeholder="https://coda.io/d/... or dxxxxx"
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Coda API Token (optional if server token exists)
                  <input
                    type="password"
                    value={codaToken}
                    onChange={(event) => onCodaTokenChange(event.target.value)}
                    placeholder="coda_..."
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onConnectCoda}
                  disabled={loadingProviderAction === "coda"}
                  className="btn-primary-theme rounded-md px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  {loadingProviderAction === "coda" ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </span>
                  ) : item.connected ? (
                    "Save Coda Settings"
                  ) : (
                    "Connect Coda"
                  )}
                </button>
                {item.status === "CONNECTED" ? (
                  <button
                    type="button"
                    onClick={() => onDisconnect(item.slug)}
                    disabled={loadingProviderAction === item.slug}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Current doc: {item.docId || "Not configured"}</p>
            </div>
          ) : null}

          {item.slug === "hubspot" ? (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">HubSpot Diagnostics</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onReloadHubspotDiagnostics()}
                    disabled={hubspotDiagnostics.loading}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    Reload
                  </button>
                  <button
                    type="button"
                    onClick={() => onRunHubspotDrift()}
                    disabled={hubspotDiagnostics.driftLoading}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {hubspotDiagnostics.driftLoading ? "Running..." : "Run Drift Report"}
                  </button>
                </div>
              </div>

              {hubspotDiagnostics.error ? (
                <p className="mt-2 text-xs text-[var(--danger)]">{hubspotDiagnostics.error}</p>
              ) : null}

              {hubspotDiagnostics.data ? (
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <p>
                    Connection status: {hubspotDiagnostics.data.connection?.status || "unknown"} · Last synced:{" "}
                    {formatDate(hubspotDiagnostics.data.connection?.lastSyncedAt ?? null)}
                  </p>
                  {hubspotDiagnostics.data.mappingValidation.length > 0 ? (
                    <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2">
                      <p className="font-medium text-foreground">Mapping validation issues</p>
                      <ul className="mt-1 space-y-1">
                        {hubspotDiagnostics.data.mappingValidation.map((issue, index) => (
                          <li key={`${issue}-${index}`}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-[var(--success)]">No mapping validation issues detected.</p>
                  )}
                  <div>
                    <p className="font-medium text-foreground">Recent receipts</p>
                    {hubspotDiagnostics.data.recentReceipts.length === 0 ? (
                      <p>No recent sync receipts.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {hubspotDiagnostics.data.recentReceipts.slice(0, 5).map((receipt) => (
                          <li key={receipt.id}>
                            {receipt.direction} · deal {receipt.dealId} · task {receipt.taskId || "none"} ·{" "}
                            {formatDate(receipt.createdAt)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              {hubspotDiagnostics.driftReport ? (
                <div className="mt-2 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Latest Drift Report</p>
                  <p>Drift count: {hubspotDiagnostics.driftReport.drifts.length}</p>
                  <p>
                    Scanned deals: {hubspotDiagnostics.driftReport.scannedDeals} · tasks:{" "}
                    {hubspotDiagnostics.driftReport.scannedTasks}
                  </p>
                  {hubspotDiagnostics.driftReport.drifts.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {hubspotDiagnostics.driftReport.drifts.slice(0, 5).map((drift, index) => (
                        <li key={`${drift.dealId}-${index}`}>
                          {drift.kind}: {drift.detail}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No drift entries returned.</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {sortedRules.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                <Wrench className="h-4 w-4" />
                Rule Editors
              </div>

              <div className="space-y-2">
                {sortedRules.map(({ descriptor, state }) => {
                  if (!state) {
                    return null;
                  }

                  const isOpen = openRuleId === descriptor.id;
                  const rowStatus = getRuleStatusLabel(state);
                  const panelId = `${contentId}-${descriptor.id}`;

                  return (
                    <div key={descriptor.id} className="rounded-lg border border-border bg-background">
                      <button
                        type="button"
                        onClick={() => toggleRule(descriptor.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{descriptor.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Last run: {formatDate(state.rule?.lastRunAt ?? null)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {rowStatus.tone === "danger" ? (
                            <span className="inline-flex items-center rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] text-[var(--danger)]">
                              {rowStatus.label}
                            </span>
                          ) : rowStatus.tone === "success" ? (
                            <span className="inline-flex items-center rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-[11px] text-[var(--success)]">
                              {rowStatus.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                              {rowStatus.label}
                            </span>
                          )}
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {isOpen ? (
                        <div id={panelId} className="px-2 pb-2">
                          <RuleEditor
                            key={`${descriptor.id}:${state.rule?.id ?? "none"}:${state.rule?.lastRunAt ?? "never"}:${state.rule?.lastError ?? "ok"}`}
                            descriptor={descriptor}
                            state={state}
                            highlighted={
                              Boolean(state.rule?.lastError) ||
                              (hasRuleErrors && descriptor.id === sortedRules[0]?.descriptor.id)
                            }
                            onReload={() => onRuleReload(descriptor.id)}
                            onSave={(payload) => onRuleSave(descriptor.id, payload)}
                            onRun={(payload) => onRuleRun(descriptor.id, payload)}
                            onChannelRoutingAddPolicy={(policy) => onChannelRoutingAddPolicy(descriptor.id, policy)}
                            onChannelRoutingRemovePolicy={(policyIndex) =>
                              onChannelRoutingRemovePolicy(descriptor.id, policyIndex)
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Diagnostics-only provider</p>
              <p>
                This provider currently has connection and telemetry health here. Rule automation editors are not yet
                available.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
