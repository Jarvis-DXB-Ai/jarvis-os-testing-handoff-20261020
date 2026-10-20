import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { MENU_SOURCE_OPTIONS, menuSourceLabel, resolveMenuSource } from "@/lib/menu-sources"
import {
  buildMenuIntelligenceIndex,
  deterministicFoodAssetRule,
  extractPdfTextWithPdftotext,
  findMenuEntryForDish,
  menuEntryToMetadata,
  type MenuEntry,
  type MenuMatchResult,
  type MenuSource,
} from "@/lib/menu-intelligence"
import { structuredMenuSourcesForClient } from "@/lib/democlientd-structured-menu-knowledge"

export const runtime = "nodejs"

type MetadataRegenerationRequest = {
  asset?: {
    id?: string
    client_id?: string | null
    file_name?: string
    asset_category?: string
    file_type?: string | null
    extracted_summary?: string | null
    metadata?: unknown
  }
  image_url?: string | null
  title?: string
  dish_name?: string
  menu_category?: string
  menu_source_id?: string | null
  menu_source_ids?: string[] | null
  menuSourceIds?: string[] | null
  tags?: string[]
  locked_fields?: string[]
}

const MAX_VISION_DIMENSION = 3000
const FOOD_METADATA_MENU_SOURCE_IDS = ["breakfast_menu", "business_lunch_menu", "a_la_carte_menu", "dessert_menu"]
type MenuMatchStatus = "menu_matched" | "ai_inferred" | "manual" | "no_menu_match"
const STORAGE_BUCKET = "client-assets"

type FoodClassificationSource = "claude_vision" | "title_fallback" | "unavailable"

type ImageFoodClassification = {
  visibleFoodType: string
  dishFamily: string
  mainVisualComponents: string[]
  vesselOrPlateType: string
  confidence: number
  source: FoodClassificationSource
  reasoning: string
}

type MetadataValidationStatus = "strong_match" | "needs_review" | "mismatch"

type MetadataValidation = {
  status: MetadataValidationStatus
  menuMatchConfidence: number
  imageValidationConfidence: number
  finalConfidence: number
  contradiction: boolean
  warning: string
  imageClassification: ImageFoodClassification
  menuDishFamily: string
  comparedMenuEntry?: {
    id: string
    dishName: string
    menuSourceName: string
    ingredients: string[]
    description: string
    price: string
  }
}

function extractText(content: unknown) {
  if (!Array.isArray(content)) return ""
  return content
    .filter((block): block is { type: "text"; text: string } => Boolean(block) && typeof block === "object" && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
}

function parseJson(text: string) {
  const jsonText = text.trim().startsWith("{") ? text.trim() : text.match(/\{[\s\S]*\}/)?.[0] ?? ""
  if (!jsonText) return null
  try {
    return JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeMenuCategory(value: unknown) {
  if (typeof value !== "string") return "A La Carte Menu"
  return resolveMenuSource(value)?.label ?? "A La Carte Menu"
}

function selectedMenuSourcesFromRequest(body: MetadataRegenerationRequest) {
  const rawIds = [
    ...(Array.isArray(body.menu_source_ids) ? body.menu_source_ids : []),
    ...(Array.isArray(body.menuSourceIds) ? body.menuSourceIds : []),
  ]
  if (rawIds.length === 0 && body.menu_source_id) rawIds.push(body.menu_source_id)
  const sources = Array.from(new Map(rawIds.map(value => resolveMenuSource(value)).filter(Boolean).map(source => [source!.id, source!])).values())
  const fallbackSingle = sources.length === 0 ? resolveMenuSource(body.menu_category) : null
  const finalSources = sources.length > 0 ? sources : fallbackSingle ? [fallbackSingle] : []
  return {
    ids: finalSources.map(source => source.id),
    labels: finalSources.map(source => source.label),
    primary: finalSources[0] ?? null,
  }
}

function requestLooksLikeDrink(body: MetadataRegenerationRequest) {
  const text = [
    body.title,
    body.dish_name,
    body.menu_category,
    body.asset?.file_name,
    body.asset?.asset_category,
    body.asset?.extracted_summary,
    JSON.stringify(body.asset?.metadata ?? {}),
    ...(body.tags ?? []),
  ].filter(Boolean).join(" ").toLowerCase()
  return /\b(drink|drinks|beverage|cocktail|mocktail|coffee|tea|juice|espresso martini|glassware|bar drink|studio drink|drink studio|studio_drink|drink_studio)\b/.test(text)
}

function requestLooksLikeInterior(body: MetadataRegenerationRequest) {
  const category = String(body.asset?.asset_category ?? "").toLowerCase().replace(/[\s-]+/g, "_")
  const role = metadataString(body.asset?.metadata, ["normalized_role", "asset_role", "role"]).toLowerCase()
  return category === "interiors" || category === "interior" || role === "venue_interior"
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean)
  if (typeof value === "string") return value.split(",").map(item => item.trim()).filter(Boolean)
  return []
}

function metadataString(metadata: unknown, keys: string[]) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" || typeof value === "boolean") return String(value)
  }
  return ""
}

function normalizeMenuIngredients(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean).join(", ")
  if (typeof value === "string") return value.trim()
  return ""
}

function joinCompact(values: unknown[]) {
  return Array.from(new Set(values.flatMap(value => {
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === "string") return value.split(",")
    if (typeof value === "number" || typeof value === "boolean") return [String(value)]
    return []
  }).map(item => item.trim()).filter(Boolean))).join(", ")
}

function readNestedRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const nested = record[key]
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : null
}

function buildInteriorFallbackMetadata(body: MetadataRegenerationRequest, reason = "Generated from existing metadata and venue spatial fields.") {
  const metadata = body.asset?.metadata && typeof body.asset.metadata === "object" && !Array.isArray(body.asset.metadata)
    ? body.asset.metadata as Record<string, unknown>
    : {}
  const spatial = (metadata.venueSpatialMetadata ?? metadata.venue_spatial_metadata) as Record<string, unknown> | undefined
  const architecture = readNestedRecord(spatial, "architecture")
  const seating = readNestedRecord(spatial, "seating")
  const lightingSpatial = readNestedRecord(spatial, "lighting")
  const layout = readNestedRecord(spatial, "layout")
  const zone = metadataString(metadata, ["zone", "area_zone", "venue_zone", "name", "title"])
    || (typeof spatial?.zoneName === "string" ? spatial.zoneName : "")
    || body.title
    || body.asset?.file_name
    || "Interior"
  const surface = metadataString(metadata, ["surface_table_truth", "surfaceTableTruth", "surface", "table_material"])
    || joinCompact([
      seating?.tableMaterials,
      seating?.tableShapes,
      seating?.tableEdgeDetails,
    ])
  const seatingTruth = metadataString(metadata, ["seating_truth", "seatingTruth", "seating", "seating_family"])
    || joinCompact([
      seating?.seatingFamily,
      seating?.chairColors,
      seating?.boothTypes,
    ])
  const keyMaterials = metadataString(metadata, ["key_materials", "keyMaterials", "materials", "material"])
    || joinCompact([
      architecture?.wallMaterials,
      architecture?.floorMaterials,
      seating?.tableMaterials,
    ])
  const lighting = metadataString(metadata, ["lighting"])
    || joinCompact([
      lightingSpatial?.lightingTemperature,
      architecture?.lightingFixtures,
      lightingSpatial?.chandelierStyle,
      lightingSpatial?.ambientDirection,
    ])
  const architectureFeatures = metadataString(metadata, ["architecture_spatial_features", "architectureSpatialFeatures", "features", "spatial_features"])
    || joinCompact([
      architecture?.ceilingType,
      architecture?.ceilingPattern,
      architecture?.mirrorUsage,
      layout?.focalAxis,
      layout?.circulationStyle,
    ])
  const doNotInvent = metadataString(metadata, ["do_not_invent", "doNotInvent"])
    || joinCompact([spatial?.preservationRules])
  const bestUse = metadataString(metadata, ["best_use", "bestUse", "usage", "usage_notes"])
    || "business lunch, cocktail scene, lifestyle, product photography background"
  const tags = normalizeStringArray(metadata.tags)
  return {
    areaZone: zone,
    area_zone: zone,
    zone,
    category: "Interior",
    asset_category: "interiors",
    surfaceTableTruth: surface,
    surface_table_truth: surface,
    seatingTruth,
    seating_truth: seatingTruth,
    keyMaterials,
    key_materials: keyMaterials,
    lighting,
    architectureSpatialFeatures: architectureFeatures,
    architecture_spatial_features: architectureFeatures,
    doNotInvent: doNotInvent,
    do_not_invent: doNotInvent,
    bestUse,
    best_use: bestUse,
    tags: tags.length > 0 ? tags : ["interior", "venue truth"],
    metadata_source: reason.includes("Claude") ? "ai_vision" : "existing_metadata",
    sourceStatus: reason.includes("Claude") ? "ai_inferred" : "manual",
    reasoning: reason,
  }
}

