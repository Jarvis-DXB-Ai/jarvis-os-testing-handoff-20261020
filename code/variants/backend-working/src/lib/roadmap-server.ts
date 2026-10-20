import "server-only"

import { clientBrainV2ServerClient as db, isUuid } from "@/lib/client-brain-v2-server-core"
import {
  capabilityStatus,
  effectiveProgress,
  isCommitted,
  isRoadmapRelease,
  priorityRank,
  isRoadmapIdeaCategory,
  isRoadmapIdeaStatus,
  isRoadmapIdeaValue,
  type RoadmapActivity,
  type RoadmapCapability,
  type RoadmapDependency,
  type RoadmapItem,
  type RoadmapMission,
  type RoadmapPhase,
  type RoadmapProject,
  type RoadmapRelease,
  type RoadmapIdea,
  type RoadmapIdeaActivity,
  type RoadmapIdeaAgentLink,
  type RoadmapIdeaCapabilityLink,
  type RoadmapIdeaSkillLink,
  type RoadmapIdeaToolLink,
  type RoadmapSnapshot,
} from "@/lib/roadmap"

export class RoadmapError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const projectColumns = "id, slug, name, description, status"
const phaseColumns = "id, project_id, slug, name, description, sort_order, weight, release_status, goal, completion_condition, metadata"
const itemColumns = "id, project_id, phase_id, parent_item_id, slug, title, description, item_type, status, priority, weight, progress, is_focus, blocker_type, blocker_reason, related_links, metadata, target_date, started_at, completed_at, created_at, updated_at"
const activityColumns = "id, project_id, item_id, action_type, description, metadata, created_at"
const ideaColumns = "id,project_id,title,description,category,potential_phase_id,potential_value,complexity,status,dependency_notes,notes,promoted_roadmap_item_id,promotion_metadata,metadata,created_at,updated_at"

function normalizeItem(row: Record<string, unknown>): RoadmapItem {
  return { ...row, related_links: Array.isArray(row.related_links) ? row.related_links : [], metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {} } as RoadmapItem
}

function normalizePhase(row: Record<string, unknown>): RoadmapPhase {
  return { ...row, metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {} } as RoadmapPhase
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback }
function optionalText(value: unknown) { const result = text(value); return result || null }
function uuidList(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && isUuid(item)))] : [] }

function buildReleaseSummaries(phases: RoadmapPhase[], items: RoadmapItem[]): RoadmapRelease[] {
  return phases
    .filter(isRoadmapRelease)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(phase => {
      const capabilityItems = items.filter(item => item.phase_id === phase.id && item.item_type === "capability")
      const capabilities: RoadmapCapability[] = capabilityItems.map(item => {
        const implementationItems = items.filter(candidate => candidate.parent_item_id === item.id)
        const committed = implementationItems.filter(isCommitted)
        const totalWeight = committed.reduce((sum, candidate) => sum + candidate.weight, 0)
        const completedWeight = committed.filter(candidate => candidate.status === "completed").reduce((sum, candidate) => sum + candidate.weight, 0)
        const progress = totalWeight
          ? Math.round(committed.reduce((sum, candidate) => sum + candidate.weight * effectiveProgress(candidate), 0) / totalWeight)
          : effectiveProgress(item)
        return {
          item,
          implementationItems,
          progress,
          status: capabilityStatus(item, implementationItems),
          completedWeight,
          totalWeight,
          blockers: implementationItems.filter(candidate => candidate.status === "blocked"),
        }
      })
      const committedCapabilities = capabilities.filter(capability => isCommitted(capability.item))
      const totalWeight = committedCapabilities.reduce((sum, capability) => sum + capability.item.weight, 0)
      const progress = totalWeight
        ? Math.round(committedCapabilities.reduce((sum, capability) => sum + capability.item.weight * capability.progress, 0) / totalWeight)
        : 0
      return {
        phase,
        capabilities,
        progress,
        completedCapabilityCount: capabilities.filter(capability => capability.status === "completed").length,
        capabilityCount: capabilities.length,
        blockers: capabilities.flatMap(capability => capability.blockers),
      }
    })
}

