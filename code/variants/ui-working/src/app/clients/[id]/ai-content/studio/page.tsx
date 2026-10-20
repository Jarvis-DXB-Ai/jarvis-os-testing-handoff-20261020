import AiContentStudio from "@/components/ai-content/ai-content-studio";
import { ClientStudioV2 } from "@/components/clients/client-section-v2";
import { loadInitialAiContentStudio } from "@/lib/ai-content-studio";
import { ClientBrainV2HttpError } from "@/lib/client-brain-v2-server-core";
import { loadInitialPlannerData } from "@/lib/planner-initial-server";
import { redirect } from "next/navigation";

export default async function AiContentStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ legacy?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (query.legacy === "1") {
    let initial;
    try {
      initial = await loadInitialAiContentStudio(id);
    } catch (error) {
      // Legacy Studio is only available to Client Brain v2 clients. Keep older
      // links safe for every other client by returning to the canonical Studio.
      if (error instanceof ClientBrainV2HttpError && error.status === 404) {
        redirect(`/clients/${id}/ai-content/studio`);
      }
      throw error;
    }
    return <AiContentStudio clientId={id} initial={initial} />;
  }
  return <ClientStudioV2 clientId={id} detail={(await loadInitialPlannerData(id, null)).detail} />;
}
