import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS,
  CLIENT_BRAIN_V2_LEARNING_ORIGINS,
  CLIENT_BRAIN_V2_LEARNING_APPLIES_TO,
  learningConfidenceScore,
  type ClientBrainV2LearningAppliesTo,
  type ClientBrainV2LearningConfidence,
  type ClientBrainV2LearningEditPayload,
  type ClientBrainV2LearningOrigin,
} from '@/lib/client-brain-v2-learnings'
import {
  CLIENT_BRAIN_V2_LEARNING_CATEGORIES,
  CLIENT_BRAIN_V2_LEARNING_STATUSES,
  type ClientBrainV2LearningCategory,
  type ClientBrainV2LearningStatus,
} from '@/lib/client-brain-v2'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  loadClientBrainV2,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server'

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(`${label} is invalid.`, 400)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string, max: number) {
  if (typeof value !== 'string') throw new ClientBrainV2HttpError(`${label} must be text.`, 400)
  const result = value.trim()
  if (result.length > max) throw new ClientBrainV2HttpError(`${label} is too long.`, 400)
  return result
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string) {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new ClientBrainV2HttpError(`Invalid ${label}.`, 400)
  return value as T
}

function dateValue(value: unknown, label: string) {
  const date = stringValue(value, label, 10)
  if (!date) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ClientBrainV2HttpError(`${label} must be a valid date.`, 400)
  }
  return date
}

function meaningfulValue(value: unknown) {
  return typeof value === 'string' ? Boolean(value) : value !== null && value !== undefined
}

