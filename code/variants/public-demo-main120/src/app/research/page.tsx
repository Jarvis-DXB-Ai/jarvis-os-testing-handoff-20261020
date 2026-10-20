"use client"

import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type ResearchItem = {
  id: string
  created_at: string
  title: string
  category: string | null
  source_type: string | null
  source_name: string | null
  url: string | null
  summary: string | null
  key_insights: string | null
  tags: string[] | null
  importance: number
  status: string
}

type ResearchLink = {
  id: string
  research_id: string
  link_type: string | null
  notes: string | null
  client_id: string | null
  skill_id: string | null
  agent_id: string | null
  monthly_cycle_id: string | null
  clients: { name: string } | null
  agent_skills: { name: string } | null
  agents: { agent_name: string } | null
  monthly_cycles: { month: string; year: number } | null
}

type DropdownOption = { id: string; label: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Marketing", "Funnel Systems", "Copywriting", "Visual Inspiration",
  "Branding", "Social Media", "Paid Ads", "Cinematography",
  "AI Workflows", "Automation", "Sales", "Psychology",
]

const SOURCE_TYPES = [
  "Podcast", "YouTube", "Website", "Pinterest", "Awwwards",
  "Book", "Course", "Internal", "Competitor", "Client",
]

const LINK_TYPES = [
  "Inspiration", "Strategy", "Brand Reference", "Funnel Reference",
  "Prompt Reference", "QC Reference", "Competitor Insight", "Educational",
]

const TARGET_TYPES = ["Client", "Skill", "Agent", "Cycle"] as const
type TargetType = typeof TARGET_TYPES[number]

const CATEGORY_COLORS: Record<string, string> = {
  "Marketing":          "border-blue-900 text-blue-400",
  "Funnel Systems":     "border-violet-900 text-violet-400",
  "Copywriting":        "border-pink-900 text-pink-400",
  "Visual Inspiration": "border-rose-900 text-rose-400",
  "Branding":           "border-amber-900 text-amber-400",
  "Social Media":       "border-sky-900 text-sky-400",
  "Paid Ads":           "border-orange-900 text-orange-400",
  "Cinematography":     "border-teal-900 text-teal-400",
  "AI Workflows":       "border-cyan-900 text-cyan-400",
  "Automation":         "border-green-900 text-green-400",
  "Sales":              "border-red-900 text-red-400",
  "Psychology":         "border-purple-900 text-purple-400",
}

const LINK_TYPE_COLORS: Record<string, string> = {
  "Inspiration":        "border-pink-900 text-pink-400",
  "Strategy":           "border-violet-900 text-violet-400",
  "Brand Reference":    "border-amber-900 text-amber-400",
  "Funnel Reference":   "border-orange-900 text-orange-400",
  "Prompt Reference":   "border-cyan-900 text-cyan-400",
  "QC Reference":       "border-red-900 text-red-400",
  "Competitor Insight": "border-yellow-900 text-yellow-400",
  "Educational":        "border-green-900 text-green-400",
}

const SOURCE_ICONS: Record<string, string> = {
  "Podcast": "🎙", "YouTube": "▶", "Website": "🌐", "Pinterest": "📌",
  "Awwwards": "🏆", "Book": "📖", "Course": "🎓", "Internal": "🔒",
  "Competitor": "👁", "Client": "🤝",
}

const IMPORTANCE_COLORS: Record<number, string> = {
  1: "text-gray-700", 2: "text-gray-600", 3: "text-gray-500",
  4: "text-yellow-500", 5: "text-red-500",
}

const IMPORTANCE_LABELS: Record<number, string> = {
  1: "Low", 2: "Minor", 3: "Normal", 4: "High", 5: "Critical",
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "", category: CATEGORIES[0], source_type: SOURCE_TYPES[0],
  source_name: "", url: "", summary: "", key_insights: "",
  tags: "", importance: 3,
}

