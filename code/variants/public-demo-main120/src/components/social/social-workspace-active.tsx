"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SocialPerformanceOverview } from "@/lib/social-performance";
import type { SocialProviderConnectionsSnapshot } from "@/lib/social-provider-connections";

const CachedSocialPerformanceOverview = dynamic(() => import("@/components/social/cached-social-performance-overview"));
const SocialPublishingWorkspace = dynamic(() => import("@/components/social/social-publishing-workspace"), {
  loading: () => <div className="rounded-[18px] border border-white/[.08] bg-[#121214] p-8 text-sm text-white/45">Loading content calendar…</div>,
});

type Initial = {
  clientName: string;
  providerSnapshot: SocialProviderConnectionsSnapshot;
  performance: SocialPerformanceOverview;
};

function activeTab() {
  if (typeof window === "undefined") return "dashboard";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested === "publishing" || requested === "planner" ? "publishing" : "dashboard";
}

export default function SocialWorkspaceActive({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState(activeTab);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/clients/${encodeURIComponent(clientId)}/social-workspace`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string } & Partial<Initial>;
        if (!response.ok || !payload.ok || !payload.clientName || !payload.providerSnapshot || !payload.performance) throw new Error(payload.error || "Unable to load Social.");
        if (active) setInitial(payload as Initial);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load Social."); });
    const sync = () => setTab(activeTab());
    window.addEventListener("popstate", sync);
    return () => { active = false; window.removeEventListener("popstate", sync); };
  }, [clientId]);
  if (error) return <p className="rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>;
  if (!initial) return <div className="min-h-[42vh] rounded-[18px] border border-white/[.08] bg-[#121214] p-8 text-sm text-white/45">Loading cached Social workspace…</div>;
  return <section className="min-w-0 space-y-5"><nav aria-label="Social workspace" className="flex gap-2"><Link href={`/clients/${clientId}/social`} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === "dashboard" ? "bg-emerald-300 text-black" : "border border-white/[.1] text-white/58"}`}>Overview</Link><Link href={`/clients/${clientId}/social?tab=publishing`} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === "publishing" ? "bg-emerald-300 text-black" : "border border-white/[.1] text-white/58"}`}>Content calendar</Link></nav>{tab === "publishing" ? <SocialPublishingWorkspace clientId={clientId} clientName={initial.clientName} /> : <CachedSocialPerformanceOverview clientId={clientId} providerSnapshot={initial.providerSnapshot} initialPerformance={initial.performance} />}</section>;
}
