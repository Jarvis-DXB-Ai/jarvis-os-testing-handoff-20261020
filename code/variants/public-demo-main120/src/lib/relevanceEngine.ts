// relevanceEngine.ts — Context Relevance Engine
//
// Phase 3 prep: deterministic intelligent filtering for prompt assembly.
// Architecture: hard-filter → score → sort → budget-inject
//
// Future plug-in point: replace `scorePlaybookEntry` with semantic/vector scoring
// without changing the pipeline or downstream assembly code.

import type { PlatformRule } from "@/lib/agentContext"

// ─── Types ────────────────────────────────────────────────────────────────────

export type EfficiencyMode = "lean" | "balanced" | "rich"

/** Resolved task context used for scoring. Built from CtxData at assembly time. */
export type RelevanceContext = {
  platform:        string | null   // deliverable.platform
  deliverableType: string | null   // deliverable.type
  skillIds:        string[]        // active agent skill IDs
  agentId:         string | null
  tags?:           string[]        // future: task/campaign tags
}

export type BrandPlaybookEntryMeta = {
  applicable_platforms:    string[]
  applicable_deliverables: string[]
  applicable_skills:       string[]
  applicable_agents:       string[]
  tags:                    string[]
  priority_weight:         number
}

export type ScoredPlaybookEntry<T> = T & {
  relevanceScore: number
  injected:       boolean
  skipReason?:    string
}

export type EfficiencyMetrics = {
  mode:             EfficiencyMode
  injectedCount:    number
  skippedCount:     number
  tokensSaved:      number         // estimated vs rich mode baseline
  avgRelevanceScore: number
  sectionBreakdown: Record<string, { injected: number; skipped: number }>
}

// ─── Section caps by mode ─────────────────────────────────────────────────────
//
// Caps are applied AFTER relevance filtering.
// lean    = minimum viable context (1 exec = cheapest)
// balanced = default — smart, full brand, best examples
// rich    = full context dump (audits, onboarding, complex briefs)

