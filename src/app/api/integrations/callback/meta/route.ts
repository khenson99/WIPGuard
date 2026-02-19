export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { GET as callbackProviderGet } from "@/app/api/integrations/callback/[provider]/route";
import { getOAuthStateCookieName } from "@/lib/integrations/oauth";

export async function GET(request: NextRequest) {
  // Backward-compatible alias route for historical /callback/meta redirect URIs.
  // Prefer whichever canonical provider has a pending OAuth state cookie.
  const hasMetaPageState = request.cookies.has(getOAuthStateCookieName("meta-page"));
  const provider = hasMetaPageState ? "meta-page" : "meta-ads";

  return callbackProviderGet(request, {
    params: Promise.resolve({ provider }),
  });
}
