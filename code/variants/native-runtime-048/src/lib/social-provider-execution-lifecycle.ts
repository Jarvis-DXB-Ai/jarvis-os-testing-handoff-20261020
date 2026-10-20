import type { SocialExecutionStatus } from "@/lib/social-provider-execution"

const rank: Record<SocialExecutionStatus, number> = { pending: 0, requesting: 1, recovery_required: 1, scheduled: 2, publishing: 3, published: 4, partial: 4, failed: 4, cancelled: 4 }

/** Provider events are at-least-once and may arrive out of order. */
export function allowsExecutionTransition(current: SocialExecutionStatus, next: SocialExecutionStatus) {
  if (current === next) return true
  if (["published", "partial", "failed", "cancelled"].includes(current)) return false
  return rank[next] >= rank[current]
}
