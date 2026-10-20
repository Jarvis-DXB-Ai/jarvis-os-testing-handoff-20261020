"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IndividualProductionArtifact, IndividualProductionPackage, IndividualProductionReference } from '@/lib/social-individual-production-types'

type Provider = { provider: string; model: string; mode: 'dry_run' | 'live'; aspect_ratio: string; output_resolution: string; max_references: number; prompt_version: string }
type Response = { provider: Provider; package: IndividualProductionPackage; artifacts: IndividualProductionArtifact[] }

function requestError(payload: unknown, fallback: string) { return typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string' ? payload.error : fallback }
async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) throw new Error(requestError(payload, 'Unable to load Individual Production.'))
  return payload as T
}
function statusTone(status: string) {
  if (status === 'selected') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50'
  if (status === 'generated') return 'border-sky-300/30 bg-sky-300/10 text-sky-50'
  if (status === 'blocked' || status === 'failed') return 'border-red-300/25 bg-red-300/[0.08] text-red-100'
  if (status === 'stale') return 'border-amber-300/25 bg-amber-300/[0.08] text-amber-50'
  return 'border-white/10 bg-white/[0.04] text-white/60'
}
function roleLabel(reference: IndividualProductionReference) {
  if (reference.role === 'pinterest_inspiration') return 'Composition reference'
  if (reference.role === 'subject_truth') return 'Product truth'
  if (reference.role === 'supporting_food_truth') return 'Supporting food truth'
  if (reference.role === 'supporting_drink_truth') return 'Supporting drink truth'
  if (reference.role === 'venue_truth') {
    if (reference.venue_truth_role === 'primary_composition_truth') return 'Primary venue truth'
    if (reference.venue_truth_role === 'same_zone_detail_truth') return 'Same-zone detail truth'
    if (reference.venue_truth_role === 'spatial_support_truth') return 'Legacy venue support truth'
    if (reference.venue_truth_role === 'ceiling_lighting_truth') return 'Venue ceiling / lighting truth'
    if (reference.venue_truth_role === 'furniture_material_truth') return 'Venue furniture / material truth'
    return reference.environment_role === 'surface_truth' ? 'Venue table surface truth' : 'Venue environment truth'
  }
  if (reference.role === 'animal_truth') return 'Animal truth'
  return 'Person truth'
}
function strengthLabel(reference: IndividualProductionReference) {
  if (reference.match_strength === 'replicate_composition') return 'Replicate composition'
  if (reference.match_strength === 'strong_inspiration') return 'Strong inspiration'
  return 'Loose inspiration'
}
function pinterestCandidateLabel(reference: IndividualProductionReference) {
  const archetype = reference.scene_archetype?.replaceAll('_', ' ') ?? 'other'
  const metadata = reference.metadata ?? {}
  const details = [String(metadata.creative_categories ?? '').replaceAll(',', ' / '), String(metadata.human_presence ?? '').replaceAll('_', ' '), String(metadata.interaction ?? '').replaceAll('_', ' ')].filter(Boolean)
  return `${archetype} · ${details.join(' · ')}`
}
function productionBrief(value: unknown) {
  return String(value ?? '').replace(/,?\s*keeping subject safely within crop zone\.?/i, '').trim()
}

