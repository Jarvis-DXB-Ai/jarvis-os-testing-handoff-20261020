import "server-only";

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core";

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export type SelectedOperatingCycle = {
  id: string;
  clientId: string;
  cycleKey: string;
  source: "approved_current_plan" | "existing_cycle";
} | null;

/** Resolves a shared client cycle without promoting an unapproved future plan. */
export async function resolveSelectedOperatingCycle(clientId: string): Promise<SelectedOperatingCycle> {
  const [{ data: plans, error: planError }, { data: cycles, error: cycleError }] = await Promise.all([
    db.from("social_monthly_content_plans").select("plan_month,status,is_current").eq("client_id", clientId).eq("is_current", true).eq("status", "approved").order("plan_month", { ascending: false }).limit(1),
    db.from("client_operating_cycles").select("id,client_id,cycle_key").eq("client_id", clientId).order("cycle_key", { ascending: false }),
  ]);
  if (planError || cycleError) throw new Error("Unable to resolve the selected operating cycle.");
  const approvedKey = text((plans?.[0] as Row | undefined)?.plan_month).slice(0, 7);
  const selected = ((cycles ?? []) as Row[]).find((row) => text(row.cycle_key) === approvedKey) ?? (cycles?.[0] as Row | undefined);
  if (!selected) return null;
  return { id: text(selected.id), clientId: text(selected.client_id), cycleKey: text(selected.cycle_key), source: approvedKey && text(selected.cycle_key) === approvedKey ? "approved_current_plan" : "existing_cycle" };
}

export type ContentLineageReadModel = {
  byPlanItemId: Map<string, ContentLineageState>;
  bySocialContentItemId: Map<string, ContentLineageState>;
};

export type ContentLineageState = {
  id: string;
  cycleKey: string;
  hasMedia: boolean;
  hasCaption: boolean;
  hasPublishingDraft: boolean;
  reviewStatus: "none" | "ready" | "approved" | "stale" | "superseded";
  publishingHandoff: "none" | "linked" | "stale" | "superseded";
  executionState: "none" | "prepared" | "scheduled" | "publishing" | "published" | "partial" | "failed" | "recovery_required" | "cancelled";
  linkedObservationCount: number;
};

