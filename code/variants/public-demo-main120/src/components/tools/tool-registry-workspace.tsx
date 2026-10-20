"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  TOOL_CATEGORIES, TOOL_CONNECTION_STATUSES, TOOL_DECISION_STATUSES, TOOL_HEALTH_STATUSES, TOOL_TYPES, TOOL_USAGE_STATUSES,
  toolCategoryLabel, toolConnectionLabel, toolHealthLabel, toolLogoPath, toolOsLabel, toolRelationshipLabel, toolUsageLabel,
  type ToolCapabilityLink, type ToolRecord, type ToolRegistrySnapshot, type ToolUsageStatus, type ToolWithRelations,
} from "@/lib/tools"

type QuickFilter = "all" | "active" | "connected" | "experimental" | "planned" | "explore" | "attention"
type Draft = Partial<ToolRecord> & { capabilityLinks: Array<Pick<ToolCapabilityLink, "roadmap_item_id" | "relationship_type">> }

const usageOrder: Record<ToolUsageStatus, number> = { active: 0, experimental: 1, planned: 2, explore: 3, deprecated: 4 }
const usageTone: Record<ToolUsageStatus, string> = {
  active: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100", experimental: "border-violet-300/30 bg-violet-300/10 text-violet-100",
  planned: "border-sky-300/30 bg-sky-300/10 text-sky-100", explore: "border-amber-300/30 bg-amber-300/10 text-amber-100", deprecated: "border-white/10 bg-white/5 text-white/45",
}
const connectionTone: Record<ToolRecord["connection_status"], string> = {
  connected: "border-emerald-300/30 bg-emerald-300/[.07] text-emerald-100", configured: "border-sky-300/30 bg-sky-300/[.07] text-sky-100",
  partial: "border-amber-300/30 bg-amber-300/[.07] text-amber-100", not_connected: "border-white/10 bg-white/[.035] text-white/55",
  not_required: "border-white/10 bg-white/[.035] text-white/55", unknown: "border-white/10 bg-white/[.035] text-white/55", error: "border-rose-300/35 bg-rose-300/10 text-rose-100",
}

function requestJson(url: string, options?: RequestInit) {
  return fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } }).then(async response => {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Tool Registry request failed.")
    return data as ToolRegistrySnapshot
  })
}

function blankDraft(): Draft {
  return {
    name: "", provider: "", category: "other", tool_type: "candidate", description: "", jarvis_usage: "", why_we_use: "",
    usage_status: "explore", connection_status: "not_connected", health_status: "not_checked", potential_value: null, decision_status: "not_evaluated",
    logo_key: "", official_website: "", documentation_url: "", developer_docs_url: "", configuration_summary: "", alternatives: [], notes: "",
    os_release_overrides: [], is_core: false, capabilityLinks: [],
  }
}

function ToolMark({ tool, className = "h-14 w-14" }: { tool: Pick<ToolRecord, "name" | "logo_key" | "category">; className?: string }) {
  const src = toolLogoPath(tool.logo_key)
  const paleCanvas = ["anthropic", "github", "n8n", "posthog", "resend", "sentry"].includes(tool.logo_key ?? "")
  return <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 ${paleCanvas ? "bg-white/90" : "bg-white/[.06]"} p-2.5`}>
    {src ? <Image src={src} alt={`${tool.name} logo`} width={56} height={56} unoptimized className="h-full w-full object-contain" /> : <span aria-label={`${tool.name} icon`} className="text-lg font-semibold uppercase text-emerald-100">{tool.name.slice(0, 2)}</span>}
  </div>
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.11em] ${className}`}>{children}</span> }

