import type { PinterestInspirationRef, PinterestPinImageRef, PinterestPinRef } from "@/lib/pinterest-inspiration"

export type VisualCompositionType =
  | "macro"
  | "overhead"
  | "45_degree"
  | "editorial_centered"
  | "asymmetrical"
  | "wide_atmosphere"
  | "hands_in_frame"
  | "social_table"
  | "chef_detail"
  | "negative_space"

export type LightingStyle =
  | "dark_cinematic"
  | "warm_luxury"
  | "golden_hour"
  | "soft_daylight"
  | "high_contrast"
  | "spotlight_editorial"

export type EmotionalTone =
  | "comfort"
  | "nostalgia"
  | "social"
  | "luxury"
  | "celebratory"
  | "intimate"
  | "energetic"
  | "craftsmanship"

export type StoryRole = "hook" | "detail" | "hero" | "transition" | "closing" | "atmosphere"

export type FeedRole =
  | "contrast_break"
  | "dark_anchor"
  | "light_reset"
  | "typography_break"
  | "social_energy"
  | "product_focus"
  | "campaign_focus"

export type VisualIntelligenceRef = {
  id: string
  source: "pinterest" | "manual" | "brand_seed" | "feed"
  boardName: string
  title?: string
  imageUrl?: string
  tags: string[]
  inspirationOnly: true
  compositionType: VisualCompositionType
  lightingStyle: LightingStyle
  emotionalTone: EmotionalTone
  storyRole: StoryRole
  feedRole: FeedRole
  confidence: "manual" | "heuristic" | "seed"
  notes?: string
}

export type VisualPatternGroup<T extends string> = {
  label: T
  count: number
  percentage: number
  refs: VisualIntelligenceRef[]
}

export type FeedChoreographyInsight = {
  id: string
  title: string
  detail: string
  severity: "info" | "watch" | "priority"
  recommendation: string
}

export type VisualIntelligenceReport = {
  refCount: number
  groups: {
    composition: Array<VisualPatternGroup<VisualCompositionType>>
    lighting: Array<VisualPatternGroup<LightingStyle>>
    emotion: Array<VisualPatternGroup<EmotionalTone>>
    storyRole: Array<VisualPatternGroup<StoryRole>>
    feedRole: Array<VisualPatternGroup<FeedRole>>
  }
  underused: {
    composition: VisualCompositionType[]
    lighting: LightingStyle[]
    emotion: EmotionalTone[]
    feedRole: FeedRole[]
  }
  dominant: {
    composition?: VisualCompositionType
    lighting?: LightingStyle
    emotion?: EmotionalTone
    feedRole?: FeedRole
  }
  rhythmSequence: Array<{
    label: string
    composition: VisualCompositionType
    lighting: LightingStyle
    emotion: EmotionalTone
    feedRole: FeedRole
  }>
  feedInsights: FeedChoreographyInsight[]
}

const COMPOSITION_TYPES: VisualCompositionType[] = ["macro", "overhead", "45_degree", "editorial_centered", "asymmetrical", "wide_atmosphere", "hands_in_frame", "social_table", "chef_detail", "negative_space"]
const LIGHTING_STYLES: LightingStyle[] = ["dark_cinematic", "warm_luxury", "golden_hour", "soft_daylight", "high_contrast", "spotlight_editorial"]
const EMOTIONAL_TONES: EmotionalTone[] = ["comfort", "nostalgia", "social", "luxury", "celebratory", "intimate", "energetic", "craftsmanship"]
const FEED_ROLES: FeedRole[] = ["contrast_break", "dark_anchor", "light_reset", "typography_break", "social_energy", "product_focus", "campaign_focus"]

