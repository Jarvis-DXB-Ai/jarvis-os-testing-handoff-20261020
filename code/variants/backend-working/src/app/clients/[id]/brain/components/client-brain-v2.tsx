'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ClientBrainV2Editor, {
  InlineAddButton,
  InlineList,
  InlineRemoveButton,
  InlineSelect,
  InlineText,
  type ClientBrainV2InlineEditor,
} from './client-brain-v2-editor'
import ProductsOffersWorkspace from './client-brain-v2-products-offers'
import RestaurantAssetsWorkspace, { type RestaurantAssetDeleteResponse } from './client-brain-v2-restaurant-assets'
import ClientContentLibrary from './client-content-library'
import ClientSecureLogins from './client-secure-logins'
import BrandGuidelinesWorkspace from './client-brain-v2-brand-guidelines'
import SourcesWorkspace from './client-brain-v2-sources'
import LearningsWorkspace from './client-brain-v2-learnings'
import ClientIntelligenceScanner from './client-intelligence-scanner'
import { ActivationsWorkspace, MenusWorkspace } from './client-brain-v2-restaurant-intelligence'
import {
  GAP_AREAS,
  GAP_LIFECYCLES,
  GAP_TYPES,
  VISUAL_RULE_STRENGTHS,
  isEditableBrainV2Subsection,
  type ClientBrainV2EditField,
  type ClientBrainV2EditorWorkspace,
  type ClientBrainV2EditWorkspace,
  type ClientBrainV2EditableSubsection,
} from '@/lib/client-brain-v2-edit'
import {
  isBrandGuidelineSubsection,
  type ClientBrainV2BrandGuidelineOptions,
  type ClientBrainV2BrandGuidelineSubsection,
  type ClientBrainV2BrandGuidelineWorkspace,
} from '@/lib/client-brain-v2-brand-guidelines'
import type { ClientBrainV2AssetEditOptions } from '@/lib/client-brain-v2-asset-edit'
import type { ClientBrainV2LearningOptions } from '@/lib/client-brain-v2-learnings'
import {
  CLIENT_BRAIN_V2_BRAND_IDENTITY_GROUPS,
  CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_GROUPS,
  CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_GROUPS,
  CLIENT_BRAIN_V2_OPERATIONS_GROUPS,
  clientBrainV2SectionsForVersion,
  clientBrainV2SubsectionsForVersion,
  CLIENT_BRAIN_V2_VISUAL_DNA_GROUPS,
  humanConfirmedRestaurantAssetCategory,
  humanizeClientBrainV2Value,
  isRestaurantClientBrainV2,
  type ClientBrainV2Audience,
  type ClientBrainV2AudienceField,
  type ClientBrainV2AudienceSegment,
  type ClientBrainV2AssetListRecord,
  type ClientBrainV2BrandIdentity,
  type ClientBrainV2BrandIdentityField,
  type ClientBrainV2CommercialStrategy,
  type ClientBrainV2CommercialStrategyField,
  type ClientBrainV2CommercialStrategySource,
  type ClientBrainV2Overview,
  type ClientBrainV2OverviewField,
  type ClientBrainV2MarketIntelligence,
  type ClientBrainV2MarketIntelligenceField,
  type ClientBrainV2MarketSource,
  type ClientBrainV2KnowledgeGapItem,
  type ClientBrainV2KnowledgeGapWorkspace,
  type ClientBrainV2Operations,
  type ClientBrainV2OperationsField,
  type ClientBrainV2OperationsSource,
  type ClientBrainV2Record,
  type ClientBrainV2Section,
  type ClientBrainV2VisualDna,
  type ClientBrainV2VisualDnaField,
} from '@/lib/client-brain-v2'

type BrainV2Response = {
  success: boolean
  error?: string
  client?: {
    id: string
    name: string
    industry: string | null
    status: string | null
    brain_architecture_version: string | null
  }
  section?: ClientBrainV2Section
  overview?: ClientBrainV2Overview | null
  brandIdentity?: ClientBrainV2BrandIdentity | null
  audience?: ClientBrainV2Audience | null
  visualDna?: ClientBrainV2VisualDna | null
  commercialStrategy?: ClientBrainV2CommercialStrategy | null
  operations?: ClientBrainV2Operations | null
  marketIntelligence?: ClientBrainV2MarketIntelligence | null
  knowledgeGaps?: ClientBrainV2KnowledgeGapWorkspace | null
  editWorkspaces?: Record<ClientBrainV2EditableSubsection, ClientBrainV2EditWorkspace> | null
  brandGuidelines?: Record<ClientBrainV2BrandGuidelineSubsection, ClientBrainV2BrandGuidelineWorkspace> | null
  brandGuidelineOptions?: ClientBrainV2BrandGuidelineOptions | null
  assetEditOptions?: ClientBrainV2AssetEditOptions | null
  assetCounts?: Record<string, number>
  assetRecords?: ClientBrainV2AssetListRecord[]
  learningOptions?: ClientBrainV2LearningOptions | null
  records?: ClientBrainV2Record[]
  counts?: {
    total: number
    sections: Record<string, number>
    subsections: Record<string, number>
    statuses: Record<string, number>
  }
}

const STATUS_STYLES: Record<string, string> = {
  verified: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  approved: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  current: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  active: 'border-blue-300/20 bg-blue-300/10 text-blue-100',
  open: 'border-blue-300/20 bg-blue-300/10 text-blue-100',
  in_review: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  blocked: 'border-red-300/25 bg-red-300/10 text-red-100',
  resolved: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  dismissed: 'border-white/10 bg-white/[0.025] text-white/35',
  needs_review: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  unverified: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  conflicting: 'border-red-300/25 bg-red-300/10 text-red-100',
  conflict: 'border-red-300/25 bg-red-300/10 text-red-100',
  contradicted: 'border-red-300/25 bg-red-300/10 text-red-100',
  restricted: 'border-red-300/25 bg-red-300/10 text-red-100',
  historical: 'border-white/10 bg-white/[0.04] text-white/48',
  expired: 'border-white/10 bg-white/[0.025] text-white/35',
  scheduled: 'border-violet-300/20 bg-violet-300/10 text-violet-100',
  superseded: 'border-white/10 bg-white/[0.025] text-white/35',
  not_defined: 'border-white/10 bg-white/[0.04] text-white/48',
  draft: 'border-white/10 bg-white/[0.04] text-white/48',
}

const TRUST_WARNING_STATUSES = new Set(['needs_review', 'unverified', 'conflicting', 'contradicted', 'restricted'])

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index)
}

function cloneEditWorkspace(workspace: ClientBrainV2EditorWorkspace) {
  return JSON.parse(JSON.stringify(workspace)) as ClientBrainV2EditorWorkspace
}

function editorField(editor: ClientBrainV2InlineEditor | undefined, id: string) {
  return editor?.field(id)
}

function patchEditorItem(editor: ClientBrainV2InlineEditor, field: ClientBrainV2EditField, index: number, patch: Record<string, unknown>) {
  const items = field.items ?? []
  editor.updateField({
    ...field,
    items: items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  })
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {humanizeClientBrainV2Value(status)}
    </span>
  )
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function confidenceLabel(value: number | null) {
  if (value === null) return 'Not scored'
  if (value >= 0.8) return 'High confidence'
  if (value >= 0.55) return 'Medium confidence'
  return 'Low confidence'
}

function RecordTraceability({ record }: { record: ClientBrainV2Record }) {
  return (
    <details className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] text-white/34">
      <summary className="cursor-pointer select-none font-medium text-white/38 hover:text-white/58">Record traceability</summary>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge status={record.status} />
        <span>{confidenceLabel(record.confidence)}</span>
        <span>{humanizeClientBrainV2Value(record.knowledge_class)}</span>
        {record.last_verified_at && <span>Verified {formatDate(record.last_verified_at)}</span>}
        {record.review_at && <span className="text-amber-100/70">Review {formatDate(record.review_at)}</span>}
        {record.source_type && <span>Source: {humanizeClientBrainV2Value(record.source_type)}</span>}
      </div>
    </details>
  )
}

