export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { WorkflowScope, WorkflowStatus, type Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
import {
  integrationProvidersFromInput,
  normalizeWorkflowRolePolicy,
  normalizeWorkflowScope,
  syncWorkflowGraphRecords,
  validateAndNormalizeGraph,
} from "@/lib/automations/service";
import { getAppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function parseBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workflows = await prisma.workflowDefinition.findMany({
      where: {
        OR: [{ ownerId: session.user.id }, { scope: WorkflowScope.SHARED }],
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
      where: { userId: session.user.id },
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

    return NextResponse.json({
      workflows,
      templates: AUTOMATION_TEMPLATES,
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
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getAppRole(session.user.id);
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
        ownerId: session.user.id,
        name,
        description:
          typeof body.description === "string" ? body.description.trim() || null : null,
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
