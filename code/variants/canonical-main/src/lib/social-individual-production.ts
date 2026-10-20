import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import { humanConfirmedRestaurantAssetCategory } from '@/lib/client-brain-v2'
import { getMonthlyPlan } from '@/lib/social-monthly-content-plans'
import { assignProductionReferenceRoles, determineVenueRequirement, directIndividualProduction, strictVenueTruthMode } from '@/lib/social-individual-production-director'
import { assessIndividualProductionPinterestCompatibility, type PinterestCompatibilityTarget } from '@/lib/social-individual-production-pinterest-compatibility'
import { INDIVIDUAL_PRODUCTION_PROMPT_VERSION, individualProductionPrompt } from '@/lib/social-individual-production-prompt'
import { buildIndividualProductionGeminiRequest, validateIndividualProductionGeminiRequest, type GeminiInlineReferencePart } from '@/lib/social-individual-production-provider-contract'
import type { IndividualProductionArtifact, IndividualProductionMode, IndividualProductionPackage, IndividualProductionPinterestSelection, IndividualProductionReference } from '@/lib/social-individual-production-types'
import { requiresAdditionalVenueSurfaceTruth, tableSurfaceEvidence } from '@/lib/social-individual-production-truth-continuity'

type Json = Record<string, unknown>
type PlanItem = Json & {
  id: string
  position: number
  updated_at: string
  required_assets: string[]
  pillar: string
  subject: string
  creative_concept: string
  production_method: string
  activation_record_id: string | null
  missing_asset_note: string
  visual_direction: string
  visual_direction_source: string
  visual_direction_execution_id: string | null
  shot_scale: string
  camera_angle: string
  composition: string
  human_presence: string
  interaction: string
  motion: string
  grid_crop_behavior: string
  metadata?: Json | null
}

// A named venue decision is deliberately narrow: it supplies an already-approved truth image
// without changing the saved plan, its Visual Direction, or any Client Brain metadata.
const INDIVIDUAL_PRODUCTION_VENUE_REFERENCE_OVERRIDES: Record<string, string> = {
  '21bb8f02-555c-5a6b-a07b-5d8fb992d9f8': '76305b47-a448-5d17-9761-2f73def9211c',
  // P15 is a real-room recreation. DSC09830 is the strongest complete approved
  // observation of the main dining room; it does not need a conflicting support view.
  '6831dc59-d979-5443-8d56-6b8b5637e53f': '3d670b10-efca-515a-ba6c-e0ccf6728b90',
}

type AssetRow = { id: string; title: string; status: string; updated_at: string; metadata: Json | null }
type FileObject = { id: string; file_name: string; storage_bucket: string; storage_path: string; file_type: string | null }
type FileRow = { record_id: string; semantic_role: string; approval_status: string; client_brain_file_objects: FileObject | FileObject[] | null }
type ArtifactRow = Omit<IndividualProductionArtifact, 'image_url'> & { file_object_id: string | null }

export const INDIVIDUAL_PRODUCTION_MAX_REFERENCES = 10
export const INDIVIDUAL_PRODUCTION_ASPECT_RATIO = '4:5' as const
export const INDIVIDUAL_PRODUCTION_OUTPUT_RESOLUTION = '4K' as const
const CLIENT_ASSETS_BUCKET = 'client-assets'
const GEMINI_MODEL = 'gemini-3-pro-image-preview'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
// 4K image work can remain queued after the normal 120-second request window.
// This is intentionally bounded, with no retry or provider fallback.
const PROVIDER_TIMEOUT_MS = 300_000

type ProviderRequestDiagnostics = {
  reference_binary_prepared: boolean
  request_dispatch_attempted: boolean
  provider_response_received: boolean
  provider_http_status: number | null
  timeout_ms: number
}

function providerRequestDiagnostics(): ProviderRequestDiagnostics {
  return {
    reference_binary_prepared: false,
    request_dispatch_attempted: false,
    provider_response_received: false,
    provider_http_status: null,
    timeout_ms: PROVIDER_TIMEOUT_MS,
  }
}

