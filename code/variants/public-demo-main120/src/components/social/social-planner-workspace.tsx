"use client"

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type DragEvent } from "react"
import Link from "next/link"
import { monthStartFromInput, platformLabel, plannerReadiness, shortMonthLabel, statusClass, type SocialContentItem, type SocialPlannerEntry, type SocialPublishingPlatform, type SocialPublishingWorkspace } from "@/lib/social-publishing"
import { currentSocialMonth, readSocialMonthPreference, writeSocialMonthPreference } from "@/lib/social-month-preference"
import type { SocialProviderConnectionsSnapshot } from "@/lib/social-provider-connections"

type Props = { clientId: string; providerSnapshot?: SocialProviderConnectionsSnapshot | null }
type Filter = "all" | "feed" | "reel" | "story" | "ready" | "attention" | "scheduled" | "published" | "failed" | "recovery"
type PlannerView = "month" | "week"
type BatchPreflight = { monthStart: string; ready: Array<{ itemId: string; title: string | null; format: string; scheduledForLocal: string | null; timezone: string | null; platforms: string[] }>; blocked: Array<{ itemId: string; title: string | null; reasons: string[] }> }

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function mondayMonthGrid(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00Z`)
  const weekday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - weekday)
  return Array.from({ length: 42 }, () => {
    const value = date.toISOString().slice(0, 10)
    date.setUTCDate(date.getUTCDate() + 1)
    return value
  })
}

function mondayOf(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

function shiftWeek(value: string, offset: number) {
  const date = new Date(`${mondayOf(value)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + (offset * 7))
  return date.toISOString().slice(0, 10)
}

function weekDates(value: string) {
  const date = new Date(`${mondayOf(value)}T00:00:00Z`)
  return Array.from({ length: 7 }, () => {
    const current = date.toISOString().slice(0, 10)
    date.setUTCDate(date.getUTCDate() + 1)
    return current
  })
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
}

function formatName(entry: Pick<SocialPlannerEntry, "contentKind" | "format" | "title"> | SocialContentItem) {
  if (entry.title) return entry.title
  if (entry.format === "carousel") return "Carousel"
  if (entry.contentKind === "story") return "Story"
  if (entry.contentKind === "reel") return "Reel"
  return "Feed post"
}

function entryReadiness(entry: SocialPlannerEntry) {
  const reasons: string[] = []
  if (!entry.media.length) reasons.push("Final media missing")
  if (entry.contentKind === "feed" && !entry.finalCaption) reasons.push("Final caption missing")
  if (!entry.platformTargets.some(target => target.selected)) reasons.push("Platform missing")
  if (entry.scheduledPayloadStale) reasons.push("Updated in Content Calendar")
  return { state: reasons.length ? "needs_attention" as const : "ready" as const, reasons }
}

