export type AssetEligibilityInput = {
  id: string
  file_name: string
  asset_category?: string | null
  file_type?: string | null
  extracted_summary?: string | null
  metadata?: unknown
  status?: string | null
  source_quality?: string | null
}

export type AssetEligibilityResult = {
  eligible: boolean
  reason: string
  role: string
  sourceType: string
  matchedTerms: string[]
}

export type ClientAssetPrimaryType =
  | "food"
  | "drink"
  | "venue"
  | "model"
  | "outfit"
  | "accessory"
  | "serviceware"
  | "inspiration"
  | "graphic"
  | "unknown"

export type ClientAssetClassification = {
  primaryType: ClientAssetPrimaryType
  roles: string[]
  searchableText: string
  sourceType: string
  normalizedCategory: string
  matchedTerms: string[]
  isFoodTruth: boolean
  isDrinkTruth: boolean
  isVenueTruth: boolean
  isBackgroundSurface: boolean
  isInspirationOnly: boolean
  isImage: boolean
}

const FOOD_TERMS = [
  "food",
  "dish",
  "dishes",
  "plated",
  "menu item",
  "menu_item",
  "cuisine",
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "oyster",
  "oysters",
  "seafood",
  "starter",
  "main course",
  "pasta",
  "burger",
  "bread",
  "pastry",
  "croissant",
  "salmon",
  "lobster",
  "studio food",
  "food truth",
]

const DRINK_TERMS = [
  "drink",
  "drinks",
  "beverage",
  "cocktail",
  "mocktail",
  "coffee",
  "tea",
  "juice",
  "glass",
  "bar drink",
  "latte",
  "matcha",
  "espresso",
  "wine",
  "studio drink",
  "drink truth",
]

const VENUE_INTERIOR_TERMS = [
  "interior",
  "interiors",
  "indoor",
  "restaurant interior",
  "dining room",
  "dining area",
  "bar interior",
  "booth",
  "table setup",
  "indoor venue",
  "venue interior",
  "mirror dining",
]

const VENUE_EXTERIOR_TERMS = [
  "exterior",
  "exteriors",
  "outdoor",
  "terrace",
  "rooftop",
  "facade",
  "entrance",
  "street view",
  "pergola",
]

const VENUE_BACKGROUND_TERMS = [
  "venue_plate",
  "venue plate",
  "environment_base",
  "environment base",
  "compositing_base",
  "compositing base",
  "surface_texture",
  "surface texture",
  "product_background",
  "product background",
  "material_reference",
  "material reference",
  "background_preset",
  "background preset",
  "product_surface",
  "black marble",
  "blue curtain",
  "wooden table",
  "bar counter",
  "tabletop",
  "surface",
  "texture",
  "venue_spatial_metadata",
  "venue spatial metadata",
]

const HUMAN_TERMS = ["model", "person", "people", "guest", "guests", "staff", "waiter", "waitress", "chef", "lifestyle", "service"]
const TABLEWARE_TERMS = ["serviceware", "cutlery", "fork", "knife", "napkin", "glassware", "plate", "tableware"]
const GRAPHIC_TERMS = ["graphic", "flyer", "poster", "layout", "typography", "menu", "offer"]
const INSPIRATION_TERMS = ["pinterest", "inspiration", "moodboard", "reference only", "external inspiration"]

const TRUTH_SOURCE_TYPES = new Set([
  "client_uploaded_asset",
  "client_owned_asset",
  "content_database",
  "client_brain_truth",
  "client_uploaded",
  "generated_asset",
  "",
])

const INSPIRATION_SOURCE_TYPES = new Set([
  "pinterest",
  "pinterest_inspiration",
  "external_inspiration",
  "moodboard",
  "generic_inspiration",
])

export function normalizeAssetCategory(category?: string | null) {
  return (category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function metadataValue(metadata: unknown, keys: string[]) {
  if (!isRecord(metadata)) return ""
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    if (Array.isArray(value)) {
      const text = value.filter(item => typeof item === "string").join(" ")
      if (text.trim()) return text
    }
  }
  return ""
}

function flattenMetadata(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)]
  if (Array.isArray(value)) return value.flatMap(flattenMetadata)
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...flattenMetadata(nested)])
  }
  return []
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
}

export function assetEligibilityText(asset: AssetEligibilityInput) {
  const metadataText = flattenMetadata(asset.metadata).join(" ")
  return normalizeText(`${asset.file_name} ${asset.asset_category ?? ""} ${asset.extracted_summary ?? ""} ${metadataText}`)
}

