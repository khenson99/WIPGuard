import { IntegrationProvider, TaskStatus, type Prisma } from "@/generated/prisma/client";
import {
  createAirtableTaskRecord,
  getAirtableTaskConfigForUser,
  isAirtableRecordId,
  updateAirtableTaskRecord,
} from "@/lib/integrations/airtable";
import { prisma } from "@/lib/prisma";
import { sendSlackDirectMessage } from "@/lib/integrations/slack-notifications";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import { fetchJsonWithResilience, fetchWithResilience } from "@/lib/integrations/http-client";
import { getNextColumnOrder } from "@/lib/task-order";

export interface AutomationActionExecutionResult {
  actionType: string;
  status: "executed" | "skipped";
  targetId?: string | null;
  detail?: string | null;
  payload?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function resolveTaskStatus(input: string | null | undefined): TaskStatus {
  switch (input?.toUpperCase()) {
    case "BACKLOG":
      return TaskStatus.BACKLOG;
    case "WORKING_ON_TODAY":
      return TaskStatus.WORKING_ON_TODAY;
    case "ACTIVE":
      return TaskStatus.ACTIVE;
    case "NOT_DONE":
      return TaskStatus.NOT_DONE;
    case "DONE":
      return TaskStatus.DONE;
    case "QUEUED":
    default:
      return TaskStatus.QUEUED;
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeHubSpotTaskStatus(value: unknown): "COMPLETED" | "NOT_STARTED" | "WAITING" {
  const normalized = asString(value)?.toUpperCase();
  if (normalized === "COMPLETED") return "COMPLETED";
  if (normalized === "WAITING") return "WAITING";
  return "NOT_STARTED";
}

function normalizeHubSpotTaskPriority(value: unknown): "LOW" | "MEDIUM" | "HIGH" {
  const normalized = asString(value)?.toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH") {
    return normalized;
  }

  if (normalized === "P0" || normalized === "P1") {
    return "HIGH";
  }

  if (normalized === "P3") {
    return "LOW";
  }

  return "MEDIUM";
}

function normalizeHubSpotTaskType(value: unknown): "TODO" | "CALL" | "EMAIL" {
  const normalized = asString(value)?.toUpperCase();
  if (normalized === "CALL" || normalized === "EMAIL") {
    return normalized;
  }
  return "TODO";
}

const HUBSPOT_ASSOCIATION_TYPES = {
  note: {
    company: 190,
    contact: 202,
    deal: 214,
  },
  task: {
    company: 192,
    contact: 204,
    deal: 216,
  },
} as const;

function buildHubSpotAssociations(
  payload: Record<string, unknown>,
  kind: keyof typeof HUBSPOT_ASSOCIATION_TYPES
) {
  const associationTypeIds = HUBSPOT_ASSOCIATION_TYPES[kind];
  const companyIds = new Set([
    ...asStringArray(payload.companyIds),
    ...asStringArray(payload.companyId ? [payload.companyId] : []),
  ]);
  const contactIds = new Set([
    ...asStringArray(payload.contactIds),
    ...asStringArray(payload.contactId ? [payload.contactId] : []),
  ]);
  const dealIds = new Set([
    ...asStringArray(payload.dealIds),
    ...asStringArray(payload.dealId ? [payload.dealId] : []),
  ]);

  return [
    ...Array.from(companyIds).map((id) => ({
      to: { id },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED" as const,
          associationTypeId: associationTypeIds.company,
        },
      ],
    })),
    ...Array.from(contactIds).map((id) => ({
      to: { id },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED" as const,
          associationTypeId: associationTypeIds.contact,
        },
      ],
    })),
    ...Array.from(dealIds).map((id) => ({
      to: { id },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED" as const,
          associationTypeId: associationTypeIds.deal,
        },
      ],
    })),
  ];
}

async function resolveAutomationActor(runId: string): Promise<string> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: {
      requestedById: true,
      workflow: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  const actorUserId = run?.requestedById ?? run?.workflow.ownerId ?? null;
  if (!actorUserId) {
    throw new Error("Unable to resolve workflow actor");
  }
  return actorUserId;
}

