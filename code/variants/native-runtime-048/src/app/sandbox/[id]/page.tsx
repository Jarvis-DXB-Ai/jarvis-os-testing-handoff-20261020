"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import { estimateTokens } from "@/lib/agentContext"

// ─── Types ─────────────────────────────────────────────────────────────────────

type SandboxRun = {
  id: string
  created_at: string
  run_type: string | null
  model: string | null
  status: string
  prompt_preview: string | null
  response_preview: string | null
  notes: string | null
  estimated_input_tokens: number | null
  estimated_output_tokens: number | null
  estimated_cost: number | null
  metadata: Record<string, unknown> | null
  task_id: string | null
  command_id: string | null
  agent_id: string | null
  skill_id: string | null
}

type TaskRef   = { id: string; title: string; description: string | null; status: string; assigned_agent: string | null }
type AgentRef  = { id: string; agent_name: string; agent_type: string | null; default_model: string | null }
type ModelPricing = { model_name: string; provider: string; display_name: string | null; input_price_per_million: number | null; output_price_per_million: number | null }
type SkillRef  = { id: string; name: string; category: string | null; description: string | null }

// ─── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:     "border-gray-300  bg-white    text-gray-400",
  ready:     "border-blue-800     bg-blue-950/40    text-blue-300",
  running:   "border-yellow-800   bg-yellow-950/40  text-yellow-300",
  completed: "border-green-800    bg-green-950/40   text-green-300",
  failed:    "border-red-800      bg-red-950/40     text-red-300",
  archived:  "border-gray-200  bg-gray-50    text-gray-600",
}

