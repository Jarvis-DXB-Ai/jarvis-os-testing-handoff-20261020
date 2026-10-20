"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import {
  SIGNATURE_SYSTEMS,
  buildEditorialChoreographyInsights,
  buildFeedEnergyMeter,
  buildFeedSimulation,
  buildVisualMemoryAnchors,
  type EditorialPlanItem,
  type FeedEnergyMeter,
  type FeedSimulationSlot,
  type EditorialChoreographyInsight,
  type VisualMemoryAnchor,
} from "@/lib/editorial-feed-intelligence"
import {
  inspirationMetadata,
  inspirationReferenceFromAsset,
  isInspirationAsset,
} from "@/lib/inspiration-references"
import {
  DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS,
  buildVisualIntelligence,
  classifyVisualReference,
  visualPromptGuidance,
  type FeedChoreographyInsight,
  type VisualIntelligenceRef,
  type VisualPatternGroup,
} from "@/lib/visual-intelligence"

type Client = {
  id: string
  name: string
  industry: string | null
  status: string
}

type InspirationAsset = {
  id: string
  client_id: string
  file_name: string
  asset_category: string | null
  file_path?: string | null
  uploaded_at?: string
  metadata?: unknown
}

type VisualTab =
  | "dna"
  | "moodboards"
  | "feed"
  | "rhythm"
  | "composition"
  | "lighting"
  | "emotion"
  | "learnings"

