export const DEFAULT_COMPOSITION_FIDELITY = "strict_scene_match"

export const COMPOSITION_FIDELITY_OPTIONS = [
  {
    value: "strict_scene_match",
    label: "Match Locked",
    percent: 100,
    helper: "Highest venue fidelity attempt. Keep the selected interior/exterior as close as possible while adding selected subjects and objects.",
  },
  {
    value: "minor_crop_only",
    label: "Guided",
    percent: 95,
    helper: "Use the selected venue image strongly, with only small crop or zoom refinement.",
  },
  {
    value: "flexible_crop",
    label: "Flexible",
    percent: 90,
    helper: "Use the selected venue image for visible material, lighting, and atmosphere truth.",
  },
  {
    value: "inspiration_only",
    label: "Inspiration Only",
    percent: 0,
    helper: "Use references only for mood/style. Not recommended for real DemoClientD venue generation.",
  },
] as const

export type CompositionFidelityMode = typeof COMPOSITION_FIDELITY_OPTIONS[number]["value"]

export type EnvironmentMode = "locked_truth" | "flexible" | "inspiration_only"

export const DEFAULT_ENVIRONMENT_CONFIDENCE = 100
export const MIN_ENVIRONMENT_CONFIDENCE = 90
export const MAX_ENVIRONMENT_CONFIDENCE = 100

export const ENVIRONMENT_MODE_OPTIONS = [
  { value: "locked_truth", label: "Match Locked", helper: COMPOSITION_FIDELITY_OPTIONS[0].helper },
  { value: "flexible", label: "Flexible", helper: COMPOSITION_FIDELITY_OPTIONS[2].helper },
  { value: "inspiration_only", label: "Inspiration Only", helper: COMPOSITION_FIDELITY_OPTIONS[3].helper },
] as const

export function normalizeCompositionFidelityMode(value: unknown): CompositionFidelityMode {
  if (value === "strict_scene_match" || value === "100% Strict Scene Match" || value === "locked_truth" || value === "Locked Truth") return "strict_scene_match"
  if (value === "minor_crop_only" || value === "95% Minor Crop Only") return "minor_crop_only"
  if (value === "flexible_crop" || value === "90% Flexible Crop" || value === "flexible" || value === "Flexible") return "flexible_crop"
  if (value === "inspiration_only" || value === "Inspiration Only") return "inspiration_only"
  return DEFAULT_COMPOSITION_FIDELITY
}

export function compositionFidelityPercent(mode: CompositionFidelityMode) {
  return COMPOSITION_FIDELITY_OPTIONS.find(option => option.value === mode)?.percent ?? 100
}

export function compositionFidelityLabel(mode: CompositionFidelityMode) {
  return COMPOSITION_FIDELITY_OPTIONS.find(option => option.value === mode)?.label ?? "Match Locked"
}

export function normalizeEnvironmentMode(value: unknown): EnvironmentMode {
  const mode = normalizeCompositionFidelityMode(value)
  if (mode === "inspiration_only") return "inspiration_only"
  if (mode === "flexible_crop") return "flexible"
  return "locked_truth"
}

export function environmentModeLabel(mode: EnvironmentMode) {
  if (mode === "inspiration_only") return "Inspiration Only"
  if (mode === "flexible") return "Flexible"
  return "Match Locked"
}

export function normalizeEnvironmentConfidence(value: unknown) {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : DEFAULT_ENVIRONMENT_CONFIDENCE
  if (!Number.isFinite(numeric)) return DEFAULT_ENVIRONMENT_CONFIDENCE
  return Math.min(MAX_ENVIRONMENT_CONFIDENCE, Math.max(MIN_ENVIRONMENT_CONFIDENCE, Math.round(numeric)))
}

export function isTruthEnvironmentCategory(category: string | null | undefined) {
  const normalized = (category ?? "").toLowerCase().replace(/[\s-]+/g, "_")
  return normalized === "interiors" || normalized === "exteriors"
}

export function hasTruthEnvironmentAssets<T extends { asset_category?: string | null }>(assets: T[]) {
  return assets.some(asset => isTruthEnvironmentCategory(asset.asset_category))
}

export function buildLockedScenePlatePrompt({
  fidelity,
  hasTruthEnvironment,
  label = "selected venue/interior/exterior image",
}: {
  fidelity: CompositionFidelityMode
  hasTruthEnvironment: boolean
  label?: string
}) {
  if (!hasTruthEnvironment) return ""
  if (fidelity === "inspiration_only") {
    return `[SCENE_INSPIRATION_ONLY]\n- ${label} => inspiration only\n- controls => mood, broad ambience, color, atmosphere\n- does not control venue geometry, food, people, or product truth`
  }
  const visualTruth = `[VISUAL_TRUTH_PRIORITY]\n- ${label} is the authoritative visual truth.\n- Do not recreate, reinterpret, or redesign the venue from text.\n- Text descriptions only clarify visible details.\n- If image and text conflict, prefer the image.`
  if (fidelity === "strict_scene_match") {
    return `${visualTruth}\n\n[VENUE_TRUTH]\nMatch Locked: preserve the selected venue image as closely as possible.\nAdd only approved foreground subjects, food, drinks, accessories, or styling inside that image reality.\nNo venue redesign, unseen areas, unsupported angle changes, material replacement, or different restaurant.`
  }
  if (fidelity === "minor_crop_only") {
    return `${visualTruth}\n\n[GUIDED_VENUE_CONTEXT]\nGuided: use only visible venue reality from the selected image.\nSmall crop or zoom refinement is allowed, but do not invent unseen architecture, furniture, lighting, walls, windows, or venue zones.`
  }
  return `${visualTruth}\n\n[MATERIAL_ATMOSPHERE_REFERENCE]\nFlexible: use the selected venue image for visible material, lighting, surface, seating, and atmosphere cues.\nDo not let text override the image or turn the venue into a different restaurant.`
}