function displayStatus(entry: SocialPlannerEntry) {
  if (entry.providerExecution?.status === "recovery_required") return { label: "Recovery required", tone: "border-amber-300/35 bg-amber-300/10 text-amber-100" }
  if (entry.providerExecution?.status === "requesting") return { label: "Scheduling…", tone: "border-sky-300/30 bg-sky-400/10 text-sky-100" }
  if (entry.providerExecution?.status === "failed" || entry.providerExecution?.status === "partial") return { label: "Failed", tone: statusClass("Failed") }
  if (entry.providerExecution?.status === "published") return { label: "Published", tone: statusClass("Published") }
  if (entry.providerExecution?.status === "publishing") return { label: "Publishing", tone: statusClass("Publishing") }
  if (entry.providerExecution?.status === "scheduled") return { label: "Scheduled", tone: statusClass("Scheduled") }
  if (entry.scheduledPayloadStale) return { label: "Needs sync", tone: "border-amber-300/35 bg-amber-300/10 text-amber-100" }
  if (entry.status === "Draft" || entry.status === "Needs Caption") return { label: "Draft", tone: "border-white/15 bg-white/[0.06] text-white/65" }
  if (entry.status === "Published") return { label: "Published", tone: statusClass(entry.status) }
  if (entry.status === "Failed") return { label: "Failed", tone: statusClass(entry.status) }
  if (entry.status === "Publishing") return { label: "Publishing", tone: statusClass(entry.status) }
  if (entry.status === "Scheduled") return { label: "Scheduled", tone: statusClass(entry.status) }
  const readiness = entryReadiness(entry)
  return readiness.state === "ready"
    ? { label: "Ready", tone: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" }
    : { label: "Needs attention", tone: "border-amber-300/35 bg-amber-300/10 text-amber-100" }
}

function entryMatchesFilter(entry: SocialPlannerEntry, filter: Filter) {
  if (filter === "all") return true
  if (filter === "feed") return entry.contentKind === "feed"
  if (filter === "reel") return entry.contentKind === "reel"
  if (filter === "story") return entry.contentKind === "story"
  if (filter === "scheduled") return entry.status === "Scheduled"
  if (filter === "published") return entry.status === "Published"
  if (filter === "failed") return entry.providerExecution?.status === "failed" || entry.providerExecution?.status === "partial" || entry.status === "Failed"
  if (filter === "recovery") return entry.providerExecution?.status === "recovery_required"
  return filter === "ready" ? entryReadiness(entry).state === "ready" && !entry.scheduledPayloadStale : entryReadiness(entry).state === "needs_attention" || entry.scheduledPayloadStale
}

async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/social/publishing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; added?: number; skipped?: Array<{ id: string; reason: string }> }
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Planner update failed.")
  return payload
}

