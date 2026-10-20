import type {
  IndividualProductionProductionDirection,
  IndividualProductionReference,
  IndividualProductionReferenceAssignment,
  IndividualProductionVenueRequirement,
} from '@/lib/social-individual-production-types'
import { assessIndividualProductionEnvironmentTruth, assessStrictVenueTruth, individualProductionWardrobeRules } from '@/lib/social-individual-production-truth-continuity'

type ProductionInput = {
  client_id?: string
  plan_truth: Record<string, unknown>
  visual_direction: Record<string, unknown>
  truth_references: IndividualProductionReference[]
  pinterest_references: IndividualProductionReference[]
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalized(...values: unknown[]) {
  return values.map(text).filter(Boolean).join(' ').toLowerCase()
}

function has(value: string, terms: string[]) {
  return terms.some(term => value.includes(term))
}

function productControls(reference: IndividualProductionReference) {
  const metadata = reference.metadata ?? {}
  const presentation = text(metadata.visual_presentation)
  const menuIdentity = text(metadata.dish_name) || text(metadata.drink_name) || text(metadata.menu_display_name)
  return [
    menuIdentity ? `canonical subject identity: ${menuIdentity}` : 'canonical subject identity',
    'shape, portion, proportions, material and visible presentation',
    presentation ? `verified presentation: ${presentation}` : '',
    'visible garnish, vessel, plate, board, glassware and food texture only where present in this truth asset',
  ].filter(Boolean)
}

function pinterestInfluences(reference: IndividualProductionReference) {
  const metadata = reference.metadata ?? {}
  const values = [
    metadata.shot_scale ? 'camera relationship and shot scale' : '',
    metadata.camera_angle ? 'camera angle' : '',
    metadata.composition ? 'framing, foreground layering and spatial rhythm' : '',
    metadata.interaction ? 'interaction and gesture energy' : '',
    metadata.motion ? 'motion treatment' : '',
    metadata.lighting_style ? 'lighting character' : '',
    Array.isArray(metadata.creative_techniques) && metadata.creative_techniques.length ? 'creative technique and editorial energy' : '',
  ].filter(Boolean)
  return values.length ? values : ['creative technique only']
}

function referenceText(reference: IndividualProductionReference, field: string) {
  return text(reference.metadata?.[field])
}

function hasProductPresentation(reference: IndividualProductionReference | undefined, terms: string[]) {
  if (!reference) return false
  const presentation = `${referenceText(reference, 'visual_presentation')} ${referenceText(reference, 'dish_name')}`.toLowerCase()
  return has(presentation, terms)
}

function venueControls(reference: IndividualProductionReference) {
  const metadata = reference.metadata ?? {}
  const details = Array.isArray(metadata.key_visual_details)
    ? metadata.key_visual_details.map(text).filter(Boolean)
    : []
  const presentation = text(metadata.visual_presentation)
  return [
    reference.environment_role === 'surface_truth'
      ? 'verified DemoClientB dining-table material, reflective finish, table scale and physical support beneath the product-owned serving board'
      : 'visible DemoClientB architecture, furniture, materials and spatial identity',
    ...details.length ? [`verified venue details: ${details.join(', ')}`] : [],
    presentation ? `verified venue presentation: ${presentation}` : '',
    'visible background geometry and venue practical-light character only where shown',
  ].filter(Boolean)
}

export function determineVenueRequirement(input: Pick<ProductionInput, 'plan_truth' | 'visual_direction'>): IndividualProductionVenueRequirement {
  const pillar = text(input.plan_truth.pillar).toLowerCase()
  const direction = normalized(
    input.visual_direction.brief,
    input.visual_direction.shot_scale,
    input.visual_direction.camera_angle,
    input.visual_direction.composition,
    input.visual_direction.human_presence,
  )
  const exterior = has(direction, ['exterior', 'outdoor', 'terrace', 'garden', 'facade', 'street'])
  const environmental = has(direction, [
    'recognizable venue', 'visible dining room', 'visible restaurant', 'wide environmental',
    'architectural', 'interior scene', 'exterior scene', 'spatial identity', 'venue background',
    'restaurant foreground', 'restaurant background', 'restaurant depth', 'dining room depth',
    'dining-room depth', 'dining room background', 'dining-room background', 'table and restaurant', 'venue ambience', 'environmental restaurant context',
    'blurred dining environment', 'blurred restaurant depth', 'chairs', 'tables', 'curtains', 'walls',
    'flooring', 'artwork', 'wall art', 'lighting fixtures', 'lighting fixture', 'windows', 'doors',
    'architectural lines', 'restaurant colour', 'restaurant color', 'material identity',
  ])
  const venueLed = ['interiors', 'exteriors', 'lifestyle', 'bts_service'].includes(pillar)
  const isolated = has(direction, ['seamless studio', 'extreme macro', 'fully abstract', 'isolated product', 'pure background', 'studio fixture'])
  const fullyUnidentifiable = has(direction, ['background fully cropped away', 'fully cropped away', 'true optical blur removes all identifiable venue information', 'fully unidentifiable background'])
  // Explicit environmental cues take precedence over a product-led shot; they describe content the final image must render.
  const required = !fullyUnidentifiable && (environmental || (!isolated && venueLed))
  const preferred_categories: Array<'interiors' | 'exteriors'> = exterior ? ['exteriors', 'interiors'] : ['interiors', 'exteriors']
  return {
    required,
    reason: required
      ? venueLed
        ? 'The approved concept is venue-led, so visible client space must be grounded in approved venue truth.'
        : 'The saved Visual Direction expects visible or shallow-focus restaurant context, so venue truth is required.'
      : isolated || fullyUnidentifiable
        ? 'The saved Visual Direction deliberately isolates the subject, so no recognizable venue is required.'
        : 'The saved direction is a close, product-led composition without a recognizable client environment.',
    preferred_categories,
    // A strict venue package may add a second reference only after the retrieval
    // layer has verified explicit same-zone evidence and a named factual gap.
    allow_second_reference: false,
  }
}

export function strictVenueTruthMode(input: Pick<ProductionInput, 'plan_truth' | 'visual_direction'>) {
  const pillar = text(input.plan_truth.pillar).toLowerCase()
  const direction = normalized(
    input.plan_truth.subject,
    input.plan_truth.creative_concept,
    input.visual_direction.brief,
    input.visual_direction.shot_scale,
    input.visual_direction.camera_angle,
    input.visual_direction.composition,
  )
  const venueSubject = ['interiors', 'exteriors'].includes(pillar)
    || has(direction, ['venue hero', 'architectural detail', 'terrace hero', 'exterior hero', 'room hero', 'space hero', 'main dining room', 'restaurant facade'])
  const contextualOnly = ['food', 'drinks'].includes(pillar) && has(direction, ['blurred background', 'background fully cropped away', 'fully unidentifiable background'])
  return venueSubject && !contextualOnly
}

export function assignProductionReferenceRoles(input: Pick<ProductionInput, 'plan_truth' | 'visual_direction' | 'truth_references' | 'pinterest_references'>): IndividualProductionReferenceAssignment[] {
  const strictVenue = strictVenueTruthMode(input)
  const truthAssignments = input.truth_references.map(reference => {
    if (reference.role === 'venue_truth') {
      return {
        reference_id: reference.id,
        reference_title: reference.title,
        role: 'venue_truth' as const,
        controls: venueControls(reference),
        may_influence: reference.environment_role === 'surface_truth'
          ? ['the verified dining-table material and its physical relationship to product-owned serving ware']
          : strictVenue
            ? ['the real physical room only: visible architecture, furniture, fixture placement, table form/material, seating layout and camera-supported spatial relationships']
            : ['environmental colour relationship, realistic venue ambience, blurred spatial cues, background material response and practical-light character where actually visible'],
        must_not_influence: strictVenue
          ? ['food identity, ingredients, plate or board', 'Pinterest composition, architecture or camera location', 'people identity', 'temporary table objects unless required by approved subject truth', 'unseen room geometry or fictional hybrid spaces']
          : ['food identity, ingredients, plate or board', 'Pinterest composition or action', 'people identity', 'temporary table objects unless required by approved subject truth', 'exact camera composition from the venue reference'],
      }
    }
    if (reference.role === 'person_truth') {
      return {
        reference_id: reference.id,
        reference_title: reference.title,
        role: 'person_identity_truth' as const,
        controls: ['approved likeness, hair, skin tone, age cues, uniform or wardrobe only where verified'],
        may_influence: ['natural posture when compatible with the saved interaction'],
        must_not_influence: ['food identity', 'venue architecture', 'camera composition', 'unverified styling or jewellery'],
      }
    }
    if (reference.role === 'animal_truth') {
      return {
        reference_id: reference.id,
        reference_title: reference.title,
        role: 'person_identity_truth' as const,
        controls: ['approved animal identity, size, coat, markings and natural posture only where verified'],
        may_influence: ['natural secondary animal presence required by the saved interaction'],
        must_not_influence: ['food identity', 'venue architecture', 'camera composition', 'unverified accessories or costume'],
      }
    }
    return {
      reference_id: reference.id,
      reference_title: reference.title,
      role: 'product_truth' as const,
      controls: productControls(reference),
      may_influence: ['realistic material response and approved visible serving context'],
      must_not_influence: ['camera angle unless explicitly selected', 'background or venue architecture', 'lighting environment', 'unrelated objects or generic restaurant styling'],
    }
  })
  const pinterestAssignments = input.pinterest_references.map(reference => ({
    reference_id: reference.id,
    reference_title: reference.title,
    role: reference.match_strength === 'replicate_composition' ? 'composition_inspiration' as const : 'creative_technique_inspiration' as const,
    controls: strictVenue ? ['lighting character, exposure, colour treatment, motion or people-atmosphere only'] : pinterestInfluences(reference),
    may_influence: strictVenue ? ['lighting character, exposure, colour treatment, motion or people-atmosphere only'] : pinterestInfluences(reference),
    must_not_influence: strictVenue
      ? ['architecture, room layout, furniture, tables, seating, fixtures, venue composition, camera location, food or drink identity, branding, person identity, wardrobe, jewellery or text treatment']
      : ['food or drink identity', 'ingredients, garnish, plate, cutlery or glassware', 'table surface, venue architecture or branding', 'person identity, wardrobe, jewellery or text treatment'],
  }))
  return [...truthAssignments, ...pinterestAssignments]
}

function cameraProfile(input: ProductionInput) {
  const direction = normalized(input.visual_direction.shot_scale, input.visual_direction.camera_angle, input.visual_direction.composition, input.visual_direction.interaction, input.visual_direction.motion)
  const pillar = text(input.plan_truth.pillar).toLowerCase()
  const cutting = has(direction, ['cutting', 'knife', 'slice', 'carving'])
  const macro = has(direction, ['macro', 'extreme close'])
  const wideVenue = ['interiors', 'exteriors'].includes(pillar) || has(direction, ['wide', 'architectural', 'environmental', 'spatial'])
  const lifestyle = ['lifestyle', 'bts_service'].includes(pillar) || has(direction, ['people', 'service', 'walking', 'pouring'])
  if (strictVenueTruthMode(input)) return { lens: 'Sony FE 24-70mm F2.8 GM II', focal: 'reference-matched 24–35mm field of view', aperture: 'f/5.6', iso: 'ISO 640', shutter: '1/125 sec', height: 'match the primary venue reference camera height', distance: 'retain the primary venue reference camera position and visible field of view', rationale: 'Strict Venue Recreation uses a normal-to-wide architectural profile only within the observed primary-reference perspective; it does not introduce a wider, centred or relocated viewpoint.' }
  if (macro) return { lens: 'Sony FE 90mm F2.8 Macro G OSS', focal: '90mm', aperture: 'f/5.6', iso: 'ISO 400', shutter: '1/160 sec', height: 'subject level', distance: 'macro working distance with no lens distortion', rationale: 'Macro profile preserves small texture, garnish and vessel detail while keeping enough depth for the verified subject.' }
  if (wideVenue) return { lens: 'Sony FE 24-70mm F2.8 GM II', focal: '28mm', aperture: 'f/5.6', iso: 'ISO 640', shutter: '1/125 sec', height: '1.45m, level with the guest viewpoint', distance: 'wide environmental distance that preserves verticals and true room proportions', rationale: 'Wide venue profile documents real spatial geometry without exaggerated ultra-wide distortion.' }
  if (cutting) {
    const venueContext = determineVenueRequirement(input).required
    return { lens: 'Sony FE 85mm F1.4 GM II', focal: '85mm', aperture: venueContext ? 'f/4.0' : 'f/3.2', iso: 'ISO 800', shutter: '1/250 sec', height: 'table height, just above the product plane', distance: '1.2–1.5m from the subject for a compressed commercial close frame', rationale: venueContext ? 'The 85mm at f/4 keeps the knife-cut action and food resolved while retaining truthful, soft DemoClientB environmental cues.' : 'The 85mm profile preserves food proportions while isolating a real knife-cut interaction and freezing hand motion.' }
  }
  if (lifestyle) return { lens: 'Sony FE 35mm F1.4 GM', focal: '35mm', aperture: 'f/2.8', iso: 'ISO 800', shutter: '1/200 sec', height: '1.4m, natural guest eye line', distance: '1.5–2.2m from the primary action', rationale: 'The 35mm profile keeps people, service and venue relationships believable without a stretched wide-angle look.' }
  return { lens: 'Sony FE 50mm F1.2 GM', focal: '50mm', aperture: 'f/3.5', iso: 'ISO 640', shutter: '1/160 sec', height: 'slightly above table height', distance: '1.0–1.4m from the subject', rationale: 'The 50mm profile gives a natural commercial product perspective with controlled depth and no generic close-up distortion.' }
}

export function directIndividualProduction(input: ProductionInput): IndividualProductionProductionDirection {
  const venue_requirement = determineVenueRequirement(input)
  const environment_truth = assessIndividualProductionEnvironmentTruth(input)
  const strict_venue_truth = assessStrictVenueTruth({ ...input, active: strictVenueTruthMode(input) })
  const wardrobe_rules = individualProductionWardrobeRules(input)
  const profile = cameraProfile(input)
  const direction = normalized(input.visual_direction.interaction, input.visual_direction.human_presence, input.visual_direction.motion)
  const pillar = text(input.plan_truth.pillar).toLowerCase()
  const subject = text(input.plan_truth.subject) || 'approved subject'
  const hands = has(direction, ['hands', 'cutting', 'knife', 'serving', 'pouring', 'passing'])
  const food = pillar === 'food'
  const drinks = pillar === 'drinks'
  const hasVenue = input.truth_references.some(reference => reference.role === 'venue_truth')
  const cutting = has(direction, ['cutting', 'knife', 'slice', 'carving'])
  const subjectTruth = input.truth_references.find(reference => reference.role === 'subject_truth')
  const servingBoard = hasProductPresentation(subjectTruth, ['board'])
  const potatoes = hasProductPresentation(subjectTruth, ['potato'])
  const tableSurface = environment_truth.table_surface_materials[0] || 'verified DemoClientB dining-table surface'
  const focusTarget = cutting
    ? 'the knife contacting the verified golden crust and the freshly opened cut edge; retain believable legibility in the working hand'
    : food
      ? 'the verified subject’s hero texture, garnish and vessel edge, never a generic background object'
      : 'the plan’s primary approved subject'
  const negatives = [
    'No generic AI restaurant background, invented Italian décor, fabricated table setting, random props, or synthetic luxury styling.',
    'No excessive HDR, plastic surface smoothing, denoise haze, fake bloom, duplicate objects, warped table edges, impossible cutlery, or melted food geometry.',
    'No cinematic blur used to hide missing detail; preserve natural optical falloff and physically plausible focus transitions.',
  ]
  if (strict_venue_truth.active) {
    negatives.push(
      'No invented chandeliers, pendant lights, sconces, tables, table shapes/materials, chairs, banquettes, artwork, curtains, walls, doors, windows, ceilings, bar geometry, shelving, floor treatment or fictional venue zones.',
      'No spatial expansion, compression, fake symmetry, architectural redesign, generic luxury restaurant replacement, Pinterest furniture inheritance or camera movement beyond the supported Venue Truth coverage.',
    )
  }
  if (food) negatives.push(`No incorrect ${subject} shape or portion, artificial repeating breadcrumbs, soft indistinct interior, fake steam, duplicated potatoes, wrong board or invented garnish.`)
  if (drinks) negatives.push(`No incorrect ${subject} liquid colour, glass profile, garnish, ice geometry, condensation pattern or fill level.`)
  if (hands) negatives.push('No malformed fingers, fused knuckles, floating wrists, impossible knife grip, duplicated hands, or jewellery unless approved truth explicitly requires it.')
  if (!hasVenue) negatives.push('No identifiable restaurant architecture, furniture, curtains, windows, doors or venue background without attached approved venue truth.')
  if (environment_truth.requires_table_surface) {
    negatives.push('Do not invent a new foreground dining table, wooden restaurant table, table material, counter or furniture. The Product Truth wooden serving board is not the dining table and must not visually merge into it.')
    if (environment_truth.table_surface_materials.length) negatives.push(`Do not replace the verified ${tableSurface} with wood, black marble, matte black, red lacquer or any Pinterest table material.`)
  }
  const interactionRequirements = cutting
    ? [
      'Use one hand to hold a fork that stabilises the verified food naturally against its serving surface. The fork tines enter at a plausible angle without destroying the food structure.',
      'Use the opposite hand to hold a table knife. The knife cuts through the subject beside the fork with natural wrist alignment, visible pressure and no intersection with fingers.',
      'Show slight, irregular material compression and a small amount of plausible crumb displacement around the cut; make the freshly cut interior visible where the approved direction requests it.',
      'Keep hands and cutlery proportionate to the verified subject and serving surface. Never show a knife without a plausible stabilising utensil, floating cutlery, impossible wrists, duplicated hands or intersecting fingers.',
    ]
    : has(direction, ['pouring'])
      ? ['Show a credible source vessel, receiving vessel or food, and a continuous gravity-led liquid path with physically plausible contact.']
      : has(direction, ['passing', 'sharing'])
        ? ['Show a credible source hand, receiving hand and physically plausible shared-object grip.']
        : has(direction, ['serving'])
          ? ['Show the serving tool, food and destination surface in one physically plausible action.']
          : []
  const sceneDescription = cutting && food
    ? [
      `The verified ${subject} remains the dominant hero in the lower-middle of the full 4:5 frame at natural table height. The cutting interaction resolves around the central-lower visual area while hands and utensils enter naturally from the frame edge without dominating it.`,
      `${servingBoard ? 'The verified wooden serving board is Product Truth' : 'The verified serving surface is Product Truth'} and rests flat, fully supported and correctly scaled on the ${tableSurface} from Venue Truth. Keep the board and dining table as two distinct materials; never extend the board wood into a fictional wooden restaurant table. The subject rests naturally on it${potatoes ? ', with the verified potatoes remaining on the same board' : ''}.`,
      hasVenue ? 'DemoClientB cues may resolve softly behind the food: they preserve real depth and place without competing with the hero subject.' : 'Keep the background non-identifiable because no approved venue truth is attached.',
    ]
    : [
      `The verified ${subject} is the visual hero in the full 4:5 frame. Keep all visible objects physically supported, correctly scaled and naturally related to their surfaces.`,
      hasVenue ? 'Let approved DemoClientB venue cues establish real depth only where the saved direction calls for them.' : 'Keep the background non-identifiable when no approved venue truth is attached.',
    ]
  return {
    venue_requirement,
    strict_venue_truth,
    environment_truth,
    camera: { body: 'Sony FX3', focal_length: profile.focal, lens: profile.lens, aperture: profile.aperture, iso: profile.iso, shutter_speed: profile.shutter, camera_height: profile.height, camera_distance: profile.distance, rationale: profile.rationale },
    focus: { target: focusTarget, depth_of_field: cutting ? 'moderately shallow; subject and action plane stay resolved' : 'controlled commercial separation; preserve all verified product-defining detail', falloff: 'natural lens falloff, not computational blur or portrait-mode cutout edges' },
    lighting: {
      geometry: [
        'Use a directional key from camera-left and slightly above the subject, shaped to reveal real texture without flattening it.',
        'Use restrained fill from camera-right; retain natural shadow density and material contrast.',
        hasVenue ? 'Allow only approved venue practicals and surfaces visible in selected venue truth to influence the background.' : 'Keep the background non-identifiable; do not invent venue practicals, architecture or decorative lighting.',
      ],
      motion_treatment: cutting ? 'Freeze the decisive knife-cut at 1/250 sec while preserving believable food resistance, crumbs and hand tension.' : 'Keep movement physically plausible at the selected shutter speed; do not add synthetic motion blur.',
    },
    scene_description: sceneDescription,
    interaction_requirements: interactionRequirements,
    realism_requirements: [
      'Commercial photography, not a rendered product scene: keep slight real-world irregularity, material micro-texture and physically plausible reflections.',
      ...(food ? ['Preserve food structure, crumb scale, moisture, oil response, natural colour variation and plausible cut surfaces; do not over-sharpen or smooth.'] : []),
      ...(hands ? ['Hands must have natural anatomy, pressure, tendon placement and tool contact; include only the person detail required by the approved interaction.'] : []),
      ...(hasVenue ? [strict_venue_truth.active
        ? 'The venue itself is the subject: preserve the selected room’s actual architecture, asymmetry, fixtures, furniture, materials and supported camera geometry. Photography may change; the venue may not be redesigned.'
        : 'Match selected venue material grain, furniture scale, reflections and architectural geometry without inventing unseen areas.'] : []),
    ],
    task_negative_constraints: negatives,
    wardrobe_rules,
  }
}
