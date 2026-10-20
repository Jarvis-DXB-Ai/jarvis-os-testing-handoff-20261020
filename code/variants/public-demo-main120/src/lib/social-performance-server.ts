import "server-only"
import { safeAnalyticsData, type AnalyticsResource } from "@/lib/social-analytics-catalog"

import { createClient } from "@supabase/supabase-js"
import { ClientBrainV2HttpError } from "@/lib/client-brain-v2-server-core"
import { getAnalyticsRangeForPlatform, getAccountAnalyticsResources, getInstagramFollowerHistory, getPostAnalyticsResources } from "@/lib/zernio-server"
import { getSocialProviderConnections } from "@/lib/social-provider-connections-server"
import type { SocialAudienceSnapshot, SocialFollowerObservation, SocialPerformanceOverview, SocialPerformancePlatform, SocialPerformancePeriodKey, SocialPerformancePostObservation, SocialPerformanceSnapshot, SocialPostingFrequencyObservation } from "@/lib/social-performance"
import type { SocialPostPerformance } from "@/lib/zernio"
import { sanitizeProviderJson, sanitizeProviderString } from "@/lib/provider-unicode"

type Row = Record<string, unknown>

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Server database credentials are not configured.")
  return createClient(url, key)
}

function text(value: unknown) { return typeof value === "string" ? value : "" }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null }
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {} }
function rows(value: unknown): Row[] { return Array.isArray(value) ? value.map(record) : [] }
function numberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value)).flatMap(([key, candidate]) => number(candidate) === null ? [] : [[key, number(candidate)!]]))
}
function dateOnly(value: Date) { return value.toISOString().slice(0, 10) }
function addDays(value: Date, days: number) { const next = new Date(value); next.setUTCDate(next.getUTCDate() + days); return next }

function snapshotFromRow(row: Row): SocialPerformanceSnapshot {
  return {
    id: text(row.id), clientId: text(row.client_id), provider: "zernio", platform: row.platform as SocialPerformancePlatform,
    providerAccountId: text(row.provider_account_id), periodKey: row.period_key as SocialPerformancePeriodKey,
    periodStart: text(row.period_start), periodEnd: text(row.period_end), followers: number(row.followers),
    postReach: number(row.post_reach), impressions: number(row.impressions), views: number(row.views), engagements: number(row.engagements),
    engagementRate: number(row.engagement_rate), linkClicks: number(row.link_clicks), postsCount: number(row.posts_count) ?? 0,
    topPosts: rows(row.top_posts).map(item => ({
      id: text(item.id), publishedAt: text(item.publishedAt) || null, postType: text(item.postType) || "post",
      views: number(item.views), impressions: number(item.impressions), interactions: number(item.interactions), reach: number(item.reach), engagementRate: number(item.engagementRate),
      title: text(item.title) || null, captionExcerpt: text(item.captionExcerpt) || null,
      thumbnailPath: text(item.thumbnailPath) || null, postUrl: text(item.postUrl) || null,
    })),
    analyticsResources: (Array.isArray(record(row.provider_summary).analyticsResources) ? record(row.provider_summary).analyticsResources : []) as AnalyticsResource[],
    metricProvenance: record(row.metric_provenance),
    syncedAt: text(row.synced_at),
  }
}

function postObservationFromRow(row: Row): SocialPerformancePostObservation {
  return {
    id: text(row.id), snapshotId: text(row.snapshot_id), platform: row.platform as SocialPerformancePlatform,
    providerPostId: text(row.provider_post_id), executionId: text(row.social_provider_execution_id) || null, executionTargetId: text(row.social_provider_execution_target_id) || null, publishedAt: text(row.published_at) || null,
    postType: text(row.post_type) || "post", title: text(row.title) || null,
    captionExcerpt: text(row.caption_excerpt) || null, thumbnailPath: text(row.thumbnail_path) || null,
    postUrl: text(row.post_url) || null, likes: number(row.likes), comments: number(row.comments),
    shares: number(row.shares), saves: number(row.saves), clicks: number(row.clicks), views: number(row.views),
    impressions: number(row.impressions), reach: number(row.reach), interactions: number(row.interactions),
    engagementRate: number(row.engagement_rate), nativeMetrics: numberRecord(row.native_metrics), analyticsDetails: record(record(row.native_metrics).provider_details), observedAt: text(row.observed_at),
  }
}

