"use client"

// Final social media uses short-lived signed storage URLs, which Next's remote optimizer cannot safely cache.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react"
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { socialFallbackAccountsForClient } from "@/lib/social-client-config"
import { monthStartFromInput, platformLabel, statusClass, weekdayLabel, type SocialContentItem, type SocialContentKind, type SocialPublishingPlatform, type SocialPublishingStatus, type SocialPublishingWorkspace } from "@/lib/social-publishing"
import { currentSocialMonth, readSocialMonthPreference, writeSocialMonthPreference } from "@/lib/social-month-preference"

type Props = { clientId: string; clientName: string | null; initialMonth?: string | null; initialItemId?: string | null; initialKind?: string | null }
type View = "feed" | "reels" | "stories"
type UploadState = Record<string, "uploading" | "failed" | "complete">
type UploadEntry = { file: File; key: string; contentKind: SocialContentKind }

function shiftMonth(value: string, offset: number) { const [year, month] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1 + offset, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` }
function monthHeading(value: string) { return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`)) }

function cardTitle(item: SocialContentItem) {
  return item.title || (item.contentKind === "story" ? "Final Story" : item.contentKind === "reel" ? "Final Reel" : `Feed post ${item.sequence}`)
}

function isoDateLabel(value: string | null) {
  if (!value) return "Not scheduled"
  return new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
}

function isStoryRatioWarning(item: SocialContentItem) {
  const media = item.media[0]
  return Boolean(media?.width && media.height && Math.abs(media.width / media.height - 9 / 16) > 0.08)
}

function monthDatesForWeekday(monthStart: string, weekday: number) {
  const cursor = new Date(`${monthStart}T00:00:00Z`)
  const month = cursor.getUTCMonth()
  const dates: string[] = []
  while (cursor.getUTCMonth() === month) {
    if (cursor.getUTCDay() === weekday) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; workspace?: SocialPublishingWorkspace; count?: number }
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Social Publishing request failed.")
  return payload
}

