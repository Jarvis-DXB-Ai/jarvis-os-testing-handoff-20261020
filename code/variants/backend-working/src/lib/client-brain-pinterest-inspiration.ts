export const PINTEREST_INSPIRATION_STATUSES = ['active', 'needs_review', 'disabled'] as const
export const PINTEREST_INSPIRATION_ANALYSIS_STATES = ['pending', 'analyzed', 'failed'] as const
export const PINTEREST_CREATIVE_CATEGORIES = ['food', 'drink', 'lifestyle', 'interior', 'exterior', 'people', 'service_bts', 'graphic_design', 'product', 'other'] as const
export const PINTEREST_LIGHTING_STYLES = ['soft_natural', 'hard_directional', 'golden_hour', 'warm_ambient', 'flash_editorial', 'high_key', 'low_key', 'backlit', 'mixed_practical', 'studio', 'other'] as const
export const PINTEREST_BACKGROUND_STYLES = ['clean_minimal', 'bold_colour', 'venue_context', 'table_context', 'environmental', 'dark_moody', 'bright_airy', 'textured', 'abstract', 'other'] as const
export const PINTEREST_BEST_FOR_VALUES = ['food_hero', 'food_sharing', 'communal_dining', 'macro_food', 'food_texture', 'food_action', 'food_preparation', 'drink_hero', 'drink_interaction', 'drink_pour', 'social_dining', 'lifestyle', 'human_interaction', 'chef_bts', 'service', 'interior', 'graphic_food', 'graphic_editorial', 'product_hero', 'motion', 'minimal_composition', 'editorial_still_life', 'colour_led_composition'] as const

export type PinterestInspirationStatus = typeof PINTEREST_INSPIRATION_STATUSES[number]
export type PinterestInspirationAnalysisState = typeof PINTEREST_INSPIRATION_ANALYSIS_STATES[number]
export type PinterestInspirationRecord = {
  id: string
  client_id: string
  file_object_id: string
  title: string
  source_type: 'pinterest' | 'manual_external'
  source_url: string | null
  source_board: string | null
  external_source_id: string | null
  original_source_note: string | null
  status: PinterestInspirationStatus
  creative_categories: string[]
  shot_scale: string | null
  camera_angle: string | null
  composition: string | null
  human_presence: string | null
  interaction: string | null
  motion: string | null
  lighting_style: string | null
  background_style: string | null
  creative_techniques: string[]
  visual_summary: string | null
  best_for: string[]
  notes: string | null
  analysis_state: PinterestInspirationAnalysisState
  analysis_provider: string | null
  analysis_model: string | null
  analyzed_at: string | null
  requires_individual_pin_upload: boolean
  analysis_error: string | null
  provenance: Record<string, unknown>
  created_at: string
  updated_at: string
  file: {
    id: string
    file_name: string
    file_type: string | null
    file_size_bytes: number | null
    signed_url: string | null
  }
}

export type PinterestInspirationTechnique = Pick<PinterestInspirationRecord,
  'id' | 'title' | 'creative_categories' | 'shot_scale' | 'camera_angle' | 'composition' |
  'human_presence' | 'interaction' | 'motion' | 'lighting_style' | 'background_style' |
  'creative_techniques' | 'visual_summary' | 'best_for'
> & {
  retrieval_match?: 'direct' | 'cross_category_technique' | 'broad_monthly_palette'
}

export type PinterestInspirationRetrievalMode = 'targeted' | 'monthly_palette'

export type PinterestMonthlyPlanContext = {
  pillar_counts: Record<string, number>
  subject_types?: string[]
  production_methods?: string[]
  grid_roles?: string[]
}

export type PinterestInspirationRetrievalInput = {
  contentPillars?: string[]
  subjects?: string[]
  interactions?: string[]
  shotScales?: string[]
  categories?: string[]
  cameraAngles?: string[]
  compositions?: string[]
  lightingStyles?: string[]
  bestFor?: string[]
  planContext?: PinterestMonthlyPlanContext
  query?: string
  limit?: number
  mode?: PinterestInspirationRetrievalMode
}

export function labelPinterestInspirationValue(value: string | null | undefined) {
  if (!value) return 'Not set'
  return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function normalizePinterestTags(values: unknown, max = 12) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.flatMap(value => typeof value === 'string' ? [value.trim().slice(0, 80)] : []).filter(Boolean))].slice(0, max)
}

