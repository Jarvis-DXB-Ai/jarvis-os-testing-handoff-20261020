'use client'

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import {
  CLIENT_BRAIN_V2_LEARNING_CATEGORIES,
  CLIENT_BRAIN_V2_LEARNING_STATUSES,
  humanizeClientBrainV2Value,
  type ClientBrainV2LearningCategory,
  type ClientBrainV2LearningStatus,
  type ClientBrainV2Record,
  type ClientBrainV2RecordRelationship,
} from '@/lib/client-brain-v2'
import {
  CLIENT_BRAIN_V2_LEARNING_APPLIES_TO,
  CLIENT_BRAIN_V2_LEARNING_APPLIES_TO_LABELS,
  CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS,
  CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS,
  CLIENT_BRAIN_V2_LEARNING_ORIGINS,
  CLIENT_BRAIN_V2_LEARNING_ORIGIN_LABELS,
  CLIENT_BRAIN_V2_LEARNING_STATUS_LABELS,
  learningCategoryForRecord,
  learningConfidenceForRecord,
  learningEditorData,
  learningEvidenceCount,
  learningScopesForRecord,
  learningScopesLabel,
  learningStatusForRecord,
  newLearningDraft,
  type ClientBrainV2LearningConfidence,
  type ClientBrainV2LearningEditPayload,
  type ClientBrainV2LearningOptions,
  type ClientBrainV2LearningOrigin,
} from '@/lib/client-brain-v2-learnings'

type LearningsWorkspaceProps = {
  clientId: string
  records: ClientBrainV2Record[]
  activeType: string
  options: ClientBrainV2LearningOptions
  onSaved: (payload: unknown) => void
}

const INPUT = 'mt-2 min-h-11 w-full rounded-md border border-white/12 bg-black/30 px-3 py-2.5 text-sm font-medium normal-case text-white/80 outline-none transition placeholder:text-white/22 focus:border-emerald-300/45'
const STATUS_STYLE: Record<ClientBrainV2LearningStatus, string> = {
  active: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  needs_review: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  historical: 'border-white/12 bg-white/[0.04] text-white/48',
  rejected: 'border-red-300/25 bg-red-300/10 text-red-100',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[10px] font-semibold uppercase text-white/32">{label}{children}</label>
}

function StatusBadge({ status }: { status: ClientBrainV2LearningStatus }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>{CLIENT_BRAIN_V2_LEARNING_STATUS_LABELS[status]}</span>
}