export default function SocialPublishingWorkspace({ clientId, clientName, initialMonth, initialItemId, initialKind }: Props) {
  const [monthInput, setMonthInput] = useState(() => (initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth) ? initialMonth : null) ?? readSocialMonthPreference(clientId, "publishing") ?? currentSocialMonth())
  const [workspace, setWorkspace] = useState<SocialPublishingWorkspace | null>(null)
  const [activeView, setActiveView] = useState<View>(initialKind === "story" ? "stories" : initialKind === "reel" ? "reels" : "feed")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId ?? null)
  const [carouselSelection, setCarouselSelection] = useState<string[]>([])
  const [uploadState, setUploadState] = useState<UploadState>({})
  const [failedUploads, setFailedUploads] = useState<UploadEntry[]>([])
  const feedInputRef = useRef<HTMLInputElement>(null)
  const reelInputRef = useRef<HTMLInputElement>(null)
  const storyInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const monthStart = monthStartFromInput(monthInput)
  const accounts = useMemo(() => socialFallbackAccountsForClient({ clientId, clientName }), [clientId, clientName])
  const feedItems = useMemo(() => (workspace?.items ?? []).filter(item => item.contentKind === "feed").sort((a, b) => a.sequence - b.sequence), [workspace])
  const reelItems = useMemo(() => (workspace?.items ?? []).filter(item => item.contentKind === "reel").sort((a, b) => a.sequence - b.sequence), [workspace])
  const storyItems = useMemo(() => (workspace?.items ?? []).filter(item => item.contentKind === "story").sort((a, b) => a.sequence - b.sequence), [workspace])
  const projectedGrid = useMemo(() => [...feedItems].reverse(), [feedItems])
  const selectedItem = workspace?.items.find(item => item.id === selectedItemId) ?? null
  const uploadProgress = useMemo(() => ({
    total: Object.keys(uploadState).length,
    complete: Object.values(uploadState).filter(state => state === "complete").length,
    uploading: Object.values(uploadState).filter(state => state === "uploading").length,
    failed: Object.values(uploadState).filter(state => state === "failed").length,
  }), [uploadState])

  const refresh = async (quiet = false) => {
    if (!monthStart) return
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const payload = await jsonRequest(`/api/social/publishing?client_id=${encodeURIComponent(clientId)}&month_start=${encodeURIComponent(monthStart)}`)
      setWorkspace(payload.workspace ?? null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load Content Calendar.")
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, monthStart])

  const selectMonth = (next: string) => {
    setMonthInput(next)
    writeSocialMonthPreference(clientId, "publishing", next)
  }

  const runAction = async (body: Record<string, unknown>, successMessage: string) => {
    if (!monthStart) return
    setError(null)
    try {
      const result = await jsonRequest("/api/social/publishing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, monthStart, ...body }) })
      await refresh(true)
      setMessage(result.count === undefined ? successMessage : `${successMessage} ${result.count} monthly placement${result.count === 1 ? "" : "s"} created.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update Content Calendar.")
    }
  }

  const persistItem = async (itemId: string, values: Record<string, unknown>, successMessage: string) => {
    setError(null)
    try {
      await jsonRequest(`/api/social/publishing/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, ...values }) })
      await refresh(true)
      setMessage(successMessage)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save this item.")
    }
  }

  const removeItem = async (item: SocialContentItem) => {
    const approved = window.confirm(`Remove ${cardTitle(item)} from this Content Calendar? The final media file will not be deleted.`)
    if (!approved) return
    setError(null)
    try {
      await jsonRequest(`/api/social/publishing/${item.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) })
      setSelectedItemId(current => current === item.id ? null : current)
      await refresh(true)
      setMessage("Content removed from this calendar. Its source media was left untouched.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to remove this calendar item.")
    }
  }

  const uploadFiles = async (files: File[], contentKind: SocialContentKind) => {
    if (!files.length || !monthStart) return
    if (contentKind === "feed" && files.length > 30) {
      setError("Upload Feed images in batches of 30 or fewer.")
      return
    }
    const entries = files.map((file, index) => ({ file, key: `${contentKind}-${file.name}-${file.size}-${file.lastModified}-${index}`, contentKind }))
    setUploadState(current => ({ ...current, ...Object.fromEntries(entries.map(entry => [entry.key, "uploading"])) }))
    const failures: UploadEntry[] = []
    let cursor = 0
    const worker = async () => {
      while (cursor < entries.length) {
        const entry = entries[cursor++]
        try {
          const data = new FormData()
          data.set("clientId", clientId)
          data.set("monthStart", monthStart)
          data.set("contentKind", contentKind)
          data.append("files", entry.file)
          await jsonRequest("/api/social/publishing/upload", { method: "POST", body: data })
          setUploadState(current => ({ ...current, [entry.key]: "complete" }))
        } catch {
          failures.push(entry)
          setUploadState(current => ({ ...current, [entry.key]: "failed" }))
        }
      }
    }
    setLoading(true)
    await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker))
    await refresh(true)
    setLoading(false)
    setFailedUploads(current => [...current.filter(existing => !entries.some(entry => entry.key === existing.key)), ...failures])
    if (failures.length) setError(`${failures.length} file${failures.length === 1 ? "" : "s"} failed. Retry only those files; completed files were stored once.`)
    else setMessage(`${files.length} final ${contentKind === "feed" ? "Feed image" : contentKind === "reel" ? "Reel" : "Story asset"}${files.length === 1 ? "" : "s"} saved.`)
  }

  const handleInputUpload = (event: ChangeEvent<HTMLInputElement>, kind: SocialContentKind) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    void uploadFiles(files, kind)
  }
  const handleDropUpload = (event: DragEvent<HTMLButtonElement>, kind: SocialContentKind) => {
    event.preventDefault()
    void uploadFiles(Array.from(event.dataTransfer.files), kind)
  }
  const retryFailedUploads = () => {
    const byKind = failedUploads.reduce<Record<SocialContentKind, File[]>>((groups, entry) => {
      groups[entry.contentKind].push(entry.file)
      return groups
    }, { feed: [], reel: [], story: [] })
    setFailedUploads([])
    void Promise.all((Object.entries(byKind) as Array<[SocialContentKind, File[]]>).filter(([, files]) => files.length).map(([kind, files]) => uploadFiles(files, kind)))
  }
  const handleGridDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const oldIndex = projectedGrid.findIndex(item => item.id === event.active.id)
    const newIndex = projectedGrid.findIndex(item => item.id === event.over?.id)
    if (oldIndex < 0 || newIndex < 0) return
    const visualOrder = arrayMove(projectedGrid, oldIndex, newIndex)
    void runAction({ action: "reorder_feed", orderedIds: visualOrder.map(item => item.id).reverse() }, "Grid order and default dates updated.")
  }
  const moveFeed = (item: SocialContentItem, direction: -1 | 1) => {
    const position = feedItems.findIndex(candidate => candidate.id === item.id)
    if (position < 0 || position + direction < 0 || position + direction >= feedItems.length) return
    void runAction({ action: "reorder_feed", orderedIds: arrayMove(feedItems, position, position + direction).map(candidate => candidate.id) }, "Feed order and dates updated.")
  }
  const toggleCarousel = (itemId: string) => setCarouselSelection(current => current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId])

  if (!monthStart) return <p className="rounded-xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">Choose a valid month to open Content Calendar.</p>

  return <section className="space-y-5">
    <header className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="jarvis-eyebrow">Social Media</p><h2 className="mt-1 text-xl font-semibold text-white">Content Calendar</h2><p className="mt-1 text-xs text-white/45">Final assets, captions and Planner handoff.</p></div><div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-xl border border-white/12 bg-black/25 p-1"><button aria-label="Previous month" type="button" onClick={() => selectMonth(shiftMonth(monthInput, -1))} className="h-8 w-8 rounded-lg text-white/65 hover:bg-white/10">‹</button><label className="grid min-w-36 gap-0.5 px-1 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-white/42">Month<span className="text-sm font-semibold normal-case tracking-normal text-white">{monthHeading(monthInput)}</span><input aria-label="Month" type="month" value={monthInput} onChange={event => selectMonth(event.target.value)} className="sr-only" /></label><button aria-label="Next month" type="button" onClick={() => selectMonth(shiftMonth(monthInput, 1))} className="h-8 w-8 rounded-lg text-white/65 hover:bg-white/10">›</button></div><span className="hidden rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-white/45 sm:inline">{feedItems.length} Feed · {reelItems.length} Reels</span></div></div>
    </header>
    {(message || error) && <p className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-300/25 bg-red-500/10 text-red-100" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"}`}>{error || message}</p>}
    {uploadProgress.total > 0 && <div className="flex flex-wrap items-center gap-3 text-xs text-white/42"><span>Upload progress: {uploadProgress.complete} / {uploadProgress.total} uploaded · {uploadProgress.uploading} uploading · {uploadProgress.failed} failed</span>{failedUploads.length > 0 && <button type="button" onClick={retryFailedUploads} className="rounded-md border border-amber-300/30 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-300/[0.08]">Retry failed files ({failedUploads.length})</button>}</div>}
    <nav className="grid grid-cols-3 rounded-2xl border border-white/10 bg-black/25 p-1.5">{(["feed", "reels", "stories"] as View[]).map(view => <button key={view} type="button" onClick={() => setActiveView(view)} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${activeView === view ? "bg-emerald-300 text-black" : "text-white/52 hover:bg-white/[0.05] hover:text-white"}`}>{view === "feed" ? "Feed" : view === "reels" ? "Reels" : "Stories"}</button>)}</nav>
    {loading && <p className="text-sm text-white/45">Updating Content Calendar…</p>}

    {activeView === "feed" && <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]"><div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-[#070a08] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="jarvis-eyebrow">Instagram profile</p><h3 className="mt-1 text-lg font-semibold text-white">Final Feed</h3></div><UploadButton label="Upload Feed" inputRef={feedInputRef} accept="image/*" multiple onChange={event => handleInputUpload(event, "feed")} onDrop={event => handleDropUpload(event, "feed")} /></div>
        {projectedGrid.length === 0 ? <EmptyCopy>Upload final Feed images for {monthHeading(monthInput)}. Assets remain scoped to this client and month.</EmptyCopy> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGridDragEnd}><SortableContext items={projectedGrid.map(item => item.id)} strategy={rectSortingStrategy}><div className="mt-4 grid grid-cols-3 gap-1.5">{projectedGrid.map(item => <SortableFeedTile key={item.id} item={item} checked={carouselSelection.includes(item.id)} onToggle={() => toggleCarousel(item.id)} onOpen={() => setSelectedItemId(item.id)} onRemove={() => void removeItem(item)} />)}</div></SortableContext></DndContext>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/44"><span>P01 publishes first. The visual grid is newest-first.</span>{carouselSelection.length >= 2 && <button type="button" onClick={() => void runAction({ action: "merge_feed_carousel", orderedIds: carouselSelection }, "Carousel created from selected Feed images.").then(() => setCarouselSelection([]))} className="rounded-lg border border-emerald-300/35 px-3 py-1.5 font-semibold text-emerald-100">Create carousel ({carouselSelection.length})</button>}</div>
      </section>
    </div><ContentDetailPanel key={selectedItem?.id ?? "feed-empty"} item={selectedItem} accounts={accounts} onClose={() => setSelectedItemId(null)} onSave={persistItem} onMove={moveFeed} onGenerateCaptions={item => runAction({ action: "generate_live_captions", itemId: item.id }, "Caption generation complete: one Sonnet multimodal request and five new options.")} onRefreshCaptions={item => runAction({ action: "refresh_captions", itemId: item.id }, "Caption refresh complete: one Sonnet multimodal request and five new options.")} onAddToPlanner={item => void persistItem(item.id, { action: "schedule" }, "Added to Planner. No external schedule or publish request was made.")} /></div>}

    {activeView === "reels" && <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]"><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="jarvis-eyebrow">Final Reels</p><h3 className="mt-2 text-xl font-semibold text-white">Video publishing prep</h3><p className="mt-2 text-sm text-white/50">Upload final Reel videos, set the operational package, then add the approved item to Planner.</p></div><UploadButton label="Upload final Reel video" inputRef={reelInputRef} accept="video/*" onChange={event => handleInputUpload(event, "reel")} onDrop={event => handleDropUpload(event, "reel")} /></div>{reelItems.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reelItems.map(item => <ContentCard key={item.id} item={item} onOpen={() => setSelectedItemId(item.id)} />)}</div> : <EmptyCopy>Upload a final Reel video. It stays in the Social media layer, not Client Brain truth.</EmptyCopy>}</section><ContentDetailPanel key={selectedItem?.contentKind === "reel" ? selectedItem.id : "reel-empty"} item={selectedItem?.contentKind === "reel" ? selectedItem : null} accounts={accounts} onClose={() => setSelectedItemId(null)} onSave={persistItem} onAddToPlanner={item => void persistItem(item.id, { action: "schedule" }, "Added to Planner. No external schedule or publish request was made.")} /></div>}
    {activeView === "stories" && workspace && <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
      <StoriesWorkspace workspace={workspace} storyItems={storyItems} inputRef={storyInputRef} onUpload={event => handleInputUpload(event, "story")} onDrop={event => handleDropUpload(event, "story")} onAction={runAction} onOpen={setSelectedItemId} />
      <ContentDetailPanel key={selectedItem?.contentKind === "story" ? selectedItem.id : "story-empty"} item={selectedItem?.contentKind === "story" ? selectedItem : null} accounts={accounts} onClose={() => setSelectedItemId(null)} onSave={persistItem} onAddToPlanner={() => undefined} showPlannerAction={false} />
    </div>}
  </section>
}

function EmptyCopy({ children }: { children: ReactNode }) { return <p className="mt-5 rounded-xl border border-dashed border-white/12 bg-black/15 p-5 text-sm leading-6 text-white/48">{children}</p> }
function UploadButton({ label, inputRef, accept, multiple, onChange, onDrop }: { label: string; inputRef: React.RefObject<HTMLInputElement | null>; accept: string; multiple?: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onDrop: (event: DragEvent<HTMLButtonElement>) => void }) { return <><button type="button" onDragOver={event => event.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black">{label}</button><input ref={inputRef} type="file" hidden accept={accept} multiple={multiple} onChange={onChange} /></> }
function MediaPreview({ item }: { item: SocialContentItem }) { const media = item.media[0]; if (!media?.signedUrl) return <div className="flex h-full items-center justify-center bg-white/[0.04] p-3 text-center text-xs text-white/40">Final media pending</div>; return media.mimeType.startsWith("video/") ? <video src={media.signedUrl} muted playsInline className="h-full w-full object-cover" /> : <img src={media.signedUrl} alt={cardTitle(item)} className="h-full w-full object-cover" draggable={false} /> }

function optionHashtagLine(option: SocialContentItem["captionOptions"][number]) {
  const renderedSegments = (option.renderedCaption ?? "").split(/\n\s*\n/).map(segment => segment.trim()).filter(Boolean)
  return [...renderedSegments].reverse().find(segment => segment.startsWith("#")) ?? option.dynamicHashtags.join(" ")
}

function SortableFeedTile({ item, checked, onToggle, onOpen, onRemove }: { item: SocialContentItem; checked: boolean; onToggle: () => void; onOpen: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }} {...attributes} className="group relative aspect-square overflow-hidden rounded-[3px] bg-black/40"><button type="button" {...listeners} aria-label={`Open ${cardTitle(item)}`} onClick={onOpen} className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"><MediaPreview item={item} /></button><label className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/70 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"><input aria-label={`Select ${cardTitle(item)} for carousel`} type="checkbox" checked={checked} onChange={onToggle} className="h-3.5 w-3.5 accent-emerald-300" /></label><div className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/25" /><div className="absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"><button type="button" aria-label={`Remove ${cardTitle(item)} from Content Calendar`} onClick={onRemove} className="rounded bg-black/75 px-1.5 py-1 text-[10px] text-red-100 hover:bg-red-500/80">×</button></div>{item.format === "carousel" && <span aria-label="Carousel" className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">▣</span>}</div>
}
function ContentCard({ item, onOpen }: { item: SocialContentItem; onOpen: () => void }) { return <button type="button" onClick={onOpen} className="overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left hover:border-emerald-300/35"><div className="aspect-[4/5]"><MediaPreview item={item} /></div><div className="p-3"><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-white">{cardTitle(item)}</p><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-1 text-xs text-white/46">{isoDateLabel(item.scheduledDate)} · {item.scheduledTime || "Time not set"}</p></div></button> }

function ContentDetailPanel({ item, accounts, onClose, onSave, onMove, onGenerateCaptions, onRefreshCaptions, onAddToPlanner, showPlannerAction = true }: { item: SocialContentItem | null; accounts: ReturnType<typeof socialFallbackAccountsForClient>; onClose: () => void; onSave: (id: string, values: Record<string, unknown>, message: string) => Promise<void>; onMove?: (item: SocialContentItem, direction: -1 | 1) => void; onGenerateCaptions?: (item: SocialContentItem) => Promise<void>; onRefreshCaptions?: (item: SocialContentItem) => Promise<void>; onAddToPlanner: (item: SocialContentItem) => void; showPlannerAction?: boolean }) {
  const selectedOptionAtLoad = item?.captionOptions.find(option => option.id === item.selectedCaptionOptionId)
  const [caption, setCaption] = useState(item?.finalCaption ?? selectedOptionAtLoad?.renderedCaption ?? selectedOptionAtLoad?.body ?? ""); const [title, setTitle] = useState(item?.title ?? ""); const [date, setDate] = useState(item?.scheduledDate ?? ""); const [time, setTime] = useState(item?.scheduledTime ?? "11:00"); const [notes, setNotes] = useState(item?.notes ?? ""); const [platforms, setPlatforms] = useState<SocialPublishingPlatform[]>(item?.platformTargets.filter(target => target.selected).map(target => target.platform) ?? []); const [slide, setSlide] = useState(0); const [contextOpen, setContextOpen] = useState(false); const [captionGenerating, setCaptionGenerating] = useState(false); const [captionNotice, setCaptionNotice] = useState<string | null>(null); const [context, setContext] = useState(() => ({ exactDish: item?.contentContext.confirmed.primarySubject ?? "", exactDrink: item?.contentContext.confirmed.supportingDrink?.join(", ") ?? "", activation: item?.contentContext.confirmed.activation ?? "", factualNote: item?.contentContext.confirmed.factualDescriptors?.join(", ") ?? "" }))
  if (!item) return <aside className="h-fit rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-5 2xl:sticky 2xl:top-5"><p className="jarvis-eyebrow">Content detail</p><h3 className="mt-2 text-lg font-semibold text-white">Select a content item</h3><p className="mt-2 text-sm leading-6 text-white/48">Review its Instagram-style preview, date, working caption, platforms and approval without leaving the monthly workspace.</p></aside>
  const activeMedia = item.media[slide] ?? item.media[0]; const vertical = item.contentKind === "story" || item.contentKind === "reel"; const isFeed = item.contentKind === "feed"; const instagramCaptionPreview = caption
  const split = (value: string) => value.split(",").map(entry => entry.trim()).filter(Boolean)
  const contentContext = { ...item.contentContext, confirmed: { ...item.contentContext.confirmed, primarySubject: context.exactDish || undefined, supportingDrink: split(context.exactDrink), activation: context.activation || undefined, factualDescriptors: split(context.factualNote) } }
  const generateCaptions = async () => { if (!onGenerateCaptions || captionGenerating) return; setCaptionNotice(null); setCaptionGenerating(true); try { await onGenerateCaptions(item) } finally { setCaptionGenerating(false) } }
  const refreshCaptions = async () => { if (!onRefreshCaptions || captionGenerating) return; const needsWarning = Boolean(item.selectedCaptionOptionId || item.captionEditedAt || item.captionApprovedAt); if (needsWarning && !window.confirm("Refresh creates one new Sonnet batch and keeps all prior options in history. Your selected, edited, or approved caption remains unchanged. Continue?")) return; setCaptionNotice(null); setCaptionGenerating(true); try { await onRefreshCaptions(item) } finally { setCaptionGenerating(false) } }
  const save = (status: SocialPublishingStatus) => void onSave(item.id, { title, finalCaption: caption, scheduledDate: date || null, scheduledTime: time || null, dateLocked: true, platforms, notes, contentContext, status }, status === "Approved" ? "Content approved." : "Content saved.")
  const reorderSlide = (direction: -1 | 1) => { const next = slide + direction; if (next < 0 || next >= item.media.length) return; void onSave(item.id, { mediaOrder: arrayMove(item.media.map(media => media.id), slide, next) }, "Carousel slide order saved.").then(() => setSlide(next)) }
  return <aside className="h-fit rounded-2xl border border-white/10 bg-[#090d0b] p-5 2xl:sticky 2xl:top-5"><div className="flex items-start justify-between gap-3"><div><p className="jarvis-eyebrow">Content detail</p><h3 className="mt-2 text-lg font-semibold text-white">{cardTitle(item)}</h3></div><button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/55">Close</button></div><div className={`mt-5 overflow-hidden rounded-xl border border-white/10 bg-black ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`}>{activeMedia?.signedUrl ? activeMedia.mimeType.startsWith("video/") ? <video src={activeMedia.signedUrl} muted controls playsInline className="h-full w-full object-cover" /> : <img src={activeMedia.signedUrl} alt={cardTitle(item)} className="h-full w-full object-cover" /> : <MediaPreview item={item} />}</div>{item.format === "carousel" && <div className="mt-3 flex items-center justify-between"><button type="button" disabled={slide === 0} onClick={() => setSlide(current => current - 1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white disabled:opacity-30">←</button><span className="text-xs text-white/50">Slide {slide + 1} / {item.media.length}</span><button type="button" disabled={slide === item.media.length - 1} onClick={() => setSlide(current => current + 1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white disabled:opacity-30">→</button></div>}
    <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-300 text-xs font-bold text-black">{accounts[0]?.displayName.slice(0, 1) || "J"}</span><div><p className="text-xs font-semibold text-white">{accounts.find(account => account.platform === "instagram")?.username || "connected"} ✓</p><p className="text-[10px] text-white/45">{accounts.find(account => account.platform === "instagram")?.displayName || "Connected account"}</p></div></div>{isFeed && <p className="mt-3 whitespace-pre-line text-xs leading-5 text-white/72"><strong>{accounts.find(account => account.platform === "instagram")?.username || "connected"}</strong> {instagramCaptionPreview || "Caption preview will appear here."}</p>}</div>
    {isFeed && <section className="mt-5 border-y border-white/10 py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white/70">Advanced Context</p><p className="mt-1 text-xs leading-5 text-white/40">Optional. Captions are written from the final image directly; add verified facts only when you want Sonnet to name them precisely.</p></div><button type="button" onClick={() => setContextOpen(value => !value)} className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/70">{contextOpen ? "Done" : "Add Context"}</button></div>{contextOpen && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-[11px] font-semibold text-white/48">Exact dish / product<input value={context.exactDish} onChange={event => setContext(current => ({ ...current, exactDish: event.target.value }))} placeholder="Optional verified dish" className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs font-normal text-white placeholder:text-white/25" /></label><label className="grid gap-1 text-[11px] font-semibold text-white/48">Exact drink<input value={context.exactDrink} onChange={event => setContext(current => ({ ...current, exactDrink: event.target.value }))} placeholder="Optional verified drink" className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs font-normal text-white placeholder:text-white/25" /></label><label className="grid gap-1 text-[11px] font-semibold text-white/48">Activation<input value={context.activation} onChange={event => setContext(current => ({ ...current, activation: event.target.value }))} placeholder="Optional verified activation" className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs font-normal text-white placeholder:text-white/25" /></label><label className="grid gap-1 text-[11px] font-semibold text-white/48">Factual note<input value={context.factualNote} onChange={event => setContext(current => ({ ...current, factualNote: event.target.value }))} placeholder="Optional verified note" className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs font-normal text-white placeholder:text-white/25" /></label></div>}</section>}
    {isFeed && <div className="mt-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-white/60">Caption options</p><div className="flex gap-2"><button type="button" onClick={() => void generateCaptions()} disabled={!onGenerateCaptions || captionGenerating} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/70 disabled:opacity-40">{captionGenerating ? "Generating 5 new captions…" : "Generate Captions"}</button><button type="button" onClick={() => void refreshCaptions()} disabled={!onRefreshCaptions || captionGenerating} className="rounded-lg border border-emerald-300/35 px-2.5 py-1 text-xs font-semibold text-emerald-100 disabled:opacity-40">{captionGenerating ? "Generating 5 new captions…" : "Refresh Captions"}</button></div></div>{captionNotice && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100"><span>{captionNotice}</span><button type="button" onClick={() => setContextOpen(true)} className="rounded-md border border-amber-300/35 px-2 py-1 font-semibold">Add Context</button></div>}{item.captionOptions.length > 0 && <div className="mt-3 grid gap-2">{item.captionOptions.map(option => <article key={option.id} className={`rounded-xl border p-3 text-left text-xs leading-5 ${item.selectedCaptionOptionId === option.id ? "border-emerald-300/60 bg-emerald-300/10 text-white" : "border-white/10 bg-black/20 text-white/68"}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold uppercase tracking-[0.1em] text-white/55">Option {option.optionNumber}</span><div className="flex items-center gap-2"><span title={option.validationDiagnostics.map(diagnostic => diagnostic.message).join(" ") || "Ready"} className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${option.validationStatus === "ready" ? "bg-emerald-300 text-black" : option.validationStatus === "blocked" ? "bg-red-300 text-black" : "bg-amber-300 text-black"}`}>{option.validationStatus === "ready" ? "Ready" : option.validationStatus === "blocked" ? "Blocked" : "Needs Review"}</span>{item.selectedCaptionOptionId === option.id && <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">Selected</span>}</div></div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-white">{option.body}</p><p className="mt-3 text-[11px] leading-5 text-emerald-100/80">{optionHashtagLine(option)}</p><div className="mt-3 flex gap-2"><button type="button" disabled={option.validationStatus !== "ready"} title={option.validationStatus !== "ready" ? "Review and revalidate this option before selection." : undefined} onClick={() => { if (item.captionEditedAt && item.selectedCaptionOptionId !== option.id && !window.confirm("Selecting another option will replace your saved manual caption. Continue?")) return; const finalCaption = option.renderedCaption ?? option.body; setCaption(finalCaption); void onSave(item.id, { selectedCaptionOptionId: option.id }, "Caption option selected. The full publishable caption is now ready to edit.") }} className="rounded-lg border border-emerald-300/35 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-35">Select</button><button type="button" onClick={() => setCaption(option.renderedCaption ?? option.body)} className="rounded-lg border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-white/70">Edit</button></div></article>)}</div>}</div>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">{isFeed && <label className="grid gap-1 text-xs font-semibold text-white/52">Post title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Short post title" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/30" /></label>}<label className="grid gap-1 text-xs font-semibold text-white/52">Date<input type="date" value={date} onChange={event => setDate(event.target.value)} className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white" /></label><label className="grid gap-1 text-xs font-semibold text-white/52">Time · Asia/Dubai<input type="time" value={time} onChange={event => setTime(event.target.value)} className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white" /></label></div><p className="mt-2 text-xs text-white/42">Posting-time recommendation unavailable. This manual selection is persisted with its source.</p>
    {isFeed && <label className="mt-4 grid gap-1 text-xs font-semibold text-white/52">Final publishable caption<textarea rows={8} value={caption} onChange={event => setCaption(event.target.value)} className="resize-y rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm leading-5 text-white" /><span className="text-[11px] font-normal leading-5 text-white/38">This exact saved caption is used in the Instagram preview and Planner handoff. The canonical footer is applied when you select an option.</span></label>}<div className="mt-4"><p className="text-xs font-semibold text-white/52">Platforms</p><div className="mt-2 flex flex-wrap gap-2">{(["instagram", "facebook", "linkedin"] as SocialPublishingPlatform[]).map(platform => <label key={platform} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white/68"><input type="checkbox" checked={platforms.includes(platform)} onChange={event => setPlatforms(current => event.target.checked ? [...current, platform] : current.filter(value => value !== platform))} />{platformLabel(platform)}</label>)}</div></div><label className="mt-4 grid gap-1 text-xs font-semibold text-white/52">Internal notes<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} className="resize-y rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white" /></label>
    {item.format === "carousel" && <div className="mt-4 flex gap-2"><button type="button" onClick={() => reorderSlide(-1)} disabled={slide === 0} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white disabled:opacity-30">Move slide earlier</button><button type="button" onClick={() => reorderSlide(1)} disabled={slide === item.media.length - 1} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white disabled:opacity-30">Move slide later</button></div>}{onMove && <div className="mt-4 flex gap-2"><button type="button" onClick={() => onMove(item, -1)} disabled={item.sequence === 1} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white disabled:opacity-30">Move earlier</button><button type="button" onClick={() => onMove(item, 1)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white">Move later</button></div>}
    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4"><button type="button" onClick={() => save(isFeed && !caption.trim() ? "Needs Caption" : "Ready for Review")} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white">Save</button><button type="button" onClick={() => save("Approved")} className="rounded-xl border border-sky-300/35 px-3 py-2 text-sm font-semibold text-sky-100">Approve</button>{showPlannerAction && <button type="button" onClick={() => onAddToPlanner(item)} disabled={item.status !== "Approved"} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Add to Planner</button>}</div>{item.scheduledPayloadStale && <p className="mt-3 text-xs font-semibold text-amber-200">This package changed after Planner handoff. Add it again before future execution.</p>}
  </aside>
}

function StoryDraggable({ item, onOpen }: { item: SocialContentItem; onOpen: () => void }) { const { attributes, listeners, setNodeRef } = useDraggable({ id: `story:${item.id}` }); return <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={onOpen} className="flex min-w-[112px] flex-col overflow-hidden rounded-lg border border-white/10 bg-black/25 text-left"><div className="aspect-[4/5] w-full"><MediaPreview item={item} /></div><span className="truncate p-2 text-[10px] font-semibold text-white">{cardTitle(item)}</span></button> }
function StorySlotDrop({ slot, assigned, onOpen, onRemove }: { slot: SocialPublishingWorkspace["storySlots"][number]; assigned: SocialContentItem[]; onOpen: (id: string) => void; onRemove: (id: string) => void }) { const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.id}` }); return <div ref={setNodeRef} className={`min-h-28 rounded-xl border p-2 ${isOver ? "border-emerald-300 bg-emerald-300/10" : "border-white/10 bg-black/20"}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-white">{slot.localTime} · {slot.label}</p><span className="text-[10px] text-white/40">Drop Story</span></div>{assigned.length ? <div className="mt-2 grid grid-cols-2 gap-2">{assigned.map(item => <div key={item.id} className="relative overflow-hidden rounded-lg border border-white/10"><button type="button" onClick={() => onOpen(item.id)} className="aspect-[4/5] w-full"><MediaPreview item={item} /></button><button type="button" aria-label={`Remove ${cardTitle(item)} from slot`} onClick={() => onRemove(item.id)} className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-white">×</button></div>)}</div> : <p className="mt-3 text-[11px] text-white/38">No assigned asset</p>}</div> }

