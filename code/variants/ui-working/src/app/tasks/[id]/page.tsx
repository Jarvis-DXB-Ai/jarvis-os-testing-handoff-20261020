"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import AgentContextPreview from "@/components/AgentContextPreview"
import PromptAssemblyPreview from "@/components/PromptAssemblyPreview"
import { fetchAgentContext, type CtxData } from "@/lib/agentContext"

// ─── Constants ─────────────────────────────────────────────────────────────────

const TASK_STATUSES = ["not_started", "in_progress", "completed", "blocked"]
const OUTPUT_TYPES  = ["Notes", "Draft", "Research", "Copy", "Image URL", "Video URL", "Report", "Reference", "Other"]

const TASK_STATUS_STYLES: Record<string, string> = {
  "not_started": "border-gray-300  bg-white    text-gray-400",
  "in_progress": "border-yellow-800   bg-yellow-950/40  text-yellow-300",
  "completed":   "border-green-800    bg-green-950/40   text-green-300",
  "blocked":     "border-red-800      bg-red-950/40     text-red-300",
}

const AGENT_STYLES: Record<string, string> = {
  "Strategy Agent":      "text-emerald-400",
  "Copywriting Agent":   "text-blue-400",
  "AI Image Agent":      "text-purple-400",
  "AI Video Agent":      "text-pink-400",
  "Paid Ads Agent":      "text-yellow-400",
  "Jarvis Orchestrator": "text-gray-300",
}

// ─── Types ──────────────────────────────────────────────────────────────────────

type AgentTask = {
  id: string
  created_at: string
  command_id: string | null
  plan_id: string | null
  deliverable_id: string | null
  assigned_agent: string | null
  title: string
  description: string | null
  status: string
  priority: string | null
  position: number
}

type TaskOutput = {
  id: string
  created_at: string
  task_id: string
  output_type: string | null
  title: string | null
  content: string | null
  url: string | null
  status: string
}

type OutputForm = {
  output_type: string
  title: string
  content: string
  url: string
}

