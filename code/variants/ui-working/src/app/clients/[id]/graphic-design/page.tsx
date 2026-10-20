"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { SIGNATURE_SYSTEMS } from "@/lib/editorial-feed-intelligence"
import { buildFigmaDesignSpec, type FigmaDesignSpec, type FigmaLayerSpec, type FigmaTypographySpec } from "@/lib/figma-design-schema"
import { inspirationFolder, inspirationMetadata, inspirationReferenceFromAsset, isInspirationAsset, stringValue } from "@/lib/inspiration-references"
import { buildVisualIntelligence, classifyVisualReference, DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS, type VisualIntelligenceRef, type VisualIntelligenceReport } from "@/lib/visual-intelligence"
import { supabase } from "@/lib/supabase"

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

type GraphicTab =
  | "studio"
  | "templates"
  | "campaigns"
  | "stories"
  | "carousels"
  | "covers"
  | "memory"
  | "figma"

type DesignControls = {
  campaign: string
  objective: string
  feedRole: string
  format: string
  assets: string
  inspiration: string
  copyDirection: string
}

type FigmaHandoffMode = "mcp" | "plugin"

type TemplateSystem = {
  title: string
  feedRole: string
  useCases: string[]
  layout: string
  typography: string
  imagePlacement: string
  logoPlacement: string
  ctaPlacement: string
  colorTexture: string
  safeZones: string
}

type CampaignDesignPack = {
  campaign: string
  mood: string
  pack: string[]
  designRoles: string[]
  sourceSystems: string[]
}

type StorySequence = {
  title: string
  purpose: string
  frames: Array<{ label: string; role: string; visual: string; copy: string; cta: string }>
}

type CarouselStructure = {
  title: string
  purpose: string
  slides: Array<{ label: string; imageDirection: string; copyStructure: string; pacing: string; cta: string }>
}

type ReelCoverSystem = {
  title: string
  role: string
  layout: string
  typography: string
  gridBehavior: string
}

type StagedMemoryReference = {
  id: string
  fileName: string
  category: string
  designType: string
  feedRole: string
  notes: string
}

const TABS: Array<{ id: GraphicTab; label: string }> = [
  { id: "studio", label: "Design Studio" },
  { id: "templates", label: "Template Systems" },
  { id: "campaigns", label: "Campaign Graphics" },
  { id: "stories", label: "Story Graphics" },
  { id: "carousels", label: "Carousel Builder" },
  { id: "covers", label: "Reel Covers" },
  { id: "memory", label: "Design Memory" },
  { id: "figma", label: "Figma Handoff" },
]

const DESIGN_OBJECTIVES = [
  "Instagram Story",
  "Feed Post",
  "Carousel",
  "Reel Cover",
  "Campaign Flyer",
  "Menu Feature",
  "Event Announcement",
  "Offer Graphic",
]

const FEED_ROLES = [
  "Typography Break",
  "CTA Card",
  "Campaign Push",
  "Editorial Anchor",
  "Social Proof",
  "Menu Storytelling",
  "Atmosphere Reset",
  "Graphic Contrast",
  "Luxury Reminder",
]

const FORMATS = ["9:16 Story", "4:5 Feed", "1:1 Feed", "Carousel", "Reel Cover"]

const CAMPAIGNS = [
  "Lunch",
  "Traffic Hours",
  "Dinner Experience",
  "Cocktail Ritual",
  "Breakfast",
  "Event Promo",
  "Third Culture Story",
  "Minimal Luxury",
]

const DEFAULT_CONTROLS: DesignControls = {
  campaign: "Lunch",
  objective: "Instagram Story",
  feedRole: "Typography Break",
  format: "9:16 Story",
  assets: "Lunch dish crop, warm venue table, DemoClientD logo, reservation CTA.",
  inspiration: "Lunch, Lifestyle, Flyers / Graphics inspiration folders.",
  copyDirection: "Warm lunch reset. Useful but not corporate. Minimal CTA with editorial restraint.",
}

const TEMPLATE_SYSTEMS: TemplateSystem[] = [
  {
    title: "Lunch Editorial",
    feedRole: "Typography Break / Campaign Push",
    useCases: ["weekday lunch reminders", "story CTA frames", "feed offer card"],
    layout: "Large restrained headline, one food/venue crop, generous negative space, quiet CTA block.",
    typography: "Editorial serif or refined uppercase sans for headline, small utility sans for details.",
    imagePlacement: "One hero image crop anchored low or side-aligned; never cluttered collage.",
    logoPlacement: "Small bottom corner or top lockup with enough breathing room.",
    ctaPlacement: "Bottom safe area for story, lower third for feed.",
    colorTexture: "Warm daylight neutrals, black/green accents, subtle paper or table texture.",
    safeZones: "Keep headline and CTA inside Instagram story safe zones; no text near edge.",
  },
  {
    title: "Traffic Hours",
    feedRole: "Campaign Push / Graphic Contrast",
    useCases: ["cocktail reminder", "offer story", "after-work reel cover"],
    layout: "Dark image anchor, gold light detail, concise offer lockup, sharp time cue.",
    typography: "Compact premium type with one strong numeric/time element.",
    imagePlacement: "Cocktail or bar detail as dark anchor; leave contrast field for copy.",
    logoPlacement: "Tiny mark or wordmark, never competing with offer.",
    ctaPlacement: "Clear booking or visit cue below offer details.",
    colorTexture: "Dark luxury, golden-hour highlights, reflective glass cues.",
    safeZones: "Keep time/price details away from platform UI overlays.",
  },
  {
    title: "Dinner Experience",
    feedRole: "Editorial Anchor",
    useCases: ["dinner mood post", "story opener", "reservation reminder"],
    layout: "Cinematic room or table image with quiet title treatment and soft CTA.",
    typography: "Large elegant title, small supportive line, relaxed spacing.",
    imagePlacement: "Wide atmosphere image full bleed or image-led with dark copy zone.",
    logoPlacement: "Subtle, preferably in a quiet corner.",
    ctaPlacement: "Small reservation line near bottom, not promotional.",
    colorTexture: "Warm interiors, dark blue/black depth, soft highlights.",
    safeZones: "Avoid placing copy over busy faces, hands, or plates.",
  },
  {
    title: "Cocktail Ritual",
    feedRole: "Luxury Reminder",
    useCases: ["drink ritual story", "reel cover", "cocktail carousel opener"],
    layout: "Glass silhouette, ritual verb, micro-copy for garnish or pour detail.",
    typography: "Sharp headline with elegant small caps for drink note.",
    imagePlacement: "Centered or asymmetrical cocktail crop with reflective negative space.",
    logoPlacement: "Small and secondary.",
    ctaPlacement: "Short action line: Start here, Tonight, Reserve.",
    colorTexture: "Dark cinematic, amber glow, glass reflections.",
    safeZones: "Protect glass shape and garnish from text collisions.",
  },
  {
    title: "Breakfast",
    feedRole: "Light Reset",
    useCases: ["morning story", "brunch feed card", "soft CTA"],
    layout: "Bright image field, gentle title, minimal supporting line.",
    typography: "Softer hierarchy, wider breathing room, less contrast.",
    imagePlacement: "Daylight table or dish crop with soft edge space.",
    logoPlacement: "Small and airy.",
    ctaPlacement: "Bottom aligned, low pressure.",
    colorTexture: "Soft daylight, cream/black balance, minimal green accent.",
    safeZones: "Keep copy legible over bright imagery.",
  },
  {
    title: "Event Promo",
    feedRole: "Campaign Push",
    useCases: ["event announcement", "countdown story", "feed flyer"],
    layout: "Date and title hierarchy first, image mood second, CTA third.",
    typography: "Structured editorial event system, not nightclub flyer energy.",
    imagePlacement: "Atmosphere image or product cue as background texture.",
    logoPlacement: "Top or bottom lockup with event partner room if needed.",
    ctaPlacement: "Distinct booking line and event timing block.",
    colorTexture: "Premium dark field, sharp contrast, restrained accent.",
    safeZones: "Dates and timings must remain readable at phone scale.",
  },
  {
    title: "Third Culture Story",
    feedRole: "Menu Storytelling",
    useCases: ["dish origin carousel", "caption graphic", "story explainer"],
    layout: "Editorial note card with dish image, cultural cue, and craft detail.",
    typography: "Magazine-style headline plus short poetic detail copy.",
    imagePlacement: "Dish or ingredient detail paired with calm text field.",
    logoPlacement: "Small footer mark.",
    ctaPlacement: "Soft save/share or discover menu cue.",
    colorTexture: "Warm neutral, tactile texture, restrained luxury.",
    safeZones: "Avoid over-explaining; keep copy blocks small.",
  },
  {
    title: "Minimal Luxury",
    feedRole: "Atmosphere Reset",
    useCases: ["quiet grid pause", "brand statement", "story reset"],
    layout: "Mostly negative space, one line of copy, tiny logo, optional texture.",
    typography: "Precise, minimal, high confidence.",
    imagePlacement: "Optional small crop or texture strip.",
    logoPlacement: "Small and deliberate.",
    ctaPlacement: "Often none; world-building first.",
    colorTexture: "Black, deep green, warm off-white, subtle material cues.",
    safeZones: "Spacing is the design; do not crowd.",
  },
  {
    title: "Typography Break",
    feedRole: "Typography Break",
    useCases: ["feed rhythm interruption", "campaign phrase", "quote card"],
    layout: "Text-first editorial composition with optional small supporting visual.",
    typography: "One strong typographic idea, clear hierarchy, premium restraint.",
    imagePlacement: "Small supporting crop only when useful.",
    logoPlacement: "Footer or corner.",
    ctaPlacement: "Usually tiny or absent unless campaign reminder.",
    colorTexture: "High contrast with brand texture or subtle table material.",
    safeZones: "Must read instantly in grid and full-screen story.",
  },
  {
    title: "Social Proof",
    feedRole: "Social Proof",
    useCases: ["review quote", "guest moment", "press pull quote"],
    layout: "Quote-led card with optional venue/social image support.",
    typography: "Quote hierarchy with attribution secondary.",
    imagePlacement: "Human or room warmth beside or behind quote.",
    logoPlacement: "Small and secondary.",
    ctaPlacement: "Reservation or testimonial continuation line.",
    colorTexture: "Warm dark, subtle glow, quiet credibility.",
    safeZones: "Quote must stay short enough for fast reading.",
  },
]

