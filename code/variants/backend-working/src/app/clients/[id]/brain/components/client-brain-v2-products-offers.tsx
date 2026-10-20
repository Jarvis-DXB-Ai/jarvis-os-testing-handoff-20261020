'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CLIENT_BRAIN_V2_COMMERCIAL_TYPES,
  humanizeClientBrainV2Value,
  type ClientBrainV2File,
  type ClientBrainV2Record,
} from '@/lib/client-brain-v2'

const STATUS_STYLES: Record<string, string> = {
  approved: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  current: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  active: 'border-blue-300/20 bg-blue-300/10 text-blue-100',
  needs_review: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  unverified: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  historical: 'border-white/10 bg-white/[0.04] text-white/48',
}

const THUMBNAIL_ROLES = ['truth_reference', 'approved_marketing_asset', 'creative_reference']

function approvedThumbnail(files: ClientBrainV2File[] | undefined) {
  return [...(files ?? [])]
    .filter(file => file.approval_status === 'approved' && THUMBNAIL_ROLES.includes(file.semantic_role) && file.signed_url)
    .sort((a, b) => THUMBNAIL_ROLES.indexOf(a.semantic_role) - THUMBNAIL_ROLES.indexOf(b.semantic_role))[0] ?? null
}

function stringMetadata(record: ClientBrainV2Record, keys: string[]) {
  const sources = [record.commercial?.metadata, record.metadata]
  for (const source of sources) for (const key of keys) {
    const value = source?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function commercialCategory(record: ClientBrainV2Record) {
  return stringMetadata(record, [
    'category', 'menu', 'collection', 'product_category', 'collection_type',
    'offer_type', 'experience_type', 'event_type', 'package_type',
  ])
}

function reviewLabel(record: ClientBrainV2Record) {
  const stored = stringMetadata(record, ['review_status'])
  if (stored) return stored
  return record.status === 'needs_review' || record.status === 'unverified' ? 'Needs Review' : 'Approved'
}

function priceLabel(record: ClientBrainV2Record) {
  const amount = record.commercial?.price_amount
  if (amount == null) return null
  return `${record.commercial?.currency ?? ''} ${Number(amount).toLocaleString('en-AE')}`.trim()
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLES[status] ?? 'border-white/10 bg-white/[0.03] text-white/45'}`}>
      {humanizeClientBrainV2Value(status)}
    </span>
  )
}

function CommercialCard({ clientId, record }: { clientId: string; record: ClientBrainV2Record }) {
  const thumbnail = approvedThumbnail(record.files)
  const objectType = record.commercial?.object_type ?? record.record_type
  const category = commercialCategory(record)
  const price = priceLabel(record)
  const review = reviewLabel(record)

  return (
    <Link
      href={`/clients/${clientId}/brain/products-offers/${record.id}`}
      className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] transition hover:border-emerald-300/25 hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-emerald-300/35"
    >
      <div className="aspect-[4/3] overflow-hidden border-b border-white/[0.07] bg-black/30">
        {thumbnail ? (
          // Signed Supabase URLs are short-lived and scoped to this server response.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail.signed_url ?? ''} alt={record.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <p className="text-xs font-semibold text-white/34">No approved image available</p>
              <p className="mt-1.5 text-[10px] leading-4 text-white/22">Approved truth or marketing assets will appear here.</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase text-emerald-100/48">{humanizeClientBrainV2Value(objectType)}</p>
            <h3 className="mt-1.5 text-base font-semibold leading-6 text-white group-hover:text-emerald-50">{record.title}</h3>
            <p className="mt-1 text-xs text-white/34">{category ? humanizeClientBrainV2Value(category) : 'Category not defined'}</p>
          </div>
          {price && <p className="shrink-0 text-sm font-semibold text-white">{price}</p>}
        </div>

        <p className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-white/45">
          {record.commercial?.availability ?? 'Availability not recorded.'}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-4">
          <StatusBadge status={record.status} />
          {review.toLowerCase() !== humanizeClientBrainV2Value(record.status).toLowerCase() && (
            <span className="text-[10px] font-medium text-white/34">{review}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function ProductsOffersWorkspace({
  clientId,
  records,
  activeType,
}: {
  clientId: string
  records: ClientBrainV2Record[]
  activeType: string
}) {
  const [query, setQuery] = useState('')
  const [reviewFilter, setReviewFilter] = useState('all')

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return records.filter(record => {
      const objectType = record.commercial?.object_type ?? record.record_type
      const matchesType = activeType === 'all' || objectType === activeType
      const review = reviewLabel(record).toLowerCase()
      const matchesReview = reviewFilter === 'all'
        || (reviewFilter === 'approved' && !review.includes('review'))
        || (reviewFilter === 'needs_review' && review.includes('review'))
      const searchText = [record.title, objectType, commercialCategory(record) ?? ''].join(' ').toLowerCase()
      return matchesType && matchesReview && (!normalizedQuery || searchText.includes(normalizedQuery))
    })
  }, [activeType, query, records, reviewFilter])

  const activeLabel = activeType === 'all'
    ? 'commercial objects'
    : humanizeClientBrainV2Value(activeType === 'experience_event' ? 'experiences_events' : `${activeType}s`).toLowerCase()

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
        <label className="block">
          <span className="sr-only">Search Products and Offers</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name, category, or type"
            className="min-h-11 w-full rounded-md border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/35 focus:ring-1 focus:ring-emerald-300/20"
          />
        </label>
        <label className="block">
          <span className="sr-only">Review state</span>
          <select
            value={reviewFilter}
            onChange={event => setReviewFilter(event.target.value)}
            className="min-h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white/65 outline-none focus:border-emerald-300/35"
          >
            <option value="all">All review states</option>
            <option value="approved">Approved / Current</option>
            <option value="needs_review">Needs Review</option>
          </select>
        </label>
      </section>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-white/36">{visible.length} {activeLabel}</p>
        {query && <button type="button" onClick={() => setQuery('')} className="min-h-10 px-2 text-xs font-semibold text-emerald-100/65 hover:text-emerald-100">Clear search</button>}
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map(record => <CommercialCard key={record.id} clientId={clientId} record={record} />)}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/12 px-6 py-14 text-center">
          <p className="text-sm font-semibold text-white/62">No {activeLabel} match these filters</p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-white/36">
            {CLIENT_BRAIN_V2_COMMERCIAL_TYPES.includes(activeType as typeof CLIENT_BRAIN_V2_COMMERCIAL_TYPES[number])
              ? 'Adjust search or review state to return recorded commercial objects.'
              : 'No commercial objects are currently available for this selection.'}
          </p>
        </div>
      )}
    </div>
  )
}