function isRecord(value: unknown): value is Json { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
function text(value: unknown, max = 1_200) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function textList(value: unknown, max = 24) {
  const values = Array.isArray(value) ? value : [value]
  return values.map(entry => text(entry, 240)).filter(Boolean).slice(0, max)
}
function words(value: string) { return value.split(/\s+/).filter(Boolean).length }
function productionMode(): IndividualProductionMode { return process.env.SOCIAL_INDIVIDUAL_PRODUCTION_MODE === 'live' ? 'live' : 'dry_run' }
function recordData(metadata: Json | null) { const root = metadata ?? {}; return isRecord(root.editor_data) ? root.editor_data : root }
function approvedForGeneration(row: AssetRow) {
  const data = recordData(row.metadata)
  return row.status === 'approved' && (data.approved_for_generation === true || data.approved_for_generation === 'true')
}
function referenceRoleFor(category: string, pillar: string, metadata: Json | null): IndividualProductionReference['role'] {
  const data = recordData(metadata)
  if (data.asset_role === 'animal_truth' || ['dog', 'pet', 'animal'].includes(text(data.subject_type, 80).toLowerCase())) return 'animal_truth'
  if (data.asset_role === 'person_truth' || data.subject_type === 'person' || data.subject_type === 'model') return 'person_truth'
  if (category === 'interiors' || category === 'exteriors') return 'venue_truth'
  if (category === 'venue_items') return pillar === 'interiors' ? 'venue_truth' : 'subject_truth'
  return 'subject_truth'
}

function planDirectionInput(clientId: string, item: PlanItem, plan?: Json) {
  return {
    client_id: clientId,
    plan_truth: {
      subject: item.subject,
      pillar: item.pillar,
      creative_concept: item.creative_concept,
      monthly_context: text(plan?.monthly_context, 1_200) || text(plan?.raw_context, 1_200),
      client_name: text(isRecord(plan?.client_brain_snapshot) ? plan?.client_brain_snapshot.client_name : '', 160),
    },
    visual_direction: {
      shot_scale: item.shot_scale,
      camera_angle: item.camera_angle,
      composition: item.composition,
      human_presence: item.human_presence,
      interaction: item.interaction,
      motion: item.motion,
      brief: item.visual_direction,
    },
  }
}
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

type GeminiPart = { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }
type GeminiResponse = { candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>; error?: { message?: string } }

async function signedReferenceUrl(bucket: string, storagePath: string) {
  const { data, error } = await clientBrainV2ServerClient.storage.from(bucket).createSignedUrl(storagePath, 60 * 60)
  return error ? null : data.signedUrl
}

async function loadAssetReferences(clientId: string, item: PlanItem) {
  // Supporting product IDs remain in the plan's required-asset ledger for
  // feasibility, but must only enter the package through their support roles.
  const supportIds = new Set(selectedSupportingProductIds(item))
  const ids = [...new Set(Array.isArray(item.required_assets) ? item.required_assets.filter(isUuid).filter(id => !supportIds.has(id)) : [])]
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const planning = isRecord(metadata.planning_ai) ? metadata.planning_ai : {}
  const canonicalMenuItemIds = textList(planning.menu_item_ids, 12).filter(isUuid)
  const subjectIdentity = isRecord(planning.subject_identity) ? planning.subject_identity : {}
  const currentProductLookup = canonicalMenuItemIds.length > 0 && ['food', 'drinks'].includes(item.pillar)
  const [{ data: selectedRows, error: selectedRowsError }, { data: currentRows, error: currentRowsError }, { data: menuRows, error: menuRowsError }] = await Promise.all([
    ids.length ? clientBrainV2ServerClient.from('client_brain_v2_records').select('id,title,status,updated_at,metadata').eq('client_id', clientId).in('id', ids) : Promise.resolve({ data: [] as AssetRow[], error: null }),
    currentProductLookup
      ? clientBrainV2ServerClient.from('client_brain_v2_records').select('id,title,status,updated_at,metadata').eq('client_id', clientId).eq('top_section', 'assets').eq('status', 'approved').limit(240)
      : Promise.resolve({ data: [] as AssetRow[], error: null }),
    currentProductLookup
      ? clientBrainV2ServerClient.from('client_brain_v2_menu_items').select('id,canonical_name,aliases').eq('client_id', clientId).in('id', canonicalMenuItemIds)
      : Promise.resolve({ data: [] as Array<{ id: string; canonical_name: string; aliases: unknown }>, error: null }),
  ])
  if (selectedRowsError || currentRowsError || menuRowsError) throw new ClientBrainV2HttpError('Unable to load current production truth.', 500)
  const canonicalNames = new Set([
    text(item.subject, 320),
    text(subjectIdentity.canonical_name, 320),
    ...((menuRows ?? []) as Array<{ canonical_name: string; aliases: unknown }>).flatMap(row => [text(row.canonical_name, 320), ...textList(row.aliases, 12)]),
  ].filter(Boolean).map(value => normalizedIdentity(value)))
  const menuIdsFor = (row: AssetRow) => {
    const data = recordData(row.metadata)
    return [...textList(data.canonical_menu_item_id, 12), ...textList(data.menu_item_id, 12), ...textList(data.menu_item_ids, 12)].filter(isUuid)
  }
  const exactProductMatch = (row: AssetRow) => {
    const data = recordData(row.metadata)
    const linkedCanonical = menuIdsFor(row).some(id => canonicalMenuItemIds.includes(id))
    const namedCanonical = [text(data.dish_name, 320), text(data.drink_name, 320), text(data.menu_display_name, 320), text(data.canonical_menu_item_name, 320)]
      .some(name => canonicalNames.has(normalizedIdentity(name)))
    return linkedCanonical || namedCanonical
  }
  const currentExactProductRows = ((currentRows ?? []) as AssetRow[])
    .filter(row => approvedForGeneration(row))
    .filter(row => ['food', 'drinks'].includes(humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })))
    .filter(exactProductMatch)
    .sort((left, right) => productTruthScore(right, item, canonicalMenuItemIds) - productTruthScore(left, item, canonicalMenuItemIds) || left.id.localeCompare(right.id))
  const rowById = new Map<string, AssetRow>()
  for (const row of [...((selectedRows ?? []) as AssetRow[]), ...currentExactProductRows]) rowById.set(row.id, row)
  const rows = [...rowById.values()]
  if (!rows.length) return [] as IndividualProductionReference[]
  const { data: files, error: filesError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id,semantic_role,approval_status,client_brain_file_objects(id,file_name,storage_bucket,storage_path,file_type)')
    .eq('client_id', clientId).in('record_id', rows.map(row => row.id)).order('sort_order')
  if (filesError) throw new ClientBrainV2HttpError('Unable to load required production truth.', 500)
  const fileByRecord = new Map<string, FileObject>()
  for (const row of (files ?? []) as unknown as FileRow[]) {
    const file = Array.isArray(row.client_brain_file_objects) ? row.client_brain_file_objects[0] : row.client_brain_file_objects
    if (!fileByRecord.has(row.record_id) && file && row.approval_status === 'approved') fileByRecord.set(row.record_id, file)
  }
  const qualifiedRows = rows
    .filter(row => approvedForGeneration(row))
    .filter(row => {
      if (!currentProductLookup) return true
      const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
      return ['food', 'drinks'].includes(category) && exactProductMatch(row)
    })
    .sort((left, right) => productTruthScore(right, item, canonicalMenuItemIds) - productTruthScore(left, item, canonicalMenuItemIds) || left.id.localeCompare(right.id))
  // A current exact menu match replaces a stale plan-time empty or incorrect list. Keep only
  // the minimum strong set for Food/Drink so provider grounding stays precise.
  const selectedRowsForPackage = currentProductLookup ? qualifiedRows.slice(0, 1) : qualifiedRows
  const references: IndividualProductionReference[] = []
  for (const row of selectedRowsForPackage) {
    const file = fileByRecord.get(row.id)
    if (!file) continue
    const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
    references.push({
      id: row.id, role: referenceRoleFor(category, item.pillar, row.metadata), title: row.title, category, source: 'client_brain_asset',
      signed_url: await signedReferenceUrl(file.storage_bucket, file.storage_path), storage_bucket: file.storage_bucket, storage_path: file.storage_path,
      updated_at: row.updated_at, metadata: recordData(row.metadata),
      ...(['interiors', 'exteriors'].includes(category) ? { venue_zone: explicitVenueZone(row), venue_support_reason: explicitSameZoneSupportReason(row) } : {}),
    })
  }
  return references
}

function selectedSupportingProductIds(item: PlanItem) {
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const planning = isRecord(metadata.planning_ai) ? metadata.planning_ai : {}
  return [...new Set(textList(planning.supporting_product_asset_ids, 6).filter(isUuid))]
}

function sceneRequiresVisibleSupportingProducts(item: PlanItem) {
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const planning = isRecord(metadata.planning_ai) ? metadata.planning_ai : {}
  if (planning.scene_requires_visible_products === true) return true
  return item.pillar === 'lifestyle' && /\b(dining|dinner|lunch|breakfast|table|gathering|guest|guests|meal|sharing)\b/i.test(`${item.subject} ${item.creative_concept}`)
}

/**
 * Supporting food and drink are selected at planning time. This loader only
 * revalidates those exact approved records; it never substitutes a generic item.
 */
async function loadSupportingProductReferences(clientId: string, item: PlanItem) {
  const ids = selectedSupportingProductIds(item)
  if (!ids.length) return [] as IndividualProductionReference[]
  const { data: rows, error: rowsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id,title,status,updated_at,metadata')
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .in('id', ids)
  if (rowsError) throw new ClientBrainV2HttpError('Unable to load selected supporting product truth.', 500)
  const qualified = ((rows ?? []) as AssetRow[])
    .filter(row => approvedForGeneration(row))
    .filter(row => ['food', 'drinks'].includes(humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })))
    .filter(row => {
      const data = recordData(row.metadata)
      return textList(data.canonical_menu_item_id, 12).some(isUuid)
        || textList(data.menu_item_id, 12).some(isUuid)
        || textList(data.menu_item_ids, 12).some(isUuid)
    })
    .sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id))
  if (!qualified.length) return [] as IndividualProductionReference[]
  const { data: files, error: filesError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id,semantic_role,approval_status,client_brain_file_objects(id,file_name,storage_bucket,storage_path,file_type)')
    .eq('client_id', clientId)
    .in('record_id', qualified.map(row => row.id))
    .order('sort_order')
  if (filesError) throw new ClientBrainV2HttpError('Unable to load supporting product reference files.', 500)
  const fileByRecord = new Map<string, FileObject>()
  for (const row of (files ?? []) as unknown as FileRow[]) {
    const file = Array.isArray(row.client_brain_file_objects) ? row.client_brain_file_objects[0] : row.client_brain_file_objects
    if (!fileByRecord.has(row.record_id) && file && row.approval_status === 'approved') fileByRecord.set(row.record_id, file)
  }
  const references: IndividualProductionReference[] = []
  for (const row of qualified) {
    const file = fileByRecord.get(row.id)
    if (!file) continue
    const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
    references.push({
      id: row.id,
      role: category === 'drinks' ? 'supporting_drink_truth' : 'supporting_food_truth',
      title: row.title,
      category,
      source: 'client_brain_asset',
      signed_url: await signedReferenceUrl(file.storage_bucket, file.storage_path),
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      updated_at: row.updated_at,
      metadata: recordData(row.metadata),
    })
  }
  return references
}

