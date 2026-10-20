"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

type CommandRow = {
  id: string
  created_at: string
  raw_message: string
  interpreted_intent: string | null
  assigned_agent: string | null
  status: string
}

const STATUS_STYLES: Record<string, string> = {
  received:   "border-blue-800   bg-blue-950/40   text-blue-300",
  processing: "border-yellow-800 bg-yellow-950/40 text-yellow-300",
  completed:  "border-green-800  bg-green-950/40  text-green-300",
  failed:     "border-red-800    bg-red-950/40    text-red-300",
}

export default function WorkflowIndexPage() {
  const [commands, setCommands] = useState<CommandRow[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("telegram_commands")
      .select("id, created_at, raw_message, interpreted_intent, assigned_agent, status")
      .order("created_at", { ascending: false })
      .limit(50)
    setCommands(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto p-10">
        <div className="mb-10">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-600">Operational Tracing</p>
          <h1 className="text-3xl font-bold text-gray-900">Workflow Inspector</h1>
          <p className="mt-2 text-sm text-gray-500">
            Select a command to trace its full execution pipeline end-to-end.
          </p>
        </div>

        {loading ? (
          <p className="text-gray-600 text-sm">Loading…</p>
        ) : commands.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-600">No commands yet.</p>
            <p className="mt-1 text-xs text-gray-700">Create a command to begin tracing a workflow.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {commands.map((cmd) => (
              <Link
                key={cmd.id}
                href={`/workflow/${cmd.id}`}
                className="block rounded-2xl border border-gray-200 bg-gray-50 p-5 transition hover:border-violet-800/60 hover:bg-white"
              >
                <div className="flex items-start gap-4">
                  <span className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[cmd.status] ?? "border-gray-300 bg-white text-gray-400"}`}>
                    {cmd.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{cmd.raw_message}</p>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-600">
                      {cmd.interpreted_intent && <span>{cmd.interpreted_intent.replace(/_/g, " ")}</span>}
                      {cmd.assigned_agent && <span>→ {cmd.assigned_agent}</span>}
                      <span className="ml-auto text-gray-700">{new Date(cmd.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-violet-600">🔗 trace →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
