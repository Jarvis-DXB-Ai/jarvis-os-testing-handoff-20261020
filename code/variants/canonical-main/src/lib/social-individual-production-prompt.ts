import type { IndividualProductionPackage, IndividualProductionReference, IndividualProductionReferenceAssignment } from '@/lib/social-individual-production-types'

export const INDIVIDUAL_PRODUCTION_PROMPT_VERSION = 'monthly-individual-production-v3-strict-venue-recreation'

function lines(values: string[]) { return values.length ? values.map(value => `- ${value}`) : ['- No additional verified detail supplied.'] }
function field(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : '' }
function section(title: string, values: string[]) { return values.length ? [title, ...lines(values), ''] : [] }
function productionBrief(value: unknown) { return field(value).replace(/,?\s*keeping subject safely within crop zone\.?/i, '').trim() }

function assignmentFor(reference: IndividualProductionReference, assignments: IndividualProductionReferenceAssignment[]) {
  return assignments.find(assignment => assignment.reference_id === reference.id)
}

function providerReferenceInstruction(reference: IndividualProductionReference, index: number, assignments: IndividualProductionReferenceAssignment[]) {
  const assignment = assignmentFor(reference, assignments)
  const image = `REFERENCE IMAGE ${index + 1}`
  if (reference.role === 'pinterest_inspiration') {
    const strictVenue = reference.match_strength === 'loose_inspiration' && reference.manual_mismatch === true
    const replicate = reference.match_strength === 'replicate_composition'
    return [
      `${image} — ${strictVenue ? 'PINTEREST TECHNIQUE REFERENCE ONLY' : 'PINTEREST COMPOSITION REFERENCE'}`,
      strictVenue
        ? 'Use this image only for lighting character, exposure, colour treatment, motion or people-atmosphere. Do not use it for composition, camera location, room geometry, architecture, furniture or table placement.'
        : `${replicate ? 'REPLICATE THE COMPOSITIONAL RELATIONSHIP in this image' : 'Use this image as strong creative inspiration'}: camera relationship, framing, subject placement, foreground layering, hands and utensil gesture, movement, depth, lighting character and editorial energy.`,
      `Do not inherit factual content from ${image}: no food identity, ingredients, plate, cutlery, glassware, table surface, venue, branding, text, people identity, wardrobe or jewellery. Replace every factual object with the approved DemoClientB truth images below.`,
      ...(assignment ? ['Permitted influence:', ...lines(assignment.may_influence)] : []),
      '',
    ]
  }
  if (reference.role === 'subject_truth') return [
    `${image} — DEMOCLIENTB PRODUCT TRUTH`,
    'Use this image as the absolute source of truth for the subject. Replace the Pinterest subject with this exact approved DemoClientB food or drink: preserve canonical identity, shape, portion, vessel/board, plate, garnish, material response and visible presentation.',
    ...(assignment ? ['Verified controls:', ...lines(assignment.controls)] : []),
    'Never substitute a generic equivalent or copy a Pinterest food, plate, cutlery or styling decision that conflicts with this image.', '',
  ]
  if (reference.role === 'supporting_food_truth' || reference.role === 'supporting_drink_truth') return [
    `${image} — DEMOCLIENTB ${reference.role === 'supporting_food_truth' ? 'SUPPORTING FOOD' : 'SUPPORTING DRINK'} TRUTH`,
    `Use this image only when the saved scene visibly needs this approved supporting ${reference.role === 'supporting_food_truth' ? 'food item' : 'drink'}: preserve its exact identity, vessel or plate, garnish and realistic presentation. It is not the hero subject.`,
    'Do not replace it with a generic menu item, borrow its styling from Pinterest, or let it change the primary subject, venue geometry or camera composition.',
    ...(assignment ? ['Verified controls:', ...lines(assignment.controls)] : []), '',
  ]
  if (reference.role === 'venue_truth') return [
    `${image} — ${reference.venue_truth_role === 'primary_composition_truth' ? 'PRIMARY DEMOCLIENTB VENUE TRUTH' : reference.venue_truth_role === 'same_zone_detail_truth' ? 'DEMOCLIENTB SAME-ZONE DETAIL TRUTH' : reference.venue_truth_role === 'ceiling_lighting_truth' ? 'DEMOCLIENTB VENUE / CEILING AND LIGHTING TRUTH' : reference.venue_truth_role === 'furniture_material_truth' ? 'DEMOCLIENTB VENUE / FURNITURE AND MATERIAL TRUTH' : reference.environment_role === 'surface_truth' ? 'DEMOCLIENTB VENUE / TABLE SURFACE TRUTH' : 'DEMOCLIENTB VENUE / ENVIRONMENT TRUTH'}`,
    reference.environment_role === 'surface_truth'
      ? 'Use this image as the exact source of truth for the DemoClientB dining-table surface beneath the product. Preserve its visible material, reflective finish, scale and physical support. This table is separate from any product-owned board, plate, glass or serving ware.'
      : reference.venue_truth_role === 'primary_composition_truth'
        ? 'This is the primary real-room observation. Preserve its camera position, camera height, perspective, framing, asymmetry and visible spatial relationships unless another attached Venue Truth image directly supports a modest alternate view. Do not turn this room into a more symmetrical or redesigned version.'
        : reference.venue_truth_role === 'same_zone_detail_truth'
          ? `This image is qualified only as same-zone factual support${reference.venue_support_reason ? `: ${reference.venue_support_reason}` : ''}. It may fill that named detail only. The primary Venue Truth still controls camera, framing, perspective and room geometry.`
          : 'Use this approved venue observation only for the explicitly assigned factual role. Never average differing viewpoints into a fictional hybrid.',
    ...(assignment ? ['Verified controls:', ...lines(assignment.controls)] : []),
    'Do not copy the Pinterest background, table surface, restaurant styling, wardrobe, furniture or unseen venue areas. Do not invent an additional DemoClientB table or surface because the composition needs one. If an attached Venue Truth image does not support a required element, crop or recompose within the supported truth instead of inventing it.', '',
  ]
  if (reference.role === 'animal_truth') return [
    `${image} — APPROVED ANIMAL TRUTH`,
    'Use this image only for the approved animal identity, size, coat, markings and natural secondary presence required by the saved interaction. Do not borrow an animal from Pinterest.',
    ...(assignment ? ['Verified controls:', ...lines(assignment.controls)] : []), '',
  ]
  return [
    `${image} — APPROVED PERSON TRUTH`,
    'Use this image only for the approved person identity or wardrobe cues required by the saved interaction. Do not borrow person identity from Pinterest.',
    ...(assignment ? ['Verified controls:', ...lines(assignment.controls)] : []), '',
  ]
}

