import 'server-only'

import { createHash } from 'crypto'
import { clientBrainV2ServerClient as db, isUuid } from '@/lib/client-brain-v2-server-core'
import { jarvisResearchProvider } from '@/lib/jarvis-research-provider'
import { executeTextRun } from '@/lib/executionEngine'
import { classifyDiscovery, type ResearchIdentity } from '@/lib/client-intelligence-entity-resolution'

export const INTELLIGENCE_CATEGORIES = ['brand','reputation','audience','competitor','market','social','opportunity'] as const
export type IntelligenceCategory = typeof INTELLIGENCE_CATEGORIES[number]
export function sourceFreshness(retrievedAt: string, publishedAt?: string | null) {
  const age = Date.now() - Date.parse(publishedAt || retrievedAt)
  if (!Number.isFinite(age)) return 'unknown' as const
  if (age <= 31 * 86_400_000) return 'current' as const
  if (age <= 180 * 86_400_000) return 'aging' as const
  return 'stale' as const
}
export function sourceQuality(type: string) { return ({ official_website: 'official', official_social: 'official', market: 'reputable', reviews: 'review_platform', competitor: 'competitor' }[type] ?? 'low') }
export function hasAlcoholConflict(externalClaim: string, canonicalTruth: string[]) {
  return /\b(alcohol|wine|cocktail|beer|spirits)\b/i.test(externalClaim) && canonicalTruth.some(value => /\b(no alcohol|does not sell alcohol|alcohol[- ]free)\b/i.test(value))
}
export type PublicDiscrepancy = { category: 'contact'; publicValue: string; verifiedValue: string; confidence: 'high' | 'medium' | 'low' }
export function detectPublicContactDiscrepancies(excerpt: string | null | undefined, verifiedPhones: string[]): PublicDiscrepancy[] {
  const publicPhones = unique((excerpt?.match(/\+971[\s\-()\d]+|0\d[\s\-()\d]{7,}/g) ?? []).map(value => value.replace(/[^+\d]/g, '')))
  return publicPhones.filter(phone => !verifiedPhones.includes(phone)).map(phone => ({ category: 'contact', publicValue: phone, verifiedValue: verifiedPhones.join(', '), confidence: 'medium' }))
}
export async function loadClientIntelligence(clientId: string) {
  if (!isUuid(clientId)) throw new Error('Client is invalid.')
  const [client, scans, claims, evidence, opportunities, competitors, sourceRecords, discrepancies] = await Promise.all([
    db.from('clients').select('id,name').eq('id', clientId).maybeSingle(), db.from('client_intelligence_scans').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
    db.from('client_intelligence_claims').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(120), db.from('client_intelligence_evidence').select('*').eq('client_id', clientId).order('retrieved_at', { ascending: false }).limit(160),
    db.from('client_intelligence_opportunities').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(40), db.from('client_intelligence_competitors').select('*').eq('client_id', clientId).order('name'),
    db.from('client_brain_v2_records').select('title,metadata').eq('client_id', clientId).eq('top_section', 'sources'),
    db.from('client_intelligence_public_discrepancies').select('id,scan_id,category,public_value,verified_value,confidence,status').eq('client_id', clientId).eq('status', 'needs_attention').order('created_at', { ascending: false }).limit(24),
  ])
  if (client.error || !client.data || scans.error || claims.error || evidence.error || opportunities.error || competitors.error || sourceRecords.error || discrepancies.error) throw new Error('Intelligence scanner could not be loaded.')
  const scanIds = (scans.data ?? []).map(scan => scan.id)
  const steps = scanIds.length ? await db.from('client_intelligence_scan_steps').select('id,scan_id,step_key,provider,status,error_message,started_at,completed_at').in('scan_id', scanIds).order('created_at') : { data: [], error: null }
  if (steps.error) throw new Error('Intelligence scan progress could not be loaded.')
  const knownUrls = (sourceRecords.data ?? []).flatMap(record => { const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : {}; const source = metadata.source_v2 && typeof metadata.source_v2 === 'object' ? metadata.source_v2 as Record<string, unknown> : {}; return typeof source.url === 'string' ? [{ title: record.title, url: source.url }] : [] })
  const identity = await loadResearchIdentity(clientId)
  return { client: client.data, scans: scans.data ?? [], steps: steps.data ?? [], claims: claims.data ?? [], evidence: evidence.data ?? [], opportunities: opportunities.data ?? [], competitors: competitors.data ?? [], discrepancies: discrepancies.data ?? [], knownUrls, identityReady: Boolean(identity.officialDomains.length || identity.officialInstagramHandles.length), liveEnabled: false }
}
export async function confirmIntelligenceClaim(clientId: string, claimId: string, promote = false) {
  if (!isUuid(clientId) || !isUuid(claimId)) throw new Error('Claim is invalid.')
  const { data: claim, error } = await db.from('client_intelligence_claims').select('*').eq('id', claimId).eq('client_id', clientId).maybeSingle()
  if (error || !claim) throw new Error('Claim was not found for this client.')
  if (claim.change_status === 'conflict') throw new Error('Resolve the conflict with verified Client Brain truth before promotion.')
  let promotionRecordId: string | null = null
  if (promote) {
    const subsection = claim.category === 'brand' ? 'brand_identity' : claim.category === 'audience' ? 'audience' : claim.category === 'market' ? 'market_intelligence' : 'commercial_strategy'
    const { data: record, error: insertError } = await db.from('client_brain_v2_records').insert({ client_id: clientId, stable_key: `scanner:${claim.id}`, top_section: 'intelligence', subsection, record_type: 'scanner_confirmed_claim', title: claim.title, summary: claim.claim, content: claim.interpretation, knowledge_class: 'dynamic', status: 'current', confidence: claim.confidence === 'high' ? .85 : claim.confidence === 'medium' ? .65 : .4, source_type: 'research_web', provenance: { scanner_claim_id: claim.id, explicit_user_confirmation: true }, metadata: { scanner: true, truth_status: 'user_confirmed' } }).select('id').single()
    if (insertError || !record) throw new Error('Confirmed claim could not be promoted to Client Brain.')
    promotionRecordId = record.id
  }
  const { error: updateError } = await db.from('client_intelligence_claims').update({ truth_status: 'user_confirmed', promotion_record_id: promotionRecordId }).eq('id', claimId).eq('client_id', clientId)
  if (updateError) throw new Error('Claim confirmation could not be saved.')
  return loadClientIntelligence(clientId)
}
export function scannerPlan(input: Record<string, unknown>) {
  const urls = ['website','instagram','maps','other'].flatMap(key => typeof input[key] === 'string' && input[key].trim() ? [input[key].trim()] : [])
  if (!urls.length) throw new Error('Add at least one public business source.')
  return {
    sourceCount: urls.length,
    maxTavilyCalls: SCANNER_STANDARD_PROFILE.maxTavilyCalls,
    maxSonnetCalls: SCANNER_STANDARD_PROFILE.maxSonnetCalls,
    maxProviderCalls: SCANNER_STANDARD_PROFILE.maxTavilyCalls + SCANNER_STANDARD_PROFILE.maxSonnetCalls,
    estimatedCostUsd: SCANNER_STANDARD_PROFILE.maxEstimatedUsd,
    status: 'authorization_required' as const,
  }
}
export function scannerFixtureFingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

