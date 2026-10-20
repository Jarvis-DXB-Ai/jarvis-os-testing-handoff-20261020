import type { SocialPerformanceOverview, SocialPerformancePlatform } from "./social-performance"

/**
 * The provider capability inventory is deliberately separate from the compact
 * cross-platform KPI registry. A capability may be supported by Zernio yet be
 * unavailable locally until an explicit refresh has retained its observation.
 */
export type AnalyticsCapabilityPlatform = SocialPerformancePlatform | "whatsapp" | "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads" | "pinterest_ads" | "x_ads"
export type AnalyticsCapabilityScope = "post" | "account" | "page" | "audience" | "message" | "campaign" | "ad_set" | "ad" | "breakdown"
export type AnalyticsCapabilityUnit = "count" | "duration_seconds" | "currency" | "percent" | "rate" | "dimension"
export type AnalyticsCapabilityAggregation = "sum" | "latest" | "provider_native" | "not_aggregatable"
export type ProviderCapabilityStatus = "supported" | "unsupported" | "planned"
export type CachedAvailability = "available" | "unavailable" | "not_applicable"

type CacheLocation =
  | `post:${"likes" | "comments" | "shares" | "saves" | "clicks" | "views" | "impressions" | "reach" | "watch_time" | "average_watch_time"}`
  | `snapshot:${"followers"}`
  | `audience:${"views" | "reach" | "accounts_engaged" | "total_interactions" | "follows_and_unfollows" | "profile_link_taps" | "cities" | "countries" | "age" | "gender"}`
  | `follower_history:${"followers" | "followers_gained" | "followers_lost"}`
  | "not_persisted"

export type SocialAnalyticsCapability = {
  id: string
  platform: AnalyticsCapabilityPlatform
  canonicalMetric?: "followers" | "reach" | "impressions" | "views" | "likes" | "comments" | "shares" | "clicks"
  label: string
  scope: AnalyticsCapabilityScope
  unit: AnalyticsCapabilityUnit
  aggregation: AnalyticsCapabilityAggregation
  hasHistory: boolean
  periodComparison: boolean
  crossPlatform: boolean
  provider: "zernio"
  providerSource: string
  sourceUrl: string
  providerCapability: ProviderCapabilityStatus
  lastVerified: string
  cacheLocation: CacheLocation
}

const INSTAGRAM_DOCS = "https://docs.zernio.com/platforms/instagram"
const FACEBOOK_DOCS = "https://docs.zernio.com/platforms/facebook"
const PLATFORM_DOCS = "https://docs.zernio.com/platforms"
const ADS_DOCS = "https://docs.zernio.com/connect/connect-ads"
const VERIFIED_ON = "2026-08-26"

function capability(input: Omit<SocialAnalyticsCapability, "provider" | "lastVerified">): SocialAnalyticsCapability {
  return { provider: "zernio", lastVerified: VERIFIED_ON, ...input }
}

const instagramPost = (id: string, label: string, canonicalMetric: SocialAnalyticsCapability["canonicalMetric"], cacheLocation: CacheLocation, unit: AnalyticsCapabilityUnit = "count", aggregation: AnalyticsCapabilityAggregation = "sum") => capability({ id, platform: "instagram", canonicalMetric, label, scope: "post", unit, aggregation, hasHistory: false, periodComparison: true, crossPlatform: canonicalMetric !== undefined && !["impressions"].includes(canonicalMetric), providerSource: "GET /v1/analytics?platform=instagram", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation })
const facebookPost = (id: string, label: string, canonicalMetric: SocialAnalyticsCapability["canonicalMetric"], cacheLocation: CacheLocation) => capability({ id, platform: "facebook", canonicalMetric, label, scope: "post", unit: "count", aggregation: "sum", hasHistory: false, periodComparison: true, crossPlatform: canonicalMetric !== undefined && canonicalMetric !== "impressions", providerSource: "GET /v1/analytics?platform=facebook", sourceUrl: FACEBOOK_DOCS, providerCapability: "supported", cacheLocation })

