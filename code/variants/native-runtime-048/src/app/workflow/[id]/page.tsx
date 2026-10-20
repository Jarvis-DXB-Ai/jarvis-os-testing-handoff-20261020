"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ─────────────────────────────────────────────────────────────────────

type Command = {
  id: string
  created_at: string
  raw_message: string
  interpreted_intent: string | null
  assigned_agent: string | null
  status: string
  client_id: string | null
  client?: { name: string } | null
}

type Plan = {
  id: string
  plan_title: string | null
  plan_summary: string | null
  status: string
  assigned_agent: string | null
}

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  assigned_agent: string | null
  priority: string | null
}

type SandboxRun = {
  id: string
  created_at: string
  run_type: string | null
  model: string | null
  status: string
  estimated_input_tokens: number | null
  estimated_cost: number | null
  task_id: string | null
}

type QueueItem = {
  id: string
  created_at: string
  queue_type: string | null
  status: string
  priority: string
  estimated_cost: number | null
  sandbox_run_id: string | null
  task_id: string | null
  command_id: string | null
  via_sandbox: boolean
  position: number
  model_pricing?: { model_name: string; display_name: string | null } | null
}

type Review = {
  id: string
  created_at: string
  status: string
  score: number | null
  approved: boolean
  requires_revision: boolean
  execution_queue_id: string
}

type WorkflowData = {
  command: Command
  plans: Plan[]
  tasks: Task[]
  sandboxRuns: SandboxRun[]
  queueItems: QueueItem[]
  reviews: Review[]
}

// ─── Style maps ────────────────────────────────────────────────────────────────

const CMD_STATUS: Record<string, string> = {
  received:   "border-blue-800   bg-blue-950/40   text-blue-300",
  processing: "border-yellow-800 bg-yellow-950/40 text-yellow-300",
  completed:  "border-green-800  bg-green-950/40  text-green-300",
  failed:     "border-red-800    bg-red-950/40    text-red-300",
}

const PLAN_STATUS: Record<string, string> = {
  draft:    "border-gray-300 bg-white   text-gray-400",
  approved: "border-green-800  bg-green-950/40  text-green-300",
  active:   "border-blue-800   bg-blue-950/40   text-blue-300",
  rejected: "border-red-800    bg-red-950/40    text-red-300",
}

const TASK_STATUS: Record<string, string> = {
  not_started: "border-gray-300 bg-white   text-gray-400",
  in_progress: "border-yellow-800  bg-yellow-950/40 text-yellow-300",
  completed:   "border-green-800   bg-green-950/40  text-green-300",
  blocked:     "border-red-800     bg-red-950/40    text-red-300",
}

const SANDBOX_STATUS: Record<string, string> = {
  draft:     "border-gray-300 bg-white   text-gray-400",
  ready:     "border-blue-800   bg-blue-950/40   text-blue-300",
  completed: "border-green-800  bg-green-950/40  text-green-300",
  failed:    "border-red-800    bg-red-950/40    text-red-300",
}

const QUEUE_STATUS: Record<string, string> = {
  queued:     "border-blue-800    bg-blue-950/40    text-blue-300",
  processing: "border-yellow-800  bg-yellow-950/40  text-yellow-300",
  completed:  "border-green-800   bg-green-950/40   text-green-300",
  failed:     "border-red-800     bg-red-950/40     text-red-300",
  reviewed:   "border-violet-800  bg-violet-950/40  text-violet-300",
  cancelled:  "border-gray-300 bg-white    text-gray-500",
}

const REVIEW_STATUS: Record<string, string> = {
  pending:            "border-gray-300  bg-white    text-gray-400",
  approved:           "border-green-800   bg-green-950/40   text-green-300",
  rejected:           "border-red-800     bg-red-950/40     text-red-300",
  revision_requested: "border-yellow-800  bg-yellow-950/40  text-yellow-300",
}

// ─── Workflow status logic ─────────────────────────────────────────────────────