function humanDirection(input: Omit<IndividualProductionPackage, 'prompt' | 'package_hash'>) {
  const direction = input.visual_direction
  const values = [field(direction.human_presence), field(direction.interaction), field(direction.motion)].join(' ').toLowerCase()
  if (!/(hand|people|person|guest|chef|service|cutting|knife|pouring|passing|walking)/.test(values)) return []
  const identity = input.reference_assignments.filter(assignment => assignment.role === 'person_identity_truth')
  return [
    'Include only the people or hands required by the saved interaction. Preserve natural anatomy, pressure, joint placement, skin texture and physical contact.',
    ...(identity.length ? ['When a person truth reference is attached, preserve approved identity, hairline, facial proportions, skin tone and wardrobe only from that reference.'] : ['Do not create a specific real identity without approved person truth.']),
    'No beauty filtering, waxy skin, AI hair ribbons, fused fingers, duplicated fingers, impossible wrists, floating cutlery or disconnected contact points.',
  ]
}

function strictVenueSection(input: Omit<IndividualProductionPackage, 'prompt' | 'package_hash'>) {
  const strict = input.production_direction.strict_venue_truth
  if (!strict.active) return []
  const coverage = strict.coverage.map(entry => `${entry.area.replace('_', ' ')}: ${entry.supported ? `supported by ${entry.reference_ids.length} approved reference${entry.reference_ids.length === 1 ? '' : 's'}` : 'not supported'}`)
  return [
    'STRICT VENUE TRUTH MODE — REAL VENUE LOCK',
    'The venue itself is the primary subject. Exactly one approved primary Venue Truth image anchors the real DemoClientB space by default.',
    'A second image is allowed only when both references explicitly identify the exact same physical zone and the second image supplies a named factual gap. It never changes camera position, perspective, framing or room geometry.',
    'Reconstruct the consistent real venue only. The primary Venue Truth controls camera position, camera height, perspective, framing and visible room geometry.',
    'Photography may change through physically plausible exposure, white balance, practical-light emphasis, depth of field, realistic people activity and restrained grading. Reality may not change.',
    'Do not redesign, expand, compress, symmetrize or hybridize the room. Do not add, remove or relocate permanent architecture, fixtures, furniture, table types/materials, chairs, banquettes, curtains, artwork, shelving, bar/counter, windows, doors or ceiling elements.',
    `Supported camera flexibility: ${strict.allowed_camera_flexibility}. ${strict.allowed_camera_flexibility === 'low' ? 'Stay close to the primary reference viewpoint.' : 'Any camera reframing must remain inside geometry visibly established by the attached Venue Truth references.'}`,
    `Venue-normalised camera instruction: ${strict.normalization.effective_camera_instruction}`,
    `Venue-normalised composition instruction: ${strict.normalization.effective_composition_instruction}`,
    ...(strict.normalization.ignored_direction_terms.length ? [`The saved direction cannot override the primary venue geometry. Ignored as spatial commands: ${strict.normalization.ignored_direction_terms.join(', ')}.`] : []),
    'Truth coverage:', ...lines(coverage),
    ...(strict.gaps.length ? ['Unresolved strict-venue gaps:', ...lines(strict.gaps)] : []),
    '',
  ]
}

