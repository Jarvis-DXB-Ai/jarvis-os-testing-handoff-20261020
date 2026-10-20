import "server-only"

import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { buildZernioSchedulePayload, evaluateSchedulingEligibility, executionStatusToJarvisStatus, scheduledDubaiInstant, zernioStatusToExecutionStatus, type CanonicalSocialMedia, type CanonicalSocialScheduleItem, type CanonicalSocialTarget, type ExplicitSocialProviderConnection, type SocialExecutionPlatform, type SocialExecutionStatus } from "@/lib/social-provider-execution"
import { getSocialProviderConnections } from "@/lib/social-provider-connections-server"
import { getZernioPostStatus, scheduleZernioPost } from "@/lib/zernio-server"

const BUCKET = "social-content"
type Row = Record<string, unknown>

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Server database credentials are not configured.")
  return createClient(url, key)
}

function stringValue(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback }
function nullableString(value: unknown) { return typeof value === "string" && value ? value : null }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {} }

/** Never persist raw provider payloads: they can echo one-hour signed media URLs. */
function payloadSummary(value: unknown, httpStatus: number | null = null) {
  const root = record(value)
  const post = record(root.post)
  const platforms = Array.isArray(post.platforms) ? post.platforms.map(value => {
    const platform = record(value)
    const account = record(platform.accountId)
    return { platform: stringValue(platform.platform) || null, accountId: stringValue(account._id) || stringValue(account.id) || stringValue(platform.accountId) || null, status: stringValue(platform.status) || null, scheduledFor: stringValue(platform.scheduledFor) || null, externalPostId: stringValue(platform._id) || stringValue(platform.id) || null }
  }) : []
  return {
    httpStatus,
    message: stringValue(root.message).slice(0, 240) || null,
    providerPostId: stringValue(post._id) || stringValue(post.id) || null,
    status: stringValue(post.status) || null,
    scheduledFor: stringValue(post.scheduledFor) || null,
    timezone: stringValue(post.timezone) || null,
    platforms,
  }
}

function healthPermitsPublishing(connection: { capabilities: Record<string, unknown>; providerMetadata: Record<string, unknown> }) {
  const capability = connection.capabilities
  const metadata = record(connection.providerMetadata.health)
  return capability.organicPublishing === true && metadata.status === "healthy" && metadata.token_valid === true
}

type CanonicalSnapshot = {
  item: CanonicalSocialScheduleItem
  media: CanonicalSocialMedia[]
  targets: CanonicalSocialTarget[]
  connections: ExplicitSocialProviderConnection[]
  targetRows: Row[]
  scheduled: { local: string; utc: string }
}

