'use client'

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import {
  CLIENT_BRAIN_V2_SOURCE_AUTHORITIES,
  CLIENT_BRAIN_V2_SOURCE_AUTHORITY_LABELS,
  CLIENT_BRAIN_V2_SOURCE_KINDS,
  CLIENT_BRAIN_V2_SOURCE_STATUSES,
  CLIENT_BRAIN_V2_SOURCE_STATUS_LABELS,
  CLIENT_BRAIN_V2_SOURCE_TRUST_LABELS,
  CLIENT_BRAIN_V2_SOURCE_TRUSTS,
  CLIENT_BRAIN_V2_SOURCE_TYPE_LABELS,
  CLIENT_BRAIN_V2_SOURCE_TYPES,
  sourceAuthorityForRecord,
  sourceEditorData,
  sourceExternalUrl,
  sourceKindForRecord,
  sourceStatusForRecord,
  sourceTrustForRecord,
  sourceTypeForRecord,
  type ClientBrainV2SourceCreatePayload,
  type ClientBrainV2SourceEditPayload,
  type ClientBrainV2SourceKind,
} from '@/lib/client-brain-v2-sources'
import { humanizeClientBrainV2Value, type ClientBrainV2Record, type ClientBrainV2RecordRelationship } from '@/lib/client-brain-v2'

type SourceTarget = { id: string; title: string; top_section: string; subsection: string; status: string }

type SourcesWorkspaceProps = {
  clientId: string
  records: ClientBrainV2Record[]
  activeType: string
  onSaved: (payload: unknown) => void
}

const INPUT = 'mt-2 min-h-11 w-full rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-emerald-300/45'
const STATUS_STYLE: Record<string, string> = {
  current: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  needs_review: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  historical: 'border-white/10 bg-white/[0.04] text-white/48',
  superseded: 'border-white/10 bg-white/[0.025] text-white/38',
}

function sourceDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: ReturnType<typeof sourceStatusForRecord> }) {
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>{CLIENT_BRAIN_V2_SOURCE_STATUS_LABELS[status]}</span>
}

function TrustBadge({ trust }: { trust: ReturnType<typeof sourceTrustForRecord> }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-white/48">{CLIENT_BRAIN_V2_SOURCE_TRUST_LABELS[trust]}</span>
}

function SourceGlyph({ record }: { record: ClientBrainV2Record }) {
  const kind = sourceKindForRecord(record)
  const glyph = kind === 'file' ? 'DOC' : kind === 'url' ? 'URL' : 'NOTE'
  return <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-[10px] font-bold tracking-[0.08em] text-emerald-100/65">{glyph}</span>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">{label}{children}</label>
}

function authoritySummary(record: ClientBrainV2Record) {
  const scopes = sourceAuthorityForRecord(record)
  return scopes.length ? scopes.map(scope => CLIENT_BRAIN_V2_SOURCE_AUTHORITY_LABELS[scope]).join(' · ') : 'No authority scope'
}

function supportedCount(record: ClientBrainV2Record) {
  return (record.relationships ?? []).filter(item => item.record.top_section !== 'sources').length
}

function filterMatchesActiveType(record: ClientBrainV2Record, activeType: string) {
  if (activeType === 'all') return true
  return sourceKindForRecord(record) === (activeType === 'files' ? 'file' : activeType === 'urls' ? 'url' : activeType === 'manual' ? 'manual' : activeType)
}

function relationshipLabel(item: ClientBrainV2RecordRelationship) {
  if (item.relation_type === 'documented_by') return item.direction === 'incoming' ? 'Documents' : 'Documented by'
  if (item.relation_type === 'derived_from') return item.direction === 'incoming' ? 'Supports' : 'Derived from'
  if (item.relation_type === 'requires_verification_from') return item.direction === 'incoming' ? 'Verifies' : 'Requires verification from'
  return humanizeClientBrainV2Value(item.relation_type)
}

function RelationshipGroup({ title, items }: { title: string; items: ClientBrainV2RecordRelationship[] }) {
  if (!items.length) return null
  return <section className="border-t border-white/[0.07] py-5">
    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-white/78">{title}</h3><span className="text-[10px] text-white/32">{items.length}</span></div>
    <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
      {items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-1 py-3">
        <div className="min-w-0"><p className="truncate text-sm text-white/65">{item.record.title}</p><p className="mt-1 text-[10px] text-white/30">{humanizeClientBrainV2Value(item.record.top_section)} · {humanizeClientBrainV2Value(item.record.subsection)}</p></div>
        <span className="shrink-0 text-[10px] font-semibold text-emerald-100/56">{relationshipLabel(item)}</span>
      </div>)}
    </div>
  </section>
}

