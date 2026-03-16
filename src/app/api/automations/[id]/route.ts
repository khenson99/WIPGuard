export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  WorkflowScope,
  WorkflowStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import {
  normalizeAutomationOperatorKey,
} from "@/lib/automations/operators";
import { isRetiredAutomationActionType } from "@/lib/automations/retired-actions";
import {
  assertCanEditWorkflow,
  assertCanViewWorkflow,
  integrationProvidersFromInput,
  normalizeWorkflowRolePolicy,
  normalizeWorkflowScope,
  normalizeWorkflowStatus,
  syncWorkflowGraphRecords,
  validateAndNormalizeGraph,
} from "@/lib/automations/service";
import { getAppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function sanitizeWorkflowDetail<T extends {
  nodes: Array<{ nodeKey: string; config: unknown }>;
  edges: Array<{ sourceNodeKey: string; targetNodeKey: string }>;
}>(workflow: T): T {
  const retiredNodeKeys = new Set(
    workflow.nodes
      .filter((node) => {
        const config =
          node.config && typeof node.config === "object" && !Array.isArray(node.config)
            ? (node.config as Record<string, unknown>)
            : null;
        return isRetiredAutomationActionType(config?.actionType);
      })
      .map((node) => node.nodeKey)
  );

  if (retiredNodeKeys.size === 0) {
    return workflow;
  }

  return {
    ...workflow,
    nodes: workflow.nodes.filter((node) => !retiredNodeKeys.has(node.nodeKey)),
    edges: workflow.edges.filter(
      (edge) =>
        !retiredNodeKeys.has(edge.sourceNodeKey) && !retiredNodeKeys.has(edge.targetNodeKey)
    ),
  };
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await assertCanViewWorkflow(user.id, id);

    const workflow = await prisma.workflowDefinition.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        nodes: {
          orderBy: [{ createdAt: "asc" }],
        },
        edges: {
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json(sanitizeWorkflowDetail(workflow));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch workflow";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const existing = await assertCanEditWorkflow(user.id, id);

    const role = await getAppRole(user.id);
    const body = parseBody(await request.json().catch(() => ({})));

    const data: Prisma.WorkflowDefinitionUpdateInput = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      data.name = name;
    }

    if (typeof body.description === "string") {
      data.description = body.description.trim() || null;
    }

    if (body.operatorKey !== undefined) {
      data.operatorKey = normalizeAutomationOperatorKey(body.operatorKey);
    }

    if (body.scope !== undefined) {
      const scope = normalizeWorkflowScope(body.scope);
      if (scope === WorkflowScope.SHARED && role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can set scope to SHARED" },
          { status: 403 }
        );
      }
      data.scope = scope;
    }

    if (body.status !== undefined) {
      const status = normalizeWorkflowStatus(body.status);
      if (status === WorkflowStatus.ARCHIVED && role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can archive workflows" },
          { status: 403 }
        );
      }
      data.status = status;
    }

    if (body.providers !== undefined) {
      data.providers = integrationProvidersFromInput(body.providers);
    }

    if (body.rolePolicy !== undefined) {
      if (existing.scope === WorkflowScope.SHARED && role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can update shared workflow role policy" },
          { status: 403 }
        );
      }
      data.rolePolicy = normalizeWorkflowRolePolicy(
        body.rolePolicy
      ) as unknown as Prisma.InputJsonValue;
    }

    let nextGraph = null as null | ReturnType<typeof validateAndNormalizeGraph>;
    if (body.graph !== undefined) {
      nextGraph = validateAndNormalizeGraph(body.graph);
      data.graph = nextGraph.graphJson;
    }

    await prisma.workflowDefinition.update({
      where: { id },
      data,
    });

    if (nextGraph) {
      await syncWorkflowGraphRecords(id, nextGraph.graph);
    }

    const workflow = await prisma.workflowDefinition.findUniqueOrThrow({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        nodes: {
          orderBy: [{ createdAt: "asc" }],
        },
        edges: {
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return NextResponse.json(sanitizeWorkflowDetail(workflow));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update workflow";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await assertCanEditWorkflow(user.id, id);

    await prisma.workflowDefinition.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete workflow";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
