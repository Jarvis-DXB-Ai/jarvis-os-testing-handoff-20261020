import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { trackUsage } from '@/lib/ai-tracker'

const MAX_DIMENSION = 1800
const MODEL = 'claude-haiku-4-5'

export type AssetReferenceObservation = {
  camera_angle?: string
  framing?: string
}

export type AssetVisualTruth = {
  visual_presentation?: string
  reference_observation?: AssetReferenceObservation
}

export type VenueVisualTruth = {
  key_visual_details: string[]
  visual_presentation: string
  perspective_flexibility: 'low' | 'medium'
}

const OBSERVATION_KEYS = ['camera_angle', 'framing'] as const

async function prepareImage(url: string, fallbackMimeType?: string | null) {
  const response = await fetch(url)
  if (!response.ok) return null
  const input = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type')?.split(';')[0] || fallbackMimeType || 'image/jpeg'
  const metadata = await sharp(input, { limitInputPixels: false }).metadata()
  if (Math.max(metadata.width ?? 0, metadata.height ?? 0) <= MAX_DIMENSION && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return { mimeType, bytes: input }
  }
  const bytes = await sharp(input, { limitInputPixels: false })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
  return { mimeType: 'image/jpeg', bytes }
}

function text(value: unknown, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

function visualTruthFrom(value: unknown): AssetVisualTruth {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const candidate = value as Record<string, unknown>
  const truth: AssetVisualTruth = {}
  const visualPresentation = text(candidate.visual_presentation, 700)
  if (visualPresentation) truth.visual_presentation = visualPresentation
  if (candidate.reference_observation && typeof candidate.reference_observation === 'object' && !Array.isArray(candidate.reference_observation)) {
    const observation = Object.fromEntries(OBSERVATION_KEYS.flatMap(key => {
      const result = text((candidate.reference_observation as Record<string, unknown>)[key], 160)
      return result ? [[key, result]] : []
    })) as AssetReferenceObservation
    if (Object.keys(observation).length) truth.reference_observation = observation
  }
  return truth
}

function parseJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try { return JSON.parse(fenced.slice(start, end + 1)) } catch { return {} }
}

export async function analyseAssetVisualTruth(input: {
  clientId: string
  signedImageUrl: string
  fileType?: string | null
  category: 'food' | 'drinks'
  canonicalName?: string
  menuTruth?: {
    menuSection: string | null
    listedIngredients: string[]
    dietaryMarkers: string[]
    alcoholStatus?: string
  }
  usageContext?: {
    route: string
    feature: string
  }
}) : Promise<{ truth: AssetVisualTruth; warning?: string; trackedCostUsd?: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { truth: {}, warning: 'Visual analysis is unavailable because the configured vision provider is not available.' }
  const image = await prepareImage(input.signedImageUrl, input.fileType)
  if (!image) return { truth: {}, warning: 'The selected Asset image could not be prepared for visual analysis.' }

  const startedAt = new Date()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const categoryShape = '{"visual_presentation":"","reference_observation":{"camera_angle":"","framing":""}}'
  const officialTruth = input.canonicalName && input.menuTruth
    ? `Confirmed official menu identity: ${input.canonicalName}\nOfficial menu section: ${input.menuTruth.menuSection ?? 'Not listed'}\nOfficial menu ingredients (exact wording): ${input.menuTruth.listedIngredients.join('; ') || 'Not listed'}\nOfficial dietary markers: ${input.menuTruth.dietaryMarkers.join('; ') || 'Not listed'}\nOfficial alcohol status: ${input.menuTruth.alcoholStatus ?? 'Not listed'}`
    : 'No official menu identity is available. Do not infer or name the dish/drink, ingredients, garnish identity, allergens, price, menu category, or alcohol status from the image.'
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 220,
    temperature: 0,
    system: 'You extract concise product-only visual truth from a restaurant Asset image. When official menu truth is supplied, it is the sole authority for identity, ingredients, allergens, dietary markers, alcohol status, price, and menu category. When it is not supplied, never infer any of those fields from the image. Do not describe background, surface, studio setup, shadows, lighting, venue, tables, camera angle, framing, or environmental context in visual_presentation. Omit uncertain details. Return strict JSON only.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: image.bytes.toString('base64') } },
        { type: 'text', text: `${officialTruth}\nAsset category: ${input.category}\nReturn exactly this JSON shape: ${categoryShape}\nWrite visual_presentation as one concise 20-60 word description of only the visible product characteristics needed to reproduce this exact product: distinctive shape, portion/form, serving vessel when important, arrangement, texture, and layering. Mention components or garnish only when they are explicitly present in supplied official menu wording. Do not exhaustively describe the photograph. reference_observation is optional and may contain only camera angle and framing; it is not ordinary product truth.` },
      ],
    }],
  })
  const content = response.content.find(block => block.type === 'text')
  const truth = visualTruthFrom(content?.type === 'text' ? parseJson(content.text) : {})
  const usage = await trackUsage({
    model: MODEL,
    route: input.usageContext?.route ?? '/api/clients/[id]/brain-v2/assets/[assetId]/enrich',
    feature: input.usageContext?.feature ?? 'restaurant_asset_visual_truth',
    clientId: input.clientId,
    usage: response.usage,
    imagesCount: 1,
    startedAt,
    requestId: response._request_id ?? undefined,
  })
  return { truth, trackedCostUsd: usage.costUsd }
}