function SourceForm<T extends ClientBrainV2SourceEditPayload | ClientBrainV2SourceCreatePayload>({ draft, setDraft, filesLocked = false }: { draft: T; setDraft: Dispatch<SetStateAction<T>>; filesLocked?: boolean }) {
  const patch = <K extends keyof T>(key: K, value: T[K]) => setDraft(current => ({ ...current, [key]: value }))
  const isUrl = draft.sourceKind === 'url'
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Source name"><input value={draft.name} onChange={event => patch('name', event.target.value)} className={INPUT} /></Field>
      <Field label="Source type"><select value={draft.sourceType} onChange={event => patch('sourceType', event.target.value as T['sourceType'])} className={INPUT}>{CLIENT_BRAIN_V2_SOURCE_TYPES.map(type => <option key={type} value={type}>{CLIENT_BRAIN_V2_SOURCE_TYPE_LABELS[type]}</option>)}</select></Field>
      <Field label="Source kind"><select disabled={filesLocked} value={draft.sourceKind} onChange={event => patch('sourceKind', event.target.value as ClientBrainV2SourceKind)} className={`${INPUT} disabled:opacity-45`}>{CLIENT_BRAIN_V2_SOURCE_KINDS.map(kind => <option key={kind} value={kind}>{humanizeClientBrainV2Value(kind)}</option>)}</select></Field>
      <Field label="Status"><select value={draft.status} onChange={event => patch('status', event.target.value as T['status'])} className={INPUT}>{CLIENT_BRAIN_V2_SOURCE_STATUSES.map(status => <option key={status} value={status}>{CLIENT_BRAIN_V2_SOURCE_STATUS_LABELS[status]}</option>)}</select></Field>
      <Field label="Trust"><select value={draft.trust} onChange={event => patch('trust', event.target.value as T['trust'])} className={INPUT}>{CLIENT_BRAIN_V2_SOURCE_TRUSTS.map(trust => <option key={trust} value={trust}>{CLIENT_BRAIN_V2_SOURCE_TRUST_LABELS[trust]}</option>)}</select></Field>
      <Field label="Last verified"><input type="date" value={draft.lastVerified} onChange={event => patch('lastVerified', event.target.value)} className={INPUT} /></Field>
      {isUrl && <div className="sm:col-span-2"><Field label="Source URL"><input type="url" value={draft.externalUrl} onChange={event => patch('externalUrl', event.target.value)} className={INPUT} placeholder="https://" /></Field></div>}
    </div>
    <fieldset><legend className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">Authority scope</legend><div className="mt-3 flex flex-wrap gap-2">{CLIENT_BRAIN_V2_SOURCE_AUTHORITIES.map(scope => {
      const checked = draft.authorityScopes.includes(scope)
      return <label key={scope} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs ${checked ? 'border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-50' : 'border-white/10 text-white/48'}`}><input type="checkbox" checked={checked} onChange={() => patch('authorityScopes', checked ? draft.authorityScopes.filter(item => item !== scope) : [...draft.authorityScopes, scope])} className="accent-emerald-300" />{CLIENT_BRAIN_V2_SOURCE_AUTHORITY_LABELS[scope]}</label>
    })}</div></fieldset>
    <Field label="Notes"><textarea value={draft.notes} onChange={event => patch('notes', event.target.value)} rows={5} className={INPUT} placeholder="Evidence context, title/version discrepancy, or verification note." /></Field>
  </div>
}

function SourceDetail({ clientId, record, onClose, onSaved }: { clientId: string; record: ClientBrainV2Record; onClose: () => void; onSaved: (payload: unknown) => void }) {
  const original = useMemo(() => sourceEditorData(record), [record])
  const [draft, setDraft] = useState<ClientBrainV2SourceEditPayload>(original)
  const [saving, setSaving] = useState(false)
  const [openingFileId, setOpeningFileId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const relationships = record.relationships ?? []
  const supported = relationships.filter(item => item.record.top_section !== 'sources')
  const relatedSources = relationships.filter(item => item.record.top_section === 'sources')
  const assets = supported.filter(item => item.record.top_section === 'assets')
  const knowledge = supported.filter(item => item.record.top_section !== 'assets')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  })

  function close() {
    if (dirty && !window.confirm('Discard unsaved Source changes?')) return
    onClose()
  }
  async function save() {
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const payload = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save Source.')
      onSaved(payload)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save Source.') } finally { setSaving(false) }
  }
  async function openFile(fileId: string) {
    setOpeningFileId(fileId); setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/sources/file?record_id=${encodeURIComponent(record.id)}&file_id=${encodeURIComponent(fileId)}`, { cache: 'no-store' })
      const payload = await response.json() as { success?: boolean; error?: string; url?: string }
      if (!response.ok || !payload.success || !payload.url) throw new Error(payload.error || 'Unable to open Source file.')
      window.open(payload.url, '_blank', 'noopener,noreferrer')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to open Source file.') } finally { setOpeningFileId(null) }
  }
  async function remove() {
    if (!window.confirm('Delete this unlinked Source? Linked Sources must be kept as Historical or Superseded.')) return
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/sources/${record.id}`, { method: 'DELETE' })
      const payload = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to delete Source.')
      onSaved(payload); onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to delete Source.') } finally { setSaving(false) }
  }

  return createPortal(<div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${record.title} Source`}>
    <div className="ml-auto flex h-full w-full max-w-5xl flex-col border-l border-white/10 bg-[#07100d] shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><StatusBadge status={sourceStatusForRecord(record)} /><TrustBadge trust={sourceTrustForRecord(record)} /></div><h2 className="truncate text-xl font-semibold text-white sm:text-2xl">{record.title}</h2><p className="mt-2 text-sm text-white/42">{CLIENT_BRAIN_V2_SOURCE_TYPE_LABELS[sourceTypeForRecord(record)]} · {humanizeClientBrainV2Value(sourceKindForRecord(record))}</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={!dirty || saving} onClick={() => void save()} className="min-h-11 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button><button type="button" onClick={close} aria-label="Close Source" className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 text-xl text-white/50 hover:text-white">×</button></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">{error && <p role="alert" className="mb-5 rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}<div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]"><div><SourceForm draft={draft} setDraft={setDraft} filesLocked={Boolean(record.files?.length)} /><RelationshipGroup title="Knowledge supported" items={knowledge} /><RelationshipGroup title="Assets supported" items={assets} /><RelationshipGroup title="Related sources" items={relatedSources} /></div><aside className="space-y-6 xl:border-l xl:border-white/[0.07] xl:pl-7"><section><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">Original source</p>{sourceExternalUrl(record) ? <a href={sourceExternalUrl(record)} target="_blank" rel="noreferrer" className="mt-3 block break-all text-sm leading-6 text-emerald-100/75 underline decoration-emerald-300/25 underline-offset-4">{sourceExternalUrl(record)}</a> : <p className="mt-3 text-sm text-white/38">No source URL recorded.</p>}</section><section className="border-t border-white/[0.07] pt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">Private files</p>{record.files?.length ? <div className="mt-3 space-y-2">{record.files.map(file => <button key={file.id} type="button" disabled={openingFileId === file.id} onClick={() => file.file_object_id && void openFile(file.file_object_id)} className="w-full rounded-md border border-white/10 px-3 py-3 text-left text-sm text-white/68 hover:bg-white/[0.035] disabled:opacity-50"><span className="block truncate">{openingFileId === file.id ? 'Preparing secure view…' : file.file_name}</span><span className="mt-1 block text-[10px] text-white/30">Open private document</span></button>)}</div> : <p className="mt-3 text-sm text-white/38">No file attached.</p>}</section><section className="border-t border-white/[0.07] pt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">Traceability</p><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-white/32">Authority scope</dt><dd className="mt-1 text-white/65">{authoritySummary(record)}</dd></div><div><dt className="text-white/32">Last verified</dt><dd className="mt-1 text-white/65">{sourceDate(record.last_verified_at)}</dd></div><div><dt className="text-white/32">Supported records</dt><dd className="mt-1 text-white/65">{supported.length}</dd></div></dl></section><section className="border-t border-white/[0.07] pt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">Version history</p><p className="mt-3 text-sm text-white/45">{record.versions?.length ? `${record.versions.length} prior source snapshot${record.versions.length === 1 ? '' : 's'} retained.` : 'History begins after the first Sources V2 save.'}</p></section><button type="button" disabled={saving || supported.length > 0} onClick={() => void remove()} className="min-h-11 w-full rounded-md border border-red-300/20 px-4 text-sm font-semibold text-red-100/75 disabled:cursor-not-allowed disabled:opacity-35">{supported.length ? 'Linked source: use Historical or Superseded' : 'Delete source'}</button></aside></div></div>
    </div>
  </div>, document.body)
}

