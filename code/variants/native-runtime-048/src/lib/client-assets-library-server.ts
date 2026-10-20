import 'server-only';
import { clientBrainV2ServerClient, ClientBrainV2HttpError, isUuid } from './client-brain-v2-server-core';
import { isClientBrainV2ArchitectureVersion } from './client-brain-v2';
import { loadRestaurantClientBrainV2AssetList } from './client-brain-v2-assets-server';

export async function loadClientAssetsLibrary(clientId: string) {
  if (!isUuid(clientId)) throw new ClientBrainV2HttpError('Invalid client ID.', 400);
  const { data: client, error } = await clientBrainV2ServerClient.from('clients')
    .select('id,name,industry,status,notes,brain_architecture_version').eq('id', clientId).maybeSingle();
  if (error) throw new ClientBrainV2HttpError('Unable to load this client.', 500);
  if (!client) throw new ClientBrainV2HttpError('Client not found.', 404);
  if (!isClientBrainV2ArchitectureVersion(client.brain_architecture_version))
    return { supported: false as const, records: [], inspirations: [] };
  const [library, pins] = await Promise.all([
    loadRestaurantClientBrainV2AssetList(clientId, client),
    clientBrainV2ServerClient.from('client_brain_pinterest_inspirations').select('id,title,status,analysis_state')
      .eq('client_id', clientId).order('updated_at', { ascending: false }),
  ]);
  if (pins.error) throw new ClientBrainV2HttpError('Unable to load inspiration records.', 500);
  return { supported: true as const, canOpenAssetEditor: client.brain_architecture_version === 'hospitality_restaurant_v2', records: library.assetRecords, inspirations: pins.data ?? [] };
}
