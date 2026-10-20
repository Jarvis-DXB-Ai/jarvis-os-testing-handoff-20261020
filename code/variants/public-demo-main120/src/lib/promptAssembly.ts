// Prompt Assembly — Phase 1 Intelligence Layer upgrade
//
// Changes from original:
//   - Token budget system: sections tracked against CtxData.tokenBudget
//   - Compression: content_summary → content_full fallback per record
//   - Priority-based section dropping when budget is exhausted
//   - New sections: buildPlatformRulesSection, buildBrandPlaybookSection
//   - buildContextLogPayload: structured log entry for context_logs table
//   - assembleRawPrompt now returns { prompt, sectionsLog } for logging
//
// Backward-compatible: all existing section builders still exported unchanged.

import type {
  CtxData, PlatformRule, BrandPlaybookEntry,
  TokenBudget, TokenBudgetAllocation,
  SuccessfulOutputRecord, RejectionPatternRecord,
} from "@/lib/agentContext"
import { estimateTokens } from "@/lib/agentContext"
import {
  type EfficiencyMode,
  type EfficiencyMetrics,
  type RelevanceContext,
  SECTION_CAPS,
  parseEntryMeta,
  scorePlaybookEntry,
  scorePlatformRule,
  buildRelevanceContext,
  computeEfficiencyMetrics,
} from "@/lib/relevanceEngine"
import {
  type OutputMode,
  type ReasoningVisibility,
  type CompletionEfficiencyMetrics,
  buildOutputInstructions,
  resolveOutputCap,
  scoreCompletion,
} from "@/lib/outputConfig"

export type { EfficiencyMode, EfficiencyMetrics, OutputMode, ReasoningVisibility, CompletionEfficiencyMetrics }
export { resolveOutputCap, scoreCompletion }

// ─── Token budget tracker ─────────────────────────────────────────────────────

class BudgetTracker {
  private remaining: number
  private total: number
  private used: Record<string, number> = {}

  constructor(budget: TokenBudget) {
    this.total = budget.total_budget
    this.remaining = budget.total_budget
  }

  /** Attempt to consume up to `limit` tokens for a section.
   *  Returns the truncated text and tokens used, or null if budget exhausted. */
  consume(sectionKey: string, text: string, limit: number): { text: string; tokens: number } | null {
    if (this.remaining <= 0) return null
    const tokens = estimateTokens(text)
    const allowed = Math.min(tokens, limit, this.remaining)
    if (allowed < 20) return null   // not enough budget for even a minimal section

    let result = text
    if (tokens > allowed) {
      // Truncate to approximately `allowed` tokens (4 chars/token)
      result = text.slice(0, allowed * 4).trimEnd() + " [truncated]"
    }
    const used = Math.min(allowed, estimateTokens(result))
    this.remaining -= used
    this.used[sectionKey] = (this.used[sectionKey] ?? 0) + used
    return { text: result, tokens: used }
  }

  getUsed(): Record<string, number> { return { ...this.used } }
  getTotalUsed(): number { return this.total - this.remaining }
  getRemaining(): number { return this.remaining }
  getTotal(): number { return this.total }
}

/** Pick best available representation for a record under token pressure.
 *  Priority: summary (default injection) → full (fallback if no summary) → essence (tight budget).
 *  Rationale: content_summary is the injection-optimised version per architecture spec.
 *  content_full is for display and exemplar reference, not default prompt injection. */
function bestContent(
  full: string,
  summary: string | null | undefined,
  essence: string | null | undefined,
  budget: number,
): string {
  // 1. Summary is the default injection representation — prefer it when available
  if (summary) {
    const summaryTokens = estimateTokens(summary)
    if (summaryTokens <= budget) return summary
  }
  // 2. Full content — fallback when no summary set
  const fullTokens = estimateTokens(full)
  if (fullTokens <= budget) return full
  // 3. Essence — for very tight budgets
  if (essence && estimateTokens(essence) <= budget) return essence
  // 4. Last resort: truncate full
  return full.slice(0, budget * 4).trimEnd() + "…"
}

// ─── Existing section builders (unchanged API) ────────────────────────────────

