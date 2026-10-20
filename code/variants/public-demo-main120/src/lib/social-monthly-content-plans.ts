import 'server-only'

import { humanConfirmedRestaurantAssetCategory } from '@/lib/client-brain-v2'
import { clientBrainV2ServerClient, ClientBrainV2HttpError, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import { retrieveClientBrainContext } from '@/lib/client-brain-v2-retrieval'
import { approveMonthlyPlanWithLineage } from '@/lib/content-lineage-phase1-server'
import { assessMonthlyPlanProductionFeasibility, assessMonthlyPlanningReadiness, buildProductionCapabilityInventory } from '@/lib/social-monthly-production-capability'
import {
  VISUAL_DIRECTION_CAMERA_ANGLES,
  VISUAL_DIRECTION_COMPOSITIONS,
  VISUAL_DIRECTION_GRID_CROPS,
  VISUAL_DIRECTION_HUMAN_PRESENCE,
  VISUAL_DIRECTION_INTERACTIONS,
  VISUAL_DIRECTION_MOTIONS,
  VISUAL_DIRECTION_SHOT_SCALES,
} from '@/lib/social-monthly-visual-direction-types'

export const MONTHLY_PLAN_PILLARS = ['lifestyle', 'food', 'drinks', 'interiors', 'events', 'bts_service'] as const
export const MONTHLY_PLAN_METHODS = ['ai_photography', 'graphic_design', 'photo_graphic_overlay', 'existing_asset', 'carousel', 'other'] as const
export const MONTHLY_PLAN_GRID_ROLES = ['hero_food', 'lifestyle_break', 'graphic_accent', 'venue_breather', 'human_moment', 'product_detail', 'event_commercial', 'other'] as const
export const MONTHLY_PLAN_STATUSES = ['draft', 'strategy_ready', 'plan_ready', 'approved'] as const
export const MONTHLY_ITEM_STATUSES = ['draft', 'ready', 'approved_for_plan', 'blocked'] as const

export type MonthlyPlanPillar = typeof MONTHLY_PLAN_PILLARS[number]
export type MonthlyPlanMethod = typeof MONTHLY_PLAN_METHODS[number]
export type MonthlyPlanGridRole = typeof MONTHLY_PLAN_GRID_ROLES[number]
export type MonthlyPlanStatus = typeof MONTHLY_PLAN_STATUSES[number]
export type MonthlyPlanItemStatus = typeof MONTHLY_ITEM_STATUSES[number]

type JsonObject = Record<string, unknown>
type MonthlyPlanItemFields = ReturnType<typeof itemFields>

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function text(value: unknown, label: string, max = 4_000, required = false) {
  if (value == null) return ''
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim()
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  if (required && !result) throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  return result
}

function rawText(value: unknown, label: string, max = 12_000) {
  if (value == null) return ''
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  if (value.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return value
}

function optionalUuid(value: unknown, label: string) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !isUuid(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, label: string, fallback: T[number]) {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string' || !values.includes(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as T[number]
}

function isoMonth(value: unknown) {
  const raw = text(value, 'Plan month', 10, true)
  if (!/^\d{4}-\d{2}-01$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new ClientBrainV2HttpError('Plan month must be the first day of a valid month.', 400)
  }
  return raw
}

function isoDate(value: unknown, label: string) {
  const raw = text(value, label, 10)
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new ClientBrainV2HttpError(`${label} must be a valid date.`, 400)
  }
  return raw
}

function stringArray(value: unknown, label: string, max = 24) {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string')) {
    throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  }
  return [...new Set(value.map(item => item.trim()).filter(Boolean))]
}

function jsonObject(value: unknown, label: string) {
  if (value == null) return {}
  if (!isRecord(value)) throw new ClientBrainV2HttpError(`${label} must be an object.`, 400)
  return value
}

function expectedUpdatedAt(value: unknown) {
  const result = text(value, 'Edit baseline', 80, true)
  if (Number.isNaN(Date.parse(result))) throw new ClientBrainV2HttpError('Edit baseline is invalid.', 400)
  return result
}

