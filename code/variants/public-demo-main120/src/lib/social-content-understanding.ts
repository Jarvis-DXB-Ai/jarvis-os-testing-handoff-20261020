import type { CaptionContext, SocialContentContext, SocialContentContextLayer } from "@/lib/social-publishing-content-context"

export type UnderstandingConfidence = "high" | "review" | "unknown"
export type UnderstandingStatus = "pending" | "fixture" | "analyzed" | "needs_review" | "confirmed" | "corrected" | "unknown"

export type SocialContentUnderstanding = {
  id: string
  status: UnderstandingStatus
  confidence: UnderstandingConfidence
  inferredContext: Record<string, unknown>
  matchCandidates: Array<{ assetId: string; label: string; category: string; confidence: UnderstandingConfidence }>
  requiresConfirmation: string[]
  provider: string | null
  model: string | null
  cached: boolean
}

export function captionReadiness(context: CaptionContext, inferred: SocialContentContextLayer = {}) {
  if (context.verifiedFacts.length) return { ready: true, reason: null, mode: "factual" as const }
  const hasSafeVisualStory = Boolean(
    inferred.primarySubject ||
    inferred.supportingFood?.length ||
    inferred.supportingDrink?.length ||
    (inferred.anonymousPeople && (inferred.archetype || inferred.factualDescriptors?.length)) ||
    (inferred.archetype && inferred.factualDescriptors?.length),
  )
  if (hasSafeVisualStory) return { ready: true, reason: null, mode: "safe_visual_story" as const }
  return { ready: false, reason: "Caption context required. Confirm the post subject before generating new captions, or use a cached visual story with a clear broad category." , mode: "missing" as const }
}

export function offlineUnderstandingFixture(context: SocialContentContext) {
  const hasLineage = Boolean(context.lineage.monthlyPlanItemId || context.lineage.individualProductionArtifactId || context.lineage.aiContentGenerationId || context.lineage.clientBrainAssetIds?.length)
  return {
    status: hasLineage ? "fixture" as const : "unknown" as const,
    confidence: hasLineage ? "review" as const : "unknown" as const,
    inferredContext: hasLineage ? { source: "known_lineage_only", note: "No visual provider call was made." } : { source: "offline_fixture", note: "No image observations are fabricated in offline mode." },
    matchCandidates: [],
    requiresConfirmation: hasLineage ? [] : ["Run one explicit vision analysis or confirm a broad post context before a caption can name products, venue zones, staff, activations, or service details."],
  }
}
