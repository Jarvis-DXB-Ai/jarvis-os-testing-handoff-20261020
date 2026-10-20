import type { SocialPlatform, SocialPostPerformance } from "@/lib/zernio"
import type { SocialPerformanceOverview, SocialPerformancePlatform, SocialPerformancePostObservation, SocialPerformanceSnapshot } from "@/lib/social-performance"

export type SocialIntelligenceSection =
  | "growth"
  | "content"
  | "timing"
  | "engagement"
  | "strategy"

export type SocialStrategyInsight = {
  id: string
  section: SocialIntelligenceSection
  title: string
  detail: string
  metric: string
  confidence: "directional" | "strong"
}

export type SocialIntelligenceGroup = {
  label: string
  count: number
  averageReach?: number
  averageImpressions?: number
  averageViews?: number
  averageEngagementRate?: number
  averageSaves?: number
  averageShares?: number
  averageComments?: number
}

export type SocialIntelligenceReport = {
  recordCount: number
  readiness: {
    ready: boolean
    level: "insufficient" | "directional" | "strong"
    message: string
  }
  totals: Record<string, number>
  metricNames: string[]
  missingMetrics: string[]
  platforms: SocialPlatform[]
  postTypes: string[]
  timeline: {
    start?: string
    end?: string
    days?: number
  }
  latestAnalyticsTimestamp?: string
  groups: {
    byPostType: SocialIntelligenceGroup[]
    byPlatform: SocialIntelligenceGroup[]
    bySubject: SocialIntelligenceGroup[]
    byWeekday: SocialIntelligenceGroup[]
    byHour: SocialIntelligenceGroup[]
  }
  topPosts: SocialPostPerformance[]
  insights: SocialStrategyInsight[]
}

const METRIC_KEYS = [
  "reach",
  "impressions",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "engagementRate",
  "averageWatchTime",
  "watchTime",
] as const

const EXPECTED_METRICS = [
  "reach",
  "impressions",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "engagementRate",
  "averageWatchTime",
  "watchTime",
  "followers",
  "profileViews",
  "audienceDemographics",
  "audienceLocation",
]

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)
}

function percentChange(higher: number, lower: number) {
  if (lower <= 0) return null
  return ((higher - lower) / lower) * 100
}

function average(values: Array<number | undefined>) {
  const numeric = values.filter(finite)
  if (numeric.length === 0) return undefined
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function metricAverage(posts: SocialPostPerformance[], key: keyof SocialPostPerformance) {
  return average(posts.map(post => post[key] as number | undefined))
}

function groupPosts(posts: SocialPostPerformance[], labelFor: (post: SocialPostPerformance) => string[]) {
  const map = new Map<string, SocialPostPerformance[]>()
  for (const post of posts) {
    for (const label of labelFor(post)) {
      const clean = label.trim()
      if (!clean) continue
      map.set(clean, [...(map.get(clean) ?? []), post])
    }
  }
  return Array.from(map.entries())
}

function groupStats(label: string, posts: SocialPostPerformance[]): SocialIntelligenceGroup {
  return {
    label,
    count: posts.length,
    averageReach: metricAverage(posts, "reach"),
    averageImpressions: metricAverage(posts, "impressions"),
    averageViews: metricAverage(posts, "views"),
    averageEngagementRate: metricAverage(posts, "engagementRate"),
    averageSaves: metricAverage(posts, "saves"),
    averageShares: metricAverage(posts, "shares"),
    averageComments: metricAverage(posts, "comments"),
  }
}

function sortByMetric(groups: SocialIntelligenceGroup[], key: keyof SocialIntelligenceGroup) {
  return [...groups]
    .filter(group => finite(group[key]))
    .sort((a, b) => Number(b[key]) - Number(a[key]))
}

function makeComparisonInsight(input: {
  id: string
  section: SocialIntelligenceSection
  titleMetric: string
  metricKey: keyof SocialIntelligenceGroup
  groups: SocialIntelligenceGroup[]
  minGroupSize?: number
}) {
  const minGroupSize = input.minGroupSize ?? 2
  const ranked = sortByMetric(input.groups.filter(group => group.count >= minGroupSize), input.metricKey)
  const best = ranked[0]
  const second = ranked[1]
  if (!best || !second) return null
  const change = percentChange(Number(best[input.metricKey]), Number(second[input.metricKey]))
  if (change === null || change < 25) return null
  return {
    id: input.id,
    section: input.section,
    title: `${best.label} leads ${input.titleMetric}`,
    detail: `${best.label} averaged ${compactNumber(Number(best[input.metricKey]))} ${input.titleMetric} across ${best.count} records, ${change.toFixed(0)}% higher than ${second.label}.`,
    metric: input.titleMetric,
    confidence: best.count >= 5 && second.count >= 5 ? "strong" : "directional",
  } satisfies SocialStrategyInsight
}

function weekdayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Dubai" }).format(date)
}

