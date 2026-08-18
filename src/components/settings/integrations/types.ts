export type IntegrationStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";
export type SyncHealth = "healthy" | "degraded" | "error" | "missing";
export type CredentialSource = "connection" | "env" | "none";

export type IntegrationSlug =
  | "google-workspace"
  | "hubspot"
  | "slack"
  | "stripe"
  | "mercury"
  | "webflow"
  | "coda"
  | "airtable"
  | "reddit"
  | "google-analytics"
  | "google-search-console"
  | "semrush"
  | "google-ads"
  | "meta-ads"
  | "meta-page"
  | "pylon";

export interface IntegrationItem {
  slug: IntegrationSlug;
  provider: string;
  name: string;
  description: string;
  capabilities: string[];
  authType: "oauth" | "token";
  configured: boolean;
  missingEnv: string[];
  connected: boolean;
  status: IntegrationStatus;
  accountLabel: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  credentialSource: CredentialSource;
  syncHealth: SyncHealth;
  syncHealthReason: string | null;
  lastSnapshotAt: string | null;
  lastSnapshotStatus: "SUCCESS" | "ERROR" | null;
  docId?: string | null;
  baseId?: string | null;
  tableName?: string | null;
  writeEnabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface RuleRuntimeState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export type RuleFieldType =
  | "text"
  | "number"
  | "boolean"
  | "string-list"
  | "enum"
  | "enum-list"
  | "task-status-map"
  | "string-status-map"
  | "stage-checklist-map"
  | "signal-template-map"
  | "status-message-map";

export interface RuleFieldDefinition {
  key: string;
  label: string;
  type: RuleFieldType;
  description?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface RuleDescriptor {
  id: string;
  provider: IntegrationSlug;
  title: string;
  ruleKey: string;
  endpoint: string;
  runAction: "sync" | "capture" | null;
  supportsDryRun: boolean;
  supportsStatusOverride: boolean;
  editorType: "generic" | "thread-capture" | "channel-routing";
  fields: RuleFieldDefinition[];
}

export interface RuleLoadState {
  loading: boolean;
  saving: boolean;
  running: boolean;
  error: string | null;
  message: string | null;
  rule: RuleRuntimeState | null;
}

export interface HubSpotDiagnosticsResponse {
  rule: RuleRuntimeState;
  connection: {
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
  } | null;
  mappingValidation: string[];
  recentReceipts: Array<{
    id: string;
    direction: string;
    dealId: string;
    taskId: string | null;
    createdAt: string;
  }>;
}

export interface HubSpotDriftReport {
  scannedDeals: number;
  scannedTasks: number;
  drifts: Array<{
    dealId: string;
    taskId: string | null;
    kind: string;
    detail: string;
  }>;
  summary: {
    missingLocalTasks: number;
    missingHubSpotDeals: number;
    unmappedDealStages: number;
    unmappedTaskStatuses: number;
    statusMismatches: number;
  };
  generatedAt: string;
}
