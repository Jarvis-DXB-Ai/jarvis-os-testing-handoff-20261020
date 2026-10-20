"use client"

import { useCallback, useEffect, useState } from "react"

import type { SocialIntelligenceFinding, SocialIntelligenceRecommendation } from "@/lib/social-intelligence"

type Artifact = {
  id: string
  data_revision: string
  period_start: string | null
  period_end: string | null
  deterministic: boolean
  model_cost_usd: number
  created_at: string
  executive_summary: string[]
  working: SocialIntelligenceFinding[]
  needs_attention: SocialIntelligenceFinding[]
  recommended_next_moves: SocialIntelligenceRecommendation[]
  experiments: SocialIntelligenceRecommendation[]
  data_gaps: SocialIntelligenceFinding[]
}

type Props = { clientId: string; readOnly?: boolean }

function confidenceTone(value: string) {
  if (value === "high") return "border-emerald-300/25 bg-emerald-300/[.08] text-emerald-100"
  if (value === "medium") return "border-sky-300/25 bg-sky-300/[.08] text-sky-100"
  return "border-amber-300/25 bg-amber-300/[.08] text-amber-100"
}

function timestamp(value: string) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(value)) }

function FindingCard({ item, action }: { item: SocialIntelligenceFinding | SocialIntelligenceRecommendation; action?: boolean }) {
  return <article className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
    <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-white">{item.title}</p><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.08em] ${confidenceTone(item.confidence)}`}>{item.confidence === "low" ? "Test" : item.confidence}</span></div>
    <p className="mt-2 text-xs leading-5 text-white/62">{item.statement}</p>
    {action && "recommended_action" in item && <p className="mt-3 rounded-lg border border-emerald-300/15 bg-emerald-300/[.045] p-2.5 text-xs leading-5 text-emerald-50/85">{item.recommended_action}</p>}
    <details className="mt-3 border-t border-white/[0.06] pt-2.5"><summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[.12em] text-white/45 hover:text-white/70">Why?</summary><div className="mt-2 space-y-2 text-[11px] leading-5 text-white/48">{item.evidence.map(evidence => <div key={evidence.signal_key}><p>{evidence.finding}</p><p className="mt-1 text-white/32">n = {evidence.sample_size} · {evidence.method}</p><p className="mt-1 break-words font-mono text-[10px] text-white/28">{evidence.source_refs.map(source => source.provider_post_id ? `${source.table}:${source.provider_post_id}` : `${source.table}:${source.id}`).join(" · ")}</p></div>)}</div></details>
  </article>
}

export default function SocialIntelligencePanel({ clientId, readOnly = false }: Props) {
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/social-intelligence`, { cache: "no-store" })
    const payload = await response.json().catch(() => ({})) as { artifact?: Artifact | null; error?: string }
    if (!response.ok) throw new Error(payload.error || "Unable to load Social Intelligence.")
    setArtifact(payload.artifact ?? null)
    return payload.artifact ?? null
  }, [clientId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load Social Intelligence.")) }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const analyse = async () => {
    setRunning(true); setError(null)
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/social-intelligence`, { method: "POST" })
      const payload = await response.json().catch(() => ({})) as { error?: string; dataRevision?: string }
      if (!response.ok) throw new Error(payload.error || "Unable to start Social Intelligence.")
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const next = await load()
        if (next && (!payload.dataRevision || next.data_revision === payload.dataRevision)) return
        await new Promise(resolve => window.setTimeout(resolve, 900))
      }
      throw new Error("Analysis is still running. Refresh this view in a moment to see the retained result.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start Social Intelligence.") }
    finally { setRunning(false) }
  }

  return <section className="rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[.07] to-white/[.018] p-4">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="jarvis-eyebrow">Jarvis Intelligence</p><h2 className="mt-1 text-lg font-semibold tracking-[-0.035em] text-white">Evidence-backed next-cycle guidance</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">Cached Social evidence only. No provider refresh, publishing, scheduling, or Client Brain promotion occurs here.</p></div>{readOnly ? <span className="shrink-0 rounded-lg border border-white/[.1] bg-black/20 px-3 py-2 text-xs font-semibold text-white/55">Read-only cache</span> : <button type="button" disabled={running} onClick={() => void analyse()} className="shrink-0 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50">{running ? "Analysing retained evidence…" : artifact ? "Re-analyse Social Performance" : "Analyse Social Performance"}</button>}</div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/[.08] px-3 py-2 text-xs text-rose-100">{error}</p>}
    {!artifact ? <div className="mt-4 rounded-xl border border-dashed border-white/[.14] bg-black/15 p-4 text-sm text-white/45">No retained Social Intelligence artifact yet. This read-only view does not create one automatically.</div> : <>
      <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-white/42"><span className="rounded-full border border-white/[.1] bg-black/20 px-2.5 py-1">{artifact.period_start && artifact.period_end ? `${artifact.period_start} – ${artifact.period_end}` : "Cached period unavailable"}</span><span className="rounded-full border border-white/[.1] bg-black/20 px-2.5 py-1">Analysed {timestamp(artifact.created_at)}</span><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-2.5 py-1 text-emerald-100">Deterministic · $0</span></div>
      <div className="mt-4 rounded-xl border border-white/[.08] bg-black/15 p-3 text-xs leading-5 text-white/62">{artifact.executive_summary.slice(0, 3).map(line => <p key={line}>{line}</p>)}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3"><Group title="Working" items={artifact.working.slice(0, 3)} /><Group title="Needs attention" items={artifact.needs_attention.slice(0, 3)} /><Group title="Next moves" items={artifact.recommended_next_moves.slice(0, 3)} action /></div>
      {(artifact.experiments.length > 0 || artifact.data_gaps.length > 0) && <details className="mt-4 rounded-xl border border-white/[.08] bg-black/15 p-3"><summary className="cursor-pointer select-none text-xs font-semibold text-white/60">Experiments and data gaps</summary><div className="mt-3 grid gap-3 lg:grid-cols-2">{artifact.experiments.slice(0, 3).map(item => <FindingCard key={item.id} item={item} action />)}{artifact.data_gaps.slice(0, 3).map(item => <FindingCard key={item.id} item={item} />)}</div></details>}
    </>}
  </section>
}

function Group({ title, items, action = false }: { title: string; items: Array<SocialIntelligenceFinding | SocialIntelligenceRecommendation>; action?: boolean }) {
  return <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/42">{title}</p><div className="space-y-2">{items.length ? items.map(item => <FindingCard key={item.id} item={item} action={action} />) : <p className="rounded-xl border border-dashed border-white/[.12] p-3 text-xs leading-5 text-white/38">No supported finding in this category yet.</p>}</div></div>
}
