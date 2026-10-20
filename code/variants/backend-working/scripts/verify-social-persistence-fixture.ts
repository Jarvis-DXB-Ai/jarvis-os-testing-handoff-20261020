import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { persistAudienceSnapshot, persistFollowerHistory, persistPostObservations, persistPostingFrequency } from "../src/lib/social-performance-server"
import type { SocialPostPerformance } from "../src/lib/zernio"
import { sanitizeProviderJson } from "../src/lib/provider-unicode"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Missing Supabase service credentials")
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const fixtureId = randomUUID()
const report: Record<string, unknown> = { fixtureClientId: fixtureId, providerCalls: 0, aiCalls: 0, providerWrites: 0, publishingScheduling: 0, spendUsd: 0 }
const tables = ["social_provider_connections", "social_performance_snapshots", "social_performance_post_observations", "social_follower_observations", "social_posting_frequency_snapshots", "social_audience_snapshots", "social_refresh_diagnostics", "client_brain_v2_records", "social_content_items"]

async function count(clientId: string) {
  const output: Record<string, number> = {}
  for (const table of tables) { const { count: value, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("client_id", clientId); if (error) throw error; output[table] = value ?? 0 }
  return output
}
async function snapshot(platform: "instagram" | "facebook", periodKey: "current_30d" | "previous_30d", start: string, end: string) {
  const { data, error } = await db.from("social_performance_snapshots").insert({ client_id: fixtureId, provider: "zernio", platform, provider_account_id: `fixture-${platform}-account`, period_key: periodKey, period_start: start, period_end: end, posts_count: 0, top_posts: [], provider_summary: { fixture: true }, metric_provenance: { fixture: true }, synced_at: "2026-08-26T10:00:00.000Z" }).select("id").single()
  if (error || !data) throw error ?? new Error("Could not create fixture snapshot")
  return data.id as string
}
const post = (snapshotId: string, platform: "instagram" | "facebook", postId: string, patch: Partial<SocialPostPerformance> = {}): SocialPostPerformance & { snapshotId: string; platform: "instagram" | "facebook"; observedAt: string } => ({
  snapshotId, observedAt: "2026-08-26T10:00:00.000Z", createdAt: "2026-08-20T12:00:00.000Z", postId, postType: "post", title: null, caption: "Fixture caption ✨", cachedThumbnailPath: "social-performance-cache/fixture-thumb.jpg", platformUrl: null, postUrl: null,
  likes: 7, comments: 0, shares: undefined, saves: 2, clicks: 0, views: 101, impressions: 202, reach: 77, engagementRate: 3.5, publishedAt: "2026-08-20T12:00:00.000Z", ...patch, platform,
})

export async function runSocialPersistenceFixture() {
  try {
  const { data: democlientb, error: democlientbError } = await db.from("clients").select("id,name").ilike("name", "%DemoClientB%").order("name")
  if (democlientbError) throw democlientbError
  const democlientbIds = (democlientb ?? []).map(row => row.id as string)
  report.democlientbBefore = Object.fromEntries(await Promise.all(democlientbIds.map(async id => [id, await count(id)])))
  const { error: createError } = await db.from("clients").insert({ id: fixtureId, name: "__JARVIS_SOCIAL_PERSISTENCE_FIXTURE__", industry: "fixture", status: "archived" })
  if (createError) throw createError
  report.isolation = { unique: fixtureId !== democlientbIds[0] && fixtureId !== democlientbIds[1], democlientbIds, initialRows: await count(fixtureId) }
  const malformedUnicode = { title: "Valid Arabic مرحبا", caption: "Provider reel\uDC00", nested: [{ label: "emoji 😀" }] }
  const { error: rawUnicodeError } = await db.from("social_refresh_diagnostics").insert({ client_id: fixtureId, provider: "zernio", stage: "unicode_pre_fix_fixture", diagnostic: malformedUnicode })
  report.unicodePreFix = { code: rawUnicodeError?.code ?? null, message: rawUnicodeError?.message ?? null, details: rawUnicodeError?.details ?? null }
  const sanitizedUnicode = sanitizeProviderJson(malformedUnicode)
  const { error: sanitizedUnicodeError } = await db.from("social_refresh_diagnostics").insert({ client_id: fixtureId, provider: "zernio", stage: "unicode_post_fix_fixture", diagnostic: sanitizedUnicode.value })
  report.unicodePostFix = { persisted: !sanitizedUnicodeError, paths: sanitizedUnicode.paths, sanitizedValue: sanitizedUnicode.value }
  const snapshotOne = await snapshot("instagram", "current_30d", "2026-08-01", "2026-08-30")
  const snapshotFacebook = await snapshot("facebook", "current_30d", "2026-08-01", "2026-08-30")
  await persistPostObservations(fixtureId, [post(snapshotOne, "instagram", "fixture-image"), post(snapshotOne, "instagram", "6a8d750a77555aae014632fe", { postType: "reel", views: 0, impressions: undefined, shares: 4, title: "Fixture reel\uDC00", caption: "Long fixture caption 😀 \uDC00" + "x".repeat(520) }), post(snapshotOne, "instagram", "fixture-carousel", { postType: "carousel", cachedThumbnailPath: undefined, caption: undefined, publishedAt: undefined }), post(snapshotFacebook, "facebook", "fixture-facebook", { postType: "post", saves: undefined, views: 44, impressions: 55, reach: 33 })])
  await persistPostObservations(fixtureId, [post(snapshotOne, "instagram", "fixture-dedup", { views: 11 }), post(snapshotOne, "instagram", "fixture-dedup", { views: 99 })])
  const { data: dedup } = await db.from("social_performance_post_observations").select("views").eq("snapshot_id", snapshotOne).eq("provider_post_id", "fixture-dedup").single()
  report.dedup = { storedRows: 1, winningViews: dedup?.views, rule: "first incoming row wins" }
  try { await persistPostObservations(fixtureId, [post(snapshotOne, "instagram", "fixture-image")], { bypassDedupe: true }) } catch { /* expected unique error is recorded durably */ }
  const { data: diagnostic, error: diagnosticError } = await db.from("social_refresh_diagnostics").select("diagnostic").eq("client_id", fixtureId).eq("stage", "post_observations").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (diagnosticError || !diagnostic) throw diagnosticError ?? new Error("Expected duplicate diagnostic was not retained")
  report.diagnostic = diagnostic.diagnostic
  const snapshotTwo = await snapshot("instagram", "previous_30d", "2026-07-01", "2026-07-30")
  await persistPostObservations(fixtureId, [post(snapshotTwo, "instagram", "fixture-image", { views: 909, impressions: 808 })])
  const { data: immutableRows } = await db.from("social_performance_post_observations").select("snapshot_id,views,impressions").eq("provider_post_id", "fixture-image").eq("client_id", fixtureId).order("snapshot_id")
  report.immutability = immutableRows
  const malformed: Record<string, string> = {}
  for (const value of [null, "", "   ", "undefined"] as Array<string | null>) { try { await persistPostObservations(fixtureId, [post(snapshotOne, "instagram", value as string)]); malformed[String(value)] = "unexpected success" } catch (error) { malformed[String(value)] = error instanceof Error ? error.message : "rejected" } }
  report.malformedProviderIds = malformed
  await persistPostObservations(fixtureId, [post(snapshotOne, "instagram", "fixture-edge", { likes: Number.NaN, comments: Number.POSITIVE_INFINITY, shares: Number.NEGATIVE_INFINITY, saves: 0, clicks: undefined, views: 12.5, impressions: 0, reach: undefined, publishedAt: "not-a-date" })])
  const { data: edge } = await db.from("social_performance_post_observations").select("likes,comments,shares,saves,clicks,views,impressions,reach,published_at").eq("snapshot_id", snapshotOne).eq("provider_post_id", "fixture-edge").single()
  report.numericAndTimestamp = edge
  await persistFollowerHistory(fixtureId, [
    { accountId: "fixture-instagram-account", platform: "instagram", date: "2026-08-01", followers: 1000, followersGained: null, followersLost: null },
    { accountId: "fixture-instagram-account", platform: "instagram", date: "2026-08-02", followers: 1004, followersGained: 4, followersLost: 0 },
    { accountId: "fixture-instagram-account", platform: "instagram", date: "2026-08-03", followers: 1010, followersGained: 6, followersLost: 0 },
    { accountId: "fixture-instagram-account", platform: "instagram", date: "2026-08-04", followers: 1008, followersGained: 0, followersLost: 2 },
  ], "2026-08-26T10:00:00.000Z")
  await persistFollowerHistory(fixtureId, [{ accountId: "fixture-instagram-account", platform: "instagram", date: "2026-08-04", followers: 1008, followersGained: 0, followersLost: 2 }], "2026-08-26T10:01:00.000Z")
  const { data: followers } = await db.from("social_follower_observations").select("observation_date,followers,followers_gained,followers_lost").eq("client_id", fixtureId).order("observation_date")
  report.followers = followers
  await persistPostingFrequency(fixtureId, [{ platform: "instagram", postsPerWeek: 3, averageEngagementRate: 4.2, averageEngagement: 22.5, weeksCount: 4 }], "2026-08-26T10:00:00.000Z")
  const { data: frequency } = await db.from("social_posting_frequency_snapshots").select("platform,posts_per_week,average_engagement_rate,average_engagement,weeks_count").eq("client_id", fixtureId)
  report.postingFrequency = frequency
  await persistAudienceSnapshot(fixtureId, { accountId: "fixture-instagram-account", current: { since: "2026-08-01", until: "2026-08-30", views: 1000, reach: 700, accountsEngaged: 80, totalInteractions: 120 }, timeframe: "last_30_days", topCities: [{ label: "Fixture City", count: 10, percent: 50 }], topCountries: [{ label: "Fixtureland", count: 12, percent: 60 }], ageDistribution: [{ label: "25-34", count: 9, percent: 45 }], genderDistribution: [{ label: "female", count: 11, percent: 55 }], fetchedAt: "2026-08-26T10:00:00.000Z" })
  const { data: audience } = await db.from("social_audience_snapshots").select("views,reach,accounts_engaged,total_interactions,top_cities,top_countries,age_distribution,gender_distribution").eq("client_id", fixtureId).single()
  report.audience = audience
  report.fixtureRowsBeforeCleanup = await count(fixtureId)
  report.democlientbAfter = Object.fromEntries(await Promise.all(democlientbIds.map(async id => [id, await count(id)])))
  report.democlientbUnchanged = JSON.stringify(report.democlientbBefore) === JSON.stringify(report.democlientbAfter)
  } catch (error) {
    report.failure = error instanceof Error ? error.stack ?? error.message : String(error)
  } finally {
  for (const table of tables) await db.from(table).delete().eq("client_id", fixtureId)
  const { error } = await db.from("clients").delete().eq("id", fixtureId)
  report.cleanupClientDeleteError = error?.message ?? null
  report.fixtureRowsAfterCleanup = await count(fixtureId)
  }
  return report
}
