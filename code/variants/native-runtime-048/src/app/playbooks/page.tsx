"use client"

import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import { estimateTokens } from "@/lib/agentContext"

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaybookEntry = {
  id: string
  created_at: string
  updated_at: string
  workspace_id: string | null
  client_id: string | null
  section: string
  title: string
  content_full: string
  content_summary: string | null
  content_essence: string | null
  importance: number
  status: string
  // resolved
  clients: { name: string } | null
  workspaces: { name: string } | null
}

type Client = { id: string; name: string }
type Workspace = { id: string; name: string; client_id: string | null }

type FormState = {
  scope_level: "L1" | "L2"
  workspace_id: string
  client_id: string
  section: string
  title: string
  content_full: string
  content_summary: string
  content_essence: string
  importance: number
  status: string
}

type EditState = Partial<FormState> & { id: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTIONS = ["voice", "tone", "visual", "positioning", "rules", "campaign"]

const SECTION_COLORS: Record<string, string> = {
  voice:       "border-blue-900 text-blue-400 bg-blue-950/20",
  tone:        "border-violet-900 text-violet-400 bg-violet-950/20",
  visual:      "border-pink-900 text-pink-400 bg-pink-950/20",
  positioning: "border-amber-900 text-amber-400 bg-amber-950/20",
  rules:       "border-red-900 text-red-400 bg-red-950/20",
  campaign:    "border-green-900 text-green-400 bg-green-950/20",
}

const IMPORTANCE_COLORS = ["", "text-gray-600", "text-gray-500", "text-gray-400", "text-yellow-400", "text-red-400"]
const IMPORTANCE_LABELS = ["", "Low", "Normal", "Medium", "High", "Critical"]

const LEVEL_BADGE: Record<string, { label: string; color: string }> = {
  L1: { label: "L1 · Workspace", color: "border-sky-900 text-sky-400 bg-sky-950/20" },
  L2: { label: "L2 · Client",    color: "border-purple-900 text-purple-400 bg-purple-950/20" },
}

const BLANK_FORM: FormState = {
  scope_level:     "L2",
  workspace_id:    "",
  client_id:       "",
  section:         "voice",
  title:           "",
  content_full:    "",
  content_summary: "",
  content_essence: "",
  importance:      3,
  status:          "active",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveLevel(entry: PlaybookEntry): "L1" | "L2" {
  return entry.client_id ? "L2" : "L1"
}

function scopeLabel(entry: PlaybookEntry): string {
  if (entry.client_id && entry.clients) return entry.clients.name
  if (entry.workspace_id && entry.workspaces) return entry.workspaces.name
  return "System-wide"
}

function TokenPill({ tokens, label, dim = false }: { tokens: number; label: string; dim?: boolean }) {
  const color = tokens === 0
    ? "text-gray-700 border-gray-200"
    : tokens < 50
    ? "text-green-400 border-green-900"
    : tokens < 120
    ? "text-yellow-400 border-yellow-900"
    : "text-red-400 border-red-900"
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${dim ? "border-gray-200 text-gray-700" : color}`}>
      <span className="text-xs">{label}</span>
      <span className="font-mono text-xs font-medium">~{tokens}tk</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const [entries, setEntries]       = useState<PlaybookEntry[]>([])
  const [clients, setClients]       = useState<Client[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading]       = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [editState, setEditState]   = useState<EditState | null>(null)

  // Filters
  const [filterSection, setFilterSection] = useState<string>("all")
  const [filterScope, setFilterScope]     = useState<string>("all")

  // Add form
  const [form, setForm] = useState<FormState>(BLANK_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    const [entriesRes, clientsRes, workspacesRes] = await Promise.all([
      supabase
        .from("brand_playbooks")
        .select("*, clients(name), workspaces(name)")
        .eq("status", "active")
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("workspaces").select("id, name, client_id").order("name"),
    ])
    setEntries((entriesRes.data ?? []) as PlaybookEntry[])
    setClients(clientsRes.data ?? [])
    setWorkspaces(workspacesRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtered entries ─────────────────────────────────────────────────────

  const filtered = entries.filter((e) => {
    if (filterSection !== "all" && e.section !== filterSection) return false
    if (filterScope !== "all") {
      const level = resolveLevel(e)
      if (filterScope !== level) return false
    }
    return true
  })

  // ── Add entry ────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!form.title.trim() || !form.content_full.trim()) return
    setSaving(true)
    const payload = {
      workspace_id:    form.scope_level === "L1" && form.workspace_id ? form.workspace_id : null,
      client_id:       form.scope_level === "L2" && form.client_id    ? form.client_id    : null,
      section:         form.section,
      title:           form.title.trim(),
      content_full:    form.content_full.trim(),
      content_summary: form.content_summary.trim() || null,
      content_essence: form.content_essence.trim() || null,
      importance:      form.importance,
      status:          form.status,
    }
    await supabase.from("brand_playbooks").insert(payload)
    setForm(BLANK_FORM)
    setShowForm(false)
    await load()
    setSaving(false)
  }

  // ── Save edit ────────────────────────────────────────────────────────────

  async function handleSaveEdit() {
    if (!editState) return
    setSaving(true)
    const { id, ...fields } = editState
    const payload: Record<string, unknown> = {}
    if (fields.section         !== undefined) payload.section         = fields.section
    if (fields.title           !== undefined) payload.title           = fields.title
    if (fields.content_full    !== undefined) payload.content_full    = fields.content_full
    if (fields.content_summary !== undefined) payload.content_summary = fields.content_summary || null
    if (fields.content_essence !== undefined) payload.content_essence = fields.content_essence || null
    if (fields.importance      !== undefined) payload.importance      = fields.importance
    if (fields.status          !== undefined) payload.status          = fields.status
    await supabase.from("brand_playbooks").update(payload).eq("id", id)
    setEditState(null)
    setExpandedId(null)
    await load()
    setSaving(false)
  }

  async function handleArchive(id: string) {
    await supabase.from("brand_playbooks").update({ status: "archived" }).eq("id", id)
    await load()
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const sectionCounts = SECTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = entries.filter((e) => e.section === s).length
    return acc
  }, {})

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Intelligence Layer · L1/L2</p>
              <h1 className="mt-2 text-4xl font-bold">Brand Playbooks</h1>
              <p className="mt-2 text-sm text-gray-500">
                Structured brand identity injected into every agent prompt. L1 = workspace-wide. L2 = client-specific.
              </p>
            </div>
            <button
              onClick={() => { setShowForm(!showForm); setEditState(null) }}
              className="mt-1 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              {showForm ? "Cancel" : "+ Add Entry"}
            </button>
          </div>

          {/* Token efficiency callout */}
          <div className="mt-6 rounded-2xl border border-amber-900/50 bg-amber-950/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-sm font-semibold text-amber-400">Keep prompts cheap: fill summary + essence</p>
                <p className="mt-1 text-xs text-gray-500">
                  <strong className="text-gray-400">content_full</strong> is stored and displayed — not always injected.
                  When token budgets are tight, agents use <strong className="text-gray-400">content_summary</strong> (1-3 sentences) then fall back to <strong className="text-gray-400">content_essence</strong> (single rule).
                  Empty summary/essence = full content always used = expensive prompts.
                </p>
              </div>
            </div>
          </div>

          {/* ── Add form ────────────────────────────────────────────────────── */}
          {showForm && (
            <div className="mt-6 rounded-2xl border border-gray-300 bg-gray-50 p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">New Playbook Entry</h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Scope level */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Scope Level</label>
                  <div className="flex gap-2">
                    {(["L1", "L2"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setForm((f) => ({ ...f, scope_level: l }))}
                        className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                          form.scope_level === l
                            ? "border-white text-gray-900 bg-gray-100"
                            : "border-gray-300 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {l === "L1" ? "L1 · Workspace" : "L2 · Client"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-700">
                    {form.scope_level === "L1"
                      ? "Applies to all clients in a workspace. Client rules override this."
                      : "Applies to a specific client only. Overrides workspace (L1) rules."}
                  </p>
                </div>

                {/* Scope target */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">
                    {form.scope_level === "L1" ? "Workspace" : "Client"}
                  </label>
                  {form.scope_level === "L1" ? (
                    workspaces.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-600">
                        No workspaces — create one in Clients first
                      </div>
                    ) : (
                      <select
                        value={form.workspace_id}
                        onChange={(e) => setForm((f) => ({ ...f, workspace_id: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900"
                      >
                        <option value="">Select workspace…</option>
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    )
                  ) : (
                    <select
                      value={form.client_id}
                      onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900"
                    >
                      <option value="">Select client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Section */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Section</label>
                  <select
                    value={form.section}
                    onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 capitalize"
                  >
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Importance */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">
                    Importance — <span className={IMPORTANCE_COLORS[form.importance]}>{IMPORTANCE_LABELS[form.importance]}</span>
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setForm((f) => ({ ...f, importance: n }))}
                        className={`flex-1 rounded-xl border py-2 text-sm font-bold transition ${
                          form.importance === n
                            ? "border-white text-gray-900 bg-gray-100"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-700">5 = always inject regardless of token budget</p>
                </div>

                {/* Title */}
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Caption tone rules"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-neutral-700"
                  />
                </div>
              </div>

              {/* Content fields */}
              <div className="mt-4 space-y-4">
                {/* content_full */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-500">
                      content_full <span className="text-gray-700">— complete explanation (stored, displayed)</span>
                    </label>
                    {form.content_full && (
                      <TokenPill tokens={estimateTokens(form.content_full)} label="full" />
                    )}
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Write the complete brand rule with full context and rationale…"
                    value={form.content_full}
                    onChange={(e) => setForm((f) => ({ ...f, content_full: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 resize-none"
                  />
                </div>

                {/* content_summary */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-amber-600">
                      content_summary <span className="text-gray-700">— 1-3 sentences (default injection)</span>
                    </label>
                    {form.content_summary && (
                      <TokenPill tokens={estimateTokens(form.content_summary)} label="summary" />
                    )}
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Concise version injected into most prompts. Keep under 60 tokens."
                    value={form.content_summary}
                    onChange={(e) => setForm((f) => ({ ...f, content_summary: e.target.value }))}
                    className="w-full rounded-xl border border-amber-900/40 bg-white px-4 py-3 text-sm text-gray-900 placeholder-neutral-700 resize-none"
                  />
                </div>

                {/* content_essence */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-orange-600">
                      content_essence <span className="text-gray-700">— single rule (tight budget fallback)</span>
                    </label>
                    {form.content_essence && (
                      <TokenPill tokens={estimateTokens(form.content_essence)} label="essence" />
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="One-liner. e.g. 'No em dashes. Short sentences. Direct tone.'"
                    value={form.content_essence}
                    onChange={(e) => setForm((f) => ({ ...f, content_essence: e.target.value }))}
                    className="w-full rounded-xl border border-orange-900/40 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-neutral-700"
                  />
                </div>
              </div>

              {/* Token cost summary */}
              {form.content_full && (
                <div className="mt-4 flex gap-3">
                  <TokenPill tokens={estimateTokens(form.content_full)}    label="full"    />
                  <TokenPill tokens={estimateTokens(form.content_summary)} label="summary" dim={!form.content_summary} />
                  <TokenPill tokens={estimateTokens(form.content_essence)} label="essence" dim={!form.content_essence} />
                  {!form.content_summary && (
                    <span className="ml-auto self-center text-xs text-amber-600">⚠ No summary — full content will always be injected</span>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => { setShowForm(false); setForm(BLANK_FORM) }}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm text-gray-400 hover:text-gray-900 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving || !form.title.trim() || !form.content_full.trim()}
                  className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Add Entry"}
                </button>
              </div>
            </div>
          )}

          {/* ── Filters ──────────────────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Scope filter */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {[
                { key: "all", label: "All scopes" },
                { key: "L1",  label: "L1 Workspace" },
                { key: "L2",  label: "L2 Client"    },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterScope(key)}
                  className={`px-4 py-2 text-xs transition ${
                    filterScope === key
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:text-gray-900 hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Section filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterSection("all")}
                className={`rounded-xl px-3 py-1.5 text-xs transition ${
                  filterSection === "all"
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All sections
              </button>
              {SECTIONS.map((s) => {
                const count = sectionCounts[s] ?? 0
                const colors = SECTION_COLORS[s] ?? ""
                return (
                  <button
                    key={s}
                    onClick={() => setFilterSection(filterSection === s ? "all" : s)}
                    className={`rounded-xl border px-3 py-1.5 text-xs capitalize transition ${
                      filterSection === s
                        ? colors
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-400"
                    }`}
                  >
                    {s} {count > 0 && <span className="opacity-60">({count})</span>}
                  </button>
                )
              })}
            </div>

            <span className="ml-auto text-xs text-gray-700">{filtered.length} entries</span>
          </div>

          {/* ── Entry list ───────────────────────────────────────────────────── */}
          {loading ? (
            <div className="mt-6 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-20 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 px-8 py-12 text-center">
              <p className="text-gray-500">No entries yet.</p>
              <p className="mt-1 text-xs text-gray-700">
                Add your first brand rule using the button above.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filtered.map((entry) => {
                const level = resolveLevel(entry)
                const levelBadge = LEVEL_BADGE[level]
                const sectionColors = SECTION_COLORS[entry.section] ?? "border-gray-200 text-gray-400"
                const isExpanded = expandedId === entry.id
                const isEditing = editState?.id === entry.id

                const tkFull    = estimateTokens(entry.content_full)
                const tkSummary = entry.content_summary ? estimateTokens(entry.content_summary) : 0
                const tkEssence = entry.content_essence ? estimateTokens(entry.content_essence) : 0

                return (
                  <div
                    key={entry.id}
                    className={`rounded-2xl border transition ${
                      isExpanded ? "border-gray-300 bg-gray-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"
                    }`}
                  >
                    {/* ── Collapsed row ── */}
                    <button
                      className="w-full text-left px-5 py-4"
                      onClick={() => {
                        setExpandedId(isExpanded ? null : entry.id)
                        if (!isExpanded) setEditState(null)
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Level badge */}
                        <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs font-medium ${levelBadge.color}`}>
                          {levelBadge.label}
                        </span>
                        {/* Section badge */}
                        <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs capitalize ${sectionColors}`}>
                          {entry.section}
                        </span>
                        {/* Title */}
                        <span className="flex-1 truncate text-sm font-medium text-gray-900">{entry.title}</span>
                        {/* Scope */}
                        <span className="shrink-0 text-xs text-gray-600">{scopeLabel(entry)}</span>
                        {/* Importance */}
                        <span className={`shrink-0 text-xs font-bold ${IMPORTANCE_COLORS[entry.importance]}`}>
                          {entry.importance}/5
                        </span>
                        {/* Token pills */}
                        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                          <TokenPill tokens={tkFull}    label="full"    />
                          <TokenPill tokens={tkSummary} label="sum"     dim={!entry.content_summary} />
                          <TokenPill tokens={tkEssence} label="ess"     dim={!entry.content_essence} />
                        </div>
                        {/* Expand indicator */}
                        <span className="shrink-0 text-gray-700 text-xs">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                      {/* Preview */}
                      {!isExpanded && (
                        <p className="mt-2 truncate pl-0.5 text-xs text-gray-600">
                          {entry.content_summary ?? entry.content_full}
                        </p>
                      )}
                    </button>

                    {/* ── Expanded view ── */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 px-5 pb-5 pt-4">
                        {isEditing ? (
                          /* Edit form */
                          <div className="space-y-4">
                            {/* Section + Importance */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="mb-1 block text-xs text-gray-500">Section</label>
                                <select
                                  value={editState?.section ?? entry.section}
                                  onChange={(e) => setEditState((s) => s ? { ...s, section: e.target.value } : s)}
                                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                                >
                                  {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-gray-500">Importance</label>
                                <div className="flex gap-2">
                                  {[1,2,3,4,5].map((n) => {
                                    const cur = editState?.importance ?? entry.importance
                                    return (
                                      <button key={n}
                                        onClick={() => setEditState((s) => s ? { ...s, importance: n } : s)}
                                        className={`flex-1 rounded-xl border py-2 text-sm font-bold transition ${
                                          cur === n ? "border-white text-gray-900 bg-gray-100" : "border-gray-200 text-gray-600"
                                        }`}
                                      >{n}</button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Title */}
                            <div>
                              <label className="mb-1 block text-xs text-gray-500">Title</label>
                              <input
                                type="text"
                                value={editState?.title ?? entry.title}
                                onChange={(e) => setEditState((s) => s ? { ...s, title: e.target.value } : s)}
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900"
                              />
                            </div>

                            {/* content_full */}
                            <div>
                              <div className="mb-1 flex items-center justify-between">
                                <label className="text-xs text-gray-500">content_full</label>
                                <TokenPill tokens={estimateTokens(editState?.content_full ?? entry.content_full)} label="full" />
                              </div>
                              <textarea rows={4}
                                value={editState?.content_full ?? entry.content_full}
                                onChange={(e) => setEditState((s) => s ? { ...s, content_full: e.target.value } : s)}
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 resize-none"
                              />
                            </div>

                            {/* content_summary */}
                            <div>
                              <div className="mb-1 flex items-center justify-between">
                                <label className="text-xs text-amber-600">content_summary</label>
                                {(editState?.content_summary ?? entry.content_summary) && (
                                  <TokenPill tokens={estimateTokens(editState?.content_summary ?? entry.content_summary ?? "")} label="summary" />
                                )}
                              </div>
                              <textarea rows={2}
                                value={editState?.content_summary ?? entry.content_summary ?? ""}
                                onChange={(e) => setEditState((s) => s ? { ...s, content_summary: e.target.value } : s)}
                                className="w-full rounded-xl border border-amber-900/40 bg-white px-4 py-3 text-sm text-gray-900 resize-none placeholder-neutral-700"
                                placeholder="1-3 sentence version…"
                              />
                            </div>

                            {/* content_essence */}
                            <div>
                              <div className="mb-1 flex items-center justify-between">
                                <label className="text-xs text-orange-600">content_essence</label>
                                {(editState?.content_essence ?? entry.content_essence) && (
                                  <TokenPill tokens={estimateTokens(editState?.content_essence ?? entry.content_essence ?? "")} label="essence" />
                                )}
                              </div>
                              <input type="text"
                                value={editState?.content_essence ?? entry.content_essence ?? ""}
                                onChange={(e) => setEditState((s) => s ? { ...s, content_essence: e.target.value } : s)}
                                className="w-full rounded-xl border border-orange-900/40 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-neutral-700"
                                placeholder="One-liner…"
                              />
                            </div>

                            <div className="flex justify-end gap-3">
                              <button onClick={() => setEditState(null)}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-400 hover:text-gray-900 transition">
                                Cancel
                              </button>
                              <button onClick={handleSaveEdit} disabled={saving}
                                className="rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition disabled:opacity-40">
                                {saving ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Read view */
                          <div className="space-y-4">
                            {/* Token cost at a glance */}
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-600">Injection cost:</span>
                              <TokenPill tokens={tkFull}    label="full"    />
                              <TokenPill tokens={tkSummary} label="summary" dim={!entry.content_summary} />
                              <TokenPill tokens={tkEssence} label="essence" dim={!entry.content_essence} />
                              {!entry.content_summary && (
                                <span className="ml-2 text-xs text-amber-600">⚠ No summary — add one</span>
                              )}
                              {!entry.content_essence && (
                                <span className="ml-1 text-xs text-orange-600">⚠ No essence</span>
                              )}
                            </div>

                            {/* content_full */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-gray-500">content_full</p>
                              <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-black px-5 py-4 font-mono text-xs leading-relaxed text-gray-300">
                                {entry.content_full}
                              </pre>
                            </div>

                            {/* content_summary */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-amber-700">
                                content_summary {!entry.content_summary && <span className="text-gray-700">— empty</span>}
                              </p>
                              <pre className={`whitespace-pre-wrap rounded-xl border px-5 py-4 font-mono text-xs leading-relaxed ${
                                entry.content_summary
                                  ? "border-amber-900/30 bg-black text-gray-300"
                                  : "border-gray-200 bg-gray-50 text-gray-700"
                              }`}>
                                {entry.content_summary ?? "Not set — agents will use content_full (expensive)"}
                              </pre>
                            </div>

                            {/* content_essence */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-orange-700">
                                content_essence {!entry.content_essence && <span className="text-gray-700">— empty</span>}
                              </p>
                              <pre className={`whitespace-pre-wrap rounded-xl border px-5 py-4 font-mono text-xs leading-relaxed ${
                                entry.content_essence
                                  ? "border-orange-900/30 bg-black text-gray-300"
                                  : "border-gray-200 bg-gray-50 text-gray-700"
                              }`}>
                                {entry.content_essence ?? "Not set — no tight-budget fallback"}
                              </pre>
                            </div>

                            {/* Metadata */}
                            <div className="flex items-center gap-4 border-t border-gray-200 pt-3">
                              <span className="text-xs text-gray-700">
                                Updated {new Date(entry.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${LEVEL_BADGE[resolveLevel(entry)].color}`}>
                                {scopeLabel(entry)}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditState({ id: entry.id })}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-xs text-gray-400 hover:text-gray-900 transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleArchive(entry.id)}
                                className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:border-red-900 hover:text-red-400 transition"
                              >
                                Archive
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-10 border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-700">
              Jarvis OS · Brand Playbooks · L1 = workspace-wide · L2 = client-specific · context injection priority 3/10
            </p>
          </div>

        </div>
      </section>
    </main>
  )
}
