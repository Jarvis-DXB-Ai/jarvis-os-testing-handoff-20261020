"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import {
  COMPOSITION_FIDELITY_OPTIONS,
  DEFAULT_COMPOSITION_FIDELITY,
  buildCameraRulePrompt,
  buildLockedScenePlatePrompt,
  buildProviderGuidancePrompt,
  buildStrictNegativePrompt,
  compositionFidelityLabel,
  compositionFidelityPercent,
  normalizeCompositionFidelityMode,
  type CompositionFidelityMode,
} from "@/lib/environment-preservation"
import { PINTEREST_INSPIRATION_ROLES, PINTEREST_INSPIRATION_USAGES, pinterestPromptLine, type PinterestBoard, type PinterestInspirationRef, type PinterestInspirationRole, type PinterestInspirationUsage, type PinterestMoodboard, type PinterestPinImageRef } from "@/lib/pinterest-inspiration"
import { supabase } from "@/lib/supabase"
import {
  buildVenueSpatialPrompt,
  resolveVenueSpatialMetadataList,
  venueSpatialDisplaySummary,
} from "@/lib/venue-spatial-metadata"

type Client = {
  id: string
  name: string
  industry: string | null
  status: string
}

type AssetUpload = {
  id: string
  file_name: string
  asset_category: string
  file_path?: string
  optimized_file_path?: string
  ai_preview_path?: string
  extracted_summary?: string | null
  metadata?: unknown
}

type PinterestMoodboardsApi = {
  accounts?: unknown[]
  boards?: PinterestBoard[]
  moodboards?: PinterestMoodboard[]
  summary?: Record<string, unknown>
  connectionState?: string
  error?: string
}

type PinterestDirectPinsApi = {
  data?: PinterestPinImageRef[]
  summary?: Record<string, unknown>
  connectionState?: string
  error?: string
}

type GuestModelRow = {
  id: string
  name: string | null
  status: string | null
  profession: string | null
  ethnicity: string | null
  model_references: unknown
  outfit_sets: unknown
  accessories: unknown
}

type ModelItem = {
  id: string
  label: string
  subtitle: string
  previewUrl: string
}

type AccessoryItem = {
  id: string
  label: string
  subtitle: string
  previewUrl: string
}

type PickerKey = "venue" | "foodStudio" | "drinkStudio" | "models" | "accessories" | "inspiration"
type VideoWorkspace = "story" | "pinterest"

type PickerItem = {
  id: string
  label: string
  subtitle: string
  url?: string
  badge: string
  category?: string | null
  file_name?: string | null
  asset_category?: string | null
  extracted_summary?: string | null
  metadata?: unknown
}

type StoryboardShot = {
  shot: number
  title: string
  description: string
  truthAssets: string[]
  cameraAngle: string
  cameraMovement: string
  lightingMood: string
  startFrame: string
  endFrame: string
  transition: string
  klingNotes: string
}

type StoryboardResult = {
  purpose: string
  storyline: string
  shots: StoryboardShot[]
  prompt: string
  autoSelectionSummary: string[]
  planning: Record<PickerKey, PickerItem[]>
}

type VideoFrameQuality = "2k" | "4k"

type VideoFrameStatus = "pending" | "generating" | "complete" | "failed"

type VideoFrameState = {
  shot: number
  title: string
  status: VideoFrameStatus
  prompt: string
  relevantAssetLabels: string[]
  generatedImageData?: string
  generatedImageMimeType?: string
  error?: string
  providerLatencyMs?: number
  quality: VideoFrameQuality
}

const VIDEO_GOALS = [
  "Brand Atmosphere",
  "Food Hero",
  "Drink Ritual",
  "Date Night",
  "Business Lunch",
  "Traffic Hours",
  "Dinner Experience",
  "Chef Story",
  "Product Launch",
  "Venue Mood Piece",
  "Making Of",
]

const VIDEO_FORMATS = ["9:16", "4:5", "1:1", "16:9"]
const DURATION_TARGETS = ["5s", "10s", "15s", "20s"]
const VIDEO_FRAME_QUALITIES: Array<{ value: VideoFrameQuality; label: string; helper: string }> = [
  { value: "2k", label: "2K", helper: "Default test mode" },
  { value: "4k", label: "4K", helper: "Higher-cost option" },
]
const SHOT_COUNT = 5

const PICKER_CONFIG: Array<{ key: PickerKey; title: string; subtitle: string; accent: string }> = [
  { key: "venue", title: "Venue / Location", subtitle: "Optional anchor. Jarvis can auto-select interiors/exteriors from Client Brain.", accent: "emerald" },
  { key: "foodStudio", title: "Food Studio Shots", subtitle: "Optional clean AI truth refs only. Raw food uploads stay out of videography planning.", accent: "amber" },
  { key: "drinkStudio", title: "Drink Studio Shots", subtitle: "Optional clean beverage truth refs only. Jarvis can auto-select by objective.", accent: "cyan" },
  { key: "models", title: "Models", subtitle: "Optional people anchors. Model profiles carry outfit/accessory context where available.", accent: "violet" },
  { key: "accessories", title: "Accessories", subtitle: "Optional extra owner-bound detail anchors for future keyframes.", accent: "fuchsia" },
]

const INSPIRATION_CONFIG = {
  key: "inspiration" as PickerKey,
  title: "Pinterest Inspiration",
  subtitle: "Camera style, pacing, lighting, mood, and transitions only.",
  accent: "sky",
}

const EMPTY_SELECTIONS: Record<PickerKey, string[]> = {
  venue: [],
  foodStudio: [],
  drinkStudio: [],
  models: [],
  accessories: [],
  inspiration: [],
}

