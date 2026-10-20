import type { AgentDepartment, AgentProfile } from "@/lib/agents-v2"
export type OrganisationAgent = { id: string; agent_name: string; profile: AgentProfile | null }
export type OrganisationSnapshot = { agents: OrganisationAgent[]; departments: AgentDepartment[] }
export function managerIssue(agent: OrganisationAgent, agents: OrganisationAgent[]): string | null {
 const byId = new Map(agents.map(row => [row.id, row])); const seen = new Set([agent.id]); let next = agent.profile?.manager_agent_id
 while (next) { if (seen.has(next)) return "Invalid reporting chain: cycle detected."; seen.add(next); const manager = byId.get(next); if (!manager) return "Invalid reporting chain: manager not found."; next = manager.profile?.manager_agent_id }
 return null
}
