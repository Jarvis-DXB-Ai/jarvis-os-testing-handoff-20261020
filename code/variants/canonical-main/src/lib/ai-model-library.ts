export const AI_MODEL_REFERENCE_SLOTS = [
  {
    key: "front_face",
    label: "Front Face Portrait",
    shortLabel: "Front Face",
    group: "Face",
    helper: "Studio portrait, white background, face clearly visible, plain fitted black t-shirt, no styling distractions.",
    purpose: "Identity consistency",
    preset: "Studio portrait on a white seamless background. Front-facing, centered portrait composition, 85mm portrait lens, natural skin texture, realistic human face, neutral expression or soft natural smile, even studio lighting, no shadows hiding facial features. Wardrobe standard: plain fitted black t-shirt, crew neck, short sleeves, no logos, no graphics. No accessories, no jewellery, no blazer, no fashion styling. The face is the focus; wardrobe should disappear visually.",
  },
  {
    key: "forty_five_face",
    label: "45-Degree Face Portrait",
    shortLabel: "45° Face",
    group: "Face",
    helper: "Studio portrait, white background, 45-degree angle, plain fitted black t-shirt, no styling distractions.",
    purpose: "Angle consistency",
    preset: "Studio portrait on a white seamless background. Head turned 45 degrees, same identity as the front face reference, face clearly visible, realistic skin texture, natural expression, even studio lighting, no dramatic shadows. Wardrobe standard: plain fitted black t-shirt, crew neck, short sleeves, no logos, no graphics. No accessories, no jewellery, no blazer, no fashion styling. The face is the focus; wardrobe should disappear visually.",
  },
  {
    key: "full_body_front",
    label: "Full Body Front Reference",
    shortLabel: "Full Body Front",
    group: "Body",
    helper: "Body proportion reference only: simple black underwear set, barefoot, white studio background.",
    purpose: "Body proportions and outfit generation",
    preset: "Full body front view on a white seamless studio background. Wardrobe standard: simple black underwear set, black bra, black underwear bottoms, barefoot. No lace, no patterns, no branding, no jewellery. Neutral non-sexual clinical fashion model fitting reference. Full body visible, body proportions clearly visible, waist visible, shoulders visible, hips visible, posture and silhouette clear, arms relaxed, feet visible, natural posture, realistic anatomy. No leggings, no t-shirt, no socks, no shoes, no outfit styling, no lifestyle styling, no glamorous or provocative posing.",
  },
  {
    key: "full_body_side",
    label: "Full Body Side Reference",
    shortLabel: "Full Body Side",
    group: "Body",
    helper: "Body proportion reference only: simple black underwear set, barefoot, white studio background.",
    purpose: "Body consistency and outfit generation",
    preset: "Full body side profile on a white seamless studio background. Wardrobe standard: simple black underwear set, black bra, black underwear bottoms, barefoot. No lace, no patterns, no branding, no jewellery. Neutral non-sexual clinical fashion model fitting reference. Full body visible, body proportions clearly visible, waist visible, shoulders visible, hips visible, posture and silhouette clear, arms relaxed, feet visible, natural posture, realistic anatomy, same proportions as the full body front reference. No leggings, no t-shirt, no socks, no shoes, no outfit styling, no lifestyle styling, no glamorous or provocative posing.",
  },
] as const

export const AI_MODEL_REALISM_STANDARDS = [
  "Ultra realistic digital human.",
  "Natural skin texture with believable pores and subtle asymmetry.",
  "Realistic eyes, realistic hair, realistic facial anatomy, realistic body anatomy.",
  "No plastic skin, no beauty filter, no doll appearance, no AI glamour look, no influencer aesthetic.",
].join(" ")

export const AI_MODEL_STATUSES = ["draft", "generating", "review", "approved", "archived"] as const
export const AI_MODEL_ASSET_STATUSES = ["pending", "approved", "rejected", "needs_regeneration"] as const
export const AI_MODEL_PROMPT_TYPES = ["base_reference", "outfit_generation", "lifestyle_scene", "restaurant_campaign"] as const
export const AI_MODEL_FORMATS = ["4:5", "9:16", "16:9", "1:1"] as const
export const AI_MODEL_REALISM_LEVELS = ["Natural", "High", "Ultra Realistic"] as const

