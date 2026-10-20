import { buildPermanentPromptV2LearningBlock, PROMPT_V2_PERMANENT_FAILURE_LINES } from "./generation-mistake-memory"
import { DEMOCLIENTB_VENUE_MEMORY_LINES, buildDemoClientBVenueLockBlock, buildSubjectPlacementLockBlock, isDemoClientBClient } from "./client-venue-truth"

export type PromptV2AssetRole =
  | "model_truth"
  | "outfit_truth"
  | "accessory_truth"
  | "food_truth"
  | "drink_truth"
  | "venue_truth"
  | "composition_reference"
  | "style_inspiration"

export type PromptV2DetailLevel = "Compact" | "Standard" | "Detailed" | "Ultra Detailed"

export type PromptV2VenueReasoningMode =
  | "locked_scene_plate"
  | "nano_banana_pro_visual_truth"
  | "flexible_venue_context"
  | "material_atmosphere_reference"

export type PromptV2AssetContext = {
  id: string
  role: PromptV2AssetRole
  title: string
  category?: string | null
  owner?: string | null
  metadata?: Record<string, unknown> | null
  summary?: string | null
  continuityNotes?: string[]
  riskWarnings?: string[]
}

export type PromptV2Input = {
  clientName: string
  workflow: "lifestyle_photography" | "product_photography" | "reference_rebuild" | "videography"
  provider: "nano_banana_pro" | string
  deterministicPrompt: string
  userCreativeDirection: string
  detailLevel?: PromptV2DetailLevel
  campaign?: string
  visualDna?: string[]
  selectedAssets: PromptV2AssetContext[]
  providerCapabilities?: Record<string, unknown>
  pastFailures?: string[]
  settings?: Record<string, unknown>
}

export type PromptV2Output = {
  summary: string
  dominantCreativeGoal: string
  venueReasoningMode: PromptV2VenueReasoningMode
  venueReasoningWhy: string
  providerCompatibility: string
  priorityHierarchy: string[]
  referenceRoles: string[]
  mustPreserve: string[]
  allowedFlex: string[]
  riskWarnings: string[]
  providerStrategy: string
  assetContinuityNotes: {
    models: string[]
    outfits: string[]
    accessories: string[]
    food: string[]
    drinks: string[]
    venue: string[]
  }
  failureCorrections: string[]
  finalPrompt: string
  negativePrompt: string
  qaChecklist: string[]
}

export type PromptV2Response = {
  success: boolean
  configured?: boolean
  provider?: "anthropic"
  model?: string
  promptV2: PromptV2Output
  rawText?: string
  error?: string
}

const FALLBACK_OUTPUT: PromptV2Output = {
  summary: "Prompt V2 fallback: deterministic truth hierarchy preserved.",
  dominantCreativeGoal: "Create a premium realistic hospitality image from selected truth assets and director notes.",
  venueReasoningMode: "flexible_venue_context",
  venueReasoningWhy: "Lifestyle photography uses the venue as atmosphere, material language, lighting, and furniture-family context unless exact venue-plate generation is explicitly requested.",
  providerCompatibility: "Compatible with Nano Banana Pro best-effort multi-reference generation. No scene-plate structure lock is required.",
  priorityHierarchy: [
    "User locked fields and manual overrides",
    "Approved truth asset metadata",
    "Creative Director Notes",
    "Visual DNA and campaign style",
    "Inspiration references",
    "Provider capability constraints",
  ],
  referenceRoles: [],
  mustPreserve: [
    "selected truth asset identity",
    "food/drink truth",
    "venue truth when selected",
    "director notes",
    "exact visible venue table material when visible; never assume black marble when the venue image shows another material",
    "exact Studio Food Shot dish presentation",
    "1 fork and 1 knife per seated guest",
  ],
  allowedFlex: ["crop refinement", "lighting polish", "background simplification when no venue truth is selected"],
  riskWarnings: [],
  providerStrategy: "Use Nano Banana Pro with explicit role ordering and concise hard-preservation language.",
  assetContinuityNotes: {
    models: [],
    outfits: [],
    accessories: [],
    food: [],
    drinks: [],
    venue: [],
  },
  failureCorrections: PROMPT_V2_PERMANENT_FAILURE_LINES,
  finalPrompt: "",
  negativePrompt: "No wrong dish. No food reinterpretation. No generic table material. No black marble unless visibly present in venue truth. No red lacquer DemoClientB table when the venue shows reflective mirror/glass tabletop. No swapped left/right subject placement. No duplicate forks. No duplicate knives. No extra place settings. No wrong model. No wrong outfit. No wrong accessory. No invented props. No venue hallucination. No distorted hands. No plastic skin.",
  qaChecklist: ["Confirm all selected references are attached in the provider payload.", "Confirm final prompt preserves truth hierarchy."],
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map(item => item.trim()).filter(Boolean)
    : typeof value === "string" && value.trim()
      ? value.split(/\n|,/).map(item => item.trim()).filter(Boolean)
      : []
}

