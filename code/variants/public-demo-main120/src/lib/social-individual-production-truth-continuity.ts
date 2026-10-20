import type { IndividualProductionEnvironmentTruth, IndividualProductionReference, IndividualProductionStrictVenueTruth } from '@/lib/social-individual-production-types'

type DirectionInput = {
  client_id?: string
  plan_truth: Record<string, unknown>
  visual_direction: Record<string, unknown>
  truth_references: IndividualProductionReference[]
}

const DEMOCLIENTB_DUBAI_CLIENT_IDS = new Set([
  '8d771fc0-2914-57cc-90f1-9ab90f4611fd',
  '344da257-e4ec-548c-b3b8-959b3af8d001',
])

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function normalized(...values: unknown[]) { return values.map(text).filter(Boolean).join(' ').toLowerCase() }
function has(value: string, terms: string[]) { return terms.some(term => value.includes(term)) }
function metadataText(reference: IndividualProductionReference) {
  const metadata = reference.metadata ?? {}
  const details = Array.isArray(metadata.key_visual_details) ? metadata.key_visual_details.map(text).join(' ') : ''
  return normalized(reference.title, details, metadata.visual_presentation, metadata.description, metadata.space_area, metadata.area_view)
}

export function tableSurfaceEvidence(reference: IndividualProductionReference) {
  const source = metadataText(reference)
  const materials = [
    /reflective|mirror(?:ed)?|glass/.test(source) ? 'reflective mirrored-glass dining table' : '',
    /marble/.test(source) ? 'marble dining table' : '',
    /stone/.test(source) ? 'stone dining table' : '',
    /tile|tiled/.test(source) ? 'tiled surface' : '',
    /metal/.test(source) ? 'metal dining table' : '',
  ].filter(Boolean)
  return {
    supported: reference.role === 'venue_truth' && materials.length > 0,
    materials,
  }
}

function requestedEnvironmentElements(input: DirectionInput) {
  const direction = normalized(
    input.plan_truth.subject,
    input.plan_truth.pillar,
    input.plan_truth.creative_concept,
    input.visual_direction.brief,
    input.visual_direction.shot_scale,
    input.visual_direction.camera_angle,
    input.visual_direction.composition,
    input.visual_direction.human_presence,
    input.visual_direction.interaction,
  )
  const macro = has(direction, ['extreme macro', 'macro', 'isolated product', 'seamless studio', 'pure background'])
  const foodOrDrink = has(normalized(input.plan_truth.pillar), ['food', 'drinks'])
  const requiresTable = !macro && (foodOrDrink || has(direction, ['table', 'tabletop', 'counter', 'serving board', 'plate rests', 'glass rests']))
  const elements: string[] = []
  if (requiresTable) elements.push('dining_table_surface')
  if (has(direction, ['bar counter', 'bar service', 'back bar', 'cocktail bar'])) elements.push('bar_counter')
  if (has(direction, ['pizza oven', 'oven', 'open kitchen'])) elements.push('pizza_oven')
  if (has(direction, ['terrace', 'outdoor', 'exterior', 'facade', 'street'])) elements.push('exterior_environment')
  if (has(direction, ['staff uniform', 'server uniform', 'chef uniform'])) elements.push('staff_wardrobe')
  return { requiresTable, elements }
}

