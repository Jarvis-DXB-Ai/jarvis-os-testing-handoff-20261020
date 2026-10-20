import type { ClientBrainV2Record } from '@/lib/client-brain-v2'

export const CLIENT_BRAIN_V2_SOURCE_TYPES = [
  'official_document',
  'client_provided',
  'official_website',
  'official_social',
  'activation_creative',
  'review_public_feedback',
  'research_web',
  'competitor_source',
  'internal_working',
  'other',
] as const

export const CLIENT_BRAIN_V2_SOURCE_STATUSES = ['current', 'needs_review', 'historical', 'superseded'] as const
export const CLIENT_BRAIN_V2_SOURCE_TRUSTS = ['high', 'medium', 'low', 'unknown'] as const
export const CLIENT_BRAIN_V2_SOURCE_AUTHORITIES = [
  'brand',
  'menu',
  'activation_offer',
  'operations',
  'visual',
  'customer_sentiment',
  'market_intelligence',
  'competitor_intelligence',
  'other',
] as const
export const CLIENT_BRAIN_V2_SOURCE_KINDS = ['file', 'url', 'manual'] as const

export type ClientBrainV2SourceType = typeof CLIENT_BRAIN_V2_SOURCE_TYPES[number]
export type ClientBrainV2SourceStatus = typeof CLIENT_BRAIN_V2_SOURCE_STATUSES[number]
export type ClientBrainV2SourceTrust = typeof CLIENT_BRAIN_V2_SOURCE_TRUSTS[number]
export type ClientBrainV2SourceAuthority = typeof CLIENT_BRAIN_V2_SOURCE_AUTHORITIES[number]
export type ClientBrainV2SourceKind = typeof CLIENT_BRAIN_V2_SOURCE_KINDS[number]

export type ClientBrainV2SourceEditPayload = {
  section: 'sources'
  recordId: string
  expectedUpdatedAt: string
  name: string
  sourceType: ClientBrainV2SourceType
  sourceKind: ClientBrainV2SourceKind
  status: ClientBrainV2SourceStatus
  trust: ClientBrainV2SourceTrust
  authorityScopes: ClientBrainV2SourceAuthority[]
  lastVerified: string
  externalUrl: string
  notes: string
  supersededById: string | null
}

export type ClientBrainV2SourceCreatePayload = Omit<ClientBrainV2SourceEditPayload, 'recordId' | 'expectedUpdatedAt'> & {
  relationshipTargetIds?: string[]
}

export const CLIENT_BRAIN_V2_SOURCE_TYPE_LABELS: Record<ClientBrainV2SourceType, string> = {
  official_document: 'Official Document',
  client_provided: 'Client Provided',
  official_website: 'Official Website',
  official_social: 'Official Social',
  activation_creative: 'Activation Creative',
  review_public_feedback: 'Review / Public Feedback',
  research_web: 'Research / Web',
  competitor_source: 'Competitor Source',
  internal_working: 'Internal / Working',
  other: 'Other',
}

export const CLIENT_BRAIN_V2_SOURCE_STATUS_LABELS: Record<ClientBrainV2SourceStatus, string> = {
  current: 'Current',
  needs_review: 'Needs Review',
  historical: 'Historical',
  superseded: 'Superseded',
}

export const CLIENT_BRAIN_V2_SOURCE_TRUST_LABELS: Record<ClientBrainV2SourceTrust, string> = {
  high: 'High Trust',
  medium: 'Medium Trust',
  low: 'Low Trust',
  unknown: 'Trust Unknown',
}

export const CLIENT_BRAIN_V2_SOURCE_AUTHORITY_LABELS: Record<ClientBrainV2SourceAuthority, string> = {
  brand: 'Brand',
  menu: 'Menu',
  activation_offer: 'Activation / Offer',
  operations: 'Operations',
  visual: 'Visual',
  customer_sentiment: 'Customer Sentiment',
  market_intelligence: 'Market Intelligence',
  competitor_intelligence: 'Competitor Intelligence',
  other: 'Other',
}

const LEGACY_TYPE_MAP: Record<string, ClientBrainV2SourceType> = {
  document: 'official_document',
  official_digital: 'official_website',
  internal_mc_studios: 'internal_working',
  external_research: 'research_web',
  system_derived: 'internal_working',
  legacy_client_knowledge: 'internal_working',
}

