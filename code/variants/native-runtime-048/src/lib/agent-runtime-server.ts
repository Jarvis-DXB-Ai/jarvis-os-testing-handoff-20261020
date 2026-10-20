import "server-only"

import { clientBrainV2ServerClient as db, isUuid } from "@/lib/client-brain-v2-server-core"
import {
  AGENT_STEP_STAGES,
  AGENT_STEP_STATUSES,
  AGENT_TRIGGER_TYPES,
  safeAgentRecord,
  type AgentApprovalState,
  type AgentRun,
  type AgentRunStep,
  type AgentRunsSnapshot,
  type AgentRuntimeDefinition,
  type AgentStepStage,
  type AgentStepStatus,
  type AgentTriggerType,
} from "@/lib/agent-runtime"
import { loadSocialIntelligenceRuntimeContext, persistSocialIntelligenceArtifact } from "@/lib/social-intelligence-runtime-server"

const definitionColumns = "id,agent_id,agent_key,display_name,purpose,definition_version,operational_status,allowed_triggers,allowed_tool_keys,allowed_data_scopes,client_scope_requirement,model_policy,cost_policy,mutation_policy,approval_policy,retry_policy,output_contract,memory_policy,created_at,updated_at"
const runColumns = "id,agent_runtime_definition_id,parent_run_id,client_id,trigger_type,trigger_reference,idempotency_key,resource_key,goal,status,current_stage,approval_state,workflow_instance_id,context_manifest,decision_summary,output_summary,result_reference,retry_state,cost_limit_usd,cost_actual_usd,error_diagnostic,started_at,finished_at,created_at,updated_at"
const stepColumns = "id,agent_run_id,sequence_no,stage,action_key,status,evidence,outcome,diagnostic,started_at,finished_at,created_at"

export class AgentRuntimeError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

type Settings = { autonomous_execution_enabled: boolean; external_mutations_enabled: boolean; updated_at: string }
type CreateRunInput = { agentKey: string; goal?: string; triggerType?: AgentTriggerType; triggerReference?: string | null; idempotencyKey?: string; resourceKey?: string; clientId?: string | null; parentRunId?: string | null }
type StepInput = { stage: AgentStepStage; actionKey: string; status: AgentStepStatus; evidence?: Record<string, unknown>; outcome?: Record<string, unknown>; diagnostic?: string | null }

function asDefinition(value: unknown): AgentRuntimeDefinition { return value as AgentRuntimeDefinition }
function asRun(value: unknown): AgentRun { return value as AgentRun }
function asStep(value: unknown): AgentRunStep { return { ...(value as AgentRunStep), evidence: safeAgentRecord((value as AgentRunStep).evidence), outcome: safeAgentRecord((value as AgentRunStep).outcome) } }
function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }
function enabled(value: Record<string, unknown>, key: string) { return value[key] === true }
function positiveNumber(value: unknown, fallback = 0) { const number = typeof value === "number" ? value : Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback }
function retryState(definition: AgentRuntimeDefinition) { return { attempt: 0, max_attempts: Math.max(1, Math.floor(positiveNumber(definition.retry_policy.max_attempts, 1))) } }
function requiresApproval(definition: AgentRuntimeDefinition) { return enabled(definition.approval_policy, "required_before_act") }
function permitsExternalMutation(definition: AgentRuntimeDefinition) { return enabled(definition.mutation_policy, "external_mutation") }

async function settings(): Promise<Settings> {
  const result = await db.from("agent_runtime_settings").select("autonomous_execution_enabled,external_mutations_enabled,updated_at").eq("singleton", true).maybeSingle()
  if (result.error || !result.data) throw new AgentRuntimeError("Agent Runtime safety settings are unavailable.", 503)
  return result.data as Settings
}

async function definitionByKey(agentKey: string) {
  const result = await db.from("agent_runtime_definitions").select(definitionColumns).eq("agent_key", agentKey).maybeSingle()
  if (result.error) throw new AgentRuntimeError("Agent definition could not be loaded.", 500)
  if (!result.data) throw new AgentRuntimeError("Agent definition was not found.", 404)
  return asDefinition(result.data)
}

async function runById(runId: string) {
  if (!isUuid(runId)) throw new AgentRuntimeError("Agent run ID is invalid.")
  const result = await db.from("agent_runs").select(runColumns).eq("id", runId).maybeSingle()
  if (result.error) throw new AgentRuntimeError("Agent run could not be loaded.", 500)
  if (!result.data) throw new AgentRuntimeError("Agent run was not found.", 404)
  return asRun(result.data)
}

