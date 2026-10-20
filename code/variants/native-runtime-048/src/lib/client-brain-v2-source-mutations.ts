import 'server-only'

import { createHash, randomUUID } from 'crypto'
import { extname } from 'path'
import {
  CLIENT_BRAIN_V2_SOURCE_AUTHORITIES,
  CLIENT_BRAIN_V2_SOURCE_KINDS,
  CLIENT_BRAIN_V2_SOURCE_STATUSES,
  CLIENT_BRAIN_V2_SOURCE_TRUSTS,
  CLIENT_BRAIN_V2_SOURCE_TYPES,
  sourceTrustScore,
  type ClientBrainV2SourceAuthority,
  type ClientBrainV2SourceCreatePayload,
  type ClientBrainV2SourceEditPayload,
  type ClientBrainV2SourceKind,
  type ClientBrainV2SourceStatus,
  type ClientBrainV2SourceTrust,
  type ClientBrainV2SourceType,
} from '@/lib/client-brain-v2-sources'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  loadClientBrainV2,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server'

const BUCKET = 'client-assets'
const MAX_FILE_BYTES = 20 * 1024 * 1024
const SOURCE_FILE_TYPES = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== 'string') {
    if (!required && (value == null || value === '')) return ''
    throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  }
  const result = value.trim()
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  if (required && !result) throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  return result
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string) {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new ClientBrainV2HttpError(`Invalid ${label}.`, 400)
  return value as T
}

