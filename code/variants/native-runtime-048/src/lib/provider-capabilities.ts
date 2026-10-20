export const GENERATION_WORKFLOW_MODES = [
  {
    id: "creative_generation",
    label: "Creative Generation",
    helper: "Current full-scene generation behavior. Uses references, but strict venue/model/food preservation is not guaranteed.",
  },
  {
    id: "strict_scene_plate",
    label: "Strict Composite / Scene Plate Mode",
    helper: "Venue is treated as a base plate. Requires structure control, inpainting, or compositing support before paid generation.",
  },
  {
    id: "reference_inspiration",
    label: "Reference Inspiration Mode",
    helper: "References guide mood, lighting, styling, and composition only.",
  },
] as const

export type GenerationWorkflowMode = typeof GENERATION_WORKFLOW_MODES[number]["id"]

export const DEFAULT_REAL_VENUE_GENERATION_MODE: GenerationWorkflowMode = "strict_scene_plate"

export type ProviderCapabilityProfile = {
  provider: string
  model: string
  supportsImageInputs: boolean
  supportsMultiImageReferences: boolean
  supportsIdentityPreservation: "best_effort" | "explicit_control" | "unsupported"
  supportsFoodTruthPreservation: "best_effort" | "explicit_control" | "unsupported"
  supportsLockedScenePlate: boolean
  supportsReferenceStrength: boolean
  supportsStructureStrength: boolean
  supportsDepthEdgeCannyControl: boolean
  supportsInpainting: boolean
  supportsMaskEditing: boolean
  requestTransport: "inline_base64" | "url" | "mixed"
  limitation: string
}

export const NANO_BANANA_PROVIDER_CAPABILITIES: ProviderCapabilityProfile = {
  provider: "google-gemini",
  model: "gemini-3-pro-image-preview",
  supportsImageInputs: true,
  supportsMultiImageReferences: true,
  supportsIdentityPreservation: "best_effort",
  supportsFoodTruthPreservation: "best_effort",
  supportsLockedScenePlate: false,
  supportsReferenceStrength: false,
  supportsStructureStrength: false,
  supportsDepthEdgeCannyControl: false,
  supportsInpainting: false,
  supportsMaskEditing: false,
  requestTransport: "inline_base64",
  limitation:
    "This Jarvis provider route sends references as inline image parts in a full-scene generateContent request. It does not expose mask, inpainting, reference-strength, structure-strength, depth, edge, or canny controls, so it cannot guarantee strict venue geometry, identity, or food truth preservation.",
}

export function normalizeGenerationWorkflowMode(value: unknown): GenerationWorkflowMode {
  if (typeof value === "string" && GENERATION_WORKFLOW_MODES.some(mode => mode.id === value)) {
    return value as GenerationWorkflowMode
  }
  if (value === "Background Preserve Test") return "strict_scene_plate"
  if (value === "Standard") return "creative_generation"
  return DEFAULT_REAL_VENUE_GENERATION_MODE
}

export function generationWorkflowModeLabel(mode: GenerationWorkflowMode) {
  return GENERATION_WORKFLOW_MODES.find(option => option.id === mode)?.label ?? "Strict Composite / Scene Plate Mode"
}

export function strictScenePlateUnsupported(capabilities = NANO_BANANA_PROVIDER_CAPABILITIES) {
  return !(
    capabilities.supportsLockedScenePlate
    || capabilities.supportsStructureStrength
    || capabilities.supportsDepthEdgeCannyControl
    || capabilities.supportsInpainting
    || capabilities.supportsMaskEditing
  )
}