async function appendStep(runId: string, input: StepInput) {
  if (!AGENT_STEP_STAGES.includes(input.stage) || !AGENT_STEP_STATUSES.includes(input.status)) throw new AgentRuntimeError("Agent run step is invalid.", 500)
  const existing = await db.from("agent_run_steps").select(stepColumns).eq("agent_run_id", runId).eq("action_key", input.actionKey).order("sequence_no", { ascending: true }).limit(1).maybeSingle()
  if (existing.error) throw new AgentRuntimeError("Agent run step could not be inspected.", 500)
  if (existing.data && ["completed", "waiting", "blocked", "skipped"].includes(existing.data.status)) return asStep(existing.data)
  if (existing.data) {
    const updated = await db.from("agent_run_steps").update({
      stage: input.stage,
      status: input.status,
      evidence: input.evidence ?? {},
      outcome: input.outcome ?? {},
      diagnostic: input.diagnostic ?? null,
      finished_at: ["completed", "failed", "blocked", "skipped"].includes(input.status) ? new Date().toISOString() : null,
    }).eq("id", existing.data.id).select(stepColumns).single()
    if (updated.error || !updated.data) throw new AgentRuntimeError("Agent run step could not be updated.", 500)
    return asStep(updated.data)
  }
  const all = await db.from("agent_run_steps").select("sequence_no").eq("agent_run_id", runId).order("sequence_no", { ascending: false }).limit(1).maybeSingle()
  if (all.error) throw new AgentRuntimeError("Agent run step sequence could not be loaded.", 500)
  const sequenceNo = Number(all.data?.sequence_no ?? 0) + 1
  const insert = await db.from("agent_run_steps").insert({
    agent_run_id: runId,
    sequence_no: sequenceNo,
    stage: input.stage,
    action_key: input.actionKey,
    status: input.status,
    evidence: input.evidence ?? {},
    outcome: input.outcome ?? {},
    diagnostic: input.diagnostic ?? null,
    finished_at: ["completed", "failed", "blocked", "skipped"].includes(input.status) ? new Date().toISOString() : null,
  }).select(stepColumns).single()
  if (insert.error || !insert.data) throw new AgentRuntimeError("Agent run step could not be persisted.", 500)
  return asStep(insert.data)
}

async function updateRun(runId: string, patch: Record<string, unknown>) {
  const result = await db.from("agent_runs").update(patch).eq("id", runId).select(runColumns).single()
  if (result.error || !result.data) throw new AgentRuntimeError("Agent run could not be updated.", 500)
  return asRun(result.data)
}

export async function createAgentRun(input: CreateRunInput) {
  const agentKey = text(input.agentKey)
  if (!agentKey) throw new AgentRuntimeError("Agent key is required.")
  const triggerType = input.triggerType ?? "manual"
  if (!AGENT_TRIGGER_TYPES.includes(triggerType)) throw new AgentRuntimeError("Agent trigger is invalid.")
  const definition = await definitionByKey(agentKey)
  const runtimeSettings = await settings()
  if (definition.operational_status !== "active") throw new AgentRuntimeError("This Agent is not active.", 409)
  if (!definition.allowed_triggers.includes(triggerType)) throw new AgentRuntimeError("This Agent does not permit that trigger.", 403)
  if (triggerType !== "manual" && !runtimeSettings.autonomous_execution_enabled) throw new AgentRuntimeError("Autonomous Agent execution is globally disabled.", 423)
  if (permitsExternalMutation(definition) && !runtimeSettings.external_mutations_enabled) throw new AgentRuntimeError("External Agent mutations are globally disabled.", 423)

  const clientId = input.clientId ?? null
  if (definition.client_scope_requirement === "required" && !clientId) throw new AgentRuntimeError("This Agent requires a client scope.")
  if (definition.client_scope_requirement === "none" && clientId) throw new AgentRuntimeError("This Agent does not accept a client scope.")
  if (clientId && !isUuid(clientId)) throw new AgentRuntimeError("Client scope is invalid.")
  if (input.parentRunId && !isUuid(input.parentRunId)) throw new AgentRuntimeError("Parent run is invalid.")

  const idempotencyKey = text(input.idempotencyKey) || crypto.randomUUID()
  const resourceKey = text(input.resourceKey) || `${agentKey}:${clientId ?? "system"}`
  const goal = text(input.goal) || `Run ${definition.display_name} safely.`
  const approvalState: AgentApprovalState = requiresApproval(definition) ? "pending" : "not_required"
  const created = await db.from("agent_runs").insert({
    agent_runtime_definition_id: definition.id,
    parent_run_id: input.parentRunId ?? null,
    client_id: clientId,
    trigger_type: triggerType,
    trigger_reference: input.triggerReference ?? null,
    idempotency_key: idempotencyKey,
    resource_key: resourceKey,
    goal,
    approval_state: approvalState,
    cost_limit_usd: positiveNumber(definition.cost_policy.max_run_cost_usd, 0),
    retry_state: retryState(definition),
  }).select(runColumns).single()
  if (!created.error && created.data) return { run: asRun(created.data), reused: false }

  if (created.error?.code === "23505") {
    const duplicate = await db.from("agent_runs").select(runColumns).eq("agent_runtime_definition_id", definition.id).eq("idempotency_key", idempotencyKey).maybeSingle()
    if (duplicate.data) return { run: asRun(duplicate.data), reused: true }
    throw new AgentRuntimeError("A conflicting active Agent run already owns this resource.", 409)
  }
  throw new AgentRuntimeError(created.error?.message ?? "Agent run could not be created.", 500)
}

