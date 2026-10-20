"use client"

import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type TableCount = {
  table: string
  label: string
  count: number | null
  error: string | null
}

type RecentDeliverable = {
  id: string
  title: string
  status: string
  platform: string | null
  created_at: string
}

type RecentAsset = {
  id: string
  name: string
  asset_type: string | null
  deliverable_id: string
  created_at: string
}

type RecentCopy = {
  id: string
  copy_type: string
  title: string | null
  platform: string | null
  deliverable_id: string
  created_at: string
}

type SystemStatus = {
  connected: boolean
  checkedAt: Date | null
  counts: TableCount[]
  recentDeliverables: RecentDeliverable[]
  recentAssets: RecentAsset[]
  recentCopy: RecentCopy[]
  loading: boolean
  error: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLES: { table: string; label: string }[] = [
  { table: "clients",              label: "Clients"          },
  { table: "deliverables",         label: "Deliverables"     },
  { table: "deliverable_assets",   label: "Assets"           },
  { table: "deliverable_copy",     label: "Copy Items"       },
  { table: "deliverable_revisions",label: "Revisions"        },
  { table: "deliverable_activity", label: "Activity Logs"    },
  { table: "monthly_cycles",       label: "Cycles"           },
  { table: "telegram_commands",    label: "Commands"         },
  { table: "command_plans",        label: "Command Plans"    },
  { table: "agent_tasks",          label: "Agent Tasks"      },
  { table: "agent_task_outputs",   label: "Task Outputs"     },
  { table: "agents",               label: "Agents"           },
  { table: "agent_skills",         label: "Agent Skills"     },
  { table: "skill_lessons",        label: "Skill Lessons"    },
  { table: "client_knowledge",     label: "Client Knowledge" },
  { table: "research_library",     label: "Research Items"   },
  { table: "research_links",       label: "Research Links"   },
  { table: "workspaces",           label: "Workspaces"       },
  { table: "research_tasks",       label: "Research Tasks"   },
  { table: "agent_lessons",        label: "Agent Lessons"    },
  { table: "sandbox_runs",         label: "Sandbox Runs"     },
  { table: "model_pricing",        label: "Model Pricing"    },
  { table: "execution_queue",      label: "Queue Items"      },
  { table: "execution_reviews",    label: "Reviews"          },
  { table: "execution_runs",       label: "Execution Runs"   },
  // Phase 1 Intelligence Layer
  { table: "platform_rules",       label: "Platform Rules"   },
  { table: "brand_playbooks",      label: "Brand Playbooks"  },
  { table: "token_budgets",        label: "Token Budgets"    },
  { table: "context_logs",         label: "Context Logs"     },
  // Phase 2 Learning Loop
  { table: "successful_outputs",   label: "Successful Outputs"  },
  { table: "rejection_patterns",   label: "Rejection Patterns"  },
  { table: "learning_events",      label: "Learning Events"     },
]

const STATUS_COLORS: Record<string, string> = {
  "Not Started":    "text-gray-400",
  "In Progress":    "text-blue-400",
  "Needs Revision": "text-yellow-400",
  "Completed":      "text-green-400",
  "Confirmed":      "text-emerald-400",
  "Published":      "text-purple-400",
  "Archived":       "text-gray-600",
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus>({
    connected: false,
    checkedAt: null,
    counts: [],
    recentDeliverables: [],
    recentAssets: [],
    recentCopy: [],
    loading: true,
    error: "",
  })

  const runChecks = useCallback(async () => {
    setStatus((prev) => ({ ...prev, loading: true, error: "" }))

    // ── Connection probe ───────────────────────────────────────────────────
    const probe = await supabase.from("deliverables").select("id", { count: "exact", head: true })
    const connected = !probe.error

    // ── Table counts ───────────────────────────────────────────────────────
    const counts: TableCount[] = await Promise.all(
      TABLES.map(async ({ table, label }) => {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
        return {
          table,
          label,
          count: error ? null : (count ?? 0),
          error: error ? error.message : null,
        }
      })
    )

    // ── Recent deliverables ────────────────────────────────────────────────
    const { data: recentDeliverables } = await supabase
      .from("deliverables")
      .select("id, title, status, platform, created_at")
      .order("created_at", { ascending: false })
      .limit(5)

    // ── Recent assets ──────────────────────────────────────────────────────
    const { data: recentAssets } = await supabase
      .from("deliverable_assets")
      .select("id, name, asset_type, deliverable_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5)

    // ── Recent copy ────────────────────────────────────────────────────────
    const { data: recentCopy } = await supabase
      .from("deliverable_copy")
      .select("id, copy_type, title, platform, deliverable_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5)

    setStatus({
      connected,
      checkedAt: new Date(),
      counts,
      recentDeliverables: recentDeliverables ?? [],
      recentAssets: recentAssets ?? [],
      recentCopy: recentCopy ?? [],
      loading: false,
      error: probe.error ? `Connection error: ${probe.error.message}` : "",
    })
  }, [])

  useEffect(() => {
    runChecks()
  }, [runChecks])

  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen bg-[#020403] text-white">
      <Sidebar />

      <section className="jarvis-dark-shell">
        <div className="jarvis-page">

          {/* Header */}
          <div className="jarvis-hero flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="jarvis-eyebrow">Internal</p>
              <h1 className="jarvis-title mt-3">System Health</h1>
              <p className="jarvis-copy mt-4 max-w-2xl">
                Live verification console — Supabase connection, module row counts, recent records.
              </p>
            </div>
            <button
              onClick={runChecks}
              disabled={status.loading}
              className="jarvis-muted-button disabled:opacity-40"
            >
              {status.loading ? "Checking…" : "↻ Refresh"}
            </button>
          </div>

          {/* Connection banner */}
          <div className="mt-8">
            {status.loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-4">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-600" />
                <span className="text-sm text-white/45">Connecting to Supabase…</span>
              </div>
            ) : status.connected ? (
              <div className="flex items-center justify-between rounded-2xl border border-green-400/20 bg-green-950/20 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="text-sm font-medium text-green-300">Supabase Connected</span>
                </div>
                {status.checkedAt && (
                  <span className="text-xs text-white/38">
                    Last checked {status.checkedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-red-400/20 bg-red-950/20 px-6 py-4">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="text-sm font-medium text-red-300">Connection Failed — {status.error}</span>
              </div>
            )}
          </div>

          {/* Table counts grid */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {status.loading
              ? TABLES.map(({ label }) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
                    <p className="text-xs uppercase tracking-wider text-white/34">{label}</p>
                    <p className="mt-3 h-8 w-12 animate-pulse rounded bg-white/10" />
                  </div>
                ))
              : status.counts.map(({ label, count, error }) => (
                  <div
                    key={label}
                    className={`rounded-2xl border p-5 transition ${
                      error
                        ? "border-red-400/20 bg-red-950/20"
                        : "border-white/10 bg-white/[0.045] hover:border-emerald-300/20"
                    }`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wider text-white/34">
                      {label}
                    </p>
                    {error ? (
                      <p className="mt-2 text-xs text-red-400">Error</p>
                    ) : (
                      <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
                        {count?.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
          </div>

          {/* Recent records — 3 columns */}
          {!status.loading && (
            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">

              {/* Recent Deliverables */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/38">
                  Latest Deliverables
                </h2>
                {status.recentDeliverables.length === 0 ? (
                  <p className="text-xs text-white/34">None yet.</p>
                ) : (
                  <div className="space-y-3">
                    {status.recentDeliverables.map((d) => (
                      <a
                        key={d.id}
                        href={`/deliverables/${d.id}`}
                        className="block rounded-xl border border-white/10 bg-black/20 p-3.5 transition hover:border-emerald-300/20"
                      >
                        <p className="truncate text-sm font-medium text-white">{d.title}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className={`text-xs ${STATUS_COLORS[d.status] ?? "text-gray-400"}`}>
                            {d.status}
                          </span>
                          <span className="text-xs text-white/30">{fmt(d.created_at)}</span>
                        </div>
                        {d.platform && (
                          <p className="mt-1 text-xs text-white/30">{d.platform}</p>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Assets */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/38">
                  Latest Assets
                </h2>
                {status.recentAssets.length === 0 ? (
                  <p className="text-xs text-white/34">None yet.</p>
                ) : (
                  <div className="space-y-3">
                    {status.recentAssets.map((a) => (
                      <a
                        key={a.id}
                        href={`/deliverables/${a.deliverable_id}`}
                        className="block rounded-xl border border-white/10 bg-black/20 p-3.5 transition hover:border-emerald-300/20"
                      >
                        <p className="truncate text-sm font-medium text-white">{a.name}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          {a.asset_type ? (
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/38">
                              {a.asset_type}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span className="text-xs text-white/30">{fmt(a.created_at)}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Copy */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/38">
                  Latest Copy
                </h2>
                {status.recentCopy.length === 0 ? (
                  <p className="text-xs text-white/34">None yet.</p>
                ) : (
                  <div className="space-y-3">
                    {status.recentCopy.map((c) => (
                      <a
                        key={c.id}
                        href={`/deliverables/${c.deliverable_id}`}
                        className="block rounded-xl border border-white/10 bg-black/20 p-3.5 transition hover:border-emerald-300/20"
                      >
                        <p className="truncate text-sm font-medium text-white">
                          {c.title || c.copy_type}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/38">
                            {c.copy_type}
                          </span>
                          <span className="text-xs text-white/30">{fmt(c.created_at)}</span>
                        </div>
                        {c.platform && (
                          <p className="mt-1 text-xs text-white/30">{c.platform}</p>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Footer */}
          <div className="mt-10 border-t border-white/10 pt-6">
            <p className="text-xs text-white/34">
              Jarvis OS · System Health · Internal only · Do not share externally
            </p>
          </div>

        </div>
      </section>
    </main>
  )
}
