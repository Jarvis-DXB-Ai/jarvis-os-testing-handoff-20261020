import {
  CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS,
  CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS,
  CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS,
  CLIENT_BRAIN_V2_OPERATIONS_FIELDS,
  CLIENT_BRAIN_V2_OVERVIEW_FIELDS,
  CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS,
  type ClientBrainV2KnowledgeGapLifecycle,
  type ClientBrainV2KnowledgeGapType,
} from '@/lib/client-brain-v2'

export const CLIENT_BRAIN_V2_EDITABLE_SUBSECTIONS = [
  'overview', 'brand_identity', 'audience', 'visual_dna',
  'commercial_strategy', 'menus', 'activations', 'operations', 'market_intelligence', 'knowledge_gaps',
] as const

export type ClientBrainV2EditableSubsection = typeof CLIENT_BRAIN_V2_EDITABLE_SUBSECTIONS[number]
export type ClientBrainV2EditorKind =
  | 'text'
  | 'textarea'
  | 'list'
  | 'segments'
  | 'rules'
  | 'facts'
  | 'market'
  | 'gaps'
  | 'menus'
  | 'activations'
  | 'status'
  | 'asset_refs'
  | 'source_refs'
  | 'colours'
  | 'applications'

export type ClientBrainV2EditField = {
  id: string
  label: string
  kind: ClientBrainV2EditorKind
  value?: string | null
  values?: string[]
  items?: Array<Record<string, unknown>>
}

export type ClientBrainV2EditBaseline = Record<string, { recordId: string | null; updatedAt: string | null }>

export type ClientBrainV2EditWorkspace = {
  subsection: ClientBrainV2EditableSubsection
  fields: ClientBrainV2EditField[]
  baseline: ClientBrainV2EditBaseline
}

export type ClientBrainV2EditorWorkspace = {
  section?: 'intelligence' | 'brand_guidelines'
  subsection: string
  fields: ClientBrainV2EditField[]
  baseline: ClientBrainV2EditBaseline
}

export type ClientBrainV2EditRequest = {
  subsection: ClientBrainV2EditableSubsection
  fields: ClientBrainV2EditField[]
  baseline: ClientBrainV2EditBaseline
}

export const VISUAL_RULE_STRENGTHS = ['hard_guardrail', 'strong_preference', 'preference'] as const
export const GAP_LIFECYCLES: ClientBrainV2KnowledgeGapLifecycle[] = ['open', 'in_review', 'blocked', 'resolved', 'dismissed', 'superseded']
export const GAP_TYPES: ClientBrainV2KnowledgeGapType[] = ['missing', 'uncertain', 'conflict', 'stale', 'missing_asset', 'missing_source']
export const GAP_AREAS = ['overview', 'brand_identity', 'audience', 'visual_dna', 'commercial_strategy', 'menus', 'activations', 'operations', 'market_intelligence', 'products_offers', 'assets', 'sources', 'learnings'] as const

export const EDIT_FIELD_CONFIG: Record<ClientBrainV2EditableSubsection, Array<{ id: string; label: string; kind: ClientBrainV2EditorKind }>> = {
  overview: CLIENT_BRAIN_V2_OVERVIEW_FIELDS.map(field => ({ ...field, kind: 'textarea' as const })),
  brand_identity: CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS.map(field => ({ ...field, kind: 'textarea' as const })),
  audience: [
    { id: 'segments', label: 'Audience Segments', kind: 'segments' },
    { id: 'needs_motivations', label: 'Needs / Motivations', kind: 'list' },
    { id: 'decision_drivers', label: 'Decision Drivers', kind: 'list' },
    { id: 'occasions_use_cases', label: 'Occasions & Use Cases', kind: 'list' },
    { id: 'geographic_behavioral_context', label: 'Geographic / Behavioural Context', kind: 'list' },
    { id: 'barriers_objections', label: 'Barriers / Objections', kind: 'list' },
  ],
  visual_dna: CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS.map(field => ({
    ...field,
    kind: field.id === 'creative_guardrails' ? 'rules' as const : 'list' as const,
  })),
  commercial_strategy: CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS.map(field => ({ ...field, kind: 'list' as const })),
  menus: [{ id: 'menus', label: 'Menus', kind: 'menus' }],
  activations: [{ id: 'activations', label: 'Activations', kind: 'activations' }],
  operations: CLIENT_BRAIN_V2_OPERATIONS_FIELDS.map(field => ({ ...field, kind: 'facts' as const })),
  market_intelligence: CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS.map(field => ({ ...field, kind: 'market' as const })),
  knowledge_gaps: [{ id: 'gaps', label: 'Knowledge Gaps', kind: 'gaps' }],
}

export function isEditableBrainV2Subsection(value: unknown): value is ClientBrainV2EditableSubsection {
  return typeof value === 'string' && CLIENT_BRAIN_V2_EDITABLE_SUBSECTIONS.includes(value as ClientBrainV2EditableSubsection)
}

export function canonicalFieldStableKey(subsection: ClientBrainV2EditableSubsection, fieldId: string) {
  if (subsection === 'overview' && fieldId === 'positioning') return 'intelligence:brand_identity:positioning'
  return `intelligence:${subsection}:${fieldId}`
}
