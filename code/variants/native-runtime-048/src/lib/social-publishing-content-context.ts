export type ContextSource = "verified" | "inferred" | "confirmed"

export type SocialContentContextLayer = {
  archetype?: string
  primarySubject?: string
  supportingFood?: string[]
  supportingDrink?: string[]
  venue?: string
  staff?: string[]
  anonymousPeople?: boolean
  activation?: string
  servicePeriod?: string
  factualDescriptors?: string[]
  location?: string
  category?: string
  truthReferenceIds?: string[]
}

export type SocialContentContext = {
  verified: SocialContentContextLayer
  inferred: SocialContentContextLayer
  confirmed: SocialContentContextLayer
  lineage: {
    monthlyPlanItemId?: string
    individualProductionArtifactId?: string
    aiContentGenerationId?: string
    clientBrainAssetIds?: string[]
  }
}

export type CaptionContext = {
  contentType: string
  archetype: string | null
  primarySubject: string | null
  supportingFood: string[]
  supportingDrink: string[]
  venue: string | null
  staff: string[]
  anonymousPeople: boolean | null
  activation: string | null
  servicePeriod: string | null
  factualDescriptors: string[]
  location: string | null
  category: string | null
  verifiedFacts: string[]
  sources: Array<"verified_structured_truth" | "user_confirmed_context">
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 6) : []
}

function layer(value: unknown): SocialContentContextLayer {
  const source = record(value)
  return {
    archetype: text(source.archetype) || undefined,
    primarySubject: text(source.primarySubject) || undefined,
    supportingFood: list(source.supportingFood),
    supportingDrink: list(source.supportingDrink),
    venue: text(source.venue) || undefined,
    staff: list(source.staff),
    anonymousPeople: typeof source.anonymousPeople === "boolean" ? source.anonymousPeople : undefined,
    activation: text(source.activation) || undefined,
    servicePeriod: text(source.servicePeriod) || undefined,
    factualDescriptors: list(source.factualDescriptors),
    location: text(source.location) || undefined,
    category: text(source.category) || undefined,
    truthReferenceIds: list(source.truthReferenceIds),
  }
}

export function normalizeSocialContentContext(value: unknown): SocialContentContext {
  const source = record(value)
  const lineage = record(source.lineage)
  return {
    verified: layer(source.verified),
    inferred: layer(source.inferred),
    confirmed: layer(source.confirmed),
    lineage: {
      monthlyPlanItemId: text(lineage.monthlyPlanItemId) || undefined,
      individualProductionArtifactId: text(lineage.individualProductionArtifactId) || undefined,
      aiContentGenerationId: text(lineage.aiContentGenerationId) || undefined,
      clientBrainAssetIds: list(lineage.clientBrainAssetIds),
    },
  }
}

function mergedText(verified: string | undefined, confirmed: string | undefined) {
  return confirmed || verified || null
}

function mergedList(verified: string[] | undefined, confirmed: string[] | undefined) {
  return [...new Set([...(verified ?? []), ...(confirmed ?? [])])]
}

export function captionContextFrom(contentType: string, value: unknown): CaptionContext {
  const context = normalizeSocialContentContext(value)
  const verified = context.verified
  const confirmed = context.confirmed
  const primarySubject = mergedText(verified.primarySubject, confirmed.primarySubject)
  const supportingFood = mergedList(verified.supportingFood, confirmed.supportingFood)
  const supportingDrink = mergedList(verified.supportingDrink, confirmed.supportingDrink)
  const venue = mergedText(verified.venue, confirmed.venue)
  const activation = mergedText(verified.activation, confirmed.activation)
  const servicePeriod = mergedText(verified.servicePeriod, confirmed.servicePeriod)
  const factualDescriptors = mergedList(verified.factualDescriptors, confirmed.factualDescriptors)
  const facts = [
    primarySubject && `Primary subject: ${primarySubject}`,
    supportingFood.length && `Supporting food: ${supportingFood.join(", ")}`,
    supportingDrink.length && `Supporting drinks: ${supportingDrink.join(", ")}`,
    venue && `Venue setting: ${venue}`,
    activation && `Activation: ${activation}`,
    servicePeriod && `Service period: ${servicePeriod}`,
    factualDescriptors.length && `Verified descriptors: ${factualDescriptors.join(", ")}`,
  ].filter((item): item is string => Boolean(item))
  return {
    contentType,
    archetype: mergedText(verified.archetype, confirmed.archetype),
    primarySubject,
    supportingFood,
    supportingDrink,
    venue,
    staff: mergedList(verified.staff, confirmed.staff),
    anonymousPeople: confirmed.anonymousPeople ?? verified.anonymousPeople ?? null,
    activation,
    servicePeriod,
    factualDescriptors,
    location: mergedText(verified.location, confirmed.location),
    category: mergedText(verified.category, confirmed.category),
    verifiedFacts: facts,
    sources: [
      ...(Object.values(verified).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value)) ? ["verified_structured_truth" as const] : []),
      ...(Object.values(confirmed).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value)) ? ["user_confirmed_context" as const] : []),
    ],
  }
}

const HASHTAG_MAP: Record<string, string> = {
  "business bay": "BusinessBayDining",
  "j one, business bay": "BusinessBayDining",
  "difc": "DIFCDining",
  "dubai": "DubaiDining",
  "italian": "ItalianRestaurant",
  "italian restaurant": "ItalianRestaurant",
  "pizza": "PizzaDubai",
  "pasta": "PastaDubai",
  "breakfast": "BreakfastDubai",
  "business lunch": "BusinessLunchDubai",
  "brunch": "BrunchDubai",
  "lunch": "LunchDubai",
  "dinner": "DinnerDubai",
  "terrace": "DIFCTerrace",
}

function mappedHashtag(value: string) {
  const normalized = value.trim().toLowerCase()
  if (HASHTAG_MAP[normalized]) return HASHTAG_MAP[normalized]
  if (/^[A-Za-z][A-Za-z0-9 ]{1,35}$/.test(value) && /(?:pizza|pasta|risotto|cotoletta|tiramisu|aperitivo)/i.test(value)) return value.replace(/[^A-Za-z0-9]/g, "")
  return null
}

export function commercialHashtags(context: CaptionContext, maxCount: number) {
  const candidates = [
    context.location,
    context.venue,
    context.category,
    context.servicePeriod,
    context.activation,
    context.primarySubject,
    ...context.supportingFood,
    ...context.supportingDrink,
  ].filter((value): value is string => Boolean(value))
  return [...new Set(candidates.map(mappedHashtag).filter((value): value is string => Boolean(value)))].slice(0, Math.max(0, maxCount))
}
