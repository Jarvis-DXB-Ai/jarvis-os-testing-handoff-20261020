'use client'

// Archive previews use the same short-lived signed URLs as the canonical Social Content records.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react'
import { shortMonthLabel, type SocialContentItem, type SocialPublishingMonth, type SocialPublishingWorkspace } from '@/lib/social-publishing'

type ArchiveResponse = { ok?: boolean; error?: string; months?: SocialPublishingMonth[]; workspace?: SocialPublishingWorkspace | null }

function itemLabel(item: SocialContentItem) {
  return item.title || (item.contentKind === 'feed' ? `Feed post ${item.sequence}` : item.contentKind === 'reel' ? `Reel ${item.sequence}` : `Story ${item.sequence}`)
}

function ArchiveTile({ item }: { item: SocialContentItem }) {
  const media = item.media[0]
  const ratio = item.contentKind === 'story' || item.contentKind === 'reel' ? 'aspect-[9/16]' : 'aspect-[4/5]'
  return <article className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
    <div className={`${ratio} bg-black/30`}>
      {media?.signedUrl ? media.mimeType.startsWith('video/') ? <video src={media.signedUrl} muted playsInline className="h-full w-full object-cover" /> : <img src={media.signedUrl} alt={itemLabel(item)} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-3 text-center text-xs text-white/35">Preview unavailable</div>}
    </div>
    <div className="p-3">
      <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-white">{itemLabel(item)}</p><span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] font-semibold text-white/55">{item.contentKind}</span></div>
      <p className="mt-1 text-[11px] text-white/42">{item.status} · {item.scheduledDate ?? 'Date not set'}</p>
    </div>
  </article>
}

export default function MonthlyContentArchive({ clientId }: { clientId: string }) {
  const [months, setMonths] = useState<SocialPublishingMonth[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<SocialPublishingWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadMonths() {
      setLoading(true)
      try {
        const response = await fetch(`/api/social/publishing?client_id=${encodeURIComponent(clientId)}&list_months=1`, { cache: 'no-store', signal: controller.signal })
        const payload = await response.json() as ArchiveResponse
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load Monthly Content.')
        if (controller.signal.aborted) return
        const nextMonths = payload.months ?? []
        setMonths(nextMonths)
        setSelectedMonth(current => current && nextMonths.some(month => month.monthStart === current) ? current : nextMonths[0]?.monthStart ?? null)
        setError('')
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load Monthly Content.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadMonths()
    return () => controller.abort()
  }, [clientId])

  useEffect(() => {
    if (!selectedMonth) {
      queueMicrotask(() => setWorkspace(null))
      return
    }
    const controller = new AbortController()
    async function loadWorkspace() {
      setLoading(true)
      try {
        const response = await fetch(`/api/social/publishing?client_id=${encodeURIComponent(clientId)}&month_start=${selectedMonth}`, { cache: 'no-store', signal: controller.signal })
        const payload = await response.json() as ArchiveResponse
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load the selected month.')
        if (!controller.signal.aborted) { setWorkspace(payload.workspace ?? null); setError('') }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load the selected month.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadWorkspace()
    return () => controller.abort()
  }, [clientId, selectedMonth])

  const grouped = useMemo(() => ({
    feed: (workspace?.items ?? []).filter(item => item.contentKind === 'feed'),
    reels: (workspace?.items ?? []).filter(item => item.contentKind === 'reel'),
    stories: (workspace?.items ?? []).filter(item => item.contentKind === 'story'),
  }), [workspace])

  return <section>
    <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.035] p-5">
      <p className="text-sm font-semibold text-emerald-50">Final Social Content</p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">Approved monthly creative is preserved here as a reference to the canonical Social Content records. It is intentionally separate from Client Brain truth and does not duplicate the underlying files.</p>
    </div>
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}
    {loading && !workspace && <p className="mt-5 text-sm text-white/45">Loading Monthly Content…</p>}
    {!loading && !months.length && !error && <p className="mt-5 rounded-lg border border-dashed border-white/12 px-6 py-14 text-center text-sm text-white/42">No final monthly social content has been uploaded for this client yet.</p>}
    {months.length > 0 && <>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Monthly Content collections">{months.map(month => <button key={month.id} type="button" onClick={() => setSelectedMonth(month.monthStart)} className={`min-h-10 rounded-md border px-3 text-sm font-semibold ${selectedMonth === month.monthStart ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-50' : 'border-white/10 text-white/48 hover:text-white/75'}`}>{shortMonthLabel(month.monthStart)}</button>)}</div>
      {workspace && <div className="mt-6 space-y-8">
        {([['feed', 'Feed'], ['reels', 'Reels'], ['stories', 'Stories']] as const).map(([key, label]) => grouped[key].length ? <section key={key}><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-white">{label}</h3><span className="text-xs text-white/38">{grouped[key].length} final {grouped[key].length === 1 ? 'item' : 'items'}</span></div><div className={`grid gap-3 ${key === 'stories' || key === 'reels' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'}`}>{grouped[key].map(item => <ArchiveTile key={item.id} item={item} />)}</div></section> : null)}
        {!workspace.items.length && <p className="rounded-lg border border-dashed border-white/12 px-6 py-12 text-center text-sm text-white/42">This month exists, but no final social content has been added yet.</p>}
      </div>}
    </>}
  </section>
}
