import "server-only"

import { clientBrainV2ServerClient as db, isUuid } from "@/lib/client-brain-v2-server-core"
import {
  agentLegacyStatus, isAgentCapabilityRelationshipType, isAgentOperationalStatus, isAgentToolAccessType, readinessFromTools, safeRecord, safeStringList,
  type AgentActivity, type AgentCapability, type AgentCapabilityLink, type AgentDepartment, type AgentProfile, type AgentSkill, type AgentToolLink, type AgentWithRelations, type AgentsV2Snapshot,
} from "@/lib/agents-v2"

export class AgentsV2Error extends Error { constructor(message: string, public status = 400) { super(message) } }

const agentColumns = "id,agent_name,agent_type,status,description,capabilities,default_model,metadata,created_at"
const profileColumns = "agent_id,department_id,manager_agent_id,role_title,operational_status,purpose,responsibilities,boundaries,input_requirements,output_responsibilities,context_access,approval_requirements,escalation_path,os_release_overrides,is_executive,sort_order,created_at,updated_at"
const toolColumns = "id,slug,name,provider,category,logo_key,connection_status,health_status"

function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback }
function optionalText(value: unknown, fallback: string | null = null) { const result = text(value); return result || fallback }
function profileFrom(row: Record<string, unknown>): AgentProfile {
  return { ...row, operational_status: row.operational_status as AgentProfile["operational_status"], responsibilities: safeStringList(row.responsibilities), boundaries: safeStringList(row.boundaries), input_requirements: safeStringList(row.input_requirements), output_responsibilities: safeStringList(row.output_responsibilities), context_access: safeStringList(row.context_access), os_release_overrides: safeStringList(row.os_release_overrides) } as AgentProfile
}

