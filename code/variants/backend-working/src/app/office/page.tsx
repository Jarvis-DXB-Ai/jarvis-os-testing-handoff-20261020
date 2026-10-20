import Sidebar from "@/components/layout/sidebar";
import OfficeWorkspace from "@/components/office/office-workspace";
import { loadAgentsV2Snapshot } from "@/lib/agents-v2-server";
import { loadAgentRunsSnapshot } from "@/lib/agent-runtime-server";

import {clientOfficeCatalog} from "@/lib/office-client-intake-server";
import {defaultOfficeClient} from "@/lib/office-client-view.mjs";
import {notFound} from "next/navigation";

export const dynamic = "force-dynamic";
export default async function OfficePage({ searchParams }: { searchParams: Promise<{ mode?: string;clientId?:string;scope?:string }> }) {
  const {mode,clientId:requested,scope}=await searchParams;
  const {clients}=await clientOfficeCatalog();
  let clientId:string;try{clientId=defaultOfficeClient(clients,requested,scope);}catch{notFound();}
  const [agents, runtime] = await Promise.allSettled([loadAgentsV2Snapshot(), loadAgentRunsSnapshot()]);
  return <><Sidebar variant="office" /><OfficeWorkspace initialClientId={clientId} initialMode={mode === "test" ? "test" : undefined} initialAgents={agents.status === "fulfilled" ? agents.value : null} initialRuntime={runtime.status === "fulfilled" ? runtime.value : null} /></>;
}