function normalizedIdentity(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function productTruthScore(row: AssetRow, item: PlanItem, canonicalMenuItemIds: string[]) {
  const data = recordData(row.metadata)
  const linkedIds = [...textList(data.canonical_menu_item_id, 12), ...textList(data.menu_item_id, 12), ...textList(data.menu_item_ids, 12)]
  const exactLink = linkedIds.some(id => canonicalMenuItemIds.includes(id))
  const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
  const identity = item.pillar === 'drinks' ? text(data.drink_name, 240) : text(data.dish_name, 240)
  return (exactLink ? 1_000 : 0)
    + (category === item.pillar ? 100 : 0)
    + (identity ? 20 : 0)
    + (text(data.visual_presentation, 1_000) ? 16 : 0)
    + (textList(data.key_visual_details).length ? 10 : 0)
    + (text(data.menu_source, 180) ? 6 : 0)
}

function venueSearchText(row: AssetRow) {
  const data = recordData(row.metadata)
  return [row.title, ...textList(data.key_visual_details), text(data.visual_presentation, 900), text(data.space_area, 240), text(data.area_view, 240), text(data.description, 900)].filter(Boolean).join(' ').toLowerCase()
}

function venueReferenceScore(row: AssetRow, item: PlanItem, preferred: Array<'interiors' | 'exteriors'>) {
  const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
  const haystack = venueSearchText(row)
  const terms = [item.subject, item.creative_concept, item.shot_scale, item.camera_angle, item.composition, item.visual_direction]
    .join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 5)
  return (category === preferred[0] ? 80 : category === preferred[1] ? 40 : 0)
    + terms.filter(token => haystack.includes(token)).length * 3
    + (textList(recordData(row.metadata).key_visual_details).length ? 8 : 0)
    + (text(recordData(row.metadata).visual_presentation, 800) ? 6 : 0)
}

function explicitVenueZone(row: AssetRow) {
  const data = recordData(row.metadata)
  return text(data.venue_zone, 160) || text(data.physical_zone, 160) || null
}

function explicitSameZoneSupportReason(row: AssetRow) {
  const data = recordData(row.metadata)
  return text(data.same_zone_support_reason, 420) || text(data.venue_support_reason, 420) || text(data.spatial_support_reason, 420) || null
}

function venueReferenceFromRow(row: AssetRow, role: 'room_identity' | 'surface_truth' = 'room_identity'): IndividualProductionReference {
  return {
    id: row.id,
    role: 'venue_truth',
    title: row.title,
    category: humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} }),
    source: 'client_brain_asset',
    signed_url: null,
    updated_at: row.updated_at,
    metadata: recordData(row.metadata),
    environment_role: role,
    venue_zone: explicitVenueZone(row),
    venue_support_reason: explicitSameZoneSupportReason(row),
  }
}

function strictVenueReferenceRole(index: number): NonNullable<IndividualProductionReference['venue_truth_role']> {
  if (index === 0) return 'primary_composition_truth'
  return 'same_zone_detail_truth'
}

function assignVenueTruthRoles(references: IndividualProductionReference[], strictVenue: boolean) {
  let venueIndex = 0
  return references.map(reference => {
    if (!strictVenue || reference.role !== 'venue_truth') return reference
    const venue_truth_role = strictVenueReferenceRole(venueIndex++)
    return { ...reference, environment_role: 'room_identity' as const, venue_truth_role }
  })
}

function restrictStrictVenueTruthReferences(references: IndividualProductionReference[], itemId: string) {
  const venueReferences = references.filter(reference => reference.role === 'venue_truth')
  if (venueReferences.length <= 1) return references
  const overrideId = INDIVIDUAL_PRODUCTION_VENUE_REFERENCE_OVERRIDES[itemId]
  const primary = venueReferences.find(reference => reference.id === overrideId) ?? venueReferences[0]
  const support = primary.venue_zone
    ? venueReferences.find(reference => reference.id !== primary.id && reference.venue_zone === primary.venue_zone && Boolean(reference.venue_support_reason)) ?? null
    : null
  return [primary, ...(support ? [support] : []), ...references.filter(reference => reference.role !== 'venue_truth')]
}

async function loadVenueTruthReferences(clientId: string, item: PlanItem, plan: Json, strictVenue: boolean) {
  const directionInput = planDirectionInput(clientId, item, plan)
  const requirement = determineVenueRequirement(directionInput)
  const needsSurfaceTruth = requiresAdditionalVenueSurfaceTruth({ ...directionInput, truth_references: [] })
  if (!requirement.required && !needsSurfaceTruth) return [] as IndividualProductionReference[]
  const { data: rows, error: rowsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id,title,status,updated_at,metadata')
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .eq('status', 'approved')
    .limit(160)
  if (rowsError) throw new ClientBrainV2HttpError('Unable to retrieve approved venue truth.', 500)
  const overrideId = INDIVIDUAL_PRODUCTION_VENUE_REFERENCE_OVERRIDES[item.id]
  const venueRows = ((rows ?? []) as AssetRow[])
    .filter(row => approvedForGeneration(row))
    .filter(row => ['interiors', 'exteriors'].includes(humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })))
    .sort((left, right) => {
      const overrideDifference = Number(right.id === overrideId) - Number(left.id === overrideId)
      if (overrideDifference) return overrideDifference
      const scoreDifference = venueReferenceScore(right, item, requirement.preferred_categories) - venueReferenceScore(left, item, requirement.preferred_categories)
      return scoreDifference || left.id.localeCompare(right.id)
    })
  const primary = venueRows[0]
  const primaryReference = primary ? venueReferenceFromRow(primary) : null
  const requiresSurfaceTruth = primaryReference
    ? requiresAdditionalVenueSurfaceTruth({ ...directionInput, truth_references: [primaryReference] })
    : false
  const surfaceReference = requiresSurfaceTruth
    ? venueRows.slice(1).find(row => tableSurfaceEvidence(venueReferenceFromRow(row, 'surface_truth')).supported) ?? null
    : null
  // A strict package defaults to one real-room observation. A second image is
  // permitted only when both assets explicitly name the same physical zone and
  // the support asset names the factual gap it supplies. Similar categories,
  // filenames, visual-presentation text, or a shared client are never evidence.
  const primaryZone = primary ? explicitVenueZone(primary) : null
  const strictSupport = strictVenue && primary && primaryZone
    ? venueRows.filter(row => {
      if (row.id === primary.id) return false
      const sameZone = explicitVenueZone(row) === primaryZone
      const factualGap = explicitSameZoneSupportReason(row)
      return sameZone && Boolean(factualGap)
    }).slice(0, 1)
    : []
  const selectedVenueRows = (strictVenue ? [primary, ...strictSupport] : [primary, surfaceReference]).filter((row): row is AssetRow => Boolean(row))
  if (!selectedVenueRows.length) return [] as IndividualProductionReference[]
  const { data: files, error: filesError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id,semantic_role,approval_status,client_brain_file_objects(id,file_name,storage_bucket,storage_path,file_type)')
    .eq('client_id', clientId)
    .in('record_id', selectedVenueRows.map(row => row.id))
    .order('sort_order')
  if (filesError) throw new ClientBrainV2HttpError('Unable to retrieve approved venue truth files.', 500)
  const fileByRecord = new Map<string, FileObject>()
  for (const row of (files ?? []) as unknown as FileRow[]) {
    const file = Array.isArray(row.client_brain_file_objects) ? row.client_brain_file_objects[0] : row.client_brain_file_objects
    if (!fileByRecord.has(row.record_id) && file) fileByRecord.set(row.record_id, file)
  }
  const references: IndividualProductionReference[] = []
  for (const [index, row] of selectedVenueRows.entries()) {
    const file = fileByRecord.get(row.id)
    if (!file) continue
    const category = humanConfirmedRestaurantAssetCategory({ metadata: row.metadata ?? {} })
    references.push({
      id: row.id, role: 'venue_truth', title: row.title, category, source: 'client_brain_asset',
      signed_url: await signedReferenceUrl(file.storage_bucket, file.storage_path), storage_bucket: file.storage_bucket, storage_path: file.storage_path,
      updated_at: row.updated_at, metadata: recordData(row.metadata), environment_role: strictVenue ? 'room_identity' : row.id === surfaceReference?.id ? 'surface_truth' : 'room_identity',
      ...(strictVenue ? { venue_truth_role: strictVenueReferenceRole(index) } : {}),
    })
  }
  return references
}

