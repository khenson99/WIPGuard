import {
  AutomationAiJobStatus,
} from "@/lib/automations/prisma-enums";
import {
  IntegrationProvider,
  Prisma,
  WorkflowApprovalStatus,
  WorkflowEventStatus,
  WorkflowRunStatus,
  WorkflowStepStatus,
} from "@/generated/prisma/client";
import { executeAutomationAction } from "@/lib/automations/actions";
import { prisma } from "@/lib/prisma";
import {
  evaluateConditionExpression,
  normalizeWorkflowGraph,
  renderTemplatedString,
  type WorkflowGraph,
  type WorkflowGraphNode,
} from "@/lib/automations/graph";
import {
  buildAutomationAiResponseRequest,
  createAutomationOpenAiResponse,
  extractAutomationAiOutputText,
  isTerminalAutomationAiStatus,
  parseAutomationAiResponseEnvelope,
  retrieveAutomationOpenAiResponse,
  unwrapAutomationOpenAiWebhookEvent,
} from "@/lib/automations/openai";
import { executeApprovedRecommendationsForRun } from "@/lib/automations/recommendations";
import {
  isRetiredAutomationActionType,
  RETIRED_AUTOMATION_ACTION_MESSAGE,
} from "@/lib/automations/retired-actions";
import { normalizeWorkflowRolePolicy } from "@/lib/automations/service";
import {
  buildRunExecutionContext,
  materializeSourceDocumentsFromTrigger,
  type AutomationResultEnvelope,
  persistAutomationEnvelope,
} from "@/lib/automations/store";
import { getAppRole } from "@/lib/permissions";

interface TriggerEnvelope {
  provider: IntegrationProvider;
  eventType: string;
  externalId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toNullableJsonValue(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value == null) {
    return Prisma.DbNull;
  }
  return value as unknown as Prisma.InputJsonValue;
}

function resolvePath(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = context;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function renderMaybeTemplate(value: unknown, context: Record<string, unknown>): string | null {
  if (typeof value !== "string") return null;
  const rendered = renderTemplatedString(value, context).trim();
  return rendered.length > 0 ? rendered : null;
}

interface ActionNodeExecutionResult {
  output: Record<string, unknown>;
  stepStatus?: WorkflowStepStatus;
  runStatus?: WorkflowRunStatus;
}

function asStringArray(value: unknown, context: Record<string, unknown>): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? renderTemplatedString(item, context).trim() : ""
      )
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => renderTemplatedString(item, context).trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeNumericInput(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.trunc(value);
}

function renderConfigValue(
  value: unknown,
  context: Record<string, unknown>
): unknown {
  if (typeof value === "string") {
    return renderTemplatedString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderConfigValue(item, context));
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [
      key,
      renderConfigValue(entryValue, context),
    ])
  );
}

async function queueAutomationAiJobForNode(input: {
  workflowId: string;
  runId: string;
  stepId: string;
  node: WorkflowGraphNode;
  context: Record<string, unknown>;
}) {
  const config = asRecord(input.node.config) ?? {};
  const actionType =
    typeof config.actionType === "string" ? config.actionType : "ai_generate";

  const run = await prisma.workflowRun.findUnique({
    where: { id: input.runId },
    include: {
      workflow: {
        select: {
          operatorKey: true,
        },
      },
    },
  });

  if (!run) {
    throw new Error("Workflow run not found");
  }

  const { request, parsedToolDefinitions } = buildAutomationAiResponseRequest({
    nodeKey: input.node.key,
    nodeLabel: input.node.label,
    actionType,
    config,
    context: input.context,
    metadata: {
      workflowId: input.workflowId,
      runId: input.runId,
      stepId: input.stepId,
      nodeKey: input.node.key,
      operatorKey: run.workflow.operatorKey ?? "",
    },
  });

  const dedupeKey = `${input.runId}:${input.node.key}:ai`;
  const job = await prisma.automationAiJob.upsert({
    where: { dedupeKey },
    create: {
      workflowId: input.workflowId,
      runId: input.runId,
      stepId: input.stepId,
      operatorKey: run.workflow.operatorKey ?? null,
      nodeKey: input.node.key,
      jobType: actionType,
      status: AutomationAiJobStatus.QUEUED,
      provider: "openai",
      model: typeof request.model === "string" ? request.model : "gpt-4.1-mini",
      promptVersion:
        typeof config.promptVersion === "string" ? config.promptVersion : "v1",
      requestPayload: toInputJsonValue(request),
      dedupeKey,
      metadata: toInputJsonValue({
        nodeLabel: input.node.label,
        parsedToolDefinitions,
      }),
    },
    update: {
      stepId: input.stepId,
      status: AutomationAiJobStatus.QUEUED,
      model: typeof request.model === "string" ? request.model : "gpt-4.1-mini",
      promptVersion:
        typeof config.promptVersion === "string" ? config.promptVersion : "v1",
      requestPayload: toInputJsonValue(request),
      responseId: null,
      responseStatus: null,
      responsePayload: Prisma.DbNull,
      outputText: null,
      parsedOutput: Prisma.DbNull,
      lastError: null,
      nextAttemptAt: new Date(),
      metadata: toInputJsonValue({
        nodeLabel: input.node.label,
        parsedToolDefinitions,
      }),
    },
    select: { id: true, model: true },
  });

  return {
    output: {
      actionType,
      aiJobId: job.id,
      model: job.model,
      waitingExternal: true,
    },
    stepStatus: WorkflowStepStatus.WAITING_EXTERNAL,
    runStatus: WorkflowRunStatus.WAITING_EXTERNAL,
  } satisfies ActionNodeExecutionResult;
}

