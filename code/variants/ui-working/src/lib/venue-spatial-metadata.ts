export type VenueSpatialZoneId =
  | "interior_dining_tables"
  | "interior_high_table_area"
  | "blue_booth_lounge"
  | "main_bar"
  | "mirror_dining_hall"
  | "entrance_tunnel"
  | "terrace_edge"
  | "terrace_pergola"
  | "unknown"

export type VenueSpatialMetadata = {
  venueId: string
  zoneName: string
  cameraAngleType: string
  spatialRole: string
  architecture: {
    ceilingType: string
    ceilingPattern: string
    wallMaterials: string[]
    floorMaterials: string[]
    mirrorUsage: string
    lightingFixtures: string[]
  }
  seating: {
    seatingFamily: string[]
    chairColors: string[]
    boothTypes: string[]
    tableShapes: string[]
    tableMaterials: string[]
    tableEdgeDetails: string[]
  }
  layout: {
    circulationStyle: string
    density: string
    tableSpacing: string
    walkwayVisibility: string
    focalAxis: string
  }
  lighting: {
    timeCompatibility: string[]
    lightingTemperature: string
    chandelierStyle: string
    ambientDirection: string
  }
  preservationRules: string[]
}

export type VenueSpatialAsset = {
  id: string
  file_name?: string | null
  asset_category?: string | null
  extracted_summary?: string | null
  metadata?: unknown
}

type ZonePreset = Omit<VenueSpatialMetadata, "venueId">
export type VenueSpatialMetadataCompleteness = "complete" | "partial" | "missing"

export const VENUE_SPATIAL_METADATA_KEY = "venueSpatialMetadata"
export const VENUE_SPATIAL_METADATA_STATUS_KEY = "venue_spatial_metadata_status"
export const VENUE_SPATIAL_METADATA_VERSION_KEY = "venue_spatial_metadata_version"
export const VENUE_SPATIAL_METADATA_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function metadataValue(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return ""
  const value = metadata[key]
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.filter(item => typeof item === "string").join(", ")
  return ""
}

function compact(value: string | undefined | null, maxLength = 140) {
  if (!value?.trim()) return ""
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized
}

function normalizeCategory(category: string | null | undefined) {
  return (category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

export function isVenueLikeSpatialAsset(asset: Pick<VenueSpatialAsset, "asset_category">) {
  const category = normalizeCategory(asset.asset_category)
  return category === "interiors" || category === "exteriors" || category === "venue_items"
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string")
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

function hasTextArray(value: unknown) {
  return isStringArray(value) && value.some(item => item.trim().length > 0)
}

function isVenueSpatialMetadata(value: unknown): value is VenueSpatialMetadata {
  if (!isRecord(value)) return false
  const architecture = value.architecture
  const seating = value.seating
  const layout = value.layout
  const lighting = value.lighting
  return hasText(value.venueId)
    && hasText(value.zoneName)
    && hasText(value.cameraAngleType)
    && hasText(value.spatialRole)
    && isRecord(architecture)
    && hasText(architecture.ceilingType)
    && hasText(architecture.ceilingPattern)
    && hasTextArray(architecture.wallMaterials)
    && hasTextArray(architecture.floorMaterials)
    && hasText(architecture.mirrorUsage)
    && hasTextArray(architecture.lightingFixtures)
    && isRecord(seating)
    && hasTextArray(seating.seatingFamily)
    && hasTextArray(seating.chairColors)
    && hasTextArray(seating.boothTypes)
    && hasTextArray(seating.tableShapes)
    && hasTextArray(seating.tableMaterials)
    && hasTextArray(seating.tableEdgeDetails)
    && isRecord(layout)
    && hasText(layout.circulationStyle)
    && hasText(layout.density)
    && hasText(layout.tableSpacing)
    && hasText(layout.walkwayVisibility)
    && hasText(layout.focalAxis)
    && isRecord(lighting)
    && hasTextArray(lighting.timeCompatibility)
    && hasText(lighting.lightingTemperature)
    && hasText(lighting.chandelierStyle)
    && hasText(lighting.ambientDirection)
    && hasTextArray(value.preservationRules)
}

export function readStoredVenueSpatialMetadata(asset: VenueSpatialAsset): VenueSpatialMetadata | null {
  if (!isRecord(asset.metadata)) return null
  const direct = asset.metadata[VENUE_SPATIAL_METADATA_KEY] ?? asset.metadata.venue_spatial_metadata
  return isVenueSpatialMetadata(direct) ? direct : null
}

function searchText(asset: VenueSpatialAsset) {
  let metadataText = ""
  try {
    metadataText = JSON.stringify(asset.metadata ?? {})
  } catch {
    metadataText = ""
  }
  return [
    asset.file_name ?? "",
    asset.asset_category ?? "",
    asset.extracted_summary ?? "",
    metadataText,
  ].join(" ").toLowerCase()
}

function includesAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term))
}