const CAMPAIGN_PACKS: CampaignDesignPack[] = [
  {
    campaign: "Lunch",
    mood: "Warm daylight hospitality with social reset energy. Comfort-focused editorial pacing with restrained luxury.",
    pack: ["2 story reminder frames", "1 feed typography break", "1 carousel opener", "1 reel cover", "1 CTA card"],
    designRoles: ["Typography Break", "Campaign Push", "Luxury Reminder", "Atmosphere Reset"],
    sourceSystems: ["The DIFC Reset", "The DemoClientD Table", "Comfort Without Borders"],
  },
  {
    campaign: "Traffic Hours",
    mood: "Golden-hour transition from office pace to cocktail ritual.",
    pack: ["3 story frames", "1 dark feed card", "1 offer reminder", "1 reel cover"],
    designRoles: ["Campaign Push", "CTA Card", "Graphic Contrast"],
    sourceSystems: ["Cocktail Rituals", "Tonight at DemoClientD"],
  },
  {
    campaign: "Dinner Experience",
    mood: "Cinematic evening warmth and quiet table magnetism.",
    pack: ["1 atmosphere feed card", "2 story reminders", "1 reel cover", "1 reservation CTA"],
    designRoles: ["Editorial Anchor", "Atmosphere Reset", "Luxury Reminder"],
    sourceSystems: ["Tonight at DemoClientD", "The DemoClientD Table"],
  },
]

const STORY_SEQUENCES: StorySequence[] = [
  {
    title: "Lunch Reminder Sequence",
    purpose: "Useful lunch availability without becoming a corporate promo.",
    frames: [
      { label: "Frame 1", role: "mood opener", visual: "Daylight table or lunch detail with soft negative space.", copy: "Step out of the day.", cta: "Soft availability cue." },
      { label: "Frame 2", role: "menu proof", visual: "Dish detail or menu card crop.", copy: "Lunch, made warmer.", cta: "View menu." },
      { label: "Frame 3", role: "booking cue", visual: "Venue table or social warmth.", copy: "Your midday reset.", cta: "Reserve via SevenRooms." },
    ],
  },
  {
    title: "Cocktail Ritual Sequence",
    purpose: "Move from desire to action across a small evening story arc.",
    frames: [
      { label: "Frame 1", role: "hook", visual: "Dark cocktail silhouette or pour moment.", copy: "Golden hour, poured.", cta: "Tonight." },
      { label: "Frame 2", role: "detail", visual: "Garnish, glass, or reflection crop.", copy: "The first round has a rhythm.", cta: "Traffic Hours." },
      { label: "Frame 3", role: "social cue", visual: "Two drinks or bar/table atmosphere.", copy: "Start here.", cta: "Book / walk in." },
    ],
  },
  {
    title: "Event Countdown Sequence",
    purpose: "Clear event communication with premium restraint.",
    frames: [
      { label: "Frame 1", role: "announcement", visual: "Atmosphere image with date block.", copy: "This week at DemoClientD.", cta: "Save the date." },
      { label: "Frame 2", role: "reason", visual: "Product or room detail tied to event.", copy: "Food, drinks, and the room in motion.", cta: "Details." },
      { label: "Frame 3", role: "urgency", visual: "Minimal typography card.", copy: "Limited tables.", cta: "Reserve." },
    ],
  },
]

const CAROUSEL_STRUCTURES: CarouselStructure[] = [
  {
    title: "Food Storytelling Carousel",
    purpose: "Make a dish save-worthy through craft, texture, and emotional memory.",
    slides: [
      { label: "Slide 1", imageDirection: "Hero dish, full plate or editorial crop.", copyStructure: "Emotional hook.", pacing: "Immediate appetite and recognition.", cta: "Save cue optional." },
      { label: "Slide 2", imageDirection: "45-degree detail.", copyStructure: "Dish identity and cultural cue.", pacing: "Move from beauty to meaning.", cta: "None." },
      { label: "Slide 3", imageDirection: "Macro sauce/garnish texture.", copyStructure: "Craft detail.", pacing: "Tactile proof.", cta: "None." },
      { label: "Slide 4", imageDirection: "Table or service context.", copyStructure: "Experience note.", pacing: "Back to hospitality.", cta: "Soft booking setup." },
      { label: "Slide 5", imageDirection: "Minimal CTA card.", copyStructure: "Reservation/menu action.", pacing: "Clear close.", cta: "Reserve / discover menu." },
    ],
  },
  {
    title: "Cocktail Ritual Carousel",
    purpose: "Turn a drink into a repeatable evening ritual.",
    slides: [
      { label: "Slide 1", imageDirection: "Cocktail hero with reflection.", copyStructure: "Ritual hook.", pacing: "Dark anchor.", cta: "None." },
      { label: "Slide 2", imageDirection: "Pour or garnish detail.", copyStructure: "Process phrase.", pacing: "Movement.", cta: "None." },
      { label: "Slide 3", imageDirection: "Glass close-up.", copyStructure: "Flavor note.", pacing: "Product proof.", cta: "None." },
      { label: "Slide 4", imageDirection: "Social table or bar energy.", copyStructure: "Evening context.", pacing: "Human warmth.", cta: "Traffic Hours cue." },
      { label: "Slide 5", imageDirection: "Typography CTA.", copyStructure: "Start here.", pacing: "Action close.", cta: "Book / visit." },
    ],
  },
  {
    title: "Atmosphere Carousel",
    purpose: "World-building for the room, not a hard sell.",
    slides: [
      { label: "Slide 1", imageDirection: "Wide atmosphere.", copyStructure: "Mood line.", pacing: "Place signal.", cta: "None." },
      { label: "Slide 2", imageDirection: "Table detail.", copyStructure: "Hospitality detail.", pacing: "Intimacy.", cta: "None." },
      { label: "Slide 3", imageDirection: "Service or guest warmth.", copyStructure: "Belonging cue.", pacing: "Human layer.", cta: "None." },
      { label: "Slide 4", imageDirection: "Quiet typography card.", copyStructure: "Brand phrase.", pacing: "Editorial pause.", cta: "None." },
      { label: "Slide 5", imageDirection: "Room close.", copyStructure: "Invitation.", pacing: "Soft close.", cta: "Reserve tonight." },
    ],
  },
]

