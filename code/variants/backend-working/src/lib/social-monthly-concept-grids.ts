import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { buildMonthlyConceptGridPrompt, MONTHLY_CONCEPT_GRID_ASPECT_RATIO, MONTHLY_CONCEPT_GRID_OUTPUT_RESOLUTION, MONTHLY_CONCEPT_GRID_PROMPT_VERSION, MONTHLY_CONCEPT_GRID_REFERENCE_LIMIT, type ConceptGridCell, type ConceptGridReference, type VisualStoryboardPackage } from '@/lib/social-monthly-concept-grid-prompt'
import { humanConfirmedRestaurantAssetCategory } from '@/lib/client-brain-v2'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'

const CLIENT_ASSETS_BUCKET = 'client-assets'
const PROVIDER = 'google-gemini'
const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const PROVIDER_TIMEOUT_MS = 120_000

type Json = Record<string, unknown>
type PlanRow = {
  id: string
  client_id: string
  plan_month: string
  target_feed_count: number
  strategy: Json | null
  visual_direction: string | null
  grid_notes: string | null
  client_brain_snapshot: Json | null
  updated_at: string
}
type PlanItemRow = {
  id: string
  position: number
  planned_date: string | null
  pillar: string
  subject: string
  creative_concept: string
  production_method: string
  required_assets: string[] | null
  missing_asset_note: string
  visual_direction: string
  shot_scale: string
  camera_angle: string
  composition: string
  human_presence: string
  interaction: string
  motion: string
  production_aspect_ratio: '4:5'
  grid_crop_behavior: string
  grid_role: string
  status: string
  metadata: Json | null
  updated_at: string
}
type AssetRecord = { id: string; title: string; metadata: Json | null; priority: number }
type FileAssignment = { record_id: string; file_object_id: string; sort_order: number }
type FileObject = { id: string; storage_bucket: string; storage_path: string; preview_path: string | null; optimized_path: string | null; file_name: string; file_type: string | null }
type GridRow = {
  id: string
  client_id: string
  monthly_plan_id: string
  version: number
  status: 'generating' | 'generated' | 'failed' | 'stale' | 'accepted'
  is_selected: boolean
  plan_snapshot_hash: string
  correction_text: string
  prompt_version: string
  provider: string | null
  model: string | null
  reference_count: number
  reference_snapshot: unknown
  execution: Json | null
  file_object_id: string | null
  failure_reason: string | null
  generated_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

type ProviderPart = { label: string; inlineData: { mimeType: string; data: string } }

function isRecord(value: unknown): value is Json {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function data(value: Json | null) {
  const candidate = value?.editor_data
  return isRecord(candidate) ? candidate : value ?? {}
}

function stringValue(value: unknown, limit = 600) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()) : []
}

