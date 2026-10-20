export type ResearchIdentity = { canonicalName: string; nameVariants: string[]; officialDomains: string[]; officialInstagramHandles: string[]; country?: string; city?: string; area?: string; address?: string; phones: string[]; category?: string; excludedRelatedNames: string[] }
export type DiscoveryClassification = 'CLIENT_OFFICIAL' | 'CLIENT_CONFIRMED_EXTERNAL' | 'REVIEW_PLATFORM_CLIENT_MATCH' | 'COMPETITOR' | 'MARKET' | 'RELATED_ENTITY_MISMATCH' | 'AMBIGUOUS' | 'UNRELATED'
export type DiscoveryDecision = { classification: DiscoveryClassification; admitted: boolean; rejectionReason: string | null; sourceType: string; sourceQuality: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4' }
export type Discovery = { url: string; title?: string | null; excerpt?: string | null; area: string }

const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const contentOf = (item: Discovery) => normal(`${item.title ?? ''} ${item.excerpt ?? ''} ${item.url}`)
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const instagramHandle = (url: string) => { try { const parsed = new URL(url); if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null; const value = parsed.pathname.split('/').filter(Boolean)[0]; return value && !['p', 'reel', 'stories', 'explore', 'accounts'].includes(value.toLowerCase()) ? value.toLowerCase() : null } catch { return null } }

export function classifyDiscovery(item: Discovery, identity: ResearchIdentity): DiscoveryDecision {
  const text = contentOf(item); const host = hostOf(item.url); const handle = instagramHandle(item.url)
  const officialDomain = identity.officialDomains.some(domain => host === domain || host.endsWith(`.${domain}`))
  const officialHandle = handle !== null && identity.officialInstagramHandles.includes(handle)
  const related = identity.excludedRelatedNames.some(name => text.includes(normal(name))) || /\b(boat|charter|cruise|marasi bay marina|on the sea)\b/.test(text)
  if (related) return { classification: 'RELATED_ENTITY_MISMATCH', admitted: false, rejectionReason: 'related_entity_mismatch', sourceType: 'other', sourceQuality: 'tier_3' }
  if (officialDomain || officialHandle) return { classification: 'CLIENT_OFFICIAL', admitted: true, rejectionReason: null, sourceType: officialHandle ? 'social' : 'official_client', sourceQuality: 'tier_1' }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return { classification: 'AMBIGUOUS', admitted: false, rejectionReason: 'wrong_social_handle', sourceType: 'social', sourceQuality: 'tier_3' }
  if (item.area === 'market') return { classification: 'MARKET', admitted: true, rejectionReason: null, sourceType: 'market_research', sourceQuality: /\.gov(\.|$)|\.gov\.ae$/.test(host) ? 'tier_1' : 'tier_2' }
  if (item.area === 'competitor') return { classification: 'COMPETITOR', admitted: true, rejectionReason: null, sourceType: 'official_competitor', sourceQuality: 'tier_2' }
  const hasName = [identity.canonicalName, ...identity.nameVariants].some(name => text.includes(normal(name)))
  const hasDubai = Boolean(identity.city && text.includes(normal(identity.city)))
  const hasArea = Boolean(identity.area && text.includes(normal(identity.area)))
  if (hasName && /\b(abu dhabi|sharjah|riyadh|doha|new york|london|milan|rome)\b/.test(text)) return { classification: 'UNRELATED', admitted: false, rejectionReason: 'wrong_city_or_country', sourceType: 'other', sourceQuality: 'tier_4' }
  if (/tripadvisor|google\.com|zomato|yelp/.test(host) && hasName && (hasDubai || hasArea)) return { classification: 'REVIEW_PLATFORM_CLIENT_MATCH', admitted: true, rejectionReason: null, sourceType: 'review_platform', sourceQuality: 'tier_2' }
  if (hasName && hasDubai && (hasArea || /italian restaurant/.test(text))) return { classification: 'CLIENT_CONFIRMED_EXTERNAL', admitted: true, rejectionReason: null, sourceType: 'press', sourceQuality: 'tier_2' }
  if (hasName && /\b(usa|united states|new york|italy|united kingdom|london)\b/.test(text)) return { classification: 'UNRELATED', admitted: false, rejectionReason: 'wrong_country', sourceType: 'other', sourceQuality: 'tier_4' }
  return { classification: hasName ? 'AMBIGUOUS' : 'UNRELATED', admitted: false, rejectionReason: hasName ? 'insufficient_identity_evidence' : 'generic_name_collision', sourceType: 'other', sourceQuality: 'tier_4' }
}

export const ENTITY_RESOLUTION_FIXTURES = [
  ['official-domain', { url: 'https://restaurant.example/about', area: 'brand' }, 'CLIENT_OFFICIAL'],
  ['official-instagram', { url: 'https://www.instagram.com/examplerestaurant/', area: 'social' }, 'CLIENT_OFFICIAL'],
  ['random-instagram', { url: 'https://instagram.com/randomrestaurant/', area: 'social' }, 'AMBIGUOUS'],
  ['usa-collision', { url: 'https://example.com/luna-rossa-new-york', title: 'Luna Rossa New York', area: 'brand' }, 'UNRELATED'],
  ['sea-related', { url: 'https://example.com/democlientb-on-the-sea', title: 'DemoClientC private charter', area: 'brand' }, 'RELATED_ENTITY_MISMATCH'],
  ['review-match', { url: 'https://tripadvisor.com/democlientb-dubai', title: 'DemoClientB Business Bay Dubai', area: 'reputation' }, 'REVIEW_PLATFORM_CLIENT_MATCH'],
  ['directory-ambiguous', { url: 'https://directory.example/luna-rossa', title: 'Luna Rossa', area: 'brand' }, 'AMBIGUOUS'],
  ['competitor', { url: 'https://ilborro.ae', title: 'Il Borro Dubai', area: 'competitor' }, 'COMPETITOR'],
  ['market', { url: 'https://market.example/uae-full-service-restaurants', title: 'UAE Full-Service Restaurant Market', area: 'market' }, 'MARKET'],
] as const