export default function SocialPlannerWorkspace({ clientId, providerSnapshot = null }: Props) {
  const [monthInput, setMonthInput] = useState(() => readSocialMonthPreference(clientId, "planner") ?? currentSocialMonth())
  const [view, setView] = useState<PlannerView>("month")
  const [weekAnchor, setWeekAnchor] = useState(() => mondayOf(`${readSocialMonthPreference(clientId, "planner") ?? currentSocialMonth()}-01`))
  const [workspace, setWorkspace] = useState<SocialPublishingWorkspace | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<SocialPlannerEntry | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [draggedItem, setDraggedItem] = useState<SocialContentItem | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [preflight, setPreflight] = useState<BatchPreflight | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [batchAuthorization, setBatchAuthorization] = useState("")
  const [batchScheduling, setBatchScheduling] = useState(false)
  const monthStart = monthStartFromInput(monthInput)
  const connectedPlatforms = new Set((providerSnapshot?.connections ?? []).filter(connection => connection.status === "connected").map(connection => connection.platform))
  const providerReady = connectedPlatforms.has("instagram") && connectedPlatforms.has("facebook")

  const refresh = async () => {
    if (!monthStart) return
    setLoading(true)
    try {
      const response = await fetch(`/api/social/publishing?client_id=${encodeURIComponent(clientId)}&month_start=${monthStart}`, { cache: "no-store" })
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; workspace?: SocialPublishingWorkspace | null }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to load Planner.")
      setWorkspace(payload.workspace ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Planner.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, monthStart])

  const selectMonth = (next: string) => {
    setMonthInput(next)
    setWeekAnchor(mondayOf(`${next}-01`))
    writeSocialMonthPreference(clientId, "planner", next)
  }
  const selectWeek = (next: string) => {
    setWeekAnchor(next)
    const month = next.slice(0, 7)
    setMonthInput(month)
    writeSocialMonthPreference(clientId, "planner", month)
  }

  const planned = useMemo(() => workspace?.plannerEntries ?? [], [workspace])
  const visibleEntries = useMemo(() => planned.filter(entry => entryMatchesFilter(entry, filter)), [planned, filter])
  const calendar = useMemo(() => monthStart ? mondayMonthGrid(monthStart) : [], [monthStart])
  const week = useMemo(() => weekDates(weekAnchor), [weekAnchor])
  const unplanned = useMemo(() => (workspace?.items ?? []).filter(item => item.contentKind !== "story" && !item.plannerSyncedAt && item.scheduledDate && item.scheduledTime), [workspace])
  const summary = useMemo(() => ({
    feed: planned.filter(entry => entry.contentKind === "feed").length,
    reels: planned.filter(entry => entry.contentKind === "reel").length,
    stories: planned.filter(entry => entry.contentKind === "story").length,
    ready: planned.filter(entry => entryReadiness(entry).state === "ready" && !entry.scheduledPayloadStale).length,
    attention: planned.filter(entry => entryReadiness(entry).state === "needs_attention" || entry.scheduledPayloadStale).length,
    scheduled: planned.filter(entry => entry.status === "Scheduled").length,
    published: planned.filter(entry => entry.status === "Published").length,
  }), [planned])

  const run = async (action: string, values: Record<string, unknown> = {}, success?: string) => {
    if (!monthStart) return
    setError(null)
    try {
      const result = await request({ clientId, monthStart, action, ...values })
      await refresh()
      if (action === "add_ready_feed_to_planner") {
        setMessage(`${result.added ?? 0} eligible Feed post${result.added === 1 ? "" : "s"} added to Planner.${result.skipped?.length ? ` ${result.skipped.length} still need preparation.` : ""}`)
      } else setMessage(success || "Planner updated locally. No provider request was made.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Planner update failed.")
    }
  }

  const dropUnplanned = (event: DragEvent<HTMLDivElement>, date: string) => {
    event.preventDefault()
    const item = draggedItem
    setDraggedItem(null)
    if (!item) return
    void run("update_planner_schedule", { contentItemId: item.id, scheduledDate: date, scheduledTime: item.scheduledTime || (item.contentKind === "feed" ? "11:00" : "09:00") }, "Placement updated in the canonical Planner.")
      .then(() => void run("add_item_to_planner", { contentItemId: item.id }, "Added to Planner. No provider request was made."))
  }

  const reviewMonth = async () => {
    if (!monthStart) return
    setPreflightLoading(true); setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/social-executions?month_start=${encodeURIComponent(monthStart)}`, { cache: "no-store" })
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; preflight?: BatchPreflight }
      if (!response.ok || !payload.ok || !payload.preflight) throw new Error(payload.error || "Unable to review month readiness.")
      setPreflight(payload.preflight)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to review month readiness.") }
    finally { setPreflightLoading(false) }
  }

  const scheduleReviewedBatch = async () => {
    if (!preflight?.ready.length) return
    const authorization = `Schedule ${preflight.ready.length} Approved Posts`
    if (batchAuthorization !== authorization) return
    setBatchScheduling(true); setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/social-executions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "schedule_batch", itemIds: preflight.ready.map(item => item.itemId), authorization }) })
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; results?: Array<{ status: string }> }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Batch scheduling was not started.")
      await refresh(); await reviewMonth(); setMessage(`Batch finished: ${(payload.results ?? []).map(result => result.status).join(", ") || "no items"}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Batch scheduling was not started.") }
    finally { setBatchScheduling(false) }
  }

  if (!monthStart) return <p className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">Choose a valid month to open Planner.</p>

  return <section className="space-y-5">
    <header className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="jarvis-eyebrow">Planner</p><h2 className="mt-2 text-2xl font-semibold text-white">Canonical social calendar</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">Calendar placement, time and intended platforms live here. Final media and the exact approved caption stay owned by Content Calendar. {providerReady ? "Review month readiness before any explicit scheduling action." : "Provider readiness has not been verified yet; scheduling remains unavailable."}</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-black/25 p-1"><button aria-label={view === "week" ? "Previous week" : "Previous month"} type="button" onClick={() => view === "week" ? selectWeek(shiftWeek(weekAnchor, -1)) : selectMonth(shiftMonth(monthInput, -1))} className="h-9 w-9 rounded-lg text-white/65 hover:bg-white/10">‹</button><label className="grid min-w-44 gap-0.5 px-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">{view === "week" ? "Selected week" : "Selected month"}<span className="text-base font-semibold normal-case tracking-normal text-white">{view === "week" ? `${dateLabel(week[0])} – ${dateLabel(week[6])}` : shortMonthLabel(`${monthInput}-01`)}</span>{view === "month" && <input aria-label="Planner month" type="month" value={monthInput} onChange={event => selectMonth(event.target.value)} className="sr-only" />}</label><button aria-label={view === "week" ? "Next week" : "Next month"} type="button" onClick={() => view === "week" ? selectWeek(shiftWeek(weekAnchor, 1)) : selectMonth(shiftMonth(monthInput, 1))} className="h-9 w-9 rounded-lg text-white/65 hover:bg-white/10">›</button></div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6"><Summary label="Feed" value={summary.feed} /><Summary label="Reels" value={summary.reels} /><Summary label="Story placements" value={summary.stories} /><Summary label="Ready" value={summary.ready} tone="text-emerald-100" /><Summary label="Needs attention" value={summary.attention} tone="text-amber-100" /><Summary label="Published" value={summary.published} /></div>
    </header>

    {(message || error) && <p className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-300/25 bg-red-500/10 text-red-100" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"}`}>{error || message}</p>}

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-1.5"><div className="mr-1 flex rounded-lg border border-white/10 p-0.5"><button type="button" onClick={() => setView("month")} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === "month" ? "bg-emerald-300 text-black" : "text-white/55"}`}>Month</button><button type="button" onClick={() => setView("week")} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === "week" ? "bg-emerald-300 text-black" : "text-white/55"}`}>Week</button></div>{(["all", "feed", "reel", "story", "ready", "attention", "scheduled", "published", "failed", "recovery"] as Filter[]).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${filter === value ? "bg-emerald-300 text-black" : "border border-white/10 text-white/55 hover:text-white"}`}>{value === "attention" ? "Needs attention" : value === "recovery" ? "Recovery required" : value}</button>)}</div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-white/40">Dubai time · {providerReady ? "Instagram + Facebook via Zernio connected" : "provider readiness not verified"}</span><button type="button" onClick={() => void run("add_ready_feed_to_planner")} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-semibold text-black">Add ready Feed to Planner</button><button type="button" onClick={() => void reviewMonth()} disabled={preflightLoading} className="rounded-xl border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-50 disabled:opacity-50">{preflightLoading ? "Reviewing…" : "Review month readiness"}</button></div></div>
    {preflight && <section className="rounded-2xl border border-sky-300/20 bg-sky-400/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="jarvis-eyebrow">Scheduling preflight</p><h3 className="mt-1 text-base font-semibold text-white">{preflight.ready.length} ready · {preflight.blocked.length} blocked</h3><p className="mt-1 text-xs text-white/45">Review is read-only until you type the exact authorization below while live mode is enabled.</p></div><button type="button" onClick={() => setPreflight(null)} className="text-xs text-white/50">Close</button></div><div className="mt-3 grid gap-2 md:grid-cols-2"><div className="rounded-xl border border-emerald-300/15 bg-black/20 p-3"><p className="text-xs font-semibold text-emerald-100">Ready</p>{preflight.ready.length ? preflight.ready.map(item => <p key={item.itemId} className="mt-2 text-xs text-white/65">{item.title || item.format} · {item.scheduledForLocal} · {item.platforms.join(", ")}</p>) : <p className="mt-2 text-xs text-white/40">None</p>}</div><div className="rounded-xl border border-amber-300/15 bg-black/20 p-3"><p className="text-xs font-semibold text-amber-100">Blocked</p>{preflight.blocked.length ? preflight.blocked.map(item => <p key={item.itemId} className="mt-2 text-xs text-white/65">{item.title || item.itemId} · {item.reasons[0]}</p>) : <p className="mt-2 text-xs text-white/40">None</p>}</div></div>{preflight.ready.length > 0 && <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row"><input aria-label="Batch scheduling authorization" value={batchAuthorization} onChange={event => setBatchAuthorization(event.target.value)} placeholder={`Type: Schedule ${preflight.ready.length} Approved Posts`} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/30" /><button type="button" onClick={() => void scheduleReviewedBatch()} disabled={batchScheduling || batchAuthorization !== `Schedule ${preflight.ready.length} Approved Posts`} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{batchScheduling ? "Scheduling…" : `Schedule ${preflight.ready.length} Approved Posts`}</button></div>}</section>}

    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_270px]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-5">
        <div className="hidden grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38 md:grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div>
        {view === "month" ? <><div className="mt-2 hidden grid-cols-7 gap-2 md:grid">{calendar.map(date => <CalendarDay key={date} date={date} activeMonth={monthStart} entries={visibleEntries.filter(entry => entry.scheduledDate === date)} onOpen={setSelectedEntry} onDrop={dropUnplanned} />)}</div><div className="space-y-3 md:hidden">{visibleEntries.length ? visibleEntries.map(entry => <AgendaCard key={entry.id} entry={entry} onOpen={setSelectedEntry} />) : <Empty title="No matching placements" detail="Use the filters or add prepared content from Publishing." />}</div></> : <><div className="mt-2 hidden grid-cols-7 gap-2 md:grid">{week.map(date => <WeekDay key={date} date={date} entries={visibleEntries.filter(entry => entry.scheduledDate === date)} onOpen={setSelectedEntry} onDrop={dropUnplanned} />)}</div><div className="space-y-3 md:hidden">{week.map(date => <WeekAgendaDay key={date} date={date} entries={visibleEntries.filter(entry => entry.scheduledDate === date)} onOpen={setSelectedEntry} />)}</div></>}
      </section>
      <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 2xl:sticky 2xl:top-24 2xl:self-start"><p className="jarvis-eyebrow">Unplanned</p><h3 className="mt-2 text-lg font-semibold text-white">Prepared in Content Calendar</h3><p className="mt-1 text-xs leading-5 text-white/44">Drag an eligible item into a day. The calendar keeps a reference to this exact Content Calendar item; it does not copy its media or caption.</p><div className="mt-4 space-y-2">{unplanned.length ? unplanned.map(item => <UnplannedCard key={item.id} item={item} onDragStart={() => setDraggedItem(item)} onAdd={() => void run("add_item_to_planner", { contentItemId: item.id }, "Added to Planner. No provider request was made.")} />) : <Empty title="Nothing unplanned" detail="P16–P19 stay here only when they have an assigned date and are ready." compact />}</div></aside>
    </div>

    {selectedEntry && <PlannerDrawer entry={selectedEntry} clientId={clientId} onClose={() => setSelectedEntry(null)} onSaved={async (action, values, success) => { await run(action, values, success); setSelectedEntry(null) }} />}
    {loading && <p className="text-xs text-white/45">Updating Planner…</p>}
  </section>
}

