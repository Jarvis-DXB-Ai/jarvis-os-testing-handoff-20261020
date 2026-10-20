'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type AnswerStatus = 'missing' | 'pending' | 'verified' | 'assumed' | 'outdated' | 'needs_confirmation'

interface BlueprintTemplate {
  id: string
  section_index: number
  section_title: string
  question_key: string
  question_text: string
  description: string | null
  example_answer: string | null
  is_required: boolean
  is_client_facing: boolean
  is_memory_eligible: boolean
}

interface BlueprintAnswer {
  id: string
  client_id: string
  blueprint_id: string
  template_id: string | null
  section_index: number
  section_title: string
  question_key: string
  question_text: string
  answer_raw: string | null
  answer_corrected: string | null
  answer_final: string | null
  summary: string | null
  essence: string | null
  source: string | null
  source_type: string | null
  confidence: number
  status: AnswerStatus
  is_client_facing: boolean
  is_memory_eligible: boolean
  notes: string | null
}

interface ClientBlueprint {
  id: string
  client_id: string
  industry: string
  status: string
  completion_pct: number
}

interface Client {
  id: string
  name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRY = 'restaurant_hospitality'
const INDUSTRY_LABEL = 'Restaurant & Hospitality'

const STATUS_CONFIG: Record<AnswerStatus, { label: string; color: string; bg: string }> = {
  missing:              { label: 'Missing',       color: 'text-[#3a3530]',   bg: 'bg-[#111] border-[#1c1c1c]' },
  pending:              { label: 'Pending',       color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  verified:             { label: 'Verified',      color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/20' },
  assumed:              { label: 'Assumed',       color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  outdated:             { label: 'Outdated',      color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  needs_confirmation:   { label: 'Needs confirm', color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20' },
}

const SOURCE_TYPES = [
  { value: 'external_audit', label: 'External Audit' },
  { value: 'client_input',   label: 'Client Input' },
  { value: 'file_upload',    label: 'File Upload' },
  { value: 'manual',         label: 'Manual' },
  { value: 'assumed',        label: 'Assumed' },
]

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = 'bg-[#c9a84c]' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[#4a4540] tabular-nums w-12 text-right">{value}/{max}</span>
    </div>
  )
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: AnswerStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  )
}

// ─── Answer row ───────────────────────────────────────────────────────────────

function AnswerRow({
  answer,
  template,
  onUpdate,
  onToast,
}: {
  answer: BlueprintAnswer
  template: BlueprintTemplate | undefined
  onUpdate: (a: BlueprintAnswer) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState(answer.answer_final ?? '')
  const [draftSrc, setDraftSrc]   = useState(answer.source ?? '')
  const [draftSrcType, setDraftSrcType] = useState(answer.source_type ?? 'manual')
  const [draftStatus, setDraftStatus]   = useState<AnswerStatus>(answer.status)
  const [saving, setSaving]       = useState(false)

  async function save() {
    setSaving(true)
    const response = await fetch(`/api/clients/${answer.client_id}/blueprint`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprintId: answer.blueprint_id, answerId: answer.id, answerFinal: draft, answerRaw: answer.answer_raw ?? draft, source: draftSrc, sourceType: draftSrcType, status: draftStatus }),
    })
    const payload = await response.json() as { ok?: boolean; answer?: BlueprintAnswer; error?: string }
    if (!response.ok || !payload.answer) { onToast(`Failed: ${payload.error ?? 'Unable to save.'}`, false); setSaving(false); return }

    onUpdate({
      ...payload.answer,
    })
    onToast('✓ Saved', true)
    setEditing(false)
    setSaving(false)
  }

  function startEdit() {
    setDraft(answer.answer_final ?? '')
    setDraftSrc(answer.source ?? '')
    setDraftSrcType(answer.source_type ?? 'manual')
    setDraftStatus(answer.status === 'missing' ? 'pending' : answer.status)
    setEditing(true)
  }

  const isRequired = template?.is_required ?? false
  const hasAnswer  = !!(answer.answer_final?.trim())

  return (
    <div className={`border rounded-xl transition-all ${
      editing
        ? 'border-[#c9a84c]/25 bg-[#0f0e0a]'
        : answer.status === 'verified'
        ? 'border-green-500/10 bg-[#0c0f0c]'
        : answer.status === 'missing'
        ? 'border-[#141414] bg-[#0c0c0c]'
        : 'border-[#1a1a1a] bg-[#0d0d0d]'
    }`}>
      {/* Header row */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isRequired && (
              <span className="text-[9px] font-bold text-amber-700 bg-[#c9a84c]/8 border border-[#c9a84c]/15 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Required
              </span>
            )}
            {!template?.is_client_facing && (
              <span className="text-[9px] font-bold text-[#3a3530] bg-[#111] border border-[#1c1c1c] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Internal
              </span>
            )}
            <StatusPill status={answer.status} />
          </div>
          <p className="text-sm font-medium text-[#d0ccc4] leading-snug">{answer.question_text}</p>
          {template?.description && !editing && (
            <p className="text-[11px] text-[#3a3530] mt-0.5 italic">{template.description}</p>
          )}
        </div>
        {!editing && (
          <button onClick={startEdit}
            className="shrink-0 text-[10px] px-2.5 py-1 rounded-lg bg-[#111] border border-[#1c1c1c] text-[#4a4540] hover:text-amber-700 hover:border-[#c9a84c]/20 transition-all">
            {hasAnswer ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {/* Current answer (not editing) */}
      {!editing && hasAnswer && (
        <div className="px-4 pb-3">
          <p className="text-[12.5px] text-[#7a7268] leading-relaxed bg-[#0a0a0a] border border-[#141414] rounded-lg px-3 py-2">
            {answer.answer_final}
          </p>
          {answer.source && (
            <p className="text-[10px] text-[#2a2a2a] mt-1.5 italic">
              Source: {answer.source}
              {answer.source_type && <span className="text-[#222] ml-1">· {answer.source_type.replace('_', ' ')}</span>}
            </p>
          )}
        </div>
      )}

      {/* Example hint (not editing, no answer) */}
      {!editing && !hasAnswer && template?.example_answer && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-[#252525] italic">e.g. {template.example_answer}</p>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="border-t border-[#c9a84c]/10 px-4 pb-4 pt-4">
          {template?.example_answer && (
            <p className="text-[10px] text-[#3a3530] italic mb-3">e.g. {template.example_answer}</p>
          )}

          <textarea
            rows={3}
            className="w-full bg-[#0a0a0a] border border-[#1c1c1c] focus:border-[#c9a84c]/40 rounded-lg px-3 py-2 text-sm text-[#e8e4dc] outline-none resize-none placeholder:text-[#2a2a2a] transition-all mb-3"
            placeholder="Enter answer…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-semibold text-[#4a4540] uppercase tracking-wide mb-1 block">Status</label>
              <select value={draftStatus} onChange={e => setDraftStatus(e.target.value as AnswerStatus)}
                className="w-full bg-[#0a0a0a] border border-[#1c1c1c] text-amber-700 text-xs rounded-lg px-2.5 py-2 outline-none">
                {(Object.keys(STATUS_CONFIG) as AnswerStatus[]).filter(s => s !== 'missing').map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#4a4540] uppercase tracking-wide mb-1 block">Source Type</label>
              <select value={draftSrcType} onChange={e => setDraftSrcType(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#1c1c1c] text-[#7a7268] text-xs rounded-lg px-2.5 py-2 outline-none">
                {SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <input type="text" placeholder="Source (e.g. Google Maps, Calvin input, audit 2026-05-15)"
            className="w-full bg-[#0a0a0a] border border-[#1c1c1c] focus:border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#7a7268] outline-none placeholder:text-[#1c1c1c] mb-3 transition-all"
            value={draftSrc}
            onChange={e => setDraftSrc(e.target.value)}
          />

          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-[#c9a84c]/10 border border-[#c9a84c]/25 text-amber-700 hover:bg-[#c9a84c]/20 transition-all disabled:opacity-40">
              {saving ? 'Saving…' : '✓ Save'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#111] border border-[#1c1c1c] text-[#4a4540] hover:text-[#e8e4dc] transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section accordion ────────────────────────────────────────────────────────

function SectionAccordion({
  sectionIndex,
  sectionTitle,
  answers,
  templates,
  onUpdate,
  onToast,
}: {
  sectionIndex: number
  sectionTitle: string
  answers: BlueprintAnswer[]
  templates: BlueprintTemplate[]
  onUpdate: (a: BlueprintAnswer) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [open, setOpen] = useState(false)

  const templateMap = Object.fromEntries(templates.map(t => [t.question_key, t]))
  const required    = answers.filter(a => templateMap[a.question_key]?.is_required)
  const verified    = answers.filter(a => a.status === 'verified')
  const nonMissing  = answers.filter(a => a.status !== 'missing')
  const allVerified = required.length > 0 && required.every(a => a.status === 'verified')

  const progressColor = allVerified ? 'bg-green-500' : verified.length > 0 ? 'bg-[#c9a84c]' : 'bg-[#2a2a2a]'

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      open ? 'border-[#2a2a2a]' : 'border-[#1a1a1a]'
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 bg-[#0d0d0d] hover:bg-[#0f0f0f] transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-[10px] font-bold text-[#3a3530] tabular-nums w-5 shrink-0">{sectionIndex}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#d0ccc4] truncate">{sectionTitle}</p>
            <div className="mt-1.5 w-40">
              <ProgressBar
                value={verified.length}
                max={required.length || answers.length}
                color={progressColor}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex gap-2 text-[10px]">
            {nonMissing.length > 0 && (
              <span className="text-[#5a5550]">{nonMissing.length} filled</span>
            )}
            {verified.length > 0 && (
              <span className="text-green-600">{verified.length} verified</span>
            )}
          </div>
          <span className={`text-[#4a4540] text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {open && (
        <div className="bg-[#0a0a0a] px-4 py-4 flex flex-col gap-3 border-t border-[#141414]">
          {answers.map(answer => (
            <AnswerRow
              key={answer.id}
              answer={answer}
              template={templateMap[answer.question_key]}
              onUpdate={onUpdate}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientBlueprintPage() {
  const params   = useParams()
  const clientId = params.id as string

  const [client,    setClient]    = useState<Client | null>(null)
  const [blueprint, setBlueprint] = useState<ClientBlueprint | null>(null)
  const [answers,   setAnswers]   = useState<BlueprintAnswer[]>([])
  const [templates, setTemplates] = useState<BlueprintTemplate[]>([])
  const [loading,   setLoading]   = useState(true)
  const [initing,   setIniting]   = useState(false)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/blueprint`, { cache: 'no-store' })
      const payload = await response.json() as { ok?: boolean; client?: Client; blueprint?: ClientBlueprint | null; templates?: BlueprintTemplate[]; answers?: BlueprintAnswer[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load Blueprint.')
      setClient(payload.client ?? null)
      setTemplates(payload.templates ?? [])
      setBlueprint(payload.blueprint ?? null)
      setAnswers(payload.answers ?? [])
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to load Blueprint.', false) }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { load() }, [load])

  // Initialise blueprint — create client_blueprints row + all blueprint_answers
  async function initBlueprint() {
    setIniting(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/blueprint`, { method: 'POST' })
      const payload = await response.json() as { ok?: boolean; answers?: BlueprintAnswer[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to initialize Blueprint.')
      showToast(`✓ Blueprint initialised — ${payload.answers?.length ?? 0} questions ready`, true)
      await load()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to initialize Blueprint.', false) }
    finally { setIniting(false) }
  }

  function updateAnswer(updated: BlueprintAnswer) {
    setAnswers(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  // Group answers by section
  const sections = [...new Set(answers.map(a => a.section_index))].sort((a, b) => a - b)
  const sectionMap = Object.fromEntries(
    sections.map(idx => [
      idx,
      {
        title:   answers.find(a => a.section_index === idx)?.section_title ?? '',
        answers: answers.filter(a => a.section_index === idx),
      },
    ])
  )

  // Overall stats
  const totalRequired = answers.filter(a => templates.find(t => t.question_key === a.question_key)?.is_required).length
  const totalVerified = answers.filter(a => a.status === 'verified').length
  const totalFilled   = answers.filter(a => a.status !== 'missing').length
  const totalMissing  = answers.filter(a => a.status === 'missing').length

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-sm text-[#5a5550]">Loading…</div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e4dc]">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border transition-all ${
          toast.ok ? 'bg-green-500/10 border-green-500/20 text-green-400'
                   : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>{toast.msg}</div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href={`/clients/${clientId}`}
          className="text-xs text-[#3a3530] hover:text-amber-700 mb-6 inline-flex items-center gap-1 transition-colors">
          ← {client?.name ?? 'Client'}
        </Link>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[10px] font-bold tracking-[2px] uppercase text-amber-700 mb-1">{INDUSTRY_LABEL}</p>
          <h1 className="text-2xl font-bold text-[#f5f0e8] mb-1">Client Brain Blueprint</h1>
          <p className="text-sm text-[#4a4540]">{client?.name}</p>
        </div>

        {/* No blueprint yet */}
        {!blueprint && (
          <div className="border border-[#1c1c1c] rounded-xl bg-[#0d0d0d] p-8 text-center">
            <p className="text-sm text-[#5a5550] mb-2">No blueprint initialised for this client yet.</p>
            <p className="text-xs text-[#3a3530] mb-6">
              This will create {templates.length} questions across 15 sections.
            </p>
            <button onClick={initBlueprint} disabled={initing || templates.length === 0}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-[#c9a84c]/10 border border-[#c9a84c]/25 text-amber-700 hover:bg-[#c9a84c]/20 transition-all disabled:opacity-40">
              {initing ? 'Initialising…' : `Initialise Blueprint (${templates.length} questions)`}
            </button>
          </div>
        )}

        {/* Blueprint exists */}
        {blueprint && (
          <>
            {/* Stats header */}
            <div className="border border-[#1c1c1c] rounded-xl bg-[#0d0d0d] p-5 mb-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs text-[#4a4540]">Overall completion</p>
                  <p className="text-3xl font-bold text-amber-700 mt-0.5">{blueprint.completion_pct}%</p>
                </div>
                <div className="grid grid-cols-3 gap-5 text-center">
                  <div>
                    <p className="text-lg font-bold text-green-400">{totalVerified}</p>
                    <p className="text-[9px] text-[#4a4540] uppercase tracking-wide">Verified</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#5a5550]">{totalFilled - totalVerified}</p>
                    <p className="text-[9px] text-[#4a4540] uppercase tracking-wide">In progress</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#2a2a2a]">{totalMissing}</p>
                    <p className="text-[9px] text-[#4a4540] uppercase tracking-wide">Missing</p>
                  </div>
                </div>
              </div>
              <ProgressBar
                value={totalVerified}
                max={totalRequired}
                color={totalVerified === totalRequired && totalRequired > 0 ? 'bg-green-500' : 'bg-[#c9a84c]'}
              />
              <p className="text-[10px] text-[#2a2a2a] mt-1.5">{totalRequired} required questions</p>
            </div>

            {/* Section accordions */}
            <div className="flex flex-col gap-3">
              {sections.map(idx => (
                <SectionAccordion
                  key={idx}
                  sectionIndex={idx}
                  sectionTitle={sectionMap[idx].title}
                  answers={sectionMap[idx].answers}
                  templates={templates.filter(t => t.section_index === idx)}
                  onUpdate={updateAnswer}
                  onToast={showToast}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
