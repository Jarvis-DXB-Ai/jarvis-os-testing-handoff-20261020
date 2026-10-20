import { Suspense } from "react";
import { ClientOverviewV2 } from "@/components/clients/client-section-v2";
import { loadClientOverview } from "@/lib/client-overview-server";

async function OverviewContent({ clientId }: { clientId: string }) {
  const data = await loadClientOverview(clientId, { includeMedia: false }).catch(() => null);
  if (!data) return <div role="alert" className="client-v2-empty">Overview is temporarily unavailable. <a href={`/clients/${clientId}`}>Try again</a></div>;
  return <ClientOverviewV2 clientId={clientId} initialData={data} />;
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div role="status" className="client-v2-loading">Loading overview…</div>}>
    <OverviewContent clientId={id} />
  </Suspense>;
}
