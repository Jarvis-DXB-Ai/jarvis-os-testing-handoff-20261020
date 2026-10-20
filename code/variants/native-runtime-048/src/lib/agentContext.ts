// Shared context fetching for Agent Context Preview + Prompt Assembly
// Both components consume CtxData — fetched once by the task page.
// Phase 1 Intelligence Layer additions:
//   - PlatformRule (L0: universal platform specs)
//   - BrandPlaybookEntry (L1/L2: brand DNA per workspace/client)
//   - TokenBudget (context injection budget config per agent/task type)

import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskRef = {
  id: string
  title: string
  description: string | null
  assigned_agent: string | null
  command_id: string | null
  plan_id: string | null
  deliverable_id: string | null
  status: string
}

export type Command = {
  id: string
  raw_message: string
  interpreted_intent: string | null
  client_id: string | null
  monthly_cycle_id: string | null
  deliverable_id: string | null
}

export type Plan = {
  id: string
  plan_title: string | null
  plan_summary: string | null
  steps: unknown
}

export type AgentRecord = {
  id: string
  agent_name: string
  agent_type: string | null
  default_model: string | null
  capabilities: string[] | null
}

export type Skill = {
  id: string
  name: string
  description: string | null
  category: string | null
  instructions: string | null
  promotedLessons: string[]
}

export type KnowledgeRecord = {
  id: string
  category: string
  title: string
  content: string
  importance: number
}

export type ResearchItem = {
  id: string
  title: string
  category: string | null
  source_type: string | null
  key_insights: string | null
  link_type: string | null
}

export type Deliverable = {
  id: string
  title: string
  type: string
  status: string
  platform: string | null
  client_id: string | null
  monthly_cycle_id: string | null
}

export type Revision = {
  id: string
  revision_notes: string | null
  created_at: string
}

export type Cycle = {
  id: string
  month: string
  year: number
  status: string
}

// ── Intelligence Layer types (Phase 1) ────────────────────────────────────────

export type PlatformRule = {
  id: string
  platform: string
  rule_type: string
  title: string
  content_full: string
  content_summary: string | null
  content_essence: string | null
  importance: number
}

export type BrandPlaybookEntry = {
  id: string
  section: string
  title: string
  content_full: string
  content_summary: string | null
  content_essence: string | null
  importance: number
  scope: "workspace" | "client"  // resolved at fetch time
  // Relevance metadata — parsed from metadata jsonb column
  metadata: Record<string, unknown> | null
}

export type TokenBudgetAllocation = {
  agent_philosophy:    number
  platform_rules:      number
  brand_voice:         number
  client_rules:        number
  client_knowledge:    number
  lessons:             number
  exemplars:           number   // legacy placeholder — keep for DB compat
  patterns:            number   // research / content patterns
  cycle_context:       number
  successful_examples: number   // Phase 2: learning exemplars injection
  avoid_patterns:      number   // Phase 2: rejection patterns injection
}

export type TokenBudget = {
  total_budget: number
  allocation: TokenBudgetAllocation
}

// Defaults (matches system seed in token_budgets migration)
// DB-stored allocations are merged over these — new keys fall back to defaults.
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  total_budget: 4000,
  allocation: {
    agent_philosophy:    250,
    platform_rules:      150,
    brand_voice:         350,
    client_rules:        150,
    client_knowledge:    450,
    lessons:             200,
    exemplars:           0,    // legacy — unused
    patterns:            150,
    cycle_context:       300,
    successful_examples: 400,  // up to 3 exemplars
    avoid_patterns:      250,  // up to 3 rejection patterns
  },
}

// ── Phase 2: Learning Layer types ─────────────────────────────────────────────

// Match reason determines injection priority (client_skill = highest specificity)
export type LearningMatchReason = "client_skill" | "client" | "skill" | "agent"

export type SuccessfulOutputRecord = {
  id: string
  output_type: string | null
  title: string | null
  content: string
  why_successful: string | null
  reusable_pattern: string | null
  client_id: string | null
  skill_id: string | null
  agent_id: string | null
  match_reason: LearningMatchReason
}

export type RejectionPatternRecord = {
  id: string
  issue_type: string | null
  description: string
  correction: string | null
  severity: number
  recurrence_count: number
  client_id: string | null
  skill_id: string | null
  agent_id: string | null
  match_reason: LearningMatchReason
}

// ── Full context payload ───────────────────────────────────────────────────────

