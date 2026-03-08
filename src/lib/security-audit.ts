import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type SecurityAuditOutcome = "ALLOWED" | "DENIED" | "ERROR";

interface SecurityAuditEventInput {
  action: string;
  category: string;
  outcome: SecurityAuditOutcome;
  actorId?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: unknown;
  request?: Request | NextRequest | null;
}

function extractIpAddress(request?: Request | NextRequest | null): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

export async function recordSecurityAuditEvent(
  input: SecurityAuditEventInput
): Promise<void> {
  try {
    await prisma.securityAuditEvent.create({
      data: {
        action: input.action,
        category: input.category,
        outcome: input.outcome,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        details:
          input.details === undefined
            ? undefined
            : (input.details as Prisma.InputJsonValue),
        ipAddress: extractIpAddress(input.request),
        userAgent: input.request?.headers.get("user-agent") ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to record security audit event:", error);
  }
}
