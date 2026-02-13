import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/team/invite
 *
 * In Phase 1 this validates the email and returns a sharable invite URL.
 * Phase 2 will integrate an email provider (SendGrid / SES) to actually
 * deliver an invitation email.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 },
      );
    }

    // Build the invite URL (Phase 1: login page with hint)
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/login?invited=true&email=${encodeURIComponent(email)}`;

    return NextResponse.json({
      success: true,
      inviteUrl,
      message: `Invite link generated for ${email}. In Phase 2 an email will be sent automatically.`,
    });
  } catch (error) {
    console.error("POST /api/team/invite error:", error);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 },
    );
  }
}
