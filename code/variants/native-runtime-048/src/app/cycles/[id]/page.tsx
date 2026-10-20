"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import LinkedResearch from "@/components/LinkedResearch"

// ─── Constants ─────────────────────────────────────────────────────────────────

const DELIVERABLE_STATUSES = [
  "Not Started",
  "In Progress",
  "Needs Revision",
  "Completed",
  "Confirmed",
  "Published",
  "Archived",
]

const DELIVERABLE_TYPES = ["Reel", "Post", "Story", "Carousel", "Video", "Article", "Ad", "Other"]
const PLATFORMS = ["Instagram", "LinkedIn", "TikTok", "YouTube", "Facebook", "Twitter/X", "Other"]

const STATUS_COLORS: Record<string, string> = {
  "Not Started":    "text-gray-500",
  "In Progress":    "text-blue-400",
  "Needs Revision": "text-yellow-400",
  "Completed":      "text-green-400",
  "Confirmed":      "text-emerald-400",
  "Published":      "text-purple-400",
  "Archived":       "text-gray-600",
}

const STATUS_DOT: Record<string, string> = {
  "Not Started":    "bg-neutral-600",
  "In Progress":    "bg-blue-400",
  "Needs Revision": "bg-yellow-400",
  "Completed":      "bg-green-400",
  "Confirmed":      "bg-emerald-400",
  "Published":      "bg-purple-400",
  "Archived":       "bg-gray-200",
}

const CYCLE_STATUS_LABELS: Record<string, string> = {
  "not_started": "Not Started",
  "active":      "Active",
  "in_review":   "In Review",
  "completed":   "Completed",
  "archived":    "Archived",
}

// ─── Types ──────────────────────────────────────────────────────────────────────

type Cycle = {
  id: string
  title: string | null
  month: string
  year: number
  status: string
  description: string | null
  start_date: string | null
  end_date: string | null
  client_id: string | null
}

type Deliverable = {
  id: string
  title: string
  status: string
  platform: string | null
  type: string
  content_type: string | null
  priority: string | null
  created_at: string
}

type NewDeliverableForm = {
  title: string
  type: string
  platform: string
  status: string
}