export async function loadAgentsV2Snapshot(): Promise<AgentsV2Snapshot> {
  const [agentsRes, profilesRes, departmentsRes, skillsRes, toolLinksRes, toolsRes, capabilityLinksRes, roadmapRes, activitiesRes, queueRes] = await Promise.all([
    db.from("agents").select(agentColumns).order("created_at"),
    db.from("agent_organization_profiles").select(profileColumns),
    db.from("agent_departments").select("id,slug,name,purpose,sort_order,is_future,created_at,updated_at").order("sort_order"),
    db.from("agent_skills").select("id,agent_id,name,category,description,status").order("name"),
    db.from("agent_tool_links").select("id,agent_id,tool_id,access_type"),
    db.from("tool_registry").select(toolColumns).order("name"),
    db.from("agent_capability_links").select("id,agent_id,roadmap_item_id,relationship_type"),
    db.from("roadmap_items").select("id,slug,title,phase_id,item_type").eq("item_type", "capability"),
    db.from("agent_organization_activity").select("id,agent_id,action_type,description,metadata,created_at").order("created_at", { ascending: false }).limit(300),
    db.from("execution_queue").select("agent_id,updated_at").not("agent_id", "is", null).order("updated_at", { ascending: false }).limit(1000),
  ])
  if ([agentsRes, profilesRes, departmentsRes, skillsRes, toolLinksRes, toolsRes, capabilityLinksRes, roadmapRes, activitiesRes, queueRes].some(result => result.error)) throw new AgentsV2Error("Agent organization records could not be loaded.", 500)

  const phaseIds = [...new Set((roadmapRes.data ?? []).map(item => item.phase_id).filter(Boolean))]
  const phasesRes = phaseIds.length ? await db.from("roadmap_phases").select("id,slug,name").in("id", phaseIds) : { data: [], error: null }
  if (phasesRes.error) throw new AgentsV2Error("Roadmap release metadata could not be loaded.", 500)
  const capabilities: AgentCapability[] = (roadmapRes.data ?? []).map(item => {
    const phase = (phasesRes.data ?? []).find(candidate => candidate.id === item.phase_id)
    return { id: item.id, slug: item.slug, title: item.title, os_slug: phase?.slug ?? "", os_name: phase?.name ?? "Unassigned" }
  }).filter(item => item.os_slug)

  const departments = (departmentsRes.data ?? []) as AgentDepartment[]
  const departmentById = new Map(departments.map(item => [item.id, item]))
  const profileByAgent = new Map((profilesRes.data ?? []).map(row => [row.agent_id, profileFrom(row)]))
  const tools = (toolsRes.data ?? []) as AgentsV2Snapshot["tools"]
  const toolById = new Map(tools.map(item => [item.id, item]))
  const capabilityById = new Map(capabilities.map(item => [item.id, item]))
  const skillsByAgent = new Map<string, AgentSkill[]>()
  for (const row of skillsRes.data ?? []) if (row.agent_id) skillsByAgent.set(row.agent_id, [...(skillsByAgent.get(row.agent_id) ?? []), row as AgentSkill])
  const toolsByAgent = new Map<string, AgentToolLink[]>()
  for (const row of toolLinksRes.data ?? []) {
    const link: AgentToolLink = { ...row, access_type: row.access_type as AgentToolLink["access_type"], tool: toolById.get(row.tool_id) ?? null }
    toolsByAgent.set(row.agent_id, [...(toolsByAgent.get(row.agent_id) ?? []), link])
  }
  const capabilitiesByAgent = new Map<string, AgentCapabilityLink[]>()
  for (const row of capabilityLinksRes.data ?? []) {
    const link: AgentCapabilityLink = { ...row, relationship_type: row.relationship_type as AgentCapabilityLink["relationship_type"], capability: capabilityById.get(row.roadmap_item_id) ?? null }
    capabilitiesByAgent.set(row.agent_id, [...(capabilitiesByAgent.get(row.agent_id) ?? []), link])
  }
  const activityByAgent = new Map<string, AgentActivity[]>()
  for (const row of activitiesRes.data ?? []) {
    const activity: AgentActivity = { ...row, metadata: safeRecord(row.metadata) }
    activityByAgent.set(row.agent_id, [...(activityByAgent.get(row.agent_id) ?? []), activity])
  }
  const executions = new Map<string, { count: number; lastExecutionAt: string | null }>()
  for (const row of queueRes.data ?? []) if (row.agent_id) {
    const current = executions.get(row.agent_id) ?? { count: 0, lastExecutionAt: null }
    executions.set(row.agent_id, { count: current.count + 1, lastExecutionAt: current.lastExecutionAt ?? row.updated_at })
  }
  const fallbackDepartment = departments.find(item => item.slug === "operations-delivery") ?? departments[0]
  const agents: AgentWithRelations[] = (agentsRes.data ?? []).flatMap(row => {
    const profile = profileByAgent.get(row.id)
    const department = profile ? departmentById.get(profile.department_id) : fallbackDepartment
    if (!profile || !department) return []
    const toolLinks = toolsByAgent.get(row.id) ?? []
    const capabilityLinks = capabilitiesByAgent.get(row.id) ?? []
    const osSlugs = [...new Set([...profile.os_release_overrides, ...capabilityLinks.map(link => link.capability?.os_slug).filter((slug): slug is string => Boolean(slug))])]
    return [{
      ...row, legacy_status: row.status, description: row.description ?? null, capabilities: safeStringList(row.capabilities), default_model: row.default_model ?? null, metadata: safeRecord(row.metadata),
      profile, department, skills: skillsByAgent.get(row.id) ?? [], toolLinks, capabilityLinks, activity: (activityByAgent.get(row.id) ?? []).slice(0, 12), osSlugs,
      execution: executions.get(row.id) ?? { count: 0, lastExecutionAt: null }, readiness: readinessFromTools(profile.operational_status, toolLinks),
    }]
  }).sort((a, b) => Number(b.profile.is_executive) - Number(a.profile.is_executive) || a.department.sort_order - b.department.sort_order || a.profile.sort_order - b.profile.sort_order || a.agent_name.localeCompare(b.agent_name))
  return { departments, agents, tools, capabilities, generatedAt: new Date().toISOString() }
}

