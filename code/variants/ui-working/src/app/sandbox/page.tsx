"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import { estimateTokens, fetchAgentContext, type TaskRef } from "@/lib/agentContext"
import { assembleRawPrompt } from "@/lib/promptAssembly"

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
  task_id: string | null
  agent_id: string | null
  skill_id: string | null
  agent?: { agent_name: string } | null
  skill?: { name: string } | null
  task?: { title: string } | null
}

type AgentOption = { id: string; agent_name: string }
type SkillOption = { id: string; name: string; agent_id: string }

// Full task option — matches TaskRef shape + model field
type TaskOption = {
  id: string
  title: string
  description: string | null
  status: string
  assigned_agent: string | null
  command_id: string | null
  plan_id: string | null
  deliverable_id: string | null
}

type ModelPricingOption = {
  id: string
  provider: string
  model_name: string
  display_name: string | null
  input_price_per_million: number | null
  output_price_per_million: number | null
}

type CreateForm = {
  task_id: string
  agent_id: string
  skill_id: string
  run_type: string
  model: string
  notes: string
}

const EMPTY_FORM: CreateForm = {
  task_id: "",
  agent_id: "",
  skill_id: "",
  run_type: "",
  model: "",
  notes: "",
}

const RUN_TYPES = ["Copywriting", "Image Prompt", "Video Prompt", "Strategy", "QC Review", "Research", "Other"]