async function loadCanonicalSnapshot(clientId: string, itemId: string): Promise<CanonicalSnapshot> {
  const sb = serviceClient()
  const { data: itemData, error: itemError } = await sb.from("social_content_items")
    .select("id, client_id, content_kind, format, status, final_caption, caption_approved_at, scheduled_date, scheduled_time, publishing_payload_version, planner_synced_at, scheduled_payload_stale, social_content_months!inner(timezone)")
    .eq("id", itemId).eq("client_id", clientId).maybeSingle()
  if (itemError) throw new Error(itemError.message)
  if (!itemData) throw new Error("Planner item was not found for this client.")
  const row = itemData as unknown as Row
  const month = record(row.social_content_months)
  const item: CanonicalSocialScheduleItem = {
    id: stringValue(row.id), clientId: stringValue(row.client_id), contentKind: stringValue(row.content_kind), format: stringValue(row.format), status: stringValue(row.status),
    finalCaption: nullableString(row.final_caption), captionApprovedAt: nullableString(row.caption_approved_at), scheduledDate: nullableString(row.scheduled_date), scheduledTime: nullableString(row.scheduled_time)?.slice(0, 5) ?? null,
    timezone: stringValue(month.timezone), publishingPayloadVersion: Number(row.publishing_payload_version), plannerSyncedAt: nullableString(row.planner_synced_at), scheduledPayloadStale: Boolean(row.scheduled_payload_stale),
  }
  const [{ data: mediaData, error: mediaError }, { data: targetData, error: targetError }] = await Promise.all([
    sb.from("social_content_media").select("id, storage_bucket, storage_path, content_sha256, mime_type, sort_order").eq("client_id", clientId).eq("social_content_item_id", itemId).order("sort_order"),
    sb.from("social_content_platform_targets").select("id, platform, selected, status").eq("client_id", clientId).eq("social_content_item_id", itemId),
  ])
  if (mediaError) throw new Error(mediaError.message)
  if (targetError) throw new Error(targetError.message)
  const connectionSnapshot = await getSocialProviderConnections(clientId)
  const connections = connectionSnapshot.connections.map(connection => ({
    id: connection.id, clientId: connection.clientId, provider: "zernio" as const, providerConnectionId: connection.providerConnectionId,
    platform: connection.platform, platformAccountId: connection.platformAccountId, status: connection.status,
  }))
  const selectedPlatforms = new Set((targetData ?? []).filter(value => Boolean((value as Row).selected)).map(value => stringValue((value as Row).platform)))
  const healthFailures = connectionSnapshot.connections.filter(connection => selectedPlatforms.has(connection.platform)).filter(connection => !healthPermitsPublishing(connection))
  if (healthFailures.length) throw new Error(`Provider health does not permit publishing for: ${healthFailures.map(connection => connection.platform).join(", ")}.`)
  const media = (mediaData ?? []).map(value => { const m = value as Row; return { id: stringValue(m.id), storageBucket: stringValue(m.storage_bucket, BUCKET), storagePath: stringValue(m.storage_path), contentSha256: nullableString(m.content_sha256), mimeType: stringValue(m.mime_type), sortOrder: Number(m.sort_order) } })
  const targets = (targetData ?? []).map(value => { const target = value as Row; return { id: stringValue(target.id), platform: stringValue(target.platform), selected: Boolean(target.selected), status: stringValue(target.status) } })
  const scheduled = scheduledDubaiInstant(item.scheduledDate, item.scheduledTime, item.timezone)
  if (!scheduled) throw new Error("Planner scheduling timestamp is invalid.")
  const eligibility = evaluateSchedulingEligibility({ item, media, targets, connections })
  if (!eligibility.eligible) throw new Error(eligibility.reasons.join(" "))
  return { item, media, targets, connections, targetRows: (targetData ?? []) as Row[], scheduled }
}

export type ExecutionReservation = { executionId: string; reused: boolean; status: SocialExecutionStatus }
export type BatchPreflightItem = { itemId: string; title: string | null; format: string; scheduledForLocal: string | null; timezone: string | null; platforms: string[]; state: "ready" | "blocked"; reasons: string[] }

