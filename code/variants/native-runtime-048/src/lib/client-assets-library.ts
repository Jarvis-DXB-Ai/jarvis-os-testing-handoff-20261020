import { humanConfirmedRestaurantAssetCategory, type ClientBrainV2AssetListRecord } from './client-brain-v2';

export const ASSET_CATEGORIES = ['all', 'food', 'drinks', 'interiors', 'exteriors', 'venue_items', 'staff', 'unclassified'] as const;
export function assetPreviewsNeedRefresh(lastRefresh: number, now: number, visible: boolean) {
  // No grant exists before the first response; do not abort that initial load.
  return visible && lastRefresh > 0 && now - lastRefresh >= 25 * 60_000;
}
export function assetLibraryFacts(record: ClientBrainV2AssetListRecord) {
  const category = humanConfirmedRestaurantAssetCategory(record);
  const first = record.files[0];
  const role = first?.semantic_role ?? null;
  const approval = first?.approval_status ?? null;
  const lane = role === 'truth_reference' ? 'truth' : ['creative_reference', 'generated_asset'].includes(role ?? '') ? 'direction' : 'other';
  const mappings: Record<string, string> = { food: 'food_truth', drinks: 'drink_truth', interiors: 'venue_truth', exteriors: 'venue_truth', venue_items: 'product_truth' };
  const studioRole = role === 'truth_reference' ? mappings[category] ?? null : role === 'creative_reference' ? 'composition_inspiration' : role === 'generated_asset' ? 'general_reference' : null;
  const reasons: string[] = [];
  if (!first) reasons.push('No file is attached.');
  else if (!first.file_type?.startsWith('image/')) reasons.push('The selected file is not an image.');
  if (!role || !approval) reasons.push('The selected file has no recorded role or approval; the asset status does not verify that file.');
  if (category === 'staff') reasons.push('Staff has no default Studio truth role. A photo does not grant permission to generate this person’s identity.');
  if (role !== 'truth_reference') reasons.push('This file is not a factual identity reference.');
  if (role === 'truth_reference' && approval !== 'approved') reasons.push('The factual file needs approval.');
  if (!record.metadata.approved_for_generation) reasons.push('Generation approval or required metadata is incomplete.');
  if (role === 'truth_reference' && !studioRole && category !== 'staff') reasons.push('No Studio truth role is mapped for this category.');
  return { category, role, approval, lane, studioRole, readiness: reasons.length ? 'Needs review' : 'Meets reference checks', reasons };
}
