import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.boardSettings.findMany({
      orderBy: { columnOrder: "asc" },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to fetch board settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch board settings" },
      { status: 500 },
    );
  }
}

interface BoardSettingInput {
  columnName: string;
  wipLimit?: number;
  columnOrder?: number;
  color?: string | null;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "board.write",
      request,
      targetType: "board_settings",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body: BoardSettingInput[] = await request.json();

    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json(
        { error: "Request body must be a non-empty array of board settings" },
        { status: 400 },
      );
    }

    const settings = await prisma.$transaction(
      body.map((setting) =>
        prisma.boardSettings.upsert({
          where: { columnName: setting.columnName },
          update: {
            wipLimit: setting.wipLimit,
            columnOrder: setting.columnOrder,
            color: setting.color,
          },
          create: {
            columnName: setting.columnName,
            wipLimit: setting.wipLimit ?? 0,
            columnOrder: setting.columnOrder ?? 0,
            color: setting.color,
          },
        }),
      ),
    );

    await recordSecurityAuditEvent({
      action: "board.settings.update",
      category: "board",
      outcome: "ALLOWED",
      actorId: session.user.id,
      actorRole: permission.role,
      request,
      details: {
        updatedColumns: settings.map((setting) => setting.columnName),
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update board settings:", error);
    return NextResponse.json(
      { error: "Failed to update board settings" },
      { status: 500 },
    );
  }
}