export function buildSystemRole(ctx: CtxData): string {
  const parts: string[] = []
  if (ctx.agent) {
    parts.push(
      `You are the ${ctx.agent.agent_name} — ${ctx.agent.agent_type ?? "specialist agent"} in the Jarvis OS system.`
    )
    if (ctx.agent.default_model) parts.push(`Default model: ${ctx.agent.default_model}`)
    if (ctx.agent.capabilities?.length) {
      parts.push(
        `\nCapabilities:\n${ctx.agent.capabilities.map((c) => `- ${c}`).join("\n")}`
      )
    }
  } else {
    parts.push("You are a Jarvis OS agent.")
  }

  if (ctx.skills.length > 0) {
    const skillsWithInstructions = ctx.skills.filter((s) => s.instructions)
    if (skillsWithInstructions.length > 0) {
      parts.push("\n\nSKILL INSTRUCTIONS:")
      for (const s of skillsWithInstructions) {
        parts.push(`\n[${s.name}]\n${s.instructions}`)
      }
    }
  }

  return parts.join("\n") || "No agent assigned."
}

export function buildTaskObjective(
  taskTitle: string,
  taskDescription: string | null,
  ctx: CtxData
): string {
  const parts: string[] = []
  parts.push(`TASK: ${taskTitle}`)
  if (taskDescription) parts.push(`\nDESCRIPTION:\n${taskDescription}`)
  if (ctx.command?.interpreted_intent) parts.push(`\nINTENT:\n${ctx.command.interpreted_intent}`)
  else if (ctx.command?.raw_message)   parts.push(`\nCOMMAND:\n${ctx.command.raw_message}`)
  if (ctx.plan?.plan_summary)          parts.push(`\nPLAN:\n${ctx.plan.plan_summary}`)
  if (ctx.cycleName)                   parts.push(`\nCYCLE: ${ctx.cycleName}`)
  return parts.join("\n") || "No task objective defined."
}

export function buildClientContext(ctx: CtxData): string {
  const parts: string[] = []
  if (ctx.clientName) parts.push(`CLIENT: ${ctx.clientName}`)
  if (ctx.cycleName)  parts.push(`CYCLE: ${ctx.cycleName}`)

  if (ctx.deliverable) {
    parts.push(
      `\nDELIVERABLE:\nTitle: ${ctx.deliverable.title}\nType: ${ctx.deliverable.type}${
        ctx.deliverable.platform ? ` | Platform: ${ctx.deliverable.platform}` : ""
      }\nStatus: ${ctx.deliverable.status}`
    )
  }

  if (ctx.knowledge.length > 0) {
    const grouped: Record<string, typeof ctx.knowledge> = {}
    for (const k of ctx.knowledge) {
      if (!grouped[k.category]) grouped[k.category] = []
      grouped[k.category].push(k)
    }
    parts.push("\n\nCLIENT KNOWLEDGE:")
    for (const [cat, records] of Object.entries(grouped)) {
      parts.push(`\n[${cat}]`)
      for (const r of records) {
        const imp = r.importance >= 4 ? " ⚠" : ""
        parts.push(`• ${r.title}${imp}: ${r.content}`)
      }
    }
  }
  return parts.join("\n") || "No client context available."
}

export function buildResearchContext(ctx: CtxData): string {
  if (ctx.research.length === 0) return "No linked research."
  const parts: string[] = []

  const grouped: Record<string, typeof ctx.research> = {}
  for (const r of ctx.research) {
    const key = r.link_type ?? "General"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  }

  for (const [lt, items] of Object.entries(grouped)) {
    parts.push(`[${lt.toUpperCase()}]`)
    for (const item of items) {
      parts.push(`• ${item.title}${item.category ? ` (${item.category})` : ""}`)
      if (item.key_insights) {
        const ins = item.key_insights.slice(0, 300) + (item.key_insights.length > 300 ? "…" : "")
        parts.push(`  → ${ins}`)
      }
    }
    parts.push("")
  }
  return parts.join("\n").trimEnd()
}

