import 'server-only'

import { isRestaurantClientBrainV2 } from '@/lib/client-brain-v2'
import { analyseAssetVisualTruth, type AssetVisualTruth } from '@/lib/client-brain-v2-asset-vision'
import {
  findOfficialMenuMatches,
  menuTruthToAssetFields,
  resolveOfficialMenuItemPricing,
  type MenuMatchCandidate,
} from '@/lib/client-brain-v2-menu-intelligence'
import { loadClientBrainV2AssetDetail } from '@/lib/client-brain-v2-assets-server'
import type { RestaurantPricingContext } from '@/lib/client-brain-v2-pricing'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server'

type AssetCategory = 'food' | 'drinks'

export type AssetEnrichmentResult = {
  status: 'proposal_ready' | 'selection_required' | 'no_match'
  matchStatus: 'exact_match' | 'strong_match' | 'multiple_matches' | 'no_match'
  candidates: Array<Pick<MenuMatchCandidate, 'id' | 'canonical_name' | 'menu_section' | 'price' | 'currency' | 'source_document_version' | 'source_page' | 'matchType' | 'score'>>
  proposal?: {
    menuItemId: string
    canonicalName: string
    menuRecordId: string
    activationRecordId: string | null
    sourceRecordId: string
    sourceFileObjectId: string | null
    sourceDocumentVersion: string
    sourcePage: number | null
    matchType: MenuMatchCandidate['matchType']
    pricing: RestaurantPricingContext
    menuFields: Record<string, unknown>
    visualTruth?: AssetVisualTruth
    visualFields: Record<string, unknown>
    visualWarning?: string
    visionCostUsd?: number
  }
  warning?: string
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as Record<string, unknown>
}

function textValue(value: unknown, label: string, max = 300) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const text = value.trim()
  if (!text || text.length > max) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return text
}

function uuidList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 20) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return [...new Set(value.map(item => {
    if (typeof item !== 'string' || !isUuid(item)) throw new ClientBrainV2HttpError(`${label} contains an invalid record.`, 400)
    return item
  }))]
}

function assetCategory(metadata: Record<string, unknown>): AssetCategory | null {
  const category = metadata.asset_category ?? metadata.legacy_asset_category
  if (category === 'food' || category === 'food_studio_shots') return 'food'
  if (category === 'drinks' || category === 'drink_studio_shots') return 'drinks'
  return null
}

async function validateScope(clientId: string, menuRecordIds: string[], activationRecordIds: string[]) {
  const ids = [...new Set([...menuRecordIds, ...activationRecordIds])]
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .in('id', ids)
  if (error) throw new ClientBrainV2HttpError('Unable to validate enrichment scope.', 500)
  const records = new Map((data ?? []).map(record => [record.id, record]))
  const validMenus = menuRecordIds.every(id => records.get(id)?.subsection === 'menus' && records.get(id)?.record_type === 'menu' && records.get(id)?.metadata?.menu_taxonomy_status === 'active')
  const validActivations = activationRecordIds.every(id => records.get(id)?.subsection === 'activations' && records.get(id)?.record_type === 'activation')
  if (!validMenus || !validActivations || records.size !== ids.length) throw new ClientBrainV2HttpError('The selected menu or activation does not belong to this client.', 403)
}

function visualFieldsFor(truth: AssetVisualTruth) {
  return {
    ...(truth.visual_presentation ? { visual_presentation: truth.visual_presentation } : {}),
  }
}

function candidateSummary(candidate: MenuMatchCandidate) {
  return {
    id: candidate.id,
    canonical_name: candidate.canonical_name,
    menu_section: candidate.menu_section,
    price: candidate.price,
    currency: candidate.currency,
    source_document_version: candidate.source_document_version,
    source_page: candidate.source_page,
    matchType: candidate.matchType,
    score: candidate.score,
  }
}

