export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { buildDefaultConferenceSlug, slugify } from "@/lib/conferences/slug";
import { ConferenceStatus, ConferenceType } from "@/generated/prisma/client";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

function parseDate(value: unknown): Date | null {
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

async function ensureUniqueSlug(input: { slug: string }): Promise<string> {
  const baseSlug = slugify(input.slug);
  let candidate = baseSlug;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.conference.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conferences = await prisma.conference.findMany({
      include: {
        owner: { select: USER_SELECT },
        _count: {
          select: {
            deadlines: true,
            leads: true,
            expenses: true,
            tasks: true,
            projects: true,
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    const includeMeta = request.nextUrl.searchParams.get("meta") === "true";
    if (!includeMeta) {
      return NextResponse.json(conferences);
    }

    return NextResponse.json({
      items: conferences,
      meta: {
        servedAt: new Date().toISOString(),
        isPartial: false,
      },
    });
  } catch (error) {
    console.error("Failed to fetch conferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch conferences" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "conference.write",
      request,
      targetType: "conference",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 },
      );
    }
    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
        { status: 400 },
      );
    }

    const providedSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    const computedSlug = providedSlug
      ? slugify(providedSlug)
      : buildDefaultConferenceSlug({ name, startDate });
    const slug = await ensureUniqueSlug({ slug: computedSlug });

    const timezone = typeof body.timezone === "string" && body.timezone.trim().length > 0 ? body.timezone.trim() : "UTC";

    const status = body.status;
    if (status !== undefined && status !== null && !isConferenceStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const type = body.type;
    if (type !== undefined && type !== null && !isConferenceType(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const ownerId =
      typeof body.ownerId === "string" && body.ownerId.trim().length > 0
        ? body.ownerId.trim()
        : session.user.id;

    const conference = await prisma.conference.create({
      data: {
        slug,
        name,
        startDate,
        endDate,
        timezone,
        status: isConferenceStatus(status) ? status : undefined,
        type: isConferenceType(type) ? type : undefined,
        ownerId,
        websiteUrl: emptyToNull(body.websiteUrl) ?? undefined,
        city: emptyToNull(body.city) ?? undefined,
        region: emptyToNull(body.region) ?? undefined,
        country: emptyToNull(body.country) ?? undefined,
        venue: emptyToNull(body.venue) ?? undefined,
        notes: emptyToNull(body.notes) ?? undefined,
        slackChannelId: emptyToNull(body.slackChannelId) ?? undefined,
        slackChannelName: emptyToNull(body.slackChannelName) ?? undefined,
        slackChannelUrl: emptyToNull(body.slackChannelUrl) ?? undefined,
        driveFolderUrl: emptyToNull(body.driveFolderUrl) ?? undefined,
        codaDocUrl: emptyToNull(body.codaDocUrl) ?? undefined,
      },
      include: {
        owner: { select: USER_SELECT },
        _count: {
          select: {
            deadlines: true,
            leads: true,
            expenses: true,
            tasks: true,
            projects: true,
          },
        },
      },
    });

    return NextResponse.json(conference, { status: 201 });
  } catch (error) {
    console.error("Failed to create conference:", error);
    return NextResponse.json(
      { error: "Failed to create conference" },
      { status: 500 },
    );
  }
}

