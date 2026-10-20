"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUSES   = ["received", "processing", "completed", "failed", "ignored"]
const PRIORITIES = ["Low", "Medium", "High", "Urgent"]

const STATUS_STYLES: Record<string, string> = {
  "received":   "border-blue-800   bg-blue-950/40   text-blue-300",
  "processing": "border-yellow-800 bg-yellow-950/40 text-yellow-300",
  "completed":  "border-green-800  bg-green-950/40  text-green-300",
  "failed":     "border-red-800    bg-red-950/40    text-red-300",
  "ignored":    "border-gray-200 bg-white  text-gray-500",
}

const PRIORITY_STYLES: Record<string, string> = {
  "Low":    "text-gray-500",
  "Medium": "text-blue-400",
  "High":   "text-yellow-400",
  "Urgent": "text-red-400",
}

// ─── Interpretation engine ─────────────────────────────────────────────────────

type InterpretResult = {
  interpreted_intent: string
  assigned_agent: string
}

function interpretMessage(raw: string): InterpretResult {
  const msg = raw.toLowerCase()

  if (msg.includes("content idea") || msg.includes("content ideas")) {
    return { interpreted_intent: "content_ideation",  assigned_agent: "Strategy Agent"        }
  }
  if (msg.includes("caption")) {
    return { interpreted_intent: "copywriting",       assigned_agent: "Copywriting Agent"     }
  }
  if (msg.includes("image") || msg.includes("visual")) {
    return { interpreted_intent: "ai_image",          assigned_agent: "AI Image Agent"        }
  }
  if (msg.includes("video") || msg.includes("reel")) {
    return { interpreted_intent: "ai_video",          assigned_agent: "AI Video Agent"        }
  }
  if (msg.includes(" ad ") || msg.includes("ads") || msg.includes("campaign")) {
    return { interpreted_intent: "paid_ads",          assigned_agent: "Paid Ads Agent"        }
  }
  return   { interpreted_intent: "general_request",  assigned_agent: "Jarvis Orchestrator"   }
}

const INTENT_STYLES: Record<string, string> = {
  "content_ideation": "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  "copywriting":      "border-blue-800    bg-blue-950/40    text-blue-300",
  "ai_image":         "border-purple-800  bg-purple-950/40  text-purple-300",
  "ai_video":         "border-pink-800    bg-pink-950/40    text-pink-300",
  "paid_ads":         "border-yellow-800  bg-yellow-950/40  text-yellow-300",
  "general_request":  "border-gray-300 bg-white    text-gray-400",
}

const AGENT_STYLES: Record<string, string> = {
  "Strategy Agent":       "text-emerald-400",
  "Copywriting Agent":    "text-blue-400",
  "AI Image Agent":       "text-purple-400",
  "AI Video Agent":       "text-pink-400",
  "Paid Ads Agent":       "text-yellow-400",
  "Jarvis Orchestrator":  "text-gray-300",
}

const PLAN_STATUS_STYLES: Record<string, string> = {
  "draft":       "border-gray-300 bg-white    text-gray-400",
  "approved":    "border-green-800   bg-green-950/40   text-green-300",
  "in_progress": "border-yellow-800  bg-yellow-950/40  text-yellow-300",
  "completed":   "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  "cancelled":   "border-red-800     bg-red-950/40     text-red-300",
}

// ─── Plan engine ───────────────────────────────────────────────────────────────

type PlanStep = { step: number; title: string }

type PlanTemplate = {
  plan_title:   string
  plan_summary: string
  steps:        PlanStep[]
}

const PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  content_ideation: {
    plan_title:   "Content Ideation Plan",
    plan_summary: "Generate platform-specific content ideas for client review and approval.",
    steps: [
      { step: 1, title: "Identify client and cycle context" },
      { step: 2, title: "Review existing deliverables" },
      { step: 3, title: "Generate content angles" },
      { step: 4, title: "Group ideas by platform" },
      { step: 5, title: "Present ideas for Calvin approval" },
    ],
  },
  copywriting: {
    plan_title:   "Copywriting Execution Plan",
    plan_summary: "Draft platform-ready copy options aligned with brand tone.",
    steps: [
      { step: 1, title: "Identify deliverable and context" },
      { step: 2, title: "Review brand tone guidelines" },
      { step: 3, title: "Draft copy options" },
      { step: 4, title: "Prepare variants" },
      { step: 5, title: "Await Calvin approval" },
    ],
  },
  ai_image: {
    plan_title:   "AI Image Generation Plan",
    plan_summary: "Prepare visual references and prompts for AI image generation.",
    steps: [
      { step: 1, title: "Collect visual references" },
      { step: 2, title: "Check client asset library" },
      { step: 3, title: "Draft image prompt" },
      { step: 4, title: "Generate or prepare output" },
      { step: 5, title: "Run quality check" },
    ],
  },
  ai_video: {
    plan_title:   "AI Video Production Plan",
    plan_summary: "Define shot sequence and prepare motion directions for AI video generation.",
    steps: [
      { step: 1, title: "Define shot sequence" },
      { step: 2, title: "Collect source visuals" },
      { step: 3, title: "Draft Kling prompt" },
      { step: 4, title: "Prepare motion directions" },
      { step: 5, title: "Run quality check" },
    ],
  },
  paid_ads: {
    plan_title:   "Paid Ads Campaign Plan",
    plan_summary: "Identify campaign objectives and prepare creative direction for launch approval.",
    steps: [
      { step: 1, title: "Identify campaign objective" },
      { step: 2, title: "Review creatives" },
      { step: 3, title: "Draft ad angles" },
      { step: 4, title: "Prepare audience direction" },
      { step: 5, title: "Await launch approval" },
    ],
  },
  general_request: {
    plan_title:   "General Request Execution Plan",
    plan_summary: "Clarify request scope and route to the appropriate agent.",
    steps: [
      { step: 1, title: "Clarify request scope" },
      { step: 2, title: "Identify required agent" },
      { step: 3, title: "Create execution path" },
      { step: 4, title: "Await confirmation" },
    ],
  },
}

// ─── Types ──────────────────────────────────────────────────────────────────────

type TelegramCommand = {
  id: string
  created_at: string
  source: string
  sender: string | null
  raw_message: string
  interpreted_intent: string | null
  client_id: string | null
  monthly_cycle_id: string | null
  deliverable_id: string | null
  status: string
  priority: string | null
  assigned_agent: string | null
  result_summary: string | null
}

type CommandPlan = {
  id: string
  command_id: string
  assigned_agent: string | null
  plan_title: string | null
  plan_summary: string | null
  steps: PlanStep[] | null
  status: string
  created_at: string
}

type AgentTask = {
  id: string
  plan_id: string
  command_id: string
  assigned_agent: string | null
  title: string
  status: string
  priority: string | null
  position: number
}

const TASK_STATUS_STYLES: Record<string, string> = {
  "not_started": "border-gray-300  bg-white    text-gray-400",
  "in_progress": "border-yellow-800   bg-yellow-950/40  text-yellow-300",
  "completed":   "border-green-800    bg-green-950/40   text-green-300",
  "blocked":     "border-red-800      bg-red-950/40     text-red-300",
}

const TASK_STATUSES = ["not_started", "in_progress", "completed", "blocked"]

type CommandForm = {
  raw_message: string
  sender: string
  priority: string
  interpreted_intent: string
}

