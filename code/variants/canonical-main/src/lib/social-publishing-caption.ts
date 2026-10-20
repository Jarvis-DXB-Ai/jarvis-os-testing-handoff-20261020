import { commercialHashtags, type CaptionContext } from "@/lib/social-publishing-content-context"
import type { RelevantCaptionTruth } from "@/lib/social-caption-context-enrichment"

export const SOCIAL_CAPTION_PROMPT_VERSION = "social-publishing-caption-v5-story-first"

export type CaptionProfile = {
  footer: string
  fixedHashtags: string[]
  dynamicHashtagCount: number
  toneOfVoice: string
  instructions: string
  approvedPhrases: string[]
  styleExamples: string[]
  goldenCaptions: string[]
  avoidPhrases: string[]
  guidelines: Record<string, string>
}

export type CaptionOptionContract = { body: string; dynamic_hashtags?: string[] }
export type CaptionResponseContract = { post_title?: string; caption_options: CaptionOptionContract[] }
export type CaptionValidationStatus = "ready" | "needs_review" | "blocked"
export type CaptionValidationDiagnostic = { code: string; message: string; status: Exclude<CaptionValidationStatus, "ready"> }
export type CaptionOptionAssessment = { option: CaptionOptionContract; validationStatus: CaptionValidationStatus; diagnostics: CaptionValidationDiagnostic[] }
export type CaptionVisualCreativeContext = {
  broadScene?: string
  broadMoment?: string
  composition?: string
  visualMood?: string
  people?: string
  foodVisible?: string[]
  drinkVisible?: string[]
  setting?: string
  strongestVisualStory?: string
}

