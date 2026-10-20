export const HOME_TASK_STATUSES = ["not_started", "in_progress", "completed", "reviewed", "archived"] as const
export const HOME_TASK_PRIORITIES = ["p1", "p2", "p3"] as const

export type HomeTaskStatus = (typeof HOME_TASK_STATUSES)[number]
export type HomeTaskPriority = (typeof HOME_TASK_PRIORITIES)[number]
export type HomeTaskOrigin = "manual" | "suggested"

export type HomeTask = {
  id: string
  title: string
  description: string | null
  status: HomeTaskStatus
  priority: HomeTaskPriority
  due_at: string | null
  completed_at: string | null
  reviewed_at: string | null
  archived_at: string | null
  client_id: string | null
  client_name: string | null
  linked_object_type: string | null
  linked_object_id: string | null
  origin: HomeTaskOrigin
  source: Record<string, unknown>
  evidence: Record<string, unknown>
  source_evidence_hash: string | null
  dedupe_identity: string | null
  manual_order: number
  created_at: string
  updated_at: string
}

export type HomeSuggestion = {
  id: string
  title: string
  detail: string
  priority: HomeTaskPriority
  dedupeIdentity: string
  evidenceHash: string
  clientId: string | null
  clientName: string | null
  href: string
  linkedObject: { type: string; id: string } | null
  source: Record<string, unknown>
  evidence: Record<string, unknown>
}

export type HomeClient = {
  id: string
  name: string
  industry: string | null
  attentionCount: number
  latestSignal: string | null
  href: string
  logoUrl: string | null
  revenueAed: number | null
  revenueEur: number | null
  revenueShare: number | null
  openTaskCount: number
  status: "active" | "onboarding" | "inactive"
  approvalsCount: number
  adjustmentsCount: number
  workRequiredCount: number
  social: {
    /** Instagram is the headline account. Facebook is reported beside it, never summed in. */
    followers: number | null
    reach30d: number | null
    engagements: number | null
    facebookFollowers: number | null
    facebookReach30d: number | null
    /** A delta is a percentage or an absolute change; the mode says which, so the unit is not guessed. */
    followerDelta: number | null
    followerDeltaMode: SocialDeltaMode
    reachDelta: number | null
    reachDeltaMode: SocialDeltaMode
    engagementDelta: number | null
    engagementDeltaMode: SocialDeltaMode
    reachSeries: number[] | null
  }
}

export type SocialDeltaMode = "percent" | "absolute" | "none"

export type HomeNotificationKind = "approval" | "adjustment" | "system" | "finance"

export type HomeNotification = {
  id: string
  sourceKey: string
  title: string
  meta: string
  kind: HomeNotificationKind
  href: string
  clientName: string | null
  clientId: string | null
  clientLogoUrl: string | null
  isUnread: boolean
  occurredAt: string
}

export type HomeDashboardData = {
  generatedAt: string
  greeting: string
  dateLabel: string
  tasks: HomeTask[]
  suggestions: HomeSuggestion[]
  clients: HomeClient[]
  money: {
    currency: "AED"
    month: string
    revenueEur: number | null
    expensesEur: number | null
    profitEur: number | null
    previous: {
      month: string
      revenueEur: number | null
      expensesEur: number | null
      profitEur: number | null
    } | null
    history: Array<{ month: string; revenueEur: number | null; isProjected: boolean }>
    projection: {
      committedEur: number
      pipelineEur: number
      // Pipeline weighted by each row's probability. Null when any contributing
      // row has no probability, in which case only the raw total is honest.
      weightedPipelineEur: number | null
      confidencePct: number | null
    } | null
    // Furthest month the switcher may reach. Equals the current month when no
    // future month has a real two-sided projection.
    forecastHorizonMonth: string
    expectedAed: number
    collectedAed: number
    availableOwnerDrawAed: number
    committedAed: number
    nextCharge: { label: string; amountAed: number | null; date: string | null } | null
    unresolvedCount: number
    unresolvedLabel: string | null
    costSegments: Array<{ category: string; amountAed: number; percentage: number }>
    transactions: Array<{
      id: string
      direction: "in" | "out"
      name: string
      detail: string
      date: string | null
      amount: number
      currency: string
    }>
    activitySource: "settled_bank_records" | "finance_records" | "no_records"
    outstandingReceivables: Array<{ currency: string; amount: number; count: number }>
  }
  system: {
    agentsThisWeek: number
    failedRuns: number
    aiSpendUsd: number
    aiCalls: number
    databaseState: "connected"
    latestEvent: { label: string; at: string } | null
  }
  roadmap: {
    blockerCount: number
    totalProgress: number
    buildPoints: number
    primary: { title: string; progress: number; blockerReason: string | null } | null
    next: { title: string } | null
    phases: Array<{
      id: string
      name: string
      status: string
      done: number
      total: number
      progress: number
    }>
    activePhase: { name: string; index: number; total: number } | null
    capabilities: Array<{
      id: string
      title: string
      reward: string | null
      status: "done" | "active" | "next" | "locked"
      stepsDone: number
      stepsTotal: number
      progress: number
      blockedReason: string | null
    }>
    momentum: { shippedThisWeek: number; streakWeeks: number }
  }
  publishingToday: Array<{
    id: string
    title: string
    clientName: string
    scheduledAt: string | null
    kind: "feed" | "story"
    href: string
  }>
  notifications: HomeNotification[]
  systemHealth: {
    score: number
    checks: Array<{
      name: string
      note: string
      state: "ok" | "warn" | "fail"
      href: string
    }>
  }
}

export type HomeTaskAction = "start" | "complete" | "review" | "archive" | "reopen"
