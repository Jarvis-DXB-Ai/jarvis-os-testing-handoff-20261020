import { ClientOverviewV2 } from "@/components/clients/client-section-v2";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientOverviewV2 clientId={id} />;
}