export const SCANNER_STANDARD_PROFILE = { maxTavilyCalls: 8, maxSonnetCalls: 3, maxResearchDepth: 1, maxSources: 32, maxEstimatedUsd: 2.5, model: 'claude-sonnet-4-6', maxRetries: 0 } as const
export const SCANNER_SYNTHESIS_TIMEOUT_MS = 120_000
export const SCANNER_STEPS = [
  { key: 'brand_reputation_audience', provider: 'tavily', areas: ['brand','reputation','audience'] },
  { key: 'competitors_market_social', provider: 'tavily', areas: ['competitor','market','social'] },
  { key: 'synthesis_foundations', provider: 'anthropic', areas: ['brand','reputation','audience'] },
  { key: 'synthesis_landscape', provider: 'anthropic', areas: ['competitor','market','social'] },
  { key: 'synthesis_opportunities', provider: 'anthropic', areas: ['opportunity'] },
] as const
type EvidenceInput = { id: string; source_url: string; source_title?: string | null; excerpt?: string | null; source_quality: string; freshness: string; source_type: string }
export function normalizeEvidence<T extends EvidenceInput>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => { const key = `${item.source_url.replace(/\?.*$/, '').toLowerCase()}|${(item.excerpt ?? '').trim().slice(0, 240).toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return Boolean(item.excerpt?.trim()) }).slice(0, SCANNER_STANDARD_PROFILE.maxSources)
}
export function buildSonnetSynthesisPrompt(evidence: EvidenceInput[], verifiedContext: string[]) {
  return `You are analyzing only an admitted evidence package for one client. Do not browse, assume facts not contained in evidence, or use unrelated internal data. If evidence is insufficient, return insufficient_evidence. Every public claim must carry only valid supplied evidence_ids. A claim without evidence_ids cannot be strong_external_evidence. Verified Client Brain context is compact conflict authority, not public evidence; never overwrite or promote it. Separate observation from interpretation. Opportunities are testable hypotheses, never forecasts.\nVERIFIED CONTEXT (conflict authority):\n${verifiedContext.slice(0, 12).join('\n')}\nADMITTED EVIDENCE:\n${normalizeEvidence(evidence).map(item => `[${item.id}] ${item.source_type}/${item.source_quality}/${item.freshness}: ${item.excerpt}`).join('\n')}`
}
export function validateSynthesisClaims(raw: Array<Record<string, unknown>>, evidenceIds: Set<string>): Array<Record<string, unknown> & { evidence_ids: string[]; truth_status: string; rejected_phantom_citations: boolean }> {
  return raw.flatMap(item => {
    const ids = Array.isArray(item.evidence_ids) ? item.evidence_ids.filter((id): id is string => typeof id === 'string' && evidenceIds.has(id)) : []
    const truth = item.truth_status === 'strong_external_evidence' && ids.length === 0 ? 'needs_confirmation' : String(item.truth_status ?? 'needs_confirmation')
    if (!['brand','reputation','audience','competitor','market','social','opportunity'].includes(String(item.category)) || !String(item.title ?? '').trim() || !String(item.claim ?? '').trim() || (Array.isArray(item.evidence_ids) && ids.length !== item.evidence_ids.length)) return []
    return [{ ...item, evidence_ids: ids, truth_status: truth, rejected_phantom_citations: ids.length !== (Array.isArray(item.evidence_ids) ? item.evidence_ids.length : 0) }]
  })
}
export async function authorizeIntelligenceScan(clientId: string, executionId: string, sourceInputs: Record<string, unknown>) {
  if (!isUuid(clientId) || !isUuid(executionId)) throw new Error('Client or execution ID is invalid.')
  const { data: existing, error: existingError } = await db.from('client_intelligence_scans').select('*').eq('client_id', clientId).eq('execution_id', executionId).maybeSingle()
  if (existingError) throw new Error('Scan execution could not be read.')
  if (existing) return existing
  const identity = await loadResearchIdentity(clientId)
  if (!identity.officialDomains.length && !identity.officialInstagramHandles.length) throw new Error('Canonical identity is incomplete: verify the official website or exact Instagram handle in Client Brain before authorizing research.')
  const { data: scan, error } = await db.from('client_intelligence_scans').insert({ client_id: clientId, execution_id: executionId, status: 'authorized', source_inputs: sourceInputs, entity_resolution_version: 'v1.2', request_budget_usd: SCANNER_STANDARD_PROFILE.maxEstimatedUsd, estimated_cost_usd: SCANNER_STANDARD_PROFILE.maxEstimatedUsd, max_provider_calls: SCANNER_STANDARD_PROFILE.maxTavilyCalls + SCANNER_STANDARD_PROFILE.maxSonnetCalls, max_tavily_calls: SCANNER_STANDARD_PROFILE.maxTavilyCalls, max_sonnet_calls: SCANNER_STANDARD_PROFILE.maxSonnetCalls, max_research_depth: SCANNER_STANDARD_PROFILE.maxResearchDepth, max_sources: SCANNER_STANDARD_PROFILE.maxSources }).select('*').single()
  if (error || !scan) throw new Error('Scan authorization could not be saved.')
  const { error: stepsError } = await db.from('client_intelligence_scan_steps').insert(SCANNER_STEPS.map(step => ({ scan_id: scan.id, step_key: step.key, provider: step.provider, input_metadata: { areas: step.areas, max_retries: 0 } })))
  if (stepsError) throw new Error('Scan plan steps could not be saved.')
  return scan
}

type ScanRow = Record<string, unknown> & { id: string; client_id: string; status: string; source_inputs: Record<string, unknown>; execution_id: string }
type TavilyEvidence = EvidenceInput & { areas: string[]; research_source_id?: string | null }
const SYNTHESIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['completed', 'insufficient_evidence'] },
    claims: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['category', 'title', 'claim', 'interpretation', 'truth_status', 'confidence', 'confidence_reason', 'evidence_ids', 'change_status'], properties: {
      category: { type: 'string', enum: INTELLIGENCE_CATEGORIES }, title: { type: 'string' }, claim: { type: 'string' }, interpretation: { type: 'string' },
      truth_status: { type: 'string', enum: ['strong_external_evidence', 'hypothesis', 'needs_confirmation'] }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, confidence_reason: { type: 'string' }, evidence_ids: { type: 'array', items: { type: 'string' } }, change_status: { type: 'string', enum: ['new', 'changed', 'unchanged', 'stale'] },
    } } },
    opportunities: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'observation', 'hypothesis', 'confidence'], properties: { title: { type: 'string' }, observation: { type: 'string' }, why_it_matters: { type: 'string' }, hypothesis: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, recommended_action: { type: 'string' }, metric_to_watch: { type: 'string' }, evidence_ids: { type: 'array', items: { type: 'string' } } } } },
  }, required: ['status', 'claims', 'opportunities'],
} as const

function sourceUrls(input: Record<string, unknown>) {
  return Object.entries(input).flatMap(([key, value]) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? [{ key, url: value.trim() }] : [])
}
function normalizedHost(url: string) { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }
function instagramHandle(url: string) { try { const parsed = new URL(url); if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null; const path = parsed.pathname.split('/').filter(Boolean)[0]?.toLowerCase(); return path && !['p', 'reel', 'stories', 'explore', 'accounts'].includes(path) ? path : null } catch { return null } }
function textValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textValues)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(textValues)
  return []
}
function unique(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))] }
function readIdentityField(values: string[], expression: RegExp) { return values.find(value => expression.test(value)) }
async function loadResearchIdentity(clientId: string): Promise<ResearchIdentity> {
  const [clientResult, sourceResult, truthResult] = await Promise.all([
    db.from('clients').select('name').eq('id', clientId).single(),
    db.from('client_brain_v2_records').select('title,summary,content,metadata').eq('client_id', clientId).eq('top_section', 'sources').in('status', ['current', 'approved', 'active']),
    db.from('client_brain_v2_records').select('title,summary,content,metadata').eq('client_id', clientId).in('status', ['current', 'approved', 'active']).limit(80),
  ])
  if (clientResult.error || !clientResult.data || sourceResult.error || truthResult.error) throw new Error('Canonical client identity could not be loaded.')
  const sourceUrls = (sourceResult.data ?? []).flatMap(record => textValues(record.metadata).filter(value => /^https?:\/\//i.test(value)))
  const truthValues = (truthResult.data ?? []).flatMap(record => [record.title, record.summary, record.content, ...textValues(record.metadata)]).filter((value): value is string => typeof value === 'string')
  const allUrls = unique(sourceUrls)
  const officialDomains = unique(allUrls.map(normalizedHost).filter((value): value is string => Boolean(value && !/(^|\.)instagram\.com$/i.test(value))))
  const officialInstagramHandles = unique(allUrls.map(instagramHandle).filter((value): value is string => Boolean(value)))
  const canonicalName = clientResult.data.name.trim()
  const nameVariants = unique([canonicalName, canonicalName.replace(/\brestaurant\b/ig, '').trim(), canonicalName.replace(/democlientb/ig, 'Luna Rossa')])
  const relevantValues = truthValues.filter(value => /dubai|business bay|united arab emirates|uae|italian|democlientb|\+971|reservations|restaurant/i.test(value))
  const phones = unique(relevantValues.flatMap(value => value.match(/\+971[\s\-()\d]+|0\d[\s\-()\d]{7,}/g) ?? []).map(value => value.replace(/[^+\d]/g, '')))
  return {
    canonicalName,
    nameVariants,
    officialDomains,
    officialInstagramHandles,
    country: readIdentityField(relevantValues, /united arab emirates|\buae\b/i) ? 'United Arab Emirates' : undefined,
    city: readIdentityField(relevantValues, /\bdubai\b/i) ? 'Dubai' : undefined,
    area: readIdentityField(relevantValues, /business bay/i) ? 'Business Bay' : undefined,
    address: readIdentityField(relevantValues, /marasi drive|\bj one\b/i),
    category: readIdentityField(relevantValues, /italian.*restaurant|restaurant.*italian/i) ? 'Italian restaurant' : undefined,
    phones,
    excludedRelatedNames: ['DemoClientC'],
  }
}
function researchJobs(identity: ResearchIdentity) {
  const website = identity.officialDomains[0]
  const instagram = identity.officialInstagramHandles[0]
  const location = [identity.area, identity.city, identity.country].filter(Boolean).join(', ')
  return [
    { step: 'brand_reputation_audience', area: 'brand', query: `${identity.canonicalName} ${location} official restaurant brand positioning`, domains: website ? [website] : [] },
    { step: 'brand_reputation_audience', area: 'reputation', query: `${identity.canonicalName} ${location} restaurant public reviews`, domains: [] as string[] },
    { step: 'brand_reputation_audience', area: 'audience', query: `${identity.canonicalName} ${location} dining audience`, domains: [] as string[] },
    { step: 'competitors_market_social', area: 'competitor', query: `${identity.city ?? 'Dubai'} ${identity.category ?? 'restaurant'} competitors`, domains: [] as string[] },
    { step: 'competitors_market_social', area: 'market', query: `${identity.country ?? 'UAE'} ${identity.category ?? 'restaurant'} market trends`, domains: [] as string[] },
    { step: 'competitors_market_social', area: 'social', query: instagram ? `site:instagram.com/${instagram} ${identity.canonicalName}` : `${identity.canonicalName} ${location} Instagram`, domains: instagram ? ['instagram.com'] : [] },
  ]
}
async function cancellationRequested(scanId: string) {
  const { data } = await db.from('client_intelligence_scans').select('cancellation_requested_at').eq('id', scanId).maybeSingle()
  return Boolean(data?.cancellation_requested_at)
}
async function updateStep(scanId: string, key: string, update: Record<string, unknown>) {
  const { error } = await db.from('client_intelligence_scan_steps').update(update).eq('scan_id', scanId).eq('step_key', key)
  if (error) throw new Error('Scan step could not be persisted.')
}
async function persistDiscoveries(scan: ScanRow, area: string, sources: Array<{ id: string; source_url: string; source_title?: string | null; excerpt?: string | null; published_at?: string | null }>, identity: ResearchIdentity) {
  if (!sources.length) return [] as TavilyEvidence[]
  const existingResult = await db.from('client_intelligence_discoveries').select('source_url').eq('scan_id', scan.id).in('source_url', sources.map(source => source.source_url))
  if (existingResult.error) throw new Error('Discovered result history could not be read.')
  const existing = new Set((existingResult.data ?? []).map(item => item.source_url))
  const decisions = sources.map(source => ({ source, decision: classifyDiscovery({ url: source.source_url, title: source.source_title, excerpt: source.excerpt, area }, identity) }))
  const rows = decisions.map(({ source, decision }) => ({
    scan_id: scan.id, client_id: scan.client_id, research_source_id: source.id, area, source_url: source.source_url, source_title: source.source_title ?? null, excerpt: source.excerpt ?? null,
    classification: existing.has(source.source_url) ? 'AMBIGUOUS' : decision.classification,
    admitted: !existing.has(source.source_url) && decision.admitted,
    rejection_reason: existing.has(source.source_url) ? 'duplicate' : decision.rejectionReason,
    source_type: decision.sourceType, source_quality: decision.sourceQuality,
  }))
  const { error } = await db.from('client_intelligence_discoveries').upsert(rows, { onConflict: 'scan_id,source_url', ignoreDuplicates: true })
  if (error) throw new Error('Discovered results could not be persisted.')
  return decisions.filter(({ source, decision }) => !existing.has(source.source_url) && decision.admitted).map(({ source, decision }) => ({
    id: '', research_source_id: source.id, source_url: source.source_url, source_title: source.source_title ?? null, excerpt: source.excerpt ?? null, source_quality: decision.sourceQuality, source_type: decision.sourceType,
    freshness: sourceFreshness(new Date().toISOString(), source.published_at), areas: [area],
  }))
}
async function refreshDiscoveryMetrics(scanId: string) {
  const { data, error } = await db.from('client_intelligence_discoveries').select('classification,admitted,rejection_reason').eq('scan_id', scanId).limit(240)
  if (error) throw new Error('Discovery metrics could not be calculated.')
  const rows = data ?? []
  const discovered = rows.length
  const admitted = rows.filter(row => row.admitted).length
  const ambiguous = rows.filter(row => row.classification === 'AMBIGUOUS').length
  const duplicates = rows.filter(row => row.rejection_reason === 'duplicate').length
  const { error: updateError } = await db.from('client_intelligence_scans').update({ discovered_result_count: discovered, admitted_evidence_count: admitted, rejected_result_count: rows.filter(row => !row.admitted && row.classification !== 'AMBIGUOUS').length, ambiguous_result_count: ambiguous, duplicate_result_count: duplicates }).eq('id', scanId)
  if (updateError) throw new Error('Discovery metrics could not be saved.')
}
async function runTavilyJob(scan: ScanRow, job: ReturnType<typeof researchJobs>[number], identity: ResearchIdentity) {
  const { data: run, error: createError } = await db.from('jarvis_research_runs').insert({ client_id: scan.client_id, feature: 'client_intelligence_scanner', provider: 'tavily', operation: 'search', objective: `Client Intelligence Scanner: ${job.area}`, query: job.query, status: 'running', started_at: new Date().toISOString(), metadata: { scanner_scan_id: scan.id, execution_id: scan.execution_id, area: job.area, automatic_retries: 0, search_depth: 'basic', max_results: 4 } }).select('id').single()
  if (createError || !run) throw new Error('Research run could not be created.')
  try {
    const result = await jarvisResearchProvider.execute({ operation: 'search', objective: `Client Intelligence Scanner: ${job.area}`, query: job.query, maxResults: 4, includeDomains: job.domains })
    const persisted = result.sources.length
      ? await db.from('jarvis_research_sources').insert(result.sources.map(source => ({
        run_id: run.id, source_url: source.url, source_title: source.title, excerpt: source.excerpt, published_at: source.publishedAt,
        relevance_score: source.relevanceScore, metadata: { ...source.metadata, scanner_scan_id: scan.id, area: job.area },
      }))).select('id,source_url,source_title,excerpt,published_at')
      : { data: [], error: null }
    const persistedSources = persisted.data
    const sourceError = persisted.error
    if (sourceError) throw new Error('Raw search results could not be retained.')
    await db.from('jarvis_research_runs').update({ status: 'completed', source_count: result.sources.length, credits_used: result.creditsUsed, latency_ms: result.latencyMs, summary: result.summary, metadata: { scanner_scan_id: scan.id, execution_id: scan.execution_id, area: job.area, automatic_retries: 0, ...result.rawMetadata }, completed_at: new Date().toISOString() }).eq('id', run.id)
    return persistDiscoveries(scan, job.area, persistedSources ?? [], identity)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tavily research failed.'
    await db.from('jarvis_research_runs').update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() }).eq('id', run.id)
    throw error
  }
}
async function persistEvidence(scan: ScanRow, items: TavilyEvidence[]) {
  const normalized = [...normalizeEvidence(items).reduce((result, item) => {
    const existing = result.get(item.source_url)
    result.set(item.source_url, existing ? { ...existing, areas: [...new Set([...existing.areas, ...item.areas])] } : item)
    return result
  }, new Map<string, TavilyEvidence>()).values()]
  if (!normalized.length) return [] as TavilyEvidence[]
  const { data, error } = await db.from('client_intelligence_evidence').upsert(normalized.map(item => ({ client_id: scan.client_id, scan_id: scan.id, research_source_id: item.research_source_id ?? null, source_type: item.source_type, source_url: item.source_url, source_title: item.source_title, excerpt: item.excerpt, normalized_evidence: item.excerpt, source_quality: item.source_quality, freshness: item.freshness, metadata: { areas: item.areas } })), { onConflict: 'scan_id,source_url' }).select('id,source_url,source_title,excerpt,source_quality,freshness,source_type,metadata')
  if (error) throw new Error('Normalized evidence could not be persisted.')
  return (data ?? []).map(row => { const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}; const areas = Array.isArray(metadata.areas) ? metadata.areas.filter((area): area is string => typeof area === 'string') : []; return { ...row, areas } })
}
async function persistPublicDiscrepancies(scan: ScanRow, evidence: TavilyEvidence[], identity: ResearchIdentity) {
  if (!identity.phones.length) return
  const rows = evidence.flatMap(item => detectPublicContactDiscrepancies(item.excerpt, identity.phones).map(discrepancy => ({ item, discrepancy })))
  if (!rows.length) return
  const evidenceIds = new Map(evidence.map(item => [item.source_url, item.id]))
  const { error } = await db.from('client_intelligence_public_discrepancies').upsert(rows.flatMap(({ item, discrepancy }) => {
    const evidenceId = evidenceIds.get(item.source_url)
    return evidenceId ? [{ client_id: scan.client_id, scan_id: scan.id, evidence_id: evidenceId, category: discrepancy.category, public_value: discrepancy.publicValue, verified_value: discrepancy.verifiedValue, confidence: discrepancy.confidence }] : []
  }), { onConflict: 'scan_id,evidence_id,category', ignoreDuplicates: true })
  if (error) throw new Error('Public discrepancy could not be retained for review.')
}
async function verifiedClientContext(clientId: string) {
  const { data, error } = await db.from('client_brain_v2_records').select('top_section,subsection,title,summary,content,status,knowledge_class').eq('client_id', clientId).in('status', ['current', 'approved', 'active']).in('top_section', ['brand_guidelines', 'products_offers', 'intelligence', 'sources']).limit(32)
  if (error) throw new Error('Verified Client Brain context could not be loaded.')
  return (data ?? []).flatMap(record => [record.summary, record.content]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map(value => record.title + ': ' + value.slice(0, 420))).slice(0, 12)
}
function synthesisSystem(areaLabel: string) {
  return `Synthesize only the supplied public evidence for ${areaLabel}. Never browse, use prior knowledge, or invent facts. Return insufficient_evidence when the evidence cannot support a point. Do not create a claim without evidence_ids from the supplied package. Public evidence is not verified Client Brain truth. Opportunities are evidence-specific hypotheses, never forecasts.`
}
async function alcoholConflictRecordId(clientId: string, claim: string) {
  const { data, error } = await db.from('client_brain_v2_records').select('id,summary,content').eq('client_id', clientId).in('status', ['current', 'approved', 'active']).limit(80)
  if (error) throw new Error('Client Brain conflict context could not be loaded.')
  const match = (data ?? []).find(record => hasAlcoholConflict(claim, [record.summary ?? '', record.content ?? '']))
  return match?.id ?? null
}
async function persistSynthesis(scan: ScanRow, stepKey: string, areaLabel: string, evidence: TavilyEvidence[], verifiedContext: string[]) {
  if (!evidence.length) { await updateStep(scan.id, stepKey, { status: 'blocked', error_message: 'Insufficient evidence: no retained sources.', completed_at: new Date().toISOString() }); return { calls: 0, failures: 1, cost: 0 } }
  await updateStep(scan.id, stepKey, { status: 'running', attempt_count: 1, started_at: new Date().toISOString() })
  const result = await executeTextRun({ provider: 'anthropic', model: SCANNER_STANDARD_PROFILE.model, feature: 'client_intelligence_scanner', route: '/api/clients/[id]/intelligence-scanner', clientId: scan.client_id, maxTokens: 2200, temperature: 0.2, timeoutMs: SCANNER_SYNTHESIS_TIMEOUT_MS, system: synthesisSystem(areaLabel), prompt: `${buildSonnetSynthesisPrompt(evidence, verifiedContext)}\n\nReturn a concise structured evidence synthesis for ${areaLabel}.`, structuredOutput: { name: 'scanner_evidence_synthesis', description: 'Evidence-bound Client Intelligence Scanner synthesis.', schema: SYNTHESIS_SCHEMA } })
  if (!result.ok || !result.structuredOutput) { await updateStep(scan.id, stepKey, { status: 'failed', error_message: result.error ?? 'Sonnet did not return a structured synthesis.', output_metadata: { model: result.model, latency_ms: result.durationMs ?? null, actual_cost_usd: result.actualCost ?? null }, completed_at: new Date().toISOString() }); return { calls: 1, failures: 1, cost: result.actualCost ?? 0 } }
  const output = result.structuredOutput
  const evidenceIds = new Set(evidence.map(item => item.id))
  const rawClaims = Array.isArray(output.claims) ? output.claims.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
  const claims = validateSynthesisClaims(rawClaims, evidenceIds)
  const phantomCount = rawClaims.length - claims.length
  const validClaims = await Promise.all(claims.map(async item => {
    const claim = String(item.claim)
    const conflictRecordId = await alcoholConflictRecordId(scan.client_id, claim)
    return { client_id: scan.client_id, scan_id: scan.id, category: String(item.category), title: String(item.title), claim, interpretation: typeof item.interpretation === 'string' ? item.interpretation : null, confidence: String(item.confidence), confidence_reason: String(item.confidence_reason), truth_status: item.truth_status, change_status: conflictRecordId ? 'conflict' : String(item.change_status), conflict_record_id: conflictRecordId, last_checked_at: new Date().toISOString() }
  }))
  if (validClaims.length) {
    const { data: inserted, error } = await db.from('client_intelligence_claims').insert(validClaims).select('id,claim')
    if (error) throw new Error('Synthesis claims could not be persisted.')
    const links = (inserted ?? []).flatMap((claim, index) => claims[index]?.evidence_ids.map(evidence_id => ({ claim_id: claim.id, evidence_id })) ?? [])
    if (links.length) await db.from('client_intelligence_claim_evidence').insert(links)
  }
  const opportunities = Array.isArray(output.opportunities) ? output.opportunities.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item) && typeof item.title === 'string' && typeof item.observation === 'string' && typeof item.hypothesis === 'string' && ['high', 'medium', 'low'].includes(String(item.confidence)) && Array.isArray(item.evidence_ids) && item.evidence_ids.every((id: unknown) => typeof id === 'string' && evidenceIds.has(id))).slice(0, 5) : []
  if (opportunities.length) {
    const { data: inserted, error } = await db.from('client_intelligence_opportunities').insert(opportunities.map(item => ({ client_id: scan.client_id, scan_id: scan.id, title: item.title, observation: item.observation, why_it_matters: typeof item.why_it_matters === 'string' ? item.why_it_matters : null, hypothesis: item.hypothesis, confidence: item.confidence, recommended_action: typeof item.recommended_action === 'string' ? item.recommended_action : null, metric_to_watch: typeof item.metric_to_watch === 'string' ? item.metric_to_watch : null }))).select('id')
    if (error) throw new Error('Synthesis opportunities could not be persisted.')
    const links = (inserted ?? []).flatMap((opportunity, index) => Array.isArray(opportunities[index]?.evidence_ids) ? opportunities[index].evidence_ids.filter((evidenceId): evidenceId is string => typeof evidenceId === 'string' && evidenceIds.has(evidenceId)).map(evidence_id => ({ opportunity_id: opportunity.id, evidence_id })) : [])
    if (links.length) {
      const { error: linkError } = await db.from('client_intelligence_opportunity_evidence').insert(links)
      if (linkError) throw new Error('Opportunity evidence links could not be persisted.')
    }
  }
  await updateStep(scan.id, stepKey, { status: phantomCount ? 'failed' : 'completed', error_message: phantomCount ? `${phantomCount} claim(s) rejected for invalid evidence IDs.` : null, output_metadata: { model: result.model, input_tokens: result.inputTokens ?? null, output_tokens: result.outputTokens ?? null, latency_ms: result.durationMs ?? null, actual_cost_usd: result.actualCost ?? null, status: output.status, retained_claims: validClaims.length, rejected_phantom_citations: phantomCount }, completed_at: new Date().toISOString() })
  return { calls: 1, failures: phantomCount ? 1 : 0, cost: result.actualCost ?? 0 }
}
export async function executeAuthorizedIntelligenceScan(clientId: string, executionId: string) {
  if (!isUuid(clientId) || !isUuid(executionId)) throw new Error('Client or execution ID is invalid.')
  const { data, error } = await db.from('client_intelligence_scans').select('*').eq('client_id', clientId).eq('execution_id', executionId).maybeSingle()
  const scan = data as ScanRow | null
  if (error || !scan) throw new Error('Authorized scan was not found.')
  if (['completed', 'partial', 'failed', 'cancelled', 'blocked'].includes(scan.status)) return scan
  if (scan.status !== 'researching') throw new Error('This scan has not been queued for execution.')
  const sources = sourceUrls(scan.source_inputs)
  if (!sources.length) throw new Error('Authorized scan has no valid public sources.')
  const identity = await loadResearchIdentity(clientId)
  if (!identity.officialDomains.length && !identity.officialInstagramHandles.length) throw new Error('Canonical identity has no verified official domain or Instagram handle; scan blocked before research.')
  const evidence: TavilyEvidence[] = []; let tavilyCalls = 0; let failures = 0
  const jobs = researchJobs(identity)
  for (const job of jobs) {
    if (tavilyCalls >= SCANNER_STANDARD_PROFILE.maxTavilyCalls || await cancellationRequested(scan.id)) break
    if (tavilyCalls === 0 || job.step !== jobs[tavilyCalls - 1]?.step) await updateStep(scan.id, job.step, { status: 'running', attempt_count: 1, started_at: new Date().toISOString() })
    try { evidence.push(...await runTavilyJob(scan, job, identity)) } catch (error) { failures += 1; await updateStep(scan.id, job.step, { status: 'failed', error_message: error instanceof Error ? error.message : 'Tavily research failed.', completed_at: new Date().toISOString() }) }
    tavilyCalls += 1
  }
  await db.from('client_intelligence_scan_steps').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('scan_id', scan.id).eq('status', 'running')
  if (await cancellationRequested(scan.id)) { await db.from('client_intelligence_scans').update({ status: 'cancelled', tavily_calls_used: tavilyCalls, provider_calls_used: tavilyCalls, completed_at: new Date().toISOString() }).eq('id', scan.id); return { ...scan, status: 'cancelled' } }
  await refreshDiscoveryMetrics(scan.id)
  const persistedEvidence = await persistEvidence(scan, evidence)
  await persistPublicDiscrepancies(scan, persistedEvidence, identity)
  const verifiedContext = await verifiedClientContext(clientId)
  await db.from('client_intelligence_scans').update({ status: 'synthesizing', tavily_calls_used: tavilyCalls, provider_calls_used: tavilyCalls }).eq('id', scan.id)
  let sonnetCalls = 0; let sonnetCost = 0
  for (const entry of [
    ['synthesis_foundations', 'Brand, Reputation and Audience', persistedEvidence.filter(item => item.areas.some(area => ['brand', 'reputation', 'audience'].includes(area)))],
    ['synthesis_landscape', 'Competitors, Market and Social', persistedEvidence.filter(item => item.areas.some(area => ['competitor', 'market', 'social'].includes(area)))],
    ['synthesis_opportunities', 'Evidence-specific Opportunities', persistedEvidence],
  ] as const) {
    if (await cancellationRequested(scan.id)) break
    const result = await persistSynthesis(scan, entry[0], entry[1], entry[2], verifiedContext); sonnetCalls += result.calls; sonnetCost += result.cost; failures += result.failures
  }
  const finalStatus = await cancellationRequested(scan.id) ? 'cancelled' : failures ? 'partial' : 'completed'
  const { data: finalScan, error: finalError } = await db.from('client_intelligence_scans').update({ status: finalStatus, tavily_calls_used: tavilyCalls, sonnet_calls_used: sonnetCalls, provider_calls_used: tavilyCalls + sonnetCalls, actual_cost_usd: sonnetCost, completed_at: new Date().toISOString() }).eq('id', scan.id).select('*').single()
  if (finalError || !finalScan) throw new Error('Scan completion could not be persisted.')
  return finalScan
}
export async function beginAuthorizedIntelligenceScan(clientId: string, executionId: string) {
  if (!isUuid(clientId) || !isUuid(executionId)) throw new Error('Client or execution ID is invalid.')
  const { data, error } = await db.from('client_intelligence_scans').update({ status: 'researching', started_at: new Date().toISOString() }).eq('client_id', clientId).eq('execution_id', executionId).eq('status', 'authorized').select('*').maybeSingle()
  if (error || !data) throw new Error('This scan is not available for execution.')
  return data as ScanRow
}
export async function runQueuedIntelligenceScan(clientId: string, executionId: string) {
  try { return await executeAuthorizedIntelligenceScan(clientId, executionId) }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Scanner execution failed.'
    await db.from('client_intelligence_scans').update({ status: 'failed', blocked_reason: message, completed_at: new Date().toISOString() }).eq('client_id', clientId).eq('execution_id', executionId).in('status', ['researching', 'synthesizing'])
    throw error
  }
}
export async function cancelIntelligenceScan(clientId: string, executionId: string) {
  if (!isUuid(clientId) || !isUuid(executionId)) throw new Error('Client or execution ID is invalid.')
  const { data, error } = await db.from('client_intelligence_scans').update({ cancellation_requested_at: new Date().toISOString(), status: 'cancelled', completed_at: new Date().toISOString() }).eq('client_id', clientId).eq('execution_id', executionId).in('status', ['authorized', 'researching', 'synthesizing']).select('*').maybeSingle()
  if (error || !data) throw new Error('Cancellable scan was not found.')
  await db.from('client_intelligence_scan_steps').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('scan_id', data.id).eq('status', 'queued')
  return data
}