/** Creates a durable immutable execution record. It never contacts Zernio. */
export async function reserveSocialExecution(input: { clientId: string; itemId: string; idempotencyKey: string; platforms?: SocialExecutionPlatform[] }): Promise<ExecutionReservation> {
  if (!isUuid(input.clientId) || !isUuid(input.itemId) || !isUuid(input.idempotencyKey)) throw new Error("Client, item, and idempotency key must be UUIDs.")
  const snapshot = await loadCanonicalSnapshot(input.clientId, input.itemId)
  const sb = serviceClient()
  const requestedPlatforms = input.platforms?.length ? [...new Set(input.platforms)] : snapshot.targets.filter(target => target.selected).map(target => target.platform as SocialExecutionPlatform)
  const selectedTargets = snapshot.targets.filter(target => target.selected && requestedPlatforms.includes(target.platform as SocialExecutionPlatform))
  if (selectedTargets.length !== requestedPlatforms.length || selectedTargets.some(target => target.platform !== "instagram" && target.platform !== "facebook")) throw new Error("Requested execution platforms are not approved canonical targets for this Planner item.")
  const mediaSnapshot = snapshot.media.map(media => ({ id: media.id, storageBucket: media.storageBucket, storagePath: media.storagePath, contentSha256: media.contentSha256, mimeType: media.mimeType, sortOrder: media.sortOrder }))
  const targetSnapshot = selectedTargets.map(target => {
    const connection = snapshot.connections.find(candidate => candidate.platform === target.platform && candidate.status === "connected")
    return { targetId: target.id, platform: target.platform, providerConnectionId: connection?.id ?? null, zernioConnectionId: connection?.providerConnectionId ?? null, providerAccountId: connection?.platformAccountId ?? null, contentFormat: snapshot.item.format }
  })
  const payload = {
    client_id: input.clientId, social_content_item_id: input.itemId, provider: "zernio", idempotency_key: input.idempotencyKey,
    provider_request_id: input.idempotencyKey, publishing_payload_version: snapshot.item.publishingPayloadVersion, status: "pending",
    scheduled_for_local: snapshot.scheduled.local, scheduled_for_utc: snapshot.scheduled.utc, timezone: snapshot.item.timezone,
    final_caption_snapshot: snapshot.item.finalCaption!, media_snapshot: mediaSnapshot, target_snapshot: targetSnapshot,
  }
  const { data, error } = await sb.from("social_provider_executions").insert(payload).select("id, status").single()
  if (error?.code === "23505") {
    const { data: sameKey, error: sameKeyError } = await sb.from("social_provider_executions").select("id, status").eq("client_id", input.clientId).eq("idempotency_key", input.idempotencyKey).maybeSingle()
    if (sameKeyError) throw new Error(sameKeyError.message)
    const { data: sameLogicalDispatch, error: logicalError } = sameKey ? { data: null, error: null } : await sb.from("social_provider_executions").select("id, status").eq("client_id", input.clientId).eq("social_content_item_id", input.itemId).eq("provider", "zernio").eq("publishing_payload_version", snapshot.item.publishingPayloadVersion).maybeSingle()
    if (logicalError || (!sameKey && !sameLogicalDispatch)) throw new Error(logicalError?.message ?? "A duplicate execution reservation could not be resolved.")
    const existing = sameKey ?? sameLogicalDispatch
    if (!existing) throw new Error("A duplicate execution reservation could not be resolved.")
    return { executionId: stringValue(existing.id), reused: true, status: stringValue(existing.status) as SocialExecutionStatus }
  }
  if (error || !data) throw new Error(error?.message ?? "Unable to reserve provider execution.")
  const executionId = stringValue(data.id)
  const targetInsert = targetSnapshot.map(target => ({ social_provider_execution_id: executionId, social_content_platform_target_id: target.targetId, client_id: input.clientId, provider_connection_id: target.providerConnectionId, platform: target.platform, provider_account_id: target.providerAccountId, status: "pending" }))
  const { error: targetError } = await sb.from("social_provider_execution_targets").insert(targetInsert)
  if (targetError) {
    await sb.from("social_provider_executions").update({ status: "failed", failure_diagnostic: "Execution target reservation failed before provider dispatch." }).eq("id", executionId).eq("status", "pending")
    throw new Error("Unable to reserve mapped provider targets.")
  }
  return { executionId, reused: false, status: "pending" }
}

/** Read-only, per-item fail-closed batch preflight. It never reserves or calls Zernio. */
export async function preflightSocialExecutionBatch(input: { clientId: string; monthStart: string }) {
  const sb = serviceClient()
  const { data: month, error: monthError } = await sb.from("social_content_months").select("id").eq("client_id", input.clientId).eq("month_start", input.monthStart).maybeSingle()
  if (monthError) throw new Error(monthError.message)
  if (!month) throw new Error("Publishing month was not found for this client.")
  const { data: itemRows, error: itemError } = await sb.from("social_content_items").select("id,title,format").eq("client_id", input.clientId).eq("social_content_month_id", month.id).not("planner_synced_at", "is", null).order("scheduled_date").order("scheduled_time")
  if (itemError) throw new Error(itemError.message)
  const items: BatchPreflightItem[] = []
  for (const raw of itemRows ?? []) {
    const row = raw as Row
    const itemId = stringValue(row.id)
    const reasons: string[] = []
    let snapshot: CanonicalSnapshot | null = null
    try { snapshot = await loadCanonicalSnapshot(input.clientId, itemId) } catch (error) { reasons.push(error instanceof Error ? error.message : "Eligibility could not be verified.") }
    const { data: existing, error: existingError } = await sb.from("social_provider_executions").select("id,status").eq("client_id", input.clientId).eq("social_content_item_id", itemId).eq("provider", "zernio").limit(1)
    if (existingError) throw new Error(existingError.message)
    if ((existing ?? []).length) reasons.push(`Existing execution: ${stringValue((existing ?? [])[0]?.status)}.`)
    items.push({ itemId, title: nullableString(row.title), format: stringValue(row.format), scheduledForLocal: snapshot?.scheduled.local ?? null, timezone: snapshot?.item.timezone ?? null, platforms: snapshot?.targets.filter(target => target.selected).map(target => target.platform) ?? [], state: reasons.length ? "blocked" : "ready", reasons })
  }
  return { monthStart: input.monthStart, items, ready: items.filter(item => item.state === "ready"), blocked: items.filter(item => item.state === "blocked") }
}