export type AiModelReferenceSlotKey = typeof AI_MODEL_REFERENCE_SLOTS[number]["key"]
export type AiModelStatus = typeof AI_MODEL_STATUSES[number]
export type AiModelAssetStatus = typeof AI_MODEL_ASSET_STATUSES[number]
export type AiModelPromptType = typeof AI_MODEL_PROMPT_TYPES[number]

export const AI_MODEL_BASE_REFERENCE_SLOT_KEYS: AiModelReferenceSlotKey[] = [
  "front_face",
  "forty_five_face",
  "full_body_front",
  "full_body_side",
]

export const AI_MODEL_REFERENCE_DEPENDENCIES: Record<AiModelReferenceSlotKey, AiModelReferenceSlotKey[]> = {
  front_face: [],
  forty_five_face: ["front_face"],
  full_body_front: ["front_face", "forty_five_face"],
  full_body_side: ["front_face", "forty_five_face", "full_body_front"],
}

export type AiModel = {
  id: string
  client_id: string
  model_name: string
  model_role: string | null
  age: number | null
  height: string | null
  gender: string | null
  nationality: string | null
  ethnicity_appearance_notes: string | null
  hair_description: string | null
  eye_description: string | null
  skin_tone: string | null
  body_type: string | null
  personality: string | null
  brand_role: string | null
  approved_usage: string | null
  restricted_usage: string | null
  base_prompt: string | null
  negative_prompt: string | null
  realism_prompt: string | null
  quality_prompt: string | null
  status: AiModelStatus
  created_at: string
  updated_at: string
}

export type AiModelAsset = {
  id: string
  model_id: string
  client_id: string
  asset_type: AiModelReferenceSlotKey | "outfit" | "lifestyle" | "test_generation"
  image_url: string | null
  storage_path: string | null
  prompt_used: string | null
  negative_prompt_used: string | null
  generation_settings: Record<string, unknown>
  version_number: number
  status: AiModelAssetStatus
  notes: string | null
  created_at: string
}

export type AiModelOutfit = {
  id: string
  model_id: string
  client_id: string
  outfit_name: string
  occasion: string | null
  collection_style: string | null
  mood: string | null
  climate: string | null
  fashion_dna: string | null
  allowed_silhouettes: string | null
  allowed_materials: string | null
  allowed_colour_families: string | null
  footwear_direction: string | null
  garments: string | null
  colour_palette: string | null
  footwear: string | null
  outfit_description: string | null
  styling_notes: string | null
  jewelry_notes: string | null
  hair_notes: string | null
  makeup_notes: string | null
  shoes_notes: string | null
  prompt_fragment: string | null
  status: AiModelStatus
  created_at: string
  updated_at: string
}

export type AiModelAccessory = {
  id: string
  client_id: string
  model_id: string
  category: string
  name: string
  description: string | null
  prompt_fragment: string | null
  status: "draft" | "approved" | "archived"
  created_at: string
  updated_at: string
}

export type AiModelPrompt = {
  id: string
  model_id: string
  client_id: string
  prompt_type: AiModelPromptType
  reference_slot: string | null
  outfit_id: string | null
  occasion: string | null
  scene: string | null
  camera_angle: string | null
  lighting_style: string | null
  format: string | null
  realism_level: string | null
  final_prompt: string
  negative_prompt: string | null
  generation_settings: Record<string, unknown>
  status: "draft" | "saved" | "used" | "archived"
  created_at: string
}

export type AiModelPromptInput = {
  model: AiModel
  promptType: AiModelPromptType
  referenceSlot?: string
  outfit?: AiModelOutfit | null
  occasion?: string
  scene?: string
  cameraAngle?: string
  lightingStyle?: string
  format?: string
  realismLevel?: string
  brandStyleRules?: string
  negativePromptRules?: string
}

export type ParsedCharacterBrief = {
  model_name: string
  model_role: string
  age: number | null
  height: string
  gender: string
  nationality: string
  ethnicity_appearance_notes: string
  hair_description: string
  eye_description: string
  skin_tone: string
  body_type: string
  personality: string
  brand_role: string
  approved_usage: string
  restricted_usage: string
  base_prompt: string
  negative_prompt: string
  realism_prompt: string
  quality_prompt: string
  status: AiModelStatus
  warnings: string[]
}

function compactJoin(values: Array<string | null | undefined>, separator = ", ") {
  return values.map(value => value?.trim()).filter(Boolean).join(separator)
}