type PinterestRow = Json & {
  id: string
  title: string
  updated_at: string
  client_brain_file_objects: { storage_bucket: string; storage_path: string } | Array<{ storage_bucket: string; storage_path: string }> | null
}

type PinterestMatchTarget = PinterestCompatibilityTarget & {
  shotScale: string
  cameraAngle: string
  composition: string
}

function pinterestMetadata(row: Json) {
  return {
    creative_categories: row.creative_categories,
    shot_scale: row.shot_scale,
    camera_angle: row.camera_angle,
    composition: row.composition,
    human_presence: row.human_presence,
    interaction: row.interaction,
    motion: row.motion,
    lighting_style: row.lighting_style,
    creative_techniques: row.creative_techniques,
    best_for: row.best_for,
  }
}

function savedPinterestReferenceId(item: PlanItem) {
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const production = isRecord(metadata.individual_production) ? metadata.individual_production : {}
  const selectedId = production.pinterest_reference_id
  return typeof selectedId === 'string' && (selectedId === 'none' || isUuid(selectedId)) ? selectedId : undefined
}

async function pinterestReference(row: PinterestRow): Promise<IndividualProductionReference | null> {
  const joined = Array.isArray(row.client_brain_file_objects) ? row.client_brain_file_objects[0] : row.client_brain_file_objects
  if (!joined) return null
  return {
    id: row.id, role: 'pinterest_inspiration', title: row.title, category: 'pinterest', source: 'pinterest_inspiration',
    signed_url: await signedReferenceUrl(joined.storage_bucket, joined.storage_path), storage_bucket: joined.storage_bucket, storage_path: joined.storage_path,
    updated_at: row.updated_at, metadata: pinterestMetadata(row),
  }
}

function pinterestMatchTarget(item: PlanItem): PinterestMatchTarget {
  return {
    pillar: text(item.pillar, 160).toLowerCase(),
    subject: text(item.subject, 320).toLowerCase(),
    shotScale: text(item.shot_scale, 160).toLowerCase(),
    cameraAngle: text(item.camera_angle, 160).toLowerCase(),
    composition: text(item.composition, 240).toLowerCase(),
    humanPresence: text(item.human_presence, 160).toLowerCase(),
    interaction: text(item.interaction, 160).toLowerCase(),
    motion: text(item.motion, 160).toLowerCase(),
    brief: text(item.visual_direction, 1_200).toLowerCase(),
  }
}

function pinterestTerms(value: unknown) {
  return textList(value, 32).join(' ').toLowerCase()
}

function pinterestInteractionScore(target: PinterestMatchTarget, reference: IndividualProductionReference) {
  const candidate = pinterestTerms(reference.metadata?.interaction)
  const techniques = pinterestTerms(reference.metadata?.creative_techniques)
  const context = `${candidate} ${techniques}`
  if (!target.interaction) return 0
  if (candidate === target.interaction) return 38
  if (target.interaction === 'cutting' && /(utensil|fork|knife|cut|slice|carv)/.test(context)) return 32
  if (target.interaction === 'pouring' && /(pour|liquid)/.test(context)) return 28
  if (target.interaction === 'serving' && /(serve|service|plate)/.test(context)) return 25
  if (target.interaction === 'picking_up' && /(pick|lift|hand)/.test(context)) return 22
  return 0
}

function same(target: string, value: unknown) {
  return Boolean(target) && target === text(value, 240).toLowerCase()
}

export function scoreIndividualProductionPinterest(target: PinterestMatchTarget, reference: IndividualProductionReference) {
  const metadata = reference.metadata ?? {}
  const compatibility = assessIndividualProductionPinterestCompatibility(target, { ...metadata, title: reference.title })
  const venueExpected = /(restaurant|venue|dining|table|interior|curtain|ambient)/.test(target.brief)
  const compositionMatch = same(target.composition, metadata.composition)
  const shotMatch = same(target.shotScale, metadata.shot_scale)
  const angleMatch = same(target.cameraAngle, metadata.camera_angle)
  const humanMatch = same(target.humanPresence, metadata.human_presence)
  const motionMatch = same(target.motion, metadata.motion)
  const interactionScore = pinterestInteractionScore(target, reference)
  const lighting = text(metadata.lighting_style, 240).toLowerCase()
  const lightingScore = /warm|golden|ambient/.test(target.brief) && /warm|golden|ambient/.test(lighting) ? 8 : 0
  const techniqueText = `${pinterestTerms(metadata.creative_techniques)} ${pinterestTerms(metadata.best_for)} ${reference.title}`
  const venueScore = venueExpected && /(restaurant|dining|table|interior|venue|ambient|hospitality)/.test(techniqueText) ? 10 : 0
  const categoryScore = compatibility.classification === 'compatible' ? 14 : compatibility.classification === 'technique_fallback' ? 2 : -120
  const subjectScore = target.subject && techniqueText.toLowerCase().includes(target.subject) ? 3 : 0
  const score = (compositionMatch ? 32 : 0) + (shotMatch ? 22 : 0) + (angleMatch ? 20 : 0) + (humanMatch ? 14 : 0) + (motionMatch ? 12 : 0) + interactionScore + lightingScore + venueScore + categoryScore + subjectScore
  const replicate = compatibility.automatic_eligible && compositionMatch && shotMatch && angleMatch && humanMatch && interactionScore >= 25
  const strength = replicate
    ? 'replicate_composition' as const
    : compatibility.automatic_eligible && score >= 74
      ? 'strong_inspiration' as const
      : 'loose_inspiration' as const
  const matched = [
    compositionMatch ? 'composition' : '', shotMatch ? 'shot scale' : '', angleMatch ? 'camera angle' : '',
    humanMatch ? 'human presence' : '', interactionScore ? 'interaction' : '', motionMatch ? 'motion' : '',
    lightingScore ? 'warm ambient light' : '', venueScore ? 'restaurant context' : '',
  ].filter(Boolean)
  const level = strength === 'replicate_composition' ? 'Replicate composition' : strength === 'strong_inspiration' ? 'Strong inspiration' : 'Loose inspiration'
  const explanation = `${level}${matched.length ? ` — ${matched.join(', ')}.` : '.'} ${compatibility.reason}`
  return { score, strength, explanation, compatibility }
}

function orderedProviderReferences(truth: IndividualProductionReference[], pinterest: IndividualProductionReference[], strictVenue: boolean) {
  const roleOrder: IndividualProductionReference['role'][] = ['subject_truth', 'venue_truth', 'supporting_food_truth', 'supporting_drink_truth', 'person_truth', 'animal_truth']
  if (strictVenue) {
    return [
      ...truth.filter(reference => reference.role === 'venue_truth'),
      ...truth.filter(reference => reference.role !== 'venue_truth'),
      ...pinterest,
    ].slice(0, INDIVIDUAL_PRODUCTION_MAX_REFERENCES)
  }
  return [
    ...pinterest,
    ...roleOrder.flatMap(role => truth.filter(reference => reference.role === role)),
    ...truth.filter(reference => !roleOrder.includes(reference.role)),
  ].slice(0, INDIVIDUAL_PRODUCTION_MAX_REFERENCES)
}