export const VENUE_SPATIAL_ZONE_PRESETS: Record<VenueSpatialZoneId, ZonePreset> = {
  interior_dining_tables: {
    zoneName: "Interior Dining Tables",
    cameraAngleType: "wide dining perspective, seated guest height, natural table-depth view",
    spatialRole: "primary interior dining scene plate",
    architecture: {
      ceilingType: "finished interior ceiling with visible chandelier rhythm",
      ceilingPattern: "repeating ceiling panels and reflected fixture spacing must stay fixed",
      wallMaterials: ["dark wall sections", "warm wood/bronze architectural trim", "mirror accents where visible"],
      floorMaterials: ["dark polished interior floor", "venue-matched hard flooring"],
      mirrorUsage: "mirrors are spatial truth only; preserve reflection position and do not invent mirrored openings",
      lightingFixtures: ["clustered chandeliers", "warm pendant/ceiling fixtures", "venue-integrated ambient lights"],
    },
    seating: {
      seatingFamily: ["blue velvet rounded dining chairs", "bronze/gold chair trim", "upholstered dining seating"],
      chairColors: ["deep blue", "navy velvet", "bronze/gold trim"],
      boothTypes: ["none unless visible in selected source"],
      tableShapes: ["round dining tables", "round black/dark marble tables"],
      tableMaterials: ["black marble", "dark stone", "polished stone top"],
      tableEdgeDetails: ["bronze/gold rim", "thin metallic edge"],
    },
    layout: {
      circulationStyle: "restaurant dining aisles between table clusters",
      density: "medium premium dining density",
      tableSpacing: "visible separation between round tables; no crowded cafe layout",
      walkwayVisibility: "walkways remain visible where source shows circulation gaps",
      focalAxis: "table cluster foreground leading into dining room depth",
    },
    lighting: {
      timeCompatibility: ["Midday", "Evening"],
      lightingTemperature: "warm neutral interior hospitality light",
      chandelierStyle: "clustered chandelier family, spacing rhythm locked",
      ambientDirection: "overhead chandelier glow with soft venue fill",
    },
    preservationRules: [
      "Preserve round black/dark marble table family and bronze/gold edge detail.",
      "Do not replace dining chairs with cafe chairs, red seating, or generic restaurant seating.",
      "Preserve chandelier spacing rhythm and ceiling panel continuity.",
      "Do not invent windows, booths, bars, or terrace elements in this interior dining zone.",
      "Preserve aisle gaps, table spacing, chair scale, and seated guest geometry.",
    ],
  },
  interior_high_table_area: {
    zoneName: "Interior High Tables",
    cameraAngleType: "left-offset high-table angle with table surface depth and chair ring visible",
    spatialRole: "source-locked high table dining scene plate",
    architecture: {
      ceilingType: "interior ceiling with fixed fixture grid",
      ceilingPattern: "linear/repeating ceiling rhythm, no alternate ceiling redesign",
      wallMaterials: ["dark interior wall planes", "warm wood/bronze trim", "mirror/reflective inserts where source shows them"],
      floorMaterials: ["polished dark interior flooring"],
      mirrorUsage: "preserve real mirrored/reflected areas only",
      lightingFixtures: ["warm chandelier clusters", "small pendant/ambient fixture points"],
    },
    seating: {
      seatingFamily: ["blue velvet rounded high dining chairs", "bronze/gold trim dining chairs"],
      chairColors: ["deep blue", "navy", "bronze/gold trim"],
      boothTypes: ["none"],
      tableShapes: ["round high dining tables"],
      tableMaterials: ["black marble", "dark stone"],
      tableEdgeDetails: ["bronze/gold rim", "thin metallic table edge"],
    },
    layout: {
      circulationStyle: "high-table cluster with standing/walking clearance around chairs",
      density: "medium tight high-table hospitality density",
      tableSpacing: "round tables remain separate and scaled to visible chair radius",
      walkwayVisibility: "clear circulation around high-table seats",
      focalAxis: "round tabletop foreground with chair ring and venue depth behind",
    },
    lighting: {
      timeCompatibility: ["Midday", "Evening"],
      lightingTemperature: "warm interior light over black marble",
      chandelierStyle: "compact chandelier/pendant rhythm above high tables",
      ambientDirection: "overhead warm fixture light with soft side reflections",
    },
    preservationRules: [
      "Do not shrink, square off, or replace the high round black marble table.",
      "Do not add cafe tables, low dining tables, or unrelated furniture.",
      "Preserve chair ring radius, blue upholstery, and bronze/gold trim relationship.",
      "Preserve original camera height and table depth.",
      "Do not borrow terrace, booth, or bar furniture into this zone.",
    ],
  },
  blue_booth_lounge: {
    zoneName: "Blue Booth Lounge",
    cameraAngleType: "tight booth perspective with curved seating depth and lounge wall continuity",
    spatialRole: "blue upholstered lounge/booth scene plate",
    architecture: {
      ceilingType: "low interior lounge ceiling",
      ceilingPattern: "continuous lounge ceiling with fixed fixture rhythm",
      wallMaterials: ["dark wall finishes", "warm wood/bronze details", "upholstered booth backing"],
      floorMaterials: ["dark polished floor", "venue-matched lounge flooring"],
      mirrorUsage: "use only source-visible mirror/reflection behavior",
      lightingFixtures: ["warm lounge sconces", "small pendants", "ambient ceiling fixtures"],
    },
    seating: {
      seatingFamily: ["curved blue booth seating", "blue velvet lounge banquette", "rounded upholstered dining chairs if visible"],
      chairColors: ["deep blue", "navy velvet"],
      boothTypes: ["curved blue booth", "upholstered lounge banquette"],
      tableShapes: ["round low/standard dining tables only if visible"],
      tableMaterials: ["black marble", "dark stone"],
      tableEdgeDetails: ["bronze/gold rim where visible"],
    },
    layout: {
      circulationStyle: "booth perimeter seating with clear service path in front",
      density: "intimate lounge density",
      tableSpacing: "tables align to booth curvature; no freestanding cafe layout",
      walkwayVisibility: "service path remains visible where source shows it",
      focalAxis: "curved blue seating as dominant spatial anchor",
    },
    lighting: {
      timeCompatibility: ["Evening"],
      lightingTemperature: "warm lounge glow",
      chandelierStyle: "small lounge fixtures, not large dining-hall chandeliers unless visible",
      ambientDirection: "soft warm side/overhead lounge light",
    },
    preservationRules: [
      "No random red seating if source zone is blue velvet.",
      "Do not replace curved booth seating with loose chairs.",
      "Preserve booth curvature, upholstery color, and table-to-booth distance.",
      "Do not invent windows or terrace edges in enclosed lounge shots.",
      "Keep lounge lighting intimate and source-matched.",
    ],
  },
  main_bar: {
    zoneName: "Main Bar",
    cameraAngleType: "bar axial or counter-facing composition with back-bar depth",
    spatialRole: "bar/cocktail service scene plate",
    architecture: {
      ceilingType: "interior bar ceiling with controlled fixture rhythm",
      ceilingPattern: "bar ceiling/overhead fixture grid remains fixed",
      wallMaterials: ["back-bar shelving", "dark stone", "wood/bronze trim", "reflective bar surfaces"],
      floorMaterials: ["polished dark interior flooring"],
      mirrorUsage: "bar mirrors/reflections preserve source perspective and shelf geometry",
      lightingFixtures: ["bar pendants", "warm back-bar lighting", "small chandelier/ceiling fixtures"],
    },
    seating: {
      seatingFamily: ["bar stools", "zebra-pattern bar seating where visible", "dark upholstered bar seating"],
      chairColors: ["black", "cream/black patterned", "bronze trim"],
      boothTypes: ["none unless visible in source"],
      tableShapes: ["bar counter", "small bar ledges"],
      tableMaterials: ["dark stone counter", "black marble", "polished bar top"],
      tableEdgeDetails: ["thin metal trim", "polished counter edge"],
    },
    layout: {
      circulationStyle: "linear bar service axis with guest/service side separation",
      density: "medium bar density",
      tableSpacing: "counter depth and stool spacing remain locked",
      walkwayVisibility: "service corridor and guest side stay physically plausible",
      focalAxis: "bar counter leading to back-bar shelving",
    },
    lighting: {
      timeCompatibility: ["Evening"],
      lightingTemperature: "warm cocktail/bar light",
      chandelierStyle: "bar pendants/back-bar glow, not dining table chandelier substitution",
      ambientDirection: "back-bar glow plus warm overhead highlights",
    },
    preservationRules: [
      "Preserve bar counter geometry, stool spacing, and back-bar shelving axis.",
      "Do not transform bar zone into dining table zone.",
      "Do not invent unrelated bottles, shelves, windows, or counter materials.",
      "Keep zebra-pattern/bar seating only where source shows that family.",
      "Preserve reflections and light strips as source geometry, not decoration to randomize.",
    ],
  },
  mirror_dining_hall: {
    zoneName: "Mirror Dining Hall",
    cameraAngleType: "wide mirrored dining-hall perspective with ceiling/reflection continuity",
    spatialRole: "architectural dining hall scene plate",
    architecture: {
      ceilingType: "mirrored or highly reflective ceiling/upper architecture",
      ceilingPattern: "mirror panels and chandelier reflections create a repeated ceiling rhythm",
      wallMaterials: ["mirror panels", "dark wall finishes", "warm wood/bronze trims"],
      floorMaterials: ["polished dark floor"],
      mirrorUsage: "mirrored ceiling/walls are locked spatial truth; reflections must align with real fixtures and furniture",
      lightingFixtures: ["repeated chandelier clusters", "warm reflected fixture rows"],
    },
    seating: {
      seatingFamily: ["blue velvet rounded dining chairs", "upholstered dining chairs", "bronze/gold chair trim"],
      chairColors: ["deep blue", "navy", "bronze/gold trim"],
      boothTypes: ["none unless source-visible"],
      tableShapes: ["round dining tables"],
      tableMaterials: ["black marble", "dark polished stone"],
      tableEdgeDetails: ["bronze/gold rim", "thin metallic edge"],
    },
    layout: {
      circulationStyle: "mirrored dining hall with repeated table/chair rows and visible aisles",
      density: "medium/full premium dining density",
      tableSpacing: "consistent table spacing repeated through reflection/depth",
      walkwayVisibility: "aisles remain visible and aligned with mirrored repetition",
      focalAxis: "mirror/chandelier axis plus repeated table rhythm",
    },
    lighting: {
      timeCompatibility: ["Evening"],
      lightingTemperature: "warm chandelier/reflection glow",
      chandelierStyle: "repeated chandelier clusters reflected in mirrors",
      ambientDirection: "overhead reflected warm light",
    },
    preservationRules: [
      "Do not remove mirrored ceiling continuity or reflection rhythm.",
      "Do not invent a different chandelier system or ceiling geometry.",
      "Preserve repeated dining table/chair rhythm and aisle spacing.",
      "Do not add windows, terrace elements, or unrelated wall openings.",
      "Reflections must follow source geometry; do not create impossible mirror content.",
    ],
  },
  entrance_tunnel: {
    zoneName: "Entrance Tunnel",
    cameraAngleType: "axial corridor/tunnel perspective with strong vanishing direction",
    spatialRole: "arrival/transition scene plate",
    architecture: {
      ceilingType: "arched or tunnel-like entrance ceiling",
      ceilingPattern: "continuous arch/wood system receding in perspective",
      wallMaterials: ["wood arch systems", "dark wall/floor edges", "warm architectural trim"],
      floorMaterials: ["dark polished entry flooring"],
      mirrorUsage: "none unless source-visible; do not invent mirrors",
      lightingFixtures: ["linear/warm entry lights", "integrated arch lighting"],
    },
    seating: {
      seatingFamily: ["none unless visible"],
      chairColors: ["none unless visible"],
      boothTypes: ["none"],
      tableShapes: ["none unless visible"],
      tableMaterials: ["none unless visible"],
      tableEdgeDetails: ["none unless visible"],
    },
    layout: {
      circulationStyle: "linear arrival circulation, clear walking path",
      density: "open transition density",
      tableSpacing: "no dining tables unless source-visible",
      walkwayVisibility: "walkway is the main subject and must remain clear",
      focalAxis: "central tunnel/arch vanishing point",
    },
    lighting: {
      timeCompatibility: ["Morning", "Midday", "Evening"],
      lightingTemperature: "warm architectural entry light",
      chandelierStyle: "integrated entry lighting, no dining chandelier substitution",
      ambientDirection: "linear light along tunnel depth",
    },
    preservationRules: [
      "Do not place dining tables or lounge furniture inside the entrance tunnel unless visible in source.",
      "Preserve arch/wood system, vanishing point, and corridor clearance.",
      "Do not invent side rooms, windows, chandeliers, or booth seating.",
      "Keep camera axis locked to the source corridor perspective.",
      "Use this zone for arrival/transition atmosphere, not dining-table composites.",
    ],
  },
  terrace_edge: {
    zoneName: "Terrace Edge",
    cameraAngleType: "exterior terrace edge view with outdoor table/rail/city-axis context",
    spatialRole: "outdoor terrace scene plate",
    architecture: {
      ceilingType: "open-air exterior or terrace ceiling edge only where visible",
      ceilingPattern: "no enclosed interior ceiling; preserve real pergola/edge if visible",
      wallMaterials: ["exterior facade elements", "terrace railing", "outdoor planters or edge materials where visible"],
      floorMaterials: ["outdoor terrace flooring", "stone/concrete terrace surface"],
      mirrorUsage: "none unless source-visible; do not import interior mirrors",
      lightingFixtures: ["outdoor wall/ambient lights", "terrace/pergola fixtures where visible"],
    },
    seating: {
      seatingFamily: ["outdoor terrace dining chairs", "venue-matched exterior seating"],
      chairColors: ["source-visible exterior chair colors only"],
      boothTypes: ["none unless source-visible"],
      tableShapes: ["outdoor round or square tables only as source-visible"],
      tableMaterials: ["outdoor table surfaces", "dark stone/venue-matched exterior tops"],
      tableEdgeDetails: ["source-visible outdoor edge details only"],
    },
    layout: {
      circulationStyle: "outdoor terrace table circulation with edge/railing awareness",
      density: "open-air terrace density",
      tableSpacing: "visible outdoor spacing; no indoor high-table crowding",
      walkwayVisibility: "terrace walkway/edge remains visible where source shows it",
      focalAxis: "terrace edge or outdoor table axis",
    },
    lighting: {
      timeCompatibility: ["Morning", "Midday", "Evening"],
      lightingTemperature: "source-matched outdoor light; do not force interior chandelier warmth",
      chandelierStyle: "none; exterior/pergola fixtures only where visible",
      ambientDirection: "natural exterior light or source-visible terrace lighting",
    },
    preservationRules: [
      "Do not convert terrace into an indoor restaurant.",
      "Do not invent interior chandeliers, mirrors, blue booths, or enclosed ceilings.",
      "Preserve railing/edge, outdoor floor material, and exterior seating family.",
      "Do not add skyline/windows if not in source view.",
      "Keep weather/light consistent with source plate unless only foreground styling changes.",
    ],
  },
  terrace_pergola: {
    zoneName: "Terrace Pergola",
    cameraAngleType: "exterior pergola perspective with overhead slat/cover geometry",
    spatialRole: "covered outdoor terrace scene plate",
    architecture: {
      ceilingType: "outdoor pergola or covered terrace roof",
      ceilingPattern: "pergola slats/overhead grid locked to source perspective",
      wallMaterials: ["terrace edge", "exterior facade", "planters/railing where visible"],
      floorMaterials: ["outdoor terrace floor"],
      mirrorUsage: "none unless source-visible",
      lightingFixtures: ["pergola lights", "outdoor ambient fixtures"],
    },
    seating: {
      seatingFamily: ["outdoor terrace chairs", "venue-matched exterior seating"],
      chairColors: ["source-visible exterior chair colors only"],
      boothTypes: ["none unless source-visible"],
      tableShapes: ["source-visible exterior tables"],
      tableMaterials: ["outdoor dining table material", "dark stone/venue-matched exterior tops"],
      tableEdgeDetails: ["source-visible exterior table edges"],
    },
    layout: {
      circulationStyle: "covered terrace service paths with pergola axis",
      density: "medium/open terrace density",
      tableSpacing: "terrace spacing follows pergola module and source furniture placement",
      walkwayVisibility: "preserve clear outdoor circulation paths",
      focalAxis: "pergola roof grid and terrace depth",
    },
    lighting: {
      timeCompatibility: ["Morning", "Midday", "Evening"],
      lightingTemperature: "natural daylight or warm outdoor fixture tone from source",
      chandelierStyle: "pergola/outdoor lights only, no interior chandelier family",
      ambientDirection: "source-matched outdoor light through pergola/open air",
    },
    preservationRules: [
      "Preserve pergola overhead geometry and terrace depth.",
      "Do not replace outdoor furniture with indoor blue-velvet dining chairs unless source shows them.",
      "Do not invent enclosed walls, mirrored ceilings, or interior chandeliers.",
      "Keep table placement aligned to the visible pergola/terrace module.",
      "Use this as outdoor/covered terrace truth, not general luxury ambience.",
    ],
  },
  unknown: {
    zoneName: "Unclassified Venue Zone",
    cameraAngleType: "source image camera angle must remain locked",
    spatialRole: "unclassified venue scene plate",
    architecture: {
      ceilingType: "source-visible ceiling only",
      ceilingPattern: "preserve source-visible ceiling pattern",
      wallMaterials: ["source-visible wall materials only"],
      floorMaterials: ["source-visible floor materials only"],
      mirrorUsage: "preserve source-visible mirrors/reflections only",
      lightingFixtures: ["source-visible fixtures only"],
    },
    seating: {
      seatingFamily: ["source-visible seating only"],
      chairColors: ["source-visible colors only"],
      boothTypes: ["source-visible booths only"],
      tableShapes: ["source-visible table shapes only"],
      tableMaterials: ["source-visible table materials only"],
      tableEdgeDetails: ["source-visible table edges only"],
    },
    layout: {
      circulationStyle: "source-visible circulation only",
      density: "source-visible density",
      tableSpacing: "source-visible table spacing only",
      walkwayVisibility: "preserve source-visible walkways",
      focalAxis: "source camera axis",
    },
    lighting: {
      timeCompatibility: ["Morning", "Midday", "Evening"],
      lightingTemperature: "source-matched lighting only",
      chandelierStyle: "source-visible fixtures only",
      ambientDirection: "source-visible light direction only",
    },
    preservationRules: [
      "Use visible venue evidence only.",
      "Do not invent furniture, tables, chairs, ceilings, walls, floors, fixtures, or layout.",
      "Do not borrow elements from another venue zone.",
      "Keep source camera angle, spatial depth, and object placement locked.",
      "If uncertain, leave the area unchanged rather than hallucinating.",
    ],
  },
}