function normalized(value: string) {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function filePath(file: FileObject) {
  return file.preview_path || file.optimized_path || file.storage_path
}

function extensionFor(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  return 'jpg'
}

function planMonthLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

async function requirePlan(clientId: string, planId: string) {
  if (!isUuid(planId)) throw new ClientBrainV2HttpError('Monthly plan not found.', 404)
  const { data: plan, error } = await clientBrainV2ServerClient
    .from('social_monthly_content_plans')
    .select('id, client_id, plan_month, target_feed_count, strategy, visual_direction, grid_notes, client_brain_snapshot, updated_at')
    .eq('id', planId).eq('client_id', clientId).maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load the Monthly Plan.', 500)
  if (!plan) throw new ClientBrainV2HttpError('Monthly plan not found.', 404)
  const { data: items, error: itemError } = await clientBrainV2ServerClient
    .from('social_monthly_content_plan_items')
    .select('id, position, planned_date, pillar, subject, creative_concept, production_method, required_assets, missing_asset_note, visual_direction, shot_scale, camera_angle, composition, human_presence, interaction, motion, production_aspect_ratio, grid_crop_behavior, grid_role, status, metadata, updated_at')
    .eq('client_id', clientId).eq('monthly_plan_id', planId).order('position')
  if (itemError) throw new ClientBrainV2HttpError('Unable to load Monthly Plan concepts.', 500)
  return { plan: plan as PlanRow, items: (items ?? []) as PlanItemRow[] }
}

function semanticName(asset: AssetRecord, category: ReturnType<typeof humanConfirmedRestaurantAssetCategory>) {
  const fields = data(asset.metadata)
  if (category === 'food') return stringValue(fields.dish_name) || stringValue(fields.display_name) || asset.title
  if (category === 'drinks') return stringValue(fields.drink_name) || stringValue(fields.display_name) || asset.title
  if (category === 'venue_items') return stringValue(fields.item_name) || asset.title
  return stringValue(fields.space_area) || stringValue(fields.area_view) || asset.title
}

function venueScore(asset: AssetRecord, category: 'interiors' | 'exteriors', subject: string, concept: string) {
  const fields = data(asset.metadata)
  const haystack = normalized([asset.title, stringValue(fields.visual_presentation), ...stringList(fields.key_visual_details), ...stringList(fields.tags)].join(' '))
  const query = normalized(`${subject} ${concept}`)
  const wantsTerrace = /terrace|outdoor|exterior|dog friendly/.test(query)
  const wantsOven = /pizza|oven|chef/.test(query)
  const wantsLounge = /lounge|main dining|dining room|interior/.test(query)
  let score = -asset.priority
  if (wantsTerrace && category === 'exteriors') score += 100
  if (!wantsTerrace && category === 'interiors') score += 60
  if (wantsOven && /oven|pizza/.test(haystack)) score += 80
  if (wantsLounge && /lounge|dining|room|restaurant/.test(haystack)) score += 50
  for (const token of query.split(' ').filter(token => token.length >= 5)) if (haystack.includes(token)) score += 8
  return score
}

async function approvedAssetReferences(clientId: string) {
  const { data: records, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, metadata, priority')
    .eq('client_id', clientId).eq('top_section', 'assets').eq('record_type', 'asset').eq('status', 'approved')
  if (error) throw new ClientBrainV2HttpError('Unable to load approved Client Brain Assets.', 500)
  const eligible = ((records ?? []) as AssetRecord[]).filter(asset => {
    const fields = data(asset.metadata)
    return humanConfirmedRestaurantAssetCategory({ metadata: asset.metadata ?? {} }) !== 'unclassified'
      && (fields.approved_for_generation === true || fields.approved_for_generation === 'true')
  })
  const ids = eligible.map(asset => asset.id)
  if (!ids.length) return [] as ConceptGridReference[]
  const { data: assignments, error: assignmentError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id, file_object_id, sort_order')
    .eq('client_id', clientId).eq('approval_status', 'approved').in('record_id', ids).order('sort_order')
  if (assignmentError) throw new ClientBrainV2HttpError('Unable to load approved Asset files.', 500)
  const primaryByRecord = new Map<string, FileAssignment>()
  for (const assignment of (assignments ?? []) as FileAssignment[]) if (!primaryByRecord.has(assignment.record_id)) primaryByRecord.set(assignment.record_id, assignment)
  const fileIds = [...new Set([...primaryByRecord.values()].map(assignment => assignment.file_object_id))]
  if (!fileIds.length) return []
  const { data: files, error: fileError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, storage_bucket, storage_path, preview_path, optimized_path, file_name, file_type')
    .in('id', fileIds)
  if (fileError) throw new ClientBrainV2HttpError('Unable to load approved Asset objects.', 500)
  const filesById = new Map(((files ?? []) as FileObject[]).map(file => [file.id, file]))
  return eligible.flatMap(asset => {
    const category = humanConfirmedRestaurantAssetCategory({ metadata: asset.metadata ?? {} })
    const assignment = primaryByRecord.get(asset.id)
    const file = assignment ? filesById.get(assignment.file_object_id) : null
    if (!assignment || !file || !filePath(file) || category === 'unclassified') return []
    const fields = data(asset.metadata)
    return [{
      id: asset.id,
      file_object_id: file.id,
      name: semanticName(asset, category),
      category,
      role: category === 'food' || category === 'drinks' ? 'product_truth' as const : 'venue_truth' as const,
      perspective_flexibility: ['low', 'medium', 'high'].includes(String(fields.perspective_flexibility)) ? String(fields.perspective_flexibility) as 'low' | 'medium' | 'high' : null,
      visual_summary: stringValue(fields.visual_presentation) || stringList(fields.key_visual_details).slice(0, 5).join('; ') || null,
      file_name: file.file_name,
      storage_bucket: file.storage_bucket,
      storage_path: filePath(file),
      _priority: asset.priority,
      _raw: asset,
    }]
  }) as Array<ConceptGridReference & { _priority: number; _raw: AssetRecord }>
}

function subjectIdentity(item: PlanItemRow) {
  const planningAi = data(item.metadata).planning_ai
  const identity = isRecord(planningAi) && isRecord(planningAi.subject_identity) ? planningAi.subject_identity : {}
  return {
    type: stringValue(identity.type) || null,
    canonicalId: stringValue(identity.canonical_id) || null,
  }
}

function constraintsFor(item: PlanItemRow) {
  const query = normalized(`${item.subject} ${item.creative_concept}`)
  const constraints: string[] = []
  if (/pizza of the month/.test(query)) constraints.push('invent Pizza of the Month identity, toppings, ingredients, price, or a Margherita substitute')
  if (/chef antonio/.test(query) || /chef crafting/.test(query)) constraints.push('claim a generic chef is Chef Antonio or a canonical likeness')
  if (/dog friendly|dog/.test(query)) constraints.push('make dogs a dominant recurring motif')
  if (/emirati women/.test(query)) constraints.push('exposed shoulders or over-styled cultural stereotypes')
  if (item.pillar === 'drinks') constraints.push('alcoholic drinks or cocktail styling unless explicitly approved zero-proof truth exists')
  return constraints
}

export async function buildVisualStoryboardPackage(clientId: string, planId: string, correction = ''): Promise<VisualStoryboardPackage> {
  const [client, planDetail, assets] = await Promise.all([requireClientBrainV2(clientId), requirePlan(clientId, planId), approvedAssetReferences(clientId)])
  const { plan, items } = planDetail
  if (items.length !== plan.target_feed_count) throw new ClientBrainV2HttpError(`Concept Grid requires exactly ${plan.target_feed_count} saved Feed concepts.`, 409)

  const byId = new Map(assets.map(asset => [asset.id, asset]))
  const exactByName = new Map<string, ConceptGridReference>()
  for (const asset of assets.filter(asset => asset.category === 'food' || asset.category === 'drinks')) exactByName.set(normalized(asset.name), asset)
  const venueAssets = assets.filter(asset => asset.category === 'interiors' || asset.category === 'exteriors')
  const usedReferences = new Map<string, ConceptGridReference>()
  const ordered = [...items].sort((left, right) => right.position - left.position)
  const cells = ordered.map((item, index): ConceptGridCell => {
    const identity = subjectIdentity(item)
    const required = (item.required_assets ?? []).map(id => byId.get(id)).filter((asset): asset is ConceptGridReference => Boolean(asset))
    const exact = required.length ? required : [exactByName.get(normalized(item.subject))].filter((asset): asset is ConceptGridReference => Boolean(asset))
    const productReferences = exact.filter(asset => asset.category === 'food' || asset.category === 'drinks')
    const needsVenue = item.pillar === 'lifestyle' || item.pillar === 'interiors' || item.pillar === 'bts_service' || item.pillar === 'events'
    const preferredCategory: 'interiors' | 'exteriors' = /terrace|outdoor|exterior|dog friendly/.test(normalized(`${item.subject} ${item.creative_concept}`)) ? 'exteriors' : 'interiors'
    const venue = needsVenue
      ? venueAssets.filter(asset => asset.category === preferredCategory).sort((left, right) => venueScore((left as typeof left & { _raw: AssetRecord })._raw, preferredCategory, item.subject, item.creative_concept) - venueScore((right as typeof right & { _raw: AssetRecord })._raw, preferredCategory, item.subject, item.creative_concept)).at(-1) ?? null
      : null
    for (const reference of [...productReferences, ...(venue ? [venue] : [])]) usedReferences.set(reference.id, reference)
    const unresolvedPizza = /pizza of the month/.test(normalized(item.subject)) && Boolean(item.missing_asset_note)
    const truthStatus = unresolvedPizza || (item.status === 'blocked' && !productReferences.length && !venue) ? 'conceptual_only' : productReferences.length || venue ? 'ready' : 'missing_truth'
    return {
      grid_cell: index + 1,
      plan_item_id: item.id,
      publishing_position: item.position,
      planned_date: item.planned_date,
      pillar: item.pillar,
      subject: item.subject,
      subject_type: identity.type,
      production_method: item.production_method,
      grid_role: item.grid_role,
      concept: item.creative_concept,
      shot_scale: item.shot_scale,
      camera_angle: item.camera_angle,
      composition: item.composition,
      human_presence: item.human_presence,
      interaction: item.interaction,
      motion: item.motion,
      visual_direction: item.visual_direction,
      production_aspect_ratio: item.production_aspect_ratio,
      grid_crop_behavior: item.grid_crop_behavior,
      truth_reference_ids: productReferences.map(reference => reference.id),
      venue_reference_ids: venue ? [venue.id] : [],
      truth_status: truthStatus,
      missing_truth: truthStatus === 'ready' ? null : item.missing_asset_note || null,
      negative_constraints: constraintsFor(item),
    }
  })

  // Critical exact products win first, then shared venue context. This keeps
  // the current Gemini inline-reference request bounded and deterministic.
  const priorityReferences = [
    ...cells.flatMap(cell => cell.truth_reference_ids.map(id => usedReferences.get(id))).filter((reference): reference is ConceptGridReference => Boolean(reference)),
    ...cells.flatMap(cell => cell.venue_reference_ids.map(id => usedReferences.get(id))).filter((reference): reference is ConceptGridReference => Boolean(reference)),
  ].filter((reference, index, list) => list.findIndex(candidate => candidate.id === reference.id) === index).slice(0, MONTHLY_CONCEPT_GRID_REFERENCE_LIMIT)
  const attachedReferenceIds = new Set(priorityReferences.map(reference => reference.id))
  const boundedCells = cells.map(cell => ({
    ...cell,
    truth_reference_ids: cell.truth_reference_ids.filter(id => attachedReferenceIds.has(id)),
    venue_reference_ids: cell.venue_reference_ids.filter(id => attachedReferenceIds.has(id)),
  }))

  const snapshot = {
    plan: { id: plan.id, updated_at: plan.updated_at, strategy: plan.strategy ?? {}, visual_direction: plan.visual_direction ?? '', grid_notes: plan.grid_notes ?? '' },
    items: items.map(item => ({ id: item.id, position: item.position, planned_date: item.planned_date, pillar: item.pillar, subject: item.subject, creative_concept: item.creative_concept, production_method: item.production_method, grid_role: item.grid_role, required_assets: item.required_assets ?? [], missing_asset_note: item.missing_asset_note, shot_scale: item.shot_scale, camera_angle: item.camera_angle, composition: item.composition, human_presence: item.human_presence, interaction: item.interaction, motion: item.motion, visual_direction: item.visual_direction, production_aspect_ratio: item.production_aspect_ratio, grid_crop_behavior: item.grid_crop_behavior, status: item.status, updated_at: item.updated_at })),
  }
  const brain = plan.client_brain_snapshot ?? {}
  const brand = [
    ...((Array.isArray(brain.intelligence) ? brain.intelligence : []).filter((entry): entry is Json => isRecord(entry) && ['brand_identity', 'visual_dna', 'overview'].includes(String(entry.subsection))).map(entry => `${stringValue(entry.title, 80)}: ${stringValue(entry.summary, 220)}`)),
    'warm, authentic, Italian, social, welcoming, easy-going, cinematic, realistic, refined without formality',
  ].filter(Boolean).slice(0, 6)
  return {
    client: { id: client.id, name: client.name },
    plan: { id: plan.id, month: planMonthLabel(plan.plan_month), target_feed_count: plan.target_feed_count, strategy: plan.strategy ?? {}, visual_direction: plan.visual_direction ?? '', visual_rhythm: plan.grid_notes ?? '' },
    grid_order: 'instagram_display_newest_to_oldest',
    cells: boundedCells,
    brand,
    references: priorityReferences,
    correction: stringValue(correction, 1_200),
    plan_snapshot_hash: sha256(snapshot),
  }
}

async function addActivity(clientId: string, planId: string, actionType: string, summary: string, metadata: Json = {}) {
  const { error } = await clientBrainV2ServerClient.from('social_monthly_plan_activity').insert({ client_id: clientId, monthly_plan_id: planId, action_type: actionType, summary, metadata })
  if (error) throw new ClientBrainV2HttpError('Unable to record Concept Grid activity.', 500)
}

async function signedGridUrls(grids: GridRow[]) {
  const ids = grids.flatMap(grid => grid.file_object_id ? [grid.file_object_id] : [])
  if (!ids.length) return new Map<string, string>()
  const { data: files, error } = await clientBrainV2ServerClient.from('client_brain_file_objects').select('id, storage_bucket, storage_path, preview_path, optimized_path, file_name, file_type').in('id', ids)
  if (error) throw new ClientBrainV2HttpError('Unable to load Concept Grid files.', 500)
  const byBucket = new Map<string, FileObject[]>()
  for (const file of (files ?? []) as FileObject[]) byBucket.set(file.storage_bucket, [...(byBucket.get(file.storage_bucket) ?? []), file])
  const result = new Map<string, string>()
  await Promise.all([...byBucket.entries()].map(async ([bucket, bucketFiles]) => {
    const { data, error } = await clientBrainV2ServerClient.storage.from(bucket).createSignedUrls(bucketFiles.map(filePath), 60 * 30)
    if (error) throw new ClientBrainV2HttpError('Unable to sign Concept Grid files.', 500)
    const urls = new Map((data ?? []).map(entry => [entry.path, entry.signedUrl]))
    for (const file of bucketFiles) {
      const url = urls.get(filePath(file))
      if (url) result.set(file.id, url)
    }
  }))
  return result
}

export async function listConceptGrids(clientId: string, planId: string) {
  await requireClientBrainV2(clientId)
  await requirePlan(clientId, planId)
  const { data, error } = await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').select('*').eq('client_id', clientId).eq('monthly_plan_id', planId).order('version', { ascending: false })
  if (error) throw new ClientBrainV2HttpError('Unable to load Concept Grids.', 500)
  const grids = (data ?? []) as GridRow[]
  const urls = await signedGridUrls(grids)
  return grids.map(grid => ({ ...grid, image_url: grid.file_object_id ? urls.get(grid.file_object_id) ?? null : null }))
}

async function referenceParts(references: ConceptGridReference[]) {
  const parts: ProviderPart[] = []
  const failures: Array<{ id: string; name: string; reason: string }> = []
  for (const reference of references) {
    const { data: blob, error } = await clientBrainV2ServerClient.storage.from(reference.storage_bucket).download(reference.storage_path)
    if (error || !blob) {
      failures.push({ id: reference.id, name: reference.name, reason: error?.message || 'Reference download failed.' })
      continue
    }
    const bytes = Buffer.from(await blob.arrayBuffer())
    parts.push({
      label: `[CONCEPT GRID REF ${String(parts.length + 1).padStart(2, '0')}] ${reference.role.toUpperCase()} / ${reference.name} / ${reference.category}. Use as client truth only where its cell brief calls for it.`,
      inlineData: { mimeType: blob.type || 'image/jpeg', data: bytes.toString('base64') },
    })
  }
  return { parts, failures }
}

async function callGemini(prompt: string, references: ProviderPart[]) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new ClientBrainV2HttpError('Gemini image generation is not configured.', 503)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...references.flatMap(reference => [{ text: reference.label }, { inlineData: reference.inlineData }])]}],
        generationConfig: { candidateCount: 1, responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: MONTHLY_CONCEPT_GRID_ASPECT_RATIO, imageSize: MONTHLY_CONCEPT_GRID_OUTPUT_RESOLUTION } },
      }),
    })
    const payload = await response.json().catch(() => ({})) as Json
    return { response, payload, latencyMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timer)
  }
}

