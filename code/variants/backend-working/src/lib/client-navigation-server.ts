import "server-only";

import { loadClientAttentionBase } from "@/lib/home-dashboard-server";
import { measureServerLoader } from "@/lib/server-performance";

export type ClientNavigationEntry = {
  id: string;
  name: string;
  attentionCount: number;
  logoUrl: null;
  isTestFixture: boolean;
};

/** A deliberately small, client-scoped navigation model. */
export async function loadClientNavigation(): Promise<ClientNavigationEntry[]> {
  return measureServerLoader("navigation.client-tree", 3, async () => {
    const base = await loadClientAttentionBase();
    const attentionByClient = new Map<string, number>();
    for (const signal of base.attention) {
      if (!signal.clientId) continue;
      attentionByClient.set(
        signal.clientId,
        (attentionByClient.get(signal.clientId) ?? 0) + 1,
      );
    }
    return base.clients.map((client) => ({
      id: client.id,
      name: client.name,
      attentionCount: attentionByClient.get(client.id) ?? 0,
      logoUrl: null,
      isTestFixture: process.env.JARVIS_ISOLATED_TEST === "1" && client.name.startsWith("TEST "),
    }));
  });
}
