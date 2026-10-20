import 'server-only'

import {
  EDIT_FIELD_CONFIG,
  GAP_AREAS,
  GAP_LIFECYCLES,
  GAP_TYPES,
  VISUAL_RULE_STRENGTHS,
  canonicalFieldStableKey,
  isEditableBrainV2Subsection,
  type ClientBrainV2EditField,
  type ClientBrainV2EditRequest,
  type ClientBrainV2EditableSubsection,
} from '@/lib/client-brain-v2-edit'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, loadClientBrainV2, requireClientBrainV2 } from '@/lib/client-brain-v2-server'

type Change = Record<string, unknown>
type ExistingRecord = { id: string; client_id: string; stable_key: string; summary: string | null; content: string | null; status: string; last_verified_at: string | null; updated_at: string; metadata: Record<string, unknown>; provenance: Record<string, unknown> }
type CommercialDetailChange = {
  record_id: string
  object_type: 'collection' | 'offer' | 'experience_event'
  price_amount: number | null
  currency: string | null
  pricing_mechanism: string | null
  availability: string | null
  schedule: Record<string, unknown>
  restrictions: string | null
  booking_requirements: string | null
  ingredients: string[]
  key_selling_points: string[]
  metadata: Record<string, unknown>
}

const GAP_RESOLUTION_MAP: Record<string, string> = {
  'brand_identity:mission_purpose': 'knowledge_gap:brand_identity:mission_purpose',
  'brand_identity:brand_promise': 'knowledge_gap:brand_identity:brand_promise',
  'brand_identity:values': 'knowledge_gap:brand_identity:values',
  'commercial_strategy:retention_repeat_behaviour': 'knowledge_gap:commercial_strategy:retention_repeat_priorities',
  'commercial_strategy:commercial_kpis': 'knowledge_gap:commercial_strategy:commercial_kpis_targets',
  'operations:capacity_booking_rules': 'knowledge_gap:operations:capacity_booking_rules',
  'operations:guest_policies': 'knowledge_gap:operations:guest_policies_accessibility',
  'operations:dietary_service_capabilities': 'knowledge_gap:operations:dietary_service_capabilities',
  'market_intelligence:competitor_landscape': 'knowledge_gap:market_intelligence:competitor_set_validation',
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string, max = 6000, allowEmpty = true) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim()
  if (!allowEmpty && !result) throw new ClientBrainV2HttpError(`${label} is required.`, 400)
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return result
}

function optionalString(value: unknown, label: string, max = 6000) {
  return value == null ? '' : stringValue(value, label, max)
}

function stringList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 100) throw new ClientBrainV2HttpError(`${label} must be a list with no more than 100 items.`, 400)
  return value.map((item, index) => stringValue(item, `${label} item ${index + 1}`, 2000)).filter(Boolean)
}

function dateValue(value: unknown, label: string) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ClientBrainV2HttpError(`${label} must be a valid date.`, 400)
  return value
}

function optionalNumber(value: unknown, label: string) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new ClientBrainV2HttpError(`${label} must be a positive number.`, 400)
  return number
}

function optionalStringList(value: unknown, label: string) {
  if (value == null) return []
  return stringList(value, label)
}

function entityStatus(value: unknown) {
  const status = stringValue(value ?? 'needs_review', 'Status', 40, false)
  if (!['current', 'active', 'approved', 'needs_review', 'historical', 'superseded'].includes(status)) {
    throw new ClientBrainV2HttpError('Invalid Menu or Activation status.', 400)
  }
  return status
}

function knowledgeClass(subsection: ClientBrainV2EditableSubsection) {
  if (subsection === 'menus' || subsection === 'activations') return 'commercial'
  if (subsection === 'commercial_strategy') return 'dynamic'
  if (subsection === 'operations') return 'operational'
  if (subsection === 'market_intelligence') return 'temporal'
  if (subsection === 'knowledge_gaps') return 'knowledge_gap'
  return 'stable'
}

function currentStatus(subsection: ClientBrainV2EditableSubsection) {
  if (subsection === 'menus' || subsection === 'activations') return 'current'
  if (subsection === 'commercial_strategy') return 'active'
  if (subsection === 'operations' || subsection === 'market_intelligence') return 'current'
  return 'approved'
}

