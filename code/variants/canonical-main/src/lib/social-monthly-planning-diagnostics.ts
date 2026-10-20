import 'server-only'

import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import type { MonthlyPlanningMode } from '@/lib/social-monthly-planning-prompt'

type Json = Record<string, unknown>

export const MONTHLY_PLANNING_EXECUTION_OUTCOMES = [
  'running',
  'provider_failed',
  'provider_succeeded',
  'structured_output_missing',
  'schema_failed',
  'count_failed',
  'enum_failed',
  'reference_failed',
  'date_failed',
  'business_rule_failed',
  'atomic_apply_failed',
  'succeeded',
] as const

export const MONTHLY_PLANNING_VALIDATION_STAGES = [
  'provider_request',
  'provider_response',
  'tool_output_extracted',
  'schema_validation',
  'item_count_validation',
  'enum_validation',
  'asset_reference_validation',
  'activation_reference_validation',
  'production_capability_validation',
  'date_validation',
  'business_rule_validation',
  'atomic_apply',
  'succeeded',
] as const

export type MonthlyPlanningExecutionOutcome = typeof MONTHLY_PLANNING_EXECUTION_OUTCOMES[number]
export type MonthlyPlanningValidationStage = typeof MONTHLY_PLANNING_VALIDATION_STAGES[number]

export type PlanningDiagnosticIssue = {
  outcome: Exclude<MonthlyPlanningExecutionOutcome, 'running' | 'provider_succeeded' | 'succeeded'>
  stage: MonthlyPlanningValidationStage
  slot?: number | null
  field?: string | null
  value?: string | null
}

export class MonthlyPlanningDiagnosticError extends ClientBrainV2HttpError {
  constructor(message: string, public readonly diagnostic: PlanningDiagnosticIssue, status = 502) {
    super(message, status)
  }
}

export function monthlyPlanningDiagnosticError(message: string, diagnostic: PlanningDiagnosticIssue, status = 502) {
  return new MonthlyPlanningDiagnosticError(message, diagnostic, status)
}

const MAX_DEBUG_BYTES = 64 * 1024
const SENSITIVE_KEY = /(?:api[_-]?key|authorization|token|secret|password|cookie|credential)/i

function isRecord(value: unknown): value is Json {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[depth limited]'
  if (typeof value === 'string') return value.length > 4_000 ? `${value.slice(0, 3_800)}...[truncated]` : value
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value
  if (Array.isArray(value)) return value.slice(0, 80).map(entry => scrub(entry, depth + 1))
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : scrub(entry, depth + 1)]))
  }
  return String(value)
}

export function sanitizeMonthlyPlanningPayload(value: unknown) {
  const sanitized = scrub(value)
  const serialized = JSON.stringify(sanitized)
  const byteCount = Buffer.byteLength(serialized, 'utf8')
  if (byteCount <= MAX_DEBUG_BYTES) {
    return { payload: sanitized, truncated: false, byteCount }
  }
  return {
    payload: {
      truncated: true,
      byte_count: byteCount,
      preview_start: serialized.slice(0, 24_000),
      preview_end: serialized.slice(-8_000),
    },
    truncated: true,
    byteCount,
  }
}

export function diagnosticFromError(error: unknown): PlanningDiagnosticIssue {
  if (error instanceof MonthlyPlanningDiagnosticError) return error.diagnostic
  return {
    outcome: 'business_rule_failed',
    stage: 'business_rule_validation',
    slot: null,
    field: null,
    value: null,
  }
}

export function diagnosticMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export type MonthlyPlanningExecutionStart = {
  id: string
  clientId: string
  planId: string
  actionType: MonthlyPlanningMode | 'visual_direction'
  promptVersion: string
  provider: string
  model: string
  startedAt: string
  structuredToolName: string
}

