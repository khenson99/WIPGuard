"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ProviderCard } from "@/components/settings/integrations/provider-card";
import { RULE_DESCRIPTORS, descriptorsForProvider } from "@/components/settings/integrations/rule-descriptors";
import { buildRemediationSteps } from "@/components/settings/integrations/remediation";
import type {
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

  const [semrushToken, setSemrushToken] = useState("");
  const [semrushDomain, setSemrushDomain] = useState("");

  const [pylonToken, setPylonToken] = useState("");
  const [pylonBaseUrl, setPylonBaseUrl] = useState("");

  const [ruleStates, setRuleStates] = useState<Record<string, RuleLoadState>>(createInitialRuleStates);
  const [expandedProviderSlug, setExpandedProviderSlug] = useState<string | null>(null);

  const descriptorById = useMemo(
    () => new Map(RULE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor])),
    []
  );

  const loadedProvidersRef = useRef<Set<string>>(new Set());
  const didUserToggleProviderRef = useRef(false);

  const setRuleState = useCallback(
    (ruleId: string, patch: Partial<RuleLoadState>) => {
      setRuleStates((prev) => ({
        ...prev,
        [ruleId]: {
          ...(prev[ruleId] ?? {
            loading: false,
            saving: false,
            running: false,
            error: null,
            message: null,
            rule: null,
          }),
          ...patch,
        },
      }));
    },
    []
  );

  const fetchIntegrations = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, "Could not load integrations"));
      }

      const integrations = (await response.json()) as IntegrationItem[];
      setItems(integrations);

      const coda = integrations.find((item) => item.slug === "coda");
      setCodaDocInput(coda?.docId ?? "");

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

  }, [items, loadRulesForProvider]);

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

  const connectSemrush = useCallback(async () => {
    setLoadingProviderAction("semrush");
    setError(null);

    try {
      const token = semrushToken.trim();
      const domain = semrushDomain.trim();
      const payload: { token?: string; domain?: string } = {};

      if (token) payload.token = token;
      if (domain) payload.domain = domain;

      const response = await fetch("/api/integrations/semrush/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, "Failed to connect SEMrush"));
      }

      const successPayload = (await response.json().catch(() => null)) as
        | { domain?: string | null }
        | null;

      setSemrushToken("");
      if (typeof successPayload?.domain === "string") {
        setSemrushDomain(successPayload.domain);
      }

      await fetchIntegrations();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to connect SEMrush");
    } finally {
      setLoadingProviderAction(null);
    }
  }, [semrushDomain, semrushToken, fetchIntegrations]);

  const connectPylon = useCallback(async () => {
    setLoadingProviderAction("pylon");
    setError(null);

    try {
      const token = pylonToken.trim();
      const baseUrl = pylonBaseUrl.trim();
      const payload: { token?: string; baseUrl?: string } = {};

      if (token) payload.token = token;
      if (baseUrl) payload.baseUrl = baseUrl;

      const response = await fetch("/api/integrations/pylon/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, "Failed to connect Pylon"));
      }

      setPylonToken("");
      await fetchIntegrations();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to connect Pylon");
    } finally {
      setLoadingProviderAction(null);
    }
  }, [fetchIntegrations, pylonBaseUrl, pylonToken]);

  const saveRule = useCallback(
    async (
      ruleId: string,
      payload: {
        enabled?: boolean;
        statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
        config: Record<string, unknown>;
      }
    ) => {
      const descriptor = descriptorById.get(ruleId);
      if (!descriptor) return;

      setRuleState(ruleId, { saving: true, error: null, message: null });

      try {
        const body: Record<string, unknown> = {
          action: "configure",
          enabled: payload.enabled,
          config: payload.config,
        };
        if (descriptor.supportsStatusOverride) {
          body.statusOverride = payload.statusOverride ?? null;
        }

        const response = await fetch(descriptor.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, `Failed to save ${descriptor.title}`));
        }

        const resultPayload = (await response.json().catch(() => null)) as
          | { rule?: unknown }
          | null;

        setRuleState(ruleId, {
          saving: false,
          message: `${descriptor.title} saved.`,
          rule: resultPayload?.rule ? normalizeRule(resultPayload.rule) : ruleStates[ruleId]?.rule ?? null,
        });

        await fetchIntegrations();
      } catch (saveError) {
        setRuleState(ruleId, {
          saving: false,
          error: saveError instanceof Error ? saveError.message : `Failed to save ${descriptor.title}`,
        });
      }
    },
    [descriptorById, fetchIntegrations, ruleStates, setRuleState]
  );

  const runRule = useCallback(
    async (ruleId: string, payload?: { dryRun?: boolean; payload?: Record<string, unknown> }) => {
      const descriptor = descriptorById.get(ruleId);
      if (!descriptor || !descriptor.runAction) {
        return;
      }

      setRuleState(ruleId, { running: true, error: null, message: null });

      try {
        const body: Record<string, unknown> = { action: descriptor.runAction };
        if (descriptor.runAction === "sync") {
          body.dryRun = payload?.dryRun === true;
        }

        const response = await fetch(descriptor.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, `Failed to run ${descriptor.title}`));
        }

        const resultPayload = (await response.json().catch(() => null)) as unknown;

        setRuleState(ruleId, {
          running: false,
          message: summarizeRunResponse(resultPayload),
        });

        await loadRule(ruleId);
        await fetchIntegrations();
      } catch (runError) {
        setRuleState(ruleId, {
          running: false,
          error: runError instanceof Error ? runError.message : `Failed to run ${descriptor.title}`,
        });
      }
    },
    [descriptorById, fetchIntegrations, loadRule, setRuleState]
  );

  const addChannelRoutingPolicy = useCallback(
    async (ruleId: string, policy: Record<string, unknown>) => {
      const descriptor = descriptorById.get(ruleId);
      if (!descriptor) return;

      setRuleState(ruleId, { saving: true, error: null, message: null });

      try {
        const response = await fetch(descriptor.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add_policy", policy }),
        });

        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, "Failed to add policy"));
        }

        const payload = (await response.json().catch(() => null)) as
          | { rule?: unknown }
          | null;

        setRuleState(ruleId, {
          saving: false,
          message: "Routing policy added.",
          rule: payload?.rule ? normalizeRule(payload.rule) : ruleStates[ruleId]?.rule ?? null,
        });
      } catch (policyError) {
        setRuleState(ruleId, {
          saving: false,
          error: policyError instanceof Error ? policyError.message : "Failed to add policy",
        });
      }
    },
    [descriptorById, ruleStates, setRuleState]
  );

  const removeChannelRoutingPolicy = useCallback(
    async (ruleId: string, policyIndex: number) => {
      const descriptor = descriptorById.get(ruleId);
      if (!descriptor) return;

      setRuleState(ruleId, { saving: true, error: null, message: null });

      try {
        const response = await fetch(descriptor.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove_policy", policyIndex }),
        });

        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, "Failed to remove policy"));
        }

        const payload = (await response.json().catch(() => null)) as
          | { rule?: unknown }
          | null;

        setRuleState(ruleId, {
          saving: false,
          message: "Routing policy removed.",
          rule: payload?.rule ? normalizeRule(payload.rule) : ruleStates[ruleId]?.rule ?? null,
        });
      } catch (policyError) {
        setRuleState(ruleId, {
          saving: false,
          error: policyError instanceof Error ? policyError.message : "Failed to remove policy",
        });
      }
    },
    [descriptorById, ruleStates, setRuleState]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Integrations</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Full integration operations live here: connection health, rule configuration, and remediation actions.
        </p>
      </div>

      {banner ? (
        <div className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-sm text-foreground">
          {banner}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--danger)]" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => {
          const providerRuleStates = descriptorsForProvider(item.slug)
            .map((descriptor) => ruleStates[descriptor.id])
            .filter((state): state is RuleLoadState => Boolean(state));
          const attentionCount = providerAttentionCount(item, providerRuleStates);

          const remediationSteps = buildRemediationSteps({
            item,
            rules: providerRuleStates,
          });

          return (
            <ProviderCard
              key={item.slug}
              item={item}
              isExpanded={expandedProviderSlug === item.slug}
              onToggleExpand={() => toggleProviderExpanded(item.slug)}
              attentionCount={attentionCount}
              loadingProviderAction={loadingProviderAction}
              remediationSteps={remediationSteps}
              ruleStates={ruleStates}
              onStartOAuthConnect={startOAuthConnect}
              onDisconnect={disconnect}
              onRefresh={fetchIntegrations}
              codaToken={codaToken}
              codaDocInput={codaDocInput}
              onCodaTokenChange={setCodaToken}
              onCodaDocChange={setCodaDocInput}
              onConnectCoda={connectCoda}
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
            />
          );
        })}
      </div>
    </div>
  );
}
