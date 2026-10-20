import "server-only"

import { clientBrainV2ServerClient as db, isUuid } from "@/lib/client-brain-v2-server-core"
import {
  isToolCategory, isToolConnectionStatus, isToolDecisionStatus, isToolHealthStatus, isToolRelationshipType, isToolType, isToolUsageStatus,
  type ToolCapabilityLink, type ToolRecord, type ToolRegistrySnapshot, type ToolWithRelations,
} from "@/lib/tools"

export class ToolRegistryError extends Error { constructor(message: string, public status = 400) { super(message) } }

const toolColumns = "id,slug,name,provider,category,tool_type,description,jarvis_usage,why_we_use,usage_status,connection_status,health_status,potential_value,decision_status,logo_key,official_website,documentation_url,developer_docs_url,configuration_summary,alternatives,notes,os_release_overrides,is_core,last_verified_at,created_at,updated_at"
const activityColumns = "id,tool_id,action_type,description,metadata,created_at"

function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback }
function optionalText(value: unknown) { const result = text(value); return result || null }
function stringList(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))] : [] }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)) }
function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) }
function normalizeTool(row: Record<string, unknown>): ToolRecord {
  return { ...row, alternatives: stringList(row.alternatives), os_release_overrides: stringList(row.os_release_overrides) } as ToolRecord
}

export async function loadToolRegistrySnapshot(): Promise<ToolRegistrySnapshot> {
  const [toolsRes, linksRes, activitiesRes, capabilitiesRes] = await Promise.all([
    db.from("tool_registry").select(toolColumns).order("is_core", { ascending: false }).order("name"),
    db.from("tool_capability_links").select("id,tool_id,roadmap_item_id,relationship_type"),
    db.from("tool_activity").select(activityColumns).order("created_at", { ascending: false }).limit(240),
    db.from("roadmap_items").select("id,slug,title,phase_id,item_type").eq("item_type", "capability"),
  ])
  if (toolsRes.error || linksRes.error || activitiesRes.error || capabilitiesRes.error) throw new ToolRegistryError("Tool Registry records could not be loaded.", 500)
  const phaseIds = [...new Set((capabilitiesRes.data ?? []).map(item => item.phase_id).filter(Boolean))]
  const phasesRes = phaseIds.length ? await db.from("roadmap_phases").select("id,slug,name").in("id", phaseIds) : { data: [], error: null }
  if (phasesRes.error) throw new ToolRegistryError("Roadmap release metadata could not be loaded.", 500)
  const capabilities = (capabilitiesRes.data ?? []).map(item => {
    const phase = (phasesRes.data ?? []).find(candidate => candidate.id === item.phase_id)
    return { id: item.id, slug: item.slug, title: item.title, os_slug: phase?.slug ?? "", os_name: phase?.name ?? "Unassigned" }
  }).filter(item => item.os_slug)
  const capabilityById = new Map(capabilities.map(item => [item.id, item]))
  const linksByTool = new Map<string, ToolCapabilityLink[]>()
  for (const item of linksRes.data ?? []) {
    const link: ToolCapabilityLink = { ...item, relationship_type: item.relationship_type as ToolCapabilityLink["relationship_type"], capability: capabilityById.get(item.roadmap_item_id) ?? null }
    linksByTool.set(item.tool_id, [...(linksByTool.get(item.tool_id) ?? []), link])
  }
  const activityByTool = new Map<string, ToolWithRelations["activity"]>()
  for (const item of activitiesRes.data ?? []) activityByTool.set(item.tool_id, [...(activityByTool.get(item.tool_id) ?? []), { ...item, metadata: record(item.metadata) ? item.metadata : {} }])
  const tools = (toolsRes.data ?? []).map(row => {
    const base = normalizeTool(row)
    const capabilityLinks = linksByTool.get(base.id) ?? []
    const osSlugs = [...new Set([...base.os_release_overrides, ...capabilityLinks.map(link => link.capability?.os_slug).filter((slug): slug is string => Boolean(slug))])]
    return { ...base, capabilityLinks, activity: (activityByTool.get(base.id) ?? []).slice(0, 12), osSlugs }
  })
  return { tools, capabilities, generatedAt: new Date().toISOString() }
}

