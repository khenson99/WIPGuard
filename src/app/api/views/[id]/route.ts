export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { setDefaultSavedView } from "@/lib/saved-views";
import type { Prisma } from "@/generated/prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function asJsonObject(value: unknown): Prisma.InputJsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.InputJsonValue;
}

export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "saved_view",
      targetId: session.user.id,
    });

    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const { id } = await context.params;
    const existing = await prisma.userSavedView.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "View not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      config?: unknown;
      position?: number;
      isDefault?: boolean;
    };

    const data: Prisma.UserSavedViewUpdateInput = {};

    if (typeof body.name === "string" && body.name.trim().length > 0) {
      data.name = body.name.trim();
    }

    if (body.config !== undefined) {
      const config = asJsonObject(body.config);
      if (!config) {
        return NextResponse.json(
          { error: "config must be a JSON object" },
          { status: 400 }
        );
      }
      data.config = config;
    }

    if (typeof body.position === "number" && Number.isFinite(body.position)) {
      data.position = Math.max(0, Math.trunc(body.position));
    }

    const updated = await prisma.userSavedView.update({
      where: { id },
      data,
    });

    if (body.isDefault === true) {
      await setDefaultSavedView({
        userId: session.user.id,
        scope: updated.scope,
        viewId: updated.id,
      });
    }

    const finalRecord = await prisma.userSavedView.findUniqueOrThrow({ where: { id } });
    return NextResponse.json(finalRecord);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "saved_view",
      targetId: session.user.id,
    });

    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const { id } = await context.params;
    const existing = await prisma.userSavedView.findUnique({ where: { id } });

    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "View not found" }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: "System views cannot be deleted" },
        { status: 400 }
      );
    }

    await prisma.userSavedView.delete({ where: { id } });

    if (existing.isDefault) {
      const nextDefault = await prisma.userSavedView.findFirst({
        where: {
          userId: session.user.id,
          scope: existing.scope,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      });
      if (nextDefault) {
        await setDefaultSavedView({
          userId: session.user.id,
          scope: existing.scope,
          viewId: nextDefault.id,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
