import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId  = searchParams.get('client_id')
  const hoursBack = parseInt(searchParams.get('hours') ?? '24', 10)

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const sessionStart = new Date(Date.now() - 6 * 60 * 60 * 1000)

  let query = sb.from('ai_usage_logs')
    .select('id,model,route,feature,client_id,tokens_in,tokens_out,cache_write_tokens,cache_read_tokens,images_count,cost_usd_actual,cost_usd_estimated,estimated_vs_actual_delta,latency_ms,created_at')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  if (clientId) query = query.eq('client_id', clientId)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today   = (rows ?? []).reduce((s, r) => s + Number(r.cost_usd_actual), 0)
  const session = (rows ?? [])
    .filter(r => new Date(r.created_at) >= sessionStart)
    .reduce((s, r) => s + Number(r.cost_usd_actual), 0)

  const byFeature: Record<string, number> = {}
  const byClient:  Record<string, number> = {}
  let   totalDelta = 0
  let   deltaCount = 0

  for (const r of rows ?? []) {
    const f = r.feature ?? 'unknown'
    byFeature[f] = (byFeature[f] ?? 0) + Number(r.cost_usd_actual)
    if (r.client_id) byClient[r.client_id] = (byClient[r.client_id] ?? 0) + Number(r.cost_usd_actual)
    if (r.estimated_vs_actual_delta != null) {
      totalDelta += Number(r.estimated_vs_actual_delta)
      deltaCount++
    }
  }

  return NextResponse.json({
    today_usd:    Math.round(today   * 1e7) / 1e7,
    session_usd:  Math.round(session * 1e7) / 1e7,
    by_feature:   Object.fromEntries(Object.entries(byFeature).map(([k,v]) => [k, Math.round(v*1e7)/1e7])),
    by_client:    Object.fromEntries(Object.entries(byClient).map(([k,v]) => [k, Math.round(v*1e7)/1e7])),
    avg_estimate_delta: deltaCount > 0 ? Math.round((totalDelta / deltaCount) * 1e7) / 1e7 : null,
    recent_calls: (rows ?? []).slice(0, 20).map(r => ({
      id:          r.id,
      feature:     r.feature,
      model:       r.model,
      tokens_in:   r.tokens_in,
      tokens_out:  r.tokens_out,
      cache_write: r.cache_write_tokens,
      cache_read:  r.cache_read_tokens,
      images:      r.images_count,
      actual_usd:  Number(r.cost_usd_actual),
      est_usd:     r.cost_usd_estimated != null ? Number(r.cost_usd_estimated) : null,
      delta_usd:   r.estimated_vs_actual_delta != null ? Number(r.estimated_vs_actual_delta) : null,
      latency_ms:  r.latency_ms,
      at:          r.created_at,
    })),
  })
}
