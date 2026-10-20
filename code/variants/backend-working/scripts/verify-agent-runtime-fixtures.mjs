import assert from "node:assert/strict"
import { AGENT_RUN_STATUSES, AGENT_TRIGGER_TYPES, agentRunStatusLabel, safeAgentRecord } from "../src/lib/agent-runtime.ts"

assert.deepEqual(AGENT_TRIGGER_TYPES, ["manual", "scheduled", "event", "delegated"])
assert(AGENT_RUN_STATUSES.includes("waiting_for_approval"))
assert(AGENT_RUN_STATUSES.includes("recovery_required"))
assert.equal(agentRunStatusLabel("completed"), "Completed")
assert.deepEqual(safeAgentRecord({ source: "runtime" }), { source: "runtime" })
assert.deepEqual(safeAgentRecord(["must-not-be-context"]), {})
assert.deepEqual(safeAgentRecord(null), {})

const systemHealthPolicy = {
  allowedTriggers: ["manual"],
  allowedTools: ["supabase-read", "internal-report-write"],
  mutation: { read: true, internal_write: true, external_mutation: false },
  aiAllowed: false,
  maxCostUsd: 0,
  autoPromoteMemory: false,
}
assert.deepEqual(systemHealthPolicy.allowedTriggers, ["manual"])
assert.equal(systemHealthPolicy.allowedTools.includes("social-publish"), false)
assert.equal(systemHealthPolicy.mutation.external_mutation, false)
assert.equal(systemHealthPolicy.aiAllowed, false)
assert.equal(systemHealthPolicy.maxCostUsd, 0)
assert.equal(systemHealthPolicy.autoPromoteMemory, false)

console.log("Agent Runtime offline fixtures passed: lifecycle, scoped context guards, and deterministic System Health policy.")
