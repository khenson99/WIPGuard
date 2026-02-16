import {
  IntegrationProvider,
  TaskStatus,
  WorkflowApprovalStatus,
  WorkflowEventStatus,
  WorkflowRunStatus,
  WorkflowStepStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  evaluateConditionExpression,
  normalizeWorkflowGraph,
  renderTemplatedString,
  type WorkflowExecutionContext,
  type WorkflowGraph,
  type WorkflowGraphNode,
} from "@/lib/automations/graph";
import { normalizeWorkflowRolePolicy } from "@/lib/automations/service";
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

function resolveTaskStatus(input: unknown, fallback: TaskStatus = TaskStatus.QUEUED): TaskStatus {
  const value = typeof input === "string" ? input.trim().toUpperCase() : "";
  switch (value) {
    case "BACKLOG":
      return TaskStatus.BACKLOG;
    case "QUEUED":
      return TaskStatus.QUEUED;
    case "WORKING_ON_TODAY":
      return TaskStatus.WORKING_ON_TODAY;
    case "ACTIVE":
      return TaskStatus.ACTIVE;
    case "NOT_DONE":
      return TaskStatus.NOT_DONE;
    case "DONE":
      return TaskStatus.DONE;
    default:
      return fallback;
  }
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

async function executeActionNode(input: {
  runId: string;
  node: WorkflowGraphNode;
  context: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const config = asRecord(input.node.config) ?? {};
  const actionType = typeof config.actionType === "string" ? config.actionType : "noop";

  if (actionType === "create_task") {
    const title =
      renderMaybeTemplate(config.titleTemplate, input.context) ||
      renderMaybeTemplate(config.title, input.context) ||
      `Automation task from ${input.node.label}`;
    const notes = renderMaybeTemplate(config.notesTemplate, input.context);
    const status = resolveTaskStatus(config.status, TaskStatus.QUEUED);
    const priorityRaw =
      renderMaybeTemplate(config.priority, input.context) ||
      (typeof config.priority === "string" ? config.priority : "P2");

    const priority =
      priorityRaw === "P0" || priorityRaw === "P1" || priorityRaw === "P2" || priorityRaw === "P3"
        ? priorityRaw
        : "P2";

    const projectId = renderMaybeTemplate(config.projectId, input.context);
    const responsibleId = renderMaybeTemplate(config.responsibleId, input.context);

    const task = await prisma.task.create({
      data: {
        title,
        notes,
        status,
        priority,
        projectId,
        metadata: {
          integration: {
            provider: (input.context.trigger as Record<string, unknown>)?.provider ?? null,
            externalId: (input.context.trigger as Record<string, unknown>)?.externalId ?? null,
            ruleId: input.runId,
            sourceUrl: (input.context.trigger as Record<string, unknown>)?.sourceUrl ?? null,
            lastObservedAt: new Date().toISOString(),
          },
          automation: {
            runId: input.runId,
            nodeKey: input.node.key,
            actionType,
          },
        } as Prisma.JsonObject,
        ...(responsibleId
          ? {
              responsible: {
                connect: [{ id: responsibleId }],
              },
            }
          : {}),
      },
      select: { id: true, title: true, status: true, priority: true },
    });

    return {
      actionType,
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    };
  }

  if (actionType === "update_task") {
    const taskId =
      renderMaybeTemplate(config.taskId, input.context) ||
      (typeof config.taskIdPath === "string"
        ? String(resolvePath(config.taskIdPath, input.context) ?? "")
        : "");

    if (!taskId) {
      throw new Error("update_task action requires taskId or taskIdPath");
    }

    const title = renderMaybeTemplate(config.titleTemplate, input.context);
    const notes = renderMaybeTemplate(config.notesTemplate, input.context);
    const status = resolveTaskStatus(config.status, TaskStatus.QUEUED);

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title ? { title } : {}),
        ...(notes ? { notes } : {}),
        ...(config.status ? { status } : {}),
      },
      select: { id: true, title: true, status: true },
    });

    return {
      actionType,
      taskId: task.id,
      status,
    };
  }

  if (actionType === "create_checklist_tasks") {
    const checklist = Array.isArray(config.checklist)
      ? config.checklist
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];

    if (checklist.length === 0) {
      return { actionType, created: 0 };
    }

    const parentTitle =
      renderMaybeTemplate(config.titleTemplate, input.context) ||
      renderMaybeTemplate(config.title, input.context) ||
      `Checklist from ${input.node.label}`;

    const parent = await prisma.task.create({
      data: {
        title: parentTitle,
        status: TaskStatus.QUEUED,
        priority: "P2",
        metadata: {
          automation: {
            runId: input.runId,
            nodeKey: input.node.key,
            actionType,
          },
        },
      },
      select: { id: true },
    });

    await prisma.task.createMany({
      data: checklist.map((item, index) => ({
        title: item,
        status: TaskStatus.BACKLOG,
        priority: "P2",
        parentId: parent.id,
        columnOrder: index,
      })),
    });

    return { actionType, parentTaskId: parent.id, created: checklist.length };
  }

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

    return { actionType, queued: true };
  }

  if (actionType === "logbook_entry") {
    const taskId =
      renderMaybeTemplate(config.taskId, input.context) ||
      (typeof config.taskIdPath === "string"
        ? String(resolvePath(config.taskIdPath, input.context) ?? "")
        : "");

    if (!taskId) {
      return { actionType, skipped: true, reason: "missing_task_id" };
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        notes: true,
        status: true,
        priority: true,
        completedOn: true,
        project: { select: { name: true } },
        sprint: { select: { name: true } },
      },
    });

    if (!task) {
      return { actionType, skipped: true, reason: "task_not_found" };
    }

    await prisma.logbookEntry.create({
      data: {
        taskId: task.id,
        taskTitle: task.title,
        taskNotes: task.notes,
        projectName: task.project?.name ?? null,
        sprintName: task.sprint?.name ?? null,
        priority: task.priority,
        status: task.status,
        completedOn: task.completedOn ?? new Date(),
        metadata: {
          automation: {
            runId: input.runId,
            nodeKey: input.node.key,
          },
        },
      },
    });

    return { actionType, logged: true, taskId: task.id };
  }

  return { actionType: "noop", skipped: true };
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

