"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ReviewDetail = {
  id: string
  created_at: string
  status: string
  score: number | null
  strengths: string | null
  weaknesses: string | null
  revision_notes: string | null
  approval_notes: string | null
  approved: boolean
  requires_revision: boolean
  execution_queue_id: string
  reviewer_agent_id: string | null
  metadata: Record<string, unknown> | null
}

type QueueContext = {
  id: string
  queue_type: string | null
  status: string
  priority: string
  prompt_snapshot: string | null
  output_snapshot: string | null
  estimated_input_tokens: number | null
  estimated_cost: number | null
  task_id: string | null
  agent_id: string | null
  task?: { id: string; title: string; description: string | null; status: string } | null
  agent?: { agent_name: string; agent_type: string | null } | null
  model_pricing?: { model_name: string; display_name: string | null; provider: string } | null
}

type AgentOption = { id: string; agent_name: string }

// Learning forms
type SuccessForm = {
  title: string
  output_type: string
  why_successful: string
  reusable_pattern: string
}

type RejectionForm = {
  issue_type: string
  description: string
  correction: string
  severity: number
}

const OUTPUT_TYPES = ["caption", "reel_brief", "ad_copy", "strategy_note", "visual_prompt", "campaign_brief", "email", "other"]
const ISSUE_TYPES  = ["wrong_tone", "off_brand", "factual_error", "format", "length", "wrong_platform", "missing_context", "hallucination", "off_brief", "other"]

// ─── Constants ─────────────────────────────────────────────────────────────────

const REVIEW_STATUSES = ["pending", "approved", "rejected", "revision_requested"]

const STATUS_STYLES: Record<string, string> = {
  pending:            "border-gray-300  bg-white    text-gray-400",
  approved:           "border-green-800   bg-green-950/40   text-green-300",
  rejected:           "border-red-800     bg-red-950/40     text-red-300",
  revision_requested: "border-yellow-800  bg-yellow-950/40  text-yellow-300",
}

const QUEUE_STATUS_STYLES: Record<string, string> = {
  queued:     "border-blue-800    bg-blue-950/40    text-blue-300",
  processing: "border-yellow-800  bg-yellow-950/40  text-yellow-300",
  completed:  "border-green-800   bg-green-950/40   text-green-300",
  failed:     "border-red-800     bg-red-950/40     text-red-300",
  cancelled:  "border-gray-300 bg-white    text-gray-500",
  reviewed:   "border-violet-800  bg-violet-950/40  text-violet-300",
}

