import {isOfficeControlRecord} from './office-record-policy.mjs';
import 'server-only'

import {
  humanConfirmedRestaurantAssetCategory,
  type ClientBrainV2ActivationTemporalResolution,
  type ClientBrainV2Record,
  type ClientBrainV2RestaurantAssetCategory,
} from '@/lib/client-brain-v2'
import {
  CLIENT_BRAIN_V2_BRAND_GUIDELINE_SUBSECTIONS,
  type ClientBrainV2BrandGuidelineRetrievalSubsection,
} from '@/lib/client-brain-v2-brand-guidelines'
import { hasMeaningfulRestaurantAssetMetadata } from '@/lib/client-brain-v2-asset-edit'
import { resolveActivationFreshness } from '@/lib/client-brain-v2-activation-freshness'
import {
  learningCategoryForRecord,
  learningScopesForRecord,
  type ClientBrainV2LearningAppliesTo,
} from '@/lib/client-brain-v2-learnings'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server-core'

export const CLIENT_BRAIN_V2_RETRIEVAL_TASK_TYPES = [
  'campaign_planning',
  'caption_writing',
  'image_generation',
  'video_generation',
  'general_marketing',
  'client_response',
  'strategy_support',
] as const

export type ClientBrainV2RetrievalTaskType = typeof CLIENT_BRAIN_V2_RETRIEVAL_TASK_TYPES[number]
export type ClientBrainV2RetrievalFreshnessMode = 'current' | 'include_scheduled' | 'include_review'

export type ClientBrainV2RetrievalRequest = {
  client_id?: string
  task_type: ClientBrainV2RetrievalTaskType
  intent?: string
  activation?: string
  menu?: string
  asset_categories?: ClientBrainV2RestaurantAssetCategory[]
  asset_ids?: string[]
  asset_role?: 'truth_reference' | 'creative_reference' | 'approved_marketing_asset' | 'generated_asset'
  channel?: string
  output_type?: string
  include_sources?: boolean
  include_learnings?: boolean
  max_assets?: number
  freshness_mode?: ClientBrainV2RetrievalFreshnessMode
  debug?: boolean
}

type RetrievalProfile = {
  intelligenceSubsections: string[]
  guidelineSubsections: ClientBrainV2BrandGuidelineRetrievalSubsection[]
  learningCategories: string[]
  legacyLearningCategories: string[]
  learningScopes: ClientBrainV2LearningAppliesTo[]
  includeOperations: boolean
  needsVerifiedCta: boolean
  relevantGapAreas: string[]
  defaultAssetCategories: ClientBrainV2RestaurantAssetCategory[]
}