export const DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS: VisualIntelligenceRef[] = [
  makeSeed("breakfast-soft-daylight", "DemoClientD - Breakfast", "Soft breakfast reset", ["breakfast", "brunch", "daylight"], "45_degree", "soft_daylight", "comfort", "hero", "light_reset"),
  makeSeed("business-lunch-table", "DemoClientD - Lunch", "Polished lunch table", ["lunch", "DIFC", "table"], "social_table", "warm_luxury", "social", "hero", "social_energy"),
  makeSeed("cocktail-dark-anchor", "DemoClientD - Cocktails", "Dark cocktail anchor", ["drinks", "cocktail", "night"], "editorial_centered", "dark_cinematic", "luxury", "hook", "dark_anchor"),
  makeSeed("cocktail-golden-hour", "DemoClientD - Cocktails", "Golden hour ritual", ["drinks", "traffic hours", "after work"], "hands_in_frame", "golden_hour", "energetic", "transition", "campaign_focus"),
  makeSeed("service-bts-hands", "DemoClientD - Service/BTS", "Service detail", ["service", "bts", "hands"], "hands_in_frame", "warm_luxury", "craftsmanship", "detail", "contrast_break"),
  makeSeed("chef-detail", "DemoClientD - Service/BTS", "Chef detail", ["chef", "craft", "plating"], "chef_detail", "spotlight_editorial", "craftsmanship", "detail", "product_focus"),
  makeSeed("lifestyle-social-table", "DemoClientD - Lifestyle", "Social hospitality", ["lifestyle", "people", "table"], "social_table", "warm_luxury", "social", "hero", "social_energy"),
  makeSeed("wide-atmosphere", "DemoClientD - Lifestyle", "Wide venue atmosphere", ["venue", "wide", "atmosphere"], "wide_atmosphere", "dark_cinematic", "intimate", "atmosphere", "contrast_break"),
  makeSeed("food-macro-texture", "DemoClientD - Food", "Macro texture", ["food", "macro", "texture"], "macro", "high_contrast", "craftsmanship", "detail", "product_focus"),
  makeSeed("editorial-layout", "DemoClientD - Flyers", "Editorial layout break", ["flyer", "typography", "layout"], "negative_space", "spotlight_editorial", "luxury", "closing", "typography_break"),
]

function makeSeed(
  id: string,
  boardName: string,
  title: string,
  tags: string[],
  compositionType: VisualCompositionType,
  lightingStyle: LightingStyle,
  emotionalTone: EmotionalTone,
  storyRole: StoryRole,
  feedRole: FeedRole,
): VisualIntelligenceRef {
  return {
    id,
    source: "brand_seed",
    boardName,
    title,
    tags,
    inspirationOnly: true,
    compositionType,
    lightingStyle,
    emotionalTone,
    storyRole,
    feedRole,
    confidence: "seed",
  }
}

function includesAny(text: string, words: string[]) {
  return words.some(word => text.includes(word))
}

function cleanText(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase()
}

export function classifyVisualReference(ref: PinterestInspirationRef | PinterestPinRef | PinterestPinImageRef | Partial<VisualIntelligenceRef>): VisualIntelligenceRef {
  const tags = "tags" in ref && Array.isArray(ref.tags) ? ref.tags : []
  const text = cleanText(ref.boardName, "title" in ref ? ref.title : undefined, "pinTitle" in ref ? ref.pinTitle : undefined, "description" in ref ? ref.description : undefined, tags.join(" "), "notes" in ref ? ref.notes : undefined)
  const boardName = ref.boardName || "Pinterest Inspiration"

  const compositionType: VisualCompositionType =
    includesAny(text, ["macro", "texture", "close", "detail", "dessert", "food"]) ? "macro" :
    includesAny(text, ["overhead", "flat lay", "top down", "table layout"]) ? "overhead" :
    includesAny(text, ["hands", "service", "pour", "shake", "garnish"]) ? "hands_in_frame" :
    includesAny(text, ["chef", "pass", "plating", "bts", "behind"]) ? "chef_detail" :
    includesAny(text, ["lifestyle", "social", "people", "dinner", "lunch", "table"]) ? "social_table" :
    includesAny(text, ["venue", "architecture", "interior", "atmosphere", "wide"]) ? "wide_atmosphere" :
    includesAny(text, ["flyer", "layout", "typography", "negative"]) ? "negative_space" :
    includesAny(text, ["editorial", "centered", "commercial"]) ? "editorial_centered" :
    includesAny(text, ["asymmetrical", "off center"]) ? "asymmetrical" :
    "45_degree"

  const lightingStyle: LightingStyle =
    includesAny(text, ["breakfast", "brunch", "daylight", "morning"]) ? "soft_daylight" :
    includesAny(text, ["golden", "traffic", "sunset", "after work"]) ? "golden_hour" :
    includesAny(text, ["dark", "night", "cinematic", "cocktail", "drinks"]) ? "dark_cinematic" :
    includesAny(text, ["contrast", "shadow", "hard light"]) ? "high_contrast" :
    includesAny(text, ["spotlight", "editorial", "commercial"]) ? "spotlight_editorial" :
    "warm_luxury"

  const emotionalTone: EmotionalTone =
    includesAny(text, ["breakfast", "comfort", "warm", "home"]) ? "comfort" :
    includesAny(text, ["nostalgia", "third culture", "heritage"]) ? "nostalgia" :
    includesAny(text, ["lifestyle", "social", "table", "people", "lunch"]) ? "social" :
    includesAny(text, ["event", "celebration", "eid", "restaurant week"]) ? "celebratory" :
    includesAny(text, ["bts", "service", "chef", "craft", "plating", "detail"]) ? "craftsmanship" :
    includesAny(text, ["traffic", "cocktail", "drinks", "night"]) ? "energetic" :
    includesAny(text, ["intimate", "dinner", "date"]) ? "intimate" :
    "luxury"

  const storyRole: StoryRole =
    compositionType === "wide_atmosphere" ? "atmosphere" :
    compositionType === "macro" || compositionType === "hands_in_frame" || compositionType === "chef_detail" ? "detail" :
    compositionType === "negative_space" ? "closing" :
    includesAny(text, ["hook", "cover", "commercial"]) ? "hook" :
    includesAny(text, ["transition", "pour", "movement"]) ? "transition" :
    "hero"

  const feedRole: FeedRole =
    compositionType === "negative_space" ? "typography_break" :
    lightingStyle === "dark_cinematic" ? "dark_anchor" :
    lightingStyle === "soft_daylight" ? "light_reset" :
    compositionType === "social_table" ? "social_energy" :
    compositionType === "macro" || compositionType === "editorial_centered" ? "product_focus" :
    includesAny(text, ["campaign", "traffic", "business lunch", "restaurant week", "flyer"]) ? "campaign_focus" :
    "contrast_break"

  return {
    id: ref.id || `${boardName}-${compositionType}-${lightingStyle}`,
    source: "source" in ref && ref.source === "manual" ? "manual" : "pinterest",
    boardName,
    title: "title" in ref ? ref.title : "pinTitle" in ref ? ref.pinTitle : undefined,
    imageUrl: "imageUrl" in ref ? ref.imageUrl : undefined,
    tags,
    inspirationOnly: true,
    compositionType,
    lightingStyle,
    emotionalTone,
    storyRole,
    feedRole,
    confidence: "heuristic",
    notes: "notes" in ref ? ref.notes : undefined,
  }
}

