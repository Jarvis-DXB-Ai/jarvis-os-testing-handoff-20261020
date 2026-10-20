export const AGENT_RUN_STATUSES = [
  "queued",
  "observing",
  "running",
  "waiting_for_approval",
  "waiting_for_external",
  "recovery_required",
  "completed",
  "failed",
  "cancelled",
] as const

export const AGENT_RUN_STAGES = [
  "queued",
  "observe",
  "think",
  "act",
  "observe_result",
  "waiting_for_approval",
  "waiting_for_external",
  "recovery",
  "completed",
  "failed",
  "cancelled",
] as const

export const AGENT_TRIGGER_TYPES = ["manual", "scheduled", "event", "delegated"] as const
export const AGENT_APPROVAL_STATES = ["not_required", "pending", "approved", "rejected", "expired"] as const
export const AGENT_STEP_STAGES = ["observe", "think", "act", "observe_result", "approval", "recovery"] as const
export const AGENT_STEP_STATUSES = ["started", "completed", "waiting", "failed", "blocked", "skipped"] as const

export type AgentRunStatus = typeof AGENT_RUN_STATUSES[number]
export type AgentRunStage = typeof AGENT_RUN_STAGES[number]
export type AgentTriggerType = typeof AGENT_TRIGGER_TYPES[number]
export type AgentApprovalState = typeof AGENT_APPROVAL_STATES[number]
export type AgentStepStage = typeof AGENT_STEP_STAGES[number]
export type AgentStepStatus = typeof AGENT_STEP_STATUSES[number]

export type AgentRuntimeDefinition = {
  id: string
  agent_id: string
  agent_key: string
  display_name: string
  purpose: string
  definition_version: string
  operational_status: "active" | "paused" | "blocked" | "deprecated"
  allowed_triggers: AgentTriggerType[]
  allowed_tool_keys: string[]
  allowed_data_scopes: string[]
  client_scope_requirement: "none" | "optional" | "required"
  model_policy: Record<string, unknown>
  cost_policy: Record<string, unknown>
  mutation_policy: Record<string, unknown>
  approval_policy: Record<string, unknown>
  retry_policy: Record<string, unknown>
  output_contract: Record<string, unknown>
  memory_policy: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type AgentRun = {
  id: string
  agent_runtime_definition_id: string
  parent_run_id: string | null
  client_id: string | null
  trigger_type: AgentTriggerType
  trigger_reference: string | null
  idempotency_key: string
  resource_key: string
  goal: string
  status: AgentRunStatus
  current_stage: AgentRunStage
  approval_state: AgentApprovalState
  workflow_instance_id: string | null
  context_manifest: Record<string, unknown>
  decision_summary: Record<string, unknown>
  output_summary: Record<string, unknown>
  result_reference: Record<string, unknown>
  retry_state: Record<string, unknown>
  cost_limit_usd: number
  cost_actual_usd: number
  error_diagnostic: Record<string, unknown>
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export type AgentRunStep = {
  id: string
  agent_run_id: string
  sequence_no: number
  stage: AgentStepStage
  action_key: string
  status: AgentStepStatus
  evidence: Record<string, unknown>
  outcome: Record<string, unknown>
  diagnostic: string | null
  started_at: string
  finished_at: string | null
  created_at: string
}

export type AgentRunsSnapshot = {
  settings: { autonomous_execution_enabled: boolean; external_mutations_enabled: boolean; updated_at: string }
  definitions: AgentRuntimeDefinition[]
  runs: Array<AgentRun & { definition: Pick<AgentRuntimeDefinition, "agent_key" | "display_name" | "purpose"> | null; clientName: string | null; steps: AgentRunStep[]; modelCallCount: number }>
  generatedAt: string
}

export const agentRunStatusLabel = (value: AgentRunStatus) => ({
  queued: "Queued",
  observing: "Observing",
  running: "Running",
  waiting_for_approval: "Waiting for approval",
  waiting_for_external: "Waiting for external input",
  recovery_required: "Recovery required",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
})[value]

export function isAgentRunStatus(value: unknown): value is AgentRunStatus { return typeof value === "string" && AGENT_RUN_STATUSES.includes(value as AgentRunStatus) }
export function isAgentTriggerType(value: unknown): value is AgentTriggerType { return typeof value === "string" && AGENT_TRIGGER_TYPES.includes(value as AgentTriggerType) }
export function safeAgentRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
