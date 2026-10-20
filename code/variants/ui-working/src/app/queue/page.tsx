"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ─────────────────────────────────────────────────────────────────────

type QueueItem = {
  id: string
  created_at: string
  updated_at: string
  queue_type: string | null
  status: string
  priority: string
  prompt_snapshot: string | null
  output_snapshot: string | null
  error_message: string | null
  estimated_input_tokens: number | null
  estimated_cost: number | null
  via_sandbox: boolean
  position: number
  task_id: string | null
  sandbox_run_id: string | null
  agent_id: string | null
  skill_id: string | null
  model_pricing_id: string | null
  // joined
  task?: { title: string } | null
  agent?: { agent_name: string } | null
  skill?: { name: string } | null
  model_pricing?: { model_name: string; display_name: string | null; provider: string } | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ["queued", "processing", "completed", "failed", "cancelled", "reviewed"]
const ALL_FILTER = "all"

const STATUS_STYLES: Record<string, string> = {
  queued:     "border-blue-800    bg-blue-950/40    text-blue-300",
  processing: "border-yellow-800  bg-yellow-950/40  text-yellow-300",
  completed:  "border-green-800   bg-green-950/40   text-green-300",
  failed:     "border-red-800     bg-red-950/40     text-red-300",
  cancelled:  "border-gray-300 bg-gray-50    text-gray-500",
  reviewed:   "border-violet-800  bg-violet-950/40  text-violet-300",
}

const PRIORITY_STYLES: Record<string, string> = {
  high:   "text-red-400",
  normal: "text-gray-500",
  low:    "text-gray-700",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.queued}`}>
      {status}
    </span>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const router = useRouter()
  const [items,       setItems]       = useState<QueueItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState("")
  const [filter,      setFilter]      = useState(ALL_FILTER)
  const [expanding,   setExpanding]   = useState<string | null>(null)
  const [updatingId,  setUpdatingId]  = useState<string | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)  // queue item id
  const [executingId, setExecutingId] = useState<string | null>(null)  // queue item being executed

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("execution_queue")
      .select(`
        id, created_at, updated_at, queue_type, status, priority,
        prompt_snapshot, output_snapshot, error_message,
        estimated_input_tokens, estimated_cost, via_sandbox, position,
        task_id, sandbox_run_id, agent_id, skill_id, model_pricing_id,
        agent_tasks(title),
        agents(agent_name),
        agent_skills(name),
        model_pricing(model_name, display_name, provider)
      `)
      .order("created_at", { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      task:          r.agent_tasks   ?? null,
      agent:         r.agents        ?? null,
      skill:         r.agent_skills  ?? null,
      model_pricing: r.model_pricing ?? null,
    }))
    setItems(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // ── Status counters ────────────────────────────────────────────────────────

  const counts: Record<string, number> = { all: items.length }
  for (const s of STATUSES) counts[s] = items.filter((i) => i.status === s).length

  // ── Filtered list ──────────────────────────────────────────────────────────

  const visible = filter === ALL_FILTER ? items : items.filter((i) => i.status === filter)

  // ── Inline status update ───────────────────────────────────────────────────

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    const { error: err } = await supabase
      .from("execution_queue")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (!err) {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status, updated_at: new Date().toISOString() } : i))
    }
    setUpdatingId(null)
  }

  // ── Execute ───────────────────────────────────────────────────────────────

  async function executeItem(queueId: string) {
    setExecutingId(queueId)
    try {
      const res = await fetch("/api/execute", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ queueId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Execution failed: ${data.error}`)
        await fetchItems()
        return
      }
      // Navigate to the execution run detail
      router.push(`/executions/${data.runId}`)
    } catch (err) {
      alert(`Execution error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExecutingId(null)
      await fetchItems()
    }
  }

  // ── Create Review ─────────────────────────────────────────────────────────

  async function createReview(queueId: string) {
    setCreatingFor(queueId)
    const { data, error: err } = await supabase
      .from("execution_reviews")
      .insert({ execution_queue_id: queueId, status: "pending" })
      .select("id")
      .single()
    setCreatingFor(null)
    if (err) { alert(`Failed to create review: ${err.message}`); return }
    router.push(`/reviews/${data.id}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">

        {/* Header */}
        <div className="mb-8">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-400">Execution Layer</p>
          <h1 className="text-3xl font-bold text-gray-900">Execution Queue</h1>
          <p className="mt-2 text-sm text-gray-500">
            Approved runs awaiting AI execution — queue infrastructure only, no AI calls yet.
          </p>
        </div>

        {/* Status counters */}
        <div className="mb-8 flex flex-wrap gap-3">
          {[{ label: "All", key: ALL_FILTER }, ...STATUSES.map((s) => ({ label: s, key: s }))].map(({ label, key }) => {
            const active = filter === key
            const count  = counts[key] ?? 0
            const style  = key !== ALL_FILTER ? (STATUS_STYLES[key] ?? "") : ""
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition ${
                  active
                    ? key === ALL_FILTER
                      ? "border-white/20 bg-gray-100 text-gray-900"
                      : style
                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${active ? "bg-white/10" : "bg-gray-50"}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-400">No queue items{filter !== ALL_FILTER ? ` with status "${filter}"` : ""}.</p>
            <p className="mt-1 text-xs text-gray-700">
              Open a sandbox run and click &quot;Send to Execution Queue&quot; to add items.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => {
              const isExpanded = expanding === item.id
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-gray-200 bg-white transition hover:border-gray-300"
                >
                  {/* Main row */}
                  <div className="flex items-start gap-4 p-6">
                    <div className="min-w-0 flex-1 space-y-2">

                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        {item.priority !== "normal" && (
                          <span className={`text-xs font-semibold uppercase tracking-wider ${PRIORITY_STYLES[item.priority] ?? ""}`}>
                            {item.priority}
                          </span>
                        )}
                        {item.model_pricing && (
                          <span className="rounded-full border border-violet-800 bg-violet-950/40 px-2.5 py-0.5 text-xs font-mono text-violet-300">
                            {item.model_pricing.display_name ?? item.model_pricing.model_name}
                          </span>
                        )}
                        {item.queue_type && (
                          <span className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">
                            {item.queue_type}
                          </span>
                        )}
                      </div>

                      {/* Linked context */}
                      <div className="flex flex-wrap gap-4">
                        {item.task?.title && (
                          <span className="text-xs text-gray-500">
                            <span className="text-gray-700">Task:</span> {item.task.title}
                          </span>
                        )}
                        {item.agent?.agent_name && (
                          <span className="text-xs text-gray-500">
                            <span className="text-gray-700">Agent:</span> {item.agent.agent_name}
                          </span>
                        )}
                        {item.skill?.name && (
                          <span className="text-xs text-gray-500">
                            <span className="text-gray-700">Skill:</span> {item.skill.name}
                          </span>
                        )}
                        {item.sandbox_run_id && (
                          <Link
                            href={`/sandbox/${item.sandbox_run_id}`}
                            className="text-xs text-gray-700 hover:text-violet-400 transition"
                          >
                            → sandbox run
                          </Link>
                        )}
                      </div>

                      {/* Metrics + timestamp */}
                      <div className="flex flex-wrap gap-4">
                        {item.estimated_input_tokens != null && (
                          <span className="font-mono text-xs text-gray-700">
                            ~{item.estimated_input_tokens} tokens
                          </span>
                        )}
                        {item.estimated_cost != null && (
                          <span className="font-mono text-xs text-gray-700">
                            ${item.estimated_cost.toFixed(6)}
                          </span>
                        )}
                        <span className="font-mono text-xs text-gray-800">
                          pos:{item.position}
                        </span>
                        {item.via_sandbox && (
                          <span className="text-xs text-emerald-900">via sandbox ✓</span>
                        )}
                        <span className="text-xs text-gray-700">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Error message */}
                      {item.error_message && (
                        <p className="rounded-xl border border-red-900 bg-red-950/20 px-4 py-2 text-xs text-red-400">
                          {item.error_message}
                        </p>
                      )}

                      {/* Prompt snapshot toggle */}
                      {item.prompt_snapshot && (
                        <button
                          onClick={() => setExpanding(isExpanded ? null : item.id)}
                          className="text-xs text-gray-400 hover:text-gray-500 transition"
                        >
                          {isExpanded ? "▲ Hide prompt" : "▼ View prompt snapshot"}
                        </button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <select
                        value={item.status}
                        disabled={updatingId === item.id}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                        className={`rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-900 focus:border-violet-600 focus:outline-none transition ${updatingId === item.id ? "opacity-40" : ""}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {/* Execute — only for queued + via_sandbox items */}
                      {item.status === "queued" && item.via_sandbox && item.sandbox_run_id && item.prompt_snapshot && (
                        <button
                          onClick={() => executeItem(item.id)}
                          disabled={executingId === item.id}
                          className="rounded-xl border border-emerald-700 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40 transition disabled:opacity-50"
                        >
                          {executingId === item.id ? "Executing…" : "⚡ Execute"}
                        </button>
                      )}
                      <button
                        onClick={() => createReview(item.id)}
                        disabled={creatingFor === item.id}
                        className="rounded-xl border border-amber-800 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-900/40 transition disabled:opacity-50"
                      >
                        {creatingFor === item.id ? "Creating…" : "+ Create Review"}
                      </button>
                    </div>
                  </div>

                  {/* Prompt snapshot (expandable) */}
                  {isExpanded && item.prompt_snapshot && (
                    <div className="border-t border-gray-200 px-6 pb-6 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                        Prompt Snapshot
                        <span className="ml-2 font-mono font-normal normal-case text-gray-800">
                          (immutable — captured at queue time)
                        </span>
                      </p>
                      <pre className="max-h-80 overflow-auto rounded-xl border border-gray-200 bg-black p-5 font-mono text-xs leading-relaxed text-gray-500 whitespace-pre-wrap">
                        {item.prompt_snapshot}
                      </pre>
                    </div>
                  )}

                  {/* Output snapshot if present */}
                  {item.output_snapshot && (
                    <div className="border-t border-gray-200 px-6 pb-6 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-green-700">Output</p>
                      <pre className="max-h-80 overflow-auto rounded-xl border border-green-900 bg-green-950/10 p-5 font-mono text-xs leading-relaxed text-green-300 whitespace-pre-wrap">
                        {item.output_snapshot}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
