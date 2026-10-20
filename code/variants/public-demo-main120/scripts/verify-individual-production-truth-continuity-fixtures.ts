import { assessIndividualProductionEnvironmentTruth, individualProductionWardrobeRules, requiresAdditionalVenueSurfaceTruth } from '../src/lib/social-individual-production-truth-continuity'
import type { IndividualProductionReference } from '../src/lib/social-individual-production-types'

const venue = (id: string, visual: string): IndividualProductionReference => ({
  id, role: 'venue_truth', title: `${id}.jpg`, category: 'interiors', source: 'client_brain_asset', signed_url: null,
  metadata: { visual_presentation: visual },
})
const subject: IndividualProductionReference = {
  id: 'product', role: 'subject_truth', title: 'Cotoletta', category: 'food', source: 'client_brain_asset', signed_url: null,
  metadata: { visual_presentation: 'Breaded veal cutlet served on a wooden board with potato chips.' },
}
const base = {
  client_id: '8d771fc0-2914-57cc-90f1-9ab90f4611fd',
  plan_truth: { pillar: 'food', subject: 'Cotoletta alla milanese' },
  visual_direction: { brief: 'Eye-level active cutting interaction in a real dining room.' },
}

const fixtures: Array<[string, () => boolean]> = [
  ['Pinterest wood never wins over verified reflective DemoClientB table', () => assessIndividualProductionEnvironmentTruth({ ...base, truth_references: [subject, venue('reflective', 'Reflective mirrored glass dining tables with cream seating.')] }).table_surface_materials.includes('reflective mirrored-glass dining table')],
  ['Product board and venue table remain separate truth layers', () => assessIndividualProductionEnvironmentTruth({ ...base, truth_references: [subject, venue('reflective', 'Reflective mirrored glass dining tables.')] }).table_surface_reference_ids.includes('reflective')],
  ['Second venue reference is required when primary has no material evidence', () => requiresAdditionalVenueSurfaceTruth({ ...base, truth_references: [subject, venue('room', 'Red curtains, cream seating and round tables.')] })],
  ['Missing dining-table truth blocks instead of inventing furniture', () => assessIndividualProductionEnvironmentTruth({ ...base, truth_references: [subject, venue('room', 'Red curtains, cream seating and round tables.')] }).gaps.includes('Visible DemoClientB dining-table truth is insufficient for this composition.')],
  ['Dubai anonymous people reject sweater transfer', () => individualProductionWardrobeRules({ ...base, visual_direction: { brief: 'Pinterest person wears a sweater while cutting.' }, truth_references: [subject] }).some(rule => rule.includes('No sweaters'))],
  ['Monthly modest Emirati context overrides climate default', () => individualProductionWardrobeRules({ ...base, plan_truth: { ...base.plan_truth, monthly_context: 'Modest Emirati styling is required.' }, truth_references: [subject] }).some(rule => rule.includes('modest Emirati styling'))],
  ['Extreme macro does not require venue truth', () => !assessIndividualProductionEnvironmentTruth({ ...base, visual_direction: { brief: 'Extreme macro food texture, fully cropped away background.' }, truth_references: [subject] }).requires_table_surface],
]

const failures = fixtures.filter(([, run]) => !run())
for (const [name] of fixtures) console.log(`${failures.some(([failed]) => failed === name) ? 'FAIL' : 'PASS'} ${name}`)
if (failures.length) process.exitCode = 1
