import { notFound, redirect } from "next/navigation";
import { AnalyticsSectionPage } from "@/components/analytics/analytics-section-page";
import {
  getAnalyticsPrimarySectionById,
  getAnalyticsSubSectionById,
  LEGACY_ANALYTICS_ROUTE_REDIRECTS,
} from "@/lib/analytics/section-registry";

interface PageProps {
  params: Promise<{ section: string }>;
}

export default async function AnalyticsSectionRoute({ params }: PageProps) {
  const { section } = await params;
  const legacyTarget = LEGACY_ANALYTICS_ROUTE_REDIRECTS[section];
  const canonicalPath = `/analytics/${section}`;
  if (legacyTarget && legacyTarget !== canonicalPath) {
    redirect(legacyTarget);
  }

  if (!getAnalyticsPrimarySectionById(section) && !getAnalyticsSubSectionById(section)) {
    notFound();
  }

  return <AnalyticsSectionPage sectionId={section} />;
}
