'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EDITABLE_RESTAURANT_ASSET_CATEGORIES, type EditableRestaurantAssetCategory } from '@/lib/client-brain-v2-asset-edit'

type Category = EditableRestaurantAssetCategory
type MenuOption = { id: string; title: string }
type StagedFile = {
  id: string
  file_name: string
  file_type: string
  file_kind: string
  width: number | null
  height: number | null
  signed_url: string
}
type Candidate = {
  id: string
  menu_record_id: string
  canonical_name: string
  menu_section: string | null
  price: number | null
  currency: string | null
  matchType: string
}
type VisualAnalysis = {
  status: 'completed' | 'failed'
  warning?: string
}
type IngestionDraft = { id: string; metadata?: Record<string, unknown>; display_name?: string }

const CATEGORY_DETAILS: Record<Category, { label: string; detail: string }> = {
  food: { label: 'Food', detail: 'One or two raw references become one reviewed studio truth asset.' },
  drinks: { label: 'Drink', detail: 'One or two raw references become one reviewed studio truth asset.' },
  interiors: { label: 'Interior', detail: 'One original image becomes a reviewed venue truth reference.' },
  exteriors: { label: 'Exterior', detail: 'One original image becomes a reviewed venue truth reference.' },
  venue_items: { label: 'Venue Item', detail: 'One direct-upload physical truth object.' },
  staff: { label: 'Staff', detail: 'A Staff image is valid with no identity or employment metadata.' },
}
const CATEGORIES = EDITABLE_RESTAURANT_ASSET_CATEGORIES.map(id => ({ id, ...CATEGORY_DETAILS[id] }))

function isProduct(category: Category) {
  return category === 'food' || category === 'drinks'
}

function fileLabel(file: StagedFile) {
  return file.width && file.height ? `${file.file_name} · ${file.width}×${file.height}` : file.file_name
}

async function api(clientId: string, init?: RequestInit) {
  const response = await fetch(`/api/clients/${clientId}/brain-v2/asset-ingestion`, {
    cache: 'no-store',
    ...init,
  })
  const payload = await response.json() as Record<string, unknown>
  if (!response.ok || !payload.success) throw new Error(String(payload.error ?? 'Unable to complete Asset ingestion.'))
  return payload
}

