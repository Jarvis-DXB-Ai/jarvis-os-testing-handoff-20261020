'use client'

import { useState } from 'react'
import {
  InlineList,
  InlineSelect,
  InlineText,
  type ClientBrainV2InlineEditor,
} from './client-brain-v2-editor'
import { humanizeClientBrainV2Value, restaurantAssetCategory, type ClientBrainV2Record } from '@/lib/client-brain-v2'
import type { ClientBrainV2EditField } from '@/lib/client-brain-v2-edit'

const ENTITY_STATUSES = ['current', 'active', 'approved', 'needs_review', 'historical', 'superseded']

function dataFor(record: ClientBrainV2Record) {
  const editorData = record.metadata.editor_data
  return editorData && typeof editorData === 'object' && !Array.isArray(editorData)
    ? editorData as Record<string, unknown>
    : record.metadata
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readable(value: unknown, empty = 'Not recorded') {
  const normalized = text(value).trim()
  return normalized || empty
}

function price(record: ClientBrainV2Record, data: Record<string, unknown>) {
  const amount = data.price ?? record.commercial?.price_amount
  if (amount == null || amount === '') return null
  return `${text(data.currency || record.commercial?.currency || 'AED')} ${Number(amount).toLocaleString('en-AE')}`
}

function statusClass(status: string) {
  if (['current', 'active', 'approved'].includes(status)) return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
  if (status === 'scheduled') return 'border-sky-300/25 bg-sky-300/10 text-sky-100'
  if (status === 'needs_review') return 'border-amber-300/25 bg-amber-300/10 text-amber-100'
  if (status === 'expired') return 'border-rose-300/25 bg-rose-300/10 text-rose-100'
  return 'border-white/10 bg-white/[0.04] text-white/48'
}

function EntityStatus({ status }: { status: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(status)}`}>{humanizeClientBrainV2Value(status)}</span>
}

function Value({ label, value, empty }: { label: string; value: unknown; empty?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase text-white/30">{label}</p>
      <p className={`mt-1.5 text-sm leading-6 ${text(value).trim() ? 'text-white/65' : 'text-white/28'}`}>{readable(value, empty)}</p>
    </div>
  )
}

function RelationSummary({ record }: { record: ClientBrainV2Record }) {
  const relations = record.relationships ?? []
  const food = relations.filter(item => item.record.top_section === 'assets' && restaurantAssetCategory(item.record) === 'food')
  const drinks = relations.filter(item => item.record.top_section === 'assets' && restaurantAssetCategory(item.record) === 'drinks')
  const menus = relations.filter(item => item.record.subsection === 'menus')
  const sources = relations.filter(item => item.record.top_section === 'sources')
  const creatives = relations.filter(item => item.record.top_section === 'assets' && /creative/i.test(item.relation_type))
  return (
    <div className="grid gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-2 xl:grid-cols-4">
      <Value label="Related Food Assets" value={food.length ? `${food.length} linked` : ''} empty="No verified links" />
      <Value label="Related Drink Assets" value={drinks.length ? `${drinks.length} linked` : ''} empty="No verified links" />
      <Value label="Related Menus" value={menus.map(item => item.record.title).join(', ')} empty="No menu link" />
      <Value label="Source / Creative" value={sources.map(item => item.record.title).concat(creatives.map(item => item.record.title)).join(', ')} empty="No linked file" />
    </div>
  )
}

function editorItem(editor: ClientBrainV2InlineEditor | undefined, fieldId: string, recordId: string) {
  const field = editor?.field(fieldId)
  const index = (field?.items ?? []).findIndex(item => item.recordId === recordId) ?? -1
  return { field, index, item: index >= 0 ? field?.items?.[index] : undefined }
}

function patchItem(editor: ClientBrainV2InlineEditor, field: ClientBrainV2EditField, index: number, patch: Record<string, unknown>) {
  editor.updateField({
    ...field,
    items: (field.items ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  })
}

function EditableValue({
  label,
  item,
  property,
  onChange,
  multiline = false,
}: {
  label: string
  item: Record<string, unknown>
  property: string
  onChange: (patch: Record<string, unknown>) => void
  multiline?: boolean
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase text-white/30">{label}</p>
      <InlineText
        label={label}
        value={text(item[property])}
        placeholder={`Add ${label.toLowerCase()}…`}
        className={multiline ? 'text-sm leading-6 text-white/65' : 'text-sm font-medium text-white/70'}
        onChange={value => onChange({ [property]: value })}
      />
    </div>
  )
}

type MenuDocumentResponse = {
  success: boolean
  error?: string
  missingReason?: string
  document?: {
    recordId: string
    sourceTitle: string
    sourceVersion: string | null
    status: string
    fileName: string
    pageCount: number | null
    url: string
    expiresAt: string
  } | null
}

function MenuDocumentViewer({ document, onClose }: { document: NonNullable<MenuDocumentResponse['document']>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm md:p-6" role="dialog" aria-modal="true" aria-label={`${document.sourceTitle} menu document`} onMouseDown={event => { if (event.currentTarget === event.target) onClose() }}>
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/12 bg-[#09100d] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4 md:px-6">
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/50">Current Official Menu</p><h2 className="mt-1 truncate text-lg font-semibold text-white">{document.sourceTitle}</h2><p className="mt-1 text-xs text-white/42">{document.sourceVersion ?? 'Version not recorded'} · {document.pageCount ? `${document.pageCount} pages` : 'Page count not recorded'} · signed access expires {new Date(document.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
          <div className="flex shrink-0 items-center gap-2"><a href={document.url} target="_blank" rel="noreferrer" className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold leading-10 text-white/70 hover:border-emerald-300/30 hover:text-white">Open</a><a href={document.url} download={document.fileName} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold leading-10 text-white/70 hover:border-emerald-300/30 hover:text-white">Download</a><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md border border-white/12 text-xl text-white/65 hover:text-white" aria-label="Close menu document">×</button></div>
        </header>
        <iframe title={document.fileName} src={document.url} className="min-h-0 flex-1 bg-white" />
      </div>
    </div>
  )
}

export function MenusWorkspace({ clientId, records, editor }: { clientId: string; records: ClientBrainV2Record[]; editor?: ClientBrainV2InlineEditor }) {
  const menus = records.filter(record => record.subsection === 'menus'
    && record.record_type === 'menu'
    && record.status === 'current'
    && record.metadata.menu_taxonomy_status === 'active')
  const [document, setDocument] = useState<NonNullable<MenuDocumentResponse['document']> | null>(null)
  const [documentError, setDocumentError] = useState('')
  const [loadingMenuId, setLoadingMenuId] = useState('')
  async function openDocument(menuId: string) {
    if (loadingMenuId) return
    setLoadingMenuId(menuId)
    setDocumentError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/menus/${menuId}/document`, { cache: 'no-store' })
      const payload = await response.json() as MenuDocumentResponse
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to open the official menu document.')
      if (!payload.document) throw new Error(payload.missingReason || 'No current official document is linked to this menu.')
      setDocument(payload.document)
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Unable to open the official menu document.')
    } finally {
      setLoadingMenuId('')
    }
  }
  if (menus.length === 0) return <p className="rounded-lg border border-dashed border-white/12 px-6 py-14 text-center text-sm text-white/42">No service-level menus have been recorded.</p>
  return (
    <div className="space-y-3">
      {menus.map(record => {
        const stored = dataFor(record)
        const editable = editorItem(editor, 'menus', record.id)
        const item = editable.item ?? stored
        const patch = (next: Record<string, unknown>) => editor && editable.field && editable.index >= 0 && patchItem(editor, editable.field, editable.index, next)
        const status = text(item.status || record.status)
        return (
          <details key={record.id} className="group rounded-lg border border-white/10 bg-white/[0.03] open:bg-white/[0.04]">
            <summary className="cursor-pointer list-none px-5 py-5 md:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{readable(item.menu_type, 'Menu')}</p>
                  {editor && editable.field ? (
                    <div className="mt-1.5 max-w-xl"><InlineText label="Menu name" value={text(item.name)} className="text-lg font-semibold text-white" onChange={value => patch({ name: value })} /></div>
                  ) : <h3 className="mt-1.5 text-lg font-semibold text-white">{record.title}</h3>}
                  <p className="mt-2 text-sm leading-6 text-white/48">{readable(item.description, 'Description not recorded.')}</p>
                </div>
                {editor ? (
                  <InlineSelect label="Menu status" value={status} onChange={value => patch({ status: value })}>
                    {ENTITY_STATUSES.map(option => <option key={option} value={option}>{humanizeClientBrainV2Value(option)}</option>)}
                  </InlineSelect>
                ) : <EntityStatus status={status} />}
              </div>
              <div className="mt-5 grid gap-4 border-t border-white/[0.07] pt-4 sm:grid-cols-3">
                <Value label="Service / Daypart" value={item.service_daypart} />
                <Value label="Availability" value={item.availability} />
                <Value label="Service Hours" value={item.service_hours} />
              </div>
            </summary>
            <div className="space-y-5 border-t border-white/[0.07] px-5 py-5 md:px-6">
              {editor && editable.field ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <EditableValue label="Menu Type" item={item} property="menu_type" onChange={patch} />
                  <EditableValue label="Service / Daypart" item={item} property="service_daypart" onChange={patch} />
                  <EditableValue label="Availability" item={item} property="availability" onChange={patch} />
                  <EditableValue label="Service Hours" item={item} property="service_hours" onChange={patch} />
                  <EditableValue label="Source" item={item} property="source" onChange={patch} />
                  <EditableValue label="Last Verified (YYYY-MM-DD)" item={item} property="last_verified" onChange={patch} />
                  <EditableValue label="Review State" item={item} property="review_state" onChange={patch} />
                  <EditableValue label="Notes" item={item} property="notes" onChange={patch} multiline />
                  <div className="md:col-span-2"><EditableValue label="Description" item={item} property="description" onChange={patch} multiline /></div>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <Value label="Source" value={item.source} />
                  <Value label="Last Verified" value={item.last_verified} />
                  <Value label="Review State" value={item.review_state} />
                  <Value label="Notes" value={item.notes} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
                <button type="button" onClick={() => void openDocument(record.id)} disabled={Boolean(loadingMenuId)} className="min-h-10 rounded-md border border-emerald-300/25 bg-emerald-300/[0.08] px-3 text-xs font-semibold text-emerald-50 hover:bg-emerald-300/[0.14] disabled:opacity-50">{loadingMenuId === record.id ? 'Opening…' : 'View Menu'}</button>
                {documentError ? <p className="text-xs text-amber-100/65">{documentError}</p> : null}
              </div>
              <RelationSummary record={record} />
            </div>
          </details>
        )
      })}
      {document ? <MenuDocumentViewer document={document} onClose={() => setDocument(null)} /> : null}
    </div>
  )
}

