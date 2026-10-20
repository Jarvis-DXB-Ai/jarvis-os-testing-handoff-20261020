/**
 * Pure, provider-neutral Social execution contract.
 *
 * It deliberately has no fetch or database dependency. The future server
 * executor will reserve a durable execution, load this exact canonical
 * snapshot, create temporary provider-readable URLs at dispatch time, and only
 * then call the Zernio adapter with the same idempotency key.
 */

export type SocialExecutionPlatform = "instagram" | "facebook"
export type SocialExecutionStatus = "pending" | "requesting" | "recovery_required" | "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled"
export type JarvisPublishingStatus = "Draft" | "Ready" | "Approved" | "Scheduled" | "Publishing" | "Published" | "Failed" | "Cancelled"

export type CanonicalSocialMedia = {
  id: string
  storageBucket: string
  storagePath: string
  contentSha256: string | null
  mimeType: string
  sortOrder: number
}

export type CanonicalSocialTarget = {
  id: string
  platform: string
  selected: boolean
  status: string
}

export type ExplicitSocialProviderConnection = {
  id: string
  clientId: string
  provider: "zernio"
  providerConnectionId: string | null
  platform: string
  platformAccountId: string | null
  status: string
}

export type CanonicalSocialScheduleItem = {
  id: string
  clientId: string
  contentKind: string
  format: string
  status: string
  finalCaption: string | null
  captionApprovedAt: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  timezone: string
  publishingPayloadVersion: number
  plannerSyncedAt: string | null
  scheduledPayloadStale: boolean
}

export type ScheduleEligibility =
  | { eligible: true; selectedPlatforms: SocialExecutionPlatform[] }
  | { eligible: false; reasons: string[] }

export type ZernioMediaItem = { type: "image" | "video"; url: string }
export type ZernioSchedulePayload = {
  content: string
  mediaItems: ZernioMediaItem[]
  platforms: Array<{ platform: SocialExecutionPlatform; accountId: string; platformSpecificData?: { contentType: "story" | "reel" } }>
  scheduledFor: string
  timezone: "Asia/Dubai"
}

const executablePlatforms = new Set<SocialExecutionPlatform>(["instagram", "facebook"])

function isExecutionPlatform(value: string): value is SocialExecutionPlatform {
  return executablePlatforms.has(value as SocialExecutionPlatform)
}

function present(value: string | null | undefined) {
  return Boolean(value && value.trim())
}

const supportedMediaMimes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"])

export function isSupportedZernioMediaMime(mimeType: string) {
  return supportedMediaMimes.has(mimeType.toLowerCase())
}

export function isCanonicalDubaiTimezone(timezone: string | null | undefined) {
  return timezone === "Asia/Dubai"
}

export function scheduledDubaiInstant(date: string | null | undefined, time: string | null | undefined, timezone: string | null | undefined) {
  if (!date || !time || !isCanonicalDubaiTimezone(timezone)) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const instant = new Date(`${date}T${time}:00+04:00`)
  if (!Number.isFinite(instant.getTime())) return null
  return { local: `${date}T${time}:00`, utc: instant.toISOString() }
}

/**
 * This gate is intentionally strict. A planner snapshot alone is not external
 * scheduling, but it ensures dispatch uses the same approved payload version.
 */
