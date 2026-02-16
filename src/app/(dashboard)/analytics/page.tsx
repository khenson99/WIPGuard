"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnalyticsSummaryPage } from "@/components/analytics/analytics-summary-page";
import { LEGACY_ANALYTICS_TAB_REDIRECTS } from "@/lib/analytics/section-registry";

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (!tab) return;

    const target = LEGACY_ANALYTICS_TAB_REDIRECTS[tab];
    if (target) {
      router.replace(target);
    }
  }, [router, searchParams]);

  return <AnalyticsSummaryPage />;
}