export function isImageAsset(asset: AssetEligibilityInput) {
  return !asset.file_type || asset.file_type.startsWith("image/")
}

function matchedTerms(text: string, terms: string[]) {
  return terms.filter(term => text.includes(normalizeText(term)))
}

export function inferAssetSourceType(asset: AssetEligibilityInput) {
  const explicit = metadataValue(asset.metadata, ["source_type", "asset_source", "source"]).toLowerCase().trim()
  if (explicit) return explicit
  const category = normalizeAssetCategory(asset.asset_category)
  if (category === "pinterest_inspiration") return "pinterest_inspiration"
  if (["offer_flyer", "brand_deck", "social_screenshot"].includes(category)) return "graphics"
  return "client_uploaded_asset"
}

function explicitRole(asset: AssetEligibilityInput) {
  return normalizeAssetCategory(metadataValue(asset.metadata, ["normalized_role", "asset_role", "role", "assetType", "asset_type", "contentType", "content_type"]).toLowerCase().trim())
}

function hasVenueMetadata(asset: AssetEligibilityInput) {
  if (!isRecord(asset.metadata)) return false
  return Boolean(
    asset.metadata.venueSpatialMetadata
    || asset.metadata.venue_spatial_metadata
    || asset.metadata.zoneName
    || asset.metadata.zone_name
    || asset.metadata.spatial_role
    || asset.metadata.spatialRole
  )
}

function addRole(roles: string[], role: string) {
  if (!roles.includes(role)) roles.push(role)
}

export function classifyClientAsset(asset: AssetEligibilityInput): ClientAssetClassification {
  const category = normalizeAssetCategory(asset.asset_category)
  const text = assetEligibilityText(asset)
  const sourceType = inferAssetSourceType(asset)
  const roleFromMetadata = explicitRole(asset)
  const roles: string[] = []
  const foodMatches = matchedTerms(text, FOOD_TERMS)
  const drinkMatches = matchedTerms(text, DRINK_TERMS)
  const venueMatches = [...matchedTerms(text, VENUE_INTERIOR_TERMS), ...matchedTerms(text, VENUE_EXTERIOR_TERMS), ...matchedTerms(text, VENUE_BACKGROUND_TERMS)]
  const humanMatches = matchedTerms(text, HUMAN_TERMS)
  const tablewareMatches = matchedTerms(text, TABLEWARE_TERMS)
  const inspirationMatches = matchedTerms(text, INSPIRATION_TERMS)
  const graphicMatches = matchedTerms(text, GRAPHIC_TERMS)
  const matched = Array.from(new Set([...foodMatches, ...drinkMatches, ...venueMatches, ...humanMatches, ...tablewareMatches, ...inspirationMatches, ...graphicMatches]))

  const metadataFoodType = ["food", "food_truth", "studio_food"].includes(roleFromMetadata)
    || /(^|\s)(food|dish|breakfast|lunch|dinner|dessert|seafood|starter|main course)(\s|$)/i.test(text)
    || Boolean(metadataValue(asset.metadata, ["foodName", "food_name", "dishName", "dish_name", "menuItem", "menu_item", "serving_vessel", "plate_count"]))
  const metadataDrinkType = ["drink", "drink_truth", "studio_drink"].includes(roleFromMetadata)
    || /\b(beverage|cocktail|mocktail|coffee|tea|latte|matcha|juice)\b/i.test(text)

  let primaryType: ClientAssetPrimaryType = "unknown"

  if (category === "pinterest_inspiration" || INSPIRATION_SOURCE_TYPES.has(sourceType)) {
    primaryType = "inspiration"
    addRole(roles, "inspiration")
  } else if (["offer_flyer", "brand_deck", "social_screenshot"].includes(category) || ["graphic", "graphics"].includes(roleFromMetadata)) {
    primaryType = "graphic"
    addRole(roles, "graphic")
  } else if (category === "food_studio_shots") {
    primaryType = "food"
    addRole(roles, "studio_food")
    addRole(roles, "food_truth")
  } else if (category === "drink_studio_shots") {
    primaryType = "drink"
    addRole(roles, "studio_drink")
    addRole(roles, "drink_truth")
  } else if (category === "food" || (category === "breakfast" && !metadataDrinkType) || ["food", "food_truth", "studio_food"].includes(roleFromMetadata)) {
    primaryType = "food"
    addRole(roles, "food")
    addRole(roles, "food_truth")
  } else if (category === "drinks" || (category === "breakfast" && metadataDrinkType) || ["drink", "drink_truth", "studio_drink"].includes(roleFromMetadata)) {
    primaryType = "drink"
    addRole(roles, "drink")
    addRole(roles, "drink_truth")
  } else if (category === "background_presets") {
    primaryType = "venue"
    addRole(roles, "venue_background")
  } else if (category === "interiors" || category === "exteriors" || ["venue_interior", "venue_exterior", "venue_background"].includes(roleFromMetadata) || hasVenueMetadata(asset)) {
    primaryType = "venue"
    if (category === "exteriors" || roleFromMetadata === "venue_exterior" || matchedTerms(text, VENUE_EXTERIOR_TERMS).length > 0) addRole(roles, "venue_exterior")
    else addRole(roles, "venue_interior")
    if (roleFromMetadata === "venue_background" || matchedTerms(text, VENUE_BACKGROUND_TERMS).length > 0) addRole(roles, "venue_background")
  } else if (matchedTerms(text, VENUE_BACKGROUND_TERMS).length > 0 && !metadataFoodType && !metadataDrinkType) {
    primaryType = "venue"
    addRole(roles, "venue_background")
  } else if (category === "venue_items" || tablewareMatches.length > 0) {
    primaryType = "serviceware"
    addRole(roles, "tableware")
  } else if (category === "guest_models" || category === "lifestyle" || humanMatches.length > 0 || ["human", "model", "staff"].includes(roleFromMetadata)) {
    primaryType = "model"
    addRole(roles, roleFromMetadata === "staff" ? "staff" : "human")
  } else if (metadataFoodType || foodMatches.length > 0) {
    primaryType = "food"
    addRole(roles, "food")
  } else if (metadataDrinkType || drinkMatches.length > 0) {
    primaryType = "drink"
    addRole(roles, "drink")
  }

  if (roleFromMetadata && !["food_truth", "drink_truth"].includes(roleFromMetadata)) addRole(roles, roleFromMetadata)
  if (roles.length === 0) addRole(roles, "uncategorized")

  const isInspirationOnly = primaryType === "inspiration" || inspirationMatches.length > 0 || INSPIRATION_SOURCE_TYPES.has(sourceType)
  const isBackgroundSurface = primaryType === "venue" && (roles.includes("venue_background") || matchedTerms(text, VENUE_BACKGROUND_TERMS).length > 0)
  const isVenueTruth = primaryType === "venue"
  const isFoodTruth = primaryType === "food" && !isInspirationOnly
  const isDrinkTruth = primaryType === "drink" && !isInspirationOnly

  return {
    primaryType,
    roles,
    searchableText: text,
    sourceType,
    normalizedCategory: category,
    matchedTerms: matched,
    isFoodTruth,
    isDrinkTruth,
    isVenueTruth,
    isBackgroundSurface,
    isInspirationOnly,
    isImage: isImageAsset(asset),
  }
}