export const SECTION_CAPS: Record<EfficiencyMode, Record<string, number>> = {
  lean: {
    agent_philosophy:    150,
    platform_rules:       80,
    brand_voice:          90,
    client_rules:         80,
    client_knowledge:    200,
    lessons:              80,
    patterns:             50,
    cycle_context:        50,
    successful_examples:  80,
    avoid_patterns:       80,
    exemplars:             0,
  },
  balanced: {
    agent_philosophy:    250,
    platform_rules:      100,
    brand_voice:         160,  // was 480 — now capped, relevance filtering handles the rest
    client_rules:        150,
    client_knowledge:    450,
    lessons:             200,
    patterns:            150,
    cycle_context:       100,
    successful_examples: 150,
    avoid_patterns:      120,
    exemplars:             0,
  },
  rich: {
    agent_philosophy:    300,
    platform_rules:      200,
    brand_voice:         480,
    client_rules:        200,
    client_knowledge:    600,
    lessons:             300,
    patterns:            300,
    cycle_context:       300,
    successful_examples: 400,
    avoid_patterns:      250,
    exemplars:             0,
  },
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Score a brand_playbook entry against the current task context.
 *  Returns 0 on hard filter (platform mismatch → never inject).
 *
 *  Score components:
 *  - Base:              importance × 10  (10–50)
 *  - Platform match:    +30
 *  - General (no platform filter): +10
 *  - Deliverable match: +20
 *  - Tag overlap:       +10 per match, max +30
 *  - Mandatory tag:     +50 (guaranteed top of queue)
 *  - priority_weight:   multiplied at end (1.0 = neutral, 2.0 = always first)
 */
export function scorePlaybookEntry(
  meta: BrandPlaybookEntryMeta,
  importance: number,
  ctx: RelevanceContext,
): number {
  // Hard filter: if platform restrictions are set and task platform doesn't match → skip
  if (
    meta.applicable_platforms.length > 0 &&
    ctx.platform &&
    !meta.applicable_platforms.includes(ctx.platform)
  ) return 0

  let score = importance * 10

  // General-purpose vs platform-specific
  if (meta.applicable_platforms.length === 0) score += 10   // no restriction = general
  else if (ctx.platform && meta.applicable_platforms.includes(ctx.platform)) score += 30

  // Deliverable type bonus
  if (ctx.deliverableType && meta.applicable_deliverables.includes(ctx.deliverableType)) score += 20

  // Tag overlap (up to 3 matches = +30)
  if (ctx.tags && ctx.tags.length > 0) {
    const overlap = meta.tags.filter(t => ctx.tags!.includes(t)).length
    score += Math.min(overlap, 3) * 10
  }

  // Mandatory — always near top
  if (meta.tags.includes("mandatory")) score += 50

  // Priority weight multiplier
  return Math.round(score * meta.priority_weight)
}

/** Score a platform rule for relative ordering (rules are already platform-filtered at fetch). */
export function scorePlatformRule(
  rule: PlatformRule,
  ctx: RelevanceContext,
): number {
  let score = rule.importance * 10
  if (ctx.deliverableType) {
    const title = rule.title.toLowerCase()
    const type  = ctx.deliverableType.toLowerCase()
    if (title.includes(type)) score += 20
    // "content_limits" directly affects caption writing
    if (rule.rule_type === "content_limits" && ["caption", "post"].includes(type)) score += 15
    // Pure engagement rules less critical for copy tasks
    if (rule.rule_type === "engagement" && type === "caption") score -= 10
  }
  return Math.max(0, score)
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/** Parse metadata from JSONB field (populated in brand_playbooks.metadata) */
export function parseEntryMeta(rawMeta: unknown): BrandPlaybookEntryMeta {
  const m = (rawMeta ?? {}) as Record<string, unknown>
  return {
    applicable_platforms:    Array.isArray(m.applicable_platforms)    ? m.applicable_platforms    : [],
    applicable_deliverables: Array.isArray(m.applicable_deliverables) ? m.applicable_deliverables : [],
    applicable_skills:       Array.isArray(m.applicable_skills)       ? m.applicable_skills       : [],
    applicable_agents:       Array.isArray(m.applicable_agents)       ? m.applicable_agents       : [],
    tags:                    Array.isArray(m.tags)                    ? m.tags                    : [],
    priority_weight:         typeof m.priority_weight === "number"    ? m.priority_weight         : 1.0,
  }
}

/** Build a RelevanceContext from available task metadata. */
export function buildRelevanceContext(params: {
  platform:        string | null
  deliverableType: string | null
  skillIds:        string[]
  agentId:         string | null
}): RelevanceContext {
  // Derive task-level tags from platform + deliverable type
  const tags: string[] = []
  if (params.platform)        tags.push(params.platform)
  if (params.deliverableType) tags.push(params.deliverableType)
  if (params.deliverableType === "caption") tags.push("copy")
  if (params.deliverableType === "ad")      tags.push("copy")

  return { ...params, tags }
}

/** Compute efficiency metrics given scored entries. */
export function computeEfficiencyMetrics(
  scored: Array<{ relevanceScore: number; injected: boolean; section?: string }>,
  tokensSaved: number,
  mode: EfficiencyMode,
): EfficiencyMetrics {
  const injected = scored.filter(e => e.injected)
  const skipped  = scored.filter(e => !e.injected)
  const avgScore = injected.length > 0
    ? Math.round(injected.reduce((s, e) => s + e.relevanceScore, 0) / injected.length)
    : 0

  const sectionBreakdown: Record<string, { injected: number; skipped: number }> = {}
  for (const e of scored) {
    const sec = e.section ?? "unknown"
    if (!sectionBreakdown[sec]) sectionBreakdown[sec] = { injected: 0, skipped: 0 }
    if (e.injected) sectionBreakdown[sec].injected++
    else            sectionBreakdown[sec].skipped++
  }

  return {
    mode,
    injectedCount:     injected.length,
    skippedCount:      skipped.length,
    tokensSaved,
    avgRelevanceScore: avgScore,
    sectionBreakdown,
  }
}