export function inferVenueSpatialZoneId(asset: VenueSpatialAsset, location?: string): VenueSpatialZoneId {
  const text = searchText(asset)
  const explicitZone = [
    metadataValue(asset.metadata, "spatial_zone_id"),
    metadataValue(asset.metadata, "venue_spatial_zone"),
    metadataValue(asset.metadata, "zone_id"),
    metadataValue(asset.metadata, "zone"),
  ].join(" ").toLowerCase()
  const source = `${explicitZone} ${text}`
  const category = normalizeCategory(asset.asset_category)

  if (includesAny(source, ["entrance tunnel", "tunnel", "entry tunnel", "arrival corridor", "entrance corridor", "wood arch", "arch system"])) return "entrance_tunnel"
  if (includesAny(source, ["pergola", "covered terrace", "terrace pergola", "outdoor cover", "slatted roof"])) return "terrace_pergola"
  if (includesAny(source, ["terrace", "exterior", "outdoor", "outside", "alfresco", "railing", "city view"])) return "terrace_edge"
  if (includesAny(source, ["main bar", "bar counter", "back bar", "bar stool", "zebra", "cocktail bar", "counter"])) return "main_bar"
  if (includesAny(source, ["blue booth", "booth lounge", "curved booth", "banquette", "lounge booth", "blue banquette"])) return "blue_booth_lounge"
  if (includesAny(source, ["mirror dining", "mirrored dining", "mirrored ceiling", "mirror ceiling", "reflection ceiling", "reflection hall"])) return "mirror_dining_hall"
  if (includesAny(source, ["high table", "high-table", "high dining", "black marble", "gold rim", "bronze rim", "table diameter", "round high"])) return "interior_high_table_area"
  if (includesAny(source, ["interior dining", "dining tables", "dining room", "round dining", "restaurant table", "chair", "seating"])) return "interior_dining_tables"

  if (category === "exteriors" || location === "Exterior") return "terrace_edge"
  if (category === "interiors" || location === "Interior") return "interior_dining_tables"
  return "unknown"
}

