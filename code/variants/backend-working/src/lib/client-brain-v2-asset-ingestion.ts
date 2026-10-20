import 'server-only'

import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import {
  findOfficialMenuMatches,
  menuTruthToAssetFields,
  resolveOfficialMenuItemPricing,
  type MenuItemTruth,
} from '@/lib/client-brain-v2-menu-intelligence'
import { analyseVenueVisualTruth } from '@/lib/client-brain-v2-asset-vision'
import { analyseAssetVisualTruth } from '@/lib/client-brain-v2-asset-vision'
import { EDITABLE_RESTAURANT_ASSET_CATEGORIES, hasMeaningfulRestaurantAssetMetadata } from '@/lib/client-brain-v2-asset-edit'

const BUCKET = 'client-assets'
const TEMP_PREFIX = 'asset-ingestion'
const PROVIDER = 'google-gemini'
const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const PROVIDER_TIMEOUT_MS = 120_000

export const INGESTION_CATEGORIES = EDITABLE_RESTAURANT_ASSET_CATEGORIES
export type AssetIngestionCategory = typeof INGESTION_CATEGORIES[number]

type DraftRow = {
  id: string
  client_id: string
  asset_category: AssetIngestionCategory
  state: string
  display_name: string | null
  menu_record_id: string | null
  menu_item_id: string | null
  metadata: Record<string, unknown>
  execution: Record<string, unknown>
  generated_output: Record<string, unknown>
  final_asset_id: string | null
  cleanup_attempts: number
  cleanup_error: string | null
  created_at: string
  updated_at: string
}

type TempFileRow = {
  id: string
  client_id: string
  draft_id: string
  storage_bucket: string
  storage_path: string
  file_name: string
  file_type: string
  file_size_bytes: number
  width: number | null
  height: number | null
  sort_order: number
  file_kind: 'raw_reference' | 'original_venue' | 'generated_preview'
  cleanup_state: string
}

type IngestionVisualAnalysis = {
  status: 'completed' | 'failed'
  source: 'generated_studio_truth' | 'staged_venue_truth'
  attempted_at: string
  warning?: string
  cost_usd?: number
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>
  usageMetadata?: unknown
  error?: { message?: string; code?: number; status?: string }
}

function isCategory(value: unknown): value is AssetIngestionCategory {
  return typeof value === 'string' && INGESTION_CATEGORIES.includes(value as AssetIngestionCategory)
}

function text(value: unknown, label: string, max = 800) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > max) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return normalized
}

function optionalText(value: unknown, max = 1600) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

function stringList(value: unknown, maxItems = 20, maxItemLength = 240) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap(item => typeof item === 'string' ? [item.trim().replace(/\s+/g, ' ')] : []).filter(Boolean).map(item => item.slice(0, maxItemLength)))].slice(0, maxItems)
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'asset'
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function productCategory(category: AssetIngestionCategory) {
  return category === 'food' || category === 'drinks'
}

function staffCategory(category: AssetIngestionCategory) {
  return category === 'staff'
}

function menuFieldsFor(category: AssetIngestionCategory, item: MenuItemTruth, pricing: Awaited<ReturnType<typeof resolveOfficialMenuItemPricing>>) {
  const fields = menuTruthToAssetFields(item, category as 'food' | 'drinks', pricing)
  return {
    ...fields,
    visual_presentation: '',
  }
}

function studioPrompt(category: 'food' | 'drinks', canonicalName: string, sourceCount: number, menuTruth: Record<string, unknown>, visualPresentation: string) {
  const object = category === 'food' ? 'dish and its true plate/vessel' : 'drink and its true glass/vessel'
  const ingredients = stringList(menuTruth.ingredients, 20, 300)
  const dietary = stringList(menuTruth.dietary_information, 12, 120)
  const hasCanonicalIdentity = Boolean(canonicalName)
  return [
    '[OBJECTIVE]',
    hasCanonicalIdentity
      ? `Create one clean studio truth reference of the selected ${object}: ${canonicalName}.`
      : `Create one clean studio truth reference of the ${object} shown in the attached source reference image${sourceCount === 1 ? '' : 's'}. Do not identify or name the product.`,
    `[MULTI_REFERENCE] Use all ${sourceCount} attached source reference image${sourceCount === 1 ? '' : 's'} for the same item. Do not make duplicates.`,
    '[SOURCE TRUTH]',
    hasCanonicalIdentity
      ? `Preserve the confirmed ${category} identity, proportions, presentation, vessel, material, garnish, and visible product detail.`
      : `Preserve the visible ${category} exactly as shown: proportions, presentation, vessel, material, garnish, and visible product detail. Do not infer recipe, ingredients, dish name, drink name, menu category, price, allergens, or alcohol status.`,
    ingredients.length ? `Official menu ingredients (do not replace): ${ingredients.join('; ')}.` : '',
    dietary.length ? `Official dietary markers: ${dietary.join(', ')}.` : '',
    visualPresentation ? `Reviewed visual presentation: ${visualPresentation}` : '',
    '[STUDIO OUTPUT]',
    'Clean studio reference, full object visible, centered, uncluttered, no venue context, no people, no hands, no unrelated props, no lifestyle scene.',
    'Do not invent a dish, vessel, garnish, branding, or environmental styling not supported by the attached references.',
  ].filter(Boolean).join('\n')
}

