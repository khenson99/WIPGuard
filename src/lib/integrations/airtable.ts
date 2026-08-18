import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { fetchJsonWithResilience } from "@/lib/integrations/http-client";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function metadataString(metadata: unknown, key: string): string | null {
  const record = asRecord(metadata);
  if (!record) return null;
  return asTrimmedString(record[key]);
}

function airtableErrorMessage(raw: unknown, status: number): string {
  const record = asRecord(raw);
  const nested = asRecord(record?.error);
  const message =
    asTrimmedString(nested?.message) ??
    asTrimmedString(record?.message) ??
    asTrimmedString(record?.error) ??
    asTrimmedString(nested?.type);

  return message
    ? `Airtable request failed (${status}): ${message}`
    : `Airtable request failed (${status})`;
}

function normalizeBearerToken(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim();
}

export interface AirtableConnectionProfile {
  providerAccountId: string;
  accountLabel: string;
  metadata: Record<string, unknown>;
}

export interface AirtableTaskConfig {
  token: string;
  baseId: string;
  tableName: string;
  titleField: string;
  notesField: string;
  statusField: string;
  priorityField: string;
  projectIdField: string;
  responsibleIdField: string;
  automationRunIdField: string;
  automationActionField: string;
}

function resolveFieldName(
  metadata: unknown,
  metadataKey: string,
  envKey: string,
  fallback: string
): string {
  return (
    metadataString(metadata, metadataKey) ??
    asTrimmedString(process.env[envKey]) ??
    fallback
  );
}

export function isAirtableRecordId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^rec[a-zA-Z0-9]{10,}$/.test(value.trim());
}

export async function verifyAirtableConnection(input: {
  token: string;
  baseId: string;
  tableName: string;
}): Promise<AirtableConnectionProfile> {
  const token = normalizeBearerToken(input.token);
  const baseId = input.baseId.trim();
  const tableName = input.tableName.trim();

  if (!token) {
    throw new Error("Airtable token is empty");
  }
  if (!baseId) {
    throw new Error("Airtable baseId is required");
  }
  if (!tableName) {
    throw new Error("Airtable tableName is required");
  }

  const response = await fetch(
    `${AIRTABLE_API_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(
      tableName
    )}?maxRecords=1&cellFormat=json`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(airtableErrorMessage(raw, response.status));
  }

  return {
    providerAccountId: baseId,
    accountLabel: `${baseId} / ${tableName}`,
    metadata: {
      authType: "api_token",
      baseId,
      tableName,
    },
  };
}

export async function getAirtableTaskConfigForUser(
  userId: string
): Promise<AirtableTaskConfig | null> {
  const ownerUserId = resolveIntegrationOwnerUserId(userId);
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId: ownerUserId,
        provider: IntegrationProvider.AIRTABLE,
      },
    },
    select: {
      status: true,
      accessToken: true,
      metadata: true,
    },
  });

  const token =
    connection && connection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? unprotectIntegrationSecret(connection.accessToken)
      : null;
  const metadata = connection?.metadata ?? null;

  const resolvedToken =
    asTrimmedString(token) ?? asTrimmedString(process.env.AIRTABLE_API_TOKEN);
  const baseId =
    metadataString(metadata, "baseId") ?? asTrimmedString(process.env.AIRTABLE_BASE_ID);
  const tableName =
    metadataString(metadata, "tableName") ??
    asTrimmedString(process.env.AIRTABLE_TABLE_NAME);

  if (!resolvedToken || !baseId || !tableName) {
    return null;
  }

  return {
    token: resolvedToken,
    baseId,
    tableName,
    titleField: resolveFieldName(metadata, "titleField", "AIRTABLE_TITLE_FIELD", "Title"),
    notesField: resolveFieldName(metadata, "notesField", "AIRTABLE_NOTES_FIELD", "Notes"),
    statusField: resolveFieldName(metadata, "statusField", "AIRTABLE_STATUS_FIELD", "Status"),
    priorityField: resolveFieldName(
      metadata,
      "priorityField",
      "AIRTABLE_PRIORITY_FIELD",
      "Priority"
    ),
    projectIdField: resolveFieldName(
      metadata,
      "projectIdField",
      "AIRTABLE_PROJECT_ID_FIELD",
      "Project ID"
    ),
    responsibleIdField: resolveFieldName(
      metadata,
      "responsibleIdField",
      "AIRTABLE_RESPONSIBLE_ID_FIELD",
      "Responsible ID"
    ),
    automationRunIdField: resolveFieldName(
      metadata,
      "automationRunIdField",
      "AIRTABLE_AUTOMATION_RUN_ID_FIELD",
      "Automation Run ID"
    ),
    automationActionField: resolveFieldName(
      metadata,
      "automationActionField",
      "AIRTABLE_AUTOMATION_ACTION_FIELD",
      "Automation Action"
    ),
  };
}

function buildTaskFields(input: {
  config: AirtableTaskConfig;
  payload: Record<string, unknown>;
  runId?: string;
  actionType: "create_task" | "update_task";
}): Record<string, unknown> {
  const title = asTrimmedString(input.payload.title);
  const notes = asTrimmedString(input.payload.notes);
  const status = asTrimmedString(input.payload.status)?.toUpperCase() ?? null;
  const priority = asTrimmedString(input.payload.priority)?.toUpperCase() ?? null;
  const projectId = asTrimmedString(input.payload.projectId);
  const responsibleId = asTrimmedString(input.payload.responsibleId);

  const fields: Record<string, unknown> = {};
  if (title) fields[input.config.titleField] = title;
  if (notes) fields[input.config.notesField] = notes;
  if (status) fields[input.config.statusField] = status;
  if (priority) fields[input.config.priorityField] = priority;
  if (projectId) fields[input.config.projectIdField] = projectId;
  if (responsibleId) fields[input.config.responsibleIdField] = responsibleId;
  if (input.runId) fields[input.config.automationRunIdField] = input.runId;
  fields[input.config.automationActionField] = input.actionType;

  return fields;
}

export async function createAirtableTaskRecord(input: {
  userId: string;
  runId: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string; title: string }> {
  const config = await getAirtableTaskConfigForUser(input.userId);
  if (!config) {
    throw new Error("Airtable is not configured for automation task writes");
  }

  const title = asTrimmedString(input.payload.title) ?? "Automation task";
  const response = await fetchJsonWithResilience<{
    records?: Array<{ id?: string }>;
  }>({
    url: `${AIRTABLE_API_BASE}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(
      config.tableName
    )}`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: buildTaskFields({
              config,
              payload: input.payload,
              runId: input.runId,
              actionType: "create_task",
            }),
          },
        ],
        typecast: true,
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  const id = response.records?.[0]?.id ?? null;
  if (!id) {
    throw new Error("Airtable create response did not include a record id");
  }

  return { id, title };
}

export async function updateAirtableTaskRecord(input: {
  userId: string;
  recordId: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string; title: string }> {
  const config = await getAirtableTaskConfigForUser(input.userId);
  if (!config) {
    throw new Error("Airtable is not configured for automation task writes");
  }

  const title = asTrimmedString(input.payload.title) ?? "Airtable task";
  const response = await fetchJsonWithResilience<{ id?: string }>({
    url: `${AIRTABLE_API_BASE}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(
      config.tableName
    )}/${encodeURIComponent(input.recordId.trim())}`,
    init: {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: buildTaskFields({
          config,
          payload: input.payload,
          actionType: "update_task",
        }),
        typecast: true,
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  return {
    id: response.id ?? input.recordId,
    title,
  };
}