export async function enrichClientBrainV2Asset(clientId: string, assetId: string, input: unknown): Promise<AssetEnrichmentResult> {
  const client = await requireClientBrainV2(clientId)
  if (!isRestaurantClientBrainV2(client.brain_architecture_version)) throw new ClientBrainV2HttpError('Restaurant Asset enrichment is not enabled for this client.', 404)
  if (!isUuid(assetId)) throw new ClientBrainV2HttpError('Asset not found.', 404)
  const payload = objectValue(input, 'Enrichment request')
  const name = textValue(payload.name, 'Dish or drink name')
  const menuRecordIds = uuidList(payload.menuRecordIds, 'Menu scope')
  const activationRecordIds = payload.activationRecordIds == null ? [] : uuidList(payload.activationRecordIds, 'Activation scope')
  const candidateId = payload.candidateId == null ? null : textValue(payload.candidateId, 'Candidate', 40)
  // Menu matching is deterministic and must stay free of provider work unless a
  // caller explicitly opts into separate visual analysis.
  const includeVision = payload.includeVision === true
  await validateScope(clientId, menuRecordIds, activationRecordIds)

  const detail = await loadClientBrainV2AssetDetail(clientId, assetId)
  const category = assetCategory(detail.record.metadata ?? {})
  if (!category) throw new ClientBrainV2HttpError('Only Food and Drink assets can be enriched from official menu truth.', 400)
  const matches = await findOfficialMenuMatches({ clientId, name, menuRecordIds, activationRecordIds })
  const summaries = matches.candidates.map(candidateSummary)
  if (matches.status === 'no_match') {
    return { status: 'no_match', matchStatus: matches.status, candidates: summaries, warning: 'No current official menu match was found for this client. Confirm a different name or leave the Asset unlinked.' }
  }

  let selected: MenuMatchCandidate | undefined = matches.candidates[0]
  if (matches.status === 'multiple_matches') {
    if (!candidateId) {
      const warning = matches.candidates.length === 1
        ? 'A possible official menu match was found. Confirm it before any visual analysis is requested.'
        : 'Multiple official menu candidates were found. Choose one before any visual analysis is requested.'
      return { status: 'selection_required', matchStatus: matches.status, candidates: summaries, warning }
    }
    selected = matches.candidates.find(candidate => candidate.id === candidateId)
    if (!selected) throw new ClientBrainV2HttpError('The selected menu candidate is not available for this asset scope.', 403)
  } else if (candidateId) {
    selected = matches.candidates.find(candidate => candidate.id === candidateId)
    if (!selected) throw new ClientBrainV2HttpError('The selected menu candidate is not available for this asset scope.', 403)
  }
  if (!selected) throw new ClientBrainV2HttpError('No official menu candidate is available for this Asset scope.', 409)
  const pricing = await resolveOfficialMenuItemPricing(clientId, selected)

  let visualTruth: AssetVisualTruth | undefined
  let visualWarning: string | undefined
  let visionCostUsd: number | undefined
  if (includeVision && detail.record.files?.[0]?.signed_url) {
    const visual = await analyseAssetVisualTruth({
      clientId,
      signedImageUrl: detail.record.files[0].signed_url,
      fileType: detail.record.files[0].file_type,
      category,
      canonicalName: selected.canonical_name,
      menuTruth: {
        menuSection: selected.menu_section,
        listedIngredients: selected.listed_ingredients,
        dietaryMarkers: selected.dietary_markers,
        alcoholStatus: selected.dietary_markers.includes('non-alcoholic') ? 'non_alcoholic' : 'Not listed',
      },
    })
    visualTruth = visual.truth
    visualWarning = visual.warning
    visionCostUsd = visual.trackedCostUsd
  } else if (includeVision) {
    visualWarning = 'No image preview is available for visual analysis. Menu truth is still ready for review.'
  }

  return {
    status: 'proposal_ready',
    matchStatus: matches.status,
    candidates: summaries,
    proposal: {
      menuItemId: selected.id,
      canonicalName: selected.canonical_name,
      menuRecordId: selected.menu_record_id,
      activationRecordId: selected.activation_record_id,
      sourceRecordId: selected.source_record_id,
      sourceFileObjectId: selected.source_file_object_id,
      sourceDocumentVersion: selected.source_document_version,
      sourcePage: selected.source_page,
      matchType: selected.matchType,
      pricing,
      menuFields: menuTruthToAssetFields(selected, category, pricing),
      visualTruth,
      visualFields: visualTruth ? visualFieldsFor(visualTruth) : {},
      visualWarning,
      visionCostUsd,
    },
  }
}
