import { createHash } from 'node:crypto'

export type CaptionWritingGuide = {
  recordId: string
  version: string
  documentSha256: string
  snapshotSha256: string
  sourceUpdatedAt: string
  scope: 'caption_style_only'
  rules: Record<string, string>
  examples: string[]
}

export const WRITING_GUIDE_SOURCE_KEY = 'writing_guide_source_id'
export const WRITING_GUIDE_VERSION_KEY = 'writing_guide_version'
const ruleIds = new Set(['core_voice', 'structure_length', 'hooks', 'emoji_rules', 'cta_rules', 'italian_language', 'encouraged_language', 'food', 'pizza', 'ingredients', 'lifestyle_venue', 'people_playful', 'dogs', 'drinks', 'events', 'activations', 'recent_repetition_rules'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Explicit selection only: never discover a guide by title or another client's examples. */
export function writingGuideSelection(guidelines: Record<string, unknown>) {
  const id = guidelines[WRITING_GUIDE_SOURCE_KEY]
  const version = guidelines[WRITING_GUIDE_VERSION_KEY]
  if (id === undefined && version === undefined) return null
  if (typeof id !== 'string' || !uuid.test(id) || typeof version !== 'string' || !/^v[1-9][0-9]*$/.test(version)) {
    throw new Error('Writing guide selection is incomplete. Select a saved guide and version before generating captions.')
  }
  return { id, version }
}

export function resolveCaptionWritingGuide(clientId: string, selection: { id: string; version: string }, value: unknown): CaptionWritingGuide {
  const record = object(value)
  const snapshot = object(object(record.metadata).caption_writing_guide)
  const fail = () => { throw new Error('The selected writing guide is missing, changed or not approved for captions. Review its saved version before generating.') }
  if (record.id !== selection.id || record.client_id !== clientId || record.top_section !== 'sources' || record.status !== 'current' || record.superseded_by_id) return fail()
  if (snapshot.version !== selection.version || snapshot.status !== 'approved_for_captions' || snapshot.scope !== 'caption_style_only') return fail()
  if (typeof record.content !== 'string' || !record.content.trim() || record.content.length > 12000 || typeof record.updated_at !== 'string') return fail()
  const documentSha256 = createHash('sha256').update(record.content).digest('hex')
  if (snapshot.document_sha256 !== documentSha256) return fail()
  const rules = object(snapshot.rules)
  if (!Object.keys(rules).length || !rules.core_voice || !rules.structure_length) return fail()
  if (Object.entries(rules).some(([key, text]) => !ruleIds.has(key) || typeof text !== 'string' || !text.trim() || text.length > 2000)) return fail()
  if (!Array.isArray(snapshot.examples) || snapshot.examples.length > 12 || snapshot.examples.some(text => typeof text !== 'string' || !text.trim() || text.length > 500)) return fail()
  if (JSON.stringify({ rules, examples: snapshot.examples }).length > 12000) return fail()
  return {
    recordId: selection.id, version: selection.version, documentSha256,
    snapshotSha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    sourceUpdatedAt: record.updated_at, scope: 'caption_style_only',
    rules: rules as Record<string, string>, examples: snapshot.examples as string[],
  }
}