const CONTROL_CLASS = "mt-1.5 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-400/60 focus:bg-black/50"
const TEXTAREA_CLASS = "w-full rounded-2xl border border-white/10 bg-black/35 px-3.5 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/60 focus:bg-black/50"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeCategory(category: string | null | undefined) {
  return (category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function categoryMatches(assetCategory: string, allowedCategories: string[]) {
  const normalized = normalizeCategory(assetCategory)
  return allowedCategories.some(category => normalizeCategory(category) === normalized)
}

function metadataValue(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return ""
  const value = metadata[key]
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.filter(item => typeof item === "string").join(", ")
  return ""
}

function cleanLine(value: string, max = 120) {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function safeMetadataSearchText(metadata: unknown) {
  if (!metadata) return ""
  try {
    return JSON.stringify(metadata)
  } catch {
    return ""
  }
}

function countNestedReferences(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + (isRecord(item) && (typeof item.previewUrl === "string" || typeof item.publicUrl === "string") ? 1 : countNestedReferences(item)), 0)
  }
  if (!isRecord(value)) return 0
  if (Array.isArray(value.references)) return value.references.filter(item => isRecord(item) && (typeof item.previewUrl === "string" || typeof item.publicUrl === "string")).length
  return Object.values(value).reduce<number>((sum, item) => sum + countNestedReferences(item), 0)
}

function collectReferenceLabels(value: unknown, limit = 3): string[] {
  const labels: string[] = []
  const visit = (item: unknown) => {
    if (labels.length >= limit) return
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    if (!isRecord(item)) return
    if (typeof item.label === "string" || typeof item.object_name === "string" || typeof item.brand === "string") {
      const label = cleanLine([
        typeof item.label === "string" ? item.label : "",
        typeof item.object_name === "string" ? item.object_name : "",
        typeof item.brand === "string" ? item.brand : "",
        typeof item.model === "string" ? item.model : "",
      ].filter(Boolean).join(" "), 60)
      if (label) labels.push(label)
    }
    Object.values(item).forEach(visit)
  }
  visit(value)
  return Array.from(new Set(labels)).slice(0, limit)
}

function assetCategoryLabel(asset: AssetUpload) {
  if (asset.asset_category === "food_studio_shots") return "Food Studio Shot"
  if (asset.asset_category === "drink_studio_shots") return "Drink Studio Shot"
  if (asset.asset_category === "pinterest_inspiration") return "Client Brain Inspiration"
  return asset.asset_category.replace(/_/g, " ")
}

function assetDisplayName(asset: AssetUpload) {
  return metadataValue(asset.metadata, "dish_name")
    || metadataValue(asset.metadata, "drink_name")
    || metadataValue(asset.metadata, "name")
    || metadataValue(asset.metadata, "title")
    || asset.file_name.replace(/\.[a-z0-9]+$/i, "")
}

function assetSubtitle(asset: AssetUpload) {
  return cleanLine([
    metadataValue(asset.metadata, "zone"),
    metadataValue(asset.metadata, "description"),
    metadataValue(asset.metadata, "texture_notes"),
    asset.extracted_summary ?? "",
  ].filter(Boolean).join(" · "), 140) || assetCategoryLabel(asset)
}

function modelFromRow(row: GuestModelRow): ModelItem | null {
  const refs = isRecord(row.model_references) && Array.isArray(row.model_references.references)
    ? row.model_references.references.filter(isRecord)
    : []
  const selected = refs.find(ref => ref.key === "front_face" && typeof ref.previewUrl === "string")
    ?? refs.find(ref => typeof ref.previewUrl === "string" || typeof ref.publicUrl === "string")
  const previewUrl = typeof selected?.previewUrl === "string"
    ? selected.previewUrl
    : typeof selected?.publicUrl === "string"
      ? selected.publicUrl
      : ""
  if (!previewUrl) return null
  const outfitCount = countNestedReferences(row.outfit_sets)
  const accessoryCount = countNestedReferences(row.accessories)
  const outfitLabels = collectReferenceLabels(row.outfit_sets, 2)
  const accessoryLabels = collectReferenceLabels(row.accessories, 2)
  const continuityParts = [
    cleanLine([row.profession, row.ethnicity].filter(Boolean).join(" · ")),
    outfitLabels.length > 0 ? `Outfits: ${outfitLabels.join(", ")}` : outfitCount > 0 ? `${outfitCount} outfit anchors` : "",
    accessoryLabels.length > 0 ? `Accessories: ${accessoryLabels.join(", ")}` : accessoryCount > 0 ? `${accessoryCount} accessory anchors` : "",
  ].filter(Boolean)
  return {
    id: row.id,
    label: row.name || "Untitled model",
    subtitle: continuityParts.join(" · ") || row.status || "Model profile with optional wardrobe/accessory anchors",
    previewUrl,
  }
}

function accessoriesFromRow(row: GuestModelRow): AccessoryItem[] {
  const references = isRecord(row.accessories) && Array.isArray(row.accessories.references)
    ? row.accessories.references.filter(isRecord)
    : []
  const owner = row.name || "Model"
  return references.flatMap((ref, index) => {
    const previewUrl = typeof ref.previewUrl === "string"
      ? ref.previewUrl
      : typeof ref.publicUrl === "string"
        ? ref.publicUrl
        : ""
    if (!previewUrl) return []
    const label = typeof ref.label === "string"
      ? ref.label
      : typeof ref.object_name === "string"
        ? ref.object_name
        : `Accessory ${index + 1}`
    const details = [
      owner,
      typeof ref.accessory_type === "string" ? ref.accessory_type : "",
      typeof ref.brand === "string" ? ref.brand : "",
      typeof ref.model === "string" ? ref.model : "",
    ].filter(Boolean).join(" · ")
    return [{
      id: typeof ref.id === "string" ? ref.id : `${row.id}-accessory-${index}`,
      label,
      subtitle: cleanLine(details) || "Accessory reference",
      previewUrl,
    }]
  })
}

function assetsToItems(assets: AssetUpload[], signedUrls: Record<string, string>): PickerItem[] {
  return assets.map(asset => ({
    id: asset.id,
    label: assetDisplayName(asset),
    subtitle: assetSubtitle(asset),
    url: signedUrls[asset.id],
    badge: assetCategoryLabel(asset),
    category: asset.asset_category,
    file_name: asset.file_name,
    asset_category: asset.asset_category,
    extracted_summary: asset.extracted_summary,
    metadata: asset.metadata,
  }))
}

function emptyPickerItems(): Record<PickerKey, PickerItem[]> {
  return {
    venue: [],
    foodStudio: [],
    drinkStudio: [],
    models: [],
    accessories: [],
    inspiration: [],
  }
}

function itemSearchText(item: PickerItem) {
  return `${item.label} ${item.subtitle} ${item.badge}`.toLowerCase()
}

function pickAutoItems(items: PickerItem[], terms: string[], count = 1) {
  if (items.length === 0) return []
  const normalizedTerms = terms.map(term => term.toLowerCase())
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      score: normalizedTerms.reduce((score, term) => score + (itemSearchText(item).includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.slice(0, count).map(entry => entry.item)
}

function pickerKeyLabel(key: PickerKey) {
  if (key === "venue") return "Venue / Location"
  if (key === "foodStudio") return "Food Studio Shots"
  if (key === "drinkStudio") return "Drink Studio Shots"
  if (key === "models") return "Models"
  if (key === "accessories") return "Accessories"
  return "Pinterest Inspiration"
}

function autoSelectionsForGoal(goal: string, pickerItems: Record<PickerKey, PickerItem[]>): Record<PickerKey, PickerItem[]> {
  const normalized = goal.toLowerCase()
  const auto = emptyPickerItems()
  const venueCount = normalized.includes("brand") || normalized.includes("venue") ? 2 : 1

  if (normalized.includes("business lunch")) {
    auto.venue = pickAutoItems(pickerItems.venue, ["interior", "dining", "lunch", "difc", "table"], 1)
    auto.foodStudio = pickAutoItems(pickerItems.foodStudio, ["business", "lunch", "risotto", "salmon", "duck", "burger", "steak"], 2)
    auto.drinkStudio = pickAutoItems(pickerItems.drinkStudio, ["juice", "coffee", "tea", "water", "mocktail", "lunch"], 1)
    auto.models = pickAutoItems(pickerItems.models, ["business", "polished", "model"], 2)
  } else if (normalized.includes("traffic")) {
    auto.venue = pickAutoItems(pickerItems.venue, ["bar", "interior", "high table", "cocktail", "traffic"], 1)
    auto.foodStudio = pickAutoItems(pickerItems.foodStudio, ["three bites", "bites", "traffic", "bar snack"], 1)
    auto.drinkStudio = pickAutoItems(pickerItems.drinkStudio, ["cocktail", "martini", "music", "traffic", "drink"], 2)
    auto.models = pickAutoItems(pickerItems.models, ["social", "model"], 2)
  } else if (normalized.includes("dinner") || normalized.includes("date night")) {
    auto.venue = pickAutoItems(pickerItems.venue, ["interior", "dinner", "evening", "terrace", "table"], 1)
    auto.foodStudio = pickAutoItems(pickerItems.foodStudio, ["dinner", "seabass", "steak", "duck", "oyster", "dessert"], 2)
    auto.drinkStudio = pickAutoItems(pickerItems.drinkStudio, ["cocktail", "martini", "wine", "dinner"], 1)
    auto.models = pickAutoItems(pickerItems.models, ["date", "evening", "model"], 2)
  } else if (normalized.includes("making of")) {
    auto.venue = pickAutoItems(pickerItems.venue, ["kitchen", "bar", "interior", "table", "counter"], 1)
    auto.foodStudio = pickAutoItems(pickerItems.foodStudio, ["seabass", "risotto", "burger", "pave", "bread", "dish"], 1)
    if (auto.foodStudio.length === 0) auto.drinkStudio = pickAutoItems(pickerItems.drinkStudio, ["cocktail", "martini", "drink"], 1)
  } else if (normalized.includes("drink")) {
    auto.venue = pickAutoItems(pickerItems.venue, ["bar", "interior", "table", "counter"], 1)
    auto.drinkStudio = pickAutoItems(pickerItems.drinkStudio, ["cocktail", "martini", "drink", "juice"], 1)
  } else if (normalized.includes("food") || normalized.includes("chef")) {
    auto.venue = pickAutoItems(pickerItems.venue, ["kitchen", "interior", "table", "counter"], 1)
    auto.foodStudio = pickAutoItems(pickerItems.foodStudio, ["dish", "food", "seabass", "risotto", "burger", "duck"], 1)
  } else {
    auto.venue = pickAutoItems(pickerItems.venue, ["interior", "exterior", "venue", "table"], venueCount)
    auto.foodStudio = pickAutoItems(pickerItems.foodStudio, ["dish", "food", "hero"], 1)
    auto.drinkStudio = pickAutoItems(pickerItems.drinkStudio, ["drink", "cocktail", "martini"], 1)
  }

  if (auto.inspiration.length === 0 && normalized.includes("brand")) {
    auto.inspiration = pickAutoItems(pickerItems.inspiration, ["cinematic", "shadow", "editorial", "mood"], 1)
  }

  return auto
}

function planningSelectionsFrom(selected: Record<PickerKey, PickerItem[]>, auto: Record<PickerKey, PickerItem[]>): Record<PickerKey, PickerItem[]> {
  const planning = emptyPickerItems()
  ;(Object.keys(planning) as PickerKey[]).forEach(key => {
    planning[key] = selected[key].length > 0 ? selected[key] : auto[key]
  })
  return planning
}

function summarizeAutoSelections(selected: Record<PickerKey, PickerItem[]>, auto: Record<PickerKey, PickerItem[]>) {
  return (Object.keys(auto) as PickerKey[])
    .filter(key => selected[key].length === 0 && auto[key].length > 0)
    .map(key => `${pickerKeyLabel(key)}: ${auto[key].map(item => item.label).join(", ")}`)
}

function buildVideoPlanningPrompt(input: {
  goal: string
  format: string
  duration: string
  selected: Record<PickerKey, PickerItem[]>
  planning: Record<PickerKey, PickerItem[]>
  autoSelectionSummary: string[]
  directorNotes: string
  clientName: string
}) {
  const lineFor = (key: PickerKey, label: string) => {
    const items = input.planning[key]
    const source = input.selected[key].length > 0 ? "selected" : items.length > 0 ? "auto" : "none"
    const itemText = items.map(item => item.subtitle && item.subtitle !== item.badge
      ? `${item.label} (${cleanLine(item.subtitle, 90)})`
      : item.label).join(", ")
    return `${label}: ${itemText || "not selected"} (${source})`
  }
  const makingOfRules = input.goal === "Making Of"
    ? [
        "- Making Of food: prep/raw ingredients -> cooking/heat -> sauce/garnish -> plating -> final hero.",
        "- Making Of drink: ingredients/glass -> shake/stir/pour -> ice/garnish -> serve -> final hero.",
        "- One continuous process story, not random beauty shots.",
      ]
    : []
  const truthLines = [
    lineFor("venue", "Venue / Location"),
    lineFor("foodStudio", "Food Studio Shots"),
    lineFor("drinkStudio", "Drink Studio Shots"),
    lineFor("models", "Models"),
    lineFor("accessories", "Accessories"),
  ]
  const venueSpatialPrompt = buildVenueSpatialPrompt(resolveVenueSpatialMetadataList(input.planning.venue))
  return [
    "[VIDEO_OBJECTIVE]",
    `- Client: ${input.clientName}`,
    `- Objective/template: ${input.goal}`,
    `- Format: ${input.format}`,
    `- Duration target: ${input.duration}`,
    `- Shot count: ${SHOT_COUNT}`,
    "",
    "[SELECTED_OR_AUTO_ASSETS]",
    ...truthLines.map(line => `- ${line}`),
    `- Auto-selection: ${input.autoSelectionSummary.join(" | ") || "manual anchors or no matching Client Brain assets"}`,
    "",
    "[CLIENT_BRAIN_CONTEXT]",
    "- If a section has no manual anchors, use the auto-selected Client Brain assets listed above.",
    "- Food/drinks in videography use Studio Shot truth refs only, not raw upload references.",
    "- Keep DemoClientD Dubai visual DNA and selected truth assets consistent across all shots.",
    venueSpatialPrompt,
    "",
    "[CINEMATIC_INSPIRATION]",
    `- Inspiration refs: ${input.planning.inspiration.map(item => item.label).join(", ") || "not selected"}`,
    "- Pinterest/moodboard refs are inspiration only: camera style, pacing, mood, lighting, color, composition, transitions.",
    "- Never treat Pinterest/moodboard refs as venue, food, drink, model, or accessory truth.",
    "",
    "[DIRECTOR_NOTES]",
    `- ${input.directorNotes.trim() || "No extra notes. Build a premium, realistic hospitality reel."}`,
    "",
    "[STORY_TEMPLATE]",
    `- Template: ${input.goal}`,
    ...makingOfRules,
    ...(makingOfRules.length === 0 ? ["- Build a coherent hospitality sequence with ordered visual escalation."] : []),
    "",
    "[SHOT_RULES]",
    "- Hierarchy: TRUTH_ASSETS > OBJECTIVE > DIRECTOR_NOTES > PINTEREST/CINEMATIC_INSPIRATION > STYLE.",
    "- Produce exactly 5 connected shots.",
    "- Each shot needs start/end frame ideas for future Kling animation.",
    "- If no assets were manually selected, state what Jarvis auto-selected from Client Brain.",
    "- Keep camera moves physically plausible for hospitality reels.",
    "- Do not invent random menu items if metadata provides known assets.",
    "",
    "[OUTPUT_FORMAT]",
    "- Video Purpose",
    "- Storyline Summary",
    "- 5 ordered shot cards with title, visual description, truth assets, camera, movement, lighting, start frame, end frame, transition, Kling notes.",
  ].join("\n")
}

function pickLabels(items: PickerItem[], fallback: string) {
  return items.map(item => item.label).slice(0, 3).join(", ") || fallback
}

function clonePlanning(planning: Record<PickerKey, PickerItem[]>): Record<PickerKey, PickerItem[]> {
  const cloned = emptyPickerItems()
  ;(Object.keys(cloned) as PickerKey[]).forEach(key => {
    cloned[key] = [...planning[key]]
  })
  return cloned
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function shotRelevantItems(shot: StoryboardShot, planning: Record<PickerKey, PickerItem[]>) {
  const shotLabels = new Set(shot.truthAssets.map(normalizeLabel))
  const labelMatches = (item: PickerItem) => shotLabels.has(normalizeLabel(item.label))
  const relevant = emptyPickerItems()
  ;(Object.keys(relevant) as PickerKey[]).forEach(key => {
    relevant[key] = planning[key].filter(labelMatches)
  })

  const shotText = `${shot.title} ${shot.description} ${shot.cameraAngle} ${shot.lightingMood}`.toLowerCase()
  if (relevant.venue.length === 0 && (shotText.includes("venue") || shotText.includes("environment") || shot.shot === 1 || shot.shot === 5)) {
    relevant.venue = planning.venue.slice(0, 1)
  }
  if (relevant.foodStudio.length === 0 && (shotText.includes("food") || shotText.includes("dish") || shotText.includes("plate") || shotText.includes("plating") || shotText.includes("cooking"))) {
    relevant.foodStudio = planning.foodStudio.slice(0, 1)
  }
  if (relevant.drinkStudio.length === 0 && (shotText.includes("drink") || shotText.includes("glass") || shotText.includes("bar") || shotText.includes("cocktail") || shotText.includes("pour"))) {
    relevant.drinkStudio = planning.drinkStudio.slice(0, 1)
  }
  if (relevant.models.length === 0 && (shotText.includes("guest") || shotText.includes("model") || shotText.includes("service") || shotText.includes("hand"))) {
    relevant.models = planning.models.slice(0, 2)
  }
  if (relevant.inspiration.length === 0 && (shot.shot === 4 || shot.shot === 5)) {
    relevant.inspiration = planning.inspiration.slice(0, 1)
  }

  return relevant
}

function framePromptForShot(input: {
  clientName: string
  format: string
  quality: VideoFrameQuality
  compositionFidelity: CompositionFidelityMode
  storyboard: StoryboardResult
  shot: StoryboardShot
  relevant: Record<PickerKey, PickerItem[]>
}) {
  const truthAssetLines = [
    input.relevant.venue.length > 0 ? `- Venue / Location: ${input.relevant.venue.map(item => item.label).join(", ")}` : "",
    input.relevant.foodStudio.length > 0 ? `- Food Studio Shots: ${input.relevant.foodStudio.map(item => item.label).join(", ")}` : "",
    input.relevant.drinkStudio.length > 0 ? `- Drink Studio Shots: ${input.relevant.drinkStudio.map(item => item.label).join(", ")}` : "",
    input.relevant.models.length > 0 ? `- Models: ${input.relevant.models.map(item => item.label).join(", ")}` : "",
    input.relevant.accessories.length > 0 ? `- Accessories: ${input.relevant.accessories.map(item => item.label).join(", ")}` : "",
  ].filter(Boolean)
  const inspirationLines = [
    input.relevant.inspiration.length > 0 ? `- Pinterest / Cinematic Inspiration: ${input.relevant.inspiration.map(item => item.label).join(", ")}` : "",
  ].filter(Boolean)
  const hasTruthEnvironment = input.relevant.venue.some(item => categoryMatches(item.category ?? "", ["interiors", "exteriors"]))
  const selectedCompositionFidelity = normalizeCompositionFidelityMode(input.compositionFidelity)
  const venueSpatialPrompt = buildVenueSpatialPrompt(resolveVenueSpatialMetadataList(input.relevant.venue))
  const lockedScenePlateBlock = buildLockedScenePlatePrompt({
    fidelity: selectedCompositionFidelity,
    hasTruthEnvironment,
    label: "selected venue/location frame reference",
  })
  const cameraRuleBlock = buildCameraRulePrompt({
    fidelity: selectedCompositionFidelity,
    hasTruthEnvironment,
  })
  const strictNegativeBlock = buildStrictNegativePrompt({
    hasTruthEnvironment,
    hasFoodTruth: input.relevant.foodStudio.length > 0,
  })

  return [
    "[VIDEO_FRAME]",
    `- client: ${input.clientName}`,
    `- storyboard shot number: ${input.shot.shot} of ${SHOT_COUNT}`,
    `- output quality: ${input.quality.toUpperCase()}`,
    `- format: ${input.format}`,
    "- purpose: keyframe for future Kling animation",
    "",
    "[CONTINUITY]",
    "- same campaign, same selected/auto truth assets, same DemoClientD visual DNA",
    "- preserve selected product, venue, and model truth where relevant",
    "- this frame must feel part of the same 5-shot sequence",
    lockedScenePlateBlock ? `\n${lockedScenePlateBlock}` : "",
    cameraRuleBlock ? `\n${cameraRuleBlock}` : "",
    buildProviderGuidancePrompt(hasTruthEnvironment) ? `\n${buildProviderGuidancePrompt(hasTruthEnvironment)}` : "",
    venueSpatialPrompt ? `\n${venueSpatialPrompt}` : "",
    "",
    "[SHOT]",
    `- title: ${input.shot.title}`,
    `- visual description: ${input.shot.description}`,
    `- camera angle: ${input.shot.cameraAngle}`,
    `- movement intention: ${input.shot.cameraMovement}`,
    `- lighting/mood: ${input.shot.lightingMood}`,
    `- start frame idea: ${input.shot.startFrame}`,
    `- end frame idea: ${input.shot.endFrame}`,
    `- transition logic: ${input.shot.transition}`,
    "",
    "[TRUTH_ASSETS]",
    ...(truthAssetLines.length > 0 ? truthAssetLines : ["- Use the storyboard truth assets already named in this shot; do not invent new hero assets."]),
    input.relevant.foodStudio.length > 0 ? "\n[FOOD_TRUTH]\nFood references are locked truth assets.\nPreserve dish identity, shape, ingredient structure, plating style, portion logic, and visual proportions.\nDo not invent different bread, garnish, plate shape, sauce, or dish structure.\nIf the bread reference is selected, reproduce the exact bread type and arrangement as closely as possible." : "",
    "",
    "[PINTEREST_INSPIRATION]",
    ...(inspirationLines.length > 0 ? inspirationLines : ["- none"]),
    "- Inspiration controls mood, light, camera, color, and composition only; it never overrides truth assets.",
    "",
    "[NEGATIVE]",
    strictNegativeBlock,
    "- no random assets",
    "- no invented menu items",
    "- no conflicting venue",
    "- no mismatched visual style between frames",
    "- no video motion blur; generate a clean still keyframe",
  ].join("\n")
}

function framePlanForStoryboard(storyboard: StoryboardResult | null, quality: VideoFrameQuality, format: string, clientName: string, compositionFidelity: CompositionFidelityMode): VideoFrameState[] {
  if (!storyboard) return []
  return storyboard.shots.map(shot => {
    const relevant = shotRelevantItems(shot, storyboard.planning)
    return {
      shot: shot.shot,
      title: shot.title,
      status: "pending",
      prompt: framePromptForShot({ clientName, format, quality, compositionFidelity, storyboard, shot, relevant }),
      relevantAssetLabels: (Object.keys(relevant) as PickerKey[]).flatMap(key => relevant[key].map(item => `${pickerKeyLabel(key)}: ${item.label}`)),
      quality,
    }
  })
}

function buildStoryboard(input: {
  goal: string
  format: string
  duration: string
  selected: Record<PickerKey, PickerItem[]>
  planning: Record<PickerKey, PickerItem[]>
  autoSelectionSummary: string[]
  directorNotes: string
  clientName: string
  prompt: string
}): StoryboardResult {
  const venue = pickLabels(input.planning.venue, `${input.clientName} venue truth`)
  const food = pickLabels(input.planning.foodStudio, "auto-selected hero dish")
  const drinks = pickLabels(input.planning.drinkStudio, "auto-selected drink ritual")
  const models = pickLabels(input.planning.models, "no model focus")
  const inspiration = pickLabels(input.planning.inspiration, "clean cinematic hospitality pacing")
  const autoNote = input.autoSelectionSummary.length > 0
    ? ` Jarvis auto-selected: ${input.autoSelectionSummary.join(" | ")}.`
    : ""
  const purpose = `${input.goal} ${input.format} reel plan for ${input.clientName}`
  const storyline = input.goal === "Making Of"
    ? `A ${input.duration} start-to-finish process storyboard that turns ${input.planning.foodStudio.length > 0 ? food : drinks} into a final hero reveal. Truth assets stay authoritative; inspiration guides pacing and light only.${autoNote}`
    : `A ${input.duration} storyboard that moves from environment truth into product detail, ritual, atmosphere, and a final hero memory. Truth assets stay authoritative; inspiration guides pacing and light only.${autoNote}`

  if (input.goal === "Making Of") {
    const drinkLed = input.planning.drinkStudio.length > 0 && input.planning.foodStudio.length === 0
    const hero = drinkLed ? drinks : food
    const heroAssets = drinkLed ? input.planning.drinkStudio : input.planning.foodStudio
    const shots: StoryboardShot[] = drinkLed ? [
      {
        shot: 1,
        title: "Ingredients and Bar Setup",
        description: `Open on the glass, liquid ingredients, garnish, tools, and bar surface that will become ${hero}.`,
        truthAssets: [...heroAssets, ...input.planning.venue].map(item => item.label),
        cameraAngle: "Controlled bar-level detail angle",
        cameraMovement: "Slow slide across ingredients into the glass",
        lightingMood: "Warm DemoClientD bar glow with clean specular highlights",
        startFrame: "Ingredients and empty glass arranged with clear product truth",
        endFrame: "Camera settles on the vessel ready for the ritual",
        transition: "Cut on hand/tool movement into the pour or shake",
        klingNotes: "Keep glass shape and garnish identity locked for later keyframes.",
      },
      {
        shot: 2,
        title: "Shake, Stir, or Pour Ritual",
        description: `Show the key making action for ${hero}: liquid movement, bartender ritual, and controlled motion.`,
        truthAssets: heroAssets.map(item => item.label),
        cameraAngle: "Tight action angle with vessel readable",
        cameraMovement: "Small push-in timed to the pour/shake/stir",
        lightingMood: "Premium reflections, no chaotic bar clutter",
        startFrame: "Action begins with tool or bottle entering frame",
        endFrame: "Drink components visibly combine",
        transition: "Liquid motion match cut to garnish detail",
        klingNotes: "Motion should be realistic and physically plausible; no invented effects.",
      },
      {
        shot: 3,
        title: "Ice and Garnish Detail",
        description: `Focus on garnish, ice, foam/clarity, and final detail accuracy for ${hero}.`,
        truthAssets: heroAssets.map(item => item.label),
        cameraAngle: "Macro detail angle",
        cameraMovement: "Gentle rack-free push; keep object detail sharp",
        lightingMood: "Crisp highlights and luxury contrast",
        startFrame: "Garnish or ice detail approaches the glass",
        endFrame: "Finished top detail is clean and readable",
        transition: "Cut on garnish placement into service",
        klingNotes: "Do not add smoke, dry ice, or random garnish unless in truth ref.",
      },
      {
        shot: 4,
        title: "Serve and Place",
        description: `Place ${hero} into the real ${venue} context without changing the drink identity.`,
        truthAssets: [...heroAssets, ...input.planning.venue].map(item => item.label),
        cameraAngle: "Medium bar/table placement angle",
        cameraMovement: "Slow handoff or settle-in move",
        lightingMood: "Warm hospitality ambience grounded in venue truth",
        startFrame: "Drink carried or placed toward final surface",
        endFrame: "Drink lands in a clean branded context",
        transition: "Light reflection transition into final hero",
        klingNotes: "Keep surface and venue continuity stable for Kling motion.",
      },
      {
        shot: 5,
        title: "Final Cocktail Hero Reveal",
        description: `End on ${hero} as the polished final beverage hero with DemoClientD atmosphere around it.`,
        truthAssets: [...heroAssets, ...input.planning.venue, ...input.planning.inspiration].map(item => item.label),
        cameraAngle: "Hero product angle",
        cameraMovement: "Final slow settle or locked-off end frame",
        lightingMood: "Premium final contrast with clean drink priority",
        startFrame: "Drink enters final hero composition",
        endFrame: "Hold on usable end frame for edit/export",
        transition: "End hold",
        klingNotes: "Final frame should be a clean still/keyframe; no motion artifacts.",
      },
    ] : [
      {
        shot: 1,
        title: "Ingredient and Raw Prep",
        description: `Introduce the ingredients, prep surface, and early construction of ${hero}.`,
        truthAssets: [...heroAssets, ...input.planning.venue].map(item => item.label),
        cameraAngle: "Prep-counter detail angle",
        cameraMovement: "Slow slide from raw detail toward chef action",
        lightingMood: "Clean premium kitchen or table-prep lighting",
        startFrame: "Raw/prep components arranged clearly",
        endFrame: "Chef/prep action begins the transformation",
        transition: "Cut on action into heat or cooking",
        klingNotes: "Use truth ref for final identity, but show plausible process setup.",
      },
      {
        shot: 2,
        title: "Cooking and Transformation",
        description: `Show heat, grill, pan, sauce, or active transformation that plausibly creates ${hero}.`,
        truthAssets: heroAssets.map(item => item.label),
        cameraAngle: "Action detail angle",
        cameraMovement: "Small push-in or side tracking move",
        lightingMood: "Warm heat, controlled highlights, realistic culinary motion",
        startFrame: "Food begins cooking or transforming",
        endFrame: "Texture/color develops toward final dish",
        transition: "Steam/light cut into finishing detail",
        klingNotes: "Keep motion culinary-realistic; avoid random props or unrelated dishes.",
      },
      {
        shot: 3,
        title: "Sauce, Garnish, and Finish",
        description: `Focus on sauce, garnish, texture, and finishing detail that belongs to ${hero}.`,
        truthAssets: heroAssets.map(item => item.label),
        cameraAngle: "Macro or tight finishing angle",
        cameraMovement: "Gentle push-in with stable detail",
        lightingMood: "High-detail food focus with appetizing texture",
        startFrame: "Finishing element approaches the dish",
        endFrame: "Dish detail becomes closer to the final reference",
        transition: "Cut on garnish/sauce motion into plating",
        klingNotes: "Preserve sauce/garnish identity from Studio Shot metadata.",
      },
      {
        shot: 4,
        title: "Plating and Assembly",
        description: `Assemble ${hero} on its serving vessel with the final geometry and plating logic intact.`,
        truthAssets: heroAssets.map(item => item.label),
        cameraAngle: "45-degree plating angle",
        cameraMovement: "Slow controlled overhead-to-hero settle",
        lightingMood: "Clean premium menu photography light",
        startFrame: "Serving vessel receives final components",
        endFrame: "Plate reaches final structure and count",
        transition: "Match cut into final hero reveal",
        klingNotes: "Do not change vessel, item count, garnish, or dish structure.",
      },
      {
        shot: 5,
        title: "Final Hero Dish Reveal",
        description: `End on ${hero} as the completed final hero at ${venue}.`,
        truthAssets: [...heroAssets, ...input.planning.venue, ...input.planning.inspiration].map(item => item.label),
        cameraAngle: "Hero food angle with full dish readability",
        cameraMovement: "Final slow settle or locked-off end frame",
        lightingMood: "Premium final contrast with sharp food priority",
        startFrame: "Dish enters final hero composition",
        endFrame: "Hold on clean usable keyframe",
        transition: "End hold",
        klingNotes: "Final frame should work as a still/keyframe for later animation.",
      },
    ]

    return { purpose, storyline, shots, prompt: input.prompt, autoSelectionSummary: input.autoSelectionSummary, planning: clonePlanning(input.planning) }
  }

  const shots: StoryboardShot[] = [
    {
      shot: 1,
      title: "Environment Reveal",
      description: `Open inside ${venue}. Establish the real room, surface, lighting behavior, and brand mood before showing products.`,
      truthAssets: input.planning.venue.map(item => item.label),
      cameraAngle: "Wide or medium-wide establishing angle",
      cameraMovement: "Slow push-in or controlled tilt reveal",
      lightingMood: "Warm premium ambience with realistic reflections",
      startFrame: "Static venue truth frame with readable architecture and surface context",
      endFrame: "Camera lands near the hero table or service area",
      transition: "Match cut into product detail",
      klingNotes: "Keep geometry stable; avoid impossible room changes during motion.",
    },
    {
      shot: 2,
      title: input.goal.includes("Drink") ? "Drink Ritual Detail" : "Product Detail Truth",
      description: `Introduce ${input.goal.includes("Drink") ? drinks : food} as the main object truth. Preserve plating, vessel, garnish, and scale.`,
      truthAssets: [...input.planning.foodStudio, ...input.planning.drinkStudio].map(item => item.label),
      cameraAngle: "Tight detail angle with full object readability",
      cameraMovement: "Small slider move or gentle push-in",
      lightingMood: "Directional editorial highlights without changing object identity",
      startFrame: "Clean product/keyframe composition",
      endFrame: "Closer texture or garnish emphasis",
      transition: "Whip-soft or light-reflection transition",
      klingNotes: "Animate micro movement only; keep food/drink structure locked.",
    },
    {
      shot: 3,
      title: "Service Moment",
      description: `Show the hospitality ritual around ${food} and ${drinks}${models !== "no model focus" ? ` with ${models}` : ""}.`,
      truthAssets: [...input.planning.models, ...input.planning.accessories, ...input.planning.foodStudio, ...input.planning.drinkStudio].map(item => item.label),
      cameraAngle: "Medium detail or hand-level angle",
      cameraMovement: "Slow parallax move across table surface",
      lightingMood: "Inviting, premium, and realistic",
      startFrame: "Product/service interaction begins",
      endFrame: "Interaction resolves into a clear product or guest reaction beat",
      transition: "Cut on action into atmosphere",
      klingNotes: "Use restrained motion; no new dishes or props appear mid-shot.",
    },
    {
      shot: 4,
      title: "Atmosphere and Pace Shift",
      description: `Use ${inspiration} for cinematic rhythm while staying grounded in ${venue}.`,
      truthAssets: [...input.planning.venue, ...input.planning.inspiration].map(item => item.label),
      cameraAngle: "Composed atmosphere angle",
      cameraMovement: "Slow orbit, tilt, or reflection move",
      lightingMood: "Cinematic mood guided by inspiration, never overriding venue truth",
      startFrame: "Venue material or reflection detail",
      endFrame: "Frame resolves back toward hero product area",
      transition: "Reflection or shadow transition to final hero",
      klingNotes: "Avoid fake spaces in reflections; keep continuity with selected venue.",
    },
    {
      shot: 5,
      title: "Hero End Frame",
      description: `End on the clearest memory: ${input.goal.includes("Drink") ? drinks : food}, grounded in ${venue}.`,
      truthAssets: [...input.planning.foodStudio, ...input.planning.drinkStudio, ...input.planning.venue].map(item => item.label),
      cameraAngle: "Hero product or table composition",
      cameraMovement: "Gentle settle-in or final locked-off frame",
      lightingMood: "Premium final contrast with clean subject priority",
      startFrame: "Hero subject enters final composition",
      endFrame: "Hold on a clean, usable end card frame",
      transition: "End hold for edit/export",
      klingNotes: "Final frame should be reusable as a still/keyframe with no motion artifacts.",
    },
  ]

  return { purpose, storyline, shots, prompt: input.prompt, autoSelectionSummary: input.autoSelectionSummary, planning: clonePlanning(input.planning) }
}

export default function AIVideographyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [assets, setAssets] = useState<AssetUpload[]>([])
  const [models, setModels] = useState<ModelItem[]>([])
  const [accessories, setAccessories] = useState<AccessoryItem[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [activeWorkspace, setActiveWorkspace] = useState<VideoWorkspace>("story")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [goal, setGoal] = useState("Brand Atmosphere")
  const [format, setFormat] = useState("9:16")
  const [duration, setDuration] = useState("15s")
  const [frameQuality, setFrameQuality] = useState<VideoFrameQuality>("2k")
  const [compositionFidelity, setCompositionFidelity] = useState<CompositionFidelityMode>(DEFAULT_COMPOSITION_FIDELITY)
  const [directorNotes, setDirectorNotes] = useState("")
  const [selectedIds, setSelectedIds] = useState<Record<PickerKey, string[]>>(EMPTY_SELECTIONS)
  const [manualPinterestRefs, setManualPinterestRefs] = useState<PinterestInspirationRef[]>([])
  const [zernioPinterest, setZernioPinterest] = useState<PinterestMoodboardsApi | null>(null)
  const [zernioPinterestLoading, setZernioPinterestLoading] = useState(false)
  const [directPinterestPins, setDirectPinterestPins] = useState<PinterestPinImageRef[]>([])
  const [directPinterestStatus, setDirectPinterestStatus] = useState<PinterestDirectPinsApi | null>(null)
  const [directPinterestLoading, setDirectPinterestLoading] = useState(false)
  const [pinterestDraft, setPinterestDraft] = useState({
    boardName: "",
    pinTitle: "",
    imageUrl: "",
    sourceUrl: "",
    notes: "",
    tags: "",
    usage: "videography" as PinterestInspirationUsage,
    inspirationRole: "camera" as PinterestInspirationRole,
  })
  const [pinterestUsageFilter, setPinterestUsageFilter] = useState<PinterestInspirationUsage | "all">("all")
  const [pinterestRoleFilter, setPinterestRoleFilter] = useState<PinterestInspirationRole | "all">("all")
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null)
  const [storyboard, setStoryboard] = useState<StoryboardResult | null>(null)
  const [videoFrames, setVideoFrames] = useState<VideoFrameState[]>([])
  const [framePreview, setFramePreview] = useState<VideoFrameState | null>(null)
  const [frameGenerationRunning, setFrameGenerationRunning] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [clientRes, assetRes, guestModelsResponse] = await Promise.all([
      supabase.from("clients").select("id, name, industry, status").eq("id", id).single(),
      supabase
        .from("asset_uploads")
        .select("id, file_name, asset_category, file_path, optimized_file_path, ai_preview_path, extracted_summary, metadata")
        .eq("client_id", id)
        .neq("status", "archived")
        .order("uploaded_at", { ascending: false }),
      fetch(`/api/clients/${id}/guest-models`, { cache: "no-store" }).then(async response => ({ response, payload: await response.json() as { models?: GuestModelRow[]; error?: string } })),
    ])

    if (clientRes.error) setError(clientRes.error.message)
    else setClient(clientRes.data as Client)

    setAssets((assetRes.data ?? []) as AssetUpload[])
    if (!guestModelsResponse.response.ok) setError(guestModelsResponse.payload.error ?? "Unable to load guest models.")
    const guestRows = guestModelsResponse.payload.models ?? []
    setModels(guestRows.map(modelFromRow).filter((model): model is ModelItem => Boolean(model)))
    setAccessories(guestRows.flatMap(accessoriesFromRow))
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setZernioPinterestLoading(true)
      try {
        const response = await fetch("/api/pinterest/moodboards", { cache: "no-store" })
        const payload = await response.json() as PinterestMoodboardsApi
        if (!cancelled) setZernioPinterest(payload)
      } catch {
        if (!cancelled) setZernioPinterest({ boards: [], moodboards: [], summary: {}, error: "Unable to load Pinterest moodboards from Zernio." })
      } finally {
        if (!cancelled) setZernioPinterestLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const boards = (zernioPinterest?.boards ?? []).filter(board => board.name.toLowerCase().startsWith("democlientd"))
    if (boards.length === 0) return
    let cancelled = false
    ;(async () => {
      setDirectPinterestLoading(true)
      try {
        const responses = await Promise.all(boards.map(async board => {
          const response = await fetch(`/api/pinterest/direct/pins?boardId=${encodeURIComponent(board.id)}&boardName=${encodeURIComponent(board.name)}`, { cache: "no-store" })
          return response.json() as Promise<PinterestDirectPinsApi>
        }))
        if (cancelled) return
        setDirectPinterestStatus(responses.find(response => response.connectionState !== "no_data") ?? responses[0] ?? null)
        setDirectPinterestPins(responses.flatMap(response => response.data ?? []))
      } catch {
        if (!cancelled) setDirectPinterestStatus({ data: [], summary: {}, connectionState: "pinterest_error", error: "Unable to load Pinterest pin images." })
      } finally {
        if (!cancelled) setDirectPinterestLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [zernioPinterest?.boards])

  useEffect(() => {
    const missing = assets
      .filter(asset => !signedUrls[asset.id])
      .map(asset => ({ id: asset.id, path: asset.ai_preview_path || asset.optimized_file_path || asset.file_path }))
      .filter((item): item is { id: string; path: string } => Boolean(item.path))
    if (missing.length === 0) return
    ;(async () => {
      const res = await fetch("/api/brain/signed-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: missing }),
      })
      if (!res.ok) return
      const { urls } = await res.json() as { urls: Record<string, string> }
      setSignedUrls(prev => ({ ...prev, ...urls }))
    })()
  }, [assets, signedUrls])

  const assetBuckets = useMemo(() => {
    const venue = assets.filter(asset => categoryMatches(asset.asset_category, ["interiors", "exteriors", "venue_items"]))
    const foodStudio = assets.filter(asset => categoryMatches(asset.asset_category, ["food_studio_shots"]))
    const drinkStudio = assets.filter(asset => categoryMatches(asset.asset_category, ["drink_studio_shots"]))
    const inspiration = assets.filter(asset => categoryMatches(asset.asset_category, ["pinterest_inspiration"]))
    return { venue, foodStudio, drinkStudio, inspiration }
  }, [assets])

  const filteredManualPinterestRefs = useMemo(() => {
    return manualPinterestRefs.filter(ref => {
      const matchesUsage = pinterestUsageFilter === "all" || ref.usage === pinterestUsageFilter || ref.usage === "both"
      const matchesRole = pinterestRoleFilter === "all" || ref.inspirationRole === pinterestRoleFilter
      return matchesUsage && matchesRole
    })
  }, [manualPinterestRefs, pinterestRoleFilter, pinterestUsageFilter])

  const zernioPinterestRefs = useMemo<PinterestInspirationRef[]>(() => {
    const moodboardRefs = (zernioPinterest?.moodboards ?? []).map(board => ({
      id: `zernio-moodboard-${board.id}`,
      boardName: board.name,
      pinTitle: `${board.boardIds.length} Pinterest boards`,
      imageUrl: board.coverImageUrl,
      notes: "Use this connected Pinterest moodboard for cinematic mood, lighting, camera language, color, pacing, and styling only.",
      tags: board.tags ?? ["zernio", "inspiration_only"],
      usage: board.usage ?? "both",
      inspirationRole: "camera" as PinterestInspirationRole,
      createdAt: new Date().toISOString(),
      source: "zernio" as const,
      inspirationOnly: true,
    }))
    const boardRefs = (zernioPinterest?.boards ?? []).map(board => ({
      id: `zernio-board-${board.id}`,
      boardName: board.name,
      pinTitle: board.description || "Pinterest board",
      imageUrl: board.coverImageUrl,
      sourceUrl: board.sourceUrl,
      notes: "Use this connected Pinterest board as cinematic inspiration only; never as truth asset.",
      tags: ["zernio", "pinterest_board", "inspiration_only"],
      usage: "both" as PinterestInspirationUsage,
      inspirationRole: "camera" as PinterestInspirationRole,
      createdAt: new Date().toISOString(),
      source: "zernio" as const,
      inspirationOnly: true,
    }))
    return [...moodboardRefs, ...boardRefs].filter(ref => {
      const matchesUsage = pinterestUsageFilter === "all" || ref.usage === pinterestUsageFilter || ref.usage === "both"
      const matchesRole = pinterestRoleFilter === "all" || ref.inspirationRole === pinterestRoleFilter
      return matchesUsage && matchesRole
    })
  }, [pinterestRoleFilter, pinterestUsageFilter, zernioPinterest])

  const directPinterestRefs = useMemo<PinterestInspirationRef[]>(() => {
    return directPinterestPins.map(pin => ({
      id: `direct-pin-${pin.id}`,
      boardName: pin.boardName || "Pinterest pin",
      pinTitle: pin.title || "Pinterest image",
      imageUrl: pin.imageUrl,
      sourceUrl: pin.sourceUrl,
      notes: "Use this Pinterest pin image for cinematic mood, lighting, camera, color, pacing, and styling only.",
      tags: ["pinterest_pin", "inspiration_only"],
      usage: pin.usage,
      inspirationRole: pin.role,
      createdAt: new Date().toISOString(),
      source: "zernio" as const,
      inspirationOnly: true,
    })).filter(ref => {
      const matchesUsage = pinterestUsageFilter === "all" || ref.usage === pinterestUsageFilter || ref.usage === "both"
      const matchesRole = pinterestRoleFilter === "all" || ref.inspirationRole === pinterestRoleFilter
      return matchesUsage && matchesRole
    })
  }, [directPinterestPins, pinterestRoleFilter, pinterestUsageFilter])

  const manualPinterestItems = useMemo<PickerItem[]>(() => {
    const manualItems = manualPinterestRefs
      .filter(ref => ref.usage === "videography" || ref.usage === "both")
      .map(ref => ({
        id: ref.id,
        label: ref.pinTitle || ref.boardName,
        subtitle: pinterestPromptLine(ref),
        url: ref.imageUrl,
        badge: "Pinterest Moodboard",
      }))
    const zernioItems = zernioPinterestRefs.map(ref => ({
      id: ref.id,
      label: ref.pinTitle || ref.boardName,
      subtitle: pinterestPromptLine(ref),
      url: ref.imageUrl,
      badge: "Zernio Pinterest",
    }))
    const directItems = directPinterestRefs.map(ref => ({
      id: ref.id,
      label: ref.pinTitle || ref.boardName,
      subtitle: pinterestPromptLine(ref),
      url: ref.imageUrl,
      badge: "Pinterest Pin",
    }))
    return [...directItems, ...zernioItems, ...manualItems]
  }, [directPinterestRefs, manualPinterestRefs, zernioPinterestRefs])

  const pickerItems: Record<PickerKey, PickerItem[]> = useMemo(() => ({
    venue: assetsToItems(assetBuckets.venue, signedUrls),
    foodStudio: assetsToItems(assetBuckets.foodStudio, signedUrls),
    drinkStudio: assetsToItems(assetBuckets.drinkStudio, signedUrls),
    inspiration: [...manualPinterestItems, ...assetsToItems(assetBuckets.inspiration, signedUrls)],
    models: models.map(model => ({ id: model.id, label: model.label, subtitle: model.subtitle, url: model.previewUrl, badge: "Model" })),
    accessories: accessories.map(accessory => ({ id: accessory.id, label: accessory.label, subtitle: accessory.subtitle, url: accessory.previewUrl, badge: "Accessory" })),
  }), [accessories, assetBuckets, manualPinterestItems, models, signedUrls])

  const selectedItems = useMemo(() => {
    return (Object.keys(selectedIds) as PickerKey[]).reduce((acc, key) => {
      const allowed = new Map(pickerItems[key].map(item => [item.id, item]))
      acc[key] = selectedIds[key].map(itemId => allowed.get(itemId)).filter((item): item is PickerItem => Boolean(item))
      return acc
    }, {} as Record<PickerKey, PickerItem[]>)
  }, [pickerItems, selectedIds])

  const selectedTotal = useMemo(() => Object.values(selectedIds).reduce((sum, values) => sum + values.length, 0), [selectedIds])
  const autoSelectedItems = useMemo(() => autoSelectionsForGoal(goal, pickerItems), [goal, pickerItems])
  const planningItems = useMemo(() => planningSelectionsFrom(selectedItems, autoSelectedItems), [autoSelectedItems, selectedItems])
  const hasPlanningTruthEnvironment = useMemo(() => {
    return planningItems.venue.some(item => categoryMatches(item.category ?? "", ["interiors", "exteriors"]))
  }, [planningItems])
  const compositionFidelityWarning = useMemo(() => {
    if (!hasPlanningTruthEnvironment) return ""
    if (compositionFidelity === "inspiration_only") return "Environment continuity risk detected. Real venue references are set to Inspiration Only, so the scene plate is not locked."
    if (compositionFidelity !== "strict_scene_match") return "Environment continuity risk detected. 100% Strict Scene Match is recommended for real venue continuity."
    return ""
  }, [compositionFidelity, hasPlanningTruthEnvironment])
  const autoSelectionSummary = useMemo(() => summarizeAutoSelections(selectedItems, autoSelectedItems), [autoSelectedItems, selectedItems])

  const planningPrompt = useMemo(() => buildVideoPlanningPrompt({
    goal,
    format,
    duration,
    selected: selectedItems,
    planning: planningItems,
    autoSelectionSummary,
    directorNotes,
    clientName: client?.name ?? "Client",
  }), [autoSelectionSummary, client?.name, directorNotes, duration, format, goal, planningItems, selectedItems])

  useEffect(() => {
    if (!storyboard) {
      setVideoFrames([])
      return
    }
    const plans = framePlanForStoryboard(storyboard, frameQuality, format, client?.name ?? "Client", compositionFidelity)
    setVideoFrames(prev => plans.map(plan => {
      const existing = prev.find(frame => frame.shot === plan.shot)
      if (existing && existing.status === "complete" && existing.quality === plan.quality) {
        return { ...existing, prompt: plan.prompt, relevantAssetLabels: plan.relevantAssetLabels }
      }
      return plan
    }))
  }, [client?.name, compositionFidelity, format, frameQuality, storyboard])

  function framePayloadForShot(shot: StoryboardShot, prompt: string) {
    const planning = storyboard?.planning ?? planningItems
    const relevant = shotRelevantItems(shot, planning)
    const assetUploadIds = [
      ...relevant.venue,
      ...relevant.foodStudio,
      ...relevant.drinkStudio,
      ...relevant.inspiration,
    ].map(item => item.id)
    return {
      client_id: id,
      prompt,
      aspect_ratio: format,
      quality: frameQuality,
      composition_fidelity: compositionFidelity,
      composition_fidelity_percent: compositionFidelityPercent(compositionFidelity),
      environment_mode: compositionFidelity === "inspiration_only" ? "inspiration_only" : compositionFidelity === "flexible_crop" ? "flexible" : "locked_truth",
      environment_confidence: compositionFidelityPercent(compositionFidelity),
      shot_number: shot.shot,
      shot_title: shot.title,
      asset_upload_ids: Array.from(new Set(assetUploadIds)),
      guest_model_ids: relevant.models.map(item => item.id),
    }
  }

  function updateFrameState(shotNumber: number, patch: Partial<VideoFrameState>) {
    setVideoFrames(prev => prev.map(frame => frame.shot === shotNumber ? { ...frame, ...patch } : frame))
  }

  async function generateFrame(shot: StoryboardShot) {
    if (!storyboard) return
    const relevant = shotRelevantItems(shot, storyboard.planning)
    const prompt = framePromptForShot({
      clientName: client?.name ?? "Client",
      format,
      quality: frameQuality,
      compositionFidelity,
      storyboard,
      shot,
      relevant,
    })
    updateFrameState(shot.shot, {
      status: "generating",
      error: "",
      prompt,
      quality: frameQuality,
      relevantAssetLabels: (Object.keys(relevant) as PickerKey[]).flatMap(key => relevant[key].map(item => `${pickerKeyLabel(key)}: ${item.label}`)),
    })
    const res = await fetch("/api/ai/video-frame-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(framePayloadForShot(shot, prompt)),
    })
    const data = await res.json().catch(() => ({})) as {
      success?: boolean
      generated_image_data?: string
      generated_image_mime_type?: string
      error?: string
      provider_latency_ms?: number
      latency_ms?: number
    }
    if (!res.ok || !data.success || !data.generated_image_data) {
      updateFrameState(shot.shot, {
        status: "failed",
        error: data.error || `Frame generation failed with status ${res.status}`,
      })
      return
    }
    updateFrameState(shot.shot, {
      status: "complete",
      generatedImageData: data.generated_image_data,
      generatedImageMimeType: data.generated_image_mime_type,
      providerLatencyMs: data.provider_latency_ms ?? data.latency_ms,
      error: "",
    })
  }

  async function generateAllFrames() {
    if (!storyboard || frameGenerationRunning) return
    const confirmed = window.confirm(`This will generate 5 storyboard frames at ${frameQuality.toUpperCase()}. Continue?`)
    if (!confirmed) return
    setFrameGenerationRunning(true)
    setMessage(`Generating 5 storyboard frames at ${frameQuality.toUpperCase()}...`)
    try {
      for (const shot of storyboard.shots) {
        await generateFrame(shot)
      }
      setMessage("Frame generation finished. Successful frames are kept in order; failed frames can be regenerated individually.")
    } finally {
      setFrameGenerationRunning(false)
    }
  }

  async function regenerateFrame(shotNumber: number) {
    if (!storyboard || frameGenerationRunning) return
    const shot = storyboard.shots.find(item => item.shot === shotNumber)
    if (!shot) return
    const confirmed = window.confirm(`Generate storyboard frame ${shotNumber} at ${frameQuality.toUpperCase()}?`)
    if (!confirmed) return
    setFrameGenerationRunning(true)
    try {
      await generateFrame(shot)
    } finally {
      setFrameGenerationRunning(false)
    }
  }

  function toggleSelection(key: PickerKey, itemId: string) {
    setSelectedIds(prev => {
      const current = prev[key]
      return {
        ...prev,
        [key]: current.includes(itemId) ? current.filter(idValue => idValue !== itemId) : [...current, itemId],
      }
    })
    setStoryboard(null)
    setVideoFrames([])
  }

  function addManualPinterestRef() {
    if (!pinterestDraft.boardName.trim() || !pinterestDraft.imageUrl.trim()) {
      setError("Board name and image URL are required for a Pinterest moodboard reference.")
      return
    }
    const ref: PinterestInspirationRef = {
      id: `video-pin-${Date.now()}`,
      boardName: pinterestDraft.boardName.trim(),
      pinTitle: pinterestDraft.pinTitle.trim() || undefined,
      imageUrl: pinterestDraft.imageUrl.trim(),
      sourceUrl: pinterestDraft.sourceUrl.trim() || undefined,
      notes: pinterestDraft.notes.trim() || undefined,
      tags: pinterestDraft.tags.split(",").map(tag => tag.trim()).filter(Boolean),
      usage: pinterestDraft.usage,
      inspirationRole: pinterestDraft.inspirationRole,
      createdAt: new Date().toISOString(),
    }
    setManualPinterestRefs(prev => [ref, ...prev])
    setPinterestDraft(prev => ({ ...prev, pinTitle: "", imageUrl: "", sourceUrl: "", notes: "", tags: "" }))
    setError("")
  }

  function generateStoryline() {
    const result = buildStoryboard({
      goal,
      format,
      duration,
      selected: selectedItems,
      planning: planningItems,
      autoSelectionSummary,
      directorNotes,
      clientName: client?.name ?? "Client",
      prompt: planningPrompt,
    })
    setStoryboard(result)
    setVideoFrames(framePlanForStoryboard(result, frameQuality, format, client?.name ?? "Client", compositionFidelity))
    setMessage("Storyline generated locally. No paid image or video generation was run.")
  }

  function selectionCard(config: { key: PickerKey; title: string; subtitle: string; accent: string }) {
    const selected = selectedItems[config.key]
    const previews = selected.length > 0 ? selected : pickerItems[config.key].slice(0, 6)
    const hasSelection = selected.length > 0
    return (
      <button
        key={config.key}
        type="button"
        onClick={() => setActivePicker(config.key)}
        className={`rounded-[1.5rem] border p-4 text-left transition hover:border-emerald-300/30 hover:bg-white/[0.055] ${hasSelection ? "border-emerald-300/35 bg-emerald-400/[0.055]" : "border-white/10 bg-black/25"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{config.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{config.subtitle}</p>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">{selected.length} selected</span>
        </div>
        <div className="mt-4 flex gap-2 overflow-hidden">
          {previews.map(item => (
            <div key={item.id} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-zinc-950 ${hasSelection ? "border-emerald-300/45" : "border-white/10 opacity-75"}`}>
              {item.url ? <img src={item.url} alt={item.label} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">Ref</div>}
              {hasSelection && <span className="absolute bottom-1 left-1 rounded-full bg-emerald-300 px-1.5 py-0.5 text-[8px] font-semibold text-black">Selected</span>}
            </div>
          ))}
          {previews.length === 0 && <div className="flex h-16 flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-600">Click to choose references</div>}
        </div>
      </button>
    )
  }

  const pickerConfig = activePicker
    ? [...PICKER_CONFIG, INSPIRATION_CONFIG].find(config => config.key === activePicker)
    : null

  if (loading) {
    return (
      <main className="flex min-h-screen bg-[#020403] text-white">
        <Sidebar />
        <section className="jarvis-dark-shell">
          <div className="jarvis-page text-sm text-white/50">Loading AI Videography...</div>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen bg-[#020403] text-white">
      <Sidebar />
      <section className="jarvis-dark-shell">
        <div className="jarvis-page">
          <header className="jarvis-hero">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Link href={`/clients/${id}`} className="text-xs font-semibold text-emerald-200/70 transition hover:text-emerald-100">← Back to client</Link>
                <p className="jarvis-eyebrow mt-4">AI Videography</p>
                <h1 className="jarvis-title mt-3">Creative Direction / Story Builder</h1>
                <p className="jarvis-copy mt-4 max-w-3xl">
                  Jarvis acts as the AI Creative Director: choose an objective, add optional anchors if useful, then generate a 5-shot storyline with future keyframe and Kling notes before spending on generation.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-black/30 p-2 text-center text-xs text-white/45">
                <div className="rounded-2xl bg-white/[0.05] px-4 py-3"><p className="text-lg font-semibold text-white">{selectedTotal}</p><p>refs</p></div>
                <div className="rounded-2xl bg-white/[0.05] px-4 py-3"><p className="text-lg font-semibold text-white">{format}</p><p>format</p></div>
                <div className="rounded-2xl bg-emerald-400/10 px-4 py-3"><p className="text-lg font-semibold text-emerald-200">{duration}</p><p>target</p></div>
              </div>
            </div>
          </header>

          {error && <p className="mt-5 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}

          <nav className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/35 p-2 backdrop-blur-2xl">
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["story", "Story Builder"],
                ["pinterest", "Pinterest / Moodboards"],
              ] as Array<[VideoWorkspace, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveWorkspace(key)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    activeWorkspace === key
                      ? "bg-emerald-300 text-black shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                      : "text-white/45 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>

          {activeWorkspace === "story" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <section className="jarvis-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Step 1</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Video Objective / Template</h2>
                <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
                  <label className="block">
                    <span className="text-xs font-semibold text-white/45">Goal</span>
                    <select value={goal} onChange={event => setGoal(event.target.value)} className={CONTROL_CLASS}>
                      {VIDEO_GOALS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-white/45">Format</span>
                    <select value={format} onChange={event => setFormat(event.target.value)} className={CONTROL_CLASS}>
                      {VIDEO_FORMATS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-white/45">Duration Target</span>
                    <select value={duration} onChange={event => setDuration(event.target.value)} className={CONTROL_CLASS}>
                      {DURATION_TARGETS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.04] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Composition Fidelity</p>
                      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/42">
                        Selected or auto-selected interiors/exteriors become locked photographic scene plates for every keyframe.
                      </p>
                    </div>
                    {hasPlanningTruthEnvironment && (
                      <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                        Scene Plate Locked
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
                    <label className="block">
                      <span className="text-xs font-semibold text-white/45">Composition Fidelity</span>
                      <select value={compositionFidelity} onChange={event => setCompositionFidelity(event.target.value as CompositionFidelityMode)} className={CONTROL_CLASS}>
                        {COMPOSITION_FIDELITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <span className="mt-2 block text-[11px] leading-relaxed text-white/35">
                        {COMPOSITION_FIDELITY_OPTIONS.find(option => option.value === compositionFidelity)?.helper}
                      </span>
                    </label>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-white/38">
                      <p className="font-semibold text-emerald-100">Frame QA</p>
                      <p className="mt-2">Venue scene plate selected: {hasPlanningTruthEnvironment ? "yes" : "no"}</p>
                      <p>Composition fidelity: {compositionFidelityLabel(compositionFidelity)}</p>
                      <p>Camera angle locked: {hasPlanningTruthEnvironment && compositionFidelity === "strict_scene_match" ? "yes" : "no"}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-white/35">
                    Current mode: {compositionFidelityLabel(compositionFidelity)} · keyframe prompts preserve venue structure before cinematic styling.
                  </p>
                  {compositionFidelityWarning && (
                    <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
                      {compositionFidelityWarning}
                    </p>
                  )}
                </div>
                <p className="mt-4 text-xs text-white/38">Shot count is fixed at 5 for this storyboard builder.</p>
              </section>

              <section className="jarvis-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Step 2</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Truth Assets</h2>
                <p className="mt-2 text-sm text-white/42">Optional anchors. Jarvis can auto-select based on objective and Client Brain metadata.</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {PICKER_CONFIG.map(selectionCard)}
                </div>
              </section>

              <section className="jarvis-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Step 3</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Cinematic Inspiration</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {selectionCard(INSPIRATION_CONFIG)}
                </div>
              </section>

              <section className="jarvis-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Step 4</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Director Notes</h2>
                <textarea
                  value={directorNotes}
                  onChange={event => setDirectorNotes(event.target.value)}
                  placeholder="Start with a wide chandelier reveal, then move into cocktail close-ups. Make this feel like a premium DIFC dinner reel. End on the hero dish."
                  rows={5}
                  className={`${TEXTAREA_CLASS} mt-4`}
                />
              </section>

              <section className="jarvis-panel">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Step 5</p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">Storyboard Generator</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">Generates local written direction only: purpose, storyline, and 5 ordered shots with keyframe ideas. Empty anchor groups use objective-based Client Brain auto-selection.</p>
                  </div>
                  <button type="button" onClick={generateStoryline} className="jarvis-button">
                    Generate Storyline
                  </button>
                </div>
                {message && <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</p>}
                <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Planning Prompt</summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-white/55">{planningPrompt}</pre>
                </details>
              </section>

              {storyboard && (
                <section className="jarvis-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Storyboard Output</p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">{storyboard.purpose}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-white/50">{storyboard.storyline}</p>
                  {storyboard.autoSelectionSummary.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-xs leading-relaxed text-emerald-100">
                      <span className="font-semibold">Auto-selected from Client Brain: </span>
                      {storyboard.autoSelectionSummary.join(" | ")}
                    </div>
                  )}
                  <div className="mt-5 space-y-4">
                    {storyboard.shots.map(shot => (
                      <article key={shot.shot} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Shot {shot.shot}</p>
                            <h3 className="mt-1 text-xl font-semibold text-white">{shot.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-white/55">{shot.description}</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" disabled className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/30">Frame generation below</button>
                            <button type="button" disabled className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/30">Animate with Kling soon</button>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <InfoBlock label="Truth assets" value={shot.truthAssets.join(", ") || "None selected"} />
                          <InfoBlock label="Camera" value={shot.cameraAngle} />
                          <InfoBlock label="Movement" value={shot.cameraMovement} />
                          <InfoBlock label="Lighting / Mood" value={shot.lightingMood} />
                          <InfoBlock label="Start frame" value={shot.startFrame} />
                          <InfoBlock label="End frame" value={shot.endFrame} />
                          <InfoBlock label="Transition" value={shot.transition} />
                          <InfoBlock label="Kling notes" value={shot.klingNotes} />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {storyboard && (
                <section className="jarvis-panel">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Storyboard Frames</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">Generate 5 Keyframes</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
                        2K test mode is recommended. Generating all frames creates 5 image generations; nothing runs until Calvin confirms.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="block min-w-36">
                        <span className="text-xs font-semibold text-white/45">Frame Quality</span>
                        <select
                          value={frameQuality}
                          onChange={event => setFrameQuality(event.target.value as VideoFrameQuality)}
                          className={CONTROL_CLASS}
                          disabled={frameGenerationRunning}
                        >
                          {VIDEO_FRAME_QUALITIES.map(option => <option key={option.value} value={option.value}>{option.label} · {option.helper}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={generateAllFrames}
                        disabled={frameGenerationRunning || videoFrames.length !== SHOT_COUNT}
                        className="jarvis-button disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {frameGenerationRunning ? "Generating Frames..." : "Generate All 5 Frames"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                    Cost safety: 2K is the default for testing. The all-frame action is paid and asks for confirmation first.
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {videoFrames.map(frame => (
                      <article key={frame.shot} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Frame {frame.shot}</p>
                            <h3 className="mt-1 text-lg font-semibold text-white">{frame.title}</h3>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            frame.status === "complete" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" :
                            frame.status === "failed" ? "border-red-300/25 bg-red-400/10 text-red-100" :
                            frame.status === "generating" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" :
                            "border-white/10 bg-white/[0.04] text-white/38"
                          }`}>
                            {frame.status}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => frame.generatedImageData ? setFramePreview(frame) : undefined}
                          className="mt-4 block aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-left"
                        >
                          {frame.generatedImageData ? (
                            <img src={frame.generatedImageData} alt={`Generated storyboard frame ${frame.shot}`} className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
                              <p className="text-sm font-semibold text-white/40">{frame.status === "generating" ? "Generating..." : "Frame preview pending"}</p>
                              <p className="text-xs leading-relaxed text-white/28">Prompt is ready. Click Generate All 5 Frames when ready to spend.</p>
                            </div>
                          )}
                        </button>

                        {frame.error && <p className="mt-3 rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-100">{frame.error}</p>}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => regenerateFrame(frame.shot)}
                            disabled={frameGenerationRunning}
                            className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-white/55 transition hover:border-emerald-300/30 hover:text-emerald-100 disabled:opacity-40"
                          >
                            Regenerate this frame
                          </button>
                          {frame.generatedImageData && (
                            <>
                              <button
                                type="button"
                                onClick={() => setFramePreview(frame)}
                                className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-white/55 transition hover:border-emerald-300/30 hover:text-emerald-100"
                              >
                                Fullscreen preview
                              </button>
                              <a
                                href={frame.generatedImageData}
                                download={`storyboard-frame-${frame.shot}.${frame.generatedImageMimeType?.includes("png") ? "png" : "jpg"}`}
                                className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-white/55 transition hover:border-emerald-300/30 hover:text-emerald-100"
                              >
                                Download
                              </a>
                            </>
                          )}
                        </div>

                        <details className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Prompt / assets debug</summary>
                          <div className="mt-3 space-y-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Relevant refs</p>
                              <p className="mt-1 text-xs leading-relaxed text-white/52">{frame.relevantAssetLabels.join(" | ") || "No image refs attached to this frame."}</p>
                            </div>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-white/48">{frame.prompt}</pre>
                          </div>
                        </details>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] overflow-auto rounded-[1.5rem] border border-white/10 bg-black/25 p-4 xl:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Selected Items</p>
              <div className="mt-4 space-y-4">
                {[...PICKER_CONFIG, INSPIRATION_CONFIG].map(config => {
                  const selected = selectedItems[config.key]
                  const auto = selected.length === 0 ? autoSelectedItems[config.key].slice(0, 3) : []
                  const sidebarItems = selected.length > 0 ? selected : auto
                  return (
                    <div key={config.key}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-emerald-100">{config.title}</h4>
                        <span className="text-[10px] text-white/35">{selected.length > 0 ? selected.length : auto.length > 0 ? "auto" : "auto"}</span>
                      </div>
                      <div className="space-y-2">
                        {sidebarItems.map(item => (
                          <div key={item.id} className={`flex items-center gap-2 rounded-xl border p-2 ${selected.length > 0 ? "border-white/10 bg-white/[0.035]" : "border-dashed border-emerald-300/20 bg-emerald-400/[0.035]"}`}>
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-950">
                              {item.url ? <img src={item.url} alt={item.label} className="h-full w-full object-cover" /> : null}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs text-white/65">{item.label}</p>
                              {selected.length === 0 && <p className="mt-0.5 text-[10px] text-emerald-200/55">Auto-select</p>}
                              {config.key === "venue" && categoryMatches(item.category ?? "", ["interiors", "exteriors"]) && (
                                <p className="mt-0.5 truncate text-[10px] text-emerald-200/70">
                                  {venueSpatialDisplaySummary(resolveVenueSpatialMetadataList([item])[0]).zoneName}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {sidebarItems.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-white/25">Auto-select from Client Brain</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </aside>
          </div>
          )}

          {activeWorkspace === "pinterest" && (
            <section className="mt-6 jarvis-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-200/75">Pinterest / Moodboards</p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">Videography Moodboards</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/45">
                    Collect cinematic references for lighting, camera language, color, mood, pacing, and transitions. Pinterest is inspiration only and never becomes a posting channel or truth asset.
                  </p>
                </div>
                <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/10 px-4 py-3 text-xs font-semibold text-fuchsia-100">
                  {(zernioPinterest?.boards ?? []).length} Zernio boards · {directPinterestPins.length} live pins · inspiration only · no publishing
                  {directPinterestStatus?.error && <span className="mt-1 block font-normal text-amber-100/75">Direct pin images unavailable: {directPinterestStatus.error}</span>}
                </div>
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-[360px_1fr]">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                  <h3 className="text-base font-semibold text-zinc-100">Add Pinterest Moodboard Reference</h3>
                  <div className="mt-4 space-y-3">
                    <input value={pinterestDraft.boardName} onChange={event => setPinterestDraft(prev => ({ ...prev, boardName: event.target.value }))} placeholder="Board name" className={CONTROL_CLASS} />
                    <input value={pinterestDraft.pinTitle} onChange={event => setPinterestDraft(prev => ({ ...prev, pinTitle: event.target.value }))} placeholder="Pin title optional" className={CONTROL_CLASS} />
                    <input value={pinterestDraft.imageUrl} onChange={event => setPinterestDraft(prev => ({ ...prev, imageUrl: event.target.value }))} placeholder="Image URL" className={CONTROL_CLASS} />
                    <input value={pinterestDraft.sourceUrl} onChange={event => setPinterestDraft(prev => ({ ...prev, sourceUrl: event.target.value }))} placeholder="Pinterest/source URL optional" className={CONTROL_CLASS} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select value={pinterestDraft.usage} onChange={event => setPinterestDraft(prev => ({ ...prev, usage: event.target.value as PinterestInspirationUsage }))} className={CONTROL_CLASS}>
                        {PINTEREST_INSPIRATION_USAGES.map(usage => <option key={usage} value={usage}>{usage}</option>)}
                      </select>
                      <select value={pinterestDraft.inspirationRole} onChange={event => setPinterestDraft(prev => ({ ...prev, inspirationRole: event.target.value as PinterestInspirationRole }))} className={CONTROL_CLASS}>
                        {PINTEREST_INSPIRATION_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </div>
                    <input value={pinterestDraft.tags} onChange={event => setPinterestDraft(prev => ({ ...prev, tags: event.target.value }))} placeholder="Tags, comma separated" className={CONTROL_CLASS} />
                    <textarea value={pinterestDraft.notes} onChange={event => setPinterestDraft(prev => ({ ...prev, notes: event.target.value }))} placeholder="What should Jarvis use? Camera movement, lighting, color palette, pacing, transition mood..." rows={4} className={TEXTAREA_CLASS} />
                    <button type="button" onClick={addManualPinterestRef} className="w-full rounded-xl bg-fuchsia-300 px-4 py-2 text-xs font-semibold text-black transition hover:bg-fuchsia-200">Add Pinterest Reference</button>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-white/45">Usage</span>
                      <select value={pinterestUsageFilter} onChange={event => setPinterestUsageFilter(event.target.value as PinterestInspirationUsage | "all")} className={CONTROL_CLASS}>
                        <option value="all">All usage</option>
                        {PINTEREST_INSPIRATION_USAGES.map(usage => <option key={usage} value={usage}>{usage}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-white/45">Role</span>
                      <select value={pinterestRoleFilter} onChange={event => setPinterestRoleFilter(event.target.value as PinterestInspirationRole | "all")} className={CONTROL_CLASS}>
                        <option value="all">All roles</option>
                        {PINTEREST_INSPIRATION_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {directPinterestRefs.map(ref => (
                      <article key={ref.id} className="overflow-hidden rounded-[1.25rem] border border-fuchsia-300/20 bg-black/35">
                        <div className="aspect-[4/3] bg-zinc-950">
                          {ref.imageUrl ? <img src={ref.imageUrl} alt={ref.pinTitle || ref.boardName} className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-zinc-100">{ref.pinTitle || ref.boardName}</p>
                            <span className="rounded-full bg-fuchsia-300/15 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-100">Pin</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-500">{ref.boardName} · inspiration only</p>
                        </div>
                      </article>
                    ))}
                    {zernioPinterestRefs.map(ref => (
                      <article key={ref.id} className="overflow-hidden rounded-[1.25rem] border border-fuchsia-300/20 bg-black/35">
                        <div className="flex aspect-[4/3] items-center justify-center bg-zinc-950">
                          {ref.imageUrl ? <img src={ref.imageUrl} alt={ref.pinTitle || ref.boardName} className="h-full w-full object-cover" /> : <span className="px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-100/45">Pinterest Board</span>}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-zinc-100">{ref.boardName}</p>
                            <span className="rounded-full bg-fuchsia-300/15 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-100">Zernio</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-500">{ref.pinTitle || "Connected board"} · inspiration only</p>
                          {ref.notes && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">{ref.notes}</p>}
                        </div>
                      </article>
                    ))}
                    {filteredManualPinterestRefs.map(ref => (
                      <article key={ref.id} className="overflow-hidden rounded-[1.25rem] border border-fuchsia-300/20 bg-black/35">
                        <div className="flex aspect-[4/3] items-center justify-center bg-zinc-950">
                          {ref.imageUrl ? <img src={ref.imageUrl} alt={ref.pinTitle || ref.boardName} className="h-full w-full object-cover" /> : <span className="px-5 text-center text-xs text-zinc-500">Text inspiration</span>}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-zinc-100">{ref.pinTitle || ref.boardName}</p>
                            <span className="rounded-full bg-fuchsia-300/15 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-100">{ref.inspirationRole}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-500">{ref.boardName} · {ref.usage}</p>
                          {ref.notes && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">{ref.notes}</p>}
                        </div>
                      </article>
                    ))}
                    {assetBuckets.inspiration.map(asset => (
                      <article key={asset.id} className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/35">
                        <div className="aspect-[4/3] bg-zinc-950">
                          {signedUrls[asset.id] ? <img src={signedUrls[asset.id]} alt={asset.file_name} className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-semibold text-zinc-100">{asset.file_name}</p>
                          <p className="mt-1 text-xs text-zinc-500">Client Brain Pinterest inspiration · selectable in Cinematic Inspiration</p>
                        </div>
                      </article>
                    ))}
                  </div>

                  {directPinterestRefs.length === 0 && zernioPinterestRefs.length === 0 && filteredManualPinterestRefs.length === 0 && assetBuckets.inspiration.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/25 py-10 text-center text-xs text-zinc-500">{zernioPinterestLoading ? "Loading Zernio Pinterest moodboards..." : "No Pinterest moodboard refs yet."}</div>
                  )}
                  <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-zinc-400">
                    <summary className="cursor-pointer font-semibold text-zinc-200">Pinterest / Zernio Debug</summary>
                    <div className="mt-3 space-y-1">
                      <p>Account count: {String(zernioPinterest?.summary?.accountCount ?? 0)}</p>
                      <p>Board count: {String(zernioPinterest?.summary?.boardCount ?? 0)}</p>
                      <p>Group count: {String(zernioPinterest?.summary?.groupCount ?? 0)} ({String(zernioPinterest?.summary?.groupSupport ?? "unknown")})</p>
                      <p>Pin count: {directPinterestPins.length || String(zernioPinterest?.summary?.pinCount ?? 0)} ({directPinterestStatus?.connectionState === "missing_access_token" ? "requires PINTEREST_ACCESS_TOKEN" : String(directPinterestStatus?.connectionState ?? zernioPinterest?.summary?.pinReadSupport ?? "unknown")})</p>
                      <p>Direct pin image URLs: {String(directPinterestPins.length > 0)}</p>
                      <p>Last fetch: {String(zernioPinterest?.summary?.lastFetchTimestamp ?? "not fetched")}</p>
                      {directPinterestStatus?.error && <p>Direct API: {directPinterestStatus.error}</p>}
                    </div>
                  </details>
                </div>
              </div>
            </section>
          )}

          {activePicker && pickerConfig && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 pb-6 pt-8 backdrop-blur-xl sm:pt-10" onClick={() => setActivePicker(null)}>
              <div className="max-h-[84vh] w-full max-w-6xl overflow-auto rounded-[2rem] border border-white/10 bg-[#070a08] p-5 shadow-[0_40px_140px_rgba(0,0,0,0.75)]" onClick={event => event.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300/75">AI Videography Picker</p>
                    <h3 className="mt-1 text-2xl font-semibold text-white">{pickerConfig.title}</h3>
                    <p className="mt-1 text-sm text-white/40">{pickerConfig.subtitle}</p>
                  </div>
                  <button type="button" onClick={() => setActivePicker(null)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/55 transition hover:border-emerald-300/40 hover:text-emerald-100">Close</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                  {pickerItems[activePicker].map(item => {
                    const selected = selectedIds[activePicker].includes(item.id)
                    return (
                      <button key={item.id} type="button" onClick={() => toggleSelection(activePicker, item.id)} className={`overflow-hidden rounded-2xl border text-left transition ${selected ? "border-emerald-300/70 bg-emerald-400/10 ring-2 ring-emerald-400/20" : "border-white/10 bg-black/30 hover:border-emerald-300/40"}`}>
                        <div className="relative aspect-[4/3] bg-zinc-950">
                          {item.url ? <img src={item.url} alt={item.label} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-white/25">Preview</div>}
                          <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${selected ? "bg-emerald-300 text-black" : "bg-black/70 text-white/65"}`}>{selected ? "Selected" : item.badge}</span>
                        </div>
                        <div className="px-2.5 py-2">
                          <p className="truncate text-[11px] font-semibold text-white">{item.label}</p>
                          <p className="mt-1 truncate text-[10px] text-white/35">{item.subtitle}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {pickerItems[activePicker].length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-xs text-white/35">No matching references yet.</p>}
              </div>
            </div>
          )}

          {framePreview?.generatedImageData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 p-4 backdrop-blur-xl" onClick={() => setFramePreview(null)}>
              <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#050706]" onClick={event => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Frame {framePreview.shot}</p>
                    <h3 className="text-base font-semibold text-white">{framePreview.title}</h3>
                  </div>
                  <div className="flex gap-2">
                    <a href={framePreview.generatedImageData} download={`storyboard-frame-${framePreview.shot}.${framePreview.generatedImageMimeType?.includes("png") ? "png" : "jpg"}`} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-emerald-300/40 hover:text-emerald-100">Download</a>
                    <button type="button" onClick={() => setFramePreview(null)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-emerald-300/40 hover:text-emerald-100">Close</button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <img src={framePreview.generatedImageData} alt={`Generated storyboard frame ${framePreview.shot}`} className="mx-auto max-h-[82vh] w-auto max-w-full object-contain" />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{value}</p>
    </div>
  )
}