async function executeActionNode(input: {
  workflowId: string;
  runId: string;
  stepId: string;
  node: WorkflowGraphNode;
  context: Record<string, unknown>;
}): Promise<ActionNodeExecutionResult> {
  const config = asRecord(input.node.config) ?? {};
  const actionType = typeof config.actionType === "string" ? config.actionType : "noop";

  if (actionType === "slack_notify") {
    const message =
      renderMaybeTemplate(config.messageTemplate, input.context) ||
      `Automation notification from ${input.node.label}`;

    await prisma.outboxEvent.create({
      data: {
        eventType: "automation.slack.notify",
        aggregateType: "workflow_run",
        aggregateId: input.runId,
        payload: {
          message,
          nodeKey: input.node.key,
        },
        idempotencyKey: `automation:slack:${input.runId}:${input.node.key}`,
      },
    });

    return { output: { actionType, queued: true } };
  }

  if (isRetiredAutomationActionType(actionType)) {
    return {
      output: {
        actionType,
        skipped: true,
        reason: "retired_workflow_action",
        detail: RETIRED_AUTOMATION_ACTION_MESSAGE,
      },
    };
  }

  if (
    actionType === "ai_extract" ||
    actionType === "ai_analyze" ||
    actionType === "ai_generate"
  ) {
    return queueAutomationAiJobForNode(input);
  }

  if (actionType === "execute_recommendation") {
    const recommendationId =
      renderMaybeTemplate(config.recommendationId, input.context) ||
      (typeof config.recommendationIdPath === "string"
        ? String(resolvePath(config.recommendationIdPath, input.context) ?? "")
        : "");
    const recommendationIds = [
      ...asStringArray(config.recommendationIds, input.context),
      ...(recommendationId ? [recommendationId] : []),
    ];
    const actionTypes = asStringArray(config.actionTypes, input.context);
    const limit = normalizeNumericInput(config.limit, 50);

    const result = await executeApprovedRecommendationsForRun({
      runId: input.runId,
      recommendationIds,
      actionTypes,
      limit,
    });

    return {
      output: {
        actionType,
        ...result,
      },
    };
  }

  if (
    actionType === "create_gmail_draft" ||
    actionType === "send_gmail_message" ||
    actionType === "create_calendar_draft" ||
    actionType === "update_hubspot" ||
    actionType === "create_github_issue" ||
    actionType === "post_slack_digest"
  ) {
    const payloadSource = asRecord(config.payload) ?? config;
    const payload = asRecord(renderConfigValue(payloadSource, input.context));
    const result = await executeAutomationAction({
      runId: input.runId,
      actionType,
      actionPayload: payload,
    });

    return {
      output: {
        actionType,
        status: result.status,
        targetId: result.targetId,
        detail: result.detail,
      },
    };
  }

  return { output: { actionType: "noop", skipped: true } };
}

