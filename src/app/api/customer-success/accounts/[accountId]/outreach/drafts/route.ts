import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import {
  createCustomerSuccessOutreachDraft,
  CustomerSuccessServiceError,
} from "@/lib/customer-success/service";
import type { SendCustomerSuccessOutreachInput } from "@/lib/customer-success/types";

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
  if (
    !body ||
    typeof body.channel !== "string" ||
    typeof body.recipientAddress !== "string" ||
    typeof body.body !== "string"
  ) {
    return NextResponse.json(
      { error: "channel, recipientAddress, and body are required" },
      { status: 400 }
    );
  }

  try {
    const draft = await createCustomerSuccessOutreachDraft(authResult.actor, {
      accountId,
      channel: body.channel as SendCustomerSuccessOutreachInput["channel"],
      recipientAddress: body.recipientAddress,
      recipientName: typeof body.recipientName === "string" ? body.recipientName : undefined,
      templateKey: typeof body.templateKey === "string" ? body.templateKey : undefined,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      body: body.body,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : undefined,
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerSuccessServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create outreach draft",
      },
      { status: 500 }
    );
  }
}
