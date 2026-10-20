import type { SocialPerformancePlatform, SocialPerformanceSnapshot } from "./social-performance"

export type SocialMetricKey = "audience" | "reach" | "views" | "interactions" | "link_clicks" | "impressions" | "provider_engagement_rate"
export type SocialMetricScope = "account_state" | "post_aggregate" | "provider_post_average"
export type SocialMetricUnit = "count" | "percent"

export type SocialMetricDefinition = {
  key: SocialMetricKey
  label: string
  sourceField: keyof Pick<SocialPerformanceSnapshot, "followers" | "postReach" | "impressions" | "views" | "engagements" | "engagementRate" | "linkClicks">
  scope: SocialMetricScope
  unit: SocialMetricUnit
  /** A false value deliberately prevents a dashboard-wide total. */
  crossPlatform: boolean
  comparison: "period" | "none"
  notes: string
}

/**
 * The single semantic contract for every social dashboard number.  A metric
 * cannot be substituted with a neighbouring field (for example impressions
 * for views) and provider averages can never be averaged across platforms.
 */
export const SOCIAL_ANALYTICS_METRICS: Record<SocialMetricKey, SocialMetricDefinition> = {
  audience: { key: "audience", label: "Audience", sourceField: "followers", scope: "account_state", unit: "count", crossPlatform: true, comparison: "none", notes: "Connected-account follower state at sync time; not a 30-day result." },
  reach: { key: "reach", label: "Reach", sourceField: "postReach", scope: "post_aggregate", unit: "count", crossPlatform: true, comparison: "period", notes: "Sum of returned post reach in the same period and provider scope." },
  views: { key: "views", label: "Views", sourceField: "views", scope: "post_aggregate", unit: "count", crossPlatform: true, comparison: "period", notes: "Only the normalized provider views field. Impressions are never used as a fallback." },
  interactions: { key: "interactions", label: "Interactions", sourceField: "engagements", scope: "post_aggregate", unit: "count", crossPlatform: true, comparison: "period", notes: "Returned likes + comments + shares + saves where supplied by the provider." },
  link_clicks: { key: "link_clicks", label: "Link clicks", sourceField: "linkClicks", scope: "post_aggregate", unit: "count", crossPlatform: true, comparison: "period", notes: "Only provider-reported post click totals; small bases are displayed as an absolute change." },
  impressions: { key: "impressions", label: "Impressions", sourceField: "impressions", scope: "post_aggregate", unit: "count", crossPlatform: false, comparison: "period", notes: "Platform-specific exposure metric; never labelled as views." },
  provider_engagement_rate: { key: "provider_engagement_rate", label: "Engagement rate", sourceField: "engagementRate", scope: "provider_post_average", unit: "percent", crossPlatform: false, comparison: "period", notes: "Zernio currently returns post-level rates only. Jarvis withholds an aggregate rate until its denominator and weighting are verified." },
}

const PLATFORMS: SocialPerformancePlatform[] = ["instagram", "facebook"]

export type MetricValue = {
  value: number | null
  unavailableReason?: string
  definition: SocialMetricDefinition
  platforms: SocialPerformancePlatform[]
}

export type MetricComparison = {
  current: MetricValue
  previous: MetricValue
  percent: number | null
  absolute: number | null
  display: "percent" | "absolute" | "none"
  unavailableReason?: string
}

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) }

function snapshotsFor(input: Partial<Record<SocialPerformancePlatform, SocialPerformanceSnapshot | null>>, platforms: SocialPerformancePlatform[]) {
  const snapshots = platforms.map(platform => input[platform] ?? null)
  if (snapshots.some(snapshot => !snapshot)) return { snapshots: [] as SocialPerformanceSnapshot[], error: "A required platform snapshot is unavailable." }
  return { snapshots: snapshots as SocialPerformanceSnapshot[], error: null }
}

function sharedWindow(snapshots: SocialPerformanceSnapshot[]) {
  const windows = new Set(snapshots.map(snapshot => `${snapshot.periodStart}|${snapshot.periodEnd}`))
  return windows.size === 1 ? [...windows][0] : null
}