function sortOutgoingEdges(graph: WorkflowGraph, sourceNodeKey: string) {
  return graph.edges
    .filter((edge) => edge.source === sourceNodeKey)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

function selectOutgoingTargets(input: {
  graph: WorkflowGraph;
  node: WorkflowGraphNode;
  nodeOutput: Record<string, unknown>;
  context: Record<string, unknown>;
  decisionLabel?: string;
}): string[] {
  const outgoing = sortOutgoingEdges(input.graph, input.node.key);
  if (outgoing.length === 0) return [];

  if (input.node.type === "CONDITION") {
    const passed = Boolean(input.nodeOutput.passed);
    const label = passed ? "true" : "false";
    const filtered = outgoing.filter((edge) => {
      if (!edge.conditionLabel) return false;
      return edge.conditionLabel.toLowerCase() === label;
    });
    if (filtered.length > 0) {
      return filtered.map((edge) => edge.target);
    }
    return passed ? outgoing.map((edge) => edge.target) : [];
  }

  if (input.node.type === "APPROVAL" && input.decisionLabel) {
    const decision = input.decisionLabel.toLowerCase();
    const matched = outgoing.filter((edge) => {
      if (!edge.conditionLabel) return false;
      return edge.conditionLabel.toLowerCase() === decision;
    });
    if (matched.length > 0) return matched.map((edge) => edge.target);
    return outgoing.map((edge) => edge.target);
  }

  const conditional = outgoing.filter((edge) => edge.conditionExpr);
  if (conditional.length > 0) {
    return conditional
      .filter((edge) => evaluateConditionExpression(edge.conditionExpr, input.context))
      .map((edge) => edge.target);
  }

  return outgoing.map((edge) => edge.target);
}

async function executeRunGraph(input: {
  runId: string;
  workflowId: string;
  graph: WorkflowGraph;
  initialNodeKeys: string[];
  context: Record<string, unknown>;
  decisionLabel?: string;
}): Promise<{ status: WorkflowRunStatus; error?: string | null }> {
  const nodeByKey = new Map(input.graph.nodes.map((node) => [node.key, node]));
  const queue = [...input.initialNodeKeys];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey) continue;

    const node = nodeByKey.get(currentKey);
    if (!node) {
      return { status: WorkflowRunStatus.FAILED, error: `Node not found: ${currentKey}` };
    }

    if (visited.has(node.key) && node.type !== "ACTION") {
      continue;
    }
    visited.add(node.key);

    const step = await prisma.workflowRunStep.create({
      data: {
        runId: input.runId,
        nodeKey: node.key,
        nodeType: node.type,
        status: WorkflowStepStatus.RUNNING,
        attempt: 1,
        idempotencyKey: `${input.runId}:${node.key}`,
        input: input.context as Prisma.JsonObject,
        startedAt: new Date(),
      },
    });

    try {
      let output: Record<string, unknown> = {};
      let status: WorkflowStepStatus = WorkflowStepStatus.SUCCEEDED;

      if (node.type === "TRIGGER") {
        output = { accepted: true };
      } else if (node.type === "CONDITION") {
        const config = asRecord(node.config) ?? {};
        const expr = asRecord(config.expression) ?? asRecord(config.conditionExpr) ?? null;
        const passed = evaluateConditionExpression(expr, input.context);
        output = { passed };
      } else if (node.type === "ACTION") {
        const result = await executeActionNode({
          workflowId: input.workflowId,
          runId: input.runId,
          stepId: step.id,
          node,
          context: input.context,
        });
        output = result.output;
        status = result.stepStatus ?? status;

        if (result.runStatus === WorkflowRunStatus.WAITING_EXTERNAL) {
          await prisma.workflowRunStep.update({
            where: { id: step.id },
            data: {
              status,
              output: output as Prisma.JsonObject,
              finishedAt: new Date(),
            },
          });

          await prisma.workflowRun.update({
            where: { id: input.runId },
            data: {
              status: WorkflowRunStatus.WAITING_EXTERNAL,
              error: null,
            },
          });

          return { status: WorkflowRunStatus.WAITING_EXTERNAL };
        }
      } else if (node.type === "DELAY") {
        const config = asRecord(node.config) ?? {};
        const waitSeconds =
          typeof config.waitSeconds === "number" && Number.isFinite(config.waitSeconds)
            ? Math.max(0, Math.trunc(config.waitSeconds))
            : 0;
        output = {
          waitSeconds,
          delayedUntil: new Date(Date.now() + waitSeconds * 1000).toISOString(),
        };
      } else if (node.type === "APPROVAL") {
        const config = asRecord(node.config) ?? {};
        const timeoutMinutes =
          typeof config.timeoutMinutes === "number" && Number.isFinite(config.timeoutMinutes)
            ? Math.max(1, Math.min(24 * 60, Math.trunc(config.timeoutMinutes)))
            : 60;

        const approverId = typeof config.approverId === "string" ? config.approverId : null;

        await prisma.workflowApproval.create({
          data: {
            runId: input.runId,
            stepId: step.id,
            nodeKey: node.key,
            requestedById: null,
            approverId,
            timeoutAt: new Date(Date.now() + timeoutMinutes * 60 * 1000),
            status: WorkflowApprovalStatus.PENDING,
          },
        });

        status = WorkflowStepStatus.WAITING_APPROVAL;

        await prisma.workflowRunStep.update({
          where: { id: step.id },
          data: {
            status,
            output: { waitingApproval: true } as Prisma.JsonObject,
            finishedAt: new Date(),
          },
        });

        await prisma.workflowRun.update({
          where: { id: input.runId },
          data: {
            status: WorkflowRunStatus.WAITING_APPROVAL,
          },
        });

        return { status: WorkflowRunStatus.WAITING_APPROVAL };
      }

      await prisma.workflowRunStep.update({
        where: { id: step.id },
        data: {
          status,
          output: output as Prisma.JsonObject,
          finishedAt: new Date(),
        },
      });

      input.context.state = {
        ...(asRecord(input.context.state) ?? {}),
        [node.key]: output,
      };

      const next = selectOutgoingTargets({
        graph: input.graph,
        node,
        nodeOutput: output,
        context: input.context,
        decisionLabel: input.decisionLabel,
      });

      for (const target of next) {
        queue.push(target);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow step failed";
      await prisma.workflowRunStep.update({
        where: { id: step.id },
        data: {
          status: WorkflowStepStatus.FAILED,
          error: message,
          finishedAt: new Date(),
        },
      });
      return { status: WorkflowRunStatus.FAILED, error: message };
    }
  }

  return { status: WorkflowRunStatus.SUCCEEDED };
}

async function getWorkflowGraph(workflowId: string): Promise<WorkflowGraph> {
  const workflow = await prisma.workflowDefinition.findUnique({
    where: { id: workflowId },
    select: { graph: true },
  });
  if (!workflow) {
    throw new Error("Workflow not found");
  }
  return normalizeWorkflowGraph(workflow.graph);
}

async function finalizeWorkflowRun(input: {
  runId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  error?: string | null;
}) {
  await prisma.workflowRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      error: input.error ?? null,
      finishedAt:
        input.status === WorkflowRunStatus.WAITING_APPROVAL ||
        input.status === WorkflowRunStatus.WAITING_EXTERNAL
          ? null
          : new Date(),
    },
  });

  await prisma.workflowDefinition.update({
    where: { id: input.workflowId },
    data: {
      lastRunAt: new Date(),
      lastError: input.error ?? null,
    },
  });
}

