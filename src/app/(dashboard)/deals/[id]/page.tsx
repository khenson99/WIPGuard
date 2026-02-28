import { DealDetail } from "@/components/deals/deal-detail";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DealDetail dealId={id} />;
}
