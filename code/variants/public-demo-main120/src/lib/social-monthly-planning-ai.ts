import 'server-only'

import { randomUUID } from 'crypto'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import { executeTextRun, textExecutionProviderStatus } from '@/lib/executionEngine'
import {
  diagnosticFromError,
  diagnosticMessage,
  monthlyPlanningDiagnosticError,
  sanitizeMonthlyPlanningPayload,
  startMonthlyPlanningExecution,
  updateMonthlyPlanningExecution,
} from '@/lib/social-monthly-planning-diagnostics'
import {
  MONTHLY_PLAN_GRID_ROLES,
  MONTHLY_PLAN_METHODS,
  MONTHLY_PLAN_PILLARS,
  MONTHLY_ITEM_STATUSES,
  type MonthlyPlanPillar,
  getMonthlyPlan,
} from '@/lib/social-monthly-content-plans'
import {
  buildExecutableConceptUniverse,
  EXECUTABLE_CONCEPT_ARCHETYPES,
  MONTHLY_PLANNING_PROMPT_VERSION,
  MONTHLY_PLANNING_STRATEGY_LIMITS,
  MONTHLY_PLANNING_TEXT_LIMITS,
  monthlyPlanningSystemPrompt,
  monthlyPlanningToolSchema,
  monthlyPlanningUserPrompt,
  type MonthlyPlanningAssetReference,
  type MonthlyPlanningContext,
  type ExecutablePlanningSubject,
  type MonthlyPlanningModelOutput,
  type MonthlyPlanningMode,
  type MonthlyPlanningPromptInput,
} from '@/lib/social-monthly-planning-prompt'
import { resolveMonthlyPlanningSubject, type ResolvedMonthlyPlanningSubject } from '@/lib/social-monthly-planning-subjects'
import {
  assessMonthlyPlanProductionFeasibility,
  buildProductionCapabilityInventory,
  isProductionFeasible,
  type MonthlyPlanningReadiness,
  type ProductionCapabilityProduct,
} from '@/lib/social-monthly-production-capability'

type Json = Record<string, unknown>
type RawRecord = {
  id: string
  client_id: string
  stable_key: string
  top_section: string
  subsection: string
  record_type: string
  title: string
  summary: string | null
  content: string | null
  status: string
  confidence: number | null
  metadata: Json | null
  last_verified_at: string | null
}
type RawMenuItem = {
  id: string
  canonical_name: string
  menu_section: string | null
  menu_record_id: string
  source_status: string
}

type PlanStrategy = {
  primary_objective: string
  priorities: string[]
  content_pillar_distribution: Record<string, number>
  creative_direction: string
  visual_rhythm: string
  avoid: string[]
}

type PlannedItem = {
  position: number
  planned_date: string
  date_fixed: boolean
  pillar: typeof MONTHLY_PLAN_PILLARS[number]
  objective: string
  subject: string
  subject_identity: ResolvedMonthlyPlanningSubject
  creative_concept: string
  production_method: typeof MONTHLY_PLAN_METHODS[number]
  asset_refs: string[]
  supporting_product_refs: string[]
  scene_requires_visible_products: boolean
  menu_item_refs: string[]
  activation_ref: string | null
  required_asset_notes: string
  visual_direction: string
  grid_role: typeof MONTHLY_PLAN_GRID_ROLES[number]
  commercial_rationale: string
  caption_brief: string
  planning_warnings: string[]
  planning_readiness: {
    state: 'ready' | 'needs_review' | 'needs_production_setup' | 'blocked'
    label: string
    reason: string | null
  }
  status: typeof MONTHLY_ITEM_STATUSES[number]
}

type ModelPlanOutput = MonthlyPlanningModelOutput

const RELEVANT_INTELLIGENCE_SUBSECTIONS = ['overview', 'brand_identity', 'audience', 'commercial_strategy', 'visual_dna', 'operations', 'market_intelligence']
const CURRENT_RECORD_STATUSES = new Set(['active', 'approved', 'current', 'resolved'])
const ALCOHOL_TERMS = /\b(alcohol|cocktail|wine|beer|spirits?|whisk(?:e)?y|vodka|gin|aperol|negroni|martini|champagne)\b/i
const NON_ALCOHOL_QUALIFIER = /\b(non[- ]?alcoholic|alcohol[- ]?free|zero[- ]?proof|mocktail)\b/i
const PLANNING_MAX_INPUT_CHARS = 30_000
// Monthly planning is a high-value, intentional operation. This ceiling is
// generous enough for a complete 15-post strategy without forcing compression.
const FULL_PLAN_MAX_OUTPUT_TOKENS = 10_000

function isRecord(value: unknown): value is Json {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function dataFor(record: Pick<RawRecord, 'metadata'>): Json {
  const metadata = record.metadata ?? {}
  return isRecord(metadata.editor_data) ? metadata.editor_data : metadata
}

function stringValue(value: unknown, max = 2_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function stringList(value: unknown, max = 24) {
  return Array.isArray(value)
    ? [...new Set(value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim().slice(0, 500)] : []))].slice(0, max)
    : []
}

function activationProductTruth(data: Json, activation: Pick<RawRecord, 'title'>) {
  const explicitState = stringValue(data.product_truth_status, 32).toLocaleLowerCase('en-US')
  if (explicitState === 'unresolved') return { status: 'unresolved' as const, confirmedNames: [] }
  const productBound = explicitState === 'confirmed'
    || /\b(pizza|burger|dessert|mocktail|drink|beverage|seasonal|monthly)\b/i.test(`${activation.title} ${stringValue(data.type, 160)}`)
  if (!productBound) return { status: 'not_applicable' as const, confirmedNames: [] }
  const confirmedNames = [
    stringValue(data.dish, 240),
    stringValue(data.product_name, 240),
    stringValue(data.featured_product, 240),
    ...stringList(data.inclusions, 24),
  ].filter(Boolean)
  return confirmedNames.length
    ? { status: 'confirmed' as const, confirmedNames: [...new Set(confirmedNames)] }
    : { status: 'unresolved' as const, confirmedNames: [] }
}

function exactActivationProductAssetMatch(asset: MonthlyPlanningAssetReference, activation: NonNullable<MonthlyPlanningContext['activation_catalog'][number]>) {
  const assetIdentity = asset.name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  return (activation.confirmed_product_names ?? []).some(name => name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') === assetIdentity)
}

function compactRecord(record: RawRecord) {
  const data = dataFor(record)
  const parts = [record.summary, record.content, stringList(data.values).join('; '), stringList(data.rules).map(item => isRecord(item) ? stringValue(item.text) : '').filter(Boolean).join('; ')]
    .filter((item): item is string => Boolean(item && item.trim()))
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 600)
}

function factsFrom(record: RawRecord) {
  const data = dataFor(record)
  const facts = Array.isArray(data.facts) ? data.facts : []
  const lines = facts.flatMap(fact => isRecord(fact)
    ? [stringValue(fact.label, 160), stringValue(fact.value, 500), stringValue(fact.note, 500)].filter(Boolean).join(': ')
    : [])
  const rules = Array.isArray(data.rules) ? data.rules.flatMap(rule => isRecord(rule) && stringValue(rule.strength) === 'hard_guardrail' ? [stringValue(rule.text, 700)] : []) : []
  return [...lines, ...rules]
}

function referenceKey(prefix: string, index: number) {
  return `${prefix}${String(index + 1).padStart(2, '0')}`
}

function parseJson(raw: string): ModelPlanOutput {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw monthlyPlanningDiagnosticError('Planning AI returned no structured JSON.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'submit_monthly_feed_plan' })
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1))
    if (!isRecord(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw monthlyPlanningDiagnosticError('Planning AI returned malformed structured output.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'submit_monthly_feed_plan' })
  }
}

function requiredText(value: unknown, label: string, max = 2_000) {
  const result = stringValue(value, max)
  if (!result) throw new ClientBrainV2HttpError(`Planning AI returned an empty ${label}.`, 502)
  return result
}

function controlledArray(value: unknown, label: string, max: number, maxLength: number, issue: Parameters<typeof monthlyPlanningDiagnosticError>[1]) {
  if (value == null) return []
  if (!Array.isArray(value)) throw monthlyPlanningDiagnosticError(`Planning AI returned an invalid ${label}.`, issue)
  if (value.length > max) throw monthlyPlanningDiagnosticError(`Planning AI returned more than ${max} ${label}.`, issue)
  return [...new Set(value.map(item => {
    if (typeof item !== 'string' || !item.trim()) throw monthlyPlanningDiagnosticError(`Planning AI returned an invalid ${label} value.`, issue)
    const itemText = item.trim()
    if (itemText.length > maxLength) throw monthlyPlanningDiagnosticError(`Planning AI returned a ${label} value longer than ${maxLength} characters.`, issue)
    return itemText
  }))]
}

function planMonthBounds(planMonth: string) {
  const start = new Date(`${planMonth}T00:00:00.000Z`)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
  return { start: planMonth, end: end.toISOString().slice(0, 10) }
}

function validDateInMonth(value: unknown, planMonth: string) {
  if (typeof value !== 'string' || value.trim().length !== 10) {
    throw monthlyPlanningDiagnosticError('Planning AI returned an invalid planned date.', {
      outcome: 'date_failed', stage: 'date_validation', field: 'date_or_null', value: typeof value === 'string' ? value : null,
    })
  }
  const date = value.trim()
  const { start, end } = planMonthBounds(planMonth)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end) {
    throw monthlyPlanningDiagnosticError('Planning AI returned a date outside the target month.', {
      outcome: 'date_failed', stage: 'date_validation', field: 'date_or_null', value: date,
    })
  }
  return date
}

function outputText(value: unknown, label: string, max: number, issue: Parameters<typeof monthlyPlanningDiagnosticError>[1]) {
  if (typeof value !== 'string' || !value.trim()) {
    throw monthlyPlanningDiagnosticError(`Planning AI returned an empty ${label}.`, issue)
  }
  const text = value.trim()
  if (text.length > max) {
    throw monthlyPlanningDiagnosticError(`Planning AI returned a ${label} longer than ${max} characters.`, issue)
  }
  return text
}

function outputEnum<T extends readonly string[]>(value: unknown, values: T, field: string, slot: number): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw monthlyPlanningDiagnosticError(`Slot ${slot} used unsupported ${field} '${typeof value === 'string' ? value : String(value)}'.`, {
      outcome: 'enum_failed', stage: 'enum_validation', slot, field, value: typeof value === 'string' ? value : String(value),
    })
  }
  return value as T[number]
}