function Summary({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div className="min-w-0 border-r border-white/[0.07] px-4 py-3 last:border-r-0"><p className={`text-xl font-semibold ${warning ? 'text-amber-100' : 'text-white'}`}>{value}</p><p className="mt-1 truncate text-[10px] font-semibold uppercase text-white/30">{label}</p></div>
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase text-white/28">{label}</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-white/68">{value || 'Not recorded'}</p></div>
}

function ScopePicker({ value, onChange }: { value: ClientBrainV2LearningEditPayload['appliesTo']; onChange: (value: ClientBrainV2LearningEditPayload['appliesTo']) => void }) {
  const toggle = (scope: ClientBrainV2LearningEditPayload['appliesTo'][number]) => onChange(value.includes(scope) ? value.filter(item => item !== scope) : [...value, scope])
  return <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-white/12 bg-black/20 p-3 sm:grid-cols-3">{CLIENT_BRAIN_V2_LEARNING_APPLIES_TO.map(scope => <label key={scope} className="flex min-h-9 items-center gap-2 text-xs normal-case text-white/62"><input type="checkbox" checked={value.includes(scope)} onChange={() => toggle(scope)} className="h-4 w-4 accent-emerald-300" />{CLIENT_BRAIN_V2_LEARNING_APPLIES_TO_LABELS[scope]}</label>)}</div>
}

function LearningFields({ draft, setDraft, options }: { draft: ClientBrainV2LearningEditPayload; setDraft: Dispatch<SetStateAction<ClientBrainV2LearningEditPayload | null>>; options: ClientBrainV2LearningOptions }) {
  const patch = <K extends keyof ClientBrainV2LearningEditPayload>(key: K, value: ClientBrainV2LearningEditPayload[K]) => setDraft(current => current ? { ...current, [key]: value } : current)
  return <div className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]"><div className="space-y-6"><section><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/48">Learning</p><Field label="Title"><input value={draft.title} onChange={event => patch('title', event.target.value)} className={INPUT} placeholder="A concise reusable learning" /></Field><Field label="Learning / Insight"><textarea rows={6} value={draft.learning} onChange={event => patch('learning', event.target.value)} className={INPUT} placeholder="What Jarvis learned from real feedback, execution, or evidence" /></Field></section><section className="border-t border-white/[0.07] pt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/48">Evidence</p><Field label="Evidence note"><textarea rows={5} value={draft.evidence} onChange={event => patch('evidence', event.target.value)} className={INPUT} placeholder="What observation or feedback supports this learning?" /></Field><Field label="Related Source"><select value={draft.relatedSourceId} onChange={event => patch('relatedSourceId', event.target.value)} className={INPUT}><option value="">No source selected</option>{options.sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></Field></section><section className="border-t border-white/[0.07] pt-6"><Field label="Optional Notes"><textarea rows={5} value={draft.notes} onChange={event => patch('notes', event.target.value)} className={INPUT} placeholder="Context for future reviewers" /></Field></section></div><aside className="space-y-5 xl:border-l xl:border-white/[0.07] xl:pl-7"><Field label="Type"><select value={draft.category} onChange={event => patch('category', event.target.value as ClientBrainV2LearningCategory)} className={INPUT}>{CLIENT_BRAIN_V2_LEARNING_CATEGORIES.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS[item]}</option>)}</select></Field><Field label="Applies To"><ScopePicker value={draft.appliesTo} onChange={value => patch('appliesTo', value)} /></Field><Field label="Confidence"><select value={draft.confidence} onChange={event => patch('confidence', event.target.value as ClientBrainV2LearningConfidence)} className={INPUT}>{CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS.map(item => <option key={item} value={item}>{humanizeClientBrainV2Value(item)}</option>)}</select></Field><Field label="Status"><select value={draft.status} onChange={event => patch('status', event.target.value as ClientBrainV2LearningStatus)} className={INPUT}>{CLIENT_BRAIN_V2_LEARNING_STATUSES.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_LEARNING_STATUS_LABELS[item]}</option>)}</select></Field><Field label="Origin"><select value={draft.origin} onChange={event => patch('origin', event.target.value as ClientBrainV2LearningOrigin)} className={INPUT}>{CLIENT_BRAIN_V2_LEARNING_ORIGINS.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_LEARNING_ORIGIN_LABELS[item]}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1"><Field label="Date Learned"><input type="date" value={draft.firstObserved} onChange={event => patch('firstObserved', event.target.value)} className={INPUT} /></Field><Field label="Last Reinforced"><input type="date" value={draft.lastReinforced} onChange={event => patch('lastReinforced', event.target.value)} className={INPUT} /></Field><Field label="Review Date"><input type="date" value={draft.reviewDate} onChange={event => patch('reviewDate', event.target.value)} className={INPUT} /></Field></div></aside></div>
}

function RelationshipList({ title, items }: { title: string; items: ClientBrainV2RecordRelationship[] }) {
  if (!items.length) return null
  return <section className="border-t border-white/[0.07] py-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-white/76">{title}</h3><span className="text-[10px] text-white/30">{items.length}</span></div><div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">{items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0 truncate text-sm text-white/66">{item.record.title}</span><span className="shrink-0 text-[10px] font-semibold text-emerald-100/48">{humanizeClientBrainV2Value(item.relation_type)}</span></div>)}</div></section>
}