export async function saveClientBrainV2Learning(clientId: string, input: unknown) {
  await requireClientBrainV2(clientId)
  const payload = objectValue(input, 'Request') as Partial<ClientBrainV2LearningEditPayload>
  if (payload.section !== 'learnings') throw new ClientBrainV2HttpError('Invalid Learnings request.', 400)
  const action = enumValue(payload.action, ['create', 'update'] as const, 'Learning action')
  const title = stringValue(payload.title, 'Learning title', 240)
  const learning = stringValue(payload.learning, 'Learning insight', 4000)
  if (!title) throw new ClientBrainV2HttpError('Learning title is required.', 400)
  if (!learning) throw new ClientBrainV2HttpError('Learning insight is required.', 400)
  const category = enumValue(payload.category, CLIENT_BRAIN_V2_LEARNING_CATEGORIES, 'Learning category') as ClientBrainV2LearningCategory
  const origin = enumValue(payload.origin, CLIENT_BRAIN_V2_LEARNING_ORIGINS, 'Learning origin') as ClientBrainV2LearningOrigin
  const confidence = enumValue(payload.confidence, CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS, 'Learning confidence') as ClientBrainV2LearningConfidence
  const status = enumValue(payload.status, CLIENT_BRAIN_V2_LEARNING_STATUSES, 'Learning status') as ClientBrainV2LearningStatus
  if (!Array.isArray(payload.appliesTo)) throw new ClientBrainV2HttpError('Applies To must be a list.', 400)
  const appliesTo = [...new Set(payload.appliesTo)]
  if (appliesTo.some(scope => typeof scope !== 'string' || !CLIENT_BRAIN_V2_LEARNING_APPLIES_TO.includes(scope as ClientBrainV2LearningAppliesTo))) throw new ClientBrainV2HttpError('Applies To contains an invalid scope.', 400)
  const evidence = stringValue(payload.evidence, 'Evidence', 8000)
  const notes = stringValue(payload.notes, 'Notes', 12000)
  const firstObserved = dateValue(payload.firstObserved, 'First observed date')
  const lastReinforced = dateValue(payload.lastReinforced, 'Last reinforced date')
  const reviewDate = dateValue(payload.reviewDate, 'Review date')
  const relatedSourceId = stringValue(payload.relatedSourceId, 'Related Source ID', 40)
  if (relatedSourceId && !isUuid(relatedSourceId)) throw new ClientBrainV2HttpError('Invalid related Source ID.', 400)

  let existing: { id: string; updated_at: string; metadata: Record<string, unknown>; provenance: Record<string, unknown> } | null = null
  let recordId = ''
  let expectedUpdatedAt = ''
  if (action === 'update') {
    recordId = stringValue(payload.recordId, 'Learning record ID', 40)
    if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Invalid Learning record ID.', 400)
    expectedUpdatedAt = stringValue(payload.expectedUpdatedAt, 'Edit baseline', 80)
    const result = await clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id, updated_at, metadata, provenance')
      .eq('client_id', clientId)
      .eq('id', recordId)
      .eq('top_section', 'learnings')
      .maybeSingle()
    if (result.error) throw new ClientBrainV2HttpError('Unable to validate the Learning record.', 500)
    if (!result.data) throw new ClientBrainV2HttpError('The Learning record does not belong to this client.', 403)
    existing = result.data
    if (expectedUpdatedAt !== existing.updated_at) {
      throw new ClientBrainV2HttpError('This Learning changed after editing began. Refresh and review the newer values.', 409)
    }
  }

  if (relatedSourceId) {
    const sourceResult = await clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id')
      .eq('client_id', clientId)
      .eq('id', relatedSourceId)
      .eq('top_section', 'sources')
      .maybeSingle()
    if (sourceResult.error) throw new ClientBrainV2HttpError('Unable to validate the related Source.', 500)
    if (!sourceResult.data) throw new ClientBrainV2HttpError('The related Source does not belong to this client.', 403)
  }

  const editorData = {
    learning,
    applies_to: appliesTo,
    origin,
    evidence,
    confidence_level: confidence,
    notes,
  }
  const clearedFields = [
    ...Object.entries(editorData).filter(([, value]) => !meaningfulValue(value)).map(([key]) => key),
    ...Object.entries({ first_observed: firstObserved, last_reinforced: lastReinforced, review_date: reviewDate, notes })
      .filter(([, value]) => !meaningfulValue(value)).map(([key]) => key),
  ]
  const now = new Date().toISOString()
  const change = {
    action,
    record_id: recordId || null,
    expected_updated_at: expectedUpdatedAt || null,
    stable_key: action === 'create' ? `learning:manual:${randomUUID()}` : null,
    subsection: category,
    title,
    content: notes,
    status,
    confidence: learningConfidenceScore(confidence),
    effective_date: firstObserved || null,
    last_verified_at: lastReinforced ? `${lastReinforced}T12:00:00.000Z` : null,
    review_at: reviewDate || null,
    source_type: origin,
    related_source_id: relatedSourceId || null,
    provenance: {
      ...(existing?.provenance ?? {}),
      manual_entry: action === 'create' || Boolean(existing?.provenance?.manual_entry),
      human_confirmed: true,
      authority: 'high',
      origin,
      source_label: 'Manual Learnings Workspace',
      ...(action === 'create' ? { created_via: 'client_brain_v2_learnings_workspace', created_at: now } : { manual_edit: true, edited_at: now }),
    },
    metadata: {
      ...(existing?.metadata ?? {}),
      editor_managed: true,
      editor_data: editorData,
      cleared_fields: clearedFields,
    },
  }

  const result = await clientBrainV2ServerClient.rpc('apply_client_brain_v2_learning_mutation', {
    p_client_id: clientId,
    p_change: change,
  })
  if (result.error) {
    console.error('[client-brain-v2] Learning save failed', { code: result.error.code, message: result.error.message, details: result.error.details })
    const statusCode = result.error.code === 'PT409' ? 409 : result.error.code === 'PT404' ? 404 : result.error.code === 'PT403' ? 403 : result.error.code === 'PT400' ? 400 : 500
    throw new ClientBrainV2HttpError(statusCode === 500 ? 'Unable to save Learning.' : result.error.message, statusCode)
  }

  return { mutation: result.data, ...(await loadClientBrainV2(clientId, 'learnings')) }
}
