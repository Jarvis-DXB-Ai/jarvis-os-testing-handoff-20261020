'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import AssetIngestionModal from './client-brain-v2-asset-ingestion'
import {
  ASSET_EDITOR_FIELDS,
  advancedAssetEditorFields,
  coreAssetEditorFields,
  DEFAULT_RESTAURANT_ASSET_CURRENCY,
  EDITABLE_RESTAURANT_ASSET_CATEGORIES,
  hasMeaningfulRestaurantAssetMetadata,
  normalizeAssetReviewState,
  assetEditorFields,
  type ClientBrainV2AssetEditOptions,
  type ClientBrainV2AssetEnrichmentApply,
  type EditableRestaurantAssetCategory,
} from '@/lib/client-brain-v2-asset-edit'
import type { ManualRestaurantAssetCategory } from '@/lib/client-brain-v2-asset-edit'
import {
  humanizeClientBrainV2Value,
  humanConfirmedRestaurantAssetCategory,
  restaurantAssetCategory,
  type ClientBrainV2AssetListRecord,
  type ClientBrainV2Record,
  type ClientBrainV2RestaurantAssetCategory,
} from '@/lib/client-brain-v2'
import {
  formatRestaurantPrice,
  packagePricingContextForAsset,
  type RestaurantPricingContext,
} from '@/lib/client-brain-v2-pricing'

type AssetDraft = {
  category: EditableRestaurantAssetCategory
  fields: Record<string, unknown>
  menuRecordIds: string[]
  activationRecordIds: string[]
  sourceRecordIds: string[]
  clearLegacyMenu: boolean
  clearLegacySource: boolean
  clearCanonicalMenuMatch: boolean
  pendingCanonicalMenuItemName?: string
  enrichment?: ClientBrainV2AssetEnrichmentApply
}

// Retained for the legacy endpoint and historical records. The normal Asset
// Library no longer renders the one-time classification workflow.
type AssetClassificationResponse = {
  success: boolean
  error?: string
  mutation?: {
    asset_id: string
    category: ManualRestaurantAssetCategory
    updated_at: string
  }
}

export type RestaurantAssetSaveResponse = {
  success: boolean
  error?: string
  records?: ClientBrainV2Record[]
  assetEditOptions?: ClientBrainV2AssetEditOptions | null
  counts?: {
    total: number
    sections: Record<string, number>
    subsections: Record<string, number>
    statuses: Record<string, number>
  }
  [key: string]: unknown
}

export type RestaurantAssetDeleteResponse = {
  success: boolean
  error?: string
  mutation?: {
    assetId: string
    deletedLinkCount: number
    deletedAssignmentCount: number
    deletedVersionCount: number
    deletedFileObjectCount: number
    preservedFileObjectCount: number
  }
  storageCleanupPending?: boolean
  storageCleanupWarning?: string
}

type AssetDetailResponse = {
  success: boolean
  error?: string
  record?: ClientBrainV2Record
  assetEditOptions?: ClientBrainV2AssetEditOptions
}

type AssetEnrichmentResponse = {
  success: boolean
  error?: string
  status?: 'proposal_ready' | 'selection_required' | 'no_match'
  matchStatus?: 'exact_match' | 'strong_match' | 'multiple_matches' | 'no_match'
  candidates?: Array<{
    id: string
    canonical_name: string
    menu_section: string | null
    price: number | null
    currency: string | null
    source_document_version: string
    source_page: number | null
    matchType: string
    score: number
  }>
  proposal?: {
    menuItemId: string
    canonicalName: string
    menuRecordId: string
    activationRecordId: string | null
    sourceRecordId: string
    sourceFileObjectId: string | null
    sourceDocumentVersion: string
    sourcePage: number | null
    matchType: string
    pricing: RestaurantPricingContext
    menuFields: Record<string, unknown>
    visualTruth?: Record<string, unknown>
    visualFields: Record<string, unknown>
    visualWarning?: string
  }
  warning?: string
}

const ASSET_GRID_BATCH_SIZE = 48

async function fetchAssetDetail(clientId: string, assetId: string) {
  const response = await fetch(`/api/clients/${clientId}/brain-v2/assets/${assetId}`, { cache: 'no-store' })
  const payload = await response.json() as AssetDetailResponse
  if (!response.ok || !payload.success || !payload.record || !payload.assetEditOptions) {
    throw new Error(payload.error || 'Unable to load Asset details.')
  }
  return payload
}

async function deleteAsset(clientId: string, assetId: string, expectedUpdatedAt: string) {
  const response = await fetch(`/api/clients/${clientId}/brain-v2/assets/${assetId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUpdatedAt }),
  })
  const payload = await response.json() as RestaurantAssetDeleteResponse
  if (!response.ok || !payload.success || !payload.mutation) throw new Error(payload.error || 'Unable to delete Asset.')
  return payload
}

function DeleteAssetConfirmation({ title, deleting, error, onCancel, onConfirm }: { title: string; deleting: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-asset-title">
      <div className="w-full max-w-md rounded-lg border border-red-300/25 bg-[#10110f] p-6 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-200/55">Delete Asset</p>
        <h2 id="delete-asset-title" className="mt-2 text-xl font-semibold text-white">Delete {title}?</h2>
        <p className="mt-3 text-sm leading-6 text-white/58">This permanently removes this Asset from the Client Brain, including its metadata, relationships, assignments, and version history. Shared files and source evidence remain protected.</p>
        {error && <p role="alert" className="mt-4 rounded-md border border-red-300/20 bg-red-300/[0.06] px-3 py-2 text-sm text-red-100">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={deleting} onClick={onCancel} className="min-h-11 rounded-md border border-white/12 px-4 text-sm font-semibold text-white/65 disabled:opacity-45">Cancel</button>
          <button type="button" disabled={deleting} onClick={onConfirm} className="min-h-11 rounded-md bg-red-400 px-4 text-sm font-semibold text-black hover:bg-red-300 disabled:opacity-45">{deleting ? 'Deleting…' : 'Delete Asset'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const CLASSIFICATION_OPTIONS = [
  { id: 'food', label: 'Food', shortcut: '1' },
  { id: 'drinks', label: 'Drinks', shortcut: '2' },
  { id: 'interiors', label: 'Interiors', shortcut: '3' },
  { id: 'exteriors', label: 'Exteriors', shortcut: '4' },
  { id: 'venue_items', label: 'Venue Items', shortcut: '5' },
  { id: 'staff', label: 'Staff', shortcut: '6' },
] as const

function tombstones(record: ClientBrainV2Record) {
  const value = record.metadata.asset_metadata_tombstones
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
}

function mergedMetadata(record: ClientBrainV2Record) {
  const merged = { ...(record.legacy_asset?.metadata ?? {}), ...record.metadata }
  for (const key of tombstones(record)) delete merged[key]
  return merged
}

function firstValue(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || null
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${humanizeClientBrainV2Value(key)}: ${String(item)}`).join(' · ')
  return String(value)
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim())
  if (typeof value === 'string' && value.trim()) return value.split(/[\n,]/).map(item => item.trim()).filter(Boolean)
  return []
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function valuesMatch(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(stringList(left)) === JSON.stringify(stringList(right))
  return String(left ?? '').trim() === String(right ?? '').trim()
}

function cleanAssetDisplayName(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/^\s*ai\s+truth\s+ref\s*-\s*/i, '')
    .trim()
}

function isTechnicalAssetName(value: string) {
  const name = cleanAssetDisplayName(value)
  return !name
    || /\.(?:avif|gif|heic|jpe?g|mov|mp4|png|webp)$/i.test(name)
    || /^(?:dsc|img|image|photo|pxl|wps)[\s_.-]*\d+/i.test(name)
}

function cardFilename(record: ClientBrainV2AssetListRecord) {
  return cleanAssetDisplayName(record.files?.[0]?.file_name ?? record.title) || 'Asset'
}

