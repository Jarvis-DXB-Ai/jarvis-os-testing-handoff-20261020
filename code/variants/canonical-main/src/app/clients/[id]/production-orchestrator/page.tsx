"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import { buildLunchCampaignExecution, type CampaignExecution } from "@/lib/campaign-execution"
import { inspirationFolder, inspirationMetadata, inspirationReferenceFromAsset, isInspirationAsset, stringValue } from "@/lib/inspiration-references"
import { DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS, buildVisualIntelligence, classifyVisualReference, type VisualIntelligenceRef } from "@/lib/visual-intelligence"

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

type ProductionTab = "weekly" | "execution" | "batching" | "queue" | "assets" | "calendar" | "status" | "intelligence"
type ProductionPriority = "High" | "Medium" | "Low"
type ProductionStatus = "Planned" | "Awaiting Assets" | "Ready to Shoot" | "AI Generation Ready" | "Editing" | "Review" | "Approved"

type ProductionBlock = {
  id: string
  week: number
  campaign: string
  title: string
  emotionalGoal: string
  contentPillar: string
  productionType: string
  priority: ProductionPriority
  estimatedOutputs: string[]
  dependencies: string[]
  requiredAssets: string[]
  aiSystem: string
  lightingSystem: string
  compositionSystem: string
  moodboardInheritance: string[]
  status: ProductionStatus
  calendarWindow: string
}

type ProductionBatch = {
  id: string
  title: string
  campaign: string
  lightingSystem: string
  venueSetup: string
  modelSetup: string
  moodboardStyle: string[]
  emotionalTone: string
  outputs: string[]
  blockIds: string[]
}

type QueueItem = {
  id: string
  sourceCampaign: string
  task: string
  system: string
  priority: ProductionPriority
  requiredAssets: string[]
  productionStyle: string
  pinterestReferences: string[]
  emotionalGoal: string
  status: ProductionStatus
}

type AssetRequirementGroup = {
  label: string
  items: Array<{ name: string; count: number; campaigns: string[] }>
}

const TABS: Array<{ id: ProductionTab; label: string }> = [
  { id: "weekly", label: "Weekly Production Plan" },
  { id: "execution", label: "Campaign Execution" },
  { id: "batching", label: "Shoot Batching" },
  { id: "queue", label: "AI Generation Queue" },
  { id: "assets", label: "Asset Requirements" },
  { id: "calendar", label: "Production Calendar" },
  { id: "status", label: "Execution Status" },
  { id: "intelligence", label: "Production Intelligence" },
]

const PRODUCTION_TARGETS = [
  "Weekly roadmap",
  "Optimized shoot batches",
  "AI generation tasks",
  "Asset requirements",
  "Execution tracking",
]

const STATUS_COLORS: Record<ProductionStatus, string> = {
  "Planned": "border-white/10 bg-white/[0.045] text-white/55",
  "Awaiting Assets": "border-amber-300/25 bg-amber-300/10 text-amber-100",
  "Ready to Shoot": "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  "AI Generation Ready": "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  "Editing": "border-violet-300/25 bg-violet-300/10 text-violet-100",
  "Review": "border-blue-300/25 bg-blue-300/10 text-blue-100",
  "Approved": "border-emerald-300/30 bg-emerald-300/15 text-emerald-100",
}

const PRIORITY_COLORS: Record<ProductionPriority, string> = {
  High: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  Medium: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  Low: "border-white/10 bg-white/[0.045] text-white/50",
}