async function loadPinterestReferences(clientId: string, item: PlanItem, selectedId?: string | null, strictVenue = false): Promise<{ references: IndividualProductionReference[]; selection: IndividualProductionPinterestSelection }> {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_pinterest_inspirations')
    .select('id,title,updated_at,creative_categories,shot_scale,camera_angle,composition,human_presence,interaction,motion,lighting_style,creative_techniques,best_for,client_brain_file_objects!inner(storage_bucket,storage_path)')
    .eq('client_id', clientId).eq('status', 'active').eq('analysis_state', 'analyzed').order('updated_at', { ascending: false }).limit(500)
  if (error) throw new ClientBrainV2HttpError('Unable to load available Pinterest inspiration.', 500)
  const target = pinterestMatchTarget(item)
  const ranked = (await Promise.all(((data ?? []) as PinterestRow[]).map(pinterestReference)))
    .filter((reference): reference is IndividualProductionReference => Boolean(reference))
    .map(reference => {
      const match = scoreIndividualProductionPinterest(target, reference)
      return {
        ...reference,
        match_score: match.score,
        match_strength: match.strength,
        match_explanation: match.explanation,
        scene_archetype: match.compatibility.archetype,
        compatibility: match.compatibility.classification,
        compatibility_reason: match.compatibility.reason,
      }
    })
    .sort((left, right) => (right.match_score ?? 0) - (left.match_score ?? 0) || left.title.localeCompare(right.title))
  if (strictVenue) {
    for (const reference of ranked) {
      reference.match_strength = 'loose_inspiration'
      reference.match_explanation = `Strict Venue Truth Mode: ${reference.compatibility_reason ?? 'Pinterest may guide lighting, exposure, motion or atmosphere only. It may not control architecture, layout, furniture, composition or camera location.'}`
    }
  }
  const automatic = strictVenue ? [] : ranked.filter(reference => reference.compatibility === 'compatible' && reference.match_strength !== 'loose_inspiration')
  const broader = ranked.filter(reference => !automatic.some(candidate => candidate.id === reference.id))
  const candidates = [...automatic, ...broader].slice(0, 8)
  const suggested = automatic[0] ?? null
  const suggestedId = suggested?.id ?? null
  const candidateIds = new Set(candidates.map(reference => reference.id))
  if (selectedId && selectedId !== 'none' && !ranked.some(candidate => candidate.id === selectedId)) throw new ClientBrainV2HttpError('The selected Pinterest inspiration is not an active analyzed DemoClientB reference.', 409)
  const storedId = savedPinterestReferenceId(item)
  const requestedId = selectedId ?? storedId
  const effectiveId = requestedId === 'none' ? null : requestedId || (strictVenue ? null : suggestedId)
  const selected = effectiveId ? ranked.find(reference => reference.id === effectiveId) ?? null : null
  if (selected && (strictVenue || (requestedId && selected.compatibility !== 'compatible'))) {
    selected.manual_mismatch = true
    selected.match_strength = 'loose_inspiration'
    selected.match_explanation = strictVenue
      ? `Strict Venue Truth Mode: use only the selected lighting, exposure, motion or editorial atmosphere. Do not replicate Pinterest architecture, furniture, composition or camera location.`
      : `Manual cross-category selection. ${selected.compatibility_reason ?? selected.match_explanation ?? 'Use only the explicitly chosen technique; do not replicate the scene.'}`
  }
  const visibleCandidates = selected && !candidateIds.has(selected.id) ? [selected, ...candidates].slice(0, 8) : candidates
  return {
    references: selected ? [selected] : [],
    selection: {
      mode: requestedId === 'none' ? 'none' : requestedId ? 'manual' : 'auto', selected_id: selected?.id ?? null,
      suggested_id: suggestedId, suggested_strength: suggested?.match_strength ?? null, suggested_explanation: suggested?.match_explanation ?? null,
      candidates: visibleCandidates,
    },
  }
}

function snapshotBrandContext(snapshot: Json) {
  const intelligence = Array.isArray(snapshot.intelligence) ? snapshot.intelligence : []
  return intelligence.flatMap(entry => isRecord(entry) && ['brand_identity', 'visual_dna'].includes(text(entry.subsection, 80)) ? [`${text(entry.title, 160)}: ${text(entry.summary, 500)}`] : []).filter(Boolean).slice(0, 10)
}

function recordBrandContext(row: { title: string; summary: string | null; content: string | null; metadata: Json | null }) {
  const metadata = recordData(row.metadata)
  const editorData = isRecord(metadata.editor_data) ? metadata.editor_data : metadata
  const values = [
    text(row.summary, 500), text(row.content, 500), text(editorData.value, 700),
    ...(Array.isArray(editorData.values) ? editorData.values.map(value => text(value, 360)) : []),
    ...(Array.isArray(editorData.rules) ? editorData.rules.map(rule => isRecord(rule) ? text(rule.text, 420) : '') : []),
  ].filter(Boolean)
  return values.slice(0, 4).map(value => `${row.title}: ${value}`)
}

async function brandContext(clientId: string, snapshot: Json) {
  const [intelligenceResult, guidelineResult] = await Promise.all([
    clientBrainV2ServerClient.from('client_brain_v2_records').select('title,summary,content,metadata').eq('client_id', clientId).eq('top_section', 'intelligence').in('subsection', ['brand_identity', 'visual_dna']).eq('status', 'approved'),
    clientBrainV2ServerClient.from('client_brain_v2_records').select('title,summary,content,metadata').eq('client_id', clientId).eq('top_section', 'brand_guidelines').eq('subsection', 'colours').eq('status', 'approved'),
  ])
  if (intelligenceResult.error || guidelineResult.error) throw new ClientBrainV2HttpError('Unable to load relevant approved Brand and Visual DNA.', 500)
  const direct = [...(intelligenceResult.data ?? []), ...(guidelineResult.data ?? [])].flatMap(recordBrandContext).filter(Boolean)
  return (direct.length ? direct : snapshotBrandContext(snapshot)).slice(0, 14)
}

function negativeConstraints(item: PlanItem, truth: IndividualProductionReference[], strictVenue: boolean) {
  const values = [
    'Do not invent a dish, ingredients, menu price, plate, glassware, or garnish not visible in approved truth.',
    'Do not invent unseen DemoClientB architecture, furniture, or venue zones.',
    'Do not copy Pinterest props, plates, cutlery, table surfaces, venue, branding, or person identity.',
    'No boats, yachts, unrelated brands, or historical activation details.',
    'No generated text, logo, menu copy, or graphic typography.',
  ]
  if (item.pillar === 'food' || item.pillar === 'drinks') values.push('The approved product truth reference overrides Pinterest appearance and styling.')
  if (strictVenue) values.push('No invented chandeliers, pendant lights, tables, table shapes or materials, chairs, banquettes, artwork, curtains, walls, doors, windows, ceiling design, bar geometry, shelving, spatial expansion, fake symmetry, architectural redesign, generic luxury replacement or fictional venue zones.')
  if (item.pillar === 'interiors' || item.pillar === 'lifestyle' || item.pillar === 'bts_service') values.push('Use only selected approved venue truth for environment and perspective.')
  if (!truth.some(reference => reference.role === 'venue_truth') && ['interiors', 'lifestyle', 'bts_service'].includes(item.pillar)) values.push('Do not manufacture a venue background when no approved venue truth is selected.')
  if (/cotoletta/i.test(item.subject)) values.push('Do not change Cotoletta shape or portion, remove the bone, replace the potatoes or serving board, add garnish, invent a plate, deform hands, duplicate fingers, create impossible knife/fork contact, apply synthetic food gloss, over-denoise or over-sharpen.')
  return values
}

function currentMissingAssetNote(item: PlanItem, truth: IndividualProductionReference[]) {
  const note = text(item.missing_asset_note, 500)
  if (!note) return ''
  const productTruthPresent = truth.some(reference => reference.role === 'subject_truth')
  const venueTruthPresent = truth.some(reference => reference.role === 'venue_truth')
  const personTruthPresent = truth.some(reference => reference.role === 'person_truth')
  if (['food', 'drinks'].includes(item.pillar) && /needs approved (food|drink)s? truth before production/i.test(note) && productTruthPresent) return ''
  if (/needs approved venue or human truth before production/i.test(note) && (venueTruthPresent || personTruthPresent)) return ''
  return note
}