function mergePermanentFailureCorrections(items: string[]) {
  return Array.from(new Set([...PROMPT_V2_PERMANENT_FAILURE_LINES, ...items].map(item => item.trim()).filter(Boolean)))
}

function normalizeContinuityNotes(value: unknown): PromptV2Output["assetContinuityNotes"] {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    models: normalizeStringArray(record.models),
    outfits: normalizeStringArray(record.outfits),
    accessories: normalizeStringArray(record.accessories),
    food: normalizeStringArray(record.food),
    drinks: normalizeStringArray(record.drinks),
    venue: normalizeStringArray(record.venue),
  }
}

export function fallbackPromptV2(input?: Partial<PromptV2Input>, reason = "Claude Prompt V2 unavailable."): PromptV2Output {
  const selected = input?.selectedAssets ?? []
  const sceneControl = typeof input?.settings?.sceneControl === "string" ? input.settings.sceneControl : ""
  const fallbackVenueReasoningMode: PromptV2VenueReasoningMode = sceneControl === "Nano Banana Pro"
    ? "nano_banana_pro_visual_truth"
    : sceneControl === "Match Locked"
      ? "locked_scene_plate"
      : sceneControl === "Guided"
        ? "flexible_venue_context"
        : sceneControl === "Flexible"
          ? "material_atmosphere_reference"
          : FALLBACK_OUTPUT.venueReasoningMode
  const selectedAssetLines = selected.map(asset => {
    const summary = asset.summary?.trim()
    const category = asset.category?.trim()
    return `- ${asset.role}: ${asset.title}${category ? ` (${category})` : ""}${summary ? ` - ${summary}` : ""}`
  })
  const settingsLines = Object.entries(input?.settings ?? {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `- ${key}: ${String(value)}`)
  const finalPrompt = [
    "[PROMPT_V2_FALLBACK]",
    "Create a premium realistic hospitality image using the Prompt V2 truth hierarchy.",
    input?.clientName ? `Client: ${input.clientName}` : "",
    input?.campaign ? `Campaign: ${input.campaign}` : "",
    input?.workflow ? `Workflow: ${input.workflow}` : "",
    sceneControl ? `Scene Control: ${sceneControl}` : "",
    "[TRUTH_HIERARCHY]\n1. Selected truth assets override creative text.\n2. Creative Director notes override generic style.\n3. Inspiration references guide composition only.\n4. Provider constraints must preserve food, drink, venue, model, outfit, and accessory identity.",
    selectedAssetLines.length ? `[SELECTED_REFERENCE_ROLES]\n${selectedAssetLines.join("\n")}` : "[SELECTED_REFERENCE_ROLES]\nNo selected reference metadata was available. Use the user setup and attached provider references if present.",
    settingsLines.length ? `[GENERATION_SETTINGS]\n${settingsLines.join("\n")}` : "",
    input?.visualDna?.length ? `[VISUAL_DNA]\n${input.visualDna.map(line => `- ${line}`).join("\n")}` : "",
    input?.userCreativeDirection?.trim() ? `[DIRECTOR_NOTES]\n${input.userCreativeDirection.trim()}` : "",
    input?.deterministicPrompt?.trim() ? `[DETERMINISTIC_SETUP]\n${input.deterministicPrompt.trim()}` : "",
  ].filter(Boolean).join("\n\n")
  return {
    ...FALLBACK_OUTPUT,
    summary: reason,
    venueReasoningMode: fallbackVenueReasoningMode,
    venueReasoningWhy: sceneControl === "Nano Banana Pro"
      ? "Nano Banana Pro mode uses the selected venue image as primary truth and keeps text to foreground modifications only."
      : FALLBACK_OUTPUT.venueReasoningWhy,
    referenceRoles: selected.map(asset => `${asset.role}: ${asset.title}`),
    riskWarnings: [
      reason,
      ...selected.flatMap(asset => asset.riskWarnings ?? []),
      ...(input?.pastFailures ?? []).map(failure => `Past failure to avoid: ${failure}`),
    ],
    failureCorrections: mergePermanentFailureCorrections(input?.pastFailures ?? []),
    finalPrompt,
  }
}

export function promptV2SystemPrompt() {
  return [
    "You are Jarvis OS Creative Director Prompt V2 for luxury hospitality AI photography.",
    "Act as a luxury hospitality creative director, food stylist, wardrobe/accessory continuity supervisor, model identity supervisor, and Nano Banana Pro prompt engineer.",
    "Return JSON only. No markdown. No prose outside JSON.",
    "Do not hallucinate metadata as fact. If a detail is missing, say not specified and flag it as a risk.",
    "Hard truth hierarchy: 1 user locked/manual overrides, 2 approved truth asset metadata, 3 Creative Director Notes, 4 Visual DNA/campaign style, 5 inspiration references, 6 provider constraints.",
    "Truth assets are not style inspiration. Preserve exact selected model, outfit, accessory, food, drink, and venue identity wherever metadata is present.",
    "Permanent learning: venue table material truth, food truth compliance, hospitality cutlery minimalism, camera reality lock, and facial realism are mandatory in every dining prompt.",
    "Venue table material truth: if venue truth includes a visible table surface, preserve exact table material, finish, color, texture, trim, and tablecloth layer. Use black marble only when black marble is visibly present in the selected venue image.",
    "DemoClientB venue truth: if input.clientName is DemoClientC and a venue image is selected, venue image truth outranks creative text. Prioritize: 1 Venue Image Truth, 2 Food Truth, 3 Character DNA, 4 Outfit DNA, 5 Creative Direction Text.",
    "DemoClientB venue lock: finalPrompt must include [DEMOCLIENTB_VENUE_LOCK] when DemoClientB venue images are selected. Preserve visible deep red curtains, cream/beige rounded chairs with black metal legs, mirrored/reflective glass tabletops, brass/gold trim, white tablecloth layer, Italian ceramic/oil bottle table styling, warm hospitality lighting, and visible artwork. Red/burgundy tones on the tabletop are reflections from curtains/surroundings, not red lacquer material. Do not replace DemoClientB tables with black marble, red lacquer, or blue chairs unless the selected image visibly shows those elements.",
    "Food truth compliance: selected Studio Food Shots are Food Truth Assets. They must appear as the actual selected dish, not an inspired-by, similar-to, or reinterpreted version. Preserve ingredients, bread type, vessel, garnish, arrangement, portion, and presentation.",
    "Hospitality cutlery rule: for seated guests, each guest receives exactly 1 fork and 1 knife unless the user explicitly requests more. Do not generate duplicate forks, duplicate knives, extra place settings, or unnecessary cutlery.",
    "Accessory preservation is critical. If watch, bag, jewelry, logo, dial, strap, metal, hand placement, or visibility details are missing, flag insufficient metadata.",
    "Food/drink metadata and menu wording are truth. Do not invent allergens, ingredients, plating count, vessels, logos, brands, or architectural facts.",
    "You must choose venueReasoningMode: locked_scene_plate, nano_banana_pro_visual_truth, flexible_venue_context, or material_atmosphere_reference.",
    "Scene Control is binding: Flexible means material_atmosphere_reference, Guided means flexible_venue_context, Nano Banana Pro means nano_banana_pro_visual_truth, Match Locked means locked_scene_plate.",
    "Visual Truth Priority: selected venue images are the primary truth. Do not recreate the venue from text. Text only clarifies visible details. If image and text conflict, prefer the image.",
    "Guided means image-first visible venue reality. The selected venue image is authoritative; use only visible venue elements and do not rebuild the venue from text.",
    "Nano Banana Pro mode means image authority testing. The venue image is the primary truth and text is modifications only. Do not describe venue geometry, ceiling structure, room proportions, shelving axis, architecture depth, or furniture spacing. Use concise blocks only: VISUAL_TRUTH_PRIORITY, SUBJECTS, WARDROBE, ACCESSORIES, FOOD_TRUTH/FOOD, DRINK_TRUTH/DRINKS, DIRECTOR_NOTES/ACTION_LOCK, and minimal NEGATIVE.",
    "Flexible means atmosphere/material reference. It may adapt camera/crop/layout, but must still preserve venue identity, visible table material, selected subject count, and selected food/drink truth.",
    "Match Locked means maximum venue fidelity attempt through the current provider route. It is not a mathematical guarantee, but it should aim to keep the selected interior/exterior reference as close as possible.",
    "Camera Reality Lock: for Guided and Match Locked venue references, preserve the source image's camera family and visible view. Minor crop or tiny camera-distance refinement only. Do not rotate to a new angle, reveal unseen areas, invent new room sections, or redesign the venue around subjects.",
    "When director notes specify action, gaze, smile, hand/object interaction, or primary subject, convert them into explicit action locks in finalPrompt.",
    "Facial Realism Lock: if a model smiles, require natural dental anatomy, realistic smile, realistic gumline, no duplicated teeth, no synthetic teeth, no AI whitening effect, and no distorted mouth geometry.",
    "Subject count is binding. If one model is selected, finalPrompt must forbid a second diner, conversation partner, extra hands, or implied guest. If two models are selected, finalPrompt must specify exactly two visible guests.",
    "Food/drink visibility is binding. Selected food/drink truth assets must remain visible, recognizable, and not reinterpreted.",
    "Architectural truth workflows such as venue photography, venue plates, exact environment preservation, or Match Locked tests use locked_scene_plate.",
    "Lifestyle photography with models, food, drinks, hospitality moments, or director notes defaults to flexible_venue_context: use image-first visible venue reality, preserve visible atmosphere, materials, table material, lighting language, and terrace/interior identity. Do not invent unseen venue elements or rebuild the venue from text.",
    "Pinterest/reference rebuild defaults to material_atmosphere_reference unless exact venue recreation is explicitly requested.",
    "locked_scene_plate is allowed as a high-fidelity provider test even when the provider lacks explicit structure-lock controls. Warn that minor provider drift may happen; do not block generation.",
    "The finalPrompt must be provider-ready, visually specific, and continuity-rich. It is not a summary.",
    "For every selected model, describe identity continuity, face, age/look, hair, skin tone, expression, posture, and relationship energy using provided metadata; if metadata is insufficient, say preserve visible reference identity exactly.",
    "For every selected outfit, describe garment type, color, fit, fabric/texture, sleeve/neckline, silhouette, and assigned model using metadata; if missing, say metadata insufficient and preserve all visible outfit details from the reference image exactly.",
    "For every accessory, describe item type, material, color, shape, placement, logo/brand mark only if visible/specified, watch dial/hands/bezel/strap, bag quilting/clasp/chain/silhouette when relevant.",
    "For every food/drink asset, describe exact dish/drink name, plate/vessel/glass, item count, major components, garnish, sauce, portion arrangement, and placement/guest assignment using metadata and settings.",
    "For every selected Studio Food Shot, explicitly state that it is the Food Truth Asset and must be recreated as the actual dish rather than reinterpreted.",
    "For venue assets, adapt the description to mode: Match Locked makes the venue image the primary visual truth; Guided uses image-first visible venue reality; material reference uses texture/color/setting language only.",
    "For venue assets with visible table surfaces, explicitly preserve exact material, finish, color, texture, trim, reflection behavior, and tablecloth layer. If black marble is visible or listed, write black marble and forbid generic tables; if DemoClientB mirror/glass tabletop with red reflections is visible, write that and forbid black marble or red lacquer.",
    "Subject placement lock: if Creative Director Notes specify who sits left, right, front, or back, finalPrompt must include [SUBJECT_PLACEMENT_LOCK] and enforce those named positions. If not specified, preserve subject placement from the selected references and Creative Direction; do not swap people.",
    "Do not mention 95% composition fidelity, 100% strict scene match, Composition Fidelity, or percentage-based venue fidelity. For Match Locked, say maximum venue fidelity attempt instead.",
    "For Visual DNA, translate lighting, camera, mood, density, realism, and brand feeling into concrete photographic language.",
    "Forbidden weak labels in finalPrompt: outfit 1, dish 1, DSC-only labels, exact dish structure, selected food, selected accessory, selected outfit, selected model. Use real names plus descriptive continuity language.",
    "If an asset only has a filename like DSC07890, do not stop at the filename. Say the filename plus metadata-supported details; if metadata is insufficient, explicitly instruct Nano Banana Pro to use the attached reference image as visual truth and preserve visible details exactly.",
    "Optimize finalPrompt for Nano Banana Pro: clear reference roles, detailed continuity, realistic hands, food truth, model identity, accessory truth, premium editorial realism, no over-stylization.",
  ].join("\n")
}

export function promptV2UserPrompt(input: PromptV2Input) {
  const democlientbVenueLockBlock = buildDemoClientBVenueLockBlock({
    clientName: input.clientName,
    hasVenueReference: input.selectedAssets.some(asset => asset.role === "venue_truth"),
  })
  const selectedSubjectNames = input.selectedAssets
    .filter(asset => asset.role === "model_truth")
    .map(asset => asset.title)
    .filter(Boolean)
  const subjectPlacementLockBlock = buildSubjectPlacementLockBlock({
    notes: input.userCreativeDirection,
    selectedSubjectNames,
    hasSubjects: selectedSubjectNames.length > 0,
  })
  const democlientbRules = isDemoClientBClient(input.clientName) ? [
    "For DemoClientC, use this truth hierarchy: 1 Venue Image Truth, 2 Food Truth, 3 Character DNA, 4 Outfit DNA, 5 Creative Direction Text.",
    "For DemoClientC, the selected venue image is the source of truth for curtains, chairs, table material, table styling, lighting, artwork, and seating density.",
    "For DemoClientC, do not inherit DemoClientD black-marble assumptions. If the venue image shows mirrored/reflective glass tabletops catching red/burgundy curtain tones, preserve the reflective mirror quality and forbid black marble or red lacquer material.",
    "For DemoClientC, do not generate blue chairs unless blue chairs are visibly present in the selected venue image. Preserve cream/beige rounded upholstery and black metal legs when visible.",
    "For DemoClientC, preserve deep red dramatic curtains when visible: color, scale, drape, and texture.",
    ...DEMOCLIENTB_VENUE_MEMORY_LINES.map(line => `DemoClientB memory: ${line}`),
    democlientbVenueLockBlock ? `Include this exact protected block in finalPrompt:\n${democlientbVenueLockBlock}` : "",
  ].filter(Boolean) : []
  const placementRules = subjectPlacementLockBlock ? [
    `Include this exact protected block in finalPrompt when subject placement matters:\n${subjectPlacementLockBlock}`,
  ] : []
  return JSON.stringify({
    task: "Analyze all selected generation inputs and produce the strongest Prompt V2 JSON for Nano Banana Pro.",
    detail_level: input.detailLevel ?? "Detailed",
    output_schema: {
      summary: "string",
      dominantCreativeGoal: "string",
      venueReasoningMode: "locked_scene_plate | nano_banana_pro_visual_truth | flexible_venue_context | material_atmosphere_reference",
      venueReasoningWhy: "string",
      providerCompatibility: "string",
      priorityHierarchy: ["string"],
      referenceRoles: ["string"],
      mustPreserve: ["string"],
      allowedFlex: ["string"],
      riskWarnings: ["string"],
      providerStrategy: "string",
      assetContinuityNotes: {
        models: ["string"],
        outfits: ["string"],
        accessories: ["string"],
        food: ["string"],
        drinks: ["string"],
        venue: ["string"],
      },
      failureCorrections: ["string"],
      finalPrompt: "string",
      negativePrompt: "string",
      qaChecklist: ["string"],
    },
    input,
    rules: [
      `Write finalPrompt at ${input.detailLevel ?? "Detailed"} detail level. Compact = concise but specific. Standard = complete scene paragraph. Detailed = asset-by-asset continuity plus scene. Ultra Detailed = exhaustive continuity for complex multi-reference scenes.`,
      "Creative Director Notes are high priority after hard truth assets. Interpret and strengthen them.",
      "Mention each selected role clearly in finalPrompt. Explain what it controls and what it cannot change.",
      "If input.settings.sceneControl is Flexible, choose material_atmosphere_reference and do not mention Match Locked, exact geometry, locked scene plate, or percentage fidelity.",
      "If input.settings.sceneControl is Guided, choose flexible_venue_context and write: Guided = image-first visible venue reality. The selected venue image is authoritative; text only clarifies visible material cues. Allow slight crop/camera distance/subject posing adjustments.",
      "If input.settings.sceneControl is Nano Banana Pro, choose nano_banana_pro_visual_truth. Write an image-first prompt where venue image authority is the whole venue strategy. Text should only describe selected people, outfits, accessories, food, drinks, director notes, and minimal negatives.",
      "If input.settings.sceneControl is Match Locked, choose locked_scene_plate.",
      "Choose venueReasoningMode explicitly. Use locked_scene_plate for venue photography, venue plates, exact environment preservation, Match Locked tests, or when the user explicitly requests exact venue recreation.",
      "Whenever a venue image is selected, include [VISUAL_TRUTH_PRIORITY] in finalPrompt. It must say the selected venue image is primary truth, text only clarifies, and image wins conflicts.",
      "For lifestyle photography with models plus food/drinks/hospitality moments/director notes, default to flexible_venue_context. The venue image is the visual truth: use visible atmosphere, materials, table material, lighting language, and terrace/interior identity; do not invent unseen venue elements or rebuild the venue from text.",
      "For Pinterest/reference rebuild, default to material_atmosphere_reference unless the user explicitly asks for exact venue recreation.",
      "If venueReasoningMode is flexible_venue_context or material_atmosphere_reference, finalPrompt must not say Match Locked, locked scene plate, exact scene plate, or preserve exact camera geometry.",
      "For flexible_venue_context and material_atmosphere_reference, finalPrompt must not mention 95%, 100%, composition fidelity, strict scene match, or provider structure-lock warnings.",
      "For locked_scene_plate / Match Locked, venue image preservation is the #1 priority. Use the selected venue image as the base visual reality and add only selected foreground subjects/items.",
      "For locked_scene_plate / Match Locked, reduce creative freedom: foreground additions only, no venue redesign, no venue reconstruction from text, no unseen areas, and no unsupported angle.",
      "For nano_banana_pro_visual_truth, do not output long venue paragraphs. Do not include venue geometry, room proportion, ceiling, shelving, architecture-depth, or furniture-spacing descriptions. Keep venue language to: selected venue image is the source of truth; preserve visible venue as closely as possible; do not redesign the venue.",
      "Explain why the venue mode was selected and whether it is compatible with the provider capabilities.",
      "Before finalPrompt, internally expand every selected asset into a continuity description. Include those details in finalPrompt.",
      "Never use weak placeholder labels as the only description: outfit 1, dish 1, DSC07890 dish, exact dish structure, selected accessory, selected food, selected outfit.",
      "If metadata is missing for a selected asset, include: Metadata insufficient; use the attached reference image as visual truth and preserve visible details exactly. Then still describe the category-specific details the provider must preserve from the visible image.",
      "If too many references are selected, recommend which non-essential inspiration refs should be dropped in riskWarnings/providerStrategy.",
      "If many references are selected, still generate the best possible prompt with truth priority: venue/model/outfit/food/drink first, accessories next unless director notes make them critical, inspiration last.",
      "Preserve accessory geometry and metadata: bag silhouette/color/material/logo placement, watch dial/bezel/strap/metal/hand details, jewelry material and placement.",
      "For missing accessory metadata, include explicit risk warning: Accessory metadata insufficient for exact preservation.",
      "For missing food metadata, include risk warning for plating count/vessel/ingredient uncertainty.",
      "For Match Locked venue setups, do not allow venue redesign or unseen venue invention.",
      "If selected venue truth contains a visible table surface, finalPrompt must preserve exact table material, finish, color, texture, trim, and tablecloth layer. Use black marble only if it is visible; otherwise preserve the actual visible table truth.",
      "If Creative Director Notes specify DemoModelA left and DemoModelB right, finalPrompt must enforce DemoModelA on the left side of the image/table and DemoModelB on the right side of the image/table.",
      "Selected Studio Food Shots must be treated as exact Food Truth Assets. FinalPrompt must say recreate the exact selected food truth asset and preserve ingredients, bread type, vessel, garnish, arrangement, portion, and presentation.",
      "For dining scenes with seated guests, include exactly 1 fork and 1 knife per guest unless the user explicitly requests a different table setup. Forbid duplicate cutlery and extra place settings.",
      "Add VISUAL_TRUTH_PRIORITY for any selected venue image: selected venue image is primary truth; text descriptions only clarify; image wins conflicts.",
      "Add visible-reference lock language for Guided and Match Locked: use only visible venue elements; no unseen venue elements.",
      "Add camera-reality lock language for Guided and Match Locked: preserve source image camera family and visible view; no unsupported angle or new room sections.",
      "Add action-lock language when Creative Director Notes mention gaze, smile, holding, hands, object interaction, posture, or primary subject.",
      "Add subject-count lock language whenever models are selected.",
      "Add food/drink visibility lock language whenever food or drink truth assets are selected.",
      "Add facial-realism lock language whenever a model is selected, especially if smiling: natural dental anatomy, realistic gumline, no duplicated/synthetic teeth, no distorted mouth geometry.",
      "Always inherit these permanent failure corrections: venue table material truth, food truth exactness, 1 fork + 1 knife per seated guest, camera reality lock, and facial realism.",
      "Use pastFailures to write concrete failureCorrections and negativePrompt items.",
      "Keep finalPrompt detailed but not bloated. Avoid useless repetition.",
      ...democlientbRules,
      ...placementRules,
    ],
  })
}

function extractJson(text: string) {
  const trimmed = text.trim()
  return trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? ""
}

export function parsePromptV2Json(text: string, fallback: PromptV2Output): PromptV2Output {
  const jsonText = extractJson(text)
  if (!jsonText) return fallback
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    const parsedVenueMode = parsed.venueReasoningMode === "locked_scene_plate" || parsed.venueReasoningMode === "nano_banana_pro_visual_truth" || parsed.venueReasoningMode === "flexible_venue_context" || parsed.venueReasoningMode === "material_atmosphere_reference"
      ? parsed.venueReasoningMode
      : fallback.venueReasoningMode
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      dominantCreativeGoal: typeof parsed.dominantCreativeGoal === "string" ? parsed.dominantCreativeGoal : fallback.dominantCreativeGoal,
      venueReasoningMode: parsedVenueMode,
      venueReasoningWhy: typeof parsed.venueReasoningWhy === "string" ? parsed.venueReasoningWhy : fallback.venueReasoningWhy,
      providerCompatibility: typeof parsed.providerCompatibility === "string" ? parsed.providerCompatibility : fallback.providerCompatibility,
      priorityHierarchy: normalizeStringArray(parsed.priorityHierarchy).length ? normalizeStringArray(parsed.priorityHierarchy) : fallback.priorityHierarchy,
      referenceRoles: normalizeStringArray(parsed.referenceRoles),
      mustPreserve: normalizeStringArray(parsed.mustPreserve).length ? normalizeStringArray(parsed.mustPreserve) : fallback.mustPreserve,
      allowedFlex: normalizeStringArray(parsed.allowedFlex).length ? normalizeStringArray(parsed.allowedFlex) : fallback.allowedFlex,
      riskWarnings: normalizeStringArray(parsed.riskWarnings),
      providerStrategy: typeof parsed.providerStrategy === "string" ? parsed.providerStrategy : fallback.providerStrategy,
      assetContinuityNotes: normalizeContinuityNotes(parsed.assetContinuityNotes),
      failureCorrections: mergePermanentFailureCorrections(normalizeStringArray(parsed.failureCorrections)),
      finalPrompt: typeof parsed.finalPrompt === "string" && parsed.finalPrompt.trim() ? parsed.finalPrompt : fallback.finalPrompt,
      negativePrompt: typeof parsed.negativePrompt === "string" && parsed.negativePrompt.trim() ? parsed.negativePrompt : fallback.negativePrompt,
      qaChecklist: normalizeStringArray(parsed.qaChecklist).length ? normalizeStringArray(parsed.qaChecklist) : fallback.qaChecklist,
    }
  } catch {
    return fallback
  }
}

export function compilePromptV2ForProvider(output: PromptV2Output) {
  if (output.venueReasoningMode === "nano_banana_pro_visual_truth") {
    return [
      output.finalPrompt.trim(),
      output.negativePrompt.trim() ? `[PROMPT_V2_NEGATIVE]\n${output.negativePrompt.trim()}` : "",
    ].filter(Boolean).join("\n\n")
  }
  return [
    "[PROMPT_V2_CREATIVE_DIRECTOR]",
    `[PROMPT_V2_VENUE_MODE]\nmode: ${output.venueReasoningMode}\nwhy: ${output.venueReasoningWhy}\nprovider: ${output.providerCompatibility}`,
    buildPermanentPromptV2LearningBlock(),
    output.finalPrompt.trim(),
    output.negativePrompt.trim() ? `[PROMPT_V2_NEGATIVE]\n${output.negativePrompt.trim()}` : "",
    output.qaChecklist.length ? `[PROMPT_V2_QA_CHECKLIST]\n${output.qaChecklist.map(item => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
}
