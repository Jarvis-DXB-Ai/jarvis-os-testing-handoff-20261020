import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  buildCameraRulePrompt,
  buildLockedScenePlatePrompt,
  buildProviderGuidancePrompt,
  buildStrictNegativePrompt,
  compositionFidelityPercent,
  normalizeCompositionFidelityMode,
} from '@/lib/environment-preservation'
import { buildClientGenerationQaPrompt, buildDemoClientDVenueZonePrompt } from '@/lib/generation-qa-rules'
import { buildPastFailureCorrectionBlock, buildPermanentPromptV2LearningBlock } from '@/lib/generation-mistake-memory'
import { buildDemoClientBVenueLockBlock, buildDemoClientBVenueMemoryBlock, buildDemoClientBVenueScaleLockBlock, buildSubjectPlacementLockBlock, isDemoClientBClient } from '@/lib/client-venue-truth'
import {
  NANO_BANANA_PROVIDER_CAPABILITIES,
  generationWorkflowModeLabel,
  normalizeGenerationWorkflowMode,
  strictScenePlateUnsupported,
} from '@/lib/provider-capabilities'
import {
  buildCompactSimplifiedInteriorVenueTruthSummary,
  buildCompactVenueSpatialSummary,
  buildSimplifiedInteriorVenueTruthPrompt,
  buildVenueSpatialPrompt,
  missingVenueSpatialMetadataFields as missingVenueSpatialMetadataFieldsFromAsset,
  resolveVenueSpatialMetadataList,
} from '@/lib/venue-spatial-metadata'

type GeminiInlineData = {
  mimeType?: string
  mime_type?: string
  data?: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
    finishReason?: string
    finish_reason?: string
  }>
  promptFeedback?: unknown
  usageMetadata?: unknown
  error?: {
    message?: string
    status?: string
    code?: number
  }
}

type ReferenceAsset = {
  id: string
  file_name: string
  asset_category: string | null
  file_path: string | null
  optimized_file_path: string | null
  ai_preview_path: string | null
  extracted_summary?: string | null
  metadata?: unknown
}

type GuestModelRow = {
  id: string
  name: string | null
  model_references: unknown
}

type AiModelRow = {
  id: string
  model_name: string | null
}

type AiModelAssetRow = {
  id: string
  model_id: string
  asset_type: string
  image_url: string | null
  storage_path: string | null
  version_number: number
}

type TimeOfDay = 'Morning' | 'Midday' | 'Evening'

type GuestModelOutfitPayload = {
  model_id: string
  model_name?: string
  storage_path: string | null
  public_url: string | null
  label: string
  set_name: string
  time_of_day: TimeOfDay
}

type GuestModelAccessoryPayload = {
  model_id: string
  model_name?: string
  storage_path: string | null
  public_url: string | null
  label: string
  details?: string
}

type VisualDNAValues = {
  camera_identity?: string
  primary_lenses?: string
  depth_of_field?: string
  lighting_rules?: string
  color_science?: string
  skin_realism?: string
  composition_rules?: string
  motion_rules?: string
  night_scene_rules?: string
  avoid_list?: string
}

type ReferenceGroupKey = 'venue' | 'service' | 'food' | 'drink' | 'model' | 'pinterest' | 'legacy' | 'guest_model_outfit' | 'guest_model_accessory'

type ReferenceGroup = {
  key: ReferenceGroupKey
  label: string
  ids: string[]
  allowedCategories: Set<string>
  promptInstruction: string
}

type PayloadDebugReference = {
  order?: number
  role: ReferenceGroupKey
  owner?: string | null
  id: string
  label: string
  provider_label?: string
  source: string
  storage_path?: string | null
  transport?: 'inline_base64' | 'url' | 'planned' | null
  provider_acceptance?: string | null
  mime_type?: string | null
  byte_size?: number | null
  download_succeeded: boolean
  failure?: string | null
}

type PromptCompressionDebug = {
  mode: 'none' | 'dedupe' | 'priority' | 'truth_first'
  max_chars: number
  original_length: number
  final_length: number
  savings_percent: number
  largest_sections: Array<{ title: string; chars: number }>
  sections_preserved: string[]
  sections_shortened: string[]
  sections_dropped: string[]
  protected_sections?: string[]
  priority_ranking?: Array<{ title: string; tier: string; protected: boolean }>
}

type ProviderReferencePart = {
  label: string
  inlineData: {
    mimeType: string
    data: string
  }
}

const REFERENCE_ROLE_RANK: Record<ReferenceGroupKey, number> = {
  venue: 10,
  model: 20,
  guest_model_outfit: 30,
  guest_model_accessory: 40,
  food: 50,
  drink: 60,
  service: 70,
  pinterest: 80,
  legacy: 80,
}

const REFERENCE_REBUILD_ROLE_RANK: Record<ReferenceGroupKey, number> = {
  pinterest: 10,
  food: 20,
  drink: 25,
  venue: 30,
  service: 40,
  model: 50,
  guest_model_outfit: 60,
  guest_model_accessory: 70,
  legacy: 90,
}

type ProviderAttempt = {
  quality: 'standard' | '4k'
  imageSize: '1K' | '4K'
  response: Response
  providerResponse: GeminiResponse
  latencyMs: number
}

const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const CLIENT_ASSETS_BUCKET = 'client-assets'
const GUEST_MODELS_BUCKET = 'guest-models'
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
const PROVIDER_TIMEOUT_MS = 120000
const MODEL_REFERENCE_CATEGORIES = ['guest_models', 'guest models', 'models', 'model', 'people', 'person', 'portraits', 'portrait', 'lifestyle', 'venue_outfits', 'venue outfits', 'staff']
const FOOD_REFERENCE_CATEGORIES = ['food', 'breakfast', 'food_studio_shots']
const DRINK_REFERENCE_CATEGORIES = ['drinks', 'drink_studio_shots']
const REFERENCE_REBUILD_FOOD_CATEGORIES = ['food_studio_shots']
const REFERENCE_REBUILD_DRINK_CATEGORIES = ['drink_studio_shots']
const REFERENCE_REBUILD_SURFACE_CATEGORIES = ['background_presets']
const INDOOR_VENUE_REFERENCE_CATEGORIES = ['interiors', 'interior', 'dining_room', 'restaurant_interior', 'indoor_venue', 'venue_interior', 'table_setting', 'private_dining', 'bar_interior']
const OUTDOOR_VENUE_REFERENCE_CATEGORIES = ['exteriors', 'exterior', 'outdoor', 'terrace', 'facade', 'street_view']
const VENUE_FIDELITY_MODES = ['Creative', 'Balanced', 'Strict', 'Source-Locked'] as const
const COMPOSITION_INTENTS = ['Source-matched', 'Intimate dining crop', 'Editorial medium shot', 'Detail/product focus', 'Architectural hero'] as const
const BACKGROUND_GUEST_OPTIONS = ['None', 'Sparse', 'Natural', 'Busy'] as const
const BACKGROUND_ACCURACY_OPTIONS = ['Flexible', 'Anchored', 'Source-Locked'] as const
const MAX_PROMPT_CHARS = 11000
const PRODUCT_MAX_PROMPT_CHARS = 11000
const PROMPT_TARGET_CHARS = 10500
const PROMPT_WARNING_CHARS = 9000
const PROMPT_HIGH_RISK_CHARS = 10500
const ASSIGNMENT_TARGETS = new Set(['Marco', 'Sofia', 'Shared'])

const LOCATION_RULES: Record<string, string> = {
  Interior: 'Use only interior venue context and interior venue references. Do not mix exterior terrace architecture into the scene.',
  Exterior: 'Use only exterior venue context and exterior venue references. Do not mix indoor dining or bar architecture into the scene.',
}

const TIME_OF_DAY_RULES: Record<TimeOfDay, string> = {
  Morning: 'Morning controls lighting and styling: clean natural daylight, soft contrast, brighter reflections, luxury breakfast atmosphere, relaxed polished wardrobe, calmer guest density, and fresh hospitality energy.',
  Midday: 'Midday controls lighting and styling: clean daytime light, lunch or business-lunch atmosphere, refined casual or professional wardrobe, and composed daytime energy.',
  Evening: 'Evening controls lighting and styling: warm amber dinner/cocktail/night light, refined evening wardrobe, premium social mood, and luxury night atmosphere.',
}

const ACTIVATION_RULES: Record<string, string> = {
  None: 'No offer, event, or promotion language. Create a clean evergreen campaign visual.',
  Breakfast: 'Breakfast service context: prioritize coffee, pastries, egg dishes, breakfast plates, juice/coffee setups, clean daylight, relaxed luxury breakfast styling, and premium cafe/brunch editorial mood.',
  'Business Lunch': 'Business lunch context: professional DIFC dining moment, efficient service, and polished table use.',
  Lunch: 'Lunch context: refined daytime hospitality and relaxed dining service.',
  Dinner: 'Dinner context: elevated table service, premium dining mood, and refined social hospitality.',
  'Cocktail Hour': 'Cocktail-hour context: drink-forward social moment with refined glassware and bar or terrace energy.',
  'Late Night': 'Late-night context: social dining, cocktail, or shisha energy where appropriate; never nightclub styling.',
  Shisha: 'Relaxed premium lounge energy with shisha only when requested or visible in references; keep it elegant and realistic.',
  'Traffic Hours': 'Peak restaurant movement and atmosphere, credible guest flow, service energy, and occupied-but-not-chaotic venue feel.',
  'Dubai Restaurant Week': 'Premium dining promotion energy with food/table clarity and refined hospitality styling; avoid cheap offer graphics.',
}

const VENUE_FIDELITY_RULES: Record<typeof VENUE_FIDELITY_MODES[number], string[]> = {
  Creative: [
    'Allow a plausible new angle while preserving the real venue identity, furniture family, materials, and lighting logic.',
  ],
  Balanced: [
    'Allow minor recomposition while keeping selected venue image cues recognizable.',
  ],
  Strict: [
    'Selected venue image is the primary visual truth.',
    'Do not invent unseen terrace/interior areas or rebuild the venue from text.',
    'Place guests within the visible venue/table context of the selected reference.',
  ],
  'Source-Locked': [
    'Use the selected venue image as the visual truth.',
    'Stay close to the selected venue reference.',
    'Recompose only by cropping, subject placement, and depth.',
    'If the selected venue image does not show an object or angle clearly, avoid inventing it.',
  ],
}

const COMPOSITION_INTENT_RULES: Record<typeof COMPOSITION_INTENTS[number], string> = {
  'Source-matched': 'Use the selected venue image as the visual authority, with cropping and subject placement only.',
  'Intimate dining crop': 'Create intimacy through a tighter crop, foreground depth, and subject placement within the visible venue/table context.',
  'Editorial medium shot': 'Use a polished medium editorial composition while keeping venue image truth primary.',
  'Detail/product focus': 'Prioritize the selected food/drink/product detail while keeping the venue/table context faithful to the selected reference.',
  'Architectural hero': 'Let the selected venue image dominate; text only clarifies visible features.',
}

const BACKGROUND_GUEST_RULES: Record<typeof BACKGROUND_GUEST_OPTIONS[number], string> = {
  None: 'No extra background guests or background people.',
  Sparse: 'Allow max 0-3 subtle background guests, only if they feel natural and do not distract.',
  Natural: 'Use believable low restaurant occupancy with a few understated background guests.',
  Busy: 'Use fuller restaurant occupancy while staying realistic, premium, and not overcrowded.',
}

// Long-term venue fidelity needs environment memory/spatial notes and possibly background-preserving edits, not only prompt pressure.
const BACKGROUND_ACCURACY_RULES: Record<typeof BACKGROUND_ACCURACY_OPTIONS[number], string[]> = {
  Flexible: [
    'Creative recomposition is allowed, but DemoClientD venue identity, materials, lighting, and furniture families must remain recognizable.',
  ],
  Anchored: [
    'Use the selected venue image as the environment anchor.',
    'Preserve visible background, materials, lighting, table surface, and seating cues.',
    'Insert subjects, food, and drinks into the anchored environment without replacing the venue.',
  ],
  'Source-Locked': [
    'Use the selected venue image as the background source of truth.',
    'Stay close to the selected venue image; text only clarifies visible details.',
    'Recompose only through cropping, subject placement, depth of field, and foreground action; do not regenerate a new restaurant background.',
  ],
}

const OCCASION_RULES: Record<string, string> = {
  Breakfast: 'Breakfast occasion: softer morning energy, refined casual wardrobe, fresh table context, warm daylight or gentle indoor morning light, relaxed guest mood.',
  'Business Lunch': 'Business lunch occasion: polished corporate energy, smart tailoring, efficient table setting, lunch service realism, composed professional guest mood.',
  Lunch: 'Lunch occasion: brighter hospitality energy, smart casual wardrobe, fresh food/table context, natural daytime light, relaxed social guest mood.',
  Sunset: 'Sunset occasion: golden-hour warmth, elegant transition-to-evening wardrobe, terrace glow, cinematic reflections, calm anticipatory guest mood.',
  Dinner: 'Dinner occasion: elevated evening wardrobe, premium table setting, warm practical lighting, intimate dining energy, composed luxury guest mood.',
  'Late Night': 'Late-night occasion: darker cinematic mood, cocktail/shisha energy where appropriate, refined nightlife wardrobe, warm bar/terrace glow, never nightclub lighting.',
}

const CAMPAIGN_MODE_RULES: Record<string, string> = {
  'Dinner Campaign': 'Dinner campaign: composed social dining scene, elegant guests if people are included, warm table intimacy, venue atmosphere supports the food and hospitality story.',
  'Business Lunch': 'Business lunch campaign: polished daytime DIFC business audience, efficient lunch setting, professional wardrobe, food/table clarity, architecture secondary.',
  'Breakfast Promotion': 'Breakfast promotion: morning hospitality, breakfast table context, coffee/tea energy, calmer guest mood, brighter natural light.',
  'Cocktail Campaign': 'Cocktail campaign: drink-forward composition, glassware and bar/terrace ambience, refined social energy, avoid cheap nightlife cues.',
  'Terrace Nightlife': 'Terrace nightlife: exterior terrace atmosphere, warm late-night social energy, cocktails or shisha if prompted, premium not nightclub.',
  'Couple Dining': 'Couple dining: natural chemistry, two guests seated or interacting subtly, food and venue remain credible and not overpowered by people.',
  'Group Dining': 'Group dining: small premium social group, relaxed DIFC hospitality energy, table context and venue continuity remain visible.',
  'Food Hero': 'Food hero: dish is central subject, venue atmosphere supports in background, shallow depth, realistic plating, no invented menu items.',
  'Drink Hero': 'Drink hero: cocktail/beverage is central subject, glass and garnish realism, refined bar or terrace atmosphere, no invented drink branding.',
  'Editorial Venue Shot': 'Editorial venue shot: architecture, furniture, material palette, lighting, and spatial identity dominate; people optional or absent.',
  'Paid Ad Creative': 'Paid ad creative: clear campaign subject, premium but direct composition, enough clean negative space for future copy placement.',
  'Instagram Carousel Cover': 'Instagram carousel cover: strong first-frame composition, premium subject clarity, vertical/social crop awareness, immediate venue identity.',
  'Reels Cover': 'Reels cover: cinematic still-frame energy, strong subject silhouette, vertical crop clarity, readable social cover composition.',
}

const GUEST_ARCHETYPE_RULES: Record<string, string> = {
  Marco: 'Marco: refined European male guest, early/mid 30s, elegant but relaxed dinner outfit, premium casual style, natural confidence, DIFC dinner appropriate.',
  Sofia: 'Sofia: sophisticated female guest, late 20s/early 30s, elegant modern evening outfit, refined luxury style, natural not over-glamorous, premium hospitality appropriate.',
  'DIFC Business Professional': 'DIFC Business Professional: polished professional, smart business attire, suitable for business lunch or after-work drinks.',
  'Luxury Dinner Couple': 'Luxury Dinner Couple: elegant couple, premium evening styling, romantic but natural, suitable for dinner campaigns.',
  'After-Work Group': 'After-Work Group: small stylish group of DIFC professionals, cocktail/social energy, premium but relaxed.',
  'No People': 'No People: architecture, food, drink, and venue atmosphere only. Do not add human subjects.',
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function idsFrom(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, limit)
    : []
}

function outfitRefsFrom(value: unknown, limit: number): GuestModelOutfitPayload[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((item): GuestModelOutfitPayload | null => {
      const modelId = typeof item.model_id === 'string' ? item.model_id : ''
      const timeOfDay = item.time_of_day === 'Morning' || item.time_of_day === 'Midday' || item.time_of_day === 'Evening'
        ? item.time_of_day
        : 'Evening'
      if (!modelId) return null
      return {
        model_id: modelId,
        model_name: typeof item.model_name === 'string' && item.model_name.length > 0 ? item.model_name : undefined,
        storage_path: typeof item.storage_path === 'string' && item.storage_path.length > 0 ? item.storage_path : null,
        public_url: typeof item.public_url === 'string' && item.public_url.length > 0 ? item.public_url : null,
        label: typeof item.label === 'string' && item.label.length > 0 ? item.label : 'Guest outfit reference',
        set_name: typeof item.set_name === 'string' && item.set_name.length > 0 ? item.set_name : 'Outfit set',
        time_of_day: timeOfDay,
      }
    })
    .filter((item): item is GuestModelOutfitPayload => Boolean(item))
    .slice(0, limit)
}

function accessoryRefsFrom(value: unknown, limit: number): GuestModelAccessoryPayload[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((item): GuestModelAccessoryPayload | null => {
      const modelId = typeof item.model_id === 'string' ? item.model_id : ''
      if (!modelId) return null
      return {
        model_id: modelId,
        model_name: typeof item.model_name === 'string' && item.model_name.length > 0 ? item.model_name : undefined,
        storage_path: typeof item.storage_path === 'string' && item.storage_path.length > 0 ? item.storage_path : null,
        public_url: typeof item.public_url === 'string' && item.public_url.length > 0 ? item.public_url : null,
        label: typeof item.label === 'string' && item.label.length > 0 ? item.label : 'Accessory reference',
        details: typeof item.details === 'string' && item.details.length > 0 ? item.details : undefined,
      }
    })
    .filter((item): item is GuestModelAccessoryPayload => Boolean(item))
    .slice(0, limit)
}

