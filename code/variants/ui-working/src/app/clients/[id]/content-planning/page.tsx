"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import { inspirationFolder, inspirationMetadata, inspirationReferenceFromAsset, isInspirationAsset, stringValue } from "@/lib/inspiration-references"
import {
  SIGNATURE_SYSTEMS,
  WEEKLY_EMOTIONAL_ARCS,
  buildEditorialChoreographyInsights,
  buildFeedEnergyMeter,
  buildFeedSimulation,
  buildVisualMemoryAnchors,
  signatureForItem,
  type FeedEnergyMeter,
  type FeedSimulationSlot,
  type EditorialChoreographyInsight,
  type VisualMemoryAnchor,
} from "@/lib/editorial-feed-intelligence"
import { buildLunchCampaignExecution, type CampaignExecution } from "@/lib/campaign-execution"
import { buildSocialIntelligence } from "@/lib/social-intelligence"
import { DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS, buildVisualIntelligence, classifyVisualReference, visualPromptGuidance, type VisualIntelligenceRef } from "@/lib/visual-intelligence"
import type { SocialPostPerformance, SocialReadOnlyResponse } from "@/lib/zernio"

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

type PlanningTab = "monthly" | "execution" | "campaigns" | "production" | "stories" | "feed" | "insights" | "memory"

type PlannedContentItem = {
  id: string
  week: number
  day: string
  title: string
  objective: string
  pillar: string
  campaign: string
  emotionalGoal: string
  format: string
  productionSystem: string
  assetRequirements: string[]
  storyIntegration: string
  captionDirection: string
  reasoning: string
}

type ProductionIntensity = "light" | "standard" | "heavy"

type PlanningControls = {
  monthlyFocus: string[]
  monthlyGoals: string[]
  monthlyEnergy: string[]
  productionIntensity: ProductionIntensity
  strategicNotes: string
  refinements: string[]
}

const TABS: Array<{ id: PlanningTab; label: string }> = [
  { id: "monthly", label: "Monthly Planner" },
  { id: "execution", label: "Campaign Execution" },
  { id: "campaigns", label: "Campaign Planning" },
  { id: "production", label: "Production Planning" },
  { id: "stories", label: "Story Planning" },
  { id: "feed", label: "Feed Simulation" },
  { id: "insights", label: "Strategy Insights" },
  { id: "memory", label: "Planning Memory" },
]

const PLANNING_TARGETS = [
  "20 feed posts/month",
  "1 reel/week",
  "1 commercial/month",
  "2-5 story frames/day",
  "Facebook mirrors Instagram",
]

const PILLAR_COLORS: Record<string, string> = {
  "Lifestyle Hospitality": "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  "Food Storytelling": "border-amber-300/25 bg-amber-300/10 text-amber-100",
  "Cocktail Rituals": "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  "Service & BTS": "border-white/15 bg-white/[0.06] text-white/70",
  "Campaign Activations": "border-violet-300/25 bg-violet-300/10 text-violet-100",
  "Third Culture Stories": "border-rose-300/25 bg-rose-300/10 text-rose-100",
  "Atmosphere & Architecture": "border-blue-300/25 bg-blue-300/10 text-blue-100",
}

const STORY_WINDOWS = [
  {
    title: "Morning",
    purpose: "Quiet atmosphere, breakfast cues, menu reminders, and soft brand warmth.",
    rhythm: "1-2 frames when breakfast, lunch, or venue mood is relevant.",
  },
  {
    title: "Lunch",
    purpose: "Business Lunch utility, table readiness, reservation nudges, and dish proof.",
    rhythm: "Use Tue-Thu as priority windows when live analytics supports weekday behavior.",
  },
  {
    title: "Golden Hour",
    purpose: "Traffic Hours, cocktail anticipation, after-work reset, and social momentum.",
    rhythm: "Keep it alive and current, not sales-heavy.",
  },
  {
    title: "Dinner",
    purpose: "Warm room energy, hero dishes, guests, cocktails, and emotional hospitality.",
    rhythm: "Use atmosphere plus table detail before direct CTA.",
  },
  {
    title: "Late Evening",
    purpose: "Social proof, reposts, final seating energy, and next-day memory.",
    rhythm: "Use lightly so the account feels alive without becoming noisy.",
  },
]

const MEMORY_AREAS = [
  "Monthly learnings",
  "Recurring successful concepts",
  "Failed ideas",
  "Visual observations",
  "Audience behavior",
  "Seasonal notes",
  "Campaign outcomes",
]

const MONTHLY_FOCUS_OPTIONS = [
  "Business Lunch push",
  "Traffic Hours push",
  "Dinner Experience",
  "Breakfast launch",
  "Michelin positioning",
  "Third Culture storytelling",
  "Cocktail focus",
  "Atmosphere/lifestyle focus",
]

const MONTHLY_GOAL_OPTIONS = [
  "reach",
  "saves",
  "bookings",
  "awareness",
  "profile visits",
  "emotional branding",
  "launch support",
]

const MONTHLY_ENERGY_OPTIONS = [
  "luxurious",
  "social",
  "warm",
  "cinematic",
  "energetic",
  "minimal",
  "nostalgic",
]

const REFINEMENT_CHIPS = [
  "Add More Lifestyle",
  "Increase Reels",
  "More Storytelling",
  "More Product Focus",
  "More Atmosphere",
  "Reduce Graphics",
  "Push Activations Harder",
]

const DEFAULT_CONTROLS: PlanningControls = {
  monthlyFocus: ["Business Lunch push", "Traffic Hours push", "Dinner Experience", "Third Culture storytelling"],
  monthlyGoals: ["bookings", "awareness", "emotional branding"],
  monthlyEnergy: ["warm", "cinematic", "social"],
  productionIntensity: "standard",
  strategicNotes: "",
  refinements: [],
}

