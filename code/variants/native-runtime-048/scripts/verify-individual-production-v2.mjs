import { assignProductionReferenceRoles, determineVenueRequirement, directIndividualProduction } from '../src/lib/social-individual-production-director.ts'
import { individualProductionPrompt } from '../src/lib/social-individual-production-prompt.ts'

function expect(condition, message) {
  if (!condition) throw new Error(`Fixture failed: ${message}`)
}

const cotoletta = {
  id: 'cotoletta-truth', role: 'subject_truth', title: 'AI Truth Ref - DSC07947 copy.jpg', category: 'food', source: 'client_brain_asset', signed_url: 'https://example.test/cotoletta.jpg',
  metadata: { dish_name: 'Cotoletta', visual_presentation: 'Golden breaded Cotoletta with bone, potatoes and serving board.' },
}
const venue = {
  id: 'democlientb-interior', role: 'venue_truth', title: 'DemoClientB Main Dining Room', category: 'interiors', source: 'client_brain_asset', signed_url: 'https://example.test/interior.jpg',
  metadata: { key_visual_details: 'Warm timber, curtains and reflected amber practical lighting.' },
}
const pinterest = {
  id: 'pinterest-technique', role: 'pinterest_inspiration', title: 'Knife-cut foreground technique', category: 'pinterest', source: 'pinterest_inspiration', signed_url: 'https://example.test/pinterest.jpg',
  metadata: { camera_angle: 'eye_level', composition: 'layered_foreground', interaction: 'cutting', motion: 'active', lighting_style: 'warm_side_light', creative_techniques: ['foreground layering'] },
}

const p06Input = {
  plan_truth: { subject: 'Cotoletta', pillar: 'food', creative_concept: 'Knife-cut Cotoletta detail' },
  visual_direction: {
    shot_scale: 'close', camera_angle: 'eye_level', composition: 'layered_foreground', human_presence: 'hands_only', interaction: 'cutting', motion: 'active',
    brief: 'Eye-level close frame; a knife mid-cut through the golden crust in foreground, revealing interior. Warm restaurant ambient light from left. Soft out-of-focus table and restaurant foreground elements create depth. Hands enter from top edge, keeping subject safely within crop zone.',
  },
}

const p06VenueRequirement = determineVenueRequirement(p06Input)
expect(!p06VenueRequirement.required, 'P06 close product direction must not require an identifiable venue reference.')
const p06Assignments = assignProductionReferenceRoles({ truth_references: [cotoletta], pinterest_references: [pinterest] })
const p06Direction = directIndividualProduction({ ...p06Input, truth_references: [cotoletta], pinterest_references: [pinterest] })
expect(p06Direction.camera.lens === 'Sony FE 85mm F1.4 GM II', 'active knife-cut must choose the compressed 85mm commercial profile.')
expect(p06Direction.camera.shutter_speed === '1/250 sec', 'active knife-cut must use the motion-freezing shutter profile.')
expect(p06Assignments.some(reference => reference.role === 'product_truth'), 'P06 must assign product truth.')
expect(p06Assignments.some(reference => reference.role === 'creative_technique_inspiration'), 'P06 must assign Pinterest as a technique reference.')

const p06Package = {
  client_id: 'fixture-client', plan_id: 'fixture-plan', plan_item_id: 'fixture-p06', plan_item_ref: 'P06', status: 'ready', blocked_reasons: [], warnings: [],
  correction: 'Match the truth reference proportions more closely.',
  production: { provider: 'google-gemini', model: 'gemini-3-pro-image-preview', mode: 'dry_run', aspect_ratio: '4:5', output_resolution: '4K', max_references: 5, prompt_version: 'monthly-individual-production-v2' },
  ...p06Input,
  client_truth: { canonical_subject: 'Cotoletta', menu_source: 'A La Carte', menu_ingredients: 'Cotoletta, potatoes and serving board.' },
  brand_context: ['Warm, contemporary Italian restaurant photography with restrained editorial energy.'],
  truth_references: [cotoletta], pinterest_references: [pinterest], pinterest_selection: { mode: 'manual', selected_id: pinterest.id, candidates: [pinterest] },
  reference_assignments: p06Assignments, production_direction: p06Direction,
  negative_constraints: ['Do not change Cotoletta shape or portion, remove the bone, replace the potatoes or serving board, add garnish, invent a plate, deform hands, duplicate fingers, create impossible knife/fork contact, apply synthetic food gloss, over-denoise or over-sharpen.'],
}
const p06Prompt = individualProductionPrompt(p06Package)
expect(p06Prompt.includes('REFERENCE ASSIGNMENTS / INHERITANCE FIREWALL'), 'prompt must include the inheritance firewall.')
expect(p06Prompt.includes('USER CORRECTION — HARD CONSTRAINT'), 'prompt must elevate a correction to a hard constraint.')
expect(p06Prompt.includes('DO NOT INHERIT:'), 'prompt must define prohibited inheritance for every reference.')
expect(p06Prompt.includes('No incorrect Cotoletta shape or portion'), 'prompt must include food-specific P06 failure modes.')
expect(p06Prompt.length > 3_000, 'complex P06 production direction must not collapse back to a compact prompt.')

const venueInput = {
  plan_truth: { subject: 'Aperitivo service', pillar: 'lifestyle', creative_concept: 'Guests in the DemoClientB dining room' },
  visual_direction: { shot_scale: 'wide_environmental', camera_angle: 'eye_level', composition: 'visible dining room with service movement', human_presence: 'people', interaction: 'service', motion: 'active', brief: 'Wide environmental interior scene with visible dining room architecture and guests receiving aperitivo service.' },
}
const venueRequirement = determineVenueRequirement(venueInput)
expect(venueRequirement.required, 'recognizable venue-led scene must require venue truth.')
expect(venueRequirement.allow_second_reference, 'wide spatial venue scene may use a second venue reference.')
const venueDirection = directIndividualProduction({ ...venueInput, truth_references: [venue], pinterest_references: [] })
expect(venueDirection.camera.lens === 'Sony FE 24-70mm F2.8 GM II', 'wide venue scene must choose the 24-70mm profile.')

console.log('Individual Production V2 fixtures passed: P06 knife-cut truth/technique firewall and venue-led truth retrieval decisions.')
