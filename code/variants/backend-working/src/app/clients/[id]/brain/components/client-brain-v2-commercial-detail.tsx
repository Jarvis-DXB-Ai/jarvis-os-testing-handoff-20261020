import Link from 'next/link'
import type { ReactNode } from 'react'
import Sidebar from '@/components/layout/sidebar'
import {
  humanizeClientBrainV2Value,
  type ClientBrainV2CommercialDetail,
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLES[status] ?? 'border-white/10 bg-white/[0.03] text-white/45'}`}>
      {humanizeClientBrainV2Value(status)}
    </span>
  )
}

function stringMetadata(record: ClientBrainV2Record, keys: string[]) {
  for (const source of [record.commercial?.metadata, record.metadata]) for (const key of keys) {
    const value = source?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function stringListMetadata(record: ClientBrainV2Record, keys: string[]) {
  for (const source of [record.commercial?.metadata, record.metadata]) for (const key of keys) {
    const value = source?.[key]
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    if (typeof value === 'string' && value.trim()) return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  return []
}

function categoryLabel(record: ClientBrainV2Record) {
  return stringMetadata(record, [
    'category', 'menu', 'collection', 'product_category', 'collection_type',
    'offer_type', 'experience_type', 'event_type', 'package_type',
  ])
}

function reviewLabel(record: ClientBrainV2Record) {
  return stringMetadata(record, ['review_status'])
    ?? (record.status === 'needs_review' || record.status === 'unverified' ? 'Needs Review' : 'Approved')
}

function priceLabel(record: ClientBrainV2Record) {
  const amount = record.commercial?.price_amount
  if (amount == null) return null
  return `${record.commercial?.currency ?? ''} ${Number(amount).toLocaleString('en-AE')}`.trim()
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function approvedFiles(files: ClientBrainV2File[] | undefined) {
  return [...(files ?? [])]
    .filter(file => file.approval_status === 'approved' && THUMBNAIL_ROLES.includes(file.semantic_role))
    .sort((a, b) => THUMBNAIL_ROLES.indexOf(a.semantic_role) - THUMBNAIL_ROLES.indexOf(b.semantic_role))
}

function EmptyValue({ children = 'Not recorded' }: { children?: string }) {
  return <span className="text-white/28">{children}</span>
}

function DetailValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-white/[0.07] py-4 first:border-t-0 first:pt-0">
      <p className="text-[10px] font-semibold uppercase text-white/28">{label}</p>
      <div className="mt-1.5 text-sm leading-6 text-white/58">{value || <EmptyValue />}</div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.025] p-5 sm:p-6">
      <div className="border-b border-white/[0.07] pb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="mt-1.5 text-xs leading-5 text-white/36">{description}</p>}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  )
}

function TextList({ values, empty = 'Not recorded' }: { values: string[]; empty?: string }) {
  if (values.length === 0) return <EmptyValue>{empty}</EmptyValue>
  return (
    <ul className="space-y-2">
      {values.map((value, index) => <li key={`${value}:${index}`} className="flex gap-2.5 text-sm leading-6 text-white/56"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-emerald-200/50" />{value}</li>)}
    </ul>
  )
}

function scheduleLabel(schedule: Record<string, unknown> | undefined) {
  if (!schedule || Object.keys(schedule).length === 0) return null
  return Object.entries(schedule).map(([key, value]) => `${humanizeClientBrainV2Value(key)}: ${String(value)}`).join(' · ')
}

function relationshipLabel(relationType: string, direction: 'incoming' | 'outgoing') {
  if (relationType === 'part_of_collection') return direction === 'outgoing' ? 'Part of collection' : 'Contains product'
  if (relationType === 'derived_from') return 'Evidence source'
  return humanizeClientBrainV2Value(relationType)
}

function ApprovedAssets({ detail }: { detail: ClientBrainV2CommercialDetail }) {
  const direct = approvedFiles(detail.record.files).map(file => ({ file, title: detail.record.title }))
  const related = detail.related_assets.flatMap(relationship => (
    approvedFiles(relationship.record.files).map(file => ({ file, title: relationship.record.title }))
  ))
  const assets = [...direct, ...related]

  if (assets.length === 0) {
    return <div className="rounded-md border border-dashed border-white/10 px-5 py-10 text-center text-xs text-white/32">No approved image available.</div>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map(({ file, title }) => (
        <article key={file.id} className="overflow-hidden rounded-md border border-white/[0.08] bg-black/20">
          <div className="aspect-[4/3] bg-black/30">
            {file.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.signed_url} alt={title} className="h-full w-full object-cover" />
            ) : <div className="flex h-full items-center justify-center text-xs text-white/25">Preview unavailable</div>}
          </div>
          <div className="p-3">
            <p className="truncate text-xs font-semibold text-white/62">{title}</p>
            <p className="mt-1 text-[10px] text-white/30">{humanizeClientBrainV2Value(file.semantic_role)}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

export default function ClientBrainV2CommercialDetailPage({ detail }: { detail: ClientBrainV2CommercialDetail }) {
  const { record } = detail
  const commercial = record.commercial
  const objectType = commercial?.object_type ?? record.record_type
  const category = categoryLabel(record)
  const price = priceLabel(record)
  const primaryImage = approvedFiles(record.files)[0]
    ?? detail.related_assets.flatMap(relationship => approvedFiles(relationship.record.files))[0]
    ?? null
  const dietary = stringListMetadata(record, ['dietary_tags', 'dietary', 'dietary_capabilities'])
  const presentation = stringMetadata(record, ['portion_presentation', 'presentation_notes', 'portion_notes'])
  const signature = record.metadata.signature_product === true || commercial?.metadata.signature_product === true
  const recurring = stringMetadata(record, ['recurring', 'recurrence'])
  const venue = stringMetadata(record, ['venue', 'location'])
  const pricingBasis = stringMetadata(record, ['pricing_basis']) ?? commercial?.pricing_mechanism

  return (
    <div className="brain-dark jarvis-dark-shell min-h-screen">
      <Sidebar />
      <div className="jarvis-page">
        <header className="mb-5">
          <Link href={`/clients/${detail.client.id}/brain`} className="jarvis-muted-button inline-flex min-h-11 items-center px-3 text-xs">
            Back to Products & Offers
          </Link>
        </header>

        <main className="space-y-5">
          <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,42%)]">
              <div className="flex min-h-[330px] flex-col justify-between p-6 sm:p-8 lg:min-h-[430px]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/50">{humanizeClientBrainV2Value(objectType)}</p>
                  <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl">{record.title}</h1>
                  <p className="mt-3 text-sm text-white/38">{category ? humanizeClientBrainV2Value(category) : 'Category not defined'}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <StatusBadge status={record.status} />
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-white/42">{reviewLabel(record)}</span>
                  </div>
                </div>
                <div className="mt-10">
                  {price ? <p className="text-2xl font-semibold text-white">{price}</p> : <p className="text-sm text-white/30">No verified price</p>}
                  {record.summary && <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52">{record.summary}</p>}
                </div>
              </div>

              <div className="aspect-[4/3] border-t border-white/[0.07] bg-black/30 lg:aspect-auto lg:border-l lg:border-t-0">
                {primaryImage?.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={primaryImage.signed_url} alt={record.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-64 items-center justify-center px-8 text-center">
                    <div>
                      <p className="text-sm font-semibold text-white/34">No approved image available</p>
                      <p className="mt-2 text-xs leading-5 text-white/24">Only approved truth, marketing, or appropriate creative references can appear here.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
            <div className="space-y-5">
              <Section title="Core" description="Canonical commercial truth currently stored for this object.">
                <DetailValue label="Description" value={record.content ? <p className="whitespace-pre-wrap">{record.content}</p> : record.summary} />
                <div className="grid gap-x-8 sm:grid-cols-2">
                  <DetailValue label="Category" value={category ? humanizeClientBrainV2Value(category) : null} />
                  <DetailValue label="Object type" value={humanizeClientBrainV2Value(objectType)} />
                  <DetailValue label="Price" value={price} />
                  <DetailValue label="Pricing basis" value={pricingBasis ? humanizeClientBrainV2Value(pricingBasis) : null} />
                  <DetailValue label="Availability" value={commercial?.availability} />
                  <DetailValue label="Schedule" value={scheduleLabel(commercial?.schedule)} />
                  <DetailValue label="Booking requirements" value={commercial?.booking_requirements} />
                  <DetailValue label="Capacity" value={commercial?.capacity != null ? String(commercial.capacity) : null} />
                </div>
              </Section>

              {objectType === 'product' && (
                <Section title="Product Details" description="Menu and service information. Missing fields are intentionally not inferred.">
                  <DetailValue label="Menu / Collection" value={detail.related_commercial_objects.filter(item => item.relation_type === 'part_of_collection').map(item => item.record.title).join(', ') || null} />
                  <DetailValue label="Ingredients" value={<TextList values={commercial?.ingredients ?? []} empty="Ingredients not verified" />} />
                  <DetailValue label="Allergens" value={<TextList values={commercial?.allergens ?? []} empty="Allergens not verified" />} />
                  <DetailValue label="Dietary information" value={<TextList values={dietary} empty="Dietary information not verified" />} />
                  <DetailValue label="Portion / presentation" value={presentation} />
                  <DetailValue label="Signature product" value={signature ? 'Yes' : <EmptyValue>Not recorded</EmptyValue>} />
                  <DetailValue label="Key selling points" value={<TextList values={commercial?.key_selling_points ?? []} />} />
                </Section>
              )}

              {objectType === 'collection' && (
                <Section title={category?.toLowerCase().includes('menu') ? 'Menu Details' : 'Collection Details'} description="The grouped commercial range and its recorded service context.">
                  <DetailValue label="Collection type" value={category ? humanizeClientBrainV2Value(category) : null} />
                  <DetailValue label="Service / daypart" value={stringMetadata(record, ['service', 'daypart'])} />
                  <DetailValue label="Contained products" value={detail.related_commercial_objects.filter(item => item.direction === 'incoming' && item.relation_type === 'part_of_collection').map(item => item.record.title).join(', ') || null} />
                  <DetailValue label="Availability" value={commercial?.availability} />
                  <DetailValue label="Schedule" value={scheduleLabel(commercial?.schedule)} />
                </Section>
              )}

              {objectType === 'offer' && (
                <Section title="Offer Details" description="Review-sensitive price, timing, inclusions, and conversion requirements.">
                  <DetailValue label="Offer type" value={category ? humanizeClientBrainV2Value(category) : null} />
                  <DetailValue label="Pricing mechanism" value={commercial?.pricing_mechanism ? humanizeClientBrainV2Value(commercial.pricing_mechanism) : null} />
                  <DetailValue label="Eligible / included products" value={detail.related_commercial_objects.filter(item => ['eligible_for_offer', 'included_in_offer', 'includes_product'].includes(item.relation_type)).map(item => item.record.title).join(', ') || null} />
                  <DetailValue label="Start date" value={formatDate(record.effective_date)} />
                  <DetailValue label="End date" value={formatDate(record.valid_until)} />
                  <DetailValue label="Restrictions" value={commercial?.restrictions} />
                  <DetailValue label="Booking requirements" value={commercial?.booking_requirements} />
                </Section>
              )}

              {objectType === 'experience_event' && (
                <Section title="Experience / Event Details" description="Current event structure without assuming an active date or programme.">
                  <DetailValue label="Experience / event type" value={category ? humanizeClientBrainV2Value(category) : null} />
                  <DetailValue label="Recurring / one-off" value={recurring} />
                  <DetailValue label="Venue / location" value={venue} />
                  <DetailValue label="Schedule" value={scheduleLabel(commercial?.schedule)} />
                  <DetailValue label="Price" value={price} />
                  <DetailValue label="Capacity" value={commercial?.capacity != null ? String(commercial.capacity) : null} />
                  <DetailValue label="Booking requirements" value={commercial?.booking_requirements} />
                </Section>
              )}

              {objectType === 'package' && (
                <Section title="Package Details" description="Recorded group or bundled proposition details.">
                  <DetailValue label="Pricing basis" value={pricingBasis ? humanizeClientBrainV2Value(pricingBasis) : null} />
                  <DetailValue label="Included products / experiences" value={detail.related_commercial_objects.filter(item => item.relation_type.startsWith('includes_')).map(item => item.record.title).join(', ') || null} />
                  <DetailValue label="Availability" value={commercial?.availability} />
                  <DetailValue label="Schedule / date" value={scheduleLabel(commercial?.schedule) ?? formatDate(record.effective_date)} />
                  <DetailValue label="Capacity" value={commercial?.capacity != null ? String(commercial.capacity) : null} />
                  <DetailValue label="Booking requirements" value={commercial?.booking_requirements} />
                  <DetailValue label="Restrictions" value={commercial?.restrictions} />
                </Section>
              )}

              <Section title="Visual Assets" description="Approved client truth and marketing references connected to this commercial object.">
                <ApprovedAssets detail={detail} />
              </Section>
            </div>

            <aside className="space-y-5">
              <Section title="Related Commercial Objects">
                {detail.related_commercial_objects.length > 0 ? (
                  <div className="space-y-2">
                    {detail.related_commercial_objects.map(relationship => (
                      <Link key={relationship.id} href={`/clients/${detail.client.id}/brain/products-offers/${relationship.record.id}`} className="block rounded-md border border-white/[0.08] px-4 py-3 hover:border-emerald-300/20 hover:bg-white/[0.025]">
                        <p className="text-[10px] font-semibold uppercase text-emerald-100/45">{relationshipLabel(relationship.relation_type, relationship.direction)}</p>
                        <p className="mt-1 text-sm font-semibold text-white/68">{relationship.record.title}</p>
                        <p className="mt-1 text-[10px] text-white/30">{humanizeClientBrainV2Value(relationship.record.commercial?.object_type ?? relationship.record.record_type)}</p>
                      </Link>
                    ))}
                  </div>
                ) : <EmptyValue>No related commercial objects recorded</EmptyValue>}
              </Section>

              <Section title="Sources" description="Evidence currently linked through the canonical relationship layer.">
                {detail.sources.length > 0 ? (
                  <div className="space-y-3">
                    {detail.sources.map(source => (
                      <article key={source.id} className="rounded-md border border-white/[0.08] p-4">
                        <p className="text-sm font-semibold text-white/65">{source.record.title}</p>
                        <p className="mt-1 text-[10px] text-white/30">{humanizeClientBrainV2Value(source.record.subsection)}</p>
                        <StatusBadge status={source.record.status} />
                      </article>
                    ))}
                  </div>
                ) : <EmptyValue>No current Source attached</EmptyValue>}
              </Section>

              <Section title="Knowledge Gaps" description="Existing unresolved gaps that materially affect safe commercial use.">
                {detail.knowledge_gaps.length > 0 ? (
                  <div className="space-y-3">
                    {detail.knowledge_gaps.map(gap => (
                      <article key={gap.record.id} className="rounded-md border border-amber-300/15 bg-amber-300/[0.035] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-amber-50/76">{gap.record.title}</p>
                          <StatusBadge status={gap.record.status} />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-white/40">{gap.relevance}</p>
                      </article>
                    ))}
                  </div>
                ) : <EmptyValue>No material knowledge gaps linked</EmptyValue>}
              </Section>

              <Section title="Lifecycle & Evidence">
                <DetailValue label="Lifecycle status" value={humanizeClientBrainV2Value(record.status)} />
                <DetailValue label="Confidence" value={record.confidence != null ? `${Math.round(record.confidence * 100)}%` : null} />
                <DetailValue label="Last verified" value={formatDate(record.last_verified_at)} />
                <DetailValue label="Review date" value={formatDate(record.review_at)} />
                <DetailValue label="Valid until" value={formatDate(record.valid_until)} />
                <details className="border-t border-white/[0.07] pt-4 text-xs text-white/38">
                  <summary className="cursor-pointer font-semibold text-white/48 hover:text-white/68">Provenance</summary>
                  <div className="mt-3 space-y-1.5">
                    <p>Source type: {record.source_type ? humanizeClientBrainV2Value(record.source_type) : 'Not recorded'}</p>
                    {Object.entries(record.provenance).map(([key, value]) => <p key={key}>{humanizeClientBrainV2Value(key)}: {String(value)}</p>)}
                  </div>
                </details>
              </Section>

              <Section title="History">
                {detail.versions.length > 0 ? (
                  <div className="space-y-2">
                    {detail.versions.map(version => <p key={version.id} className="text-xs text-white/42">Previous version captured {formatDate(version.changed_at)}</p>)}
                  </div>
                ) : <EmptyValue>No previous versions recorded</EmptyValue>}
              </Section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