export function MonthlyIndividualProduction({ clientId, planId, itemId, onChanged, onClose }: { clientId: string; planId: string; itemId: string; onChanged?: () => void; onClose: () => void }) {
  const [data, setData] = useState<Response | null>(null)
  const [correction, setCorrection] = useState('')
  const [pinterestReferenceId, setPinterestReferenceId] = useState<string | null>(null)
  const [showPinterestChoices, setShowPinterestChoices] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)
  const [busy, setBusy] = useState<'load' | 'generate' | 'select' | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const packageRequest = useRef(0)
  const endpoint = `/api/clients/${clientId}/monthly-plans/${planId}/items/${itemId}/production`

  const load = useCallback(async (nextCorrection = '', nextPinterestReferenceId = pinterestReferenceId) => {
    const requestId = ++packageRequest.current
    setBusy('load'); setError(null)
    try {
      const params = new URLSearchParams()
      if (nextCorrection.trim()) params.set('correction', nextCorrection)
      if (nextPinterestReferenceId) params.set('pinterest_reference_id', nextPinterestReferenceId)
      const response = await requestJson<Response>(`${endpoint}${params.size ? `?${params.toString()}` : ''}`)
      if (requestId === packageRequest.current) setData(response)
    } catch (loadError) {
      if (requestId === packageRequest.current) setError(loadError instanceof Error ? loadError.message : 'Unable to inspect the production package.')
    } finally { if (requestId === packageRequest.current) setBusy(null) }
  }, [endpoint, pinterestReferenceId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load('') }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && busy !== 'generate') onClose() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [busy, onClose])

  const generate = async () => {
    if (!data || data.package.status === 'blocked') return
    if (data.provider.mode === 'live' && !window.confirm('Generate one final 4:5 candidate using the displayed package and references? This makes one provider request.')) return
    setBusy('generate'); setError(null); setNotice(null)
    try {
      const result = await requestJson<{ provider_called: boolean; message?: string }>(endpoint, { method: 'POST', body: JSON.stringify({ correction, pinterest_reference_id: pinterestReferenceId }) })
      await load(correction)
      setNotice(result.provider_called ? 'Production candidate generated. Review it before selecting.' : result.message ?? 'Dry-run production package retained. No provider request was made.')
      onChanged?.()
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : 'Individual production failed. Existing candidates were preserved.') } finally { setBusy(null) }
  }
  const select = async (artifactId: string) => {
    setBusy('select'); setError(null)
    try {
      await requestJson(`${endpoint}/${artifactId}`, { method: 'PATCH', body: JSON.stringify({ action: 'select' }) })
      await load(correction); setNotice('Production candidate selected for this Monthly Plan item. It was not added to Client Brain truth.'); onChanged?.()
    } catch (selectionError) { setError(selectionError instanceof Error ? selectionError.message : 'Unable to select this candidate.') } finally { setBusy(null) }
  }
  const choosePinterest = async (nextId: string) => {
    setBusy('load'); setError(null); setNotice(null)
    try {
      const result = await requestJson<{ package: IndividualProductionPackage }>(endpoint, { method: 'PATCH', body: JSON.stringify({ action: 'set_pinterest_reference', pinterest_reference_id: nextId }) })
      setPinterestReferenceId(nextId); setData(current => current ? { ...current, package: result.package } : current); setShowPinterestChoices(false)
      setNotice(nextId === 'none' ? 'Pinterest inspiration is excluded for this post.' : 'Pinterest inspiration saved for this production package.'); onChanged?.()
    } catch (selectionError) { setError(selectionError instanceof Error ? selectionError.message : 'Unable to save the Pinterest inspiration.') } finally { setBusy(null) }
  }

  const packageData = data?.package
  const selectedPinterest = packageData?.pinterest_references[0]
  const mainPreview = data?.artifacts.find(artifact => artifact.image_url)?.image_url ?? packageData?.provider_references[0]?.signed_url ?? null
  const ref = packageData?.plan_item_ref ?? 'Post'
  const subject = String(packageData?.plan_truth.subject ?? 'Individual Production')

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Individual Production ${ref}`} onMouseDown={event => { if (event.currentTarget === event.target && busy !== 'generate') onClose() }}>
    <div className="flex max-h-[calc(100vh-1.5rem)] w-[min(1480px,100%)] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#0b0d0d] shadow-2xl sm:max-h-[calc(100vh-3rem)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Individual Production</p><h2 className="mt-0.5 truncate text-lg font-semibold text-white sm:text-xl">{ref} · {subject}</h2></div>
        <div className="flex items-center gap-2">{packageData && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(packageData.status)}`}>{packageData.status === 'ready' ? 'Ready' : packageData.status}</span>}<button type="button" aria-label="Close Individual Production" onClick={onClose} disabled={busy === 'generate'} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-lg text-white/65 transition hover:bg-white/[0.06] disabled:opacity-40">x</button></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {busy === 'load' && !data ? <div className="grid min-h-64 place-items-center text-sm text-white/45"><span className="inline-flex items-center gap-2"><span className="animate-pulse">...</span> Inspecting production package...</span></div> : null}
        {error && <p className="mb-4 rounded-lg border border-red-300/20 bg-red-300/[0.08] px-3 py-2 text-xs text-red-100">{error}</p>}
        {notice && <p className="mb-4 rounded-lg border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-2 text-xs text-emerald-50">{notice}</p>}
        {packageData && <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
          <main className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5"><div><p className="text-xs font-semibold text-white/80">Production target</p><p className="mt-0.5 text-[10px] text-white/42">Full 4:5 master, grounded by the ordered reference package.</p></div><span className="text-[10px] text-white/35">{data.provider.aspect_ratio} · {data.provider.output_resolution}</span></div>
              <div className="aspect-[4/5] max-h-[54vh] bg-[#101312]"><PreviewImage url={mainPreview} alt="Current production target" className="h-full w-full object-contain"/></div>
            </section>
            <section><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-white/80">Provider reference package</p><p className="text-[10px] text-white/38">{packageData.provider_references.length} / {data.provider.max_references} attached</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{packageData.provider_references.map((reference, index) => <ReferenceTile key={reference.id} reference={reference} index={index}/>)}</div></section>
            {data.artifacts.length > 0 && <section><p className="mb-2 text-xs font-semibold text-white/80">Production versions</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{data.artifacts.map(artifact => <article key={artifact.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20"><div className="aspect-[4/5] bg-white/[0.035]">{artifact.image_url ? <img src={artifact.image_url} alt={`Version ${artifact.version}`} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-[10px] text-white/28">No image</div>}</div><div className="space-y-2 p-2"><div className="flex items-center justify-between gap-1"><span className="text-xs font-medium text-white/76">V{artifact.version}</span><span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${statusTone(artifact.status)}`}>{artifact.status}</span></div>{artifact.failure_reason ? <p className="line-clamp-2 text-[10px] text-red-100/75">{artifact.failure_reason}</p> : null}{artifact.status === 'generated' && <button type="button" disabled={busy !== null} onClick={() => void select(artifact.id)} className="inline-flex w-full items-center justify-center gap-1 rounded border border-emerald-300/25 px-2 py-1.5 text-[10px] font-semibold text-emerald-50 disabled:opacity-40">Select version</button>}</div></article>)}</div></section>}
          </main>
          <aside className="min-w-0 space-y-4">
            <section className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{packageData.production_direction.strict_venue_truth.active ? 'Saved Visual Direction' : 'Visual Direction'}</p>{packageData.production_direction.strict_venue_truth.active && <p className="mt-1 text-[11px] leading-relaxed text-white/45">The saved plan record remains intact. Physical camera and geometry instructions are overridden by venue truth below.</p>}<p className="mt-2 text-sm leading-relaxed text-white/75">{productionBrief(packageData.visual_direction.brief)}</p><div className="mt-3 flex flex-wrap gap-1.5">{(['shot_scale', 'camera_angle', 'composition', 'human_presence', 'interaction', 'motion'] as const).map(key => <span key={key} className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] text-white/58">{String(packageData.visual_direction[key] ?? '').replaceAll('_', ' ')}</span>)}</div></section>
            {packageData.production_direction.strict_venue_truth.active && <section className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.05] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-100/80">Effective Production Direction</p><p className="mt-2 text-xs font-medium text-emerald-50">Truth override: Camera and geometry locked to Venue Truth.</p><p className="mt-2 text-xs text-white/72">Primary venue reference: 1</p>{packageData.production_direction.strict_venue_truth.supporting_reference_ids.length > 0 ? <p className="mt-1 text-[11px] leading-relaxed text-white/52">Exact same-zone detail support: {packageData.truth_references.find(reference => reference.id === packageData.production_direction.strict_venue_truth.supporting_reference_ids[0])?.venue_support_reason ?? 'Qualified factual gap'}</p> : <p className="mt-1 text-[11px] leading-relaxed text-white/52">No same-zone detail reference is attached. The primary view fully controls the physical room.</p>}<p className="mt-2 text-[11px] leading-relaxed text-white/52">{packageData.production_direction.strict_venue_truth.normalization.effective_composition_instruction}</p></section>}
            <section className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{packageData.production_direction.strict_venue_truth.active ? 'Pinterest technique' : 'Pinterest composition'}</p><p className="mt-1 text-xs text-white/58">{selectedPinterest ? strengthLabel(selectedPinterest) : 'No Pinterest reference'}</p></div><button type="button" onClick={() => setShowPinterestChoices(current => !current)} disabled={busy !== null} className="text-[11px] font-semibold text-emerald-100 disabled:opacity-40">{showPinterestChoices ? 'Close' : 'Change'}</button></div>{selectedPinterest ? <div className="mt-3 flex gap-3"><PreviewImage url={selectedPinterest.signed_url} alt={selectedPinterest.title} className="h-20 w-16 shrink-0 rounded object-cover"/><div className="min-w-0"><p className="truncate text-xs font-medium text-white/75">{selectedPinterest.title}</p><p className="mt-1 text-[10px] text-white/36">{pinterestCandidateLabel(selectedPinterest)}</p><p className="mt-1 text-[11px] leading-relaxed text-white/45">{selectedPinterest.match_explanation}</p></div></div> : <p className="mt-3 text-xs text-white/36">{packageData.production_direction.strict_venue_truth.active ? 'No Pinterest reference is attached. The real venue package is sufficient.' : 'No strong active, analyzed Pinterest reference matches this direction.'}</p>}{showPinterestChoices && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3"><button type="button" onClick={() => void choosePinterest('none')} className="col-span-2 rounded border border-white/10 px-2 py-2 text-left text-[11px] text-white/58 hover:bg-white/[0.04]">No Pinterest inspiration</button>{packageData.pinterest_selection.candidates.map(reference => <button key={reference.id} type="button" onClick={() => void choosePinterest(reference.id)} className={`overflow-hidden rounded border text-left ${packageData.pinterest_selection.selected_id === reference.id ? 'border-emerald-300/40 bg-emerald-300/[0.08]' : 'border-white/10 hover:bg-white/[0.04]'}`}><PreviewImage url={reference.signed_url} alt={reference.title} className="aspect-[4/3] w-full object-cover"/><span className="block truncate px-2 pt-1.5 text-[10px] text-white/70">{reference.title}</span><span className="block truncate px-2 text-[9px] text-white/42">{pinterestCandidateLabel(reference)}</span><span className={`block truncate px-2 pb-1.5 text-[9px] ${reference.compatibility === 'compatible' ? 'text-emerald-100/75' : 'text-amber-100/75'}`}>{strengthLabel(reference)} · {reference.compatibility_reason ?? 'Technique only'}</span></button>)}</div>}</section>
            <section className="rounded-lg border border-white/10 bg-black/20 p-3"><button type="button" onClick={() => setShowTechnical(current => !current)} className="flex w-full items-center justify-between text-left"><span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Production details</span><span className={`text-white/42 transition ${showTechnical ? 'rotate-180' : ''}`}>v</span></button>{showTechnical && <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-white/55"><p><span className="text-white/75">Camera:</span> {packageData.production_direction.camera.body} · {packageData.production_direction.camera.lens} · {packageData.production_direction.camera.focal_length}</p><p><span className="text-white/75">Settings:</span> {packageData.production_direction.camera.aperture} · {packageData.production_direction.camera.iso} · {packageData.production_direction.camera.shutter_speed}</p><p><span className="text-white/75">Focus:</span> {packageData.production_direction.focus.target}</p><p><span className="text-white/75">Venue:</span> {packageData.production_direction.venue_requirement.reason}</p>{packageData.production_direction.strict_venue_truth.active && <><p><span className="text-white/75">Venue fidelity:</span> Strict truth mode · {packageData.production_direction.strict_venue_truth.allowed_camera_flexibility} camera flexibility</p><p><span className="text-white/75">Coverage:</span> {packageData.production_direction.strict_venue_truth.coverage.filter(entry => entry.supported).map(entry => entry.area.replace('_', ' ')).join(' / ')}</p></>}{packageData.production_direction.environment_truth.requires_table_surface && <p><span className="text-white/75">Dining surface:</span> {packageData.production_direction.environment_truth.table_surface_materials.join(' / ') || 'Missing approved truth'}</p>}<p><span className="text-white/75">Prompt:</span> {data.provider.prompt_version}</p></div>}</section>
            {packageData.blocked_reasons.length > 0 && <section className="rounded-lg border border-red-300/20 bg-red-300/[0.06] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-red-100">Blocking reasons</p>{packageData.blocked_reasons.map(reason => <p key={reason} className="mt-1 text-xs text-red-50/85">{reason}</p>)}</section>}
            {packageData.warnings.length > 0 && <section className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3">{packageData.warnings.map(warning => <p key={warning} className="text-xs text-amber-50">{warning}</p>)}</section>}
            <label className="block"><span className="text-[11px] font-semibold text-white/48">Correction for next version</span><textarea value={correction} onChange={event => setCorrection(event.target.value)} rows={3} placeholder="Optional. Applies only to the next production version." className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-300/35"/></label>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load(correction)} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-40">Refresh package</button><button type="button" onClick={() => void generate()} disabled={busy !== null || packageData.status === 'blocked'} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">{busy === 'generate' ? 'Preparing...' : data.provider.mode === 'dry_run' ? 'Create dry-run version' : 'Generate Image'}</button></div>
          </aside>
        </div>}
      </div>
    </div>
  </div>, document.body)
}

function PreviewImage({ url, alt, className }: { url: string | null; alt: string; className: string }) {
  return url ? <img src={url} alt={alt} className={className}/> : <div className={`${className} grid place-items-center bg-white/[0.035] text-[10px] text-white/25`}>No image</div>
}
function ReferenceTile({ reference, index }: { reference: IndividualProductionReference; index: number }) {
  return <article className="overflow-hidden rounded-lg border border-white/10 bg-black/20"><PreviewImage url={reference.signed_url} alt={reference.title} className="aspect-[4/3] w-full object-cover"/><div className="p-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-100/75">Image {index + 1} · {roleLabel(reference)}</p><p className="mt-1 truncate text-[11px] text-white/72">{reference.title}</p>{reference.match_explanation ? <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-white/40">{reference.match_explanation}</p> : null}</div></article>
}
