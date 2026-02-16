import { notFound } from "next/navigation";
import { AnalyticsSectionPage } from "@/components/analytics/analytics-section-page";
import { getAnalyticsSectionById } from "@/lib/analytics/section-registry";

interface PageProps {
  params: Promise<{ section: string }>;
}

export default async function AnalyticsSectionRoute({ params }: PageProps) {
  const { section } = await params;
  if (!getAnalyticsSectionById(section)) {
    notFound();
  }

  return <AnalyticsSectionPage sectionId={section} />;
}