async function createTaskFromAction(runId: string, payload: Record<string, unknown>) {
  const actorUserId = await resolveAutomationActor(runId);
  const airtableConfig = await getAirtableTaskConfigForUser(actorUserId);

  if (airtableConfig) {
    const task = await createAirtableTaskRecord({
      userId: actorUserId,
      runId,
      payload,
    });

    return {
      actionType: "create_task",
      status: "executed" as const,
      targetId: task.id,
      detail: task.title,
    };
  }

  const title = asString(payload.title) ?? "Automation task";
  const notes = asString(payload.notes);
  const priority = asString(payload.priority) ?? "P2";
  const projectId = asString(payload.projectId);
  const responsibleId = asString(payload.responsibleId);
  const status = resolveTaskStatus(asString(payload.status));
  const columnOrder = await getNextColumnOrder(prisma, status);

  const task = await prisma.task.create({
    data: {
      title,
      notes,
      priority: priority === "P0" || priority === "P1" || priority === "P2" || priority === "P3" ? priority : "P2",
      status,
      projectId,
      columnOrder,
      metadata: {
        automation: {
          runId,
          actionType: "create_task",
        },
      } as Prisma.JsonObject,
      ...(responsibleId
        ? {
            responsible: {
              connect: [{ id: responsibleId }],
            },
          }
        : {}),
      accountable: {
        connect: [{ id: actorUserId }],
      },
    },
    select: { id: true, title: true },
  });

  return {
    actionType: "create_task",
    status: "executed" as const,
    targetId: task.id,
    detail: task.title,
  };
}

async function updateTaskFromAction(payload: Record<string, unknown>) {
  const taskId = asString(payload.taskId);
  if (!taskId) {
    return {
      actionType: "update_task",
      status: "skipped" as const,
      detail: "taskId missing",
    };
  }

  const title = asString(payload.title);
  const notes = asString(payload.notes);
  const status = asString(payload.status);
  const runId = asString(payload.runId) ?? asString(payload.workflowRunId);
  const actorUserId = runId ? await resolveAutomationActor(runId).catch(() => null) : null;
  const airtableRecordId = asString(payload.airtableRecordId) ?? taskId;
  if (actorUserId && isAirtableRecordId(airtableRecordId)) {
    const airtableConfig = await getAirtableTaskConfigForUser(actorUserId);
    if (airtableConfig) {
      const task = await updateAirtableTaskRecord({
        userId: actorUserId,
        recordId: airtableRecordId,
        payload,
      });

      return {
        actionType: "update_task",
        status: "executed" as const,
        targetId: task.id,
        detail: task.title,
      };
    }
  }

  const data: Prisma.TaskUpdateInput = {};

  if (title) {
    data.title = title;
  }
  if (notes) {
    data.notes = notes;
  }
  if (status) {
    data.status = resolveTaskStatus(status);
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
    select: { id: true, title: true },
  });

  return {
    actionType: "update_task",
    status: "executed" as const,
    targetId: task.id,
    detail: task.title,
  };
}

async function getGoogleToken(userId: string): Promise<string> {
  return getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.GOOGLE_WORKSPACE,
  });
}

