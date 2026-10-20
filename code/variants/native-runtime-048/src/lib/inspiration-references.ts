export type InspirationSource = "pinterest" | "manual_upload" | "url" | "competitor" | "figma" | "other"

export type InspirationUsage =
  | "photography"
  | "videography"
  | "graphic_design"
  | "social"
  | "content_planning"

export type InspirationReference = {
  id: string
  clientId: string
  title?: string
  source: InspirationSource
  folder: string
  imageUrl: string
  sourceUrl?: string
  notes?: string
  usage: InspirationUsage[]
  contentPillar?: string
  campaignSystem?: string
  compositionType?: string
  lightingStyle?: string
  emotionalTone?: string
  storyRole?: string
  feedRole?: string
  tags: string[]
  inspirationOnly: true
  createdAt: string
}

export const INSPIRATION_ASSET_CATEGORY = "pinterest_inspiration"

export const INSPIRATION_FOLDERS = [
  "Breakfast",
  "Lunch",
  "Drinks",
  "Lifestyle",
  "BTS / Service",
  "Flyers / Graphics",
  "Dinner",
  "Unsorted",
] as const

const LEGACY_FOLDER_ALIASES: Record<string, typeof INSPIRATION_FOLDERS[number]> = {
  "Business Lunch": "Lunch",
}

const RETIRED_FOLDERS = new Set([
  "Product Photography",
  "Michelin / Craftsmanship",
  "Third Culture / Nostalgia",
  "Atmosphere / Architecture",
])

export const INSPIRATION_SOURCES: InspirationSource[] = ["pinterest", "manual_upload", "url", "competitor", "figma", "other"]

export const INSPIRATION_USAGES: InspirationUsage[] = ["photography", "videography", "graphic_design", "social", "content_planning"]

export const INSPIRATION_COMPOSITION_TYPES = [
  "macro",
  "overhead",
  "45_degree",
  "editorial_centered",
  "asymmetrical",
  "wide_atmosphere",
  "hands_in_frame",
  "social_table",
  "chef_detail",
  "negative_space",
] as const

export const INSPIRATION_LIGHTING_STYLES = [
  "dark_cinematic",
  "warm_luxury",
  "golden_hour",
  "soft_daylight",
  "high_contrast",
  "spotlight_editorial",
] as const

export const INSPIRATION_EMOTIONAL_TONES = [
  "comfort",
  "nostalgia",
  "social",
  "luxury",
  "celebratory",
  "intimate",
  "energetic",
  "craftsmanship",
] as const

export const INSPIRATION_STORY_ROLES = ["hook", "detail", "hero", "transition", "closing", "atmosphere"] as const

export const INSPIRATION_FEED_ROLES = [
  "contrast_break",
  "dark_anchor",
  "light_reset",
  "typography_break",
  "social_energy",
  "product_focus",
  "campaign_focus",
] as const

type InspirationAssetLike = {
  id: string
  client_id?: string
  file_name: string
  asset_category: string | null
  file_path?: string | null
  uploaded_at?: string
  metadata?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

export function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean)
  if (typeof value === "string") return value.split(",").map(item => item.trim()).filter(Boolean)
  return []
}

export function isInspirationAsset(asset: { asset_category?: string | null }) {
  return (asset.asset_category ?? "").toLowerCase() === INSPIRATION_ASSET_CATEGORY
}

export function inspirationMetadata(asset: { metadata?: unknown }) {
  return isRecord(asset.metadata) ? asset.metadata : {}
}

export function inspirationTitle(asset: { file_name: string; metadata?: unknown }) {
  const metadata = inspirationMetadata(asset)
  return stringValue(metadata.title)
    || stringValue(metadata.pinTitle)
    || stringValue(metadata.name)
    || asset.file_name.replace(/\.[^.]+$/, "")
}

export function normalizeInspirationFolder(value: unknown) {
  const folder = typeof value === "string" && value.trim() ? value.trim() : "Unsorted"
  if (folder in LEGACY_FOLDER_ALIASES) return LEGACY_FOLDER_ALIASES[folder]
  if (RETIRED_FOLDERS.has(folder)) return "Unsorted"
  return INSPIRATION_FOLDERS.includes(folder as typeof INSPIRATION_FOLDERS[number])
    ? folder
    : "Unsorted"
}

export function inspirationFolder(asset: { metadata?: unknown }) {
  const metadata = inspirationMetadata(asset)
  return normalizeInspirationFolder(metadata.folder)
}

export function inspirationUsage(asset: { metadata?: unknown }) {
  const metadata = inspirationMetadata(asset)
  const usage = stringArrayValue(metadata.usage)
  return usage.length > 0 ? usage : ["photography", "videography", "graphic_design", "social", "content_planning"]
}