export function inferVenueSpatialZoneIdFromAssets(assets: VenueSpatialAsset[], location?: string): VenueSpatialZoneId {
  const firstTruthAsset = assets.find(asset => {
    const category = normalizeCategory(asset.asset_category)
    return category === "interiors" || category === "exteriors"
  }) ?? assets[0]
  return firstTruthAsset ? inferVenueSpatialZoneId(firstTruthAsset, location) : "unknown"
}

export function resolveVenueSpatialMetadata(asset: VenueSpatialAsset, location?: string): VenueSpatialMetadata {
  const zoneId = inferVenueSpatialZoneId(asset, location)
  const preset = VENUE_SPATIAL_ZONE_PRESETS[zoneId]
  const metadataZoneName = compact(metadataValue(asset.metadata, "zone") || metadataValue(asset.metadata, "name") || metadataValue(asset.metadata, "title"), 90)
  const cameraAngleType = compact(metadataValue(asset.metadata, "camera_angle_type") || metadataValue(asset.metadata, "camera_angle") || metadataValue(asset.metadata, "perspective_lock"), 120)
  const spatialRole = compact(metadataValue(asset.metadata, "spatial_role") || metadataValue(asset.metadata, "scene_role"), 120)

  return {
    venueId: asset.id,
    ...preset,
    zoneName: metadataZoneName || preset.zoneName,
    cameraAngleType: cameraAngleType || preset.cameraAngleType,
    spatialRole: spatialRole || preset.spatialRole,
  }
}