function fieldProvenance(draft: DraftRow, item?: MenuItemTruth) {
  const existing = draft.metadata.field_provenance
  const provenance = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {}
  if (!item) return provenance
  const source = {
    channel: 'official_menu', menu_item_id: item.id, menu_record_id: item.menu_record_id,
    source_record_id: item.source_record_id, source_file_object_id: item.source_file_object_id,
    source_document_version: item.source_document_version, source_page: item.source_page,
  }
  for (const key of ['dish_name', 'drink_name', 'menu_category', 'drink_category', 'ingredients', 'allergens', 'dietary_information', 'alcohol_status']) {
    if (draft.metadata[key] != null) provenance[key] = source
  }
  return provenance
}

async function ensureBucket() {
  const { data, error } = await clientBrainV2ServerClient.storage.listBuckets()
  if (error) throw new ClientBrainV2HttpError('Unable to inspect Asset storage.', 500)
  if (!data?.some(bucket => bucket.name === BUCKET)) {
    const { error: createError } = await clientBrainV2ServerClient.storage.createBucket(BUCKET, { public: false })
    if (createError) throw new ClientBrainV2HttpError('Unable to prepare Asset storage.', 500)
  }
}

async function signedUrl(path: string) {
  const { data, error } = await clientBrainV2ServerClient.storage.from(BUCKET).createSignedUrl(path, 60 * 30)
  if (error || !data?.signedUrl) throw new ClientBrainV2HttpError('Unable to create a temporary Asset preview.', 500)
  return data.signedUrl
}

async function loadDraft(clientId: string, draftId: string) {
  if (!isUuid(draftId)) throw new ClientBrainV2HttpError('Invalid ingestion draft.', 400)
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_asset_ingestion_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load the ingestion draft.', 500)
  if (!data) throw new ClientBrainV2HttpError('Ingestion draft not found for this client.', 404)
  return data as DraftRow
}

async function loadDraftFiles(clientId: string, draftId: string) {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_asset_ingestion_temp_files')
    .select('*')
    .eq('client_id', clientId)
    .eq('draft_id', draftId)
    .neq('cleanup_state', 'cleaned')
    .order('sort_order')
  if (error) throw new ClientBrainV2HttpError('Unable to load ingestion files.', 500)
  return (data ?? []) as TempFileRow[]
}

async function draftPayload(draft: DraftRow) {
  const files = await loadDraftFiles(draft.client_id, draft.id)
  const previewFiles = await Promise.all(files.map(async file => ({
    id: file.id,
    file_name: file.file_name,
    file_type: file.file_type,
    file_kind: file.file_kind,
    width: file.width,
    height: file.height,
    signed_url: await signedUrl(file.storage_path),
  })))
  return { draft, files: previewFiles }
}

function visualAnalysisFailure(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Visual metadata analysis failed.'
}

async function saveVisualAnalysisState(draft: DraftRow, analysis: IngestionVisualAnalysis, metadata = draft.metadata) {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_asset_ingestion_drafts')
    .update({ metadata, execution: { ...draft.execution, visual_analysis: analysis } })
    .eq('id', draft.id)
    .eq('client_id', draft.client_id)
    .select('*')
    .single()
  if (error || !data) throw new ClientBrainV2HttpError('Visual metadata state could not be saved for review.', 500)
  return data as DraftRow
}

export async function loadAssetIngestionOptions(clientId: string) {
  await requireClientBrainV2(clientId)
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, status, metadata')
    .eq('client_id', clientId)
    .eq('subsection', 'menus')
    .eq('record_type', 'menu')
    .eq('metadata->>menu_taxonomy_status', 'active')
    .neq('status', 'archived')
    .order('title')
  if (error) throw new ClientBrainV2HttpError('Unable to load official menu options.', 500)
  return { menus: data ?? [] }
}

