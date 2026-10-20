import 'server-only'

import { randomUUID } from 'node:crypto'
import { humanConfirmedRestaurantAssetCategory } from '@/lib/client-brain-v2'
import { retrievePinterestInspirationTechniques } from '@/lib/client-brain-pinterest-inspiration-server'
import { ClientBrainV2HttpError, clientBrainV2ServerClient, isUuid, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'
import { executeTextRun, textExecutionProviderStatus } from '@/lib/executionEngine'
import { getMonthlyPlan } from '@/lib/social-monthly-content-plans'
import {
  diagnosticFromError,
  diagnosticMessage,
  monthlyPlanningDiagnosticError,
  startMonthlyPlanningExecution,
  updateMonthlyPlanningExecution,
} from '@/lib/social-monthly-planning-diagnostics'
import {
  MONTHLY_VISUAL_DIRECTION_PROMPT_VERSION,
  monthlyVisualDirectionSystemPrompt,
  monthlyVisualDirectionToolSchema,
  monthlyVisualDirectionUserPrompt,
  type MonthlyVisualDirectionModelOutput,
  type MonthlyVisualDirectionPromptInput,
} from '@/lib/social-monthly-visual-direction-prompt'
import {
  VISUAL_DIRECTION_CAMERA_ANGLES,
  VISUAL_DIRECTION_COMPOSITIONS,
  VISUAL_DIRECTION_HUMAN_PRESENCE,
  VISUAL_DIRECTION_INTERACTIONS,
  VISUAL_DIRECTION_MOTIONS,
  VISUAL_DIRECTION_SHOT_SCALES,
  type VisualDirectionFields,
} from '@/lib/social-monthly-visual-direction-types'
import { visualDirectionWarnings } from '@/lib/social-monthly-visual-direction-quality'

type Json = Record<string, unknown>
type RawPlanItem = Json & {
  id: string
  position: number
  updated_at: string
  required_assets: string[]
  visual_direction_source?: 'unassigned' | 'ai' | 'manual'
}
type RawAsset = { id: string; title: string; metadata: Json | null }

// Fifteen 25-45 word briefs plus the compact structured envelope fit comfortably
// beneath this bounded single-call allowance. A max-token response is still rejected.
export const VISUAL_DIRECTION_MAX_TOKENS = 3_800
const VISUAL_DIRECTION_MAX_INPUT_CHARS = 30_000

function isRecord(value: unknown): value is Json {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown, limit = 1_200) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function planAwarePinterestContext(items: RawPlanItem[]) {
  const pillar_counts: Record<string, number> = {}
  const subject_types = new Set<string>()
  const production_methods = new Set<string>()
  const grid_roles = new Set<string>()
  items.forEach(item => {
    const pillar = stringValue(item.pillar, 80).toLowerCase()
    if (pillar) pillar_counts[pillar] = (pillar_counts[pillar] ?? 0) + 1
    const subject = stringValue(item.subject, 240)
    if (subject) subject_types.add(subject)
    const production = stringValue(item.production_method, 80)
    if (production) production_methods.add(production)
    const role = stringValue(item.grid_role, 80)
    if (role) grid_roles.add(role)
  })
  return {
    pillar_counts,
    subject_types: [...subject_types].slice(0, 24),
    production_methods: [...production_methods].slice(0, 12),
    grid_roles: [...grid_roles].slice(0, 12),
  }
}

function recordData(metadata: Json | null) {
  const root = metadata ?? {}
  return isRecord(root.editor_data) ? root.editor_data : root
}

function model() {
  return process.env.MONTHLY_VISUAL_DIRECTION_MODEL || process.env.MONTHLY_PLANNING_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
}

function providerFields(result?: Awaited<ReturnType<typeof executeTextRun>>) {
  const raw = result?.rawResponse ?? ''
  const structured = result?.structuredOutput ? JSON.stringify(result.structuredOutput) : ''
  return {
    completedAt: new Date().toISOString(),
    latencyMs: result?.durationMs ?? null,
    inputTokens: result?.inputTokens ?? null,
    outputTokens: result?.outputTokens ?? null,
    cacheReadTokens: result?.cacheReadTokens ?? null,
    cacheWriteTokens: result?.cacheWriteTokens ?? null,
    costUsdActual: result?.actualCost ?? null,
    finishReason: result?.finishReason ?? null,
    structuredToolInvoked: Boolean(result?.structuredOutput),
    outputCharacterCount: raw.length || null,
    outputByteCount: raw ? Buffer.byteLength(raw, 'utf8') : null,
    structuredPayloadCharacterCount: structured.length || null,
    structuredPayloadByteCount: structured ? Buffer.byteLength(structured, 'utf8') : null,
  }
}

function parseStructuredOutput(result: Awaited<ReturnType<typeof executeTextRun>>) {
  if (result.structuredOutput) return result.structuredOutput as MonthlyVisualDirectionModelOutput
  if (!result.rawResponse) throw monthlyPlanningDiagnosticError('Visual Direction AI did not return structured output. Existing concepts were not changed.', { outcome: 'structured_output_missing', stage: 'tool_output_extracted', field: 'submit_monthly_visual_direction' })
  try {
    return JSON.parse(result.rawResponse) as MonthlyVisualDirectionModelOutput
  } catch {
    throw monthlyPlanningDiagnosticError('Visual Direction AI returned malformed structured output. Existing concepts were not changed.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'submit_monthly_visual_direction' })
  }
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, field: string) {
  if (typeof value !== 'string' || !values.includes(value)) throw monthlyPlanningDiagnosticError(`Visual Direction returned an invalid ${field}. Existing concepts were not changed.`, { outcome: 'enum_failed', stage: 'enum_validation', field, value: typeof value === 'string' ? value : null })
  return value as T[number]
}

export type VisualDirectionResult = Pick<VisualDirectionFields, 'shot_scale' | 'camera_angle' | 'composition' | 'human_presence' | 'interaction' | 'motion' | 'visual_direction'> & {
  plan_item_ref: string
  expected_updated_at: string
  production_aspect_ratio: '4:5'
  grid_crop_behavior: 'safe' | 'edge_aware'
  pinterest_inspiration_refs: string[]
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length
}

export function validateVisualDirectionOutput(output: MonthlyVisualDirectionModelOutput, items: RawPlanItem[], allowedPinterestReferenceIds: string[] = []): VisualDirectionResult[] {
  if (!Array.isArray(output?.directions) || output.directions.length !== items.length) {
    throw monthlyPlanningDiagnosticError(`Visual Direction must return exactly ${items.length} concept directions. Existing concepts were not changed.`, { outcome: 'count_failed', stage: 'item_count_validation', field: 'directions', value: Array.isArray(output?.directions) ? String(output.directions.length) : null })
  }
  const expected = new Map(items.map(item => [`P${String(item.position).padStart(2, '0')}`, item]))
  const seen = new Set<string>()
  return output.directions.map(direction => {
    const ref = stringValue(direction.ref, 8)
    const item = expected.get(ref)
    if (!item || seen.has(ref)) throw monthlyPlanningDiagnosticError('Visual Direction returned a duplicate or unknown plan item reference. Existing concepts were not changed.', { outcome: 'schema_failed', stage: 'schema_validation', field: 'plan_item_ref', value: ref || null })
    seen.add(ref)
    const visualDirection = stringValue(direction.direction, 420)
    const words = wordCount(visualDirection)
    if (words < 25 || words > 45) throw monthlyPlanningDiagnosticError('Visual Direction must be a concise 25-45 word production brief for every concept. Existing concepts were not changed.', { outcome: 'schema_failed', stage: 'schema_validation', slot: item.position, field: 'direction', value: visualDirection || null })
    const inspirationRefs = Array.isArray(direction.inspiration_refs)
      ? [...new Set(direction.inspiration_refs.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 3)
      : []
    if (inspirationRefs.some(referenceId => !allowedPinterestReferenceIds.includes(referenceId))) {
      throw monthlyPlanningDiagnosticError('Visual Direction referenced a Pinterest record outside the supplied palette. Existing concepts were not changed.', { outcome: 'reference_failed', stage: 'asset_reference_validation', slot: item.position, field: 'inspiration_refs' })
    }
    const composition = enumValue(direction.composition, VISUAL_DIRECTION_COMPOSITIONS, 'composition')
    return {
      plan_item_ref: ref,
      expected_updated_at: item.updated_at,
      shot_scale: enumValue(direction.scale, VISUAL_DIRECTION_SHOT_SCALES, 'scale'),
      camera_angle: enumValue(direction.angle, VISUAL_DIRECTION_CAMERA_ANGLES, 'angle'),
      composition,
      human_presence: enumValue(direction.people, VISUAL_DIRECTION_HUMAN_PRESENCE, 'people'),
      interaction: enumValue(direction.interaction, VISUAL_DIRECTION_INTERACTIONS, 'interaction'),
      motion: enumValue(direction.motion, VISUAL_DIRECTION_MOTIONS, 'motion'),
      visual_direction: visualDirection,
      production_aspect_ratio: '4:5',
      grid_crop_behavior: composition === 'edge_crop' || composition === 'immersive_crop' ? 'edge_aware' : 'safe',
      pinterest_inspiration_refs: inspirationRefs,
    }
  })
}

async function buildPromptInput(clientId: string, detail: Awaited<ReturnType<typeof getMonthlyPlan>>, correction: string): Promise<MonthlyVisualDirectionPromptInput> {
  const plan = detail.plan as Json
  const items = detail.items as RawPlanItem[]
  const assetIds = [...new Set(items.flatMap(item => Array.isArray(item.required_assets) ? item.required_assets : []))]
  const { data: assetRows, error } = assetIds.length
    ? await clientBrainV2ServerClient.from('client_brain_v2_records').select('id, title, metadata').eq('client_id', clientId).in('id', assetIds)
    : { data: [], error: null }
  if (error) throw new ClientBrainV2HttpError('Unable to load required client truth for Visual Direction.', 500)
  const assets = new Map<string, RawAsset>((assetRows ?? []).map(asset => [asset.id, asset as RawAsset]))
  const snapshot = isRecord(plan.client_brain_snapshot) ? plan.client_brain_snapshot : {}
  const intelligence = Array.isArray(snapshot.intelligence) ? snapshot.intelligence : []
  const visualDna = intelligence.flatMap(entry => isRecord(entry) && entry.subsection === 'visual_dna' ? [`${stringValue(entry.title, 160)}: ${stringValue(entry.summary, 420)}`] : []).filter(Boolean).slice(0, 10)
  const truthNotes = items.flatMap(item => item.required_assets.flatMap(assetId => {
    const asset = assets.get(assetId)
    if (!asset) return []
    const data = recordData(asset.metadata)
    const category = humanConfirmedRestaurantAssetCategory({ metadata: asset.metadata ?? {} })
    const perspective = stringValue(data.perspective_flexibility, 32)
    return [`${asset.title} (${category}${perspective ? `; ${perspective} perspective flexibility` : ''})`]
  })).filter(Boolean).slice(0, 18)
  const clientName = stringValue(isRecord(snapshot.client) ? snapshot.client.name : '', 160) || 'Client'
  const monthlyTerms = items.flatMap(item => [
    stringValue(item.pillar, 80),
    stringValue(item.subject, 240),
    stringValue(item.creative_concept, 700),
  ])
  const pinterestInspirations = await retrievePinterestInspirationTechniques(clientId, {
    contentPillars: items.map(item => stringValue(item.pillar, 80)),
    subjects: monthlyTerms,
    interactions: [],
    limit: 6,
    mode: 'monthly_palette',
    planContext: planAwarePinterestContext(items),
  })
  return {
    client: { id: clientId, name: clientName },
    plan: {
      month: String(plan.plan_month),
      strategy: isRecord(plan.strategy) ? plan.strategy : {},
      visual_direction: stringValue(plan.visual_direction, 500),
      visual_rhythm: stringValue(plan.grid_notes, 500),
    },
    items: items.map(item => ({
      plan_item_ref: `P${String(item.position).padStart(2, '0')}`,
      position: item.position,
      pillar: stringValue(item.pillar, 80),
      subject: stringValue(item.subject, 240),
      creative_concept: stringValue(item.creative_concept, 700),
      production_method: stringValue(item.production_method, 80),
      grid_role: stringValue(item.grid_role, 80),
      required_assets: item.required_assets.flatMap(assetId => {
        const asset = assets.get(assetId)
        if (!asset) return []
        const data = recordData(asset.metadata)
        return [{ name: asset.title, category: humanConfirmedRestaurantAssetCategory({ metadata: asset.metadata ?? {} }), perspective_flexibility: stringValue(data.perspective_flexibility, 32) || null }]
      }),
    })),
    brand_visual_dna: visualDna,
    truth_notes: truthNotes,
    pinterest_inspirations: pinterestInspirations.map(reference => ({
      id: reference.id,
      category: reference.creative_categories,
      shot_scale: reference.shot_scale,
      camera_angle: reference.camera_angle,
      composition: reference.composition,
      human_presence: reference.human_presence,
      interaction: reference.interaction,
      motion: reference.motion,
      lighting_style: reference.lighting_style,
      background_style: reference.background_style,
      creative_techniques: reference.creative_techniques,
      visual_summary: reference.visual_summary,
      best_for: reference.best_for,
    })),
    correction,
  }
}

export function monthlyVisualDirectionProviderStatus() {
  const selectedModel = model()
  return { provider: 'anthropic', model: selectedModel, configured: textExecutionProviderStatus({ provider: 'anthropic', model: selectedModel }).configured, prompt_version: MONTHLY_VISUAL_DIRECTION_PROMPT_VERSION, one_month_level_call: true }
}

export async function generateMonthlyVisualDirection(input: { clientId: string; planId: string; correction?: string }) {
  if (!isUuid(input.clientId) || !isUuid(input.planId)) throw new ClientBrainV2HttpError('Monthly Plan not found.', 404)
  await requireClientBrainV2(input.clientId)
  const correction = stringValue(input.correction, 1_200)
  const detail = await getMonthlyPlan(input.clientId, input.planId)
  const items = detail.items as RawPlanItem[]
  if (items.length !== Number((detail.plan as Json).target_feed_count) || !items.length) throw new ClientBrainV2HttpError('Visual Direction requires the complete saved Feed plan before generation.', 409)
  const provider = monthlyVisualDirectionProviderStatus()
  if (!provider.configured) throw new ClientBrainV2HttpError('Visual Direction AI is not currently available. Manual direction remains available.', 503)
  const executionId = randomUUID()
  const startedAt = new Date().toISOString()
  await startMonthlyPlanningExecution({ id: executionId, clientId: input.clientId, planId: input.planId, actionType: 'visual_direction', promptVersion: MONTHLY_VISUAL_DIRECTION_PROMPT_VERSION, provider: provider.provider, model: provider.model, startedAt, structuredToolName: 'submit_monthly_visual_direction' })
  let result: Awaited<ReturnType<typeof executeTextRun>> | undefined
  let diagnosticInput: Json | null = null
  try {
    const promptInput = await buildPromptInput(input.clientId, detail, correction)
    const prompt = monthlyVisualDirectionUserPrompt(promptInput)
    if (prompt.length > VISUAL_DIRECTION_MAX_INPUT_CHARS) throw new ClientBrainV2HttpError('Visual Direction context is too large for one bounded month-level call. Shorten saved monthly context and retry.', 422)
    diagnosticInput = {
      prompt_version: MONTHLY_VISUAL_DIRECTION_PROMPT_VERSION,
      output_contract: 'compact-v1',
      pinterest_palette: promptInput.pinterest_inspirations.map(reference => ({ id: reference.id, category: reference.category, shot_scale: reference.shot_scale, camera_angle: reference.camera_angle, composition: reference.composition, interaction: reference.interaction, motion: reference.motion, lighting_style: reference.lighting_style, best_for: reference.best_for })),
      prompt_character_count: prompt.length,
      planned_item_count: items.length,
    }
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, {
      validationStage: 'provider_request',
      executionOutcome: 'running',
      sanitizedDebugPayload: { request: diagnosticInput },
    })
    result = await executeTextRun({
      provider: 'anthropic', model: provider.model, maxTokens: VISUAL_DIRECTION_MAX_TOKENS, temperature: 0.2, timeoutMs: 90_000,
      system: monthlyVisualDirectionSystemPrompt(), prompt,
      structuredOutput: { name: 'submit_monthly_visual_direction', description: 'Returns one compact visual direction for every canonical monthly Feed concept.', schema: monthlyVisualDirectionToolSchema(promptInput) },
      route: '/api/clients/[id]/monthly-plans/[planId]/visual-direction', feature: 'monthly_visual_direction', clientId: input.clientId,
    })
    if (!result.ok) throw monthlyPlanningDiagnosticError('Visual Direction AI did not return a valid month. Existing concepts were not changed.', { outcome: 'provider_failed', stage: 'provider_response', field: 'provider_response', value: result.error ?? null })
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields(result), validationStage: 'provider_response', executionOutcome: 'provider_succeeded', sanitizedDebugPayload: { request: diagnosticInput, provider_structured_output: result.structuredOutput ?? { structured_output_available: false } } })
    if ((result.outputTokens ?? 0) >= VISUAL_DIRECTION_MAX_TOKENS - 128) throw monthlyPlanningDiagnosticError('Visual Direction reached the output limit and was not applied. Existing concepts were not changed.', { outcome: 'schema_failed', stage: 'tool_output_extracted', field: 'output_tokens', value: String(result.outputTokens ?? 0) })
    const output = parseStructuredOutput(result)
    const directions = validateVisualDirectionOutput(output, items, promptInput.pinterest_inspirations.map(reference => reference.id))
    const warnings = visualDirectionWarnings(directions)
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields(result), validationStage: 'schema_validation', executionOutcome: 'provider_succeeded', sanitizedDebugPayload: { request: diagnosticInput, output } })
    const isRegeneration = items.some(item => item.visual_direction_source === 'ai' || item.visual_direction_source === 'manual')
    const { error } = await clientBrainV2ServerClient.rpc('apply_social_monthly_plan_visual_direction', {
      p_client_id: input.clientId, p_plan_id: input.planId, p_execution_id: executionId,
      p_prompt_version: MONTHLY_VISUAL_DIRECTION_PROMPT_VERSION, p_items: directions,
      p_action_type: isRegeneration ? 'visual_direction_regenerated' : 'visual_direction_generated',
      p_summary: isRegeneration ? 'Regenerated month-level Visual Direction for all Feed concepts.' : 'Generated month-level Visual Direction for all Feed concepts.',
      p_correction: correction,
    })
    if (error) throw monthlyPlanningDiagnosticError(error.message || 'Unable to apply Visual Direction.', { outcome: 'atomic_apply_failed', stage: 'atomic_apply', field: 'apply_social_monthly_plan_visual_direction' }, 500)
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields(result), validationStage: 'succeeded', executionOutcome: 'succeeded', sanitizedDebugPayload: { request: diagnosticInput, output } })
    return { provider, directions, warnings, execution: { id: executionId, provider: provider.provider, model: provider.model, prompt_version: MONTHLY_VISUAL_DIRECTION_PROMPT_VERSION, actual_cost_usd: result.actualCost ?? null } }
  } catch (error) {
    const issue = diagnosticFromError(error)
    await updateMonthlyPlanningExecution(input.clientId, input.planId, executionId, { ...providerFields(result), validationStage: issue.stage, validationErrors: [diagnosticMessage(error)], failingSlot: issue.slot ?? null, failingField: issue.field ?? null, failingValue: issue.value ?? null, failingReference: issue.outcome === 'reference_failed' ? issue.value ?? null : null, executionOutcome: issue.outcome, sanitizedDebugPayload: { request: diagnosticInput, output: result?.structuredOutput ?? { structured_output_available: false } } })
    throw error
  }
}
