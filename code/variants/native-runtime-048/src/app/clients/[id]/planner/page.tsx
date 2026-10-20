import ClientPlannerDesign from "@/components/clients/client-planner-design";
import MonthlyPlansStageOne from "@/components/social/monthly-plans-stage-one";
import Link from "next/link";
import { loadInitialPlannerData } from "@/lib/planner-initial-server";

export default async function ClientPlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string; workflow?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (query.workflow === "1" || query.plan === "new") return <><Link className="inline-flex min-h-11 items-center text-sm text-emerald-200" href={`/clients/${id}/planner${query.plan && query.plan !== "new" ? `?plan=${encodeURIComponent(query.plan)}` : ""}`}>← Back to feed overview</Link><MonthlyPlansStageOne clientId={id} /></>;
  const initial = await loadInitialPlannerData(id, query.plan ?? null);
  return <ClientPlannerDesign clientId={id} detail={initial.detail} plans={initial.plans} content={initial.content} />;
}