export function inferNormalizedAssetRole(asset: AssetEligibilityInput) {
  const classification = classifyClientAsset(asset)
  return classification.roles[0] ?? "uncategorized"
}

function isTruthSource(asset: AssetEligibilityInput) {
  const classification = classifyClientAsset(asset)
  return TRUTH_SOURCE_TYPES.has(classification.sourceType) && !classification.isInspirationOnly
}

function blockedSourceReason(asset: AssetEligibilityInput) {
  const classification = classifyClientAsset(asset)
  const sourceType = classification.sourceType
  const role = classification.roles[0] ?? "uncategorized"
  if (!isImageAsset(asset)) return "not an image asset"
  if (classification.isInspirationOnly) return "inspiration source; not truth"
  if (!isTruthSource(asset)) return `unsupported source type: ${sourceType}`
  return ""
}

export function foodTruthEligibility(asset: AssetEligibilityInput): AssetEligibilityResult {
  const classification = classifyClientAsset(asset)
  const role = classification.roles[0] ?? "uncategorized"
  const sourceType = classification.sourceType
  const blocked = blockedSourceReason(asset)
  const terms = classification.matchedTerms.filter(term => FOOD_TERMS.map(normalizeText).includes(normalizeText(term)))
  if (blocked) return { eligible: false, reason: blocked, role, sourceType, matchedTerms: terms }
  if (classification.isFoodTruth) {
    return { eligible: true, reason: role === "studio_food" ? "studio food truth role" : terms.length > 0 ? `matched food terms: ${terms.slice(0, 4).join(", ")}` : "food category/role", role, sourceType, matchedTerms: terms }
  }
  return { eligible: false, reason: `not food truth (${classification.primaryType}/${role})`, role, sourceType, matchedTerms: terms }
}