function Section({ label, accent = false, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-6 ${accent ? "border-amber-800/40 bg-amber-950/10" : "border-gray-200 bg-gray-50"}`}>
      <p className={`mb-4 text-xs font-bold uppercase tracking-widest ${accent ? "text-amber-500" : "text-gray-600"}`}>
        {label}
      </p>
      {children}
    </div>
  )
}

function ScoreInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Array.from({ length: 10 }, (_, i) => {
          const n = i + 1
          const filled = value != null && n <= value
          const color = value != null
            ? value >= 8 ? "bg-green-500 border-green-600" : value >= 5 ? "bg-yellow-500 border-yellow-600" : "bg-red-500 border-red-600"
            : "bg-gray-200 border-gray-300"
          return (
            <button
              key={n}
              onClick={() => onChange(value === n ? null : n)}
              className={`h-7 w-7 rounded-lg border text-xs font-bold transition hover:scale-110 ${
                filled ? color + " text-black" : "border-gray-300 bg-white text-gray-600 hover:border-neutral-500"
              }`}
            >
              {n}
            </button>
          )
        })}
        {value != null && (
          <span className="ml-2 text-sm font-bold text-gray-900">{value}/10</span>
        )}
      </div>
      <p className="text-xs text-gray-700">Click a score to set. Click again to clear.</p>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ReviewDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [review,  setReview]  = useState<ReviewDetail | null>(null)
  const [queue,   setQueue]   = useState<QueueContext | null>(null)
  const [agents,  setAgents]  = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")

  // Form state
  const [editStatus,        setEditStatus]        = useState("pending")
  const [editScore,         setEditScore]          = useState<number | null>(null)
  const [editStrengths,     setEditStrengths]      = useState("")
  const [editWeaknesses,    setEditWeaknesses]     = useState("")
  const [editRevisionNotes, setEditRevisionNotes]  = useState("")
  const [editApprovalNotes, setEditApprovalNotes]  = useState("")
  const [editReviewerId,    setEditReviewerId]     = useState("")

  // Save state
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState("")
  const [actioning, setActioning] = useState(false)

  // Prompt snapshot toggle
  const [showPrompt, setShowPrompt] = useState(false)

  // Learning action state
  const [showSuccessForm,   setShowSuccessForm]   = useState(false)
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const [learningSaving,    setLearningSaving]     = useState(false)
  const [learningMsg,       setLearningMsg]        = useState("")
  const [successForm, setSuccessForm] = useState<SuccessForm>({
    title: "", output_type: "caption", why_successful: "", reusable_pattern: ""
  })
  const [rejectionForm, setRejectionForm] = useState<RejectionForm>({
    issue_type: "wrong_tone", description: "", correction: "", severity: 3
  })

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [reviewRes, agentsRes] = await Promise.all([
      supabase.from("execution_reviews").select("*").eq("id", id).single(),
      supabase.from("agents").select("id, agent_name").eq("status", "active").order("agent_name"),
    ])

    if (reviewRes.error) { setError(reviewRes.error.message); setLoading(false); return }
    const r = reviewRes.data
    setReview(r)
    setEditStatus(r.status)
    setEditScore(r.score ?? null)
    setEditStrengths(r.strengths ?? "")
    setEditWeaknesses(r.weaknesses ?? "")
    setEditRevisionNotes(r.revision_notes ?? "")
    setEditApprovalNotes(r.approval_notes ?? "")
    setEditReviewerId(r.reviewer_agent_id ?? "")
    setAgents(agentsRes.data ?? [])

    // Fetch queue context
    const { data: qData } = await supabase
      .from("execution_queue")
      .select(`
        id, queue_type, status, priority,
        prompt_snapshot, output_snapshot,
        estimated_input_tokens, estimated_cost,
        task_id, agent_id,
        agent_tasks(id, title, description, status),
        agents(agent_name, agent_type),
        model_pricing(model_name, display_name, provider)
      `)
      .eq("id", r.execution_queue_id)
      .single()

    if (qData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = qData as any
      setQueue({
        ...q,
        task:          q.agent_tasks   ?? null,
        agent:         q.agents        ?? null,
        model_pricing: q.model_pricing ?? null,
      })
    }

    setLoading(false)
  }, [id])

  // ── Learning handlers ─────────────────────────────────────────────────────

  async function resolveClientId(): Promise<string | null> {
    if (!queue?.task?.id) return null
    const { data } = await supabase
      .from("agent_tasks").select("command_id").eq("id", queue.task.id).single()
    if (!data?.command_id) return null
    const { data: cmd } = await supabase
      .from("telegram_commands").select("client_id").eq("id", data.command_id).single()
    return cmd?.client_id ?? null
  }

  async function resolveExecutionRunId(): Promise<string | null> {
    if (!review) return null
    const { data } = await supabase
      .from("execution_runs")
      .select("id")
      .eq("execution_queue_id", review.execution_queue_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    return data?.id ?? null
  }

  async function handleSaveSuccessfulOutput() {
    if (!review || !successForm.title.trim()) return
    setLearningSaving(true); setLearningMsg("")

    const [clientId, runId] = await Promise.all([resolveClientId(), resolveExecutionRunId()])

    const { data: outData, error: outErr } = await supabase
      .from("successful_outputs")
      .insert({
        execution_run_id:    runId,
        execution_review_id: review.id,
        client_id:           clientId,
        agent_id:            queue?.agent_id ?? null,
        output_type:         successForm.output_type || null,
        title:               successForm.title.trim(),
        content:             queue?.output_snapshot ?? "(no output snapshot)",
        why_successful:      successForm.why_successful.trim() || null,
        reusable_pattern:    successForm.reusable_pattern.trim() || null,
        status:              "active",
      })
      .select("id")
      .single()

    if (outErr || !outData) {
      setLearningMsg(`Error: ${outErr?.message ?? "Unknown"}`)
      setLearningSaving(false); return
    }

    // Auto-create learning event
    await supabase.from("learning_events").insert({
      event_type:  "successful_output_saved",
      source_type: "successful_output",
      source_ref:  outData.id,
      client_id:   clientId,
      agent_id:    queue?.agent_id ?? null,
      summary:     `Successful output captured: "${successForm.title}" — ${successForm.output_type}`,
      status:      "open",
    })

    setLearningMsg("✓ Saved to Successful Outputs + learning event created.")
    setShowSuccessForm(false)
    setSuccessForm({ title: "", output_type: "caption", why_successful: "", reusable_pattern: "" })
    setLearningSaving(false)
    setTimeout(() => setLearningMsg(""), 5000)
  }

  async function handleSaveRejectionPattern() {
    if (!review || !rejectionForm.description.trim()) return
    setLearningSaving(true); setLearningMsg("")

    const [clientId, runId] = await Promise.all([resolveClientId(), resolveExecutionRunId()])

    const { data: rejData, error: rejErr } = await supabase
      .from("rejection_patterns")
      .insert({
        execution_run_id:    runId,
        execution_review_id: review.id,
        client_id:           clientId,
        agent_id:            queue?.agent_id ?? null,
        issue_type:          rejectionForm.issue_type || null,
        description:         rejectionForm.description.trim(),
        correction:          rejectionForm.correction.trim() || null,
        severity:            rejectionForm.severity,
        recurrence_count:    1,
        status:              "active",
      })
      .select("id")
      .single()

    if (rejErr || !rejData) {
      setLearningMsg(`Error: ${rejErr?.message ?? "Unknown"}`)
      setLearningSaving(false); return
    }

    // Auto-create learning event
    await supabase.from("learning_events").insert({
      event_type:  "rejection_captured",
      source_type: "rejection_pattern",
      source_ref:  rejData.id,
      client_id:   clientId,
      agent_id:    queue?.agent_id ?? null,
      summary:     `Rejection captured: [${rejectionForm.issue_type}] ${rejectionForm.description.slice(0, 80)}`,
      status:      "open",
    })

    setLearningMsg("✓ Saved to Rejection Patterns + learning event created.")
    setShowRejectionForm(false)
    setRejectionForm({ issue_type: "wrong_tone", description: "", correction: "", severity: 3 })
    setLearningSaving(false)
    setTimeout(() => setLearningMsg(""), 5000)
  }

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Save form ─────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!review) return
    setSaving(true); setSaveMsg("")
    const { error: err } = await supabase
      .from("execution_reviews")
      .update({
        status:           editStatus,
        score:            editScore,
        strengths:        editStrengths     || null,
        weaknesses:       editWeaknesses    || null,
        revision_notes:   editRevisionNotes || null,
        approval_notes:   editApprovalNotes || null,
        reviewer_agent_id: editReviewerId   || null,
        approved:         editStatus === "approved",
        requires_revision: editStatus === "revision_requested",
      })
      .eq("id", id)
    setSaving(false)
    if (err) { setSaveMsg(`Error: ${err.message}`); return }
    setReview({
      ...review,
      status:           editStatus,
      score:            editScore,
      strengths:        editStrengths     || null,
      weaknesses:       editWeaknesses    || null,
      revision_notes:   editRevisionNotes || null,
      approval_notes:   editApprovalNotes || null,
      reviewer_agent_id: editReviewerId   || null,
      approved:         editStatus === "approved",
      requires_revision: editStatus === "revision_requested",
    })
    setSaveMsg("Saved.")
    setTimeout(() => setSaveMsg(""), 3000)
  }

  // ── Quick actions (also update queue status) ──────────────────────────────

  async function quickAction(action: "approve" | "reject" | "request_revision") {
    if (!review || !queue) return
    setActioning(true)

    const reviewUpdate = {
      approve:           { status: "approved",            approved: true,  requires_revision: false },
      reject:            { status: "rejected",            approved: false, requires_revision: false },
      request_revision:  { status: "revision_requested",  approved: false, requires_revision: true  },
    }[action]

    const queueStatusMap = {
      approve:          "reviewed",
      reject:           "failed",
      request_revision: "processing",
    }

    // Update review
    const { error: rErr } = await supabase
      .from("execution_reviews")
      .update({
        ...reviewUpdate,
        score:            editScore,
        strengths:        editStrengths     || null,
        weaknesses:       editWeaknesses    || null,
        revision_notes:   editRevisionNotes || null,
        approval_notes:   editApprovalNotes || null,
        reviewer_agent_id: editReviewerId   || null,
      })
      .eq("id", id)

    if (rErr) { setSaveMsg(`Error: ${rErr.message}`); setActioning(false); return }

    // Update queue status
    await supabase
      .from("execution_queue")
      .update({ status: queueStatusMap[action], updated_at: new Date().toISOString() })
      .eq("id", review.execution_queue_id)

    setActioning(false)
    setEditStatus(reviewUpdate.status)
    setReview({ ...review, ...reviewUpdate, score: editScore })
    setQueue({ ...queue, status: queueStatusMap[action] })
    setSaveMsg(`${action.replace("_", " ")} applied. Queue updated.`)
    setTimeout(() => setSaveMsg(""), 4000)
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen bg-black text-gray-900">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm">Loading…</p>
        </main>
      </div>
    )
  }

  if (error || !review) {
    return (
      <div className="flex min-h-screen bg-black text-gray-900">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error || "Review not found."}</p>
        </main>
      </div>
    )
  }

  const currentStatusStyle = STATUS_STYLES[editStatus] ?? STATUS_STYLES.pending

  return (
    <div className="flex min-h-screen bg-black text-gray-900">
      <Sidebar />

      <main className="flex-1 overflow-auto p-10">

        {/* Header */}
        <div className="mb-8">
          <button onClick={() => router.push("/reviews")} className="mb-4 text-xs text-gray-600 hover:text-gray-400 transition">
            ← Reviews
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gray-600">QC Layer · Review</p>
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-2xl font-bold text-gray-900">{review.id.slice(0, 8)}…</h1>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${currentStatusStyle}`}>
                  {editStatus.replace("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-600">Created {new Date(review.created_at).toLocaleString()}</p>
            </div>

            {/* Quick action buttons */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => quickAction("approve")}
                  disabled={actioning}
                  className="rounded-xl border border-green-800 bg-green-950/30 px-4 py-2 text-xs font-semibold text-green-300 hover:bg-green-900/40 transition disabled:opacity-50"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => quickAction("request_revision")}
                  disabled={actioning}
                  className="rounded-xl border border-yellow-800 bg-yellow-950/30 px-4 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-900/40 transition disabled:opacity-50"
                >
                  ⟳ Request Revision
                </button>
                <button
                  onClick={() => quickAction("reject")}
                  disabled={actioning}
                  className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-900/40 transition disabled:opacity-50"
                >
                  ✕ Reject
                </button>
              </div>
              {saveMsg && (
                <p className={`text-xs ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                  {saveMsg}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Left — review form */}
          <div className="col-span-2 space-y-6">

            {/* 1. Linked Queue Item */}
            {queue && (
              <Section label="Linked Queue Item">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${QUEUE_STATUS_STYLES[queue.status] ?? ""}`}>
                      {queue.status}
                    </span>
                    <span className="text-xs text-gray-600">priority: {queue.priority}</span>
                    {queue.queue_type && (
                      <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-400">
                        {queue.queue_type}
                      </span>
                    )}
                    {queue.model_pricing && (
                      <span className="rounded-full border border-violet-800 bg-violet-950/40 px-2.5 py-0.5 text-xs font-mono text-violet-300">
                        {queue.model_pricing.display_name ?? queue.model_pricing.model_name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {queue.agent?.agent_name && (
                      <span className="text-xs text-gray-500">
                        <span className="text-gray-700">Agent:</span> {queue.agent.agent_name}
                      </span>
                    )}
                    {queue.estimated_input_tokens != null && (
                      <span className="font-mono text-xs text-gray-700">~{queue.estimated_input_tokens} tokens</span>
                    )}
                    {queue.estimated_cost != null && (
                      <span className="font-mono text-xs text-gray-700">${queue.estimated_cost.toFixed(6)}</span>
                    )}
                  </div>
                  <Link href={`/queue`} className="text-xs text-gray-700 hover:text-violet-400 transition">
                    → view in queue
                  </Link>
                </div>
              </Section>
            )}

            {/* 2. Linked Task */}
            {queue?.task && (
              <Section label="Linked Task">
                <p className="text-sm font-medium text-gray-900">{queue.task.title}</p>
                {queue.task.description && (
                  <p className="mt-1 text-xs text-gray-500">{queue.task.description}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-400">
                    {queue.task.status}
                  </span>
                </div>
              </Section>
            )}

            {/* 3. Prompt Snapshot */}
            {queue?.prompt_snapshot && (
              <Section label="Prompt Snapshot">
                <button
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="mb-3 text-xs text-gray-600 hover:text-gray-400 transition"
                >
                  {showPrompt ? "▲ Hide" : "▼ Show prompt snapshot"}
                </button>
                {showPrompt && (
                  <pre className="max-h-72 overflow-auto rounded-xl border border-gray-200 bg-black p-4 font-mono text-xs leading-relaxed text-gray-400 whitespace-pre-wrap">
                    {queue.prompt_snapshot}
                  </pre>
                )}
                <p className="mt-2 text-xs text-gray-700 italic">Immutable — captured at queue time.</p>
              </Section>
            )}

            {/* 4. Output Snapshot */}
            <Section label="Output">
              {queue?.output_snapshot ? (
                <pre className="max-h-72 overflow-auto rounded-xl border border-green-900 bg-green-950/10 p-4 font-mono text-xs leading-relaxed text-green-300 whitespace-pre-wrap">
                  {queue.output_snapshot}
                </pre>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
                  <p className="text-xs text-gray-700">No output yet.</p>
                  <p className="mt-1 text-xs text-gray-800">
                    Output will appear here after AI execution is enabled.
                  </p>
                </div>
              )}
            </Section>

            {/* 5. Review Form */}
            <Section label="Review Form" accent>
              <div className="space-y-6">

                {/* Score */}
                <div>
                  <p className="mb-3 text-xs text-gray-500 uppercase tracking-wider">Score</p>
                  <ScoreInput value={editScore} onChange={setEditScore} />
                </div>

                {/* Strengths */}
                <div>
                  <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Strengths</label>
                  <textarea
                    value={editStrengths}
                    onChange={(e) => setEditStrengths(e.target.value)}
                    rows={3}
                    placeholder="What worked well in this output…"
                    className="w-full rounded-xl border border-gray-300 bg-black px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 focus:border-amber-600 focus:outline-none resize-none"
                  />
                </div>

                {/* Weaknesses */}
                <div>
                  <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Weaknesses</label>
                  <textarea
                    value={editWeaknesses}
                    onChange={(e) => setEditWeaknesses(e.target.value)}
                    rows={3}
                    placeholder="What needs improvement…"
                    className="w-full rounded-xl border border-gray-300 bg-black px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 focus:border-amber-600 focus:outline-none resize-none"
                  />
                </div>

                {/* Revision Notes */}
                <div>
                  <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Revision Notes</label>
                  <textarea
                    value={editRevisionNotes}
                    onChange={(e) => setEditRevisionNotes(e.target.value)}
                    rows={3}
                    placeholder="Specific instructions for revision…"
                    className="w-full rounded-xl border border-gray-300 bg-black px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 focus:border-amber-600 focus:outline-none resize-none"
                  />
                </div>

                {/* Approval Notes */}
                <div>
                  <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Approval Notes</label>
                  <textarea
                    value={editApprovalNotes}
                    onChange={(e) => setEditApprovalNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes for approval confirmation…"
                    className="w-full rounded-xl border border-gray-300 bg-black px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 focus:border-amber-600 focus:outline-none resize-none"
                  />
                </div>

                {/* Status selector */}
                <div>
                  <label className="mb-2 block text-xs text-gray-500 uppercase tracking-wider">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:border-amber-600 focus:outline-none"
                  >
                    {REVIEW_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>

                {saveMsg && (
                  <p className={`text-xs ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                    {saveMsg}
                  </p>
                )}

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-medium text-black hover:bg-amber-500 transition disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Review"}
                </button>
              </div>
            </Section>
          </div>

          {/* Right — sidebar info */}
          <div className="space-y-6">

            {/* Reviewer Agent */}
            <Section label="Reviewer Agent">
              <select
                value={editReviewerId}
                onChange={(e) => setEditReviewerId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-amber-600 focus:outline-none"
              >
                <option value="">— none (human review) —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.agent_name}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-700">
                Future: AI reviewer agents will auto-fill this field.
              </p>
            </Section>

            {/* Status summary */}
            <Section label="Review Status">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Review</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatusStyle}`}>
                    {editStatus.replace("_", " ")}
                  </span>
                </div>
                {queue && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Queue</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${QUEUE_STATUS_STYLES[queue.status] ?? ""}`}>
                      {queue.status}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Score</span>
                  <span className="font-mono text-sm text-gray-900">
                    {editScore != null ? `${editScore}/10` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Approved</span>
                  <span className={review.approved ? "text-xs text-green-400" : "text-xs text-gray-600"}>
                    {review.approved ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Needs revision</span>
                  <span className={review.requires_revision ? "text-xs text-yellow-400" : "text-xs text-gray-600"}>
                    {review.requires_revision ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </Section>

            {/* ── Learning Actions ── */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Learning Loop</p>
              <p className="text-xs text-gray-700">Capture this execution as intelligence for future prompts.</p>

              {learningMsg && (
                <p className={`rounded-xl px-3 py-2 text-xs ${
                  learningMsg.startsWith("Error") ? "bg-red-950/30 text-red-400" : "bg-green-950/30 text-green-400"
                }`}>
                  {learningMsg}
                </p>
              )}

              {/* Save as Successful Output — show when approved */}
              {(editStatus === "approved") && (
                <div className="space-y-3">
                  <button
                    onClick={() => { setShowSuccessForm(!showSuccessForm); setShowRejectionForm(false) }}
                    className="w-full rounded-xl border border-green-800 bg-green-950/20 px-4 py-2.5 text-xs font-semibold text-green-300 hover:bg-green-900/30 transition"
                  >
                    ★ Save as Successful Output
                  </button>

                  {showSuccessForm && (
                    <div className="space-y-3 rounded-xl border border-green-900/30 bg-black p-4">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Title <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g. DemoClientD terrace caption — atmosphere hook"
                          value={successForm.title}
                          onChange={(e) => setSuccessForm((f) => ({ ...f, title: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-neutral-700"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Output type</label>
                        <select
                          value={successForm.output_type}
                          onChange={(e) => setSuccessForm((f) => ({ ...f, output_type: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                        >
                          {OUTPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Why it worked</label>
                        <textarea
                          rows={2}
                          placeholder="What made this output good? Tone, structure, specificity…"
                          value={successForm.why_successful}
                          onChange={(e) => setSuccessForm((f) => ({ ...f, why_successful: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-neutral-700 resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Reusable pattern</label>
                        <textarea
                          rows={2}
                          placeholder="Abstract formula others can reuse…"
                          value={successForm.reusable_pattern}
                          onChange={(e) => setSuccessForm((f) => ({ ...f, reusable_pattern: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-neutral-700 resize-none"
                        />
                      </div>
                      <button
                        onClick={handleSaveSuccessfulOutput}
                        disabled={learningSaving || !successForm.title.trim()}
                        className="w-full rounded-xl bg-green-700 px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-green-600 transition disabled:opacity-40"
                      >
                        {learningSaving ? "Saving…" : "Save + log learning event"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Save Rejection Pattern — show when rejected or revision requested */}
              {(editStatus === "rejected" || editStatus === "revision_requested") && (
                <div className="space-y-3">
                  <button
                    onClick={() => { setShowRejectionForm(!showRejectionForm); setShowSuccessForm(false) }}
                    className="w-full rounded-xl border border-red-800 bg-red-950/20 px-4 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-900/30 transition"
                  >
                    ✕ Save Rejection Pattern
                  </button>

                  {showRejectionForm && (
                    <div className="space-y-3 rounded-xl border border-red-900/30 bg-black p-4">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Issue type</label>
                        <select
                          value={rejectionForm.issue_type}
                          onChange={(e) => setRejectionForm((f) => ({ ...f, issue_type: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                        >
                          {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Description <span className="text-red-500">*</span></label>
                        <textarea
                          rows={3}
                          placeholder="What went wrong? Be specific…"
                          value={rejectionForm.description}
                          onChange={(e) => setRejectionForm((f) => ({ ...f, description: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-neutral-700 resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Correction</label>
                        <textarea
                          rows={2}
                          placeholder="What should it have done instead?"
                          value={rejectionForm.correction}
                          onChange={(e) => setRejectionForm((f) => ({ ...f, correction: e.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-neutral-700 resize-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Severity: <span className={[
                            "", "text-gray-500","text-blue-400","text-yellow-400","text-orange-400","text-red-400"
                          ][rejectionForm.severity]}>{["","Minor","Low","Medium","High","Critical"][rejectionForm.severity]}</span>
                        </label>
                        <div className="flex gap-1.5">
                          {[1,2,3,4,5].map((n) => (
                            <button key={n}
                              onClick={() => setRejectionForm((f) => ({ ...f, severity: n }))}
                              className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition ${
                                rejectionForm.severity === n ? "border-white text-gray-900 bg-gray-200" : "border-gray-200 text-gray-600"
                              }`}
                            >{n}</button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleSaveRejectionPattern}
                        disabled={learningSaving || !rejectionForm.description.trim()}
                        className="w-full rounded-xl bg-red-700 px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-red-600 transition disabled:opacity-40"
                      >
                        {learningSaving ? "Saving…" : "Save + log learning event"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {editStatus === "pending" && (
                <p className="text-xs text-gray-700">Approve or reject the review first to unlock learning capture.</p>
              )}
            </div>

            {/* Quick action guide */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Quick Actions</p>
              <div className="space-y-2 text-xs text-gray-600">
                <p><span className="text-green-500">✓ Approve</span> → queue: reviewed</p>
                <p><span className="text-yellow-500">⟳ Request Revision</span> → queue: processing</p>
                <p><span className="text-red-500">✕ Reject</span> → queue: failed</p>
              </div>
              <p className="text-xs text-gray-800 pt-2 border-t border-gray-200">
                All actions auto-save current form state.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