function strictVenueRecreationPrompt(input: Omit<IndividualProductionPackage, 'prompt' | 'package_hash'>) {
  const strict = input.production_direction.strict_venue_truth
  const visual = input.visual_direction
  const primary = input.provider_references.find(reference => reference.role === 'venue_truth' && reference.venue_truth_role === 'primary_composition_truth')
    ?? input.provider_references.find(reference => reference.role === 'venue_truth')
  const rawDirection = [field(visual.brief), field(visual.human_presence), field(visual.interaction), field(visual.motion)].join(' ').toLowerCase()
  const warmEvening = /warm|amber|evening|golden|night/.test(rawDirection)
  const guests = /guest|people|person/.test(rawDirection)
  const staff = /staff|service|passing/.test(rawDirection)
  const motion = /motion|moving|passing|walk/.test(rawDirection)
  const physicalLocks = [
    'Architecture, room geometry, dimensions, camera position, camera height, camera direction, perspective and field of view.',
    'Ceiling, walls, openings, windows, doors, curtains, chandeliers, pendants, sconces and every visible permanent fixture.',
    'Every visible table, chair, banquette, counter, shelf, artwork, screen, floor treatment, decorative object, material, orientation, placement, spacing and relative scale.',
    'The visible asymmetry and all spatial relationships exactly as observed in Image 1.',
  ]
  const allowed = [
    'Professional exposure and white-balance refinement, realistic highlight/shadow balance, restrained colour grading and a high-resolution RAW photographic finish.',
    warmEvening ? 'A physically plausible warm September-evening treatment and warmer practical-light emission only; physical fixtures remain unchanged.' : 'A restrained photographic treatment only; physical fixtures remain unchanged.',
    'A tiny non-destructive crop, horizon or framing cleanup only when it does not reveal or remove physical venue information.',
  ]
  const people = guests || staff
    ? [
        `Anonymous ${guests && staff ? 'guests and one passing staff member' : guests ? 'guests' : 'staff'} may add secondary atmosphere only where they fit naturally into existing chairs, circulation space and table positions.`,
        'People must adapt to the existing furniture and geometry. Do not add, move, duplicate, hide or redesign furniture to accommodate them. Keep people sparse; do not obscure major venue truth.',
        motion ? 'Any movement is subtle and physically plausible; motion blur may affect people only, never architecture or furniture.' : '',
      ].filter(Boolean)
    : ['Do not introduce people, staff or activity not required by the saved concept.']
  const prohibitions = [
    'NO redesigned architecture, altered geometry, new or moved walls, doors, windows, openings, ceilings or venue zones.',
    'NO new, changed, removed or relocated chandeliers, pendants, sconces, fixtures, curtains, tables, chairs, banquettes, counters, shelving, artwork, screens or flooring.',
    'NO changed table shape or material, invented furniture, artificial symmetry, spatial expansion/compression, generic luxury redesign or architectural beautification.',
  ]
  return [
    'STRICT VENUE RECREATION — IMAGE-TO-IMAGE PHOTOGRAPHIC RECREATION',
    'IMAGE OBJECTIVE',
    `Use REFERENCE IMAGE 1${primary ? ` (${primary.title})` : ''} as the existing real photograph of DemoClientB. Produce a refined professional 4:5 photographic recreation of this exact same scene. Transform the supplied photograph; do not generate a new restaurant scene inspired by it.`,
    '',
    'REFERENCE IMAGE 1 — ABSOLUTE VENUE AND PHYSICAL SCENE TRUTH',
    'Image 1 is immutable physical reality. The final image must remain recognizably the same photographable space. Preserve every visible element exactly as shown.',
    '',
    ...section('PHYSICAL ELEMENTS LOCKED', physicalLocks),
    'CAMERA / PERSPECTIVE LOCK',
    `- ${strict.normalization.effective_camera_instruction}`,
    `- ${strict.normalization.effective_composition_instruction}`,
    '- Retain Image 1 camera and perspective. Do not introduce a new camera angle, wide view, straight-on view, centred view or symmetrical framing unless it is already visibly true in Image 1.',
    '',
    ...section('ALLOWED PHOTOGRAPHIC CHANGES', allowed),
    ...section('PEOPLE / ACTIVITY', people),
    'PHOTOGRAPHIC FINISH',
    '- High-resolution professional RAW-style photograph: natural optical rendering, credible material response, restrained contrast, preserved shadow detail and no synthetic HDR or CGI finish.',
    '',
    ...section('STRICT PROHIBITIONS', [...prohibitions, ...input.negative_constraints]),
    'FINAL INSTRUCTION',
    'The success criterion is physical fidelity to Image 1. If any creative instruction conflicts with Image 1, ignore the creative instruction and preserve Image 1. Change the photograph, not the restaurant.',
  ].join('\n').trim()
}