export function buildExecutionRules(ctx: CtxData): string {
  const parts: string[] = []

  const promotedLessons = ctx.skills.flatMap((s) =>
    s.promotedLessons.map((l) => ({ skill: s.name, lesson: l }))
  )
  if (promotedLessons.length > 0) {
    parts.push("LESSONS (from prior executions):")
    for (const { skill, lesson } of promotedLessons) {
      parts.push(`• [${skill}] ${lesson}`)
    }
  }

  const rulesCategories = ["Forbidden Words", "Approval Rules", "Client Preferences"]
  const ruleRecords = ctx.knowledge.filter((k) => rulesCategories.includes(k.category))
  if (ruleRecords.length > 0) {
    parts.push("\nCLIENT RULES:")
    for (const r of ruleRecords) {
      parts.push(`• [${r.category}] ${r.title}: ${r.content}`)
    }
  }

  if (ctx.revisions.length > 0) {
    parts.push("\nPRIOR REVISION FEEDBACK:")
    for (const rev of ctx.revisions) {
      if (rev.revision_notes) parts.push(`• ${rev.revision_notes}`)
    }
  }

  return parts.join("\n") || "No execution rules defined yet."
}

// ─── Phase 1: New section builders ───────────────────────────────────────────

/** L0: Platform rules — relevance-sorted, capped by budget */
export function buildPlatformRulesSection(
  rules: PlatformRule[],
  budgetTokens: number,
  relCtx?: RelevanceContext,
): string {
  if (rules.length === 0) return ""

  // Sort by relevance score when context is available
  const sorted = relCtx
    ? [...rules].sort((a, b) => scorePlatformRule(b, relCtx) - scorePlatformRule(a, relCtx))
    : rules

  const parts: string[] = []
  const platform = sorted[0]?.platform ?? "platform"
  parts.push(`PLATFORM RULES [${platform.toUpperCase()}]:`)

  let used = estimateTokens(parts[0])
  for (const rule of sorted) {
    const content = bestContent(rule.content_full, rule.content_summary, rule.content_essence, budgetTokens - used)
    const line = `• ${rule.title}: ${content}`
    const lineTokens = estimateTokens(line)
    if (used + lineTokens > budgetTokens) break
    parts.push(line)
    used += lineTokens
  }
  return parts.join("\n")
}

export type PlaybookBuildResult = {
  text:    string
  scored:  Array<{ id: string; section: string; title: string; relevanceScore: number; injected: boolean; skipReason?: string }>
}

/** L1/L2: Brand playbook — relevance-filtered, scored, grouped by section.
 *  Returns both the text and scored metadata for efficiency metrics. */