async function resumeWorkflowRunAfterNode(input: {
  runId: string;
  workflowId: string;
  nodeKey: string;
}): Promise<void> {
  const graph = await getWorkflowGraph(input.workflowId);
  const node = graph.nodes.find((candidate) => candidate.key === input.nodeKey);
  if (!node) {
    throw new Error(`Workflow node not found: ${input.nodeKey}`);
  }

  const step = await prisma.workflowRunStep.findFirst({
    where: {
      runId: input.runId,
      nodeKey: input.nodeKey,
    },
    orderBy: { createdAt: "desc" },
    select: {
      output: true,
    },
  });

  const context = await buildRunExecutionContext(input.runId);
  const nodeOutput = asRecord(step?.output) ?? {};
  const nextNodes = selectOutgoingTargets({
    graph,
    node,
    nodeOutput,
    context,
  });

  if (nextNodes.length === 0) {
    await finalizeWorkflowRun({
      runId: input.runId,
      workflowId: input.workflowId,
      status: WorkflowRunStatus.SUCCEEDED,
    });
    return;
  }

  await prisma.workflowRun.update({
    where: { id: input.runId },
    data: {
      status: WorkflowRunStatus.RUNNING,
      error: null,
    },
  });

  const result = await executeRunGraph({
    runId: input.runId,
    workflowId: input.workflowId,
    graph,
    initialNodeKeys: nextNodes,
    context,
  });

  await finalizeWorkflowRun({
    runId: input.runId,
    workflowId: input.workflowId,
    status: result.status,
    error: result.error ?? null,
  });
}

export async function executeWorkflowRun(runId: string): Promise<void> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });
  if (!run) throw new Error("Run not found");

  const graph = normalizeWorkflowGraph(run.workflow.graph);
  const triggerNode = graph.nodes.find((node) => node.type === "TRIGGER");
  if (!triggerNode) {
    throw new Error("Workflow graph has no trigger node");
  }

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: WorkflowRunStatus.RUNNING,
      startedAt: run.startedAt ?? new Date(),
      error: null,
    },
  });

  const context = await buildRunExecutionContext(run.id);

  const result = await executeRunGraph({
    runId: run.id,
    workflowId: run.workflowId,
    graph,
    initialNodeKeys: [triggerNode.key],
    context,
  });

  await finalizeWorkflowRun({
    runId: run.id,
    workflowId: run.workflowId,
    status: result.status,
    error: result.error ?? null,
  });
}

function matchesTrigger(triggerConfig: Record<string, unknown>, event: TriggerEnvelope): boolean {
  const configuredProvider =
    typeof triggerConfig.provider === "string"
      ? triggerConfig.provider.trim().toUpperCase()
      : null;
  const configuredEventType =
    typeof triggerConfig.eventType === "string" ? triggerConfig.eventType.trim() : null;

  if (configuredProvider && configuredProvider !== event.provider) {
    return false;
  }

  if (configuredEventType && configuredEventType !== event.eventType) {
    return false;
  }

  return true;
}

async function triggerMatchingWorkflows(event: TriggerEnvelope): Promise<number> {
  const workflows = await prisma.workflowDefinition.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ providers: { has: event.provider } }, { providers: { isEmpty: true } }],
    },
  });

  let startedRuns = 0;

  for (const workflow of workflows) {
    const graph = normalizeWorkflowGraph(workflow.graph);
    const triggerNode = graph.nodes.find((node) => node.type === "TRIGGER");
    if (!triggerNode) continue;

    const triggerConfig = asRecord(triggerNode.config) ?? {};
    if (!matchesTrigger(triggerConfig, event)) {
      continue;
    }

    const dedupeKey = `${workflow.id}:${event.idempotencyKey}`;
    const existing = await prisma.workflowRun.findUnique({ where: { dedupeKey } });
    if (existing) {
      continue;
    }

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        triggerProvider: event.provider,
        triggerType: event.eventType,
        triggerId: event.externalId ?? null,
        triggerPayload: event.payload as Prisma.InputJsonValue,
        dedupeKey,
        status: WorkflowRunStatus.QUEUED,
      },
      select: { id: true },
    });

    await materializeSourceDocumentsFromTrigger({
      workflowId: workflow.id,
      runId: run.id,
      operatorKey: workflow.operatorKey,
      provider: event.provider,
      eventType: event.eventType,
      payload: event.payload,
      eventDedupeKey: event.idempotencyKey,
    });

    startedRuns += 1;
    await executeWorkflowRun(run.id);
  }

  return startedRuns;
}

function nextRetryDate(attempt: number): Date {
  const seconds = Math.min(300, 15 * attempt * attempt);
  return new Date(Date.now() + seconds * 1000);
}

async function failAutomationAiJob(input: {
  jobId: string;
  workflowId: string;
  runId: string;
  stepId: string | null;
  message: string;
  canceled?: boolean;
}) {
  await prisma.automationAiJob.update({
    where: { id: input.jobId },
    data: {
      status: input.canceled ? AutomationAiJobStatus.CANCELED : AutomationAiJobStatus.FAILED,
      lastError: input.message,
      completedAt: new Date(),
      nextAttemptAt: nextRetryDate(99),
    },
  });

  if (input.stepId) {
    await prisma.workflowRunStep.update({
      where: { id: input.stepId },
      data: {
        status: WorkflowStepStatus.FAILED,
        error: input.message,
        finishedAt: new Date(),
      },
    });
  }

  await finalizeWorkflowRun({
    runId: input.runId,
    workflowId: input.workflowId,
    status: input.canceled ? WorkflowRunStatus.CANCELED : WorkflowRunStatus.FAILED,
    error: input.message,
  });
}

function uniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function toBoundedScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveTranscriptSourceDocumentId(triggerPayload: unknown): string | null {
  const payload = asRecord(triggerPayload);
  const directId =
    typeof payload?.sourceDocumentId === "string" ? payload.sourceDocumentId.trim() : "";
  if (directId) {
    return directId;
  }

  const documents = Array.isArray(payload?.documents) ? payload.documents : [];
  for (const document of documents) {
    const record = asRecord(document);
    const metadata = asRecord(record?.metadata);
    const archivedId =
      typeof metadata?.archivedSourceDocumentId === "string"
        ? metadata.archivedSourceDocumentId.trim()
        : "";
    if (archivedId) {
      return archivedId;
    }
  }

  return null;
}

function normalizeOutcomeConfidence(value: unknown): "low" | "medium" | "high" | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return null;
}

function normalizeDemoAnalysisEnvelope(input: {
  triggerType: string | null | undefined;
  triggerPayload: unknown;
  envelope: AutomationResultEnvelope;
}): AutomationResultEnvelope {
  if (input.triggerType !== "google-workspace.meet.transcript_ready") {
    return input.envelope;
  }

  const sourceDocumentId = resolveTranscriptSourceDocumentId(input.triggerPayload);
  const artifacts = Array.isArray(input.envelope.artifacts)
    ? [...input.envelope.artifacts]
    : [];
  const scorecardIndex = artifacts.findIndex(
    (artifact) => artifact.artifactType === "demo_quality_scorecard"
  );
  const existingScorecard = scorecardIndex >= 0 ? artifacts[scorecardIndex] : null;
  const scorecardJson = asRecord(existingScorecard?.contentJson);
  const normalizedScorecardJson = {
    overallScore: toBoundedScore(scorecardJson?.overallScore),
    strengths: uniqueStringList(scorecardJson?.strengths),
    gaps: uniqueStringList(scorecardJson?.gaps),
    customerSignals: uniqueStringList(scorecardJson?.customerSignals),
    nextSteps: uniqueStringList(scorecardJson?.nextSteps),
    outcomeConfidence: normalizeOutcomeConfidence(scorecardJson?.outcomeConfidence),
  } satisfies Record<string, unknown>;
  const scorecardSummaryCandidates = [
    existingScorecard?.summary ?? null,
    typeof scorecardJson?.summary === "string" ? scorecardJson.summary.trim() : null,
    typeof existingScorecard?.content === "string" ? existingScorecard.content.trim() : null,
    typeof input.envelope.summary === "string" ? input.envelope.summary.trim() : null,
  ];
  const scorecardSummary =
    scorecardSummaryCandidates.find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0
    ) ?? "Demo analysis captured from transcript.";
  const scorecardArtifact = {
    ...(existingScorecard ?? {}),
    artifactType: "demo_quality_scorecard",
    title: existingScorecard?.title?.trim() || "Demo Quality Scorecard",
    summary: scorecardSummary,
    contentJson: normalizedScorecardJson,
    sourceDocumentId: existingScorecard?.sourceDocumentId ?? sourceDocumentId,
  };

  if (scorecardIndex >= 0) {
    artifacts[scorecardIndex] = scorecardArtifact;
  } else {
    artifacts.unshift(scorecardArtifact);
  }

  const upsertArtifact = (
    artifactType: "demo_coaching_memo" | "deal_next_step_memo",
    defaults: { title: string; content: string }
  ) => {
    const index = artifacts.findIndex((artifact) => artifact.artifactType === artifactType);
    if (index >= 0) {
      artifacts[index] = {
        ...artifacts[index],
        title: artifacts[index].title?.trim() || defaults.title,
        content: artifacts[index].content?.trim() || defaults.content,
        sourceDocumentId: artifacts[index].sourceDocumentId ?? sourceDocumentId,
      };
      return;
    }

    artifacts.push({
      artifactType,
      title: defaults.title,
      content: defaults.content,
      sourceDocumentId,
    });
  };

  upsertArtifact("demo_coaching_memo", {
    title: "Demo Coaching Memo",
    content: scorecardSummary,
  });
  upsertArtifact("deal_next_step_memo", {
    title: "Deal Next-Step Memo",
    content:
      normalizedScorecardJson.nextSteps.length > 0
        ? normalizedScorecardJson.nextSteps.join("\n")
        : scorecardSummary,
  });

  return {
    ...input.envelope,
    artifacts,
  };
}