function computeWorkflowStatus(data: WorkflowData): {
  label: string
  color: string
  stage: string
  completionPct: number
} {
  const { plans, tasks, sandboxRuns, queueItems, reviews } = data

  // Current stage (deepest with data)
  let stage = "Command"
  let completionPct = 16
  if (plans.length > 0)       { stage = "Plan";    completionPct = 33 }
  if (tasks.length > 0)       { stage = "Tasks";   completionPct = 50 }
  if (sandboxRuns.length > 0) { stage = "Sandbox"; completionPct = 67 }
  if (queueItems.length > 0)  { stage = "Queue";   completionPct = 83 }
  if (reviews.length > 0)     { stage = "Review";  completionPct = 100 }

  // Status logic
  const anyBlocked       = tasks.some((t) => t.status === "blocked")
  const anyPendingReview = reviews.some((r) => r.status === "pending")
  const anyApproved      = reviews.some((r) => r.approved)
  const anyReviewed      = queueItems.some((q) => q.status === "reviewed")

  if (anyBlocked) return { label: "Blocked",      color: "text-red-400",     stage, completionPct }
  if (anyPendingReview) return { label: "Under Review", color: "text-yellow-400", stage, completionPct }
  if (anyApproved || anyReviewed) return { label: "Completed",     color: "text-green-400",  stage, completionPct }
  if (tasks.length > 0) return { label: "Active",       color: "text-blue-400",   stage, completionPct }
  return { label: "Draft",        color: "text-gray-500", stage, completionPct }
}

// ─── Mini badge ────────────────────────────────────────────────────────────────

function Badge({ label, styles }: { label: string; styles: Record<string, string> }) {
  const cls = styles[label] ?? "border-gray-300 bg-white text-gray-400"
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label.replace("_", " ")}
    </span>
  )
}

// ─── Timeline stage wrapper ────────────────────────────────────────────────────

