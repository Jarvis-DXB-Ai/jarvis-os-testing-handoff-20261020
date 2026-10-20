import "server-only"
import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core"
import { safeStringList, type AgentProfile, type AgentDepartment } from "@/lib/agents-v2"
import type { OrganisationSnapshot } from "@/lib/organisation-structure"
export async function loadOrganisationStructure(): Promise<OrganisationSnapshot> {
 const [agents, profiles, departments] = await Promise.all([db.from("agents").select("id,agent_name").order("created_at"), db.from("agent_organization_profiles").select("*"), db.from("agent_departments").select("*").order("sort_order")])
 if (agents.error || profiles.error || departments.error) throw new Error("Organisation structure could not be loaded.")
 const byAgent = new Map((profiles.data ?? []).map(row => [row.agent_id, { ...row, responsibilities: safeStringList(row.responsibilities), boundaries: safeStringList(row.boundaries), input_requirements: safeStringList(row.input_requirements), output_responsibilities: safeStringList(row.output_responsibilities), context_access: safeStringList(row.context_access), os_release_overrides: safeStringList(row.os_release_overrides) } as AgentProfile]))
 return { agents: (agents.data ?? []).map(row => ({ ...row, profile: byAgent.get(row.id) ?? null })), departments: (departments.data ?? []) as AgentDepartment[] }
}