function itemFields(payload: JsonObject) {
  const dateFixed = payload.date_fixed === true
  const plannedDate = isoDate(payload.planned_date, 'Planned date')
  if (dateFixed && !plannedDate) throw new ClientBrainV2HttpError('A fixed-date post needs a planned date.', 400)
  return {
    planned_date: plannedDate,
    date_fixed: dateFixed,
    pillar: enumValue(payload.pillar, MONTHLY_PLAN_PILLARS, 'Content pillar', 'lifestyle'),
    objective: text(payload.objective, 'Objective', 600),
    subject: text(payload.subject, 'Subject', 600),
    creative_concept: text(payload.creative_concept, 'Creative concept', 2_000),
    production_method: enumValue(payload.production_method, MONTHLY_PLAN_METHODS, 'Production method', 'ai_photography'),
    required_assets: stringArray(payload.required_assets, 'Required assets'),
    missing_asset_note: text(payload.missing_asset_note, 'Missing asset note', 1_000),
    shot_scale: enumValue(payload.shot_scale, VISUAL_DIRECTION_SHOT_SCALES, 'Shot scale', 'other'),
    camera_angle: enumValue(payload.camera_angle, VISUAL_DIRECTION_CAMERA_ANGLES, 'Camera angle', 'other'),
    composition: enumValue(payload.composition, VISUAL_DIRECTION_COMPOSITIONS, 'Composition', 'other'),
    human_presence: enumValue(payload.human_presence, VISUAL_DIRECTION_HUMAN_PRESENCE, 'Human presence', 'none'),
    interaction: enumValue(payload.interaction, VISUAL_DIRECTION_INTERACTIONS, 'Interaction', 'none'),
    motion: enumValue(payload.motion, VISUAL_DIRECTION_MOTIONS, 'Motion', 'static'),
    visual_direction: text(payload.visual_direction, 'Visual direction', 2_000),
    production_aspect_ratio: '4:5' as const,
    grid_crop_behavior: enumValue(payload.grid_crop_behavior, VISUAL_DIRECTION_GRID_CROPS, 'Grid crop behavior', 'safe'),
    grid_role: enumValue(payload.grid_role, MONTHLY_PLAN_GRID_ROLES, 'Grid role', 'other'),
    activation_record_id: optionalUuid(payload.activation_record_id, 'Activation'),
    commercial_rationale: text(payload.commercial_rationale, 'Commercial rationale', 2_000),
    caption_brief: text(payload.caption_brief, 'Caption brief', 2_000),
    status: enumValue(payload.status, MONTHLY_ITEM_STATUSES, 'Feed item status', 'draft'),
  }
}

function manualSupportingProductSelection(payload: JsonObject) {
  const hasSupportingIds = Object.prototype.hasOwnProperty.call(payload, 'supporting_product_asset_ids')
  const hasVisibilityFlag = Object.prototype.hasOwnProperty.call(payload, 'scene_requires_visible_products')
  if (!hasSupportingIds && !hasVisibilityFlag) return null
  const assetIds = stringArray(payload.supporting_product_asset_ids, 'Supporting product assets', 3)
  if (assetIds.some(id => !isUuid(id))) throw new ClientBrainV2HttpError('Supporting product assets must be valid Asset IDs.', 400)
  if (hasVisibilityFlag && typeof payload.scene_requires_visible_products !== 'boolean') {
    throw new ClientBrainV2HttpError('Visible products must be true or false.', 400)
  }
  return {
    assetIds,
    sceneRequiresVisibleProducts: payload.scene_requires_visible_products === true,
  }
}

function fieldsWithManualSupportingProducts(fields: MonthlyPlanItemFields, selection: ReturnType<typeof manualSupportingProductSelection>) {
  if (!selection) return fields
  return { ...fields, required_assets: [...new Set([...fields.required_assets, ...selection.assetIds])] }
}

function planningMetadataWithManualSupportingProducts(existing: JsonObject, selection: ReturnType<typeof manualSupportingProductSelection>) {
  if (!selection) return existing
  const planning = isRecord(existing.planning_ai) ? existing.planning_ai : {}
  return {
    ...existing,
    planning_ai: {
      ...planning,
      supporting_product_asset_ids: selection.assetIds,
      scene_requires_visible_products: selection.sceneRequiresVisibleProducts,
    },
  }
}

async function validateActivation(clientId: string, activationId: string | null) {
  if (!activationId) return null
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, metadata')
    .eq('id', activationId)
    .eq('client_id', clientId)
    .eq('subsection', 'activations')
    .eq('record_type', 'activation')
    .maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to validate the selected activation.', 500)
  if (!data) throw new ClientBrainV2HttpError('The selected activation does not belong to this client.', 403)
  return data as { id: string; title: string; metadata: JsonObject | null }
}