/** Creates a stable, client- and cached-data-scoped intelligence run. */
export async function createSocialIntelligenceRun(clientId: string) {
  const context = await loadSocialIntelligenceRuntimeContext(clientId)
  const period = context.artifact.period_start && context.artifact.period_end ? `${context.artifact.period_start}:${context.artifact.period_end}` : "no-period"
  const created = await createAgentRun({
    agentKey: "social-intelligence",
    clientId,
    idempotencyKey: `social-intelligence:${clientId}:${context.dataRevision}`,
    resourceKey: `social-intelligence:${clientId}:${period}:${context.dataRevision.slice(0, 16)}`,
    triggerType: "manual",
    triggerReference: `cached-social:${context.dataRevision}`,
    goal: `Analyse retained Social performance for ${context.client.name} and write one evidence-backed internal recommendation artifact.`,
  })
  return { ...created, context }
}

export async function attachWorkflowInstance(runId: string, workflowInstanceId: string) {
  if (!workflowInstanceId || workflowInstanceId !== runId) throw new AgentRuntimeError("Workflow instance identity is invalid.")
  const run = await runById(runId)
  if (run.workflow_instance_id && run.workflow_instance_id !== workflowInstanceId) throw new AgentRuntimeError("Agent run is already attached to another Workflow.", 409)
  if (run.workflow_instance_id === workflowInstanceId) return run
  return updateRun(runId, { workflow_instance_id: workflowInstanceId })
}

export async function prepareAgentRun(runId: string) {
  const run = await runById(runId)
  const definitionLookup = await db.from("agent_runtime_definitions").select(definitionColumns).eq("id", run.agent_runtime_definition_id).single()
  if (definitionLookup.error || !definitionLookup.data) throw new AgentRuntimeError("Agent definition could not be resolved.", 500)
  const definition = asDefinition(definitionLookup.data)
  if (["completed", "failed", "cancelled"].includes(run.status)) return { run, waitForApproval: false, terminal: true }
  const runtimeSettings = await settings()
  if (run.trigger_type !== "manual" && !runtimeSettings.autonomous_execution_enabled) {
    const blocked = await updateRun(runId, { status: "recovery_required", current_stage: "recovery", error_diagnostic: { code: "AUTONOMOUS_EXECUTION_DISABLED" } })
    await appendStep(runId, { stage: "recovery", actionKey: "global-safety-check", status: "blocked", diagnostic: "Autonomous Agent execution is globally disabled." })
    return { run: blocked, waitForApproval: false, terminal: true }
  }
  if (permitsExternalMutation(definition) && !runtimeSettings.external_mutations_enabled) {
    const blocked = await updateRun(runId, { status: "recovery_required", current_stage: "recovery", error_diagnostic: { code: "EXTERNAL_MUTATIONS_DISABLED" } })
    await appendStep(runId, { stage: "recovery", actionKey: "external-mutation-safety-check", status: "blocked", diagnostic: "External Agent mutations are globally disabled." })
    return { run: blocked, waitForApproval: false, terminal: true }
  }
  const contextManifest: Record<string, unknown> = {
    definition: { agent_key: definition.agent_key, definition_version: definition.definition_version, allowed_data_scopes: definition.allowed_data_scopes, allowed_tool_keys: definition.allowed_tool_keys },
    client_id: run.client_id,
    provenance: ["agent_runtime_definitions", "agent_runtime_definition_skills", "agent_runtime_settings"],
    captured_at: new Date().toISOString(),
  }
  if (definition.agent_key === "social-intelligence" && run.client_id) {
    const context = await loadSocialIntelligenceRuntimeContext(run.client_id)
    contextManifest.social_intelligence = {
      client: context.client,
      data_revision: context.dataRevision,
      period: { start: context.artifact.period_start, end: context.artifact.period_end },
      approved_client_brain_records: context.approvedClientContext.map(record => ({ id: record.id, top_section: record.top_section, subsection: record.subsection, title: record.title, updated_at: record.updated_at })),
      source_manifest: context.artifact.source_manifest,
      model_calls_permitted: false,
      provider_calls_permitted: false,
    }
  }
  if (requiresApproval(definition) && run.approval_state !== "approved") {
    await db.from("agent_run_approvals").upsert({ agent_run_id: runId, status: "pending", proposed_action: { agent_key: definition.agent_key, goal: run.goal }, evidence: contextManifest }, { onConflict: "agent_run_id" })
    const waiting = await updateRun(runId, { status: "waiting_for_approval", current_stage: "waiting_for_approval", approval_state: "pending", context_manifest: contextManifest, started_at: run.started_at ?? new Date().toISOString() })
    await appendStep(runId, { stage: "approval", actionKey: "await-human-approval", status: "waiting", evidence: contextManifest })
    return { run: waiting, waitForApproval: true, terminal: false }
  }
  const prepared = await updateRun(runId, { status: "observing", current_stage: "observe", context_manifest: contextManifest, started_at: run.started_at ?? new Date().toISOString() })
  return { run: prepared, waitForApproval: false, terminal: false }
}