export default function ProductionOrchestratorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<ProductionTab>("weekly")
  const [blocks, setBlocks] = useState<ProductionBlock[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [brainInspirationAssets, setBrainInspirationAssets] = useState<InspirationAsset[]>([])
  const [campaignExecutionStarted, setCampaignExecutionStarted] = useState(false)

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
    async function loadInspirationReferences() {
      const { data } = await supabase
        .from("asset_uploads")
        .select("id,client_id,file_name,asset_category,file_path,uploaded_at,metadata")
        .eq("client_id", id)
        .eq("asset_category", "pinterest_inspiration")
        .neq("status", "archived")
        .order("uploaded_at", { ascending: false })
      if (alive) setBrainInspirationAssets(((data ?? []) as InspirationAsset[]).filter(isInspirationAsset))
    }
    loadInspirationReferences()
    return () => { alive = false }
  }, [id])

  const brainVisualRefs = useMemo(() => brainInspirationAssets.map(asset => {
    const ref = inspirationReferenceFromAsset(asset)
    const metadata = inspirationMetadata(asset)
    const classified = classifyVisualReference({
      id: ref.id,
      boardName: ref.folder,
      title: ref.title,
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
  }), [brainInspirationAssets])
  const visualReport = useMemo(() => buildVisualIntelligence(brainVisualRefs.length > 0 ? brainVisualRefs : DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS), [brainVisualRefs])
  const batches = useMemo(() => buildProductionBatches(blocks), [blocks])
  const queueItems = useMemo(() => buildQueueItems(blocks), [blocks])
  const assetGroups = useMemo(() => buildAssetRequirementGroups(blocks), [blocks])
  const calendarWeeks = useMemo(() => groupBy(blocks, block => `Week ${block.week}`), [blocks])
  const statusGroups = useMemo(() => groupBy(blocks, block => block.status), [blocks])
  const intelligence = useMemo(() => buildProductionIntelligence(blocks, batches, visualReport.feedInsights), [blocks, batches, visualReport.feedInsights])
  const inspirationFolders = useMemo(() => unique(brainInspirationAssets.map(asset => inspirationFolder(asset))), [brainInspirationAssets])
  const lunchExecution = useMemo(() => buildLunchCampaignExecution({ availableInspirationFolders: inspirationFolders }), [inspirationFolders])

  const generatePlan = () => {
    setBlocks(generateProductionBlocks())
    setGeneratedAt(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))
  }

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page">
            <div className="animate-pulse space-y-4">
              <div className="h-3 w-40 rounded bg-white/10" />
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
                <p className="jarvis-eyebrow">Production Orchestrator</p>
                <h1 className="jarvis-title mt-3">{client.name} Production Command Center</h1>
                <p className="jarvis-copy mt-5 max-w-3xl">
                  Convert strategy and monthly plans into weekly production roadmaps, optimized shoot batches,
                  AI generation tasks, asset requirements, and execution workflows.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5 xl:w-[360px]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Planning only</p>
                <p className="mt-3 text-lg font-semibold text-white">No publishing or scheduling</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  This workspace plans production. It does not post, schedule, send messages, activate automations, or run generation automatically.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {PRODUCTION_TARGETS.map(target => (
              <div key={target} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">System</p>
                <p className="mt-1 text-sm font-semibold text-white/75">{target}</p>
              </div>
            ))}
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
              {activeTab === "weekly" && <WeeklyProductionPlan blocks={blocks} onGeneratePlan={generatePlan} />}
              {activeTab === "execution" && <CampaignExecutionOperations execution={lunchExecution} started={campaignExecutionStarted} onExecute={() => setCampaignExecutionStarted(true)} />}
              {activeTab === "batching" && <ShootBatching blocks={blocks} batches={batches} />}
              {activeTab === "queue" && <AiGenerationQueue items={queueItems} />}
              {activeTab === "assets" && <AssetRequirements groups={assetGroups} />}
              {activeTab === "calendar" && <ProductionCalendar weeks={calendarWeeks} />}
              {activeTab === "status" && <ExecutionStatus blocks={blocks} statusGroups={statusGroups} />}
              {activeTab === "intelligence" && <ProductionIntelligence insights={intelligence} visualInsights={visualReport.feedInsights} />}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Plan Status</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{blocks.length > 0 ? `${blocks.length} production blocks` : "No weekly plan generated"}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Generate a weekly production system to populate shoot batching, AI generation tasks, requirements, calendar, and status tracking.
                </p>
                <button type="button" data-production-generate="primary" onClick={generatePlan} className="jarvis-button mt-5 w-full justify-center">
                  Generate production plan
                </button>
                {generatedAt && <p className="mt-3 text-xs text-white/35">Last generated: {generatedAt}</p>}
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Production Summary</p>
                <div className="mt-4 grid gap-3">
                  <SummaryRow label="Blocks" value={String(blocks.length)} />
                  <SummaryRow label="Batches" value={String(batches.length)} />
                  <SummaryRow label="AI queue items" value={String(queueItems.length)} />
                  <SummaryRow label="Asset groups" value={String(assetGroups.length)} />
                  <SummaryRow label="Brain inspiration folders" value={String(inspirationFolders.length)} />
                </div>
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Feed-Aware Orchestration</p>
                <p className="mt-3 text-sm leading-relaxed text-white/52">
                  Production inherits Visual Intelligence so the month can correct repetition, add contrast, and support balanced editorial pacing.
                </p>
                {inspirationFolders.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.06] p-3">
                    <p className="text-xs font-semibold text-fuchsia-100">Client Brain inspiration folders</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">{inspirationFolders.join(" / ")}</p>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  {visualReport.feedInsights.slice(0, 3).map(insight => (
                    <div key={insight.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <p className="text-sm font-semibold text-white">{insight.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">{insight.recommendation}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Integration Hooks</p>
                <div className="mt-4 space-y-2 text-sm text-white/50">
                  <p>Content Planning: monthly roadmap source.</p>
                  <p>AI Photography: still and product tasks.</p>
                  <p>AI Videography: reel, frame, and commercial tasks.</p>
                  <p>Social Operations: future pipeline and queue handoff.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function generateProductionBlocks(): ProductionBlock[] {
  return [
    makeBlock(1, "Business Lunch", "Weekday lunch lifestyle set", "comfort", "Lifestyle Hospitality", "Lifestyle photo set", "High", ["5 feed assets", "6 story frames", "1 carousel sequence"], ["business lunch dishes", "daytime interior table", "two polished lifestyle models"], "AI Photography", "warm_luxury", "social_table", ["DemoClientD - Lunch", "DemoClientD - Lifestyle"], "Ready to Shoot", "Tue W1 morning"),
    makeBlock(1, "Traffic Hours", "Cocktail ritual launch assets", "social energy", "Cocktail Rituals", "Cocktail product and story pack", "High", ["4 cocktail stills", "5 story frames", "1 reel storyboard"], ["cocktail studio shots", "bar surface", "traffic hours moodboard"], "AI Photography + AI Videography", "golden_hour", "hands_in_frame", ["DemoClientD - Cocktails", "DemoClientD - Service/BTS"], "AI Generation Ready", "Thu W1 golden hour"),
    makeBlock(1, "Dinner Experience", "Warm dinner atmosphere reset", "belonging", "Atmosphere & Architecture", "Venue atmosphere set", "Medium", ["3 atmosphere assets", "4 dinner stories"], ["interior venue refs", "warm reflections", "dinner table setup"], "AI Photography", "dark_cinematic", "wide_atmosphere", ["DemoClientD - Lifestyle"], "Planned", "Fri W1 late afternoon"),
    makeBlock(2, "Making Of", "Food craft process sequence", "craftsmanship", "Service & BTS", "BTS sequence", "High", ["1 making-of reel plan", "5 process frames", "1 final hero"], ["hero dish studio shot", "prep detail", "chef hands", "plating surface"], "AI Videography", "spotlight_editorial", "chef_detail", ["DemoClientD - Service/BTS", "DemoClientD - Food"], "Awaiting Assets", "Mon W2 prep window"),
    makeBlock(2, "Business Lunch", "Lunch dish proof set", "comfort", "Food Storytelling", "Product hero dishes", "High", ["3 product heroes", "2 menu-ready crops", "4 story frames"], ["business lunch dish studio shots", "table surface", "serviceware"], "AI Photography", "soft_daylight", "45_degree", ["DemoClientD - Breakfast", "DemoClientD - Lunch"], "AI Generation Ready", "Tue W2 midday"),
    makeBlock(2, "Cocktail Nights", "Dark luxury cocktail anchors", "aspiration", "Cocktail Rituals", "Product photography", "Medium", ["4 cocktail product assets", "2 macro garnish crops"], ["drink studio shots", "dark surface", "hard shadow references"], "AI Photography", "dark_cinematic", "editorial_centered", ["DemoClientD - Cocktails"], "Planned", "Wed W2 evening"),
    makeBlock(3, "Third Culture Stories", "Food carousel storytelling", "nostalgia", "Third Culture Stories", "Carousel sequence", "Medium", ["1 five-slide carousel", "3 macro details", "caption direction"], ["hero dish metadata", "ingredient notes", "dish macro references"], "Carousel generation", "high_contrast", "macro", ["DemoClientD - Food", "DemoClientD - Flyers"], "Planned", "Wed W3 production"),
    makeBlock(3, "Business Lunch", "Campaign graphic and reminder kit", "clarity", "Campaign Activations", "Graphic design kit", "Medium", ["2 feed graphics", "4 story reminders", "CTA variants"], ["business lunch offer copy", "brand typography", "approved food assets"], "Graphic Design", "spotlight_editorial", "negative_space", ["DemoClientD - Flyers"], "Review", "Tue W3 design block"),
    makeBlock(3, "Traffic Hours", "Social table drinks energy", "FOMO", "Lifestyle Hospitality", "Lifestyle reel frame set", "High", ["1 reel storyboard", "5 keyframe prompts", "6 story frames"], ["cocktails", "three bites", "social table", "venue mood"], "AI Videography", "golden_hour", "social_table", ["DemoClientD - Cocktails", "DemoClientD - Lifestyle"], "AI Generation Ready", "Thu W3 golden hour"),
    makeBlock(4, "Dinner Experience", "Monthly commercial storyboard", "aspiration", "Campaign Activations", "Commercial planning", "High", ["1 commercial storyboard", "5 keyframes", "shot list"], ["venue", "models", "food", "drinks", "service details"], "AI Videography", "warm_luxury", "wide_atmosphere", ["DemoClientD - Lifestyle", "DemoClientD - Service/BTS"], "Planned", "Mon W4 planning"),
    makeBlock(4, "Service Detail", "Premium service closeups", "trust", "Service & BTS", "Service still set", "Low", ["4 service details", "3 story frames"], ["napkin", "cutlery", "host detail", "table edge"], "AI Photography", "warm_luxury", "hands_in_frame", ["DemoClientD - Service/BTS"], "Ready to Shoot", "Thu W4 service window"),
    makeBlock(4, "Feed Balance", "Light reset and typography break", "curiosity", "Atmosphere & Architecture", "Editorial reset", "Medium", ["2 light reset posts", "1 typography break", "3 story frames"], ["daylight venue", "brand layout", "negative space references"], "AI Photography + Graphic Design", "soft_daylight", "negative_space", ["DemoClientD - Breakfast", "DemoClientD - Flyers"], "Planned", "Fri W4 design and stills"),
  ]
}

function makeBlock(
  week: number,
  campaign: string,
  title: string,
  emotionalGoal: string,
  contentPillar: string,
  productionType: string,
  priority: ProductionPriority,
  estimatedOutputs: string[],
  requiredAssets: string[],
  aiSystem: string,
  lightingSystem: string,
  compositionSystem: string,
  moodboardInheritance: string[],
  status: ProductionStatus,
  calendarWindow: string,
): ProductionBlock {
  return {
    id: `${campaign.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${week}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    week,
    campaign,
    title,
    emotionalGoal,
    contentPillar,
    productionType,
    priority,
    estimatedOutputs,
    dependencies: requiredAssets.slice(0, 3),
    requiredAssets,
    aiSystem,
    lightingSystem,
    compositionSystem,
    moodboardInheritance,
    status,
    calendarWindow,
  }
}

function buildProductionBatches(blocks: ProductionBlock[]): ProductionBatch[] {
  if (blocks.length === 0) return []

  const batchConfigs = [
    {
      id: "business-lunch-lifestyle",
      title: "Business Lunch Lifestyle",
      predicate: (block: ProductionBlock) => block.campaign === "Business Lunch" || block.title.toLowerCase().includes("lunch"),
      venueSetup: "Daytime interior table, polished lunch service, warm hospitality tone",
      modelSetup: "Two polished daytime lifestyle models when people are needed",
      emotionalTone: "comfort, utility, premium ease",
    },
    {
      id: "cocktail-rituals",
      title: "Cocktail Rituals",
      predicate: (block: ProductionBlock) => block.contentPillar === "Cocktail Rituals" || block.campaign === "Traffic Hours" || block.campaign === "Cocktail Nights",
      venueSetup: "Bar/table surface, darker luxury reflections, golden-hour transition",
      modelSetup: "Hands, bartender detail, or social table energy",
      emotionalTone: "social energy, aspiration, FOMO",
    },
    {
      id: "craft-and-third-culture",
      title: "Food Craft and Third Culture",
      predicate: (block: ProductionBlock) => block.contentPillar === "Food Storytelling" || block.contentPillar === "Third Culture Stories" || block.campaign === "Making Of",
      venueSetup: "Prep surface, plate hero area, dish detail station",
      modelSetup: "Chef hands or service detail, no extra lifestyle cast required",
      emotionalTone: "craftsmanship, nostalgia, curiosity",
    },
    {
      id: "atmosphere-and-campaign",
      title: "Atmosphere and Campaign Reset",
      predicate: (block: ProductionBlock) => block.contentPillar === "Atmosphere & Architecture" || block.contentPillar === "Campaign Activations" || block.campaign === "Feed Balance",
      venueSetup: "Wide room, brand layout, typography break, light reset",
      modelSetup: "Optional guests only where a campaign beat needs human warmth",
      emotionalTone: "aspiration, clarity, visual contrast",
    },
    {
      id: "service-detail",
      title: "Service Detail",
      predicate: (block: ProductionBlock) => block.contentPillar === "Service & BTS",
      venueSetup: "Table edge, serviceware, host detail, close hands",
      modelSetup: "Hands and service gestures only",
      emotionalTone: "trust, care, premium restraint",
    },
  ]

  return batchConfigs
    .map(config => {
      const matched = blocks.filter(config.predicate)
      const outputMap = new Map<string, number>()
      const moodboards = new Set<string>()
      const lighting = new Set<string>()
      matched.forEach(block => {
        block.estimatedOutputs.forEach(output => outputMap.set(output, (outputMap.get(output) ?? 0) + 1))
        block.moodboardInheritance.forEach(board => moodboards.add(board))
        lighting.add(block.lightingSystem)
      })
      return {
        id: config.id,
        title: config.title,
        campaign: unique(matched.map(block => block.campaign)).join(" + "),
        lightingSystem: unique(Array.from(lighting).map(label => label.replaceAll("_", " "))).join(" + "),
        venueSetup: config.venueSetup,
        modelSetup: config.modelSetup,
        moodboardStyle: Array.from(moodboards),
        emotionalTone: config.emotionalTone,
        outputs: Array.from(outputMap.entries()).map(([output, count]) => count > 1 ? `${output} x${count}` : output),
        blockIds: matched.map(block => block.id),
      } satisfies ProductionBatch
    })
    .filter(batch => batch.blockIds.length > 0)
}

function buildQueueItems(blocks: ProductionBlock[]): QueueItem[] {
  return blocks.map(block => ({
    id: `queue-${block.id}`,
    sourceCampaign: block.campaign,
    task: block.title,
    system: block.aiSystem,
    priority: block.priority,
    requiredAssets: block.requiredAssets,
    productionStyle: `${block.lightingSystem.replaceAll("_", " ")} / ${block.compositionSystem.replaceAll("_", " ")}`,
    pinterestReferences: block.moodboardInheritance,
    emotionalGoal: block.emotionalGoal,
    status: block.status,
  }))
}

function buildAssetRequirementGroups(blocks: ProductionBlock[]): AssetRequirementGroup[] {
  const buckets: Record<string, string[]> = {
    "Food and dishes": ["dish", "food", "lunch", "hero", "ingredient", "three bites"],
    "Drinks and cocktails": ["cocktail", "drink", "bar", "garnish"],
    "Venue setups": ["venue", "interior", "table", "surface", "room", "reflections"],
    "Models and service": ["model", "guest", "chef", "hands", "host", "service"],
    "Props and serviceware": ["napkin", "cutlery", "serviceware", "table edge"],
    "Design and copy": ["copy", "typography", "layout", "CTA", "brand"],
    "Moodboards": ["moodboard", "references", "hard shadow"],
  }

  const groups = Object.entries(buckets).map(([label, words]) => {
    const itemMap = new Map<string, { count: number; campaigns: Set<string> }>()
    blocks.forEach(block => {
      block.requiredAssets.forEach(asset => {
        const lower = asset.toLowerCase()
        if (!words.some(word => lower.includes(word.toLowerCase()))) return
        const current = itemMap.get(asset) ?? { count: 0, campaigns: new Set<string>() }
        current.count += 1
        current.campaigns.add(block.campaign)
        itemMap.set(asset, current)
      })
    })
    return {
      label,
      items: Array.from(itemMap.entries()).map(([name, value]) => ({ name, count: value.count, campaigns: Array.from(value.campaigns) })),
    }
  })

  return groups.filter(group => group.items.length > 0)
}

function buildProductionIntelligence(blocks: ProductionBlock[], batches: ProductionBatch[], visualInsights: Array<{ id: string; title: string; recommendation: string; severity: string }>) {
  if (blocks.length === 0) return []

  const highPriority = blocks.filter(block => block.priority === "High").length
  const videoTasks = blocks.filter(block => block.aiSystem.includes("Videography")).length
  const photoTasks = blocks.filter(block => block.aiSystem.includes("Photography")).length
  const awaitingAssets = blocks.filter(block => block.status === "Awaiting Assets").length
  const cocktailDensity = blocks.filter(block => block.contentPillar === "Cocktail Rituals").length
  const atmosphereBlocks = blocks.filter(block => block.contentPillar === "Atmosphere & Architecture").length

  return [
    {
      title: "Batching opportunity detected",
      detail: `${batches.length} efficient production batches can cover ${blocks.length} production blocks by grouping lighting, venue setup, campaign, and moodboard style.`,
      recommendation: "Produce by batch, not by individual post, to reduce setup changes.",
      severity: "priority",
    },
    {
      title: "Priority workload is concentrated",
      detail: `${highPriority} high-priority blocks need early attention across Business Lunch, Traffic Hours, Making Of, and the monthly commercial.`,
      recommendation: "Clear missing truth assets before opening paid generation or shoot execution.",
      severity: "watch",
    },
    {
      title: "AI system balance",
      detail: `${photoTasks} blocks use AI Photography and ${videoTasks} blocks use AI Videography or storyboard support.`,
      recommendation: "Run photo/product tasks before videography frames when shots depend on product truth assets.",
      severity: "info",
    },
    {
      title: awaitingAssets > 0 ? "Asset dependency blocker" : "Asset dependencies are manageable",
      detail: awaitingAssets > 0 ? `${awaitingAssets} block still waits for source assets before production can begin.` : "No major waiting state dominates the current production map.",
      recommendation: awaitingAssets > 0 ? "Resolve hero dish, chef hands, or prep references first." : "Move ready blocks into review or generation prep when Calvin approves.",
      severity: awaitingAssets > 0 ? "priority" : "info",
    },
    {
      title: cocktailDensity > atmosphereBlocks ? "Protect feed from cocktail density" : "Atmosphere support is present",
      detail: cocktailDensity > atmosphereBlocks ? "Cocktail assets are strong this month, so the feed needs atmosphere and social resets around them." : "Atmosphere blocks are present enough to support room identity.",
      recommendation: visualInsights[0]?.recommendation ?? "Use Visual Intelligence to alternate product, atmosphere, and social energy.",
      severity: "watch",
    },
  ]
}

function CampaignExecutionOperations({ execution, started, onExecute }: { execution: CampaignExecution; started: boolean; onExecute: () => void }) {
  return (
    <section className="space-y-5">
      <div className="jarvis-panel">
        <p className="jarvis-eyebrow">Campaign Execution Mode</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">Lunch execution pipeline</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50">
              Simulates strategy to feed choreography to production batches to AI task queue. No publishing, scheduling, DMs, automations, or paid generation.
            </p>
          </div>
          <button type="button" data-execute-campaign="lunch-production" onClick={onExecute} className="jarvis-button justify-center">
            {started ? "Refresh Lunch Execution" : "Execute Lunch Campaign"}
          </button>
        </div>
      </div>

      {!started ? (
        <EmptyState title="Lunch execution mode is ready" detail="Click Execute Lunch Campaign to populate production batches, task queues, story rhythm, feed simulation, editorial audit, and readiness scoring for the Lunch system." />
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="jarvis-panel">
              <p className="jarvis-eyebrow">Campaign Mood</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{execution.mood}</h3>
              <p className="mt-4 text-sm leading-relaxed text-white/52">{execution.positioning}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {execution.signatureSystems.map(system => (
                  <div key={system} className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.055] p-4">
                    <p className="text-sm font-semibold text-fuchsia-50">{system}</p>
                    <p className="mt-1 text-xs text-white/42">Signature system anchor</p>
                  </div>
                ))}
              </div>
            </section>
            <ReadinessCard execution={execution} />
          </div>

          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Feed Simulation</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Lunch adjacency and pacing</h3>
            <div className="mt-5 grid grid-cols-3 gap-2 md:grid-cols-5">
              {execution.feedSimulation.map(slot => (
                <div key={slot.id} className={`aspect-square rounded-2xl border border-white/10 p-3 ${slot.worldBuilding ? "bg-fuchsia-300/10" : slot.feedRole === "typography_break" ? "bg-white/10" : slot.feedRole === "product_focus" ? "bg-amber-300/10" : "bg-emerald-300/10"}`}>
                  <p className="text-[10px] font-semibold text-white/45">Post {slot.postNumber}</p>
                  <p className="mt-5 line-clamp-2 text-xs font-semibold text-white">{slot.title}</p>
                  <p className="mt-1 line-clamp-1 text-[10px] uppercase tracking-[0.12em] text-white/32">{slot.feedRole.replaceAll("_", " ")}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="jarvis-panel">
              <p className="jarvis-eyebrow">Production Batches</p>
              <div className="mt-4 space-y-4">
                {execution.productionBatches.map(batch => (
                  <article key={batch.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{batch.system}</p>
                        <h4 className="mt-2 text-base font-semibold text-white">{batch.title}</h4>
                      </div>
                      <Pill>{batch.mood}</Pill>
                    </div>
                    <ListBlock label="Outputs" items={batch.outputs} compact />
                    <ListBlock label="Inspiration inheritance" items={batch.inspirationFolders} compact />
                  </article>
                ))}
              </div>
            </section>

            <section className="jarvis-panel">
              <p className="jarvis-eyebrow">AI Production Tasks</p>
              <div className="mt-4 space-y-4">
                {execution.generationTasks.map(task => (
                  <article key={task.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{task.system}</p>
                        <h4 className="mt-2 text-base font-semibold text-white">{task.title}</h4>
                      </div>
                      <Pill>{task.status}</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/48">{task.promptDirection}</p>
                    <ListBlock label="Truth assets" items={task.requiredTruthAssets} compact />
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="jarvis-panel">
              <p className="jarvis-eyebrow">Story Structure</p>
              <div className="mt-4 space-y-3">
                {execution.storyStructure.map(beat => (
                  <div key={beat.window} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-white">{beat.window} · {beat.role}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/42">{beat.rhythm}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="jarvis-panel">
              <p className="jarvis-eyebrow">Editorial Balance Audit</p>
              <div className="mt-4 space-y-3">
                {execution.editorialAudit.map(item => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <Pill tone={item.status === "Strong" ? STATUS_COLORS.Approved : item.status === "Watch" ? PRIORITY_COLORS.Medium : PRIORITY_COLORS.High}>{item.status}</Pill>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/42">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}

function ReadinessCard({ execution }: { execution: CampaignExecution }) {
  const rows = [
    ["Strategy", execution.readiness.strategyCompleteness],
    ["Assets", execution.readiness.assetReadiness],
    ["Inspiration", execution.readiness.inspirationDepth],
    ["Production", execution.readiness.productionFeasibility],
    ["Feed", execution.readiness.feedBalance],
    ["Emotion", execution.readiness.emotionalDiversity],
  ] as const
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Execution Readiness Score</p>
      <p className="mt-2 text-5xl font-semibold text-white">{execution.readiness.overall}</p>
      <div className="mt-5 space-y-3">
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

function WeeklyProductionPlan({ blocks, onGeneratePlan }: { blocks: ProductionBlock[]; onGeneratePlan: () => void }) {
  const weeks = groupBy(blocks, block => `Week ${block.week}`)
  return (
    <section className="space-y-5">
      <div className="jarvis-panel">
        <p className="jarvis-eyebrow">Weekly Production Plan</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">Executable weekly roadmap</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
              Group monthly strategy into weekly production blocks by campaign, production type, priority, and dependencies.
            </p>
          </div>
          <button type="button" data-production-generate="weekly" onClick={onGeneratePlan} className="jarvis-button justify-center">
            Generate weekly plan
          </button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <EmptyState title="Generate a weekly production plan" detail="No production roadmap exists yet. Generate a plan to populate campaign blocks, dependencies, asset requirements, batches, and the AI queue." />
      ) : (
        <div className="space-y-5">
          {Object.entries(weeks).map(([week, weekBlocks]) => (
            <section key={week} className="jarvis-panel">
              <p className="jarvis-eyebrow">{week}</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {weekBlocks.map(block => <ProductionBlockCard key={block.id} block={block} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function ProductionBlockCard({ block }: { block: ProductionBlock }) {
  return (
    <article className="jarvis-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{block.campaign}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{block.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={PRIORITY_COLORS[block.priority]}>{block.priority}</Pill>
          <Pill tone={STATUS_COLORS[block.status]}>{block.status}</Pill>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-white/50 md:grid-cols-2">
        <InfoBlock label="Pillar" value={block.contentPillar} />
        <InfoBlock label="Production type" value={block.productionType} />
        <InfoBlock label="Emotional goal" value={block.emotionalGoal} />
        <InfoBlock label="Window" value={block.calendarWindow} />
      </div>
      <ListBlock label="Need" items={block.estimatedOutputs} />
      <ListBlock label="Dependencies" items={block.dependencies} />
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">Pinterest / visual inheritance</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {block.moodboardInheritance.map(board => <Pill key={board}>{board}</Pill>)}
        </div>
      </div>
    </article>
  )
}

function ShootBatching({ blocks, batches }: { blocks: ProductionBlock[]; batches: ProductionBatch[] }) {
  if (blocks.length === 0) {
    return <EmptyState title="No shoot batches yet" detail="Generate a production plan first. Jarvis will group work by lighting, venue setup, models, campaign, product category, and moodboard style." />
  }

  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Shoot Batching" title="Creative production optimization" detail="Batch outputs by setup so fewer shoots and generation sessions produce more usable campaign assets." />
      <div className="grid gap-5">
        {batches.map(batch => (
          <article key={batch.id} className="jarvis-card p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="jarvis-eyebrow">{batch.campaign}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{batch.title}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">{batch.venueSetup}</p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm font-semibold text-emerald-100">
                {batch.blockIds.length} linked blocks
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <InfoBlock label="Lighting system" value={batch.lightingSystem || "Mixed"} />
              <InfoBlock label="Model setup" value={batch.modelSetup} />
              <InfoBlock label="Emotional tone" value={batch.emotionalTone} />
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ListBlock label="Outputs" items={batch.outputs} />
              <ListBlock label="Moodboard inheritance" items={batch.moodboardStyle} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function AiGenerationQueue({ items }: { items: QueueItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="No AI generation tasks yet" detail="Generate a production plan to create planned tasks for AI Photography, AI Videography, Graphic Design, carousels, story packs, and reel storyboards. Nothing runs automatically." />
  }

  const groups = groupBy(items, item => item.system)
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="AI Generation Queue" title="Planned production tasks only" detail="Queue items describe what should be produced and what assets are required. Generation stays manual and approval-led." />
      {Object.entries(groups).map(([system, systemItems]) => (
        <section key={system} className="jarvis-panel">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="jarvis-eyebrow">{system}</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{systemItems.length} planned tasks</h3>
            </div>
            <Pill>No automatic generation</Pill>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {systemItems.map(item => (
              <article key={item.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{item.sourceCampaign}</p>
                    <h4 className="mt-2 text-base font-semibold text-white">{item.task}</h4>
                  </div>
                  <Pill tone={PRIORITY_COLORS[item.priority]}>{item.priority}</Pill>
                </div>
                <p className="mt-3 text-sm text-white/48">{item.productionStyle}</p>
                <ListBlock label="Required assets" items={item.requiredAssets.slice(0, 4)} compact />
                <ListBlock label="Pinterest refs" items={item.pinterestReferences} compact />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Pill tone={STATUS_COLORS[item.status]}>{item.status}</Pill>
                  <button type="button" disabled className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-white/28">
                    Manual handoff later
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  )
}

function AssetRequirements({ groups }: { groups: AssetRequirementGroup[] }) {
  if (groups.length === 0) {
    return <EmptyState title="No asset requirements yet" detail="Generate a production plan to see required dishes, cocktails, venue setups, models, props, story assets, carousels, and moodboards." />
  }

  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Asset Requirements" title="Pre-production dependency map" detail="Understand what must exist before shooting, AI generation, design, storyboard, or review can happen." />
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(group => (
          <article key={group.label} className="jarvis-card p-6">
            <p className="jarvis-eyebrow">{group.items.length} requirements</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{group.label}</h3>
            <div className="mt-5 space-y-3">
              {group.items.map(item => (
                <div key={item.name} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/45">x{item.count}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/35">{item.campaigns.join(" / ")}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProductionCalendar({ weeks }: { weeks: Record<string, ProductionBlock[]> }) {
  if (Object.keys(weeks).length === 0) {
    return <EmptyState title="No internal production calendar yet" detail="Generate a production plan to organize shoot days, AI generation sessions, design blocks, review sessions, and internal deadlines." />
  }

  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Production Calendar" title="Internal production scheduling" detail="This is not the publishing calendar. It organizes shoot days, generation sessions, design blocks, and reviews." />
      <div className="grid gap-4 xl:grid-cols-4">
        {Object.entries(weeks).map(([week, weekBlocks]) => (
          <article key={week} className="jarvis-card p-5">
            <p className="jarvis-eyebrow">{week}</p>
            <div className="mt-4 space-y-3">
              {weekBlocks.map(block => (
                <div key={block.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold text-emerald-100">{block.calendarWindow}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{block.title}</p>
                  <p className="mt-1 text-xs text-white/40">{block.productionType}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ExecutionStatus({ blocks, statusGroups }: { blocks: ProductionBlock[]; statusGroups: Record<string, ProductionBlock[]> }) {
  if (blocks.length === 0) {
    return <EmptyState title="No execution status yet" detail="Generate a production plan to track planned, awaiting assets, ready, AI generation ready, editing, review, and approved states." />
  }

  const statuses: ProductionStatus[] = ["Planned", "Awaiting Assets", "Ready to Shoot", "AI Generation Ready", "Editing", "Review", "Approved"]
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Execution Status" title="Production progress tracking" detail="Track readiness and bottlenecks before anything moves into active production or social operations." />
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        {statuses.map(status => (
          <div key={status} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{status}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{statusGroups[status]?.length ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map(block => (
          <article key={block.id} className="jarvis-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{block.campaign}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{block.title}</h3>
              </div>
              <Pill tone={STATUS_COLORS[block.status]}>{block.status}</Pill>
            </div>
            <p className="mt-3 text-sm text-white/45">{block.productionType} / {block.aiSystem}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProductionIntelligence({ insights, visualInsights }: { insights: Array<{ title: string; detail: string; recommendation: string; severity: string }>; visualInsights: Array<{ id: string; title: string; recommendation: string }> }) {
  if (insights.length === 0) {
    return <EmptyState title="No production intelligence yet" detail="Generate a production plan to surface bottlenecks, overproduction risk, missing asset types, batching opportunities, and feed-aware production recommendations." />
  }

  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Production Intelligence" title="Operational optimization layer" detail="Detect bottlenecks, overproduction, missing asset types, inefficient setups, and visual repetition before production begins." />
      <div className="grid gap-4 lg:grid-cols-2">
        {insights.map(insight => (
          <article key={insight.title} className="jarvis-card p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold text-white">{insight.title}</h3>
              <Pill tone={insight.severity === "priority" ? PRIORITY_COLORS.High : insight.severity === "watch" ? PRIORITY_COLORS.Medium : PRIORITY_COLORS.Low}>{insight.severity}</Pill>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/52">{insight.detail}</p>
            <p className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3 text-sm leading-relaxed text-emerald-100/80">{insight.recommendation}</p>
          </article>
        ))}
      </div>
      <section className="jarvis-panel">
        <p className="jarvis-eyebrow">Feed-aware production guardrails</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {visualInsights.slice(0, 3).map(insight => (
            <div key={insight.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">{insight.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/45">{insight.recommendation}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function SectionHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50">{detail}</p>
    </section>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-black/20 px-6 py-12 text-center">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/42">{detail}</p>
    </div>
  )
}

function Pill({ children, tone }: { children: string; tone?: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone ?? "border-white/10 bg-white/[0.045] text-white/45"}`}>{children}</span>
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-white/72">{value}</p>
    </div>
  )
}

function ListBlock({ label, items, compact = false }: { label: string; items: string[]; compact?: boolean }) {
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map(item => <Pill key={item}>{item}</Pill>)}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-sm text-white/45">{label}</span>
      <span className="text-lg font-semibold text-white">{value}</span>
    </div>
  )
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}