function generateRoadmap(controls: PlanningControls): PlannedContentItem[] {
  const schedule = [
    ["Mon W1", "The DemoClientD Table", "emotional connection", "Lifestyle Hospitality", "Dinner Experience", "belonging", "lifestyle post", "AI Photography", ["warm interior table", "models", "dinner dishes"], "Dinner atmosphere story sequence", "emotional"],
    ["Tue W1", "The DIFC Reset", "booking", "Campaign Activations", "Business Lunch", "comfort", "editorial carousel", "Graphic Design", ["business lunch dishes", "menu details", "venue table"], "Lunch reminder plus elegant brand-world cue", "editorial CTA"],
    ["Wed W1", "Third Culture Plate", "save/share", "Third Culture Stories", "Dinner Experience", "curiosity", "product photography", "AI Photography", ["hero dish", "studio shot", "dish metadata"], "Ingredient/detail frames", "descriptive"],
    ["Thu W1", "Traffic Hours first round", "campaign push", "Cocktail Rituals", "Traffic Hours", "social energy", "reel", "AI Videography", ["cocktail studio shots", "three bites", "bar/table"], "Golden hour countdown", "CTA-focused"],
    ["Fri W1", "Room before dinner", "world-building", "Atmosphere & Architecture", "Dinner Experience", "aspiration", "lifestyle post", "AI Photography", ["venue interior", "warm reflections", "table setup"], "Tonight at DemoClientD sequence", "luxurious minimal"],
    ["Mon W2", "Made in-house detail", "save/share", "Service & BTS", "Making Of", "trust", "reel", "AI Videography", ["prep detail", "plating sequence", "hands"], "BTS story with final reveal", "descriptive"],
    ["Tue W2", "Business Lunch dish proof", "booking", "Food Storytelling", "Business Lunch", "comfort", "product photography", "AI Photography", ["lunch dish", "clean table", "serviceware"], "Lunch availability reminder", "CTA-focused"],
    ["Wed W2", "Cocktail ritual still", "awareness", "Cocktail Rituals", "Cocktail Nights", "aspiration", "product photography", "AI Photography", ["cocktail truth ref", "glass detail", "lighting inspiration"], "Pour/garnish story detail", "luxurious minimal"],
    ["Thu W2", "Comfort without borders", "world-building", "Third Culture Stories", "Dinner Experience", "nostalgia", "carousel", "AI Photography", ["dish macro", "venue mood", "caption story"], "Question sticker or save prompt", "nostalgic"],
    ["Sat W2", "Dinner social proof", "awareness", "Lifestyle Hospitality", "Dinner Experience", "social energy", "lifestyle post", "AI Photography", ["models", "cocktails", "shared table"], "Guest/repost opportunity", "emotional"],
    ["Mon W3", "Atmosphere grid anchor", "awareness", "Atmosphere & Architecture", "Venue Mood", "aspiration", "lifestyle post", "AI Photography", ["key venue zone", "mirrors", "lighting"], "Venue mood story", "luxurious minimal"],
    ["Tue W3", "Business Lunch editorial note", "reminder", "Campaign Activations", "Business Lunch", "clarity", "editorial graphic", "Graphic Design", ["offer copy", "menu CTA", "brand layout"], "Morning and lunch reminder", "collectible luxury graphic"],
    ["Wed W3", "Food craft carousel", "save/share", "Food Storytelling", "Making Of", "curiosity", "carousel", "AI Photography", ["macro dish", "sauce", "garnish", "vessel"], "BTS detail frames", "descriptive"],
    ["Thu W3", "Traffic Hours reel", "campaign push", "Cocktail Rituals", "Traffic Hours", "FOMO", "reel", "AI Videography", ["cocktails", "three bites", "table energy"], "Countdown plus live energy", "CTA-focused"],
    ["Sun W3", "Quiet cultural memory", "world-building", "Third Culture Stories", "Dinner Experience", "nostalgia", "lifestyle post", "AI Photography", ["hero dish", "warm table", "caption story"], "Soft dinner reminder", "nostalgic"],
    ["Mon W4", "Monthly commercial", "awareness", "Campaign Activations", "Dinner Experience", "aspiration", "commercial", "AI Videography", ["venue", "models", "food", "drinks", "service"], "Trailer frames across stories", "luxurious minimal"],
    ["Tue W4", "Lunch regular ritual", "booking", "Lifestyle Hospitality", "Business Lunch", "comfort", "lifestyle post", "AI Photography", ["lunch table", "professional guests", "dish"], "Lunch decision reminder", "CTA-focused"],
    ["Wed W4", "Cocktail hero product", "save/share", "Cocktail Rituals", "Cocktail Nights", "curiosity", "product photography", "AI Photography", ["drink studio shot", "surface", "lighting inspiration"], "Garnish/pour sequence", "descriptive"],
    ["Thu W4", "Service detail", "emotional connection", "Service & BTS", "Dinner Experience", "trust", "lifestyle post", "AI Photography", ["napkin", "cutlery", "host detail", "table"], "Service care story", "emotional"],
    ["Fri W4", "End-of-month editorial pause", "reminder", "Campaign Activations", "Traffic Hours", "FOMO", "editorial graphic", "Graphic Design", ["best assets", "CTA", "campaign layout"], "Reminder story pack", "collectible luxury graphic"],
  ] as const

  return schedule.map((row, index) => ({
    id: `plan-${index + 1}`,
    week: Math.floor(index / 5) + 1,
    day: row[0],
    title: row[1],
    objective: row[2],
    pillar: row[3],
    campaign: row[4],
    emotionalGoal: row[5],
    format: row[6],
    productionSystem: row[7],
    assetRequirements: [...row[8]],
    storyIntegration: row[9],
    captionDirection: row[10],
    reasoning: planReasonFor(row[3], row[4], row[6], controls),
  })).map(item => applyPlanningControls(item, controls))
}

function planReasonFor(pillar: string, campaign: string, format: string, controls: PlanningControls) {
  const focusMatch = controls.monthlyFocus.find(focus => campaign.toLowerCase().includes(focus.split(" ")[0].toLowerCase()))
  const goalLine = controls.monthlyGoals.length > 0 ? `Primary goals: ${controls.monthlyGoals.join(", ")}.` : "Balances awareness, bookings, and emotional brand memory."
  const energyLine = controls.monthlyEnergy.length > 0 ? `Energy: ${controls.monthlyEnergy.join(", ")}.` : "Energy stays warm, premium, and strategic."
  const focusLine = focusMatch
    ? `${campaign} receives intentional weight because ${focusMatch} is selected this month.`
    : `${pillar} protects the month from becoming repetitive or overly product-only.`
  const formatLine = `${format} is used here to support ${pillar.toLowerCase()} without overloading one production system.`
  const choreographyLine = "Visual choreography keeps this from becoming a repetitive feed beat by balancing product, social, atmosphere, and campaign roles."
  return `${focusLine} ${goalLine} ${energyLine} ${formatLine} ${choreographyLine}`
}