function AddSourceModal({ clientId, onClose, onSaved }: { clientId: string; onClose: () => void; onSaved: (payload: unknown) => void }) {
  const [draft, setDraft] = useState<ClientBrainV2SourceCreatePayload>({ section: 'sources', name: '', sourceType: 'client_provided', sourceKind: 'manual', status: 'needs_review', trust: 'unknown', authorityScopes: [], lastVerified: '', externalUrl: '', notes: '', supersededById: null, relationshipTargetIds: [] })
  const [targets, setTargets] = useState<SourceTarget[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void (async () => { const response = await fetch(`/api/clients/${clientId}/brain-v2/sources/options`, { cache: 'no-store' }); const payload = await response.json() as { targets?: SourceTarget[] }; if (response.ok) setTargets(payload.targets ?? []) })() }, [clientId])
  async function save() {
    setSaving(true); setError('')
    try {
      let response: Response
      if (draft.sourceKind === 'file') {
        if (!file) throw new Error('Choose a Source file first.')
        const form = new FormData(); form.set('file', file); form.set('source', JSON.stringify(draft))
        response = await fetch(`/api/clients/${clientId}/brain-v2/sources/file`, { method: 'POST', body: form })
      } else {
        response = await fetch(`/api/clients/${clientId}/brain-v2`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      }
      const payload = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to add Source.')
      onSaved(payload); onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to add Source.') } finally { setSaving(false) }
  }
  return createPortal(<div className="fixed inset-0 z-[85] bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add Source"><div className="mx-auto my-6 flex max-h-[calc(100vh-3rem)] w-[min(760px,calc(100vw-2rem))] flex-col rounded-lg border border-white/10 bg-[#07100d] shadow-2xl"><header className="flex items-center justify-between border-b border-white/10 px-5 py-5"><div><h2 className="text-xl font-semibold text-white">Add Source</h2><p className="mt-1 text-sm text-white/42">Add evidence without creating Client Brain facts.</p></div><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 text-xl text-white/50 hover:text-white">×</button></header><div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">{error && <p role="alert" className="mb-5 rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}<SourceForm draft={draft} setDraft={setDraft} />{draft.sourceKind === 'file' && <Field label="Upload file"><input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={event => setFile(event.target.files?.[0] ?? null)} className={INPUT} />{file && <p className="mt-2 text-xs text-white/46">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}</Field>}<section className="mt-6 border-t border-white/[0.07] pt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/32">Supports existing records</p><p className="mt-2 text-sm text-white/42">Optional. Links are limited to this client and retain traceability.</p><div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-white/10 p-2">{targets.map(target => { const checked = draft.relationshipTargetIds?.includes(target.id) ?? false; return <label key={target.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm text-white/62 hover:bg-white/[0.035]"><input type="checkbox" checked={checked} onChange={() => setDraft(current => ({ ...current, relationshipTargetIds: checked ? (current.relationshipTargetIds ?? []).filter(id => id !== target.id) : [...(current.relationshipTargetIds ?? []), target.id] }))} className="accent-emerald-300" /><span className="min-w-0"><span className="block truncate">{target.title}</span><span className="text-[10px] text-white/28">{humanizeClientBrainV2Value(target.top_section)} · {humanizeClientBrainV2Value(target.subsection)}</span></span></label> })}</div></section></div><footer className="flex justify-end gap-3 border-t border-white/10 px-5 py-4"><button type="button" onClick={onClose} className="min-h-11 rounded-md border border-white/10 px-4 text-sm font-semibold text-white/58">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black disabled:opacity-50">{saving ? 'Adding…' : 'Add Source'}</button></footer></div></div>, document.body)
}

export default function SourcesWorkspace({ clientId, records, activeType, onSaved }: SourcesWorkspaceProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [trust, setTrust] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const summary = useMemo(() => ({ total: records.length, current: records.filter(item => sourceStatusForRecord(item) === 'current').length, review: records.filter(item => sourceStatusForRecord(item) === 'needs_review').length, historical: records.filter(item => sourceStatusForRecord(item) === 'historical').length, superseded: records.filter(item => sourceStatusForRecord(item) === 'superseded').length }), [records])
  const visible = useMemo(() => { const query = search.trim().toLocaleLowerCase(); return records.filter(record => {
    const text = [record.title, record.summary, record.content, sourceExternalUrl(record), authoritySummary(record), ...(record.relationships ?? []).map(item => item.record.title)].join(' ').toLocaleLowerCase()
    return filterMatchesActiveType(record, activeType) && (status === 'all' || sourceStatusForRecord(record) === status) && (type === 'all' || sourceTypeForRecord(record) === type) && (trust === 'all' || sourceTrustForRecord(record) === trust) && (!query || text.includes(query))
  }) }, [activeType, records, search, status, trust, type])
  const selected = selectedId ? records.find(record => record.id === selectedId) ?? null : null
  return <div className="space-y-5"><section className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-base font-semibold text-white/78">Source Library</p><p className="mt-1 text-sm text-white/42">Evidence, provenance and authority behind this Client Brain.</p></div><button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-black">Add Source</button></section><section className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] sm:grid-cols-5">{[['Sources', summary.total], ['Current', summary.current], ['Needs Review', summary.review], ['Historical', summary.historical], ['Superseded', summary.superseded]].map(([label, value]) => <div key={String(label)} className="border-r border-white/[0.07] px-4 py-3 last:border-r-0"><p className="text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase text-white/30">{label}</p></div>)}</section><section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 md:grid-cols-[minmax(220px,1fr)_160px_180px_160px]"><Field label="Search sources"><input value={search} onChange={event => setSearch(event.target.value)} className={INPUT} placeholder="Source, authority, or supported record" /></Field><Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)} className={INPUT}><option value="all">All statuses</option>{CLIENT_BRAIN_V2_SOURCE_STATUSES.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_SOURCE_STATUS_LABELS[item]}</option>)}</select></Field><Field label="Source type"><select value={type} onChange={event => setType(event.target.value)} className={INPUT}><option value="all">All types</option>{CLIENT_BRAIN_V2_SOURCE_TYPES.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_SOURCE_TYPE_LABELS[item]}</option>)}</select></Field><Field label="Trust"><select value={trust} onChange={event => setTrust(event.target.value)} className={INPUT}><option value="all">All trust levels</option>{CLIENT_BRAIN_V2_SOURCE_TRUSTS.map(item => <option key={item} value={item}>{CLIENT_BRAIN_V2_SOURCE_TRUST_LABELS[item]}</option>)}</select></Field></section><p className="text-xs text-white/34">{visible.length} of {records.length} sources</p>{visible.length ? <div className="divide-y divide-white/[0.07] overflow-hidden rounded-lg border border-white/10 bg-white/[0.018]">{visible.map(record => <button key={record.id} type="button" onClick={() => setSelectedId(record.id)} className="flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-white/[0.035] sm:px-5"><SourceGlyph record={record} /><span className="min-w-0 flex-1"><span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white/78">{record.title}</span><span className="mt-1 block truncate text-xs text-white/36">{CLIENT_BRAIN_V2_SOURCE_TYPE_LABELS[sourceTypeForRecord(record)]} · {authoritySummary(record)}</span></span><span className="flex shrink-0 gap-2"><StatusBadge status={sourceStatusForRecord(record)} /><TrustBadge trust={sourceTrustForRecord(record)} /></span></span><span className="mt-3 grid gap-2 text-[10px] text-white/34 sm:grid-cols-3"><span>{humanizeClientBrainV2Value(sourceKindForRecord(record))}</span><span>Verified {sourceDate(record.last_verified_at)}</span><span>{supportedCount(record)} supported {supportedCount(record) === 1 ? 'record' : 'records'}</span></span></span></button>)}</div> : <div className="rounded-lg border border-dashed border-white/12 px-5 py-12 text-center"><h3 className="text-base font-semibold text-white/68">No sources match</h3><p className="mt-2 text-sm text-white/34">Adjust the filters or add a new evidence source.</p></div>}{selected && <SourceDetail key={`${selected.id}:${selected.updated_at}`} clientId={clientId} record={selected} onClose={() => setSelectedId(null)} onSaved={onSaved} />}{adding && <AddSourceModal clientId={clientId} onClose={() => setAdding(false)} onSaved={onSaved} />}</div>
}
