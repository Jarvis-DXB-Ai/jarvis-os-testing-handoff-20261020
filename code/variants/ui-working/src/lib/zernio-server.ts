import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { PinterestBoard, PinterestMoodboard, PinterestPinRef } from "@/lib/pinterest-inspiration"
import { socialAccountMatchesClient, type SocialClientScope } from "@/lib/social-client-config"
import type {
  AutomationRule,
  ConnectedSocialAccount,
  InstagramAccountInsight,
  InstagramAudienceRow,
  InstagramFollowerObservation,
  InstagramDemographics,
  InboxConversation,
  InstagramStoryMedia,
  SocialAnalyticsRange,
  SocialComment,
  SocialConnectionState,
  SocialPlatform,
  ZernioAccountPlatform,
  SocialPostPerformance,
  SocialPost,
  PostingFrequencyObservation,
  SocialProfileContainer,
  SocialReadOnlyResource,
  SocialReadOnlyResponse,
} from "@/lib/zernio"
import { ZERNIO_INTEGRATION_STATUS } from "@/lib/zernio"
import { sanitizeProviderJson, sanitizeProviderString } from "@/lib/provider-unicode"

const ZERNIO_BASE_URL = "https://zernio.com/api/v1"
const ZERNIO_TIMEOUT_MS = 10_000
const ZERNIO_ANALYTICS_PAGE_LIMIT = 100
const ZERNIO_PAGINATION_SAFETY_CAP = 50
const ZERNIO_ALL_HISTORY_YEAR_CAP = 5
const ZERNIO_ALL_HISTORY_EMPTY_WINDOW_CAP = 2
const CLIENT_ASSETS_BUCKET = "client-assets"
const SOCIAL_THUMBNAIL_SIGNED_URL_TTL = 86_400
const SOCIAL_THUMBNAIL_CACHE_CONCURRENCY = 8

type QueryValue = string | number | boolean | null | undefined
type ZernioFetchResult = {
  ok: boolean
  payload?: unknown
  status?: number
  error?: string
  connectionState?: SocialConnectionState
}

type ZernioReadOptions = SocialClientScope

export type ZernioAccountHealth = {
  accountId: string
  platform: ZernioAccountPlatform
  username: string | null
  displayName: string | null
  status: string | null
  tokenStatus: { valid: boolean | null; expiresAt: string | null; needsRefresh: boolean | null }
  permissions: Record<string, Array<{ scope: string; granted: boolean | null }>>
  warnings: string[]
}

export type ZernioScheduleRequest = {
  content: string
  mediaItems: Array<{ type: "image" | "video"; url: string }>
  platforms: Array<{ platform: "instagram" | "facebook"; accountId: string; platformSpecificData?: { contentType: "story" | "reel" } }>
  scheduledFor: string
  timezone: "Asia/Dubai"
}

export type ZernioScheduleResult = {
  ok: boolean
  ambiguous: boolean
  status: number | null
  providerPostId: string | null
  providerStatus: string | null
  payload: Record<string, unknown>
  error: string | null
}

const SOCIAL_PLATFORMS: SocialPlatform[] = [
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
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? sanitizeProviderString(value).value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizePlatform(value: unknown): SocialPlatform {
  const platform = stringValue(value).toLowerCase()
  return SOCIAL_PLATFORMS.includes(platform as SocialPlatform) ? platform as SocialPlatform : "instagram"
}

function normalizeAccountPlatform(value: unknown): ZernioAccountPlatform {
  const platform = stringValue(value).toLowerCase()
  if (platform === "metaads" || platform === "meta_ads") return "metaads"
  return normalizePlatform(value)
}

function hasClientScope(options?: ZernioReadOptions) {
  return Boolean(options?.clientId || options?.clientName)
}

function scopedAccounts(accounts: ConnectedSocialAccount[], options?: ZernioReadOptions) {
  if (!hasClientScope(options)) return accounts
  return accounts.filter(account => socialAccountMatchesClient(account as unknown as Record<string, unknown>, options ?? {}))
}

function filterResponseByClient<T>(
  response: SocialReadOnlyResponse<T>,
  accounts: ConnectedSocialAccount[],
  options?: ZernioReadOptions,
) {
  if (!hasClientScope(options)) return response
  const matches = response.data.filter(record => accounts.some(account => socialRecordMatchesAccount(record as Record<string, unknown>, account)))
  return {
    ...response,
    connectionState: matches.length > 0 ? response.connectionState : response.connectionState === "connected" ? "no_data" as SocialConnectionState : response.connectionState,
    data: matches,
    summary: {
      ...response.summary,
      clientScoped: true,
      sourceCount: response.data.length,
      count: matches.length,
    },
  }
}

function objectId(value: unknown) {
  if (typeof value === "string") return value
  if (isRecord(value)) return stringValue(value._id) || stringValue(value.id)
  return ""
}

function normalizedAccountText(value: unknown) {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function accountIdentifiers(account: Record<string, unknown>) {
  const ids = [
    account.id,
    account.accountId,
    account.account_id,
    account.platformAccountId,
    account.platform_account_id,
    account.externalAccountId,
    account.external_account_id,
  ].map(value => stringValue(value).trim()).filter(Boolean)
  const usernames = [
    account.username,
    account.handle,
    account.accountUsername,
    account.account_username,
    account.account_name,
  ].map(normalizedAccountText).filter(Boolean)
  return { ids: new Set(ids), usernames: new Set(usernames) }
}

function socialRecordMatchesAccount(record: Record<string, unknown>, account: Record<string, unknown>) {
  const { ids, usernames } = accountIdentifiers(account)
  const recordIds = [
    record.accountId,
    record.account_id,
    record.platformAccountId,
    record.platform_account_id,
    record.externalAccountId,
    record.external_account_id,
  ].map(value => stringValue(value).trim()).filter(Boolean)
  if (recordIds.some(id => ids.has(id))) return true

  const recordUsernames = [
    record.accountUsername,
    record.account_username,
    record.username,
    record.handle,
  ].map(normalizedAccountText).filter(Boolean)
  return recordUsernames.some(username => usernames.has(username))
}

function storageSafeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}

function supabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function ensureClientAssetsBucket() {
  const sb = supabaseServiceClient()
  if (!sb) return null
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find(bucket => bucket.name === CLIENT_ASSETS_BUCKET)) {
    await sb.storage.createBucket(CLIENT_ASSETS_BUCKET, { public: false })
  }
  return sb
}

function arrayFrom(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  for (const key of keys) {
    const value = payload[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function paginationSummary(payload: unknown) {
  if (!isRecord(payload)) return {}
  const summary: Record<string, unknown> = {}
  if (isRecord(payload.pagination)) summary.pagination = payload.pagination
  for (const key of ["count", "total", "hasAnalyticsAccess", "profileId", "nextSlot"]) {
    if (payload[key] !== undefined) summary[key] = payload[key]
  }
  return summary
}

function paginationMeta(payload: unknown) {
  const pagination = isRecord(payload) && isRecord(payload.pagination) ? payload.pagination : {}
  return {
    page: numberValue(pagination.page, 1),
    pages: numberValue(pagination.pages, 1),
    limit: numberValue(pagination.limit, ZERNIO_ANALYTICS_PAGE_LIMIT),
    total: optionalNumber(pagination.total),
  }
}

function readOnlyResponse<T>(
  resource: SocialReadOnlyResource,
  connectionState: SocialConnectionState,
  data: T[],
  summary: Record<string, unknown> = {},
  error?: string,
  providerStatus?: number,
): SocialReadOnlyResponse<T> {
  return {
    ok: connectionState === "connected" || connectionState === "no_data",
    resource,
    mode: "read_only",
    integration: ZERNIO_INTEGRATION_STATUS,
    connectionState,
    readOnly: true,
    data,
    summary: { ...summary, count: data.length },
    ...(error ? { error } : {}),
    ...(providerStatus ? { providerStatus } : {}),
  }
}

function missingKey<T>(resource: SocialReadOnlyResource): SocialReadOnlyResponse<T> {
  return readOnlyResponse(resource, "missing_api_key", [], {}, "Zernio API key is not configured.")
}

function sanitizedErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload)) {
    const message = stringValue(payload.error) || stringValue(payload.message)
    if (message) return message.slice(0, 240)
  }
  return `Zernio returned HTTP ${status}`
}