export default function ToolRegistryWorkspace({ initialSnapshot }: { initialSnapshot: ToolRegistrySnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")
  const [category, setCategory] = useState("all")
  const [os, setOs] = useState("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<ToolWithRelations | null>(null)
  const [composer, setComposer] = useState<"add" | "edit" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const counts = useMemo(() => ({
    total: snapshot.tools.length, active: snapshot.tools.filter(tool => tool.usage_status === "active").length,
    connected: snapshot.tools.filter(tool => tool.connection_status === "connected").length,
    experimental: snapshot.tools.filter(tool => tool.usage_status === "experimental").length,
    planned: snapshot.tools.filter(tool => tool.usage_status === "planned").length,
    explore: snapshot.tools.filter(tool => tool.usage_status === "explore").length,
    deprecated: snapshot.tools.filter(tool => tool.usage_status === "deprecated").length,
    attention: snapshot.tools.filter(tool => tool.health_status === "needs_attention" || tool.connection_status === "error").length,
  }), [snapshot])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return snapshot.tools.filter(tool => {
      if (quickFilter === "active" && tool.usage_status !== "active") return false
      if (quickFilter === "connected" && tool.connection_status !== "connected") return false
      if (quickFilter === "experimental" && tool.usage_status !== "experimental") return false
      if (quickFilter === "planned" && tool.usage_status !== "planned") return false
      if (quickFilter === "explore" && tool.usage_status !== "explore") return false
      if (quickFilter === "attention" && tool.health_status !== "needs_attention" && tool.connection_status !== "error") return false
      if (category !== "all" && tool.category !== category) return false
      if (os !== "all" && !tool.osSlugs.includes(os)) return false
      if (!query) return tool.usage_status !== "deprecated"
      const haystack = [tool.name, tool.provider, tool.description, tool.jarvis_usage, tool.category, ...tool.capabilityLinks.map(link => link.capability?.title ?? "")].join(" ").toLowerCase()
      return haystack.includes(query)
    }).sort((a, b) => usageOrder[a.usage_status] - usageOrder[b.usage_status] || Number(b.is_core) - Number(a.is_core) || a.name.localeCompare(b.name))
  }, [snapshot, quickFilter, category, os, search])

  function refresh(next: ToolRegistrySnapshot) {
    setSnapshot(next)
    setSelected(current => current ? next.tools.find(tool => tool.id === current.id) ?? null : null)
  }
  async function save(draft: Draft) {
    setSaving(true); setError(null)
    try {
      const next = composer === "add"
        ? await requestJson("/api/tools", { method: "POST", body: JSON.stringify(draft) })
        : await requestJson(`/api/tools/${selected?.id}`, { method: "PATCH", body: JSON.stringify({ expectedUpdatedAt: selected?.updated_at, patch: draft }) })
      refresh(next); setComposer(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save Tool.") }
    finally { setSaving(false) }
  }
  async function quickUpdate(patch: Partial<Draft>) {
    if (!selected) return
    await save({ ...selected, ...patch, capabilityLinks: selected.capabilityLinks.map(link => ({ roadmap_item_id: link.roadmap_item_id, relationship_type: link.relationship_type })) })
  }

  const groups: Array<{ status: ToolUsageStatus; title: string; note: string }> = [
    { status: "active", title: "Active Stack", note: "Technology in meaningful use today." },
    { status: "experimental", title: "Experimental", note: "Working paths or manual workflows under active evaluation." },
    { status: "planned", title: "Planned", note: "Committed technology needs tied to the Product Roadmap." },
    { status: "explore", title: "Explore", note: "Curated options worth investigating before commitment." },
  ]

  return <main className="min-h-screen w-full overflow-x-hidden bg-[#050806] pl-[72px] text-white"><div className="mx-auto w-full min-w-0 max-w-[1640px] px-4 py-6 sm:px-6 lg:px-8">
    <header className="border-b border-white/10 pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-200/70">System workspace</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Jarvis Tool Registry</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">The external technology, platforms and services powering and extending Jarvis OS.</p>
      </div><button onClick={() => { setError(null); setComposer("add") }} className="rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#062016] transition hover:bg-emerald-200">Add Tool</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Tools" value={String(counts.total)} note={`${counts.active} active · ${counts.experimental} experimental`} />
        <Metric label="Connected" value={String(counts.connected)} note="Working runtime integrations only" />
        <Metric label="Planned" value={String(counts.planned)} note="Linked to future capabilities" />
        <Metric label="Explore" value={String(counts.explore)} note="Curated research shortlist" />
        <Metric label="Needs Attention" value={String(counts.attention)} note={counts.attention ? "Requires a decision or verification" : "No known tooling issue"} tone={counts.attention ? "rose" : "emerald"} />
      </div>
    </header>

    {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error" className="text-lg">×</button></div>}

    <section aria-label="Tool filters" className="mt-6 flex flex-col gap-3 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap gap-2">{(["all", "active", "connected", "experimental", "planned", "explore", "attention"] as QuickFilter[]).map(filter => <button key={filter} onClick={() => setQuickFilter(filter)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${quickFilter === filter ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100" : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"}`}>{filter === "all" ? "All" : filter === "attention" ? "Needs Attention" : filter === "connected" ? "Connected" : toolUsageLabel(filter as ToolUsageStatus)}</button>)}</div>
      <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto] xl:min-w-[560px]"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tools, providers, capabilities..." className="w-full rounded-md border border-white/12 bg-black/25 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-emerald-300/50" aria-label="Search tools" />
        <select value={category} onChange={event => setCategory(event.target.value)} className="rounded-md border border-white/12 bg-[#0b100d] px-3 py-2 text-sm text-white/75"><option value="all">All categories</option>{TOOL_CATEGORIES.map(value => <option key={value} value={value}>{toolCategoryLabel(value)}</option>)}</select>
        <select value={os} onChange={event => setOs(event.target.value)} className="rounded-md border border-white/12 bg-[#0b100d] px-3 py-2 text-sm text-white/75"><option value="all">All OS releases</option>{["os1-create", "os2-distribute", "os3-grow", "os4-operate"].map(value => <option key={value} value={value}>{toolOsLabel(value)}</option>)}</select>
      </div>
    </section>

    <section className="mt-6 min-w-0 space-y-9">{groups.map(group => {
      const tools = visible.filter(tool => tool.usage_status === group.status)
      if (!tools.length) return null
      return <div key={group.status} className="min-w-0"><div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/65">{group.status}</p><h2 className="mt-1 text-xl font-semibold">{group.title}</h2><p className="mt-1 text-xs text-white/45">{group.note}</p></div><span className="shrink-0 text-xs text-white/40">{tools.length} tool{tools.length === 1 ? "" : "s"}</span></div>
        <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">{tools.map(tool => <ToolCard key={tool.id} tool={tool} onOpen={() => { setError(null); setSelected(tool) }} />)}</div>
      </div>
    })}
      {visible.length === 0 && <div className="rounded-lg border border-dashed border-white/15 bg-white/[.02] px-5 py-14 text-center"><p className="text-base font-medium">No Tools match these filters.</p><p className="mt-2 text-sm text-white/45">Try clearing the search or selecting a broader status.</p></div>}
    </section>
  </div>
  {selected && !composer && <ToolDrawer tool={selected} onClose={() => setSelected(null)} onEdit={() => { setError(null); setComposer("edit") }} onPromote={() => quickUpdate({ usage_status: "planned", decision_status: "promoted_to_planned" })} onReject={() => quickUpdate({ decision_status: "rejected", usage_status: "deprecated" })} />}
  {composer && <ToolEditor tool={composer === "edit" ? selected : null} capabilities={snapshot.capabilities} saving={saving} error={error} onClose={() => setComposer(null)} onSave={save} />}
  </main>
}

function Metric({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "rose" | "emerald" }) { return <div className="min-w-0 rounded-lg border border-white/10 bg-white/[.035] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-white/40">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone === "rose" ? "text-rose-100" : tone === "emerald" ? "text-emerald-100" : ""}`}>{value}</p><p className="mt-1 text-xs text-white/45">{note}</p></div> }

function ToolCard({ tool, onOpen }: { tool: ToolWithRelations; onOpen: () => void }) { return <button onClick={onOpen} className="group min-h-[232px] min-w-0 rounded-lg border border-white/10 bg-[#0b100d] p-4 text-left transition hover:border-emerald-200/35 hover:bg-white/[.025] focus:outline-none focus:ring-2 focus:ring-emerald-200/45"><div className="flex min-w-0 items-start gap-3"><ToolMark tool={tool} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-base font-semibold text-white">{tool.name}</h3><p className="mt-0.5 truncate text-xs text-white/45">{tool.provider || toolCategoryLabel(tool.category)}</p></div>{tool.is_core && <span title="Core Stack" className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100">CORE</span>}</div><p className="mt-3 line-clamp-2 text-xs leading-relaxed text-white/50">{tool.description}</p></div></div>
  <div className="mt-4 flex flex-wrap gap-1.5"><Badge className={usageTone[tool.usage_status]}>{toolUsageLabel(tool.usage_status)}</Badge><Badge className={connectionTone[tool.connection_status]}>{toolConnectionLabel(tool.connection_status)}</Badge></div>
  <div className="mt-4 flex items-center justify-between gap-2"><span className="truncate text-[11px] text-white/40">{toolCategoryLabel(tool.category)}</span><div className="flex shrink-0 gap-1">{tool.osSlugs.map(slug => <span key={slug} className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/55">{toolOsLabel(slug)}</span>)}</div></div>
  </button> }

function ToolDrawer({ tool, onClose, onEdit, onPromote, onReject }: { tool: ToolWithRelations; onClose: () => void; onEdit: () => void; onPromote: () => void; onReject: () => void }) {
  const isExplore = tool.usage_status === "explore"
  return <div className="fixed inset-0 z-[60] flex justify-end bg-black/65"><aside role="dialog" aria-modal="true" aria-label={`${tool.name} details`} className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/15 bg-[#0b100d] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><ToolMark tool={tool} className="h-16 w-16" /><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/65">{toolCategoryLabel(tool.category)}</p><h2 className="mt-1 text-2xl font-semibold">{tool.name}</h2>{tool.provider && <p className="mt-1 text-sm text-white/45">{tool.provider}</p>}</div></div><button onClick={onClose} aria-label="Close tool details" className="rounded-md p-2 text-2xl leading-none text-white/50 hover:bg-white/5 hover:text-white">×</button></div>
    <div className="mt-5 flex flex-wrap gap-2"><Badge className={usageTone[tool.usage_status]}>{toolUsageLabel(tool.usage_status)}</Badge><Badge className={connectionTone[tool.connection_status]}>{toolConnectionLabel(tool.connection_status)}</Badge><Badge className={tool.health_status === "needs_attention" ? "border-rose-300/30 bg-rose-300/10 text-rose-100" : "border-white/10 bg-white/[.035] text-white/55"}>{toolHealthLabel(tool.health_status)}</Badge></div>
    <section className="mt-6 border-t border-white/10 pt-5"><h3 className="text-sm font-semibold">Overview</h3><p className="mt-2 text-sm leading-relaxed text-white/65">{tool.description}</p></section>
    <DrawerSection title="How Jarvis Uses It" text={tool.jarvis_usage} /><DrawerSection title="Why We Use It" text={tool.why_we_use} />
    <section className="mt-6 border-t border-white/10 pt-5"><h3 className="text-sm font-semibold">Connection</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Info label="Connection status" value={toolConnectionLabel(tool.connection_status)} /><Info label="Health" value={toolHealthLabel(tool.health_status)} /><Info label="Last verified" value={tool.last_verified_at ? new Date(tool.last_verified_at).toLocaleString() : "Not verified"} /><Info label="Configuration" value={tool.configuration_summary || "No additional configuration summary."} /></div></section>
    <section className="mt-6 border-t border-white/10 pt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Capabilities & Roadmap</h3><Link href="/roadmap" className="text-xs font-medium text-emerald-200 hover:text-emerald-100">View Roadmap</Link></div><div className="mt-3 space-y-2">{tool.capabilityLinks.length ? tool.capabilityLinks.map(link => <div key={link.id} className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-xs font-semibold text-white/75">{link.capability?.title || "Unavailable capability"}</p><p className="mt-1 text-[11px] text-white/45">{toolRelationshipLabel(link.relationship_type)} · {link.capability ? toolOsLabel(link.capability.os_slug) : "Unassigned OS"}</p></div>) : <p className="text-sm text-white/45">No canonical Roadmap capability linked yet.</p>}</div>{tool.os_release_overrides.length > 0 && <div className="mt-3 flex gap-1.5">{tool.os_release_overrides.map(slug => <Badge key={slug} className="border-white/10 bg-white/[.035] text-white/65">{toolOsLabel(slug)} reference</Badge>)}</div>}</section>
    {(tool.official_website || tool.documentation_url || tool.developer_docs_url || tool.alternatives.length) && <section className="mt-6 border-t border-white/10 pt-5"><h3 className="text-sm font-semibold">Research & Alternatives</h3><div className="mt-3 flex flex-wrap gap-2">{tool.official_website && <ExternalLink href={tool.official_website} label="Official site" />}{tool.documentation_url && <ExternalLink href={tool.documentation_url} label="Documentation" />}{tool.developer_docs_url && <ExternalLink href={tool.developer_docs_url} label="Developer docs" />}</div>{tool.alternatives.length > 0 && <p className="mt-3 text-sm text-white/55">Alternatives: {tool.alternatives.join(", ")}</p>}</section>}
    {tool.notes && <DrawerSection title="Internal Notes" text={tool.notes} />}
    <section className="mt-6 border-t border-white/10 pt-5"><h3 className="text-sm font-semibold">Activity</h3><div className="mt-3 space-y-2">{tool.activity.length ? tool.activity.map(activity => <div key={activity.id} className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-xs text-white/75">{activity.description}</p><p className="mt-1 text-[10px] text-white/35">{new Date(activity.created_at).toLocaleString()}</p></div>) : <p className="text-sm text-white/45">No recorded activity yet.</p>}</div></section>
    <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5"><div className="flex gap-2">{isExplore && <button onClick={onPromote} className="rounded-md border border-sky-300/35 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-300/10">Promote to Planned</button>}{isExplore && <button onClick={onReject} className="rounded-md border border-rose-300/30 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-300/10">Reject</button>}</div><button onClick={onEdit} className="rounded-md bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#062016] hover:bg-emerald-200">Edit Tool</button></div>
  </aside></div>
}

function DrawerSection({ title, text }: { title: string; text?: string | null }) { if (!text) return null; return <section className="mt-6 border-t border-white/10 pt-5"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-white/60">{text}</p></section> }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/35">{label}</p><p className="mt-1 text-xs leading-relaxed text-white/70">{value}</p></div> }
function ExternalLink({ href, label }: { href: string; label: string }) { return <a href={href} target="_blank" rel="noreferrer" className="rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-white/70 hover:border-emerald-200/40 hover:text-emerald-100">{label} ↗</a> }

function ToolEditor({ tool, capabilities, saving, error, onClose, onSave }: { tool: ToolWithRelations | null; capabilities: ToolRegistrySnapshot["capabilities"]; saving: boolean; error: string | null; onClose: () => void; onSave: (draft: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>(() => tool ? { ...tool, capabilityLinks: tool.capabilityLinks.map(link => ({ roadmap_item_id: link.roadmap_item_id, relationship_type: link.relationship_type })) } : blankDraft())
  const [alternatives, setAlternatives] = useState((tool?.alternatives ?? []).join(", "))
  const editing = Boolean(tool)
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })) }
  function submit(event: FormEvent) { event.preventDefault(); onSave({ ...draft, alternatives: alternatives.split(",").map(item => item.trim()).filter(Boolean) }) }
  function toggleCapability(capabilityId: string) { setDraft(current => ({ ...current, capabilityLinks: current.capabilityLinks.some(link => link.roadmap_item_id === capabilityId) ? current.capabilityLinks.filter(link => link.roadmap_item_id !== capabilityId) : [...current.capabilityLinks, { roadmap_item_id: capabilityId, relationship_type: "candidate_for" }] })) }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-5"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-white/15 bg-[#0b100d] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">Tool Registry</p><h2 className="mt-1 text-xl font-semibold">{editing ? `Edit ${tool?.name}` : "Add Tool"}</h2><p className="mt-1 text-xs text-white/45">Connection summaries are safe for display. Never enter credentials here.</p></div><button type="button" onClick={onClose} aria-label="Close tool editor" className="text-2xl text-white/50 hover:text-white">×</button></div>
    {error && <p role="alert" className="mt-4 rounded-md border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Name"><input required value={draft.name ?? ""} onChange={event => change("name", event.target.value)} className={fieldClass} /></Field><Field label="Provider"><input value={draft.provider ?? ""} onChange={event => change("provider", event.target.value)} placeholder="Optional" className={fieldClass} /></Field>
      <Field label="Category"><select value={draft.category} onChange={event => change("category", event.target.value as ToolRecord["category"])} className={fieldClass}>{TOOL_CATEGORIES.map(value => <option key={value} value={value}>{toolCategoryLabel(value)}</option>)}</select></Field><Field label="Tool type"><select value={draft.tool_type} onChange={event => change("tool_type", event.target.value as ToolRecord["tool_type"])} className={fieldClass}>{TOOL_TYPES.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></Field>
      <Field label="Usage status"><select value={draft.usage_status} onChange={event => change("usage_status", event.target.value as ToolRecord["usage_status"])} className={fieldClass}>{TOOL_USAGE_STATUSES.map(value => <option key={value} value={value}>{toolUsageLabel(value)}</option>)}</select></Field><Field label="Connection status"><select value={draft.connection_status} onChange={event => change("connection_status", event.target.value as ToolRecord["connection_status"])} className={fieldClass}>{TOOL_CONNECTION_STATUSES.map(value => <option key={value} value={value}>{toolConnectionLabel(value)}</option>)}</select></Field>
      <Field label="Health"><select value={draft.health_status} onChange={event => change("health_status", event.target.value as ToolRecord["health_status"])} className={fieldClass}>{TOOL_HEALTH_STATUSES.map(value => <option key={value} value={value}>{toolHealthLabel(value)}</option>)}</select></Field><Field label="Potential value"><select value={draft.potential_value ?? ""} onChange={event => change("potential_value", event.target.value as Draft["potential_value"])} className={fieldClass}><option value="">Not assessed</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
      <Field label="Explore decision"><select value={draft.decision_status ?? ""} onChange={event => change("decision_status", event.target.value as Draft["decision_status"])} className={fieldClass}><option value="">Not applicable</option>{TOOL_DECISION_STATUSES.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></Field></div>
    <Field label="Description"><textarea required value={draft.description ?? ""} onChange={event => change("description", event.target.value)} rows={3} className={fieldClass} /></Field><Field label="How Jarvis uses it"><textarea value={draft.jarvis_usage ?? ""} onChange={event => change("jarvis_usage", event.target.value)} rows={3} className={fieldClass} /></Field><Field label="Why we use it"><textarea value={draft.why_we_use ?? ""} onChange={event => change("why_we_use", event.target.value)} rows={2} className={fieldClass} /></Field>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Official website"><input type="url" value={draft.official_website ?? ""} onChange={event => change("official_website", event.target.value)} className={fieldClass} /></Field><Field label="Documentation"><input type="url" value={draft.documentation_url ?? ""} onChange={event => change("documentation_url", event.target.value)} className={fieldClass} /></Field><Field label="Developer docs"><input type="url" value={draft.developer_docs_url ?? ""} onChange={event => change("developer_docs_url", event.target.value)} className={fieldClass} /></Field><Field label="Logo key"><input value={draft.logo_key ?? ""} onChange={event => change("logo_key", event.target.value)} placeholder="Known local logo key optional" className={fieldClass} /></Field></div>
    <Field label="Safe configuration summary"><textarea value={draft.configuration_summary ?? ""} onChange={event => change("configuration_summary", event.target.value)} rows={2} placeholder="Never include keys, tokens or passwords." className={fieldClass} /></Field><Field label="Alternatives"><input value={alternatives} onChange={event => setAlternatives(event.target.value)} placeholder="Comma separated" className={fieldClass} /></Field><Field label="Internal notes"><textarea value={draft.notes ?? ""} onChange={event => change("notes", event.target.value)} rows={2} className={fieldClass} /></Field>
    <section className="mt-6 border-t border-white/10 pt-5"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Roadmap capabilities</h3><p className="mt-1 text-xs text-white/45">OS badges derive from these canonical capability links. Choose a relationship for each selected item.</p></div><label className="flex shrink-0 items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={Boolean(draft.is_core)} onChange={event => change("is_core", event.target.checked)} /> Core stack</label></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{capabilities.map(capability => { const link = draft.capabilityLinks.find(candidate => candidate.roadmap_item_id === capability.id); return <div key={capability.id} className={`rounded-md border p-3 ${link ? "border-emerald-300/30 bg-emerald-300/[.06]" : "border-white/10 bg-black/20"}`}><label className="flex items-start gap-2 text-xs text-white/75"><input type="checkbox" checked={Boolean(link)} onChange={() => toggleCapability(capability.id)} /><span>{capability.title}<span className="ml-1 text-white/40">· {toolOsLabel(capability.os_slug)}</span></span></label>{link && <select value={link.relationship_type} onChange={event => setDraft(current => ({ ...current, capabilityLinks: current.capabilityLinks.map(candidate => candidate.roadmap_item_id === capability.id ? { ...candidate, relationship_type: event.target.value as ToolCapabilityLink["relationship_type"] } : candidate) }))} className="mt-2 w-full rounded border border-white/15 bg-black/25 px-2 py-1.5 text-[11px] text-white/75"><option value="used_by">Used by</option><option value="required_for">Required for</option><option value="candidate_for">Candidate for</option></select>}</div> })}</div></section>
    <div className="mt-7 flex justify-end gap-2 border-t border-white/10 pt-5"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-white/65 hover:bg-white/5">Cancel</button><button disabled={saving} className="rounded-md bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#062016] disabled:opacity-50">{saving ? "Saving..." : editing ? "Save changes" : "Add Tool"}</button></div>
  </form></div>
}

const fieldClass = "mt-1.5 w-full rounded-md border border-white/15 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50"
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-3 block text-xs text-white/55">{label}{children}</label> }