function baseChange(subsection: ClientBrainV2EditableSubsection, field: ClientBrainV2EditField, record: ExistingRecord | undefined, editorData: Record<string, unknown>): Change {
  const stableKey = canonicalFieldStableKey(subsection, field.id)
  return {
    record_id: record?.id ?? null,
    expected_updated_at: record?.updated_at ?? null,
    stable_key: stableKey,
    subsection: subsection === 'overview' && field.id === 'positioning' ? 'brand_identity' : subsection,
    record_type: 'intelligence_field',
    title: field.label,
    summary: record?.summary ?? null,
    content: record?.content ?? null,
    knowledge_class: knowledgeClass(subsection),
    status: currentStatus(subsection),
    confidence: 0.95,
    priority: 5,
    effective_date: subsection === 'commercial_strategy' || subsection === 'operations' || subsection === 'market_intelligence' ? new Date().toISOString().slice(0, 10) : null,
    review_at: subsection === 'market_intelligence' ? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) : null,
    provenance: { ...(record?.provenance ?? {}), manual_edit: true, source_label: 'Manual Client Brain Edit', edited_at: new Date().toISOString() },
    metadata: { ...(record?.metadata ?? {}), editor_managed: true, editor_field_id: field.id, editor_data: editorData },
  }
}

function gapStatus(lifecycle: string) {
  return ({ open: 'active', in_review: 'needs_review', blocked: 'restricted', resolved: 'resolved', dismissed: 'historical', superseded: 'superseded' } as Record<string, string>)[lifecycle]
}

