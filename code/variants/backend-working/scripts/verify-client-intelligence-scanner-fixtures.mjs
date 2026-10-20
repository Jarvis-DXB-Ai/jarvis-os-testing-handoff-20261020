import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const scanner = readFileSync(new URL('../src/lib/client-intelligence-scanner.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260826175000_client_intelligence_scanner_executor_v11.sql', import.meta.url), 'utf8')

assert.match(scanner, /maxTavilyCalls: 8, maxSonnetCalls: 3/)
assert.match(scanner, /maxRetries: 0/)
assert.match(scanner, /normalizeEvidence<T extends EvidenceInput>/)
assert.match(scanner, /rejected_phantom_citations/)
assert.match(scanner, /strong_external_evidence' && ids\.length === 0 \? 'needs_confirmation'/)
assert.match(scanner, /hasAlcoholConflict\(claim/)
assert.match(scanner, /failures \? 'partial' : 'completed'/)
assert.match(scanner, /cancellation_requested_at/)
assert.match(scanner, /model: SCANNER_STANDARD_PROFILE\.model/)
assert.match(scanner, /No automatic retries|automatic_retries: 0/)
assert.match(migration, /execution_id uuid unique/)
assert.match(migration, /attempt_count smallint not null default 0 check \(attempt_count <= 1\)/)
assert.match(migration, /'partial'/)
console.log('client intelligence scanner executor contract fixtures: PASS (offline only; provider calls: 0)')
