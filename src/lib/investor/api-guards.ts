import { NextResponse } from "next/server";
import { normalizeRole } from "@/lib/permissions";

export function investorForbiddenResponse(role: string | null | undefined): NextResponse | null {
  if (normalizeRole(role) !== "investor") return null;
  return NextResponse.json(
    { error: "Forbidden: investors must use investor-scoped APIs" },
    { status: 403 },
  );
}