// ─── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:     "border-gray-300  bg-gray-50    text-gray-500",
  ready:     "border-blue-800     bg-blue-950/40    text-blue-300",
  running:   "border-yellow-800   bg-yellow-950/40  text-yellow-300",
  completed: "border-green-800    bg-green-950/40   text-green-300",
  failed:    "border-red-800      bg-red-950/40     text-red-300",
  archived:  "border-gray-200  bg-white    text-gray-400",
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function ModelBadge({ model }: { model: string | null }) {
  if (!model) return null
  return (
    <span className="rounded-full border border-violet-800 bg-violet-950/40 px-2.5 py-0.5 text-xs font-mono text-violet-300">
      {model}
    </span>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const router = useRouter()

  const [runs,    setRuns]    = useState<SandboxRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")

  // Create form
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState<CreateForm>(EMPTY_FORM)
  const [agents,     setAgents]     = useState<AgentOption[]>([])
  const [skills,     setSkills]     = useState<SkillOption[]>([])
  const [tasks,      setTasks]      = useState<TaskOption[]>([])
  const [modelPricingOptions, setModelPricingOptions] = useState<ModelPricingOption[]>([])
  const [promptPreview,    setPromptPreview]    = useState("")
  const [assemblingPrompt, setAssemblingPrompt] = useState(false)
  const [promptSource,     setPromptSource]     = useState<"assembled" | "manual" | "none">("none")
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState("")

  // ── Fetch runs ────────────────────────────────────────────────────────────

  async function fetchRuns() {
    const { data, error: err } = await supabase
      .from("sandbox_runs")
      .select(`
        id, created_at, run_type, model, status,
        prompt_preview, response_preview, notes,
        estimated_input_tokens, estimated_output_tokens, estimated_cost,
        task_id, agent_id, skill_id,
        agents(agent_name),
        agent_skills(name),
        agent_tasks(title)
      `)
      .order("created_at", { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      agent: r.agents ?? null,
      skill: r.agent_skills ?? null,
      task:  r.agent_tasks ?? null,
    }))
    setRuns(mapped)
    setLoading(false)
  }

  // ── Load form options ────────────────────────────────────────────────────

  async function loadFormOptions() {
    const [agentRes, skillRes, taskRes, pricingRes] = await Promise.all([
      supabase.from("agents").select("id, agent_name").eq("status", "active").order("agent_name"),
      supabase.from("agent_skills").select("id, name, agent_id").eq("status", "active").order("name"),
      supabase
        .from("agent_tasks")
        .select("id, title, description, status, assigned_agent, command_id, plan_id, deliverable_id")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("model_pricing")
        .select("id, provider, model_name, display_name, input_price_per_million, output_price_per_million")
        .eq("status", "active")
        .order("provider")
        .order("model_name"),
    ])
    setAgents(agentRes.data ?? [])
    setSkills(skillRes.data ?? [])
    setTasks(taskRes.data ?? [])
    setModelPricingOptions(pricingRes.data ?? [])
  }

  useEffect(() => { fetchRuns() }, [])

  // ── Assemble real prompt when task changes ────────────────────────────────

  const assemblePrompt = useCallback(async (
    taskId: string,
    agentOverrideId: string,
    skillOverrideId: string,
    notes: string,
  ) => {
    if (!taskId) { setPromptPreview(""); setPromptSource("none"); return }

    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    setAssemblingPrompt(true)

    // Build TaskRef — override assigned_agent if user picked one manually
    const agentOverride = agents.find((a) => a.id === agentOverrideId)
    const taskRef: TaskRef = {
      id:             task.id,
      title:          task.title,
      description:    task.description,
      status:         task.status,
      assigned_agent: agentOverride?.agent_name ?? task.assigned_agent,
      command_id:     task.command_id,
      plan_id:        task.plan_id,
      deliverable_id: task.deliverable_id,
    }

    try {
      const ctx = await fetchAgentContext(taskRef)

      // If user picked a specific skill, inject it as the only active skill
      if (skillOverrideId && ctx.skills.length > 0) {
        ctx.skills = ctx.skills.filter((s) => s.id === skillOverrideId)
      }

      const { prompt: assembled } = assembleRawPrompt(ctx, task.title, task.description)
      // Append notes if present
      const withNotes = notes.trim()
        ? assembled + `\n\n---\n\n# OPERATOR NOTES\n${notes.trim()}`
        : assembled

      setPromptPreview(withNotes)
      setPromptSource("assembled")
    } catch (e) {
      console.error("Prompt assembly failed:", e)
      setPromptPreview(`[Assembly failed — ${String(e)}]`)
      setPromptSource("manual")
    } finally {
      setAssemblingPrompt(false)
    }
  }, [tasks, agents])

  // Re-assemble when key form fields change (task, agent, skill)
  useEffect(() => {
    if (!showForm) return
    assemblePrompt(form.task_id, form.agent_id, form.skill_id, form.notes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.task_id, form.agent_id, form.skill_id, showForm])

  // Re-assemble notes annotation without full refetch when notes change
  useEffect(() => {
    if (!showForm || !form.task_id || promptSource !== "assembled") return
    // Only re-run if we have an assembled prompt — update the notes suffix cheaply
    assemblePrompt(form.task_id, form.agent_id, form.skill_id, form.notes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.notes])

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true); setSaveErr("")
    const inputTokens = promptPreview ? estimateTokens(promptPreview) : null

    // Cost from registry pricing
    const selectedPricing = modelPricingOptions.find((m) => m.model_name === form.model)
    const costPerMillion  = selectedPricing?.input_price_per_million ?? null
    const cost = (inputTokens != null && costPerMillion != null)
      ? parseFloat(((inputTokens / 1_000_000) * costPerMillion).toFixed(6))
      : null

    // Resolve agent_id / skill_id — prefer form selection; fall back to task's agent
    const task        = tasks.find((t) => t.id === form.task_id) ?? null
    const agentRecord = agents.find((a) => a.id === form.agent_id) ?? null

    // If no agent explicitly chosen, look up by assigned_agent name
    let resolvedAgentId = agentRecord?.id ?? null
    if (!resolvedAgentId && task?.assigned_agent) {
      const { data } = await supabase
        .from("agents")
        .select("id")
        .eq("agent_name", task.assigned_agent)
        .single()
      resolvedAgentId = data?.id ?? null
    }

    const { data, error: err } = await supabase
      .from("sandbox_runs")
      .insert({
        task_id:                 form.task_id         || null,
        command_id:              task?.command_id     || null,
        agent_id:                resolvedAgentId,
        skill_id:                form.skill_id        || null,
        run_type:                form.run_type        || null,
        model:                   form.model           || null,
        status:                  "draft",
        prompt_preview:          promptPreview        || null,
        notes:                   form.notes           || null,
        estimated_input_tokens:  inputTokens,
        estimated_output_tokens: null,
        estimated_cost:          cost,
      })
      .select("id")
      .single()

    setSaving(false)
    if (err) { setSaveErr(err.message); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    setPromptPreview("")
    setPromptSource("none")
    router.push(`/sandbox/${data.id}`)
  }

  // ── Filtered skills for selected agent ───────────────────────────────────

  const filteredSkills = form.agent_id
    ? skills.filter((s) => s.agent_id === form.agent_id)
    : skills

  const inputTokenCount = promptPreview ? estimateTokens(promptPreview) : 0

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">
        {/* Header */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-400">Execution Layer</p>
            <h1 className="text-3xl font-bold text-gray-900">Sandbox</h1>
            <p className="mt-2 text-sm text-gray-500">
              Test, preview, and inspect agent executions — no real AI calls.
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm)
              if (!showForm) loadFormOptions()
            }}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-violet-500 transition"
          >
            + Create Sandbox Run
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="mb-10 rounded-2xl border border-violet-800/50 bg-violet-950/10 p-8">
            <h2 className="mb-6 text-sm font-bold uppercase tracking-widest text-violet-400">New Sandbox Run</h2>
            <div className="grid grid-cols-2 gap-6">

              {/* Task */}
              <div className="col-span-2">
                <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Task</label>
                <select
                  value={form.task_id}
                  onChange={(e) => setForm({ ...form, task_id: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-violet-600 focus:outline-none"
                >
                  <option value="">— select task —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              {/* Agent */}
              <div>
                <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">
                  Agent <span className="text-gray-700 normal-case">(optional — overrides task)</span>
                </label>
                <select
                  value={form.agent_id}
                  onChange={(e) => setForm({ ...form, agent_id: e.target.value, skill_id: "" })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-violet-600 focus:outline-none"
                >
                  <option value="">— use task&apos;s agent —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.agent_name}</option>
                  ))}
                </select>
              </div>

              {/* Skill */}
              <div>
                <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">
                  Skill <span className="text-gray-700 normal-case">(optional filter)</span>
                </label>
                <select
                  value={form.skill_id}
                  onChange={(e) => setForm({ ...form, skill_id: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-violet-600 focus:outline-none"
                >
                  <option value="">— all skills —</option>
                  {filteredSkills.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Run Type */}
              <div>
                <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Run Type</label>
                <select
                  value={form.run_type}
                  onChange={(e) => setForm({ ...form, run_type: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-violet-600 focus:outline-none"
                >
                  <option value="">— select type —</option>
                  {RUN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Model</label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-violet-600 focus:outline-none"
                >
                  <option value="">— select model —</option>
                  {modelPricingOptions.map((m) => (
                    <option key={m.model_name} value={m.model_name}>
                      {m.provider} / {m.display_name ?? m.model_name}
                    </option>
                  ))}
                </select>
                {/* Cost preview inline */}
                {form.model && (() => {
                  const p = modelPricingOptions.find((m) => m.model_name === form.model)
                  if (!p) return null
                  const tk = inputTokenCount
                  return (
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2">
                      {p.input_price_per_million != null ? (
                        <>
                          <span className="text-xs text-gray-400">Est. input cost:</span>
                          <span className="font-mono text-xs text-green-400">
                            {tk > 0
                              ? `$${((tk / 1_000_000) * p.input_price_per_million).toFixed(6)}`
                              : "—"}
                          </span>
                          <span className="ml-auto text-xs text-gray-700">
                            ${p.input_price_per_million}/1M in · ${p.output_price_per_million ?? "?"}/1M out
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-yellow-700">Pricing unavailable for this model — edit in /models</span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Optional operator notes — appended to prompt as a final section."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 focus:border-violet-600 focus:outline-none resize-none"
                />
              </div>

              {/* Prompt Preview */}
              <div className="col-span-2">
                <label className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 uppercase tracking-wider">
                  Prompt Preview
                  {assemblingPrompt ? (
                    <span className="rounded bg-gray-50 border border-gray-300 px-2 py-0.5 text-gray-500 text-[10px] normal-case animate-pulse">
                      assembling…
                    </span>
                  ) : promptSource === "assembled" ? (
                    <span className="rounded bg-violet-950 border border-violet-800 px-2 py-0.5 text-violet-400 text-[10px] normal-case">
                      ✓ real prompt assembly · editable
                    </span>
                  ) : promptSource === "manual" ? (
                    <span className="rounded bg-yellow-950 border border-yellow-800 px-2 py-0.5 text-yellow-500 text-[10px] normal-case">
                      manual / partial
                    </span>
                  ) : null}
                  {inputTokenCount > 0 && (
                    <span className="ml-auto text-gray-700 font-mono normal-case">
                      ~{inputTokenCount} tokens
                    </span>
                  )}
                </label>
                <textarea
                  value={assemblingPrompt ? "Assembling prompt from task context…" : promptPreview}
                  onChange={(e) => {
                    if (!assemblingPrompt) {
                      setPromptPreview(e.target.value)
                      setPromptSource("manual")
                    }
                  }}
                  rows={14}
                  placeholder={form.task_id ? "Assembling…" : "Select a task to auto-assemble the full prompt."}
                  disabled={assemblingPrompt}
                  className="w-full rounded-xl border border-gray-300 bg-black px-4 py-3 font-mono text-xs text-gray-700 placeholder-neutral-700 focus:border-violet-600 focus:outline-none resize-none disabled:opacity-40"
                />
              </div>
            </div>

            {saveErr && <p className="mt-4 text-sm text-red-400">{saveErr}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || assemblingPrompt}
                className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-medium text-gray-900 hover:bg-violet-500 transition disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Sandbox Run"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false)
                  setForm(EMPTY_FORM)
                  setPromptPreview("")
                  setPromptSource("none")
                }}
                className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm text-gray-500 hover:text-gray-900 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Runs list */}
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-400">No sandbox runs yet.</p>
            <p className="mt-1 text-xs text-gray-700">Create one to start testing agent executions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/sandbox/${run.id}`}
                className="block rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-300 hover:bg-gray-50 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Top row */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <StatusBadge status={run.status} />
                      {run.model && <ModelBadge model={run.model} />}
                      {run.run_type && (
                        <span className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">
                          {run.run_type}
                        </span>
                      )}
                    </div>

                    {/* Linked context */}
                    <div className="flex flex-wrap gap-3 mb-3">
                      {run.task?.title && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Task:</span> {run.task.title}
                        </span>
                      )}
                      {run.agent?.agent_name && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Agent:</span> {run.agent.agent_name}
                        </span>
                      )}
                      {run.skill?.name && (
                        <span className="text-xs text-gray-500">
                          <span className="text-gray-700">Skill:</span> {run.skill.name}
                        </span>
                      )}
                    </div>

                    {/* Prompt snippet */}
                    {run.prompt_preview && (
                      <p className="text-xs text-gray-400 font-mono line-clamp-2">
                        {run.prompt_preview.slice(0, 200)}…
                      </p>
                    )}
                  </div>

                  {/* Metrics */}
                  <div className="shrink-0 text-right space-y-1">
                    {run.estimated_input_tokens != null && (
                      <p className="text-xs font-mono text-gray-400">
                        ~{run.estimated_input_tokens} tk in
                      </p>
                    )}
                    {run.estimated_cost != null && (
                      <p className="text-xs font-mono text-gray-400">
                        ${run.estimated_cost.toFixed(6)}
                      </p>
                    )}
                    <p className="text-xs text-gray-700">
                      {new Date(run.created_at).toLocaleDateString()}
                    </p>
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