async function regenerateInteriorMetadata(body: MetadataRegenerationRequest, apiKey: string | undefined, model: string) {
  let visionPrep: Awaited<ReturnType<typeof prepareVisionImage>> = null
  if (body.image_url) {
    try {
      visionPrep = await prepareVisionImage(body.image_url, body.asset?.file_type)
    } catch {
      visionPrep = null
    }
  }
  const fallback = buildInteriorFallbackMetadata(body)
  if (!apiKey || !visionPrep) {
    return NextResponse.json({
      success: Boolean(apiKey),
      configured: Boolean(apiKey),
      provider: apiKey ? "existing_metadata" : "fallback",
      model: apiKey ? "no_image_available" : "anthropic_not_configured",
      proposed_metadata: fallback,
      reasoning: { summary: fallback.reasoning },
      image_processing: visionPrep
        ? {
            original_width: visionPrep.originalWidth,
            original_height: visionPrep.originalHeight,
            sent_width: visionPrep.sentWidth,
            sent_height: visionPrep.sentHeight,
            temporary_downsampled_for_vision: visionPrep.downsampled,
          }
        : null,
    })
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model,
      max_tokens: 800,
      temperature: 0.1,
      system: "You are Jarvis OS venue metadata analyst. Return concise valid JSON only. No long prompt paragraphs.",
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: visionPrep.mediaType,
              data: visionPrep.bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: JSON.stringify({
              task: "Extract simplified interior venue truth metadata for AI Photography. Keep each field concise and physically descriptive.",
              output_schema: {
                areaZone: "Main Bar | Lounge | Dining Room | Entrance | Private Dining | etc",
                category: "Interior",
                surfaceTableTruth: "exact visible table/counter/surface materials",
                seatingTruth: "exact visible seating/furniture family",
                keyMaterials: "short list of physical materials",
                lighting: "short lighting truth",
                architectureSpatialFeatures: "short visible architecture features only",
                doNotInvent: "one short negative rule sentence",
                bestUse: "short comma-separated use cases",
                tags: ["short searchable keyword"],
              },
              rules: [
                "Do not output food, drink, menu, composition, or prompt-engineering fields.",
                "Do not write long strict-negative dumps.",
                "Describe only concise visible cues: surfaces, seating, materials, lighting, architecture features, best use.",
                "Do not write prompt paragraphs or geometry instructions.",
                "If uncertain, say visible evidence only; do not invent brand-new architecture.",
              ],
              asset: body.asset,
              title: body.title,
              existing_metadata: body.asset?.metadata ?? {},
              fallback_metadata: fallback,
            }),
          },
        ] as never,
      }],
    })
    const parsed = parseJson(extractText(message.content))
    const proposed = parsed ? { ...fallback, ...parsed } : fallback
    return NextResponse.json({
      success: true,
      configured: true,
      provider: "anthropic",
      model,
      image_processing: {
        original_width: visionPrep.originalWidth,
        original_height: visionPrep.originalHeight,
        sent_width: visionPrep.sentWidth,
        sent_height: visionPrep.sentHeight,
        temporary_downsampled_for_vision: visionPrep.downsampled,
      },
      proposed_metadata: {
        ...proposed,
        category: "Interior",
        asset_category: "interiors",
        metadata_source: "ai_vision",
        sourceStatus: "ai_inferred",
      },
      reasoning: {
        summary: String((proposed as Record<string, unknown>).reasoning ?? "Concise interior venue truth metadata generated."),
      },
      raw_text: extractText(message.content),
    })
  } catch (error) {
    const proposed = buildInteriorFallbackMetadata(body, error instanceof Error ? error.message : "Claude interior metadata regeneration failed.")
    return NextResponse.json({
      success: false,
      configured: true,
      proposed_metadata: proposed,
      reasoning: { summary: proposed.reasoning },
      error: proposed.reasoning,
    })
  }
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function extractMenuSnippet(menuContext: string, dishName: string) {
  const query = normalizeForMatch(dishName)
  if (!menuContext.trim() || !query) return { status: "no_menu_match" as MenuMatchStatus, snippet: "" }

  const lines = menuContext
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
  const normalizedLines = lines.map(line => normalizeForMatch(line))
  const exactIndex = normalizedLines.findIndex(line => line.includes(query))
  const index = exactIndex >= 0
    ? exactIndex
    : normalizedLines.findIndex(line => {
        const words = query.split(" ").filter(word => word.length > 2)
        if (words.length === 0) return false
        const matches = words.filter(word => line.includes(word)).length
        return matches >= Math.max(1, Math.ceil(words.length * 0.75))
      })

  if (index < 0) return { status: "no_menu_match" as MenuMatchStatus, snippet: "" }
  const start = Math.max(0, index - 3)
  const end = Math.min(lines.length, index + 5)
  return {
    status: exactIndex >= 0 ? "menu_matched" as MenuMatchStatus : "menu_matched" as MenuMatchStatus,
    snippet: lines.slice(start, end).join("\n"),
  }
}

