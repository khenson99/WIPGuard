import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeRole } from "@/lib/permissions";

export async function getImladrisApiContext(): Promise<
  | { ok: true; context: { userId: string; organizationId: string | null } }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string | null; organizationId?: string | null } | undefined;
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (normalizeRole(user.role) === "investor") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: investors must use investor-scoped APIs" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
    },
  };
}
