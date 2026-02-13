export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const handler = NextAuth(authOptions);

// TEMPORARY: intercept ?diag=1 to return env diagnostics
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  if (req.nextUrl.searchParams.get("diag") === "1") {
    const checks: Record<string, unknown> = {};
    checks.hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;
    checks.nextAuthSecretLength = process.env.NEXTAUTH_SECRET?.length ?? 0;
    checks.nextAuthUrl = process.env.NEXTAUTH_URL ?? "(not set)";
    checks.hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
    checks.hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    checks.nodeEnv = process.env.NODE_ENV ?? "(not set)";
    try {
      const userCount = await prisma.user.count();
      checks.databaseConnected = true;
      checks.userCount = userCount;
    } catch (error) {
      checks.databaseConnected = false;
      checks.databaseError =
        error instanceof Error ? error.message : String(error);
    }
    try {
      const accountCount = await prisma.account.count();
      checks.accountTableAccessible = true;
      checks.accountCount = accountCount;
    } catch (error) {
      checks.accountTableAccessible = false;
      checks.accountError =
        error instanceof Error ? error.message : String(error);
    }
    return NextResponse.json(checks, { status: 200 });
  }
  return (handler as Function)(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  return (handler as Function)(req, context);
}