export async function stageAssetIngestion(clientId: string, form: FormData) {
  await requireClientBrainV2(clientId)
  const category = form.get('category')
  if (!isCategory(category)) throw new ClientBrainV2HttpError('Choose a supported Asset type.', 400)
  const displayName = optionalText(form.get('display_name'), 300)
  const files = form.getAll('files').filter((value): value is File => value instanceof File && value.size > 0)
  const expectedCount = productCategory(category) ? { min: 1, max: 2 } : staffCategory(category) ? { min: 1, max: 12 } : { min: 1, max: 1 }
  if (files.length < expectedCount.min || files.length > expectedCount.max) {
    throw new ClientBrainV2HttpError(productCategory(category) ? 'Food and Drink ingestion needs one or two reference images.' : staffCategory(category) ? 'Staff ingestion needs one to twelve identity reference images.' : 'Venue ingestion needs exactly one source image.', 400)
  }
  if (files.some(file => !file.type.startsWith('image/'))) throw new ClientBrainV2HttpError('Only image files are supported in this workflow.', 400)

  await ensureBucket()
  const { data: draft, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_asset_ingestion_drafts')
    .insert({ client_id: clientId, asset_category: category, display_name: displayName || null, metadata: { submitted_name: displayName || null } })
    .select('*')
    .single()
  if (error || !draft) throw new ClientBrainV2HttpError('Unable to start Asset ingestion.', 500)

  const stored: Array<Record<string, unknown>> = []
  try {
    for (const [index, file] of files.entries()) {
      const input = Buffer.from(await file.arrayBuffer())
      const image = await sharp(input, { limitInputPixels: false }).rotate().metadata().catch(() => ({ width: null, height: null }))
      const path = `${clientId}/${TEMP_PREFIX}/${draft.id}/raw/${String(index + 1).padStart(2, '0')}_${randomUUID()}_${safeName(file.name)}`
      const { error: uploadError } = await clientBrainV2ServerClient.storage.from(BUCKET).upload(path, input, { contentType: file.type, upsert: false })
      if (uploadError) throw new ClientBrainV2HttpError(`Unable to stage ${file.name}.`, 500)
      stored.push({
        client_id: clientId,
        draft_id: draft.id,
        storage_bucket: BUCKET,
        storage_path: path,
        file_name: file.name,
        file_type: file.type,
        file_size_bytes: input.length,
        width: image.width ?? null,
        height: image.height ?? null,
        sort_order: index,
        file_kind: productCategory(category) ? 'raw_reference' : 'original_venue',
      })
    }
    const { error: tempError } = await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_temp_files').insert(stored)
    if (tempError) throw new ClientBrainV2HttpError('Unable to register staged Asset files.', 500)
  } catch (error) {
    const paths = stored.map(item => String(item.storage_path))
    if (paths.length) await clientBrainV2ServerClient.storage.from(BUCKET).remove(paths)
    await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_drafts').delete().eq('id', draft.id).eq('client_id', clientId)
    throw error
  }
  const stagedDraft = draft as DraftRow
  if (category !== 'interiors' && category !== 'exteriors') return draftPayload(stagedDraft)

  try {
    const result = await analyseAssetIngestionVenue(clientId, { draft_id: stagedDraft.id })
    return { ...(await draftPayload(result.draft ?? stagedDraft)), visual_analysis: result.analysis }
  } catch (error) {
    // Staging is still valid when optional visual metadata cannot be generated.
    const visualAnalysis: IngestionVisualAnalysis = {
      status: 'failed',
      source: 'staged_venue_truth',
      attempted_at: new Date().toISOString(),
      warning: visualAnalysisFailure(error),
    }
    let reviewDraft = stagedDraft
    try {
      reviewDraft = await saveVisualAnalysisState(stagedDraft, visualAnalysis)
    } catch {
      // The source image remains recoverable even if the diagnostic state cannot be persisted.
    }
    return {
      ...(await draftPayload(reviewDraft)),
      visual_analysis: visualAnalysis,
    }
  }
}

async function currentMenuItem(clientId: string, menuItemId: string, expectedMenuId?: string | null) {
  if (!isUuid(menuItemId)) throw new ClientBrainV2HttpError('Select an official menu item.', 400)
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_menu_items')
    .select('*')
    .eq('id', menuItemId)
    .eq('client_id', clientId)
    .eq('source_status', 'current')
    .maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load the official menu item.', 500)
  if (!data || (expectedMenuId && data.menu_record_id !== expectedMenuId)) throw new ClientBrainV2HttpError('The selected menu item does not belong to this client and menu.', 403)
  return data as MenuItemTruth
}

export async function matchAssetIngestionMenu(clientId: string, input: unknown) {
  const value = input as Record<string, unknown>
  const draft = await loadDraft(clientId, text(value.draft_id, 'Ingestion draft', 80))
  if (!productCategory(draft.asset_category)) throw new ClientBrainV2HttpError('Only Food and Drink ingestion uses menu matching.', 400)
  const name = text(value.name, 'Product name', 300)
  const menuRecordId = optionalText(value.menu_record_id, 80)
  if (menuRecordId && !isUuid(menuRecordId)) throw new ClientBrainV2HttpError('The selected menu is invalid.', 400)
  const menuRecordIds = menuRecordId
    ? [menuRecordId]
    : (await loadAssetIngestionOptions(clientId)).menus.map(menu => menu.id)
  const result = await findOfficialMenuMatches({ clientId, name, menuRecordIds })
  return { result }
}

export async function selectAssetIngestionMenu(clientId: string, input: unknown) {
  const value = input as Record<string, unknown>
  const draft = await loadDraft(clientId, text(value.draft_id, 'Ingestion draft', 80))
  if (!productCategory(draft.asset_category)) throw new ClientBrainV2HttpError('Only Food and Drink ingestion uses menu matching.', 400)
  const menuRecordId = text(value.menu_record_id, 'Menu', 80)
  const item = await currentMenuItem(clientId, text(value.menu_item_id, 'Menu item', 80), menuRecordId)
  const pricing = await resolveOfficialMenuItemPricing(clientId, item)
  const selectedFields = menuFieldsFor(draft.asset_category, item, pricing)
  const nextDraft = { ...draft, metadata: { ...draft.metadata, ...selectedFields } }
  const metadata = {
    ...nextDraft.metadata,
    field_provenance: fieldProvenance(nextDraft, item),
    menu_item_name: item.canonical_name,
    menu_match_type: optionalText(value.match_type, 40) || 'manual_selection',
    canonical_menu_item_id: item.id,
    canonical_menu_item_name: item.canonical_name,
    canonical_menu_record_id: item.menu_record_id,
    canonical_menu_source_record_id: item.source_record_id,
    canonical_menu_match_type: optionalText(value.match_type, 40) || 'manual_selection',
  }
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_asset_ingestion_drafts')
    .update({ menu_record_id: menuRecordId, menu_item_id: item.id, metadata })
    .eq('id', draft.id)
    .eq('client_id', clientId)
    .select('*')
    .single()
  if (error || !data) throw new ClientBrainV2HttpError('Unable to save selected menu truth.', 500)
  return { draft: data, menu_item: item, pricing }
}

async function sourceParts(files: TempFileRow[]) {
  const result: Array<{ label: string; sourceImage: string; sourceMime: string }> = []
  for (const [index, file] of files.entries()) {
    if (file.file_kind !== 'raw_reference') continue
    const { data, error } = await clientBrainV2ServerClient.storage.from(file.storage_bucket).download(file.storage_path)
    if (error || !data) throw new ClientBrainV2HttpError(`Unable to read staged image ${file.file_name}.`, 500)
    result.push({ label: `[SOURCE ${index + 1}] Reference image for the same product`, sourceImage: Buffer.from(await data.arrayBuffer()).toString('base64'), sourceMime: data.type || file.file_type })
  }
  return result
}

function parseProviderImage(response: GeminiResponse) {
  const parts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
  const inline = parts.map(part => part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined)).find(part => part?.data)
  return { mimeType: inline?.mimeType ?? 'image/png', image: inline?.data ?? null, text: parts.map(part => part.text).filter(Boolean).join('\n') }
}