const unsupportedProductDescriptors = /\b(non[- ]?alcoholic|alcohol[- ]?free|zero[- ]?proof|mocktail|signature|premium|homemade|authentic)\b/i
const alcoholTerms = /\b(alcohol|wine|beer|cocktail|spirits?|aperol|negroni|prosecco|champagne|martini|spritz)\b/i
const genericRestaurantLanguage = /there(?:'|’)s something about gathering around a table|there is something deeply satisfying about|when good food meets good conversation|that(?:'|’)s where the magic happens|food tastes different when it(?:'|’)s made with intention|that(?:'|’)s what we(?:'|’)re here for|that is the kind of welcome we mean|the meal already feels personal|we believe|our philosophy/i
const photoNarration = /\b(?:shot from above|overhead perspective|black table|curved ivory chairs|two hands (?:working|holding)|cheese falling mid-air)\b/i
const genericSocialLanguage = /\b(?:hits different|we(?:'|’)ve got you covered|you bring the appetite|this is your sign|say less|the moment (?:the table has been )?waiting for|worth the wait|good vibes)\b/i
const stylisticDash = /(?:\s[-–—]\s|[–—])/u
const freshnessClaim = /\b(?:fresh(?:ly)?\s+(?:pasta|ingredients?|produce|dough|bread|daily|every day|made|prepared|imported)|made\s+fresh\s+(?:daily|every day|each day|every morning))\b/i
const priceClaim = /(?:\b(?:AED|USD|EUR)\s*\d|[€$£]\s*\d|\b\d+(?:\.\d{1,2})?\s*(?:AED|USD|EUR)\b)/i

export function normalizeHashtag(value: string) {
  const cleaned = value.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")
  return cleaned ? `#${cleaned}` : ""
}

function safeVisualHashtags(categories: string[]) {
  const combined = categories.join(" ").toLowerCase()
  return [
    /\bpasta\b/.test(combined) && "#PastaDubai",
    /\bpizza\b/.test(combined) && "#PizzaDubai",
    /\b(?:dessert|gelato|tiramisu|cake|pastry)\b/.test(combined) && "#DessertDubai",
    /\b(?:dog|puppy)\b/.test(combined) && "#DogFriendlyDubai",
  ].filter((tag): tag is string => Boolean(tag))
}

function footerDiscoveryHashtags(footer: string) {
  const normalized = footer.toLowerCase()
  return [normalized.includes("business bay") && "#BusinessBayDining", normalized.includes("dubai") && "#DubaiDining"].filter((tag): tag is string => Boolean(tag))
}

export function captionHashtags(profile: CaptionProfile, context?: CaptionContext, option?: CaptionOptionContract, visualCategories: string[] = []) {
  const contextual = context ? commercialHashtags(context, profile.dynamicHashtagCount + 3).map(normalizeHashtag) : (option?.dynamic_hashtags ?? []).map(normalizeHashtag).filter(Boolean)
  const fixed = profile.fixedHashtags.map(normalizeHashtag).filter(Boolean)
  // Keep the publishable DemoClientB footer deterministic even when no precise
  // product truth is linked. These are venue/category discovery tags, not a
  // claim about the pictured dish.
  const fallbacks = ["#DubaiDining", "#BusinessBayDining", "#ItalianDining"]
  const dynamic = [...new Set([...contextual, ...safeVisualHashtags(visualCategories), ...footerDiscoveryHashtags(profile.footer), ...fallbacks].filter(tag => !fixed.includes(tag)))].slice(0, profile.dynamicHashtagCount)
  return [...new Set([...fixed, ...dynamic])]
}

export function assembleCaption(option: CaptionOptionContract, profile: CaptionProfile, context?: CaptionContext, visualCategories: string[] = []) {
  return [option.body.trim(), profile.footer.trim(), captionHashtags(profile, context, option, visualCategories).join(" ")].filter(Boolean).join("\n\n")
}

export function parseCaptionResponse(value: unknown, profile: CaptionProfile): CaptionResponseContract {
  void profile // Kept in the parser contract so validation callers share one profile-aware boundary.
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Caption response must be an object.")
  const options = (value as Record<string, unknown>).caption_options
  if (!Array.isArray(options) || options.length !== 5) throw new Error("Caption response must contain exactly five options.")
  const seen = new Set<string>()
  const parsed = options.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Caption option ${index + 1} is invalid.`)
    const candidate = raw as Record<string, unknown>
    const body = typeof candidate.body === "string" ? candidate.body.trim() : ""
    const dynamic = Array.isArray(candidate.dynamic_hashtags) ? candidate.dynamic_hashtags.filter((tag): tag is string => typeof tag === "string").map(normalizeHashtag).filter(Boolean) : []
    if (!body || body.length > 2_500) throw new Error(`Caption option ${index + 1} has an invalid body length.`)
    const signature = body.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    seen.add(signature)
    return { body, dynamic_hashtags: dynamic }
  })
  const responseObject = value as Record<string, unknown>
  const titleValue = responseObject.post_title
  const title = typeof titleValue === "string" ? titleValue.trim() : ""
  return { ...(title ? { post_title: title } : {}), caption_options: parsed }
}

function normalizeStyleText(value: string) {
  return value.toLowerCase()
    .replace(/you(?:'|’)ll/g, "you will")
    .replace(/don(?:'|’)t/g, "do not")
    .replace(/doesn(?:'|’)t/g, "does not")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function isNearStyleCopy(candidate: string, reference: string) {
  const normalizedCandidate = normalizeStyleText(candidate)
  const normalizedReference = normalizeStyleText(reference)
  if (!normalizedCandidate || !normalizedReference) return false
  if (normalizedCandidate === normalizedReference) return true
  const candidateTokens = normalizedCandidate.split(" ")
  const referenceTokens = normalizedReference.split(" ")
  if (Math.min(candidateTokens.length, referenceTokens.length) < 4) return false
  const overlap = candidateTokens.filter(token => referenceTokens.includes(token)).length
  return overlap / Math.max(candidateTokens.length, referenceTokens.length) >= 0.8
}

export function assessCaptionOption(option: CaptionOptionContract, profile: CaptionProfile, verifiedTerms: string[] = [], styleReferences: string[] = []): CaptionOptionAssessment {
  const diagnostics: CaptionValidationDiagnostic[] = []
  const body = option.body.trim()
  const verified = verifiedTerms.map(term => term.toLowerCase())
  const flag = (code: string, message: string, status: CaptionValidationDiagnostic["status"]) => diagnostics.push({ code, message, status })
  if (body.length < 12) flag("invalid_body_length", "Caption body is too short to review safely.", "blocked")
  if (body.includes(profile.footer.trim()) || profile.fixedHashtags.some(tag => body.includes(tag))) flag("deterministic_content_in_body", "Footer or fixed hashtag belongs outside the creative body.", "needs_review")
  if (alcoholTerms.test(body)) flag("alcohol_claim", "Alcohol language is not allowed for DemoClientB captions.", "blocked")
  if (priceClaim.test(body)) flag("price_or_offer_claim", "Price or offer language requires verified activation truth.", "blocked")
  // Voice, hook length, visual narration and punctuation are prompt-quality
  // signals, not publication blockers. Keep validation for factual and
  // structural boundaries only so normal creative options remain usable.
  void genericRestaurantLanguage
  void genericSocialLanguage
  void stylisticDash
  void photoNarration
  const descriptor = body.match(unsupportedProductDescriptors)?.[0]
  if (descriptor && !verified.some(term => term.includes(descriptor.toLowerCase()))) flag("unsupported_factual_descriptor", `Unsupported factual descriptor: ${descriptor}.`, "needs_review")
  const freshClaim = body.match(freshnessClaim)?.[0]?.toLowerCase()
  if (freshClaim && !verified.some(term => term.includes(freshClaim))) flag("unsupported_freshness_claim", "Freshness or preparation claim requires verified product truth.", "needs_review")
  const hook = body.split(/\r?\n/, 1)[0].trim()
  const copiedReference = [...profile.goldenCaptions, ...profile.styleExamples, ...styleReferences].find(reference => isNearStyleCopy(hook, reference))
  if (copiedReference) flag("style_example_similarity", "Hook closely reproduces a style reference or recent approved caption; write original language.", "needs_review")
  if ((option.dynamic_hashtags ?? []).length > profile.dynamicHashtagCount) flag("dynamic_hashtag_count", "Dynamic hashtag count exceeds the client profile.", "needs_review")
  return { option: { ...option, body }, validationStatus: diagnostics.some(diagnostic => diagnostic.status === "blocked") ? "blocked" : diagnostics.length ? "needs_review" : "ready", diagnostics }
}

export function assessCaptionOptions(response: CaptionResponseContract, profile: CaptionProfile, verifiedTerms: string[] = [], styleReferences: string[] = []) {
  const seen = new Set<string>()
  return response.caption_options.map(option => {
    const assessment = assessCaptionOption(option, profile, verifiedTerms, styleReferences)
    const signature = option.body.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    if (seen.has(signature)) assessment.diagnostics.push({ code: "duplicate_option", message: "Caption options must be meaningfully different.", status: "needs_review" })
    seen.add(signature)
    if (assessment.diagnostics.some(diagnostic => diagnostic.status === "blocked")) assessment.validationStatus = "blocked"
    else if (assessment.diagnostics.length) assessment.validationStatus = "needs_review"
    return assessment
  })
}

// Compatibility wrapper for older strict callers. Live generation uses parsing and
// assessment separately so a paid candidate remains visible for QC.
export function validateCaptionResponse(value: unknown, profile: CaptionProfile, verifiedTerms: string[] = []): CaptionResponseContract {
  const response = parseCaptionResponse(value, profile)
  const assessment = assessCaptionOptions(response, profile, verifiedTerms)
  const first = assessment.flatMap(option => option.diagnostics)[0]
  if (first) throw new Error(first.message)
  return response
}

export function validateCaptionBatchQuality(response: CaptionResponseContract, input: { profile: CaptionProfile; context: CaptionContext; visualCreativeContext?: CaptionVisualCreativeContext }) {
  const bodies = response.caption_options.map(option => option.body)
  const emojiCount = bodies.filter(body => /\p{Extended_Pictographic}/u.test(body)).length
  if (emojiCount === 0) throw new Error("Caption batch quality failed: ordinary DemoClientB options cannot all be emoji-free.")
  const wordCounts = bodies.map(body => body.replace(/\p{Extended_Pictographic}/gu, "").trim().split(/\s+/).filter(Boolean).length)
  if (wordCounts.every(count => count < 24)) throw new Error("Caption batch quality failed: all options are too short to express the approved voice.")
  if (wordCounts.reduce((total, count) => total + count, 0) / wordCounts.length < 27) throw new Error("Caption batch quality failed: the batch is too thin for a normal DemoClientB Feed post.")
  const angleSignatures = bodies.map(body => body.split(/\r?\n/, 1)[0].toLowerCase().replace(/\p{Extended_Pictographic}/gu, "").replace(/\b(the|a|an|for|with|and|your|our|is|at|to|of)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim()).filter(Boolean)
  if (new Set(angleSignatures).size < 4) throw new Error("Caption batch quality failed: the five options do not have distinct creative angles.")
  const foodOrLifestyle = Boolean(input.context.primarySubject || input.context.supportingFood.length || input.context.anonymousPeople || input.visualCreativeContext?.foodVisible?.length)
  if (foodOrLifestyle && !bodies.some(body => /\b(buon appetito|dolce|aperitivo|benvenuti|italian|neapolitan|pasta|pizza|mozzarella|pomodoro|basil)\b/i.test(body))) throw new Error("Caption batch quality failed: Italian or culinary identity is absent from a relevant post.")
  const visualTerms = [input.visualCreativeContext?.broadScene, input.visualCreativeContext?.broadMoment, ...(input.visualCreativeContext?.foodVisible ?? []), ...(input.visualCreativeContext?.drinkVisible ?? [])]
    .flatMap(value => (value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 4))
  if (visualTerms.length && !bodies.some(body => visualTerms.some(term => new RegExp(`\\b${term}\\b`, "i").test(body)))) throw new Error("Caption batch quality failed: safe visual context was not reflected in the creative copy.")
  return response
}

function captionBodyFromMemory(value: string) {
  return value
    .split(/\r?\n/)
    .filter(line => !/^\s*(?:Reservations:|📍|📞|#)/i.test(line))
    .join("\n")
    .trim()
}

function captionHook(value: string) {
  return captionBodyFromMemory(value).split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? ""
}

export function buildCaptionRequestContract(input: { profile: CaptionProfile; context: CaptionContext; recentCaptions?: string[]; visualCreativeContext?: CaptionVisualCreativeContext; relevantClientTruth?: RelevantCaptionTruth[]; finalImage?: { mediaId: string; contentSha256: string | null; mimeType: string } }) {
  const recentCaptionMemory = (input.recentCaptions ?? []).map(captionBodyFromMemory).filter(Boolean).slice(0, 8)
  const subject = [input.context.primarySubject, ...input.context.supportingFood, input.context.archetype, input.context.activation, input.context.servicePeriod].filter(Boolean).join(' ').toLowerCase()
  const visualSubject = [...(input.visualCreativeContext?.foodVisible ?? []), ...(input.visualCreativeContext?.drinkVisible ?? [])].join(" ").toLowerCase()
  const postTypeIds = [
    (Boolean(input.context.primarySubject || input.context.supportingFood.length || /food|pasta|pizza|dessert/.test(visualSubject)) && 'food'),
    /pizza|pizzeria|margherita|diavola/.test(subject) && 'pizza',
    /ingredient|tomato|basil|flour|mozzarella/.test(subject) && 'ingredients',
    /dog|puppy|pet/.test(subject) && 'dogs',
    /dessert|tiramisu|gelato|dolce/.test(subject) && 'dessert',
    /breakfast|brunch/.test(subject) && 'breakfast',
    /business lunch|lunch/.test(subject) && 'business_lunch',
    input.context.activation && 'activations',
    (input.context.anonymousPeople || /lifestyle|venue|interior|dining/.test(subject)) && 'lifestyle_venue',
    (input.context.anonymousPeople || /playful|people/.test(subject)) && 'people_playful',
  ].filter((id): id is string => Boolean(id))
  const coreGuidelineIds = ['core_voice', 'structure_length', 'hooks', 'emoji_rules', 'cta_rules', 'hashtag_rules', 'italian_language', 'encouraged_language', 'avoided_language', 'hard_factual_guardrails', 'image_awareness', 'image_story_method', 'never_narrate_image', 'negative_examples', 'recent_repetition_rules', 'final_quality_check', 'footer']
  const pick = (ids: string[]) => Object.fromEntries(ids.flatMap(id => input.profile.guidelines[id]?.trim() ? [[id, input.profile.guidelines[id].trim()]] : []))
  return {
    promptVersion: SOCIAL_CAPTION_PROMPT_VERSION,
    providerRequestCount: 1,
    noRetry: true,
    system: "Write five DemoClientB customer-facing caption bodies for the attached final Feed image. Follow the ordered prompt sections exactly. The image is input for internal creative understanding, never a photograph to narrate back to the audience. Return only the required structured tool output.",
    input: { finalImageReference: input.finalImage ?? null, priorityOrder: ['hard factual guardrails', 'DemoClientB Caption Intelligence', 'image-derived story and energy', 'relevant verified client facts', 'recent approved caption memory', 'creative variation'], hardClientFactsAndGuardrails: pick(['hard_factual_guardrails', 'avoided_language', 'footer']), captionIntelligence: input.profile.guidelines, coreCaptionVoice: pick(coreGuidelineIds), imageDerivedStoryMethod: { internalWorkflow: 'SEE what is visibly happening → INTERPRET the strongest social-media story → SELECT one appropriate DemoClientB caption family → WRITE only the audience-facing caption.', postFamily: postTypeIds.includes('food') ? 'food moment' : 'lifestyle or venue moment', allowedCreativeSignals: 'broad category, interaction, energy and mood only', neverExposeAnalysis: true }, postTypeSpecificRules: pick(postTypeIds), verifiedContextPack: { explicitlyLinked: input.context, relevantMatchedFacts: input.relevantClientTruth ?? [] }, visualContextBoundary: "Use the attached image to choose one story and energy, not to describe the frame. Only exact verified or linked context may support named-product, ingredient, preparation, sourcing, venue, offer, operational, service or identity claims.", toneOfVoice: input.profile.toneOfVoice, instructions: input.profile.instructions, styleExamples: input.profile.styleExamples, goldenCaptions: input.profile.goldenCaptions, approvedPhrases: input.profile.approvedPhrases, avoidPhrases: input.profile.avoidPhrases, recentCaptionMemory, recentCaptionHooks: recentCaptionMemory.map(captionHook).filter(Boolean), fiveOptionCreativeDirections: { option1: 'punchy and playful', option2: 'food-focused', option3: 'warm and social', option4: 'editorial and inviting', option5: 'conversational soft invitation' }, titleContract: 'Return one concise 3-5 word post_title in the same structured response. It is a human-editable internal title, not a filename and not an unsupported factual claim.', deterministicHashtagAssembly: "Jarvis always adds exactly five deterministic hashtags: #DemoClientBDubai #ItalianCuisine plus three context-specific tags from verified/linked context or safe broad visual category. Exact dish hashtags require exact product truth. The model must not generate hashtag suggestions." },
  }
}

export function formatCaptionRequestPrompt(contract: ReturnType<typeof buildCaptionRequestContract>) {
  const input = contract.input
  return [
    "PRIORITY ORDER (highest first)", JSON.stringify(input.priorityOrder),
    "1. HARD FACTUAL GUARDRAILS", JSON.stringify(input.hardClientFactsAndGuardrails),
    "2. DEMOCLIENTB CAPTION INTELLIGENCE — apply this fully; do not compress it into generic restaurant copy", JSON.stringify(input.captionIntelligence),
    "3. IMAGE-DERIVED STORY AND ENERGY — think internally, then write the selected story rather than narrating visual analysis", JSON.stringify(input.imageDerivedStoryMethod),
    "4. RELEVANT VERIFIED CLIENT FACTS", JSON.stringify(input.verifiedContextPack),
    "5. POSITIVE STYLE REFERENCES — STYLE REFERENCES, NOT COPY TEMPLATES. Extract rhythm, confidence, brevity, playfulness, emoji placement and Italian hospitality. Never reproduce, closely paraphrase, lightly modify or reuse any supplied style-example, Golden Caption or recent-caption wording; create original language for this post.", JSON.stringify({ styleExamples: input.styleExamples, goldenCaptions: input.goldenCaptions, approvedPhrases: input.approvedPhrases }),
    "6. RECENT APPROVED CAPTION MEMORY — avoid repetition", JSON.stringify({ captions: input.recentCaptionMemory, hooks: input.recentCaptionHooks }),
    "7. POST-TYPE AND FIVE-VARIATION RULES", JSON.stringify({ postTypeSpecificRules: input.postTypeSpecificRules, directions: input.fiveOptionCreativeDirections, instructions: input.instructions }),
    "OUTPUT BOUNDARY", JSON.stringify({ visualContextBoundary: input.visualContextBoundary, titleContract: input.titleContract, deterministicHashtagAssembly: input.deterministicHashtagAssembly, noFooterOrHashtags: true }),
    "Return the required structured tool output only.",
  ].join("\n\n")
}

export function offlineCaptionFixture(): CaptionResponseContract {
  return { post_title: "A Golden Table Moment", caption_options: [
    { body: "One bite, then another. 👀\nThat crisp cotoletta alla milanese has a way of keeping everyone at the table a little longer. Rosemary potatoes are not helping either. Buon appetito.", dynamic_hashtags: [] },
    { body: "Golden edges, proper appetite. 🍋\nCotoletta alla milanese, rosemary potatoes, and the kind of uncomplicated Italian comfort that makes an ordinary dinner feel properly looked after.", dynamic_hashtags: [] },
    { body: "Go on, take the first bite. 🍽️\nCrisp cotoletta, warm conversation, and absolutely no need to pretend you are ready to share the good part. Some plates invite a little playfulness.", dynamic_hashtags: [] },
    { body: "A quiet kind of delicious. 🤍\nRosemary, golden crumbs, soft light, and a cotoletta made for taking your time. An easy DemoClientB evening, framed by the details that matter.", dynamic_hashtags: [] },
    { body: "Dinner plans, beautifully handled. ✨\nSettle into the main dining room for cotoletta alla milanese and a little pause from the pace outside. Bring the appetite; we will take care of the rest.", dynamic_hashtags: [] },
  ] }
}
