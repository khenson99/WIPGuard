import { RetentionTenantDetailView } from "@/components/retention/retention-tenant-detail";

interface PageProps {
  params: Promise<{ customerRecordId: string }>;
}

export default async function RetentionTenantPage({ params }: PageProps) {
  const { customerRecordId } = await params;
  return <RetentionTenantDetailView customerRecordId={customerRecordId} />;
}
