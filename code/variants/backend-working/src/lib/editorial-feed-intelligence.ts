import type { EmotionalTone, FeedRole, LightingStyle, VisualCompositionType } from "@/lib/visual-intelligence"

export type EditorialPlanItem = {
  id: string
  week: number
  day: string
  title: string
  objective: string
  pillar: string
  campaign: string
  emotionalGoal: string
  format: string
  productionSystem?: string
  captionDirection?: string
}

export type SignatureSystem = {
  id: string
  title: string
  emotionalTerritory: string
  motifs: string[]
  compositions: VisualCompositionType[]
  pacing: string
  hooks: string[]
  transitions: string[]
  atmosphere: string
}

export type WeeklyEmotionalArc = {
  weekday: string
  emotion: string
  editorialRole: string
  pacing: string
}

export type FeedSimulationSlot = {
  id: string
  postNumber: number
  sourceItemId: string
  title: string
  day: string
  week: number
  pillar: string
  campaign: string
  format: string
  objective: string
  composition: VisualCompositionType
  lighting: LightingStyle
  emotionalTone: EmotionalTone
  feedRole: FeedRole
  signatureSystem: string
  weeklyArc: WeeklyEmotionalArc
  visualLabel: string
  worldBuilding: boolean
  creativeWildcard: boolean
  simulatedContinuation: boolean
  darkness: number
  productDensity: number
  socialWarmth: number
  typographyUsage: number
  campaignPressure: number
  emotionalEnergy: number
  culturalFeel: number
}

export type FeedEnergyMeter = {
  darkness: number
  productDensity: number
  socialWarmth: number
  typographyUsage: number
  campaignPressure: number
  emotionalEnergy: number
  culturalFeel: number
}

export type EditorialChoreographyInsight = {
  id: string
  title: string
  detail: string
  severity: "info" | "watch" | "priority"
}

export type VisualMemoryAnchor = {
  title: string
  detail: string
  count: number
}

export const SIGNATURE_SYSTEMS: SignatureSystem[] = [
  {
    id: "difc-reset",
    title: "The DIFC Reset",
    emotionalTerritory: "relief, polish, weekday decompression",
    motifs: ["lunch table", "after-work first sip", "calm arrival", "meeting-to-ritual transition"],
    compositions: ["social_table", "45_degree", "wide_atmosphere"],
    pacing: "workday pressure -> table ease -> first bite/sip -> soft booking cue",
    hooks: ["Step out of the day.", "Reset the table.", "After the meeting, the ritual."],
    transitions: ["office energy to warm table", "daylight to golden hour", "decision window to hospitality moment"],
    atmosphere: "polished, useful, warm, never corporate-cold",
  },
  {
    id: "democlientd-table",
    title: "The DemoClientD Table",
    emotionalTerritory: "belonging, social warmth, premium comfort",
    motifs: ["shared dishes", "hands reaching", "engaged guests", "warm room reflections"],
    compositions: ["social_table", "wide_atmosphere", "hands_in_frame"],
    pacing: "room signal -> table detail -> social exchange -> emotional close",
    hooks: ["A table for the people you choose.", "The room finds its rhythm.", "Stay a little longer."],
    transitions: ["wide room to table", "dish detail to shared reaction", "stillness to social energy"],
    atmosphere: "luxurious but lived-in, social but refined",
  },
  {
    id: "comfort-without-borders",
    title: "Comfort Without Borders",
    emotionalTerritory: "nostalgia, familiarity, cultural warmth",
    motifs: ["global dish memory", "comfort textures", "warm hands/service", "soft cultural hints"],
    compositions: ["macro", "45_degree", "hands_in_frame"],
    pacing: "familiar cue -> craft detail -> emotional recognition -> gentle invitation",
    hooks: ["Familiar, but not from one place.", "Comfort in a new language.", "More than one passport on the plate."],
    transitions: ["macro texture to plate hero", "ingredient cue to table warmth", "memory to appetite"],
    atmosphere: "third-culture hospitality, specific but never costume-like",
  },
  {
    id: "third-culture-plate",
    title: "Third Culture Plate",
    emotionalTerritory: "curiosity, identity, culinary layering",
    motifs: ["dish architecture", "sauce/garnish detail", "ingredient story", "menu craft"],
    compositions: ["macro", "editorial_centered", "45_degree"],
    pacing: "hero detail -> cultural note -> texture proof -> save/share cue",
    hooks: ["A dish with more than one origin.", "The familiar, reassembled.", "Built from memory and technique."],
    transitions: ["detail to full plate", "texture to story", "menu fact to emotional payoff"],
    atmosphere: "intelligent, appetizing, layered, not over-explained",
  },
  {
    id: "tonight-at-democlientd",
    title: "Tonight at DemoClientD",
    emotionalTerritory: "aspiration, intimacy, evening magnetism",
    motifs: ["warm interiors", "cocktail glow", "dinner table", "social arrival"],
    compositions: ["wide_atmosphere", "social_table", "editorial_centered"],
    pacing: "arrival -> room -> cocktail/dish -> people -> quiet CTA",
    hooks: ["Where tonight begins.", "Dinner with a pulse.", "The room before the night opens."],
    transitions: ["doorway to table", "drink detail to room mood", "light reflection to human warmth"],
    atmosphere: "cinematic, warm, magnetic, elegant",
  },
  {
    id: "made-in-house",
    title: "Made In-House",
    emotionalTerritory: "craftsmanship, trust, human care",
    motifs: ["chef hands", "the pass", "plating", "final garnish", "service handoff"],
    compositions: ["chef_detail", "hands_in_frame", "macro"],
    pacing: "raw/prep -> transformation -> finish -> table reveal",
    hooks: ["Before it reaches the table.", "The final detail matters.", "Made here, served warm."],
    transitions: ["prep to flame", "garnish to hero", "pass to guest table"],
    atmosphere: "tactile, premium, intimate, process-led",
  },
  {
    id: "cocktail-rituals",
    title: "Cocktail Rituals",
    emotionalTerritory: "anticipation, FOMO, refined evening energy",
    motifs: ["glass truth", "pour", "garnish", "reflection", "first round"],
    compositions: ["hands_in_frame", "editorial_centered", "macro"],
    pacing: "setup -> movement -> garnish -> serve -> social cue",
    hooks: ["The first round has a rhythm.", "Golden hour, poured.", "Start here."],
    transitions: ["bar detail to table", "pour to garnish", "glass reflection to social energy"],
    atmosphere: "dark luxury, golden-hour energy, polished but alive",
  },
]

