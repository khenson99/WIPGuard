export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

const PRIORITY_WEIGHT: Record<string, number> = {
  P0: 8,
  P1: 5,
  P2: 3,
  P3: 1,
};

function daysOverdue(value: Date | null): number {
  if (!value) return 0;
  const diff = Date.now() - value.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      myActive,
      myBlocked,
      myOverdue,
      myDueSoon,
      myCompletedWeek,
      staleTeam,
      blockedTeam,
      overdueTeam,
      activeProjects,
      statusCounts,
    ] = await Promise.all([
      prisma.task.findMany({
        where: {
          responsible: { some: { id: session.user.id } },
          status: { in: ["WORKING_ON_TODAY", "ACTIVE", "QUEUED"] },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
          dependedBy: { select: { id: true } },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "asc" }],
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          responsible: { some: { id: session.user.id } },
          status: "NOT_DONE",
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
          dependedBy: { select: { id: true } },
        },
        orderBy: { updatedAt: "asc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          responsible: { some: { id: session.user.id } },
          status: { notIn: ["DONE"] },
          dueDate: { lt: now },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
          dependedBy: { select: { id: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          responsible: { some: { id: session.user.id } },
          status: { notIn: ["DONE"] },
          dueDate: { gte: now, lte: in7d },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
          dependedBy: { select: { id: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
      prisma.task.count({
        where: {
          responsible: { some: { id: session.user.id } },
          status: "DONE",
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.task.count({
        where: {
          status: { in: ["ACTIVE", "WORKING_ON_TODAY", "QUEUED"] },
          updatedAt: { lt: fiveDaysAgo },
        },
      }),
      prisma.task.count({
        where: {
          status: "NOT_DONE",
        },
      }),
      prisma.task.count({
        where: {
          status: { notIn: ["DONE"] },
          dueDate: { lt: now },
        },
      }),
      prisma.project.findMany({
        where: { status: "ACTIVE" },
        include: {
          department: { select: { id: true, name: true, color: true } },
          tasks: { select: { status: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.task.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    const taskMap = new Map<string, (typeof myActive)[number]>();
    for (const task of [...myOverdue, ...myBlocked, ...myDueSoon, ...myActive]) {
      if (!taskMap.has(task.id)) taskMap.set(task.id, task);
    }

    const recommendations = Array.from(taskMap.values())
      .map((task) => {
        const priorityWeight = PRIORITY_WEIGHT[task.priority] ?? 1;
        const overdueScore = daysOverdue(task.dueDate) * 2;
        const blockedBonus = task.status === "NOT_DONE" ? 5 : 0;
        const dependencyBonus = (task.dependedBy?.length ?? 0) * 2;
        return {
          ...task,
          recommendationScore: priorityWeight + overdueScore + blockedBonus + dependencyBonus,
        };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 12);

    const projectSummaries = activeProjects.map((project) => {
      const total = project.tasks.length;
      const done = project.tasks.filter((task) => task.status === "DONE").length;
      return {
        id: project.id,
        name: project.name,
        department: project.department,
        totalTasks: total,
        doneTasks: done,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    const taskStatusOverview: Record<string, number> = {};
    for (const status of statusCounts) {
      taskStatusOverview[status.status] = status._count.status;
    }

    return NextResponse.json(
      {
        meta: {
          servedAt: new Date().toISOString(),
          isPartial: false,
        },
        generatedAt: now.toISOString(),
        personal: {
          myActive,
          myBlocked,
          myOverdue,
          myDueSoon,
          myCompletedWeek,
          recommendations,
        },
        team: {
          staleTasks: staleTeam,
          blockedTasks: blockedTeam,
          overdueTasks: overdueTeam,
          taskStatusOverview,
        },
        projects: {
          active: projectSummaries,
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/dashboard/personalized error:", error);
    return NextResponse.json(
      { error: "Failed to load personalized dashboard" },
      { status: 500 }
    );
  }
}
