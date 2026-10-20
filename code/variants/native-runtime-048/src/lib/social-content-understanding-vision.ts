import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
import { trackUsage } from "@/lib/ai-tracker"

const MODEL = "claude-haiku-4-5"
const MAX_DIMENSION = 1800

export type SocialVisionObservation = {
  archetype: string | null
  foodVisible: string[]
  drinkVisible: string[]
  people: { presence: "none" | "one" | "multiple" | "unclear"; description: string | null }
  setting: "interior" | "exterior" | "unclear"
  broadScene: string | null
  broadMoment: string | null
  visualMood: string | null
  composition: string | null
}

function text(value: unknown, max = 120) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

function list(value: unknown) {
  return Array.isArray(value) ? value.flatMap(value => text(value, 80) ? [text(value, 80)!] : []).slice(0, 4) : []
}

function parse(value: string): SocialVisionObservation {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}")
  let parsed: Record<string, unknown> = {}
  try { if (start >= 0 && end > start) parsed = JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown> } catch { /* schema validation below creates a safe empty observation */ }
  const people = parsed.people && typeof parsed.people === "object" && !Array.isArray(parsed.people) ? parsed.people as Record<string, unknown> : {}
  return {
    archetype: text(parsed.archetype, 60),
    foodVisible: list(parsed.food_visible),
    drinkVisible: list(parsed.drink_visible),
    people: { presence: ["none", "one", "multiple", "unclear"].includes(String(people.presence)) ? String(people.presence) as SocialVisionObservation["people"]["presence"] : "unclear", description: text(people.description, 100) },
    setting: ["interior", "exterior", "unclear"].includes(String(parsed.setting)) ? String(parsed.setting) as SocialVisionObservation["setting"] : "unclear",
    broadScene: text(parsed.broad_scene),
    broadMoment: text(parsed.broad_moment),
    visualMood: text(parsed.visual_mood),
    composition: text(parsed.composition),
  }
}

async function prepareImage(url: string, fallbackMimeType: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error("The selected final image could not be read for vision analysis.")
  const input = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get("content-type")?.split(";")[0] || fallbackMimeType
  const metadata = await sharp(input, { limitInputPixels: false }).metadata()
  if (Math.max(metadata.width ?? 0, metadata.height ?? 0) <= MAX_DIMENSION && ["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return { mimeType, bytes: input, width: metadata.width ?? null, height: metadata.height ?? null }
  const bytes = await sharp(input, { limitInputPixels: false }).rotate().resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
  const resized = await sharp(bytes).metadata()
  return { mimeType: "image/jpeg", bytes, width: resized.width ?? null, height: resized.height ?? null }
}

export async function observeSocialContentImage(input: { clientId: string; signedImageUrl: string; mimeType: string }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Vision analysis is unavailable because the configured Anthropic provider is not available.")
  const image = await prepareImage(input.signedImageUrl, input.mimeType)
  const startedAt = new Date()
  const response = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0,
    system: "You are observing one final hospitality social image for a human review workflow. Return strict JSON only. Describe only broadly and visibly observable content. Never identify exact menu dishes, drink names, restaurant/brand, venue zones, people identities, activation, ingredients, preparation, menu claims, or service period. Use generic terms such as pizza, plated food, cocktail, anonymous diners, indoor dining, exterior terrace, warm evening ambience. If uncertain, omit it or use unclear.",
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: image.mimeType as "image/jpeg" | "image/png" | "image/webp", data: image.bytes.toString("base64") } },
      { type: "text", text: "Return exactly this JSON shape: {\"archetype\":\"food|drink|lifestyle dining|venue|atmosphere|unclear\",\"food_visible\":[\"generic visible food only\"],\"drink_visible\":[\"generic visible drink only\"],\"people\":{\"presence\":\"none|one|multiple|unclear\",\"description\":\"anonymous visible people only\"},\"setting\":\"interior|exterior|unclear\",\"broad_scene\":\"...\",\"broad_moment\":\"...\",\"visual_mood\":\"...\",\"composition\":\"...\"}. Do not name any product, venue, restaurant, person, activation, or service period." },
    ] }],
  })
  const content = response.content.find(block => block.type === "text")
  const observation = parse(content?.type === "text" ? content.text : "{}")
  const usage = await trackUsage({ model: MODEL, route: "/api/social/publishing", feature: "social_content_understanding_vision", clientId: input.clientId, usage: response.usage, imagesCount: 1, startedAt, requestId: response._request_id ?? undefined })
  return { observation, usage, width: image.width, height: image.height, model: MODEL }
}