/** Official documentation plus the exact current Zernio endpoint inventory. */
export const SOCIAL_ANALYTICS_CAPABILITIES: readonly SocialAnalyticsCapability[] = [
  instagramPost("instagram.post.impressions", "Impressions", "impressions", "post:impressions"),
  instagramPost("instagram.post.reach", "Reach", "reach", "post:reach"),
  instagramPost("instagram.post.likes", "Likes", "likes", "post:likes"),
  instagramPost("instagram.post.comments", "Comments", "comments", "post:comments"),
  instagramPost("instagram.post.shares", "Shares", "shares", "post:shares"),
  instagramPost("instagram.post.saves", "Saves", undefined, "post:saves"),
  instagramPost("instagram.post.views", "Views", "views", "post:views"),
  instagramPost("instagram.post.clicks", "Clicks", "clicks", "post:clicks"),
  capability({ id: "instagram.post.watch_time", platform: "instagram", label: "Reel watch time", scope: "post", unit: "duration_seconds", aggregation: "sum", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "Zernio /analytics native Reel fields when returned", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "post:watch_time" }),
  capability({ id: "instagram.post.average_watch_time", platform: "instagram", label: "Reel average watch time", scope: "post", unit: "duration_seconds", aggregation: "provider_native", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "Zernio /analytics native Reel fields when returned", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "post:average_watch_time" }),
  capability({ id: "instagram.account.reach", platform: "instagram", canonicalMetric: "reach", label: "Account reach", scope: "account", unit: "count", aggregation: "provider_native", hasHistory: true, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/account-insights", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "audience:reach" }),
  capability({ id: "instagram.account.views", platform: "instagram", canonicalMetric: "views", label: "Account views", scope: "account", unit: "count", aggregation: "provider_native", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/account-insights", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "audience:views" }),
  capability({ id: "instagram.account.accounts_engaged", platform: "instagram", label: "Accounts engaged", scope: "account", unit: "count", aggregation: "provider_native", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/account-insights", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "audience:accounts_engaged" }),
  capability({ id: "instagram.account.total_interactions", platform: "instagram", label: "Total interactions", scope: "account", unit: "count", aggregation: "provider_native", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/account-insights", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "audience:total_interactions" }),
  capability({ id: "instagram.account.follows_and_unfollows", platform: "instagram", label: "Follows and unfollows", scope: "account", unit: "count", aggregation: "provider_native", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/account-insights", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "audience:follows_and_unfollows" }),
  capability({ id: "instagram.account.profile_link_taps", platform: "instagram", label: "Profile link taps", scope: "account", unit: "count", aggregation: "provider_native", hasHistory: false, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/account-insights", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: "audience:profile_link_taps" }),
  ...(["followers", "followers_gained", "followers_lost"] as const).map(metric => capability({ id: `instagram.follower_history.${metric}`, platform: "instagram", canonicalMetric: metric === "followers" ? "followers" : undefined, label: metric === "followers" ? "Daily follower count" : metric === "followers_gained" ? "Followers gained" : "Followers lost", scope: "account", unit: "count", aggregation: metric === "followers" ? "latest" : "sum", hasHistory: true, periodComparison: true, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/follower-history", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: `follower_history:${metric}` })),
  ...(["cities", "countries", "age", "gender"] as const).map(dimension => capability({ id: `instagram.audience.${dimension}`, platform: "instagram", label: `Audience ${dimension}`, scope: "audience", unit: "dimension", aggregation: "provider_native", hasHistory: false, periodComparison: false, crossPlatform: false, providerSource: "GET /v1/analytics/instagram/demographics", sourceUrl: INSTAGRAM_DOCS, providerCapability: "supported", cacheLocation: `audience:${dimension}` })),
  facebookPost("facebook.post.impressions", "Impressions", "impressions", "post:impressions"),
  facebookPost("facebook.post.likes", "Likes", "likes", "post:likes"),
  facebookPost("facebook.post.comments", "Comments", "comments", "post:comments"),
  facebookPost("facebook.post.shares", "Shares", "shares", "post:shares"),
  facebookPost("facebook.post.clicks", "Clicks", "clicks", "post:clicks"),
  facebookPost("facebook.post.views", "Views", "views", "post:views"),
  capability({ id: "facebook.post.reach", platform: "facebook", canonicalMetric: "reach", label: "Reach", scope: "post", unit: "count", aggregation: "sum", hasHistory: false, periodComparison: true, crossPlatform: true, providerSource: "Zernio /analytics conditional field; only shown when returned", sourceUrl: FACEBOOK_DOCS, providerCapability: "supported", cacheLocation: "post:reach" }),
  ...(["media_views", "post_engagements", "video_metrics", "follower_count", "followers_gained", "followers_lost"] as const).map(metric => capability({ id: `facebook.page.${metric}`, platform: "facebook", label: metric.replaceAll("_", " "), scope: "page", unit: "count", aggregation: metric === "follower_count" ? "latest" : "provider_native", hasHistory: metric.includes("follower"), periodComparison: true, crossPlatform: false, providerSource: "Facebook Page Insights API / Zernio follower snapshotter", sourceUrl: FACEBOOK_DOCS, providerCapability: "supported", cacheLocation: "not_persisted" })),
]

export type CapabilityState = SocialAnalyticsCapability & { cachedAvailability: CachedAvailability }

function hasFinite(value: unknown) { return typeof value === "number" && Number.isFinite(value) }
function anyPost(performance: SocialPerformanceOverview, platform: SocialPerformancePlatform, field: CacheLocation) {
  const key = field.slice("post:".length)
  return performance.postObservations.some(post => post.platform === platform && (key === "watch_time" || key === "average_watch_time" ? hasFinite(post.nativeMetrics?.[key]) : hasFinite(post[key as keyof typeof post])))
}

export function cachedAvailability(capability: SocialAnalyticsCapability, performance: SocialPerformanceOverview | null | undefined): CachedAvailability {
  if (capability.providerCapability !== "supported") return "not_applicable"
  if (!performance || capability.cacheLocation === "not_persisted") return "unavailable"
  const location = capability.cacheLocation
  if (location.startsWith("post:")) return anyPost(performance, capability.platform as SocialPerformancePlatform, location) ? "available" : "unavailable"
  if (location === "snapshot:followers") return hasFinite(performance.platforms[capability.platform as SocialPerformancePlatform]?.current?.followers) ? "available" : "unavailable"
  if (location.startsWith("follower_history:")) {
    const key = location.slice("follower_history:".length)
    return performance.followerObservations.some(row => row.platform === capability.platform && hasFinite(row[key as keyof typeof row])) ? "available" : "unavailable"
  }
  const audience = performance.audience
  if (!audience) return "unavailable"
  const key = location.slice("audience:".length)
  if (key === "cities") return audience.topCities.length ? "available" : "unavailable"
  if (key === "countries") return audience.topCountries.length ? "available" : "unavailable"
  if (key === "age") return audience.ageDistribution.length ? "available" : "unavailable"
  if (key === "gender") return audience.genderDistribution.length ? "available" : "unavailable"
  if (key === "follows_and_unfollows" || key === "profile_link_taps") return hasFinite(audience.nativeMetrics?.[key]) ? "available" : "unavailable"
  return hasFinite(audience[{ views: "views", reach: "reach", accounts_engaged: "accountsEngaged", total_interactions: "totalInteractions" }[key] as keyof typeof audience]) ? "available" : "unavailable"
}

export function capabilitiesForPlatform(platform: AnalyticsCapabilityPlatform, performance?: SocialPerformanceOverview | null): CapabilityState[] {
  return SOCIAL_ANALYTICS_CAPABILITIES.filter(item => item.platform === platform).map(item => ({ ...item, cachedAvailability: cachedAvailability(item, performance) }))
}

export function capabilityStatus(platform: AnalyticsCapabilityPlatform, id: string, performance?: SocialPerformanceOverview | null): CapabilityState | { platform: AnalyticsCapabilityPlatform; id: string; providerCapability: "unsupported"; cachedAvailability: "not_applicable" } {
  const found = SOCIAL_ANALYTICS_CAPABILITIES.find(item => item.platform === platform && item.id === id)
  return found ? { ...found, cachedAvailability: cachedAvailability(found, performance) } : { platform, id, providerCapability: "unsupported", cachedAvailability: "not_applicable" }
}

export function capabilityCoverage(platform: SocialPerformancePlatform, performance?: SocialPerformanceOverview | null) {
  const capabilities = capabilitiesForPlatform(platform, performance)
  return { supported: capabilities.filter(item => item.providerCapability === "supported").length, available: capabilities.filter(item => item.cachedAvailability === "available").length, unavailable: capabilities.filter(item => item.cachedAvailability === "unavailable").length }
}

/** Future families have no provider availability until their own module is connected. */
export const FUTURE_ANALYTICS_CAPABILITY_FAMILIES = [
  { platform: "whatsapp", scopes: ["message", "account"] as AnalyticsCapabilityScope[], metrics: ["sent", "delivered", "read", "failed", "conversation_volume", "response_time"], sourceUrl: PLATFORM_DOCS },
  { platform: "meta_ads", scopes: ["campaign", "ad_set", "ad", "breakdown"] as AnalyticsCapabilityScope[], metrics: ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions", "cost_per_conversion", "actions", "placements", "demographics"], sourceUrl: ADS_DOCS },
  ...(["google_ads", "tiktok_ads", "linkedin_ads", "pinterest_ads", "x_ads"] as const).map(platform => ({ platform, scopes: ["campaign", "ad_set", "ad", "breakdown"] as AnalyticsCapabilityScope[], metrics: ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions", "cost_per_conversion"], sourceUrl: ADS_DOCS })),
] as const