async function createGmailDraftAction(runId: string, payload: Record<string, unknown>) {
  const userId = await resolveAutomationActor(runId);
  const token = await getGoogleToken(userId);
  const to = asStringArray(payload.to);
  const cc = asStringArray(payload.cc);
  const bcc = asStringArray(payload.bcc);
  const subject = asString(payload.subject) ?? "Follow-up";
  const body = asString(payload.body) ?? "";

  if (to.length === 0) {
    return {
      actionType: "create_gmail_draft",
      status: "skipped" as const,
      detail: "No recipients",
    };
  }

  const rawLines = [
    `To: ${to.join(", ")}`,
    ...(cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc.length > 0 ? [`Bcc: ${bcc.join(", ")}`] : []),
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];

  const response = await fetchJsonWithResilience<{ id?: string; message?: { id?: string } }>({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          raw: base64UrlEncode(rawLines.join("\r\n")),
        },
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  return {
    actionType: "create_gmail_draft",
    status: "executed" as const,
    targetId: response.id ?? response.message?.id ?? null,
    detail: subject,
  };
}

async function sendGmailMessageAction(runId: string, payload: Record<string, unknown>) {
  const userId = await resolveAutomationActor(runId);
  const token = await getGoogleToken(userId);
  const to = asStringArray(payload.to);
  const cc = asStringArray(payload.cc);
  const bcc = asStringArray(payload.bcc);
  const subject = asString(payload.subject) ?? "Follow-up";
  const body = asString(payload.body) ?? "";

  if (to.length === 0) {
    return {
      actionType: "send_gmail_message",
      status: "skipped" as const,
      detail: "No recipients",
    };
  }

  const rawLines = [
    `To: ${to.join(", ")}`,
    ...(cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc.length > 0 ? [`Bcc: ${bcc.join(", ")}`] : []),
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];

  const response = await fetchJsonWithResilience<{ id?: string }>({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: base64UrlEncode(rawLines.join("\r\n")),
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  return {
    actionType: "send_gmail_message",
    status: "executed" as const,
    targetId: response.id ?? null,
    detail: subject,
  };
}

async function createCalendarDraftAction(runId: string, payload: Record<string, unknown>) {
  const userId = await resolveAutomationActor(runId);
  const token = await getGoogleToken(userId);
  const calendarId = asString(payload.calendarId) ?? "primary";
  const summary = asString(payload.summary) ?? "Follow-up";
  const description = asString(payload.description) ?? "";
  const attendees = asStringArray(payload.attendees).map((email) => ({ email }));
  const start = asString(payload.start);
  const end = asString(payload.end);

  if (!start || !end) {
    return {
      actionType: "create_calendar_draft",
      status: "skipped" as const,
      detail: "Missing start or end timestamp",
    };
  }

  const response = await fetchJsonWithResilience<{ id?: string; htmlLink?: string }>({
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: start },
        end: { dateTime: end },
        attendees,
        status: "tentative",
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  return {
    actionType: "create_calendar_draft",
    status: "executed" as const,
    targetId: response.id ?? null,
    detail: response.htmlLink ?? summary,
  };
}

async function updateHubSpotAction(runId: string, payload: Record<string, unknown>) {
  const userId = await resolveAutomationActor(runId);
  const token = await getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.HUBSPOT,
  });
  const dealId = asString(payload.dealId);
  const noteBody = asString(payload.noteBody) ?? asString(payload.body);
  const properties = asRecord(payload.properties) ?? null;
  const noteAssociations = buildHubSpotAssociations(payload, "note");

  if (!dealId && (!noteBody || noteAssociations.length === 0)) {
    return {
      actionType: "update_hubspot",
      status: "skipped" as const,
      detail: "dealId or note associations missing",
    };
  }

  if (properties && dealId) {
    await fetchWithResilience({
      url: `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
      init: {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      },
      timeoutMs: 12_000,
      maxAttempts: 3,
    });
  }

  if (noteBody) {
    const note = await fetchJsonWithResilience<{ id?: string }>({
      url: "https://api.hubapi.com/crm/v3/objects/notes",
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            hs_note_body: noteBody,
            hs_timestamp: new Date().toISOString(),
          },
          associations: noteAssociations,
        }),
      },
      timeoutMs: 12_000,
      maxAttempts: 3,
    });

    return {
      actionType: "update_hubspot",
      status: "executed" as const,
      targetId: note.id ?? dealId,
      detail: "HubSpot deal updated",
    };
  }

  return {
    actionType: "update_hubspot",
    status: "executed" as const,
    targetId: dealId,
    detail: "HubSpot deal updated",
  };
}

async function createHubSpotTaskAction(
  runId: string,
  payload: Record<string, unknown>
) {
  const userId = await resolveAutomationActor(runId);
  const token = await getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.HUBSPOT,
  });
  const title = asString(payload.title) ?? "Follow up";
  const body = asString(payload.body) ?? asString(payload.noteBody);
  const dueAt =
    normalizeIsoTimestamp(payload.dueAt) ??
    normalizeIsoTimestamp(payload.timestamp) ??
    normalizeIsoTimestamp(payload.dueDate);
  const reminderAt =
    normalizeIsoTimestamp(payload.reminderAt) ??
    normalizeIsoTimestamp(payload.reminderTimestamp);
  const ownerId = asString(payload.ownerId) ?? asString(payload.hubspotOwnerId);
  const associations = buildHubSpotAssociations(payload, "task");

  if (!dueAt) {
    return {
      actionType: "create_hubspot_task",
      status: "skipped" as const,
      detail: "dueAt missing",
    };
  }

  const response = await fetchJsonWithResilience<{ id?: string }>({
    url: "https://api.hubapi.com/crm/v3/objects/tasks",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          hs_task_subject: title,
          hs_task_body: body ?? "",
          hs_task_status: normalizeHubSpotTaskStatus(payload.status),
          hs_task_priority: normalizeHubSpotTaskPriority(payload.priority),
          hs_task_type: normalizeHubSpotTaskType(payload.taskType),
          hs_timestamp: dueAt,
          ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
          ...(reminderAt ? { hs_task_reminders: [new Date(reminderAt).getTime()] } : {}),
        },
        ...(associations.length > 0 ? { associations } : {}),
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  return {
    actionType: "create_hubspot_task",
    status: "executed" as const,
    targetId: response.id ?? null,
    detail: title,
  };
}

async function createGitHubIssueAction(payload: Record<string, unknown>) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_REPO_OWNER?.trim() ?? "khenson99";
  const repo = process.env.GITHUB_REPO_NAME?.trim() ?? "WIPGuard";

  if (!token) {
    return {
      actionType: "create_github_issue",
      status: "skipped" as const,
      detail: "GITHUB_TOKEN missing",
    };
  }

  const title = asString(payload.title) ?? "Automation issue";
  const body = asString(payload.body) ?? "";
  const labels = asStringArray(payload.labels);

  const issue = await fetchJsonWithResilience<{ id?: number; number?: number; html_url?: string; node_id?: string }>({
    url: `https://api.github.com/repos/${owner}/${repo}/issues`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  const projectId =
    process.env.GITHUB_PROJECT_V2_ID?.trim() ??
    process.env.GITHUB_PROJECT_ID?.trim() ??
    null;

  if (projectId && issue.node_id) {
    await fetchWithResilience({
      url: "https://api.github.com/graphql",
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query:
            "mutation($projectId:ID!, $contentId:ID!) { addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}) { item { id } } }",
          variables: {
            projectId,
            contentId: issue.node_id,
          },
        }),
      },
      timeoutMs: 12_000,
      maxAttempts: 3,
    });
  }

  return {
    actionType: "create_github_issue",
    status: "executed" as const,
    targetId: issue.number ? String(issue.number) : null,
    detail: issue.html_url ?? title,
  };
}

async function postSlackDigestAction(runId: string, payload: Record<string, unknown>) {
  const userId = await resolveAutomationActor(runId);
  const message = asString(payload.message) ?? asString(payload.body) ?? "Automation digest";
  const slackUserId = asString(payload.slackUserId);

  const result = await sendSlackDirectMessage({
    userId,
    message,
    slackUserId: slackUserId ?? undefined,
  });

  return {
    actionType: "post_slack_digest",
    status: "executed" as const,
    targetId: result.messageTs,
    detail: result.channelId,
  };
}

export async function executeAutomationAction(input: {
  runId: string;
  actionType: string;
  actionPayload?: Record<string, unknown> | null;
}): Promise<AutomationActionExecutionResult> {
  const payload = input.actionPayload ?? {};

  switch (input.actionType) {
    case "create_task":
      return createTaskFromAction(input.runId, payload);
    case "update_task":
      return updateTaskFromAction(payload);
    case "create_gmail_draft":
      return createGmailDraftAction(input.runId, payload);
    case "send_gmail_message":
      return sendGmailMessageAction(input.runId, payload);
    case "create_calendar_draft":
      return createCalendarDraftAction(input.runId, payload);
    case "update_hubspot":
      return updateHubSpotAction(input.runId, payload);
    case "create_hubspot_task":
      return createHubSpotTaskAction(input.runId, payload);
    case "create_github_issue":
      return createGitHubIssueAction(payload);
    case "post_slack_digest":
      return postSlackDigestAction(input.runId, payload);
    default:
      return {
        actionType: input.actionType,
        status: "skipped",
        detail: "Unsupported action type",
      };
  }
}