function conciseFallback(body: MetadataRegenerationRequest, reason: string) {
  const title = (body.dish_name || body.title || body.asset?.file_name || "").toString()
  const lower = title.toLowerCase()
  const isOyster = lower.includes("oyster")
  const isFruit = lower.includes("fruit")
  const isDrink = requestLooksLikeDrink(body)
  const dishName = body.dish_name || (isOyster ? "Emperor Oysters" : title)
  const selectedSources = selectedMenuSourcesFromRequest(body)
  const fallbackSource = selectedSources.primary ?? resolveMenuSource(isDrink ? "Beverage Menu" : isFruit ? "Breakfast Menu" : "A La Carte Menu")
  const fallbackIds = selectedSources.ids.length > 0 ? selectedSources.ids : fallbackSource ? [fallbackSource.id] : []
  const fallbackLabels = selectedSources.labels.length > 0 ? selectedSources.labels : fallbackSource ? [fallbackSource.label] : []
  return {
    success: false,
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    proposed_metadata: {
      dishName,
      ...(isDrink ? { drinkName: dishName, drink_name: dishName } : {}),
      menuCategory: fallbackLabels.join(" + ") || "A La Carte Menu",
      menuSourceId: fallbackIds[0] ?? "a_la_carte_menu",
      menu_source_id: fallbackIds[0] ?? "a_la_carte_menu",
      menuSourceIds: fallbackIds,
      menu_source_ids: fallbackIds,
      menuSourceName: fallbackLabels[0] ?? "A La Carte Menu",
      menu_source_name: fallbackLabels[0] ?? "A La Carte Menu",
      menuSourceLabels: fallbackLabels,
      menu_source_labels: fallbackLabels,
      menuIngredients: "Not listed on menu",
      menu_ingredients: "Not listed on menu",
      shortPlateDescription: isOyster
        ? "Fresh oyster dish; confirm exact garnish and serving detail against the DemoClientD menu before saving."
        : "Food asset metadata proposal based on the typed dish name and existing asset data. Confirm against the menu before saving.",
      shortDescription: isOyster
        ? "Fresh oyster dish; confirm exact garnish and serving detail against the DemoClientD menu before saving."
        : "Food asset metadata proposal based on the typed dish name and existing asset data. Confirm against the menu before saving.",
      ingredients: [],
      allergens: ["Not listed on menu"],
      menuDescription: "Not listed on menu",
      price: "Not listed on menu",
      tags: isDrink ? ["drink", "beverage", "drink truth"] : isOyster ? ["oysters", "seafood", "shellfish", "food truth"] : body.tags ?? [],
      ...(isDrink ? {
        glassType: metadataString(body.asset?.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]),
        glass_shape: metadataString(body.asset?.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]),
        glass: metadataString(body.asset?.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]),
        garnish: metadataString(body.asset?.metadata, ["garnish"]),
      } : {}),
      reasoning: reason,
      sourceStatus: "ai_inferred",
      warning: "Vision analysis was unavailable, so this fallback should be reviewed manually.",
    },
    reasoning: {
      summary: reason,
      uncertainty_warnings: ["Vision analysis was unavailable. Review before saving."],
    },
    error: reason,
  }
}

function serializeMenuDebug(match: MenuMatchResult) {
  return {
    searchedDishName: match.searchedDishName,
    selectedCategory: match.selectedCategory || "",
    selectedMenuSourceId: match.selectedMenuSourceId || "",
    selectedMenuSourceName: match.selectedMenuSourceName || "",
    selectedMenuSourceIds: match.selectedMenuSourceIds ?? [],
    selectedMenuSourceNames: match.selectedMenuSourceNames ?? [],
    fallbackToAllMenus: match.fallbackToAllMenus ?? false,
    menuEntriesSearched: match.entriesSearched,
    topMatches: match.topMatches.map(candidate => ({
      score: Number(candidate.score.toFixed(3)),
      reason: candidate.reason,
      dishName: candidate.entry.dishName,
      menuCategory: candidate.entry.category,
      menuSourceId: candidate.entry.menuSourceId,
      menuSourceName: candidate.entry.menuSourceName,
      menuName: candidate.entry.menuName,
      menuDescription: candidate.entry.description,
      ingredients: candidate.entry.ingredients,
      allergens: candidate.entry.allergens,
      price: candidate.entry.price ? (candidate.entry.price.toUpperCase().startsWith("AED") ? candidate.entry.price : `AED ${candidate.entry.price}`) : "Not listed on menu",
      source: candidate.entry.source,
      sourceFile: candidate.entry.sourceFile,
      sourceStatus: "menu_matched" as const,
      menuEntryId: candidate.entry.id,
    })),
    sourceFilesSearched: match.sourceFilesSearched,
    structuredMenuAvailable: match.structuredMenuAvailable,
  }
}

const DISH_FAMILY_PATTERNS: Array<{ family: string; patterns: RegExp[]; components: string[] }> = [
  { family: "burger", patterns: [/\bburger\b/i, /\bbun\b/i, /\bpatty\b/i, /\bslider\b/i, /\bsandwich format\b/i], components: ["burger bun", "patty", "sandwich format"] },
  { family: "rice_or_grain", patterns: [/\brice\b/i, /\bcouscous\b/i, /\brisotto\b/i, /\bgrain\b/i, /\bcoconut jus\b/i, /\bpistachio dukkha\b/i], components: ["rice or couscous", "sauce or jus"] },
  { family: "oyster_shellfish", patterns: [/\boyster/i, /\bshellfish\b/i, /\braw bar\b/i], components: ["oyster shells", "seafood"] },
  { family: "toast_or_bread", patterns: [/\bfrench toast\b/i, /\btoast\b/i, /\bsourdough\b/i, /\bbrioche\b/i, /\bcroissant\b/i, /\bbread\b/i], components: ["bread", "toast"] },
  { family: "egg_breakfast", patterns: [/\begg\b/i, /\beggs\b/i, /\bomelette\b/i, /\bbenedict\b/i, /\bshakshuka\b/i], components: ["eggs", "breakfast plate"] },
  { family: "pasta_or_noodle", patterns: [/\bpasta\b/i, /\bspaghetti\b/i, /\blinguine\b/i, /\bnoodle\b/i, /\bravioli\b/i], components: ["pasta or noodles"] },
  { family: "salad", patterns: [/\bsalad\b/i, /\blettuce\b/i, /\bleaves\b/i, /\bgreens\b/i], components: ["greens", "salad"] },
  { family: "steak_or_meat", patterns: [/\bsteak\b/i, /\bwagyu\b/i, /\bbeef\b/i, /\blamb\b/i, /\bribeye\b/i], components: ["meat", "protein"] },
  { family: "fish_or_seafood", patterns: [/\bsalmon\b/i, /\bfish\b/i, /\bsea bass\b/i, /\btuna\b/i, /\bseafood\b/i, /\bprawn\b/i, /\bshrimp\b/i, /\blobster\b/i, /\bcrab\b/i], components: ["seafood", "fish"] },
  { family: "dessert", patterns: [/\bdessert\b/i, /\bpudding\b/i, /\bcake\b/i, /\bchocolate\b/i, /\btiramisu\b/i, /\bice cream\b/i, /\bcheesecake\b/i], components: ["sweet dish", "dessert"] },
  { family: "drink", patterns: [/\bcocktail\b/i, /\bmocktail\b/i, /\bcoffee\b/i, /\btea\b/i, /\bjuice\b/i, /\bbeverage\b/i, /\bdrink\b/i], components: ["glass", "liquid"] },
]

function inferDishFamilyFromText(value: string) {
  const text = value.toLowerCase()
  const match = DISH_FAMILY_PATTERNS.find(item => item.patterns.some(pattern => pattern.test(text)))
  return match?.family ?? "unknown"
}

function componentsForFamily(family: string) {
  return DISH_FAMILY_PATTERNS.find(item => item.family === family)?.components ?? []
}

function inferDishFamilyFromMenuEntry(entry: MenuEntry) {
  const detailFamily = inferDishFamilyFromText([entry.description, entry.ingredients.join(" ")].join(" "))
  if (detailFamily !== "unknown") return detailFamily
  return inferDishFamilyFromText([entry.dishName, entry.category, entry.menuName].join(" "))
}

