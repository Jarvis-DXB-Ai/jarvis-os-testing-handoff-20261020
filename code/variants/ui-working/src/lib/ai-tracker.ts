/**
 * AI Cost Tracker
 * ───────────────
 * - Uses REAL Anthropic usage from response (never estimates for final cost)
 * - Correctly handles cache_creation_input_tokens (1.25×) and cache_read_input_tokens (0.1×)
 * - Persists every call to ai_usage_logs
 * - Returns actual cost so callers can surface it
 */

import { createClient } from '@supabase/supabase-js'

// Service-role client for server-side inserts
const sbService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Pricing (USD per token) ──────────────────────────────────────────────────
// Source: https://www.anthropic.com/pricing  (updated 2026-05)
const PRICING: Record<string, {
  input: number      // per token, non-cached
  output: number
  cacheWrite: number // cache_creation_input_tokens — billed at 1.25× input
  cacheRead: number  // cache_read_input_tokens     — billed at 0.10× input
}> = {
  'claude-haiku-4-5': {
    input:      0.80 / 1_000_000,   // $0.80/MTok
    output:     4.00 / 1_000_000,   // $4.00/MTok
    cacheWrite: 1.00 / 1_000_000,   // $1.00/MTok
    cacheRead:  0.08 / 1_000_000,   // $0.08/MTok
  },
  'claude-sonnet-4-6': {
    input:      3.00 / 1_000_000,
    output:    15.00 / 1_000_000,
    cacheWrite: 3.75 / 1_000_000,
    cacheRead:  0.30 / 1_000_000,
  },
  'claude-sonnet-4-5': {
    input:      3.00 / 1_000_000,
    output:    15.00 / 1_000_000,
    cacheWrite: 3.75 / 1_000_000,
    cacheRead:  0.30 / 1_000_000,
  },
}

// Fallback to Haiku pricing if unknown model
function getPricing(model: string) {
  return PRICING[model] ?? PRICING['claude-haiku-4-5']
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnthropicUsage {
  input_tokens:                   number
  output_tokens:                  number
  cache_creation_input_tokens?:   number | null
  cache_read_input_tokens?:       number | null
}

export interface TrackParams {
  model:             string
  route:             string        // e.g. '/api/brain/upload'
  feature?:          string        // e.g. 'vision_batch', 'extract_text', 'enrich_merge'
  clientId?:         string
  usage:             AnthropicUsage
  imagesCount?:      number
  estimatedCostUsd?: number        // pre-run estimate if you had one
  startedAt?:        Date
  requestId?:        string        // Anthropic x-request-id header
  debug?:            boolean       // log raw usage to console
}

export interface TrackResult {
  costUsd:     number
  tokensIn:    number
  tokensOut:   number
  cacheWrite:  number
  cacheRead:   number
  delta:       number | null       // actual - estimated (null if no estimate)
}

// ─── Core: calculate cost from real usage ────────────────────────────────────

export function calcCost(model: string, usage: AnthropicUsage): number {
  const p          = getPricing(model)
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead  = usage.cache_read_input_tokens     ?? 0

  return (
    usage.input_tokens * p.input
    + usage.output_tokens * p.output
    + (cacheWrite ?? 0) * p.cacheWrite
    + (cacheRead  ?? 0) * p.cacheRead
  )
}

// ─── Track + persist ─────────────────────────────────────────────────────────

export async function trackUsage(params: TrackParams): Promise<TrackResult> {
  const costUsd    = calcCost(params.model, params.usage)
  const cacheWrite = params.usage.cache_creation_input_tokens ?? 0
  const cacheRead  = params.usage.cache_read_input_tokens     ?? 0
  const delta      = params.estimatedCostUsd != null ? (costUsd - params.estimatedCostUsd) : null
  const now        = new Date()
  const latencyMs  = params.startedAt ? (now.getTime() - params.startedAt.getTime()) : null

  if (params.debug) {
    console.log('[ai-tracker DEBUG]', {
      model:       params.model,
      feature:     params.feature,
      raw_usage:   params.usage,
      cost_usd:    costUsd.toFixed(7),
      estimated:   params.estimatedCostUsd?.toFixed(7),
      delta:       delta?.toFixed(7),
      latency_ms:  latencyMs,
    })
  }

  // Persist — fire-and-forget (don't block response on logging failure)
  sbService.from('ai_usage_logs').insert({
    model:                      params.model,
    route:                      params.route,
    feature:                    params.feature ?? null,
    client_id:                  params.clientId ?? null,
    request_id:                 params.requestId ?? null,
    tokens_in:                  params.usage.input_tokens,
    tokens_out:                 params.usage.output_tokens,
    cache_write_tokens:         cacheWrite,
    cache_read_tokens:          cacheRead,
    images_count:               params.imagesCount ?? 0,
    cost_usd_actual:            costUsd,
    cost_usd_estimated:         params.estimatedCostUsd ?? null,
    estimated_vs_actual_delta:  delta,
    started_at:                 params.startedAt?.toISOString() ?? null,
    completed_at:               now.toISOString(),
    latency_ms:                 latencyMs,
  }).then(({ error }) => {
    if (error) console.warn('[ai-tracker] persist failed:', error.message)
  })

  return { costUsd, tokensIn: params.usage.input_tokens, tokensOut: params.usage.output_tokens, cacheWrite, cacheRead, delta }
}

// ─── Budget guard ─────────────────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  constructor(public spentUsd: number, public limitUsd: number) {
    super(`Budget exceeded: $${spentUsd.toFixed(5)} spent, limit $${limitUsd.toFixed(5)}`)
    this.name = 'BudgetExceededError'
  }
}

export async function checkBudget(limitUsd: number, feature?: string): Promise<number> {
  // Get today's spend (UTC day)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const query = sbService
    .from('ai_usage_logs')
    .select('cost_usd_actual')
    .gte('created_at', today.toISOString())

  if (feature) query.eq('feature', feature)

  const { data, error } = await query
  if (error) {
    console.warn('[ai-tracker] budget check failed:', error.message)
    return 0 // fail open — don't block on logging errors
  }

  const spent = (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd_actual), 0)
  if (spent >= limitUsd) throw new BudgetExceededError(spent, limitUsd)
  return spent
}

// ─── Aggregates (for UI) ──────────────────────────────────────────────────────

export async function getUsageSummary(clientId?: string): Promise<{
  today:   number
  session: number   // last 6 hours
  byFeature: Record<string, number>
}> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const sessionStart = new Date(Date.now() - 6 * 60 * 60 * 1000)

  const { data } = await sbService
    .from('ai_usage_logs')
    .select('cost_usd_actual, feature, created_at')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = data ?? []
  const today   = rows.reduce((s, r) => s + Number(r.cost_usd_actual), 0)
  const session = rows
    .filter(r => new Date(r.created_at) >= sessionStart)
    .reduce((s, r) => s + Number(r.cost_usd_actual), 0)

  const byFeature: Record<string, number> = {}
  for (const r of rows) {
    const k = r.feature ?? 'unknown'
    byFeature[k] = (byFeature[k] ?? 0) + Number(r.cost_usd_actual)
  }

  return { today, session, byFeature }
}