function windowBounds(window: string) {
  const [start, end] = window.split("|")
  const startMs = Date.parse(`${start}T00:00:00.000Z`)
  const endMs = Date.parse(`${end}T00:00:00.000Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return { start, end, durationMs: endMs - startMs }
}

export function readMetric(
  snapshotsByPlatform: Partial<Record<SocialPerformancePlatform, SocialPerformanceSnapshot | null>>,
  key: SocialMetricKey,
  platform?: SocialPerformancePlatform,
): MetricValue {
  const definition = SOCIAL_ANALYTICS_METRICS[key]
  const platforms = platform ? [platform] : PLATFORMS
  if (key === "provider_engagement_rate") return { value: null, unavailableReason: "Only post-level engagement rates are stored; no verified aggregate denominator or weighting is available.", definition, platforms }
  if (!platform && !definition.crossPlatform) return { value: null, unavailableReason: `${definition.label} is platform-specific and cannot be combined.`, definition, platforms }
  const result = snapshotsFor(snapshotsByPlatform, platforms)
  if (result.error) return { value: null, unavailableReason: result.error, definition, platforms }
  if (definition.scope !== "account_state" && !platform && !sharedWindow(result.snapshots)) return { value: null, unavailableReason: "Platform snapshots cover different date windows; the aggregate is withheld.", definition, platforms }
  const values = result.snapshots.map(snapshot => snapshot[definition.sourceField])
  if (values.some(value => !finite(value))) return { value: null, unavailableReason: `${definition.label} was not supplied for every required platform; no zero or neighbouring-metric fallback was applied.`, definition, platforms }
  return { value: (values as number[]).reduce((total, value) => total + value, 0), definition, platforms }
}

export function compareMetric(
  current: Partial<Record<SocialPerformancePlatform, SocialPerformanceSnapshot | null>>,
  previous: Partial<Record<SocialPerformancePlatform, SocialPerformanceSnapshot | null>>,
  key: SocialMetricKey,
  platform?: SocialPerformancePlatform,
): MetricComparison {
  const currentValue = readMetric(current, key, platform)
  const previousValue = readMetric(previous, key, platform)
  const definition = currentValue.definition
  if (definition.comparison === "none" || currentValue.value === null || previousValue.value === null) return { current: currentValue, previous: previousValue, percent: null, absolute: null, display: "none" }
  const currentSnapshots = snapshotsFor(current, platform ? [platform] : PLATFORMS).snapshots
  const previousSnapshots = snapshotsFor(previous, platform ? [platform] : PLATFORMS).snapshots
  const currentWindow = sharedWindow(currentSnapshots)
  const previousWindow = sharedWindow(previousSnapshots)
  if (!currentWindow || !previousWindow) return { current: currentValue, previous: previousValue, percent: null, absolute: null, display: "none", unavailableReason: "Period comparison withheld because the platform date windows do not match." }
  const currentBounds = windowBounds(currentWindow)
  const previousBounds = windowBounds(previousWindow)
  const contiguous = currentBounds && previousBounds ? Date.parse(`${previousBounds.end}T00:00:00.000Z`) + 86_400_000 === Date.parse(`${currentBounds.start}T00:00:00.000Z`) : false
  if (!currentBounds || !previousBounds || currentBounds.durationMs !== previousBounds.durationMs || !contiguous) return { current: currentValue, previous: previousValue, percent: null, absolute: null, display: "none", unavailableReason: "Period comparison withheld because the cached windows are not equivalent contiguous periods." }
  const absolute = currentValue.value - previousValue.value
  if (previousValue.value <= 0) return { current: currentValue, previous: previousValue, percent: null, absolute, display: "absolute" }
  const percent = (absolute / previousValue.value) * 100
  // Percentages on a very small base exaggerate an operationally tiny change.
  return { current: currentValue, previous: previousValue, percent, absolute, display: definition.unit === "count" && Math.abs(previousValue.value) < 20 ? "absolute" : "percent" }
}

export type SocialInsight = { id: string; title: string; recommendation: string; evidence: string; status: "actionable" | "insufficient_data" }

/** Deterministic, cached-snapshot intelligence. This does not write Client Brain. */
export function buildSocialInsights(current: Partial<Record<SocialPerformancePlatform, SocialPerformanceSnapshot | null>>): SocialInsight[] {
  const reach = readMetric(current, "reach")
  const instagramReach = readMetric(current, "reach", "instagram")
  const facebookReach = readMetric(current, "reach", "facebook")
  if (reach.value === null || instagramReach.value === null || facebookReach.value === null || reach.value <= 0) return [{ id: "coverage", title: "Need a complete cached period", recommendation: "Refresh Insights only when a new provider read is intended.", evidence: "One or more required platform fields are unavailable; Jarvis will not infer a total.", status: "insufficient_data" }]
  const instagramShare = (instagramReach.value / reach.value) * 100
  return [
    { id: "platform-contribution", title: "Instagram is carrying organic reach", recommendation: "Prioritize Instagram-first creative planning while retaining Facebook as a mapped distribution channel.", evidence: `Instagram supplied ${instagramShare.toFixed(1)}% of the ${reach.value.toLocaleString("en")} cached post-reach total (${instagramReach.value.toLocaleString("en")} vs Facebook ${facebookReach.value.toLocaleString("en")}).`, status: "actionable" },
    { id: "content-evidence-gap", title: "Content-pattern evidence is incomplete", recommendation: "Use a future explicit refresh to cache richer post metadata before making format, food, or timing recommendations.", evidence: "The current local snapshot retains only top-post metrics, not enough categorized content evidence to make a defensible format recommendation.", status: "insufficient_data" },
  ]
}
