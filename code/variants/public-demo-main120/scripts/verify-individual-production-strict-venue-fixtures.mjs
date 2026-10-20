import { readFile } from 'node:fs/promises'
import { assessStrictVenueTruth } from '../src/lib/social-individual-production-truth-continuity.ts'

const direction = {
  plan_truth: { pillar: 'interiors', subject: 'Main dining room', creative_concept: 'Warm Italian evening ambience' },
  visual_direction: { brief: 'Architectural straight-on wide shot of the dining room.', shot_scale: 'wide', camera_angle: 'architectural_straight_on', composition: 'symmetrical' },
}

function venue(id, details, flexibility = 'medium', category = 'interiors') {
  return {
    id,
    role: 'venue_truth',
    title: `${id}.jpg`,
    category,
    source: 'client_brain_asset',
    signed_url: 'https://example.test/reference.jpg',
    metadata: { perspective_flexibility: flexibility, visual_presentation: 'Wide dining room with reflective tables and suspended decorative lighting.', key_visual_details: details },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const primary = { ...venue('primary', ['two chandeliers', 'rectangular reflective tables', 'deep red curtains']), venue_truth_role: 'primary_composition_truth' }
const support = { ...venue('support', ['two chandeliers', 'rectangular reflective tables', 'cream seating']), venue_truth_role: 'spatial_support_truth' }

const complete = assessStrictVenueTruth({ ...direction, truth_references: [primary, support], active: true })
assert(complete.allowed_camera_flexibility === 'medium', 'Multiple medium-flexibility observations should allow only medium camera flexibility.')
assert(complete.gaps.length === 0, `Complete dining-room package should not block: ${complete.gaps.join(' | ')}`)

const lowCoverage = assessStrictVenueTruth({ ...direction, truth_references: [{ ...primary, metadata: { ...primary.metadata, perspective_flexibility: 'low' } }], active: true })
assert(lowCoverage.allowed_camera_flexibility === 'low', 'Low-flexibility primary must constrain camera movement.')
assert(lowCoverage.gaps.some(gap => gap.includes('wide venue view')), 'Unsupported wide view must block instead of extrapolating the room.')

const [directorSource, productionSource, promptSource] = await Promise.all([
  readFile(new URL('../src/lib/social-individual-production-director.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/social-individual-production.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/social-individual-production-prompt.ts', import.meta.url), 'utf8'),
])
assert(directorSource.includes("['interiors', 'exteriors'].includes(pillar)"), 'Interior and exterior pillars must activate strict venue mode.')
assert(directorSource.includes('lighting character, exposure, colour treatment, motion or people-atmosphere only'), 'Strict Pinterest may retain only photographic technique.')
assert(directorSource.includes('architecture, room layout, furniture, tables, seating, fixtures, venue composition, camera location'), 'Strict Pinterest must not control venue reality or camera location.')
assert(productionSource.includes('strictVenue ? 8 : 4'), 'Strict venue packages must be able to include more than the normal truth cap.')
assert(promptSource.includes('STRICT VENUE TRUTH MODE — REAL VENUE LOCK'), 'Provider prompt must contain the real-venue lock.')
assert(promptSource.includes('Do not redesign, expand, compress, symmetrize or hybridize the room.'), 'Provider prompt must prohibit architectural redesign.')

const exterior = assessStrictVenueTruth({
  plan_truth: { pillar: 'exteriors', subject: 'Terrace hero', creative_concept: 'Golden hour exterior' },
  visual_direction: { brief: 'Wide exterior facade and terrace view', shot_scale: 'wide', camera_angle: 'eye level', composition: 'documentary' },
  truth_references: [
    { ...venue('facade', ['fixed doors', 'windows', 'DemoClientB signage'], 'medium', 'exteriors'), venue_truth_role: 'primary_composition_truth' },
    { ...venue('terrace', ['outdoor tables', 'cream seating', 'tiled floor'], 'medium', 'exteriors'), venue_truth_role: 'spatial_support_truth' },
  ],
  active: true,
})
assert(exterior.gaps.length === 0, `Supported exterior truth should pass: ${exterior.gaps.join(' | ')}`)

console.log('PASS strict venue mode activation')
console.log('PASS fixture/lighting/table truth coverage')
console.log('PASS Pinterest technique-only restrictions')
console.log('PASS low-flexibility wide-view block')
console.log('PASS multiple same-room observations')
console.log('PASS exterior venue truth coverage')
