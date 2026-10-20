import assert from "node:assert/strict"
// @ts-expect-error -- Node fixture runner needs an explicit TypeScript extension.
import { plannerReadiness, type SocialContentItem } from "../src/lib/social-publishing.ts"

function fixture(overrides: Partial<SocialContentItem> = {}): SocialContentItem {
  return {
    id: "fixture", source: "manual_upload", contentKind: "feed", format: "feed", title: "Fixture", scheduleLabel: null, notes: null, sequence: 1,
    status: "Approved", scheduledDate: "2026-09-01", scheduledTime: "11:00", scheduledAt: "2026-09-01T07:00:00.000Z", dateLocked: false,
    timeSelectionSource: "client_default", timeRecommendation: {}, storyScheduleSlotId: null, selectedCaptionOptionId: null, finalCaption: "A final caption.",
    captionSelectedAt: null, captionEditedAt: null, captionApprovedAt: "2026-08-25T00:00:00.000Z", publishingPayloadVersion: 1, scheduledPayloadVersion: null,
    scheduledPayloadStale: false, plannerSyncedPayloadVersion: null, plannerSyncedAt: null, contentContext: { verified: {}, inferred: {}, confirmed: {}, lineage: {} }, contentUnderstanding: null,
    media: [{ id: "media", fileName: "fixture.jpg", mimeType: "image/jpeg", byteSize: 1, width: 1, height: 1, durationSeconds: null, sortOrder: 1, cropX: 50, cropY: 50, signedUrl: null }],
    captionOptions: [], activeCaptionGeneration: null,
    platformTargets: [{ id: "target", platform: "instagram", selected: true, status: "Approved" }],
    ...overrides,
    providerExecution: overrides.providerExecution ?? null,
  }
}

assert.deepEqual(plannerReadiness(fixture()), { state: "ready", reasons: [] })
assert.equal(plannerReadiness(fixture({ finalCaption: null, captionApprovedAt: null })).state, "needs_attention")
assert.deepEqual(plannerReadiness(fixture({ finalCaption: null, captionApprovedAt: null })).reasons, ["Final caption missing", "Caption needs approval"])
assert.deepEqual(plannerReadiness(fixture({ scheduledPayloadStale: true })).reasons, ["Updated in Publishing"])
assert.equal(plannerReadiness(fixture({ contentKind: "story", finalCaption: null, captionApprovedAt: null })).state, "ready")
console.log("social planner V1 fixtures: PASS")
