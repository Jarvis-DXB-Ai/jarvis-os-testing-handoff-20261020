'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CLIENT_BRAIN_V2_GRAPHIC_TYPES,
  type ClientBrainV2BrandGuidelineEditWorkspace,
  type ClientBrainV2BrandGuidelineOption,
  type ClientBrainV2BrandGuidelineOptions,
  type ClientBrainV2BrandGuidelineSubsection,
  type ClientBrainV2BrandGuidelineWorkspace,
} from '@/lib/client-brain-v2-brand-guidelines'
import type { ClientBrainV2EditField } from '@/lib/client-brain-v2-edit'

type AssetItem = { assetId: string; role: string; name: string; notes: string; type?: string }
type ColourItem = { name: string; hex: string; notes: string }
type BrainResponse = { success: boolean; error?: string }

const inputClass = 'min-h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-emerald-300/45'
const textareaClass = `${inputClass} min-h-24 py-2.5 leading-6`
const checkerboard = {
  backgroundColor: '#121712',
  backgroundImage: 'linear-gradient(45deg,#ffffff0c 25%,transparent 25%),linear-gradient(-45deg,#ffffff0c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ffffff0c 75%),linear-gradient(-45deg,transparent 75%,#ffffff0c 75%)',
  backgroundSize: '18px 18px',
  backgroundPosition: '0 0,0 9px,9px -9px,-9px 0px',
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function friendlyFileName(value: string) { return value.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() }
function normalizedHex(value: string) {
  const stripped = value.trim().replace(/^#?/, '').toUpperCase()
  return /^[0-9A-F]{6}$/.test(stripped) ? `#${stripped}` : value.trim()
}
function validHex(value: string) { return /^#[0-9A-F]{6}$/.test(value) }
function readableColour(hex: string) {
  if (!validHex(hex)) return '#ffffff'
  const values = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
  return values[0] * 0.299 + values[1] * 0.587 + values[2] * 0.114 > 170 ? '#111111' : '#ffffff'
}
function fileFor(option?: ClientBrainV2BrandGuidelineOption) { return option?.files.find(file => file.approval_status === 'approved') ?? option?.files[0] }
function itemField(workspace: ClientBrainV2BrandGuidelineEditWorkspace, id: string) { return workspace.fields.find(field => field.id === id) }

function Notes({ value, onChange, label = 'Additional Notes' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <details className="mt-3 border-t border-white/[0.07] pt-3">
    <summary className="cursor-pointer select-none text-xs font-medium text-white/42 hover:text-white/65">{label}</summary>
    <textarea value={value} onChange={event => onChange(event.target.value)} className={`${textareaClass} mt-3 text-xs`} placeholder="Optional usage guidance…" />
  </details>
}

function AssetPreview({ option, label, variant = 'adaptive' }: { option?: ClientBrainV2BrandGuidelineOption; label: string; variant?: 'light_wordmark' | 'dark_wordmark' | 'adaptive' }) {
  const file = fileFor(option)
  if (!file?.signed_url) return <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-white/12 px-5 text-center text-xs text-white/30">No {label.toLowerCase()} uploaded.</div>
  const isFont = /font|woff|ttf|otf/i.test(file.file_type ?? '') || /\.(woff2?|ttf|otf)$/i.test(file.file_name)
  if (isFont) return <div className="flex min-h-36 items-center justify-center rounded-md border border-white/10 bg-black/20 px-5 text-center text-xs text-white/42">{file.file_name}</div>
  const style = variant === 'light_wordmark'
    ? { backgroundColor: '#111513' }
    : variant === 'dark_wordmark'
      ? { backgroundColor: '#f5f2eb' }
      : checkerboard
  return <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-md border border-white/10 p-5" style={style}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={file.signed_url} alt={option?.title ?? label} className="max-h-40 max-w-full object-contain" />
  </div>
}

function UploadButton({ onFile, accept, label, disabled }: { onFile: (file: File) => void; accept: string; label: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return <>
    <input ref={input} type="file" accept={accept} className="sr-only" onChange={event => {
      const file = event.target.files?.[0]
      if (file) onFile(file)
      event.currentTarget.value = ''
    }} />
    <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/68 transition hover:border-emerald-300/40 hover:text-emerald-100 disabled:opacity-50">{label}</button>
  </>
}

function FontPreview({ option, clientName, role }: { option?: ClientBrainV2BrandGuidelineOption; clientName: string; role: string }) {
  const file = fileFor(option)
  const family = useMemo(() => `brand-kit-${option?.id ?? role}`, [option?.id, role])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    let font: FontFace | null = null
    if (!file?.signed_url) return
    void (async () => {
      try {
        font = new FontFace(family, `url(${file.signed_url})`)
        await font.load()
        document.fonts.add(font)
        if (active) setLoaded(true)
      } catch {
        if (active) setLoaded(false)
      }
    })()
    return () => { active = false; if (font) document.fonts.delete(font) }
  }, [family, file?.signed_url])
  return <div className="rounded-md border border-white/10 bg-black/20 p-5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{role}</p>
    <p className="mt-4 break-words text-3xl leading-tight text-white" style={loaded ? { fontFamily: family } : undefined}>{clientName}</p>
    <p className="mt-3 text-sm leading-6 text-white/62" style={loaded ? { fontFamily: family } : undefined}>{role === 'Primary Font' ? 'Authentic hospitality, clearly expressed.' : 'A welcoming place for good food, good company and everyday moments.'}</p>
    {file ? <p className="mt-4 text-[10px] text-white/32">{loaded ? file.file_name : 'Preview unavailable in this browser; file remains canonical.'}</p> : <p className="mt-4 text-[10px] text-white/30">No font uploaded.</p>}
  </div>
}

export default function BrandGuidelinesWorkspace({
  clientId,
  clientName,
  subsection,
  workspace,
  options,
  onRefreshed,
  onDirtyChange,
}: {
  clientId: string
  clientName: string
  subsection: ClientBrainV2BrandGuidelineSubsection
  workspace: ClientBrainV2BrandGuidelineWorkspace
  options: ClientBrainV2BrandGuidelineOptions
  onRefreshed: (payload: unknown) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState<ClientBrainV2BrandGuidelineEditWorkspace>(() => clone(workspace.edit))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [stagedAssetIds, setStagedAssetIds] = useState<string[]>([])
  const [stagedOptions, setStagedOptions] = useState<ClientBrainV2BrandGuidelineOption[]>([])
  const stagedAssetIdsRef = useRef<string[]>([])
  const signature = `${workspace.record?.id ?? 'new'}:${workspace.record?.updated_at ?? 'new'}:${subsection}`
  const lastSignature = useRef(signature)
  const baseline = workspace.edit
  const dirty = JSON.stringify(draft.fields) !== JSON.stringify(baseline.fields)

  useEffect(() => {
    if (signature !== lastSignature.current) {
      lastSignature.current = signature
      setDraft(clone(workspace.edit))
      setStagedAssetIds([])
      setStagedOptions([])
      setError('')
    }
  }, [signature, workspace.edit])
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => { stagedAssetIdsRef.current = stagedAssetIds }, [stagedAssetIds])
  useEffect(() => () => {
    for (const assetId of stagedAssetIdsRef.current) {
      void fetch(`/api/clients/${clientId}/brain-v2/brand-files?asset_id=${encodeURIComponent(assetId)}`, { method: 'DELETE', keepalive: true })
    }
  }, [clientId])

  const field = (id: string) => itemField(draft, id)
  const updateField = (next: ClientBrainV2EditField) => setDraft(current => ({ ...current, fields: current.fields.map(item => item.id === next.id ? next : item) }))
  const assetsFor = (id: string) => (field(id)?.items ?? []) as AssetItem[]
  const colours = () => (field('colours')?.items ?? []) as ColourItem[]
  const setAssets = (id: string, items: AssetItem[]) => { const current = field(id); if (current) updateField({ ...current, items }) }
  const setColours = (items: ColourItem[]) => { const current = field('colours'); if (current) updateField({ ...current, items }) }
  const setSectionNotes = (value: string) => { const current = field('section_notes'); if (current) updateField({ ...current, value }) }
  const availableAssets = useMemo(() => [
    ...options.assets,
    ...stagedOptions.filter(staged => !options.assets.some(asset => asset.id === staged.id)),
  ], [options.assets, stagedOptions])
  const option = (assetId: string) => availableAssets.find(item => item.id === assetId)

  async function loadAvailableAsset(assetId: string) {
    const response = await fetch(`/api/clients/${clientId}/brain-v2?section=brand_guidelines`)
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to refresh the Brand Kit.')
    const asset = (payload.brandGuidelineOptions?.assets ?? []).find((candidate: ClientBrainV2BrandGuidelineOption) => candidate.id === assetId)
    if (asset) setStagedOptions(current => [...current.filter(candidate => candidate.id !== assetId), asset])
  }

  async function upload(role: string, brandFileType: string, file: File, id: 'logos' | 'fonts' | 'graphics', graphicType?: string) {
    setUploading(role)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', friendlyFileName(file.name) || role.replace(/_/g, ' '))
      form.append('brand_file_type', brandFileType)
      const response = await fetch(`/api/clients/${clientId}/brain-v2/brand-files`, { method: 'POST', body: form })
      const payload = await response.json() as BrainResponse & { asset_id?: string }
      if (!response.ok || !payload.success || !payload.asset_id) throw new Error(payload.error || 'Unable to upload this Brand File.')
      const replacedAssetId = assetsFor(id).find(item => item.role === role)?.assetId
      setAssets(id, [...assetsFor(id).filter(item => item.role !== role), { assetId: payload.asset_id, role, name: friendlyFileName(file.name), notes: '', ...(graphicType ? { type: graphicType } : {}) }])
      setStagedAssetIds(current => [...current, payload.asset_id!])
      await loadAvailableAsset(payload.asset_id)
      if (replacedAssetId && stagedAssetIdsRef.current.includes(replacedAssetId)) {
        await fetch(`/api/clients/${clientId}/brain-v2/brand-files?asset_id=${encodeURIComponent(replacedAssetId)}`, { method: 'DELETE' })
        setStagedAssetIds(current => current.filter(value => value !== replacedAssetId))
        setStagedOptions(current => current.filter(item => item.id !== replacedAssetId))
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload this Brand File.')
    } finally {
      setUploading(null)
    }
  }

  async function removeAsset(id: 'logos' | 'fonts' | 'graphics', assetId: string) {
    setAssets(id, assetsFor(id).filter(item => item.assetId !== assetId))
    if (!stagedAssetIds.includes(assetId)) return
    try {
      await fetch(`/api/clients/${clientId}/brain-v2/brand-files?asset_id=${encodeURIComponent(assetId)}`, { method: 'DELETE' })
      setStagedAssetIds(current => current.filter(value => value !== assetId))
      setStagedOptions(current => current.filter(item => item.id !== assetId))
    } catch { /* A linked file remains safe; it can be reused from the Asset Library. */ }
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save Brand Kit changes.')
      setStagedAssetIds([])
      stagedAssetIdsRef.current = []
      onRefreshed(payload)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Brand Kit changes.')
    } finally {
      setSaving(false)
    }
  }

  const sectionNotes = String(field('section_notes')?.value ?? '')
  const saveButton = <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="min-h-11 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Saving…' : 'Save Changes'}</button>
  const sectionNotesUi = <Notes label="Section Notes" value={sectionNotes} onChange={setSectionNotes} />

  let content: React.ReactNode
  if (subsection === 'caption_intelligence') {
    content = <div className="grid gap-4 xl:grid-cols-2">{draft.fields.map(item => <section key={item.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{item.label}</p><textarea value={String(item.value ?? '')} onChange={event => updateField({ ...item, value: event.target.value })} className={`${textareaClass} mt-3 text-sm`} placeholder={`Add ${item.label.toLowerCase()}…`} /></section>)}</div>
  } else if (subsection === 'logos') {
    const items = assetsFor('logos')
    const legacyWordmark = items.find(value => value.role === 'wordmark')
    const logoSlots = [
      { role: 'light_wordmark', label: 'Light Wordmark', type: 'light_wordmark', helper: 'For dark or coloured backgrounds.', preview: 'light_wordmark' as const },
      { role: 'dark_wordmark', label: 'Dark Wordmark', type: 'dark_wordmark', helper: 'For light backgrounds.', preview: 'dark_wordmark' as const },
      { role: 'brand_mark', label: 'Brand Mark / Icon', type: 'brand_mark', helper: 'Standalone symbol where the full wordmark is too wide.', preview: 'adaptive' as const },
    ]
    content = <div className="space-y-5"><section><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Wordmark</p><div className="mt-3 grid gap-4 xl:grid-cols-2">{logoSlots.slice(0, 2).map(({ role, label, type, helper, preview }) => {
      const item = items.find(value => value.role === role)
      const selected = item ? option(item.assetId) : undefined
      return <section key={role} className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{label}</p><p className="mt-2 text-xs text-white/34">{helper} Transparent PNG recommended.</p></div>{item && <button type="button" onClick={() => void removeAsset('logos', item.assetId)} className="text-xs font-medium text-red-200/75 hover:text-red-100">Remove</button>}</div>
        <div className="mt-5"><AssetPreview option={selected} label={label} variant={preview} /></div>
        {item && <input value={item.name} onChange={event => setAssets('logos', items.map(value => value.assetId === item.assetId ? { ...value, name: event.target.value } : value))} className={`${inputClass} mt-4`} placeholder={`${label} name`} />}
        <div className="mt-4 flex items-center gap-3"><UploadButton disabled={uploading !== null} accept="image/png,image/jpeg,image/webp" label={item ? 'Replace' : `Upload ${label}`} onFile={file => void upload(role, type, file, 'logos')} /></div>
        {item && <Notes value={item.notes} onChange={notes => setAssets('logos', items.map(value => value.assetId === item.assetId ? { ...value, notes } : value))} />}
      </section>
    })}</div>{legacyWordmark && <section className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/65">Existing Wordmark</p><p className="mt-2 text-xs leading-5 text-white/45">This preserved legacy file needs an explicit background variant before future design retrieval can prefer it.</p><div className="mt-4 max-w-xl"><AssetPreview option={option(legacyWordmark.assetId)} label="existing wordmark" /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setAssets('logos', items.map(value => value.assetId === legacyWordmark.assetId ? { ...value, role: 'light_wordmark' } : value))} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/68 hover:border-emerald-300/40 hover:text-emerald-100">Assign as Light Wordmark</button><button type="button" onClick={() => setAssets('logos', items.map(value => value.assetId === legacyWordmark.assetId ? { ...value, role: 'dark_wordmark' } : value))} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/68 hover:border-emerald-300/40 hover:text-emerald-100">Assign as Dark Wordmark</button></div></section>}</section><section><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Brand Mark / Icon</p><div className="mt-3 max-w-xl">{logoSlots.slice(2).map(({ role, label, type, helper, preview }) => { const item = items.find(value => value.role === role); const selected = item ? option(item.assetId) : undefined; return <section key={role} className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{label}</p><p className="mt-2 text-xs text-white/34">{helper} Transparent PNG recommended.</p></div>{item && <button type="button" onClick={() => void removeAsset('logos', item.assetId)} className="text-xs font-medium text-red-200/75 hover:text-red-100">Remove</button>}</div><div className="mt-5"><AssetPreview option={selected} label={label} variant={preview} /></div>{item && <input value={item.name} onChange={event => setAssets('logos', items.map(value => value.assetId === item.assetId ? { ...value, name: event.target.value } : value))} className={`${inputClass} mt-4`} placeholder={`${label} name`} />}<div className="mt-4 flex items-center gap-3"><UploadButton disabled={uploading !== null} accept="image/png,image/jpeg,image/webp" label={item ? 'Replace' : `Upload ${label}`} onFile={file => void upload(role, type, file, 'logos')} /></div>{item && <Notes value={item.notes} onChange={notes => setAssets('logos', items.map(value => value.assetId === item.assetId ? { ...value, notes } : value))} />}</section> })}</div></section></div>
  } else if (subsection === 'colours') {
    const values = colours()
    content = <section className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Brand palette</p><p className="mt-2 text-xs text-white/34">Exact HEX values are available to future graphic workflows.</p></div><button type="button" onClick={() => setColours([...values, { name: '', hex: '', notes: '' }])} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/68 hover:border-emerald-300/40 hover:text-emerald-100">Add Colour</button></div>{values.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{values.map((colour, index) => {
      const hex = normalizedHex(colour.hex)
      const patch = (next: Partial<ColourItem>) => setColours(values.map((value, current) => current === index ? { ...value, ...next } : value))
      return <article key={index} className="rounded-md border border-white/[0.08] bg-black/15 p-4"><div className="flex aspect-[3/2] items-end rounded-md border border-black/20 p-3" style={{ backgroundColor: validHex(hex) ? hex : '#151a17', color: readableColour(hex) }}><span className="font-mono text-xs font-semibold">{validHex(hex) ? hex : 'HEX'}</span></div><div className="mt-4 flex gap-2"><input value={colour.name} onChange={event => patch({ name: event.target.value })} className={inputClass} placeholder="Colour name (optional)" /><button type="button" onClick={() => setColours(values.filter((_, current) => current !== index))} className="min-h-10 rounded-md px-2 text-sm text-red-200/80 hover:bg-red-300/[0.08]" aria-label="Remove colour">×</button></div><input value={colour.hex} onBlur={() => patch({ hex })} onChange={event => patch({ hex: event.target.value })} className={`${inputClass} mt-2 font-mono uppercase ${colour.hex && !validHex(hex) ? 'border-red-300/50' : ''}`} placeholder="#RRGGBB" />{colour.hex && !validHex(hex) && <p className="mt-2 text-xs text-red-200">Use a six-digit value, for example #8B1E2D.</p>}<Notes value={colour.notes} onChange={notes => patch({ notes })} /></article>
    })}</div> : <div className="py-14 text-center text-sm text-white/35">No colours added.<button type="button" onClick={() => setColours([{ name: '', hex: '', notes: '' }])} className="ml-2 text-emerald-100 hover:text-emerald-50">Add Colour</button></div>}</section>
  } else if (subsection === 'typography') {
    const items = assetsFor('fonts')
    content = <div className="grid gap-4 xl:grid-cols-2">{([
      ['primary', 'Primary Font', 'primary_font'], ['body', 'Body Font', 'body_font'],
    ] as const).map(([role, label, type]) => {
      const item = items.find(value => value.role === role)
      const selected = item ? option(item.assetId) : undefined
      const file = fileFor(selected)
      return <section key={role} className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{label}</p><p className="mt-2 text-xs text-white/34">OTF, TTF, WOFF, or WOFF2.</p></div>{item && <button type="button" onClick={() => void removeAsset('fonts', item.assetId)} className="text-xs font-medium text-red-200/75 hover:text-red-100">Remove</button>}</div><div className="mt-5"><FontPreview option={selected} clientName={clientName} role={label} /></div>{item && <input value={item.name} onChange={event => setAssets('fonts', items.map(value => value.assetId === item.assetId ? { ...value, name: event.target.value } : value))} className={`${inputClass} mt-4`} placeholder="Font name" />}{file && <p className="mt-2 text-xs text-white/35">{file.file_name} · {file.file_type ?? 'Unknown type'}</p>}<div className="mt-4"><UploadButton disabled={uploading !== null} accept=".otf,.ttf,.woff,.woff2,font/*" label={item ? 'Replace' : `Upload ${label}`} onFile={file => void upload(role, type, file, 'fonts')} /></div>{item && <Notes value={item.notes} onChange={notes => setAssets('fonts', items.map(value => value.assetId === item.assetId ? { ...value, notes } : value))} />}</section>
    })}</div>
  } else {
    const items = assetsFor('graphics')
    content = <section className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Reusable elements</p><p className="mt-2 text-xs text-white/34">Optional. Empty is a valid state.</p></div><button type="button" onClick={() => setAssets('graphics', [...items, { assetId: '', role: `graphic-${Date.now()}`, name: '', notes: '', type: 'graphic_element' }])} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/68 hover:border-emerald-300/40 hover:text-emerald-100">Add Element</button></div>{items.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => {
      const selected = item.assetId ? option(item.assetId) : undefined
      const patch = (next: Partial<AssetItem>) => setAssets('graphics', items.map((value, current) => current === index ? { ...value, ...next } : value))
      return <article key={item.assetId || item.role} className="rounded-md border border-white/[0.08] bg-black/15 p-4"><AssetPreview option={selected} label="element" /><div className="mt-4 flex gap-2"><input value={item.name} onChange={event => patch({ name: event.target.value })} className={inputClass} placeholder="Element name" /><button type="button" onClick={() => item.assetId ? void removeAsset('graphics', item.assetId) : setAssets('graphics', items.filter((_, current) => current !== index))} className="min-h-10 rounded-md px-2 text-sm text-red-200/80 hover:bg-red-300/[0.08]" aria-label="Remove element">×</button></div><select value={item.type ?? 'graphic_element'} onChange={event => patch({ type: event.target.value })} className={`${inputClass} mt-2`}>{CLIENT_BRAIN_V2_GRAPHIC_TYPES.map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</select><div className="mt-3"><UploadButton disabled={uploading !== null} accept="image/png,image/jpeg,image/webp" label={item.assetId ? 'Replace' : 'Upload File'} onFile={file => void upload(item.role, item.type ?? 'graphic_element', file, 'graphics', item.type ?? 'graphic_element')} /></div><Notes value={item.notes} onChange={notes => patch({ notes })} /></article>
    })}</div> : <div className="py-14 text-center text-sm text-white/35">No graphics or icons added.<button type="button" onClick={() => setAssets('graphics', [{ assetId: '', role: `graphic-${Date.now()}`, name: '', notes: '', type: 'graphic_element' }])} className="ml-2 text-emerald-100 hover:text-emerald-50">Add Element</button></div>}</section>
  }

  return <div className="space-y-5"><div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/45">{workspace.subsection.replace(/_/g, ' ')}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-white/42">{subsection === 'caption_intelligence' ? 'Human-readable, client-scoped rules. Publishing compiles the core and only the post-type rules that apply.' : subsection === 'logos' ? 'Current saved slots are canonical logo truth for future branded output.' : subsection === 'colours' ? 'Store the exact palette, not an approximation from photography.' : subsection === 'typography' ? 'Actual font files remain private client assets and are loaded only for this preview.' : 'Store only visual elements that are genuinely reusable.'}</p></div>{saveButton}</div>{error && <p role="alert" className="rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}{content}{subsection === 'caption_intelligence' ? null : sectionNotesUi}<div className="flex justify-end border-t border-white/[0.08] pt-5">{saveButton}</div></div>
}
