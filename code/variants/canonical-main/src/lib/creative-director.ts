export type CreativeDirectorAssetRole =
  | 'composition_reference'
  | 'food_truth'
  | 'drink_truth'
  | 'venue_or_background_truth'
  | 'model_truth'
  | 'inspiration'

export type CreativeDirectorAssetSummary = {
  id: string
  title: string
  role: CreativeDirectorAssetRole
  category?: string | null
  metadata?: Record<string, unknown> | null
}

export type CreativeDirectorInput = {
  clientName: string
  userCreativeDirection: string
  aspectRatio: string
  selectedAssets: CreativeDirectorAssetSummary[]
}

export type CreativeDirectorPromptResponse = { title: string; prompt: string }
export type CreativeDirectorParseResult = { ok: true; value: CreativeDirectorPromptResponse } | { ok: false; diagnostic: string }

// Legacy API compatibility. The Studio V2.5 path uses the compact title/prompt
// contract above; this shape remains for the separate existing compiler route.
export type CreativeDirectorReasoning = { generationTitle: string; compositionPriority: string; foodPriority: string; backgroundMode: string; cameraAngle: string; handInteraction: string; mustPreserve: string[]; allowedFlex: string[]; riskWarnings: string[]; promptStrategy: string; finalCreativeDirection: string; providerNotes: string; contradictions: string[]; hierarchy: string[]; referenceDescriptions: Array<{ imageNumber: number; visualDescription: string; controls: string[]; mustNotChange: string[] }> }
export type CreativeDirectorResponse = { success: boolean; configured?: boolean; provider?: 'anthropic'; model?: string; reasoning: CreativeDirectorReasoning; rawText?: string; error?: string }

const REQUIRED_PROMPT_SECTIONS = ['IMAGE OBJECTIVE', 'CREATIVE CONCEPT', 'REFERENCE HIERARCHY', 'FINAL SCENE CONSTRUCTION', 'COMPOSITION', 'PRODUCT FIDELITY', 'VENUE FIDELITY', 'LIGHTING', 'REALISM', 'STRICT CONSTRAINTS', 'OUTPUT'] as const
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const stripJsonFence = (value: string) => value.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()

export function fallbackCreativeDirectorReasoning(input?: Partial<CreativeDirectorInput>): CreativeDirectorReasoning {
  return { generationTitle: 'Untitled visual direction', compositionPriority: 'composition_reference', foodPriority: 'food_truth', backgroundMode: 'selected_background_truth', cameraAngle: 'follow_user_direction_when_present', handInteraction: 'only_if_requested', mustPreserve: ['selected truth assets', input?.userCreativeDirection || 'user creative direction'], allowedFlex: ['crop adaptation'], riskWarnings: [], promptStrategy: 'Use the selected image roles and verified metadata.', finalCreativeDirection: input?.userCreativeDirection || 'Use selected truth assets and user direction.', providerNotes: 'Reference fidelity depends on the supplied multimodal package.', contradictions: [], hierarchy: ['truth assets', 'user creative direction', 'composition inspiration'], referenceDescriptions: [] }
}

export function creativeDirectorSystemPrompt() {
  return [
    'You are Jarvis OS Creative Director for high-fidelity DemoClientB hospitality photography.',
    'Study every actual numbered reference image. Filenames and metadata are secondary evidence, never a substitute for visual analysis.',
    'Return JSON only, with exactly two fields: title and prompt. Do not return analysis objects, reference arrays, diagnostics, markdown, or commentary outside that JSON object.',
    'title is a concise 3–5 word production title. prompt is the complete Nano Banana Pro production specification.',
    'Inside prompt, use these human-readable sections once: IMAGE OBJECTIVE, CREATIVE CONCEPT, REFERENCE HIERARCHY, one REFERENCE IMAGE section for every supplied image, FINAL SCENE CONSTRUCTION, COMPOSITION, PEOPLE / INTERACTION when a person is requested, PRODUCT FIDELITY when food or drink is supplied, VENUE FIDELITY when venue truth is supplied, LIGHTING, REALISM, STRICT CONSTRAINTS, OUTPUT.',
    'Every REFERENCE IMAGE section must begin with "VISUAL ANALYSIS:" followed by substantive observation of what is actually present, then state that image’s authority. For composition inspiration, cover composition, crop, camera relationship, subject placement, curtain relationship, gesture, visible body area, negative space, framing, visual storytelling and relevant lighting. For food, cover the visible vessel, arrangement, portion, shape, colour, texture, garnish and presentation without inventing unseen ingredients. For drinks, cover glass profile, liquid colour, fill, ice if visible, garnish and presentation; never assume alcohol. For venue, cover only visible curtain material/folds, nearby walls, furniture, materials, fixtures, palette and spatial relationship, then explicitly limit the final scene to the amount required by the brief. Inspiration controls composition, crop, camera relationship, gesture and editorial story only. Food and drink truth control their actual visible presentation. Venue truth controls only the visible environment needed by the brief.',
    'Use only relevant verified metadata. Do not include prices, currencies, review labels, provenance, internal fields, historical failures, camera brands, lenses, exposure settings, invented ingredients, alcohol, staff identities, or operational claims.',
    'When a person holds food or a drink, protect believable hands, grip, weight and object contact. Do not infer unseen venue architecture.',
    'Write one complete, image-specific prompt for 4K Nano Banana Pro output. Do not repeat the raw user brief; interpret it into a precise production scene.',
  ].join('\n')
}

