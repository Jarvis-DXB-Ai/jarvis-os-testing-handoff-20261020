"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { visualDirectionLabel, type VisualDirectionFields } from "@/lib/social-monthly-visual-direction-types"
import { visualDirectionWarnings } from "@/lib/social-monthly-visual-direction-quality"

type DirectionItem = {
  id: string
  position: number
  subject: string
  shot_scale: VisualDirectionFields["shot_scale"]
  camera_angle: VisualDirectionFields["camera_angle"]
  composition: VisualDirectionFields["composition"]
  human_presence: VisualDirectionFields["human_presence"]
  interaction: VisualDirectionFields["interaction"]
  motion: VisualDirectionFields["motion"]
  visual_direction: string
  production_aspect_ratio: "4:5"
  grid_crop_behavior: VisualDirectionFields["grid_crop_behavior"]
  visual_direction_source?: "unassigned" | "ai" | "manual"
}

type ProviderStatus = { configured: boolean; provider: string; model: string; prompt_version: string; one_month_level_call: boolean }

function apiError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) throw new Error(apiError(payload, "Unable to complete this request."))
  return payload as T
}

export function MonthlyVisualDirectionStage({ clientId, planId, items, onGenerated }: { clientId: string; planId: string; items: DirectionItem[]; onGenerated: () => Promise<void> }) {
  const [provider, setProvider] = useState<ProviderStatus | null>(null)
  const [correction, setCorrection] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const hasDirections = items.some(item => item.visual_direction_source === "ai" || item.visual_direction_source === "manual")
  const warnings = useMemo(() => hasDirections ? visualDirectionWarnings(items) : [], [hasDirections, items])

  const load = useCallback(async () => {
    try {
      const data = await requestJson<{ visual_direction_ai: ProviderStatus }>(`/api/clients/${clientId}/monthly-plans/${planId}/visual-direction`)
      setProvider(data.visual_direction_ai)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Visual Direction AI status is unavailable.")
    }
  }, [clientId, planId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const generate = async () => {
    if (!provider?.configured) {
      setError("Visual Direction AI is not currently available. You can still edit each concept manually.")
      return
    }
    const message = hasDirections ? "Regenerate Visual Direction for all Feed concepts? This makes one Anthropic reasoning request and marks the current Concept Grid stale." : "Generate Visual Direction for all Feed concepts? This makes one Anthropic reasoning request."
    if (!window.confirm(message)) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await requestJson<{ warnings: string[]; execution: { actual_cost_usd: number | null } }>(`/api/clients/${clientId}/monthly-plans/${planId}/visual-direction`, { method: "POST", body: JSON.stringify({ correction }) })
      setCorrection("")
      await onGenerated()
      const cost = typeof result.execution.actual_cost_usd === "number" ? ` · $${result.execution.actual_cost_usd.toFixed(4)}` : ""
      setNotice(`Visual Direction saved for ${items.length} concepts${cost}. Review the visual rhythm before generating the next Concept Grid.`)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Visual Direction was not generated. Existing concepts were preserved.")
    } finally {
      setBusy(false)
    }
  }

  return <section className="jarvis-panel">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="jarvis-eyebrow">4. Visual Direction</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Art-direct the complete month.</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">One Creative Director pass decides how the approved concepts should look together. It does not rewrite subjects, strategy, truth Assets, or the current Concept Grid.</p>
      </div>
      {provider && <span className={`h-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${provider.configured ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-50" : "border-amber-300/20 bg-amber-300/[0.07] text-amber-50"}`}>{provider.configured ? `${provider.provider} · ${provider.model}` : "AI unavailable"}</span>}
    </div>
    {error && <p className="mt-5 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-3 text-sm text-red-100">{error}</p>}
    {notice && <p className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-3 text-sm text-emerald-50">{notice}</p>}
    <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[52px_1.35fr_110px_150px_145px_110px_90px] gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-white/38"><span>Post</span><span>Subject</span><span>Scale</span><span>Angle</span><span>Composition</span><span>People</span><span>Motion</span></div>
        {items.map(item => <div key={item.id} className="grid grid-cols-[52px_1.35fr_110px_150px_145px_110px_90px] gap-3 border-b border-white/[0.07] px-4 py-3 text-xs last:border-none"><span className="font-semibold text-emerald-100">P{item.position}</span><span className="truncate text-white/75">{item.subject || "Untitled concept"}</span><span className="text-white/52">{item.shot_scale === "other" ? "Pending" : visualDirectionLabel(item.shot_scale)}</span><span className="text-white/52">{item.camera_angle === "other" ? "Pending" : visualDirectionLabel(item.camera_angle)}</span><span className="text-white/52">{item.composition === "other" ? "Pending" : visualDirectionLabel(item.composition)}</span><span className="text-white/52">{visualDirectionLabel(item.human_presence)}</span><span className="text-white/52">{visualDirectionLabel(item.motion)}</span></div>)}
      </div>
    </div>
    {hasDirections && <div className="mt-5 space-y-2">{warnings.length ? warnings.map(warning => <p key={warning} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-3 text-xs text-amber-50">{warning}</p>) : <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-3 text-xs text-emerald-50">No obvious Visual Direction imbalance detected.</p>}</div>}
    <label className="mt-5 block"><span className="text-[11px] font-semibold text-white/48">CORRECTION FOR NEXT PASS <span className="font-normal text-white/30">optional</span></span><textarea value={correction} onChange={event => setCorrection(event.target.value)} rows={3} maxLength={1200} placeholder="e.g. Use more overhead photography and hands sharing food." className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-emerald-300/35" /></label>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void generate()} disabled={busy || items.length === 0} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{busy ? "Art-directing month..." : hasDirections ? "Regenerate Visual Direction" : "Generate Visual Direction"}</button><p className="text-xs text-white/38">One month-level reasoning call only. Per-post fields remain editable with explicit Save.</p></div>
  </section>
}
