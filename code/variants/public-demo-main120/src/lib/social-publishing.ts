export const SOCIAL_PUBLISHING_PLATFORMS = ["instagram", "facebook", "linkedin"] as const
export const SOCIAL_PUBLISHING_STATUSES = ["Draft", "Needs Caption", "Ready for Review", "Approved", "Scheduled", "Publishing", "Published", "Failed"] as const
export const SOCIAL_CONTENT_SOURCES = ["manual_upload", "monthly_plan", "ai_content", "existing_asset"] as const

export type SocialPublishingPlatform = typeof SOCIAL_PUBLISHING_PLATFORMS[number]
export type SocialPublishingStatus = typeof SOCIAL_PUBLISHING_STATUSES[number]
export type SocialContentSource = typeof SOCIAL_CONTENT_SOURCES[number]
export type SocialContentKind = "feed" | "reel" | "story"
export type SocialContentFormat = "feed" | "carousel" | "reel" | "story"

export type SocialContentCaptionOption = {
  id: string
  optionNumber: number
  body: string
  dynamicHashtags: string[]
  renderedCaption: string | null
  source: "mock" | "ai" | "manual"
  selectedAt: string | null
  rejectedAt: string | null
  validationStatus: "ready" | "needs_review" | "blocked"
  validationDiagnostics: { code: string; message: string; status: "needs_review" | "blocked" }[]
}

export type SocialCaptionGenerationSummary = {
  id: string
  provider: string
  model: string
  promptVersion: string
  createdAt: string | null
  status: string
  creativeQuality: string | null
  validationStatus: "ready" | "needs_review" | "blocked"
}

export type SocialContentMedia = {
  id: string
  fileName: string
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  sortOrder: number
  cropX: number
  cropY: number
  signedUrl: string | null
}

export type SocialContentPlatformTarget = {
  id: string
  platform: SocialPublishingPlatform
  selected: boolean
  status: SocialPublishingStatus | "Draft"
}

export type SocialProviderExecutionSummary = {
  id: string
  status: "pending" | "requesting" | "recovery_required" | "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled"
  provider: "zernio"
  providerPostId: string | null
  failureDiagnostic: string | null
  scheduledForUtc: string | null
}

export type SocialContentItem = {
  id: string
  source: SocialContentSource
  contentKind: SocialContentKind
  format: SocialContentFormat
  title: string | null
  scheduleLabel: string | null
  notes: string | null
  sequence: number
  status: SocialPublishingStatus
  scheduledDate: string | null
  scheduledTime: string | null
  scheduledAt: string | null
  dateLocked: boolean
  timeSelectionSource: "manual" | "client_default" | "insight" | "historical" | "unavailable"
  timeRecommendation: Record<string, unknown>
  storyScheduleSlotId: string | null
  selectedCaptionOptionId: string | null
  finalCaption: string | null
  captionSelectedAt: string | null
  captionEditedAt: string | null
  captionApprovedAt: string | null
  publishingPayloadVersion: number
  scheduledPayloadVersion: number | null
  scheduledPayloadStale: boolean
  plannerSyncedPayloadVersion: number | null
  plannerSyncedAt: string | null
  contentContext: import("@/lib/social-publishing-content-context").SocialContentContext
  contentUnderstanding: import("@/lib/social-content-understanding").SocialContentUnderstanding | null
  media: SocialContentMedia[]
  captionOptions: SocialContentCaptionOption[]
  activeCaptionGeneration: SocialCaptionGenerationSummary | null
  platformTargets: SocialContentPlatformTarget[]
  providerExecution: SocialProviderExecutionSummary | null
}

export type SocialStoryScheduleSlot = {
  id: string
  weekday: number
  localTime: string
  label: string
  sortOrder: number
  active: boolean
}

export type SocialStoryPlacement = {
  id: string
  socialContentItemId: string
  storyScheduleSlotId: string | null
  scheduledDate: string
  scheduledTime: string
  scheduledAt: string
  sequence: number
  status: Extract<SocialPublishingStatus, "Draft" | "Ready for Review" | "Approved" | "Scheduled" | "Publishing" | "Published" | "Failed">
  plannerSyncedPayloadVersion: number | null
  plannerSyncedAt: string | null
  scheduledPayloadStale: boolean
}

export type SocialPlannerEntry = {
  id: string
  contentItemId: string
  storyPlacementId?: string | null
  contentKind: SocialContentKind
  format: SocialContentFormat
  title: string | null
  status: SocialPublishingStatus
  scheduledDate: string
  scheduledTime: string
  scheduledAt: string
  finalCaption: string | null
  platformTargets: SocialContentPlatformTarget[]
  media: SocialContentMedia[]
  scheduledPayloadStale: boolean
  publishingPayloadVersion: number
  plannerSyncedPayloadVersion: number | null
  plannerSyncedAt: string | null
  providerExecution: SocialProviderExecutionSummary | null
}

export type SocialPlannerReadiness = {
  state: "ready" | "needs_attention"
  reasons: string[]
}

/**
 * Planner readiness is intentionally separate from provider execution. A post can be
 * ready for the calendar while Zernio is not connected.
 */
export function plannerReadiness(item: Pick<SocialContentItem, "contentKind" | "media" | "finalCaption" | "captionApprovedAt" | "scheduledDate" | "scheduledTime" | "platformTargets" | "scheduledPayloadStale">): SocialPlannerReadiness {
  const reasons: string[] = []
  if (item.media.length === 0) reasons.push("Final media missing")
  if (item.contentKind === "feed" && !item.finalCaption) reasons.push("Final caption missing")
  if (item.contentKind === "feed" && !item.captionApprovedAt) reasons.push("Caption needs approval")
  if (!item.scheduledDate) reasons.push("Date missing")
  if (!item.scheduledTime) reasons.push("Time missing")
  if (!item.platformTargets.some(target => target.selected)) reasons.push("Platform missing")
  if (item.scheduledPayloadStale) reasons.push("Updated in Publishing")
  return { state: reasons.length ? "needs_attention" : "ready", reasons }
}

export type SocialPublishingMonth = {
  id: string
  monthStart: string
  timezone: string
  feedStartDate: string | null
  feedIntervalDays: number
}

export type SocialPublishingWorkspace = {
  month: SocialPublishingMonth
  items: SocialContentItem[]
  storySlots: SocialStoryScheduleSlot[]
  storyPlacements: SocialStoryPlacement[]
  plannerEntries: SocialPlannerEntry[]
  connectionMode: "offline"
  postingTimeAvailability: "unavailable"
}

export function monthStartFromInput(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null
}

export function shortMonthLabel(monthStart: string) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart}T00:00:00Z`))
}

export function platformLabel(platform: SocialPublishingPlatform) {
  return platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : "LinkedIn"
}

export function statusClass(status: string) {
  if (status === "Approved") return "border-sky-300/30 bg-sky-400/10 text-sky-100"
  if (status === "Scheduled") return "border-violet-300/30 bg-violet-400/10 text-violet-100"
  if (status === "Published") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
  if (status === "Failed") return "border-red-300/30 bg-red-400/10 text-red-100"
  if (status === "Ready for Review") return "border-amber-300/30 bg-amber-400/10 text-amber-100"
  if (status === "Needs Caption") return "border-orange-300/30 bg-orange-400/10 text-orange-100"
  return "border-white/10 bg-white/[0.04] text-white/55"
}

export function weekdayLabel(weekday: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday] ?? "Unknown"
}

export function itemThumbnail(item: SocialContentItem) {
  return item.media[0]?.signedUrl ?? null
}
