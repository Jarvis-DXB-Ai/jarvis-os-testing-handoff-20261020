import type { IndividualProductionPinterestArchetype, IndividualProductionPinterestCompatibility } from '@/lib/social-individual-production-types'

export type PinterestCompatibilityTarget = {
  pillar: string
  subject: string
  humanPresence: string
  interaction: string
  motion: string
  brief: string
}

export type PinterestCompatibilityCandidate = {
  creative_categories?: unknown
  human_presence?: unknown
  interaction?: unknown
  motion?: unknown
  best_for?: unknown
  creative_techniques?: unknown
  title?: string
}

export type PinterestCompatibility = {
  archetype: IndividualProductionPinterestArchetype
  classification: IndividualProductionPinterestCompatibility
  automatic_eligible: boolean
  reason: string
}

function text(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : '' }
function textList(value: unknown) { return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean) }
function contains(value: string, terms: string[]) { return terms.some(term => value.includes(term)) }

export function individualProductionPinterestArchetype(target: PinterestCompatibilityTarget): IndividualProductionPinterestArchetype {
  const context = `${target.subject} ${target.brief} ${target.interaction}`.toLowerCase()
  const human = target.humanPresence.toLowerCase()
  const action = !['none', 'not_applicable', ''].includes(target.interaction.toLowerCase()) || !['static', 'not_applicable', ''].includes(target.motion.toLowerCase())
  if (contains(context, ['dog', 'pet', 'dog-friendly'])) return 'dog_pet_lifestyle'
  if (target.pillar === 'food') return action ? 'food_action' : 'food_hero'
  if (target.pillar === 'drinks') return action ? 'drink_action' : 'drink_hero'
  if (target.pillar === 'bts_service') return contains(context, ['chef', 'cooking', 'kitchen']) ? 'chef_bts' : 'service'
  if (target.pillar === 'interiors') return 'interior_venue'
  if (target.pillar === 'exteriors') return 'exterior'
  if (target.pillar === 'events') return 'event_commercial'
  if (target.pillar === 'graphic_design' || contains(context, ['graphic', 'editorial'])) return 'graphic_editorial'
  if (human === 'couple') return 'couple_lifestyle'
  if (['small_group', 'mixed_foreground_background', 'background_guests'].includes(human)) return 'group_communal_dining'
  if (human === 'single_person') return 'single_person_lifestyle'
  return 'other'
}

