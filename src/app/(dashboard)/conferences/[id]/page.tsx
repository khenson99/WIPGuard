import { ConferenceDetail } from "@/components/conferences/conference-detail";

export default async function ConferenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConferenceDetail conferenceId={id} />;
}