export function resolveStoredOrInferredVenueSpatialMetadata(asset: VenueSpatialAsset, location?: string): VenueSpatialMetadata {
  return readStoredVenueSpatialMetadata(asset) ?? resolveVenueSpatialMetadata(asset, location)
}

export function applyVenueSpatialMetadataToAssetMetadata(asset: VenueSpatialAsset, location?: string): Record<string, unknown> {
  const spatial = resolveVenueSpatialMetadata(asset, location)
  const existing = isRecord(asset.metadata) ? asset.metadata : {}

  return {
    ...existing,
    [VENUE_SPATIAL_METADATA_KEY]: spatial,
    [VENUE_SPATIAL_METADATA_STATUS_KEY]: "complete",
    [VENUE_SPATIAL_METADATA_VERSION_KEY]: VENUE_SPATIAL_METADATA_VERSION,
    spatial_zone_id: inferVenueSpatialZoneId(asset, location),
    zone: spatial.zoneName,
    camera_angle_type: spatial.cameraAngleType,
    spatial_role: spatial.spatialRole,
    table_shape: spatial.seating.tableShapes.join(", "),
    table_material: spatial.seating.tableMaterials.join(", "),
    table_edge: spatial.seating.tableEdgeDetails.join(", "),
    seating: spatial.seating.seatingFamily.join(", "),
    chair_color: spatial.seating.chairColors.join(", "),
    booth_type: spatial.seating.boothTypes.join(", "),
    lighting: spatial.lighting.lightingTemperature,
    chandelier_style: spatial.lighting.chandelierStyle,
    mirror_reflection_behavior: spatial.architecture.mirrorUsage,
    background_constraints: spatial.preservationRules.join(" "),
    do_not_invent: spatial.preservationRules.join(" "),
    venue_spatial_extraction_method: "deterministic_seeded_spatial_backfill",
  }
}