function audienceSnapshotFromRow(row: Row): SocialAudienceSnapshot {
  const audienceRows = (value: unknown) => rows(value).flatMap(item => {
    const label = text(item.label); const count = number(item.count); const percent = number(item.percent)
    return label && count !== null && percent !== null ? [{ label, count, percent }] : []
  })
  return {
    id: text(row.id), providerAccountId: text(row.provider_account_id), periodStart: text(row.period_start), periodEnd: text(row.period_end),
    views: number(row.views), reach: number(row.reach), accountsEngaged: number(row.accounts_engaged), totalInteractions: number(row.total_interactions),
    dataDelay: text(row.data_delay) || null, timeframe: text(row.timeframe) || null, topCities: audienceRows(row.top_cities),
    topCountries: audienceRows(row.top_countries), ageDistribution: audienceRows(row.age_distribution), genderDistribution: audienceRows(row.gender_distribution),
    nativeMetrics: numberRecord(row.native_metrics), fetchedAt: text(row.fetched_at),
  }
}
function followerFromRow(row: Row): SocialFollowerObservation { return { id: text(row.id), platform: row.platform as SocialPerformancePlatform, date: text(row.observation_date), followers: number(row.followers) ?? 0, followersGained: number(row.followers_gained), followersLost: number(row.followers_lost), observedAt: text(row.observed_at) } }
function frequencyFromRow(row: Row): SocialPostingFrequencyObservation { return { id: text(row.id), platform: row.platform as SocialPerformancePlatform, postsPerWeek: number(row.posts_per_week) ?? 0, averageEngagementRate: number(row.average_engagement_rate), averageEngagement: number(row.average_engagement), weeksCount: number(row.weeks_count) ?? 0, observedAt: text(row.observed_at) } }

