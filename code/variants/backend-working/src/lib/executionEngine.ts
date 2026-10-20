/**
 * Execution Engine v1 — text and optional single-image Anthropic requests.
 *
 * SAFETY RULES (hard-coded, never remove):
 *  - Manual trigger only — no auto-processing, no loops, no retries
 *  - No image/video generation
 *  - No Telegram automation
 *  - No publishing
 *  - Returns raw result; caller decides what to store/do
 *
 * Provider: Anthropic (claude-haiku-4-5 default — low cost)
 * Env var required: ANTHROPIC_API_KEY
 *
 * Future providers: extend the provider switch below — keep interface stable.
 */

import Anthropic from "@anthropic-ai/sdk"
import { trackUsage, calcCost } from "@/lib/ai-tracker"
import { buildAnthropicUserContent, type AnthropicImageContent } from "@/lib/anthropic-message-content"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExecuteImageInput = AnthropicImageContent

export interface ExecuteTextInput {
  prompt: string
  system?: string
  model?: string      // defaults to claude-haiku-4-5
  provider?: string   // defaults to "anthropic" — only supported value for now
  maxTokens?: number  // defaults to 1024
  temperature?: number
  timeoutMs?: number
  route?: string
  feature?: string
  clientId?: string
  structuredOutput?: {
    name: string
    description: string
    schema: Record<string, unknown>
  }
  image?: ExecuteImageInput
}

export interface ExecuteTextResult {
  ok: boolean
  rawResponse?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  durationMs?: number
  estimatedCost?: number   // kept for backward compat — now == actualCost
  actualCost?: number      // real billed cost from trackUsage
  provider: string
  model: string
  error?: string
  finishReason?: string | null
  structuredOutput?: Record<string, unknown>
}

export function textExecutionProviderStatus(input: Pick<ExecuteTextInput, 'provider' | 'model'> = {}) {
  const provider = input.provider ?? 'anthropic'
  const model = input.model ?? 'claude-haiku-4-5'
  return {
    provider,
    model,
    configured: provider === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY),
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Text provider timed out after ${Math.round(timeoutMs / 1000)}s.`)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function executeTextRun(input: ExecuteTextInput): Promise<ExecuteTextResult> {
  const provider  = input.provider ?? "anthropic"
  const model     = input.model    ?? "claude-haiku-4-5"
  const maxTokens = input.maxTokens ?? 1024
  const timeoutMs = input.timeoutMs ?? 30_000

  // ── Provider switch — add new providers here in future ───────────────────
  if (provider !== "anthropic") {
    return {
      ok:       false,
      provider,
      model,
      error:    `Provider "${provider}" is not supported yet. Only "anthropic" is configured.`,
    }
  }

  // ── API key check ─────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      ok:       false,
      provider,
      model,
      error:    "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    }
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  const startedAt = new Date()

  try {
    const client = new Anthropic({
      apiKey,
      timeout: timeoutMs,
      // Callers decide whether a corrective retry is appropriate. Avoid an
      // invisible provider retry turning one manual action into extra spend.
      maxRetries: 0,
    })

    const response = await withTimeout(client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(input.system ? { system: input.system } : {}),
      ...(input.structuredOutput ? {
        tools: [{
          name: input.structuredOutput.name,
          description: input.structuredOutput.description,
          input_schema: input.structuredOutput.schema,
        }],
        tool_choice: { type: 'tool' as const, name: input.structuredOutput.name },
      } : {}),
      messages: [{
        role: "user",
        content: buildAnthropicUserContent(input),
      }],
    } as never), timeoutMs) as Anthropic.Message & { _request_id?: string | null }

    const durationMs  = Date.now() - startedAt.getTime()
    const inputTokens = response.usage?.input_tokens  ?? 0
    const outputTokens= response.usage?.output_tokens ?? 0

    // Accurate cost from real usage (includes cache tokens)
    const actualCost = calcCost(model, response.usage)
    trackUsage({
      model,
      route:   input.route ?? "/api/execute",
      feature: input.feature ?? "execution_run",
      clientId: input.clientId,
      usage:   response.usage,
      imagesCount: input.image ? 1 : 0,
      startedAt,
      requestId: response._request_id ?? undefined,
    }).catch(() => {})

    // Extract text from response
    const rawResponse = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n")
    const toolBlock = input.structuredOutput
      ? response.content.find(block => block.type === 'tool_use' && block.name === input.structuredOutput!.name)
      : undefined
    const toolInput = toolBlock && toolBlock.type === 'tool_use' ? toolBlock.input : undefined
    const structuredOutput = toolInput && typeof toolInput === 'object' && !Array.isArray(toolInput)
      ? toolInput as Record<string, unknown>
      : undefined

    return {
      ok: true,
      rawResponse: structuredOutput ? JSON.stringify(structuredOutput) : rawResponse,
      inputTokens,
      outputTokens,
      cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
      durationMs,
      estimatedCost: actualCost,  // backward compat alias
      actualCost,
      provider,
      model,
      finishReason: response.stop_reason,
      structuredOutput,
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt.getTime()
    const message    = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      provider,
      model,
      durationMs,
      error: message,
    }
  }
}
