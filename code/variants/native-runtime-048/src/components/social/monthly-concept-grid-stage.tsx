"use client"

import { useCallback, useEffect, useState } from "react"

type GridStatus = "generating" | "generated" | "failed" | "stale" | "accepted"
type ConceptGrid = {
  id: string
  version: number
  status: GridStatus
  is_selected: boolean
  correction_text: string
  provider: string | null
  model: string | null
  reference_count: number
  execution: Record<string, unknown> | null
  image_url: string | null
  failure_reason: string | null
  generated_at: string | null
  accepted_at: string | null
  created_at: string
}

type ProviderStatus = { mode: "dry_run" | "live"; provider: string; model: string; configured: boolean; aspect_ratio: string; output_resolution: string; reference_limit: number }
type Inspection = {
  storyboard: { cells: Array<{ grid_cell: number; publishing_position: number; subject: string; truth_status: string; missing_truth: string | null; truth_reference_ids: string[]; venue_reference_ids: string[] }>; references: Array<{ id: string; name: string; category: string; role: string; perspective_flexibility: string | null }>; plan_snapshot_hash: string }
  prompt: string
  provider: ProviderStatus
}

function apiError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) throw new Error(apiError(payload, "Unable to complete this request."))
  return payload as T
}

function statusTone(status: GridStatus) {
  return status === "accepted" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
    : status === "generated" ? "border-sky-300/25 bg-sky-300/10 text-sky-50"
      : status === "stale" ? "border-amber-300/25 bg-amber-300/10 text-amber-50"
        : status === "failed" ? "border-red-300/25 bg-red-300/10 text-red-100"
          : "border-white/10 bg-white/[0.05] text-white/55"
}

function statusLabel(status: GridStatus) {
  return status === "accepted" ? "Visual Direction Accepted" : status[0].toUpperCase() + status.slice(1)
}

export type ActiveConceptGrid = Pick<ConceptGrid, "id" | "version" | "status" | "image_url" | "is_selected">