function StoriesWorkspace({ workspace, storyItems, inputRef, onUpload, onDrop, onAction, onOpen }: { workspace: SocialPublishingWorkspace; storyItems: SocialContentItem[]; inputRef: React.RefObject<HTMLInputElement | null>; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDrop: (event: DragEvent<HTMLButtonElement>) => void; onAction: (body: Record<string, unknown>, message: string) => Promise<void>; onOpen: (id: string) => void }) {
  const [weekday, setWeekday] = useState(1); const [time, setTime] = useState("18:00"); const [label, setLabel] = useState(""); const [draggedId, setDraggedId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const assigned = new Set(storyItems.filter(item => item.storyScheduleSlotId).map(item => item.id))
  const missing = workspace.storySlots.flatMap(slot => monthDatesForWeekday(workspace.month.monthStart, slot.weekday).filter(date => !workspace.storyPlacements.some(placement => placement.storyScheduleSlotId === slot.id && placement.scheduledDate === date)).map(date => `${isoDateLabel(date)} · ${slot.localTime} · ${slot.label}`))
  const dropEnd = (event: DragEndEvent) => { setDraggedId(null); const slotId = typeof event.over?.id === "string" ? event.over.id.replace(/^slot:/, "") : ""; if (slotId) void onAction({ action: "assign_story_slot", itemId: String(event.active.id).replace(/^story:/, ""), slotId }, "Story assigned to the weekly slot. Apply the week to create its monthly placements.") }
  return <div className="space-y-5"><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="jarvis-eyebrow">Weekly Story schedule</p><h3 className="mt-2 text-xl font-semibold text-white">Visual weekly board</h3><p className="mt-2 text-sm text-white/50">Drop a final Story onto a weekly slot. Applying the template creates date placements while retaining a single source asset.</p></div><div className="flex flex-wrap gap-2"><UploadButton label="Upload Story assets" inputRef={inputRef} accept="image/*" multiple onChange={onUpload} onDrop={onDrop} /><button type="button" onClick={() => void onAction({ action: "auto_assign_stories" }, "Matching Story assets assigned to weekly slots.")} disabled={!storyItems.length || !workspace.storySlots.length} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Auto-assign matches</button><button type="button" onClick={() => void onAction({ action: "apply_story_week" }, "Weekly Story template applied.")} disabled={!workspace.storySlots.length} className="rounded-xl border border-emerald-300/35 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-40">Apply week to month</button><button type="button" onClick={() => void onAction({ action: "add_stories_to_planner" }, "Approved Story placements added to Planner. No external request was made.")} disabled={!workspace.storyPlacements.length} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Add Stories to Planner</button></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]"><select value={weekday} onChange={event => setWeekday(Number(event.target.value))} className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white">{[0,1,2,3,4,5,6].map(day => <option key={day} value={day}>{weekdayLabel(day)}</option>)}</select><input type="time" value={time} onChange={event => setTime(event.target.value)} className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white" /><input value={label} onChange={event => setLabel(event.target.value)} placeholder="Slot label" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/30" /><button type="button" onClick={() => void onAction({ action: "create_story_slot", weekday, localTime: time, label }, "Story slot added.").then(() => setLabel(""))} disabled={!label.trim()} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add slot</button></div>
    <DndContext sensors={sensors} onDragStart={event => setDraggedId(String(event.active.id).replace(/^story:/, ""))} onDragEnd={dropEnd} onDragCancel={() => setDraggedId(null)}><div className="mt-5 grid gap-3 lg:grid-cols-7">{[0,1,2,3,4,5,6].map(day => <div key={day} className="min-h-44 rounded-xl border border-white/10 bg-black/15 p-2"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-white">{weekdayLabel(day).slice(0, 3)}</p><span className="text-[10px] text-white/35">{workspace.storySlots.filter(slot => slot.weekday === day).length}</span></div><div className="space-y-2">{workspace.storySlots.filter(slot => slot.weekday === day).map(slot => <div key={slot.id}><StorySlotDrop slot={slot} assigned={storyItems.filter(item => item.storyScheduleSlotId === slot.id)} onOpen={onOpen} onRemove={itemId => void onAction({ action: "assign_story_slot", itemId, slotId: null }, "Story removed from weekly slot.")} /><button type="button" onClick={() => void onAction({ action: "delete_story_slot", slotId: slot.id }, "Story slot removed.")} className="mt-1 text-[10px] text-red-200/70">Remove slot</button></div>)}</div></div>)}</div><DragOverlay>{draggedId ? <div className="h-24 w-20 overflow-hidden rounded-lg border border-emerald-300 bg-black"><MediaPreview item={storyItems.find(item => item.id === draggedId)!} /></div> : null}</DragOverlay></DndContext>
  </section><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><div><p className="jarvis-eyebrow">Unscheduled Story assets</p><h3 className="mt-2 text-lg font-semibold text-white">Drag into a weekly slot</h3></div><span className="text-xs text-white/45">{storyItems.filter(item => !assigned.has(item.id)).length} ready</span></div><div className="mt-4 flex gap-3 overflow-x-auto pb-1">{storyItems.filter(item => !assigned.has(item.id)).map(item => <StoryDraggable key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}{!storyItems.length && <EmptyCopy>Upload final 9:16 Story assets to begin.</EmptyCopy>}</div>{storyItems.some(isStoryRatioWarning) && <p className="mt-4 text-xs text-amber-200">Some uploaded Story assets are not close to 9:16. Originals remain unchanged; review them before approval.</p>}</section><section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.05] p-4"><p className="text-sm font-semibold text-amber-100">Missing Story slots</p><div className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-white/65">{missing.length ? missing.map(value => <p key={value}>{value}</p>) : <p className="text-white/42">No missing slot is currently detectable.</p>}</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-semibold text-white">Monthly Story placements</p><p className="mt-1 text-xs text-white/42">{workspace.storyPlacements.length} placement{workspace.storyPlacements.length === 1 ? "" : "s"} reference existing assets; no physical duplicates.</p><div className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-white/65">{workspace.storyPlacements.slice(0, 16).map(placement => <p key={placement.id}>{isoDateLabel(placement.scheduledDate)} · {placement.scheduledTime} · {placement.status}</p>)}</div></div></section></div>
}