const LEGACY_STATUS_MAP: Record<string, ClientBrainV2SourceStatus> = {
  unverified: 'needs_review',
  conflicting: 'needs_review',
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function trustFromConfidence(value: number | null) {
  if (value == null) return 'unknown' as const
  if (value >= 0.8) return 'high' as const
  if (value >= 0.55) return 'medium' as const
  return 'low' as const
}

function sourceV2(record: ClientBrainV2Record) {
  return objectValue(record.metadata.source_v2)
}

export function sourceTypeForRecord(record: Pick<ClientBrainV2Record, 'source_type' | 'subsection' | 'metadata'>): ClientBrainV2SourceType {
  const type = objectValue(record.metadata).source_v2 && objectValue(objectValue(record.metadata).source_v2).type
  if (CLIENT_BRAIN_V2_SOURCE_TYPES.includes(type as ClientBrainV2SourceType)) return type as ClientBrainV2SourceType
  if (CLIENT_BRAIN_V2_SOURCE_TYPES.includes(record.source_type as ClientBrainV2SourceType)) return record.source_type as ClientBrainV2SourceType
  if (record.source_type && LEGACY_TYPE_MAP[record.source_type]) return LEGACY_TYPE_MAP[record.source_type]
  if (record.subsection === 'documents') return 'official_document'
  if (record.subsection === 'official_digital') return 'official_website'
  if (record.subsection === 'external_research') return 'research_web'
  if (record.subsection === 'internal_mc_studios') return 'internal_working'
  return 'other'
}

export function sourceStatusForRecord(record: Pick<ClientBrainV2Record, 'status'>): ClientBrainV2SourceStatus {
  if (CLIENT_BRAIN_V2_SOURCE_STATUSES.includes(record.status as ClientBrainV2SourceStatus)) return record.status as ClientBrainV2SourceStatus
  return LEGACY_STATUS_MAP[record.status] ?? 'needs_review'
}

export function sourceTrustForRecord(record: Pick<ClientBrainV2Record, 'confidence' | 'metadata'>): ClientBrainV2SourceTrust {
  const trust = sourceV2(record as ClientBrainV2Record).trust
  return CLIENT_BRAIN_V2_SOURCE_TRUSTS.includes(trust as ClientBrainV2SourceTrust)
    ? trust as ClientBrainV2SourceTrust
    : trustFromConfidence(record.confidence)
}

export function sourceAuthorityForRecord(record: Pick<ClientBrainV2Record, 'metadata'>): ClientBrainV2SourceAuthority[] {
  const values = sourceV2(record as ClientBrainV2Record).authority_scopes
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is ClientBrainV2SourceAuthority => CLIENT_BRAIN_V2_SOURCE_AUTHORITIES.includes(value as ClientBrainV2SourceAuthority)))]
}

export function sourceKindForRecord(record: Pick<ClientBrainV2Record, 'metadata' | 'files'>): ClientBrainV2SourceKind {
  const kind = sourceV2(record as ClientBrainV2Record).kind
  if (CLIENT_BRAIN_V2_SOURCE_KINDS.includes(kind as ClientBrainV2SourceKind)) return kind as ClientBrainV2SourceKind
  const url = sourceExternalUrl(record as ClientBrainV2Record)
  return record.files?.length ? 'file' : url ? 'url' : 'manual'
}

export function sourceExternalUrl(record: Pick<ClientBrainV2Record, 'metadata'>) {
  const v2 = sourceV2(record as ClientBrainV2Record)
  return textValue(v2.url) || textValue(objectValue(record.metadata.editor_data).external_url) || textValue(record.metadata.external_url) || textValue(record.metadata.url)
}

export function sourceEditorData(record: ClientBrainV2Record): ClientBrainV2SourceEditPayload {
  return {
    section: 'sources',
    recordId: record.id,
    expectedUpdatedAt: record.updated_at,
    name: record.title,
    sourceType: sourceTypeForRecord(record),
    sourceKind: sourceKindForRecord(record),
    status: sourceStatusForRecord(record),
    trust: sourceTrustForRecord(record),
    authorityScopes: sourceAuthorityForRecord(record),
    lastVerified: record.last_verified_at?.slice(0, 10) ?? '',
    externalUrl: sourceExternalUrl(record),
    notes: record.content ?? '',
    supersededById: record.superseded_by_id,
  }
}

export function sourceTrustScore(trust: ClientBrainV2SourceTrust) {
  if (trust === 'high') return 0.9
  if (trust === 'medium') return 0.65
  if (trust === 'low') return 0.35
  return null
}