function enumList<T extends string>(value: unknown, values: readonly T[], label: string) {
  if (!Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} must be a list.`, 400)
  const unique = [...new Set(value)]
  if (unique.some(item => typeof item !== 'string' || !values.includes(item as T))) throw new ClientBrainV2HttpError(`Invalid ${label}.`, 400)
  return unique as T[]
}

function dateValue(value: unknown, label: string) {
  const date = stringValue(value, label, 10)
  if (!date) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new ClientBrainV2HttpError(`${label} must be a valid date.`, 400)
  return date
}

function normalizeUrl(value: unknown) {
  const raw = stringValue(value, 'Source URL', 2000)
  if (!raw) return ''
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new ClientBrainV2HttpError('Source URL must be a valid web address.', 400) }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new ClientBrainV2HttpError('Source URL must use http or https.', 400)
  parsed.hash = ''
  if (parsed.pathname === '/') parsed.pathname = ''
  return parsed.toString().replace(/\/$/, '')
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source-file'
}

function sourceInput(value: unknown, creating: boolean) {
  const payload = objectValue(value, 'Request') as Partial<ClientBrainV2SourceEditPayload & ClientBrainV2SourceCreatePayload>
  if (payload.section !== 'sources') throw new ClientBrainV2HttpError('Invalid Sources request.', 400)
  const sourceType = enumValue(payload.sourceType, CLIENT_BRAIN_V2_SOURCE_TYPES, 'Source type') as ClientBrainV2SourceType
  const sourceKind = enumValue(payload.sourceKind, CLIENT_BRAIN_V2_SOURCE_KINDS, 'Source kind') as ClientBrainV2SourceKind
  const status = enumValue(payload.status, CLIENT_BRAIN_V2_SOURCE_STATUSES, 'Source status') as ClientBrainV2SourceStatus
  const trust = enumValue(payload.trust, CLIENT_BRAIN_V2_SOURCE_TRUSTS, 'Source trust') as ClientBrainV2SourceTrust
  const authorityScopes = enumList(payload.authorityScopes ?? [], CLIENT_BRAIN_V2_SOURCE_AUTHORITIES, 'Authority scopes') as ClientBrainV2SourceAuthority[]
  const name = stringValue(payload.name, 'Source name', 240, true)
  const lastVerified = dateValue(payload.lastVerified, 'Last verified date')
  const externalUrl = normalizeUrl(payload.externalUrl)
  const notes = stringValue(payload.notes, 'Additional notes', 12000)
  const supersededById = payload.supersededById == null || payload.supersededById === '' ? null : stringValue(payload.supersededById, 'Superseded by Source ID', 40)
  if (supersededById && !isUuid(supersededById)) throw new ClientBrainV2HttpError('Superseded by must be a valid Source.', 400)
  if (sourceKind === 'url' && !externalUrl) throw new ClientBrainV2HttpError('A URL source needs a Source URL.', 400)
  if (sourceKind !== 'url' && externalUrl && sourceKind === 'manual') throw new ClientBrainV2HttpError('Manual sources cannot include a Source URL.', 400)
  if (!creating && (!payload.recordId || !payload.expectedUpdatedAt)) throw new ClientBrainV2HttpError('Source edit baseline is required.', 400)
  return { payload, name, sourceType, sourceKind, status, trust, authorityScopes, lastVerified, externalUrl, notes, supersededById }
}

async function validateSupersession(clientId: string, recordId: string | null, targetId: string | null) {
  if (!targetId) return null
  if (targetId === recordId) throw new ClientBrainV2HttpError('A Source cannot supersede itself.', 400)
  const { data: target, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, superseded_by_id')
    .eq('client_id', clientId).eq('id', targetId).eq('top_section', 'sources').maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to validate Source supersession.', 500)
  if (!target) throw new ClientBrainV2HttpError('Superseded by Source must belong to this client.', 403)
  if (recordId && target.superseded_by_id === recordId) throw new ClientBrainV2HttpError('This would create a circular Source supersession.', 400)
  return target
}

async function assertNoDuplicateUrl(clientId: string, url: string, exceptRecordId: string | null) {
  if (!url) return
  let query = clientBrainV2ServerClient.from('client_brain_v2_records')
    .select('id, title').eq('client_id', clientId).eq('top_section', 'sources').eq('metadata->source_v2->>url', url).limit(1)
  if (exceptRecordId) query = query.neq('id', exceptRecordId)
  const { data, error } = await query
  if (error) throw new ClientBrainV2HttpError('Unable to check duplicate Source URLs.', 500)
  if (data?.[0]) throw new ClientBrainV2HttpError(`This URL is already registered by “${data[0].title}”.`, 409)
}

function recordMetadata(existing: Record<string, unknown>, input: ReturnType<typeof sourceInput>) {
  const current = existing.source_v2 && typeof existing.source_v2 === 'object' && !Array.isArray(existing.source_v2)
    ? existing.source_v2 as Record<string, unknown>
    : {}
  const withoutUrl = Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'url'))
  return {
    ...existing,
    source_v2: {
      ...withoutUrl,
      type: input.sourceType,
      kind: input.sourceKind,
      trust: input.trust,
      authority_scopes: input.authorityScopes,
      ...(input.externalUrl ? { url: input.externalUrl } : {}),
    },
  }
}

export async function saveClientBrainV2Source(clientId: string, input: unknown) {
  await requireClientBrainV2(clientId)
  const parsed = sourceInput(input, false)
  const recordId = stringValue(parsed.payload.recordId, 'Source record ID', 40, true)
  if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Invalid Source record ID.', 400)
  const expectedUpdatedAt = stringValue(parsed.payload.expectedUpdatedAt, 'Edit baseline', 80, true)
  const { data: existing, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, client_id, updated_at, metadata, provenance')
    .eq('client_id', clientId).eq('id', recordId).eq('top_section', 'sources').maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to validate the Source record.', 500)
  if (!existing) throw new ClientBrainV2HttpError('The Source record does not belong to this client.', 403)
  if (expectedUpdatedAt !== existing.updated_at) throw new ClientBrainV2HttpError('This Source changed after editing began. Refresh and review the newer values.', 409)
  const menuDocument = existing.metadata?.menu_document === true
  if (menuDocument && parsed.status !== 'current') {
    const { data: protectedLinks, error: protectedLinksError } = await clientBrainV2ServerClient
      .from('client_brain_v2_links')
      .select('from_record_id')
      .eq('client_id', clientId)
      .eq('to_record_id', recordId)
      .eq('relation_type', 'documented_by')
    if (protectedLinksError) throw new ClientBrainV2HttpError('Unable to validate official menu provenance.', 500)
    const targetIds = [...new Set((protectedLinks ?? []).map(link => link.from_record_id))]
    if (targetIds.length) {
      const { data: alternatives, error: alternativesError } = await clientBrainV2ServerClient
        .from('client_brain_v2_links')
        .select('from_record_id, client_brain_v2_records!inner(id, top_section, status, metadata)')
        .eq('client_id', clientId)
        .in('from_record_id', targetIds)
        .eq('relation_type', 'documented_by')
        .neq('to_record_id', recordId)
      if (alternativesError) throw new ClientBrainV2HttpError('Unable to validate official menu provenance.', 500)
      const covered = new Set((alternatives ?? []).flatMap(link => {
        const source = link.client_brain_v2_records as unknown as { top_section: string; status: string; metadata: Record<string, unknown> } | null
        return source?.top_section === 'sources' && source.status === 'current' && source.metadata?.menu_document === true ? [link.from_record_id] : []
      }))
      if (targetIds.some(targetId => !covered.has(targetId))) throw new ClientBrainV2HttpError('This is the last current official menu document for a linked record. Add or select a replacement first.', 409)
    }
  }
  await validateSupersession(clientId, recordId, parsed.supersededById)
  await assertNoDuplicateUrl(clientId, parsed.externalUrl, recordId)
  const now = new Date().toISOString()
  const { data, error: saveError } = await clientBrainV2ServerClient.rpc('apply_client_brain_v2_source_v2_edit', {
    p_client_id: clientId,
    p_change: {
      record_id: recordId, expected_updated_at: expectedUpdatedAt, title: parsed.name, content: parsed.notes,
      status: parsed.status, confidence: sourceTrustScore(parsed.trust), last_verified_at: parsed.lastVerified ? `${parsed.lastVerified}T12:00:00.000Z` : null,
      source_type: parsed.sourceType, superseded_by_id: parsed.supersededById,
      provenance: { ...(existing.provenance ?? {}), manual_edit: true, edited_at: now, source_label: 'Sources V2' },
      metadata: recordMetadata(existing.metadata ?? {}, parsed),
    },
  })
  if (saveError) {
    const status = saveError.code === 'PT409' ? 409 : saveError.code === 'PT404' ? 404 : saveError.code === 'PT403' ? 403 : saveError.code === 'PT400' ? 400 : 500
    throw new ClientBrainV2HttpError(status === 500 ? 'Unable to save Source.' : saveError.message, status)
  }
  return { mutation: data, ...(await loadClientBrainV2(clientId, 'sources')) }
}

export async function createClientBrainV2Source(clientId: string, input: unknown) {
  await requireClientBrainV2(clientId)
  const parsed = sourceInput(input, true)
  await validateSupersession(clientId, null, parsed.supersededById)
  await assertNoDuplicateUrl(clientId, parsed.externalUrl, null)
  const relationshipTargetIds = parsed.payload.relationshipTargetIds ?? []
  if (!Array.isArray(relationshipTargetIds) || relationshipTargetIds.some(id => typeof id !== 'string' || !isUuid(id))) throw new ClientBrainV2HttpError('Source relationships are invalid.', 400)
  const { data, error } = await clientBrainV2ServerClient.rpc('create_client_brain_v2_source_v2', {
    p_client_id: clientId,
    p_source: {
      title: parsed.name, source_type: parsed.sourceType, source_kind: parsed.sourceKind, status: parsed.status,
      trust: parsed.trust, authority_scopes: parsed.authorityScopes, last_verified_at: parsed.lastVerified || null,
      external_url: parsed.externalUrl || null, content: parsed.notes || null, superseded_by_id: parsed.supersededById,
      relationship_target_ids: relationshipTargetIds,
    },
  })
  if (error || !data) throw new ClientBrainV2HttpError(error?.message || 'Unable to create Source.', error?.code === 'PT409' ? 409 : error?.code === 'PT403' ? 403 : 500)
  return { mutation: data, ...(await loadClientBrainV2(clientId, 'sources')) }
}

export async function uploadClientBrainV2SourceFile(clientId: string, formData: FormData) {
  await requireClientBrainV2(clientId)
  const rawFile = formData.get('file')
  if (!(rawFile instanceof File) || rawFile.size <= 0) throw new ClientBrainV2HttpError('Choose a Source file to upload.', 400)
  if (rawFile.size > MAX_FILE_BYTES) throw new ClientBrainV2HttpError('Source files must be 20 MB or smaller.', 400)
  if (!SOURCE_FILE_TYPES.has(rawFile.type)) throw new ClientBrainV2HttpError('This Source file type is not supported.', 400)
  const bytes = Buffer.from(await rawFile.arrayBuffer())
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const { data: matchingFiles, error: matchingFilesError } = await clientBrainV2ServerClient.from('client_brain_file_objects').select('id').filter('metadata->>sha256', 'eq', checksum)
  if (matchingFilesError) throw new ClientBrainV2HttpError('Unable to check Source file duplicates.', 500)
  const ids = (matchingFiles ?? []).map(file => file.id)
  if (ids.length) {
    const { data: assignments, error } = await clientBrainV2ServerClient.from('client_brain_v2_record_files').select('record_id').eq('client_id', clientId).in('file_object_id', ids)
    if (error) throw new ClientBrainV2HttpError('Unable to check Source file duplicates.', 500)
    if (assignments?.length) throw new ClientBrainV2HttpError('A Source with this file already exists for this client.', 409)
  }
  const extension = extname(rawFile.name).toLowerCase()
  const path = `${clientId}/client-brain-v2/sources/${randomUUID()}_${safeName(rawFile.name)}${extension && !rawFile.name.toLowerCase().endsWith(extension) ? extension : ''}`
  const { error: uploadError } = await clientBrainV2ServerClient.storage.from(BUCKET).upload(path, bytes, { contentType: rawFile.type, upsert: false })
  if (uploadError) throw new ClientBrainV2HttpError('Unable to store the Source file.', 500)
  return { storageBucket: BUCKET, storagePath: path, fileName: rawFile.name, fileType: rawFile.type, fileSizeBytes: bytes.length, sha256: checksum }
}

export async function createClientBrainV2FileSource(clientId: string, formData: FormData) {
  const uploaded = await uploadClientBrainV2SourceFile(clientId, formData)
  try {
    const raw = formData.get('source')
    const source = typeof raw === 'string' ? JSON.parse(raw) : null
    const parsed = sourceInput({ ...source, sourceKind: 'file' }, true)
    await validateSupersession(clientId, null, parsed.supersededById)
    const { data, error } = await clientBrainV2ServerClient.rpc('create_client_brain_v2_source_v2', {
      p_client_id: clientId,
      p_source: {
        title: parsed.name, source_type: parsed.sourceType, source_kind: 'file', status: parsed.status,
        trust: parsed.trust, authority_scopes: parsed.authorityScopes, last_verified_at: parsed.lastVerified || null,
        external_url: null, content: parsed.notes || null, superseded_by_id: parsed.supersededById,
        relationship_target_ids: parsed.payload.relationshipTargetIds ?? [], file: uploaded,
      },
    })
    if (error || !data) throw new ClientBrainV2HttpError(error?.message || 'Unable to create Source.', error?.code === 'PT409' ? 409 : 500)
    return { mutation: data, ...(await loadClientBrainV2(clientId, 'sources')) }
  } catch (error) {
    await clientBrainV2ServerClient.storage.from(uploaded.storageBucket).remove([uploaded.storagePath])
    throw error
  }
}

export async function openClientBrainV2SourceFile(clientId: string, recordId: string, fileId: string) {
  await requireClientBrainV2(clientId)
  if (!isUuid(recordId) || !isUuid(fileId)) throw new ClientBrainV2HttpError('Source file not found.', 404)
  const { data: assignment, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('file_object_id, client_brain_file_objects!inner(storage_bucket, storage_path, file_name, file_type)')
    .eq('client_id', clientId).eq('record_id', recordId).eq('file_object_id', fileId).maybeSingle()
  if (error || !assignment) throw new ClientBrainV2HttpError('Source file not found.', 404)
  const file = assignment.client_brain_file_objects as unknown as { storage_bucket: string; storage_path: string; file_name: string; file_type: string | null }
  const { data: signed, error: signedError } = await clientBrainV2ServerClient.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 60 * 15)
  if (signedError || !signed?.signedUrl) throw new ClientBrainV2HttpError('Unable to prepare the Source file.', 500)
  return { url: signed.signedUrl, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), fileName: file.file_name, fileType: file.file_type }
}

export async function listClientBrainV2SourceTargets(clientId: string) {
  await requireClientBrainV2(clientId)
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, top_section, subsection, status')
    .eq('client_id', clientId)
    .neq('top_section', 'sources')
    .neq('status', 'archived')
    .order('top_section')
    .order('title')
    .limit(500)
  if (error) throw new ClientBrainV2HttpError('Unable to load Source relationship options.', 500)
  return { targets: data ?? [] }
}

export async function deleteClientBrainV2Source(clientId: string, recordId: string) {
  await requireClientBrainV2(clientId)
  if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Source not found.', 404)
  const { data: source, error: sourceError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id')
    .eq('client_id', clientId).eq('id', recordId).eq('top_section', 'sources').maybeSingle()
  if (sourceError || !source) throw new ClientBrainV2HttpError('Source not found.', 404)
  const { count, error: linksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .or(`from_record_id.eq.${recordId},to_record_id.eq.${recordId}`)
  if (linksError) throw new ClientBrainV2HttpError('Unable to inspect Source relationships.', 500)
  if (count) throw new ClientBrainV2HttpError(`This Source supports ${count} record${count === 1 ? '' : 's'}. Mark it Historical or Superseded instead.`, 409)

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('file_object_id, client_brain_file_objects!inner(storage_bucket, storage_path)')
    .eq('client_id', clientId).eq('record_id', recordId)
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to inspect Source files.', 500)
  const { error: deleteError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records').delete().eq('client_id', clientId).eq('id', recordId)
  if (deleteError) throw new ClientBrainV2HttpError('Unable to delete Source.', 500)

  for (const assignment of assignments ?? []) {
    const fileId = assignment.file_object_id
    const { count: remaining, error: remainingError } = await clientBrainV2ServerClient
      .from('client_brain_v2_record_files').select('id', { count: 'exact', head: true }).eq('file_object_id', fileId)
    if (remainingError || remaining) continue
    const file = assignment.client_brain_file_objects as unknown as { storage_bucket: string; storage_path: string }
    await clientBrainV2ServerClient.storage.from(file.storage_bucket).remove([file.storage_path])
    await clientBrainV2ServerClient.from('client_brain_file_objects').delete().eq('id', fileId)
  }
  return { ...(await loadClientBrainV2(clientId, 'sources')) }
}
