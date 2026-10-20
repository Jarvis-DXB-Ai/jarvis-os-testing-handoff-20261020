import assert from "node:assert/strict"

import { buildDeterministicSocialIntelligence, deterministicSocialIntelligenceRevision } from "../src/lib/social-intelligence.ts"

const clientId = "a7604343-92d7-56ec-bf35-b272cac7f8b7"
const snapshot = (id, platform, key, start, end, reach, views, engagements, postsCount) => ({ id, clientId, provider: "zernio", platform, periodKey: key, periodStart: start, periodEnd: end, followers: null, postReach: reach, impressions: null, views, engagements, engagementRate: null, linkClicks: null, postsCount, topPosts: [], syncedAt: `2026-08-26T10:${id.slice(-2).padStart(2, "0")}:00.000Z` })
const post = (id, snapshotId, platform, reach, shares = 0, saves = 0, postType = "post") => ({ id, snapshotId, platform, providerPostId: `provider-${id}`, executionId: null, executionTargetId: null, publishedAt: "2026-08-10T07:00:00.000Z", postType, title: null, captionExcerpt: null, thumbnailPath: null, postUrl: null, likes: 5, comments: 1, shares, saves, clicks: 0, views: reach * 2, impressions: reach * 2, reach, interactions: 6 + shares + saves, engagementRate: null, nativeMetrics: {}, observedAt: "2026-08-26T10:00:00.000Z" })

function performanceFixture() {
  const instagramCurrent = snapshot("325f9e9f-f615-56d8-b2d1-c44632d53d64", "instagram", "current_30d", "2026-07-28", "2026-08-26", 14445, 24597, 614, 6)
  const facebookCurrent = snapshot("73bccc8d-2d13-5a30-956b-188f41e5553a", "facebook", "current_30d", "2026-07-28", "2026-08-26", 494, 23, 15, 6)
  const instagramPrevious = snapshot("663ddc79-e931-53df-8507-7d277b95ae8b", "instagram", "previous_30d", "2026-06-28", "2026-07-27", 6134, 9879, 150, 6)
  const facebookPrevious = snapshot("fefcf7f6-7f3a-5aa6-b769-016661b3b420", "facebook", "previous_30d", "2026-06-28", "2026-07-27", 1050, 0, 5, 6)
  const igPosts = [250, 330, 380, 450, 5650, 511].map((reach, index) => post(`ig-${index}`, instagramCurrent.id, "instagram", reach, index === 4 ? 117 : index % 2, index === 4 ? 60 : 1))
  const fbPosts = [22, 19, 11, 37, 31, 25].map((reach, index) => post(`fb-${index}`, facebookCurrent.id, "facebook", reach))
  return {
    clientId,
    platforms: { instagram: { current: instagramCurrent, previous: instagramPrevious }, facebook: { current: facebookCurrent, previous: facebookPrevious } },
    history: { instagram: [instagramCurrent], facebook: [facebookCurrent] },
    postObservations: [...igPosts, ...fbPosts],
    audience: { id: "ac4989e2-4ee2-59a2-90df-fa1cb35a9731", providerAccountId: "ig", periodStart: "2026-07-28", periodEnd: "2026-08-26", views: null, reach: null, accountsEngaged: null, totalInteractions: null, dataDelay: null, timeframe: "last_30_days", topCities: [{ label: "Dubai", count: 2137, percent: 64.7 }], topCountries: [{ label: "United Arab Emirates", count: 2572, percent: 42.7 }], ageDistribution: [{ label: "35-44", count: 2271, percent: 36.2 }], genderDistribution: [], nativeMetrics: {}, fetchedAt: "2026-08-26T10:00:00.000Z" },
    followerObservations: Array.from({ length: 50 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, platform: "instagram", date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`, followers: 6200 + index, followersGained: 1, followersLost: 0, observedAt: "2026-08-26T10:00:00.000Z" })),
    postingFrequency: [{ id: "842f76ec-9d98-5f54-a36d-8a868ed4096a", platform: "instagram", postsPerWeek: 3, averageEngagementRate: 1, averageEngagement: 20, weeksCount: 4, observedAt: "2026-08-26T10:00:00.000Z" }],
    lastSyncedAt: "2026-08-26T10:00:00.000Z",
  }
}

const baseline = performanceFixture()
const artifact = buildDeterministicSocialIntelligence(baseline)
assert.equal(artifact.deterministic, true)
assert.equal(artifact.source_manifest.provider_calls, 0)
assert.equal(artifact.source_manifest.model_calls, 0)
assert(artifact.evidence.some(entry => entry.signal_key === "instagram_reach_contribution"))
assert(artifact.evidence.some(entry => entry.signal_key === "instagram_reach_period_change"))
assert(artifact.experiments.some(item => item.title.includes("share outlier")))
assert(artifact.data_gaps.some(item => item.title.includes("Format comparison")))
assert.equal(artifact.working.some(item => /pet|food|lifestyle|promotional|event/i.test(item.statement)), false)
assert.equal(artifact.evidence.some(entry => entry.method.includes("impressions or views")), true)

const noPrevious = performanceFixture(); noPrevious.platforms.instagram.previous = null
assert.equal(buildDeterministicSocialIntelligence(noPrevious).evidence.some(entry => entry.signal_key === "instagram_reach_period_change"), false)

const incompatiblePeriods = performanceFixture(); incompatiblePeriods.platforms.instagram.previous.periodEnd = "2026-07-26"
assert.equal(buildDeterministicSocialIntelligence(incompatiblePeriods).evidence.some(entry => entry.signal_key === "instagram_reach_period_change"), false)

const missingPlatformReach = performanceFixture(); missingPlatformReach.platforms.facebook.current.postReach = null
assert.equal(buildDeterministicSocialIntelligence(missingPlatformReach).evidence.some(entry => entry.signal_key === "instagram_reach_contribution"), false)

const tinySample = performanceFixture(); tinySample.postObservations = tinySample.postObservations.filter(item => item.platform === "facebook" || item.providerPostId.endsWith("0"))
assert.equal(buildDeterministicSocialIntelligence(tinySample).experiments.some(item => item.title.includes("top-post pattern")), false)

const revisionA = deterministicSocialIntelligenceRevision(baseline)
const revisionB = deterministicSocialIntelligenceRevision(performanceFixture())
assert.equal(revisionA, revisionB)
const revised = performanceFixture(); revised.postObservations[0].observedAt = "2026-08-27T10:00:00.000Z"
assert.notEqual(revisionA, deterministicSocialIntelligenceRevision(revised))

console.log("Social Intelligence Agent offline fixtures passed: isolation-friendly cache analysis, period compatibility, null handling, outlier confidence, idempotency revision, and zero provider/model calls.")
