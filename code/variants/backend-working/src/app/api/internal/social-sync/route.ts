import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { isAgentRuntimeInternalRequest } from "@/lib/agent-runtime-dispatch-server"
import { syncSocialPerformance } from "@/lib/social-performance-server"

export const runtime = "nodejs"

/**
 * Scheduled Zernio refresh. Provider snapshots are only written when a sync is
 * requested, so without this the dashboard silently serves stale numbers for as
 * long as nobody presses refresh — which is exactly how a seven-day provider
 * outage went unnoticed. The Cron Trigger in wrangler.jsonc calls this.
 *
 * Only clients with a connected Zernio mapping are attempted; an unmapped
 * client is reported as skipped rather than counted as a failure, because
 * "never connected" is a configuration state, not an incident.
 */
export async function POST(request: NextRequest) {
  if (!isAgentRuntimeInternalRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Server database credentials are not configured." }, { status: 500 })

  const sb = createClient(url, key)
  const { data, error } = await sb
    .from("social_provider_connections")
    .select("client_id, platform, status")
    .eq("provider", "zernio")
  if (error) return NextResponse.json({ error: "Unable to load Zernio connection mapping." }, { status: 500 })

  // A refresh needs both organic platforms mapped and connected; meta_ads is
  // classified separately and never gates the organic sync.
  const byClient = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    const clientId = typeof row.client_id === "string" ? row.client_id : null
    const platform = typeof row.platform === "string" ? row.platform : null
    if (!clientId || !platform || row.status !== "connected") continue
    if (platform !== "instagram" && platform !== "facebook") continue
    const platforms = byClient.get(clientId) ?? new Set<string>()
    platforms.add(platform)
    byClient.set(clientId, platforms)
  }

  const eligible = [...byClient.entries()].filter(([, platforms]) => platforms.has("instagram") && platforms.has("facebook")).map(([clientId]) => clientId)
  const skipped = [...byClient.keys()].filter((clientId) => !eligible.includes(clientId))

  const results: Array<{ clientId: string; ok: boolean; error?: string }> = []
  for (const clientId of eligible) {
    try {
      await syncSocialPerformance(clientId)
      results.push({ clientId, ok: true })
    } catch (syncError) {
      results.push({ clientId, ok: false, error: syncError instanceof Error ? syncError.message : "Zernio refresh failed." })
    }
  }

  const failed = results.filter((result) => !result.ok).length
  return NextResponse.json(
    {
      ok: failed === 0,
      syncedAt: new Date().toISOString(),
      attempted: eligible.length,
      succeeded: results.length - failed,
      failed,
      skippedUnmapped: skipped.length,
      results,
    },
    { status: failed ? 207 : 200 },
  )
}
