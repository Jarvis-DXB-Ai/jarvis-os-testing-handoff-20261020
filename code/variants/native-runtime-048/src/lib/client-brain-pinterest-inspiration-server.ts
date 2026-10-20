import 'server-only'

import { createHash, randomUUID } from 'crypto'
import { extname } from 'path'
import {
  diversePinterestInspirations,
  PINTEREST_INSPIRATION_ANALYSIS_STATES,
  isPinterestInspirationAnalysisComplete,
  isPinterestInspirationStatus,
  normalizePinterestBestFor,
  normalizePinterestTags,
  pinterestInspirationAnalysisCompletenessError,
  type PinterestInspirationRecord,
  type PinterestInspirationRetrievalInput,
  type PinterestInspirationStatus,
  type PinterestInspirationTechnique,
} from '@/lib/client-brain-pinterest-inspiration'
import { analysePinterestInspiration, pinterestInspirationVisionProviderStatus, type PinterestInspirationAnalysis } from '@/lib/client-brain-pinterest-inspiration-analysis'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import { VISUAL_DIRECTION_CAMERA_ANGLES, VISUAL_DIRECTION_COMPOSITIONS, VISUAL_DIRECTION_HUMAN_PRESENCE, VISUAL_DIRECTION_INTERACTIONS, VISUAL_DIRECTION_MOTIONS, VISUAL_DIRECTION_SHOT_SCALES } from '@/lib/social-monthly-visual-direction-types'

const BUCKET = 'client-assets'
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_UPLOAD_FILES = 100
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const ANALYSIS_BATCH_CAP = 6

type RawInspiration = Omit<PinterestInspirationRecord, 'file'> & {
  client_brain_file_objects: { id: string; file_name: string; file_type: string | null; file_size_bytes: number | null; storage_bucket: string; storage_path: string } | null
}

function cleanText(value: unknown, max: number, label: string, required = false) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  if (text.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return text || null
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'pinterest-inspiration'
}

function imageFile(file: File) {
  return file.type.startsWith('image/') && IMAGE_EXTENSIONS.has(extname(file.name).toLowerCase())
}

function values(value: unknown, max = 12) {
  return normalizePinterestTags(value, max)
}

function enumOrNull(value: unknown, allowed: readonly string[]) {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

function analysisError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Pinterest analysis failed.'
  return message.replace(/\s+/g, ' ').trim().slice(0, 1_000) || 'Pinterest analysis failed.'
}

/**
 * The only boundary allowed to turn provider output into persisted inspiration state.
 * Unknown provider fields are deliberately ignored here.
 */
export function pinterestInspirationAnalysisPersistencePayload(
  analysis: PinterestInspirationAnalysis,
  metadata: { provider: string; model: string; analyzedAt: string; provenance?: Record<string, unknown> },
) {
  const completenessError = pinterestInspirationAnalysisCompletenessError(analysis)
  if (completenessError) throw new Error(completenessError)
  return {
    creative_categories: analysis.creative_categories,
    shot_scale: analysis.shot_scale,
    camera_angle: analysis.camera_angle,
    composition: analysis.composition,
    human_presence: analysis.human_presence,
    interaction: analysis.interaction,
    motion: analysis.motion,
    lighting_style: analysis.lighting_style,
    background_style: analysis.background_style,
    creative_techniques: analysis.creative_techniques,
    visual_summary: analysis.visual_summary,
    best_for: analysis.best_for,
    requires_individual_pin_upload: analysis.requires_individual_pin_upload,
    analysis_state: 'analyzed' as const,
    analysis_provider: metadata.provider,
    analysis_model: metadata.model,
    analyzed_at: metadata.analyzedAt,
    analysis_error: null,
    provenance: {
      ...(metadata.provenance ?? {}),
      analysis_authored_by: 'provider',
      analysis_scope: 'creative_technique_only',
    },
  }
}