async function denormalizeTranscriptAnalysisToMeeting(input: {
  triggerType: string | null | undefined;
  triggerPayload: unknown;
  envelope: Awaited<ReturnType<typeof parseAutomationAiResponseEnvelope>>;
  artifactIds: string[];
}) {
  if (input.triggerType !== "google-workspace.meet.transcript_ready") {
    return;
  }

  const triggerPayload = asRecord(input.triggerPayload);
  const meetingId =
    (typeof triggerPayload?.meetingId === "string" && triggerPayload.meetingId.trim()) || null;
  if (!meetingId) {
    return;
  }

  const artifacts = Array.isArray(input.envelope.artifacts) ? input.envelope.artifacts : [];
  const scorecardIndex = artifacts.findIndex(
    (artifact) => artifact.artifactType === "demo_quality_scorecard"
  );
  if (scorecardIndex < 0) {
    return;
  }

  const scorecard = artifacts[scorecardIndex];
  const contentJson = asRecord(scorecard.contentJson);
  const summary =
    scorecard.summary ??
    (typeof contentJson?.summary === "string" ? contentJson.summary : null) ??
    scorecard.content ??
    null;

  await prisma.dealMeeting.update({
    where: { id: meetingId },
    data: {
      analysisArtifactId: input.artifactIds[scorecardIndex] ?? null,
      demoQualityScore: toBoundedScore(contentJson?.overallScore),
      demoQualitySummary: summary,
      demoStrengthsJson: uniqueStringList(contentJson?.strengths) as Prisma.InputJsonValue,
      demoGapsJson: uniqueStringList(contentJson?.gaps) as Prisma.InputJsonValue,
      analyzedAt: new Date(),
    },
  });
}

async function settleAutomationAiJobWithResponse(input: {
  jobId: string;
  response: Awaited<ReturnType<typeof retrieveAutomationOpenAiResponse>>;
}) {
  const job = await prisma.automationAiJob.findUnique({
    where: { id: input.jobId },
    include: {
      run: {
        select: {
          requestedById: true,
          triggerType: true,
          triggerPayload: true,
        },
      },
    },
  });

  if (!job) {
    return;
  }

  const responseStatus = input.response.status ?? null;
  const outputText = extractAutomationAiOutputText(input.response);

  if (!isTerminalAutomationAiStatus(responseStatus)) {
    await prisma.automationAiJob.update({
      where: { id: job.id },
      data: {
        status: AutomationAiJobStatus.RUNNING,
        responseStatus,
        responsePayload: toInputJsonValue(input.response),
        outputText,
        lastError: null,
        nextAttemptAt: nextRetryDate(Math.max(job.attemptCount, 1)),
      },
    });
    return;
  }

  if (responseStatus === "completed") {
    try {
      const metadata = asRecord(job.metadata) ?? {};
      const parsedToolDefinitions = Array.isArray(metadata.parsedToolDefinitions)
        ? metadata.parsedToolDefinitions.filter((item) => asRecord(item))
        : [];
      const envelope = parseAutomationAiResponseEnvelope({
        response: input.response,
        parsedToolDefinitions,
      });
      const normalizedEnvelope = normalizeDemoAnalysisEnvelope({
        triggerType: job.run.triggerType,
        triggerPayload: job.run.triggerPayload,
        envelope,
      });

      const persisted = await persistAutomationEnvelope({
        workflowId: job.workflowId,
        runId: job.runId,
        aiJobId: job.id,
        operatorKey: job.operatorKey,
        createdByNodeKey: job.nodeKey,
        requestedById: job.run.requestedById ?? null,
        envelope: normalizedEnvelope,
      });

      await denormalizeTranscriptAnalysisToMeeting({
        triggerType: job.run.triggerType,
        triggerPayload: job.run.triggerPayload,
        envelope: normalizedEnvelope,
        artifactIds: persisted.artifactIds,
      });

      await prisma.automationAiJob.update({
        where: { id: job.id },
        data: {
          status: AutomationAiJobStatus.SUCCEEDED,
          responseStatus,
          responsePayload: toInputJsonValue(input.response),
          outputText,
          parsedOutput: toNullableJsonValue(normalizedEnvelope.raw),
          lastError: null,
          completedAt: new Date(),
        },
      });

      if (job.stepId) {
        await prisma.workflowRunStep.update({
          where: { id: job.stepId },
          data: {
            status: WorkflowStepStatus.SUCCEEDED,
            output: {
              actionType: job.jobType,
              aiJobId: job.id,
              responseId: input.response.id,
              summary: normalizedEnvelope.summary ?? null,
              artifactIds: persisted.artifactIds,
              recommendationIds: persisted.recommendationIds,
            } as Prisma.JsonObject,
            error: null,
            finishedAt: new Date(),
          },
        });
      }

      await resumeWorkflowRunAfterNode({
        runId: job.runId,
        workflowId: job.workflowId,
        nodeKey: job.nodeKey,
      });
      return;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to persist automation AI output";
      await failAutomationAiJob({
        jobId: job.id,
        workflowId: job.workflowId,
        runId: job.runId,
        stepId: job.stepId,
        message,
      });
      return;
    }
  }

  const errorRecord = asRecord((input.response as unknown as Record<string, unknown>).error);
  const message =
    (typeof errorRecord?.message === "string" && errorRecord.message) ||
    (responseStatus === "cancelled"
      ? "Background response cancelled"
      : responseStatus === "incomplete"
        ? "Background response incomplete"
        : "Background response failed");

  await failAutomationAiJob({
    jobId: job.id,
    workflowId: job.workflowId,
    runId: job.runId,
    stepId: job.stepId,
    message,
    canceled: responseStatus === "cancelled",
  });
}

