import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function getImladrisApiContext(): Promise<
  | { ok: true; context: { userId: string; organizationId: string | null } }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const user = session?.user as { id?: string; organizationId?: string | null } | undefined;
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
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
