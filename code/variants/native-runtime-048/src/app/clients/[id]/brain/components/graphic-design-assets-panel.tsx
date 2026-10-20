'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AssetMetadata } from '@/lib/metadata-schemas'

export const GRAPHIC_DESIGN_CATEGORIES = [
  { id: 'design_brand_assets', label: 'Brand Assets', description: 'Logos, marks, palettes, typography references, favicon assets, and foundational brand files.' },
  { id: 'design_menus', label: 'Menus', description: 'Designed menu PDFs, menu artwork, and menu layout files. Structured menu data stays in Offers & Revenue.' },
  { id: 'design_flyers_activations', label: 'Flyers & Activations', description: 'Campaign flyers, event graphics, activation artwork, and seasonal promotional design assets.' },
] as const

export const GRAPHIC_DESIGN_CATEGORY_IDS = new Set<string>(GRAPHIC_DESIGN_CATEGORIES.map(category => category.id))

type AssetUpload = {
  id: string
  client_id?: string
  file_name: string
  asset_category: string
  file_path?: string
  file_type?: string
  file_size?: number
  uploaded_at: string
  proposals_count: number
  extraction_status: string
  status?: string
  metadata?: AssetMetadata
}

type GraphicDesignDraft = {
  assetName: string
  category: string
  usageNotes: string
  tags: string
  approved: boolean
}

type MetadataRecord = Record<string, unknown>

function metadataRecord(asset: AssetUpload): MetadataRecord {
  return asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata as MetadataRecord
    : {}
}

function stringMeta(asset: AssetUpload, keys: string[]) {
  const metadata = metadataRecord(asset)
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return ''
}

function arrayMeta(asset: AssetUpload, keys: string[]) {
  const metadata = metadataRecord(asset)
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean)
    if (typeof value === 'string' && value.trim()) return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  return []
}

function booleanMeta(asset: AssetUpload, keys: string[]) {
  const metadata = metadataRecord(asset)
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return ['true', 'yes', 'approved'].includes(value.toLowerCase())
  }
  return false
}

function assetTitle(asset: AssetUpload) {
  return stringMeta(asset, ['asset_name', 'title', 'name'])
    || asset.file_name.replace(/---[a-f0-9-]{36}/i, '').replace(/^\d+_\d+_/, '').replace(/\.[^.]+$/, '')
}