function normalizeBrief(value: string) {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

function sentenceList(value: string) {
  return normalizeBrief(value)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function cleanExtractedValue(value: string | undefined) {
  return value?.replace(/\s+/g, " ").replace(/^[\s:;,-]+|[\s.;,-]+$/g, "").trim() ?? ""
}

function structuredField(brief: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = brief.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"))
    if (match?.[1]) return cleanExtractedValue(match[1])
  }
  return ""
}

function sentenceContaining(brief: string, terms: string[]) {
  return sentenceList(brief).find(sentence => terms.some(term => sentence.toLowerCase().includes(term))) ?? ""
}

function descriptorForTerm(brief: string, term: "hair" | "eyes" | "skin") {
  const fragments = normalizeBrief(brief)
    .split(/[,.;\n]+/)
    .map(item => cleanExtractedValue(item))
    .filter(Boolean)
  const fragment = fragments.find(item => item.toLowerCase().includes(term))
  if (!fragment) return ""
  if (term === "hair") {
    const match = fragment.match(/(?:with|has|having)\s+(.+?\bhair\b)/i) ?? fragment.match(/([a-zA-Z -]+?\bhair\b)/i)
    return cleanExtractedValue(match?.[1] ?? fragment)
  }
  if (term === "eyes") {
    const match = fragment.match(/(?:with|has|having)\s+(.+?\beyes\b)/i) ?? fragment.match(/([a-zA-Z -]+?\beyes\b)/i)
    return cleanExtractedValue(match?.[1] ?? fragment)
  }
  const match = fragment.match(/(?:with|has|having)\s+(.+?\bskin\b)/i) ?? fragment.match(/([a-zA-Z -]+?\bskin\b)/i)
  return cleanExtractedValue(match?.[1] ?? fragment)
}

function inferName(brief: string) {
  const structured = structuredField(brief, ["Model Name", "Name", "Character Name"])
  if (structured) return structured
  const named = brief.match(/\b(?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)
  if (named?.[1]) return named[1].trim()
  const create = brief.match(/\bCreate\s+(?:a|an)\s+[^.]*?\s+named\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
  return create?.[1]?.trim() ?? ""
}

function inferAge(brief: string) {
  const structured = structuredField(brief, ["Age"])
  const structuredNumber = structured.match(/\d{1,3}/)?.[0]
  if (structuredNumber) return Number(structuredNumber)
  const age = brief.match(/\b(\d{1,3})\s*[- ]?\s*year[- ]old\b/i)?.[1]
    ?? brief.match(/\bage\s*(?:is|:)?\s*(\d{1,3})\b/i)?.[1]
  return age ? Number(age) : null
}

function normalizeHeight(value: string) {
  const cleaned = cleanExtractedValue(value).replace(/\s+/g, " ")
  const cm = cleaned.match(/\b(\d{2,3})\s*cm\b/i)
  if (cm?.[1]) return `${cm[1]} cm`
  const feetInches = cleaned.match(/\b([4-7])\s*(?:'|ft|feet)\s*(\d{1,2})?\s*(?:"|in|inches)?\b/i)
  if (feetInches?.[1]) return feetInches[2] ? `${feetInches[1]}'${feetInches[2]}"` : `${feetInches[1]}'`
  return cleaned
}

function inferHeight(brief: string) {
  const structured = structuredField(brief, ["Height"])
  if (structured) return normalizeHeight(structured)
  const cm = brief.match(/\b(?:around|approximately|about)?\s*(\d{2,3})\s*cm\s*(?:tall|height)?\b/i)
  if (cm?.[1]) return `${cm[1]} cm`
  const tallCm = brief.match(/\b(\d{2,3})\s*cm\s+tall\b/i)
  if (tallCm?.[1]) return `${tallCm[1]} cm`
  const feetInches = brief.match(/\b([4-7])\s*(?:'|ft|feet)\s*(\d{1,2})?\s*(?:"|in|inches)?\s*(?:tall)?\b/i)
  if (feetInches?.[1]) return feetInches[2] ? `${feetInches[1]}'${feetInches[2]}"` : `${feetInches[1]}'`
  return ""
}

function inferGender(brief: string) {
  const structured = structuredField(brief, ["Gender"])
  if (structured) return structured
  if (brief.match(/\b(woman|female|girl)\b/i)) return "Female"
  if (brief.match(/\b(man|male|boy)\b/i)) return "Male"
  return ""
}

function inferNationality(brief: string) {
  const structured = structuredField(brief, ["Nationality"])
  if (structured) return structured
  const nationalities = [
    "Italian", "French", "British", "Emirati", "Lebanese", "Spanish", "Greek", "American", "Canadian",
    "German", "Indian", "Egyptian", "Turkish", "Moroccan", "Russian", "Ukrainian", "Saudi", "Jordanian",
  ]
  return nationalities.find(nationality => new RegExp(`\\b${nationality}\\b`, "i").test(brief)) ?? ""
}

function inferRole(brief: string, age: number | null, nationality: string, gender: string) {
  const structured = structuredField(brief, ["Role", "Archetype", "Model Role", "Archetype / Role"])
  if (structured) return structured
  const guestWord = gender.toLowerCase().includes("male") && !gender.toLowerCase().includes("female") ? "Guest" : "Guest"
  const agePrefix = age && age < 32 ? "Young" : ""
  return compactJoin([agePrefix, nationality, guestWord], " ").trim() || "Brand Character"
}

function inferUsage(brief: string) {
  const structured = structuredField(brief, ["Brand Use", "Approved Usage", "Use", "Usage"])
  if (structured) return structured
  const match = brief.match(/\b(?:use for|suitable for|brand use(?: is)?|used for)\s+(.+?)(?:\.\s|$)/i)
  return cleanExtractedValue(match?.[1])
}

function inferRestrictedUsage(brief: string) {
  const structured = structuredField(brief, ["Restricted Use", "Restricted Usage", "Avoid", "Negative Prompt", "Do Not Use"])
  if (structured) return structured
  const avoid = brief.match(/\b(?:avoid|do not use for|do not use|no)\s+(.+?)(?:\.\s|$)/i)
  return cleanExtractedValue(avoid?.[0])
}

function clientStyleRules(clientName?: string | null) {
  const name = clientName?.toLowerCase() ?? ""
  if (name.includes("democlientb")) {
    return {
      positive: "warm Mediterranean elegance, Southern Italian hospitality, quiet luxury, approachable premium dining, Business Bay lifestyle warmth",
      negative: "not influencer, not nightclub, not runway, not overly glamorous, not generic Dubai luxury, no plastic skin, no heavy makeup, no unrealistic proportions",
    }
  }
  return {
    positive: "premium hospitality realism, warm human presence, client-specific visual DNA, natural elegance",
    negative: "no plastic skin, no heavy makeup, no unrealistic proportions, no AI glamour look, no generic luxury clichés",
  }
}

export function parseCharacterBrief(briefInput: string, options: { clientName?: string | null; modelNameOverride?: string } = {}): ParsedCharacterBrief {
  const brief = normalizeBrief(briefInput)
  const style = clientStyleRules(options.clientName)
  const modelName = cleanExtractedValue(options.modelNameOverride) || inferName(brief)
  const age = inferAge(brief)
  const height = inferHeight(brief)
  const gender = inferGender(brief)
  const nationality = inferNationality(brief)
  const hair = structuredField(brief, ["Hair", "Hair Description"]) || descriptorForTerm(brief, "hair")
  const eyes = structuredField(brief, ["Eyes", "Eye Description"]) || descriptorForTerm(brief, "eyes")
  const skin = structuredField(brief, ["Skin Tone", "Skin"]) || descriptorForTerm(brief, "skin")
  const appearance = structuredField(brief, ["Appearance", "Appearance Notes", "Ethnicity / Appearance Notes"])
    || sentenceList(brief).find(sentence => sentence.match(/\b(features|smile|proportions|appearance|look|beauty)\b/i))
    || ""
  const body = structuredField(brief, ["Body Type", "Body"])
    || sentenceList(brief).find(sentence => sentence.match(/\b(proportions|body|anatomy|physique|build)\b/i))
    || ""
  const personality = structuredField(brief, ["Personality", "Character", "Energy"])
    || sentenceList(brief).find(sentence => sentence.match(/\b(warm|elegant|charming|relaxed|sociable|confident|approachable|cute|softly)\b/i))
    || ""
  const approvedUsage = inferUsage(brief)
  const restrictedUsage = inferRestrictedUsage(brief)
  const role = inferRole(brief, age, nationality, gender)
  const brandRole = approvedUsage
    ? `${approvedUsage}. Character should align with ${style.positive}.`
    : `Reusable hospitality character aligned with ${style.positive}.`
  const basePrompt = compactJoin([
    age ? `${age}-year-old` : "",
    height ? `Height: ${height}` : "",
    nationality,
    gender ? gender.toLowerCase() : "",
    modelName ? `named ${modelName}` : "",
    appearance,
    hair ? `Hair: ${hair}` : "",
    eyes ? `Eyes: ${eyes}` : "",
    skin ? `Skin tone: ${skin}` : "",
    body ? `Body/proportions: ${body}` : "",
    personality ? `Personality: ${personality}` : "",
    brandRole,
    "authentic human presence, natural skin texture, realistic proportions, premium hospitality campaign model",
  ], ", ")
  const negativePrompt = compactJoin([
    restrictedUsage,
    style.negative,
    "identity drift, inconsistent face, distorted hands, synthetic teeth, doll appearance, artificial skin, celebrity look, cold expression, AI artifacts",
  ], ", ")
  const warnings = [
    !modelName ? "Missing name" : "",
    !age ? "Missing age" : "",
    !height ? "Height recommended for body consistency" : "",
    !gender ? "Missing gender" : "",
    !nationality ? "Missing nationality" : "",
    !appearance ? "Missing appearance notes" : "",
    !approvedUsage ? "Missing usage rules" : "",
    !restrictedUsage ? "Missing negative prompt" : "",
  ].filter(Boolean)

  return {
    model_name: modelName,
    model_role: role,
    age,
    height,
    gender,
    nationality,
    ethnicity_appearance_notes: cleanExtractedValue(appearance),
    hair_description: cleanExtractedValue(hair),
    eye_description: cleanExtractedValue(eyes),
    skin_tone: cleanExtractedValue(skin),
    body_type: cleanExtractedValue(body),
    personality: cleanExtractedValue(personality),
    brand_role: brandRole,
    approved_usage: approvedUsage,
    restricted_usage: restrictedUsage,
    base_prompt: basePrompt,
    negative_prompt: negativePrompt,
    realism_prompt: AI_MODEL_REALISM_STANDARDS,
    quality_prompt: "Consistent reusable character identity, natural expression, premium hospitality realism, believable anatomy, clean reference continuity.",
    status: "draft",
    warnings,
  }
}

export function aiModelStatusLabel(status: string | null | undefined) {
  if (!status) return "Draft"
  return status.split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

export function aiModelSlotLabel(slot: string | null | undefined) {
  if (slot === "outfit") return "Outfit"
  if (slot === "lifestyle") return "Lifestyle"
  if (slot === "test_generation") return "Test Generation"
  return AI_MODEL_REFERENCE_SLOTS.find(item => item.key === slot)?.label ?? "Model Reference"
}

export function aiModelSlotShortLabel(slot: string | null | undefined) {
  if (slot === "outfit") return "Outfit"
  if (slot === "lifestyle") return "Lifestyle"
  if (slot === "test_generation") return "Test"
  return AI_MODEL_REFERENCE_SLOTS.find(item => item.key === slot)?.shortLabel ?? aiModelSlotLabel(slot)
}

function referenceChainingInstruction(promptType: AiModelPromptType, referenceSlot?: string) {
  if (promptType === "base_reference") {
    if (referenceSlot === "front_face") {
      return "Front Face starts the Character DNA. No visual reference is required; create the primary identity anchor from the model profile."
    }
    if (referenceSlot === "forty_five_face") {
      return "If an approved Front Face reference is attached, use it to create the exact same person from a 45-degree angle. Preserve facial structure, hair, eyes, skin tone, age, and identity."
    }
    if (referenceSlot === "full_body_front") {
      return "If approved face references are attached, use them to preserve the same identity while generating the full body front fashion reference. Keep face identity consistent and establish believable body proportions."
    }
    if (referenceSlot === "full_body_side") {
      return "If approved face and full body front references are attached, use them to preserve the same identity and body proportions from the side profile. Do not create a new person."
    }
  }
  if (promptType === "outfit_generation") {
    return "Use all attached approved Character DNA references as strict identity anchors. Preserve the exact same face, facial structure, hairline, hair colour, eye shape, nose, smile, skin tone, height, body proportions, waist/hip ratio, posture, and overall identity. The base references use neutral wardrobe standards, so inherit identity and body proportions from them. Wardrobe collection generations are clean studio references only: change clothing and footwear only, keep a white seamless studio background, and do not add watches, Rolex, jewellery, bags, sunglasses, hats, belts, visible branded accessories, props, or lifestyle context."
  }
  return "Use attached approved Character DNA references to preserve exact identity, facial structure, hair, skin tone, body proportions, and overall character continuity."
}

export function buildAiModelPrompt(input: AiModelPromptInput) {
  const {
    model,
    promptType,
    referenceSlot,
    outfit,
    occasion,
    scene,
    cameraAngle,
    lightingStyle,
    format,
    realismLevel,
    brandStyleRules,
    negativePromptRules,
  } = input

  const slot = AI_MODEL_REFERENCE_SLOTS.find(item => item.key === referenceSlot)
  const outfitIdentity = compactJoin([
    model.model_name ? `Model: ${model.model_name}` : "",
    model.age ? `Age: ${model.age}` : "",
    model.gender ? `Gender: ${model.gender}` : "",
    model.nationality ? `Nationality: ${model.nationality}` : "",
    model.height ? `Height: ${model.height}` : "",
    model.ethnicity_appearance_notes,
    model.hair_description ? `Hair: ${model.hair_description}` : "",
    model.eye_description ? `Eyes: ${model.eye_description}` : "",
    model.skin_tone ? `Skin tone: ${model.skin_tone}` : "",
    model.body_type ? `Body type: ${model.body_type}` : "",
    model.personality ? `Personality: ${model.personality}` : "",
  ], "\n")

  const identity = promptType === "outfit_generation"
    ? outfitIdentity
    : compactJoin([
        model.base_prompt,
        model.height ? `Height: ${model.height}` : "",
        model.ethnicity_appearance_notes,
        model.hair_description ? `Hair: ${model.hair_description}` : "",
        model.eye_description ? `Eyes: ${model.eye_description}` : "",
        model.skin_tone ? `Skin tone: ${model.skin_tone}` : "",
        model.body_type ? `Body type: ${model.body_type}` : "",
        model.personality ? `Personality: ${model.personality}` : "",
      ], "\n")

  const modeLine = promptType === "base_reference"
    ? `Create ${slot?.label ?? "a base reference image"} for reusable AI identity consistency. ${slot?.helper ?? ""}`
    : promptType === "outfit_generation"
      ? `Create a clean full-body studio wardrobe collection reference for ${outfit?.outfit_name ?? "the selected collection"}. White seamless background only, no lifestyle context, no props, no accessories. Outfit references are clothing and footwear only; accessories are generated later as a separate layer.`
      : promptType === "lifestyle_scene"
        ? "Create a lifestyle scene using the model as a reusable brand character."
        : "Create a restaurant campaign image using the model as a reusable brand character."

  const outfitBlock = outfit
    ? [
        `Wardrobe Collection: ${outfit.outfit_name}.`,
        outfit.occasion ? `Category: ${outfit.occasion}.` : "",
        outfit.collection_style ? `Style: ${outfit.collection_style}.` : "",
        outfit.mood ? `Mood: ${outfit.mood}.` : "",
        outfit.climate ? `Climate: ${outfit.climate}.` : "",
        outfit.fashion_dna ? `Fashion DNA: ${outfit.fashion_dna}.` : outfit.outfit_description ? `Fashion DNA: ${outfit.outfit_description}` : "",
        outfit.allowed_silhouettes ? `Allowed silhouettes: ${outfit.allowed_silhouettes}.` : outfit.garments ? `Allowed silhouettes: ${outfit.garments}.` : "",
        outfit.allowed_materials ? `Allowed materials: ${outfit.allowed_materials}.` : "",
        outfit.allowed_colour_families ? `Allowed colour families: ${outfit.allowed_colour_families}.` : outfit.colour_palette ? `Allowed colour families: ${outfit.colour_palette}.` : "",
        outfit.footwear_direction ? `Footwear direction: ${outfit.footwear_direction}.` : outfit.footwear ? `Footwear direction: ${outfit.footwear}.` : "",
        outfit.styling_notes ? `Stylist notes: ${outfit.styling_notes}` : "",
        "Create one outfit interpretation within this fashion universe. Do not generate the same fixed garment formula unless a user explicitly requests it.",
        "For multiple variations: choose different silhouettes, garment combinations, colour families, materials, necklines, sleeve styles, and footwear directions for each candidate.",
        "Do not repeat the same shirt/trouser combination. Do not repeat the same silhouette. Do not repeat the same colour palette. Each variation must feel meaningfully different.",
        "Accessories: disabled for this outfit reference. Do not add watches, Rolex, jewellery, bracelets, necklaces, rings, bags, sunglasses, hats, belts, props, visible branded accessories, or visible accessory layers.",
        "Studio wardrobe rule: clothing and shoes only; no hair, beauty, lifestyle, restaurant, terrace, or campaign styling.",
        "Fashion freedom: allow materially different silhouettes, top types, bottom types, dress vs separates, palettes, fabrics, cuts, necklines, sleeve styles, and footwear across variations.",
        "Controlled sexiness: allow tasteful skin exposure, fitted tops, open necklines, one-shoulder tops, off-shoulder tops, strap tops, silk camisoles, elegant crop tops, slip dresses, satin dresses, and body-skimming silhouettes. Avoid vulgar, nightclub, lingerie-as-outfit, micro skirts, extreme cleavage, sheer clothing, influencer costume, cheap clubwear, and party girl styling.",
        outfit.prompt_fragment ? `Prompt fragment: ${outfit.prompt_fragment}` : "",
      ].filter(Boolean).join("\n")
    : ""

  const finalPrompt = [
    "[AI_MODEL_GENERATION]",
    promptType === "outfit_generation"
      ? "[STRICT_IDENTITY_ANCHOR]\nUse attached approved Character DNA references as strict identity anchors. Preserve exact face, facial structure, hairline, hair colour, eye shape, nose, smile, skin tone, height, body proportions, waist/hip ratio, posture, and overall identity. Only clothing and footwear may change. Do not add watches, Rolex, jewellery, bags, sunglasses, hats, belts, visible branded accessories, props, or lifestyle styling."
      : "",
    "",
    modeLine,
    "",
    "[MODEL_IDENTITY]",
    identity,
    "",
    model.height ? `[HEIGHT]\nPreserve model height and body scale: ${model.height}. Use this for full body references, side profile references, outfit continuity, and relative body proportions.` : "",
    "",
    promptType === "base_reference" && slot ? "[REFERENCE_PRESET]\n" + slot.preset : "",
    "",
    "[REFERENCE_CHAINING]",
    referenceChainingInstruction(promptType, referenceSlot),
    "",
    outfitBlock ? "[OUTFIT_SYSTEM]\n" + outfitBlock : "",
    "",
    "[SCENE]",
    compactJoin([
      occasion ? `Occasion: ${occasion}` : "",
      scene ? `Scene: ${scene}` : "",
      cameraAngle ? `Camera angle: ${cameraAngle}` : "",
      lightingStyle ? `Lighting: ${lightingStyle}` : "",
      format ? `Format: ${format}` : "",
      realismLevel ? `Realism level: ${realismLevel}` : "",
    ], "\n"),
    "",
    "[CLIENT_STYLE_RULES]",
    brandStyleRules?.trim() || model.brand_role || "Premium hospitality photography, warm human presence, realistic proportions, natural expression, no over-stylization.",
    "",
    "[QUALITY]",
    compactJoin([
      AI_MODEL_REALISM_STANDARDS,
      model.realism_prompt,
      model.quality_prompt,
      promptType === "outfit_generation"
        ? "Consistent identity, natural skin texture, believable facial anatomy, clean studio wardrobe reference realism."
        : "Consistent identity, natural skin texture, believable facial anatomy, premium restaurant campaign realism.",
    ], "\n"),
  ].filter(section => section.trim()).join("\n")

  const negativePrompt = compactJoin([
    model.negative_prompt,
    negativePromptRules,
    promptType === "outfit_generation" ? "watch, Rolex, jewellery, bracelets, necklaces, rings, bags, sunglasses, hats, belts, visible branded accessories, props, restaurant background, terrace, lifestyle scene" : "",
    "identity drift, inconsistent face, distorted hands, synthetic teeth, plastic skin, wrong age, wrong ethnicity, provocative pose, fashion runway, nightclub styling, heavy makeup, AI artifacts",
  ], ", ")

  return {
    finalPrompt,
    negativePrompt,
  }
}