function applyPlanningControls(item: PlannedContentItem, controls: PlanningControls): PlannedContentItem {
  let next = { ...item }
  const has = (value: string) => controls.monthlyFocus.includes(value) || controls.refinements.includes(value)

  if (has("Add More Lifestyle") && (item.pillar === "Food Storytelling" || item.pillar === "Atmosphere & Architecture") && item.week % 2 === 0) {
    next = {
      ...next,
      title: `${item.title} with people`,
      pillar: "Lifestyle Hospitality",
      format: item.format === "product photography" ? "lifestyle post" : item.format,
      assetRequirements: Array.from(new Set([...item.assetRequirements, "natural guest moment"])),
      reasoning: `${item.reasoning} Refined toward more lifestyle presence because the current priority asks for warmer social proof.`,
    }
  }

  if (has("Increase Reels") && item.week <= 3 && item.format !== "commercial" && ["Cocktail Rituals", "Service & BTS", "Third Culture Stories"].includes(item.pillar)) {
    next = {
      ...next,
      format: "reel",
      productionSystem: "AI Videography",
      reasoning: `${next.reasoning} Converted to reel because the refinement asks for more motion-led reach and storytelling.`,
    }
  }

  if (has("More Product Focus") && item.pillar === "Lifestyle Hospitality" && item.week >= 3) {
    next = {
      ...next,
      pillar: item.campaign.includes("Cocktail") || item.campaign.includes("Traffic") ? "Cocktail Rituals" : "Food Storytelling",
      format: "product photography",
      productionSystem: "AI Photography",
      reasoning: `${next.reasoning} Shifted toward product truth to support a more food/drink-led monthly balance.`,
    }
  }

  if (has("More Atmosphere") && item.pillar === "Campaign Activations" && item.week !== 4) {
    next = {
      ...next,
      pillar: "Atmosphere & Architecture",
      format: "lifestyle post",
      productionSystem: "AI Photography",
      assetRequirements: Array.from(new Set([...item.assetRequirements, "venue atmosphere"])),
      reasoning: `${next.reasoning} Shifted toward venue atmosphere so the feed keeps a premium sense of place.`,
    }
  }

  if (has("Reduce Graphics") && item.format.includes("graphic")) {
    next = {
      ...next,
      format: "carousel",
      productionSystem: "AI Photography",
      reasoning: `${next.reasoning} Graphic output reduced and converted to a more visual carousel.`,
    }
  }

  if (has("Push Activations Harder") && item.campaign === "Dinner Experience" && item.week % 2 === 1) {
    next = {
      ...next,
      objective: "campaign push",
      pillar: "Campaign Activations",
      reasoning: `${next.reasoning} Increased activation pressure while keeping DemoClientD broader than a purely commercial feed.`,
    }
  }

  if (controls.monthlyFocus.includes("Business Lunch push") && item.day.includes("Tue") && item.campaign !== "Business Lunch") {
    next = {
      ...next,
      campaign: "Business Lunch",
      objective: "booking",
      emotionalGoal: "comfort",
      reasoning: `${next.reasoning} Tuesday is tuned toward Business Lunch because weekday nearby office traffic is a revenue opportunity without narrowing the whole brand to DIFC professionals.`,
    }
  }

  if (controls.monthlyFocus.includes("Cocktail focus") && item.day.includes("Wed") && item.pillar !== "Cocktail Rituals") {
    next = {
      ...next,
      pillar: "Cocktail Rituals",
      campaign: "Cocktail Nights",
      assetRequirements: Array.from(new Set([...item.assetRequirements, "cocktail truth ref"])),
      reasoning: `${next.reasoning} Added cocktail emphasis for the month while preserving food and hospitality balance.`,
    }
  }

  if (controls.monthlyFocus.includes("Breakfast launch") && item.week === 1 && item.day.includes("Mon")) {
    next = {
      ...next,
      title: "Breakfast launch atmosphere",
      campaign: "Breakfast",
      emotionalGoal: "comfort",
      assetRequirements: ["breakfast studio shots", "morning table", "coffee", "soft venue light"],
      reasoning: `${next.reasoning} Reframed as breakfast launch support because that focus is selected for this month.`,
    }
  }

  if (controls.productionIntensity === "light" && next.format === "reel") {
    next = {
      ...next,
      format: "lifestyle post",
      productionSystem: "AI Photography",
      reasoning: `${next.reasoning} Production intensity is light, so this avoids adding another video deliverable.`,
    }
  }

  if (controls.productionIntensity === "heavy" && next.format === "lifestyle post" && next.week % 2 === 0) {
    next = {
      ...next,
      format: "reel",
      productionSystem: "AI Videography",
      reasoning: `${next.reasoning} Heavy production intensity allows this moment to become a reel instead of a static post.`,
    }
  }

  if (controls.strategicNotes.trim()) {
    next.reasoning = `${next.reasoning} Strategic note considered: ${controls.strategicNotes.trim()}`
  }

  return next
}

function buildPlanningPrompt(clientName: string, controls: PlanningControls, intelligence: ReturnType<typeof buildSocialIntelligence>, visualGuidance: string, inspirationFolderSummary: string) {
  const insights = intelligence.insights.length > 0
    ? intelligence.insights.slice(0, 4).map(insight => `- ${insight.title}: ${insight.detail}`).join("\n")
    : `- ${intelligence.readiness.message}`
  return `[BRAND_POSITIONING]
- Client: ${clientName}
- Positioning: Third Culture Hospitality.
- Keep DemoClientD globally welcoming, emotionally warm, culturally layered, luxurious but comfortable.
- DIFC professionals are a major audience, not the whole brand identity.

[EMOTIONAL_IDENTITY]
- Core emotions: comfort, familiarity, nostalgia, warmth, sophistication, belonging, curiosity.
- Monthly energy: ${controls.monthlyEnergy.join(", ") || "warm, cinematic, social"}.

[CONTENT_PILLARS]
- Lifestyle Hospitality
- Food Storytelling
- Cocktail Rituals
- Service & BTS
- Campaign Activations
- Third Culture Stories
- Atmosphere & Architecture
- Prevent repetitive sequencing such as food, food, food, food.

[SIGNATURE_SYSTEMS]
${SIGNATURE_SYSTEMS.map(system => `- ${system.title}: ${system.emotionalTerritory}; motifs: ${system.motifs.slice(0, 3).join(", ")}.`).join("\n")}

[EDITORIAL_WORLD_BUILDING]
- Include posts that deepen the DemoClientD universe even when they do not carry a hard CTA.
- Use atmosphere, service rituals, cultural memory, quiet table moments, luxury stillness, and social warmth.
- The feed should feel like a living editorial world, not a marketing scheduler.

[WEEKLY_EMOTIONAL_ARC]
${WEEKLY_EMOTIONAL_ARCS.map(arc => `- ${arc.weekday}: ${arc.emotion}; ${arc.editorialRole}.`).join("\n")}

[GRAPHICS_PHILOSOPHY]
- Business Lunch and campaign graphics should feel collectible, art-directed, cinematic, luxurious, and minimal.
- Do not create restaurant promo-flyer energy unless a tactical flyer is explicitly requested.

[CREATIVE_WILDCARDS]
- Add occasional calm surprises: unusual crop, quiet room detail, cultural memory, graphic pause, or service stillness.
- Wildcards must stay within DemoClientD's visual world and must not break campaign clarity.

[CAMPAIGN_PRIORITIES]
${controls.monthlyFocus.map(focus => `- ${focus}`).join("\n") || "- Balanced campaign mix across lunch, dinner, cocktails, atmosphere, food, and storytelling."}

[CURRENT_ACTIVATIONS]
- Business Lunch
- Traffic Hours
- Dinner Experience
- Breakfast if selected
- Making Of / BTS when production intensity allows

[SOCIAL_STRATEGY]
- 20 feed posts/month.
- 1 reel/week baseline.
- 1 commercial/month.
- 2-5 story frames/day.
- Facebook mirrors Instagram.
- Production intensity: ${controls.productionIntensity}.

[PERFORMANCE_LEARNINGS]
${insights}

${visualGuidance}

[CLIENT_BRAIN_INSPIRATION_REFERENCES]
${inspirationFolderSummary || "- No Client Brain inspiration folders uploaded yet. Use default DemoClientD visual DNA and avoid copying external references."}

[MONTHLY_OBJECTIVES]
${controls.monthlyGoals.map(goal => `- ${goal}`).join("\n") || "- awareness\n- bookings\n- emotional branding"}

[STRATEGIC_NOTES]
${controls.strategicNotes.trim() || "- No additional Calvin notes yet."}
${controls.refinements.length > 0 ? `\n[REFINEMENTS]\n${controls.refinements.map(note => `- ${note}`).join("\n")}` : ""}

[OUTPUT_REQUIREMENTS]
- Generate a 30-day content roadmap.
- Each planned item must include content objective, content pillar, campaign system, emotional goal, format, production system, asset requirements, story integration, caption direction, and strategic reasoning.
- Explain why the plan exists and why each major section is weighted.
- Keep the plan strategic, balanced, editorial, production-aware, and emotionally cinematic.
- Include world-building content and signature-system anchors, not only campaign utility.
- Preserve Third Culture Hospitality: nostalgia, comfort, familiarity, warmth, global identity, and cultural layering.
- Planning only. Do not post, schedule, message, or activate automations.`
}

