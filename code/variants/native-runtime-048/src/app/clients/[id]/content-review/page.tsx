import Link from "next/link";

import Sidebar from "@/components/layout/sidebar";
import ContentFinalReviewWorkspace from "@/components/content/content-final-review-workspace";
import { loadClientFinalReviewManifests } from "@/lib/content-lineage-phase2-server";
import { loadClientManifestPublishingLifecycles } from "@/lib/content-lineage-phase3-server";

export default async function ClientFinalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [manifests, publishingLifecycles] = await Promise.all([
    loadClientFinalReviewManifests(id),
    loadClientManifestPublishingLifecycles(id),
  ]);
  return (
    <div className="ops-dark jarvis-dark-shell min-h-screen text-white">
      <Sidebar />
      <main className="mx-auto w-full max-w-5xl px-5 pb-8 pt-16 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">Content lineage</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Final review</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50">A reviewable snapshot of the exact media, caption, targets, and schedule before the dry-run Publishing handoff.</p>
          </div>
          <Link href={`/workspaces/social-media?client=${id}`} className="rounded-lg border border-white/12 px-3 py-2 text-sm font-medium text-white/70 hover:text-white">Open Content</Link>
        </div>
        <ContentFinalReviewWorkspace clientId={id} initial={manifests} initialPublishingLifecycles={publishingLifecycles} />
      </main>
    </div>
  );
}