type RawRecord = {
  id: string
  client_id: string
  stable_key: string
  top_section: string
  subsection: string
  record_type: string
  title: string
  summary: string | null
  content: string | null
  knowledge_class: string
  status: string
  confidence: number | null
  priority: number
  effective_date: string | null
  last_verified_at: string | null
  valid_until: string | null
  review_at: string | null
  source_type: string | null
  provenance: Record<string, unknown> | null
  superseded_by_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type RawLink = {
  from_record_id: string
  to_record_id: string
  relation_type: string
}

type RawAssignment = {
  record_id: string
  file_object_id: string
  semantic_role: string
  approval_status: string
  sort_order: number
}

type RawFile = {
  id: string
  file_name: string
  file_type: string | null
  storage_bucket: string
  storage_path: string
  preview_path: string | null
  optimized_path: string | null
}

export type RetrievedIntelligence = {
  id: string
  stable_key: string
  subsection: string
  title: string
  summary: string | null
  fields: Record<string, unknown>
  status: string
  confidence: number | null
  review_sensitive: boolean
}

export type RetrievedMenu = {
  id: string
  stable_key: string
  name: string
  service_daypart: string | null
  service_hours: string | null
  availability: string | null
  price: number | null
  currency: string | null
  price_ownership: 'menu_package' | 'not_listed'
  inclusions: string[]
  restrictions: string[]
  notes: string | null
  verified_details: string | null
  source: string | null
  status: string
  review_state: string | null
  related_asset_count: number
}

export type RetrievedActivation = {
  id: string
  stable_key: string
  name: string
  proposition: string | null
  schedule: string | null
  price: number | null
  currency: string | null
  price_ownership: 'activation_package' | 'not_listed'
  inclusions: string[]
  restrictions: string[]
  notes: string | null
  status: string
  temporal: ClientBrainV2ActivationTemporalResolution
  related_menu_ids: string[]
}

export type RetrievedAsset = {
  id: string
  filename: string
  category: ClientBrainV2RestaurantAssetCategory
  url: string | null
  url_strategy: 'signed_selected_file'
  role: string
  approved_for_generation: true
  semantic_name: string
  description: string | null
  ingredients: string[]
  allergens: string[]
  dietary: string[]
  visual_presentation: string | null
  key_visual_details: string[]
  perspective_flexibility: 'low' | 'medium' | 'high' | null
  tags: string[]
  menu_ids: string[]
  activation_ids: string[]
  source_ids: string[]
  ranking_reason: string
}

export type RetrievedGuideline = {
  id: string
  subsection: ClientBrainV2BrandGuidelineRetrievalSubsection
  title: string
  fields: Record<string, unknown>
  status: string
}

export type RetrievedBrandAsset = {
  id: string
  name: string
  kind: 'logo' | 'font' | 'graphic'
  role: string
  notes: string | null
  url: string | null
  file_name: string | null
  file_type: string | null
  hard_truth: boolean
}

type BrandAssetItem = {
  assetId: string
  name?: string
  role?: string
  notes?: string
  kind: 'logo' | 'font' | 'graphic'
}

export type RetrievedLearning = {
  id: string
  category: string
  statement: string
  confidence: number | null
  confidence_level: string
}

export type RetrievedOperation = {
  id: string
  title: string
  value: string
  last_verified_at: string | null
}

export type RetrievedSource = {
  id: string
  title: string
  status: string
  source_type: string | null
  source_date: string | null
}

export type RetrievalWarning = {
  code: string
  message: string
  record_id?: string
  knowledge_gap_id?: string
}

export type RetrievalDebugTrace = {
  profile: string
  filters: Record<string, unknown>
  records_considered: Record<string, number>
  records_excluded: Array<{ area: string; record_id: string; reason: string }>
  asset_ranking: Array<{ asset_id: string; rank: number; reason: string }>
  warnings_produced: string[]
}

export type ClientBrainV2RetrievalContext = {
  client: { id: string; name: string; subtype: string | null }
  intelligence: RetrievedIntelligence[]
  menus: RetrievedMenu[]
  activations: RetrievedActivation[]
  assets: RetrievedAsset[]
  brand_guidelines: RetrievedGuideline[]
  brand_assets: RetrievedBrandAsset[]
  learnings: RetrievedLearning[]
  operations: RetrievedOperation[]
  sources: RetrievedSource[]
  warnings: RetrievalWarning[]
  metrics: { duration_ms: number; query_count: number; payload_bytes: number }
  debug?: RetrievalDebugTrace
}

const ASSET_CATEGORIES: ClientBrainV2RestaurantAssetCategory[] = [
  'food', 'drinks', 'interiors', 'exteriors', 'venue_items',
]
const ACTIVE_STATUSES = new Set(['approved', 'active', 'current', 'resolved'])
const EXCLUDED_STATUSES = new Set(['archived', 'restricted', 'historical', 'superseded'])
const AUTOMATIC_ASSET_ROLES = new Set(['truth_reference', 'creative_reference', 'approved_marketing_asset', 'generated_asset'])
const MAX_ASSETS = 12
const SIGNED_URL_SECONDS = 60 * 30

const PROFILES: Record<ClientBrainV2RetrievalTaskType, RetrievalProfile> = {
  campaign_planning: {
    intelligenceSubsections: ['brand_identity', 'audience', 'visual_dna', 'commercial_strategy', 'market_intelligence'],
    guidelineSubsections: ['graphics_icons', 'colours', 'copy_language_system'],
    learningCategories: ['offer_performance', 'campaign_performance', 'content_performance', 'audience_insight'],
    legacyLearningCategories: ['commercial', 'performance', 'audience'],
    learningScopes: ['entire_client', 'social_media', 'activations', 'menu_offer', 'paid_ads'],
    includeOperations: false,
    needsVerifiedCta: false,
    relevantGapAreas: ['commercial_strategy', 'menus', 'activations', 'audience'],
    defaultAssetCategories: [],
  },
  caption_writing: {
    intelligenceSubsections: ['brand_identity'],
    guidelineSubsections: ['copy_language_system'],
    learningCategories: ['copy_preference', 'brand_rule', 'customer_feedback'],
    legacyLearningCategories: ['copy'],
    learningScopes: ['entire_client', 'social_media', 'instagram', 'linkedin', 'captions'],
    includeOperations: true,
    needsVerifiedCta: true,
    relevantGapAreas: ['operations', 'menus', 'activations', 'brand_identity'],
    defaultAssetCategories: [],
  },
  image_generation: {
    intelligenceSubsections: ['brand_identity', 'visual_dna'],
    guidelineSubsections: ['logos', 'colours', 'graphics_icons'],
    learningCategories: ['creative_preference', 'visual_preference', 'brand_rule'],
    legacyLearningCategories: ['creative'],
    learningScopes: ['entire_client', 'ai_photography'],
    includeOperations: false,
    needsVerifiedCta: false,
    relevantGapAreas: ['visual_dna', 'assets', 'menus', 'activations'],
    defaultAssetCategories: ASSET_CATEGORIES,
  },
  video_generation: {
    intelligenceSubsections: ['brand_identity', 'visual_dna'],
    guidelineSubsections: ['logos', 'colours', 'graphics_icons'],
    learningCategories: ['creative_preference', 'visual_preference', 'brand_rule'],
    legacyLearningCategories: ['creative'],
    learningScopes: ['entire_client', 'video'],
    includeOperations: false,
    needsVerifiedCta: false,
    relevantGapAreas: ['visual_dna', 'assets', 'menus', 'activations'],
    defaultAssetCategories: ASSET_CATEGORIES,
  },
  general_marketing: {
    intelligenceSubsections: ['brand_identity', 'audience', 'commercial_strategy'],
    guidelineSubsections: ['copy_language_system'],
    learningCategories: ['offer_performance', 'campaign_performance', 'content_performance'],
    legacyLearningCategories: ['commercial', 'performance'],
    learningScopes: ['entire_client', 'social_media', 'menu_offer', 'activations'],
    includeOperations: false,
    needsVerifiedCta: false,
    relevantGapAreas: ['commercial_strategy', 'audience'],
    defaultAssetCategories: [],
  },
  client_response: {
    intelligenceSubsections: ['brand_identity'],
    guidelineSubsections: ['copy_language_system'],
    learningCategories: ['operational_learning', 'copy_preference', 'customer_feedback'],
    legacyLearningCategories: ['operational', 'copy'],
    learningScopes: ['entire_client', 'customer_support', 'captions'],
    includeOperations: true,
    needsVerifiedCta: true,
    relevantGapAreas: ['operations', 'menus', 'activations'],
    defaultAssetCategories: [],
  },
  strategy_support: {
    intelligenceSubsections: ['brand_identity', 'audience', 'commercial_strategy', 'market_intelligence'],
    guidelineSubsections: ['copy_language_system', 'graphics_icons'],
    learningCategories: ['offer_performance', 'campaign_performance', 'content_performance', 'audience_insight'],
    legacyLearningCategories: ['commercial', 'performance', 'audience'],
    learningScopes: ['entire_client', 'social_media', 'paid_ads', 'activations', 'menu_offer'],
    includeOperations: false,
    needsVerifiedCta: false,
    relevantGapAreas: ['commercial_strategy', 'market_intelligence', 'audience'],
    defaultAssetCategories: [],
  },
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} must be an object.`, 400)
  return value as Record<string, unknown>
}

function optionalText(value: unknown, label: string, max = 500) {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim().replace(/\s+/g, ' ')
  if (!result) return undefined
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return result
}

function optionalBoolean(value: unknown, label: string) {
  if (value == null) return undefined
  if (typeof value !== 'boolean') throw new ClientBrainV2HttpError(`${label} must be true or false.`, 400)
  return value
}

function optionalAssetCategories(value: unknown) {
  if (value == null) return undefined
  if (!Array.isArray(value) || value.length > ASSET_CATEGORIES.length) throw new ClientBrainV2HttpError('asset_categories is invalid.', 400)
  const categories = [...new Set(value.map(item => String(item)))]
  if (categories.some(category => !ASSET_CATEGORIES.includes(category as ClientBrainV2RestaurantAssetCategory))) {
    throw new ClientBrainV2HttpError('asset_categories contains an unsupported category.', 400)
  }
  return categories as ClientBrainV2RestaurantAssetCategory[]
}

function optionalIdList(value: unknown) {
  if (value == null) return undefined
  if (!Array.isArray(value) || value.length > MAX_ASSETS) throw new ClientBrainV2HttpError('asset_ids is invalid.', 400)
  const ids = [...new Set(value.map(item => String(item)))]
  if (ids.some(id => !isUuid(id))) throw new ClientBrainV2HttpError('asset_ids contains an invalid ID.', 400)
  return ids
}

export function parseClientBrainV2RetrievalRequest(input: unknown): ClientBrainV2RetrievalRequest {
  const value = objectValue(input, 'Retrieval request')
  if (!CLIENT_BRAIN_V2_RETRIEVAL_TASK_TYPES.includes(value.task_type as ClientBrainV2RetrievalTaskType)) {
    throw new ClientBrainV2HttpError('task_type is invalid.', 400)
  }
  const maxAssets = value.max_assets == null ? 4 : Number(value.max_assets)
  if (!Number.isInteger(maxAssets) || maxAssets < 0 || maxAssets > MAX_ASSETS) throw new ClientBrainV2HttpError(`max_assets must be an integer between 0 and ${MAX_ASSETS}.`, 400)
  const freshnessMode = value.freshness_mode ?? 'current'
  if (!['current', 'include_scheduled', 'include_review'].includes(String(freshnessMode))) throw new ClientBrainV2HttpError('freshness_mode is invalid.', 400)
  const assetRole = optionalText(value.asset_role, 'asset_role', 80)
  if (assetRole && !['truth_reference', 'creative_reference', 'approved_marketing_asset', 'generated_asset'].includes(assetRole)) {
    throw new ClientBrainV2HttpError('asset_role is invalid.', 400)
  }
  const clientId = optionalText(value.client_id, 'client_id', 80)
  if (clientId && !isUuid(clientId)) throw new ClientBrainV2HttpError('client_id is invalid.', 400)
  return {
    client_id: clientId,
    task_type: value.task_type as ClientBrainV2RetrievalTaskType,
    intent: optionalText(value.intent, 'intent', 1200),
    activation: optionalText(value.activation, 'activation'),
    menu: optionalText(value.menu, 'menu'),
    asset_categories: optionalAssetCategories(value.asset_categories),
    asset_ids: optionalIdList(value.asset_ids),
    asset_role: assetRole as ClientBrainV2RetrievalRequest['asset_role'],
    channel: optionalText(value.channel, 'channel', 120),
    output_type: optionalText(value.output_type, 'output_type', 120),
    include_sources: optionalBoolean(value.include_sources, 'include_sources'),
    include_learnings: optionalBoolean(value.include_learnings, 'include_learnings'),
    max_assets: maxAssets,
    freshness_mode: freshnessMode as ClientBrainV2RetrievalFreshnessMode,
    debug: optionalBoolean(value.debug, 'debug'),
  }
}

function editorData(record: RawRecord) {
  const data = record.metadata?.editor_data
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : record.metadata ?? {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function compactFields(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== null && field !== undefined && field !== '').map(([key, field]) => [key, field]))
}

function toActivationRecord(record: RawRecord): ClientBrainV2Record {
  return {
    ...record,
    top_section: record.top_section as ClientBrainV2Record['top_section'],
    knowledge_class: record.knowledge_class as ClientBrainV2Record['knowledge_class'],
    status: record.status as ClientBrainV2Record['status'],
    provenance: record.provenance ?? {},
    metadata: record.metadata ?? {},
    relationships: [],
  }
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ')
}

function assetMissingSlug(record: RawRecord) {
  const stable = record.stable_key.replace(/^(menu|activation):/, '')
  return normalized(stable).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function exactRecordMatch(records: RawRecord[], requested: string | undefined) {
  if (!requested) return null
  const match = normalized(requested)
  return records.find(record => normalized(record.title) === match || normalized(record.stable_key) === match) ?? null
}

function isAllowedIntelligence(record: RawRecord) {
  return !EXCLUDED_STATUSES.has(record.status)
}

function activationAllowed(temporal: ClientBrainV2ActivationTemporalResolution, mode: ClientBrainV2RetrievalFreshnessMode) {
  if (temporal.status === 'current') return true
  if (temporal.status === 'scheduled') return mode === 'include_scheduled' || mode === 'include_review'
  return false
}

function shortSourceDate(record: RawRecord) {
  const data = editorData(record)
  return stringValue(data.source_date) ?? record.effective_date ?? record.last_verified_at?.slice(0, 10) ?? null
}

function sourceV2Value(record: RawRecord) {
  const value = record.metadata?.source_v2
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function sourceEligibleForRetrieval(record: RawRecord, mode: ClientBrainV2RetrievalFreshnessMode) {
  // Sources provide provenance in retrieval responses. They never contribute
  // raw document content, and competitor/customer-sentiment evidence is kept
  // out of ordinary client-facing workflows until a dedicated retrieval intent exists.
  if (record.status !== 'current' && !(mode === 'include_review' && record.status === 'needs_review')) return false
  const source = sourceV2Value(record)
  const scopes = Array.isArray(source.authority_scopes) ? source.authority_scopes.map(String) : []
  return source.type !== 'competitor_source'
    && !scopes.includes('competitor_intelligence')
    && !scopes.includes('customer_sentiment')
}

function assetSemanticName(record: RawRecord, category: ClientBrainV2RestaurantAssetCategory) {
  const data = editorData(record)
  const candidate = category === 'food' ? data.dish_name : category === 'drinks' ? data.drink_name : category === 'venue_items' ? data.item_name : data.space_area ?? data.area_view
  return stringValue(candidate) ?? record.title
}

function assetDescription(record: RawRecord, category: ClientBrainV2RestaurantAssetCategory) {
  if (category === 'food' || category === 'drinks') return null
  return stringValue(editorData(record).visual_presentation)
    ?? stringValue(editorData(record).description)
    ?? record.summary
}

function filePath(file: RawFile) {
  return file.preview_path || file.optimized_path || file.storage_path
}

function knowledgeGapArea(record: RawRecord) {
  const data = editorData(record)
  return stringValue(data.related_area_id) ?? stringValue(data.target_subsection) ?? ''
}

function relevantGap(record: RawRecord, profile: RetrievalProfile, request: ClientBrainV2RetrievalRequest) {
  if (!record.stable_key.startsWith('knowledge_gap:')) return false
  const area = knowledgeGapArea(record)
  const stable = record.stable_key.toLowerCase()
  if (profile.relevantGapAreas.includes(area)) return true
  if (profile.needsVerifiedCta && /(booking|contact|reservation|cta)/.test(stable)) return true
  if ((request.activation || request.menu) && /(menu|activation|offer)/.test(stable)) return true
  if (request.asset_categories?.length && /(asset|visual|food|drink|interior|exterior)/.test(stable)) return true
  return false
}

function profileFor(taskType: ClientBrainV2RetrievalTaskType): RetrievalProfile {
  return PROFILES[taskType]
}

async function signedUrlsForSelectedFiles(files: RawFile[]) {
  const byBucket = new Map<string, RawFile[]>()
  for (const file of files) {
    if (!file.storage_bucket || !filePath(file)) continue
    byBucket.set(file.storage_bucket, [...(byBucket.get(file.storage_bucket) ?? []), file])
  }
  const result = new Map<string, string>()
  await Promise.all([...byBucket.entries()].map(async ([bucket, bucketFiles]) => {
    const { data, error } = await clientBrainV2ServerClient.storage
      .from(bucket)
      .createSignedUrls(bucketFiles.map(filePath), SIGNED_URL_SECONDS)
    if (error) throw new ClientBrainV2HttpError('Unable to create selected Asset URLs.', 500)
    const byPath = new Map((data ?? []).map(item => [item.path, item.signedUrl]))
    for (const file of bucketFiles) {
      const url = byPath.get(filePath(file))
      if (url) result.set(file.id, url)
    }
  }))
  return result
}

export async function retrieveClientBrainContext(clientId: string, request: ClientBrainV2RetrievalRequest): Promise<ClientBrainV2RetrievalContext> {
  if (request.client_id && request.client_id !== clientId) throw new ClientBrainV2HttpError('client_id must match the route client.', 403)
  const startedAt = Date.now()
  let queryCount = 0
  const profile = profileFor(request.task_type)
  const client = await requireClientBrainV2(clientId)
  queryCount += 1
  const debugEnabled = request.debug === true && process.env.NODE_ENV !== 'production'
  const considered: Record<string, number> = {}
  const excluded: RetrievalDebugTrace['records_excluded'] = []
  const warnings: RetrievalWarning[] = []

  const [intelligenceResult, guidelineResult, learningResult, operationsResult, gapResult, activationResult, menuResult] = await Promise.all([
    clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'intelligence').in('subsection', profile.intelligenceSubsections),
    profile.guidelineSubsections.length
      ? clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'brand_guidelines').in('subsection', profile.guidelineSubsections)
      : Promise.resolve({ data: [], error: null }),
    request.include_learnings === false || profile.learningCategories.length === 0
      ? Promise.resolve({ data: [], error: null })
      : clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'learnings').eq('status', 'active').in('subsection', [...profile.learningCategories, ...profile.legacyLearningCategories]),
    profile.includeOperations
      ? clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'intelligence').eq('subsection', 'operations')
      : Promise.resolve({ data: [], error: null }),
    clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'intelligence').eq('subsection', 'knowledge_gaps').in('status', ['active', 'needs_review']),
    request.activation
      ? clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'intelligence').eq('subsection', 'activations').neq('status', 'archived')
      : Promise.resolve({ data: [], error: null }),
    request.menu
      ? clientBrainV2ServerClient.from('client_brain_v2_records').select('*').eq('client_id', clientId).eq('top_section', 'intelligence').eq('subsection', 'menus').eq('metadata->>menu_taxonomy_status', 'active')
      : Promise.resolve({ data: [], error: null }),
  ])
  queryCount += 3
    + (request.include_learnings === false || profile.learningCategories.length === 0 ? 0 : 1)
    + (profile.includeOperations ? 1 : 0)
    + (request.activation ? 1 : 0)
    + (request.menu ? 1 : 0)
  const allResults = [intelligenceResult, guidelineResult, learningResult, operationsResult, gapResult, activationResult, menuResult]
  if (allResults.some(result => result.error)) throw new ClientBrainV2HttpError('Unable to retrieve Client Brain context.', 500)

  const intelligenceRows = ((intelligenceResult.data ?? []) as unknown as RawRecord[]).filter(r=>!isOfficeControlRecord(r))
  const guidelineRows = (guidelineResult.data ?? []) as unknown as RawRecord[]
  const learningRows = (learningResult.data ?? []) as unknown as RawRecord[]
  const operationRows = ((operationsResult.data ?? []) as unknown as RawRecord[]).filter(r=>!isOfficeControlRecord(r))
  const gapRows = (gapResult.data ?? []) as unknown as RawRecord[]
  const activationRows = (activationResult.data ?? []) as unknown as RawRecord[]
  const menuRows = (menuResult.data ?? []) as unknown as RawRecord[]
  considered.intelligence = intelligenceRows.length
  considered.guidelines = guidelineRows.length
  considered.learnings = learningRows.length
  considered.operations = operationRows.length
  considered.knowledge_gaps = gapRows.length
  considered.activations = activationRows.length
  considered.menus = menuRows.length

  const selectedActivation = exactRecordMatch(activationRows, request.activation)
  const selectedMenuByRequest = exactRecordMatch(menuRows, request.menu)
  if (request.activation && !selectedActivation) warnings.push({ code: 'activation_not_found', message: `No Activation exactly matches “${request.activation}”.` })
  if (request.menu && !selectedMenuByRequest) warnings.push({ code: 'menu_not_found', message: `No Menu exactly matches “${request.menu}”.` })

  let activationLinks: RawLink[] = []
  if (selectedActivation) {
    const { data, error } = await clientBrainV2ServerClient
      .from('client_brain_v2_links')
      .select('from_record_id, to_record_id, relation_type')
      .eq('client_id', clientId)
      .or(`from_record_id.eq.${selectedActivation.id},to_record_id.eq.${selectedActivation.id}`)
    queryCount += 1
    if (error) throw new ClientBrainV2HttpError('Unable to retrieve Activation relationships.', 500)
    activationLinks = (data ?? []) as RawLink[]
  }
  const activationMenuIds = selectedActivation
    ? activationLinks.flatMap(link => link.relation_type === 'uses_menu'
      ? [link.from_record_id === selectedActivation.id ? link.to_record_id : link.from_record_id]
      : [])
    : []
  let linkedMenus: RawRecord[] = []
  if (activationMenuIds.length) {
    const { data, error } = await clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('*')
      .eq('client_id', clientId)
      .in('id', activationMenuIds)
      .eq('subsection', 'menus')
      .eq('metadata->>menu_taxonomy_status', 'active')
    queryCount += 1
    if (error) throw new ClientBrainV2HttpError('Unable to retrieve Activation Menus.', 500)
    linkedMenus = (data ?? []) as unknown as RawRecord[]
  }
  const selectedMenus = [...new Map([selectedMenuByRequest, ...linkedMenus].filter((record): record is RawRecord => Boolean(record)).map(record => [record.id, record])).values()]

  const selectedActivationTemporal = selectedActivation ? resolveActivationFreshness(toActivationRecord(selectedActivation)) : null
  const explicitlyReferencedReviewActivation = Boolean(selectedActivation && selectedActivationTemporal && !activationAllowed(selectedActivationTemporal, request.freshness_mode ?? 'current'))
  const activations = selectedActivation && selectedActivationTemporal && (activationAllowed(selectedActivationTemporal, request.freshness_mode ?? 'current') || explicitlyReferencedReviewActivation)
    ? [{
      id: selectedActivation.id,
      stable_key: selectedActivation.stable_key,
      name: selectedActivation.title,
      proposition: stringValue(editorData(selectedActivation).proposition) ?? selectedActivation.summary,
      schedule: stringValue(editorData(selectedActivation).schedule),
      price: numberValue(editorData(selectedActivation).price),
      currency: stringValue(editorData(selectedActivation).currency),
      price_ownership: numberValue(editorData(selectedActivation).price) != null ? 'activation_package' as const : 'not_listed' as const,
      inclusions: stringList(editorData(selectedActivation).inclusions),
      restrictions: stringList(editorData(selectedActivation).restrictions),
      notes: stringValue(editorData(selectedActivation).notes),
      status: selectedActivation.status,
      temporal: selectedActivationTemporal,
      related_menu_ids: selectedMenus.map(menu => menu.id),
    }]
    : []
  if (selectedActivation && selectedActivationTemporal && !activationAllowed(selectedActivationTemporal, request.freshness_mode ?? 'current')) {
    warnings.push({
      code: 'activation_current_validity_unverified',
      message: `${selectedActivation.title} is ${selectedActivationTemporal.status.replace('_', ' ')} and is not active truth.`,
      record_id: selectedActivation.id,
    })
  }

  const requestedCategories = request.asset_categories
    ?? (profile.defaultAssetCategories.length || request.asset_ids?.length
      ? (profile.defaultAssetCategories.length ? profile.defaultAssetCategories : ASSET_CATEGORIES)
      : (request.task_type === 'campaign_planning' ? ASSET_CATEGORIES : []))
  const shouldRetrieveAssets = request.max_assets !== 0 && requestedCategories.length > 0
    && (request.asset_ids?.length || request.asset_categories?.length || Boolean(selectedActivation || selectedMenus.length))
  let candidateAssets: RawRecord[] = []
  if (shouldRetrieveAssets) {
    let assetQuery = clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('*')
      .eq('client_id', clientId)
      .eq('top_section', 'assets')
      .eq('metadata->>asset_category_source', 'human_confirmed')
      .eq('metadata->>approved_for_generation', 'true')
      .neq('status', 'archived')
      .neq('status', 'restricted')
    if (request.asset_ids?.length) assetQuery = assetQuery.in('id', request.asset_ids)
    const { data, error } = await assetQuery
    queryCount += 1
    if (error) throw new ClientBrainV2HttpError('Unable to retrieve eligible Assets.', 500)
    candidateAssets = ((data ?? []) as unknown as RawRecord[]).filter(record => {
      const category = humanConfirmedRestaurantAssetCategory({ metadata: record.metadata ?? {} })
      const role = String(editorData(record).asset_role ?? 'raw_asset')
      const explicitlyRequested = request.asset_ids?.includes(record.id) ?? false
      return requestedCategories.includes(category)
        && (explicitlyRequested || AUTOMATIC_ASSET_ROLES.has(role))
        && (!request.asset_role || role === request.asset_role)
    })
  }
  const relationRecordIds = [...new Set([...candidateAssets.map(record => record.id), ...selectedMenus.map(record => record.id), ...activations.map(record => record.id)])]
  let assetLinks: RawLink[] = []
  if (relationRecordIds.length) {
    const idSet = relationRecordIds.join(',')
    const { data, error } = await clientBrainV2ServerClient
      .from('client_brain_v2_links')
      .select('from_record_id, to_record_id, relation_type')
      .eq('client_id', clientId)
      .or(`from_record_id.in.(${idSet}),to_record_id.in.(${idSet})`)
    queryCount += 1
    if (error) throw new ClientBrainV2HttpError('Unable to retrieve Asset relationships.', 500)
    assetLinks = (data ?? []) as RawLink[]
  }
  const selectedMenuIds = new Set(selectedMenus.map(record => record.id))
  const selectedActivationIds = new Set(activations.map(record => record.id))
  const linkedIdsFor = (assetId: string, targetIds: Set<string>) => assetLinks.flatMap(link => {
    if (link.from_record_id === assetId && targetIds.has(link.to_record_id)) return [link.to_record_id]
    if (link.to_record_id === assetId && targetIds.has(link.from_record_id)) return [link.from_record_id]
    return []
  })
  const sourceIdsFor = (assetId: string) => assetLinks.flatMap(link => link.from_record_id === assetId && link.relation_type === 'derived_from' ? [link.to_record_id] : [])
  candidateAssets = candidateAssets.filter(record => hasMeaningfulRestaurantAssetMetadata(
    humanConfirmedRestaurantAssetCategory({ metadata: record.metadata ?? {} }),
    record.metadata ?? {},
    assetLinks.filter(link => link.from_record_id === record.id && link.relation_type === 'belongs_to_menu').map(link => link.to_record_id),
  ))
  considered.assets = candidateAssets.length
  const roleRank = (role: string) => role === 'truth_reference' ? 2 : role === 'approved_marketing_asset' || role === 'creative_reference' ? 1 : 0
  const rankedAssets = candidateAssets.map(record => {
    const menuIds = linkedIdsFor(record.id, selectedMenuIds)
    const activationIds = linkedIdsFor(record.id, selectedActivationIds)
    const role = String(editorData(record).asset_role ?? 'raw_asset')
    const directActivation = activationIds.length > 0
    const directMenu = menuIds.length > 0
    const score = (directActivation ? 100 : 0) + (directMenu ? 50 : 0) + roleRank(role) * 10
    const rankingReason = request.asset_ids?.includes(record.id)
      ? 'explicit Asset ID request'
      : directActivation
      ? 'direct Activation relationship'
      : directMenu
        ? 'direct Menu relationship'
        : role === 'truth_reference'
          ? 'approved truth reference'
          : role === 'approved_marketing_asset' || role === 'creative_reference'
            ? `approved ${role.replace('_', ' ')}`
            : 'manual category confirmation'
    return { record, menuIds, activationIds, sourceIds: sourceIdsFor(record.id), role, score, rankingReason }
  }).filter(candidate => {
    if (request.asset_ids?.length) return true
    if (selectedActivationIds.size || selectedMenuIds.size) return candidate.activationIds.length > 0 || candidate.menuIds.length > 0
    return true
  }).sort((left, right) => right.score - left.score || left.record.priority - right.record.priority || left.record.title.localeCompare(right.record.title))
  const selectedAssetCandidates = rankedAssets.slice(0, request.max_assets ?? 4)
  if (shouldRetrieveAssets && (selectedActivation || selectedMenus.length) && selectedAssetCandidates.length === 0) {
    const label = selectedMenus[0]?.title ?? selectedActivation?.title ?? 'requested'
    const contextRecord = selectedMenus[0] ?? selectedActivation
    warnings.push({
      code: `approved_${contextRecord ? assetMissingSlug(contextRecord) : normalized(label).replace(/[^a-z0-9]+/g, '_')}_assets_missing`,
      message: `No eligible approved Assets are directly linked to ${label}.`,
    })
  }
  if (shouldRetrieveAssets && request.asset_categories?.length && !selectedActivation && selectedMenus.length === 0 && selectedAssetCandidates.length === 0) {
    warnings.push({
      code: 'approved_requested_asset_categories_missing',
      message: `No eligible approved Assets are available in: ${request.asset_categories.join(', ')}.`,
    })
  }

  let filesByRecord = new Map<string, RawFile>()
  if (selectedAssetCandidates.length) {
    const assetIds = selectedAssetCandidates.map(item => item.record.id)
    const { data: assignmentsData, error: assignmentsError } = await clientBrainV2ServerClient
      .from('client_brain_v2_record_files')
      .select('record_id, file_object_id, semantic_role, approval_status, sort_order')
      .eq('client_id', clientId)
      .eq('approval_status', 'approved')
      .in('record_id', assetIds)
      .order('sort_order')
    queryCount += 1
    if (assignmentsError) throw new ClientBrainV2HttpError('Unable to retrieve selected Asset files.', 500)
    const assignments = (assignmentsData ?? []) as RawAssignment[]
    const primaryAssignmentByRecord = new Map<string, RawAssignment>()
    for (const assignment of assignments) if (!primaryAssignmentByRecord.has(assignment.record_id)) primaryAssignmentByRecord.set(assignment.record_id, assignment)
    const fileObjectIds = [...new Set([...primaryAssignmentByRecord.values()].map(item => item.file_object_id))]
    if (fileObjectIds.length) {
      const { data: filesData, error: filesError } = await clientBrainV2ServerClient
        .from('client_brain_file_objects')
        .select('id, file_name, file_type, storage_bucket, storage_path, preview_path, optimized_path')
        .in('id', fileObjectIds)
      queryCount += 1
      if (filesError) throw new ClientBrainV2HttpError('Unable to retrieve selected Asset objects.', 500)
      const byId = new Map(((filesData ?? []) as RawFile[]).map(file => [file.id, file]))
      filesByRecord = new Map([...primaryAssignmentByRecord.entries()].flatMap(([recordId, assignment]) => {
        const file = byId.get(assignment.file_object_id)
        return file && filePath(file) ? [[recordId, file]] : []
      }))
    }
  }
  const fileEligibleCandidates = selectedAssetCandidates.filter(item => filesByRecord.has(item.record.id))
  for (const candidate of selectedAssetCandidates.filter(item => !filesByRecord.has(item.record.id))) {
    excluded.push({ area: 'assets', record_id: candidate.record.id, reason: 'No approved current file assignment.' })
  }
  const selectedFiles = fileEligibleCandidates.map(item => filesByRecord.get(item.record.id)!).filter(Boolean)
  const signedUrls = await signedUrlsForSelectedFiles(selectedFiles)

  const selectedSourceIds = [...new Set([
    ...fileEligibleCandidates.flatMap(item => item.sourceIds),
    ...assetLinks.filter(link => {
      const selectedRecordIds = new Set([...selectedMenus.map(item => item.id), ...activations.map(item => item.id)])
      return selectedRecordIds.has(link.from_record_id) || selectedRecordIds.has(link.to_record_id)
    }).flatMap(link => [link.from_record_id, link.to_record_id]),
  ])]
  let sources: RetrievedSource[] = []
  if (selectedSourceIds.length) {
    const { data, error } = await clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('*')
      .eq('client_id', clientId)
      .eq('top_section', 'sources')
      .in('id', selectedSourceIds)
    queryCount += 1
    if (error) throw new ClientBrainV2HttpError('Unable to retrieve supporting Sources.', 500)
    sources = ((data ?? []) as unknown as RawRecord[]).filter(record => sourceEligibleForRetrieval(record, request.freshness_mode ?? 'current')).map(record => ({
      id: record.id,
      title: record.title,
      status: record.status,
      source_type: record.source_type,
      source_date: shortSourceDate(record),
    }))
  }

  const intelligence = intelligenceRows.filter(record => {
    if (!isAllowedIntelligence(record)) {
      excluded.push({ area: 'intelligence', record_id: record.id, reason: `Status ${record.status} is excluded.` })
      return false
    }
    return true
  }).map(record => ({
    id: record.id,
    stable_key: record.stable_key,
    subsection: record.subsection,
    title: record.title,
    summary: record.summary,
    fields: compactFields(editorData(record)),
    status: record.status,
    confidence: record.confidence,
    review_sensitive: record.status === 'needs_review',
  }))
  const menus: RetrievedMenu[] = selectedMenus.filter(isAllowedIntelligence).map(record => {
    const data = editorData(record)
    return {
      id: record.id,
      stable_key: record.stable_key,
      name: record.title,
      service_daypart: stringValue(data.service_daypart),
      service_hours: stringValue(data.service_hours),
      availability: stringValue(data.availability),
      price: numberValue(data.price),
      currency: stringValue(data.currency),
      price_ownership: numberValue(data.price) != null ? 'menu_package' as const : 'not_listed' as const,
      inclusions: stringList(data.inclusions),
      restrictions: stringList(data.restrictions),
      notes: stringValue(data.notes),
      verified_details: record.content,
      source: stringValue(data.source),
      status: record.status,
      review_state: stringValue(data.review_state),
      related_asset_count: rankedAssets.filter(asset => linkedIdsFor(asset.record.id, new Set([record.id])).length > 0).length,
    }
  })
  const guidelines = guidelineRows.filter(record => !EXCLUDED_STATUSES.has(record.status)).map(record => ({
    id: record.id,
    subsection: record.subsection as ClientBrainV2BrandGuidelineRetrievalSubsection,
    title: record.title,
    fields: compactFields(editorData(record)),
    status: record.status,
  }))
  const visualBrandGuidelines = guidelines.filter(item => ['logos', 'colours', 'typography', 'graphics_icons'].includes(item.subsection))
  const brandAssetItems: BrandAssetItem[] = visualBrandGuidelines.flatMap<BrandAssetItem>(guideline => {
    const fields = guideline.fields
    const items = guideline.subsection === 'logos' ? fields.logos
      : guideline.subsection === 'typography' ? fields.fonts
        : guideline.subsection === 'graphics_icons' ? fields.graphics
          : []
    const kind: BrandAssetItem['kind'] = guideline.subsection === 'logos' ? 'logo'
      : guideline.subsection === 'typography' ? 'font'
        : 'graphic'
    if (Array.isArray(items)) return items.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const raw = item as Record<string, unknown>
      if (typeof raw.assetId !== 'string') return []
      return [{
        assetId: raw.assetId,
        ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
        ...(typeof raw.role === 'string' ? { role: raw.role } : {}),
        ...(typeof raw.notes === 'string' ? { notes: raw.notes } : {}),
        kind,
      }]
    })
    return []
  })
  let brandAssets: RetrievedBrandAsset[] = []
  if ((request.task_type === 'image_generation' || request.task_type === 'video_generation') && brandAssetItems.length) {
    const assetIds = [...new Set(brandAssetItems.map(item => String(item.assetId)))]
    const { data: assignmentsData, error: assignmentsError } = await clientBrainV2ServerClient
      .from('client_brain_v2_record_files')
      .select('record_id, file_object_id, approval_status, sort_order')
      .eq('client_id', clientId).eq('approval_status', 'approved').in('record_id', assetIds).order('sort_order')
    queryCount += 1
    if (assignmentsError) throw new ClientBrainV2HttpError('Unable to retrieve Brand Kit files.', 500)
    const primaryByRecord = new Map<string, RawAssignment>()
    for (const assignment of (assignmentsData ?? []) as RawAssignment[]) if (!primaryByRecord.has(assignment.record_id)) primaryByRecord.set(assignment.record_id, assignment)
    const objectIds = [...new Set([...primaryByRecord.values()].map(item => item.file_object_id))]
    const { data: filesData, error: filesError } = objectIds.length
      ? await clientBrainV2ServerClient.from('client_brain_file_objects').select('id, file_name, file_type, storage_bucket, storage_path, preview_path, optimized_path').in('id', objectIds)
      : { data: [], error: null }
    queryCount += objectIds.length ? 1 : 0
    if (filesError) throw new ClientBrainV2HttpError('Unable to retrieve Brand Kit objects.', 500)
    const filesByObjectId = new Map(((filesData ?? []) as RawFile[]).map(file => [file.id, file]))
    const files = [...primaryByRecord.values()].map(assignment => filesByObjectId.get(assignment.file_object_id)).filter((file): file is RawFile => Boolean(file && filePath(file)))
    const urls = await signedUrlsForSelectedFiles(files)
    brandAssets = brandAssetItems.flatMap(item => {
      const assetId = String(item.assetId)
      const assignment = primaryByRecord.get(assetId)
      const file = assignment ? filesByObjectId.get(assignment.file_object_id) : null
      if (!file) return []
      return [{
        id: assetId,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : file.file_name,
        kind: item.kind,
        role: typeof item.role === 'string' ? item.role : item.kind,
        notes: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : null,
        url: urls.get(file.id) ?? null,
        file_name: file.file_name,
        file_type: file.file_type,
        hard_truth: item.kind === 'logo' || item.kind === 'font',
      }]
    })
  }
  const learnings = learningRows.filter(record => {
    if (!ACTIVE_STATUSES.has(record.status)) return false
    if (!profile.learningCategories.includes(learningCategoryForRecord(record as unknown as ClientBrainV2Record))) return false
    const scopes = learningScopesForRecord(record as unknown as ClientBrainV2Record)
    return scopes.length === 0 || scopes.some(scope => profile.learningScopes.includes(scope))
  }).sort((left, right) => {
    const confidence = (right.confidence ?? 0) - (left.confidence ?? 0)
    if (confidence !== 0) return confidence
    return (right.updated_at ?? '').localeCompare(left.updated_at ?? '')
  }).map(record => {
    const data = editorData(record)
    return {
      id: record.id,
      category: record.subsection,
      statement: stringValue(data.learning) ?? record.summary ?? record.content ?? record.title,
      confidence: record.confidence,
      confidence_level: stringValue(data.confidence_level) ?? 'low',
    }
  })
  const operations = operationRows.filter(record => {
    const verifiedAt = record.last_verified_at ? new Date(record.last_verified_at).getTime() : NaN
    const isRecentlyVerified = Number.isFinite(verifiedAt) && verifiedAt >= Date.now() - 30 * 86_400_000
    const validUntil = record.valid_until ? new Date(record.valid_until).getTime() : null
    const validNow = validUntil == null || validUntil >= Date.now()
    const verified = ACTIVE_STATUSES.has(record.status) && isRecentlyVerified && validNow
    if (!verified) excluded.push({ area: 'operations', record_id: record.id, reason: 'Operational fact is not currently verified.' })
    return verified
  }).map(record => ({
    id: record.id,
    title: record.title,
    value: stringValue(editorData(record).value) ?? record.summary ?? record.content ?? '',
    last_verified_at: record.last_verified_at,
  }))
  if (profile.needsVerifiedCta && operations.length === 0) {
    warnings.push({ code: 'verified_booking_contact_missing', message: 'No verified booking or contact fact is available for a canonical CTA.' })
  }
  for (const gap of gapRows.filter(record => relevantGap(record, profile, request))) {
    warnings.push({
      code: `knowledge_gap:${gap.stable_key}`,
      message: gap.summary ?? gap.title,
      knowledge_gap_id: gap.id,
    })
  }

  const assets: RetrievedAsset[] = fileEligibleCandidates.map(candidate => {
    const record = candidate.record
    const data = editorData(record)
    const category = humanConfirmedRestaurantAssetCategory({ metadata: record.metadata ?? {} })
    const file = filesByRecord.get(record.id)!
    return {
      id: record.id,
      filename: file.file_name,
      category,
      url: signedUrls.get(file.id) ?? null,
      url_strategy: 'signed_selected_file',
      role: candidate.role,
      approved_for_generation: true,
      semantic_name: assetSemanticName(record, category),
      description: assetDescription(record, category),
      ingredients: stringList(data.ingredients),
      allergens: stringList(data.allergens),
      dietary: stringList(data.dietary_information),
      visual_presentation: stringValue(data.visual_presentation),
      key_visual_details: stringList(data.key_visual_details),
      perspective_flexibility: ['low', 'medium', 'high'].includes(String(data.perspective_flexibility))
        ? String(data.perspective_flexibility) as 'low' | 'medium' | 'high'
        : null,
      tags: stringList(data.tags),
      menu_ids: candidate.menuIds,
      activation_ids: candidate.activationIds,
      source_ids: candidate.sourceIds,
      ranking_reason: candidate.rankingReason,
    }
  })
  if (!request.include_sources && sources.length === 0) sources = []
  if (!request.include_sources) {
    const reviewSensitive = selectedActivation?.status === 'needs_review' || selectedMenus.some(item => item.status === 'needs_review')
    if (!reviewSensitive) sources = []
  }
  const durationMs = Date.now() - startedAt
  const baseContext = {
    client: { id: client.id, name: client.name, subtype: client.industry ?? null },
    intelligence,
    menus,
    activations,
    assets,
    brand_guidelines: guidelines,
    brand_assets: brandAssets,
    learnings,
    operations,
    sources,
    warnings,
  }
  const payloadBytes = Buffer.byteLength(JSON.stringify(baseContext), 'utf8')
  return {
    ...baseContext,
    metrics: { duration_ms: durationMs, query_count: queryCount, payload_bytes: payloadBytes },
    ...(debugEnabled ? {
      debug: {
        profile: request.task_type,
        filters: {
          activation: request.activation ?? null,
          menu: request.menu ?? null,
          asset_categories: requestedCategories,
          asset_ids: request.asset_ids ?? [],
          freshness_mode: request.freshness_mode,
          max_assets: request.max_assets,
        },
        records_considered: considered,
        records_excluded: excluded,
        asset_ranking: fileEligibleCandidates.map((asset, index) => ({ asset_id: asset.record.id, rank: index + 1, reason: asset.rankingReason })),
        warnings_produced: warnings.map(warning => warning.code),
      },
    } : {}),
  }
}

export function retrievalProfileNames() {
  return Object.fromEntries(Object.entries(PROFILES).map(([taskType, profile]) => [taskType, {
    intelligence_subsections: profile.intelligenceSubsections,
    guideline_subsections: profile.guidelineSubsections,
    learning_categories: profile.learningCategories,
  }]))
}

export const CLIENT_BRAIN_V2_RETRIEVAL_GUIDELINES = CLIENT_BRAIN_V2_BRAND_GUIDELINE_SUBSECTIONS