export async function saveClientBrainV2Intelligence(clientId: string, input: unknown) {
  await requireClientBrainV2(clientId)
  const payload = objectValue(input, 'Request') as Partial<ClientBrainV2EditRequest>
  if (!isEditableBrainV2Subsection(payload.subsection)) throw new ClientBrainV2HttpError('Invalid Intelligence subsection.', 400)
  if (!Array.isArray(payload.fields)) throw new ClientBrainV2HttpError('Editable fields are required.', 400)
  const subsection = payload.subsection
  const config = new Map(EDIT_FIELD_CONFIG[subsection].map(field => [field.id, field]))
  const fields = payload.fields as ClientBrainV2EditField[]
  if (fields.length !== config.size) throw new ClientBrainV2HttpError('The section payload is incomplete.', 400)
  for (const field of fields) {
    const expected = config.get(field.id)
    if (!expected || expected.kind !== field.kind || field.label !== expected.label) throw new ClientBrainV2HttpError(`Invalid editable field: ${field.id}.`, 400)
  }

  const recordIds = new Set<string>()
  const baseline = objectValue(payload.baseline, 'Edit baseline')
  for (const entry of Object.values(baseline)) {
    const item = objectValue(entry, 'Baseline item')
    if (typeof item.recordId === 'string' && isUuid(item.recordId)) recordIds.add(item.recordId)
  }
  for (const field of fields) for (const raw of field.items ?? []) {
    const item = objectValue(raw, field.label)
    if (typeof item.recordId === 'string' && isUuid(item.recordId)) recordIds.add(item.recordId)
  }
  const existingById = new Map<string, ExistingRecord>()
  if (recordIds.size) {
    const { data, error } = await clientBrainV2ServerClient.from('client_brain_v2_records')
      .select('id, client_id, stable_key, summary, content, status, last_verified_at, updated_at, metadata, provenance')
      .eq('client_id', clientId).in('id', [...recordIds])
    if (error) throw new ClientBrainV2HttpError('Unable to validate editable records.', 500)
    for (const record of data ?? []) existingById.set(record.id, record as ExistingRecord)
    if ([...recordIds].some(id => !existingById.has(id))) throw new ClientBrainV2HttpError('An editable record does not belong to this client.', 403)
  }

  const changes: Change[] = []
  const commercialDetailChanges: CommercialDetailChange[] = []
  const archives: Array<{ record_id: string; expected_updated_at: string | null }> = []
  const resolveGapKeys = new Set<string>()
  for (const field of fields) {
    const baselineItem = objectValue(baseline[field.id] ?? { recordId: null, updatedAt: null }, `${field.label} baseline`)
    const record = typeof baselineItem.recordId === 'string' ? existingById.get(baselineItem.recordId) : undefined
    if (record && baselineItem.updatedAt !== record.updated_at) throw new ClientBrainV2HttpError('This Client Brain section changed after editing began. Refresh and review the newer values.', 409)
    if (field.kind === 'text' || field.kind === 'textarea') {
      const value = optionalString(field.value, field.label)
      changes.push(baseChange(subsection, field, record, { value: value || null, cleared: !value }))
      if (value && GAP_RESOLUTION_MAP[`${subsection}:${field.id}`]) resolveGapKeys.add(GAP_RESOLUTION_MAP[`${subsection}:${field.id}`])
    } else if (field.kind === 'list') {
      const values = stringList(field.values, field.label)
      changes.push(baseChange(subsection, field, record, { values, cleared: values.length === 0 }))
      if (values.length && GAP_RESOLUTION_MAP[`${subsection}:${field.id}`]) resolveGapKeys.add(GAP_RESOLUTION_MAP[`${subsection}:${field.id}`])
    } else if (field.kind === 'rules') {
      const rules = (field.items ?? []).map((raw, index) => {
        const item = objectValue(raw, `${field.label} rule ${index + 1}`)
        const strength = stringValue(item.strength, 'Guardrail strength', 40, false)
        if (!VISUAL_RULE_STRENGTHS.includes(strength as typeof VISUAL_RULE_STRENGTHS[number])) throw new ClientBrainV2HttpError('Invalid guardrail strength.', 400)
        return { text: stringValue(item.text, 'Guardrail', 2000, false), strength }
      })
      changes.push(baseChange(subsection, field, record, { rules, cleared: rules.length === 0 }))
    } else if (field.kind === 'facts') {
      const facts = (field.items ?? []).map((raw, index) => {
        const item = objectValue(raw, `${field.label} fact ${index + 1}`)
        return { label: stringValue(item.label, 'Fact label', 200, false), value: stringValue(item.value, 'Fact value', 2000, false), note: optionalString(item.note, 'Fact note', 2000) || null }
      })
      changes.push(baseChange(subsection, field, record, { facts, cleared: facts.length === 0 }))
      if (facts.length && GAP_RESOLUTION_MAP[`${subsection}:${field.id}`]) resolveGapKeys.add(GAP_RESOLUTION_MAP[`${subsection}:${field.id}`])
    } else if (field.kind === 'market') {
      const signals: Record<string, unknown>[] = []
      const competitors: Record<string, unknown>[] = []
      for (const [index, raw] of (field.items ?? []).entries()) {
        const item = objectValue(raw, `${field.label} item ${index + 1}`)
        if (item.itemType === 'competitor') competitors.push({
          name: stringValue(item.name, 'Competitor name', 300, false),
          comparison_set: optionalString(item.comparison_set, 'Comparison set', 1000),
          classification: ['direct', 'indirect', 'aspirational', 'unclassified'].includes(String(item.classification)) ? item.classification : 'unclassified',
          status: ['current', 'needs_review', 'historical', 'expired', 'superseded'].includes(String(item.status)) ? item.status : 'current',
          confidence: 0.95, observed_at: dateValue(item.observed_at, 'Observed date'), source_record_id: record?.id ?? '',
        })
        else signals.push({
          text: stringValue(item.text, 'Market signal', 3000, false),
          kind: ['observation', 'analysis', 'opportunity', 'threat'].includes(String(item.kind)) ? item.kind : 'observation',
          status: ['current', 'needs_review', 'historical', 'expired', 'superseded'].includes(String(item.status)) ? item.status : 'current',
          confidence: 0.95, observed_at: dateValue(item.observed_at, 'Observed date'), source_record_id: record?.id ?? null,
        })
      }
      changes.push(baseChange(subsection, field, record, { signals, competitors, cleared: !signals.length && !competitors.length }))
      if ((signals.length || competitors.length) && GAP_RESOLUTION_MAP[`${subsection}:${field.id}`]) resolveGapKeys.add(GAP_RESOLUTION_MAP[`${subsection}:${field.id}`])
    } else if (field.kind === 'menus') {
      for (const [index, raw] of (field.items ?? []).entries()) {
        const item = objectValue(raw, `Menu ${index + 1}`)
        const recordId = stringValue(item.recordId, 'Menu record ID', 40, false)
        if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Invalid Menu record ID.', 400)
        const existing = existingById.get(recordId)
        if (!existing) throw new ClientBrainV2HttpError('Menu does not belong to this client.', 403)
        if (typeof item.updatedAt === 'string' && item.updatedAt !== existing.updated_at) throw new ClientBrainV2HttpError('This Menu changed after editing began. Refresh and review the newer values.', 409)
        const name = stringValue(item.name, 'Menu name', 300, false)
        const description = optionalString(item.description, 'Menu description')
        const status = entityStatus(item.status)
        const data = {
          menu_type: optionalString(item.menu_type, 'Menu type', 200),
          description,
          status,
          service_daypart: optionalString(item.service_daypart, 'Service / daypart', 200),
          availability: optionalString(item.availability, 'Availability', 1000),
          service_hours: optionalString(item.service_hours, 'Service hours', 500),
          source: optionalString(item.source, 'Source', 500),
          last_verified: dateValue(item.last_verified, 'Last verified'),
          review_state: optionalString(item.review_state, 'Review state', 80),
          notes: optionalString(item.notes, 'Menu notes'),
        }
        changes.push({
          ...baseChange('menus', { id: recordId, label: name, kind: 'menus' }, existing, data),
          stable_key: existing.stable_key,
          subsection: 'menus',
          record_type: 'menu',
          title: name,
          summary: description || null,
          content: description || null,
          status,
          last_verified_at: data.last_verified,
        })
        commercialDetailChanges.push({
          record_id: recordId,
          object_type: 'collection',
          price_amount: null,
          currency: null,
          pricing_mechanism: null,
          availability: data.availability || null,
          schedule: { service_hours: data.service_hours || null, service_daypart: data.service_daypart || null },
          restrictions: null,
          booking_requirements: null,
          ingredients: [],
          key_selling_points: [],
          metadata: { menu_type: data.menu_type || null, review_state: data.review_state || null },
        })
      }
    } else if (field.kind === 'activations') {
      for (const [index, raw] of (field.items ?? []).entries()) {
        const item = objectValue(raw, `Activation ${index + 1}`)
        const recordId = stringValue(item.recordId, 'Activation record ID', 40, false)
        if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Invalid Activation record ID.', 400)
        const existing = existingById.get(recordId)
        if (!existing) throw new ClientBrainV2HttpError('Activation does not belong to this client.', 403)
        if (typeof item.updatedAt === 'string' && item.updatedAt !== existing.updated_at) throw new ClientBrainV2HttpError('This Activation changed after editing began. Refresh and review the newer values.', 409)
        const name = stringValue(item.name, 'Activation name', 300, false)
        const proposition = optionalString(item.proposition, 'Activation proposition')
        const status = entityStatus(item.status)
        const price = optionalNumber(item.price, 'Activation price')
        const type = optionalString(item.type, 'Activation type', 200)
        const data = {
          type,
          proposition,
          status,
          price,
          currency: price == null ? '' : optionalString(item.currency, 'Currency', 20) || 'AED',
          pricing_basis: optionalString(item.pricing_basis, 'Pricing basis', 200),
          schedule: optionalString(item.schedule, 'Schedule', 500),
          days: optionalString(item.days, 'Days', 300),
          start_time: optionalString(item.start_time, 'Start time', 40),
          end_time: optionalString(item.end_time, 'End time', 40),
          start_date: dateValue(item.start_date, 'Start date'),
          end_date: dateValue(item.end_date, 'End date'),
          valid_until: dateValue(item.valid_until, 'Valid until'),
          review_date: dateValue(item.review_date, 'Review date'),
          recurrence: optionalString(item.recurrence, 'Recurrence', 300),
          inclusions: optionalStringList(item.inclusions, 'Inclusions'),
          restrictions: optionalStringList(item.restrictions, 'Restrictions'),
          booking_requirements: optionalStringList(item.booking_requirements, 'Booking requirements'),
          platform: optionalString(item.platform, 'Platform', 200),
          dish: optionalString(item.dish, 'Activation dish', 300),
          month: optionalString(item.month, 'Activation month', 100),
          ingredients: optionalStringList(item.ingredients, 'Activation ingredients'),
          source: optionalString(item.source, 'Source', 500),
          last_verified: dateValue(item.last_verified, 'Last verified'),
          review_state: optionalString(item.review_state, 'Review state', 80),
          notes: optionalString(item.notes, 'Activation notes'),
        }
        const previousStatus = String((existing.metadata.editor_data as Record<string, unknown> | undefined)?.status ?? existing.status)
        const manuallyConfirmedCurrent = status === 'current' && previousStatus !== 'current'
        const lastVerified = data.last_verified ?? (manuallyConfirmedCurrent ? new Date().toISOString().slice(0, 10) : existing.last_verified_at?.slice(0, 10) ?? null)
        changes.push({
          ...baseChange('activations', { id: recordId, label: name, kind: 'activations' }, existing, data),
          stable_key: existing.stable_key,
          subsection: 'activations',
          record_type: 'activation',
          title: name,
          summary: proposition || null,
          content: proposition || null,
          status,
          effective_date: data.start_date,
          valid_until: data.valid_until ?? data.end_date,
          review_at: data.review_date,
          last_verified_at: lastVerified,
          provenance: {
            ...existing.provenance,
            manual_edit: true,
            source_label: 'Manual Client Brain Edit',
            edited_at: new Date().toISOString(),
            ...(manuallyConfirmedCurrent ? { manual_current_confirmation_at: new Date().toISOString() } : {}),
          },
          metadata: {
            ...existing.metadata,
            editor_managed: true,
            editor_field_id: 'activations',
            editor_data: { ...data, last_verified: lastVerified },
          },
        })
        commercialDetailChanges.push({
          record_id: recordId,
          object_type: /event|karaoke/i.test(type) ? 'experience_event' : 'offer',
          price_amount: price,
          currency: data.currency || null,
          pricing_mechanism: data.pricing_basis || null,
          availability: data.days || data.schedule || null,
          schedule: {
            summary: data.schedule || null,
            days: data.days || null,
            start_time: data.start_time || null,
            end_time: data.end_time || null,
            start_date: data.start_date,
            end_date: data.end_date,
            valid_until: data.valid_until ?? data.end_date,
            review_date: data.review_date,
            recurrence: data.recurrence || null,
          },
          restrictions: data.restrictions.join('\n') || null,
          booking_requirements: data.booking_requirements.join('\n') || null,
          ingredients: data.ingredients,
          key_selling_points: data.inclusions,
          metadata: {
            activation_type: type || null,
            platform: data.platform || null,
            review_state: data.review_state || null,
            dish: data.dish || null,
            month: data.month || null,
          },
        })
      }
    } else if (field.kind === 'segments') {
      const currentIds = new Set<string>()
      for (const [index, raw] of (field.items ?? []).entries()) {
        const item = objectValue(raw, `Audience segment ${index + 1}`)
        const recordId = typeof item.recordId === 'string' && isUuid(item.recordId) ? item.recordId : null
        const existing = recordId ? existingById.get(recordId) : undefined
        if (recordId) currentIds.add(recordId)
        const importance = ['primary', 'secondary', 'unconfirmed'].includes(String(item.importance)) ? item.importance : 'unconfirmed'
        changes.push({
          ...baseChange('audience', { id: recordId ?? `new-${index}`, label: stringValue(item.name, 'Segment name', 300, false), kind: 'segments' }, existing, {
            description: optionalString(item.description, 'Segment description'), importance,
            motivation: optionalString(item.motivation, 'Segment motivation'), occasions: optionalString(item.occasions, 'Segment occasions'),
          }),
          stable_key: existing?.stable_key ?? `intelligence:audience:segment:${crypto.randomUUID()}`,
          record_type: 'audience_segment', title: stringValue(item.name, 'Segment name', 300, false),
        })
      }
      for (const [key, raw] of Object.entries(baseline)) if (key.startsWith('segment:')) {
        const item = objectValue(raw, 'Segment baseline')
        const id = String(item.recordId ?? '')
        if (isUuid(id) && !currentIds.has(id)) archives.push({ record_id: id, expected_updated_at: typeof item.updatedAt === 'string' ? item.updatedAt : null })
      }
    } else if (field.kind === 'gaps') {
      for (const [index, raw] of (field.items ?? []).entries()) {
        const item = objectValue(raw, `Knowledge gap ${index + 1}`)
        const recordId = stringValue(item.record_id, 'Knowledge gap record ID', 40, false)
        if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Invalid Knowledge Gap record ID.', 400)
        const existing = existingById.get(recordId)
        if (!existing) throw new ClientBrainV2HttpError('Knowledge Gap does not belong to this client.', 403)
        const lifecycle = stringValue(item.lifecycle, 'Knowledge Gap status', 40, false)
        const gapType = stringValue(item.gap_type, 'Knowledge Gap type', 40, false)
        const relatedArea = stringValue(item.related_area_id, 'Related area', 80, false)
        if (!GAP_LIFECYCLES.includes(lifecycle as typeof GAP_LIFECYCLES[number]) || !GAP_TYPES.includes(gapType as typeof GAP_TYPES[number]) || !GAP_AREAS.includes(relatedArea as typeof GAP_AREAS[number])) throw new ClientBrainV2HttpError('Invalid Knowledge Gap classification.', 400)
        const description = optionalString(item.description, 'Gap description')
        const why = optionalString(item.why_it_matters, 'Why it matters')
        const resolution = optionalString(item.recommended_resolution, 'Recommended resolution')
        const question = stringValue(item.resolution_question, 'Resolution question', 3000, false)
        const priority = Number(item.priority)
        if (!Number.isInteger(priority) || priority < 1 || priority > 5) throw new ClientBrainV2HttpError('Knowledge Gap priority must be between 1 and 5.', 400)
        changes.push({
          record_id: existing.id, expected_updated_at: existing.updated_at, stable_key: existing.stable_key,
          subsection: 'knowledge_gaps', record_type: 'knowledge_gap', title: stringValue(item.title, 'Gap title', 300, false),
          summary: description || null,
          content: `Missing:\n- ${description || 'Not specified'}\n\nWhy it matters:\n- ${why || 'Not specified'}\n\nRecommended resolution:\n- ${resolution || question}`,
          knowledge_class: 'knowledge_gap', status: gapStatus(lifecycle), confidence: 0.95, priority,
          effective_date: null, review_at: null,
          provenance: { manual_edit: true, source_label: 'Manual Client Brain Edit', edited_at: new Date().toISOString() },
          metadata: { ...existing.metadata, gap_type: gapType, target_subsection: relatedArea, why_it_matters: why || null, recommended_resolution: resolution || null, resolution_prompt: question },
        })
      }
    }
  }

  const { data, error } = await clientBrainV2ServerClient.rpc('apply_client_brain_v2_intelligence_edit', {
    p_client_id: clientId,
    p_changes: changes,
    p_archives: archives,
    p_resolve_gap_keys: [...resolveGapKeys],
    p_commercial_details: commercialDetailChanges,
  })
  if (error) {
    console.error('[client-brain-v2] Intelligence save failed', { code: error.code, message: error.message, details: error.details })
    if (error.code === 'PGRST202') {
      throw new ClientBrainV2HttpError('Client Brain save infrastructure is unavailable. The reconciliation migration must be deployed before editing Intelligence.', 503)
    }
    const status = error.code === 'PT400' ? 400 : error.code === 'PT403' ? 403 : error.code === 'PT409' ? 409 : error.code === 'PT404' ? 404 : 500
    throw new ClientBrainV2HttpError(status === 500 ? 'Unable to save Client Brain changes.' : error.message, status)
  }
  return { mutation: data, ...(await loadClientBrainV2(clientId, 'intelligence')) }
}