export async function generateAssetIngestionStudioReference(clientId: string, input: unknown) {
  const value = input as Record<string, unknown>
  const draft = await loadDraft(clientId, text(value.draft_id, 'Ingestion draft', 80))
  if (!productCategory(draft.asset_category)) throw new ClientBrainV2HttpError('Only Food and Drink Assets generate a studio truth reference.', 400)
  const item = draft.menu_item_id && draft.menu_record_id
    ? await currentMenuItem(clientId, draft.menu_item_id, draft.menu_record_id)
    : null
  const files = await loadDraftFiles(clientId, draft.id)
  const sources = await sourceParts(files)
  if (!sources.length) throw new ClientBrainV2HttpError('No staged raw product reference is available.', 400)
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { blocked: true, provider: PROVIDER, model: MODEL, error: 'Studio generation is unavailable because no configured image provider is available.' }

  const correction = optionalText(value.correction, 500)
  const prompt = [
    studioPrompt(draft.asset_category, item?.canonical_name ?? optionalText(draft.display_name, 300), sources.length, draft.metadata, optionalText(draft.metadata.visual_presentation, 700)),
    correction ? `[REVIEW CORRECTION] ${correction}` : '',
  ].filter(Boolean).join('\n')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            ...sources.flatMap(source => [
              { text: source.label },
              { inlineData: { mimeType: source.sourceMime, data: source.sourceImage } },
            ]),
          ],
        }],
        generationConfig: { candidateCount: 1, responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '4K' } },
      }),
    })
    const providerResponse = await response.json().catch(() => ({})) as GeminiResponse
    const elapsed = Date.now() - startedAt
    if (!response.ok || providerResponse.error) {
      const execution = { provider: PROVIDER, model: MODEL, status: 'blocked', http_status: response.status, error: providerResponse.error?.message ?? `Provider returned ${response.status}`, attempted_at: new Date().toISOString(), latency_ms: elapsed, prompt_length: prompt.length }
      await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_drafts').update({ execution }).eq('id', draft.id).eq('client_id', clientId)
      return { blocked: true, provider: PROVIDER, model: MODEL, error: 'Studio generation is currently blocked by the configured provider. No final Asset was created.', execution }
    }
    const parsed = parseProviderImage(providerResponse)
    if (!parsed.image) return { blocked: true, provider: PROVIDER, model: MODEL, error: parsed.text || 'The configured provider did not return an image.' }
    const buffer = Buffer.from(parsed.image, 'base64')
    const mimeType = parsed.mimeType.startsWith('image/') ? parsed.mimeType : 'image/png'
    const path = `${clientId}/${TEMP_PREFIX}/${draft.id}/generated/${randomUUID()}.${extensionForMime(mimeType)}`
    const { error: uploadError } = await clientBrainV2ServerClient.storage.from(BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false })
    if (uploadError) throw new ClientBrainV2HttpError('Studio output was generated but could not be staged for review.', 500)
    const dimensions = await sharp(buffer).metadata().catch(() => ({ width: null, height: null }))
    const { data: generated, error: tempError } = await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_temp_files').insert({
      client_id: clientId, draft_id: draft.id, storage_bucket: BUCKET, storage_path: path, file_name: `${safeName(item?.canonical_name ?? draft.display_name ?? draft.asset_category)}-studio-truth.${extensionForMime(mimeType)}`,
      file_type: mimeType, file_size_bytes: buffer.length, width: dimensions.width ?? null, height: dimensions.height ?? null, sort_order: 99, file_kind: 'generated_preview',
    }).select('*').single()
    if (tempError || !generated) throw new ClientBrainV2HttpError('Generated studio output was not registered for review.', 500)
    const execution = { provider: PROVIDER, model: MODEL, status: 'completed', attempted_at: new Date().toISOString(), latency_ms: elapsed, prompt_length: prompt.length, reference_count: sources.length, usage_metadata: providerResponse.usageMetadata ?? null, cost_usd: null }
    const { data: updated, error: updateError } = await clientBrainV2ServerClient
      .from('client_brain_v2_asset_ingestion_drafts')
      .update({ state: 'ready_for_review', execution, generated_output: { temp_file_id: generated.id, storage_path: path, mime_type: mimeType } })
      .eq('id', draft.id).eq('client_id', clientId).select('*').single()
    if (updateError || !updated) throw new ClientBrainV2HttpError('Generated studio output is recoverable, but the review state could not be saved.', 500)
    let visualAnalysis: IngestionVisualAnalysis
    let reviewDraft = updated as DraftRow
    try {
      const result = await analyseAssetIngestionProduct(clientId, { draft_id: draft.id })
      visualAnalysis = result.analysis
      reviewDraft = result.draft ?? reviewDraft
    } catch (error) {
      visualAnalysis = {
        status: 'failed',
        source: 'generated_studio_truth',
        attempted_at: new Date().toISOString(),
        warning: visualAnalysisFailure(error),
      }
      try {
        reviewDraft = await saveVisualAnalysisState(reviewDraft, visualAnalysis)
      } catch {
        // Keep the generated truth reference reviewable even if diagnostic persistence fails.
      }
    }
    return {
      blocked: false,
      provider: PROVIDER,
      model: MODEL,
      prompt,
      execution,
      draft: reviewDraft,
      visual_analysis: visualAnalysis,
      generated: { id: generated.id, signed_url: await signedUrl(path), mime_type: mimeType },
    }
  } finally { clearTimeout(timeout) }
}