function recordData(metadata: JsonObject | null) {
  const value = metadata ?? {}
  return isRecord(value.editor_data) ? value.editor_data : value
}

function normalizedIdentity(value: string) {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function activationProductTruth(title: string, metadata: JsonObject | null) {
  const data = recordData(metadata)
  const explicitState = text(data.product_truth_status, 'Product truth status', 32).toLocaleLowerCase('en-US')
  if (explicitState === 'unresolved') return { status: 'unresolved' as const, names: [] }
  const productBound = explicitState === 'confirmed'
    || /\b(pizza|burger|dessert|mocktail|drink|beverage|seasonal|monthly)\b/i.test(`${title} ${text(data.type, 'Activation type', 160)}`)
  if (!productBound) return { status: 'not_applicable' as const, names: [] }
  const names = [
    text(data.dish, 'Activation dish', 240),
    text(data.product_name, 'Activation product', 240),
    text(data.featured_product, 'Activation featured product', 240),
    ...(Array.isArray(data.inclusions) ? data.inclusions : []).flatMap(value => typeof value === 'string' ? [value.trim()] : []),
  ].filter(Boolean)
  return names.length ? { status: 'confirmed' as const, names: [...new Set(names)] } : { status: 'unresolved' as const, names: [] }
}

function activationSetupFields(fields: MonthlyPlanItemFields, message: string): MonthlyPlanItemFields {
  // A verified activation remains valid in a monthly strategy even when its
  // exact production input is not ready. Preserve the workflow status and
  // surface the production gap separately in the planner.
  return { ...fields, required_assets: [], missing_asset_note: message }
}

async function enforceActivationProductTruth(clientId: string, activation: Awaited<ReturnType<typeof validateActivation>>, fields: MonthlyPlanItemFields) {
  if (!activation) return fields
  const truth = activationProductTruth(activation.title, activation.metadata)
  if (truth.status === 'not_applicable') return fields
  if (truth.status === 'unresolved') {
    return activationSetupFields(fields, `Waiting for confirmed product truth for ${activation.title} before production.`)
  }
  if (!fields.required_assets.length) {
    return activationSetupFields(fields, `Needs an approved Asset exactly matching the confirmed product for ${activation.title} before production.`)
  }
  const { data: assets, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, metadata')
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .in('id', fields.required_assets)
  if (error) throw new ClientBrainV2HttpError('Unable to validate the selected activation Assets.', 500)
  const approvedMatchingIds = (assets ?? []).flatMap(asset => {
    const metadata = (asset.metadata ?? {}) as JsonObject
    const data = recordData(metadata)
    const category = humanConfirmedRestaurantAssetCategory({ metadata })
    const approved = data.approved_for_generation === true || data.approved_for_generation === 'true'
    const name = text(data.dish_name, 'Asset dish name', 240) || text(data.drink_name, 'Asset drink name', 240) || text(data.display_name, 'Asset display name', 240) || asset.title
    const exactMatch = truth.names.some(productName => normalizedIdentity(productName) === normalizedIdentity(name))
    return approved && (category === 'food' || category === 'drinks') && exactMatch ? [asset.id] : []
  })
  if (approvedMatchingIds.length !== fields.required_assets.length) {
    return activationSetupFields(fields, `Needs an approved Asset exactly matching the confirmed product for ${activation.title} before production.`)
  }
  return { ...fields, required_assets: approvedMatchingIds }
}

async function requirePlan(clientId: string, planId: string) {
  if (!isUuid(planId)) throw new ClientBrainV2HttpError('Monthly plan not found.', 404)
  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plans')
    .select('*')
    .eq('id', planId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load the Monthly Plan.', 500)
  if (!data) throw new ClientBrainV2HttpError('Monthly plan not found.', 404)
  return data
}

async function addActivity(clientId: string, planId: string, actionType: string, summary: string, itemId?: string, metadata: JsonObject = {}) {
  const { error } = await clientBrainV2ServerClient.from('social_monthly_plan_activity').insert({
    client_id: clientId,
    monthly_plan_id: planId,
    item_id: itemId ?? null,
    action_type: actionType,
    summary,
    metadata,
  })
  if (error) throw new ClientBrainV2HttpError('Unable to record Monthly Plan activity.', 500)
}

function planSummary(plan: JsonObject, itemCount = 0) {
  return { ...plan, item_count: itemCount }
}

export async function buildMonthlyPlanSnapshot(clientId: string) {
  const [context, productionCapability] = await Promise.all([retrieveClientBrainContext(clientId, {
    task_type: 'strategy_support',
    asset_categories: ['food', 'drinks', 'interiors', 'exteriors', 'venue_items'],
    include_learnings: true,
    freshness_mode: 'current',
    max_assets: 12,
  }), buildProductionCapabilityInventory(clientId)])
  return {
    client: context.client,
    intelligence: context.intelligence.map(record => ({ subsection: record.subsection, title: record.title, summary: record.summary, status: record.status })),
    menus: context.menus.map(menu => ({ id: menu.id, name: menu.name, availability: menu.availability, status: menu.status })),
    activations: context.activations.map(activation => ({ id: activation.id, name: activation.name, proposition: activation.proposition, status: activation.status, temporal_status: activation.temporal.status })),
    assets: context.assets.map(asset => ({ id: asset.id, name: asset.semantic_name, category: asset.category, tags: asset.tags, activation_ids: asset.activation_ids })),
    production_capability: productionCapability,
    learnings: context.learnings.map(learning => ({ category: learning.category, statement: learning.statement, confidence: learning.confidence_level })),
    warnings: context.warnings.map(warning => ({ code: warning.code, message: warning.message })),
    retrieved_at: new Date().toISOString(),
    retrieval_metrics: context.metrics,
  }
}

export async function listMonthlyPlans(clientId: string) {
  await requireClientBrainV2(clientId)
  const { data: plans, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_current', true)
    .order('plan_month', { ascending: false })
  if (error) throw new ClientBrainV2HttpError('Unable to load Monthly Plans.', 500)
  const ids = (plans ?? []).map(plan => plan.id)
  if (!ids.length) return []
  const { data: items, error: itemError } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items')
    .select('monthly_plan_id')
    .eq('client_id', clientId)
    .in('monthly_plan_id', ids)
  if (itemError) throw new ClientBrainV2HttpError('Unable to load Monthly Plan counts.', 500)
  const counts = new Map<string, number>()
  for (const item of items ?? []) counts.set(item.monthly_plan_id, (counts.get(item.monthly_plan_id) ?? 0) + 1)
  return (plans ?? []).map(plan => planSummary(plan as JsonObject, counts.get(plan.id) ?? 0))
}

type ProductionPreview = {
  candidate_count: number
  selected: boolean
  preview_url: string | null
  preview_label: 'Selected candidate' | 'Latest candidate' | 'Reference preview' | null
}

async function signedProductionPreview(storageBucket: string, storagePath: string) {
  const { data } = await clientBrainV2ServerClient.storage.from(storageBucket).createSignedUrl(storagePath, 60 * 60)
  return data?.signedUrl ?? null
}

async function referencePreviewFromSnapshot(snapshot: unknown) {
  if (!Array.isArray(snapshot)) return null
  const ranked = snapshot
    .filter(isRecord)
    .filter(reference => typeof reference.storage_bucket === 'string' && typeof reference.storage_path === 'string')
    .sort((left, right) => {
      const rank = (reference: JsonObject) => reference.role === 'subject_truth' ? 0 : reference.role === 'venue_truth' ? 1 : 2
      return rank(left) - rank(right)
    })
  const reference = ranked[0]
  return reference
    ? signedProductionPreview(reference.storage_bucket as string, reference.storage_path as string)
    : null
}

export async function getMonthlyPlan(clientId: string, planId: string) {
  await requireClientBrainV2(clientId)
  const [plan, productionCapability] = await Promise.all([requirePlan(clientId, planId), buildProductionCapabilityInventory(clientId)])
  const [itemsResult, activityResult, productionResult] = await Promise.all([
    clientBrainV2ServerClient.from('social_monthly_content_plan_items').select('*').eq('client_id', clientId).eq('monthly_plan_id', planId).order('position'),
    clientBrainV2ServerClient.from('social_monthly_plan_activity').select('*').eq('client_id', clientId).eq('monthly_plan_id', planId).order('created_at', { ascending: false }).limit(24),
    clientBrainV2ServerClient
      .from('social_monthly_plan_production_artifacts')
      .select('monthly_plan_item_id,status,is_selected,file_object_id,version,created_at,reference_snapshot')
      .eq('client_id', clientId)
      .eq('monthly_plan_id', planId)
      .order('version', { ascending: false }),
  ])
  if (itemsResult.error || activityResult.error || productionResult.error) throw new ClientBrainV2HttpError('Unable to load Monthly Plan details.', 500)

  const artifacts = productionResult.data ?? []
  const fileObjectIds = [...new Set(artifacts.map(artifact => artifact.file_object_id).filter((id): id is string => Boolean(id)))]
  const filesResult = fileObjectIds.length
    ? await clientBrainV2ServerClient.from('client_brain_file_objects').select('id,storage_bucket,storage_path').in('id', fileObjectIds)
    : { data: [], error: null }
  if (filesResult.error) throw new ClientBrainV2HttpError('Unable to load production preview files.', 500)
  const previewUrlByFileId = new Map<string, string | null>()
  await Promise.all((filesResult.data ?? []).map(async file => previewUrlByFileId.set(file.id, await signedProductionPreview(file.storage_bucket, file.storage_path))))

  const artifactsByItem = new Map<string, typeof artifacts>()
  for (const artifact of artifacts) artifactsByItem.set(artifact.monthly_plan_item_id, [...(artifactsByItem.get(artifact.monthly_plan_item_id) ?? []), artifact])
  const productionByItem = new Map<string, ProductionPreview>()
  for (const [itemId, itemArtifacts] of artifactsByItem) {
    const candidates = itemArtifacts.filter(artifact => (artifact.status === 'generated' || artifact.status === 'selected') && artifact.file_object_id)
    const selected = candidates.find(artifact => artifact.is_selected === true) ?? null
    const latest = selected ?? candidates[0] ?? null
    const referenceArtifact = itemArtifacts.find(artifact => Array.isArray(artifact.reference_snapshot) && artifact.reference_snapshot.length > 0) ?? null
    const previewUrl = latest?.file_object_id
      ? previewUrlByFileId.get(latest.file_object_id) ?? null
      : await referencePreviewFromSnapshot(referenceArtifact?.reference_snapshot)
    productionByItem.set(itemId, {
      candidate_count: candidates.length,
      selected: Boolean(selected),
      preview_url: previewUrl,
      preview_label: latest ? (selected ? 'Selected candidate' : 'Latest candidate') : previewUrl ? 'Reference preview' : null,
    })
  }

  return {
    plan,
    production_capability: productionCapability,
    items: (itemsResult.data ?? []).map(item => {
      const typedItem = item as {
        pillar: string
        subject: string
        creative_concept: string
        production_method: string
        status: string | null
        missing_asset_note: string | null
        required_assets: string[] | null
        metadata: JsonObject | null
      }
      return {
        ...item,
        production_summary: productionByItem.get(item.id) ?? { candidate_count: 0, selected: false, preview_url: null, preview_label: null },
        production_feasibility: assessMonthlyPlanProductionFeasibility(typedItem, productionCapability),
        planning_readiness: assessMonthlyPlanningReadiness(typedItem, productionCapability),
      }
    }),
    activity: activityResult.data ?? [],
  }
}

export async function createMonthlyPlan(clientId: string, payload: JsonObject) {
  await requireClientBrainV2(clientId)
  const planMonth = isoMonth(payload.plan_month)
  const targetFeedCount = Number(payload.target_feed_count ?? 15)
  if (!Number.isInteger(targetFeedCount) || targetFeedCount < 1 || targetFeedCount > 60) throw new ClientBrainV2HttpError('Target Feed Count must be between 1 and 60.', 400)
  const snapshot = await buildMonthlyPlanSnapshot(clientId)
  const insert = await clientBrainV2ServerClient.from('social_monthly_content_plans').insert({
    client_id: clientId,
    platform: 'instagram',
    plan_month: planMonth,
    target_feed_count: targetFeedCount,
    facebook_mirror: payload.facebook_mirror !== false,
    client_brain_snapshot: snapshot,
    snapshot_at: snapshot.retrieved_at,
  }).select('*').maybeSingle()
  if (insert.error?.code === '23505') {
    const { data: existing, error } = await clientBrainV2ServerClient.from('social_monthly_content_plans').select('*').eq('client_id', clientId).eq('platform', 'instagram').eq('plan_month', planMonth).eq('is_current', true).maybeSingle()
    if (error || !existing) throw new ClientBrainV2HttpError('A Monthly Plan already exists but could not be opened.', 409)
    return { plan: existing, created: false }
  }
  if (insert.error || !insert.data) throw new ClientBrainV2HttpError('Unable to create the Monthly Plan.', 500)
  await addActivity(clientId, insert.data.id, 'plan_created', `Created Instagram Feed plan for ${planMonth}.`, undefined, { target_feed_count: targetFeedCount })
  return { plan: insert.data, created: true }
}

export async function updateMonthlyPlan(clientId: string, planId: string, payload: JsonObject) {
  await requireClientBrainV2(clientId)
  const existing = await requirePlan(clientId, planId)
  const baseline = expectedUpdatedAt(payload.expected_updated_at)
  if (baseline !== existing.updated_at) throw new ClientBrainV2HttpError('This Monthly Plan changed after editing began. Refresh and review the latest version.', 409)
  const action = text(payload.action, 'Monthly Plan action', 40, true)
  let patch: JsonObject = {}
  let activity: { type: string; summary: string; metadata?: JsonObject } | null = null

  if (action === 'save_context') {
    const research = jsonObject(payload.research_context, 'Research Context')
    patch = {
      monthly_context: rawText(payload.monthly_context, 'Monthly Context'),
      // Keep the previous fields and research shape intact. A future Planning
      // AI may allocate the raw instruction into them, but this UI never does.
      research_context: { ...(isRecord(existing.research_context) ? existing.research_context : {}), ...research },
      facebook_mirror: payload.facebook_mirror !== false,
    }
    activity = { type: 'context_saved', summary: 'Saved raw monthly context and optional research notes.' }
  } else if (action === 'save_strategy') {
    const strategy = jsonObject(payload.strategy, 'Monthly Strategy')
    patch = {
      strategy,
      visual_direction: text(payload.visual_direction, 'Visual Direction'),
      grid_notes: text(payload.grid_notes, 'Grid Notes'),
      status: 'strategy_ready',
    }
    activity = { type: 'strategy_saved', summary: 'Saved Monthly Strategy.' }
  } else if (action === 'refresh_snapshot') {
    const snapshot = await buildMonthlyPlanSnapshot(clientId)
    patch = { client_brain_snapshot: snapshot, snapshot_at: snapshot.retrieved_at }
    activity = { type: 'snapshot_refreshed', summary: 'Refreshed the scoped Client Brain planning snapshot.' }
  } else if (action === 'mark_plan_ready') {
    const { count, error } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('monthly_plan_id', planId)
    if (error) throw new ClientBrainV2HttpError('Unable to validate Feed items.', 500)
    if (!count) throw new ClientBrainV2HttpError('Add at least one Feed item before marking the plan ready.', 400)
    patch = { status: 'plan_ready' }
    activity = { type: 'plan_ready', summary: 'Marked the Feed plan ready for review.' }
  } else if (action === 'approve') {
    const { data: items, error } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').select('objective, subject, creative_concept').eq('client_id', clientId).eq('monthly_plan_id', planId)
    if (error) throw new ClientBrainV2HttpError('Unable to validate Feed items.', 500)
    if (!items?.length) throw new ClientBrainV2HttpError('Add Feed items before approving the plan.', 400)
    if (items.some(item => !item.objective.trim() || !item.subject.trim() || !item.creative_concept.trim())) {
      throw new ClientBrainV2HttpError('Every Feed item needs an objective, subject, and creative concept before approval.', 400)
    }
    const approval = await approveMonthlyPlanWithLineage({
      clientId,
      planId,
      expectedUpdatedAt: baseline,
    })
    await addActivity(
      clientId,
      planId,
      'plan_approved',
      'Approved the monthly Feed plan for Stage 1.',
      undefined,
      {
        warnings_acknowledged: payload.warnings_acknowledged === true,
        lineage_sync: {
          operating_cycle_id: approval.lineageSync.operatingCycleId,
          cycles_created: approval.lineageSync.cyclesCreated,
          lineage_created: approval.lineageSync.lineageCreated,
          lineage_existing: approval.lineageSync.lineageExisting,
        },
      },
    )
    return approval.plan
  } else if (action === 'reopen') {
    patch = { status: 'plan_ready', approved_at: null }
    activity = { type: 'plan_reopened', summary: 'Reopened the approved plan for editing.' }
  } else {
    throw new ClientBrainV2HttpError('Unsupported Monthly Plan action.', 400)
  }

  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plans')
    .update(patch)
    .eq('id', planId)
    .eq('client_id', clientId)
    .eq('updated_at', baseline)
    .select('*')
    .maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to save the Monthly Plan.', 500)
  if (!data) throw new ClientBrainV2HttpError('This Monthly Plan changed after editing began. Refresh and review the latest version.', 409)
  if (activity) await addActivity(clientId, planId, activity.type, activity.summary, undefined, activity.metadata)
  return data
}

export async function createMonthlyPlanItem(clientId: string, planId: string, payload: JsonObject) {
  await requireClientBrainV2(clientId)
  await requirePlan(clientId, planId)
  const initialFields = itemFields(payload)
  const supportingSelection = manualSupportingProductSelection(payload)
  const activation = await validateActivation(clientId, initialFields.activation_record_id)
  const fields = await enforceActivationProductTruth(
    clientId,
    activation,
    fieldsWithManualSupportingProducts(initialFields, supportingSelection),
  )
  const { data: last, error: lastError } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items').select('position').eq('client_id', clientId).eq('monthly_plan_id', planId).order('position', { ascending: false }).limit(1).maybeSingle()
  if (lastError) throw new ClientBrainV2HttpError('Unable to allocate a Feed position.', 500)
  const position = (last?.position ?? 0) + 1
  if (position > 60) throw new ClientBrainV2HttpError('A Monthly Plan can contain at most 60 Feed items.', 400)
  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items')
    .insert({ client_id: clientId, monthly_plan_id: planId, position, ...fields, metadata: planningMetadataWithManualSupportingProducts({}, supportingSelection) })
    .select('*').single()
  if (error) throw new ClientBrainV2HttpError('Unable to add the Feed item.', 500)
  await addActivity(clientId, planId, 'item_created', `Added Feed item ${position}.`, data.id)
  return data
}

export async function updateMonthlyPlanItem(clientId: string, planId: string, itemId: string, payload: JsonObject) {
  await requireClientBrainV2(clientId)
  await requirePlan(clientId, planId)
  if (!isUuid(itemId)) throw new ClientBrainV2HttpError('Feed item not found.', 404)
  const baseline = expectedUpdatedAt(payload.expected_updated_at)
  const { data: existing, error: loadError } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items').select('*').eq('id', itemId).eq('client_id', clientId).eq('monthly_plan_id', planId).maybeSingle()
  if (loadError) throw new ClientBrainV2HttpError('Unable to load the Feed item.', 500)
  if (!existing) throw new ClientBrainV2HttpError('Feed item not found.', 404)
  if (existing.updated_at !== baseline) throw new ClientBrainV2HttpError('This Feed item changed after editing began. Refresh and review the latest version.', 409)
  const initialFields = itemFields(payload)
  const supportingSelection = manualSupportingProductSelection(payload)
  const activation = await validateActivation(clientId, initialFields.activation_record_id)
  const fields = await enforceActivationProductTruth(
    clientId,
    activation,
    fieldsWithManualSupportingProducts(initialFields, supportingSelection),
  )
  const visualDirectionChanged = [
    'shot_scale', 'camera_angle', 'composition', 'human_presence', 'interaction', 'motion', 'visual_direction', 'grid_crop_behavior',
  ].some(key => existing[key] !== fields[key as keyof typeof fields])
  const metadata = planningMetadataWithManualSupportingProducts(isRecord(existing.metadata) ? existing.metadata : {}, supportingSelection)
  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items').update({
      ...fields,
      ...(visualDirectionChanged ? {
        visual_direction_source: 'manual',
        visual_direction_prompt_version: null,
        visual_direction_execution_id: null,
        visual_direction_generated_at: null,
      } : {}),
      ...((visualDirectionChanged || supportingSelection) ? {
        metadata: visualDirectionChanged
          ? { ...metadata, visual_direction: { source: 'manual', edited_at: new Date().toISOString() } }
          : metadata,
      } : {}),
    }).eq('id', itemId).eq('client_id', clientId).eq('monthly_plan_id', planId).eq('updated_at', baseline).select('*').maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to save the Feed item.', 500)
  if (!data) throw new ClientBrainV2HttpError('This Feed item changed after editing began. Refresh and review the latest version.', 409)
  await addActivity(clientId, planId, 'item_updated', `Updated Feed item ${data.position}.`, itemId, visualDirectionChanged ? { visual_direction_source: 'manual' } : undefined)
  return data
}

export async function deleteMonthlyPlanItem(clientId: string, planId: string, itemId: string) {
  await requireClientBrainV2(clientId)
  const { data: item, error: loadError } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items').select('id, position').eq('id', itemId).eq('client_id', clientId).eq('monthly_plan_id', planId).maybeSingle()
  if (loadError) throw new ClientBrainV2HttpError('Unable to load the Feed item.', 500)
  if (!item) throw new ClientBrainV2HttpError('Feed item not found.', 404)
  const { error } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').delete().eq('id', itemId).eq('client_id', clientId).eq('monthly_plan_id', planId)
  if (error) throw new ClientBrainV2HttpError('Unable to delete the Feed item.', 500)
  const { data: remaining, error: remainingError } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').select('id, position').eq('client_id', clientId).eq('monthly_plan_id', planId).order('position')
  if (remainingError) throw new ClientBrainV2HttpError('Unable to reorder the remaining Feed items.', 500)
  for (const [index, row] of (remaining ?? []).entries()) {
    if (row.position === index + 1) continue
    const { error: updateError } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').update({ position: index + 61 }).eq('id', row.id).eq('client_id', clientId)
    if (updateError) throw new ClientBrainV2HttpError('Unable to reorder the remaining Feed items.', 500)
  }
  for (const [index, row] of (remaining ?? []).entries()) {
    const { error: updateError } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').update({ position: index + 1 }).eq('id', row.id).eq('client_id', clientId)
    if (updateError) throw new ClientBrainV2HttpError('Unable to finalize Feed item order.', 500)
  }
  await addActivity(clientId, planId, 'item_deleted', `Deleted Feed item ${item.position}.`, itemId)
}

export async function reorderMonthlyPlanItem(clientId: string, planId: string, itemId: string, targetPosition: unknown) {
  await requireClientBrainV2(clientId)
  const target = Number(targetPosition)
  if (!Number.isInteger(target) || target < 1 || target > 60) throw new ClientBrainV2HttpError('Target position is invalid.', 400)
  const { data: items, error } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').select('*').eq('client_id', clientId).eq('monthly_plan_id', planId).order('position')
  if (error) throw new ClientBrainV2HttpError('Unable to load Feed items for reorder.', 500)
  const sourceIndex = (items ?? []).findIndex(item => item.id === itemId)
  if (sourceIndex < 0) throw new ClientBrainV2HttpError('Feed item not found.', 404)
  const source = items![sourceIndex]
  const targetIndex = Math.min(target - 1, items!.length - 1)
  if (targetIndex === sourceIndex) return items
  const crossed = items!.slice(Math.min(sourceIndex, targetIndex), Math.max(sourceIndex, targetIndex) + 1)
  if (source.date_fixed || crossed.some(item => item.date_fixed)) {
    throw new ClientBrainV2HttpError('A fixed-date post cannot move or be crossed in publishing order. Edit its date first.', 409)
  }
  const reordered = [...items!]
  reordered.splice(sourceIndex, 1)
  reordered.splice(targetIndex, 0, source)
  // Position is the canonical publishing order (oldest to newest). For movable
  // posts, retain the existing slot-date sequence so reordering cannot quietly
  // create a conflicting publication order.
  const plannedDates = items!.map(item => item.planned_date)
  for (const [index, item] of reordered.entries()) {
    const { error: tempError } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').update({ position: index + 61 }).eq('id', item.id).eq('client_id', clientId).eq('monthly_plan_id', planId)
    if (tempError) throw new ClientBrainV2HttpError('Unable to stage the Feed reorder.', 500)
  }
  for (const [index, item] of reordered.entries()) {
    const { error: finalError } = await clientBrainV2ServerClient.from('social_monthly_content_plan_items').update({ position: index + 1, planned_date: plannedDates[index] }).eq('id', item.id).eq('client_id', clientId).eq('monthly_plan_id', planId)
    if (finalError) throw new ClientBrainV2HttpError('Unable to save the Feed reorder.', 500)
  }
  await addActivity(clientId, planId, 'item_reordered', `Moved Feed item ${source.position} to publishing position ${target}.`, itemId, { from: source.position, to: target })
  return reordered.map((item, index) => ({ ...item, position: index + 1 }))
}

export async function deleteMonthlyPlan(clientId: string, planId: string) {
  await requireClientBrainV2(clientId)
  const plan = await requirePlan(clientId, planId)
  if (plan.status !== 'draft') throw new ClientBrainV2HttpError('Only draft Monthly Plans can be deleted.', 409)
  const { error } = await clientBrainV2ServerClient.from('social_monthly_content_plans').delete().eq('id', planId).eq('client_id', clientId)
  if (error) throw new ClientBrainV2HttpError('Unable to delete the Monthly Plan.', 500)
}