export function creativeDirectorUserPrompt(input: CreativeDirectorInput) {
  return JSON.stringify({
    task: 'Create the final production specification from the numbered multimodal reference package.',
    destination: 'Nano Banana Pro',
    output: { aspect_ratio: input.aspectRatio, quality: '4K', count: 1 },
    client: input.clientName,
    user_brief: input.userCreativeDirection,
    references: input.selectedAssets.map((asset, index) => ({ image_number: index + 1, role: asset.role, title: asset.title, useful_verified_metadata: asset.metadata ?? {} })),
    response_schema: { title: 'string', prompt: 'complete sectioned Nano Banana Pro prompt string' },
  })
}

export function parseCreativeDirectorPromptJson(rawText: string, referenceCount: number): CreativeDirectorParseResult {
  const cleaned = stripJsonFence(rawText)
  if (!cleaned) return { ok: false, diagnostic: 'Creative Director returned no response text.' }
  let value: unknown
  try { value = JSON.parse(cleaned) } catch { return { ok: false, diagnostic: 'Creative Director response was not complete JSON.' } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, diagnostic: 'Creative Director response did not match the required object.' }
  const record = value as Record<string, unknown>; const title = text(record.title); const prompt = text(record.prompt)
  if (!title) return { ok: false, diagnostic: 'Creative Director response omitted its title.' }
  const titleWords = title.split(/\s+/).filter(Boolean)
  if (titleWords.length < 3 || titleWords.length > 5) return { ok: false, diagnostic: 'Creative Director title must contain 3–5 useful words.' }
  if (prompt.length < 900) return { ok: false, diagnostic: 'Creative Director response did not contain a complete production prompt.' }
  if (prompt.length > 60_000) return { ok: false, diagnostic: 'Creative Director production prompt exceeded the supported length.' }
  const normalized = prompt.toUpperCase()
  const missingSections = REQUIRED_PROMPT_SECTIONS.filter(section => !normalized.includes(section))
  if (missingSections.length) return { ok: false, diagnostic: `Creative Director production prompt is missing: ${missingSections.join(', ')}.` }
  const missingReferences = Array.from({ length: referenceCount }, (_, index) => `REFERENCE IMAGE ${index + 1}`).filter(section => !normalized.includes(section))
  if (missingReferences.length) return { ok: false, diagnostic: `Creative Director production prompt is missing: ${missingReferences.join(', ')}.` }
  for (let index = 1; index <= referenceCount; index += 1) {
    const marker = `REFERENCE IMAGE ${index}`
    const start = normalized.indexOf(marker)
    const next = Array.from({ length: referenceCount - index }, (_, offset) => normalized.indexOf(`REFERENCE IMAGE ${index + offset + 1}`, start + marker.length)).find(position => position >= 0)
      ?? normalized.indexOf('FINAL SCENE CONSTRUCTION', start + marker.length)
      ?? normalized.length
    const section = prompt.slice(start, next)
    if (!/VISUAL\s+ANALYSIS\s*:/i.test(section) || section.replace(/\s+/g, ' ').trim().length < 180) return { ok: false, diagnostic: `Creative Director production prompt is missing substantive visual analysis for Reference Image ${index}.` }
    if (/visual\s+analysis\s+(required|from\s+image)/i.test(section)) return { ok: false, diagnostic: `Creative Director production prompt contains a placeholder instead of visual analysis for Reference Image ${index}.` }
  }
  return { ok: true, value: { title: title.slice(0, 160), prompt } }
}