const STATUSES = ["draft", "ready", "running", "completed", "failed", "archived"]

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  label,
  accent = false,
  children,
}: {
  label: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl border p-6 ${accent ? "border-violet-800/40 bg-violet-950/10" : "border-gray-200 bg-gray-50"}`}>
      <p className={`mb-4 text-xs font-bold uppercase tracking-widest ${accent ? "text-violet-500" : "text-gray-600"}`}>
        {label}
      </p>
      {children}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function SandboxDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [run,          setRun]          = useState<SandboxRun | null>(null)
  const [task,         setTask]         = useState<TaskRef | null>(null)
  const [agent,        setAgent]        = useState<AgentRef | null>(null)
  const [skill,        setSkill]        = useState<SkillRef | null>(null)
  const [modelPricing, setModelPricing] = useState<ModelPricing | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState("")

  // Editing
  const [editPrompt,   setEditPrompt]   = useState("")
  const [editNotes,    setEditNotes]    = useState("")
  const [editStatus,   setEditStatus]   = useState("")
  const [saving,       setSaving]       = useState(false)
  const [saveMsg,      setSaveMsg]      = useState("")

  // Queue
  const [queueing,     setQueueing]     = useState(false)
  const [queueMsg,     setQueueMsg]     = useState<{ text: string; ok: boolean; queueId?: string } | null>(null)

  // JSON inspector
  const [showRaw, setShowRaw] = useState(false)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchRun = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("sandbox_runs")
      .select("*")
      .eq("id", id)
      .single()
    if (err) { setError(err.message); setLoading(false); return }
    setRun(data)
    setEditPrompt(data.prompt_preview ?? "")
    setEditNotes(data.notes ?? "")
    setEditStatus(data.status ?? "draft")

    // Related
    const fetches: Promise<void>[] = []

    // Fetch model pricing if model is set
    if (data.model) {
      fetches.push((async () => {
        const { data: p } = await supabase
          .from("model_pricing")
          .select("model_name, provider, display_name, input_price_per_million, output_price_per_million")
          .eq("model_name", data.model)
          .eq("status", "active")
          .single()
        setModelPricing(p ?? null)
      })())
    }

    if (data.task_id) {
      fetches.push((async () => {
        const { data: t } = await supabase.from("agent_tasks")
          .select("id, title, description, status, assigned_agent")
          .eq("id", data.task_id).single()
        setTask(t ?? null)
      })())
    }
    if (data.agent_id) {
      fetches.push((async () => {
        const { data: a } = await supabase.from("agents")
          .select("id, agent_name, agent_type, default_model")
          .eq("id", data.agent_id).single()
        setAgent(a ?? null)
      })())
    }
    if (data.skill_id) {
      fetches.push((async () => {
        const { data: s } = await supabase.from("agent_skills")
          .select("id, name, category, description")
          .eq("id", data.skill_id).single()
        setSkill(s ?? null)
      })())
    }
    await Promise.all(fetches)
    setLoading(false)
  }, [id])

  useEffect(() => { fetchRun() }, [fetchRun])

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!run) return
    setSaving(true); setSaveMsg("")
    const inputTokens     = editPrompt ? estimateTokens(editPrompt) : run.estimated_input_tokens
    const costPerMillion  = modelPricing?.input_price_per_million ?? null
    const cost = (inputTokens != null && costPerMillion != null)
      ? parseFloat(((inputTokens / 1_000_000) * costPerMillion).toFixed(6))
      : run.estimated_cost

    const { error: err } = await supabase
      .from("sandbox_runs")
      .update({
        prompt_preview:          editPrompt || null,
        notes:                   editNotes  || null,
        status:                  editStatus,
        estimated_input_tokens:  inputTokens,
        estimated_cost:          cost,
      })
      .eq("id", id)

    setSaving(false)
    if (err) { setSaveMsg(`Error: ${err.message}`); return }
    setSaveMsg("Saved.")
    setRun({ ...run, prompt_preview: editPrompt, notes: editNotes, status: editStatus, estimated_input_tokens: inputTokens, estimated_cost: cost })
    setTimeout(() => setSaveMsg(""), 3000)
  }

  // ── Send to Execution Queue ───────────────────────────────────────────────

  async function sendToQueue() {
    if (!run) return
    setQueueing(true); setQueueMsg(null)

    // Resolve model_pricing_id from model name
    let modelPricingId: string | null = null
    if (run.model) {
      const { data: mp } = await supabase
        .from("model_pricing")
        .select("id")
        .eq("model_name", run.model)
        .eq("status", "active")
        .single()
      modelPricingId = mp?.id ?? null
    }

    const inputTokens = editPrompt ? estimateTokens(editPrompt) : run.estimated_input_tokens
    const costPerMillion = modelPricing?.input_price_per_million ?? null
    const cost = (inputTokens != null && costPerMillion != null)
      ? parseFloat(((inputTokens / 1_000_000) * costPerMillion).toFixed(6))
      : run.estimated_cost

    // Position = max(position) + 1 for status='queued' items
    const { data: maxPosData } = await supabase
      .from("execution_queue")
      .select("position")
      .eq("status", "queued")
      .order("position", { ascending: false })
      .limit(1)
      .single()
    const nextPosition = (maxPosData?.position ?? -1) + 1

    const { data, error: err } = await supabase
      .from("execution_queue")
      .insert({
        // Traceability
        command_id:               run.command_id,
        task_id:                  run.task_id,
        sandbox_run_id:           run.id,
        // Routing
        agent_id:                 run.agent_id,
        skill_id:                 run.skill_id,
        model_pricing_id:         modelPricingId,
        queue_type:               run.run_type,
        // Queue control
        status:                   "queued",
        priority:                 "normal",
        via_sandbox:              true,
        position:                 nextPosition,
        // Snapshot
        prompt_snapshot:          editPrompt || run.prompt_preview || null,
        estimated_input_tokens:   inputTokens,
        estimated_cost:           cost,
        metadata: {
          sandbox_run_id: run.id,
          model:          run.model,
          queued_from:    "sandbox_detail",
        },
      })
      .select("id")
      .single()

    setQueueing(false)
    if (err) { setQueueMsg({ text: `Error: ${err.message}`, ok: false }); return }
    setQueueMsg({ text: "Added to execution queue.", ok: true, queueId: data.id })
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm">Loading…</p>
        </main>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error || "Run not found."}</p>
        </main>
      </div>
    )
  }

  const inputTokens = editPrompt ? estimateTokens(editPrompt) : run.estimated_input_tokens ?? 0

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/sandbox")}
            className="mb-4 text-xs text-gray-600 hover:text-gray-400 transition"
          >
            ← Sandbox
          </button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-600">Sandbox Run</p>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 font-mono">{run.id.slice(0, 8)}…</h1>
                <StatusBadge status={editStatus} />
                {run.model && (
                  <span className="rounded-full border border-violet-800 bg-violet-950/40 px-3 py-1 text-xs font-mono text-violet-300">
                    {run.model}
                  </span>
                )}
                {run.run_type && (
                  <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-400">
                    {run.run_type}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-600">
                Created {new Date(run.created_at).toLocaleString()}
              </p>
            </div>

            {/* Status control + actions */}
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-3">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-violet-600 focus:outline-none"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-gray-900 hover:bg-violet-500 transition disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
              <button
                onClick={sendToQueue}
                disabled={queueing}
                className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-5 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/40 transition disabled:opacity-50"
              >
                {queueing ? "Queuing…" : "→ Send to Execution Queue"}
              </button>
            </div>
          </div>
          {saveMsg && (
            <p className={`mt-2 text-xs ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
              {saveMsg}
            </p>
          )}
          {queueMsg && (
            <div className={`mt-2 flex items-center gap-3 text-xs ${queueMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {queueMsg.text}
              {queueMsg.ok && queueMsg.queueId && (
                <Link href="/queue" className="underline hover:text-gray-900 transition">
                  View queue →
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left col — main content */}
          <div className="col-span-2 space-y-6">

            {/* 1. Linked Task */}
            {task && (
              <Section label="Linked Task">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-gray-500">{task.description}</p>
                  )}
                  <div className="flex gap-3 mt-2">
                    <span className={`text-xs rounded-full border px-2.5 py-0.5 ${STATUS_STYLES[task.status] ?? STATUS_STYLES.draft}`}>
                      {task.status}
                    </span>
                    {task.assigned_agent && (
                      <span className="text-xs text-gray-500">
                        Agent: <span className="text-gray-300">{task.assigned_agent}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* 2. Prompt Preview Block */}
            <Section label="Prompt Preview" accent>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  Editable — no real AI calls will be made
                </span>
                <span className="font-mono text-xs text-violet-400">
                  ~{inputTokens} tokens
                </span>
              </div>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={12}
                placeholder="Prompt preview will appear here…"
                className="w-full rounded-xl border border-gray-300 bg-black px-5 py-4 font-mono text-xs text-gray-300 placeholder-neutral-700 focus:border-violet-600 focus:outline-none resize-none"
              />
            </Section>

            {/* 3. Fake Response Area */}
            <Section label="Response Placeholder">
              <div className="rounded-xl border border-dashed border-gray-200 bg-black p-6">
                {run.response_preview ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs text-gray-400">
                    {run.response_preview}
                  </pre>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-700">No response yet.</p>
                    <p className="mt-1 text-xs text-gray-800">
                      Response will appear here when AI execution is enabled.
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-center">
                <span className="rounded-full border border-yellow-900 bg-yellow-950/30 px-4 py-1.5 text-xs text-yellow-700">
                  ⚠ AI execution disabled — Task → Sandbox → Queue → Review pipeline only
                </span>
              </div>
            </Section>

            {/* 4. Notes */}
            <Section label="Execution Notes">
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
                placeholder="Notes about this run, observations, issues…"
                className="w-full rounded-xl border border-gray-300 bg-black px-4 py-3 text-sm text-gray-300 placeholder-neutral-700 focus:border-violet-600 focus:outline-none resize-none"
              />
            </Section>
          </div>

          {/* Right col — sidebar info */}
          <div className="space-y-6">

            {/* Token / Cost Estimation */}
            <Section label="Token / Cost Estimate">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Input Tokens</p>
                  <p className="text-xl font-mono font-bold text-gray-900">
                    {inputTokens > 0 ? `~${inputTokens}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Output Tokens</p>
                  <p className="text-xl font-mono font-bold text-gray-500">
                    {run.estimated_output_tokens != null ? `~${run.estimated_output_tokens}` : "—"}
                  </p>
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs text-gray-600 mb-1">Est. Input Cost</p>
                  {modelPricing?.input_price_per_million != null ? (
                    <>
                      <p className="text-xl font-mono font-bold text-green-400">
                        {inputTokens > 0
                          ? `$${((inputTokens / 1_000_000) * modelPricing.input_price_per_million).toFixed(6)}`
                          : "—"}
                      </p>
                      <p className="mt-1 text-xs text-gray-700">
                        ${modelPricing.input_price_per_million}/1M · {modelPricing.provider}
                      </p>
                    </>
                  ) : run.model ? (
                    <p className="text-sm text-yellow-700">Pricing unavailable — edit in /models</p>
                  ) : (
                    <p className="text-sm text-gray-700">No model selected</p>
                  )}
                </div>
                {modelPricing?.output_price_per_million != null && (
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Output Price Rate</p>
                    <p className="text-sm font-mono text-gray-400">
                      ${modelPricing.output_price_per_million}/1M tokens
                    </p>
                  </div>
                )}
              </div>
            </Section>

            {/* Linked Agent */}
            {agent && (
              <Section label="Agent">
                <p className="text-sm font-medium text-gray-900">{agent.agent_name}</p>
                {agent.agent_type && (
                  <p className="mt-1 text-xs text-gray-500">{agent.agent_type}</p>
                )}
                {agent.default_model && (
                  <p className="mt-2 text-xs font-mono text-violet-400">{agent.default_model}</p>
                )}
              </Section>
            )}

            {/* Linked Skill */}
            {skill && (
              <Section label="Skill">
                <p className="text-sm font-medium text-gray-900">{skill.name}</p>
                {skill.category && (
                  <span className="mt-2 inline-block rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-500">
                    {skill.category}
                  </span>
                )}
                {skill.description && (
                  <p className="mt-2 text-xs text-gray-600">{skill.description}</p>
                )}
              </Section>
            )}

            {/* Raw JSON Inspector */}
            <Section label="Raw JSON">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-gray-500 hover:text-gray-900 transition"
              >
                {showRaw ? "▲ Hide" : "▼ Inspect raw record"}
              </button>
              {showRaw && (
                <pre className="mt-4 overflow-auto rounded-xl border border-gray-200 bg-black p-4 text-xs text-gray-500 max-h-96">
                  {JSON.stringify(run, null, 2)}
                </pre>
              )}
            </Section>
          </div>
        </div>
      </main>
    </div>
  )
}
