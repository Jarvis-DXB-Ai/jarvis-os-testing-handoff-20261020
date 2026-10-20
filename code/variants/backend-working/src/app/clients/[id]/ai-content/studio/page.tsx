import AiContentStudio from "@/components/ai-content/ai-content-studio";
import { loadInitialAiContentStudio } from "@/lib/ai-content-studio";
import { ClientBrainV2HttpError } from "@/lib/client-brain-v2-server-core";
import Link from "next/link";

export default async function AiContentStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ legacy?: string; session?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
    let initial;
    try {
      initial = await loadInitialAiContentStudio(id, query.session);
    } catch (error) {
      if (error instanceof ClientBrainV2HttpError && error.status === 404) {
        return <section className="rounded-2xl border border-dashed border-white/15 p-6"><h2 className="text-lg font-medium">{query.session ? "Session unavailable" : "Studio needs Client Brain setup"}</h2><p className="mt-3 text-sm text-white/60">{query.session ? "This session could not be found for this client. Select another workspace." : "This client does not use the supported Client Brain architecture yet. Its existing records remain available in Brain."}</p><Link className="mt-4 inline-flex min-h-11 items-center text-sm text-emerald-200" href={query.session ? `/clients/${id}/ai-content/studio` : `/clients/${id}/brain`}>{query.session ? "Open Studio sessions" : "Open Client Brain"} →</Link></section>;
      }
      throw error;
    }
    return <AiContentStudio key={`${id}:${query.session || "latest"}`} clientId={id} initial={initial} />;
}