/**
 * "Analyzed" is a retrieval-safety state, not merely a provider-response state.
 * Controlled not_applicable values are valid when a dimension is genuinely absent.
 */
export function pinterestInspirationAnalysisCompletenessError(record: Pick<PinterestInspirationTechnique,
  'creative_categories' | 'shot_scale' | 'camera_angle' | 'composition' | 'human_presence' |
  'interaction' | 'motion' | 'lighting_style' | 'creative_techniques' | 'visual_summary' | 'best_for'
> & { requires_individual_pin_upload?: boolean }) {
  if (record.requires_individual_pin_upload) return 'Analysis requires an individual pin upload before creative metadata can be completed.'
  const missing = [
    !record.creative_categories.length ? 'creative categories' : null,
    !record.shot_scale ? 'shot scale' : null,
    !record.camera_angle ? 'camera angle' : null,
    !record.composition ? 'composition' : null,
    !record.human_presence ? 'human presence' : null,
    !record.interaction ? 'interaction' : null,
    !record.motion ? 'motion' : null,
    !record.lighting_style ? 'lighting style' : null,
    !record.creative_techniques.length ? 'creative techniques' : null,
    !record.visual_summary?.trim() ? 'visual summary' : null,
    !record.best_for.length ? 'best for' : null,
  ].filter(Boolean)
  return missing.length ? `Analysis marked complete without required creative metadata: ${missing.join(', ')}.` : null
}

export function isPinterestInspirationAnalysisComplete(record: Parameters<typeof pinterestInspirationAnalysisCompletenessError>[0]) {
  return !pinterestInspirationAnalysisCompletenessError(record)
}

