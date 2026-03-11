import { buildDailyCountSeriesUtc } from "@/lib/dashboard-trends";
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

export interface DashboardTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  project: { id: string; name: string } | null;
  recommendationScore?: number;
}

export interface PersonalizedDashboardPayload {
  generatedAt: string;
  meta?: {
    servedAt: string;
    isPartial: boolean;
  };
  personal: {
    myActive: DashboardTask[];
    myBlocked: DashboardTask[];
    myOverdue: DashboardTask[];
    myDueSoon: DashboardTask[];
    myCompletedWeek: number;
    completedByDay?: Array<{ date: string; count: number }>;
    recommendations: DashboardTask[];
  };
  team: {
    staleTasks: number;
    blockedTasks: number;
    overdueTasks: number;
    taskStatusOverview: Record<string, number>;
  };
  projects: {
    active: Array<{
      id: string;
      name: string;
      progress: number;
      doneTasks: number;
      totalTasks: number;
    }>;
  };
}

function daysOverdue(value: Date | null): number {
  if (!value) return 0;
  const diff = Date.now() - value.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function loadPersonalizedDashboard(
  userId: string,
): Promise<PersonalizedDashboardPayload> {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const completedTrendStartUtc = new Date(todayUtc.getTime() - 13 * 24 * 60 * 60 * 1000);
  const completedTrendEndExclusiveUtc = new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000);
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    myActive,
    myBlocked,
    myOverdue,
    myDueSoon,
    myCompletedWeek,
    completedTimestamps,
    staleTeam,
    blockedTeam,
    overdueTeam,
    activeProjects,
    statusCounts,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        responsible: { some: { id: userId } },
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
        responsible: { some: { id: userId } },
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
        responsible: { some: { id: userId } },
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
        responsible: { some: { id: userId } },
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
        responsible: { some: { id: userId } },
        status: "DONE",
        updatedAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.task.findMany({
      where: {
        responsible: { some: { id: userId } },
        status: "DONE",
        updatedAt: { gte: completedTrendStartUtc, lt: completedTrendEndExclusiveUtc },
      },
      select: { updatedAt: true },
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

  const completedByDay = buildDailyCountSeriesUtc({
    now,
    days: 14,
    timestamps: completedTimestamps.map((row) => row.updatedAt),
  });

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
      totalTasks: total,
      doneTasks: done,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  const taskStatusOverview: Record<string, number> = {};
  for (const status of statusCounts) {
    taskStatusOverview[status.status] = status._count.status;
  }

  return {
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
      completedByDay,
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
  };
}