export function assessIndividualProductionPinterestCompatibility(target: PinterestCompatibilityTarget, candidate: PinterestCompatibilityCandidate): PinterestCompatibility {
  const archetype = individualProductionPinterestArchetype(target)
  const categories = textList(candidate.creative_categories)
  const human = text(candidate.human_presence)
  const interaction = text(candidate.interaction)
  const motion = text(candidate.motion)
  const technique = `${textList(candidate.best_for).join(' ')} ${textList(candidate.creative_techniques).join(' ')} ${text(candidate.title)}`
  const hasCategory = (...values: string[]) => values.some(value => categories.includes(value))
  const personDominant = ['single_person', 'couple', 'small_group', 'partial_figure', 'staff_service', 'mixed_foreground_background'].includes(human)
  const action = !['none', 'not_applicable', ''].includes(interaction) || !['static', 'not_applicable', ''].includes(motion)
  const food = hasCategory('food', 'product') || contains(technique, ['food_hero', 'food_action', 'plated', 'food texture'])
  const drink = hasCategory('drink') || contains(technique, ['drink_hero', 'drink_interaction', 'drink_pour'])
  const lifestyle = hasCategory('lifestyle', 'people') || contains(technique, ['lifestyle', 'social_dining', 'human_interaction'])
  const pet = contains(technique, ['dog', 'pet']) || contains(`${text(candidate.title)} ${technique}`, ['dog', 'pet'])

  if (archetype === 'food_hero') {
    if (!food || personDominant || human === 'hands_only' || drink) return { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Food still life requires a food-led, no-person reference; this candidate has incompatible people or drink structure.' }
    if (action) return { archetype, classification: 'technique_fallback', automatic_eligible: false, reason: 'Food action can inform a technique manually, but not the static food-hero composition.' }
    return { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Food-led static still life with no conflicting human or drink subject.' }
  }
  if (archetype === 'food_action') {
    if (!food) return { archetype, classification: drink && /(pour|liquid)/.test(interaction) ? 'technique_fallback' : 'incompatible', automatic_eligible: false, reason: drink ? 'Cross-category liquid-action technique only; it cannot automatically guide food action.' : 'Food action requires a food-led reference.' }
    return { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Food-led reference is compatible with the requested food action.' }
  }
  if (archetype === 'drink_hero' || archetype === 'drink_action') {
    if (!drink) return { archetype, classification: food && /(pour|liquid)/.test(interaction) ? 'technique_fallback' : 'incompatible', automatic_eligible: false, reason: food ? 'Cross-category food technique only; it cannot automatically guide the drink scene.' : 'Drink production requires a drink-led reference.' }
    return { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Drink-led reference is compatible with the requested drink scene.' }
  }
  if (archetype === 'couple_lifestyle') {
    if (human !== 'couple') return { archetype, classification: 'incompatible', automatic_eligible: false, reason: `Couple conversation cannot use ${human || 'unspecified'} human structure as a strong composition reference.` }
    return { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Couple human structure is compatible with the planned conversation scene.' }
  }
  if (archetype === 'dog_pet_lifestyle') {
    if (human !== 'couple') return { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Dog-friendly couple lounge requires at least a compatible couple scene; a single-person portrait is not a substitute.' }
    return pet
      ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Couple lifestyle with pet presence is compatible with the planned dog-friendly lounge scene.' }
      : { archetype, classification: 'technique_fallback', automatic_eligible: false, reason: 'Couple scene may be chosen manually for technique, but it lacks the dog/pet scene signal required for automatic selection.' }
  }
  if (archetype === 'single_person_lifestyle') {
    return human === 'single_person' && lifestyle
      ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Single-person lifestyle structure is compatible.' }
      : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Single-person lifestyle requires a single-person lifestyle reference.' }
  }
  if (archetype === 'group_communal_dining') {
    return ['small_group', 'mixed_foreground_background', 'background_guests'].includes(human) && lifestyle
      ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Group dining structure is compatible.' }
      : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Communal dining requires a group-compatible reference.' }
  }
  if (archetype === 'chef_bts') return hasCategory('service_bts', 'people') || contains(technique, ['chef_bts', 'food_preparation'])
    ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Chef or preparation structure is compatible.' }
    : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Chef/BTS cannot automatically use a plated still life.' }
  if (archetype === 'service') return hasCategory('service_bts', 'people') || contains(technique, ['service', 'staff_interaction'])
    ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Service structure is compatible.' }
    : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Service requires a service or hospitality interaction reference.' }
  if (archetype === 'interior_venue') return hasCategory('interior')
    ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Interior reference is compatible.' }
    : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Interior production requires an interior-led reference.' }
  if (archetype === 'exterior') return hasCategory('exterior')
    ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Exterior reference is compatible.' }
    : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Exterior production requires an exterior-led reference.' }
  if (archetype === 'graphic_editorial') return hasCategory('graphic_design')
    ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Graphic/editorial reference is compatible.' }
    : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Graphic/editorial production requires a graphic reference.' }
  if (archetype === 'event_commercial') return hasCategory('graphic_design', 'lifestyle')
    ? { archetype, classification: 'compatible', automatic_eligible: true, reason: 'Event-commercial treatment is compatible.' }
    : { archetype, classification: 'incompatible', automatic_eligible: false, reason: 'Event commercial requires an event or graphic-compatible reference.' }
  return { archetype, classification: 'compatible', automatic_eligible: true, reason: 'No narrow archetype restriction applies.' }
}
