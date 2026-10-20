"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ─────────────────────────────────────────────────────────────────────

type Review = {
  id: string
  created_at: string
  status: string
  score: number | null
  approved: boolean
  requires_revision: boolean
  execution_queue_id: string
  reviewer_agent_id: string | null
  // joined
  queue?: {
    queue_type: string | null
    status: string
    agent_tasks: { title: string } | null
    agents: { agent_name: string } | null
  } | null
  reviewer?: { agent_name: string } | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const REVIEW_STATUSES = ["pending", "approved", "rejected", "revision_requested"]
const ALL_FILTER = "all"

const STATUS_STYLES: Record<string, string> = {
  pending:            "border-gray-300  bg-gray-50    text-gray-500",
  approved:           "border-green-800   bg-green-950/40   text-green-300",
  rejected:           "border-red-800     bg-red-950/40     text-red-300",
  revision_requested: "border-yellow-800  bg-yellow-950/40  text-yellow-300",
}

const QUEUE_STATUS_STYLES: Record<string, string> = {
  queued:     "text-blue-400",
  processing: "text-yellow-400",
  completed:  "text-green-400",
  failed:     "text-red-400",
  reviewed:   "text-violet-400",
}

function ScoreDots({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-700">—</span>
  const color = score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${i < score ? color : "bg-gray-100"}`}
        />
      ))}
      <span className="ml-1.5 font-mono text-xs text-gray-500">{score}/10</span>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [filter,  setFilter]  = useState(ALL_FILTER)

  const fetchReviews = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("execution_reviews")
      .select(`
        id, created_at, status, score, approved, requires_revision,
        execution_queue_id, reviewer_agent_id,
        execution_queue(
          queue_type, status,
          agent_tasks(title),
          agents(agent_name)
        ),
        agents!reviewer_agent_id(agent_name)
      `)
      .order("created_at", { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      queue:    r.execution_queue ?? null,
      reviewer: r.agents          ?? null,
    }))
    setReviews(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  // Status counters
  const counts: Record<string, number> = { all: reviews.length }
  for (const s of REVIEW_STATUSES) counts[s] = reviews.filter((r) => r.status === s).length

  const visible = filter === ALL_FILTER ? reviews : reviews.filter((r) => r.status === filter)

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">

        {/* Header */}
        <div className="mb-8">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-400">QC Layer</p>
          <h1 className="text-3xl font-bold text-gray-900">Execution Reviews</h1>
          <p className="mt-2 text-sm text-gray-500">
            Review, score, and approve AI execution outputs before publishing.
          </p>
        </div>

        {/* Status filters */}
        <div className="mb-8 flex flex-wrap gap-3">
          {[{ label: "All", key: ALL_FILTER }, ...REVIEW_STATUSES.map((s) => ({ label: s.replace("_", " "), key: s }))].map(({ label, key }) => {
            const active = filter === key
            const count  = counts[key] ?? 0
            const style  = STATUS_STYLES[key] ?? ""
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
            <p className="text-sm text-gray-400">No reviews{filter !== ALL_FILTER ? ` with status "${filter.replace("_", " ")}"` : ""}.</p>
            <p className="mt-1 text-xs text-gray-700">
              Open a queue item and click &quot;Create Review&quot; to begin.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((review) => (
              <Link
                key={review.id}
                href={`/reviews/${review.id}`}
                className="block rounded-2xl border border-gray-200 bg-white p-6 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">

                    {/* Status + flags */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[review.status] ?? STATUS_STYLES.pending}`}>
                        {review.status.replace("_", " ")}
                      </span>
                      {review.approved && (
                        <span className="rounded-full border border-green-800 bg-green-950/30 px-2.5 py-0.5 text-xs text-green-400">✓ approved</span>
                      )}
                      {review.requires_revision && (
                        <span className="rounded-full border border-yellow-800 bg-yellow-950/30 px-2.5 py-0.5 text-xs text-yellow-400">⟳ revision</span>
                      )}
                    </div>

                    {/* Score */}
                    <ScoreDots score={review.score} />

                    {/* Linked context */}
                    <div className="flex flex-wrap gap-4">
                      {review.queue?.agent_tasks?.title && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Task:</span> {review.queue.agent_tasks.title}
                        </span>
                      )}
                      {review.queue?.agents?.agent_name && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Agent:</span> {review.queue.agents.agent_name}
                        </span>
                      )}
                      {review.queue?.queue_type && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Type:</span> {review.queue.queue_type}
                        </span>
                      )}
                      {review.queue?.status && (
                        <span className={`text-xs font-medium ${QUEUE_STATUS_STYLES[review.queue.status] ?? "text-gray-500"}`}>
                          queue: {review.queue.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-700">{new Date(review.created_at).toLocaleString()}</p>
                    {review.reviewer && (
                      <p className="mt-1 text-xs text-gray-400">by {review.reviewer.agent_name}</p>
                    )}
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
