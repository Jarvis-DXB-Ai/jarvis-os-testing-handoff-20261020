import 'server-only'
import { WRITING_GUIDE_SOURCE_KEY, WRITING_GUIDE_VERSION_KEY } from '@/lib/caption-writing-guide'

import {
  CLIENT_BRAIN_V2_BRAND_GUIDELINE_CONFIG,
  CLIENT_BRAIN_V2_GRAPHIC_TYPES,
  brandGuidelineStableKey,
  isBrandGuidelineSubsection,
  type ClientBrainV2BrandGuidelineEditWorkspace,
} from '@/lib/client-brain-v2-brand-guidelines'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  loadClientBrainV2,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server'

type ExistingRecord = {
  id: string
  client_id: string
  stable_key: string
  updated_at: string
  source_type: string | null
  metadata: Record<string, unknown>
  provenance: Record<string, unknown>
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string, max = 6000) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim()
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return result
}

function normalizeHex(value: unknown) {
  const raw = stringValue(value ?? '', 'HEX', 7).replace(/^#?/, '').toUpperCase()
  if (!/^[0-9A-F]{6}$/.test(raw)) throw new ClientBrainV2HttpError('HEX values must use the format #RRGGBB.', 400)
  return `#${raw}`
}

function isAssetItem(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assetItems(value: unknown, subtype: 'logos' | 'fonts' | 'graphics') {
  if (!Array.isArray(value) || value.length > 30) throw new ClientBrainV2HttpError(`${subtype} is invalid.`, 400)
  const allowedRoles = subtype === 'logos'
    ? new Set(['wordmark', 'light_wordmark', 'dark_wordmark', 'brand_mark'])
    : subtype === 'fonts'
      ? new Set(['primary', 'body'])
      : null
  if (subtype === 'logos' && value.length > 3) throw new ClientBrainV2HttpError('Logos may contain at most three canonical files.', 400)
  if (subtype === 'fonts' && value.length > 2) throw new ClientBrainV2HttpError('Fonts may contain at most two canonical files.', 400)
  const roles = new Set<string>()
  return value.map((raw, index) => {
    if (!isAssetItem(raw)) throw new ClientBrainV2HttpError(`${subtype} item ${index + 1} is invalid.`, 400)
    const role = stringValue(raw.role, `${subtype} role`, 40)
    if (allowedRoles && !allowedRoles.has(role)) throw new ClientBrainV2HttpError(`Invalid ${subtype} role.`, 400)
    if (allowedRoles && roles.has(role)) throw new ClientBrainV2HttpError(`Only one ${role.replace(/_/g, ' ')} may be stored.`, 400)
    roles.add(role)
    const assetId = stringValue(raw.assetId, `${subtype} asset`, 40)
    if (!isUuid(assetId)) throw new ClientBrainV2HttpError(`${subtype} contains an invalid asset.`, 400)
    const base = {
      assetId,
      role,
      name: stringValue(raw.name ?? '', `${subtype} name`, 160),
      notes: stringValue(raw.notes ?? '', `${subtype} notes`, 2000),
    }
    if (subtype === 'graphics') {
      const type = stringValue(raw.type ?? 'graphic_element', 'Graphic type', 40)
      if (!CLIENT_BRAIN_V2_GRAPHIC_TYPES.includes(type as typeof CLIENT_BRAIN_V2_GRAPHIC_TYPES[number])) {
        throw new ClientBrainV2HttpError('Invalid graphic type.', 400)
      }
      return { ...base, type }
    }
    return base
  })
}

function colourItems(value: unknown) {
  if (!Array.isArray(value) || value.length > 40) throw new ClientBrainV2HttpError('Colours is invalid.', 400)
  return value.map((raw, index) => {
    if (!isAssetItem(raw)) throw new ClientBrainV2HttpError(`Colour ${index + 1} is invalid.`, 400)
    return {
      name: stringValue(raw.name ?? '', 'Colour name', 120),
      hex: normalizeHex(raw.hex),
      notes: stringValue(raw.notes ?? '', 'Colour notes', 2000),
    }
  })
}

async function validateBrandAssets(clientId: string, assetIds: string[]) {
  if (!assetIds.length) return
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, top_section, subsection, status')
    .eq('client_id', clientId)
    .in('id', assetIds)
  if (error) throw new ClientBrainV2HttpError('Unable to validate Brand File references.', 500)
  const byId = new Map((data ?? []).map(record => [record.id, record]))
  for (const assetId of assetIds) {
    const record = byId.get(assetId)
    if (!record || record.top_section !== 'assets' || record.subsection !== 'brand_files' || record.status === 'archived') {
      throw new ClientBrainV2HttpError('A referenced Brand File is not available for this client.', 403)
    }
  }
}

export async function saveClientBrainV2BrandGuideline(clientId: string, input: unknown) {
  await requireClientBrainV2(clientId)
  const payload = objectValue(input, 'Request') as Partial<ClientBrainV2BrandGuidelineEditWorkspace>
  if (payload.section !== 'brand_guidelines' || !isBrandGuidelineSubsection(payload.subsection)) {
    throw new ClientBrainV2HttpError('Invalid Brand Guidelines section.', 400)
  }
  if (!Array.isArray(payload.fields)) throw new ClientBrainV2HttpError('Brand Kit fields are required.', 400)

  const config = CLIENT_BRAIN_V2_BRAND_GUIDELINE_CONFIG[payload.subsection]
  // These internal selectors are not editable Brand Kit fields. Preserve them
  // when the legacy editor synchronizes its visible fields to Publishing.
  const writingGuideBinding: Record<string, unknown> = {}
  if (payload.subsection === 'caption_intelligence') {
    const { data: profile, error } = await clientBrainV2ServerClient.from('social_caption_profiles')
      .select('caption_guidelines').eq('client_id', clientId).maybeSingle()
    if (error) throw new ClientBrainV2HttpError('Unable to load caption configuration before editing.', 500)
    const previous = profile?.caption_guidelines ?? {}
    for (const key of [WRITING_GUIDE_SOURCE_KEY, WRITING_GUIDE_VERSION_KEY]) {
      if (Object.prototype.hasOwnProperty.call(previous, key)) writingGuideBinding[key] = previous[key]
    }
  }
  const expected = new Map(config.fields.map(field => [field.id, field]))
  if (payload.fields.length !== expected.size) throw new ClientBrainV2HttpError('The Brand Kit payload is incomplete.', 400)
  for (const field of payload.fields) {
    const definition = expected.get(field.id)
    if (!definition || definition.kind !== field.kind || definition.label !== field.label) {
      throw new ClientBrainV2HttpError(`Invalid Brand Kit field: ${field.id}.`, 400)
    }
  }

  const baseline = objectValue(payload.baseline, 'Edit baseline')
  const baselineRecord = objectValue(baseline.record ?? { recordId: null, updatedAt: null }, 'Record baseline')
  const recordId = typeof baselineRecord.recordId === 'string' && isUuid(baselineRecord.recordId) ? baselineRecord.recordId : null
  let existing: ExistingRecord | null = null
  if (recordId) {
    const result = await clientBrainV2ServerClient.from('client_brain_v2_records')
      .select('id, client_id, stable_key, updated_at, source_type, metadata, provenance')
      .eq('client_id', clientId).eq('id', recordId).eq('top_section', 'brand_guidelines').maybeSingle()
    if (result.error) throw new ClientBrainV2HttpError('Unable to validate the Brand Kit record.', 500)
    if (!result.data) throw new ClientBrainV2HttpError('The Brand Kit record does not belong to this client.', 403)
    existing = result.data as ExistingRecord
    if (typeof baselineRecord.updatedAt !== 'string' || baselineRecord.updatedAt !== existing.updated_at) {
      throw new ClientBrainV2HttpError('This Brand Kit section changed after editing began. Refresh and review the newer values.', 409)
    }
  }

  const values = new Map(payload.fields.map(field => [field.id, field] as const))
  const sectionNotes = stringValue(values.get('section_notes')?.value ?? '', 'Section notes', 4000)
  const editorData: Record<string, unknown> = payload.subsection === 'caption_intelligence' ? Object.fromEntries(config.fields.map(field => [field.id, stringValue(values.get(field.id)?.value ?? '', field.label, 6000)])) : { section_notes: sectionNotes }
  const assetIds: string[] = []

  if (payload.subsection === 'caption_intelligence') {
    // Text-only, client-scoped writing intelligence: no asset links.
  } else if (payload.subsection === 'logos') {
    const items = assetItems(values.get('logos')?.items, 'logos')
    editorData.logos = items
    assetIds.push(...items.map(item => item.assetId))
  } else if (payload.subsection === 'colours') {
    editorData.colours = colourItems(values.get('colours')?.items)
  } else if (payload.subsection === 'typography') {
    const items = assetItems(values.get('fonts')?.items, 'fonts')
    editorData.fonts = items
    assetIds.push(...items.map(item => item.assetId))
  } else {
    const items = assetItems(values.get('graphics')?.items, 'graphics')
    editorData.graphics = items
    assetIds.push(...items.map(item => item.assetId))
  }

  await validateBrandAssets(clientId, assetIds)
  const now = new Date().toISOString()
  const assetLabel = assetIds.length === 1 ? '1 canonical brand file' : `${assetIds.length} canonical brand files`
  const change = {
    record_id: existing?.id ?? null,
    expected_updated_at: existing?.updated_at ?? null,
    stable_key: brandGuidelineStableKey(payload.subsection),
    subsection: payload.subsection,
    record_type: 'brand_guideline',
    title: config.label,
    summary: payload.subsection === 'caption_intelligence'
      ? 'Client-scoped social caption voice, guardrails, and post-type rules.'
      : payload.subsection === 'colours'
      ? `${(editorData.colours as unknown[]).length} exact brand colour values.`
      : `${assetLabel}.`,
    content: null,
    knowledge_class: 'brand_guideline',
    status: 'approved',
    confidence: 1,
    priority: 5,
    source_type: existing?.source_type ?? (assetIds.length ? 'client_provided' : 'manual_edit'),
    provenance: {
      ...(existing?.provenance ?? {}),
      manual_edit: true,
      source_label: 'Brand Kit',
      edited_at: now,
    },
    metadata: {
      ...(existing?.metadata ?? {}),
      editor_managed: true,
      editor_subsection: payload.subsection,
      brand_kit_version: 2,
      editor_data: editorData,
    },
  }
  const links = [...new Set(assetIds)].map(toRecordId => ({
    to_record_id: toRecordId,
    relation_type: 'references_asset',
    metadata: { relationship_scope: 'brand_kit', canonical: true },
  }))

  const { data, error } = await clientBrainV2ServerClient.rpc('apply_client_brain_v2_brand_guideline_edit', {
    p_client_id: clientId,
    p_change: change,
    p_links: links,
  })
  if (error) {
    const status = error.code === 'PT409' ? 409 : error.code === 'PT404' ? 404 : error.code === 'PT403' ? 403 : 500
    throw new ClientBrainV2HttpError(status === 500 ? 'Unable to save Brand Kit changes.' : error.message, status)
  }
  if (payload.subsection === 'caption_intelligence') {
    const { error: profileError } = await clientBrainV2ServerClient.from('social_caption_profiles')
      .update({ caption_guidelines: { ...editorData, ...writingGuideBinding }, updated_at: now }).eq('client_id', clientId)
    if (profileError) throw new ClientBrainV2HttpError('Caption Intelligence saved, but the Publishing profile could not be synchronized.', 500)
  }
  return { mutation: data, ...(await loadClientBrainV2(clientId, 'brand_guidelines')) }
}