export function assessIndividualProductionEnvironmentTruth(input: DirectionInput): IndividualProductionEnvironmentTruth {
  const requested = requestedEnvironmentElements(input)
  const venues = input.truth_references.filter(reference => reference.role === 'venue_truth')
  const supported = new Set<string>()
  const gaps: string[] = []
  const tableReferences = venues.filter(reference => tableSurfaceEvidence(reference).supported)
  const tableMaterials = Array.from(new Set(tableReferences.flatMap(reference => tableSurfaceEvidence(reference).materials)))
  if (requested.requiresTable) {
    if (tableReferences.length) supported.add('dining_table_surface')
    else gaps.push('Visible DemoClientB dining-table truth is insufficient for this composition.')
  }
  if (requested.elements.includes('bar_counter')) {
    if (venues.some(reference => /bar counter|bar service|backlit bottle|display counter/.test(metadataText(reference)))) supported.add('bar_counter')
    else gaps.push('Visible client bar-counter truth is insufficient for this composition.')
  }
  if (requested.elements.includes('pizza_oven')) {
    if (venues.some(reference => /pizza oven|tiled oven|open kitchen/.test(metadataText(reference)))) supported.add('pizza_oven')
    else gaps.push('Visible client pizza-oven truth is insufficient for this composition.')
  }
  if (requested.elements.includes('exterior_environment')) {
    if (venues.some(reference => reference.category === 'exteriors')) supported.add('exterior_environment')
    else gaps.push('Approved exterior truth is required for this composition.')
  }
  if (requested.elements.includes('staff_wardrobe') && !input.truth_references.some(reference => reference.role === 'person_truth')) {
    gaps.push('Approved staff or wardrobe truth is required for this composition.')
  } else if (requested.elements.includes('staff_wardrobe')) supported.add('staff_wardrobe')
  return {
    required_elements: requested.elements,
    supported_elements: [...supported],
    gaps,
    requires_table_surface: requested.requiresTable,
    table_surface_materials: tableMaterials,
    table_surface_reference_ids: tableReferences.map(reference => reference.id),
  }
}

export function requiresAdditionalVenueSurfaceTruth(input: DirectionInput) {
  const environment = assessIndividualProductionEnvironmentTruth(input)
  return environment.requires_table_surface && environment.table_surface_reference_ids.length === 0
}

function strictVenueEvidence(reference: IndividualProductionReference) {
  const source = metadataText(reference)
  return {
    foreground: /(table|chair|seating|banquette|counter|bar)/.test(source),
    midground: /(dining|restaurant|room|seating|table|interior|terrace)/.test(source),
    background: /(curtain|wall|window|door|artwork|bar|shelv|facade|skyline|plant)/.test(source),
    ceiling: /(ceiling|chandelier|pendant|lantern|sconce|suspended|lighting)/.test(source),
    furniture_materials: /(table|chair|seating|banquette|reflective|mirror|glass|wood|tile|floor)/.test(source),
    lighting_fixtures: /(chandelier|pendant|lantern|sconce|lighting|practical)/.test(source),
  }
}

function requestedVenueView(input: DirectionInput) {
  const context = normalized(
    input.plan_truth.pillar,
    input.plan_truth.subject,
    input.plan_truth.creative_concept,
    input.visual_direction.brief,
    input.visual_direction.shot_scale,
    input.visual_direction.camera_angle,
    input.visual_direction.composition,
  )
  return /wide|architectural|room|space|venue hero|interior|exterior|terrace|facade|spatial/.test(context)
}

