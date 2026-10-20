import type { ToolConnectionStatus, ToolRecord } from "@/lib/tools"

export const AGENT_OPERATIONAL_STATUSES = ["active", "experimental", "planned", "blocked", "deprecated"] as const
export const AGENT_TOOL_ACCESS_TYPES = ["allowed", "required"] as const
export const AGENT_CAPABILITY_RELATIONSHIP_TYPES = ["owns", "supports", "candidate_for"] as const

export type AgentOperationalStatus = typeof AGENT_OPERATIONAL_STATUSES[number]
export type AgentToolAccessType = typeof AGENT_TOOL_ACCESS_TYPES[number]
export type AgentCapabilityRelationshipType = typeof AGENT_CAPABILITY_RELATIONSHIP_TYPES[number]

export type AgentDepartment = { id: string; slug: string; name: string; purpose: string; sort_order: number; is_future: boolean; created_at: string; updated_at: string }
export type AgentSkill = { id: string; name: string; category: string | null; description: string | null; status: string }
export type AgentCapability = { id: string; slug: string; title: string; os_slug: string; os_name: string }
export type AgentCapabilityLink = { id: string; agent_id: string; roadmap_item_id: string; relationship_type: AgentCapabilityRelationshipType; capability: AgentCapability | null }
export type AgentToolLink = { id: string; agent_id: string; tool_id: string; access_type: AgentToolAccessType; tool: Pick<ToolRecord, "id" | "slug" | "name" | "provider" | "category" | "logo_key" | "connection_status" | "health_status"> | null }
export type AgentExecutionSummary = { count: number; lastExecutionAt: string | null }
export type AgentActivity = { id: string; agent_id: string; action_type: string; description: string; metadata: Record<string, unknown>; created_at: string }

export type AgentProfile = {
  agent_id: string; department_id: string; manager_agent_id: string | null; role_title: string; operational_status: AgentOperationalStatus; purpose: string
  responsibilities: string[]; boundaries: string[]; input_requirements: string[]; output_responsibilities: string[]; context_access: string[]
  approval_requirements: string | null; escalation_path: string | null; os_release_overrides: string[]; is_executive: boolean; sort_order: number; created_at: string; updated_at: string
}

export type AgentWithRelations = {
  id: string; agent_name: string; agent_type: string | null; legacy_status: string | null; description: string | null; capabilities: string[]; default_model: string | null; metadata: Record<string, unknown>; created_at: string
  profile: AgentProfile; department: AgentDepartment; skills: AgentSkill[]; toolLinks: AgentToolLink[]; capabilityLinks: AgentCapabilityLink[]; activity: AgentActivity[]; osSlugs: string[]; execution: AgentExecutionSummary; readiness: AgentReadiness
}

export type AgentReadiness = { status: "ready" | "blocked" | "attention" | "not_applicable"; label: string; reason: string | null }
export type AgentsV2Snapshot = { departments: AgentDepartment[]; agents: AgentWithRelations[]; tools: Array<Pick<ToolRecord, "id" | "slug" | "name" | "provider" | "category" | "logo_key" | "connection_status" | "health_status">>; capabilities: AgentCapability[]; generatedAt: string }

export const agentStatusLabel = (status: AgentOperationalStatus) => ({ active: "Active", experimental: "Experimental", planned: "Planned", blocked: "Blocked", deprecated: "Deprecated" })[status]
export const agentToolAccessLabel = (value: AgentToolAccessType) => ({ allowed: "Available", required: "Required" })[value]
export const agentCapabilityRelationshipLabel = (value: AgentCapabilityRelationshipType) => ({ owns: "Owns", supports: "Supports", candidate_for: "Candidate for" })[value]

export function isAgentOperationalStatus(value: unknown): value is AgentOperationalStatus { return typeof value === "string" && AGENT_OPERATIONAL_STATUSES.includes(value as AgentOperationalStatus) }
export function isAgentToolAccessType(value: unknown): value is AgentToolAccessType { return typeof value === "string" && AGENT_TOOL_ACCESS_TYPES.includes(value as AgentToolAccessType) }
export function isAgentCapabilityRelationshipType(value: unknown): value is AgentCapabilityRelationshipType { return typeof value === "string" && AGENT_CAPABILITY_RELATIONSHIP_TYPES.includes(value as AgentCapabilityRelationshipType) }

export function readinessFromTools(status: AgentOperationalStatus, links: AgentToolLink[]): AgentReadiness {
  if (status === "deprecated") return { status: "not_applicable", label: "Not applicable", reason: null }
  const blocked = links.filter(link => link.access_type === "required" && ["not_connected", "error"].includes(link.tool?.connection_status ?? "not_connected"))
  if (blocked.length) return { status: "blocked", label: "Blocked by Tool", reason: `${blocked.map(link => link.tool?.name ?? "Unavailable Tool").join(", ")} must be connected or healthy.` }
  const attention = links.filter(link => link.access_type === "required" && ["configured", "partial", "unknown"].includes(link.tool?.connection_status ?? "unknown"))
  if (attention.length) return { status: "attention", label: "Needs verification", reason: `${attention.map(link => link.tool?.name ?? "Required Tool").join(", ")} requires verification before autonomous use.` }
  return { status: "ready", label: status === "planned" ? "Architecture ready" : "Ready", reason: status === "planned" ? "No required provider is currently blocking this planned role." : null }
}

export function agentLegacyStatus(status: AgentOperationalStatus) {
  return ({ active: "active", experimental: "testing", planned: "inactive", blocked: "inactive", deprecated: "deprecated" })[status]
}

export function safeStringList(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))] : []
}

export function safeRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export type CompactTool = AgentToolLink["tool"] & { connection_status: ToolConnectionStatus }
