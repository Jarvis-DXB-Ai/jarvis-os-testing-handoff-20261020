export type AnthropicImageContent = {
  base64: string
  mimeType: "image/jpeg" | "image/png" | "image/webp"
}

export function buildAnthropicUserContent(input: { prompt: string; image?: AnthropicImageContent }) {
  return [
    ...(input.image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: input.image.mimeType, data: input.image.base64 } }] : []),
    { type: "text" as const, text: input.prompt },
  ]
}