function generatedImage(payload: Json) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    const content = isRecord(candidate) && isRecord(candidate.content) ? candidate.content : null
    const parts = content && Array.isArray(content.parts) ? content.parts : []
    for (const part of parts) {
      const inline = isRecord(part) && (isRecord(part.inlineData) ? part.inlineData : isRecord(part.inline_data) ? part.inline_data : null)
      if (inline && typeof inline.data === 'string') return { data: inline.data, mimeType: stringValue(inline.mimeType) || stringValue(inline.mime_type) || 'image/png' }
    }
  }
  return null
}

function providerError(payload: Json) {
  const error = isRecord(payload.error) ? payload.error : null
  return error ? stringValue(error.message, 1_000) || 'Gemini Concept Grid generation failed.' : 'Gemini Concept Grid generation failed.'
}

async function nextVersion(clientId: string, planId: string) {
  const { data, error } = await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').select('version').eq('client_id', clientId).eq('monthly_plan_id', planId).order('version', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to allocate a Concept Grid version.', 500)
  return (data?.version ?? 0) + 1
}

function safeReferenceSnapshot(references: ConceptGridReference[]) {
  return references.map(reference => ({ id: reference.id, file_object_id: reference.file_object_id, name: reference.name, category: reference.category, role: reference.role, perspective_flexibility: reference.perspective_flexibility, visual_summary: reference.visual_summary, file_name: reference.file_name }))
}