function buildBaseContext(run: {
  triggerProvider: IntegrationProvider | null;
  triggerType: string | null;
  triggerId: string | null;
  triggerPayload: unknown;
}): Record<string, unknown> {
  return {
    trigger: {
      provider: run.triggerProvider,
      eventType: run.triggerType,
      externalId: run.triggerId,
      payload: asRecord(run.triggerPayload) ?? {},
    },
    state: {},
  };
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
        output = await executeActionNode({
          runId: input.runId,
          node,
          context: input.context,
        });
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

  const context = buildBaseContext(run);

  const result = await executeRunGraph({
    runId: run.id,
    workflowId: run.workflowId,
    graph,
    initialNodeKeys: [triggerNode.key],
    context,
  });

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      error: result.error ?? null,
      finishedAt:
        result.status === WorkflowRunStatus.WAITING_APPROVAL ? null : new Date(),
    },
  });

  await prisma.workflowDefinition.update({
    where: { id: run.workflowId },
    data: {
      lastRunAt: new Date(),
      lastError: result.error ?? null,
    },
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

    startedRuns += 1;
    await executeWorkflowRun(run.id);
  }

  return startedRuns;
}

function nextRetryDate(attempt: number): Date {
  const seconds = Math.min(300, 15 * attempt * attempt);
  return new Date(Date.now() + seconds * 1000);
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

    const context = buildBaseContext(approval.run);
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

    await prisma.workflowRun.update({
      where: { id: approval.runId },
      data: {
        status: result.status,
        error: result.error ?? null,
        finishedAt:
          result.status === WorkflowRunStatus.WAITING_APPROVAL ? null : new Date(),
      },
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

  const context = buildBaseContext(approval.run);
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

  await prisma.workflowRun.update({
    where: { id: approval.runId },
    data: {
      status: result.status,
      error: result.error ?? null,
      finishedAt:
        result.status === WorkflowRunStatus.WAITING_APPROVAL ? null : new Date(),
    },
  });
}