export function assessStrictVenueTruth(input: DirectionInput & { active: boolean }): IndividualProductionStrictVenueTruth {
  if (!input.active) {
    return {
      active: false,
      reason: 'Venue is contextual rather than the primary visual subject.',
      requested_camera_flexibility: 'low',
      allowed_camera_flexibility: 'low',
      coverage: [],
      gaps: [],
      primary_reference_id: null,
      supporting_reference_ids: [],
      normalization: { applied: false, ignored_direction_terms: [], effective_camera_instruction: '', effective_composition_instruction: '' },
    }
  }
  const venues = input.truth_references.filter(reference => reference.role === 'venue_truth')
  const primary = venues.find(reference => reference.venue_truth_role === 'primary_composition_truth') ?? venues[0]
  const support = venues.filter(reference => reference.venue_truth_role === 'same_zone_detail_truth')
  const allLow = venues.every(reference => text(reference.metadata?.perspective_flexibility).toLowerCase() === 'low')
  const allHigh = venues.length >= 2 && venues.every(reference => text(reference.metadata?.perspective_flexibility).toLowerCase() === 'high')
  const allowedCameraFlexibility = allHigh ? 'high' : allLow || venues.length < 2 ? 'low' : 'medium'
  const areas: Array<IndividualProductionStrictVenueTruth['coverage'][number]['area']> = [
    'foreground', 'midground', 'background', 'ceiling', 'furniture_materials', 'lighting_fixtures',
  ]
  const coverage = areas.map(area => {
    const reference_ids = venues.filter(reference => strictVenueEvidence(reference)[area]).map(reference => reference.id)
    return { area, supported: reference_ids.length > 0, reference_ids }
  })
  const gaps: string[] = []
  if (!primary) gaps.push('Strict Venue Truth Mode requires one approved primary Interior or Exterior reference.')
  const wide = requestedVenueView(input)
  const requested = normalized(input.visual_direction.brief, input.visual_direction.shot_scale, input.visual_direction.camera_angle, input.visual_direction.composition)
  const ignoredDirectionTerms = [
    /\bsymmetri(?:cal|c)\b/.test(requested) ? 'symmetrical' : '',
    /\bcent(?:er|re)(?:ed|ed)?\b/.test(requested) ? 'centred' : '',
    /\bstraight[ -]?on\b/.test(requested) ? 'straight-on' : '',
    /\bwide\b/.test(requested) ? 'wide' : '',
  ].filter(Boolean)
  if (wide && primary && !(['midground', 'background', 'furniture_materials'] as const).every(area => strictVenueEvidence(primary)[area])) {
    gaps.push('Requested wide venue view exceeds the primary Venue Truth spatial coverage. Use a compatible approved view of the same physical zone or remain at the verified primary camera.')
  }
  for (const area of coverage) {
    if (!area.supported && (wide || ['midground', 'background', 'furniture_materials'].includes(area.area))) {
      gaps.push(`Strict venue coverage is missing ${area.area.replace('_', ' ')} truth for the requested frame.`)
    }
  }
  return {
    active: true,
    reason: 'The venue is the primary visual subject, so approved Interior or Exterior references lock the real physical space.',
    requested_camera_flexibility: wide ? 'medium' : 'low',
    allowed_camera_flexibility: support.length ? allowedCameraFlexibility : 'low',
    coverage,
    gaps,
    primary_reference_id: primary?.id ?? null,
    supporting_reference_ids: support.map(reference => reference.id),
    normalization: {
      applied: ignoredDirectionTerms.length > 0,
      ignored_direction_terms: ignoredDirectionTerms,
      effective_camera_instruction: 'Preserve the primary venue reference camera height, position, perspective, field of view and visible geometry. Do not widen, centre, straighten or relocate the view unless that exact geometry is visible in the primary reference.',
      effective_composition_instruction: 'Treat the saved direction as photographic intent only: light, ambience, people and motion may vary. The primary venue reference controls framing, asymmetry, architecture, furniture and spatial relationships.',
    },
  }
}

export function individualProductionWardrobeRules(input: DirectionInput) {
  const textContext = normalized(input.plan_truth.monthly_context, input.plan_truth.client_name, input.visual_direction.brief, input.visual_direction.human_presence)
  const clientIsDubai = DEMOCLIENTB_DUBAI_CLIENT_IDS.has(input.client_id ?? '') || /democlientb.*dubai|dubai.*democlientb/.test(textContext)
  const hasPersonTruth = input.truth_references.some(reference => reference.role === 'person_truth')
  const explicitModesty = has(textContext, ['modest emirati', 'emirati styling', 'abaya', 'kandura', 'modesty requirement'])
  if (!clientIsDubai) return []
  if (explicitModesty) return [
    'The approved Monthly Context requires modest Emirati styling. This requirement overrides the generic hot-climate preference.',
    'Do not substitute cultural attire with Pinterest wardrobe or generic editorial styling.',
  ]
  if (hasPersonTruth) return [
    'Approved Person or Wardrobe Truth controls identifiable wardrobe details. Do not replace it with Pinterest clothing.',
  ]
  return [
    'For anonymous people in Dubai, use lightweight, climate-appropriate, brand-appropriate hospitality clothing when a person is required.',
    'No sweaters, heavy knitwear, winter jackets, cold-weather layering or Pinterest wardrobe transfer unless the saved plan explicitly requires it.',
  ]
}