/** Deliberate batch action: reserve and dispatch independent item executions. */
export async function dispatchAuthorizedSocialExecutionBatch(input: { clientId: string; itemIds: string[]; authorization: string }) {
  if (process.env.SOCIAL_PUBLISHING_MODE !== "live") throw new Error("Live Social scheduling is disabled. No Zernio request was sent.")
  const ids = [...new Set(input.itemIds.filter(isUuid))]
  if (!ids.length || input.authorization !== `Schedule ${ids.length} Approved Posts`) throw new Error("Explicit batch authorization did not match the selected posts.")
  const results: Array<{ itemId: string; executionId?: string; status: string; error?: string }> = []
  for (const itemId of ids) {
    try {
      const reservation = await reserveSocialExecution({ clientId: input.clientId, itemId, idempotencyKey: randomUUID() })
      const dispatched = await dispatchReservedSocialExecution({ clientId: input.clientId, executionId: reservation.executionId })
      results.push({ itemId, executionId: reservation.executionId, status: dispatched.status, ...(dispatched.error ? { error: dispatched.error } : {}) })
    } catch (error) { results.push({ itemId, status: "blocked", error: error instanceof Error ? error.message : "Batch item failed safely." }) }
  }
  return results
}

async function providerReadableUrls(media: CanonicalSocialMedia[]) {
  const sb = serviceClient()
  const urls = new Map<string, string>()
  for (const asset of media) {
    const { data, error } = await sb.storage.from(asset.storageBucket || BUCKET).createSignedUrl(asset.storagePath, 60 * 60)
    if (error || !data?.signedUrl) throw new Error(`Provider-readable media URL could not be created for ${asset.id}.`)
    urls.set(asset.id, data.signedUrl)
  }
  return urls
}

function isTerminal(status: string) { return ["scheduled", "publishing", "published", "partial", "failed", "cancelled"].includes(status) }

/**
 * The actual Zernio write. The default global dry-run guard remains absolute;
 * the only narrow exception is a server-only Phase 3 authorization that has
 * already bound this exact execution to an approved immutable manifest.
 */
