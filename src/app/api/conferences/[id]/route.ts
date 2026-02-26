export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { computeConferenceSummary } from "@/lib/conferences/summary";
import { slugify } from "@/lib/conferences/slug";
import {
  ConferenceLeadStatus,
  ConferenceStatus,
  ConferenceType,
  type TaskStatus,
} from "@/generated/prisma/client";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

function parseDate(value: unknown): Date | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
}

function emptyToNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isConferenceStatus(value: unknown): value is (typeof ConferenceStatus)[keyof typeof ConferenceStatus] {
  return typeof value === "string" && Object.values(ConferenceStatus).includes(value as never);
}

function isConferenceType(value: unknown): value is (typeof ConferenceType)[keyof typeof ConferenceType] {
  return typeof value === "string" && Object.values(ConferenceType).includes(value as never);
}

function isConferenceLeadStatus(value: unknown): value is (typeof ConferenceLeadStatus)[keyof typeof ConferenceLeadStatus] {
  return typeof value === "string" && Object.values(ConferenceLeadStatus).includes(value as never);
}

async function ensureUniqueSlug(input: { id: string; slug: string }): Promise<string | null> {
  const nextSlug = slugify(input.slug);
  if (!nextSlug) return null;

  const existing = await prisma.conference.findFirst({
    where: { slug: nextSlug, id: { not: input.id } },
    select: { id: true },
  });
  if (existing) return null;
  return nextSlug;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const conference = await prisma.conference.findUnique({
      where: { id },
      include: {
        owner: { select: USER_SELECT },
        primaryProject: { select: { id: true, name: true } },
        _count: {
          select: {
            deadlines: true,
            leads: true,
            expenses: true,
            tasks: true,
            projects: true,
          },
        },
        deadlines: { orderBy: { dueAt: "asc" } },
        budget: {
          include: {
            lineItems: { orderBy: { createdAt: "asc" } },
          },
        },
        expenses: { orderBy: { incurredAt: "desc" } },
        leads: { orderBy: { capturedAt: "desc" } },
      },
    });

    if (!conference) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    const tasks = await prisma.task.findMany({
      where: { conferenceId: id },
      select: { status: true, dueDate: true },
    });

    const followupIds = Array.from(
      new Set(conference.leads.map((lead) => lead.followupTaskId).filter(Boolean)),
    ) as string[];

    const followupTasks = followupIds.length
      ? await prisma.task.findMany({
          where: { id: { in: followupIds } },
          select: { id: true, status: true },
        })
      : [];

    const followupTasksById: Record<string, { status: TaskStatus } | undefined> = {};
    for (const task of followupTasks) {
      followupTasksById[task.id] = { status: task.status };
    }

    const summary = computeConferenceSummary({
      startDate: conference.startDate,
      endDate: conference.endDate,
      tasks,
      deadlines: conference.deadlines.map((d) => ({ dueAt: d.dueAt, completedAt: d.completedAt })),
      budgetLineItems: conference.budget?.lineItems?.map((li) => ({ plannedAmount: li.plannedAmount })) ?? [],
      expenses: conference.expenses.map((e) => ({ amount: e.amount })),
      leads: conference.leads.map((lead) => ({
        status: isConferenceLeadStatus(lead.status) ? lead.status : ConferenceLeadStatus.NEW,
        pushedToHubspotAt: lead.pushedToHubspotAt,
        followupTaskId: lead.followupTaskId,
      })),
      followupTasksById,
    });

    return NextResponse.json({
      conference,
      summary,
      meta: {
        servedAt: new Date().toISOString(),
        isPartial: false,
      },
    });
  } catch (error) {
    console.error("Failed to fetch conference:", error);
    return NextResponse.json(
      { error: "Failed to fetch conference" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "conference.write",
      request,
      targetType: "conference",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const existing = await prisma.conference.findUnique({
      where: { id },
      select: { id: true, startDate: true, endDate: true, slug: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      data.name = body.name.trim();
    }

    if (body.slug !== undefined) {
      if (typeof body.slug !== "string" || body.slug.trim().length === 0) {
        return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
      }
      const unique = await ensureUniqueSlug({ id, slug: body.slug });
      if (!unique) {
        return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
      }
      data.slug = unique;
    }

    if (body.startDate !== undefined) {
      const parsed = parseDate(body.startDate);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
      }
      data.startDate = parsed;
    }
    if (body.endDate !== undefined) {
      const parsed = parseDate(body.endDate);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
      }
      data.endDate = parsed;
    }

    const nextStart = (data.startDate as Date | undefined) ?? existing.startDate;
    const nextEnd = (data.endDate as Date | undefined) ?? existing.endDate;
    if (nextStart.getTime() > nextEnd.getTime()) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
        { status: 400 },
      );
    }

    if (body.timezone !== undefined) {
      if (body.timezone === null) {
        data.timezone = "UTC";
      } else if (typeof body.timezone === "string" && body.timezone.trim().length > 0) {
        data.timezone = body.timezone.trim();
      } else {
        return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
      }
    }

    if (body.status !== undefined) {
      if (body.status === null) {
        return NextResponse.json({ error: "status cannot be null" }, { status: 400 });
      }
      if (!isConferenceStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status;
    }

    if (body.type !== undefined) {
      if (body.type === null) {
        return NextResponse.json({ error: "type cannot be null" }, { status: 400 });
      }
      if (!isConferenceType(body.type)) {
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
      }
      data.type = body.type;
    }

    if (body.ownerId !== undefined) {
      if (body.ownerId === null) {
        data.ownerId = null;
      } else if (typeof body.ownerId === "string" && body.ownerId.trim().length > 0) {
        data.ownerId = body.ownerId.trim();
      } else {
        return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });
      }
    }

    const directStringFields = [
      "websiteUrl",
      "city",
      "region",
      "country",
      "venue",
      "notes",
      "slackChannelId",
      "slackChannelName",
      "slackChannelUrl",
      "driveFolderUrl",
      "codaDocUrl",
    ] as const;
    for (const key of directStringFields) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        data[key] = emptyToNull(body[key]);
      }
    }

    const updated = await prisma.conference.update({
      where: { id },
      data,
      include: {
        owner: { select: USER_SELECT },
        primaryProject: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update conference:", error);
    return NextResponse.json(
      { error: "Failed to update conference" },
      { status: 500 },
    );
  }
}
