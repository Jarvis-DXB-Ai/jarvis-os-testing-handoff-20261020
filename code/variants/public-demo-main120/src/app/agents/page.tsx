import Sidebar from "@/components/layout/sidebar";
import AgentsCompanyWorkspace from "@/components/agents/agents-company-workspace";
import { loadAgentsV2Snapshot } from "@/lib/agents-v2-server";
import { loadAgentRunsSnapshot } from "@/lib/agent-runtime-server";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view }, organisationResult, runtimeResult] = await Promise.all([
    searchParams,
    loadAgentsV2Snapshot().then(value => ({ value })).catch(() => ({ value: null })),
    loadAgentRunsSnapshot().then(value => ({ value })).catch(() => ({ value: null })),
  ]);
  return (
    <>
      <Sidebar />
      <AgentsCompanyWorkspace
        initialSnapshot={organisationResult.value}
        runtimeSnapshot={runtimeResult.value}
        initialView={view === "runs" ? "runs" : "organisation"}
      />
    </>
  );
}