export function inspirationTags(asset: { metadata?: unknown }) {
  return stringArrayValue(inspirationMetadata(asset).tags)
}

export function inspirationReferenceFromAsset(asset: InspirationAssetLike, imageUrl = ""): InspirationReference {
  const metadata = inspirationMetadata(asset)
  return {
    id: asset.id,
    clientId: stringValue(metadata.clientId, asset.client_id ?? ""),
    title: inspirationTitle(asset),
    source: (stringValue(metadata.source, "manual_upload") as InspirationSource) || "manual_upload",
    folder: inspirationFolder(asset),
    imageUrl: imageUrl || stringValue(metadata.imageUrl) || asset.file_path || "",
    sourceUrl: stringValue(metadata.sourceUrl) || stringValue(metadata.source_url) || undefined,
    notes: stringValue(metadata.notes) || undefined,
    usage: inspirationUsage(asset) as InspirationUsage[],
    contentPillar: stringValue(metadata.contentPillar) || stringValue(metadata.content_pillar) || undefined,
    campaignSystem: stringValue(metadata.campaignSystem) || stringValue(metadata.campaign_system) || undefined,
    compositionType: stringValue(metadata.compositionType) || stringValue(metadata.composition_type) || undefined,
    lightingStyle: stringValue(metadata.lightingStyle) || stringValue(metadata.lighting_style) || undefined,
    emotionalTone: stringValue(metadata.emotionalTone) || stringValue(metadata.emotional_tone) || undefined,
    storyRole: stringValue(metadata.storyRole) || stringValue(metadata.story_role) || undefined,
    feedRole: stringValue(metadata.feedRole) || stringValue(metadata.feed_role) || undefined,
    tags: inspirationTags(asset),
    inspirationOnly: true,
    createdAt: stringValue(metadata.createdAt, asset.uploaded_at ?? new Date().toISOString()),
  }
}

export function folderSlug(folder: string) {
  return folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unsorted"
}

export function heuristicInspirationFields(input: {
  folder?: string
  title?: string
  notes?: string
  tags?: string[]
}) {
  const text = [input.folder, input.title, input.notes, ...(input.tags ?? [])].filter(Boolean).join(" ").toLowerCase()
  const includes = (words: string[]) => words.some(word => text.includes(word))
  return {
    compositionType:
      includes(["macro", "detail", "texture", "food", "dessert"]) ? "macro" :
      includes(["overhead", "flat", "table layout"]) ? "overhead" :
      includes(["hands", "service", "pour", "garnish"]) ? "hands_in_frame" :
      includes(["chef", "craft", "bts", "pass"]) ? "chef_detail" :
      includes(["lifestyle", "social", "people", "lunch", "dinner"]) ? "social_table" :
      includes(["architecture", "atmosphere", "interior", "wide"]) ? "wide_atmosphere" :
      includes(["flyer", "graphic", "typography", "negative"]) ? "negative_space" :
      "45_degree",
    lightingStyle:
      includes(["breakfast", "brunch", "morning", "daylight"]) ? "soft_daylight" :
      includes(["golden", "traffic", "sunset"]) ? "golden_hour" :
      includes(["dark", "night", "cocktail", "drinks"]) ? "dark_cinematic" :
      includes(["contrast", "shadow"]) ? "high_contrast" :
      includes(["spotlight", "editorial", "commercial"]) ? "spotlight_editorial" :
      "warm_luxury",
    emotionalTone:
      includes(["breakfast", "comfort", "home"]) ? "comfort" :
      includes(["nostalgia", "third culture", "heritage"]) ? "nostalgia" :
      includes(["social", "lifestyle", "table", "people", "lunch"]) ? "social" :
      includes(["event", "celebration", "eid"]) ? "celebratory" :
      includes(["craft", "chef", "bts", "service"]) ? "craftsmanship" :
      includes(["traffic", "cocktail", "drinks"]) ? "energetic" :
      includes(["dinner", "date", "intimate"]) ? "intimate" :
      "luxury",
    storyRole:
      includes(["atmosphere", "venue", "wide"]) ? "atmosphere" :
      includes(["detail", "macro", "hands", "bts"]) ? "detail" :
      includes(["closing", "end", "final"]) ? "closing" :
      includes(["hook", "cover"]) ? "hook" :
      includes(["transition", "pour", "motion"]) ? "transition" :
      "hero",
    feedRole:
      includes(["graphic", "flyer", "typography"]) ? "typography_break" :
      includes(["dark", "cocktail", "night"]) ? "dark_anchor" :
      includes(["breakfast", "daylight", "light"]) ? "light_reset" :
      includes(["social", "people", "table"]) ? "social_energy" :
      includes(["food", "drink", "product", "macro"]) ? "product_focus" :
      includes(["campaign", "traffic", "business lunch"]) ? "campaign_focus" :
      "contrast_break",
  }
}
