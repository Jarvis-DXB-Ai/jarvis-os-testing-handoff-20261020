import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aiModelSlotShortLabel } from '@/lib/ai-model-library'

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

type ReferenceImageRequest = {
  asset_id?: string
  asset_type?: string
  image_url?: string
  storage_path?: string
  label?: string
  version_number?: number
}

type ApprovedReferenceAsset = {
  id: string
  asset_type: string
  image_url: string | null
  storage_path: string | null
  prompt_used: string | null
  status: string
  version_number: number
}

type ProviderReferencePart = {
  label: string
  inlineData: {
    mimeType: string
    data: string
  }
  asset: ApprovedReferenceAsset
}

const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const PROVIDER_TIMEOUT_MS = 120000
const REFERENCE_SLOTS = new Set(['front_face', 'forty_five_face', 'full_body_front', 'full_body_side'])
const GENERATION_ASSET_TYPES = new Set([...Array.from(REFERENCE_SLOTS), 'outfit'])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function parseImageResponse(response: GeminiResponse) {
  const parts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
  const imagePart = parts.find(part => (part.inlineData ?? part.inline_data)?.data)
  const inlineData = imagePart ? imagePart.inlineData ?? imagePart.inline_data : null
  const mimeType = inlineData?.mimeType ?? inlineData?.mime_type ?? 'image/png'
  const imageBase64 = inlineData?.data ?? null
  const text = parts.map(part => part.text).filter((value): value is string => Boolean(value)).join('\n')
  return { imageBase64, mimeType, text }
}

function aspectRatioForSlot(slot: string) {
  return slot === 'front_face' || slot === 'forty_five_face' ? '4:5' : '4:5'
}

function slotGuardrail(slot: string) {
  if (slot === 'front_face') {
    return 'REFERENCE SLOT: Front Face. White seamless studio portrait, front-facing, centered, 85mm portrait lens, even lighting, face clearly visible. Wardrobe standard: plain fitted black t-shirt, crew neck, short sleeves, no logos, no graphics, no accessories, no jewellery, no blazer, no fashion styling.'
  }
  if (slot === 'forty_five_face') {
    return 'REFERENCE SLOT: 45 Degree Face. White seamless studio portrait, head turned 45 degrees, same identity, even lighting, face clearly visible. Wardrobe standard: plain fitted black t-shirt, crew neck, short sleeves, no logos, no graphics, no accessories, no jewellery, no blazer, no fashion styling.'
  }
  if (slot === 'full_body_front') {
    return 'REFERENCE SLOT: Full Body Front. White seamless full-body fashion fitting reference. Wardrobe standard: simple black underwear set, black bra, black underwear bottoms, barefoot. Non-sexual clinical presentation, body proportions clearly visible, waist/shoulders/hips/silhouette clear, arms relaxed, feet visible, natural posture, realistic anatomy. No lace, no patterns, no branding, no jewellery, no leggings, no t-shirt, no socks, no shoes, no outfit styling, no lifestyle styling.'
  }
  if (slot === 'full_body_side') {
    return 'REFERENCE SLOT: Full Body Side. White seamless full-body side profile fashion fitting reference. Wardrobe standard: simple black underwear set, black bra, black underwear bottoms, barefoot. Non-sexual clinical presentation, body proportions clearly visible, waist/shoulders/hips/silhouette clear, arms relaxed, feet visible, natural posture, realistic anatomy. No lace, no patterns, no branding, no jewellery, no leggings, no t-shirt, no socks, no shoes, no outfit styling, no lifestyle styling.'
  }
  return 'OUTFIT GENERATION. Clean studio wardrobe collection reference only. White seamless studio background, full body visible, neutral standing pose, clean fashion reference composition. Outfit references are clothing and footwear only. Accessories are a separate generation layer and must not appear here. Do not include watches, Rolex, jewellery, bracelets, necklaces, rings, bags, sunglasses, hats, belts, visible branded accessories, props, restaurant background, terrace, or lifestyle scene. If the model profile mentions a watch or Rolex, ignore it for outfit generation and preserve it only as an accessory preference for later. Use Dubai warm-weather styling: breathable fabrics, linen, silk, cotton, light tailoring, sleeveless or short-sleeve tops, elegant summer dresses, lightweight trousers, tailored shirts, polos, tailored shorts, loafers, sandals, heels, or refined summer footwear depending on the collection. Loosen silhouette, fabric, colour, cut, neckline, and fashion interpretation while keeping studio reference rules. Avoid boring corporate looks, conservative office outfits, generic catalogue styling, heavy knitwear, thick sweaters, coats, winter layering, boots, cold-weather styling, oversized shapeless clothing, vulgar styling, nightclub styling, influencer costume, cheap clubwear, party-girl styling, hype-brand styling, bodybuilder fashion, logo-heavy luxury, or overly revealing clothing.'
}