function requiresHumanTruth(item: PlanItem) {
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const planning = isRecord(metadata.planning_ai) ? metadata.planning_ai : {}
  const identity = isRecord(planning.subject_identity) ? planning.subject_identity : {}
  return identity.type === 'person'
}

function requiresDogTruth(item: PlanItem) {
  return /\bdog\b|dog-friendly|\bpet\b/i.test(`${item.subject} ${item.creative_concept} ${item.visual_direction} ${item.interaction}`)
}

export async function inspectIndividualProductionPackage(input: { clientId: string; planId: string; itemId: string; correction?: string; pinterestReferenceId?: string | null }) : Promise<IndividualProductionPackage> {
  if (!isUuid(input.clientId) || !isUuid(input.planId) || !isUuid(input.itemId)) throw new ClientBrainV2HttpError('Monthly Plan production item not found.', 404)
  await requireClientBrainV2(input.clientId)
  const detail = await getMonthlyPlan(input.clientId, input.planId)
  const plan = detail.plan as Json
  const item = (detail.items as PlanItem[]).find(candidate => candidate.id === input.itemId)
  if (!item) throw new ClientBrainV2HttpError('Monthly Plan production item not found.', 404)
  const correction = text(input.correction, 1_200)
  const requiredTruthReferences = await loadAssetReferences(input.clientId, item)
  const supportingProductReferences = await loadSupportingProductReferences(input.clientId, item)
  const directionInput = planDirectionInput(input.clientId, item, plan)
  const strictVenue = strictVenueTruthMode(directionInput)
  const venueRequirement = determineVenueRequirement(directionInput)
  const selectedTruthReferences = [...requiredTruthReferences, ...supportingProductReferences]
  const needsSurfaceTruth = requiresAdditionalVenueSurfaceTruth({ ...directionInput, truth_references: selectedTruthReferences })
  const retrievedVenueReferences = (venueRequirement.required || needsSurfaceTruth) && (strictVenue || !selectedTruthReferences.some(reference => reference.role === 'venue_truth'))
    ? await loadVenueTruthReferences(input.clientId, item, plan, strictVenue)
    : []
  const mergedTruthReferences = [...selectedTruthReferences, ...retrievedVenueReferences.filter(reference => !selectedTruthReferences.some(existing => existing.id === reference.id))]
  const strictTruthReferences = strictVenue ? restrictStrictVenueTruthReferences(mergedTruthReferences, item.id) : mergedTruthReferences
  const truthReferences = assignVenueTruthRoles(strictTruthReferences, strictVenue)
  const pinterest = await loadPinterestReferences(input.clientId, item, input.pinterestReferenceId, strictVenue)
  const pinterestReferences = pinterest.references
  const blockedReasons: string[] = []
  const warnings: string[] = []
  if (strictVenue && mergedTruthReferences.filter(reference => reference.role === 'venue_truth').length > truthReferences.filter(reference => reference.role === 'venue_truth').length) {
    warnings.push('Additional venue references were excluded because they do not carry explicit same-zone evidence and a named factual support gap.')
  }
  if (item.production_method === 'graphic_design' || item.production_method === 'photo_graphic_overlay') blockedReasons.push('Graphic Design final production is not supported by Individual Production V2.')
  if (item.visual_direction_source === 'unassigned' || words(item.visual_direction) < 25) blockedReasons.push('A saved Visual Direction is required before individual production.')
  const unresolvedMissingAssetNote = currentMissingAssetNote(item, truthReferences)
  if (unresolvedMissingAssetNote) blockedReasons.push(unresolvedMissingAssetNote)
  const needsProductTruth = item.pillar === 'food' || item.pillar === 'drinks'
  if (needsProductTruth && !truthReferences.some(reference => reference.role === 'subject_truth')) blockedReasons.push('Select an approved product truth Asset for this Food or Drink concept.')
  if (sceneRequiresVisibleSupportingProducts(item) && !truthReferences.some(reference => reference.role === 'supporting_food_truth' || reference.role === 'supporting_drink_truth')) {
    blockedReasons.push('This dining scene needs selected approved supporting Food or Drink Truth before production.')
  }
  const needsVenueTruth = venueRequirement.required
  if (needsVenueTruth && !truthReferences.some(reference => reference.role === 'venue_truth')) blockedReasons.push('Select an approved Interior or Exterior truth Asset before producing this venue-led concept.')
  if (requiresHumanTruth(item) && !truthReferences.some(reference => reference.role === 'person_truth')) {
    blockedReasons.push(item.human_presence === 'couple'
      ? 'This couple scene requires approved couple or person truth before production.'
      : 'This people-led scene requires approved person truth before production.')
  }
  if (requiresDogTruth(item) && !truthReferences.some(reference => reference.role === 'animal_truth')) {
    blockedReasons.push('This dog-friendly scene requires approved dog or pet truth before production.')
  }
  if (/chef antonio/i.test(item.subject) && !truthReferences.some(reference => reference.role === 'person_truth')) blockedReasons.push('Chef Antonio requires approved likeness truth. Use a generic chef action only when the saved concept is explicitly generic.')
  if (item.pillar === 'events' && /pizza of the month/i.test(item.subject) && !truthReferences.some(reference => reference.role === 'subject_truth')) blockedReasons.push('Pizza of the Month is not a confirmed canonical subject with approved product truth.')
  if (!pinterestReferences.length) warnings.push(pinterest.selection.mode === 'none' ? 'Pinterest inspiration is intentionally excluded for this production package.' : 'No strong active, analyzed Pinterest reference matched this direction; none will be attached.')
  if (pinterestReferences.some(reference => !reference.signed_url)) warnings.push('One or more Pinterest references cannot currently be retrieved as provider image references.')
  if (truthReferences.some(reference => !reference.signed_url)) warnings.push('One or more approved truth references cannot currently be retrieved as provider image references.')
  const trimmedTruth = truthReferences.slice(0, 6)
  const availablePinterestSlots = Math.max(0, INDIVIDUAL_PRODUCTION_MAX_REFERENCES - trimmedTruth.length)
  const trimmedPinterest = pinterestReferences.filter(reference => Boolean(reference.signed_url)).slice(0, availablePinterestSlots)
  const providerReferences = orderedProviderReferences(trimmedTruth, trimmedPinterest, strictVenue)
  const mode = productionMode()
  const productionDirection = directIndividualProduction({ ...directionInput, truth_references: trimmedTruth, pinterest_references: trimmedPinterest })
  blockedReasons.push(...productionDirection.environment_truth.gaps)
  const subjectMetadata = trimmedTruth.find(reference => reference.role === 'subject_truth')?.metadata ?? {}
  const base = {
    client_id: input.clientId, plan_id: input.planId, plan_item_id: item.id, plan_item_ref: `P${String(item.position).padStart(2, '0')}`,
    status: blockedReasons.length ? 'blocked' as const : 'ready' as const, blocked_reasons: blockedReasons, warnings, correction,
    production: { provider: 'google-gemini' as const, model: GEMINI_MODEL as 'gemini-3-pro-image-preview', mode, aspect_ratio: INDIVIDUAL_PRODUCTION_ASPECT_RATIO, output_resolution: INDIVIDUAL_PRODUCTION_OUTPUT_RESOLUTION, max_references: INDIVIDUAL_PRODUCTION_MAX_REFERENCES, prompt_version: INDIVIDUAL_PRODUCTION_PROMPT_VERSION },
    plan_truth: { ...directionInput.plan_truth, production_method: item.production_method, activation_record_id: item.activation_record_id },
    visual_direction: { shot_scale: item.shot_scale, camera_angle: item.camera_angle, composition: item.composition, human_presence: item.human_presence, interaction: item.interaction, motion: item.motion, brief: item.visual_direction, production_aspect_ratio: '4:5', grid_crop_behavior: item.grid_crop_behavior },
    client_truth: {
      canonical_subject: text(subjectMetadata.dish_name, 240) || text(subjectMetadata.drink_name, 240) || text(subjectMetadata.menu_display_name, 240) || item.subject,
      menu_source: text(subjectMetadata.menu_source, 160) || null,
      menu_ingredients: text(subjectMetadata.menu_ingredients, 1_200) || null,
      plan_snapshot_at: text(plan.snapshot_at, 80) || null,
    },
    brand_context: await brandContext(input.clientId, isRecord(plan.client_brain_snapshot) ? plan.client_brain_snapshot : {}),
    truth_references: trimmedTruth, pinterest_references: trimmedPinterest, provider_references: providerReferences, pinterest_selection: pinterest.selection,
    reference_assignments: assignProductionReferenceRoles({ ...directionInput, truth_references: trimmedTruth, pinterest_references: trimmedPinterest }),
    production_direction: productionDirection,
    negative_constraints: negativeConstraints(item, trimmedTruth, strictVenue),
  }
  const prompt = individualProductionPrompt(base)
  const truthFingerprint = {
    plan_truth: base.plan_truth,
    visual_direction: base.visual_direction,
    client_truth: base.client_truth,
    brand_context: base.brand_context,
    provider_references: providerReferences.map(reference => ({ id: reference.id, role: reference.role, environment_role: reference.environment_role, category: reference.category, updated_at: reference.updated_at, match_strength: reference.match_strength })),
    reference_assignments: base.reference_assignments,
    production_direction: base.production_direction,
    negative_constraints: base.negative_constraints,
    production: { prompt_version: base.production.prompt_version, aspect_ratio: base.production.aspect_ratio, output_resolution: base.production.output_resolution },
    item_updated_at: item.updated_at,
  }
  return { ...base, prompt, package_hash: hash(truthFingerprint) }
}