function hourLabel(date: Date) {
  return `${new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Dubai" }).format(date)}:00`
}

function recordDate(post: SocialPostPerformance) {
  const value = post.publishedAt || post.createdAt
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

export function buildSocialIntelligence(posts: SocialPostPerformance[]): SocialIntelligenceReport {
  const validPosts = posts.filter(post => post && post.postId)
  const totals: Record<string, number> = {}
  const metricNames = new Set<string>()
  for (const post of validPosts) {
    for (const key of METRIC_KEYS) {
      const value = post[key]
      if (finite(value)) {
        metricNames.add(key)
        totals[key] = (totals[key] ?? 0) + value
      }
    }
  }

  const dated = validPosts.map(recordDate).filter((date): date is Date => Boolean(date))
  const startDate = dated.length > 0 ? new Date(Math.min(...dated.map(date => date.getTime()))) : null
  const endDate = dated.length > 0 ? new Date(Math.max(...dated.map(date => date.getTime()))) : null
  const timelineDays = startDate && endDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)) : undefined
  const latestAnalyticsTimestamp = validPosts
    .map(post => post.lastUpdated)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  const byPostType = groupPosts(validPosts, post => [post.postType]).map(([label, group]) => groupStats(label, group))
  const byPlatform = groupPosts(validPosts, post => [post.platform]).map(([label, group]) => groupStats(label, group))
  const bySubject = groupPosts(validPosts, post => post.subjectTags ?? []).map(([label, group]) => groupStats(label, group))
  const byWeekday = groupPosts(validPosts, post => {
    const date = recordDate(post)
    return date ? [weekdayLabel(date)] : []
  }).map(([label, group]) => groupStats(label, group))
  const byHour = groupPosts(validPosts, post => {
    const date = recordDate(post)
    return date ? [hourLabel(date)] : []
  }).map(([label, group]) => groupStats(label, group))

  const scoreForPost = (post: SocialPostPerformance) => post.reach ?? post.views ?? post.impressions ?? 0
  const topPosts = [...validPosts].sort((a, b) => scoreForPost(b) - scoreForPost(a)).slice(0, 8)

  const insights = [
    makeComparisonInsight({ id: "post-type-reach", section: "content", titleMetric: "average reach", metricKey: "averageReach", groups: byPostType }),
    makeComparisonInsight({ id: "post-type-engagement", section: "content", titleMetric: "average engagement rate", metricKey: "averageEngagementRate", groups: byPostType }),
    makeComparisonInsight({ id: "subject-reach", section: "strategy", titleMetric: "average reach", metricKey: "averageReach", groups: bySubject }),
    makeComparisonInsight({ id: "subject-saves", section: "engagement", titleMetric: "average saves", metricKey: "averageSaves", groups: bySubject }),
    makeComparisonInsight({ id: "weekday-reach", section: "timing", titleMetric: "average reach", metricKey: "averageReach", groups: byWeekday, minGroupSize: 3 }),
    makeComparisonInsight({ id: "hour-reach", section: "timing", titleMetric: "average reach", metricKey: "averageReach", groups: byHour, minGroupSize: 3 }),
  ].filter((insight): insight is SocialStrategyInsight => Boolean(insight))

  const clickRecords = validPosts.filter(post => finite(post.clicks))
  if (clickRecords.length >= 5 && (totals.clicks ?? 0) === 0 && ((totals.reach ?? 0) > 0 || (totals.views ?? 0) > 0)) {
    insights.push({
      id: "clicks-zero",
      section: "engagement",
      title: "Awareness is visible, click signal is absent",
      detail: `Zernio returned ${compactNumber(totals.reach ?? totals.views ?? 0)} reach/views but 0 clicks across ${clickRecords.length} records. Treat link-click conversion as unavailable or not currently captured.`,
      metric: "clicks",
      confidence: "strong",
    })
  }

  const reelPosts = validPosts.filter(post => post.postType === "reel" && finite(post.averageWatchTime))
  const reelWatchAverage = metricAverage(reelPosts, "averageWatchTime")
  if (reelPosts.length >= 3 && finite(reelWatchAverage)) {
    insights.push({
      id: "reel-watch-time",
      section: "content",
      title: "Reel watch-time signal is available",
      detail: `Reels returned an average watch-time signal of ${Math.round(reelWatchAverage)} ms across ${reelPosts.length} records. Use this for future retention comparisons once more reel history exists.`,
      metric: "average watch time",
      confidence: reelPosts.length >= 5 ? "strong" : "directional",
    })
  }

  const ready = validPosts.length >= 20 && metricNames.size >= 6
  const level = ready ? "strong" : validPosts.length >= 8 ? "directional" : "insufficient"
  return {
    recordCount: validPosts.length,
    readiness: {
      ready: level !== "insufficient",
      level,
      message: level === "strong"
        ? "Enough live analytics exist for directional strategy insights. Keep confidence tied to returned metrics."
        : level === "directional"
          ? "Some analytics exist, but more history is required before reliable strategy automation."
          : "More analytics history required before reliable strategic insights can be generated.",
    },
    totals,
    metricNames: Array.from(metricNames).sort(),
    missingMetrics: EXPECTED_METRICS.filter(metric => !metricNames.has(metric)),
    platforms: Array.from(new Set(validPosts.map(post => post.platform))).sort(),
    postTypes: Array.from(new Set(validPosts.map(post => post.postType))).sort(),
    timeline: {
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      days: timelineDays,
    },
    latestAnalyticsTimestamp,
    groups: {
      byPostType: sortByMetric(byPostType, "averageReach"),
      byPlatform: sortByMetric(byPlatform, "averageReach"),
      bySubject: sortByMetric(bySubject.filter(group => group.count >= 2), "averageReach"),
      byWeekday: sortByMetric(byWeekday, "averageReach"),
      byHour: sortByMetric(byHour, "averageReach"),
    },
    topPosts,
    insights,
  }
}

