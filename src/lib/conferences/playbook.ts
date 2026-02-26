import {
  ConferenceExpenseCategory,
  TaskStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";
import { EXHIBITING_PLAYBOOK, type ConferencePlaybookTemplate } from "@/lib/conferences/templates";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveBudgetCategory(value: unknown): ConferenceExpenseCategory {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  switch (raw) {
    case "SPONSORSHIP":
      return ConferenceExpenseCategory.SPONSORSHIP;
    case "BOOTH":
      return ConferenceExpenseCategory.BOOTH;
    case "SWAG":
      return ConferenceExpenseCategory.SWAG;
    case "SHIPPING":
      return ConferenceExpenseCategory.SHIPPING;
    case "TRAVEL":
      return ConferenceExpenseCategory.TRAVEL;
    case "LODGING":
      return ConferenceExpenseCategory.LODGING;
    case "MEALS":
      return ConferenceExpenseCategory.MEALS;
    case "EVENTS":
      return ConferenceExpenseCategory.EVENTS;
    case "SOFTWARE":
      return ConferenceExpenseCategory.SOFTWARE;
    default:
      return ConferenceExpenseCategory.OTHER;
  }
}

export async function applyConferencePlaybook(input: {
  userId: string;
  conferenceId: string;
  conferenceName: string;
  startDate: Date;
  endDate: Date;
  template?: ConferencePlaybookTemplate;
}): Promise<{
  primaryProjectId: string;
  workstreamProjectIds: Record<string, string>;
  createdDeadlineCount: number;
  createdTaskCount: number;
}> {
  const template = input.template ?? EXHIBITING_PLAYBOOK;

  return prisma.$transaction(async (tx) => {
    const parentProject = await tx.project.create({
      data: {
        name: `Conference: ${input.conferenceName}`,
        description: template.description,
        status: "ACTIVE",
        projectType: "ONE_OFF",
        conferenceId: input.conferenceId,
        responsible: { connect: [{ id: input.userId }] },
        accountable: { connect: [{ id: input.userId }] },
      },
      select: { id: true },
    });

    const workstreamProjectIds: Record<string, string> = {};

    for (const workstream of template.workstreams) {
      const project = await tx.project.create({
        data: {
          name: workstream.name,
          description: `Workstream for ${input.conferenceName}.`,
          status: "ACTIVE",
          projectType: "ONE_OFF",
          parentId: parentProject.id,
          conferenceId: input.conferenceId,
          responsible: { connect: [{ id: input.userId }] },
          accountable: { connect: [{ id: input.userId }] },
        },
        select: { id: true },
      });
      workstreamProjectIds[workstream.key] = project.id;
    }

    await tx.conference.update({
      where: { id: input.conferenceId },
      data: { primaryProjectId: parentProject.id },
      select: { id: true },
    });

    let createdDeadlineCount = 0;
    let createdTaskCount = 0;

    for (const deadline of template.deadlines) {
      const anchor = deadline.anchor === "end" ? input.endDate : input.startDate;
      const dueAt = addDays(anchor, deadline.offsetDays);
      const projectId = workstreamProjectIds[deadline.workstreamKey] ?? parentProject.id;

      const createdDeadline = await tx.conferenceDeadline.create({
        data: {
          conferenceId: input.conferenceId,
          type: deadline.type,
          name: deadline.name,
          dueAt,
          ownerId: input.userId,
        },
        select: { id: true },
      });
      createdDeadlineCount += 1;

      if (deadline.createTask) {
        const columnOrder = await getNextColumnOrder(tx as unknown as Prisma.TransactionClient, TaskStatus.BACKLOG);
        const task = await tx.task.create({
          data: {
            title: `[Deadline] ${deadline.name}`,
            notes: `Conference deadline: ${deadline.name}`,
            status: TaskStatus.BACKLOG,
            priority: "P2",
            degreeOfDifficulty: "MEDIUM",
            dueDate: dueAt,
            assignedOn: new Date(),
            conferenceId: input.conferenceId,
            projectId,
            columnOrder,
            responsible: { connect: [{ id: input.userId }] },
            accountable: { connect: [{ id: input.userId }] },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: TaskStatus.BACKLOG,
                changedBy: input.userId,
              },
            },
          },
          select: { id: true },
        });
        createdTaskCount += 1;

        await tx.conferenceDeadline.update({
          where: { id: createdDeadline.id },
          data: { taskId: task.id },
          select: { id: true },
        });
      }
    }

    // Budget scaffold (0 amounts by default, can be edited later).
    const budget = await tx.conferenceBudget.create({
      data: {
        conferenceId: input.conferenceId,
        currency: "USD",
        notes: "Seeded by playbook. Edit planned amounts and add expenses as you go.",
      },
      select: { id: true },
    });

    await tx.conferenceBudgetLineItem.createMany({
      data: template.defaultBudgetLineItems.map((item) => ({
        budgetId: budget.id,
        category: resolveBudgetCategory(item.categoryKey),
        label: item.label,
        plannedAmount: Number.isFinite(item.plannedAmount) ? item.plannedAmount : 0,
        notes: null,
      })),
    });

    // Runbook tasks
    for (const runbook of template.runbookTasks) {
      const projectId = workstreamProjectIds[runbook.workstreamKey] ?? parentProject.id;
      const columnOrder = await getNextColumnOrder(tx as unknown as Prisma.TransactionClient, TaskStatus.BACKLOG);

      if (Array.isArray(runbook.checklist) && runbook.checklist.length > 0) {
        const parent = await tx.task.create({
          data: {
            title: runbook.title,
            notes: runbook.notes ?? null,
            status: TaskStatus.BACKLOG,
            priority: "P2",
            degreeOfDifficulty: "MEDIUM",
            assignedOn: new Date(),
            conferenceId: input.conferenceId,
            projectId,
            columnOrder,
            responsible: { connect: [{ id: input.userId }] },
            accountable: { connect: [{ id: input.userId }] },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: TaskStatus.BACKLOG,
                changedBy: input.userId,
              },
            },
          },
          select: { id: true },
        });
        createdTaskCount += 1;

        await tx.task.createMany({
          data: runbook.checklist.map((title, index) => ({
            title,
            notes: null,
            status: TaskStatus.BACKLOG,
            priority: "P2",
            degreeOfDifficulty: "LOW",
            parentId: parent.id,
            conferenceId: input.conferenceId,
            projectId,
            columnOrder: index,
          })),
        });
        createdTaskCount += runbook.checklist.length;
      } else {
        await tx.task.create({
          data: {
            title: runbook.title,
            notes: runbook.notes ?? null,
            status: TaskStatus.BACKLOG,
            priority: "P2",
            degreeOfDifficulty: "MEDIUM",
            assignedOn: new Date(),
            conferenceId: input.conferenceId,
            projectId,
            columnOrder,
            responsible: { connect: [{ id: input.userId }] },
            accountable: { connect: [{ id: input.userId }] },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: TaskStatus.BACKLOG,
                changedBy: input.userId,
              },
            },
          },
          select: { id: true },
        });
        createdTaskCount += 1;
      }
    }

    return {
      primaryProjectId: parentProject.id,
      workstreamProjectIds,
      createdDeadlineCount,
      createdTaskCount,
    };
  });
}

