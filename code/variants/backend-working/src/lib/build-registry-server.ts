import "server-only"

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core"
import { loadToolRegistrySnapshot } from "@/lib/tools-server"
import type { ToolWithRelations } from "@/lib/tools"

export type BuildSkill = {
  id: string
  name: string
  category: string | null
  description: string | null
  status: string
  modelRecommendation: string | null
  instructions: string | null
  agentName: string | null
  lessons: Array<{ id: string; lesson: string; importance: number; status: string; promoted: boolean }>
  runtimeDefinitionIds: string[]
}

export type BuildModel = {
  id: string
  provider: string
  modelName: string
  displayName: string | null
  inputPricePerMillion: number | null
  outputPricePerMillion: number | null
  status: string
  referencedSkillNames: string[]
}

export type BuildRegistrySnapshot = {
  tools: ToolWithRelations[]
  skills: BuildSkill[]
  models: BuildModel[]
  generatedAt: string
}

export class BuildRegistryError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

// These runtime tables were introduced after the generated client types. They
// are read through the existing service-only client and never exposed directly
// to a browser bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildDb = db as any

export async function loadBuildRegistrySnapshot(): Promise<BuildRegistrySnapshot> {
  const [toolSnapshot, skillsResult, lessonsResult, runtimeDefinitionsResult, runtimeSkillsResult, modelsResult] = await Promise.all([
    loadToolRegistrySnapshot(),
    buildDb.from("agent_skills").select("id,agent_id,name,category,description,status,model_recommendation,instructions,agents(agent_name)").order("name"),
    buildDb.from("skill_lessons").select("id,skill_id,lesson,importance,status,promoted").order("created_at", { ascending: false }).limit(800),
    buildDb.from("agent_runtime_definitions").select("id,agent_id"),
    buildDb.from("agent_runtime_definition_skills").select("agent_runtime_definition_id,agent_skill_id"),
    buildDb.from("model_pricing").select("id,provider,model_name,display_name,input_price_per_million,output_price_per_million,status").order("provider").order("model_name"),
  ])

  if ([skillsResult, lessonsResult, runtimeDefinitionsResult, runtimeSkillsResult, modelsResult].some(result => result.error)) {
    throw new BuildRegistryError("Build registry records could not be loaded.", 500)
  }

  const lessonsBySkill = new Map<string, BuildSkill["lessons"]>()
  for (const row of lessonsResult.data ?? []) {
    const skillId = typeof row.skill_id === "string" ? row.skill_id : ""
    if (!skillId) continue
    const current = lessonsBySkill.get(skillId) ?? []
    current.push({
      id: String(row.id),
      lesson: typeof row.lesson === "string" ? row.lesson : "",
      importance: Number.isFinite(Number(row.importance)) ? Number(row.importance) : 0,
      status: typeof row.status === "string" ? row.status : "unknown",
      promoted: row.promoted === true,
    })
    lessonsBySkill.set(skillId, current)
  }

  const runtimeDefinitionIdsBySkill = new Map<string, string[]>()
  const knownRuntimeIds = new Set((runtimeDefinitionsResult.data ?? []).map((row: { id: string }) => row.id))
  for (const row of runtimeSkillsResult.data ?? []) {
    if (!knownRuntimeIds.has(row.agent_runtime_definition_id) || typeof row.agent_skill_id !== "string") continue
    runtimeDefinitionIdsBySkill.set(row.agent_skill_id, [...(runtimeDefinitionIdsBySkill.get(row.agent_skill_id) ?? []), row.agent_runtime_definition_id])
  }

  const skills: BuildSkill[] = (skillsResult.data ?? []).map((row: Record<string, unknown>) => {
    const agent = row.agents as { agent_name?: unknown } | { agent_name?: unknown }[] | null
    const agentName = Array.isArray(agent) ? agent[0]?.agent_name : agent?.agent_name
    const id = String(row.id)
    return {
      id,
      name: String(row.name ?? "Unnamed skill"),
      category: typeof row.category === "string" ? row.category : null,
      description: typeof row.description === "string" ? row.description : null,
      status: typeof row.status === "string" ? row.status : "unknown",
      modelRecommendation: typeof row.model_recommendation === "string" ? row.model_recommendation : null,
      instructions: typeof row.instructions === "string" ? row.instructions : null,
      agentName: typeof agentName === "string" ? agentName : null,
      lessons: lessonsBySkill.get(id) ?? [],
      runtimeDefinitionIds: [...new Set(runtimeDefinitionIdsBySkill.get(id) ?? [])],
    }
  })

  const models: BuildModel[] = (modelsResult.data ?? []).map((row: Record<string, unknown>) => {
    const modelName = String(row.model_name ?? "")
    return {
      id: String(row.id),
      provider: typeof row.provider === "string" ? row.provider : "Unknown provider",
      modelName,
      displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : null,
      inputPricePerMillion: row.input_price_per_million === null ? null : Number.isFinite(Number(row.input_price_per_million)) ? Number(row.input_price_per_million) : null,
      outputPricePerMillion: row.output_price_per_million === null ? null : Number.isFinite(Number(row.output_price_per_million)) ? Number(row.output_price_per_million) : null,
      status: typeof row.status === "string" ? row.status : "unknown",
      referencedSkillNames: skills.filter(skill => skill.modelRecommendation === modelName).map(skill => skill.name),
    }
  })

  return { tools: toolSnapshot.tools, skills, models, generatedAt: new Date().toISOString() }
}
