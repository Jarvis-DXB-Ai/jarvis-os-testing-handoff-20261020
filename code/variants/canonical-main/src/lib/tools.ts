export const TOOL_USAGE_STATUSES = ["active", "experimental", "planned", "explore", "deprecated"] as const
export const TOOL_CONNECTION_STATUSES = ["connected", "configured", "partial", "not_connected", "not_required", "unknown", "error"] as const
export const TOOL_HEALTH_STATUSES = ["healthy", "needs_attention", "not_checked", "not_applicable"] as const
export const TOOL_CATEGORIES = [
  "ai_agents", "development", "infrastructure_data", "research_scraping", "creative_ai", "social_publishing",
  "advertising", "google_ecosystem", "communication", "crm_reservations", "automation_connectivity", "analytics_monitoring", "other",
] as const
export const TOOL_TYPES = ["runtime_integration", "development_tool", "manual_external_tool", "infrastructure", "candidate"] as const
export const TOOL_RELATIONSHIP_TYPES = ["used_by", "required_for", "candidate_for"] as const
export const TOOL_DECISION_STATUSES = ["not_evaluated", "researching", "shortlisted", "rejected", "promoted_to_planned"] as const

export type ToolUsageStatus = typeof TOOL_USAGE_STATUSES[number]
export type ToolConnectionStatus = typeof TOOL_CONNECTION_STATUSES[number]
export type ToolHealthStatus = typeof TOOL_HEALTH_STATUSES[number]
export type ToolCategory = typeof TOOL_CATEGORIES[number]
export type ToolType = typeof TOOL_TYPES[number]
export type ToolRelationshipType = typeof TOOL_RELATIONSHIP_TYPES[number]
export type ToolDecisionStatus = typeof TOOL_DECISION_STATUSES[number]

export type ToolRecord = {
  id: string; slug: string; name: string; provider: string | null; category: ToolCategory; tool_type: ToolType
  description: string; jarvis_usage: string | null; why_we_use: string | null; usage_status: ToolUsageStatus
  connection_status: ToolConnectionStatus; health_status: ToolHealthStatus; potential_value: "high" | "medium" | "low" | null
  decision_status: ToolDecisionStatus | null; logo_key: string | null; official_website: string | null; documentation_url: string | null
  developer_docs_url: string | null; configuration_summary: string | null; alternatives: string[]; notes: string | null
  os_release_overrides: string[]; is_core: boolean; last_verified_at: string | null; created_at: string; updated_at: string
}

export type ToolCapabilityLink = {
  id: string; tool_id: string; roadmap_item_id: string; relationship_type: ToolRelationshipType
  capability: { id: string; slug: string; title: string; os_slug: string; os_name: string } | null
}

export type ToolActivity = { id: string; tool_id: string; action_type: string; description: string; metadata: Record<string, unknown>; created_at: string }
export type ToolWithRelations = ToolRecord & { capabilityLinks: ToolCapabilityLink[]; activity: ToolActivity[]; osSlugs: string[] }
export type ToolRegistrySnapshot = { tools: ToolWithRelations[]; capabilities: Array<{ id: string; slug: string; title: string; os_slug: string; os_name: string }>; generatedAt: string }

export const toolUsageLabel = (status: ToolUsageStatus) => ({ active: "Active", experimental: "Experimental", planned: "Planned", explore: "Explore", deprecated: "Deprecated" })[status]
export const toolConnectionLabel = (status: ToolConnectionStatus) => ({ connected: "Connected", configured: "Configured", partial: "Partial", not_connected: "Not Connected", not_required: "Not Required", unknown: "Unknown", error: "Error" })[status]
export const toolHealthLabel = (status: ToolHealthStatus) => ({ healthy: "Healthy", needs_attention: "Needs Attention", not_checked: "Not Checked", not_applicable: "Not Applicable" })[status]
export const toolCategoryLabel = (category: ToolCategory) => ({
  ai_agents: "AI & Agents", development: "Development", infrastructure_data: "Infrastructure & Data", research_scraping: "Research & Scraping",
  creative_ai: "Creative AI", social_publishing: "Social & Publishing", advertising: "Advertising", google_ecosystem: "Google Ecosystem",
  communication: "Communication", crm_reservations: "CRM & Reservations", automation_connectivity: "Automation & Connectivity",
  analytics_monitoring: "Analytics & Monitoring", other: "Other",
})[category]
export const toolRelationshipLabel = (value: ToolRelationshipType) => ({ used_by: "Used by", required_for: "Required for", candidate_for: "Candidate for" })[value]
export const toolOsLabel = (slug: string) => ({ "os1-create": "OS 1", "os2-distribute": "OS 2", "os3-grow": "OS 3", "os4-operate": "OS 4" })[slug] ?? slug

const logoPaths: Record<string, string> = {
  supabase: "/tool-logos/supabase.svg", anthropic: "/tool-logos/anthropic.svg", visualstudiocode: "/tool-logos/visualstudiocode.ico", github: "/tool-logos/github.svg", google: "/tool-logos/google.svg",
  pinterest: "/tool-logos/pinterest.svg", meta: "/tool-logos/meta.svg", googleads: "/tool-logos/googleads.svg", whatsapp: "/tool-logos/whatsapp.svg",
  n8n: "/tool-logos/n8n.svg", resend: "/tool-logos/resend.svg", sentry: "/tool-logos/sentry.svg", posthog: "/tool-logos/posthog.svg",
}

export function toolLogoPath(key?: string | null) { return key ? logoPaths[key] ?? null : null }
export function isToolUsageStatus(value: unknown): value is ToolUsageStatus { return typeof value === "string" && TOOL_USAGE_STATUSES.includes(value as ToolUsageStatus) }
export function isToolConnectionStatus(value: unknown): value is ToolConnectionStatus { return typeof value === "string" && TOOL_CONNECTION_STATUSES.includes(value as ToolConnectionStatus) }
export function isToolHealthStatus(value: unknown): value is ToolHealthStatus { return typeof value === "string" && TOOL_HEALTH_STATUSES.includes(value as ToolHealthStatus) }
export function isToolCategory(value: unknown): value is ToolCategory { return typeof value === "string" && TOOL_CATEGORIES.includes(value as ToolCategory) }
export function isToolType(value: unknown): value is ToolType { return typeof value === "string" && TOOL_TYPES.includes(value as ToolType) }
export function isToolRelationshipType(value: unknown): value is ToolRelationshipType { return typeof value === "string" && TOOL_RELATIONSHIP_TYPES.includes(value as ToolRelationshipType) }
export function isToolDecisionStatus(value: unknown): value is ToolDecisionStatus { return typeof value === "string" && TOOL_DECISION_STATUSES.includes(value as ToolDecisionStatus) }