function strictIdentityAnchor(slot: string, referenceCount: number) {
  if (slot !== 'outfit') return ''
  return [
    'Use the attached approved Character DNA references as strict identity anchors.',
    referenceCount > 0 ? `There are ${referenceCount} approved identity/body reference image(s) attached; prioritize them over text for identity.` : 'If approved Character DNA references are attached, prioritize them over text for identity.',
    'Preserve the exact same face, facial structure, hairline, hair colour, eye shape, nose, smile, skin tone, height, body proportions, waist/hip ratio, posture, and overall identity.',
    'Only change clothing and footwear.',
    'Do not add watches, Rolex, jewellery, bracelets, necklaces, rings, bags, sunglasses, hats, belts, visible branded accessories, props, or lifestyle context.',
    'Do not create a similar person, prettier alternate, younger alternate, new ethnicity, new face, new body, or new fashion model.',
  ].join(' ')
}

function parseReferenceImageRequests(value: unknown): ReferenceImageRequest[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ReferenceImageRequest[] => {
    if (typeof item === 'string' && item.trim()) {
      const text = item.trim()
      return [{ image_url: text, storage_path: text }]
    }
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    return [{
      asset_id: typeof record.asset_id === 'string' ? record.asset_id : typeof record.assetId === 'string' ? record.assetId : undefined,
      asset_type: typeof record.asset_type === 'string' ? record.asset_type : typeof record.assetType === 'string' ? record.assetType : undefined,
      image_url: typeof record.image_url === 'string' ? record.image_url : typeof record.imageUrl === 'string' ? record.imageUrl : undefined,
      storage_path: typeof record.storage_path === 'string' ? record.storage_path : typeof record.storagePath === 'string' ? record.storagePath : undefined,
      label: typeof record.label === 'string' ? record.label : undefined,
      version_number: typeof record.version_number === 'number' ? record.version_number : typeof record.versionNumber === 'number' ? record.versionNumber : undefined,
    }]
  })
}

async function resolveApprovedReferenceAssets(clientId: string, modelId: string, requests: ReferenceImageRequest[]) {
  if (requests.length === 0) return []
  const { data } = await sb
    .from('ai_model_assets')
    .select('id, asset_type, image_url, storage_path, prompt_used, status, version_number')
    .eq('client_id', clientId)
    .eq('model_id', modelId)
    .eq('status', 'approved')
    .in('asset_type', Array.from(REFERENCE_SLOTS))
  const approved = (data ?? []) as ApprovedReferenceAsset[]
  const resolved: ApprovedReferenceAsset[] = []

  requests.forEach(request => {
    const match = approved.find(asset => {
      if (request.asset_id && asset.id === request.asset_id) return true
      if (request.storage_path && asset.storage_path && asset.storage_path === request.storage_path) return true
      if (request.image_url && asset.image_url && asset.image_url === request.image_url) return true
      return false
    })
    if (match && !resolved.some(asset => asset.id === match.id)) resolved.push(match)
  })

  return resolved
}