const EMPTY_OUTPUT_FORM: OutputForm = {
  output_type: "",
  title: "",
  content: "",
  url: "",
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [task,         setTask]         = useState<AgentTask | null>(null)
  const [outputs,      setOutputs]      = useState<TaskOutput[]>([])
  const [rawMessage,   setRawMessage]   = useState<string | null>(null)
  const [ctx,          setCtx]          = useState<CtxData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState("")

  // Output form
  const [showForm,     setShowForm]     = useState(false)
  const [outputForm,   setOutputForm]   = useState<OutputForm>(EMPTY_OUTPUT_FORM)
  const [saving,       setSaving]       = useState(false)
  const [saveErr,      setSaveErr]      = useState("")
  const [saveOk,       setSaveOk]       = useState("")

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchTask = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("id", id)
      .single()

    if (err) { setError(err.message); return }
    setTask(data)

    // Fetch linked command for context
    if (data.command_id) {
      const { data: cmd } = await supabase
        .from("telegram_commands")
        .select("raw_message")
        .eq("id", data.command_id)
        .single()
      setRawMessage(cmd?.raw_message ?? null)
    }
  }, [id])

  const fetchOutputs = useCallback(async () => {
    const { data } = await supabase
      .from("agent_task_outputs")
      .select("*")
      .eq("task_id", id)
      .order("created_at", { ascending: false })

    setOutputs(data ?? [])
  }, [id])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchTask(), fetchOutputs()])
      setLoading(false)
    }
    load()
  }, [fetchTask, fetchOutputs])

  // Fetch agent context once task is loaded
  useEffect(() => {
    if (!task) return
    fetchAgentContext(task).then(setCtx)
  }, [task])

  // ── Status update ────────────────────────────────────────────────────────────

  async function handleStatusChange(newStatus: string) {
    if (!task) return
    setUpdatingStatus(true)
    const { data, error: err } = await supabase
      .from("agent_tasks")
      .update({ status: newStatus })
      .eq("id", id)
      .select()
      .single()

    if (!err && data) setTask(data)
    setUpdatingStatus(false)
  }

  // ── Add output ───────────────────────────────────────────────────────────────

  async function handleAddOutput() {
    if (!outputForm.title.trim() && !outputForm.content.trim()) {
      setSaveErr("Add at least a title or content.")
      return
    }

    setSaving(true)
    setSaveErr("")
    setSaveOk("")

    const { error: err } = await supabase
      .from("agent_task_outputs")
      .insert({
        task_id:     id,
        output_type: outputForm.output_type || null,
        title:       outputForm.title.trim()   || null,
        content:     outputForm.content.trim() || null,
        url:         outputForm.url.trim()     || null,
        status:      "active",
      })

    if (err) {
      setSaveErr(`Failed: ${err.message}`)
      setSaving(false)
      return
    }

    setOutputForm(EMPTY_OUTPUT_FORM)
    setShowForm(false)
    setSaveOk("Output saved.")
    setTimeout(() => setSaveOk(""), 3000)
    fetchOutputs()
    setSaving(false)
  }

  function setField(key: keyof OutputForm, value: string) {
    setOutputForm((p) => ({ ...p, [key]: value }))
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-3xl">

          <button
            onClick={() => router.push("/tasks")}
            className="mb-8 text-sm text-gray-500 transition hover:text-gray-300"
          >
            ← Tasks
          </button>

          {loading && <p className="text-sm text-gray-500">Loading...</p>}

          {!loading && error && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">⚠ {error}</div>
          )}

          {!loading && task && (
            <>
              {/* ── Task header ─────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Step {task.position}</span>
                  {task.assigned_agent && (
                    <>
                      <span className="text-gray-800">·</span>
                      <span className={`text-sm font-medium ${AGENT_STYLES[task.assigned_agent] ?? "text-gray-400"}`}>
                        {task.assigned_agent}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="mt-2 text-3xl font-bold">{task.title}</h1>

                {rawMessage && (
                  <p className="mt-3 text-sm text-gray-500">
                    ↳ From command: <span className="text-gray-400">&quot;{rawMessage}&quot;</span>
                  </p>
                )}

                {task.description && (
                  <p className="mt-3 text-sm text-gray-400">{task.description}</p>
                )}
              </div>

              {/* ── Status ──────────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs uppercase tracking-wider text-gray-600">Status</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${TASK_STATUS_STYLES[task.status] ?? "border-gray-300 bg-white text-gray-400"}`}>
                    {task.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TASK_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={updatingStatus || task.status === s}
                      className={`rounded-full border px-3 py-1 text-xs transition hover:opacity-80 disabled:cursor-not-allowed ${
                        task.status === s
                          ? (TASK_STATUS_STYLES[s] ?? "border-gray-300 bg-white text-gray-400")
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-300"
                      }`}
                    >
                      {s.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Outputs ─────────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Outputs</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Notes, drafts, links, and results for this task.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowForm((v) => !v); setSaveErr("") }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-300 transition hover:border-neutral-500 hover:text-gray-900"
                  >
                    {showForm ? "Cancel" : "+ Add Output"}
                  </button>
                </div>

                {/* Add output form */}
                {showForm && (
                  <div className="mt-5 rounded-xl border border-gray-300 bg-black p-5">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                      New Output
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                          Output Type
                        </label>
                        <select
                          value={outputForm.output_type}
                          onChange={(e) => setField("output_type", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-gray-300 focus:outline-none"
                        >
                          <option value="">— Select type —</option>
                          {OUTPUT_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                          Title
                        </label>
                        <input
                          type="text"
                          value={outputForm.title}
                          onChange={(e) => setField("title", e.target.value)}
                          placeholder="e.g. First strategy notes"
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                          Content
                        </label>
                        <textarea
                          autoFocus
                          value={outputForm.content}
                          onChange={(e) => setField("content", e.target.value)}
                          placeholder="Notes, draft copy, research findings, instructions..."
                          rows={5}
                          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                          URL
                        </label>
                        <input
                          type="text"
                          value={outputForm.url}
                          onChange={(e) => setField("url", e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:outline-none"
                        />
                      </div>

                    </div>

                    {saveErr && (
                      <div className="mt-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                        ⚠ {saveErr}
                      </div>
                    )}

                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={handleAddOutput}
                        disabled={saving}
                        className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Output"}
                      </button>
                      <button
                        onClick={() => { setShowForm(false); setOutputForm(EMPTY_OUTPUT_FORM); setSaveErr("") }}
                        className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-400 transition hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Success */}
                {saveOk && (
                  <div className="mt-4 rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                    ✓ {saveOk}
                  </div>
                )}

                {/* Output list */}
                <div className="mt-5 space-y-3">
                  {outputs.length === 0 && !showForm && (
                    <p className="text-sm text-gray-600">No outputs yet. Add the first one above.</p>
                  )}

                  {outputs.map((out) => (
                    <div
                      key={out.id}
                      className="rounded-xl border border-gray-200 bg-black p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {out.output_type && (
                              <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-400">
                                {out.output_type}
                              </span>
                            )}
                            {out.title && (
                              <span className="font-semibold text-gray-900">{out.title}</span>
                            )}
                          </div>

                          {out.content && (
                            <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                              {out.content}
                            </p>
                          )}

                          {out.url && (
                            <a
                              href={out.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 block truncate text-xs text-blue-400 transition hover:text-blue-300"
                            >
                              {out.url}
                            </a>
                          )}
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-gray-700">{fmt(out.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Agent Context Preview ────────────────────────────────────── */}
              {ctx && (
                <AgentContextPreview
                  ctx={ctx}
                  taskTitle={task.title}
                  taskDescription={task.description}
                  taskAgent={task.assigned_agent}
                  taskStatus={task.status}
                />
              )}

              {/* ── Prompt Assembly Preview ───────────────────────────────────── */}
              {ctx && (
                <PromptAssemblyPreview
                  ctx={ctx}
                  taskTitle={task.title}
                  taskDescription={task.description}
                />
              )}

              {/* ── Metadata ─────────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <h2 className="mb-4 text-lg font-semibold">Metadata</h2>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="text-gray-500">ID</div>
                  <div className="font-mono text-xs text-gray-400">{task.id}</div>
                  <div className="text-gray-500">Created</div>
                  <div className="text-gray-300">{fmt(task.created_at)}</div>
                  <div className="text-gray-500">Outputs</div>
                  <div className="text-gray-300">{outputs.length}</div>
                  {task.plan_id && (
                    <>
                      <div className="text-gray-500">Plan ID</div>
                      <div className="font-mono text-xs text-gray-400">{task.plan_id.slice(0, 8)}…</div>
                    </>
                  )}
                  {task.command_id && (
                    <>
                      <div className="text-gray-500">Command</div>
                      <div className="flex flex-wrap gap-2">
                        <Link href="/commands" className="text-xs text-blue-400 hover:underline">
                          Commands →
                        </Link>
                        <Link href={`/workflow/${task.command_id}`} className="text-xs text-violet-400 hover:underline">
                          🔗 Workflow →
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-8 pb-10" />
            </>
          )}

        </div>
      </section>
    </main>
  )
}