function KnowledgeRecordCard({ record }: { record: ClientBrainV2Record }) {
  const isGap = record.record_type === 'knowledge_gap'
  return (
    <article className={`rounded-lg border p-5 ${isGap ? 'border-amber-300/18 bg-amber-300/[0.04]' : 'border-white/10 bg-white/[0.035]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-emerald-100/48">
            {humanizeClientBrainV2Value(record.record_type)}
          </p>
          <h3 className="mt-1.5 text-base font-semibold text-white">{record.title}</h3>
          {record.summary && record.summary !== record.content && (
            <p className="mt-2 text-sm leading-relaxed text-white/52">{record.summary}</p>
          )}
        </div>
        {(isGap || TRUST_WARNING_STATUSES.has(record.status)) && <StatusBadge status={record.status} />}
      </div>

      {record.content && (
        <details className="mt-4" open={record.content.length < 520}>
          <summary className="cursor-pointer text-xs font-semibold text-emerald-100/65">Record detail</summary>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/55">{record.content}</div>
        </details>
      )}
      <RecordTraceability record={record} />
    </article>
  )
}

function AssetRecordCard({ record }: { record: ClientBrainV2Record }) {
  const file = record.files?.[0]
  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
      <div className="aspect-[4/3] bg-black/35">
        {file?.signed_url ? (
          // Signed Supabase URLs are short-lived and client-specific.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.signed_url} alt={record.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-5 text-center text-xs text-white/28">Preview unavailable</div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">{record.title}</h3>
            <p className="mt-1 truncate text-[11px] text-white/35">
              {file ? humanizeClientBrainV2Value(file.semantic_role) : 'Asset record'}
            </p>
          </div>
          <StatusBadge status={file?.approval_status ?? record.status} />
        </div>
      </div>
    </article>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/12 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-white/62">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-white/36">{detail}</p>
    </div>
  )
}

function OverviewValue({ field, prominent = false, editor }: { field: ClientBrainV2OverviewField; prominent?: boolean; editor?: ClientBrainV2InlineEditor }) {
  const warning = field.source && TRUST_WARNING_STATUSES.has(field.source.status)
  const editable = editorField(editor, field.id)
  const valueClass = `leading-snug text-white ${prominent ? 'text-xl font-semibold md:text-2xl' : 'text-base font-medium md:text-lg'}`
  return (
    <div className="min-w-0 px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
        {warning && <StatusBadge status={field.source!.status} />}
      </div>
      <div className="mt-2">
        {editable && editor ? (
          <InlineText
            label={field.label}
            value={editable.value ?? ''}
            placeholder={`Add ${field.label.toLowerCase()}…`}
            className={valueClass}
            onChange={value => editor.updateField({ ...editable, value })}
          />
        ) : <p className={valueClass}>{field.value ?? 'Not yet defined'}</p>}
      </div>
      {field.supporting_context && (
        <p className="mt-2 max-w-3xl text-xs leading-5 text-white/40 md:text-sm md:leading-6">{field.supporting_context}</p>
      )}
    </div>
  )
}

function OverviewSnapshot({ overview, editor }: { overview: ClientBrainV2Overview | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!overview) {
    return <EmptyState title="Client snapshot unavailable" detail="Verified overview information has not been structured yet." />
  }

  const byId = new Map(overview.fields.map(field => [field.id, field]))
  const value = (id: ClientBrainV2OverviewField['id']) => byId.get(id) ?? {
    id,
    label: humanizeClientBrainV2Value(id),
    value: null,
    supporting_context: null,
    source: null,
  }

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
      <div className="flex flex-col gap-2 border-b border-white/[0.07] px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase text-emerald-100/45">Client Snapshot</p>
          <h3 className="mt-2 text-lg font-semibold text-white">The business at a glance</h3>
        </div>
        <p className="text-xs text-white/32">Built from current Client Brain intelligence</p>
      </div>

      <div className="grid divide-y divide-white/[0.07] md:grid-cols-3 md:divide-x md:divide-y-0">
        <OverviewValue field={value('business_venue')} prominent editor={editor} />
        <OverviewValue field={value('venue_type')} editor={editor} />
        <OverviewValue field={value('location')} editor={editor} />
      </div>

      <div className="grid border-t border-white/[0.07] divide-y divide-white/[0.07] md:grid-cols-2 md:divide-x md:divide-y-0">
        <OverviewValue field={value('positioning')} prominent editor={editor} />
        <OverviewValue field={value('core_proposition')} editor={editor} />
      </div>

      <div className="grid border-t border-white/[0.07] divide-y divide-white/[0.07] md:grid-cols-2 md:divide-x md:divide-y-0">
        <OverviewValue field={value('primary_experience')} editor={editor} />
        <OverviewValue field={value('key_differentiators')} editor={editor} />
      </div>

      <div className="border-t border-white/[0.07]">
        <OverviewValue field={value('current_context')} editor={editor} />
      </div>

      <details className="border-t border-white/[0.07] px-5 py-4 text-xs text-white/34 md:px-6">
        <summary className="cursor-pointer select-none font-medium text-white/40 hover:text-white/60">
          Sources and traceability · {overview.sources.length} records
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {overview.sources.map(source => (
            <div key={source.record_id} className="rounded-md bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-white/62">{source.title}</p>
                <StatusBadge status={source.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/32">
                <span>{confidenceLabel(source.confidence)}</span>
                <span>{humanizeClientBrainV2Value(source.knowledge_class)}</span>
                {source.last_verified_at && <span>Verified {formatDate(source.last_verified_at)}</span>}
                {source.review_at && <span className="text-amber-100/65">Review {formatDate(source.review_at)}</span>}
                {source.source_type && <span>Source: {humanizeClientBrainV2Value(source.source_type)}</span>}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}

function BrandIdentityValue({ field, editor }: { field: ClientBrainV2BrandIdentityField; editor?: ClientBrainV2InlineEditor }) {
  const unresolved = field.state !== 'supported'
  const editable = editorField(editor, field.id)
  const valueClass = `leading-relaxed ${unresolved ? 'text-sm font-medium text-white/42' : 'text-base font-medium text-white md:text-lg'}`
  return (
    <div className="min-w-0 px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
        {unresolved && <StatusBadge status="needs_review" />}
      </div>
      <div className="mt-2">
        {editable && editor ? (
          <InlineText
            label={field.label}
            value={editable.value ?? ''}
            placeholder={`Add ${field.label.toLowerCase()}…`}
            className={valueClass}
            onChange={value => editor.updateField({ ...editable, value })}
          />
        ) : <p className={valueClass}>{field.value ?? (field.state === 'needs_confirmation' ? 'Needs client confirmation' : 'Not yet defined')}</p>}
      </div>
      {field.supporting_context && (
        <p className="mt-2 text-xs leading-5 text-white/40 md:text-sm md:leading-6">{field.supporting_context}</p>
      )}

      {field.sources.length > 0 && (
        <details className="mt-4 text-[11px] text-white/32">
          <summary className="cursor-pointer select-none font-medium text-white/38 hover:text-white/58">
            Supporting records · {field.sources.length}
          </summary>
          <div className="mt-2 space-y-2">
            {field.sources.map(source => (
              <div key={source.record_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-black/20 px-3 py-2">
                <span className="font-medium text-white/58">{source.title}</span>
                <span>{confidenceLabel(source.confidence)}</span>
                <span>{humanizeClientBrainV2Value(source.status)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {field.gap && (
        <details className="mt-4 border-l-2 border-amber-300/25 pl-3 text-[11px] text-white/38">
          <summary className="cursor-pointer select-none font-medium text-amber-100/70">Knowledge gap</summary>
          <p className="mt-2 font-medium text-white/58">{field.gap.title}</p>
          {field.gap.why_it_matters && <p className="mt-1 leading-5">{field.gap.why_it_matters}</p>}
          {field.gap.recommended_resolution && (
            <p className="mt-2 leading-5"><span className="text-white/52">Resolve:</span> {field.gap.recommended_resolution}</p>
          )}
        </details>
      )}
    </div>
  )
}

function BrandIdentityWorkspace({ brandIdentity, editor }: { brandIdentity: ClientBrainV2BrandIdentity | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!brandIdentity) {
    return <EmptyState title="Brand Identity unavailable" detail="Approved Brand Identity information has not been structured yet." />
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {CLIENT_BRAIN_V2_BRAND_IDENTITY_GROUPS.map(group => {
        const fields = brandIdentity.fields.filter(field => field.group === group.id)
        return (
          <section key={group.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
            <div className="border-b border-white/[0.07] px-5 py-4 md:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{group.label}</p>
            </div>
            <div className="divide-y divide-white/[0.07]">
              {fields.map(field => <BrandIdentityValue key={field.id} field={field} editor={editor} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function AudienceSources({ sources }: { sources: ClientBrainV2AudienceField['sources'] }) {
  if (sources.length === 0) return null
  return (
    <details className="mt-4 text-[11px] text-white/32">
      <summary className="cursor-pointer select-none font-medium text-white/38 hover:text-white/58">
        Supporting records · {sources.length}
      </summary>
      <div className="mt-2 space-y-2">
        {sources.map(source => (
          <div key={source.record_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-black/20 px-3 py-2">
            <span className="font-medium text-white/58">{source.title}</span>
            <span>{confidenceLabel(source.confidence)}</span>
            {TRUST_WARNING_STATUSES.has(source.status) ? <StatusBadge status={source.status} /> : <span>{humanizeClientBrainV2Value(source.status)}</span>}
          </div>
        ))}
      </div>
    </details>
  )
}

function AudienceSegmentRow({
  segment,
  item,
  itemIndex,
  segmentField,
  editor,
}: {
  segment?: ClientBrainV2AudienceSegment
  item?: Record<string, unknown>
  itemIndex?: number
  segmentField?: ClientBrainV2EditField
  editor?: ClientBrainV2InlineEditor
}) {
  const name = String(item?.name ?? segment?.name ?? '')
  const importance = String(item?.importance ?? segment?.importance ?? 'secondary')
  const description = String(item?.description ?? segment?.description ?? '')
  const motivation = String(item?.motivation ?? segment?.motivation ?? '')
  const occasions = String(item?.occasions ?? segment?.occasions ?? '')
  const patch = (values: Record<string, unknown>) => {
    if (editor && segmentField && itemIndex !== undefined) patchEditorItem(editor, segmentField, itemIndex, values)
  }
  return (
    <article className="group px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-[12rem] flex-1">
          {editor ? <InlineText label="Segment name" value={name} onChange={value => patch({ name: value })} placeholder="Add audience segment…" className="text-base font-semibold text-white" /> : <h4 className="text-base font-semibold text-white">{name}</h4>}
        </div>
        {editor ? (
          <InlineSelect label={`${name || 'Audience'} classification`} value={importance} onChange={value => patch({ importance: value })}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="unconfirmed">Unconfirmed</option>
          </InlineSelect>
        ) : <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${importance === 'primary' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white/48'}`}>{humanizeClientBrainV2Value(importance)}</span>}
        {editor && segmentField && itemIndex !== undefined && <InlineRemoveButton label={`Remove ${name || 'audience segment'}`} onClick={() => editor.updateField({ ...segmentField, items: removeAt(segmentField.items ?? [], itemIndex) })} />}
      </div>
      {editor ? <div className="mt-2"><InlineText label={`${name || 'Audience'} description`} value={description} onChange={value => patch({ description: value })} placeholder="Add segment description…" /></div> : description && <p className="mt-2 text-sm leading-6 text-white/52">{description}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase text-emerald-100/40">Core motivation</p>
          {editor ? <div className="mt-1.5"><InlineText label={`${name || 'Audience'} core motivation`} value={motivation} onChange={value => patch({ motivation: value })} placeholder="Add core motivation…" className="text-xs leading-5 text-white/42" /></div> : <p className="mt-1.5 text-xs leading-5 text-white/42">{motivation || 'Not yet defined'}</p>}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-emerald-100/40">Main occasions</p>
          {editor ? <div className="mt-1.5"><InlineText label={`${name || 'Audience'} main occasions`} value={occasions} onChange={value => patch({ occasions: value })} placeholder="Add main occasions…" className="text-xs leading-5 text-white/42" /></div> : <p className="mt-1.5 text-xs leading-5 text-white/42">{occasions || 'Not yet defined'}</p>}
        </div>
      </div>
      {segment?.source && <AudienceSources sources={[segment.source]} />}
    </article>
  )
}