export async function dispatchReservedSocialExecution(input: { clientId: string; executionId: string; allowOneTimeLiveAuthorization?: boolean }) {
  if (process.env.SOCIAL_PUBLISHING_MODE !== "live" && !input.allowOneTimeLiveAuthorization) {
    throw new Error("Live Social scheduling is disabled. No Zernio request was sent.")
  }
  const sb = serviceClient()
  const { data: executionData, error } = await sb.from("social_provider_executions").select("*").eq("id", input.executionId).eq("client_id", input.clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!executionData) throw new Error("Execution was not found for this client.")
  const execution = executionData as Row
  const current = stringValue(execution.status)
  if (isTerminal(current) || current === "recovery_required") return { executionId: input.executionId, dispatched: false, status: current, reason: "Execution must not be dispatched again." }
  const { data: claimed, error: claimError } = await sb.from("social_provider_executions").update({ status: "requesting", requested_at: new Date().toISOString(), dispatch_attempt_count: Number(execution.dispatch_attempt_count ?? 0) + 1 }).eq("id", input.executionId).eq("status", "pending").select("id").maybeSingle()
  if (claimError) throw new Error(claimError.message)
  if (!claimed) return { executionId: input.executionId, dispatched: false, status: "requesting", reason: "Another request already owns this execution." }
  const snapshot = await loadCanonicalSnapshot(input.clientId, stringValue(execution.social_content_item_id))
  if (snapshot.item.publishingPayloadVersion !== Number(execution.publishing_payload_version)) {
    await sb.from("social_provider_executions").update({ status: "failed", failure_diagnostic: "Planner payload changed after reservation; a new approved execution is required." }).eq("id", input.executionId)
    return { executionId: input.executionId, dispatched: false, status: "failed", reason: "Planner payload changed after reservation." }
  }
  const reservedMedia = Array.isArray(execution.media_snapshot) ? execution.media_snapshot.map(value => {
    const media = record(value)
    return { id: stringValue(media.id), storageBucket: stringValue(media.storageBucket, BUCKET), storagePath: stringValue(media.storagePath), contentSha256: nullableString(media.contentSha256), mimeType: stringValue(media.mimeType), sortOrder: Number(media.sortOrder) }
  }) : []
  const reservedTargets = Array.isArray(execution.target_snapshot) ? execution.target_snapshot.map(value => {
    const target = record(value)
    return { id: stringValue(target.targetId), platform: stringValue(target.platform), selected: true, status: "Approved" }
  }) : []
  const reservedConnections = Array.isArray(execution.target_snapshot) ? execution.target_snapshot.map(value => {
    const target = record(value)
    return { id: stringValue(target.providerConnectionId), clientId: input.clientId, provider: "zernio" as const, providerConnectionId: nullableString(target.zernioConnectionId), platform: stringValue(target.platform), platformAccountId: nullableString(target.providerAccountId), status: "connected" }
  }) : []
  const scheduledLocal = stringValue(execution.scheduled_for_local)
  const reservedItem: CanonicalSocialScheduleItem = {
    ...snapshot.item,
    finalCaption: nullableString(execution.final_caption_snapshot),
    scheduledDate: scheduledLocal.slice(0, 10),
    scheduledTime: scheduledLocal.slice(11, 16),
    timezone: stringValue(execution.timezone),
  }
  const reservedEligibility = evaluateSchedulingEligibility({ item: reservedItem, targets: reservedTargets, media: reservedMedia, connections: reservedConnections })
  if (!reservedEligibility.eligible) {
    await sb.from("social_provider_executions").update({ status: "failed", failure_diagnostic: `Reserved execution is incomplete: ${reservedEligibility.reasons.join(" ")}` }).eq("id", input.executionId)
    return { executionId: input.executionId, dispatched: false, status: "failed", reason: "Reserved execution is incomplete." }
  }
  const payload = buildZernioSchedulePayload({ item: reservedItem, targets: reservedTargets, media: reservedMedia, connections: reservedConnections, providerReadableMediaUrls: await providerReadableUrls(reservedMedia) })
  const result = await scheduleZernioPost(payload, stringValue(execution.provider_request_id) || stringValue(execution.idempotency_key))
  const status = result.ok ? zernioStatusToExecutionStatus(result.providerStatus) : result.ambiguous ? "recovery_required" : "failed"
  await sb.from("social_provider_executions").update({ status, provider_post_id: result.providerPostId, raw_provider_status: result.providerStatus, provider_response_summary: payloadSummary(result.payload, result.status), failure_diagnostic: result.error, confirmed_at: result.ok ? new Date().toISOString() : null }).eq("id", input.executionId)
  if (result.ok) {
    await sb.from("social_provider_execution_targets").update({ status, raw_provider_status: result.providerStatus, external_post_id: result.providerPostId, provider_response_summary: payloadSummary(result.payload, result.status) }).eq("social_provider_execution_id", input.executionId)
    await sb.from("social_content_items").update({ status: executionStatusToJarvisStatus(status) }).eq("id", snapshot.item.id).eq("publishing_payload_version", snapshot.item.publishingPayloadVersion)
  }
  return { executionId: input.executionId, dispatched: true, status, providerPostId: result.providerPostId, providerStatus: result.providerStatus, error: result.error }
}

/** Recovery is a single narrow GET for a known provider post. It never resends. */
export async function recoverSocialExecution(input: { clientId: string; executionId: string }) {
  const sb = serviceClient()
  const { data, error } = await sb.from("social_provider_executions").select("*").eq("id", input.executionId).eq("client_id", input.clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Execution was not found for this client.")
  const execution = data as Row
  if (stringValue(execution.status) !== "recovery_required") throw new Error("Recovery is only permitted for an uncertain execution.")
  const providerPostId = nullableString(execution.provider_post_id)
  if (!providerPostId) throw new Error("Recovery cannot poll without a provider post ID; await a signed webhook or resolve manually.")
  const result = await getZernioPostStatus(providerPostId)
  const status = result.ok ? zernioStatusToExecutionStatus(result.providerStatus) : "recovery_required"
  await sb.from("social_provider_executions").update({ status, raw_provider_status: result.providerStatus, provider_response_summary: payloadSummary(result.payload, result.status), failure_diagnostic: result.error, recovery_poll_count: Number(execution.recovery_poll_count ?? 0) + 1, last_recovery_polled_at: new Date().toISOString(), confirmed_at: result.ok ? new Date().toISOString() : null }).eq("id", input.executionId)
  return { executionId: input.executionId, status, providerPostId, error: result.error }
}
