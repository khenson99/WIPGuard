export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { SavedViewScope, type Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  createSavedView,
  getSavedViews,
  toSavedViewScope,
} from "@/lib/saved-views";

function asJsonObject(value: unknown): Prisma.InputJsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.InputJsonValue;
}

function scopeFromRequest(request: NextRequest): SavedViewScope | null {
  return toSavedViewScope(request.nextUrl.searchParams.get("scope"));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = scopeFromRequest(request);
    if (!scope) {
      return NextResponse.json(
        { error: "scope query param is required (tasks|projects)" },
        { status: 400 }
      );
    }

    const views = await getSavedViews(session.user.id, scope);
    return NextResponse.json(views);
  } catch (error) {
    console.error("GET /api/views error:", error);
    return NextResponse.json({ error: "Failed to fetch views" }, { status: 500 });
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
      action: "profile.write",
      request,
      targetType: "saved_view",
      targetId: session.user.id,
    });

    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => null)) as
      | {
          scope?: string;
          name?: string;
          slug?: string;
          config?: unknown;
          isDefault?: boolean;
        }
      | null;

    if (!body?.scope || !body?.name) {
      return NextResponse.json(
        { error: "scope and name are required" },
        { status: 400 }
      );
    }

    const scope = toSavedViewScope(body.scope);
    if (!scope) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    const config = asJsonObject(body.config ?? {});
    if (!config) {
      return NextResponse.json(
        { error: "config must be a JSON object" },
        { status: 400 }
      );
    }

    const created = await createSavedView({
      userId: session.user.id,
      scope,
      name: body.name,
      slug: body.slug,
      config,
      isDefault: body.isDefault,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