function missionForItem(item: RoadmapItem | null, releases: RoadmapRelease[]): RoadmapMission | null {
  if (!item) return null
  const release = releases.find(candidate => candidate.phase.id === item.phase_id)
  if (!release) return null
  const capability = release.capabilities.find(candidate => candidate.item.id === item.parent_item_id || candidate.item.id === item.id)
  return capability ? { release: release.phase, capability, item: item.item_type === "capability" ? null : item } : null
}

export async function loadRoadmapSnapshot(slug = "jarvis-os"): Promise<RoadmapSnapshot> {
  const { data: project, error: projectError } = await db.from("roadmap_projects").select(projectColumns).eq("slug", slug).maybeSingle()
  if (projectError || !project) throw new RoadmapError("Roadmap project is unavailable.", 500)
  const projectId = project.id
  const [phasesRes, itemsRes, dependenciesRes, activityRes, ideasRes, ideaCapabilityLinksRes, ideaToolLinksRes, ideaAgentLinksRes, ideaSkillLinksRes, ideaActivityRes, toolsRes, agentsRes, skillsRes] = await Promise.all([
    db.from("roadmap_phases").select(phaseColumns).eq("project_id", projectId).order("sort_order"),
    db.from("roadmap_items").select(itemColumns).eq("project_id", projectId).order("created_at"),
    db.from("roadmap_dependencies").select("id, item_id, depends_on_item_id, created_at"),
    db.from("roadmap_activity").select(activityColumns).eq("project_id", projectId).order("created_at", { ascending: false }).limit(40),
    db.from("roadmap_ideas").select(ideaColumns).eq("project_id", projectId).order("updated_at", { ascending: false }),
    db.from("roadmap_idea_capability_links").select("id,idea_id,roadmap_item_id,relationship_type"),
    db.from("roadmap_idea_tool_links").select("id,idea_id,tool_id,relationship_type"),
    db.from("roadmap_idea_agent_links").select("id,idea_id,agent_id,relationship_type"),
    db.from("roadmap_idea_skill_links").select("id,idea_id,agent_skill_id"),
    db.from("roadmap_idea_activity").select("id,idea_id,action_type,description,metadata,created_at").order("created_at", { ascending: false }).limit(240),
    db.from("tool_registry").select("id,slug,name,provider,category").order("name"),
    db.from("agents").select("id,agent_name").order("agent_name"),
    db.from("agent_skills").select("id,agent_id,name,category").order("name"),
  ])
  if ([phasesRes, itemsRes, dependenciesRes, activityRes, ideasRes, ideaCapabilityLinksRes, ideaToolLinksRes, ideaAgentLinksRes, ideaSkillLinksRes, ideaActivityRes, toolsRes, agentsRes, skillsRes].some(result => result.error)) throw new RoadmapError("Roadmap records could not be loaded.", 500)

  const phases = (phasesRes.data ?? []).map(row => normalizePhase(row as Record<string, unknown>))
  const items = (itemsRes.data ?? []).map(row => normalizeItem(row))
  const dependencies = (dependenciesRes.data ?? []).filter(dependency => items.some(item => item.id === dependency.item_id)) as RoadmapDependency[]
  const phaseById = new Map(phases.map(phase => [phase.id, phase]))
  const capabilityById = new Map(items.filter(item => item.item_type === "capability").map(item => {
    const phase = phaseById.get(item.phase_id ?? "")
    return [item.id, { id: item.id, slug: item.slug, title: item.title, os_slug: phase?.slug ?? "", os_name: phase?.name ?? "Unassigned" }]
  }))
  const toolOptions = (toolsRes.data ?? []).map(row => ({ id: row.id, slug: row.slug, name: row.name, provider: row.provider ?? null, category: row.category }))
  const agentOptions = (agentsRes.data ?? []).map(row => ({ id: row.id, name: row.agent_name }))
  const agentById = new Map(agentOptions.map(agent => [agent.id, agent]))
  const skillOptions = (skillsRes.data ?? []).map(row => ({ id: row.id, name: row.name, category: row.category ?? null, agent_name: agentById.get(row.agent_id)?.name ?? null }))
  const toolById = new Map(toolOptions.map(tool => [tool.id, tool]))
  const skillById = new Map(skillOptions.map(skill => [skill.id, skill]))
  const ideaIds = new Set((ideasRes.data ?? []).map(idea => idea.id))
  const capabilityLinksByIdea = new Map<string, RoadmapIdeaCapabilityLink[]>()
  for (const row of ideaCapabilityLinksRes.data ?? []) if (ideaIds.has(row.idea_id)) {
    const link: RoadmapIdeaCapabilityLink = { ...row, relationship_type: row.relationship_type as RoadmapIdeaCapabilityLink["relationship_type"], capability: capabilityById.get(row.roadmap_item_id) ?? null }
    capabilityLinksByIdea.set(row.idea_id, [...(capabilityLinksByIdea.get(row.idea_id) ?? []), link])
  }
  const toolLinksByIdea = new Map<string, RoadmapIdeaToolLink[]>()
  for (const row of ideaToolLinksRes.data ?? []) if (ideaIds.has(row.idea_id)) {
    const link: RoadmapIdeaToolLink = { ...row, relationship_type: row.relationship_type as RoadmapIdeaToolLink["relationship_type"], tool: toolById.get(row.tool_id) ?? null }
    toolLinksByIdea.set(row.idea_id, [...(toolLinksByIdea.get(row.idea_id) ?? []), link])
  }
  const agentLinksByIdea = new Map<string, RoadmapIdeaAgentLink[]>()
  for (const row of ideaAgentLinksRes.data ?? []) if (ideaIds.has(row.idea_id)) {
    const link: RoadmapIdeaAgentLink = { ...row, relationship_type: row.relationship_type as RoadmapIdeaAgentLink["relationship_type"], agent: agentById.get(row.agent_id) ?? null }
    agentLinksByIdea.set(row.idea_id, [...(agentLinksByIdea.get(row.idea_id) ?? []), link])
  }
  const skillLinksByIdea = new Map<string, RoadmapIdeaSkillLink[]>()
  for (const row of ideaSkillLinksRes.data ?? []) if (ideaIds.has(row.idea_id)) {
    const link: RoadmapIdeaSkillLink = { ...row, skill: skillById.get(row.agent_skill_id) ?? null }
    skillLinksByIdea.set(row.idea_id, [...(skillLinksByIdea.get(row.idea_id) ?? []), link])
  }
  const activityByIdea = new Map<string, RoadmapIdeaActivity[]>()
  for (const row of ideaActivityRes.data ?? []) if (ideaIds.has(row.idea_id)) {
    const activity: RoadmapIdeaActivity = { ...row, metadata: record(row.metadata) }
    activityByIdea.set(row.idea_id, [...(activityByIdea.get(row.idea_id) ?? []), activity])
  }
  const ideas: RoadmapIdea[] = (ideasRes.data ?? []).map(row => ({
    ...row, category: row.category as RoadmapIdea["category"], potential_value: row.potential_value as RoadmapIdea["potential_value"], complexity: row.complexity as RoadmapIdea["complexity"], status: row.status as RoadmapIdea["status"],
    promotion_metadata: record(row.promotion_metadata), metadata: record(row.metadata), capabilityLinks: capabilityLinksByIdea.get(row.id) ?? [], toolLinks: toolLinksByIdea.get(row.id) ?? [], agentLinks: agentLinksByIdea.get(row.id) ?? [], skillLinks: skillLinksByIdea.get(row.id) ?? [], activity: (activityByIdea.get(row.id) ?? []).slice(0, 12),
  }))
  const releases = buildReleaseSummaries(phases, items)
  const activeRelease = releases.find(release => release.phase.release_status === "active") ?? releases[0]
  const activeItems = activeRelease ? items.filter(item => item.phase_id === activeRelease.phase.id && item.item_type !== "capability") : []
  const dependencyReady = (item: RoadmapItem) => !dependencies.some(dependency => dependency.item_id === item.id && items.find(candidate => candidate.id === dependency.depends_on_item_id)?.status !== "completed")
  const currentItem = activeItems
    .filter(item => item.is_focus && item.status !== "completed" && item.status !== "blocked" && item.status !== "idea" && item.status !== "deferred")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.progress - a.progress)[0]
    ?? null
  const nextItem = activeItems
    .filter(item => item.id !== currentItem?.id && item.status !== "completed" && item.status !== "idea" && item.status !== "deferred" && item.status !== "blocked" && dependencyReady(item))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.progress - a.progress || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
    ?? null
  const allCommittedImplementation = items.filter(item => item.parent_item_id && isCommitted(item))
  const totalWeight = allCommittedImplementation.reduce((sum, item) => sum + item.weight, 0)
  const completedWeight = allCommittedImplementation.filter(item => item.status === "completed").reduce((sum, item) => sum + item.weight, 0)
  const releaseWeight = releases.reduce((sum, release) => sum + release.phase.weight, 0)
  const totalProgress = releaseWeight ? Math.round(releases.reduce((sum, release) => sum + release.phase.weight * release.progress, 0) / releaseWeight) : 0
  const completedMilestones = items.filter(item => item.status === "completed" && (item.item_type === "milestone" || item.metadata.legacy_item_type === "milestone"))

  return {
    project: project as RoadmapProject,
    phases,
    items,
    dependencies,
    activity: (activityRes.data ?? []) as RoadmapActivity[],
    ideas,
    ideaOptions: { tools: toolOptions, agents: agentOptions, skills: skillOptions },
    releases,
    totalProgress,
    completedWeight,
    totalWeight,
    buildPoints: completedWeight * 100,
    currentMission: missionForItem(currentItem, releases),
    nextMissionDetail: missionForItem(nextItem, releases),
    nextMission: nextItem,
    activeBlockers: items.filter(item => item.status === "blocked"),
    completedMilestones,
  }
}

