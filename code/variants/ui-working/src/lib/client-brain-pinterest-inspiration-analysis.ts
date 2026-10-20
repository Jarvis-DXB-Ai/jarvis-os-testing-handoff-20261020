import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { trackUsage } from '@/lib/ai-tracker'
import {
  PINTEREST_BACKGROUND_STYLES,
  PINTEREST_BEST_FOR_VALUES,
  PINTEREST_CREATIVE_CATEGORIES,
  PINTEREST_LIGHTING_STYLES,
  normalizePinterestBestFor,
  normalizePinterestTags,
} from '@/lib/client-brain-pinterest-inspiration'
import {
  VISUAL_DIRECTION_CAMERA_ANGLES,
  VISUAL_DIRECTION_COMPOSITIONS,
  VISUAL_DIRECTION_HUMAN_PRESENCE,
  VISUAL_DIRECTION_INTERACTIONS,
  VISUAL_DIRECTION_MOTIONS,
  VISUAL_DIRECTION_SHOT_SCALES,
} from '@/lib/social-monthly-visual-direction-types'

const MODEL = 'claude-haiku-4-5'
const MAX_DIMENSION = 1800

export type PinterestInspirationAnalysis = {
  creative_categories: string[]
  shot_scale: string | null
  camera_angle: string | null
  composition: string | null
  human_presence: string | null
  interaction: string | null
  motion: string | null
  lighting_style: string | null
  background_style: string | null
  creative_techniques: string[]
  visual_summary: string | null
  best_for: string[]
  requires_individual_pin_upload: boolean
}

function optionalEnum(value: unknown, values: readonly string[]) {
  return typeof value === 'string' && values.includes(value) ? value : null
}

function parse(value: string): Record<string, unknown> {
  const content = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try { return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown> } catch { return {} }
}

export function normalizePinterestInspirationAnalysis(value: Record<string, unknown>): PinterestInspirationAnalysis {
  return {
    creative_categories: normalizePinterestTags(value.creative_categories, 3).filter(item => PINTEREST_CREATIVE_CATEGORIES.includes(item as typeof PINTEREST_CREATIVE_CATEGORIES[number])),
    shot_scale: optionalEnum(value.shot_scale, VISUAL_DIRECTION_SHOT_SCALES),
    camera_angle: optionalEnum(value.camera_angle, VISUAL_DIRECTION_CAMERA_ANGLES),
    composition: optionalEnum(value.composition, VISUAL_DIRECTION_COMPOSITIONS),
    human_presence: optionalEnum(value.human_presence, VISUAL_DIRECTION_HUMAN_PRESENCE),
    interaction: optionalEnum(value.interaction, VISUAL_DIRECTION_INTERACTIONS),
    motion: optionalEnum(value.motion, VISUAL_DIRECTION_MOTIONS),
    lighting_style: optionalEnum(value.lighting_style, PINTEREST_LIGHTING_STYLES),
    background_style: optionalEnum(value.background_style, PINTEREST_BACKGROUND_STYLES),
    creative_techniques: normalizePinterestTags(value.creative_techniques),
    visual_summary: typeof value.visual_summary === 'string' ? value.visual_summary.trim().slice(0, 700) || null : null,
    best_for: normalizePinterestBestFor(value.best_for),
    requires_individual_pin_upload: value.requires_individual_pin_upload === true,
  }
}

async function prepareImage(signedUrl: string, fallbackMime: string | null) {
  const response = await fetch(signedUrl)
  if (!response.ok) return null
  const input = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type')?.split(';')[0] || fallbackMime || 'image/jpeg'
  const metadata = await sharp(input, { limitInputPixels: false }).metadata()
  if (Math.max(metadata.width ?? 0, metadata.height ?? 0) <= MAX_DIMENSION && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return { mimeType, bytes: input }
  return { mimeType: 'image/jpeg', bytes: await sharp(input, { limitInputPixels: false }).rotate().resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer() }
}

export function pinterestInspirationVisionProviderStatus() {
  return { provider: 'anthropic', model: MODEL, configured: Boolean(process.env.ANTHROPIC_API_KEY), batch_cap: 6, request_behavior: 'explicit_per_image' as const }
}

export async function analysePinterestInspiration(input: { clientId: string; signedUrl: string; fileType: string | null }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Pinterest analysis is unavailable because the configured vision provider is not available.')
  const image = await prepareImage(input.signedUrl, input.fileType)
  if (!image) throw new Error('The inspiration image could not be prepared for analysis.')
  const startedAt = new Date()
  const result = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
    model: MODEL,
    max_tokens: 420,
    temperature: 0,
    system: 'Extract creative photographic or graphic-design techniques from one external inspiration image. This is never client truth. Never identify or claim any food, drink, venue, person, brand, menu item, ingredient, architecture, or product belongs to the client. Ignore Pinterest/browser UI. Prioritise why a Creative Director would save the image: its distinctive technique, actual visible interaction, accurate camera/composition, lighting, motion, and future retrieval usefulness. If multiple separate pins are visible, set requires_individual_pin_upload true and leave all other values conservative. Return strict JSON only.',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: image.bytes.toString('base64') } },
      { type: 'text', text: `Return {"creative_categories":[],"shot_scale":null,"camera_angle":null,"composition":null,"human_presence":null,"interaction":null,"motion":null,"lighting_style":null,"background_style":null,"creative_techniques":[],"visual_summary":null,"best_for":[],"requires_individual_pin_upload":false}. Use only these enums: categories ${JSON.stringify(PINTEREST_CREATIVE_CATEGORIES)}; shot scale ${JSON.stringify(VISUAL_DIRECTION_SHOT_SCALES)}; camera ${JSON.stringify(VISUAL_DIRECTION_CAMERA_ANGLES)}; composition ${JSON.stringify(VISUAL_DIRECTION_COMPOSITIONS)}; human ${JSON.stringify(VISUAL_DIRECTION_HUMAN_PRESENCE)}; interaction ${JSON.stringify(VISUAL_DIRECTION_INTERACTIONS)}; motion ${JSON.stringify(VISUAL_DIRECTION_MOTIONS)}; lighting ${JSON.stringify(PINTEREST_LIGHTING_STYLES)}; background ${JSON.stringify(PINTEREST_BACKGROUND_STYLES)}; best_for ${JSON.stringify(PINTEREST_BEST_FOR_VALUES)}. human_presence=hands_only ONLY when an actual human hand is visibly present. A fork, spoon, knife, or other utensil without a visible hand means human_presence=none. interaction describes a visible action, not the existence of an object: use utensil_interaction for a utensil engaging food without a visible hand; use garnishing for a visible garnish/squeeze/finish action; use pouring for visible liquid or sauce flow. Never infer an action that cannot be seen. Choose camera_angle from actual camera position; do not default to eye_level when uncertain, use other. best_for must be concise creative retrieval intents, never broad positioning or marketing phrases. creative_techniques stays specific, richly descriptive, and may capture unusual ideas. visual_summary says only why the creative technique is useful, never what is factually depicted.` },
    ] }],
  })
  const output = result.content.find(block => block.type === 'text')
  const analysis = normalizePinterestInspirationAnalysis(output?.type === 'text' ? parse(output.text) : {})
  await trackUsage({ model: MODEL, route: '/api/clients/[id]/pinterest-inspirations/analyze', feature: 'pinterest_inspiration_analysis', clientId: input.clientId, usage: result.usage, imagesCount: 1, startedAt, requestId: result._request_id ?? undefined })
  return analysis
}
