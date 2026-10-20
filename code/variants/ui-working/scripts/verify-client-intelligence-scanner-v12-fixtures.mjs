import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const resolverSource = readFileSync(new URL('../src/lib/client-intelligence-entity-resolution.ts', import.meta.url), 'utf8')
const { classifyDiscovery } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(resolverSource, { mode: 'strip' }))}`)
const identity = {
  canonicalName: 'DemoClientB', nameVariants: ['DemoClientB', 'DemoClientB', 'Luna Rossa'], officialDomains: ['restaurant.example'], officialInstagramHandles: ['examplerestaurant'],
  country: 'United Arab Emirates', city: 'Dubai', area: 'Business Bay', category: 'Italian restaurant', phones: ['+00000000000'], excludedRelatedNames: ['DemoClientC'],
}
const check = (name, item, classification, admitted) => {
  const actual = classifyDiscovery(item, identity)
  assert.equal(actual.classification, classification, name)
  assert.equal(actual.admitted, admitted, name)
}

check('A official-domain', { url: 'https://restaurant.example/about', area: 'brand' }, 'CLIENT_OFFICIAL', true)
check('B exact Instagram ownership', { url: 'https://instagram.com/examplerestaurant/', area: 'social' }, 'CLIENT_OFFICIAL', true)
check('C random Instagram never inherits ownership', { url: 'https://instagram.com/randomrestaurant/', area: 'social' }, 'AMBIGUOUS', false)
check('D wrong-country collision rejected', { url: 'https://example.com/luna-rossa-new-york', title: 'Luna Rossa New York', area: 'brand' }, 'UNRELATED', false)
check('D2 wrong-city collision rejected', { url: 'https://example.com/democlientb-abu-dhabi', title: 'DemoClientB Abu Dhabi', area: 'brand' }, 'UNRELATED', false)
check('E related sea business rejected', { url: 'https://example.com/democlientb-on-the-sea', title: 'DemoClientC charter', area: 'brand' }, 'RELATED_ENTITY_MISMATCH', false)
check('F review platform accepted only with place evidence', { url: 'https://tripadvisor.com/democlientb-dubai', title: 'DemoClientB, Business Bay Dubai', area: 'reputation' }, 'REVIEW_PLATFORM_CLIENT_MATCH', true)
check('G ambiguous directory rejected', { url: 'https://directory.example/luna-rossa', title: 'Luna Rossa', area: 'brand' }, 'AMBIGUOUS', false)
check('H competitor has its own identity rule', { url: 'https://competitor.example', title: 'A Dubai Italian restaurant', area: 'competitor' }, 'COMPETITOR', true)
check('I market has its own identity rule', { url: 'https://market.example/uae', title: 'UAE restaurant market', area: 'market' }, 'MARKET', true)

const scanner = readFileSync(new URL('../src/lib/client-intelligence-scanner.ts', import.meta.url), 'utf8')
assert.match(scanner, /timeoutMs: SCANNER_SYNTHESIS_TIMEOUT_MS/)
assert.match(scanner, /SCANNER_SYNTHESIS_TIMEOUT_MS = 120_000/)
assert.match(scanner, /maxRetries: 0/)
assert.match(scanner, /persistDiscoveries\(scan, job\.area/)
assert.match(scanner, /persistEvidence\(scan, evidence\)/)
assert.match(scanner, /persistPublicDiscrepancies\(scan, persistedEvidence, identity\)/)
console.log('client intelligence scanner V1.2 entity-resolution fixtures: PASS (offline only; provider calls: 0)')