export function getAssetMetadataCompleteness(asset: VenueSpatialAsset): VenueSpatialMetadataCompleteness {
  if (!isVenueLikeSpatialAsset(asset)) return "complete"
  const metadata = readStoredVenueSpatialMetadata(asset)
  if (!metadata) return "missing"

  const checks = [
    hasText(metadata.zoneName),
    hasText(metadata.cameraAngleType),
    hasText(metadata.spatialRole),
    isRecord(metadata.architecture) && hasText(metadata.architecture.ceilingType) && hasText(metadata.architecture.ceilingPattern) && hasTextArray(metadata.architecture.wallMaterials) && hasTextArray(metadata.architecture.floorMaterials) && hasText(metadata.architecture.mirrorUsage) && hasTextArray(metadata.architecture.lightingFixtures),
    isRecord(metadata.seating) && hasTextArray(metadata.seating.seatingFamily) && hasTextArray(metadata.seating.chairColors) && hasTextArray(metadata.seating.boothTypes) && hasTextArray(metadata.seating.tableShapes) && hasTextArray(metadata.seating.tableMaterials) && hasTextArray(metadata.seating.tableEdgeDetails),
    isRecord(metadata.layout) && hasText(metadata.layout.circulationStyle) && hasText(metadata.layout.density) && hasText(metadata.layout.tableSpacing) && hasText(metadata.layout.walkwayVisibility) && hasText(metadata.layout.focalAxis),
    isRecord(metadata.lighting) && hasTextArray(metadata.lighting.timeCompatibility) && hasText(metadata.lighting.lightingTemperature) && hasText(metadata.lighting.chandelierStyle) && hasText(metadata.lighting.ambientDirection),
    hasTextArray(metadata.preservationRules),
  ]
  const passed = checks.filter(Boolean).length
  if (passed === checks.length) return "complete"
  return passed === 0 ? "missing" : "partial"
}

