"use client"

import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type SuccessfulOutput = {
  id: string
  created_at: string
  output_type: string | null
  title: string | null
  content: string
  why_successful: string | null
  reusable_pattern: string | null
  status: string
  agent_id: string | null
  client_id: string | null
  skill_id: string | null
  agents: { agent_name: string } | null
  clients: { name: string } | null
  agent_skills: { name: string } | null
}

type RejectionPattern = {
  id: string
  created_at: string
  issue_type: string | null
  description: string
  correction: string | null
  severity: number
  recurrence_count: number
  status: string
  agent_id: string | null
  client_id: string | null
  agents: { agent_name: string } | null
  clients: { name: string } | null
}

type LearningEvent = {
  id: string
  created_at: string
  event_type: string
  source_type: string | null
  source_ref: string | null
  summary: string | null
  status: string
  agent_id: string | null
  client_id: string | null
  agents: { agent_name: string } | null
  clients: { name: string } | null
}

type Tab = "outputs" | "rejections" | "events"

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  "wrong_tone", "off_brand", "factual_error", "format",
  "length", "wrong_platform", "missing_context", "hallucination", "off_brief", "other",
]

const ISSUE_COLORS: Record<string, string> = {
  wrong_tone:       "border-violet-900 text-violet-400",
  off_brand:        "border-amber-900 text-amber-400",
  factual_error:    "border-red-900 text-red-400",
  format:           "border-blue-900 text-blue-400",
  length:           "border-sky-900 text-sky-400",
  wrong_platform:   "border-cyan-900 text-cyan-400",
  missing_context:  "border-orange-900 text-orange-400",
  hallucination:    "border-pink-900 text-pink-400",
  off_brief:        "border-yellow-900 text-yellow-400",
  other:            "border-gray-300 text-gray-400",
}

const SEVERITY_COLORS = ["", "text-gray-500", "text-blue-400", "text-yellow-400", "text-orange-400", "text-red-400"]
const SEVERITY_LABELS = ["", "Minor", "Low", "Medium", "High", "Critical"]

