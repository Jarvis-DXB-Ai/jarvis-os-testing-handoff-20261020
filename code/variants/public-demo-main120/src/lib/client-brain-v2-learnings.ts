import {
  CLIENT_BRAIN_V2_LEARNING_CATEGORIES,
  CLIENT_BRAIN_V2_LEARNING_STATUSES,
  type ClientBrainV2LearningCategory,
  type ClientBrainV2LearningStatus,
  type ClientBrainV2Record,
} from '@/lib/client-brain-v2'

export const CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const CLIENT_BRAIN_V2_LEARNING_APPLIES_TO = [
  'entire_client', 'social_media', 'instagram', 'linkedin', 'stories', 'reels',
  'captions', 'ai_photography', 'graphic_design', 'video', 'paid_ads',
  'activations', 'menu_offer', 'customer_support', 'other',
] as const
export const CLIENT_BRAIN_V2_LEARNING_ORIGINS = [
  'explicit_user_feedback',
  'client_feedback',
  'approval_rejection_pattern',
  'performance_data',
  'repeated_workflow_observation',
  'inferred_pattern',
  'internal_mc_studios_observation',
] as const

export type ClientBrainV2LearningConfidence = typeof CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS[number]
export type ClientBrainV2LearningAppliesTo = typeof CLIENT_BRAIN_V2_LEARNING_APPLIES_TO[number]
export type ClientBrainV2LearningOrigin = typeof CLIENT_BRAIN_V2_LEARNING_ORIGINS[number]

export type ClientBrainV2LearningEditPayload = {
  section: 'learnings'
  action: 'create' | 'update'
  recordId: string
  expectedUpdatedAt: string
  title: string
  learning: string
  category: ClientBrainV2LearningCategory
  appliesTo: ClientBrainV2LearningAppliesTo[]
  origin: ClientBrainV2LearningOrigin
  evidence: string
  confidence: ClientBrainV2LearningConfidence
  firstObserved: string
  lastReinforced: string
  reviewDate: string
  status: ClientBrainV2LearningStatus
  notes: string
  relatedSourceId: string
}

export type ClientBrainV2LearningOptions = {
  sources: Array<{
    id: string
    title: string
    subsection: string
    status: string
  }>
}

export const CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS: Record<ClientBrainV2LearningCategory, string> = {
  creative_preference: 'Creative Preference',
  copy_preference: 'Copy Preference',
  visual_preference: 'Visual Preference',
  brand_rule: 'Brand Rule',
  audience_insight: 'Audience Insight',
  content_performance: 'Content Performance',
  campaign_performance: 'Campaign Performance',
  offer_performance: 'Offer Performance',
  operational_learning: 'Operational Learning',
  customer_feedback: 'Customer Feedback',
  workflow_learning: 'Workflow Learning',
  other: 'Other',
}

export const CLIENT_BRAIN_V2_LEARNING_STATUS_LABELS: Record<ClientBrainV2LearningStatus, string> = {
  active: 'Active',
  needs_review: 'Needs Review',
  historical: 'Historical',
  rejected: 'Rejected',
}

export const CLIENT_BRAIN_V2_LEARNING_APPLIES_TO_LABELS: Record<ClientBrainV2LearningAppliesTo, string> = {
  entire_client: 'Entire Client', social_media: 'Social Media', instagram: 'Instagram', linkedin: 'LinkedIn',
  stories: 'Stories', reels: 'Reels', captions: 'Captions', ai_photography: 'AI Photography',
  graphic_design: 'Graphic Design', video: 'Video', paid_ads: 'Paid Ads', activations: 'Activations',
  menu_offer: 'Menu / Offer', customer_support: 'Customer Support', other: 'Other',
}

