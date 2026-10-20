export const ROADMAP_STATUSES = ["not_started", "planned", "in_progress", "blocked", "needs_review", "completed", "deferred", "idea"] as const
export const ROADMAP_PRIORITIES = ["critical", "high", "medium", "low"] as const
export const ROADMAP_ITEM_TYPES = ["milestone", "feature", "task", "idea", "technical_debt", "capability", "implementation"] as const
export const ROADMAP_RELEASE_STATUSES = ["active", "upcoming", "complete", "future", "archived", "legacy"] as const
export const IDEA_STATUSES = ["idea", "researching", "shortlisted", "promoted_to_roadmap", "parked", "rejected"] as const
export const IDEA_CATEGORIES = [
  "content", "social_growth", "video", "intelligence", "competitor_research", "creator_influencer", "customer_support", "crm", "retention", "email", "whatsapp", "paid_media", "landing_pages", "conversion", "customer_intelligence", "menu_intelligence", "hospitality_operations", "analytics", "automation", "other",
] as const
export const IDEA_VALUES = ["high", "medium", "low"] as const

export type RoadmapStatus = typeof ROADMAP_STATUSES[number]
export type RoadmapPriority = typeof ROADMAP_PRIORITIES[number]
export type RoadmapItemType = typeof ROADMAP_ITEM_TYPES[number]
export type RoadmapReleaseStatus = typeof ROADMAP_RELEASE_STATUSES[number]
export type RoadmapIdeaStatus = typeof IDEA_STATUSES[number]
export type RoadmapIdeaCategory = typeof IDEA_CATEGORIES[number]
export type RoadmapIdeaValue = typeof IDEA_VALUES[number]

export type RoadmapProject = { id: string; slug: string; name: string; description: string | null; status: string }
export type RoadmapPhase = {
  id: string; project_id: string; slug: string; name: string; description: string | null; sort_order: number; weight: number
  release_status: RoadmapReleaseStatus; goal: string | null; completion_condition: string | null; metadata: Record<string, unknown>
}
export type RoadmapItem = {
  id: string; project_id: string; phase_id: string | null; parent_item_id: string | null; slug: string; title: string; description: string | null
  item_type: RoadmapItemType; status: RoadmapStatus; priority: RoadmapPriority; weight: number; progress: number
  is_focus: boolean; blocker_type: "internal" | "external" | "waiting" | null; blocker_reason: string | null
  related_links: string[]; metadata: Record<string, unknown>; target_date: string | null; started_at: string | null
  completed_at: string | null; created_at: string; updated_at: string
}
export type RoadmapDependency = { id: string; item_id: string; depends_on_item_id: string; created_at: string }
export type RoadmapActivity = { id: string; project_id: string; item_id: string | null; action_type: string; description: string; metadata: Record<string, unknown>; created_at: string }
export type RoadmapIdeaActivity = { id: string; idea_id: string; action_type: string; description: string; metadata: Record<string, unknown>; created_at: string }
export type RoadmapIdeaCapabilityLink = { id: string; idea_id: string; roadmap_item_id: string; relationship_type: "related" | "dependency" | "candidate_for"; capability: { id: string; slug: string; title: string; os_slug: string; os_name: string } | null }
export type RoadmapIdeaToolLink = { id: string; idea_id: string; tool_id: string; relationship_type: "dependency" | "candidate_for" | "research_source"; tool: { id: string; slug: string; name: string; provider: string | null; category: string } | null }
export type RoadmapIdeaAgentLink = { id: string; idea_id: string; agent_id: string; relationship_type: "owner" | "candidate_for" | "research_support"; agent: { id: string; name: string } | null }
export type RoadmapIdeaSkillLink = { id: string; idea_id: string; agent_skill_id: string; skill: { id: string; name: string; category: string | null; agent_name: string | null } | null }
export type RoadmapIdea = {
  id: string; project_id: string; title: string; description: string | null; category: RoadmapIdeaCategory; potential_phase_id: string | null
  potential_value: RoadmapIdeaValue; complexity: RoadmapIdeaValue; status: RoadmapIdeaStatus; dependency_notes: string | null; notes: string | null
  promoted_roadmap_item_id: string | null; promotion_metadata: Record<string, unknown>; metadata: Record<string, unknown>; created_at: string; updated_at: string
  capabilityLinks: RoadmapIdeaCapabilityLink[]; toolLinks: RoadmapIdeaToolLink[]; agentLinks: RoadmapIdeaAgentLink[]; skillLinks: RoadmapIdeaSkillLink[]; activity: RoadmapIdeaActivity[]
}

