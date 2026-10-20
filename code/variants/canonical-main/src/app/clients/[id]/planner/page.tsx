import { ClientPlannerV2 } from "@/components/clients/client-section-v2";
import { loadInitialPlannerData } from "@/lib/planner-initial-server";

export default async function ClientPlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const initial = await loadInitialPlannerData(id, query.plan ?? null);
  return <ClientPlannerV2 clientId={id} detail={initial.detail} />;
}