export const CLIENT_BRAIN_V2_LEARNING_ORIGIN_LABELS: Record<ClientBrainV2LearningOrigin, string> = {
  explicit_user_feedback: 'Explicit User Feedback',
  client_feedback: 'Client Feedback',
  approval_rejection_pattern: 'Approval / Rejection Pattern',
  performance_data: 'Performance Data',
  repeated_workflow_observation: 'Repeated Workflow Observation',
  inferred_pattern: 'Inferred Pattern',
  internal_mc_studios_observation: 'Internal / MC Studios Observation',
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const LEGACY_CATEGORY_MAP: Record<string, ClientBrainV2LearningCategory> = {
  creative: 'creative_preference', copy: 'copy_preference', audience: 'audience_insight',
  commercial: 'offer_performance', performance: 'content_performance',
  operational: 'operational_learning', workflow: 'workflow_learning',
}

const LEGACY_STATUS_MAP: Record<string, ClientBrainV2LearningStatus> = {
  contradicted: 'rejected', superseded: 'historical', archived: 'historical',
}

const LEGACY_SCOPE_MAP: Record<string, ClientBrainV2LearningAppliesTo> = {
  'social media': 'social_media', instagram: 'instagram', linkedin: 'linkedin', stories: 'stories',
  reels: 'reels', captions: 'captions', 'ai photography': 'ai_photography',
  'graphic design': 'graphic_design', video: 'video', 'paid ads': 'paid_ads',
  activations: 'activations', 'menu / offer': 'menu_offer', 'customer support': 'customer_support',
  'entire client': 'entire_client',
}

export function learningScopesForRecord(record: Pick<ClientBrainV2Record, 'metadata'>): ClientBrainV2LearningAppliesTo[] {
  const editorData = objectValue(record.metadata?.editor_data)
  const values = Array.isArray(editorData.applies_to) ? editorData.applies_to : []
  const scopes = values.filter((value): value is ClientBrainV2LearningAppliesTo => typeof value === 'string' && CLIENT_BRAIN_V2_LEARNING_APPLIES_TO.includes(value as ClientBrainV2LearningAppliesTo))
  if (scopes.length) return [...new Set(scopes)]
  const legacy = textValue(editorData.applies_to).split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  return [...new Set(legacy.map(value => LEGACY_SCOPE_MAP[value] ?? 'other'))]
}

export function learningScopesLabel(scopes: ClientBrainV2LearningAppliesTo[]) {
  return scopes.length ? scopes.map(scope => CLIENT_BRAIN_V2_LEARNING_APPLIES_TO_LABELS[scope]).join(' · ') : 'Entire Client'
}

export function learningConfidenceScore(level: ClientBrainV2LearningConfidence) {
  if (level === 'high') return 0.9
  if (level === 'medium') return 0.65
  return 0.35
}

export function learningConfidenceForRecord(record: Pick<ClientBrainV2Record, 'confidence' | 'metadata'>): ClientBrainV2LearningConfidence {
  const editorData = record.metadata?.editor_data && typeof record.metadata.editor_data === 'object' && !Array.isArray(record.metadata.editor_data)
    ? record.metadata.editor_data as Record<string, unknown>
    : {}
  const stored = textValue(editorData.confidence_level)
  if (CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS.includes(stored as ClientBrainV2LearningConfidence)) {
    return stored as ClientBrainV2LearningConfidence
  }
  if ((record.confidence ?? 0) >= 0.8) return 'high'
  if ((record.confidence ?? 0) >= 0.55) return 'medium'
  return 'low'
}

export function learningCategoryForRecord(record: Pick<ClientBrainV2Record, 'subsection'>): ClientBrainV2LearningCategory {
  return CLIENT_BRAIN_V2_LEARNING_CATEGORIES.includes(record.subsection as ClientBrainV2LearningCategory)
    ? record.subsection as ClientBrainV2LearningCategory
    : LEGACY_CATEGORY_MAP[record.subsection] ?? 'other'
}

export function learningStatusForRecord(record: Pick<ClientBrainV2Record, 'status'>): ClientBrainV2LearningStatus {
  return CLIENT_BRAIN_V2_LEARNING_STATUSES.includes(record.status as ClientBrainV2LearningStatus)
    ? record.status as ClientBrainV2LearningStatus
    : LEGACY_STATUS_MAP[record.status] ?? 'needs_review'
}

export function learningOriginForRecord(record: Pick<ClientBrainV2Record, 'source_type' | 'metadata' | 'provenance'>): ClientBrainV2LearningOrigin {
  const editorData = objectValue(record.metadata?.editor_data)
  const candidate = textValue(editorData.origin) || textValue(record.source_type) || textValue(record.provenance?.origin)
  return CLIENT_BRAIN_V2_LEARNING_ORIGINS.includes(candidate as ClientBrainV2LearningOrigin)
    ? candidate as ClientBrainV2LearningOrigin
    : 'internal_mc_studios_observation'
}

export function learningEditorData(record: ClientBrainV2Record): ClientBrainV2LearningEditPayload {
  const editorData = record.metadata?.editor_data && typeof record.metadata.editor_data === 'object' && !Array.isArray(record.metadata.editor_data)
    ? record.metadata.editor_data as Record<string, unknown>
    : {}
  const cleared = new Set(Array.isArray(record.metadata?.cleared_fields)
    ? record.metadata.cleared_fields.filter((item): item is string => typeof item === 'string')
    : [])

  return {
    section: 'learnings',
    action: 'update',
    recordId: record.id,
    expectedUpdatedAt: record.updated_at,
    title: record.title,
    learning: textValue(editorData.learning) || record.summary || record.content || '',
    category: learningCategoryForRecord(record),
    appliesTo: cleared.has('applies_to') ? [] : learningScopesForRecord(record),
    origin: learningOriginForRecord(record),
    evidence: cleared.has('evidence') ? '' : textValue(editorData.evidence),
    confidence: learningConfidenceForRecord(record),
    firstObserved: record.effective_date ?? '',
    lastReinforced: record.last_verified_at?.slice(0, 10) ?? '',
    reviewDate: record.review_at ?? '',
    status: learningStatusForRecord(record),
    notes: textValue(editorData.notes) || (textValue(editorData.learning) ? record.content ?? '' : ''),
    relatedSourceId: (record.relationships ?? []).find(item => item.relation_type === 'evidenced_by' && item.record.top_section === 'sources')?.record.id ?? '',
  }
}

export function newLearningDraft(category: string): ClientBrainV2LearningEditPayload {
  return {
    section: 'learnings',
    action: 'create',
    recordId: '',
    expectedUpdatedAt: '',
    title: '',
    learning: '',
    category: CLIENT_BRAIN_V2_LEARNING_CATEGORIES.includes(category as ClientBrainV2LearningCategory)
      ? category as ClientBrainV2LearningCategory
      : 'creative_preference',
    appliesTo: [],
    origin: 'internal_mc_studios_observation',
    evidence: '',
    confidence: 'medium',
    firstObserved: '',
    lastReinforced: '',
    reviewDate: '',
    status: 'active',
    notes: '',
    relatedSourceId: '',
  }
}

export function learningEvidenceCount(record: ClientBrainV2Record) {
  const linkedEvidence = (record.relationships ?? []).filter(item => ['evidenced_by', 'supported_by', 'derived_from'].includes(item.relation_type)).length
  return linkedEvidence + (learningEditorData(record).evidence.trim() ? 1 : 0)
}
