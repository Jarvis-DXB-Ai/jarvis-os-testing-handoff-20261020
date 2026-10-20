import type { AnalyticsResource } from "./social-analytics-catalog"
export type SocialPerformancePlatform = "instagram" | "facebook"
export type SocialPerformancePeriodKey = "current_30d" | "previous_30d"

/**
 * A local, immutable copy of one post's returned analytics at the time an
 * explicit Social Insights refresh completed. Provider media URLs are never
 * exposed to the dashboard; only a controlled local thumbnail path is kept.
 */
export type SocialPerformancePostObservation = {
  id: string
  snapshotId: string
  platform: SocialPerformancePlatform
  providerPostId: string
  executionId: string | null
  executionTargetId: string | null
  publishedAt: string | null
  postType: string
  title: string | null
  captionExcerpt: string | null
  thumbnailPath: string | null
  postUrl: string | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  clicks: number | null
  views: number | null
  impressions: number | null
  reach: number | null
  interactions: number | null
  engagementRate: number | null
  /** Provider-native fields (for example Reel watch time), never cross-platform KPIs. */
  nativeMetrics: Record<string, number>
  analyticsDetails?: Record<string, unknown>
  observedAt: string
}

export type SocialAudienceSnapshot = {
  id: string
  providerAccountId: string
  periodStart: string
  periodEnd: string
  views: number | null
  reach: number | null
  accountsEngaged: number | null
  totalInteractions: number | null
  dataDelay: string | null
  timeframe: string | null
  topCities: Array<{ label: string; count: number; percent: number }>
  topCountries: Array<{ label: string; count: number; percent: number }>
  ageDistribution: Array<{ label: string; count: number; percent: number }>
  genderDistribution: Array<{ label: string; count: number; percent: number }>
  /** Provider-native account fields (for example profile link taps). */
  nativeMetrics: Record<string, number>
  fetchedAt: string
}
export type SocialFollowerObservation = { id: string; platform: SocialPerformancePlatform; date: string; followers: number; followersGained: number | null; followersLost: number | null; observedAt: string }
export type SocialPostingFrequencyObservation = { id: string; platform: SocialPerformancePlatform; postsPerWeek: number; averageEngagementRate: number | null; averageEngagement: number | null; weeksCount: number; observedAt: string }

export type SocialPerformanceSnapshot = {
  id: string
  clientId: string
  provider: "zernio"
  platform: SocialPerformancePlatform
  providerAccountId: string
  periodKey: SocialPerformancePeriodKey
  periodStart: string
  periodEnd: string
  followers: number | null
  postReach: number | null
  impressions: number | null
  views: number | null
  engagements: number | null
  engagementRate: number | null
  linkClicks: number | null
  postsCount: number
  topPosts: Array<{
    id: string
    publishedAt: string | null
    postType: string
    views: number | null
    impressions: number | null
    interactions: number | null
    reach: number | null
    engagementRate: number | null
    title?: string | null
    captionExcerpt?: string | null
    /** Local cache only. Provider thumbnail URLs must never be rendered by the dashboard. */
    thumbnailPath?: string | null
    postUrl?: string | null
  }>
  analyticsResources?: AnalyticsResource[]
  metricProvenance?: Record<string, unknown>
  syncedAt: string
}

export type SocialPerformancePlatformOverview = {
  current: SocialPerformanceSnapshot | null
  previous: SocialPerformanceSnapshot | null
}

export type SocialPerformanceOverview = {
  clientId: string
  platforms: Record<SocialPerformancePlatform, SocialPerformancePlatformOverview>
  // These are local sync checkpoints only; they never cause a provider read.
  history: Record<SocialPerformancePlatform, SocialPerformanceSnapshot[]>
  /** Full post observations exist only after an explicit refresh on V2. */
  postObservations: SocialPerformancePostObservation[]
  /** Instagram account/demographic scope, intentionally separate from post aggregates. */
  audience: SocialAudienceSnapshot | null
  followerObservations: SocialFollowerObservation[]
  postingFrequency: SocialPostingFrequencyObservation[]
  lastSyncedAt: string | null
}

export function percentageChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export function isSocialPerformanceStale(lastSyncedAt: string | null, now = Date.now()) {
  if (!lastSyncedAt) return false
  const timestamp = new Date(lastSyncedAt).getTime()
  return Number.isFinite(timestamp) && now - timestamp > 48 * 60 * 60 * 1000
}
