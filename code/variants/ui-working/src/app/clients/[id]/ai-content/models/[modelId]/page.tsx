"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"
import {
  AI_MODEL_BASE_REFERENCE_SLOT_KEYS,
  AI_MODEL_FORMATS,
  AI_MODEL_REALISM_LEVELS,
  AI_MODEL_REFERENCE_DEPENDENCIES,
  AI_MODEL_REFERENCE_SLOTS,
  type AiModel,
  type AiModelAccessory,
  type AiModelAsset,
  type AiModelOutfit,
  type AiModelPrompt,
  type AiModelPromptType,
  type AiModelReferenceSlotKey,
  buildAiModelPrompt,
  aiModelSlotLabel,
  aiModelSlotShortLabel,
  aiModelStatusLabel,
} from "@/lib/ai-model-library"
import { AiPhotographyNav } from "../../components/ai-photography-nav"

type Client = {
  id: string
  name: string
  industry: string | null
  status: string
}

type GeneratedReferenceCandidate = {
  candidateId?: string
  variationNumber?: number
  variationCount?: number
  imageDataUrl: string
  mimeType: string
  prompt: string
  negativePrompt: string
  providerPrompt?: string
  provider: string
  model: string
  notes: string
  generatedAt: string
  generationSettings: Record<string, unknown>
}

const CONTROL_CLASS = "mt-1.5 w-full rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60"
const TEXTAREA_CLASS = "mt-1.5 w-full rounded-2xl border border-white/10 bg-black/30 px-3.5 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60"
const SECONDARY_BUTTON_CLASS = "rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
const PRIMARY_BUTTON_CLASS = "rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"

function emptyModel(clientId: string, modelId: string): AiModel {
  const now = new Date().toISOString()
  return {
    id: modelId,
    client_id: clientId,
    model_name: "",
    model_role: "",
    age: null,
    height: "",
    gender: "",
    nationality: "",
    ethnicity_appearance_notes: "",
    hair_description: "",
    eye_description: "",
    skin_tone: "",
    body_type: "",
    personality: "",
    brand_role: "",
    approved_usage: "",
    restricted_usage: "",
    base_prompt: "",
    negative_prompt: "",
    realism_prompt: "",
    quality_prompt: "",
    status: "draft",
    created_at: now,
    updated_at: now,
  }
}

function latestVersion(assets: AiModelAsset[], slot: string) {
  return assets
    .filter(asset => asset.asset_type === slot)
    .sort((left, right) => right.version_number - left.version_number)[0] ?? null
}

function approvedVersion(assets: AiModelAsset[], slot: string) {
  return assets
    .filter(asset => asset.asset_type === slot && asset.status === "approved")
    .sort((left, right) => right.version_number - left.version_number)[0] ?? null
}

function isReferenceSlot(value: string | null | undefined): value is AiModelReferenceSlotKey {
  return AI_MODEL_BASE_REFERENCE_SLOT_KEYS.includes(value as AiModelReferenceSlotKey)
}

function slotVersionNumber(assets: AiModelAsset[], slot: string) {
  const versions = assets.filter(asset => asset.asset_type === slot).map(asset => asset.version_number)
  return versions.length > 0 ? Math.max(...versions) + 1 : 1
}

function identityScoreFor(asset: AiModelAsset | null | undefined) {
  const value = asset?.generation_settings?.identity_match_score
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : ""
  }
  return ""
}