export type CtxData = {
  command:           Command | null
  plan:              Plan | null
  agent:             AgentRecord | null
  skills:            Skill[]
  clientName:        string | null
  clientId:          string | null
  workspaceId:       string | null
  cycleName:         string | null
  cycleId:           string | null
  knowledge:         KnowledgeRecord[]
  research:          ResearchItem[]
  deliverable:       Deliverable | null
  revisions:         Revision[]
  // Phase 1 Intelligence Layer
  platformRules:     PlatformRule[]
  brandPlaybook:     BrandPlaybookEntry[]
  tokenBudget:       TokenBudget
  // Phase 2 Learning Layer
  successfulOutputs: SuccessfulOutputRecord[]
  rejectionPatterns: RejectionPatternRecord[]
  // Phase 3: Relevance Engine + Output Optimization
  efficiencyMode:    import("@/lib/relevanceEngine").EfficiencyMode
  outputMode:        import("@/lib/outputConfig").OutputMode
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchAgentContext(task: TaskRef): Promise<CtxData> {
  // 1 — Command
  let command: Command | null = null
  if (task.command_id) {
    const { data } = await supabase
      .from("telegram_commands")
      .select("id, raw_message, interpreted_intent, client_id, monthly_cycle_id, deliverable_id")
      .eq("id", task.command_id).single()
    command = data ?? null
  }

  // 2 — Plan
  let plan: Plan | null = null
  if (task.plan_id) {
    const { data } = await supabase
      .from("command_plans")
      .select("id, plan_title, plan_summary, steps")
      .eq("id", task.plan_id).single()
    plan = data ?? null
  }

  // 3 — Deliverable + revisions
  const deliverableId = task.deliverable_id ?? command?.deliverable_id ?? null
  let deliverable: Deliverable | null = null
  let revisions: Revision[] = []
  if (deliverableId) {
    const [delRes, revRes] = await Promise.all([
      supabase.from("deliverables")
        .select("id, title, type, status, platform, client_id, monthly_cycle_id")
        .eq("id", deliverableId).single(),
      supabase.from("deliverable_revisions")
        .select("id, revision_notes, created_at")
        .eq("deliverable_id", deliverableId)
        .order("created_at", { ascending: false })
        .limit(3),
    ])
    deliverable = delRes.data ?? null
    revisions   = revRes.data ?? []
  }

  // Resolve IDs
  const clientId = command?.client_id ?? deliverable?.client_id ?? null
  const cycleId  = command?.monthly_cycle_id ?? deliverable?.monthly_cycle_id ?? null
  const platform = deliverable?.platform ?? null

  // 4 — Client name + workspace + knowledge + cycle (parallel)
  let clientName:   string | null = null
  let workspaceId:  string | null = null
  let cycleName:    string | null = null
  let knowledge:    KnowledgeRecord[] = []

  const baseFetches: Promise<void>[] = []
  if (clientId) {
    baseFetches.push(
      (async () => {
        const { data } = await supabase.from("clients").select("name").eq("id", clientId).single()
        clientName = data?.name ?? null
      })()
    )
    baseFetches.push(
      (async () => {
        const { data } = await supabase.from("client_knowledge")
          .select("id, category, title, content, importance")
          .eq("client_id", clientId).eq("status", "active")
          .order("importance", { ascending: false }).limit(10)
        knowledge = data ?? []
      })()
    )
    // Resolve workspace from client
    baseFetches.push(
      (async () => {
        const { data } = await supabase.from("workspaces")
          .select("id").eq("client_id", clientId).eq("status", "active").limit(1).single()
        workspaceId = data?.id ?? null
      })()
    )
  }
  if (cycleId) {
    baseFetches.push(
      (async () => {
        const { data } = await supabase.from("monthly_cycles")
          .select("id, month, year, status").eq("id", cycleId).single()
        cycleName = data ? `${data.month} ${data.year}` : null
      })()
    )
  }
  await Promise.all(baseFetches)

  // 5 — Agent + skills (include instructions + promoted lessons)
  let agent: AgentRecord | null = null
  let skills: Skill[] = []
  if (task.assigned_agent) {
    const { data } = await supabase
      .from("agents")
      .select("id, agent_name, agent_type, default_model, capabilities")
      .eq("agent_name", task.assigned_agent).single()
    agent = data ?? null

    if (agent) {
      const { data: skillData } = await supabase
        .from("agent_skills")
        .select("id, name, description, category, instructions")
        .eq("agent_id", agent.id).eq("status", "active")

      const rawSkills = skillData ?? []
      const skillIds = rawSkills.map((s) => s.id)
      const lessonsMap: Record<string, string[]> = {}
      if (skillIds.length > 0) {
        const { data: lessonData } = await supabase
          .from("skill_lessons")
          .select("skill_id, lesson")
          .in("skill_id", skillIds)
          .eq("promoted", true).eq("status", "active")
        for (const l of lessonData ?? []) {
          if (!lessonsMap[l.skill_id]) lessonsMap[l.skill_id] = []
          lessonsMap[l.skill_id].push(l.lesson)
        }
      }
      skills = rawSkills.map((s) => ({ ...s, promotedLessons: lessonsMap[s.id] ?? [] }))
    }
  }

  // 6 — Research links (client + agent + cycle, deduped)
  const researchFilters: Array<{ field: string; id: string }> = []
  if (clientId) researchFilters.push({ field: "client_id",         id: clientId })
  if (agent?.id) researchFilters.push({ field: "agent_id",         id: agent.id })
  if (cycleId)   researchFilters.push({ field: "monthly_cycle_id", id: cycleId })

  const research: ResearchItem[] = []
  if (researchFilters.length > 0) {
    const results = await Promise.all(
      researchFilters.map(({ field, id }) =>
        supabase.from("research_links")
          .select("link_type, research_library(id, title, category, source_type, key_insights)")
          .eq(field, id)
      )
    )
    const seen = new Set<string>()
    for (const res of results) {
      for (const row of (res.data ?? []) as unknown as Array<{
        link_type: string | null
        research_library: { id: string; title: string; category: string | null; source_type: string | null; key_insights: string | null } | null
      }>) {
        const r = row.research_library
        if (r && !seen.has(r.id)) {
          seen.add(r.id)
          research.push({ ...r, link_type: row.link_type })
        }
      }
    }
  }

  // ── Phase 1: Intelligence Layer fetches (parallel) ─────────────────────────

  let platformRules:  PlatformRule[] = []
  let brandPlaybook:  BrandPlaybookEntry[] = []
  let tokenBudget:    TokenBudget = DEFAULT_TOKEN_BUDGET

  const intelFetches: Promise<void>[] = []

  // 7 — Platform rules (L0) — fetch for deliverable platform, fallback to all
  intelFetches.push(
    (async () => {
      const query = supabase.from("platform_rules")
        .select("id, platform, rule_type, title, content_full, content_summary, content_essence, importance")
        .eq("status", "active")
        .order("importance", { ascending: false })
      if (platform) query.eq("platform", platform)
      const { data } = await query.limit(12)
      platformRules = (data ?? []) as PlatformRule[]
    })()
  )

  // 8 — Brand playbook (L1 workspace + L2 client, merged with scope tag)
  if (workspaceId || clientId) {
    intelFetches.push(
      (async () => {
        const entries: BrandPlaybookEntry[] = []

        // L1: workspace-level (client_id IS NULL for this workspace)
        if (workspaceId) {
          const { data } = await supabase.from("brand_playbooks")
            .select("id, section, title, content_full, content_summary, content_essence, importance, metadata")
            .eq("workspace_id", workspaceId).is("client_id", null)
            .eq("status", "active")
            .order("importance", { ascending: false })
            .limit(15)
          for (const r of data ?? []) entries.push({ ...r, metadata: r.metadata ?? null, scope: "workspace" })
        }

        // L2: client-level (overrides workspace)
        if (clientId) {
          const { data } = await supabase.from("brand_playbooks")
            .select("id, section, title, content_full, content_summary, content_essence, importance, metadata")
            .eq("client_id", clientId)
            .eq("status", "active")
            .order("importance", { ascending: false })
            .limit(15)
          for (const r of data ?? []) entries.push({ ...r, metadata: r.metadata ?? null, scope: "client" })
        }

        brandPlaybook = entries
      })()
    )
  }

  // 9 — Token budget (agent-specific → system default fallback)
  if (agent) {
    intelFetches.push(
      (async () => {
        // Try agent-specific budget first (task_type = NULL = agent default)
        const { data } = await supabase.from("token_budgets")
          .select("total_budget, allocation")
          .eq("agent_id", agent!.id)
          .is("task_type", null)
          .single()
        if (data) {
          // Merge DB allocation over defaults so new keys (successful_examples, avoid_patterns)
          // are always populated even if old DB seeds predate them.
          tokenBudget = {
            total_budget: data.total_budget,
            allocation: {
              ...DEFAULT_TOKEN_BUDGET.allocation,
              ...(data.allocation as Partial<TokenBudgetAllocation>),
            },
          }
        } else {
          // Fall back to system default (agent_id IS NULL)
          const { data: sysData } = await supabase.from("token_budgets")
            .select("total_budget, allocation")
            .is("agent_id", null)
            .is("task_type", null)
            .single()
          if (sysData) {
            tokenBudget = {
              total_budget: sysData.total_budget,
              allocation: {
                ...DEFAULT_TOKEN_BUDGET.allocation,
                ...(sysData.allocation as Partial<TokenBudgetAllocation>),
              },
            }
          }
        }
      })()
    )
  }

  await Promise.all(intelFetches)

  // ── Phase 2: Learning Layer fetches ───────────────────────────────────────
  // Priority: client+skill > client > skill > agent. Ranked client-side. Limit 3.

  const skillIds = skills.map((s) => s.id)

  let successfulOutputs: SuccessfulOutputRecord[] = []
  let rejectionPatterns: RejectionPatternRecord[]  = []

  const hasLearningAnchor = !!(clientId || skillIds.length > 0 || agent?.id)

  if (hasLearningAnchor) {
    // Build OR filter parts
    const orParts: string[] = []
    if (clientId)           orParts.push(`client_id.eq.${clientId}`)
    if (skillIds.length > 0) orParts.push(`skill_id.in.(${skillIds.join(",")})`)
    if (agent?.id)          orParts.push(`agent_id.eq.${agent.id}`)

    const orFilter = orParts.join(",")

    const [outRes, rejRes] = await Promise.all([
      supabase
        .from("successful_outputs")
        .select("id, output_type, title, content, why_successful, reusable_pattern, client_id, skill_id, agent_id")
        .eq("status", "active")
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("rejection_patterns")
        .select("id, issue_type, description, correction, severity, recurrence_count, client_id, skill_id, agent_id")
        .eq("status", "active")
        .or(orFilter)
        .order("severity", { ascending: false })
        .order("recurrence_count", { ascending: false })
        .limit(10),
    ])

    // Rank by match specificity, take top 3
    function rankAndLimit<T extends { client_id: string | null; skill_id: string | null; agent_id: string | null }>(
      rows: T[]
    ): (T & { match_reason: LearningMatchReason })[] {
      return rows
        .map((r) => {
          const clientMatch = !!clientId && r.client_id === clientId
          const skillMatch  = skillIds.includes(r.skill_id ?? "")
          const agentMatch  = !!agent?.id && r.agent_id === agent.id
          const score = clientMatch && skillMatch ? 3
                      : clientMatch               ? 2
                      : skillMatch                ? 1
                      : agentMatch                ? 0
                      : -1
          const match_reason: LearningMatchReason =
            clientMatch && skillMatch ? "client_skill"
            : clientMatch             ? "client"
            : skillMatch              ? "skill"
            :                           "agent"
          return { ...r, _score: score, match_reason }
        })
        .filter((r) => r._score >= 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 3)
        .map(({ _score: _s, ...rest }) => rest as T & { match_reason: LearningMatchReason })
    }

    successfulOutputs = rankAndLimit(outRes.data ?? []) as SuccessfulOutputRecord[]
    rejectionPatterns = rankAndLimit(rejRes.data ?? []) as RejectionPatternRecord[]
  }

  return {
    command, plan, agent, skills,
    clientName, clientId, workspaceId,
    cycleName, cycleId,
    knowledge, research, deliverable, revisions,
    platformRules, brandPlaybook, tokenBudget,
    successfulOutputs, rejectionPatterns,
    efficiencyMode: "balanced" as import("@/lib/relevanceEngine").EfficiencyMode,
    outputMode: "concise" as import("@/lib/outputConfig").OutputMode,
  }
}

// ─── Token estimation (rough: ~4 chars/token) ─────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.replace(/\s+/g, " ").trim().length / 4)
}

export function tokenWeight(total: number): { label: string; color: string } {
  if (total < 500)  return { label: "Light",    color: "text-green-400 border-green-900 bg-green-950/20" }
  if (total < 1500) return { label: "Moderate", color: "text-yellow-400 border-yellow-900 bg-yellow-950/20" }
  return              { label: "Heavy",    color: "text-red-400 border-red-900 bg-red-950/20" }
}