const REEL_COVER_SYSTEMS: ReelCoverSystem[] = [
  {
    title: "Cinematic Still",
    role: "Editorial Anchor",
    layout: "Full-bleed still with a small title lockup and minimal logo.",
    typography: "Short title, high contrast, no long subtitle.",
    gridBehavior: "Works as a dark or warm anchor in the grid.",
  },
  {
    title: "Typography Overlay",
    role: "Typography Break",
    layout: "Image crop plus large editorial phrase in the safe center.",
    typography: "Strong phrase, no more than 4-6 words.",
    gridBehavior: "Reads clearly at thumbnail scale and interrupts product density.",
  },
  {
    title: "Product Hero",
    role: "Menu Storytelling",
    layout: "Dish/drink truth as focal point with tiny campaign label.",
    typography: "Tiny label only; product remains dominant.",
    gridBehavior: "Good for food/drink reels where object recognition matters.",
  },
  {
    title: "Lifestyle Moment",
    role: "Social Proof",
    layout: "Face, table, or shared moment with restrained headline.",
    typography: "Human-first, light text treatment.",
    gridBehavior: "Adds warmth between product and graphic cards.",
  },
  {
    title: "Minimal Luxury Title Card",
    role: "Luxury Reminder",
    layout: "Text-first card with subtle material texture and tiny brand mark.",
    typography: "Elegant headline with lots of negative space.",
    gridBehavior: "Quiet premium reset before high-density visuals.",
  },
]

function formatLayerForMcp(layer: FigmaLayerSpec, index: number) {
  const geometry = `${layer.width}x${layer.height} at (${layer.x}, ${layer.y})`
  const content = layer.text ? ` Text: "${layer.text}"` : ""
  const style = [
    layer.fill ? `fill ${layer.fill}` : "",
    layer.stroke ? `stroke ${layer.stroke}` : "",
    layer.cornerRadius ? `radius ${layer.cornerRadius}` : "",
    layer.opacity !== undefined ? `opacity ${layer.opacity}` : "",
  ].filter(Boolean).join(", ")
  const notes = layer.notes?.length ? ` Notes: ${layer.notes.join(" ")}` : ""
  return `${index + 1}. ${layer.name} - ${layer.type}; ${geometry}${style ? `; ${style}` : ""}.${content}${notes}`
}

function formatTypeForMcp(type: FigmaTypographySpec) {
  return `${type.role}: ${type.fontFamily}, ${type.fontSize}px, ${type.fontWeight}, line-height ${type.lineHeight}, color ${type.color}`
}

function buildFigmaMcpInstruction({
  clientName,
  designBrief,
  spec,
  template,
}: {
  clientName: string
  designBrief: string
  spec: FigmaDesignSpec
  template: TemplateSystem
}) {
  const safe = spec.frame.safeZone
  const layerList = spec.layers.map(formatLayerForMcp).join("\n")
  const typeList = spec.typography.map(formatTypeForMcp).join("\n")
  const imageNotes = spec.assets
    .filter(asset => asset.type === "image" || asset.type === "reference")
    .map(asset => `- ${asset.name}: ${asset.source || "Use editable placeholder until approved asset is inserted."} ${asset.notes.join(" ")}`)
    .join("\n")
  const ctaLayer = spec.layers.find(layer => layer.type === "cta_block" || layer.name.toLowerCase().includes("cta"))
  const logoLayer = spec.layers.find(layer => layer.type === "logo_placeholder" || layer.name.toLowerCase().includes("logo"))

  return [
    "Create an editable Figma frame from this Jarvis Graphic Design handoff. Do not flatten the design into an image.",
    "",
    "[FIGMA_MCP_CREATION_INSTRUCTION]",
    `Client: ${clientName}`,
    `Campaign: ${spec.campaign}`,
    `Objective: ${spec.objective}`,
    `Format: ${spec.format}`,
    `Frame: ${spec.frame.name} - ${spec.frame.width} x ${spec.frame.height}`,
    `Feed role: ${spec.feedRole}`,
    `Emotional tone: ${spec.mood.emotionalTone}`,
    `Lighting / texture direction: ${spec.mood.lightingStyle}`,
    `Visual density: ${spec.mood.visualDensity}`,
    `Luxury level: ${spec.mood.luxuryLevel}`,
    "",
    "[EDITABLE_LAYER_REQUIREMENT]",
    "- Build native editable Figma layers only: text nodes, rectangles, frames, masks, placeholders, CTA blocks, logo placeholders, and safe-zone guides.",
    "- Keep all text editable. Keep image areas as replaceable placeholders unless an approved source image is explicitly provided.",
    "- Name layers exactly and keep the order clear for designer polish.",
    "",
    "[TYPOGRAPHY_HIERARCHY]",
    typeList,
    "",
    "[LAYOUT_STRUCTURE]",
    `Template system: ${template.title}`,
    `Layout logic: ${template.layout}`,
    `Image placement: ${template.imagePlacement}`,
    `CTA placement: ${template.ctaPlacement}`,
    `Logo placement: ${template.logoPlacement}`,
    `Color / texture direction: ${template.colorTexture}`,
    "",
    "[FRAME_AND_SAFE_ZONES]",
    `Background: ${spec.frame.background}`,
    `Safe zones: top ${safe.top}, right ${safe.right}, bottom ${safe.bottom}, left ${safe.left}`,
    "Show a subtle safe-zone guide layer that can be hidden before export.",
    "",
    "[LAYER_LIST]",
    layerList,
    "",
    "[PLACEHOLDER_IMAGE_NOTES]",
    imageNotes || "- No image sources provided. Use clean editable placeholders only.",
    "",
    "[CTA_BLOCK]",
    ctaLayer
      ? `${ctaLayer.name}: "${ctaLayer.text || "CTA"}" at ${ctaLayer.width}x${ctaLayer.height}; keep legible and editable.`
      : "Use the brief CTA direction as a small editable CTA block inside the safe zone.",
    "",
    "[LOGO_PLACEMENT]",
    logoLayer
      ? `${logoLayer.name}: ${logoLayer.width}x${logoLayer.height} at (${logoLayer.x}, ${logoLayer.y}). Replace placeholder with official logo component when available.`
      : "Place a restrained logo mark in a quiet footer/safe-zone position.",
    "",
    "[DESIGN_BRIEF_CONTEXT]",
    designBrief || "No editable brief was generated yet. Use the structured JSON as the source of truth.",
    "",
    "[SAFETY]",
    "- This is for Figma design creation only.",
    "- No social posting, scheduling, DMs, automations, or publishing actions.",
    "- Do not call Figma REST API writes from the Jarvis dashboard; creation happens through ChatGPT/Figma MCP tools or local fallback plugin.",
  ].join("\n")
}

