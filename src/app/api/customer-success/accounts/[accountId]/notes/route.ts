import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import {
  createCustomerSuccessNote,
  CustomerSuccessServiceError,
} from "@/lib/customer-success/service";
import type { CreateCustomerSuccessNoteInput } from "@/lib/customer-success/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request, "analytics.write");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { accountId } = await params;
  if (!accountId) {
    return NextResponse.json({ error: "Account id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.body !== "string" || body.body.trim().length === 0) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  try {
    const note = await createCustomerSuccessNote(authResult.actor, {
      accountId,
      title: typeof body.title === "string" ? body.title : undefined,
      body: body.body,
      source:
        typeof body.source === "string"
          ? (body.source as CreateCustomerSuccessNoteInput["source"])
          : undefined,
      visibility:
        typeof body.visibility === "string"
          ? (body.visibility as CreateCustomerSuccessNoteInput["visibility"])
          : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : undefined,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerSuccessServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create customer success note",
      },
      { status: 500 }
    );
  }
}
