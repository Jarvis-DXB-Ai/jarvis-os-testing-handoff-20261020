import { NextResponse } from "next/server"
import type { SocialPlatform } from "@/lib/zernio"
import { getSocialProviderConnections } from "@/lib/social-provider-connections-server"

type ScheduleMediaItem = {
  id?: string
  name?: string
  kind?: string
  previewUrl?: string
  mediaUrl?: string
  url?: string
  cropX?: number
  cropY?: number
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

const VALID_PLATFORMS = new Set<SocialPlatform>([
  "twitter",
  "x",
  "instagram",
  "whatsapp",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "reddit",
  "bluesky",
  "threads",
  "googlebusiness",
  "telegram",
  "snapchat",
  "discord",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function safePlatform(value: unknown): SocialPlatform | null {
  const normalized = stringValue(value).toLowerCase()
  return VALID_PLATFORMS.has(normalized as SocialPlatform) ? normalized as SocialPlatform : null
}

function accountPlatform(account: Record<string, unknown>) {
  return safePlatform(account.platform) ?? safePlatform(account.provider) ?? "instagram"
}

function accountUsername(account: Record<string, unknown>) {
  return stringValue(account.username)
    || stringValue(account.handle)
    || stringValue(account.accountUsername)
    || stringValue(account.account_name)
    || "connected"
}

function accountDisplayName(account: Record<string, unknown>) {
  return stringValue(account.displayName)
    || stringValue(account.display_name)
    || stringValue(account.name)
    || stringValue(account.accountName)
    || stringValue(account.pageName)
    || accountUsername(account)
}

function accountKey(account: Record<string, unknown>) {
  return stringValue(account.id)
    || stringValue(account.accountId)
    || stringValue(account.platformAccountId)
    || `${accountPlatform(account)}:${accountUsername(account)}`
}

function contentTypeForZernio(value: unknown) {
  const normalized = stringValue(value).toLowerCase().trim()
  if (["post", "feed", "feed post"].includes(normalized)) return "feed"
  if (normalized === "story") return "story"
  if (normalized === "reel") return "reel"
  if (normalized === "carousel") return "carousel"
  return null
}

function mediaUrlFor(item: Record<string, unknown>) {
  return stringValue(item.mediaUrl)
    || stringValue(item.url)
    || stringValue(item.previewUrl)
    || stringValue(item.uploadedPreviewUrl)
    || stringValue(item.localMediaPreviewUrl)
}

function isLocalPreviewUrl(url: string) {
  const normalized = url.toLowerCase()
  return normalized.startsWith("blob:")
    || normalized.startsWith("data:")
    || normalized.startsWith("file:")
    || normalized.includes("localhost")
    || normalized.includes("127.0.0.1")
}

function isStablePublicUrl(url: string) {
  if (isLocalPreviewUrl(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

function scheduleInstant(date: string, time: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null

  const offset = timezone === "UTC" ? "+00:00" : timezone === "Asia/Dubai" ? "+04:00" : null
  if (!offset) return null

  const isoWithOffset = `${date}T${time}:00${offset}`
  const parsed = new Date(isoWithOffset)
  if (!Number.isFinite(parsed.getTime())) return null

  return {
    local: `${date}T${time}:00`,
    isoWithOffset,
    utc: parsed.toISOString(),
  }
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({
      mode: "dry_run",
      canScheduleLive: false,
      blockedReasons: ["Invalid JSON payload."],
      zernioPayloadPreview: {},
      internalRecordPreview: {},
      warnings: ["No Zernio request was sent."],
    }, { status: 400 })
  }

  const configuredMode = process.env.SOCIAL_PUBLISHING_MODE === "live" ? "live" : "dry_run"
  const mode = "dry_run" as const
  const warnings = [
    configuredMode === "live"
      ? "SOCIAL_PUBLISHING_MODE is live, but this endpoint is currently hard-guarded to dry-run only."
      : "SOCIAL_PUBLISHING_MODE is dry_run or unset; no Zernio POST will be sent.",
  ]
  const blockedReasons: string[] = []

  const clientId = stringValue(body.clientId) || stringValue(body.client_id)
  const clientName = stringValue(body.clientName) || stringValue(body.client_name)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    blockedReasons.push("A valid client ID is required.")
  }

  const contentType = contentTypeForZernio(body.contentType)
  if (!contentType) blockedReasons.push("Content type must be feed, story, reel, or carousel.")

  const caption = stringValue(body.caption).trim()
  if (!caption) blockedReasons.push("Caption is required before scheduling.")

  const date = stringValue(body.date)
  const time = stringValue(body.time)
  const timezone = stringValue(body.timezone) || "Asia/Dubai"
  const scheduled = scheduleInstant(date, time, timezone)
  if (!scheduled) {
    blockedReasons.push("Scheduled date, time, and timezone must be valid. Supported timezones: Asia/Dubai, UTC.")
  } else if (new Date(scheduled.utc).getTime() <= Date.now()) {
    blockedReasons.push("Scheduled datetime must be in the future.")
  }

  const selectedAccountIds = cleanStringArray(body.selectedAccountIds)
  if (selectedAccountIds.length === 0) blockedReasons.push("At least one selected account is required.")

  // A dry-run preview must never perform a provider account-list request. Only
  // the durable, explicit client/provider mappings are eligible for display or
  // future scheduling. This route remains hard-disabled for external execution.
  const clientAccounts: Record<string, unknown>[] = []
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    try {
      const snapshot = await getSocialProviderConnections(clientId)
      for (const connection of snapshot.connections) {
        if (connection.status !== "connected" || !connection.providerConnectionId || !connection.platformAccountId) continue
        if (connection.platform !== "instagram" && connection.platform !== "facebook") continue
        clientAccounts.push({
          id: connection.providerConnectionId,
          platform: connection.platform,
          username: connection.handle?.replace(/^@/, "") || "connected",
          displayName: connection.accountName || connection.handle || "Connected account",
          platformAccountId: connection.platformAccountId,
        })
      }
    } catch {
      blockedReasons.push("Unable to load cached explicit provider account mappings.")
    }
  }
  if (clientAccounts.length === 0) blockedReasons.push("No cached explicit social account mapping was found for this client.")

  const accountMap = new Map(clientAccounts.map(account => [accountKey(account), account]))
  const selectedAccounts = selectedAccountIds
    .map(id => accountMap.get(id))
    .filter((account): account is Record<string, unknown> => Boolean(account))
  const missingAccounts = selectedAccountIds.filter(id => !accountMap.has(id))
  if (missingAccounts.length > 0) {
    blockedReasons.push(`Selected account(s) are not connected to this client: ${missingAccounts.join(", ")}.`)
  }

  const rawMediaItems = Array.isArray(body.mediaItems) ? body.mediaItems.filter(isRecord) : []
  const fallbackMediaUrls = cleanStringArray(body.mediaUrls)
  const mediaItems: ScheduleMediaItem[] = rawMediaItems.map(item => ({
    id: stringValue(item.id),
    name: stringValue(item.name) || "Selected media",
    kind: stringValue(item.kind) || stringValue(item.mediaKind) || "image",
    previewUrl: stringValue(item.previewUrl),
    mediaUrl: stringValue(item.mediaUrl),
    url: stringValue(item.url),
    cropX: numberValue(item.cropX),
    cropY: numberValue(item.cropY),
    width: numberValue(item.width) ?? null,
    height: numberValue(item.height) ?? null,
    durationSeconds: numberValue(item.durationSeconds) ?? null,
  }))
  for (const url of fallbackMediaUrls) {
    mediaItems.push({ name: "Selected media", kind: "image", mediaUrl: url })
  }

  if (mediaItems.length === 0) {
    blockedReasons.push("At least one media item is required before scheduling.")
  }

  const mediaUrls = mediaItems.map(item => mediaUrlFor(item as Record<string, unknown>)).filter(Boolean)
  const localMediaUrls = mediaUrls.filter(isLocalPreviewUrl)
  const unstableMediaUrls = mediaUrls.filter(url => !isStablePublicUrl(url))
  if (localMediaUrls.length > 0 || unstableMediaUrls.length > 0) {
    blockedReasons.push("Media must be uploaded to server storage before live scheduling.")
  }
  if (mediaUrls.some(url => url.includes("/storage/v1/object/sign/"))) {
    warnings.push("Signed storage URLs can expire; live scheduling should use durable media URLs or refresh them at submit time.")
  }

  const platforms = [...new Set(selectedAccounts.map(accountPlatform))]
  blockedReasons.push("Direct schedule payloads are disabled. A future execution must derive its payload from the approved canonical Publishing item and use the durable provider execution ledger.")
  const zernioPayloadPreview = {
    client_id: clientId,
    account_ids: selectedAccounts.map(accountKey),
    platforms,
    content_type: contentType,
    caption,
    media_urls: mediaUrls,
    scheduled_datetime: scheduled?.isoWithOffset ?? null,
    scheduled_datetime_utc: scheduled?.utc ?? null,
    timezone,
  }

  const internalRecordPreview = {
    clientId,
    clientName,
    selectedAccountIds,
    selectedAccounts: selectedAccounts.map(account => ({
      id: accountKey(account),
      platform: accountPlatform(account),
      username: accountUsername(account),
      displayName: accountDisplayName(account),
    })),
    contentType,
    scheduledAt: scheduled?.utc ?? null,
    timezone,
    media: mediaItems.map(item => ({
      name: item.name,
      kind: item.kind,
      url: mediaUrlFor(item as Record<string, unknown>),
      cropX: item.cropX,
      cropY: item.cropY,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
    })),
    notesStoredInternally: Boolean(stringValue(body.notes).trim()),
    cropMetadataStoredInternally: mediaItems.some(item => item.cropX !== undefined || item.cropY !== undefined),
    syncStatus: "dry_run",
  }

  return NextResponse.json({
    ok: blockedReasons.length === 0,
    mode,
    canScheduleLive: false,
    blockedReasons,
    zernioPayloadPreview,
    internalRecordPreview,
    warnings,
  })
}