async function markGridFailed(clientId: string, planId: string, gridId: string, reason: string, execution: Json) {
  await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').update({ status: 'failed', failure_reason: reason, execution }).eq('id', gridId).eq('client_id', clientId).eq('monthly_plan_id', planId)
  await addActivity(clientId, planId, 'concept_grid_failed', 'Concept Grid generation failed. Previous storyboard versions were preserved.', { grid_id: gridId, reason })
}

export function conceptGridProviderStatus() {
  const mode = process.env.SOCIAL_CONCEPT_GRID_MODE === 'live' ? 'live' : 'dry_run'
  return { mode, provider: PROVIDER, model: MODEL, configured: Boolean(process.env.GEMINI_API_KEY), aspect_ratio: MONTHLY_CONCEPT_GRID_ASPECT_RATIO, output_resolution: MONTHLY_CONCEPT_GRID_OUTPUT_RESOLUTION, reference_limit: MONTHLY_CONCEPT_GRID_REFERENCE_LIMIT }
}

export async function inspectConceptGrid(clientId: string, planId: string, correction?: string) {
  const storyboard = await buildVisualStoryboardPackage(clientId, planId, correction)
  return { storyboard, prompt: buildMonthlyConceptGridPrompt(storyboard), provider: conceptGridProviderStatus() }
}

