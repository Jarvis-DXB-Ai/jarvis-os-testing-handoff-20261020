export type OfficialMenuNameMatchType =
  | 'exact_name'
  | 'exact_alias'
  | 'token_prefix'
  | 'token_subset'
  | 'strong_fuzzy'
  | 'semantic_candidate'

export type OfficialMenuNameMatchable = {
  canonical_name: string
  normalized_name?: string | null
  aliases?: string[] | null
}

export type OfficialMenuNameMatch<T extends OfficialMenuNameMatchable> = T & {
  matchType: OfficialMenuNameMatchType
  score: number
}

export function normalizeOfficialMenuName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return normalizeOfficialMenuName(value).split(' ').filter(Boolean)
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function similarity(left: string, right: string) {
  const normalizedLeft = normalizeOfficialMenuName(left)
  const normalizedRight = normalizeOfficialMenuName(right)
  const length = Math.max(normalizedLeft.length, normalizedRight.length)
  return length ? 1 - (levenshteinDistance(normalizedLeft, normalizedRight) / length) : 0
}

function tokenCoverage(queryTokens: string[], candidateTokens: string[]) {
  if (!queryTokens.length || !candidateTokens.length) return 0
  const matched = queryTokens.filter(queryToken => candidateTokens.some(candidateToken => (
    candidateToken === queryToken
    || (queryToken.length >= 3 && candidateToken.startsWith(queryToken))
    || (candidateToken.length >= 3 && queryToken.length >= 3 && queryToken.startsWith(candidateToken))
    || (queryToken.length >= 5 && similarity(queryToken, candidateToken) >= 0.84)
  ))).length
  return matched / queryTokens.length
}

function scoreName(query: string, candidate: string) {
  const normalizedQuery = normalizeOfficialMenuName(query)
  const normalizedCandidate = normalizeOfficialMenuName(candidate)
  if (!normalizedQuery || !normalizedCandidate) return { matchType: 'semantic_candidate' as const, score: 0 }
  if (normalizedQuery === normalizedCandidate) return { matchType: 'exact_name' as const, score: 1 }

  const queryTokens = tokens(normalizedQuery)
  const candidateTokens = tokens(normalizedCandidate)
  const coverage = tokenCoverage(queryTokens, candidateTokens)
  const tokenPrefix = queryTokens.length === 1
    && candidateTokens.some(candidateToken => (
      candidateToken.startsWith(queryTokens[0])
      || (candidateToken.length >= 4 && queryTokens[0].startsWith(candidateToken))
    ))
  const candidateContainsQuery = normalizedCandidate.includes(normalizedQuery)
  const queryContainsCandidate = normalizedQuery.includes(normalizedCandidate)
  const fuzzy = similarity(normalizedQuery, normalizedCandidate)

  if (coverage === 1 && queryTokens.length >= 2) {
    return { matchType: 'token_subset' as const, score: Math.min(0.94, 0.88 + (fuzzy * 0.06)) }
  }
  if (tokenPrefix && normalizedQuery.length >= 3) {
    return { matchType: 'token_prefix' as const, score: Math.max(0.78, Math.min(0.9, 0.72 + (fuzzy * 0.2))) }
  }
  if (candidateContainsQuery && normalizedQuery.length >= 4) {
    return { matchType: 'token_subset' as const, score: Math.max(0.76, Math.min(0.89, 0.68 + (coverage * 0.14) + (fuzzy * 0.07))) }
  }
  if (queryContainsCandidate && candidateTokens.length >= 2 && coverage >= 0.7) {
    return { matchType: 'token_subset' as const, score: Math.max(0.72, Math.min(0.87, 0.65 + (coverage * 0.15) + (fuzzy * 0.07))) }
  }
  const score = (coverage * 0.68) + (fuzzy * 0.32)
  return { matchType: score >= 0.68 ? 'strong_fuzzy' as const : 'semantic_candidate' as const, score }
}

function candidateMatch<T extends OfficialMenuNameMatchable>(item: T, searchedName: string): OfficialMenuNameMatch<T> {
  const normalized = normalizeOfficialMenuName(searchedName)
  const canonicalNormalized = normalizeOfficialMenuName(item.normalized_name || item.canonical_name)
  if (canonicalNormalized === normalized) return { ...item, matchType: 'exact_name', score: 1 }

  const aliases = item.aliases ?? []
  if (aliases.some(alias => normalizeOfficialMenuName(alias) === normalized)) return { ...item, matchType: 'exact_alias', score: 0.99 }

  const best = [item.canonical_name, ...aliases]
    .map(name => scoreName(searchedName, name))
    .sort((left, right) => right.score - left.score)[0]
  return { ...item, ...best }
}

/**
 * Deterministic local ranking for current official menu items. This deliberately
 * never infers a recipe or identity beyond the supplied canonical menu records.
 */
export function rankOfficialMenuNameMatches<T extends OfficialMenuNameMatchable>(items: readonly T[], searchedName: string) {
  const normalized = normalizeOfficialMenuName(searchedName)
  if (normalized.length < 2) return [] as Array<OfficialMenuNameMatch<T>>
  return items
    .map(item => candidateMatch(item, searchedName))
    .filter(candidate => candidate.score >= 0.52)
    .sort((left, right) => right.score - left.score || left.canonical_name.localeCompare(right.canonical_name, 'en'))
    .slice(0, 5)
}
