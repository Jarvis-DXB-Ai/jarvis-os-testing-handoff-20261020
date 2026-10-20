import "server-only"

import { createClient } from "@supabase/supabase-js"
import { executionStatusToJarvisStatus, zernioStatusToExecutionStatus, type SocialExecutionStatus } from "@/lib/social-provider-execution"
import { allowsExecutionTransition } from "@/lib/social-provider-execution-lifecycle"
import { verifyZernioWebhookSignature as verifySignature } from "@/lib/social-provider-webhook"

type Row = Record<string, unknown>
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {} }
function text(value: unknown) { return typeof value === "string" ? value : "" }
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Server database credentials are not configured.")
  return createClient(url, key)
}

export function verifyZernioWebhookSignature(rawBody: string, supplied: string | null, secret = process.env.ZERNIO_WEBHOOK_SECRET) {
  return verifySignature(rawBody, supplied, secret)
}

function providerPostId(payload: Row) {
  const data = record(payload.data)
  const post = record(payload.post)
  const dataPost = record(data.post)
  return text(post._id) || text(post.id) || text(dataPost._id) || text(dataPost.id) || text(payload.postId) || text(data.postId) || null
}

function eventStatus(eventType: string, payload: Row): SocialExecutionStatus | null {
  const candidate = text(record(payload.post).status) || text(record(record(payload.data).post).status)
  const normalized = candidate || eventType.replace(/^post[._:]/, "")
  const status = zernioStatusToExecutionStatus(normalized)
  return status === "pending" ? null : status
}

function safePayload(payload: Row) {
  const post = record(payload.post)
  const dataPost = record(record(payload.data).post)
  return { id: text(payload.id) || null, postId: text(post._id) || text(post.id) || text(dataPost._id) || text(dataPost.id) || null, status: text(post.status) || text(dataPost.status) || null }
}

function providerPublishedAt(payload: Row) {
  const post = record(payload.post)
  const dataPost = record(record(payload.data).post)
  const candidate = text(post.publishedAt) || text(post.published_at) || text(dataPost.publishedAt) || text(dataPost.published_at)
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null
}

/** Stores every valid delivery before it changes an execution. No payload client ID is trusted. */
export async function processZernioWebhook(input: { eventId: string; eventType: string; payload: Row }) {
  const sb = serviceClient()
  const postId = providerPostId(input.payload)
  const { data: event, error: insertError } = await sb.from("social_provider_webhook_events").insert({ provider: "zernio", provider_event_id: input.eventId, event_type: input.eventType, payload_summary: safePayload(input.payload) }).select("id").single()
  if (insertError?.code === "23505") return { duplicate: true, matched: false, status: null }
  if (insertError || !event) throw new Error(insertError?.message ?? "Unable to store signed webhook event.")
  if (!postId) {
    await sb.from("social_provider_webhook_events").update({ processing_error: "Webhook had no provider post identity." }).eq("id", event.id)
    return { duplicate: false, matched: false, status: null }
  }
  const { data: executionData, error: executionError } = await sb.from("social_provider_executions").select("*").eq("provider", "zernio").eq("provider_post_id", postId).maybeSingle()
  if (executionError) throw new Error(executionError.message)
  if (!executionData) {
    await sb.from("social_provider_webhook_events").update({ processing_error: "No local execution matched the provider post identity." }).eq("id", event.id)
    return { duplicate: false, matched: false, status: null }
  }
  const execution = executionData as Row
  const next = eventStatus(input.eventType, input.payload)
  const current = text(execution.status) as SocialExecutionStatus
  if (!next || !allowsExecutionTransition(current, next)) {
    await sb.from("social_provider_webhook_events").update({ social_provider_execution_id: execution.id, processed_at: new Date().toISOString(), processing_error: next ? `Ignored non-monotonic ${current} -> ${next} transition.` : "Webhook status was not recognized." }).eq("id", event.id)
    return { duplicate: false, matched: true, status: current }
  }
  const now = new Date().toISOString()
  await sb.from("social_provider_executions").update({ status: next, raw_provider_status: text(record(input.payload.post).status) || text(record(record(input.payload.data).post).status) || input.eventType, confirmed_at: now, failure_diagnostic: next === "failed" ? "Zernio reported a failed provider execution." : null }).eq("id", execution.id)
  const publishedAt = next === "published" ? providerPublishedAt(input.payload) : null
  await sb.from("social_provider_execution_targets").update({
    status: next,
    raw_provider_status: input.eventType,
    external_post_id: postId,
    ...(next === "published" ? {
      published_at: publishedAt,
      publication_evidence: {
        source: "zernio_webhook",
        provider_event_id: input.eventId,
        provider_post_id: postId,
        provider_published_at: publishedAt,
        observed_at: now,
      },
    } : {}),
  }).eq("social_provider_execution_id", execution.id)
  await sb.from("social_provider_webhook_events").update({ social_provider_execution_id: execution.id, processed_at: now }).eq("id", event.id)
  // The provider ledger remains authoritative; this only reflects its monotonic status in Planner.
  await sb.from("social_content_items").update({ status: executionStatusToJarvisStatus(next) }).eq("id", execution.social_content_item_id).eq("publishing_payload_version", execution.publishing_payload_version)
  return { duplicate: false, matched: true, status: next }
}