export async function generateConceptGrid(clientId: string, planId: string, correction?: string) {
  const inspection = await inspectConceptGrid(clientId, planId, correction)
  const { storyboard, prompt } = inspection
  const provider = inspection.provider
  if (!storyboard.references.length) {
    throw new ClientBrainV2HttpError('Concept Grid generation needs at least one approved client truth reference. Add or approve a suitable Asset before generating.', 409)
  }
  if (provider.mode !== 'live') {
    return { mode: 'dry_run' as const, blocked: true, message: 'Concept Grid generation is in dry-run mode. No provider request was made.', storyboard, prompt, provider }
  }
  if (!provider.configured) throw new ClientBrainV2HttpError('Gemini image generation is not configured. No provider request was made.', 503)

  const version = await nextVersion(clientId, planId)
  const gridId = randomUUID()
  const { error: insertError } = await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').insert({
    id: gridId, client_id: clientId, monthly_plan_id: planId, version, status: 'generating',
    plan_snapshot_hash: storyboard.plan_snapshot_hash,
    plan_snapshot: { client: storyboard.client, plan: storyboard.plan, grid_order: storyboard.grid_order, cells: storyboard.cells },
    correction_text: storyboard.correction, prompt_version: MONTHLY_CONCEPT_GRID_PROMPT_VERSION,
    provider: PROVIDER, model: MODEL, reference_count: storyboard.references.length,
    reference_snapshot: safeReferenceSnapshot(storyboard.references), execution: { started_at: new Date().toISOString(), attempt_count: 1, prompt_length: prompt.length, aspect_ratio: MONTHLY_CONCEPT_GRID_ASPECT_RATIO, output_resolution: MONTHLY_CONCEPT_GRID_OUTPUT_RESOLUTION },
  })
  if (insertError) throw new ClientBrainV2HttpError('Unable to create a Concept Grid record. No provider request was made.', 500)

  const startedAt = Date.now()
  const prepared = await referenceParts(storyboard.references)
  if (prepared.failures.length) {
    const reason = 'One or more selected Concept Grid references could not be downloaded.'
    await markGridFailed(clientId, planId, gridId, reason, { started_at: new Date(startedAt).toISOString(), attempt_count: 1, reference_failures: prepared.failures })
    throw new ClientBrainV2HttpError(reason, 400)
  }
  let providerResult: Awaited<ReturnType<typeof callGemini>>
  try {
    providerResult = await callGemini(prompt, prepared.parts)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Gemini Concept Grid generation request failed.'
    await markGridFailed(clientId, planId, gridId, reason, { started_at: new Date(startedAt).toISOString(), attempt_count: 1, failure_stage: 'provider_request' })
    throw new ClientBrainV2HttpError(reason, 502)
  }
  const payload = providerResult.payload
  const image = generatedImage(payload)
  if (!providerResult.response.ok || !image) {
    const reason = providerError(payload)
    await markGridFailed(clientId, planId, gridId, reason, { started_at: new Date(startedAt).toISOString(), completed_at: new Date().toISOString(), attempt_count: 1, provider_status: providerResult.response.status, latency_ms: providerResult.latencyMs, response_summary: { error: isRecord(payload.error) ? payload.error : null } })
    throw new ClientBrainV2HttpError(reason, providerResult.response.status || 502)
  }
  const buffer = Buffer.from(image.data, 'base64')
  const path = `${clientId}/monthly-concept-grids/${gridId}.${extensionFor(image.mimeType)}`
  const { error: uploadError } = await clientBrainV2ServerClient.storage.from(CLIENT_ASSETS_BUCKET).upload(path, buffer, { contentType: image.mimeType, upsert: false })
  if (uploadError) {
    const reason = `Concept Grid storage failed: ${uploadError.message}`
    await markGridFailed(clientId, planId, gridId, reason, { started_at: new Date(startedAt).toISOString(), completed_at: new Date().toISOString(), attempt_count: 1, provider_status: providerResult.response.status, latency_ms: providerResult.latencyMs, failure_stage: 'storage' })
    throw new ClientBrainV2HttpError(reason, 500)
  }
  const { data: file, error: fileError } = await clientBrainV2ServerClient.from('client_brain_file_objects').insert({
    storage_bucket: CLIENT_ASSETS_BUCKET, storage_path: path, file_name: `Concept Grid - ${storyboard.plan.month} - v${version}.${extensionFor(image.mimeType)}`,
    file_type: image.mimeType, file_size_bytes: buffer.length,
    metadata: { artifact_type: 'monthly_concept_grid', client_id: clientId, monthly_plan_id: planId, version, generated_by: PROVIDER, model: MODEL, prompt_version: MONTHLY_CONCEPT_GRID_PROMPT_VERSION },
  }).select('id').maybeSingle()
  if (fileError || !file) {
    await clientBrainV2ServerClient.storage.from(CLIENT_ASSETS_BUCKET).remove([path])
    const reason = 'Concept Grid file registration failed. Generated media was not retained.'
    await markGridFailed(clientId, planId, gridId, reason, { started_at: new Date(startedAt).toISOString(), completed_at: new Date().toISOString(), attempt_count: 1, provider_status: providerResult.response.status, latency_ms: providerResult.latencyMs, failure_stage: 'persistence' })
    throw new ClientBrainV2HttpError(reason, 500)
  }
  const execution = { started_at: new Date(startedAt).toISOString(), completed_at: new Date().toISOString(), attempt_count: 1, provider_status: providerResult.response.status, latency_ms: providerResult.latencyMs, estimated_cost_usd: 0.134, output_bytes: buffer.length }
  const { error: updateError } = await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').update({ status: 'generated', generated_at: new Date().toISOString(), file_object_id: file.id, execution }).eq('id', gridId).eq('client_id', clientId).eq('monthly_plan_id', planId)
  if (updateError) throw new ClientBrainV2HttpError('Concept Grid was stored but its plan record could not be finalized.', 500)
  await addActivity(clientId, planId, 'concept_grid_generated', `Generated Concept Grid version ${version}.`, { grid_id: gridId, reference_count: storyboard.references.length, provider: PROVIDER, model: MODEL, estimated_cost_usd: 0.134 })
  return { mode: 'live' as const, blocked: false, grid_id: gridId, version, provider, reference_count: storyboard.references.length }
}