function menuEntryFamilyEvidence(entry: MenuEntry) {
  const nameFamily = inferDishFamilyFromText(entry.dishName)
  const detailFamily = inferDishFamilyFromText([entry.description, entry.ingredients.join(" ")].join(" "))
  const family = detailFamily !== "unknown" ? detailFamily : nameFamily
  const internallyInconsistent = nameFamily !== "unknown"
    && detailFamily !== "unknown"
    && !compatibleDishFamilies(nameFamily, detailFamily)
  return { nameFamily, detailFamily, family, internallyInconsistent }
}

function compatibleDishFamilies(left: string, right: string) {
  if (!left || !right || left === "unknown" || right === "unknown") return true
  if (left === right) return true
  const seafood = new Set(["oyster_shellfish", "fish_or_seafood"])
  if (seafood.has(left) && seafood.has(right)) return true
  return false
}

function titleFallbackClassification(body: MetadataRegenerationRequest, confirmedDishName: string): ImageFoodClassification {
  const text = [
    confirmedDishName,
    body.title,
    body.asset?.file_name,
    body.asset?.asset_category,
    body.asset?.extracted_summary,
    JSON.stringify(body.asset?.metadata ?? {}),
    ...(body.tags ?? []),
  ].filter(Boolean).join(" ")
  const family = inferDishFamilyFromText(text)
  return {
    visibleFoodType: confirmedDishName || body.title || body.asset?.file_name || "Unknown food asset",
    dishFamily: family,
    mainVisualComponents: componentsForFamily(family),
    vesselOrPlateType: "Not confirmed by image",
    confidence: family === "unknown" ? 0.18 : 0.58,
    source: family === "unknown" ? "unavailable" : "title_fallback",
    reasoning: family === "unknown"
      ? "No reliable image classification was available."
      : "Image classification used typed dish name/title as a fallback because vision was unavailable or inconclusive.",
  }
}

async function classifyFoodImageForValidation({
  apiKey,
  model,
  visionPrep,
  body,
  confirmedDishName,
}: {
  apiKey?: string
  model: string
  visionPrep: Awaited<ReturnType<typeof prepareVisionImage>>
  body: MetadataRegenerationRequest
  confirmedDishName: string
}): Promise<ImageFoodClassification> {
  const fallback = titleFallbackClassification(body, confirmedDishName)
  if (!apiKey || !visionPrep) return fallback

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model,
      max_tokens: 420,
      temperature: 0,
      system: "Classify visible food or drink for metadata validation. Return compact valid JSON only.",
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: visionPrep.mediaType,
              data: visionPrep.bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: JSON.stringify({
              task: "Sanity-classify the visible food or drink. Do not identify the menu item unless visible. Return only JSON.",
              user_dish_name: confirmedDishName,
              schema: {
                visibleFoodType: "short visible food/drink name, e.g. burger, oysters, rice bowl, cocktail, coffee",
                dishFamily: "burger | rice_or_grain | oyster_shellfish | toast_or_bread | egg_breakfast | pasta_or_noodle | salad | steak_or_meat | fish_or_seafood | dessert | drink | unknown",
                mainVisualComponents: ["visible component"],
                vesselOrPlateType: "plate/bowl/glass/shell/bun/tray/etc",
                confidence: "0-1 number",
                reasoning: "one short sentence",
              },
            }),
          },
        ] as never,
      }],
    })
    const parsed = parseJson(extractText(message.content))
    if (!parsed) return fallback
    const parsedComponentsText = Array.isArray(parsed.mainVisualComponents) ? parsed.mainVisualComponents.join(" ") : String(parsed.mainVisualComponents ?? "")
    const family = typeof parsed.dishFamily === "string" ? parsed.dishFamily : inferDishFamilyFromText(`${parsed.visibleFoodType ?? ""} ${parsedComponentsText}`)
    const normalizedFamily = DISH_FAMILY_PATTERNS.some(item => item.family === family) ? family : fallback.dishFamily
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)))
    return {
      visibleFoodType: String(parsed.visibleFoodType ?? fallback.visibleFoodType),
      dishFamily: normalizedFamily || "unknown",
      mainVisualComponents: normalizeStringArray(parsed.mainVisualComponents).length ? normalizeStringArray(parsed.mainVisualComponents) : fallback.mainVisualComponents,
      vesselOrPlateType: String(parsed.vesselOrPlateType ?? parsed.vessel ?? fallback.vesselOrPlateType),
      confidence: confidence || fallback.confidence,
      source: "claude_vision",
      reasoning: String(parsed.reasoning ?? "Image sanity classification completed."),
    }
  } catch {
    return fallback
  }
}

function menuMatchConfidence(match: MenuMatchResult, entry: MenuEntry) {
  return match.topMatches.find(candidate => candidate.entry.id === entry.id)?.score ?? entry.confidence ?? 0.72
}

function validateMenuEntryAgainstImage(match: MenuMatchResult, entry: MenuEntry, imageClassification: ImageFoodClassification): MetadataValidation {
  const menuEvidence = menuEntryFamilyEvidence(entry)
  const menuFamily = menuEvidence.family
  const matchConfidence = menuMatchConfidence(match, entry)
  const imageConfidence = imageClassification.confidence
  const contradiction = Boolean(
    menuEvidence.internallyInconsistent
    || imageClassification.dishFamily !== "unknown"
    && menuFamily !== "unknown"
    && !compatibleDishFamilies(imageClassification.dishFamily, menuFamily)
  )
  const baseConfidence = (matchConfidence * 0.58) + (imageConfidence * 0.42)
  const finalConfidence = contradiction ? Math.min(0.32, baseConfidence * 0.42) : baseConfidence
  const lowConfidence = finalConfidence < 0.62 || imageConfidence < 0.35
  const status: MetadataValidationStatus = contradiction
    ? "mismatch"
    : lowConfidence
      ? "needs_review"
      : "strong_match"
  const warning = contradiction
    ? menuEvidence.internallyInconsistent
      ? `Potential mismatch detected. The matched menu item is named ${entry.dishName}, but its menu description/ingredients read like ${menuEvidence.detailFamily.replace(/_/g, " ")}. Image appears to be ${imageClassification.visibleFoodType || imageClassification.dishFamily}. Please review manually before applying.`
      : `Potential mismatch detected. Image appears to be ${imageClassification.visibleFoodType || imageClassification.dishFamily}, but the matched menu entry reads like ${entry.dishName} (${menuFamily.replace(/_/g, " ")}). Please review manually before applying.`
    : lowConfidence
      ? "Menu match needs review because image validation confidence is not strong enough."
      : ""

  return {
    status,
    menuMatchConfidence: Number(matchConfidence.toFixed(3)),
    imageValidationConfidence: Number(imageConfidence.toFixed(3)),
    finalConfidence: Number(finalConfidence.toFixed(3)),
    contradiction,
    warning,
    imageClassification,
    menuDishFamily: menuFamily,
    comparedMenuEntry: {
      id: entry.id,
      dishName: entry.dishName,
      menuSourceName: entry.menuSourceName || entry.menuName,
      ingredients: entry.ingredients,
      description: entry.description,
      price: entry.price ? (entry.price.toUpperCase().startsWith("AED") ? entry.price : `AED ${entry.price}`) : "Not listed on menu",
    },
  }
}