// Runtime V1 consumes the retained, normalized Social cache rather than raw
// provider responses. It does not classify post themes, infer causation, or
// turn a single outlier into a client-memory truth.
export type SocialIntelligenceConfidence = "high" | "medium" | "low"
export type SocialIntelligenceEvidence = {
  signal_key: string
  finding: string
  period: { start: string | null; end: string | null; comparable_to_previous: boolean }
  sample_size: number
  confidence: SocialIntelligenceConfidence
  metrics: Record<string, number | string | null>
  source_refs: Array<{ table: string; id: string; provider_post_id?: string }>
  method: string
}

export type SocialIntelligenceFinding = {
  id: string
  title: string
  statement: string
  confidence: SocialIntelligenceConfidence
  evidence: SocialIntelligenceEvidence[]
}

export type SocialIntelligenceRecommendation = SocialIntelligenceFinding & {
  recommended_action: string
  metric_to_watch: string
  classification: "next_move" | "experiment"
}

export type DeterministicSocialIntelligenceArtifact = {
  artifact_version: "v1"
  deterministic: true
  period_start: string | null
  period_end: string | null
  executive_summary: string[]
  working: SocialIntelligenceFinding[]
  needs_attention: SocialIntelligenceFinding[]
  recommended_next_moves: SocialIntelligenceRecommendation[]
  experiments: SocialIntelligenceRecommendation[]
  data_gaps: SocialIntelligenceFinding[]
  evidence: SocialIntelligenceEvidence[]
  source_manifest: Record<string, unknown>
}

