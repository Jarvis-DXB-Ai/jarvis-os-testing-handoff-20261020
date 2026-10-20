import { capabilityCoverage, capabilityStatus, capabilitiesForPlatform, FUTURE_ANALYTICS_CAPABILITY_FAMILIES } from "./social-analytics-capabilities"
import type { SocialPerformanceOverview } from "./social-performance"

function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }

const fixture = {
  clientId: "fixture",
  platforms: {
    instagram: { current: { followers: 100 }, previous: null },
    facebook: { current: { followers: 20 }, previous: null },
  },
  history: { instagram: [], facebook: [] },
  postObservations: [
    { id: "ig", snapshotId: "ig", platform: "instagram", providerPostId: "ig", publishedAt: null, postType: "reel", title: null, captionExcerpt: null, thumbnailPath: null, postUrl: null, likes: 2, comments: 1, shares: 1, saves: 3, clicks: 0, views: 10, impressions: 12, reach: 8, interactions: 7, engagementRate: null, nativeMetrics: { watch_time: 42, average_watch_time: 6 }, observedAt: "2026-08-26T00:00:00.000Z" },
    { id: "fb", snapshotId: "fb", platform: "facebook", providerPostId: "fb", publishedAt: null, postType: "post", title: null, captionExcerpt: null, thumbnailPath: null, postUrl: null, likes: 2, comments: 1, shares: 1, saves: null, clicks: 4, views: 9, impressions: 20, reach: 7, interactions: 4, engagementRate: null, nativeMetrics: {}, observedAt: "2026-08-26T00:00:00.000Z" },
  ],
  audience: { id: "aud", providerAccountId: "ig", periodStart: "2026-08-01", periodEnd: "2026-08-26", views: 10, reach: 9, accountsEngaged: 8, totalInteractions: 7, dataDelay: null, timeframe: "last_30_days", topCities: [{ label: "Dubai", count: 1, percent: 100 }], topCountries: [{ label: "United Arab Emirates", count: 1, percent: 100 }], ageDistribution: [{ label: "25-34", count: 1, percent: 100 }], genderDistribution: [{ label: "Women", count: 1, percent: 100 }], nativeMetrics: { follows_and_unfollows: 4, profile_link_taps: 3 }, fetchedAt: "2026-08-26T00:00:00.000Z" },
  followerObservations: [{ id: "f", platform: "instagram", date: "2026-08-26", followers: 100, followersGained: 4, followersLost: 1, observedAt: "2026-08-26T00:00:00.000Z" }],
  postingFrequency: [],
  lastSyncedAt: "2026-08-26T00:00:00.000Z",
} as unknown as SocialPerformanceOverview

/** Executable offline invariants; no provider, network, or database dependencies. */
export function runSocialAnalyticsCapabilityFixtures() {
  expect(capabilityStatus("instagram", "instagram.post.watch_time", fixture).cachedAvailability === "available", "native Reel watch time must be represented and cache-aware")
  expect(capabilityStatus("instagram", "instagram.account.profile_link_taps", fixture).cachedAvailability === "available", "account-native profile taps must not be collapsed into post clicks")
  expect(capabilityStatus("facebook", "facebook.page.media_views", fixture).cachedAvailability === "unavailable", "supported Facebook Page Insights must remain distinct from absent cache data")
  expect(capabilityStatus("facebook", "facebook.post.saves", fixture).providerCapability === "unsupported", "an unsupported Facebook save field must not be fabricated")
  expect(capabilitiesForPlatform("instagram", fixture).some(item => item.id === "instagram.post.saves" && !item.crossPlatform), "Instagram saves must remain native rather than forcing a Facebook equivalent")
  expect(capabilityCoverage("instagram", fixture).available > 0, "coverage must report cached evidence separately from support")
  expect(FUTURE_ANALYTICS_CAPABILITY_FAMILIES.find(item => item.platform === "whatsapp")?.scopes.includes("message"), "WhatsApp must enter through message scope, not organic post scope")
  return "Social analytics capability fixtures passed"
}
