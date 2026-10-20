export type CaptionTruthRecord = {
  id: string
  title: string
  subsection: string
  summary?: string | null
  metadata?: Record<string, unknown> | null
  status: string
}

export type RelevantCaptionTruth = { recordId: string; visualCategory: string; fact: string }

const CATEGORY_TERMS: Record<string, string[]> = {
  gelato: ['gelato', 'ice cream', 'ice-cream', 'dessert'],
  dog: ['dog', 'dogs', 'puppy', 'pet'],
  pizza: ['pizza', 'neapolitan', 'pizzeria'],
  pasta: ['pasta'],
  breakfast: ['breakfast', 'brunch'],
  venue: ['interior', 'dining room', 'restaurant', 'terrace', 'hospitality'],
  activation: ['activation', 'campaign'],
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function values(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(values)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(values)
  return []
}
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function sentence(value: string) { return value.replace(/\s+/g, ' ').trim().slice(0, 280) }

export function visualCategoriesForCaption(input: { foodVisible?: string[]; drinkVisible?: string[]; broadScene?: string; broadMoment?: string; setting?: string }) {
  const observed = [input.broadScene, input.broadMoment, input.setting, ...(input.foodVisible ?? []), ...(input.drinkVisible ?? [])].filter(Boolean).join(' ').toLowerCase()
  return Object.entries(CATEGORY_TERMS).flatMap(([category, terms]) => terms.some(term => observed.includes(term)) ? [category] : [])
}

/**
 * Produces a small verified pack, never a whole Client Brain dump. A record is
 * considered only when it is active, not a knowledge gap, and visibly aligned
 * to an observed broad category. Exact product names are deliberately not
 * promoted from a generic pasta observation.
 */
export function matchRelevantCaptionTruth(records: CaptionTruthRecord[], visual: Parameters<typeof visualCategoriesForCaption>[0]) {
  const categories = visualCategoriesForCaption(visual)
  const matches: RelevantCaptionTruth[] = []
  for (const category of categories) {
    const terms = CATEGORY_TERMS[category] ?? []
    const candidates = records
      .filter(record => (record.status === 'active' || record.status === 'approved') && record.subsection !== 'knowledge_gaps')
      .map(record => ({ record, corpus: normalized([record.title, record.summary ?? '', ...values(record.metadata)].join(' ')) }))
      .filter(({ corpus }) => terms.some(term => corpus.includes(normalized(term))))
      .sort((a, b) => b.corpus.length - a.corpus.length)

    // Generic pasta is a creative category only. It can receive broad Italian
    // context, but does not name a precise dish unless linked elsewhere.
    if (category === 'pasta') continue
    const candidate = candidates[0]?.record
    if (!candidate) continue
    const detail = sentence(candidate.summary || candidate.title)
    if (detail) matches.push({ recordId: candidate.id, visualCategory: category, fact: detail })
  }
  return matches.slice(0, 4)
}

export function deterministicPostTitle(input: { primarySubject?: string | null; foodVisible?: string[]; broadScene?: string; broadMoment?: string }) {
  const observed = [input.broadScene, input.broadMoment, ...(input.foodVisible ?? [])].join(' ').toLowerCase()
  if (/gelato|ice cream/.test(observed)) return 'Gelato at DemoClientB'
  if (/dog|puppy/.test(observed)) return 'Dog Friendly Lunch'
  if (/pizza/.test(observed)) return 'A Pizza Moment'
  if (/pasta/.test(observed)) return 'A Pasta Moment'
  const subject = (input.primarySubject ?? '').trim().split(/\s+/).slice(0, 4).join(' ')
  return subject || 'DemoClientB Table Moment'
}

export function normalizePostTitle(value: unknown, fallback: string) {
  const words = text(value).replace(/[^\p{L}\p{N}\s&'-]/gu, '').split(/\s+/).filter(Boolean).slice(0, 5)
  return words.length >= 3 ? words.join(' ') : fallback
}