export function individualProductionPrompt(input: Omit<IndividualProductionPackage, 'prompt' | 'package_hash'>) {
  const direction = input.production_direction
  const visual = input.visual_direction
  const subject = field(input.client_truth.canonical_subject) || field(input.plan_truth.subject)
  const venueAssigned = input.reference_assignments.some(assignment => assignment.role === 'venue_truth')
  const strictVenue = input.production_direction.strict_venue_truth.active
  if (strictVenue) return strictVenueRecreationPrompt(input)
  const content = [
    'IMAGE OBJECTIVE',
    `Create one final-quality DemoClientB Instagram Feed photograph in a 4:5 portrait master. Canonical subject: ${subject}.`,
    'Make the verified client truth cinematic; never make the cinematic fictional.', '',
    'FINAL PRIORITY HIERARCHY',
    '1. APPROVED DEMOCLIENTB TRUTH ASSETS control all factual visual content: subject identity, food/drink, plate, board, cutlery, glassware, table, venue, people and branding.',
    '2. SAVED PLAN AND VISUAL DIRECTION control the required story, interaction, composition intent and output format.',
    strictVenue
      ? '3. PINTEREST, when attached, is loose technique inspiration only: lighting character, exposure, colour treatment, motion or people-atmosphere. It never controls venue composition, camera location, room geometry, architecture or furniture.'
      : '3. PINTEREST COMPOSITION REFERENCE controls only how the image is photographed: camera relationship, crop, angle, subject placement, gesture, layering, depth, light character and editorial energy.',
    '4. If Pinterest conflicts with Product Truth, Venue Truth, a person truth image or the saved plan, approved DemoClientB truth wins without exception.', '',
    'PHYSICAL ENVIRONMENT CONTINUITY',
    'Every visible client-specific environment element must be directly supported by an attached approved Venue Truth image. This includes tables and table materials, counters, chairs, banquettes, curtains, walls, floors, ceilings, windows, doors, bars, lighting fixtures, artwork and structural features.',
    'A Product Truth board, plate, glass or serving item remains product-owned. The dining table underneath it remains Venue Truth. Never blend or extend the product material into a new restaurant surface.',
    strictVenue
      ? 'Pinterest, if attached, is technique-only. It never supplies composition, camera location, client table, venue surface, furniture, architecture, wardrobe or restaurant styling.'
      : 'Pinterest controls composition only. It never supplies a client table, venue surface, furniture, wardrobe or restaurant styling.', '',
    ...strictVenueSection(input),
    'ROLE-LOCKED REFERENCE IMAGES',
    ...(input.provider_references.length ? input.provider_references.flatMap((reference, index) => providerReferenceInstruction(reference, index, input.reference_assignments)) : ['No image references are attached. Do not invent client physical truth.', '']),
    ...section('SOURCE OF TRUTH / ACCURACY', [
      field(input.client_truth.canonical_subject) ? `Canonical subject: ${field(input.client_truth.canonical_subject)}` : '',
      field(input.client_truth.menu_source) ? `Verified menu source: ${field(input.client_truth.menu_source)}` : '',
      field(input.client_truth.menu_ingredients) ? `Verified ingredients and menu wording: ${field(input.client_truth.menu_ingredients)}` : '',
    ].filter(Boolean)),
    ...section('FINAL SCENE DESCRIPTION', direction.scene_description),
    ...section('POSE AND ACTIVITY', direction.interaction_requirements),
    ...section('SCENE AND APPROVED VISUAL DIRECTION', strictVenue
      ? [
          'Retain the saved Visual Direction only as photographic intent for ambience, light, people and motion. It cannot alter physical venue geometry.',
          direction.strict_venue_truth.normalization.effective_camera_instruction,
          direction.strict_venue_truth.normalization.effective_composition_instruction,
          field(visual.interaction) ? `Approved interaction: ${field(visual.interaction)}.` : '',
          field(visual.human_presence) ? `Human presence: ${field(visual.human_presence)}.` : '',
          field(visual.motion) ? `Motion: ${field(visual.motion)}.` : '',
        ].filter(Boolean)
      : [
          productionBrief(visual.brief), field(visual.shot_scale) ? `Shot scale: ${field(visual.shot_scale)}` : '',
          field(visual.camera_angle) ? `Camera angle: ${field(visual.camera_angle)}` : '', field(visual.composition) ? `Composition: ${field(visual.composition)}` : '',
          field(visual.interaction) ? `Approved interaction: ${field(visual.interaction)}.` : '',
        ].filter(Boolean)),
    ...section('CAMERA AND COMPOSITION', [
      `Camera body: ${direction.camera.body}. Lens: ${direction.camera.lens} at ${direction.camera.focal_length}; ${direction.camera.rationale}`,
      `Camera geometry: ${direction.camera.camera_height}; ${direction.camera.camera_distance}.`,
      'Deliver the complete 4:5 portrait master. Compose for the full frame and preserve natural spatial relationships; do not force a centred square crop or cutout-style product framing.',
    ]),
    ...section('CAMERA EQUIPMENT AND SETTINGS', [`${direction.camera.focal_length}, ${direction.camera.aperture}, ${direction.camera.iso}, ${direction.camera.shutter_speed}. Settings must serve the stated action and available light, not decorative metadata.`]),
    ...section('FOCUS AND DEPTH OF FIELD', [`Primary focus: ${direction.focus.target}.`, `Depth of field: ${direction.focus.depth_of_field}.`, `Foreground/background treatment: ${direction.focus.falloff}.`]),
    ...section('LIGHTING', [...direction.lighting.geometry, direction.lighting.motion_treatment]),
    ...section('VENUE / BACKGROUND', venueAssigned
      ? [
        strictVenue ? 'The real DemoClientB venue is the subject. Venue Truth is an absolute physical-environment lock, not a decorative backdrop.' : 'The environment is DemoClientB. Venue Truth is a physical-environment lock, not a decorative backdrop.',
        'Use only venue elements visibly supported by the attached approved Venue Truth references. Do not invent a foreground table, counter, chair, banquette, curtain, wall, artwork, light fixture, floor, window, door, bar or unseen room zone.',
        ...(direction.environment_truth.table_surface_materials.length ? [`The required dining-table surface is ${direction.environment_truth.table_surface_materials.join(' / ')} from the attached Venue Truth. Keep it physically distinct from the Product Truth serving board.`] : []),
        'If the composition needs an element not supported by the attached Venue Truth, crop or recompose within the approved truth; never make up a DemoClientB substitute.',
      ]
      : [direction.venue_requirement.reason, 'Keep any background non-identifiable. Do not manufacture restaurant architecture, furniture, table styling or generic Italian décor.']),
    ...section('HUMAN REALISM', humanDirection(input)),
    ...section('WARDROBE / CLIMATE', direction.wardrobe_rules),
    ...section('MATERIALS AND PHYSICAL REALISM', direction.realism_requirements),
    'PHOTOGRAPHIC REALISM / FINISH',
    '- High-resolution professional RAW photograph with restrained post-processing, retained high-frequency detail, subtle natural sensor texture, realistic optical softness, natural highlight roll-off and preserved shadow information.',
    '- Preserve natural asymmetry, irregular crumbs/folds/reflections where relevant, real material-specific highlights and minor physical variation. Do not turn imperfections into damage.',
    '- Prevent aggressive denoising, beauty filtering, artificial HDR, synthetic clarity, oversharpening, fake microtexture, uniform surfaces or CGI smoothness.', '',
    ...(input.correction ? ['USER CORRECTION — HARD CONSTRAINT', `- ${input.correction}`, '- This correction is mandatory for this next version and overrides any lower-priority creative interpretation.', ''] : []),
    'STRICT NEGATIVE CONSTRAINTS', ...lines([...input.negative_constraints, ...direction.task_negative_constraints]), '',
    'FINAL INSTRUCTION',
    strictVenue
      ? 'Generate one coherent, physically plausible photograph of the REAL DemoClientB venue. Make the truth cinematic; never make the cinematic fictional. If a requested element or camera move is not supported by Venue Truth, preserve the supported primary view instead of inventing it.'
      : 'Generate only one coherent, physically plausible DemoClientB photograph. The Pinterest image is reference for composition only; all factual restaurant details must be taken from approved DemoClientB truth images.',
  ]
  return content.join('\n').trim()
}
