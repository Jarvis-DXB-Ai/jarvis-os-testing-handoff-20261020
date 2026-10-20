import "server-only";
import { profileRevision } from "@/lib/client-profile-image";
import type { SocialPlatformSummary } from "@/components/clients/client-workspace-context";

import { clientLogoUrls } from "@/lib/home-dashboard-server";
import {
  clientBrainV2ServerClient as db,
  ClientBrainV2HttpError,
  isUuid,
} from "@/lib/client-brain-v2-server-core";
import { measureServerLoader } from "@/lib/server-performance";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export type ClientWorkspaceChrome = {
  client: {
    id: string;
    name: string;
    industry: string | null;
    status: string;
    logoUrl: string | null;
    coverUrl: string | null;
  };
  performance?: { instagram: SocialPlatformSummary | null; facebook: SocialPlatformSummary | null; syncedAt: string | null };
};

/**
 * Shared identity, private profile previews and compact cached headline metrics.
 * Domain pages retain detailed observations; this never calls the provider.
 */
export async function loadClientWorkspaceChrome(
  clientId: string,
): Promise<ClientWorkspaceChrome> {
  if (!isUuid(clientId))
    throw new ClientBrainV2HttpError("Invalid client ID.", 400);
  return measureServerLoader("client-workspace.chrome", 4, async () => {
    const [clientResult, logoResult, snapshots, cover, avatar] = await Promise.all([
      db
        .from("clients")
        .select("id,name,industry,status")
        .eq("id", clientId)
        .maybeSingle(),
      db
        .from("client_brain_v2_records")
        .select("client_id,metadata")
        .eq("client_id", clientId)
        .eq("top_section", "brand_guidelines")
        .eq("subsection", "logos")
        .in("status", ["approved", "current"])
        .order("updated_at", { ascending: false })
        .limit(1),
      db.from("social_performance_snapshots").select("platform,period_key,followers,post_reach,views,engagements,synced_at").eq("client_id",clientId).eq("provider","zernio").order("synced_at",{ascending:false}).limit(100),
      profileRevision(clientId,"cover").catch(() => null),
      profileRevision(clientId,"avatar").catch(() => null),
    ]);
    if (clientResult.error)
      throw new ClientBrainV2HttpError("Unable to load this client.", 500);
    if (!clientResult.data)
      throw new ClientBrainV2HttpError("Client not found.", 404);
    if (logoResult.error)
      throw new ClientBrainV2HttpError("Unable to load this client.", 500);
    const client = clientResult.data as Row;
    const logoUrls = await clientLogoUrls((logoResult.data ?? []) as Row[]);
    const rows = snapshots.error ? [] : snapshots.data ?? [];
    const summary = (platform: string): SocialPlatformSummary | null => {
      const current=rows.find(row=>row.platform===platform&&row.period_key==='current_30d');
      const previous=rows.find(row=>row.platform===platform&&row.period_key==='previous_30d');
      const values=(row: typeof current) => ({followers:row?.followers??null,postReach:row?.post_reach??null,views:row?.views??null,engagements:row?.engagements??null});
      return current ? {...values(current),trend:null,previous:previous?values(previous):null} : null;
    };
    return {
      performance:{instagram:summary('instagram'),facebook:summary('facebook'),syncedAt:rows[0]?.synced_at??null},
      client: {
        id: text(client.id),
        name: text(client.name),
        industry: text(client.industry) || null,
        status: text(client.status) || "unknown",
        logoUrl: avatar ? `/api/clients/${clientId}/profile-image?slot=avatar&v=${avatar}` : logoUrls.get(clientId) ?? null,
        coverUrl: cover ? `/api/clients/${clientId}/profile-image?slot=cover&v=${cover}` : null,
      },
    };
  });
}