export function buildBrandPlaybookSection(
  entries: BrandPlaybookEntry[],
  budgetTokens: number,
  relCtx?: RelevanceContext,
): PlaybookBuildResult {
  if (entries.length === 0) return { text: "", scored: [] }

  // Client-level overrides workspace-level for same title
  const seen = new Set<string>()
  const merged: BrandPlaybookEntry[] = []
  for (const e of entries.filter((e) => e.scope === "client")) {
    seen.add(e.title.toLowerCase())
    merged.push(e)
  }
  for (const e of entries.filter((e) => e.scope === "workspace")) {
    if (!seen.has(e.title.toLowerCase())) merged.push(e)
  }

  // Score each entry
  const scoredEntries = merged.map(e => {
    const meta = parseEntryMeta(e.metadata)
    const score = relCtx
      ? scorePlaybookEntry(meta, e.importance, relCtx)
      : e.importance * 10  // fallback: importance-only when no context
    return { entry: e, meta, score }
  })

  // Hard-filtered entries (score = 0) are skipped
  const eligible   = scoredEntries.filter(s => s.score > 0).sort((a, b) => b.score - a.score)
  const hardSkipped = scoredEntries.filter(s => s.score === 0)

  // Group eligible entries by section, preserving relevance sort within section
  const sections: Record<string, typeof eligible> = {}
  for (const item of eligible) {
    const sec = item.entry.section
    if (!sections[sec]) sections[sec] = []
    sections[sec].push(item)
  }
  // Sort each section's entries by score desc
  for (const sec of Object.keys(sections)) {
    sections[sec].sort((a, b) => b.score - a.score)
  }

  // Section order: highest avg score first (not static order)
  const sectionAvgScore = (sec: string) =>
    sections[sec].reduce((s, e) => s + e.score, 0) / sections[sec].length
  const orderedKeys = Object.keys(sections).sort((a, b) => sectionAvgScore(b) - sectionAvgScore(a))

  const parts: string[] = ["BRAND PLAYBOOK:"]
  let used = estimateTokens(parts[0])

  const scoredResult: PlaybookBuildResult["scored"] = []

  // Hard-skipped entries
  for (const { entry, score } of hardSkipped) {
    const meta = parseEntryMeta(entry.metadata)
    scoredResult.push({
      id: entry.id, section: entry.section, title: entry.title,
      relevanceScore: score, injected: false,
      skipReason: meta.applicable_platforms.length > 0 && relCtx?.platform
        ? `Platform mismatch (needs ${meta.applicable_platforms.join("/")})`
        : "Score = 0",
    })
  }

  for (const sectionKey of orderedKeys) {
    const header   = `\n[${sectionKey.toUpperCase()}]`
    const headerTk = estimateTokens(header)
    const sectionLines: string[] = []
    let sectionUsed = headerTk

    for (const { entry, score } of sections[sectionKey]) {
      const content = bestContent(
        entry.content_full, entry.content_summary, entry.content_essence,
        budgetTokens - used - sectionUsed,
      )
      const line = `• ${entry.title}: ${content}`
      const lineTk = estimateTokens(line)

      if (used + sectionUsed + lineTk > budgetTokens) {
        scoredResult.push({
          id: entry.id, section: entry.section, title: entry.title,
          relevanceScore: score, injected: false, skipReason: "Budget exceeded",
        })
        continue
      }
      sectionLines.push(line)
      sectionUsed += lineTk
      scoredResult.push({ id: entry.id, section: entry.section, title: entry.title, relevanceScore: score, injected: true })
    }

    if (sectionLines.length > 0) {
      parts.push(header, ...sectionLines)
      used += sectionUsed
    }
  }

  return { text: parts.join("\n"), scored: scoredResult }
}

// ─── Phase 2: Learning section builders ──────────────────────────────────────

/** Successful Examples — inject reusable patterns from approved past outputs.
 *  Content strategy (most to least compressed):
 *    1. reusable_pattern  → abstract formula (cheapest, most reusable)
 *    2. why_successful    → rationale
 *    3. content (short)   → actual example only if < 80 tokens
 */
export function buildSuccessfulExamplesSection(
  outputs: SuccessfulOutputRecord[],
  budgetTokens: number,
): string {
  if (outputs.length === 0) return ""
  const lines: string[] = ["SUCCESSFUL EXAMPLES (from approved outputs):"]
  let used = estimateTokens(lines[0])

  for (const o of outputs) {
    const typeTag  = o.output_type ? `[${o.output_type}]` : "[output]"
    const title    = o.title ?? "Untitled"
    const header   = `• ${typeTag} ${title}`
    const headerTk = estimateTokens(header)

    if (used + headerTk > budgetTokens) break
    lines.push(header)
    used += headerTk

    // Reusable pattern — preferred injection
    if (o.reusable_pattern) {
      const line = `  Pattern: ${o.reusable_pattern}`
      const tk   = estimateTokens(line)
      if (used + tk <= budgetTokens) { lines.push(line); used += tk }
    }

    // Why successful — secondary signal
    if (o.why_successful) {
      const line = `  Why: ${o.why_successful}`
      const tk   = estimateTokens(line)
      if (used + tk <= budgetTokens) { lines.push(line); used += tk }
    }

    // Actual content — only if short (fits within 80 token guard)
    const contentTk = estimateTokens(o.content)
    if (contentTk <= 80) {
      const preview = o.content.replace(/\n+/g, " ↵ ")
      const line = `  Example: "${preview}"`
      const tk   = estimateTokens(line)
      if (used + tk <= budgetTokens) { lines.push(line); used += tk }
    }
  }

  return lines.length > 1 ? lines.join("\n") : ""
}