export function evaluateSchedulingEligibility(input: {
  item: CanonicalSocialScheduleItem
  targets: CanonicalSocialTarget[]
  media: CanonicalSocialMedia[]
  connections: ExplicitSocialProviderConnection[]
  now?: Date
}): ScheduleEligibility {
  const { item, targets, media, connections } = input
  const reasons: string[] = []
  if (item.status !== "Approved") reasons.push("Publishing item must be Approved before external scheduling.")
  if (!present(item.finalCaption)) reasons.push("Approved final caption is required.")
  if (!present(item.captionApprovedAt)) reasons.push("Caption approval timestamp is required.")
  if (!present(item.scheduledDate) || !present(item.scheduledTime)) reasons.push("Planner date and time are required.")
  if (!isCanonicalDubaiTimezone(item.timezone)) reasons.push("DemoClientB scheduling must use Asia/Dubai.")
  const scheduled = scheduledDubaiInstant(item.scheduledDate, item.scheduledTime, item.timezone)
  if (item.scheduledDate && item.scheduledTime && !scheduled) reasons.push("Planner date and time are invalid for Asia/Dubai.")
  if (scheduled && scheduled.utc <= (input.now ?? new Date()).toISOString()) reasons.push("Scheduled time must be in the future.")
  if (!present(item.plannerSyncedAt)) reasons.push("Item must be handed off to Planner before external scheduling.")
  if (item.scheduledPayloadStale) reasons.push("Planner payload is stale and must be re-synced before external scheduling.")
  if (media.length === 0) reasons.push("Canonical final media is required.")
  const unsupportedMedia = media.filter(asset => !isSupportedZernioMediaMime(asset.mimeType))
  if (unsupportedMedia.length) reasons.push(`Unsupported media type(s): ${unsupportedMedia.map(asset => asset.mimeType).join(", ")}.`)

  const selectedTargets = targets.filter(target => target.selected)
  const unsupported = selectedTargets.filter(target => !isExecutionPlatform(target.platform))
  if (selectedTargets.length === 0) reasons.push("At least one supported platform target is required.")
  if (unsupported.length > 0) reasons.push(`Unsupported provider target(s): ${unsupported.map(target => target.platform).join(", ")}.`)

  for (const target of selectedTargets) {
    if (!isExecutionPlatform(target.platform)) continue
    const connection = connections.find(candidate => candidate.clientId === item.clientId
      && candidate.provider === "zernio"
      && candidate.platform === target.platform
      && candidate.status === "connected"
      && present(candidate.providerConnectionId)
      && present(candidate.platformAccountId))
    if (!connection) reasons.push(`No explicit connected Zernio ${target.platform} account is mapped to this client.`)
  }

  return reasons.length
    ? { eligible: false, reasons }
    : { eligible: true, selectedPlatforms: selectedTargets.map(target => target.platform as SocialExecutionPlatform) }
}

export function zernioStatusToExecutionStatus(status: string | null | undefined): SocialExecutionStatus {
  switch ((status ?? "").toLowerCase()) {
    case "scheduled": return "scheduled"
    case "publishing": return "publishing"
    case "published": return "published"
    case "partial": return "partial"
    case "failed": return "failed"
    case "cancelled":
    case "canceled": return "cancelled"
    default: return "pending"
  }
}

export function executionStatusToJarvisStatus(status: SocialExecutionStatus): JarvisPublishingStatus {
  switch (status) {
    case "scheduled": return "Scheduled"
    case "publishing": return "Publishing"
    case "published": return "Published"
    case "failed":
    case "partial": return "Failed"
    case "cancelled": return "Cancelled"
    case "pending":
    case "requesting": return "Approved"
    case "recovery_required": return "Approved"
  }
}

function mediaType(mimeType: string): "image" | "video" {
  return mimeType.startsWith("video/") ? "video" : "image"
}

/** The final caption is used byte-for-byte. This function never trims or assembles it. */
export function buildZernioSchedulePayload(input: {
  item: CanonicalSocialScheduleItem
  targets: CanonicalSocialTarget[]
  media: CanonicalSocialMedia[]
  connections: ExplicitSocialProviderConnection[]
  providerReadableMediaUrls: ReadonlyMap<string, string>
}): ZernioSchedulePayload {
  const eligibility = evaluateSchedulingEligibility(input)
  if (!eligibility.eligible) throw new Error(eligibility.reasons.join(" "))
  if (!input.item.finalCaption || !input.item.scheduledDate || !input.item.scheduledTime) throw new Error("Canonical scheduling payload is incomplete.")

  const mediaItems = [...input.media]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(media => {
      const url = input.providerReadableMediaUrls.get(media.id)
      if (!present(url)) throw new Error(`Provider-readable URL missing for canonical media ${media.id}.`)
      return { type: mediaType(media.mimeType), url: url! }
    })
  const platforms = input.targets.filter(target => target.selected && isExecutionPlatform(target.platform)).map(target => {
    const connection = input.connections.find(candidate => candidate.clientId === input.item.clientId
      && candidate.provider === "zernio"
      && candidate.platform === target.platform
      && candidate.status === "connected"
      && present(candidate.platformAccountId))
    if (!connection?.platformAccountId) throw new Error(`Explicit account mapping unavailable for ${target.platform}.`)
    const platformSpecificData = input.item.format === "story"
      ? { contentType: "story" as const }
      : input.item.format === "reel" ? { contentType: "reel" as const } : undefined
    return { platform: target.platform as SocialExecutionPlatform, accountId: connection.platformAccountId, ...(platformSpecificData ? { platformSpecificData } : {}) }
  })

  return {
    content: input.item.finalCaption,
    mediaItems,
    platforms,
    scheduledFor: `${input.item.scheduledDate}T${input.item.scheduledTime}:00`,
    timezone: "Asia/Dubai",
  }
}
