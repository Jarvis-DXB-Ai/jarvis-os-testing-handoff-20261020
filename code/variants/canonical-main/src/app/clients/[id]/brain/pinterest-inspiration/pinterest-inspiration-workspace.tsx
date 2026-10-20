'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/sidebar'
import {
  PINTEREST_BACKGROUND_STYLES,
  PINTEREST_CREATIVE_CATEGORIES,
  PINTEREST_INSPIRATION_ANALYSIS_STATES,
  PINTEREST_INSPIRATION_STATUSES,
  PINTEREST_LIGHTING_STYLES,
  labelPinterestInspirationValue,
  type PinterestInspirationRecord,
  type PinterestInspirationStatus,
} from '@/lib/client-brain-pinterest-inspiration'
import { VISUAL_DIRECTION_OPTIONS } from '@/lib/social-monthly-visual-direction-types'

type Payload = {
  success: boolean
  error?: string
  inspirations?: PinterestInspirationRecord[]
  counts?: Record<PinterestInspirationStatus, number>
  provider?: { provider: string; model: string; configured: boolean; batch_cap: number; request_behavior: string }
  results?: Array<{ id: string; success: boolean; error?: string }>
}

type Filters = { search: string; status: string; analysisState: string; category: string; shotScale: string; cameraAngle: string; composition: string; humanPresence: string; interaction: string; technique: string; lighting: string }
const EMPTY_FILTERS: Filters = { search: '', status: '', analysisState: '', category: '', shotScale: '', cameraAngle: '', composition: '', humanPresence: '', interaction: '', technique: '', lighting: '' }

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <label className="min-w-0"><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-xs text-white/70 outline-none focus:border-emerald-300/45"><option value="">{label}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
}