async function requireItem(itemId: string) {
  if (!isUuid(itemId)) throw new RoadmapError("Invalid roadmap item.")
  const { data, error } = await db.from("roadmap_items").select(itemColumns).eq("id", itemId).maybeSingle()
  if (error || !data) throw new RoadmapError("Roadmap item not found.", 404)
  return normalizeItem(data)
}

type CreateRoadmapInput = {
  projectId: string; phaseId: string; parentItemId?: string | null; title: string; description?: string; itemType?: string
  priority?: string; status?: string; completionCondition?: string; whyItMatters?: string; isAddon?: boolean
}

export async function createRoadmapItem(input: CreateRoadmapInput) {
  if (!isUuid(input.projectId) || !isUuid(input.phaseId) || !input.title.trim()) throw new RoadmapError("A project, release, and title are required.")
  const itemType = input.itemType ?? "implementation"
  if (!["capability", "implementation", "idea", "feature", "task", "technical_debt", "milestone"].includes(itemType)) throw new RoadmapError("Invalid roadmap item type.")
  const { data: phase } = await db.from("roadmap_phases").select("id, project_id, release_status").eq("id", input.phaseId).maybeSingle()
  if (!phase || phase.project_id !== input.projectId) throw new RoadmapError("Roadmap release does not belong to this project.")
  if (["archived", "legacy"].includes(phase.release_status)) throw new RoadmapError("New roadmap work must belong to an active Marketing OS release.")

  let parentItemId: string | null = input.parentItemId || null
  if (itemType === "capability") parentItemId = null
  if (parentItemId) {
    const parent = await requireItem(parentItemId)
    if (parent.project_id !== input.projectId || parent.phase_id !== input.phaseId || parent.item_type !== "capability") {
      throw new RoadmapError("Implementation work must belong to a capability in the selected release.")
    }
  } else if (!["capability", "idea"].includes(itemType)) {
    throw new RoadmapError("Select a capability for this implementation item.")
  }
  const metadata = {
    ...(input.whyItMatters ? { why_it_matters: input.whyItMatters.trim() } : {}),
    ...(input.completionCondition ? { completion_condition: input.completionCondition.trim() } : {}),
    ...(input.isAddon ? { is_addon: true } : {}),
  }
  const slug = `${input.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "roadmap-item"}-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await db.from("roadmap_items").insert({
    project_id: input.projectId,
    phase_id: input.phaseId,
    parent_item_id: parentItemId,
    slug,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    item_type: itemType,
    priority: input.priority ?? "medium",
    status: input.status ?? (itemType === "idea" ? "idea" : "planned"),
    metadata,
  }).select(itemColumns).single()
  if (error || !data) throw new RoadmapError("Unable to create roadmap item.", 500)
  await db.from("roadmap_activity").insert({ project_id: input.projectId, item_id: data.id, action_type: "created", description: `Created ${data.title}`, metadata: { item_type: itemType } })
  return normalizeItem(data)
}

export async function updateRoadmapItem(itemId: string, expectedUpdatedAt: string, patch: Record<string, unknown>) {
  if (!expectedUpdatedAt) throw new RoadmapError("The current item version is required.")
  const current = await requireItem(itemId)
  const nextPatch = { ...patch }

  // Capability completion is derived from committed child implementation work.
  if (current.item_type === "capability") {
    delete nextPatch.progress
    if (nextPatch.status === "completed") {
      const { data: children, error: childrenError } = await db
        .from("roadmap_items")
        .select("id, status")
        .eq("parent_item_id", current.id)
      if (childrenError) throw new RoadmapError("Unable to verify capability completion.", 500)
      const committedChildren = (children ?? []).filter(child => !["idea", "deferred"].includes(child.status))
      if (!committedChildren.length || committedChildren.some(child => child.status !== "completed")) {
        throw new RoadmapError("Complete every committed implementation item before completing this capability.")
      }
    }
  }
  const { data, error } = await db.rpc("roadmap_update_item", { p_item_id: itemId, p_expected_updated_at: expectedUpdatedAt, p_patch: nextPatch })
  if (error) {
    if (error.message.includes("STALE")) throw new RoadmapError("This item changed elsewhere. Refresh and try again.", 409)
    throw new RoadmapError(error.message.includes("ROADMAP_") ? error.message.replace("ROADMAP_", "").replaceAll("_", " ") : "Unable to update roadmap item.")
  }
  return normalizeItem(data as unknown as Record<string, unknown>)
}

export async function addRoadmapDependency(itemId: string, dependencyId: string) {
  const { error } = await db.rpc("roadmap_add_dependency", { p_item_id: itemId, p_depends_on_item_id: dependencyId })
  if (error) throw new RoadmapError(error.message.includes("ROADMAP_") ? error.message.replace("ROADMAP_", "").replaceAll("_", " ") : "Unable to add dependency.")
}

export async function removeRoadmapDependency(dependencyId: string) {
  if (!isUuid(dependencyId)) throw new RoadmapError("Invalid dependency.")
  const { data, error } = await db.from("roadmap_dependencies").delete().eq("id", dependencyId).select("id, item_id").maybeSingle()
  if (error || !data) throw new RoadmapError("Unable to remove dependency.", 500)
  const item = await requireItem(data.item_id)
  await db.from("roadmap_activity").insert({ project_id: item.project_id, item_id: item.id, action_type: "dependency_removed", description: `Removed a dependency from ${item.title}`, metadata: {} })
}

export async function archiveRoadmapItem(itemId: string, expectedUpdatedAt: string) {
  return updateRoadmapItem(itemId, expectedUpdatedAt, { status: "deferred", is_focus: false })
}

type IdeaLinkPayload = {
  capabilityLinks?: Array<{ roadmap_item_id: string; relationship_type?: string }>
  toolLinks?: Array<{ tool_id: string; relationship_type?: string }>
  agentLinks?: Array<{ agent_id: string; relationship_type?: string }>
  skillIds?: string[]
}

function ideaPayload(input: Record<string, unknown>) {
  const category = input.category ?? "other"
  const status = input.status ?? "idea"
  const potentialValue = input.potential_value ?? "medium"
  const complexity = input.complexity ?? "medium"
  if (!text(input.title)) throw new RoadmapError("An Idea title is required.")
  if (!isRoadmapIdeaCategory(category) || !isRoadmapIdeaStatus(status) || !isRoadmapIdeaValue(potentialValue) || !isRoadmapIdeaValue(complexity)) throw new RoadmapError("Idea category or status is invalid.")
  const phaseId = optionalText(input.potential_phase_id)
  if (phaseId && !isUuid(phaseId)) throw new RoadmapError("Idea OS assignment is invalid.")
  return {
    title: text(input.title), description: optionalText(input.description), category, potential_phase_id: phaseId,
    potential_value: potentialValue, complexity, status, dependency_notes: optionalText(input.dependency_notes), notes: optionalText(input.notes),
    metadata: record(input.metadata) ? input.metadata : {},
  }
}

async function replaceIdeaLinks(idea: RoadmapIdea, links: IdeaLinkPayload) {
  const capabilityLinks = Array.isArray(links.capabilityLinks) ? links.capabilityLinks : []
  const toolLinks = Array.isArray(links.toolLinks) ? links.toolLinks : []
  const agentLinks = Array.isArray(links.agentLinks) ? links.agentLinks : []
  const skillIds = uuidList(links.skillIds)
  const validateRows = <T extends Record<string, unknown>>(rows: T[], idKey: keyof T, types: string[], label: string) => {
    const seen = new Set<string>()
    return rows.map(row => {
      const id = text(row[idKey])
      const relationshipType = text(row.relationship_type, "candidate_for")
      if (!isUuid(id) || !types.includes(relationshipType)) throw new RoadmapError(`${label} link is invalid.`)
      const key = `${id}:${relationshipType}`
      if (seen.has(key)) throw new RoadmapError(`Duplicate ${label} link.`)
      seen.add(key)
      return { id, relationship_type: relationshipType }
    })
  }
  const capabilities = validateRows(capabilityLinks, "roadmap_item_id", ["related", "dependency", "candidate_for"], "Capability")
  const tools = validateRows(toolLinks, "tool_id", ["dependency", "candidate_for", "research_source"], "Tool")
  const agents = validateRows(agentLinks, "agent_id", ["owner", "candidate_for", "research_support"], "Agent")
  if (capabilities.length) {
    const { data, error } = await db.from("roadmap_items").select("id,project_id,item_type").in("id", capabilities.map(link => link.id))
    if (error || (data ?? []).length !== capabilities.length || (data ?? []).some(item => item.project_id !== idea.project_id || item.item_type !== "capability")) throw new RoadmapError("Every linked Roadmap record must be a capability in this project.")
  }
  if (tools.length) {
    const { data, error } = await db.from("tool_registry").select("id").in("id", tools.map(link => link.id))
    if (error || (data ?? []).length !== tools.length) throw new RoadmapError("Every linked Tool must exist.")
  }
  if (agents.length) {
    const { data, error } = await db.from("agents").select("id").in("id", agents.map(link => link.id))
    if (error || (data ?? []).length !== agents.length) throw new RoadmapError("Every linked Agent must exist.")
  }
  if (skillIds.length) {
    const { data, error } = await db.from("agent_skills").select("id").in("id", skillIds)
    if (error || (data ?? []).length !== skillIds.length) throw new RoadmapError("Every linked Skill must exist.")
  }
  const deletes = await Promise.all([
    db.from("roadmap_idea_capability_links").delete().eq("idea_id", idea.id),
    db.from("roadmap_idea_tool_links").delete().eq("idea_id", idea.id),
    db.from("roadmap_idea_agent_links").delete().eq("idea_id", idea.id),
    db.from("roadmap_idea_skill_links").delete().eq("idea_id", idea.id),
  ])
  if (deletes.some(result => result.error)) throw new RoadmapError("Unable to update Idea links.", 500)
  const inserts = await Promise.all([
    capabilities.length ? db.from("roadmap_idea_capability_links").insert(capabilities.map(link => ({ idea_id: idea.id, roadmap_item_id: link.id, relationship_type: link.relationship_type }))) : Promise.resolve({ error: null }),
    tools.length ? db.from("roadmap_idea_tool_links").insert(tools.map(link => ({ idea_id: idea.id, tool_id: link.id, relationship_type: link.relationship_type }))) : Promise.resolve({ error: null }),
    agents.length ? db.from("roadmap_idea_agent_links").insert(agents.map(link => ({ idea_id: idea.id, agent_id: link.id, relationship_type: link.relationship_type }))) : Promise.resolve({ error: null }),
    skillIds.length ? db.from("roadmap_idea_skill_links").insert(skillIds.map(agent_skill_id => ({ idea_id: idea.id, agent_skill_id }))) : Promise.resolve({ error: null }),
  ])
  if (inserts.some(result => result.error)) throw new RoadmapError("Unable to save Idea links.", 500)
}

export async function createRoadmapIdea(projectId: string, input: Record<string, unknown>) {
  if (!isUuid(projectId)) throw new RoadmapError("Invalid Roadmap project.")
  const payload = ideaPayload(input)
  const { data, error } = await db.rpc("roadmap_create_idea", { p_project_id: projectId, p_payload: payload })
  if (error || !data) throw new RoadmapError(error?.message.includes("DUPLICATE") ? "An Idea with this title already exists." : "Unable to capture Idea.", error?.message.includes("DUPLICATE") ? 409 : 500)
  const created = { ...data, capabilityLinks: [], toolLinks: [], agentLinks: [], skillLinks: [], activity: [] } as RoadmapIdea
  await replaceIdeaLinks(created, input as IdeaLinkPayload)
  return loadRoadmapSnapshot()
}

export async function updateRoadmapIdea(ideaId: string, expectedUpdatedAt: string, input: Record<string, unknown>) {
  if (!isUuid(ideaId) || !expectedUpdatedAt) throw new RoadmapError("Idea update request is invalid.")
  const snapshot = await loadRoadmapSnapshot()
  const existing = snapshot.ideas.find(idea => idea.id === ideaId)
  if (!existing) throw new RoadmapError("Idea not found.", 404)
  if (existing.updated_at !== expectedUpdatedAt) throw new RoadmapError("This Idea changed elsewhere. Refresh before saving your edits.", 409)
  const payload = ideaPayload(input)
  const { data, error } = await db.rpc("roadmap_update_idea", { p_idea_id: ideaId, p_expected_updated_at: expectedUpdatedAt, p_payload: payload })
  if (error || !data) throw new RoadmapError(error?.message.includes("STALE") ? "This Idea changed elsewhere. Refresh before saving your edits." : error?.message.includes("DUPLICATE") ? "An Idea with this title already exists." : "Unable to save Idea.", error?.message.includes("STALE") || error?.message.includes("DUPLICATE") ? 409 : 500)
  await replaceIdeaLinks({ ...data, capabilityLinks: [], toolLinks: [], agentLinks: [], skillLinks: [], activity: [] } as RoadmapIdea, input as IdeaLinkPayload)
  return loadRoadmapSnapshot()
}

export async function promoteRoadmapIdea(ideaId: string, expectedUpdatedAt: string, input: Record<string, unknown>) {
  if (!isUuid(ideaId) || !expectedUpdatedAt || !isUuid(text(input.phase_id))) throw new RoadmapError("A current Idea version and target OS are required.")
  const itemType = text(input.item_type, "capability")
  const parentItemId = optionalText(input.parent_item_id)
  if (itemType === "implementation" && (!parentItemId || !isUuid(parentItemId))) throw new RoadmapError("Choose a target capability for implementation work.")
  const { error } = await db.rpc("roadmap_promote_idea", {
    p_idea_id: ideaId, p_expected_updated_at: expectedUpdatedAt, p_phase_id: text(input.phase_id), p_parent_item_id: itemType === "capability" ? null : parentItemId,
    p_item_type: itemType, p_priority: text(input.priority, "medium"), p_title: text(input.title), p_description: text(input.description), p_dependency_ids: uuidList(input.dependency_ids),
  })
  if (error) throw new RoadmapError(error.message.includes("STALE") ? "This Idea changed elsewhere. Refresh before promoting it." : error.message.includes("PARENT") ? "Choose a valid capability in the selected OS." : "Unable to promote Idea.", error.message.includes("STALE") ? 409 : 500)
  return loadRoadmapSnapshot()
}