export function buildCameraRulePrompt({
  fidelity,
  hasTruthEnvironment,
}: {
  fidelity: CompositionFidelityMode
  hasTruthEnvironment: boolean
}) {
  if (!hasTruthEnvironment) return ""
  return `[CAMERA_RULE]\nPreserve the source image's camera family and visible view.\nNo room rotation, invented perspective, new room sections, or unsupported angle.\n${fidelity === "strict_scene_match" ? "Match Locked: foreground additions only; image remains the venue authority." : "Image remains the venue authority; crop gently only if needed."}`
}

export function buildStrictNegativePrompt({ hasTruthEnvironment, hasFoodTruth }: { hasTruthEnvironment: boolean; hasFoodTruth: boolean }) {
  if (!hasTruthEnvironment && !hasFoodTruth) return ""
  return `[STRICT_NEGATIVE]\n${[
    hasTruthEnvironment ? "No invented tables." : "",
    hasTruthEnvironment ? "No new furniture." : "",
    hasTruthEnvironment ? "No changed ceiling." : "",
    hasTruthEnvironment ? "No changed walls." : "",
    hasTruthEnvironment ? "No changed flooring." : "",
    hasTruthEnvironment ? "No different restaurant." : "",
    hasTruthEnvironment ? "No fantasy architecture." : "",
    hasTruthEnvironment ? "No redesigned interior." : "",
    hasTruthEnvironment ? "No additional unrequested props." : "",
    hasFoodTruth ? "No altered dish identity." : "",
    hasFoodTruth ? "No inaccurate bread." : "",
    hasFoodTruth ? "No fake plating." : "",
    hasFoodTruth ? "No random garnish." : "",
    hasTruthEnvironment ? "No venue hallucination." : "",
  ].filter(Boolean).join("\n")}`
}

export function buildProviderGuidancePrompt(hasTruthEnvironment: boolean) {
  if (!hasTruthEnvironment) return ""
  return `[PROVIDER_GUIDANCE]\nIf the provider/tool supports image-to-image, reference strength, structure strength, depth/edge/canny, or inpainting, use those controls for strict scene preservation instead of relying only on text prompts.\nTreat the venue reference as a base plate / structure lock, not style inspiration.`
}

export function buildEnvironmentTruthPrompt({
  mode,
  confidence,
  hasTruthEnvironment,
  label = "selected interior/exterior reference",
}: {
  mode: EnvironmentMode
  confidence: number
  hasTruthEnvironment: boolean
  label?: string
}) {
  const fidelity = mode === "inspiration_only"
    ? "inspiration_only"
    : confidence >= 100
      ? "strict_scene_match"
      : confidence >= 95
        ? "minor_crop_only"
        : "flexible_crop"
  return buildLockedScenePlatePrompt({ fidelity, hasTruthEnvironment, label })
}

export function compositionFidelityRisk({
  fidelity,
  hasTruthEnvironment,
  hasFoodTruth,
  hasPastCorrections,
}: {
  fidelity: CompositionFidelityMode
  hasTruthEnvironment: boolean
  hasFoodTruth: boolean
  hasPastCorrections: boolean
}) {
  if (!hasTruthEnvironment) return "High"
  if (fidelity === "inspiration_only") return "High"
  if (fidelity === "flexible_crop") return hasFoodTruth ? "Medium" : "High"
  if (fidelity === "minor_crop_only") return hasPastCorrections ? "Medium" : "Low"
  return hasPastCorrections ? "Low" : "Low"
}

export function environmentContinuityRisk({
  mode,
  confidence,
  hasTruthEnvironment,
}: {
  mode: EnvironmentMode
  confidence: number
  hasTruthEnvironment: boolean
}) {
  if (!hasTruthEnvironment) return ""
  const fidelity = mode === "inspiration_only"
    ? "inspiration_only"
    : confidence >= 100
      ? "strict_scene_match"
      : confidence >= 95
        ? "minor_crop_only"
        : "flexible_crop"
  if (fidelity === "inspiration_only") {
    return "Environment continuity risk detected. Real venue references are set to Inspiration Only, so venue image truth is not anchored."
  }
  if (fidelity !== "strict_scene_match") {
    return "Environment continuity risk detected. Match Locked is recommended for real venue continuity."
  }
  return ""
}
