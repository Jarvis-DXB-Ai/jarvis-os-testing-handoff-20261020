import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import {
  creativeDirectorSystemPrompt,
  creativeDirectorUserPrompt,
  fallbackCreativeDirectorReasoning,
  parseCreativeDirectorJson,
  type CreativeDirectorInput,
  type CreativeDirectorResponse,
} from "@/lib/creative-director"

export const runtime = "nodejs"

function textFromAnthropicContent(content: unknown) {
  if (!Array.isArray(content)) return ""
  return content
    .filter((block): block is { type: "text"; text: string } => Boolean(block) && typeof block === "object" && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
}

export async function POST(request: NextRequest) {
  let input: CreativeDirectorInput
  try {
    input = await request.json() as CreativeDirectorInput
  } catch {
    return NextResponse.json<CreativeDirectorResponse>({
      success: false,
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      provider: "anthropic",
      reasoning: fallbackCreativeDirectorReasoning(),
      error: "Invalid Creative Director request payload.",
    }, { status: 400 })
  }

  const fallback = fallbackCreativeDirectorReasoning(input)
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"

  if (!apiKey) {
    return NextResponse.json<CreativeDirectorResponse>({
      success: false,
      configured: false,
      provider: "anthropic",
      model,
      reasoning: fallback,
      error: "ANTHROPIC_API_KEY is not configured. Using deterministic fallback reasoning.",
    })
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1400,
      temperature: 0.2,
      system: creativeDirectorSystemPrompt(),
      messages: [
        {
          role: "user",
          content: creativeDirectorUserPrompt(input),
        },
      ],
    })
    const rawText = textFromAnthropicContent(message.content)
    const reasoning = parseCreativeDirectorJson(rawText, fallback)

    return NextResponse.json<CreativeDirectorResponse>({
      success: true,
      configured: true,
      provider: "anthropic",
      model,
      reasoning,
      rawText,
    })
  } catch (error) {
    return NextResponse.json<CreativeDirectorResponse>({
      success: false,
      configured: true,
      provider: "anthropic",
      model,
      reasoning: fallback,
      error: error instanceof Error ? error.message : "Creative Director request failed.",
    }, { status: 500 })
  }
}