function AudienceInsight({ field, editor }: { field: ClientBrainV2AudienceField; editor?: ClientBrainV2InlineEditor }) {
  const warning = field.sources.some(source => TRUST_WARNING_STATUSES.has(source.status))
  const unresolved = field.state !== 'supported'
  const editable = editorField(editor, field.id)
  return (
    <div className="px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
        {(warning || unresolved) && <StatusBadge status="needs_review" />}
      </div>
      {field.supporting_context && <p className="mt-2 text-sm leading-6 text-white/52">{field.supporting_context}</p>}
      {editable && editor ? (
        <InlineList label={field.label} values={editable.values ?? []} onChange={values => editor.updateField({ ...editable, values })} />
      ) : field.values.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-white/52">
          {field.values.map(value => <li key={value} className="border-l border-emerald-300/20 pl-3">{value}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-sm font-medium text-white/42">Not yet defined</p>
      )}
      <AudienceSources sources={field.sources} />
      {field.gap && (
        <details className="mt-4 border-l-2 border-amber-300/25 pl-3 text-[11px] text-white/38">
          <summary className="cursor-pointer select-none font-medium text-amber-100/70">Existing knowledge gap</summary>
          <p className="mt-2 font-medium text-white/58">{field.gap.title}</p>
          {field.gap.why_it_matters && <p className="mt-1 leading-5">{field.gap.why_it_matters}</p>}
        </details>
      )}
    </div>
  )
}

function AudienceWorkspace({ audience, editor }: { audience: ClientBrainV2Audience | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!audience) return <EmptyState title="Audience unavailable" detail="Approved audience intelligence has not been structured yet." />
  const segmentField = editorField(editor, 'segments')
  const editableSegments = segmentField?.items ?? []
  const segmentRows = editor ? editableSegments.map((item, itemIndex) => ({
    item,
    itemIndex,
    segment: audience.segments.find(segment => segment.id === item.recordId),
    importance: String(item.importance ?? 'secondary'),
  })) : audience.segments.map(segment => ({ segment, item: undefined, itemIndex: undefined, importance: segment.importance }))
  const primary = segmentRows.filter(segment => segment.importance === 'primary')
  const secondary = segmentRows.filter(segment => segment.importance !== 'primary')
  const field = (id: ClientBrainV2AudienceField['id']) => audience.fields.find(item => item.id === id)

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028] xl:col-span-2">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Who We Serve</p>
          <p className="mt-2 text-xs text-white/34">Priority follows the current approved Client Brain importance, without invented audience shares.</p>
        </div>
        <div className="grid xl:grid-cols-2 xl:divide-x xl:divide-white/[0.07]">
          <div>
            <div className="border-b border-white/[0.07] px-5 py-3 md:px-6"><p className="text-[10px] font-semibold uppercase text-white/34">Primary Audiences</p></div>
            <div className="divide-y divide-white/[0.07]">{primary.map(row => <AudienceSegmentRow key={String(row.item?.recordId ?? row.segment?.id ?? row.itemIndex)} {...row} segmentField={segmentField} editor={editor} />)}</div>
          </div>
          <div className="border-t border-white/[0.07] xl:border-t-0">
            <div className="border-b border-white/[0.07] px-5 py-3 md:px-6"><p className="text-[10px] font-semibold uppercase text-white/34">Secondary Audiences</p></div>
            <div className="divide-y divide-white/[0.07]">{secondary.map(row => <AudienceSegmentRow key={String(row.item?.recordId ?? row.segment?.id ?? row.itemIndex)} {...row} segmentField={segmentField} editor={editor} />)}</div>
          </div>
        </div>
        {editor && segmentField && <div className="border-t border-white/[0.07] px-5 py-2 md:px-6"><InlineAddButton label="Add segment" onClick={() => editor.updateField({ ...segmentField, items: [...(segmentField.items ?? []), { name: '', description: '', importance: 'secondary', motivation: '', occasions: '' }] })} /></div>}
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Why They Come</p></div>
        <div className="divide-y divide-white/[0.07]">
          {field('needs_motivations') && <AudienceInsight field={field('needs_motivations')!} editor={editor} />}
          {field('decision_drivers') && <AudienceInsight field={field('decision_drivers')!} editor={editor} />}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">When / How They Use the Brand</p></div>
        <div className="divide-y divide-white/[0.07]">
          {field('occasions_use_cases') && <AudienceInsight field={field('occasions_use_cases')!} editor={editor} />}
          {field('geographic_behavioral_context') && <AudienceInsight field={field('geographic_behavioral_context')!} editor={editor} />}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028] xl:col-span-2">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Friction</p></div>
        {field('barriers_objections') && <AudienceInsight field={field('barriers_objections')!} editor={editor} />}
      </section>
    </div>
  )
}

function VisualDnaValue({ field, editor }: { field: ClientBrainV2VisualDnaField; editor?: ClientBrainV2InlineEditor }) {
  const editable = editorField(editor, field.id)
  const editableRules = editable?.items ?? []
  return (
    <div className="px-5 py-5 md:px-6">
      <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
      {editable && editable.kind === 'list' && editor ? (
        <InlineList label={field.label} values={editable.values ?? []} onChange={values => editor.updateField({ ...editable, values })} />
      ) : field.values.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-white/52">
          {field.values.map(value => <li key={value} className="border-l border-emerald-300/20 pl-3">{value}</li>)}
        </ul>
      )}
      {editable && editable.kind === 'rules' && editor ? (
        <div className="mt-3 space-y-2">
          {(editableRules.length > 0 ? editableRules : [{ text: '', strength: 'preference' }]).map((rule, index) => {
            const strength = String(rule.strength ?? 'preference')
            const patchRule = (values: Record<string, unknown>) => editableRules.length > 0
              ? patchEditorItem(editor, editable, index, values)
              : editor.updateField({ ...editable, items: [{ ...rule, ...values }] })
            return <div key={index} className={`group flex items-start gap-2 rounded-md border px-3 py-2.5 ${strength === 'hard_guardrail' ? 'border-red-300/15 bg-red-300/[0.035]' : 'border-white/[0.07] bg-black/15'}`}>
              <InlineSelect label={`${field.label} rule ${index + 1} strength`} value={strength} onChange={value => patchRule({ strength: value })}>
                {VISUAL_RULE_STRENGTHS.map(value => <option key={value} value={value}>{humanizeClientBrainV2Value(value)}</option>)}
              </InlineSelect>
              <div className="min-w-0 flex-1"><InlineText label={`${field.label} rule ${index + 1}`} value={String(rule.text ?? '')} onChange={value => patchRule({ text: value })} placeholder="Add creative rule…" className="text-xs leading-5 text-white/50" /></div>
              <InlineRemoveButton label={`Remove ${field.label} rule ${index + 1}`} onClick={() => editor.updateField({ ...editable, items: removeAt(editableRules.length > 0 ? editableRules : [rule], index) })} />
            </div>
          })}
          <InlineAddButton label="Add rule" onClick={() => editor.updateField({ ...editable, items: [...editableRules, { text: '', strength: 'preference' }] })} />
        </div>
      ) : field.rules.length > 0 && (
        <div className="mt-3 space-y-2">
          {field.rules.map(rule => (
            <div key={`${rule.strength}:${rule.text}`} className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${rule.strength === 'hard' ? 'border-red-300/15 bg-red-300/[0.035]' : 'border-white/[0.07] bg-black/15'}`}>
              <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${rule.strength === 'hard' ? 'border-red-300/20 text-red-100/70' : 'border-white/10 text-white/38'}`}>
                {rule.strength}
              </span>
              <p className="text-xs leading-5 text-white/50">{rule.text}</p>
            </div>
          ))}
        </div>
      )}
      {!editable && field.values.length === 0 && field.rules.length === 0 && <p className="mt-2 text-sm font-medium text-white/42">Not yet defined</p>}
      <AudienceSources sources={field.sources} />
    </div>
  )
}

function VisualDnaWorkspace({ visualDna, editor }: { visualDna: ClientBrainV2VisualDna | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!visualDna) return <EmptyState title="Visual DNA unavailable" detail="Approved visual intelligence has not been structured yet." />
  const groupFields = (groupId: typeof CLIENT_BRAIN_V2_VISUAL_DNA_GROUPS[number]['id']) => visualDna.fields.filter(field => field.group === groupId)
  const categoryLabel = (category: string | null) => category ? humanizeClientBrainV2Value(category) : 'Visual reference'

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028] xl:col-span-2">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Visual World</p></div>
        {groupFields('visual_world').map(field => <VisualDnaValue key={field.id} field={field} editor={editor} />)}
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028] xl:col-span-2">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Image Language</p></div>
        <div className="grid divide-y divide-white/[0.07] xl:grid-cols-3 xl:divide-x xl:divide-y-0">
          {groupFields('image_language').map(field => <VisualDnaValue key={field.id} field={field} editor={editor} />)}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">People & Hospitality</p></div>
        {groupFields('people_hospitality').map(field => <VisualDnaValue key={field.id} field={field} editor={editor} />)}
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
        <div className="border-b border-white/[0.07] px-5 py-4 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Creative Boundaries</p></div>
        {groupFields('creative_boundaries').map(field => <VisualDnaValue key={field.id} field={field} editor={editor} />)}
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028] xl:col-span-2">
        <div className="flex flex-col gap-2 border-b border-white/[0.07] px-5 py-4 md:flex-row md:items-end md:justify-between md:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">Relevant Truth References</p>
            <p className="mt-2 text-xs leading-5 text-white/34">Approved product references anchor food and drink identity without replacing persistent Visual DNA.</p>
          </div>
        </div>
        {visualDna.asset_references.length > 0 ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 md:p-6">
            {visualDna.asset_references.map(asset => (
              <article key={asset.record_id} className="overflow-hidden rounded-md border border-white/[0.08] bg-black/20">
                <div className="aspect-[4/3] bg-black/25">
                  {asset.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.signed_url} alt={asset.title} className="h-full w-full object-cover" />
                  ) : <div className="flex h-full items-center justify-center text-xs text-white/28">Preview unavailable</div>}
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-medium text-white/62">{asset.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-white/34">
                    <span>{categoryLabel(asset.category)}</span>
                    <span>{humanizeClientBrainV2Value(asset.semantic_role)}</span>
                    <StatusBadge status={asset.approval_status} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="px-5 py-8 text-sm text-white/40 md:px-6">No approved truth references are connected.</div>}
        {visualDna.asset_gap && (
          <details className="border-t border-amber-300/15 px-5 py-4 text-[11px] text-white/38 md:px-6">
            <summary className="cursor-pointer select-none font-medium text-amber-100/70">Reference coverage gap</summary>
            <p className="mt-2 font-medium text-white/58">{visualDna.asset_gap.title}</p>
            {visualDna.asset_gap.why_it_matters && <p className="mt-1 max-w-3xl leading-5">{visualDna.asset_gap.why_it_matters}</p>}
          </details>
        )}
      </section>
    </div>
  )
}