const TABS: Array<{ id: VisualTab; label: string }> = [
  { id: "dna", label: "Visual DNA" },
  { id: "moodboards", label: "Moodboard Intelligence" },
  { id: "feed", label: "Feed Choreography" },
  { id: "rhythm", label: "Visual Rhythm" },
  { id: "composition", label: "Composition Systems" },
  { id: "lighting", label: "Lighting Systems" },
  { id: "emotion", label: "Emotional Mapping" },
  { id: "learnings", label: "Creative Learnings" },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function boardToVisualRef(board: Record<string, unknown>): VisualIntelligenceRef {
  return classifyVisualReference({
    id: stringValue(board.id, stringValue(board.name, "pinterest-board")),
    boardName: stringValue(board.name, "Pinterest board"),
    title: stringValue(board.description),
    tags: stringValue(board.name).split(/[-/ ]+/).filter(Boolean),
    imageUrl: stringValue(board.coverImageUrl),
    inspirationOnly: true,
  })
}

export default function VisualIntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<VisualTab>("dna")
  const [pinterestBoards, setPinterestBoards] = useState<Record<string, unknown>[]>([])
  const [brainInspirationAssets, setBrainInspirationAssets] = useState<InspirationAsset[]>([])
  const [brainInspirationUrls, setBrainInspirationUrls] = useState<Record<string, string>>({})
  const [pinterestState, setPinterestState] = useState<"loading" | "connected" | "empty" | "error">("loading")
  const [pinterestError, setPinterestError] = useState("")

  const loadClient = useCallback(async () => {
    setLoading(true)
    const { data, error: clientError } = await supabase.from("clients").select("id,name,industry,status").eq("id", id).single()
    if (clientError) setError(clientError.message)
    else setClient(data)
    setLoading(false)
  }, [id])

  useEffect(() => { loadClient() }, [loadClient])

  useEffect(() => {
    let alive = true
    async function loadBrainInspiration() {
      const { data } = await supabase
        .from("asset_uploads")
        .select("id,client_id,file_name,asset_category,file_path,uploaded_at,metadata")
        .eq("client_id", id)
        .eq("asset_category", "pinterest_inspiration")
        .neq("status", "archived")
        .order("uploaded_at", { ascending: false })
      if (!alive) return
      setBrainInspirationAssets(((data ?? []) as InspirationAsset[]).filter(isInspirationAsset))
    }
    loadBrainInspiration()
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    const missing = brainInspirationAssets
      .filter(asset => asset.file_path && !brainInspirationUrls[asset.id])
      .map(asset => ({ id: asset.id, path: asset.file_path! }))
    if (missing.length === 0) return
    ;(async () => {
      const response = await fetch("/api/brain/signed-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: missing }),
      })
      if (!response.ok) return
      const { urls } = await response.json() as { urls: Record<string, string> }
      setBrainInspirationUrls(prev => ({ ...prev, ...urls }))
    })()
  }, [brainInspirationAssets, brainInspirationUrls])

  useEffect(() => {
    let alive = true
    async function loadPinterestBoards() {
      setPinterestState("loading")
      try {
        const response = await fetch("/api/pinterest/boards")
        const payload = await response.json()
        if (!alive) return
        const boards = Array.isArray(payload.data) ? payload.data.filter(isRecord) : []
        setPinterestBoards(boards)
        setPinterestState(boards.length > 0 ? "connected" : "empty")
        setPinterestError(stringValue(payload.error))
      } catch (err) {
        if (!alive) return
        setPinterestBoards([])
        setPinterestState("error")
        setPinterestError(err instanceof Error ? err.message : "Pinterest boards could not be loaded.")
      }
    }
    loadPinterestBoards()
    return () => { alive = false }
  }, [])

  const classifiedRefs = useMemo(() => {
    const brainRefs = brainInspirationAssets.map(asset => {
      const ref = inspirationReferenceFromAsset(asset, brainInspirationUrls[asset.id])
      const metadata = inspirationMetadata(asset)
      const classified = classifyVisualReference({
        id: ref.id,
        boardName: ref.folder,
        title: ref.title,
        imageUrl: ref.imageUrl,
        tags: ref.tags,
        notes: ref.notes,
        inspirationOnly: true,
      })
      return {
        ...classified,
        source: "manual" as const,
        compositionType: (stringValue(metadata.compositionType) || classified.compositionType) as VisualIntelligenceRef["compositionType"],
        lightingStyle: (stringValue(metadata.lightingStyle) || classified.lightingStyle) as VisualIntelligenceRef["lightingStyle"],
        emotionalTone: (stringValue(metadata.emotionalTone) || classified.emotionalTone) as VisualIntelligenceRef["emotionalTone"],
        storyRole: (stringValue(metadata.storyRole) || classified.storyRole) as VisualIntelligenceRef["storyRole"],
        feedRole: (stringValue(metadata.feedRole) || classified.feedRole) as VisualIntelligenceRef["feedRole"],
      } satisfies VisualIntelligenceRef
    })
    const boardRefs = pinterestBoards.map(boardToVisualRef)
    const refs = [...brainRefs, ...boardRefs]
    return refs.length > 0 ? refs : DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS
  }, [brainInspirationAssets, brainInspirationUrls, pinterestBoards])

  const report = useMemo(() => buildVisualIntelligence(classifiedRefs), [classifiedRefs])
  const guidance = useMemo(() => visualPromptGuidance(report), [report])
  const visualSimulationItems = useMemo<EditorialPlanItem[]>(() => classifiedRefs.slice(0, 20).map((ref, index) => ({
    id: `visual-sim-${ref.id}`,
    week: Math.floor(index / 5) + 1,
    day: `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index % 7]} W${Math.floor(index / 5) + 1}`,
    title: ref.title || ref.boardName,
    objective: ref.feedRole === "campaign_focus" ? "campaign push" : ref.feedRole === "typography_break" ? "editorial pause" : "world-building",
    pillar:
      ref.compositionType === "macro" ? "Food Storytelling" :
      ref.compositionType === "wide_atmosphere" ? "Atmosphere & Architecture" :
      ref.compositionType === "hands_in_frame" || ref.compositionType === "chef_detail" ? "Service & BTS" :
      ref.feedRole === "typography_break" ? "Campaign Activations" :
      "Lifestyle Hospitality",
    campaign:
      ref.boardName.includes("Lunch") ? "Business Lunch" :
      ref.boardName.includes("Cocktail") || ref.boardName.includes("Drinks") ? "Traffic Hours" :
      ref.emotionalTone === "nostalgia" ? "Third Culture Stories" :
      "Brand World",
    emotionalGoal: ref.emotionalTone,
    format: ref.feedRole === "typography_break" ? "editorial graphic" : ref.compositionType === "macro" ? "product photography" : "lifestyle post",
    productionSystem: "Visual Intelligence",
    captionDirection: "editorial",
  })), [classifiedRefs])
  const feedSimulation = useMemo(() => buildFeedSimulation(visualSimulationItems, 30), [visualSimulationItems])
  const feedEnergy = useMemo(() => buildFeedEnergyMeter(feedSimulation), [feedSimulation])
  const editorialInsights = useMemo(() => buildEditorialChoreographyInsights(feedSimulation), [feedSimulation])
  const visualMemoryAnchors = useMemo(() => buildVisualMemoryAnchors(feedSimulation), [feedSimulation])

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page">
            <div className="animate-pulse space-y-4">
              <div className="h-3 w-36 rounded bg-white/10" />
              <div className="h-10 w-80 rounded bg-white/10" />
              <div className="h-48 rounded-[2rem] bg-white/[0.04]" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error || !client) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page">
            <p className="text-red-300">{error || "Client not found."}</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen bg-[#020403] text-white">
      <Sidebar />
      <section className="jarvis-dark-shell">
        <div className="jarvis-page">
          <Link href={`/clients/${id}`} className="text-sm text-white/45 transition hover:text-white">&lt;- Back to client</Link>

          <section className="jarvis-hero mt-5">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <p className="jarvis-eyebrow">Visual Intelligence Engine</p>
                <h1 className="jarvis-title mt-3">{client.name} Editorial Orchestration</h1>
                <p className="jarvis-copy mt-5 max-w-3xl">
                  Feed choreography, moodboard intelligence, visual pacing, emotional mapping,
                  composition systems, and creative direction memory for DemoClientD&apos;s luxury hospitality universe.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5 xl:w-[360px]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Inspiration only</p>
                <p className="mt-3 text-lg font-semibold text-white">Patterns, not copying</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  Pinterest references are classified into reusable creative patterns. Jarvis should generate new variations,
                  not clone reference images.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <MetricCard label="Classified refs" value={String(report.refCount)} />
            <MetricCard label="Dominant lighting" value={report.dominant.lighting?.replaceAll("_", " ") ?? "Unknown"} />
            <MetricCard label="Dominant composition" value={report.dominant.composition?.replaceAll("_", " ") ?? "Unknown"} />
            <MetricCard label="Brain inspiration" value={`${brainInspirationAssets.length} refs`} />
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-black/25 p-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "bg-emerald-400 text-[#07110c] shadow-[0_0_24px_rgba(52,211,153,0.25)]" : "text-white/45 hover:bg-white/[0.045] hover:text-white/80"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section>
              {activeTab === "dna" && <VisualDna />}
              {activeTab === "moodboards" && <MoodboardIntelligence refs={classifiedRefs} pinterestState={pinterestState} pinterestError={pinterestError} boardCount={pinterestBoards.length} />}
              {activeTab === "feed" && <FeedChoreography insights={report.feedInsights} report={report} simulation={feedSimulation} energy={feedEnergy} editorialInsights={editorialInsights} anchors={visualMemoryAnchors} />}
              {activeTab === "rhythm" && <VisualRhythm report={report} simulation={feedSimulation} energy={feedEnergy} />}
              {activeTab === "composition" && <PatternSystems title="Composition Systems" groups={report.groups.composition} />}
              {activeTab === "lighting" && <PatternSystems title="Lighting Systems" groups={report.groups.lighting} />}
              {activeTab === "emotion" && <PatternSystems title="Emotional Mapping" groups={report.groups.emotion} />}
              {activeTab === "learnings" && <CreativeLearnings report={report} />}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Choreography Guidance</p>
                <h3 className="mt-2 text-xl font-semibold text-white">For planning and generation</h3>
                <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-white/55 whitespace-pre-wrap">{guidance}</pre>
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Underused Levers</p>
                <div className="mt-4 space-y-4">
                  <UnderusedList title="Composition" values={report.underused.composition} />
                  <UnderusedList title="Lighting" values={report.underused.lighting} />
                  <UnderusedList title="Emotion" values={report.underused.emotion} />
                  <UnderusedList title="Feed role" values={report.underused.feedRole} />
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Safety</p>
                <p className="mt-3 text-sm leading-relaxed text-white/52">
                  Read-only and local analysis only. No Pinterest pin creation, scheduling, publishing, or social actions.
                </p>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{label}</p>
      <p className="mt-2 text-xl font-semibold capitalize text-white">{value}</p>
    </div>
  )
}

