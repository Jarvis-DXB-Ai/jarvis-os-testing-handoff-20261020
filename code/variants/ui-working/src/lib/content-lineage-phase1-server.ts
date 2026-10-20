import "server-only";

import {
  ClientBrainV2HttpError,
  clientBrainV2ServerClient as db,
  isUuid,
} from "@/lib/client-brain-v2-server-core";

type Row = Record<string, unknown>;

export type ApprovedMonthlyPlanLineageSync = {
  operatingCycleId: string;
  cyclesCreated: number;
  lineageCreated: number;
  lineageExisting: number;
};

export type MonthlyPlanApprovalWithLineage = {
  plan: Row;
  lineageSync: ApprovedMonthlyPlanLineageSync;
};

function asRecord(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requireScope(clientId: string, planId: string) {
  if (!isUuid(clientId) || !isUuid(planId)) {
    throw new ClientBrainV2HttpError("Monthly Plan was not found for this client.", 404);
  }
}

function rpcError(error: { message?: string; code?: string }) {
  const message = error.message || "Unable to synchronize Monthly Plan lineage.";
  if (error.code === "PT404") return new ClientBrainV2HttpError(message, 404);
  if (error.code === "PT409") return new ClientBrainV2HttpError(message, 409);
  if (error.code === "PT400") return new ClientBrainV2HttpError(message, 400);
  return new ClientBrainV2HttpError("Unable to synchronize Monthly Plan lineage.", 500);
}

function parseSync(value: unknown): ApprovedMonthlyPlanLineageSync {
  const row = Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
  const operatingCycleId = text(row.operating_cycle_id);
  if (!operatingCycleId) throw new ClientBrainV2HttpError("Monthly Plan lineage synchronization returned an invalid result.", 500);
  return {
    operatingCycleId,
    cyclesCreated: count(row.cycles_created),
    lineageCreated: count(row.lineage_created),
    lineageExisting: count(row.lineage_existing),
  };
}

/** Server-only recovery for an exact, already-approved plan. It never updates existing lineage. */
export async function reconcileApprovedMonthlyPlanLineage(input: {
  clientId: string;
  planId: string;
}): Promise<ApprovedMonthlyPlanLineageSync> {
  requireScope(input.clientId, input.planId);
  const { data, error } = await db.rpc("sync_approved_monthly_plan_lineage", {
    p_client_id: input.clientId,
    p_monthly_plan_id: input.planId,
  });
  if (error) throw rpcError(error);
  return parseSync(data);
}

/**
 * Planner's approval transaction. The PostgreSQL RPC changes approval state and
 * synchronizes lineage together, so neither successful response can claim an
 * approved plan without its deterministic Phase 1 records.
 */
export async function approveMonthlyPlanWithLineage(input: {
  clientId: string;
  planId: string;
  expectedUpdatedAt: string;
}): Promise<MonthlyPlanApprovalWithLineage> {
  requireScope(input.clientId, input.planId);
  const { data, error } = await db.rpc("approve_monthly_plan_and_sync_lineage", {
    p_client_id: input.clientId,
    p_monthly_plan_id: input.planId,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw rpcError(error);
  const payload = asRecord(data);
  const plan = asRecord(payload.plan);
  if (!text(plan.id) || !text(plan.client_id)) {
    throw new ClientBrainV2HttpError("Monthly Plan approval returned an invalid result.", 500);
  }
  return { plan, lineageSync: parseSync(payload.lineage_sync) };
}