export function pinterestInspirationAnalysisFailurePayload(error: unknown) {
  return { analysis_state: 'failed' as const, analysis_error: analysisError(error) }
}

function recordFromRow(row: RawInspiration, signedUrl: string | null): PinterestInspirationRecord {
  const file = row.client_brain_file_objects
  return {
    ...row,
    file: { id: file?.id ?? row.file_object_id, file_name: file?.file_name ?? 'Inspiration image', file_type: file?.file_type ?? null, file_size_bytes: file?.file_size_bytes ?? null, signed_url: signedUrl },
  }
}

async function signedUrl(file: RawInspiration['client_brain_file_objects']) {
  if (!file) return null
  const { data, error } = await clientBrainV2ServerClient.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 60 * 60)
  return error ? null : data.signedUrl
}

export type PinterestInspirationFilters = { search?: string; status?: string; analysisState?: string; category?: string; shotScale?: string; cameraAngle?: string; composition?: string; humanPresence?: string; interaction?: string; technique?: string; lighting?: string }

export async function listPinterestInspirations(clientId: string, filters: PinterestInspirationFilters = {}) {
  await requireClientBrainV2(clientId)
  let query = clientBrainV2ServerClient
    .from('client_brain_pinterest_inspirations')
    .select('*, client_brain_file_objects!inner(id,file_name,file_type,file_size_bytes,storage_bucket,storage_path)')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  if (isPinterestInspirationStatus(filters.status)) query = query.eq('status', filters.status)
  if (filters.analysisState && PINTEREST_INSPIRATION_ANALYSIS_STATES.includes(filters.analysisState as typeof PINTEREST_INSPIRATION_ANALYSIS_STATES[number])) query = query.eq('analysis_state', filters.analysisState)
  if (filters.category) query = query.contains('creative_categories', [filters.category])
  if (filters.shotScale) query = query.eq('shot_scale', filters.shotScale)
  if (filters.cameraAngle) query = query.eq('camera_angle', filters.cameraAngle)
  if (filters.composition) query = query.eq('composition', filters.composition)
  if (filters.humanPresence) query = query.eq('human_presence', filters.humanPresence)
  if (filters.interaction) query = query.eq('interaction', filters.interaction)
  if (filters.lighting) query = query.eq('lighting_style', filters.lighting)
  if (filters.technique) query = query.contains('creative_techniques', [filters.technique])
  const { data, error } = await query
  if (error) throw new ClientBrainV2HttpError('Unable to load Pinterest Inspiration.', 500)
  const search = filters.search?.trim().toLowerCase()
  const rows = ((data ?? []) as RawInspiration[]).filter(row => !search || [
    row.title, row.visual_summary ?? '', row.notes ?? '', ...row.creative_techniques, ...row.best_for,
  ].join(' ').toLowerCase().includes(search))
  const inspirations = await Promise.all(rows.map(async row => recordFromRow(row, await signedUrl(row.client_brain_file_objects))))
  const counts = inspirations.reduce<Record<PinterestInspirationStatus, number>>((result, item) => ({ ...result, [item.status]: result[item.status] + 1 }), { active: 0, needs_review: 0, disabled: 0 })
  return { inspirations, counts, provider: pinterestInspirationVisionProviderStatus() }
}