export function resolveVenueSpatialMetadataList(assets: VenueSpatialAsset[], location?: string) {
  return assets.map(asset => resolveStoredOrInferredVenueSpatialMetadata(asset, location))
}

export function missingVenueSpatialMetadataFields(asset: VenueSpatialAsset) {
  const metadata = resolveVenueSpatialMetadata(asset)
  const missing: string[] = []
  if (metadata.zoneName === VENUE_SPATIAL_ZONE_PRESETS.unknown.zoneName) missing.push("zone identity")
  if (metadata.seating.tableShapes.length === 0) missing.push("table family")
  if (metadata.seating.seatingFamily.length === 0) missing.push("seating family")
  if (metadata.architecture.lightingFixtures.length === 0) missing.push("fixture family")
  if (metadata.layout.focalAxis === "source camera axis" && inferVenueSpatialZoneId(asset) === "unknown") missing.push("camera angle identity")
  return missing
}

export function venueSpatialDisplaySummary(metadata: VenueSpatialMetadata) {
  return {
    zoneName: metadata.zoneName,
    seatingFamily: metadata.seating.seatingFamily.slice(0, 2).join(", "),
    tableFamily: [
      metadata.seating.tableShapes[0],
      metadata.seating.tableMaterials[0],
      metadata.seating.tableEdgeDetails[0],
    ].filter(Boolean).join(" / "),
    chandelierFamily: metadata.lighting.chandelierStyle,
    spatialType: metadata.spatialRole,
    circulationStyle: metadata.layout.circulationStyle,
    cameraAngleType: metadata.cameraAngleType,
    preservationRules: metadata.preservationRules,
  }
}

export function buildVenueSpatialPrompt(metadataList: VenueSpatialMetadata[]) {
  if (metadataList.length === 0) return ""
  const lines = metadataList.slice(0, 4).flatMap((metadata, index) => {
    const label = `Venue ${index + 1}: ${metadata.zoneName}`
    const surfaceTruth = [
      metadata.seating.tableMaterials[0],
      metadata.seating.tableEdgeDetails[0],
    ].filter(Boolean).join(" / ")
    const seatingTruth = [
      metadata.seating.seatingFamily[0],
      metadata.seating.chairColors[0],
      metadata.seating.boothTypes[0],
    ].filter(Boolean).join(" / ")
    const keyMaterials = [
      ...metadata.architecture.wallMaterials.slice(0, 2),
      ...metadata.architecture.floorMaterials.slice(0, 1),
    ].filter(Boolean).join(", ")
    const lighting = [
      metadata.lighting.lightingTemperature,
      metadata.architecture.lightingFixtures[0],
    ].filter(Boolean).join(" / ")
    return [
      `- ${label}`,
      surfaceTruth ? `  surface_table_truth => ${surfaceTruth}` : "",
      seatingTruth ? `  seating_truth => ${seatingTruth}` : "",
      keyMaterials ? `  key_materials => ${keyMaterials}` : "",
      lighting ? `  lighting => ${lighting}` : "",
      metadata.preservationRules[0] ? `  do_not_invent => ${metadata.preservationRules[0]}` : "",
    ].filter(Boolean)
  })
  return `[VENUE_TRUTH]\n${lines.join("\n")}\n- image_priority => selected venue image overrides metadata.\n- text_role => concise clarification only; do not reconstruct the venue from text.`
}