export default function GraphicDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<GraphicTab>("studio")
  const [controls, setControls] = useState<DesignControls>(DEFAULT_CONTROLS)
  const [designBrief, setDesignBrief] = useState("")
  const [figmaLayoutJson, setFigmaLayoutJson] = useState("")
  const [figmaHandoffMode, setFigmaHandoffMode] = useState<FigmaHandoffMode>("mcp")
  const [figmaMcpInstruction, setFigmaMcpInstruction] = useState("")
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [figmaLayoutGeneratedAt, setFigmaLayoutGeneratedAt] = useState<string | null>(null)
  const [figmaMcpGeneratedAt, setFigmaMcpGeneratedAt] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState("")
  const [mcpCopyStatus, setMcpCopyStatus] = useState("")
  const [brainInspirationAssets, setBrainInspirationAssets] = useState<InspirationAsset[]>([])
  const [memoryCategory, setMemoryCategory] = useState("Lunch Editorial")
  const [memoryDesignType, setMemoryDesignType] = useState("Story Graphic")
  const [memoryFeedRole, setMemoryFeedRole] = useState("Typography Break")
  const [memoryNotes, setMemoryNotes] = useState("")
  const [stagedMemory, setStagedMemory] = useState<StagedMemoryReference[]>([])

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
  const inspirationFolders = useMemo(() => unique(brainInspirationAssets.map(asset => inspirationFolder(asset))), [brainInspirationAssets])
  const signatureSystems = useMemo(() => systemsForCampaign(controls.campaign), [controls.campaign])
  const activeTemplate = useMemo(() => findTemplate(controls.campaign, controls.feedRole), [controls.campaign, controls.feedRole])

  const generateBrief = () => {
    setDesignBrief(buildDesignBrief({
      clientName: client?.name ?? "DemoClientD Dubai",
      controls,
      visualReport,
      inspirationFolders,
      signatureSystems,
      template: activeTemplate,
    }))
    setGeneratedAt(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))
  }

  const buildCurrentFigmaSpec = () => {
    const brief = designBrief || buildDesignBrief({
      clientName: client?.name ?? "DemoClientD Dubai",
      controls,
      visualReport,
      inspirationFolders,
      signatureSystems,
      template: activeTemplate,
    })

    const spec = buildFigmaDesignSpec({
      clientId: id,
      clientName: client?.name ?? "DemoClientD Dubai",
      campaign: controls.campaign,
      objective: controls.objective,
      feedRole: controls.feedRole,
      format: controls.format,
      designBrief: brief,
      assets: controls.assets,
      inspiration: controls.inspiration,
      copyDirection: controls.copyDirection,
      emotionalTone: visualReport.dominant.emotion ? prettyLabel(visualReport.dominant.emotion) : "warm luxury",
      lightingStyle: visualReport.dominant.lighting ? prettyLabel(visualReport.dominant.lighting) : "brand-aware editorial",
    })

    return { brief, spec, json: JSON.stringify(spec, null, 2) }
  }

  const generateFigmaLayoutJson = () => {
    const { brief, json } = buildCurrentFigmaSpec()
    if (!designBrief) setDesignBrief(brief)
    setFigmaLayoutJson(json)
    setFigmaLayoutGeneratedAt(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))
    setCopyStatus("")
  }

  const generateFigmaMcpInstruction = () => {
    const { brief, spec, json } = buildCurrentFigmaSpec()
    if (!designBrief) setDesignBrief(brief)
    setFigmaLayoutJson(json)
    setFigmaLayoutGeneratedAt(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))
    setFigmaMcpInstruction(buildFigmaMcpInstruction({
      clientName: client?.name ?? "DemoClientD Dubai",
      designBrief: brief,
      spec,
      template: activeTemplate,
    }))
    setFigmaMcpGeneratedAt(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))
    setMcpCopyStatus("")
  }

  const copyFigmaLayoutJson = async () => {
    if (!figmaLayoutJson) return
    try {
      await navigator.clipboard.writeText(figmaLayoutJson)
      setCopyStatus("Copied")
    } catch {
      setCopyStatus("Copy failed")
    }
  }

  const copyFigmaMcpInstruction = async () => {
    if (!figmaMcpInstruction) return
    try {
      await navigator.clipboard.writeText(figmaMcpInstruction)
      setMcpCopyStatus("Copied")
    } catch {
      setMcpCopyStatus("Copy failed")
    }
  }

  const stageMemoryFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const entries = Array.from(files).map(file => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      category: memoryCategory,
      designType: memoryDesignType,
      feedRole: memoryFeedRole,
      notes: memoryNotes.trim() || "Local design memory reference. Not uploaded to Figma.",
    }))
    setStagedMemory(prev => [...entries, ...prev])
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
                <p className="jarvis-eyebrow">Graphic Design Studio</p>
                <h1 className="jarvis-title mt-3">{client.name} Editorial Communication Engine</h1>
                <p className="jarvis-copy mt-5 max-w-3xl">
                  Turn strategy, campaign systems, visual intelligence, and approved assets into branded design briefs,
                  story graphics, carousel structures, reel covers, and Figma-ready handoff specs.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5 xl:w-[360px]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">V1 scope</p>
                <p className="mt-3 text-lg font-semibold text-white">Briefs and specs only</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  No posting, paid generation, Figma writes, or automatic rendering. This studio prepares editorial direction before production.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {["Feed role first", "Editable design brief", "Template systems", "Figma-ready specs"].map(item => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">System</p>
                <p className="mt-1 text-sm font-semibold text-white/75">{item}</p>
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
            <section className="min-w-0">
              {activeTab === "studio" && (
                <DesignStudio
                  controls={controls}
                  setControls={setControls}
                  designBrief={designBrief}
                  setDesignBrief={setDesignBrief}
                  onGenerateBrief={generateBrief}
                  generatedAt={generatedAt}
                  activeTemplate={activeTemplate}
                  visualReport={visualReport}
                  figmaLayoutJson={figmaLayoutJson}
                  setFigmaLayoutJson={setFigmaLayoutJson}
                  onGenerateFigmaLayoutJson={generateFigmaLayoutJson}
                  onCopyFigmaLayoutJson={copyFigmaLayoutJson}
                  figmaLayoutGeneratedAt={figmaLayoutGeneratedAt}
                  copyStatus={copyStatus}
                />
              )}
              {activeTab === "templates" && <TemplateSystems />}
              {activeTab === "campaigns" && <CampaignGraphics />}
              {activeTab === "stories" && <StoryGraphics />}
              {activeTab === "carousels" && <CarouselBuilder />}
              {activeTab === "covers" && <ReelCovers />}
              {activeTab === "memory" && (
                <DesignMemory
                  memoryCategory={memoryCategory}
                  setMemoryCategory={setMemoryCategory}
                  memoryDesignType={memoryDesignType}
                  setMemoryDesignType={setMemoryDesignType}
                  memoryFeedRole={memoryFeedRole}
                  setMemoryFeedRole={setMemoryFeedRole}
                  memoryNotes={memoryNotes}
                  setMemoryNotes={setMemoryNotes}
                  stagedMemory={stagedMemory}
                  onStageFiles={stageMemoryFiles}
                />
              )}
              {activeTab === "figma" && (
                <FigmaHandoff
                  controls={controls}
                  designBrief={designBrief}
                  template={activeTemplate}
                  figmaLayoutJson={figmaLayoutJson}
                  figmaHandoffMode={figmaHandoffMode}
                  setFigmaHandoffMode={setFigmaHandoffMode}
                  figmaMcpInstruction={figmaMcpInstruction}
                  onGenerateFigmaLayoutJson={generateFigmaLayoutJson}
                  onCopyFigmaLayoutJson={copyFigmaLayoutJson}
                  onGenerateFigmaMcpInstruction={generateFigmaMcpInstruction}
                  onCopyFigmaMcpInstruction={copyFigmaMcpInstruction}
                  copyStatus={copyStatus}
                  mcpCopyStatus={mcpCopyStatus}
                  figmaMcpGeneratedAt={figmaMcpGeneratedAt}
                />
              )}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Design State</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{designBrief ? "Brief generated" : "Ready to brief"}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Start in Design Studio, generate the editable brief, then use Template Systems and Figma Handoff for production direction.
                </p>
                <button type="button" data-graphic-generate="brief" onClick={generateBrief} className="jarvis-button mt-5 w-full justify-center">
                  Generate design brief
                </button>
                <button type="button" data-graphic-generate="figma-json" onClick={generateFigmaLayoutJson} className="jarvis-muted-button mt-3 w-full justify-center">
                  Generate Figma Layout JSON
                </button>
                {generatedAt && <p className="mt-3 text-xs text-white/35">Last generated: {generatedAt}</p>}
                {figmaLayoutGeneratedAt && <p className="mt-1 text-xs text-white/35">JSON generated: {figmaLayoutGeneratedAt}</p>}
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Current Setup</p>
                <div className="mt-4 grid gap-3">
                  <SummaryRow label="Campaign" value={controls.campaign} />
                  <SummaryRow label="Objective" value={controls.objective} />
                  <SummaryRow label="Feed role" value={controls.feedRole} />
                  <SummaryRow label="Format" value={controls.format} />
                  <SummaryRow label="Client Brain refs" value={String(brainInspirationAssets.length)} />
                  <SummaryRow label="Figma JSON" value={figmaLayoutJson ? "Ready" : "Not generated"} />
                </div>
              </section>

              <section className="jarvis-panel">
                <p className="jarvis-eyebrow">Visual Intelligence</p>
                <p className="mt-3 text-sm leading-relaxed text-white/52">
                  Design direction inherits composition, lighting, emotional tone, and feed-role signals from Client Brain inspiration references.
                </p>
                <div className="mt-4 space-y-2">
                  <SummaryRow label="Dominant composition" value={prettyLabel(visualReport.dominant.composition ?? "unknown")} />
                  <SummaryRow label="Dominant lighting" value={prettyLabel(visualReport.dominant.lighting ?? "unknown")} />
                  <SummaryRow label="Dominant emotion" value={prettyLabel(visualReport.dominant.emotion ?? "unknown")} />
                </div>
                {inspirationFolders.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.06] p-3">
                    <p className="text-xs font-semibold text-fuchsia-100">Inspiration folders</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">{inspirationFolders.join(" / ")}</p>
                  </div>
                )}
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Integration Sources</p>
                <div className="mt-4 space-y-2 text-sm text-white/50">
                  <p>Brand Strategy: positioning, tone, emotional identity.</p>
                  <p>Visual Intelligence: feed role and rhythm.</p>
                  <p>Content Planning: planned posts and campaign priorities.</p>
                  <p>Production Orchestrator: design tasks and asset needs.</p>
                  <p>Client Brain: logos, assets, inspiration, generated outputs.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function DesignStudio({
  controls,
  setControls,
  designBrief,
  setDesignBrief,
  onGenerateBrief,
  generatedAt,
  activeTemplate,
  visualReport,
  figmaLayoutJson,
  setFigmaLayoutJson,
  onGenerateFigmaLayoutJson,
  onCopyFigmaLayoutJson,
  figmaLayoutGeneratedAt,
  copyStatus,
}: {
  controls: DesignControls
  setControls: (next: DesignControls) => void
  designBrief: string
  setDesignBrief: (next: string) => void
  onGenerateBrief: () => void
  generatedAt: string | null
  activeTemplate: TemplateSystem
  visualReport: VisualIntelligenceReport
  figmaLayoutJson: string
  setFigmaLayoutJson: (next: string) => void
  onGenerateFigmaLayoutJson: () => void
  onCopyFigmaLayoutJson: () => void
  figmaLayoutGeneratedAt: string | null
  copyStatus: string
}) {
  const update = (key: keyof DesignControls, value: string) => setControls({ ...controls, [key]: value })

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="jarvis-panel">
        <p className="jarvis-eyebrow">Design Studio</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Generate an editorial design brief</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Define why the graphic exists before designing it. Feed role, format, asset logic, and copy hierarchy are the core controls.
        </p>

        <div className="mt-6 space-y-4">
          <SelectField label="Campaign" value={controls.campaign} options={CAMPAIGNS} onChange={value => update("campaign", value)} />
          <SelectField label="Design objective" value={controls.objective} options={DESIGN_OBJECTIVES} onChange={value => update("objective", value)} />
          <SelectField label="Feed role" value={controls.feedRole} options={FEED_ROLES} onChange={value => update("feedRole", value)} />
          <SelectField label="Format" value={controls.format} options={FORMATS} onChange={value => update("format", value)} />
          <TextAreaField label="Assets" value={controls.assets} onChange={value => update("assets", value)} rows={3} />
          <TextAreaField label="Inspiration" value={controls.inspiration} onChange={value => update("inspiration", value)} rows={3} />
          <TextAreaField label="Copy direction" value={controls.copyDirection} onChange={value => update("copyDirection", value)} rows={4} />
        </div>

        <button type="button" onClick={onGenerateBrief} className="jarvis-button mt-6 w-full justify-center">
          Generate design brief
        </button>
        <button type="button" onClick={onGenerateFigmaLayoutJson} className="jarvis-muted-button mt-3 w-full justify-center">
          Generate Figma Layout JSON
        </button>
        {generatedAt && <p className="mt-3 text-xs text-white/35">Generated {generatedAt}</p>}
      </section>

      <section className="space-y-6 min-w-0">
        <div className="jarvis-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="jarvis-eyebrow">Editable Brief</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Planning prompt / design spec</h2>
            </div>
            <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-xs font-semibold text-emerald-100">
              No render actions
            </span>
          </div>
          <textarea
            value={designBrief}
            onChange={event => setDesignBrief(event.target.value)}
            placeholder="Generate the design brief to inspect, edit, and hand off the creative direction."
            rows={24}
            className="mt-5 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-relaxed text-white/75 placeholder-white/25 outline-none transition focus:border-emerald-300/40"
          />
        </div>

        <div className="jarvis-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="jarvis-eyebrow">Figma Layout JSON</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Structured plugin handoff</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/50">
                This editable JSON is the object the Jarvis Figma Plugin consumes to create an editable frame with text, placeholders, CTA, logo, and safe zones.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onGenerateFigmaLayoutJson} className="jarvis-button px-4 py-2 text-xs">
                Generate JSON
              </button>
              <button type="button" onClick={onCopyFigmaLayoutJson} disabled={!figmaLayoutJson} className="jarvis-muted-button px-4 py-2 text-xs disabled:opacity-40">
                {copyStatus || "Copy JSON"}
              </button>
            </div>
          </div>
          <textarea
            value={figmaLayoutJson}
            onChange={event => setFigmaLayoutJson(event.target.value)}
            placeholder="Generate Figma Layout JSON after the design brief. You can edit this before pasting into the Jarvis Figma Plugin."
            rows={22}
            className="mt-5 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-relaxed text-white/75 placeholder-white/25 outline-none transition focus:border-emerald-300/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/35">
            <span>{figmaLayoutGeneratedAt ? `JSON generated ${figmaLayoutGeneratedAt}` : "No JSON generated yet."}</span>
            <span>Local plugin workflow only. No Figma cloud writes.</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <DirectionCard title="Template fit" value={activeTemplate.title} detail={activeTemplate.layout} />
          <DirectionCard title="Dominant rhythm" value={prettyLabel(visualReport.dominant.feedRole ?? "unknown")} detail="Use feed role to decide whether this graphic interrupts, sells, explains, or resets the grid." />
          <DirectionCard title="Visual caution" value={visualReport.feedInsights[0]?.title ?? "Balanced baseline"} detail={visualReport.feedInsights[0]?.recommendation ?? "Keep the design specific to the selected feed role."} />
        </div>
      </section>
    </div>
  )
}