/** Avoid These Patterns — inject from rejection patterns.
 *  Format: issue_type tag + description + correction.
 *  Severity 4-5 records are flagged with ⚠.
 */
export function buildAvoidPatternsSection(
  patterns: RejectionPatternRecord[],
  budgetTokens: number,
): string {
  if (patterns.length === 0) return ""
  const lines: string[] = ["AVOID THESE PATTERNS (from rejected outputs):"]
  let used = estimateTokens(lines[0])

  for (const p of patterns) {
    const issueTag = p.issue_type ? `[${p.issue_type.replace(/_/g, " ")}]` : "[issue]"
    const warn     = p.severity >= 4 ? " ⚠" : ""
    const header   = `• ${issueTag}${warn} ${p.description}`
    const headerTk = estimateTokens(header)

    if (used + headerTk > budgetTokens) break
    lines.push(header)
    used += headerTk

    if (p.correction) {
      const line = `  → ${p.correction}`
      const tk   = estimateTokens(line)
      if (used + tk <= budgetTokens) { lines.push(line); used += tk }
    }

    if (p.recurrence_count > 1) {
      const line = `  (seen ${p.recurrence_count}× — recurring issue)`
      const tk   = estimateTokens(line)
      if (used + tk <= budgetTokens) { lines.push(line); used += tk }
    }
  }

  return lines.length > 1 ? lines.join("\n") : ""
}

// ─── Context log payload ──────────────────────────────────────────────────────

export type ContextSection = {
  type: string
  tokens_used: number
  source_table: string
  source_ids: string[]
  content_preview: string   // first 100 chars of the section text
}

export type ContextLogPayload = {
  agent_id:          string | null
  client_id:         string | null
  monthly_cycle_id:  string | null
  sections:          ContextSection[]
  total_tokens_used: number
  total_budget:      number
  context_score:     number
  metadata:          Record<string, unknown>
}

/** Build the structured payload for inserting into context_logs */
export function buildContextLogPayload(
  ctx: CtxData,
  sectionTexts: Record<string, { text: string; tokens: number; sourceIds?: string[] }>,
  totalTokensUsed: number,
): ContextLogPayload {
  const sections: ContextSection[] = Object.entries(sectionTexts)
    .filter(([, v]) => v.tokens > 0)
    .map(([type, v]) => ({
      type,
      tokens_used: v.tokens,
      source_table: sectionToTable(type),
      source_ids: v.sourceIds ?? [],
      content_preview: v.text.slice(0, 100),
    }))

  // Score: count how many distinct knowledge sources contributed
  const scoreSources = [
    ctx.agent ? 1 : 0,
    ctx.skills.length > 0 ? 1 : 0,
    ctx.platformRules.length > 0 ? 1 : 0,
    ctx.brandPlaybook.length > 0 ? 1 : 0,
    ctx.knowledge.length > 0 ? 1 : 0,
    ctx.research.length > 0 ? 1 : 0,
    ctx.revisions.length > 0 ? 1 : 0,
    ctx.deliverable ? 1 : 0,
    ctx.cycleName ? 1 : 0,
    ctx.skills.some((s) => s.promotedLessons.length > 0) ? 1 : 0,
  ]
  const contextScore = scoreSources.reduce((a, b) => a + b, 0)

  return {
    agent_id:         ctx.agent?.id ?? null,
    client_id:        ctx.clientId ?? null,
    monthly_cycle_id: ctx.cycleId ?? null,
    sections,
    total_tokens_used: totalTokensUsed,
    total_budget:      ctx.tokenBudget.total_budget,
    context_score:     contextScore,
    metadata: {
      platform:         ctx.deliverable?.platform ?? null,
      deliverable_type: ctx.deliverable?.type ?? null,
      workspace_id:     ctx.workspaceId ?? null,
    },
  }
}

function sectionToTable(type: string): string {
  const map: Record<string, string> = {
    platform_rules:      "platform_rules",
    brand_playbook:      "brand_playbooks",
    client_knowledge:    "client_knowledge",
    research:            "research_library",
    lessons:             "skill_lessons",
    agent_philosophy:    "agents",
    task_objective:      "agent_tasks",
    revisions:           "deliverable_revisions",
    successful_examples: "successful_outputs",
    avoid_patterns:      "rejection_patterns",
  }
  return map[type] ?? "unknown"
}