function normalizeInput(input: Record<string, unknown>, existing?: AgentWithRelations) {
  const name = text(input.agent_name, existing?.agent_name ?? "")
  const agentType = optionalText(input.agent_type, existing?.agent_type ?? null)
  const departmentId = text(input.department_id, existing?.department.id ?? "")
  const roleTitle = text(input.role_title, existing?.profile.role_title ?? "")
  const operationalStatus = input.operational_status ?? existing?.profile.operational_status
  const purpose = text(input.purpose, existing?.profile.purpose ?? "")
  if (!name || !departmentId || !roleTitle || !purpose || !isAgentOperationalStatus(operationalStatus)) throw new AgentsV2Error("Agent name, department, role, purpose and operational status are required.")
  const manager = input.manager_agent_id === "" ? null : input.manager_agent_id ?? existing?.profile.manager_agent_id ?? null
  if (manager !== null && !isUuid(text(manager))) throw new AgentsV2Error("Manager assignment is invalid.")
  return {
    agent_name: name, agent_type: agentType, description: optionalText(input.description, existing?.description ?? null), default_model: optionalText(input.default_model, existing?.default_model ?? null),
    capabilities: input.capabilities !== undefined ? safeStringList(input.capabilities) : existing?.capabilities ?? [], status: agentLegacyStatus(operationalStatus),
    profile: {
      department_id: departmentId, manager_agent_id: manager, role_title: roleTitle, operational_status: operationalStatus, purpose,
      responsibilities: input.responsibilities !== undefined ? safeStringList(input.responsibilities) : existing?.profile.responsibilities ?? [],
      boundaries: input.boundaries !== undefined ? safeStringList(input.boundaries) : existing?.profile.boundaries ?? [],
      input_requirements: input.input_requirements !== undefined ? safeStringList(input.input_requirements) : existing?.profile.input_requirements ?? [],
      output_responsibilities: input.output_responsibilities !== undefined ? safeStringList(input.output_responsibilities) : existing?.profile.output_responsibilities ?? [],
      context_access: input.context_access !== undefined ? safeStringList(input.context_access) : existing?.profile.context_access ?? [],
      approval_requirements: optionalText(input.approval_requirements, existing?.profile.approval_requirements ?? null), escalation_path: optionalText(input.escalation_path, existing?.profile.escalation_path ?? null),
      os_release_overrides: input.os_release_overrides !== undefined ? safeStringList(input.os_release_overrides) : existing?.profile.os_release_overrides ?? [],
      is_executive: typeof input.is_executive === "boolean" ? input.is_executive : existing?.profile.is_executive ?? false,
      sort_order: Number.isInteger(input.sort_order) ? Number(input.sort_order) : existing?.profile.sort_order ?? 999,
    },
  }
}

async function verifyDepartment(departmentId: string) {
  if (!isUuid(departmentId)) throw new AgentsV2Error("Department is invalid.")
  const result = await db.from("agent_departments").select("id").eq("id", departmentId).maybeSingle()
  if (result.error || !result.data) throw new AgentsV2Error("Department not found.")
}

async function replaceToolLinks(agentId: string, links: unknown) {
  if (!Array.isArray(links)) return
  const seen = new Set<string>()
  const rows = links.map(link => {
    if (!link || typeof link !== "object" || !isUuid(text((link as Record<string, unknown>).tool_id)) || !isAgentToolAccessType((link as Record<string, unknown>).access_type)) throw new AgentsV2Error("Agent Tool link is invalid.")
    const toolId = text((link as Record<string, unknown>).tool_id); const accessType = (link as Record<string, unknown>).access_type as AgentToolLink["access_type"]
    const key = `${toolId}:${accessType}`; if (seen.has(key)) throw new AgentsV2Error("Duplicate Agent Tool link."); seen.add(key)
    return { agent_id: agentId, tool_id: toolId, access_type: accessType }
  })
  const ids = rows.map(row => row.tool_id)
  if (ids.length) { const result = await db.from("tool_registry").select("id").in("id", ids); if (result.error || (result.data ?? []).length !== ids.length) throw new AgentsV2Error("Every linked Tool must exist.") }
  const removed = await db.from("agent_tool_links").delete().eq("agent_id", agentId); if (removed.error) throw new AgentsV2Error("Unable to update Agent Tools.", 500)
  if (rows.length) { const inserted = await db.from("agent_tool_links").insert(rows); if (inserted.error) throw new AgentsV2Error("Unable to add Agent Tools.", 500) }
}

async function replaceCapabilityLinks(agentId: string, links: unknown) {
  if (!Array.isArray(links)) return
  const seen = new Set<string>()
  const rows = links.map(link => {
    if (!link || typeof link !== "object" || !isUuid(text((link as Record<string, unknown>).roadmap_item_id)) || !isAgentCapabilityRelationshipType((link as Record<string, unknown>).relationship_type)) throw new AgentsV2Error("Agent Roadmap link is invalid.")
    const roadmapItemId = text((link as Record<string, unknown>).roadmap_item_id); const relationshipType = (link as Record<string, unknown>).relationship_type as AgentCapabilityLink["relationship_type"]
    const key = `${roadmapItemId}:${relationshipType}`; if (seen.has(key)) throw new AgentsV2Error("Duplicate Agent Roadmap link."); seen.add(key)
    return { agent_id: agentId, roadmap_item_id: roadmapItemId, relationship_type: relationshipType }
  })
  const ids = rows.map(row => row.roadmap_item_id)
  if (ids.length) { const result = await db.from("roadmap_items").select("id,item_type").in("id", ids); if (result.error || (result.data ?? []).length !== ids.length || (result.data ?? []).some(item => item.item_type !== "capability")) throw new AgentsV2Error("Every linked Roadmap record must be a capability.") }
  const removed = await db.from("agent_capability_links").delete().eq("agent_id", agentId); if (removed.error) throw new AgentsV2Error("Unable to update Agent Roadmap links.", 500)
  if (rows.length) { const inserted = await db.from("agent_capability_links").insert(rows); if (inserted.error) throw new AgentsV2Error("Unable to add Agent Roadmap links.", 500) }
}

