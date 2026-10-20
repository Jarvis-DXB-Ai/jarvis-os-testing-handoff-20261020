import { ClientSocialV2 } from "@/components/clients/client-section-v2";
import { getCachedSocialPerformance } from "@/lib/social-performance-server";

export default async function ClientSocialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientSocialV2 clientId={id} performance={await getCachedSocialPerformance(id)} />;
}
