"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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
  prompt_used: string | null
  raw_response: string | null
  input_tokens: number | null
  output_tokens: number | null
  total_cost: number | null
  duration_ms: number | null
  error_message: string | null
  execution_queue_id: string | null
  sandbox_run_id: string | null
  agent_id: string | null
  model_pricing_id: string | null
  metadata: Record<string, unknown> | null
  // joined
  agent?: { agent_name: string } | null
  queue?: {
    id: string
    queue_type: string | null
    prompt_snapshot: string | null
    via_sandbox: boolean
    status: string
  } | null
  model_pricing?: {
    display_name: string | null
    input_price_per_million: number | null
    output_price_per_million: number | null
  } | null
}

const STATUS_STYLES: Record<string, string> = {
  pending:   "border-gray-300  bg-white    text-gray-400",
  running:   "border-yellow-800   bg-yellow-950/40  text-yellow-300",
  completed: "border-emerald-800  bg-emerald-950/40 text-emerald-300",
  failed:    "border-red-800      bg-red-950/40     text-red-300",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
      <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-600">{title}</p>
      {children}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-200 last:border-0">
      <span className="shrink-0 text-xs text-gray-600">{label}</span>
      <span className="text-right font-mono text-xs text-gray-300">{value ?? "—"}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutionRunPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const [run,    setRun]    = useState<ExecutionRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [creatingReview, setCreatingReview] = useState(false)

  useEffect(() => {
    async function fetch() {
      const { data, error: err } = await supabase
        .from("execution_runs")
        .select(`
          id, created_at, provider, model, status,
          prompt_used, raw_response,
          input_tokens, output_tokens, total_cost, duration_ms,
          error_message, execution_queue_id, sandbox_run_id,
          agent_id, model_pricing_id, metadata,
          agents(agent_name),
          execution_queue(id, queue_type, prompt_snapshot, via_sandbox, status),
          model_pricing(display_name, input_price_per_million, output_price_per_million)
        `)
        .eq("id", id)
        .single()

      if (err) { setError(err.message); setLoading(false); return }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any
      setRun({
        ...r,
        agent:         r.agents         ?? null,
        queue:         r.execution_queue ?? null,
        model_pricing: r.model_pricing   ?? null,
      })
      setLoading(false)
    }
    fetch()
  }, [id])

  async function createReview() {
    if (!run?.execution_queue_id) return
    setCreatingReview(true)
    const { data, error: err } = await supabase
      .from("execution_reviews")
      .insert({ execution_queue_id: run.execution_queue_id, status: "pending" })
      .select("id")
      .single()
    setCreatingReview(false)
    if (err) { alert(`Failed to create review: ${err.message}`); return }
    router.push(`/reviews/${data.id}`)
  }

  if (loading) return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />
      <main className="flex-1 p-10"><p className="text-sm text-gray-600">Loading…</p></main>
    </div>
  )

  if (error || !run) return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />
      <main className="flex-1 p-10"><p className="text-sm text-red-400">{error || "Run not found."}</p></main>
    </div>
  )

  const totalTokens = (run.input_tokens ?? 0) + (run.output_tokens ?? 0)

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <Link href="/executions" className="text-xs text-gray-600 hover:text-gray-400 transition">
                ← Executions
              </Link>
            </div>
            <p className="mb-1 text-xs uppercase tracking-[0.3em] text-gray-600">Execution Run</p>
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{run.id}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={run.status} />
              {run.model && (
                <span className="rounded-full border border-violet-800 bg-violet-950/40 px-2.5 py-0.5 font-mono text-xs text-violet-300">
                  {run.model}
                </span>
              )}
              {run.provider && (
                <span className="text-xs text-gray-500">{run.provider}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 shrink-0">
            {run.execution_queue_id && (
              <Link
                href={`/queue`}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs text-gray-400 hover:text-gray-900 transition text-center"
              >
                → Queue item
              </Link>
            )}
            {run.sandbox_run_id && (
              <Link
                href={`/sandbox/${run.sandbox_run_id}`}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs text-gray-400 hover:text-gray-900 transition text-center"
              >
                → Sandbox run
              </Link>
            )}
            {run.status === "completed" && run.execution_queue_id && (
              <button
                onClick={createReview}
                disabled={creatingReview}
                className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-2 text-xs font-medium text-amber-300 hover:bg-amber-900/40 transition disabled:opacity-50"
              >
                {creatingReview ? "Creating…" : "+ Create Review"}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">

          {/* Prompt used */}
          <Section title="Prompt Used">
            {run.prompt_used ? (
              <pre className="max-h-96 overflow-auto rounded-xl border border-gray-200 bg-black p-5 font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap">
                {run.prompt_used}
              </pre>
            ) : (
              <p className="text-xs text-gray-600">No prompt recorded.</p>
            )}
          </Section>

          {/* Raw response */}
          {run.status === "completed" && (
            <Section title="Raw Response">
              {run.raw_response ? (
                <pre className="max-h-[600px] overflow-auto rounded-xl border border-emerald-900 bg-emerald-950/10 p-5 font-mono text-xs leading-relaxed text-emerald-200 whitespace-pre-wrap">
                  {run.raw_response}
                </pre>
              ) : (
                <p className="text-xs text-gray-600">No response recorded.</p>
              )}
            </Section>
          )}

          {/* Error */}
          {run.error_message && (
            <Section title="Error">
              <pre className="rounded-xl border border-red-900 bg-red-950/20 p-5 font-mono text-xs leading-relaxed text-red-300 whitespace-pre-wrap">
                {run.error_message}
              </pre>
            </Section>
          )}

          {/* Token / cost details */}
          <Section title="Token & Cost Details">
            <MetaRow label="Input tokens"    value={run.input_tokens?.toLocaleString() ?? "—"} />
            <MetaRow label="Output tokens"   value={run.output_tokens?.toLocaleString() ?? "—"} />
            <MetaRow label="Total tokens"    value={totalTokens.toLocaleString()} />
            <MetaRow label="Estimated cost"  value={run.total_cost != null ? `$${run.total_cost.toFixed(6)}` : "—"} />
            {run.model_pricing && (
              <>
                <MetaRow
                  label="Input rate"
                  value={run.model_pricing.input_price_per_million != null
                    ? `$${run.model_pricing.input_price_per_million}/M tokens`
                    : "—"}
                />
                <MetaRow
                  label="Output rate"
                  value={run.model_pricing.output_price_per_million != null
                    ? `$${run.model_pricing.output_price_per_million}/M tokens`
                    : "—"}
                />
              </>
            )}
            <MetaRow label="Duration"        value={run.duration_ms != null ? `${run.duration_ms}ms` : "—"} />
          </Section>

          {/* Metadata */}
          <Section title="Execution Metadata">
            <MetaRow label="Run ID"          value={run.id} />
            <MetaRow label="Provider"        value={run.provider} />
            <MetaRow label="Model"           value={run.model} />
            <MetaRow label="Agent"           value={run.agent?.agent_name} />
            <MetaRow label="Created"         value={new Date(run.created_at).toLocaleString()} />
            <MetaRow label="Queue item"      value={run.execution_queue_id ?? "—"} />
            <MetaRow label="Sandbox run"     value={run.sandbox_run_id ?? "—"} />
            {run.metadata && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-gray-700">Raw metadata</p>
                <pre className="rounded-xl border border-gray-200 bg-black p-4 font-mono text-xs text-gray-600">
                  {JSON.stringify(run.metadata, null, 2)}
                </pre>
              </div>
            )}
          </Section>

        </div>
      </main>
    </div>
  )
}