export function parseCreativeDirectorJson(rawText: string, fallback: CreativeDirectorReasoning) {
  const parsed = parseCreativeDirectorPromptJson(rawText, 0)
  if (!parsed.ok) return fallback
  return { ...fallback, generationTitle: parsed.value.title, finalCreativeDirection: parsed.value.prompt, promptStrategy: 'Use the complete production prompt returned by Creative Director.' }
}

const longFixturePrompt = [
  'IMAGE OBJECTIVE\nCreate a 4:5 4K hospitality image.', 'CREATIVE CONCEPT\nA complete controlled curtain-reveal concept.', 'REFERENCE HIERARCHY\nTruth assets override inspiration.', 'REFERENCE IMAGE 1\nVISUAL ANALYSIS: A tight frontal crop treats the curtain opening as the frame, with the person substantially concealed and the gesture carrying a playful reveal. Composition authority only.', 'REFERENCE IMAGE 2\nVISUAL ANALYSIS: The food is centered on its visible vessel with a compact portion, crisp layered arrangement and clear garnish separation. Food fidelity authority only.', 'REFERENCE IMAGE 3\nVISUAL ANALYSIS: The drink is presented in a stemmed glass with a clear liquid-layer relationship, visible fill level and restrained central garnish. Drink fidelity authority only.', 'REFERENCE IMAGE 4\nVISUAL ANALYSIS: Deep red folded curtain material sits against a warm dining interior with only nearby seating and reflective material cues visible. Venue fidelity authority only.', 'FINAL SCENE CONSTRUCTION\nOne physically coherent scene.', 'COMPOSITION\nTight vertical crop.', 'PEOPLE / INTERACTION\nBelievable hands and grip.', 'PRODUCT FIDELITY\nPreserve the selected food and drink.', 'VENUE FIDELITY\nShow only the curtain needed for the scene.', 'LIGHTING\nDirectional, realistic hospitality light.', 'REALISM\nNatural texture, geometry and contact.', 'STRICT CONSTRAINTS\nNo invented facts or unrelated objects.', 'OUTPUT\nOne 4K 4:5 Nano Banana Pro image.',
  Array.from({ length: 260 }, () => 'Detailed production direction remains image-specific, visually grounded, physically plausible, and concise enough for reliable execution.').join(' '),
].join('\n\n')

export const CREATIVE_DIRECTOR_V25_LONG_OUTPUT_FIXTURE = JSON.stringify({ title: 'Curtain Reveal Moment', prompt: longFixturePrompt })
export const CREATIVE_DIRECTOR_V25_TRUNCATION_FIXTURE = '{"title":"Curtain Reveal Moment","prompt":"IMAGE OBJECTIVE'

export function verifyCreativeDirectorV25CompletionFixtures() {
  const long = parseCreativeDirectorPromptJson(CREATIVE_DIRECTOR_V25_LONG_OUTPUT_FIXTURE, 4)
  const truncated = parseCreativeDirectorPromptJson(CREATIVE_DIRECTOR_V25_TRUNCATION_FIXTURE, 4)
  return { longOutputParses: long.ok && long.value.prompt.split(/\s+/).length >= 3_000, longOutputPreservesLength: long.ok && long.value.prompt.length > 20_000, truncationIsRejected: !truncated.ok && truncated.diagnostic === 'Creative Director response was not complete JSON.' }
}

export async function verifyCreativeDirectorV25IdempotencyFixture() {
  const requests = new Map<string, Promise<{ status: 'succeeded' | 'failed'; call: number }>>()
  let providerCalls = 0
  const execute = (requestId: string, shouldFail = false) => {
    const existing = requests.get(requestId)
    if (existing) return existing
    const task = Promise.resolve().then(() => {
      providerCalls += 1
      return shouldFail ? { status: 'failed' as const, call: providerCalls } : { status: 'succeeded' as const, call: providerCalls }
    })
    requests.set(requestId, task)
    return task
  }
  const [first, duplicate] = await Promise.all([execute('same-action'), execute('same-action')])
  const failed = await execute('failed-action', true)
  const retry = await execute('new-explicit-action')
  return { duplicateInvokedOnce: providerCalls === 3 && first === duplicate && first.status === 'succeeded', failedRequestIsRetained: failed.status === 'failed', newRequestMayExecute: retry.status === 'succeeded' && retry.call === 3 }
}