async function systemHealthObservation() {
  const [runtime, providers, failedProviderExecutions, failedLegacyExecutions, financeTransactions] = await Promise.all([
    db.from("agent_runtime_settings").select("singleton", { count: "exact", head: true }),
    db.from("social_provider_connections").select("id", { count: "exact", head: true }),
    db.from("social_provider_executions").select("id", { count: "exact", head: true }).in("status", ["failed", "recovery_required"]),
    db.from("execution_runs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("jarvis_finance_bank_transactions").select("id", { count: "exact", head: true }),
  ])
  const failures = [runtime, providers, failedProviderExecutions, failedLegacyExecutions, financeTransactions].filter(result => result.error)
  if (failures.length) throw new AgentRuntimeError("A required health observation could not be read.", 503)
  return {
    database: { reachable: true, source: "agent_runtime_settings" },
    provider_connection_cache: { configured_connections: providers.count ?? 0, source: "social_provider_connections" },
    execution_ledgers: { provider_recovery_or_failed: failedProviderExecutions.count ?? 0, legacy_failed: failedLegacyExecutions.count ?? 0, source: ["social_provider_executions", "execution_runs"] },
    finance_review_surface: { bank_transactions_available: financeTransactions.count ?? 0, source: "jarvis_finance_bank_transactions", note: "No Finance truth was changed." },
  }
}

async function executeSocialIntelligenceAgent(run: AgentRun, definition: AgentRuntimeDefinition) {
  if (!run.client_id) throw new AgentRuntimeError("Social Intelligence Agent requires a client scope.", 400)
  const context = await loadSocialIntelligenceRuntimeContext(run.client_id)
  const observation = {
    client: context.client,
    data_revision: context.dataRevision,
    period: { start: context.artifact.period_start, end: context.artifact.period_end },
    source_manifest: context.artifact.source_manifest,
    approved_client_brain_context: context.approvedClientContext.map(record => ({ id: record.id, top_section: record.top_section, subsection: record.subsection, title: record.title })),
    provider_calls: 0,
    model_calls: 0,
  }
  await appendStep(run.id, { stage: "observe", actionKey: "load-client-scoped-social-evidence", status: "completed", evidence: observation, outcome: { loaded: true } })
  const decision = { action: "persist_social_intelligence_artifact", reason: "The definition permits deterministic cached Social analysis and an internal recommendation artifact only.", model_used: false, external_mutation: false, client_brain_mutation: false }
  await updateRun(run.id, { current_stage: "think", decision_summary: decision })
  await appendStep(run.id, { stage: "think", actionKey: "calculate-evidence-backed-recommendations", status: "completed", evidence: { evidence_count: context.artifact.evidence.length, confidence_rule: "sample size and deterministic method attached to each signal", policy: definition.model_policy }, outcome: decision })

  const persisted = await persistSocialIntelligenceArtifact({ clientId: run.client_id, agentRunId: run.id, context })
  const report = {
    report_type: "social_intelligence",
    artifact_id: persisted.artifact.id,
    data_revision: persisted.artifact.data_revision,
    period: { start: persisted.artifact.period_start, end: persisted.artifact.period_end },
    deterministic: true,
    model_calls: 0,
    provider_calls: 0,
    evidence_count: context.artifact.evidence.length,
    recommendation_count: context.artifact.recommended_next_moves.length,
    experiment_count: context.artifact.experiments.length,
    status: persisted.reused ? "reused_existing_evidence_artifact" : "completed",
    executive_summary: persisted.artifact.executive_summary,
    working: persisted.artifact.working,
    needs_attention: persisted.artifact.needs_attention,
    recommended_next_moves: persisted.artifact.recommended_next_moves,
    experiments: persisted.artifact.experiments,
    data_gaps: persisted.artifact.data_gaps,
  }
  await updateRun(run.id, { current_stage: "act", output_summary: report, result_reference: { storage: "social_intelligence_artifacts", artifact_id: persisted.artifact.id, data_revision: persisted.artifact.data_revision }, cost_actual_usd: 0 })
  await appendStep(run.id, { stage: "act", actionKey: "persist-internal-social-intelligence-artifact", status: "completed", evidence: { permitted_internal_write: true, data_revision: context.dataRevision }, outcome: { persisted: true, artifact_id: persisted.artifact.id, reused: persisted.reused } })

  const observedResult = await runById(run.id)
  const complete = await updateRun(run.id, { status: "completed", current_stage: "completed", finished_at: new Date().toISOString() })
  await appendStep(run.id, { stage: "observe_result", actionKey: "verify-social-intelligence-artifact", status: "completed", evidence: { output_present: Object.keys(observedResult.output_summary).length > 0, cost_actual_usd: Number(observedResult.cost_actual_usd), provider_calls: 0, model_calls: 0 }, outcome: { completed: true, artifact_id: persisted.artifact.id } })
  return { run: complete, report }
}

export async function executePreparedAgentRun(runId: string) {
  let run = await runById(runId)
  if (run.status === "completed") return { run, idempotent: true }
  if (run.status === "waiting_for_approval" && run.approval_state !== "approved") return { run, waiting: true }
  if (["failed", "cancelled", "recovery_required"].includes(run.status)) return { run, terminal: true }
  const definitionLookup = await db.from("agent_runtime_definitions").select(definitionColumns).eq("id", run.agent_runtime_definition_id).single()
  if (definitionLookup.error || !definitionLookup.data) throw new AgentRuntimeError("Agent definition could not be resolved.", 500)
  const definition = asDefinition(definitionLookup.data)
  if (definition.agent_key === "social-intelligence") return executeSocialIntelligenceAgent(run, definition)
  if (definition.agent_key !== "system-health") throw new AgentRuntimeError("No runtime executor is registered for this Agent definition.", 501)

  run = await updateRun(runId, { status: "running", current_stage: "observe" })
  const observation = await systemHealthObservation()
  await appendStep(runId, { stage: "observe", actionKey: "load-scoped-health-context", status: "completed", evidence: observation, outcome: { loaded: true } })
  const decision = { action: "persist_internal_health_report", reason: "The definition permits deterministic reads and one internal report write only.", model_used: false, external_mutation: false }
  await updateRun(runId, { current_stage: "think", decision_summary: decision })
  await appendStep(runId, { stage: "think", actionKey: "determine-permitted-action", status: "completed", evidence: { policy: definition.mutation_policy, cost_policy: definition.cost_policy }, outcome: decision })

  const report = { report_type: "system_health", generated_at: new Date().toISOString(), observation, status: "healthy", caveats: ["Provider records are cached state; this proof agent makes no provider calls.", "Finance values are read-only availability signals, not reconciliation decisions."] }
  await updateRun(runId, { current_stage: "act", output_summary: report, result_reference: { storage: "agent_runs.output_summary" }, cost_actual_usd: 0 })
  await appendStep(runId, { stage: "act", actionKey: "persist-internal-health-report", status: "completed", evidence: { permitted_internal_write: true }, outcome: { persisted: true, report_type: report.report_type } })

  const observedResult = await runById(runId)
  const complete = await updateRun(runId, { status: "completed", current_stage: "completed", finished_at: new Date().toISOString() })
  await appendStep(runId, { stage: "observe_result", actionKey: "verify-persisted-health-report", status: "completed", evidence: { output_present: Object.keys(observedResult.output_summary).length > 0, cost_actual_usd: Number(observedResult.cost_actual_usd) }, outcome: { completed: true } })
  return { run: complete, report }
}

export async function decideAgentRunApproval(runId: string, approved: boolean, decisionNote?: string) {
  const run = await runById(runId)
  if (run.approval_state !== "pending") throw new AgentRuntimeError("This Agent run is not awaiting approval.", 409)
  const status = approved ? "approved" : "rejected"
  const approval = await db.from("agent_run_approvals").update({ status, decided_at: new Date().toISOString(), decision_note: text(decisionNote) || null }).eq("agent_run_id", runId).eq("status", "pending").select("id").maybeSingle()
  if (approval.error || !approval.data) throw new AgentRuntimeError("This approval was already decided elsewhere.", 409)
  if (!approved) {
    await appendStep(runId, { stage: "approval", actionKey: "human-approval-decision", status: "blocked", outcome: { approved: false }, diagnostic: text(decisionNote) || "Rejected by human reviewer." })
    return updateRun(runId, { approval_state: "rejected", status: "cancelled", current_stage: "cancelled", finished_at: new Date().toISOString() })
  }
  await appendStep(runId, { stage: "approval", actionKey: "human-approval-decision", status: "completed", outcome: { approved: true } })
  return updateRun(runId, { approval_state: "approved", status: "waiting_for_external", current_stage: "waiting_for_external" })
}

export async function loadAgentRunsSnapshot(): Promise<AgentRunsSnapshot> {
  const [runtimeSettings, definitionsResult, runsResult, stepsResult, callsResult] = await Promise.all([
    settings(),
    db.from("agent_runtime_definitions").select(definitionColumns).order("display_name"),
    db.from("agent_runs").select(runColumns).order("created_at", { ascending: false }).limit(100),
    db.from("agent_run_steps").select(stepColumns).order("sequence_no", { ascending: true }).limit(500),
    db.from("agent_run_model_calls").select("agent_run_id").limit(500),
  ])
  if (definitionsResult.error || runsResult.error || stepsResult.error || callsResult.error) throw new AgentRuntimeError("Agent Runs could not be loaded.", 500)
  const definitions = (definitionsResult.data ?? []).map(asDefinition)
  const definitionById = new Map(definitions.map(item => [item.id, item]))
  const clientIds = [...new Set((runsResult.data ?? []).map(run => typeof run.client_id === "string" ? run.client_id : null).filter((value): value is string => Boolean(value)))]
  const clientsResult = clientIds.length ? await db.from("clients").select("id,name").in("id", clientIds) : { data: [], error: null }
  if (clientsResult.error) throw new AgentRuntimeError("Agent Run client context could not be loaded.", 500)
  const clientNameById = new Map((clientsResult.data ?? []).map(client => [client.id, client.name]))
  const stepsByRun = new Map<string, AgentRunStep[]>()
  for (const step of stepsResult.data ?? []) stepsByRun.set(step.agent_run_id, [...(stepsByRun.get(step.agent_run_id) ?? []), asStep(step)])
  const callsByRun = new Map<string, number>()
  for (const call of callsResult.data ?? []) callsByRun.set(call.agent_run_id, (callsByRun.get(call.agent_run_id) ?? 0) + 1)
  const runs = (runsResult.data ?? []).map(asRun).map(run => {
    const definition = definitionById.get(run.agent_runtime_definition_id)
    return { ...run, definition: definition ? { agent_key: definition.agent_key, display_name: definition.display_name, purpose: definition.purpose } : null, clientName: run.client_id ? clientNameById.get(run.client_id) ?? null : null, steps: stepsByRun.get(run.id) ?? [], modelCallCount: callsByRun.get(run.id) ?? 0 }
  })
  return { settings: runtimeSettings, definitions, runs, generatedAt: new Date().toISOString() }
}

export function agentRuntimeErrorResponse(error: unknown) {
  const known = error instanceof AgentRuntimeError ? error : new AgentRuntimeError("Agent Runtime request failed.", 500)
  if (known !== error && error && typeof error === "object") {
    const candidate = error as { message?: unknown; status?: unknown }
    if (typeof candidate.message === "string" && typeof candidate.status === "number" && Number.isInteger(candidate.status) && candidate.status >= 400 && candidate.status < 600) {
      return { message: candidate.message, status: candidate.status }
    }
  }
  return { message: known.message, status: known.status }
}
