import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { createInviteToken, verifyInviteToken } from "@/lib/invite-token";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

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

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "team.invite",
      request,
      targetType: "team_invite",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ttlSeconds = Number.parseInt(
      process.env.INVITE_TOKEN_TTL_SECONDS ?? "",
      10
    );
    const { token, expiresAt } = createInviteToken({
      email: normalizedEmail,
      inviterId: session.user.id,
      ttlSeconds: Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : undefined,
    });

    // Build a signed, expiring invite URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/login?inviteToken=${encodeURIComponent(token)}`;

    await recordSecurityAuditEvent({
      action: "team.invite.create",
      category: "team",
      outcome: "ALLOWED",
      actorId: session.user.id,
      actorRole: permission.role,
      targetType: "invite",
      targetId: normalizedEmail,
      request,
      details: {
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      inviteUrl,
      invitee: normalizedEmail,
      expiresAt,
      message: `Invite link generated for ${normalizedEmail}. In Phase 2 an email will be sent automatically.`,
    });
  } catch (error) {
    console.error("POST /api/team/invite error:", error);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Invite token is required" },
        { status: 400 }
      );
    }

    const verification = verifyInviteToken(token);
    if (!verification.valid || !verification.claims) {
      return NextResponse.json(
        {
          valid: false,
          error: verification.error || "Invalid invite token",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      invite: verification.claims,
    });
  } catch (error) {
    console.error("GET /api/team/invite error:", error);
    return NextResponse.json(
      { error: "Failed to verify invite token" },
      { status: 500 }
    );
  }
}
