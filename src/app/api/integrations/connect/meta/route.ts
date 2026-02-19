export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { GET as connectProviderGet } from "@/app/api/integrations/connect/[provider]/route";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode")?.trim().toLowerCase();
  const provider =
    mode === "page" || mode === "instagram" ? "meta-page" : "meta-ads";

  return connectProviderGet(request, {
    params: Promise.resolve({ provider }),
  });
}