export async function setIndividualProductionPinterestSelection(input: { clientId: string; planId: string; itemId: string; pinterestReferenceId: string }) {
  if (!isUuid(input.clientId) || !isUuid(input.planId) || !isUuid(input.itemId)) throw new ClientBrainV2HttpError('Monthly Plan production item not found.', 404)
  await requireClientBrainV2(input.clientId)
  const detail = await getMonthlyPlan(input.clientId, input.planId)
  const item = (detail.items as PlanItem[]).find(candidate => candidate.id === input.itemId)
  if (!item) throw new ClientBrainV2HttpError('Monthly Plan production item not found.', 404)

  // Validate the selection against the active, analysed client library before storing it.
  await loadPinterestReferences(input.clientId, item, input.pinterestReferenceId)
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const production = isRecord(metadata.individual_production) ? metadata.individual_production : {}
  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items')
    .update({ metadata: { ...metadata, individual_production: { ...production, pinterest_reference_id: input.pinterestReferenceId, pinterest_selected_at: new Date().toISOString() } } })
    .eq('id', input.itemId).eq('client_id', input.clientId).eq('monthly_plan_id', input.planId).eq('updated_at', item.updated_at)
    .select('id, updated_at').maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to save the Pinterest inspiration selection.', 500)
  if (!data) throw new ClientBrainV2HttpError('This Feed item changed before the Pinterest inspiration could be saved. Refresh and try again.', 409)
  return inspectIndividualProductionPackage({ ...input, pinterestReferenceId: input.pinterestReferenceId })
}

async function artifactImageUrl(fileObjectId: string | null) {
  if (!fileObjectId) return null
  const { data } = await clientBrainV2ServerClient.from('client_brain_file_objects').select('storage_bucket,storage_path').eq('id', fileObjectId).maybeSingle()
  return data ? signedReferenceUrl(data.storage_bucket, data.storage_path) : null
}

export async function listIndividualProductionArtifacts(clientId: string, planId: string, itemId: string) {
  if (!isUuid(clientId) || !isUuid(planId) || !isUuid(itemId)) throw new ClientBrainV2HttpError('Monthly Plan production item not found.', 404)
  await requireClientBrainV2(clientId)
  const { data, error } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').select('*').eq('client_id', clientId).eq('monthly_plan_id', planId).eq('monthly_plan_item_id', itemId).order('version', { ascending: false })
  if (error) throw new ClientBrainV2HttpError('Unable to load production candidates.', 500)
  return await Promise.all(((data ?? []) as ArtifactRow[]).map(async row => ({ ...row, image_url: await artifactImageUrl(row.file_object_id) })))
}

async function nextVersion(clientId: string, planId: string, itemId: string) {
  const { data, error } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').select('version').eq('client_id', clientId).eq('monthly_plan_id', planId).eq('monthly_plan_item_id', itemId).order('version', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to allocate a production version.', 500)
  return (data?.version ?? 0) + 1
}

function extensionForMime(mime: string) {
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/jpeg') return 'jpg'
  return 'png'
}

async function providerReferenceParts(references: IndividualProductionReference[], strictVenueRecreation = false) {
  const parts: GeminiInlineReferencePart[] = []
  for (const [index, reference] of references.entries()) {
    if (!reference.signed_url) throw new ClientBrainV2HttpError(`Reference ${reference.title} is not available for provider grounding.`, 409)
    const response = await fetch(reference.signed_url)
    if (!response.ok) throw new ClientBrainV2HttpError(`Reference ${reference.title} could not be downloaded for production.`, 409)
    const bytes = Buffer.from(await response.arrayBuffer())
    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const role = reference.role === 'pinterest_inspiration'
      ? 'Composition reference'
      : reference.role === 'subject_truth'
        ? 'Product truth'
        : reference.role === 'supporting_food_truth'
          ? 'Supporting food truth'
          : reference.role === 'supporting_drink_truth'
            ? 'Supporting drink truth'
        : reference.role === 'venue_truth'
          ? strictVenueRecreation && index === 0 && reference.venue_truth_role === 'primary_composition_truth'
            ? 'ABSOLUTE VENUE AND PHYSICAL SCENE TRUTH'
            : reference.environment_role === 'surface_truth' ? 'Venue table surface truth' : 'Venue environment truth'
          : reference.role === 'animal_truth' ? 'Animal truth' : 'Person truth'
    parts.push({ label: `Reference Image ${index + 1} — ${role}: ${reference.title}`, inlineData: { mimeType, data: bytes.toString('base64') } })
  }
  return parts
}

async function generateProductionImage(packageData: IndividualProductionPackage, diagnostics: ProviderRequestDiagnostics) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new ClientBrainV2HttpError('Gemini image generation is not configured.', 503)
  const references = packageData.provider_references
  if (references.length > INDIVIDUAL_PRODUCTION_MAX_REFERENCES) throw new ClientBrainV2HttpError('Production package exceeds its bounded reference cap.', 409)
  const parts = await providerReferenceParts(references, packageData.production_direction.strict_venue_truth.active)
  diagnostics.reference_binary_prepared = true
  const body = buildIndividualProductionGeminiRequest(packageData.prompt, parts)
  const requestIssue = validateIndividualProductionGeminiRequest(body)
  if (requestIssue) throw new ClientBrainV2HttpError(`Image generation could not be prepared: ${requestIssue}.`, 409)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    diagnostics.request_dispatch_attempted = true
    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    })
    diagnostics.provider_response_received = true
    diagnostics.provider_http_status = response.status
    const payload = await response.json().catch(() => ({})) as GeminiResponse
    if (!response.ok) throw new ClientBrainV2HttpError(payload.error?.message || `Gemini image generation failed (${response.status}).`, response.status === 403 ? 503 : 502)
    const image = payload.candidates?.flatMap(candidate => candidate.content?.parts ?? []).map(part => part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : null)).find(part => part?.data)
    if (!image?.data) throw new ClientBrainV2HttpError('Gemini did not return a production image. Existing candidates were preserved.', 502)
    return { bytes: Buffer.from(image.data, 'base64'), mimeType: image.mimeType || 'image/png', latencyMs: Date.now() - startedAt, finishReason: payload.candidates?.[0]?.finishReason ?? null, referenceCount: references.length }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ClientBrainV2HttpError(`Image generation timed out after ${Math.round(PROVIDER_TIMEOUT_MS / 1000)} seconds before Gemini returned a response. No image was created.`, 504)
    }
    if (error instanceof ClientBrainV2HttpError) throw error
    throw new ClientBrainV2HttpError('Image generation request could not reach Gemini. No image was created.', 502)
  } finally {
    clearTimeout(timeout)
  }
}

