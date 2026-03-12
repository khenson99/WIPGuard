import { createHash } from "node:crypto";
import {
  AutomationArtifactStatus,
  AutomationRecommendationStatus,
  AutomationSourceDocumentStatus,
} from "@/lib/automations/prisma-enums";
import {
  type AutomationOperatorKey,
  type IntegrationProvider,
  Prisma,
  WorkflowScope,
  WorkflowStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface AutomationSourceDocumentInput {
  provider?: IntegrationProvider | null;
  eventType?: string | null;
  externalId?: string | null;
  documentType: string;
  title?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  textContent?: string | null;
  structuredData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
}

export interface AutomationArtifactInput {
  sourceDocumentId?: string | null;
  artifactType: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  contentJson?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
}

export interface AutomationRecommendationInput {
  artifactId?: string | null;
  recommendationType: string;
  title: string;
  summary: string;
  detail?: string | null;
  actionType: string;
  actionPayload?: Record<string, unknown> | null;
  requiresApproval?: boolean;
  priority?: string | null;
  dueAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
}

export interface AutomationResultEnvelope {
  sourceDocuments?: AutomationSourceDocumentInput[];
  artifacts?: AutomationArtifactInput[];
  recommendations?: AutomationRecommendationInput[];
  summary?: string | null;
  raw?: Record<string, unknown> | null;
}

const SYSTEM_TRANSCRIPT_ARCHIVE_WORKFLOW_NAME = "System Transcript Archive";

function buildSystemTranscriptArchiveWorkflowId(input: {
  ownerId: string;
  provider?: IntegrationProvider | null;
  operatorKey?: AutomationOperatorKey | null;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        ownerId: input.ownerId,
        provider: input.provider ?? null,
        operatorKey: input.operatorKey ?? null,
      })
    )
    .digest("hex")
    .slice(0, 24);

  return `wf_sys_transcript_archive_${digest}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTimestamp(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;

function toNullableJsonValue(
  value: Record<string, unknown> | null | undefined
): NullableJsonInput {
  if (value == null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
}

async function ensureSystemTranscriptArchiveWorkflow(input: {
  ownerId: string;
  provider?: IntegrationProvider | null;
  operatorKey?: AutomationOperatorKey | null;
}): Promise<string> {
  const existing = await prisma.workflowDefinition.findFirst({
    where: {
      ownerId: input.ownerId,
      name: SYSTEM_TRANSCRIPT_ARCHIVE_WORKFLOW_NAME,
      isSystemManaged: true,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return existing.id;
  }

  const workflowId = buildSystemTranscriptArchiveWorkflowId(input);
  const created = await prisma.workflowDefinition.upsert({
    where: { id: workflowId },
    create: {
      id: workflowId,
      ownerId: input.ownerId,
      name: SYSTEM_TRANSCRIPT_ARCHIVE_WORKFLOW_NAME,
      description: "System-managed archive workflow for durable transcript persistence.",
      scope: WorkflowScope.PRIVATE,
      status: WorkflowStatus.ACTIVE,
      providers: input.provider ? [input.provider] : [],
      operatorKey: input.operatorKey ?? null,
      isSystemManaged: true,
      graph: {
        nodes: [],
        edges: [],
      } as Prisma.InputJsonValue,
      lastPublishedAt: new Date(),
    },
    update: {
      providers: input.provider ? [input.provider] : [],
      operatorKey: input.operatorKey ?? null,
      status: WorkflowStatus.ACTIVE,
      isSystemManaged: true,
    },
    select: { id: true },
  });

  return created.id;
}

export function recommendationRequiresApproval(actionType: string): boolean {
  return (
    actionType === "send_gmail_message" ||
    actionType === "create_calendar_draft" ||
    actionType === "adjust_ad_spend"
  );
}

export async function materializeSourceDocumentsFromTrigger(input: {
  workflowId: string;
  runId: string;
  operatorKey?: AutomationOperatorKey | null;
  provider?: IntegrationProvider | null;
  eventType: string;
  payload: Record<string, unknown>;
  eventDedupeKey: string;
}): Promise<number> {
  const documents = Array.isArray(input.payload.documents)
    ? input.payload.documents
    : [];

  const prepared: Prisma.AutomationSourceDocumentUncheckedCreateInput[] = documents
    .map((candidate, index) => {
      const record = asRecord(candidate);
      if (!record) return null;

      const documentType = asString(record.documentType) ?? asString(record.type) ?? "context";
      const title = asString(record.title);
      const textContent =
        asString(record.textContent) ?? asString(record.content) ?? asString(record.text);
      const sourceUrl = asString(record.sourceUrl) ?? asString(record.url);
      const externalId = asString(record.externalId) ?? asString(record.id);
      const mimeType = asString(record.mimeType);

      return {
        workflowId: input.workflowId,
        runId: input.runId,
        operatorKey: input.operatorKey ?? null,
        provider: input.provider ?? null,
        eventType: input.eventType,
        externalId,
        documentType,
        status: AutomationSourceDocumentStatus.READY,
        title,
        mimeType,
        sourceUrl,
        textContent,
        structuredData: toNullableJsonValue(
          asRecord(record.structuredData) ?? asRecord(record.payload)
        ),
        metadata: toNullableJsonValue({
          eventDedupeKey: input.eventDedupeKey,
          documentIndex: index,
          originalShape: record,
        }),
        dedupeKey: `${input.runId}:${input.eventDedupeKey}:document:${index}`,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (prepared.length === 0) {
    const transcript = asString(input.payload.transcript);
    const notes = asString(input.payload.notes);
    if (!transcript && !notes) {
      return 0;
    }

    prepared.push({
      workflowId: input.workflowId,
      runId: input.runId,
      operatorKey: input.operatorKey ?? null,
      provider: input.provider ?? null,
      eventType: input.eventType,
      externalId: asString(input.payload.externalId),
      documentType: transcript ? "transcript" : "notes",
      status: AutomationSourceDocumentStatus.READY,
      title:
        asString(input.payload.title) ??
        (transcript ? "Transcript" : "Context Notes"),
      mimeType: transcript ? "text/plain" : null,
      sourceUrl: asString(input.payload.sourceUrl),
      textContent: transcript ?? notes,
      structuredData: Prisma.DbNull,
      metadata: toNullableJsonValue({
        eventDedupeKey: input.eventDedupeKey,
      }),
      dedupeKey: `${input.runId}:${input.eventDedupeKey}:document:fallback`,
    });
  }

  for (const document of prepared) {
    const dedupeKey = document.dedupeKey;
    if (!dedupeKey) {
      continue;
    }

    await prisma.automationSourceDocument.upsert({
      where: { dedupeKey },
      create: {
        ...document,
        dedupeKey,
      },
      update: {
        title: document.title,
        mimeType: document.mimeType,
        sourceUrl: document.sourceUrl,
        textContent: document.textContent,
        structuredData: document.structuredData,
        metadata: document.metadata,
        status: document.status,
        observedAt: new Date(),
      },
    });
  }

  return prepared.length;
}

export async function persistStandaloneSourceDocument(input: {
  ownerId: string;
  requestedById?: string | null;
  operatorKey?: AutomationOperatorKey | null;
  provider?: IntegrationProvider | null;
  eventType?: string | null;
  externalId?: string | null;
  triggerPayload?: Record<string, unknown> | null;
  documentType: string;
  title?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  textContent?: string | null;
  structuredData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey: string;
}): Promise<{ workflowId: string; runId: string; sourceDocumentId: string }> {
  const workflowId = await ensureSystemTranscriptArchiveWorkflow({
    ownerId: input.ownerId,
    provider: input.provider ?? null,
    operatorKey: input.operatorKey ?? null,
  });

  const runDedupeKey = `${input.dedupeKey}:run`;
  const existingRun = await prisma.workflowRun.findUnique({
    where: { dedupeKey: runDedupeKey },
    select: { id: true },
  });

  const runId = existingRun
    ? existingRun.id
    : (
        await prisma.workflowRun.create({
          data: {
            workflowId,
            requestedById: input.requestedById ?? input.ownerId,
            triggerProvider: input.provider ?? null,
            triggerType: input.eventType ?? "system.transcript.archive",
            triggerId: input.externalId ?? null,
            triggerPayload: toNullableJsonValue(input.triggerPayload ?? null),
            dedupeKey: runDedupeKey,
            status: "SUCCEEDED",
            startedAt: new Date(),
            finishedAt: new Date(),
          },
          select: { id: true },
        })
      ).id;

  const sourceDocument = await prisma.automationSourceDocument.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      workflowId,
      runId,
      operatorKey: input.operatorKey ?? null,
      provider: input.provider ?? null,
      eventType: input.eventType ?? null,
      externalId: input.externalId ?? null,
      documentType: input.documentType,
      status: AutomationSourceDocumentStatus.READY,
      title: input.title ?? null,
      mimeType: input.mimeType ?? null,
      sourceUrl: input.sourceUrl ?? null,
      textContent: input.textContent ?? null,
      structuredData: toNullableJsonValue(input.structuredData),
      metadata: toNullableJsonValue(input.metadata),
      dedupeKey: input.dedupeKey,
    },
    update: {
      title: input.title ?? null,
      mimeType: input.mimeType ?? null,
      sourceUrl: input.sourceUrl ?? null,
      textContent: input.textContent ?? null,
      structuredData: toNullableJsonValue(input.structuredData),
      metadata: toNullableJsonValue(input.metadata),
      status: AutomationSourceDocumentStatus.READY,
      observedAt: new Date(),
    },
    select: {
      id: true,
    },
  });

  return {
    workflowId,
    runId,
    sourceDocumentId: sourceDocument.id,
  };
}

export async function buildRunExecutionContext(runId: string): Promise<Record<string, unknown>> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { createdAt: "asc" },
      },
      automationSourceDocuments: {
        orderBy: { createdAt: "asc" },
      },
      automationArtifacts: {
        orderBy: { createdAt: "asc" },
      },
      automationRecommendations: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) {
    throw new Error("Workflow run not found");
  }

  const state = run.steps.reduce<Record<string, unknown>>((acc, step) => {
    const output = asRecord(step.output);
    if (!output) return acc;
    acc[step.nodeKey] = output;
    return acc;
  }, {});

  type SourceDocument = (typeof run.automationSourceDocuments)[number];
  type Artifact = (typeof run.automationArtifacts)[number];
  type Recommendation = (typeof run.automationRecommendations)[number];
  const legacyRun = run as typeof run & {
    sourceDocuments?: SourceDocument[];
    artifacts?: Artifact[];
    recommendations?: Recommendation[];
  };
  const sourceDocuments: SourceDocument[] = Array.isArray(run.automationSourceDocuments)
    ? run.automationSourceDocuments
    : Array.isArray(legacyRun.sourceDocuments)
      ? legacyRun.sourceDocuments
      : [];
  const artifacts: Artifact[] = Array.isArray(run.automationArtifacts)
    ? run.automationArtifacts
    : Array.isArray(legacyRun.artifacts)
      ? legacyRun.artifacts
      : [];
  const recommendations: Recommendation[] = Array.isArray(run.automationRecommendations)
    ? run.automationRecommendations
    : Array.isArray(legacyRun.recommendations)
      ? legacyRun.recommendations
      : [];

  return {
    trigger: {
      provider: run.triggerProvider,
      eventType: run.triggerType,
      externalId: run.triggerId,
      payload: asRecord(run.triggerPayload) ?? {},
    },
    state,
    sourceDocuments: sourceDocuments.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      title: document.title,
      sourceUrl: document.sourceUrl,
      textContent: document.textContent,
      structuredData: document.structuredData,
      metadata: document.metadata,
      provider: document.provider,
      eventType: document.eventType,
      externalId: document.externalId,
    })),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      title: artifact.title,
      summary: artifact.summary,
      content: artifact.content,
      contentJson: artifact.contentJson,
      metadata: artifact.metadata,
      status: artifact.status,
    })),
    recommendations: recommendations.map((recommendation) => ({
      id: recommendation.id,
      recommendationType: recommendation.recommendationType,
      title: recommendation.title,
      summary: recommendation.summary,
      detail: recommendation.detail,
      actionType: recommendation.actionType,
      actionPayload: recommendation.actionPayload,
      requiresApproval: recommendation.requiresApproval,
      status: recommendation.status,
      priority: recommendation.priority,
      dueAt: recommendation.dueAt?.toISOString() ?? null,
    })),
  };
}

export async function persistAutomationEnvelope(input: {
  workflowId: string;
  runId: string;
  aiJobId?: string | null;
  operatorKey?: AutomationOperatorKey | null;
  createdByNodeKey?: string | null;
  requestedById?: string | null;
  envelope: AutomationResultEnvelope;
}): Promise<{
  artifactIds: string[];
  recommendationIds: string[];
}> {
  const artifactIds: string[] = [];
  const recommendationIds: string[] = [];

  if (Array.isArray(input.envelope.sourceDocuments)) {
    for (const [index, document] of input.envelope.sourceDocuments.entries()) {
      await prisma.automationSourceDocument.upsert({
        where: {
          dedupeKey:
            document.dedupeKey ?? `${input.runId}:${input.createdByNodeKey ?? "ai"}:source:${index}`,
        },
        create: {
          workflowId: input.workflowId,
          runId: input.runId,
          operatorKey: input.operatorKey ?? null,
          provider: document.provider ?? null,
          eventType: document.eventType ?? null,
          externalId: document.externalId ?? null,
          documentType: document.documentType,
          status: AutomationSourceDocumentStatus.READY,
          title: document.title ?? null,
          mimeType: document.mimeType ?? null,
          sourceUrl: document.sourceUrl ?? null,
          textContent: document.textContent ?? null,
          structuredData: toNullableJsonValue(document.structuredData),
          metadata: toNullableJsonValue(document.metadata),
          dedupeKey:
            document.dedupeKey ?? `${input.runId}:${input.createdByNodeKey ?? "ai"}:source:${index}`,
        },
        update: {
          title: document.title ?? null,
          mimeType: document.mimeType ?? null,
          sourceUrl: document.sourceUrl ?? null,
          textContent: document.textContent ?? null,
          structuredData: toNullableJsonValue(document.structuredData),
          metadata: toNullableJsonValue(document.metadata),
          status: AutomationSourceDocumentStatus.READY,
          observedAt: new Date(),
        },
      });
    }
  }

  const createdArtifacts: string[] = [];

  if (Array.isArray(input.envelope.artifacts)) {
    for (const [index, artifact] of input.envelope.artifacts.entries()) {
      const record = await prisma.automationArtifact.upsert({
        where: {
          dedupeKey:
            artifact.dedupeKey ?? `${input.runId}:${input.createdByNodeKey ?? "ai"}:artifact:${index}`,
        },
        create: {
          workflowId: input.workflowId,
          runId: input.runId,
          aiJobId: input.aiJobId ?? null,
          operatorKey: input.operatorKey ?? null,
          sourceDocumentId: artifact.sourceDocumentId ?? null,
          artifactType: artifact.artifactType,
          status: AutomationArtifactStatus.READY,
          title: artifact.title,
          summary: artifact.summary ?? null,
          content: artifact.content ?? null,
          contentJson: toNullableJsonValue(artifact.contentJson),
          metadata: toNullableJsonValue(artifact.metadata),
          createdByNodeKey: input.createdByNodeKey ?? null,
          dedupeKey:
            artifact.dedupeKey ?? `${input.runId}:${input.createdByNodeKey ?? "ai"}:artifact:${index}`,
        },
        update: {
          status: AutomationArtifactStatus.READY,
          title: artifact.title,
          summary: artifact.summary ?? null,
          content: artifact.content ?? null,
          contentJson: toNullableJsonValue(artifact.contentJson),
          metadata: toNullableJsonValue(artifact.metadata),
          createdByNodeKey: input.createdByNodeKey ?? null,
        },
        select: { id: true },
      });

      createdArtifacts.push(record.id);
      artifactIds.push(record.id);
    }
  }

  if (Array.isArray(input.envelope.recommendations)) {
    for (const [index, recommendation] of input.envelope.recommendations.entries()) {
      const requiresApproval =
        recommendation.requiresApproval ??
        recommendationRequiresApproval(recommendation.actionType);
      const status = requiresApproval
        ? AutomationRecommendationStatus.PENDING_APPROVAL
        : AutomationRecommendationStatus.APPROVED;

      const record = await prisma.automationRecommendation.upsert({
        where: {
          dedupeKey:
            recommendation.dedupeKey ??
            `${input.runId}:${input.createdByNodeKey ?? "ai"}:recommendation:${index}`,
        },
        create: {
          workflowId: input.workflowId,
          runId: input.runId,
          aiJobId: input.aiJobId ?? null,
          operatorKey: input.operatorKey ?? null,
          artifactId:
            recommendation.artifactId ??
            createdArtifacts[Math.min(index, Math.max(createdArtifacts.length - 1, 0))] ??
            null,
          recommendationType: recommendation.recommendationType,
          title: recommendation.title,
          summary: recommendation.summary,
          detail: recommendation.detail ?? null,
          actionType: recommendation.actionType,
          actionPayload: toNullableJsonValue(recommendation.actionPayload),
          requiresApproval,
          status,
          priority: recommendation.priority ?? null,
          requestedById: input.requestedById ?? null,
          approvedAt: requiresApproval ? null : new Date(),
          dueAt: normalizeTimestamp(recommendation.dueAt),
          metadata: toNullableJsonValue(recommendation.metadata),
          dedupeKey:
            recommendation.dedupeKey ??
            `${input.runId}:${input.createdByNodeKey ?? "ai"}:recommendation:${index}`,
        },
        update: {
          title: recommendation.title,
          summary: recommendation.summary,
          detail: recommendation.detail ?? null,
          actionPayload: toNullableJsonValue(recommendation.actionPayload),
          requiresApproval,
          status,
          priority: recommendation.priority ?? null,
          dueAt: normalizeTimestamp(recommendation.dueAt),
          metadata: toNullableJsonValue(recommendation.metadata),
          approvedAt: requiresApproval ? null : new Date(),
        },
        select: { id: true },
      });

      recommendationIds.push(record.id);
    }
  }

  return {
    artifactIds,
    recommendationIds,
  };
}
