import 'server-only'

import {
  CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS,
  CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS,
  CLIENT_BRAIN_V2_KNOWLEDGE_GAP_TYPES,
  CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS,
  CLIENT_BRAIN_V2_OPERATIONS_FIELDS,
  CLIENT_BRAIN_V2_OVERVIEW_FIELDS,
  CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS,
  isRestaurantClientBrainV2,
  type ClientBrainV2Audience,
  type ClientBrainV2AudienceFieldId,
  type ClientBrainV2BrandIdentity,
  type ClientBrainV2BrandIdentityFieldId,
  type ClientBrainV2CommercialStrategy,
  type ClientBrainV2CommercialStrategyFieldId,
  type ClientBrainV2CommercialStrategyGap,
  type ClientBrainV2CommercialStrategyObject,
  type ClientBrainV2CommercialStrategySource,
  type ClientBrainV2CommercialStrategyState,
  type ClientBrainV2CommercialDetail,
  type ClientBrainV2CommercialGap,
  type ClientBrainV2CommercialRelationship,
  type ClientBrainV2File,
  type ClientBrainV2Overview,
  type ClientBrainV2OverviewFieldId,
  type ClientBrainV2OverviewSource,
  type ClientBrainV2Competitor,
  type ClientBrainV2MarketGap,
  type ClientBrainV2MarketIntelligence,
  type ClientBrainV2MarketIntelligenceFieldId,
  type ClientBrainV2MarketIntelligenceState,
  type ClientBrainV2MarketSignal,
  type ClientBrainV2MarketSource,
  type ClientBrainV2KnowledgeGapItem,
  type ClientBrainV2KnowledgeGapLifecycle,
  type ClientBrainV2KnowledgeGapPriority,
  type ClientBrainV2KnowledgeGapType,
  type ClientBrainV2KnowledgeGapWorkspace,
  type ClientBrainV2Operations,
  type ClientBrainV2OperationsFieldId,
  type ClientBrainV2OperationsGap,
  type ClientBrainV2OperationsObject,
  type ClientBrainV2OperationsSource,
  type ClientBrainV2OperationsState,
  type ClientBrainV2Record,
  type ClientBrainV2RecordRelationship,
  type ClientBrainV2RecordVersion,
  type ClientBrainV2Section,
  type ClientBrainV2VisualAssetReference,
  type ClientBrainV2VisualDna,
  type ClientBrainV2VisualDnaFieldId,
} from '@/lib/client-brain-v2'
import { resolveActivationFreshness } from '@/lib/client-brain-v2-activation-freshness'
import { loadRestaurantClientBrainV2AssetList } from '@/lib/client-brain-v2-assets-server'
import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient,
  isUuid,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server-core'
export {
  ClientBrainV2HttpError,
  clientBrainV2ErrorResponse,
  clientBrainV2ServerClient,
  isUuid,
  requireClientBrainV2,
} from '@/lib/client-brain-v2-server-core'
import {
  buildBrandGuidelineWorkspaces,
  type ClientBrainV2BrandGuidelineOption,
  type ClientBrainV2BrandGuidelineOptions,
} from '@/lib/client-brain-v2-brand-guidelines'
import {
  canonicalFieldStableKey,
  type ClientBrainV2EditField,
  type ClientBrainV2EditWorkspace,
  type ClientBrainV2EditableSubsection,
} from '@/lib/client-brain-v2-edit'
import type { ClientBrainV2LearningOptions } from '@/lib/client-brain-v2-learnings'

type OverviewRecord = Pick<
  ClientBrainV2Record,
  'id' | 'stable_key' | 'top_section' | 'subsection' | 'record_type' | 'title' | 'summary' | 'content' | 'status' | 'confidence' | 'priority' | 'knowledge_class' | 'effective_date' | 'last_verified_at' | 'valid_until' | 'review_at' | 'source_type' | 'superseded_by_id' | 'metadata' | 'updated_at'
>

type CommercialObjectRecord = OverviewRecord & {
  commercial: {
    object_type: string
    price_amount: number | null
    currency: string | null
    availability: string | null
    capacity: number | null
    booking_requirements: string | null
  } | null
}

const TRUSTED_OVERVIEW_STATUSES = new Set(['approved', 'current', 'active'])

function overviewRecord(records: OverviewRecord[], title: string, allowNeedsReview = false) {
  return records.find(record => (
    record.title === title
    && (TRUSTED_OVERVIEW_STATUSES.has(record.status) || (allowNeedsReview && record.status === 'needs_review'))
  )) ?? null
}

function firstSentence(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  const boundary = normalized.search(/\.\s/)
  return boundary === -1 ? normalized : normalized.slice(0, boundary + 1)
}

function sentenceRemainder(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  const boundary = normalized.search(/\.\s/)
  return boundary === -1 ? null : normalized.slice(boundary + 2).trim() || null
}

function sentenceCase(value: string | null) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : null
}

