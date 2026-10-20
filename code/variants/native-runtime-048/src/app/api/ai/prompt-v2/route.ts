import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import {
  compilePromptV2ForProvider,
  fallbackPromptV2,
  parsePromptV2Json,
  promptV2SystemPrompt,
  promptV2UserPrompt,
  type PromptV2Input,
  type PromptV2Response,
} from "@/lib/prompt-v2"

export const runtime = "nodejs"

const DEFAULT_PROMPT_V2_MODEL = "claude-sonnet-4-6"
const DEFAULT_PROMPT_V2_TIMEOUT_MS = 30000

function textFromAnthropicContent(content: unknown) {
  if (!Array.isArray(content)) return ""
  return content
    .filter((block): block is { type: "text"; text: string } => Boolean(block) && typeof block === "object" && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
}

function promptV2TimeoutMs() {
  const value = Number(process.env.PROMPT_V2_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROMPT_V2_TIMEOUT_MS
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Prompt V2 provider timed out after ${Math.round(timeoutMs / 1000)}s. Using deterministic Prompt V2 fallback.`))
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function hasCompiledPrompt(promptV2: PromptV2Response["promptV2"]) {
  return compilePromptV2ForProvider(promptV2).trim().length > 0
}

export async function POST(request: NextRequest) {
  let input: PromptV2Input
  try {
    input = await request.json() as PromptV2Input
  } catch {
    return NextResponse.json<PromptV2Response>({
      success: false,
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      provider: "anthropic",
      promptV2: fallbackPromptV2(undefined, "Invalid Prompt V2 request payload."),
      error: "Invalid Prompt V2 request payload.",
    }, { status: 400 })
  }

  const fallback = fallbackPromptV2(input)
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_PROMPT_V2_MODEL

  if (!apiKey) {
    return NextResponse.json<PromptV2Response>({
      success: false,
      configured: false,
      provider: "anthropic",
      model,
      promptV2: fallback,
      error: "ANTHROPIC_API_KEY is not configured. Using Prompt V2 deterministic fallback.",
    })
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await withTimeout(anthropic.messages.create({
      model,
      max_tokens: 5200,
      temperature: 0.18,
      system: promptV2SystemPrompt(),
      messages: [
        {
          role: "user",
          content: promptV2UserPrompt(input),
        },
      ],
    }), promptV2TimeoutMs())
    const rawText = textFromAnthropicContent(message.content)
    const promptV2 = parsePromptV2Json(rawText, fallback)
    if (!hasCompiledPrompt(promptV2)) {
      const emptyPromptReason = "Prompt V2 provider returned an empty prompt. Using deterministic Prompt V2 fallback."
      return NextResponse.json<PromptV2Response>({
        success: false,
        configured: true,
        provider: "anthropic",
        model,
        promptV2: fallbackPromptV2(input, emptyPromptReason),
        rawText,
        error: emptyPromptReason,
      })
    }

    return NextResponse.json<PromptV2Response>({
      success: true,
      configured: true,
      provider: "anthropic",
      model,
      promptV2,
      rawText,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Prompt V2 Creative Director request failed."
    return NextResponse.json<PromptV2Response>({
      success: false,
      configured: true,
      provider: "anthropic",
      model,
      promptV2: fallbackPromptV2(input, reason),
      error: reason,
    })
  }
}
