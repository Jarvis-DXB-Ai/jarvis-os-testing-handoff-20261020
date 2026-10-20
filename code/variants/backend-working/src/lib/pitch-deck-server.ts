import 'server-only'

import { clientBrainV2ServerClient as db } from '@/lib/client-brain-v2-server-core'
import { loadCommercialCatalogSnapshot } from '@/lib/commercial-catalog-server'
import { loadFinanceSnapshot } from '@/lib/finance-costs-server'
import { loadRoadmapSnapshot } from '@/lib/roadmap-server'
import type { PitchDeckProfile, PitchDeckSnapshot, PitchProjectionScenario, PitchResearchSource } from '@/lib/pitch-deck'

export class PitchDeckError extends Error { constructor(message: string, public status = 400) { super(message) } }
// Pitch tables ship ahead of generated Supabase types and remain server-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pitchDb = db as any
const PROFILE_ID = 'jarvis-os-investor-v1'

const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback

function scenarios(value: unknown): Record<string, PitchProjectionScenario> {
  return Object.fromEntries(Object.entries(object(value)).map(([key, raw]) => {
    const row = object(raw)
    return [key, { label: text(row.label, key), clients6: number(row.clients6), clients12: number(row.clients12), clients24: number(row.clients24), clients60: number(row.clients60), arpu: number(row.arpu), arpu6: number(row.arpu6, number(row.arpu)), arpu12: number(row.arpu12, number(row.arpu)), arpu24: number(row.arpu24, number(row.arpu)), arpu60: number(row.arpu60, number(row.arpu)) }]
  }))
}

function normalizeProfile(row: Record<string, unknown>): PitchDeckProfile {
  const market = object(row.market_assumptions)
  return {
    id: text(row.id), name: text(row.name), heroHeadline: text(row.hero_headline), heroThesis: text(row.hero_thesis), closingHeadline: text(row.closing_headline),
    founderName: text(row.founder_name), founderBio: text(row.founder_bio), founderClaimedOperatingRevenueEur: number(row.founder_claimed_operating_revenue_eur),
    proposedPreMoneyValuationEur: number(row.proposed_pre_money_valuation_eur), targetDilutionPercent: number(row.target_dilution_percent), targetClients12m: number(row.target_clients_12m),
    targetAiInfrastructureEur: number(row.target_ai_infrastructure_eur), projectionScenarios: scenarios(row.projection_scenarios),
    marketAssumptions: { euHospitalityEnterprises: number(market.eu_hospitality_enterprises), initialServiceableBusinesses: number(market.initial_serviceable_businesses), nearTermClients: number(market.near_term_clients), annualEntryRevenue: number(market.annual_entry_revenue), samNote: text(market.sam_note) },
    useOfFunds: strings(row.use_of_funds), risks: Array.isArray(row.risk_items) ? row.risk_items.map(object).map(item => ({ title: text(item.title), mitigation: text(item.mitigation) })).filter(item => item.title) : [],
    sectionStatus: Object.fromEntries(Object.entries(object(row.section_status)).map(([key, value]) => [key, text(value)])), internalNotes: text(row.internal_notes), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  }
}

function normalizeSource(row: Record<string, unknown>): PitchResearchSource {
  return { id: text(row.id), title: text(row.title), publisher: text(row.publisher), publicationDate: typeof row.publication_date === 'string' ? row.publication_date : null, sourceUrl: text(row.source_url), claimSupported: text(row.claim_supported), methodologyNote: typeof row.methodology_note === 'string' ? row.methodology_note : null }
}

