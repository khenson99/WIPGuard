export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, unknown> = {};

  // 1. Check NEXTAUTH_SECRET
  checks.hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;
  checks.nextAuthSecretLength = process.env.NEXTAUTH_SECRET?.length ?? 0;

  // 2. Check NEXTAUTH_URL
  checks.nextAuthUrl = process.env.NEXTAUTH_URL ?? "(not set)";

  // 3. Check Google credentials
  checks.hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
  checks.hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;

  // 4. Check database connectivity
  try {
    const userCount = await prisma.user.count();
    checks.databaseConnected = true;
    checks.userCount = userCount;
  } catch (error) {
    checks.databaseConnected = false;
    checks.databaseError =
      error instanceof Error ? error.message : String(error);
  }

  // 5. Check adapter can query accounts table
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
