import ClientSocialDesign from "@/components/clients/client-social-design";
import { getCachedSocialPerformance } from "@/lib/social-performance-server";

export default async function ClientSocialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientSocialDesign clientId={id} performance={await getCachedSocialPerformance(id)} />;
}
