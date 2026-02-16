export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateUserUiPreference,
  normalizeAnalyticsConfig,
  normalizeDashboardConfig,
  normalizeProjectsConfig,
  normalizeTasksConfig,
} from "@/lib/ui-preferences";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "ui_preference",
      targetId: session.user.id,
    });

    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const preference = await getOrCreateUserUiPreference(session.user.id);

    return NextResponse.json({
      ...preference,
      dashboardConfig: normalizeDashboardConfig(preference.dashboardConfig),
      tasksConfig: normalizeTasksConfig(preference.tasksConfig),
      projectsConfig: normalizeProjectsConfig(preference.projectsConfig),
      analyticsConfig: normalizeAnalyticsConfig(preference.analyticsConfig),
    });
  } catch (error) {
    console.error("GET /api/ui/preferences error:", error);
    return NextResponse.json(
      { error: "Failed to load UI preferences" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "ui_preference",
      targetId: session.user.id,
    });

    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const current = await getOrCreateUserUiPreference(session.user.id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const dashboardConfig =
      body.dashboardConfig !== undefined
        ? normalizeDashboardConfig(body.dashboardConfig)
        : normalizeDashboardConfig(current.dashboardConfig);

    const tasksConfig =
      body.tasksConfig !== undefined
        ? normalizeTasksConfig(body.tasksConfig)
        : normalizeTasksConfig(current.tasksConfig);

    const projectsConfig =
      body.projectsConfig !== undefined
        ? normalizeProjectsConfig(body.projectsConfig)
        : normalizeProjectsConfig(current.projectsConfig);

    const analyticsConfig =
      body.analyticsConfig !== undefined
        ? normalizeAnalyticsConfig(body.analyticsConfig)
        : normalizeAnalyticsConfig(current.analyticsConfig);

    const updated = await prisma.userUiPreference.update({
      where: { userId: session.user.id },
      data: {
        dashboardConfig: dashboardConfig as unknown as Prisma.InputJsonValue,
        tasksConfig: tasksConfig as unknown as Prisma.InputJsonValue,
        projectsConfig: projectsConfig as unknown as Prisma.InputJsonValue,
        analyticsConfig: analyticsConfig as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/ui/preferences error:", error);
    return NextResponse.json(
      { error: "Failed to update UI preferences" },
      { status: 500 }
    );
  }
}