export async function dispatchAutomationAiJobs(limit = 10): Promise<number> {
  const jobs = await prisma.automationAiJob.findMany({
    where: {
      status: {
        in: [AutomationAiJobStatus.QUEUED, AutomationAiJobStatus.FAILED],
      },
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  });

  let processed = 0;

  for (const job of jobs) {
    try {
      const requestPayload = asRecord(job.requestPayload);
      if (!requestPayload) {
        throw new Error("AI job request payload is missing");
      }

      await prisma.automationAiJob.update({
        where: { id: job.id },
        data: {
          status: AutomationAiJobStatus.REQUESTED,
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });

      const response = await createAutomationOpenAiResponse(
        requestPayload as unknown as Parameters<typeof createAutomationOpenAiResponse>[0]
      );

      await prisma.automationAiJob.update({
        where: { id: job.id },
        data: {
          status: isTerminalAutomationAiStatus(response.status)
            ? AutomationAiJobStatus.REQUESTED
            : AutomationAiJobStatus.RUNNING,
          responseId: response.id,
          responseStatus: response.status ?? null,
          responsePayload: toInputJsonValue(response),
          outputText: extractAutomationAiOutputText(response),
          nextAttemptAt: nextRetryDate(job.attemptCount + 1),
        },
      });

      await settleAutomationAiJobWithResponse({
        jobId: job.id,
        response,
      });
      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to dispatch AI job";
      await prisma.automationAiJob.update({
        where: { id: job.id },
        data: {
          status: AutomationAiJobStatus.FAILED,
          attemptCount: { increment: 1 },
          lastError: message,
          nextAttemptAt: nextRetryDate(job.attemptCount + 1),
        },
      });
      processed += 1;
    }
  }

  return processed;
}

export async function pollAutomationAiJobs(limit = 20): Promise<number> {
  const jobs = await prisma.automationAiJob.findMany({
    where: {
      status: {
        in: [AutomationAiJobStatus.REQUESTED, AutomationAiJobStatus.RUNNING],
      },
      responseId: { not: null },
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: limit,
  });

  let processed = 0;

  for (const job of jobs) {
    try {
      if (!job.responseId) {
        continue;
      }

      const response = await retrieveAutomationOpenAiResponse(job.responseId);
      await settleAutomationAiJobWithResponse({
        jobId: job.id,
        response,
      });
      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to poll AI job";
      await prisma.automationAiJob.update({
        where: { id: job.id },
        data: {
          status: AutomationAiJobStatus.FAILED,
          lastError: message,
          nextAttemptAt: nextRetryDate(job.attemptCount + 1),
        },
      });
      processed += 1;
    }
  }

  return processed;
}

export async function processAutomationAiWebhook(
  body: string,
  headers: Headers
): Promise<{ handled: boolean; responseId?: string | null; eventType?: string | null }> {
  const event = await unwrapAutomationOpenAiWebhookEvent(body, headers);
  const eventType =
    typeof event.type === "string" ? event.type.trim().toLowerCase() : null;
  const data = asRecord(event.data);
  const responseId = typeof data?.id === "string" ? data.id : null;

  if (!eventType || !responseId || !eventType.startsWith("response.")) {
    return { handled: false, responseId, eventType };
  }

  const job = await prisma.automationAiJob.findUnique({
    where: { responseId },
    select: { id: true },
  });

  if (!job) {
    return { handled: false, responseId, eventType };
  }

  const response = await retrieveAutomationOpenAiResponse(responseId);
  await settleAutomationAiJobWithResponse({
    jobId: job.id,
    response,
  });

  return {
    handled: true,
    responseId,
    eventType,
  };
}

export async function enqueueWorkflowTriggerEvent(input: {
  workflowId?: string;
  provider: IntegrationProvider;
  eventType: string;
  externalId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<void> {
  await prisma.workflowTriggerEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      workflowId: input.workflowId,
      provider: input.provider,
      eventType: input.eventType,
      externalId: input.externalId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      idempotencyKey: input.idempotencyKey,
      status: WorkflowEventStatus.QUEUED,
      observedAt: new Date(),
    },
    update: {
      payload: input.payload as Prisma.InputJsonValue,
      observedAt: new Date(),
      status: WorkflowEventStatus.QUEUED,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });
}

export async function processTimedOutApprovals(limit = 20): Promise<number> {
  const now = new Date();
  const pending = await prisma.workflowApproval.findMany({
    where: {
      status: WorkflowApprovalStatus.PENDING,
      timeoutAt: { lte: now },
    },
    orderBy: { timeoutAt: "asc" },
    take: limit,
    include: {
      run: {
        include: {
          workflow: {
            select: { graph: true },
          },
        },
      },
    },
  });

  for (const approval of pending) {
    await prisma.workflowApproval.update({
      where: { id: approval.id },
      data: {
        status: WorkflowApprovalStatus.TIMED_OUT,
        resolvedAt: new Date(),
      },
    });

    const graph = normalizeWorkflowGraph(approval.run.workflow.graph);
    const node = graph.nodes.find((candidate) => candidate.key === approval.nodeKey);
    if (!node) {
      await prisma.workflowRun.update({
        where: { id: approval.runId },
        data: {
          status: WorkflowRunStatus.CANCELED,
          finishedAt: new Date(),
          error: "Approval timed out",
        },
      });
      continue;
    }

    const context = await buildRunExecutionContext(approval.runId);
    const nextNodes = selectOutgoingTargets({
      graph,
      node,
      nodeOutput: { approved: false },
      context,
      decisionLabel: "timeout",
    });

    if (nextNodes.length === 0) {
      await prisma.workflowRun.update({
        where: { id: approval.runId },
        data: {
          status: WorkflowRunStatus.CANCELED,
          finishedAt: new Date(),
          error: "Approval timed out",
        },
      });
      continue;
    }

    await prisma.workflowRun.update({
      where: { id: approval.runId },
      data: {
        status: WorkflowRunStatus.RUNNING,
        error: null,
      },
    });

    const result = await executeRunGraph({
      runId: approval.runId,
      workflowId: approval.run.workflowId,
      graph,
      initialNodeKeys: nextNodes,
      context,
      decisionLabel: "timeout",
    });

    await finalizeWorkflowRun({
      runId: approval.runId,
      workflowId: approval.run.workflowId,
      status: result.status,
      error: result.error ?? null,
    });
  }

  return pending.length;
}

export async function dispatchWorkflowTriggerEvents(limit = 25): Promise<{
  processed: number;
  startedRuns: number;
  timedOutApprovals: number;
}> {
  const timedOutApprovals = await processTimedOutApprovals();

  const events = await prisma.workflowTriggerEvent.findMany({
    where: {
      status: WorkflowEventStatus.QUEUED,
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: [{ observedAt: "asc" }],
    take: limit,
  });

  let startedRuns = 0;

  for (const event of events) {
    try {
      const runs = await triggerMatchingWorkflows({
        provider: event.provider,
        eventType: event.eventType,
        externalId: event.externalId,
        payload: asRecord(event.payload) ?? {},
        idempotencyKey: event.idempotencyKey,
      });
      startedRuns += runs;

      await prisma.workflowTriggerEvent.update({
        where: { id: event.id },
        data: {
          status: WorkflowEventStatus.DISPATCHED,
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow dispatch failed";
      const nextAttemptCount = event.attemptCount + 1;
      await prisma.workflowTriggerEvent.update({
        where: { id: event.id },
        data: {
          status:
            nextAttemptCount >= 6
              ? WorkflowEventStatus.DEAD_LETTER
              : WorkflowEventStatus.QUEUED,
          attemptCount: nextAttemptCount,
          nextAttemptAt: nextRetryDate(nextAttemptCount),
          lastError: message,
        },
      });
    }
  }

  return {
    processed: events.length,
    startedRuns,
    timedOutApprovals,
  };
}

export async function resolveWorkflowApproval(input: {
  approvalId: string;
  actorUserId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<void> {
  const approval = await prisma.workflowApproval.findUnique({
    where: { id: input.approvalId },
    include: {
      run: {
        include: {
          workflow: true,
        },
      },
    },
  });

  if (!approval) throw new Error("Approval not found");
  if (approval.status !== WorkflowApprovalStatus.PENDING) {
    throw new Error("Approval is no longer pending");
  }

  if (approval.approverId && approval.approverId !== input.actorUserId) {
    throw new Error("Forbidden");
  }

  if (!approval.approverId) {
    const role = await getAppRole(input.actorUserId);
    const policy = normalizeWorkflowRolePolicy(approval.run.workflow.rolePolicy);
    if (!policy.approveRoles.includes(role)) {
      throw new Error("Forbidden");
    }
  }

  const nextStatus =
    input.decision === "approve"
      ? WorkflowApprovalStatus.APPROVED
      : WorkflowApprovalStatus.REJECTED;

  await prisma.workflowApproval.update({
    where: { id: approval.id },
    data: {
      status: nextStatus,
      decisionNote: input.note ?? null,
      approverId: approval.approverId ?? input.actorUserId,
      resolvedAt: new Date(),
    },
  });

  if (approval.stepId) {
    await prisma.workflowRunStep.update({
      where: { id: approval.stepId },
      data: {
        status:
          input.decision === "approve"
            ? WorkflowStepStatus.SUCCEEDED
            : WorkflowStepStatus.FAILED,
        finishedAt: new Date(),
        output: {
          decision: input.decision,
          note: input.note ?? null,
        } as Prisma.JsonObject,
      },
    });
  }

  const graph = await getWorkflowGraph(approval.run.workflowId);
  const node = graph.nodes.find((candidate) => candidate.key === approval.nodeKey);
  if (!node) {
    throw new Error("Approval node not found in graph");
  }

  const context = await buildRunExecutionContext(approval.runId);
  const decisionLabel = input.decision === "approve" ? "approved" : "rejected";
  const nextNodes = selectOutgoingTargets({
    graph,
    node,
    nodeOutput: { decision: input.decision },
    context,
    decisionLabel,
  });

  if (nextNodes.length === 0) {
    await prisma.workflowRun.update({
      where: { id: approval.runId },
      data: {
        status:
          input.decision === "approve"
            ? WorkflowRunStatus.SUCCEEDED
            : WorkflowRunStatus.CANCELED,
        finishedAt: new Date(),
        error: input.decision === "approve" ? null : "Rejected by approver",
      },
    });
    return;
  }

  await prisma.workflowRun.update({
    where: { id: approval.runId },
    data: {
      status: WorkflowRunStatus.RUNNING,
      error: null,
    },
  });

  const result = await executeRunGraph({
    runId: approval.runId,
    workflowId: approval.run.workflowId,
    graph,
    initialNodeKeys: nextNodes,
    context,
    decisionLabel,
  });

  await finalizeWorkflowRun({
    runId: approval.runId,
    workflowId: approval.run.workflowId,
    status: result.status,
    error: result.error ?? null,
  });
}
