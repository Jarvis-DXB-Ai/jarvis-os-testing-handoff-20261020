#!/usr/bin/env node

const MAX_OUTPUT_TOKENS = 3_800
const SAFETY_BUFFER = 384
const refs = Array.from({ length: 15 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)

const directions = refs.map((ref, index) => ({
  ref,
  scale: ['detail', 'medium', 'wide'][index % 3],
  angle: ['eye_level', 'top_down', 'three_quarter'][index % 3],
  composition: ['centered', 'asymmetric', 'layered'][index % 3],
  people: ['none', 'ambient', 'generic_hands'][index % 3],
  interaction: ['still_life', 'service_action', 'guest_interaction'][index % 3],
  motion: ['still', 'subtle_motion', 'active_moment'][index % 3],
  direction: `Keep the confirmed concept as the sole factual subject. Use a ${['disciplined detail study', 'warm editorial medium frame', 'spacious venue-led composition'][index % 3]} with believable DemoClientB materials, purposeful negative space, and a protected central profile-crop area. Let approved truth control identity while the visual rhythm remains distinct from adjacent posts.`,
  inspiration_refs: index % 4 === 0 ? [`pin-${index + 1}`] : [],
}))

const payload = { directions }
const refsReturned = new Set(payload.directions.map(direction => direction.ref))
const byteCount = Buffer.byteLength(JSON.stringify(payload), 'utf8')
const estimatedTokens = Math.ceil(byteCount / 3.5)
const directionWordCounts = payload.directions.map(direction => direction.direction.trim().split(/\s+/).filter(Boolean).length)

if (payload.directions.length !== 15) throw new Error('Fixture must contain exactly 15 directions.')
if (refsReturned.size !== 15 || refs.some(ref => !refsReturned.has(ref))) throw new Error('Fixture must preserve every canonical P01-P15 reference exactly once.')
if (directionWordCounts.some(count => count < 25 || count > 45)) throw new Error('Fixture direction word count is outside the 25-45 word contract.')
if (estimatedTokens > MAX_OUTPUT_TOKENS - SAFETY_BUFFER) throw new Error('Fixture exceeds the bounded Visual Direction output allowance.')

console.log(JSON.stringify({
  fixture: 'monthly-visual-direction-stage-2a.6',
  directions: payload.directions.length,
  canonical_refs: [...refsReturned],
  direction_word_counts: directionWordCounts,
  output_bytes: byteCount,
  conservative_estimated_tokens: estimatedTokens,
  max_output_tokens: MAX_OUTPUT_TOKENS,
  safety_buffer: SAFETY_BUFFER,
  bounded: true,
  atomic_apply_payload_ready: true,
}, null, 2))