async function insertProductionArtifact(packageData: IndividualProductionPackage, version: number, status: 'blocked' | 'ready' | 'generating') {
  const { data, error } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').insert({
    id: randomUUID(), client_id: packageData.client_id, monthly_plan_id: packageData.plan_id, monthly_plan_item_id: packageData.plan_item_id, version, status,
    execution_mode: packageData.production.mode, correction_text: packageData.correction, prompt_version: packageData.production.prompt_version,
    provider: packageData.production.provider, model: packageData.production.model, aspect_ratio: '4:5', output_resolution: packageData.production.output_resolution,
    package_snapshot: packageData, package_hash: packageData.package_hash, reference_snapshot: packageData.provider_references, prompt_text: packageData.prompt,
    execution: { mode: packageData.production.mode, provider_called: false, created_at: new Date().toISOString(), blocked_reasons: packageData.blocked_reasons },
    failure_reason: packageData.status === 'blocked' ? packageData.blocked_reasons.join(' ') : null,
  }).select('*').single()
  if (error || !data) throw new ClientBrainV2HttpError('Unable to retain the production package. No provider call was made.', 500)
  return data as ArtifactRow
}

export async function runIndividualProduction(input: { clientId: string; planId: string; itemId: string; correction?: string; pinterestReferenceId?: string | null }) {
  const packageData = await inspectIndividualProductionPackage(input)
  const version = await nextVersion(input.clientId, input.planId, input.itemId)
  if (packageData.status === 'blocked') {
    const artifact = await insertProductionArtifact(packageData, version, 'blocked')
    return { mode: packageData.production.mode, artifact: { ...artifact, image_url: null }, package: packageData, provider_called: false }
  }
  if (packageData.production.mode === 'dry_run') {
    const artifact = await insertProductionArtifact(packageData, version, 'ready')
    return { mode: 'dry_run' as const, artifact: { ...artifact, image_url: null }, package: packageData, provider_called: false, message: 'Dry-run package retained. No Gemini request was made.' }
  }
  const artifact = await insertProductionArtifact(packageData, version, 'generating')
  let failureStage = 'reference_binary_retrieval'
  const diagnostics = providerRequestDiagnostics()
  try {
    const output = await generateProductionImage(packageData, diagnostics)
    failureStage = 'storage_upload'
    const fileName = `Monthly Production ${packageData.plan_item_ref} v${version}.${extensionForMime(output.mimeType)}`
    const storagePath = `${packageData.client_id}/monthly-production/${packageData.plan_id}/${packageData.plan_item_id}/${artifact.id}.${extensionForMime(output.mimeType)}`
    const { error: storageError } = await clientBrainV2ServerClient.storage.from(CLIENT_ASSETS_BUCKET).upload(storagePath, output.bytes, { contentType: output.mimeType, upsert: false })
    if (storageError) throw new ClientBrainV2HttpError('Production image was generated but could not be stored. The candidate was not retained.', 500)
    failureStage = 'file_registration'
    const { data: file, error: fileError } = await clientBrainV2ServerClient.from('client_brain_file_objects').insert({ storage_bucket: CLIENT_ASSETS_BUCKET, storage_path: storagePath, file_name: fileName, file_type: output.mimeType, file_size_bytes: output.bytes.length, metadata: { artifact_type: 'monthly_plan_individual_production', client_id: packageData.client_id, monthly_plan_id: packageData.plan_id, monthly_plan_item_id: packageData.plan_item_id, version } }).select('id').single()
    if (fileError || !file) {
      await clientBrainV2ServerClient.storage.from(CLIENT_ASSETS_BUCKET).remove([storagePath])
      throw new ClientBrainV2HttpError('Production image was generated but could not be registered. The candidate was not retained.', 500)
    }
    failureStage = 'artifact_finalize'
    const { data: updated, error: updateError } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').update({ status: 'generated', file_object_id: file.id, generated_at: new Date().toISOString(), execution: { mode: 'live', provider_called: true, latency_ms: output.latencyMs, finish_reason: output.finishReason, reference_count: output.referenceCount, cost_usd: null } }).eq('id', artifact.id).eq('client_id', input.clientId).select('*').single()
    if (updateError || !updated) throw new ClientBrainV2HttpError('Production image was stored but its candidate record could not be finalized.', 500)
    return { mode: 'live' as const, artifact: { ...(updated as ArtifactRow), image_url: await artifactImageUrl(updated.file_object_id) }, package: packageData, provider_called: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Individual production failed.'
    await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').update({ status: 'failed', failure_reason: message, execution: { mode: 'live', provider_called: diagnostics.request_dispatch_attempted, cost_usd: null, failure_stage: diagnostics.request_dispatch_attempted ? 'provider_request' : failureStage, failed_at: new Date().toISOString(), ...diagnostics } }).eq('id', artifact.id).eq('client_id', input.clientId)
    throw error
  }
}

export async function selectIndividualProductionVersion(input: { clientId: string; planId: string; itemId: string; artifactId: string }) {
  if (!isUuid(input.clientId) || !isUuid(input.planId) || !isUuid(input.itemId) || !isUuid(input.artifactId)) throw new ClientBrainV2HttpError('Production candidate not found.', 404)
  await requireClientBrainV2(input.clientId)
  const { data: artifact, error: lookupError } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').select('id,status').eq('id', input.artifactId).eq('client_id', input.clientId).eq('monthly_plan_id', input.planId).eq('monthly_plan_item_id', input.itemId).maybeSingle()
  if (lookupError || !artifact) throw new ClientBrainV2HttpError('Production candidate not found.', 404)
  if (artifact.status !== 'generated') throw new ClientBrainV2HttpError('Only a generated production candidate can be selected.', 409)
  const { error: clearError } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').update({ is_selected: false, status: 'generated' }).eq('client_id', input.clientId).eq('monthly_plan_id', input.planId).eq('monthly_plan_item_id', input.itemId).eq('is_selected', true)
  if (clearError) throw new ClientBrainV2HttpError('Unable to update production selection.', 500)
  const { data, error } = await clientBrainV2ServerClient.from('social_monthly_plan_production_artifacts').update({ is_selected: true, status: 'selected', selected_at: new Date().toISOString() }).eq('id', input.artifactId).eq('client_id', input.clientId).select('*').single()
  if (error || !data) throw new ClientBrainV2HttpError('Unable to select production candidate.', 500)
  return { ...(data as ArtifactRow), image_url: await artifactImageUrl(data.file_object_id) }
}

export function individualProductionProviderStatus() {
  return { provider: 'google-gemini', model: 'gemini-3-pro-image-preview', mode: productionMode(), configured: Boolean(process.env.GEMINI_API_KEY), aspect_ratio: INDIVIDUAL_PRODUCTION_ASPECT_RATIO, output_resolution: INDIVIDUAL_PRODUCTION_OUTPUT_RESOLUTION, max_references: INDIVIDUAL_PRODUCTION_MAX_REFERENCES, prompt_version: INDIVIDUAL_PRODUCTION_PROMPT_VERSION }
}