function cardProductTitle(record: ClientBrainV2AssetListRecord, category: ClientBrainV2RestaurantAssetCategory) {
  if (category === 'staff') return record.metadata.staff_name?.trim() || 'Staff'
  const canonicalName = category === 'food' ? record.metadata.dish_name : record.metadata.drink_name
  if (canonicalName?.trim() && !isTechnicalAssetName(canonicalName)) return canonicalName.trim()
  const title = cleanAssetDisplayName(record.title)
  return !isTechnicalAssetName(title) ? title : cardFilename(record)
}

function cleanMenuDisplayName(value: string) {
  return value.replace(/\s+menu$/i, '').trim()
}

function cardSecondaryLine(record: ClientBrainV2AssetListRecord, category: ClientBrainV2RestaurantAssetCategory) {
  if (category === 'staff') return [record.metadata.staff_position, record.metadata.staff_department].filter(Boolean).join(' · ') || 'Staff identity reference'
  const menu = record.metadata.menu_display_name ? cleanMenuDisplayName(record.metadata.menu_display_name) : ''
  const section = (category === 'food' ? record.metadata.menu_category : record.metadata.drink_category)?.trim() ?? ''
  if (menu && section) return `${menu} · ${section}`
  if (menu) return menu
  if (section) return section
  return category === 'food' ? 'Food' : 'Drinks'
}

function cardPrice(record: ClientBrainV2AssetListRecord) {
  const price = record.metadata.price?.trim() ?? ''
  if (!price) return null
  return formatRestaurantPrice(price, record.metadata.currency)
}

function cardPackageContext(record: ClientBrainV2AssetListRecord) {
  const price = record.metadata.package_price?.trim() ?? ''
  if (!price) return null
  return `Included in ${formatRestaurantPrice(price, record.metadata.package_currency)} menu`
}

function OfficialPricingTruth({ pricing }: { pricing: RestaurantPricingContext }) {
  if (pricing.ownership === 'item' && pricing.itemPrice != null) {
    return <div><p className="text-[10px] uppercase text-white/28">Item Price</p><p className="mt-0.5 text-xs leading-5 text-white/65">{formatRestaurantPrice(pricing.itemPrice, pricing.currency)}</p></div>
  }
  return <>
    <div><p className="text-[10px] uppercase text-white/28">Item Price</p><p className="mt-0.5 text-xs leading-5 text-white/65">Not individually priced</p></div>
    {pricing.package && <><div><p className="text-[10px] uppercase text-white/28">Included In</p><p className="mt-0.5 text-xs leading-5 text-white/65">{pricing.package.ownerName} · {formatRestaurantPrice(pricing.package.price, pricing.package.currency)}</p></div>{pricing.package.inclusions.length > 0 && <div><p className="text-[10px] uppercase text-white/28">Package Context</p><p className="mt-0.5 text-xs leading-5 text-white/65">{pricing.package.inclusions.join(' + ')}</p></div>}</>}
  </>
}

function cardSearchText(record: ClientBrainV2AssetListRecord, category: ClientBrainV2RestaurantAssetCategory) {
  return [
    cardProductTitle(record, category),
    cardFilename(record),
    record.metadata.menu_display_name,
    record.metadata.menu_category,
    record.metadata.drink_category,
    record.metadata.staff_name,
    record.metadata.staff_position,
    record.metadata.staff_department,
  ].filter(Boolean).join(' ').toLocaleLowerCase('en')
}

function relationshipIds(record: ClientBrainV2Record, relationType: string, predicate: (relationship: NonNullable<ClientBrainV2Record['relationships']>[number]) => boolean) {
  return (record.relationships ?? [])
    .filter(relationship => relationship.direction === 'outgoing' && relationship.relation_type === relationType && predicate(relationship))
    .map(relationship => relationship.record.id)
}

function fieldValue(record: ClientBrainV2Record, category: ClientBrainV2RestaurantAssetCategory, fieldId: string) {
  const metadata = mergedMetadata(record)
  const config = assetEditorFields(category).find(field => field.id === fieldId)
  if (!config) return ''
  if (fieldId === 'status') return record.status
  if (fieldId === 'asset_role') return record.files?.[0]?.semantic_role ?? firstValue(metadata, config.aliases) ?? 'raw_asset'
  if (fieldId === 'approved_for_generation') {
    const stored = firstValue(metadata, config.aliases)
    return typeof stored === 'boolean'
      ? stored
      : record.files?.[0]?.semantic_role === 'truth_reference' && record.files?.[0]?.approval_status === 'approved'
        ? true
        : null
  }
  if (fieldId === 'last_verified') {
    const stored = firstValue(metadata, config.aliases) ?? record.last_verified_at
    return typeof stored === 'string' ? stored.slice(0, 10) : ''
  }
  if (fieldId === 'review_state') return firstValue(metadata, config.aliases) ?? record.files?.[0]?.approval_status ?? record.status
  const stored = firstValue(metadata, config.aliases)
  if (fieldId === 'alcohol_status' && typeof stored === 'boolean') return stored ? 'alcoholic' : 'non_alcoholic'
  if (config.kind === 'list') return stringList(stored)
  if (config.kind === 'number') return stored == null ? '' : String(stored)
  return stored == null ? '' : String(stored)
}

function buildDraft(record: ClientBrainV2Record, categoryOverride?: EditableRestaurantAssetCategory): AssetDraft {
  const inferred = restaurantAssetCategory(record)
  const category = categoryOverride ?? (EDITABLE_RESTAURANT_ASSET_CATEGORIES.includes(inferred as EditableRestaurantAssetCategory)
    ? inferred as EditableRestaurantAssetCategory
    : 'interiors')
  const draft: AssetDraft = {
    category,
    fields: Object.fromEntries(ASSET_EDITOR_FIELDS[category].map(field => [field.id, fieldValue(record, category, field.id)])),
    menuRecordIds: relationshipIds(record, 'belongs_to_menu', relationship => relationship.record.subsection === 'menus'),
    activationRecordIds: relationshipIds(record, 'supports_activation', relationship => relationship.record.subsection === 'activations'),
    sourceRecordIds: relationshipIds(record, 'derived_from', relationship => relationship.record.top_section === 'sources'),
    clearLegacyMenu: false,
    clearLegacySource: false,
    clearCanonicalMenuMatch: false,
  }
  return normalizeDraftApproval(draft)
}

function normalizeDraftApproval(draft: AssetDraft) {
  if (draft.fields.approved_for_generation !== true
    || hasMeaningfulRestaurantAssetMetadata(draft.category, draft.fields, draft.menuRecordIds)) {
    return draft
  }
  return {
    ...draft,
    fields: { ...draft.fields, approved_for_generation: false },
  }
}

function ListEditor({ label, values, onChange, tags = false }: { label: string; values: string[]; onChange: (values: string[]) => void; tags?: boolean }) {
  const [nextValue, setNextValue] = useState('')
  const add = () => {
    const normalized = nextValue.trim().replace(/\s+/g, ' ')
    if (!normalized || values.some(value => value.toLocaleLowerCase('en') === normalized.toLocaleLowerCase('en'))) return
    onChange([...values, normalized])
    setNextValue('')
  }
  return (
    <div className="space-y-2">
      <div className={tags ? 'flex flex-wrap gap-2' : 'space-y-1.5'}>
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className={tags ? 'inline-flex min-h-9 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 text-xs text-white/65' : 'flex min-h-10 items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-black/20 px-3 text-sm text-white/65'}>
            <span>{value}</span>
            <button type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-red-200/70 hover:bg-red-300/10 hover:text-red-100" aria-label={`Remove ${value}`}>×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={nextValue} onChange={event => setNextValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} placeholder={`Add ${label.toLowerCase()}…`} className="min-h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white/70 outline-none focus:border-emerald-300/35" />
        <button type="button" onClick={add} disabled={!nextValue.trim()} className="min-h-11 rounded-md border border-emerald-300/20 px-3 text-sm font-semibold text-emerald-100 disabled:opacity-35">Add</button>
      </div>
    </div>
  )
}

