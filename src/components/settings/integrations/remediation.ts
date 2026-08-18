import type {
  HubSpotDiagnosticsResponse,
  IntegrationItem,
  RuleLoadState,
} from "@/components/settings/integrations/types";

export interface RemediationStep {
  id: string;
  title: string;
  detail: string;
}

export function credentialSourceLabel(source: IntegrationItem["credentialSource"]): string {
  if (source === "connection") return "Using saved integration connection";
  if (source === "env") return "Using server environment credentials";
  return "No credentials detected";
}

export function buildRemediationSteps(input: {
  item: IntegrationItem;
  rules: RuleLoadState[];
  hubspotDiagnostics?: HubSpotDiagnosticsResponse | null;
}): RemediationStep[] {
  const { item, rules, hubspotDiagnostics } = input;
  const steps: RemediationStep[] = [];

  const rulesWithErrors = rules
    .map((rule) => rule.rule)
    .filter((rule): rule is NonNullable<RuleLoadState["rule"]> => Boolean(rule?.lastError));

  const hubspotBidirectionalEnabled =
    item.slug === "hubspot" &&
    rules.some((state) => state.rule?.key === "hubspot_bidirectional_sync" && state.rule.enabled);

  if (item.authType === "oauth" && !item.configured) {
    steps.push({
      id: "missing-config",
      title: "Provider OAuth app is not configured",
      detail: `Add missing env vars: ${item.missingEnv.join(", ")}. Then reconnect from this page.`,
    });
  }

  if (!item.connected) {
    steps.push({
      id: "disconnected",
      title: "Provider is disconnected",
      detail:
        item.slug === "google-analytics"
          ? "Set GA_PROPERTY_ID plus either GA service-account keys or GA refresh-token OAuth env vars on the server."
          : item.authType === "oauth"
          ? "Use Connect to authorize this provider and re-establish credentials."
          : "Provide a valid API token and doc configuration, then save.",
    });
  }

  if (item.status === "ERROR") {
    steps.push({
      id: "connection-error",
      title: "Connection is in error state",
      detail: "Reconnect to refresh credentials. If this persists, disconnect/reset then reconnect.",
    });
  }

  if (item.connected && (item.syncHealth === "degraded" || item.syncHealth === "error")) {
    steps.push({
      id: "sync-health",
      title: "Sync health needs attention",
      detail: "Run a dry run first, then run now for affected rules to recover freshness.",
    });
  }

  if (rulesWithErrors.length > 0) {
    steps.push({
      id: "rule-errors",
      title: "One or more rules are failing",
      detail:
        "Open highlighted rule editors, save config to clear stale settings, then retry the rule run.",
    });
  }

  if (item.connected && item.metadata) {
    const meta = item.metadata;
    if (meta?.insufficientScopes) {
      const missingScopes = Array.isArray(meta.missingScopes) ? (meta.missingScopes as string[]) : [];
      const missing = missingScopes.length > 0 ? missingScopes.join(", ") : "unknown scopes";
      const missingDealsWrite = missingScopes.includes("crm.objects.deals.write");
      steps.push({
        id: hubspotBidirectionalEnabled && missingDealsWrite ? "hubspot-write-scope" : "insufficient-scopes",
        title:
          hubspotBidirectionalEnabled && missingDealsWrite
            ? "Reconnect to grant deal write access"
            : "Missing required OAuth scopes",
        detail:
          hubspotBidirectionalEnabled && missingDealsWrite
            ? `HubSpot Bidirectional Sync requires deal write scope to update stages. Disconnect and reconnect to grant: ${missing}`
            : `Disconnect and reconnect to re-authorize with the correct permissions. Missing: ${missing}`,
      });
    }
  }

  if (item.slug === "hubspot" && (hubspotDiagnostics?.mappingValidation?.length ?? 0) > 0) {
    steps.push({
      id: "hubspot-mapping",
      title: "HubSpot mapping validation failed",
      detail:
        "Fix Task<->Deal stage mappings in the Bidirectional Sync form and run Drift Report to verify.",
    });
  }

  if (item.slug === "coda" && item.connected && !item.docId) {
    steps.push({
      id: "coda-doc",
      title: "Coda doc is missing",
      detail: "Add a Coda Doc URL or Doc ID and save to enable Coda-backed rules.",
    });
  }

  if (item.slug === "airtable" && item.connected && (!item.baseId || !item.tableName)) {
    steps.push({
      id: "airtable-config",
      title: "Airtable base or table is missing",
      detail: "Add an Airtable Base ID and table name, then save to enable Airtable-backed task execution.",
    });
  }

  if (
    (item.slug === "stripe" || item.slug === "mercury" || item.slug === "reddit") &&
    item.credentialSource !== "connection"
  ) {
    steps.push({
      id: "provider-credentials",
      title: "Diagnostics only provider",
      detail:
        "This provider currently supports connection and telemetry diagnostics. Ensure credentials are valid and reconnect if stale.",
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: "healthy",
      title: "No active remediation required",
      detail: "Connection and rule health look good.",
    });
  }

  return steps;
}