function normalizeCategory(category: string | null | undefined) {
  return (category ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function categoryAllowed(assetCategory: string | null, allowedCategories: Set<string>) {
  const normalized = normalizeCategory(assetCategory)
  return Array.from(allowedCategories).some(category => normalizeCategory(category) === normalized)
}

function assignmentsFrom(value: unknown) {
  if (!isRecord(value)) return new Map<string, string>()
  const entries = Object.entries(value)
    .filter(([key, item]) => key && typeof item === 'string' && ASSIGNMENT_TARGETS.has(item))
    .map(([key, item]) => [key, item as string] as const)
  return new Map(entries)
}

function stringListFrom(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, limit)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function guestModelPrimaryReference(row: GuestModelRow) {
  const refs = isRecord(row.model_references) && Array.isArray(row.model_references.references)
    ? row.model_references.references
    : []
  const records = refs.filter(isRecord)
  const selected = records.find(ref => ref.key === 'front_face' && typeof ref.storagePath === 'string')
    ?? records.find(ref => ref.key === 'front_face' && typeof ref.publicUrl === 'string')
    ?? records.find(ref => typeof ref.storagePath === 'string' || typeof ref.publicUrl === 'string')

  if (!selected) return null

  return {
    storagePath: typeof selected.storagePath === 'string' ? selected.storagePath : null,
    publicUrl: typeof selected.publicUrl === 'string' ? selected.publicUrl : typeof selected.previewUrl === 'string' ? selected.previewUrl : null,
    mimeType: typeof selected.mimeType === 'string' ? selected.mimeType : 'image/jpeg',
  }
}

function aiModelPrimaryReference(assets: AiModelAssetRow[], modelId: string) {
  const selected = assets
    .filter(asset => asset.model_id === modelId && asset.asset_type === 'front_face')
    .sort((left, right) => right.version_number - left.version_number)[0]
  if (!selected) return null
  return {
    storagePath: selected.storage_path,
    publicUrl: selected.image_url,
    mimeType: 'image/jpeg',
  }
}

function summarizeProviderResponse(response: GeminiResponse) {
  return {
    promptFeedback: response.promptFeedback ?? null,
    usageMetadata: response.usageMetadata ?? null,
    candidates: (response.candidates ?? []).map(candidate => ({
      finishReason: candidate.finishReason ?? candidate.finish_reason ?? null,
      parts: (candidate.content?.parts ?? []).map(part => {
        const inlineData = part.inlineData ?? part.inline_data
        if (inlineData?.data) {
          return {
            type: 'image',
            mimeType: inlineData.mimeType ?? inlineData.mime_type ?? 'image/png',
            dataBytesApprox: Math.round((inlineData.data.length * 3) / 4),
          }
        }
        return {
          type: 'text',
          text: part.text ?? '',
        }
      }),
    })),
  }
}

async function persistNanoBananaGenerationAudit({
  workflow,
  clientId,
  dryRun,
  success,
  originalAssembledPrompt,
  finalProviderPrompt,
  payloadDebug,
  referenceAssets,
  providerResponseSummary,
  providerStatus,
  error,
  generatedOutputAssetId = null,
}: {
  workflow: string
  clientId: string | null
  dryRun: boolean
  success: boolean
  originalAssembledPrompt: string
  finalProviderPrompt: string
  payloadDebug: Record<string, unknown>
  referenceAssets: unknown[]
  providerResponseSummary?: unknown
  providerStatus?: number | null
  error?: unknown
  generatedOutputAssetId?: string | null
}) {
  const auditId = `${Date.now()}-${randomUUID()}`
  const auditDir = path.join(process.cwd(), '.next', 'generation-audits', 'nano-banana')
  const auditPath = path.join(auditDir, `${auditId}.json`)
  const audit = {
    audit_id: auditId,
    saved_at: new Date().toISOString(),
    provider: 'google-gemini',
    model: MODEL,
    workflow,
    client_id: clientId,
    dry_run: dryRun,
    success,
    provider_status: providerStatus ?? null,
    selected_asset_snapshot: {
      ordered_references: payloadDebug.ordered_references ?? [],
      reference_assets: referenceAssets,
    },
    original_assembled_prompt: originalAssembledPrompt,
    final_provider_prompt: finalProviderPrompt,
    blocks_kept: isRecord(payloadDebug.compression) ? payloadDebug.compression.sections_preserved ?? [] : [],
    blocks_removed: isRecord(payloadDebug.compression) ? payloadDebug.compression.sections_dropped ?? [] : [],
    compression: payloadDebug.compression ?? null,
    provider_response_summary: providerResponseSummary ?? null,
    generated_output_asset_id: generatedOutputAssetId,
    error: error instanceof Error ? { message: error.message, name: error.name } : error ?? null,
    image_config: payloadDebug.image_config ?? null,
    settings: payloadDebug.settings ?? null,
  }
  try {
    await mkdir(auditDir, { recursive: true })
    await writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
    return {
      audit_id: auditId,
      audit_path: auditPath,
    }
  } catch (writeError) {
    console.warn('nano_banana_generation_audit_write_failed', writeError)
    return {
      audit_id: auditId,
      audit_path: null,
      audit_error: writeError instanceof Error ? writeError.message : String(writeError),
    }
  }
}

function parseVisualDNA(answer: string | null): VisualDNAValues | null {
  if (!answer?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(answer)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as VisualDNAValues
  } catch {
    return null
  }
}

function cleanLine(value: string | undefined, maxLength = 280) {
  if (!value?.trim()) return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trim()}...` : compact
}

function truncateToHardMax(value: string, maxChars: number) {
  const compact = value.trim()
  if (compact.length <= maxChars) return compact
  if (maxChars <= 1) return compact.slice(0, Math.max(0, maxChars))
  return compact.slice(0, maxChars - 1).trimEnd()
}

function metadataValue(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return ''
  const value = metadata[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join(', ')
  return ''
}

const VENUE_SPATIAL_METADATA_FIELDS = [
  'zone',
  'table_shape',
  'table_material',
  'table_edge',
  'table_scale',
  'table_diameter_behavior',
  'seating',
  'seating_type',
  'chair_material',
  'chair_color',
  'table_to_chair_relationship',
  'lighting',
  'mirror_reflection_behavior',
] as const

function missingVenueSpatialMetadataFields(asset: ReferenceAsset) {
  return VENUE_SPATIAL_METADATA_FIELDS.filter(field => !metadataValue(asset.metadata, field).trim())
}

function summarizeFoodOrDrinkAsset(asset: ReferenceAsset, role: 'Food' | 'Drink') {
  const metadata = asset.metadata
  const isStudioShot = categoryAllowed(asset.asset_category, new Set(['food_studio_shots', 'drink_studio_shots']))
  const roleLabel = role === 'Food'
    ? isStudioShot ? 'Food Studio Shot / AI Truth Ref' : 'Food'
    : isStudioShot ? 'Drink Studio Shot / AI Truth Ref' : 'Drink'
  const name = metadataValue(metadata, 'name') || metadataValue(metadata, 'title') || metadataValue(metadata, 'dish_name') || metadataValue(metadata, 'drink_name') || asset.file_name
  const parts = role === 'Food'
    ? [
      metadataValue(metadata, 'plate_count') ? `plate_count ${metadataValue(metadata, 'plate_count')}` : '',
      metadataValue(metadata, 'item_count') ? `item_count ${metadataValue(metadata, 'item_count')}` : '',
      metadataValue(metadata, 'serving_vessel') || metadataValue(metadata, 'plate_style'),
      metadataValue(metadata, 'sauce') ? `sauce ${metadataValue(metadata, 'sauce')}` : '',
      metadataValue(metadata, 'side_components') ? `side ${metadataValue(metadata, 'side_components')}` : '',
      metadataValue(metadata, 'garnish') ? `garnish ${metadataValue(metadata, 'garnish')}` : '',
      metadataValue(metadata, 'do_not_remove') ? `do_not_remove ${metadataValue(metadata, 'do_not_remove')}` : '',
    ]
    : [
      metadataValue(metadata, 'glass_shape') || metadataValue(metadata, 'glassware') || metadataValue(metadata, 'glass'),
      metadataValue(metadata, 'liquid_color') || metadataValue(metadata, 'color'),
      metadataValue(metadata, 'garnish') ? `garnish ${metadataValue(metadata, 'garnish')}` : '',
      metadataValue(metadata, 'foam_or_clarity') || metadataValue(metadata, 'clarity'),
      metadataValue(metadata, 'scale'),
      metadataValue(metadata, 'contains_smoke_effect') ? `smoke_effect ${metadataValue(metadata, 'contains_smoke_effect')}` : '',
    ]
  const details = Array.from(new Set(parts.map(value => cleanLine(value, 48)).filter(Boolean))).slice(0, 7).join(' · ')
  return `${roleLabel}: ${cleanLine(name, 54)}${details ? ` — ${details}` : ''}`
}

function summarizeEnvironmentAnchorAssets(assets: ReferenceAsset[]) {
  const simplifiedSummary = buildCompactSimplifiedInteriorVenueTruthSummary(assets)
  if (simplifiedSummary) {
    return `Selected venue truth: ${simplifiedSummary}.`
  }

  const spatialSummary = buildCompactVenueSpatialSummary(resolveVenueSpatialMetadataList(assets))
  if (spatialSummary) {
    return `Selected venue spatial truth: ${spatialSummary}.`
  }

  const anchors = assets
    .slice(0, 4)
    .map(asset => {
      const parts = [
        metadataValue(asset.metadata, 'name') || metadataValue(asset.metadata, 'title') || asset.file_name,
        metadataValue(asset.metadata, 'location'),
        metadataValue(asset.metadata, 'zone'),
        metadataValue(asset.metadata, 'lighting'),
        metadataValue(asset.metadata, 'lighting_style'),
        metadataValue(asset.metadata, 'materials'),
        metadataValue(asset.metadata, 'material'),
        metadataValue(asset.metadata, 'table_material'),
        metadataValue(asset.metadata, 'table_shape'),
        metadataValue(asset.metadata, 'table_edge'),
        metadataValue(asset.metadata, 'table_scale'),
        metadataValue(asset.metadata, 'table_diameter_behavior'),
        metadataValue(asset.metadata, 'seating'),
        metadataValue(asset.metadata, 'seating_type'),
        metadataValue(asset.metadata, 'chair_material'),
        metadataValue(asset.metadata, 'chair_color'),
        metadataValue(asset.metadata, 'table_to_chair_relationship'),
        metadataValue(asset.metadata, 'preserve_table_size'),
        metadataValue(asset.metadata, 'do_not_resize_table'),
        metadataValue(asset.metadata, 'mirror_reflection_behavior'),
        metadataValue(asset.metadata, 'background_constraints'),
        metadataValue(asset.metadata, 'do_not_invent'),
        metadataValue(asset.metadata, 'furniture'),
        metadataValue(asset.metadata, 'architecture'),
        metadataValue(asset.metadata, 'visual_identity'),
        asset.extracted_summary || '',
        metadataValue(asset.metadata, 'notes'),
      ].map(value => cleanLine(value, 120)).filter(Boolean)
      return parts.join(' · ')
    })
    .filter(Boolean)

  return anchors.length > 0
    ? `Selected venue environment anchor metadata: ${anchors.join('; ')}.`
    : ''
}

function summarizeVenueServiceAssets(assets: Array<Pick<ReferenceAsset, 'file_name' | 'metadata'>>) {
  const items = assets
    .slice(0, 8)
    .map(asset => {
      const parts = [
        metadataValue(asset.metadata, 'name') || asset.file_name,
        metadataValue(asset.metadata, 'service_style'),
        metadataValue(asset.metadata, 'cutlery'),
        metadataValue(asset.metadata, 'tableware'),
        metadataValue(asset.metadata, 'material'),
        metadataValue(asset.metadata, 'color'),
      ].map(value => value.replace(/\s+/g, ' ').trim().slice(0, 70)).filter(Boolean)
      return parts.join(' · ')
    })
    .filter(Boolean)

  return items.length > 0
    ? `Known venue service/tableware/items from Content Library: ${items.join('; ')}.`
    : ''
}

function servicewareKind(asset: Pick<ReferenceAsset, 'file_name' | 'metadata'>) {
  const haystack = [
    asset.file_name,
    metadataValue(asset.metadata, 'name'),
    metadataValue(asset.metadata, 'item_type'),
    metadataValue(asset.metadata, 'cutlery'),
    metadataValue(asset.metadata, 'tableware'),
    metadataValue(asset.metadata, 'object_name'),
    metadataValue(asset.metadata, 'tags'),
  ].join(' ').toLowerCase()
  if (/\bfork\b/.test(haystack)) return 'fork'
  if (/\bknife\b|\bknives\b/.test(haystack)) return 'knife'
  return ''
}

function servicewareTruthLabel(asset: Pick<ReferenceAsset, 'file_name' | 'metadata'>, kind: string) {
  const name = metadataValue(asset.metadata, 'name') || asset.file_name
  const details = [
    metadataValue(asset.metadata, 'cutlery'),
    metadataValue(asset.metadata, 'tableware'),
    metadataValue(asset.metadata, 'material'),
    metadataValue(asset.metadata, 'color'),
  ].map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ')
  const role = kind === 'fork' ? 'DEMOCLIENTD FORK' : kind === 'knife' ? 'DEMOCLIENTD KNIFE' : 'DEMOCLIENTD SERVICEWARE'
  return `${role} · ${name}${details ? ` · ${details.slice(0, 180)}` : ''}`
}

function selectCanonicalServicewareAssets(assets: ReferenceAsset[]) {
  const selected = new Map<string, ReferenceAsset>()
  for (const kind of ['fork', 'knife']) {
    const match = assets.find(asset => servicewareKind(asset) === kind)
    if (match) selected.set(kind, match)
  }
  return Array.from(selected.entries()).map(([kind, asset]) => ({ kind, asset }))
}

type VenueReasoningMode = 'locked_scene_plate' | 'nano_banana_pro_visual_truth' | 'flexible_venue_context' | 'material_atmosphere_reference'

function venueProviderLabel(order: number | string, venueReasoningMode: VenueReasoningMode) {
  if (venueReasoningMode === 'locked_scene_plate') {
    return `[IMAGE ${order} / VISUAL TRUTH / MATCH LOCKED VENUE] This image is the authoritative venue truth. Use the image, not text, as the source of visible environment reality. Text only clarifies visible details. Add selected foreground subjects/items inside this visual reality.`
  }
  if (venueReasoningMode === 'nano_banana_pro_visual_truth') {
    return `[IMAGE ${order} / VISUAL TRUTH / NANO BANANA PRO VENUE] This image is the primary venue truth. Use it as the visual reality. Text is modifications only: selected people, food, drinks, and accessories. Do not rebuild the venue from text.`
  }
  if (venueReasoningMode === 'flexible_venue_context') {
    return `[IMAGE ${order} / VISUAL TRUTH / GUIDED VENUE] This image is the authoritative visible venue reference. Use only what is visible in the image. Text only clarifies visible material cues. Do not invent unseen venue elements or rebuild the venue from text.`
  }
  return `[IMAGE ${order} / MATERIAL ATMOSPHERE REFERENCE / VENUE TRUTH] Use for client material language, surface truth, table material, lighting mood, furniture family, and premium restaurant identity only. Allow camera, crop, layout, and composition adaptation. Do not treat as exact geometry or a locked scene plate.`
}

function venueReferenceMapLine(order: number | string, venueReasoningMode: VenueReasoningMode) {
  if (venueReasoningMode === 'locked_scene_plate') {
    return `${order} venue => VISUAL TRUTH first; Match Locked high-fidelity venue image reference; text clarifies only`
  }
  if (venueReasoningMode === 'nano_banana_pro_visual_truth') {
    return `${order} venue => VISUAL TRUTH first; Nano Banana Pro image authority; text modifies foreground only`
  }
  if (venueReasoningMode === 'flexible_venue_context') {
    return `${order} venue => VISUAL TRUTH first; Guided visible venue image reference; no unseen venue elements`
  }
  return `${order} venue => MATERIAL ATMOSPHERE REFERENCE truth; preserve material/surface/light/furniture language; do not lock geometry`
}

function providerReferenceLabel(ref: PayloadDebugReference, assignments = new Map<string, string>(), venueReasoningMode: VenueReasoningMode = 'flexible_venue_context') {
  const order = ref.order ?? '?'
  const owner = (ref.owner || '').trim()
  const labelParts = ref.label.split('·').map(part => part.trim()).filter(Boolean)
  const objectName = labelParts.length > 1 ? labelParts[1] : ref.label
  const primaryLabel = cleanLine(ref.label.replace(/^(Food|Drink)( Studio Shot \/ AI Truth Ref)?:\s*/i, '').split('—')[0]?.trim() || ref.label, 96)
  const uppercaseOwner = owner ? owner.toUpperCase() : ''

  if (ref.role === 'venue') {
    return venueProviderLabel(order, venueReasoningMode)
  }
  if (ref.role === 'model') {
    return `[IMAGE ${order} / ${uppercaseOwner || 'GUEST'} PORTRAIT TRUTH] Use only for ${owner || 'guest'} face identity, skin, hair, eyes, age, and body appearance. Do not use for another guest.`
  }
  if (ref.role === 'guest_model_outfit') {
    return `[IMAGE ${order} / ${uppercaseOwner || 'GUEST'} OUTFIT TRUTH] Use only for ${owner || 'guest'} clothing, fabric, fit, silhouette, and styling. Do not use for face identity.`
  }
  if (ref.role === 'guest_model_accessory') {
    const accessoryDetails = cleanLine(
      labelParts
        .slice(2)
        .join(', ')
        .replace(/\bowner\s*[:=]?\s*[^;,.]+[;,.]?\s*/gi, '')
        .replace(/\bmust appear[^;,.]+[;,.]?\s*/gi, '')
        .trim(),
      280
    )
    const ownerInstruction = owner ? `Owner: ${owner}.` : 'Owner-bound.'
    const placement = /watch/i.test(objectName)
      ? `${ownerInstruction} Must appear on ${owner || 'assigned guest'} wrist. Do not replace with random watch face or different shape.`
      : /ring/i.test(objectName)
        ? `${ownerInstruction} Must appear on ${owner || 'assigned guest'} ring finger when visible. Do not replace design.`
        : /bag/i.test(objectName)
          ? `${ownerInstruction} Place naturally near ${owner || 'assigned guest'}; do not awkwardly force-hold.`
          : `${ownerInstruction} Must stay with assigned guest.`
    const isWatch = /watch/i.test(objectName)
    const accessoryRole = isWatch ? 'WATCH' : objectName.toUpperCase()
    const watchTruth = isWatch
      ? ` This image is the exact watch truth reference for ${owner || 'assigned guest'} only. Recreate the same watch design 1:1: strap, dial, face layout, bezel, case, markers, crown, metal tone, and logo placement. If visible, it must match this reference as closely as possible. Do not substitute a different luxury watch, generic watch face, or ${/rectangular/i.test(accessoryDetails) ? 'round watch.' : 'replacement design.'}`
      : ''
    return `[IMAGE ${order} / ${uppercaseOwner || 'GUEST'} ${accessoryRole} TRUTH] Exact 1:1 object truth for ${owner || 'assigned guest'} only.${watchTruth} ${accessoryDetails || 'Preserve object design, material, color, shape, and placement.'} ${placement}`
  }
  if (ref.role === 'food') {
    const assignment = assignments.get(ref.id)
    const placement = assignment ? ` Assignment: ${assignment}. ${assignment === 'Shared' ? 'Place centered/shared between Marco and Sofia.' : `Place directly in front of ${assignment}.`} Do not place at empty seat. Do not create a separate empty plate for the assigned guest.` : ''
    if (/Food Studio Shot|AI Truth Ref/i.test(ref.label)) {
      return `[IMAGE ${order} / FOOD STUDIO SHOT / ${primaryLabel.toUpperCase()}] Exact dish truth reference; preserve count, plating, sauce, garnish, texture, vessel.${placement}`
    }
    return `[IMAGE ${order} / FOOD / ${primaryLabel.toUpperCase()}] Exact dish truth; preserve count, plating, sauce, garnish, texture, vessel.${placement}`
  }
  if (ref.role === 'drink') {
    const assignment = assignments.get(ref.id)
    const placement = assignment ? ` Assignment: ${assignment}. ${assignment === 'Shared' ? 'Place centered/shared between Marco and Sofia.' : `Place directly in front of ${assignment}.`} Preserve realistic scale.` : ''
    if (/bites|plate|not a beverage/i.test(ref.label)) {
      return `[IMAGE ${order} / TRAFFIC HOURS BITES / ${primaryLabel.toUpperCase()}] Exact small-bites package truth; preserve plate, item count, garnish, and scale.${placement}`
    }
    if (/Drink Studio Shot|AI Truth Ref/i.test(ref.label)) {
      return `[IMAGE ${order} / DRINK STUDIO SHOT / ${primaryLabel.toUpperCase()}] Exact beverage truth reference; preserve glass, color, garnish, scale; no smoke/flames/dry ice.${placement}`
    }
    return `[IMAGE ${order} / DRINK / ${primaryLabel.toUpperCase()}] Exact beverage truth; preserve glass, color, garnish, scale; no smoke/flames/dry ice.${placement}`
  }
  if (ref.role === 'pinterest') {
    return `[IMAGE ${order} / INSPIRATION ONLY] Mood/composition/styling only; never truth.`
  }
  if (ref.role === 'service') {
    if (/DEMOCLIENTD FORK/i.test(ref.label)) {
      return `[IMAGE ${order} / SERVICEWARE TRUTH / DEMOCLIENTD FORK] Use this exact white-and-gold fork design for all visible forks. Do not invent silver, generic, or different cutlery.`
    }
    if (/DEMOCLIENTD KNIFE/i.test(ref.label)) {
      return `[IMAGE ${order} / SERVICEWARE TRUTH / DEMOCLIENTD KNIFE] Use this exact white-and-gold knife design for all visible knives. Do not invent silver, generic, or different cutlery.`
    }
    return `[IMAGE ${order} / SERVICEWARE TRUTH] Use this exact venue serviceware design for visible tableware. Keep secondary and venue-consistent.`
  }
  return `[IMAGE ${order} / CONTEXT] Use only for labeled role; never override truth.`
}

function primaryReferenceLabel(ref: PayloadDebugReference) {
  return cleanLine(ref.label.replace(/^(Food|Drink)( Studio Shot \/ AI Truth Ref)?:\s*/i, '').split('—')[0]?.trim() || ref.label, 92)
}

function compactReferenceLabel(ref: PayloadDebugReference, max = 42) {
  return cleanLine(
    primaryReferenceLabel(ref)
      .replace(/^Food Studio Shot \/ AI Truth Ref:\s*/i, '')
      .replace(/^Drink Studio Shot \/ AI Truth Ref:\s*/i, '')
      .replace(/^Food:\s*/i, '')
      .replace(/^Drink:\s*/i, '')
      .split('·')[0]
      .trim(),
    max
  )
}

function compactAccessoryLabel(ref: PayloadDebugReference) {
  const text = ref.label.toLowerCase()
  if (text.includes('watch')) return 'watch'
  if (text.includes('ring')) return 'ring'
  if (text.includes('bag')) return 'bag'
  if (text.includes('sunglass')) return 'sunglasses'
  return cleanLine(primaryReferenceLabel(ref).split('·')[1]?.trim() || 'accessory', 28)
}

function resolveFoodDrinkAssignments(refs: PayloadDebugReference[], explicitAssignments: Map<string, string>) {
  const resolved = new Map<string, string>()
  const assignRole = (role: 'food' | 'drink') => {
    const roleRefs = refs.filter(ref => ref.role === role)
    roleRefs.forEach((ref, index) => {
      const explicit = explicitAssignments.get(ref.id)
      if (explicit) {
        resolved.set(ref.id, explicit)
      } else if (roleRefs.length === 1) {
        resolved.set(ref.id, 'Shared')
      } else if (roleRefs.length === 2) {
        resolved.set(ref.id, index === 0 ? 'Marco' : 'Sofia')
      } else {
        resolved.set(ref.id, index === 0 ? 'Marco' : index === 1 ? 'Sofia' : 'Shared')
      }
    })
  }
  assignRole('food')
  assignRole('drink')
  return resolved
}

function buildReferenceMap(refs: PayloadDebugReference[], assignments: Map<string, string>, venueReasoningMode: VenueReasoningMode = 'flexible_venue_context') {
  const lines = refs.map(ref => {
    const order = ref.order ?? '?'
    const owner = ref.owner || 'guest'
    const ownerPrefix = owner.toLowerCase() === 'assigned guest' ? 'guest' : owner
    const label = compactReferenceLabel(ref)
    if (ref.role === 'venue') {
      return venueReferenceMapLine(order, venueReasoningMode)
    }
    if (ref.role === 'model') {
      return `${order} ${ownerPrefix} portrait => face/skin/hair only`
    }
    if (ref.role === 'guest_model_outfit') {
      return `${order} ${ownerPrefix} outfit => clothing only`
    }
    if (ref.role === 'guest_model_accessory') {
      return `${order} ${ownerPrefix} ${compactAccessoryLabel(ref)} => 1:1 object only; no swaps`
    }
    if (ref.role === 'food') {
      const assignment = assignments.get(ref.id) || 'Shared'
      return `${order} food ${label} => ${assignment}`
    }
    if (ref.role === 'drink') {
      const assignment = assignments.get(ref.id) || 'Shared'
      return `${order} drink ${label} => ${assignment}`
    }
    if (ref.role === 'service') {
      if (/DEMOCLIENTD FORK/i.test(ref.label)) return `${order} fork truth => all forks`
      if (/DEMOCLIENTD KNIFE/i.test(ref.label)) return `${order} knife truth => all knives`
      return `${order} serviceware truth => secondary`
    }
    if (ref.role === 'pinterest') return `${order} inspiration => mood only; never truth`
    return `${order} ${ref.role} => assigned role only`
  })
  return `[REFERENCE_MAP]\n${lines.map(line => `- ${line}`).join('\n')}`
}

function buildScenePlan(refs: PayloadDebugReference[], assignments: Map<string, string>, venueSpatialMetadataWarning: string) {
  const foodByAssignment = (target: string) => refs
    .filter(ref => ref.role === 'food' && (assignments.get(ref.id) || 'Shared') === target)
    .map(ref => compactReferenceLabel(ref))
  const drinksByAssignment = (target: string) => refs
    .filter(ref => ref.role === 'drink' && (assignments.get(ref.id) || 'Shared') === target)
    .map(ref => compactReferenceLabel(ref))
  const accessoriesByOwner = (owner: string) => refs
    .filter(ref => ref.role === 'guest_model_accessory' && (ref.owner || '').toLowerCase() === owner.toLowerCase())
    .map(ref => compactAccessoryLabel(ref))
  const guests = ['Marco', 'Sofia'].map(name => ({
    name,
    food: foodByAssignment(name),
    drink: drinksByAssignment(name),
    accessories: accessoriesByOwner(name),
  }))
  const sharedFood = foodByAssignment('Shared')
  const sharedDrinks = drinksByAssignment('Shared')
  const lines = [
    `table => Image 1; shape/material/scale locked${venueSpatialMetadataWarning ? '; metadata weak = match visible ref only' : ''}`,
    ...guests.map(guest => `${guest.name} => food:${guest.food.join(',') || 'none'}; drink:${guest.drink.join(',') || 'none'}; acc:${guest.accessories.join(',') || 'none'}`),
    sharedFood.length > 0 || sharedDrinks.length > 0 ? `Shared => food:${sharedFood.join(',') || 'none'}; drink:${sharedDrinks.join(',') || 'none'}` : '',
    `forbid => empty plates, empty-seat food/drink, invented table, random/swapped accessories, mismatched chairs`,
  ].filter(Boolean)
  return `[SCENE_PLAN]\n${lines.map(line => `- ${line}`).join('\n')}`
}

function assertReferenceOrderIntegrity(refs: PayloadDebugReference[], parts: ProviderReferencePart[], referenceMapBlock: string) {
  const issues: string[] = []
  if (refs.length !== parts.length) {
    issues.push(`Reference count mismatch: map/debug has ${refs.length}, provider parts has ${parts.length}.`)
  }
  refs.forEach((ref, index) => {
    const expectedOrder = index + 1
    if (ref.order !== expectedOrder) issues.push(`Reference ${ref.id} has order ${ref.order}, expected ${expectedOrder}.`)
    const partLabel = parts[index]?.label ?? ''
    if (!partLabel.includes(`[IMAGE ${expectedOrder} /`)) {
      issues.push(`Provider label mismatch for image ${expectedOrder}: ${partLabel || 'missing label'}.`)
    }
    if (!new RegExp(`^-\\s*${expectedOrder}\\b`, 'm').test(referenceMapBlock)) {
      issues.push(`Reference map missing Image ${expectedOrder}.`)
    }
  })
  return {
    passed: issues.length === 0,
    issues,
  }
}

function compactVisualDNA(values: VisualDNAValues | null) {
  if (!values) return []
  return [
    `Lighting style: ${cleanLine(values.lighting_rules)}`,
    `Material/color mood: ${cleanLine(values.color_science)}`,
    `Atmosphere/composition: ${cleanLine([values.night_scene_rules, values.composition_rules, values.motion_rules].filter(Boolean).join(' '), 360)}`,
    `Skin/realism: ${cleanLine(values.skin_realism)}`,
    `Avoid: ${cleanLine(values.avoid_list, 360)}`,
  ].filter(line => !line.endsWith(': '))
}

function dedupeLines(text: string) {
  const seen = new Set<string>()
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false
      const key = line.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n')
}

function promptSectionTitle(section: string) {
  return section.trim().split('\n')[0]?.replace(/^-+\s*/, '').trim() || 'Untitled'
}

function splitPromptBlocks(prompt: string) {
  const blocks = prompt
    .split(/\n{2,}(?=\[[A-Z_ ]+\])/g)
    .map(section => section.trim())
    .filter(Boolean)
  if (blocks.length > 1 || blocks[0]?.startsWith('[')) return blocks
  return [prompt.trim()].filter(Boolean)
}

function hasPromptBlock(prompt: string, blockName: string) {
  return new RegExp(`^\\[${blockName}\\]`, 'im').test(prompt)
}

function sanitizePromptForVenueReasoning(prompt: string, venueReasoningMode: VenueReasoningMode) {
  if (venueReasoningMode === 'locked_scene_plate') return prompt

  const replacementLabel = venueReasoningMode === 'flexible_venue_context'
    ? 'GUIDED VENUE CONTEXT'
    : venueReasoningMode === 'nano_banana_pro_visual_truth'
      ? 'NANO BANANA PRO VISUAL TRUTH'
    : 'MATERIAL ATMOSPHERE REFERENCE'
  const replacementMode = venueReasoningMode
  const blocks = splitPromptBlocks(prompt)
    .filter(block => !hasPromptBlock(block, 'LOCKED_SCENE_PLATE'))
    .filter(block => !hasPromptBlock(block, 'CAMERA_RULE'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'VENUE_SPATIAL_TRUTH'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'VENUE_ZONE'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'VENUE_SCALE_LOCK'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'SPATIAL'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'VISIBLE_REFERENCE_LOCK'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'CAMERA_REALITY_LOCK'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'COMPOSITION'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'VISUAL_DNA'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'QA_MEMORY'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'PROMPT_V2_QA_CHECKLIST'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'REFERENCE_MAP'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'ENVIRONMENT'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'GUIDED_VENUE_CONTEXT'))
    .filter(block => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !hasPromptBlock(block, 'MATERIAL_ATMOSPHERE_REFERENCE'))

  return blocks
    .join('\n\n')
    .split('\n')
    .filter(line => venueReasoningMode !== 'nano_banana_pro_visual_truth' || !/\b(room proportions?|ceiling structure|shelving axis|architecture depth|furniture spacing|venue depth|spatial geometry|walkways?|circulation|focal axis)\b/i.test(line))
    .join('\n')
    .replace(/mode:\s*locked_scene_plate/gi, `mode: ${replacementMode}`)
    .replace(/\bLOCKED SCENE PLATE\b/gi, replacementLabel)
    .replace(/\blocked photographic scene plate\b/gi, replacementLabel.toLowerCase())
    .replace(/\bscene plate is locked\b/gi, `${replacementLabel.toLowerCase()} is active`)
    .replace(/\b95%\s*composition fidelity\b/gi, '')
    .replace(/\b100%\s*strict scene match\b/gi, '')
    .replace(/\bComposition Fidelity\s*[:=]?\s*\d+%?\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function compactQaMemoryForPrompt(prompt: string) {
  return prompt
    .replace(/^Generation QA Memory[^\n]*\n?/i, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /2 guests|place settings|interior lighting source-locked|time changes styling|natural accessory placement/i.test(line))
    .slice(0, 4)
    .join('\n')
    .trim()
}

function compactPromptLanguage(value: string) {
  return value
    .replace(/\bPreserve the exact\b/gi, 'Preserve')
    .replace(/\bPreserve exact\b/gi, 'Preserve')
    .replace(/\bDo not create inspired-by, similar-to, or reinterpreted versions?\b/gi, 'No inspired-by/reinterpreted versions')
    .replace(/\bnot an inspired-by, similar-to, or reinterpreted version\b/gi, 'not inspired-by/reinterpreted')
    .replace(/\bwhile allowing natural production-friendly\b/gi, 'while allowing production-friendly')
    .replace(/\bDo not redesign, rearrange, replace, remove, or invent\b/gi, 'Do not redesign/rearrange/invent')
    .replace(/\bshape, ingredient structure, plating style, portion logic, and visual proportions\b/gi, 'shape, ingredients, plating, portion, proportions')
    .replace(/\bcomposition, crop, camera, and layout adjustments\b/gi, 'composition/crop/camera/layout adjustments')
}

function promptBlockPriority(title: string) {
  if (/\[(USER_SETUP|DIRECTOR_NOTES|COMPOSITION_REFERENCE_ONLY|DEMOCLIENTD_SUBJECT_TRUTH|DEMOCLIENTD_SURFACE_VENUE_TRUTH|DEMOCLIENTD_PROPS_TRUTH|HUMAN_DETAIL_RULES|CLIENT_REALISM_LOCK|NANO_BANANA_PRO_MODE|VISUAL_TRUTH_PRIORITY|DEMOCLIENTB_VENUE_LOCK|DEMOCLIENTB_VENUE_MEMORY|VISIBLE_REFERENCE_LOCK|CAMERA_REALITY_LOCK|ACTION_LOCK|SUBJECT_COUNT_LOCK|SUBJECT_PLACEMENT_LOCK|FOOD_DRINK_VISIBILITY_LOCK|FACIAL_REALISM_LOCK|MATERIAL_ATMOSPHERE_REFERENCE|GUIDED_VENUE_CONTEXT|VENUE_MODE|VENUE_TRUTH|ENVIRONMENT|ENVIRONMENT_TRUTH|ENVIRONMENT_INSPIRATION|VENUE_SPATIAL_TRUTH|VENUE_ZONE|SCENE|SUBJECTS|MODEL_IDENTITY|REFERENCE_ROLES|WARDROBE|OUTFIT_TRUTH|ACCESSORIES|ACCESSORY_TRUTH|ACCESSORY_REALISM|ACCESSORY_TRUTH_LOCK|FOOD_TRUTH|DRINK_TRUTH|FOOD|DRINKS|VISUAL_DNA|COMPOSITION)\]/i.test(title)) return 1
  if (/\[(SCENE_PLAN|PROMPT_V2_PERMANENT_LEARNINGS|CORRECTION_FROM_PREVIOUS_ATTEMPT|PAST_FAILURE_CORRECTIONS|LOCKED_SCENE_PLATE|CAMERA_RULE|STRICT_NEGATIVE|SCENE_INSPIRATION_ONLY|VENUE_SCALE_LOCK|TABLE_ASSIGNMENT|SERVICE_ASSIGNMENT|SERVICEWARE_TRUTH|SEATING_CONSISTENCY|EMOTION|FOCUS|FOCUS_LOCK|CAMERA|NEGATIVE|QA_MEMORY|SERVICE|SPATIAL|OUTPUT|SERVER_BINDING)\]/i.test(title)) return 2
  if (/\[(REFERENCE_MAP|INSPIRATION|STYLING_NOTES)\]/i.test(title)) return 3
  if (/Objective|Scene Setup|Environment Anchor|Venue Zone Rules|Table Shape|Food One-to-One|Accessory Exact|Portrait|Truth References|Reference Priority|Visual DNA|Composition/i.test(title)) return 1
  if (/Generation QA|Spatial|Blueprint|Venue Service|Background Guests|Focus|Camera|Negative/i.test(title)) return 2
  return 3
}

function promptBlockProtected(title: string) {
  return /\[(USER_SETUP|DIRECTOR_NOTES|COMPOSITION_REFERENCE_ONLY|DEMOCLIENTD_SUBJECT_TRUTH|DEMOCLIENTD_SURFACE_VENUE_TRUTH|DEMOCLIENTD_PROPS_TRUTH|HUMAN_DETAIL_RULES|CLIENT_REALISM_LOCK|NANO_BANANA_PRO_MODE|VISUAL_TRUTH_PRIORITY|DEMOCLIENTB_VENUE_LOCK|DEMOCLIENTB_VENUE_MEMORY|VISIBLE_REFERENCE_LOCK|CAMERA_REALITY_LOCK|ACTION_LOCK|SUBJECT_COUNT_LOCK|SUBJECT_PLACEMENT_LOCK|FOOD_DRINK_VISIBILITY_LOCK|FACIAL_REALISM_LOCK|MATERIAL_ATMOSPHERE_REFERENCE|GUIDED_VENUE_CONTEXT|VENUE_MODE|VENUE_TRUTH|ENVIRONMENT|ENVIRONMENT_TRUTH|ENVIRONMENT_INSPIRATION|VENUE_SPATIAL_TRUTH|VENUE_ZONE|SCENE|SCENE_PLAN|SUBJECTS|MODEL_IDENTITY|REFERENCE_ROLES|WARDROBE|OUTFIT_TRUTH|ACCESSORIES|ACCESSORY_TRUTH|ACCESSORY_REALISM|ACCESSORY_TRUTH_LOCK|FOOD_TRUTH|DRINK_TRUTH|FOOD|DRINKS|VISUAL_DNA|COMPOSITION|PROMPT_V2_PERMANENT_LEARNINGS|CORRECTION_FROM_PREVIOUS_ATTEMPT|PAST_FAILURE_CORRECTIONS|LOCKED_SCENE_PLATE|CAMERA_RULE|STRICT_NEGATIVE|SCENE_INSPIRATION_ONLY|VENUE_SCALE_LOCK|TABLE_ASSIGNMENT|SERVICE_ASSIGNMENT|SERVICEWARE_TRUTH|QA_MEMORY|FOCUS_LOCK|CAMERA|NEGATIVE)\]/i.test(title)
}

function normalizePromptBlock(section: string, lineMax = 220) {
  return dedupeLines(compactPromptLanguage(section))
    .split('\n')
    .map((line, index) => index === 0 ? line.trim() : cleanLine(line, lineMax))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function compressionTierLabel(priority: number) {
  if (priority === 1) return 'truth/operator protected'
  if (priority === 2) return 'support shorten-only'
  return 'compact/drop-first'
}

function promptSizeStatus(length: number) {
  if (length >= MAX_PROMPT_CHARS) return 'Blocked'
  if (length >= PROMPT_HIGH_RISK_CHARS) return 'High risk allowed'
  if (length >= PROMPT_WARNING_CHARS) return 'Warning'
  return 'Preferred'
}

function productPromptSizeStatus(length: number) {
  if (length >= PRODUCT_MAX_PROMPT_CHARS) return 'Blocked'
  if (length >= 4000) return 'Warning'
  return 'Preferred'
}

function largestPromptSections(sections: Array<{ title: string; text: string }>) {
  return sections
    .map(section => ({ title: section.title, chars: section.text.length }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 5)
}

function compressPromptWithDebug(sections: string[], maxChars = PROMPT_TARGET_CHARS) {
  const original = sections.filter(Boolean).join('\n\n').trim()
  const sectionsDropped: string[] = []
  const sectionsShortened: string[] = []
  let active = sections
    .flatMap(section => splitPromptBlocks(section))
    .filter(Boolean)
    .map(section => {
      const title = promptSectionTitle(section)
      const priority = promptBlockPriority(title)
      return {
        title,
        text: normalizePromptBlock(section, priority === 1 ? 1000 : 220),
        priority,
      }
    })
  let compact = active.map(section => section.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()

  if (compact.length > maxChars) {
    active = active.map(section => {
      if (section.priority === 1) return section
      const text = normalizePromptBlock(section.text, section.priority === 2 ? 150 : 110)
      if (text.length < section.text.length) sectionsShortened.push(section.title)
      return { ...section, text }
    })
    compact = active.map(section => section.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  for (const priority of [3, 2]) {
    if (compact.length <= maxChars) break
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].priority !== priority) continue
      if (promptBlockProtected(active[index].title)) continue
      sectionsDropped.push(active[index].title)
      active.splice(index, 1)
      compact = active.map(section => section.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
      if (compact.length <= maxChars) break
    }
  }

  for (const lineMax of [170, 130, 100, 80]) {
    if (compact.length <= maxChars) break
    active = active.map(section => {
      if (promptBlockProtected(section.title)) return section
      const text = normalizePromptBlock(section.text, lineMax)
      if (text.length < section.text.length) sectionsShortened.push(section.title)
      return { ...section, text }
    })
    compact = active.map(section => section.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  if (compact.length > maxChars) {
    let remaining = maxChars
    active = active.map(section => {
      if (promptBlockProtected(section.title)) return section
      const title = section.title
      const reserved = Math.max(240, Math.floor(maxChars / Math.max(active.length, 1)) - 8)
      const allowance = Math.min(reserved, Math.max(80, remaining - 8))
      remaining -= allowance + 2
      const text = section.text.length > allowance ? cleanLine(section.text, allowance) : section.text
      if (text.length < section.text.length) sectionsShortened.push(title)
      return { ...section, text }
    })
    compact = active.map(section => section.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  if (compact.length > maxChars) {
    active = active.map(section => {
      const protectedSection = promptBlockProtected(section.title)
      const allowance = protectedSection
        ? section.priority === 1 ? 620 : 420
        : section.priority === 1 ? 520 : section.priority === 2 ? 260 : 140
      const text = section.text.length > allowance ? truncateToHardMax(section.text, allowance) : section.text
      if (text.length < section.text.length) sectionsShortened.push(section.title)
      return { ...section, text }
    })
    compact = active.map(section => section.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  const finalText = truncateToHardMax(compact, maxChars)
  if (finalText.length < compact.length) sectionsShortened.push('Hard provider-safe final trim')

  const debug: PromptCompressionDebug = {
    mode: original.length === finalText.length ? 'none' : sectionsDropped.length > 0 || sectionsShortened.length > 0 ? 'truth_first' : 'dedupe',
    max_chars: maxChars,
    original_length: original.length,
    final_length: finalText.length,
    savings_percent: original.length > 0 ? Math.round(((original.length - finalText.length) / original.length) * 1000) / 10 : 0,
    largest_sections: largestPromptSections(active),
    sections_preserved: active.map(section => section.title),
    sections_shortened: Array.from(new Set(sectionsShortened)),
    sections_dropped: Array.from(new Set(sectionsDropped)),
    protected_sections: active.filter(section => promptBlockProtected(section.title)).map(section => section.title),
    priority_ranking: active.map(section => ({
      title: section.title,
      tier: compressionTierLabel(section.priority),
      protected: promptBlockProtected(section.title),
    })),
  }

  return { text: finalText, debug }
}

function errorPayload({
  error,
  failureStep,
  reason,
  actionNeeded,
  startedAt,
  status,
  providerStatus,
  providerError,
  referenceCount,
  quality,
  aspectRatio,
  fallbackUsed,
  payloadDebug,
}: {
  error: string
  failureStep: string
  reason?: string
  actionNeeded?: string
  startedAt: number
  status?: number
  providerStatus?: number
  providerError?: string
  referenceCount: number
  quality: 'standard' | '4k'
  aspectRatio: string
  fallbackUsed?: boolean
  payloadDebug?: unknown
}) {
  return NextResponse.json(
    {
      success: false,
      provider: 'google-gemini',
      model: MODEL,
      failure_step: failureStep,
      error,
      reason: reason ?? null,
      action_needed: actionNeeded ?? null,
      provider_status: providerStatus ?? null,
      provider_error: providerError ?? null,
      reference_count: referenceCount,
      quality,
      aspect_ratio: aspectRatio,
      fallback_used: Boolean(fallbackUsed),
      payload_debug: payloadDebug ?? null,
      latency_ms: Date.now() - startedAt,
    },
    { status: status ?? 500 }
  )
}

async function callProvider({
  apiKey,
  finalPrompt,
  referenceParts,
  aspectRatio,
  quality,
}: {
  apiKey: string
  finalPrompt: string
  referenceParts: ProviderReferencePart[]
  aspectRatio: string
  quality: 'standard' | '4k'
}): Promise<ProviderAttempt> {
  const imageSize = quality === '4k' ? '4K' : '1K'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: finalPrompt },
              ...referenceParts.flatMap(part => [
                { text: part.label },
                { inlineData: part.inlineData },
              ]),
            ],
          },
        ],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      }),
    })

    const providerResponse = await response.json().catch(() => ({})) as GeminiResponse
    return {
      quality,
      imageSize,
      response,
      providerResponse,
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  let failureStep = 'initializing'
  let referenceCount = 0
  let requestedQuality: 'standard' | '4k' = 'standard'
  let aspectRatio = '2:3'

  try {
    failureStep = 'checking_env'
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return errorPayload({
        error: 'GEMINI_API_KEY is not set.',
        failureStep,
        startedAt,
        status: 500,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }

    failureStep = 'parsing_request'
    const body = await req.json().catch(() => ({})) as {
      prompt?: unknown
      client_id?: unknown
      aspect_ratio?: unknown
      quality?: unknown
      location?: unknown
      venue_zone?: unknown
      time_of_day?: unknown
      activation?: unknown
      venue_fidelity?: unknown
      composition_intent?: unknown
      background_accuracy?: unknown
      background_guests?: unknown
      occasion?: unknown
      campaign_mode?: unknown
      primary_guest_archetype?: unknown
      secondary_guest_archetype?: unknown
      image_size?: unknown
      generation_mode?: unknown
      composition_fidelity?: unknown
      composition_fidelity_percent?: unknown
      environment_mode?: unknown
      environment_confidence?: unknown
      dry_run?: unknown
      venue_asset_ids?: unknown
      service_asset_ids?: unknown
      food_asset_ids?: unknown
      drink_asset_ids?: unknown
      model_asset_ids?: unknown
      pinterest_asset_ids?: unknown
      pinterest_notes?: unknown
      director_notes?: unknown
      guest_model_ids?: unknown
      guest_model_outfit_refs?: unknown
      guest_model_accessory_refs?: unknown
      food_drink_assignments?: unknown
      regeneration_notes?: unknown
      failure_labels?: unknown
      workflow?: unknown
      venue_photography_template?: unknown
      asset_upload_ids?: unknown
      venue_reasoning_mode?: unknown
      requested_generation_mode?: unknown
      requested_composition_fidelity?: unknown
    }

    const clientId = typeof body.client_id === 'string' ? body.client_id : null
    const dryRun = body.dry_run === true
    const workflow = body.workflow === 'product_photography'
      ? 'product_photography'
      : body.workflow === 'venue_photography'
        ? 'venue_photography'
        : body.workflow === 'reference_rebuild'
          ? 'reference_rebuild'
          : 'lifestyle'
    const isProductPhotographyWorkflow = workflow === 'product_photography'
    const isVenuePhotographyWorkflow = workflow === 'venue_photography'
    const isReferenceRebuildWorkflow = workflow === 'reference_rebuild'
    const venuePhotographyTemplate = body.venue_photography_template === 'surface_texture_background'
      ? 'surface_texture_background'
      : body.venue_photography_template === 'focused_venue_plate'
        ? 'focused_venue_plate'
        : null
    const maxPromptChars = isProductPhotographyWorkflow ? PRODUCT_MAX_PROMPT_CHARS : MAX_PROMPT_CHARS
    const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (isProductPhotographyWorkflow && rawPrompt.length >= PRODUCT_MAX_PROMPT_CHARS) {
      return errorPayload({
        error: `Prompt is too long. Keep Product Photography prompts under ${PRODUCT_MAX_PROMPT_CHARS} characters.`,
        failureStep,
        reason: 'prompt_too_long',
        actionNeeded: 'Shorten Product Director Notes or reduce prompt detail before testing.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }
    const initialPromptCompression = compressPromptWithDebug([rawPrompt], maxPromptChars)
    const prompt = initialPromptCompression.text
    aspectRatio = typeof body.aspect_ratio === 'string' && ALLOWED_ASPECT_RATIOS.has(body.aspect_ratio) ? body.aspect_ratio : '2:3'
    requestedQuality = body.quality === 'standard' ? 'standard' : '4k'
    const location = typeof body.location === 'string' && LOCATION_RULES[body.location] ? body.location : 'Exterior'
    const venueZone = typeof body.venue_zone === 'string' ? body.venue_zone : 'auto'
    const generationMode = normalizeGenerationWorkflowMode(body.generation_mode)
    const venueReasoningMode = body.venue_reasoning_mode === 'locked_scene_plate'
      || body.venue_reasoning_mode === 'nano_banana_pro_visual_truth'
      || body.venue_reasoning_mode === 'flexible_venue_context'
      || body.venue_reasoning_mode === 'material_atmosphere_reference'
      ? body.venue_reasoning_mode
      : generationMode === 'strict_scene_plate'
        ? 'locked_scene_plate'
        : generationMode === 'reference_inspiration'
          ? 'material_atmosphere_reference'
          : 'flexible_venue_context'
    const promptForVenueMode = sanitizePromptForVenueReasoning(prompt, venueReasoningMode)
    const compositionFidelity = normalizeCompositionFidelityMode(body.composition_fidelity ?? body.environment_mode)
    const compositionFidelityPercentValue = compositionFidelityPercent(compositionFidelity)
    const timeOfDay = body.time_of_day === 'Morning' || body.time_of_day === 'Midday' || body.time_of_day === 'Evening'
      ? body.time_of_day
      : 'Evening'
    const activation = typeof body.activation === 'string' && ACTIVATION_RULES[body.activation] ? body.activation : 'None'
    const requestedVenueFidelity = typeof body.venue_fidelity === 'string' && VENUE_FIDELITY_RULES[body.venue_fidelity as typeof VENUE_FIDELITY_MODES[number]]
      ? body.venue_fidelity as typeof VENUE_FIDELITY_MODES[number]
      : 'Source-Locked'
    const venueFidelity: typeof VENUE_FIDELITY_MODES[number] = generationMode === 'strict_scene_plate' ? 'Source-Locked' : requestedVenueFidelity
    const compositionIntent = typeof body.composition_intent === 'string' && COMPOSITION_INTENT_RULES[body.composition_intent as typeof COMPOSITION_INTENTS[number]]
      ? body.composition_intent as typeof COMPOSITION_INTENTS[number]
      : 'Source-matched'
    const requestedBackgroundAccuracy = typeof body.background_accuracy === 'string' && BACKGROUND_ACCURACY_RULES[body.background_accuracy as typeof BACKGROUND_ACCURACY_OPTIONS[number]]
      ? body.background_accuracy as typeof BACKGROUND_ACCURACY_OPTIONS[number]
      : 'Source-Locked'
    const backgroundAccuracy: typeof BACKGROUND_ACCURACY_OPTIONS[number] = generationMode === 'strict_scene_plate' ? 'Source-Locked' : requestedBackgroundAccuracy
    const backgroundGuests = typeof body.background_guests === 'string' && BACKGROUND_GUEST_RULES[body.background_guests as typeof BACKGROUND_GUEST_OPTIONS[number]]
      ? body.background_guests as typeof BACKGROUND_GUEST_OPTIONS[number]
      : 'Sparse'
    const hasLocationSetup = typeof body.location === 'string' || typeof body.time_of_day === 'string' || typeof body.activation === 'string'
    const isBreakfastMode = timeOfDay === 'Morning' || activation === 'Breakfast'
    const occasion = typeof body.occasion === 'string' && OCCASION_RULES[body.occasion] ? body.occasion : 'Dinner'
    const campaignMode = typeof body.campaign_mode === 'string' && CAMPAIGN_MODE_RULES[body.campaign_mode] ? body.campaign_mode : 'Dinner Campaign'
    const primaryGuest = typeof body.primary_guest_archetype === 'string' && GUEST_ARCHETYPE_RULES[body.primary_guest_archetype] ? body.primary_guest_archetype : 'Marco'
    const secondaryGuest = typeof body.secondary_guest_archetype === 'string' && GUEST_ARCHETYPE_RULES[body.secondary_guest_archetype] ? body.secondary_guest_archetype : ''
    const guestRules = [primaryGuest, secondaryGuest]
      .filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index)
      .map(value => GUEST_ARCHETYPE_RULES[value])

    if (!prompt) {
      return errorPayload({
        error: 'prompt is required.',
        failureStep,
        reason: 'missing_prompt',
        actionNeeded: 'Generate or enter a prompt before running Nano Banana Pro.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }
    if (!clientId) {
      return errorPayload({
        error: 'client_id is required.',
        failureStep,
        reason: 'missing_client_id',
        actionNeeded: 'Reload the client workspace and try again.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }
    if (prompt.length >= maxPromptChars) {
      return errorPayload({
        error: `Prompt is too long. Keep it under ${maxPromptChars} characters.`,
        failureStep,
        reason: 'prompt_too_long',
        actionNeeded: 'Shorten the prompt or regenerate it from setup before trying again.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }

    const rawVenueIds = idsFrom(body.venue_asset_ids, 50)
    const rawServiceIds = idsFrom(body.service_asset_ids, 50)
    const rawFoodIds = idsFrom(body.food_asset_ids, 50)
    const rawDrinkIds = idsFrom(body.drink_asset_ids, 50)
    const rawModelAssetIds = idsFrom(body.model_asset_ids, 50)
    const rawPinterestIds = idsFrom(body.pinterest_asset_ids, 50)
    const rawGuestModelIds = idsFrom(body.guest_model_ids, 50)
    const rawOutfitRefs = outfitRefsFrom(body.guest_model_outfit_refs, 50)
    const rawAccessoryRefs = accessoryRefsFrom(body.guest_model_accessory_refs, 50)
    const rawFoodDrinkAssignments = assignmentsFrom(body.food_drink_assignments)
    const regenerationNotes = typeof body.regeneration_notes === 'string' ? cleanLine(body.regeneration_notes, 700) : ''
    const directorNotes = typeof body.director_notes === 'string' ? cleanLine(body.director_notes, 900) : ''
    const directorNotesPresent = directorNotes.length > 0
    const failureLabels = stringListFrom(body.failure_labels, 12)
    if (!isProductPhotographyWorkflow && !isReferenceRebuildWorkflow && rawVenueIds.length === 0) {
      return errorPayload({
        error: 'A venue reference is required for grounded generation.',
        failureStep,
        reason: 'missing_venue_reference',
        actionNeeded: 'Select one Interior or Exterior venue reference before generating.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }

    const groups: ReferenceGroup[] = [
      {
        key: 'venue',
        label: isProductPhotographyWorkflow ? 'Surface/venue context references' : isVenuePhotographyWorkflow ? 'Venue Photography source plate' : isReferenceRebuildWorkflow ? 'Venue/background truth reference' : 'Venue references',
        ids: rawVenueIds,
        allowedCategories: new Set(isProductPhotographyWorkflow || isVenuePhotographyWorkflow
          ? [...INDOOR_VENUE_REFERENCE_CATEGORIES, ...OUTDOOR_VENUE_REFERENCE_CATEGORIES, 'venue_items']
          : isReferenceRebuildWorkflow
            ? [...INDOOR_VENUE_REFERENCE_CATEGORIES, ...OUTDOOR_VENUE_REFERENCE_CATEGORIES, ...REFERENCE_REBUILD_SURFACE_CATEGORIES]
            : location === 'Interior' ? INDOOR_VENUE_REFERENCE_CATEGORIES : OUTDOOR_VENUE_REFERENCE_CATEGORIES),
        promptInstruction: isProductPhotographyWorkflow
          ? 'Surface/venue context references define material, surface, and brand environment only; never product identity.'
          : isVenuePhotographyWorkflow
            ? 'Venue Photography source references define venue-only plate/material truth. No people, models, hands, food, drinks, plates, cutlery, napkins, glasses, props, or table setting.'
            : isReferenceRebuildWorkflow
              ? 'Venue/background truth controls surface, table, material, lighting atmosphere, and spatial truth if selected. It is never replaced by the Pinterest composition reference.'
              : `Venue image is primary ${location.toLowerCase()} visual truth; text only clarifies visible material, surface, lighting, and atmosphere cues.`,
      },
      {
        key: 'service',
        label: 'Service/tableware references',
        ids: rawServiceIds,
        allowedCategories: new Set(['venue_items']),
        promptInstruction: 'Service/tableware references define cutlery, glassware, plates, napkins, and table service styling only.',
      },
      {
        key: 'food',
        label: 'Food references',
        ids: rawFoodIds,
        allowedCategories: new Set(isReferenceRebuildWorkflow ? REFERENCE_REBUILD_FOOD_CATEGORIES : FOOD_REFERENCE_CATEGORIES),
        promptInstruction: 'Food references define dish appearance only. Food Studio Shots are approved AI truth references.',
      },
      {
        key: 'drink',
        label: 'Drink references',
        ids: rawDrinkIds,
        allowedCategories: new Set(isReferenceRebuildWorkflow ? REFERENCE_REBUILD_DRINK_CATEGORIES : DRINK_REFERENCE_CATEGORIES),
        promptInstruction: 'Drink references define cocktail or beverage appearance only. Drink Studio Shots are approved AI truth references.',
      },
      {
        key: 'model',
        label: 'Guest/model references',
        ids: rawModelAssetIds,
        allowedCategories: new Set(MODEL_REFERENCE_CATEGORIES),
        promptInstruction: 'Model references define guest appearance and styling only.',
      },
      {
        key: 'pinterest',
        label: 'Pinterest inspiration references',
        ids: rawPinterestIds,
        allowedCategories: new Set(['pinterest_inspiration']),
        promptInstruction: 'Pinterest references are composition only. Use them for crop, camera angle, framing, gesture, and arrangement only. Do not copy directly or replace venue, table, surface, props, plate, cutlery, glassware, people, food, drink, outfit, accessory, styling, or product truth references.',
      },
    ]

    const legacyIds = idsFrom(body.asset_upload_ids, 4)
    if (legacyIds.length > 0 && groups.every(group => group.ids.length === 0)) {
      groups.push({
        key: 'legacy',
        label: 'Legacy references',
        ids: legacyIds,
        allowedCategories: new Set(['exteriors', 'interiors', 'venue_items', ...FOOD_REFERENCE_CATEGORIES, ...DRINK_REFERENCE_CATEGORIES, ...MODEL_REFERENCE_CATEGORIES]),
        promptInstruction: 'Legacy references are contextual references. Use them only for their visible asset type.',
      })
    }

    const selectedGroups = groups.filter(group => group.ids.length > 0)
    const allIds = Array.from(new Set(selectedGroups.flatMap(group => group.ids)))
    const guestModelIds = rawGuestModelIds
    const guestModelOutfitRefs = rawOutfitRefs
    const guestModelAccessoryRefs = rawAccessoryRefs
    let environmentAnchorSummary = ''
    let selectedFoodDetails: string[] = []
    let selectedDrinkDetails: string[] = []
    let venueSpatialPrompt = ''
    let venueSpatialMetadataWarning = ''
    let hasTruthEnvironmentReference = false
    let automaticServicewareReferenceCount = 0
    referenceCount = allIds.length + guestModelIds.length + guestModelOutfitRefs.length + guestModelAccessoryRefs.length
    const needsAutomaticServiceware = !isProductPhotographyWorkflow && !isVenuePhotographyWorkflow && !isReferenceRebuildWorkflow && (rawFoodIds.length > 0 || rawDrinkIds.length > 0 || guestModelIds.length + rawModelAssetIds.length > 0)

    const selectedGuestModelIdSet = new Set(guestModelIds)
    const unselectedGuestModelRef = [...guestModelOutfitRefs, ...guestModelAccessoryRefs].find(ref => !selectedGuestModelIdSet.has(ref.model_id))
    if (unselectedGuestModelRef) {
      return errorPayload({
        error: 'Outfit and accessory references must belong to a selected guest model.',
        failureStep,
        reason: 'unselected_guest_model_reference',
        actionNeeded: 'Select the guest model before selecting or sending its outfit/accessory references.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
      })
    }

    const referenceParts: ProviderReferencePart[] = []
    const referenceAssets: Array<Pick<ReferenceAsset, 'id' | 'file_name' | 'asset_category'> & { reference_group: ReferenceGroupKey; source?: 'asset_upload' | 'guest_model' | 'guest_model_outfit' | 'guest_model_accessory' }> = []
    const payloadDebugReferences: PayloadDebugReference[] = []
    const payloadDownloadFailures: PayloadDebugReference[] = []
    const queuedReferences: Array<{
      rank: number
      part: { inlineData: { mimeType: string; data: string } }
      asset: Pick<ReferenceAsset, 'id' | 'file_name' | 'asset_category'> & { reference_group: ReferenceGroupKey; source?: 'asset_upload' | 'guest_model' | 'guest_model_outfit' | 'guest_model_accessory' }
      debug: PayloadDebugReference
    }> = []
    const queueReference = (
      reference_group: ReferenceGroupKey,
      part: { inlineData: { mimeType: string; data: string } },
      asset: Pick<ReferenceAsset, 'id' | 'file_name' | 'asset_category'> & { reference_group: ReferenceGroupKey; source?: 'asset_upload' | 'guest_model' | 'guest_model_outfit' | 'guest_model_accessory' },
      debug: Omit<PayloadDebugReference, 'role' | 'id' | 'label' | 'source' | 'download_succeeded'> & {
        owner?: string | null
        storage_path?: string | null
      } = {}
    ) => {
      queuedReferences.push({
        rank: isReferenceRebuildWorkflow ? REFERENCE_REBUILD_ROLE_RANK[reference_group] : REFERENCE_ROLE_RANK[reference_group],
        part,
        asset,
        debug: {
          role: reference_group,
          owner: debug.owner ?? null,
          id: asset.id,
          label: asset.file_name,
          source: asset.source ?? 'asset_upload',
          storage_path: debug.storage_path ?? null,
          transport: 'inline_base64',
          provider_acceptance: dryRun ? 'dry_run_not_sent' : 'request_prepared',
          mime_type: part.inlineData.mimeType,
          byte_size: Math.round((part.inlineData.data.length * 3) / 4),
          download_succeeded: true,
          failure: null,
        },
      })
    }
    const recordDownloadFailure = (failure: PayloadDebugReference) => {
      payloadDownloadFailures.push({ ...failure, download_succeeded: false })
    }

    const guestModelReferenceModelIds = Array.from(new Set([
      ...guestModelIds,
      ...guestModelOutfitRefs.map(ref => ref.model_id),
      ...guestModelAccessoryRefs.map(ref => ref.model_id),
    ]))

    if (guestModelReferenceModelIds.length > 0) {
      failureStep = 'validating_guest_model_references'
      const [legacyModelRes, aiModelRes] = await Promise.all([
        sb
          .from('guest_models')
          .select('id')
          .eq('client_id', clientId)
          .in('id', guestModelReferenceModelIds),
        sb
          .from('ai_models')
          .select('id')
          .eq('client_id', clientId)
          .eq('status', 'approved')
          .in('id', guestModelReferenceModelIds),
      ])

      const validationError = legacyModelRes.error ?? aiModelRes.error
      if (validationError) {
        return errorPayload({
          error: `Failed to validate guest model references: ${validationError.message}`,
          failureStep,
          startedAt,
          status: 500,
          referenceCount,
          quality: requestedQuality,
          aspectRatio,
        })
      }

      const validGuestModelIds = new Set([
        ...(legacyModelRes.data ?? []).map(row => row.id as string),
        ...(aiModelRes.data ?? []).map(row => row.id as string),
      ])
      const missingGuestModelId = guestModelReferenceModelIds.find(modelId => !validGuestModelIds.has(modelId))
      if (missingGuestModelId) {
        return errorPayload({
          error: 'One or more selected guest model references do not belong to this client.',
          failureStep,
          reason: 'invalid_guest_model_reference',
          actionNeeded: 'Refresh the page and select guest model references from this client only.',
          startedAt,
          status: 400,
          referenceCount,
          quality: requestedQuality,
          aspectRatio,
        })
      }
    }

    if (allIds.length > 0) {
      failureStep = 'loading_reference_assets'
      let query = sb
        .from('asset_uploads')
        .select('id, file_name, asset_category, file_path, optimized_file_path, ai_preview_path, extracted_summary, metadata')
        .in('id', allIds)

      if (clientId) query = query.eq('client_id', clientId)

      const { data, error } = await query
      if (error) {
        return errorPayload({
          error: `Failed to load reference assets: ${error.message}`,
          failureStep,
          startedAt,
          status: 500,
          referenceCount,
          quality: requestedQuality,
          aspectRatio,
        })
      }

      const legacyAssets = (data ?? []) as ReferenceAsset[]
      let staffAssets: ReferenceAsset[] = []
      if (rawModelAssetIds.length > 0) {
        const { data: staffRecords, error: staffRecordsError } = await sb
          .from('client_brain_v2_records')
          .select('id, title, metadata')
          .eq('client_id', clientId)
          .eq('top_section', 'assets')
          .eq('metadata->>asset_category', 'staff')
          .eq('metadata->>approved_for_generation', 'true')
          .in('id', rawModelAssetIds)
        if (staffRecordsError) {
          return errorPayload({ error: `Failed to validate Staff identity references: ${staffRecordsError.message}`, failureStep, startedAt, status: 500, referenceCount, quality: requestedQuality, aspectRatio })
        }
        const activeRecords = (staffRecords ?? []).filter(record => {
          const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? record.metadata as Record<string, unknown> : {}
          return metadata.staff_active !== false
        })
        const activeRecordIds = activeRecords.map(record => record.id)
        if (activeRecordIds.length > 0) {
          const { data: assignments, error: assignmentsError } = await sb
            .from('client_brain_v2_record_files')
            .select('record_id, file_object_id, sort_order')
            .eq('client_id', clientId)
            .eq('semantic_role', 'truth_reference')
            .eq('approval_status', 'approved')
            .in('record_id', activeRecordIds)
            .order('sort_order')
          if (assignmentsError) return errorPayload({ error: `Failed to load Staff identity references: ${assignmentsError.message}`, failureStep, startedAt, status: 500, referenceCount, quality: requestedQuality, aspectRatio })
          const fileIds = [...new Set((assignments ?? []).map(assignment => assignment.file_object_id))]
          if (fileIds.length > 0) {
            const { data: files, error: filesError } = await sb.from('client_brain_file_objects').select('id, storage_path, file_name').in('id', fileIds)
            if (filesError) return errorPayload({ error: `Failed to load Staff identity file details: ${filesError.message}`, failureStep, startedAt, status: 500, referenceCount, quality: requestedQuality, aspectRatio })
            const fileById = new Map((files ?? []).map(file => [file.id, file]))
            const firstFileByRecord = new Map<string, { storage_path: string; file_name: string }>()
            for (const assignment of assignments ?? []) {
              if (firstFileByRecord.has(assignment.record_id)) continue
              const file = fileById.get(assignment.file_object_id)
              if (file) firstFileByRecord.set(assignment.record_id, file)
            }
            staffAssets = activeRecords.flatMap(record => {
              const file = firstFileByRecord.get(record.id)
              return file ? [{ id: record.id, file_name: record.title || file.file_name, asset_category: 'staff', file_path: file.storage_path, optimized_file_path: null, ai_preview_path: null, metadata: record.metadata }] : []
            })
          }
        }
      }
      const assetsById = new Map([...legacyAssets, ...staffAssets].map(asset => [asset.id, asset]))
      const selectedVenueAssets = rawVenueIds.map(id => assetsById.get(id)).filter((asset): asset is ReferenceAsset => Boolean(asset))
      hasTruthEnvironmentReference = selectedVenueAssets.some(asset => [...INDOOR_VENUE_REFERENCE_CATEGORIES, ...OUTDOOR_VENUE_REFERENCE_CATEGORIES].includes(normalizeCategory(asset.asset_category)))
      environmentAnchorSummary = summarizeEnvironmentAnchorAssets(selectedVenueAssets)
      venueSpatialPrompt = buildSimplifiedInteriorVenueTruthPrompt(selectedVenueAssets)
        || buildVenueSpatialPrompt(resolveVenueSpatialMetadataList(selectedVenueAssets, location))
      const weakVenueAsset = selectedVenueAssets.find(asset => missingVenueSpatialMetadataFieldsFromAsset(asset).length > 0)
      venueSpatialMetadataWarning = weakVenueAsset
        ? `Selected venue reference has weak spatial/table metadata. Missing: ${missingVenueSpatialMetadataFieldsFromAsset(weakVenueAsset).join(', ')}.`
        : ''
      selectedFoodDetails = rawFoodIds.map(id => assetsById.get(id)).filter((asset): asset is ReferenceAsset => Boolean(asset)).map(asset => summarizeFoodOrDrinkAsset(asset, 'Food'))
      selectedDrinkDetails = rawDrinkIds.map(id => assetsById.get(id)).filter((asset): asset is ReferenceAsset => Boolean(asset)).map(asset => summarizeFoodOrDrinkAsset(asset, 'Drink'))

      for (const group of selectedGroups) {
        for (const assetId of group.ids) {
          const asset = assetsById.get(assetId)
          if (!asset) {
            return errorPayload({
              error: 'One or more selected reference assets could not be found for this client.',
              failureStep,
              reason: 'reference_asset_not_found',
              actionNeeded: 'Refresh the page and select references that belong to this client.',
              startedAt,
              status: 400,
              referenceCount,
              quality: requestedQuality,
              aspectRatio,
            })
          }
          if (!categoryAllowed(asset.asset_category, group.allowedCategories)) {
            return errorPayload({
              error: `${group.label} includes an asset with an invalid category: ${asset.asset_category ?? 'unknown'}.`,
              failureStep,
              reason: 'invalid_reference_category',
              actionNeeded: 'Use references from the matching role and Location only.',
              startedAt,
              status: 400,
              referenceCount,
              quality: requestedQuality,
              aspectRatio,
            })
          }
        }
      }

      failureStep = 'downloading_reference_assets'
      for (const group of selectedGroups) {
        for (const assetId of group.ids) {
          const asset = assetsById.get(assetId)
          if (!asset || !asset.asset_category || !categoryAllowed(asset.asset_category, group.allowedCategories)) continue
          const path = asset.ai_preview_path || asset.optimized_file_path || asset.file_path
          if (!path) {
            recordDownloadFailure({
              role: group.key,
              id: asset.id,
              label: asset.file_name,
              source: 'asset_upload',
              storage_path: null,
              download_succeeded: false,
              failure: 'missing_storage_path',
            })
            continue
          }
          const { data: file, error: downloadError } = await sb.storage.from(CLIENT_ASSETS_BUCKET).download(path)
          if (downloadError || !file) {
            recordDownloadFailure({
              role: group.key,
              id: asset.id,
              label: asset.file_name,
              source: 'asset_upload',
              storage_path: path,
              download_succeeded: false,
              failure: downloadError?.message ?? 'download_failed',
            })
            continue
          }
          const bytes = Buffer.from(await file.arrayBuffer())
          const providerFileName = group.key === 'food'
            ? summarizeFoodOrDrinkAsset(asset, 'Food')
            : group.key === 'drink'
              ? summarizeFoodOrDrinkAsset(asset, 'Drink')
              : asset.file_name
          queueReference(group.key, {
            inlineData: {
              mimeType: file.type || 'image/jpeg',
              data: bytes.toString('base64'),
            },
          }, {
            id: asset.id,
            file_name: providerFileName,
            asset_category: asset.asset_category,
            reference_group: group.key,
            source: 'asset_upload',
          }, { storage_path: path })
        }
      }
    }

    if (clientId && needsAutomaticServiceware) {
      failureStep = 'loading_automatic_serviceware_references'
      const { data: servicewareAssets, error: servicewareError } = await sb
        .from('asset_uploads')
        .select('id, file_name, asset_category, file_path, optimized_file_path, ai_preview_path, extracted_summary, metadata')
        .eq('client_id', clientId)
        .eq('asset_category', 'venue_items')
        .neq('status', 'archived')
        .limit(20)

      if (servicewareError) {
        return errorPayload({
          error: `Failed to load automatic serviceware references: ${servicewareError.message}`,
          failureStep,
          startedAt,
          status: 500,
          referenceCount,
          quality: requestedQuality,
          aspectRatio,
        })
      }

      const alreadyQueuedAssetIds = new Set(queuedReferences.map(item => item.asset.id))
      for (const { kind, asset } of selectCanonicalServicewareAssets((servicewareAssets ?? []) as ReferenceAsset[])) {
        if (alreadyQueuedAssetIds.has(asset.id)) continue
        const path = asset.ai_preview_path || asset.optimized_file_path || asset.file_path
        const label = servicewareTruthLabel(asset, kind)
        if (!path) {
          recordDownloadFailure({
            role: 'service',
            id: asset.id,
            label,
            source: 'asset_upload',
            storage_path: null,
            download_succeeded: false,
            failure: 'missing_storage_path',
          })
          continue
        }
        const { data: file, error: downloadError } = await sb.storage.from(CLIENT_ASSETS_BUCKET).download(path)
        if (downloadError || !file) {
          recordDownloadFailure({
            role: 'service',
            id: asset.id,
            label,
            source: 'asset_upload',
            storage_path: path,
            download_succeeded: false,
            failure: downloadError?.message ?? 'download_failed',
          })
          continue
        }
        const bytes = Buffer.from(await file.arrayBuffer())
        queueReference('service', {
          inlineData: {
            mimeType: file.type || 'image/jpeg',
            data: bytes.toString('base64'),
          },
        }, {
          id: asset.id,
          file_name: label,
          asset_category: asset.asset_category,
          reference_group: 'service',
          source: 'asset_upload',
        }, { storage_path: path })
        automaticServicewareReferenceCount += 1
      }
    }

    if (guestModelIds.length > 0) {
      failureStep = 'loading_guest_models'
      let query = sb
        .from('guest_models')
        .select('id, name, model_references')
        .in('id', guestModelIds)

      if (clientId) query = query.eq('client_id', clientId)

      const { data, error } = await query
      if (error) {
        return errorPayload({
          error: `Failed to load guest models: ${error.message}`,
          failureStep,
          startedAt,
          status: 500,
          referenceCount,
          quality: requestedQuality,
          aspectRatio,
        })
      }

      failureStep = 'downloading_guest_model_images'
      for (const model of (data ?? []) as GuestModelRow[]) {
        const image = guestModelPrimaryReference(model)
        const owner = model.name || 'Guest model'
        if (!image) {
          recordDownloadFailure({
            role: 'model',
            owner,
            id: model.id,
            label: `${owner} portrait identity reference`,
            source: 'guest_model',
            storage_path: null,
            download_succeeded: false,
            failure: 'missing_guest_model_portrait',
          })
          continue
        }

        let bytes: Buffer | null = null
        let mimeType = image.mimeType
        if (image.storagePath) {
          const { data: file, error: downloadError } = await sb.storage.from(GUEST_MODELS_BUCKET).download(image.storagePath)
          if (!downloadError && file) {
            bytes = Buffer.from(await file.arrayBuffer())
            mimeType = file.type || mimeType
          }
        }

        if (!bytes && image.publicUrl) {
          const response = await fetch(image.publicUrl)
          if (response.ok) {
            bytes = Buffer.from(await response.arrayBuffer())
            mimeType = response.headers.get('content-type') ?? mimeType
          }
        }

        if (!bytes) {
          recordDownloadFailure({
            role: 'model',
            owner,
            id: model.id,
            label: `${owner} portrait identity reference`,
            source: 'guest_model',
            storage_path: image.storagePath,
            download_succeeded: false,
            failure: 'download_failed',
          })
          continue
        }

        queueReference('model', {
          inlineData: {
            mimeType,
            data: bytes.toString('base64'),
          },
        }, {
          id: model.id,
          file_name: `${owner} portrait identity reference`,
          asset_category: 'guest_model_portrait_identity',
          reference_group: 'model',
          source: 'guest_model',
        }, { owner, storage_path: image.storagePath })
      }

      const { data: aiModels, error: aiModelError } = await sb
        .from('ai_models')
        .select('id, model_name')
        .eq('client_id', clientId)
        .eq('status', 'approved')
        .in('id', guestModelIds)

      if (aiModelError) {
        return errorPayload({
          error: `Failed to load finalised AI models: ${aiModelError.message}`,
          failureStep,
          startedAt,
          status: 500,
          referenceCount,
          quality: requestedQuality,
          aspectRatio,
        })
      }

      const aiModelRows = (aiModels ?? []) as AiModelRow[]
      if (aiModelRows.length > 0) {
        const { data: aiModelAssets, error: aiModelAssetError } = await sb
          .from('ai_model_assets')
          .select('id, model_id, asset_type, image_url, storage_path, version_number')
          .eq('client_id', clientId)
          .eq('status', 'approved')
          .eq('asset_type', 'front_face')
          .in('model_id', aiModelRows.map(model => model.id))

        if (aiModelAssetError) {
          return errorPayload({
            error: `Failed to load finalised AI model portraits: ${aiModelAssetError.message}`,
            failureStep,
            startedAt,
            status: 500,
            referenceCount,
            quality: requestedQuality,
            aspectRatio,
          })
        }

        const aiModelAssetRows = (aiModelAssets ?? []) as AiModelAssetRow[]
        for (const model of aiModelRows) {
          const image = aiModelPrimaryReference(aiModelAssetRows, model.id)
          const owner = model.model_name || 'AI model'
          if (!image) {
            recordDownloadFailure({
              role: 'model',
              owner,
              id: model.id,
              label: `${owner} approved front face identity reference`,
              source: 'ai_model',
              storage_path: null,
              download_succeeded: false,
              failure: 'missing_ai_model_front_face',
            })
            continue
          }

          let bytes: Buffer | null = null
          let mimeType = image.mimeType
          if (image.storagePath) {
            const { data: file, error: downloadError } = await sb.storage.from(GUEST_MODELS_BUCKET).download(image.storagePath)
            if (!downloadError && file) {
              bytes = Buffer.from(await file.arrayBuffer())
              mimeType = file.type || mimeType
            }
          }

          if (!bytes && image.publicUrl) {
            const response = await fetch(image.publicUrl)
            if (response.ok) {
              bytes = Buffer.from(await response.arrayBuffer())
              mimeType = response.headers.get('content-type') ?? mimeType
            }
          }

          if (!bytes) {
            recordDownloadFailure({
              role: 'model',
              owner,
              id: model.id,
              label: `${owner} approved front face identity reference`,
              source: 'ai_model',
              storage_path: image.storagePath,
              download_succeeded: false,
              failure: 'download_failed',
            })
            continue
          }

          queueReference('model', {
            inlineData: {
              mimeType,
              data: bytes.toString('base64'),
            },
          }, {
            id: model.id,
            file_name: `${owner} approved front face identity reference`,
            asset_category: 'ai_model_front_face_identity',
            reference_group: 'model',
            source: 'guest_model',
          }, { owner, storage_path: image.storagePath })
        }
      }
    }

    if (guestModelOutfitRefs.length > 0) {
      failureStep = 'downloading_guest_model_outfit_images'
      for (const outfit of guestModelOutfitRefs) {
        let bytes: Buffer | null = null
        let mimeType = 'image/jpeg'
        const owner = outfit.model_name || `guest model ${outfit.model_id}`
        const label = `${owner} outfit reference · ${outfit.set_name} · ${outfit.label}`

        if (outfit.storage_path) {
          const expectedPrefix = clientId ? `clients/${clientId}/models/${outfit.model_id}/outfits/` : ''
          const pathAllowed = expectedPrefix ? outfit.storage_path.startsWith(expectedPrefix) : outfit.storage_path.includes(`/models/${outfit.model_id}/outfits/`)
          if (pathAllowed) {
            const { data: file, error: downloadError } = await sb.storage.from(GUEST_MODELS_BUCKET).download(outfit.storage_path)
            if (!downloadError && file) {
              bytes = Buffer.from(await file.arrayBuffer())
              mimeType = file.type || mimeType
            }
          }
        }

        if (!bytes && outfit.public_url) {
          const response = await fetch(outfit.public_url)
          if (response.ok) {
            bytes = Buffer.from(await response.arrayBuffer())
            mimeType = response.headers.get('content-type') ?? mimeType
          }
        }

        if (!bytes) {
          recordDownloadFailure({
            role: 'guest_model_outfit',
            owner,
            id: outfit.storage_path || outfit.public_url || `${outfit.model_id}-${outfit.label}`,
            label,
            source: 'guest_model_outfit',
            storage_path: outfit.storage_path,
            download_succeeded: false,
            failure: 'download_failed_or_path_not_allowed',
          })
          continue
        }

        queueReference('guest_model_outfit', {
          inlineData: {
            mimeType,
            data: bytes.toString('base64'),
          },
        }, {
          id: outfit.storage_path || outfit.public_url || `${outfit.model_id}-${outfit.label}`,
          file_name: label,
          asset_category: 'guest_model_outfit',
          reference_group: 'guest_model_outfit',
          source: 'guest_model_outfit',
        }, { owner, storage_path: outfit.storage_path })
      }
    }

    if (guestModelAccessoryRefs.length > 0) {
      failureStep = 'downloading_guest_model_accessory_images'
      for (const accessory of guestModelAccessoryRefs) {
        let bytes: Buffer | null = null
        let mimeType = 'image/jpeg'
        const owner = accessory.model_name || `guest model ${accessory.model_id}`
        const label = `${owner} accessory reference · ${accessory.label}${accessory.details ? ` · ${cleanLine(accessory.details, 260)}` : ''}`

        if (accessory.storage_path) {
          const expectedPrefix = clientId ? `clients/${clientId}/models/${accessory.model_id}/accessories/` : ''
          const pathAllowed = expectedPrefix ? accessory.storage_path.startsWith(expectedPrefix) : accessory.storage_path.includes(`/models/${accessory.model_id}/accessories/`)
          if (pathAllowed) {
            const { data: file, error: downloadError } = await sb.storage.from(GUEST_MODELS_BUCKET).download(accessory.storage_path)
            if (!downloadError && file) {
              bytes = Buffer.from(await file.arrayBuffer())
              mimeType = file.type || mimeType
            }
          }
        }

        if (!bytes && accessory.public_url) {
          const response = await fetch(accessory.public_url)
          if (response.ok) {
            bytes = Buffer.from(await response.arrayBuffer())
            mimeType = response.headers.get('content-type') ?? mimeType
          }
        }

        if (!bytes) {
          recordDownloadFailure({
            role: 'guest_model_accessory',
            owner,
            id: accessory.storage_path || accessory.public_url || `${accessory.model_id}-${accessory.label}`,
            label,
            source: 'guest_model_accessory',
            storage_path: accessory.storage_path,
            download_succeeded: false,
            failure: 'download_failed_or_path_not_allowed',
          })
          continue
        }

        queueReference('guest_model_accessory', {
          inlineData: {
            mimeType,
            data: bytes.toString('base64'),
          },
        }, {
          id: accessory.storage_path || accessory.public_url || `${accessory.model_id}-${accessory.label}`,
          file_name: label,
          asset_category: 'guest_model_accessory',
          reference_group: 'guest_model_accessory',
          source: 'guest_model_accessory',
        }, { owner, storage_path: accessory.storage_path })
      }
    }

    queuedReferences
      .sort((left, right) => left.rank - right.rank)
      .forEach((item, index) => {
        const debug = { ...item.debug, order: index + 1 }
        referenceParts.push({ label: '', inlineData: item.part.inlineData })
        referenceAssets.push(item.asset)
        payloadDebugReferences.push(debug)
      })

    const resolvedFoodDrinkAssignments = resolveFoodDrinkAssignments(payloadDebugReferences, rawFoodDrinkAssignments)
    payloadDebugReferences.forEach((debug, index) => {
      const providerLabel = providerReferenceLabel(debug, resolvedFoodDrinkAssignments, venueReasoningMode)
      debug.provider_label = providerLabel
      if (referenceParts[index]) referenceParts[index].label = providerLabel
    })

    if (!isProductPhotographyWorkflow && !isReferenceRebuildWorkflow && !referenceAssets.some(asset => asset.reference_group === 'venue')) {
      return errorPayload({
        error: 'The selected venue reference could not be loaded.',
        failureStep: 'downloading_reference_assets',
        reason: 'venue_reference_unavailable',
        actionNeeded: 'Select a different venue reference or refresh signed/storage assets before trying again.',
        startedAt,
        status: 400,
        referenceCount,
        quality: requestedQuality,
        aspectRatio,
        payloadDebug: {
          dry_run: dryRun,
          provider: 'google-gemini',
          model: MODEL,
          image_config: {
            aspect_ratio: aspectRatio,
            requested_quality: requestedQuality,
            image_size: requestedQuality === '4k' ? '4K' : '1K',
          },
          prompt_length: rawPrompt.length,
          compressed_prompt_length: prompt.length,
          compression: initialPromptCompression.debug,
          image_part_count: referenceParts.length,
          selected_reference_count: referenceCount,
          sent_reference_count: referenceParts.length,
          ordered_references: payloadDebugReferences,
          download_failures: payloadDownloadFailures,
        },
      })
    }

    const selectedGuestNames = referenceAssets
      .filter(asset => asset.source === 'guest_model')
      .map(asset => asset.file_name)
      .filter((name, index, list) => Boolean(name) && list.indexOf(name) === index)
    const subjectPlacementLockBlock = buildSubjectPlacementLockBlock({
      notes: [directorNotes, regenerationNotes, promptForVenueMode].filter(Boolean).join('\n'),
      selectedSubjectNames: selectedGuestNames,
      hasSubjects: selectedGuestNames.length > 0 || rawModelAssetIds.length > 0,
    })
    const identityInstructions = selectedGuestNames.length > 0
      ? selectedGuestNames.map(name => `- ${name} portrait identity reference is the authority for ${name}'s face identity, facial structure, skin texture, pores, hairline, individual hair strands, eye detail, age range, natural facial asymmetry, and realistic skin tone variation. Preserve high-definition facial texture and keep ${name}'s face sharp enough to crop for social/ad use.`).join('\n')
      : ''
    const referenceInstructions = [...selectedGroups]
      .sort((left, right) => (isReferenceRebuildWorkflow ? REFERENCE_REBUILD_ROLE_RANK[left.key] : REFERENCE_ROLE_RANK[left.key]) - (isReferenceRebuildWorkflow ? REFERENCE_REBUILD_ROLE_RANK[right.key] : REFERENCE_ROLE_RANK[right.key]))
      .map(group => `- ${group.label}: ${group.promptInstruction}`)
      .join('\n')
    const outfitInstructions = guestModelOutfitRefs.length > 0
      ? guestModelOutfitRefs
        .map(outfit => {
          const owner = outfit.model_name || `guest model ${outfit.model_id}`
          return `- ${owner} outfit reference: ${outfit.label} (${outfit.set_name}) is a ${outfit.time_of_day} clothing-only reference. Use it only for ${owner}'s clothing, silhouette, fabric, color, fit, and styling. Do not borrow face detail, facial expression, or identity quality from this outfit image.`
        })
        .join('\n')
      : ''
    const pinterestNotes = typeof body.pinterest_notes === 'string' ? body.pinterest_notes.trim().slice(0, 900) : ''
    const pinterestInstructions = rawPinterestIds.length > 0 || pinterestNotes
      ? [
        '- Pinterest references are inspiration reference only.',
        '- Use these only for crop, camera angle, framing, gesture, and arrangement inspiration.',
        '- Do not copy the images directly.',
        '- Do not replace venue, table, surface, props, plate, cutlery, glassware, people, food, drink, outfit, accessory, styling, or product truth references.',
        '- Do not introduce objects from Pinterest unless explicitly requested in notes.',
        pinterestNotes ? `- User inspiration notes: ${pinterestNotes}` : '',
      ].filter(Boolean).join('\n')
      : ''
    const accessoryInstructions = guestModelAccessoryRefs.length > 0
      ? guestModelAccessoryRefs
        .map(accessory => {
          const owner = accessory.model_name || `guest model ${accessory.model_id}`
          return `- ${owner}: ${accessory.label}${accessory.details ? ` — ${cleanLine(accessory.details, 180)}` : ''}; object-only, owner-bound, exact accessory truth.`
        })
        .join('\n')
      : ''

    failureStep = 'loading_client_generation_context'
    const [clientName, hasSpatialLayout, venueServiceContext] = clientId
      ? await Promise.all([
        sb
          .from('clients')
          .select('name')
          .eq('id', clientId)
          .maybeSingle()
          .then(({ data }) => data?.name ?? null),
        sb
          .from('asset_uploads')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('asset_category', 'blueprint_layouts')
          .neq('status', 'archived')
          .then(({ count }) => (count ?? 0) > 0),
        sb
          .from('asset_uploads')
          .select('file_name, metadata')
          .eq('client_id', clientId)
          .eq('asset_category', 'venue_items')
          .neq('status', 'archived')
          .limit(8)
          .then(({ data }) => summarizeVenueServiceAssets((data ?? []) as Array<Pick<ReferenceAsset, 'file_name' | 'metadata'>>)),
      ])
      : [null, false, ''] as const
    const isDemoClientBGeneration = isDemoClientBClient({ clientId, clientName })
    const generationQaPrompt = buildClientGenerationQaPrompt({
      clientId,
      clientName,
      location,
      venueZone,
      guestCount: rawGuestModelIds.length + rawModelAssetIds.length,
      hasPortraitReferences: rawGuestModelIds.length + rawModelAssetIds.length > 0,
      hasAccessoryReferences: rawAccessoryRefs.length > 0,
      hasFoodReferences: rawFoodIds.length > 0,
      hasDrinkReferences: rawDrinkIds.length > 0,
      hasSpatialLayout,
      hasVenueReference: rawVenueIds.length > 0,
    })
    const venueZonePrompt = buildDemoClientDVenueZonePrompt({
      clientName,
      location,
      selectedZone: venueZone,
      environmentSummary: environmentAnchorSummary,
    })

    failureStep = 'loading_visual_dna'
    const visualDnaLines = clientId
      ? await sb
        .from('client_brain')
        .select('answer')
        .eq('client_id', clientId)
        .eq('question_key', 'visual_dna')
        .eq('status', 'approved')
        .maybeSingle()
        .then(({ data }) => compactVisualDNA(parseVisualDNA(data?.answer ?? null)))
      : []
    const sourceLockedBackgroundRules = rawVenueIds.length > 0 && venueReasoningMode === 'locked_scene_plate'
      ? [
        'Match Locked: selected venue image is the primary visual truth.',
        'Do not reconstruct the venue from text; text only clarifies visible details.',
        'Insert guests, selected food, selected drinks, and selected accessories into the existing visible environment.',
        'Do not rotate, redesign, invent unseen areas, or create a new angle the image does not support.',
      ]
      : []
    const foodOneToOneRules = rawFoodIds.length > 0
      ? [
        'Food refs are exact dish truth: preserve full dish structure, plating, serving vessel, garnish, sauce, side components, texture, color, and item count.',
        'BBQ seabass and similar composed fish dishes must retain visible sauce and side elements from the reference; do not reduce them to generic fish.',
        'Burger refs should gain crisp bun/meat/side texture while preserving dish identity, stack structure, garnish, and sauce.',
      ]
      : []
    const compactVenueZone = venueZonePrompt
      ? venueZonePrompt.replace(/^Venue Zone Rules[^\n]*\n?/i, '').trim()
      : ''
    const compactQaRules = generationQaPrompt
      ? compactQaMemoryForPrompt(generationQaPrompt)
      : ''
    const userSetup = promptForVenueMode.startsWith('[SCENE]')
      ? promptForVenueMode.trim()
      : cleanLine(promptForVenueMode, 1200)
    const promptIsStructuredV2 = userSetup.startsWith('[SCENE]')
    const referenceMapBlock = buildReferenceMap(payloadDebugReferences, resolvedFoodDrinkAssignments, venueReasoningMode)
    const referenceOrderAssertion = assertReferenceOrderIntegrity(payloadDebugReferences, referenceParts, referenceMapBlock)
    const lockedScenePlateBlock = buildLockedScenePlatePrompt({
      fidelity: compositionFidelity,
      hasTruthEnvironment: hasTruthEnvironmentReference,
      label: 'selected venue reference',
    })
    const cameraRuleBlock = buildCameraRulePrompt({
      fidelity: compositionFidelity,
      hasTruthEnvironment: hasTruthEnvironmentReference,
    })
    const providerGuidanceBlock = buildProviderGuidancePrompt(hasTruthEnvironmentReference)
    const permanentPromptV2LearningBlock = buildPermanentPromptV2LearningBlock()
    const foodTruthBlock = rawFoodIds.length > 0
      ? `[FOOD_TRUTH]\nSelected Studio Food Shots are locked Food Truth Assets.\nRecreate the exact selected food truth asset as the actual dish, not an inspired-by, similar-to, or reinterpreted version.\nPreserve ingredients, bread type, vessel/plate, garnish, arrangement, portion, presentation, dish identity, shape, ingredient structure, plating style, portion logic, and visual proportions.\nDo not invent different bread, garnish, plate shape, sauce, dish structure, portion logic, or presentation.\nIf a bread reference is selected, reproduce the exact bread type and arrangement as closely as possible.`
      : ''
    const strictNegativeBlock = buildStrictNegativePrompt({
      hasTruthEnvironment: hasTruthEnvironmentReference,
      hasFoodTruth: rawFoodIds.length > 0,
    })
    const providerCannotStrictLock = strictScenePlateUnsupported(NANO_BANANA_PROVIDER_CAPABILITIES)
    const shouldUseLockedScenePlate = venueReasoningMode === 'locked_scene_plate'
    const shouldUseNanoBananaProVisualTruth = venueReasoningMode === 'nano_banana_pro_visual_truth'
    const selectedSubjectCount = rawGuestModelIds.length + rawModelAssetIds.length
    const shouldUseVisibleReferenceLock = hasTruthEnvironmentReference && (venueReasoningMode === 'flexible_venue_context' || shouldUseLockedScenePlate)
    const visualTruthPriorityBlock = hasTruthEnvironmentReference
      ? `[VISUAL_TRUTH_PRIORITY]\n- Selected venue image is the primary source of truth.\n- Do not recreate, reinterpret, or redesign the venue from text.\n- Text descriptions only clarify visible details.\n- If image and text appear to conflict, prefer the image.`
      : ''
    const democlientbVenueLockBlock = buildDemoClientBVenueLockBlock({
      clientId,
      clientName,
      hasVenueReference: hasTruthEnvironmentReference,
    })
    const democlientbVenueMemoryBlock = buildDemoClientBVenueMemoryBlock({
      clientId,
      clientName,
      hasVenueReference: hasTruthEnvironmentReference,
    })
    const visibleReferenceLockBlock = shouldUseVisibleReferenceLock
      ? `[VISIBLE_REFERENCE_LOCK]\n- Use only venue elements visible in the selected venue image.\n- If it is not visible, do not invent it.\n- Add people, food, drinks, and accessories inside the visible image reality.`
      : ''
    const cameraRealityLockBlock = shouldUseVisibleReferenceLock
      ? `[CAMERA_REALITY_LOCK]\n- Preserve the source image's camera family and visible view.\n- Minor crop or tiny camera-distance refinement only.\n- Do not rotate to a new angle, reveal unseen areas, invent new room sections, or redesign the venue around the subjects.`
      : ''
    const actionLockBlock = directorNotes
      ? `[ACTION_LOCK]\n- Director action note is binding: ${directorNotes}\n- Preserve specified gaze direction, facial expression, body orientation, hand placement, object interaction, and primary subject hierarchy.\n- If the note says a subject looks into camera, enforce direct eye contact. If it says the subject holds a selected drink/object, show that object visibly in the correct hand/pose.`
      : ''
    const subjectCountLockBlock = selectedSubjectCount > 0
      ? `[SUBJECT_COUNT_LOCK]\n- Exactly ${selectedSubjectCount} visible guest${selectedSubjectCount === 1 ? '' : 's'}.\n- Do not generate extra diners, conversation partners, background companions, extra hands, implied guests across the table, or additional seated people.\n- Keep the selected subject${selectedSubjectCount === 1 ? '' : 's'} as the only visible guest${selectedSubjectCount === 1 ? '' : 's'}.`
      : ''
    const foodDrinkVisibilityLockBlock = rawFoodIds.length > 0 || rawDrinkIds.length > 0
      ? `[FOOD_DRINK_VISIBILITY_LOCK]\n- Selected food and drink truth assets must remain visible, recognizable, and assigned as requested.\n${rawFoodIds.length > 0 ? '- Food: preserve exact plate/vessel, ingredients, bread type, garnish, sauce, arrangement, portion, and presentation. No reinterpretation or similar substitute.' : ''}\n${rawDrinkIds.length > 0 ? '- Drink: preserve exact glass type, liquid color, garnish, ice/foam if visible, scale, and placement. No random cocktail/glass substitution.' : ''}`
      : ''
    const facialRealismLockBlock = selectedSubjectCount > 0
      ? `[FACIAL_REALISM_LOCK]\n- Preserve natural facial anatomy and realistic expression.\n- Smile must have natural dental anatomy, realistic teeth spacing, realistic gumline, and believable mouth geometry.\n- No duplicated teeth, synthetic teeth, AI whitening effect, distorted mouth shape, warped lips, or plastic beauty retouching.`
      : ''
    const venueContextReferenceBlock = hasTruthEnvironmentReference && !shouldUseLockedScenePlate
      ? shouldUseNanoBananaProVisualTruth
        ? `[NANO_BANANA_PRO_MODE]\n- Venue image authority test.\n- Selected venue image is the visual reality.\n- Text is modifications only: selected people, outfits, accessories, food, drinks, and director notes.\n- Do not add venue-description paragraphs; rely on the image.`
        : venueReasoningMode === 'flexible_venue_context'
        ? `[GUIDED_VENUE_CONTEXT]\nGuided = image-first visible venue reality.\nUse the selected venue image as the authoritative reference; text only clarifies visible material cues.\nAllow slight crop, camera distance, natural subject posing, and foreground object placement.\nDo not invent unseen venue elements or rebuild the venue from text.`
        : `[MATERIAL_ATMOSPHERE_REFERENCE]\nUse selected venue/background references for DemoClientD material language, atmosphere, surface tone, lighting mood, furniture family, and premium restaurant identity only.\nAllow camera, crop, layout, and composition adaptation. Do not treat references as exact geometry sources or percentage-fidelity targets.`
      : ''
    const matchLockedProviderWarning = hasTruthEnvironmentReference
      && venueReasoningMode === 'locked_scene_plate'
      && providerCannotStrictLock
      ? 'Match Locked is a high-fidelity attempt. Minor provider drift may still happen.'
      : ''
    const providerRiskWarnings = [
      matchLockedProviderWarning,
      isVenuePhotographyWorkflow && providerCannotStrictLock
        ? 'Provider may not perfectly preserve geometry. Use source reference closely and review output before saving.'
        : '',
      isVenuePhotographyWorkflow && venuePhotographyTemplate === 'surface_texture_background'
        ? 'Surface / Texture Background runs as controlled material/background reference generation, not strict scene-plate compositing.'
        : '',
      isReferenceRebuildWorkflow && rawVenueIds.length === 0
        ? 'No venue/background truth selected. The provider may invent background context; review output before saving.'
        : '',
    ].filter(Boolean)
    if (!referenceOrderAssertion.passed) {
      return errorPayload({
        error: 'Reference map and provider image order do not match.',
        failureStep: 'validating_reference_order',
        reason: 'reference_order_mismatch',
        actionNeeded: 'Regenerate/validate the payload before spending on generation.',
        startedAt,
        status: 500,
        referenceCount: referenceParts.length,
        quality: requestedQuality,
        aspectRatio,
        payloadDebug: {
          reference_order_assertion: referenceOrderAssertion,
          ordered_references: payloadDebugReferences,
        },
      })
    }
    if (isProductPhotographyWorkflow) {
      const productPromptSections = [
        referenceMapBlock,
        permanentPromptV2LearningBlock,
        visualTruthPriorityBlock && !hasPromptBlock(promptForVenueMode, 'VISUAL_TRUTH_PRIORITY') ? visualTruthPriorityBlock : '',
        democlientbVenueLockBlock && !hasPromptBlock(promptForVenueMode, 'DEMOCLIENTB_VENUE_LOCK') ? democlientbVenueLockBlock : '',
        democlientbVenueMemoryBlock && !hasPromptBlock(promptForVenueMode, 'DEMOCLIENTB_VENUE_MEMORY') ? democlientbVenueMemoryBlock : '',
        shouldUseLockedScenePlate && !hasPromptBlock(promptForVenueMode, 'LOCKED_SCENE_PLATE') && !hasPromptBlock(promptForVenueMode, 'SCENE_INSPIRATION_ONLY') ? lockedScenePlateBlock : '',
        shouldUseLockedScenePlate && !hasPromptBlock(promptForVenueMode, 'CAMERA_RULE') ? cameraRuleBlock : '',
        !shouldUseLockedScenePlate && !hasPromptBlock(promptForVenueMode, 'GUIDED_VENUE_CONTEXT') && !hasPromptBlock(promptForVenueMode, 'MATERIAL_ATMOSPHERE_REFERENCE') ? venueContextReferenceBlock : '',
        visibleReferenceLockBlock && !hasPromptBlock(promptForVenueMode, 'VISIBLE_REFERENCE_LOCK') ? visibleReferenceLockBlock : '',
        cameraRealityLockBlock && !hasPromptBlock(promptForVenueMode, 'CAMERA_REALITY_LOCK') ? cameraRealityLockBlock : '',
        actionLockBlock && !hasPromptBlock(promptForVenueMode, 'ACTION_LOCK') ? actionLockBlock : '',
        subjectCountLockBlock && !hasPromptBlock(promptForVenueMode, 'SUBJECT_COUNT_LOCK') ? subjectCountLockBlock : '',
        subjectPlacementLockBlock && !hasPromptBlock(promptForVenueMode, 'SUBJECT_PLACEMENT_LOCK') ? subjectPlacementLockBlock : '',
        foodDrinkVisibilityLockBlock && !hasPromptBlock(promptForVenueMode, 'FOOD_DRINK_VISIBILITY_LOCK') ? foodDrinkVisibilityLockBlock : '',
        facialRealismLockBlock && !hasPromptBlock(promptForVenueMode, 'FACIAL_REALISM_LOCK') ? facialRealismLockBlock : '',
        !hasPromptBlock(promptForVenueMode, 'FOOD_TRUTH') ? foodTruthBlock : '',
        !hasPromptBlock(promptForVenueMode, 'STRICT_NEGATIVE') ? strictNegativeBlock : '',
        shouldUseLockedScenePlate && !hasPromptBlock(promptForVenueMode, 'PROVIDER_GUIDANCE') ? providerGuidanceBlock : '',
        promptForVenueMode.trim(),
      ]
      const originalProductAssembledPrompt = productPromptSections.filter(Boolean).join('\n\n').trim()
      const finalPromptCompression = compressPromptWithDebug(productPromptSections, PRODUCT_MAX_PROMPT_CHARS)
      const finalPrompt = finalPromptCompression.text
      if (finalPrompt.length >= PRODUCT_MAX_PROMPT_CHARS) {
        return errorPayload({
          error: `Final provider prompt is too long after compression. Keep it under ${PRODUCT_MAX_PROMPT_CHARS} characters.`,
          failureStep: 'compressing_prompt',
          reason: 'final_prompt_too_long',
          actionNeeded: 'Reduce director notes or references for this Product Photography test.',
          startedAt,
          status: 400,
          referenceCount: referenceParts.length,
          quality: requestedQuality,
          aspectRatio,
          payloadDebug: {
            compression: finalPromptCompression.debug,
            final_prompt_length: finalPrompt.length,
            ordered_references: payloadDebugReferences,
            reference_order_assertion: referenceOrderAssertion,
          },
        })
      }

      const payloadDebug = {
        dry_run: dryRun,
        provider: 'google-gemini',
        model: MODEL,
        provider_capabilities: NANO_BANANA_PROVIDER_CAPABILITIES,
        risk_warnings: providerRiskWarnings,
        generation_blocked: false,
        image_config: {
          aspect_ratio: aspectRatio,
          requested_quality: requestedQuality,
          image_size: requestedQuality === '4k' ? '4K' : '1K',
        },
        settings: {
          workflow,
          generation_mode: generationWorkflowModeLabel(generationMode),
          venue_reasoning_mode: venueReasoningMode,
          location,
          activation,
          composition_fidelity: compositionFidelity,
          composition_fidelity_percent: compositionFidelityPercentValue,
          automatic_serviceware_reference_count: automaticServicewareReferenceCount,
        },
        prompt_length: rawPrompt.length,
        compressed_prompt_length: finalPrompt.length,
        final_prompt_length: finalPrompt.length,
        prompt_size_status: productPromptSizeStatus(finalPrompt.length),
        final_provider_prompt: finalPrompt,
        compression: finalPromptCompression.debug,
        image_part_count: referenceParts.length,
        provider_part_count: 1 + referenceParts.length * 2,
        selected_reference_count: referenceCount,
        sent_reference_count: referenceParts.length,
        automatic_serviceware_reference_count: automaticServicewareReferenceCount,
        reference_order_assertion: referenceOrderAssertion,
        ordered_references: payloadDebugReferences,
        download_failures: payloadDownloadFailures,
        text_context: {
          product_photography: true,
          product_truth_refs: rawFoodIds.length + rawDrinkIds.length > 0,
          lighting_inspiration_refs: rawPinterestIds.length > 0,
          surface_context_refs: rawVenueIds.length > 0,
        },
      }

      console.info('nano_banana_payload_audit', JSON.stringify({
        model: MODEL,
        dry_run: dryRun,
        workflow,
        image_part_count: payloadDebug.image_part_count,
        provider_part_count: payloadDebug.provider_part_count,
        selected_reference_count: payloadDebug.selected_reference_count,
        sent_reference_count: payloadDebug.sent_reference_count,
        prompt_length: payloadDebug.prompt_length,
        compressed_prompt_length: payloadDebug.compressed_prompt_length,
        compression: payloadDebug.compression,
        ordered_references: payloadDebug.ordered_references.map(ref => ({
          order: ref.order,
          role: ref.role,
          owner: ref.owner,
          id: ref.id,
          label: ref.label,
          provider_label: ref.provider_label,
          source: ref.source,
          mime_type: ref.mime_type,
          byte_size: ref.byte_size,
          download_succeeded: ref.download_succeeded,
        })),
        download_failures: payloadDebug.download_failures.map(ref => ({
          role: ref.role,
          owner: ref.owner,
          id: ref.id,
          label: ref.label,
          source: ref.source,
          failure: ref.failure,
        })),
        image_config: payloadDebug.image_config,
      }))

      if (dryRun) {
        const serverAudit = await persistNanoBananaGenerationAudit({
          workflow,
          clientId,
          dryRun,
          success: payloadDownloadFailures.length === 0,
          originalAssembledPrompt: originalProductAssembledPrompt,
          finalProviderPrompt: finalPrompt,
          payloadDebug: payloadDebug as Record<string, unknown>,
          referenceAssets,
          error: payloadDownloadFailures.length > 0 ? 'One or more selected references failed to download.' : null,
        })
        Object.assign(payloadDebug, { server_audit: serverAudit })
        return NextResponse.json({
          success: payloadDownloadFailures.length === 0,
          dry_run: true,
          provider: 'google-gemini',
          model: MODEL,
          final_prompt_used: finalPrompt,
          aspect_ratio: aspectRatio,
          generation_mode: 'Product Photography',
          location,
          time_of_day: timeOfDay,
          activation,
          background_accuracy: backgroundAccuracy,
          quality: requestedQuality,
          image_size: requestedQuality === '4k' ? '4K' : '1K',
          visual_dna_applied: [],
          reference_count: referenceParts.length,
          reference_assets: referenceAssets,
          payload_debug: payloadDebug,
          error: payloadDownloadFailures.length > 0 ? 'One or more selected references failed to download.' : undefined,
          failure_step: payloadDownloadFailures.length > 0 ? 'downloading_reference_assets' : undefined,
          reason: payloadDownloadFailures.length > 0 ? 'reference_download_failed' : undefined,
          action_needed: payloadDownloadFailures.length > 0 ? 'Remove or re-upload failed references before spending on generation.' : undefined,
          latency_ms: Date.now() - startedAt,
        }, { status: payloadDownloadFailures.length > 0 ? 400 : 200 })
      }

      if (payloadDownloadFailures.length > 0) {
        const serverAudit = await persistNanoBananaGenerationAudit({
          workflow,
          clientId,
          dryRun,
          success: false,
          originalAssembledPrompt: originalProductAssembledPrompt,
          finalProviderPrompt: finalPrompt,
          payloadDebug: payloadDebug as Record<string, unknown>,
          referenceAssets,
          error: 'One or more selected references failed to download.',
        })
        Object.assign(payloadDebug, { server_audit: serverAudit })
        return errorPayload({
          error: 'One or more selected references failed to download.',
          failureStep: 'downloading_reference_assets',
          reason: 'reference_download_failed',
          actionNeeded: 'Remove or re-upload failed references before spending on generation.',
          startedAt,
          status: 400,
          referenceCount: referenceParts.length,
          quality: requestedQuality,
          aspectRatio,
          payloadDebug,
        })
      }

      failureStep = 'calling_gemini'
      let fallbackUsed = false
      let attempt: ProviderAttempt
      try {
        attempt = await callProvider({
          apiKey,
          finalPrompt,
          referenceParts,
          aspectRatio,
          quality: requestedQuality,
        })
      } catch (error) {
        if (requestedQuality !== '4k') throw error
        fallbackUsed = true
        failureStep = 'calling_gemini_standard_fallback'
        attempt = await callProvider({
          apiKey,
          finalPrompt,
          referenceParts,
          aspectRatio,
          quality: 'standard',
        })
      }

      if (!attempt.response.ok && requestedQuality === '4k') {
        fallbackUsed = true
        failureStep = 'calling_gemini_standard_fallback'
        attempt = await callProvider({
          apiKey,
          finalPrompt,
          referenceParts,
          aspectRatio,
          quality: 'standard',
        })
      }

      const { response, providerResponse, latencyMs } = attempt
      payloadDebug.ordered_references.forEach(ref => {
        ref.provider_acceptance = response.ok && !providerResponse.error ? 'provider_http_accepted' : 'provider_error'
      })
      const providerStatus = response.status
      const providerText = !response.ok ? JSON.stringify(summarizeProviderResponse(providerResponse)) : ''

      if (!response.ok || providerResponse.error) {
        const message = providerResponse.error?.message || providerText || 'Gemini image generation failed.'
        const isLimitError = /too many|limit|maximum|max images|image count|payload/i.test(message)
        const serverAudit = await persistNanoBananaGenerationAudit({
          workflow,
          clientId,
          dryRun,
          success: false,
          originalAssembledPrompt: originalProductAssembledPrompt,
          finalProviderPrompt: finalPrompt,
          payloadDebug: payloadDebug as Record<string, unknown>,
          referenceAssets,
          providerStatus,
          providerResponseSummary: summarizeProviderResponse(providerResponse),
          error: message,
        })
        Object.assign(payloadDebug, { server_audit: serverAudit })
        return errorPayload({
          error: message,
          failureStep: isLimitError ? 'provider_limit' : failureStep,
          reason: isLimitError ? 'provider_limit' : providerResponse.error?.status || 'provider_error',
          actionNeeded: isLimitError ? 'Reduce selected references or use fewer inspiration images.' : 'Try again or reduce prompt/reference complexity.',
          startedAt,
          status: response.status || 502,
          providerStatus,
          providerError: message,
          referenceCount: referenceParts.length,
          quality: attempt.quality,
          aspectRatio,
          payloadDebug,
        })
      }

      const imagePart = providerResponse.candidates?.flatMap(candidate => candidate.content?.parts ?? []).find(part => {
        const inline = part.inlineData ?? part.inline_data
        return Boolean(inline?.data)
      })
      const inline = imagePart ? imagePart.inlineData ?? imagePart.inline_data : null
      if (!inline?.data) {
        const serverAudit = await persistNanoBananaGenerationAudit({
          workflow,
          clientId,
          dryRun,
          success: false,
          originalAssembledPrompt: originalProductAssembledPrompt,
          finalProviderPrompt: finalPrompt,
          payloadDebug: payloadDebug as Record<string, unknown>,
          referenceAssets,
          providerStatus,
          providerResponseSummary: summarizeProviderResponse(providerResponse),
          error: 'Gemini returned no image data.',
        })
        Object.assign(payloadDebug, { server_audit: serverAudit })
        return errorPayload({
          error: 'Gemini returned no image data.',
          failureStep: 'parsing_provider_response',
          reason: 'missing_image_data',
          actionNeeded: 'Try again or simplify the prompt/references.',
          startedAt,
          status: 502,
          providerStatus,
          referenceCount: referenceParts.length,
          quality: attempt.quality,
          aspectRatio,
          payloadDebug,
        })
      }

      const mimeType = inline.mimeType ?? inline.mime_type ?? 'image/png'
      const serverAudit = await persistNanoBananaGenerationAudit({
        workflow,
        clientId,
        dryRun,
        success: true,
        originalAssembledPrompt: originalProductAssembledPrompt,
        finalProviderPrompt: finalPrompt,
        payloadDebug: payloadDebug as Record<string, unknown>,
        referenceAssets,
        providerStatus,
        providerResponseSummary: summarizeProviderResponse(providerResponse),
        generatedOutputAssetId: null,
      })
      Object.assign(payloadDebug, { server_audit: serverAudit })
      return NextResponse.json({
        success: true,
        provider: 'google-gemini',
        model: MODEL,
        aspect_ratio: aspectRatio,
        generation_mode: 'Product Photography',
        location,
        quality: attempt.quality,
        image_size: attempt.imageSize,
        fallback_used: fallbackUsed,
        reference_count: referenceParts.length,
        generated_image_data: `data:${mimeType};base64,${inline.data}`,
        generated_image_mime_type: mimeType,
        final_prompt_used: finalPrompt,
        visual_dna_applied: [],
        reference_assets: referenceAssets,
        payload_debug: payloadDebug,
        provider_latency_ms: latencyMs,
        latency_ms: Date.now() - startedAt,
        estimated_cost: attempt.quality === '4k' ? 0.24 : 0.134,
      })
    }
    const scenePlanBlock = buildScenePlan(payloadDebugReferences, resolvedFoodDrinkAssignments, venueSpatialMetadataWarning)
    const correctionLines = [
      regenerationNotes ? `- Previous attempt notes: ${regenerationNotes}` : '',
      failureLabels.length > 0 ? `- Flagged failures: ${failureLabels.join(', ')}` : '',
      regenerationNotes || failureLabels.length > 0 ? '- Correct these issues in this generation.' : '',
      regenerationNotes || failureLabels.length > 0 ? '- Prioritize these corrections over aesthetic crop or creative composition.' : '',
    ].filter(Boolean)
    const correctionBlock = correctionLines.length > 0
      ? `[CORRECTION_FROM_PREVIOUS_ATTEMPT]\n${correctionLines.join('\n')}`
      : ''
    const pastFailureCorrectionsBlock = buildPastFailureCorrectionBlock({
      labels: failureLabels,
      notes: regenerationNotes,
    })
    const assignmentLines = payloadDebugReferences
      .filter(ref => ref.role === 'food' || ref.role === 'drink')
      .map(ref => {
        const assignment = resolvedFoodDrinkAssignments.get(ref.id) || 'Shared'
        const label = compactReferenceLabel(ref)
        return `- ${label} => ${assignment}`
      })
    const tableAssignmentBlock = `[TABLE_ASSIGNMENT]\n- seats => ${guestModelIds.length + rawModelAssetIds.length === 2 ? 'Marco + Sofia only' : 'selected guests only'}\n${assignmentLines.join('\n')}\n- Marco => own assigned food/drink\n- Sofia => own assigned food/drink\n- Shared => centered between guests\n- forbid => empty plates, empty-seat dishes/drinks, extra place settings`
    const venueScaleLockBlock = isDemoClientBGeneration
      ? buildDemoClientBVenueScaleLockBlock({ clientId, clientName, hasVenueReference: hasTruthEnvironmentReference })
      : `[VENUE_SCALE_LOCK]\n- table => no resize/shrink/replace\n- preserve => exact visible table material, finish, color, texture, diameter, guest distance, chair scale\n- if venue truth shows black marble => recreate black marble, not generic black/matte/dark tabletop\n- high-table => round; black marble/dark polished stone top; bronze/gold rim; no square/oval/cafe table`
    const compactVenueServiceContext = venueServiceContext.replace(/\s+/g, ' ').trim().slice(0, 150)
    const serviceAssignmentBlock = `[SERVICE_ASSIGNMENT]\n- each occupied seat => 1 folded white napkin + 1 fork + 1 knife\n- fork/knife => on or aligned with napkin\n- forbid => duplicate cutlery, floating napkins, empty-seat serviceware\n- style => minimal, premium, venue-consistent`
    const servicewareTruthBlock = `[SERVICEWARE_TRUTH]\n- serviceware images => exact fork/knife design\n- napkin => folded white\n- fork/knife => white/gold, secondary\n${compactVenueServiceContext ? `- metadata => ${compactVenueServiceContext}` : '- if unknown => match venue ref; keep minimal'}`
    const seatingConsistencyBlock = `[SEATING_CONSISTENCY]\n- chairs => selected venue seating family\n- no random red/blue mismatch unless source shows it\n- chair color/material => coherent venue truth`
    const emotionBlock = `[EMOTION]\n- warm, happy, engaged\n- candid smiles; no blank/stiff faces\n- no exaggerated fake smiles`
    const focusLockBlock = `[FOCUS_LOCK]\n- sharpness: faces + selected food first\n- then drinks + accessories\n- background/floor/chairs/props softer`
    const accessoryRealismBlock = rawAccessoryRefs.length > 0
      ? `[ACCESSORY_REALISM]\n- no fake readable logo text on tiny watches\n- preserve geometry, dial shape/color, case/bezel, strap/bracelet, metal tone\n- if tiny => clean/subtle face; no random markings\n- readable branding only for accessory close-ups`
      : ''
    const accessoryTruthLockBlock = rawAccessoryRefs.length > 0
      ? `[ACCESSORY_TRUTH_LOCK]\n- accessories => exact object truth, not style inspiration\n- preserve geometry before aesthetics\n- no similar-item substitution; no guest swaps`
      : ''
    const serverEnvironmentBlock = shouldUseNanoBananaProVisualTruth
      ? `[ENVIRONMENT]\n- venue image = primary visual truth\n- text = selected foreground modifications only\n- do not describe, reconstruct, or redesign the venue`
      : shouldUseLockedScenePlate
      ? `[ENVIRONMENT]\n- venue image = primary visual truth\n- text metadata = concise clarification only\n- foreground additions only\n- do not rebuild the venue from text\n${environmentAnchorSummary ? `- visible cues => ${cleanLine(environmentAnchorSummary, 180)}` : '- use visible venue evidence only'}\n${venueSpatialMetadataWarning ? '- weak table metadata => match visible ref only' : ''}`
      : venueReasoningMode === 'flexible_venue_context'
        ? `[ENVIRONMENT]\n- venue image = primary visual truth\n- text metadata = concise clarification only\n- add selected subjects/items inside visible venue reality\n- do not rebuild the venue from text or invent unseen areas\n${environmentAnchorSummary ? `- visible cues => ${cleanLine(environmentAnchorSummary, 180)}` : '- use visible venue evidence only'}\n${venueSpatialMetadataWarning ? '- weak table metadata => match visible ref only' : ''}`
        : `[ENVIRONMENT]\n- selected environment refs => material/atmosphere reference only\n- controls => mood, color, atmosphere, surface tone, lighting, and furniture family\n- does not control exact venue geometry, food, people, or product truth`

    const serverGeneratedPromptSections = [
      referenceMapBlock,
      permanentPromptV2LearningBlock,
      scenePlanBlock,
      correctionBlock,
      pastFailureCorrectionsBlock,
      `[SCENE]\n- premium editorial hospitality photo\n- client: ${clientName ?? 'Client'}\n- output: ${aspectRatio} ${requestedQuality === '4k' ? '4K' : 'standard'}\n- location: ${location}\n- time: ${timeOfDay}\n- activation: ${activation}\n- mode: ${generationWorkflowModeLabel(generationMode)}\n- venue reasoning: ${venueReasoningMode}${shouldUseLockedScenePlate ? '\n- when scene plate is locked, time/activation affect people, campaign tone, and styling only; preserve source venue lighting' : ''}`,
      shouldUseLockedScenePlate ? lockedScenePlateBlock : '',
      shouldUseLockedScenePlate ? cameraRuleBlock : '',
      shouldUseLockedScenePlate ? providerGuidanceBlock : '',
      visualTruthPriorityBlock,
      democlientbVenueLockBlock,
      democlientbVenueMemoryBlock,
      venueContextReferenceBlock,
      visibleReferenceLockBlock,
      cameraRealityLockBlock,
      actionLockBlock,
      subjectCountLockBlock,
      subjectPlacementLockBlock,
      foodDrinkVisibilityLockBlock,
      facialRealismLockBlock,
      serverEnvironmentBlock,
      venueSpatialPrompt,
      compactVenueZone ? `[VENUE_ZONE]\n${compactVenueZone}` : '',
      shouldUseLockedScenePlate ? venueScaleLockBlock : '',
      seatingConsistencyBlock,
      `[REFERENCE_ROLES]\n- portraits: face identity/detail only\n- outfits: clothing only\n- accessories: exact owner-bound object only\n- food/drinks: exact item truth\n- pinterest/director notes: inspiration only`,
      `[SUBJECTS]\n- portraits => face/skin/hair/eyes/age\n- skin => pores, fine lines, asymmetry, tone variation\n- hair/beard => strands, density\n- no AI-smooth beauty retouching`,
      emotionBlock,
      rawOutfitRefs.length > 0 ? `[WARDROBE]\n- outfit refs control clothing, silhouette, fabric, color, fit only\n- do not borrow face detail or expression from outfit images` : '',
      rawAccessoryRefs.length > 0 ? `[ACCESSORIES]\n${accessoryInstructions}\n- owner-bound; must appear if selected\n- watch => 1:1 geometry/dial/case/strap/metal\n- no swaps, duplicates, generic watches` : '',
      accessoryRealismBlock,
      accessoryTruthLockBlock,
      foodTruthBlock,
      rawFoodIds.length > 0 ? `[FOOD]\n${selectedFoodDetails.map(detail => `- ${detail}`).join('\n') || foodOneToOneRules.slice(0, 1).map(rule => `- ${rule}`).join('\n')}\n- only selected foods; preserve count/vessel/sauce/sides; sharp detail` : '',
      rawDrinkIds.length > 0 ? `[DRINKS]\n${selectedDrinkDetails.map(detail => `- ${detail}`).join('\n') || '- exact beverage truth'}\n- preserve glass/color/garnish/scale\n- no smoke/flames/dry ice/powder/debris unless in drink ref` : '',
      rawFoodIds.length > 0 || rawDrinkIds.length > 0 ? tableAssignmentBlock : '',
      rawFoodIds.length > 0 || rawDrinkIds.length > 0 || rawGuestModelIds.length + rawModelAssetIds.length > 0 ? serviceAssignmentBlock : '',
      rawFoodIds.length > 0 || rawDrinkIds.length > 0 || rawGuestModelIds.length + rawModelAssetIds.length > 0 ? servicewareTruthBlock : '',
      rawServiceIds.length > 0 ? '[SERVICE]\n- minimal venue-consistent serviceware only' : '',
      hasSpatialLayout ? '[SPATIAL]\n- use blueprint/layout notes only when explicit\n- preserve walkways, table spacing, seating geometry, circulation\n- no blocked pathways or impossible table placement' : '',
      `[COMPOSITION]\n- intent => ${compositionIntent}\n- bg guests => ${backgroundGuests}\n${shouldUseLockedScenePlate && isBreakfastMode ? '- breakfast mood; selected venue image stays primary' : venueReasoningMode === 'flexible_venue_context' ? '- guided => image-first venue reality; slight crop/subject placement only' : '- flexible material/atmosphere reference allows camera/crop/layout adaptation'}`,
      focusLockBlock,
      '[CAMERA]\n- use selected camera, lens, and depth from user setup\n- selected camera settings override Visual DNA camera defaults',
      visualDnaLines.length > 0 ? `[VISUAL_DNA]\n${visualDnaLines.slice(0, 3).map(line => `- ${cleanLine(line, 120)}`).join('\n')}\n- truth refs override` : '',
      compactQaRules ? `[QA_MEMORY]\n${compactQaRules}` : '',
      pinterestInstructions ? `[INSPIRATION]\n${pinterestInstructions}\n- inspiration never overrides truth refs` : '',
      strictNegativeBlock,
      shouldUseLockedScenePlate
        ? `[NEGATIVE]\n- no invented bg/zones/table/chairs\n- no swapped/random accessories\n- no invented food/drinks/serviceware${isDemoClientBGeneration ? '\n- no red lacquer table material; preserve reflective mirror/glass tabletop quality and red tones only as reflections\n- no swapped left/right subject placement' : ''}\n- no plastic skin/waxy faces\n- no synthetic teeth or distorted smile`
        : `[NEGATIVE]\n- no different restaurant or fantasy venue identity\n- no swapped/random accessories\n- no invented food/drinks/serviceware${isDemoClientBGeneration ? '\n- no red lacquer table material; preserve reflective mirror/glass tabletop quality and red tones only as reflections\n- no swapped left/right subject placement' : ''}\n- no plastic skin/waxy faces\n- no synthetic teeth or distorted smile`,
      userSetup ? `[USER_SETUP]\n${userSetup}` : '',
    ]
    const nanoBananaProPromptSections = [
      visualTruthPriorityBlock,
      democlientbVenueLockBlock,
      democlientbVenueMemoryBlock,
      venueContextReferenceBlock,
      actionLockBlock,
      subjectCountLockBlock,
      subjectPlacementLockBlock,
      facialRealismLockBlock,
      selectedSubjectCount > 0
        ? `[SUBJECTS]\n- portraits => face, skin, hair, eyes, age, and body appearance truth\n- preserve selected subject count and director action\n- no extra guest, conversation partner, or extra hands`
        : '',
      rawOutfitRefs.length > 0
        ? `[WARDROBE]\n- outfit refs control clothing, fabric, fit, silhouette, and color only\n- preserve selected outfit truth; no clothing substitution`
        : '',
      rawAccessoryRefs.length > 0
        ? `[ACCESSORIES]\n${accessoryInstructions}\n- owner-bound; preserve visible object truth; no substitutions`
        : '',
      accessoryTruthLockBlock,
      foodTruthBlock,
      rawFoodIds.length > 0
        ? `[FOOD]\n${selectedFoodDetails.map(detail => `- ${detail}`).join('\n') || '- exact dish truth'}\n- exact selected food only; no reinterpretation`
        : '',
      rawDrinkIds.length > 0
        ? `[DRINKS]\n${selectedDrinkDetails.map(detail => `- ${detail}`).join('\n') || '- exact beverage truth'}\n- exact selected drink only; no random glass/cocktail substitution`
        : '',
      directorNotes ? `[DIRECTOR_NOTES]\n- ${cleanLine(directorNotes, 900)}` : '',
      `[NEGATIVE]\n- no venue redesign or text-based venue reconstruction\n- no invented food/drinks/accessories/serviceware\n- no extra guests or hands${isDemoClientBGeneration ? '\n- no red lacquer table material; preserve reflective mirror/glass tabletop quality and red tones only as reflections\n- no swapped left/right subject placement' : ''}\n- no plastic skin, synthetic teeth, or distorted smile`,
      userSetup ? `[USER_SETUP]\n${userSetup}` : '',
    ]
    const structuredPromptAdditions = [
      !hasPromptBlock(userSetup, 'PROMPT_V2_PERMANENT_LEARNINGS') ? permanentPromptV2LearningBlock : '',
      !hasPromptBlock(userSetup, 'ACCESSORY_REALISM') ? accessoryRealismBlock : '',
      !hasPromptBlock(userSetup, 'ACCESSORY_TRUTH_LOCK') ? accessoryTruthLockBlock : '',
      pastFailureCorrectionsBlock && !hasPromptBlock(userSetup, 'PAST_FAILURE_CORRECTIONS') ? pastFailureCorrectionsBlock : '',
      visualTruthPriorityBlock && !hasPromptBlock(userSetup, 'VISUAL_TRUTH_PRIORITY') ? visualTruthPriorityBlock : '',
      democlientbVenueLockBlock && !hasPromptBlock(userSetup, 'DEMOCLIENTB_VENUE_LOCK') ? democlientbVenueLockBlock : '',
      democlientbVenueMemoryBlock && !hasPromptBlock(userSetup, 'DEMOCLIENTB_VENUE_MEMORY') ? democlientbVenueMemoryBlock : '',
      shouldUseLockedScenePlate && !hasPromptBlock(userSetup, 'LOCKED_SCENE_PLATE') && !hasPromptBlock(userSetup, 'SCENE_INSPIRATION_ONLY') ? lockedScenePlateBlock : '',
      shouldUseLockedScenePlate && !hasPromptBlock(userSetup, 'CAMERA_RULE') ? cameraRuleBlock : '',
      shouldUseLockedScenePlate && !hasPromptBlock(userSetup, 'PROVIDER_GUIDANCE') ? providerGuidanceBlock : '',
      !shouldUseLockedScenePlate && !hasPromptBlock(userSetup, 'GUIDED_VENUE_CONTEXT') && !hasPromptBlock(userSetup, 'MATERIAL_ATMOSPHERE_REFERENCE') ? venueContextReferenceBlock : '',
      visibleReferenceLockBlock && !hasPromptBlock(userSetup, 'VISIBLE_REFERENCE_LOCK') ? visibleReferenceLockBlock : '',
      cameraRealityLockBlock && !hasPromptBlock(userSetup, 'CAMERA_REALITY_LOCK') ? cameraRealityLockBlock : '',
      actionLockBlock && !hasPromptBlock(userSetup, 'ACTION_LOCK') ? actionLockBlock : '',
      subjectCountLockBlock && !hasPromptBlock(userSetup, 'SUBJECT_COUNT_LOCK') ? subjectCountLockBlock : '',
      subjectPlacementLockBlock && !hasPromptBlock(userSetup, 'SUBJECT_PLACEMENT_LOCK') ? subjectPlacementLockBlock : '',
      foodDrinkVisibilityLockBlock && !hasPromptBlock(userSetup, 'FOOD_DRINK_VISIBILITY_LOCK') ? foodDrinkVisibilityLockBlock : '',
      facialRealismLockBlock && !hasPromptBlock(userSetup, 'FACIAL_REALISM_LOCK') ? facialRealismLockBlock : '',
      !hasPromptBlock(userSetup, 'FOOD_TRUTH') ? foodTruthBlock : '',
      !hasPromptBlock(userSetup, 'STRICT_NEGATIVE') ? strictNegativeBlock : '',
      shouldUseLockedScenePlate && !hasPromptBlock(userSetup, 'VENUE_SCALE_LOCK') ? venueScaleLockBlock : '',
      !hasPromptBlock(userSetup, 'SEATING_CONSISTENCY') ? seatingConsistencyBlock : '',
      !hasPromptBlock(userSetup, 'EMOTION') ? emotionBlock : '',
      (rawFoodIds.length > 0 || rawDrinkIds.length > 0) && !hasPromptBlock(userSetup, 'TABLE_ASSIGNMENT') ? tableAssignmentBlock : '',
      (rawFoodIds.length > 0 || rawDrinkIds.length > 0 || rawGuestModelIds.length + rawModelAssetIds.length > 0) && !hasPromptBlock(userSetup, 'SERVICE_ASSIGNMENT') ? serviceAssignmentBlock : '',
      (rawFoodIds.length > 0 || rawDrinkIds.length > 0 || rawGuestModelIds.length + rawModelAssetIds.length > 0) && !hasPromptBlock(userSetup, 'SERVICEWARE_TRUTH') ? servicewareTruthBlock : '',
      !hasPromptBlock(userSetup, 'FOCUS_LOCK') ? focusLockBlock : '',
      compactQaRules && !hasPromptBlock(userSetup, 'QA_MEMORY') ? `[QA_MEMORY]\n${compactQaRules}` : '',
      visualDnaLines.length > 0 && !hasPromptBlock(userSetup, 'VISUAL_DNA') ? `[VISUAL_DNA]\n${visualDnaLines.map(line => `- ${line}`).join('\n')}\n- omit conflicting camera/lens/aperture defaults` : '',
      venueSpatialPrompt && !hasPromptBlock(userSetup, 'VENUE_TRUTH') && !hasPromptBlock(userSetup, 'VENUE_SPATIAL_TRUTH') ? venueSpatialPrompt : '',
      compactVenueZone && !hasPromptBlock(userSetup, 'VENUE_ZONE') ? `[VENUE_ZONE]\n${compactVenueZone}` : '',
      pinterestInstructions && !hasPromptBlock(userSetup, 'INSPIRATION') ? `[INSPIRATION]\n${pinterestInstructions}\n- inspiration never overrides truth refs` : '',
    ]
    const nanoBananaProStructuredAdditions = [
      visualTruthPriorityBlock && !hasPromptBlock(userSetup, 'VISUAL_TRUTH_PRIORITY') ? visualTruthPriorityBlock : '',
      democlientbVenueLockBlock && !hasPromptBlock(userSetup, 'DEMOCLIENTB_VENUE_LOCK') ? democlientbVenueLockBlock : '',
      democlientbVenueMemoryBlock && !hasPromptBlock(userSetup, 'DEMOCLIENTB_VENUE_MEMORY') ? democlientbVenueMemoryBlock : '',
      venueContextReferenceBlock && !hasPromptBlock(userSetup, 'NANO_BANANA_PRO_MODE') ? venueContextReferenceBlock : '',
      actionLockBlock && !hasPromptBlock(userSetup, 'ACTION_LOCK') ? actionLockBlock : '',
      subjectCountLockBlock && !hasPromptBlock(userSetup, 'SUBJECT_COUNT_LOCK') ? subjectCountLockBlock : '',
      subjectPlacementLockBlock && !hasPromptBlock(userSetup, 'SUBJECT_PLACEMENT_LOCK') ? subjectPlacementLockBlock : '',
      facialRealismLockBlock && !hasPromptBlock(userSetup, 'FACIAL_REALISM_LOCK') ? facialRealismLockBlock : '',
      accessoryTruthLockBlock && !hasPromptBlock(userSetup, 'ACCESSORY_TRUTH_LOCK') ? accessoryTruthLockBlock : '',
      foodTruthBlock && !hasPromptBlock(userSetup, 'FOOD_TRUTH') ? foodTruthBlock : '',
      rawFoodIds.length > 0 && !hasPromptBlock(userSetup, 'FOOD') ? `[FOOD]\n${selectedFoodDetails.map(detail => `- ${detail}`).join('\n') || '- exact dish truth'}\n- exact selected food only; no reinterpretation` : '',
      rawDrinkIds.length > 0 && !hasPromptBlock(userSetup, 'DRINKS') ? `[DRINKS]\n${selectedDrinkDetails.map(detail => `- ${detail}`).join('\n') || '- exact beverage truth'}\n- exact selected drink only; no random glass/cocktail substitution` : '',
      directorNotes && !hasPromptBlock(userSetup, 'DIRECTOR_NOTES') ? `[DIRECTOR_NOTES]\n- ${cleanLine(directorNotes, 900)}` : '',
      !hasPromptBlock(userSetup, 'NEGATIVE') ? `[NEGATIVE]\n- no venue redesign or text-based venue reconstruction\n- no invented food/drinks/accessories/serviceware\n- no extra guests or hands${isDemoClientBGeneration ? '\n- no red lacquer table material; preserve reflective mirror/glass tabletop quality and red tones only as reflections\n- no swapped left/right subject placement' : ''}\n- no plastic skin, synthetic teeth, or distorted smile` : '',
    ]
    const promptSections = promptIsStructuredV2
      ? shouldUseNanoBananaProVisualTruth
        ? [
          userSetup,
          ...nanoBananaProStructuredAdditions,
        ]
        : [
        !hasPromptBlock(userSetup, 'REFERENCE_MAP') ? referenceMapBlock : '',
        !hasPromptBlock(userSetup, 'SCENE_PLAN') ? scenePlanBlock : '',
        correctionBlock && !hasPromptBlock(userSetup, 'CORRECTION_FROM_PREVIOUS_ATTEMPT') ? correctionBlock : '',
        userSetup,
        ...structuredPromptAdditions,
      ]
      : shouldUseNanoBananaProVisualTruth ? nanoBananaProPromptSections : serverGeneratedPromptSections
    const originalAssembledPrompt = promptSections.filter(Boolean).join('\n\n').trim()
    const finalPromptCompression = compressPromptWithDebug(promptSections, MAX_PROMPT_CHARS)
    const finalPrompt = finalPromptCompression.text
    if (finalPrompt.length >= MAX_PROMPT_CHARS) {
      return errorPayload({
        error: `Final provider prompt is too long after compression. Keep it under ${MAX_PROMPT_CHARS} characters.`,
        failureStep: 'compressing_prompt',
        reason: 'final_prompt_too_long',
        actionNeeded: 'Generate Dry Run Payload and reduce references/notes, or let Jarvis compact duplicate sections before generation.',
        startedAt,
        status: 400,
        referenceCount: referenceParts.length,
        quality: requestedQuality,
        aspectRatio,
        payloadDebug: {
          compression: finalPromptCompression.debug,
          final_prompt_length: finalPrompt.length,
          ordered_references: payloadDebugReferences,
          reference_order_assertion: referenceOrderAssertion,
        },
      })
    }

    const payloadDebug = {
      dry_run: dryRun,
      provider: 'google-gemini',
      model: MODEL,
      provider_capabilities: NANO_BANANA_PROVIDER_CAPABILITIES,
      risk_warnings: providerRiskWarnings,
      generation_blocked: false,
      image_config: {
        aspect_ratio: aspectRatio,
        requested_quality: requestedQuality,
        image_size: requestedQuality === '4k' ? '4K' : '1K',
      },
      settings: {
        generation_mode: generationMode,
        generation_mode_label: generationWorkflowModeLabel(generationMode),
        venue_reasoning_mode: venueReasoningMode,
        location,
        time_of_day: timeOfDay,
        activation,
        venue_zone: venueZone,
        composition_fidelity: compositionFidelity,
        composition_fidelity_percent: compositionFidelityPercentValue,
        venue_fidelity: venueFidelity,
        background_accuracy: backgroundAccuracy,
        composition_intent: compositionIntent,
        background_guests: backgroundGuests,
        food_drink_assignments: Object.fromEntries(resolvedFoodDrinkAssignments),
        director_notes_present: directorNotesPresent,
        regeneration_notes_present: Boolean(regenerationNotes),
        failure_labels: failureLabels,
        automatic_serviceware_reference_count: automaticServicewareReferenceCount,
        venue_spatial_metadata_present: Boolean(venueSpatialPrompt),
      },
      prompt_length: rawPrompt.length,
      compressed_prompt_length: finalPrompt.length,
      final_prompt_length: finalPrompt.length,
      prompt_size_status: promptSizeStatus(finalPrompt.length),
      final_provider_prompt: finalPrompt,
      compression: finalPromptCompression.debug,
      image_part_count: referenceParts.length,
      provider_part_count: 1 + referenceParts.length * 2,
      selected_reference_count: referenceCount,
      sent_reference_count: referenceParts.length,
      automatic_serviceware_reference_count: automaticServicewareReferenceCount,
      reference_order_assertion: referenceOrderAssertion,
      ordered_references: payloadDebugReferences,
      download_failures: payloadDownloadFailures,
      text_context: {
        visual_dna: visualDnaLines.length > 0,
        qa_memory: Boolean(generationQaPrompt),
        venue_zone_rules: Boolean(venueZonePrompt),
        blueprint_layout_notes: hasSpatialLayout,
        venue_environment_summary: Boolean(environmentAnchorSummary),
        venue_spatial_truth: Boolean(venueSpatialPrompt),
        venue_service_context: Boolean(venueServiceContext),
      },
    }

    console.info('nano_banana_payload_audit', JSON.stringify({
      model: MODEL,
      dry_run: dryRun,
      image_part_count: payloadDebug.image_part_count,
      provider_part_count: payloadDebug.provider_part_count,
      selected_reference_count: payloadDebug.selected_reference_count,
      sent_reference_count: payloadDebug.sent_reference_count,
      prompt_length: payloadDebug.prompt_length,
      compressed_prompt_length: payloadDebug.compressed_prompt_length,
      compression: payloadDebug.compression,
      ordered_references: payloadDebug.ordered_references.map(ref => ({
        order: ref.order,
        role: ref.role,
        owner: ref.owner,
        id: ref.id,
        label: ref.label,
        provider_label: ref.provider_label,
        source: ref.source,
        mime_type: ref.mime_type,
        byte_size: ref.byte_size,
        download_succeeded: ref.download_succeeded,
      })),
      download_failures: payloadDebug.download_failures.map(ref => ({
        role: ref.role,
        owner: ref.owner,
        id: ref.id,
        label: ref.label,
        source: ref.source,
        failure: ref.failure,
      })),
      image_config: payloadDebug.image_config,
    }))

    if (dryRun) {
      const serverAudit = await persistNanoBananaGenerationAudit({
        workflow,
        clientId,
        dryRun,
        success: payloadDownloadFailures.length === 0,
        originalAssembledPrompt,
        finalProviderPrompt: finalPrompt,
        payloadDebug: payloadDebug as Record<string, unknown>,
        referenceAssets,
        error: payloadDownloadFailures.length > 0 ? 'One or more selected references failed to download.' : null,
      })
      Object.assign(payloadDebug, { server_audit: serverAudit })
      return NextResponse.json({
        success: payloadDownloadFailures.length === 0,
        dry_run: true,
        provider: 'google-gemini',
        model: MODEL,
        final_prompt_used: finalPrompt,
        aspect_ratio: aspectRatio,
        generation_mode: generationMode,
        location,
        time_of_day: timeOfDay,
        activation,
        background_accuracy: backgroundAccuracy,
        quality: requestedQuality,
        image_size: requestedQuality === '4k' ? '4K' : '1K',
        visual_dna_applied: visualDnaLines,
        reference_count: referenceParts.length,
        reference_assets: referenceAssets,
        payload_debug: payloadDebug,
        error: payloadDownloadFailures.length > 0 ? 'One or more selected references failed to download.' : undefined,
        failure_step: payloadDownloadFailures.length > 0 ? 'downloading_reference_assets' : undefined,
        reason: payloadDownloadFailures.length > 0 ? 'reference_download_failed' : undefined,
        action_needed: payloadDownloadFailures.length > 0 ? 'Remove or re-upload failed references before spending on generation.' : undefined,
        latency_ms: Date.now() - startedAt,
      }, { status: payloadDownloadFailures.length > 0 ? 400 : 200 })
    }

    if (payloadDownloadFailures.length > 0) {
      const serverAudit = await persistNanoBananaGenerationAudit({
        workflow,
        clientId,
        dryRun,
        success: false,
        originalAssembledPrompt,
        finalProviderPrompt: finalPrompt,
        payloadDebug: payloadDebug as Record<string, unknown>,
        referenceAssets,
        error: 'One or more selected references failed to download.',
      })
      Object.assign(payloadDebug, { server_audit: serverAudit })
      return errorPayload({
        error: 'One or more selected references failed to download.',
        failureStep: 'downloading_reference_assets',
        reason: 'reference_download_failed',
        actionNeeded: 'Remove or re-upload failed references before spending on generation.',
        startedAt,
        status: 400,
        referenceCount: referenceParts.length,
        quality: requestedQuality,
        aspectRatio,
        payloadDebug,
      })
    }

    failureStep = 'calling_gemini'
    let fallbackUsed = false
    let attempt: ProviderAttempt

    try {
      attempt = await callProvider({
        apiKey,
        finalPrompt,
        referenceParts,
        aspectRatio,
        quality: requestedQuality,
      })
    } catch (error) {
      if (requestedQuality !== '4k') throw error
      fallbackUsed = true
      failureStep = 'calling_gemini_standard_fallback'
      attempt = await callProvider({
        apiKey,
        finalPrompt,
        referenceParts,
        aspectRatio,
        quality: 'standard',
      })
    }

    if (!attempt.response.ok && requestedQuality === '4k') {
      fallbackUsed = true
      failureStep = 'calling_gemini_standard_fallback'
      attempt = await callProvider({
        apiKey,
        finalPrompt,
        referenceParts,
        aspectRatio,
        quality: 'standard',
      })
    }

    payloadDebug.ordered_references.forEach(ref => {
      ref.provider_acceptance = attempt.response.ok && !attempt.providerResponse.error ? 'provider_http_accepted' : 'provider_error'
    })
    const providerError = attempt.providerResponse.error?.message ?? attempt.response.statusText
    if (!attempt.response.ok || attempt.providerResponse.error) {
      const providerLimit = /limit|too many|maximum|max images|image count|request payload|payload too large/i.test(providerError || '')
      const serverAudit = await persistNanoBananaGenerationAudit({
        workflow,
        clientId,
        dryRun,
        success: false,
        originalAssembledPrompt,
        finalProviderPrompt: finalPrompt,
        payloadDebug: payloadDebug as Record<string, unknown>,
        referenceAssets,
        providerStatus: attempt.response.status,
        providerResponseSummary: summarizeProviderResponse(attempt.providerResponse),
        error: providerError || 'Gemini image generation failed.',
      })
      Object.assign(payloadDebug, { server_audit: serverAudit })
      return errorPayload({
        error: providerError || 'Gemini image generation failed.',
        failureStep: providerLimit ? 'provider_limit' : failureStep,
        reason: providerLimit ? 'provider_limit' : undefined,
        actionNeeded: providerLimit ? 'Reduce selected references or use fewer inspiration images.' : undefined,
        startedAt,
        status: attempt.response.status,
        providerStatus: attempt.response.status,
        providerError,
        referenceCount: referenceParts.length,
        quality: attempt.quality,
        aspectRatio,
        fallbackUsed,
        payloadDebug,
      })
    }

    failureStep = 'parsing_provider_response'
    const parts = attempt.providerResponse.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
    const imagePart = parts.find(part => (part.inlineData ?? part.inline_data)?.data)
    const inlineData = imagePart ? imagePart.inlineData ?? imagePart.inline_data : null
    const mimeType = inlineData?.mimeType ?? inlineData?.mime_type ?? 'image/png'
    const imageBase64 = inlineData?.data ?? null
    const text = parts.map(part => part.text).filter((value): value is string => Boolean(value)).join('\n')

    if (!imageBase64) {
      const serverAudit = await persistNanoBananaGenerationAudit({
        workflow,
        clientId,
        dryRun,
        success: false,
        originalAssembledPrompt,
        finalProviderPrompt: finalPrompt,
        payloadDebug: payloadDebug as Record<string, unknown>,
        referenceAssets,
        providerStatus: attempt.response.status,
        providerResponseSummary: summarizeProviderResponse(attempt.providerResponse),
        error: 'Provider response did not include generated image data.',
      })
      Object.assign(payloadDebug, { server_audit: serverAudit })
      return errorPayload({
        error: 'Provider response did not include generated image data.',
        failureStep,
        startedAt,
        status: 502,
        referenceCount: referenceParts.length,
        quality: attempt.quality,
        aspectRatio,
        payloadDebug,
      })
    }

    const serverAudit = await persistNanoBananaGenerationAudit({
      workflow,
      clientId,
      dryRun,
      success: true,
      originalAssembledPrompt,
      finalProviderPrompt: finalPrompt,
      payloadDebug: payloadDebug as Record<string, unknown>,
      referenceAssets,
      providerStatus: attempt.response.status,
      providerResponseSummary: summarizeProviderResponse(attempt.providerResponse),
      generatedOutputAssetId: null,
    })
    Object.assign(payloadDebug, { server_audit: serverAudit })
    return NextResponse.json({
      success: true,
      provider: 'google-gemini',
      model: MODEL,
      final_prompt_used: finalPrompt,
      aspect_ratio: aspectRatio,
      generation_mode: generationMode,
      location,
      time_of_day: timeOfDay,
      activation,
      background_accuracy: backgroundAccuracy,
      campaign_mode: campaignMode,
      occasion,
      guest_archetypes: [primaryGuest, secondaryGuest].filter(Boolean),
      quality: attempt.quality,
      image_size: attempt.imageSize,
      fallback_used: fallbackUsed,
      visual_dna_applied: visualDnaLines,
      reference_count: referenceParts.length,
      estimated_cost: null,
      reference_assets: referenceAssets,
      payload_debug: payloadDebug,
      generated_image_mime_type: mimeType,
      generated_image_data: `data:${mimeType};base64,${imageBase64}`,
      text,
      provider_response: summarizeProviderResponse(attempt.providerResponse),
      provider_latency_ms: attempt.latencyMs,
      latency_ms: Date.now() - startedAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return errorPayload({
      error: timedOut ? 'Gemini generation timed out before returning an image.' : message,
      failureStep,
      startedAt,
      status: timedOut ? 504 : 500,
      referenceCount,
      quality: requestedQuality,
      aspectRatio,
    })
  }
}
