export type GeminiInlineReferencePart = {
  label: string
  inlineData: { mimeType: string; data: string }
}

export type GeminiProductionRequestBody = {
  contents: Array<{ role: 'user'; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }>
  generationConfig: {
    candidateCount: number
    responseModalities: string[]
    imageConfig: { aspectRatio: string; imageSize: string }
  }
}

export const GEMINI_IMAGE_ASPECT_RATIOS = ['1:1', '4:5', '3:2', '2:3', '16:9', '9:16'] as const
export type GeminiImageAspectRatio = typeof GEMINI_IMAGE_ASPECT_RATIOS[number]

type GeminiImageGenerationOptions = {
  aspectRatio?: GeminiImageAspectRatio
  imageSize?: '4K'
}

export function buildIndividualProductionGeminiRequest(
  prompt: string,
  parts: GeminiInlineReferencePart[],
  options: GeminiImageGenerationOptions = {},
): GeminiProductionRequestBody {
  const aspectRatio = options.aspectRatio ?? '4:5'
  const imageSize = options.imageSize ?? '4K'
  return {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }, ...parts.flatMap(part => [{ text: part.label }, { inlineData: part.inlineData }])],
    }],
    generationConfig: {
      candidateCount: 1,
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio, imageSize },
    },
  }
}

export function validateIndividualProductionGeminiRequest(body: GeminiProductionRequestBody, expected: GeminiImageGenerationOptions = {}) {
  const parts = body.contents[0]?.parts ?? []
  const inlineImages = parts.filter((part): part is { inlineData: { mimeType: string; data: string } } => 'inlineData' in part)
  const firstPart = parts[0]
  if (!firstPart || !('text' in firstPart) || !firstPart.text.trim() || !inlineImages.length) return 'the production prompt or venue reference is missing'
  const aspectRatio = expected.aspectRatio ?? '4:5'
  const imageSize = expected.imageSize ?? '4K'
  if (body.generationConfig.imageConfig.aspectRatio !== aspectRatio || body.generationConfig.imageConfig.imageSize !== imageSize) return `the required ${aspectRatio} / ${imageSize} configuration is invalid`
  if (!GEMINI_IMAGE_ASPECT_RATIOS.includes(body.generationConfig.imageConfig.aspectRatio as GeminiImageAspectRatio)) return 'the requested image aspect ratio is unsupported'
  if (inlineImages.some(part => !part.inlineData.mimeType.startsWith('image/') || !part.inlineData.data)) return 'a venue reference is not a valid image binary'
  return null
}

// No-network regression fixture for the P15 V3 timeout: it proves the exact
// one-image strict-venue body remains valid before a provider request begins.
export const STRICT_VENUE_V3_REQUEST_CONTRACT_FIXTURE = {
  prompt: 'STRICT VENUE RECREATION — IMAGE-TO-IMAGE PHOTOGRAPHIC RECREATION\nREFERENCE IMAGE 1 — ABSOLUTE VENUE AND PHYSICAL SCENE TRUTH',
  references: [{ label: 'Reference Image 1 — ABSOLUTE VENUE AND PHYSICAL SCENE TRUTH: DSC09830.jpg', inlineData: { mimeType: 'image/jpeg', data: 'AA==' } }],
  expected: { referenceCount: 1, aspectRatio: '4:5', imageSize: '4K', firstPart: 'prompt' },
} as const

export function verifyStrictVenueV3RequestContractFixture() {
  const body = buildIndividualProductionGeminiRequest(STRICT_VENUE_V3_REQUEST_CONTRACT_FIXTURE.prompt, [...STRICT_VENUE_V3_REQUEST_CONTRACT_FIXTURE.references])
  const issue = validateIndividualProductionGeminiRequest(body)
  return {
    passed: !issue
      && body.contents[0].parts[0] && 'text' in body.contents[0].parts[0]
      && body.contents[0].parts.filter(part => 'inlineData' in part).length === STRICT_VENUE_V3_REQUEST_CONTRACT_FIXTURE.expected.referenceCount
      && body.generationConfig.imageConfig.aspectRatio === STRICT_VENUE_V3_REQUEST_CONTRACT_FIXTURE.expected.aspectRatio
      && body.generationConfig.imageConfig.imageSize === STRICT_VENUE_V3_REQUEST_CONTRACT_FIXTURE.expected.imageSize,
    issue,
    body,
  }
}
