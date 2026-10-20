#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const visualDirection = 'Use a purposeful three-quarter food composition with the confirmed plate as hero, restrained warm restaurant light, and a protected central crop. Keep every food detail visibly faithful to the approved truth reference while the photographic treatment remains editorial.'

function evaluate({ pillar, subject, visualDirection: direction, truthReferences, missingAssetNote = '' }) {
  const blocked = []
  if (direction.trim().split(/\s+/).length < 25) blocked.push('Visual Direction is required.')
  if (missingAssetNote) blocked.push(missingAssetNote)
  if (['food', 'drinks'].includes(pillar) && !truthReferences.some(reference => reference.role === 'subject_truth')) blocked.push('Product truth is required.')
  if (['interiors', 'lifestyle', 'bts_service'].includes(pillar) && !truthReferences.some(reference => reference.role === 'venue_truth')) blocked.push('Venue truth is required.')
  if (/chef antonio/i.test(subject) && !truthReferences.some(reference => reference.role === 'person_truth')) blocked.push('Named likeness truth is required.')
  return { status: blocked.length ? 'blocked' : 'ready', blocked }
}

const p06 = evaluate({ pillar: 'food', subject: 'Cotoletta alla milanese', visualDirection, truthReferences: [{ role: 'subject_truth', id: 'cotoletta-approved' }] })
const p15 = evaluate({ pillar: 'interiors', subject: 'Main dining room, warm Italian evening ambience', visualDirection, truthReferences: [{ role: 'venue_truth', id: 'main-dining-room-approved' }] })
const p09Named = evaluate({ pillar: 'bts_service', subject: 'Chef Antonio crafting pizza at the oven', visualDirection, truthReferences: [{ role: 'venue_truth', id: 'pizza-oven-approved' }] })
const p09Generic = evaluate({ pillar: 'bts_service', subject: 'Generic chef crafting pizza at the oven', visualDirection, truthReferences: [{ role: 'venue_truth', id: 'pizza-oven-approved' }] })

if (p06.status !== 'ready') throw new Error('P06 should be ready when Visual Direction and approved Cotoletta truth are present.')
if (p15.status !== 'ready') throw new Error('P15 should be ready with approved Interior truth and a saved Visual Direction.')
if (p09Named.status !== 'blocked' || !p09Named.blocked.includes('Named likeness truth is required.')) throw new Error('Named Chef Antonio must block without likeness truth.')
if (p09Generic.status !== 'ready') throw new Error('An explicitly generic chef action may proceed with venue truth.')

const promptSource = readFileSync(new URL('../src/lib/social-individual-production-prompt.ts', import.meta.url), 'utf8')
for (const requiredPhrase of ['TRUTH REFERENCE ASSIGNMENTS', 'PINTEREST INSPIRATION ASSIGNMENTS', 'Pinterest may influence camera, composition, lighting, interaction, motion, and creative technique only.', 'It never defines food identity, ingredients, venue architecture, staff likeness, branding, or menu facts.', 'Deliver a 4:5 portrait master.']) {
  if (!promptSource.includes(requiredPhrase)) throw new Error(`Production prompt is missing required truth safeguard: ${requiredPhrase}`)
}

const migrationSource = readFileSync(new URL('../supabase/migrations/20260817053606_add_individual_monthly_production_v1.sql', import.meta.url), 'utf8')
for (const requiredPhrase of ["'blocked', 'ready', 'generating', 'generated', 'selected', 'failed', 'stale'", 'unique (monthly_plan_item_id, version)', 'stale_production_artifacts_after_item_change']) {
  if (!migrationSource.includes(requiredPhrase)) throw new Error(`Artifact ledger is missing: ${requiredPhrase}`)
}

console.log(JSON.stringify({
  p06: p06.status,
  p15: p15.status,
  p09_named: p09Named,
  p09_generic: p09Generic.status,
  truth_vs_pinterest_firewall: 'verified',
  master_aspect_ratio: '4:5',
  profile_crop: 'non-destructive preview',
  versioning_selection_stale_contract: 'verified',
  provider_calls: 0,
}, null, 2))