export default function AssetIngestionModal({
  clientId,
  onClose,
  onFinalized,
}: {
  clientId: string
  onClose: () => void
  onFinalized: () => void | Promise<void>
}) {
  const [category, setCategory] = useState<Category>('food')
  const [files, setFiles] = useState<File[]>([])
  const [menus, setMenus] = useState<MenuOption[]>([])
  const [name, setName] = useState('')
  const [menuRecordId, setMenuRecordId] = useState('')
  const [draftId, setDraftId] = useState('')
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [menuItemId, setMenuItemId] = useState('')
  const [metadata, setMetadata] = useState<Record<string, unknown>>({
    key_visual_details: [],
    visual_presentation: '',
    perspective_flexibility: 'low',
  })
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [generationCorrection, setGenerationCorrection] = useState('')
  const [visualAnalysis, setVisualAnalysis] = useState<VisualAnalysis | null>(null)
  const [approvedForGeneration, setApprovedForGeneration] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api(clientId)
      .then(payload => setMenus((payload.menus as MenuOption[] | undefined) ?? []))
      .catch(error => setError(error instanceof Error ? error.message : 'Unable to load official menus.'))
  }, [clientId])

  const product = isProduct(category)
  const staff = category === 'staff'
  const generated = Boolean(generatedUrl)
  const previewFile = stagedFiles.find(file => file.file_kind === 'generated_preview') ?? stagedFiles[0]
  const selectedCandidate = candidates.find(candidate => candidate.id === menuItemId)
  const rawReferenceCount = stagedFiles.filter(file => file.file_kind === 'raw_reference').length
  const isVenueTruth = category === 'interiors' || category === 'exteriors'
  const visualDetails = Array.isArray(metadata.key_visual_details) ? metadata.key_visual_details as string[] : []
  const generationBlocker = !product
    ? ''
    : !draftId
      ? 'Stage the raw references first.'
      : rawReferenceCount < 1
        ? 'At least one raw reference must finish staging.'
        : busy
          ? 'Generation is already in progress.'
          : ''
  const canApprove = staff || !product || Boolean(menuItemId)
  const reviewReady = product ? generated : Boolean(draftId && previewFile)
  const previewUrl = generatedUrl || previewFile?.signed_url

  function resetForCategory(next: Category) {
    setCategory(next)
    setFiles([])
    setName('')
    setMenuRecordId('')
    setDraftId('')
    setStagedFiles([])
    setCandidates([])
    setMenuItemId('')
    setMetadata({ key_visual_details: [], visual_presentation: '', perspective_flexibility: 'low' })
    setGeneratedUrl('')
    setGenerationCorrection('')
    setVisualAnalysis(null)
    setApprovedForGeneration(null)
    setError('')
    setNotice('')
  }

  function chooseFiles(next: FileList | null) {
    const chosen = next ? Array.from(next) : []
    const maximum = isProduct(category) ? 2 : staff ? 12 : 1
    setFiles(chosen.slice(0, maximum))
    setError(chosen.length > maximum
      ? `${CATEGORIES.find(item => item.id === category)?.label} accepts ${maximum === 1 ? 'one image' : `up to ${maximum} images`} in this workflow.`
      : '')
  }

  function removeLocalFile(index: number) {
    setFiles(current => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function applyDraft(draft: IngestionDraft | undefined) {
    if (!draft) return
    setDraftId(draft.id)
    if (draft.display_name) setName(draft.display_name)
    if (draft.metadata) setMetadata(current => ({ ...current, ...draft.metadata }))
  }

  async function stage() {
    if (!files.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = new FormData()
      body.set('category', category)
      body.set('display_name', name)
      body.set('menu_record_id', menuRecordId)
      files.forEach(file => body.append('files', file))
      const payload = await api(clientId, { method: 'POST', body })
      const draft = payload.draft as IngestionDraft
      applyDraft(draft)
      setStagedFiles((payload.files as StagedFile[] | undefined) ?? [])
      const nextStagedFiles = (payload.files as StagedFile[] | undefined) ?? []
      const analysis = payload.visual_analysis as VisualAnalysis | undefined
      setVisualAnalysis(analysis ?? null)
      if (product) {
        setNotice(name.trim()
          ? 'Raw references staged. Jarvis will preserve official menu truth when a safe match exists.'
          : 'Raw references staged privately. Generate Studio Truth to capture a safe visual presentation without inferring identity.')
        if (name.trim()) await searchMenuMatch(draft.id, menuRecordId)
      } else if (isVenueTruth) {
        setNotice(analysis?.status === 'completed'
          ? 'Venue visual truth is ready for review. Nothing has been added to Assets.'
          : analysis?.warning ?? 'Venue image staged. Review the editable truth fields before adding it to Assets.')
      } else if (staff) {
        setNotice('Staff image is staged privately and can be saved with no additional metadata.')
        await finalize(draft.id, nextStagedFiles)
      } else {
        setNotice('Venue Item staged privately. Review before adding it to Assets.')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to stage the Asset.')
    } finally {
      setBusy(false)
    }
  }

  async function searchMenuMatch(id = draftId, selectedMenuId = menuRecordId) {
    if (!id || !name.trim()) return
    const payload = await api(clientId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'menu_match', draft_id: id, name, menu_record_id: selectedMenuId || undefined }),
    })
    const result = payload.result as { status?: string; candidates?: Candidate[] }
    const next = result.candidates ?? []
    setCandidates(next)
    if (result.status === 'exact_match' && next.length === 1) {
      await chooseMenuItem(next[0], id, next[0].menu_record_id)
    } else if (!next.length) {
      setNotice('No official menu match was found. Studio generation can continue without canonical product metadata.')
    }
  }

  async function chooseMenuItem(candidate: Candidate, targetDraftId = draftId, selectedMenuId = candidate.menu_record_id) {
    if (!targetDraftId || !selectedMenuId) return
    setBusy(true)
    setError('')
    try {
      const payload = await api(clientId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'menu_select',
          draft_id: targetDraftId,
          menu_record_id: selectedMenuId,
          menu_item_id: candidate.id,
          match_type: candidate.matchType,
        }),
      })
      const draft = payload.draft as IngestionDraft
      applyDraft(draft)
      setMenuRecordId(selectedMenuId)
      setMenuItemId(candidate.id)
      setName(draft.display_name ?? name)
      setNotice(`Official menu match selected: ${candidate.canonical_name}. Generate the Studio Truth reference when ready.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to select the menu item.')
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    if (!draftId || generationBlocker) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = await api(clientId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_studio_truth', draft_id: draftId, correction: generationCorrection }),
      })
      if (payload.blocked) {
        setError(String(payload.error ?? 'Studio generation is blocked.'))
        return
      }
      const result = payload.generated as { signed_url?: string } | undefined
      setGeneratedUrl(result?.signed_url ?? '')
      applyDraft(payload.draft as IngestionDraft | undefined)
      const analysis = payload.visual_analysis as VisualAnalysis | undefined
      setVisualAnalysis(analysis ?? null)
      setNotice(analysis?.status === 'completed'
        ? 'Generated truth reference and Visual Presentation are ready for review. Menu facts remain unchanged.'
        : `Generated truth reference is ready. ${analysis?.warning ?? 'Visual metadata analysis failed.'} You can retry without regenerating the image.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Studio generation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function retryVisualAnalysis() {
    if (!draftId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = await api(clientId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: product ? 'analyse_product' : 'analyse_venue', draft_id: draftId }),
      })
      applyDraft(payload.draft as IngestionDraft | undefined)
      const analysis = payload.analysis as VisualAnalysis | undefined
      setVisualAnalysis(analysis ?? null)
      setNotice(analysis?.status === 'completed'
        ? 'Visual metadata is ready for review.'
        : String(payload.warning ?? 'Visual metadata analysis failed. The staged truth reference remains available.'))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Visual metadata analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  async function finalize(targetDraftId = draftId, targetStagedFiles = stagedFiles) {
    const targetPreviewFile = targetStagedFiles.find(file => file.file_kind === 'generated_preview') ?? targetStagedFiles[0]
    if (!targetDraftId || (product && !generated) || (!product && !targetPreviewFile)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = await api(clientId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          draft_id: targetDraftId,
          title: staff ? name : name || CATEGORIES.find(item => item.id === category)?.label,
          visual_presentation: metadata.visual_presentation ?? '',
          key_visual_details: visualDetails,
          perspective_flexibility: metadata.perspective_flexibility ?? 'low',
          alcohol_status: metadata.alcohol_status ?? '',
          staff_name: name,
          staff_position: metadata.staff_position ?? '',
          staff_department: metadata.staff_department ?? '',
          staff_active: metadata.staff_active ?? null,
          identity_notes: metadata.identity_notes ?? '',
          approved_for_generation: canApprove ? approvedForGeneration : null,
        }),
      })
      const cleanup = payload.cleanup as { cleaned?: boolean; error?: string } | undefined
      setNotice(cleanup?.cleaned
        ? 'Asset added. Temporary source files were cleaned up.'
        : `Asset added. Temporary cleanup is pending: ${cleanup?.error ?? 'retry will preserve the files safely.'}`)
      window.setTimeout(() => {
        void Promise.resolve(onFinalized()).catch(() => setError('Asset was added, but the Asset Library could not refresh. Reload the page to view it.'))
      }, 650)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Finalization failed. Temporary files remain available for retry.')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (busy) return
    if (!draftId) {
      onClose()
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = await api(clientId, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId }),
      })
      if (payload.cancelled) onClose()
      else setError(String((payload.cleanup as { error?: string } | undefined)?.error ?? 'Temporary cleanup is pending. The staged files were preserved for a safe retry.'))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to cancel safely.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/85 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Add Asset">
      <div className="mx-auto min-h-full max-w-5xl rounded-lg border border-white/10 bg-[#07100d] shadow-2xl">
        <header className="flex items-start justify-between gap-5 border-b border-white/[0.08] p-5 sm:p-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/55">Client Brain Assets</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Add Asset</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">New truth enters staging first. It is added to the Asset Library only after review and finalization.</p>
          </div>
          <button type="button" onClick={() => void cancel()} disabled={busy} className="min-h-11 rounded-md border border-white/12 px-4 text-sm font-semibold text-white/62 hover:text-white disabled:opacity-50">Close</button>
        </header>

        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">1. Asset Type</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CATEGORIES.map(item => (
                  <button key={item.id} type="button" onClick={() => resetForCategory(item.id)} disabled={Boolean(draftId) || busy} className={`rounded-md border p-3 text-left transition ${category === item.id ? 'border-emerald-300/45 bg-emerald-300/[0.09]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'} disabled:opacity-55`}>
                    <strong className="text-sm text-white">{item.label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-white/42">{item.detail}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">2. {product ? 'Raw Reference Images' : staff ? 'Staff Identity References' : 'Original Truth Image'}</p>
              <div className="mt-3 rounded-md border border-dashed border-white/16 bg-black/15 p-4">
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={product || staff} disabled={Boolean(draftId) || busy} onChange={event => chooseFiles(event.target.files)} className="sr-only" />
                <button type="button" disabled={Boolean(draftId) || busy} onClick={() => inputRef.current?.click()} className="min-h-11 rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/[0.08] disabled:opacity-50">Choose image{product || staff ? 's' : ''}</button>
                <p className="mt-2 text-xs text-white/38">{product ? 'Use one or two raw references of the same product. They never enter the permanent Asset grid.' : staff ? 'Use one or more staff images. Name, profile grouping, employment details, and generation approval can all be added later.' : 'The original image is reviewed as the canonical venue reference.'}</p>
                {files.length > 0 && <ul className="mt-3 space-y-1 text-xs text-white/65">
                  {files.map((file, index) => <li key={`${file.name}:${file.size}`} className="flex items-center justify-between gap-3 rounded border border-white/[0.08] px-2 py-1.5"><span className="truncate">{file.name}</span><button type="button" onClick={() => removeLocalFile(index)} className="text-xs text-red-200 hover:text-red-100">Remove</button></li>)}
                </ul>}
              </div>
            </section>

            {product && <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">3. Canonical Menu Truth</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs text-white/48">Product name</span><input value={name} disabled={Boolean(draftId)} onChange={event => setName(event.target.value)} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none" placeholder="Optional exact menu item name" /></label>
                <label><span className="mb-1.5 block text-xs text-white/48">Menu</span><select value={menuRecordId} disabled={Boolean(draftId)} onChange={event => setMenuRecordId(event.target.value)} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"><option value="">Search all active menus</option>{menus.map(menu => <option key={menu.id} value={menu.id}>{menu.title}</option>)}</select></label>
              </div>
              {draftId && candidates.length > 0 && <div className="mt-3 rounded-md border border-white/[0.08] p-3"><p className="text-xs font-semibold text-white/70">{menuItemId ? 'Official menu item selected' : 'Select the official menu item'}</p><div className="mt-2 grid gap-2">{candidates.map(candidate => <button key={candidate.id} type="button" onClick={() => void chooseMenuItem(candidate)} disabled={busy || menuItemId === candidate.id} className={`flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-left text-sm ${menuItemId === candidate.id ? 'border-emerald-300/45 bg-emerald-300/[0.07] text-white' : 'border-white/10 text-white/65 hover:border-emerald-300/25'}`}><span>{candidate.canonical_name}<small className="ml-2 text-white/36">{candidate.menu_section ?? 'Menu item'}</small>{menuItemId === candidate.id && <small className="ml-2 text-emerald-100/75">Selected official menu item</small>}</span><span className="text-xs text-white/45">{candidate.price != null ? `${candidate.currency ?? 'AED'} ${candidate.price}` : 'See menu terms'}</span></button>)}</div></div>}
            </section>}

            {staff && <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">3. Staff Identity</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs text-white/48">Name</span><input value={name} disabled={Boolean(draftId)} onChange={event => setName(event.target.value)} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none" placeholder="Staff member name" /></label>
                <label><span className="mb-1.5 block text-xs text-white/48">Job Title / Position</span><input value={String(metadata.staff_position ?? '')} disabled={Boolean(draftId)} onChange={event => setMetadata(current => ({ ...current, staff_position: event.target.value }))} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none" placeholder="Optional" /></label>
                <label><span className="mb-1.5 block text-xs text-white/48">Department</span><input value={String(metadata.staff_department ?? '')} disabled={Boolean(draftId)} onChange={event => setMetadata(current => ({ ...current, staff_department: event.target.value }))} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none" placeholder="Optional" /></label>
                <label><span className="mb-1.5 block text-xs text-white/48">Active Staff Member</span><select value={metadata.staff_active === true ? 'active' : metadata.staff_active === false ? 'inactive' : ''} disabled={Boolean(draftId)} onChange={event => setMetadata(current => ({ ...current, staff_active: event.target.value === 'active' ? true : event.target.value === 'inactive' ? false : null }))} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"><option value="">Not set</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              </div>
            </section>}

            {!draftId && <button type="button" onClick={() => void stage()} disabled={!files.length || busy} className="min-h-11 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Saving…' : staff ? 'Save Staff Asset' : 'Stage for Review'}</button>}

            {draftId && product && <section className="rounded-md border border-emerald-300/16 bg-emerald-300/[0.035] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">4. Studio Truth Reference</p>
              <p className="mt-2 text-xs leading-5 text-white/44">Studio Truth uses staged raw references. If official menu truth is selected, it acts only as a guardrail. Visual Presentation is then generated from the final Studio Truth image.</p>
              {generated && <label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/48">Optional correction for regeneration</span><input value={generationCorrection} onChange={event => setGenerationCorrection(event.target.value)} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none" placeholder="Example: preserve the original glass exactly" /></label>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(generationBlocker)} onClick={() => void generate()} className="min-h-11 rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/[0.08] disabled:opacity-45">{busy ? 'Generating…' : generated ? 'Regenerate Studio Truth' : 'Generate Studio Truth'}</button>
                {generated && visualAnalysis?.status === 'failed' && <button type="button" disabled={busy} onClick={() => void retryVisualAnalysis()} className="min-h-11 rounded-md border border-amber-200/20 px-4 text-sm font-semibold text-amber-50 hover:bg-amber-100/[0.06] disabled:opacity-45">Retry Analysis</button>}
              </div>
              {visualAnalysis?.status === 'failed' && <p className="mt-2 text-xs text-amber-100/70">Visual metadata analysis failed. The generated truth reference is preserved and can still be saved as Not Approved.</p>}
              {generationBlocker && <p className="mt-2 text-xs text-amber-100/70">{generationBlocker}</p>}
            </section>}

            {draftId && isVenueTruth && <section className="rounded-md border border-emerald-300/16 bg-emerald-300/[0.035] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">3. Venue Visual Truth</p>
              <p className="mt-2 text-xs leading-5 text-white/44">Visible venue facts are analyzed automatically after staging and remain editable in review.</p>
              {visualAnalysis?.status === 'failed' && <><p className="mt-2 text-xs text-amber-100/70">Visual metadata analysis failed. The staged venue image remains available for review.</p><button type="button" disabled={busy} onClick={() => void retryVisualAnalysis()} className="mt-3 min-h-11 rounded-md border border-amber-200/20 px-4 text-sm font-semibold text-amber-50 hover:bg-amber-100/[0.06] disabled:opacity-45">Retry Analysis</button></>}
            </section>}

            {reviewReady && <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">{product ? '5' : '4'}. Review Metadata</p>
              {product && <div className="mt-3 rounded-md border border-white/[0.08] bg-black/15 p-3 text-xs leading-5 text-white/58"><strong className="text-white/78">{selectedCandidate?.canonical_name ?? (name || 'Unidentified product')}</strong><br />{menuItemId ? 'Menu truth is retained from the selected canonical item.' : 'No canonical product identity is set. Visual Presentation stays product-only and this Asset remains Not Approved for Generation.'}</div>}
              {product && generated && <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">Generated Truth Reference</p>}
              {staff ? <label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/48">Internal Notes</span><textarea value={String(metadata.identity_notes ?? '')} onChange={event => setMetadata(current => ({ ...current, identity_notes: event.target.value }))} className="min-h-24 w-full rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white outline-none" placeholder="Optional identity or usage notes." /></label> : <label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/48">Visual Presentation</span><textarea value={String(metadata.visual_presentation ?? '')} onChange={event => setMetadata(current => ({ ...current, visual_presentation: event.target.value }))} className="min-h-24 w-full rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white outline-none" placeholder="Concise visual truth only." /></label>}
              {category === 'drinks' && <label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/48">Alcohol Status</span><select value={String(metadata.alcohol_status ?? 'unknown')} onChange={event => setMetadata(current => ({ ...current, alcohol_status: event.target.value }))} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"><option value="unknown">Unknown</option><option value="non_alcoholic">Non-alcoholic</option><option value="alcoholic">Alcoholic</option></select></label>}
              {isVenueTruth && <><label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/48">Key Visual Details</span><textarea value={visualDetails.join('\n')} onChange={event => setMetadata(current => ({ ...current, key_visual_details: event.target.value.split('\n').map(item => item.trim()).filter(Boolean) }))} className="min-h-24 w-full rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white outline-none" placeholder="One visible physical detail per line" /></label><label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/48">Perspective Flexibility</span><select value={String(metadata.perspective_flexibility ?? 'low')} onChange={event => setMetadata(current => ({ ...current, perspective_flexibility: event.target.value }))} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"><option value="low">Low — crop, zoom, minimal angle shift only</option><option value="medium">Medium — small established-geometry variations</option><option value="high">High — only use with multi-reference spatial evidence</option></select></label></>}
              <label className="mt-4 block"><span className="mb-1.5 block text-xs text-white/48">Approved for Generation{product && !canApprove ? ' - select an official menu item first' : ''}</span><select value={approvedForGeneration === true ? 'approved' : approvedForGeneration === false ? 'not_approved' : ''} disabled={!canApprove} onChange={event => setApprovedForGeneration(event.target.value === 'approved' ? true : event.target.value === 'not_approved' ? false : null)} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none disabled:opacity-45"><option value="">Not set</option><option value="approved">Approved</option><option value="not_approved">Not approved</option></select></label>
            </section>}
          </div>

          <aside className="lg:sticky lg:top-5 lg:self-start">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
              <div className="aspect-square bg-black/40">{previewUrl ? <img src={previewUrl} alt="Asset review preview" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-6 text-white/35">A staged or generated Asset preview will appear here.</div>}</div>
              {generated && <div className="grid grid-cols-2 gap-px border-t border-white/[0.08] bg-white/[0.08]">{stagedFiles.filter(file => file.file_kind === 'raw_reference').map(file => <div key={file.id} className="bg-black/35 p-2"><img src={file.signed_url} alt={`Temporary raw reference: ${file.file_name}`} className="aspect-square w-full object-cover" /><p className="mt-1 truncate text-[10px] text-white/42">Raw reference</p></div>)}<div className="bg-black/35 p-2"><img src={previewUrl} alt="Generated studio truth reference" className="aspect-square w-full object-contain" /><p className="mt-1 truncate text-[10px] text-emerald-100/65">Generated truth</p></div></div>}
              {staff && stagedFiles.length > 0 && <div className="grid grid-cols-3 gap-px border-t border-white/[0.08] bg-white/[0.08]">{stagedFiles.map(file => <div key={file.id} className="bg-black/35 p-2"><img src={file.signed_url} alt={`Temporary staff reference: ${file.file_name}`} className="aspect-square w-full object-cover" /><p className="mt-1 truncate text-[10px] text-white/42">Identity reference</p></div>)}</div>}
              <div className="border-t border-white/[0.08] p-4"><p className="text-xs font-semibold text-white/72">Review state</p><p className="mt-1 text-xs leading-5 text-white/42">Finalization creates one normal Client Brain Asset. Generation approval stays off until you explicitly select it in review.</p>{stagedFiles.length > 0 && <ul className="mt-3 space-y-1 text-[11px] text-white/50">{stagedFiles.map(file => <li key={file.id}>{fileLabel(file)}</li>)}</ul>}</div>
            </div>
            {reviewReady && <button type="button" disabled={busy} onClick={() => void finalize()} className="mt-4 min-h-11 w-full rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black hover:bg-emerald-200 disabled:opacity-45">{busy ? 'Finalizing…' : 'Review & Add to Assets'}</button>}
            <button type="button" disabled={busy} onClick={() => void cancel()} className="mt-2 min-h-11 w-full rounded-md border border-white/12 px-5 text-sm font-semibold text-white/60 hover:text-white disabled:opacity-45">Cancel</button>
          </aside>
        </div>
        {(error || notice) && <div className={`mx-5 mb-5 rounded-md border px-4 py-3 text-sm sm:mx-7 sm:mb-7 ${error ? 'border-red-300/20 bg-red-300/[0.06] text-red-100' : 'border-emerald-300/18 bg-emerald-300/[0.05] text-emerald-50'}`}>{error || notice}</div>}
      </div>
    </div>,
    document.body,
  )
}
