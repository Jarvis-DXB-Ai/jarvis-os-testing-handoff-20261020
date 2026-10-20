import "server-only";

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
  };
};

/**
 * The persistent workspace shell only needs identity and a brand mark. Domain
 * pages remain responsible for their own data models.
 */
export async function loadClientWorkspaceChrome(
  clientId: string,
): Promise<ClientWorkspaceChrome> {
  if (!isUuid(clientId))
    throw new ClientBrainV2HttpError("Invalid client ID.", 400);
  return measureServerLoader("client-workspace.chrome", 4, async () => {
    const [clientResult, logoResult] = await Promise.all([
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
    ]);
    if (clientResult.error)
      throw new ClientBrainV2HttpError("Unable to load this client.", 500);
    if (!clientResult.data)
      throw new ClientBrainV2HttpError("Client not found.", 404);
    if (logoResult.error)
      throw new ClientBrainV2HttpError("Unable to load this client.", 500);
    const client = clientResult.data as Row;
    const logoUrls = await clientLogoUrls((logoResult.data ?? []) as Row[]);
    return {
      client: {
        id: text(client.id),
        name: text(client.name),
        industry: text(client.industry) || null,
        status: text(client.status) || "unknown",
        logoUrl: logoUrls.get(clientId) ?? null,
      },
    };
  });
}