export async function loadContentLineageReadModel(): Promise<ContentLineageReadModel> {
  const [{ data: cycles, error: cycleError }, { data: items, error: itemError }, { data: media, error: mediaError }, { data: captions, error: captionError }, { data: manifests, error: manifestError }, { data: handoffs, error: handoffError }, { data: authorizations, error: authorizationError }] = await Promise.all([
    db.from("client_operating_cycles").select("id,cycle_key").limit(2_000),
    db.from("content_lineage_items").select("id,operating_cycle_id,monthly_plan_item_id,social_content_item_id").limit(5_000),
    db.from("content_lineage_media_attachments").select("content_lineage_item_id").eq("attachment_state", "active").limit(5_000),
    db.from("content_lineage_caption_attachments").select("content_lineage_item_id").eq("attachment_state", "active").limit(5_000),
    db.from("content_final_review_manifests").select("id,content_lineage_item_id,review_status,manifest_version").order("manifest_version", { ascending: false }).limit(5_000),
    db.from("content_lineage_publishing_handoffs").select("content_lineage_item_id,handoff_state,linked_at").order("linked_at", { ascending: false }).limit(5_000),
    db.from("content_lineage_execution_authorizations").select("content_lineage_item_id,social_provider_execution_id,authorization_state,created_at").order("created_at", { ascending: false }).limit(5_000),
  ]);
  if (cycleError || itemError || mediaError || captionError || manifestError || handoffError || authorizationError) throw new Error("Unable to load content lineage.");
  const cycleKeyById = new Map(((cycles ?? []) as Row[]).map((cycle) => [text(cycle.id), text(cycle.cycle_key)]));
  const activeMedia = new Set(((media ?? []) as Row[]).map((value) => text(value.content_lineage_item_id)));
  const activeCaption = new Set(((captions ?? []) as Row[]).map((value) => text(value.content_lineage_item_id)));
  const latestManifestByLineage = new Map<string, Row>();
  for (const manifest of (manifests ?? []) as Row[]) {
    const lineageId = text(manifest.content_lineage_item_id);
    if (lineageId && !latestManifestByLineage.has(lineageId)) latestManifestByLineage.set(lineageId, manifest);
  }
  const latestHandoffByLineage = new Map<string, Row>();
  for (const handoff of (handoffs ?? []) as Row[]) {
    const lineageId = text(handoff.content_lineage_item_id);
    if (lineageId && !latestHandoffByLineage.has(lineageId)) latestHandoffByLineage.set(lineageId, handoff);
  }
  const authorizationRows = (authorizations ?? []) as Row[];
  const executionIds = [...new Set(authorizationRows.map((value) => text(value.social_provider_execution_id)).filter(Boolean))];
  const [{ data: executions, error: executionError }, { data: executionTargets, error: executionTargetError }] = await Promise.all([
    executionIds.length ? db.from("social_provider_executions").select("id,status").in("id", executionIds) : Promise.resolve({ data: [], error: null }),
    executionIds.length ? db.from("social_provider_execution_targets").select("id,social_provider_execution_id,status").in("social_provider_execution_id", executionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (executionError || executionTargetError) throw new Error("Unable to load lineage execution state.");
  const executionTargetRows = (executionTargets ?? []) as Row[];
  const executionTargetIds = executionTargetRows.map((value) => text(value.id)).filter(Boolean);
  const { data: observations, error: observationError } = executionTargetIds.length
    ? await db.from("social_performance_post_observations").select("social_provider_execution_target_id").in("social_provider_execution_target_id", executionTargetIds)
    : { data: [], error: null };
  if (observationError) throw new Error("Unable to load lineage observation state.");
  const executionById = new Map(((executions ?? []) as Row[]).map((value) => [text(value.id), value]));
  const observationCountByExecution = new Map<string, number>();
  const executionByTargetId = new Map(executionTargetRows.map((value) => [text(value.id), text(value.social_provider_execution_id)]));
  for (const observation of (observations ?? []) as Row[]) {
    const executionId = executionByTargetId.get(text(observation.social_provider_execution_target_id));
    if (executionId) observationCountByExecution.set(executionId, (observationCountByExecution.get(executionId) ?? 0) + 1);
  }
  const authorizationByLineage = new Map<string, Row[]>();
  for (const authorization of authorizationRows) {
    const lineageId = text(authorization.content_lineage_item_id);
    if (lineageId) authorizationByLineage.set(lineageId, [...(authorizationByLineage.get(lineageId) ?? []), authorization]);
  }
  const byPlanItemId = new Map<string, ContentLineageState>();
  const bySocialContentItemId = new Map<string, ContentLineageState>();
  for (const item of (items ?? []) as Row[]) {
    const lineageId = text(item.id);
    const manifestStatus = text(latestManifestByLineage.get(lineageId)?.review_status);
    const handoffStatus = text(latestHandoffByLineage.get(lineageId)?.handoff_state);
    const executionStates = (authorizationByLineage.get(lineageId) ?? []).map((authorization) => {
      const state = text(authorization.authorization_state);
      const execution = executionById.get(text(authorization.social_provider_execution_id));
      return execution ? text(execution.status) : state === "authorized" ? "prepared" : "none";
    });
    const executionState = ["published", "publishing", "scheduled", "partial", "recovery_required", "failed", "cancelled", "prepared"].find((candidate) => executionStates.includes(candidate)) ?? "none";
    const linkedObservationCount = (authorizationByLineage.get(lineageId) ?? []).reduce((count, authorization) => count + (observationCountByExecution.get(text(authorization.social_provider_execution_id)) ?? 0), 0);
    const value: ContentLineageState = {
      id: lineageId,
      cycleKey: cycleKeyById.get(text(item.operating_cycle_id)) ?? "",
      hasMedia: activeMedia.has(lineageId),
      hasCaption: activeCaption.has(lineageId),
      hasPublishingDraft: Boolean(text(item.social_content_item_id)),
      reviewStatus: ["ready", "approved", "stale", "superseded"].includes(manifestStatus) ? manifestStatus as ContentLineageState["reviewStatus"] : "none",
      publishingHandoff: ["linked", "stale", "superseded"].includes(handoffStatus) ? handoffStatus as ContentLineageState["publishingHandoff"] : "none",
      executionState: executionState as ContentLineageState["executionState"],
      linkedObservationCount,
    };
    const planItemId = text(item.monthly_plan_item_id), socialContentItemId = text(item.social_content_item_id);
    if (planItemId) byPlanItemId.set(planItemId, value);
    if (socialContentItemId) bySocialContentItemId.set(socialContentItemId, value);
  }
  return { byPlanItemId, bySocialContentItemId };
}
