import { CustomerSuccessAccountWorkspace } from "@/components/customer-success/account-workspace";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function CustomerSuccessAccountPage({ params }: PageProps) {
  const { accountId } = await params;
  return <CustomerSuccessAccountWorkspace accountId={accountId} />;
}