function TemplateSystems() {
  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Reusable Systems"
        title="Template systems"
        intro="Reusable design logic for campaigns, story frames, feed graphics, carousel openers, and reel covers."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATE_SYSTEMS.map(template => (
          <article key={template.title} className="jarvis-card p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/60">Template System</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{template.title}</h3>
              </div>
              <span className="w-fit rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white/55">{template.feedRole}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/50">{template.layout}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <SpecItem label="Typography" value={template.typography} />
              <SpecItem label="Image placement" value={template.imagePlacement} />
              <SpecItem label="Logo" value={template.logoPlacement} />
              <SpecItem label="CTA" value={template.ctaPlacement} />
              <SpecItem label="Color / texture" value={template.colorTexture} />
              <SpecItem label="Safe zones" value={template.safeZones} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {template.useCases.map(useCase => <Pill key={useCase}>{useCase}</Pill>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CampaignGraphics() {
  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Campaign Design Packs"
        title="Campaign graphics planning"
        intro="Plan the design pack before producing assets. Each campaign gets feed roles, graphics, story frames, reel covers, and CTA cards."
      />
      <div className="grid gap-4">
        {CAMPAIGN_PACKS.map(pack => (
          <article key={pack.campaign} className="jarvis-card p-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/60">Campaign Pack</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{pack.campaign}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/52">{pack.mood}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {pack.sourceSystems.map(system => <Pill key={system}>{system}</Pill>)}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ListPanel title="Design pack" items={pack.pack} />
                <ListPanel title="Feed roles" items={pack.designRoles} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function StoryGraphics() {
  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Story Systems"
        title="Story graphics with rhythm"
        intro="Stories should feel alive, varied, premium, and current. Each sequence uses frame purpose, visual variation, copy hierarchy, and CTA rhythm."
      />
      <div className="grid gap-4">
        {STORY_SEQUENCES.map(sequence => (
          <article key={sequence.title} className="jarvis-card p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/60">Story Sequence</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{sequence.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/52">{sequence.purpose}</p>
            <div className="mt-5 grid gap-3">
              {sequence.frames.map(frame => (
                <div key={frame.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-xs font-semibold text-emerald-100">{frame.label}</span>
                    <span className="text-xs text-white/40">{frame.role}</span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <SpecItem label="Visual" value={frame.visual} />
                    <SpecItem label="Copy" value={frame.copy} />
                    <SpecItem label="CTA" value={frame.cta} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CarouselBuilder() {
  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Editorial Carousels"
        title="Carousel builder"
        intro="Carousel systems define slide purpose, image direction, copy structure, visual pacing, and CTA placement before design production."
      />
      <div className="grid gap-4">
        {CAROUSEL_STRUCTURES.map(carousel => (
          <article key={carousel.title} className="jarvis-card p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/60">Carousel Structure</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{carousel.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/52">{carousel.purpose}</p>
            <div className="mt-5 grid gap-3">
              {carousel.slides.map(slide => (
                <div key={slide.label} className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 lg:grid-cols-[110px_repeat(4,minmax(0,1fr))]">
                  <div>
                    <p className="text-sm font-semibold text-white">{slide.label}</p>
                  </div>
                  <SpecItem label="Image" value={slide.imageDirection} />
                  <SpecItem label="Copy" value={slide.copyStructure} />
                  <SpecItem label="Pacing" value={slide.pacing} />
                  <SpecItem label="CTA" value={slide.cta} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ReelCovers() {
  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Reel Cover Systems"
        title="Premium reel thumbnails"
        intro="Reel covers support scroll-stopping clarity, grid consistency, premium typography, and feed rhythm."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {REEL_COVER_SYSTEMS.map(cover => (
          <article key={cover.title} className="jarvis-card p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/60">Reel Cover</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{cover.title}</h3>
              </div>
              <span className="w-fit rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white/55">{cover.role}</span>
            </div>
            <div className="mt-5 grid gap-3">
              <SpecItem label="Layout" value={cover.layout} />
              <SpecItem label="Typography" value={cover.typography} />
              <SpecItem label="Grid behavior" value={cover.gridBehavior} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function DesignMemory({
  memoryCategory,
  setMemoryCategory,
  memoryDesignType,
  setMemoryDesignType,
  memoryFeedRole,
  setMemoryFeedRole,
  memoryNotes,
  setMemoryNotes,
  stagedMemory,
  onStageFiles,
}: {
  memoryCategory: string
  setMemoryCategory: (value: string) => void
  memoryDesignType: string
  setMemoryDesignType: (value: string) => void
  memoryFeedRole: string
  setMemoryFeedRole: (value: string) => void
  memoryNotes: string
  setMemoryNotes: (value: string) => void
  stagedMemory: StagedMemoryReference[]
  onStageFiles: (files: FileList | null) => void
}) {
  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Design Memory"
        title="Existing template references"
        intro="Stage screenshots or exports of existing design templates, tag them by campaign/design type/feed role, and keep them as inspiration-only design memory. V1 does not write to Figma."
      />
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="jarvis-panel">
          <p className="jarvis-eyebrow">Local Staging</p>
          <div className="mt-5 space-y-4">
            <SelectField label="Template category" value={memoryCategory} options={TEMPLATE_SYSTEMS.map(item => item.title)} onChange={setMemoryCategory} />
            <SelectField label="Design type" value={memoryDesignType} options={["Story Graphic", "Feed Post", "Carousel", "Reel Cover", "Campaign Flyer", "Menu Feature"]} onChange={setMemoryDesignType} />
            <SelectField label="Feed role" value={memoryFeedRole} options={FEED_ROLES} onChange={setMemoryFeedRole} />
            <TextAreaField label="Notes" value={memoryNotes} onChange={setMemoryNotes} rows={4} />
            <label className="block rounded-2xl border border-dashed border-white/15 bg-black/25 p-5 text-center transition hover:border-emerald-300/30">
              <span className="text-sm font-semibold text-white">Upload screenshots / exports</span>
              <span className="mt-2 block text-xs leading-relaxed text-white/40">Local staging only in V1. No Figma write action.</span>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                className="sr-only"
                onChange={event => {
                  onStageFiles(event.target.files)
                  event.currentTarget.value = ""
                }}
              />
            </label>
          </div>
        </section>

        <section className="jarvis-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="jarvis-eyebrow">Staged References</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{stagedMemory.length} local references</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white/50">inspirationOnly</span>
          </div>
          {stagedMemory.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-black/20 p-8 text-center">
              <p className="text-sm text-white/55">No design memory staged yet.</p>
              <p className="mt-2 text-xs text-white/35">Upload screenshots or exports to build a future Figma/template memory layer.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {stagedMemory.map(item => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-sm font-semibold text-white">{item.fileName}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill>{item.category}</Pill>
                    <Pill>{item.designType}</Pill>
                    <Pill>{item.feedRole}</Pill>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-white/45">{item.notes}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function FigmaHandoff({
  controls,
  designBrief,
  template,
  figmaLayoutJson,
  figmaHandoffMode,
  setFigmaHandoffMode,
  figmaMcpInstruction,
  onGenerateFigmaLayoutJson,
  onCopyFigmaLayoutJson,
  onGenerateFigmaMcpInstruction,
  onCopyFigmaMcpInstruction,
  copyStatus,
  mcpCopyStatus,
  figmaMcpGeneratedAt,
}: {
  controls: DesignControls
  designBrief: string
  template: TemplateSystem
  figmaLayoutJson: string
  figmaHandoffMode: FigmaHandoffMode
  setFigmaHandoffMode: (next: FigmaHandoffMode) => void
  figmaMcpInstruction: string
  onGenerateFigmaLayoutJson: () => void
  onCopyFigmaLayoutJson: () => void
  onGenerateFigmaMcpInstruction: () => void
  onCopyFigmaMcpInstruction: () => void
  copyStatus: string
  mcpCopyStatus: string
  figmaMcpGeneratedAt: string | null
}) {
  const frameSize =
    controls.format === "9:16 Story" ? "1080 x 1920" :
    controls.format === "4:5 Feed" ? "1080 x 1350" :
    controls.format === "1:1 Feed" ? "1080 x 1080" :
    controls.format === "Reel Cover" ? "1080 x 1920 with grid-safe title zone" :
    "1080 x 1350 per slide"

  const handoff = [
    "[FIGMA_HANDOFF_SPEC]",
    `Frame: ${controls.format} (${frameSize})`,
    `Campaign: ${controls.campaign}`,
    `Objective: ${controls.objective}`,
    `Feed role: ${controls.feedRole}`,
    "",
    "[LAYER_STRUCTURE]",
    "01 Background / texture",
    "02 Image mask / hero asset",
    "03 Gradient or contrast scrim if needed",
    "04 Headline text",
    "05 Supporting detail text",
    "06 CTA / booking line",
    "07 Logo / mark",
    "08 Safe-zone guides",
    "",
    "[COMPONENT_SUGGESTIONS]",
    `Template system: ${template.title}`,
    `Typography: ${template.typography}`,
    `Image placement: ${template.imagePlacement}`,
    `CTA placement: ${template.ctaPlacement}`,
    "",
    "[EXPORT]",
    "Export PNG/JPG for Instagram placement after human review.",
    "No Figma API write action is enabled in Jarvis V1.",
  ].join("\n")

  const workflowSteps = [
    "Generate Design Brief",
    "Generate Figma Layout JSON",
    "Generate MCP Instruction",
    "Copy instruction into ChatGPT/Figma MCP flow",
    "Generate editable frame",
    "Review/polish in Figma",
  ]

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6 min-w-0">
        <div className="jarvis-panel">
          <p className="jarvis-eyebrow">Figma Handoff</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Jarvis to Figma bridge</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/50">
            Figma remains the professional editing layer. Jarvis generates structured layout JSON, then prepares either an MCP-native creation instruction or the local plugin fallback object.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { id: "mcp" as const, label: "Figma MCP Assisted Creation", detail: "Copy a clean instruction into ChatGPT/Figma MCP tools for direct editable frame creation." },
              { id: "plugin" as const, label: "Manual Plugin Export", detail: "Fallback workflow using the local Jarvis Figma Plugin and pasted layout JSON." },
            ].map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFigmaHandoffMode(option.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  figmaHandoffMode === option.id
                    ? "border-emerald-300/45 bg-emerald-300/[0.10] text-white"
                    : "border-white/10 bg-black/25 text-white/60 hover:border-white/20 hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="mt-2 block text-xs leading-relaxed text-white/45">{option.detail}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Step {index + 1}</p>
                <p className="mt-2 text-sm font-semibold text-white/75">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {figmaHandoffMode === "mcp" ? (
          <div className="jarvis-panel min-w-0">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="jarvis-eyebrow">Figma MCP Assisted Creation</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Copy-ready MCP instruction</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Generates a clean instruction from the Design Brief and Figma Layout JSON for ChatGPT/Figma MCP. The output demands editable Figma layers, not a flattened graphic.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onGenerateFigmaMcpInstruction} className="jarvis-button px-4 py-2 text-xs">
                  Generate MCP Instruction
                </button>
                <button type="button" onClick={onCopyFigmaMcpInstruction} disabled={!figmaMcpInstruction} className="jarvis-muted-button px-4 py-2 text-xs disabled:opacity-40">
                  {mcpCopyStatus || "Copy MCP Instruction"}
                </button>
              </div>
            </div>
            <textarea
              value={figmaMcpInstruction || "Generate the MCP instruction after the Design Brief and Figma Layout JSON are ready."}
              readOnly
              rows={30}
              className="mt-5 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-relaxed text-white/75 outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/35">
              <span>{figmaMcpGeneratedAt ? `MCP instruction generated ${figmaMcpGeneratedAt}` : "No MCP instruction generated yet."}</span>
              <span>No Figma REST writes from Jarvis dashboard.</span>
            </div>
          </div>
        ) : (
          <div className="jarvis-panel min-w-0">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="jarvis-eyebrow">Manual Plugin Export</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Plugin input object</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Fallback workflow for the local Jarvis Figma Plugin. Paste this JSON into the plugin to create editable placeholder frames and layers.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onGenerateFigmaLayoutJson} className="jarvis-button px-4 py-2 text-xs">
                  Generate JSON
                </button>
                <button type="button" onClick={onCopyFigmaLayoutJson} disabled={!figmaLayoutJson} className="jarvis-muted-button px-4 py-2 text-xs disabled:opacity-40">
                  {copyStatus || "Copy JSON"}
                </button>
              </div>
            </div>
            <textarea
              value={figmaLayoutJson || "Generate Figma Layout JSON from Design Studio or this handoff tab."}
              readOnly
              rows={26}
              className="mt-5 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-relaxed text-white/75 outline-none"
            />
          </div>
        )}

        <div className="jarvis-panel min-w-0">
          <p className="jarvis-eyebrow">Legacy Spec View</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Readable production notes</h2>
          <textarea
            value={designBrief ? `${designBrief}\n\n${handoff}` : handoff}
            readOnly
            rows={18}
            className="mt-5 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-relaxed text-white/75 outline-none"
          />
        </div>
      </div>
      <aside className="space-y-4">
        <section className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.06] p-5">
          <p className="jarvis-eyebrow">Figma MCP Status</p>
          <h3 className="mt-2 text-lg font-semibold text-white">MCP-assisted handoff enabled</h3>
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-white/55">
            <p>MCP mode is for direct Figma generation through ChatGPT/Figma tools.</p>
            <p>The local Jarvis Figma Plugin remains available as the manual fallback.</p>
            <p>No posting, scheduling, social publishing, or dashboard Figma REST write action is enabled.</p>
          </div>
        </section>
        <DirectionCard title="Frame size" value={frameSize} detail="Use the selected format as the source of truth for Figma frame creation." />
        <DirectionCard title="Safe zones" value={template.safeZones} detail="Keep typography and CTA clear of platform interface overlays." />
        <DirectionCard title="Manual fallback" value="/figma-plugin" detail="Install locally in Figma as a development plugin and paste the generated JSON if MCP is unavailable." />
        <DirectionCard title="Write safety" value="Dashboard read-only" detail="Jarvis prepares specs only. Figma creation happens through MCP tools or local plugin import." />
      </aside>
    </section>
  )
}

function buildDesignBrief({
  clientName,
  controls,
  visualReport,
  inspirationFolders,
  signatureSystems,
  template,
}: {
  clientName: string
  controls: DesignControls
  visualReport: VisualIntelligenceReport
  inspirationFolders: string[]
  signatureSystems: string[]
  template: TemplateSystem
}) {
  const folders = inspirationFolders.length > 0 ? inspirationFolders.join(", ") : "Client Brain inspiration folders when available"
  const signatures = signatureSystems.join(", ")
  const visualRecommendations = visualReport.feedInsights.slice(0, 3).map(insight => `- ${insight.recommendation}`).join("\n")

  return `[CAMPAIGN_CONTEXT]
- Client: ${clientName}
- Campaign: ${controls.campaign}
- Signature systems: ${signatures}
- Campaign mood: ${campaignMood(controls.campaign)}

[DESIGN_OBJECTIVE]
- Objective: ${controls.objective}
- Format: ${controls.format}
- This is an editorial communication piece, not a generic template.

[FEED_ROLE]
- Role: ${controls.feedRole}
- Job in feed: ${feedRoleJob(controls.feedRole)}
- The design must understand why it exists before visual styling is chosen.

[BRAND_STRATEGY]
- Third Culture Hospitality: globally welcoming, warm, culturally layered, luxurious but comfortable.
- Keep DemoClientD premium without making it cold or corporate.
- DIFC professionals matter, but the brand should remain broader than a corporate restaurant.

[VISUAL_INTELLIGENCE]
- Dominant composition signal: ${prettyLabel(visualReport.dominant.composition ?? "unknown")}.
- Dominant lighting signal: ${prettyLabel(visualReport.dominant.lighting ?? "unknown")}.
- Dominant emotional tone: ${prettyLabel(visualReport.dominant.emotion ?? "unknown")}.
- Feed choreography notes:
${visualRecommendations}

[INSPIRATION_REFERENCES]
- Source folders: ${folders}
- Inspiration refs are inspiration only.
- Use them for mood, composition, typography rhythm, color, and atmosphere.
- Do not copy exact layouts or override truth assets.

[ASSETS]
- Required assets: ${controls.assets}
- Asset usage should be controlled, premium, and uncluttered.
- Product/venue/model truth remains more important than graphic styling.

[COPY_STRUCTURE]
- Direction: ${controls.copyDirection}
- Copy should be concise, editorial, emotionally specific, and phone-legible.
- Avoid flyer clutter, generic promo language, and excessive explanation.

[LAYOUT_DIRECTION]
- Template system: ${template.title}
- Layout: ${template.layout}
- Typography: ${template.typography}
- Image placement: ${template.imagePlacement}
- Logo placement: ${template.logoPlacement}
- CTA placement: ${template.ctaPlacement}
- Color/texture: ${template.colorTexture}
- Safe zones: ${template.safeZones}

[OUTPUT_REQUIREMENTS]
- Deliverable: ${controls.format}
- Must feel like Jarvis editorial communication, not Canva/Figma clone output.
- Design for Instagram readability, grid rhythm, and premium restraint.
- Human review required before publishing or production.

[FIGMA_HANDOFF]
- Frame size: ${frameSizeForFormat(controls.format)}
- Layers: background/texture, image mask, contrast scrim, headline, support copy, CTA, logo, safe-zone guides.
- Component notes: reusable headline lockup, CTA block, image mask, logo lockup.
- No Figma API write action in V1.`
}

function frameSizeForFormat(format: string) {
  if (format === "9:16 Story") return "1080 x 1920"
  if (format === "4:5 Feed") return "1080 x 1350"
  if (format === "1:1 Feed") return "1080 x 1080"
  if (format === "Reel Cover") return "1080 x 1920 with grid-safe title zone"
  return "1080 x 1350 per carousel slide"
}

function campaignMood(campaign: string) {
  if (campaign === "Lunch") return "Warm daylight hospitality with social reset energy; comfort-focused editorial pacing with restrained luxury."
  if (campaign === "Traffic Hours") return "Golden-hour after-work release; cocktails, social movement, premium clarity."
  if (campaign === "Dinner Experience") return "Cinematic evening warmth, intimate table magnetism, polished hospitality."
  if (campaign === "Cocktail Ritual") return "Dark luxury, glass detail, movement, anticipation, and social start-of-night energy."
  if (campaign === "Breakfast") return "Soft daylight comfort, gentle ritual, warm reset, emotionally easy."
  return "Premium editorial clarity connected to DemoClientD's Third Culture Hospitality world."
}

function feedRoleJob(feedRole: string) {
  if (feedRole === "Typography Break") return "interrupt visual repetition and add editorial intelligence to the grid"
  if (feedRole === "CTA Card") return "create a clear action moment without becoming loud or cheap"
  if (feedRole === "Campaign Push") return "advance a campaign while protecting brand warmth and visual rhythm"
  if (feedRole === "Editorial Anchor") return "hold a premium visual moment that deepens the brand world"
  if (feedRole === "Social Proof") return "turn credibility into warmth rather than a generic testimonial card"
  if (feedRole === "Menu Storytelling") return "make a dish or drink more memorable through craft and emotional context"
  if (feedRole === "Atmosphere Reset") return "give the feed breathing room and a stronger sense of place"
  if (feedRole === "Graphic Contrast") return "add designed contrast between photography-led posts"
  return "remind the audience of the brand with premium restraint"
}

function systemsForCampaign(campaign: string) {
  if (campaign === "Lunch") return ["The DIFC Reset", "The DemoClientD Table", "Comfort Without Borders"]
  if (campaign === "Traffic Hours" || campaign === "Cocktail Ritual") return ["Cocktail Rituals", "Tonight at DemoClientD", "The DemoClientD Table"]
  if (campaign === "Dinner Experience") return ["Tonight at DemoClientD", "The DemoClientD Table"]
  if (campaign === "Breakfast") return ["Comfort Without Borders", "The DemoClientD Table"]
  if (campaign === "Third Culture Story") return ["Third Culture Plate", "Comfort Without Borders"]
  return SIGNATURE_SYSTEMS.slice(0, 3).map(system => system.title)
}

function findTemplate(campaign: string, feedRole: string) {
  const campaignMatch = TEMPLATE_SYSTEMS.find(template => campaign.toLowerCase().includes(template.title.split(" ")[0].toLowerCase()))
  const roleMatch = TEMPLATE_SYSTEMS.find(template => template.feedRole.toLowerCase().includes(feedRole.toLowerCase()))
  return campaignMatch ?? roleMatch ?? TEMPLATE_SYSTEMS.find(template => template.title === "Minimal Luxury") ?? TEMPLATE_SYSTEMS[0]
}

function SectionHeader({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="jarvis-panel">
      <p className="jarvis-eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/52">{intro}</p>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-300/40"
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function TextAreaField({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={rows}
        className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm leading-relaxed text-white outline-none transition focus:border-emerald-300/40"
      />
    </label>
  )
}

function DirectionCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{title}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-white/42">{detail}</p>
    </div>
  )
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/55">{value}</p>
    </div>
  )
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map(item => <li key={item} className="text-sm leading-relaxed text-white/50">{item}</li>)}
      </ul>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-xs text-white/35">{label}</span>
      <span className="max-w-[180px] text-right text-xs font-semibold text-white/70">{value}</span>
    </div>
  )
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-semibold text-white/52">
      {children}
    </span>
  )
}

function prettyLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase())
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}