export function drinkTruthEligibility(asset: AssetEligibilityInput): AssetEligibilityResult {
  const classification = classifyClientAsset(asset)
  const role = classification.roles[0] ?? "uncategorized"
  const sourceType = classification.sourceType
  const blocked = blockedSourceReason(asset)
  const terms = classification.matchedTerms.filter(term => DRINK_TERMS.map(normalizeText).includes(normalizeText(term)))
  if (blocked) return { eligible: false, reason: blocked, role, sourceType, matchedTerms: terms }
  if (classification.isDrinkTruth) {
    return { eligible: true, reason: role === "studio_drink" ? "studio drink truth role" : terms.length > 0 ? `matched drink terms: ${terms.slice(0, 4).join(", ")}` : "drink category/role", role, sourceType, matchedTerms: terms }
  }
  return { eligible: false, reason: `not drink truth (${classification.primaryType}/${role})`, role, sourceType, matchedTerms: terms }
}

export function venueBackgroundEligibility(asset: AssetEligibilityInput): AssetEligibilityResult {
  const classification = classifyClientAsset(asset)
  const role = classification.roles[0] ?? "uncategorized"
  const sourceType = classification.sourceType
  const blocked = blockedSourceReason(asset)
  const terms = classification.matchedTerms.filter(term => [...VENUE_INTERIOR_TERMS, ...VENUE_EXTERIOR_TERMS, ...VENUE_BACKGROUND_TERMS].map(normalizeText).includes(normalizeText(term)))
  if (blocked) return { eligible: false, reason: blocked, role, sourceType, matchedTerms: terms }
  if (classification.isVenueTruth || classification.isBackgroundSurface) {
    return { eligible: true, reason: terms.length > 0 ? `matched venue/background terms: ${terms.slice(0, 4).join(", ")}` : `${role} role/category`, role, sourceType, matchedTerms: terms }
  }
  return { eligible: false, reason: `not venue/background truth (${classification.primaryType}/${role})`, role, sourceType, matchedTerms: terms }
}

export function venuePhotographySourceEligibility(asset: AssetEligibilityInput) {
  const result = venueBackgroundEligibility(asset)
  if (!result.eligible) return result
  if (["food", "studio_food", "drink", "studio_drink", "human", "tableware", "graphic"].includes(result.role)) {
    return { ...result, eligible: false, reason: `excluded role for venue photography: ${result.role}` }
  }
  return result
}

export function sortFoodTruthAssets<T extends AssetEligibilityInput>(assets: T[]) {
  return [...assets].sort((left, right) => {
    const leftRole = inferNormalizedAssetRole(left)
    const rightRole = inferNormalizedAssetRole(right)
    return Number(rightRole === "studio_food") - Number(leftRole === "studio_food") || left.file_name.localeCompare(right.file_name)
  })
}

export function sortVenueBackgroundAssets<T extends AssetEligibilityInput>(assets: T[]) {
  const rank = (asset: T) => {
    const role = inferNormalizedAssetRole(asset)
    if (role === "venue_interior") return 0
    if (role === "venue_exterior") return 1
    if (role === "venue_background") return 2
    return 3
  }
  return [...assets].sort((left, right) => rank(left) - rank(right) || left.file_name.localeCompare(right.file_name))
}

export function assetEligibilityAudit<T extends AssetEligibilityInput>(
  assets: T[],
  displayedAssets: T[],
  eligibility: (asset: T) => AssetEligibilityResult,
  activeFilters: Record<string, string | number | boolean> = {}
) {
  const displayedIds = new Set(displayedAssets.map(asset => asset.id))
  const rows = assets.map(asset => ({ asset, result: eligibility(asset), displayed: displayedIds.has(asset.id) }))
  const eligible = rows.filter(row => row.result.eligible)
  const excluded = rows.filter(row => !row.result.eligible)
  return {
    totalClientAssets: assets.length,
    eligibleAssets: eligible.length,
    displayedAssets: displayedAssets.length,
    excludedAssets: excluded.length,
    activeFilters,
    excludedReasons: excluded.map(row => ({
      id: row.asset.id,
      fileName: row.asset.file_name,
      category: row.asset.asset_category ?? "",
      role: row.result.role,
      sourceType: row.result.sourceType,
      reason: row.result.reason,
      matchedTerms: row.result.matchedTerms,
    })),
  }
}