function canonical(value: string) {
  return value.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const BEST_FOR_ALIASES: Record<string, typeof PINTEREST_BEST_FOR_VALUES[number]> = {
  food_hero: 'food_hero',
  food_sharing: 'food_sharing',
  communal_dining: 'communal_dining',
  macro_food: 'macro_food',
  food_texture: 'food_texture',
  food_action: 'food_action',
  food_preparation: 'food_preparation',
  drink_hero: 'drink_hero',
  drink_interaction: 'drink_interaction',
  drink_pour: 'drink_pour',
  social_dining: 'social_dining',
  lifestyle: 'lifestyle',
  human_interaction: 'human_interaction',
  chef_bts: 'chef_bts',
  service: 'service',
  interior: 'interior',
  graphic_food: 'graphic_food',
  graphic_editorial: 'graphic_editorial',
  product_hero: 'product_hero',
  motion: 'motion',
  minimal_composition: 'minimal_composition',
  editorial_still_life: 'editorial_still_life',
  colour_led_composition: 'colour_led_composition',
  food_sharing_and_communal_dining: 'food_sharing',
  culinary_editorial: 'editorial_still_life',
  food_photography_portfolio: 'food_hero',
  luxury_lifestyle_campaigns: 'lifestyle',
  aspirational_social_content: 'lifestyle',
  // Broad positioning language is deliberately not used as a retrieval signal.
  premium_brand_positioning: 'product_hero',
}

/** Provider output stays controlled; manual edits may still retain a concise custom retrieval term. */
export function normalizePinterestBestFor(values: unknown, max = 6, allowCustom = false) {
  const normalized = normalizePinterestTags(values, max).flatMap(value => {
    const matched = BEST_FOR_ALIASES[canonical(value)]
    if (matched) return [matched]
    return allowCustom && /^[a-z0-9][a-z0-9 _/-]{1,79}$/i.test(value) ? [canonical(value)] : []
  })
  return [...new Set(normalized)].slice(0, max)
}

export function isPinterestInspirationStatus(value: unknown): value is PinterestInspirationStatus {
  return typeof value === 'string' && PINTEREST_INSPIRATION_STATUSES.includes(value as PinterestInspirationStatus)
}

type RetrievalIntent = {
  categories: Set<string>
  interactions: Set<string>
  shotScales: Set<string>
  cameraAngles: Set<string>
  compositions: Set<string>
  lightingStyles: Set<string>
  bestFor: Set<string>
  terms: string[]
}

function addMatching(values: Set<string>, candidates: readonly string[], source: string[]) {
  source.map(canonical).forEach(value => { if (candidates.includes(value)) values.add(value) })
}

function retrievalIntent(input: PinterestInspirationRetrievalInput): RetrievalIntent {
  const allText = [...(input.contentPillars ?? []), ...(input.subjects ?? []), ...(input.interactions ?? []), ...(input.shotScales ?? []), ...(input.lightingStyles ?? []), ...(input.bestFor ?? []), input.query ?? ''].join(' ').toLowerCase()
  const intent: RetrievalIntent = { categories: new Set(), interactions: new Set(), shotScales: new Set(), cameraAngles: new Set(), compositions: new Set(), lightingStyles: new Set(), bestFor: new Set(), terms: [...new Set(allText.split(/[^a-z0-9]+/).filter(term => term.length > 2))] }
  addMatching(intent.categories, PINTEREST_CREATIVE_CATEGORIES, input.categories ?? [])
  addMatching(intent.interactions, ['none', 'passing_food', 'sharing_dish', 'serving', 'pouring', 'cutting', 'picking_up', 'taking_a_bite', 'cooking', 'plating', 'garnishing', 'utensil_interaction', 'carrying', 'toasting_raising_glasses', 'conversation', 'walking_through_frame', 'pet_interaction', 'staff_interaction', 'other'], input.interactions ?? [])
  addMatching(intent.shotScales, ['extreme_macro', 'macro', 'close', 'medium', 'wide', 'environmental_wide', 'detail', 'graphic'], input.shotScales ?? [])
  addMatching(intent.cameraAngles, ['birds_eye', 'high_angle', 'eye_level', 'table_level', 'low_angle', 'three_quarter', 'pov', 'over_the_shoulder', 'architectural_straight_on', 'other'], input.cameraAngles ?? [])
  addMatching(intent.compositions, ['centered_hero', 'asymmetrical', 'rule_of_thirds', 'negative_space', 'layered_foreground', 'frame_within_frame', 'diagonal', 'symmetrical', 'edge_crop', 'immersive_crop', 'editorial_still_life', 'environmental', 'graphic', 'other'], input.compositions ?? [])
  addMatching(intent.lightingStyles, PINTEREST_LIGHTING_STYLES, input.lightingStyles ?? [])
  normalizePinterestBestFor(input.bestFor ?? [], 12, true).forEach(value => intent.bestFor.add(value))

  if (/\b(drink|cocktail|beverage|wine|beer|coffee|tea)\b/.test(allText)) intent.categories.add('drink')
  if (/\b(food|dish|meal|pasta|pizza|dessert|oyster|breakfast|lunch|dinner)\b/.test(allText)) intent.categories.add('food')
  if (/\b(lifestyle|human|people|person|portrait)\b/.test(allText)) intent.categories.add('lifestyle')
  if (/\b(graphic|typography|editorial)\b/.test(allText)) intent.categories.add('graphic_design')
  if (/\b(interior|venue)\b/.test(allText)) intent.categories.add('interior')
  if (/\b(exterior|terrace|outdoor)\b/.test(allText)) intent.categories.add('exterior')
  if (/\b(shar(e|ing)|communal|together)\b/.test(allText)) { intent.interactions.add('sharing_dish'); intent.bestFor.add('food_sharing') }
  if (/\b(pour|pouring|flow|drizzle)\b/.test(allText)) intent.interactions.add('pouring')
  if (/\b(garnish|squeez(e|ing)|finish)\b/.test(allText)) intent.interactions.add('garnishing')
  if (/\b(utensil|fork|spoon|knife)\b/.test(allText)) intent.interactions.add('utensil_interaction')
  if (/\b(macro|detail|texture)\b/.test(allText)) { intent.shotScales.add('macro'); intent.bestFor.add('macro_food') }
  if (/\b(bird|top.?down|overhead)\b/.test(allText)) intent.cameraAngles.add('birds_eye')
  if (/\b(editorial)\b/.test(allText)) intent.bestFor.add('graphic_editorial')
  if (/\b(hard\s*(light|directional)|directional\s*light)\b/.test(allText)) intent.lightingStyles.add('hard_directional')
  if (/\b(soft\s*(natural)?\s*light|natural\s*light)\b/.test(allText)) intent.lightingStyles.add('soft_natural')
  return intent
}

function hasValue(value: string | null, requested: Set<string>) { return !requested.size || Boolean(value && requested.has(value)) }
function hasCategory(record: PinterestInspirationTechnique, requested: Set<string>) {
  if (!requested.size) return true
  // Graphic inspiration must be genuinely classified as graphic; a free-text
  // editorial reference should never impersonate a graphic-design source.
  if (requested.has('graphic_design') && !record.creative_categories.includes('graphic_design')) return false
  return record.creative_categories.some(value => requested.has(value))
}
function normalizedRecordBestFor(record: PinterestInspirationTechnique) {
  return normalizePinterestBestFor(record.best_for, 12, false)
}
function hasBestFor(record: PinterestInspirationTechnique, requested: Set<string>) { return !requested.size || normalizedRecordBestFor(record).some(value => requested.has(value)) }

function techniqueScore(record: PinterestInspirationTechnique, intent: RetrievalIntent) {
  const haystack = [record.title, ...record.creative_techniques, record.visual_summary ?? '', ...normalizedRecordBestFor(record)].join(' ').toLowerCase()
  return intent.terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
}

function structuredScore(record: PinterestInspirationTechnique, intent: RetrievalIntent) {
  return (hasCategory(record, intent.categories) ? intent.categories.size * 100 : 0)
    + (hasValue(record.interaction, intent.interactions) ? intent.interactions.size * 80 : 0)
    + (hasValue(record.shot_scale, intent.shotScales) ? intent.shotScales.size * 45 : 0)
    + (hasValue(record.camera_angle, intent.cameraAngles) ? intent.cameraAngles.size * 35 : 0)
    + (hasValue(record.composition, intent.compositions) ? intent.compositions.size * 30 : 0)
    + (hasValue(record.lighting_style, intent.lightingStyles) ? intent.lightingStyles.size * 40 : 0)
    + (hasBestFor(record, intent.bestFor) ? intent.bestFor.size * 25 : 0)
    + techniqueScore(record, intent)
}

function matchesStructured(record: PinterestInspirationTechnique, intent: RetrievalIntent, includeCategory: boolean) {
  return (!includeCategory || hasCategory(record, intent.categories))
    && hasValue(record.interaction, intent.interactions)
    && hasValue(record.shot_scale, intent.shotScales)
    && hasValue(record.camera_angle, intent.cameraAngles)
    && hasValue(record.composition, intent.compositions)
    && hasValue(record.lighting_style, intent.lightingStyles)
}

function diverseSelection(candidates: Array<{ record: PinterestInspirationTechnique; score: number; match: PinterestInspirationTechnique['retrieval_match'] }>, limit: number) {
  const remaining = [...candidates].sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
  const selected: PinterestInspirationTechnique[] = []
  const seen = new Set<string>()
  while (remaining.length && selected.length < limit) {
    const next = remaining
      .map((candidate, index) => ({ candidate, index, diversity: [candidate.record.shot_scale, candidate.record.camera_angle, candidate.record.composition, candidate.record.human_presence, candidate.record.interaction, candidate.record.motion, candidate.record.lighting_style, candidate.record.background_style, ...candidate.record.creative_categories, ...candidate.record.creative_techniques, ...normalizedRecordBestFor(candidate.record)].filter(value => value && !seen.has(value)).length }))
      .sort((a, b) => (b.candidate.score + b.diversity * 8) - (a.candidate.score + a.diversity * 8) || a.candidate.record.title.localeCompare(b.candidate.record.title))[0]
    remaining.splice(next.index, 1)
    ;[next.candidate.record.shot_scale, next.candidate.record.camera_angle, next.candidate.record.composition, next.candidate.record.human_presence, next.candidate.record.interaction, next.candidate.record.motion, next.candidate.record.lighting_style, next.candidate.record.background_style, ...next.candidate.record.creative_categories, ...next.candidate.record.creative_techniques, ...normalizedRecordBestFor(next.candidate.record)].filter(Boolean).forEach(value => seen.add(value as string))
    selected.push({ ...next.candidate.record, retrieval_match: next.candidate.match })
  }
  return selected
}

type MonthlyNeed = { category: string; weight: number }

function monthlyPlanNeeds(context: PinterestMonthlyPlanContext): MonthlyNeed[] {
  const counts = context.pillar_counts ?? {}
  const needs: MonthlyNeed[] = []
  const add = (pillar: string, category: string) => {
    const weight = Number(counts[pillar] ?? 0)
    if (Number.isFinite(weight) && weight > 0) needs.push({ category, weight })
  }
  add('food', 'food')
  add('drinks', 'drink')
  add('lifestyle', 'lifestyle')
  add('bts_service', 'service_bts')
  add('interiors', 'interior')
  add('exteriors', 'exterior')
  const graphicNeed = (context.production_methods ?? []).some(value => canonical(value) === 'graphic_design')
    || (context.grid_roles ?? []).some(value => ['graphic_accent', 'event_commercial'].includes(canonical(value)))
  if (graphicNeed) needs.push({ category: 'graphic_design', weight: Math.max(1, Number(counts.events ?? 0)) })
  return needs
}

function monthlyPaletteSelection(records: PinterestInspirationTechnique[], input: PinterestInspirationRetrievalInput, intent: RetrievalIntent, limit: number) {
  const needs = monthlyPlanNeeds(input.planContext!)
  if (!needs.length) return diverseSelection(records.map(record => ({ record, score: structuredScore(record, intent), match: 'broad_monthly_palette' as const })), limit)
  const selected: PinterestInspirationTechnique[] = []
  const selectedNeedCounts = new Map<string, number>()
  const seen = new Set<string>()
  const remaining = [...records]
  const dimensions = (record: PinterestInspirationTechnique) => [
    record.shot_scale, record.camera_angle, record.composition, record.human_presence, record.interaction,
    record.motion, record.lighting_style, record.background_style, ...record.creative_categories,
    ...record.creative_techniques, ...normalizedRecordBestFor(record),
  ].filter(Boolean) as string[]

  while (remaining.length && selected.length < limit) {
    const next = remaining.map((record, index) => {
      const matchingNeeds = needs.filter(need => record.creative_categories.includes(need.category))
      const coverage = matchingNeeds.length
        ? Math.max(...matchingNeeds.map(need => (need.weight * 72) / ((selectedNeedCounts.get(need.category) ?? 0) + 1)))
        : 0
      const planRelevance = matchingNeeds.length ? Math.max(...matchingNeeds.map(need => need.weight * 24)) : 0
      const diversity = dimensions(record).filter(value => !seen.has(value)).length * 7
      const overlap = selected.reduce((sum, prior) => sum + dimensions(record).filter(value => dimensions(prior).includes(value)).length, 0) * 3
      return { record, index, score: coverage + planRelevance + diversity - overlap + techniqueScore(record, intent) }
    }).sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))[0]
    remaining.splice(next.index, 1)
    const record = next.record
    record.creative_categories.forEach(category => selectedNeedCounts.set(category, (selectedNeedCounts.get(category) ?? 0) + 1))
    dimensions(record).forEach(value => seen.add(value))
    selected.push({ ...record, retrieval_match: 'broad_monthly_palette' })
  }
  return selected
}

