import "server-only"

import { createHash } from "crypto"

import { clientBrainV2ServerClient as db, requireClientBrainV2 } from "@/lib/client-brain-v2-server-core"
import { buildDeterministicSocialIntelligence, deterministicSocialIntelligenceRevision, type DeterministicSocialIntelligenceArtifact } from "@/lib/social-intelligence"
import { getCachedSocialPerformance } from "@/lib/social-performance-server"

type JsonRecord = Record<string, unknown>
export type SocialIntelligenceArtifactRow = {
  id: string
  client_id: string
  agent_run_id: string | null
  artifact_version: string
  data_revision: string
  period_start: string | null
  period_end: string | null
  deterministic: boolean
  model_provider: string | null
  model_name: string | null
  model_cost_usd: number
  executive_summary: string[]
  working: DeterministicSocialIntelligenceArtifact["working"]
  needs_attention: DeterministicSocialIntelligenceArtifact["needs_attention"]
  recommended_next_moves: DeterministicSocialIntelligenceArtifact["recommended_next_moves"]
  experiments: DeterministicSocialIntelligenceArtifact["experiments"]
  data_gaps: DeterministicSocialIntelligenceArtifact["data_gaps"]
  source_manifest: JsonRecord
  created_at: string
  updated_at: string
}

export type SocialIntelligenceRuntimeContext = {
  client: { id: string; name: string; industry: string | null }
  approvedClientContext: Array<{ id: string; top_section: string; subsection: string; title: string; summary: string | null; content: string | null; updated_at: string }>
  performance: Awaited<ReturnType<typeof getCachedSocialPerformance>>
  dataRevision: string
  artifact: DeterministicSocialIntelligenceArtifact
}

const artifactColumns = "id,client_id,agent_run_id,artifact_version,data_revision,period_start,period_end,deterministic,model_provider,model_name,model_cost_usd,executive_summary,working,needs_attention,recommended_next_moves,experiments,data_gaps,source_manifest,created_at,updated_at"

function hash(value: string) { return createHash("sha256").update(value).digest("hex") }
function asArtifact(value: unknown): SocialIntelligenceArtifactRow { return value as SocialIntelligenceArtifactRow }

/** Loads only the requesting client's retained Social and approved-brain context. */
export async function loadSocialIntelligenceRuntimeContext(clientId: string): Promise<SocialIntelligenceRuntimeContext> {
  const [client, performance, contextRows] = await Promise.all([
    requireClientBrainV2(clientId),
    getCachedSocialPerformance(clientId),
    db.from("client_brain_v2_records")
      .select("id,top_section,subsection,title,summary,content,updated_at")
      .eq("client_id", clientId)
      .eq("status", "approved")
      .in("top_section", ["intelligence", "brand_guidelines", "operations", "offers", "campaigns"])
      .order("updated_at", { ascending: false })
      .limit(60),
  ])
  if (contextRows.error) throw new Error("Approved Client Brain context could not be loaded.")
  const artifact = buildDeterministicSocialIntelligence(performance)
  return {
    client: { id: client.id, name: client.name, industry: client.industry },
    approvedClientContext: (contextRows.data ?? []) as SocialIntelligenceRuntimeContext["approvedClientContext"],
    performance,
    dataRevision: hash(deterministicSocialIntelligenceRevision(performance)),
    artifact,
  }
}

export async function findSocialIntelligenceArtifact(clientId: string, dataRevision?: string) {
  let query = db.from("social_intelligence_artifacts").select(artifactColumns).eq("client_id", clientId).eq("artifact_version", "v1").order("created_at", { ascending: false }).limit(1)
  if (dataRevision) query = query.eq("data_revision", dataRevision)
  const result = await query.maybeSingle()
  if (result.error) throw new Error("Social Intelligence artifact could not be loaded.")
  return result.data ? asArtifact(result.data) : null
}

export async function persistSocialIntelligenceArtifact(input: { clientId: string; agentRunId: string; context: SocialIntelligenceRuntimeContext }) {
  const existing = await findSocialIntelligenceArtifact(input.clientId, input.context.dataRevision)
  if (existing) return { artifact: existing, reused: true }
  const artifact = input.context.artifact
  const result = await db.from("social_intelligence_artifacts").insert({
    client_id: input.clientId,
    agent_run_id: input.agentRunId,
    artifact_version: artifact.artifact_version,
    data_revision: input.context.dataRevision,
    period_start: artifact.period_start,
    period_end: artifact.period_end,
    deterministic: true,
    model_provider: null,
    model_name: null,
    model_cost_usd: 0,
    executive_summary: artifact.executive_summary,
    working: artifact.working,
    needs_attention: artifact.needs_attention,
    recommended_next_moves: artifact.recommended_next_moves,
    experiments: artifact.experiments,
    data_gaps: artifact.data_gaps,
    source_manifest: artifact.source_manifest,
  }).select(artifactColumns).single()
  if (result.error || !result.data) {
    if (result.error?.code === "23505") {
      const concurrent = await findSocialIntelligenceArtifact(input.clientId, input.context.dataRevision)
      if (concurrent) return { artifact: concurrent, reused: true }
    }
    throw new Error("Social Intelligence artifact could not be persisted.")
  }
  return { artifact: asArtifact(result.data), reused: false }
}

export async function latestSocialIntelligenceArtifact(clientId: string) {
  await requireClientBrainV2(clientId)
  return findSocialIntelligenceArtifact(clientId)
}
