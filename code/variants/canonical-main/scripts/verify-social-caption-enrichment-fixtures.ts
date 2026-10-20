import assert from 'node:assert/strict'
// @ts-expect-error Node fixture runner uses explicit TypeScript extensions.
import { matchRelevantCaptionTruth, visualCategoriesForCaption, deterministicPostTitle } from '../src/lib/social-caption-context-enrichment.ts'

const records = [
  { id: 'gelato', title: 'Homemade Gelato', subsection: 'products_offers', summary: 'Homemade gelato is a verified DemoClientB dessert offering.', status: 'active' },
  { id: 'dog', title: 'Dog-Friendly Terrace', subsection: 'operations', summary: 'The terrace is dog-friendly.', status: 'active' },
  { id: 'pizza', title: 'Neapolitan Pizza', subsection: 'products_offers', summary: 'Neapolitan pizza is a verified DemoClientB brand pillar.', status: 'active' },
  { id: 'gap', title: 'Dog Policy Restrictions', subsection: 'knowledge_gaps', summary: 'Do not infer restrictions.', status: 'active' },
]
assert.deepEqual(visualCategoriesForCaption({ foodVisible: ['gelato'] }), ['gelato'])
assert.equal(matchRelevantCaptionTruth(records, { foodVisible: ['ice cream'] })[0]?.fact, 'Homemade gelato is a verified DemoClientB dessert offering.')
assert.equal(matchRelevantCaptionTruth(records, { broadScene: 'dog at the table' })[0]?.recordId, 'dog')
assert.equal(matchRelevantCaptionTruth(records, { foodVisible: ['pizza'] })[0]?.recordId, 'pizza')
assert.equal(matchRelevantCaptionTruth(records, { foodVisible: ['pasta'] }).length, 0)
assert.equal(matchRelevantCaptionTruth(records, { broadScene: 'unknown object' }).length, 0)
assert.equal(deterministicPostTitle({ foodVisible: ['gelato'] }), 'Gelato at DemoClientB')
console.log('social caption enrichment fixtures: PASS')
