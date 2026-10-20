"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type ExecutionRun = {
  id: string
  created_at: string
  provider: string | null
  model: string | null
  status: string
  input_tokens: number | null
  output_tokens: number | null
  total_cost: number | null
  duration_ms: number | null
  error_message: string | null
  execution_queue_id: string | null
  agent_id: string | null
  // joined
  agent?: { agent_name: string } | null
  queue?: { queue_type: string | null; prompt_snapshot: string | null } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ["pending", "running", "completed", "failed"]

const STATUS_STYLES: Record<string, string> = {
  pending:   "border-gray-300  bg-white     text-gray-400",
  running:   "border-yellow-800   bg-yellow-950/40   text-yellow-300",
  completed: "border-emerald-800  bg-emerald-950/40  text-emerald-300",
  failed:    "border-red-800      bg-red-950/40      text-red-300",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status}
    </span>
  )
}

function fmt(n: number | null | undefined, decimals = 4) {
  if (n == null) return "—"
  return n.toFixed(decimals)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutionsPage() {
  const [runs,    setRuns]    = useState<ExecutionRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [filter,  setFilter]  = useState("all")

  const fetchRuns = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("execution_runs")
      .select(`
        id, created_at, provider, model, status,
        input_tokens, output_tokens, total_cost, duration_ms,
        error_message, execution_queue_id, agent_id,
        agents(agent_name),
        execution_queue(queue_type, prompt_snapshot)
      `)
      .order("created_at", { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      agent: r.agents ?? null,
      queue: r.execution_queue ?? null,
    }))
    setRuns(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { fetchRuns() }, [fetchRuns])

  // ── Counters ──────────────────────────────────────────────────────────────

  const counts: Record<string, number> = { all: runs.length }
  for (const s of STATUSES) counts[s] = runs.filter((r) => r.status === s).length

  const visible = filter === "all" ? runs : runs.filter((r) => r.status === filter)

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalCost   = runs.reduce((s, r) => s + (r.total_cost   ?? 0), 0)
  const totalTokens = runs.reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0)

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">

        {/* Header */}
        <div className="mb-8">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-600">Execution Layer</p>
          <h1 className="text-3xl font-bold text-gray-900">Execution Runs</h1>
          <p className="mt-2 text-sm text-gray-500">
            Real AI text generation — manually triggered, reviewed, logged.
          </p>
        </div>

        {/* Summary strip */}
        {runs.length > 0 && (
          <div className="mb-8 flex gap-6">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3">
              <p className="text-xs text-gray-600">Total runs</p>
              <p className="mt-1 text-2xl font-bold">{runs.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3">
              <p className="text-xs text-gray-600">Total tokens</p>
              <p className="mt-1 font-mono text-2xl font-bold">{totalTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-emerald-900 bg-emerald-950/20 px-5 py-3">
              <p className="text-xs text-gray-600">Total cost</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-300">${totalCost.toFixed(6)}</p>
            </div>
          </div>
        )}

        {/* Status filter */}
        <div className="mb-8 flex flex-wrap gap-3">
          {[{ label: "All", key: "all" }, ...STATUSES.map((s) => ({ label: s, key: s }))].map(({ label, key }) => {
            const active = filter === key
            const style  = key !== "all" ? (STATUS_STYLES[key] ?? "") : ""
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition ${
                  active
                    ? key === "all"
                      ? "border-white/20 bg-gray-100 text-gray-900"
                      : style
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:text-gray-400"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${active ? "bg-white/10" : "bg-white"}`}>
                  {counts[key] ?? 0}
                </span>
              </button>
            )
          })}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-600">No execution runs yet.</p>
            <p className="mt-1 text-xs text-gray-700">
              Go to Queue → find a <span className="text-emerald-900">queued</span> item → click ⚡ Execute.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((run) => (
              <Link
                key={run.id}
                href={`/executions/${run.id}`}
                className="block rounded-2xl border border-gray-200 bg-gray-50 p-6 transition hover:border-gray-300"
              >
                <div className="flex items-start justify-between gap-4">

                  {/* Left */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={run.status} />
                      {run.model && (
                        <span className="rounded-full border border-violet-800 bg-violet-950/40 px-2.5 py-0.5 font-mono text-xs text-violet-300">
                          {run.model}
                        </span>
                      )}
                      {run.provider && (
                        <span className="text-xs text-gray-600">{run.provider}</span>
                      )}
                      {run.agent?.agent_name && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Agent:</span> {run.agent.agent_name}
                        </span>
                      )}
                    </div>

                    {/* Prompt preview */}
                    {run.queue?.prompt_snapshot && (
                      <p className="truncate text-xs text-gray-600">
                        {run.queue.prompt_snapshot.slice(0, 120)}…
                      </p>
                    )}

                    {/* Error */}
                    {run.error_message && (
                      <p className="text-xs text-red-400">{run.error_message}</p>
                    )}
                  </div>

                  {/* Right — metrics */}
                  <div className="shrink-0 text-right space-y-1">
                    <p className="font-mono text-xs text-gray-500">
                      {(run.input_tokens ?? 0) + (run.output_tokens ?? 0)} tokens
                    </p>
                    <p className="font-mono text-xs text-emerald-600">
                      ${fmt(run.total_cost, 6)}
                    </p>
                    {run.duration_ms != null && (
                      <p className="font-mono text-xs text-gray-700">
                        {run.duration_ms}ms
                      </p>
                    )}
                    <p className="text-xs text-gray-800">
                      {new Date(run.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