export async function analyseAssetIngestionVenue(clientId: string, input: unknown) {
  const value = input as Record<string, unknown>
  const draft = await loadDraft(clientId, text(value.draft_id, 'Ingestion draft', 80))
  if (draft.asset_category !== 'interiors' && draft.asset_category !== 'exteriors') throw new ClientBrainV2HttpError('Only Interior and Exterior Assets use venue visual analysis.', 400)
  const files = await loadDraftFiles(clientId, draft.id)
  const source = files.find(file => file.file_kind === 'original_venue')
  if (!source) throw new ClientBrainV2HttpError('No staged venue image is available.', 400)
  let analysis: Awaited<ReturnType<typeof analyseVenueVisualTruth>>
  try {
    analysis = await analyseVenueVisualTruth({ clientId, signedImageUrl: await signedUrl(source.storage_path), fileType: source.file_type, category: draft.asset_category })
  } catch (error) {
    const warning = visualAnalysisFailure(error)
    const visualAnalysis: IngestionVisualAnalysis = { status: 'failed', source: 'staged_venue_truth', attempted_at: new Date().toISOString(), warning }
    return { draft: await saveVisualAnalysisState(draft, visualAnalysis), proposal: null, warning, analysis: visualAnalysis }
  }
  if (!analysis.truth) {
    const warning = analysis.warning ?? 'Venue visual analysis could not propose metadata.'
    const visualAnalysis: IngestionVisualAnalysis = { status: 'failed', source: 'staged_venue_truth', attempted_at: new Date().toISOString(), warning }
    return { draft: await saveVisualAnalysisState(draft, visualAnalysis), proposal: null, warning, analysis: visualAnalysis }
  }
  const provenance = fieldProvenance(draft)
  const analysedAt = new Date().toISOString()
  for (const field of ['key_visual_details', 'visual_presentation', 'perspective_flexibility']) {
    provenance[field] = { channel: 'vision_analysis', model: 'claude-haiku-4-5', suggested_at: analysedAt }
  }
  const visualAnalysis: IngestionVisualAnalysis = {
    status: 'completed',
    source: 'staged_venue_truth',
    attempted_at: analysedAt,
    ...(analysis.trackedCostUsd != null ? { cost_usd: analysis.trackedCostUsd } : {}),
  }
  const nextDraft = await saveVisualAnalysisState(draft, visualAnalysis, {
    ...draft.metadata,
    ...analysis.truth,
    venue_analysis_proposal: analysis.truth,
    field_provenance: provenance,
  })
  return { draft: nextDraft, proposal: analysis.truth, warning: analysis.warning, cost_usd: analysis.trackedCostUsd ?? null, analysis: visualAnalysis }
}

