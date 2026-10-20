import 'server-only'

import {
  ASSET_EDITOR_FIELDS,
  ASSET_RECORD_STATUSES,
  ASSET_REVIEW_STATES,
  categorySpecificAssetEditorFields,
  EDITABLE_ASSET_ROLES,
  DEFAULT_RESTAURANT_ASSET_CURRENCY,
  hasMeaningfulRestaurantAssetMetadata,
  isEditableRestaurantAssetCategory,
  isManualRestaurantAssetCategory,
  normalizeAssetReviewState,
  type ClientBrainV2AssetClassificationRequest,
  type ClientBrainV2AssetEnrichmentApply,
  type ClientBrainV2AssetEditRequest,
  type EditableRestaurantAssetCategory,
} from '@/lib/client-brain-v2-asset-edit'
import { isRestaurantClientBrainV2 } from '@/lib/client-brain-v2'
import { pricingContextForOfficialMenuItem } from '@/lib/client-brain-v2-pricing'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  loadClientBrainV2,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server'

type ExistingAssetRecord = {
  id: string
  client_id: string
  top_section: string
  status: string
  last_verified_at: string | null
  updated_at: string
  metadata: Record<string, unknown>
  provenance: Record<string, unknown>
}

type AssetDeleteMutation = {
  asset_id?: string
  deleted_link_count?: number
  deleted_assignment_count?: number
  deleted_version_count?: number
  deleted_file_object_count?: number
  storage_objects_to_delete?: unknown
  preserved_file_objects?: unknown
}

type StorageObjectForCleanup = {
  bucket: string
  storage_path?: string
  preview_path?: string
  optimized_path?: string
}

export type ClientBrainV2AssetDeleteResult = {
  mutation: {
    assetId: string
    deletedLinkCount: number
    deletedAssignmentCount: number
    deletedVersionCount: number
    deletedFileObjectCount: number
    preservedFileObjectCount: number
  }
  storageCleanupPending: boolean
  storageCleanupWarning?: string
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as Record<string, unknown>
}

function textValue(value: unknown, label: string, max = 6000) {
  if (value == null) return ''
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim()
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return result
}

function listValue(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 100) throw new ClientBrainV2HttpError(`${label} must contain no more than 100 items.`, 400)
  const seen = new Set<string>()
  return value.flatMap((item, index) => {
    const normalized = textValue(item, `${label} item ${index + 1}`, 1000).replace(/\s+/g, ' ')
    const key = normalized.toLocaleLowerCase('en')
    if (!normalized || seen.has(key)) return []
    seen.add(key)
    return [normalized]
  })
}

function dateValue(value: unknown, label: string) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ClientBrainV2HttpError(`${label} must use YYYY-MM-DD.`, 400)
  return value
}

function numberValue(value: unknown, label: string) {
  if (value == null || value === '') return null
  const raw = typeof value === 'number' ? String(value) : textValue(value, label, 30)
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) throw new ClientBrainV2HttpError(`${label} must be a positive number with no more than two decimal places.`, 400)
  return Number(raw)
}

function booleanValue(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new ClientBrainV2HttpError(`${label} must be true or false.`, 400)
  return value
}

function uuidList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 100) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return [...new Set(value.map((item, index) => {
    if (typeof item !== 'string' || !isUuid(item)) throw new ClientBrainV2HttpError(`${label} item ${index + 1} is invalid.`, 400)
    return item
  }))]
}

