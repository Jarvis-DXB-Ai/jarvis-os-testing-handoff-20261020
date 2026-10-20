import { createHash, randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"
import type {
  SocialContentFormat,
  SocialContentItem,
  SocialContentKind,
  SocialContentSource,
  SocialPublishingMonth,
  SocialPublishingPlatform,
  SocialPublishingStatus,
  SocialPlannerEntry,
  SocialProviderExecutionSummary,
  SocialStoryPlacement,
  SocialPublishingWorkspace,
} from "@/lib/social-publishing"
import { assembleCaption, assessCaptionOptions, buildCaptionRequestContract, captionHashtags, formatCaptionRequestPrompt, offlineCaptionFixture, parseCaptionResponse, type CaptionProfile } from "@/lib/social-publishing-caption"
import { validateCaptionBatchQuality, type CaptionVisualCreativeContext } from "@/lib/social-publishing-caption"
import { captionContextFrom, normalizeSocialContentContext, type SocialContentContext } from "@/lib/social-publishing-content-context"
import { deterministicPostTitle, matchRelevantCaptionTruth, normalizePostTitle, type CaptionTruthRecord } from "@/lib/social-caption-context-enrichment"
import { captionReadiness, offlineUnderstandingFixture, type SocialContentUnderstanding } from "@/lib/social-content-understanding"
import { observeSocialContentImage, type SocialVisionObservation } from "@/lib/social-content-understanding-vision"
import { executeTextRun } from "@/lib/executionEngine"
import { syncCaptionAttachmentForSocialItem } from "@/lib/content-lineage-phase2-server"

const BUCKET = "social-content"
const CAPTION_IMAGE_MAX_DIMENSION = 1800
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const validPlatforms = new Set<SocialPublishingPlatform>(["instagram", "facebook", "linkedin"])
const validStatuses = new Set<SocialPublishingStatus>(["Draft", "Needs Caption", "Ready for Review", "Approved", "Scheduled", "Publishing", "Published", "Failed"])
const validFormats = new Set<SocialContentFormat>(["feed", "carousel", "reel", "story"])

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {}
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function isoDate(value: unknown) {
  const text = stringValue(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function localTime(value: unknown) {
  const text = stringValue(value)
  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text) ? text.slice(0, 5) : null
}

function monthStart(value: unknown) {
  const date = isoDate(value)
  if (!date || !date.endsWith("-01")) throw new Error("monthStart must be the first day of a month.")
  return date
}

function dubaiInstant(date: string | null, time: string | null) {
  if (!date || !time) return null
  return new Date(`${date}T${time}:00+04:00`).toISOString()
}

function nextPayloadState(item: AnyRecord, hasPublishingFieldChanged: boolean) {
  const version = numberValue(item.publishing_payload_version, 1)
  const status = stringValue(item.status)
  if (hasPublishingFieldChanged && status === "Scheduled") {
    return { publishing_payload_version: version + 1, scheduled_payload_stale: true }
  }
  return hasPublishingFieldChanged ? { publishing_payload_version: version + 1 } : {}
}

function monthEnd(monthStartValue: string) {
  const date = new Date(`${monthStartValue}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

function dateInMonth(monthStartValue: string, position: number, intervalDays: number) {
  const date = new Date(`${monthStartValue}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + (position - 1) * intervalDays)
  const candidate = date.toISOString().slice(0, 10)
  return candidate <= monthEnd(monthStartValue) ? candidate : null
}

export async function requirePublishingClient(clientId: string) {
  const { data, error } = await sb.from("clients").select("id, name").eq("id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Client was not found.")
  return data as { id: string; name: string }
}

async function signedUrl(storagePath: string, storageBucket = BUCKET) {
  const { data } = await sb.storage.from(storageBucket).createSignedUrl(storagePath, 60 * 60)
  return data?.signedUrl ?? null
}

function mapUnderstanding(row: AnyRecord | undefined): SocialContentUnderstanding | null {
  if (!row) return null
  return {
    id: stringValue(row.id),
    status: stringValue(row.status, "unknown") as SocialContentUnderstanding["status"],
    confidence: stringValue(row.confidence, "unknown") as SocialContentUnderstanding["confidence"],
    inferredContext: asRecord(row.inferred_context),
    matchCandidates: Array.isArray(row.match_candidates) ? row.match_candidates.filter((candidate): candidate is SocialContentUnderstanding["matchCandidates"][number] => Boolean(candidate && typeof candidate === "object" && typeof asRecord(candidate).assetId === "string")) : [],
    requiresConfirmation: Array.isArray(row.requires_confirmation) ? row.requires_confirmation.filter((value): value is string => typeof value === "string") : [],
    provider: nullableString(row.provider),
    model: nullableString(row.model),
    cached: Boolean(row.cached),
  }
}

function mapItem(row: AnyRecord, mediaRows: AnyRecord[], captionRows: AnyRecord[], targetRows: AnyRecord[], understandingRows: AnyRecord[], generationRows: AnyRecord[], executionRows: AnyRecord[]): SocialContentItem {
  const itemId = stringValue(row.id)
  const activeGenerationId = stringValue(captionRows.find(caption => stringValue(caption.social_content_item_id) === itemId && Boolean(caption.is_current))?.generation_id)
  const activeGeneration = generationRows.find(generation => stringValue(generation.id) === activeGenerationId)
  const execution = executionRows.filter(candidate => stringValue(candidate.social_content_item_id) === itemId).sort((a, b) => stringValue(b.created_at).localeCompare(stringValue(a.created_at)))[0]
  return {
    id: itemId,
    source: stringValue(row.source, "manual_upload") as SocialContentSource,
    contentKind: stringValue(row.content_kind) as SocialContentKind,
    format: stringValue(row.format) as SocialContentFormat,
    title: nullableString(row.title),
    scheduleLabel: nullableString(row.schedule_label),
    notes: nullableString(row.notes),
    sequence: numberValue(row.sequence, 1),
    status: stringValue(row.status, "Draft") as SocialPublishingStatus,
    scheduledDate: nullableString(row.scheduled_date),
    scheduledTime: localTime(row.scheduled_time),
    scheduledAt: nullableString(row.scheduled_at),
    dateLocked: Boolean(row.date_locked),
    timeSelectionSource: stringValue(row.time_selection_source, "manual") as SocialContentItem["timeSelectionSource"],
    timeRecommendation: asRecord(row.time_recommendation),
    storyScheduleSlotId: nullableString(row.story_schedule_slot_id),
    selectedCaptionOptionId: nullableString(row.selected_caption_option_id),
    finalCaption: nullableString(row.final_caption),
    captionSelectedAt: nullableString(row.caption_selected_at),
    captionEditedAt: nullableString(row.caption_edited_at), captionApprovedAt: nullableString(row.caption_approved_at),
    publishingPayloadVersion: numberValue(row.publishing_payload_version, 1),
    scheduledPayloadVersion: typeof row.scheduled_payload_version === "number" ? row.scheduled_payload_version : null,
    scheduledPayloadStale: Boolean(row.scheduled_payload_stale),
    plannerSyncedPayloadVersion: typeof row.planner_synced_payload_version === "number" ? row.planner_synced_payload_version : null,
    plannerSyncedAt: nullableString(row.planner_synced_at),
    contentContext: normalizeSocialContentContext(row.content_context),
    contentUnderstanding: mapUnderstanding(understandingRows.find(understanding => mediaRows.some(media => stringValue(media.id) === stringValue(understanding.social_content_media_id) && stringValue(media.social_content_item_id) === itemId))),
    media: mediaRows
      .filter(media => stringValue(media.social_content_item_id) === itemId)
      .sort((a, b) => numberValue(a.sort_order, 1) - numberValue(b.sort_order, 1))
      .map(media => ({
        id: stringValue(media.id), fileName: stringValue(media.file_name), mimeType: stringValue(media.mime_type),
        byteSize: numberValue(media.byte_size), width: typeof media.width === "number" ? media.width : null,
        height: typeof media.height === "number" ? media.height : null,
        durationSeconds: typeof media.duration_seconds === "number" ? media.duration_seconds : null,
        sortOrder: numberValue(media.sort_order, 1), cropX: numberValue(media.crop_x, 50), cropY: numberValue(media.crop_y, 50),
        signedUrl: stringValue(media.signed_url) || null,
      })),
    captionOptions: captionRows
      .filter(caption => stringValue(caption.social_content_item_id) === itemId && Boolean(caption.is_current))
      .sort((a, b) => numberValue(a.option_number) - numberValue(b.option_number))
      .map(caption => ({ id: stringValue(caption.id), optionNumber: numberValue(caption.option_number), body: stringValue(caption.body), dynamicHashtags: Array.isArray(caption.dynamic_hashtags) ? caption.dynamic_hashtags.filter((tag): tag is string => typeof tag === "string") : [], renderedCaption: nullableString(caption.rendered_caption), source: stringValue(caption.source, "mock") as "mock", selectedAt: nullableString(caption.selected_at), rejectedAt: nullableString(caption.rejected_at), validationStatus: ["ready", "needs_review", "blocked"].includes(stringValue(caption.validation_status)) ? stringValue(caption.validation_status) as "ready" | "needs_review" | "blocked" : "ready", validationDiagnostics: Array.isArray(caption.validation_diagnostics) ? caption.validation_diagnostics.filter((value): value is { code: string; message: string; status: "needs_review" | "blocked" } => Boolean(value && typeof value === "object" && typeof asRecord(value).code === "string" && typeof asRecord(value).message === "string" && (asRecord(value).status === "needs_review" || asRecord(value).status === "blocked"))) : [] })),
    activeCaptionGeneration: activeGeneration ? { id: stringValue(activeGeneration.id), provider: stringValue(activeGeneration.provider), model: stringValue(activeGeneration.model), promptVersion: stringValue(activeGeneration.prompt_version), createdAt: nullableString(activeGeneration.created_at), status: stringValue(activeGeneration.status), creativeQuality: nullableString(activeGeneration.creative_quality), validationStatus: ["ready", "needs_review", "blocked"].includes(stringValue(activeGeneration.validation_status)) ? stringValue(activeGeneration.validation_status) as "ready" | "needs_review" | "blocked" : "ready" } : null,
    platformTargets: targetRows
      .filter(target => stringValue(target.social_content_item_id) === itemId)
      .map(target => ({ id: stringValue(target.id), platform: stringValue(target.platform) as SocialPublishingPlatform, selected: Boolean(target.selected), status: stringValue(target.status, "Draft") as SocialPublishingStatus })),
    providerExecution: execution ? { id: stringValue(execution.id), status: stringValue(execution.status) as SocialProviderExecutionSummary["status"], provider: "zernio", providerPostId: nullableString(execution.provider_post_id), failureDiagnostic: nullableString(execution.failure_diagnostic), scheduledForUtc: nullableString(execution.scheduled_for_utc) } : null,
  }
}

function safeVisualCreativeContext(understanding: AnyRecord | null): CaptionVisualCreativeContext {
  const inferred = asRecord(understanding?.inferred_context)
  const people = asRecord(inferred.people)
  const foodVisible = Array.isArray(inferred.foodVisible) ? inferred.foodVisible.filter((value): value is string => typeof value === "string").slice(0, 6) : []
  const drinkVisible = Array.isArray(inferred.drinkVisible) ? inferred.drinkVisible.filter((value): value is string => typeof value === "string").slice(0, 4) : []
  const broadScene = stringValue(inferred.broadScene)
  const broadMoment = stringValue(inferred.broadMoment)
  const composition = stringValue(inferred.composition)
  const visualMood = stringValue(inferred.visualMood)
  const setting = stringValue(inferred.setting)
  const peopleSummary = [stringValue(people.presence), stringValue(people.interaction)].filter(Boolean).join("; ")
  return {
    broadScene: broadScene || undefined,
    broadMoment: broadMoment || undefined,
    composition: composition || undefined,
    visualMood: visualMood || undefined,
    people: peopleSummary || undefined,
    foodVisible,
    drinkVisible,
    setting: setting || undefined,
    strongestVisualStory: [broadMoment, peopleSummary, foodVisible[0], visualMood].filter(Boolean).join(" · ") || undefined,
  }
}

async function loadVisualCreativeContext(clientId: string, itemId: string) {
  const { data: media, error: mediaError } = await sb.from("social_content_media").select("id").eq("client_id", clientId).eq("social_content_item_id", itemId).order("sort_order").limit(1).maybeSingle()
  if (mediaError) throw new Error(mediaError.message)
  if (!media) return {}
  const { data: understanding, error: understandingError } = await sb.from("social_content_understanding").select("inferred_context, content_sha256, status").eq("client_id", clientId).eq("social_content_media_id", media.id).maybeSingle()
  if (understandingError) throw new Error(understandingError.message)
  return safeVisualCreativeContext(understanding as AnyRecord | null)
}

async function loadRelevantCaptionTruth(clientId: string, visual: CaptionVisualCreativeContext) {
  const { data, error } = await sb
    .from("client_brain_v2_records")
    .select("id, title, subsection, summary, metadata, status")
    .eq("client_id", clientId)
    .in("status", ["active", "approved"])
    .neq("subsection", "knowledge_gaps")
    .in("top_section", ["products_offers", "intelligence", "brand_guidelines"])
    .limit(160)
  if (error) throw new Error(error.message)
  return matchRelevantCaptionTruth((data ?? []) as CaptionTruthRecord[], visual)
}

async function loadCaptionImage(clientId: string, itemId: string) {
  const { data: media, error: mediaError } = await sb.from("social_content_media").select("id, mime_type, storage_bucket, storage_path, content_sha256").eq("client_id", clientId).eq("social_content_item_id", itemId).order("sort_order").limit(1).maybeSingle()
  if (mediaError) throw new Error(mediaError.message)
  if (!media || !stringValue(media.mime_type).startsWith("image/")) throw new Error("A final Feed image is required before generating captions.")
  const { data, error } = await sb.storage.from(stringValue(media.storage_bucket, BUCKET)).download(stringValue(media.storage_path))
  if (error || !data) throw new Error(error?.message ?? "The final Feed image could not be read for caption generation.")
  const source = Buffer.from(await data.arrayBuffer())
  const requestedMime = stringValue(media.mime_type)
  const metadata = await sharp(source, { limitInputPixels: false }).metadata()
  const supportedMime = requestedMime === "image/jpeg" || requestedMime === "image/png" || requestedMime === "image/webp"
  const needsNormalization = !supportedMime || Math.max(metadata.width ?? 0, metadata.height ?? 0) > CAPTION_IMAGE_MAX_DIMENSION
  const bytes = needsNormalization ? await sharp(source, { limitInputPixels: false }).rotate().resize({ width: CAPTION_IMAGE_MAX_DIMENSION, height: CAPTION_IMAGE_MAX_DIMENSION, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer() : source
  const mimeType = needsNormalization ? "image/jpeg" as const : requestedMime as "image/jpeg" | "image/png" | "image/webp"
  return {
    image: { base64: bytes.toString("base64"), mimeType },
    reference: { mediaId: stringValue(media.id), contentSha256: nullableString(media.content_sha256) ?? createHash("sha256").update(source).digest("hex"), mimeType: stringValue(media.mime_type) },
  }
}

export async function ensurePublishingMonth(clientId: string, requestedMonthStart: string, input: { timezone?: string; feedStartDate?: string | null; feedIntervalDays?: number } = {}) {
  await requirePublishingClient(clientId)
  const normalizedMonth = monthStart(requestedMonthStart)
  const existing = await sb.from("social_content_months").select("*").eq("client_id", clientId).eq("month_start", normalizedMonth).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data as AnyRecord

  const { data, error } = await sb.from("social_content_months").insert({
    client_id: clientId,
    month_start: normalizedMonth,
    timezone: input.timezone === "UTC" ? "UTC" : "Asia/Dubai",
    feed_start_date: normalizedMonth,
    feed_interval_days: 2,
  }).select("*").single()
  if (error) {
    // A page-load read and an explicit Create Month click can arrive together.
    // The unique client/month key is the authority; resolve that harmless race
    // to the existing month rather than surfacing a duplicate-key error.
    if (error.code === "23505") {
      const { data: racedMonth, error: raceLookupError } = await sb.from("social_content_months").select("*").eq("client_id", clientId).eq("month_start", normalizedMonth).maybeSingle()
      if (raceLookupError) throw new Error(raceLookupError.message)
      if (racedMonth) return racedMonth as AnyRecord
    }
    throw new Error(error.message)
  }
  return data as AnyRecord
}

export async function listPublishingMonths(clientId: string): Promise<SocialPublishingMonth[]> {
  await requirePublishingClient(clientId)
  const { data, error } = await sb
    .from("social_content_months")
    .select("id, month_start, timezone, feed_start_date, feed_interval_days")
    .eq("client_id", clientId)
    .order("month_start", { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as AnyRecord[]).map(month => ({
    id: stringValue(month.id),
    monthStart: stringValue(month.month_start),
    timezone: stringValue(month.timezone, "Asia/Dubai"),
    feedStartDate: nullableString(month.feed_start_date),
    feedIntervalDays: numberValue(month.feed_interval_days, 2),
  }))
}

export async function loadPublishingWorkspace(clientId: string, requestedMonthStart: string, options: { createIfMissing?: boolean } = {}): Promise<SocialPublishingWorkspace | null> {
  await requirePublishingClient(clientId)
  const normalizedMonth = monthStart(requestedMonthStart)
  const existing = await sb.from("social_content_months").select("*").eq("client_id", clientId).eq("month_start", normalizedMonth).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  const month = existing.data as AnyRecord | null
  if (!month && !options.createIfMissing) return null
  const resolvedMonth = month ?? await ensurePublishingMonth(clientId, normalizedMonth)
  const monthId = stringValue(resolvedMonth.id)
  const [itemsResult, mediaResult, captionsResult, targetsResult, slotsResult, placementsResult, understandingResult, generationsResult, executionsResult] = await Promise.all([
    sb.from("social_content_items").select("*").eq("client_id", clientId).eq("social_content_month_id", monthId).order("sequence"),
    sb.from("social_content_media").select("*").eq("client_id", clientId).order("sort_order"),
    sb.from("social_content_caption_options").select("*").eq("client_id", clientId).order("option_number"),
    sb.from("social_content_platform_targets").select("*").eq("client_id", clientId),
    sb.from("social_story_schedule_slots").select("*").eq("client_id", clientId).order("weekday").order("local_time"),
    sb.from("social_story_placements").select("*").eq("client_id", clientId).eq("social_content_month_id", monthId).order("scheduled_date").order("scheduled_time"),
    sb.from("social_content_understanding").select("*").eq("client_id", clientId),
    sb.from("social_caption_generations").select("id, provider, model, prompt_version, created_at, status, creative_quality, validation_status").eq("client_id", clientId),
    sb.from("social_provider_executions").select("id, social_content_item_id, status, provider_post_id, failure_diagnostic, scheduled_for_utc, created_at").eq("client_id", clientId),
  ])
  for (const result of [itemsResult, mediaResult, captionsResult, targetsResult, slotsResult, placementsResult, understandingResult, generationsResult, executionsResult]) if (result.error) throw new Error(result.error.message)

  const mediaRows = await Promise.all(((mediaResult.data ?? []) as AnyRecord[]).map(async media => ({ ...media, signed_url: await signedUrl(stringValue(media.storage_path), stringValue(media.storage_bucket, BUCKET)) })))
  const items = ((itemsResult.data ?? []) as AnyRecord[]).map(item => mapItem(item, mediaRows, (captionsResult.data ?? []) as AnyRecord[], (targetsResult.data ?? []) as AnyRecord[], (understandingResult.data ?? []) as AnyRecord[], (generationsResult.data ?? []) as AnyRecord[], (executionsResult.data ?? []) as AnyRecord[]))
  const itemById = new Map(items.map(item => [item.id, item]))
  const storyPlacements = ((placementsResult.data ?? []) as AnyRecord[]).map(row => ({
    id: stringValue(row.id), socialContentItemId: stringValue(row.social_content_item_id), storyScheduleSlotId: nullableString(row.social_story_schedule_slot_id),
    scheduledDate: stringValue(row.scheduled_date), scheduledTime: localTime(row.scheduled_time) ?? "00:00", scheduledAt: stringValue(row.scheduled_at),
    sequence: numberValue(row.sequence, 1), status: stringValue(row.status, "Ready for Review") as SocialStoryPlacement["status"],
    plannerSyncedPayloadVersion: typeof row.planner_synced_payload_version === "number" ? row.planner_synced_payload_version : null,
    plannerSyncedAt: nullableString(row.planner_synced_at), scheduledPayloadStale: Boolean(row.scheduled_payload_stale),
  }))
  const plannerEntries: SocialPlannerEntry[] = [
    ...items.filter(item => item.contentKind !== "story" && item.plannerSyncedAt && item.scheduledDate && item.scheduledTime && item.scheduledAt).map(item => ({
      id: `content:${item.id}`, contentItemId: item.id, contentKind: item.contentKind, format: item.format, title: item.title,
      status: item.status, scheduledDate: item.scheduledDate!, scheduledTime: item.scheduledTime!, scheduledAt: item.scheduledAt!,
      finalCaption: item.finalCaption, platformTargets: item.platformTargets, media: item.media, scheduledPayloadStale: item.scheduledPayloadStale,
      publishingPayloadVersion: item.publishingPayloadVersion, plannerSyncedPayloadVersion: item.plannerSyncedPayloadVersion, plannerSyncedAt: item.plannerSyncedAt,
      providerExecution: item.providerExecution,
    })),
    ...storyPlacements.filter(placement => placement.plannerSyncedAt).flatMap(placement => {
      const item = itemById.get(placement.socialContentItemId)
      return item ? [{
        id: `story:${placement.id}`, contentItemId: item.id, contentKind: "story" as const, format: "story" as const,
        title: item.title, status: placement.status, scheduledDate: placement.scheduledDate, scheduledTime: placement.scheduledTime,
        scheduledAt: placement.scheduledAt, finalCaption: item.finalCaption, platformTargets: item.platformTargets, media: item.media,
        scheduledPayloadStale: placement.scheduledPayloadStale, storyPlacementId: placement.id,
        publishingPayloadVersion: item.publishingPayloadVersion, plannerSyncedPayloadVersion: placement.plannerSyncedPayloadVersion, plannerSyncedAt: placement.plannerSyncedAt,
        providerExecution: item.providerExecution,
      }] : []
    }),
  ].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  return {
    month: {
      id: monthId, monthStart: stringValue(resolvedMonth.month_start), timezone: stringValue(resolvedMonth.timezone, "Asia/Dubai"),
      feedStartDate: nullableString(resolvedMonth.feed_start_date), feedIntervalDays: numberValue(resolvedMonth.feed_interval_days, 2),
    } satisfies SocialPublishingMonth,
    items,
    storySlots: ((slotsResult.data ?? []) as AnyRecord[]).map(slot => ({ id: stringValue(slot.id), weekday: numberValue(slot.weekday), localTime: localTime(slot.local_time) ?? "00:00", label: stringValue(slot.label), sortOrder: numberValue(slot.sort_order, 1), active: Boolean(slot.active) })),
    storyPlacements,
    plannerEntries,
    connectionMode: "offline",
    postingTimeAvailability: "unavailable",
  }
}

export async function createContentItemsFromUpload(input: { clientId: string; monthStart: string; contentKind: SocialContentKind; files: Array<{ fileName: string; mimeType: string; byteSize: number; width: number | null; height: number | null; buffer: Buffer }> }) {
  const month = await ensurePublishingMonth(input.clientId, input.monthStart)
  const { data: lastItem, error: lastItemError } = await sb.from("social_content_items").select("sequence").eq("client_id", input.clientId).eq("social_content_month_id", month.id).eq("content_kind", input.contentKind).order("sequence", { ascending: false }).limit(1).maybeSingle()
  if (lastItemError) throw new Error(lastItemError.message)
  let sequence = numberValue(lastItem?.sequence, 0)
  const createdIds: string[] = []
  for (const file of input.files) {
    sequence += 1
    const format: SocialContentFormat = input.contentKind === "story" ? "story" : input.contentKind === "reel" ? "reel" : "feed"
    const title = file.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || null
    const scheduledDate = input.contentKind === "feed" ? dateInMonth(stringValue(month.month_start), sequence, 2) : null
    const scheduledTime = input.contentKind === "feed" && scheduledDate ? "11:00" : null
    const { data: item, error: itemError } = await sb.from("social_content_items").insert({
      client_id: input.clientId, social_content_month_id: month.id, source: "manual_upload", content_kind: input.contentKind,
      format, title, schedule_label: input.contentKind === "story" ? title : null, sequence,
      status: input.contentKind === "feed" ? "Needs Caption" : "Draft", scheduled_date: scheduledDate, scheduled_time: scheduledTime,
      scheduled_at: dubaiInstant(scheduledDate, scheduledTime), time_selection_source: input.contentKind === "feed" ? "client_default" : "unavailable",
      time_recommendation: { status: "unavailable", message: "No audience activity data is available yet." },
    }).select("*").single()
    if (itemError) throw new Error(itemError.message)
    const extension = file.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin"
    const storagePath = `${input.clientId}/${month.month_start}/${input.contentKind}/${item.id}/${randomUUID()}.${extension}`
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, file.buffer, { contentType: file.mimeType, upsert: false })
    if (uploadError) {
      await sb.from("social_content_items").delete().eq("id", item.id).eq("client_id", input.clientId)
      throw new Error(uploadError.message)
    }
    const contentSha256 = createHash("sha256").update(file.buffer).digest("hex")
    const { error: mediaError } = await sb.from("social_content_media").insert({ client_id: input.clientId, social_content_item_id: item.id, storage_path: storagePath, file_name: file.fileName, mime_type: file.mimeType, byte_size: file.byteSize, width: file.width, height: file.height, sort_order: 1, content_sha256: contentSha256 })
    if (mediaError) throw new Error(mediaError.message)
    const targets = (["instagram", "facebook", "linkedin"] as SocialPublishingPlatform[]).map(platform => ({ client_id: input.clientId, social_content_item_id: item.id, platform, selected: platform === "instagram", status: "Draft" }))
    const { error: targetError } = await sb.from("social_content_platform_targets").insert(targets)
    if (targetError) throw new Error(targetError.message)
    createdIds.push(item.id)
  }
  return createdIds
}

// Calendar removal deliberately leaves the storage object untouched. A final asset
// can be reused or audited elsewhere; only this client's calendar placement and its
// dependent records are removed by the database relationship.
export async function removeContentItemFromCalendar(clientId: string, itemId: string) {
  const { data: item, error: lookupError } = await sb.from("social_content_items").select("id,status").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (!item) throw new Error("Content item was not found for this client.")
  if (["Publishing", "Published"].includes(stringValue(item.status))) throw new Error("A publishing or published item cannot be removed from the calendar.")
  const { error } = await sb.from("social_content_items").delete().eq("id", itemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

function stringList(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean) : [] }

async function loadCaptionProfile(clientId: string): Promise<CaptionProfile> {
  const { data, error } = await sb.from("social_caption_profiles").select("*").eq("client_id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  const profile = (data ?? {}) as AnyRecord
  return { footer: stringValue(profile.footer).trim(), fixedHashtags: stringList(profile.fixed_hashtags), dynamicHashtagCount: Math.min(5, Math.max(0, numberValue(profile.dynamic_hashtag_count, 3))), toneOfVoice: stringValue(profile.tone_of_voice), instructions: stringValue(profile.caption_instructions), approvedPhrases: stringList(profile.approved_phrases), styleExamples: stringList(profile.style_examples), goldenCaptions: stringList(profile.golden_caption_examples), avoidPhrases: stringList(profile.avoid_phrases), guidelines: asRecord(profile.caption_guidelines) as Record<string, string> }
}

async function loadRecentCaptionMemory(clientId: string, excludingItemId: string) {
  const { data, error } = await sb.from("social_content_items").select("final_caption").eq("client_id", clientId).in("status", ["Approved", "Scheduled", "Published"]).neq("id", excludingItemId).not("final_caption", "is", null).order("caption_approved_at", { ascending: false }).limit(8)
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap(item => typeof item.final_caption === "string" && item.final_caption.trim() ? [item.final_caption.trim()] : [])
}

function mergeContextLayer(base: Record<string, unknown>, inherited: Record<string, unknown>) {
  const merged: AnyRecord = { ...inherited, ...base }
  for (const key of ["supportingFood", "supportingDrink", "staff", "factualDescriptors", "truthReferenceIds"]) {
    const inheritedValues = Array.isArray(inherited[key]) ? inherited[key] : []
    const baseValues = Array.isArray(base[key]) ? base[key] : []
    merged[key] = [...new Set([...inheritedValues, ...baseValues])]
  }
  return merged
}

// Source lineage may be attached by the Monthly Planner, Individual Production,
// AI Content Studio or a final-media link. It fills only the verified layer;
// vision inference is deliberately never read or promoted here.
async function inheritStructuredContentContext(clientId: string, item: AnyRecord): Promise<SocialContentContext> {
  const context = normalizeSocialContentContext(item.content_context)
  const lineage = context.lineage
  const inherited: AnyRecord = {}
  const truthReferenceIds = new Set(context.verified.truthReferenceIds ?? [])
  const addPlanItem = async (planItemId: string) => {
    const { data, error } = await sb.from("social_monthly_content_plan_items").select("id, pillar, subject, activation_record_id, metadata").eq("id", planItemId).eq("client_id", clientId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return
    inherited.archetype = stringValue(data.pillar) || undefined
    inherited.primarySubject = stringValue(data.subject) || undefined
    if (data.activation_record_id) truthReferenceIds.add(String(data.activation_record_id))
    const planning = asRecord(asRecord(data.metadata).planning_ai)
    const supporting = Array.isArray(planning.supporting_product_asset_ids) ? planning.supporting_product_asset_ids.filter((value): value is string => typeof value === "string") : []
    supporting.forEach(value => truthReferenceIds.add(value))
  }
  if (lineage.monthlyPlanItemId) await addPlanItem(lineage.monthlyPlanItemId)
  if (lineage.individualProductionArtifactId) {
    const { data, error } = await sb.from("social_monthly_plan_production_artifacts").select("monthly_plan_item_id").eq("id", lineage.individualProductionArtifactId).eq("client_id", clientId).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.monthly_plan_item_id) await addPlanItem(String(data.monthly_plan_item_id))
  }
  if (lineage.aiContentGenerationId) {
    const { data: generation, error: generationError } = await sb.from("ai_content_generations").select("session_id").eq("id", lineage.aiContentGenerationId).eq("client_id", clientId).maybeSingle()
    if (generationError) throw new Error(generationError.message)
    if (generation?.session_id) {
      const { data: references, error: referenceError } = await sb.from("ai_content_session_references").select("source_type, source_record_id, display_name, role").eq("session_id", generation.session_id).eq("client_id", clientId)
      if (referenceError) throw new Error(referenceError.message)
      const food: string[] = []; const drink: string[] = []; const venue: string[] = []
      for (const reference of references ?? []) {
        if (reference.source_type !== "client_brain_asset") continue
        if (reference.source_record_id) truthReferenceIds.add(String(reference.source_record_id))
        if (reference.role === "food_truth" || reference.role === "product_truth") food.push(String(reference.display_name))
        if (reference.role === "drink_truth") drink.push(String(reference.display_name))
        if (reference.role === "venue_truth") venue.push(String(reference.display_name))
      }
      if (food.length) inherited.supportingFood = food
      if (drink.length) inherited.supportingDrink = drink
      if (venue.length) inherited.venue = venue[0]
    }
  }
  if (lineage.clientBrainAssetIds?.length) {
    const { data: assets, error } = await sb.from("client_brain_v2_records").select("id, title, subsection").eq("client_id", clientId).in("id", lineage.clientBrainAssetIds)
    if (error) throw new Error(error.message)
    const food: string[] = []; const drink: string[] = []; const venue: string[] = []
    for (const asset of assets ?? []) {
      truthReferenceIds.add(String(asset.id))
      const section = String(asset.subsection ?? "").toLowerCase()
      if (section.includes("food")) food.push(String(asset.title))
      else if (section.includes("drink")) drink.push(String(asset.title))
      else if (section.includes("interior") || section.includes("exterior") || section.includes("venue")) venue.push(String(asset.title))
    }
    if (food.length) inherited.supportingFood = food
    if (drink.length) inherited.supportingDrink = drink
    if (venue.length) inherited.venue = venue[0]
  }
  const next: SocialContentContext = { ...context, verified: normalizeSocialContentContext({ verified: { ...mergeContextLayer(context.verified, inherited), truthReferenceIds: [...truthReferenceIds] } }).verified }
  if (JSON.stringify(next) !== JSON.stringify(context)) {
    const { error } = await sb.from("social_content_items").update({ content_context: next }).eq("id", item.id).eq("client_id", clientId)
    if (error) throw new Error(error.message)
  }
  return next
}

async function contentHashForMedia(media: AnyRecord) {
  const existing = nullableString(media.content_sha256)
  if (existing) return existing
  const { data, error } = await sb.storage.from(stringValue(media.storage_bucket, BUCKET)).download(stringValue(media.storage_path))
  if (error || !data) throw new Error(error?.message ?? "Final media could not be read for content understanding.")
  const hash = createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex")
  const { error: updateError } = await sb.from("social_content_media").update({ content_sha256: hash }).eq("id", media.id).eq("client_id", media.client_id)
  if (updateError) throw new Error(updateError.message)
  return hash
}

function understandingResponse(row: AnyRecord, cached: boolean) {
  const normalizedContext = normalizeSocialContentContext(row.content_context)
  return {
    ...mapUnderstanding({ ...row, cached }),
    captionReadiness: captionReadiness(captionContextFrom(stringValue(row.format, "feed"), normalizedContext), normalizedContext.inferred),
  }
}

// This intentionally does not inspect pixels or call a provider. It establishes
// a cached, reviewable record and keeps unknown manual uploads unknown until a
// later explicit one-image analysis or a human confirmation.
export async function prepareContentUnderstandingFixture(clientId: string, itemId: string) {
  const { data: item, error: itemError } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (itemError) throw new Error(itemError.message)
  if (!item) throw new Error("Content item was not found for this client.")
  const context = await inheritStructuredContentContext(clientId, item as AnyRecord)
  const { data: media, error: mediaError } = await sb.from("social_content_media").select("*").eq("client_id", clientId).eq("social_content_item_id", itemId).order("sort_order").limit(1).maybeSingle()
  if (mediaError) throw new Error(mediaError.message)
  if (!media) throw new Error("Upload final media before preparing content understanding.")
  const contentSha256 = await contentHashForMedia(media as AnyRecord)
  const { data: existing, error: existingError } = await sb.from("social_content_understanding").select("*").eq("social_content_media_id", media.id).eq("client_id", clientId).maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing && stringValue(existing.content_sha256) === contentSha256) {
    return understandingResponse({ ...existing, format: item.format, content_context: context }, true)
  }
  const fixture = offlineUnderstandingFixture(context)
  const record = {
    client_id: clientId,
    social_content_item_id: itemId,
    social_content_media_id: media.id,
    content_sha256: contentSha256,
    status: fixture.status,
    confidence: fixture.confidence,
    inferred_context: fixture.inferredContext,
    match_candidates: fixture.matchCandidates,
    requires_confirmation: fixture.requiresConfirmation,
    provider: null,
    model: null,
    provider_request_count: 0,
  }
  const { data: saved, error: saveError } = await sb.from("social_content_understanding").upsert(record, { onConflict: "social_content_media_id" }).select("*").single()
  if (saveError) throw new Error(saveError.message)
  return understandingResponse({ ...(saved as AnyRecord), format: item.format, content_context: context }, false)
}

export async function prepareContentUnderstandingBatchFixture(clientId: string, requestedMonthStart: string) {
  const workspace = await loadPublishingWorkspace(clientId, requestedMonthStart, { createIfMissing: true })
  const items = (workspace?.items ?? []).filter(item => item.contentKind === "feed" && item.media.length > 0)
  const results = await Promise.all(items.map(item => prepareContentUnderstandingFixture(clientId, item.id)))
  return {
    prepared: results.filter(result => !result?.cached).length,
    cached: results.filter(result => result?.cached).length,
    needsConfirmation: results.filter(result => !result?.captionReadiness.ready).length,
  }
}

function inferredContextFromObservation(observation: SocialVisionObservation): SocialContentContext["inferred"] {
  const foodLike = observation.foodVisible.filter(value => !/\b(?:plate|garnish|table|utensil)\b/i.test(value))
  const genericSubject = foodLike[0] || observation.drinkVisible[0] || undefined
  return {
    archetype: observation.archetype || undefined,
    primarySubject: genericSubject,
    supportingFood: foodLike.slice(1),
    supportingDrink: observation.drinkVisible,
    anonymousPeople: observation.people.presence === "one" || observation.people.presence === "multiple" ? true : undefined,
    factualDescriptors: [observation.setting !== "unclear" ? `${observation.setting} setting` : null, observation.broadScene, observation.broadMoment, observation.visualMood, observation.composition].filter((value): value is string => Boolean(value)),
  }
}

function layerHasValues(layer: SocialContentContext["verified"]) {
  return Object.entries(layer).some(([key, value]) => key !== "truthReferenceIds" && (Array.isArray(value) ? value.length > 0 : Boolean(value)))
}

async function candidateMatchesFromObservation(clientId: string, observation: SocialVisionObservation) {
  const terms = [...observation.foodVisible, ...observation.drinkVisible].flatMap(value => value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 4))
  if (!terms.length) return []
  const { data, error } = await sb.from("client_brain_v2_records").select("id, title, subsection, metadata, status").eq("client_id", clientId).eq("status", "active").limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap(asset => {
    const metadata = asRecord(asset.metadata)
    if (stringValue(metadata.approval_status) && stringValue(metadata.approval_status) !== "approved") return []
    const canonical = [stringValue(asset.title), stringValue(metadata.dish_name), stringValue(asRecord(metadata.menu_match).canonical_name)].join(" ").toLowerCase()
    if (!terms.some(term => canonical.includes(term))) return []
    return [{ assetId: stringValue(asset.id), label: stringValue(metadata.dish_name) || stringValue(asRecord(metadata.menu_match).canonical_name) || stringValue(asset.title), category: stringValue(metadata.asset_category) || stringValue(asset.subsection) || "asset", confidence: "review" as const }]
  }).slice(0, 6)
}

// One explicit manual action only. It never alters verified Client Brain truth
// and has no retry path. A previous live request for this exact media is a hard stop.
export async function analyzeContentUnderstandingVision(clientId: string, itemId: string) {
  const { data: item, error: itemError } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (itemError) throw new Error(itemError.message)
  if (!item || item.content_kind !== "feed" || item.source !== "manual_upload") throw new Error("Vision analysis is allowed only for a manual Feed upload belonging to this client.")
  const baseContext = normalizeSocialContentContext(item.content_context)
  if (layerHasValues(baseContext.verified) || layerHasValues(baseContext.confirmed)) throw new Error("This test requires an empty verified and confirmed context.")
  if (layerHasValues(baseContext.inferred)) throw new Error("This test requires an empty inferred context.")
  const { data: media, error: mediaError } = await sb.from("social_content_media").select("*").eq("client_id", clientId).eq("social_content_item_id", itemId).order("sort_order").limit(1).maybeSingle()
  if (mediaError) throw new Error(mediaError.message)
  if (!media || !stringValue(media.mime_type).startsWith("image/")) throw new Error("P01 must have one image asset before vision analysis.")
  const contentSha256 = await contentHashForMedia(media as AnyRecord)
  const { data: record, error: recordError } = await sb.from("social_content_understanding").select("*").eq("social_content_media_id", media.id).eq("client_id", clientId).maybeSingle()
  if (recordError) throw new Error(recordError.message)
  if (!record) throw new Error("Prepare the offline content-understanding record before a live vision test.")
  if (numberValue(record.provider_request_count) > 0 || ["analyzed", "needs_review", "confirmed", "corrected"].includes(stringValue(record.status))) throw new Error("A live vision request has already been recorded for this media. No retry is permitted.")
  const url = await signedUrl(stringValue(media.storage_path), stringValue(media.storage_bucket, BUCKET))
  if (!url) throw new Error("The selected final image could not be signed for vision analysis.")
  const started = Date.now()
  try {
    const result = await observeSocialContentImage({ clientId, signedImageUrl: url, mimeType: stringValue(media.mime_type, "image/jpeg") })
    const inferred = inferredContextFromObservation(result.observation)
    const matches = await candidateMatchesFromObservation(clientId, result.observation)
    const requiresConfirmation = ["Confirm or correct the generic visual observations before they can become factual caption context.", ...(matches.length ? ["Select an approved Client Brain match only if it is truly the subject shown."] : [])]
    const nextContext: SocialContentContext = { ...baseContext, inferred }
    const { error: itemUpdateError } = await sb.from("social_content_items").update({ content_context: nextContext }).eq("id", itemId).eq("client_id", clientId)
    if (itemUpdateError) throw new Error(itemUpdateError.message)
    const { data: saved, error: saveError } = await sb.from("social_content_understanding").update({ content_sha256: contentSha256, status: "needs_review", confidence: "review", inferred_context: { ...result.observation, image_dimensions: { width: result.width, height: result.height } }, match_candidates: matches, requires_confirmation: requiresConfirmation, provider: "anthropic", model: result.model, provider_request_count: 1, input_tokens: result.usage.tokensIn, output_tokens: result.usage.tokensOut, latency_ms: Date.now() - started, cost: result.usage.costUsd, diagnostics: { request_id_recorded_in_usage_log: true, success: true } }).eq("id", record.id).eq("client_id", clientId).select("*").single()
    if (saveError) throw new Error(saveError.message)
    return { ...understandingResponse({ ...(saved as AnyRecord), format: item.format, content_context: nextContext }, false), observation: result.observation, contentSha256, usage: { inputTokens: result.usage.tokensIn, outputTokens: result.usage.tokensOut, latencyMs: Date.now() - started, costUsd: result.usage.costUsd } }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vision analysis failed."
    await sb.from("social_content_understanding").update({ status: "unknown", confidence: "unknown", provider: "anthropic", model: "claude-haiku-4-5", provider_request_count: 1, diagnostics: { success: false, message, latency_ms: Date.now() - started } }).eq("id", record.id).eq("client_id", clientId)
    throw error
  }
}

// Offline Phase B contract exercise only. This persists the same option, metadata and
// intervention shape as the future single-provider route, but never invokes a provider.
export async function generateOfflineCaptionOptions(clientId: string, itemId: string) {
  const { data: item, error } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!item || item.content_kind !== "feed") throw new Error("Feed content was not found for this client.")
  const profile = await loadCaptionProfile(clientId)
  const context = captionContextFrom(stringValue(item.format, "feed"), await inheritStructuredContentContext(clientId, item as AnyRecord))
  const visualCreativeContext = await loadVisualCreativeContext(clientId, itemId)
  const requestContract = buildCaptionRequestContract({ profile, context, recentCaptions: await loadRecentCaptionMemory(clientId, itemId), visualCreativeContext, relevantClientTruth: await loadRelevantCaptionTruth(clientId, visualCreativeContext) })
  const fixture = offlineCaptionFixture()
  const generationId = randomUUID()
  const { error: generationError } = await sb.from("social_caption_generations").insert({ id: generationId, client_id: clientId, social_content_item_id: itemId, provider: "offline-fixture", model: "none", prompt_version: requestContract.promptVersion, request_contract: requestContract, status: "offline_fixture", input_tokens: 0, output_tokens: 0, cost: 0, latency_ms: 0 })
  if (generationError) throw new Error(generationError.message)
  if (!nullableString(item.title)) {
    const title = normalizePostTitle(fixture.post_title, deterministicPostTitle({ primarySubject: context.primarySubject, foodVisible: visualCreativeContext.foodVisible, broadScene: visualCreativeContext.broadScene, broadMoment: visualCreativeContext.broadMoment }))
    const { error: titleError } = await sb.from("social_content_items").update({ title }).eq("id", itemId).eq("client_id", clientId)
    if (titleError) throw new Error(titleError.message)
  }
  const { error: archiveError } = await sb.from("social_content_caption_options").update({ is_current: false }).eq("client_id", clientId).eq("social_content_item_id", itemId).eq("is_current", true)
  if (archiveError) throw new Error(archiveError.message)
  const options = fixture.caption_options.map((option, index) => ({ client_id: clientId, social_content_item_id: itemId, option_number: index + 1, body: option.body, dynamic_hashtags: captionHashtags(profile, context, option), rendered_caption: assembleCaption(option, profile, context), source: "mock", generation_id: generationId, is_current: true }))
  const { error: optionError } = await sb.from("social_content_caption_options").insert(options)
  if (optionError) throw new Error(optionError.message)
  const { error: eventError } = await sb.from("social_caption_intervention_events").insert({ client_id: clientId, social_content_item_id: itemId, generation_id: generationId, event_type: "regenerated_options", metadata: { offline: true, provider_request_count: 0 } })
  if (eventError) throw new Error(eventError.message)
}

// The only live path: one manual request, exactly five structured bodies, no retry or repair call.
export async function generateLiveCaptionOptions(clientId: string, itemId: string, options: { refresh?: boolean } = {}) {
  const { data: item, error } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!item || item.content_kind !== "feed") throw new Error("Feed content was not found for this client.")
  const profile = await loadCaptionProfile(clientId)
  const resolvedContext = await inheritStructuredContentContext(clientId, item as AnyRecord)
  const context = captionContextFrom(stringValue(item.format, "feed"), resolvedContext)
  const captionImage = await loadCaptionImage(clientId, itemId)
  const cachedVisualContext = await loadVisualCreativeContext(clientId, itemId)
  const safeVisualCategories = [...(cachedVisualContext.foodVisible ?? []), ...(cachedVisualContext.drinkVisible ?? [])]
  const recentCaptionMemory = await loadRecentCaptionMemory(clientId, itemId)
  const relevantClientTruth = await loadRelevantCaptionTruth(clientId, cachedVisualContext)
  const requestContract = buildCaptionRequestContract({ profile, context, recentCaptions: recentCaptionMemory, visualCreativeContext: cachedVisualContext, relevantClientTruth, finalImage: captionImage.reference })
  const generationId = randomUUID()
  const startedAt = Date.now()
  const result = await executeTextRun({ provider: "anthropic", model: "claude-sonnet-4-6", system: requestContract.system, prompt: formatCaptionRequestPrompt(requestContract), image: captionImage.image, maxTokens: 1_600, temperature: 0.8, route: "/api/social/publishing", feature: "social_caption_generation", clientId, structuredOutput: { name: "caption_response", description: "One concise 3-5 word post title and exactly five materially different story-first caption bodies. Do not narrate the photograph. Hashtags are deterministic and must not be returned.", schema: { type: "object", additionalProperties: false, required: ["post_title", "caption_options"], properties: { post_title: { type: "string" }, caption_options: { type: "array", minItems: 5, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["body"], properties: { body: { type: "string" } } } } } } } })
  if (!result.ok) {
    await sb.from("social_caption_generations").insert({ id: generationId, client_id: clientId, social_content_item_id: itemId, provider: result.provider, model: result.model, prompt_version: requestContract.promptVersion, request_contract: requestContract, status: "failed", input_tokens: result.inputTokens ?? 0, output_tokens: result.outputTokens ?? 0, cost: result.actualCost ?? 0, latency_ms: result.durationMs ?? Date.now() - startedAt })
    throw new Error(result.error || "Caption provider request failed.")
  }
  // Persist the paid model output before any validation. This receipt is useful
  // even when the candidate is malformed or cannot become production content.
  const { error: candidateError } = await sb.from("social_caption_generations").insert({ id: generationId, client_id: clientId, social_content_item_id: itemId, provider: result.provider, model: result.model, prompt_version: requestContract.promptVersion, request_contract: requestContract, raw_candidate: result.structuredOutput ?? null, status: "candidate_received", validation_status: "needs_review", validation_diagnostics: [], input_tokens: result.inputTokens ?? 0, output_tokens: result.outputTokens ?? 0, cost: result.actualCost ?? 0, latency_ms: result.durationMs ?? Date.now() - startedAt })
  if (candidateError) throw new Error(candidateError.message)
  let response
  try { response = parseCaptionResponse(result.structuredOutput, profile) } catch (validationError) {
    const message = validationError instanceof Error ? validationError.message : "Malformed caption response."
    await sb.from("social_caption_generations").update({ status: "blocked", creative_quality: "fail_needs_intervention", validation_status: "blocked", validation_diagnostics: [{ code: "malformed_provider_response", message, status: "blocked" }] }).eq("id", generationId).eq("client_id", clientId)
    throw validationError
  }
  const verifiedTerms = [...context.verifiedFacts, ...relevantClientTruth.map(match => match.fact)]
  const assessedOptions = assessCaptionOptions(response, profile, verifiedTerms, recentCaptionMemory)
  let batchQuality: "pass" | "soft_needs_review" = "pass"
  try { validateCaptionBatchQuality(response, { profile, context, visualCreativeContext: cachedVisualContext }) } catch (validationError) {
    void validationError
    batchQuality = "soft_needs_review"
  }
  const validationStatus = assessedOptions.some(option => option.validationStatus === "blocked") ? "blocked" : assessedOptions.some(option => option.validationStatus === "needs_review") ? "needs_review" : "ready"
  const { error: generationError } = await sb.from("social_caption_generations").update({ status: validationStatus === "ready" ? "succeeded" : validationStatus, creative_quality: batchQuality, validation_status: validationStatus, validation_diagnostics: [] }).eq("id", generationId).eq("client_id", clientId)
  if (generationError) throw new Error(generationError.message)
  if (!nullableString(item.title)) {
    const title = normalizePostTitle(response.post_title, deterministicPostTitle({ primarySubject: context.primarySubject, foodVisible: cachedVisualContext.foodVisible, broadScene: cachedVisualContext.broadScene, broadMoment: cachedVisualContext.broadMoment }))
    const { error: titleError } = await sb.from("social_content_items").update({ title }).eq("id", itemId).eq("client_id", clientId)
    if (titleError) throw new Error(titleError.message)
  }
  const { error: archiveError } = await sb.from("social_content_caption_options").update({ is_current: false }).eq("client_id", clientId).eq("social_content_item_id", itemId).eq("is_current", true)
  if (archiveError) throw new Error(archiveError.message)
  const { error: optionError } = await sb.from("social_content_caption_options").insert(assessedOptions.map((assessment, index) => ({ client_id: clientId, social_content_item_id: itemId, option_number: index + 1, body: assessment.option.body, dynamic_hashtags: captionHashtags(profile, context, assessment.option, safeVisualCategories), rendered_caption: assembleCaption(assessment.option, profile, context, safeVisualCategories), source: "ai", generation_id: generationId, is_current: true, validation_status: assessment.validationStatus, validation_diagnostics: assessment.diagnostics })))
  if (optionError) throw new Error(optionError.message)
  if (options.refresh) {
    const { error: eventError } = await sb.from("social_caption_intervention_events").insert({ client_id: clientId, social_content_item_id: itemId, generation_id: generationId, event_type: "regenerated_options", metadata: { provider_request_count: 1, reanalysis_requested: false, visual_context: "cached_media_hash" } })
    if (eventError) throw new Error(eventError.message)
  }
  return generationId
}

export async function updateContentItem(clientId: string, itemId: string, input: AnyRecord) {
  const { data: existing, error: existingError } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error("Content item was not found for this client.")
  const update: AnyRecord = {}
  const requestedPlatforms: unknown[] = Array.isArray(input.platforms) ? input.platforms : []
  const platformSelectionRequested = Array.isArray(input.platforms)
  let publishingChange = platformSelectionRequested || Array.isArray(input.mediaOrder)
  if ("title" in input) { update.title = nullableString(input.title); publishingChange = true }
  if ("notes" in input) update.notes = nullableString(input.notes)
  if ("scheduleLabel" in input) update.schedule_label = nullableString(input.scheduleLabel)
  if ("contentContext" in input) {
    update.content_context = normalizeSocialContentContext(input.contentContext)
    publishingChange = true
  }
  if ("format" in input && validFormats.has(stringValue(input.format) as SocialContentFormat)) { update.format = input.format; publishingChange = true }
  if ("scheduledDate" in input) { update.scheduled_date = isoDate(input.scheduledDate); publishingChange = true }
  if ("scheduledTime" in input) {
    update.scheduled_time = localTime(input.scheduledTime)
    update.time_selection_source = "manual"
    publishingChange = true
  }
  if ("dateLocked" in input) update.date_locked = Boolean(input.dateLocked)
  if ("storyScheduleSlotId" in input) { update.story_schedule_slot_id = nullableString(input.storyScheduleSlotId); publishingChange = true }
  if ("status" in input && validStatuses.has(stringValue(input.status) as SocialPublishingStatus)) update.status = input.status
  if ("finalCaption" in input) {
    // Calvin edits the complete assembled caption. Preserve that exact text rather
    // than silently rebuilding a different footer or hashtag set on save.
    const nextCaption = nullableString(input.finalCaption)
    if (nextCaption !== nullableString(existing.final_caption)) {
      update.final_caption = nextCaption
      update.caption_edited_at = new Date().toISOString()
      update.caption_approved_at = null
      if (existing.selected_caption_option_id) await sb.from("social_caption_intervention_events").insert({ client_id: clientId, social_content_item_id: itemId, event_type: "edited_generated_option", metadata: {} }); else await sb.from("social_caption_intervention_events").insert({ client_id: clientId, social_content_item_id: itemId, event_type: "fully_manual_caption", metadata: {} })
      publishingChange = true
    }
  }
  if ("selectedCaptionOptionId" in input) {
    const optionId = nullableString(input.selectedCaptionOptionId)
    if (optionId) {
      const { data: option, error: optionError } = await sb.from("social_content_caption_options").select("id, body, rendered_caption, validation_status").eq("id", optionId).eq("client_id", clientId).eq("social_content_item_id", itemId).maybeSingle()
      if (optionError) throw new Error(optionError.message)
      if (!option) throw new Error("Caption option was not found for this content item.")
      if (option.validation_status !== "ready") throw new Error("This caption option requires review before it can be selected. Edit and revalidate it first.")
      await sb.from("social_content_caption_options").update({ selected_at: new Date().toISOString() }).eq("id", optionId).eq("client_id", clientId)
      update.selected_caption_option_id = optionId
      update.final_caption = stringValue(option.rendered_caption) || stringValue(option.body)
      update.caption_selected_at = new Date().toISOString()
      update.caption_edited_at = null
      update.caption_approved_at = null
      await sb.from("social_caption_intervention_events").insert({ client_id: clientId, social_content_item_id: itemId, event_type: "selected_generated_option", metadata: { option_id: optionId } })
      publishingChange = true
    } else {
      update.selected_caption_option_id = null
      update.caption_selected_at = null
      publishingChange = true
    }
  }
  const date = "scheduled_date" in update ? update.scheduled_date as string | null : nullableString(existing.scheduled_date)
  const time = "scheduled_time" in update ? update.scheduled_time as string | null : localTime(existing.scheduled_time)
  update.scheduled_at = dubaiInstant(date, time)
  Object.assign(update, nextPayloadState(existing as AnyRecord, publishingChange))
  if (publishingChange && existing.planner_synced_at) {
    update.scheduled_payload_stale = true
  }
  if (update.status === "Approved") {
    if (!String(update.final_caption ?? existing.final_caption ?? "").trim()) throw new Error("Select or write a caption before approving this Feed post.")
    if (existing.selected_caption_option_id) {
      const { data: selectedOption, error: selectedOptionError } = await sb.from("social_content_caption_options").select("validation_status").eq("id", existing.selected_caption_option_id).eq("client_id", clientId).maybeSingle()
      if (selectedOptionError) throw new Error(selectedOptionError.message)
      if (selectedOption?.validation_status !== "ready") throw new Error("A caption needing review cannot be approved until corrected and revalidated.")
    }
    update.caption_approved_at = new Date().toISOString()
  }
  const { error } = await sb.from("social_content_items").update(update).eq("id", itemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
  if (platformSelectionRequested) {
    const selected = new Set(requestedPlatforms.filter((platform): platform is SocialPublishingPlatform => typeof platform === "string" && validPlatforms.has(platform as SocialPublishingPlatform)))
    const { error: platformError } = await sb.from("social_content_platform_targets").update({ selected: false }).eq("social_content_item_id", itemId).eq("client_id", clientId)
    if (platformError) throw new Error(platformError.message)
    if (selected.size > 0) {
      const { error: selectError } = await sb.from("social_content_platform_targets").update({ selected: true }).eq("social_content_item_id", itemId).eq("client_id", clientId).in("platform", [...selected])
      if (selectError) throw new Error(selectError.message)
    }
  }
  if (Array.isArray(input.mediaOrder)) {
    const mediaIds = input.mediaOrder.filter((id): id is string => typeof id === "string")
    const { data: media, error: mediaError } = await sb.from("social_content_media").select("id").eq("social_content_item_id", itemId).eq("client_id", clientId)
    if (mediaError) throw new Error(mediaError.message)
    const currentIds = (media ?? []).map(row => stringValue(row.id))
    if (currentIds.length !== mediaIds.length || mediaIds.some(id => !currentIds.includes(id))) throw new Error("Carousel media order is invalid.")
    await Promise.all(mediaIds.map((id, index) => sb.from("social_content_media").update({ sort_order: index + 1000 }).eq("id", id).eq("client_id", clientId)))
    const { error: orderError } = await Promise.all(mediaIds.map((id, index) => sb.from("social_content_media").update({ sort_order: index + 1 }).eq("id", id).eq("client_id", clientId))).then(results => ({ error: results.find(result => result.error)?.error }))
    if (orderError) throw new Error(orderError.message)
  }
  await syncCaptionAttachmentForSocialItem(clientId, itemId)
}

export async function recordCaptionQualityReview(clientId: string, itemId: string, input: AnyRecord) {
  const { data: item, error: itemError } = await sb.from("social_content_items").select("id").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (itemError) throw new Error(itemError.message)
  if (!item) throw new Error("Content item was not found for this client.")
  const { data: generation, error: generationError } = await sb.from("social_caption_generations").select("id").eq("client_id", clientId).eq("social_content_item_id", itemId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (generationError) throw new Error(generationError.message)
  const metadata = {
    technical_generation: "pass", five_option_contract: "pass", deterministic_footer: "pass", fixed_hashtag: "pass", factual_safety: "broadly_pass",
    creative_quality: "fail_needs_intervention", publishable_without_founder_intervention: false, founder_intervention: true,
    primary_reason: "insufficient_structured_post_context", secondary_reason: "low_quality_generic_dynamic_hashtags",
    selected_option_id: null, approved_option_id: null, regeneration_authorized: false,
    ...asRecord(input),
  }
  const { error } = await sb.from("social_caption_intervention_events").insert({ client_id: clientId, social_content_item_id: itemId, generation_id: generation?.id ?? null, event_type: "quality_reviewed", metadata })
  if (error) throw new Error(error.message)
}

export async function reorderFeedContent(clientId: string, monthStartValue: string, orderedIds: string[]) {
  const month = await ensurePublishingMonth(clientId, monthStartValue)
  const { data, error } = await sb.from("social_content_items").select("*").eq("client_id", clientId).eq("social_content_month_id", month.id).eq("content_kind", "feed")
  if (error) throw new Error(error.message)
  const current = new Map(((data ?? []) as AnyRecord[]).map(item => [stringValue(item.id), item]))
  if (current.size !== orderedIds.length || orderedIds.some(id => !current.has(id))) throw new Error("Feed order does not match this month’s content.")
  await Promise.all(orderedIds.map(async (id, index) => {
    const item = current.get(id)!
    const next = nextPayloadState(item, true)
    const scheduledDate = Boolean(item.date_locked) ? nullableString(item.scheduled_date) : dateInMonth(stringValue(month.month_start), index + 1, 2)
    const scheduledTime = scheduledDate ? (localTime(item.scheduled_time) ?? "11:00") : null
    const { error: updateError } = await sb.from("social_content_items").update({
      sequence: index + 1, scheduled_date: scheduledDate, scheduled_time: scheduledTime,
      scheduled_at: dubaiInstant(scheduledDate, scheduledTime), time_selection_source: scheduledDate ? "client_default" : "unavailable",
      ...next,
    }).eq("id", id).eq("client_id", clientId)
    if (updateError) throw new Error(updateError.message)
  }))
}

export async function autoScheduleFeed(clientId: string, monthStartValue: string, _feedStartDate?: string, _intervalDays?: number) {
  void _feedStartDate
  void _intervalDays
  const month = await ensurePublishingMonth(clientId, monthStartValue)
  const start = stringValue(month.month_start)
  const interval = 2
  const { data: items, error } = await sb.from("social_content_items").select("*").eq("client_id", clientId).eq("social_content_month_id", month.id).eq("content_kind", "feed").order("sequence")
  if (error) throw new Error(error.message)
  await sb.from("social_content_months").update({ feed_start_date: start, feed_interval_days: interval }).eq("id", month.id).eq("client_id", clientId)
  for (const [index, item] of ((items ?? []) as AnyRecord[]).entries()) {
    if (Boolean(item.date_locked)) continue
    const scheduledDate = dateInMonth(start, index + 1, interval)
    const scheduledTime = scheduledDate ? (localTime(item.scheduled_time) ?? "11:00") : null
    const next = nextPayloadState(item, true)
    const { error: updateError } = await sb.from("social_content_items").update({
      scheduled_date: scheduledDate, scheduled_time: scheduledTime, scheduled_at: dubaiInstant(scheduledDate, scheduledTime),
      time_selection_source: scheduledDate ? "client_default" : "unavailable", ...next,
    }).eq("id", item.id).eq("client_id", clientId)
    if (updateError) throw new Error(updateError.message)
  }
}

export async function createStorySlot(clientId: string, input: { weekday: number; localTime: string; label: string }) {
  await requirePublishingClient(clientId)
  const weekday = Number.isInteger(input.weekday) && input.weekday >= 0 && input.weekday <= 6 ? input.weekday : null
  const time = localTime(input.localTime)
  const label = input.label.trim()
  if (weekday === null || !time || !label) throw new Error("Story day, time, and label are required.")
  const { data: existing } = await sb.from("social_story_schedule_slots").select("sort_order").eq("client_id", clientId).eq("weekday", weekday).order("sort_order", { ascending: false }).limit(1).maybeSingle()
  const { error } = await sb.from("social_story_schedule_slots").insert({ client_id: clientId, weekday, local_time: time, label, sort_order: numberValue(existing?.sort_order, 0) + 1 })
  if (error) throw new Error(error.message)
}

export async function deleteStorySlot(clientId: string, slotId: string) {
  const { error } = await sb.from("social_story_schedule_slots").delete().eq("id", slotId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

export async function assignStoryToSlot(clientId: string, itemId: string, slotId: string | null) {
  const { data: item, error: itemError } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (itemError) throw new Error(itemError.message)
  if (!item || item.content_kind !== "story") throw new Error("Story content was not found for this client.")
  let slot: AnyRecord | null = null
  if (slotId) {
    const { data, error } = await sb.from("social_story_schedule_slots").select("*").eq("id", slotId).eq("client_id", clientId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error("Story schedule slot was not found for this client.")
    slot = data as AnyRecord
  }
  const publishingChange = stringValue(item.story_schedule_slot_id) !== (slotId ?? "")
  const update: AnyRecord = {
    story_schedule_slot_id: slotId,
    schedule_label: slot ? stringValue(slot.label) : null,
    ...(publishingChange ? nextPayloadState(item as AnyRecord, true) : {}),
  }
  if (publishingChange && item.planner_synced_at) update.scheduled_payload_stale = true
  const { error } = await sb.from("social_content_items").update(update).eq("id", itemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

function datesForWeekday(monthStartValue: string, weekday: number) {
  const start = new Date(`${monthStartValue}T00:00:00Z`)
  const month = start.getUTCMonth()
  const dates: string[] = []
  while (start.getUTCMonth() === month) {
    if (start.getUTCDay() === weekday) dates.push(start.toISOString().slice(0, 10))
    start.setUTCDate(start.getUTCDate() + 1)
  }
  return dates
}

export async function autoAssignStories(clientId: string, monthStartValue: string) {
  const workspace = await loadPublishingWorkspace(clientId, monthStartValue, { createIfMissing: true })
  if (!workspace) throw new Error("Create a publishing month before assigning Stories.")
  const unassigned = workspace.items.filter(item => item.contentKind === "story" && !item.storyScheduleSlotId)
  const occupied = new Set(workspace.items.filter(item => item.contentKind === "story" && item.storyScheduleSlotId && item.scheduledDate).map(item => `${item.storyScheduleSlotId}:${item.scheduledDate}`))
  for (const item of unassigned) {
    const searchable = `${item.title ?? ""} ${item.scheduleLabel ?? ""}`.toLowerCase()
    const slot = workspace.storySlots.find(candidate => candidate.active && searchable.includes(candidate.label.toLowerCase()))
    if (!slot) continue
    const date = datesForWeekday(workspace.month.monthStart, slot.weekday).find(candidateDate => !occupied.has(`${slot.id}:${candidateDate}`))
    if (!date) continue
    const { error } = await sb.from("social_content_items").update({ story_schedule_slot_id: slot.id, schedule_label: slot.label, scheduled_date: date, scheduled_time: slot.localTime, scheduled_at: dubaiInstant(date, slot.localTime), time_selection_source: "client_default" }).eq("id", item.id).eq("client_id", clientId)
    if (error) throw new Error(error.message)
    occupied.add(`${slot.id}:${date}`)
  }
}

export async function applyStoryWeekToMonth(clientId: string, monthStartValue: string) {
  const workspace = await loadPublishingWorkspace(clientId, monthStartValue, { createIfMissing: true })
  if (!workspace) throw new Error("Create a publishing month before applying Story slots.")
  const slotById = new Map(workspace.storySlots.filter(slot => slot.active).map(slot => [slot.id, slot]))
  const assigned = workspace.items.filter(item => item.contentKind === "story" && item.storyScheduleSlotId && slotById.has(item.storyScheduleSlotId))
  const { error: deleteError } = await sb.from("social_story_placements").delete().eq("social_content_month_id", workspace.month.id).eq("client_id", clientId)
  if (deleteError) throw new Error(deleteError.message)
  const placements = assigned.flatMap(item => {
    const slot = slotById.get(item.storyScheduleSlotId!)!
    return datesForWeekday(workspace.month.monthStart, slot.weekday).map((scheduledDate, index) => ({
      client_id: clientId, social_content_month_id: workspace.month.id, social_content_item_id: item.id,
      social_story_schedule_slot_id: slot.id, scheduled_date: scheduledDate, scheduled_time: slot.localTime,
      scheduled_at: dubaiInstant(scheduledDate, slot.localTime), sequence: index + 1, status: item.status === "Approved" ? "Approved" : "Ready for Review",
    }))
  })
  if (placements.length > 0) {
    const { error } = await sb.from("social_story_placements").insert(placements)
    if (error) throw new Error(error.message)
  }
  return placements.length
}

async function loadItemForPlanner(clientId: string, itemId: string) {
  const { data: item, error } = await sb.from("social_content_items").select("*").eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!item) throw new Error("Content item was not found for this client.")
  const [{ data: media }, { data: targets }] = await Promise.all([
    sb.from("social_content_media").select("id").eq("social_content_item_id", itemId).eq("client_id", clientId).limit(1),
    sb.from("social_content_platform_targets").select("id").eq("social_content_item_id", itemId).eq("client_id", clientId).eq("selected", true).limit(1),
  ])
  if ((media ?? []).length === 0) throw new Error("A final media asset is required.")
  if (!item.scheduled_date || !item.scheduled_time) throw new Error("Posting date and time are required.")
  if (item.content_kind === "feed" && (!item.final_caption || !item.caption_approved_at)) throw new Error("Select or write and approve a caption before adding this Feed post to Planner.")
  if ((targets ?? []).length === 0) throw new Error("Select at least one platform before adding this item to Planner.")
  return item as AnyRecord
}

export async function addItemToPlanner(clientId: string, itemId: string) {
  const item = await loadItemForPlanner(clientId, itemId)
  const now = new Date().toISOString()
  const { error } = await sb.from("social_content_items").update({
    planner_synced_payload_version: numberValue(item.publishing_payload_version, 1), planner_synced_at: now,
    scheduled_payload_version: numberValue(item.publishing_payload_version, 1), scheduled_payload_stale: false,
  }).eq("id", itemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

/** Add every eligible Feed item to the canonical calendar without copying its payload. */
export async function addReadyFeedToPlanner(clientId: string, monthStartValue: string) {
  const workspace = await loadPublishingWorkspace(clientId, monthStartValue)
  if (!workspace) throw new Error("Publishing month was not found.")
  const feed = workspace.items.filter(item => item.contentKind === "feed" && !item.plannerSyncedAt)
  const added: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  for (const item of feed) {
    try {
      await addItemToPlanner(clientId, item.id)
      added.push(item.id)
    } catch (error) {
      skipped.push({ id: item.id, reason: error instanceof Error ? error.message : "Not ready for Planner." })
    }
  }
  return { added: added.length, skipped }
}

function plannerScheduleInput(input: { scheduledDate: unknown; scheduledTime: unknown }) {
  const scheduledDate = isoDate(input.scheduledDate)
  const scheduledTime = localTime(input.scheduledTime)
  if (!scheduledDate || !scheduledTime) throw new Error("A valid date and 24-hour time are required.")
  return { scheduledDate, scheduledTime }
}

/**
 * Planner owns placement. This updates the canonical content record and advances the
 * local Planner snapshot together; no provider payload is sent or scheduled here.
 */
export async function updatePlannerSchedule(clientId: string, input: { contentItemId: string; storyPlacementId?: string | null; scheduledDate: unknown; scheduledTime: unknown }) {
  const { scheduledDate, scheduledTime } = plannerScheduleInput(input)
  const now = new Date().toISOString()
  if (input.storyPlacementId) {
    const { error } = await sb.from("social_story_placements").update({
      scheduled_date: scheduledDate, scheduled_time: scheduledTime, scheduled_at: dubaiInstant(scheduledDate, scheduledTime),
      planner_synced_at: now, scheduled_payload_stale: false,
    }).eq("id", input.storyPlacementId).eq("client_id", clientId)
    if (error) throw new Error(error.message)
    return
  }
  const { data: item, error: loadError } = await sb.from("social_content_items").select("publishing_payload_version").eq("id", input.contentItemId).eq("client_id", clientId).maybeSingle()
  if (loadError) throw new Error(loadError.message)
  if (!item) throw new Error("Planner item was not found for this client.")
  const nextVersion = numberValue(item.publishing_payload_version, 1) + 1
  const { error } = await sb.from("social_content_items").update({
    scheduled_date: scheduledDate, scheduled_time: scheduledTime, scheduled_at: dubaiInstant(scheduledDate, scheduledTime),
    publishing_payload_version: nextVersion, planner_synced_payload_version: nextVersion, planner_synced_at: now,
    scheduled_payload_version: nextVersion, scheduled_payload_stale: false,
  }).eq("id", input.contentItemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

export async function updatePlannerPlatforms(clientId: string, input: { contentItemId: string; platforms: unknown }) {
  const platforms = Array.isArray(input.platforms) ? input.platforms.filter((value): value is SocialPublishingPlatform => typeof value === "string" && validPlatforms.has(value as SocialPublishingPlatform)) : []
  if (platforms.length === 0) throw new Error("Select at least one intended platform.")
  const { data: item, error: loadError } = await sb.from("social_content_items").select("publishing_payload_version").eq("id", input.contentItemId).eq("client_id", clientId).maybeSingle()
  if (loadError) throw new Error(loadError.message)
  if (!item) throw new Error("Planner item was not found for this client.")
  const { data: targets, error: targetError } = await sb.from("social_content_platform_targets").select("id, platform").eq("social_content_item_id", input.contentItemId).eq("client_id", clientId)
  if (targetError) throw new Error(targetError.message)
  const present = new Set((targets ?? []).map(target => stringValue(target.platform)))
  const missing = platforms.filter(platform => !present.has(platform))
  if (missing.length) {
    const { error } = await sb.from("social_content_platform_targets").insert(missing.map(platform => ({ client_id: clientId, social_content_item_id: input.contentItemId, platform, selected: true, status: "Approved" })))
    if (error) throw new Error(error.message)
  }
  if ((targets ?? []).length) {
    await Promise.all((targets ?? []).map(target => sb.from("social_content_platform_targets").update({ selected: platforms.includes(stringValue(target.platform) as SocialPublishingPlatform) }).eq("id", target.id).eq("client_id", clientId)))
  }
  const nextVersion = numberValue(item.publishing_payload_version, 1) + 1
  const now = new Date().toISOString()
  const { error } = await sb.from("social_content_items").update({
    publishing_payload_version: nextVersion, planner_synced_payload_version: nextVersion, planner_synced_at: now,
    scheduled_payload_version: nextVersion, scheduled_payload_stale: false,
  }).eq("id", input.contentItemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

export async function syncPlannerEntry(clientId: string, input: { contentItemId: string; storyPlacementId?: string | null }) {
  const now = new Date().toISOString()
  if (input.storyPlacementId) {
    const { error } = await sb.from("social_story_placements").update({ planner_synced_at: now, scheduled_payload_stale: false }).eq("id", input.storyPlacementId).eq("client_id", clientId)
    if (error) throw new Error(error.message)
    return
  }
  const { data: item, error: loadError } = await sb.from("social_content_items").select("publishing_payload_version").eq("id", input.contentItemId).eq("client_id", clientId).maybeSingle()
  if (loadError) throw new Error(loadError.message)
  if (!item) throw new Error("Planner item was not found for this client.")
  const version = numberValue(item.publishing_payload_version, 1)
  const { error } = await sb.from("social_content_items").update({ planner_synced_payload_version: version, planner_synced_at: now, scheduled_payload_version: version, scheduled_payload_stale: false }).eq("id", input.contentItemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

export async function removePlannerEntry(clientId: string, input: { contentItemId: string; storyPlacementId?: string | null }) {
  if (input.storyPlacementId) {
    const { error } = await sb.from("social_story_placements").update({ planner_synced_payload_version: null, planner_synced_at: null, scheduled_payload_stale: false }).eq("id", input.storyPlacementId).eq("client_id", clientId)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await sb.from("social_content_items").update({ planner_synced_payload_version: null, planner_synced_at: null, scheduled_payload_version: null, scheduled_payload_stale: false }).eq("id", input.contentItemId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}

export async function addStoriesToPlanner(clientId: string, monthStartValue: string) {
  const workspace = await loadPublishingWorkspace(clientId, monthStartValue)
  if (!workspace) throw new Error("Publishing month was not found.")
  const approvalById = new Map(workspace.items.map(item => [item.id, item.status]))
  const eligible = workspace.storyPlacements.filter(placement => approvalById.get(placement.socialContentItemId) === "Approved")
  if (eligible.length === 0) throw new Error("Approve at least one assigned Story before adding Stories to Planner.")
  const now = new Date().toISOString()
  const { error } = await sb.from("social_story_placements").update({
    planner_synced_payload_version: 1, planner_synced_at: now, scheduled_payload_stale: false,
  }).eq("client_id", clientId).eq("social_content_month_id", workspace.month.id).in("id", eligible.map(placement => placement.id))
  if (error) throw new Error(error.message)
}

export async function mergeFeedItemsToCarousel(clientId: string, monthStartValue: string, orderedIds: string[]) {
  const workspace = await loadPublishingWorkspace(clientId, monthStartValue, { createIfMissing: true })
  if (!workspace || orderedIds.length < 2) throw new Error("Select at least two Feed posts to create a carousel.")
  const selected = orderedIds.map(id => workspace.items.find(item => item.id === id)).filter((item): item is SocialContentItem => Boolean(item))
  if (selected.length !== orderedIds.length || selected.some(item => item.contentKind !== "feed")) throw new Error("Only Feed posts from this month can become one carousel.")
  const base = selected[0]
  const mediaIds = selected.flatMap(item => item.media.map(media => media.id))
  const { error: baseError } = await sb.from("social_content_items").update({ format: "carousel", title: base.title ?? "Carousel", status: "Needs Caption", final_caption: null, selected_caption_option_id: null, ...nextPayloadState(base as unknown as AnyRecord, true) }).eq("id", base.id).eq("client_id", clientId)
  if (baseError) throw new Error(baseError.message)
  if (selected.slice(1).length > 0) {
    await Promise.all(mediaIds.map((id, index) => sb.from("social_content_media").update({ sort_order: index + 1000 }).eq("id", id).eq("client_id", clientId)))
    const { error: moveError } = await sb.from("social_content_media").update({ social_content_item_id: base.id }).eq("client_id", clientId).in("social_content_item_id", selected.slice(1).map(item => item.id))
    if (moveError) throw new Error(moveError.message)
    const { error: deleteError } = await sb.from("social_content_items").delete().eq("client_id", clientId).in("id", selected.slice(1).map(item => item.id))
    if (deleteError) throw new Error(deleteError.message)
  }
  await Promise.all(mediaIds.map((id, index) => sb.from("social_content_media").update({ sort_order: index + 1 }).eq("id", id).eq("client_id", clientId)))
  const remaining = workspace.items.filter(item => !selected.slice(1).some(removed => removed.id === item.id)).sort((a, b) => a.sequence - b.sequence).map(item => item.id)
  await reorderFeedContent(clientId, monthStartValue, remaining)
}

export async function markItemScheduled(clientId: string, itemId: string) {
  await addItemToPlanner(clientId, itemId)
}
