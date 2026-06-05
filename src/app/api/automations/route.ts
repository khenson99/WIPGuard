export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { WorkflowScope, WorkflowStatus, type Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { normalizeAutomationOperatorKey } from "@/lib/automations/operators";
import { isRetiredAutomationActionType } from "@/lib/automations/retired-actions";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
import {
  integrationProvidersFromInput,
  normalizeWorkflowRolePolicy,
  normalizeWorkflowScope,
  syncWorkflowGraphRecords,
  validateAndNormalizeGraph,
} from "@/lib/automations/service";
import { getAppRole } from "@/lib/permissions";
import { investorForbiddenResponse } from "@/lib/investor/api-guards";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";
import type { AutomationTemplate } from "@/lib/automations/templates";

function parseBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function sanitizeTemplateCopy(value: string): string {
  return value;
}

function sanitizeTemplateGraphValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeTemplateGraphValue(item))
      .filter((item) => item !== null);
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeTemplateCopy(value) : value;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(record)) {
    if (key === "actionTypes" && Array.isArray(raw)) {
      const actionTypes = raw.filter(
        (item): item is string =>
          typeof item === "string" && !isRetiredAutomationActionType(item)
      );
      sanitized[key] = actionTypes;
      continue;
    }

    if (key === "tools" && Array.isArray(raw)) {
      const tools = raw
        .filter((item) => {
          if (!item || typeof item !== "object") return true;
          const actionType = (item as Record<string, unknown>).actionType;
          return !isRetiredAutomationActionType(actionType);
        })
        .map((item) => sanitizeTemplateGraphValue(item));
      sanitized[key] = tools;
      continue;
    }

    sanitized[key] = sanitizeTemplateGraphValue(raw);
  }

  return sanitized;
}

function graphHasRetiredActionNode(template: AutomationTemplate): boolean {
  const graph = template.graph as { nodes?: Array<{ config?: { actionType?: string } }> };
  return (graph.nodes ?? []).some((node) => {
    const actionType = node.config?.actionType;
    return isRetiredAutomationActionType(actionType);
  });
}

function sanitizeAutomationTemplate(template: AutomationTemplate): AutomationTemplate | null {
  if (graphHasRetiredActionNode(template)) {
    return null;
  }

  return {
    ...template,
    description: sanitizeTemplateCopy(template.description),
    graph: sanitizeTemplateGraphValue(template.graph) as Prisma.JsonObject,
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const investorDenied = investorForbiddenResponse(user.role);
    if (investorDenied) return investorDenied;

    const workflows = await prisma.workflowDefinition.findMany({
      where: {
        OR: [{ ownerId: user.id }, { scope: WorkflowScope.SHARED }],
      },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
            finishedAt: true,
            error: true,
          },
        },
        _count: {
          select: {
            nodes: true,
            edges: true,
            runs: true,
          },
        },
      },
    });

    const integrationRules = await prisma.integrationRule.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        key: true,
        provider: true,
        enabled: true,
        updatedAt: true,
        lastRunAt: true,
        lastError: true,
      },
    });

    const systemManagedRecipes = integrationRules.map((rule) => ({
      id: `rule-${rule.id}`,
      source: "IntegrationRule",
      key: rule.key,
      provider: rule.provider,
      status: rule.enabled ? "ACTIVE" : "PAUSED",
      updatedAt: rule.updatedAt,
      lastRunAt: rule.lastRunAt,
      lastError: rule.lastError,
    }));

    const publicTemplates = AUTOMATION_TEMPLATES.map(sanitizeAutomationTemplate).filter(
      (template): template is AutomationTemplate => Boolean(template)
    );

    return NextResponse.json({
      workflows,
      templates: publicTemplates,
      systemManagedRecipes,
    });
  } catch (error) {
    console.error("GET /api/automations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch automations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const investorDenied = investorForbiddenResponse(user.role);
    if (investorDenied) return investorDenied;

    const role = await getAppRole(user.id);
    const body = parseBody(await request.json().catch(() => ({})));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const scope = normalizeWorkflowScope(body.scope);
    if (scope === WorkflowScope.SHARED && role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can create shared workflows" },
        { status: 403 }
      );
    }

    const providers = integrationProvidersFromInput(body.providers);
    const operatorKey = normalizeAutomationOperatorKey(body.operatorKey);
    const rolePolicy = normalizeWorkflowRolePolicy(body.rolePolicy);

    const graphInput = body.graph ?? {
      nodes: [
        {
          key: "trigger_1",
          type: "TRIGGER",
          label: "Trigger",
          config: {},
          positionX: 80,
          positionY: 80,
        },
      ],
      edges: [],
    };

    const { graph, graphJson } = validateAndNormalizeGraph(graphInput);

    const created = await prisma.workflowDefinition.create({
      data: {
        ownerId: user.id,
        name,
        description:
          typeof body.description === "string" ? body.description.trim() || null : null,
        operatorKey,
        scope,
        status: WorkflowStatus.DRAFT,
        providers,
        rolePolicy: rolePolicy as unknown as Prisma.InputJsonValue,
        graph: graphJson,
      },
    });

    await syncWorkflowGraphRecords(created.id, graph);

    const hydrated = await prisma.workflowDefinition.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        nodes: true,
        edges: true,
      },
    });

    return NextResponse.json(hydrated, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create automation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