export async function analyseAssetIngestionProduct(clientId: string, input: unknown) {
  const value = input as Record<string, unknown>
  const draft = await loadDraft(clientId, text(value.draft_id, 'Ingestion draft', 80))
  if (!productCategory(draft.asset_category)) throw new ClientBrainV2HttpError('Only Food and Drink Assets use product visual analysis.', 400)
  const item = draft.menu_item_id && draft.menu_record_id
    ? await currentMenuItem(clientId, draft.menu_item_id, draft.menu_record_id)
    : null
  const files = await loadDraftFiles(clientId, draft.id)
  const generated = files.find(file => file.file_kind === 'generated_preview')
  if (!generated) throw new ClientBrainV2HttpError('Generate a studio truth reference before visual analysis.', 400)
  let analysis: Awaited<ReturnType<typeof analyseAssetVisualTruth>>
  try {
    analysis = await analyseAssetVisualTruth({
      clientId, signedImageUrl: await signedUrl(generated.storage_path), fileType: generated.file_type,
      category: draft.asset_category,
      canonicalName: item?.canonical_name,
      menuTruth: item ? {
        menuSection: item.menu_section, listedIngredients: item.listed_ingredients,
        dietaryMarkers: item.dietary_markers,
        alcoholStatus: draft.asset_category === 'drinks' ? String(draft.metadata.alcohol_status ?? '') || undefined : undefined,
      } : undefined,
      usageContext: { route: '/api/clients/[id]/brain-v2/asset-ingestion', feature: 'restaurant_asset_visual_truth_ingestion' },
    })
  } catch (error) {
    const warning = visualAnalysisFailure(error)
    const visualAnalysis: IngestionVisualAnalysis = { status: 'failed', source: 'generated_studio_truth', attempted_at: new Date().toISOString(), warning }
    return { draft: await saveVisualAnalysisState(draft, visualAnalysis), proposal: null, warning, analysis: visualAnalysis }
  }
  if (!analysis.truth.visual_presentation) {
    const warning = analysis.warning ?? 'Product visual analysis did not return a concise presentation proposal.'
    const visualAnalysis: IngestionVisualAnalysis = { status: 'failed', source: 'generated_studio_truth', attempted_at: new Date().toISOString(), warning }
    return { draft: await saveVisualAnalysisState(draft, visualAnalysis), proposal: null, warning, analysis: visualAnalysis }
  }
  const provenance = fieldProvenance(draft, item ?? undefined)
  const analysedAt = new Date().toISOString()
  provenance.visual_presentation = { channel: 'vision_analysis', model: 'claude-haiku-4-5', reviewed_source: 'generated_studio_truth', suggested_at: analysedAt }
  const visualAnalysis: IngestionVisualAnalysis = {
    status: 'completed',
    source: 'generated_studio_truth',
    attempted_at: analysedAt,
    ...(analysis.trackedCostUsd != null ? { cost_usd: analysis.trackedCostUsd } : {}),
  }
  const nextDraft = await saveVisualAnalysisState(draft, visualAnalysis, {
    ...draft.metadata,
    visual_presentation: analysis.truth.visual_presentation,
    field_provenance: provenance,
    reference_observation: analysis.truth.reference_observation ?? null,
  })
  return { draft: nextDraft, proposal: analysis.truth, warning: analysis.warning, cost_usd: analysis.trackedCostUsd ?? null, analysis: visualAnalysis }
}

function finalizableMetadataBase(draft: DraftRow) {
  const { submitted_name: _submittedName, menu_item_name: _menuItemName, menu_match_type: _menuMatchType, venue_analysis_proposal: _venueProposal, ...base } = draft.metadata
  return base
}

function venueMetadata(draft: DraftRow, input: Record<string, unknown>) {
  const flexibility = String(input.perspective_flexibility ?? 'low').toLowerCase()
  if (!['low', 'medium', 'high'].includes(flexibility)) throw new ClientBrainV2HttpError('Perspective flexibility must be Low, Medium, or High.', 400)
  return {
    ...finalizableMetadataBase(draft),
    key_visual_details: stringList(input.key_visual_details, 12, 200),
    visual_presentation: optionalText(input.visual_presentation, 900),
    perspective_flexibility: flexibility,
    approved_for_generation: requestedApproval(input),
    review_state: requestedApproval(input) ? 'approved' : 'needs_review',
  }
}