// ─── Full prompt assembly (token-aware) ───────────────────────────────────────

export const OUTPUT_EXPECTATION =
  "[ Awaiting execution engine — output will be generated here ]"

export type AssembledPrompt = {
  prompt:               string
  sectionsLog:          Record<string, { text: string; tokens: number; sourceIds?: string[] }>
  totalTokensUsed:      number
  budgetUtilizationPct: number
  efficiencyMetrics:    EfficiencyMetrics
  efficiencyMode:       EfficiencyMode
  outputMode:           OutputMode
  targetOutputTokens:   number
  maxOutputTokens:      number   // recommended API max_tokens value
}

/**
 * Assembles the full prompt with token budget enforcement.
 * Section priority (highest = never dropped):
 *   1. agent_philosophy (system role + skill instructions)
 *   2. platform_rules   (L0 — always inject when platform known)
 *   3. brand_playbook   (L1/L2 — brand voice and rules)
 *   4. task_objective
 *   5. client_knowledge (grouped, importance-sorted)
 *   6. client_rules     (forbidden words, approval rules)
 *   7. lessons          (promoted skill lessons)
 *   8. research         (linked research)
 *   9. revisions        (prior feedback)
 *  10. cycle_context    (lowest priority — dropped first if tight)
 */
export function assembleRawPrompt(
  ctx: CtxData,
  taskTitle: string,
  taskDescription: string | null,
  mode?: EfficiencyMode,
  outputMode?: OutputMode,
): AssembledPrompt {
  const resolvedMode: EfficiencyMode = mode ?? ctx.efficiencyMode ?? "balanced"
  const resolvedOutputMode: OutputMode = outputMode ?? "concise"
  const deliverableType = ctx.deliverable?.type ?? null
  const targetOutputTokens = resolveOutputCap(deliverableType)
  const caps = SECTION_CAPS[resolvedMode]

  // Build relevance context for smart filtering
  const relCtx = buildRelevanceContext({
    platform:        ctx.deliverable?.platform ?? null,
    deliverableType: ctx.deliverable?.type ?? null,
    skillIds:        ctx.skills.map(s => s.id),
    agentId:         ctx.agent?.id ?? null,
  })

  // Override token budget allocation with mode caps (mode wins over DB budget)
  const cappedAlloc: TokenBudgetAllocation = {
    ...ctx.tokenBudget.allocation,
    ...Object.fromEntries(
      Object.entries(caps).filter(([k]) => k in ctx.tokenBudget.allocation)
    ) as Partial<TokenBudgetAllocation>,
  }

  const budget = new BudgetTracker({ ...ctx.tokenBudget, allocation: cappedAlloc })
  const alloc: TokenBudgetAllocation = cappedAlloc
  const sectionsLog: Record<string, { text: string; tokens: number; sourceIds?: string[] }> = {}

  // Track scored playbook entries for efficiency metrics
  type ScoredEntry = { id: string; section: string; title: string; relevanceScore: number; injected: boolean; skipReason?: string }
  let playbookScored: ScoredEntry[] = []

  const assembled: { heading: string; body: string }[] = []

  // Helper: attempt to add a section
  function addSection(
    key: string,
    heading: string,
    text: string,
    budgetKey: keyof TokenBudgetAllocation,
    sourceIds?: string[],
  ) {
    if (!text || text.trim().length < 5) return
    const limit = alloc[budgetKey] ?? 200
    const result = budget.consume(key, text, limit)
    if (!result) return
    assembled.push({ heading, body: result.text })
    sectionsLog[key] = { text: result.text, tokens: result.tokens, sourceIds }
  }

  // 1. Agent philosophy (system role + skills) — never dropped
  const systemRole = buildSystemRole(ctx)
  addSection("agent_philosophy", "# SYSTEM ROLE", systemRole, "agent_philosophy",
    ctx.agent ? [ctx.agent.id] : [])

  // 2. Platform rules (L0) — relevance-sorted
  if (ctx.platformRules.length > 0) {
    const platformText = buildPlatformRulesSection(ctx.platformRules, alloc.platform_rules, relCtx)
    addSection("platform_rules", "# PLATFORM RULES", platformText, "platform_rules",
      ctx.platformRules.map((r) => r.id))
  }

  // 3. Brand playbook (L1/L2) — relevance-filtered
  if (ctx.brandPlaybook.length > 0) {
    const { text: playbookText, scored } = buildBrandPlaybookSection(
      ctx.brandPlaybook, alloc.brand_voice, relCtx,
    )
    playbookScored = scored
    addSection("brand_playbook", "# BRAND PLAYBOOK", playbookText, "brand_voice",
      scored.filter(e => e.injected).map(e => e.id))
  }

  // 4. Task objective
  const taskObjective = buildTaskObjective(taskTitle, taskDescription, ctx)
  addSection("task_objective", "# TASK OBJECTIVE", taskObjective, "agent_philosophy")

  // 5. Client knowledge (non-rules categories)
  const nonRulesCats = ["Brand Voice", "Visual Direction", "Menu/Products", "Audience", "Offers", "Campaign Notes"]
  const clientKnowledge = ctx.knowledge.filter((k) => nonRulesCats.includes(k.category))
  if (clientKnowledge.length > 0) {
    const grouped: Record<string, typeof clientKnowledge> = {}
    for (const k of clientKnowledge) {
      if (!grouped[k.category]) grouped[k.category] = []
      grouped[k.category].push(k)
    }
    const parts = [`CLIENT: ${ctx.clientName ?? "Unknown"}\n`]
    if (ctx.deliverable) {
      parts.push(`DELIVERABLE: ${ctx.deliverable.title} (${ctx.deliverable.type}${ctx.deliverable.platform ? ` · ${ctx.deliverable.platform}` : ""})\n`)
    }
    parts.push("\nCLIENT KNOWLEDGE:")
    for (const [cat, records] of Object.entries(grouped)) {
      parts.push(`\n[${cat}]`)
      for (const r of records) {
        parts.push(`• ${r.title}${r.importance >= 4 ? " ⚠" : ""}: ${r.content}`)
      }
    }
    addSection("client_knowledge", "# CLIENT CONTEXT", parts.join("\n"), "client_knowledge",
      clientKnowledge.map((k) => k.id))
  } else if (ctx.clientName) {
    // At minimum inject client name + deliverable
    const minimal = [`CLIENT: ${ctx.clientName}`]
    if (ctx.deliverable) minimal.push(`DELIVERABLE: ${ctx.deliverable.title} (${ctx.deliverable.type})`)
    addSection("client_knowledge", "# CLIENT CONTEXT", minimal.join("\n"), "client_knowledge")
  }

  // 6. Client rules (forbidden words, preferences, approval rules)
  const rulesCats = ["Forbidden Words", "Approval Rules", "Client Preferences"]
  const clientRules = ctx.knowledge.filter((k) => rulesCats.includes(k.category))
  if (clientRules.length > 0) {
    const lines = ["CLIENT RULES:"]
    for (const r of clientRules) {
      lines.push(`• [${r.category}] ${r.title}: ${r.content}`)
    }
    addSection("client_rules", "# CLIENT RULES", lines.join("\n"), "client_rules",
      clientRules.map((k) => k.id))
  }

  // 7. Promoted lessons
  const promotedLessons = ctx.skills.flatMap((s) =>
    s.promotedLessons.map((l) => ({ skill: s.name, lesson: l, id: s.id }))
  )
  if (promotedLessons.length > 0) {
    const lines = ["LESSONS (from prior executions):"]
    for (const { skill, lesson } of promotedLessons) {
      lines.push(`• [${skill}] ${lesson}`)
    }
    addSection("lessons", "# EXECUTION RULES", lines.join("\n"), "lessons",
      [...new Set(promotedLessons.map((l) => l.id))])
  }

  // 8. Avoid these patterns (rejection learning) — before positive examples, sets constraints first
  if (ctx.rejectionPatterns.length > 0) {
    const avoidText = buildAvoidPatternsSection(ctx.rejectionPatterns, alloc.avoid_patterns)
    if (avoidText) {
      addSection("avoid_patterns", "# AVOID THESE PATTERNS", avoidText, "avoid_patterns",
        ctx.rejectionPatterns.map((p) => p.id))
    }
  }

  // 9. Successful examples (learning exemplars) — concrete reference for what good looks like
  if (ctx.successfulOutputs.length > 0) {
    const examplesText = buildSuccessfulExamplesSection(ctx.successfulOutputs, alloc.successful_examples)
    if (examplesText) {
      addSection("successful_examples", "# SUCCESSFUL EXAMPLES", examplesText, "successful_examples",
        ctx.successfulOutputs.map((o) => o.id))
    }
  }

  // 10. Research (linked)
  if (ctx.research.length > 0) {
    const researchText = buildResearchContext(ctx)
    addSection("research", "# RESEARCH CONTEXT", researchText, "patterns",
      ctx.research.map((r) => r.id))
  }

  // 11. Prior revision feedback
  const revWithNotes = ctx.revisions.filter((r) => r.revision_notes)
  if (revWithNotes.length > 0) {
    const lines = ["PRIOR REVISION FEEDBACK:"]
    for (const rev of revWithNotes) lines.push(`• ${rev.revision_notes}`)
    addSection("revisions", "# REVISION FEEDBACK", lines.join("\n"), "lessons",
      revWithNotes.map((r) => r.id))
  }

  // 12. Cycle context (lowest priority)
  if (ctx.cycleName) {
    addSection("cycle_context", "# CYCLE", `Active cycle: ${ctx.cycleName}`, "cycle_context")
  }

  // Assemble final prompt — output instructions go last (recency weight)
  const sections = assembled.map(({ heading, body }) => `${heading}\n${body}`)
  const outputInstructions = buildOutputInstructions(resolvedOutputMode, deliverableType, targetOutputTokens)
  sections.push(`# OUTPUT FORMAT\n${outputInstructions}`)
  sections.push(`# OUTPUT EXPECTATION\n${OUTPUT_EXPECTATION}`)

  const prompt = sections.join("\n\n---\n\n")
  const totalTokensUsed = budget.getTotalUsed()
  const budgetUtilizationPct = Math.round((totalTokensUsed / budget.getTotal()) * 100)

  // Estimate token savings vs rich mode baseline
  const richCaps    = SECTION_CAPS["rich"]
  const richBaseline = (richCaps.brand_voice ?? 480) + (richCaps.platform_rules ?? 200) +
                       (richCaps.successful_examples ?? 400) + (richCaps.avoid_patterns ?? 250)
  const actualVariable = (sectionsLog["brand_playbook"]?.tokens ?? 0) +
                         (sectionsLog["platform_rules"]?.tokens ?? 0) +
                         (sectionsLog["successful_examples"]?.tokens ?? 0) +
                         (sectionsLog["avoid_patterns"]?.tokens ?? 0)
  const tokensSaved = Math.max(0, richBaseline - actualVariable)

  const efficiencyMetrics = computeEfficiencyMetrics(
    playbookScored.map(e => ({ ...e })),
    tokensSaved,
    resolvedMode,
  )

  // max_tokens recommendation: target + 20% buffer, capped at 2048
  const maxOutputTokens = Math.min(Math.round(targetOutputTokens * 1.2), 2048)

  return {
    prompt, sectionsLog, totalTokensUsed, budgetUtilizationPct,
    efficiencyMetrics, efficiencyMode: resolvedMode,
    outputMode: resolvedOutputMode, targetOutputTokens, maxOutputTokens,
  }
}

// ─── Legacy wrapper (keeps existing callers working) ─────────────────────────
// Callers that used the old signature assembleRawPrompt(ctx, title, desc) → string
// now need to destructure .prompt. Provide a legacy shim for any component that
// only needs the prompt string.

export function assemblePromptText(
  ctx: CtxData,
  taskTitle: string,
  taskDescription: string | null,
): string {
  return assembleRawPrompt(ctx, taskTitle, taskDescription).prompt
}
