import 'server-only'

import { clientBrainV2ServerClient as db, ClientBrainV2HttpError, isUuid } from '@/lib/client-brain-v2-server-core'
import { requireExistingClient } from '@/lib/internal-api-request'

const ANSWER_STATUSES = new Set(['missing', 'pending', 'verified', 'assumed', 'outdated', 'needs_confirmation'])
const SOURCE_TYPES = new Set(['external_audit', 'client_input', 'file_upload', 'manual', 'assumed'])

function stringOrNull(value: unknown, max = 10_000) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new ClientBrainV2HttpError('Invalid Blueprint value.', 400)
  return value.trim().slice(0, max) || null
}

async function clientBlueprint(clientId: string, blueprintId: string) {
  if (!isUuid(blueprintId)) throw new ClientBrainV2HttpError('Invalid Blueprint ID.', 400)
  const { data, error } = await db.from('client_blueprints').select('*').eq('id', blueprintId).eq('client_id', clientId).maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load Blueprint.', 500)
  if (!data) throw new ClientBrainV2HttpError('Blueprint does not belong to this client.', 404)
  return data
}

async function refreshCompletion(clientId: string, blueprintId: string) {
  const [answersResult, templatesResult] = await Promise.all([
    db.from('blueprint_answers').select('question_key,status').eq('client_id', clientId).eq('blueprint_id', blueprintId),
    db.from('blueprint_templates').select('question_key,is_required'),
  ])
  if (answersResult.error || templatesResult.error) throw new ClientBrainV2HttpError('Unable to calculate Blueprint completion.', 500)
  const required = new Set((templatesResult.data ?? []).filter(template => template.is_required).map(template => template.question_key))
  const verified = (answersResult.data ?? []).filter(answer => required.has(answer.question_key) && answer.status === 'verified').length
  const completionPct = required.size ? Math.round((verified / required.size) * 100) : 0
  const { error } = await db.from('client_blueprints').update({ completion_pct: completionPct }).eq('id', blueprintId).eq('client_id', clientId)
  if (error) throw new ClientBrainV2HttpError('Unable to update Blueprint completion.', 500)
  return completionPct
}

export async function loadClientBlueprint(clientId: string, industry = 'restaurant_hospitality') {
  const client = await requireExistingClient(clientId)
  const [{ data: blueprint, error: blueprintError }, { data: templates, error: templatesError }] = await Promise.all([
    db.from('client_blueprints').select('*').eq('client_id', clientId).eq('industry', industry).maybeSingle(),
    db.from('blueprint_templates').select('*').eq('industry', industry).order('section_index').order('id'),
  ])
  if (blueprintError || templatesError) throw new ClientBrainV2HttpError('Unable to load Blueprint.', 500)
  const answersResult = blueprint
    ? await db.from('blueprint_answers').select('*').eq('client_id', clientId).eq('blueprint_id', blueprint.id).order('section_index').order('id')
    : { data: [], error: null }
  if (answersResult.error) throw new ClientBrainV2HttpError('Unable to load Blueprint answers.', 500)
  return { client, blueprint, templates: templates ?? [], answers: answersResult.data ?? [] }
}

export async function initializeClientBlueprint(clientId: string, industry = 'restaurant_hospitality') {
  await requireExistingClient(clientId)
  const existing = await db.from('client_blueprints').select('*').eq('client_id', clientId).eq('industry', industry).maybeSingle()
  if (existing.error) throw new ClientBrainV2HttpError('Unable to load Blueprint.', 500)
  if (existing.data) return loadClientBlueprint(clientId, industry)
  const { data: templates, error: templatesError } = await db.from('blueprint_templates').select('*').eq('industry', industry).order('section_index').order('id')
  if (templatesError) throw new ClientBrainV2HttpError('Unable to load Blueprint template.', 500)
  const { data: blueprint, error: blueprintError } = await db.from('client_blueprints').insert({ client_id: clientId, industry, status: 'active' }).select('*').single()
  if (blueprintError || !blueprint) throw new ClientBrainV2HttpError('Unable to initialize Blueprint.', 500)
  const rows = (templates ?? []).map(template => ({ blueprint_id: blueprint.id, client_id: clientId, template_id: template.id, industry, section_index: template.section_index, section_title: template.section_title, question_key: template.question_key, question_text: template.question_text, is_client_facing: template.is_client_facing, is_memory_eligible: template.is_memory_eligible, status: 'missing' }))
  if (rows.length) {
    const { error } = await db.from('blueprint_answers').insert(rows)
    if (error) throw new ClientBrainV2HttpError('Blueprint was initialized but answers could not be seeded.', 500)
  }
  return loadClientBlueprint(clientId, industry)
}

export async function saveBlueprintAnswer(clientId: string, input: Record<string, unknown>) {
  const blueprintId = typeof input.blueprintId === 'string' ? input.blueprintId : ''
  const answerId = typeof input.answerId === 'string' ? input.answerId : ''
  await requireExistingClient(clientId)
  await clientBlueprint(clientId, blueprintId)
  if (!isUuid(answerId)) throw new ClientBrainV2HttpError('Invalid Blueprint answer ID.', 400)
  const { data: answer, error: answerError } = await db.from('blueprint_answers').select('*').eq('id', answerId).eq('client_id', clientId).eq('blueprint_id', blueprintId).maybeSingle()
  if (answerError) throw new ClientBrainV2HttpError('Unable to load Blueprint answer.', 500)
  if (!answer) throw new ClientBrainV2HttpError('Blueprint answer does not belong to this client.', 404)
  const status = typeof input.status === 'string' && ANSWER_STATUSES.has(input.status) ? input.status : null
  const sourceType = typeof input.sourceType === 'string' && SOURCE_TYPES.has(input.sourceType) ? input.sourceType : null
  if (!status || !sourceType) throw new ClientBrainV2HttpError('Invalid Blueprint answer state.', 400)
  const now = new Date().toISOString()
  const history = Array.isArray(answer.answer_history) ? answer.answer_history : []
  const entry = { at: now, from_status: answer.status, to_status: status, previous_answer: answer.answer_final }
  const patch = {
    answer_final: stringOrNull(input.answerFinal),
    answer_raw: stringOrNull(input.answerRaw),
    source: stringOrNull(input.source, 1_000),
    source_type: sourceType,
    status,
    updated_at: now,
    reviewed_at: status === 'verified' ? now : answer.status === 'verified' ? null : answer.reviewed_at,
    answer_history: [...history, entry],
  }
  const { data: saved, error: saveError } = await db.from('blueprint_answers').update(patch).eq('id', answerId).eq('client_id', clientId).eq('blueprint_id', blueprintId).select('*').single()
  if (saveError || !saved) throw new ClientBrainV2HttpError('Unable to save Blueprint answer.', 500)
  const completionPct = await refreshCompletion(clientId, blueprintId)
  return { answer: saved, completionPct }
}