function groupPatterns<T extends string>(refs: VisualIntelligenceRef[], values: T[], key: (ref: VisualIntelligenceRef) => T) {
  const total = Math.max(refs.length, 1)
  return values
    .map(label => {
      const groupRefs = refs.filter(ref => key(ref) === label)
      return {
        label,
        count: groupRefs.length,
        percentage: Math.round((groupRefs.length / total) * 100),
        refs: groupRefs,
      } satisfies VisualPatternGroup<T>
    })
    .sort((a, b) => b.count - a.count)
}

function underused<T extends string>(groups: Array<VisualPatternGroup<T>>) {
  return groups.filter(group => group.count === 0 || group.percentage <= 8).map(group => group.label).slice(0, 4)
}

export function buildVisualIntelligence(refs: VisualIntelligenceRef[]): VisualIntelligenceReport {
  const sourceRefs = refs.length > 0 ? refs : DEMOCLIENTD_VISUAL_INTELLIGENCE_SEEDS
  const composition = groupPatterns(sourceRefs, COMPOSITION_TYPES, ref => ref.compositionType)
  const lighting = groupPatterns(sourceRefs, LIGHTING_STYLES, ref => ref.lightingStyle)
  const emotion = groupPatterns(sourceRefs, EMOTIONAL_TONES, ref => ref.emotionalTone)
  const storyRole = groupPatterns(sourceRefs, ["hook", "detail", "hero", "transition", "closing", "atmosphere"] as StoryRole[], ref => ref.storyRole)
  const feedRole = groupPatterns(sourceRefs, FEED_ROLES, ref => ref.feedRole)
  const dominant = {
    composition: composition[0]?.count ? composition[0].label : undefined,
    lighting: lighting[0]?.count ? lighting[0].label : undefined,
    emotion: emotion[0]?.count ? emotion[0].label : undefined,
    feedRole: feedRole[0]?.count ? feedRole[0].label : undefined,
  }

  return {
    refCount: sourceRefs.length,
    groups: { composition, lighting, emotion, storyRole, feedRole },
    underused: {
      composition: underused(composition),
      lighting: underused(lighting),
      emotion: underused(emotion),
      feedRole: underused(feedRole),
    },
    dominant,
    rhythmSequence: makeRhythmSequence(sourceRefs),
    feedInsights: makeFeedInsights(composition, lighting, emotion, feedRole),
  }
}

