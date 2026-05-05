import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { WorkspaceId } from "@/lib/platform/workspaces";
import { prisma } from "@/lib/prisma";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export type AppRole = "admin" | "member" | "observer";

export type PermissionAction =
  | "board.write"
  | "task.read"
  | "task.write"
  | "task.transition"
  | "project.read"
  | "project.write"
  | "conference.write"
  | "deals.read"
  | "deals.write"
  | "analytics.read"
  | "analytics.write"
  | "hierarchy.read"
  | "sprint.write"
  | "priority.write"
  | "policy.write"
  | "policy.override"
  | "team.invite"
  | "team.role.write"
  | "profile.write"
  | "integration.read"
  | "integration.manage"
  | "automation.write"
  | "automation.approve";

const PERMISSION_MATRIX: Readonly<Record<AppRole, readonly PermissionAction[]>> =
  {
    admin: [
      "board.write",
      "task.read",
      "task.write",
      "task.transition",
      "project.read",
      "project.write",
      "conference.write",
      "deals.read",
      "deals.write",
      "analytics.read",
      "analytics.write",
      "hierarchy.read",
      "sprint.write",
      "priority.write",
      "policy.write",
      "policy.override",
      "team.invite",
      "team.role.write",
      "profile.write",
      "integration.read",
      "integration.manage",
      "automation.write",
      "automation.approve",
    ],
    member: [
      "board.write",
      "task.read",
      "task.write",
      "task.transition",
      "project.read",
      "project.write",
      "conference.write",
      "deals.read",
      "deals.write",
      "analytics.read",
      "analytics.write",
      "hierarchy.read",
      "sprint.write",
      "priority.write",
      "policy.override",
      "profile.write",
      "integration.read",
      "automation.write",
      "automation.approve",
    ],
    observer: ["profile.write", "integration.read", "automation.approve"],
  };

export function normalizeRole(role: string | null | undefined): AppRole {
  const normalized = (role ?? "member").trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "observer") return "observer";
  return "member";
}

export async function getAppRole(userId: string): Promise<AppRole> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return normalizeRole(user?.role);
}

export function can(role: AppRole, action: PermissionAction): boolean {
  return PERMISSION_MATRIX[role].includes(action);
}

export function workspaceIdForPermissionAction(
  action: PermissionAction
): WorkspaceId | null {
  switch (action) {
    case "board.write":
    case "task.read":
    case "task.write":
    case "task.transition":
    case "project.read":
    case "project.write":
    case "hierarchy.read":
    case "sprint.write":
    case "priority.write":
    case "policy.write":
    case "policy.override":
      return "analytics";
    case "conference.write":
    case "deals.read":
    case "deals.write":
      return "deals";
    case "analytics.read":
    case "analytics.write":
      return "analytics";
    case "integration.read":
    case "integration.manage":
      return "integrations";
    case "automation.write":
    case "automation.approve":
      return "automations";
    case "team.invite":
    case "team.role.write":
    case "profile.write":
      return "analytics";
    default:
      return null;
  }
}

interface EnforcePermissionInput {
  userId: string;
  action: PermissionAction;
  request: Request | NextRequest;
  targetType?: string;
  targetId?: string;
}

interface PermissionResult {
  role: AppRole;
  deniedResponse?: NextResponse;
}

export async function enforcePermission(
  input: EnforcePermissionInput
): Promise<PermissionResult> {
  const role = await getAppRole(input.userId);
  if (can(role, input.action)) {
    return { role };
  }

  await recordSecurityAuditEvent({
    action: input.action,
    category: "authorization",
    outcome: "DENIED",
    actorId: input.userId,
    actorRole: role,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    request: input.request,
    details: {
      reason: "ROLE_FORBIDDEN",
      requiredAction: input.action,
      role,
      workspaceId: workspaceIdForPermissionAction(input.action),
    },
  });

  return {
    role,
    deniedResponse: NextResponse.json(
      { error: "Forbidden: insufficient permissions" },
      { status: 403 }
    ),
  };
}
