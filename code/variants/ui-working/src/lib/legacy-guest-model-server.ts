import 'server-only'

import { clientBrainV2ServerClient as db, ClientBrainV2HttpError, isUuid } from '@/lib/client-brain-v2-server-core'
import { requireExistingClient } from '@/lib/internal-api-request'

const MODEL_FIELDS = ['id', 'name', 'ethnicity', 'age_range', 'profession', 'personality', 'relationship_type', 'status', 'do_not_modify', 'model_references', 'outfit_sets', 'accessories', 'notes'] as const
const RELATIONSHIP_FIELDS = ['id', 'related_model_id', 'relationship_type', 'relationship_strength', 'notes'] as const

function object(value: unknown, message: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientBrainV2HttpError(message, 400)
  return value as Record<string, unknown>
}
function copyFields(input: Record<string, unknown>, fields: readonly string[]) { return Object.fromEntries(fields.flatMap(field => Object.prototype.hasOwnProperty.call(input, field) ? [[field, input[field]]] : [])) }

export async function loadGuestModels(clientId: string) {
  await requireExistingClient(clientId)
  const [models, relationships] = await Promise.all([
    db.from('guest_models').select('*').eq('client_id', clientId).order('updated_at', { ascending: false }),
    db.from('guest_model_relationships').select('*').eq('client_id', clientId).order('updated_at', { ascending: false }),
  ])
  if (models.error || relationships.error) throw new ClientBrainV2HttpError('Unable to load guest models.', 500)
  return { models: models.data ?? [], relationships: relationships.data ?? [] }
}

export async function saveGuestModel(clientId: string, raw: unknown) {
  await requireExistingClient(clientId)
  const input = object(raw, 'Invalid guest model payload.')
  const model = object(input.model, 'Invalid guest model payload.')
  if (!isUuid(String(model.id ?? ''))) throw new ClientBrainV2HttpError('Invalid guest model ID.', 400)
  const relationshipInput = Array.isArray(input.relationships) ? input.relationships : []
  const relationshipRows = relationshipInput.map(item => {
    const relationship = object(item, 'Invalid guest model relationship.')
    const relatedModelId = String(relationship.related_model_id ?? '')
    if (!isUuid(relatedModelId) || relatedModelId === model.id) throw new ClientBrainV2HttpError('Invalid guest model relationship.', 400)
    return { ...copyFields(relationship, RELATIONSHIP_FIELDS), client_id: clientId, model_id: model.id, related_model_id: relatedModelId }
  })
  const relatedIds = [...new Set(relationshipRows.map(row => String(row.related_model_id)))]
  if (relatedIds.length) {
    const { data: related, error } = await db.from('guest_models').select('id').eq('client_id', clientId).in('id', relatedIds)
    if (error || (related?.length ?? 0) !== relatedIds.length) throw new ClientBrainV2HttpError('Related guest model does not belong to this client.', 404)
  }
  const payload = { ...copyFields(model, MODEL_FIELDS), client_id: clientId, updated_at: new Date().toISOString() }
  const existing = await db.from('guest_models').select('id').eq('id', String(model.id)).maybeSingle()
  if (existing.error) throw new ClientBrainV2HttpError('Unable to validate guest model.', 500)
  if (existing.data) {
    const { data: owned, error } = await db.from('guest_models').select('id').eq('id', String(model.id)).eq('client_id', clientId).maybeSingle()
    if (error || !owned) throw new ClientBrainV2HttpError('Guest model does not belong to this client.', 404)
  }
  const { data: saved, error: saveError } = await db.from('guest_models').upsert(payload, { onConflict: 'id' }).select('*').single()
  if (saveError || !saved) throw new ClientBrainV2HttpError('Unable to save guest model.', 500)
  const { error: deleteError } = await db.from('guest_model_relationships').delete().eq('client_id', clientId).eq('model_id', saved.id)
  if (deleteError) throw new ClientBrainV2HttpError('Unable to replace guest model relationships.', 500)
  if (relationshipRows.length) {
    const { error } = await db.from('guest_model_relationships').insert(relationshipRows)
    if (error) throw new ClientBrainV2HttpError('Unable to save guest model relationships.', 500)
  }
  return { model: saved, relationships: relationshipRows }
}

export async function deleteGuestModel(clientId: string, modelId: string) {
  await requireExistingClient(clientId)
  if (!isUuid(modelId)) throw new ClientBrainV2HttpError('Invalid guest model ID.', 400)
  const { data: model, error: loadError } = await db.from('guest_models').select('id').eq('id', modelId).eq('client_id', clientId).maybeSingle()
  if (loadError) throw new ClientBrainV2HttpError('Unable to validate guest model.', 500)
  if (!model) throw new ClientBrainV2HttpError('Guest model does not belong to this client.', 404)
  const { error } = await db.from('guest_models').delete().eq('id', modelId).eq('client_id', clientId)
  if (error) throw new ClientBrainV2HttpError('Unable to delete guest model.', 500)
}
