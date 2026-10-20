import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  usageMetadata?: unknown
  error?: {
    message?: string
    status?: string
    code?: number
  }
}

type SourceAsset = {
  id: string
  client_id: string
  file_name: string
  asset_category: string | null
  file_path: string | null
  original_file_path: string | null
  optimized_file_path: string | null
  ai_preview_path: string | null
  file_type: string | null
  metadata: unknown
}

const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const BUCKET = 'client-assets'
const PROVIDER_TIMEOUT_MS = 120000
const SUPPORTED_CATEGORIES = new Set(['food', 'breakfast', 'drinks', 'venue_items'])
const BACKGROUND_STYLES = new Set(['studio_clean'])
const ANGLES = new Set(['match_source', '45_degree', 'top_down', 'front_profile', 'detail_closeup'])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metadataValue(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return ''
  const value = metadata[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join(', ')
  return ''
}

function cleanLine(value: string | undefined, maxLength = 220) {
  if (!value?.trim()) return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trim()}...` : compact
}

function categoryKind(category: string | null) {
  if (category === 'venue_items') return 'venue_item'
  return category === 'drinks' ? 'drink' : 'food'
}

function kindLabel(kind: string) {
  return kind === 'venue_item' ? 'venue item' : kind
}

function backgroundInstruction(_style: string) {
  return 'clean studio-style reference background; no venue context, messy table clutter, hands, people, or lifestyle scene'
}

function studioBackgroundGuidance() {
  return [
    '[STUDIO_REFERENCE_BACKGROUND]',
    '- create a clean studio-style reference image of the selected object/object set',
    '- keep the selected object/object set realistic, three-dimensional, fully visible, and detailed',
    '- preserve selected object truth: object identity, vessel/plate/glassware shape, garnish, proportions, materials, transparency, rim detail, branding/markings, liquid color, and presentation',
    '- preserve selected plates, saucers, spoons, straws, stirrers, glass bases, rims, garnishes, labels, and branded marks when they are part of the source truth',
    '- preserve glass transparency, internal glass/liquid reflections, internal refractions, rim highlights, ceramic gloss, metal highlights, and material realism',
    '- clean up distracting venue/lifestyle context without turning the object into a cutout',
    '- preserve natural object grounding, realistic lighting, and useful material detail',
    '- do not add people, hands, unrelated props, venue context, restaurant background, or campaign styling',
    '- source images define object identity, vessel, garnish, proportions, material realism, and presentation',
    '- entire object should remain visible, centered, and uncropped with clean margin',
  ].join('\n')
}

function studioNegativeBackgroundTerms() {
  return [
    '- no messy venue background',
    '- no lifestyle scene',
    '- no hands',
    '- no people',
    '- no unrelated props',
    '- no dirty table',
    '- no heavy shadows',
    '- no new venue, room, bar, restaurant, or environmental context',
  ].join('\n')
}

function angleInstruction(angle: string) {
  if (angle === '45_degree') return 'CAMERA LOCK: full-object 45-degree hero; camera must sit about 35-55 degrees above table level'
  if (angle === 'top_down') return 'CAMERA LOCK: true overhead top-down flat-lay; camera perpendicular to table'
  if (angle === 'front_profile') return 'CAMERA LOCK: low side/profile product angle; camera near table level'
  if (angle === 'detail_closeup') return 'detail close-up crop is allowed; preserve the most important texture/garnish/detail'
  return 'match the source image angle as closely as possible while keeping the complete plate/object boundary visible with wide clean margin'
}

function cameraPerspectiveInstruction(angle: string, kind: string) {
  if (angle === '45_degree') {
    if (kind === 'venue_item') {
      return [
        '- CAMERA ANGLE HARD LOCK: approximately 35-55 degrees above table level',
        '- do not generate overhead, birds-eye, flat-lay, or top-down perspective',
        '- show visible object edge, material depth, thickness, handle/rim/tine/bowl profile when applicable',
        '- preserve realistic 45-degree object-reference perspective',
      ].join('\n')
    }
    return [
      '- CAMERA ANGLE HARD LOCK: approximately 35-55 degrees above table level',
      '- do not generate overhead, birds-eye, flat-lay, or top-down perspective',
      '- show visible front plate/glass edge, vessel sidewall, rim perspective, and object depth',
      '- plate depth and rim perspective must remain visible',
      '- do not center the dish like a top-down catalog scan',
      '- preserve realistic 45-degree object-reference perspective',
    ].join('\n')
  }
  if (angle === 'top_down') {
    return [
      '- CAMERA ANGLE HARD LOCK: true top-down overhead view',
      '- flat-lay composition is allowed only for this preset',
      '- keep full object boundary visible with even margin',
    ].join('\n')
  }
  if (angle === 'front_profile') {
    return [
      '- CAMERA ANGLE HARD LOCK: low side/profile product view',
      '- show vertical food/glass structure, vessel height, and side profile',
      '- do not convert this into overhead or 45-degree view',
    ].join('\n')
  }
  if (angle === 'detail_closeup') {
    return kind === 'drink'
      ? '- CAMERA ANGLE: close detail view may crop; prioritize selected glass/liquid/garnish detail'
      : '- CAMERA ANGLE: close detail view may crop; prioritize selected food texture/garnish detail'
  }
  return '- CAMERA ANGLE: match source perspective while preserving full object boundary'
}

function framingInstruction(angle: string, kind: string) {
  if (angle === 'detail_closeup') {
    if (kind === 'venue_item') return '- detail close-up may crop only if needed; keep core object material, shape, and signature details legible'
    return kind === 'drink'
      ? '- detail close-up may crop only if needed; keep core glass/drink detail legible'
      : '- detail close-up may crop only if needed; keep core dish texture/detail legible'
  }
  if (kind === 'venue_item') {
    return [
      '- HARD FRAMING: full physical object boundary must be fully visible edge-to-edge; no object edge may be cropped',
      '- object boundary = composition boundary; the entire venue item must fit comfortably inside frame',
      '- use full object-fit framing with substantial clean margin on all sides',
      '- object should occupy about 60-75% of frame width, not 95%',
      '- do not use editorial crop behavior or dramatic lifestyle composition',
    ].join('\n')
  }
  return kind === 'drink'
    ? [
      '- HARD FRAMING: full glass/cup/vessel from rim to base must be fully visible; no glass/cup/object edge may be cropped',
      '- if a saucer, plate, spoon, straw, stirrer, garnish, or glass base is present in the source, it is part of the object truth and must be fully visible',
      '- vessel/object-set boundary = composition boundary; the entire glass/cup/vessel plus saucer/plate/base must fit comfortably inside frame',
      '- if any saucer/plate/glass/cup edge is outside the image, the output is invalid',
      '- zoom out until the full object set fits with clean margin on all sides',
      '- use full object-fit framing with substantial visible whitespace on all sides',
      '- object should occupy about 60-75% of frame height, not 95%',
      '- do not use editorial crop behavior or dramatic food/drink crop composition',
    ].join('\n')
    : [
      '- HARD FRAMING: full plate/object boundary must be fully visible edge-to-edge; no side of the plate/dish/vessel may be cropped',
      '- CRITICAL: the entire physical plate must be visible; the full outer rim must be visible on all sides',
      '- if any plate edge is outside the image, the output is invalid',
      '- zoom out until the full plate fits comfortably inside the frame',
      '- use a wider camera distance; zoom out by 20-30% compared to the source crop',
      '- plate/vessel boundary = composition boundary; the entire plate is part of the subject',
      '- no edge of the vessel may touch or approach the frame edge',
      '- there must be clean background space between every plate edge and the image border',
      '- use full object-fit framing with substantial visible whitespace around the entire plate/object',
      '- plate should occupy about 60-75% of frame width, not 95%',
      '- do not use editorial food crop composition; do not crop plate edges for aesthetic/dramatic framing',
    ].join('\n')
}

function focusInstruction(angle: string, kind = 'food') {
  if (angle === 'detail_closeup') {
    return '- detail close-up may use localized focus, but the selected detail must stay crisp and useful as object truth'
  }
  if (kind === 'venue_item') {
    return [
      '- FOCUS MODE: technical_product',
      '- entire object must remain sharp edge-to-edge and front-to-back',
      '- every visible part of the venue item must be in complete focus',
      '- preserve material, finish, shape, edge geometry, branding/markings, and object structure',
      '- do not inherit shallow depth-of-field blur from source images',
      '- use deep-focus high-aperture object-reference capture; no cinematic falloff or selective blur',
      '- preserve maximum visible detail across the entire object for reference reuse',
    ].join('\n')
  }
  return [
    '- FOCUS MODE: technical_product',
    '- entire dish/object must remain sharp edge-to-edge and front-to-back',
    '- every visible part of the dish/object and plate must be in complete focus',
    '- reconstruct missing detail if source images contain shallow focus',
    '- do not inherit shallow depth-of-field blur from source images',
    '- use deep-focus high-aperture object-reference capture; no cinematic falloff or selective blur',
    '- no soft foreground/background blur, no focus falloff, no blurred garnish, no soft vessel edges',
    '- all garnish, texture, sauce, vessel edges, glass edges, and food structure must be in focus simultaneously',
    '- preserve maximum visible detail across the entire object for reference reuse',
  ].join('\n')
}

function summarizeSource(asset: SourceAsset) {
  const metadata = asset.metadata
  if (categoryKind(asset.asset_category) === 'venue_item') {
    return [
      metadataValue(metadata, 'name') || metadataValue(metadata, 'title') || asset.file_name,
      metadataValue(metadata, 'item_type') ? `type: ${metadataValue(metadata, 'item_type')}` : '',
      metadataValue(metadata, 'material') ? `material: ${metadataValue(metadata, 'material')}` : '',
      metadataValue(metadata, 'color') ? `color: ${metadataValue(metadata, 'color')}` : '',
      metadataValue(metadata, 'cutlery') ? `cutlery: ${metadataValue(metadata, 'cutlery')}` : '',
      metadataValue(metadata, 'tableware') ? `tableware: ${metadataValue(metadata, 'tableware')}` : '',
      metadataValue(metadata, 'service_style') ? `service style: ${metadataValue(metadata, 'service_style')}` : '',
      metadataValue(metadata, 'usage') ? `usage: ${metadataValue(metadata, 'usage')}` : '',
    ].map(value => cleanLine(value, 120)).filter(Boolean).join(' · ')
  }
  if (categoryKind(asset.asset_category) === 'drink') {
    return [
      metadataValue(metadata, 'drink_name') || metadataValue(metadata, 'name') || metadataValue(metadata, 'title') || asset.file_name,
      metadataValue(metadata, 'glass_shape') ? `glass: ${metadataValue(metadata, 'glass_shape')}` : '',
      metadataValue(metadata, 'liquid_color') ? `liquid: ${metadataValue(metadata, 'liquid_color')}` : '',
      metadataValue(metadata, 'garnish') ? `garnish: ${metadataValue(metadata, 'garnish')}` : '',
      metadataValue(metadata, 'foam_or_clarity') ? `foam/clarity: ${metadataValue(metadata, 'foam_or_clarity')}` : '',
      metadataValue(metadata, 'scale') ? `scale: ${metadataValue(metadata, 'scale')}` : '',
      metadataValue(metadata, 'contains_smoke_effect') ? `contains_smoke_effect: ${metadataValue(metadata, 'contains_smoke_effect')}` : '',
    ].map(value => cleanLine(value, 120)).filter(Boolean).join(' · ')
  }

  return [
    metadataValue(metadata, 'dish_name') || metadataValue(metadata, 'name') || metadataValue(metadata, 'title') || asset.file_name,
    metadataValue(metadata, 'description') ? `description: ${metadataValue(metadata, 'description')}` : '',
    metadataValue(metadata, 'ingredients') ? `ingredients: ${metadataValue(metadata, 'ingredients')}` : '',
    metadataValue(metadata, 'menu_category') || metadataValue(metadata, 'category') ? `category: ${metadataValue(metadata, 'menu_category') || metadataValue(metadata, 'category')}` : '',
    metadataValue(metadata, 'plate_count') ? `plate_count: ${metadataValue(metadata, 'plate_count')}` : '',
    metadataValue(metadata, 'item_count') ? `item_count: ${metadataValue(metadata, 'item_count')}` : '',
    metadataValue(metadata, 'serving_vessel') ? `vessel: ${metadataValue(metadata, 'serving_vessel')}` : '',
    metadataValue(metadata, 'sauce') ? `sauce: ${metadataValue(metadata, 'sauce')}` : '',
    metadataValue(metadata, 'side_components') ? `sides: ${metadataValue(metadata, 'side_components')}` : '',
    metadataValue(metadata, 'garnish') ? `garnish: ${metadataValue(metadata, 'garnish')}` : '',
    metadataValue(metadata, 'texture_notes') ? `texture: ${metadataValue(metadata, 'texture_notes')}` : '',
    metadataValue(metadata, 'shape_structure') ? `structure: ${metadataValue(metadata, 'shape_structure')}` : '',
  ].map(value => cleanLine(value, 120)).filter(Boolean).join(' · ')
}

function inferSourceLabel(asset: SourceAsset, index: number) {
  const haystack = `${asset.file_name} ${asset.metadata ? JSON.stringify(asset.metadata) : ''}`.toLowerCase()
  const prefix = `[SOURCE ${index + 1}]`
  const label = kindLabel(categoryKind(asset.asset_category))
  if (haystack.match(/\b(close|detail|texture|macro|garnish|sauce)\b/)) return `${prefix} close-up / texture detail for the same ${label}`
  if (haystack.match(/\b(top|overhead|flatlay|flat lay)\b/)) return `${prefix} top-down / item count and layout for the same ${label}`
  if (haystack.match(/\b(side|angle|profile|height|structure)\b/)) return `${prefix} alternate angle / structure for the same ${label}`
  if (index === 0 || haystack.match(/\b(full|plate|hero|main|overall)\b/)) return `${prefix} full ${label} / overall object, vessel, shape`
  return `${prefix} source reference for the same ${label}`
}

function buildStudioPrompt(assets: SourceAsset[], backgroundStyle: string, angle: string, regenerationNotes = '') {
  const primary = assets[0]
  const kind = categoryKind(primary?.asset_category ?? 'food')
  const sourceSummaries = assets
    .map((asset, index) => `- Source ${index + 1}: ${summarizeSource(asset)}`)
    .join('\n')
  const background = backgroundInstruction(backgroundStyle)
  const angleText = angleInstruction(angle)
  const backgroundGuidance = studioBackgroundGuidance()
  const backgroundNegatives = studioNegativeBackgroundTerms()
  const correctionBlock = regenerationNotes.trim()
    ? [
      '[REGENERATION_CORRECTIONS]',
      `- Previous output failed because: ${cleanLine(regenerationNotes, 520)}`,
      '- Correct these issues in this generation.',
      '- Prioritize these corrections over aesthetic crop/composition.',
      '',
    ].join('\n')
    : ''
  const multiSourceRules = assets.length > 1
    ? [
      '',
      '[MULTI-SOURCE USE]',
      `- use all selected source images for the same ${kindLabel(kind)}`,
      `- combine them into one clean studio reference; do not create multiple ${kindLabel(kind)}s`,
      '- full-object/overall images define shape, vessel, proportions, count, and structure',
      '- close-up images define texture, material, garnish/sauce/detail where relevant, and finish',
      '- alternate angles define structure, height, and visible side details',
    ].join('\n')
    : ''

  if (kind === 'venue_item') {
    return [
      correctionBlock,
      '[OBJECTIVE]',
      '- create one clean high-detail AI truth reference image of the selected venue item',
      '- single hero object focus only; not a campaign image, not a venue scene',
      '',
      '[SOURCE TRUTH]',
      sourceSummaries,
      '- preserve exact object identity, item type, shape, proportions, material, finish, color, edge geometry, branding/markings, and visible wear/texture',
      '- preserve functional details such as fork tines, knife blade/handle, spoon bowl, plate rim, bowl depth, cup handle, glass stem/base, napkin fold, or branded object markings when present',
      '- do not redesign, simplify, reinterpret, duplicate, or substitute the venue item',
      '- use attached source images for venue item identity; do not redesign or substitute the object',
      multiSourceRules,
      '',
      backgroundGuidance,
      '',
      '[STUDIO OUTPUT]',
      `- background: ${background}`,
      `- angle: ${angleText}`,
      cameraPerspectiveInstruction(angle, kind),
      '- mode: clean studio reference / AI truth reference for future generation',
      '- not editorial hero shot, not lifestyle scene, not restaurant composition',
      '- single object/object set only; no unrelated table setting',
      framingInstruction(angle, kind),
      focusInstruction(angle, kind),
      '- even neutral studio lighting with natural object grounding',
      '',
      '[EXCLUDE]',
      '- exclude venue background, table clutter, unrelated table surface, decorative crumbs, extra props, unrelated plates/cutlery/glassware, hands, people, and atmospheric styling',
      '- no table unless the selected venue item itself is a table, tabletop, surface, tray, placemat, or background object',
      '',
      '[NEGATIVE]',
      '- no lifestyle context, no food, no drink, no random table setting, no duplicate objects, no altered item type, no unrelated props',
      backgroundNegatives,
    ].join('\n')
  }

  if (kind === 'drink') {
    return [
      correctionBlock,
      '[OBJECTIVE]',
      '- create one clean high-detail AI truth reference image of the selected drink',
      '- object reference only; not a campaign image',
      '',
      '[SOURCE TRUTH]',
      sourceSummaries,
      '- preserve exact glass shape, liquid color, garnish, foam/clarity, scale, rim, straw/stirrer if present, and visible texture',
      '- do not redesign, simplify, reinterpret, or substitute the drink',
      '- use attached source images for drink identity; do not redesign or substitute the drink',
      multiSourceRules,
      '',
      backgroundGuidance,
      '',
      '[STUDIO OUTPUT]',
      `- background: ${background}`,
      `- angle: ${angleText}`,
      cameraPerspectiveInstruction(angle, kind),
      '- mode: clean studio reference / AI truth reference for future generation',
      '- not editorial hero shot, not campaign composition, not food magazine crop',
      framingInstruction(angle, kind),
      focusInstruction(angle, kind),
      '- preserve realistic glass/liquid detail, transparency, internal refractions, rim highlights, and garnish detail',
      '- even neutral isolation lighting',
      '- full glass, saucer, spoon, garnish, and vessel details must remain visible when present',
      '',
      '[EXCLUDE]',
      '- exclude messy venue background, table clutter, dirty table marks, decorative crumbs, unrelated props, hands, people, and atmospheric styling',
      '',
      '[NEGATIVE]',
      '- no lifestyle context, no random garnish, no altered glass shape, no oversized drink, no extra objects',
      backgroundNegatives,
    ].join('\n')
  }

  return [
    correctionBlock,
    '[OBJECTIVE]',
    '- create one clean high-detail AI truth reference image of the selected dish',
    '- object reference only; not a campaign image',
    '',
    '[SOURCE TRUTH]',
    sourceSummaries,
    '- preserve exact dish identity, item count, plating, sauce, garnish, side components, serving vessel, texture, and color',
    '- do not redesign, simplify, reinterpret, or substitute the dish',
    '- use attached source images for food identity; do not redesign or substitute the dish',
    multiSourceRules,
    '',
    backgroundGuidance,
    '',
    '[STUDIO OUTPUT]',
    `- background: ${background}`,
      `- angle: ${angleText}`,
      cameraPerspectiveInstruction(angle, kind),
      '- mode: clean studio reference / AI truth reference for future generation',
      '- not editorial hero shot, not campaign composition, not food magazine crop',
      framingInstruction(angle, kind),
      focusInstruction(angle, kind),
      '- maximum realistic food texture and sharp detail',
    '- even neutral studio lighting with natural object grounding',
    '- full plate, saucer, garnish, vessel, and serving details must remain visible when present',
    '',
    '[EXCLUDE]',
    '- exclude messy venue background, table clutter, dirty table marks, decorative crumbs, extra props, unrelated plates, hands, people, and atmospheric styling',
    '',
    '[NEGATIVE]',
    '- no lifestyle context, no random garnish, no changed plate/glass shape, no changed item count, no cropped-out sides/sauces/garnish',
    backgroundNegatives,
  ].join('\n')
}

function parseImageResponse(response: GeminiResponse) {
  const parts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
  const imagePart = parts.find(part => (part.inlineData ?? part.inline_data)?.data)
  const inlineData = imagePart ? imagePart.inlineData ?? imagePart.inline_data : null
  const mimeType = inlineData?.mimeType ?? inlineData?.mime_type ?? 'image/png'
  const imageBase64 = inlineData?.data ?? null
  const text = parts.map(part => part.text).filter((value): value is string => Boolean(value)).join('\n')
  return { imageBase64, mimeType, text }
}
async function callProvider({
  apiKey,
  prompt,
  sourceParts,
}: {
  apiKey: string
  prompt: string
  sourceParts: Array<{ label: string; sourceImage: string; sourceMime: string }>
}) {
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
              { text: prompt },
              ...sourceParts.flatMap(part => [
                { text: part.label },
                { inlineData: { mimeType: part.sourceMime, data: part.sourceImage } },
              ]),
            ],
          },
        ],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '4K',
          },
        },
      }),
    })
    const providerResponse = await response.json().catch(() => ({})) as GeminiResponse
    return { response, providerResponse, latencyMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = await req.json().catch(() => ({})) as {
      client_id?: unknown
      source_asset_id?: unknown
      source_asset_ids?: unknown
      background_style?: unknown
      angle?: unknown
      regeneration_notes?: unknown
      dry_run?: unknown
    }
    const clientId = typeof body.client_id === 'string' ? body.client_id : ''
    const sourceAssetIds = Array.isArray(body.source_asset_ids)
      ? body.source_asset_ids.filter((value): value is string => typeof value === 'string')
      : typeof body.source_asset_id === 'string'
        ? [body.source_asset_id]
        : []
    const uniqueSourceAssetIds = Array.from(new Set(sourceAssetIds))
    const requestedBackgroundStyle = typeof body.background_style === 'string' && BACKGROUND_STYLES.has(body.background_style)
      ? body.background_style
      : 'studio_clean'
    const backgroundStyle = requestedBackgroundStyle
    const angle = typeof body.angle === 'string' && ANGLES.has(body.angle) ? body.angle : 'match_source'
    const regenerationNotes = typeof body.regeneration_notes === 'string' ? body.regeneration_notes : ''
    const dryRun = body.dry_run === true

    if (!clientId || uniqueSourceAssetIds.length === 0) {
      return NextResponse.json({ success: false, error: 'client_id and at least one source_asset_id are required.' }, { status: 400 })
    }

    const { data: assetRows, error } = await sb
      .from('asset_uploads')
      .select('id, client_id, file_name, asset_category, file_path, original_file_path, optimized_file_path, ai_preview_path, file_type, metadata')
      .eq('client_id', clientId)
      .in('id', uniqueSourceAssetIds)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    if (!assetRows || assetRows.length !== uniqueSourceAssetIds.length) {
      return NextResponse.json({ success: false, error: 'One or more source assets were not found for this client.' }, { status: 404 })
    }

    const assetsById = new Map((assetRows as SourceAsset[]).map(asset => [asset.id, asset]))
    const sourceAssets = uniqueSourceAssetIds.map(id => assetsById.get(id)).filter((asset): asset is SourceAsset => Boolean(asset))
    const unsupported = sourceAssets.find(asset => !SUPPORTED_CATEGORIES.has(asset.asset_category ?? ''))
    if (unsupported) {
      return NextResponse.json({ success: false, error: 'Studio references V1 only supports food, breakfast, drinks, and venue items assets.' }, { status: 400 })
    }

    const sourceDescriptors = sourceAssets.map((asset, index) => ({
      asset,
      index,
      sourcePath: asset.optimized_file_path || asset.original_file_path || asset.file_path,
      label: inferSourceLabel(asset, index),
    }))
    const missingPath = sourceDescriptors.find(item => !item.sourcePath)
    if (missingPath) return NextResponse.json({ success: false, error: `Source asset has no storage path: ${missingPath.asset.file_name}` }, { status: 400 })

    const prompt = buildStudioPrompt(sourceAssets, backgroundStyle, angle, regenerationNotes)
    const responseSources = sourceDescriptors.map(item => ({
      id: item.asset.id,
      file_name: item.asset.file_name,
      asset_category: item.asset.asset_category,
      storage_path: item.sourcePath,
      label: item.label,
    }))

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        model: MODEL,
        source_asset: responseSources[0],
        source_assets: responseSources,
        prompt,
        prompt_length: prompt.length,
        background_style: backgroundStyle,
        angle,
        reference_count: sourceAssets.length,
        source_labels: responseSources.map(source => source.label),
        latency_ms: Date.now() - startedAt,
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'GEMINI_API_KEY is not set.' }, { status: 500 })
    }

    const sourceParts = []
    for (const descriptor of sourceDescriptors) {
      const { data: blob, error: downloadError } = await sb.storage.from(BUCKET).download(descriptor.sourcePath!)
      if (downloadError || !blob) {
        return NextResponse.json({ success: false, error: `Failed to download source asset ${descriptor.asset.file_name}: ${downloadError?.message ?? 'unknown error'}` }, { status: 500 })
      }
      const buffer = Buffer.from(await blob.arrayBuffer())
      sourceParts.push({
        label: descriptor.label,
        sourceImage: buffer.toString('base64'),
        sourceMime: blob.type || descriptor.asset.file_type || 'image/jpeg',
      })
    }

    const provider = await callProvider({
      apiKey,
      prompt,
      sourceParts,
    })

    if (!provider.response.ok || provider.providerResponse.error) {
      return NextResponse.json({
        success: false,
        provider: 'google-gemini',
        model: MODEL,
        error: provider.providerResponse.error?.message || `Provider returned ${provider.response.status}`,
        provider_status: provider.response.status,
        provider_error: provider.providerResponse.error ?? null,
        prompt_length: prompt.length,
        latency_ms: Date.now() - startedAt,
      }, { status: provider.response.ok ? 500 : provider.response.status })
    }

    const parsed = parseImageResponse(provider.providerResponse)
    if (!parsed.imageBase64) {
      return NextResponse.json({
        success: false,
        provider: 'google-gemini',
        model: MODEL,
        error: parsed.text || 'Provider did not return an image.',
        prompt_length: prompt.length,
        latency_ms: Date.now() - startedAt,
      }, { status: 502 })
    }
    return NextResponse.json({
      success: true,
      provider: 'google-gemini',
      model: MODEL,
      source_asset: responseSources[0],
      source_assets: responseSources,
      background_style: backgroundStyle,
      angle,
      generated_image_data: `data:${parsed.mimeType};base64,${parsed.imageBase64}`,
      generated_image_mime_type: parsed.mimeType,
      prompt,
      prompt_length: prompt.length,
      reference_count: sourceAssets.length,
      source_labels: responseSources.map(source => source.label),
      provider_latency_ms: provider.latencyMs,
      latency_ms: Date.now() - startedAt,
      usage_metadata: provider.providerResponse.usageMetadata ?? null,
      text: parsed.text || null,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - startedAt,
    }, { status: 500 })
  }
}