async function assetToProviderPart(asset: ApprovedReferenceAsset, index: number): Promise<ProviderReferencePart> {
  let arrayBuffer: ArrayBuffer
  let mimeType = 'image/jpeg'

  if (asset.storage_path) {
    const { data, error } = await sb.storage.from('guest-models').download(asset.storage_path)
    if (error || !data) throw new Error(error?.message || `Unable to download ${asset.storage_path}`)
    arrayBuffer = await data.arrayBuffer()
    mimeType = data.type || mimeType
  } else if (asset.image_url) {
    const response = await fetch(asset.image_url)
    if (!response.ok) throw new Error(`Unable to fetch ${asset.image_url}: ${response.status}`)
    arrayBuffer = await response.arrayBuffer()
    mimeType = response.headers.get('content-type') || mimeType
  } else {
    throw new Error(`Reference asset ${asset.id} has no image URL or storage path.`)
  }

  return {
    label: `[APPROVED_CHARACTER_DNA_REFERENCE_${index + 1}]\n${aiModelSlotShortLabel(asset.asset_type)} v${asset.version_number}. Use this approved image only for identity, face, hair, skin tone, body proportion, and character continuity.`,
    inlineData: {
      mimeType,
      data: Buffer.from(arrayBuffer).toString('base64'),
    },
    asset,
  }
}

function referenceContinuityPrompt(assetType: string, referenceCount: number) {
  if (referenceCount === 0) return ''
  if (assetType === 'forty_five_face') {
    return 'Use the attached approved Front Face reference to create the same woman from a 45-degree angle. Preserve exact identity, facial structure, hair, skin tone, age, and natural expression.'
  }
  if (assetType === 'full_body_front') {
    return 'Use the attached approved face reference image(s) to preserve the same identity while generating a full body front fashion reference. Keep face identity consistent and establish realistic body proportions.'
  }
  if (assetType === 'full_body_side') {
    return 'Use the attached approved face and body front references to preserve the same identity and body proportions from the side. Do not create a new person.'
  }
  if (assetType === 'outfit') {
    return 'Use all attached approved Character DNA references to preserve the exact same person. Preserve the exact same face, facial structure, hairline, hair colour, eye shape, nose, smile, skin tone, height, body proportions, waist/hip ratio, posture, and overall identity. Only change clothing and footwear. Keep the image as a clean full-body white studio wardrobe collection reference with no accessories, watches, Rolex, jewellery, bags, sunglasses, hats, belts, props, or lifestyle background.'
  }
  return 'Use the attached approved reference image(s) to preserve the exact same identity, facial structure, hair, skin tone, body proportions, and overall character continuity.'
}