function productMetadata(draft: DraftRow, input: Record<string, unknown>) {
  const base = finalizableMetadataBase(draft)
  const visual = optionalText(input.visual_presentation, 900)
  const alcoholStatus = optionalText(input.alcohol_status, 32) || (draft.asset_category === 'drinks' ? 'unknown' : '')
  if (draft.asset_category === 'drinks' && alcoholStatus && !['alcoholic', 'non_alcoholic', 'unknown'].includes(alcoholStatus)) {
    throw new ClientBrainV2HttpError('Alcohol status must be Alcoholic, Non-alcoholic, or Unknown.', 400)
  }
  return {
    ...base,
    ...(visual ? { visual_presentation: visual } : {}),
    ...(draft.asset_category === 'drinks' && alcoholStatus ? { alcohol_status: alcoholStatus } : {}),
    approved_for_generation: requestedApproval(input),
    review_state: requestedApproval(input) ? 'approved' : 'needs_review',
  }
}

function optionalBoolean(value: unknown, label: string) {
  if (value == null) return null
  if (typeof value !== 'boolean') throw new ClientBrainV2HttpError(`${label} must be true or false.`, 400)
  return value
}

function staffMetadata(draft: DraftRow, input: Record<string, unknown>) {
  const active = optionalBoolean(input.staff_active, 'Active Staff Member')
  const approval = optionalBoolean(input.approved_for_generation, 'Approved for Generation')
  const staffName = optionalText(input.staff_name, 200)
  const staffPosition = optionalText(input.staff_position, 200)
  const staffDepartment = optionalText(input.staff_department, 200)
  const identityNotes = optionalText(input.identity_notes, 1200)
  return {
    ...finalizableMetadataBase(draft),
    ...(staffName ? { staff_name: staffName } : {}),
    ...(staffPosition ? { staff_position: staffPosition } : {}),
    ...(staffDepartment ? { staff_department: staffDepartment } : {}),
    ...(active !== null ? { staff_active: active } : {}),
    ...(identityNotes ? { identity_notes: identityNotes } : {}),
    ...(approval !== null ? { approved_for_generation: approval } : {}),
  }
}

function requestedApproval(input: Record<string, unknown>) {
  if (input.approved_for_generation == null) return false
  if (typeof input.approved_for_generation !== 'boolean') throw new ClientBrainV2HttpError('Approved for Generation must be true or false.', 400)
  return input.approved_for_generation
}

function finalAssetTitle(draft: DraftRow, input: Record<string, unknown>, fallbackFileName = '') {
  const requested = optionalText(input.title, 300) || optionalText(draft.display_name, 300)
  if (requested) return requested
  if (draft.asset_category === 'food') return 'Unidentified food reference'
  if (draft.asset_category === 'drinks') return 'Unidentified drink reference'
  if (draft.asset_category === 'staff') {
    const fileName = optionalText(fallbackFileName, 300)
    if (fileName) return fileName
    throw new ClientBrainV2HttpError('A Staff Asset needs one source image.', 400)
  }
  throw new ClientBrainV2HttpError('Asset name is invalid.', 400)
}

async function copyToPermanent(clientId: string, source: TempFileRow, title: string) {
  const { data, error } = await clientBrainV2ServerClient.storage.from(source.storage_bucket).download(source.storage_path)
  if (error || !data) throw new ClientBrainV2HttpError('The reviewed source file is no longer available. It was kept in staging and can be retried after resolving storage access.', 500)
  const buffer = Buffer.from(await data.arrayBuffer())
  const path = `${clientId}/client-brain-v2/assets/${randomUUID()}_${safeName(title)}.${extensionForMime(source.file_type)}`
  const { error: uploadError } = await clientBrainV2ServerClient.storage.from(BUCKET).upload(path, buffer, { contentType: source.file_type, upsert: false })
  if (uploadError) throw new ClientBrainV2HttpError('Unable to preserve the final Asset file.', 500)
  const meta = await sharp(buffer, { limitInputPixels: false }).metadata().catch(() => ({ width: null, height: null }))
  return { path, buffer, metadata: { width: meta.width ?? null, height: meta.height ?? null, ingested_from: source.id } }
}

async function cleanupDraftFiles(clientId: string, draftId: string) {
  const files = await loadDraftFiles(clientId, draftId)
  const grouped = new Map<string, string[]>()
  for (const file of files) grouped.set(file.storage_bucket, [...(grouped.get(file.storage_bucket) ?? []), file.storage_path])
  for (const [bucket, paths] of grouped) {
    const { error } = await clientBrainV2ServerClient.storage.from(bucket).remove(paths)
    if (error) {
      await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_drafts').update({ state: 'cleanup_pending', cleanup_attempts: files.length, cleanup_error: error.message }).eq('id', draftId).eq('client_id', clientId)
      return { cleaned: false, error: error.message }
    }
  }
  await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_temp_files').delete().eq('client_id', clientId).eq('draft_id', draftId)
  return { cleaned: true }
}