function normalizeInput(input: Record<string, unknown>, existing?: ToolRecord) {
  const optional = (key: string, fallback: string | null | undefined) => input[key] !== undefined ? optionalText(input[key]) : fallback ?? null
  const name = text(input.name, existing?.name ?? "")
  const slug = slugify(text(input.slug, existing?.slug ?? name))
  const category = input.category ?? existing?.category
  const toolType = input.tool_type ?? existing?.tool_type
  const usageStatus = input.usage_status ?? existing?.usage_status
  const connectionStatus = input.connection_status ?? existing?.connection_status
  const healthStatus = input.health_status ?? existing?.health_status
  const decisionStatus = input.decision_status === "" ? null : input.decision_status ?? existing?.decision_status ?? null
  const potentialValue = input.potential_value === "" ? null : input.potential_value ?? existing?.potential_value ?? null
  if (!name || !slug) throw new ToolRegistryError("Tool name is required.")
  if (!isToolCategory(category) || !isToolType(toolType) || !isToolUsageStatus(usageStatus) || !isToolConnectionStatus(connectionStatus) || !isToolHealthStatus(healthStatus)) throw new ToolRegistryError("Tool category or status is invalid.")
  if (decisionStatus !== null && !isToolDecisionStatus(decisionStatus)) throw new ToolRegistryError("Explore decision status is invalid.")
  if (potentialValue !== null && !["high", "medium", "low"].includes(String(potentialValue))) throw new ToolRegistryError("Potential value is invalid.")
  const description = text(input.description, existing?.description ?? "")
  if (!description) throw new ToolRegistryError("A concise tool description is required.")
  return {
    slug, name, provider: optional("provider", existing?.provider), category, tool_type: toolType, description,
    jarvis_usage: optional("jarvis_usage", existing?.jarvis_usage), why_we_use: optional("why_we_use", existing?.why_we_use),
    usage_status: usageStatus, connection_status: connectionStatus, health_status: healthStatus, potential_value: potentialValue,
    decision_status: decisionStatus, logo_key: optional("logo_key", existing?.logo_key),
    official_website: optional("official_website", existing?.official_website), documentation_url: optional("documentation_url", existing?.documentation_url),
    developer_docs_url: optional("developer_docs_url", existing?.developer_docs_url),
    configuration_summary: optional("configuration_summary", existing?.configuration_summary),
    alternatives: input.alternatives !== undefined ? stringList(input.alternatives) : existing?.alternatives ?? [], notes: optional("notes", existing?.notes),
    os_release_overrides: input.os_release_overrides !== undefined ? stringList(input.os_release_overrides) : existing?.os_release_overrides ?? [],
    is_core: typeof input.is_core === "boolean" ? input.is_core : existing?.is_core ?? false,
    last_verified_at: input.last_verified_at === "" ? null : (optionalText(input.last_verified_at) ?? existing?.last_verified_at ?? null),
  }
}

async function replaceCapabilityLinks(toolId: string, capabilityLinks: unknown) {
  if (!Array.isArray(capabilityLinks)) return
  const seen = new Set<string>()
  const rows = capabilityLinks.map(value => {
    if (!record(value) || !isUuid(text(value.roadmap_item_id)) || !isToolRelationshipType(value.relationship_type)) throw new ToolRegistryError("Capability link is invalid.")
    const key = `${value.roadmap_item_id}:${value.relationship_type}`
    if (seen.has(key)) throw new ToolRegistryError("Duplicate capability link.")
    seen.add(key)
    return { tool_id: toolId, roadmap_item_id: text(value.roadmap_item_id), relationship_type: value.relationship_type }
  })
  const ids = rows.map(row => row.roadmap_item_id)
  if (ids.length) {
    const { data, error } = await db.from("roadmap_items").select("id,item_type").in("id", ids)
    if (error || (data ?? []).length !== ids.length || (data ?? []).some(item => item.item_type !== "capability")) throw new ToolRegistryError("Every linked Roadmap record must be a valid capability.")
  }
  const removed = await db.from("tool_capability_links").delete().eq("tool_id", toolId)
  if (removed.error) throw new ToolRegistryError("Unable to update tool capability links.", 500)
  if (rows.length) {
    const inserted = await db.from("tool_capability_links").insert(rows)
    if (inserted.error) throw new ToolRegistryError("Unable to add tool capability links.", 500)
  }
}

export async function createTool(input: Record<string, unknown>) {
  const values = normalizeInput(input)
  const { data, error } = await db.from("tool_registry").insert(values).select(toolColumns).single()
  if (error || !data) throw new ToolRegistryError(error?.code === "23505" ? "A Tool with this slug already exists." : "Unable to create Tool.", error?.code === "23505" ? 409 : 500)
  await replaceCapabilityLinks(data.id, input.capabilityLinks)
  await db.from("tool_activity").insert({ tool_id: data.id, action_type: "created", description: `Added ${data.name} to the Tool Registry.`, metadata: {} })
  return loadToolRegistrySnapshot()
}

export async function updateTool(toolId: string, expectedUpdatedAt: string, input: Record<string, unknown>) {
  if (!isUuid(toolId) || !expectedUpdatedAt) throw new ToolRegistryError("Tool update request is invalid.")
  const currentResult = await db.from("tool_registry").select(toolColumns).eq("id", toolId).maybeSingle()
  if (currentResult.error || !currentResult.data) throw new ToolRegistryError("Tool not found.", 404)
  const current = normalizeTool(currentResult.data)
  if (current.updated_at !== expectedUpdatedAt) throw new ToolRegistryError("This Tool changed elsewhere. Refresh before saving your edits.", 409)
  const values = normalizeInput(input, current)
  const { data, error } = await db.from("tool_registry").update(values).eq("id", toolId).eq("updated_at", expectedUpdatedAt).select(toolColumns).maybeSingle()
  if (error) throw new ToolRegistryError("Unable to save Tool changes.", 500)
  if (!data) throw new ToolRegistryError("This Tool changed elsewhere. Refresh before saving your edits.", 409)
  await replaceCapabilityLinks(toolId, input.capabilityLinks)
  const action = current.usage_status !== data.usage_status && data.usage_status === "planned" ? "promoted" : current.decision_status !== data.decision_status && data.decision_status === "rejected" ? "rejected" : "updated"
  await db.from("tool_activity").insert({ tool_id: toolId, action_type: action, description: action === "promoted" ? `Promoted ${data.name} to Planned.` : action === "rejected" ? `Marked ${data.name} as rejected.` : `Updated ${data.name}.`, metadata: { usage_status: data.usage_status, connection_status: data.connection_status } })
  return loadToolRegistrySnapshot()
}