export async function analyseVenueVisualTruth(input: {
  clientId: string
  signedImageUrl: string
  fileType?: string | null
  category: 'interiors' | 'exteriors'
}) : Promise<{ truth: VenueVisualTruth | null; warning?: string; trackedCostUsd?: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { truth: null, warning: 'Venue visual analysis is unavailable because the configured vision provider is not available.' }
  const image = await prepareImage(input.signedImageUrl, input.fileType)
  if (!image) return { truth: null, warning: 'The staged venue image could not be prepared for visual analysis.' }

  const startedAt = new Date()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 260,
    temperature: 0,
    system: 'Extract concise, visible physical venue truth from one hospitality reference image. Do not infer unseen architecture, room names, materials, capacity, camera setup, brand claims, or surrounding context. Return strict JSON only.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: image.bytes.toString('base64') } },
        { type: 'text', text: `Asset category: ${input.category}. Return exactly {"key_visual_details":["..."],"visual_presentation":"...","perspective_flexibility":"low"}. Include 3-8 short Key Visual Details that are visibly persistent physical facts only. Visual Presentation must be a 20-60 word summary of the visible space or facade only. Perspective Flexibility must be low or medium. With one image, choose low unless modest established-geometry variation is clearly safe. Never output high.` },
      ],
    }],
  })
  const content = response.content.find(block => block.type === 'text')
  const parsed = content?.type === 'text' ? parseJson(content.text) : {}
  const candidate = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  const details = Array.isArray(candidate.key_visual_details)
    ? [...new Set(candidate.key_visual_details.flatMap(item => typeof item === 'string' ? [item.trim().slice(0, 200)] : []).filter(Boolean))].slice(0, 8)
    : []
  const presentation = text(candidate.visual_presentation, 700) ?? ''
  const flexibility = candidate.perspective_flexibility === 'medium' ? 'medium' : 'low'
  const usage = await trackUsage({
    model: MODEL,
    route: '/api/clients/[id]/brain-v2/asset-ingestion',
    feature: 'restaurant_venue_truth_ingestion',
    clientId: input.clientId,
    usage: response.usage,
    imagesCount: 1,
    startedAt,
    requestId: response._request_id ?? undefined,
  })
  return { truth: { key_visual_details: details, visual_presentation: presentation, perspective_flexibility: flexibility }, trackedCostUsd: usage.costUsd }
}
