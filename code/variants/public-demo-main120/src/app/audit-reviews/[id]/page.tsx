'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type FindingStatus = 'pending' | 'approved' | 'rejected'

interface ReviewEvent {
  at: string
  from: FindingStatus | null
  to: FindingStatus
  note?: string
}

interface AuditFinding {
  id: string
  title: string
  summary: string
  source_ref: string | null
  confidence: number
  target_table: string
  payload: Record<string, unknown>
  original_payload: Record<string, unknown> | null
  corrected_payload: Record<string, unknown> | null
  final_payload: Record<string, unknown> | null
  correction_note: string | null
  promoted_record_id: string | null
  review_history: ReviewEvent[]
  status: FindingStatus
  reviewed_at: string | null
}

interface AuditSession {
  id: string
  title: string
  audit_type: string
  mode: string
  status: string
  created_at: string
  client_id: string
  source_file: string | null
  metadata: Record<string, unknown> | null
  clients?: { name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_OPTIONS = [
  { value: 'client_knowledge', label: 'Client Knowledge' },
  { value: 'brand_playbooks',  label: 'Brand Playbook' },
  { value: 'research_library', label: 'Research Library' },
  { value: 'audit_note',       label: 'Audit Note (no save)' },
]
const TARGET_COLORS: Record<string, string> = {
  client_knowledge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  brand_playbooks:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  research_library: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  audit_note:       'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}
const TARGET_LABEL = (v: string) => TARGET_OPTIONS.find(t => t.value === v)?.label ?? v

const CONF_DOTS  = (n: number) => '●'.repeat(n) + '○'.repeat(5 - n)
const CONF_COLOR = ['','text-red-400','text-orange-400','text-yellow-400','text-lime-400','text-green-400']

// ─── Field schemas ────────────────────────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'number' | 'tags'
interface FieldDef { key: string; label: string; type: FieldType; required?: boolean; rows?: number }

const FIELD_SCHEMAS: Record<string, FieldDef[]> = {
  client_knowledge: [
    { key: 'category',   label: 'Category',  type: 'text',     required: true },
    { key: 'title',      label: 'Title',      type: 'text',     required: true },
    { key: 'content',    label: 'Content',    type: 'textarea', required: true, rows: 4 },
    { key: 'importance', label: 'Importance', type: 'number' },
  ],
  brand_playbooks: [
    { key: 'section',         label: 'Section',  type: 'text' },
    { key: 'title',           label: 'Title',    type: 'text',     required: true },
    { key: 'content_full',    label: 'Full',     type: 'textarea', required: true, rows: 5 },
    { key: 'content_summary', label: 'Summary',  type: 'textarea', rows: 3 },
    { key: 'content_essence', label: 'Essence',  type: 'text' },
    { key: 'importance',      label: 'Importance (1–5)', type: 'number' },
  ],
  research_library: [
    { key: 'title',        label: 'Title',        type: 'text',     required: true },
    { key: 'category',     label: 'Category',     type: 'text' },
    { key: 'source_type',  label: 'Source Type',  type: 'text' },
    { key: 'source_name',  label: 'Source Name',  type: 'text' },
    { key: 'summary',      label: 'Summary',      type: 'textarea', required: true, rows: 3 },
    { key: 'key_insights', label: 'Key Insights', type: 'textarea', rows: 3 },
    { key: 'tags',         label: 'Tags',         type: 'tags' },
    { key: 'importance',   label: 'Importance',   type: 'number' },
  ],
}

// ─── Promote helper (returns promoted record ID) ──────────────────────────────

async function promoteToTable(
  finding: AuditFinding,
  clientId: string,
  targetTable: string,
  payload: Record<string, unknown>
): Promise<{ promotedId?: string; error?: string }> {
  if (targetTable === 'audit_note') return {}

  if (targetTable === 'client_knowledge') {
    const { data, error } = await supabase.from('client_knowledge').insert({
      client_id:  clientId,
      category:   (payload.category   as string)  || 'General',
      title:      (payload.title      as string)  || finding.title,
      content:    (payload.content    as string)  || finding.summary,
      importance: (payload.importance as number)  || finding.confidence,
    }).select('id').single()
    return { promotedId: data?.id, error: error?.message }
  }

  if (targetTable === 'brand_playbooks') {
    const { data, error } = await supabase.from('brand_playbooks').insert({
      client_id:       clientId,
      section:         (payload.section         as string) || 'rules',
      title:           (payload.title           as string) || finding.title,
      content_full:    (payload.content_full    as string) || finding.summary,
      content_summary: (payload.content_summary as string) || finding.summary,
      content_essence: (payload.content_essence as string) || finding.summary.slice(0, 120),
      importance:      (payload.importance      as number)
                       ?? (payload.priority     as number)   // legacy seed compat
                       ?? finding.confidence,
    }).select('id').single()
    return { promotedId: data?.id, error: error?.message }
  }

  if (targetTable === 'research_library') {
    const { data, error } = await supabase.from('research_library').insert({
      title:        (payload.title        as string)   || finding.title,
      category:     (payload.category     as string)   || 'client_audit',
      source_type:  (payload.source_type  as string)   || 'audit',
      source_name:  (payload.source_name  as string)   || finding.source_ref || '',
      summary:      (payload.summary      as string)   || finding.summary,
      key_insights: (payload.key_insights as string)   || '',
      tags:         (payload.tags         as string[]) || [],
      importance:   (payload.importance   as number)   || finding.confidence,
    }).select('id').single()
    return { promotedId: data?.id, error: error?.message }
  }

  return {}
}

// ─── Archive promoted record helper ──────────────────────────────────────────

async function archivePromotedRecord(
  targetTable: string,
  recordId: string
): Promise<{ error?: string }> {
  if (targetTable === 'audit_note' || !recordId) return {}
  const { error } = await supabase
    .from(targetTable)
    .update({ status: 'archived' })
    .eq('id', recordId)
  return { error: error?.message }
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): Set<string> {
  const changed = new Set<string>()
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.add(k)
  })
  return changed
}

// ─── Field editor component ───────────────────────────────────────────────────

function FieldEditor({
  schema, values, original, onChange,
}: {
  schema: FieldDef[]
  values: Record<string, unknown>
  original: Record<string, unknown>
  onChange: (key: string, val: unknown) => void
}) {
  const changed = diffKeys(original, values)
  return (
    <div className="flex flex-col gap-4">
      {schema.map(field => {
        const isDiff = changed.has(field.key)
        const inputCls = `w-full bg-[#0d0d0d] border rounded-lg px-3 py-2 text-sm text-[#e8e4dc] outline-none resize-none placeholder:text-[#3a3530] transition-all ${
          isDiff ? 'border-[#c9a84c]/50 ring-1 ring-[#c9a84c]/20 focus:border-[#c9a84c]'
                 : 'border-[#1c1c1c] focus:border-[#2e2e2e]'
        }`
        return (
          <div key={field.key}>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-[11px] font-semibold text-[#5a5550] uppercase tracking-wide">
                {field.label}{field.required && <span className="text-amber-700 ml-0.5">*</span>}
              </label>
              {isDiff && (
                <span className="text-[9px] font-bold text-amber-700 bg-[#c9a84c]/10 border border-[#c9a84c]/20 px-1.5 py-0.5 rounded-full tracking-wide uppercase">
                  edited
                </span>
              )}
            </div>
            {isDiff && original[field.key] != null && (
              <div className="mb-1.5 px-3 py-1.5 rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] text-[11px] text-[#3a3530] line-through leading-relaxed">
                {field.type === 'tags'
                  ? (original[field.key] as string[]).join(', ')
                  : String(original[field.key])}
              </div>
            )}
            {field.type === 'textarea' ? (
              <textarea rows={field.rows ?? 3} className={inputCls}
                value={(values[field.key] as string) ?? ''}
                onChange={e => onChange(field.key, e.target.value)} />
            ) : field.type === 'number' ? (
              <input type="number" min={1} max={5} className={inputCls}
                value={(values[field.key] as number) ?? ''}
                onChange={e => onChange(field.key, Number(e.target.value))} />
            ) : field.type === 'tags' ? (
              <input type="text" placeholder="comma separated" className={inputCls}
                value={Array.isArray(values[field.key]) ? (values[field.key] as string[]).join(', ') : ''}
                onChange={e => onChange(field.key, e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
            ) : (
              <input type="text" className={inputCls}
                value={(values[field.key] as string) ?? ''}
                onChange={e => onChange(field.key, e.target.value)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Revert warning banner ────────────────────────────────────────────────────

function RevertWarning({
  finding,
  onConfirmRevert,
  onArchive,
  onCancel,
  archiving,
}: {
  finding: AuditFinding
  onConfirmRevert: () => void
  onArchive: () => void
  onCancel: () => void
  archiving: boolean
}) {
  return (
    <div className="mx-5 mb-4 border border-amber-500/20 rounded-xl bg-amber-500/[0.04] p-4">
      <p className="text-xs font-semibold text-amber-400 mb-1">⚠ Revert to pending?</p>
      <p className="text-[11px] text-[#8a7a5a] leading-relaxed mb-3">
        This only changes the audit review status.{' '}
        <span className="text-amber-400/70">The promoted memory entry may still exist</span>{' '}
        in <span className="font-semibold">{TARGET_LABEL(finding.target_table)}</span>.
        History, payloads, and the correction note are preserved.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={onConfirmRevert}
          className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 transition-all font-semibold">
          Restore to pending only
        </button>
        {finding.promoted_record_id && finding.target_table !== 'audit_note' && (
          <button onClick={onArchive} disabled={archiving}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all font-semibold disabled:opacity-40">
            {archiving ? 'Archiving…' : `Archive promoted ${TARGET_LABEL(finding.target_table)} entry`}
          </button>
        )}
        <button onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#111] border border-[#1c1c1c] text-[#5a5550] hover:text-[#e8e4dc] transition-all">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Review history strip ─────────────────────────────────────────────────────

function ReviewHistory({ events }: { events: ReviewEvent[] }) {
  if (!events.length) return null
  return (
    <details className="px-5 pb-4">
      <summary className="text-[10px] text-[#2a2a2a] hover:text-[#4a4540] cursor-pointer select-none">
        Review history ({events.length}) →
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        {[...events].reverse().map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] text-[#3a3530]">
            <span className="text-[#2a2a2a]">
              {new Date(e.at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
            </span>
            <span>→</span>
            <span className={`font-semibold ${e.to === 'approved' ? 'text-green-600' : e.to === 'rejected' ? 'text-red-700' : 'text-amber-600'}`}>
              {e.to}
            </span>
            {e.note && <span className="text-[#2a2a2a] italic">· {e.note}</span>}
          </div>
        ))}
      </div>
    </details>
  )
}

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({
  finding, clientId, onUpdate, onToast,
}: {
  finding: AuditFinding
  clientId: string
  onUpdate: (f: AuditFinding) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  type CardMode = 'idle' | 'editing' | 'reverting'
  const [mode, setMode]               = useState<CardMode>('idle')
  const [targetTable, setTargetTable] = useState(finding.target_table)
  const [editValues, setEditValues]   = useState<Record<string, unknown>>(finding.payload)
  const [corrNote, setCorrNote]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [archiving, setArchiving]     = useState(false)

  const original    = finding.original_payload ?? finding.payload
  const schema      = FIELD_SCHEMAS[targetTable]
  const changedKeys = finding.corrected_payload ? diffKeys(original, finding.corrected_payload) : new Set<string>()

  // ── Append a review_history event and persist it ──────────────────────────
  async function pushHistory(
    prevFinding: AuditFinding,
    to: FindingStatus,
    note?: string
  ): Promise<ReviewEvent[]> {
    const event: ReviewEvent = { at: new Date().toISOString(), from: prevFinding.status, to, note }
    const history = [...(prevFinding.review_history ?? []), event]
    await supabase.from('audit_findings').update({ review_history: history }).eq('id', prevFinding.id)
    return history
  }

  // ── Start edit mode ───────────────────────────────────────────────────────
  function startEdit() {
    setEditValues({ ...(finding.corrected_payload ?? finding.payload) })
    setCorrNote(finding.correction_note ?? '')
    setMode('editing')
  }

  // ── Approve (with or without correction) ─────────────────────────────────
  async function handleApprove(withCorrection: boolean) {
    setSaving(true)
    const corrected = withCorrection ? editValues : null
    const finalP    = corrected ?? finding.payload

    const { promotedId, error } = await promoteToTable(finding, clientId, targetTable, finalP)
    if (error) { onToast(`Promote error: ${error}`, false); setSaving(false); return }

    const history = await pushHistory(finding, 'approved', withCorrection ? 'corrected & approved' : 'approved as-is')

    const updateFields: Record<string, unknown> = {
      status:       'approved',
      reviewed_at:  new Date().toISOString(),
      final_payload: finalP,
      target_table:  targetTable,
      review_history: history,
      ...(promotedId ? { promoted_record_id: promotedId } : {}),
      ...(withCorrection ? { corrected_payload: corrected, correction_note: corrNote || null } : {}),
    }

    const { error: upErr } = await supabase.from('audit_findings').update(updateFields).eq('id', finding.id)
    if (upErr) { onToast(`DB error: ${upErr.message}`, false); setSaving(false); return }

    onUpdate({
      ...finding, ...updateFields,
      status: 'approved',
      corrected_payload: corrected as Record<string, unknown> | null,
      final_payload: finalP as Record<string, unknown>,
      promoted_record_id: promotedId ?? finding.promoted_record_id,
      review_history: history,
    })
    onToast(withCorrection ? `✓ Corrected & approved → ${TARGET_LABEL(targetTable)}` : `✓ Approved → ${TARGET_LABEL(targetTable)}`, true)
    setMode('idle')
    setSaving(false)
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  async function handleReject() {
    setSaving(true)
    const history = await pushHistory(finding, 'rejected')
    const { error } = await supabase.from('audit_findings')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), review_history: history })
      .eq('id', finding.id)
    if (error) { onToast(`Failed: ${error.message}`, false) }
    else { onUpdate({ ...finding, status: 'rejected', reviewed_at: new Date().toISOString(), review_history: history }) }
    onToast('✕ Rejected — record kept', false)
    setSaving(false)
  }

  // ── Restore to pending (no archive) ──────────────────────────────────────
  async function confirmRevert() {
    setSaving(true)
    const history = await pushHistory(finding, 'pending', 'reverted to pending')
    const { error } = await supabase.from('audit_findings')
      .update({ status: 'pending', reviewed_at: null, review_history: history })
      .eq('id', finding.id)
    if (error) { onToast(`Failed: ${error.message}`, false) }
    else { onUpdate({ ...finding, status: 'pending', reviewed_at: null, review_history: history }) }
    onToast('↩ Restored to pending', true)
    setMode('idle')
    setSaving(false)
  }

  // ── Archive promoted record then revert ───────────────────────────────────
  async function confirmArchiveAndRevert() {
    setArchiving(true)
    if (finding.promoted_record_id) {
      const { error } = await archivePromotedRecord(finding.target_table, finding.promoted_record_id)
      if (error) { onToast(`Archive failed: ${error}`, false); setArchiving(false); return }
    }
    const history = await pushHistory(finding, 'pending', 'promoted entry archived + reverted to pending')
    const { error } = await supabase.from('audit_findings')
      .update({ status: 'pending', reviewed_at: null, review_history: history })
      .eq('id', finding.id)
    if (error) { onToast(`Failed: ${error.message}`, false) }
    else { onUpdate({ ...finding, status: 'pending', reviewed_at: null, review_history: history }) }
    onToast('↩ Promoted entry archived + restored to pending', true)
    setArchiving(false)
    setMode('idle')
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`border rounded-xl transition-all ${
      finding.status === 'approved'
        ? 'border-green-500/15 bg-green-500/[0.03]'
        : finding.status === 'rejected'
        ? 'border-[#1a1a1a] bg-[#0c0c0c] opacity-60'
        : mode === 'editing'
        ? 'border-[#c9a84c]/25 bg-[#0f0e0a]'
        : mode === 'reverting'
        ? 'border-amber-500/20 bg-amber-500/[0.02]'
        : 'border-[#1c1c1c] bg-[#0f0f0f]'
    }`}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs font-bold ${CONF_COLOR[finding.confidence]}`}>
                {CONF_DOTS(finding.confidence)}
              </span>
              {finding.corrected_payload && (
                <span className="text-[9px] font-bold text-amber-700 bg-[#c9a84c]/10 border border-[#c9a84c]/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                  Corrected
                </span>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                finding.status === 'approved' ? 'bg-green-500/10 text-green-400'
                : finding.status === 'rejected' ? 'bg-red-500/10 text-red-400/70'
                : 'bg-amber-500/10 text-amber-400'
              }`}>
                {finding.status}
              </span>
            </div>
            <p className="text-sm font-semibold text-[#f0ece4] leading-snug">{finding.title}</p>
            {finding.source_ref && (
              <p className="text-[11px] text-[#4a4540] mt-0.5 italic">{finding.source_ref}</p>
            )}
          </div>

          {/* Target table */}
          {finding.status === 'pending' && mode === 'idle' ? (
            <select value={targetTable} onChange={e => setTargetTable(e.target.value)}
              className="text-[11px] bg-[#111] border border-[#222] text-amber-700 rounded-lg px-2 py-1.5 outline-none cursor-pointer">
              {TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${TARGET_COLORS[finding.target_table] ?? TARGET_COLORS.audit_note}`}>
              {TARGET_LABEL(finding.target_table)}
            </span>
          )}
        </div>

        <p className="text-[12.5px] text-[#7a7268] leading-relaxed">{finding.summary}</p>

        {/* Correction note (approved) */}
        {finding.correction_note && (
          <p className="mt-2 text-[11px] text-amber-700/50 italic">Note: {finding.correction_note}</p>
        )}

        {/* Changed field chips (approved) */}
        {finding.status === 'approved' && changedKeys.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...changedKeys].map(k => (
              <span key={k} className="text-[9px] font-bold text-amber-700 bg-[#c9a84c]/8 border border-[#c9a84c]/15 px-2 py-0.5 rounded-full uppercase tracking-wide">
                {k} edited
              </span>
            ))}
          </div>
        )}

        {/* Promoted record badge */}
        {finding.status === 'approved' && finding.promoted_record_id && finding.target_table !== 'audit_note' && (
          <p className="mt-2 text-[10px] text-[#2a4a2a]">
            Promoted → {TARGET_LABEL(finding.target_table)}{' '}
            <span className="text-[#1a3a1a] font-mono">{finding.promoted_record_id.slice(0, 8)}…</span>
          </p>
        )}

        {finding.reviewed_at && finding.status === 'approved' && (
          <p className="text-[10px] text-[#2a4a2a] mt-0.5">
            {new Date(finding.reviewed_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
          </p>
        )}
      </div>

      {/* ── Revert warning ───────────────────────────────────────────────── */}
      {mode === 'reverting' && (
        <RevertWarning
          finding={finding}
          onConfirmRevert={confirmRevert}
          onArchive={confirmArchiveAndRevert}
          onCancel={() => setMode('idle')}
          archiving={archiving}
        />
      )}

      {/* ── Edit mode ────────────────────────────────────────────────────── */}
      {mode === 'editing' && (
        <div className="border-t border-[#c9a84c]/15 px-5 pb-5 pt-4">
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-[#5a5550] uppercase tracking-wide mb-1.5 block">
              Destination Table
            </label>
            <select value={targetTable} onChange={e => { setTargetTable(e.target.value); setEditValues({ ...(finding.corrected_payload ?? finding.payload) }) }}
              className="text-sm bg-[#0d0d0d] border border-[#222] text-amber-700 rounded-lg px-3 py-2 outline-none w-full">
              {TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {schema ? (
            <FieldEditor schema={schema} values={editValues} original={original}
              onChange={(k, v) => setEditValues(p => ({ ...p, [k]: v }))} />
          ) : (
            <p className="text-xs text-[#5a5550] mb-4">No schema for &quot;{targetTable}&quot; — payload saved as-is.</p>
          )}

          <div className="mt-4">
            <label className="text-[11px] font-semibold text-[#5a5550] uppercase tracking-wide mb-1.5 block">
              Correction Note <span className="text-[#3a3530] normal-case font-normal">(optional)</span>
            </label>
            <input type="text" placeholder="Why was this corrected?"
              className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg px-3 py-2 text-sm text-[#e8e4dc] outline-none placeholder:text-[#3a3530]"
              value={corrNote} onChange={e => setCorrNote(e.target.value)} />
          </div>

          {diffKeys(original, editValues).size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-[#5a5550]">Changed:</span>
              {[...diffKeys(original, editValues)].map(k => (
                <span key={k} className="text-[9px] font-bold text-amber-700 bg-[#c9a84c]/10 border border-[#c9a84c]/20 px-2 py-0.5 rounded-full uppercase tracking-wide">{k}</span>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={() => handleApprove(true)} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-[#c9a84c]/10 border border-[#c9a84c]/25 text-amber-700 hover:bg-[#c9a84c]/20 transition-all disabled:opacity-40">
              {saving ? 'Saving…' : '✓ Save corrections & approve'}
            </button>
            <button onClick={() => setMode('idle')} disabled={saving}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#111] border border-[#222] text-[#5a5550] hover:text-[#e8e4dc] transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Pending actions ──────────────────────────────────────────────── */}
      {finding.status === 'pending' && mode === 'idle' && (
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={() => handleApprove(false)} disabled={saving}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-40">
            ✓ Approve as-is
          </button>
          <button onClick={startEdit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-[#c9a84c]/10 border border-[#c9a84c]/20 text-amber-700 hover:bg-[#c9a84c]/20 transition-all disabled:opacity-40">
            ✎ Edit & Approve
          </button>
          <button onClick={handleReject} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#111] border border-[#1c1c1c] text-[#5a5550] hover:border-red-500/20 hover:text-red-400 transition-all disabled:opacity-40">
            ✕
          </button>
        </div>
      )}

      {/* ── Rejected actions ─────────────────────────────────────────────── */}
      {finding.status === 'rejected' && mode === 'idle' && (
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={confirmRevert} disabled={saving}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-40">
            ↩ Restore to pending
          </button>
          <button onClick={startEdit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-[#c9a84c]/10 border border-[#c9a84c]/20 text-amber-700 hover:bg-[#c9a84c]/20 transition-all disabled:opacity-40">
            ✎ Edit & Approve
          </button>
        </div>
      )}

      {/* ── Approved actions ─────────────────────────────────────────────── */}
      {finding.status === 'approved' && mode === 'idle' && (
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={() => setMode('reverting')}
            className="py-2 px-4 rounded-lg text-xs font-semibold bg-[#111] border border-[#1c1c1c] text-[#4a4540] hover:border-amber-500/20 hover:text-amber-400 transition-all">
            ↩ Revert approval
          </button>
        </div>
      )}

      {/* ── Payload inspector (approved) ─────────────────────────────────── */}
      {finding.status === 'approved' && (
        <div className="px-5 pb-4">
          <details>
            <summary className="text-[10px] text-[#2a2a2a] hover:text-[#4a4540] cursor-pointer select-none">
              Inspect payloads →
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3">
              {[
                { label: 'Original (AI)', data: original, color: 'border-[#1a1a1a] text-[#3a3530]' },
                ...(finding.corrected_payload ? [{ label: 'Corrected (Human)', data: finding.corrected_payload, color: 'border-[#c9a84c]/20 text-[#6a6040]' }] : []),
                { label: 'Final (Promoted)', data: finding.final_payload ?? finding.payload, color: 'border-green-500/15 text-[#2a5a2a]' },
              ].map(({ label, data, color }) => (
                <div key={label}>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${color.split(' ')[1]}`}>{label}</p>
                  <pre className={`text-[10px] bg-[#0d0d0d] border ${color.split(' ')[0]} rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap ${color.split(' ')[1]}`}>
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* ── Review history ───────────────────────────────────────────────── */}
      <ReviewHistory events={finding.review_history ?? []} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditReviewDetailPage() {
  const params    = useParams()
  const sessionId = params.id as string

  const [session,  setSession]  = useState<AuditSession | null>(null)
  const [findings, setFindings] = useState<AuditFinding[]>([])
  const [filter,   setFilter]   = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from('audit_sessions').select('*, clients(name)').eq('id', sessionId).single(),
      supabase.from('audit_findings').select('*').eq('audit_session_id', sessionId).order('created_at'),
    ])
    setSession(s)
    setFindings((f ?? []).map(r => ({ ...r, review_history: r.review_history ?? [] })))
    setLoading(false)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  function updateFinding(updated: AuditFinding) {
    setFindings(prev => prev.map(f => f.id === updated.id ? updated : f))
  }

  async function approveAllPending() {
    const pending = findings.filter(f => f.status === 'pending')
    let count = 0
    for (const f of pending) {
      const { promotedId, error } = await promoteToTable(f, session!.client_id, f.target_table, f.payload)
      if (error) { showToast(`Error on "${f.title}": ${error}`, false); continue }
      const event: ReviewEvent = { at: new Date().toISOString(), from: 'pending', to: 'approved', note: 'bulk approved' }
      const history = [...(f.review_history ?? []), event]
      await supabase.from('audit_findings').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        final_payload: f.payload,
        review_history: history,
        ...(promotedId ? { promoted_record_id: promotedId } : {}),
      }).eq('id', f.id)
      updateFinding({ ...f, status: 'approved', reviewed_at: new Date().toISOString(), final_payload: f.payload, review_history: history, promoted_record_id: promotedId ?? null })
      count++
    }
    showToast(`✓ ${count} findings approved`, true)
  }

  const filtered      = findings.filter(f => filter === 'all' || f.status === filter)
  const pendingCount  = findings.filter(f => f.status === 'pending').length
  const approvedCount = findings.filter(f => f.status === 'approved').length
  const rejectedCount = findings.filter(f => f.status === 'rejected').length

  if (loading) return <div className="ops-dark jarvis-dark-shell min-h-screen flex items-center justify-center text-sm text-white/50">Loading…</div>
  if (!session) return <div className="ops-dark jarvis-dark-shell min-h-screen flex items-center justify-center text-sm text-red-400">Session not found.</div>

  const clientName = (session.clients as { name?: string } | null)?.name ?? 'Unknown'

  return (
    <div className="ops-dark jarvis-dark-shell min-h-screen text-white">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border transition-all ${
          toast.ok ? 'bg-green-500/10 border-green-500/20 text-green-400'
                   : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>{toast.msg}</div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/audit-reviews" className="text-xs text-[#3a3530] hover:text-amber-700 mb-6 inline-flex items-center gap-1 transition-colors">
          ← Audit Reviews
        </Link>

        {/* Session header */}
        <div className="border border-[#1c1c1c] rounded-xl bg-[#0f0f0f] p-5 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold tracking-[2px] uppercase text-amber-700 mb-1">{clientName}</p>
              <h1 className="text-lg font-bold text-[#f5f0e8]">{session.title}</h1>
              <p className="text-xs text-[#4a4540] mt-1">
                {new Date(session.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                {' · '}{session.mode.toUpperCase()}
                {session.metadata?.estimated_cost_usd != null && <> · ~${Number(session.metadata.estimated_cost_usd).toFixed(2)}</>}
              </p>
            </div>
            <div className="flex gap-5 text-center">
              <div><p className="text-xl font-bold text-amber-400">{pendingCount}</p><p className="text-[9px] text-[#5a5550] uppercase tracking-wide">Pending</p></div>
              <div><p className="text-xl font-bold text-green-400">{approvedCount}</p><p className="text-[9px] text-[#5a5550] uppercase tracking-wide">Approved</p></div>
              <div><p className="text-xl font-bold text-[#2a2a2a]">{rejectedCount}</p><p className="text-[9px] text-[#5a5550] uppercase tracking-wide">Rejected</p></div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex gap-2">
            {(['all','pending','approved','rejected'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-all ${
                  filter === f ? 'bg-[#c9a84c] text-black'
                               : 'bg-[#111] border border-[#1c1c1c] text-[#4a4540] hover:text-[#e8e4dc]'
                }`}>
                {f === 'all' ? `All (${findings.length})`
                 : f === 'pending'  ? `Pending (${pendingCount})`
                 : f === 'approved' ? `Approved (${approvedCount})`
                 :                    `Rejected (${rejectedCount})`}
              </button>
            ))}
          </div>
          {pendingCount > 0 && (
            <button onClick={approveAllPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all">
              Approve all as-is ({pendingCount})
            </button>
          )}
        </div>

        {/* Cards */}
        <div className="flex flex-col gap-3">
          {filtered.map(finding => (
            <FindingCard key={finding.id} finding={finding} clientId={session.client_id}
              onUpdate={updateFinding} onToast={showToast} />
          ))}
        </div>
      </div>
    </div>
  )
}
