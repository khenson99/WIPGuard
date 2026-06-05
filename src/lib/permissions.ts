import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { WorkspaceId } from "@/lib/platform/workspaces";
import { prisma } from "@/lib/prisma";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export type AppRole = "admin" | "member" | "observer" | "investor";

export type PermissionAction =
  | "department.write"
  | "conference.write"
  | "deals.read"
  | "deals.write"
  | "analytics.read"
  | "analytics.write"
  | "priority.write"
  | "policy.write"
  | "team.invite"
  | "team.role.write"
  | "profile.write"
  | "integration.read"
  | "integration.manage"
  | "automation.write"
  | "automation.approve"
  | "investor.read"
  | "report.read"
  | "report.write"
  | "board_final.approve";

const PERMISSION_MATRIX: Readonly<Record<AppRole, readonly PermissionAction[]>> =
  {
    admin: [
      "department.write",
      "conference.write",
      "deals.read",
      "deals.write",
      "analytics.read",
      "analytics.write",
      "priority.write",
      "policy.write",
      "team.invite",
      "team.role.write",
      "profile.write",
      "integration.read",
      "integration.manage",
      "automation.write",
      "automation.approve",
      "investor.read",
      "report.read",
      "report.write",
      "board_final.approve",
    ],
    member: [
      "department.write",
      "conference.write",
      "deals.read",
      "deals.write",
      "analytics.read",
      "analytics.write",
      "priority.write",
      "profile.write",
      "integration.read",
      "automation.write",
      "automation.approve",
      "report.read",
      "report.write",
    ],
    observer: ["profile.write", "integration.read", "automation.approve", "report.read"],
    investor: ["profile.write", "investor.read", "report.read"],
  };

export function normalizeRole(role: string | null | undefined): AppRole {
  const normalized = (role ?? "member").trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "observer") return "observer";
  if (normalized === "investor") return "investor";
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
    case "department.write":
    case "priority.write":
    case "policy.write":
      return "metrics";
    case "conference.write":
    case "deals.read":
    case "deals.write":
      return "sources";
    case "analytics.read":
    case "analytics.write":
      return "metrics";
    case "integration.read":
    case "integration.manage":
      return "sources";
    case "automation.write":
    case "automation.approve":
      return "pipelines";
    case "investor.read":
      return "investor";
    case "report.read":
    case "report.write":
    case "board_final.approve":
      return "reports";
    case "team.invite":
    case "team.role.write":
    case "profile.write":
      return "metrics";
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