const EMPTY_FORM: CommandForm = {
  raw_message: "",
  sender: "Calvin",
  priority: "",
  interpreted_intent: "",
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function CommandsPage() {
  const [commands,  setCommands]  = useState<TelegramCommand[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState("")

  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState<CommandForm>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [saveErr,   setSaveErr]   = useState("")
  const [saveOk,    setSaveOk]    = useState("")

  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [interpreting, setInterpreting] = useState<string | null>(null)
  const [plans,        setPlans]        = useState<Record<string, CommandPlan>>({}) // keyed by command_id
  const [planning,     setPlanning]     = useState<string | null>(null)
  const [tasks,        setTasks]        = useState<Record<string, AgentTask[]>>({}) // keyed by plan_id
  const [approving,    setApproving]    = useState<string | null>(null) // plan id being approved

  // Pipeline checklist counts keyed by command_id, with 5-min TTL
  type PipelineCounts = { tasks: number; sandbox: number; queue: number; reviews: number; fetchedAt: number }
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, PipelineCounts>>({})
  const PIPELINE_TTL_MS = 5 * 60 * 1000 // 5 minutes
  // The "updated Ns ago" label reads this clock rather than calling Date.now()
  // while rendering: a value read during render is impure, and it would freeze
  // at whatever the last unrelated re-render happened to produce.
  const [clockMs, setClockMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchCommands = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from("telegram_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (err) {
      setError(err.message)
    } else {
      setCommands(data ?? [])
    }
    setLoading(false)
  }, [])

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from("command_plans")
      .select("*")
      .order("created_at", { ascending: false })

    if (data) {
      const map: Record<string, CommandPlan> = {}
      data.forEach((p) => { map[p.command_id] = p })
      setPlans(map)
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("agent_tasks")
      .select("id, plan_id, command_id, assigned_agent, title, status, priority, position")
      .order("position", { ascending: true })

    if (data) {
      const map: Record<string, AgentTask[]> = {}
      data.forEach((t) => {
        if (!map[t.plan_id]) map[t.plan_id] = []
        map[t.plan_id].push(t)
      })
      setTasks(map)
    }
  }, [])

  useEffect(() => {
    fetchCommands()
    fetchPlans()
    fetchTasks()
  }, [fetchCommands, fetchPlans, fetchTasks])

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form.raw_message.trim()) { setSaveErr("Message is required."); return }

    setSaving(true)
    setSaveErr("")
    setSaveOk("")

    const { error: err } = await supabase
      .from("telegram_commands")
      .insert({
        source:             "manual",
        sender:             form.sender.trim() || "Calvin",
        raw_message:        form.raw_message.trim(),
        interpreted_intent: form.interpreted_intent.trim() || null,
        priority:           form.priority || null,
        status:             "received",
      })

    if (err) {
      setSaveErr(`Failed: ${err.message}`)
      setSaving(false)
      return
    }

    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaveOk("Command logged.")
    setTimeout(() => setSaveOk(""), 3000)
    fetchCommands()
    setSaving(false)
  }

  function set(key: keyof CommandForm, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  // ── Interpret ───────────────────────────────────────────────────────────────

  // ── Pipeline checklist fetch ─────────────────────────────────────────────

  async function fetchPipelineCounts(cmdId: string, force = false) {
    // Respect TTL — skip if fetched within the last 5 minutes (unless forced)
    const cached = pipelineCounts[cmdId]
    // Read inside an async click/refresh handler, never during render, so the
    // impurity rule does not apply: the TTL needs the time at call time.
    // eslint-disable-next-line react-hooks/purity
    if (!force && cached && Date.now() - cached.fetchedAt < PIPELINE_TTL_MS) return

    const [taskRes, sandboxRes, queueRes] = await Promise.all([
      supabase.from("agent_tasks").select("id", { count: "exact", head: true }).eq("command_id", cmdId),
      supabase.from("sandbox_runs").select("id", { count: "exact", head: true }).eq("command_id", cmdId),
      supabase.from("execution_queue").select("id", { count: "exact", head: true }).eq("command_id", cmdId),
    ])

    const taskCount    = taskRes.count    ?? 0
    const sandboxCount = sandboxRes.count ?? 0
    const queueCount   = queueRes.count   ?? 0

    // Reviews: fetch queue ids for this command, then count reviews
    let reviewCount = 0
    if (queueCount > 0) {
      const { data: qids } = await supabase
        .from("execution_queue").select("id").eq("command_id", cmdId)
      if (qids && qids.length > 0) {
        const { count } = await supabase
          .from("execution_reviews")
          .select("id", { count: "exact", head: true })
          .in("execution_queue_id", qids.map((q) => q.id))
        reviewCount = count ?? 0
      }
    }

    setPipelineCounts((prev) => ({
      ...prev,
      [cmdId]: { tasks: taskCount, sandbox: sandboxCount, queue: queueCount, reviews: reviewCount, fetchedAt: Date.now() },
    }))
  }

  async function handleInterpret(cmd: TelegramCommand) {
    setInterpreting(cmd.id)

    const { interpreted_intent, assigned_agent } = interpretMessage(cmd.raw_message)

    const { error } = await supabase
      .from("telegram_commands")
      .update({
        interpreted_intent,
        assigned_agent,
        status:         "processing",
        result_summary: `Command interpreted and routed to ${assigned_agent}.`,
      })
      .eq("id", cmd.id)

    if (!error) fetchCommands()
    setInterpreting(null)
  }

  // ── Approve plan → create tasks ────────────────────────────────────────────

  async function handleApprovePlan(cmd: TelegramCommand, plan: CommandPlan) {
    setApproving(plan.id)

    // 1. Mark plan approved
    await supabase
      .from("command_plans")
      .update({ status: "approved" })
      .eq("id", plan.id)

    // 2. Mark command as planned
    await supabase
      .from("telegram_commands")
      .update({ status: "processing", result_summary: `Plan approved. ${plan.steps?.length ?? 0} tasks created.` })
      .eq("id", cmd.id)

    // 3. Delete any existing tasks for this plan (clean re-create)
    await supabase
      .from("agent_tasks")
      .delete()
      .eq("plan_id", plan.id)

    // 4. Insert one task per step
    if (plan.steps && plan.steps.length > 0) {
      const rows = plan.steps.map((s) => ({
        command_id:     cmd.id,
        plan_id:        plan.id,
        assigned_agent: plan.assigned_agent,
        title:          s.title,
        status:         "not_started",
        position:       s.step,
      }))
      await supabase.from("agent_tasks").insert(rows)
    }

    await Promise.all([fetchCommands(), fetchPlans(), fetchTasks()])
    setApproving(null)
  }

  // ── Generate plan ──────────────────────────────────────────────────────────

  async function handleGeneratePlan(cmd: TelegramCommand) {
    if (!cmd.interpreted_intent) return
    setPlanning(cmd.id)

    const template = PLAN_TEMPLATES[cmd.interpreted_intent] ?? PLAN_TEMPLATES.general_request
    const existingPlan = plans[cmd.id]

    if (existingPlan) {
      // Update existing plan
      await supabase
        .from("command_plans")
        .update({
          plan_title:    template.plan_title,
          plan_summary:  template.plan_summary,
          steps:         template.steps,
          assigned_agent: cmd.assigned_agent,
          status:        "draft",
        })
        .eq("id", existingPlan.id)
    } else {
      // Insert new plan
      await supabase
        .from("command_plans")
        .insert({
          command_id:    cmd.id,
          assigned_agent: cmd.assigned_agent,
          plan_title:    template.plan_title,
          plan_summary:  template.plan_summary,
          steps:         template.steps,
          status:        "draft",
        })
    }

    // Update command status to planned
    await supabase
      .from("telegram_commands")
      .update({ status: "processing", result_summary: `Plan generated: ${template.plan_title}` })
      .eq("id", cmd.id)

    await Promise.all([fetchCommands(), fetchPlans()])
    setPlanning(null)
  }

  // ── Counts ──────────────────────────────────────────────────────────────────

  const counts = {
    total:      commands.length,
    received:   commands.filter((c) => c.status === "received").length,
    processing: commands.filter((c) => c.status === "processing").length,
    completed:  commands.filter((c) => c.status === "completed").length,
    failed:     commands.filter((c) => c.status === "failed").length,
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Internal</p>
              <h1 className="mt-2 text-4xl font-bold">Command Intake</h1>
              <p className="mt-2 text-sm text-gray-500">
                Structured log of all operator commands. Future: live from Telegram bot.
              </p>
            </div>
            <button
              onClick={() => { setShowForm((v) => !v); setSaveErr("") }}
              className="mt-1 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              {showForm ? "Cancel" : "+ Log Command"}
            </button>
          </div>

          {/* Status counters */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Total",      value: counts.total,      color: "text-gray-900" },
              { label: "Received",   value: counts.received,   color: "text-blue-400" },
              { label: "Processing", value: counts.processing, color: "text-yellow-400" },
              { label: "Completed",  value: counts.completed,  color: "text-green-400" },
              { label: "Failed",     value: counts.failed,     color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
                <p className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Manual log form */}
          {showForm && (
            <div className="mt-6 rounded-2xl border border-gray-300 bg-gray-50 p-8">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Log Command Manually
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Message *
                  </label>
                  <textarea
                    autoFocus
                    value={form.raw_message}
                    onChange={(e) => set("raw_message", e.target.value)}
                    placeholder='e.g. "Create 5 content ideas for DemoClientD May calendar"'
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-200 bg-black px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Sender
                  </label>
                  <input
                    type="text"
                    value={form.sender}
                    onChange={(e) => set("sender", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => set("priority", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none"
                  >
                    <option value="">— None —</option>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Interpreted Intent{" "}
                    <span className="normal-case text-gray-600">(optional — manual override)</span>
                  </label>
                  <input
                    type="text"
                    value={form.interpreted_intent}
                    onChange={(e) => set("interpreted_intent", e.target.value)}
                    placeholder="e.g. generate_content_ideas"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                  />
                </div>

              </div>

              {saveErr && (
                <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                  ⚠ {saveErr}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                >
                  {saving ? "Logging..." : "Log Command"}
                </button>
                <button
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveErr("") }}
                  className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm text-gray-400 transition hover:text-gray-900"
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

          {/* Error */}
          {error && (
            <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
              ⚠ {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="mt-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && commands.length === 0 && !error && (
            <div className="mt-20 text-center">
              <p className="text-sm text-gray-600">No commands yet.</p>
              <p className="mt-1 text-xs text-gray-700">Use the form above to log a manual command.</p>
            </div>
          )}

          {/* Command list */}
          {!loading && commands.length > 0 && (
            <div className="mt-8 space-y-3">
              {commands.map((cmd) => {
                const isOpen = expanded === cmd.id
                return (
                  <div
                    key={cmd.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 transition hover:border-gray-300"
                  >
                    {/* Row */}
                    <button
                      onClick={() => {
                        const opening = !isOpen
                        setExpanded(opening ? cmd.id : null)
                        if (opening) fetchPipelineCounts(cmd.id)
                      }}
                      className="flex w-full items-start gap-4 p-5 text-left"
                    >
                      {/* Status badge */}
                      <span className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[cmd.status] ?? "border-gray-300 bg-white text-gray-400"}`}>
                        {cmd.status}
                      </span>

                      {/* Main content */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {cmd.raw_message}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {cmd.sender && (
                            <span className="text-gray-500">{cmd.sender}</span>
                          )}
                          {cmd.source !== "telegram" && (
                            <span className="rounded border border-gray-200 px-1.5 py-0.5 text-gray-600">
                              {cmd.source}
                            </span>
                          )}
                          {cmd.priority && (
                            <span className={`font-medium ${PRIORITY_STYLES[cmd.priority] ?? ""}`}>
                              {cmd.priority}
                            </span>
                          )}
                          {/* Intent badge */}
                          {cmd.interpreted_intent && (
                            <span className={`rounded-full border px-2.5 py-0.5 font-medium ${INTENT_STYLES[cmd.interpreted_intent] ?? "border-gray-300 bg-white text-gray-400"}`}>
                              {cmd.interpreted_intent.replace(/_/g, " ")}
                            </span>
                          )}
                          {/* Agent badge */}
                          {cmd.assigned_agent && (
                            <span className={`font-medium ${AGENT_STYLES[cmd.assigned_agent] ?? "text-gray-400"}`}>
                              → {cmd.assigned_agent}
                            </span>
                          )}
                          <span className="ml-auto text-gray-700">{fmt(cmd.created_at)}</span>
                        </div>
                      </div>

                      <span className="shrink-0 text-xs text-gray-600">{isOpen ? "▲" : "▼"}</span>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-gray-200 px-5 pb-5 pt-4">
                        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">

                          {cmd.interpreted_intent && (
                            <div className="sm:col-span-2">
                              <p className="mb-1 text-xs uppercase tracking-wider text-gray-600">Intent</p>
                              <p className="font-mono text-sm text-gray-300">{cmd.interpreted_intent}</p>
                            </div>
                          )}

                          {cmd.result_summary && (
                            <div className="sm:col-span-2">
                              <p className="mb-1 text-xs uppercase tracking-wider text-gray-600">Result</p>
                              <p className="text-sm text-gray-300">{cmd.result_summary}</p>
                            </div>
                          )}

                          <div>
                            <p className="mb-1 text-xs uppercase tracking-wider text-gray-600">ID</p>
                            <p className="font-mono text-xs text-gray-500">{cmd.id}</p>
                          </div>

                          <div>
                            <p className="mb-1 text-xs uppercase tracking-wider text-gray-600">Timestamp</p>
                            <p className="text-xs text-gray-400">
                              {new Date(cmd.created_at).toLocaleString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit", second: "2-digit",
                              })}
                            </p>
                          </div>

                          {(cmd.client_id || cmd.monthly_cycle_id || cmd.deliverable_id) && (
                            <div className="sm:col-span-2">
                              <p className="mb-2 text-xs uppercase tracking-wider text-gray-600">Links</p>
                              <div className="flex flex-wrap gap-2">
                                {cmd.client_id && (
                                  <span className="rounded-full border border-gray-300 px-2.5 py-0.5 text-xs text-gray-400">
                                    Client linked
                                  </span>
                                )}
                                {cmd.monthly_cycle_id && (
                                  <Link href={`/cycles/${cmd.monthly_cycle_id}`}
                                    className="rounded-full border border-blue-800 bg-blue-950/30 px-2.5 py-0.5 text-xs text-blue-300 transition hover:bg-blue-950/60">
                                    → Cycle
                                  </Link>
                                )}
                                {cmd.deliverable_id && (
                                  <Link href={`/deliverables/${cmd.deliverable_id}`}
                                    className="rounded-full border border-purple-800 bg-purple-950/30 px-2.5 py-0.5 text-xs text-purple-300 transition hover:bg-purple-950/60">
                                    → Deliverable
                                  </Link>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Workflow Checklist */}
                          <div className="sm:col-span-2">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                Pipeline Checklist
                              </p>
                              <button
                                onClick={(e) => { e.stopPropagation(); fetchPipelineCounts(cmd.id, true) }}
                                className="text-[10px] text-gray-700 hover:text-gray-400 transition"
                                title="Refresh counts"
                              >
                                ↻ {pipelineCounts[cmd.id]
                                  ? `updated ${Math.round((clockMs - pipelineCounts[cmd.id].fetchedAt) / 1000)}s ago`
                                  : "refresh"}
                              </button>
                            </div>
                            {(() => {
                              const pc = pipelineCounts[cmd.id]
                              const plan = plans[cmd.id]
                              const planTasks = plan ? Object.values(tasks).flat().filter((t) => t.command_id === cmd.id) : []
                              const steps = [
                                {
                                  label: "Interpreted",
                                  done: !!cmd.interpreted_intent,
                                  detail: cmd.interpreted_intent ? cmd.interpreted_intent.replace(/_/g, " ") : "pending",
                                },
                                {
                                  label: "Plan created",
                                  done: !!plan,
                                  detail: plan ? (plan.plan_title ?? "untitled") : "no plan yet",
                                },
                                {
                                  label: "Tasks created",
                                  done: (pc?.tasks ?? planTasks.length) > 0,
                                  detail: pc ? `${pc.tasks} task${pc.tasks !== 1 ? "s" : ""}` : `${planTasks.length} task${planTasks.length !== 1 ? "s" : ""}`,
                                },
                                {
                                  label: "Sandbox runs",
                                  done: (pc?.sandbox ?? 0) > 0,
                                  detail: pc ? (pc.sandbox > 0 ? `${pc.sandbox} run${pc.sandbox !== 1 ? "s" : ""}` : "none yet") : "…",
                                },
                                {
                                  label: "Queued",
                                  done: (pc?.queue ?? 0) > 0,
                                  detail: pc ? (pc.queue > 0 ? `${pc.queue} item${pc.queue !== 1 ? "s" : ""}` : "none yet") : "…",
                                },
                                {
                                  label: "Reviewed",
                                  done: (pc?.reviews ?? 0) > 0,
                                  detail: pc ? (pc.reviews > 0 ? `${pc.reviews} review${pc.reviews !== 1 ? "s" : ""}` : "none yet") : "…",
                                },
                              ]
                              const completedCount = steps.filter((s) => s.done).length
                              const pct = Math.round((completedCount / steps.length) * 100)
                              return (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                                  {/* Progress bar */}
                                  <div className="mb-4 flex items-center justify-between">
                                    <span className="text-xs text-gray-600">{completedCount}/{steps.length} stages complete</span>
                                    <span className="font-mono text-xs text-gray-500">{pct}%</span>
                                  </div>
                                  <div className="mb-5 h-1.5 w-full rounded-full bg-white">
                                    <div
                                      className="h-1.5 rounded-full bg-violet-600 transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  {/* Steps */}
                                  <div className="space-y-2">
                                    {steps.map((step, i) => (
                                      <div key={step.label} className="flex items-center gap-3">
                                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                          step.done
                                            ? "bg-green-900/60 text-green-400"
                                            : "bg-white text-gray-700"
                                        }`}>
                                          {step.done ? "✓" : i + 1}
                                        </span>
                                        <span className={`text-xs font-medium ${step.done ? "text-gray-900" : "text-gray-600"}`}>
                                          {step.label}
                                        </span>
                                        <span className="ml-auto text-xs text-gray-700">{step.detail}</span>
                                      </div>
                                    ))}
                                  </div>
                                  {/* Pipeline hint */}
                                  <p className="mt-4 text-[10px] text-gray-800 border-t border-gray-200 pt-3">
                                    Task → Sandbox → Queue → Review (sandbox mandatory before queue)
                                  </p>
                                </div>
                              )
                            })()}
                          </div>

                          {/* Workflow trace link */}
                          <div className="sm:col-span-2">
                            <Link
                              href={`/workflow/${cmd.id}`}
                              className="inline-flex items-center gap-2 rounded-xl border border-violet-800 bg-violet-950/30 px-4 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-900/40"
                            >
                              🔗 View Workflow Timeline
                            </Link>
                          </div>

                          {/* Interpret action */}
                          <div className="sm:col-span-2">
                            <p className="mb-2 text-xs uppercase tracking-wider text-gray-600">Interpretation</p>
                            <div className="flex flex-wrap items-center gap-3">
                              {cmd.interpreted_intent ? (
                                <>
                                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${INTENT_STYLES[cmd.interpreted_intent] ?? "border-gray-300 bg-white text-gray-400"}`}>
                                    {cmd.interpreted_intent.replace(/_/g, " ")}
                                  </span>
                                  <span className={`text-sm font-medium ${AGENT_STYLES[cmd.assigned_agent ?? ""] ?? "text-gray-400"}`}>
                                    → {cmd.assigned_agent}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleInterpret(cmd) }}
                                    disabled={interpreting === cmd.id}
                                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-400 transition hover:border-neutral-500 hover:text-gray-900 disabled:opacity-40"
                                  >
                                    {interpreting === cmd.id ? "Re-interpreting…" : "↺ Re-interpret"}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleInterpret(cmd) }}
                                  disabled={interpreting === cmd.id}
                                  className="rounded-lg border border-blue-800 bg-blue-950/40 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-950/70 disabled:opacity-40"
                                >
                                  {interpreting === cmd.id ? "Interpreting…" : "⚡ Interpret Command"}
                                </button>
                              )}
                            </div>
                            {cmd.result_summary && (
                              <p className="mt-2 text-xs text-gray-600">{cmd.result_summary}</p>
                            )}
                          </div>

                          {/* Execution Plan */}
                          {cmd.interpreted_intent && (
                            <div className="sm:col-span-2">
                              <p className="mb-2 text-xs uppercase tracking-wider text-gray-600">Execution Plan</p>
                              {(() => {
                                const plan = plans[cmd.id]
                                if (!plan) {
                                  return (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleGeneratePlan(cmd) }}
                                      disabled={planning === cmd.id}
                                      className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/70 disabled:opacity-40"
                                    >
                                      {planning === cmd.id ? "Generating…" : "📋 Generate Plan"}
                                    </button>
                                  )
                                }

                                return (
                                  <div className="rounded-xl border border-gray-200 bg-black p-5">
                                    {/* Plan header */}
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <div className="flex items-center gap-2.5">
                                          <h4 className="text-sm font-semibold text-gray-900">{plan.plan_title}</h4>
                                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_STYLES[plan.status] ?? "border-gray-300 text-gray-400"}`}>
                                            {plan.status}
                                          </span>
                                        </div>
                                        {plan.plan_summary && (
                                          <p className="mt-1 text-xs text-gray-500">{plan.plan_summary}</p>
                                        )}
                                        {plan.assigned_agent && (
                                          <p className={`mt-1 text-xs font-medium ${AGENT_STYLES[plan.assigned_agent] ?? "text-gray-400"}`}>
                                            → {plan.assigned_agent}
                                          </p>
                                        )}
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleGeneratePlan(cmd) }}
                                        disabled={planning === cmd.id}
                                        className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-400 transition hover:border-neutral-500 hover:text-gray-900 disabled:opacity-40"
                                      >
                                        {planning === cmd.id ? "Regenerating…" : "↺ Regenerate"}
                                      </button>
                                    </div>

                                    {/* Steps */}
                                    {plan.steps && plan.steps.length > 0 && (
                                      <ol className="mt-4 space-y-2">
                                        {plan.steps.map((s) => (
                                          <li key={s.step} className="flex items-start gap-3">
                                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500">
                                              {s.step}
                                            </span>
                                            <span className="text-sm text-gray-300">{s.title}</span>
                                          </li>
                                        ))}
                                      </ol>
                                    )}

                                    {/* Plan actions */}
                                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
                                      {plan.status === "draft" && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleApprovePlan(cmd, plan) }}
                                          disabled={approving === plan.id}
                                          className="rounded-lg border border-green-800 bg-green-950/40 px-4 py-2 text-sm font-semibold text-green-300 transition hover:bg-green-950/70 disabled:opacity-40"
                                        >
                                          {approving === plan.id ? "Approving…" : "✓ Approve Plan"}
                                        </button>
                                      )}
                                      {/* Manual status chips */}
                                      <div className="flex flex-wrap gap-2">
                                        {["draft", "approved", "in_progress", "completed", "cancelled"].map((s) => (
                                          <button
                                            key={s}
                                            onClick={async (e) => {
                                              e.stopPropagation()
                                              await supabase.from("command_plans").update({ status: s }).eq("id", plan.id)
                                              fetchPlans()
                                            }}
                                            className={`rounded-full border px-2.5 py-0.5 text-xs transition hover:opacity-80 ${
                                              plan.status === s
                                                ? (PLAN_STATUS_STYLES[s] ?? "border-gray-300 text-gray-400")
                                                : "border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-400"
                                            }`}
                                          >
                                            {s.replace(/_/g, " ")}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Tasks created from this plan */}
                                    {(() => {
                                      const planTasks = tasks[plan.id] ?? []
                                      if (planTasks.length === 0) return null
                                      return (
                                        <div className="mt-4 border-t border-gray-200 pt-4">
                                          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Tasks ({planTasks.length})
                                          </p>
                                          <div className="space-y-2">
                                            {planTasks.map((task) => (
                                              <div key={task.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5">
                                                <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-600">
                                                  {task.position}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm text-gray-300">
                                                  {task.title}
                                                </span>
                                                {task.assigned_agent && (
                                                  <span className={`shrink-0 text-xs font-medium ${AGENT_STYLES[task.assigned_agent] ?? "text-gray-400"}`}>
                                                    {task.assigned_agent}
                                                  </span>
                                                )}
                                                {/* Inline task status */}
                                                <select
                                                  value={task.status}
                                                  onClick={(e) => e.stopPropagation()}
                                                  onChange={async (e) => {
                                                    e.stopPropagation()
                                                    await supabase
                                                      .from("agent_tasks")
                                                      .update({ status: e.target.value })
                                                      .eq("id", task.id)
                                                    fetchTasks()
                                                  }}
                                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs focus:outline-none ${TASK_STATUS_STYLES[task.status] ?? "border-gray-300 bg-white text-gray-400"}`}
                                                >
                                                  {TASK_STATUSES.map((s) => (
                                                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                                                  ))}
                                                </select>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )
                              })()}
                            </div>
                          )}

                          {/* Status update inline */}
                          <div className="sm:col-span-2">
                            <p className="mb-2 text-xs uppercase tracking-wider text-gray-600">Update Status</p>
                            <div className="flex flex-wrap gap-2">
                              {STATUSES.map((s) => (
                                <button
                                  key={s}
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    await supabase
                                      .from("telegram_commands")
                                      .update({ status: s })
                                      .eq("id", cmd.id)
                                    fetchCommands()
                                  }}
                                  className={`rounded-full border px-2.5 py-0.5 text-xs transition hover:opacity-80 ${
                                    cmd.status === s
                                      ? (STATUS_STYLES[s] ?? "border-gray-300 text-gray-400")
                                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-400"
                                  }`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>

                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </section>
    </main>
  )
}