export async function uploadPinterestInspirations(clientId: string, formData: FormData) {
  await requireClientBrainV2(clientId)
  const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0)
  if (!files.length) throw new ClientBrainV2HttpError('Choose one or more inspiration images.', 400)
  if (files.length > MAX_UPLOAD_FILES) throw new ClientBrainV2HttpError(`Upload up to ${MAX_UPLOAD_FILES} images at a time.`, 400)
  const sourceUrl = cleanText(formData.get('source_url'), 1_500, 'Source URL')
  const sourceBoard = cleanText(formData.get('source_board'), 240, 'Source board')
  const originalSourceNote = cleanText(formData.get('original_source_note'), 1_000, 'Original source note')
  const uploaded: Array<{ id: string; title: string; reused_file_object: boolean }> = []
  let analysisPending = 0
  for (const file of files) {
    if (!imageFile(file)) throw new ClientBrainV2HttpError('Pinterest Inspiration accepts JPEG, PNG, or WEBP images only.', 400)
    if (file.size > MAX_FILE_BYTES) throw new ClientBrainV2HttpError('Each inspiration image must be 16 MB or smaller.', 400)
    const buffer = Buffer.from(await file.arrayBuffer())
    const checksum = createHash('sha256').update(buffer).digest('hex')
    const { data: matches, error: matchError } = await clientBrainV2ServerClient
      .from('client_brain_file_objects').select('id').filter('metadata->>sha256', 'eq', checksum).limit(1)
    if (matchError) throw new ClientBrainV2HttpError('Unable to verify duplicate inspiration files.', 500)
    let fileObjectId = matches?.[0]?.id as string | undefined
    let reused = Boolean(fileObjectId)
    if (!fileObjectId) {
      const path = `${clientId}/client-brain-v2/pinterest-inspiration/${randomUUID()}_${safeName(file.name)}`
      const { error: storageError } = await clientBrainV2ServerClient.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
      if (storageError) throw new ClientBrainV2HttpError('Unable to store inspiration image.', 500)
      const { data: fileObject, error: fileError } = await clientBrainV2ServerClient
        .from('client_brain_file_objects')
        .insert({ storage_bucket: BUCKET, storage_path: path, file_name: file.name, file_type: file.type || null, file_size_bytes: buffer.length, metadata: { uploaded_via: 'pinterest_inspiration_v1', sha256: checksum } })
        .select('id').single()
      if (fileError || !fileObject) {
        await clientBrainV2ServerClient.storage.from(BUCKET).remove([path])
        throw new ClientBrainV2HttpError('Unable to register inspiration image.', 500)
      }
      fileObjectId = fileObject.id
      reused = false
    }
    const { data: existing } = await clientBrainV2ServerClient
      .from('client_brain_pinterest_inspirations').select('id,title').eq('client_id', clientId).eq('file_object_id', fileObjectId).maybeSingle()
    if (existing) { uploaded.push({ id: existing.id, title: existing.title, reused_file_object: true }); continue }
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 240) || 'Pinterest inspiration'
    const { data: created, error: createError } = await clientBrainV2ServerClient
      .from('client_brain_pinterest_inspirations')
      .insert({ client_id: clientId, file_object_id: fileObjectId, title, source_type: 'pinterest', source_url: sourceUrl, source_board: sourceBoard, original_source_note: originalSourceNote, status: 'needs_review', analysis_state: 'pending', provenance: { uploaded_by_user: true, uploaded_via: 'pinterest_inspiration_v1', source_url_supplied: Boolean(sourceUrl) } })
      .select('id,title').single()
    if (createError || !created) throw new ClientBrainV2HttpError('Unable to create Pinterest Inspiration record.', 500)
    uploaded.push({ id: created.id, title: created.title, reused_file_object: reused })
    analysisPending += 1
  }
  return { uploaded, analysis_pending: analysisPending }
}

