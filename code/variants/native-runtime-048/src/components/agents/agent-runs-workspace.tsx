"use client";

import type { AgentRunsSnapshot } from "@/lib/agent-runtime";
import { AgentRunsPanel } from "@/components/agents/agent-runs-panel";

export default function AgentRunsWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: AgentRunsSnapshot;
}) {
  return (
    <main className="min-h-screen w-full bg-[#0a0a0b] pl-[72px] text-white">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
        <AgentRunsPanel initialSnapshot={initialSnapshot} />
      </div>
    </main>
  );
}