export default function AiModelDetailPage({ params }: { params: Promise<{ id: string; modelId: string }> }) {
  const { id, modelId } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [model, setModel] = useState<AiModel | null>(null)
  const [draft, setDraft] = useState<AiModel>(() => emptyModel(id, modelId))
  const [assets, setAssets] = useState<AiModelAsset[]>([])
  const [outfits, setOutfits] = useState<AiModelOutfit[]>([])
  const [accessories, setAccessories] = useState<AiModelAccessory[]>([])
  const [prompts, setPrompts] = useState<AiModelPrompt[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [activeReferenceSlot, setActiveReferenceSlot] = useState<AiModelReferenceSlotKey | null>(null)
  const [activeOutfitId, setActiveOutfitId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finalising, setFinalising] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [newVersionUrls, setNewVersionUrls] = useState<Record<string, string>>({})
  const [slotNotes, setSlotNotes] = useState<Record<string, string>>({})
  const [promptType, setPromptType] = useState<AiModelPromptType>("base_reference")
  const [referenceSlot, setReferenceSlot] = useState("front_face")
  const [outfitId, setOutfitId] = useState("")
  const [occasion, setOccasion] = useState("Business Lunch")
  const [scene, setScene] = useState("Premium hospitality scene")
  const [cameraAngle] = useState("Natural eye-level portrait")
  const [lightingStyle] = useState("Soft warm studio lighting")
  const [format, setFormat] = useState("4:5")
  const [realismLevel, setRealismLevel] = useState("High")
  const [brandStyleRules, setBrandStyleRules] = useState("")
  const [negativePromptRules, setNegativePromptRules] = useState("")
  const [finalPrompt, setFinalPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [identityScores, setIdentityScores] = useState<Record<string, string>>({})
  const [generatedReferenceCandidates, setGeneratedReferenceCandidates] = useState<Record<string, GeneratedReferenceCandidate>>({})
  const [generatedOutfitCandidates, setGeneratedOutfitCandidates] = useState<Record<string, GeneratedReferenceCandidate[]>>({})
  const [outfitVariationCounts, setOutfitVariationCounts] = useState<Record<string, number>>({})
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null)
  const [referenceGenerationError, setReferenceGenerationError] = useState("")
  const [deselectedReferenceIds, setDeselectedReferenceIds] = useState<Record<string, string[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [clientRes, modelRes, assetsRes, outfitsRes, accessoriesRes, promptsRes] = await Promise.all([
      supabase.from("clients").select("id, name, industry, status").eq("id", id).single(),
      supabase.from("ai_models").select("*").eq("client_id", id).eq("id", modelId).single(),
      supabase.from("ai_model_assets").select("*").eq("client_id", id).eq("model_id", modelId).order("created_at", { ascending: false }),
      supabase.from("ai_model_outfits").select("*").eq("client_id", id).eq("model_id", modelId).neq("status", "archived").order("created_at", { ascending: false }),
      supabase.from("ai_model_accessories").select("*").eq("client_id", id).eq("model_id", modelId).neq("status", "archived").order("category", { ascending: true }).order("name", { ascending: true }),
      supabase.from("ai_model_prompts").select("*").eq("client_id", id).eq("model_id", modelId).order("created_at", { ascending: false }),
    ])

    if (clientRes.error) setError(clientRes.error.message)
    else setClient(clientRes.data as Client)
    if (modelRes.error) setError(modelRes.error.message)
    else {
      const row = modelRes.data as AiModel
      setModel(row)
      setDraft(row)
      setBrandStyleRules(row.brand_role ?? "")
      setNegativePromptRules(row.negative_prompt ?? "")
    }
    if (assetsRes.error) setError(assetsRes.error.message)
    else setAssets((assetsRes.data ?? []) as AiModelAsset[])
    if (outfitsRes.error) setError(outfitsRes.error.message)
    else setOutfits((outfitsRes.data ?? []) as AiModelOutfit[])
    if (accessoriesRes.error) setError(accessoriesRes.error.message)
    else setAccessories((accessoriesRes.data ?? []) as AiModelAccessory[])
    if (promptsRes.error) setError(promptsRes.error.message)
    else setPrompts((promptsRes.data ?? []) as AiModelPrompt[])
    setLoading(false)
  }, [id, modelId])

  useEffect(() => { load() }, [load])

  const selectedOutfit = useMemo(() => outfits.find(outfit => outfit.id === outfitId) ?? null, [outfitId, outfits])
  const activeOutfit = useMemo(() => outfits.find(outfit => outfit.id === activeOutfitId) ?? null, [activeOutfitId, outfits])
  const approvedReferenceCount = useMemo(() => AI_MODEL_BASE_REFERENCE_SLOT_KEYS.filter(slot => approvedVersion(assets, slot)).length, [assets])
  const missingReferenceSlots = useMemo(() => AI_MODEL_REFERENCE_SLOTS.filter(slot => !approvedVersion(assets, slot.key)), [assets])
  const approvedOutfitCount = useMemo(() => assets.filter(asset => asset.asset_type === "outfit" && asset.status === "approved").length, [assets])
  const activeReferenceConfig = useMemo(() => AI_MODEL_REFERENCE_SLOTS.find(slot => slot.key === activeReferenceSlot) ?? null, [activeReferenceSlot])
  const activeReferenceAssets = useMemo(() => {
    if (!activeReferenceSlot) return []
    return assets
      .filter(asset => asset.asset_type === activeReferenceSlot)
      .sort((left, right) => right.version_number - left.version_number)
  }, [activeReferenceSlot, assets])
  const activeApprovedReference = activeReferenceSlot ? approvedVersion(assets, activeReferenceSlot) : null
  const activeLatestReference = activeReferenceSlot ? latestVersion(assets, activeReferenceSlot) : null
  const activeGeneratedCandidate = activeReferenceSlot ? generatedReferenceCandidates[activeReferenceSlot] ?? null : null
  const approvedReferenceMap = useMemo(() => {
    const next = new Map<AiModelReferenceSlotKey, AiModelAsset>()
    AI_MODEL_BASE_REFERENCE_SLOT_KEYS.forEach(slot => {
      const approved = approvedVersion(assets, slot)
      if (approved) next.set(slot, approved)
    })
    return next
  }, [assets])
  const characterDnaComplete = approvedReferenceCount === AI_MODEL_BASE_REFERENCE_SLOT_KEYS.length

  function dependencySlotsForReference(slot: AiModelReferenceSlotKey) {
    return AI_MODEL_REFERENCE_DEPENDENCIES[slot] ?? []
  }

  function referenceContextKey(slot: AiModelReferenceSlotKey) {
    return `reference:${slot}`
  }

  function outfitContextKey(outfit: AiModelOutfit | null | undefined) {
    return `outfit:${outfit?.id ?? "active"}`
  }

  function availableReferenceAssetsForSlot(slot: AiModelReferenceSlotKey) {
    return dependencySlotsForReference(slot)
      .map(dependencySlot => approvedReferenceMap.get(dependencySlot))
      .filter((asset): asset is AiModelAsset => Boolean(asset?.image_url))
  }

  function selectedReferenceAssetsForSlot(slot: AiModelReferenceSlotKey) {
    const contextKey = referenceContextKey(slot)
    const deselected = new Set(deselectedReferenceIds[contextKey] ?? [])
    return availableReferenceAssetsForSlot(slot).filter(asset => !deselected.has(asset.id))
  }

  function availableReferenceAssetsForOutfit() {
    return AI_MODEL_BASE_REFERENCE_SLOT_KEYS
      .map(slot => approvedReferenceMap.get(slot))
      .filter((asset): asset is AiModelAsset => Boolean(asset?.image_url))
  }

  function selectedReferenceAssetsForOutfit(outfit: AiModelOutfit | null | undefined = activeOutfit) {
    const contextKey = outfitContextKey(outfit)
    const deselected = new Set(deselectedReferenceIds[contextKey] ?? [])
    return availableReferenceAssetsForOutfit().filter(asset => !deselected.has(asset.id))
  }

  function toggleReferenceImage(contextKey: string, assetId: string) {
    setDeselectedReferenceIds(previous => {
      const current = new Set(previous[contextKey] ?? [])
      if (current.has(assetId)) current.delete(assetId)
      else current.add(assetId)
      return { ...previous, [contextKey]: Array.from(current) }
    })
  }

  function outfitVersions(outfit: AiModelOutfit) {
    return assets
      .filter(asset => asset.asset_type === "outfit" && asset.generation_settings?.outfit_id === outfit.id)
      .sort((left, right) => right.version_number - left.version_number)
  }

  function outfitVersionNumber(outfit: AiModelOutfit) {
    const versions = outfitVersions(outfit).map(asset => asset.version_number)
    return versions.length > 0 ? Math.max(...versions) + 1 : 1
  }

  function accessoryGroups() {
    return accessories.reduce<Record<string, AiModelAccessory[]>>((groups, accessory) => {
      const category = accessory.category || "Accessories"
      groups[category] = [...(groups[category] ?? []), accessory]
      return groups
    }, {})
  }

  function outfitAccessoryPromptBlock() {
    return [
      "Accessories are disabled for outfit reference generation.",
      "Outfit references are clothing and footwear only.",
      "Do not include watches, Rolex, jewellery, bracelets, necklaces, rings, bags, sunglasses, hats, belts, visible branded accessories, props, or any visible accessory layer.",
      "If the model identity mentions a watch or Rolex, ignore it for wardrobe references and keep it stored as an accessory preference only.",
      "Accessories and lifestyle context will be generated later as separate layers.",
    ].join("\n")
  }

  function outfitVariationConcepts(outfit: AiModelOutfit) {
    const gender = (draft.gender ?? "").toLowerCase()
    const isMasculine = gender.includes("male") || gender.includes("man")
    const occasionName = (outfit.occasion ?? "").toLowerCase()
    if (isMasculine) {
      if (occasionName.includes("breakfast")) {
        return [
          "Interpretation A: relaxed Italian coastal morning. Choose a breathable open-collar or summer casual silhouette from the allowed range.",
          "Interpretation B: luxury Dubai weekend. Choose a different premium casual structure with a distinct top type, bottom type, and footwear direction.",
          "Interpretation C: espresso-run confidence. Choose a third modern Italian casual direction with a different fit, colour family, and material.",
        ]
      }
      if (occasionName.includes("lunch")) {
        return [
          "Interpretation A: Business Bay entrepreneur polish. Choose one sharp but warm-weather silhouette from the allowed range.",
          "Interpretation B: Milan executive masculinity. Choose a different shirt/trouser or lightweight tailoring structure with stronger refinement.",
          "Interpretation C: luxury automotive confidence. Choose a third more fashion-forward direction with a different material, fit, colour family, and footwear.",
        ]
      }
      return [
        "Interpretation A: Italian dinner gentleman. Choose one refined evening silhouette from the allowed range.",
        "Interpretation B: Mediterranean luxury evening. Choose a more relaxed expensive direction with a different shirt, trouser, material, and footwear.",
        "Interpretation C: Dubai night success. Choose a third confident modern luxury interpretation with a different cut, colour family, and level of polish.",
      ]
    }
    if (occasionName.includes("breakfast")) {
      return [
        "Interpretation A: relaxed Italian morning ease. Choose a fresh daytime silhouette from the allowed range, with a lighter colour family and breathable material.",
        "Interpretation B: feminine breakfast statement. Choose a different silhouette with more waist definition, a different neckline, and a different bottom type.",
        "Interpretation C: luxury Dubai morning alternative. Choose a third direction with a different garment structure, colour family, and footwear style.",
      ]
    }
    if (occasionName.includes("lunch")) {
      return [
        "Interpretation A: polished Italian lunch. Choose one refined silhouette from the allowed range with a smart daytime colour family.",
        "Interpretation B: feminine power lunch. Choose a different top architecture, neckline, and trouser/skirt direction from the allowed range.",
        "Interpretation C: luxury Business Bay alternative. Choose a third visibly different silhouette, material, colour family, and footwear direction.",
      ]
    }
    return [
      "Interpretation A: romantic Italian evening. Choose one elegant dinner silhouette from the allowed range.",
      "Interpretation B: sensual but refined evening. Choose a different neckline, dress/separates structure, material, and colour family.",
      "Interpretation C: modern luxury dinner alternative. Choose a third clearly different direction with distinct cut, footwear, and silhouette.",
    ]
  }

  function outfitVariationInstruction(outfit: AiModelOutfit, variationNumber: number, variationCount: number) {
    const concepts = outfitVariationConcepts(outfit)
    const concept = concepts[(variationNumber - 1) % concepts.length]
    const gender = (draft.gender ?? "").toLowerCase()
    const isMasculine = gender.includes("male") || gender.includes("man")
    if (variationCount <= 1) {
      return [
        "Generate one clean outfit reference using the wardrobe collection DNA.",
        "Create one outfit interpretation within this fashion universe, not a literal fixed outfit.",
        isMasculine
          ? "Make it fashion-forward, masculine, Italian, Dubai-appropriate, successful, Mediterranean, and less catalogue-like while staying refined."
          : "Make it fashion-forward, feminine, Italian, Dubai-appropriate, and less catalogue-like while staying elegant.",
        concept,
      ].join("\n")
    }
    return [
      `Generate clothing variation ${variationNumber} of ${variationCount} for the same wardrobe collection.`,
      concept,
      "This variation must be materially different from the other variations, not a minor fit or colour tweak.",
      "Differentiate at least 4 of these: silhouette, top type, bottom type, dress vs separates, neckline, sleeve style, material, colour family, footwear style.",
      isMasculine
        ? "Loosen fashion interpretation while preserving the collection mood: allow linen shirts, open collars, luxury polos, fitted premium t-shirts, tailored trousers, tailored shorts, lightweight blazers, suede loafers, leather loafers, refined summer sneakers, premium fabrics, and controlled masculine confidence."
        : "Loosen fashion interpretation while preserving the collection mood: allow fitted tops, open necklines, one-shoulder or off-shoulder tops, strap tops, silk camisoles, elegant crop tops, high-waisted trousers, tailored shorts, midi skirts, slip dresses, satin dresses, body-skimming silhouettes, and tasteful skin exposure.",
      "Avoid duplicate outfit structure across the set. Do not repeat the same shirt/trouser combination. Do not repeat the same silhouette. Do not repeat the same colour palette.",
      "Keep the same white seamless studio background, full body visibility, neutral standing pose, clothing and footwear only, no accessories, no props.",
      isMasculine ? "Keep the vibe modern Italian success, not influencer, hypebeast, nightclub promoter, or bodybuilder fashion." : "Keep the vibe sexy Italian elegance, not party girl.",
    ].filter(Boolean).join("\n")
  }

  function patchDraft(patch: Partial<AiModel>) {
    setDraft(previous => ({ ...previous, ...patch }))
  }

  async function saveOverview() {
    setSaving(true)
    setMessage("")
    setError("")
    const payload = {
      model_name: draft.model_name,
      model_role: draft.model_role,
      age: draft.age,
      height: draft.height,
      gender: draft.gender,
      nationality: draft.nationality,
      ethnicity_appearance_notes: draft.ethnicity_appearance_notes,
      hair_description: draft.hair_description,
      eye_description: draft.eye_description,
      skin_tone: draft.skin_tone,
      body_type: draft.body_type,
      personality: draft.personality,
      brand_role: draft.brand_role,
      approved_usage: draft.approved_usage,
      restricted_usage: draft.restricted_usage,
      base_prompt: draft.base_prompt,
      negative_prompt: draft.negative_prompt,
      realism_prompt: draft.realism_prompt,
      quality_prompt: draft.quality_prompt,
      status: draft.status,
    }
    const { data, error: saveError } = await supabase
      .from("ai_models")
      .update(payload)
      .eq("client_id", id)
      .eq("id", modelId)
      .select("*")
      .single()
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    if (data) {
      setModel(data as AiModel)
      setDraft(data as AiModel)
      setMessage("Model saved.")
    }
  }

  function generatePrompt(nextType = promptType, nextSlot = referenceSlot, nextOutfit = selectedOutfit) {
    if (!model && !draft) return
    const output = buildAiModelPrompt({
      model: draft,
      promptType: nextType,
      referenceSlot: nextSlot,
      outfit: nextOutfit,
      occasion,
      scene,
      cameraAngle,
      lightingStyle,
      format,
      realismLevel,
      brandStyleRules,
      negativePromptRules,
    })
    setPromptType(nextType)
    setReferenceSlot(nextSlot)
    if (nextOutfit) setOutfitId(nextOutfit.id)
    setFinalPrompt(output.finalPrompt)
    setNegativePrompt(output.negativePrompt)
    setMessage("Prompt generated.")
  }

  function generateReferencePrompt(slot: AiModelReferenceSlotKey, notes = slotNotes[slot] ?? "") {
    const referenceScene = notes ? `Studio reference generation. User refinement notes: ${notes}` : "Studio reference generation."
    const output = buildAiModelPrompt({
      model: draft,
      promptType: "base_reference",
      referenceSlot: slot,
      outfit: null,
      occasion: "Character DNA Reference",
      scene: referenceScene,
      cameraAngle: slot.includes("body") ? "Full body studio reference" : "85mm studio portrait",
      lightingStyle: "Even white seamless studio lighting",
      format: "4:5",
      realismLevel: "Ultra Realistic",
      brandStyleRules,
      negativePromptRules,
    })
    setPromptType("base_reference")
    setReferenceSlot(slot)
    setOccasion("Character DNA Reference")
    setScene(referenceScene)
    setFormat("4:5")
    setRealismLevel("Ultra Realistic")
    setFinalPrompt(output.finalPrompt)
    setNegativePrompt(output.negativePrompt)
    setMessage("Character reference prompt generated.")
    return output
  }

  function openReferenceModal(slot: AiModelReferenceSlotKey) {
    setActiveReferenceSlot(slot)
    setReferenceSlot(slot)
    setReferenceGenerationError("")
    if (!finalPrompt || promptType !== "base_reference" || referenceSlot !== slot) {
      generateReferencePrompt(slot)
    }
  }

  function generateMissingReferences() {
    const nextMissing = missingReferenceSlots[0]
    if (!nextMissing) {
      setMessage("All four Character DNA references already have approved versions.")
      return
    }
    openReferenceModal(nextMissing.key)
  }

  async function finaliseModel() {
    setError("")
    setMessage("")
    const missingSlots = AI_MODEL_BASE_REFERENCE_SLOT_KEYS.filter(slot => !approvedVersion(assets, slot))
    if (missingSlots.length > 0) {
      setError(`Cannot finalise yet. Approve these Character DNA references first: ${missingSlots.map(slot => aiModelSlotShortLabel(slot)).join(", ")}.`)
      return
    }

    setFinalising(true)
    const { data, error: updateError } = await supabase
      .from("ai_models")
      .update({ status: "approved" })
      .eq("client_id", id)
      .eq("id", modelId)
      .select("*")
      .single()
    setFinalising(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    if (data) {
      setModel(data as AiModel)
      setDraft(data as AiModel)
      setMessage(approvedOutfitCount > 0
        ? "Model finalised. It is now available for Client Brain Models and AI Photography selection."
        : "Model finalised. Add at least one approved outfit when ready for stronger campaign usage.")
    }
  }

  function prepareOutfit(outfit: AiModelOutfit) {
    setActiveOutfitId(outfit.id)
    setPromptType("outfit_generation")
    setOutfitId(outfit.id)
    generateOutfitPrompt(outfit)
  }

  function generateOutfitPrompt(outfit: AiModelOutfit, notes = slotNotes[outfitContextKey(outfit)] ?? "") {
    const gender = (draft.gender ?? "").toLowerCase()
    const isMasculine = gender.includes("male") || gender.includes("man")
    const styleDirection = isMasculine
      ? [
          "Think like a masculine Italian luxury stylist: Milan, Portofino, Forte dei Marmi, Italian Riviera, and Dubai entrepreneur lifestyle.",
          "Make the styling modern Italian, masculine, confident, successful, Mediterranean, luxury-aware, slightly flashy but still refined, Dubai-appropriate, and restaurant-appropriate.",
          "Use open collars, linen shirts, luxury polos, fitted premium t-shirts, light tailoring, tailored trousers, tailored shorts, suede loafers, leather loafers, refined luxury sneakers, lightweight blazers, and premium fabrics.",
          "Luxury is allowed, but avoid loud luxury: no giant logos, no hype brands, no streetwear, no oversized fits, no influencer styling, no nightclub promoter styling, no bodybuilder fashion.",
          "The feeling is: successful Italian entrepreneur in Dubai, not look-at-me influencer.",
        ]
      : [
          "Think like an Italian stylist: Milan, Capri, Amalfi, Forte dei Marmi, and a Dubai luxury resident.",
          "Make the styling Italian, feminine, confident, sexy, stylish, luxury-aware, fashion-forward, Dubai-appropriate, and restaurant-appropriate.",
          "Use fitted silhouettes, open necklines, one-shoulder tops, off-shoulder tops, strap tops, silk camisoles, elegant crop tops, high-waisted trousers, short tailored shorts, midi skirts, slip dresses, satin dresses, body-skimming silhouettes, waist definition, feminine tailoring, luxury sandals, tasteful skin exposure, and Italian summer glamour.",
          "Luxury is allowed, but it must be quiet luxury: Hermes Oran-style, Saint Laurent-inspired, Brunello Cucinelli, Loro Piana, Max Mara, or Bottega Veneta aesthetic without visible logos.",
          "The feeling is: I have money, not look at my money.",
        ]
    const negativeStyleRules = isMasculine
      ? "no restaurant background, no terrace, no lifestyle scene, no props, no jewellery, no bracelets, no necklaces, no rings, no watches, no Rolex, no bags, no sunglasses, no hats, no belts, no visible branded accessories, no streetwear, no hype brands, no loud logos, no oversized fits, no influencer style, no nightclub promoter, no bodybuilder fashion, no cheap clubwear, no heavy knitwear, no thick sweaters, no coats, no winter layering, no boots, no conservative office catalogue, no generic corporate catalogue styling, no fashion runway pose, no identity drift, no changed face, no changed body proportions, no changed height, no changed hairline, no changed nose, no changed eye shape"
      : "no restaurant background, no terrace, no lifestyle scene, no props, no jewellery, no bags, no watches, no sunglasses, no hats, no belts, no heavy knitwear, no thick sweaters, no coats, no boots, no winter layering, no boring corporate looks, no conservative office outfits, no generic catalogue styling, no oversized shapeless clothing, no influencer costume, no nightclub styling, no logo-heavy luxury, no vulgar styling, no lingerie as outfit, no micro skirt, no extreme cleavage, no sheer clothing, no cheap clubwear, no party girl styling, no fashion runway pose, no identity drift, no changed face, no changed body proportions, no changed height, no changed hairline, no changed nose, no changed eye shape"
    const outfitScene = [
      `Create a clean full-body studio wardrobe collection reference for ${draft.model_name || "the character"}.`,
      `Collection: ${outfit.outfit_name}.`,
      outfit.collection_style ? `Style: ${outfit.collection_style}.` : "",
      outfit.mood ? `Mood: ${outfit.mood}.` : "",
      outfit.climate ? `Climate: ${outfit.climate}.` : "",
      outfit.fashion_dna ? `Fashion DNA: ${outfit.fashion_dna}.` : outfit.outfit_description ? `Fashion DNA: ${outfit.outfit_description}.` : "",
      outfit.allowed_silhouettes ? `Allowed silhouettes: ${outfit.allowed_silhouettes}.` : outfit.garments ? `Allowed silhouettes: ${outfit.garments}.` : "",
      outfit.allowed_materials ? `Allowed materials: ${outfit.allowed_materials}.` : "",
      outfit.allowed_colour_families ? `Allowed colour families: ${outfit.allowed_colour_families}.` : outfit.colour_palette ? `Allowed colour families: ${outfit.colour_palette}.` : "",
      outfit.footwear_direction ? `Footwear direction: ${outfit.footwear_direction}.` : outfit.footwear ? `Footwear direction: ${outfit.footwear}.` : "",
      outfit.styling_notes ? `Stylist notes: ${outfit.styling_notes}.` : "",
      "STRICT IDENTITY LOCK: Use the attached approved Character DNA references as strict identity anchors. Preserve the exact same face, facial structure, hairline, hair colour, eye shape, nose, smile, skin tone, height, body proportions, waist/hip ratio, posture, and overall identity. Only change clothing and footwear.",
      "Create one outfit interpretation within this fashion universe. Do not generate the same fixed garment formula unless the user explicitly requests it.",
      "For multiple variations, each variation must choose a different silhouette, garment combination, colour family, material, neckline, sleeve style, and footwear direction.",
      "Do not repeat the same shirt/trouser combination. Do not repeat the same silhouette. Do not repeat the same colour palette. Each variation must feel meaningfully different.",
      ...styleDirection,
      "White seamless studio background only. Full body visible. Neutral standing pose. Clean fashion reference composition.",
      "No restaurant background, no terrace, no lifestyle scene, no props, no furniture, no table, no dining setup.",
      isMasculine
        ? "Dubai warm-weather styling only: breathable fabrics, linen, silk, cotton, light tailoring, open-collar shirts, short-sleeve polos, fitted premium t-shirts, tailored shorts, lightweight trousers, loafers, and refined summer sneakers."
        : "Dubai warm-weather styling only: breathable fabrics, linen, silk, cotton, light tailoring, sleeveless tops, short-sleeve tops, elegant summer dresses, lightweight trousers.",
      isMasculine
        ? "Avoid streetwear, hype brands, loud logos, oversized fits, influencer style, nightclub promoter energy, bodybuilder fashion, boring corporate catalogue looks, heavy knitwear, thick sweaters, coats, winter layering, boots, cold-weather styling, cheap clubwear, or flashy costume styling."
        : "Avoid boring corporate looks, conservative office outfits, HR-manager styling, generic catalogue styling, heavy knitwear, thick sweaters, coats, winter layering, boots, cold-weather styling, oversized shapeless clothing, bulky clothing, vulgar styling, nightclub styling, lingerie as outfit, micro skirts, extreme cleavage, sheer clothing, influencer costume, cheap clubwear, or party girl styling.",
      "Only change clothing and shoes if shoes are part of the outfit. Do not add accessories.",
      outfitAccessoryPromptBlock(),
      notes ? `User refinement notes: ${notes}` : "",
    ].filter(Boolean).join("\n")
    const output = buildAiModelPrompt({
      model: draft,
      promptType: "outfit_generation",
      referenceSlot: "full_body_front",
      outfit,
      occasion: outfit.occasion ?? "Outfit Reference",
      scene: outfitScene,
      cameraAngle: "Straight-on full-body studio fashion reference, person fully visible",
      lightingStyle: "Clean even white studio lighting",
      format: "4:5",
      realismLevel: "Ultra Realistic",
      brandStyleRules: "Warm Mediterranean elegance, quiet luxury, Dubai warm-weather wardrobe, clean studio fashion reference only.",
      negativePromptRules: [
        negativePromptRules,
        negativeStyleRules,
      ].filter(Boolean).join(", "),
    })
    setPromptType("outfit_generation")
    setReferenceSlot("full_body_front")
    setOutfitId(outfit.id)
    setOccasion(outfit.occasion ?? "Outfit Reference")
    setScene(outfitScene)
    setFormat("4:5")
    setRealismLevel("Ultra Realistic")
    setFinalPrompt(output.finalPrompt)
    setNegativePrompt(output.negativePrompt)
    setMessage("Outfit prompt generated.")
    return output
  }

  async function generateOutfitImage(outfit: AiModelOutfit, options: { withNotes?: boolean } = {}) {
    const contextKey = outfitContextKey(outfit)
    const notes = options.withNotes ? slotNotes[contextKey] ?? "" : ""
    const variationCount = Math.min(3, Math.max(1, outfitVariationCounts[outfit.id] ?? 1))
    const selectedReferenceImages = selectedReferenceAssetsForOutfit(outfit)
    const shouldRegeneratePrompt = options.withNotes || promptType !== "outfit_generation" || outfitId !== outfit.id || !finalPrompt.trim()
    const promptOutput = shouldRegeneratePrompt
      ? generateOutfitPrompt(outfit, notes)
      : { finalPrompt, negativePrompt }
    const promptToSend = promptOutput.finalPrompt.trim()
    const negativeToSend = promptOutput.negativePrompt.trim()
    if (!promptToSend) {
      setReferenceGenerationError("Generate or enter an outfit prompt before generating an image.")
      return
    }

    setGeneratingSlot(contextKey)
    setReferenceGenerationError("")
    setMessage("")
    try {
      const generatedCandidates: GeneratedReferenceCandidate[] = []
      for (let index = 0; index < variationCount; index += 1) {
        const variationNumber = index + 1
        const variationPrompt = [
          promptToSend,
          "",
          "[CLOTHING_VARIATION]",
          outfitVariationInstruction(outfit, variationNumber, variationCount),
        ].join("\n")
        const response = await fetch("/api/ai/model-reference-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: id,
            model_id: modelId,
            asset_type: "outfit",
            prompt: variationPrompt,
            negative_prompt: negativeToSend,
            notes,
            referenceImages: selectedReferenceImages.map(asset => ({
              asset_id: asset.id,
              asset_type: asset.asset_type,
              image_url: asset.image_url,
              storage_path: asset.storage_path,
              version_number: asset.version_number,
            })),
            generationSettings: {
              outfit_id: outfit.id,
              outfit_name: outfit.outfit_name,
              category: outfit.occasion,
              collection_style: outfit.collection_style,
              mood: outfit.mood,
              climate: outfit.climate,
              fashion_dna: outfit.fashion_dna,
              allowed_silhouettes: outfit.allowed_silhouettes,
              allowed_materials: outfit.allowed_materials,
              allowed_colour_families: outfit.allowed_colour_families,
              footwear_direction: outfit.footwear_direction,
              garments: outfit.garments,
              colour_palette: outfit.colour_palette,
              footwear: outfit.footwear,
              accessories_enabled: false,
              variation_number: variationNumber,
              variation_count: variationCount,
              reference_chain_asset_ids: selectedReferenceImages.map(asset => asset.id),
              reference_chain_asset_types: selectedReferenceImages.map(asset => asset.asset_type),
            },
          }),
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok || !json.success) {
          throw new Error(json.error || `Outfit variation ${variationNumber} failed with status ${response.status}.`)
        }
        // Minted inside the async generation handler, never during render: the
        // timestamp is what makes each candidate id unique per run.
        // eslint-disable-next-line react-hooks/purity
        const candidateId = `${contextKey}:variation:${variationNumber}:${Date.now()}`
        generatedCandidates.push({
          candidateId,
          variationNumber,
          variationCount,
          imageDataUrl: json.generated_image_data,
          mimeType: json.generated_image_mime_type || "image/png",
          prompt: variationPrompt,
          negativePrompt: negativeToSend,
          providerPrompt: json.provider_prompt,
          provider: json.provider || "google-gemini",
          model: json.model || "gemini-3-pro-image-preview",
          notes,
          generatedAt: new Date().toISOString(),
          generationSettings: {
            source: "nano_banana_pro_model_outfit",
            provider: json.provider || "google-gemini",
            model: json.model || "gemini-3-pro-image-preview",
            generated_at: new Date().toISOString(),
            prompt_length: json.prompt_length ?? variationPrompt.length,
            provider_latency_ms: json.provider_latency_ms ?? null,
            usage_metadata: json.usage_metadata ?? null,
            text: json.text ?? null,
            outfit_id: outfit.id,
            outfit_name: outfit.outfit_name,
            category: outfit.occasion,
            collection_style: outfit.collection_style,
            mood: outfit.mood,
            climate: outfit.climate,
            fashion_dna: outfit.fashion_dna,
            allowed_silhouettes: outfit.allowed_silhouettes,
            allowed_materials: outfit.allowed_materials,
            allowed_colour_families: outfit.allowed_colour_families,
            footwear_direction: outfit.footwear_direction,
            garments: outfit.garments,
            colour_palette: outfit.colour_palette,
            footwear: outfit.footwear,
            refinement_notes: notes || null,
            accessories_enabled: false,
            variation_number: variationNumber,
            variation_count: variationCount,
            reference_chain_assets: selectedReferenceImages.map(asset => ({
              id: asset.id,
              asset_type: asset.asset_type,
              version_number: asset.version_number,
            })),
            provider_reference_images_used: json.reference_images_used ?? [],
            provider_reference_images_dropped: json.reference_images_dropped ?? [],
          },
        })
      }
      setGeneratedOutfitCandidates(previous => ({
        ...previous,
        [contextKey]: generatedCandidates,
      }))
      setMessage(`${generatedCandidates.length} outfit variation${generatedCandidates.length === 1 ? "" : "s"} generated. Pick the strongest one to save.`)
    } catch (generationError) {
      setReferenceGenerationError(generationError instanceof Error ? generationError.message : "Outfit generation failed.")
    } finally {
      setGeneratingSlot(null)
    }
  }

  async function generateReferenceImage(slot: AiModelReferenceSlotKey, options: { withNotes?: boolean } = {}) {
    const notes = options.withNotes ? slotNotes[slot] ?? "" : ""
    const selectedReferenceImages = selectedReferenceAssetsForSlot(slot)
    const shouldRegeneratePrompt = options.withNotes || promptType !== "base_reference" || referenceSlot !== slot || !finalPrompt.trim()
    const promptOutput = shouldRegeneratePrompt
      ? generateReferencePrompt(slot, notes)
      : { finalPrompt, negativePrompt }
    const promptToSend = promptOutput.finalPrompt.trim()
    const negativeToSend = promptOutput.negativePrompt.trim()
    if (!promptToSend) {
      setReferenceGenerationError("Generate or enter a prompt before generating an image.")
      return
    }

    setGeneratingSlot(slot)
    setReferenceGenerationError("")
    setMessage("")
    try {
      const response = await fetch("/api/ai/model-reference-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: id,
          model_id: modelId,
          asset_type: slot,
          prompt: promptToSend,
          negative_prompt: negativeToSend,
          notes,
          referenceImages: selectedReferenceImages.map(asset => ({
            asset_id: asset.id,
            asset_type: asset.asset_type,
            image_url: asset.image_url,
            storage_path: asset.storage_path,
            version_number: asset.version_number,
          })),
          generationSettings: {
            reference_chain_asset_ids: selectedReferenceImages.map(asset => asset.id),
            reference_chain_asset_types: selectedReferenceImages.map(asset => asset.asset_type),
          },
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) {
        throw new Error(json.error || `Image generation failed with status ${response.status}.`)
      }
      setGeneratedReferenceCandidates(previous => ({
        ...previous,
        [slot]: {
          imageDataUrl: json.generated_image_data,
          mimeType: json.generated_image_mime_type || "image/png",
          prompt: promptToSend,
          negativePrompt: negativeToSend,
          providerPrompt: json.provider_prompt,
          provider: json.provider || "google-gemini",
          model: json.model || "gemini-3-pro-image-preview",
          notes,
          generatedAt: new Date().toISOString(),
          generationSettings: {
            source: "nano_banana_pro_model_reference",
            provider: json.provider || "google-gemini",
            model: json.model || "gemini-3-pro-image-preview",
            generated_at: new Date().toISOString(),
            prompt_length: json.prompt_length ?? promptToSend.length,
            provider_latency_ms: json.provider_latency_ms ?? null,
            usage_metadata: json.usage_metadata ?? null,
            text: json.text ?? null,
            reference_slot: slot,
            refinement_notes: notes || null,
            reference_chain_assets: selectedReferenceImages.map(asset => ({
              id: asset.id,
              asset_type: asset.asset_type,
              version_number: asset.version_number,
            })),
            provider_reference_images_used: json.reference_images_used ?? [],
            provider_reference_images_dropped: json.reference_images_dropped ?? [],
          },
        },
      }))
      setMessage("Image generated. Review the unsaved generation, then save it into version history.")
    } catch (generationError) {
      setReferenceGenerationError(generationError instanceof Error ? generationError.message : "Image generation failed.")
    } finally {
      setGeneratingSlot(null)
    }
  }

  async function savePromptRun() {
    if (!finalPrompt.trim()) generatePrompt()
    const promptToSave = finalPrompt.trim() || buildAiModelPrompt({
      model: draft,
      promptType,
      referenceSlot,
      outfit: selectedOutfit,
      occasion,
      scene,
      cameraAngle,
      lightingStyle,
      format,
      realismLevel,
      brandStyleRules,
      negativePromptRules,
    }).finalPrompt
    const negativeToSave = negativePrompt.trim()
    const { data, error: saveError } = await supabase
      .from("ai_model_prompts")
      .insert({
        model_id: modelId,
        client_id: id,
        prompt_type: promptType,
        reference_slot: promptType === "base_reference" ? referenceSlot : null,
        outfit_id: selectedOutfit?.id ?? null,
        occasion,
        scene,
        camera_angle: cameraAngle,
        lighting_style: lightingStyle,
        format,
        realism_level: realismLevel,
        final_prompt: promptToSave,
        negative_prompt: negativeToSave,
        generation_settings: { source: "ai_model_library_v1" },
        status: "saved",
      })
      .select("*")
      .single()
    if (saveError) {
      setError(saveError.message)
      return
    }
    setPrompts(previous => [data as AiModelPrompt, ...previous])
    setMessage("Prompt saved.")
  }

  async function copyPrompt() {
    const text = [finalPrompt, negativePrompt ? `\n[NEGATIVE]\n${negativePrompt}` : ""].join("\n")
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const copied = document.execCommand("copy")
        textarea.remove()
        if (!copied) throw new Error("Copy command was blocked.")
      }
      setMessage("Prompt copied.")
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Unable to copy prompt.")
    }
  }

  async function saveVersion(slot: string) {
    const generatedCandidate = generatedReferenceCandidates[slot]
    if (generatedCandidate) {
      const score = Number(identityScores[slot] ?? "")
      const response = await fetch("/api/ai/model-reference-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: id,
          model_id: modelId,
          asset_type: slot,
          image_data_url: generatedCandidate.imageDataUrl,
          prompt_used: generatedCandidate.prompt,
          negative_prompt_used: generatedCandidate.negativePrompt,
          generation_settings: generatedCandidate.generationSettings,
          notes: slotNotes[slot] ?? generatedCandidate.notes ?? null,
          identity_match_score: Number.isFinite(score) && score >= 1 && score <= 10 ? score : null,
          status: "pending",
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) {
        setError(json.error || `Failed to save generated image with status ${response.status}.`)
        return
      }
      setAssets(previous => [json.asset as AiModelAsset, ...previous])
      setGeneratedReferenceCandidates(previous => {
        const next = { ...previous }
        delete next[slot]
        return next
      })
      setIdentityScores(previous => ({ ...previous, [slot]: "" }))
      setMessage("Generated image saved as a pending version.")
      return
    }

    const imageUrl = newVersionUrls[slot]?.trim()
    if (!imageUrl) {
      setError("Generate an image or paste a generated image URL before saving this version.")
      return
    }
    const promptOutput = finalPrompt.trim()
      ? { finalPrompt, negativePrompt }
      : buildAiModelPrompt({
          model: draft,
          promptType: "base_reference",
          referenceSlot: slot,
          occasion,
          scene,
          cameraAngle,
          lightingStyle,
          format,
          realismLevel,
          brandStyleRules,
          negativePromptRules,
        })
    const score = Number(identityScores[slot] ?? "")
    const generationSettings: Record<string, unknown> = {
      source: "manual_version_save",
      format,
      realismLevel,
      character_dna_slot: slot,
    }
    if (Number.isFinite(score) && score >= 1 && score <= 10) {
      generationSettings.identity_match_score = score
    }
    const { data, error: insertError } = await supabase
      .from("ai_model_assets")
      .insert({
        model_id: modelId,
        client_id: id,
        asset_type: slot,
        image_url: imageUrl,
        prompt_used: promptOutput.finalPrompt,
        negative_prompt_used: promptOutput.negativePrompt,
        generation_settings: generationSettings,
        version_number: slotVersionNumber(assets, slot),
        status: "pending",
        notes: slotNotes[slot] ?? null,
      })
      .select("*")
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setAssets(previous => [data as AiModelAsset, ...previous])
    setNewVersionUrls(previous => ({ ...previous, [slot]: "" }))
    setIdentityScores(previous => ({ ...previous, [slot]: "" }))
    setMessage("Version saved as pending review.")
  }

  async function saveOutfitVersion(outfit: AiModelOutfit) {
    const contextKey = outfitContextKey(outfit)
    const imageUrl = newVersionUrls[contextKey]?.trim()
    if (!imageUrl) {
      setError("Generate an outfit image or paste an outfit image URL before saving this version.")
      return
    }
    const promptOutput = finalPrompt.trim() && promptType === "outfit_generation" && outfitId === outfit.id
      ? { finalPrompt, negativePrompt }
      : generateOutfitPrompt(outfit)
    const score = Number(identityScores[contextKey] ?? "")
    const selectedReferences = selectedReferenceAssetsForOutfit(outfit)
    const generationSettings: Record<string, unknown> = {
      source: "manual_outfit_version_save",
      outfit_id: outfit.id,
      outfit_name: outfit.outfit_name,
      category: outfit.occasion,
      collection_style: outfit.collection_style,
      mood: outfit.mood,
      climate: outfit.climate,
      fashion_dna: outfit.fashion_dna,
      allowed_silhouettes: outfit.allowed_silhouettes,
      allowed_materials: outfit.allowed_materials,
      allowed_colour_families: outfit.allowed_colour_families,
      footwear_direction: outfit.footwear_direction,
      garments: outfit.garments,
      colour_palette: outfit.colour_palette,
      footwear: outfit.footwear,
      format,
      realismLevel,
      accessories_enabled: false,
      reference_chain_asset_ids: selectedReferences.map(asset => asset.id),
      reference_chain_asset_types: selectedReferences.map(asset => asset.asset_type),
    }
    if (Number.isFinite(score) && score >= 1 && score <= 10) {
      generationSettings.identity_match_score = score
    }
    const { data, error: insertError } = await supabase
      .from("ai_model_assets")
      .insert({
        model_id: modelId,
        client_id: id,
        asset_type: "outfit",
        image_url: imageUrl,
        prompt_used: promptOutput.finalPrompt,
        negative_prompt_used: promptOutput.negativePrompt,
        generation_settings: generationSettings,
        version_number: outfitVersionNumber(outfit),
        status: "pending",
        notes: slotNotes[contextKey] ?? null,
      })
      .select("*")
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setAssets(previous => [data as AiModelAsset, ...previous])
    setNewVersionUrls(previous => ({ ...previous, [contextKey]: "" }))
    setIdentityScores(previous => ({ ...previous, [contextKey]: "" }))
    setMessage("Outfit version saved as pending review.")
  }

  async function saveOutfitCandidate(outfit: AiModelOutfit, candidate: GeneratedReferenceCandidate, status: "pending" | "approved" = "pending") {
    const contextKey = outfitContextKey(outfit)
    const scoreKey = candidate.candidateId ?? contextKey
    const score = Number(identityScores[scoreKey] ?? "")
    const response = await fetch("/api/ai/model-reference-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: id,
        model_id: modelId,
        asset_type: "outfit",
        image_data_url: candidate.imageDataUrl,
        prompt_used: candidate.prompt,
        negative_prompt_used: candidate.negativePrompt,
        generation_settings: candidate.generationSettings,
        notes: slotNotes[contextKey] ?? candidate.notes ?? null,
        identity_match_score: Number.isFinite(score) && score >= 1 && score <= 10 ? score : null,
        status: "pending",
      }),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok || !json.success) {
      setError(json.error || `Failed to save outfit variation with status ${response.status}.`)
      return
    }

    let savedAsset = json.asset as AiModelAsset
    if (status === "approved") {
      const { error: historicalError } = await supabase
        .from("ai_model_assets")
        .update({ status: "pending" })
        .eq("client_id", id)
        .eq("model_id", modelId)
        .eq("asset_type", "outfit")
        .eq("status", "approved")
        .contains("generation_settings", { outfit_id: outfit.id })
        .neq("id", savedAsset.id)
      if (historicalError) {
        setError(historicalError.message)
        return
      }
      const { data: approvedData, error: approveError } = await supabase
        .from("ai_model_assets")
        .update({ status: "approved" })
        .eq("client_id", id)
        .eq("id", savedAsset.id)
        .select("*")
        .single()
      if (approveError) {
        setError(approveError.message)
        return
      }
      savedAsset = approvedData as AiModelAsset
    }

    setAssets(previous => [
      savedAsset,
      ...previous.map(asset => {
        if (status === "approved" && asset.asset_type === "outfit" && asset.generation_settings?.outfit_id === outfit.id && asset.status === "approved") {
          return { ...asset, status: "pending" as const }
        }
        return asset
      }),
    ])
    setGeneratedOutfitCandidates(previous => {
      const nextCandidates = (previous[contextKey] ?? []).filter(item => item.candidateId !== candidate.candidateId)
      return { ...previous, [contextKey]: nextCandidates }
    })
    setIdentityScores(previous => ({ ...previous, [scoreKey]: "" }))
    setMessage(status === "approved" ? "Outfit variation saved and approved." : "Outfit variation saved as pending.")
  }

  function rejectOutfitCandidate(outfit: AiModelOutfit, candidate: GeneratedReferenceCandidate) {
    const contextKey = outfitContextKey(outfit)
    setGeneratedOutfitCandidates(previous => ({
      ...previous,
      [contextKey]: (previous[contextKey] ?? []).filter(item => item.candidateId !== candidate.candidateId),
    }))
    setMessage("Outfit variation rejected.")
  }

  async function updateAssetStatus(assetId: string, status: AiModelAsset["status"]) {
    const targetAsset = assets.find(asset => asset.id === assetId)
    const targetOutfitId = targetAsset?.asset_type === "outfit" && typeof targetAsset.generation_settings?.outfit_id === "string"
      ? targetAsset.generation_settings.outfit_id
      : null
    if (status === "approved" && targetAsset) {
      let historicalQuery = supabase
        .from("ai_model_assets")
        .update({ status: "pending" })
        .eq("client_id", id)
        .eq("model_id", modelId)
        .eq("asset_type", targetAsset.asset_type)
        .eq("status", "approved")
        .neq("id", assetId)

      if (targetAsset.asset_type === "outfit" && targetOutfitId) {
        historicalQuery = historicalQuery.contains("generation_settings", { outfit_id: targetOutfitId })
      }

      const { error: historicalError } = await historicalQuery

      if (historicalError) {
        setError(historicalError.message)
        return
      }
    }

    const { data, error: updateError } = await supabase
      .from("ai_model_assets")
      .update({ status })
      .eq("client_id", id)
      .eq("id", assetId)
      .select("*")
      .single()
    if (updateError) {
      setError(updateError.message)
      return
    }
    setAssets(previous => previous.map(asset => {
      if (asset.id === assetId) return data as AiModelAsset
      const sameApprovalGroup = targetAsset?.asset_type === "outfit"
        ? asset.asset_type === "outfit" && asset.generation_settings?.outfit_id === targetOutfitId
        : targetAsset && asset.asset_type === targetAsset.asset_type
      if (status === "approved" && targetAsset && sameApprovalGroup && asset.status === "approved") {
        return { ...asset, status: "pending" }
      }
      return asset
    }))
    setMessage(`Version marked ${status.replace("_", " ")}.`)
  }

  async function saveIdentityScore(assetId: string) {
    const asset = assets.find(item => item.id === assetId)
    if (!asset) return
    const score = Number(identityScores[assetId] ?? identityScoreFor(asset))
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      setError("Identity Match Score must be between 1 and 10.")
      return
    }
    const { data, error: updateError } = await supabase
      .from("ai_model_assets")
      .update({
        generation_settings: {
          ...(asset.generation_settings ?? {}),
          identity_match_score: score,
        },
      })
      .eq("client_id", id)
      .eq("id", assetId)
      .select("*")
      .single()
    if (updateError) {
      setError(updateError.message)
      return
    }
    setAssets(previous => previous.map(item => item.id === assetId ? data as AiModelAsset : item))
    setMessage("Identity Match Score saved.")
  }

  async function saveSlotNotes(slot: string) {
    const latest = latestVersion(assets, slot)
    const notes = slotNotes[slot] ?? ""
    if (!latest) {
      setMessage("Notes ready. They will be saved with the next image version.")
      return
    }
    const { data, error: updateError } = await supabase
      .from("ai_model_assets")
      .update({ notes })
      .eq("client_id", id)
      .eq("id", latest.id)
      .select("*")
      .single()
    if (updateError) {
      setError(updateError.message)
      return
    }
    setAssets(previous => previous.map(asset => asset.id === latest.id ? data as AiModelAsset : asset))
    setMessage("Notes saved.")
  }

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#050705] text-zinc-100">
        <Sidebar />
        <section className="flex-1 p-10 text-sm text-zinc-500">Loading model...</section>
      </main>
    )
  }

  if (!model) {
    return (
      <main className="flex min-h-screen bg-[#050705] text-zinc-100">
        <Sidebar />
        <section className="flex-1 p-10 text-sm text-red-200">{error || "Model not found."}</section>
      </main>
    )
  }

  const characterFacts = [
    draft.model_role || "Brand Character",
    draft.age ? String(draft.age) : null,
    draft.height,
    draft.nationality,
    draft.gender,
  ].filter(Boolean).join(" • ")
  const outfitOccasions = ["Breakfast", "Lunch", "Dinner"]
  const groupedAccessories = accessoryGroups()
  const activeOutfitContextKey = activeOutfit ? outfitContextKey(activeOutfit) : ""
  const activeOutfitVersions = activeOutfit ? outfitVersions(activeOutfit) : []
  const activeApprovedOutfit = activeOutfitVersions.find(asset => asset.status === "approved") ?? null
  const activeLatestOutfit = activeOutfitVersions[0] ?? null
  const activeGeneratedOutfitCandidates = activeOutfitContextKey ? generatedOutfitCandidates[activeOutfitContextKey] ?? [] : []
  const activeOutfitVariationCount = activeOutfit ? outfitVariationCounts[activeOutfit.id] ?? 1 : 1

  return (
    <main className="flex min-h-screen bg-[#050705] text-zinc-100">
      <Sidebar />
      <section className="relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_75%_10%,rgba(34,197,94,0.22),transparent_34%),linear-gradient(180deg,#070a08_0%,#030403_100%)]" />
        <div className="relative z-10 w-full space-y-6">
          <div className="sticky top-0 z-30 rounded-[1.75rem] border border-white/10 bg-[#070a08]/90 px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <Link href={`/clients/${id}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-emerald-300/40 hover:text-emerald-100">← Back to client</Link>
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-500">{client?.name ?? "Client"}</p>
                  <h1 className="truncate text-sm font-semibold text-zinc-100">AI Photography · Character Studio</h1>
                </div>
                <AiPhotographyNav clientId={id} active="models" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditOpen(true)} className={SECONDARY_BUTTON_CLASS}>Edit Character</button>
                <button type="button" onClick={generateMissingReferences} className={PRIMARY_BUTTON_CLASS}>Generate Missing References</button>
                <button
                  type="button"
                  onClick={finaliseModel}
                  disabled={finalising || draft.status === "approved"}
                  className={draft.status === "approved" ? SECONDARY_BUTTON_CLASS : PRIMARY_BUTTON_CLASS}
                >
                  {draft.status === "approved" ? "Finalised" : finalising ? "Finalising..." : "Finalise Model"}
                </button>
              </div>
            </div>
          </div>

          <header className="rounded-[2rem] border border-white/10 bg-white/[0.045] px-7 py-8 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-200/60">Guest Model</p>
                <h1 className="mt-4 text-5xl font-semibold tracking-tight text-zinc-50 md:text-6xl">{draft.model_name || "Untitled Character"}</h1>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">{characterFacts}</p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${draft.status === "approved" ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}>
                  {aiModelStatusLabel(draft.status)}
                </span>
                <p className="text-xs text-zinc-500">Character DNA approved: {approvedReferenceCount}/4</p>
                <p className="text-xs text-zinc-500">Approved outfits: {approvedOutfitCount}</p>
              </div>
            </div>
          </header>

          {(error || message) && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"}`}>
              {error || message}
            </div>
          )}

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-50">Character DNA</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">Approve the four foundation references first. These images become {draft.model_name || "the character"}’s permanent identity layer for outfits, lifestyle scenes, and campaign content.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {AI_MODEL_BASE_REFERENCE_SLOT_KEYS.map(slotKey => {
                    const approved = approvedReferenceMap.get(slotKey)
                    return (
                      <span key={slotKey} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${approved ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}>
                        {aiModelSlotShortLabel(slotKey)}: {approved ? "approved" : "missing"}
                      </span>
                    )
                  })}
                  {characterDnaComplete && <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold text-emerald-50">Character DNA Complete</span>}
                  {!characterDnaComplete && <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">Finalise unlocks after all four references are approved</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-500 sm:min-w-[420px]">
                {["Reference Set", "Outfit", "Lifestyle Scene", "Campaign Scene", "Final Content"].map((step, index) => (
                  <div key={step} className={`rounded-2xl border px-3 py-2 ${index === 0 ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-black/25"}`}>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-50">Character References</h2>
                <p className="mt-1 text-sm text-zinc-500">Face and body references define the reusable digital human.</p>
              </div>
            </div>
            {(["Face", "Body"] as const).map(group => (
              <div key={group} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">{group}</h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  {AI_MODEL_REFERENCE_SLOTS.filter(slot => slot.group === group).map(slot => {
                    const approved = approvedVersion(assets, slot.key)
                    const latest = latestVersion(assets, slot.key)
                    const versions = assets.filter(asset => asset.asset_type === slot.key)
                    const score = identityScoreFor(approved ?? latest)
                    return (
                      <button key={slot.key} type="button" onClick={() => openReferenceModal(slot.key)} className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] text-left shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition hover:border-emerald-300/35">
                        <div className="grid gap-0 sm:grid-cols-[190px_1fr]">
                          <div className="aspect-[4/5] bg-black/35">
                            {approved?.image_url ? (
                              <img src={approved.image_url} alt={slot.label} className="h-full w-full object-cover object-top" />
                            ) : (
                              <div className="flex h-full items-center justify-center px-5 text-center text-xs text-zinc-600">Empty reference slot</div>
                            )}
                          </div>
                          <div className="flex min-h-full flex-col justify-between p-5">
                            <div>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/60">{slot.purpose}</p>
                                  <h4 className="mt-2 text-xl font-semibold text-zinc-50">{slot.shortLabel}</h4>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${approved ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}>
                                  {approved ? "Approved" : "Missing"}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{slot.helper}</p>
                            </div>
                            <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                              <span>Latest: {latest ? `v${latest.version_number} ${latest.status}` : "none"}</span>
                              <span>Versions: {versions.length}</span>
                              <span>Identity score: {score || "not scored"}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-50">Wardrobe Collections</h2>
                <p className="mt-1 text-sm text-zinc-500">Stylist-led Italian/Dubai wardrobe collections. Each collection uses approved Character DNA by default and generates clothing plus footwear only.</p>
              </div>
            </div>
            {outfitOccasions.map(occasionName => {
              const occasionOutfits = outfits
                .filter(outfit => (outfit.occasion ?? "").toLowerCase() === occasionName.toLowerCase())
                .sort((left, right) => left.outfit_name.localeCompare(right.outfit_name))
              return (
                <div key={occasionName} className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">{occasionName} Outfits</h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {occasionOutfits.map(outfit => {
                      const versions = outfitVersions(outfit)
                      const approved = versions.find(asset => asset.status === "approved") ?? null
                      const latest = versions[0] ?? null
                      return (
                        <article key={outfit.id} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                          <button type="button" onClick={() => prepareOutfit(outfit)} className="block w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left">
                            <div className="aspect-[4/5]">
                              {approved?.image_url ? <img src={approved.image_url} alt={outfit.outfit_name} className="h-full w-full object-cover object-top" /> : <div className="flex h-full items-center justify-center px-5 text-center text-xs text-zinc-600">No approved outfit image</div>}
                            </div>
                          </button>
                          <div className="mt-4 flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-lg font-semibold text-zinc-50">{outfit.outfit_name}</h4>
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/60">{outfit.collection_style || outfit.occasion || "Wardrobe Collection"}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${approved ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-black/25 text-zinc-300"}`}>{approved ? "Approved" : aiModelStatusLabel(outfit.status)}</span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-zinc-400">{outfit.fashion_dna || outfit.mood || outfit.outfit_description || "Collection mood pending."}</p>
                          <div className="mt-3 space-y-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-zinc-500">
                            {(outfit.allowed_silhouettes || outfit.garments) && <p><span className="font-semibold text-zinc-300">Silhouettes:</span> {outfit.allowed_silhouettes || outfit.garments}</p>}
                            {(outfit.allowed_colour_families || outfit.colour_palette) && <p><span className="font-semibold text-zinc-300">Colour Families:</span> {outfit.allowed_colour_families || outfit.colour_palette}</p>}
                            {(outfit.footwear_direction || outfit.footwear) && <p><span className="font-semibold text-zinc-300">Footwear:</span> {outfit.footwear_direction || outfit.footwear}</p>}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => prepareOutfit(outfit)} className={PRIMARY_BUTTON_CLASS}>Generate</button>
                            <button type="button" onClick={() => prepareOutfit(outfit)} className={SECONDARY_BUTTON_CLASS}>Regenerate</button>
                            {latest && <button type="button" onClick={() => updateAssetStatus(latest.id, "approved")} className={SECONDARY_BUTTON_CLASS}>Approve</button>}
                            {latest && <button type="button" onClick={() => updateAssetStatus(latest.id, "rejected")} className={SECONDARY_BUTTON_CLASS}>Reject</button>}
                          </div>
                          <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-400">
                            <summary className="cursor-pointer text-zinc-200">Notes, prompt, version history · {versions.length}</summary>
                            <p className="mt-3 leading-relaxed"><span className="font-semibold text-zinc-300">Collection DNA:</span> {latest?.notes || outfit.styling_notes || "No notes yet."}</p>
                            {latest?.prompt_used && <p className="mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 leading-relaxed">{latest.prompt_used}</p>}
                            <div className="mt-3 space-y-2">
                              {versions.map(version => (
                                <div key={version.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>v{version.version_number} · {version.status} · score {identityScoreFor(version) || "not scored"}</span>
                                    <button type="button" onClick={() => updateAssetStatus(version.id, "needs_regeneration")} className="text-[11px] font-semibold text-amber-100 hover:text-amber-50">Needs Regeneration</button>
                                  </div>
                                </div>
                              ))}
                              {versions.length === 0 && <p className="text-zinc-500">No outfit versions saved yet.</p>}
                            </div>
                          </details>
                        </article>
                      )
                    })}
                    {occasionOutfits.length === 0 && <p className="rounded-[2rem] border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-zinc-500 md:col-span-2 xl:col-span-3">No {occasionName.toLowerCase()} outfits yet.</p>}
                  </div>
                </div>
              )
            })}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-50">Accessories</h2>
              <p className="mt-1 text-sm text-zinc-500">Reusable accessories are stored here for the next generation layer. Outfit references stay clothing-only for now.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {Object.entries(groupedAccessories).map(([category, items]) => (
                <article key={category} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200/60">{category}</h3>
                  <div className="mt-4 space-y-2">
                    {items.map(accessory => (
                      <div key={accessory.id} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-sm font-semibold text-zinc-100">{accessory.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{accessory.description || accessory.prompt_fragment || "Reusable accessory."}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {accessories.length === 0 && <p className="rounded-[2rem] border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-zinc-500 lg:col-span-2 xl:col-span-4">No accessories seeded yet.</p>}
            </div>
          </section>

          <details className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-2xl">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Studio History</summary>
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-300">Asset Versions</h3>
                <div className="mt-3 space-y-3">
                  {assets.map(asset => (
                    <article key={asset.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-100">{aiModelSlotLabel(asset.asset_type)} · v{asset.version_number}</p>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-zinc-300">{asset.status}</span>
                      </div>
                      {asset.image_url && <img src={asset.image_url} alt={asset.asset_type} className="mt-3 max-h-56 w-full rounded-xl object-contain" />}
                    </article>
                  ))}
                  {assets.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">No image versions yet.</p>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-300">Saved Prompts</h3>
                <div className="mt-3 space-y-3">
                  {prompts.map(prompt => (
                    <details key={prompt.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{prompt.prompt_type.replaceAll("_", " ")} · {new Date(prompt.created_at).toLocaleDateString()}</summary>
                      <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{prompt.final_prompt}</p>
                    </details>
                  ))}
                  {prompts.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">No saved prompts yet.</p>}
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[#070a08] p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-white/10 bg-[#070a08]/95 px-6 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Character Settings</p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-50">Edit Character</h2>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={saveOverview} disabled={saving} className={PRIMARY_BUTTON_CLASS}>{saving ? "Saving..." : "Save"}</button>
                  <button type="button" onClick={() => setEditOpen(false)} className={SECONDARY_BUTTON_CLASS}>Close</button>
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label><span className="text-xs font-semibold text-zinc-400">Model Name</span><input value={draft.model_name} onChange={event => patchDraft({ model_name: event.target.value })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Archetype / Role</span><input value={draft.model_role ?? ""} onChange={event => patchDraft({ model_role: event.target.value })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Age</span><input type="number" value={draft.age ?? ""} onChange={event => patchDraft({ age: event.target.value ? Number(event.target.value) : null })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Height <span className="font-normal text-zinc-600">(recommended)</span></span><input value={draft.height ?? ""} onChange={event => patchDraft({ height: event.target.value })} placeholder="170 cm or 5'7&quot;" className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Gender</span><input value={draft.gender ?? ""} onChange={event => patchDraft({ gender: event.target.value })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Nationality</span><input value={draft.nationality ?? ""} onChange={event => patchDraft({ nationality: event.target.value })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Skin Tone</span><input value={draft.skin_tone ?? ""} onChange={event => patchDraft({ skin_tone: event.target.value })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Hair</span><input value={draft.hair_description ?? ""} onChange={event => patchDraft({ hair_description: event.target.value })} className={CONTROL_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Eyes</span><input value={draft.eye_description ?? ""} onChange={event => patchDraft({ eye_description: event.target.value })} className={CONTROL_CLASS} /></label>
              <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Ethnicity / Appearance Notes</span><textarea value={draft.ethnicity_appearance_notes ?? ""} onChange={event => patchDraft({ ethnicity_appearance_notes: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Body Type</span><textarea value={draft.body_type ?? ""} onChange={event => patchDraft({ body_type: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Personality</span><textarea value={draft.personality ?? ""} onChange={event => patchDraft({ personality: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Brand Role</span><textarea value={draft.brand_role ?? ""} onChange={event => patchDraft({ brand_role: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Approved Usage</span><textarea value={draft.approved_usage ?? ""} onChange={event => patchDraft({ approved_usage: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Restricted Usage</span><textarea value={draft.restricted_usage ?? ""} onChange={event => patchDraft({ restricted_usage: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Base Prompt</span><textarea value={draft.base_prompt ?? ""} onChange={event => patchDraft({ base_prompt: event.target.value })} rows={5} className={TEXTAREA_CLASS} /></label>
              <label className="md:col-span-2"><span className="text-xs font-semibold text-zinc-400">Negative Prompt</span><textarea value={draft.negative_prompt ?? ""} onChange={event => patchDraft({ negative_prompt: event.target.value })} rows={4} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Realism Prompt</span><textarea value={draft.realism_prompt ?? ""} onChange={event => patchDraft({ realism_prompt: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Quality Prompt</span><textarea value={draft.quality_prompt ?? ""} onChange={event => patchDraft({ quality_prompt: event.target.value })} rows={3} className={TEXTAREA_CLASS} /></label>
              <label><span className="text-xs font-semibold text-zinc-400">Status</span><select value={draft.status} onChange={event => patchDraft({ status: event.target.value as AiModel["status"] })} className={CONTROL_CLASS}><option value="draft">Draft</option><option value="generating">Generating</option><option value="review">Review</option><option value="approved">Approved</option><option value="archived">Archived</option></select></label>
            </div>
          </aside>
        </div>
      )}

      {activeOutfit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setActiveOutfitId(null)}>
          <section className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#070a08] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/60">{activeOutfit.occasion ?? "Outfit"} Generation</p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{activeOutfit.outfit_name}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400">Outfit generations are studio wardrobe references only. Accessories and lifestyle backgrounds are added later.</p>
              </div>
              <button type="button" onClick={() => setActiveOutfitId(null)} className={SECONDARY_BUTTON_CLASS}>Close</button>
            </div>
            <div className="grid max-h-[calc(92vh-78px)] gap-0 overflow-y-auto xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="border-b border-white/10 p-5 xl:border-b-0 xl:border-r">
                <h3 className="text-sm font-semibold text-zinc-300">Current Approved Outfit</h3>
                <div className="mt-3 aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                  {generatingSlot === activeOutfitContextKey ? (
                    <div className="flex h-full items-center justify-center px-5 text-center text-sm text-emerald-100">Generating {activeOutfitVariationCount} outfit variation{activeOutfitVariationCount === 1 ? "" : "s"} with Nano Banana Pro...</div>
                  ) : activeApprovedOutfit?.image_url ? (
                    <img src={activeApprovedOutfit.image_url} alt={activeOutfit.outfit_name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-5 text-center text-sm text-zinc-600">No approved outfit version yet</div>
                  )}
                </div>
                {referenceGenerationError && <p className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{referenceGenerationError}</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label><span className="text-xs font-semibold text-zinc-400">Generated outfit URL</span><input value={newVersionUrls[activeOutfitContextKey] ?? ""} onChange={event => setNewVersionUrls(previous => ({ ...previous, [activeOutfitContextKey]: event.target.value }))} placeholder="Paste image URL" className={CONTROL_CLASS} /></label>
                  <label><span className="text-xs font-semibold text-zinc-400">Identity Match Score 1-10</span><input type="number" min={1} max={10} value={identityScores[activeOutfitContextKey] ?? ""} onChange={event => setIdentityScores(previous => ({ ...previous, [activeOutfitContextKey]: event.target.value }))} placeholder="Optional" className={CONTROL_CLASS} /></label>
                </div>
                <button type="button" onClick={() => saveOutfitVersion(activeOutfit)} disabled={generatingSlot === activeOutfitContextKey} className={`mt-3 ${PRIMARY_BUTTON_CLASS}`}>Save Image</button>
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">Saved outfit images become version-history records with prompt, negative prompt, Character DNA reference chain, notes, and optional identity score.</p>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-zinc-300">Version History</h3>
                  <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                    {activeOutfitVersions.map(asset => (
                      <article key={asset.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-zinc-100">v{asset.version_number} · {asset.status}</p>
                          <span className="text-[11px] text-zinc-500">score {identityScoreFor(asset) || "not scored"}</span>
                        </div>
                        {asset.image_url && <img src={asset.image_url} alt={activeOutfit.outfit_name} className="mt-3 max-h-48 w-full rounded-xl object-contain" />}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => updateAssetStatus(asset.id, "approved")} className={SECONDARY_BUTTON_CLASS}>Approve</button>
                          <button type="button" onClick={() => updateAssetStatus(asset.id, "rejected")} className={SECONDARY_BUTTON_CLASS}>Reject</button>
                          <button type="button" onClick={() => updateAssetStatus(asset.id, "needs_regeneration")} className={SECONDARY_BUTTON_CLASS}>Needs Regeneration</button>
                        </div>
                        <div className="mt-3 flex items-end gap-2">
                          <label className="flex-1"><span className="text-xs font-semibold text-zinc-400">Identity Match Score</span><input type="number" min={1} max={10} value={identityScores[asset.id] ?? identityScoreFor(asset)} onChange={event => setIdentityScores(previous => ({ ...previous, [asset.id]: event.target.value }))} className={CONTROL_CLASS} /></label>
                          <button type="button" onClick={() => saveIdentityScore(asset.id)} className={SECONDARY_BUTTON_CLASS}>Save Score</button>
                        </div>
                      </article>
                    ))}
                    {activeOutfitVersions.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">No outfit versions saved yet.</p>}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <h3 className="text-sm font-semibold text-zinc-100">Wardrobe Collection DNA</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{activeOutfit.fashion_dna || activeOutfit.outfit_description || "No fashion DNA yet."}</p>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
                    {activeOutfit.occasion && <p><span className="font-semibold text-zinc-300">Category:</span> {activeOutfit.occasion}</p>}
                    {activeOutfit.collection_style && <p><span className="font-semibold text-zinc-300">Style:</span> {activeOutfit.collection_style}</p>}
                    {activeOutfit.mood && <p><span className="font-semibold text-zinc-300">Mood:</span> {activeOutfit.mood}</p>}
                    {activeOutfit.climate && <p><span className="font-semibold text-zinc-300">Climate:</span> {activeOutfit.climate}</p>}
                    {activeOutfit.fashion_dna && <p className="sm:col-span-2"><span className="font-semibold text-zinc-300">Fashion DNA:</span> {activeOutfit.fashion_dna}</p>}
                    {(activeOutfit.allowed_silhouettes || activeOutfit.garments) && <p className="sm:col-span-2"><span className="font-semibold text-zinc-300">Allowed Silhouettes:</span> {activeOutfit.allowed_silhouettes || activeOutfit.garments}</p>}
                    {activeOutfit.allowed_materials && <p className="sm:col-span-2"><span className="font-semibold text-zinc-300">Allowed Materials:</span> {activeOutfit.allowed_materials}</p>}
                    {(activeOutfit.allowed_colour_families || activeOutfit.colour_palette) && <p className="sm:col-span-2"><span className="font-semibold text-zinc-300">Allowed Colour Families:</span> {activeOutfit.allowed_colour_families || activeOutfit.colour_palette}</p>}
                    {(activeOutfit.footwear_direction || activeOutfit.footwear) && <p className="sm:col-span-2"><span className="font-semibold text-zinc-300">Footwear Direction:</span> {activeOutfit.footwear_direction || activeOutfit.footwear}</p>}
                    {activeOutfit.styling_notes && <p className="sm:col-span-2"><span className="font-semibold text-zinc-300">Stylist Notes:</span> {activeOutfit.styling_notes}</p>}
                  </div>
                </section>

                <section className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Character DNA References Used</h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">All approved base references are selected by default. Deselect only for controlled testing.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-zinc-300">{selectedReferenceAssetsForOutfit(activeOutfit).length}/4 selected</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {AI_MODEL_BASE_REFERENCE_SLOT_KEYS.map(slotKey => {
                      const approved = approvedReferenceMap.get(slotKey)
                      const isSelected = approved ? !(deselectedReferenceIds[activeOutfitContextKey] ?? []).includes(approved.id) : false
                      return approved?.image_url ? (
                        <label key={slotKey} className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleReferenceImage(activeOutfitContextKey, approved.id)} className="h-4 w-4 accent-emerald-400" />
                          <img src={approved.image_url} alt={aiModelSlotShortLabel(slotKey)} className="h-12 w-10 rounded-lg object-cover object-top" />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-zinc-100">{aiModelSlotShortLabel(slotKey)}</span>
                            <span className="block text-[11px] text-zinc-500">Approved v{approved.version_number}</span>
                          </span>
                        </label>
                      ) : (
                        <p key={slotKey} className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Missing reference: {aiModelSlotShortLabel(slotKey)} not approved yet.</p>
                      )
                    })}
                  </div>
                </section>

                <label className="mt-4 block"><span className="text-xs font-semibold text-zinc-400">Comments / Refinement Notes</span><textarea value={slotNotes[activeOutfitContextKey] ?? ""} onChange={event => setSlotNotes(previous => ({ ...previous, [activeOutfitContextKey]: event.target.value }))} placeholder="make it softer, more lunch appropriate, less dressy, flatter studio lighting..." rows={3} className={TEXTAREA_CLASS} /></label>
                <label className="mt-4 block max-w-xs">
                  <span className="text-xs font-semibold text-zinc-400">Variations</span>
                  <select value={activeOutfitVariationCount} onChange={event => setOutfitVariationCounts(previous => ({ ...previous, [activeOutfit.id]: Number(event.target.value) }))} className={CONTROL_CLASS}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                  <span className="mt-2 block text-[11px] leading-relaxed text-zinc-500">Higher variation count creates more different outfit interpretations, not duplicates.</span>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => generateOutfitPrompt(activeOutfit)} disabled={generatingSlot === activeOutfitContextKey} className={PRIMARY_BUTTON_CLASS}>Generate Prompt</button>
                  <button type="button" onClick={() => generateOutfitImage(activeOutfit)} disabled={generatingSlot === activeOutfitContextKey} className={PRIMARY_BUTTON_CLASS}>Generate Image{activeOutfitVariationCount > 1 ? `s (${activeOutfitVariationCount})` : ""}</button>
                  <button type="button" onClick={() => generateOutfitImage(activeOutfit, { withNotes: true })} disabled={generatingSlot === activeOutfitContextKey} className={SECONDARY_BUTTON_CLASS}>Regenerate With Notes</button>
                  <button type="button" onClick={copyPrompt} disabled={!finalPrompt || generatingSlot === activeOutfitContextKey} className={SECONDARY_BUTTON_CLASS}>Copy Prompt</button>
                  <button type="button" onClick={savePromptRun} disabled={!finalPrompt || generatingSlot === activeOutfitContextKey} className={SECONDARY_BUTTON_CLASS}>Save Prompt</button>
                  {activeLatestOutfit && <button type="button" onClick={() => updateAssetStatus(activeLatestOutfit.id, "approved")} disabled={generatingSlot === activeOutfitContextKey} className={SECONDARY_BUTTON_CLASS}>Approve Latest</button>}
                  {activeLatestOutfit && <button type="button" onClick={() => updateAssetStatus(activeLatestOutfit.id, "rejected")} disabled={generatingSlot === activeOutfitContextKey} className={SECONDARY_BUTTON_CLASS}>Reject Latest</button>}
                  {activeLatestOutfit && <button type="button" onClick={() => updateAssetStatus(activeLatestOutfit.id, "needs_regeneration")} disabled={generatingSlot === activeOutfitContextKey} className={SECONDARY_BUTTON_CLASS}>Needs Regeneration</button>}
                </div>
                {activeGeneratedOutfitCandidates.length > 0 && (
                  <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-amber-50">Generated Variations</h3>
                        <p className="mt-1 text-xs text-amber-100/70">Save the strongest option, or save and approve it directly as the active wardrobe reference.</p>
                      </div>
                      <span className="rounded-full border border-amber-300/25 px-2.5 py-1 text-[10px] font-semibold text-amber-100">{activeGeneratedOutfitCandidates.length} unsaved</span>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {activeGeneratedOutfitCandidates.map((candidate, index) => {
                        const scoreKey = candidate.candidateId ?? `${activeOutfitContextKey}:${index}`
                        return (
                          <article key={scoreKey} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                            <div className="aspect-[4/5] overflow-hidden rounded-xl border border-white/10 bg-black/40">
                              <img src={candidate.imageDataUrl} alt={`${activeOutfit.outfit_name} variation ${candidate.variationNumber ?? index + 1}`} className="h-full w-full object-contain" />
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-zinc-100">Variation {candidate.variationNumber ?? index + 1}</p>
                              <span className="text-[11px] text-zinc-500">{candidate.prompt.length} chars</span>
                            </div>
                            <label className="mt-3 block"><span className="text-xs font-semibold text-zinc-400">Identity Match Score</span><input type="number" min={1} max={10} value={identityScores[scoreKey] ?? ""} onChange={event => setIdentityScores(previous => ({ ...previous, [scoreKey]: event.target.value }))} className={CONTROL_CLASS} /></label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={() => saveOutfitCandidate(activeOutfit, candidate, "pending")} className={PRIMARY_BUTTON_CLASS}>Save</button>
                              <button type="button" onClick={() => saveOutfitCandidate(activeOutfit, candidate, "approved")} className={SECONDARY_BUTTON_CLASS}>Save + Approve</button>
                              <button type="button" onClick={() => rejectOutfitCandidate(activeOutfit, candidate)} className={SECONDARY_BUTTON_CLASS}>Reject</button>
                            </div>
                            <details className="mt-3 rounded-xl border border-white/10 bg-black/30 p-2 text-xs text-zinc-400">
                              <summary className="cursor-pointer text-zinc-200">Prompt used</summary>
                              <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap">{candidate.prompt}</p>
                            </details>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )}
                <label className="mt-4 block"><span className="text-xs font-semibold text-zinc-400">Prompt</span><textarea value={finalPrompt} onChange={event => setFinalPrompt(event.target.value)} rows={12} className={TEXTAREA_CLASS} /></label>
                <label className="mt-4 block"><span className="text-xs font-semibold text-zinc-400">Negative Prompt</span><textarea value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} rows={5} className={TEXTAREA_CLASS} /></label>
                {activeLatestOutfit?.prompt_used && (
                  <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-400">
                    <summary className="cursor-pointer text-zinc-200">Latest saved outfit prompt</summary>
                    <p className="mt-2 whitespace-pre-wrap">{activeLatestOutfit.prompt_used}</p>
                  </details>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeReferenceConfig && activeReferenceSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setActiveReferenceSlot(null)}>
          <section className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#070a08] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/60">Generate {activeReferenceConfig.shortLabel} Reference</p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{activeReferenceConfig.label}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400">
                  {activeReferenceConfig.group === "Face"
                    ? "Face References Wardrobe Standard: Black fitted t-shirt. Use a plain crew neck, short sleeves, no logos, no jewellery, and a white seamless studio background."
                    : "Body References Wardrobe Standard: Black underwear set, barefoot. These references are used only for body proportion and outfit consistency on a white seamless studio background."}
                </p>
              </div>
              <button type="button" onClick={() => setActiveReferenceSlot(null)} className={SECONDARY_BUTTON_CLASS}>Close</button>
            </div>
            <div className="grid max-h-[calc(92vh-78px)] gap-0 overflow-y-auto xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="border-b border-white/10 p-5 xl:border-b-0 xl:border-r">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-zinc-300">{activeGeneratedCandidate ? "Generated Preview" : "Current Approved Version"}</h3>
                  {activeGeneratedCandidate && <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100">Unsaved generation</span>}
                </div>
                <div className="mt-3 aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                  {generatingSlot === activeReferenceSlot ? (
                    <div className="flex h-full items-center justify-center px-5 text-center text-sm text-emerald-100">Generating with Nano Banana Pro...</div>
                  ) : activeGeneratedCandidate?.imageDataUrl ? (
                    <img src={activeGeneratedCandidate.imageDataUrl} alt={`${activeReferenceConfig.label} generated preview`} className="h-full w-full object-contain" />
                  ) : activeApprovedReference?.image_url ? (
                    <img src={activeApprovedReference.image_url} alt={activeReferenceConfig.label} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-5 text-center text-sm text-zinc-600">No approved version yet</div>
                  )}
                </div>
                {referenceGenerationError && <p className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{referenceGenerationError}</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label><span className="text-xs font-semibold text-zinc-400">Generated image URL</span><input value={newVersionUrls[activeReferenceSlot] ?? ""} onChange={event => setNewVersionUrls(previous => ({ ...previous, [activeReferenceSlot]: event.target.value }))} placeholder="Paste image URL" className={CONTROL_CLASS} /></label>
                  <label><span className="text-xs font-semibold text-zinc-400">Identity Match Score 1-10</span><input type="number" min={1} max={10} value={identityScores[activeReferenceSlot] ?? ""} onChange={event => setIdentityScores(previous => ({ ...previous, [activeReferenceSlot]: event.target.value }))} placeholder="Optional" className={CONTROL_CLASS} /></label>
                </div>
                <button type="button" onClick={() => saveVersion(activeReferenceSlot)} disabled={generatingSlot === activeReferenceSlot} className={`mt-3 ${PRIMARY_BUTTON_CLASS}`}>Save Image</button>
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">Generate directly with Nano Banana Pro or paste an external image URL. Saved images become version-history records with prompt, negative prompt, notes, and optional identity score.</p>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-zinc-300">Version History</h3>
                  <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                    {activeReferenceAssets.map(asset => (
                      <article key={asset.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-zinc-100">v{asset.version_number} · {asset.status}</p>
                          <span className="text-[11px] text-zinc-500">score {identityScoreFor(asset) || "not scored"}</span>
                        </div>
                        {asset.image_url && <img src={asset.image_url} alt={activeReferenceConfig.label} className="mt-3 max-h-48 w-full rounded-xl object-contain" />}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => updateAssetStatus(asset.id, "approved")} className={SECONDARY_BUTTON_CLASS}>Approve</button>
                          <button type="button" onClick={() => updateAssetStatus(asset.id, "rejected")} className={SECONDARY_BUTTON_CLASS}>Reject</button>
                          <button type="button" onClick={() => updateAssetStatus(asset.id, "needs_regeneration")} className={SECONDARY_BUTTON_CLASS}>Needs Regeneration</button>
                        </div>
                        <div className="mt-3 flex items-end gap-2">
                          <label className="flex-1"><span className="text-xs font-semibold text-zinc-400">Identity Match Score</span><input type="number" min={1} max={10} value={identityScores[asset.id] ?? identityScoreFor(asset)} onChange={event => setIdentityScores(previous => ({ ...previous, [asset.id]: event.target.value }))} className={CONTROL_CLASS} /></label>
                          <button type="button" onClick={() => saveIdentityScore(asset.id)} className={SECONDARY_BUTTON_CLASS}>Save Score</button>
                        </div>
                      </article>
                    ))}
                    {activeReferenceAssets.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">No versions saved yet.</p>}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <section className="mb-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Reference Images Used</h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">Approved Character DNA references are visual anchors for this generation.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-zinc-300">
                      {selectedReferenceAssetsForSlot(activeReferenceSlot).length} selected
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {dependencySlotsForReference(activeReferenceSlot).length === 0 && (
                      <p className="rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">Front Face starts the Character DNA. This step is text-only by design.</p>
                    )}
                    {dependencySlotsForReference(activeReferenceSlot).map(dependencySlot => {
                      const approved = approvedReferenceMap.get(dependencySlot)
                      const contextKey = referenceContextKey(activeReferenceSlot)
                      const isSelected = approved ? !(deselectedReferenceIds[contextKey] ?? []).includes(approved.id) : false
                      return approved?.image_url ? (
                        <label key={dependencySlot} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleReferenceImage(contextKey, approved.id)} className="h-4 w-4 accent-emerald-400" />
                          <img src={approved.image_url} alt={aiModelSlotShortLabel(dependencySlot)} className="h-14 w-11 rounded-lg object-cover object-top" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-zinc-100">{aiModelSlotShortLabel(dependencySlot)}</span>
                            <span className="block text-[11px] text-zinc-500">Approved v{approved.version_number}</span>
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-100">{isSelected ? "Using" : "Deselected"}</span>
                        </label>
                      ) : (
                        <p key={dependencySlot} className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Missing reference: {aiModelSlotShortLabel(dependencySlot)} not approved yet.</p>
                      )
                    })}
                  </div>
                </section>
                <label className="block"><span className="text-xs font-semibold text-zinc-400">Comments / Refinement Notes</span><textarea value={slotNotes[activeReferenceSlot] ?? ""} onChange={event => setSlotNotes(previous => ({ ...previous, [activeReferenceSlot]: event.target.value }))} placeholder="make her younger, softer smile, darker hair, flatter studio lighting..." rows={3} className={TEXTAREA_CLASS} /></label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => generateReferencePrompt(activeReferenceSlot)} disabled={generatingSlot === activeReferenceSlot} className={PRIMARY_BUTTON_CLASS}>Generate Prompt</button>
                  <button type="button" onClick={() => generateReferenceImage(activeReferenceSlot)} disabled={generatingSlot === activeReferenceSlot} className={PRIMARY_BUTTON_CLASS}>Generate Image</button>
                  <button type="button" onClick={() => generateReferenceImage(activeReferenceSlot, { withNotes: true })} disabled={generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Regenerate With Notes</button>
                  <button type="button" onClick={copyPrompt} disabled={!finalPrompt || generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Copy Prompt</button>
                  <button type="button" onClick={savePromptRun} disabled={!finalPrompt || generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Save Prompt</button>
                  <button type="button" onClick={() => saveSlotNotes(activeReferenceSlot)} disabled={generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Save Notes</button>
                  {!activeGeneratedCandidate && activeLatestReference && <button type="button" onClick={() => updateAssetStatus(activeLatestReference.id, "approved")} disabled={generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Approve</button>}
                  {!activeGeneratedCandidate && activeLatestReference && <button type="button" onClick={() => updateAssetStatus(activeLatestReference.id, "rejected")} disabled={generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Reject</button>}
                  {!activeGeneratedCandidate && activeLatestReference && <button type="button" onClick={() => updateAssetStatus(activeLatestReference.id, "needs_regeneration")} disabled={generatingSlot === activeReferenceSlot} className={SECONDARY_BUTTON_CLASS}>Needs Regeneration</button>}
                </div>
                <label className="mt-4 block"><span className="text-xs font-semibold text-zinc-400">Prompt</span><textarea value={finalPrompt} onChange={event => setFinalPrompt(event.target.value)} rows={14} className={TEXTAREA_CLASS} /></label>
                <label className="mt-4 block"><span className="text-xs font-semibold text-zinc-400">Negative Prompt</span><textarea value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} rows={5} className={TEXTAREA_CLASS} /></label>
                {activeLatestReference?.prompt_used && (
                  <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-400">
                    <summary className="cursor-pointer text-zinc-200">Latest saved prompt</summary>
                    <p className="mt-2 whitespace-pre-wrap">{activeLatestReference.prompt_used}</p>
                  </details>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