async function zernioGet<T>(
  resource: SocialReadOnlyResource,
  path: string,
  query: Record<string, QueryValue> = {},
  normalize: (payload: unknown) => { data: T[]; summary?: Record<string, unknown> },
): Promise<SocialReadOnlyResponse<T>> {
  const result = await zernioFetch(path, query)
  if (!result.ok) {
    if (result.connectionState === "missing_api_key") return missingKey<T>(resource)
    return readOnlyResponse<T>(resource, "zernio_error", [], {}, result.error ?? "Zernio request failed.", result.status)
  }
  try {
    const payload = sanitizeProviderJson(result.payload).value
    const normalized = normalize(payload)
    return readOnlyResponse(resource, normalized.data.length > 0 ? "connected" : "no_data", normalized.data, normalized.summary ?? paginationSummary(payload), undefined, result.status)
  } catch {
    return readOnlyResponse<T>(resource, "zernio_error", [], {}, "Unable to normalize Zernio response.")
  }
}

async function zernioFetch(path: string, query: Record<string, QueryValue> = {}): Promise<ZernioFetchResult> {
  const apiKey = process.env.ZERNIO_API_KEY?.trim()
  if (!apiKey) return { ok: false, connectionState: "missing_api_key", error: "Zernio API key is not configured." }

  const url = new URL(`${ZERNIO_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ZERNIO_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    })

    const contentType = response.headers.get("content-type") ?? ""
    const rawPayload = contentType.includes("application/json") ? await response.json() as unknown : await response.text()
    const payload = sanitizeProviderJson(rawPayload).value
    if (!response.ok) {
      return { ok: false, status: response.status, error: sanitizedErrorMessage(payload, response.status), payload, connectionState: "zernio_error" }
    }
    return { ok: true, status: response.status, payload, connectionState: "connected" }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Zernio request timed out." : "Zernio request failed."
    return { ok: false, error: message, connectionState: "zernio_error" }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * The only Zernio write adapter. It deliberately has no retry loop: callers
 * reserve the execution first and must recover an ambiguous request rather
 * than issue a second post creation request.
 */
export async function scheduleZernioPost(request: ZernioScheduleRequest, requestId: string): Promise<ZernioScheduleResult> {
  const apiKey = process.env.ZERNIO_API_KEY?.trim()
  if (!apiKey) return { ok: false, ambiguous: false, status: null, providerPostId: null, providerStatus: null, payload: {}, error: "Zernio API key is not configured." }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ZERNIO_TIMEOUT_MS)
  try {
    const response = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({ content: request.content, mediaItems: request.mediaItems, platforms: request.platforms, scheduledFor: request.scheduledFor, timezone: request.timezone }),
      signal: controller.signal,
      cache: "no-store",
    })
    const contentType = response.headers.get("content-type") ?? ""
    const raw = contentType.includes("application/json") ? await response.json() as unknown : {}
    const payload = sanitizeProviderJson(raw).value
    const record = isRecord(payload) ? payload : {}
    const post = isRecord(record.post) ? record.post : record
    const providerPostId = objectId(post._id) || objectId(post.id) || null
    const providerStatus = stringValue(post.status) || null
    if (!response.ok) return { ok: false, ambiguous: false, status: response.status, providerPostId, providerStatus, payload: record, error: sanitizedErrorMessage(payload, response.status) }
    // A 2xx response without a provider post identity is unsafe to retry.
    return { ok: Boolean(providerPostId), ambiguous: !providerPostId, status: response.status, providerPostId, providerStatus, payload: record, error: providerPostId ? null : "Zernio accepted the request but did not return a provider post ID." }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError"
    return { ok: false, ambiguous: true, status: null, providerPostId: null, providerStatus: null, payload: {}, error: isTimeout ? "Zernio scheduling request timed out; do not resend." : "Zernio scheduling request failed before a provider response was available; do not resend automatically." }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getZernioPostStatus(providerPostId: string): Promise<ZernioScheduleResult> {
  const result = await zernioFetch(`/posts/${encodeURIComponent(providerPostId)}`)
  const payload = isRecord(result.payload) ? result.payload : {}
  const post = isRecord(payload.post) ? payload.post : payload
  if (!result.ok) return { ok: false, ambiguous: false, status: result.status ?? null, providerPostId, providerStatus: null, payload, error: result.error ?? "Unable to retrieve Zernio post status." }
  return { ok: true, ambiguous: false, status: result.status ?? null, providerPostId: objectId(post._id) || objectId(post.id) || providerPostId, providerStatus: stringValue(post.status) || null, payload, error: null }
}

function normalizeAccount(raw: unknown): ConnectedSocialAccount {
  const record = isRecord(raw) ? raw : {}
  const profile = isRecord(record.profileId) ? record.profileId : {}
  const metadata = isRecord(record.metadata) ? record.metadata : {}
  const profileData = isRecord(metadata.profileData) ? metadata.profileData : {}
  const extraData = isRecord(profileData.extraData) ? profileData.extraData : {}
  const active = booleanValue(record.isActive, true)
  const platform = normalizeAccountPlatform(record.platform)
  return {
    id: objectId(record._id) || objectId(record.id),
    clientId: "zernio",
    platform,
    username: stringValue(record.username) || stringValue(profileData.username),
    displayName: stringValue(record.displayName) || stringValue(profileData.displayName) || stringValue(record.name) || stringValue(record.username) || stringValue(profileData.username),
    externalAccountId: stringValue(record.externalAccountId) || null,
    connectionStatus: active ? "connected" : "disconnected",
    tokenHealth: active ? "unknown" : "error",
    primary: platform === "instagram",
    profileId: objectId(record.profileId) || objectId(profile._id) || null,
    avatarUrl: stringValue(record.profilePicture) || stringValue(profileData.profilePicture) || stringValue(record.avatarUrl) || null,
    bio: stringValue(profileData.bio) || null,
    website: stringValue(profileData.website) || null,
    profileUrl: stringValue(record.profileUrl) || stringValue(profileData.profileUrl) || null,
    followers: optionalNumber(record.followersCount) ?? optionalNumber(profileData.followersCount) ?? null,
    following: optionalNumber(extraData.followsCount) ?? null,
    postCount: optionalNumber(extraData.mediaCount) ?? optionalNumber(record.externalPostCount) ?? null,
    connectedAt: stringValue(record.createdAt) || null,
    lastSyncedAt: stringValue(record.analyticsLastSyncedAt) || stringValue(record.updatedAt) || null,
    providerMetadata: {
      platformStatus: stringValue(record.platformStatus) || null,
      platformUserId: stringValue(record.platformUserId) || null,
      accountType: stringValue(extraData.accountType) || null,
      followers: optionalNumber(record.followersCount) ?? optionalNumber(profileData.followersCount) ?? null,
      postCount: optionalNumber(extraData.mediaCount) ?? optionalNumber(record.externalPostCount) ?? null,
      metaAds: platform === "metaads" ? {
        enumeratedAdAccountIds: stringArray(metadata.enumeratedAdAccountIds),
        scopedAdAccountIds: stringArray(metadata.scopedAdAccountIds),
        subscribedAdAccountIds: stringArray(metadata.subscribedAdAccountIds),
      } : undefined,
    },
  }
}

function normalizeHealthPermissions(value: unknown) {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([group, permissions]) => [
    group,
    (Array.isArray(permissions) ? permissions : [permissions]).flatMap(permission => {
      if (!isRecord(permission)) return []
      const scope = stringValue(permission.scope) || stringValue(permission.name) || stringValue(permission.permission)
      if (!scope) return []
      const granted = typeof permission.granted === "boolean" ? permission.granted : typeof permission.available === "boolean" ? permission.available : null
      return [{ scope, granted }]
    }),
  ])) as ZernioAccountHealth["permissions"]
}

function normalizeAccountHealth(raw: unknown): ZernioAccountHealth {
  const record = isRecord(raw) ? raw : {}
  const tokenStatus = isRecord(record.tokenStatus) ? record.tokenStatus : {}
  const warnings = [record.warning, record.warnings, record.recommendations, record.issues]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => stringValue(value))
    .filter(Boolean)
    .slice(0, 8)
  return {
    accountId: objectId(record.accountId) || objectId(record.account_id) || objectId(record._id) || objectId(record.id),
    platform: normalizeAccountPlatform(record.platform),
    username: stringValue(record.username) || null,
    displayName: stringValue(record.displayName) || stringValue(record.name) || null,
    status: stringValue(record.status) || null,
    tokenStatus: {
      valid: typeof tokenStatus.valid === "boolean" ? tokenStatus.valid : null,
      expiresAt: stringValue(tokenStatus.expiresAt) || null,
      needsRefresh: typeof tokenStatus.needsRefresh === "boolean" ? tokenStatus.needsRefresh : null,
    },
    permissions: normalizeHealthPermissions(record.permissions),
    warnings,
  }
}

function normalizeProfile(raw: unknown): SocialProfileContainer {
  const record = isRecord(raw) ? raw : {}
  return {
    id: objectId(record._id) || objectId(record.id),
    name: stringValue(record.name) || "Untitled profile",
    description: stringValue(record.description) || null,
    color: stringValue(record.color) || null,
    isDefault: booleanValue(record.isDefault),
    createdAt: stringValue(record.createdAt) || null,
  }
}

function normalizePost(raw: unknown): SocialPost {
  const record = isRecord(raw) ? raw : {}
  const platforms = Array.isArray(record.platforms) ? record.platforms : []
  const firstPlatform = isRecord(platforms[0]) ? platforms[0] : {}
  const account = isRecord(firstPlatform.accountId) ? firstPlatform.accountId : {}
  const rawStatus = stringValue(record.status, "draft")
  const status = ["draft", "scheduled", "published", "failed"].includes(rawStatus) ? rawStatus as SocialPost["status"] : "draft"
  const media = arrayFrom(record.media, ["media", "mediaUrls", "images"])
    .map(item => isRecord(item) ? stringValue(item.url) || stringValue(item.src) : stringValue(item))
    .filter(Boolean)

  return {
    id: objectId(record._id) || objectId(record.id),
    clientId: "zernio",
    accountId: objectId(account._id) || objectId(firstPlatform.accountId) || null,
    platform: normalizePlatform(firstPlatform.platform || record.platform),
    title: stringValue(record.title) || stringValue(record.content).slice(0, 80) || "Untitled post",
    caption: stringValue(record.content) || stringValue(record.text),
    hashtags: Array.isArray(record.tags) ? record.tags.map(tag => stringValue(tag)).filter(Boolean) : [],
    cta: null,
    mediaUrls: media,
    contentType: "post",
    campaignId: null,
    status,
    scheduledAt: stringValue(record.scheduledFor) || stringValue(record.scheduledAt) || null,
    publishedAt: stringValue(record.publishedAt) || null,
    approvalStatus: "not_required",
    queueItemId: null,
    zernioPostId: objectId(record._id) || null,
  }
}

function normalizeConversation(raw: unknown): InboxConversation {
  const record = isRecord(raw) ? raw : {}
  const participant = isRecord(record.participant) ? record.participant : {}
  return {
    id: objectId(record._id) || objectId(record.id),
    clientId: "zernio",
    accountId: objectId(record.accountId),
    platform: normalizePlatform(record.platform),
    participantName: stringValue(record.participantName) || stringValue(participant.name) || stringValue(participant.username) || "Unknown contact",
    participantHandle: stringValue(participant.username) || null,
    tags: [],
    priority: "medium",
    status: "open",
    lastMessagePreview: stringValue(record.lastMessagePreview) || stringValue(record.preview) || "",
    lastMessageAt: stringValue(record.lastMessageAt) || stringValue(record.updatedAt) || stringValue(record.createdAt),
  }
}

function normalizeComment(raw: unknown): SocialComment {
  const record = isRecord(raw) ? raw : {}
  const author = isRecord(record.author) ? record.author : {}
  return {
    id: objectId(record._id) || objectId(record.id),
    conversationId: null,
    postId: objectId(record.postId) || objectId(record.platformPostId) || null,
    authorHandle: stringValue(record.authorHandle) || stringValue(author.username) || stringValue(author.name) || "unknown",
    text: stringValue(record.text) || stringValue(record.message),
    tags: [],
    createdAt: stringValue(record.createdAt),
    replied: booleanValue(record.replied) || booleanValue(record.hasReply),
  }
}

function postTypeFromMedia(value: unknown): SocialPostPerformance["postType"] {
  const mediaType = stringValue(value).toLowerCase()
  if (mediaType.includes("video") || mediaType.includes("reel")) return "reel"
  if (mediaType.includes("story")) return "story"
  if (mediaType.includes("carousel") || mediaType.includes("album")) return "carousel"
  return "post"
}

function analyticsSubjectTags(content: string, mediaType: string) {
  const text = content.toLowerCase()
  const tags = new Set<string>()
  if (mediaType) tags.add(mediaType)
  const terms: Array<[string, string[]]> = [
    ["traffic_hours", ["traffic hours", "happy hour", "buy one", "cocktail", "beer"]],
    ["breakfast", ["breakfast", "morning", "coffee", "french toast", "eggs", "brunch"]],
    ["business_lunch", ["business lunch", "lunch"]],
    ["lunch", ["lunch", "midday"]],
    ["dinner", ["dinner", "evening"]],
    ["restaurant_week", ["restaurant week"]],
    ["outdoor", ["terrace", "skyline", "open-air", "outdoor", "alfresco"]],
    ["interior", ["interior", "inside", "indoor", "dining room"]],
    ["terrace", ["terrace", "open-air", "alfresco"]],
    ["venue", ["terrace", "skyline", "difc", "open-air", "outdoor", "interior", "dining room"]],
    ["food", ["dish", "menu", "steak", "oyster", "cabbage", "dessert", "cuisine", "plate"]],
    ["drinks", ["cocktail", "drink", "beer", "martini", "bar"]],
    ["lifestyle", ["ladies", "friends", "gather", "shared", "moment", "experience", "ritual", "table"]],
    ["promotion", ["aed", "free", "offer", "available", "win", "discount", "50%"]],
    ["event", ["event", "dubai restaurant week", "eid", "celebrate", "celebration"]],
    ["offer", ["aed", "free", "offer", "available", "win"]],
  ]
  for (const [tag, needles] of terms) {
    if (needles.some(needle => text.includes(needle))) tags.add(tag)
  }
  return Array.from(tags)
}

function normalizeAnalyticsRecord(raw: unknown): SocialPostPerformance {
  const record = isRecord(raw) ? raw : {}
  const analytics = isRecord(record.analytics) ? record.analytics : {}
  const platforms = Array.isArray(record.platforms) ? record.platforms.filter(isRecord) : []
  const platformRow = platforms[0] ?? {}
  const platformAnalytics = isRecord(platformRow.analytics) ? platformRow.analytics : analytics
  const content = stringValue(record.content)
  const mediaType = stringValue(record.mediaType)
  const publishedAt = stringValue(record.publishedAt) || stringValue(record.scheduledFor) || stringValue(record.createdAt)
  const postId = objectId(record._id) || objectId(record.id) || stringValue(platformRow.platformPostId) || stringValue(record.platformPostUrl)
  const platformPostId = stringValue(platformRow.platformPostId) || stringValue(record.platformPostId) || null
  const platformUrl = stringValue(record.platformPostUrl) || stringValue(platformRow.platformPostUrl) || null
  const platformThumbnailUrl = stringValue(record.thumbnailUrl) || null

  return {
    postId,
    zernioPostId: objectId(record._id) || objectId(record.id) || null,
    platformPostId,
    platform: normalizePlatform(platformRow.platform || record.platform),
    postType: postTypeFromMedia(mediaType),
    createdAt: publishedAt || new Date(0).toISOString(),
    publishedAt: publishedAt || null,
    title: content.replace(/\s+/g, " ").slice(0, 120) || null,
    caption: content || null,
    mediaType: mediaType || null,
    thumbnailUrl: platformThumbnailUrl,
    platformThumbnailUrl,
    postUrl: platformUrl,
    platformUrl,
    accountId: objectId(platformRow.accountId) || objectId(record.accountId) || null,
    accountUsername: stringValue(platformRow.accountUsername) || null,
    reach: optionalNumber(platformAnalytics.reach),
    impressions: optionalNumber(platformAnalytics.impressions),
    likes: optionalNumber(platformAnalytics.likes),
    comments: optionalNumber(platformAnalytics.comments),
    shares: optionalNumber(platformAnalytics.shares),
    saves: optionalNumber(platformAnalytics.saves),
    clicks: optionalNumber(platformAnalytics.clicks),
    views: optionalNumber(platformAnalytics.views),
    watchTime: optionalNumber(platformAnalytics.igReelsVideoViewTotalTime) ?? optionalNumber(platformAnalytics.watchTime),
    averageWatchTime: optionalNumber(platformAnalytics.igReelsAvgWatchTime) ?? optionalNumber(platformAnalytics.averageWatchTime),
    engagementRate: optionalNumber(platformAnalytics.engagementRate),
    lastUpdated: stringValue(platformAnalytics.lastUpdated) || null,
    subjectTags: analyticsSubjectTags(content, mediaType),
  }
}

function socialThumbnailPath(record: SocialPostPerformance) {
  return `social-thumbnails/${storageSafeSegment(record.platform)}/${storageSafeSegment(record.postId)}.jpg`
}

async function signedCachedThumbnail(path: string) {
  const sb = supabaseServiceClient()
  if (!sb) return null
  const { data, error } = await sb.storage.from(CLIENT_ASSETS_BUCKET).createSignedUrl(path, SOCIAL_THUMBNAIL_SIGNED_URL_TTL)
  return error ? null : data?.signedUrl ?? null
}

async function downloadImage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "Mozilla/5.0" },
  })
  const contentType = response.headers.get("content-type") ?? "image/jpeg"
  if (!response.ok || !contentType.startsWith("image/")) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.length > 0 ? { buffer, contentType } : null
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
}

async function downloadInstagramPostOgImage(postUrl: string | null | undefined) {
  if (!postUrl || !postUrl.includes("instagram.com")) return null
  try {
    const response = await fetch(postUrl, {
      cache: "no-store",
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0",
      },
    })
    if (!response.ok) return null
    const html = await response.text()
    const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1]
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i)?.[1]
    return ogImage ? downloadImage(decodeHtmlAttribute(ogImage)) : null
  } catch {
    return null
  }
}

async function cacheSocialThumbnail(record: SocialPostPerformance): Promise<SocialPostPerformance> {
  const sourceUrl = record.platformThumbnailUrl ?? record.thumbnailUrl ?? null
  if (!sourceUrl || !record.postId) return { ...record, thumbnailCacheStatus: "missing_source" }

  const path = socialThumbnailPath(record)
  const existingSignedUrl = await signedCachedThumbnail(path)
  if (existingSignedUrl) {
    return {
      ...record,
      thumbnailUrl: existingSignedUrl,
      cachedThumbnailUrl: existingSignedUrl,
      cachedThumbnailPath: path,
      thumbnailCacheStatus: "cached",
    }
  }

  const sb = await ensureClientAssetsBucket()
  if (!sb) return { ...record, thumbnailCacheStatus: "not_configured" }

  try {
    const downloaded = await downloadImage(sourceUrl) ?? await downloadInstagramPostOgImage(record.postUrl)
    if (!downloaded) return { ...record, cachedThumbnailPath: path, thumbnailCacheStatus: "source_unavailable" }

    const { error } = await sb.storage.from(CLIENT_ASSETS_BUCKET).upload(path, downloaded.buffer, {
      contentType: downloaded.contentType,
      upsert: true,
    })
    if (error) return { ...record, cachedThumbnailPath: path, thumbnailCacheStatus: "error" }

    const cachedSignedUrl = await signedCachedThumbnail(path)
    if (!cachedSignedUrl) return { ...record, cachedThumbnailPath: path, thumbnailCacheStatus: "error" }

    return {
      ...record,
      thumbnailUrl: cachedSignedUrl,
      cachedThumbnailUrl: cachedSignedUrl,
      cachedThumbnailPath: path,
      thumbnailCacheStatus: "cached",
    }
  } catch {
    return { ...record, cachedThumbnailPath: path, thumbnailCacheStatus: "error" }
  }
}

async function attachCachedThumbnails(records: SocialPostPerformance[]) {
  const output: SocialPostPerformance[] = []
  for (let i = 0; i < records.length; i += SOCIAL_THUMBNAIL_CACHE_CONCURRENCY) {
    const batch = records.slice(i, i + SOCIAL_THUMBNAIL_CACHE_CONCURRENCY)
    output.push(...await Promise.all(batch.map(cacheSocialThumbnail)))
  }
  return output
}

function normalizeAutomation(raw: unknown): AutomationRule {
  const record = isRecord(raw) ? raw : {}
  return {
    id: objectId(record._id) || objectId(record.id),
    clientId: "zernio",
    name: stringValue(record.name) || stringValue(record.keyword) || "Comment automation",
    trigger: stringValue(record.keyword) || stringValue(record.trigger) || "keyword",
    sourcePlatform: normalizePlatform(record.platform),
    sourceCampaignId: null,
    action: "send_dm",
    response: stringValue(record.dmMessage) || stringValue(record.response),
    destination: "dm",
    status: booleanValue(record.active) ? "active" : "paused",
    safetyMode: "manual_approval",
    approvalRequired: true,
  }
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function analyticsWindowForRange(range: SocialAnalyticsRange) {
  const to = new Date()
  const days = range === "30d" ? 30 : 90
  return { fromDate: dateOnly(addDays(to, -days)), toDate: dateOnly(to) }
}

function analyticsActualDates(records: SocialPostPerformance[]) {
  const timestamps = records
    .map(record => record.publishedAt || record.createdAt)
    .map(value => value ? new Date(value).getTime() : Number.NaN)
    .filter(Number.isFinite)
  if (timestamps.length === 0) return { first: null, last: null }
  return {
    first: new Date(Math.min(...timestamps)).toISOString(),
    last: new Date(Math.max(...timestamps)).toISOString(),
  }
}

function dedupeAnalytics(records: SocialPostPerformance[]) {
  const map = new Map<string, SocialPostPerformance>()
  for (const record of records) {
    if (!record.postId) continue
    map.set(record.postId, record)
  }
  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.publishedAt || a.createdAt).getTime()
    const bTime = new Date(b.publishedAt || b.createdAt).getTime()
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
  })
}

export type ZernioAnalyticsPlatform = Extract<SocialPlatform, "instagram" | "facebook">

async function fetchAnalyticsWindow(platform: ZernioAnalyticsPlatform, fromDate: string, toDate: string) {
  const rows: SocialPostPerformance[] = []
  let page = 1
  let pagesFetched = 0
  let providerStatus: number | undefined
  let total: number | undefined
  let error: string | undefined
  let connectionState: SocialConnectionState | undefined

  while (page <= ZERNIO_PAGINATION_SAFETY_CAP) {
    const result = await zernioFetch("/analytics", {
      platform,
      fromDate,
      toDate,
      limit: ZERNIO_ANALYTICS_PAGE_LIMIT,
      page,
      sortBy: "date",
      order: "desc",
    })

    providerStatus = result.status
    if (!result.ok) {
      error = result.error
      connectionState = result.connectionState
      break
    }

    const payload = result.payload
    const records = arrayFrom(payload, ["analytics", "posts", "items", "results", "data"])
      .map(normalizeAnalyticsRecord)
      .filter(record => record.platform === platform)
    rows.push(...records)

    pagesFetched += 1
    const meta = paginationMeta(payload)
    total = meta.total ?? total
    const pageCount = meta.pages || (records.length < ZERNIO_ANALYTICS_PAGE_LIMIT ? page : page + 1)
    if (page >= pageCount || records.length === 0) break
    page += 1
  }

  return { rows, pagesFetched, providerStatus, total, error, connectionState }
}

export async function getAnalyticsRange(input: { since: string; until: string }) {
  const window = await fetchAnalyticsWindow("instagram", input.since, input.until)
  if (window.error && window.rows.length === 0) {
    if (window.connectionState === "missing_api_key") return missingKey<SocialPostPerformance>("analytics")
    return readOnlyResponse<SocialPostPerformance>("analytics", "zernio_error", [], {}, window.error, window.providerStatus)
  }
  const records = await attachCachedThumbnails(dedupeAnalytics(window.rows))
  const actualDates = analyticsActualDates(records)
  return readOnlyResponse("analytics", records.length > 0 ? "connected" : "no_data", records, {
    requestedRange: "custom",
    requestedFromDate: input.since,
    requestedToDate: input.until,
    actualFirstDate: actualDates.first,
    actualLastDate: actualDates.last,
    pagesFetched: window.pagesFetched,
    windowsFetched: 1,
    providerTotal: window.total,
    apiLimitations: ["Zernio /analytics accepts date ranges up to 366 days per request."],
  }, undefined, window.providerStatus)
}

/** Read-only post analytics for one explicitly selected organic platform. */
export async function getAnalyticsRangeForPlatform(input: { platform: ZernioAnalyticsPlatform; since: string; until: string }) {
  const window = await fetchAnalyticsWindow(input.platform, input.since, input.until)
  if (window.error && window.rows.length === 0) {
    if (window.connectionState === "missing_api_key") return missingKey<SocialPostPerformance>("analytics")
    return readOnlyResponse<SocialPostPerformance>("analytics", "zernio_error", [], {}, window.error, window.providerStatus)
  }
  // This function is only reached by an explicit Insights refresh. Cache
  // thumbnail bytes here so normal dashboard rendering never fetches media
  // from Zernio or a provider-hosted URL.
  const records = await attachCachedThumbnails(dedupeAnalytics(window.rows))
  const actualDates = analyticsActualDates(records)
  return readOnlyResponse("analytics", records.length > 0 ? "connected" : "no_data", records, {
    platform: input.platform,
    requestedRange: "custom",
    requestedFromDate: input.since,
    requestedToDate: input.until,
    actualFirstDate: actualDates.first,
    actualLastDate: actualDates.last,
    pagesFetched: window.pagesFetched,
    providerTotal: window.total,
    apiLimitations: ["Zernio /analytics is post-level data; aggregate figures are calculated from returned posts."],
  }, undefined, window.providerStatus)
}

export async function getAllAnalytics(range: SocialAnalyticsRange = "all") {
  const allRows: SocialPostPerformance[] = []
  let pagesFetched = 0
  let windowsFetched = 0
  let providerStatus: number | undefined
  let providerTotal: number | undefined
  let firstError: string | undefined
  let firstConnectionState: SocialConnectionState | undefined
  const requestedToDate = dateOnly(new Date())
  let requestedFromDate = ""

  if (range !== "all") {
    const windowRange = analyticsWindowForRange(range)
    requestedFromDate = windowRange.fromDate
    const window = await fetchAnalyticsWindow("instagram", windowRange.fromDate, windowRange.toDate)
    allRows.push(...window.rows)
    pagesFetched += window.pagesFetched
    windowsFetched += 1
    providerStatus = window.providerStatus
    providerTotal = window.total
    firstError = window.error
    firstConnectionState = window.connectionState
  } else {
    const today = new Date()
    let to = today
    let emptyWindows = 0
    const maxWindows = ZERNIO_ALL_HISTORY_YEAR_CAP + ZERNIO_ALL_HISTORY_EMPTY_WINDOW_CAP
    for (let windowIndex = 0; windowIndex < maxWindows; windowIndex += 1) {
      const from = addDays(to, -365)
      const fromDate = dateOnly(from)
      const toDate = dateOnly(to)
      requestedFromDate = fromDate
      const window = await fetchAnalyticsWindow("instagram", fromDate, toDate)
      allRows.push(...window.rows)
      pagesFetched += window.pagesFetched
      windowsFetched += 1
      providerStatus = window.providerStatus ?? providerStatus
      providerTotal = (providerTotal ?? 0) + (window.total ?? window.rows.length)
      if (window.error && !firstError) {
        firstError = window.error
        firstConnectionState = window.connectionState
      }
      if (window.rows.length === 0) emptyWindows += 1
      else emptyWindows = 0
      if (emptyWindows >= ZERNIO_ALL_HISTORY_EMPTY_WINDOW_CAP || window.error) break
      to = addDays(from, -1)
    }
  }

  if (firstError && allRows.length === 0) {
    if (firstConnectionState === "missing_api_key") return missingKey<SocialPostPerformance>("analytics")
    return readOnlyResponse<SocialPostPerformance>("analytics", "zernio_error", [], {}, firstError, providerStatus)
  }

  const records = await attachCachedThumbnails(dedupeAnalytics(allRows))
  const actualDates = analyticsActualDates(records)
  return readOnlyResponse("analytics", records.length > 0 ? "connected" : "no_data", records, {
    requestedRange: range,
    requestedFromDate,
    requestedToDate,
    actualFirstDate: actualDates.first,
    actualLastDate: actualDates.last,
    pagesFetched,
    windowsFetched,
    providerTotal,
    apiLimitations: [
      "Zernio /analytics defaults to recent data unless fromDate/toDate are provided.",
      "Zernio /analytics max range is 366 days per request; All available mode chunks backward with a safety cap.",
      "Social Operations filters Pinterest out because Pinterest is managed as inspiration, not publishing.",
    ],
  }, undefined, providerStatus)
}

async function fetchPostsPaginated(query: Record<string, QueryValue> = {}) {
  const rows: SocialPost[] = []
  let page = 1
  let pagesFetched = 0
  let providerStatus: number | undefined
  let error: string | undefined
  let connectionState: SocialConnectionState | undefined

  while (page <= ZERNIO_PAGINATION_SAFETY_CAP) {
    const result = await zernioFetch("/posts", { limit: 100, page, platform: "instagram", ...query })
    providerStatus = result.status
    if (!result.ok) {
      error = result.error
      connectionState = result.connectionState
      break
    }
    const payload = result.payload
    const posts = arrayFrom(payload, ["posts", "items", "results", "data"])
      .map(normalizePost)
      .filter(post => post.platform === "instagram")
    rows.push(...posts)
    pagesFetched += 1
    const meta = paginationMeta(payload)
    const pageCount = meta.pages || (posts.length < 100 ? page : page + 1)
    if (page >= pageCount || posts.length === 0) break
    page += 1
  }

  return { rows, pagesFetched, providerStatus, error, connectionState }
}

function normalizeInstagramStory(raw: unknown, accountId: string): InstagramStoryMedia {
  const record = isRecord(raw) ? raw : {}
  return {
    id: objectId(record._id) || objectId(record.id) || stringValue(record.storyId),
    accountId,
    platform: "instagram",
    mediaType: stringValue(record.mediaType) || stringValue(record.type) || null,
    mediaUrl: stringValue(record.mediaUrl) || stringValue(record.url) || null,
    thumbnailUrl: stringValue(record.thumbnailUrl) || stringValue(record.thumbnail) || null,
    permalink: stringValue(record.permalink) || stringValue(record.storyUrl) || null,
    publishedAt: stringValue(record.publishedAt) || stringValue(record.timestamp) || stringValue(record.createdAt) || null,
    expiresAt: stringValue(record.expiresAt) || null,
    source: "active_story",
  }
}

function normalizePinterestBoard(raw: unknown, accountId: string): PinterestBoard {
  const record = isRecord(raw) ? raw : {}
  return {
    id: objectId(record._id) || objectId(record.id),
    accountId,
    name: stringValue(record.name) || "Untitled Pinterest board",
    description: stringValue(record.description) || undefined,
    coverImageUrl: stringValue(record.coverImageUrl) || stringValue(record.imageUrl) || stringValue(record.thumbnailUrl) || undefined,
    pinCount: optionalNumber(record.pinCount),
    privacy: stringValue(record.privacy) || undefined,
    sourceUrl: stringValue(record.url) || stringValue(record.sourceUrl) || undefined,
  }
}

function virtualMoodboardsFromBoards(boards: PinterestBoard[]): PinterestMoodboard[] {
  const democlientdBoards = boards.filter(board => board.name.toLowerCase().startsWith("democlientd"))
  const sourceBoards = democlientdBoards.length > 0 ? democlientdBoards : boards
  if (sourceBoards.length === 0) return []
  return [{
    id: democlientdBoards.length > 0 ? "zernio-pinterest-democlientd" : "zernio-pinterest-all",
    name: democlientdBoards.length > 0 ? "DemoClientD Pinterest Moodboards" : "Pinterest Moodboards",
    source: "zernio",
    platform: "pinterest",
    boardIds: sourceBoards.map(board => board.id),
    coverImageUrl: sourceBoards.find(board => board.coverImageUrl)?.coverImageUrl,
    pinCount: sourceBoards.reduce((sum, board) => sum + (board.pinCount ?? 0), 0) || undefined,
    usage: "both",
    tags: democlientdBoards.length > 0 ? ["democlientd", "zernio", "inspiration_only"] : ["zernio", "inspiration_only"],
  }]
}

async function getAllProviderAccounts() {
  // Zernio requires pagination fields as a pair. Supplying only `limit` causes
  // a 400 before any account can be discovered or mapped.
  return zernioGet<ConnectedSocialAccount>("accounts", "/accounts", { page: 1, limit: 100 }, payload => ({
    data: arrayFrom(payload, ["accounts"]).map(normalizeAccount),
    summary: paginationSummary(payload),
  }))
}

export async function getProviderAccounts(options?: ZernioReadOptions) {
  const response = await getAllProviderAccounts()
  if (!hasClientScope(options)) return response
  const data = scopedAccounts(response.data, options)
  return {
    ...response,
    connectionState: data.length > 0 ? response.connectionState : response.connectionState === "connected" ? "no_data" as SocialConnectionState : response.connectionState,
    data,
    summary: {
      ...response.summary,
      clientScoped: true,
      sourceAccountCount: response.data.length,
      count: data.length,
    },
  }
}

export async function getAccounts(options?: ZernioReadOptions) {
  const response = await getProviderAccounts(options)
  // Meta Ads is a provider account type, not an organic publishing target.
  // Pinterest is handled separately as creative-inspiration input.
  const data = response.data.filter(account => account.platform !== "pinterest" && account.platform !== "metaads")
  return {
    ...response,
    connectionState: data.length > 0 ? response.connectionState : response.connectionState === "connected" ? "no_data" as SocialConnectionState : response.connectionState,
    data,
    summary: { ...response.summary, socialAccountCount: data.length },
  }
}

/** One authenticated, read-only Zernio account-health request. */
export async function getAccountHealth(accountId: string) {
  const safeAccountId = accountId.trim()
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(safeAccountId)) {
    return readOnlyResponse<ZernioAccountHealth>("account_health", "no_data", [], {}, "Invalid Zernio account ID.")
  }
  return zernioGet<ZernioAccountHealth>("account_health", `/accounts/${encodeURIComponent(safeAccountId)}/health`, {}, payload => ({
    data: [normalizeAccountHealth(payload)],
  }))
}

async function primaryInstagramAccount(options?: ZernioReadOptions) {
  const accounts = await getAccounts(options)
  return {
    response: accounts,
    account: accounts.data.find(account => account.platform === "instagram") ?? null,
  }
}

function insightMetric(payload: unknown, key: string) {
  if (!isRecord(payload) || !isRecord(payload.metrics)) return null
  const metric = payload.metrics[key]
  if (!isRecord(metric)) return null
  return nullableNumber(metric.total)
}

function insightPeriod(payload: unknown, fallbackSince: string, fallbackUntil: string): InstagramAccountInsight["current"] {
  const range = isRecord(payload) && isRecord(payload.dateRange) ? payload.dateRange : {}
  return {
    since: stringValue(range.since, fallbackSince),
    until: stringValue(range.until, fallbackUntil),
    views: insightMetric(payload, "views"),
    reach: insightMetric(payload, "reach"),
    accountsEngaged: insightMetric(payload, "accounts_engaged"),
    totalInteractions: insightMetric(payload, "total_interactions"),
    followsAndUnfollows: insightMetric(payload, "follows_and_unfollows"),
    profileLinkTaps: insightMetric(payload, "profile_links_taps"),
  }
}

function periodDelta(current: number | null | undefined, previous: number | null | undefined) {
  if (typeof current !== "number" || typeof previous !== "number" || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export async function getInstagramAccountInsights(options?: ZernioReadOptions) {
  const { response, account } = await primaryInstagramAccount(options)
  if (response.connectionState === "missing_api_key") return missingKey<InstagramAccountInsight>("instagram_insights")
  if (response.connectionState === "zernio_error") {
    return readOnlyResponse<InstagramAccountInsight>("instagram_insights", "zernio_error", [], {}, response.error ?? "Unable to load Instagram account before insights.", response.providerStatus)
  }
  if (!account) return readOnlyResponse<InstagramAccountInsight>("instagram_insights", "no_data", [], { reason: "No Instagram account connected." })

  const today = new Date()
  const currentUntil = dateOnly(today)
  const currentSince = dateOnly(addDays(today, -30))
  const previousUntil = currentSince
  const previousSince = dateOnly(addDays(today, -60))
  const metrics = "reach,views,accounts_engaged,total_interactions,follows_and_unfollows,profile_links_taps"

  const [currentResult, previousResult] = await Promise.all([
    zernioFetch("/analytics/instagram/account-insights", { accountId: account.id, metrics, since: currentSince, until: currentUntil }),
    zernioFetch("/analytics/instagram/account-insights", { accountId: account.id, metrics, since: previousSince, until: previousUntil }),
  ])

  if (!currentResult.ok) {
    return readOnlyResponse<InstagramAccountInsight>("instagram_insights", currentResult.connectionState ?? "zernio_error", [], {}, currentResult.error ?? "Unable to load Instagram insights.", currentResult.status)
  }

  const current = insightPeriod(currentResult.payload, currentSince, currentUntil)
  const previous = previousResult.ok
    ? insightPeriod(previousResult.payload, previousSince, previousUntil)
    : { since: previousSince, until: previousUntil }
  const dataDelay = isRecord(currentResult.payload) ? stringValue(currentResult.payload.dataDelay) || null : null

  const insight: InstagramAccountInsight = {
    accountId: account.id,
    platform: "instagram",
    current,
    previous,
    delta: {
      views: periodDelta(current.views, previous.views),
      reach: periodDelta(current.reach, previous.reach),
      accountsEngaged: periodDelta(current.accountsEngaged, previous.accountsEngaged),
      totalInteractions: periodDelta(current.totalInteractions, previous.totalInteractions),
      followsAndUnfollows: periodDelta(current.followsAndUnfollows, previous.followsAndUnfollows),
      profileLinkTaps: periodDelta(current.profileLinkTaps, previous.profileLinkTaps),
    },
    dataDelay,
  }

  return readOnlyResponse("instagram_insights", "connected", [insight], {
    accountUsername: account.username,
    requestedRange: "30d",
    previousRange: "previous_30d",
    dataDelay,
    apiLimitations: ["Zernio account insights are account-level Instagram metrics and may be delayed up to 48 hours."],
  }, undefined, currentResult.status)
}

const COUNTRY_LABELS: Record<string, string> = {
  AE: "United Arab Emirates",
  IN: "India",
  GB: "United Kingdom",
  SA: "Saudi Arabia",
  US: "United States",
  KW: "Kuwait",
  OM: "Oman",
  QA: "Qatar",
  BH: "Bahrain",
  FR: "France",
  IT: "Italy",
  DE: "Germany",
  RU: "Russia",
  PK: "Pakistan",
  LB: "Lebanon",
  EG: "Egypt",
  AU: "Australia",
  TR: "Turkey",
}
const INSTAGRAM_AGE_BUCKETS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"]

function demographicLabel(dimension: unknown, type: "city" | "country" | "age" | "gender") {
  const value = stringValue(dimension).trim()
  if (type === "country") return COUNTRY_LABELS[value.toUpperCase()] ?? value
  if (type === "age") return INSTAGRAM_AGE_BUCKETS.includes(value) ? value : ""
  if (type === "gender") {
    if (value.toUpperCase() === "M") return "Men"
    if (value.toUpperCase() === "F") return "Women"
    if (value.toUpperCase() === "U") return "Unknown"
    return "Unknown"
  }
  return value
}

function demographicRows(value: unknown, type: "city" | "country" | "age" | "gender", limit?: number): InstagramAudienceRow[] {
  const rows = Array.isArray(value)
    ? value.flatMap(item => {
      if (!isRecord(item)) return []
      const count = nullableNumber(item.value)
      const label = demographicLabel(item.dimension, type)
      return label && count !== null ? [{ label, count }] : []
    })
    : []
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (total <= 0) return []
  const withPercent = rows.map(row => ({ ...row, percent: (row.count / total) * 100 }))
  if (type === "age") {
    return withPercent
      .sort((a, b) => INSTAGRAM_AGE_BUCKETS.indexOf(a.label) - INSTAGRAM_AGE_BUCKETS.indexOf(b.label))
      .slice(0, limit ?? withPercent.length)
  }
  return withPercent.sort((a, b) => b.count - a.count).slice(0, limit ?? withPercent.length)
}

export async function getInstagramDemographics(options?: ZernioReadOptions) {
  const { response, account } = await primaryInstagramAccount(options)
  if (response.connectionState === "missing_api_key") return missingKey<InstagramDemographics>("instagram_demographics")
  if (response.connectionState === "zernio_error") {
    return readOnlyResponse<InstagramDemographics>("instagram_demographics", "zernio_error", [], {}, response.error ?? "Unable to load Instagram account before demographics.", response.providerStatus)
  }
  if (!account) return readOnlyResponse<InstagramDemographics>("instagram_demographics", "no_data", [], { reason: "No Instagram account connected." })

  const result = await zernioFetch("/analytics/instagram/demographics", {
    accountId: account.id,
    breakdown: "age,city,country,gender",
    timeframe: "this_month",
  })
  if (!result.ok) {
    return readOnlyResponse<InstagramDemographics>("instagram_demographics", result.connectionState ?? "zernio_error", [], {}, result.error ?? "Unable to load Instagram demographics.", result.status)
  }

  const demographics = isRecord(result.payload) && isRecord(result.payload.demographics) ? result.payload.demographics : {}
  const data: InstagramDemographics = {
    accountId: account.id,
    platform: "instagram",
    timeframe: isRecord(result.payload) ? stringValue(result.payload.timeframe, "this_month") : "this_month",
    topCities: demographicRows(demographics.city, "city", 5),
    topCountries: demographicRows(demographics.country, "country", 5),
    ageDistribution: demographicRows(demographics.age, "age"),
    genderDistribution: demographicRows(demographics.gender, "gender"),
    note: isRecord(result.payload) ? stringValue(result.payload.note) || null : null,
  }

  return readOnlyResponse("instagram_demographics", "connected", [data], {
    accountUsername: account.username,
    timeframe: data.timeframe,
    note: data.note,
    apiLimitations: ["Zernio demographics return top entries per dimension. Percentages are calculated from the returned live counts."],
  }, undefined, result.status)
}

function timeSeriesValues(payload: unknown, metric: string) {
  const metrics = isRecord(payload) && isRecord(payload.metrics) ? payload.metrics : {}
  const metricValue = isRecord(metrics[metric]) ? metrics[metric] : {}
  return Array.isArray(metricValue.values) ? metricValue.values : []
}

export async function getInstagramFollowerHistory(options?: ZernioReadOptions & { since?: string; until?: string }) {
  const { response, account } = await primaryInstagramAccount(options)
  if (response.connectionState === "missing_api_key") return missingKey<InstagramFollowerObservation>("instagram_follower_history")
  if (response.connectionState === "zernio_error") return readOnlyResponse<InstagramFollowerObservation>("instagram_follower_history", "zernio_error", [], {}, response.error ?? "Unable to load Instagram account before follower history.", response.providerStatus)
  if (!account) return readOnlyResponse<InstagramFollowerObservation>("instagram_follower_history", "no_data", [], { reason: "No Instagram account connected." })
  const result = await zernioFetch("/analytics/instagram/follower-history", { accountId: account.id, metrics: "follower_count,followers_gained,followers_lost", metricType: "time_series", since: options?.since, until: options?.until })
  if (!result.ok) return readOnlyResponse<InstagramFollowerObservation>("instagram_follower_history", result.connectionState ?? "zernio_error", [], {}, result.error ?? "Unable to load Instagram follower history.", result.status)
  const counts = new Map(timeSeriesValues(result.payload, "follower_count").flatMap(item => {
    if (!isRecord(item)) return []
    const date = stringValue(item.date); const followers = nullableNumber(item.value)
    return date && followers !== null ? [[date, followers] as const] : []
  }))
  const gained = new Map(timeSeriesValues(result.payload, "followers_gained").flatMap(item => isRecord(item) && stringValue(item.date) && nullableNumber(item.value) !== null ? [[stringValue(item.date), nullableNumber(item.value)!] as const] : []))
  const lost = new Map(timeSeriesValues(result.payload, "followers_lost").flatMap(item => isRecord(item) && stringValue(item.date) && nullableNumber(item.value) !== null ? [[stringValue(item.date), nullableNumber(item.value)!] as const] : []))
  const dataDelay = isRecord(result.payload) ? stringValue(result.payload.dataDelay) || null : null
  const data = [...counts.entries()].map(([date, followers]) => ({ accountId: account.id, platform: "instagram" as const, date, followers, followersGained: gained.get(date) ?? null, followersLost: lost.get(date) ?? null, dataDelay }))
  return readOnlyResponse("instagram_follower_history", "connected", data, { accountUsername: account.username, dataDelay, apiLimitations: ["Follower history is supplied by Zernio's daily snapshotter and may be up to 24 hours old."] }, undefined, result.status)
}

export async function getPostingFrequency(options?: { accountId?: string | null; platform?: "instagram" | "facebook" }) {
  const result = await zernioFetch("/analytics/posting-frequency", { accountId: options?.accountId ?? undefined, platform: options?.platform ?? undefined })
  if (!result.ok) {
    if (result.connectionState === "missing_api_key") return missingKey<PostingFrequencyObservation>("posting_frequency")
    return readOnlyResponse<PostingFrequencyObservation>("posting_frequency", "zernio_error", [], {}, result.error ?? "Unable to load posting frequency.", result.status)
  }
  const data = arrayFrom(result.payload, ["frequency"]).flatMap(item => {
    if (!isRecord(item)) return []
    const platform = stringValue(item.platform)
    const postsPerWeek = nullableNumber(item.posts_per_week)
    const weeksCount = nullableNumber(item.weeks_count)
    if ((platform !== "instagram" && platform !== "facebook") || postsPerWeek === null || weeksCount === null) return []
    return [{ platform, postsPerWeek, weeksCount, averageEngagementRate: nullableNumber(item.avg_engagement_rate), averageEngagement: nullableNumber(item.avg_engagement) } as PostingFrequencyObservation]
  })
  return readOnlyResponse("posting_frequency", "connected", data, { accountId: options?.accountId ?? null, apiLimitations: ["Provider-calculated historical correlation; it does not establish that cadence causes engagement."] }, undefined, result.status)
}

export function getPinterestAccounts() {
  return zernioGet<ConnectedSocialAccount>("pinterest", "/accounts", { limit: 100 }, payload => ({
    data: arrayFrom(payload, ["accounts"]).map(normalizeAccount).filter(account => account.platform === "pinterest"),
    summary: {
      ...paginationSummary(payload),
      purpose: "creative_inspiration_only",
      safety: "read_only_no_publishing",
    },
  }))
}

export async function getPinterestBoards() {
  const accounts = await getPinterestAccounts()
  if (accounts.connectionState === "missing_api_key") return missingKey<PinterestBoard>("pinterest")
  if (accounts.connectionState === "zernio_error") {
    return readOnlyResponse<PinterestBoard>("pinterest", "zernio_error", [], {}, accounts.error ?? "Unable to load Pinterest accounts.", accounts.providerStatus)
  }

  const boards: PinterestBoard[] = []
  const errors: string[] = []
  let providerStatus: number | undefined
  for (const account of accounts.data) {
    const result = await zernioFetch(`/accounts/${account.id}/pinterest-boards`)
    providerStatus = result.status ?? providerStatus
    if (!result.ok) {
      if (result.error) errors.push(result.error)
      continue
    }
    boards.push(...arrayFrom(result.payload, ["boards", "items", "results", "data"]).map(board => normalizePinterestBoard(board, account.id)))
  }

  return readOnlyResponse("pinterest", boards.length > 0 ? "connected" : errors.length > 0 ? "zernio_error" : "no_data", boards, {
    accountCount: accounts.data.length,
    boardCount: boards.length,
    groupSupport: "not_exposed",
    pinReadSupport: "not_exposed",
    pagesFetched: accounts.data.length > 0 ? accounts.data.length : 0,
    apiLimitations: [
      "Current Zernio OpenAPI exposes connected Pinterest accounts and /accounts/{accountId}/pinterest-boards.",
      "Pinterest board groups/collections are not exposed by the current Zernio OpenAPI.",
      "Pinterest board pins/media are not exposed by the current Zernio OpenAPI.",
      "Jarvis uses Pinterest as inspiration only; no publishing or scheduling endpoints are used.",
    ],
  }, errors[0], providerStatus)
}

export async function getPinterestGroups() {
  const boards = await getPinterestBoards()
  const moodboards = virtualMoodboardsFromBoards(boards.data)
  return readOnlyResponse("pinterest", moodboards.length > 0 ? "connected" : boards.connectionState, moodboards, {
    boardCount: boards.data.length,
    groupCount: moodboards.length,
    groupSupport: "virtual_only",
    virtualGroupRule: "Boards whose names start with DemoClientD are grouped as DemoClientD Pinterest Moodboards.",
    apiLimitations: [
      "Zernio does not expose Pinterest board groups/collections in the current OpenAPI.",
      "Jarvis creates a virtual DemoClientD Pinterest Moodboards group from board names.",
    ],
  }, boards.error, boards.providerStatus)
}

export async function getPinterestMoodboards() {
  const [accounts, boards, groups] = await Promise.all([
    getPinterestAccounts(),
    getPinterestBoards(),
    getPinterestGroups(),
  ])
  return {
    ok: accounts.ok || boards.ok || groups.ok,
    mode: "read_only" as const,
    integration: ZERNIO_INTEGRATION_STATUS,
    readOnly: true,
    connectionState: boards.connectionState,
    accounts: accounts.data,
    boards: boards.data,
    moodboards: groups.data,
    summary: {
      accountCount: accounts.data.length,
      boardCount: boards.data.length,
      groupCount: groups.data.length,
      pinCount: 0,
      pagesFetched: boards.summary.pagesFetched ?? 0,
      imageUrlsAvailable: boards.data.some(board => Boolean(board.coverImageUrl)),
      sourceUrlsAvailable: boards.data.some(board => Boolean(board.sourceUrl)),
      groupSupport: "virtual_only",
      pinReadSupport: "not_exposed",
      lastFetchTimestamp: new Date().toISOString(),
      apiLimitations: [
        "Pinterest pins/media and board groups are not exposed by the current Zernio OpenAPI.",
        "Moodboards are board-level inspiration references until Zernio exposes pin reads.",
        "Pinterest is inspiration only in Jarvis; no publishing, scheduling, creation, update, or deletion routes are exposed.",
      ],
    },
    error: boards.error || accounts.error || groups.error,
  }
}

export async function getPinterestBoardPins(boardId?: string | null) {
  return readOnlyResponse<PinterestPinRef>("pinterest", "no_data", [], {
    boardId: boardId ?? null,
    pinReadSupport: "not_exposed",
    apiLimitations: [
      "Current Zernio OpenAPI does not expose a Pinterest board pins read endpoint.",
      "Use board-level moodboards as inspiration until pin media reads are available.",
    ],
  })
}

export function getProfiles() {
  return zernioGet<SocialProfileContainer>("profile", "/profiles", {}, payload => ({
    data: arrayFrom(payload, ["profiles"]).map(normalizeProfile),
    summary: paginationSummary(payload),
  }))
}

export async function getAnalytics(range: SocialAnalyticsRange = "all", options?: ZernioReadOptions) {
  const response = await getAllAnalytics(range)
  if (!hasClientScope(options)) return response
  const accounts = await getAccounts(options)
  return filterResponseByClient(response, accounts.data, options)
}

export async function getPosts(query: Record<string, QueryValue> = {}, options?: ZernioReadOptions) {
  const response = await getPostsPaginated(query)
  if (!hasClientScope(options)) return response
  const accounts = await getAccounts(options)
  return filterResponseByClient(response, accounts.data, options)
}

export async function getPostsPaginated(query: Record<string, QueryValue> = {}) {
  const response = await fetchPostsPaginated(query)
  if (response.error && response.rows.length === 0) {
    if (response.connectionState === "missing_api_key") return missingKey<SocialPost>("posts")
    return readOnlyResponse<SocialPost>("posts", "zernio_error", [], {}, response.error, response.providerStatus)
  }
  return readOnlyResponse("posts", response.rows.length > 0 ? "connected" : "no_data", response.rows, {
    pagesFetched: response.pagesFetched,
    apiLimitations: ["Zernio /posts is paginated; Social Operations reads Instagram posts only in read-only mode."],
  }, undefined, response.providerStatus)
}

export function getAllPosts(query: Record<string, QueryValue> = {}) {
  return getPostsPaginated(query)
}

export async function getQueuePreview(profileId?: string | null) {
  let resolvedProfileId = profileId ?? null
  if (!resolvedProfileId) {
    const profiles = await getProfiles()
    resolvedProfileId = profiles.data[0]?.id ?? null
  }
  if (!resolvedProfileId) {
    return readOnlyResponse<Record<string, unknown>>("scheduled", "no_data", [], { queueAvailable: false }, undefined)
  }
  return zernioGet<Record<string, unknown>>("scheduled", "/queue/preview", { profileId: resolvedProfileId, count: 20 }, payload => ({
    data: arrayFrom(payload, ["slots"]).map(slot => ({ slot })),
    summary: paginationSummary(payload),
  }))
}

export async function getScheduledPosts(options?: ZernioReadOptions) {
  const scheduledPosts = await getPosts({ status: "scheduled" }, options)
  const queuePreview = await getQueuePreview()
  return {
    ...scheduledPosts,
    resource: "scheduled" as const,
    summary: {
      ...scheduledPosts.summary,
      queuePreview: queuePreview.data,
      queueConnectionState: queuePreview.connectionState,
      queueError: queuePreview.error,
    },
  }
}

export function getInbox() {
  return zernioGet<InboxConversation>("inbox", "/inbox/conversations", { limit: 25 }, payload => ({
    data: arrayFrom(payload, ["conversations"]).map(normalizeConversation),
    summary: paginationSummary(payload),
  }))
}

export function getComments() {
  return zernioGet<SocialComment>("comments", "/inbox/comments", { limit: 25 }, payload => ({
    data: arrayFrom(payload, ["comments"]).map(normalizeComment),
    summary: paginationSummary(payload),
  }))
}

export function getAutomations() {
  return zernioGet<AutomationRule>("automations", "/comment-automations", { limit: 25 }, payload => ({
    data: arrayFrom(payload, ["automations", "commentAutomations"]).map(normalizeAutomation),
    summary: paginationSummary(payload),
  }))
}

export async function getHighlights() {
  const accounts = await getAccounts()
  if (accounts.connectionState === "missing_api_key") return missingKey<InstagramStoryMedia>("highlights")
  if (accounts.connectionState === "zernio_error") {
    return readOnlyResponse<InstagramStoryMedia>("highlights", "zernio_error", [], {
      highlightAvailability: "unknown",
    }, accounts.error ?? "Unable to load Instagram accounts before story audit.", accounts.providerStatus)
  }

  const instagramAccounts = accounts.data.filter(account => account.platform === "instagram")
  const stories: InstagramStoryMedia[] = []
  let providerStatus: number | undefined
  const errors: string[] = []

  for (const account of instagramAccounts) {
    const result = await zernioFetch(`/accounts/${account.id}/instagram/stories`, { limit: 100 })
    providerStatus = result.status ?? providerStatus
    if (!result.ok) {
      if (result.error) errors.push(result.error)
      continue
    }
    const payload = result.payload
    stories.push(...arrayFrom(payload, ["stories", "items", "results", "data"]).map(story => normalizeInstagramStory(story, account.id)))
  }

  const connectionState: SocialConnectionState = stories.length > 0 ? "connected" : errors.length > 0 ? "zernio_error" : "no_data"
  return readOnlyResponse("highlights", connectionState, stories, {
    accountCount: instagramAccounts.length,
    activeStoriesReturned: stories.length,
    highlightAvailability: "not_exposed",
    storyAvailability: "active_24h_only",
    apiLimitations: [
      "Current Zernio OpenAPI exposes active Instagram stories via /accounts/{accountId}/instagram/stories.",
      "Instagram Highlights, highlight collections, and highlight cover media are not exposed in the current Zernio OpenAPI response.",
      "Manual screenshot-based highlight audit is required until a highlight endpoint exists.",
    ],
  }, errors[0], providerStatus)
}
