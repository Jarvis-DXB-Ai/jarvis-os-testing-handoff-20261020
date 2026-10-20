/**
 * POST /api/execute
 *
 * Manually triggers a real AI text generation from a queued item.
 *
 * Safety gates (all must pass):
 *  1. queue item exists
 *  2. status = 'queued'
 *  3. via_sandbox = true
 *  4. sandbox_run_id IS NOT NULL
 *
 * On success:
 *  - Creates execution_run row
 *  - Updates queue status to 'completed'
 *
 * On failure:
 *  - execution_run row contains error_message
 *  - queue status updated to 'failed'
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { executeTextRun } from "@/lib/executionEngine"

// Server-side Supabase client (uses anon key — RLS permissive for now)
function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { queueId } = body as { queueId?: string }

  if (!queueId) {
    return NextResponse.json({ error: "queueId is required" }, { status: 400 })
  }

  const supabase = serverSupabase()

  // ── 1. Fetch queue item ──────────────────────────────────────────────────
  const { data: item, error: fetchErr } = await supabase
    .from("execution_queue")
    .select("id, status, via_sandbox, sandbox_run_id, prompt_snapshot, agent_id, model_pricing_id, model_pricing(model_name, provider)")
    .eq("id", queueId)
    .single()

  if (fetchErr || !item) {
    return NextResponse.json({ error: `Queue item not found: ${fetchErr?.message}` }, { status: 404 })
  }

  // ── 2. Safety gates ──────────────────────────────────────────────────────
  if (item.status !== "queued") {
    return NextResponse.json(
      { error: `Queue item status is "${item.status}" — only "queued" items can be executed.` },
      { status: 400 }
    )
  }

  if (!item.via_sandbox) {
    return NextResponse.json(
      { error: "Queue item was not routed via sandbox. Execution blocked." },
      { status: 400 }
    )
  }

  if (!item.sandbox_run_id) {
    return NextResponse.json(
      { error: "Queue item has no linked sandbox_run_id. Execution blocked." },
      { status: 400 }
    )
  }

  if (!item.prompt_snapshot) {
    return NextResponse.json(
      { error: "Queue item has no prompt_snapshot. Cannot execute without a prompt." },
      { status: 400 }
    )
  }

  // ── 3. Resolve model / provider ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pricing = (item as any).model_pricing as { model_name: string; provider: string } | null
  const model    = pricing?.model_name ?? "claude-haiku-4-5"
  const provider = pricing?.provider?.toLowerCase() ?? "anthropic"

  // ── 4. Create execution_run row (status: running) ────────────────────────
  const { data: runRow, error: insertErr } = await supabase
    .from("execution_runs")
    .insert({
      execution_queue_id: item.id,
      sandbox_run_id:     item.sandbox_run_id,
      agent_id:           item.agent_id ?? null,
      model_pricing_id:   item.model_pricing_id ?? null,
      provider,
      model,
      status:             "running",
      prompt_used:        item.prompt_snapshot,
    })
    .select("id")
    .single()

  if (insertErr || !runRow) {
    return NextResponse.json({ error: `Failed to create execution_run: ${insertErr?.message}` }, { status: 500 })
  }

  const runId = runRow.id

  // ── 5. Call execution engine ─────────────────────────────────────────────
  const result = await executeTextRun({
    prompt:   item.prompt_snapshot,
    model,
    provider,
  })

  // ── 6. Update execution_run with result ──────────────────────────────────
  const runUpdate = result.ok
    ? {
        status:        "completed",
        raw_response:  result.rawResponse,
        input_tokens:  result.inputTokens,
        output_tokens: result.outputTokens,
        total_cost:    result.estimatedCost,
        duration_ms:   result.durationMs,
      }
    : {
        status:        "failed",
        error_message: result.error,
        duration_ms:   result.durationMs,
      }

  await supabase.from("execution_runs").update(runUpdate).eq("id", runId)

  // ── 7. Update queue item status ──────────────────────────────────────────
  const queueStatus = result.ok ? "completed" : "failed"
  await supabase
    .from("execution_queue")
    .update({
      status:          queueStatus,
      output_snapshot: result.ok ? result.rawResponse : null,
      error_message:   result.ok ? null : result.error,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", queueId)

  // ── 8. Return ────────────────────────────────────────────────────────────
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, runId },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok:           true,
    runId,
    provider:     result.provider,
    model:        result.model,
    inputTokens:  result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost: result.estimatedCost,
    durationMs:   result.durationMs,
  })
}
