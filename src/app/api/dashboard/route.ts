export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const USER_SELECT = {
      id: true,
      name: true,
      email: true,
      image: true,
    } as const;

    // Run all queries concurrently
    const [
      staleTasks,
      upcomingDeadlines,
      overdueTasks,
      blockedTasks,
      atRiskDependencies,
      activeProjects,
      recentlyCompleted,
      statusCounts,
      lastWeekCompleted,
    ] = await Promise.all([
      // Stale tasks: active tasks not updated in 5+ days
      prisma.task.findMany({
        where: {
          status: { in: ["ACTIVE", "WORKING_ON_TODAY", "QUEUED"] },
          updatedAt: { lt: fiveDaysAgo },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
        },
        orderBy: { updatedAt: "asc" },
        take: 15,
      }),

      // Upcoming deadlines: tasks due in the next 7 days
      prisma.task.findMany({
        where: {
          status: { notIn: ["DONE"] },
          dueDate: { gte: now, lte: sevenDaysFromNow },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
        },
        orderBy: { dueDate: "asc" },
        take: 15,
      }),

      // Overdue tasks: past due and not done
      prisma.task.findMany({
        where: {
          status: { notIn: ["DONE"] },
          dueDate: { lt: now },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
        },
        orderBy: { dueDate: "asc" },
        take: 15,
      }),

      // Blocked tasks
      prisma.task.findMany({
        where: {
          status: "NOT_DONE",
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
          dependsOn: {
            select: { id: true, title: true, status: true, dueDate: true },
          },
        },
        take: 10,
      }),

      // At-risk dependency chains: tasks that other tasks depend on,
      // that are not yet done and have a due date approaching
      prisma.task.findMany({
        where: {
          status: { notIn: ["DONE"] },
          dependedBy: { some: {} },
          OR: [
            { dueDate: { lte: sevenDaysFromNow } },
            { updatedAt: { lt: sevenDaysAgo } },
          ],
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
          dependedBy: {
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),

      // Active projects with task counts
      prisma.project.findMany({
        where: { status: "ACTIVE" },
        include: {
          department: { select: { id: true, name: true, color: true } },
          _count: { select: { tasks: true } },
          tasks: {
            select: { status: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),

      // Recently completed tasks (last 7 days)
      prisma.task.findMany({
        where: {
          status: "DONE",
          updatedAt: { gte: sevenDaysAgo },
        },
        include: {
          project: { select: { id: true, name: true } },
          responsible: { select: USER_SELECT },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),

      // Global status distribution
      prisma.task.groupBy({
        by: ["status"],
        _count: { status: true },
      }),

      // Last week's completed count (7-14 days ago) — for velocity comparison
      prisma.task.count({
        where: {
          status: "DONE",
          updatedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
    ]);

    // Compute project summaries with progress + task distribution
    const projectSummaries = activeProjects.map((p) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === "DONE").length;
      const statusDist: Record<string, number> = {};
      for (const t of p.tasks) {
        statusDist[t.status] = (statusDist[t.status] || 0) + 1;
      }
      return {
        id: p.id,
        name: p.name,
        department: p.department,
        totalTasks: total,
        doneTasks: done,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        statusDistribution: statusDist,
      };
    });

    // Format status counts
    const taskStatusOverview: Record<string, number> = {};
    for (const sc of statusCounts) {
      taskStatusOverview[sc.status] = sc._count.status;
    }
    const totalTasks = Object.values(taskStatusOverview).reduce(
      (s, n) => s + n,
      0
    );

    // Compute urgency scores for at-risk dependencies
    const scoredAtRisk = atRiskDependencies.map((t) => {
      const overdueDays = t.dueDate
        ? Math.max(0, Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      const staleDays = Math.floor(
        (now.getTime() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const dependentCount = t.dependedBy?.length || 0;
      const urgencyScore = overdueDays * 2 + dependentCount * 3 + staleDays;
      return { ...t, urgencyScore };
    });
    scoredAtRisk.sort((a, b) => b.urgencyScore - a.urgencyScore);

    return NextResponse.json({
      staleTasks,
      upcomingDeadlines,
      overdueTasks,
      blockedTasks,
      atRiskDependencies: scoredAtRisk,
      projectSummaries,
      recentlyCompleted,
      taskStatusOverview,
      totalTasks,
      velocity: {
        thisWeek: recentlyCompleted.length,
        lastWeek: lastWeekCompleted,
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