function formatSize(bytes?: number) {
  if (!bytes) return '—'
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function categoryLabel(value: string) {
  return GRAPHIC_DESIGN_CATEGORIES.find(category => category.id === value)?.label || value
}

export function isGraphicDesignAsset(asset: { asset_category?: string | null }) {
  return GRAPHIC_DESIGN_CATEGORY_IDS.has(asset.asset_category || '')
}

function draftFromAsset(asset: AssetUpload): GraphicDesignDraft {
  return {
    assetName: stringMeta(asset, ['asset_name', 'title', 'name']) || assetTitle(asset),
    category: GRAPHIC_DESIGN_CATEGORY_IDS.has(asset.asset_category) ? asset.asset_category : 'design_brand_assets',
    usageNotes: stringMeta(asset, ['usage_notes', 'notes', 'description']),
    tags: arrayMeta(asset, ['tags']).join(', '),
    approved: booleanMeta(asset, ['approved', 'approved_for_design', 'approved_for_generation']),
  }
}

function draftToMetadata(draft: GraphicDesignDraft, existing: MetadataRecord) {
  const tags = draft.tags.split(',').map(tag => tag.trim()).filter(Boolean)
  return {
    ...existing,
    asset_name: draft.assetName.trim(),
    title: draft.assetName.trim(),
    usage_notes: draft.usageNotes.trim(),
    notes: draft.usageNotes.trim(),
    tags,
    approved: draft.approved,
    approved_for_design: draft.approved,
    source_type: 'client_uploaded_asset',
    normalized_role: 'graphic',
  } as MetadataRecord
}

export function GraphicDesignAssetsPanel({
  clientId,
  clientName,
  uploads,
  activeCategory,
  onUploaded,
  onUpdate,
  onRemove,
  onToast,
}: {
  clientId: string
  clientName: string
  uploads: AssetUpload[]
  activeCategory: string
  onUploaded: () => void
  onUpdate: (updated: AssetUpload) => void
  onRemove: (id: string) => void
  onToast: (msg: string, ok: boolean) => void
}) {
  const [openUpload, setOpenUpload] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState(activeCategory || 'design_brand_assets')
  const [uploading, setUploading] = useState(false)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<AssetUpload | null>(null)
  const [draft, setDraft] = useState<GraphicDesignDraft>(() => ({
    assetName: '',
    category: 'design_brand_assets',
    usageNotes: '',
    tags: '',
    approved: false,
  }))
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (GRAPHIC_DESIGN_CATEGORY_IDS.has(activeCategory)) setUploadCategory(activeCategory)
  }, [activeCategory])

  const designUploads = uploads.filter(isGraphicDesignAsset)
  const filtered = designUploads.filter(asset => asset.asset_category === activeCategory)

  useEffect(() => {
    const missing = designUploads.filter(asset => asset.file_path && !signedUrls[asset.id])
    if (missing.length === 0) return
    ;(async () => {
      const response = await fetch('/api/brain/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: missing.map(asset => ({ id: asset.id, path: asset.file_path! })) }),
      })
      if (!response.ok) return
      const { urls } = await response.json() as { urls: Record<string, string> }
      setSignedUrls(prev => ({ ...prev, ...urls }))
    })()
  }, [uploads, activeCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectAsset(asset: AssetUpload) {
    setSelected(asset)
    setDraft(draftFromAsset(asset))
  }

  async function uploadFiles() {
    if (files.length === 0) return
    setUploading(true)
    let uploadedCount = 0
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        form.append('client_id', clientId)
        form.append('client_name', clientName)
        form.append('asset_category', uploadCategory)
        form.append('skip_analysis', 'true')
        const response = await fetch('/api/brain/upload', { method: 'POST', body: form })
        const payload = await response.json() as { error?: string }
        if (!response.ok) throw new Error(payload.error || `Could not upload ${file.name}`)
        uploadedCount += 1
      }
      onToast(`${uploadedCount} design asset${uploadedCount === 1 ? '' : 's'} uploaded.`, true)
      setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      onUploaded()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Design upload failed.', false)
    } finally {
      setUploading(false)
    }
  }

  async function saveSelected() {
    if (!selected) return
    setSaving(true)
    const metadata = draftToMetadata(draft, metadataRecord(selected)) as unknown as AssetMetadata
    const { data, error } = await supabase.from('asset_uploads')
      .update({
        file_name: draft.assetName.trim() || selected.file_name,
        asset_category: draft.category,
        metadata,
      })
      .eq('id', selected.id)
      .select()
      .single()
    if (error || !data) {
      onToast(error?.message || 'Could not save design metadata.', false)
    } else {
      const updated = data as unknown as AssetUpload
      onUpdate(updated)
      setSelected(updated)
      setDraft(draftFromAsset(updated))
      onToast('Design metadata saved.', true)
    }
    setSaving(false)
  }

  async function archiveSelected() {
    if (!selected) return
    if (!confirm(`Delete "${assetTitle(selected)}"? It will be archived, not permanently deleted.`)) return
    const { error } = await supabase.from('asset_uploads').update({ status: 'archived' }).eq('id', selected.id)
    if (error) {
      onToast(error.message, false)
      return
    }
    onRemove(selected.id)
    setSelected(null)
    onToast('Design asset archived.', true)
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <button
            type="button"
            onClick={() => setOpenUpload(prev => !prev)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-white">Upload design assets</p>
              <p className="mt-1 text-xs text-white/42">Upload brand files, menus, flyers, or activation graphics. No AI analysis runs on upload.</p>
            </div>
            <span className={`text-xs text-white/45 transition ${openUpload ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {openUpload && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault()
                  setFiles(Array.from(event.dataTransfer.files))
                }}
                className="cursor-pointer rounded-xl border border-dashed border-white/15 bg-white/[0.035] px-5 py-7 text-center transition hover:border-emerald-300/30"
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.svg,.ai,.eps"
                  className="hidden"
                  onChange={event => setFiles(Array.from(event.target.files ?? []))}
                />
                <p className="text-sm font-semibold text-white">{files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Click or drag files here'}</p>
                <p className="mt-1 text-xs text-white/38">Images, PDFs, SVGs, and design exports</p>
              </div>
              {files.length > 0 && (
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {files.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
                      <span className="truncate text-xs text-white/70">{file.name}</span>
                      <button type="button" onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))} className="text-[11px] font-semibold text-white/35 hover:text-white/70">Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <select value={uploadCategory} onChange={event => setUploadCategory(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none">
                  {GRAPHIC_DESIGN_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
                <button type="button" onClick={uploadFiles} disabled={files.length === 0 || uploading} className="jarvis-button px-5 py-2 text-xs disabled:opacity-40">
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{GRAPHIC_DESIGN_CATEGORIES.find(category => category.id === activeCategory)?.label}</p>
              <p className="mt-1 text-xs text-white/42">{GRAPHIC_DESIGN_CATEGORIES.find(category => category.id === activeCategory)?.description}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs font-semibold text-white/45">{filtered.length} asset{filtered.length === 1 ? '' : 's'}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 py-10 text-center">
              <p className="text-sm font-medium text-white/48">No design assets in this section yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {filtered.map(asset => {
                const url = signedUrls[asset.id]
                const isImage = asset.file_type?.startsWith('image/')
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => selectAsset(asset)}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-black/22 text-left transition hover:border-emerald-300/30"
                  >
                    <div className="aspect-[4/3] bg-white/[0.035]">
                      {isImage && url ? (
                        <img src={url} alt={assetTitle(asset)} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center">
                          <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs font-semibold text-white/45">{asset.file_type?.includes('pdf') ? 'PDF' : 'File'}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-white">{assetTitle(asset)}</p>
                      <p className="mt-1 truncate text-[11px] text-white/38">{asset.file_name}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] font-semibold text-white/40">{formatSize(asset.file_size)}</span>
                        {booleanMeta(asset, ['approved', 'approved_for_design']) && <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">Approved</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={() => setSelected(null)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#f8fafc] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Graphic Design Asset</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-gray-950">{draft.assetName || assetTitle(selected)}</h3>
                <p className="mt-1 text-xs text-gray-500">{categoryLabel(draft.category)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={saveSelected} disabled={saving} className="h-9 rounded-lg border border-gray-900 bg-gray-900 px-4 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-45">{saving ? 'Saving...' : 'Save'}</button>
                <button type="button" onClick={archiveSelected} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50">Delete</button>
                <button type="button" onClick={() => setSelected(null)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">Close</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-3">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    {selected.file_type?.startsWith('image/') && signedUrls[selected.id] ? (
                      <img src={signedUrls[selected.id]} alt={assetTitle(selected)} className="max-h-[46vh] w-full rounded-xl bg-white object-contain" />
                    ) : signedUrls[selected.id] ? (
                      <a href={signedUrls[selected.id]} target="_blank" rel="noopener noreferrer" className="flex h-56 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600">Open file</a>
                    ) : (
                      <div className="flex h-56 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-400">Loading file...</div>
                    )}
                  </div>
                  <div className="grid gap-2 text-xs">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"><span className="font-semibold text-gray-400">File name</span><p className="mt-1 break-all text-gray-700">{selected.file_name}</p></div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"><span className="font-semibold text-gray-400">File type</span><p className="mt-1 text-gray-700">{selected.file_type || 'Unknown'}</p></div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"><span className="font-semibold text-gray-400">File size</span><p className="mt-1 text-gray-700">{formatSize(selected.file_size)}</p></div>
                  </div>
                </aside>
                <main className="grid gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Asset Name</span>
                    <input value={draft.assetName} onChange={event => setDraft(prev => ({ ...prev, assetName: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Category</span>
                    <select value={draft.category} onChange={event => setDraft(prev => ({ ...prev, category: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400">
                      {GRAPHIC_DESIGN_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Usage Notes</span>
                    <textarea value={draft.usageNotes} onChange={event => setDraft(prev => ({ ...prev, usageNotes: event.target.value }))} rows={4} placeholder="Where this should be used, restrictions, or design notes" className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Tags</span>
                    <input value={draft.tags} onChange={event => setDraft(prev => ({ ...prev, tags: event.target.value }))} placeholder="logo, menu, eid, flyer" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <input type="checkbox" checked={draft.approved} onChange={event => setDraft(prev => ({ ...prev, approved: event.target.checked }))} />
                    Approved
                  </label>
                </main>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