export async function savePinterestInspiration(clientId: string, inspirationId: string, body: Record<string, unknown>) {
  await requireClientBrainV2(clientId)
  if (!isUuid(inspirationId)) throw new ClientBrainV2HttpError('Pinterest Inspiration not found.', 404)
  const expectedUpdatedAt = cleanText(body.expected_updated_at, 64, 'Update baseline', true)
  const fields = {
    title: cleanText(body.title, 240, 'Title', true),
    source_type: body.source_type === 'manual_external' ? 'manual_external' : 'pinterest',
    source_url: cleanText(body.source_url, 1_500, 'Source URL'),
    source_board: cleanText(body.source_board, 240, 'Source board'),
    external_source_id: cleanText(body.external_source_id, 240, 'External source ID'),
    original_source_note: cleanText(body.original_source_note, 1_000, 'Original source note'),
    status: isPinterestInspirationStatus(body.status) ? body.status : 'needs_review',
    creative_categories: values(body.creative_categories, 3),
    shot_scale: enumOrNull(body.shot_scale, VISUAL_DIRECTION_SHOT_SCALES),
    camera_angle: enumOrNull(body.camera_angle, VISUAL_DIRECTION_CAMERA_ANGLES),
    composition: enumOrNull(body.composition, VISUAL_DIRECTION_COMPOSITIONS),
    human_presence: enumOrNull(body.human_presence, VISUAL_DIRECTION_HUMAN_PRESENCE),
    interaction: enumOrNull(body.interaction, VISUAL_DIRECTION_INTERACTIONS),
    motion: enumOrNull(body.motion, VISUAL_DIRECTION_MOTIONS),
    lighting_style: enumOrNull(body.lighting_style, ['soft_natural', 'hard_directional', 'golden_hour', 'warm_ambient', 'flash_editorial', 'high_key', 'low_key', 'backlit', 'mixed_practical', 'studio', 'other']),
    background_style: enumOrNull(body.background_style, ['clean_minimal', 'bold_colour', 'venue_context', 'table_context', 'environmental', 'dark_moody', 'bright_airy', 'textured', 'abstract', 'other']),
    creative_techniques: values(body.creative_techniques),
    visual_summary: cleanText(body.visual_summary, 700, 'Visual summary'),
    best_for: normalizePinterestBestFor(body.best_for, 6, true),
    notes: cleanText(body.notes, 2_000, 'Notes'),
  }
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_pinterest_inspirations').update({ ...fields, provenance: { manual_edits: true, last_manual_edit_at: new Date().toISOString() } })
    .eq('id', inspirationId).eq('client_id', clientId).eq('updated_at', expectedUpdatedAt).select('id,updated_at').maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to save Pinterest Inspiration.', 500)
  if (!data) throw new ClientBrainV2HttpError('This inspiration changed after it was opened. Refresh before saving.', 409)
  return data
}

export async function bulkUpdatePinterestInspirationStatus(clientId: string, ids: unknown, status: unknown) {
  await requireClientBrainV2(clientId)
  const recordIds = Array.isArray(ids) ? [...new Set(ids.filter(isUuid))].slice(0, 100) : []
  if (!recordIds.length || !isPinterestInspirationStatus(status)) throw new ClientBrainV2HttpError('Select inspiration records and a valid status.', 400)
  const { error } = await clientBrainV2ServerClient.from('client_brain_pinterest_inspirations').update({ status }).eq('client_id', clientId).in('id', recordIds)
  if (error) throw new ClientBrainV2HttpError('Unable to update Pinterest Inspiration status.', 500)
  return { updated: recordIds.length, status }
}

export async function deletePinterestInspiration(clientId: string, inspirationId: string, expectedUpdatedAt: unknown) {
  await requireClientBrainV2(clientId)
  if (!isUuid(inspirationId)) throw new ClientBrainV2HttpError('Pinterest Inspiration not found.', 404)
  const baseline = cleanText(expectedUpdatedAt, 64, 'Delete baseline', true)
  const { data, error } = await clientBrainV2ServerClient.rpc('delete_client_brain_pinterest_inspiration', { p_client_id: clientId, p_inspiration_id: inspirationId, p_expected_updated_at: baseline })
  if (error) throw new ClientBrainV2HttpError(error.message || 'Unable to delete Pinterest Inspiration.', error.code === 'PT409' ? 409 : 500)
  const storage = (data as { storage_objects_to_delete?: Array<{ bucket: string; storage_path: string }> } | null)?.storage_objects_to_delete ?? []
  for (const item of storage) await clientBrainV2ServerClient.storage.from(item.bucket).remove([item.storage_path])
  return data
}