function estimatePlanBalance(controls: PlanningControls) {
  const balance: Record<string, number> = {
    "Lifestyle Hospitality": 25,
    "Food Storytelling": 18,
    "Cocktail Rituals": 15,
    "Campaign Activations": 17,
    "Service & BTS": 10,
    "Third Culture Stories": 10,
    "Atmosphere & Architecture": 5,
  }
  const add = (pillar: string, amount: number) => { balance[pillar] = Math.max(5, (balance[pillar] ?? 0) + amount) }

  if (controls.monthlyFocus.includes("Business Lunch push")) add("Campaign Activations", 6)
  if (controls.monthlyFocus.includes("Traffic Hours push")) add("Cocktail Rituals", 6)
  if (controls.monthlyFocus.includes("Dinner Experience")) add("Lifestyle Hospitality", 5)
  if (controls.monthlyFocus.includes("Breakfast launch")) add("Food Storytelling", 5)
  if (controls.monthlyFocus.includes("Third Culture storytelling")) add("Third Culture Stories", 6)
  if (controls.monthlyFocus.includes("Cocktail focus")) add("Cocktail Rituals", 8)
  if (controls.monthlyFocus.includes("Atmosphere/lifestyle focus")) {
    add("Lifestyle Hospitality", 5)
    add("Atmosphere & Architecture", 5)
  }
  if (controls.refinements.includes("Add More Lifestyle")) add("Lifestyle Hospitality", 10)
  if (controls.refinements.includes("More Product Focus")) add("Food Storytelling", 8)
  if (controls.refinements.includes("More Atmosphere")) add("Atmosphere & Architecture", 8)
  if (controls.refinements.includes("Push Activations Harder")) add("Campaign Activations", 8)

  const total = Object.values(balance).reduce((sum, value) => sum + value, 0)
  return Object.entries(balance).map(([pillar, value]) => ({ pillar, value: Math.round((value / total) * 100) }))
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFor(item)
    acc[key] = [...(acc[key] ?? []), item]
    return acc
  }, {})
}

function percent(part: number, total: number) {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}