function makeRhythmSequence(refs: VisualIntelligenceRef[]) {
  const sequence = refs.slice(0, 12)
  return sequence.map((ref, index) => ({
    label: `Beat ${index + 1}`,
    composition: ref.compositionType,
    lighting: ref.lightingStyle,
    emotion: ref.emotionalTone,
    feedRole: ref.feedRole,
  }))
}

function makeFeedInsights(
  composition: Array<VisualPatternGroup<VisualCompositionType>>,
  lighting: Array<VisualPatternGroup<LightingStyle>>,
  emotion: Array<VisualPatternGroup<EmotionalTone>>,
  feedRole: Array<VisualPatternGroup<FeedRole>>,
): FeedChoreographyInsight[] {
  const insights: FeedChoreographyInsight[] = []
  const dark = lighting.find(group => group.label === "dark_cinematic")
  const macro = composition.find(group => group.label === "macro")
  const social = composition.find(group => group.label === "social_table")
  const wide = composition.find(group => group.label === "wide_atmosphere")
  const typography = feedRole.find(group => group.label === "typography_break")
  const product = feedRole.find(group => group.label === "product_focus")
  const socialTone = emotion.find(group => group.label === "social")

  if ((dark?.percentage ?? 0) > 35) {
    insights.push({
      id: "dark-density",
      title: "Dark visual density needs contrast",
      detail: "Dark cinematic references are dominant. Use daylight, typography, or wide atmosphere posts as rhythm breaks.",
      severity: "watch",
      recommendation: "Add light_reset or contrast_break beats every 3-4 posts.",
    })
  }
  if ((macro?.percentage ?? 0) > 30 || (product?.percentage ?? 0) > 30) {
    insights.push({
      id: "product-density",
      title: "Product density can become repetitive",
      detail: "Macro/product references are strong. Balance them with hospitality, hands, atmosphere, and social table compositions.",
      severity: "priority",
      recommendation: "Alternate product_focus with social_energy or wide_atmosphere.",
    })
  }
  if ((social?.count ?? 0) <= 1 || (socialTone?.count ?? 0) <= 1) {
    insights.push({
      id: "social-energy-gap",
      title: "Feed needs more social hospitality energy",
      detail: "Social table cues are underrepresented. DemoClientD should feel like a warm social home, not only food/product detail.",
      severity: "priority",
      recommendation: "Add lifestyle hospitality, shared table, cheers, or engaged guest beats.",
    })
  }
  if ((wide?.count ?? 0) <= 1) {
    insights.push({
      id: "atmosphere-gap",
      title: "Wide atmosphere is underused",
      detail: "Venue atmosphere gives the feed a sense of place and prevents close-up fatigue.",
      severity: "watch",
      recommendation: "Use wide_atmosphere as a room-reset beat before or after product-heavy posts.",
    })
  }
  if ((typography?.count ?? 0) <= 1) {
    insights.push({
      id: "typography-gap",
      title: "Typography breaks are limited",
      detail: "Editorial layouts and campaign graphics can punctuate the grid without turning it into a flyer board.",
      severity: "info",
      recommendation: "Use one typography_break per campaign cluster or offer push.",
    })
  }

  return insights.length > 0 ? insights : [{
    id: "balanced-baseline",
    title: "Visual rhythm has a workable baseline",
    detail: "The current reference mix contains product, social, atmosphere, lighting, and campaign roles.",
    severity: "info",
    recommendation: "Use choreography rules to alternate emotional and visual density rather than copying references.",
  }]
}

export function visualPromptGuidance(report: VisualIntelligenceReport) {
  const underusedComposition = report.underused.composition.slice(0, 3).join(", ") || "none"
  const underusedLighting = report.underused.lighting.slice(0, 3).join(", ") || "none"
  const insights = report.feedInsights.slice(0, 3).map(insight => `- ${insight.recommendation}`).join("\n")
  return `[VISUAL_INTELLIGENCE]
- Pinterest and inspiration refs are inspiration only; never copy exact images.
- Dominant composition: ${report.dominant.composition ?? "unknown"}.
- Dominant lighting: ${report.dominant.lighting ?? "unknown"}.
- Dominant emotional tone: ${report.dominant.emotion ?? "unknown"}.
- Underused compositions to consider: ${underusedComposition}.
- Underused lighting to consider: ${underusedLighting}.
- Feed choreography recommendations:
${insights}`
}