export async function startMonthlyPlanningExecution(input: MonthlyPlanningExecutionStart) {
  const { error } = await clientBrainV2ServerClient.from('social_monthly_plan_ai_executions').insert({
    id: input.id,
    client_id: input.clientId,
    monthly_plan_id: input.planId,
    action_type: input.actionType,
    prompt_version: input.promptVersion,
    provider: input.provider,
    model: input.model,
    started_at: input.startedAt,
    structured_output_requested: true,
    structured_tool_name: input.structuredToolName,
    validation_stage: 'provider_request',
    execution_outcome: 'running',
  })
  if (error) throw new ClientBrainV2HttpError('Unable to start Planning AI diagnostics. No provider call was made.', 500)
}

export type MonthlyPlanningExecutionPatch = {
  completedAt?: string
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  cacheReadTokens?: number | null
  cacheWriteTokens?: number | null
  costUsdActual?: number | null
  finishReason?: string | null
  structuredToolInvoked?: boolean
  outputCharacterCount?: number | null
  outputByteCount?: number | null
  validationStage: MonthlyPlanningValidationStage
  validationErrors?: string[]
  failingSlot?: number | null
  failingField?: string | null
  failingValue?: string | null
  failingReference?: string | null
  executionOutcome: MonthlyPlanningExecutionOutcome
  sanitizedDebugPayload?: unknown
}

export async function updateMonthlyPlanningExecution(clientId: string, planId: string, executionId: string, patch: MonthlyPlanningExecutionPatch) {
  const safePayload = patch.sanitizedDebugPayload === undefined ? null : sanitizeMonthlyPlanningPayload(patch.sanitizedDebugPayload)
  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_plan_ai_executions')
    .update({
      completed_at: patch.completedAt ?? null,
      latency_ms: patch.latencyMs ?? null,
      input_tokens: patch.inputTokens ?? null,
      output_tokens: patch.outputTokens ?? null,
      cache_read_tokens: patch.cacheReadTokens ?? null,
      cache_write_tokens: patch.cacheWriteTokens ?? null,
      cost_usd_actual: patch.costUsdActual ?? null,
      finish_reason: patch.finishReason ?? null,
      structured_tool_invoked: patch.structuredToolInvoked ?? false,
      output_character_count: patch.outputCharacterCount ?? null,
      output_byte_count: patch.outputByteCount ?? safePayload?.byteCount ?? null,
      validation_stage: patch.validationStage,
      validation_errors: patch.validationErrors ?? [],
      failing_slot: patch.failingSlot ?? null,
      failing_field: patch.failingField ?? null,
      failing_value: patch.failingValue ?? null,
      failing_reference: patch.failingReference ?? null,
      execution_outcome: patch.executionOutcome,
      ...(safePayload ? { sanitized_debug_payload: safePayload.payload, debug_payload_truncated: safePayload.truncated } : {}),
    })
    .eq('id', executionId)
    .eq('client_id', clientId)
    .eq('monthly_plan_id', planId)
    .select('id')
    .maybeSingle()
  if (error || !data) throw new ClientBrainV2HttpError('Unable to save Planning AI execution diagnostics.', 500)
}

export async function listMonthlyPlanningExecutions(clientId: string, planId: string) {
  if (!isUuid(clientId) || !isUuid(planId)) throw new ClientBrainV2HttpError('Monthly Plan not found.', 404)
  await requireClientBrainV2(clientId)
  const { data: plan, error: planError } = await clientBrainV2ServerClient
    .from('social_monthly_content_plans')
    .select('id')
    .eq('id', planId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (planError) throw new ClientBrainV2HttpError('Unable to load the Monthly Plan.', 500)
  if (!plan) throw new ClientBrainV2HttpError('Monthly Plan not found.', 404)
  const { data, error } = await clientBrainV2ServerClient
    .from('social_monthly_plan_ai_executions')
    .select('*')
    .eq('client_id', clientId)
    .eq('monthly_plan_id', planId)
    .order('started_at', { ascending: false })
    .limit(50)
  if (error) throw new ClientBrainV2HttpError('Unable to load Planning AI execution diagnostics.', 500)
  return data ?? []
}