function Summary({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) { return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{label}</p><p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p></div> }
function Empty({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) { return <div className={`rounded-xl border border-dashed border-white/10 bg-black/15 text-white/42 ${compact ? "p-3 text-xs" : "p-6 text-sm"}`}><p className="font-semibold text-white/58">{title}</p><p className="mt-1 leading-5">{detail}</p></div> }

function CalendarDay({ date, activeMonth, entries, onOpen, onDrop }: { date: string; activeMonth: string; entries: SocialPlannerEntry[]; onOpen: (entry: SocialPlannerEntry) => void; onDrop: (event: DragEvent<HTMLDivElement>, date: string) => void }) {
  const outside = !date.startsWith(activeMonth.slice(0, 7))
  return <div onDragOver={event => event.preventDefault()} onDrop={event => onDrop(event, date)} className={`min-h-[142px] rounded-xl border p-2 ${outside ? "border-white/[0.045] bg-black/15 text-white/25" : "border-white/10 bg-black/25"}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold">{date.slice(-2).replace(/^0/, "")}</span>{entries.length > 0 && <span className="text-[9px] text-white/38">{entries.length}</span>}</div><div className="mt-2 space-y-1.5">{entries.slice(0, 4).map(entry => <CalendarCard key={entry.id} entry={entry} onOpen={onOpen} />)}{entries.length > 4 && <p className="px-1 text-[10px] text-white/38">+{entries.length - 4} more</p>}</div></div>
}

function WeekDay({ date, entries, onOpen, onDrop }: { date: string; entries: SocialPlannerEntry[]; onOpen: (entry: SocialPlannerEntry) => void; onDrop: (event: DragEvent<HTMLDivElement>, date: string) => void }) {
  return <div onDragOver={event => event.preventDefault()} onDrop={event => onDrop(event, date)} className="min-h-[460px] rounded-xl border border-white/10 bg-black/25 p-2"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-white">{date.slice(-2).replace(/^0/, "")}</span><span className="text-[9px] text-white/38">{entries.length || ""}</span></div><div className="mt-2 space-y-2">{entries.map(entry => <CalendarCard key={entry.id} entry={entry} onOpen={onOpen} square />)}</div></div>
}

function WeekAgendaDay({ date, entries, onOpen }: { date: string; entries: SocialPlannerEntry[]; onOpen: (entry: SocialPlannerEntry) => void }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs font-semibold text-emerald-100">{dateLabel(date)}</p><div className="mt-2 space-y-2">{entries.length ? entries.map(entry => <AgendaCard key={entry.id} entry={entry} onOpen={onOpen} />) : <p className="text-xs text-white/35">No placement</p>}</div></div>
}

function CalendarCard({ entry, onOpen, square = false }: { entry: SocialPlannerEntry; onOpen: (entry: SocialPlannerEntry) => void; square?: boolean }) {
  const status = displayStatus(entry)
  const kind = entry.format === "carousel" ? "Carousel" : entry.contentKind === "story" ? "Story" : entry.contentKind === "reel" ? "Reel" : "Feed"
  return <button type="button" onClick={() => onOpen(entry)} className={`w-full rounded-lg border border-white/10 bg-white/[0.035] p-1.5 text-left transition hover:border-emerald-300/35 ${square ? "block" : "flex gap-1.5"}`}><div className={`${square ? "aspect-square w-full" : "h-9 w-8 shrink-0"} overflow-hidden rounded bg-black/30`}>{entry.media[0]?.signedUrl ? <img src={entry.media[0].signedUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[10px] text-white/35">{entry.contentKind === "story" ? "S" : entry.contentKind === "reel" ? "R" : "F"}</span>}</div><span className={`${square ? "mt-1.5 block" : "min-w-0 flex-1"}`}><span className="flex items-center justify-between gap-1"><span className="min-w-0 truncate text-[10px] font-semibold text-white">{formatName(entry)}</span><span className="shrink-0 text-[9px] text-white/42">{kind}</span></span><span className="mt-0.5 block text-[9px] text-white/48">{entry.scheduledTime || "No time"}</span><span className={`mt-1 inline-flex rounded border px-1 py-0.5 text-[8px] font-semibold ${status.tone}`}>{status.label}</span></span></button>
}

function AgendaCard({ entry, onOpen }: { entry: SocialPlannerEntry; onOpen: (entry: SocialPlannerEntry) => void }) { return <button type="button" onClick={() => onOpen(entry)} className="flex w-full gap-3 rounded-xl border border-white/10 bg-black/25 p-3 text-left"><div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-black/30">{entry.media[0]?.signedUrl && <img src={entry.media[0].signedUrl} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0"><p className="text-xs font-semibold text-emerald-100">{dateLabel(entry.scheduledDate)} · {entry.scheduledTime}</p><p className="mt-1 truncate text-sm font-semibold text-white">{formatName(entry)}</p><p className="mt-1 text-xs text-white/46">{entry.platformTargets.filter(target => target.selected).map(target => platformLabel(target.platform)).join(" + ")}</p></div></button> }
function UnplannedCard({ item, onDragStart, onAdd }: { item: SocialContentItem; onDragStart: () => void; onAdd: () => void }) { const readiness = plannerReadiness(item); return <div draggable onDragStart={onDragStart} className="flex gap-2 rounded-xl border border-white/10 bg-black/25 p-2.5"><div className="h-12 w-10 shrink-0 overflow-hidden rounded bg-black/30">{item.media[0]?.signedUrl && <img src={item.media[0].signedUrl} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{formatName(item)}</p><p className="mt-1 text-[10px] text-white/42">{item.scheduledDate} · {item.scheduledTime}</p><p className={`mt-1 text-[10px] ${readiness.state === "ready" ? "text-emerald-100" : "text-amber-100"}`}>{readiness.state === "ready" ? "Ready" : readiness.reasons[0]}</p></div><button type="button" onClick={onAdd} className="self-center rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/65">Add</button></div> }

function PlannerDrawer({ entry, clientId, onClose, onSaved }: { entry: SocialPlannerEntry; clientId: string; onClose: () => void; onSaved: (action: string, values: Record<string, unknown>, success: string) => Promise<void> }) {
  const [date, setDate] = useState(entry.scheduledDate)
  const [time, setTime] = useState(entry.scheduledTime)
  const [platforms, setPlatforms] = useState<SocialPublishingPlatform[]>(entry.platformTargets.filter(target => target.selected).map(target => target.platform))
  const status = displayStatus(entry)
  const baseValues = { contentItemId: entry.contentItemId, storyPlacementId: entry.storyPlacementId ?? null }
  return <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm"><aside className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-[#07100d] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="jarvis-eyebrow">Planner item</p><h3 className="mt-2 text-xl font-semibold text-white">{formatName(entry)}</h3><p className="mt-1 text-xs text-white/46">Origin: Content Calendar · exact caption and media remain canonical there.</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-lg text-white/60">×</button></div><div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/25"><div className="aspect-[4/5] bg-black/20">{entry.media[0]?.signedUrl && <img src={entry.media[0].signedUrl} alt={formatName(entry)} className="h-full w-full object-cover" />}</div></div><div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55">{entry.format === "carousel" ? "Carousel" : entry.contentKind === "story" ? "Story" : entry.contentKind === "reel" ? "Reel" : "Feed"}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55">Dubai time</span></div>{entry.scheduledPayloadStale && <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-50">Updated in Content Calendar. Review the current payload and choose Sync latest before future provider execution.</div>}<div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-white/55">Date<input type="date" value={date} onChange={event => setDate(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label><label className="grid gap-1 text-xs font-semibold text-white/55">Time<input type="time" value={time} onChange={event => setTime(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label></div><p className="mt-2 text-xs text-white/42">{dateLabel(date)} at {time} · Asia/Dubai</p><div className="mt-5"><p className="text-xs font-semibold text-white/55">Intended platforms</p><div className="mt-2 flex flex-wrap gap-2">{(["instagram", "facebook"] as SocialPublishingPlatform[]).map(platform => <label key={platform} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70"><input type="checkbox" checked={platforms.includes(platform)} onChange={event => setPlatforms(current => event.target.checked ? [...current, platform] : current.filter(value => value !== platform))} />{platformLabel(platform)}</label>)}</div></div>{entry.finalCaption && <div className="mt-5"><p className="text-xs font-semibold text-white/55">Final approved caption</p><pre className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/65">{entry.finalCaption}</pre></div>}<div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4"><button type="button" onClick={() => void onSaved("update_planner_schedule", { ...baseValues, scheduledDate: date, scheduledTime: time }, "Calendar placement updated. No provider request was made.")} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-black">Save placement</button><button type="button" onClick={() => void onSaved("update_planner_platforms", { ...baseValues, platforms }, "Intended platforms updated locally.")} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/70">Save platforms</button>{entry.scheduledPayloadStale && <button type="button" onClick={() => void onSaved("sync_planner_entry", baseValues, "Planner reference synced to the current Content Calendar payload.")} className="rounded-xl border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-sm font-semibold text-sky-50">Sync latest</button>}<Link href={`/clients/${clientId}/social?tab=publishing`} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/65">Open in Content Calendar</Link><button type="button" onClick={() => { if (window.confirm("Remove this reference from Planner? The Content Calendar item and its caption will remain intact.")) void onSaved("remove_planner_entry", baseValues, "Removed from Planner. Content Calendar item remains unchanged.") }} className="ml-auto rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-sm font-semibold text-red-100">Remove</button></div><p className="mt-4 text-[11px] leading-5 text-white/35">Future execution boundary: this item is calendar-ready only. Schedule and publish stay disabled until Zernio is explicitly connected.</p></aside></div>
}