export async function loadPitchDeckSnapshot(): Promise<PitchDeckSnapshot> {
  const [profileResult, sourceResult, finance, catalog, roadmap] = await Promise.all([
    pitchDb.from('pitch_deck_profiles').select('*').eq('id', PROFILE_ID).maybeSingle(),
    pitchDb.from('pitch_deck_research_sources').select('*').eq('profile_id', PROFILE_ID).eq('active', true).order('sort_order'),
    loadFinanceSnapshot(), loadCommercialCatalogSnapshot(), loadRoadmapSnapshot(),
  ])
  if (profileResult.error || !profileResult.data || sourceResult.error) throw new PitchDeckError('Pitch Deck data could not be loaded.', 500)

  const standard = catalog.products.find(product => product.slug === 'standard') ?? catalog.products.find(product => product.catalog_type === 'package' && product.name.toLowerCase().includes('standard'))
  const max = catalog.products.find(product => product.slug === 'max') ?? catalog.products.find(product => product.catalog_type === 'package' && product.name.toLowerCase().includes('max'))
  const discount = number(max?.metadata.addon_discount_percent, 25)
  const eligibleMonthly = catalog.products.filter(product => product.catalog_type === 'addon' && product.max_eligible && product.billing_unit === 'month' && product.price_amount !== null).reduce((sum, product) => sum + (product.price_amount ?? 0), 0)
  const calculatedMaxMonthly = (standard?.price_amount ?? 0) + eligibleMonthly * (1 - discount / 100)
  const maxMonthly = max?.pricing_model === 'calculated' ? calculatedMaxMonthly : max?.price_amount ?? calculatedMaxMonthly
  const mrr = finance.summary.mrrEur

  return {
    profile: normalizeProfile(profileResult.data), sources: (sourceResult.data ?? []).map((row: Record<string, unknown>) => normalizeSource(row)),
    actuals: { mrrEur: mrr, annualRunRateEur: mrr === null ? null : mrr * 12, activeRecurringRelationships: finance.income.filter(row => row.active && row.billing_cycle !== 'one_off').length, financeGeneratedAt: finance.generatedAt },
    packages: { standardMonthlyEur: standard?.price_amount ?? null, maxMonthlyEur: maxMonthly || null, maxDiscountPercent: discount, packageCount: catalog.products.filter(product => product.catalog_type === 'package').length, addonCount: catalog.products.filter(product => product.catalog_type === 'addon').length },
    roadmap: { totalProgress: roadmap.totalProgress, stages: roadmap.releases.map(release => ({ id: release.phase.id, slug: release.phase.slug, name: release.phase.name, status: release.phase.release_status, progress: release.progress, capabilities: release.capabilities.map(capability => capability.item.title).slice(0, 6) })) },
    generatedAt: new Date().toISOString(),
  }
}

function cleanText(value: unknown, label: string, max: number) { if (typeof value !== 'string' || !value.trim()) throw new PitchDeckError(`${label} is required.`); if (value.trim().length > max) throw new PitchDeckError(`${label} is too long.`); return value.trim() }
function boundedNumber(value: unknown, label: string, max = 1_000_000_000) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new PitchDeckError(`${label} is invalid.`); return parsed }

export async function updatePitchDeckProfile(input: Record<string, unknown>) {
  const expected = cleanText(input.expectedUpdatedAt, 'Expected update timestamp', 80)
  const { data: current, error } = await pitchDb.from('pitch_deck_profiles').select('updated_at').eq('id', PROFILE_ID).maybeSingle()
  if (error || !current) throw new PitchDeckError('Pitch Deck profile was not found.', 404)
  if (current.updated_at !== expected) throw new PitchDeckError('Pitch data changed elsewhere. Refresh before saving.', 409)
  const patch = {
    hero_headline: cleanText(input.heroHeadline, 'Hero headline', 240), hero_thesis: cleanText(input.heroThesis, 'Hero thesis', 600), closing_headline: cleanText(input.closingHeadline, 'Closing headline', 240),
    founder_bio: cleanText(input.founderBio, 'Founder biography', 2400), founder_claimed_operating_revenue_eur: boundedNumber(input.founderClaimedOperatingRevenueEur, 'Founder revenue reference'),
    proposed_pre_money_valuation_eur: boundedNumber(input.proposedPreMoneyValuationEur, 'Pre-money valuation'), target_dilution_percent: boundedNumber(input.targetDilutionPercent, 'Target dilution', 100),
    target_clients_12m: Math.round(boundedNumber(input.targetClients12m, '12-month client target', 1_000_000)), target_ai_infrastructure_eur: boundedNumber(input.targetAiInfrastructureEur, 'AI infrastructure target'),
    internal_notes: typeof input.internalNotes === 'string' ? input.internalNotes.trim().slice(0, 5000) || null : null,
  }
  const { data, error: saveError } = await pitchDb.from('pitch_deck_profiles').update(patch).eq('id', PROFILE_ID).eq('updated_at', expected).select('id').maybeSingle()
  if (saveError || !data) throw new PitchDeckError('Pitch data could not be saved.', saveError ? 500 : 409)
  return loadPitchDeckSnapshot()
}
