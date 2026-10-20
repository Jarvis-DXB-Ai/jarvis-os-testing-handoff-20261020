import { buildSocialInsights, compareMetric, readMetric, SOCIAL_ANALYTICS_METRICS } from "./social-analytics-metrics"
import { isSocialPerformanceStale, type SocialPerformanceSnapshot } from "./social-performance"

function snapshot(platform: "instagram" | "facebook", overrides: Partial<SocialPerformanceSnapshot> = {}): SocialPerformanceSnapshot {
  return {
    id: `${platform}-fixture`, clientId: "fixture", provider: "zernio", platform, providerAccountId: platform,
    periodKey: "current_30d", periodStart: "2026-07-26", periodEnd: "2026-08-25", followers: platform === "instagram" ? 100 : 20,
    postReach: platform === "instagram" ? 200 : 40, impressions: platform === "instagram" ? 300 : 60, views: platform === "instagram" ? 250 : 30,
    engagements: platform === "instagram" ? 20 : 5, engagementRate: platform === "instagram" ? 2 : 1, linkClicks: platform === "instagram" ? 4 : 1,
    postsCount: 2, topPosts: [], syncedAt: "2026-08-25T00:00:00.000Z", ...overrides,
  }
}

function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }

/** Executable offline invariants; no provider, network, or database dependencies. */
export function runSocialAnalyticsMetricFixtures() {
  const current = { instagram: snapshot("instagram"), facebook: snapshot("facebook") }
  const previousPeriod = { periodKey: "previous_30d" as const, periodStart: "2026-06-25", periodEnd: "2026-07-25" }
  const previous = { instagram: snapshot("instagram", { ...previousPeriod, postReach: 100 }), facebook: snapshot("facebook", { ...previousPeriod, postReach: 20 }) }
  expect(readMetric(current, "reach").value === 240, "compatible platform reach must sum exactly")
  expect(SOCIAL_ANALYTICS_METRICS.reach.sourceField === "postReach", "reach must trace to the persisted post-reach field, never an account-reach substitute")
  expect(readMetric({ instagram: current.instagram, facebook: null }, "reach").value === null, "missing platform must not silently become zero")
  expect(readMetric(current, "impressions").value === null, "platform-specific impressions must not create a cross-platform total")
  expect(readMetric(current, "provider_engagement_rate").value === null, "provider rates must not be averaged cross-platform")
  expect(readMetric({ instagram: snapshot("instagram", { views: null }), facebook: current.facebook }, "views").value === null, "views must not fall back to impressions")
  expect(readMetric({ instagram: current.instagram, facebook: snapshot("facebook", { periodStart: "2026-07-27" }) }, "reach").value === null, "mismatched platform periods must not aggregate")
  expect(compareMetric(current, previous, "reach").percent === 100, "equal-period totals must compare on their actual values")
  expect(compareMetric(current, { instagram: snapshot("instagram", { ...previousPeriod, linkClicks: 0 }), facebook: snapshot("facebook", { ...previousPeriod, linkClicks: 0 }) }, "link_clicks").display === "absolute", "zero prior base must not produce an infinite percentage")
  expect(compareMetric(current, { instagram: snapshot("instagram", { ...previousPeriod, linkClicks: 1 }), facebook: snapshot("facebook", { ...previousPeriod, linkClicks: 1 }) }, "link_clicks").display === "absolute", "small click bases must display as absolute change")
  expect(compareMetric(current, { instagram: snapshot("instagram", { periodStart: "2026-06-20", periodEnd: "2026-07-20" }), facebook: snapshot("facebook", { periodStart: "2026-06-20", periodEnd: "2026-07-20" }) }, "reach").display === "none", "comparisons require equivalent contiguous windows")
  expect(isSocialPerformanceStale("2026-08-20T00:00:00.000Z", Date.parse("2026-08-22T01:00:00.000Z")), "stale snapshots must be identified without changing their values")
  expect(buildSocialInsights(current)[0]?.status === "actionable", "complete snapshots must support deterministic, evidenced insights")
  return "Social analytics metric fixtures passed"
}