export default function ContentPlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<PlanningTab>("monthly")
  const [planItems, setPlanItems] = useState<PlannedContentItem[]>([])
  const [controls, setControls] = useState<PlanningControls>(DEFAULT_CONTROLS)
  const [planningPrompt, setPlanningPrompt] = useState("")
  const [analytics, setAnalytics] = useState<SocialPostPerformance[]>([])
  const [brainInspirationAssets, setBrainInspirationAssets] = useState<InspirationAsset[]>([])
  const [campaignExecutionStarted, setCampaignExecutionStarted] = useState(false)
  const [analyticsError, setAnalyticsError] = useState("")
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: clientError } = await supabase.from("clients").select("id,name,industry,status").eq("id", id).single()
    if (clientError) setError(clientError.message)
    else setClient(data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

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

  useEffect(() => {
    let alive = true
    async function loadAnalytics() {
      setAnalyticsLoading(true)
      try {
        const response = await fetch("/api/social/analytics?range=all")
        const payload = await response.json() as SocialReadOnlyResponse<SocialPostPerformance>
        if (!alive) return
        setAnalytics(Array.isArray(payload.data) ? payload.data : [])
        setAnalyticsError(payload.error ?? "")
      } catch (err) {
        if (!alive) return
        setAnalytics([])
        setAnalyticsError(err instanceof Error ? err.message : "Analytics could not be loaded.")
      } finally {
        if (alive) setAnalyticsLoading(false)
      }
    }
    loadAnalytics()
    return () => { alive = false }
  }, [])

  const intelligence = useMemo(() => buildSocialIntelligence(analytics), [analytics])
  const pillarGroups = useMemo(() => groupBy(planItems, item => item.pillar), [planItems])
  const campaignGroups = useMemo(() => groupBy(planItems, item => item.campaign), [planItems])
  const productionGroups = useMemo(() => groupBy(planItems, item => item.productionSystem), [planItems])
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
  const visualGuidance = useMemo(() => visualPromptGuidance(visualReport), [visualReport])
  const inspirationFolderSummary = useMemo(() => {
    if (brainInspirationAssets.length === 0) return ""
    const counts = brainInspirationAssets.reduce<Record<string, number>>((acc, asset) => {
      const folder = inspirationFolder(asset)
      acc[folder] = (acc[folder] ?? 0) + 1
      return acc
    }, {})
    return Object.entries(counts).map(([folder, count]) => `- ${folder}: ${count} inspiration ref${count === 1 ? "" : "s"} available for planning patterns.`).join("\n")
  }, [brainInspirationAssets])
  const inspirationFolders = useMemo(() => Array.from(new Set(brainInspirationAssets.map(asset => inspirationFolder(asset)))), [brainInspirationAssets])
  const lunchExecution = useMemo(() => buildLunchCampaignExecution({ availableInspirationFolders: inspirationFolders }), [inspirationFolders])
  const planBalance = useMemo(() => estimatePlanBalance(controls), [controls])
  const feedSimulation = useMemo(() => buildFeedSimulation(planItems, 30), [planItems])
  const feedEnergy = useMemo(() => buildFeedEnergyMeter(feedSimulation), [feedSimulation])
  const editorialInsights = useMemo(() => buildEditorialChoreographyInsights(feedSimulation), [feedSimulation])
  const visualMemoryAnchors = useMemo(() => buildVisualMemoryAnchors(feedSimulation), [feedSimulation])
  const generatePrompt = useCallback(() => {
    setPlanningPrompt(buildPlanningPrompt(client?.name ?? "DemoClientD Dubai", controls, intelligence, visualGuidance, inspirationFolderSummary))
  }, [client?.name, controls, intelligence, inspirationFolderSummary, visualGuidance])
  const generatePlan = useCallback(() => {
    const prompt = planningPrompt.trim() || buildPlanningPrompt(client?.name ?? "DemoClientD Dubai", controls, intelligence, visualGuidance, inspirationFolderSummary)
    setPlanningPrompt(prompt)
    setPlanItems(generateRoadmap(controls))
  }, [client?.name, controls, inspirationFolderSummary, intelligence, planningPrompt, visualGuidance])
  const updateControls = useCallback((next: Partial<PlanningControls>) => {
    setControls(current => ({ ...current, ...next }))
  }, [])
  const toggleControlItem = useCallback((key: "monthlyFocus" | "monthlyGoals" | "monthlyEnergy" | "refinements", value: string) => {
    setControls(current => {
      const currentValues = current[key]
      const nextValues = currentValues.includes(value)
        ? currentValues.filter(item => item !== value)
        : [...currentValues, value]
      return { ...current, [key]: nextValues }
    })
  }, [])

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page">
            <div className="animate-pulse space-y-4">
              <div className="h-3 w-32 rounded bg-white/10" />
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
                <p className="jarvis-eyebrow">Content Planning Engine</p>
                <h1 className="jarvis-title mt-3">{client.name} Monthly Content Planning</h1>
                <p className="jarvis-copy mt-5 max-w-3xl">
                  Strategic monthly planning, production orchestration, campaign execution roadmap,
                  feed architecture, story rhythm, and analytics-informed planning.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5 xl:w-[360px]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Planning only</p>
                <p className="mt-3 text-lg font-semibold text-white">No publishing actions</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  This engine creates strategic plans only. It does not post, schedule, send messages, or activate automations.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {PLANNING_TARGETS.map(target => (
              <div key={target} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">Target</p>
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
              {activeTab === "monthly" && (
                <MonthlyPlanner
                  items={planItems}
                  controls={controls}
                  planBalance={planBalance}
                  planningPrompt={planningPrompt}
                  onPromptChange={setPlanningPrompt}
                  onGeneratePrompt={generatePrompt}
                  onGeneratePlan={generatePlan}
                  onUpdateControls={updateControls}
                  onToggleControlItem={toggleControlItem}
                />
              )}
              {activeTab === "execution" && <CampaignExecutionMode execution={lunchExecution} started={campaignExecutionStarted} onExecute={() => setCampaignExecutionStarted(true)} />}
              {activeTab === "campaigns" && <CampaignPlanning groups={campaignGroups} hasPlan={planItems.length > 0} />}
              {activeTab === "production" && <ProductionPlanning groups={productionGroups} hasPlan={planItems.length > 0} />}
              {activeTab === "stories" && <StoryPlanning hasPlan={planItems.length > 0} />}
              {activeTab === "feed" && <FeedArchitecture items={planItems} pillarGroups={pillarGroups} simulation={feedSimulation} energy={feedEnergy} insights={editorialInsights} anchors={visualMemoryAnchors} />}
              {activeTab === "insights" && <StrategyInsights analyticsLoading={analyticsLoading} analyticsError={analyticsError} recordCount={analytics.length} intelligence={intelligence} />}
              {activeTab === "memory" && <PlanningMemory />}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Plan Status</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{planItems.length > 0 ? `${planItems.length} planned feed items` : "No monthly roadmap yet"}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Generate a 30-day roadmap to populate campaign plans, production batches, feed architecture, and story rhythm.
                </p>
                <button type="button" data-planning-generate="sidebar" onClick={generatePlan} className="jarvis-button mt-5 w-full justify-center">
                  Generate 30-day plan
                </button>
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Balance</p>
                {planItems.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {Object.entries(pillarGroups).map(([pillar, items]) => (
                      <div key={pillar}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-white/58">{pillar}</span>
                          <span className="text-white/35">{percent(items.length, planItems.length)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${percent(items.length, planItems.length)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {planBalance.map(item => (
                      <div key={item.pillar}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-white/58">{item.pillar}</span>
                          <span className="text-white/35">{item.value}% est.</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-white/35" style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Integration Hooks</p>
                <div className="mt-4 space-y-2 text-sm text-white/50">
                  <p>AI Photography: planned still assets.</p>
                  <p>AI Videography: reels, commercials, storyboards.</p>
                  <p>Graphic Design: campaign graphics and flyers.</p>
                  <p>Social Operations: future calendar, queue, and pipeline handoff.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function EmptyPlanningState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-black/20 px-6 py-12 text-center">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/42">{detail}</p>
    </div>
  )
}

function Pill({ children, tone }: { children: string; tone?: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone ?? "border-white/10 bg-white/[0.045] text-white/45"}`}>{children}</span>
}

function MonthlyPlanner({
  items,
  controls,
  planBalance,
  planningPrompt,
  onPromptChange,
  onGeneratePrompt,
  onGeneratePlan,
  onUpdateControls,
  onToggleControlItem,
}: {
  items: PlannedContentItem[]
  controls: PlanningControls
  planBalance: Array<{ pillar: string; value: number }>
  planningPrompt: string
  onPromptChange: (value: string) => void
  onGeneratePrompt: () => void
  onGeneratePlan: () => void
  onUpdateControls: (next: Partial<PlanningControls>) => void
  onToggleControlItem: (key: "monthlyFocus" | "monthlyGoals" | "monthlyEnergy" | "refinements", value: string) => void
}) {
  return (
    <section className="space-y-5">
      <div className="jarvis-panel">
        <p className="jarvis-eyebrow">Monthly Planner</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">30-day strategic roadmap</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50">
              Builds a balanced monthly plan across lifestyle, food, drinks, atmosphere, campaigns, BTS,
              social proof, graphics, reels, and commercial content.
            </p>
          </div>
          <button type="button" data-planning-generate="primary" onClick={onGeneratePlan} className="jarvis-button w-full justify-center lg:w-auto">
            {items.length > 0 ? "Regenerate 30-day plan" : "Generate 30-day plan"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="jarvis-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="jarvis-eyebrow">Generate 30-Day Plan Console</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Planning Prompt / Strategy Controls</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/50">
                Inspect and edit the strategic logic before roadmap generation. The final plan remains local and planning-only.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={onGeneratePrompt} className="jarvis-muted-button justify-center">
                Generate Planning Prompt
              </button>
              <button type="button" onClick={onGeneratePlan} className="jarvis-button justify-center">
                Generate Plan
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <ControlGroup title="Monthly Focus" options={MONTHLY_FOCUS_OPTIONS} selected={controls.monthlyFocus} onToggle={value => onToggleControlItem("monthlyFocus", value)} />
            <ControlGroup title="Monthly Goals" options={MONTHLY_GOAL_OPTIONS} selected={controls.monthlyGoals} onToggle={value => onToggleControlItem("monthlyGoals", value)} />
            <ControlGroup title="Monthly Energy" options={MONTHLY_ENERGY_OPTIONS} selected={controls.monthlyEnergy} onToggle={value => onToggleControlItem("monthlyEnergy", value)} />
            <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Production Intensity</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["light", "standard", "heavy"] as ProductionIntensity[]).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onUpdateControls({ productionIntensity: option })}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition ${controls.productionIntensity === option ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/[0.035] text-white/45 hover:text-white"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/38">Controls the weight of reels, carousels, lifestyle shoots, graphics, and BTS requirements.</p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Strategic Notes</span>
            <textarea
              value={controls.strategicNotes}
              onChange={event => onUpdateControls({ strategicNotes: event.target.value })}
              rows={4}
              placeholder="Example: Push Business Lunch heavily this month. Focus more on nostalgia and comfort. Reduce graphics. Need more lifestyle content."
              className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40"
            />
          </label>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Editable Planning Prompt</p>
              <span className="text-xs text-white/32">{planningPrompt.length} chars</span>
            </div>
            <textarea
              value={planningPrompt}
              onChange={event => onPromptChange(event.target.value)}
              rows={18}
              placeholder="Click Generate Planning Prompt to assemble Brand Strategy, pillars, campaign priorities, social cadence, performance learnings, monthly objectives, and output requirements."
              className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-[#030605] px-4 py-3 font-mono text-xs leading-relaxed text-white/72 outline-none placeholder:text-white/25 focus:border-emerald-300/40"
            />
          </div>
        </section>

        <aside className="space-y-5">
          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Plan Balance Preview</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Estimated before generation</h3>
            <div className="mt-4 space-y-3">
              {planBalance.map(item => (
                <div key={item.pillar}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-white/58">{item.pillar}</span>
                    <span className="text-white/35">{item.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Roadmap Preview</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{items.length > 0 ? `${items.length} planned items` : "No plan generated yet"}</h3>
            {items.length > 0 ? (
              <div className="mt-4 space-y-2">
                {items.slice(0, 8).map(item => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/32">{item.format} · {item.pillar}</p>
                  </div>
                ))}
                {items.length > 8 && <p className="text-xs text-white/35">+ {items.length - 8} more planned items</p>}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-white/42">Generated roadmap cards will appear here after Calvin reviews or edits the prompt.</p>
            )}
          </section>

          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Refinement Loop</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {REFINEMENT_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onToggleControlItem("refinements", chip)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${controls.refinements.includes(chip) ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/45 hover:text-white"}`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <button type="button" onClick={onGeneratePlan} className="jarvis-button mt-4 w-full justify-center">
              Regenerate Plan
            </button>
          </section>
        </aside>
      </div>

      {items.length === 0 ? (
        <EmptyPlanningState title="Generate a 30-day content roadmap" detail="No planned content is shown until the planning engine creates a local roadmap. This avoids fake calendar items and keeps the workspace trustworthy." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map(item => <PlannedContentCard key={item.id} item={item} />)}
        </div>
      )}
    </section>
  )
}

function ControlGroup({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected.includes(option) ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/[0.035] text-white/45 hover:text-white"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function CampaignExecutionMode({ execution, started, onExecute }: { execution: CampaignExecution; started: boolean; onExecute: () => void }) {
  return (
    <section className="space-y-5">
      <div className="jarvis-panel">
        <p className="jarvis-eyebrow">Campaign Execution Mode</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">Execute {execution.campaignName} campaign system</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50">
              Strategy to feed simulation to production requirements to asset queue. Simulation only: no publishing, scheduling, DMs, automations, or paid generation.
            </p>
          </div>
          <button type="button" data-execute-campaign="lunch-content" onClick={onExecute} className="jarvis-button justify-center">
            {started ? "Refresh Lunch Execution" : "Execute Lunch Campaign"}
          </button>
        </div>
      </div>

      {!started ? (
        <div className="rounded-[1.5rem] border border-dashed border-emerald-300/20 bg-emerald-300/[0.045] px-6 py-12 text-center">
          <p className="text-xl font-semibold text-white">Lunch execution simulation is ready</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
            Click Execute Lunch Campaign to generate the full operational pipeline: campaign mood, feed rhythm, stories, production batches, task queue, editorial audit, and readiness score.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="jarvis-panel">
              <p className="jarvis-eyebrow">Campaign Mood</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{execution.mood}</h3>
              <p className="mt-4 text-sm leading-relaxed text-white/52">{execution.positioning}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {execution.signatureSystems.map(system => <Pill key={system} tone="border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100">{system}</Pill>)}
              </div>
            </section>
            <CampaignReadinessPanel execution={execution} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <FeedSimulationGrid slots={execution.feedSimulation} />
            <aside className="space-y-5">
              <FeedEnergyMeterView energy={execution.feedEnergy} />
              <ChoreographyInsights insights={execution.choreographyInsights} />
            </aside>
          </div>

          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Story Structure</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Lunch story rhythm</h3>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {execution.storyStructure.map(beat => (
                <article key={beat.window} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{beat.window}</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">{beat.role}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-white/48">{beat.rhythm}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {beat.examples.map(example => <Pill key={example}>{example}</Pill>)}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Production Batches</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {execution.productionBatches.map(batch => (
                <article key={batch.id} className="jarvis-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{batch.system}</p>
                      <h4 className="mt-2 text-lg font-semibold text-white">{batch.title}</h4>
                    </div>
                    <Pill>{batch.lighting}</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/50">{batch.venueSetup}</p>
                  <ListBlock label="Outputs" items={batch.outputs} />
                  <ListBlock label="Inspiration inheritance" items={batch.inspirationFolders} />
                  <ListBlock label="Visual patterns" items={batch.visualPatterns} compact />
                </article>
              ))}
            </div>
          </section>

          <section className="jarvis-panel">
            <p className="jarvis-eyebrow">Executable AI Production Tasks</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {execution.generationTasks.map(task => (
                <article key={task.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{task.system}</p>
                      <h4 className="mt-2 text-base font-semibold text-white">{task.title}</h4>
                    </div>
                    <Pill>{task.status}</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/50">{task.purpose}</p>
                  <p className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-3 text-xs leading-relaxed text-emerald-50/75">{task.promptDirection}</p>
                  <ListBlock label="Truth assets" items={task.requiredTruthAssets} compact />
                  <ListBlock label="Inspiration" items={task.inspirationInheritance} compact />
                </article>
              ))}
            </div>
          </section>

          <EditorialAuditPanel execution={execution} />
        </>
      )}
    </section>
  )
}

function CampaignReadinessPanel({ execution }: { execution: CampaignExecution }) {
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
      <p className="jarvis-eyebrow">Execution Readiness</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <h3 className="text-5xl font-semibold text-white">{execution.readiness.overall}</h3>
        <span className="mb-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">simulation score</span>
      </div>
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

function EditorialAuditPanel({ execution }: { execution: CampaignExecution }) {
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Editorial Balance Audit</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">Creative director QA before production</h3>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {execution.editorialAudit.map(item => (
          <article key={item.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${item.status === "Strong" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : item.status === "Watch" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-rose-300/25 bg-rose-300/10 text-rose-100"}`}>{item.status}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function PlannedContentCard({ item }: { item: PlannedContentItem }) {
  const signature = signatureForItem(item)
  const isWorldBuilding = item.objective.includes("world") || item.objective.includes("emotional") || ["Lifestyle Hospitality", "Third Culture Stories", "Atmosphere & Architecture", "Service & BTS"].includes(item.pillar)
  return (
    <article className="jarvis-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{item.day} · Week {item.week}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{item.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Pill tone={PILLAR_COLORS[item.pillar]}>{item.pillar}</Pill>
          {isWorldBuilding && <Pill tone="border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100">world-building</Pill>}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PlanField label="Content Objective" value={item.objective} />
        <PlanField label="Campaign System" value={item.campaign} />
        <PlanField label="Emotional Goal" value={item.emotionalGoal} />
        <PlanField label="Recommended Format" value={item.format} />
        <PlanField label="Production System" value={item.productionSystem} />
        <PlanField label="Caption Direction" value={item.captionDirection} />
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Asset Requirements</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.assetRequirements.map(asset => <Pill key={asset}>{asset}</Pill>)}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-white/45"><span className="text-white/70">Story integration:</span> {item.storyIntegration}</p>
      </div>
      <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/55">Why this plan exists</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-50/72">{item.reasoning}</p>
      </div>
      <div className="mt-4 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.045] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-100/55">Signature System</p>
        <p className="mt-2 text-sm font-semibold text-white">{signature.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/45">{signature.emotionalTerritory}</p>
      </div>
    </article>
  )
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-white/75">{value}</p>
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

function CampaignPlanning({ groups, hasPlan }: { groups: Record<string, PlannedContentItem[]>; hasPlan: boolean }) {
  if (!hasPlan) return <EmptyPlanningState title="No campaign plan generated yet" detail="Generate the monthly roadmap first. Campaign systems will be grouped here by Business Lunch, Traffic Hours, Dinner Experience, Making Of, and related activations." />
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Campaign Planning" title="Reusable campaign execution systems" detail="Each campaign group receives a roadmap, production requirements, story plan, CTA structure, and future hooks for Pinterest, photography, videography, and design." />
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(groups).map(([campaign, items]) => (
          <article key={campaign} className="jarvis-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="jarvis-eyebrow">{items.length} planned items</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{campaign}</h3>
              </div>
              <Pill>{items.some(item => item.format === "reel") ? "reel-ready" : "feed-ready"}</Pill>
            </div>
            <div className="mt-5 space-y-3">
              {items.map(item => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-white/42">{item.format} · {item.objective} · {item.captionDirection}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProductionPlanning({ groups, hasPlan }: { groups: Record<string, PlannedContentItem[]>; hasPlan: boolean }) {
  if (!hasPlan) return <EmptyPlanningState title="No production batches generated yet" detail="Generate the monthly roadmap first. Production plans will group work by AI Photography, AI Videography, and Graphic Design." />
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Production Planning" title="Batch production by setup, campaign, and production system" detail="This turns strategy into efficient production blocks so the team can create multiple assets from the same venue, lighting, model, or product setup." />
      <div className="grid gap-4">
        {Object.entries(groups).map(([system, items]) => {
          const assets = Array.from(new Set(items.flatMap(item => item.assetRequirements)))
          return (
            <article key={system} className="jarvis-card p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="jarvis-eyebrow">{items.length} planned outputs</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{system}</h3>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
                  {assets.slice(0, 10).map(asset => <Pill key={asset}>{asset}</Pill>)}
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {items.map(item => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-white/42">{item.campaign} · {item.format} · {item.emotionalGoal}</p>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function StoryPlanning({ hasPlan }: { hasPlan: boolean }) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Story Planning" title="Daily story rhythm without spam" detail="Stories should feel alive, current, emotional, and social. The cadence supports reminders, FOMO, daily atmosphere, reposts, live energy, and campaign pushes." />
      {!hasPlan && <EmptyPlanningState title="No monthly roadmap connected yet" detail="The story framework is ready. Generate a roadmap to attach daily story themes to the monthly plan." />}
      <div className="grid gap-4 lg:grid-cols-2">
        {STORY_WINDOWS.map(window => (
          <article key={window.title} className="jarvis-card p-6">
            <p className="jarvis-eyebrow">Story Window</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{window.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/52">{window.purpose}</p>
            <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-white/45">{window.rhythm}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function FeedArchitecture({
  items,
  pillarGroups,
  simulation,
  energy,
  insights,
  anchors,
}: {
  items: PlannedContentItem[]
  pillarGroups: Record<string, PlannedContentItem[]>
  simulation: FeedSimulationSlot[]
  energy: FeedEnergyMeter
  insights: EditorialChoreographyInsight[]
  anchors: VisualMemoryAnchor[]
}) {
  if (items.length === 0) return <EmptyPlanningState title="No feed architecture yet" detail="Generate a roadmap to visualize content distribution, visual pacing, pillar balance, campaign rhythm, and post sequence." />
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Feed Simulation Mode" title="Simulate the next 30 feed posts as an editorial world" detail="This view turns the roadmap into a living Instagram-grid rhythm: contrast, density, world-building, signature systems, typography breaks, cultural feel, and emotional pacing." />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <FeedSimulationGrid slots={simulation} />
        <aside className="space-y-5">
          <FeedEnergyMeterView energy={energy} />
          <ChoreographyInsights insights={insights} />
        </aside>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SignatureSystemsPanel />
        <WeeklyArcsPanel />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="jarvis-panel">
          <p className="jarvis-eyebrow">Visual Memory Anchors</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Recurring motifs that build recognition</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

        <section className="jarvis-panel">
          <p className="jarvis-eyebrow">Cultural Feel Layer</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Third Culture Hospitality signal</h3>
          <p className="mt-3 text-sm leading-relaxed text-white/52">
            The simulation watches whether nostalgia, comfort, familiarity, warmth, global identity, and emotional hospitality
            are present often enough to keep DemoClientD broader than a tactical restaurant feed.
          </p>
          <div className="mt-5 rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-rose-50">Cultural feel</p>
              <p className="text-2xl font-semibold text-white">{energy.culturalFeel}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-rose-300" style={{ width: `${energy.culturalFeel}%` }} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/45">
              Use Third Culture Plate, Comfort Without Borders, service warmth, and quiet world-building when this drops below a healthy range.
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(pillarGroups).map(([pillar, group]) => (
          <div key={pillar} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-semibold text-white">{pillar}</p>
            <p className="mt-1 text-xs text-white/40">{group.length} posts · {percent(group.length, items.length)}% of feed</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function slotGradientClass(slot: FeedSimulationSlot) {
  if (slot.feedRole === "typography_break") return "from-zinc-100/18 via-black to-black"
  if (slot.lighting === "soft_daylight") return "from-amber-100/22 via-emerald-200/10 to-black"
  if (slot.lighting === "golden_hour") return "from-amber-300/28 via-orange-400/12 to-black"
  if (slot.lighting === "dark_cinematic") return "from-blue-950/70 via-black to-emerald-950/35"
  if (slot.composition === "macro") return "from-amber-900/35 via-black to-rose-950/25"
  if (slot.composition === "wide_atmosphere") return "from-cyan-950/30 via-black to-blue-950/35"
  return "from-emerald-400/18 via-black to-fuchsia-950/20"
}

function FeedSimulationGrid({ slots }: { slots: FeedSimulationSlot[] }) {
  return (
    <section className="jarvis-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="jarvis-eyebrow">30-Post Feed Simulation</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Visual rhythm before image generation</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/48">
            Placeholder thumbnails simulate lighting, density, composition, emotion, and feed role. No paid generation is used.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill>world-building</Pill>
          <Pill>signature systems</Pill>
          <Pill>creative wildcards</Pill>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-5">
        {slots.map(slot => (
          <article key={slot.id} className={`group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${slotGradientClass(slot)} p-3`}>
            <div className="absolute inset-0 opacity-60">
              <div className={`absolute ${slot.composition === "macro" ? "left-4 top-4 h-16 w-16" : "left-5 top-5 h-10 w-20"} rounded-full border border-white/20 bg-white/10 blur-[1px]`} />
              {slot.composition === "social_table" && <div className="absolute bottom-5 left-5 right-5 h-8 rounded-full border border-emerald-200/20 bg-emerald-100/10" />}
              {slot.feedRole === "typography_break" && <div className="absolute bottom-5 left-4 right-4 space-y-1.5">{[1, 2, 3].map(line => <div key={line} className="h-1.5 rounded-full bg-white/35" />)}</div>}
              {slot.composition === "wide_atmosphere" && <div className="absolute inset-x-4 top-5 h-14 rounded-t-full border border-cyan-100/15 bg-cyan-100/5" />}
            </div>
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-white/75">{slot.postNumber}</span>
                {slot.creativeWildcard && <span className="rounded-full border border-fuchsia-200/20 bg-fuchsia-300/15 px-1.5 py-0.5 text-[9px] font-semibold text-fuchsia-100">wild</span>}
              </div>
              <div>
                <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{slot.title}</p>
                <p className="mt-1 line-clamp-1 text-[9px] uppercase tracking-[0.12em] text-white/42">{slot.visualLabel}</p>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-2 bottom-2 hidden rounded-xl border border-white/10 bg-black/80 p-2 text-[10px] leading-relaxed text-white/60 shadow-2xl group-hover:block">
              {slot.signatureSystem} · {slot.weeklyArc.emotion}
              {slot.worldBuilding ? " · world-building" : ""}
              {slot.simulatedContinuation ? " · continuation" : ""}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FeedEnergyMeterView({ energy }: { energy: FeedEnergyMeter }) {
  const rows = [
    ["Darkness / lightness", energy.darkness],
    ["Product density", energy.productDensity],
    ["Social warmth", energy.socialWarmth],
    ["Typography usage", energy.typographyUsage],
    ["Campaign pressure", energy.campaignPressure],
    ["Emotional energy", energy.emotionalEnergy],
    ["Cultural feel", energy.culturalFeel],
  ] as const
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Feed Energy Meter</p>
      <h3 className="mt-2 text-xl font-semibold text-white">Editorial balance monitor</h3>
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

function ChoreographyInsights({ insights }: { insights: EditorialChoreographyInsight[] }) {
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Choreography Intelligence</p>
      <div className="mt-4 space-y-3">
        {insights.map(insight => (
          <div key={insight.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{insight.title}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${insight.severity === "priority" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : insight.severity === "watch" ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.045] text-white/45"}`}>{insight.severity}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">{insight.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SignatureSystemsPanel() {
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Signature Systems</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">Recurring brand memory anchors</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {SIGNATURE_SYSTEMS.map(system => (
          <article key={system.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-semibold text-white">{system.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{system.emotionalTerritory}</p>
            <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/30">{system.compositions.map(item => item.replaceAll("_", " ")).join(" / ")}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function WeeklyArcsPanel() {
  return (
    <section className="jarvis-panel">
      <p className="jarvis-eyebrow">Weekly Emotional Arcs</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">The week moves like a hospitality film</h3>
      <div className="mt-5 space-y-3">
        {WEEKLY_EMOTIONAL_ARCS.map(arc => (
          <div key={arc.weekday} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-start gap-4">
              <span className="w-10 shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-center text-xs font-semibold text-emerald-100">{arc.weekday}</span>
              <div>
                <p className="text-sm font-semibold text-white">{arc.emotion}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/45">{arc.editorialRole}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/30">{arc.pacing}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StrategyInsights({
  analyticsLoading,
  analyticsError,
  recordCount,
  intelligence,
}: {
  analyticsLoading: boolean
  analyticsError: string
  recordCount: number
  intelligence: ReturnType<typeof buildSocialIntelligence>
}) {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Strategy Insights" title="Read-only analytics converted into planning recommendations" detail="This section only uses real Zernio analytics returned by the existing read-only integration. If data is insufficient, Jarvis does not invent conclusions." />
      <div className="grid gap-4 md:grid-cols-3">
        <InsightMetric label="Analytics records" value={analyticsLoading ? "Loading" : String(recordCount)} />
        <InsightMetric label="Readiness" value={analyticsLoading ? "Loading" : intelligence.readiness.level} />
        <InsightMetric label="Timeline" value={intelligence.timeline.days ? `${intelligence.timeline.days} days` : "Unavailable"} />
      </div>
      {analyticsError && <div className="rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100">{analyticsError}</div>}
      {analyticsLoading ? (
        <EmptyPlanningState title="Loading live analytics" detail="Strategy recommendations will appear once the read-only analytics request returns." />
      ) : intelligence.insights.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {intelligence.insights.map(insight => (
            <article key={insight.id} className="jarvis-card p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-semibold text-white">{insight.title}</h3>
                <Pill>{insight.confidence}</Pill>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/52">{insight.detail}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/32">{insight.section} · {insight.metric}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyPlanningState title={intelligence.readiness.message} detail="More returned metrics or history are needed before reliable planning recommendations can be generated from analytics." />
      )}
    </section>
  )
}

function PlanningMemory() {
  return (
    <section className="space-y-5">
      <SectionHeader eyebrow="Planning Memory" title="Long-term monthly learning layer" detail="This is the future place for monthly learnings, recurring successful concepts, failed ideas, visual observations, audience behavior, seasonal notes, and campaign outcomes." />
      <div className="grid gap-4 md:grid-cols-2">
        {MEMORY_AREAS.map(area => (
          <article key={area} className="jarvis-card p-6">
            <h3 className="text-xl font-semibold text-white">{area}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              No saved planning memory yet. Future approved observations and analytics-backed learnings will appear here.
            </p>
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

function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{label}</p>
      <p className="mt-2 text-xl font-semibold capitalize text-white">{value}</p>
    </div>
  )
}