function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null }
function median(values: Array<number | null | undefined>) {
  const sorted = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function pct(numerator: number, denominator: number) { return denominator > 0 ? (numerator / denominator) * 100 : null }
function change(current: number | null, previous: number | null) { return current !== null && previous !== null && previous > 0 ? ((current - previous) / previous) * 100 : null }
function metric(posts: SocialPerformancePostObservation[], key: "reach" | "views" | "interactions" | "shares" | "saves") { return posts.map(post => numberOrNull(post[key])) }
function currentSnapshot(performance: SocialPerformanceOverview, platform: SocialPerformancePlatform) { return performance.platforms[platform].current }
function previousSnapshot(performance: SocialPerformanceOverview, platform: SocialPerformancePlatform) { return performance.platforms[platform].previous }
function currentPosts(performance: SocialPerformanceOverview, platform: SocialPerformancePlatform) { const snapshot = currentSnapshot(performance, platform); return snapshot ? performance.postObservations.filter(post => post.snapshotId === snapshot.id) : [] }
function sourceSnapshot(snapshot: SocialPerformanceSnapshot | null) { return snapshot ? [{ table: "social_performance_snapshots", id: snapshot.id }] : [] }
function sourcePosts(posts: SocialPerformancePostObservation[]) { return posts.map(post => ({ table: "social_performance_post_observations", id: post.id, provider_post_id: post.providerPostId })) }
function sourceRows(table: string, rows: Array<{ id: string }>) { return rows.map(row => ({ table, id: row.id })) }
function statement(title: string, detail: string, confidence: SocialIntelligenceConfidence, evidence: SocialIntelligenceEvidence[]): SocialIntelligenceFinding { return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), title, statement: detail, confidence, evidence } }

function comparable(current: SocialPerformanceSnapshot | null, previous: SocialPerformanceSnapshot | null) {
  if (!current || !previous) return false
  const currentDays = Date.parse(`${current.periodEnd}T00:00:00Z`) - Date.parse(`${current.periodStart}T00:00:00Z`)
  const previousDays = Date.parse(`${previous.periodEnd}T00:00:00Z`) - Date.parse(`${previous.periodStart}T00:00:00Z`)
  const contiguous = Date.parse(`${previous.periodEnd}T00:00:00Z`) + 86_400_000 === Date.parse(`${current.periodStart}T00:00:00Z`)
  return Number.isFinite(currentDays) && currentDays === previousDays && contiguous
}

export function deterministicSocialIntelligenceRevision(performance: SocialPerformanceOverview) {
  const payload = {
    snapshots: (["instagram", "facebook"] as const).flatMap(platform => [currentSnapshot(performance, platform), previousSnapshot(performance, platform)]).filter(Boolean).map(snapshot => ({ id: snapshot!.id, synced_at: snapshot!.syncedAt })),
    posts: performance.postObservations.map(post => ({ id: post.id, snapshot_id: post.snapshotId, observed_at: post.observedAt })),
    followers: performance.followerObservations.map(row => ({ id: row.id, date: row.date, observed_at: row.observedAt })),
    audience: performance.audience ? { id: performance.audience.id, fetched_at: performance.audience.fetchedAt } : null,
    frequency: performance.postingFrequency.map(row => ({ id: row.id, observed_at: row.observedAt })),
  }
  return JSON.stringify(payload)
}