export async function updateConceptGrid(clientId: string, planId: string, gridId: string, action: 'select' | 'accept') {
  await requireClientBrainV2(clientId)
  await requirePlan(clientId, planId)
  if (!isUuid(gridId)) throw new ClientBrainV2HttpError('Concept Grid not found.', 404)
  const { data: grid, error } = await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').select('*').eq('id', gridId).eq('client_id', clientId).eq('monthly_plan_id', planId).maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load Concept Grid.', 500)
  if (!grid) throw new ClientBrainV2HttpError('Concept Grid not found.', 404)
  const row = grid as GridRow
  if (row.status !== 'generated' && row.status !== 'accepted') throw new ClientBrainV2HttpError('Only a generated, current Concept Grid can be selected or accepted.', 409)
  await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').update({ is_selected: false }).eq('client_id', clientId).eq('monthly_plan_id', planId).neq('id', gridId)
  const patch = action === 'accept' ? { is_selected: true, status: 'accepted', accepted_at: new Date().toISOString() } : { is_selected: true }
  const { data: updated, error: updateError } = await clientBrainV2ServerClient.from('social_monthly_plan_concept_grids').update(patch).eq('id', gridId).eq('client_id', clientId).eq('monthly_plan_id', planId).select('*').maybeSingle()
  if (updateError || !updated) throw new ClientBrainV2HttpError('Unable to update Concept Grid selection.', 500)
  await addActivity(clientId, planId, action === 'accept' ? 'concept_grid_accepted' : 'concept_grid_selected', action === 'accept' ? `Accepted Concept Grid version ${row.version} as month-level visual direction.` : `Selected Concept Grid version ${row.version}.`, { grid_id: gridId })
  return updated
}