export default function ResearchPage() {
  const [items, setItems] = useState<ResearchItem[]>([])
  const [links, setLinks] = useState<ResearchLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [itemsRes, linksRes] = await Promise.all([
      supabase.from("research_library").select("*").eq("status", "active").order("created_at", { ascending: false }),
      supabase.from("research_links").select(`
        id, research_id, link_type, notes,
        client_id, skill_id, agent_id, monthly_cycle_id,
        clients(name),
        agent_skills(name),
        agents(agent_name),
        monthly_cycles(month, year)
      `),
    ])
    if (itemsRes.error) setError(itemsRes.error.message)
    else setItems(itemsRes.data ?? [])
    setLinks((linksRes.data ?? []) as unknown as ResearchLink[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const activeCategories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[]

  const filtered = items.filter((item) => {
    const matchCat = filterCategory === "all" || item.category === filterCategory
    const q = search.toLowerCase()
    const matchSearch = !q ||
      item.title.toLowerCase().includes(q) ||
      item.summary?.toLowerCase().includes(q) ||
      item.key_insights?.toLowerCase().includes(q) ||
      item.source_name?.toLowerCase().includes(q) ||
      (item.tags ?? []).some((t) => t.toLowerCase().includes(q))
    return matchCat && matchSearch
  })

  // Count links per item
  const linkCounts: Record<string, number> = {}
  for (const l of links) linkCounts[l.research_id] = (linkCounts[l.research_id] ?? 0) + 1

  const set = (k: keyof typeof EMPTY_FORM, v: string | number) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean)
    const { data, error } = await supabase
      .from("research_library")
      .insert({
        title: form.title.trim(),
        category: form.category || null,
        source_type: form.source_type || null,
        source_name: form.source_name.trim() || null,
        url: form.url.trim() || null,
        summary: form.summary.trim() || null,
        key_insights: form.key_insights.trim() || null,
        tags: tags.length ? tags : null,
        importance: form.importance,
        status: "active",
      })
      .select().single()
    if (!error && data) { setItems((prev) => [data, ...prev]); setForm(EMPTY_FORM); setShowForm(false) }
    else if (error) setError(error.message)
    setSaving(false)
  }

  const archive = async (id: string) => {
    await supabase.from("research_library").update({ status: "archived" }).eq("id", id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const addLink = (link: ResearchLink) => setLinks((prev) => [link, ...prev])
  const removeLink = (linkId: string) => setLinks((prev) => prev.filter((l) => l.id !== linkId))

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Jarvis OS</p>
              <h1 className="mt-2 text-4xl font-bold">Research Library</h1>
              <p className="mt-2 text-sm text-gray-500">
                Intelligence archive — link research to clients, skills, agents, and cycles.
              </p>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-sm text-gray-600">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
              {!showForm && (
                <button onClick={() => setShowForm(true)}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm text-gray-300 transition hover:border-neutral-500 hover:text-gray-900">
                  + Add research
                </button>
              )}
            </div>
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-900 bg-red-950/20 px-5 py-3 text-sm text-red-400">{error}</div>}

          {/* Add form */}
          {showForm && (
            <div className="mt-6 rounded-2xl border border-gray-300 bg-gray-50 p-6 space-y-4">
              <p className="text-sm font-semibold text-gray-900">New research item</p>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Title <span className="text-gray-700">(required)</span></label>
                <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Hears Funnel Podcast"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-neutral-500 focus:outline-none" autoFocus />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">Category</label>
                  <select value={form.category} onChange={(e) => set("category", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">Source Type</label>
                  <select value={form.source_type} onChange={(e) => set("source_type", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none">
                    {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">Importance</label>
                  <select value={form.importance} onChange={(e) => set("importance", Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none">
                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} — {IMPORTANCE_LABELS[n]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">Source Name</label>
                  <input value={form.source_name} onChange={(e) => set("source_name", e.target.value)} placeholder="e.g. Vince Hears"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-neutral-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">URL</label>
                  <input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-neutral-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Summary</label>
                <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} rows={3}
                  placeholder="Brief overview…"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-neutral-500 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Key Insights</label>
                <textarea value={form.key_insights} onChange={(e) => set("key_insights", e.target.value)} rows={3}
                  placeholder="What should agents remember from this?"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-neutral-500 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Tags <span className="text-gray-700">(comma-separated)</span></label>
                <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="e.g. retargeting, funnel, high-ticket"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-neutral-500 focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={submit} disabled={saving || !form.title.trim()}
                  className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-100 disabled:opacity-40">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm text-gray-400 transition hover:text-gray-900">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Search + filters */}
          {!loading && items.length > 0 && (
            <div className="mt-7 space-y-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, summary, insights, tags…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:outline-none" />
              {activeCategories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFilterCategory("all")}
                    className={`rounded-xl border px-4 py-1.5 text-xs transition ${filterCategory === "all" ? "border-white bg-white text-black" : "border-gray-300 text-gray-400 hover:border-neutral-500 hover:text-gray-900"}`}>
                    All ({items.length})
                  </button>
                  {activeCategories.map((cat) => (
                    <button key={cat} onClick={() => setFilterCategory(cat === filterCategory ? "all" : cat)}
                      className={`rounded-xl border px-4 py-1.5 text-xs transition ${filterCategory === cat ? "border-white bg-white text-black" : "border-gray-300 text-gray-400 hover:border-neutral-500 hover:text-gray-900"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Items */}
          <div className="mt-5 space-y-3">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <div className="h-4 w-1/2 rounded bg-gray-100" />
                    <div className="mt-3 h-3 w-1/3 rounded bg-gray-100" />
                  </div>
                ))
              : filtered.length === 0
              ? (
                <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">{items.length === 0 ? "No research items yet." : "No results for your search."}</p>
                </div>
              )
              : filtered.map((item) => (
                  <ResearchCard
                    key={item.id}
                    item={item}
                    itemLinks={links.filter((l) => l.research_id === item.id)}
                    linkCount={linkCounts[item.id] ?? 0}
                    expanded={expandedId === item.id}
                    onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    onArchive={() => archive(item.id)}
                    onLinkAdded={addLink}
                    onLinkRemoved={removeLink}
                  />
                ))
            }
          </div>

          <div className="mt-10 border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-700">
              Jarvis OS · Research Library · {items.length} items · {links.length} links
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

// ─── Research Card ────────────────────────────────────────────────────────────

type CardProps = {
  item: ResearchItem
  itemLinks: ResearchLink[]
  linkCount: number
  expanded: boolean
  onToggle: () => void
  onArchive: () => void
  onLinkAdded: (link: ResearchLink) => void
  onLinkRemoved: (id: string) => void
}

function ResearchCard({ item, itemLinks, linkCount, expanded, onToggle, onArchive, onLinkAdded, onLinkRemoved }: CardProps) {
  const catStyle = item.category ? CATEGORY_COLORS[item.category] ?? "border-gray-300 text-gray-400" : "border-gray-200 text-gray-600"
  const srcIcon = item.source_type ? SOURCE_ICONS[item.source_type] ?? "◈" : null
  const impColor = IMPORTANCE_COLORS[item.importance] ?? "text-gray-500"
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })

  // Link form state
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [targetType, setTargetType] = useState<TargetType>("Client")
  const [targetOptions, setTargetOptions] = useState<DropdownOption[]>([])
  const [targetId, setTargetId] = useState("")
  const [linkType, setLinkType] = useState(LINK_TYPES[0])
  const [notes, setNotes] = useState("")
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [savingLink, setSavingLink] = useState(false)

  const loadTargetOptions = useCallback(async (type: TargetType) => {
    setLoadingOptions(true)
    setTargetOptions([])
    setTargetId("")
    let opts: DropdownOption[] = []
    if (type === "Client") {
      const { data } = await supabase.from("clients").select("id, name").order("name")
      opts = (data ?? []).map((r) => ({ id: r.id, label: r.name }))
    } else if (type === "Skill") {
      const { data } = await supabase.from("agent_skills").select("id, name").order("name")
      opts = (data ?? []).map((r) => ({ id: r.id, label: r.name }))
    } else if (type === "Agent") {
      const { data } = await supabase.from("agents").select("id, agent_name").order("agent_name")
      opts = (data ?? []).map((r) => ({ id: r.id, label: r.agent_name }))
    } else if (type === "Cycle") {
      const { data } = await supabase.from("monthly_cycles").select("id, month, year").order("year", { ascending: false })
      opts = (data ?? []).map((r) => ({ id: r.id, label: `${r.month} ${r.year}` }))
    }
    setTargetOptions(opts)
    if (opts.length) setTargetId(opts[0].id)
    setLoadingOptions(false)
  }, [])

  useEffect(() => {
    if (showLinkForm) loadTargetOptions(targetType)
  }, [showLinkForm, targetType, loadTargetOptions])

  const saveLink = async () => {
    if (!targetId) return
    setSavingLink(true)
    const payload: Record<string, string | null> = {
      research_id: item.id,
      link_type: linkType,
      notes: notes.trim() || null,
      client_id: null, skill_id: null, agent_id: null, monthly_cycle_id: null,
    }
    if (targetType === "Client") payload.client_id = targetId
    else if (targetType === "Skill") payload.skill_id = targetId
    else if (targetType === "Agent") payload.agent_id = targetId
    else if (targetType === "Cycle") payload.monthly_cycle_id = targetId

    const { data, error } = await supabase
      .from("research_links")
      .insert(payload)
      .select(`id, research_id, link_type, notes, client_id, skill_id, agent_id, monthly_cycle_id,
        clients(name), agent_skills(name), agents(agent_name), monthly_cycles(month, year)`)
      .single()
    if (!error && data) {
      onLinkAdded(data as unknown as ResearchLink)
      setShowLinkForm(false)
      setNotes("")
    }
    setSavingLink(false)
  }

  const deleteLink = async (linkId: string) => {
    await supabase.from("research_links").delete().eq("id", linkId)
    onLinkRemoved(linkId)
  }

  const getLinkLabel = (l: ResearchLink) => {
    if (l.clients) return `Client: ${l.clients.name}`
    if (l.agent_skills) return `Skill: ${l.agent_skills.name}`
    if (l.agents) return `Agent: ${l.agents.agent_name}`
    if (l.monthly_cycles) return `Cycle: ${l.monthly_cycles.month} ${l.monthly_cycles.year}`
    return "Unknown"
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 transition hover:border-gray-300">

      {/* Header row */}
      <div className="flex cursor-pointer items-start gap-4 px-6 py-4" onClick={onToggle}>
        <span className={`mt-1 shrink-0 text-sm ${impColor}`} title={IMPORTANCE_LABELS[item.importance]}>●</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{item.title}</p>
            {item.category && <span className={`rounded-full border px-2.5 py-0.5 text-xs ${catStyle}`}>{item.category}</span>}
            {linkCount > 0 && (
              <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-400">
                {linkCount} link{linkCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {item.source_type && (
              <span className="text-xs text-gray-500">
                {srcIcon} {item.source_type}{item.source_name && <span className="text-gray-600"> · {item.source_name}</span>}
              </span>
            )}
            <span className="text-xs text-gray-700">{fmt(item.created_at)}</span>
          </div>
          {!expanded && item.summary && <p className="mt-2 text-xs text-gray-600 line-clamp-2">{item.summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-400 transition hover:border-neutral-500 hover:text-gray-900">
              ↗ Link
            </a>
          )}
          <button onClick={(e) => { e.stopPropagation(); onArchive() }} className="text-gray-700 transition hover:text-red-500 text-xs" title="Archive">✕</button>
          <span className="text-gray-600 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-200 px-6 pb-6 pt-5 space-y-5">

          {item.summary && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-600">Summary</p>
              <p className="text-sm text-gray-400 leading-relaxed">{item.summary}</p>
            </div>
          )}

          {item.key_insights && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-600">Key Insights</p>
              <div className="rounded-xl border border-gray-200 bg-black px-4 py-3">
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{item.key_insights}</p>
              </div>
            </div>
          )}

          {item.tags && item.tags.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-600">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-500">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Linked Context ─────────────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-600">Linked Context</p>
                {itemLinks.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">{itemLinks.length}</span>
                )}
              </div>
              {!showLinkForm && (
                <button onClick={() => setShowLinkForm(true)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-400 transition hover:border-neutral-500 hover:text-gray-900">
                  + Link to…
                </button>
              )}
            </div>

            {/* Link form */}
            {showLinkForm && (
              <div className="mb-4 rounded-xl border border-gray-300 bg-black p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Target type</label>
                    <select value={targetType} onChange={(e) => { setTargetType(e.target.value as TargetType) }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none">
                      {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Link type</label>
                    <select value={linkType} onChange={(e) => setLinkType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none">
                      {LINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Select {targetType}</label>
                  {loadingOptions ? (
                    <p className="text-xs text-gray-700">Loading…</p>
                  ) : targetOptions.length === 0 ? (
                    <p className="text-xs text-gray-700">No {targetType.toLowerCase()}s found.</p>
                  ) : (
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none">
                      {targetOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Notes (optional)</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why is this relevant?"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveLink} disabled={savingLink || !targetId}
                    className="rounded-lg bg-white px-4 py-1.5 text-xs font-medium text-black disabled:opacity-40">
                    {savingLink ? "Saving…" : "Save link"}
                  </button>
                  <button onClick={() => { setShowLinkForm(false); setNotes("") }}
                    className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs text-gray-400">Cancel</button>
                </div>
              </div>
            )}

            {/* Existing links */}
            {itemLinks.length === 0 ? (
              <p className="text-xs italic text-gray-700">No links yet — connect this research to a client, skill, agent, or cycle.</p>
            ) : (
              <div className="space-y-2">
                {itemLinks.map((l) => {
                  const ltStyle = l.link_type ? LINK_TYPE_COLORS[l.link_type] ?? "border-gray-300 text-gray-400" : "border-gray-200 text-gray-600"
                  return (
                    <div key={l.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-black px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm text-gray-300 truncate">{getLinkLabel(l)}</span>
                        {l.link_type && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${ltStyle}`}>{l.link_type}</span>
                        )}
                        {l.notes && <span className="truncate text-xs text-gray-600">{l.notes}</span>}
                      </div>
                      <button onClick={() => deleteLink(l.id)} className="ml-3 shrink-0 text-gray-700 transition hover:text-red-500 text-xs">✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