export const WEEKLY_EMOTIONAL_ARCS: WeeklyEmotionalArc[] = [
  { weekday: "Mon", emotion: "comfort / reset", editorialRole: "soft re-entry into the brand world", pacing: "calmer, warmer, more atmosphere-led" },
  { weekday: "Tue", emotion: "craftsmanship / utility", editorialRole: "lunch proof and useful desire", pacing: "clear but still elegant" },
  { weekday: "Wed", emotion: "curiosity / culture", editorialRole: "third-culture story and product depth", pacing: "textural, save-worthy, layered" },
  { weekday: "Thu", emotion: "FOMO / social energy", editorialRole: "cocktails, rituals, after-work motion", pacing: "more kinetic and rhythmic" },
  { weekday: "Fri", emotion: "aspiration / atmosphere", editorialRole: "dinner mood and cinematic room memory", pacing: "slower, darker, more magnetic" },
  { weekday: "Sat", emotion: "belonging / warmth", editorialRole: "social proof and hospitality feeling", pacing: "human, relaxed, emotionally present" },
  { weekday: "Sun", emotion: "nostalgia / stillness", editorialRole: "quiet brand depth and comfort", pacing: "reflective, soft, world-building" },
]

const CONTINUATION_BEATS = [
  "Quiet table after service",
  "Blue room light reset",
  "Small ritual before dinner",
  "Typography pause",
  "Hands on the pass",
  "Late cocktail glow",
  "Comfort dish memory",
  "Warm architecture still",
  "Shared table close",
  "Minimal campaign whisper",
]