/** Produces auditable recommendations entirely from cached, client-scoped evidence. */
export function buildDeterministicSocialIntelligence(performance: SocialPerformanceOverview): DeterministicSocialIntelligenceArtifact {
  const instagram = currentSnapshot(performance, "instagram")
  const facebook = currentSnapshot(performance, "facebook")
  const igPosts = currentPosts(performance, "instagram")
  const fbPosts = currentPosts(performance, "facebook")
  const start = instagram?.periodStart ?? facebook?.periodStart ?? null
  const end = instagram?.periodEnd ?? facebook?.periodEnd ?? null
  const evidence: SocialIntelligenceEvidence[] = []
  const working: SocialIntelligenceFinding[] = []
  const needsAttention: SocialIntelligenceFinding[] = []
  const nextMoves: SocialIntelligenceRecommendation[] = []
  const experiments: SocialIntelligenceRecommendation[] = []
  const gaps: SocialIntelligenceFinding[] = []
  const add = (entry: SocialIntelligenceEvidence) => { evidence.push(entry); return entry }

  const instagramReach = numberOrNull(instagram?.postReach)
  const facebookReach = numberOrNull(facebook?.postReach)
  const reachTotal = instagramReach !== null && facebookReach !== null ? instagramReach + facebookReach : null
  if (reachTotal && instagramReach !== null && facebookReach !== null) {
    const contribution = pct(instagramReach, reachTotal)
    const entry = add({ signal_key: "instagram_reach_contribution", finding: `Instagram contributed ${contribution?.toFixed(1)}% of compatible cached post reach.`, period: { start, end, comparable_to_previous: false }, sample_size: igPosts.length + fbPosts.length, confidence: "high", metrics: { instagram_reach: instagramReach, facebook_reach: facebookReach, compatible_reach_total: reachTotal, instagram_share_percent: contribution }, source_refs: [...sourceSnapshot(instagram), ...sourceSnapshot(facebook)], method: "Sum only the normalized post-reach field across matching current platform windows; never substitute impressions or views." })
    working.push(statement("Instagram carries the current reach", entry.finding, "high", [entry]))
    nextMoves.push({ ...statement("Plan Instagram-first, retain mapped distribution", "Use Instagram as the primary performance surface for the next planning cycle while retaining Facebook as a distribution channel. This follows current reach contribution, not an assumption about audience value.", "high", [entry]), recommended_action: "Prioritize the next cycle’s measurement plan and creative review around Instagram reach, then evaluate Facebook separately.", metric_to_watch: "Compatible Instagram and Facebook post reach in the next equivalent period.", classification: "next_move" })
  } else {
    gaps.push(statement("Compatible platform contribution is unavailable", "A complete current post-reach value is required from both platforms before Jarvis can calculate a cross-platform contribution.", "low", []))
  }

  for (const [platform, current, previous, posts] of [["instagram", instagram, previousSnapshot(performance, "instagram"), igPosts], ["facebook", facebook, previousSnapshot(performance, "facebook"), fbPosts]] as const) {
    if (!comparable(current, previous)) continue
    const currentReach = numberOrNull(current?.postReach); const previousReach = numberOrNull(previous?.postReach)
    const currentViews = numberOrNull(current?.views); const previousViews = numberOrNull(previous?.views)
    const currentInteractions = numberOrNull(current?.engagements); const previousInteractions = numberOrNull(previous?.engagements)
    const reachChange = change(currentReach, previousReach)
    if (reachChange !== null) {
      const entry = add({ signal_key: `${platform}_reach_period_change`, finding: `${platform === "instagram" ? "Instagram" : "Facebook"} compatible post reach changed ${reachChange >= 0 ? "+" : ""}${reachChange.toFixed(1)}% versus the prior equivalent period.`, period: { start: current!.periodStart, end: current!.periodEnd, comparable_to_previous: true }, sample_size: posts.length, confidence: posts.length >= 10 ? "high" : "medium", metrics: { current_reach: currentReach, previous_reach: previousReach, reach_change_percent: reachChange, current_views: currentViews, previous_views: previousViews, current_interactions: currentInteractions, previous_interactions: previousInteractions }, source_refs: [...sourceSnapshot(current), ...sourceSnapshot(previous)], method: "Compare the same platform’s contiguous, equal-length cached periods. Reach, views and interactions remain separate metrics." })
      if (reachChange >= 0) working.push(statement(`${platform === "instagram" ? "Instagram" : "Facebook"} reach improved`, entry.finding, entry.confidence, [entry]))
      else needsAttention.push(statement(`${platform === "instagram" ? "Instagram" : "Facebook"} reach needs review`, entry.finding, entry.confidence, [entry]))
    }
  }

  if (igPosts.length >= 5) {
    const baseline = median(metric(igPosts, "reach"))
    const top = [...igPosts].filter(post => post.reach !== null).sort((a, b) => (b.reach ?? -Infinity) - (a.reach ?? -Infinity))[0]
    if (top && baseline !== null && (top.reach ?? 0) >= baseline * 2) {
      const ratio = (top.reach ?? 0) / baseline
      const entry = add({ signal_key: "instagram_top_post_reach_outlier", finding: `One Instagram post reached ${top.reach?.toLocaleString("en")} versus a period median of ${baseline.toLocaleString("en")} (${ratio.toFixed(1)}×).`, period: { start, end, comparable_to_previous: false }, sample_size: igPosts.length, confidence: "low", metrics: { top_post_reach: top.reach, median_post_reach: baseline, outlier_multiple: ratio, top_post_shares: top.shares, top_post_saves: top.saves }, source_refs: sourcePosts([top]), method: "Rank only Instagram posts in the current cached snapshot and compare the top reach to the client-period median. A one-post outlier is a test signal, not a content rule." })
      experiments.push({ ...statement("Re-test the top-post pattern under control", "One post materially exceeded the period median. Repeat a controlled variation only after its visible creative structure is traceably classified; the current cache does not establish a theme or causal reason.", "low", [entry]), recommended_action: "Create one controlled follow-up concept with a documented creative hypothesis, then compare reach, shares and saves against the Instagram median.", metric_to_watch: "Instagram reach, shares and saves versus the current-period median.", classification: "experiment" })
    }
    const topShare = [...igPosts].filter(post => post.shares !== null).sort((a, b) => (b.shares ?? -Infinity) - (a.shares ?? -Infinity))[0]
    const medianShares = median(metric(igPosts, "shares"))
    if (topShare && medianShares !== null && (topShare.shares ?? 0) >= Math.max(3, medianShares * 3)) {
      const entry = add({ signal_key: "instagram_share_outlier", finding: `One Instagram post generated ${topShare.shares?.toLocaleString("en")} shares versus a period median of ${medianShares.toLocaleString("en")}.`, period: { start, end, comparable_to_previous: false }, sample_size: igPosts.length, confidence: "low", metrics: { top_post_shares: topShare.shares, median_post_shares: medianShares, top_post_reach: topShare.reach, top_post_saves: topShare.saves }, source_refs: sourcePosts([topShare]), method: "Compare shares only within current Instagram post observations. The result is an outlier hypothesis, not a theme classification." })
      experiments.push({ ...statement("Validate the share outlier", "A single post has an unusually strong sharing signal. Its theme is not classified in the retained evidence, so use it as a controlled repeat-test rather than a broad creative rule.", "low", [entry]), recommended_action: "Record a human-reviewed classification for the post’s creative ingredients before testing one comparable variation.", metric_to_watch: "Instagram shares per post relative to the client-period median.", classification: "experiment" })
    }
  } else gaps.push(statement("Post-level baseline is too small", "At least five current Instagram post observations with returned reach are needed before Jarvis can calculate a median and outlier test.", "low", []))

  const followerPoints = performance.followerObservations.filter(point => point.platform === "instagram").sort((a, b) => a.date.localeCompare(b.date))
  if (followerPoints.length >= 2) {
    const first = followerPoints[0]; const last = followerPoints.at(-1)!; const growth = last.followers - first.followers
    const entry = add({ signal_key: "instagram_follower_history_change", finding: `Instagram followers changed by ${growth >= 0 ? "+" : ""}${growth.toLocaleString("en")} across ${followerPoints.length} retained observations.`, period: { start: first.date, end: last.date, comparable_to_previous: false }, sample_size: followerPoints.length, confidence: followerPoints.length >= 30 ? "high" : "medium", metrics: { first_followers: first.followers, last_followers: last.followers, follower_change: growth }, source_refs: sourceRows("social_follower_observations", [first, last]), method: "Compare the first and latest retained Instagram follower observations. This is a history signal, not an attribution claim." })
    ;(growth >= 0 ? working : needsAttention).push(statement("Instagram follower trajectory", entry.finding, entry.confidence, [entry]))
  } else gaps.push(statement("Follower trend is unavailable", "At least two retained Instagram follower observations are required to calculate a trajectory.", "low", []))

  const audience = performance.audience
  if (audience) {
    const dominantAge = [...audience.ageDistribution].sort((a, b) => b.percent - a.percent)[0]
    const dominantCity = [...audience.topCities].sort((a, b) => b.percent - a.percent)[0]
    if (dominantAge || dominantCity) {
      const entry = add({ signal_key: "instagram_audience_concentration", finding: `The latest retained Instagram audience snapshot is concentrated in ${dominantCity ? `${dominantCity.label} (${dominantCity.percent.toFixed(1)}%)` : "no returned city dimension"}${dominantAge ? `, with ${dominantAge.label} the largest returned age band (${dominantAge.percent.toFixed(1)}%)` : ""}.`, period: { start: audience.periodStart, end: audience.periodEnd, comparable_to_previous: false }, sample_size: dominantCity?.count ?? dominantAge?.count ?? 0, confidence: "medium", metrics: { dominant_city_percent: dominantCity?.percent ?? null, dominant_age_percent: dominantAge?.percent ?? null }, source_refs: [{ table: "social_audience_snapshots", id: audience.id }], method: "Use the provider-returned audience dimension snapshot as an account observation. It does not replace approved Client Brain audience truth." })
      working.push(statement("Audience snapshot has a clear concentration", entry.finding, "medium", [entry]))
      nextMoves.push({ ...statement("Keep local relevance visible", "Use the approved DemoClientB Business Bay context alongside the observed Instagram audience concentration when reviewing next-cycle concepts. Treat the snapshot as a measurement signal, not a replacement for Client Brain audience truth.", "medium", [entry]), recommended_action: "Include a measured local-relevance check in the next planning brief; do not alter Client Brain audience records automatically.", metric_to_watch: "Instagram reach and saved/shared responses by concept after the next equivalent period.", classification: "next_move" })
    }
  } else gaps.push(statement("Audience dimensions are not cached", "No retained Instagram audience snapshot is available, so demographic or location conclusions are withheld.", "low", []))

  const formatGroups = new Map<string, SocialPerformancePostObservation[]>()
  for (const post of igPosts) formatGroups.set(post.postType, [...(formatGroups.get(post.postType) ?? []), post])
  const comparableFormats = [...formatGroups.entries()].filter(([, posts]) => posts.length >= 3 && posts.some(post => post.reach !== null))
  if (comparableFormats.length < 2) gaps.push(statement("Format comparison is not yet evidenced", "Jarvis needs at least two Instagram formats with three or more posts and returned reach before comparing formats. It will not treat one Reel or an uncategorized post as a format rule.", "low", []))

  const cadenceRows = performance.postingFrequency.filter(row => row.platform === "instagram")
  if (!cadenceRows.length) gaps.push(statement("Posting-frequency observation is unavailable", "No retained Instagram posting-frequency observation is available for a cadence test.", "low", []))
  else experiments.push({ ...statement("Test cadence without assigning causality", "Provider frequency buckets are available, but they do not establish that cadence caused performance. A controlled next-cycle test is more reliable than increasing volume by assumption.", "low", [{ signal_key: "instagram_posting_frequency_observation", finding: `${cadenceRows.length} retained Instagram posting-frequency buckets are available for test design.`, period: { start, end, comparable_to_previous: false }, sample_size: cadenceRows.reduce((total, row) => total + row.weeksCount, 0), confidence: "low", metrics: { bucket_count: cadenceRows.length, observed_weeks: cadenceRows.reduce((total, row) => total + row.weeksCount, 0) }, source_refs: sourceRows("social_posting_frequency_snapshots", cadenceRows), method: "Use provider posting-frequency observations only to design a controlled cadence test; do not infer causal timing or volume effects." }]), recommended_action: "Hold creative mix as steady as practical across a defined cadence test and compare platform-specific reach and interactions after an equivalent period.", metric_to_watch: "Platform-specific post reach and interactions; no cross-platform engagement-rate average.", classification: "experiment" })

  const summary = [
    start && end ? `This deterministic review covers cached Social evidence for ${start} to ${end}.` : "This deterministic review covers the latest available cached Social evidence.",
    working[0]?.statement ?? "No high-confidence working signal is available yet.",
    needsAttention[0]?.statement ?? "No period-level decline was established from the available comparable evidence.",
    experiments[0]?.statement ?? "No experiment is recommended until more retained evidence is available.",
  ].slice(0, 5)
  return { artifact_version: "v1", deterministic: true, period_start: start, period_end: end, executive_summary: summary, working: working.slice(0, 5), needs_attention: needsAttention.slice(0, 5), recommended_next_moves: nextMoves.slice(0, 5), experiments: experiments.slice(0, 5), data_gaps: gaps.slice(0, 5), evidence, source_manifest: { source: "cached_social_performance", client_id: performance.clientId, snapshot_ids: [instagram?.id, facebook?.id].filter(Boolean), current_post_observation_count: igPosts.length + fbPosts.length, follower_observation_count: followerPoints.length, audience_snapshot_id: audience?.id ?? null, provider_calls: 0, model_calls: 0 } }
}