function emptyValue(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

function currentCategory(metadata: Record<string, unknown>): EditableRestaurantAssetCategory | null {
  const current = metadata.asset_category ?? metadata.legacy_asset_category
  if (current === 'food_studio_shots') return 'food'
  if (current === 'drink_studio_shots') return 'drinks'
  return isEditableRestaurantAssetCategory(current) ? current : null
}

async function validateRelationshipTargets(
  clientId: string,
  menuRecordIds: string[],
  activationRecordIds: string[],
  sourceRecordIds: string[],
) {
  const requested = [...new Set([...menuRecordIds, ...activationRecordIds, ...sourceRecordIds])]
  if (!requested.length) return
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, top_section, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .in('id', requested)
  if (error) throw new ClientBrainV2HttpError('Unable to validate Asset relationships.', 500)
  const records = new Map((data ?? []).map(record => [record.id, record]))
  const valid = menuRecordIds.every(id => records.get(id)?.subsection === 'menus'
      && records.get(id)?.record_type === 'menu'
      && records.get(id)?.metadata?.menu_taxonomy_status === 'active')
    && activationRecordIds.every(id => records.get(id)?.subsection === 'activations' && records.get(id)?.record_type === 'activation')
    && sourceRecordIds.every(id => records.get(id)?.top_section === 'sources')
  if (!valid || records.size !== requested.length) throw new ClientBrainV2HttpError('One or more Asset relationships do not belong to this client or are the wrong type.', 403)
}

function enrichmentObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError('Asset enrichment is invalid.', 400)
  return value as Record<string, unknown>
}

function safeVisualTruth(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  const truth: Record<string, unknown> = {}
  if (typeof candidate.visual_presentation === 'string' && candidate.visual_presentation.trim()) {
    truth.visual_presentation = candidate.visual_presentation.trim().slice(0, 1000)
  }
  if (candidate.reference_observation && typeof candidate.reference_observation === 'object' && !Array.isArray(candidate.reference_observation)) {
    const observation = candidate.reference_observation as Record<string, unknown>
    const cameraAngle = typeof observation.camera_angle === 'string' ? observation.camera_angle.trim().slice(0, 1000) : ''
    const framing = typeof observation.framing === 'string' ? observation.framing.trim().slice(0, 1000) : ''
    if (cameraAngle || framing) truth.reference_observation = { ...(cameraAngle ? { camera_angle: cameraAngle } : {}), ...(framing ? { framing } : {}) }
  }
  return Object.keys(truth).length ? truth : undefined
}

