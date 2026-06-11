import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy Company Tracker route.
 *
 * The redesigned founder cockpit (design handoff: Imladris metric dashboards)
 * shipped at `/operating/company` and is now the canonical Company Tracker.
 * This route exists only so existing links and bookmarks keep working; it
 * forwards the query string so `?demo` opt-in survives the redirect.
 */
export default async function LegacyCompanyTrackerRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      qs.append(key, "");
    } else if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.append(key, value);
    }
  }
  const query = qs.toString();
  redirect(query ? `/operating/company?${query}` : "/operating/company");
}