export function ActivationsWorkspace({ clientId, records, editor }: { clientId: string; records: ClientBrainV2Record[]; editor?: ClientBrainV2InlineEditor }) {
  const activations = records.filter(record => record.subsection === 'activations' && record.record_type === 'activation')
  const [document, setDocument] = useState<NonNullable<MenuDocumentResponse['document']> | null>(null)
  const [documentError, setDocumentError] = useState('')
  const [loadingActivationId, setLoadingActivationId] = useState('')
  async function openOfficialDocument(activationId: string) {
    if (loadingActivationId) return
    setLoadingActivationId(activationId)
    setDocumentError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2/activations/${activationId}/document`, { cache: 'no-store' })
      const payload = await response.json() as MenuDocumentResponse
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to open the official activation document.')
      if (!payload.document) throw new Error(payload.missingReason || 'No current official document is linked to this activation.')
      setDocument(payload.document)
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Unable to open the official activation document.')
    } finally {
      setLoadingActivationId('')
    }
  }
  if (activations.length === 0) return <p className="rounded-lg border border-dashed border-white/12 px-6 py-14 text-center text-sm text-white/42">No activations have been recorded.</p>
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {activations.map(record => {
        const stored = dataFor(record)
        const editable = editorItem(editor, 'activations', record.id)
        const item = editable.item ?? stored
        const patch = (next: Record<string, unknown>) => editor && editable.field && editable.index >= 0 && patchItem(editor, editable.field, editable.index, next)
        const status = text(item.status || record.status)
        const temporal = record.activation_temporal
        const displayPrice = price(record, item)
        const hasOfficialDocument = (record.relationships ?? []).some(relationship => {
          const metadata = relationship.record.metadata
          return relationship.relation_type === 'documented_by'
            && relationship.record.top_section === 'sources'
            && metadata.menu_document === true
        })
        return (
          <details key={record.id} className="group h-fit rounded-lg border border-white/10 bg-white/[0.03] open:bg-white/[0.04]">
            <summary className="cursor-pointer list-none px-5 py-5 md:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{readable(item.type, 'Activation')}</p>
                  {editor && editable.field ? (
                    <div className="mt-1.5"><InlineText label="Activation name" value={text(item.name)} className="text-lg font-semibold text-white" onChange={value => patch({ name: value })} /></div>
                  ) : <h3 className="mt-1.5 text-lg font-semibold text-white">{record.title}</h3>}
                </div>
                {editor ? (
                  <InlineSelect label="Activation lifecycle" value={status} onChange={value => patch({ status: value })}>
                    {ENTITY_STATUSES.map(option => <option key={option} value={option}>{humanizeClientBrainV2Value(option)}</option>)}
                  </InlineSelect>
                ) : <EntityStatus status={temporal?.status ?? status} />}
              </div>
              <p className="mt-3 text-sm leading-6 text-white/52">{readable(item.proposition, 'Proposition not recorded.')}</p>
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-4">
                <Value label="Price" value={displayPrice} empty="Not applicable / not shown" />
                <Value label="Schedule" value={item.schedule || item.days} />
              </div>
              {!editor && temporal ? <p className="mt-4 text-xs leading-5 text-white/46">{temporal.trust_line} {temporal.evidence_line}</p> : null}
            </summary>
            <div className="space-y-5 border-t border-white/[0.07] px-5 py-5 md:px-6">
              {editor && editable.field ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <EditableValue label="Type" item={item} property="type" onChange={patch} />
                  <EditableValue label="Price" item={item} property="price" onChange={patch} />
                  <EditableValue label="Currency" item={item} property="currency" onChange={patch} />
                  <EditableValue label="Pricing Basis" item={item} property="pricing_basis" onChange={patch} />
                  <EditableValue label="Schedule" item={item} property="schedule" onChange={patch} />
                  <EditableValue label="Days" item={item} property="days" onChange={patch} />
                  <EditableValue label="Start Time" item={item} property="start_time" onChange={patch} />
                  <EditableValue label="End Time" item={item} property="end_time" onChange={patch} />
                  <EditableValue label="Start Date" item={item} property="start_date" onChange={patch} />
                  <EditableValue label="End Date" item={item} property="end_date" onChange={patch} />
                  <EditableValue label="Valid Until" item={item} property="valid_until" onChange={patch} />
                  <EditableValue label="Review Date" item={item} property="review_date" onChange={patch} />
                  <EditableValue label="Recurrence" item={item} property="recurrence" onChange={patch} />
                  <EditableValue label="Platform" item={item} property="platform" onChange={patch} />
                  <EditableValue label="Dish" item={item} property="dish" onChange={patch} />
                  <EditableValue label="Month" item={item} property="month" onChange={patch} />
                  <EditableValue label="Source" item={item} property="source" onChange={patch} />
                  <EditableValue label="Last Verified" item={item} property="last_verified" onChange={patch} />
                  <EditableValue label="Review State" item={item} property="review_state" onChange={patch} />
                  <EditableValue label="Notes" item={item} property="notes" onChange={patch} multiline />
                  <div className="sm:col-span-2"><EditableValue label="Description / Proposition" item={item} property="proposition" onChange={patch} multiline /></div>
                  <div><p className="text-[10px] font-semibold uppercase text-white/30">Inclusions</p><InlineList label="Inclusions" values={list(item.inclusions)} onChange={values => patch({ inclusions: values })} /></div>
                  <div><p className="text-[10px] font-semibold uppercase text-white/30">Restrictions</p><InlineList label="Restrictions" values={list(item.restrictions)} onChange={values => patch({ restrictions: values })} /></div>
                  <div className="sm:col-span-2"><p className="text-[10px] font-semibold uppercase text-white/30">Ingredients</p><InlineList label="Ingredients" values={list(item.ingredients)} onChange={values => patch({ ingredients: values })} /></div>
                  <div className="sm:col-span-2"><p className="text-[10px] font-semibold uppercase text-white/30">Booking Requirements</p><InlineList label="Booking requirements" values={list(item.booking_requirements)} onChange={values => patch({ booking_requirements: values })} /></div>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  <Value label="Days" value={item.days} />
                  <Value label="Start / End" value={[text(item.start_time), text(item.end_time)].filter(Boolean).join('–')} />
                  <Value label="Recurrence" value={item.recurrence} />
                  <Value label="Platform" value={item.platform} />
                  <Value label="Dish" value={item.dish} />
                  <Value label="Month" value={item.month} />
                  <Value label="Pricing Basis" value={item.pricing_basis} />
                  <Value label="Review State" value={item.review_state} />
                  <Value label="Temporal Status" value={temporal?.status} />
                  <Value label="Current-use eligibility" value={temporal ? (temporal.eligible_for_current_retrieval ? 'Eligible' : 'Not eligible') : ''} />
                  <Value label="Start / Valid Until" value={[temporal?.start_date, temporal?.valid_until].filter(Boolean).join('–')} />
                  <Value label="Review Date" value={temporal?.review_date} />
                  <Value label="Inclusions" value={list(item.inclusions).join(', ')} />
                  <Value label="Restrictions" value={list(item.restrictions).join(', ')} />
                  <Value label="Ingredients" value={list(item.ingredients).join(', ')} />
                  <Value label="Booking Requirements" value={list(item.booking_requirements).join(', ')} />
                  <Value label="Source" value={item.source} />
                  <Value label="Last Verified" value={item.last_verified} />
                  <Value label="Notes" value={item.notes} />
                </div>
              )}
              {hasOfficialDocument ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
                  <button type="button" onClick={() => void openOfficialDocument(record.id)} disabled={Boolean(loadingActivationId)} className="min-h-10 rounded-md border border-emerald-300/25 bg-emerald-300/[0.08] px-3 text-xs font-semibold text-emerald-50 hover:bg-emerald-300/[0.14] disabled:opacity-50">{loadingActivationId === record.id ? 'Opening…' : 'View Official Menu'}</button>
                  {documentError ? <p className="text-xs text-amber-100/65">{documentError}</p> : null}
                </div>
              ) : null}
              <RelationSummary record={record} />
            </div>
          </details>
        )
      })}
      {document ? <MenuDocumentViewer document={document} onClose={() => setDocument(null)} /> : null}
    </div>
  )
}