const EMPTY_FORM: NewDeliverableForm = {
  title:    "",
  type:     "Reel",
  platform: "Instagram",
  status:   "Not Started",
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function CycleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [cycle,        setCycle]        = useState<Cycle | null>(null)
  const [clientName,   setClientName]   = useState<string | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState("")

  // New deliverable inline form
  const [showAdd,   setShowAdd]   = useState(false)
  const [form,      setForm]      = useState<NewDeliverableForm>(EMPTY_FORM)
  const [adding,    setAdding]    = useState(false)
  const [addError,  setAddError]  = useState("")

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCycle = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("monthly_cycles")
      .select("*")
      .eq("id", id)
      .single()

    if (err) { setError(err.message); return }
    setCycle(data)

    if (data.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", data.client_id)
        .single()
      setClientName(client?.name ?? null)
    }
  }, [id])

  const fetchDeliverables = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("deliverables")
      .select("id, title, status, platform, type, content_type, priority, created_at")
      .eq("monthly_cycle_id", id)
      .order("created_at", { ascending: true })

    if (err) { setError(err.message); return }
    setDeliverables(data ?? [])
  }, [id])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchCycle(), fetchDeliverables()])
      setLoading(false)
    }
    load()
  }, [fetchCycle, fetchDeliverables])

  // ── Add deliverable ────────────────────────────────────────────────────────

  async function handleAddDeliverable() {
    if (!form.title.trim()) { setAddError("Title is required."); return }

    setAdding(true)
    setAddError("")

    const { error: err } = await supabase
      .from("deliverables")
      .insert({
        monthly_cycle_id: id,
        client_id:        cycle?.client_id ?? null,
        title:            form.title.trim(),
        type:             form.type,
        platform:         form.platform,
        status:           form.status,
        content_type:     form.type,
      })

    if (err) {
      setAddError(`Failed to create deliverable: ${err.message}`)
      setAdding(false)
      return
    }

    setForm(EMPTY_FORM)
    setShowAdd(false)
    fetchDeliverables()
    setAdding(false)
  }

  // ── Progress summary ───────────────────────────────────────────────────────

  const total = deliverables.length
  const counts = DELIVERABLE_STATUSES.map((s) => ({
    status: s,
    count: deliverables.filter((d) => d.status === s).length,
  })).filter((s) => s.count > 0)

  const publishedCount  = deliverables.filter((d) => d.status === "Published").length
  const confirmedCount  = deliverables.filter((d) => d.status === "Confirmed").length
  const completedCount  = deliverables.filter((d) => d.status === "Completed").length
  const doneCount       = publishedCount + confirmedCount + completedCount
  const progressPct     = total > 0 ? Math.round((doneCount / total) * 100) : 0

  // Group deliverables by status (only non-empty groups)
  const grouped = DELIVERABLE_STATUSES
    .map((s) => ({ status: s, items: deliverables.filter((d) => d.status === s) }))
    .filter((g) => g.items.length > 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">

          <button
            onClick={() => router.push("/cycles")}
            className="mb-8 text-sm text-gray-500 transition hover:text-gray-300"
          >
            ← Cycles
          </button>

          {/* Loading */}
          {loading && <p className="text-sm text-gray-500">Loading...</p>}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
              ⚠ {error}
            </div>
          )}

          {!loading && cycle && (
            <>
              {/* ── Cycle header ──────────────────────────────────────────── */}
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3">
                    {clientName && (
                      <span className="text-sm text-gray-500">{clientName}</span>
                    )}
                    {clientName && <span className="text-gray-700">·</span>}
                    <span className="text-sm text-gray-500">{cycle.month} {cycle.year}</span>
                  </div>
                  <h1 className="mt-2 text-4xl font-bold">
                    {cycle.title || `${cycle.month} ${cycle.year}`}
                  </h1>
                  {cycle.description && (
                    <p className="mt-3 max-w-2xl text-sm text-gray-400">{cycle.description}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                    <span className={`font-medium ${
                      cycle.status === "active" ? "text-blue-400" :
                      cycle.status === "completed" ? "text-green-400" :
                      "text-gray-400"
                    }`}>
                      {CYCLE_STATUS_LABELS[cycle.status] ?? cycle.status}
                    </span>
                    {cycle.start_date && cycle.end_date && (
                      <>
                        <span className="text-gray-700">·</span>
                        <span>
                          {new Date(cycle.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          {" — "}
                          {new Date(cycle.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => { setShowAdd((v) => !v); setAddError("") }}
                  className="mt-1 shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200"
                >
                  {showAdd ? "Cancel" : "+ Add Deliverable"}
                </button>
              </div>

              {/* ── Inline add deliverable form ───────────────────────────── */}
              {showAdd && (
                <div className="mt-6 rounded-2xl border border-gray-300 bg-gray-50 p-6">
                  <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">
                    New Deliverable
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">Title *</label>
                      <input
                        autoFocus
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddDeliverable(); if (e.key === "Escape") setShowAdd(false) }}
                        placeholder="e.g. Reel — Behind the Bar"
                        className="w-full rounded-lg border border-gray-200 bg-black px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">Type</label>
                      <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-gray-300 focus:outline-none">
                        {DELIVERABLE_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">Platform</label>
                      <select value={form.platform} onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-gray-300 focus:outline-none">
                        {PLATFORMS.map((pl) => <option key={pl}>{pl}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">Status</label>
                      <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-gray-300 focus:outline-none">
                        {DELIVERABLE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {addError && (
                    <div className="mt-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                      ⚠ {addError}
                    </div>
                  )}

                  <div className="mt-5 flex gap-3">
                    <button onClick={handleAddDeliverable} disabled={adding}
                      className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50">
                      {adding ? "Adding..." : "Add"}
                    </button>
                    <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setAddError("") }}
                      className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-400 transition hover:text-gray-900">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Progress summary ──────────────────────────────────────── */}
              <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Progress</h2>
                  <span className="text-sm text-gray-500">{doneCount} / {total} done</span>
                </div>

                {/* Progress bar */}
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                {/* Status breakdown */}
                {total > 0 && (
                  <div className="mt-5 flex flex-wrap gap-4">
                    {counts.map(({ status, count }) => (
                      <div key={status} className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status] ?? "bg-neutral-600"}`} />
                        <span className="text-xs text-gray-400">{status}</span>
                        <span className="text-xs font-bold text-gray-900">{count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {total === 0 && (
                  <p className="mt-4 text-sm text-gray-600">No deliverables yet. Add the first one above.</p>
                )}
              </div>

              {/* ── Deliverables grouped by status ────────────────────────── */}
              {grouped.length > 0 && (
                <div className="mt-8 space-y-8">
                  {grouped.map(({ status, items }) => (
                    <div key={status}>
                      {/* Group header */}
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status] ?? "bg-neutral-600"}`} />
                        <h3 className={`text-sm font-semibold ${STATUS_COLORS[status] ?? "text-gray-400"}`}>
                          {status}
                        </h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
                          {items.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {items.map((d) => (
                          <Link
                            key={d.id}
                            href={`/deliverables/${d.id}`}
                            className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-gray-300"
                          >
                            <p className="font-semibold text-gray-900">{d.title}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {d.platform && (
                                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                                  {d.platform}
                                </span>
                              )}
                              {d.type && (
                                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                                  {d.type}
                                </span>
                              )}
                              {d.priority && (
                                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                                  {d.priority}
                                </span>
                              )}
                            </div>
                            <p className="mt-2.5 text-xs text-gray-600">
                              {new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </>
          )}

          {/* Linked Research */}
          {!loading && cycle && (
            <LinkedResearch filterField="monthly_cycle_id" filterId={id} />
          )}

        </div>
      </section>
    </main>
  )
}
