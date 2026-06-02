import { ConferenceExpenseCategory } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
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
  createdDeadlineCount: number;
  createdBudgetLineItemCount: number;
}> {
  const template = input.template ?? EXHIBITING_PLAYBOOK;

  return prisma.$transaction(async (tx) => {
    let createdDeadlineCount = 0;

    for (const deadline of template.deadlines) {
      const anchor = deadline.anchor === "end" ? input.endDate : input.startDate;
      const dueAt = addDays(anchor, deadline.offsetDays);

      await tx.conferenceDeadline.create({
        data: {
          conferenceId: input.conferenceId,
          type: deadline.type,
          name: deadline.name,
          dueAt,
          ownerId: input.userId,
        },
      });
      createdDeadlineCount += 1;
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

    return {
      createdDeadlineCount,
      createdBudgetLineItemCount: template.defaultBudgetLineItems.length,
    };
  });
}
