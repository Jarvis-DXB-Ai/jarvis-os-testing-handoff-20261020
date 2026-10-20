import "server-only";

import { clientBrainV2ServerClient as db, isUuid } from "@/lib/client-brain-v2-server-core";
import { getCachedSocialPerformance } from "@/lib/social-performance-server";
import { getSocialProviderConnections } from "@/lib/social-provider-connections-server";
import { measureServerLoader } from "@/lib/server-performance";

export async function loadSocialWorkspaceInitial(clientId: string) {
  if (!isUuid(clientId)) throw new Error("Invalid client ID.");
  return measureServerLoader("social.initial", 7, async () => {
    const [clientResult, providerResult, performanceResult] = await Promise.all([
      db.from("clients").select("id,name").eq("id", clientId).maybeSingle(),
      getSocialProviderConnections(clientId),
      getCachedSocialPerformance(clientId),
    ]);
    if (clientResult.error || !clientResult.data) throw new Error("Client not found.");
    return {
      clientName: clientResult.data.name as string,
      providerSnapshot: providerResult,
      performance: performanceResult,
    };
  });
}