function noMenuValidation(imageClassification: ImageFoodClassification, warning = "No menu match found for this dish name. Please confirm spelling or upload menu data."): MetadataValidation {
  return {
    status: "needs_review",
    menuMatchConfidence: 0,
    imageValidationConfidence: Number(imageClassification.confidence.toFixed(3)),
    finalConfidence: Number(Math.min(0.5, imageClassification.confidence * 0.7).toFixed(3)),
    contradiction: false,
    warning,
    imageClassification,
    menuDishFamily: "unknown",
  }
}

function rejectedMenuMatches(metadata: unknown) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  const items = Array.isArray(record.wrong_menu_match_memory) ? record.wrong_menu_match_memory : []
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const entry = item as Record<string, unknown>
    const id = String(entry.wrongMenuEntryId ?? entry.wrong_menu_entry_id ?? entry.menuEntryId ?? "").trim()
    const name = String(entry.wrongMatch ?? entry.wrong_match ?? entry.dishName ?? "").trim()
    if (id) ids.add(id)
    if (name) names.add(normalizeForMatch(name))
  }
  return { ids, names }
}

async function fetchMenuIntelligence(clientId?: string | null) {
  if (!clientId || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const structuredSources = structuredMenuSourcesForClient(clientId)
    return {
      text: structuredSources.map(source => `${source.menuSourceName || source.menuName}\n${source.text}`).join("\n\n").slice(0, 16000),
      sourceCount: structuredSources.length,
      entries: buildMenuIntelligenceIndex(structuredSources),
      sources: structuredSources,
    }
  }
  try {
    const structuredSources = structuredMenuSourcesForClient(clientId)
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    const { data: brainRows } = await supabase
      .from("client_brain")
      .select("question_key, question_text, answer")
      .eq("client_id", clientId)
      .limit(100)

    const { data: assetRows } = await supabase
      .from("asset_uploads")
      .select("file_name, asset_category, file_path, file_type, extracted_summary, metadata")
      .eq("client_id", clientId)
      .in("asset_category", ["pdf_menu", "offer_flyer", "menus", "design_menus"])
      .limit(200)

    const menuNeedle = /\b(menu|breakfast|lunch|dinner|dessert|drink|cocktail|traffic hours|à la carte|a la carte|aed|price|allergen|ingredient)\b/i
    const sources: MenuSource[] = [...structuredSources]
    const structuredText = structuredSources.map(source => `Structured text menu document: ${source.sourceFile}\n${source.text}`)

    const brainText = (brainRows ?? [])
      .filter(row => menuNeedle.test(`${row.question_key ?? ""} ${row.question_text ?? ""} ${row.answer ?? ""}`))
      .map(row => {
        const text = `${row.question_text ?? row.question_key}: ${row.answer ?? ""}`
        const menuSource = resolveMenuSource(`${row.question_text ?? ""} ${row.question_key ?? ""}`)
        sources.push({
          clientId,
          menuName: row.question_text ?? row.question_key ?? "Client Brain menu",
          menuSourceId: menuSource?.id ?? null,
          menuSourceName: menuSource?.label,
          source: "client_brain",
          sourceFile: row.question_key ?? "client_brain",
          text,
        })
        return text
      })

    const assetText: string[] = []
    for (const row of assetRows ?? []) {
      const fallbackText = `${row.extracted_summary ?? ""}\n${JSON.stringify(row.metadata ?? {})}`
      let text = fallbackText
      if (row.file_path && String(row.file_type ?? "").includes("pdf")) {
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(row.file_path)
        if (!error && data) {
          const buffer = Buffer.from(await data.arrayBuffer())
          const pdfText = await extractPdfTextWithPdftotext(buffer)
          if (pdfText.trim()) text = pdfText
        }
      }
      if (!menuNeedle.test(`${row.file_name ?? ""} ${row.asset_category ?? ""} ${text}`)) continue
      const menuName = row.file_name?.replace(/---[a-f0-9-]{36}/i, "").replace(/\.[^.]+$/, "") || "Uploaded menu"
      const source = row.asset_category === "pdf_menu" || row.asset_category === "design_menus" ? "menu_pdf" as const : "manual" as const
      const menuSource = resolveMenuSource(`${menuName} ${row.file_name ?? ""} ${row.extracted_summary ?? ""}`)
      sources.push({
        clientId,
        menuName,
        menuSourceId: menuSource?.id ?? null,
        menuSourceName: menuSource?.label,
        category: menuName,
        source,
        sourceFile: row.file_name,
        text,
      })
      assetText.push(`Uploaded menu/source asset: ${row.file_name}\n${text}`)
    }

    const entries = [...structuredText, ...brainText, ...assetText].filter(Boolean)
    const menuEntries = buildMenuIntelligenceIndex(sources)

    return {
      text: entries.join("\n\n").slice(0, 16000),
      sourceCount: entries.length,
      entries: menuEntries,
      sources,
    }
  } catch {
    return { text: "", sourceCount: 0, entries: [] as MenuEntry[], sources: [] as MenuSource[] }
  }
}