function CommercialStrategySources({ sources }: { sources: ClientBrainV2CommercialStrategySource[] }) {
  if (sources.length === 0) return null
  return (
    <details className="mt-4 text-[11px] text-white/32">
      <summary className="cursor-pointer select-none font-medium text-white/38 hover:text-white/58">
        Sources and freshness · {sources.length}
      </summary>
      <div className="mt-2 space-y-2">
        {sources.map(source => (
          <div key={source.record_id} className="rounded-md bg-black/20 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-white/58">{source.title}</span>
              <span>{confidenceLabel(source.confidence)}</span>
              <StatusBadge status={source.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-white/28">
              <span>{humanizeClientBrainV2Value(source.knowledge_class)}</span>
              {source.effective_date && <span>Effective {formatDate(source.effective_date)}</span>}
              {source.last_verified_at && <span>Verified {formatDate(source.last_verified_at)}</span>}
              {source.valid_until && <span>Valid until {formatDate(source.valid_until)}</span>}
              {source.review_at && <span className="text-amber-100/65">Review {formatDate(source.review_at)}</span>}
              {source.source_type && <span>Source: {humanizeClientBrainV2Value(source.source_type)}</span>}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function CommercialStrategyValue({ field, editor }: { field: ClientBrainV2CommercialStrategyField; editor?: ClientBrainV2InlineEditor }) {
  const editable = editorField(editor, field.id)
  return (
    <div className="px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
        <StatusBadge status={field.state} />
      </div>

      {editable && editor ? (
        <InlineList label={field.label} values={editable.values ?? []} onChange={values => editor.updateField({ ...editable, values })} />
      ) : field.statements.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-white/54">
          {field.statements.map(statement => <li key={statement} className="border-l border-emerald-300/20 pl-3">{statement}</li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-medium text-white/42">Not yet defined</p>
      )}
      {field.supporting_context && <p className="mt-3 max-w-4xl text-xs leading-5 text-white/38">{field.supporting_context}</p>}

      {field.linked_objects.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <p className="text-[10px] font-semibold uppercase text-white/30">
            {field.linked_objects[0]?.relationship === 'priority_candidate' ? 'Priority candidates — confirmation required' : 'Related commercial objects'}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {field.linked_objects.map(object => {
              const price = object.price_amount != null
                ? `${object.currency ?? ''} ${Number(object.price_amount).toLocaleString('en-AE')}`.trim()
                : null
              return (
                <div key={`${field.id}:${object.record_id}`} className="rounded-md border border-white/[0.07] bg-black/15 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white/62">{object.title}</p>
                      <p className="mt-1 text-[10px] text-white/30">{humanizeClientBrainV2Value(object.object_type)}{price ? ` · ${price}` : ''}</p>
                    </div>
                    <StatusBadge status={object.status} />
                  </div>
                  {object.review_at && <p className="mt-2 text-[10px] text-amber-100/55">Review {formatDate(object.review_at)}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <CommercialStrategySources sources={field.sources} />
      {field.gaps.length > 0 && (
        <details className="mt-4 border-l-2 border-amber-300/25 pl-3 text-[11px] text-white/38">
          <summary className="cursor-pointer select-none font-medium text-amber-100/70">Open knowledge gaps · {field.gaps.length}</summary>
          <div className="mt-2 space-y-3">
            {field.gaps.map(gap => (
              <div key={gap.record_id}>
                <p className="font-medium text-white/58">{gap.title}</p>
                {gap.why_it_matters && <p className="mt-1 leading-5">{gap.why_it_matters}</p>}
                {gap.recommended_resolution && <p className="mt-1 leading-5"><span className="text-white/52">Resolve:</span> {gap.recommended_resolution}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function CommercialStrategyWorkspace({ commercialStrategy, editor }: { commercialStrategy: ClientBrainV2CommercialStrategy | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!commercialStrategy) return <EmptyState title="Commercial Strategy unavailable" detail="Commercial intelligence has not been structured yet." />
  const groupFields = (groupId: typeof CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_GROUPS[number]['id']) => (
    commercialStrategy.fields.filter(field => field.group === groupId)
  )
  const lifecycle = commercialStrategy.lifecycle_counts

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] px-5 py-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/58">Dynamic Intelligence</p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              {lifecycle.active > 0 ? 'Current strategy with review-sensitive areas' : 'No current client-confirmed strategy'}
            </h3>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">
              Commercial objects and legacy opportunities are visible for context, but remain review-sensitive until management confirms current priorities, dates, and outcomes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lifecycle.active > 0 && <span className={STATUS_STYLES.active + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{lifecycle.active} Active</span>}
            {lifecycle.needs_review > 0 && <span className={STATUS_STYLES.needs_review + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{lifecycle.needs_review} Needs Review</span>}
            {lifecycle.not_defined > 0 && <span className={STATUS_STYLES.not_defined + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{lifecycle.not_defined} Not Defined</span>}
            {lifecycle.historical > 0 && <span className={STATUS_STYLES.historical + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{lifecycle.historical} Historical</span>}
          </div>
        </div>
      </section>

      {CLIENT_BRAIN_V2_COMMERCIAL_STRATEGY_GROUPS.map(group => (
        <section key={group.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
          <div className="border-b border-white/[0.07] px-5 py-4 md:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{group.label}</p>
          </div>
          <div className={`grid divide-y divide-white/[0.07] ${group.id === 'revenue_demand' ? 'xl:grid-cols-3 xl:divide-x xl:divide-y-0' : 'xl:grid-cols-2 xl:divide-x xl:divide-y-0'}`}>
            {groupFields(group.id).map(field => <CommercialStrategyValue key={field.id} field={field} editor={editor} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function OperationsSources({ sources }: { sources: ClientBrainV2OperationsSource[] }) {
  if (sources.length === 0) return null
  return (
    <details className="mt-4 text-[11px] text-white/32">
      <summary className="cursor-pointer select-none font-medium text-white/38 hover:text-white/58">
        Sources and freshness · {sources.length}
      </summary>
      <div className="mt-2 space-y-2">
        {sources.map(source => (
          <div key={source.record_id} className="rounded-md bg-black/20 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-white/58">{source.title}</span>
              <StatusBadge status={source.status} />
              <span>Authority {source.authority_rank}</span>
              <span>{source.source_role === 'evidence' ? 'Current evidence' : 'Verification source'}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-white/28">
              <span>{confidenceLabel(source.confidence)}</span>
              {source.effective_date && <span>Effective {formatDate(source.effective_date)}</span>}
              {source.last_verified_at && <span>Verified {formatDate(source.last_verified_at)}</span>}
              {source.valid_until && <span>Valid until {formatDate(source.valid_until)}</span>}
              {source.review_at && <span className="text-amber-100/65">Review {formatDate(source.review_at)}</span>}
              {source.source_type && <span>Source: {humanizeClientBrainV2Value(source.source_type)}</span>}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function OperationsValue({ field, editor }: { field: ClientBrainV2OperationsField; editor?: ClientBrainV2InlineEditor }) {
  const editable = editorField(editor, field.id)
  const editableFacts = editable?.items ?? []
  const facts = editable && editor ? editableFacts : field.facts
  return (
    <div className="px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
        <StatusBadge status={field.state} />
      </div>

      {facts.length > 0 ? (
        <dl className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {facts.map((fact, index) => (
            <div key={`${String(fact.label)}:${index}`} className="group grid gap-1 py-3 sm:grid-cols-[145px_minmax(0,1fr)_40px] sm:gap-4">
              <dt className="text-[11px] font-medium text-white/34">
                {editable && editor ? <InlineText label={`${field.label} fact ${index + 1} label`} value={String(fact.label ?? '')} onChange={value => patchEditorItem(editor, editable, index, { label: value })} placeholder="Fact label…" className="text-[11px] font-medium text-white/34" /> : String(fact.label)}
              </dt>
              <dd className="min-w-0">
                <div className="flex flex-wrap items-start gap-2">
                  {editable && editor ? <div className="min-w-0 flex-1"><InlineText label={`${field.label} fact ${index + 1} value`} value={String(fact.value ?? '')} onChange={value => patchEditorItem(editor, editable, index, { value })} placeholder="Add current value…" className="text-sm leading-5 text-white/60" /></div> : <span className="text-sm leading-5 text-white/60">{String(fact.value ?? '')}</span>}
                  {'state' in fact && fact.state !== field.state && <StatusBadge status={String(fact.state)} />}
                </div>
                {editable && editor ? <div className="mt-1"><InlineText label={`${field.label} fact ${index + 1} note`} value={String(fact.note ?? '')} onChange={value => patchEditorItem(editor, editable, index, { note: value })} placeholder="Add internal context…" className="text-[11px] leading-5 text-white/34" /></div> : Boolean(fact.note) && <p className="mt-1 text-[11px] leading-5 text-white/34">{String(fact.note)}</p>}
              </dd>
              {editable && editor && <InlineRemoveButton label={`Remove ${field.label} fact ${index + 1}`} onClick={() => editor.updateField({ ...editable, items: removeAt(editableFacts, index) })} />}
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm font-medium text-white/42">Not yet defined</p>
      )}
      {editable && editor && <div className="mt-2"><InlineAddButton label="Add fact" onClick={() => editor.updateField({ ...editable, items: [...editableFacts, { label: '', value: '', note: '' }] })} /></div>}

      {field.supporting_context && <p className="mt-3 max-w-4xl text-xs leading-5 text-white/38">{field.supporting_context}</p>}

      {field.linked_objects.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <p className="text-[10px] font-semibold uppercase text-white/30">Related Products & Offers records</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {field.linked_objects.map(object => (
              <div key={`${field.id}:${object.record_id}`} className="rounded-md border border-white/[0.07] bg-black/15 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white/62">{object.title}</p>
                    <p className="mt-1 text-[10px] text-white/30">{humanizeClientBrainV2Value(object.object_type)} · {humanizeClientBrainV2Value(object.relationship)}</p>
                  </div>
                  <StatusBadge status={object.status} />
                </div>
                {object.availability && <p className="mt-2 text-[10px] leading-4 text-white/36">{object.availability}</p>}
                {object.capacity != null && <p className="mt-2 text-[10px] text-white/36">Capacity {object.capacity}</p>}
                {object.booking_requirements && <p className="mt-2 text-[10px] leading-4 text-white/36">{object.booking_requirements}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <OperationsSources sources={field.sources} />
      {field.gaps.length > 0 && (
        <details className="mt-4 border-l-2 border-amber-300/25 pl-3 text-[11px] text-white/38">
          <summary className="cursor-pointer select-none font-medium text-amber-100/70">Open knowledge gaps · {field.gaps.length}</summary>
          <div className="mt-2 space-y-3">
            {field.gaps.map(gap => (
              <div key={gap.record_id}>
                <p className="font-medium text-white/58">{gap.title}</p>
                {gap.why_it_matters && <p className="mt-1 leading-5">{gap.why_it_matters}</p>}
                {gap.recommended_resolution && <p className="mt-1 leading-5"><span className="text-white/52">Resolve:</span> {gap.recommended_resolution}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function OperationsWorkspace({ operations, editor }: { operations: ClientBrainV2Operations | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!operations) return <EmptyState title="Operations unavailable" detail="Operational intelligence has not been structured yet." />
  const groupFields = (groupId: typeof CLIENT_BRAIN_V2_OPERATIONS_GROUPS[number]['id']) => (
    operations.fields.filter(field => field.group === groupId)
  )
  const counts = operations.state_counts

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] px-5 py-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/58">Freshness-aware operating truth</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Customer-facing facts require verification</h3>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">
              Known evidence is visible without becoming a public claim. Contact details, schedules, policies and capabilities remain blocked from canonical use until their current source is confirmed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.verified > 0 && <span className={STATUS_STYLES.verified + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.verified} Verified</span>}
            {counts.needs_review > 0 && <span className={STATUS_STYLES.needs_review + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.needs_review} Needs Review</span>}
            {counts.conflict > 0 && <span className={STATUS_STYLES.conflict + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.conflict} Conflict</span>}
            {counts.not_defined > 0 && <span className={STATUS_STYLES.not_defined + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.not_defined} Not Defined</span>}
          </div>
        </div>
      </section>

      {CLIENT_BRAIN_V2_OPERATIONS_GROUPS.map(group => (
        <section key={group.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
          <div className="border-b border-white/[0.07] px-5 py-4 md:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{group.label}</p>
          </div>
          <div className="grid divide-y divide-white/[0.07] xl:grid-cols-2 xl:divide-x xl:divide-y-0">
            {groupFields(group.id).map(field => <OperationsValue key={field.id} field={field} editor={editor} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function MarketSources({ sources }: { sources: ClientBrainV2MarketSource[] }) {
  if (sources.length === 0) return null
  return (
    <details className="mt-4 text-[11px] text-white/32">
      <summary className="cursor-pointer select-none font-medium text-white/38 hover:text-white/58">
        Sources and temporal evidence · {sources.length}
      </summary>
      <div className="mt-2 space-y-2">
        {sources.map(source => (
          <div key={source.record_id} className="rounded-md bg-black/20 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-white/58">{source.title}</span>
              <StatusBadge status={source.status} />
              <span>Authority {source.authority_rank}</span>
              <span>{source.source_role === 'evidence' ? 'Evidence record' : 'Verification source'}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-white/28">
              <span>{confidenceLabel(source.confidence)}</span>
              {source.observed_at ? <span>Observed {formatDate(source.observed_at)}</span> : <span className="text-amber-100/55">Observed date not stored</span>}
              {source.last_verified_at && <span>Verified {formatDate(source.last_verified_at)}</span>}
              {source.valid_until && <span>Valid until {formatDate(source.valid_until)}</span>}
              {source.review_at && <span className="text-amber-100/65">Review {formatDate(source.review_at)}</span>}
              {source.source_type && <span>Source: {humanizeClientBrainV2Value(source.source_type)}</span>}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function MarketIntelligenceValue({ field, editor }: { field: ClientBrainV2MarketIntelligenceField; editor?: ClientBrainV2InlineEditor }) {
  const competitorSets = [...new Set(field.competitors.map(competitor => competitor.comparison_set))]
  const editable = editorField(editor, field.id)
  const editableItems = editable?.items ?? []
  return (
    <div className="px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{field.label}</p>
        <StatusBadge status={field.state} />
      </div>

      {editable && editor && (
        <div className="mt-4 space-y-2">
          {editableItems.map((item, index) => {
            const itemType = String(item.itemType ?? 'signal')
            const status = String(item.status ?? 'current')
            return <div key={String(item.recordId ?? item.record_id ?? index)} className="group rounded-md border border-white/[0.07] bg-black/15 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <InlineSelect label={`${field.label} entry ${index + 1} type`} value={itemType} onChange={value => patchEditorItem(editor, editable, index, { itemType: value })}>
                  <option value="signal">Market signal</option>
                  <option value="competitor">Competitor</option>
                </InlineSelect>
                {itemType === 'signal' ? <InlineSelect label={`${field.label} entry ${index + 1} signal type`} value={String(item.kind ?? 'observation')} onChange={value => patchEditorItem(editor, editable, index, { kind: value })}>
                  <option value="observation">Observation</option><option value="analysis">Analysis</option><option value="opportunity">Opportunity</option><option value="threat">Threat</option>
                </InlineSelect> : <InlineSelect label={`${field.label} entry ${index + 1} classification`} value={String(item.classification ?? 'unclassified')} onChange={value => patchEditorItem(editor, editable, index, { classification: value })}>
                  <option value="direct">Direct</option><option value="indirect">Indirect</option><option value="aspirational">Aspirational</option><option value="unclassified">Unclassified</option>
                </InlineSelect>}
                <InlineSelect label={`${field.label} entry ${index + 1} status`} value={status} onChange={value => patchEditorItem(editor, editable, index, { status: value })}>
                  <option value="current">Current</option><option value="needs_review">Needs Review</option><option value="historical">Historical</option><option value="expired">Expired</option><option value="superseded">Superseded</option>
                </InlineSelect>
                <label className="flex min-h-9 items-center gap-2 rounded-full border border-white/10 px-2.5 text-[10px] text-white/38">
                  Observed
                  <input type="date" aria-label={`${field.label} entry ${index + 1} observed date`} value={String(item.observed_at ?? '')} onChange={event => patchEditorItem(editor, editable, index, { observed_at: event.target.value })} className="bg-transparent text-white/60 outline-none" />
                </label>
                <div className="ml-auto"><InlineRemoveButton label={`Remove ${field.label} entry ${index + 1}`} onClick={() => editor.updateField({ ...editable, items: removeAt(editableItems, index) })} /></div>
              </div>
              {itemType === 'competitor' ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InlineText label={`${field.label} competitor ${index + 1} name`} value={String(item.name ?? '')} onChange={value => patchEditorItem(editor, editable, index, { name: value })} placeholder="Competitor name…" className="text-sm font-medium text-white/62" />
                <InlineText label={`${field.label} competitor ${index + 1} comparison set`} value={String(item.comparison_set ?? '')} onChange={value => patchEditorItem(editor, editable, index, { comparison_set: value })} placeholder="Comparison set…" className="text-xs text-white/42" />
              </div> : <div className="mt-3"><InlineText label={`${field.label} signal ${index + 1}`} value={String(item.text ?? '')} onChange={value => patchEditorItem(editor, editable, index, { text: value })} placeholder="Add market signal…" /></div>}
            </div>
          })}
          <InlineAddButton label="Add entry" onClick={() => editor.updateField({ ...editable, items: [...editableItems, { itemType: 'signal', text: '', kind: field.id === 'opportunities' ? 'opportunity' : field.id === 'threats' ? 'threat' : 'observation', status: 'current', observed_at: '' }] })} />
        </div>
      )}

      {!editable && field.signals.length > 0 && (
        <div className="mt-4 space-y-2">
          {field.signals.map((signal, index) => (
            <div key={`${signal.kind}:${index}`} className="rounded-md border border-white/[0.07] bg-black/15 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="font-semibold uppercase text-emerald-100/45">{humanizeClientBrainV2Value(signal.kind)}</span>
                <StatusBadge status={signal.status} />
                <span className="text-white/28">{confidenceLabel(signal.confidence)}</span>
                <span className={signal.observed_at ? 'text-white/28' : 'text-amber-100/55'}>
                  {signal.observed_at ? `Observed ${formatDate(signal.observed_at)}` : 'Observed date not stored'}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/56">{signal.text}</p>
            </div>
          ))}
        </div>
      )}

      {!editable && competitorSets.length > 0 && (
        <div className="mt-4 space-y-4">
          {competitorSets.map(setName => (
            <div key={setName}>
              <p className="text-[10px] font-semibold uppercase text-white/30">{setName}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {field.competitors.filter(competitor => competitor.comparison_set === setName).map(competitor => (
                  <div key={competitor.name} className="rounded-md border border-white/[0.07] bg-black/15 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-white/62">{competitor.name}</p>
                      <StatusBadge status={competitor.status} />
                    </div>
                    <p className="mt-2 text-[10px] text-amber-100/55">Classification not validated</p>
                    <p className="mt-1 text-[10px] text-white/28">
                      {competitor.observed_at ? `Observed ${formatDate(competitor.observed_at)}` : 'Observed date not stored'} · {confidenceLabel(competitor.confidence)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!editable && field.signals.length === 0 && field.competitors.length === 0 && (
        <p className="mt-3 text-sm font-medium text-white/42">Not yet defined</p>
      )}
      {field.supporting_context && <p className="mt-3 max-w-4xl text-xs leading-5 text-white/38">{field.supporting_context}</p>}

      <MarketSources sources={field.sources} />
      {field.gaps.length > 0 && (
        <details className="mt-4 border-l-2 border-amber-300/25 pl-3 text-[11px] text-white/38">
          <summary className="cursor-pointer select-none font-medium text-amber-100/70">Open knowledge gaps · {field.gaps.length}</summary>
          <div className="mt-2 space-y-3">
            {field.gaps.map(gap => (
              <div key={gap.record_id}>
                <p className="font-medium text-white/58">{gap.title}</p>
                {gap.why_it_matters && <p className="mt-1 leading-5">{gap.why_it_matters}</p>}
                {gap.recommended_resolution && <p className="mt-1 leading-5"><span className="text-white/52">Resolve:</span> {gap.recommended_resolution}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function MarketIntelligenceWorkspace({ marketIntelligence, editor }: { marketIntelligence: ClientBrainV2MarketIntelligence | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  if (!marketIntelligence) return <EmptyState title="Market Intelligence unavailable" detail="External market intelligence has not been structured yet." />
  const groupFields = (groupId: typeof CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_GROUPS[number]['id']) => (
    marketIntelligence.fields.filter(field => field.group === groupId)
  )
  const counts = marketIntelligence.state_counts

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] px-5 py-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/58">Temporal external intelligence</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Existing research needs a current evidence pass</h3>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">
              Comparison sets, review signals and opportunities are retained as dated-or-undated evidence. Missing observation dates and absent current activity prevent them from becoming permanent market truth.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.current > 0 && <span className={STATUS_STYLES.current + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.current} Current</span>}
            {counts.needs_review > 0 && <span className={STATUS_STYLES.needs_review + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.needs_review} Needs Review</span>}
            {counts.historical > 0 && <span className={STATUS_STYLES.historical + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.historical} Historical</span>}
            {counts.expired > 0 && <span className={STATUS_STYLES.expired + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.expired} Expired</span>}
            {counts.superseded > 0 && <span className={STATUS_STYLES.superseded + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.superseded} Superseded</span>}
            {counts.not_defined > 0 && <span className={STATUS_STYLES.not_defined + ' rounded-full border px-2.5 py-1 text-[10px] font-semibold'}>{counts.not_defined} Not Defined</span>}
          </div>
        </div>
      </section>

      {CLIENT_BRAIN_V2_MARKET_INTELLIGENCE_GROUPS.map(group => (
        <section key={group.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.028]">
          <div className="border-b border-white/[0.07] px-5 py-4 md:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{group.label}</p>
          </div>
          <div className={`grid divide-y divide-white/[0.07] ${group.id === 'market' || group.id === 'competition' ? 'xl:grid-cols-3 xl:divide-x xl:divide-y-0' : 'xl:grid-cols-2 xl:divide-x xl:divide-y-0'}`}>
            {groupFields(group.id).map(field => <MarketIntelligenceValue key={field.id} field={field} editor={editor} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

const GAP_PRIORITY_STYLES = {
  high: 'border-red-300/25 bg-red-300/[0.08] text-red-100',
  medium: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100',
  low: 'border-white/10 bg-white/[0.04] text-white/48',
} as const

function GapPriorityBadge({ priority }: { priority: ClientBrainV2KnowledgeGapItem['priority_band'] }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${GAP_PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  )
}

function KnowledgeGapCard({ gap, editor, gapField, itemIndex }: { gap: ClientBrainV2KnowledgeGapItem; editor?: ClientBrainV2InlineEditor; gapField?: ClientBrainV2EditField; itemIndex?: number }) {
  const provenance = Object.entries(gap.provenance).filter(([, value]) => (
    typeof value === 'string' || typeof value === 'number'
  ))
  const patch = (values: Record<string, unknown>) => {
    if (editor && gapField && itemIndex !== undefined) patchEditorItem(editor, gapField, itemIndex, values)
  }
  return (
    <article className={`border-l-2 px-4 py-5 md:px-5 ${gap.gap_type === 'conflict' ? 'border-red-300/45 bg-red-300/[0.025]' : gap.priority_band === 'high' ? 'border-amber-300/35 bg-amber-300/[0.02]' : 'border-white/10'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {editor ? <div className="flex flex-wrap items-center gap-2">
            <InlineSelect label={`${gap.title} related area`} value={gap.related_area_id} onChange={value => patch({ related_area_id: value })}>{GAP_AREAS.map(value => <option key={value} value={value}>{humanizeClientBrainV2Value(value)}</option>)}</InlineSelect>
            <InlineSelect label={`${gap.title} gap type`} value={gap.gap_type} onChange={value => patch({ gap_type: value })}>{GAP_TYPES.map(value => <option key={value} value={value}>{humanizeClientBrainV2Value(value)}</option>)}</InlineSelect>
          </div> : <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="font-semibold uppercase text-emerald-100/48">{gap.related_area_label}</span><span className="text-white/20">/</span><span className={gap.gap_type === 'conflict' ? 'font-semibold uppercase text-red-100/75' : 'font-semibold uppercase text-white/36'}>{humanizeClientBrainV2Value(gap.gap_type)}</span>
          </div>}
          {editor ? <div className="mt-2"><InlineText label={`${gap.title} title`} value={gap.title} onChange={value => patch({ title: value })} placeholder="Add gap title…" className="text-base font-semibold text-white" /></div> : <h4 className="mt-2 text-base font-semibold text-white">{gap.title}</h4>}
        </div>
        <div className="flex flex-wrap gap-2">
          {editor ? <>
            <InlineSelect label={`${gap.title} priority`} value={String(gap.priority)} onChange={value => patch({ priority: Number(value) })}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value === 5 ? 'High' : value >= 3 ? 'Medium' : 'Low'} ({value})</option>)}</InlineSelect>
            <InlineSelect label={`${gap.title} status`} value={gap.lifecycle} onChange={value => patch({ lifecycle: value })}>{GAP_LIFECYCLES.map(value => <option key={value} value={value}>{humanizeClientBrainV2Value(value)}</option>)}</InlineSelect>
          </> : <><GapPriorityBadge priority={gap.priority_band} /><StatusBadge status={gap.lifecycle} /></>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase text-white/28">What Jarvis does not know</p>
          {editor ? <div className="mt-2"><InlineText label={`${gap.title} description`} value={gap.description ?? ''} onChange={value => patch({ description: value })} placeholder="Describe what Jarvis does not know…" /></div> : <p className="mt-2 text-sm leading-6 text-white/56">{gap.description ?? 'The unresolved information is not yet described clearly.'}</p>}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-white/28">Why it matters</p>
          {editor ? <div className="mt-2"><InlineText label={`${gap.title} why it matters`} value={gap.why_it_matters ?? ''} onChange={value => patch({ why_it_matters: value })} placeholder="Explain why this matters…" /></div> : <p className="mt-2 text-sm leading-6 text-white/56">{gap.why_it_matters ?? 'Operational impact has not yet been documented.'}</p>}
        </div>
      </div>

      <div className="mt-4 border-t border-white/[0.07] pt-4">
        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">Question to resolve</p>
        {editor ? <div className="mt-2"><InlineText label={`${gap.title} resolution question`} value={gap.resolution_question ?? ''} onChange={value => patch({ resolution_question: value })} placeholder="Add the question required to resolve this…" className="text-sm font-medium leading-6 text-white/70" /></div> : <p className="mt-2 text-sm font-medium leading-6 text-white/70">{gap.resolution_question}</p>}
        {editor ? <div className="mt-2"><InlineText label={`${gap.title} recommended resolution`} value={gap.recommended_resolution ?? ''} onChange={value => patch({ recommended_resolution: value })} placeholder="Add recommended next step…" className="text-xs leading-5 text-white/40" /></div> : gap.recommended_resolution && (
          <p className="mt-2 text-xs leading-5 text-white/40"><span className="text-white/54">Recommended next step:</span> {gap.recommended_resolution}</p>
        )}
      </div>

      <details className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] text-white/34">
        <summary className="cursor-pointer select-none font-medium text-white/42 hover:text-white/62">Provenance and relationships</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <p>Created {formatDate(gap.created_at)}</p>
            <p>Updated {formatDate(gap.updated_at)}</p>
            <p>{confidenceLabel(gap.confidence)}</p>
            {gap.source_type && <p>Source: {humanizeClientBrainV2Value(gap.source_type)}</p>}
            <p>Record status: {humanizeClientBrainV2Value(gap.source_status)}</p>
          </div>
          <div className="space-y-1.5">
            {gap.relationships.map((relationship, index) => (
              <p key={`${relationship.relationship}:${relationship.record_id ?? index}`}>
                {humanizeClientBrainV2Value(relationship.relationship)}: {relationship.label}
              </p>
            ))}
            {provenance.map(([key, value]) => <p key={key}>{humanizeClientBrainV2Value(key)}: {String(value)}</p>)}
          </div>
        </div>
      </details>
    </article>
  )
}

function KnowledgeGapsWorkspace({ knowledgeGaps, editor }: { knowledgeGaps: ClientBrainV2KnowledgeGapWorkspace | null | undefined; editor?: ClientBrainV2InlineEditor }) {
  const [groupBy, setGroupBy] = useState<'area' | 'priority' | 'type' | 'status'>('area')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const gapField = editorField(editor, 'gaps')
  const gaps = useMemo(() => {
    if (!editor || !gapField) return knowledgeGaps?.gaps ?? []
    const originalById = new Map((knowledgeGaps?.gaps ?? []).map(gap => [gap.record_id, gap]))
    return (gapField.items ?? []).map(item => {
      const original = originalById.get(String(item.record_id))
      const priority = Number(item.priority ?? original?.priority ?? 3)
      return {
        ...original,
        ...item,
        priority,
        priority_band: priority >= 5 ? 'high' : priority >= 3 ? 'medium' : 'low',
        related_area_label: humanizeClientBrainV2Value(String(item.related_area_id ?? original?.related_area_id ?? 'overview')),
      } as ClientBrainV2KnowledgeGapItem
    })
  }, [editor, gapField, knowledgeGaps?.gaps])
  const areaOptions = [...new Set(gaps.map(gap => gap.related_area_label))].sort()
  const filteredGaps = useMemo(() => gaps.filter(gap => (
    (priorityFilter === 'all' || gap.priority_band === priorityFilter)
    && (typeFilter === 'all' || gap.gap_type === typeFilter)
    && (areaFilter === 'all' || gap.related_area_label === areaFilter)
    && (statusFilter === 'all' || gap.lifecycle === statusFilter)
  )), [areaFilter, gaps, priorityFilter, statusFilter, typeFilter])
  const groups = useMemo(() => {
    const grouped = new Map<string, ClientBrainV2KnowledgeGapItem[]>()
    for (const gap of filteredGaps) {
      const key = groupBy === 'area'
        ? gap.related_area_label
        : groupBy === 'priority'
          ? humanizeClientBrainV2Value(gap.priority_band)
          : groupBy === 'type'
            ? humanizeClientBrainV2Value(gap.gap_type)
            : humanizeClientBrainV2Value(gap.lifecycle)
      grouped.set(key, [...(grouped.get(key) ?? []), gap])
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filteredGaps, groupBy])

  if (!knowledgeGaps) return <EmptyState title="Knowledge Gaps unavailable" detail="The unresolved knowledge workspace has not been structured yet." />
  const counts = knowledgeGaps.counts
  const openCount = counts.by_lifecycle.open + counts.by_lifecycle.in_review + counts.by_lifecycle.blocked

  return (
    <div className="space-y-4">
      <section className="border-b border-white/[0.08] pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/58">Resolution readiness</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Known unknowns, made actionable</h3>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">
              These records protect Jarvis from guessing. Each gap remains linked to its business area, impact, provenance and the question required to resolve it.
            </p>
          </div>
          <p className="text-xs text-white/36">
            {knowledgeGaps.duplicate_audit.equivalent_active_groups.length === 0
              ? 'No equivalent active duplicates detected'
              : `${knowledgeGaps.duplicate_audit.equivalent_active_groups.length} possible duplicate groups`}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
          {[
            ['Open', openCount],
            ['High Priority', counts.by_priority.high],
            ['Conflicts', counts.by_type.conflict],
            ['Missing Sources', counts.by_type.missing_source],
            ['Missing Assets', counts.by_type.missing_asset],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-white/10 pl-3">
              <p className="text-xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-[10px] uppercase text-white/32">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 border-b border-white/[0.08] pb-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-[10px] font-semibold uppercase text-white/30">
          Group by
          <select value={groupBy} onChange={event => setGroupBy(event.target.value as typeof groupBy)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium normal-case text-white/65">
            <option value="area">Related area</option>
            <option value="priority">Priority</option>
            <option value="type">Gap type</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="text-[10px] font-semibold uppercase text-white/30">
          Priority
          <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium normal-case text-white/65">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="text-[10px] font-semibold uppercase text-white/30">
          Gap type
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium normal-case text-white/65">
            <option value="all">All types</option>
            {Object.entries(counts.by_type).filter(([, count]) => count > 0).map(([type]) => <option key={type} value={type}>{humanizeClientBrainV2Value(type)}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-semibold uppercase text-white/30">
          Related area
          <select value={areaFilter} onChange={event => setAreaFilter(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium normal-case text-white/65">
            <option value="all">All areas</option>
            {areaOptions.map(area => <option key={area} value={area}>{area}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-semibold uppercase text-white/30">
          Status
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium normal-case text-white/65">
            <option value="all">All statuses</option>
            {Object.entries(counts.by_lifecycle).filter(([, count]) => count > 0).map(([status]) => <option key={status} value={status}>{humanizeClientBrainV2Value(status)}</option>)}
          </select>
        </label>
      </section>

      {groups.length === 0 ? (
        <EmptyState title="No gaps match these filters" detail="Adjust the filters to return unresolved or historical knowledge gaps." />
      ) : groups.map(([label, groupGaps]) => (
        <section key={label} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/48">{label}</p>
            <span className="text-[10px] text-white/28">{groupGaps.length} {groupGaps.length === 1 ? 'gap' : 'gaps'}</span>
          </div>
          <div className="divide-y divide-white/[0.07]">
            {groupGaps.map(gap => {
              const itemIndex = (gapField?.items ?? []).findIndex(item => String(item.record_id) === gap.record_id)
              return <KnowledgeGapCard key={gap.record_id} gap={gap} editor={editor} gapField={gapField} itemIndex={itemIndex >= 0 ? itemIndex : undefined} />
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

const HEALTH_CLOSED_LIFECYCLES = new Set(['resolved', 'dismissed', 'superseded'])
const HEALTH_INACTIVE_STATUSES = new Set(['historical', 'superseded', 'rejected', 'archived'])
const INTELLIGENCE_QUERY_SUBSECTIONS = new Set(['health', 'overview', 'brand_identity', 'audience', 'visual_dna', 'commercial_strategy', 'menus', 'activations', 'operations', 'market_intelligence', 'knowledge_gaps'])

function HealthWorkspace({ data, onOpenGaps, onOpenLearnings }: { data: BrainV2Response | null; onOpenGaps: () => void; onOpenLearnings: () => void }) {
  const activeGaps = (data?.knowledgeGaps?.gaps ?? [])
    .filter(gap => !HEALTH_CLOSED_LIFECYCLES.has(gap.lifecycle))
    .sort((left, right) => {
      const leftConflict = left.gap_type === 'conflict' || left.source_status === 'conflicting' ? 1 : 0
      const rightConflict = right.gap_type === 'conflict' || right.source_status === 'conflicting' ? 1 : 0
      return rightConflict - leftConflict || right.priority - left.priority || left.title.localeCompare(right.title)
    })
  const records = (data?.records ?? []).filter(record => record.subsection !== 'knowledge_gaps' && !HEALTH_INACTIVE_STATUSES.has(record.status))
  const byArea = new Map<string, { label: string; gaps: ClientBrainV2KnowledgeGapItem[]; confidences: number[] }>()
  for (const gap of activeGaps) {
    const entry = byArea.get(gap.related_area_id) ?? { label: gap.related_area_label, gaps: [], confidences: [] }
    entry.gaps.push(gap)
    byArea.set(gap.related_area_id, entry)
  }
  for (const record of records) {
    const entry = byArea.get(record.subsection) ?? { label: humanizeClientBrainV2Value(record.subsection), gaps: [], confidences: [] }
    if (record.confidence !== null) entry.confidences.push(record.confidence)
    byArea.set(record.subsection, entry)
  }
  const areas = [...byArea.entries()].map(([id, area]) => ({
    id,
    ...area,
    conflictCount: area.gaps.filter(gap => gap.gap_type === 'conflict' || gap.source_status === 'conflicting').length,
    confidence: area.confidences.length ? area.confidences.reduce((total, value) => total + value, 0) / area.confidences.length : null,
  })).sort((left, right) => right.conflictCount - left.conflictCount || right.gaps.length - left.gaps.length || (left.confidence ?? 0) - (right.confidence ?? 0))
  const measuredConfidence = records.map(record => record.confidence).filter((value): value is number => value !== null)
  const averageConfidence = measuredConfidence.length ? Math.round((measuredConfidence.reduce((total, value) => total + value, 0) / measuredConfidence.length) * 100) : null
  const mostUrgent = activeGaps[0] ?? null
  const latestEvidence = records.map(record => record.updated_at).filter(Boolean).sort().at(-1) ?? null
  const conflicts = activeGaps.filter(gap => gap.gap_type === 'conflict' || gap.source_status === 'conflicting').length

  return <section className="brain-health" aria-labelledby="brain-health-title">
    <header className="brain-health-heading">
      <div><p>Intelligence</p><h2 id="brain-health-title">Health</h2><span>What Jarvis knows about this client, and what that knowledge is currently blocking.</span></div>
      <div className="brain-health-meta"><strong>{data?.counts?.sections.intelligence ?? 0} records</strong>{latestEvidence ? <span>Last evidence update {formatDate(latestEvidence)}</span> : <span>No evidence date recorded</span>}</div>
    </header>

    {mostUrgent ? <section className="brain-health-hero">
      <span className="brain-grain" aria-hidden="true" />
      <div className="brain-health-hero-content"><p className="brain-health-kicker"><b>J</b>{mostUrgent.gap_type === 'conflict' || mostUrgent.source_status === 'conflicting' ? 'Resolve conflict first' : 'Fix this first'}</p><h3>{mostUrgent.title}</h3><p>{mostUrgent.why_it_matters || mostUrgent.description || 'This unresolved knowledge needs a conscious review before it informs work.'}</p><div><button type="button" onClick={onOpenGaps}>Review gap</button><button type="button" onClick={onOpenGaps}>See all {activeGaps.length} open gaps</button></div></div>
      <div className="brain-health-hero-score"><span>Mean evidence confidence</span><strong>{averageConfidence === null ? '—' : `${averageConfidence}%`}</strong><small>{measuredConfidence.length ? `${measuredConfidence.length} active records scored` : 'No active records scored'}</small></div>
    </section> : <section className="brain-health-clear"><p className="brain-health-kicker"><b>J</b>Knowledge health</p><h3>No open knowledge gaps.</h3><p>Jarvis will surface a new item here when evidence needs review.</p></section>}

    <section className="brain-health-grid">
      <div className="brain-health-areas"><header><div><h3>Areas by attention</h3><p>Conflicts and open gaps appear before confidence-only signals.</p></div><span>{conflicts ? `${conflicts} conflict${conflicts === 1 ? '' : 's'}` : 'No conflicts'}</span></header><div>{areas.slice(0, 6).map(area => <article key={area.id}><div><strong>{area.label}</strong><span>{area.conflictCount ? `${area.conflictCount} conflict${area.conflictCount === 1 ? '' : 's'}` : area.gaps.length ? `${area.gaps.length} open gap${area.gaps.length === 1 ? '' : 's'}` : 'No open gaps'}</span></div><div className="brain-health-confidence"><i style={{ width: `${Math.max(0, Math.min(100, Math.round((area.confidence ?? 0) * 100)))}%` }} />{area.confidence === null ? <small>Not scored</small> : <small>{Math.round(area.confidence * 100)}%</small>}</div></article>)}</div></div>
      <div className="brain-health-gaps"><header><div><h3>Open gaps</h3><p>Actual unresolved Client Brain records.</p></div><button type="button" onClick={onOpenGaps}>All gaps →</button></header>{activeGaps.slice(0, 3).map(gap => <article key={gap.record_id} className={gap.gap_type === 'conflict' || gap.source_status === 'conflicting' ? 'is-conflict' : ''}><span>{gap.gap_type === 'conflict' || gap.source_status === 'conflicting' ? 'Conflict' : humanizeClientBrainV2Value(gap.gap_type)}</span><div><strong>{gap.title}</strong><p>{gap.resolution_question}</p></div></article>)}{activeGaps.length === 0 ? <p className="brain-health-empty">No open gaps are recorded.</p> : null}</div>
    </section>

    <section className="brain-health-learnings"><div><p>Learnings</p><h3>Evidence-backed only</h3><span>Preferences and patterns remain client-scoped and traceable to their underlying evidence.</span></div><button type="button" onClick={onOpenLearnings}>Open Learnings →</button></section>
  </section>
}

export default function ClientBrainV2({ clientId, clientName, architectureVersion }: { clientId: string; clientName: string; architectureVersion: string | null }) {
  const searchParams = useSearchParams()
  const requestedSection = searchParams.get('section')
  const requestedSubsection = searchParams.get('subsection')
  const initialSection: ClientBrainV2Section = requestedSection === 'content' ? 'content' : requestedSection === 'assets' ? 'assets' : 'intelligence'
  const initialSubsection = initialSection === 'content' || initialSection === 'assets' ? 'all' : requestedSubsection && requestedSubsection !== 'health' && INTELLIGENCE_QUERY_SUBSECTIONS.has(requestedSubsection) ? requestedSubsection : 'overview'
  const [section, setSection] = useState<ClientBrainV2Section>(initialSection)
  const [subsection, setSubsection] = useState(initialSubsection)
  const [data, setData] = useState<BrainV2Response | null>(null)
  const [loading, setLoading] = useState(initialSection !== 'content')
  const [error, setError] = useState('')
  const [draftWorkspace, setDraftWorkspace] = useState<ClientBrainV2EditorWorkspace | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast, setToast] = useState('')
  const [brandKitDirty, setBrandKitDirty] = useState(false)
  const sectionCache = useRef(new Map<ClientBrainV2Section, BrainV2Response>())
  const cacheClientId = useRef(clientId)

  function storeSectionData(next: BrainV2Response) {
    const previous = sectionCache.current.get(section)
    if (previous?.counts?.total !== next.counts?.total) {
      for (const cachedSection of sectionCache.current.keys()) {
        if (cachedSection !== section) sectionCache.current.delete(cachedSection)
      }
    }
    sectionCache.current.set(section, next)
    setData(next)
  }

  useEffect(() => {
    if (cacheClientId.current !== clientId) {
      cacheClientId.current = clientId
      sectionCache.current.clear()
    }
    if (section === 'logins' || section === 'content') return
    const cached = sectionCache.current.get(section)
    if (cached) {
      setData(cached)
      setError('')
      setLoading(false)
      return
    }
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(`/api/clients/${clientId}/brain-v2?section=${section}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json() as BrainV2Response
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load Client Brain v2.')
        sectionCache.current.set(section, payload)
        setData(payload)
        setError('')
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load Client Brain v2.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [clientId, section])

  const activeArchitectureVersion = data?.client?.brain_architecture_version ?? architectureVersion
  const restaurantV2 = isRestaurantClientBrainV2(activeArchitectureVersion)
  const topLevelSections = [...clientBrainV2SectionsForVersion(activeArchitectureVersion)].sort((left, right) => {
    const order = ['intelligence', 'products_offers', 'assets', 'content', 'brand_guidelines', 'sources', 'learnings', 'logins']
    return order.indexOf(left.id) - order.indexOf(right.id)
  })
  const sectionConfig = topLevelSections.find(item => item.id === section) ?? topLevelSections[0]
  const subsectionConfig = clientBrainV2SubsectionsForVersion(activeArchitectureVersion, section)
  const sectionNavigation = section === 'intelligence'
    ? subsectionConfig
    : section === 'products_offers'
    ? [{ id: 'all', label: 'All', description: 'Browse every recorded commercial object.' }, ...subsectionConfig]
    : subsectionConfig
  const selectedSubsection = sectionNavigation.find(item => item.id === subsection) ?? sectionNavigation[0]
  const assetRecords = data?.assetRecords ?? []
  const records = selectedSubsection.id === 'all'
    ? (data?.records ?? [])
    : (data?.records ?? []).filter(record => record.subsection === selectedSubsection.id)
  const activeCommercialType = selectedSubsection.id === 'all'
    ? 'all'
    : selectedSubsection.id === 'experiences_events'
      ? 'experience_event'
      : selectedSubsection.id.replace(/s$/, '')
  const editableSubsection = section === 'intelligence' && isEditableBrainV2Subsection(selectedSubsection.id)
    ? selectedSubsection.id
    : null
  const brandGuidelineSubsection = section === 'brand_guidelines' && isBrandGuidelineSubsection(selectedSubsection.id)
    ? selectedSubsection.id
    : null
  const brandGuidelineWorkspace = brandGuidelineSubsection ? data?.brandGuidelines?.[brandGuidelineSubsection] ?? null : null
  const editWorkspace: ClientBrainV2EditorWorkspace | null = editableSubsection
    ? data?.editWorkspaces?.[editableSubsection] ?? null
    : brandGuidelineWorkspace?.edit ?? null
  const editing = draftWorkspace !== null
  const editDirty = useMemo(() => Boolean(
    draftWorkspace && editWorkspace && JSON.stringify(draftWorkspace.fields) !== JSON.stringify(editWorkspace.fields)
  ), [draftWorkspace, editWorkspace])

  useEffect(() => {
    if (!editDirty && !brandKitDirty) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [editDirty, brandKitDirty])

  function selectSection(nextSection: ClientBrainV2Section) {
    if ((editDirty || brandKitDirty) && !window.confirm('Discard your unsaved Client Brain changes?')) return
    setDraftWorkspace(null)
    setBrandKitDirty(false)
    setLoading(nextSection !== 'logins' && nextSection !== 'content')
    setError('')
    setSection(nextSection)
    setSubsection(nextSection === 'intelligence' ? 'overview' : nextSection === 'products_offers' ? 'all' : clientBrainV2SubsectionsForVersion(activeArchitectureVersion, nextSection)[0].id)
  }

  function selectSubsection(nextSubsection: string) {
    if (nextSubsection === subsection) return
    if ((editDirty || brandKitDirty) && !window.confirm('Discard your unsaved Client Brain changes?')) return
    setDraftWorkspace(null)
    setBrandKitDirty(false)
    setSaveError('')
    setSubsection(nextSubsection)
  }

  async function saveWorkspace(workspace: ClientBrainV2EditorWorkspace) {
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetch(`/api/clients/${clientId}/brain-v2`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      })
      const payload = await response.json() as BrainV2Response
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save Client Brain changes.')
      storeSectionData(payload)
      setDraftWorkspace(null)
      setToast('Client Brain changes saved.')
      window.setTimeout(() => setToast(''), 2800)
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : 'Unable to save Client Brain changes.')
    } finally {
      setSaving(false)
    }
  }

  const sourceName = data?.client?.name ?? clientName
  const renderIntelligenceWorkspace = (editor?: ClientBrainV2InlineEditor) => {
    if (selectedSubsection.id === 'health') return <HealthWorkspace data={data} onOpenGaps={() => setSubsection('knowledge_gaps')} onOpenLearnings={() => selectSection('learnings')} />
    if (selectedSubsection.id === 'overview') return <><OverviewSnapshot overview={data?.overview} editor={editor} /><details className="brain-readiness"><summary>Knowledge readiness & open gaps</summary><HealthWorkspace data={data} onOpenGaps={() => setSubsection('knowledge_gaps')} onOpenLearnings={() => selectSection('learnings')} /></details><details className="brain-readiness"><summary>Scan and refresh intelligence</summary><ClientIntelligenceScanner clientId={clientId} /></details></>
    if (selectedSubsection.id === 'brand_identity') return <BrandIdentityWorkspace brandIdentity={data?.brandIdentity} editor={editor} />
    if (selectedSubsection.id === 'audience') return <AudienceWorkspace audience={data?.audience} editor={editor} />
    if (selectedSubsection.id === 'visual_dna') return <VisualDnaWorkspace visualDna={data?.visualDna} editor={editor} />
    if (selectedSubsection.id === 'commercial_strategy') return <CommercialStrategyWorkspace commercialStrategy={data?.commercialStrategy} editor={editor} />
    if (selectedSubsection.id === 'menus') return <MenusWorkspace clientId={clientId} records={data?.records ?? []} editor={editor} />
    if (selectedSubsection.id === 'activations') return <ActivationsWorkspace clientId={clientId} records={data?.records ?? []} editor={editor} />
    if (selectedSubsection.id === 'operations') return <OperationsWorkspace operations={data?.operations} editor={editor} />
    if (selectedSubsection.id === 'market_intelligence') return <MarketIntelligenceWorkspace marketIntelligence={data?.marketIntelligence} editor={editor} />
    if (selectedSubsection.id === 'knowledge_gaps') return <KnowledgeGapsWorkspace knowledgeGaps={data?.knowledgeGaps} editor={editor} />
    return null
  }
  const renderBrandGuidelinesWorkspace = () => {
    if (!brandGuidelineSubsection || !brandGuidelineWorkspace) return null
    return <BrandGuidelinesWorkspace
      clientId={clientId}
      clientName={sourceName}
      subsection={brandGuidelineSubsection}
      workspace={brandGuidelineWorkspace}
      options={data?.brandGuidelineOptions ?? { assets: [], sources: [] }}
      onRefreshed={payload => {
        storeSectionData(payload as BrainV2Response)
        setBrandKitDirty(false)
        setToast('Brand Kit changes saved.')
        window.setTimeout(() => setToast(''), 2800)
      }}
      onDirtyChange={setBrandKitDirty}
    />
  }

  return (
    <div className="brain-dark client-brain-page text-white">

        <nav className="mb-5 overflow-x-auto border-b border-white/10" aria-label="Client Brain sections">
          <div className="flex min-w-max gap-1">
            {topLevelSections.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${section === item.id ? 'border-emerald-300 text-white' : 'border-transparent text-white/42 hover:text-white/70'}`}
              >
                {item.label}
                <span className="ml-2 text-[10px] text-white/28">{data?.counts?.sections[item.id] ?? 0}</span>
              </button>
            ))}
            <Link
              href={`/clients/${clientId}/brain/pinterest-inspiration`}
              className="border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-white/42 transition hover:text-white/70"
            >
              Pinterest Inspiration
            </Link>
          </div>
        </nav>

        <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="h-fit border-r border-white/10 pr-4 lg:sticky lg:top-5">
            <p className="mb-3 px-2 text-[10px] font-semibold uppercase text-white/30">{sectionConfig.label}</p>
            <div className="space-y-1">
              {sectionNavigation.map(item => {
                const count = restaurantV2 && section === 'assets'
                  ? item.id === 'monthly_content'
                    ? 0
                    : item.id === 'all'
                    ? assetRecords.length
                    : assetRecords.filter(record => humanConfirmedRestaurantAssetCategory(record) === item.id).length
                  : section === 'sources'
                    ? item.id === 'all'
                      ? data?.counts?.sections[section] ?? 0
                      : (data?.records ?? []).filter(record => {
                          const kind = String((record.metadata.source_v2 as Record<string, unknown> | undefined)?.kind ?? '')
                          return (item.id === 'files' && kind === 'file') || (item.id === 'urls' && kind === 'url') || (item.id === 'manual' && kind === 'manual')
                        }).length
                    : item.id === 'all'
                      ? data?.counts?.sections[section] ?? 0
                      : data?.counts?.subsections[`${section}:${item.id}`] ?? 0
                const intelligenceGaps = (data?.knowledgeGaps?.gaps ?? []).filter(gap => !HEALTH_CLOSED_LIFECYCLES.has(gap.lifecycle))
                const hasConflict = intelligenceGaps.some(gap => gap.related_area_id === item.id && (gap.gap_type === 'conflict' || gap.source_status === 'conflicting'))
                const hasGap = intelligenceGaps.some(gap => gap.related_area_id === item.id)
                const showCount = section !== 'intelligence' || item.id === 'knowledge_gaps'
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSubsection(item.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition ${selectedSubsection.id === item.id ? 'bg-emerald-300/[0.10] text-emerald-50' : 'text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                  >
                    <span>{item.label}</span>
                    {section === 'intelligence' && item.id !== 'health' && item.id !== 'knowledge_gaps' ? <span className={`brain-rail-status ${hasConflict ? 'is-conflict' : hasGap ? 'is-gap' : ''}`} aria-label={hasConflict ? 'Conflict requires review' : hasGap ? 'Open knowledge gap' : 'No open knowledge gap'} /> : null}
                    {showCount && <span className="text-[10px] text-white/28">{item.id === 'knowledge_gaps' ? intelligenceGaps.length : count}</span>}
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="min-w-0">
            {selectedSubsection.id !== 'health' ? <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{sectionConfig.label}</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{selectedSubsection.label}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/43">{selectedSubsection.description}</p>
              </div>
              {editableSubsection && editWorkspace && (
                editing ? <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => { setDraftWorkspace(null); setSaveError('') }} className="min-h-11 rounded-md border border-white/12 px-4 text-sm font-semibold text-white/60 hover:text-white disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={saving || !editDirty || !draftWorkspace} onClick={() => draftWorkspace && void saveWorkspace(draftWorkspace)} className="min-h-11 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
                </div> : <button type="button" onClick={() => { setDraftWorkspace(cloneEditWorkspace(editWorkspace)); setSaveError('') }} className="min-h-11 shrink-0 rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/[0.08]">Edit</button>
              )}
            </div> : null}

            {saveError && <p role="alert" className="mb-4 rounded-md border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{saveError}</p>}

            {error ? (
              <div className="rounded-lg border border-red-300/20 bg-red-300/[0.06] p-5 text-sm text-red-100">{error}</div>
            ) : loading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map(item => <div key={item} className="h-32 rounded-lg bg-white/[0.04]" />)}
              </div>
            ) : editing && draftWorkspace ? (
              <ClientBrainV2Editor
                workspace={draftWorkspace}
                onChange={setDraftWorkspace}
              >
                {editor => renderIntelligenceWorkspace(editor)}
              </ClientBrainV2Editor>
            ) : section === 'intelligence' ? (
              renderIntelligenceWorkspace()
            ) : section === 'brand_guidelines' ? (
              renderBrandGuidelinesWorkspace()
            ) : section === 'products_offers' ? (
              <ProductsOffersWorkspace clientId={clientId} records={data?.records ?? []} activeType={activeCommercialType} />
            ) : section === 'logins' ? (
              <ClientSecureLogins clientId={clientId} />
            ) : section === 'content' ? (
              <ClientContentLibrary clientId={clientId} />
            ) : section === 'assets' && restaurantV2 ? (
              <RestaurantAssetsWorkspace
                clientId={clientId}
                initialAssetId={searchParams.get("asset") ?? undefined}
                records={assetRecords}
                category={selectedSubsection.id as 'all' | 'food' | 'drinks' | 'interiors' | 'exteriors' | 'venue_items' | 'staff' | 'unclassified'}
                onSaved={payload => {
                  storeSectionData(payload as BrainV2Response)
                  setToast('Asset metadata saved.')
                  window.setTimeout(() => setToast(''), 2800)
                }}
                onDeleted={(assetId: string, payload: RestaurantAssetDeleteResponse) => {
                  setData(current => {
                    if (!current?.assetRecords) return current
                    const deleted = current.assetRecords.find(record => record.id === assetId)
                    if (!deleted) return current
                    const nextAssetRecords = current.assetRecords.filter(record => record.id !== assetId)
                    const category = humanConfirmedRestaurantAssetCategory(deleted)
                    const nextCounts = current.counts ? {
                      ...current.counts,
                      total: Math.max(0, current.counts.total - 1),
                      sections: { ...current.counts.sections, assets: Math.max(0, (current.counts.sections.assets ?? 1) - 1) },
                      subsections: {
                        ...current.counts.subsections,
                        [`assets:${deleted.subsection}`]: Math.max(0, (current.counts.subsections[`assets:${deleted.subsection}`] ?? 1) - 1),
                      },
                      statuses: { ...current.counts.statuses, [deleted.status]: Math.max(0, (current.counts.statuses[deleted.status] ?? 1) - 1) },
                    } : current.counts
                    const nextAssetCounts = current.assetCounts ? {
                      ...current.assetCounts,
                      all: Math.max(0, (current.assetCounts.all ?? current.assetRecords.length) - 1),
                      [category]: Math.max(0, (current.assetCounts[category] ?? 1) - 1),
                    } : current.assetCounts
                    const next = { ...current, assetRecords: nextAssetRecords, counts: nextCounts, assetCounts: nextAssetCounts }
                    sectionCache.current.set('assets', next)
                    return next
                  })
                  setToast(payload.storageCleanupWarning ?? 'Asset deleted from the Client Brain.')
                  window.setTimeout(() => setToast(''), 3200)
                }}
              />
            ) : section === 'sources' ? (
              <SourcesWorkspace
                clientId={clientId}
                records={data?.records ?? []}
                activeType={selectedSubsection.id}
                onSaved={payload => {
                  storeSectionData(payload as BrainV2Response)
                  setToast('Source saved. Previous values retained in version history.')
                  window.setTimeout(() => setToast(''), 2800)
                }}
              />
            ) : section === 'learnings' ? (
              <LearningsWorkspace
                clientId={clientId}
                records={data?.records ?? []}
                activeType={selectedSubsection.id}
                options={data?.learningOptions ?? { sources: [] }}
                onSaved={payload => {
                  storeSectionData(payload as BrainV2Response)
                  setToast('Learning saved. Previous values retained in version history.')
                  window.setTimeout(() => setToast(''), 2800)
                }}
              />
            ) : records.length === 0 ? (
              <EmptyState
                title={`No ${selectedSubsection.label.toLowerCase()} records yet`}
                detail="The v2 structure is ready. Records will appear here when verified information is added or migrated."
              />
            ) : section === 'assets' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {records.map(record => <AssetRecordCard key={record.id} record={record} />)}
              </div>
            ) : (
              <div className="space-y-3">
                {records.map(record => <KnowledgeRecordCard key={record.id} record={record} />)}
              </div>
            )}
          </main>
        </div>
      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 rounded-md border border-emerald-300/25 bg-[#0b1712] px-4 py-3 text-sm font-medium text-emerald-100 shadow-xl">{toast}</div>}
    </div>
  )
}