function validateStrategy(
  value: unknown,
  targetCount: number,
  allowedPillars: readonly MonthlyPlanPillar[] = MONTHLY_PLAN_PILLARS,
): PlanStrategy {
  if (!isRecord(value)) throw monthlyPlanningDiagnosticError('Planning AI did not return a Monthly Strategy.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'monthly_strategy' })
  const distribution = isRecord(value.pillar_mix) ? value.pillar_mix : null
  if (!distribution) throw monthlyPlanningDiagnosticError('Planning AI returned an invalid pillar distribution.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'pillar_mix' })
  for (const pillar of MONTHLY_PLAN_PILLARS) {
    if (allowedPillars.includes(pillar)) continue
    const amount = Number(distribution[pillar] ?? 0)
    if (!Number.isInteger(amount) || amount !== 0) {
      throw monthlyPlanningDiagnosticError(`Planning AI allocated content to unavailable ${pillar} pillar.`, {
        outcome: 'enum_failed', stage: 'enum_validation', field: `pillar_mix.${pillar}`, value: String(distribution[pillar] ?? ''),
      })
    }
  }
  const normalizedDistribution = Object.fromEntries(MONTHLY_PLAN_PILLARS.map(pillar => {
    const amount = Number(distribution[pillar] ?? 0)
    if (!Number.isInteger(amount) || amount < 0) throw monthlyPlanningDiagnosticError(`Planning AI returned an invalid ${pillar} pillar count.`, { outcome: 'schema_failed', stage: 'schema_validation', field: `pillar_mix.${pillar}`, value: String(distribution[pillar] ?? '') })
    return [pillar, amount]
  })) as Record<string, number>
  if (Object.values(normalizedDistribution).reduce((sum, count) => sum + count, 0) !== targetCount) {
    throw monthlyPlanningDiagnosticError(`Planning AI pillar counts do not match the target Feed count of ${targetCount}.`, { outcome: 'count_failed', stage: 'item_count_validation', field: 'pillar_mix' })
  }
  const strategy = {
    primary_objective: outputText(value.primary_objective, 'primary objective', MONTHLY_PLANNING_STRATEGY_LIMITS.primary_objective, { outcome: 'schema_failed', stage: 'schema_validation', field: 'primary_objective' }),
    priorities: controlledArray(value.priorities, 'priorities', 3, MONTHLY_PLANNING_TEXT_LIMITS.strategy_list_item, { outcome: 'schema_failed', stage: 'schema_validation', field: 'priorities' }),
    content_pillar_distribution: normalizedDistribution,
    creative_direction: outputText(value.creative_direction, 'creative direction', MONTHLY_PLANNING_STRATEGY_LIMITS.creative_direction, { outcome: 'schema_failed', stage: 'schema_validation', field: 'creative_direction' }),
    visual_rhythm: outputText(value.visual_rhythm, 'visual rhythm', MONTHLY_PLANNING_STRATEGY_LIMITS.visual_rhythm, { outcome: 'schema_failed', stage: 'schema_validation', field: 'visual_rhythm' }),
    avoid: controlledArray(value.avoid, 'avoid list', 3, MONTHLY_PLANNING_TEXT_LIMITS.strategy_list_item, { outcome: 'schema_failed', stage: 'schema_validation', field: 'avoid' }),
  }
  const commercialText = [
    strategy.primary_objective,
    ...strategy.priorities,
    strategy.creative_direction,
    strategy.visual_rhythm,
  ].join(' ')
  if (ALCOHOL_TERMS.test(commercialText) && !NON_ALCOHOL_QUALIFIER.test(commercialText)) {
    throw monthlyPlanningDiagnosticError('Planning AI attempted alcohol-led monthly strategy without an explicit non-alcoholic qualifier.', { outcome: 'business_rule_failed', stage: 'business_rule_validation', field: 'monthly_strategy' })
  }
  return strategy
}

function itemReferences(context: MonthlyPlanningContext) {
  return {
    assets: new Map(context.asset_catalog.map(asset => [asset.key, asset])),
    menus: new Map(context.menu_catalog.map(menu => [menu.key, menu])),
    activations: new Map(context.activation_catalog.map(activation => [activation.key, activation])),
    people: new Map(context.asset_catalog
      .filter(asset => asset.category === 'people' || asset.category === 'pets')
      .map(asset => [asset.key, { id: asset.id, name: asset.name, kind: asset.category === 'people' ? 'person' as const : 'animal' as const }])),
  }
}

function requestedDate(value: unknown, planMonth: string) {
  if (value == null || value === '') return null
  return validDateInMonth(value, planMonth)
}

function derivedObjective(pillar: PlannedItem['pillar']) {
  return ({
    lifestyle: 'Build warm Italian lifestyle awareness.',
    food: 'Build menu awareness through a current dish.',
    drinks: 'Build zero-proof beverage awareness.',
    interiors: 'Build venue atmosphere awareness.',
    events: 'Build awareness for a current activation.',
    bts_service: 'Build hospitality and service awareness.',
  } as const)[pillar]
}

const EXECUTABLE_PRIMARY_TYPES = ['food', 'drinks', 'venue', 'lifestyle', 'service', 'activation'] as const
const EXECUTABLE_VENUE_REQUIREMENTS = ['none', 'interior', 'exterior'] as const
const EXECUTABLE_PEOPLE_MODES = ['none', 'anonymous'] as const
const PET_TERMS = /\b(?:dog|dogs|pet|pets|puppy|puppies|canine|animal)\b/i
const NAMED_PERSON_TERMS = /\b(?:chef|staff|waiter|waitress|bartender)\s+[A-Z][a-z]+\b/i
const VISIBLE_DINING_TERMS = /\b(?:table|dining|breakfast|lunch|dinner|meal|dish|food|drink|sharing)\b/i
const FACTUAL_ATTRIBUTE_PHRASES = [
  'non-alcoholic', 'alcohol free', 'zero proof', 'mocktail', 'alcoholic',
  'vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'spicy', 'sweet',
  'fresh', 'organic', 'ingredient', 'ingredients', 'garnish',
  'flavour', 'flavor', 'portion', 'vessel', 'price', 'origin',
  'served with', 'crispy', 'crisp', 'breadcrumb', 'crust',
] as const
const SPECIFIC_VENUE_ZONE_PHRASES = [
  'bar-side', 'bar side', 'bar', 'pizza oven', 'oven', 'entrance',
  'window-side', 'window side', 'window-facing', 'window facing', 'lounge',
  'private room', 'counter', 'main dining room',
] as const
const BROAD_INTERIOR_TERMS = ['interior', 'dining room', 'restaurant'] as const
const BROAD_EXTERIOR_TERMS = ['terrace', 'exterior', 'outdoor dining'] as const
const KITCHEN_PROCESS_PATTERNS = [
  { label: 'kitchen/preparation process', pattern: /\b(?:preparation|prepare|prepares|prepared|preparing)\b/i },
  { label: 'dough preparation', pattern: /\b(?:pizza\s+)?dough\b/i },
  { label: 'kitchen activity', pattern: /\bkitchen\b/i },
  { label: 'cooking process', pattern: /\b(?:cooking|cook|cooks|cooked|baking|bake|bakes|baked|frying|fry|fries|fried)\b/i },
  { label: 'hand-stretching process', pattern: /\b(?:hand[-\s]?stretch(?:ed|ing)?|stretch(?:ed|ing)?\s+(?:the\s+)?dough)\b/i },
] as const
const BEVERAGE_CONTEXT_TERMS = /\b(?:drink|beverage|cocktail|mocktail|pour|poured|glass|sip|served)\b/i
const PREMIUM_PRODUCT_TERMS = /\bpremium\s+(?:ingredient|ingredients|produce|food|dish|dishes|product|products|menu)\b/i
const PREMIUM_BRAND_TERMS = /\bpremium\s+(?:dining|atmosphere|hospitality|experience|setting|restaurant|brand)\b/i
const PRIVATE_CORPORATE_EVENT_TERMS = /\b(?:private|corporate)\s+(?:event|events|function|functions|gathering|gatherings|booking|bookings)\b/i
const SPECIFIC_CLIENT_PET_TERMS = /\b(?:our|client(?:'s)?|named|beloved)\s+(?:dog|pet|animal)\b/i

function normalizedPlanningText(value: string) {
  return value.toLocaleLowerCase('en-US').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function planningTextIncludes(text: string, phrase: string) {
  const normalizedPhrase = normalizedPlanningText(phrase)
  return Boolean(normalizedPhrase) && ` ${normalizedPlanningText(text)} `.includes(` ${normalizedPhrase} `)
}

function descriptorSupportsPhrase(descriptors: string[], phrase: string) {
  return descriptors.some(descriptor => planningTextIncludes(descriptor, phrase))
}

type ExecutableFreeTextIssue = {
  message: string
  diagnostic: {
    outcome: 'schema_failed' | 'reference_failed'
    stage: 'schema_validation' | 'activation_reference_validation' | 'production_capability_validation'
    slot: number
    field: string
  }
}

function clientBrandTokens(context: MonthlyPlanningContext) {
  const generic = new Set(['restaurant', 'bar', 'cafe', 'hotel', 'resort', 'beach', 'club', 'lounge', 'dubai', 'uae', 'the'])
  return normalizedPlanningText(context.client.name).split(' ').filter(token => token && !generic.has(token))
}

function isAmbiguousBrandNamedProduct(subject: ExecutablePlanningSubject, context: MonthlyPlanningContext) {
  const subjectName = normalizedPlanningText(subject.canonical_name)
  return subject.kind === 'drinks' && clientBrandTokens(context).includes(subjectName)
}

function ambiguousDrinkMentionIsProductUse(text: string, name: string) {
  const words = normalizedPlanningText(text).split(' ')
  const nameWords = normalizedPlanningText(name).split(' ')
  for (let index = 0; index <= words.length - nameWords.length; index += 1) {
    if (!nameWords.every((word, offset) => words[index + offset] === word)) continue
    if (BEVERAGE_CONTEXT_TERMS.test(words.slice(Math.max(0, index - 4), Math.min(words.length, index + nameWords.length + 5)).join(' '))) return true
  }
  return false
}

function knownActivationIssues(text: string, context: MonthlyPlanningContext, activation: { id: string; name: string } | null, position: number | null, field: string): ExecutableFreeTextIssue[] {
  return context.activation_catalog.flatMap(candidate => {
    if (!planningTextIncludes(text, candidate.name) || candidate.id === activation?.id) return []
    return [{
      message: `${position == null ? 'Monthly Strategy' : `Slot ${position}`} mentions activation "${candidate.name}" without a matching eligible activation ID.`,
      diagnostic: {
        outcome: 'reference_failed' as const,
        stage: 'activation_reference_validation' as const,
        slot: position ?? 0,
        field,
      },
    }]
  })
}

function verifiedBrandText(context: MonthlyPlanningContext) {
  return [
    ...context.hard_facts,
    ...context.client_truth.map(record => `${record.title} ${record.detail}`),
    ...context.brand_guidelines.map(record => `${record.title} ${record.detail}`),
  ].join(' ')
}

function brandPositioningSupportsPremium(context: MonthlyPlanningContext) {
  return planningTextIncludes(verifiedBrandText(context), 'premium')
}

function privateCorporateEventsSupported(context: MonthlyPlanningContext) {
  return PRIVATE_CORPORATE_EVENT_TERMS.test(verifiedBrandText(context))
}

function dogFriendlyPositioningSupported(context: MonthlyPlanningContext) {
  const truth = verifiedBrandText(context)
  return /\b(?:dog[-\s]?friendly|dog[-\s]?welcoming|dogs?\s+(?:are\s+)?welcome|pets?\s+(?:are\s+)?welcome)\b/i.test(truth)
}

function planningReadiness(input: {
  feasibility: ReturnType<typeof assessMonthlyPlanProductionFeasibility>
  activationSetupReason: string
  concept: string
  context: MonthlyPlanningContext
}) {
  const reasons: string[] = []
  if (input.activationSetupReason) reasons.push(input.activationSetupReason)
  if (!isProductionFeasible(input.feasibility)) reasons.push(...input.feasibility.reasons)
  if (SPECIFIC_CLIENT_PET_TERMS.test(input.concept)) {
    reasons.push('A specific client pet needs approved identity truth before production.')
  } else if (PET_TERMS.test(input.concept) && !dogFriendlyPositioningSupported(input.context)) {
    return {
      state: 'needs_review' as const,
      label: 'Needs Review',
      reason: 'Confirm dog-friendly positioning before using a generic pet concept.',
      warnings: ['Confirm dog-friendly positioning before using a generic pet concept.'],
    }
  }
  if (NAMED_PERSON_TERMS.test(input.concept)) {
    reasons.push('A named individual needs approved likeness truth before production.')
  }
  if (reasons.length) {
    const reason = [...new Set(reasons)].join(' ')
    return { state: 'needs_production_setup' as const, label: 'Setup Needed', reason, warnings: [reason] }
  }
  if (ALCOHOL_TERMS.test(input.concept) && !NON_ALCOHOL_QUALIFIER.test(input.concept)) {
    const reason = 'Confirm the drink alcohol status before final production or publishing.'
    return { state: 'needs_review' as const, label: 'Needs Review', reason, warnings: [reason] }
  }
  return { state: 'ready' as const, label: 'Ready', reason: null, warnings: [] }
}

function strategySemanticIssues(strategy: PlanStrategy, context: MonthlyPlanningContext) {
  const issues: ExecutableFreeTextIssue[] = []
  const prose = [strategy.primary_objective, ...strategy.priorities, strategy.creative_direction, strategy.visual_rhythm, ...strategy.avoid].join(' ')
  issues.push(...knownActivationIssues(prose, context, null, null, 'monthly_strategy'))
  if (PREMIUM_PRODUCT_TERMS.test(prose)) {
    issues.push({ message: 'Monthly Strategy makes an unsupported premium-ingredients claim.', diagnostic: { outcome: 'reference_failed', stage: 'production_capability_validation', slot: 0, field: 'monthly_strategy' } })
  }
  if (PREMIUM_BRAND_TERMS.test(prose) && !brandPositioningSupportsPremium(context)) {
    issues.push({ message: 'Monthly Strategy makes an unsupported premium brand-positioning claim.', diagnostic: { outcome: 'reference_failed', stage: 'production_capability_validation', slot: 0, field: 'monthly_strategy' } })
  }
  if (PRIVATE_CORPORATE_EVENT_TERMS.test(prose) && !privateCorporateEventsSupported(context)) {
    issues.push({ message: 'Monthly Strategy claims a private/corporate events proposition without active Client Brain truth.', diagnostic: { outcome: 'reference_failed', stage: 'production_capability_validation', slot: 0, field: 'monthly_strategy' } })
  }
  return issues
}

function executableFreeTextIssues(input: {
  position: number
  concept: string
  universe: ReturnType<typeof buildExecutableConceptUniverse>
  primarySubject: ExecutablePlanningSubject | null
  supportingSubjects: ExecutablePlanningSubject[]
  activation: { id: string; name: string } | null
  venueRequirement: typeof EXECUTABLE_VENUE_REQUIREMENTS[number]
  context: MonthlyPlanningContext
}) {
  const { position, concept, universe, primarySubject, supportingSubjects, activation, venueRequirement, context } = input
  const issues: ExecutableFreeTextIssue[] = []
  const add = (message: string, diagnostic: ExecutableFreeTextIssue['diagnostic']) => issues.push({ message, diagnostic })
  const selectedSubjects = [primarySubject, ...supportingSubjects].filter((subject): subject is ExecutablePlanningSubject => Boolean(subject))
  const selectedSubjectIds = new Set(selectedSubjects.map(subject => subject.id))
  for (const subject of [...universe.food_subjects, ...universe.drink_subjects]) {
    if (planningTextIncludes(concept, subject.canonical_name) && !selectedSubjectIds.has(subject.id)) {
      if (isAmbiguousBrandNamedProduct(subject, context) && !ambiguousDrinkMentionIsProductUse(concept, subject.canonical_name)) continue
      add(`Slot ${position} mentions unselected product \"${subject.canonical_name}\".`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_title' })
    }
  }

  for (const issue of knownActivationIssues(concept, context, activation, position, 'activation_id')) add(issue.message, issue.diagnostic)

  const approvedZones = universe.venue.specific_zones
  for (const zone of SPECIFIC_VENUE_ZONE_PHRASES) {
    if (planningTextIncludes(concept, zone) && !approvedZones.some(approved => planningTextIncludes(approved, zone))) {
      add(`Slot ${position} mentions unavailable venue zone \"${zone}\".`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
    }
  }
  if (BROAD_INTERIOR_TERMS.some(term => planningTextIncludes(concept, term)) && (!universe.venue.interior || venueRequirement === 'exterior')) {
    add(`Slot ${position} uses interior venue language without matching interior capability.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'venue_requirement' })
  }
  if (BROAD_EXTERIOR_TERMS.some(term => planningTextIncludes(concept, term)) && (!universe.venue.exterior || venueRequirement === 'interior')) {
    add(`Slot ${position} uses exterior venue language without matching exterior capability.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'venue_requirement' })
  }

  const descriptors = selectedSubjects.flatMap(subject => subject.verified_factual_descriptors)
  for (const process of KITCHEN_PROCESS_PATTERNS) {
    if (process.pattern.test(concept) && !descriptors.some(descriptor => process.pattern.test(descriptor))) {
      add(`Slot ${position} claims unsupported ${process.label}.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
    }
  }
  if (PREMIUM_PRODUCT_TERMS.test(concept) && !descriptorSupportsPhrase(descriptors, 'premium')) {
    add(`Slot ${position} makes an unsupported premium-ingredients claim.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
  }
  if (PREMIUM_BRAND_TERMS.test(concept) && !brandPositioningSupportsPremium(context)) {
    add(`Slot ${position} makes an unsupported premium brand-positioning claim.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
  }
  if (PRIVATE_CORPORATE_EVENT_TERMS.test(concept) && !privateCorporateEventsSupported(context)) {
    add(`Slot ${position} claims a private/corporate events proposition without active Client Brain truth.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
  }
  for (const phrase of FACTUAL_ATTRIBUTE_PHRASES) {
    if (phrase === 'alcoholic' && ['non-alcoholic', 'alcohol free', 'zero proof'].some(qualified => planningTextIncludes(concept, qualified))) continue
    if (planningTextIncludes(concept, phrase) && !descriptorSupportsPhrase(descriptors, phrase)) {
      add(`Slot ${position} makes unsupported factual claim \"${phrase}\".`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
    }
  }
  return issues
}

function validateExecutableFreeText(input: {
  position: number
  concept: string
  conceptTitle: string
  conceptSummary: string
  universe: ReturnType<typeof buildExecutableConceptUniverse>
  primarySubject: ExecutablePlanningSubject | null
  supportingSubjects: ExecutablePlanningSubject[]
  activation: { id: string; name: string } | null
  venueRequirement: typeof EXECUTABLE_VENUE_REQUIREMENTS[number]
  context: MonthlyPlanningContext
}) {
  const first = executableFreeTextIssues({
    position: input.position,
    concept: input.concept,
    universe: input.universe,
    primarySubject: input.primarySubject,
    supportingSubjects: input.supportingSubjects,
    activation: input.activation,
    venueRequirement: input.venueRequirement,
    context: input.context,
  })[0]
  if (first) throw monthlyPlanningDiagnosticError(first.message, first.diagnostic)
}

function executableSubjectLabel(type: typeof EXECUTABLE_PRIMARY_TYPES[number], subject: ExecutablePlanningSubject | null, venue: string) {
  if (subject) return subject.canonical_name
  if (type === 'venue') return venue === 'exterior' ? 'DemoClientB exterior atmosphere' : 'DemoClientB interior atmosphere'
  if (type === 'service') return 'DemoClientB anonymous service moment'
  if (type === 'lifestyle') return 'DemoClientB anonymous dining moment'
  return 'DemoClientB activation'
}

function executableGridRole(type: typeof EXECUTABLE_PRIMARY_TYPES[number], archetype: string): PlannedItem['grid_role'] {
  if (type === 'venue') return 'venue_breather'
  if (type === 'lifestyle') return archetype === 'hand_interaction' ? 'human_moment' : 'lifestyle_break'
  if (type === 'service') return 'human_moment'
  if (type === 'activation') return 'event_commercial'
  return archetype === 'macro_detail' || archetype === 'overhead_food' ? 'product_detail' : 'hero_food'
}

/** Validates the compact full-plan contract against the deterministic executable universe. */
function validateExecutableItem(value: unknown, planMonth: string, context: MonthlyPlanningContext, expectedPosition?: number): PlannedItem & { requested_date: string | null } {
  if (!isRecord(value)) throw monthlyPlanningDiagnosticError('Planning AI returned an invalid executable Feed concept.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'feed_item' })
  const position = Number(value.slot)
  if (!Number.isInteger(position) || position < 1 || (expectedPosition != null && position !== expectedPosition)) {
    throw monthlyPlanningDiagnosticError(`Planning AI returned an invalid Feed concept slot '${String(value.slot ?? '')}'.`, { outcome: 'schema_failed', stage: 'schema_validation', field: 'slot', value: String(value.slot ?? '') })
  }
  const universe = buildExecutableConceptUniverse(context)
  const refs = itemReferences(context)
  const pillar = outputEnum(value.pillar, universe.allowed_pillars, 'pillar', position)
  const primaryType = outputEnum(value.primary_subject_type, EXECUTABLE_PRIMARY_TYPES, 'primary_subject_type', position)
  const productionMethod = outputEnum(value.production_method, universe.allowed_production_methods, 'production_method', position)
  const archetype = outputEnum(value.archetype, EXECUTABLE_CONCEPT_ARCHETYPES, 'archetype', position)
  const venueRequirement = outputEnum(value.venue_requirement, EXECUTABLE_VENUE_REQUIREMENTS, 'venue_requirement', position)
  const peopleMode = outputEnum(value.people_mode, EXECUTABLE_PEOPLE_MODES, 'people_mode', position)
  const conceptTitle = outputText(value.concept_title, 'concept title', MONTHLY_PLANNING_TEXT_LIMITS.concept_title, { outcome: 'schema_failed', stage: 'schema_validation', slot: position, field: 'concept_title' })
  const conceptSummary = outputText(value.concept_summary, 'concept summary', MONTHLY_PLANNING_TEXT_LIMITS.concept_summary, { outcome: 'schema_failed', stage: 'schema_validation', slot: position, field: 'concept_summary' })
  const concept = `${conceptTitle}. ${conceptSummary}`
  if (PET_TERMS.test(concept)) throw monthlyPlanningDiagnosticError(`Slot ${position} mentions a pet although no approved pet truth is available.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
  if (NAMED_PERSON_TERMS.test(concept)) throw monthlyPlanningDiagnosticError(`Slot ${position} claims a named staff/person identity without approved likeness truth.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'concept_summary' })
  if (peopleMode === 'anonymous' && !universe.anonymous_people_allowed) throw monthlyPlanningDiagnosticError(`Slot ${position} uses anonymous people although the current policy does not allow them.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'people_mode' })
  const allSubjects = [...universe.food_subjects, ...universe.drink_subjects]
  const primaryId = value.primary_subject_id == null || value.primary_subject_id === '' ? null : outputText(value.primary_subject_id, 'primary subject id', 120, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'primary_subject_id' })
  const primarySubject = primaryId ? allSubjects.find(subject => subject.id === primaryId) ?? null : null
  const foodIds = new Map(universe.food_subjects.map(subject => [subject.id, subject]))
  const drinkIds = new Map(universe.drink_subjects.map(subject => [subject.id, subject]))
  const supportingFood = controlledArray(value.supporting_food_ids, 'supporting Food subject IDs', 2, 120, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'supporting_food_ids' })
  const supportingDrink = controlledArray(value.supporting_drink_ids, 'supporting Drink subject IDs', 1, 120, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'supporting_drink_ids' })
  const supportingSubjects = [...supportingFood.map(id => foodIds.get(id) ?? null), ...supportingDrink.map(id => drinkIds.get(id) ?? null)]
  if (supportingSubjects.some(subject => !subject)) throw monthlyPlanningDiagnosticError(`Slot ${position} selected an unavailable supporting product ID.`, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'supporting_product_ids' })
  const activationId = value.activation_id == null || value.activation_id === '' ? null : outputText(value.activation_id, 'activation id', 120, { outcome: 'reference_failed', stage: 'activation_reference_validation', slot: position, field: 'activation_id' })
  const activation = activationId ? universe.eligible_activations.find(candidate => candidate.id === activationId) ?? null : null
  const activationRecord = activation ? context.activation_catalog.find(candidate => `activation:${candidate.id}` === activation.id) ?? null : null
  if (activationId && !activation) throw monthlyPlanningDiagnosticError(`Slot ${position} selected an activation that is not executable in the current universe.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'activation_id' })
  validateExecutableFreeText({
    position, concept, conceptTitle, conceptSummary, universe, primarySubject,
    supportingSubjects: supportingSubjects.filter((subject): subject is ExecutablePlanningSubject => Boolean(subject)),
    activation, venueRequirement, context,
  })
  if ((primaryType === 'food' && (!primarySubject || primarySubject.kind !== 'food' || pillar !== 'food')) || (primaryType === 'drinks' && (!primarySubject || primarySubject.kind !== 'drinks' || pillar !== 'drinks'))) {
    throw monthlyPlanningDiagnosticError(`Slot ${position} primary subject does not match its executable Food/Drink pillar.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'primary_subject_id' })
  }
  if (['venue', 'lifestyle', 'service'].includes(primaryType) && primaryId) throw monthlyPlanningDiagnosticError(`Slot ${position} must not attach a factual product ID to ${primaryType}.`, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'primary_subject_id' })
  if ((primaryType === 'venue' && pillar !== 'interiors') || (primaryType === 'lifestyle' && pillar !== 'lifestyle') || (primaryType === 'service' && pillar !== 'bts_service') || (primaryType === 'activation' && pillar !== 'events')) {
    throw monthlyPlanningDiagnosticError(`Slot ${position} primary subject type does not match its pillar.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'primary_subject_type' })
  }
  if ((primaryType === 'venue' || primaryType === 'lifestyle' || primaryType === 'service') && venueRequirement === 'none') throw monthlyPlanningDiagnosticError(`Slot ${position} requires a supported venue environment.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'venue_requirement' })
  if ((venueRequirement === 'interior' && !universe.venue.interior) || (venueRequirement === 'exterior' && !universe.venue.exterior)) throw monthlyPlanningDiagnosticError(`Slot ${position} selected unavailable ${venueRequirement} venue truth.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'venue_requirement' })
  const visiblyDining = archetype === 'lifestyle_dining' || ((primaryType === 'lifestyle' || primaryType === 'service') && VISIBLE_DINING_TERMS.test(concept))
  if (visiblyDining && !supportingSubjects.length) throw monthlyPlanningDiagnosticError(`Slot ${position} visible dining requires explicit supporting Food or Drink truth IDs.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'supporting_food_ids' })
  if ((primaryType === 'food' || primaryType === 'drinks') && !primarySubject) throw monthlyPlanningDiagnosticError(`Slot ${position} requires an executable primary subject ID.`, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'primary_subject_id' })
  if (productionMethod === 'existing_asset' && !primarySubject) throw monthlyPlanningDiagnosticError(`Slot ${position} Existing Asset requires an executable primary Food or Drink truth subject.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'production_method' })
  if (primaryType === 'activation' && (!activation || primaryId !== activationId)) throw monthlyPlanningDiagnosticError(`Slot ${position} activation identity is not eligible.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'activation_id' })
  const assetRefs = primarySubject ? primarySubject.asset_keys.slice(0, 1) : []
  const supportingProductRefs = supportingSubjects.flatMap(subject => subject?.asset_keys.slice(0, 1) ?? [])
  const menuRefs = primarySubject ? [primarySubject.menu_key] : []
  const subjectType = primarySubject ? 'menu_item' : primaryType === 'venue' ? 'venue' : primaryType === 'lifestyle' ? 'lifestyle' : primaryType === 'service' ? 'service' : 'activation'
  const subjectIdentity: ResolvedMonthlyPlanningSubject = primarySubject
    ? { type: 'menu_item', ref: primarySubject.menu_key, label: primarySubject.canonical_name, canonical_id: primarySubject.menu_item_id, canonical_name: primarySubject.canonical_name, menu_record_id: refs.menus.get(primarySubject.menu_key)?.menu_record_id ?? null, activation_record_id: null }
    : { type: subjectType as ResolvedMonthlyPlanningSubject['type'], ref: activationRecord?.key ?? null, label: executableSubjectLabel(primaryType, null, venueRequirement), canonical_id: activationRecord?.id ?? null, canonical_name: activationRecord?.name ?? null, menu_record_id: null, activation_record_id: activationRecord?.id ?? null }
  const requiredAssets = [...new Set([...assetRefs, ...supportingProductRefs].map(key => refs.assets.get(key)?.id).filter((id): id is string => Boolean(id)))]
  const feasibility = assessMonthlyPlanProductionFeasibility({ pillar, subject: subjectIdentity.label, creative_concept: concept, production_method: productionMethod, required_assets: requiredAssets, metadata: { planning_ai: { menu_item_ids: menuRefs.map(key => refs.menus.get(key)!.id), supporting_product_asset_ids: supportingProductRefs.map(key => refs.assets.get(key)!.id), scene_requires_visible_products: archetype === 'lifestyle_dining' } } }, context.production_capability)
  if (!isProductionFeasible(feasibility)) throw monthlyPlanningDiagnosticError(feasibility.reasons[0] || `Slot ${position} is not production-feasible.`, { outcome: 'reference_failed', stage: 'production_capability_validation', slot: position, field: 'production_capability' })
  return {
    position, planned_date: '', date_fixed: false, requested_date: requestedDate(value.date_or_null, planMonth), pillar,
    objective: derivedObjective(pillar), subject: subjectIdentity.label, subject_identity: subjectIdentity,
    creative_concept: concept, production_method: productionMethod, asset_refs: assetRefs, supporting_product_refs: supportingProductRefs,
    scene_requires_visible_products: visiblyDining, menu_item_refs: menuRefs,
    activation_ref: activationRecord?.key ?? null, required_asset_notes: '', visual_direction: '', grid_role: executableGridRole(primaryType, archetype),
    commercial_rationale: '', caption_brief: '', planning_warnings: [],
    planning_readiness: { state: 'ready', label: 'Ready', reason: null },
    status: 'ready',
  }
}

function validateItem(value: unknown, planMonth: string, context: MonthlyPlanningContext, expectedPosition?: number): PlannedItem & { requested_date: string | null } {
  if (!isRecord(value)) throw monthlyPlanningDiagnosticError('Planning AI returned an invalid Feed concept.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'feed_item' })
  const position = Number(value.slot)
  if (!Number.isInteger(position) || position < 1 || (expectedPosition != null && position !== expectedPosition)) {
    throw monthlyPlanningDiagnosticError(`Planning AI returned an invalid Feed concept slot '${String(value.slot ?? '')}'.`, { outcome: 'schema_failed', stage: 'schema_validation', field: 'slot', value: String(value.slot ?? '') })
  }
  const refs = itemReferences(context)
  const pillar = outputEnum(value.pillar, MONTHLY_PLAN_PILLARS, 'pillar', position)
  const productionMethod = outputEnum(value.production_method, MONTHLY_PLAN_METHODS, 'production_method', position)
  const gridRole = outputEnum(value.grid_role, MONTHLY_PLAN_GRID_ROLES, 'grid_role', position)
  const requestedAssetRefs = controlledArray(value.asset_refs, 'Asset references', 4, 3, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'asset_refs' })
  const requestedSupportingProductRefs = controlledArray(value.supporting_product_refs, 'Supporting product references', 3, 3, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'supporting_product_refs' })
  const sceneRequiresVisibleProducts = value.scene_requires_visible_products === true
  const activationRef = value.activation_ref == null || value.activation_ref === '' ? null : outputText(value.activation_ref, 'Activation reference', 80, { outcome: 'reference_failed', stage: 'activation_reference_validation', slot: position, field: 'activation_ref' })
  const unknownAsset = [...requestedAssetRefs, ...requestedSupportingProductRefs].find(key => !refs.assets.has(key))
  if (unknownAsset) throw monthlyPlanningDiagnosticError(`Slot ${position} referenced unknown Asset key ${unknownAsset}.`, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'asset_refs', value: unknownAsset })
  if (activationRef && !refs.activations.has(activationRef)) throw monthlyPlanningDiagnosticError(`Slot ${position} activation reference ${activationRef} does not exist in this planning snapshot.`, { outcome: 'reference_failed', stage: 'activation_reference_validation', slot: position, field: 'activation_ref', value: activationRef })
  if (pillar === 'events' && !activationRef) throw monthlyPlanningDiagnosticError(`Slot ${position} event concept requires one current Activation reference.`, { outcome: 'reference_failed', stage: 'activation_reference_validation', slot: position, field: 'activation_ref' })
  const subjectType = outputText(value.subject_type, 'subject type', 40, { outcome: 'schema_failed', stage: 'schema_validation', slot: position, field: 'subject_type' })
  const subjectRef = value.subject_ref == null || value.subject_ref === '' ? null : outputText(value.subject_ref, 'subject reference', 12, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'subject_ref' })
  const subjectLabel = outputText(value.subject_label, 'subject label', MONTHLY_PLANNING_TEXT_LIMITS.concept_title, { outcome: 'schema_failed', stage: 'schema_validation', slot: position, field: 'subject_label' })
  const concept = outputText(value.concept, 'concept', MONTHLY_PLANNING_TEXT_LIMITS.concept_summary, { outcome: 'schema_failed', stage: 'schema_validation', slot: position, field: 'concept' })
  const resolution = resolveMonthlyPlanningSubject({
    pillar,
    subject_type: subjectType,
    subject_ref: subjectRef,
    subject_label: subjectLabel,
    activation_ref: activationRef,
  }, { menus: context.menu_catalog, activations: context.activation_catalog, people: [...refs.people.entries()].map(([key, person]) => ({ key, ...person })) })
  if (resolution.ok === false) {
    throw monthlyPlanningDiagnosticError(resolution.message, {
      outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position,
      field: resolution.field, value: resolution.value,
    })
  }
  const activation = activationRef ? refs.activations.get(activationRef) ?? null : null
  const unresolvedActivationProduct = activation?.product_truth_status === 'unresolved'
  const activationHasConfirmedProduct = activation?.product_truth_status === 'confirmed'
  // A future product may be strategically planned, but its reference keys must
  // not silently turn an adjacent existing product into visual truth.
  const confirmedProductAssetRefs = activationHasConfirmedProduct && activation
    ? requestedAssetRefs.filter(key => exactActivationProductAssetMatch(refs.assets.get(key)!, activation))
    : requestedAssetRefs
  const subjectProductAssets = resolution.subject.type === 'menu_item' && resolution.subject.canonical_id
    ? context.production_capability.assets.filter(asset => asset.canonical_menu_item_id === resolution.subject.canonical_id).map(asset => {
      const key = context.asset_catalog.find(candidate => candidate.id === asset.id)?.key
      return key ?? null
    }).filter((key): key is string => Boolean(key))
    : []
  const primaryAssetRefs = resolution.subject.type === 'menu_item'
    ? subjectProductAssets.slice(0, 1)
    : requestedAssetRefs
  const assetRefs = unresolvedActivationProduct ? [] : activationHasConfirmedProduct ? confirmedProductAssetRefs : primaryAssetRefs
  const supportingProductRefs = [...new Set(requestedSupportingProductRefs)]
  if (supportingProductRefs.some(key => !['food', 'drinks'].includes(refs.assets.get(key)!.category))) {
    throw monthlyPlanningDiagnosticError(`Slot ${position} supporting products must be approved Food or Drink truth.`, { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: position, field: 'supporting_product_refs' })
  }
  const unresolvedProductWarning = unresolvedActivationProduct
    ? `Waiting for confirmed product truth for ${activation?.name ?? 'this activation'} before production.`
    : activationHasConfirmedProduct && !confirmedProductAssetRefs.length
      ? `Needs an approved Asset exactly matching the confirmed product for ${activation?.name ?? 'this activation'} before production.`
      : ''
  const subject = resolution.subject.label
  const menuRefs = resolution.subject.type === 'menu_item' && resolution.subject.ref ? [resolution.subject.ref] : []
  const combinedCreative = `${subject} ${concept}`
  if (/\b(italian nights|democlientc|boat|yacht)\b/i.test(combinedCreative)) {
    throw monthlyPlanningDiagnosticError('Planning AI attempted historical or out-of-scope DemoClientB content.', { outcome: 'business_rule_failed', stage: 'business_rule_validation', slot: position, field: 'concept' })
  }
  const selectedAssets = assetRefs.map(key => refs.assets.get(key)!)
  const neededCategory = pillar === 'food' ? 'food' : pillar === 'drinks' ? 'drinks' : null
  const hasNeededCategory = neededCategory ? selectedAssets.some(asset => asset.category === neededCategory) : true
  const lifeNeedsVenue = pillar === 'lifestyle' || pillar === 'bts_service' || pillar === 'interiors'
  const hasVenueTruth = pillar === 'interiors'
    ? context.production_capability.venues.some(venue => venue.category === 'interiors')
    : context.production_capability.venues.some(venue => venue.category === 'interiors' || venue.category === 'exteriors')
  const requiredAssets = [...new Set([...assetRefs.map(key => refs.assets.get(key)!.id), ...supportingProductRefs.map(key => refs.assets.get(key)!.id)])]
  const feasibility = assessMonthlyPlanProductionFeasibility({
    pillar,
    subject,
    creative_concept: concept,
    production_method: productionMethod,
    required_assets: requiredAssets,
    metadata: {
      planning_ai: {
        menu_item_ids: menuRefs.map(key => refs.menus.get(key)!.id),
        subject_identity: resolution.subject,
        supporting_product_asset_ids: supportingProductRefs.map(key => refs.assets.get(key)!.id),
        scene_requires_visible_products: sceneRequiresVisibleProducts,
      },
    },
  }, context.production_capability)
  const activationSetupReason = unresolvedActivationProduct || (activationHasConfirmedProduct && !confirmedProductAssetRefs.length)
    ? unresolvedProductWarning
    : !hasNeededCategory
      ? `Needs approved exact ${neededCategory ?? 'visual'} truth before production.`
      : lifeNeedsVenue && !hasVenueTruth
        ? 'Needs approved venue truth before production.'
        : ''
  // Monthly planning is deliberately strategy-first. This assessment is saved
  // for human QC and later production, but it is not a reason to discard a
  // structurally valid strategic concept.
  const readiness = planningReadiness({ feasibility, activationSetupReason, concept: combinedCreative, context })
  const requiredNotes = readiness.reason ?? ''
  return {
    position,
    planned_date: '',
    date_fixed: false,
    requested_date: (() => {
      try {
        return requestedDate(value.date_or_null, planMonth)
      } catch (error) {
        if (error instanceof Error && error instanceof ClientBrainV2HttpError) {
          const diagnostic = diagnosticFromError(error)
          throw monthlyPlanningDiagnosticError(error.message, { ...diagnostic, slot: position, field: diagnostic.field ?? 'date_or_null' })
        }
        throw error
      }
    })(),
    pillar,
    objective: derivedObjective(pillar),
    subject,
    subject_identity: resolution.subject,
    creative_concept: concept,
    production_method: productionMethod,
    asset_refs: assetRefs,
    supporting_product_refs: supportingProductRefs,
    scene_requires_visible_products: sceneRequiresVisibleProducts,
    menu_item_refs: menuRefs,
    activation_ref: activationRef,
    required_asset_notes: requiredNotes,
    visual_direction: '',
    grid_role: gridRole,
    commercial_rationale: '',
    caption_brief: '',
    planning_warnings: readiness.warnings,
    planning_readiness: { state: readiness.state, label: readiness.label, reason: readiness.reason },
    status: 'ready',
  }
}

function isoDateForDay(planMonth: string, day: number) {
  return `${planMonth.slice(0, 8)}${String(day).padStart(2, '0')}`
}

function distributeDates(items: Array<PlannedItem & { requested_date: string | null }>, planMonth: string) {
  const { end } = planMonthBounds(planMonth)
  const daysInMonth = Number(end.slice(-2))
  const ordered = [...items].sort((left, right) => left.position - right.position)
  const occupied = new Set<string>()
  for (const item of ordered) {
    if (!item.requested_date) continue
    if (occupied.has(item.requested_date)) throw monthlyPlanningDiagnosticError(`Duplicate fixed date ${item.requested_date}.`, { outcome: 'date_failed', stage: 'date_validation', slot: item.position, field: 'date_or_null', value: item.requested_date })
    occupied.add(item.requested_date)
    item.planned_date = item.requested_date
    item.date_fixed = true
  }
  for (const [index, item] of ordered.entries()) {
    if (item.planned_date) continue
    const idealDay = Math.max(1, Math.min(daysInMonth, Math.round(((index + 1) * (daysInMonth + 1)) / (ordered.length + 1))))
    let chosenDay = idealDay
    while (chosenDay <= daysInMonth && occupied.has(isoDateForDay(planMonth, chosenDay))) chosenDay += 1
    if (chosenDay > daysInMonth) {
      chosenDay = idealDay - 1
      while (chosenDay >= 1 && occupied.has(isoDateForDay(planMonth, chosenDay))) chosenDay -= 1
    }
    if (chosenDay < 1 || chosenDay > daysInMonth) throw monthlyPlanningDiagnosticError('Unable to allocate distinct monthly dates for the Feed plan.', { outcome: 'date_failed', stage: 'date_validation', slot: item.position, field: 'planned_date' })
    item.planned_date = isoDateForDay(planMonth, chosenDay)
    occupied.add(item.planned_date)
  }
  return ordered
}

function deterministicWarnings(items: PlannedItem[], targetCount: number) {
  const warnings: string[] = []
  if (items.length !== targetCount) warnings.push(`Expected ${targetCount} Feed concepts but received ${items.length}.`)
  const ordered = [...items].sort((left, right) => left.position - right.position)
  const runWarning = (values: string[], label: string) => {
    let run = 0
    let previous = ''
    for (const value of values) {
      run = value === previous ? run + 1 : 1
      previous = value
      if (run > 2) { warnings.push(`${label} appears ${run} times consecutively.`); return }
    }
  }
  runWarning(ordered.map(item => item.pillar), 'One pillar')
  runWarning(ordered.map(item => item.production_method), 'One production method')
  runWarning(ordered.map(item => item.grid_role), 'One grid role')
  const subjects = new Map<string, number>()
  for (const item of ordered) {
    const key = item.subject.toLocaleLowerCase('en')
    subjects.set(key, (subjects.get(key) ?? 0) + 1)
  }
  for (const [subject, count] of subjects) if (count >= 3) warnings.push(`${subject} appears in ${count} Feed concepts.`)
  const setupCount = ordered.filter(item => item.planning_readiness.state === 'needs_production_setup').length
  const reviewCount = ordered.filter(item => item.planning_readiness.state === 'needs_review').length
  const blockedCount = ordered.filter(item => item.planning_readiness.state === 'blocked').length
  if (setupCount) warnings.push(`${setupCount} concept(s) need production setup before Individual Production.`)
  if (reviewCount) warnings.push(`${reviewCount} concept(s) need factual review before production.`)
  if (blockedCount) warnings.push(`${blockedCount} concept(s) contain structural blockers.`)
  return [...new Set(warnings)]
}

export function runMonthlyPlanningDiagnosticFixtures() {
  const fixtureCapability = {
    client_id: '325f9e9f-f615-56d8-b2d1-c44632d53d64', generated_at: '2026-01-01T00:00:00.000Z',
    assets: [{ id: 'ac4989e2-4ee2-59a2-90df-fa1cb35a9731', name: 'Fixture Dish', category: 'food' as const, canonical_menu_item_id: '73bccc8d-2d13-5a30-956b-188f41e5553a', canonical_menu_item_name: 'Fixture Dish', perspective_flexibility: null, metadata_complete: true }],
    food: [{ menu_item_id: '73bccc8d-2d13-5a30-956b-188f41e5553a', canonical_name: 'Fixture Dish', menu_section: 'Food', asset_ids: ['ac4989e2-4ee2-59a2-90df-fa1cb35a9731'], metadata_complete: true, perspective_flexibility: [] }],
    drinks: [], venues: [{ zone: 'Fixture interior', category: 'interiors' as const, asset_ids: [] }], people: [], pets: [], brand_truth: { available: true, record_count: 1 }, activations: [], anonymous_human_policy: 'allowed_without_named_likeness_truth' as const, warnings: [],
  }
  const context: MonthlyPlanningContext = {
    client: { id: '325f9e9f-f615-56d8-b2d1-c44632d53d64', name: 'Fixture Restaurant', subtype: 'restaurant' },
    hard_facts: [],
    client_truth: [],
    operations: [],
    brand_guidelines: [],
    menu_catalog: [{ key: 'M01', id: '73bccc8d-2d13-5a30-956b-188f41e5553a', name: 'Fixture Dish', section: 'Food', menu_record_id: '663ddc79-e931-53df-8507-7d277b95ae8b' }],
    activation_catalog: [{ key: 'A01', id: 'fefcf7f6-7f3a-5aa6-b769-016661b3b420', name: 'Fixture Activation', proposition: null, schedule: null, restrictions: [], product_truth_status: 'not_applicable', confirmed_product_names: [] }],
    asset_catalog: [{ key: 'F01', id: 'ac4989e2-4ee2-59a2-90df-fa1cb35a9731', name: 'Fixture Dish', category: 'food', tags: [] }],
    production_capability: fixtureCapability,
    unavailable_asset_categories: [],
    learnings: [],
    warnings: [],
    retrieved_at: '2026-01-01T00:00:00.000Z',
  }
  const strategy = {
    primary_objective: 'Build awareness for current menu truth through a balanced monthly feed.',
    priorities: ['Current menu truth', 'Food awareness', 'Consistent feed rhythm'],
    pillar_mix: { lifestyle: 0, food: 15, drinks: 0, interiors: 0, events: 0, bts_service: 0 },
    creative_direction: 'Warm and concise visual direction that remains within the intended strategy length.',
    visual_rhythm: 'A measured sequence of current menu dishes across the month.',
    avoid: ['Invented products'],
  }
  const validItem = (slot: number): NonNullable<MonthlyPlanningModelOutput['feed_items']>[number] => ({
    slot,
    pillar: 'food',
    subject_type: 'menu_item',
    subject_ref: 'M01',
    subject_label: 'Fixture Dish close-up hero',
    concept: `Current menu-led Fixture Dish composition for slot ${slot}.`,
    production_method: 'ai_photography',
    grid_role: 'hero_food',
    asset_refs: ['F01'],
    supporting_product_refs: [],
    scene_requires_visible_products: false,
    activation_ref: null,
    date_or_null: null,
  })
  const validOutput = () => ({ monthly_strategy: strategy, feed_items: Array.from({ length: 15 }, (_, index) => validItem(index + 1)) })
  // These fixtures deliberately exercise monthly-planning semantics only. They
  // never call a provider or persistence layer; Individual Production remains
  // responsible for its stricter reference-package checks.
  const fixtureResult = (name: string, item: Record<string, unknown>, fixtureContext = context, expectedState?: PlannedItem['planning_readiness']['state']) => {
    try {
      const validated = validateItem(item, '2026-09-01', fixtureContext)
      const outcome = expectedState && validated.planning_readiness.state !== expectedState ? 'schema_failed' : 'succeeded'
      return { name, expectedOutcome: expectedState ?? 'succeeded', outcome, readiness: validated.planning_readiness, error: null }
    } catch (error) {
      return { name, expectedOutcome: expectedState ?? 'succeeded', outcome: diagnosticFromError(error).outcome, readiness: null, error: diagnosticMessage(error) }
    }
  }
  const itemWith = (slot: number, overrides: Record<string, unknown> = {}) => ({ ...validItem(slot), ...overrides })
  const venueAssetId = '1b242451-8ae1-5f3b-9ad1-374378847496'
  const venueReadyContext: MonthlyPlanningContext = {
    ...context,
    asset_catalog: [...context.asset_catalog, { key: 'I01', id: venueAssetId, name: 'Fixture dining room', category: 'interiors', tags: [] }],
    production_capability: {
      ...fixtureCapability,
      assets: [...fixtureCapability.assets, { id: venueAssetId, name: 'Fixture dining room', category: 'interiors', canonical_menu_item_id: null, canonical_menu_item_name: null, perspective_flexibility: null, metadata_complete: true }],
      venues: [{ zone: 'Fixture dining room', category: 'interiors', asset_ids: [venueAssetId] }],
    },
  }
  const dogFriendlyContext: MonthlyPlanningContext = {
    ...venueReadyContext,
    client_truth: [{ subsection: 'audience', title: 'Dog friendly', detail: 'Dogs are welcome in this relaxed Italian dining setting.' }],
  }
  const activationWithoutVisualTruth: MonthlyPlanningContext = {
    ...context,
    activation_catalog: [{ key: 'A01', id: 'fefcf7f6-7f3a-5aa6-b769-016661b3b420', name: 'Fixture Activation', proposition: 'A current verified activation.', schedule: null, restrictions: [], product_truth_status: 'unresolved', confirmed_product_names: [] }],
    production_capability: { ...fixtureCapability, activations: [{ id: 'fefcf7f6-7f3a-5aa6-b769-016661b3b420', name: 'Fixture Activation', product_truth_status: 'unresolved', visual_truth_available: false }] },
  }
  const menuWithoutProductTruth: MonthlyPlanningContext = {
    ...context,
    asset_catalog: [],
    production_capability: { ...fixtureCapability, assets: [], food: [] },
  }
  const strategyWithSetupItems = validOutput()
  strategyWithSetupItems.feed_items[2] = itemWith(3, { concept: 'Chef Lucia presents the Fixture Dish.' })
  strategyWithSetupItems.feed_items[6] = itemWith(7, { concept: 'A specific client dog rests beside the table.' })
  strategyWithSetupItems.feed_items[10] = itemWith(11, { concept: 'A Fixture cocktail moment at the table.' })
  const fifteenAssessment = (() => {
    try {
      const items = strategyWithSetupItems.feed_items.map(item => validateItem(item, '2026-09-01', dogFriendlyContext))
      const setupCount = items.filter(item => item.planning_readiness.state === 'needs_production_setup').length
      const reviewCount = items.filter(item => item.planning_readiness.state === 'needs_review').length
      return { name: '15 valid strategic concepts with normal setup gaps can persist', expectedOutcome: 'succeeded', outcome: items.length === 15 && setupCount === 2 && reviewCount === 1 ? 'succeeded' : 'schema_failed', setupCount, reviewCount }
    } catch (error) {
      return { name: '15 valid strategic concepts with normal setup gaps can persist', expectedOutcome: 'succeeded', outcome: diagnosticFromError(error).outcome, error: diagnosticMessage(error) }
    }
  })()
  return [
    fixtureResult('verified activation without dedicated visual truth is setup needed', itemWith(1, { pillar: 'events', subject_type: 'activation', subject_ref: 'A01', subject_label: 'Fixture Activation', concept: 'A current Fixture Activation announcement.', grid_role: 'event_commercial', activation_ref: 'A01', asset_refs: [] }), activationWithoutVisualTruth, 'needs_production_setup'),
    fixtureResult('verified menu item without product truth is setup needed', itemWith(1, { asset_refs: [] }), menuWithoutProductTruth, 'needs_production_setup'),
    fixtureResult('anonymous fictional diner is allowed', itemWith(1, { pillar: 'lifestyle', subject_type: 'lifestyle', subject_ref: null, subject_label: 'Anonymous diner', concept: 'An anonymous diner enjoys Fixture Dish in the dining room.', grid_role: 'lifestyle_break', asset_refs: ['F01'], scene_requires_visible_products: true, supporting_product_refs: ['F01'] }), venueReadyContext, 'ready'),
    fixtureResult('named chef needs production setup', itemWith(1, { concept: 'Chef Lucia presents Fixture Dish.' }), venueReadyContext, 'needs_production_setup'),
    fixtureResult('generic dog-friendly positioning is allowed when verified', itemWith(1, { concept: 'A relaxed dog-friendly terrace moment with Fixture Dish.' }), dogFriendlyContext, 'ready'),
    fixtureResult('specific client dog needs production setup', itemWith(1, { concept: 'The client\'s dog joins a relaxed Fixture Dish moment.' }), dogFriendlyContext, 'needs_production_setup'),
    fixtureResult('editorial sweet ending wording is allowed', itemWith(1, { concept: 'A sweet ending to an Italian dinner.' }), venueReadyContext, 'ready'),
    fixtureResult('unqualified alcohol wording needs factual review', itemWith(1, { concept: 'A Fixture cocktail moment.' }), venueReadyContext, 'needs_review'),
    fixtureResult('broad dining-room language is allowed with venue truth', itemWith(1, { pillar: 'interiors', subject_type: 'venue', subject_ref: null, subject_label: 'Main dining room', concept: 'The restaurant dining room settles into a warm evening rhythm.', grid_role: 'venue_breather', asset_refs: [] }), venueReadyContext, 'ready'),
    fifteenAssessment,
  ]
  const inspect = (name: string, output: ModelPlanOutput | null, expectedOutcome: string) => {
    try {
      if (!output) parseJson('not structured JSON')
      const rawItems = output!.feed_items
      if (!Array.isArray(rawItems)) throw monthlyPlanningDiagnosticError('Planning AI did not return Feed concepts.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'feed_items' })
      const items = distributeDates(rawItems.map(item => validateItem(item, '2026-09-01', context)), '2026-09-01')
      if (items.length !== 15) throw monthlyPlanningDiagnosticError(`Expected 15 concepts; received ${items.length}.`, { outcome: 'count_failed', stage: 'item_count_validation', field: 'feed_items', value: String(items.length) })
      validateStrategy(output!.monthly_strategy, 15)
      return { name, expectedOutcome, outcome: 'succeeded', error: null, payloadItemCount: sanitizeMonthlyPlanningPayload(output).payload && rawItems.length }
    } catch (error) {
      const issue = diagnosticFromError(error)
      return { name, expectedOutcome, outcome: issue.outcome, stage: issue.stage, error: diagnosticMessage(error), payloadItemCount: output?.feed_items?.length ?? 0 }
    }
  }
  const validExecutableItem = (slot: number): Record<string, unknown> => ({
    slot,
    pillar: 'food',
    concept_title: 'Fixture Dish hero',
    concept_summary: 'A simple current-menu focal post.',
    production_method: 'ai_photography',
    archetype: 'product_hero',
    primary_subject_type: 'food',
    primary_subject_id: 'food:73bccc8d-2d13-5a30-956b-188f41e5553a',
    venue_requirement: 'none',
    supporting_food_ids: [],
    supporting_drink_ids: [],
    people_mode: 'none',
    activation_id: null,
    date_or_null: null,
  })
  const inspectExecutable = (name: string, items: unknown[], expectedOutcome: string, fixtureContext = context) => {
    try {
      const validated = distributeDates(items.map(item => validateExecutableItem(item, '2026-09-01', fixtureContext)), '2026-09-01')
      if (validated.length !== 15) throw monthlyPlanningDiagnosticError(`Expected 15 concepts; received ${validated.length}.`, { outcome: 'count_failed', stage: 'item_count_validation', field: 'feed_items' })
      return { name, expectedOutcome, outcome: 'succeeded', error: null, payloadItemCount: validated.length }
    } catch (error) {
      const issue = diagnosticFromError(error)
      return { name, expectedOutcome, outcome: issue.outcome, stage: issue.stage, error: diagnosticMessage(error), payloadItemCount: items.length }
    }
  }
  const fourteen = validOutput(); fourteen.feed_items = fourteen.feed_items.slice(0, 14)
  const sixteen = validOutput(); sixteen.feed_items.push(validItem(16))
  const invalidPillar = validOutput(); invalidPillar.feed_items[7] = { ...invalidPillar.feed_items[7], pillar: 'community' }
  const invalidMethod = validOutput(); invalidMethod.feed_items[7] = { ...invalidMethod.feed_items[7], production_method: 'studio_magic' }
  const unknownAsset = validOutput(); unknownAsset.feed_items[7] = { ...unknownAsset.feed_items[7], asset_refs: ['F92'] }
  const unknownActivation = validOutput(); unknownActivation.feed_items[7] = { ...unknownActivation.feed_items[7], pillar: 'events', subject_type: 'activation', subject_ref: 'A09', subject_label: 'Fixture Activation', activation_ref: 'A09' }
  const invalidDate = validOutput(); invalidDate.feed_items[7] = { ...invalidDate.feed_items[7], date_or_null: '2026-99-99' }
  const duplicateDate = validOutput(); duplicateDate.feed_items[0] = { ...duplicateDate.feed_items[0], date_or_null: '2026-09-05' }; duplicateDate.feed_items[1] = { ...duplicateDate.feed_items[1], date_or_null: '2026-09-05' }
  const completeStrategy = validOutput(); completeStrategy.monthly_strategy = {
    ...strategy,
    primary_objective: 'P'.repeat(MONTHLY_PLANNING_STRATEGY_LIMITS.primary_objective),
    creative_direction: 'C'.repeat(MONTHLY_PLANNING_STRATEGY_LIMITS.creative_direction),
    visual_rhythm: 'R'.repeat(MONTHLY_PLANNING_STRATEGY_LIMITS.visual_rhythm),
  }
  const overlongStrategy = validOutput(); overlongStrategy.monthly_strategy = { ...strategy, primary_objective: 'P'.repeat(MONTHLY_PLANNING_STRATEGY_LIMITS.primary_objective + 1) }
  const inspectActivationTruth = (name: string, activation: MonthlyPlanningContext['activation_catalog'][number], assetNameValue: string, expected: { outcome: string; assetRefs?: string[]; status?: PlannedItem['status'] }) => {
    const fixtureContext: MonthlyPlanningContext = {
      ...context,
      activation_catalog: [activation],
      asset_catalog: [{ key: 'F01', id: 'ac4989e2-4ee2-59a2-90df-fa1cb35a9731', name: assetNameValue, category: 'food', tags: [] }],
      production_capability: {
        ...fixtureCapability,
        activations: [{ id: activation.id, name: activation.name, product_truth_status: activation.product_truth_status ?? 'not_applicable', visual_truth_available: activation.product_truth_status === 'confirmed' }],
      },
    }
    try {
      const item = validateItem({
        slot: 1, pillar: 'events', subject_type: 'activation', subject_ref: 'A01', subject_label: activation.name,
        concept: `Current ${activation.name} concept.`, production_method: 'ai_photography', grid_role: 'event_commercial',
        asset_refs: ['F01'], supporting_product_refs: [], scene_requires_visible_products: false, activation_ref: 'A01', date_or_null: null,
      }, '2026-09-01', fixtureContext)
      const passes = expected.outcome === 'succeeded' && JSON.stringify(item.asset_refs) === JSON.stringify(expected.assetRefs) && item.status === expected.status
      return { name, expectedOutcome: expected.outcome, outcome: passes ? 'succeeded' : 'schema_failed', asset_refs: item.asset_refs, status: item.status, warning: item.required_asset_notes || null }
    } catch (error) {
      return { name, expectedOutcome: expected.outcome, outcome: diagnosticFromError(error).outcome, asset_refs: null, status: null, warning: diagnosticMessage(error) }
    }
  }
  const persistedStrategy = JSON.parse(JSON.stringify(validateStrategy(completeStrategy.monthly_strategy, 15))) as PlanStrategy
  const validExecutable = Array.from({ length: 15 }, (_, index) => validExecutableItem(index + 1))
  const drinkMenuId = '842f76ec-9d98-5f54-a36d-8a868ed4096a'
  const drinkAssetId = '9c8b2be9-2605-53dc-8352-066bca3c62c5'
  const drinkContext: MonthlyPlanningContext = {
    ...context,
    menu_catalog: [...context.menu_catalog, { key: 'M02', id: drinkMenuId, name: 'Fixture Drink', section: 'Drinks', menu_record_id: '0e75b95e-4944-5dc0-ab8c-d0af2cd4dcca' }],
    asset_catalog: [...context.asset_catalog, { key: 'D01', id: drinkAssetId, name: 'Fixture Drink', category: 'drinks', tags: [] }],
    production_capability: {
      ...fixtureCapability,
      assets: [...fixtureCapability.assets, { id: drinkAssetId, name: 'Fixture Drink', category: 'drinks', canonical_menu_item_id: drinkMenuId, canonical_menu_item_name: 'Fixture Drink', perspective_flexibility: null, metadata_complete: true }],
      drinks: [{ menu_item_id: drinkMenuId, canonical_name: 'Fixture Drink', menu_section: 'Drinks', asset_ids: [drinkAssetId], metadata_complete: true, perspective_flexibility: [] }],
    },
  }
  const validDrinkItem = (slot: number): Record<string, unknown> => ({
    ...validExecutableItem(slot), pillar: 'drinks', concept_title: 'Fixture Drink editorial hero', concept_summary: 'An editorial moment for the selected drink.',
    primary_subject_type: 'drinks', primary_subject_id: `drink:${drinkMenuId}`,
  })
  const activationFirewallContext: MonthlyPlanningContext = {
    ...context,
    activation_catalog: [
      ...context.activation_catalog,
      { key: 'A02', id: 'b9fa95e3-d7f3-5221-bdbd-58c77048e67e', name: 'Pizza of the Month', proposition: null, schedule: null, restrictions: [], product_truth_status: 'unresolved', confirmed_product_names: [] },
      { key: 'A03', id: 'b9d842f6-13af-592f-99df-2d83c7d32ea5', name: 'Pizza Senza Fine', proposition: null, schedule: null, restrictions: [], product_truth_status: 'unresolved', confirmed_product_names: [] },
    ],
  }
  const cotolettaContext: MonthlyPlanningContext = {
    ...context,
    menu_catalog: [{ ...context.menu_catalog[0], name: 'Cotoletta alla milanese' }],
    asset_catalog: [{ ...context.asset_catalog[0], name: 'Cotoletta alla milanese', verified_factual_descriptors: ['crispy breadcrumb crust'] }],
    production_capability: {
      ...fixtureCapability,
      assets: [{ ...fixtureCapability.assets[0], name: 'Cotoletta alla milanese', canonical_menu_item_name: 'Cotoletta alla milanese' }],
      food: [{ ...fixtureCapability.food[0], canonical_name: 'Cotoletta alla milanese' }],
    },
  }
  const otherFoodMenuId = 'f3fa3ad8-c6fe-5477-82b4-e44e46469ac4'
  const otherFoodAssetId = '4ff2fd5d-7839-5e8a-90ad-7e00f43079e7'
  const unselectedFoodContext: MonthlyPlanningContext = {
    ...context,
    menu_catalog: [...context.menu_catalog, { key: 'M03', id: otherFoodMenuId, name: 'Other Fixture Dish', section: 'Food', menu_record_id: '15e139b5-073d-5eb7-b221-b816cc001ed8' }],
    asset_catalog: [...context.asset_catalog, { key: 'F02', id: otherFoodAssetId, name: 'Other Fixture Dish', category: 'food', tags: [] }],
    production_capability: {
      ...fixtureCapability,
      assets: [...fixtureCapability.assets, { id: otherFoodAssetId, name: 'Other Fixture Dish', category: 'food', canonical_menu_item_id: otherFoodMenuId, canonical_menu_item_name: 'Other Fixture Dish', perspective_flexibility: null, metadata_complete: true }],
      food: [...fixtureCapability.food, { menu_item_id: otherFoodMenuId, canonical_name: 'Other Fixture Dish', menu_section: 'Food', asset_ids: [otherFoodAssetId], metadata_complete: true, perspective_flexibility: [] }],
    },
  }
  const invalidPizzaActivation = [...validExecutable]; invalidPizzaActivation[3] = { ...validExecutableItem(4), concept_title: 'Pizza of the Month editorial focus' }
  const invalidPizzaSenzaFine = [...validExecutable]; invalidPizzaSenzaFine[4] = { ...validExecutableItem(5), concept_title: 'Pizza Senza Fine editorial focus' }
  const invalidPet = [...validExecutable]; invalidPet[6] = { ...validExecutableItem(7), concept_title: 'Dog-friendly terrace moment' }
  const invalidGraphic = [...validExecutable]; invalidGraphic[7] = { ...validExecutableItem(8), production_method: 'graphic_design' }
  const invalidLifestyleSupport = [...validExecutable]; invalidLifestyleSupport[8] = { ...validExecutableItem(9), pillar: 'lifestyle', concept_title: 'Anonymous dinner table moment', concept_summary: 'Guests share a warm Italian dinner together.', archetype: 'lifestyle_dining', primary_subject_type: 'lifestyle', primary_subject_id: null, venue_requirement: 'interior' }
  const invalidAttribute = [...validExecutable]; invalidAttribute[11] = { ...validDrinkItem(12), concept_title: 'Non-alcoholic Fixture Drink hero' }
  const invalidVenueZone = [...validExecutable]; invalidVenueZone[5] = { ...validExecutableItem(6), pillar: 'interiors', primary_subject_type: 'venue', primary_subject_id: null, venue_requirement: 'interior', concept_title: 'Bar-side interior atmosphere', concept_summary: 'A warm restaurant interior moment.' }
  const validBroadVenue = [...validExecutable]; validBroadVenue[5] = { ...validExecutableItem(6), pillar: 'interiors', primary_subject_type: 'venue', primary_subject_id: null, venue_requirement: 'interior', concept_title: 'Warm restaurant interior', concept_summary: 'A calm interior atmosphere.' }
  const validCotolettaDescriptor = [...validExecutable]; validCotolettaDescriptor[10] = { ...validExecutableItem(11), concept_title: 'Cotoletta alla milanese hero', concept_summary: 'A crispy breadcrumb crust is shown in close detail.' }
  const validCanonicalDrink = [...validExecutable]; validCanonicalDrink[10] = validDrinkItem(11)
  const invalidUnselectedFood = [...validExecutable]; invalidUnselectedFood[12] = { ...validExecutableItem(13), concept_title: 'Other Fixture Dish hero' }
  const invalidEventsPillar = [...validExecutable]; invalidEventsPillar[13] = { ...validExecutableItem(14), pillar: 'events', primary_subject_type: 'activation', activation_id: null }
  const guestCutsCotoletta = [...validExecutable]; guestCutsCotoletta[1] = {
    ...validExecutableItem(2),
    concept_title: 'Cotoletta alla milanese hand interaction',
    concept_summary: 'A guest cuts the selected Cotoletta alla milanese at the table.',
    archetype: 'hand_interaction',
    people_mode: 'anonymous',
    venue_requirement: 'interior',
  }
  const invalidKitchenProcess = [...validExecutable]; invalidKitchenProcess[2] = {
    ...validExecutableItem(3),
    concept_title: 'Pizza process',
    concept_summary: 'Chef prepares pizza dough in the kitchen.',
  }
  const premiumBrandContext: MonthlyPlanningContext = {
    ...context,
    client_truth: [{ subsection: 'brand_identity', title: 'Positioning', detail: 'A premium dining atmosphere with warm hospitality.' }],
  }
  const premiumAtmosphere = [...validExecutable]; premiumAtmosphere[3] = {
    ...validExecutableItem(4),
    concept_title: 'Premium dining atmosphere',
    concept_summary: 'A calm interior dining moment.',
    pillar: 'interiors',
    primary_subject_type: 'venue',
    primary_subject_id: null,
    venue_requirement: 'interior',
  }
  const invalidPremiumIngredients = [...validExecutable]; invalidPremiumIngredients[4] = {
    ...validExecutableItem(5),
    concept_title: 'Premium ingredients focus',
  }
  const invalidPrivateEvents = [...validExecutable]; invalidPrivateEvents[5] = {
    ...validExecutableItem(6),
    concept_title: 'Private events proposition',
  }
  const democlientbDrinkMenuId = '02d6bba5-1938-55b3-8621-790f33e9a8aa'
  const democlientbDrinkAssetId = 'c0671702-0d1f-5755-a2d3-30dad3162465'
  const democlientbDrinkContext: MonthlyPlanningContext = {
    ...context,
    client: { ...context.client, name: 'DemoClientB' },
    menu_catalog: [...context.menu_catalog, { key: 'M04', id: democlientbDrinkMenuId, name: 'DemoClientB', section: 'Drinks', menu_record_id: '215b6f9e-198e-5b29-9cc7-04d0bef1acc9' }],
    asset_catalog: [...context.asset_catalog, { key: 'D02', id: democlientbDrinkAssetId, name: 'DemoClientB', category: 'drinks', tags: [] }],
    production_capability: {
      ...fixtureCapability,
      assets: [...fixtureCapability.assets, { id: democlientbDrinkAssetId, name: 'DemoClientB', category: 'drinks', canonical_menu_item_id: democlientbDrinkMenuId, canonical_menu_item_name: 'DemoClientB', perspective_flexibility: null, metadata_complete: true }],
      drinks: [{ menu_item_id: democlientbDrinkMenuId, canonical_name: 'DemoClientB', menu_section: 'Drinks', asset_ids: [democlientbDrinkAssetId], metadata_complete: true, perspective_flexibility: [] }],
    },
  }
  const validSelectedDemoClientBDrink = [...validExecutable]; validSelectedDemoClientBDrink[6] = {
    ...validExecutableItem(7),
    pillar: 'drinks',
    concept_title: 'DemoClientB drink hero',
    concept_summary: 'The selected DemoClientB beverage is served simply.',
    primary_subject_type: 'drinks',
    primary_subject_id: `drink:${democlientbDrinkMenuId}`,
  }
  const invalidUnselectedDemoClientBDrink = [...validExecutable]; invalidUnselectedDemoClientBDrink[7] = {
    ...validExecutableItem(8),
    concept_title: 'A DemoClientB drink moment',
  }
  const validDemoClientBBrandMention = [...validExecutable]; validDemoClientBBrandMention[8] = {
    ...validExecutableItem(9),
    concept_title: 'DemoClientB dining atmosphere',
  }
  const inspectExecutableStrategy = (name: string, candidate: unknown, fixtureContext: MonthlyPlanningContext, expectedOutcome: string) => {
    try {
      validateStrategy(candidate, 15, buildExecutableConceptUniverse(fixtureContext).allowed_pillars)
      return { name, expectedOutcome, outcome: 'succeeded', error: null }
    } catch (error) {
      const issue = diagnosticFromError(error)
      return { name, expectedOutcome, outcome: issue.outcome, stage: issue.stage, error: diagnosticMessage(error) }
    }
  }
  const invalidStrategyActivation = {
    ...strategy,
    pillar_mix: { lifestyle: 0, food: 15, drinks: 0, interiors: 0, events: 0, bts_service: 0 },
    avoid: ['Avoid Pizza of the Month references.'],
  }
  return [
    inspect('valid 15-item response', validOutput(), 'succeeded'),
    inspect('14-item response', fourteen, 'count_failed'),
    inspect('16-item response', sixteen, 'count_failed'),
    inspect('invalid pillar', invalidPillar, 'enum_failed'),
    inspect('invalid production method', invalidMethod, 'enum_failed'),
    inspect('unknown Asset key', unknownAsset, 'reference_failed'),
    inspect('unknown Activation key', unknownActivation, 'reference_failed'),
    inspect('invalid date', invalidDate, 'date_failed'),
    inspect('duplicate fixed date', duplicateDate, 'date_failed'),
    inspectExecutable('executable 15-item response', validExecutable, 'succeeded'),
    inspectExecutable('activation null plus Pizza of the Month fails', invalidPizzaActivation, 'reference_failed', activationFirewallContext),
    inspectExecutable('activation null plus Pizza Senza Fine fails', invalidPizzaSenzaFine, 'reference_failed', activationFirewallContext),
    inspectExecutable('dog lifestyle concept without pet truth', invalidPet, 'reference_failed'),
    inspectExecutable('graphic_design is absent from executable methods', invalidGraphic, 'enum_failed'),
    inspectExecutable('visible lifestyle dining without supporting truth', invalidLifestyleSupport, 'reference_failed'),
    inspectExecutable('selected Drink plus non-alcoholic fails without descriptor', invalidAttribute, 'reference_failed', drinkContext),
    inspectExecutable('interior-only capability rejects bar-side zone', invalidVenueZone, 'reference_failed'),
    inspectExecutable('interior-only capability allows broad restaurant interior', validBroadVenue, 'succeeded'),
    inspectExecutable('Cotoletta descriptor permits crispy breadcrumb crust', validCotolettaDescriptor, 'succeeded', cotolettaContext),
    inspectExecutable('guest cuts selected Cotoletta is a permitted staged interaction', guestCutsCotoletta, 'succeeded', cotolettaContext),
    inspectExecutable('chef prepares pizza dough fails without verified process truth', invalidKitchenProcess, 'reference_failed'),
    inspectExecutable('selected Drink canonical name passes', validCanonicalDrink, 'succeeded', drinkContext),
    inspectExecutable('brand word DemoClientB in a non-beverage phrase passes', validDemoClientBBrandMention, 'succeeded', democlientbDrinkContext),
    inspectExecutable('selected drink named DemoClientB passes when explicitly a beverage', validSelectedDemoClientBDrink, 'succeeded', democlientbDrinkContext),
    inspectExecutable('unselected DemoClientB drink reference fails', invalidUnselectedDemoClientBDrink, 'reference_failed', democlientbDrinkContext),
    inspectExecutable('title naming unselected Food fails', invalidUnselectedFood, 'reference_failed', unselectedFoodContext),
    inspectExecutable('events pillar is unavailable with zero eligible activations', invalidEventsPillar, 'enum_failed'),
    inspectExecutable('verified premium dining atmosphere is allowed', premiumAtmosphere, 'succeeded', premiumBrandContext),
    inspectExecutable('premium ingredients fail without product descriptor truth', invalidPremiumIngredients, 'reference_failed'),
    inspectExecutable('private events fail without active Client Brain support', invalidPrivateEvents, 'reference_failed'),
    inspectExecutableStrategy('activation mention in strategy prose fails when zero eligible', invalidStrategyActivation, activationFirewallContext, 'reference_failed'),
    inspect('complete strategy at allowed field lengths', completeStrategy, 'succeeded'),
    inspect('overlong strategy field', overlongStrategy, 'schema_failed'),
    {
      name: 'strategy limits survive JSON persistence round-trip',
      expectedOutcome: 'succeeded',
      outcome: persistedStrategy.primary_objective.length === MONTHLY_PLANNING_STRATEGY_LIMITS.primary_objective
        && persistedStrategy.creative_direction.length === MONTHLY_PLANNING_STRATEGY_LIMITS.creative_direction
        && persistedStrategy.visual_rhythm.length === MONTHLY_PLANNING_STRATEGY_LIMITS.visual_rhythm ? 'succeeded' : 'schema_failed',
      lengths: Object.fromEntries(Object.entries(persistedStrategy).flatMap(([key, value]) => typeof value === 'string' ? [[key, value.length]] : [])),
    },
    inspectActivationTruth('unresolved activation removes substitute truth Asset and blocks production', {
      key: 'A01', id: 'fefcf7f6-7f3a-5aa6-b769-016661b3b420', name: 'Pizza of the Month', proposition: null, schedule: null, restrictions: [], product_truth_status: 'unresolved', confirmed_product_names: [],
    }, 'Margherita', { outcome: 'reference_failed' }),
    inspectActivationTruth('confirmed activation retains exact matching truth Asset', {
      key: 'A01', id: 'fefcf7f6-7f3a-5aa6-b769-016661b3b420', name: 'Pizza of the Month', proposition: null, schedule: null, restrictions: [], product_truth_status: 'confirmed', confirmed_product_names: ['Margherita Special'],
    }, 'Margherita Special', { outcome: 'succeeded', assetRefs: ['F01'], status: 'ready' }),
    inspectActivationTruth('confirmed activation rejects non-matching substitute Asset', {
      key: 'A01', id: 'fefcf7f6-7f3a-5aa6-b769-016661b3b420', name: 'Pizza of the Month', proposition: null, schedule: null, restrictions: [], product_truth_status: 'confirmed', confirmed_product_names: ['Margherita Special'],
    }, 'Margherita', { outcome: 'reference_failed' }),
    inspect('malformed structured payload', null, 'schema_failed'),
    { name: 'provider failure', expectedOutcome: 'provider_failed', outcome: 'provider_failed', stage: 'provider_response', error: 'Fixture provider failure', payloadItemCount: 0 },
    { name: 'atomic RPC failure', expectedOutcome: 'atomic_apply_failed', outcome: 'atomic_apply_failed', stage: 'atomic_apply', error: 'Fixture atomic apply failure', payloadItemCount: 15 },
  ]
}

async function buildPlanningContext(clientId: string): Promise<MonthlyPlanningContext> {
  const client = await requireClientBrainV2(clientId)
  const [recordsResult, assetsResult, menuItemsResult, productionCapability] = await Promise.all([
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id, client_id, stable_key, top_section, subsection, record_type, title, summary, content, status, confidence, metadata, last_verified_at')
      .eq('client_id', clientId)
      .or(`top_section.eq.intelligence,top_section.eq.brand_guidelines,top_section.eq.learnings`),
    clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id, client_id, stable_key, top_section, subsection, record_type, title, summary, content, status, confidence, metadata, last_verified_at')
      .eq('client_id', clientId)
      .eq('top_section', 'assets')
      .eq('metadata->>asset_category_source', 'human_confirmed')
      .eq('metadata->>approved_for_generation', 'true')
      .neq('status', 'archived')
      .neq('status', 'restricted'),
    clientBrainV2ServerClient
      .from('client_brain_v2_menu_items')
      .select('id, canonical_name, menu_section, menu_record_id, source_status')
      .eq('client_id', clientId)
      .eq('source_status', 'current')
      .order('menu_section')
      .order('canonical_name')
      .order('id'),
    buildProductionCapabilityInventory(clientId),
  ])
  if (recordsResult.error || assetsResult.error || menuItemsResult.error) throw new ClientBrainV2HttpError('Unable to retrieve the scoped Planning AI context.', 500)
  const records = (recordsResult.data ?? []) as RawRecord[]
  const rawAssets = (assetsResult.data ?? []) as RawRecord[]
  const rawAssetById = new Map(rawAssets.map(record => [record.id, record]))
  const assetIndexes: Record<MonthlyPlanningAssetReference['category'], number> = { food: 0, drinks: 0, interiors: 0, exteriors: 0, venue_items: 0, people: 0, pets: 0 }
  const assetPrefixes: Record<MonthlyPlanningAssetReference['category'], string> = { food: 'F', drinks: 'D', interiors: 'I', exteriors: 'E', venue_items: 'V', people: 'P', pets: 'T' }
  const assetCatalog = productionCapability.assets.map(asset => {
    const rawAsset = rawAssetById.get(asset.id)
    const key = referenceKey(assetPrefixes[asset.category], assetIndexes[asset.category])
    assetIndexes[asset.category] += 1
    return {
      key,
      id: asset.id,
      name: asset.name,
      category: asset.category,
      tags: rawAsset ? stringList(dataFor(rawAsset).tags, 12) : [],
      menu_item_id: asset.canonical_menu_item_id,
      // Only explicit reviewed descriptors are eligible for factual free-text claims.
      verified_factual_descriptors: rawAsset ? stringList(dataFor(rawAsset).verified_factual_descriptors, 12) : [],
    }
  })
  const menuCatalog = ((menuItemsResult.data ?? []) as RawMenuItem[]).map((item, index) => ({
    key: referenceKey('M', index),
    id: item.id,
    name: item.canonical_name,
    section: item.menu_section,
    menu_record_id: item.menu_record_id,
  }))
  const currentRecords = records.filter(record => CURRENT_RECORD_STATUSES.has(record.status))
  // Historical activations remain non-executable, but their names must still be
  // guarded in all generated prose so stale campaigns cannot reappear silently.
  const activationRecords = currentRecords.filter(record => record.subsection === 'activations' && record.record_type === 'activation')
  const activationCatalog = activationRecords.map((record, index) => {
    const data = dataFor(record)
    const productTruth = activationProductTruth(data, record)
    return {
      key: referenceKey('A', index),
      id: record.id,
      name: record.title,
      proposition: stringValue(data.proposition, 600) || record.summary,
      schedule: stringValue(data.schedule, 600) || null,
      restrictions: stringList(data.restrictions, 8),
      product_truth_status: productTruth.status,
      confirmed_product_names: productTruth.confirmedNames,
    }
  })
  const hardFacts = currentRecords.flatMap(record => [
    ...factsFrom(record),
    ...(record.subsection === 'visual_dna' ? stringList(dataFor(record).rules).flatMap(rule => isRecord(rule) && stringValue(rule.strength) === 'hard_guardrail' ? [stringValue(rule.text, 700)] : []) : []),
  ]).filter(Boolean)
  const clientTruth = currentRecords
    .filter(record => RELEVANT_INTELLIGENCE_SUBSECTIONS.includes(record.subsection) && !['operations', 'visual_dna'].includes(record.subsection))
    .flatMap(record => {
      const detail = compactRecord(record)
      return detail ? [{ subsection: record.subsection, title: record.title, detail }] : []
    }).slice(0, 36)
  const operations = currentRecords.filter(record => record.subsection === 'operations').flatMap(record => {
    const detail = [...factsFrom(record), compactRecord(record)].filter(Boolean).join(' ')
    return detail ? [{ title: record.title, detail: detail.slice(0, 1_400) }] : []
  })
  const brandGuidelines = currentRecords.filter(record => record.top_section === 'brand_guidelines' || record.subsection === 'visual_dna').flatMap(record => {
    const detail = compactRecord(record)
    return detail ? [{ subsection: record.subsection, title: record.title, detail }] : []
  }).slice(0, 18)
  const learnings = currentRecords.filter(record => record.top_section === 'learnings').flatMap(record => {
    const detail = compactRecord(record)
    return detail ? [{ category: record.subsection, statement: detail, confidence: record.confidence == null ? 'unknown' : String(record.confidence) }] : []
  }).slice(0, 16)
  const unavailableAssetCategories = (['food', 'drinks', 'interiors', 'exteriors', 'venue_items'] as const).filter(category => !assetCatalog.some(asset => asset.category === category))
  return {
    client: { id: client.id, name: client.name, subtype: client.industry ?? null },
    hard_facts: [...new Set(hardFacts)].slice(0, 20),
    client_truth: clientTruth.slice(0, 20),
    operations: operations.slice(0, 8),
    brand_guidelines: brandGuidelines.slice(0, 10),
    menu_catalog: menuCatalog,
    activation_catalog: activationCatalog,
    asset_catalog: assetCatalog,
    production_capability: productionCapability,
    unavailable_asset_categories: unavailableAssetCategories,
    learnings: learnings.slice(0, 8),
    warnings: unavailableAssetCategories.length ? [`No approved Asset truth is available for: ${unavailableAssetCategories.join(', ')}.`] : [],
    retrieved_at: new Date().toISOString(),
  }
}

/** Read-only capability preview used for planner preflight and diagnostics QA. */
export async function buildMonthlyPlanningExecutableUniverse(clientId: string) {
  return buildExecutableConceptUniverse(await buildPlanningContext(clientId))
}

type MonthlyPlanningCandidateViolation = {
  slot: number | null
  field: string | null
  outcome: string
  stage: string
  message: string
}

function candidateReadinessState(input: { item: Json; context: MonthlyPlanningContext }) {
  const slot = Number(input.item.slot)
  const title = stringValue(input.item.concept_title, 240)
  const summary = stringValue(input.item.concept_summary, 4_000)
  const prose = `${title} ${summary}`
  const primaryType = stringValue(input.item.primary_subject_type, 40)
  const primarySubject = stringValue(input.item.primary_subject_id, 120)
  const venueRequirement = stringValue(input.item.venue_requirement, 40)
  const supportingIds = [...stringList(input.item.supporting_food_ids, 8), ...stringList(input.item.supporting_drink_ids, 8)]
  const reasons: string[] = []
  const structural = !Number.isInteger(slot) || slot < 1 || !title || !summary || !MONTHLY_PLAN_PILLARS.includes(stringValue(input.item.pillar, 40) as MonthlyPlanPillar)
  if (structural) return { slot: Number.isInteger(slot) ? slot : null, state: 'blocked' as const, label: 'Blocked' as const, reason: 'This historical candidate is structurally incomplete and cannot be classified safely.' }

  const productId = primarySubject.replace(/^(?:food|drink):/, '')
  const requiredProduct = primaryType === 'food' ? input.context.production_capability.food : primaryType === 'drinks' ? input.context.production_capability.drinks : []
  if ((primaryType === 'food' || primaryType === 'drinks') && (!productId || !requiredProduct.some(product => product.menu_item_id === productId))) {
    reasons.push('The selected menu subject no longer has approved exact Product Truth in the current capability inventory.')
  }
  if (['interior', 'exterior'].includes(venueRequirement) && !input.context.production_capability.venues.some(venue => venue.category === (venueRequirement === 'interior' ? 'interiors' : 'exteriors'))) {
    reasons.push(`Approved ${venueRequirement} Venue Truth is needed before Individual Production.`)
  }
  const availableProductIds = new Set([
    ...input.context.production_capability.food,
    ...input.context.production_capability.drinks,
  ].flatMap(product => [product.menu_item_id, ...product.asset_ids]))
  if (supportingIds.some(id => !availableProductIds.has(id.replace(/^(?:food|drink):/, '')) && !availableProductIds.has(id))) {
    reasons.push('One or more visible supporting Food or Drink references need production setup.')
  }
  const mentionedActivation = input.context.activation_catalog.find(activation => planningTextIncludes(prose, activation.name))
  if (mentionedActivation && stringValue(input.item.activation_id, 120) !== mentionedActivation.id) {
    reasons.push(`Link the verified ${mentionedActivation.name} activation and establish its intended production treatment.`)
  }
  if (NAMED_PERSON_TERMS.test(prose)) reasons.push('A named individual needs approved likeness truth before production.')
  if (SPECIFIC_CLIENT_PET_TERMS.test(prose)) reasons.push('A specific client pet needs approved identity truth before production.')
  if (reasons.length) return { slot, state: 'needs_production_setup' as const, label: 'Setup Needed' as const, reason: [...new Set(reasons)].join(' ') }
  if (/\bmocktail\b/i.test(prose)) return { slot, state: 'needs_review' as const, label: 'Needs Review' as const, reason: 'Confirm the drink alcohol-status claim before final production or publishing.' }
  if (/\bpremium\s+(?:end|ingredients?|starter)/i.test(prose)) return { slot, state: 'needs_review' as const, label: 'Needs Review' as const, reason: 'Confirm this qualitative product-positioning claim before final production or publishing.' }
  return { slot, state: 'ready' as const, label: 'Ready' as const, reason: null }
}

/** Development-only, read-only inspection for a stored historical candidate. */
export async function inspectMonthlyPlanningExecutionCandidate(clientId: string, planId: string, executionId: string) {
  if (!isUuid(clientId) || !isUuid(planId) || !isUuid(executionId)) throw new ClientBrainV2HttpError('Monthly Planning execution not found.', 404)
  const [detail, executionResult, context] = await Promise.all([
    getMonthlyPlan(clientId, planId),
    clientBrainV2ServerClient
      .from('social_monthly_plan_ai_executions')
      .select('id,sanitized_debug_payload,prompt_version,execution_outcome,validation_stage')
      .eq('id', executionId)
      .eq('client_id', clientId)
      .eq('monthly_plan_id', planId)
      .maybeSingle(),
    buildPlanningContext(clientId),
  ])
  if (executionResult.error) throw new ClientBrainV2HttpError('Unable to load the Monthly Planning execution.', 500)
  if (!executionResult.data) throw new ClientBrainV2HttpError('Monthly Planning execution not found.', 404)
  const execution = executionResult.data
  const payload = execution.sanitized_debug_payload
  const feedItems = isRecord(payload) && Array.isArray(payload.feed_items) ? payload.feed_items : []
  const items = feedItems.filter(isRecord).map(item => candidateReadinessState({ item, context })).sort((left, right) => (left.slot ?? Number.MAX_SAFE_INTEGER) - (right.slot ?? Number.MAX_SAFE_INTEGER))
  const readinessCounts = Object.fromEntries(['ready', 'needs_review', 'needs_production_setup', 'blocked'].map(state => [state, items.filter(item => item.state === state).length]))
  return {
    execution_id: executionId,
    prompt_version: execution.prompt_version,
    execution_outcome: execution.execution_outcome,
    validation_stage: execution.validation_stage,
    item_count: feedItems.length,
    planning_readiness: items,
    readiness_counts: readinessCounts,
    note: 'This is a strategy-first reclassification of a historical candidate. It does not modify the plan, execution, assets, or production rules.',
  }

  /* Legacy strict-execution diagnostics retained below for historical source
   * reference. The return above deliberately prevents them from treating
   * ordinary production setup as a monthly-planning failure. */
  const universe = buildExecutableConceptUniverse(context)
  const violations: MonthlyPlanningCandidateViolation[] = []
  const add = (issue: MonthlyPlanningCandidateViolation) => {
    if (!violations.some(existing => existing.slot === issue.slot && existing.field === issue.field && existing.message === issue.message)) violations.push(issue)
  }
  if (feedItems.length !== Number(detail.plan.target_feed_count)) {
    add({ slot: null, field: 'feed_items', outcome: 'count_failed', stage: 'item_count_validation', message: `Expected ${detail.plan.target_feed_count} concepts; received ${feedItems.length}.` })
  }
  const candidateStrategy = isRecord(payload) ? payload.monthly_strategy : null
  if (!candidateStrategy) {
    add({ slot: null, field: 'monthly_strategy', outcome: 'schema_failed', stage: 'schema_validation', message: 'Planning AI did not return a Monthly Strategy.' })
  } else {
    for (const issue of strategySemanticIssues(candidateStrategy as PlanStrategy, context)) {
      add({ slot: null, field: issue.diagnostic.field, outcome: issue.diagnostic.outcome, stage: issue.diagnostic.stage, message: issue.message })
    }
    try {
      validateStrategy(candidateStrategy, Number(detail.plan.target_feed_count), universe.allowed_pillars)
    } catch (error) {
      const diagnostic = diagnosticFromError(error)
      add({ slot: null, field: diagnostic.field ?? 'monthly_strategy', outcome: diagnostic.outcome, stage: diagnostic.stage, message: diagnosticMessage(error) })
    }
  }
  const allSubjects = [...universe.food_subjects, ...universe.drink_subjects]
  for (const [index, candidate] of feedItems.entries()) {
    if (!isRecord(candidate)) {
      add({ slot: index + 1, field: 'feed_item', outcome: 'schema_failed', stage: 'schema_validation', message: `Slot ${index + 1} is not a structured Feed concept.` })
      continue
    }
    const slot = Number.isInteger(Number(candidate.slot)) ? Number(candidate.slot) : index + 1
    const title = typeof candidate.concept_title === 'string' ? candidate.concept_title : ''
    const summary = typeof candidate.concept_summary === 'string' ? candidate.concept_summary : ''
    const primarySubject = typeof candidate.primary_subject_id === 'string'
      ? allSubjects.find(subject => subject.id === candidate.primary_subject_id) ?? null
      : null
    const supportingIds = [
      ...(Array.isArray(candidate.supporting_food_ids) ? candidate.supporting_food_ids : []),
      ...(Array.isArray(candidate.supporting_drink_ids) ? candidate.supporting_drink_ids : []),
    ].filter((id): id is string => typeof id === 'string')
    const supportingSubjects = supportingIds.flatMap(id => {
      const subject = allSubjects.find(candidateSubject => candidateSubject.id === id)
      return subject ? [subject] : []
    })
    const activation = typeof candidate.activation_id === 'string'
      ? universe.eligible_activations.find(item => item.id === candidate.activation_id) ?? null
      : null
    const venueRequirement = candidate.venue_requirement === 'interior' || candidate.venue_requirement === 'exterior'
      ? candidate.venue_requirement
      : 'none'
    for (const issue of executableFreeTextIssues({
      position: slot,
      concept: `${title}. ${summary}`,
      universe,
      primarySubject,
      supportingSubjects,
      activation,
      venueRequirement,
      context,
    })) {
      add({ slot: issue.diagnostic.slot, field: issue.diagnostic.field, outcome: issue.diagnostic.outcome, stage: issue.diagnostic.stage, message: issue.message })
    }
    try {
      validateExecutableItem(candidate, String(detail.plan.plan_month), context, slot)
    } catch (error) {
      const diagnostic = diagnosticFromError(error)
      add({ slot: diagnostic.slot ?? slot, field: diagnostic.field ?? null, outcome: diagnostic.outcome, stage: diagnostic.stage, message: diagnosticMessage(error) })
    }
  }
  return {
    execution_id: execution.id,
    prompt_version: execution.prompt_version,
    execution_outcome: execution.execution_outcome,
    validation_stage: execution.validation_stage,
    item_count: feedItems.length,
    violations,
  }
}

type HistoricalCandidateItem = {
  slot: number
  pillar: MonthlyPlanPillar
  archetype: string
  people_mode: string
  date_or_null: string | null
  activation_id: string | null
  concept_title: string
  concept_summary: string
  production_method: typeof MONTHLY_PLAN_METHODS[number]
  venue_requirement: 'none' | 'interior' | 'exterior'
  primary_subject_id: string | null
  primary_subject_type: 'food' | 'drinks' | 'venue' | 'lifestyle' | 'service'
  supporting_food_ids: string[]
  supporting_drink_ids: string[]
}

type HistoricalCandidateStrategy = {
  primary_objective: string
  priorities: string[]
  pillar_mix: Record<string, number>
  creative_direction: string
  visual_rhythm: string
  avoid: string[]
}

function historicalCandidateText(value: unknown, label: string, max: number, required = true) {
  const result = stringValue(value, max)
  if (required && !result) throw new ClientBrainV2HttpError(`Historical candidate ${label} is missing.`, 409)
  return result
}

function historicalCandidateId(value: unknown, label: string) {
  if (value == null || value === '') return null
  const result = historicalCandidateText(value, label, 120)
  if (!/^(?:food|drink):[0-9a-f-]{36}$/i.test(result)) {
    throw new ClientBrainV2HttpError(`Historical candidate ${label} is invalid.`, 409)
  }
  return result
}

function historicalCandidateIds(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new ClientBrainV2HttpError(`Historical candidate ${label} is invalid.`, 409)
  return value.map((entry, index) => historicalCandidateId(entry, `${label} ${index + 1}`)).filter((entry): entry is string => Boolean(entry))
}

function parseHistoricalCandidateItem(value: unknown): HistoricalCandidateItem {
  if (!isRecord(value)) throw new ClientBrainV2HttpError('Historical candidate contains an invalid Feed concept.', 409)
  const slot = Number(value.slot)
  const pillar = historicalCandidateText(value.pillar, 'pillar', 40) as MonthlyPlanPillar
  const method = historicalCandidateText(value.production_method, 'production method', 40) as typeof MONTHLY_PLAN_METHODS[number]
  const primaryType = historicalCandidateText(value.primary_subject_type, 'primary subject type', 40) as HistoricalCandidateItem['primary_subject_type']
  const venue = value.venue_requirement == null ? 'none' : historicalCandidateText(value.venue_requirement, 'venue requirement', 40)
  if (!Number.isInteger(slot) || slot < 1 || slot > 60 || !MONTHLY_PLAN_PILLARS.includes(pillar)) {
    throw new ClientBrainV2HttpError('Historical candidate contains an invalid Feed slot or pillar.', 409)
  }
  if (!MONTHLY_PLAN_METHODS.includes(method)) throw new ClientBrainV2HttpError('Historical candidate contains an invalid production method.', 409)
  if (!['food', 'drinks', 'venue', 'lifestyle', 'service'].includes(primaryType)) {
    throw new ClientBrainV2HttpError('Historical candidate contains an invalid primary subject type.', 409)
  }
  if (!['none', 'interior', 'exterior'].includes(venue)) throw new ClientBrainV2HttpError('Historical candidate contains an invalid venue requirement.', 409)
  const primarySubjectId = historicalCandidateId(value.primary_subject_id, 'primary subject')
  if ((primaryType === 'food' || primaryType === 'drinks') !== Boolean(primarySubjectId)) {
    throw new ClientBrainV2HttpError('Historical candidate primary subject references are incomplete.', 409)
  }
  return {
    slot,
    pillar,
    archetype: historicalCandidateText(value.archetype, 'archetype', 80),
    people_mode: historicalCandidateText(value.people_mode, 'people mode', 80),
    date_or_null: value.date_or_null == null || value.date_or_null === '' ? null : historicalCandidateText(value.date_or_null, 'date', 10),
    activation_id: value.activation_id == null || value.activation_id === '' ? null : historicalCandidateText(value.activation_id, 'activation', 120),
    concept_title: historicalCandidateText(value.concept_title, 'concept title', MONTHLY_PLANNING_TEXT_LIMITS.concept_title),
    concept_summary: historicalCandidateText(value.concept_summary, 'concept summary', 4_000),
    production_method: method,
    venue_requirement: venue as HistoricalCandidateItem['venue_requirement'],
    primary_subject_id: primarySubjectId,
    primary_subject_type: primaryType,
    supporting_food_ids: historicalCandidateIds(value.supporting_food_ids, 'supporting Food references'),
    supporting_drink_ids: historicalCandidateIds(value.supporting_drink_ids, 'supporting Drink references'),
  }
}

function parseHistoricalCandidateStrategy(value: unknown, targetCount: number): PlanStrategy {
  if (!isRecord(value)) throw new ClientBrainV2HttpError('Historical candidate strategy is missing.', 409)
  const raw = value as HistoricalCandidateStrategy
  const distribution = isRecord(raw.pillar_mix) ? raw.pillar_mix : null
  if (!distribution) throw new ClientBrainV2HttpError('Historical candidate strategy has no pillar mix.', 409)
  const content_pillar_distribution = Object.fromEntries(MONTHLY_PLAN_PILLARS.map(pillar => {
    const count = Number(distribution[pillar] ?? 0)
    if (!Number.isInteger(count) || count < 0) throw new ClientBrainV2HttpError('Historical candidate strategy has an invalid pillar mix.', 409)
    return [pillar, count]
  }))
  if (Object.values(content_pillar_distribution).reduce((total, count) => total + count, 0) !== targetCount) {
    throw new ClientBrainV2HttpError('Historical candidate pillar mix does not match the plan target.', 409)
  }
  return {
    primary_objective: historicalCandidateText(raw.primary_objective, 'strategy objective', MONTHLY_PLANNING_STRATEGY_LIMITS.primary_objective),
    priorities: stringList(raw.priorities, 3),
    content_pillar_distribution,
    creative_direction: historicalCandidateText(raw.creative_direction, 'creative direction', MONTHLY_PLANNING_STRATEGY_LIMITS.creative_direction),
    visual_rhythm: historicalCandidateText(raw.visual_rhythm, 'visual rhythm', MONTHLY_PLANNING_STRATEGY_LIMITS.visual_rhythm),
    avoid: stringList(raw.avoid, 3),
  }
}

function historicalCandidateDates(items: HistoricalCandidateItem[], planMonth: string) {
  const { end } = planMonthBounds(planMonth)
  const daysInMonth = Number(end.slice(-2))
  const occupied = new Set<string>()
  const ordered = [...items].sort((left, right) => left.slot - right.slot)
  return ordered.map((item, index) => {
    if (item.date_or_null) {
      const date = requestedDate(item.date_or_null, planMonth)
      if (!date || occupied.has(date)) throw new ClientBrainV2HttpError('Historical candidate contains duplicate or invalid fixed dates.', 409)
      occupied.add(date)
      return { ...item, planned_date: date, date_fixed: true }
    }
    const idealDay = Math.max(1, Math.min(daysInMonth, Math.round(((index + 1) * (daysInMonth + 1)) / (ordered.length + 1))))
    let chosenDay = idealDay
    while (chosenDay <= daysInMonth && occupied.has(isoDateForDay(planMonth, chosenDay))) chosenDay += 1
    if (chosenDay > daysInMonth) {
      chosenDay = idealDay - 1
      while (chosenDay >= 1 && occupied.has(isoDateForDay(planMonth, chosenDay))) chosenDay -= 1
    }
    if (chosenDay < 1) throw new ClientBrainV2HttpError('Unable to assign unique September publishing dates.', 409)
    const planned_date = isoDateForDay(planMonth, chosenDay)
    occupied.add(planned_date)
    return { ...item, planned_date, date_fixed: false }
  })
}

function historicalCandidateObjective(pillar: MonthlyPlanPillar) {
  return ({
    lifestyle: 'Build warm Italian lifestyle awareness.',
    food: 'Build menu awareness through a current dish.',
    drinks: 'Build beverage consideration through a current drink.',
    interiors: 'Build venue consideration through truthful atmosphere.',
    events: 'Build awareness of a verified current activation.',
    bts_service: 'Build hospitality and service affinity.',
  } as const)[pillar]
}

function historicalCandidateGridRole(item: HistoricalCandidateItem) {
  if (item.pillar === 'food') return item.archetype === 'macro_detail' ? 'product_detail' : 'hero_food'
  if (item.pillar === 'drinks') return 'product_detail'
  if (item.pillar === 'interiors') return 'venue_breather'
  if (item.pillar === 'lifestyle') return 'lifestyle_break'
  if (item.pillar === 'bts_service') return 'human_moment'
  return 'event_commercial'
}

/**
 * Promotes a complete stored planning response without calling an AI provider.
 * The strict production failure remains historical evidence; readiness is saved
 * under the strategy-first planner rules for deliberate human QC.
 */
export async function acceptHistoricalMonthlyPlanningCandidate(input: {
  clientId: string
  planId: string
  executionId: string
  expectedUpdatedAt: string
}) {
  if (!isUuid(input.clientId) || !isUuid(input.planId) || !isUuid(input.executionId)) {
    throw new ClientBrainV2HttpError('Monthly Planning candidate was not found.', 404)
  }
  const [planResult, executionResult, context] = await Promise.all([
    clientBrainV2ServerClient
      .from('social_monthly_content_plans')
      .select('*')
      .eq('id', input.planId)
      .eq('client_id', input.clientId)
      .eq('is_current', true)
      .maybeSingle(),
    clientBrainV2ServerClient
      .from('social_monthly_plan_ai_executions')
      .select('*')
      .eq('id', input.executionId)
      .eq('client_id', input.clientId)
      .eq('monthly_plan_id', input.planId)
      .maybeSingle(),
    buildPlanningContext(input.clientId),
  ])
  if (planResult.error || executionResult.error) throw new ClientBrainV2HttpError('Unable to load the historical Monthly Planning candidate.', 500)
  const plan = planResult.data
  const execution = executionResult.data
  if (!plan || !execution) throw new ClientBrainV2HttpError('Monthly Planning candidate was not found.', 404)
  if (plan.updated_at !== input.expectedUpdatedAt) throw new ClientBrainV2HttpError('This Monthly Plan changed after the candidate was reviewed. Refresh before accepting it.', 409)
  if (execution.action_type !== 'full_plan' || !isRecord(execution.sanitized_debug_payload)) {
    throw new ClientBrainV2HttpError('This execution is not a complete Monthly Plan candidate.', 409)
  }
  const payload = execution.sanitized_debug_payload
  const rawItems = Array.isArray(payload.feed_items) ? payload.feed_items : []
  if (rawItems.length !== plan.target_feed_count) throw new ClientBrainV2HttpError('Historical candidate does not contain the exact target Feed count.', 409)
  const candidateItems: HistoricalCandidateItem[] = (rawItems as unknown[]).map((item: unknown) => parseHistoricalCandidateItem(item))
  candidateItems.sort((left, right) => left.slot - right.slot)
  if (candidateItems.some((item: HistoricalCandidateItem, index: number) => item.slot !== index + 1)) {
    throw new ClientBrainV2HttpError('Historical candidate Feed slots are incomplete or duplicated.', 409)
  }
  const strategy = parseHistoricalCandidateStrategy(payload.monthly_strategy, plan.target_feed_count)
  const dates = historicalCandidateDates(candidateItems, String(plan.plan_month))
  const productEntries: Array<[string, { product: ProductionCapabilityProduct; type: 'food' | 'drinks' }]> = [
    ...context.production_capability.food.map(product => [`food:${product.menu_item_id}`, { product, type: 'food' as const }] as [string, { product: ProductionCapabilityProduct; type: 'food' }]),
    ...context.production_capability.drinks.map(product => [`drink:${product.menu_item_id}`, { product, type: 'drinks' as const }] as [string, { product: ProductionCapabilityProduct; type: 'drinks' }]),
  ]
  const productsById = new Map<string, { product: ProductionCapabilityProduct; type: 'food' | 'drinks' }>(productEntries)
  const menusById = new Map(context.menu_catalog.map(menu => [menu.id, menu]))
  const pizzaSenzaFine = context.activation_catalog.find(activation => activation.name.trim().toLocaleLowerCase('en-US') === 'pizza senza fine') ?? null
  const readinessBySlot = new Map<number, MonthlyPlanningReadiness>(candidateItems.map((item: HistoricalCandidateItem) => {
    const readiness = candidateReadinessState({ item: item as unknown as Json, context })
    return [item.slot, { state: readiness.state, label: readiness.label, reason: readiness.reason }] as [number, MonthlyPlanningReadiness]
  }))
  if ([...readinessBySlot.values()].some(readiness => readiness.state === 'blocked')) {
    throw new ClientBrainV2HttpError('Historical candidate has a structurally blocked concept and cannot be promoted.', 409)
  }
  const persisted = dates.map(item => {
    const primary = item.primary_subject_id ? productsById.get(item.primary_subject_id) ?? null : null
    if ((item.primary_subject_type === 'food' || item.primary_subject_type === 'drinks') && !primary) {
      throw new ClientBrainV2HttpError(`Historical candidate P${String(item.slot).padStart(2, '0')} has a product that is no longer available for this client.`, 409)
    }
    const supporting = [...item.supporting_food_ids, ...item.supporting_drink_ids].map(id => productsById.get(id) ?? null)
    if (supporting.some(product => !product)) {
      throw new ClientBrainV2HttpError(`Historical candidate P${String(item.slot).padStart(2, '0')} has an invalid supporting product reference.`, 409)
    }
    const primaryAssetIds = primary?.product.asset_ids.slice(0, 1) ?? []
    const supportingAssetIds = supporting.flatMap(product => product!.product.asset_ids.slice(0, 1))
    const menu = primary ? menusById.get(primary.product.menu_item_id) ?? null : null
    const activation = item.activation_id
      ? context.activation_catalog.find(candidate => candidate.id === item.activation_id) ?? null
      : /\bpizza\s+senza\s+fine\b/i.test(`${item.concept_title} ${item.concept_summary}`) ? pizzaSenzaFine : null
    if (item.activation_id && !activation) throw new ClientBrainV2HttpError(`Historical candidate P${String(item.slot).padStart(2, '0')} has an invalid activation reference.`, 409)
    const readiness = readinessBySlot.get(item.slot)!
    const subject = primary?.product.canonical_name
      ?? (item.primary_subject_type === 'venue' ? (item.venue_requirement === 'exterior' ? 'Restaurant exterior' : 'Restaurant interior')
        : item.primary_subject_type === 'lifestyle' ? 'Anonymous dining moment'
          : 'Anonymous hospitality service moment')
    const subject_identity: ResolvedMonthlyPlanningSubject = primary && menu
      ? { type: 'menu_item', ref: menu.key, label: primary.product.canonical_name, canonical_id: primary.product.menu_item_id, canonical_name: primary.product.canonical_name, menu_record_id: menu.menu_record_id, activation_record_id: null }
      : { type: item.primary_subject_type === 'venue' ? 'venue' : item.primary_subject_type === 'lifestyle' ? 'lifestyle' : 'service', ref: null, label: subject, canonical_id: null, canonical_name: null, menu_record_id: null, activation_record_id: null }
    const supporting_subjects = supporting.map(product => product!.product.canonical_name)
    const readinessReason = readiness.reason
    return {
      position: item.slot,
      planned_date: item.planned_date,
      date_fixed: item.date_fixed,
      pillar: item.pillar,
      objective: historicalCandidateObjective(item.pillar),
      subject,
      creative_concept: item.concept_summary,
      production_method: item.production_method,
      required_assets: [...new Set([...primaryAssetIds, ...supportingAssetIds])],
      missing_asset_note: readinessReason ?? '',
      visual_direction: '',
      grid_role: historicalCandidateGridRole(item),
      activation_record_id: activation?.id ?? null,
      commercial_rationale: '',
      caption_brief: '',
      status: 'ready',
      metadata: {
        planning_ai: {
          prompt_version: String(execution.prompt_version),
          execution_id: execution.id,
          generated_at: execution.completed_at ?? execution.created_at,
          accepted_from_historical_execution: true,
          candidate_concept_title: item.concept_title,
          candidate_archetype: item.archetype,
          candidate_people_mode: item.people_mode,
          candidate_venue_requirement: item.venue_requirement,
          subject_identity,
          menu_item_ids: primary ? [primary.product.menu_item_id] : [],
          supporting_product_asset_ids: supportingAssetIds,
          supporting_subjects,
          scene_requires_visible_products: supportingAssetIds.length > 0,
          activation_reference_key: activation?.key ?? null,
          planning_warnings: readinessReason ? [readinessReason] : [],
          planning_readiness: { state: readiness.state, label: readiness.label, reason: readinessReason },
        },
      },
    }
  })
  const currentVersionResult = await clientBrainV2ServerClient
    .from('social_monthly_content_plans')
    .select('id,ai_provenance')
    .eq('client_id', input.clientId)
    .eq('platform', plan.platform)
    .eq('plan_month', plan.plan_month)
  if (currentVersionResult.error) throw new ClientBrainV2HttpError('Unable to verify prior Monthly Plan versions.', 500)
  if ((currentVersionResult.data ?? []).some(candidate => isRecord(candidate.ai_provenance) && candidate.ai_provenance.accepted_from_execution_id === execution.id)) {
    throw new ClientBrainV2HttpError('This historical candidate has already been promoted to a Monthly Plan version.', 409)
  }
  const readinessCounts = Object.fromEntries(['ready', 'needs_review', 'needs_production_setup', 'blocked'].map(state => [state, [...readinessBySlot.values()].filter(readiness => readiness.state === state).length]))
  const provenance = {
    provider: execution.provider,
    model: execution.model,
    prompt_version: execution.prompt_version,
    execution_id: execution.id,
    generated_at: execution.completed_at ?? execution.created_at,
    accepted_from_execution_id: execution.id,
    acceptance_mode: 'historical_candidate_promotion',
    original_execution_outcome: execution.execution_outcome,
    original_validation_stage: execution.validation_stage,
    readiness_counts: readinessCounts,
    warnings: [...readinessBySlot.values()].flatMap(readiness => readiness.reason ? [readiness.reason] : []),
  }
  const snapshot = monthlyPlanningSnapshotFromContext(context)
  const { data: newPlanId, error } = await clientBrainV2ServerClient.rpc('create_social_monthly_plan_version_from_ai_generation', {
    p_client_id: input.clientId,
    p_plan_id: input.planId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_strategy: strategy,
    p_visual_direction: strategy.creative_direction,
    p_grid_notes: 'Accepted historical candidate for human quality control. Readiness warnings remain visible and non-blocking.',
    p_client_brain_snapshot: snapshot,
    p_ai_provenance: provenance,
    p_items: persisted,
    p_action_type: 'plan_generated',
    p_summary: `Accepted existing planning execution ${execution.id} as a new immutable Monthly Plan version for human QC. No provider call was made.`,
  })
  if (error || !newPlanId) throw new ClientBrainV2HttpError(error?.message || 'Unable to create the immutable Monthly Plan version.', 500)
  return {
    plan_id: newPlanId as string,
    source_execution_id: execution.id,
    readiness_counts: readinessCounts,
    dates: persisted.map(item => ({ position: item.position, planned_date: item.planned_date })),
    provider_calls: 0,
  }
}

export async function buildMonthlyPlanningSnapshot(clientId: string) {
  const context = await buildPlanningContext(clientId)
  return monthlyPlanningSnapshotFromContext(context)
}

function monthlyPlanningSnapshotFromContext(context: MonthlyPlanningContext) {
  return {
    client: context.client,
    intelligence: context.client_truth.map(record => ({ subsection: record.subsection, title: record.title, summary: record.detail, status: 'current' })),
    menus: context.menu_catalog.map(menu => ({ id: menu.id, name: menu.name, availability: menu.section, status: 'current' })),
    activations: context.activation_catalog.map(activation => ({ id: activation.id, name: activation.name, proposition: activation.proposition, status: 'current', temporal_status: 'current', product_truth_status: activation.product_truth_status ?? 'not_applicable' })),
    assets: context.asset_catalog.map(asset => ({ id: asset.id, name: asset.name, category: asset.category, tags: asset.tags, activation_ids: [] })),
    production_capability: context.production_capability,
    learnings: context.learnings.map(learning => ({ category: learning.category, statement: learning.statement, confidence: learning.confidence })),
    warnings: context.warnings.map((message, index) => ({ code: `planning_context_${index + 1}`, message })),
    planning_context: context,
    retrieved_at: context.retrieved_at,
  } as const
}

function executionModel() {
  return process.env.MONTHLY_PLANNING_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
}

function persistedItems(items: PlannedItem[], context: MonthlyPlanningContext, execution: Json) {
  const refs = itemReferences(context)
  return items.map(item => ({
    position: item.position,
    planned_date: item.planned_date,
    date_fixed: item.date_fixed,
    pillar: item.pillar,
    objective: item.objective,
    subject: item.subject,
    creative_concept: item.creative_concept,
    production_method: item.production_method,
    required_assets: [...new Set([...item.asset_refs, ...item.supporting_product_refs].map(key => refs.assets.get(key)!.id))],
    missing_asset_note: item.required_asset_notes,
    visual_direction: item.visual_direction,
    grid_role: item.grid_role,
    activation_record_id: item.activation_ref ? refs.activations.get(item.activation_ref)!.id : null,
    commercial_rationale: item.commercial_rationale,
    caption_brief: item.caption_brief,
    status: item.status,
    metadata: {
      planning_ai: {
        prompt_version: MONTHLY_PLANNING_PROMPT_VERSION,
        execution_id: execution.execution_id,
        generated_at: execution.generated_at,
        asset_reference_keys: item.asset_refs,
        supporting_product_reference_keys: item.supporting_product_refs,
        supporting_product_asset_ids: item.supporting_product_refs.map(key => refs.assets.get(key)!.id),
        scene_requires_visible_products: item.scene_requires_visible_products,
        subject_identity: item.subject_identity,
        menu_item_ids: item.menu_item_refs.map(key => refs.menus.get(key)!.id),
        activation_reference_key: item.activation_ref,
        planning_warnings: item.planning_warnings,
        planning_readiness: item.planning_readiness,
      },
    },
  }))
}

function currentPlanItemShape(item: Json) {
  return {
    position: item.position,
    planned_date: item.planned_date,
    date_fixed: item.date_fixed,
    pillar: item.pillar,
    objective: item.objective,
    subject: item.subject,
    creative_concept: item.creative_concept,
    production_method: item.production_method,
    visual_direction: item.visual_direction,
    grid_role: item.grid_role,
    status: item.status,
  }
}

async function callPlanningModel(input: {
  clientId: string
  mode: MonthlyPlanningMode
  plan: Json
  context: MonthlyPlanningContext
  executionId: string
  generatedAt: string
  existingStrategy?: Json
  existingItems?: Json[]
  targetItem?: Json
  correction?: string
}) {
  const model = executionModel()
  const status = textExecutionProviderStatus({ provider: 'anthropic', model })
  if (!status.configured) throw new ClientBrainV2HttpError('Planning AI is not currently available. Manual planning remains available.', 503)
  const maxTokens = input.mode === 'full_plan' || input.mode === 'feed_plan'
    ? FULL_PLAN_MAX_OUTPUT_TOKENS
    : input.mode === 'strategy_only' ? 700 : 700
  const promptInput = {
    mode: input.mode,
    plan: {
      id: requiredText(input.plan.id, 'plan id', 80),
      plan_month: requiredText(input.plan.plan_month, 'plan month', 10),
      target_feed_count: Number(input.plan.target_feed_count),
      monthly_context: stringValue(input.plan.monthly_context, 3_500),
      research_context: stringValue((isRecord(input.plan.research_context) ? input.plan.research_context.additional_context : ''), 1_800),
    },
    context: input.context,
    existing_strategy: input.existingStrategy,
    existing_items: input.existingItems,
    target_item: input.targetItem,
    correction: input.correction,
  } satisfies MonthlyPlanningPromptInput
  const prompt = monthlyPlanningUserPrompt(promptInput)
  if (prompt.length > PLANNING_MAX_INPUT_CHARS) {
    throw new ClientBrainV2HttpError('Planning context is too large for a bounded monthly run. Shorten the saved monthly or research context and retry.', 422)
  }
  const result = await executeTextRun({
    provider: 'anthropic',
    model,
    maxTokens,
    temperature: 0.18,
    timeoutMs: input.mode === 'full_plan' || input.mode === 'feed_plan' ? 150_000 : 45_000,
    system: monthlyPlanningSystemPrompt(),
    prompt,
    structuredOutput: {
      name: 'submit_monthly_feed_plan',
      description: 'Returns the bounded monthly planning decisions for Jarvis to validate and apply.',
      schema: monthlyPlanningToolSchema(promptInput),
    },
    route: '/api/clients/[id]/monthly-plans/[planId]/generate',
    feature: 'monthly_content_planning',
    clientId: input.clientId,
  })
  return {
    result,
    maxTokens,
    execution: {
      execution_id: input.executionId,
      provider: result.provider,
      model: result.model,
      prompt_version: MONTHLY_PLANNING_PROMPT_VERSION,
      generated_at: input.generatedAt,
      status: 'success',
      attempts: 1,
      latency_ms: result.durationMs ?? 0,
      input_tokens: result.inputTokens ?? 0,
      output_tokens: result.outputTokens ?? 0,
      actual_cost_usd: result.actualCost ?? 0,
      finish_reason: result.finishReason ?? null,
      structured_output: Boolean(result.structuredOutput),
    },
  }
}

type PlanningProviderRun = Awaited<ReturnType<typeof callPlanningModel>>

function providerDiagnosticPayload(run: PlanningProviderRun | null, output?: ModelPlanOutput) {
  if (output) return output
  if (run?.result.structuredOutput) return run.result.structuredOutput
  return { structured_output_available: false }
}

function providerDiagnosticFields(run: PlanningProviderRun | null) {
  const result = run?.result
  const response = result?.rawResponse ?? ''
  return {
    completedAt: new Date().toISOString(),
    latencyMs: result?.durationMs ?? null,
    inputTokens: result?.inputTokens ?? null,
    outputTokens: result?.outputTokens ?? null,
    cacheReadTokens: result?.cacheReadTokens ?? null,
    cacheWriteTokens: result?.cacheWriteTokens ?? null,
    costUsdActual: result?.actualCost ?? null,
    finishReason: result?.finishReason ?? null,
    structuredToolInvoked: Boolean(result?.structuredOutput),
    outputCharacterCount: response.length || null,
    outputByteCount: response ? Buffer.byteLength(response, 'utf8') : null,
  }
}

export async function generateMonthlyPlan(input: {
  clientId: string
  planId: string
  expectedUpdatedAt: string
  mode?: MonthlyPlanningMode
  replaceExisting?: boolean
  createNewVersion?: boolean
  itemId?: string
  correction?: string
}) {
  const mode = input.mode ?? 'full_plan'
  if (!['full_plan', 'strategy_only', 'feed_plan', 'single_concept'].includes(mode)) {
    throw new ClientBrainV2HttpError('Unsupported Planning AI generation mode.', 400)
  }
  if (!isUuid(input.clientId) || !isUuid(input.planId)) throw new ClientBrainV2HttpError('Monthly Plan not found.', 404)
  if (input.createNewVersion && mode !== 'full_plan') {
    throw new ClientBrainV2HttpError('Creating a new immutable Monthly Plan version is available only for a complete plan generation.', 400)
  }
  const detail = await getMonthlyPlan(input.clientId, input.planId)
  const plan = detail.plan as Json
  if (input.expectedUpdatedAt !== plan.updated_at) throw new ClientBrainV2HttpError('This Monthly Plan changed after editing began. Refresh and review the latest version.', 409)
  if (mode !== 'single_concept' && detail.items.length && !input.replaceExisting) {
    throw new ClientBrainV2HttpError('This will replace existing Feed concepts. Confirm replacement before generating a new plan.', 409)
  }
  const targetItem = mode === 'single_concept'
    ? detail.items.find(item => item.id === input.itemId)
    : null
  if (mode === 'single_concept' && !targetItem) throw new ClientBrainV2HttpError('Feed concept not found.', 404)
  const targetCount = Number(plan.target_feed_count)
  const executionId = randomUUID()
  const startedAt = new Date().toISOString()
  const model = executionModel()
  await startMonthlyPlanningExecution({
    id: executionId,
    clientId: input.clientId,
    planId: input.planId,
    actionType: mode,
    promptVersion: MONTHLY_PLANNING_PROMPT_VERSION,
    provider: 'anthropic',
    model,
    startedAt,
    structuredToolName: 'submit_monthly_feed_plan',
  })

  let providerRun: PlanningProviderRun | null = null
  let output: ModelPlanOutput | undefined
  try {
    const context = await buildPlanningContext(input.clientId)
    providerRun = await callPlanningModel({
      clientId: input.clientId,
      mode,
      plan,
      context,
      executionId,
      generatedAt: startedAt,
      existingStrategy: mode === 'feed_plan' || mode === 'single_concept' ? (isRecord(plan.strategy) ? plan.strategy : {}) : undefined,
      existingItems: mode === 'single_concept' ? detail.items.map(item => currentPlanItemShape(item as Json)) : undefined,
      targetItem: targetItem ? currentPlanItemShape(targetItem as Json) : undefined,
      correction: stringValue(input.correction, 1_200),
    })
    const providerFields = providerDiagnosticFields(providerRun)
    if (!providerRun.result.ok) {
      throw monthlyPlanningDiagnosticError('Planning AI did not return a complete valid plan. Your existing plan was not changed.', {
        outcome: 'provider_failed', stage: 'provider_response', field: 'provider_response', value: providerRun.result.error ?? null,
      })
    }
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, {
      ...providerFields,
      validationStage: 'provider_response',
      executionOutcome: 'provider_succeeded',
      sanitizedDebugPayload: providerDiagnosticPayload(providerRun),
    })
    if (!providerRun.result.rawResponse) {
      throw monthlyPlanningDiagnosticError('Planning AI did not return a complete valid plan. Your existing plan was not changed.', {
        outcome: 'structured_output_missing', stage: 'tool_output_extracted', field: 'submit_monthly_feed_plan',
      })
    }
    if ((providerRun.result.outputTokens ?? 0) >= providerRun.maxTokens - 128) {
      throw monthlyPlanningDiagnosticError('Planning AI response reached the bounded output limit and was not applied. Your existing plan was not changed.', {
        outcome: 'schema_failed', stage: 'tool_output_extracted', field: 'output_tokens', value: String(providerRun.result.outputTokens ?? 0),
      })
    }
    try {
      output = (providerRun.result.structuredOutput ?? parseJson(providerRun.result.rawResponse)) as ModelPlanOutput
    } catch (error) {
      if (error instanceof ClientBrainV2HttpError) throw monthlyPlanningDiagnosticError(error.message, { outcome: 'schema_failed', stage: 'schema_validation', field: 'submit_monthly_feed_plan' })
      throw error
    }
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, {
      ...providerFields,
      validationStage: 'tool_output_extracted',
      executionOutcome: 'provider_succeeded',
      sanitizedDebugPayload: output,
    })

    if (mode === 'strategy_only') {
      const strategy = validateStrategy(output.monthly_strategy, targetCount, MONTHLY_PLAN_PILLARS)
      const provenance = providerRun.execution as Json
      const snapshot = monthlyPlanningSnapshotFromContext(context)
      const { data, error } = await clientBrainV2ServerClient
        .from('social_monthly_content_plans')
        .update({ strategy, visual_direction: strategy.creative_direction, ai_provenance: provenance, client_brain_snapshot: snapshot, snapshot_at: snapshot.retrieved_at })
        .eq('id', input.planId).eq('client_id', input.clientId).eq('updated_at', input.expectedUpdatedAt).select('*').maybeSingle()
      if (error) throw monthlyPlanningDiagnosticError('Unable to save the regenerated strategy.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', field: 'strategy' }, 500)
      if (!data) throw monthlyPlanningDiagnosticError('This Monthly Plan changed after AI planning began. Refresh and review the latest version.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', field: 'expected_updated_at' }, 409)
      const { error: activityError } = await clientBrainV2ServerClient.from('social_monthly_plan_activity').insert({ client_id: input.clientId, monthly_plan_id: input.planId, action_type: 'strategy_regenerated', summary: 'Regenerated Monthly Strategy without replacing Feed concepts.', metadata: { execution: provenance } })
      if (activityError) throw monthlyPlanningDiagnosticError('Strategy was saved but planning history could not be recorded.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', field: 'activity' }, 500)
      await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields, validationStage: 'succeeded', executionOutcome: 'succeeded', sanitizedDebugPayload: output })
      return { mode, plan: data, strategy, warnings: [], execution: providerRun.execution }
    }

    if (mode === 'single_concept') {
      const item = validateItem(output.feed_item, String(plan.plan_month), context, Number(targetItem!.position))
      if (item.requested_date) {
        item.planned_date = item.requested_date
        item.date_fixed = true
      } else {
        item.planned_date = String(targetItem!.planned_date ?? '')
        item.date_fixed = targetItem!.date_fixed === true
      }
      if (!item.planned_date) throw monthlyPlanningDiagnosticError('The existing Feed concept has no planned date to preserve.', { outcome: 'date_failed', stage: 'date_validation', slot: item.position, field: 'planned_date' }, 409)
      const persisted = persistedItems([item], context, providerRun.execution as Json)[0]
      const existingMetadata = isRecord(targetItem!.metadata) ? targetItem!.metadata : {}
      const { data, error } = await clientBrainV2ServerClient
        .from('social_monthly_content_plan_items')
        .update({ ...persisted, metadata: { ...existingMetadata, ...persisted.metadata } })
        .eq('id', targetItem!.id).eq('client_id', input.clientId).eq('monthly_plan_id', input.planId).eq('updated_at', targetItem!.updated_at).select('*').maybeSingle()
      if (error) throw monthlyPlanningDiagnosticError('Unable to save the regenerated Feed concept.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', slot: item.position }, 500)
      if (!data) throw monthlyPlanningDiagnosticError('This Feed concept changed after AI planning began. Refresh and review the latest version.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', slot: item.position, field: 'expected_updated_at' }, 409)
      const { error: activityError } = await clientBrainV2ServerClient.from('social_monthly_plan_activity').insert({ client_id: input.clientId, monthly_plan_id: input.planId, item_id: targetItem!.id, action_type: 'concept_regenerated', summary: `Regenerated Feed concept ${item.position}.`, metadata: { execution: providerRun.execution, correction: stringValue(input.correction, 1_200) } })
      if (activityError) throw monthlyPlanningDiagnosticError('Feed concept was saved but planning history could not be recorded.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', slot: item.position, field: 'activity' }, 500)
      await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields, validationStage: 'succeeded', executionOutcome: 'succeeded', sanitizedDebugPayload: output })
      return { mode, item: data, warnings: [...item.planning_warnings, ...deterministicWarnings([item], 1)], execution: providerRun.execution }
    }

    if (!Array.isArray(output.feed_items)) throw monthlyPlanningDiagnosticError('Planning AI did not return Feed concepts.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'feed_items' })
    const items = distributeDates(output.feed_items.map(item =>
      validateItem(item, String(plan.plan_month), context)), String(plan.plan_month))
    if (items.length !== targetCount) throw monthlyPlanningDiagnosticError(`Expected ${targetCount} concepts; received ${items.length}.`, { outcome: 'count_failed', stage: 'item_count_validation', field: 'feed_items', value: String(items.length) })
    const positions = new Set(items.map(item => item.position))
    if (positions.size !== targetCount || [...positions].some(position => position < 1 || position > targetCount)) throw monthlyPlanningDiagnosticError('Planning AI returned invalid or duplicate Feed positions.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'slot' })
    const warnings = [...new Set([...items.flatMap(item => item.planning_warnings), ...deterministicWarnings(items, targetCount)])]
    const strategy = mode === 'feed_plan'
      ? (isRecord(plan.strategy) ? plan.strategy as PlanStrategy : null)
      : validateStrategy(output.monthly_strategy, targetCount, MONTHLY_PLAN_PILLARS)
    if (!strategy) throw monthlyPlanningDiagnosticError('Save a Monthly Strategy before regenerating only the Feed plan.', { outcome: 'business_rule_failed', stage: 'business_rule_validation', field: 'strategy' }, 409)
    const finalProvenance = { ...providerRun.execution, warnings }
    const persisted = persistedItems(items, context, finalProvenance)
    const snapshot = monthlyPlanningSnapshotFromContext(context)
    const applyArguments = {
      p_client_id: input.clientId,
      p_plan_id: input.planId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_strategy: strategy,
      p_visual_direction: strategy.creative_direction,
      p_grid_notes: warnings.join(' '),
      p_client_brain_snapshot: snapshot,
      p_ai_provenance: finalProvenance,
      p_items: persisted,
      p_action_type: mode === 'full_plan' ? 'plan_generated' : 'plan_regenerated',
      p_summary: mode === 'full_plan' ? `Generated Monthly Strategy and ${targetCount} Feed concepts.` : `Regenerated ${targetCount} Feed concepts using the current strategy.`,
    }
    const { data: appliedPlanId, error } = input.createNewVersion
      ? await clientBrainV2ServerClient.rpc('create_social_monthly_plan_version_from_ai_generation', applyArguments)
      : await clientBrainV2ServerClient.rpc('apply_social_monthly_plan_ai_generation', applyArguments)
    const applyFunction = input.createNewVersion
      ? 'create_social_monthly_plan_version_from_ai_generation'
      : 'apply_social_monthly_plan_ai_generation'
    if (error) throw monthlyPlanningDiagnosticError(error.message || 'Unable to apply the generated Monthly Plan.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', field: applyFunction }, 500)
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields, validationStage: 'succeeded', executionOutcome: 'succeeded', sanitizedDebugPayload: output })
    return { mode, strategy, warnings, execution: providerRun.execution, plan_id: appliedPlanId ?? input.planId, created_new_version: input.createNewVersion === true }
  } catch (error) {
    const issue = diagnosticFromError(error)
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, {
      ...providerDiagnosticFields(providerRun),
      validationStage: issue.stage,
      validationErrors: [diagnosticMessage(error)],
      failingSlot: issue.slot ?? null,
      failingField: issue.field ?? null,
      failingValue: issue.value ?? null,
      failingReference: issue.outcome === 'reference_failed' ? issue.value ?? null : null,
      executionOutcome: issue.outcome,
      sanitizedDebugPayload: providerDiagnosticPayload(providerRun, output),
    })
    if (error instanceof ClientBrainV2HttpError) throw error
    throw new ClientBrainV2HttpError('Planning AI did not return a complete valid plan. Your existing plan was not changed.', 502)
  }
}

export function monthlyPlanningProviderStatus() {
  const model = executionModel()
  return { ...textExecutionProviderStatus({ provider: 'anthropic', model }), prompt_version: MONTHLY_PLANNING_PROMPT_VERSION }
}
