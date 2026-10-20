import type { VenueSpatialMetadata } from "./venue-spatial-metadata"

export type VenueBackgroundPresetCategory =
  | "surface"
  | "table"
  | "booth"
  | "bar"
  | "curtain"
  | "chair"
  | "arch"
  | "terrace"
  | "lighting"
  | "mixed"

export type VenueBackgroundPresetUseCase =
  | "product_photography"
  | "venue_plate"
  | "environment_base"
  | "compositing_base"
  | "surface_texture"
  | "product_background"
  | "material_reference"
  | "story_background"
  | "graphic_design"

export type VenueBackgroundPreset = {
  id: string
  clientId: string
  name: string
  category: VenueBackgroundPresetCategory
  sourceVenueAssetIds: string[]
  imageUrl?: string
  prompt?: string
  zoneName?: string
  surfaceMaterial?: string
  seatingFamily?: string
  tableFamily?: string
  lightingFamily?: string
  cameraAngle?: string
  productCompatibility?: string[]
  workflowType: "focused_venue_plate" | "surface_texture_background"
  useCases: VenueBackgroundPresetUseCase[]
  preservationRules: string[]
  status: "draft" | "approved" | "needs_review"
  createdAt: string
}

export type VenuePhotographyTemplateId = "focused_venue_plate" | "surface_texture_background"

export const VENUE_PHOTOGRAPHY_TEMPLATES: Array<{
  id: VenuePhotographyTemplateId
  label: string
  purpose: string
  promptFocus: string
}> = [
  {
    id: "focused_venue_plate",
    label: "Focused Venue Plate",
    purpose: "Create reusable clean venue angles from real interior/exterior references. No models, no food, no table settings.",
    promptFocus: "clean source-truth venue plate for future compositing and campaign blocking",
  },
  {
    id: "surface_texture_background",
    label: "Surface / Texture Background",
    purpose: "Create isolated brand surfaces and material backgrounds for product photography. No plates, no cutlery, no props.",
    promptFocus: "isolated DemoClientD material, surface, or texture reference for future product photography backgrounds",
  },
]

const createdAt = "2026-05-26T00:00:00.000Z"

function preset(input: Omit<VenueBackgroundPreset, "clientId" | "sourceVenueAssetIds" | "status" | "createdAt"> & { status?: VenueBackgroundPreset["status"] }): VenueBackgroundPreset {
  return {
    clientId: "democlientd",
    sourceVenueAssetIds: [],
    status: input.status ?? "approved",
    createdAt,
    ...input,
  }
}

