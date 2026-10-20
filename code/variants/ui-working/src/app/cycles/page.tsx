"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

type Cycle = {
  id: string
  title: string | null
  month: string
  year: number
  status: string
  start_date: string | null
  end_date: string | null
  client_id: string | null
  created_at: string
  // joined
  client_name: string | null
  deliverable_count: number
}

const STATUS_COLORS: Record<string, string> = {
  "not_started": "text-gray-500",
  "active":      "text-blue-400",
  "in_review":   "text-yellow-400",
  "completed":   "text-green-400",
  "archived":    "text-gray-600",
}

const STATUS_LABELS: Record<string, string> = {
  "not_started": "Not Started",
  "active":      "Active",
  "in_review":   "In Review",
  "completed":   "Completed",
  "archived":    "Archived",
}

export default function CyclesPage() {
  const [cycles, setCycles]   = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    async function load() {
      // Fetch cycles
      const { data: cycleData, error: cycleErr } = await supabase
        .from("monthly_cycles")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false })

      if (cycleErr) {
        setError(cycleErr.message)
        setLoading(false)
        return
      }

      if (!cycleData || cycleData.length === 0) {
        setCycles([])
        setLoading(false)
        return
      }

      // Fetch clients for name lookup
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")

      const clientMap: Record<string, string> = {}
      clients?.forEach((c) => { clientMap[c.id] = c.name })

      // Fetch deliverable counts per cycle
      const { data: delivCounts } = await supabase
        .from("deliverables")
        .select("monthly_cycle_id")

      const countMap: Record<string, number> = {}
      delivCounts?.forEach((d) => {
        if (d.monthly_cycle_id) {
          countMap[d.monthly_cycle_id] = (countMap[d.monthly_cycle_id] ?? 0) + 1
        }
      })

      const merged: Cycle[] = cycleData.map((c) => ({
        ...c,
        client_name: c.client_id ? (clientMap[c.client_id] ?? null) : null,
        deliverable_count: countMap[c.id] ?? 0,
      }))

      setCycles(merged)
      setLoading(false)
    }

    load()
  }, [])

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Operations</p>
              <h1 className="mt-2 text-4xl font-bold">Cycles</h1>
              <p className="mt-2 text-sm text-gray-500">
                Monthly campaigns and operational containers.
              </p>
            </div>
            <Link
              href="/cycles/new"
              className="mt-1 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              + New Cycle
            </Link>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
              ⚠ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="mt-10 grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && cycles.length === 0 && !error && (
            <div className="mt-20 text-center">
              <p className="text-gray-500">No cycles yet.</p>
              <Link
                href="/cycles/new"
                className="mt-4 inline-block rounded-xl border border-gray-300 px-5 py-2.5 text-sm text-gray-300 transition hover:border-neutral-500 hover:text-gray-900"
              >
                Create your first cycle
              </Link>
            </div>
          )}

          {/* Cycle list */}
          {!loading && cycles.length > 0 && (
            <div className="mt-8 grid gap-4">
              {cycles.map((cycle) => (
                <Link
                  key={cycle.id}
                  href={`/cycles/${cycle.id}`}
                  className="group block rounded-2xl border border-gray-200 bg-gray-50 p-6 transition hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <h2 className="text-xl font-bold text-gray-900 group-hover:text-neutral-100">
                        {cycle.title || `${cycle.month} ${cycle.year}`}
                      </h2>

                      {/* Meta row */}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        {cycle.client_name && (
                          <span className="text-gray-400">{cycle.client_name}</span>
                        )}
                        <span className="text-gray-700">·</span>
                        <span className="text-gray-500">{cycle.month} {cycle.year}</span>
                        {cycle.start_date && cycle.end_date && (
                          <>
                            <span className="text-gray-700">·</span>
                            <span className="text-gray-500">
                              {new Date(cycle.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              {" — "}
                              {new Date(cycle.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`text-sm font-medium ${STATUS_COLORS[cycle.status] ?? "text-gray-400"}`}>
                        {STATUS_LABELS[cycle.status] ?? cycle.status}
                      </span>
                      <span className="text-xs text-gray-600">
                        {cycle.deliverable_count} deliverable{cycle.deliverable_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

        </div>
      </section>
    </main>
  )
}