export type RoadmapCapability = {
  item: RoadmapItem
  implementationItems: RoadmapItem[]
  progress: number
  status: RoadmapStatus
  completedWeight: number
  totalWeight: number
  blockers: RoadmapItem[]
}

export type RoadmapRelease = {
  phase: RoadmapPhase
  capabilities: RoadmapCapability[]
  progress: number
  completedCapabilityCount: number
  capabilityCount: number
  blockers: RoadmapItem[]
}

export type RoadmapMission = { release: RoadmapPhase; capability: RoadmapCapability; item: RoadmapItem | null }

export type RoadmapSnapshot = {
  project: RoadmapProject; phases: RoadmapPhase[]; items: RoadmapItem[]; dependencies: RoadmapDependency[]; activity: RoadmapActivity[]
  ideas: RoadmapIdea[]; ideaOptions: { tools: Array<{ id: string; slug: string; name: string; provider: string | null; category: string }>; agents: Array<{ id: string; name: string }>; skills: Array<{ id: string; name: string; category: string | null; agent_name: string | null }> }
  releases: RoadmapRelease[]; totalProgress: number; completedWeight: number; totalWeight: number; buildPoints: number
  currentMission: RoadmapMission | null; nextMissionDetail: RoadmapMission | null; nextMission: RoadmapItem | null
  activeBlockers: RoadmapItem[]; completedMilestones: RoadmapItem[]
}

export const statusLabel = (status: RoadmapStatus) => ({
  not_started: "Not Started", planned: "Planned", in_progress: "In Progress", blocked: "Blocked",
  needs_review: "Ready for QA", completed: "Complete", deferred: "Deferred", idea: "Idea",
}[status])
export const ideaStatusLabel = (status: RoadmapIdeaStatus) => ({ idea: "Idea", researching: "Researching", shortlisted: "Shortlisted", promoted_to_roadmap: "Promoted", parked: "Parked", rejected: "Rejected" }[status])
export const ideaCategoryLabel = (category: RoadmapIdeaCategory) => ({
  content: "Content", social_growth: "Social Growth", video: "Video", intelligence: "Intelligence", competitor_research: "Competitor Research", creator_influencer: "Creator / Influencer", customer_support: "Customer Support", crm: "CRM", retention: "Retention", email: "Email", whatsapp: "WhatsApp", paid_media: "Paid Media", landing_pages: "Landing Pages", conversion: "Conversion", customer_intelligence: "Customer Intelligence", menu_intelligence: "Menu Intelligence", hospitality_operations: "Hospitality Operations", analytics: "Analytics", automation: "Automation", other: "Other",
}[category])
export const ideaValueLabel = (value: RoadmapIdeaValue) => ({ high: "High", medium: "Medium", low: "Low" }[value])
export const priorityRank = (priority: RoadmapPriority) => ({ critical: 0, high: 1, medium: 2, low: 3 })[priority]
export const isCommitted = (item: RoadmapItem) => !["idea", "deferred"].includes(item.status)
export const isCompleted = (item: RoadmapItem) => item.status === "completed"
export const isRoadmapRelease = (phase: RoadmapPhase) => ["active", "upcoming", "complete", "future"].includes(phase.release_status)
export function isRoadmapIdeaStatus(value: unknown): value is RoadmapIdeaStatus { return typeof value === "string" && IDEA_STATUSES.includes(value as RoadmapIdeaStatus) }
export function isRoadmapIdeaCategory(value: unknown): value is RoadmapIdeaCategory { return typeof value === "string" && IDEA_CATEGORIES.includes(value as RoadmapIdeaCategory) }
export function isRoadmapIdeaValue(value: unknown): value is RoadmapIdeaValue { return typeof value === "string" && IDEA_VALUES.includes(value as RoadmapIdeaValue) }

export function effectiveProgress(item: RoadmapItem) {
  return item.status === "completed" ? 100 : Math.max(0, Math.min(100, item.progress))
}

export function capabilityStatus(capability: RoadmapItem, children: RoadmapItem[]): RoadmapStatus {
  const committed = children.filter(isCommitted)
  if (!committed.length) return capability.status
  if (committed.every(isCompleted)) return "completed"
  if (committed.some(item => item.status === "blocked")) return "blocked"
  if (committed.some(item => item.status === "in_progress" || effectiveProgress(item) > 0)) return "in_progress"
  if (committed.some(item => item.status === "needs_review")) return "needs_review"
  return capability.status === "not_started" ? "planned" : capability.status
}