function LearningDrawer({ clientId, record, options, createCategory, onClose, onSaved }: { clientId: string; record: ClientBrainV2Record | null; options: ClientBrainV2LearningOptions; createCategory: string; onClose: () => void; onSaved: (payload: unknown) => void }) {
  const creating = !record
  const original = useMemo(() => record ? learningEditorData(record) : newLearningDraft(createCategory), [createCategory, record])
  const [draft, setDraft] = useState<ClientBrainV2LearningEditPayload | null>(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const current = record ? learningEditorData(record) : null
  const relationships = record?.relationships ?? []
  const close = () => { if (!dirty || window.confirm('Discard unsaved Learning changes?')) onClose() }
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) })
  async function save() { if (!draft) return; setSaving(true); setError(''); try { const response = await fetch(`/api/clients/${clientId}/brain-v2`, { method: creating ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); const payload = await response.json() as { success?: boolean; error?: string }; if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save Learning.'); onSaved(payload); onClose() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save Learning.') } finally { setSaving(false) } }
  if (typeof document === 'undefined' || !draft) return null
  return createPortal(<div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={creating ? 'Add Learning' : `${record?.title} Learning detail`}><div className="ml-auto flex h-full w-full max-w-5xl flex-col border-l border-white/10 bg-[#07100d] shadow-2xl"><header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2">{record && <StatusBadge status={learningStatusForRecord(record)} />}<span className="text-[10px] font-semibold uppercase text-white/30">{creating ? 'Manual Learning' : CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS[learningCategoryForRecord(record!)]}</span></div><h2 className="truncate text-xl font-semibold text-white sm:text-2xl">{creating ? 'Add Learning' : record?.title}</h2><p className="mt-2 text-sm text-white/42">Reusable feedback and execution insight, separate from canonical facts and strategy.</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={saving} onClick={close} className="min-h-11 rounded-md border border-white/12 px-4 text-sm font-semibold text-white/58 hover:text-white disabled:opacity-50">Cancel</button><button type="button" disabled={saving || !draft.title.trim() || !draft.learning.trim() || (!creating && !dirty)} onClick={() => void save()} className="min-h-11 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button><button type="button" onClick={close} aria-label="Close Learning detail" className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 text-xl text-white/48 hover:text-white">×</button></div></header><div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">{error && <p role="alert" className="mb-5 rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}<LearningFields draft={draft} setDraft={setDraft} options={options} />{record && current && <section className="mt-8 border-t border-white/[0.07] pt-6"><div className="grid gap-5 sm:grid-cols-3"><Value label="Evidence" value={`${learningEvidenceCount(record)} item${learningEvidenceCount(record) === 1 ? '' : 's'}`} /><Value label="Last Reinforced" value={current.lastReinforced || 'Not recorded'} /><Value label="Version History" value={`${record.versions?.length ?? 0} change${record.versions?.length === 1 ? '' : 's'}`} /></div><RelationshipList title="Linked records" items={relationships} /></section>}</div></div></div>, document.body)
}

export default function LearningsWorkspace({ clientId, records, activeType, options, onSaved }: LearningsWorkspaceProps) {
  const [search, setSearch] = useState('')
  const [typeOverride, setTypeOverride] = useState<string | null>(null)
  const [status, setStatus] = useState('all')
  const [confidence, setConfidence] = useState('all')
  const [appliesTo, setAppliesTo] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const type = typeOverride ?? activeType
  const selected = selectedId ? records.find(record => record.id === selectedId) ?? null : null
  const summary = useMemo(() => ({ total: records.length, active: records.filter(record => learningStatusForRecord(record) === 'active').length, review: records.filter(record => learningStatusForRecord(record) === 'needs_review').length, historical: records.filter(record => learningStatusForRecord(record) === 'historical').length, rejected: records.filter(record => learningStatusForRecord(record) === 'rejected').length }), [records])
  const visible = useMemo(() => { const query = search.trim().toLowerCase(); return records.filter(record => { const data = learningEditorData(record); const categoryMatch = type === 'all' || learningCategoryForRecord(record) === type; const statusMatch = status === 'all' || learningStatusForRecord(record) === status; const confidenceMatch = confidence === 'all' || learningConfidenceForRecord(record) === confidence; const scopeMatch = appliesTo === 'all' || learningScopesForRecord(record).includes(appliesTo as ClientBrainV2LearningEditPayload['appliesTo'][number]); const haystack = [record.title, data.learning, learningScopesLabel(data.appliesTo), data.evidence, data.notes, CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS[data.category], ...(record.relationships ?? []).map(item => item.record.title)].join(' ').toLowerCase(); return categoryMatch && statusMatch && confidenceMatch && scopeMatch && (!query || haystack.includes(query)) }) }, [appliesTo, confidence, records, search, status, type])
  const clearFilters = () => { setSearch(''); setTypeOverride(null); setStatus('all'); setConfidence('all'); setAppliesTo('all') }
  return <div className="space-y-5"><section className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] sm:grid-cols-5"><Summary label="All" value={summary.total} /><Summary label="Active" value={summary.active} /><Summary label="Needs Review" value={summary.review} warning={summary.review > 0} /><Summary label="Historical" value={summary.historical} /><Summary label="Rejected" value={summary.rejected} /></section><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-3xl text-sm leading-relaxed text-white/42">Store only reusable observations supported by feedback, approvals, performance, or repeated execution. Learnings are not canonical business facts or automated analytics.</p><button type="button" onClick={() => setCreating(true)} className="min-h-11 shrink-0 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-black hover:bg-emerald-200">+ Add Learning</button></div><section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 md:grid-cols-[minmax(220px,1fr)_160px_150px_150px_190px]"><Field label="Search"><input value={search} onChange={event => setSearch(event.target.value)} className={INPUT} placeholder="Title, insight, scope, or evidence" /></Field><Field label="Type"><select value={type} onChange={event => setTypeOverride(event.target.value)} className={INPUT}><option value="all">All types</option>{CLIENT_BRAIN_V2_LEARNING_CATEGORIES.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS[item]}</option>)}</select></Field><Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)} className={INPUT}><option value="all">All statuses</option>{CLIENT_BRAIN_V2_LEARNING_STATUSES.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_LEARNING_STATUS_LABELS[item]}</option>)}</select></Field><Field label="Confidence"><select value={confidence} onChange={event => setConfidence(event.target.value)} className={INPUT}><option value="all">All confidence</option>{CLIENT_BRAIN_V2_LEARNING_CONFIDENCE_LEVELS.map(item => <option key={item} value={item}>{humanizeClientBrainV2Value(item)}</option>)}</select></Field><Field label="Applies To"><select value={appliesTo} onChange={event => setAppliesTo(event.target.value)} className={INPUT}><option value="all">All scopes</option>{CLIENT_BRAIN_V2_LEARNING_APPLIES_TO.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_LEARNING_APPLIES_TO_LABELS[item]}</option>)}</select></Field></section><div className="flex items-center justify-between gap-3"><p className="text-xs text-white/34">{visible.length} of {records.length} Learnings</p>{(search || type !== activeType || status !== 'all' || confidence !== 'all' || appliesTo !== 'all') && <button type="button" onClick={clearFilters} className="min-h-11 px-2 text-xs font-semibold text-emerald-100/60 hover:text-emerald-50">Clear filters</button>}</div>{visible.length ? <div className="divide-y divide-white/[0.07] overflow-hidden rounded-lg border border-white/10 bg-white/[0.018]">{visible.map(record => { const data = learningEditorData(record); return <button key={record.id} type="button" onClick={() => setSelectedId(record.id)} className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-white/[0.035] sm:px-5 lg:grid-cols-[minmax(280px,1.8fr)_160px_120px_130px]"><span className="min-w-0"><span className="block text-sm font-semibold leading-6 text-white/78">{record.title}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-white/42">{data.learning}</span><span className="mt-2 block truncate text-[10px] text-white/30">{learningScopesLabel(data.appliesTo)}</span></span><span className="text-xs text-white/48">{CLIENT_BRAIN_V2_LEARNING_CATEGORY_LABELS[data.category]}</span><span className="text-xs capitalize text-white/48">{data.confidence} confidence</span><span><StatusBadge status={data.status} /></span></button> })}</div> : <div className="rounded-lg border border-dashed border-white/12 px-5 py-12 text-center"><h3 className="text-base font-semibold text-white/68">{records.length ? 'No Learnings match' : 'No learnings yet.'}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/34">{records.length ? 'Adjust the type, status, confidence, or scope filters.' : 'Learnings will capture useful feedback and performance insights as Jarvis creates and manages content.'}</p><button type="button" onClick={() => setCreating(true)} className="mt-5 min-h-11 rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/[0.08]">+ Add Learning</button></div>}{(selected || creating) && <LearningDrawer clientId={clientId} record={selected} options={options} createCategory={type} onClose={() => { setSelectedId(null); setCreating(false) }} onSaved={onSaved} />}</div>
}