export async function finalizeAssetIngestion(clientId: string, input: unknown) {
  const value = input as Record<string, unknown>
  const draft = await loadDraft(clientId, text(value.draft_id, 'Ingestion draft', 80))
  const files = await loadDraftFiles(clientId, draft.id)
  const title = finalAssetTitle(draft, value, staffCategory(draft.asset_category) ? files.find(file => file.file_kind === 'original_venue')?.file_name : '')
  if (productCategory(draft.asset_category) && requestedApproval(value) && (!draft.menu_record_id || !draft.menu_item_id)) {
    throw new ClientBrainV2HttpError('Select an official menu item before approving a Food or Drink Asset for generation.', 400)
  }
  const metadata = productCategory(draft.asset_category)
    ? productMetadata(draft, value)
    : staffCategory(draft.asset_category)
      ? staffMetadata(draft, value)
    : draft.asset_category === 'venue_items'
      ? { item_name: title, item_type: optionalText(value.item_type, 180), description: optionalText(value.visual_presentation, 900), approved_for_generation: requestedApproval(value), review_state: requestedApproval(value) ? 'approved' : 'needs_review' }
      : venueMetadata(draft, value)
  if (requestedApproval(value) && !hasMeaningfulRestaurantAssetMetadata(draft.asset_category, metadata, draft.menu_record_id ? [draft.menu_record_id] : [])) {
    throw new ClientBrainV2HttpError('Add meaningful category metadata before approving this reference for generation.', 400)
  }
  const source = productCategory(draft.asset_category)
    ? files.find(file => file.id === String(draft.generated_output.temp_file_id ?? ''))
    : files.find(file => file.file_kind === 'original_venue')
  if (!source) throw new ClientBrainV2HttpError(productCategory(draft.asset_category) ? 'Generate a studio truth reference before finalizing this Product Asset.' : 'The original venue truth reference is no longer available.', 400)
  const finalFiles = staffCategory(draft.asset_category)
    ? await Promise.all(files.filter(file => file.file_kind === 'original_venue').map((file, index) => copyToPermanent(clientId, file, `${title}-reference-${index + 1}`)))
    : [await copyToPermanent(clientId, source, title)]
  const finalFile = finalFiles[0]
  const rpcName = staffCategory(draft.asset_category) ? 'finalize_client_brain_v2_staff_ingestion' : 'finalize_client_brain_v2_asset_ingestion'
  const rpcArguments = staffCategory(draft.asset_category) ? {
    p_client_id: clientId,
    p_draft_id: draft.id,
    p_title: title,
    p_metadata: metadata,
    p_files: finalFiles.map((file, index) => ({
      storage_bucket: BUCKET,
      storage_path: file.path,
      file_name: `${title} - Reference ${index + 1}.${extensionForMime(files[index]?.file_type ?? source.file_type)}`,
      file_type: files[index]?.file_type ?? source.file_type,
      file_size_bytes: file.buffer.length,
      metadata: file.metadata,
    })),
  } : {
    p_client_id: clientId,
    p_draft_id: draft.id,
    p_title: title,
    p_metadata: metadata,
    p_output_bucket: BUCKET,
    p_output_path: finalFile.path,
    p_output_file_name: `${title}.${extensionForMime(source.file_type)}`,
    p_output_file_type: source.file_type,
    p_output_file_size_bytes: finalFile.buffer.length,
    p_output_file_metadata: finalFile.metadata,
  }
  const { data: rpcData, error } = await clientBrainV2ServerClient.rpc(rpcName, rpcArguments)
  if (error) {
    await clientBrainV2ServerClient.storage.from(BUCKET).remove(finalFiles.map(file => file.path))
    throw new ClientBrainV2HttpError(error.message || 'Final Asset record could not be created. Your temporary source files remain recoverable.', error.code === 'PT409' ? 409 : 500)
  }
  const cleanup = await cleanupDraftFiles(clientId, draft.id)
  return { asset_id: (rpcData as Record<string, unknown>)?.asset_id ?? null, cleanup }
}

export async function cancelAssetIngestion(clientId: string, draftId: string) {
  const draft = await loadDraft(clientId, draftId)
  if (draft.final_asset_id) throw new ClientBrainV2HttpError('A finalized Asset cannot be cancelled from ingestion.', 409)
  const cleanup = await cleanupDraftFiles(clientId, draft.id)
  if (!cleanup.cleaned) return { cancelled: false, cleanup }
  const { error } = await clientBrainV2ServerClient.from('client_brain_v2_asset_ingestion_drafts').update({ state: 'cancelled' }).eq('id', draft.id).eq('client_id', clientId)
  if (error) throw new ClientBrainV2HttpError('Temporary files were removed, but the cancelled ingestion state could not be recorded.', 500)
  return { cancelled: true, cleanup }
}