const EVENT_TYPE_COLORS: Record<string, string> = {
  successful_output_saved: "border-green-900 text-green-400 bg-green-950/20",
  rejection_captured:      "border-red-900 text-red-400 bg-red-950/20",
  lesson_promoted:         "border-blue-900 text-blue-400 bg-blue-950/20",
  skill_evolved:           "border-violet-900 text-violet-400 bg-violet-950/20",
  manual_observation:      "border-gray-300 text-gray-400 bg-gray-50",
  pattern_detected:        "border-orange-900 text-orange-400 bg-orange-950/20",
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  successful_output_saved: "✓",
  rejection_captured:      "✕",
  lesson_promoted:         "★",
  skill_evolved:           "↑",
  manual_observation:      "○",
  pattern_detected:        "⚠",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function SeverityDot({ n }: { n: number }) {
  return (
    <span className={`text-xs font-bold ${SEVERITY_COLORS[n] ?? "text-gray-500"}`}>
      {SEVERITY_LABELS[n] ?? "?"} ({n}/5)
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LearningPage() {
  const [tab, setTab]               = useState<Tab>("outputs")
  const [outputs, setOutputs]       = useState<SuccessfulOutput[]>([])
  const [rejections, setRejections] = useState<RejectionPattern[]>([])
  const [events, setEvents]         = useState<LearningEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [filterClient, setFilterClient] = useState("all")
  const [filterAgent,  setFilterAgent]  = useState("all")
  const [filterType,   setFilterType]   = useState("all")
  const [filterStatus, setFilterStatus] = useState("active")

  // Dropdown options (derived from data)
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([])
  const [agentOptions,  setAgentOptions]  = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [outRes, rejRes, evtRes] = await Promise.all([
      supabase.from("successful_outputs")
        .select("*, agents(agent_name), clients(name), agent_skills(name)")
        .order("created_at", { ascending: false }),
      supabase.from("rejection_patterns")
        .select("*, agents(agent_name), clients(name)")
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("learning_events")
        .select("*, agents(agent_name), clients(name)")
        .order("created_at", { ascending: false }),
    ])

    const outs = (outRes.data ?? []) as SuccessfulOutput[]
    const rejs = (rejRes.data ?? []) as RejectionPattern[]
    const evts = (evtRes.data ?? []) as LearningEvent[]

    setOutputs(outs)
    setRejections(rejs)
    setEvents(evts)

    // Derive filter options from data
    const allItems = [...outs, ...rejs, ...evts]
    const seenClients = new Map<string, string>()
    const seenAgents  = new Map<string, string>()
    for (const item of allItems) {
      if (item.client_id && (item as { clients?: { name: string } | null }).clients?.name)
        seenClients.set(item.client_id, (item as { clients?: { name: string } | null }).clients!.name)
      if (item.agent_id && (item as { agents?: { agent_name: string } | null }).agents?.agent_name)
        seenAgents.set(item.agent_id, (item as { agents?: { agent_name: string } | null }).agents!.agent_name)
    }
    setClientOptions([...seenClients.entries()].map(([id, name]) => ({ id, name })))
    setAgentOptions([...seenAgents.entries()].map(([id, name]) => ({ id, name })))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function archiveOutput(id: string) {
    await supabase.from("successful_outputs").update({ status: "archived" }).eq("id", id)
    await load()
  }

  async function archiveRejection(id: string) {
    await supabase.from("rejection_patterns").update({ status: "archived" }).eq("id", id)
    await load()
  }

  async function markEventReviewed(id: string) {
    await supabase.from("learning_events").update({ status: "reviewed" }).eq("id", id)
    await load()
  }

  async function archiveEvent(id: string) {
    await supabase.from("learning_events").update({ status: "archived" }).eq("id", id)
    await load()
  }

  // ── Filtered data ─────────────────────────────────────────────────────────

  function filterItems<T extends { client_id: string | null; agent_id: string | null; status: string }>(items: T[]): T[] {
    return items.filter((item) => {
      if (filterClient !== "all" && item.client_id !== filterClient) return false
      if (filterAgent  !== "all" && item.agent_id  !== filterAgent)  return false
      if (filterStatus !== "all" && item.status     !== filterStatus) return false
      return true
    })
  }

  const filteredOutputs    = filterItems(outputs).filter((o) =>
    filterType === "all" || o.output_type === filterType
  )
  const filteredRejections = filterItems(rejections).filter((r) =>
    filterType === "all" || r.issue_type === filterType
  )
  const filteredEvents     = filterItems(events).filter((e) =>
    filterType === "all" || e.event_type === filterType
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabCounts = {
    outputs:    filteredOutputs.length,
    rejections: filteredRejections.length,
    events:     filteredEvents.length,
  }

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div>
            <p className="text-sm text-gray-500">Intelligence Layer · Phase 2</p>
            <h1 className="mt-2 text-4xl font-bold">Learning Loop</h1>
            <p className="mt-2 text-sm text-gray-500">
              Every approval and rejection captured here becomes intelligence. Capture only — no auto-injection yet.
            </p>
          </div>

          {/* Stats */}
          {!loading && (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-2xl border border-green-900/50 bg-green-950/10 px-5 py-4">
                <p className="text-xs text-green-700">Successful Outputs</p>
                <p className="mt-1 text-3xl font-bold text-green-400">{outputs.filter(o => o.status === "active").length}</p>
              </div>
              <div className="rounded-2xl border border-red-900/50 bg-red-950/10 px-5 py-4">
                <p className="text-xs text-red-700">Rejection Patterns</p>
                <p className="mt-1 text-3xl font-bold text-red-400">{rejections.filter(r => r.status === "active").length}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
                <p className="text-xs text-gray-600">Open Learning Events</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{events.filter(e => e.status === "open").length}</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Client */}
            {clientOptions.length > 0 && (
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
              >
                <option value="all">All clients</option>
                {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            {/* Agent */}
            {agentOptions.length > 0 && (
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
              >
                <option value="all">All agents</option>
                {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}

            {/* Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="open">Open</option>
              <option value="reviewed">Reviewed</option>
            </select>

            {/* Type filter (contextual) */}
            {tab === "rejections" && (
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
              >
                <option value="all">All issue types</option>
                {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            )}

            {tab === "events" && (
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
              >
                <option value="all">All event types</option>
                {Object.keys(EVENT_TYPE_COLORS).map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => { setFilterClient("all"); setFilterAgent("all"); setFilterType("all"); setFilterStatus("active") }}
              className="text-xs text-gray-700 hover:text-gray-400 transition"
            >
              Reset
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {(["outputs", "rejections", "events"] as Tab[]).map((t) => {
              const labels: Record<Tab, string> = {
                outputs:    "Successful Outputs",
                rejections: "Rejection Patterns",
                events:     "Learning Events",
              }
              const colors: Record<Tab, string> = {
                outputs:    "text-green-400",
                rejections: "text-red-400",
                events:     "text-gray-400",
              }
              return (
                <button
                  key={t}
                  onClick={() => { setTab(t); setFilterType("all") }}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-medium transition ${
                    tab === t
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {labels[t]}
                  <span className={`ml-2 ${tab === t ? colors[t] : "text-gray-700"}`}>
                    ({tabCounts[t]})
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Content ───────────────────────────────────────────────────── */}
          {loading ? (
            <div className="mt-4 space-y-3">
              {[1,2,3].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />)}
            </div>
          ) : (
            <div className="mt-4 space-y-3">

              {/* ── Successful Outputs ── */}
              {tab === "outputs" && (
                filteredOutputs.length === 0 ? (
                  <Empty label="No successful outputs captured yet." sub="Approve an execution and click 'Save as Successful Output' in /reviews." />
                ) : filteredOutputs.map((o) => {
                  const isExpanded = expandedId === o.id
                  return (
                    <div key={o.id} className={`rounded-2xl border transition ${isExpanded ? "border-green-900/60 bg-gray-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                      <button className="w-full text-left px-5 py-4" onClick={() => setExpandedId(isExpanded ? null : o.id)}>
                        <div className="flex items-center gap-3">
                          <span className="shrink-0 h-2 w-2 rounded-full bg-green-500" />
                          <span className="flex-1 truncate text-sm font-medium text-gray-900">{o.title || "Untitled output"}</span>
                          {o.output_type && (
                            <span className="shrink-0 rounded-lg border border-gray-300 px-2 py-0.5 text-xs text-gray-400">{o.output_type}</span>
                          )}
                          {o.clients && <span className="shrink-0 text-xs text-gray-600">{o.clients.name}</span>}
                          {o.agents && <span className="shrink-0 text-xs text-gray-700">{o.agents.agent_name}</span>}
                          <span className="shrink-0 text-xs text-gray-700">{fmt(o.created_at)}</span>
                          <span className="shrink-0 text-xs text-gray-700">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                        {!isExpanded && (
                          <p className="mt-1.5 truncate pl-5 text-xs text-gray-600">{o.content}</p>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 px-5 pb-5 pt-4 space-y-4">
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-gray-500">Content</p>
                            <pre className="whitespace-pre-wrap rounded-xl border border-green-900/30 bg-black px-5 py-4 font-mono text-xs leading-relaxed text-green-200">
                              {o.content}
                            </pre>
                          </div>
                          {o.why_successful && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">Why it worked</p>
                              <p className="text-sm text-gray-300">{o.why_successful}</p>
                            </div>
                          )}
                          {o.reusable_pattern && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">Reusable pattern</p>
                              <p className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3 text-sm text-blue-200">{o.reusable_pattern}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 border-t border-gray-200 pt-3">
                            {o.agent_skills && <span className="text-xs text-gray-700">Skill: {o.agent_skills.name}</span>}
                            <button onClick={() => archiveOutput(o.id)} className="ml-auto rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-red-900 hover:text-red-400 transition">
                              Archive
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* ── Rejection Patterns ── */}
              {tab === "rejections" && (
                filteredRejections.length === 0 ? (
                  <Empty label="No rejection patterns captured yet." sub="Reject an execution and click 'Save Rejection Pattern' in /reviews." />
                ) : filteredRejections.map((r) => {
                  const isExpanded = expandedId === r.id
                  const issueColor = ISSUE_COLORS[r.issue_type ?? "other"] ?? ISSUE_COLORS.other
                  return (
                    <div key={r.id} className={`rounded-2xl border transition ${isExpanded ? "border-red-900/40 bg-gray-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                      <button className="w-full text-left px-5 py-4" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                        <div className="flex items-center gap-3">
                          {r.issue_type && (
                            <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs ${issueColor}`}>
                              {r.issue_type.replace("_", " ")}
                            </span>
                          )}
                          <span className="flex-1 truncate text-sm font-medium text-gray-900">{r.description}</span>
                          <SeverityDot n={r.severity} />
                          {r.recurrence_count > 1 && (
                            <span className="shrink-0 rounded-full border border-orange-900 bg-orange-950/20 px-2 py-0.5 text-xs text-orange-400">
                              ×{r.recurrence_count}
                            </span>
                          )}
                          {r.clients && <span className="shrink-0 text-xs text-gray-600">{r.clients.name}</span>}
                          <span className="shrink-0 text-xs text-gray-700">{fmt(r.created_at)}</span>
                          <span className="shrink-0 text-xs text-gray-700">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 px-5 pb-5 pt-4 space-y-4">
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-gray-500">Issue</p>
                            <p className="text-sm text-gray-300">{r.description}</p>
                          </div>
                          {r.correction && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">Correction</p>
                              <p className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3 text-sm text-blue-200">{r.correction}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 border-t border-gray-200 pt-3">
                            {r.agents && <span className="text-xs text-gray-700">Agent: {r.agents.agent_name}</span>}
                            <button onClick={() => archiveRejection(r.id)} className="ml-auto rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-red-900 hover:text-red-400 transition">
                              Archive
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* ── Learning Events ── */}
              {tab === "events" && (
                filteredEvents.length === 0 ? (
                  <Empty label="No learning events yet." sub="Events are created automatically when outputs or rejection patterns are saved." />
                ) : filteredEvents.map((e) => {
                  const isExpanded = expandedId === e.id
                  const typeStyle = EVENT_TYPE_COLORS[e.event_type] ?? "border-gray-300 text-gray-400"
                  const icon = EVENT_TYPE_ICONS[e.event_type] ?? "·"
                  return (
                    <div key={e.id} className={`rounded-2xl border transition ${isExpanded ? "border-gray-300 bg-gray-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                      <button className="w-full text-left px-5 py-3.5" onClick={() => setExpandedId(isExpanded ? null : e.id)}>
                        <div className="flex items-center gap-3">
                          <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs font-medium ${typeStyle}`}>
                            {icon} {e.event_type.replace(/_/g, " ")}
                          </span>
                          <span className="flex-1 truncate text-sm text-gray-300">{e.summary ?? "—"}</span>
                          {e.status === "open" && (
                            <span className="shrink-0 rounded-full border border-yellow-800 bg-yellow-950/20 px-2 py-0.5 text-xs text-yellow-400">open</span>
                          )}
                          {e.status === "reviewed" && (
                            <span className="shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-500">reviewed</span>
                          )}
                          {e.clients && <span className="shrink-0 text-xs text-gray-600">{e.clients.name}</span>}
                          <span className="shrink-0 text-xs text-gray-700">{fmt(e.created_at)}</span>
                          <span className="shrink-0 text-xs text-gray-700">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 px-5 pb-5 pt-4 space-y-3">
                          {e.summary && <p className="text-sm text-gray-300">{e.summary}</p>}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
                            {e.source_type && <span>Source: {e.source_type}</span>}
                            {e.source_ref  && <span className="font-mono">{e.source_ref.slice(0, 8)}…</span>}
                            {e.agents      && <span>Agent: {e.agents.agent_name}</span>}
                          </div>
                          <div className="flex items-center gap-2 border-t border-gray-200 pt-3">
                            {e.status === "open" && (
                              <button onClick={() => markEventReviewed(e.id)} className="rounded-xl border border-green-900 bg-green-950/20 px-3 py-1.5 text-xs text-green-400 hover:bg-green-900/30 transition">
                                Mark reviewed
                              </button>
                            )}
                            <button onClick={() => archiveEvent(e.id)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-red-900 hover:text-red-400 transition ml-auto">
                              Archive
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

            </div>
          )}

          {/* Footer */}
          <div className="mt-10 border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-700">
              Jarvis OS · Learning Loop · Capture only — auto-injection in Phase 3
            </p>
          </div>

        </div>
      </section>
    </main>
  )
}

function Empty({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-8 py-12 text-center">
      <p className="text-gray-500">{label}</p>
      <p className="mt-1 text-xs text-gray-700">{sub}</p>
    </div>
  )
}