export async function getCachedSocialPerformance(clientId: string): Promise<SocialPerformanceOverview> {
  const sb = serviceClient()
  const { data, error } = await sb
    .from("social_performance_snapshots")
    .select("id,client_id,provider,platform,provider_account_id,period_key,period_start,period_end,followers,post_reach,impressions,views,engagements,engagement_rate,link_clicks,posts_count,top_posts,provider_summary,metric_provenance,synced_at")
    .eq("client_id", clientId).eq("provider", "zernio").order("synced_at", { ascending: false }).limit(100)
  if (error) throw new Error("Unable to load cached social performance.")
  const all = (data ?? []).map(row => snapshotFromRow(row as Row))
  const latest = (platform: SocialPerformancePlatform, periodKey: SocialPerformancePeriodKey) => all.find(item => item.platform === platform && item.periodKey === periodKey) ?? null
  const currentSnapshotIds = [latest("instagram", "current_30d"), latest("facebook", "current_30d")].flatMap(item => item?.id ? [item.id] : [])
  const postRows:Row[]=[];
  if(currentSnapshotIds.length)for(let offset=0;;offset+=1000){
    const page=await sb.from("social_performance_post_observations").select("id,snapshot_id,platform,provider_post_id,social_provider_execution_id,social_provider_execution_target_id,published_at,post_type,title,caption_excerpt,thumbnail_path,post_url,likes,comments,shares,saves,clicks,views,impressions,reach,interactions,engagement_rate,native_metrics,observed_at").eq("client_id",clientId).in("snapshot_id",currentSnapshotIds).order("published_at",{ascending:false}).order("id").range(offset,offset+999);
    if(page.error)throw new Error("Unable to load cached post analytics.");
    postRows.push(...(page.data??[]));if((page.data??[]).length<1000)break;
  }
  const { data: audienceRows, error: audienceError } = await sb.from("social_audience_snapshots").select("id,provider_account_id,period_start,period_end,views,reach,accounts_engaged,total_interactions,data_delay,timeframe,top_cities,top_countries,age_distribution,gender_distribution,native_metrics,fetched_at").eq("client_id", clientId).eq("provider", "zernio").order("fetched_at", { ascending: false }).limit(1)
  if (audienceError) throw new Error("Unable to load cached audience analytics.")
  const [{ data: followers, error: followerError }, { data: frequency, error: frequencyError }] = await Promise.all([
    sb.from("social_follower_observations").select("id,platform,observation_date,followers,followers_gained,followers_lost,observed_at").eq("client_id", clientId).eq("provider", "zernio").order("observation_date", { ascending: false }).limit(180),
    sb.from("social_posting_frequency_snapshots").select("id,platform,posts_per_week,average_engagement_rate,average_engagement,weeks_count,observed_at").eq("client_id", clientId).eq("provider", "zernio").order("observed_at", { ascending: false }).limit(100),
  ])
  if (followerError || frequencyError) throw new Error("Unable to load cached historical analytics.")
  const current = [latest("instagram", "current_30d"), latest("facebook", "current_30d")].map(item => item?.syncedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  return {
    clientId,
    platforms: {
      instagram: { current: latest("instagram", "current_30d"), previous: latest("instagram", "previous_30d") },
      facebook: { current: latest("facebook", "current_30d"), previous: latest("facebook", "previous_30d") },
    },
    history: {
      instagram: all.filter(item => item.platform === "instagram" && item.periodKey === "current_30d").slice(0, 12).reverse(),
      facebook: all.filter(item => item.platform === "facebook" && item.periodKey === "current_30d").slice(0, 12).reverse(),
    },
    postObservations: (postRows ?? []).map(row => postObservationFromRow(row as Row)),
    audience: audienceRows?.[0] ? audienceSnapshotFromRow(audienceRows[0] as Row) : null,
    followerObservations: (followers ?? []).map(row => followerFromRow(row as Row)).sort((a,b)=>a.date.localeCompare(b.date)),
    postingFrequency: (frequency ?? []).map(row => frequencyFromRow(row as Row)),
    lastSyncedAt: current,
  }
}

function sum(posts: SocialPostPerformance[], key: keyof SocialPostPerformance) {
  const values = posts.map(post => post[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function sortByMetric(posts: SocialPostPerformance[], key: "reach" | "views" | "engagementRate") {
  // Rankings are only valid for the exact selected metric. Missing values sort
  // last; they never become a neighbouring metric or a made-up zero.
  return [...posts].filter(post => number(post[key]) !== null).sort((a, b) => (number(b[key]) ?? -Infinity) - (number(a[key]) ?? -Infinity))
}

function postInteractions(post: SocialPostPerformance) {
  const values = [post.likes, post.comments, post.shares, post.saves].map(number).filter((value): value is number => value !== null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}
function validTimestamp(value: unknown) { const candidate = text(value); return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null }
function finite(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null }
function finiteInteger(value: unknown) { return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) ? value : null }
function nativeMetrics(input: Record<string, unknown>) { return sanitizeProviderJson(Object.fromEntries(Object.entries(input).flatMap(([key, value]) => finite(value) === null ? [] : [[key, finite(value)!]]))).value }
type DbError = { code?: string; message?: string; details?: string; hint?: string }
async function retainObservationFailure(sb: ReturnType<typeof serviceClient>, clientId: string, rows: Array<Record<string, unknown>>, error: DbError) {
  const row = rows[0] ?? {}
  const constraintSource = `${error.message ?? ""} ${error.details ?? ""}`
  const diagnostic = { stage: "post_observations", code: error.code ?? null, message: error.message ?? null, details: error.details ?? null, hint: error.hint ?? null, constraint: constraintSource.match(/constraint\s+["']?([^"'\s]+)/i)?.[1] ?? null, client_id: clientId, snapshot_id: typeof row.snapshot_id === "string" ? row.snapshot_id : null, platform: typeof row.platform === "string" ? row.platform : null, provider_post_id: typeof row.provider_post_id === "string" ? row.provider_post_id : null, published_at: typeof row.published_at === "string" ? row.published_at : null, post_type: typeof row.post_type === "string" ? row.post_type : null, batch_size: rows.length }
  await sb.from("social_refresh_diagnostics").insert({ client_id: clientId, provider: "zernio", stage: "post_observations", diagnostic: sanitizeProviderJson(diagnostic).value })
}

type PersistPostInput = SocialPostPerformance & { snapshotId: string; platform: SocialPerformancePlatform; observedAt: string }

/** The single post-observation persistence path used by refreshes and isolated fixtures. */
export async function persistPostObservations(clientId: string, posts: PersistPostInput[], options?: { bypassDedupe?: boolean }) {
  const sb = serviceClient()
  const providerPostIds = [...new Set(posts.map(post => typeof post.postId === "string" ? post.postId.trim() : "").filter(Boolean))]
  const { data: targets, error: targetsError } = providerPostIds.length
    ? await sb.from("social_provider_execution_targets").select("id,social_provider_execution_id,platform,external_post_id").eq("client_id", clientId).in("external_post_id", providerPostIds)
    : { data: [], error: null }
  if (targetsError) throw new Error("Unable to resolve Jarvis execution links for Social Insights.")
  const executionByProviderPostId = new Map((targets ?? []).map(target => [String(target.external_post_id), { executionId: String(target.social_provider_execution_id), targetId: String(target.id), platform: String(target.platform) }]))
  const rawRows = posts.map(post => ({
    snapshot_id: post.snapshotId, client_id: clientId, provider: "zernio", platform: post.platform,
    provider_post_id: typeof post.postId === "string" ? sanitizeProviderString(post.postId).value : "", post_type: sanitizeProviderString(post.postType).value, title: post.title ? sanitizeProviderString(post.title).value : null,
    caption_excerpt: post.caption ? sanitizeProviderString(post.caption).value.slice(0, 500) : null, thumbnail_path: post.cachedThumbnailPath ? sanitizeProviderString(post.cachedThumbnailPath).value : null,
    post_url: post.platformUrl ? sanitizeProviderString(post.platformUrl).value : post.postUrl ? sanitizeProviderString(post.postUrl).value : null, likes: finiteInteger(post.likes), comments: finiteInteger(post.comments),
    shares: finiteInteger(post.shares), saves: finiteInteger(post.saves), clicks: finiteInteger(post.clicks), views: finiteInteger(post.views),
    impressions: finiteInteger(post.impressions), reach: finiteInteger(post.reach), interactions: finiteInteger(postInteractions(post)),
    engagement_rate: finite(post.engagementRate), native_metrics: sanitizeProviderJson({ ...record(nativeMetrics({ watch_time: post.watchTime, average_watch_time: post.averageWatchTime })), provider_details: safeAnalyticsData({...(post.analyticsDetails ?? {}),platform_post_id:post.platformPostId??null}) }).value, published_at: validTimestamp(post.publishedAt), observed_at: post.observedAt,
    social_provider_execution_id: executionByProviderPostId.get(post.postId)?.executionId ?? null,
    social_provider_execution_target_id: executionByProviderPostId.get(post.postId)?.targetId ?? null,
  }))
  const seen = new Set<string>()
  const rows = rawRows.filter(row => {
    const providerPostId = typeof row.provider_post_id === "string" ? row.provider_post_id.trim() : ""
    if (!providerPostId || providerPostId === "undefined") throw new ClientBrainV2HttpError("A provider post was missing a stable identity. No detailed observations were persisted.", 409)
    row.provider_post_id = providerPostId
    const identity = `${row.snapshot_id}:${providerPostId}`
    if (!options?.bypassDedupe && seen.has(identity)) return false
    seen.add(identity)
    return true
  })
  if (!rows.length) return { attempted: 0, persisted: 0 }
  const { error } = await sb.from("social_performance_post_observations").insert(rows)
  if (error) {
    await retainObservationFailure(sb, clientId, rows, error)
    throw new Error("Snapshots were saved, but post-level analytics could not be persisted.")
  }
  return { attempted: rawRows.length, persisted: rows.length }
}

export async function persistAudienceSnapshot(clientId: string, input: { accountId: string; current: { since: string; until: string; views?: number | null; reach?: number | null; accountsEngaged?: number | null; totalInteractions?: number | null; followsAndUnfollows?: number | null; profileLinkTaps?: number | null }; dataDelay?: string | null; timeframe: string; topCities: unknown[]; topCountries: unknown[]; ageDistribution: unknown[]; genderDistribution: unknown[]; fetchedAt: string }) {
  const audience = sanitizeProviderJson({ topCities: input.topCities, topCountries: input.topCountries, ageDistribution: input.ageDistribution, genderDistribution: input.genderDistribution }).value as Record<string, unknown>
  const { error } = await serviceClient().from("social_audience_snapshots").insert({ client_id: clientId, provider: "zernio", provider_account_id: sanitizeProviderString(input.accountId).value, period_start: input.current.since, period_end: input.current.until, views: finite(input.current.views), reach: finite(input.current.reach), accounts_engaged: finite(input.current.accountsEngaged), total_interactions: finite(input.current.totalInteractions), data_delay: input.dataDelay ? sanitizeProviderString(input.dataDelay).value : null, timeframe: sanitizeProviderString(input.timeframe).value, top_cities: audience.topCities, top_countries: audience.topCountries, age_distribution: audience.ageDistribution, gender_distribution: audience.genderDistribution, native_metrics: nativeMetrics({ follows_and_unfollows: input.current.followsAndUnfollows, profile_link_taps: input.current.profileLinkTaps }), fetched_at: input.fetchedAt })
  if (error) throw new Error("Snapshots were saved, but account audience analytics could not be persisted.")
}

export async function persistFollowerHistory(clientId: string, input: Array<{ accountId: string; platform: "instagram"; date: string; followers: number; followersGained: number | null; followersLost: number | null }>, observedAt: string) {
  if (!input.length) return
  const { error } = await serviceClient().from("social_follower_observations").upsert(input.map(item => ({ client_id: clientId, provider: "zernio", provider_account_id: item.accountId, platform: item.platform, observation_date: item.date, followers: finite(item.followers), followers_gained: finite(item.followersGained), followers_lost: finite(item.followersLost), observed_at: observedAt })), { onConflict: "client_id,provider,provider_account_id,observation_date" })
  if (error) throw new Error("Snapshots were saved, but follower history could not be persisted.")
}

export async function persistPostingFrequency(clientId: string, input: Array<{ platform: "instagram" | "facebook"; postsPerWeek: number; averageEngagementRate: number | null; averageEngagement: number | null; weeksCount: number }>, observedAt: string) {
  if (!input.length) return
  const { error } = await serviceClient().from("social_posting_frequency_snapshots").insert(input.map(item => ({ client_id: clientId, provider: "zernio", platform: item.platform, posts_per_week: finite(item.postsPerWeek), average_engagement_rate: finite(item.averageEngagementRate), average_engagement: finite(item.averageEngagement), weeks_count: finite(item.weeksCount), observed_at: observedAt })))
  if (error) throw new Error("Snapshots were saved, but posting-frequency analytics could not be persisted.")
}

function aggregate(posts: SocialPostPerformance[]) {
  const engagements = ["likes", "comments", "shares", "saves"] as const
  return {
    postReach: sum(posts, "reach"), impressions: sum(posts, "impressions"), views: sum(posts, "views"),
    engagements: engagements.reduce<number | null>((total, key) => {
      const value = sum(posts, key)
      if (value === null) return total
      return (total ?? 0) + value
    }, null),
    // Zernio returns a rate per post. Do not naively average those percentages:
    // the provider has not supplied the denominator/weighting for a valid
    // platform-level rate.
    engagementRate: null, linkClicks: sum(posts, "clicks"), postsCount: posts.length,
    topPosts: sortByMetric(posts, "reach").slice(0, 6).map(post => ({
      id: post.postId, publishedAt: post.publishedAt ?? null, postType: post.postType, views: post.views ?? null,
      impressions: post.impressions ?? null, interactions: postInteractions(post),
      reach: post.reach ?? null, engagementRate: post.engagementRate ?? null,
      title: post.title ?? null, captionExcerpt: post.caption?.slice(0, 160) ?? null,
      // The normal dashboard only receives a locally cached storage path.
      thumbnailPath: post.cachedThumbnailPath ?? null,
      postUrl: post.platformUrl ?? post.postUrl ?? null,
    })),
  }
}

export async function syncSocialPerformance(clientId: string) {
  const connections = await getSocialProviderConnections(clientId)
  const instagramConnection = connections.connections.find(connection => connection.platform === "instagram" && connection.status === "connected") ?? null
  const facebookConnection = connections.connections.find(connection => connection.platform === "facebook" && connection.status === "connected") ?? null
  const mapped = [instagramConnection,facebookConnection].filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (!mapped.length) throw new Error("Connect and map a social account before refreshing analytics.");
  for (const connection of mapped) if (!connection.providerConnectionId) throw new Error("The Zernio account identity is missing. Refresh the connection mapping first.");

  const today = new Date()
  // Zernio receives inclusive date strings. Keep requested windows contiguous
  // and non-overlapping so an explicit refresh can support a real comparison.
  const currentStart = dateOnly(addDays(today, -29))
  const currentEnd = dateOnly(today)
  const previousStart = dateOnly(addDays(today, -59))
  const previousEnd = dateOnly(addDays(today, -30))
  const periods: Array<{ key: SocialPerformancePeriodKey; start: string; end: string }> = [
    { key: "current_30d", start: currentStart, end: currentEnd },
    { key: "previous_30d", start: previousStart, end: previousEnd },
  ]
  // Fetched before the snapshots are built so each period can carry the follower
  // count observed in its own window. Reading the mapped connection metadata for
  // both periods wrote one frozen number twice, which pinned the follower trend
  // at exactly 0% and let the stored figure drift from the live account.
  const followerHistory = instagramConnection?.providerConnectionId ? await getInstagramFollowerHistory({ accountId: instagramConnection.providerConnectionId, since: previousStart, until: currentEnd }) : null
  const followerSeries = followerHistory?.ok
    ? [...followerHistory.data].sort((left, right) => left.date.localeCompare(right.date))
    : []
  const extras = new Map<string,AnalyticsResource[]>();
  for (const connection of mapped) extras.set(connection.platform, await getAccountAnalyticsResources(connection.platform as SocialPerformancePlatform,connection.providerConnectionId!,currentStart,currentEnd));
  const fetched = await Promise.all(mapped.flatMap(connection => periods.map(async period => {
    const platform=connection.platform as SocialPerformancePlatform;
    const response = await getAnalyticsRangeForPlatform({ platform, accountId: connection.providerConnectionId!, since: period.start, until: period.end })
    if (!response.ok) throw new Error(response.error || `Zernio could not refresh ${platform} insights.`)
    const metadata = record(connection.providerMetadata)
    // Connection metadata describes the account as of the last mapping refresh,
    // so it only fairly describes the current window. An older window with no
    // retained observation is recorded as unknown rather than back-filled.
    const observedFollowers = platform === "instagram"
      ? followerSeries.filter(point => point.date <= period.end).at(-1)?.followers ?? null
      : null
    const followerReport=record(extras.get(platform)?.find(item=>item.key==='follower_stats'&&item.status==='available')?.data);
    const freshFollowers=rows(followerReport.accounts).find(item=>text(item._id)===connection.providerConnectionId);
    const periodFollowers = observedFollowers ?? (period.key === "current_30d" ? number(freshFollowers?.currentFollowers) ?? number(metadata.followers) : null)
    const aggregateMetrics = aggregate(response.data)
    return { posts: response.data, snapshot: {
      client_id: clientId, provider: "zernio", platform, provider_account_id: connection.providerConnectionId!,
      period_key: period.key, period_start: period.start, period_end: period.end,
      followers: periodFollowers, post_reach: aggregateMetrics.postReach, impressions: aggregateMetrics.impressions, views: aggregateMetrics.views,
      engagements: aggregateMetrics.engagements, engagement_rate: aggregateMetrics.engagementRate, link_clicks: aggregateMetrics.linkClicks,
      posts_count: aggregateMetrics.postsCount, top_posts: sanitizeProviderJson(aggregateMetrics.topPosts).value,
      provider_summary: sanitizeProviderJson({ source: "zernio/analytics", analyticsResources: period.key === "current_30d" ? extras.get(platform) ?? [] : [], returnedPosts: response.data.length, apiLimitations: response.summary.apiLimitations ?? [] }).value,
      metric_provenance: sanitizeProviderJson({
        source: "zernio/analytics", scope: "post-level", requestedPeriod: { start: period.start, end: period.end },
        fields: { postReach: "reach", impressions: "impressions", views: "views", engagements: "likes + comments + shares + saves", engagementRate: "withheld: provider exposes post-level rate only; aggregate weighting is unverified", linkClicks: "clicks" },
        followersSource: observedFollowers !== null
          ? "daily follower observation retained at or before the period end"
          : periodFollowers !== null
            ? number(freshFollowers?.currentFollowers)!==null ? "Zernio follower-stats current count" : "mapped social-provider connection metadata at sync time"
            : "withheld: no follower observation retained for this window",
      }).value,
      synced_at: new Date().toISOString(),
    } }
  })))
  const sb = serviceClient()
  const { data: insertedSnapshots, error } = await sb.from("social_performance_snapshots").insert(fetched.map(item => item.snapshot)).select("id,platform,period_key")
  if (error || !insertedSnapshots) throw new Error("Unable to persist the Zernio performance snapshots.")
  await persistPostObservations(clientId, fetched.flatMap(item => {
    const snapshot = insertedSnapshots.find(row => row.platform === item.snapshot.platform && row.period_key === item.snapshot.period_key)
    return snapshot ? item.posts.map(post => ({ ...post, snapshotId: snapshot.id, platform: item.snapshot.platform, observedAt: item.snapshot.synced_at })) : []
  }))
  // Optional resource failures are retained individually, not allowed to erase
  // successful post/account metrics or masquerade as genuine zero values.
  const ig=extras.get("instagram")??[];
  const account=record(ig.find(item=>item.key==='account'&&item.status==='available')?.data);
  const demo=record(ig.find(item=>item.key==='follower_demographics'&&item.status==='available')?.data);
  const metrics=record(account.metrics), demographics=record(demo.demographics);
  const metric=(key:string)=>number(record(metrics[key]).total);
  const distribution=(key:string)=>{ const items=rows(demographics[key]);const total=items.reduce((sum,item)=>sum+(number(item.value)??0),0);return items.flatMap(item=>typeof item.dimension==='string'&&number(item.value)!==null&&total>0?[{label:item.dimension,count:number(item.value)!,percent:number(item.value)!/total*100}]:[]); };
  if(instagramConnection?.providerConnectionId && (Object.keys(account).length||Object.keys(demo).length))await persistAudienceSnapshot(clientId,{accountId:instagramConnection.providerConnectionId,current:{since:currentStart,until:currentEnd,views:metric('views'),reach:metric('reach'),accountsEngaged:metric('accounts_engaged'),totalInteractions:metric('total_interactions'),followsAndUnfollows:metric('follows_and_unfollows'),profileLinkTaps:metric('profile_links_taps')},dataDelay:text(account.dataDelay),timeframe:text(demo.timeframe),topCities:distribution('city'),topCountries:distribution('country'),ageDistribution:distribution('age'),genderDistribution:distribution('gender'),fetchedAt:new Date().toISOString()});
  if (followerHistory?.ok && followerHistory.data.length) await persistFollowerHistory(clientId,followerHistory.data,new Date().toISOString());
  return getCachedSocialPerformance(clientId)
}

export async function refreshPostAnalytics(clientId:string,observationId:string) {
 const sb=serviceClient();
 const post=await sb.from('social_performance_post_observations').select('id,snapshot_id,platform,provider_post_id,native_metrics').eq('client_id',clientId).eq('id',observationId).single();
 if(post.error||!post.data)throw new Error('Post not found for this client.');
 const snapshot=await sb.from('social_performance_snapshots').select('provider_account_id').eq('client_id',clientId).eq('id',post.data.snapshot_id).single();
 if(snapshot.error||!snapshot.data)throw new Error('Post account identity is unavailable.');
 const connections=await getSocialProviderConnections(clientId);
 const mapped=connections.connections.find(c=>c.platform===post.data.platform&&c.providerConnectionId===snapshot.data.provider_account_id&&c.status==='connected');
 if(!mapped?.providerConnectionId)throw new Error('This account is not connected for this client.');
 const native=record(post.data.native_metrics),details=record(native.provider_details);
 const reports=await getPostAnalyticsResources({platform:post.data.platform as SocialPerformancePlatform,accountId:mapped.providerConnectionId,postId:post.data.provider_post_id,platformPostId:text(details.platform_post_id)||null});
 const updated={...details,reports};
 const result=await sb.from('social_performance_post_observations').update({native_metrics:sanitizeProviderJson({...native,provider_details:updated}).value}).eq('id',observationId).eq('client_id',clientId);
 if(result.error)throw new Error('Unable to save post reports.');
 return updated;
}