export async function analysePinterestInspirationBatch(clientId: string, ids: unknown, requestedState: unknown) {
  await requireClientBrainV2(clientId)
  const inspirationIds = Array.isArray(ids) ? [...new Set(ids.filter(isUuid))] : []
  if (!inspirationIds.length) throw new ClientBrainV2HttpError('Select up to six inspiration records to analyse.', 400)
  if (inspirationIds.length > ANALYSIS_BATCH_CAP) throw new ClientBrainV2HttpError(`Analysis can process up to ${ANALYSIS_BATCH_CAP} inspiration records at a time.`, 400)
  const analysisState = requestedState === 'failed' ? 'failed' : requestedState === 'pending' ? 'pending' : null
  if (!analysisState) throw new ClientBrainV2HttpError('Choose pending analysis or failed-analysis retry explicitly.', 400)
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_pinterest_inspirations').select('id,file_object_id,provenance,client_brain_file_objects!inner(file_type,storage_bucket,storage_path)').eq('client_id', clientId).eq('analysis_state', analysisState).in('id', inspirationIds)
  if (error) throw new ClientBrainV2HttpError('Unable to load Pinterest Inspiration analysis inputs.', 500)
  if ((data ?? []).length !== inspirationIds.length) throw new ClientBrainV2HttpError(`Only ${analysisState} Pinterest Inspiration records can be included in this action.`, 409)
  const results = []
  for (const row of data ?? []) {
    const file = row.client_brain_file_objects as unknown as { file_type: string | null; storage_bucket: string; storage_path: string }
    const { data: url } = await clientBrainV2ServerClient.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 60 * 10)
    if (!url?.signedUrl) throw new ClientBrainV2HttpError('Unable to prepare inspiration image for analysis.', 500)
    try {
      const analysis = await analysePinterestInspiration({ clientId, signedUrl: url.signedUrl, fileType: file.file_type })
      const provider = pinterestInspirationVisionProviderStatus()
      const persistencePayload = pinterestInspirationAnalysisPersistencePayload(analysis, {
        provider: provider.provider,
        model: provider.model,
        analyzedAt: new Date().toISOString(),
        provenance: row.provenance as Record<string, unknown> | undefined,
      })
      const { error: updateError } = await clientBrainV2ServerClient.from('client_brain_pinterest_inspirations').update(persistencePayload).eq('id', row.id).eq('client_id', clientId)
      if (updateError) throw updateError
      results.push({ id: row.id, success: true })
    } catch (error) {
      const failurePayload = pinterestInspirationAnalysisFailurePayload(error)
      await clientBrainV2ServerClient.from('client_brain_pinterest_inspirations').update(failurePayload).eq('id', row.id).eq('client_id', clientId)
      results.push({ id: row.id, success: false, error: failurePayload.analysis_error })
    }
  }
  return { provider: pinterestInspirationVisionProviderStatus(), results }
}

export async function retrievePinterestInspirationTechniques(clientId: string, input: PinterestInspirationRetrievalInput): Promise<PinterestInspirationTechnique[]> {
  await requireClientBrainV2(clientId)
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_pinterest_inspirations')
    .select('id,title,creative_categories,shot_scale,camera_angle,composition,human_presence,interaction,motion,lighting_style,background_style,creative_techniques,visual_summary,best_for,requires_individual_pin_upload')
    .eq('client_id', clientId).eq('status', 'active').eq('analysis_state', 'analyzed')
  if (error) throw new ClientBrainV2HttpError('Unable to retrieve Pinterest Inspiration techniques.', 500)
  const complete = ((data ?? []) as Array<PinterestInspirationTechnique & { requires_individual_pin_upload?: boolean }>)
    .filter(isPinterestInspirationAnalysisComplete)
  return diversePinterestInspirations(complete, input)
}