export async function createAgent(input: Record<string, unknown>) {
  const values = normalizeInput(input); await verifyDepartment(values.profile.department_id)
  const duplicate = await db.from("agents").select("id").eq("agent_name", values.agent_name).maybeSingle()
  if (duplicate.error) throw new AgentsV2Error("Unable to verify Agent name.", 500)
  if (duplicate.data) throw new AgentsV2Error("An Agent with this name already exists.", 409)
  const created = await db.from("agents").insert({ agent_name: values.agent_name, agent_type: values.agent_type, status: values.status, description: values.description, capabilities: values.capabilities, default_model: values.default_model, metadata: { organization_v2: true } }).select(agentColumns).single()
  if (created.error || !created.data) throw new AgentsV2Error("Unable to create Agent.", 500)
  if (values.profile.manager_agent_id === created.data.id) throw new AgentsV2Error("An Agent cannot manage itself.")
  const profile = await db.from("agent_organization_profiles").insert({ agent_id: created.data.id, ...values.profile }).select(profileColumns).single()
  if (profile.error) throw new AgentsV2Error("Unable to create Agent organization profile.", 500)
  await replaceToolLinks(created.data.id, input.toolLinks); await replaceCapabilityLinks(created.data.id, input.capabilityLinks)
  await db.from("agent_organization_activity").insert({ agent_id: created.data.id, action_type: "created", description: `Added ${created.data.agent_name} to the AI company organization.`, metadata: {} })
  return loadAgentsV2Snapshot()
}

export async function updateAgent(agentId: string, expectedUpdatedAt: string, input: Record<string, unknown>) {
  if (!isUuid(agentId) || !expectedUpdatedAt) throw new AgentsV2Error("Agent update request is invalid.")
  const snapshot = await loadAgentsV2Snapshot(); const existing = snapshot.agents.find(agent => agent.id === agentId)
  if (!existing) throw new AgentsV2Error("Agent not found.", 404)
  if (existing.profile.updated_at !== expectedUpdatedAt) throw new AgentsV2Error("This Agent changed elsewhere. Refresh before saving your edits.", 409)
  const values = normalizeInput(input, existing); await verifyDepartment(values.profile.department_id)
  if (values.profile.manager_agent_id === agentId) throw new AgentsV2Error("An Agent cannot manage itself.")
  const duplicate = await db.from("agents").select("id").eq("agent_name", values.agent_name).neq("id", agentId).maybeSingle()
  if (duplicate.error) throw new AgentsV2Error("Unable to verify Agent name.", 500)
  if (duplicate.data) throw new AgentsV2Error("An Agent with this name already exists.", 409)
  const legacy = await db.from("agents").update({ agent_name: values.agent_name, agent_type: values.agent_type, status: values.status, description: values.description, capabilities: values.capabilities, default_model: values.default_model }).eq("id", agentId)
  if (legacy.error) throw new AgentsV2Error("Unable to update Agent.", 500)
  const profile = await db.from("agent_organization_profiles").update(values.profile).eq("agent_id", agentId).eq("updated_at", expectedUpdatedAt).select("agent_id").maybeSingle()
  if (profile.error) throw new AgentsV2Error("Unable to save Agent organization profile.", 500)
  if (!profile.data) throw new AgentsV2Error("This Agent changed elsewhere. Refresh before saving your edits.", 409)
  await replaceToolLinks(agentId, input.toolLinks); await replaceCapabilityLinks(agentId, input.capabilityLinks)
  await db.from("agent_organization_activity").insert({ agent_id: agentId, action_type: "updated", description: `Updated ${values.agent_name}.`, metadata: { operational_status: values.profile.operational_status } })
  return loadAgentsV2Snapshot()
}