function textOf(item: Pick<EditorialPlanItem, "title" | "pillar" | "campaign" | "format" | "emotionalGoal" | "objective">) {
  return `${item.title} ${item.pillar} ${item.campaign} ${item.format} ${item.emotionalGoal} ${item.objective}`.toLowerCase()
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function weeklyArcForDay(day: string) {
  const weekday = day.split(" ")[0] || "Mon"
  return WEEKLY_EMOTIONAL_ARCS.find(arc => arc.weekday === weekday) ?? WEEKLY_EMOTIONAL_ARCS[0]
}

export function signatureForItem(item: EditorialPlanItem) {
  const text = textOf(item)
  if (text.includes("traffic") || text.includes("cocktail")) return SIGNATURE_SYSTEMS.find(system => system.id === "cocktail-rituals")!
  if (text.includes("business lunch") || text.includes("lunch")) return SIGNATURE_SYSTEMS.find(system => system.id === "difc-reset")!
  if (text.includes("made") || text.includes("bts") || text.includes("service") || text.includes("craft")) return SIGNATURE_SYSTEMS.find(system => system.id === "made-in-house")!
  if (text.includes("third culture") || text.includes("plate")) return SIGNATURE_SYSTEMS.find(system => system.id === "third-culture-plate")!
  if (text.includes("comfort") || text.includes("nostalgia") || text.includes("borders")) return SIGNATURE_SYSTEMS.find(system => system.id === "comfort-without-borders")!
  if (text.includes("dinner") || text.includes("tonight") || text.includes("atmosphere")) return SIGNATURE_SYSTEMS.find(system => system.id === "tonight-at-democlientd")!
  return SIGNATURE_SYSTEMS.find(system => system.id === "democlientd-table")!
}

function compositionForItem(item: EditorialPlanItem): VisualCompositionType {
  const text = textOf(item)
  if (text.includes("graphic") || text.includes("typography")) return "negative_space"
  if (text.includes("atmosphere") || text.includes("architecture") || text.includes("room")) return "wide_atmosphere"
  if (text.includes("service") || text.includes("hands") || text.includes("pour") || text.includes("ritual")) return "hands_in_frame"
  if (text.includes("made") || text.includes("bts") || text.includes("chef")) return "chef_detail"
  if (text.includes("macro") || text.includes("product") || text.includes("dish proof") || text.includes("texture")) return "macro"
  if (text.includes("lifestyle") || text.includes("table") || text.includes("social")) return "social_table"
  if (text.includes("commercial")) return "editorial_centered"
  return "45_degree"
}

function lightingForItem(item: EditorialPlanItem): LightingStyle {
  const text = textOf(item)
  if (text.includes("breakfast") || text.includes("lunch") || text.includes("daylight")) return "soft_daylight"
  if (text.includes("traffic") || text.includes("golden")) return "golden_hour"
  if (text.includes("cocktail") || text.includes("dinner") || text.includes("night") || text.includes("dark")) return "dark_cinematic"
  if (text.includes("graphic") || text.includes("commercial")) return "spotlight_editorial"
  if (text.includes("macro") || text.includes("craft")) return "high_contrast"
  return "warm_luxury"
}

function emotionForItem(item: EditorialPlanItem): EmotionalTone {
  const text = textOf(item)
  if (text.includes("nostalgia")) return "nostalgia"
  if (text.includes("social") || text.includes("fomo")) return "social"
  if (text.includes("celebr")) return "celebratory"
  if (text.includes("craft") || text.includes("trust")) return "craftsmanship"
  if (text.includes("traffic") || text.includes("energy") || text.includes("cocktail")) return "energetic"
  if (text.includes("dinner") || text.includes("intimate")) return "intimate"
  if (text.includes("aspiration") || text.includes("luxury")) return "luxury"
  return "comfort"
}

function feedRoleForItem(item: EditorialPlanItem, composition: VisualCompositionType, lighting: LightingStyle): FeedRole {
  const text = textOf(item)
  if (composition === "negative_space") return "typography_break"
  if (text.includes("campaign") || text.includes("traffic") || text.includes("business lunch")) return "campaign_focus"
  if (composition === "macro" || text.includes("product")) return "product_focus"
  if (composition === "social_table") return "social_energy"
  if (lighting === "dark_cinematic") return "dark_anchor"
  if (lighting === "soft_daylight") return "light_reset"
  return "contrast_break"
}

function continuationItem(index: number, source: EditorialPlanItem): EditorialPlanItem {
  const title = CONTINUATION_BEATS[index % CONTINUATION_BEATS.length]
  return {
    ...source,
    id: `simulation-continuation-${index + 1}`,
    title,
    objective: "world-building",
    format: index % 5 === 3 ? "editorial graphic" : index % 4 === 0 ? "atmosphere still" : "lifestyle post",
    pillar:
      index % 5 === 3 ? "Campaign Activations" :
      index % 4 === 0 ? "Atmosphere & Architecture" :
      index % 3 === 0 ? "Service & BTS" :
      "Lifestyle Hospitality",
    campaign: index % 5 === 3 ? "Editorial Brand System" : "Brand World",
    emotionalGoal: index % 2 === 0 ? "belonging" : "nostalgia",
  }
}

export function buildFeedSimulation(items: EditorialPlanItem[], targetCount = 30): FeedSimulationSlot[] {
  if (items.length === 0) return []
  return Array.from({ length: targetCount }, (_, index) => {
    const original = items[index % items.length]
    const item = index < items.length ? original : continuationItem(index, original)
    const composition = compositionForItem(item)
    const lighting = lightingForItem(item)
    const emotionalTone = emotionForItem(item)
    const feedRole = feedRoleForItem(item, composition, lighting)
    const signature = signatureForItem(item)
    const weeklyArc = weeklyArcForDay(item.day)
    const worldBuilding = item.objective.includes("emotional") || item.objective.includes("world") || ["Lifestyle Hospitality", "Third Culture Stories", "Atmosphere & Architecture", "Service & BTS"].includes(item.pillar)
    const creativeWildcard = index % 7 === 5 || item.title.toLowerCase().includes("quiet") || item.title.toLowerCase().includes("typography")
    const darkness =
      lighting === "dark_cinematic" ? 84 :
      lighting === "golden_hour" ? 58 :
      lighting === "spotlight_editorial" ? 64 :
      lighting === "high_contrast" ? 66 :
      lighting === "soft_daylight" ? 24 :
      42
    const productDensity = composition === "macro" || feedRole === "product_focus" ? 86 : composition === "editorial_centered" ? 62 : 34
    const socialWarmth = composition === "social_table" || item.pillar === "Lifestyle Hospitality" ? 86 : worldBuilding ? 62 : 36
    const typographyUsage = feedRole === "typography_break" ? 92 : 12
    const campaignPressure = feedRole === "campaign_focus" || item.objective.includes("booking") || item.objective.includes("push") ? 78 : 28
    const emotionalEnergy = emotionalTone === "energetic" || emotionalTone === "celebratory" ? 84 : emotionalTone === "intimate" || emotionalTone === "nostalgia" ? 54 : 68
    const culturalFeel = item.pillar === "Third Culture Stories" || signature.id === "comfort-without-borders" || signature.id === "third-culture-plate" ? 88 : worldBuilding ? 62 : 38

    return {
      id: `${item.id}-feed-${index + 1}`,
      postNumber: index + 1,
      sourceItemId: original.id,
      title: item.title,
      day: item.day,
      week: item.week,
      pillar: item.pillar,
      campaign: item.campaign,
      format: item.format,
      objective: item.objective,
      composition,
      lighting,
      emotionalTone,
      feedRole,
      signatureSystem: signature.title,
      weeklyArc,
      visualLabel: `${lighting.replaceAll("_", " ")} ${composition.replaceAll("_", " ")}`,
      worldBuilding,
      creativeWildcard,
      simulatedContinuation: index >= items.length,
      darkness: clamp(darkness),
      productDensity: clamp(productDensity),
      socialWarmth: clamp(socialWarmth),
      typographyUsage: clamp(typographyUsage),
      campaignPressure: clamp(campaignPressure),
      emotionalEnergy: clamp(emotionalEnergy),
      culturalFeel: clamp(culturalFeel),
    }
  })
}

export function buildFeedEnergyMeter(slots: FeedSimulationSlot[]): FeedEnergyMeter {
  return {
    darkness: average(slots.map(slot => slot.darkness)),
    productDensity: average(slots.map(slot => slot.productDensity)),
    socialWarmth: average(slots.map(slot => slot.socialWarmth)),
    typographyUsage: average(slots.map(slot => slot.typographyUsage)),
    campaignPressure: average(slots.map(slot => slot.campaignPressure)),
    emotionalEnergy: average(slots.map(slot => slot.emotionalEnergy)),
    culturalFeel: average(slots.map(slot => slot.culturalFeel)),
  }
}

function longestRun<T>(items: T[], keyFor: (item: T) => string) {
  let best = 0
  let current = 0
  let last = ""
  for (const item of items) {
    const key = keyFor(item)
    current = key === last ? current + 1 : 1
    best = Math.max(best, current)
    last = key
  }
  return best
}

export function buildEditorialChoreographyInsights(slots: FeedSimulationSlot[]): EditorialChoreographyInsight[] {
  if (slots.length === 0) return []
  const meter = buildFeedEnergyMeter(slots)
  const insights: EditorialChoreographyInsight[] = []
  const darkRun = longestRun(slots, slot => slot.darkness >= 70 ? "dark" : "not-dark")
  const productRun = longestRun(slots, slot => slot.productDensity >= 70 ? "product" : "not-product")
  const campaignRun = longestRun(slots, slot => slot.campaignPressure >= 70 ? "campaign" : "not-campaign")
  const typographyCount = slots.filter(slot => slot.feedRole === "typography_break").length
  const worldCount = slots.filter(slot => slot.worldBuilding).length
  const wildcardCount = slots.filter(slot => slot.creativeWildcard).length

  if (darkRun >= 3) {
    insights.push({
      id: "consecutive-dark",
      title: "Too many dark closeups can flatten rhythm",
      detail: "The simulation contains a long dark run. Add a bright brunch reset, typography pause, or wide room beat after the second dark anchor.",
      severity: "priority",
    })
  }
  if (productRun >= 3 || meter.productDensity > 58) {
    insights.push({
      id: "product-density",
      title: "Product density needs hospitality relief",
      detail: "The feed is leaning product-heavy. Use social table scenes, hands, room mood, and service rituals as editorial oxygen.",
      severity: "watch",
    })
  }
  if (meter.socialWarmth < 50) {
    insights.push({
      id: "social-warmth-gap",
      title: "Feed lacks social hospitality warmth",
      detail: "Add more people, shared table energy, welcome/service cues, and belonging moments so DemoClientD feels like a living room, not only a menu.",
      severity: "priority",
    })
  }
  if (typographyCount < 2) {
    insights.push({
      id: "typography-break-gap",
      title: "Need editorial typography interruption",
      detail: "A luxury grid needs occasional designed pauses. Use elegant minimal graphics as collectible editorial objects, not promo flyers.",
      severity: "watch",
    })
  }
  if (campaignRun >= 3 || meter.campaignPressure > 52) {
    insights.push({
      id: "campaign-pressure",
      title: "Campaign pressure needs visual breathing room",
      detail: "Place atmosphere, service, or world-building posts between CTA-heavy beats so the feed keeps emotional value.",
      severity: "watch",
    })
  }
  if (worldCount < Math.ceil(slots.length * 0.28)) {
    insights.push({
      id: "world-building-gap",
      title: "More world-building needed",
      detail: "Not every post should sell. Add quiet table moments, architecture mood, service rituals, and cultural warmth to deepen the brand universe.",
      severity: "priority",
    })
  }
  if (meter.culturalFeel < 45) {
    insights.push({
      id: "cultural-feel-gap",
      title: "Third Culture feeling is underpowered",
      detail: "Increase nostalgia, comfort, global identity, craft details, and dish-memory captions without turning the brand into a corporate restaurant.",
      severity: "priority",
    })
  }
  if (wildcardCount < 3) {
    insights.push({
      id: "wildcard-gap",
      title: "Planner is becoming too predictable",
      detail: "Inject a calm surprise: a quiet room detail, unusual crop, cultural memory, graphic pause, or still-life moment that expands the brand world.",
      severity: "info",
    })
  }

  return insights.length > 0 ? insights : [{
    id: "editorial-rhythm-balanced",
    title: "Editorial rhythm has a strong baseline",
    detail: "The simulation balances product, social warmth, atmosphere, campaign utility, and world-building without obvious repetition.",
    severity: "info",
  }]
}

export function buildVisualMemoryAnchors(slots: FeedSimulationSlot[]): VisualMemoryAnchor[] {
  const anchorDefs = [
    { title: "Warm social table framing", test: (slot: FeedSimulationSlot) => slot.composition === "social_table" },
    { title: "Dark cocktail or evening anchors", test: (slot: FeedSimulationSlot) => slot.lighting === "dark_cinematic" || slot.signatureSystem === "Cocktail Rituals" },
    { title: "Chef hands / service ritual", test: (slot: FeedSimulationSlot) => slot.composition === "hands_in_frame" || slot.composition === "chef_detail" },
    { title: "Typography/editorial pauses", test: (slot: FeedSimulationSlot) => slot.feedRole === "typography_break" },
    { title: "Third Culture memory cues", test: (slot: FeedSimulationSlot) => slot.culturalFeel >= 70 },
    { title: "Atmosphere room resets", test: (slot: FeedSimulationSlot) => slot.composition === "wide_atmosphere" },
  ]

  return anchorDefs.map(anchor => {
    const count = slots.filter(anchor.test).length
    return {
      title: anchor.title,
      count,
      detail: count > 0
        ? `${count} simulated beat${count === 1 ? "" : "s"} reinforce this visual memory anchor.`
        : "Underused in the current simulation; consider adding this motif for brand memory.",
    }
  })
}