export function scorePinterestInspiration(record: PinterestInspirationTechnique, input: PinterestInspirationRetrievalInput) {
  return structuredScore(record, retrievalIntent(input))
}

/** Structured creative compatibility always wins over free-text technique similarity. */
export function diversePinterestInspirations(records: PinterestInspirationTechnique[], input: PinterestInspirationRetrievalInput) {
  const limit = Math.max(1, Math.min(input.limit ?? 6, 8))
  const intent = retrievalIntent(input)
  if (input.mode === 'monthly_palette') {
    if (input.planContext) return monthlyPaletteSelection(records, input, intent, limit)
    return diverseSelection(records.map(record => ({ record, score: structuredScore(record, intent), match: 'broad_monthly_palette' as const })), limit)
  }
  const direct = records.filter(record => matchesStructured(record, intent, true))
  if (direct.length) return diverseSelection(direct.map(record => ({ record, score: structuredScore(record, intent), match: 'direct' as const })), limit)
  const hasCategoryConstraint = intent.categories.size > 0
  const crossCategory = hasCategoryConstraint && !intent.categories.has('graphic_design')
    ? records.filter(record => matchesStructured(record, intent, false) && (intent.interactions.size || intent.shotScales.size || intent.cameraAngles.size || intent.compositions.size || intent.bestFor.size))
    : []
  if (crossCategory.length) return diverseSelection(crossCategory.map(record => ({ record, score: structuredScore(record, { ...intent, categories: new Set() }), match: 'cross_category_technique' as const })), limit)
  const hasStructuredNeed = intent.categories.size || intent.interactions.size || intent.shotScales.size || intent.cameraAngles.size || intent.compositions.size || intent.lightingStyles.size || intent.bestFor.size
  if (hasStructuredNeed) return []
  return diverseSelection(records.filter(record => techniqueScore(record, intent) > 0 || !input.query).map(record => ({ record, score: techniqueScore(record, intent), match: 'direct' as const })), limit)
}