function VisualDna() {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Visual DNA" title="Luxury hospitality with warmth, not imitation." detail="The engine translates moodboards into reusable visual principles: rhythm, composition, light, emotion, story role, and feed function." />
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ["Non-copying rule", "Pinterest is inspiration only. Extract patterns such as light, crop, pacing, and emotional tone. Do not clone layouts or images."],
          ["DemoClientD visual world", "Warm luxury, dark premium surfaces, brass accents, blue/dark seating, hospitality warmth, and Third Culture food storytelling."],
          ["Editorial choreography", "Alternate close/detail/product posts with social, atmosphere, typography, and campaign beats."],
          ["Generation hook", "Future AI Photography, Videography, and Design prompts should use visual roles, not raw reference copying."],
        ].map(([title, detail]) => (
          <article key={title} className="jarvis-card p-6">
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/50">{detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function MoodboardIntelligence({ refs, pinterestState, pinterestError, boardCount }: { refs: VisualIntelligenceRef[]; pinterestState: string; pinterestError: string; boardCount: number }) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Moodboard Intelligence" title="Pinterest boards become creative direction memory" detail="References are classified into composition, lighting, emotion, story role, and feed role. This is heuristic/manual-ready now and structured for future vision analysis." />
      <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
        <p className="text-sm font-semibold text-white">Pinterest read-only state: <span className="capitalize text-emerald-100">{pinterestState}</span></p>
        <p className="mt-1 text-xs text-white/42">{boardCount > 0 ? `${boardCount} boards returned from the read-only Pinterest/Zernio layer.` : "Using brand seed patterns until live boards return."}</p>
        {pinterestError && <p className="mt-2 text-xs text-amber-100/70">{pinterestError}</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {refs.map(ref => (
          <article key={ref.id} className="jarvis-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="jarvis-eyebrow">{ref.source.replaceAll("_", " ")}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{ref.boardName}</h3>
                {ref.title && <p className="mt-1 text-sm text-white/45">{ref.title}</p>}
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100">inspiration only</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill>{ref.compositionType}</Pill>
              <Pill>{ref.lightingStyle}</Pill>
              <Pill>{ref.emotionalTone}</Pill>
              <Pill>{ref.feedRole}</Pill>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FeedChoreography({
  insights,
  report,
  simulation,
  energy,
  editorialInsights,
  anchors,
}: {
  insights: FeedChoreographyInsight[]
  report: ReturnType<typeof buildVisualIntelligence>
  simulation: FeedSimulationSlot[]
  energy: FeedEnergyMeter
  editorialInsights: EditorialChoreographyInsight[]
  anchors: VisualMemoryAnchor[]
}) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Feed Choreography" title="The feed as one living editorial system" detail="This layer watches adjacency, visual pacing, dark/light balance, macro vs wide ratio, lifestyle vs product balance, typography breaks, campaign interruptions, and world-building rhythm." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <VisualFeedSimulation slots={simulation} />
        <aside className="space-y-5">
          <VisualEnergyMeter energy={energy} />
          <div className="jarvis-panel">
            <p className="jarvis-eyebrow">Editorial Warnings</p>
            <div className="mt-4 space-y-3">
              {editorialInsights.map(insight => (
                <div key={insight.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{insight.title}</p>
                    <Pill>{insight.severity}</Pill>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/45">{insight.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {insights.map(insight => (
          <article key={insight.id} className="jarvis-card p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold text-white">{insight.title}</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${insight.severity === "priority" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : insight.severity === "watch" ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.045] text-white/45"}`}>{insight.severity}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/52">{insight.detail}</p>
            <p className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 text-sm leading-relaxed text-emerald-50/72">{insight.recommendation}</p>
          </article>
        ))}
      </div>
      <div className="jarvis-panel">
        <p className="jarvis-eyebrow">Feed Role Mix</p>
        <PatternBars groups={report.groups.feedRole} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="jarvis-panel">
          <p className="jarvis-eyebrow">Signature Systems</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SIGNATURE_SYSTEMS.map(system => (
              <div key={system.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-sm font-semibold text-white">{system.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/42">{system.emotionalTerritory}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="jarvis-panel">
          <p className="jarvis-eyebrow">Visual Memory Anchors</p>
          <div className="mt-4 space-y-3">
            {anchors.map(anchor => (
              <div key={anchor.title} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{anchor.title}</p>
                  <Pill>{String(anchor.count)}</Pill>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/42">{anchor.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

function VisualRhythm({ report, simulation, energy }: { report: ReturnType<typeof buildVisualIntelligence>; simulation: FeedSimulationSlot[]; energy: FeedEnergyMeter }) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Visual Rhythm" title="Pacing systems and emotional transitions" detail="A feed should move through contrast, reset, social energy, detail, hero moments, and campaign punctuation." />
      <VisualEnergyMeter energy={energy} />
      <div className="jarvis-panel">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          {report.rhythmSequence.map(beat => (
            <div key={beat.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{beat.label}</p>
              <p className="mt-2 text-sm font-semibold text-white">{beat.feedRole.replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs text-white/38">{beat.lighting.replaceAll("_", " ")} · {beat.emotion}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="jarvis-panel">
        <p className="jarvis-eyebrow">Simulation Sequence</p>
        <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
          {simulation.slice(0, 18).map(slot => (
            <div key={slot.id} className={`aspect-square rounded-2xl border border-white/10 bg-gradient-to-br ${visualSlotGradient(slot)} p-3`}>
              <p className="text-[10px] font-semibold text-white/45">#{slot.postNumber}</p>
              <p className="mt-6 line-clamp-2 text-xs font-semibold text-white">{slot.feedRole.replaceAll("_", " ")}</p>
              <p className="mt-1 line-clamp-1 text-[10px] text-white/35">{slot.emotionalTone}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function visualSlotGradient(slot: FeedSimulationSlot) {
  if (slot.feedRole === "typography_break") return "from-white/18 via-black to-black"
  if (slot.lighting === "soft_daylight") return "from-amber-100/22 via-emerald-200/10 to-black"
  if (slot.lighting === "golden_hour") return "from-amber-300/28 via-orange-400/12 to-black"
  if (slot.lighting === "dark_cinematic") return "from-blue-950/70 via-black to-emerald-950/35"
  if (slot.composition === "macro") return "from-amber-900/35 via-black to-rose-950/25"
  if (slot.composition === "wide_atmosphere") return "from-cyan-950/30 via-black to-blue-950/35"
  return "from-emerald-400/18 via-black to-fuchsia-950/20"
}

function VisualFeedSimulation({ slots }: { slots: FeedSimulationSlot[] }) {
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Feed Simulation Mode</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">Moodboard patterns as a 30-post rhythm</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/50">
        This is not image copying. It converts classified inspiration into visual pacing: light, density, emotion, composition, feed role, and cultural feel.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-5">
        {slots.map(slot => (
          <article key={slot.id} className={`relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${visualSlotGradient(slot)} p-3`}>
            <div className="absolute inset-0 opacity-60">
              <div className={`absolute ${slot.composition === "macro" ? "left-4 top-4 h-16 w-16" : "left-5 top-5 h-10 w-20"} rounded-full border border-white/20 bg-white/10 blur-[1px]`} />
              {slot.feedRole === "typography_break" && <div className="absolute bottom-5 left-4 right-4 space-y-1.5">{[1, 2, 3].map(line => <div key={line} className="h-1.5 rounded-full bg-white/35" />)}</div>}
              {slot.composition === "social_table" && <div className="absolute bottom-5 left-5 right-5 h-8 rounded-full border border-emerald-200/20 bg-emerald-100/10" />}
            </div>
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-white/75">{slot.postNumber}</span>
                {slot.worldBuilding && <span className="rounded-full border border-fuchsia-200/20 bg-fuchsia-300/15 px-1.5 py-0.5 text-[9px] font-semibold text-fuchsia-100">world</span>}
              </div>
              <div>
                <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{slot.signatureSystem}</p>
                <p className="mt-1 line-clamp-1 text-[9px] uppercase tracking-[0.12em] text-white/42">{slot.visualLabel}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function VisualEnergyMeter({ energy }: { energy: FeedEnergyMeter }) {
  const rows = [
    ["Darkness", energy.darkness],
    ["Product density", energy.productDensity],
    ["Social warmth", energy.socialWarmth],
    ["Typography", energy.typographyUsage],
    ["Campaign pressure", energy.campaignPressure],
    ["Emotional energy", energy.emotionalEnergy],
    ["Cultural feel", energy.culturalFeel],
  ] as const
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Feed Energy Meter</p>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-white/58">{label}</span>
              <span className="text-white/35">{value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-300/75" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PatternSystems<T extends string>({ title, groups }: { title: string; groups: Array<VisualPatternGroup<T>> }) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow={title} title={`Recurring ${title.toLowerCase()}`} detail="Patterns are reusable creative directions. They should inform variation, sequencing, and prompt language without copying a reference image." />
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(group => (
          <article key={group.label} className="jarvis-card p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold capitalize text-white">{group.label.replaceAll("_", " ")}</h3>
              <Pill>{`${group.percentage}%`}</Pill>
            </div>
            <p className="mt-3 text-sm text-white/45">{group.count} classified refs</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${group.percentage}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CreativeLearnings({ report }: { report: ReturnType<typeof buildVisualIntelligence> }) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Creative Learnings" title="Reusable visual strategy memory" detail="This tab stores the strongest patterns, recurring aesthetics, underused levers, and future variation logic that should inform planning and generation." />
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ["Strongest composition", report.dominant.composition?.replaceAll("_", " ") ?? "Unknown"],
          ["Strongest lighting", report.dominant.lighting?.replaceAll("_", " ") ?? "Unknown"],
          ["Strongest emotion", report.dominant.emotion ?? "Unknown"],
          ["Variation principle", "Generate new visual variations inside DemoClientD's luxury hospitality universe. Do not copy Pinterest."],
        ].map(([title, detail]) => (
          <article key={title} className="jarvis-card p-6">
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed capitalize text-white/52">{detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function SectionHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="jarvis-panel">
      <p className="jarvis-eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-4 max-w-4xl text-sm leading-relaxed text-white/52">{detail}</p>
    </div>
  )
}

function Pill({ children }: { children: string }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold capitalize text-white/45">{children.replaceAll("_", " ")}</span>
}

function UnderusedList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/32">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.length > 0 ? values.map(value => <Pill key={value}>{value}</Pill>) : <span className="text-xs text-white/35">No obvious gap</span>}
      </div>
    </div>
  )
}

function PatternBars<T extends string>({ groups }: { groups: Array<VisualPatternGroup<T>> }) {
  return (
    <div className="mt-4 space-y-3">
      {groups.filter(group => group.count > 0).map(group => (
        <div key={group.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="capitalize text-white/58">{group.label.replaceAll("_", " ")}</span>
            <span className="text-white/35">{group.percentage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${group.percentage}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