export const FOCUSED_VENUE_PLATE_PRESETS: VenueBackgroundPreset[] = [
  preset({
    id: "democlientd_blue_booth_angle",
    name: "Blue Booth Angle",
    workflowType: "focused_venue_plate",
    category: "booth",
    zoneName: "Blue Booth Lounge",
    surfaceMaterial: "source-visible booth table/booth-adjacent surface only",
    seatingFamily: "curved blue booth seating / blue velvet lounge banquette",
    tableFamily: "source-visible booth table only if present in source",
    lightingFamily: "warm intimate lounge lighting",
    cameraAngle: "tight clean booth perspective with curved seating depth",
    productCompatibility: ["future lifestyle compositing", "date night campaign base", "cocktail/dessert compositing later"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background"],
    preservationRules: ["No table setting, plates, cutlery, glasses, people, or props.", "Preserve curved blue booth geometry and upholstery color.", "Do not replace booth seating with freestanding chairs."],
  }),
  preset({
    id: "democlientd_dining_table_angle",
    name: "Dining Table Angle",
    workflowType: "focused_venue_plate",
    category: "table",
    zoneName: "Interior Dining Tables",
    surfaceMaterial: "source-visible dining table surface",
    seatingFamily: "blue velvet rounded dining chairs with bronze/gold trim",
    tableFamily: "round dining table / source-visible table geometry",
    lightingFamily: "warm chandelier dining light",
    cameraAngle: "clean focused dining table angle with usable foreground space",
    productCompatibility: ["future lunch/dinner compositing", "social table blocking", "campaign object compositing"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background"],
    preservationRules: ["No food, drinks, plates, napkins, cutlery, table setting, or invented props.", "Preserve chair/table spacing and source camera perspective.", "Do not add new tables or change furniture family."],
  }),
  preset({
    id: "democlientd_bar_counter_angle",
    name: "Bar Counter Angle",
    workflowType: "focused_venue_plate",
    category: "bar",
    zoneName: "Main Bar",
    surfaceMaterial: "dark polished bar counter",
    seatingFamily: "source-visible bar seating only",
    tableFamily: "linear bar counter with back-bar depth",
    lightingFamily: "warm back-bar glow and bar pendant highlights",
    cameraAngle: "counter-facing bar axis or clean bar corner angle",
    productCompatibility: ["future cocktail compositing", "Traffic Hours campaign base", "bar ritual blocking"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background"],
    preservationRules: ["No bottles, glasses, cocktail props, hands, people, or fake serviceware unless already source-visible.", "Preserve counter geometry and back-bar axis.", "Do not convert bar zone into dining table scene."],
  }),
  preset({
    id: "democlientd_terrace_table_angle",
    name: "Terrace Table Angle",
    workflowType: "focused_venue_plate",
    category: "terrace",
    zoneName: "Terrace Edge",
    surfaceMaterial: "source-visible outdoor table/terrace surface",
    seatingFamily: "source-visible exterior terrace seating",
    tableFamily: "outdoor terrace table family",
    lightingFamily: "source-matched outdoor daylight or warm terrace light",
    cameraAngle: "clean exterior terrace table angle with edge/railing awareness",
    productCompatibility: ["future outdoor food/drink compositing", "breakfast/lunch terrace campaign base"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background"],
    preservationRules: ["No table settings, plates, glasses, guests, or fake outdoor props.", "Do not convert terrace into interior dining room.", "Preserve terrace edge, floor material, and outdoor seating family."],
  }),
  preset({
    id: "democlientd_entrance_angle",
    name: "Entrance Angle",
    workflowType: "focused_venue_plate",
    category: "arch",
    zoneName: "Entrance Tunnel",
    surfaceMaterial: "wood arch / architectural portal materials",
    seatingFamily: "none unless source-visible",
    tableFamily: "none unless source-visible",
    lightingFamily: "warm integrated portal lighting",
    cameraAngle: "front-facing entrance portal or axial arrival perspective",
    productCompatibility: ["arrival campaign base", "brand atmosphere", "future model compositing"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background", "graphic_design"],
    preservationRules: ["No tables, food, props, people, or serviceware.", "Preserve portal geometry and source camera axis.", "Keep circulation path clear."],
  }),
  preset({
    id: "democlientd_mirror_dining_angle",
    name: "Mirror Dining Angle",
    workflowType: "focused_venue_plate",
    category: "lighting",
    zoneName: "Mirror Dining Hall",
    surfaceMaterial: "source-visible dining surfaces with mirror/reflection context",
    seatingFamily: "blue velvet dining seating",
    tableFamily: "round dining tables",
    lightingFamily: "mirrored ceiling chandelier reflections",
    cameraAngle: "wide mirrored dining angle with ceiling/reflection continuity",
    productCompatibility: ["dinner atmosphere base", "luxury campaign compositing", "venue hero plate"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background", "graphic_design"],
    preservationRules: ["No table settings, plates, napkins, cutlery, or fake guests.", "Preserve mirrored ceiling continuity and reflection alignment.", "Keep chandelier and table repetition physically aligned."],
  }),
  preset({
    id: "democlientd_wooden_arch_angle",
    name: "Wooden Arch Angle",
    workflowType: "focused_venue_plate",
    category: "arch",
    zoneName: "Entrance Tunnel",
    surfaceMaterial: "warm wood architectural arch system",
    seatingFamily: "none unless source-visible",
    tableFamily: "none unless source-visible",
    lightingFamily: "integrated warm architectural entry light",
    cameraAngle: "axial corridor perspective with locked vanishing point",
    productCompatibility: ["arrival story", "atmosphere base", "future campaign object compositing"],
    useCases: ["venue_plate", "environment_base", "compositing_base", "story_background", "graphic_design"],
    preservationRules: ["No dining tables, guests, food, drinks, or random props.", "Preserve wood arch rhythm and corridor vanishing point.", "Do not add booths, chandeliers, or bar counters."],
  }),
]

export const SURFACE_TEXTURE_BACKGROUND_PRESETS: VenueBackgroundPreset[] = [
  preset({
    id: "democlientd_black_marble_tabletop",
    name: "Black Marble Tabletop",
    workflowType: "surface_texture_background",
    category: "surface",
    zoneName: "Interior High Tables",
    surfaceMaterial: "clean black marble / dark stone tabletop surface",
    seatingFamily: "none in output",
    tableFamily: "surface crop only, no full table scene",
    lightingFamily: "subtle warm reflection over dark stone",
    cameraAngle: "isolated tabletop crop",
    productCompatibility: ["food", "drinks", "desserts", "cocktail details", "luxury product photography"],
    useCases: ["surface_texture", "product_background", "material_reference", "product_photography"],
    preservationRules: ["No plates, cutlery, napkins, glasses, food, drinks, hands, or props.", "Show clean black marble surface only.", "Do not include a full restaurant scene."],
  }),
  preset({
    id: "democlientd_blue_curtain_texture",
    name: "Blue Curtain Texture",
    workflowType: "surface_texture_background",
    category: "curtain",
    zoneName: "Interior Dining Tables",
    surfaceMaterial: "blue curtain fabric / dark textile backdrop",
    seatingFamily: "none in output",
    tableFamily: "none",
    lightingFamily: "warm soft light on blue fabric",
    cameraAngle: "isolated curtain/background crop",
    productCompatibility: ["graphic design", "product background", "luxury editorial backdrops"],
    useCases: ["surface_texture", "product_background", "material_reference", "graphic_design"],
    preservationRules: ["No restaurant scene, people, table, plates, cutlery, or props.", "Focus on blue fabric color and texture only.", "Do not invent windows or full dining context."],
  }),
  preset({
    id: "democlientd_wooden_table_surface",
    name: "Wooden Table Surface",
    workflowType: "surface_texture_background",
    category: "table",
    zoneName: "Interior Dining Tables",
    surfaceMaterial: "clean warm wooden table surface",
    seatingFamily: "none in output",
    tableFamily: "surface crop only, no full table setup",
    lightingFamily: "soft warm hospitality light",
    cameraAngle: "isolated wooden tabletop crop",
    productCompatibility: ["breakfast", "lunch", "comfort dishes", "third-culture storytelling"],
    useCases: ["surface_texture", "product_background", "material_reference", "product_photography"],
    preservationRules: ["No plates, napkins, cutlery, glasses, food, drinks, hands, or props.", "Use clean wood grain/surface only.", "Do not create a table setting."],
  }),
  preset({
    id: "democlientd_bar_counter_surface",
    name: "Bar Counter Surface",
    workflowType: "surface_texture_background",
    category: "bar",
    zoneName: "Main Bar",
    surfaceMaterial: "clean dark polished bar counter surface",
    seatingFamily: "none in output",
    tableFamily: "surface crop only, no full bar scene",
    lightingFamily: "warm bar reflection on polished counter",
    cameraAngle: "isolated counter crop",
    productCompatibility: ["cocktails", "glassware later", "Traffic Hours product backgrounds"],
    useCases: ["surface_texture", "product_background", "material_reference", "product_photography"],
    preservationRules: ["No bottles, glasses, hands, food, drink, napkins, cutlery, or props.", "Focus on counter material only.", "Do not show a full bar composition unless explicitly required."],
  }),
  preset({
    id: "democlientd_red_chair_fabric",
    name: "Red Chair Fabric",
    workflowType: "surface_texture_background",
    category: "chair",
    zoneName: "Interior Dining Corner",
    surfaceMaterial: "red chair upholstery/fabric texture",
    seatingFamily: "red chair fabric detail only",
    tableFamily: "none",
    lightingFamily: "warm interior fabric highlight",
    cameraAngle: "tight fabric/material detail",
    productCompatibility: ["graphic design", "color texture references", "editorial background detail"],
    useCases: ["surface_texture", "material_reference", "graphic_design"],
    preservationRules: ["No full chair scene, table, food, plates, people, or props.", "Use only if red chair material is source-supported.", "Do not import red seating into blue zones."],
    status: "needs_review",
  }),
  preset({
    id: "democlientd_blue_chair_fabric",
    name: "Blue Chair Fabric",
    workflowType: "surface_texture_background",
    category: "chair",
    zoneName: "Interior Dining Tables",
    surfaceMaterial: "blue velvet chair fabric / upholstery texture",
    seatingFamily: "blue velvet fabric detail only",
    tableFamily: "none",
    lightingFamily: "warm highlight on blue velvet",
    cameraAngle: "tight fabric/material detail",
    productCompatibility: ["graphic design", "luxury editorial background texture", "color reference"],
    useCases: ["surface_texture", "material_reference", "graphic_design"],
    preservationRules: ["No full chair scene, people, tables, food, or props.", "Preserve blue velvet color and premium texture.", "Do not include a table setup."],
  }),
  preset({
    id: "democlientd_wooden_arch_detail",
    name: "Wooden Arch Detail",
    workflowType: "surface_texture_background",
    category: "arch",
    zoneName: "Entrance Tunnel",
    surfaceMaterial: "warm wood architectural arch detail",
    seatingFamily: "none",
    tableFamily: "none",
    lightingFamily: "warm integrated architectural light",
    cameraAngle: "tight material/arch detail crop",
    productCompatibility: ["graphic design", "atmosphere texture", "brand background"],
    useCases: ["surface_texture", "material_reference", "graphic_design", "product_background"],
    preservationRules: ["No corridor scene, people, tables, food, or props.", "Focus on wood material and arch detail only.", "Do not add furniture or service elements."],
  }),
  preset({
    id: "democlientd_mirror_ceiling_texture",
    name: "Mirror Ceiling Texture",
    workflowType: "surface_texture_background",
    category: "lighting",
    zoneName: "Mirror Dining Hall",
    surfaceMaterial: "mirror ceiling / chandelier reflection texture",
    seatingFamily: "none in output",
    tableFamily: "none in output",
    lightingFamily: "warm chandelier reflection rhythm",
    cameraAngle: "tight reflected ceiling/material crop",
    productCompatibility: ["luxury backgrounds", "graphic texture", "editorial atmosphere"],
    useCases: ["surface_texture", "material_reference", "graphic_design", "product_background"],
    preservationRules: ["No dining tables, chairs, people, plates, or props.", "Preserve mirror/reflection rhythm physically.", "Do not invent impossible reflected elements."],
  }),
  preset({
    id: "democlientd_terrace_floor_texture",
    name: "Terrace Floor Texture",
    workflowType: "surface_texture_background",
    category: "terrace",
    zoneName: "Terrace Edge",
    surfaceMaterial: "clean terrace floor/outdoor material texture",
    seatingFamily: "none in output",
    tableFamily: "none in output",
    lightingFamily: "source-matched outdoor light",
    cameraAngle: "isolated floor/material crop",
    productCompatibility: ["outdoor product context", "breakfast/lunch terrace backgrounds", "graphic texture"],
    useCases: ["surface_texture", "product_background", "material_reference", "product_photography"],
    preservationRules: ["No table, chairs, plates, glasses, food, drinks, people, or props.", "Focus on terrace material only.", "Do not create a full outdoor restaurant scene."],
  }),
]

export const DEFAULT_DEMOCLIENTD_BACKGROUND_PRESETS: VenueBackgroundPreset[] = [
  ...FOCUSED_VENUE_PLATE_PRESETS,
  ...SURFACE_TEXTURE_BACKGROUND_PRESETS,
]

export function backgroundPresetPromptLine(preset: VenueBackgroundPreset) {
  return [
    `${preset.name}`,
    preset.zoneName ? `zone ${preset.zoneName}` : "",
    preset.surfaceMaterial ? `surface ${preset.surfaceMaterial}` : "",
    preset.tableFamily ? `table ${preset.tableFamily}` : "",
    preset.seatingFamily ? `seating ${preset.seatingFamily}` : "",
    preset.lightingFamily ? `lighting ${preset.lightingFamily}` : "",
    preset.cameraAngle ? `camera ${preset.cameraAngle}` : "",
  ].filter(Boolean).join(" · ")
}

export function buildBackgroundPresetPrompt(presets: VenueBackgroundPreset[]) {
  if (presets.length === 0) return ""
  return `[BACKGROUND_PRESET]\n${presets.map((preset, index) => {
    return [
      `- Preset ${index + 1}: ${backgroundPresetPromptLine(preset)}`,
      `  preset_type => ${preset.workflowType === "focused_venue_plate" ? "Focused Venue Plate / full venue compositing base" : "Surface / Texture Background / isolated material reference"}`,
      `  use_cases => ${preset.useCases.join(", ")}`,
      `  status => ${preset.status}`,
      `  product_compatibility => ${(preset.productCompatibility ?? []).join(", ") || "general venue background"}`,
      `  preservation => ${preset.preservationRules.join(" ")}`,
    ].join("\n")
  }).join("\n")}\n- Use selected approved DemoClientD background presets as controlled brand backgrounds.\n- Keep full venue plates and isolated surface textures conceptually separate.\n- Focused Venue Plate presets preserve venue geometry for future compositing bases.\n- Surface / Texture Background presets preserve isolated materials only and should not become full dining scenes.`
}

export function isFocusedVenuePlatePreset(preset: VenueBackgroundPreset) {
  return preset.workflowType === "focused_venue_plate"
}

export function isSurfaceTextureBackgroundPreset(preset: VenueBackgroundPreset) {
  return preset.workflowType === "surface_texture_background"
}

export function venuePhotographySaveTags(template: VenuePhotographyTemplateId) {
  return template === "focused_venue_plate"
    ? ["venue_plate", "environment_base", "compositing_base"]
    : ["surface_texture", "product_background", "material_reference"]
}

export function buildVenuePhotographyPrompt(input: {
  clientName: string
  template: VenuePhotographyTemplateId
  sourceVenueLabels: string[]
  selectedPresets: VenueBackgroundPreset[]
  venueSpatialPrompt: string
  aspectRatio: string
  directorNotes?: string
}) {
  const template = VENUE_PHOTOGRAPHY_TEMPLATES.find(item => item.id === input.template) ?? VENUE_PHOTOGRAPHY_TEMPLATES[0]
  const backgroundPresetBlock = buildBackgroundPresetPrompt(input.selectedPresets)
  return [
    `[SCENE]\n- client: ${input.clientName}\n- output: venue-only photography plate\n- format: ${input.aspectRatio}\n- template: ${template.label}\n- purpose: ${template.promptFocus}`,
    `[VENUE_PHOTOGRAPHY_RULES]\nThis workflow is venue/material preparation only.\nNo people. No models. No guests. No hands.\nNo paid generation unless the user explicitly clicks generate.\nDo not confuse full venue plates with isolated surface/texture backgrounds.`,
    input.template === "focused_venue_plate"
      ? `[FOCUSED_VENUE_PLATE]\nCreate a clean reusable venue plate from the selected interior/exterior source image.\nPreserve the real venue architecture, seating family, table family, lighting fixtures, materials, and spatial geometry.\nFocus on one usable table, booth, bar, terrace, or architectural zone.\nNo people, no models, no guests, no hands.\nNo food, no drinks, no plates, no cutlery, no napkins, no table setting.\nNo fake props.\nNo invented furniture.\nNo redesigned interior/exterior.\nThis output is a future compositing base for adding people, food, drinks, or campaign objects later.`
      : `[SURFACE_TEXTURE_BACKGROUND]\nCreate a clean isolated DemoClientD-branded material/surface/background reference from the selected source image.\nFocus only on the selected material or surface: black marble, blue curtain, wooden table, bar counter, red chair fabric, blue chair fabric, wooden arch, mirror ceiling, terrace floor, or similar.\nNo people, no models, no guests, no hands.\nNo food, no drinks, no plates, no cutlery, no napkins, no glasses.\nNo table setting.\nNo full dining scene unless explicitly required.\nNo props.\nThis output is for future product photography backgrounds and texture references.`,
    input.sourceVenueLabels.length > 0
      ? `[SOURCE_VENUE_REFERENCES]\n${input.sourceVenueLabels.map((label, index) => `- Source ${index + 1}: ${label}`).join("\n")}\n- Source refs are spatial/architectural truth, not loose inspiration.`
      : `[SOURCE_VENUE_REFERENCES]\n- Select an interior/exterior source before generation.`,
    input.venueSpatialPrompt,
    backgroundPresetBlock,
    input.directorNotes?.trim()
      ? `[DIRECTOR_NOTES]\n- ${input.directorNotes.replace(/\s+/g, " ").trim()}\n- Notes may refine crop, zone purpose, or material focus only; they cannot add people, props, table settings, or redesign venue.`
      : "",
    input.template === "focused_venue_plate"
      ? `[STRICT_NEGATIVE]\n- no people\n- no models\n- no guests\n- no hands\n- no food\n- no drinks\n- no plates\n- no cutlery\n- no napkins\n- no table setting\n- no extra props\n- no fake serviceware\n- no invented furniture\n- no redesigned venue\n- no changed ceiling/walls/floor\n- no different restaurant\n- no venue hallucination`
      : `[STRICT_NEGATIVE]\n- no people\n- no models\n- no guests\n- no hands\n- no food\n- no drinks\n- no plates\n- no cutlery\n- no napkins\n- no glasses\n- no table setting\n- no furniture scene\n- no full restaurant scene unless explicitly required\n- no props`,
  ].filter(Boolean).join("\n\n")
}

export function backgroundPresetFromSpatialMetadata(metadata: VenueSpatialMetadata, clientId = "democlientd"): VenueBackgroundPreset {
  return {
    id: `spatial_${metadata.venueId}`,
    clientId,
    name: `${metadata.zoneName} Plate`,
    workflowType: "focused_venue_plate",
    category: metadata.zoneName.toLowerCase().includes("bar")
      ? "bar"
      : metadata.zoneName.toLowerCase().includes("booth")
        ? "booth"
        : metadata.zoneName.toLowerCase().includes("terrace")
          ? "terrace"
          : "mixed",
    sourceVenueAssetIds: [metadata.venueId],
    zoneName: metadata.zoneName,
    surfaceMaterial: metadata.seating.tableMaterials.join(", "),
    seatingFamily: metadata.seating.seatingFamily.join(", "),
    tableFamily: [...metadata.seating.tableShapes, ...metadata.seating.tableEdgeDetails].filter(Boolean).join(", "),
    lightingFamily: metadata.lighting.chandelierStyle,
    cameraAngle: metadata.cameraAngleType,
    useCases: ["venue_plate", "environment_base", "compositing_base", "product_photography"],
    preservationRules: metadata.preservationRules,
    status: "draft",
    createdAt: new Date().toISOString(),
  }
}