function metadataTextValue(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    if (Array.isArray(value)) {
      const text = value.map(String).map(item => item.trim()).filter(Boolean).join(", ")
      if (text) return text
    }
  }
  return ""
}

export function readSimplifiedInteriorVenueTruth(asset: VenueSpatialAsset) {
  if (!isRecord(asset.metadata)) return null
  const metadata = asset.metadata as Record<string, unknown>
  const surfaceTableTruth = metadataTextValue(metadata, ["surface_table_truth", "surfaceTableTruth", "surface", "table_material"])
  const seatingTruth = metadataTextValue(metadata, ["seating_truth", "seatingTruth", "seating", "seating_family"])
  const keyMaterials = metadataTextValue(metadata, ["key_materials", "keyMaterials", "materials", "material"])
  const lighting = metadataTextValue(metadata, ["lighting"])
  const architectureSpatialFeatures = metadataTextValue(metadata, ["architecture_spatial_features", "architectureSpatialFeatures", "features", "spatial_features"])
  const doNotInvent = metadataTextValue(metadata, ["do_not_invent", "doNotInvent"])
  const bestUse = metadataTextValue(metadata, ["best_use", "bestUse", "usage", "usage_notes"])
  const hasSimplifiedTruth = Boolean(surfaceTableTruth || seatingTruth || keyMaterials || architectureSpatialFeatures || bestUse)
  if (!hasSimplifiedTruth) return null
  return {
    areaZone: metadataTextValue(metadata, ["zone", "area_zone", "venue_zone", "name", "title"]) || asset.file_name || "Interior",
    category: metadataTextValue(metadata, ["category"]) || "Interior",
    surfaceTableTruth,
    seatingTruth,
    keyMaterials,
    lighting,
    architectureSpatialFeatures,
    doNotInvent,
    bestUse,
    tags: metadataTextValue(metadata, ["tags"]),
  }
}

export function buildSimplifiedInteriorVenueTruthPrompt(assets: VenueSpatialAsset[]) {
  const truths = assets.map(readSimplifiedInteriorVenueTruth).filter((truth): truth is NonNullable<ReturnType<typeof readSimplifiedInteriorVenueTruth>> => Boolean(truth))
  if (truths.length === 0) return ""
  const lines = truths.slice(0, 4).flatMap((truth, index) => [
    `- Venue ${index + 1}: ${truth.areaZone}`,
    truth.surfaceTableTruth ? `  surface_table_truth => ${truth.surfaceTableTruth}` : "",
    truth.seatingTruth ? `  seating_truth => ${truth.seatingTruth}` : "",
    truth.keyMaterials ? `  key_materials => ${truth.keyMaterials}` : "",
    truth.lighting ? `  lighting => ${truth.lighting}` : "",
    truth.architectureSpatialFeatures ? `  architecture_features => ${truth.architectureSpatialFeatures}` : "",
    truth.doNotInvent ? `  do_not_invent => ${truth.doNotInvent}` : "",
    truth.bestUse ? `  best_use => ${truth.bestUse}` : "",
  ].filter(Boolean))
  return `[VENUE_TRUTH]\n${lines.join("\n")}\n- image_priority => selected venue image overrides metadata.\n- text_role => concise clarification only; do not reconstruct the venue from text.`
}

export function buildCompactSimplifiedInteriorVenueTruthSummary(assets: VenueSpatialAsset[]) {
  const truths = assets.map(readSimplifiedInteriorVenueTruth).filter(Boolean) as NonNullable<ReturnType<typeof readSimplifiedInteriorVenueTruth>>[]
  if (truths.length === 0) return ""
  return truths.slice(0, 3).map(truth => [
    truth.areaZone,
    truth.surfaceTableTruth ? `surface ${truth.surfaceTableTruth}` : "",
    truth.seatingTruth ? `seating ${truth.seatingTruth}` : "",
    truth.keyMaterials ? `materials ${truth.keyMaterials}` : "",
    truth.lighting ? `lighting ${truth.lighting}` : "",
    truth.architectureSpatialFeatures ? `features ${truth.architectureSpatialFeatures}` : "",
  ].filter(Boolean).join(" · ")).join("; ")
}

export function buildCompactVenueSpatialSummary(metadataList: VenueSpatialMetadata[]) {
  if (metadataList.length === 0) return ""
  return metadataList.slice(0, 3).map(metadata => {
    const display = venueSpatialDisplaySummary(metadata)
    return [
      display.zoneName,
      `tables ${display.tableFamily}`,
      `seating ${display.seatingFamily}`,
      `fixtures ${display.chandelierFamily}`,
    ].filter(Boolean).join(" · ")
  }).join("; ")
}