async function prepareVisionImage(imageUrl: string, fallbackMediaType?: string | null) {
  const response = await fetch(imageUrl)
  if (!response.ok) return null

  const sourceMediaType = response.headers.get("content-type") || fallbackMediaType || "image/jpeg"
  const input = Buffer.from(await response.arrayBuffer())
  const source = sharp(input, { limitInputPixels: false }).rotate()
  const sourceMetadata = await source.metadata()
  const width = sourceMetadata.width ?? 0
  const height = sourceMetadata.height ?? 0
  const needsResize = Math.max(width, height) > MAX_VISION_DIMENSION || !["image/jpeg", "image/png", "image/webp"].includes(sourceMediaType)

  if (!needsResize) {
    return {
      mediaType: sourceMediaType,
      bytes: input,
      originalWidth: width,
      originalHeight: height,
      sentWidth: width,
      sentHeight: height,
      downsampled: false,
    }
  }

  const resized = await sharp(input, { limitInputPixels: false })
    .rotate()
    .resize({ width: MAX_VISION_DIMENSION, height: MAX_VISION_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
  const sentMetadata = await sharp(resized).metadata()

  return {
    mediaType: "image/jpeg",
    bytes: resized,
    originalWidth: width,
    originalHeight: height,
    sentWidth: sentMetadata.width ?? 0,
    sentHeight: sentMetadata.height ?? 0,
    downsampled: true,
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as MetadataRegenerationRequest | null
  if (!body?.asset?.id) {
    return NextResponse.json({ success: false, error: "Missing asset for metadata regeneration." }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
  if (requestLooksLikeInterior(body)) {
    return regenerateInteriorMetadata(body, apiKey, model)
  }
  const menuContext = await fetchMenuIntelligence(body.asset.client_id)
  const lockedDishName = body.locked_fields?.includes("dish_name") ?? false
  const confirmedDishName = (body.dish_name || body.title || body.asset.file_name || "").trim()
  const selectedMenuSources = selectedMenuSourcesFromRequest(body)
  const selectedMenuSource = selectedMenuSources.primary
  const isDrinkRequest = requestLooksLikeDrink(body)
  const matchingMenuSourceIds = isDrinkRequest
    ? Array.from(new Set([...selectedMenuSources.ids, "beverage_menu", "wine_spirits_menu"]))
    : selectedMenuSources.ids.length > 0
      ? selectedMenuSources.ids
      : FOOD_METADATA_MENU_SOURCE_IDS
  const matchingMenuSourceLabels = matchingMenuSourceIds.map(id => resolveMenuSource(id)?.label).filter(Boolean) as string[]
  const rejectedMatches = rejectedMenuMatches(body.asset.metadata)
  const eligibleMenuEntries = menuContext.entries.filter(entry => !rejectedMatches.ids.has(entry.id) && !rejectedMatches.names.has(normalizeForMatch(entry.dishName)))
  const menuEntriesForMatching = eligibleMenuEntries.length > 0 ? eligibleMenuEntries : menuContext.entries
  const menuMatch = findMenuEntryForDish(menuEntriesForMatching, confirmedDishName, {
    category: body.menu_category,
    menuSourceIds: matchingMenuSourceIds,
  })

  if (menuMatch.entry) {
    const imageClassification = titleFallbackClassification(body, confirmedDishName)
    const proposedMetadata = menuEntryToMetadata(menuMatch.entry)
    const validation = validateMenuEntryAgainstImage(menuMatch, menuMatch.entry, imageClassification)
    const proposedName = lockedDishName ? confirmedDishName : proposedMetadata.dishName
    const existingGlassType = metadataString(body.asset.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"])
    const existingGarnish = metadataString(body.asset.metadata, ["garnish"])
    return NextResponse.json({
      success: true,
      configured: Boolean(apiKey),
      provider: "menu_intelligence_index",
      model: "deterministic_menu_match",
      image_processing: null,
      vision_used: false,
      menu_context_available: Boolean(menuContext.text),
      menu_match_status_before_ai: "menu_matched",
      proposed_metadata: {
        ...proposedMetadata,
        dishName: proposedName,
        ...(isDrinkRequest ? {
          drinkName: proposedName,
          drink_name: proposedName,
          glassType: existingGlassType || (validation.imageClassification.vesselOrPlateType !== "Not confirmed by image" ? validation.imageClassification.vesselOrPlateType : ""),
          glass_shape: existingGlassType || (validation.imageClassification.vesselOrPlateType !== "Not confirmed by image" ? validation.imageClassification.vesselOrPlateType : ""),
          glass: existingGlassType || (validation.imageClassification.vesselOrPlateType !== "Not confirmed by image" ? validation.imageClassification.vesselOrPlateType : ""),
          garnish: existingGarnish,
        } : {}),
        menuSourceIds: [menuMatch.entry.menuSourceId].filter(Boolean),
        menu_source_ids: [menuMatch.entry.menuSourceId].filter(Boolean),
        menuSourceLabels: [menuMatch.entry.menuSourceName].filter(Boolean),
        menu_source_labels: [menuMatch.entry.menuSourceName].filter(Boolean),
        warning: validation.warning || proposedMetadata.warning,
        validationStatus: validation.status,
        validation_status: validation.status,
        menuMatchConfidence: validation.menuMatchConfidence,
        imageValidationConfidence: validation.imageValidationConfidence,
        finalConfidence: validation.finalConfidence,
        contradictionDetected: validation.contradiction,
        imageFoodType: validation.imageClassification.visibleFoodType,
        imageDishFamily: validation.imageClassification.dishFamily,
        menuDishFamily: validation.menuDishFamily,
      },
      validation,
      menu_debug: serializeMenuDebug(menuMatch),
      reasoning: {
        summary: validation.contradiction
          ? validation.warning
          : `Matched ${menuMatch.entry.dishName} in ${menuMatch.entry.menuSourceName || menuMatch.entry.sourceFile || menuMatch.entry.menuName}; image sanity status: ${validation.status}.`,
        uncertainty_warnings: [
          ...(menuMatch.entry.allergens.length === 0 ? ["Allergens are not listed on the matched menu entry."] : []),
          ...(validation.warning ? [validation.warning] : []),
        ],
      },
      raw_text: "",
    })
  }

  if (menuContext.entries.length > 0) {
    const fallbackName = confirmedDishName || body.asset.file_name || ""
    const deterministicRule = isDrinkRequest ? null : deterministicFoodAssetRule(fallbackName)
    if (deterministicRule) {
      return NextResponse.json({
        success: true,
        configured: Boolean(apiKey),
        provider: "menu_intelligence_index",
        model: `deterministic_${deterministicRule.kind}`,
        image_processing: null,
        vision_used: false,
        menu_context_available: true,
        menu_match_status_before_ai: deterministicRule.sourceStatus === "manual" ? "manual" : "no_menu_match",
        proposed_metadata: {
          dishName: deterministicRule.dishName,
          menuCategory: deterministicRule.menuSourceName,
          menuSourceId: deterministicRule.menuSourceId,
          menu_source_id: deterministicRule.menuSourceId,
          menuSourceIds: deterministicRule.menuSourceId ? [deterministicRule.menuSourceId] : [],
          menu_source_ids: deterministicRule.menuSourceId ? [deterministicRule.menuSourceId] : [],
          menuSourceName: deterministicRule.menuSourceName,
          menu_source_name: deterministicRule.menuSourceName,
          menuSourceLabels: deterministicRule.menuSources,
          menu_source_labels: deterministicRule.menuSources,
          price: deterministicRule.price,
          menuIngredients: deterministicRule.menuIngredients,
          menu_ingredients: deterministicRule.menuIngredients,
          menuDescription: deterministicRule.menuIngredients,
          ingredients: [],
          allergens: deterministicRule.allergens,
          tags: deterministicRule.tags,
          sourceStatus: deterministicRule.sourceStatus,
          deterministicRule: deterministicRule.kind,
          confidence: deterministicRule.confidence,
          reasoning: deterministicRule.reason,
          warning: deterministicRule.warning,
        },
        validation: noMenuValidation(titleFallbackClassification(body, confirmedDishName), deterministicRule.warning),
        menu_debug: serializeMenuDebug(menuMatch),
        reasoning: {
          summary: deterministicRule.reason,
          uncertainty_warnings: [deterministicRule.warning],
        },
        raw_text: "",
      })
    }

    return NextResponse.json({
      success: true,
      configured: Boolean(apiKey),
      provider: "menu_intelligence_index",
      model: "deterministic_structured_menu_no_match",
      image_processing: null,
      vision_used: false,
      menu_context_available: true,
      menu_match_status_before_ai: "no_menu_match",
      proposed_metadata: {
        dishName: fallbackName,
        ...(isDrinkRequest ? { drinkName: fallbackName, drink_name: fallbackName } : {}),
        menuCategory: matchingMenuSourceLabels.join(" + ") || selectedMenuSources.labels.join(" + ") || "Not listed in structured menu source",
        menuSourceId: matchingMenuSourceIds[0] ?? selectedMenuSources.ids[0] ?? null,
        menu_source_id: matchingMenuSourceIds[0] ?? selectedMenuSources.ids[0] ?? null,
        menuSourceIds: matchingMenuSourceIds,
        menu_source_ids: matchingMenuSourceIds,
        menuSourceName: matchingMenuSourceLabels[0] ?? selectedMenuSources.labels[0] ?? "",
        menu_source_name: matchingMenuSourceLabels[0] ?? selectedMenuSources.labels[0] ?? "",
        menuSourceLabels: matchingMenuSourceLabels,
        menu_source_labels: matchingMenuSourceLabels,
        price: "Not listed in structured menu source",
        menuIngredients: "Not listed in structured menu source",
        menu_ingredients: "Not listed in structured menu source",
        menuDescription: "Not listed in structured menu source",
        ingredients: [],
        allergens: ["Not listed in structured menu source"],
        ...(isDrinkRequest ? {
          glassType: metadataString(body.asset.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]),
          glass_shape: metadataString(body.asset.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]),
          glass: metadataString(body.asset.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]),
          garnish: metadataString(body.asset.metadata, ["garnish"]),
        } : {}),
        tags: body.tags ?? [],
        sourceStatus: "no_menu_match",
        reasoning: "No structured text menu entry matched the typed name. Closest menu matches are shown for manual review.",
        warning: "Not listed in structured menu source",
      },
      validation: noMenuValidation(titleFallbackClassification(body, confirmedDishName), "Not listed in structured menu source"),
      menu_debug: serializeMenuDebug(menuMatch),
      reasoning: {
        summary: "No structured text menu entry matched the typed name. No Claude Vision/OCR was used.",
        uncertainty_warnings: ["Not listed in structured menu source"],
      },
      raw_text: "",
    })
  }

  const content: Array<Record<string, unknown>> = []
  let visionPrep: Awaited<ReturnType<typeof prepareVisionImage>> = null

  if (body.image_url) {
    try {
      visionPrep = await prepareVisionImage(body.image_url, body.asset.file_type)
      if (visionPrep) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: visionPrep.mediaType,
            data: visionPrep.bytes.toString("base64"),
          },
        })
      }
    } catch {
      // Continue with title/menu validation rather than failing the editor.
    }
  }
  const imageClassification = await classifyFoodImageForValidation({ apiKey, model, visionPrep, body, confirmedDishName })

  if (!apiKey) {
    const fallback = conciseFallback(body, "ANTHROPIC_API_KEY is not configured.")
    const validation = noMenuValidation(imageClassification)
    return NextResponse.json({
      ...fallback,
      validation,
      proposed_metadata: {
        ...fallback.proposed_metadata,
        validationStatus: validation.status,
        validation_status: validation.status,
        imageFoodType: validation.imageClassification.visibleFoodType,
        imageDishFamily: validation.imageClassification.dishFamily,
      },
      menu_context_available: Boolean(menuContext.text),
      menu_match_status_before_ai: menuMatch.status,
      menu_debug: serializeMenuDebug(menuMatch),
    })
  }

  content.push({
    type: "text",
    text: JSON.stringify({
      task: `Generate concise practical ${isDrinkRequest ? "drink" : "food"} metadata for this DemoClientD Dubai asset. Return JSON only.`,
      output_schema: {
        dishName: "string",
        ...(isDrinkRequest ? { drinkName: "string" } : {}),
        menuCategory: "Breakfast Menu | Business Lunch Menu | Dubai Restaurant Week Lunch Menu | Dubai Restaurant Week Dinner Menu | A La Carte Menu | Dessert Menu | Beverage Menu | Wine & Spirits Menu",
        menuSourceId: "breakfast_menu | business_lunch_menu | dubai_restaurant_week_lunch_menu | dubai_restaurant_week_dinner_menu | a_la_carte_menu | dessert_menu | beverage_menu | wine_spirits_menu",
        menuSourceIds: ["array of selected menu source ids searched, or [] for all menus"],
        price: "AED amount or Not listed on menu",
        menuIngredients: "exact menu ingredient wording only, or Not listed on menu",
        allergens: ["string"],
        ...(isDrinkRequest ? { glassType: "glass type if visible or stored, otherwise empty string", garnish: "garnish if visible/listed/stored, otherwise empty string" } : {}),
        shortPlateDescription: "1-2 clean sentences maximum using the menu ingredients",
        tags: ["string"],
        sourceStatus: "menu_matched | ai_inferred | manual | no_menu_match",
        reasoning: "short optional sentence",
        warning: "optional conflict warning",
      },
      source_priority: [
        "Structured text menu docs from Context > Reference Library > Menu Knowledge Base",
        "Existing structured menu entries",
        "Existing asset metadata",
        "Image vision as validation only",
        "Claude Vision fallback only if no structured menu match exists",
      ],
      locked_dish_name: lockedDishName,
      confirmed_dish_name: confirmedDishName,
      selected_menu_category: body.menu_category,
      selected_menu_source_id: selectedMenuSource?.id || null,
      selected_menu_source_name: selectedMenuSource?.label || null,
      selected_menu_source_ids: matchingMenuSourceIds,
      selected_menu_source_names: matchingMenuSourceLabels,
      available_menu_sources: MENU_SOURCE_OPTIONS.map(option => ({ id: option.id, label: option.label })),
      menu_match_status_before_ai: menuMatch.status,
      menu_intelligence_debug: serializeMenuDebug(menuMatch),
      menu_context: menuContext.text || "No uploaded menu/menu PDF context was found for this client request.",
      menu_source_count: menuContext.sourceCount,
      structured_menu_entry_count: menuContext.entries.length,
      image_sanity_classification: imageClassification,
      asset: body.asset,
      user_title: body.title,
      user_dish_name: body.dish_name,
      existing_tags: body.tags,
      locked_fields: body.locked_fields ?? [],
      image_processing: visionPrep
        ? {
            original_dimensions: `${visionPrep.originalWidth}x${visionPrep.originalHeight}`,
            sent_dimensions: `${visionPrep.sentWidth}x${visionPrep.sentHeight}`,
            temporary_downsampled_for_vision: visionPrep.downsampled,
          }
        : { image_available: false },
      rules: [
        "Return only the concise schema, not long metadata dumps.",
        `If locked_dish_name is true, ${isDrinkRequest ? "drinkName and dishName" : "dishName"} must exactly equal confirmed_dish_name. Never rename it from image vision.`,
        "Use confirmed_dish_name as the menu search key. Exact menu match first, then fuzzy match / aliases.",
        "Structured text menu docs are primary. Existing structured menu entries are secondary. Existing asset metadata is tertiary.",
        "If selected_menu_source_ids is non-empty, search those selected menus first. If no selected menu matches, return no_menu_match and use all-menu closest matches only as fallback suggestions.",
        "Do not use PDF OCR or Claude Vision when a structured text menu match exists.",
        "If a menu match is found, menuCategory, menuIngredients, allergens, and price must come from menu wording wherever available.",
        "menuCategory must be one of the real menu source labels, not generic meal periods.",
        "menuIngredients must contain only the exact menu ingredient wording or concise parsed ingredients from the menu. Do not put a polished dish description in menuIngredients.",
        "shortPlateDescription is separate from menuIngredients and should be 1-2 nice sentences explaining the dish using the menu ingredients.",
        "If menu_intelligence_debug includes close matches, use them only if clearly the same dish; otherwise return no_menu_match.",
        "Compare any menu match against image_sanity_classification. If visible food type/dish family contradicts the menu entry, return sourceStatus no_menu_match or warning rather than treating the menu entry as truth.",
        "If no menu match is found, set sourceStatus to no_menu_match and warning to: No menu match found for this dish name. Please confirm spelling or upload menu data.",
        "If no menu match is found, set menuIngredients to 'Not listed on menu' rather than inventing ingredients from image vision.",
        "If menu does not list allergens, set allergens to ['Not listed on menu'] rather than guessing.",
        "If menu does not list price, set price to 'Not listed on menu' rather than guessing.",
        "Keep shortPlateDescription to 1-2 sentences.",
        "Use image vision only to confirm that the image plausibly matches the dish name. Do not let image vision override a locked dish name.",
        ...(isDrinkRequest ? [
          "For drinks, Beverage Menu and Wine & Spirits Menu should be treated as the natural priority.",
          "For drinks, return glassType and garnish only when visible, stored, or menu-supported; otherwise leave them empty rather than inventing.",
        ] : []),
        "Do not overwrite locked fields; note conflicts in warning.",
      ],
    }),
  })

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model,
      max_tokens: 900,
      temperature: 0.1,
      system: "You are Jarvis OS food metadata analyst for luxury hospitality assets. Return valid compact JSON only. No prose outside JSON.",
      messages: [{ role: "user", content: content as never }],
    })
    const rawText = extractText(message.content)
    const parsed = parseJson(rawText)
    if (!parsed) {
      return NextResponse.json(conciseFallback(body, "Claude returned non-JSON metadata."))
    }

    const proposed = "proposed_metadata" in parsed && typeof parsed.proposed_metadata === "object"
      ? parsed.proposed_metadata as Record<string, unknown>
      : parsed
    const proposedSourceStatus = (["menu_matched", "ai_inferred", "manual", "no_menu_match"].includes(String(proposed.sourceStatus ?? proposed.source_status)) ? String(proposed.sourceStatus ?? proposed.source_status) : menuMatch.status) as MenuMatchStatus
    const rawMenuIngredients = normalizeMenuIngredients(
      proposed.menuIngredients
        ?? proposed.menu_ingredients
        ?? (proposedSourceStatus === "menu_matched" ? proposed.ingredients : undefined)
        ?? proposed.menuDescription
        ?? proposed.menu_description
    )
    const menuIngredients = proposedSourceStatus === "menu_matched" && rawMenuIngredients ? rawMenuIngredients : "Not listed on menu"
    const shortPlateDescription = String(proposed.shortPlateDescription ?? proposed.short_plate_description ?? proposed.shortDescription ?? proposed.short_description ?? proposed.description ?? "")
    const proposedMenuSource = resolveMenuSource(String(proposed.menuSourceId ?? proposed.menu_source_id ?? proposed.menuCategory ?? proposed.menu_category ?? selectedMenuSource?.id ?? ""))
    const proposedDishName = String(proposed.dishName ?? proposed.dish_name ?? body.dish_name ?? body.title ?? "")
    const proposedDrinkName = String(proposed.drinkName ?? proposed.drink_name ?? proposedDishName)
    const proposedGlassType = String(proposed.glassType ?? proposed.glass_type ?? proposed.glass_shape ?? proposed.glass ?? proposed.vessel ?? metadataString(body.asset.metadata, ["glassType", "glass_type", "glass_shape", "glass", "vessel"]) ?? "")
    const proposedGarnish = String(proposed.garnish ?? metadataString(body.asset.metadata, ["garnish"]) ?? "")
    const proposedMenuMatch = proposedSourceStatus === "menu_matched"
      ? findMenuEntryForDish(menuEntriesForMatching, proposedDishName || confirmedDishName, {
          category: String(proposed.menuCategory ?? proposed.menu_category ?? body.menu_category ?? ""),
          menuSourceIds: matchingMenuSourceIds.length > 0 ? matchingMenuSourceIds : proposedMenuSource?.id ? [proposedMenuSource.id] : [],
        })
      : menuMatch
    const validation = proposedMenuMatch.entry
      ? validateMenuEntryAgainstImage(proposedMenuMatch, proposedMenuMatch.entry, imageClassification)
      : noMenuValidation(
          imageClassification,
          proposedSourceStatus === "no_menu_match"
            ? "No menu match found for this dish name. Please confirm spelling or upload menu data."
            : "Metadata proposal needs manual review because no structured menu entry was validated."
        )
    const warning = typeof proposed.warning === "string" && proposed.warning
      ? proposed.warning
      : validation.warning

    return NextResponse.json({
      success: true,
      configured: true,
      provider: "anthropic",
      model,
      image_processing: visionPrep
        ? {
            original_width: visionPrep.originalWidth,
            original_height: visionPrep.originalHeight,
            sent_width: visionPrep.sentWidth,
            sent_height: visionPrep.sentHeight,
            temporary_downsampled_for_vision: visionPrep.downsampled,
          }
        : null,
      menu_context_available: Boolean(menuContext.text),
      menu_match_status_before_ai: menuMatch.status,
      menu_debug: serializeMenuDebug(menuMatch),
      validation,
      proposed_metadata: {
        dishName: lockedDishName ? confirmedDishName : proposedDishName,
        ...(isDrinkRequest ? {
          drinkName: lockedDishName ? confirmedDishName : proposedDrinkName,
          drink_name: lockedDishName ? confirmedDishName : proposedDrinkName,
          glassType: proposedGlassType,
          glass_shape: proposedGlassType,
          glass: proposedGlassType,
          garnish: proposedGarnish,
        } : {}),
        menuCategory: normalizeMenuCategory(proposed.menuCategory ?? proposed.menu_category),
        menuSourceId: proposedMenuSource?.id ?? selectedMenuSource?.id ?? null,
        menu_source_id: proposedMenuSource?.id ?? selectedMenuSource?.id ?? null,
        menuSourceIds: selectedMenuSources.ids.length > 0 ? selectedMenuSources.ids : [proposedMenuSource?.id ?? selectedMenuSource?.id].filter(Boolean),
        menu_source_ids: selectedMenuSources.ids.length > 0 ? selectedMenuSources.ids : [proposedMenuSource?.id ?? selectedMenuSource?.id].filter(Boolean),
        menuSourceName: proposedMenuSource?.label ?? selectedMenuSource?.label ?? "",
        menu_source_name: proposedMenuSource?.label ?? selectedMenuSource?.label ?? "",
        menuSourceLabels: selectedMenuSources.labels.length > 0 ? selectedMenuSources.labels : [proposedMenuSource?.label ?? selectedMenuSource?.label].filter(Boolean),
        menu_source_labels: selectedMenuSources.labels.length > 0 ? selectedMenuSources.labels : [proposedMenuSource?.label ?? selectedMenuSource?.label].filter(Boolean),
        price: String(proposed.price ?? "Not listed on menu"),
        menuIngredients,
        menu_ingredients: menuIngredients,
        menuDescription: menuIngredients,
        shortPlateDescription,
        shortDescription: shortPlateDescription,
        ingredients: menuIngredients === "Not listed on menu" ? [] : normalizeStringArray(menuIngredients),
        allergens: normalizeStringArray(proposed.allergens).length > 0 ? normalizeStringArray(proposed.allergens) : ["Not listed on menu"],
        tags: normalizeStringArray(proposed.tags),
        sourceStatus: proposedSourceStatus,
        reasoning: String(proposed.reasoning ?? ""),
        warning,
        validationStatus: validation.status,
        validation_status: validation.status,
        menuMatchConfidence: validation.menuMatchConfidence,
        imageValidationConfidence: validation.imageValidationConfidence,
        finalConfidence: validation.finalConfidence,
        contradictionDetected: validation.contradiction,
        imageFoodType: validation.imageClassification.visibleFoodType,
        imageDishFamily: validation.imageClassification.dishFamily,
        menuDishFamily: validation.menuDishFamily,
      },
      reasoning: {
        summary: String(proposed.reasoning ?? ""),
        uncertainty_warnings: warning ? [warning] : [],
      },
      raw_text: rawText,
    })
  } catch (error) {
    return NextResponse.json(conciseFallback(body, error instanceof Error ? error.message : "Claude metadata regeneration failed."))
  }
}