export function MonthlyConceptGridStage({ clientId, planId, planUpdatedAt, onActiveGridChange }: { clientId: string; planId: string; planUpdatedAt: string; onActiveGridChange: (grid: ActiveConceptGrid | null) => void }) {
  const [grids, setGrids] = useState<ConceptGrid[]>([])
  const [provider, setProvider] = useState<ProviderStatus | null>(null)
  const [correction, setCorrection] = useState("")
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [showInspection, setShowInspection] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"inspect" | "generate" | "select" | "accept" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await requestJson<{ grids: ConceptGrid[] }>(`/api/clients/${clientId}/monthly-plans/${planId}/concept-grids`)
      setGrids(data.grids)
      const active = data.grids.find(grid => grid.is_selected && grid.image_url) ?? data.grids.find(grid => (grid.status === "generated" || grid.status === "accepted") && grid.image_url) ?? null
      onActiveGridChange(active)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Concept Grids.")
    } finally {
      setLoading(false)
    }
  }, [clientId, onActiveGridChange, planId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load, planUpdatedAt])

  const inspect = async () => {
    setBusy("inspect")
    setError(null)
    try {
      const result = await requestJson<{ inspection: Inspection }>(`/api/clients/${clientId}/monthly-plans/${planId}/concept-grids`, { method: "POST", body: JSON.stringify({ action: "inspect", correction }) })
      setInspection(result.inspection)
      setProvider(result.inspection.provider)
      setShowInspection(true)
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : "Unable to assemble the Concept Grid package.")
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (!window.confirm("Generate one 4K Concept Grid for this month? This will make one provider request only when live generation is enabled.")) return
    setBusy("generate")
    setError(null)
    setNotice(null)
    try {
      const result = await requestJson<{ mode: "dry_run" | "live"; blocked: boolean; message?: string; provider: ProviderStatus; storyboard?: Inspection["storyboard"]; prompt?: string }>(`/api/clients/${clientId}/monthly-plans/${planId}/concept-grids`, { method: "POST", body: JSON.stringify({ action: "generate", correction }) })
      setProvider(result.provider)
      if (result.mode === "dry_run") {
        setInspection(result.storyboard && result.prompt ? { storyboard: result.storyboard, prompt: result.prompt, provider: result.provider } : null)
        setShowInspection(true)
        setNotice(result.message ?? "Dry-run complete. No image provider request was made.")
      } else {
        setCorrection("")
        setNotice("Concept Grid generated. Review it below before accepting the month-level visual direction.")
        await load()
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Concept Grid generation failed. Existing versions were preserved.")
      await load()
    } finally {
      setBusy(null)
    }
  }

  const update = async (grid: ConceptGrid, action: "select" | "accept") => {
    setBusy(action)
    setError(null)
    try {
      await requestJson(`/api/clients/${clientId}/monthly-plans/${planId}/concept-grids/${grid.id}`, { method: "PATCH", body: JSON.stringify({ action }) })
      setNotice(action === "accept" ? "Visual Direction accepted. This approves the storyboard direction only, not individual final posts." : `Concept Grid v${grid.version} selected.`)
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update Concept Grid selection.")
    } finally {
      setBusy(null)
    }
  }

  const current = grids.find(grid => grid.is_selected) ?? grids.find(grid => grid.status === "generated" || grid.status === "accepted") ?? null
  const renderProvider = provider ?? inspection?.provider

  return <section className="jarvis-panel">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="jarvis-eyebrow">5. Concept Grid</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Monthly Visual Storyboard</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">One 4K 3 × 5 board reviews the visual rhythm of the month. It is a planning artifact only, never a Client Brain truth asset or a crop source for production posts.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {renderProvider && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${renderProvider.mode === "live" ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-50" : "border-amber-300/20 bg-amber-300/[0.07] text-amber-50"}`}>{renderProvider.mode === "live" ? `${renderProvider.provider} · ${renderProvider.model} · ${renderProvider.output_resolution}` : "Dry-run protected"}</span>}
        {current && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(current.status)}`}>v{current.version} · {statusLabel(current.status)}</span>}
      </div>
    </div>

    {error && <p className="mt-5 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-3 text-sm text-red-100">{error}</p>}
    {notice && <p className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-3 text-sm text-emerald-50">{notice}</p>}

    <label className="mt-6 block">
      <span className="text-[11px] font-semibold text-white/48">CORRECTION FOR NEXT VERSION <span className="font-normal text-white/30">optional</span></span>
      <textarea value={correction} onChange={event => setCorrection(event.target.value)} rows={3} maxLength={1200} placeholder="e.g. Bottom row is too dark. Add more people and less burgundy." className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-emerald-300/35" />
      <span className="mt-2 block text-xs text-white/35">This changes only the next storyboard request. It never rewrites the saved plan, Client Brain, or production readiness.</span>
    </label>

    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" onClick={() => void generate()} disabled={busy !== null} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{busy === "generate" ? "Preparing..." : current ? "Regenerate Concept Grid" : "Generate Concept Grid"}</button>
      {process.env.NODE_ENV !== "production" && <button type="button" onClick={() => void inspect()} disabled={busy !== null} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/[0.05] disabled:opacity-40">{busy === "inspect" ? "Inspecting..." : "Inspect package"}</button>}
      {current?.image_url && <a href={current.image_url} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/[0.05]">View full size</a>}
    </div>

    {loading ? <p className="mt-6 text-sm text-white/40">Loading storyboard history...</p> : grids.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5"><p className="text-sm font-semibold text-white">Not generated</p><p className="mt-2 text-sm text-white/45">The structured 15-concept plan remains the source of truth. Generate only when you are ready to review one month-level visual direction.</p></div> : <div className="mt-6 space-y-3">
      {grids.map(grid => <article key={grid.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center">
        {grid.image_url ? <img src={grid.image_url} alt={`Concept Grid version ${grid.version}`} className="h-24 w-[58px] rounded-lg border border-white/10 object-cover" /> : <div className="grid h-24 w-[58px] place-items-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-center text-[9px] font-semibold text-white/35">No image</div>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">Concept Grid v{grid.version}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(grid.status)}`}>{statusLabel(grid.status)}</span>{grid.is_selected && <span className="text-[10px] font-semibold text-emerald-100">Selected</span>}</div><p className="mt-1 text-xs text-white/42">{grid.provider && grid.model ? `${grid.provider} · ${grid.model}` : "No provider call"} · {grid.reference_count} bounded references · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(grid.created_at))}</p>{grid.failure_reason && <p className="mt-2 text-xs text-red-100/80">{grid.failure_reason}</p>}</div>
        {grid.status === "generated" || grid.status === "accepted" ? <div className="flex flex-wrap gap-2"><button type="button" disabled={busy !== null || grid.is_selected} onClick={() => void update(grid, "select")} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-40">Select</button><button type="button" disabled={busy !== null || grid.status === "accepted"} onClick={() => void update(grid, "accept")} className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-50 disabled:opacity-40">Accept Visual Direction</button></div> : null}
      </article>)}
    </div>}

    {showInspection && inspection && <details open className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4"><summary className="cursor-pointer text-sm font-semibold text-white">Developer inspection: storyboard package</summary><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-white/38">Reference plan</p><p className="mt-2 text-sm text-white/65">{inspection.storyboard.cells.length} cells in newest-to-oldest Instagram display order · {inspection.storyboard.references.length}/{inspection.provider.reference_limit} references selected.</p><div className="mt-3 space-y-2">{inspection.storyboard.cells.map(cell => <p key={cell.grid_cell} className="text-xs text-white/48">Cell {cell.grid_cell} → P{cell.publishing_position}: {cell.subject} · {cell.truth_status}{cell.missing_truth ? ` · ${cell.missing_truth}` : ""}</p>)}</div></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-white/38">Bounded references</p><div className="mt-3 space-y-2">{inspection.storyboard.references.map(reference => <p key={reference.id} className="text-xs text-white/48">{reference.role} · {reference.name} · {reference.category}{reference.perspective_flexibility ? ` · ${reference.perspective_flexibility} perspective` : ""}</p>)}</div></div></div><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-white/58">Prompt preview</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-[10px] leading-relaxed text-white/52">{inspection.prompt}</pre></details></details>}
  </section>
}