async function resolveEnrichment(
  clientId: string,
  category: EditableRestaurantAssetCategory,
  enrichment: ClientBrainV2AssetEnrichmentApply | undefined,
  menuRecordIds: string[],
  activationRecordIds: string[],
  sourceRecordIds: string[],
) {
  if (!enrichment) return null
  if (!['food', 'drinks'].includes(category)) throw new ClientBrainV2HttpError('Only Food and Drink assets can apply menu enrichment.', 400)
  if (!isUuid(enrichment.menuItemId)) throw new ClientBrainV2HttpError('Menu enrichment item is invalid.', 400)
  if (!Array.isArray(enrichment.appliedFieldIds) || enrichment.appliedFieldIds.length > 30) throw new ClientBrainV2HttpError('Menu enrichment fields are invalid.', 400)
  const allowedFields = new Set(ASSET_EDITOR_FIELDS[category].map(field => field.id))
  const appliedFieldIds = [...new Set(enrichment.appliedFieldIds.filter((field): field is string => typeof field === 'string'))]
  if (!appliedFieldIds.length || appliedFieldIds.some(field => !allowedFields.has(field))) throw new ClientBrainV2HttpError('Menu enrichment includes an unsupported field.', 400)

  const { data: menuItem, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_menu_items')
    .select('id, menu_record_id, activation_record_id, source_record_id, source_file_object_id, canonical_name, source_page, source_document_version, source_status, item_kind, price, currency')
    .eq('client_id', clientId)
    .eq('id', enrichment.menuItemId)
    .maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to validate menu enrichment.', 500)
  if (!menuItem || menuItem.source_status !== 'current') throw new ClientBrainV2HttpError('The selected official menu item is no longer current.', 409)
  if (!menuRecordIds.includes(menuItem.menu_record_id) || !sourceRecordIds.includes(menuItem.source_record_id)) {
    throw new ClientBrainV2HttpError('The selected official menu item is outside the chosen menu or source scope.', 403)
  }
  if (menuItem.activation_record_id && !activationRecordIds.includes(menuItem.activation_record_id)) {
    throw new ClientBrainV2HttpError('The selected official menu item requires its activation to remain selected.', 403)
  }
  const parentIds = [menuItem.menu_record_id, menuItem.activation_record_id].filter((id): id is string => Boolean(id))
  const { data: parents, error: parentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, subsection, record_type, metadata')
    .eq('client_id', clientId)
    .in('id', parentIds)
  if (parentsError) throw new ClientBrainV2HttpError('Unable to resolve menu pricing ownership.', 500)
  const parentById = new Map((parents ?? []).map(parent => [parent.id, parent]))
  const pricing = pricingContextForOfficialMenuItem({
    itemKind: menuItem.item_kind as 'item' | 'offer_component' | 'service_rule',
    price: typeof menuItem.price === 'number' ? menuItem.price : null,
    currency: typeof menuItem.currency === 'string' ? menuItem.currency : null,
    menu: parentById.get(menuItem.menu_record_id) ?? null,
    activation: menuItem.activation_record_id ? parentById.get(menuItem.activation_record_id) ?? null : null,
  })
  if (pricing.ownership !== 'item' && appliedFieldIds.some(field => field === 'price' || field === 'currency')) {
    throw new ClientBrainV2HttpError('A parent Menu or Activation price cannot be applied as an individual Asset price.', 400)
  }
  return {
    menu_item_id: menuItem.id,
    canonical_name: menuItem.canonical_name,
    menu_record_id: menuItem.menu_record_id,
    activation_record_id: menuItem.activation_record_id,
    source_record_id: menuItem.source_record_id,
    source_file_object_id: menuItem.source_file_object_id,
    source_page: menuItem.source_page,
    source_document_version: menuItem.source_document_version,
    applied_field_ids: appliedFieldIds,
    visual_truth: safeVisualTruth(enrichment.visualTruth),
    pricing,
  }
}

export async function saveClientBrainV2AssetMetadata(clientId: string, assetId: string, input: unknown) {
  const client = await requireClientBrainV2(clientId)
  if (!isRestaurantClientBrainV2(client.brain_architecture_version)) throw new ClientBrainV2HttpError('Restaurant Asset editing is not enabled for this client.', 404)
  if (!isUuid(assetId)) throw new ClientBrainV2HttpError('Invalid Asset ID.', 400)

  const payload = objectValue(input, 'Asset edit') as Partial<ClientBrainV2AssetEditRequest>
  if (!isEditableRestaurantAssetCategory(payload.category)) throw new ClientBrainV2HttpError('Invalid Asset category.', 400)
  const expectedUpdatedAt = textValue(payload.expectedUpdatedAt, 'Edit baseline', 80)
  if (!expectedUpdatedAt) throw new ClientBrainV2HttpError('Edit baseline is required.', 400)
  const fields = objectValue(payload.fields, 'Asset fields')
  const fieldConfig = ASSET_EDITOR_FIELDS[payload.category]
  const allowedFieldIds = new Set(fieldConfig.map(field => field.id))
  if (Object.keys(fields).some(key => !allowedFieldIds.has(key))) throw new ClientBrainV2HttpError('Asset edit contains an unsupported field.', 400)
  if (fieldConfig.some(field => !(field.id in fields))) throw new ClientBrainV2HttpError('Asset edit payload is incomplete.', 400)

  const menuRecordIds = uuidList(payload.menuRecordIds, 'Menu relationships')
  const activationRecordIds = uuidList(payload.activationRecordIds, 'Activation relationships')
  const sourceRecordIds = uuidList(payload.sourceRecordIds, 'Source relationships')
  if (!['food', 'drinks'].includes(payload.category) && menuRecordIds.length > 0) {
    throw new ClientBrainV2HttpError('Only Food and Drink assets can link to Menus.', 400)
  }
  await validateRelationshipTargets(clientId, menuRecordIds, activationRecordIds, sourceRecordIds)
  const requestedEnrichment = enrichmentObject(payload.enrichment) as ClientBrainV2AssetEnrichmentApply | null
  const clearCanonicalMenuMatch = payload.clearCanonicalMenuMatch === true
  if (clearCanonicalMenuMatch && requestedEnrichment) {
    throw new ClientBrainV2HttpError('Choose a replacement menu item or clear the canonical match, not both.', 400)
  }
  if (clearCanonicalMenuMatch && !['food', 'drinks'].includes(payload.category)) {
    throw new ClientBrainV2HttpError('Only Food and Drink Assets have a canonical menu match.', 400)
  }
  if (clearCanonicalMenuMatch && menuRecordIds.length) {
    throw new ClientBrainV2HttpError('Clear the current Menu relationship before clearing the canonical match.', 400)
  }
  const enrichment = await resolveEnrichment(clientId, payload.category, requestedEnrichment ?? undefined, menuRecordIds, activationRecordIds, sourceRecordIds)

  const { data: existingData, error: existingError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, client_id, top_section, status, last_verified_at, updated_at, metadata, provenance')
    .eq('client_id', clientId)
    .eq('id', assetId)
    .eq('top_section', 'assets')
    .maybeSingle()
  if (existingError) throw new ClientBrainV2HttpError('Unable to load the Asset for editing.', 500)
  if (!existingData) throw new ClientBrainV2HttpError('Asset not found for this client.', 404)
  const existing = existingData as ExistingAssetRecord
  if (existing.updated_at !== expectedUpdatedAt) throw new ClientBrainV2HttpError('This Asset changed after editing began. Your values are preserved; refresh before saving again.', 409)

  const { data: currentLinks, error: currentLinksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('to_record_id, relation_type')
    .eq('client_id', clientId)
    .eq('from_record_id', assetId)
    .in('relation_type', ['belongs_to_menu', 'supports_activation', 'derived_from'])
  if (currentLinksError) throw new ClientBrainV2HttpError('Unable to load current Asset relationships.', 500)

  const currentMenuIds = (currentLinks ?? []).filter(link => link.relation_type === 'belongs_to_menu').map(link => link.to_record_id)
  const currentSourceIds = (currentLinks ?? []).filter(link => link.relation_type === 'derived_from').map(link => link.to_record_id)
  const nextMetadata = { ...(existing.metadata ?? {}) }
  const tombstones = new Set(Array.isArray(nextMetadata.asset_metadata_tombstones)
    ? nextMetadata.asset_metadata_tombstones.filter((item): item is string => typeof item === 'string')
    : [])
  const previousCategory = currentCategory(existing.metadata)

  if (previousCategory && previousCategory !== payload.category) {
    for (const field of categorySpecificAssetEditorFields(previousCategory)) {
      delete nextMetadata[field.id]
      for (const alias of field.aliases) tombstones.add(alias)
    }
  }

  let recordStatus = existing.status
  let lastVerified = existing.last_verified_at
  let semanticRole = 'raw_asset'
  let approvedForGeneration: boolean | null = null

  for (const config of fieldConfig) {
    const raw = fields[config.id]
    let value: unknown
    if (config.kind === 'list') value = listValue(raw, config.label)
    else if (config.kind === 'number') value = numberValue(raw, config.label)
    else if (config.kind === 'boolean') value = raw == null ? null : booleanValue(raw, config.label)
    else if (config.kind === 'date') value = dateValue(raw, config.label)
    else value = textValue(raw, config.label, config.kind === 'textarea' ? 6000 : 1000)

    if (config.options && !config.options.includes(value as never)) throw new ClientBrainV2HttpError(`${config.label} is invalid.`, 400)
    if (config.id === 'currency' && value && !/^[A-Z]{3,5}$/.test(String(value).toUpperCase())) throw new ClientBrainV2HttpError('Currency must be a valid currency code.', 400)
    if (config.id === 'currency') value = String(value).toUpperCase()
    if (config.id === 'status') recordStatus = String(value)
    if (config.id === 'last_verified') lastVerified = value ? `${value}T00:00:00.000Z` : null
    if (config.id === 'asset_role') semanticRole = String(value)
    if (config.id === 'approved_for_generation') approvedForGeneration = value === null ? null : Boolean(value)

    if (emptyValue(value) && (config.kind !== 'boolean' || value === null)) {
      delete nextMetadata[config.id]
      for (const alias of config.aliases) tombstones.add(alias)
    } else {
      nextMetadata[config.id] = value
      tombstones.delete(config.id)
      for (const alias of config.aliases) if (alias !== config.id) tombstones.add(alias)
    }
  }

  // DemoClientB's normal price-entry workflow is AED. Explicit
  // non-AED selections and cleared prices are intentionally left untouched.
  if (['food', 'drinks'].includes(payload.category)
    && typeof nextMetadata.price === 'number'
    && !nextMetadata.currency) {
    nextMetadata.currency = DEFAULT_RESTAURANT_ASSET_CURRENCY
    tombstones.delete('currency')
  }

  if (!ASSET_RECORD_STATUSES.includes(recordStatus as typeof ASSET_RECORD_STATUSES[number])) throw new ClientBrainV2HttpError('Asset status is invalid.', 400)
  if (!EDITABLE_ASSET_ROLES.includes(semanticRole as typeof EDITABLE_ASSET_ROLES[number])) throw new ClientBrainV2HttpError('Asset role is invalid.', 400)
  const rawReviewState = nextMetadata.review_state
  const reviewFallback = existing.status === 'archived'
    ? 'archived'
    : existing.status === 'draft'
      ? 'draft'
      : existing.metadata?.approved_for_generation === true || existing.status === 'approved'
        ? 'approved'
        : 'needs_review'
  const reviewState = normalizeAssetReviewState(rawReviewState, reviewFallback)
  if (!ASSET_REVIEW_STATES.includes(reviewState)) throw new ClientBrainV2HttpError('Review state is invalid.', 400)
  if (typeof rawReviewState === 'string' && rawReviewState.trim() && rawReviewState !== reviewState) {
    nextMetadata.legacy_review_state = rawReviewState
    nextMetadata.review_state_normalized_at = new Date().toISOString()
  }
  nextMetadata.review_state = reviewState

  nextMetadata.asset_category = payload.category
  nextMetadata.asset_category_source = 'human_confirmed'
  nextMetadata.asset_category_confirmed_at = new Date().toISOString()
  nextMetadata.asset_category_confirmed_by = 'Manual Client Brain Edit'
  if (approvedForGeneration === null) delete nextMetadata.approved_for_generation
  else nextMetadata.approved_for_generation = approvedForGeneration
  nextMetadata.asset_role = semanticRole
  nextMetadata.menu_record_ids = menuRecordIds
  nextMetadata.activation_record_ids = activationRecordIds
  nextMetadata.source_record_ids = sourceRecordIds
  nextMetadata.asset_metadata_tombstones = [...tombstones].sort()
  nextMetadata.asset_metadata_editor = 'Manual Client Brain Edit'
  nextMetadata.asset_metadata_last_edited_at = new Date().toISOString()
  const hasMeaningfulMetadata = hasMeaningfulRestaurantAssetMetadata(payload.category, nextMetadata, menuRecordIds)
  if (!hasMeaningfulMetadata) {
    const previouslyApproved = existing.metadata?.approved_for_generation === true
    if (approvedForGeneration === true && !previouslyApproved) {
      throw new ClientBrainV2HttpError('Add Asset metadata before approving this reference for generation.', 400)
    }
    // Never persist an unidentified Asset as a generation truth reference.
    approvedForGeneration = false
    nextMetadata.approved_for_generation = false
  }
  if (payload.category === 'staff') {
    // Staff metadata is optional, but deliberate identity-generation approval
    // must still make the record selectable by the approved-asset boundary.
    if (approvedForGeneration === true) recordStatus = 'approved'
    else if (existing.status === 'approved') recordStatus = 'current'
  }
  if (enrichment) {
    const priorProvenance = nextMetadata.field_provenance && typeof nextMetadata.field_provenance === 'object' && !Array.isArray(nextMetadata.field_provenance)
      ? nextMetadata.field_provenance as Record<string, unknown>
      : {}
    const fieldProvenance = { ...priorProvenance }
    const menuSource = {
      channel: 'official_menu',
      menu_item_id: enrichment.menu_item_id,
      menu_record_id: enrichment.menu_record_id,
      source_record_id: enrichment.source_record_id,
      source_file_object_id: enrichment.source_file_object_id,
      source_document_version: enrichment.source_document_version,
      source_page: enrichment.source_page,
      applied_at: new Date().toISOString(),
    }
    for (const field of enrichment.applied_field_ids) {
      fieldProvenance[field] = field === 'price' || field === 'currency'
        ? { ...menuSource, channel: 'official_menu_item_price', price_ownership: 'item' }
        : menuSource
    }
    const pricingChannel = enrichment.pricing.ownership === 'activation_package'
      ? 'official_activation_price'
      : enrichment.pricing.ownership === 'menu_package'
        ? 'official_menu_package_price'
        : enrichment.pricing.ownership === 'item'
          ? 'official_menu_item_price'
          : 'not_listed'
    fieldProvenance.pricing_context = {
      ...menuSource,
      channel: pricingChannel,
      price_ownership: enrichment.pricing.ownership,
      pricing_owner_record_id: enrichment.pricing.package?.ownerRecordId ?? enrichment.menu_record_id,
    }
    if (enrichment.visual_truth) {
      for (const field of ['visual_presentation']) {
        if (enrichment.applied_field_ids.includes(field)) fieldProvenance[field] = { ...menuSource, channel: 'vision_analysis' }
      }
    }
    nextMetadata.field_provenance = fieldProvenance
    nextMetadata.asset_enrichment = {
      schema_version: 'v2',
      menu_match: {
        menu_item_id: enrichment.menu_item_id,
        canonical_name: enrichment.canonical_name,
        menu_record_id: enrichment.menu_record_id,
        activation_record_id: enrichment.activation_record_id,
        source_record_id: enrichment.source_record_id,
        source_file_object_id: enrichment.source_file_object_id,
        source_document_version: enrichment.source_document_version,
        source_page: enrichment.source_page,
        pricing_ownership: enrichment.pricing.ownership,
        pricing_owner_record_id: enrichment.pricing.package?.ownerRecordId ?? enrichment.menu_record_id,
      },
      visual_cache: enrichment.visual_truth ? {
        ...enrichment.visual_truth,
        source_file_object_id: enrichment.source_file_object_id,
        schema_version: 'v2',
        generated_at: new Date().toISOString(),
      } : undefined,
    }
    // This scalar identity is the one current Food/Drink product truth. The
    // broader belongs_to_menu link points at the parent menu document.
    nextMetadata.menu_item_id = enrichment.menu_item_id
    nextMetadata.menu_item_name = enrichment.canonical_name
    nextMetadata.menu_match_type = 'manual_selection'
    nextMetadata.canonical_menu_item_id = enrichment.menu_item_id
    nextMetadata.canonical_menu_item_name = enrichment.canonical_name
    nextMetadata.canonical_menu_record_id = enrichment.menu_record_id
    nextMetadata.canonical_menu_source_record_id = enrichment.source_record_id
    nextMetadata.canonical_menu_match_type = 'manual_selection'
    nextMetadata.canonical_menu_matched_at = new Date().toISOString()
    for (const key of [
      'menu_item_id',
      'menu_item_name',
      'menu_match_type',
      'canonical_menu_item_id',
      'canonical_menu_item_name',
      'canonical_menu_record_id',
      'canonical_menu_source_record_id',
      'canonical_menu_match_type',
      'canonical_menu_matched_at',
    ]) tombstones.delete(key)
  } else if (clearCanonicalMenuMatch || (previousCategory && previousCategory !== payload.category && !['food', 'drinks'].includes(payload.category))) {
    for (const key of [
      'menu_item_id',
      'menu_item_name',
      'menu_match_type',
      'canonical_menu_item_id',
      'canonical_menu_item_name',
      'canonical_menu_record_id',
      'canonical_menu_source_record_id',
      'canonical_menu_match_type',
      'canonical_menu_matched_at',
    ]) {
      delete nextMetadata[key]
      tombstones.add(key)
    }
    if (nextMetadata.asset_enrichment && typeof nextMetadata.asset_enrichment === 'object' && !Array.isArray(nextMetadata.asset_enrichment)) {
      const assetEnrichment = { ...(nextMetadata.asset_enrichment as Record<string, unknown>) }
      delete assetEnrichment.menu_match
      if (Object.keys(assetEnrichment).length) nextMetadata.asset_enrichment = assetEnrichment
      else delete nextMetadata.asset_enrichment
    }
  }
  if (previousCategory && previousCategory !== payload.category) {
    const history = Array.isArray(nextMetadata.asset_category_history) ? nextMetadata.asset_category_history : []
    nextMetadata.asset_category_history = [...history, { from: previousCategory, to: payload.category, changed_at: new Date().toISOString() }]
  }

  const clearLegacyMenu = payload.clearLegacyMenu === true || (!clearCanonicalMenuMatch && currentMenuIds.length > 0 && menuRecordIds.length === 0)
  if (menuRecordIds.length > 0 || clearLegacyMenu) for (const key of ['menu', 'menu_source', 'source_menu']) tombstones.add(key)
  const clearLegacySource = payload.clearLegacySource === true || (currentSourceIds.length > 0 && sourceRecordIds.length === 0)
  if (sourceRecordIds.length > 0 || clearLegacySource) for (const key of ['source']) tombstones.add(key)
  nextMetadata.asset_metadata_tombstones = [...tombstones].sort()

  const manualEdit = {
    manual_edit: true,
    source_label: 'Manual Client Brain Edit',
    edited_at: new Date().toISOString(),
    ...(enrichment ? { canonical_menu_identity_action: 'set' } : {}),
    ...(clearCanonicalMenuMatch ? { canonical_menu_identity_action: 'cleared' } : {}),
  }
  const { data: mutation, error: mutationError } = await clientBrainV2ServerClient.rpc('apply_client_brain_v2_asset_edit', {
    p_client_id: clientId,
    p_asset_id: assetId,
    p_expected_updated_at: expectedUpdatedAt,
    p_metadata: nextMetadata,
    p_record_status: recordStatus,
    p_last_verified_at: lastVerified,
    p_semantic_role: semanticRole,
    p_assignment_approval_status: approvedForGeneration ? 'approved' : 'needs_review',
    p_menu_ids: menuRecordIds,
    p_activation_ids: activationRecordIds,
    p_source_ids: sourceRecordIds,
    p_provenance: manualEdit,
  })
  if (mutationError) {
    console.error('[client-brain-v2] Asset metadata save failed', { code: mutationError.code, message: mutationError.message, details: mutationError.details })
    const status = mutationError.code === 'PT409' ? 409 : mutationError.code === 'PT404' ? 404 : mutationError.code === 'PT403' ? 403 : mutationError.code === 'PT400' ? 400 : 500
    throw new ClientBrainV2HttpError(status === 500 ? 'Unable to save Asset metadata.' : mutationError.message, status)
  }

  return { mutation, ...(await loadClientBrainV2(clientId, 'assets')) }
}

export async function classifyClientBrainV2Asset(clientId: string, assetId: string, input: unknown) {
  const client = await requireClientBrainV2(clientId)
  if (!isRestaurantClientBrainV2(client.brain_architecture_version)) throw new ClientBrainV2HttpError('Restaurant Asset classification is not enabled for this client.', 404)
  if (!isUuid(assetId)) throw new ClientBrainV2HttpError('Invalid Asset ID.', 400)

  const payload = objectValue(input, 'Asset classification') as Partial<ClientBrainV2AssetClassificationRequest>
  if (payload.action !== 'classify') throw new ClientBrainV2HttpError('Invalid Asset classification action.', 400)
  if (!isManualRestaurantAssetCategory(payload.category)) throw new ClientBrainV2HttpError('Invalid Asset category.', 400)
  const expectedUpdatedAt = textValue(payload.expectedUpdatedAt, 'Classification baseline', 80)
  if (!expectedUpdatedAt) throw new ClientBrainV2HttpError('Classification baseline is required.', 400)

  const { data: mutation, error: mutationError } = await clientBrainV2ServerClient.rpc('apply_client_brain_v2_asset_classification', {
    p_client_id: clientId,
    p_asset_id: assetId,
    p_expected_updated_at: expectedUpdatedAt,
    p_category: payload.category,
  })
  if (mutationError) {
    console.error('[client-brain-v2] Asset classification failed', { code: mutationError.code, message: mutationError.message, details: mutationError.details })
    const status = mutationError.code === 'PT409' ? 409 : mutationError.code === 'PT404' ? 404 : mutationError.code === 'PT403' ? 403 : mutationError.code === 'PT400' ? 400 : 500
    throw new ClientBrainV2HttpError(status === 500 ? 'Unable to save Asset classification.' : mutationError.message, status)
  }

  return { mutation }
}

function numericMutationValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function storageObjectsForCleanup(value: unknown): StorageObjectForCleanup[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const candidate = item as Record<string, unknown>
    if (typeof candidate.bucket !== 'string' || !candidate.bucket.trim()) return []
    const paths = ['storage_path', 'preview_path', 'optimized_path'].reduce<Record<string, string>>((result, key) => {
      if (typeof candidate[key] === 'string' && candidate[key].trim()) result[key] = candidate[key]
      return result
    }, {})
    return Object.keys(paths).length ? [{ bucket: candidate.bucket, ...paths }] : []
  })
}

export async function deleteClientBrainV2Asset(clientId: string, assetId: string, input: unknown): Promise<ClientBrainV2AssetDeleteResult> {
  const client = await requireClientBrainV2(clientId)
  if (!isRestaurantClientBrainV2(client.brain_architecture_version)) throw new ClientBrainV2HttpError('Restaurant Asset deletion is not enabled for this client.', 404)
  if (!isUuid(assetId)) throw new ClientBrainV2HttpError('Invalid Asset ID.', 400)

  const payload = objectValue(input, 'Asset deletion')
  const expectedUpdatedAt = textValue(payload.expectedUpdatedAt, 'Delete baseline', 80)
  if (!expectedUpdatedAt) throw new ClientBrainV2HttpError('Delete baseline is required.', 400)

  const { data: mutationData, error: mutationError } = await clientBrainV2ServerClient.rpc('delete_client_brain_v2_asset', {
    p_client_id: clientId,
    p_asset_id: assetId,
    p_expected_updated_at: expectedUpdatedAt,
  })
  if (mutationError) {
    console.error('[client-brain-v2] Asset deletion failed', { code: mutationError.code, message: mutationError.message, details: mutationError.details })
    const status = mutationError.code === 'PT409' ? 409 : mutationError.code === 'PT404' ? 404 : mutationError.code === 'PT403' ? 403 : mutationError.code === 'PT400' ? 400 : 500
    throw new ClientBrainV2HttpError(status === 500 ? 'Unable to delete Asset.' : mutationError.message, status)
  }

  const mutation = (mutationData && typeof mutationData === 'object' && !Array.isArray(mutationData) ? mutationData : {}) as AssetDeleteMutation
  const cleanupObjects = storageObjectsForCleanup(mutation.storage_objects_to_delete)
  let storageCleanupWarning: string | undefined

  const cleanupByBucket = new Map<string, StorageObjectForCleanup[]>()
  for (const object of cleanupObjects) {
    cleanupByBucket.set(object.bucket, [...(cleanupByBucket.get(object.bucket) ?? []), object])
  }
  for (const [bucket, objects] of cleanupByBucket) {
    const paths = [...new Set(objects.flatMap(object => [object.storage_path, object.preview_path, object.optimized_path].filter((path): path is string => Boolean(path))))]
    if (!paths.length) continue
    const { error } = await clientBrainV2ServerClient.storage.from(bucket).remove(paths)
    if (error) {
      console.error('[client-brain-v2] Asset storage cleanup failed after semantic deletion', { assetId, bucket, message: error.message })
      storageCleanupWarning = 'The Asset record was deleted, but one unused file could not be removed from storage. It is not available in Client Brain.'
    }
  }

  return {
    mutation: {
      assetId: typeof mutation.asset_id === 'string' ? mutation.asset_id : assetId,
      deletedLinkCount: numericMutationValue(mutation.deleted_link_count),
      deletedAssignmentCount: numericMutationValue(mutation.deleted_assignment_count),
      deletedVersionCount: numericMutationValue(mutation.deleted_version_count),
      deletedFileObjectCount: numericMutationValue(mutation.deleted_file_object_count),
      preservedFileObjectCount: Array.isArray(mutation.preserved_file_objects) ? mutation.preserved_file_objects.length : 0,
    },
    storageCleanupPending: Boolean(storageCleanupWarning),
    storageCleanupWarning,
  }
}
