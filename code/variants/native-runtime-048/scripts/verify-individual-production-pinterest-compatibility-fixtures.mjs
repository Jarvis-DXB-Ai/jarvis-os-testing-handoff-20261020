import { assessIndividualProductionPinterestCompatibility } from '../src/lib/social-individual-production-pinterest-compatibility.ts'

const fixtures = [
  ['food hero rejects woman cocktail portrait', { pillar: 'food', subject: 'burratina con pomodorini', humanPresence: 'none', interaction: 'none', motion: 'static', brief: 'close three-quarter asymmetrical food hero' }, { creative_categories: ['lifestyle', 'people', 'drink'], human_presence: 'single_person', interaction: 'toasting_raising_glasses', motion: 'subtle', best_for: ['lifestyle'] }, 'incompatible', false],
  ['food hero accepts plated food still life', { pillar: 'food', subject: 'burratina con pomodorini', humanPresence: 'none', interaction: 'none', motion: 'static', brief: 'close three-quarter asymmetrical food hero' }, { creative_categories: ['food'], human_presence: 'none', interaction: 'none', motion: 'static', best_for: ['food_hero', 'editorial_still_life'] }, 'compatible', true],
  ['couple conversation rejects single portrait', { pillar: 'lifestyle', subject: 'dog-friendly lounge', humanPresence: 'couple', interaction: 'conversation', motion: 'subtle', brief: 'warm ambient evening' }, { creative_categories: ['lifestyle', 'people'], human_presence: 'single_person', interaction: 'conversation', motion: 'subtle', best_for: ['lifestyle'] }, 'incompatible', false],
  ['couple conversation accepts couple dining', { pillar: 'lifestyle', subject: 'Italian evening', humanPresence: 'couple', interaction: 'conversation', motion: 'subtle', brief: 'warm ambient venue' }, { creative_categories: ['lifestyle', 'people'], human_presence: 'couple', interaction: 'conversation', motion: 'subtle', best_for: ['social_dining'] }, 'compatible', true],
  ['drink pour limits sauce pour to technique fallback', { pillar: 'drinks', subject: 'Negroni', humanPresence: 'hands_only', interaction: 'pouring', motion: 'active', brief: 'drink pour' }, { creative_categories: ['food'], human_presence: 'hands_only', interaction: 'pouring', motion: 'active', best_for: ['food_action'] }, 'technique_fallback', false],
]

for (const [name, target, candidate, classification, automatic] of fixtures) {
  const result = assessIndividualProductionPinterestCompatibility(target, candidate)
  if (result.classification !== classification || result.automatic_eligible !== automatic) throw new Error(`${name}: received ${JSON.stringify(result)}`)
  console.log(`PASS ${name}: ${result.classification}`)
}

console.log(`PASS ${fixtures.length} Pinterest semantic compatibility fixtures`)