function StatusBadge({ status }: { status: PinterestInspirationStatus }) {
  const tone = status === 'active' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : status === 'disabled' ? 'border-white/10 bg-white/[0.04] text-white/40' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tone}`}>{labelPinterestInspirationValue(status)}</span>
}

function splitTags(value: string) { return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))] }

export default function PinterestInspirationWorkspace({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<PinterestInspirationRecord[]>([])
  const [counts, setCounts] = useState<Record<PinterestInspirationStatus, number>>({ active: 0, needs_review: 0, disabled: 0 })
  const [provider, setProvider] = useState<Payload['provider']>()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState<PinterestInspirationRecord | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceBoard, setSourceBoard] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    return params.toString()
  }, [filters])

  async function load() {
    setLoading(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/pinterest-inspirations?${queryString}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load Pinterest Inspiration.')
      setItems(payload.inspirations ?? [])
      setCounts(payload.counts ?? { active: 0, needs_review: 0, disabled: 0 })
      setProvider(payload.provider)
      setSelected(current => current.filter(id => (payload.inspirations ?? []).some(item => item.id === id)))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load Pinterest Inspiration.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    const refresh = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(refresh)
    // load intentionally follows the query snapshot rather than changing identity on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function stage(next: File[]) {
    const images = next.filter(file => /image\/(jpeg|png|webp)/.test(file.type))
    if (images.length !== next.length) setError('Only JPEG, PNG, and WEBP images can be staged.')
    setFiles(images.slice(0, 100))
  }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); stage(Array.from(event.dataTransfer.files)) }
  function onFiles(event: ChangeEvent<HTMLInputElement>) { stage(Array.from(event.target.files ?? [])); event.target.value = '' }

  async function upload() {
    if (!files.length) return
    setBusy(true); setError('')
    try {
      const form = new FormData()
      files.forEach(file => form.append('files', file))
      if (sourceUrl.trim()) form.set('source_url', sourceUrl.trim())
      if (sourceBoard.trim()) form.set('source_board', sourceBoard.trim())
      const response = await fetch(`/api/clients/${clientId}/pinterest-inspirations`, { method: 'POST', body: form })
      const payload = await response.json() as Payload & { uploaded?: unknown[] }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to stage Pinterest Inspiration.')
      setNotice(`${payload.uploaded?.length ?? files.length} inspiration ${files.length === 1 ? 'image' : 'images'} staged for review. Analysis has not run.`)
      setFiles([]); setSourceUrl(''); setSourceBoard('')
      await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to stage Pinterest Inspiration.') }
    finally { setBusy(false) }
  }

  function openItem(item: PinterestInspirationRecord) { setOpen(item); setDraft({ ...item, creative_techniques_text: item.creative_techniques.join(', '), best_for_text: item.best_for.join(', ') }); setError('') }
  async function save() {
    if (!open || !draft) return
    setBusy(true); setError('')
    try {
      const body = { ...draft, creative_techniques: splitTags(String(draft.creative_techniques_text ?? '')), best_for: splitTags(String(draft.best_for_text ?? '')), expected_updated_at: open.updated_at }
      const response = await fetch(`/api/clients/${clientId}/pinterest-inspirations/${open.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save Pinterest Inspiration.')
      setOpen(null); setDraft(null); setNotice('Pinterest Inspiration saved.'); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save Pinterest Inspiration.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!open || !window.confirm(`Delete “${open.title}”? This does not affect Client Assets.`)) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/pinterest-inspirations/${open.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_updated_at: open.updated_at }) })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to delete Pinterest Inspiration.')
      setOpen(null); setDraft(null); setNotice('Pinterest Inspiration deleted.'); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to delete Pinterest Inspiration.') }
    finally { setBusy(false) }
  }
  async function bulkStatus(status: PinterestInspirationStatus) {
    if (!selected.length) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/pinterest-inspirations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, status }) })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to update selected inspiration.')
      setNotice(`${selected.length} inspiration ${selected.length === 1 ? 'record' : 'records'} updated.`); setSelected([]); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update Pinterest Inspiration.') }
    finally { setBusy(false) }
  }
  async function analyse(analysisState: 'pending' | 'failed') {
    if (!selected.length || !provider) return
    if (!provider.configured) { setError('Pinterest analysis is not configured. You can continue adding or editing records manually.'); return }
    const eligible = selectedRecords.filter(item => item.analysis_state === analysisState)
    if (!eligible.length) return
    const capped = eligible.slice(0, provider.batch_cap)
    const action = analysisState === 'failed' ? 'Retry analysis for' : 'Analyse'
    const capNotice = eligible.length > provider.batch_cap ? ` ${eligible.length} are eligible, but only the first ${provider.batch_cap} will be sent in this explicit paid action.` : ''
    if (!window.confirm(`${action} ${capped.length} ${analysisState} inspiration${capped.length === 1 ? '' : 's'} with ${provider.model}?${capNotice}`)) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/pinterest-inspirations/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: capped.map(item => item.id), analysis_state: analysisState }) })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Pinterest analysis failed.')
      const failures = (payload.results ?? []).filter(result => !result.success)
      if (failures.length) setError(`${failures.length} inspiration ${failures.length === 1 ? 'analysis failed' : 'analyses failed'}. The stored failure detail is visible on each card.`)
      else setNotice('Selected inspiration analysis completed. Review and activate only the references you want retrieved.')
      setSelected([]); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Pinterest analysis failed.') }
    finally { setBusy(false) }
  }

  const option = (values: readonly string[]) => values.map(value => [value, labelPinterestInspirationValue(value)] as const)
  const selectedCount = selected.length
  const selectedRecords = items.filter(item => selected.includes(item.id))
  const pendingSelected = selectedRecords.filter(item => item.analysis_state === 'pending')
  const failedSelected = selectedRecords.filter(item => item.analysis_state === 'failed')
  return <div className="brain-dark jarvis-dark-shell min-h-screen"><Sidebar /><main className="jarvis-page">
    <header className="jarvis-hero mb-5"><Link href={`/clients/${clientId}/brain`} className="jarvis-muted-button mb-5 inline-flex px-3 py-2 text-xs">Back to Client Brain</Link><p className="jarvis-eyebrow">Creative working library</p><div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-semibold text-white md:text-4xl">Pinterest Inspiration</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/48">Creative technique references only. They never establish DemoClientB product, venue, menu, person, or brand truth.</p></div><div className="flex gap-2 text-xs text-white/45"><span>{counts.active} active</span><span>·</span><span>{counts.needs_review} needs review</span><span>·</span><span>{counts.disabled} disabled</span></div></div></header>
    <section className="mb-6 grid gap-4 rounded-lg border border-white/10 bg-white/[0.025] p-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div onDragOver={event => event.preventDefault()} onDrop={onDrop} className="rounded-md border border-dashed border-emerald-300/25 bg-emerald-300/[0.025] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-white">Upload inspiration images</h2><p className="mt-1 text-xs text-white/42">Stage up to 100 JPEG, PNG, or WEBP images. Upload does not run visual analysis.</p></div><button type="button" onClick={() => fileInput.current?.click()} className="min-h-10 rounded-md border border-emerald-300/30 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/[0.08]">Choose images</button><input ref={fileInput} onChange={onFiles} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" /></div>{files.length > 0 && <p className="mt-4 text-xs text-emerald-100/75">{files.length} image{files.length === 1 ? '' : 's'} staged. {files.slice(0, 3).map(file => file.name).join(', ')}{files.length > 3 ? '…' : ''}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="Optional source URL" className="h-10 rounded-md border border-white/10 bg-black/25 px-3 text-xs text-white outline-none" /><input value={sourceBoard} onChange={event => setSourceBoard(event.target.value)} placeholder="Optional Pinterest board" className="h-10 rounded-md border border-white/10 bg-black/25 px-3 text-xs text-white outline-none" /></div></div><button disabled={!files.length || busy} onClick={() => void upload()} className="min-h-11 self-end rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black hover:bg-emerald-200 disabled:opacity-40">{busy ? 'Working…' : 'Stage upload'}</button></section>
    {error && <p role="alert" className="mb-4 rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}{notice && <p className="mb-4 rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">{notice}</p>}
    <section className="mb-5 space-y-3"><div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6"><input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Search technique, summary, notes" className="h-10 rounded-md border border-white/10 bg-black/25 px-3 text-xs text-white outline-none md:col-span-2" /><Select label="Status" value={filters.status} onChange={value => setFilters(current => ({ ...current, status: value }))} options={option(PINTEREST_INSPIRATION_STATUSES)} /><Select label="Analysis status" value={filters.analysisState} onChange={value => setFilters(current => ({ ...current, analysisState: value }))} options={option(PINTEREST_INSPIRATION_ANALYSIS_STATES)} /><Select label="Category" value={filters.category} onChange={value => setFilters(current => ({ ...current, category: value }))} options={option(PINTEREST_CREATIVE_CATEGORIES)} /><Select label="Shot scale" value={filters.shotScale} onChange={value => setFilters(current => ({ ...current, shotScale: value }))} options={VISUAL_DIRECTION_OPTIONS.shot_scale} /><Select label="Lighting" value={filters.lighting} onChange={value => setFilters(current => ({ ...current, lighting: value }))} options={option(PINTEREST_LIGHTING_STYLES)} /></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Select label="Camera angle" value={filters.cameraAngle} onChange={value => setFilters(current => ({ ...current, cameraAngle: value }))} options={VISUAL_DIRECTION_OPTIONS.camera_angle} /><Select label="Composition" value={filters.composition} onChange={value => setFilters(current => ({ ...current, composition: value }))} options={VISUAL_DIRECTION_OPTIONS.composition} /><Select label="Human presence" value={filters.humanPresence} onChange={value => setFilters(current => ({ ...current, humanPresence: value }))} options={VISUAL_DIRECTION_OPTIONS.human_presence} /><Select label="Interaction" value={filters.interaction} onChange={value => setFilters(current => ({ ...current, interaction: value }))} options={VISUAL_DIRECTION_OPTIONS.interaction} /><input value={filters.technique} onChange={event => setFilters(current => ({ ...current, technique: event.target.value }))} placeholder="Technique tag" className="h-10 rounded-md border border-white/10 bg-black/25 px-3 text-xs text-white outline-none" /></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="min-h-9 rounded-md border border-white/10 px-3 text-xs text-white/56 hover:text-white">Clear filters</button><button type="button" disabled={busy || !items.length} onClick={() => setSelected(items.map(item => item.id))} className="min-h-9 rounded-md border border-white/10 px-3 text-xs font-semibold text-white/70 disabled:opacity-40">Select all visible</button>{selectedCount > 0 && <><span className="ml-1 text-xs text-white/46">{selectedCount} of {items.length} selected</span><button type="button" disabled={busy} onClick={() => setSelected([])} className="min-h-9 rounded-md border border-white/10 px-3 text-xs text-white/56 disabled:opacity-40">Clear selection</button><button type="button" disabled={busy} onClick={() => void bulkStatus('active')} className="min-h-9 rounded-md border border-emerald-300/25 px-3 text-xs font-semibold text-emerald-100 disabled:opacity-40">Activate</button><button type="button" disabled={busy} onClick={() => void bulkStatus('needs_review')} className="min-h-9 rounded-md border border-amber-300/25 px-3 text-xs font-semibold text-amber-100 disabled:opacity-40">Needs review</button><button type="button" disabled={busy} onClick={() => void bulkStatus('disabled')} className="min-h-9 rounded-md border border-white/10 px-3 text-xs font-semibold text-white/55 disabled:opacity-40">Disable</button>{pendingSelected.length > 0 && <button type="button" disabled={busy} onClick={() => void analyse('pending')} className="min-h-9 rounded-md border border-violet-300/25 px-3 text-xs font-semibold text-violet-100 disabled:opacity-40">Analyse pending ({pendingSelected.length})</button>}{failedSelected.length > 0 && <button type="button" disabled={busy} onClick={() => void analyse('failed')} className="min-h-9 rounded-md border border-red-300/25 px-3 text-xs font-semibold text-red-100 disabled:opacity-40">Retry failed ({failedSelected.length})</button>}</>}</div></section>
    {loading ? <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{[1,2,3,4].map(item => <div key={item} className="aspect-[4/5] animate-pulse rounded-lg bg-white/[0.04]" />)}</div> : items.length === 0 ? <section className="rounded-lg border border-dashed border-white/12 px-6 py-16 text-center"><h2 className="text-sm font-semibold text-white/70">No Pinterest inspiration yet</h2><p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-white/40">Upload individual curated references to build the client’s creative technique library. Images remain separate from Client Assets until you explicitly activate them for retrieval.</p></section> : <section className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">{items.map(item => <article key={item.id} className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]"><button type="button" onClick={() => openItem(item)} className="block w-full text-left"><div className="relative bg-black/30">{item.file.signed_url ? <img src={item.file.signed_url} alt={item.title} className="max-h-[420px] w-full object-cover" /> : <div className="aspect-[4/5] p-4 text-xs text-white/35">Preview unavailable</div>}<label onClick={event => event.stopPropagation()} className="absolute left-3 top-3 rounded bg-black/65 p-1.5"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} aria-label={`Select ${item.title}`} /></label></div><div className="p-3"><div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 text-sm font-semibold text-white">{item.title}</h2><StatusBadge status={item.status} /></div>{item.requires_individual_pin_upload && <p className="mt-2 text-[10px] font-semibold text-amber-100">Upload individual pin</p>}<p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/45">{item.visual_summary || (item.analysis_state === 'pending' ? 'Analysis pending. Add metadata manually or use Analyze selected.' : item.analysis_error || 'No visual summary yet.')}</p>{item.creative_techniques.length > 0 && <p className="mt-3 line-clamp-1 text-[10px] font-medium text-emerald-100/62">{item.creative_techniques.join(' · ')}</p>}</div></button></article>)}</section>}
  </main>{open && draft && <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#111713] p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="jarvis-eyebrow">Pinterest Inspiration</p><h2 className="mt-2 text-xl font-semibold text-white">Edit reference</h2></div><button type="button" onClick={() => { setOpen(null); setDraft(null) }} className="min-h-10 rounded-md border border-white/10 px-3 text-sm text-white/65">Close</button></div>{open.file.signed_url && <img src={open.file.signed_url} alt={open.title} className="mt-5 max-h-[360px] w-full rounded-md object-contain bg-black/25" />}<p className="mt-3 text-xs leading-relaxed text-amber-100/70">Creative inspiration only. It cannot establish DemoClientB product, venue, menu, person, or brand truth.</p><div className="mt-5 grid gap-3"><label className="text-xs text-white/55">Title<input value={String(draft.title ?? '')} onChange={event => setDraft({ ...draft, title: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><Select label="Status" value={String(draft.status ?? 'needs_review')} onChange={value => setDraft({ ...draft, status: value })} options={option(PINTEREST_INSPIRATION_STATUSES)} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-white/55">Source URL<input value={String(draft.source_url ?? '')} onChange={event => setDraft({ ...draft, source_url: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><label className="text-xs text-white/55">Pinterest board<input value={String(draft.source_board ?? '')} onChange={event => setDraft({ ...draft, source_board: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><label className="text-xs text-white/55">External source ID<input value={String(draft.external_source_id ?? '')} onChange={event => setDraft({ ...draft, external_source_id: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><label className="text-xs text-white/55">Original source note<input value={String(draft.original_source_note ?? '')} onChange={event => setDraft({ ...draft, original_source_note: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label></div><label className="text-xs text-white/55">Categories, comma separated<input value={Array.isArray(draft.creative_categories) ? draft.creative_categories.join(', ') : ''} onChange={event => setDraft({ ...draft, creative_categories: splitTags(event.target.value) })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><div className="grid gap-3 sm:grid-cols-2"><Select label="Shot scale" value={String(draft.shot_scale ?? '')} onChange={value => setDraft({ ...draft, shot_scale: value })} options={VISUAL_DIRECTION_OPTIONS.shot_scale} /><Select label="Camera angle" value={String(draft.camera_angle ?? '')} onChange={value => setDraft({ ...draft, camera_angle: value })} options={VISUAL_DIRECTION_OPTIONS.camera_angle} /><Select label="Composition" value={String(draft.composition ?? '')} onChange={value => setDraft({ ...draft, composition: value })} options={VISUAL_DIRECTION_OPTIONS.composition} /><Select label="Human presence" value={String(draft.human_presence ?? '')} onChange={value => setDraft({ ...draft, human_presence: value })} options={VISUAL_DIRECTION_OPTIONS.human_presence} /><Select label="Interaction" value={String(draft.interaction ?? '')} onChange={value => setDraft({ ...draft, interaction: value })} options={VISUAL_DIRECTION_OPTIONS.interaction} /><Select label="Motion" value={String(draft.motion ?? '')} onChange={value => setDraft({ ...draft, motion: value })} options={VISUAL_DIRECTION_OPTIONS.motion} /><Select label="Lighting" value={String(draft.lighting_style ?? '')} onChange={value => setDraft({ ...draft, lighting_style: value })} options={option(PINTEREST_LIGHTING_STYLES)} /><Select label="Background" value={String(draft.background_style ?? '')} onChange={value => setDraft({ ...draft, background_style: value })} options={option(PINTEREST_BACKGROUND_STYLES)} /></div><label className="text-xs text-white/55">Creative techniques, comma separated<input value={String(draft.creative_techniques_text ?? '')} onChange={event => setDraft({ ...draft, creative_techniques_text: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><label className="text-xs text-white/55">Best for, comma separated<input value={String(draft.best_for_text ?? '')} onChange={event => setDraft({ ...draft, best_for_text: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none" /></label><label className="text-xs text-white/55">Visual summary<textarea value={String(draft.visual_summary ?? '')} onChange={event => setDraft({ ...draft, visual_summary: event.target.value })} rows={4} className="mt-1 w-full rounded-md border border-white/10 bg-black/25 p-3 text-sm text-white outline-none" /></label><label className="text-xs text-white/55">Internal notes<textarea value={String(draft.notes ?? '')} onChange={event => setDraft({ ...draft, notes: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-white/10 bg-black/25 p-3 text-sm text-white outline-none" /></label></div><div className="mt-6 flex flex-wrap justify-between gap-2"><button type="button" disabled={busy} onClick={() => void remove()} className="min-h-10 rounded-md border border-red-300/25 px-4 text-sm font-semibold text-red-100 disabled:opacity-40">Delete</button><button type="button" disabled={busy} onClick={() => void save()} className="min-h-10 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button></div></aside>}</div>
}