function labelledParagraph(value: string | null | undefined, label: string) {
  const paragraph = (value ?? '')
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .find(item => item.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  return paragraph?.slice(label.length + 1).trim() || null
}

function firstBulletAfterLabel(value: string | null | undefined, label: string) {
  const lines = (value ?? '').split('\n').map(line => line.trim())
  const labelIndex = lines.findIndex(line => line.toLowerCase() === `${label.toLowerCase()}:`)
  if (labelIndex === -1) return null
  const bullet = lines.slice(labelIndex + 1).find(line => line.startsWith('- '))
  return bullet?.slice(2).trim() || null
}

function overviewSource(record: OverviewRecord | null): ClientBrainV2OverviewSource | null {
  if (!record) return null
  return {
    record_id: record.id,
    title: record.title,
    status: record.status,
    confidence: record.confidence == null ? null : Number(record.confidence),
    knowledge_class: record.knowledge_class,
    last_verified_at: record.last_verified_at,
    review_at: record.review_at,
    source_type: record.source_type,
    updated_at: record.updated_at,
  }
}

function buildClientOverview(client: { name: string; industry: string | null }, records: OverviewRecord[]): ClientBrainV2Overview {
  const executive = overviewRecord(records, 'Executive Summary')
  const brandIdentity = overviewRecord(records, 'Brand Identity')
  const positioning = overviewRecord(records, 'Brand Positioning Analysis')
  const location = overviewRecord(records, 'Location & Access', true)

  const executiveSummary = executive?.summary || executive?.content
  const executiveSentence = firstSentence(executiveSummary)
  const venueType = executiveSentence
    ?.replace(/^.+?\bis an?\s+/i, '')
    .replace(/\s+in\s+[^.]+\.?$/i, '')
    .replace(/\.$/, '') || null

  const locationBullet = firstBulletAfterLabel(location?.content, 'Known location truth')
  const locationValue = locationBullet
    ?.replace(/^.+?\bis located at\s+/i, '')
    .replace(/\.$/, '') || null
  const locationContext = firstSentence(labelledParagraph(location?.content, 'Verification note'))?.replace(/^-\s*/, '') ?? null

  const positioningText = labelledParagraph(positioning?.content, 'Primary positioning recommendation')
  const propositionText = brandIdentity?.summary?.replace(/^Core brand:\s*/i, '') ?? null
  const experienceText = labelledParagraph(brandIdentity?.content, 'Emotional positioning')
  const differentiatorsText = labelledParagraph(positioning?.content, 'Strengths')
  const executiveParagraphs = (executive?.content ?? '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const contextText = executiveParagraphs.at(-1) ?? null

  const labelFor = (id: ClientBrainV2OverviewFieldId) => (
    CLIENT_BRAIN_V2_OVERVIEW_FIELDS.find(field => field.id === id)?.label ?? id
  )
  const field = (
    id: ClientBrainV2OverviewFieldId,
    value: string | null,
    supportingContext: string | null,
    sourceRecord: OverviewRecord | null,
  ) => ({
    id,
    label: labelFor(id),
    value,
    supporting_context: supportingContext,
    source: overviewSource(sourceRecord),
  })

  const fields = [
    field('business_venue', client.name || null, client.industry, null),
    field('venue_type', sentenceCase(venueType), null, executive),
    field('location', locationValue, locationContext, location),
    field('positioning', firstSentence(positioningText), sentenceRemainder(positioningText), positioning),
    field('core_proposition', sentenceCase(firstSentence(propositionText)), sentenceRemainder(propositionText), brandIdentity),
    field('primary_experience', sentenceCase(firstSentence(experienceText)), sentenceRemainder(experienceText), brandIdentity),
    field('key_differentiators', sentenceCase(differentiatorsText), null, positioning),
    field('current_context', firstSentence(contextText), sentenceRemainder(contextText), executive),
  ]
  const sources = [...new Map(
    fields.flatMap(item => item.source ? [[item.source.record_id, item.source] as const] : []),
  ).values()]

  return { fields, sources }
}

const BRAND_IDENTITY_GAP_KEYS: Partial<Record<ClientBrainV2BrandIdentityFieldId, string>> = {
  mission_purpose: 'knowledge_gap:brand_identity:mission_purpose',
  brand_promise: 'knowledge_gap:brand_identity:brand_promise',
  values: 'knowledge_gap:brand_identity:values',
}

function metadataString(record: OverviewRecord, key: string) {
  const value = record.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildBrandIdentity(records: OverviewRecord[]): ClientBrainV2BrandIdentity {
  const executive = overviewRecord(records, 'Executive Summary')
  const brandIdentity = overviewRecord(records, 'Brand Identity')
  const positioning = overviewRecord(records, 'Brand Positioning Analysis')
  const positioningText = labelledParagraph(positioning?.content, 'Primary positioning recommendation')
  const coreBrandText = labelledParagraph(brandIdentity?.content, 'Core brand')
  const personalityText = labelledParagraph(brandIdentity?.content, 'Brand personality')
  const executiveParagraphs = (executive?.content ?? '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const messageArchitecture = executiveParagraphs[1]
    ?.replace(/^Jarvis OS should treat [^:]+:\s*/i, '')
    .trim() || null
  const differentiators = labelledParagraph(positioning?.content, 'Strengths')

  const labelFor = (id: ClientBrainV2BrandIdentityFieldId) => (
    CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS.find(field => field.id === id)?.label ?? id
  )
  const groupFor = (id: ClientBrainV2BrandIdentityFieldId) => (
    CLIENT_BRAIN_V2_BRAND_IDENTITY_FIELDS.find(field => field.id === id)?.group ?? 'brand_position'
  )
  const gapFor = (id: ClientBrainV2BrandIdentityFieldId) => {
    const stableKey = BRAND_IDENTITY_GAP_KEYS[id]
    if (!stableKey) return null
    const record = records.find(item => item.stable_key === stableKey && item.record_type === 'knowledge_gap')
    if (!record) return null
    return {
      record_id: record.id,
      title: record.title,
      status: record.status,
      priority: record.priority,
      why_it_matters: metadataString(record, 'why_it_matters'),
      recommended_resolution: metadataString(record, 'recommended_resolution'),
    }
  }
  const field = (
    id: ClientBrainV2BrandIdentityFieldId,
    value: string | null,
    supportingContext: string | null,
    sourceRecords: Array<OverviewRecord | null>,
  ) => {
    const sources = sourceRecords.filter((record): record is OverviewRecord => Boolean(record)).map(overviewSource)
      .filter((source): source is ClientBrainV2OverviewSource => Boolean(source))
    const gap = gapFor(id)
    return {
      id,
      label: labelFor(id),
      group: groupFor(id),
      value,
      supporting_context: supportingContext,
      state: value ? 'supported' as const : gap ? 'needs_confirmation' as const : 'not_defined' as const,
      sources,
      gap,
    }
  }

  const fields = [
    field('positioning', firstSentence(positioningText), sentenceRemainder(positioningText), [positioning]),
    field('mission_purpose', null, null, []),
    field('brand_promise', null, null, []),
    field('personality', sentenceCase(firstSentence(personalityText)), null, [brandIdentity]),
    field('values', null, null, []),
    field('tone_of_voice', sentenceCase(sentenceRemainder(personalityText)), null, [brandIdentity]),
    field('messaging_pillars', sentenceCase(messageArchitecture), null, [executive]),
    field('differentiators', sentenceCase(differentiators), null, [positioning]),
    field('brand_is', sentenceCase(firstSentence(coreBrandText)), null, [brandIdentity]),
    field('brand_is_not', sentenceCase(sentenceRemainder(coreBrandText)), null, [brandIdentity]),
  ]
  const sources = [...new Map(
    fields.flatMap(item => item.sources.map(source => [source.record_id, source] as const)),
  ).values()]

  return { fields, sources }
}

function labelledListText(value: string | null | undefined, label: string) {
  const section = labelledParagraph(value, label)
  if (!section) return null
  return section
    .split('\n')
    .map(line => line.trim().replace(/^-\s*/, ''))
    .filter(Boolean)
    .join(' ')
}

function labelledBullets(value: string | null | undefined, label: string) {
  const lines = (value ?? '').split('\n').map(line => line.trim())
  const start = lines.findIndex(line => line.toLowerCase() === `${label.toLowerCase()}:`)
  if (start === -1) return []
  const values: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line) break
    if (!line.startsWith('- ')) break
    values.push(line.slice(2).trim())
  }
  return values
}

function buildAudience(records: OverviewRecord[]): ClientBrainV2Audience {
  const audienceRecords = records.filter(record => (
    record.record_type === 'intelligence'
    && TRUSTED_OVERVIEW_STATUSES.has(record.status)
    && record.title !== 'Audience Psychology'
    && ['Business Bay Professionals', 'Affluent Residents', 'Couples / Date Night Guests', 'Italian Community', 'Social Groups & Celebrations'].includes(record.title)
  ))
  const psychology = overviewRecord(records, 'Audience Psychology')
  const location = overviewRecord(records, 'Location & Access', true)
  const barriersGap = records.find(record => (
    record.record_type === 'knowledge_gap'
    && record.status === 'active'
    && record.title === 'Customer Objections And Complaint Patterns'
  )) ?? null

  const segments = audienceRecords.map(record => ({
    id: record.id,
    name: record.title,
    description: labelledListText(record.content, 'Who they are'),
    importance: record.priority >= 5 ? 'primary' as const : record.priority >= 4 ? 'secondary' as const : 'unconfirmed' as const,
    motivation: labelledListText(record.content, 'Motivations'),
    occasions: labelledListText(record.content, 'Dining behavior'),
    source: overviewSource(record)!,
  }))

  const sourceList = (sourceRecords: Array<OverviewRecord | null>) => sourceRecords
    .filter((record): record is OverviewRecord => Boolean(record))
    .map(overviewSource)
    .filter((source): source is ClientBrainV2OverviewSource => Boolean(source))
  const gap = barriersGap ? {
    record_id: barriersGap.id,
    title: barriersGap.title,
    status: barriersGap.status,
    priority: barriersGap.priority,
    why_it_matters: labelledListText(barriersGap.content, 'Why it matters'),
    recommended_resolution: metadataString(barriersGap, 'recommended_resolution'),
  } : null
  const field = (
    id: ClientBrainV2AudienceFieldId,
    label: string,
    values: string[],
    supportingContext: string | null,
    sourceRecords: Array<OverviewRecord | null>,
    fieldGap = null as ClientBrainV2Audience['fields'][number]['gap'],
  ) => ({
    id,
    label,
    values: [...new Set(values.filter(Boolean))],
    supporting_context: supportingContext,
    state: values.length > 0 ? 'supported' as const : fieldGap ? 'needs_confirmation' as const : 'not_defined' as const,
    sources: sourceList(sourceRecords),
    gap: fieldGap,
  })

  const motivations = audienceRecords.map(record => labelledListText(record.content, 'Motivations')).filter((value): value is string => Boolean(value))
  const occasions = audienceRecords.map(record => labelledListText(record.content, 'Dining behavior')).filter((value): value is string => Boolean(value))
  const decisionDrivers = labelledBullets(psychology?.content, 'Core triggers')
  const locationContext = firstBulletAfterLabel(location?.content, 'Known location truth')
  const allLocationBullets = labelledBullets(location?.content, 'Known location truth')
  const geographicContext = allLocationBullets.slice(1, 2)

  const fields = [
    field('needs_motivations', 'Needs / Motivations', motivations, firstSentence(psychology?.summary), [...audienceRecords, psychology]),
    field('decision_drivers', 'Decision Drivers', decisionDrivers, null, [psychology]),
    field('occasions_use_cases', 'Occasions & Use Cases', occasions, null, audienceRecords),
    field('geographic_behavioral_context', 'Geographic / Behavioural Context', geographicContext, locationContext, [location, ...audienceRecords.filter(record => ['Business Bay Professionals', 'Affluent Residents'].includes(record.title))]),
    field('barriers_objections', 'Barriers / Objections', [], null, [], gap),
  ]
  const sources = [...new Map([
    ...segments.map(segment => [segment.source.record_id, segment.source] as const),
    ...fields.flatMap(item => item.sources.map(source => [source.record_id, source] as const)),
  ]).values()]

  return { segments, fields, sources }
}

function sentenceList(value: string | null | undefined) {
  return (value ?? '')
    .split(/(?<=\.)\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function commaList(value: string | null | undefined) {
  return (value ?? '')
    .replace(/^Avoid\s+/i, '')
    .replace(/\.$/, '')
    .split(/,\s*|\s+and\s+/)
    .map(item => item.trim().replace(/^and\s+/i, ''))
    .filter(Boolean)
}

function buildVisualDna(records: OverviewRecord[], assetReferences: ClientBrainV2VisualAssetReference[]): ClientBrainV2VisualDna {
  const visual = overviewRecord(records, 'Visual DNA')
  const environment = overviewRecord(records, 'Interior & Environment Intelligence')
  const contentPillars = overviewRecord(records, 'Content & Creative Pillars')
  const visualParagraphs = (visual?.content ?? '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const environmentParagraphs = (environment?.content ?? '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const contentParagraphs = (contentPillars?.content ?? '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const visualSystemSentences = sentenceList(visualParagraphs[0])
  const photographySentences = sentenceList(visualParagraphs[1])
  const compositionSentences = sentenceList(visualParagraphs[2])
  const environmentSentences = environmentParagraphs.flatMap(sentenceList)
  const contentSentences = contentParagraphs.flatMap(sentenceList)
  const hardGuardrails = commaList(visualSystemSentences.find(item => /^Avoid\s+/i.test(item)))
  const preferenceRules = compositionSentences.filter(item => /wide ambience|branding subtle/i.test(item))

  const labelFor = (id: ClientBrainV2VisualDnaFieldId) => (
    CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS.find(field => field.id === id)?.label ?? id
  )
  const groupFor = (id: ClientBrainV2VisualDnaFieldId) => (
    CLIENT_BRAIN_V2_VISUAL_DNA_FIELDS.find(field => field.id === id)?.group ?? 'visual_world'
  )
  const sourceList = (sourceRecords: Array<OverviewRecord | null>) => sourceRecords
    .filter((record): record is OverviewRecord => Boolean(record))
    .map(overviewSource)
    .filter((source): source is ClientBrainV2OverviewSource => Boolean(source))
  const field = (
    id: ClientBrainV2VisualDnaFieldId,
    values: Array<string | null | undefined>,
    sourceRecords: Array<OverviewRecord | null>,
    rules: ClientBrainV2VisualDna['fields'][number]['rules'] = [],
  ) => ({
    id,
    label: labelFor(id),
    group: groupFor(id),
    values: [...new Set(values.filter((value): value is string => Boolean(value)))],
    rules,
    sources: sourceList(sourceRecords),
  })

  const fields = [
    field('visual_identity', [
      environmentSentences[0],
      environmentSentences.find(item => /^Strategically,/i.test(item)),
    ], [environment, visual]),
    field('photography_style', photographySentences, [visual]),
    field('lighting_dna', [
      environmentSentences.find(item => /beautiful lighting/i.test(item)),
      environmentSentences.find(item => /warm lighting/i.test(item)),
    ], [environment, visual]),
    field('colour_grade', [visualSystemSentences[0]], [visual]),
    field('human_hospitality_style', [
      contentSentences.find(item => /^Chef Stories/i.test(item)),
      contentSentences.find(item => /^Hospitality Moments/i.test(item)),
      environmentSentences.find(item => /refined Italian service/i.test(item)),
    ], [contentPillars, environment, visual]),
    field('creative_guardrails', [], [visual], [
      ...hardGuardrails.map(text => ({ text, strength: 'hard' as const })),
      ...preferenceRules.map(text => ({ text, strength: 'preference' as const })),
    ]),
  ]
  const sources = [...new Map(fields.flatMap(item => item.sources.map(source => [source.record_id, source] as const))).values()]
  const assetGapRecord = records.find(record => (
    record.record_type === 'knowledge_gap'
    && record.status === 'active'
    && record.title === 'Owner / Chef Preferred Visual References'
  )) ?? null
  const assetGap = assetGapRecord ? {
    record_id: assetGapRecord.id,
    title: assetGapRecord.title,
    status: assetGapRecord.status,
    priority: assetGapRecord.priority,
    why_it_matters: labelledListText(assetGapRecord.content, 'Why it matters'),
    recommended_resolution: metadataString(assetGapRecord, 'recommended_resolution'),
  } : null

  return { fields, sources, asset_references: assetReferences, asset_gap: assetGap }
}

function commercialStrategySource(record: OverviewRecord | null): ClientBrainV2CommercialStrategySource | null {
  const source = overviewSource(record)
  if (!source || !record) return null
  return {
    ...source,
    effective_date: record.effective_date,
    valid_until: record.valid_until,
    superseded_by_id: record.superseded_by_id,
  }
}

function commercialStrategyGap(record: OverviewRecord | null): ClientBrainV2CommercialStrategyGap | null {
  if (!record) return null
  return {
    record_id: record.id,
    title: record.title,
    status: record.status,
    priority: record.priority,
    why_it_matters: labelledListText(record.content, 'Why it matters') || metadataString(record, 'why_it_matters'),
    recommended_resolution: labelledListText(record.content, 'Recommended resolution') || metadataString(record, 'recommended_resolution'),
  }
}

function buildCommercialStrategy(
  records: OverviewRecord[],
  commercialObjects: CommercialObjectRecord[],
): ClientBrainV2CommercialStrategy {
  const byTitle = (title: string) => records.find(record => record.title === title) ?? null
  const marketing = byTitle('Marketing Opportunities')
  const delivery = byTitle('Delivery')
  const businessBay = byTitle('Business Bay Professionals')
  const residents = byTitle('Affluent Residents')
  const psychology = byTitle('Audience Psychology')
  const offerTiming = byTitle('Offer Timing Rules')
  const booking = byTitle('Booking & Contact')
  const brandHygiene = byTitle('Brand Hygiene / Cross-Channel Consistency')
  const deliveryOperations = byTitle('Delivery & Ordering')
  const gap = (title: string) => commercialStrategyGap(records.find(record => record.record_type === 'knowledge_gap' && record.title === title) ?? null)
  const gaps = (...titles: string[]) => titles.map(gap).filter((item): item is ClientBrainV2CommercialStrategyGap => Boolean(item))

  const sourceList = (sourceRecords: Array<OverviewRecord | null>) => sourceRecords
    .map(commercialStrategySource)
    .filter((source): source is ClientBrainV2CommercialStrategySource => Boolean(source))
  const objectReference = (
    record: CommercialObjectRecord,
    relationship: ClientBrainV2CommercialStrategyObject['relationship'],
  ): ClientBrainV2CommercialStrategyObject => ({
    record_id: record.id,
    title: record.title,
    object_type: record.commercial?.object_type ?? record.record_type,
    subsection: record.subsection,
    status: record.status,
    confidence: record.confidence,
    summary: record.summary,
    price_amount: record.commercial?.price_amount ?? null,
    currency: record.commercial?.currency ?? null,
    last_verified_at: record.last_verified_at,
    review_at: record.review_at,
    relationship,
  })

  const approvedRevenueObjects = commercialObjects.filter(record => (
    TRUSTED_OVERVIEW_STATUSES.has(record.status)
    && Boolean(labelledParagraph(record.content, 'Revenue role'))
  ))
  const marketingText = `${marketing?.summary ?? ''} ${marketing?.content ?? ''}`.toLowerCase()
  const genericCommercialWords = new Set([
    'collection', 'dining', 'dishes', 'event', 'items', 'menus', 'premium',
    'program', 'seasonal', 'signature',
  ])
  const priorityCandidates = commercialObjects.filter(record => {
    if (record.record_type === 'offer') return true
    const meaningfulWords = record.title.toLowerCase().split(/[^a-z0-9]+/).filter(word => (
      word.length >= 5 && !genericCommercialWords.has(word)
    ))
    return meaningfulWords.some(word => marketingText.includes(word))
  })
  const marketingStatements = (marketing?.summary ?? '')
    .replace(/^High-impact opportunities:\s*/i, '')
    .split(/;\s*/)
    .map(item => item.trim().replace(/^and\s+/i, '').replace(/\.$/, ''))
    .filter(Boolean)
  const revenueStatements = [
    ...approvedRevenueObjects.flatMap(record => labelledBullets(record.content, 'Revenue role')),
    ...labelledBullets(delivery?.content, 'Revenue role'),
  ].filter((item): item is string => Boolean(item))
  const acquisitionStatement = labelledParagraph(marketing?.content, 'Paid and partnership opportunity')?.replace(/^-\s*/, '') ?? null
  const constraintStatements = [offerTiming, booking, brandHygiene, deliveryOperations]
    .flatMap(record => labelledBullets(record?.content, 'Operational rule'))

  const labelFor = (id: ClientBrainV2CommercialStrategyFieldId) => (
    CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS.find(field => field.id === id)?.label ?? id
  )
  const groupFor = (id: ClientBrainV2CommercialStrategyFieldId) => (
    CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_FIELDS.find(field => field.id === id)?.group ?? 'current_objectives'
  )
  const field = (
    id: ClientBrainV2CommercialStrategyFieldId,
    state: ClientBrainV2CommercialStrategyState,
    statements: string[],
    supportingContext: string | null,
    sourceRecords: Array<OverviewRecord | null>,
    linkedObjects: ClientBrainV2CommercialStrategyObject[] = [],
    fieldGaps: ClientBrainV2CommercialStrategyGap[] = [],
  ) => ({
    id,
    label: labelFor(id),
    group: groupFor(id),
    state,
    statements: [...new Set(statements)],
    supporting_context: supportingContext,
    sources: sourceList(sourceRecords),
    linked_objects: linkedObjects,
    gaps: fieldGaps,
  })

  const fields = [
    field(
      'business_objectives',
      'not_defined',
      [],
      'No current client-confirmed commercial objective is stored. Legacy revenue and campaign opportunities remain evidence for review, not active instruction.',
      [],
      [],
      gaps('Highest-Margin Dishes And Revenue Priorities', 'Upcoming Campaigns / Events / Seasonal Menus'),
    ),
    field(
      'marketing_priorities',
      marketingStatements.length > 0 ? 'needs_review' : 'not_defined',
      marketingStatements,
      'These are opportunity signals from a review-sensitive legacy strategy record. They are not presented as current client-approved priorities.',
      [marketing],
      [],
      gaps('Upcoming Campaigns / Events / Seasonal Menus', 'Content Performance Data'),
    ),
    field(
      'revenue_drivers',
      revenueStatements.length > 0 ? 'needs_review' : 'not_defined',
      revenueStatements,
      'Approved commercial objects describe revenue roles, but management has not confirmed the current priority or margin hierarchy.',
      [delivery],
      approvedRevenueObjects.map(record => objectReference(record, 'revenue_context')),
      gaps('Highest-Margin Dishes And Revenue Priorities', 'Current Delivery Performance By Platform'),
    ),
    field(
      'priority_offers',
      priorityCandidates.length > 0 ? 'needs_review' : 'not_defined',
      [],
      'These commercial objects are connected to offer inventory or review-sensitive opportunity language. None is confirmed as a current strategic priority.',
      [marketing],
      priorityCandidates.map(record => objectReference(record, 'priority_candidate')),
      gaps('Highest-Margin Dishes And Revenue Priorities', 'Exact Offer Timings'),
    ),
    field(
      'demand_gaps',
      'not_defined',
      [],
      'No quantified weak daypart, underperforming product, or underserved segment is stored as current evidence.',
      [],
      [],
      gaps('Content Performance Data', 'Current Delivery Performance By Platform', 'Highest-Margin Dishes And Revenue Priorities'),
    ),
    field(
      'customer_acquisition_priorities',
      acquisitionStatement ? 'needs_review' : 'not_defined',
      acquisitionStatement ? [acquisitionStatement] : [],
      'Audience records define who DemoClientB serves; this field only reflects the review-sensitive segments and channels the business may currently want more of.',
      [marketing, businessBay, residents],
    ),
    field(
      'retention_repeat_behaviour',
      'not_defined',
      [],
      'Audience evidence supports repeat weekday routines, local dining, and delivery occasions, but no approved retention strategy or desired repeat behaviour is defined.',
      [businessBay, residents, psychology],
      [],
      gaps('Retention And Repeat Priorities Not Defined'),
    ),
    field(
      'commercial_constraints',
      constraintStatements.length > 0 ? 'needs_review' : 'not_defined',
      constraintStatements,
      'Only constraints that affect commercial or marketing decisions are shown. Exact timings, booking routes, and delivery details still require current verification.',
      [offerTiming, booking, brandHygiene, deliveryOperations],
      [],
      gaps('Exact Offer Timings', 'Current Booking And Contact Details', 'Current Menu PDFs And Pricing'),
    ),
    field(
      'commercial_kpis',
      'not_defined',
      [],
      'No approved commercial KPI set or numeric target is stored. Live performance is intentionally not inferred from content or review data.',
      [],
      [],
      gaps('Commercial KPIs And Targets Not Defined', 'Highest-Margin Dishes And Revenue Priorities'),
    ),
  ]

  const sources = [...new Map(fields.flatMap(item => item.sources.map(source => [source.record_id, source] as const))).values()]
  const lifecycleCounts = fields.reduce((counts, item) => {
    counts[item.state] += 1
    return counts
  }, {
    active: 0,
    needs_review: 0,
    historical: 0,
    scheduled: 0,
    superseded: 0,
    not_defined: 0,
  } satisfies Record<ClientBrainV2CommercialStrategyState, number>)

  return { fields, sources, lifecycle_counts: lifecycleCounts }
}

function operationsAuthorityRank(record: OverviewRecord) {
  if (record.subsection === 'client_provided') return 1
  if (record.subsection === 'documents') return 2
  if (record.subsection === 'official_digital') return 3
  if (record.subsection === 'internal_mc_studios' || record.source_type === 'legacy_client_knowledge') return 4
  if (record.subsection === 'external_research') return 5
  return 6
}

function operationsSource(
  record: OverviewRecord | null,
  sourceRole: ClientBrainV2OperationsSource['source_role'],
): ClientBrainV2OperationsSource | null {
  const source = commercialStrategySource(record)
  if (!source || !record) return null
  return {
    ...source,
    authority_rank: operationsAuthorityRank(record),
    source_role: sourceRole,
  }
}

function buildOperations(
  records: OverviewRecord[],
  commercialObjects: CommercialObjectRecord[],
  sourceRecords: OverviewRecord[],
): ClientBrainV2Operations {
  const byTitle = (title: string) => records.find(record => record.title === title) ?? null
  const sourceByTitle = (title: string) => sourceRecords.find(record => record.title === title) ?? null
  const location = byTitle('Location & Access')
  const hours = byTitle('Opening Hours / Verification Needed')
  const offerTiming = byTitle('Offer Timing Rules')
  const booking = byTitle('Booking & Contact')
  const delivery = byTitle('Delivery & Ordering')
  const hygiene = byTitle('Brand Hygiene / Cross-Channel Consistency')

  const gapBy = (...keysOrTitles: string[]) => records
    .filter(record => record.record_type === 'knowledge_gap' && record.status === 'active')
    .filter(record => keysOrTitles.includes(record.stable_key) || keysOrTitles.includes(record.title))
    .map(commercialStrategyGap)
    .filter((gap): gap is ClientBrainV2OperationsGap => Boolean(gap))

  const verificationSources = (...titles: string[]) => titles
    .map(sourceByTitle)
    .map(record => operationsSource(record, 'verification_candidate'))
    .filter((source): source is ClientBrainV2OperationsSource => Boolean(source))

  const evidenceSources = (...sourceRecordsForField: Array<OverviewRecord | null>) => sourceRecordsForField
    .map(record => operationsSource(record, 'evidence'))
    .filter((source): source is ClientBrainV2OperationsSource => Boolean(source))

  const combineSources = (
    evidence: ClientBrainV2OperationsSource[],
    candidates: ClientBrainV2OperationsSource[],
  ) => [...new Map([...evidence, ...candidates].map(source => [source.record_id, source] as const)).values()]
    .sort((a, b) => a.authority_rank - b.authority_rank)

  const objectReference = (
    record: CommercialObjectRecord,
    relationship: ClientBrainV2OperationsObject['relationship'],
  ): ClientBrainV2OperationsObject => ({
    record_id: record.id,
    title: record.title,
    object_type: record.commercial?.object_type ?? record.record_type,
    subsection: record.subsection,
    status: record.status,
    confidence: record.confidence,
    availability: record.commercial?.availability ?? null,
    capacity: record.commercial?.capacity ?? null,
    booking_requirements: record.commercial?.booking_requirements ?? null,
    review_at: record.review_at,
    relationship,
  })

  const objectsByTitle = (...titles: string[]) => commercialObjects.filter(record => titles.includes(record.title))
  const serviceObjects = objectsByTitle('Breakfast', 'Business Lunch', 'Dinner', 'Group / Corporate Dining')
  const capabilityObjects = objectsByTitle('Zero-Proof Aperitivo')
  const constraintObjects = objectsByTitle('Breakfast', 'Business Lunch', 'Pizza Program', 'Seasonal / Event Menus', 'Group / Corporate Dining')
  const locationFacts = labelledBullets(location?.content, 'Known location truth')
  const deliveryChannels = labelledBullets(delivery?.content, 'Known channels')
  const operationalRules = [offerTiming, booking, delivery, hygiene]
    .flatMap(record => labelledBullets(record?.content, 'Operational rule'))

  const labelFor = (id: ClientBrainV2OperationsFieldId) => (
    CLIENT_BRAIN_V2_OPERATIONS_FIELDS.find(field => field.id === id)?.label ?? id
  )
  const groupFor = (id: ClientBrainV2OperationsFieldId) => (
    CLIENT_BRAIN_V2_OPERATIONS_FIELDS.find(field => field.id === id)?.group ?? 'venue_access'
  )
  const fact = (
    label: string,
    value: string,
    state: ClientBrainV2OperationsState,
    note: string | null = null,
  ) => ({ label, value, state, note })
  const field = (
    id: ClientBrainV2OperationsFieldId,
    state: ClientBrainV2OperationsState,
    facts: ReturnType<typeof fact>[],
    supportingContext: string | null,
    sources: ClientBrainV2OperationsSource[],
    linkedObjects: ClientBrainV2OperationsObject[] = [],
    gaps: ClientBrainV2OperationsGap[] = [],
  ) => ({
    id,
    label: labelFor(id),
    group: groupFor(id),
    state,
    facts,
    supporting_context: supportingContext,
    sources,
    linked_objects: linkedObjects,
    gaps,
  })

  const fields = [
    field(
      'venue_location',
      'needs_review',
      locationFacts.map((value, index) => fact(
        index === 0 ? 'Address / area' : index === 1 ? 'Local context' : 'Venue context',
        value,
        'needs_review',
        index === 2 ? 'Use terrace, canal, or skyline context only when supported by selected venue assets.' : null,
      )),
      'J One, Marasi Drive and Business Bay are present in the migrated audit. Exact Maps, parking, valet and arrival instructions remain unverified.',
      combineSources(
        evidenceSources(location),
        verificationSources('Official Website', 'Google Reviews / Wanderlog Google-Sourced Review Page'),
      ),
    ),
    field(
      'reservations_contact',
      'needs_review',
      [],
      'No booking URL, reservation phone, WhatsApp, email, preferred platform, Maps link, or canonical CTA is currently verified. Jarvis must not publish contact details from memory.',
      combineSources(
        evidenceSources(booking),
        verificationSources('Official Website', 'Instagram @democlientbdubai'),
      ),
      [],
      gapBy('Current Booking And Contact Details'),
    ),
    field(
      'opening_service_hours',
      'conflict',
      [fact(
        'Venue hours captured by audit',
        '08:00–01:00 daily',
        'conflict',
        'The migrated audit captured this value, while older editorial and third-party sources reportedly differed. No current official verification is stored.',
      )],
      'Service windows, last order, kitchen close, and holiday hours are not defined. Offer timing is not treated as venue opening hours.',
      combineSources(
        evidenceSources(hours),
        verificationSources('Official Website', 'Instagram @democlientbdubai', 'Google Reviews / Wanderlog Google-Sourced Review Page'),
      ),
      [],
      gapBy('Current Verified Opening Hours', 'Exact Offer Timings'),
    ),
    field(
      'service_availability',
      'needs_review',
      [
        ...serviceObjects.map(record => fact(
          record.title,
          record.commercial?.availability || 'Current availability requires verification',
          'needs_review',
        )),
        ...deliveryChannels.map(value => fact('Delivery / ordering', value, 'needs_review')),
      ],
      'These rows expose operational availability context only. Specific offers, recurring experiences, schedules and prices remain canonical Products & Offers records.',
      combineSources(
        evidenceSources(offerTiming, delivery),
        verificationSources('Official Website', 'Official Menu PDFs', 'Deliveroo', 'Talabat'),
      ),
      serviceObjects.map(record => objectReference(record, 'availability_context')),
      gapBy('Exact Offer Timings'),
    ),
    field(
      'capacity_booking_rules',
      'not_defined',
      [],
      'No total capacity, group capacity, private-event capacity, deposit, minimum spend, cancellation, advance notice, reservation requirement, or walk-in rule is stored as current truth.',
      verificationSources('Official Website'),
      objectsByTitle('Group / Corporate Dining').map(record => objectReference(record, 'booking_context')),
      gapBy('knowledge_gap:operations:capacity_booking_rules'),
    ),
    field(
      'guest_policies',
      'not_defined',
      [],
      'No current evidence defines children, pets, dress code, smoking, accessibility, age restrictions, outside cake, photography, terrace pet, or stroller policies.',
      verificationSources('Official Website', 'Instagram @democlientbdubai'),
      [],
      gapBy('knowledge_gap:operations:guest_policies_accessibility'),
    ),
    field(
      'dietary_service_capabilities',
      capabilityObjects.length > 0 ? 'needs_review' : 'not_defined',
      capabilityObjects.map(record => fact(
        'Non-alcoholic beverage program',
        `${record.title} is present as a review-sensitive collection; current items and availability are not confirmed.`,
        'needs_review',
      )),
      'Vegetarian, vegan, gluten-free, halal, allergy accommodation, alcohol service and kids-menu capability are not verified. Zero-proof evidence does not establish licensing or whether alcohol is served.',
      verificationSources('Official Menu PDFs', 'Official Website'),
      capabilityObjects.map(record => objectReference(record, 'capability_context')),
      gapBy('knowledge_gap:operations:dietary_service_capabilities'),
    ),
    field(
      'operational_constraints',
      'needs_review',
      operationalRules.map(value => fact('Communication constraint', value, 'needs_review')),
      'Constraints shown here affect customer communication and Jarvis execution. Offer-specific restrictions remain on their canonical Products & Offers records.',
      combineSources(
        evidenceSources(offerTiming, booking, delivery, hygiene),
        verificationSources('Official Website', 'Official Menu PDFs', 'Deliveroo', 'Talabat'),
      ),
      constraintObjects.map(record => objectReference(record, 'constraint_context')),
      gapBy('Exact Offer Timings', 'Current Booking And Contact Details', 'Current Menu PDFs And Pricing'),
    ),
  ]

  const sources = [...new Map(fields.flatMap(item => item.sources.map(source => [source.record_id, source] as const))).values()]
    .sort((a, b) => a.authority_rank - b.authority_rank)
  const stateCounts = fields.reduce((counts, item) => {
    counts[item.state] += 1
    return counts
  }, {
    verified: 0,
    needs_review: 0,
    conflict: 0,
    not_defined: 0,
  } satisfies Record<ClientBrainV2OperationsState, number>)

  return { fields, sources, state_counts: stateCounts }
}

function marketAuthorityRank(record: OverviewRecord) {
  if (record.subsection === 'client_provided') return 1
  if (record.subsection === 'internal_mc_studios') return 2
  if (record.subsection === 'official_digital') return 3
  if (record.subsection === 'external_research') return 4
  if (record.source_type === 'system_derived') return 5
  return 3
}

function marketObservedAt(record: OverviewRecord | null) {
  if (!record) return null
  const metadataObservedAt = record.metadata?.observed_at
  return record.effective_date
    || (typeof metadataObservedAt === 'string' && metadataObservedAt.trim() ? metadataObservedAt : null)
}

function marketRecordState(record: OverviewRecord | null): ClientBrainV2MarketIntelligenceState {
  if (!record) return 'not_defined'
  if (record.status === 'historical') return 'historical'
  if (record.status === 'superseded' || record.superseded_by_id) return 'superseded'
  if (record.valid_until && new Date(record.valid_until).getTime() < Date.now()) return 'expired'
  if (record.status === 'needs_review' || record.status === 'unverified' || !marketObservedAt(record)) return 'needs_review'
  return 'current'
}

function marketSource(
  record: OverviewRecord | null,
  sourceRole: ClientBrainV2MarketSource['source_role'],
): ClientBrainV2MarketSource | null {
  const source = commercialStrategySource(record)
  if (!source || !record) return null
  return {
    ...source,
    authority_rank: marketAuthorityRank(record),
    source_role: sourceRole,
    observed_at: marketObservedAt(record),
  }
}

function parseComparisonSet(content: string | null | undefined, label: string) {
  const match = (content ?? '').match(new RegExp(`${label}:\\s*([^.]*)`, 'i'))
  if (!match?.[1]) return []
  return match[1]
    .replace(/,\s+and\s+/i, ', ')
    .replace(/\s+and\s+/i, ', ')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function buildMarketIntelligence(
  records: OverviewRecord[],
  sourceRecords: OverviewRecord[],
): ClientBrainV2MarketIntelligence {
  const byTitle = (title: string) => records.find(record => record.title === title) ?? null
  const sourceByTitle = (title: string) => sourceRecords.find(record => record.title === title) ?? null
  const competitive = byTitle('Competitive Landscape')
  const opportunities = byTitle('Marketing Opportunities')
  const reviews = byTitle('Review Intelligence')
  const location = byTitle('Location & Access')
  const positioning = byTitle('Brand Positioning Analysis')
  const competitorState = marketRecordState(competitive)
  const opportunityState = marketRecordState(opportunities)
  const reviewState = marketRecordState(reviews)

  const gapBy = (...keysOrTitles: string[]) => records
    .filter(record => record.record_type === 'knowledge_gap' && record.status === 'active')
    .filter(record => keysOrTitles.includes(record.stable_key) || keysOrTitles.includes(record.title))
    .map(commercialStrategyGap)
    .filter((gap): gap is ClientBrainV2MarketGap => Boolean(gap))

  const verificationSources = (...titles: string[]) => titles
    .map(sourceByTitle)
    .map(record => marketSource(record, 'verification_candidate'))
    .filter((source): source is ClientBrainV2MarketSource => Boolean(source))
  const evidenceSources = (...evidenceRecords: Array<OverviewRecord | null>) => evidenceRecords
    .map(record => marketSource(record, 'evidence'))
    .filter((source): source is ClientBrainV2MarketSource => Boolean(source))
  const combineSources = (evidence: ClientBrainV2MarketSource[], candidates: ClientBrainV2MarketSource[]) => (
    [...new Map([...evidence, ...candidates].map(source => [source.record_id, source] as const)).values()]
      .sort((a, b) => a.authority_rank - b.authority_rank)
  )

  const signal = (
    text: string,
    kind: ClientBrainV2MarketSignal['kind'],
    status: ClientBrainV2MarketIntelligenceState,
    sourceRecord: OverviewRecord | null,
  ): ClientBrainV2MarketSignal => ({
    text,
    kind,
    status,
    confidence: sourceRecord?.confidence == null ? null : Number(sourceRecord.confidence),
    observed_at: marketObservedAt(sourceRecord),
    source_record_id: sourceRecord?.id ?? null,
  })
  const labelFor = (id: ClientBrainV2MarketIntelligenceFieldId) => (
    CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS.find(field => field.id === id)?.label ?? id
  )
  const groupFor = (id: ClientBrainV2MarketIntelligenceFieldId) => (
    CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_FIELDS.find(field => field.id === id)?.group ?? 'market'
  )
  const field = (
    id: ClientBrainV2MarketIntelligenceFieldId,
    state: ClientBrainV2MarketIntelligenceState,
    signals: ClientBrainV2MarketSignal[],
    competitors: ClientBrainV2Competitor[],
    supportingContext: string | null,
    sources: ClientBrainV2MarketSource[],
    gaps: ClientBrainV2MarketGap[] = [],
  ) => ({
    id,
    label: labelFor(id),
    group: groupFor(id),
    state,
    signals,
    competitors,
    supporting_context: supportingContext,
    sources,
    gaps,
  })

  const locationContext = labelledBullets(location?.content, 'Known location truth')[1] ?? null
  const competitiveParagraphs = (competitive?.content ?? '').split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)
  const reviewParagraphs = (reviews?.content ?? '').split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)
  const premiumNames = parseComparisonSet(competitive?.content, 'Premium Italian comparison set')
  const pizzaNames = parseComparisonSet(competitive?.content, 'Pizza comparison set')
  const competitors: ClientBrainV2Competitor[] = [
    ...premiumNames.map(name => ({
      name,
      comparison_set: 'Premium Italian comparison set',
      classification: 'unclassified' as const,
      status: competitorState,
      confidence: competitive?.confidence == null ? null : Number(competitive.confidence),
      observed_at: marketObservedAt(competitive),
      source_record_id: competitive?.id ?? '',
    })),
    ...pizzaNames.map(name => ({
      name,
      comparison_set: 'Pizza comparison set',
      classification: 'unclassified' as const,
      status: competitorState,
      confidence: competitive?.confidence == null ? null : Number(competitive.confidence),
      observed_at: marketObservedAt(competitive),
      source_record_id: competitive?.id ?? '',
    })),
  ].filter(competitor => competitor.source_record_id)

  const opportunityStatements = (opportunities?.summary ?? '')
    .replace(/^High-impact opportunities:\s*/i, '')
    .split(/;\s*/)
    .map(value => value.trim().replace(/^and\s+/i, '').replace(/\.$/, ''))
    .filter(Boolean)
  const deliveryObservation = reviewParagraphs[0]?.match(/Delivery surfaces were more mixed:\s*.+$/i)?.[0] ?? null
  const offPremiseAnalysis = reviewParagraphs[1]?.split(/(?<=\.)\s+/).find(value => /off-premise/i.test(value)) ?? null
  const clarityAnalysis = competitiveParagraphs.at(-1)?.split(/(?<=\.)\s+/).find(value => /tradeoff is clarity/i.test(value)) ?? null

  const fields = [
    field(
      'market_context',
      'needs_review',
      [
        ...(locationContext ? [signal(locationContext, 'analysis', 'needs_review', location)] : []),
        ...(competitive?.summary ? [signal(firstSentence(competitive.summary) ?? competitive.summary, 'analysis', competitorState, competitive)] : []),
        ...(reviewParagraphs[1] ? [signal(firstSentence(reviewParagraphs[1]) ?? reviewParagraphs[1], 'observation', reviewState, reviews)] : []),
      ],
      [],
      'Business Bay, premium Italian consideration and public-review discovery are present in the legacy audit, but no dated current market profile or quantified market evidence is stored.',
      combineSources(
        evidenceSources(location, competitive, reviews),
        verificationSources('Original DemoClientB Research Audit', 'Google Reviews / Wanderlog Google-Sourced Review Page', 'TripAdvisor'),
      ),
    ),
    field(
      'market_trends',
      'not_defined',
      [],
      [],
      'No dated market trend record is stored. Stable brand or audience statements are not being relabelled as changing market trends.',
      verificationSources('Original DemoClientB Research Audit', "What's On Dubai Coverage", 'Time Out Dubai Coverage', 'FACT Magazine Coverage'),
      gapBy('knowledge_gap:market_intelligence:recent_market_evidence'),
    ),
    field(
      'customer_cultural_trends',
      'not_defined',
      [],
      [],
      'No dated external evidence describes changing customer or hospitality behaviour. Existing Audience records remain audience intelligence, not temporal trend evidence.',
      verificationSources('Original DemoClientB Research Audit', 'Google Reviews / Wanderlog Google-Sourced Review Page', 'TripAdvisor'),
      gapBy('knowledge_gap:market_intelligence:recent_market_evidence', 'Customer Objections And Complaint Patterns'),
    ),
    field(
      'competitor_landscape',
      competitors.length > 0 ? competitorState : 'not_defined',
      [],
      competitors,
      'The legacy record provides two comparison sets only. It does not validate direct, indirect or aspirational classification, current locations, prices, offers, strengths, weaknesses or activity.',
      combineSources(
        evidenceSources(competitive),
        verificationSources('Original DemoClientB Research Audit', "What's On Dubai Coverage", 'Time Out Dubai Coverage', 'FACT Magazine Coverage'),
      ),
      gapBy('knowledge_gap:market_intelligence:competitor_set_validation'),
    ),
    field(
      'competitive_positioning',
      competitorState,
      [
        ...competitiveParagraphs.slice(0, 3).map(value => signal(value, 'analysis', competitorState, competitive)),
        ...(positioning?.summary ? [signal(positioning.summary, 'analysis', 'needs_review', positioning)] : []),
      ],
      [],
      'This is analyst interpretation of how DemoClientB compares with named alternatives. It does not replace Brand Identity or constitute a client-approved strategic decision.',
      combineSources(
        evidenceSources(competitive, positioning),
        verificationSources('Original DemoClientB Research Audit'),
      ),
      gapBy('knowledge_gap:market_intelligence:competitor_set_validation'),
    ),
    field(
      'competitor_activity',
      'not_defined',
      [],
      [],
      'No current competitor offer, menu, campaign, pricing, opening, closure or activation is recorded. Stale comparison-set analysis is not presented as activity.',
      verificationSources('Instagram @democlientbdubai', "What's On Dubai Coverage", 'Time Out Dubai Coverage', 'FACT Magazine Coverage'),
      gapBy('knowledge_gap:market_intelligence:recent_market_evidence'),
    ),
    field(
      'opportunities',
      opportunityState,
      opportunityStatements.map(value => signal(value, 'opportunity', opportunityState, opportunities)),
      [],
      'These are review-sensitive strategy-team interpretations from the legacy audit. They remain possible responses and are not automatically active Commercial Strategy.',
      combineSources(
        evidenceSources(opportunities),
        verificationSources('Original DemoClientB Research Audit'),
      ),
    ),
    field(
      'threats',
      deliveryObservation || offPremiseAnalysis || clarityAnalysis ? 'needs_review' : 'not_defined',
      [
        ...(deliveryObservation ? [signal(deliveryObservation, 'observation', reviewState, reviews)] : []),
        ...(offPremiseAnalysis ? [signal(offPremiseAnalysis, 'threat', reviewState, reviews)] : []),
        ...(clarityAnalysis ? [signal(clarityAnalysis, 'threat', competitorState, competitive)] : []),
      ],
      [],
      'Only risks already documented in the audit are shown. Severity and commercial impact are not quantified, and no broader threat landscape is inferred.',
      combineSources(
        evidenceSources(reviews, competitive),
        verificationSources('Deliveroo', 'Talabat', 'Google Reviews / Wanderlog Google-Sourced Review Page'),
      ),
      gapBy('Current Delivery Performance By Platform', 'Customer Objections And Complaint Patterns'),
    ),
  ]

  const sources = [...new Map(fields.flatMap(item => item.sources.map(source => [source.record_id, source] as const))).values()]
    .sort((a, b) => a.authority_rank - b.authority_rank)
  const stateCounts = fields.reduce((counts, item) => {
    counts[item.state] += 1
    return counts
  }, {
    current: 0,
    needs_review: 0,
    historical: 0,
    expired: 0,
    superseded: 0,
    not_defined: 0,
  } satisfies Record<ClientBrainV2MarketIntelligenceState, number>)

  return { fields, sources, state_counts: stateCounts }
}

const KNOWLEDGE_GAP_AREA_LABELS: Record<string, string> = {
  overview: 'Overview',
  brand_identity: 'Brand Identity',
  audience: 'Audience',
  visual_dna: 'Visual DNA',
  commercial_strategy: 'Commercial Strategy',
  menus: 'Menus',
  activations: 'Activations',
  operations: 'Operations',
  market_intelligence: 'Market Intelligence',
  products_offers: 'Products & Offers',
  assets: 'Assets',
  brand_guidelines: 'Brand Guidelines',
  sources: 'Sources',
  learnings: 'Learnings',
}

function normalizeKnowledgeGapArea(value: string) {
  const normalized = value
    .split('→').at(-1)!
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const aliases: Record<string, string> = {
    brand_strategy: 'brand_identity',
    offers_and_revenue: 'activations',
    products_and_offers: 'activations',
    content_performance: 'learnings',
  }
  return aliases[normalized] ?? normalized
}

function inferKnowledgeGapArea(record: ClientBrainV2Record) {
  const targetSubsection = typeof record.metadata.target_subsection === 'string'
    ? record.metadata.target_subsection.trim()
    : ''
  const provenanceArea = typeof record.provenance.related_area === 'string'
    ? record.provenance.related_area.trim()
    : ''
  const explicitArea = targetSubsection || provenanceArea
  if (explicitArea) {
    const id = normalizeKnowledgeGapArea(explicitArea)
    return { id, label: KNOWLEDGE_GAP_AREA_LABELS[id] ?? explicitArea.split('→').at(-1)!.trim() }
  }

  const searchable = `${record.title}\n${record.content ?? ''}`.toLowerCase()
  const semanticRules: Array<[RegExp, string]> = [
    [/opening hours|booking and contact|capacity and booking|guest policies|dietary and service/, 'operations'],
    [/menu pdf|menu source|menu pricing/, 'menus'],
    [/offer timings/, 'activations'],
    [/margin|revenue priorities|campaigns \/ events|seasonal menus|commercial kpis|retention and repeat/, 'commercial_strategy'],
    [/content performance/, 'learnings'],
    [/visual references|visual asset|photography reference/, 'visual_dna'],
    [/competitor|market activity|delivery performance|complaint patterns|customer objections/, 'market_intelligence'],
  ]
  const id = semanticRules.find(([pattern]) => pattern.test(searchable))?.[1] ?? 'overview'
  return { id, label: KNOWLEDGE_GAP_AREA_LABELS[id] }
}

function knowledgeGapLifecycle(record: ClientBrainV2Record): ClientBrainV2KnowledgeGapLifecycle {
  if (record.status === 'superseded' || record.superseded_by_id) return 'superseded'
  if (record.status === 'resolved') return 'resolved'
  if (record.status === 'archived' || record.status === 'historical') return 'dismissed'
  if (record.status === 'restricted') return 'blocked'
  if (['draft', 'needs_review', 'unverified', 'conflicting'].includes(record.status)) return 'in_review'
  return 'open'
}

function knowledgeGapPriority(priority: number): ClientBrainV2KnowledgeGapPriority {
  if (priority >= 5) return 'high'
  if (priority >= 3) return 'medium'
  return 'low'
}

function knowledgeGapType(record: ClientBrainV2Record): ClientBrainV2KnowledgeGapType {
  const value = typeof record.metadata.gap_type === 'string' ? record.metadata.gap_type : 'missing'
  return CLIENT_BRAIN_V2_KNOWLEDGE_GAP_TYPES.includes(value as ClientBrainV2KnowledgeGapType)
    ? value as ClientBrainV2KnowledgeGapType
    : 'missing'
}

function knowledgeGapResolutionQuestion(record: ClientBrainV2Record, clientName: string, description: string | null) {
  const storedPrompt = typeof record.metadata.resolution_prompt === 'string'
    ? record.metadata.resolution_prompt.trim()
    : ''
  if (storedPrompt) return storedPrompt
  const missingField = typeof record.metadata.missing_field === 'string'
    ? record.metadata.missing_field.trim()
    : ''
  if (missingField) return `What should ${clientName} confirm as its current ${missingField.toLowerCase()}?`
  const subject = (description ?? record.title).replace(/[.?!]+$/, '').trim()
  return `What current, verified information should Jarvis use for ${subject.charAt(0).toLowerCase()}${subject.slice(1)}?`
}

function buildKnowledgeGaps(
  records: ClientBrainV2Record[],
  clientName: string,
): ClientBrainV2KnowledgeGapWorkspace {
  const gaps = records
    .filter(record => record.record_type === 'knowledge_gap')
    .map((record): ClientBrainV2KnowledgeGapItem => {
      const area = inferKnowledgeGapArea(record)
      const description = firstBulletAfterLabel(record.content, 'Missing')
        || firstBulletAfterLabel(record.content, 'Uncertain')
        || firstBulletAfterLabel(record.content, 'Conflict')
        || firstBulletAfterLabel(record.content, 'Stale')
        || record.summary
      const whyItMatters = metadataString(record, 'why_it_matters')
        || firstBulletAfterLabel(record.content, 'Why it matters')
      const recommendedResolution = metadataString(record, 'recommended_resolution')
        || firstBulletAfterLabel(record.content, 'Recommended resolution')
      const relationships: ClientBrainV2KnowledgeGapItem['relationships'] = [{
        relationship: 'related_area',
        label: area.label,
        record_id: null,
      }]
      const sourceRecordId = typeof record.provenance.source_record_id === 'string'
        ? record.provenance.source_record_id
        : null
      if (sourceRecordId) relationships.push({
        relationship: 'source_record',
        label: typeof record.provenance.source_category === 'string'
          ? `${record.provenance.source_category} source record`
          : 'Source record',
        record_id: sourceRecordId,
      })
      if (record.superseded_by_id) relationships.push({
        relationship: 'superseded_by',
        label: 'Superseded by newer record',
        record_id: record.superseded_by_id,
      })
      return {
        record_id: record.id,
        stable_key: record.stable_key,
        title: record.title,
        gap_type: knowledgeGapType(record),
        lifecycle: knowledgeGapLifecycle(record),
        source_status: record.status,
        priority: record.priority,
        priority_band: knowledgeGapPriority(record.priority),
        related_area_id: area.id,
        related_area_label: area.label,
        description,
        why_it_matters: whyItMatters,
        recommended_resolution: recommendedResolution,
        resolution_question: knowledgeGapResolutionQuestion(record, clientName, description),
        confidence: record.confidence == null ? null : Number(record.confidence),
        source_type: record.source_type,
        provenance: record.provenance,
        created_at: record.created_at,
        updated_at: record.updated_at,
        relationships,
      }
    })
    .sort((a, b) => b.priority - a.priority || a.related_area_label.localeCompare(b.related_area_label) || a.title.localeCompare(b.title))

  const byType = Object.fromEntries(CLIENT_BRAIN_V2_KNOWLEDGE_GAP_TYPES.map(type => [type, 0])) as Record<ClientBrainV2KnowledgeGapType, number>
  const byPriority: Record<ClientBrainV2KnowledgeGapPriority, number> = { high: 0, medium: 0, low: 0 }
  const byLifecycle: Record<ClientBrainV2KnowledgeGapLifecycle, number> = {
    open: 0,
    in_review: 0,
    blocked: 0,
    resolved: 0,
    dismissed: 0,
    superseded: 0,
  }
  const byArea: Record<string, number> = {}
  for (const gap of gaps) {
    byType[gap.gap_type] += 1
    byPriority[gap.priority_band] += 1
    byLifecycle[gap.lifecycle] += 1
    byArea[gap.related_area_label] = (byArea[gap.related_area_label] ?? 0) + 1
  }

  const duplicateCandidates = new Map<string, string[]>()
  for (const gap of gaps.filter(item => item.lifecycle !== 'superseded' && item.lifecycle !== 'dismissed')) {
    const key = (gap.description ?? gap.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    duplicateCandidates.set(key, [...(duplicateCandidates.get(key) ?? []), gap.record_id])
  }

  return {
    gaps,
    counts: {
      total: gaps.length,
      by_type: byType,
      by_priority: byPriority,
      by_lifecycle: byLifecycle,
      by_area: byArea,
    },
    duplicate_audit: {
      equivalent_active_groups: [...duplicateCandidates.values()].filter(group => group.length > 1),
      superseded_count: gaps.filter(gap => gap.lifecycle === 'superseded').length,
    },
  }
}

type IntelligenceAggregates = {
  overview: ClientBrainV2Overview
  brandIdentity: ClientBrainV2BrandIdentity
  audience: ClientBrainV2Audience
  visualDna: ClientBrainV2VisualDna
  commercialStrategy: ClientBrainV2CommercialStrategy
  operations: ClientBrainV2Operations
  marketIntelligence: ClientBrainV2MarketIntelligence
  knowledgeGaps: ClientBrainV2KnowledgeGapWorkspace
}

function editorData(record: OverviewRecord | undefined) {
  if (!record || record.metadata?.editor_managed !== true) return null
  const value = record.metadata.editor_data
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function applyCanonicalIntelligenceEdits(aggregates: IntelligenceAggregates, records: OverviewRecord[]) {
  const recordFor = (subsection: ClientBrainV2EditableSubsection, fieldId: string) => (
    records.find(record => record.stable_key === canonicalFieldStableKey(subsection, fieldId))
  )
  const dataFor = (subsection: ClientBrainV2EditableSubsection, fieldId: string) => editorData(recordFor(subsection, fieldId))

  for (const field of aggregates.overview.fields) {
    const record = recordFor('overview', field.id)
    const data = editorData(record)
    if (data && ('value' in data || data.cleared === true)) {
      field.value = typeof data.value === 'string' ? data.value : null
      field.supporting_context = typeof data.supporting_context === 'string' ? data.supporting_context : null
      field.source = overviewSource(record ?? null)
    }
  }
  for (const field of aggregates.brandIdentity.fields) {
    const record = recordFor('brand_identity', field.id)
    const data = editorData(record)
    if (data && ('value' in data || data.cleared === true)) {
      field.value = typeof data.value === 'string' ? data.value : null
      field.supporting_context = typeof data.supporting_context === 'string' ? data.supporting_context : null
      field.sources = record ? [overviewSource(record)!] : []
      field.state = field.value ? 'supported' : 'not_defined'
    }
  }
  const segmentRecords = records.filter(record => record.record_type === 'audience_segment' && editorData(record))
  if (segmentRecords.length > 0) {
    aggregates.audience.segments = segmentRecords.map(record => {
      const data = editorData(record)!
      return {
        id: record.id,
        name: record.title,
        description: typeof data.description === 'string' ? data.description : null,
        importance: data.importance === 'primary' || data.importance === 'secondary' ? data.importance : 'unconfirmed',
        motivation: typeof data.motivation === 'string' ? data.motivation : null,
        occasions: typeof data.occasions === 'string' ? data.occasions : null,
        source: overviewSource(record)!,
      }
    })
  }
  for (const field of aggregates.audience.fields) {
    const data = dataFor('audience', field.id)
    if (data && Array.isArray(data.values)) {
      field.values = data.values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      field.state = field.values.length ? 'supported' : 'not_defined'
    }
  }
  for (const field of aggregates.visualDna.fields) {
    const data = dataFor('visual_dna', field.id)
    if (!data) continue
    if (Array.isArray(data.values)) field.values = data.values.filter((value): value is string => typeof value === 'string')
    if (Array.isArray(data.rules)) field.rules = data.rules.flatMap(rule => {
      if (!rule || typeof rule !== 'object') return []
      const item = rule as Record<string, unknown>
      if (typeof item.text !== 'string') return []
      const strength = item.strength === 'hard_guardrail' ? 'hard' : 'preference'
      return [{ text: item.text, strength }]
    })
  }
  for (const field of aggregates.commercialStrategy.fields) {
    const data = dataFor('commercial_strategy', field.id)
    if (data && Array.isArray(data.values)) {
      field.statements = data.values.filter((value): value is string => typeof value === 'string')
      field.state = field.statements.length ? 'active' : 'not_defined'
    }
  }
  for (const field of aggregates.operations.fields) {
    const data = dataFor('operations', field.id)
    if (data && Array.isArray(data.facts)) {
      field.facts = data.facts.flatMap(fact => {
        if (!fact || typeof fact !== 'object') return []
        const item = fact as Record<string, unknown>
        if (typeof item.label !== 'string' || typeof item.value !== 'string') return []
        return [{ label: item.label, value: item.value, state: 'verified' as const, note: typeof item.note === 'string' ? item.note : null }]
      })
      field.state = field.facts.length ? 'verified' : 'not_defined'
    }
  }
  for (const field of aggregates.marketIntelligence.fields) {
    const data = dataFor('market_intelligence', field.id)
    if (!data) continue
    if (Array.isArray(data.signals)) field.signals = data.signals as ClientBrainV2MarketSignal[]
    if (Array.isArray(data.competitors)) field.competitors = data.competitors as ClientBrainV2Competitor[]
    field.state = field.signals.length || field.competitors.length ? 'current' : 'not_defined'
  }
}

function buildEditWorkspaces(aggregates: IntelligenceAggregates, records: OverviewRecord[]): Record<ClientBrainV2EditableSubsection, ClientBrainV2EditWorkspace> {
  const baselineFor = (stableKey: string) => {
    const record = records.find(item => item.stable_key === stableKey)
    return { recordId: record?.id ?? null, updatedAt: record?.updated_at ?? null }
  }
  const workspace = (subsection: ClientBrainV2EditableSubsection, fields: ClientBrainV2EditField[]) => ({
    subsection,
    fields,
    baseline: Object.fromEntries(fields.map(field => [field.id, baselineFor(canonicalFieldStableKey(subsection, field.id))])),
  })
  const overview = workspace('overview', aggregates.overview.fields.map(field => ({ id: field.id, label: field.label, kind: 'textarea', value: field.value })))
  const brandIdentity = workspace('brand_identity', aggregates.brandIdentity.fields.map(field => ({ id: field.id, label: field.label, kind: 'textarea', value: field.value })))
  const audienceFields: ClientBrainV2EditField[] = [{
    id: 'segments', label: 'Audience Segments', kind: 'segments', items: aggregates.audience.segments.map(segment => ({
      recordId: segment.id, name: segment.name, description: segment.description, importance: segment.importance,
      motivation: segment.motivation, occasions: segment.occasions, updatedAt: segment.source.updated_at,
    })),
  }, ...aggregates.audience.fields.map(field => ({ id: field.id, label: field.label, kind: 'list' as const, values: field.values }))]
  const audience = workspace('audience', audienceFields)
  for (const segment of aggregates.audience.segments) {
    audience.baseline[`segment:${segment.id}`] = { recordId: segment.id, updatedAt: segment.source.updated_at }
  }
  const visualDna = workspace('visual_dna', aggregates.visualDna.fields.map(field => ({
    id: field.id, label: field.label, kind: field.id === 'creative_guardrails' ? 'rules' : 'list',
    values: field.values,
    items: field.rules.map(rule => ({ text: rule.text, strength: rule.strength === 'hard' ? 'hard_guardrail' : 'preference' })),
  })))
  const commercialStrategy = workspace('commercial_strategy', aggregates.commercialStrategy.fields.map(field => ({ id: field.id, label: field.label, kind: 'list', values: field.statements })))
  const menuRecords = records.filter(record => record.subsection === 'menus' && record.record_type === 'menu')
  const menus: ClientBrainV2EditWorkspace = {
    subsection: 'menus',
    fields: [{
      id: 'menus',
      label: 'Menus',
      kind: 'menus',
      items: menuRecords.map(record => {
        const data = editorData(record) ?? record.metadata
        return {
          recordId: record.id,
          name: record.title,
          menu_type: data.menu_type ?? '',
          description: data.description ?? record.summary ?? '',
          status: data.status ?? record.status,
          service_daypart: data.service_daypart ?? '',
          availability: data.availability ?? '',
          service_hours: data.service_hours ?? '',
          source: data.source ?? '',
          last_verified: data.last_verified ?? record.last_verified_at?.slice(0, 10) ?? '',
          review_state: data.review_state ?? '',
          notes: data.notes ?? '',
          updatedAt: record.updated_at,
        }
      }),
    }],
    baseline: Object.fromEntries(menuRecords.map(record => [`menu:${record.id}`, { recordId: record.id, updatedAt: record.updated_at }])),
  }
  menus.baseline.menus = { recordId: null, updatedAt: null }
  const activationRecords = records.filter(record => record.subsection === 'activations' && record.record_type === 'activation')
  const activations: ClientBrainV2EditWorkspace = {
    subsection: 'activations',
    fields: [{
      id: 'activations',
      label: 'Activations',
      kind: 'activations',
      items: activationRecords.map(record => {
        const data = editorData(record) ?? record.metadata
        return {
          recordId: record.id,
          name: record.title,
          type: data.type ?? data.activation_type ?? '',
          proposition: data.proposition ?? record.summary ?? '',
          status: data.status ?? record.status,
          price: data.price ?? '',
          currency: data.currency ?? '',
          pricing_basis: data.pricing_basis ?? '',
          schedule: data.schedule ?? '',
          days: data.days ?? '',
          start_time: data.start_time ?? '',
          end_time: data.end_time ?? '',
          start_date: data.start_date ?? record.effective_date ?? '',
          end_date: data.end_date ?? '',
          valid_until: data.valid_until ?? data.end_date ?? record.valid_until ?? '',
          review_date: data.review_date ?? record.review_at ?? '',
          recurrence: data.recurrence ?? '',
          inclusions: Array.isArray(data.inclusions) ? data.inclusions : [],
          restrictions: Array.isArray(data.restrictions) ? data.restrictions : [],
          booking_requirements: Array.isArray(data.booking_requirements) ? data.booking_requirements : [],
          platform: data.platform ?? '',
          dish: data.dish ?? '',
          month: data.month ?? '',
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          source: data.source ?? '',
          last_verified: data.last_verified ?? record.last_verified_at?.slice(0, 10) ?? '',
          review_state: data.review_state ?? '',
          notes: data.notes ?? '',
          updatedAt: record.updated_at,
        }
      }),
    }],
    baseline: Object.fromEntries(activationRecords.map(record => [`activation:${record.id}`, { recordId: record.id, updatedAt: record.updated_at }])),
  }
  activations.baseline.activations = { recordId: null, updatedAt: null }
  const operations = workspace('operations', aggregates.operations.fields.map(field => ({ id: field.id, label: field.label, kind: 'facts', items: field.facts.map(fact => ({ ...fact })) })))
  const marketIntelligence = workspace('market_intelligence', aggregates.marketIntelligence.fields.map(field => ({
    id: field.id, label: field.label, kind: 'market', items: [
      ...field.signals.map(signal => ({ itemType: 'signal', ...signal })),
      ...field.competitors.map(competitor => ({ itemType: 'competitor', ...competitor })),
    ],
  })))
  const knowledgeGaps: ClientBrainV2EditWorkspace = {
    subsection: 'knowledge_gaps',
    fields: [{ id: 'gaps', label: 'Knowledge Gaps', kind: 'gaps', items: aggregates.knowledgeGaps.gaps.map(gap => ({ ...gap })) }],
    baseline: Object.fromEntries(aggregates.knowledgeGaps.gaps.map(gap => [gap.record_id, { recordId: gap.record_id, updatedAt: gap.updated_at }])),
  }
  return { overview, brand_identity: brandIdentity, audience, visual_dna: visualDna, commercial_strategy: commercialStrategy, menus, activations, operations, market_intelligence: marketIntelligence, knowledge_gaps: knowledgeGaps }
}

async function loadCommercialStrategyObjects(clientId: string): Promise<CommercialObjectRecord[]> {
  const { data: records, error: recordsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, stable_key, top_section, subsection, record_type, title, summary, content, status, confidence, priority, knowledge_class, effective_date, last_verified_at, valid_until, review_at, source_type, superseded_by_id, metadata, updated_at')
    .eq('client_id', clientId)
    .eq('top_section', 'products_offers')
    .in('status', ['active', 'current', 'approved'])
    .order('priority', { ascending: false })
    .order('title')
  if (recordsError) throw new ClientBrainV2HttpError('Unable to load Commercial Strategy object references.', 500)
  if (!records?.length) return []

  const { data: details, error: detailsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_commercial_details')
    .select('record_id, object_type, price_amount, currency, availability, capacity, booking_requirements')
    .eq('client_id', clientId)
    .in('record_id', records.map(record => record.id))
  if (detailsError) throw new ClientBrainV2HttpError('Unable to load Commercial Strategy object details.', 500)
  const detailByRecord = new Map((details ?? []).map(detail => [detail.record_id, detail]))
  return records.map(record => ({ ...record, commercial: detailByRecord.get(record.id) ?? null })) as CommercialObjectRecord[]
}

async function loadOperationsSourceRecords(clientId: string): Promise<OverviewRecord[]> {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, stable_key, top_section, subsection, record_type, title, summary, content, status, confidence, priority, knowledge_class, effective_date, last_verified_at, valid_until, review_at, source_type, superseded_by_id, metadata, updated_at')
    .eq('client_id', clientId)
    .eq('top_section', 'sources')
    .neq('status', 'archived')
  if (error) throw new ClientBrainV2HttpError('Unable to load Operations source references.', 500)
  return (data ?? []) as OverviewRecord[]
}

async function loadVisualAssetReferences(clientId: string): Promise<ClientBrainV2VisualAssetReference[]> {
  const { data: candidates, error: candidatesError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, status, metadata')
    .eq('client_id', clientId)
    .eq('top_section', 'assets')
    .eq('status', 'approved')
    .order('title')
    .limit(120)
  if (candidatesError) throw new ClientBrainV2HttpError('Unable to load Visual DNA asset references.', 500)

  const selected = ['food_studio_shots', 'drink_studio_shots'].flatMap(category => (
    (candidates ?? []).filter(record => record.metadata?.legacy_asset_category === category).slice(0, 3)
  ))
  if (selected.length === 0) return []

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('record_id, file_object_id, semantic_role, approval_status')
    .eq('client_id', clientId)
    .eq('semantic_role', 'truth_reference')
    .eq('approval_status', 'approved')
    .in('record_id', selected.map(record => record.id))
  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load Visual DNA asset relationships.', 500)

  const fileIds = [...new Set((assignments ?? []).map(item => item.file_object_id))]
  if (fileIds.length === 0) return []
  const { data: files, error: filesError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, storage_bucket, storage_path, preview_path, optimized_path, file_name')
    .in('id', fileIds)
  if (filesError) throw new ClientBrainV2HttpError('Unable to load Visual DNA asset files.', 500)

  const fileById = new Map((files ?? []).map(file => [file.id, file]))
  const assignmentByRecord = new Map((assignments ?? []).map(assignment => [assignment.record_id, assignment]))
  const connected = selected.flatMap(record => {
    const assignment = assignmentByRecord.get(record.id)
    const file = assignment ? fileById.get(assignment.file_object_id) : null
    return assignment && file ? [{ record, assignment, file }] : []
  })
  return Promise.all(connected.map(async ({ record, assignment, file }) => {
    const path = String(file.preview_path || file.optimized_path || file.storage_path || '')
    const { data } = path
      ? await clientBrainV2ServerClient.storage.from(String(file.storage_bucket)).createSignedUrl(path, 60 * 30)
      : { data: null }
    return {
      record_id: record.id,
      title: record.title,
      category: typeof record.metadata?.legacy_asset_category === 'string' ? record.metadata.legacy_asset_category : null,
      record_status: record.status,
      semantic_role: assignment.semantic_role,
      approval_status: assignment.approval_status,
      file_name: file.file_name,
      signed_url: data?.signedUrl ?? null,
    }
  }))
}

async function loadBrandGuidelineOptions(clientId: string): Promise<ClientBrainV2BrandGuidelineOptions> {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, status, top_section, subsection, record_type')
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .in('top_section', ['assets', 'sources'])
    .order('title')
  if (error) throw new ClientBrainV2HttpError('Unable to load Brand Guideline relationship options.', 500)

  const rows = data ?? []
  const assetRows = rows.filter(record => record.top_section === 'assets' && record.subsection === 'brand_files')
  const filesByRecord = await loadCommercialRecordFiles(clientId, assetRows.map(record => record.id))
  const option = (record: typeof rows[number]): ClientBrainV2BrandGuidelineOption => ({
    id: record.id,
    title: record.title,
    status: record.status,
    subsection: record.subsection,
    record_type: record.record_type,
    files: filesByRecord.get(record.id) ?? [],
  })
  return {
    assets: assetRows.map(option),
    sources: rows.filter(record => record.top_section === 'sources').map(option),
  }
}

async function loadSectionRelationships(clientId: string, records: ClientBrainV2Record[]) {
  const relationshipsByRecord = new Map<string, ClientBrainV2RecordRelationship[]>()
  if (records.length === 0) return relationshipsByRecord

  const recordIds = new Set(records.map(record => record.id))
  const { data: links, error: linksError } = await clientBrainV2ServerClient
    .from('client_brain_v2_links')
    .select('id, from_record_id, to_record_id, relation_type, metadata')
    .eq('client_id', clientId)
  if (linksError) throw new ClientBrainV2HttpError('Unable to load Client Brain relationships.', 500)

  const relevantLinks = (links ?? []).filter(link => recordIds.has(link.from_record_id) || recordIds.has(link.to_record_id))
  const relatedIds = [...new Set(relevantLinks.flatMap(link => [link.from_record_id, link.to_record_id]).filter(id => !recordIds.has(id)))]
  const { data: relatedRecords, error: relatedRecordsError } = relatedIds.length
    ? await clientBrainV2ServerClient.from('client_brain_v2_records')
      .select('id, client_id, stable_key, top_section, subsection, record_type, title, summary, status, effective_date, last_verified_at, valid_until, review_at, source_type, metadata')
      .eq('client_id', clientId)
      .in('id', relatedIds)
    : { data: [], error: null }
  if (relatedRecordsError) throw new ClientBrainV2HttpError('Unable to load related Client Brain records.', 500)

  // Sources are evidence records. Their files are opened through a short-lived,
  // on-demand URL rather than being signed for every related card on page load.
  const relatedFiles = records[0]?.top_section === 'sources'
    ? new Map<string, ClientBrainV2File[]>()
    : await loadCommercialRecordFiles(clientId, relatedIds)
  const recordById = new Map<string, Pick<ClientBrainV2Record, 'id' | 'stable_key' | 'top_section' | 'subsection' | 'record_type' | 'title' | 'summary' | 'status' | 'effective_date' | 'last_verified_at' | 'valid_until' | 'review_at' | 'source_type' | 'metadata' | 'files'>>()
  for (const record of records) recordById.set(record.id, record)
  for (const record of relatedRecords ?? []) recordById.set(record.id, { ...record, files: relatedFiles.get(record.id) ?? [] } as ClientBrainV2Record)

  for (const link of relevantLinks) {
    const outgoing = recordIds.has(link.from_record_id)
    const ownerId = outgoing ? link.from_record_id : link.to_record_id
    const related = recordById.get(outgoing ? link.to_record_id : link.from_record_id)
    if (!related) continue
    const current = relationshipsByRecord.get(ownerId) ?? []
    current.push({
      id: link.id,
      relation_type: link.relation_type,
      direction: outgoing ? 'outgoing' : 'incoming',
      metadata: link.metadata ?? {},
      record: related,
    })
    relationshipsByRecord.set(ownerId, current)
  }
  return relationshipsByRecord
}

async function loadLearningOptions(clientId: string): Promise<ClientBrainV2LearningOptions> {
  const { data, error } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('id, title, subsection, status')
    .eq('client_id', clientId)
    .eq('top_section', 'sources')
    .neq('status', 'archived')
    .order('title')
  if (error) throw new ClientBrainV2HttpError('Unable to load Learning source options.', 500)
  return { sources: data ?? [] }
}

export async function loadClientBrainV2(clientId: string, section: ClientBrainV2Section) {
  const client = await requireClientBrainV2(clientId)
  if (section === 'assets' && isRestaurantClientBrainV2(client.brain_architecture_version)) {
    return loadRestaurantClientBrainV2AssetList(clientId, client)
  }

  const { data: countRows, error: countError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('top_section, subsection, status')
    .eq('client_id', clientId)
    .or('status.neq.archived,top_section.eq.learnings')

  if (countError) throw new ClientBrainV2HttpError('Unable to load Client Brain counts.', 500)

  let recordsQuery = clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('*')
    .eq('client_id', clientId)
    .eq('top_section', section)
  if (section !== 'learnings') recordsQuery = recordsQuery.neq('status', 'archived')
  recordsQuery = recordsQuery.order('priority', { ascending: false })
    .order('title', { ascending: true })

  const { data: records, error: recordsError } = await recordsQuery
  if (recordsError) throw new ClientBrainV2HttpError('Unable to load Client Brain records.', 500)
  const [visualAssetReferences, commercialStrategyObjects, intelligenceSourceRecords] = section === 'intelligence'
    ? await Promise.all([
        loadVisualAssetReferences(clientId),
        loadCommercialStrategyObjects(clientId),
        loadOperationsSourceRecords(clientId),
      ])
    : [[], [], []]
  const assetEditOptions = null
  const brandGuidelineOptions = section === 'brand_guidelines'
    ? await loadBrandGuidelineOptions(clientId)
    : null
  const learningOptions = section === 'learnings'
    ? await loadLearningOptions(clientId)
    : null

  const recordIds = (records ?? []).map(record => record.id)
  const commercialByRecord = new Map<string, Record<string, unknown>>()
  const filesByRecord = new Map<string, Array<Record<string, unknown>>>()
  const legacyAssetByRecord = new Map<string, Record<string, unknown>>()
  const versionsByRecord = new Map<string, ClientBrainV2RecordVersion[]>()

  if (recordIds.length > 0) {
    const legacyAssetUploadIds = [...new Set((records ?? []).flatMap(record => record.legacy_asset_upload_id ? [record.legacy_asset_upload_id] : []))]
    const [commercialResult, assignmentsResult, legacyAssetsResult, versionsResult] = await Promise.all([
      clientBrainV2ServerClient
        .from('client_brain_v2_commercial_details')
        .select('*')
        .eq('client_id', clientId)
        .in('record_id', recordIds),
      clientBrainV2ServerClient
        .from('client_brain_v2_record_files')
        .select('id, record_id, file_object_id, semantic_role, approval_status, sort_order')
        .eq('client_id', clientId)
        .in('record_id', recordIds)
        .order('sort_order'),
      legacyAssetUploadIds.length
        ? clientBrainV2ServerClient
          .from('asset_uploads')
          .select('id, asset_category, file_name, file_type, status, original_width, original_height, metadata')
          .in('id', legacyAssetUploadIds)
        : Promise.resolve({ data: [], error: null }),
      section === 'sources' || section === 'learnings'
        ? clientBrainV2ServerClient
          .from('client_brain_v2_record_versions')
          .select('id, record_id, changed_at, version_snapshot')
          .eq('client_id', clientId)
          .in('record_id', recordIds)
          .order('changed_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (commercialResult.error) throw new ClientBrainV2HttpError('Unable to load commercial details.', 500)
    if (assignmentsResult.error) throw new ClientBrainV2HttpError('Unable to load asset assignments.', 500)
    if (legacyAssetsResult.error) throw new ClientBrainV2HttpError('Unable to load legacy asset metadata.', 500)
    if (versionsResult.error) throw new ClientBrainV2HttpError('Unable to load record history.', 500)

    for (const detail of commercialResult.data ?? []) commercialByRecord.set(detail.record_id, detail)
    for (const version of versionsResult.data ?? []) {
      const current = versionsByRecord.get(version.record_id) ?? []
      if (current.length < 20) current.push({ id: version.id, changed_at: version.changed_at, version_snapshot: version.version_snapshot ?? {} })
      versionsByRecord.set(version.record_id, current)
    }
    const legacyAssetById = new Map((legacyAssetsResult.data ?? []).map(asset => [asset.id, asset]))
    for (const record of records ?? []) {
      const legacyAsset = record.legacy_asset_upload_id ? legacyAssetById.get(record.legacy_asset_upload_id) : null
      if (legacyAsset) legacyAssetByRecord.set(record.id, legacyAsset)
    }

    const fileObjectIds = [...new Set((assignmentsResult.data ?? []).map(row => row.file_object_id))]
    const fileObjectsById = new Map<string, Record<string, unknown>>()
    if (fileObjectIds.length > 0) {
      const { data: fileObjects, error: fileObjectsError } = await clientBrainV2ServerClient
        .from('client_brain_file_objects')
        .select('*')
        .in('id', fileObjectIds)
      if (fileObjectsError) throw new ClientBrainV2HttpError('Unable to load asset files.', 500)
      for (const file of fileObjects ?? []) fileObjectsById.set(file.id, file)
    }

    await Promise.all((assignmentsResult.data ?? []).map(async assignment => {
      const file = fileObjectsById.get(assignment.file_object_id)
      if (!file) return
      const path = String(file.preview_path || file.optimized_path || file.storage_path || '')
      let signedUrl: string | null = null
      if (path && section !== 'sources') {
        const { data } = await clientBrainV2ServerClient.storage
          .from(String(file.storage_bucket))
          .createSignedUrl(path, 60 * 30)
        signedUrl = data?.signedUrl ?? null
      }
      const current = filesByRecord.get(assignment.record_id) ?? []
      current.push({
        ...assignment,
        file_object_id: assignment.file_object_id,
        file_name: file.file_name,
        file_type: file.file_type,
        storage_path: file.storage_path,
        preview_path: file.preview_path,
        optimized_path: file.optimized_path,
        file_size_bytes: file.file_size_bytes ?? null,
        metadata: file.metadata ?? {},
        signed_url: signedUrl,
      })
      filesByRecord.set(assignment.record_id, current)
    }))
  }

  const sectionCounts: Record<string, number> = {}
  const subsectionCounts: Record<string, number> = {}
  const statusCounts: Record<string, number> = {}
  for (const row of countRows ?? []) {
    sectionCounts[row.top_section] = (sectionCounts[row.top_section] ?? 0) + 1
    const subsectionKey = `${row.top_section}:${row.subsection}`
    subsectionCounts[subsectionKey] = (subsectionCounts[subsectionKey] ?? 0) + 1
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
  }

  const intelligenceRecords = (records ?? []) as OverviewRecord[]
  const intelligenceAggregates = section === 'intelligence' ? {
    overview: buildClientOverview(client, intelligenceRecords),
    brandIdentity: buildBrandIdentity(intelligenceRecords),
    audience: buildAudience(intelligenceRecords),
    visualDna: buildVisualDna(intelligenceRecords, visualAssetReferences),
    commercialStrategy: buildCommercialStrategy(intelligenceRecords, commercialStrategyObjects),
    operations: buildOperations(intelligenceRecords, commercialStrategyObjects, intelligenceSourceRecords),
    marketIntelligence: buildMarketIntelligence(intelligenceRecords, intelligenceSourceRecords),
    knowledgeGaps: buildKnowledgeGaps((records ?? []) as ClientBrainV2Record[], client.name),
  } : null
  if (intelligenceAggregates) applyCanonicalIntelligenceEdits(intelligenceAggregates, intelligenceRecords)

  const enrichedRecords = (records ?? []).map(record => ({
    ...record,
    commercial: commercialByRecord.get(record.id) ?? null,
    files: filesByRecord.get(record.id) ?? [],
    legacy_asset: legacyAssetByRecord.get(record.id) ?? null,
    versions: versionsByRecord.get(record.id) ?? [],
  })) as ClientBrainV2Record[]
  const relationshipsByRecord = await loadSectionRelationships(clientId, enrichedRecords)
  const recordsWithRelationships = enrichedRecords.map(record => {
    const withRelationships = { ...record, relationships: relationshipsByRecord.get(record.id) ?? [] }
    return record.subsection === 'activations' && record.record_type === 'activation'
      ? { ...withRelationships, activation_temporal: resolveActivationFreshness(withRelationships) }
      : withRelationships
  })
  const brandGuidelines = section === 'brand_guidelines'
    ? buildBrandGuidelineWorkspaces(recordsWithRelationships)
    : null

  return {
    client,
    section,
    overview: intelligenceAggregates?.overview ?? null,
    brandIdentity: intelligenceAggregates?.brandIdentity ?? null,
    audience: intelligenceAggregates?.audience ?? null,
    visualDna: intelligenceAggregates?.visualDna ?? null,
    commercialStrategy: intelligenceAggregates?.commercialStrategy ?? null,
    operations: intelligenceAggregates?.operations ?? null,
    marketIntelligence: intelligenceAggregates?.marketIntelligence ?? null,
    knowledgeGaps: intelligenceAggregates?.knowledgeGaps ?? null,
    editWorkspaces: intelligenceAggregates ? buildEditWorkspaces(intelligenceAggregates, intelligenceRecords) : null,
    assetEditOptions,
    brandGuidelineOptions,
    learningOptions,
    brandGuidelines,
    records: recordsWithRelationships,
    counts: {
      total: (countRows ?? []).length,
      sections: sectionCounts,
      subsections: subsectionCounts,
      statuses: statusCounts,
    },
  }
}

async function loadCommercialRecordFiles(clientId: string, recordIds: string[]) {
  const filesByRecord = new Map<string, ClientBrainV2File[]>()
  if (recordIds.length === 0) return filesByRecord

  const { data: assignments, error: assignmentsError } = await clientBrainV2ServerClient
    .from('client_brain_v2_record_files')
    .select('id, record_id, file_object_id, semantic_role, approval_status, sort_order')
    .eq('client_id', clientId)
    .in('record_id', recordIds)
    .order('sort_order')

  if (assignmentsError) throw new ClientBrainV2HttpError('Unable to load commercial asset assignments.', 500)
  const fileObjectIds = [...new Set((assignments ?? []).map(assignment => assignment.file_object_id))]
  if (fileObjectIds.length === 0) return filesByRecord

  const { data: fileObjects, error: fileObjectsError } = await clientBrainV2ServerClient
    .from('client_brain_file_objects')
    .select('id, storage_bucket, storage_path, preview_path, optimized_path, file_name, file_type, file_size_bytes, metadata')
    .in('id', fileObjectIds)

  if (fileObjectsError) throw new ClientBrainV2HttpError('Unable to load commercial asset files.', 500)
  const fileObjectsById = new Map((fileObjects ?? []).map(file => [file.id, file]))

  await Promise.all((assignments ?? []).map(async assignment => {
    const file = fileObjectsById.get(assignment.file_object_id)
    if (!file) return
    const path = String(file.preview_path || file.optimized_path || file.storage_path || '')
    const { data: signed } = path
      ? await clientBrainV2ServerClient.storage.from(file.storage_bucket).createSignedUrl(path, 60 * 30)
      : { data: null }
    const current = filesByRecord.get(assignment.record_id) ?? []
    current.push({
      id: assignment.id,
      file_object_id: assignment.file_object_id,
      semantic_role: assignment.semantic_role,
      approval_status: assignment.approval_status,
      file_name: file.file_name,
      file_type: file.file_type,
      storage_path: file.storage_path,
      preview_path: file.preview_path,
      optimized_path: file.optimized_path,
      signed_url: signed?.signedUrl ?? null,
      file_size_bytes: file.file_size_bytes ?? null,
      metadata: file.metadata ?? {},
    })
    filesByRecord.set(assignment.record_id, current)
  }))

  return filesByRecord
}

function commercialGapRules(record: ClientBrainV2Record) {
  const objectType = record.commercial?.object_type ?? record.record_type
  const rules = new Map<string, string>()
  const add = (title: string, relevance: string) => rules.set(title, relevance)

  if (['product', 'collection', 'offer'].includes(objectType)) {
    add('Current Menu PDFs And Pricing', 'Current menu, pricing, ingredients and allergen evidence are not fully verified.')
  }
  if (objectType === 'offer' || objectType === 'experience_event' || ['Pizza Program', 'Zero-Proof Aperitivo'].includes(record.title)) {
    add('Exact Offer Timings', 'Active days and service timings remain unverified for safe promotion.')
  }
  if (objectType === 'experience_event') {
    add('Upcoming Campaigns / Events / Seasonal Menus', 'The current event calendar and active seasonal priorities are not confirmed.')
  }
  if (objectType === 'package') {
    add('Capacity And Booking Rules Not Defined', 'Capacity, deposits, minimum spend and group booking rules are not confirmed.')
    add('Current Booking And Contact Details', 'The preferred verified conversion and booking route is not confirmed.')
  }

  return rules
}

export async function loadClientBrainV2CommercialDetail(
  clientId: string,
  recordId: string,
): Promise<ClientBrainV2CommercialDetail> {
  if (!isUuid(recordId)) throw new ClientBrainV2HttpError('Commercial object not found.', 404)
  const client = await requireClientBrainV2(clientId)
  if (isRestaurantClientBrainV2(client.brain_architecture_version)) {
    throw new ClientBrainV2HttpError('Commercial object not found.', 404)
  }

  const { data: recordData, error: recordError } = await clientBrainV2ServerClient
    .from('client_brain_v2_records')
    .select('*')
    .eq('client_id', clientId)
    .eq('id', recordId)
    .eq('top_section', 'products_offers')
    .neq('status', 'archived')
    .maybeSingle()

  if (recordError) throw new ClientBrainV2HttpError('Unable to load the commercial object.', 500)
  if (!recordData) throw new ClientBrainV2HttpError('Commercial object not found.', 404)

  const [commercialResult, linksResult, versionsResult] = await Promise.all([
    clientBrainV2ServerClient
      .from('client_brain_v2_commercial_details')
      .select('*')
      .eq('client_id', clientId)
      .eq('record_id', recordId)
      .maybeSingle(),
    clientBrainV2ServerClient
      .from('client_brain_v2_links')
      .select('id, from_record_id, to_record_id, relation_type, metadata')
      .eq('client_id', clientId)
      .or(`from_record_id.eq.${recordId},to_record_id.eq.${recordId}`),
    clientBrainV2ServerClient
      .from('client_brain_v2_record_versions')
      .select('id, changed_at, version_snapshot')
      .eq('client_id', clientId)
      .eq('record_id', recordId)
      .order('changed_at', { ascending: false })
      .limit(20),
  ])

  if (commercialResult.error) throw new ClientBrainV2HttpError('Unable to load commercial details.', 500)
  if (linksResult.error) throw new ClientBrainV2HttpError('Unable to load commercial relationships.', 500)
  if (versionsResult.error) throw new ClientBrainV2HttpError('Unable to load commercial history.', 500)

  const links = linksResult.data ?? []
  const linkedIds = [...new Set(links.map(link => (
    link.from_record_id === recordId ? link.to_record_id : link.from_record_id
  )))]
  const linkedRecordsResult = linkedIds.length > 0
    ? await clientBrainV2ServerClient
        .from('client_brain_v2_records')
        .select('*')
        .eq('client_id', clientId)
        .in('id', linkedIds)
        .neq('status', 'archived')
    : { data: [], error: null }

  if (linkedRecordsResult.error) throw new ClientBrainV2HttpError('Unable to load related Client Brain records.', 500)
  const linkedRecords = linkedRecordsResult.data ?? []
  const linkedCommercialIds = linkedRecords.filter(record => record.top_section === 'products_offers').map(record => record.id)
  const linkedCommercialResult = linkedCommercialIds.length > 0
    ? await clientBrainV2ServerClient
        .from('client_brain_v2_commercial_details')
        .select('*')
        .eq('client_id', clientId)
        .in('record_id', linkedCommercialIds)
    : { data: [], error: null }

  if (linkedCommercialResult.error) throw new ClientBrainV2HttpError('Unable to load related commercial details.', 500)
  const commercialByRecord = new Map((linkedCommercialResult.data ?? []).map(detail => [detail.record_id, detail]))
  const filesByRecord = await loadCommercialRecordFiles(clientId, [recordId, ...linkedIds])
  const recordsById = new Map(linkedRecords.map(record => [record.id, {
    ...record,
    commercial: commercialByRecord.get(record.id) ?? null,
    files: filesByRecord.get(record.id) ?? [],
  } as ClientBrainV2Record]))

  const relationships = links.flatMap(link => {
    const direction = link.from_record_id === recordId ? 'outgoing' as const : 'incoming' as const
    const relatedId = direction === 'outgoing' ? link.to_record_id : link.from_record_id
    const relatedRecord = recordsById.get(relatedId)
    if (!relatedRecord) return []
    return [{
      id: link.id,
      relation_type: link.relation_type,
      direction,
      metadata: link.metadata ?? {},
      record: relatedRecord,
    } satisfies ClientBrainV2CommercialRelationship]
  })

  const gapRules = commercialGapRules({
    ...recordData,
    commercial: commercialResult.data ?? null,
    files: filesByRecord.get(recordId) ?? [],
  } as ClientBrainV2Record)
  const gapResult = gapRules.size > 0
    ? await clientBrainV2ServerClient
        .from('client_brain_v2_records')
        .select('*')
        .eq('client_id', clientId)
        .eq('record_type', 'knowledge_gap')
        .in('title', [...gapRules.keys()])
        .in('status', ['active', 'needs_review'])
        .order('priority', { ascending: false })
    : { data: [], error: null }

  if (gapResult.error) throw new ClientBrainV2HttpError('Unable to load related knowledge gaps.', 500)
  const knowledgeGaps = (gapResult.data ?? []).map(gap => ({
    record: gap as ClientBrainV2Record,
    relevance: gapRules.get(gap.title) ?? 'This unresolved knowledge affects safe commercial use.',
  } satisfies ClientBrainV2CommercialGap))

  const record = {
    ...recordData,
    commercial: commercialResult.data ?? null,
    files: filesByRecord.get(recordId) ?? [],
  } as ClientBrainV2Record

  return {
    client,
    record,
    related_commercial_objects: relationships.filter(relationship => relationship.record.top_section === 'products_offers'),
    related_assets: relationships.filter(relationship => relationship.record.top_section === 'assets'),
    sources: relationships.filter(relationship => relationship.record.top_section === 'sources'),
    knowledge_gaps: knowledgeGaps,
    versions: (versionsResult.data ?? []) as ClientBrainV2CommercialDetail['versions'],
  }
}
