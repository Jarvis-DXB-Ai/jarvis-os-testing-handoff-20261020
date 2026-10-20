import assert from "node:assert/strict"
import {
  buildZernioSchedulePayload,
  evaluateSchedulingEligibility,
  executionStatusToJarvisStatus,
  scheduledDubaiInstant,
  zernioStatusToExecutionStatus,
  type CanonicalSocialMedia,
  type CanonicalSocialScheduleItem,
  type CanonicalSocialTarget,
  type ExplicitSocialProviderConnection,
} from "../src/lib/social-provider-execution"
import { allowsExecutionTransition } from "../src/lib/social-provider-execution-lifecycle"
import { createHmac } from "node:crypto"
import { verifyZernioWebhookSignature } from "../src/lib/social-provider-webhook"

const clientId = "8d771fc0-2914-57cc-90f1-9ab90f4611fd"
const seaClientId = "0071f19c-4881-5085-ad75-80334797afa4"
const caption = "A warm table, a quiet pause, and dinner exactly where it should be. 🍝"

const item: CanonicalSocialScheduleItem = {
  id: "content-1", clientId, contentKind: "feed", format: "feed", status: "Approved", finalCaption: caption,
  captionApprovedAt: "2026-08-26T12:00:00.000Z", scheduledDate: "2026-09-12", scheduledTime: "19:30",
  timezone: "Asia/Dubai", publishingPayloadVersion: 4, plannerSyncedAt: "2026-08-26T12:05:00.000Z", scheduledPayloadStale: false,
}
const media: CanonicalSocialMedia[] = [{ id: "media-1", storageBucket: "social-content", storagePath: "democlientb/final.jpg", contentSha256: "abc123", mimeType: "image/jpeg", sortOrder: 1 }]
const targets: CanonicalSocialTarget[] = [{ id: "target-ig", platform: "instagram", selected: true, status: "Approved" }]
const connections: ExplicitSocialProviderConnection[] = [
  { id: "connection-ig", clientId, provider: "zernio", providerConnectionId: "zernio-ig", platform: "instagram", platformAccountId: "account-ig", status: "connected" },
  { id: "connection-fb", clientId, provider: "zernio", providerConnectionId: "zernio-fb", platform: "facebook", platformAccountId: "account-fb", status: "connected" },
]

assert.deepEqual(evaluateSchedulingEligibility({ item, targets, media, connections }), { eligible: true, selectedPlatforms: ["instagram"] })
assert.equal(evaluateSchedulingEligibility({ item: { ...item, scheduledDate: "2026-08-01" }, targets, media, connections }).eligible, false, "Past schedules must be blocked")
assert.equal(evaluateSchedulingEligibility({ item, targets, media, connections: connections.map(connection => ({ ...connection, clientId: seaClientId })) }).eligible, false, "Restaurant must not inherit an On-the-Sea mapping")
assert.equal(evaluateSchedulingEligibility({ item: { ...item, status: "Ready for Review" }, targets, media, connections }).eligible, false, "Unapproved items must be blocked")
assert.equal(evaluateSchedulingEligibility({ item: { ...item, finalCaption: null }, targets, media, connections }).eligible, false, "Missing captions must be blocked")
assert.equal(evaluateSchedulingEligibility({ item, targets, media: [], connections }).eligible, false, "Missing media must be blocked")
assert.equal(evaluateSchedulingEligibility({ item, targets, media: [{ ...media[0], mimeType: "application/pdf" }], connections }).eligible, false, "Unsupported media must be blocked")
assert.equal(evaluateSchedulingEligibility({ item: { ...item, timezone: "UTC" }, targets, media, connections }).eligible, false, "Non-Dubai schedule must be blocked")

const payload = buildZernioSchedulePayload({ item, targets, media, connections, providerReadableMediaUrls: new Map([["media-1", "https://temporary-provider-read.example/final.jpg"]]) })
assert.equal(payload.content, caption, "Caption must retain exact bytes/string")
assert.deepEqual(payload.mediaItems, [{ type: "image", url: "https://temporary-provider-read.example/final.jpg" }], "Payload must use canonical final media only")
assert.equal(payload.scheduledFor, "2026-09-12T19:30:00")
assert.equal(payload.timezone, "Asia/Dubai")
assert.deepEqual(scheduledDubaiInstant("2026-09-12", "19:30", "Asia/Dubai"), { local: "2026-09-12T19:30:00", utc: "2026-09-12T15:30:00.000Z" })
assert.equal(zernioStatusToExecutionStatus("scheduled"), "scheduled")
assert.equal(zernioStatusToExecutionStatus("published"), "published")
assert.equal(zernioStatusToExecutionStatus("failed"), "failed")
assert.equal(executionStatusToJarvisStatus("scheduled"), "Scheduled")
assert.equal(executionStatusToJarvisStatus("published"), "Published")
assert.equal(executionStatusToJarvisStatus("failed"), "Failed")
assert.equal(executionStatusToJarvisStatus("cancelled"), "Cancelled")
assert.equal(executionStatusToJarvisStatus("recovery_required"), "Approved")
assert.equal(allowsExecutionTransition("requesting", "recovery_required"), true, "Timeout moves to recovery without resending")
assert.equal(allowsExecutionTransition("published", "scheduled"), false, "Out-of-order webhook cannot downgrade published")
assert.equal(allowsExecutionTransition("scheduled", "published"), true)
const webhookBody = JSON.stringify({ id: "event-1", event: "post.published" })
const webhookSignature = createHmac("sha256", "fixture-secret").update(webhookBody).digest("hex")
assert.equal(verifyZernioWebhookSignature(webhookBody, webhookSignature, "fixture-secret"), true, "Valid signed webhook must be accepted")
assert.equal(verifyZernioWebhookSignature(webhookBody, "not-a-signature", "fixture-secret"), false, "Invalid signed webhook must be rejected")

console.log("social provider execution fixtures: PASS (offline only; provider calls: 0)")
