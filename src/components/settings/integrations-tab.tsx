"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ProviderCard } from "@/components/settings/integrations/provider-card";
import { descriptorsForProvider, RULE_DESCRIPTORS } from "@/components/settings/integrations/rule-descriptors";
import { buildRemediationSteps } from "@/components/settings/integrations/remediation";
import type {
  HubSpotDiagnosticsResponse,
  HubSpotDriftReport,
  IntegrationItem,
  RuleLoadState,
  RuleRuntimeState,
} from "@/components/settings/integrations/types";

const STATUS_MESSAGE: Record<string, string> = {
  connected: "Integration connected successfully.",
  oauth_failed: "OAuth handshake failed. Try connecting again.",
  oauth_denied: "Provider authorization was denied.",
  invalid_state: "OAuth state validation failed. Please retry.",
  missing_config: "Provider credentials are missing on the server.",
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeRule(raw: unknown): RuleRuntimeState {
  const input = asRecord(raw);
  return {
    id: String(input.id ?? ""),
    key: String(input.key ?? ""),
    enabled: input.enabled === true,
    statusOverride:
      input.statusOverride === "QUEUED" || input.statusOverride === "ACTIVE" || input.statusOverride === "NOT_DONE"
        ? input.statusOverride
        : null,
    config: asRecord(input.config),
    checkpoint: asRecord(input.checkpoint),
    lastObservedAt: typeof input.lastObservedAt === "string" ? input.lastObservedAt : null,
    lastRunAt: typeof input.lastRunAt === "string" ? input.lastRunAt : null,
    lastError: typeof input.lastError === "string" ? input.lastError : null,
  };
}

function createInitialRuleStates(): Record<string, RuleLoadState> {
  return Object.fromEntries(
    RULE_DESCRIPTORS.map((descriptor) => [
      descriptor.id,
      {
        loading: false,
        saving: false,
        running: false,
        error: null,
        message: null,
        rule: null,
      },
    ])
  ) as Record<string, RuleLoadState>;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

function summarizeRunResponse(payload: unknown): string {
  const record = asRecord(payload);
  const result = asRecord(record.result);
  if (Object.keys(result).length === 0) {
    return "Action completed.";
  }

  const summaryParts: string[] = [];

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number") {
      summaryParts.push(`${key}: ${value}`);
    }
  }

  return summaryParts.length > 0 ? `Run complete (${summaryParts.join(" · ")}).` : "Run complete.";
}

function providerAttentionCount(item: IntegrationItem, rules: RuleLoadState[]): number {
  let count = 0;
  if (!item.connected) count += 1;
  if (!item.configured) count += 1;
  if (item.status === "ERROR") count += 1;
  if (item.syncHealth === "degraded" || item.syncHealth === "error") count += 1;
  if (rules.some((rule) => Boolean(rule.rule?.lastError))) count += 1;
  return count;
}