function MultiSelect({ label, options, selected, onChange }: { label: string; options: ClientBrainV2AssetEditOptions[keyof ClientBrainV2AssetEditOptions]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const selectedOptions = options.filter(option => selected.includes(option.id))
  return (
    <fieldset>
      <legend className="text-[10px] font-semibold uppercase text-white/28">{label}</legend>
      <div className="mt-1.5 rounded-md border border-white/10 bg-black/20 p-2">
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">
          {selectedOptions.map(option => <span key={option.id} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 text-xs text-emerald-50"><span>{option.title}</span><button type="button" onClick={() => onChange(selected.filter(id => id !== option.id))} aria-label={`Remove ${option.title}`} className="ml-0.5 text-base leading-none text-emerald-100/70 hover:text-white">×</button></span>)}
          {!selectedOptions.length && <span className="px-1 text-sm text-white/28">No {label.toLowerCase()} linked</span>}
          <button type="button" onClick={() => setOpen(current => !current)} className="ml-auto min-h-8 rounded border border-white/10 px-2 text-xs font-semibold text-white/55 hover:border-emerald-300/25 hover:text-white">{open ? 'Done' : '+ Select'}</button>
        </div>
        {open && <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto border-t border-white/[0.08] pt-2">
          {options.length ? options.map(option => (
            <label key={option.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-2 text-sm text-white/62 hover:bg-white/[0.04]">
              <input type="checkbox" checked={selected.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} className="h-4 w-4 accent-emerald-300" />
              <span className="min-w-0 flex-1 truncate">{option.title}</span>
              <span className="text-[10px] text-white/25">{humanizeClientBrainV2Value(option.status)}</span>
            </label>
          )) : <p className="px-2 py-3 text-xs text-white/28">No available records.</p>}
        </div>}
      </div>
    </fieldset>
  )
}

function FieldEditor({ label, kind, value, options, onChange, onBlur }: { label: string; kind: string; value: unknown; options?: readonly string[]; onChange: (value: unknown) => void; onBlur?: () => void }) {
  if (kind === 'boolean') {
    const decided = typeof value === 'boolean'
    const checked = value === true
    const staffActive = label === 'Active Staff Member'
    return (
      <div className="grid min-h-11 grid-cols-3 overflow-hidden rounded-md border border-white/10 bg-black/20 text-xs font-semibold">
        <button type="button" onClick={() => onChange(null)} className={`px-2 ${!decided ? 'bg-white/[0.08] text-white' : 'text-white/38 hover:text-white/65'}`}>Not set</button>
        <button type="button" onClick={() => onChange(true)} className={`border-x border-white/[0.08] px-2 ${checked ? 'bg-emerald-300/15 text-emerald-100' : 'text-white/38 hover:text-white/65'}`}>{staffActive ? 'Active' : 'Approved'}</button>
        <button type="button" onClick={() => onChange(false)} className={`px-2 ${decided && !checked ? 'bg-red-300/[0.10] text-red-100' : 'text-white/38 hover:text-white/65'}`}>{staffActive ? 'Inactive' : 'Not approved'}</button>
      </div>
    )
  }
  if (kind === 'list') return <ListEditor label={label} values={Array.isArray(value) ? value as string[] : []} onChange={onChange} tags={label === 'Tags' || label === 'Dietary Information'} />
  if (kind === 'select') return (
    <select value={String(value ?? '')} onChange={event => onChange(event.target.value)} onBlur={onBlur} className="min-h-11 w-full rounded-md border border-white/10 bg-[#0b1511] px-3 text-sm text-white/70 outline-none focus:border-emerald-300/35">
      {options?.map(option => <option key={option || 'empty'} value={option}>{option ? humanizeClientBrainV2Value(option) : 'Not defined'}</option>)}
    </select>
  )
  if (kind === 'textarea') return <textarea value={String(value ?? '')} onChange={event => onChange(event.target.value)} onBlur={onBlur} rows={3} className="min-h-24 w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white/70 outline-none focus:border-emerald-300/35" />
  return <input type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'} step={kind === 'number' ? '0.01' : undefined} min={kind === 'number' ? '0' : undefined} value={String(value ?? '')} onChange={event => onChange(event.target.value)} onBlur={onBlur} className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white/70 outline-none focus:border-emerald-300/35" />
}

function MetadataField({ field, stored, editing, value, onChange, onBlur }: { field: ReturnType<typeof assetEditorFields>[number]; stored: unknown; editing: boolean; value: unknown; onChange: (value: unknown) => void; onBlur?: () => void }) {
  const formatted = displayValue(stored)
  const notDecided = (field.id === 'approved_for_generation' || field.id === 'staff_active') && stored == null
  return <div className={field.wide ? 'sm:col-span-2' : ''}>
    <p className="mb-1.5 text-[10px] font-semibold uppercase text-white/28">{field.label}</p>
    <div className="min-h-11 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white/65">
      {editing ? <FieldEditor label={field.label} kind={field.kind} value={value} options={field.options} onChange={onChange} onBlur={onBlur} /> : <span className={formatted ? 'text-white/65' : 'text-white/25'}>{notDecided ? 'Not set' : formatted ?? 'Not defined'}</span>}
    </div>
  </div>
}

// The legacy classifier remains intentionally non-rendered while historical
// classification records and the scoped endpoint remain available.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AssetClassificationMode({
  clientId,
  records,
  onClose,
  onClassified,
  onDeleted,
}: {
  clientId: string
  records: ClientBrainV2AssetListRecord[]
  onClose: () => void
  onClassified: (assetId: string, category: ManualRestaurantAssetCategory, updatedAt: string) => void
  onDeleted: (assetId: string, payload: RestaurantAssetDeleteResponse) => void
}) {
  const firstUnclassified = records.find(record => humanConfirmedRestaurantAssetCategory(record) === 'unclassified') ?? records[0]
  const [currentId, setCurrentId] = useState(firstUnclassified?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [previewRecord, setPreviewRecord] = useState<ClientBrainV2Record | null>(null)
  const currentIndex = Math.max(0, records.findIndex(record => record.id === currentId))
  const current = records[currentIndex]
  const categoryCounts = useMemo(() => Object.fromEntries(
    ['food', 'drinks', 'interiors', 'exteriors', 'venue_items', 'unclassified'].map(category => [
      category,
      records.filter(record => humanConfirmedRestaurantAssetCategory(record) === category).length,
    ]),
  ) as Record<ClientBrainV2RestaurantAssetCategory, number>, [records])
  const classifiedCount = records.length - categoryCounts.unclassified
  const confirmedCategory = current ? humanConfirmedRestaurantAssetCategory(current) : 'unclassified'
  const legacySuggestion = current ? restaurantAssetCategory(current) : 'unclassified'
  const file = previewRecord?.files?.[0]

  const selectCurrentAsset = useCallback((assetId: string) => {
    setPreviewRecord(null)
    setSaveError('')
    setCurrentId(assetId)
  }, [])

  useEffect(() => {
    if (!currentId) return
    const controller = new AbortController()
    void fetchAssetDetail(clientId, currentId)
      .then(payload => {
        if (!controller.signal.aborted) setPreviewRecord(payload.record ?? null)
      })
      .catch(error => {
        if (!controller.signal.aborted) setSaveError(error instanceof Error ? error.message : 'Unable to load Asset preview.')
      })
    return () => controller.abort()
  }, [clientId, currentId])

  const move = useCallback((direction: -1 | 1) => {
    if (!records.length || saving) return
    const nextIndex = (currentIndex + direction + records.length) % records.length
    selectCurrentAsset(records[nextIndex].id)
  }, [currentIndex, records, saving, selectCurrentAsset])

  const classify = useCallback(async (category: ManualRestaurantAssetCategory) => {
    if (!current || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/assets/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'classify', category, expectedUpdatedAt: current.updated_at }),
      })
      const payload = await response.json() as AssetClassificationResponse
      if (!response.ok || !payload.success || !payload.mutation) throw new Error(payload.error || 'Unable to save Asset classification.')
      onClassified(current.id, category, payload.mutation.updated_at)

      const nextUnclassified = [...records.slice(currentIndex + 1), ...records.slice(0, currentIndex)]
        .find(record => record.id !== current.id && humanConfirmedRestaurantAssetCategory(record) === 'unclassified')
      if (nextUnclassified) selectCurrentAsset(nextUnclassified.id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save Asset classification.')
    } finally {
      setSaving(false)
    }
  }, [clientId, current, currentIndex, onClassified, records, saving, selectCurrentAsset])

  const confirmDelete = useCallback(async () => {
    if (!current || saving || deleting) return
    const nextRecord = records[(currentIndex + 1) % records.length]
    setDeleting(true)
    setDeleteError('')
    try {
      const payload = await deleteAsset(clientId, current.id, current.updated_at)
      onDeleted(current.id, payload)
      setDeleteConfirmationOpen(false)
      if (nextRecord && nextRecord.id !== current.id) selectCurrentAsset(nextRecord.id)
      else onClose()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete Asset.')
    } finally {
      setDeleting(false)
    }
  }, [clientId, current, currentIndex, deleting, onClose, onDeleted, records, saving, selectCurrentAsset])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') {
        if (deleteConfirmationOpen) setDeleteConfirmationOpen(false)
        else onClose()
      }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && !saving && !deleting) {
        event.preventDefault()
        setDeleteError('')
        setDeleteConfirmationOpen(true)
      }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
      else {
        const option = CLASSIFICATION_OPTIONS.find(item => item.shortcut === event.key)
        if (option) { event.preventDefault(); void classify(option.id) }
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleKey) }
  }, [classify, deleteConfirmationOpen, deleting, move, onClose, saving])

  if (!current || typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex bg-[#07100c]" role="dialog" aria-modal="true" aria-label="Classify restaurant assets">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-4 md:px-7 md:py-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/48">Manual classification</p>
            <h2 className="mt-1.5 text-xl font-semibold text-white md:text-2xl">Classified {classifiedCount} / {records.length}</h2>
            <p className="mt-1 text-sm text-white/38">Remaining {categoryCounts.unclassified}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 text-2xl text-white/65" aria-label="Close classification mode">×</button>
          <div className="basis-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full bg-emerald-300 transition-all" style={{ width: `${records.length ? (classifiedCount / records.length) * 100 : 0}%` }} /></div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/38">
              {CLASSIFICATION_OPTIONS.map(option => <span key={option.id}>{option.label} <strong className="text-white/62">{categoryCounts[option.id]}</strong></span>)}
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-black/35 p-2 md:p-4">
            {file?.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.signed_url} alt={current.title} className="max-h-full max-w-full object-contain" />
            ) : <p className="text-sm text-white/30">{current && !saveError ? 'Loading preview…' : 'Preview unavailable'}</p>}
          </div>

          <aside className="flex min-h-0 flex-col overflow-y-auto">
            <p className="text-xs text-white/34">Asset {currentIndex + 1} of {records.length}</p>
            <h3 className="mt-2 break-words text-lg font-semibold text-white">{current.title}</h3>
            <p className="mt-2 text-sm text-white/45">Current: <span className="font-semibold text-white/72">{humanizeClientBrainV2Value(confirmedCategory)}</span></p>
            {confirmedCategory === 'unclassified' && legacySuggestion !== 'unclassified' && <p className="mt-1 text-xs text-amber-100/48">Legacy suggestion: {humanizeClientBrainV2Value(legacySuggestion)}</p>}

            {saveError && <p role="alert" className="mt-4 rounded-md border border-red-300/20 bg-red-300/[0.06] px-3 py-2 text-sm text-red-100">{saveError}</p>}

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {CLASSIFICATION_OPTIONS.map(option => (
                <button key={option.id} type="button" disabled={saving} onClick={() => void classify(option.id)} className={`flex min-h-12 items-center justify-between rounded-md border px-4 text-left text-sm font-semibold transition disabled:opacity-45 ${confirmedCategory === option.id ? 'border-emerald-300/45 bg-emerald-300/[0.12] text-emerald-50' : 'border-white/10 bg-white/[0.03] text-white/68 hover:border-emerald-300/25 hover:text-white'}`}>
                  <span>{option.label}</span><kbd className="hidden text-[10px] font-normal text-white/28 lg:inline">{option.shortcut}</kbd>
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={saving || confirmedCategory === 'unclassified'} onClick={() => void classify('unclassified')} className="min-h-11 rounded-md border border-white/10 px-4 text-sm font-semibold text-white/48 disabled:opacity-35">Clear Classification</button>
              <button type="button" disabled={saving || deleting} onClick={() => { setDeleteError(''); setDeleteConfirmationOpen(true) }} className="min-h-11 rounded-md border border-red-300/25 px-4 text-sm font-semibold text-red-100/75 hover:bg-red-300/[0.06] disabled:opacity-35">Delete</button>
            </div>
            <p className="mt-4 hidden text-xs leading-5 text-white/28 lg:block">Keys 1–5 classify. Left and right arrows move. Delete opens confirmation.</p>

            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
              <button type="button" disabled={saving} onClick={() => move(-1)} className="min-h-12 rounded-md border border-white/10 text-sm font-semibold text-white/62">Previous</button>
              <button type="button" disabled={saving} onClick={() => move(1)} className="min-h-12 rounded-md border border-white/10 text-sm font-semibold text-white/62">Next</button>
            </div>
            {saving && <p className="mt-3 text-center text-xs text-emerald-100/60">Saving classification…</p>}
          </aside>
        </div>
      </div>
      {deleteConfirmationOpen && <DeleteAssetConfirmation title={current.title} deleting={deleting} error={deleteError} onCancel={() => { if (!deleting) setDeleteConfirmationOpen(false) }} onConfirm={() => void confirmDelete()} />}
    </div>,
    document.body,
  )
}

function AssetModal({ clientId, record, options, onClose, onSaved, onDeleted }: { clientId: string; record: ClientBrainV2Record; options: ClientBrainV2AssetEditOptions; onClose: () => void; onSaved: (payload: RestaurantAssetSaveResponse) => Promise<void>; onDeleted: (assetId: string, payload: RestaurantAssetDeleteResponse) => void }) {
  const file = record.files?.[0]
  const persistedCategory = humanConfirmedRestaurantAssetCategory(record)
  const legacySuggestion = restaurantAssetCategory(record)
  const schemaCategory = persistedCategory === 'unclassified' ? legacySuggestion : persistedCategory
  const initialDraft = useMemo(() => buildDraft(record), [record])
  const [draft, setDraft] = useState<AssetDraft>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [enrichment, setEnrichment] = useState<AssetEnrichmentResponse | null>(null)
  const [enrichmentError, setEnrichmentError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [approvalGuidance, setApprovalGuidance] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const metadata = mergedMetadata(record)
  const activeCategory = draft.category
  const canonicalNameField = activeCategory === 'food' ? 'dish_name' : activeCategory === 'drinks' ? 'drink_name' : null
  const [menuSearchText, setMenuSearchText] = useState(() => canonicalNameField ? String(initialDraft.fields[canonicalNameField] ?? '').trim() : '')
  const coreFields = coreAssetEditorFields(activeCategory)
  const advancedFields = advancedAssetEditorFields(activeCategory)
  const legacyMenu = displayValue(firstValue(metadata, ['menu', 'menu_source', 'source_menu']))
  const legacySource = displayValue(firstValue(metadata, ['source']))
  const semanticName = String(firstValue(metadata, ['dish_name', 'drink_name', 'item_name', 'name']) ?? record.title)
  const hasMeaningfulDraftMetadata = hasMeaningfulRestaurantAssetMetadata(draft.category, draft.fields, draft.menuRecordIds)
  const approvedState = hasMeaningfulDraftMetadata && draft.fields.approved_for_generation === true
  const proposalMenuTitle = enrichment?.proposal ? options.menus.find(menu => menu.id === enrichment.proposal?.menuRecordId)?.title ?? 'Selected canonical menu' : null
  const storedItemPrice = Number(fieldValue(record, schemaCategory, 'price'))
  const packagePricing = packagePricingContextForAsset({
    itemPrice: Number.isFinite(storedItemPrice) ? storedItemPrice : null,
    relations: (record.relationships ?? []).map(relationship => ({ record: relationship.record })),
  })
  const storedCanonicalMenuItem = (() => {
    if (typeof metadata.canonical_menu_item_name === 'string' && metadata.canonical_menu_item_name.trim()) return metadata.canonical_menu_item_name.trim()
    const enrichment = metadata.asset_enrichment
    if (!enrichment || typeof enrichment !== 'object' || Array.isArray(enrichment)) return ''
    const menuMatch = (enrichment as Record<string, unknown>).menu_match
    return menuMatch && typeof menuMatch === 'object' && !Array.isArray(menuMatch) && typeof (menuMatch as Record<string, unknown>).canonical_name === 'string'
      ? String((menuMatch as Record<string, unknown>).canonical_name).trim()
      : ''
  })()
  const storedCanonicalMenuItemId = (() => {
    if (typeof metadata.canonical_menu_item_id === 'string' && metadata.canonical_menu_item_id.trim()) return metadata.canonical_menu_item_id.trim()
    const enrichment = metadata.asset_enrichment
    if (!enrichment || typeof enrichment !== 'object' || Array.isArray(enrichment)) return ''
    const menuMatch = (enrichment as Record<string, unknown>).menu_match
    return menuMatch && typeof menuMatch === 'object' && !Array.isArray(menuMatch) && typeof (menuMatch as Record<string, unknown>).menu_item_id === 'string'
      ? String((menuMatch as Record<string, unknown>).menu_item_id).trim()
      : ''
  })()

  useEffect(() => {
    if (!dirty) return
    const protect = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty])

  const attemptClose = useCallback(() => {
    if (dirty && !window.confirm('Discard your unsaved Asset metadata changes?')) return
    onClose()
  }, [dirty, onClose])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') attemptClose() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', close) }
  }, [attemptClose])

  function changeCategory(category: EditableRestaurantAssetCategory) {
    const nextFields = Object.fromEntries(ASSET_EDITOR_FIELDS[category].map(field => {
      const carried = draft.fields[field.id]
      return [field.id, carried !== undefined ? carried : fieldValue(record, category, field.id)]
    }))
    setDraft(current => normalizeDraftApproval({
      ...current,
      category,
      fields: nextFields,
      menuRecordIds: ['food', 'drinks'].includes(category) ? current.menuRecordIds : [],
      pendingCanonicalMenuItemName: undefined,
      enrichment: undefined,
    }))
    const nextNameField = category === 'food' ? 'dish_name' : category === 'drinks' ? 'drink_name' : null
    setMenuSearchText(nextNameField ? String(nextFields[nextNameField] ?? '').trim() : '')
  }

  function changeField(fieldId: string, value: unknown) {
    if (fieldId === 'approved_for_generation' && value === true && !hasMeaningfulDraftMetadata) {
      setApprovalGuidance('Add Asset metadata before approving this reference for generation.')
      return
    }
    setDraft(current => {
      const nextFields = { ...current.fields, [fieldId]: value }
      if (fieldId === 'price' && String(value ?? '').trim() && !nextFields.currency) {
        nextFields.currency = DEFAULT_RESTAURANT_ASSET_CURRENCY
      }
      return normalizeDraftApproval({ ...current, fields: nextFields, pendingCanonicalMenuItemName: undefined, enrichment: undefined })
    })
    if (fieldId !== 'approved_for_generation' || value !== true) setApprovalGuidance('')
  }

  async function enrichMetadata(candidateId?: string) {
    if (!['food', 'drinks'].includes(draft.category) || enriching) return
    const name = menuSearchText.trim()
    if (!name) {
      setEnrichmentError(`Enter the ${draft.category === 'food' ? 'dish' : 'drink'} name to search the official menu.`)
      return
    }
    setEnriching(true)
    setEnrichmentError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/assets/${record.id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          menuRecordIds: draft.menuRecordIds,
          activationRecordIds: draft.activationRecordIds,
          candidateId,
          includeVision: false,
        }),
      })
      const payload = await response.json() as AssetEnrichmentResponse
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to enrich this Asset.')
      setEnrichment(payload)
    } catch (error) {
      setEnrichmentError(error instanceof Error ? error.message : 'Unable to enrich this Asset.')
    } finally {
      setEnriching(false)
    }
  }

  function applyEnrichmentProposal() {
    const proposal = enrichment?.proposal
    if (!proposal) return
    const allowed = new Set(assetEditorFields(draft.category).map(field => field.id))
    const nextValues = {
      ...proposal.menuFields,
      ...proposal.visualFields,
    }
    const appliedFieldIds = Object.keys(nextValues).filter(field => allowed.has(field))
    setDraft(current => {
      const fields = { ...current.fields }
      for (const field of appliedFieldIds) {
        const value = nextValues[field]
        fields[field] = field === 'tags'
          ? uniqueStrings([...stringList(fields[field]), ...stringList(value)])
          : value
      }
      return {
        ...current,
        fields,
        // A product Asset has one current canonical menu identity. Its prior
        // menu link is replaced only in this unsaved draft.
        menuRecordIds: [proposal.menuRecordId],
        activationRecordIds: proposal.activationRecordId ? uniqueStrings([...current.activationRecordIds, proposal.activationRecordId]) : current.activationRecordIds,
        sourceRecordIds: uniqueStrings([...current.sourceRecordIds, proposal.sourceRecordId]),
        clearCanonicalMenuMatch: false,
        pendingCanonicalMenuItemName: proposal.canonicalName,
        enrichment: {
          menuItemId: proposal.menuItemId,
          visualTruth: proposal.visualTruth,
          appliedFieldIds,
        },
      }
    })
    setEnrichmentError('')
  }

  function clearCanonicalMenuMatch() {
    if (!storedCanonicalMenuItemId && !draft.enrichment) return
    setDraft(current => ({
      ...current,
      menuRecordIds: [],
      clearCanonicalMenuMatch: true,
      pendingCanonicalMenuItemName: undefined,
      enrichment: undefined,
    }))
    setEnrichment(null)
    setEnrichmentError('')
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/assets/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, expectedUpdatedAt: record.updated_at }),
      })
      const payload = await response.json() as RestaurantAssetSaveResponse
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save Asset metadata.')
      await onSaved(payload)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save Asset metadata.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const payload = await deleteAsset(clientId, record.id, record.updated_at)
      onDeleted(record.id, payload)
      onClose()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete Asset.')
    } finally {
      setDeleting(false)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm md:p-6" role="dialog" aria-modal="true" aria-label={`${record.title} asset details`} onMouseDown={event => { if (event.currentTarget === event.target) attemptClose() }}>
      <div className="relative grid max-h-[94vh] w-full max-w-7xl grid-rows-[minmax(250px,42vh)_minmax(0,1fr)] overflow-hidden rounded-lg border border-white/12 bg-[#09100d] shadow-2xl lg:grid-cols-[minmax(0,1.02fr)_minmax(440px,0.98fr)] lg:grid-rows-1">
        <aside className="flex min-h-0 flex-col bg-black/45 p-4 lg:p-6">
          <div className="flex min-h-[190px] flex-1 items-center justify-center overflow-hidden rounded-md border border-white/[0.08] bg-black/25 p-3">
            {file?.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.signed_url} alt={semanticName} className="max-h-[58vh] max-w-full object-contain" />
            ) : <p className="text-sm text-white/30">Preview unavailable</p>}
          </div>
          <section className="mt-4 rounded-md border border-white/[0.08] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase text-white/28">File truth</p>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><dt className="text-white/24">File name</dt><dd className="mt-1 break-all text-white/58">{file?.file_name ?? record.legacy_asset?.file_name ?? 'Not defined'}</dd></div><div><dt className="text-white/24">File type</dt><dd className="mt-1 text-white/58">{file?.file_type ?? record.legacy_asset?.file_type ?? 'Not defined'}</dd></div><div><dt className="text-white/24">Dimensions</dt><dd className="mt-1 text-white/58">{record.legacy_asset?.original_width && record.legacy_asset?.original_height ? `${record.legacy_asset.original_width} × ${record.legacy_asset.original_height}` : 'Not defined'}</dd></div><div><dt className="text-white/24">File size</dt><dd className="mt-1 text-white/58">{file?.file_size_bytes ? `${(file.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : 'Not defined'}</dd></div></dl>
            <div className="mt-4 grid gap-3 border-t border-white/[0.08] pt-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><p className="text-[10px] font-semibold uppercase text-white/28">Review State</p><p className="mt-1 text-sm font-semibold text-white/70">{humanizeClientBrainV2Value(normalizeAssetReviewState(firstValue(metadata, ['review_state']), record.status === 'archived' ? 'archived' : record.status === 'draft' ? 'draft' : approvedState ? 'approved' : 'needs_review'))}</p></div><div><p className="text-[10px] font-semibold uppercase text-white/28">Approved for Generation</p><p className={`mt-1 text-sm font-semibold ${approvedState === true ? 'text-emerald-100' : approvedState === false ? 'text-red-100/75' : 'text-white/35'}`}>{approvedState === true ? 'Yes' : approvedState === false ? 'No' : 'Not decided'}</p></div></div>
          </section>
        </aside>
        <div className="min-h-0 overflow-y-auto px-5 pb-7 pt-6 md:px-7 lg:max-h-[94vh]">
          <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/50">Asset Metadata</p><h2 className="mt-2 truncate text-2xl font-semibold text-white">{semanticName}</h2><p className="mt-1 text-sm text-white/42">{humanizeClientBrainV2Value(activeCategory)}</p>{persistedCategory === 'unclassified' && legacySuggestion !== 'unclassified' && <p className="mt-1 text-xs text-amber-100/45">Legacy suggestion: {humanizeClientBrainV2Value(legacySuggestion)}</p>}</div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button type="button" disabled={saving || !dirty} onClick={() => void save()} className="min-h-11 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-black disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => { setDeleteError(''); setDeleteConfirmationOpen(true) }} className="min-h-11 rounded-md border border-red-300/25 px-3 text-sm font-semibold text-red-100/75 hover:bg-red-300/[0.06]">Delete</button>
              <button type="button" onClick={attemptClose} aria-label="Close asset details" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/35 text-2xl font-light text-white/65 hover:text-white">×</button>
            </div>
          </header>

          {saveError && <p role="alert" className="mt-4 rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{saveError}</p>}

          <section className="mt-6 rounded-md border border-white/[0.08] bg-white/[0.02] p-4 md:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/50">Core Metadata</p>
            <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <div><p className="mb-1.5 text-[10px] font-semibold uppercase text-white/28">Asset Category</p><div className="min-h-11 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white/65"><select value={draft.category} onChange={event => changeCategory(event.target.value as EditableRestaurantAssetCategory)} className="min-h-7 w-full bg-transparent text-sm text-white/70 outline-none">{EDITABLE_RESTAURANT_ASSET_CATEGORIES.map(category => <option key={category} value={category}>{humanizeClientBrainV2Value(category)}</option>)}</select></div></div>
              {coreFields.filter(field => field.id !== 'currency' && field.id !== 'price' && field.id !== 'dish_name' && field.id !== 'drink_name').map(field => <MetadataField key={field.id} field={field} stored={fieldValue(record, schemaCategory, field.id)} editing value={draft.fields[field.id]} onChange={value => changeField(field.id, value)} />)}
              {(['food', 'drinks'].includes(activeCategory)) && <div><p className="mb-1.5 text-[10px] font-semibold uppercase text-white/28">Item Price</p><div className="flex min-h-11 overflow-hidden rounded-md border border-white/10 bg-black/20 text-sm text-white/65"><select value={String(draft.fields.currency ?? '')} onChange={event => changeField('currency', event.target.value)} className="w-20 border-r border-white/[0.08] bg-transparent px-2 text-xs text-white/70 outline-none"><option value="">AED</option>{['AED', 'USD', 'EUR', 'GBP'].map(currency => <option key={currency} value={currency}>{currency}</option>)}</select><input type="number" min="0" step="0.01" value={String(draft.fields.price ?? '')} onChange={event => changeField('price', event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white/70 outline-none" placeholder="Not individually priced" /></div>{packagePricing && <div className="mt-3 rounded-md border border-white/[0.08] bg-black/15 px-3 py-2"><p className="text-[10px] font-semibold uppercase text-white/28">Included In</p><p className="mt-1 text-xs leading-5 text-white/62">{packagePricing.ownerName} · {formatRestaurantPrice(packagePricing.price, packagePricing.currency)}</p></div>}</div>}
              {(['food', 'drinks'].includes(activeCategory)) && <div className="sm:col-span-2"><MultiSelect label="Menus" options={options.menus} selected={draft.menuRecordIds} onChange={menuRecordIds => { setDraft(current => normalizeDraftApproval({ ...current, menuRecordIds, pendingCanonicalMenuItemName: undefined, enrichment: undefined })); setApprovalGuidance('') }} />{legacyMenu && !draft.menuRecordIds.length && !draft.clearLegacyMenu && <p className="mt-2 text-xs text-amber-100/55">Preserved legacy menu label: {legacyMenu} <button type="button" onClick={() => setDraft(current => ({ ...current, clearLegacyMenu: true }))} className="ml-2 underline">Clear label</button></p>}</div>}
              {(['food', 'drinks'].includes(activeCategory)) && <div className="sm:col-span-2 rounded-md border border-emerald-300/15 bg-emerald-300/[0.035] p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/55">Canonical Menu Item</p><p className="mt-1 text-xs leading-5 text-white/45">Search current official menu truth. Searching never changes the saved relationship or runs visual analysis.</p></div>
                  {storedCanonicalMenuItem && <button type="button" disabled={enriching || draft.clearCanonicalMenuMatch} onClick={clearCanonicalMenuMatch} className="min-h-10 rounded-md border border-red-300/25 px-3 text-sm font-semibold text-red-100/80 hover:bg-red-300/[0.08] disabled:cursor-not-allowed disabled:opacity-40">Clear Match</button>}
                </div>
                {storedCanonicalMenuItem && <div className="mt-3 rounded-md border border-emerald-300/14 bg-black/20 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/50">Current Menu Match</p><p className="mt-1 text-sm text-emerald-50"><strong>{storedCanonicalMenuItem}</strong></p></div>}
                {draft.clearCanonicalMenuMatch && <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-sm text-amber-50">The current canonical menu match will be removed when you save. The Asset itself and its approval state remain unchanged.</p>}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1"><span className="mb-1.5 block text-[10px] font-semibold uppercase text-white/28">{activeCategory === 'food' ? 'Dish Name Search' : 'Drink Name Search'}</span><input value={menuSearchText} onChange={event => { setMenuSearchText(event.target.value); setEnrichment(null); setEnrichmentError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void enrichMetadata() } }} placeholder={activeCategory === 'food' ? 'Type a dish name to find a replacement…' : 'Type a drink name to find a replacement…'} className="min-h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white/70 outline-none focus:border-emerald-300/35" /></label>
                  <button type="button" disabled={enriching || !menuSearchText.trim()} onClick={() => void enrichMetadata()} className="min-h-11 rounded-md border border-emerald-300/25 px-3 text-sm font-semibold text-emerald-50 hover:bg-emerald-300/[0.08] disabled:cursor-not-allowed disabled:opacity-40">{enriching ? 'Finding…' : 'Find Match'}</button>
                </div>
                <p className="mt-2 text-xs text-white/42">The search text is not saved. Select a replacement and then Save to replace the current canonical identity.</p>
                {!draft.menuRecordIds.length && !draft.clearCanonicalMenuMatch && <p className="mt-3 text-xs text-white/42">Searches every current official menu for this client. Selecting a result adds its exact menu relationship to this draft.</p>}
                {enrichmentError && <p role="alert" className="mt-3 rounded-md border border-red-300/20 bg-red-300/[0.06] px-3 py-2 text-sm text-red-100">{enrichmentError}</p>}
                {enrichment?.status === 'selection_required' && <div className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.04] p-3"><p className="text-sm font-semibold text-amber-50">Suggested Matches</p><p className="mt-1 text-xs leading-5 text-white/48">{enrichment.warning}</p><div className="mt-3 grid gap-2">{(enrichment.candidates ?? []).map(candidate => <button key={candidate.id} type="button" disabled={enriching} onClick={() => void enrichMetadata(candidate.id)} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-white/10 px-3 text-left text-sm text-white/65 hover:border-emerald-300/25 hover:text-white"><span className="min-w-0"><strong className="block truncate font-semibold">{candidate.canonical_name}</strong><span className="mt-0.5 block text-xs text-white/38">{candidate.menu_section ?? 'Official menu'} · {candidate.currency ?? 'AED'} {candidate.price ?? 'Price not listed'} · {candidate.source_document_version} p.{candidate.source_page ?? '–'}</span></span><span className="text-xs text-emerald-100/55">Select</span></button>)}</div></div>}
                {enrichment?.status === 'no_match' && <div className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-sm text-amber-50">{enrichment.warning}</div>}
                {enrichment?.proposal && <div className="mt-3 rounded-md border border-white/[0.09] bg-black/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">Replacement ready</p><p className="mt-1 text-sm text-emerald-50"><strong>{enrichment.proposal.canonicalName}</strong></p><p className="mt-1 text-xs text-white/45">{enrichment.matchStatus === 'exact_match' ? 'Exact official menu match' : 'Strong official menu match'} · {enrichment.proposal.sourceDocumentVersion} · page {enrichment.proposal.sourcePage ?? 'not stated'}</p></div><button type="button" onClick={applyEnrichmentProposal} className="min-h-10 rounded-md bg-emerald-300 px-3 text-sm font-semibold text-black hover:bg-emerald-200">Select Replacement</button></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded border border-white/[0.08] p-3"><p className="text-[10px] font-semibold uppercase text-emerald-100/50">Official Menu Truth</p><div className="mt-2 space-y-2"><div><p className="text-[10px] uppercase text-white/28">Menu</p><p className="mt-0.5 text-xs leading-5 text-white/65">{proposalMenuTitle}</p></div><OfficialPricingTruth pricing={enrichment.proposal.pricing} />{Object.entries(enrichment.proposal.menuFields).filter(([field, value]) => field !== 'price' && field !== 'currency' && displayValue(value)).map(([field, value]) => <div key={field}><p className="text-[10px] uppercase text-white/28">{humanizeClientBrainV2Value(field)}</p><p className="mt-0.5 text-xs leading-5 text-white/65">{displayValue(value)}</p>{!valuesMatch(draft.fields[field], value) && <p className="mt-0.5 text-[10px] text-amber-100/60">Different from current draft</p>}</div>)}</div><p className="mt-3 text-[10px] text-white/35">{enrichment.proposal.sourceDocumentVersion}{enrichment.proposal.sourcePage ? ` · page ${enrichment.proposal.sourcePage}` : ''}</p></div><div className="rounded border border-white/[0.08] p-3"><p className="text-[10px] font-semibold uppercase text-emerald-100/50">Visual Presentation Truth</p>{Object.keys(enrichment.proposal.visualFields).length ? <div className="mt-2 space-y-2">{Object.entries(enrichment.proposal.visualFields).filter(([, value]) => displayValue(value)).map(([field, value]) => <div key={field}><p className="text-[10px] uppercase text-white/28">{humanizeClientBrainV2Value(field)}</p><p className="mt-0.5 text-xs leading-5 text-white/65">{displayValue(value)}</p>{!valuesMatch(draft.fields[field], value) && <p className="mt-0.5 text-[10px] text-amber-100/60">Different from current draft</p>}</div>)}</div> : <p className="mt-2 text-xs leading-5 text-white/38">No visual presentation was added. Official menu truth can still be applied.</p>}{enrichment.proposal.visualWarning && <p className="mt-3 text-xs leading-5 text-amber-100/60">{enrichment.proposal.visualWarning}</p>}</div></div>
                  <p className="mt-3 text-[11px] leading-5 text-white/36">Select Replacement updates the draft only. Save is required to replace the reviewed canonical identity and its menu relationship.</p>
                </div>}
                {draft.pendingCanonicalMenuItemName && <p className="mt-3 rounded-md border border-emerald-300/14 bg-black/20 px-3 py-2 text-sm text-emerald-50">Selected replacement: <strong>{draft.pendingCanonicalMenuItemName}</strong>. Save to make it current.</p>}
              </div>}
            </div>
            {approvalGuidance && <p role="status" className="mt-4 text-sm text-amber-100/75">{approvalGuidance}</p>}
          </section>

          <section className="mt-5 rounded-md border border-white/[0.08] bg-white/[0.02]">
            <button type="button" onClick={() => setAdvancedOpen(current => !current)} className="flex min-h-14 w-full items-center justify-between px-4 text-left md:px-5"><span><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/50">Advanced Metadata</span><span className="mt-1 block text-sm text-white/42">Visual truth, provenance, relationships, and verification.</span></span><span className="text-lg text-white/45">{advancedOpen ? '−' : '+'}</span></button>
            {advancedOpen && <div className="border-t border-white/[0.08] p-4 md:p-5"><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{advancedFields.map(field => <MetadataField key={field.id} field={field} stored={fieldValue(record, schemaCategory, field.id)} editing value={draft.fields[field.id]} onChange={value => changeField(field.id, value)} />)}</div><div className="mt-6 border-t border-white/[0.08] pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/50">Relationships / Sources</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><MultiSelect label="Activations" options={options.activations} selected={draft.activationRecordIds} onChange={activationRecordIds => setDraft(current => ({ ...current, activationRecordIds }))} /><MultiSelect label="Sources" options={options.sources} selected={draft.sourceRecordIds} onChange={sourceRecordIds => setDraft(current => ({ ...current, sourceRecordIds }))} />{legacySource && !draft.sourceRecordIds.length && !draft.clearLegacySource && <p className="text-xs text-amber-100/55">Preserved legacy source label: {legacySource} <button type="button" onClick={() => setDraft(current => ({ ...current, clearLegacySource: true }))} className="ml-2 underline">Clear label</button></p>}</div></div></div>}
          </section>
        </div>
      </div>
      {deleteConfirmationOpen && <DeleteAssetConfirmation title={record.title} deleting={deleting} error={deleteError} onCancel={() => { if (!deleting) setDeleteConfirmationOpen(false) }} onConfirm={() => void confirmDelete()} />}
    </div>,
    document.body,
  )
}

export default function RestaurantAssetsWorkspace({ clientId, records, category, onSaved, onDeleted, initialAssetId }: { initialAssetId?: string; clientId: string; records: ClientBrainV2AssetListRecord[]; category: 'all' | ClientBrainV2RestaurantAssetCategory; onSaved: (payload: RestaurantAssetSaveResponse) => void; onDeleted: (assetId: string, payload: RestaurantAssetDeleteResponse) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(initialAssetId ?? null)
  const [selectedRecord, setSelectedRecord] = useState<ClientBrainV2Record | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<ClientBrainV2AssetEditOptions | null>(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(initialAssetId))
  const [detailError, setDetailError] = useState('')
  const [addingAsset, setAddingAsset] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(ASSET_GRID_BATCH_SIZE)
  const [searchQuery, setSearchQuery] = useState('')
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'approved' | 'not_approved'>('all')
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const visible = useMemo(() => {
    const categoryRecords = category === 'all' ? records : records.filter(record => humanConfirmedRestaurantAssetCategory(record) === category)
    return approvalFilter === 'all'
      ? categoryRecords
      : categoryRecords.filter(record => approvalFilter === 'approved' ? record.metadata.approved_for_generation : !record.metadata.approved_for_generation)
  }, [approvalFilter, category, records])
  const searched = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('en')
    if (!query) return visible
    return visible.filter(record => cardSearchText(record, humanConfirmedRestaurantAssetCategory(record)).includes(query))
  }, [searchQuery, visible])
  const displayed = useMemo(() => searched.slice(0, displayLimit), [displayLimit, searched])
  const approvalCounts = useMemo(() => ({
    all: records.length,
    approved: records.filter(record => record.metadata.approved_for_generation).length,
    not_approved: records.filter(record => !record.metadata.approved_for_generation).length,
  }), [records])

  const thumbnailIds = displayed.map(record => record.id).filter(id => !thumbnailUrls[id]).join(',')
  useEffect(() => {
    if (!thumbnailIds) return
    const controller = new AbortController()
    const assetIds = thumbnailIds.split(',')
    void fetch(`/api/clients/${clientId}/brain-v2/assets/thumbnails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetIds }),
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json() as { success?: boolean; error?: string; thumbnailUrls?: Record<string, string> }
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load Asset previews.')
        return payload.thumbnailUrls ?? {}
      })
      .then(urls => {
        if (!controller.signal.aborted) setThumbnailUrls(current => ({ ...current, ...urls }))
      })
      .catch(() => {
        // Missing previews remain a per-card fallback; an Asset record is still usable without one.
      })
    return () => controller.abort()
  }, [clientId, thumbnailIds])

  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    void fetchAssetDetail(clientId, selectedId)
      .then(payload => {
        if (controller.signal.aborted) return
        setSelectedRecord(payload.record ?? null)
        setSelectedOptions(payload.assetEditOptions ?? null)
      })
      .catch(error => {
        if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : 'Unable to load Asset details.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [clientId, selectedId])

  function openAsset(assetId: string) {
    setDetailLoading(true)
    setDetailError('')
    setSelectedRecord(null)
    setSelectedOptions(null)
    setSelectedId(assetId)
  }

  async function refreshSelectedAsset(payload: RestaurantAssetSaveResponse) {
    onSaved(payload)
    if (!selectedId) return
    setDetailLoading(true)
    try {
      const detail = await fetchAssetDetail(clientId, selectedId)
      setSelectedRecord(detail.record ?? null)
      setSelectedOptions(detail.assetEditOptions ?? null)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <>
      <section className="mb-5 flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Asset Library</p>
          <p className="mt-1 text-xs text-white/38">Browse by category, approval, or name.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 sm:w-72">
            <span className="sr-only">Search assets</span>
            <input
              type="search"
              value={searchQuery}
              onChange={event => { setSearchQuery(event.target.value); setDisplayLimit(ASSET_GRID_BATCH_SIZE) }}
              placeholder="Search assets"
              className="min-h-11 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white/75 outline-none placeholder:text-white/28 focus:border-emerald-300/35"
            />
          </label>
          <div className="flex min-h-11 overflow-hidden rounded-md border border-white/10 bg-black/20 text-xs font-semibold">
            {([['all', 'All'], ['approved', 'Approved'], ['not_approved', 'Not Approved']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setApprovalFilter(value); setDisplayLimit(ASSET_GRID_BATCH_SIZE) }} className={`px-3 transition ${approvalFilter === value ? 'bg-emerald-300/15 text-emerald-50' : 'text-white/45 hover:text-white/75'}`}>{label} {approvalCounts[value]}</button>)}
          </div>
          <button type="button" onClick={() => setAddingAsset(true)} className="min-h-11 rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/[0.08]">Add Asset</button>
        </div>
      </section>

      {visible.length === 0 ? <p className="rounded-lg border border-dashed border-white/12 px-6 py-14 text-center text-sm text-white/42">No human-confirmed assets in this category.</p> : searched.length === 0 ? <p className="rounded-lg border border-dashed border-white/12 px-6 py-14 text-center text-sm text-white/42">No assets match this search.</p> : <>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {displayed.map(record => {
          const thumbnailUrl = thumbnailUrls[record.id]
          const assetCategory = humanConfirmedRestaurantAssetCategory(record)
          const legacySuggestion = restaurantAssetCategory(record)
          const isProductAsset = assetCategory === 'food' || assetCategory === 'drinks'
          const title = isProductAsset || assetCategory === 'staff' ? cardProductTitle(record, assetCategory) : record.title
          const secondaryLine = isProductAsset || assetCategory === 'staff' ? cardSecondaryLine(record, assetCategory) : humanizeClientBrainV2Value(assetCategory)
          const price = isProductAsset ? cardPrice(record) : null
          const packageContext = isProductAsset && !price ? cardPackageContext(record) : null
          const approval = record.metadata.approved_for_generation === true ? 'Approved' : record.metadata.approved_for_generation === false ? 'Not Approved' : 'Not set'
          return (
            <button key={record.id} type="button" onClick={() => openAsset(record.id)} className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] text-left transition hover:border-emerald-300/25 hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-emerald-300/25">
              <div className="aspect-[4/5] bg-black/35">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt={record.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                ) : <div className="flex h-full items-center justify-center px-5 text-center text-xs text-white/28">Loading preview…</div>}
              </div>
              <div className="p-2.5 sm:p-4">
                <h3 className="min-h-5 break-words text-sm font-semibold leading-5 text-white">{title}</h3>
                <p className={`mt-1 truncate text-[11px] ${isProductAsset ? 'text-white/42' : 'font-semibold uppercase text-emerald-100/42'}`}>{secondaryLine}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="min-w-0 text-xs text-white/60">{price ?? packageContext ?? ''}</span>
                  <span className="shrink-0 text-[10px] text-white/30">{approval}</span>
                </div>
                {assetCategory === 'unclassified' && legacySuggestion !== 'unclassified' && <p className="mt-1.5 truncate text-[10px] text-amber-100/38">Legacy suggestion: {humanizeClientBrainV2Value(legacySuggestion)}</p>}
              </div>
            </button>
          )
        })}
        </div>
        {displayed.length < visible.length && <div className="mt-5 flex justify-center"><button type="button" onClick={() => setDisplayLimit(current => current + ASSET_GRID_BATCH_SIZE)} className="min-h-11 rounded-md border border-white/12 px-4 text-sm font-semibold text-white/62 hover:border-emerald-300/25 hover:text-white">Load {Math.min(ASSET_GRID_BATCH_SIZE, visible.length - displayed.length)} more assets</button></div>}
      </>}
      {addingAsset && <AssetIngestionModal clientId={clientId} onClose={() => setAddingAsset(false)} onFinalized={async () => {
        const response = await fetch(`/api/clients/${clientId}/brain-v2?section=assets`, { cache: 'no-store' })
        const payload = await response.json() as RestaurantAssetSaveResponse
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Asset was added, but the Asset Library could not refresh.')
        onSaved(payload)
        setAddingAsset(false)
      }} />}
      {selectedId && detailLoading && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 text-sm text-white/65">Loading Asset details…</div>}
      {selectedId && detailError && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6"><div className="max-w-md rounded-lg border border-red-300/20 bg-[#09100d] p-6 text-sm text-red-100"><p>{detailError}</p><button type="button" onClick={() => setSelectedId(null)} className="mt-5 min-h-11 rounded-md border border-white/12 px-4 font-semibold text-white/65">Close</button></div></div>}
      {selectedId && selectedRecord && selectedOptions && <AssetModal key={`${selectedRecord.id}:${selectedRecord.updated_at}`} clientId={clientId} record={selectedRecord} options={selectedOptions} onClose={() => setSelectedId(null)} onSaved={refreshSelectedAsset} onDeleted={onDeleted} />}
    </>
  )
}
