"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  "Not Started",
  "In Progress",
  "Needs Revision",
  "Completed",
  "Confirmed",
  "Published",
  "Archived",
]

const PLATFORMS  = ["Instagram", "LinkedIn", "TikTok", "YouTube", "Facebook", "Twitter/X", "Other"]
const TYPES      = ["Reel", "Post", "Story", "Carousel", "Video", "Article", "Ad", "Other"]
const PRIORITIES = ["Low", "Medium", "High", "Urgent"]
const ASSET_TYPES = ["Image", "Video", "Caption", "Script", "Audio", "Reference", "Export", "Other"]
const COPY_TYPES     = ["Caption", "Ad Copy", "Flyer Text", "Website Copy", "WhatsApp Copy", "Press Release", "Email", "Script", "Other"]
const TONES          = ["Luxury", "Professional", "Casual", "Playful", "Urgent", "Inspirational", "Minimalist", "Bold"]
const REVISION_TYPES = ["Visual", "Copy", "Timing", "Format", "Strategy", "Client Feedback", "Other"]

const STATUS_COLORS: Record<string, string> = {
  "Not Started":    "bg-gray-100 text-gray-300 border-gray-300",
  "In Progress":    "bg-blue-950 text-blue-300 border-blue-800",
  "Needs Revision": "bg-yellow-950 text-yellow-300 border-yellow-800",
  "Completed":      "bg-green-950 text-green-300 border-green-800",
  "Confirmed":      "bg-emerald-950 text-emerald-300 border-emerald-800",
  "Published":      "bg-purple-950 text-purple-300 border-purple-800",
  "Archived":       "bg-white text-gray-500 border-gray-200",
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Deliverable = {
  id: string
  title: string
  platform: string | null
  status: string
  type: string
  content_type: string | null
  description: string | null
  priority: string | null
  due_date: string | null
  assigned_agent: string | null
  approval_status: string | null
  created_at: string
}

type DeliverableAsset = {
  id: string
  created_at: string
  deliverable_id: string
  name: string
  asset_type: string | null
  file_url: string | null
  thumbnail_url: string | null
  prompt: string | null
  model_used: string | null
  status: string
  version: number
}

type FormState = {
  title: string
  status: string
  platform: string
  type: string
  content_type: string
  priority: string
  due_date: string
  assigned_agent: string
  description: string
}

type AssetFormState = {
  name: string
  asset_type: string
  file_url: string
  prompt: string
  model_used: string
}

const EMPTY_ASSET_FORM: AssetFormState = {
  name: "",
  asset_type: "",
  file_url: "",
  prompt: "",
  model_used: "",
}

type DeliverableCopy = {
  id: string
  created_at: string
  deliverable_id: string
  copy_type: string
  title: string | null
  content: string
  tone: string | null
  platform: string | null
  status: string
  version: number
}

type CopyFormState = {
  copy_type: string
  title: string
  platform: string
  tone: string
  content: string
}

const EMPTY_COPY_FORM: CopyFormState = {
  copy_type: "",
  title: "",
  platform: "",
  tone: "",
  content: "",
}

type DeliverableRevision = {
  id: string
  created_at: string
  deliverable_id: string
  revision_type: string | null
  requested_by: string | null
  note: string | null
  status: string
}

type RevisionFormState = {
  revision_type: string
  note: string
}

const EMPTY_REVISION_FORM: RevisionFormState = {
  revision_type: "",
  note: "",
}

type DeliverableActivity = {
  id: string
  created_at: string
  actor: string
  action: string
  summary: string | null
}

// Actor badge colours
const ACTOR_COLORS: Record<string, string> = {
  "Calvin":     "border-white/20 bg-white/10 text-gray-900",
  "Jarvis":     "border-blue-700 bg-blue-950/60 text-blue-300",
  "System":     "border-gray-300 bg-white text-gray-400",
  "Agent":      "border-purple-700 bg-purple-950/60 text-purple-300",
  "Automation": "border-emerald-700 bg-emerald-950/60 text-emerald-300",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toForm(d: Deliverable): FormState {
  return {
    title:          d.title          ?? "",
    status:         d.status         ?? "Not Started",
    platform:       d.platform       ?? "",
    type:           d.type           ?? "",
    content_type:   d.content_type   ?? "",
    priority:       d.priority       ?? "",
    due_date:       d.due_date       ?? "",
    assigned_agent: d.assigned_agent ?? "",
    description:    d.description    ?? "",
  }
}

// ─── Shared field components ──────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </label>
  )
}