export function IntegrationsTab() {
  const searchParams = useSearchParams();

  const [items, setItems] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingProviderAction, setLoadingProviderAction] = useState<string | null>(null);

  const [codaToken, setCodaToken] = useState("");
  const [codaDocInput, setCodaDocInput] = useState("");


      const pylon = integrations.find((item) => item.slug === "pylon");
      const storedBaseUrl = asRecord(pylon?.metadata ?? null).baseUrl;
      setPylonBaseUrl(typeof storedBaseUrl === "string" ? storedBaseUrl : "");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRule = useCallback(
    async (ruleId: string) => {
      const descriptor = descriptorById.get(ruleId);
      if (!descriptor) return;

      setRuleState(ruleId, {
        loading: true,
        error: null,
      });

      try {
        const response = await fetch(descriptor.endpoint, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, `Failed to load ${descriptor.title}`));
        }

        const payload = (await response.json().catch(() => null)) as { rule?: unknown } | null;
        if (!payload?.rule) {
          throw new Error(`No rule payload returned for ${descriptor.title}`);
        }

        setRuleState(ruleId, {
          loading: false,
          error: null,
          rule: normalizeRule(payload.rule),
        });
      } catch (loadError) {
        setRuleState(ruleId, {
          loading: false,
          error: loadError instanceof Error ? loadError.message : `Failed to load ${descriptor.title}`,
        });
      }
    },
    [descriptorById, setRuleState]
  );

  const loadRulesForProvider = useCallback(
    async (provider: string) => {
      const descriptors = descriptorsForProvider(provider);
      if (descriptors.length === 0) return;
      await Promise.all(descriptors.map((descriptor) => loadRule(descriptor.id)));
    },
    [loadRule]
  );

  const reloadHubspotDiagnostics = useCallback(async () => {
    setHubspotDiagnostics((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/integrations/hubspot/sync", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, "Failed to load HubSpot diagnostics"));
      }

      const payload = (await response.json()) as HubSpotDiagnosticsResponse;
      setHubspotDiagnostics((prev) => ({
        ...prev,
        loading: false,
        error: null,
        data: payload,
      }));
    } catch (diagnosticsError) {
      setHubspotDiagnostics((prev) => ({
        ...prev,
        loading: false,
        error:
          diagnosticsError instanceof Error
            ? diagnosticsError.message
            : "Failed to load HubSpot diagnostics",
      }));
    }
  }, []);

  const runHubspotDriftReport = useCallback(async () => {
    setHubspotDiagnostics((prev) => ({ ...prev, driftLoading: true, error: null }));
    try {
      const response = await fetch("/api/integrations/hubspot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drift_report" }),
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, "Failed to run HubSpot drift report"));
      }

      const payload = (await response.json().catch(() => null)) as
        | { report?: HubSpotDriftReport }
        | null;
      setHubspotDiagnostics((prev) => ({
        ...prev,
        driftLoading: false,
        driftReport: payload?.report ?? null,
      }));
    } catch (driftError) {
      setHubspotDiagnostics((prev) => ({
        ...prev,
        driftLoading: false,
        error:
          driftError instanceof Error ? driftError.message : "Failed to run HubSpot drift report",
      }));
    }
  }, []);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  useEffect(() => {
    if (items.length === 0) return;

    for (const item of items) {
      if (descriptorsForProvider(item.slug).length === 0) {
        continue;
      }

      if (!loadedProvidersRef.current.has(item.slug)) {
        loadedProvidersRef.current.add(item.slug);
        void loadRulesForProvider(item.slug);
      }
    }

    if (items.some((item) => item.slug === "hubspot") && !loadedHubspotDiagnosticsRef.current) {
      loadedHubspotDiagnosticsRef.current = true;
      void reloadHubspotDiagnostics();
    }
  }, [items, loadRulesForProvider, reloadHubspotDiagnostics]);

  useEffect(() => {
    if (items.length === 0 || didUserToggleProviderRef.current) {
      return;
    }

    const firstNeedsAttention = items.find((item) => {
      const providerRuleStates = descriptorsForProvider(item.slug)
        .map((descriptor) => ruleStates[descriptor.id])
        .filter((state): state is RuleLoadState => Boolean(state));
      return providerAttentionCount(item, providerRuleStates) > 0;
    });

    const nextExpandedSlug = firstNeedsAttention?.slug ?? null;
    setExpandedProviderSlug((previous) => (previous === nextExpandedSlug ? previous : nextExpandedSlug));
  }, [items, ruleStates]);

  const toggleProviderExpanded = useCallback((slug: string) => {
    didUserToggleProviderRef.current = true;
    setExpandedProviderSlug((previous) => (previous === slug ? null : slug));
  }, []);

  const banner = useMemo(() => {
    const status = searchParams?.get("status");
    if (!status || !STATUS_MESSAGE[status]) {
      return null;
    }
    const integration = searchParams?.get("integration");
    return integration ? `${STATUS_MESSAGE[status]} (${integration})` : STATUS_MESSAGE[status];
  }, [searchParams]);

  const startOAuthConnect = (slug: string) => {
    window.location.href = `/api/integrations/connect/${slug}`;
  };

  const disconnect = useCallback(
    async (slug: string) => {
      setLoadingProviderAction(slug);
      setError(null);
      try {
        const response = await fetch(`/api/integrations/${slug}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, `Failed to disconnect ${slug}`));
        }
        await fetchIntegrations();
      } catch (disconnectError) {
        setError(
          disconnectError instanceof Error ? disconnectError.message : `Failed to disconnect ${slug}.`
        );
      } finally {
        setLoadingProviderAction(null);
      }
    },
    [fetchIntegrations]
  );

  const connectCoda = useCallback(async () => {
    setLoadingProviderAction("coda");
    setError(null);

    try {
      const token = codaToken.trim();
      const docInput = codaDocInput.trim();
      const payload: { token?: string; docId?: string; docUrl?: string } = {};

      if (token) {
        payload.token = token;
      }
      if (docInput) {
        if (/^https?:\/\//i.test(docInput)) {
          payload.docUrl = docInput;
        } else {
          payload.docId = docInput;
        }
      }

      const response = await fetch("/api/integrations/coda/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, "Failed to connect Coda"));
      }

      const successPayload = (await response.json().catch(() => null)) as
        | { docId?: string | null }
        | null;

      setCodaToken("");
      if (typeof successPayload?.docId === "string") {
        setCodaDocInput(successPayload.docId);
      }

      await fetchIntegrations();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to connect Coda");
    } finally {
      setLoadingProviderAction(null);
    }
  }, [codaDocInput, codaToken, fetchIntegrations]);

              semrushToken={semrushToken}
              semrushDomain={semrushDomain}
              onSemrushTokenChange={setSemrushToken}
              onSemrushDomainChange={setSemrushDomain}
              onConnectSemrush={connectSemrush}
              pylonToken={pylonToken}
              pylonBaseUrl={pylonBaseUrl}
              onPylonTokenChange={setPylonToken}
              onPylonBaseUrlChange={setPylonBaseUrl}
              onConnectPylon={connectPylon}
              onRuleReload={(ruleId) => loadRule(ruleId)}
              onRuleSave={saveRule}
              onRuleRun={runRule}
              onChannelRoutingAddPolicy={addChannelRoutingPolicy}
              onChannelRoutingRemovePolicy={removeChannelRoutingPolicy}
              hubspotDiagnostics={hubspotDiagnostics}
              onReloadHubspotDiagnostics={reloadHubspotDiagnostics}
              onRunHubspotDrift={runHubspotDriftReport}
            />
          );
        })}
      </div>
    </div>
  );
}