function Stage({
  label,
  icon,
  count,
  empty,
  children,
  last = false,
}: {
  label: string
  icon: string
  count: number
  empty?: boolean
  children?: React.ReactNode
  last?: boolean
}) {
  return (
    <div className="flex gap-6">
      {/* Connector column */}
      <div className="flex flex-col items-center">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${
          empty
            ? "border-gray-200 bg-gray-50 text-gray-700"
            : "border-gray-300 bg-white text-gray-900"
        }`}>
          {icon}
        </div>
        {!last && (
          <div className={`mt-1 w-px flex-1 ${empty ? "bg-white" : "bg-gray-200"}`} style={{ minHeight: "2rem" }} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-8">
        <div className="mb-3 flex items-center gap-3">
          <p className={`text-sm font-bold uppercase tracking-widest ${empty ? "text-gray-700" : "text-gray-300"}`}>
            {label}
          </p>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
            empty
              ? "border-gray-200 bg-gray-50 text-gray-700"
              : "border-gray-300 bg-white text-gray-400"
          }`}>
            {count}
          </span>
        </div>
        {empty ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-800">No data at this stage yet.</p>
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const params = useParams()
  const router = useRouter()
  const commandId = params?.id as string

  const [data,    setData]    = useState<WorkflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")

  const fetchWorkflow = useCallback(async () => {
    // 1. Command
    const { data: cmd, error: cmdErr } = await supabase
      .from("telegram_commands")
      .select("id, created_at, raw_message, interpreted_intent, assigned_agent, status, client_id, clients(name)")
      .eq("id", commandId)
      .single()
    if (cmdErr) { setError(cmdErr.message); setLoading(false); return }

    // 2. Plans
    const { data: plans } = await supabase
      .from("command_plans")
      .select("id, plan_title, plan_summary, status, assigned_agent")
      .eq("command_id", commandId)
      .order("created_at")

    // 3. Tasks
    const { data: tasks } = await supabase
      .from("agent_tasks")
      .select("id, title, description, status, assigned_agent, priority")
      .eq("command_id", commandId)
      .order("position")

    const taskIds = (tasks ?? []).map((t) => t.id)

    // 4. Sandbox runs (by task)
    let sandboxRuns: SandboxRun[] = []
    if (taskIds.length > 0) {
      const { data: sr } = await supabase
        .from("sandbox_runs")
        .select("id, created_at, run_type, model, status, estimated_input_tokens, estimated_cost, task_id")
        .in("task_id", taskIds)
        .order("created_at")
      sandboxRuns = sr ?? []
    }

    const sandboxIds = sandboxRuns.map((s) => s.id)

    // 5. Queue items — primary: by command_id (no double-counting possible)
    //    Fallback: by sandbox_run_id only (sandbox is mandatory path per arch decision)
    let queueItems: QueueItem[] = []
    {
      const { data: qi } = await supabase
        .from("execution_queue")
        .select("id, created_at, queue_type, status, priority, estimated_cost, sandbox_run_id, task_id, command_id, via_sandbox, position, model_pricing(model_name, display_name)")
        .eq("command_id", commandId)
        .order("position")
        .order("created_at")

      if (qi && qi.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queueItems = qi.map((item: any) => ({ ...item, model_pricing: item.model_pricing ?? null }))
      } else if (sandboxIds.length > 0) {
        // Fallback for rows created before command_id was added (backfill may have missed some)
        const { data: qiFallback } = await supabase
          .from("execution_queue")
          .select("id, created_at, queue_type, status, priority, estimated_cost, sandbox_run_id, task_id, command_id, via_sandbox, position, model_pricing(model_name, display_name)")
          .in("sandbox_run_id", sandboxIds)
          .order("created_at")
        // Dedup by id — guard against any remaining overlaps
        const seen = new Set<string>()
        for (const item of (qiFallback ?? [])) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            queueItems.push({ ...(item as any), model_pricing: (item as any).model_pricing ?? null })
          }
        }
      }
    }

    const queueIds = queueItems.map((q) => q.id)

    // 6. Reviews (by queue)
    let reviews: Review[] = []
    if (queueIds.length > 0) {
      const { data: rv } = await supabase
        .from("execution_reviews")
        .select("id, created_at, status, score, approved, requires_revision, execution_queue_id")
        .in("execution_queue_id", queueIds)
        .order("created_at")
      reviews = rv ?? []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmdData = cmd as any
    setData({
      command: { ...cmdData, client: cmdData.clients ?? null },
      plans:       plans       ?? [],
      tasks:       tasks       ?? [],
      sandboxRuns,
      queueItems,
      reviews,
    })
    setLoading(false)
  }, [commandId])

  useEffect(() => { fetchWorkflow() }, [fetchWorkflow])

  if (loading) {
    return (
      <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm">Loading workflow…</p>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error || "Workflow not found."}</p>
        </main>
      </div>
    )
  }

  const { command, plans, tasks, sandboxRuns, queueItems, reviews } = data
  const wf = computeWorkflowStatus(data)

  const totalCost = [
    ...sandboxRuns.map((s) => s.estimated_cost ?? 0),
    ...queueItems.map((q) => q.estimated_cost ?? 0),
  ].reduce((a, b) => a + b, 0)

  const revisionCount = reviews.filter((r) => r.requires_revision).length

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">

        {/* Header */}
        <div className="mb-8">
          <button onClick={() => router.push("/commands")} className="mb-4 text-xs text-gray-600 hover:text-gray-400 transition">
            ← Commands
          </button>
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-600">Workflow Trace</p>
              <h1 className="text-2xl font-bold text-gray-900">
                {command.raw_message.slice(0, 60)}{command.raw_message.length > 60 ? "…" : ""}
              </h1>
              <p className="mt-1.5 text-xs text-gray-600">
                Command {command.id.slice(0, 8)}… · {new Date(command.created_at).toLocaleString()}
                {command.client && <span className="ml-2 text-gray-500">· {command.client.name}</span>}
              </p>
            </div>
            <span className={`text-sm font-bold ${wf.color}`}>{wf.label}</span>
          </div>
        </div>

        {/* ── Summary Panel ──────────────────────────────────────────────────── */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Stage",       value: wf.stage },
            { label: "Status",      value: wf.label, color: wf.color },
            { label: "Plans",       value: String(plans.length) },
            { label: "Tasks",       value: String(tasks.length) },
            { label: "Queue Items", value: String(queueItems.length) },
            { label: "Reviews",     value: String(reviews.length) },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wider text-gray-600">{label}</p>
              <p className={`mt-2 text-xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Completion bar + extra stats */}
        <div className="mb-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Pipeline Progress</p>
            <div className="flex items-center gap-6 text-xs text-gray-600">
              {totalCost > 0 && (
                <span>Est. cost: <span className="font-mono text-green-400">${totalCost.toFixed(6)}</span></span>
              )}
              {revisionCount > 0 && (
                <span>Revisions: <span className="font-mono text-yellow-400">{revisionCount}</span></span>
              )}
              <span className={`font-bold ${wf.color}`}>{wf.completionPct}%</span>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-white">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                wf.label === "Blocked" ? "bg-red-600" :
                wf.label === "Completed" ? "bg-green-500" :
                wf.label === "Under Review" ? "bg-yellow-500" : "bg-blue-500"
              }`}
              style={{ width: `${wf.completionPct}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-gray-800">
            {["Command", "Plan", "Tasks", "Sandbox", "Queue", "Review"].map((s) => (
              <span key={s} className={wf.stage === s ? "text-gray-400 font-bold" : ""}>{s}</span>
            ))}
          </div>
        </div>

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <div className="max-w-3xl">

          {/* Stage 1: Command */}
          <Stage label="Command" icon="📨" count={1}>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge label={command.status} styles={CMD_STATUS} />
                {command.interpreted_intent && (
                  <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] text-gray-400">
                    {command.interpreted_intent}
                  </span>
                )}
                {command.assigned_agent && (
                  <span className="text-xs text-gray-600">→ {command.assigned_agent}</span>
                )}
              </div>
              <p className="text-sm text-gray-300">{command.raw_message}</p>
              <div className="mt-3 flex gap-3">
                <Link href="/commands" className="text-xs text-gray-700 hover:text-violet-400 transition">
                  → all commands
                </Link>
              </div>
            </div>
          </Stage>

          {/* Stage 2: Plans */}
          <Stage label="Execution Plans" icon="📋" count={plans.length} empty={plans.length === 0}>
            <div className="space-y-3">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge label={plan.status} styles={PLAN_STATUS} />
                    {plan.assigned_agent && (
                      <span className="text-xs text-gray-600">{plan.assigned_agent}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900">{plan.plan_title ?? "Untitled Plan"}</p>
                  {plan.plan_summary && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{plan.plan_summary}</p>
                  )}
                </div>
              ))}
            </div>
          </Stage>

          {/* Stage 3: Tasks */}
          <Stage label="Agent Tasks" icon="⚙️" count={tasks.length} empty={tasks.length === 0}>
            <div className="space-y-3">
              {tasks.map((task) => {
                const taskSandboxes = sandboxRuns.filter((s) => s.task_id === task.id)
                const taskQueues    = queueItems.filter((q) => q.task_id === task.id)
                return (
                  <div key={task.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge label={task.status} styles={TASK_STATUS} />
                      {task.assigned_agent && (
                        <span className="text-xs text-gray-600">{task.assigned_agent}</span>
                      )}
                      {task.priority && (
                        <span className="text-[10px] text-gray-700 uppercase">{task.priority}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    {task.description && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{task.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-700">
                      <Link href={`/tasks/${task.id}`} className="hover:text-violet-400 transition">→ task detail</Link>
                      {taskSandboxes.length > 0 && (
                        <span>{taskSandboxes.length} sandbox run{taskSandboxes.length !== 1 ? "s" : ""}</span>
                      )}
                      {taskQueues.length > 0 && (
                        <span>{taskQueues.length} queue item{taskQueues.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Stage>

          {/* Stage 4: Sandbox Runs */}
          <Stage label="Sandbox Runs" icon="🧪" count={sandboxRuns.length} empty={sandboxRuns.length === 0}>
            <div className="space-y-3">
              {sandboxRuns.map((run) => {
                const linkedQueue = queueItems.filter((q) => q.sandbox_run_id === run.id)
                return (
                  <div key={run.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge label={run.status} styles={SANDBOX_STATUS} />
                      {run.model && (
                        <span className="rounded-full border border-violet-800 bg-violet-950/30 px-2 py-0.5 text-[10px] font-mono text-violet-400">
                          {run.model}
                        </span>
                      )}
                      {run.run_type && (
                        <span className="text-[10px] text-gray-700">{run.run_type}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                      {run.estimated_input_tokens != null && (
                        <span className="font-mono">~{run.estimated_input_tokens} tokens</span>
                      )}
                      {run.estimated_cost != null && (
                        <span className="font-mono">${run.estimated_cost.toFixed(6)}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-700">
                      <Link href={`/sandbox/${run.id}`} className="hover:text-violet-400 transition">→ sandbox detail</Link>
                      {linkedQueue.length > 0 && (
                        <span>{linkedQueue.length} queue item{linkedQueue.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Stage>

          {/* Stage 5: Execution Queue */}
          <Stage label="Execution Queue" icon="📬" count={queueItems.length} empty={queueItems.length === 0}>
            <div className="space-y-3">
              {queueItems.map((item) => {
                const linkedReviews = reviews.filter((r) => r.execution_queue_id === item.id)
                return (
                  <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge label={item.status} styles={QUEUE_STATUS} />
                      <span className="text-[10px] text-gray-700 uppercase">{item.priority}</span>
                      {item.via_sandbox && (
                        <span className="rounded-full border border-emerald-900 bg-emerald-950/20 px-2 py-0.5 text-[10px] text-emerald-700">
                          via sandbox ✓
                        </span>
                      )}
                      {item.model_pricing && (
                        <span className="rounded-full border border-violet-800 bg-violet-950/30 px-2 py-0.5 text-[10px] font-mono text-violet-400">
                          {item.model_pricing.display_name ?? item.model_pricing.model_name}
                        </span>
                      )}
                    </div>
                    {item.estimated_cost != null && (
                      <p className="font-mono text-xs text-gray-700">${item.estimated_cost.toFixed(6)}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-700">
                      <Link href="/queue" className="hover:text-violet-400 transition">→ queue</Link>
                      {linkedReviews.length > 0 && (
                        <span>{linkedReviews.length} review{linkedReviews.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Stage>

          {/* Stage 6: Reviews */}
          <Stage label="Execution Reviews" icon="🔍" count={reviews.length} empty={reviews.length === 0} last>
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge label={review.status} styles={REVIEW_STATUS} />
                    {review.approved && (
                      <span className="rounded-full border border-green-800 bg-green-950/30 px-2 py-0.5 text-[10px] text-green-400">✓ approved</span>
                    )}
                    {review.requires_revision && (
                      <span className="rounded-full border border-yellow-800 bg-yellow-950/30 px-2 py-0.5 text-[10px] text-yellow-400">⟳ revision</span>
                    )}
                    {review.score != null && (
                      <span className="font-mono text-[10px] text-gray-500">{review.score}/10</span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3 text-xs text-gray-700">
                    <Link href={`/reviews/${review.id}`} className="hover:text-violet-400 transition">→ review detail</Link>
                  </div>
                </div>
              ))}
            </div>
          </Stage>
        </div>
      </main>
    </div>
  )
}