function TextInput({
  value, onChange, placeholder, className = "",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none ${className}`}
    />
  )
}

function SelectInput({
  value, onChange, options, placeholder = "—",
}: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ─── Asset type badge ─────────────────────────────────────────────────────────

function AssetTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  return (
    <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-400">
      {type}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliverableDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const id      = params?.id as string

  // Deliverable state
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null)
  const [form,        setForm]        = useState<FormState | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [errorMsg,    setErrorMsg]    = useState("")
  const [successMsg,  setSuccessMsg]  = useState("")

  // Assets state
  const [assets,        setAssets]        = useState<DeliverableAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetForm,     setAssetForm]     = useState<AssetFormState>(EMPTY_ASSET_FORM)
  const [showAddAsset,  setShowAddAsset]  = useState(false)
  const [assetSaving,   setAssetSaving]   = useState(false)
  const [assetError,    setAssetError]    = useState("")
  const [assetSuccess,  setAssetSuccess]  = useState("")

  // Activity state
  const [activity,        setActivity]        = useState<DeliverableActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // Revision / approval state
  const [revisions,       setRevisions]       = useState<DeliverableRevision[]>([])
  const [revisionsLoading,setRevisionsLoading]= useState(false)
  const [showRevForm,     setShowRevForm]     = useState(false)
  const [revForm,         setRevForm]         = useState<RevisionFormState>(EMPTY_REVISION_FORM)
  const [revSaving,       setRevSaving]       = useState(false)
  const [revError,        setRevError]        = useState("")
  const [approvalMsg,     setApprovalMsg]     = useState("")
  const [approvalErr,     setApprovalErr]     = useState("")

  // Copy state
  const [copyItems,    setCopyItems]    = useState<DeliverableCopy[]>([])
  const [copyLoading,  setCopyLoading]  = useState(false)
  const [copyForm,     setCopyForm]     = useState<CopyFormState>(EMPTY_COPY_FORM)
  const [showAddCopy,  setShowAddCopy]  = useState(false)
  const [copySaving,   setCopySaving]   = useState(false)
  const [copyError,    setCopyError]    = useState("")
  const [copySuccess,  setCopySuccess]  = useState("")
  const [expandedCopy, setExpandedCopy] = useState<string | null>(null)

  // ── Fetch deliverable ──────────────────────────────────────────────────────

  const fetchDeliverable = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErrorMsg("")

    const { data, error } = await supabase
      .from("deliverables")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      console.error("[DeliverableDetail] fetch error:", error)
      setErrorMsg(`Could not load deliverable: ${error.message}`)
      setLoading(false)
      return
    }

    setDeliverable(data)
    setForm(toForm(data))
    setLoading(false)
  }, [id])

  // ── Fetch assets ───────────────────────────────────────────────────────────

  const fetchAssets = useCallback(async () => {
    if (!id) return
    setAssetsLoading(true)

    const { data, error } = await supabase
      .from("deliverable_assets")
      .select("*")
      .eq("deliverable_id", id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Assets] fetch error:", error)
    } else {
      setAssets(data ?? [])
    }

    setAssetsLoading(false)
  }, [id])

  // ── Fetch activity ─────────────────────────────────────────────────────────

  const fetchActivity = useCallback(async () => {
    if (!id) return
    setActivityLoading(true)
    const { data } = await supabase
      .from("deliverable_activity")
      .select("id, created_at, actor, action, summary")
      .eq("deliverable_id", id)
      .order("created_at", { ascending: false })
    setActivity(data ?? [])
    setActivityLoading(false)
  }, [id])

  // ── Log activity helper ────────────────────────────────────────────────────

  const logActivity = useCallback(async (
    actor: string,
    action: string,
    summary?: string,
  ) => {
    await supabase.from("deliverable_activity").insert({
      deliverable_id: id,
      actor,
      action,
      summary: summary ?? null,
    })
    // Refresh silently — don't block the calling action
    fetchActivity()
  }, [id, fetchActivity])

  // ── Fetch revisions ────────────────────────────────────────────────────────

  const fetchRevisions = useCallback(async () => {
    if (!id) return
    setRevisionsLoading(true)
    const { data, error } = await supabase
      .from("deliverable_revisions")
      .select("*")
      .eq("deliverable_id", id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Revisions] fetch error:", error)
    } else {
      setRevisions(data ?? [])
    }
    setRevisionsLoading(false)
  }, [id])

  // ── Fetch copy ─────────────────────────────────────────────────────────────

  const fetchCopy = useCallback(async () => {
    if (!id) return
    setCopyLoading(true)

    const { data, error } = await supabase
      .from("deliverable_copy")
      .select("*")
      .eq("deliverable_id", id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Copy] fetch error:", error)
    } else {
      setCopyItems(data ?? [])
    }

    setCopyLoading(false)
  }, [id])

  useEffect(() => {
    fetchDeliverable()
    fetchAssets()
    fetchRevisions()
    fetchCopy()
    fetchActivity()
  }, [fetchDeliverable, fetchAssets, fetchRevisions, fetchCopy, fetchActivity])

  // ── Form helpers ───────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev)
  }

  function setAssetField<K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) {
    setAssetForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCopyField<K extends keyof CopyFormState>(key: K, value: CopyFormState[K]) {
    setCopyForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Save deliverable ───────────────────────────────────────────────────────

  async function handleSave() {
    if (!form || !deliverable) return
    if (!form.title.trim()) { setErrorMsg("Title is required."); return }

    setSaving(true)
    setErrorMsg("")
    setSuccessMsg("")

    const { data, error } = await supabase
      .from("deliverables")
      .update({
        title:          form.title.trim(),
        status:         form.status,
        platform:       form.platform       || null,
        type:           form.type           || deliverable.type,
        content_type:   form.content_type   || null,
        priority:       form.priority       || null,
        due_date:       form.due_date       || null,
        assigned_agent: form.assigned_agent || null,
        description:    form.description    || null,
      })
      .eq("id", deliverable.id)
      .select()
      .single()

    if (error) {
      console.error("[DeliverableDetail] save error:", error)
      setErrorMsg(`Save failed: ${error.message}`)
      setSaving(false)
      return
    }

    setDeliverable(data)
    setForm(toForm(data))
    setSuccessMsg("Saved successfully.")
    setSaving(false)
    setTimeout(() => setSuccessMsg(""), 3000)

    await logActivity("Calvin", "fields_updated", "Deliverable details saved")
  }

  // ── Create asset ───────────────────────────────────────────────────────────

  async function handleCreateAsset() {
    if (!assetForm.name.trim()) { setAssetError("Asset name is required."); return }

    setAssetSaving(true)
    setAssetError("")
    setAssetSuccess("")

    const { error } = await supabase
      .from("deliverable_assets")
      .insert({
        deliverable_id: id,
        name:           assetForm.name.trim(),
        asset_type:     assetForm.asset_type  || null,
        file_url:       assetForm.file_url    || null,
        prompt:         assetForm.prompt      || null,
        model_used:     assetForm.model_used  || null,
      })

    if (error) {
      console.error("[Assets] create error:", error)
      setAssetError(`Failed to add asset: ${error.message}`)
      setAssetSaving(false)
      return
    }

    setAssetForm(EMPTY_ASSET_FORM)
    setShowAddAsset(false)
    setAssetSuccess("Asset added.")
    setTimeout(() => setAssetSuccess(""), 3000)
    fetchAssets()

    const typeLabel = assetForm.asset_type ? ` (${assetForm.asset_type})` : ""
    await logActivity("Jarvis", "asset_added", `${assetForm.name.trim()}${typeLabel}`)

    setAssetSaving(false)
  }

  // ── Approval actions ───────────────────────────────────────────────────────

  async function updateDeliverableStatus(newStatus: string, successText: string) {
    if (!deliverable) return
    setApprovalErr("")
    setApprovalMsg("")

    const prevStatus = deliverable.status

    const { data, error } = await supabase
      .from("deliverables")
      .update({ status: newStatus })
      .eq("id", deliverable.id)
      .select()
      .single()

    if (error) {
      setApprovalErr(`Failed: ${error.message}`)
      return
    }

    setDeliverable(data)
    setForm(toForm(data))
    setApprovalMsg(successText)
    setTimeout(() => setApprovalMsg(""), 3000)

    // Log activity
    await logActivity("Calvin", "status_changed", `${prevStatus} → ${newStatus}`)
  }

  async function handleApprove() {
    await updateDeliverableStatus("Confirmed", "Deliverable confirmed ✓")
    await logActivity("Calvin", "approved", "Deliverable approved and confirmed")
  }

  async function handlePublish() {
    await updateDeliverableStatus("Published", "Marked as published ✓")
    await logActivity("Calvin", "published", "Marked as published")
  }

  async function handleRequestRevision() {
    if (!revForm.note.trim()) { setRevError("Please add a note for this revision."); return }

    setRevSaving(true)
    setRevError("")

    // 1. Insert revision record
    const { error: revErr } = await supabase
      .from("deliverable_revisions")
      .insert({
        deliverable_id: id,
        revision_type:  revForm.revision_type || null,
        requested_by:   "Calvin",
        note:           revForm.note.trim(),
        status:         "open",
      })

    if (revErr) {
      setRevError(`Failed: ${revErr.message}`)
      setRevSaving(false)
      return
    }

    // 2. Update deliverable status to Needs Revision
    await updateDeliverableStatus("Needs Revision", "Revision requested")

    // 3. Log activity
    const typeLabel = revForm.revision_type ? ` [${revForm.revision_type}]` : ""
    await logActivity("Calvin", "revision_requested", `${typeLabel} ${revForm.note.trim()}`.trim())

    setRevForm(EMPTY_REVISION_FORM)
    setShowRevForm(false)
    fetchRevisions()
    setRevSaving(false)
  }

  // ── Create copy ────────────────────────────────────────────────────────────

  async function handleCreateCopy() {
    if (!copyForm.copy_type.trim()) { setCopyError("Copy type is required."); return }
    if (!copyForm.content.trim())   { setCopyError("Content is required.");   return }

    setCopySaving(true)
    setCopyError("")
    setCopySuccess("")

    const { error } = await supabase
      .from("deliverable_copy")
      .insert({
        deliverable_id: id,
        copy_type: copyForm.copy_type,
        title:     copyForm.title    || null,
        content:   copyForm.content.trim(),
        tone:      copyForm.tone     || null,
        platform:  copyForm.platform || null,
      })

    if (error) {
      console.error("[Copy] create error:", error)
      setCopyError(`Failed to add copy: ${error.message}`)
      setCopySaving(false)
      return
    }

    setCopyForm(EMPTY_COPY_FORM)
    setShowAddCopy(false)
    setCopySuccess("Copy saved.")
    setTimeout(() => setCopySuccess(""), 3000)
    fetchCopy()

    const titleLabel = copyForm.title ? ` "${copyForm.title}"` : ""
    await logActivity("Jarvis", "copy_added", `${copyForm.copy_type}${titleLabel}`)

    setCopySaving(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-4xl">

          {/* Back */}
          <button
            onClick={() => router.back()}
            className="mb-8 text-sm text-gray-500 transition hover:text-gray-300"
          >
            ← Back
          </button>

          {/* Loading / error states */}
          {loading && <p className="text-sm text-gray-500">Loading...</p>}

          {!loading && errorMsg && !form && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
              ⚠ {errorMsg}
            </div>
          )}

          {!loading && !deliverable && !errorMsg && (
            <p className="text-sm text-gray-500">Deliverable not found.</p>
          )}

          {/* ── Main content ────────────────────────────────────────────────── */}
          {!loading && deliverable && form && (
            <>
              {/* Header row */}
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Deliverable</p>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="Untitled deliverable"
                    className="mt-3 w-full bg-transparent text-4xl font-bold text-gray-900 placeholder-neutral-700 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col items-end gap-2 pt-6">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <p className="font-mono text-xs text-gray-600">{deliverable.id.slice(0, 8)}…</p>
                </div>
              </div>

              {/* Feedback */}
              {successMsg && (
                <div className="mt-5 rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                  ✓ {successMsg}
                </div>
              )}
              {errorMsg && (
                <div className="mt-5 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                  ⚠ {errorMsg}
                </div>
              )}

              {/* ── Details ─────────────────────────────────────────────────── */}
              <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="mb-6 text-lg font-semibold">Details</h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <select
                      value={form.status}
                      onChange={(e) => setField("status", e.target.value)}
                      className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition focus:outline-none ${STATUS_COLORS[form.status] ?? "border-gray-200 bg-gray-50 text-gray-900"}`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <FieldLabel>Platform</FieldLabel>
                    <SelectInput value={form.platform} onChange={(v) => setField("platform", v)} options={PLATFORMS} placeholder="Select platform" />
                  </div>

                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <SelectInput value={form.type} onChange={(v) => setField("type", v)} options={TYPES} placeholder="Select type" />
                  </div>

                  <div>
                    <FieldLabel>Content Type</FieldLabel>
                    <SelectInput value={form.content_type} onChange={(v) => setField("content_type", v)} options={TYPES} placeholder="Select content type" />
                  </div>

                  <div>
                    <FieldLabel>Priority</FieldLabel>
                    <SelectInput value={form.priority} onChange={(v) => setField("priority", v)} options={PRIORITIES} placeholder="Select priority" />
                  </div>

                  <div>
                    <FieldLabel>Due Date</FieldLabel>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setField("due_date", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none [color-scheme:dark]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <FieldLabel>Assigned Agent</FieldLabel>
                    <TextInput value={form.assigned_agent} onChange={(v) => setField("assigned_agent", v)} placeholder="e.g. Jarvis, Warren, Lorenzo" />
                  </div>

                </div>
              </div>

              {/* ── Description ─────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="mb-6 text-lg font-semibold">Description</h2>
                <textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="Add a brief description of this deliverable..."
                  rows={5}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-black px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                />
              </div>

              {/* ── Approval Actions ────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="mb-1 text-lg font-semibold">Approval</h2>
                <p className="mb-6 text-xs text-gray-500">
                  Internal workflow status — not client-facing.
                </p>

                {/* Current status pill */}
                <div className="mb-6 flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wider text-gray-600">Current status</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLORS[deliverable.status] ?? "border-gray-300 bg-white text-gray-300"}`}>
                    {deliverable.status}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={deliverable.status === "Confirmed" || deliverable.status === "Published"}
                    className="flex items-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/40 px-5 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>✓</span> Approve
                  </button>

                  <button
                    onClick={handlePublish}
                    disabled={deliverable.status === "Published"}
                    className="flex items-center gap-2 rounded-xl border border-purple-800 bg-purple-950/40 px-5 py-2.5 text-sm font-semibold text-purple-300 transition hover:bg-purple-950/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>↑</span> Mark Published
                  </button>

                  <button
                    onClick={() => { setShowRevForm((v) => !v); setRevError("") }}
                    className="flex items-center gap-2 rounded-xl border border-yellow-800 bg-yellow-950/40 px-5 py-2.5 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-950/70"
                  >
                    <span>↺</span> {showRevForm ? "Cancel" : "Request Revision"}
                  </button>
                </div>

                {/* Revision request form */}
                {showRevForm && (
                  <div className="mt-6 rounded-xl border border-yellow-900/50 bg-black p-5">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-yellow-400/80">
                      Revision Request
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Revision Type</FieldLabel>
                        <SelectInput
                          value={revForm.revision_type}
                          onChange={(v) => setRevForm((p) => ({ ...p, revision_type: v }))}
                          options={REVISION_TYPES}
                          placeholder="Select type"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel>Note *</FieldLabel>
                        <textarea
                          autoFocus
                          value={revForm.note}
                          onChange={(e) => setRevForm((p) => ({ ...p, note: e.target.value }))}
                          placeholder="Describe what needs to be revised..."
                          rows={3}
                          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                        />
                      </div>
                    </div>
                    {revError && (
                      <div className="mt-3 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                        ⚠ {revError}
                      </div>
                    )}
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={handleRequestRevision}
                        disabled={revSaving}
                        className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:opacity-50"
                      >
                        {revSaving ? "Submitting..." : "Submit Revision"}
                      </button>
                      <button
                        onClick={() => { setShowRevForm(false); setRevForm(EMPTY_REVISION_FORM); setRevError("") }}
                        className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-400 transition hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Approval feedback */}
                {approvalMsg && (
                  <div className="mt-4 rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                    ✓ {approvalMsg}
                  </div>
                )}
                {approvalErr && (
                  <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                    ⚠ {approvalErr}
                  </div>
                )}
              </div>

              {/* ── Revision History ─────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="mb-1 text-lg font-semibold">Revision History</h2>
                <p className="mb-6 text-xs text-gray-500">
                  All revision requests on this deliverable, newest first.
                </p>

                {revisionsLoading && (
                  <p className="text-sm text-gray-500">Loading...</p>
                )}

                {!revisionsLoading && revisions.length === 0 && (
                  <p className="text-sm text-gray-600">No revisions yet.</p>
                )}

                {!revisionsLoading && revisions.length > 0 && (
                  <div className="space-y-3">
                    {revisions.map((rev, i) => (
                      <div
                        key={rev.id}
                        className={`relative rounded-xl border p-5 ${
                          rev.status === "open"
                            ? "border-yellow-900/60 bg-yellow-950/10"
                            : "border-gray-200 bg-black"
                        }`}
                      >
                        {/* Timeline dot */}
                        {i < revisions.length - 1 && (
                          <div className="absolute -bottom-3 left-7 h-3 w-px bg-gray-100" />
                        )}

                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            {/* Header */}
                            <div className="flex flex-wrap items-center gap-2">
                              {rev.revision_type && (
                                <span className="rounded-full border border-yellow-800/60 bg-yellow-950/30 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                                  {rev.revision_type}
                                </span>
                              )}
                              {rev.requested_by && (
                                <span className="text-xs text-gray-500">by {rev.requested_by}</span>
                              )}
                              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                                rev.status === "open"
                                  ? "bg-yellow-950 text-yellow-400"
                                  : "bg-white text-gray-500"
                              }`}>
                                {rev.status}
                              </span>
                            </div>

                            {/* Note */}
                            {rev.note && (
                              <p className="mt-2.5 text-sm leading-relaxed text-gray-300">
                                {rev.note}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Timestamp */}
                        <p className="mt-3 text-xs text-gray-600">
                          {new Date(rev.created_at).toLocaleString("en-GB", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Assets ──────────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Assets</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Generated files, references, and exports linked to this deliverable.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowAddAsset((v) => !v); setAssetError("") }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-300 transition hover:border-neutral-500 hover:text-gray-900"
                  >
                    {showAddAsset ? "Cancel" : "+ Add Asset"}
                  </button>
                </div>

                {/* Add asset form */}
                {showAddAsset && (
                  <div className="mt-6 rounded-xl border border-gray-300 bg-black p-6">
                    <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">
                      New Asset
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                      <div>
                        <FieldLabel>Name *</FieldLabel>
                        <TextInput value={assetForm.name} onChange={(v) => setAssetField("name", v)} placeholder="e.g. Final Reel v2" />
                      </div>

                      <div>
                        <FieldLabel>Asset Type</FieldLabel>
                        <SelectInput value={assetForm.asset_type} onChange={(v) => setAssetField("asset_type", v)} options={ASSET_TYPES} placeholder="Select type" />
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel>File URL</FieldLabel>
                        <TextInput value={assetForm.file_url} onChange={(v) => setAssetField("file_url", v)} placeholder="https://..." />
                      </div>

                      <div>
                        <FieldLabel>Model Used</FieldLabel>
                        <TextInput value={assetForm.model_used} onChange={(v) => setAssetField("model_used", v)} placeholder="e.g. Midjourney v6, Runway Gen-3" />
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel>Prompt</FieldLabel>
                        <textarea
                          value={assetForm.prompt}
                          onChange={(e) => setAssetField("prompt", e.target.value)}
                          placeholder="Paste the generation prompt here..."
                          rows={3}
                          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                        />
                      </div>

                    </div>

                    {assetError && (
                      <div className="mt-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                        ⚠ {assetError}
                      </div>
                    )}

                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={handleCreateAsset}
                        disabled={assetSaving}
                        className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                      >
                        {assetSaving ? "Adding..." : "Add Asset"}
                      </button>
                      <button
                        onClick={() => { setShowAddAsset(false); setAssetForm(EMPTY_ASSET_FORM); setAssetError("") }}
                        className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-400 transition hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Asset success banner */}
                {assetSuccess && (
                  <div className="mt-4 rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                    ✓ {assetSuccess}
                  </div>
                )}

                {/* Asset list */}
                <div className="mt-6 space-y-3">
                  {assetsLoading && (
                    <p className="text-sm text-gray-500">Loading assets...</p>
                  )}

                  {!assetsLoading && assets.length === 0 && !showAddAsset && (
                    <p className="text-sm text-gray-600">No assets yet. Add the first one.</p>
                  )}

                  {!assetsLoading && assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="rounded-xl border border-gray-200 bg-black p-5 transition hover:border-gray-300"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-gray-900">{asset.name}</span>
                            <AssetTypeBadge type={asset.asset_type} />
                            {asset.version > 1 && (
                              <span className="text-xs text-gray-500">v{asset.version}</span>
                            )}
                          </div>

                          {asset.file_url && (
                            <a
                              href={asset.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 block truncate text-xs text-blue-400 transition hover:text-blue-300"
                            >
                              {asset.file_url}
                            </a>
                          )}

                          {asset.model_used && (
                            <p className="mt-1.5 text-xs text-gray-500">
                              Model: <span className="text-gray-400">{asset.model_used}</span>
                            </p>
                          )}

                          {asset.prompt && (
                            <p className="mt-2 line-clamp-2 text-xs text-gray-600">
                              {asset.prompt}
                            </p>
                          )}
                        </div>

                        <span className="shrink-0 text-xs text-gray-600">
                          {new Date(asset.created_at).toLocaleDateString("en-GB", {
                            day: "numeric", month: "short",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Copywriting ──────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Copywriting</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Captions, ad copy, scripts, and other written outputs for this deliverable.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowAddCopy((v) => !v); setCopyError("") }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-300 transition hover:border-neutral-500 hover:text-gray-900"
                  >
                    {showAddCopy ? "Cancel" : "+ Add Copy"}
                  </button>
                </div>

                {/* Add copy form */}
                {showAddCopy && (
                  <div className="mt-6 rounded-xl border border-gray-300 bg-black p-6">
                    <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-400">
                      New Copy
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                      <div>
                        <FieldLabel>Copy Type *</FieldLabel>
                        <SelectInput
                          value={copyForm.copy_type}
                          onChange={(v) => setCopyField("copy_type", v)}
                          options={COPY_TYPES}
                          placeholder="Select type"
                        />
                      </div>

                      <div>
                        <FieldLabel>Platform</FieldLabel>
                        <SelectInput
                          value={copyForm.platform}
                          onChange={(v) => setCopyField("platform", v)}
                          options={PLATFORMS}
                          placeholder="Select platform"
                        />
                      </div>

                      <div>
                        <FieldLabel>Tone</FieldLabel>
                        <SelectInput
                          value={copyForm.tone}
                          onChange={(v) => setCopyField("tone", v)}
                          options={TONES}
                          placeholder="Select tone"
                        />
                      </div>

                      <div>
                        <FieldLabel>Title</FieldLabel>
                        <TextInput
                          value={copyForm.title}
                          onChange={(v) => setCopyField("title", v)}
                          placeholder="e.g. Launch Caption v1"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel>Content *</FieldLabel>
                        <textarea
                          value={copyForm.content}
                          onChange={(e) => setCopyField("content", e.target.value)}
                          placeholder="Paste or write the copy here..."
                          rows={6}
                          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                        />
                      </div>

                    </div>

                    {copyError && (
                      <div className="mt-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                        ⚠ {copyError}
                      </div>
                    )}

                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={handleCreateCopy}
                        disabled={copySaving}
                        className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                      >
                        {copySaving ? "Saving..." : "Save Copy"}
                      </button>
                      <button
                        onClick={() => { setShowAddCopy(false); setCopyForm(EMPTY_COPY_FORM); setCopyError("") }}
                        className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-400 transition hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Copy success banner */}
                {copySuccess && (
                  <div className="mt-4 rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                    ✓ {copySuccess}
                  </div>
                )}

                {/* Copy list */}
                <div className="mt-6 space-y-3">
                  {copyLoading && (
                    <p className="text-sm text-gray-500">Loading copy...</p>
                  )}

                  {!copyLoading && copyItems.length === 0 && !showAddCopy && (
                    <p className="text-sm text-gray-600">No copy yet. Add the first one.</p>
                  )}

                  {!copyLoading && copyItems.map((item) => {
                    const isExpanded = expandedCopy === item.id
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-gray-200 bg-black transition hover:border-gray-300"
                      >
                        {/* Header row */}
                        <button
                          onClick={() => setExpandedCopy(isExpanded ? null : item.id)}
                          className="flex w-full items-start justify-between gap-4 p-5 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                {item.title || item.copy_type}
                              </span>
                              <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-400">
                                {item.copy_type}
                              </span>
                              {item.platform && (
                                <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500">
                                  {item.platform}
                                </span>
                              )}
                              {item.tone && (
                                <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500">
                                  {item.tone}
                                </span>
                              )}
                              {item.version > 1 && (
                                <span className="text-xs text-gray-600">v{item.version}</span>
                              )}
                            </div>
                            {!isExpanded && (
                              <p className="mt-1.5 line-clamp-1 text-xs text-gray-600">
                                {item.content}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-xs text-gray-600">
                              {new Date(item.created_at).toLocaleDateString("en-GB", {
                                day: "numeric", month: "short",
                              })}
                            </span>
                            <span className="text-xs text-gray-500">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </button>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 px-5 pb-5 pt-4">
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-300">
                              {item.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Coming soon panels ───────────────────────────────────────── */}
              {[
                { title: "AI Prompt",      note: "Prompt history and generation tools coming soon." },
                { title: "Internal Notes", note: "Team notes and revision history coming soon." },
              ].map(({ title, note }) => (
                <div key={title} className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <p className="mt-3 text-sm text-gray-600">{note}</p>
                </div>
              ))}

              {/* ── Activity Timeline ────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="mb-1 text-lg font-semibold">Activity</h2>
                <p className="mb-6 text-xs text-gray-500">
                  Internal system log — all actions on this deliverable.
                </p>

                {activityLoading && (
                  <p className="text-sm text-gray-500">Loading...</p>
                )}

                {!activityLoading && activity.length === 0 && (
                  <p className="text-sm text-gray-600">No activity recorded yet.</p>
                )}

                {!activityLoading && activity.length > 0 && (
                  <div className="relative space-y-0">
                    {/* Vertical line */}
                    <div className="absolute left-[13px] top-2 bottom-2 w-px bg-gray-100" />

                    {activity.map((entry) => (
                      <div key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
                        {/* Timeline dot */}
                        <div className="relative z-10 mt-0.5 h-[26px] w-[26px] shrink-0 flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-neutral-600" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Actor badge */}
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ACTOR_COLORS[entry.actor] ?? "border-gray-300 bg-white text-gray-400"}`}>
                              {entry.actor}
                            </span>

                            {/* Action */}
                            <span className="text-sm text-gray-300">
                              {entry.action.replace(/_/g, " ")}
                            </span>
                          </div>

                          {/* Summary */}
                          {entry.summary && (
                            <p className="mt-1 text-xs text-gray-500">{entry.summary}</p>
                          )}

                          {/* Timestamp */}
                          <p className="mt-1 text-xs text-gray-700">
                            {new Date(entry.created_at).toLocaleString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Metadata ─────────────────────────────────────────────────── */}
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="mb-6 text-lg font-semibold">Metadata</h2>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="text-gray-500">ID</div>
                  <div className="font-mono text-xs text-gray-400">{deliverable.id}</div>
                  <div className="text-gray-500">Created</div>
                  <div className="text-gray-300">
                    {new Date(deliverable.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </div>
                  <div className="text-gray-500">Approval</div>
                  <div className="text-gray-300">{deliverable.approval_status ?? "—"}</div>
                  <div className="text-gray-500">Assets</div>
                  <div className="text-gray-300">{assets.length}</div>
                  <div className="text-gray-500">Copy Items</div>
                  <div className="text-gray-300">{copyItems.length}</div>
                  <div className="text-gray-500">Revisions</div>
                  <div className="text-gray-300">{revisions.length}</div>
                </div>
              </div>

              {/* Bottom save */}
              <div className="mt-8 flex justify-end pb-10">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

            </>
          )}
        </div>
      </section>
    </main>
  )
}