async function callProvider(apiKey: string, prompt: string, aspectRatio: string, referenceParts: ProviderReferencePart[]) {
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
      model_id?: unknown
      asset_type?: unknown
      prompt?: unknown
      negative_prompt?: unknown
      notes?: unknown
      dry_run?: unknown
      referenceImages?: unknown
      reference_images?: unknown
      generationSettings?: unknown
      generation_settings?: unknown
    }
    const clientId = typeof body.client_id === 'string' ? body.client_id : ''
    const modelId = typeof body.model_id === 'string' ? body.model_id : ''
    const assetType = typeof body.asset_type === 'string' ? body.asset_type : ''
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const negativePrompt = typeof body.negative_prompt === 'string' ? body.negative_prompt.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    const dryRun = body.dry_run === true
    const referenceImageRequests = parseReferenceImageRequests(body.referenceImages ?? body.reference_images)

    if (!clientId || !modelId || !GENERATION_ASSET_TYPES.has(assetType) || !prompt) {
      return NextResponse.json({ success: false, error: 'client_id, model_id, valid asset_type, and prompt are required.' }, { status: 400 })
    }

    const { data: model, error: modelError } = await sb
      .from('ai_models')
      .select('id, client_id, model_name')
      .eq('client_id', clientId)
      .eq('id', modelId)
      .single()

    if (modelError || !model) {
      return NextResponse.json({ success: false, error: 'AI model was not found for this client.' }, { status: 404 })
    }

    const approvedReferenceAssets = await resolveApprovedReferenceAssets(clientId, modelId, referenceImageRequests)
    const referenceContinuity = referenceContinuityPrompt(assetType, approvedReferenceAssets.length)
    const identityAnchor = strictIdentityAnchor(assetType, approvedReferenceAssets.length)
    const providerPrompt = [
      '[AI_MODEL_REFERENCE_GENERATION]',
      identityAnchor ? `[STRICT_IDENTITY_ANCHOR]\n${identityAnchor}` : '',
      '',
      slotGuardrail(assetType),
      assetType === 'outfit' ? '[OUTFIT_ACCESSORY_LOCK]\nOutfit references = clothing and footwear only. Do not include watches, Rolex, jewellery, bracelets, necklaces, rings, bags, sunglasses, hats, belts, visible branded accessories, props, or accessory styling. Accessories are generated and controlled separately later.' : '',
      '',
      referenceContinuity ? `[REFERENCE_IMAGE_CONTINUITY]\n${referenceContinuity}\nImage authority matters: attached approved references override text if identity details conflict.` : '',
      '',
      '[PROMPT]',
      prompt,
      '',
      notes ? `[REFINEMENT_NOTES]\n${notes}` : '',
      '',
      '[NEGATIVE_PROMPT]',
      negativePrompt,
    ].filter(section => section.trim()).join('\n')

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        provider: 'google-gemini',
        model: MODEL,
        prompt: providerPrompt,
        prompt_length: providerPrompt.length,
        aspect_ratio: aspectRatioForSlot(assetType),
        reference_images_requested: referenceImageRequests.length,
        reference_images_used: approvedReferenceAssets.map(asset => ({
          asset_id: asset.id,
          asset_type: asset.asset_type,
          version_number: asset.version_number,
        })),
        latency_ms: Date.now() - startedAt,
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'GEMINI_API_KEY is not set.' }, { status: 500 })
    }

    const referenceParts: ProviderReferencePart[] = []
    const droppedReferences: Array<{ asset_id: string; asset_type: string; reason: string }> = []
    for (const [index, asset] of approvedReferenceAssets.entries()) {
      try {
        referenceParts.push(await assetToProviderPart(asset, index))
      } catch (referenceError) {
        droppedReferences.push({
          asset_id: asset.id,
          asset_type: asset.asset_type,
          reason: referenceError instanceof Error ? referenceError.message : String(referenceError),
        })
      }
    }

    const provider = await callProvider(apiKey, providerPrompt, aspectRatioForSlot(assetType), referenceParts)

    if (!provider.response.ok || provider.providerResponse.error) {
      return NextResponse.json({
        success: false,
        provider: 'google-gemini',
        model: MODEL,
        error: provider.providerResponse.error?.message || `Provider returned ${provider.response.status}`,
        provider_status: provider.response.status,
        provider_error: provider.providerResponse.error ?? null,
        prompt_length: providerPrompt.length,
        reference_images_used: referenceParts.map(part => ({
          asset_id: part.asset.id,
          asset_type: part.asset.asset_type,
          version_number: part.asset.version_number,
        })),
        reference_images_dropped: droppedReferences,
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
        prompt_length: providerPrompt.length,
        reference_images_used: referenceParts.map(part => ({
          asset_id: part.asset.id,
          asset_type: part.asset.asset_type,
          version_number: part.asset.version_number,
        })),
        reference_images_dropped: droppedReferences,
        latency_ms: Date.now() - startedAt,
      }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      provider: 'google-gemini',
      model: MODEL,
      model_id: modelId,
      client_id: clientId,
      asset_type: assetType,
      generated_image_data: `data:${parsed.mimeType};base64,${parsed.imageBase64}`,
      generated_image_mime_type: parsed.mimeType,
      prompt,
      provider_prompt: providerPrompt,
      negative_prompt: negativePrompt,
      notes,
      prompt_length: providerPrompt.length,
      reference_images_requested: referenceImageRequests.length,
      reference_images_used: referenceParts.map(part => ({
        asset_id: part.asset.id,
        asset_type: part.asset.asset_type,
        version_number: part.asset.version_number,
      })),
      reference_images_dropped: droppedReferences,
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
