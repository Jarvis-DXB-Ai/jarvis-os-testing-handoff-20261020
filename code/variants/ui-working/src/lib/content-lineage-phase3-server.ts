import "server-only";

import { randomUUID } from "crypto";

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core";
import { requireCurrentApprovedFinalReviewManifest } from "@/lib/content-lineage-phase2-server";
import { dispatchReservedSocialExecution, reserveSocialExecution } from "@/lib/social-provider-execution-server";

type Row = Record<string, unknown>;
type ExecutionMode = "dry_run" | "live";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const isUuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));

function fail(message: string): never { throw new Error(message); }

function safeMode(value: unknown): ExecutionMode {
  return value === "live" ? "live" : "dry_run";
}

function sameInstant(left: unknown, right: unknown) {
  const leftTime = Date.parse(text(left));
  const rightTime = Date.parse(text(right));
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

async function requireManifestTarget(clientId: string, manifestId: string, manifestTargetId: string) {
  if (!isUuid(manifestTargetId)) fail("Final Review platform target was not found.");
  const { data, error } = await db.from("content_final_review_manifest_targets")
    .select("id,client_id,final_review_manifest_id,social_content_platform_target_id,platform,account_snapshot,scheduled_at")
    .eq("client_id", clientId)
    .eq("id", manifestTargetId)
    .eq("final_review_manifest_id", manifestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) fail("Final Review platform target was not found for this approved manifest.");
  return data as Row;
}

async function requireLinkedPublishingHandoff(clientId: string, manifestId: string) {
  const { data, error } = await db.from("content_lineage_publishing_handoffs")
    .select("id,handoff_state")
    .eq("client_id", clientId)
    .eq("final_review_manifest_id", manifestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || text(data.handoff_state) !== "linked") {
    fail("Link this approved Final Review manifest to Publishing before preparing an execution.");
  }
}

async function requireCanonicalTarget(input: {
  clientId: string;
  socialContentItemId: string;
  platformTargetId: string;
  platform: string;
  accountSnapshot: Row;
  scheduledAt: string;
}) {
  const [{ data: target, error: targetError }, { data: connection, error: connectionError }, { data: item, error: itemError }] = await Promise.all([
    db.from("social_content_platform_targets")
      .select("id,client_id,social_content_item_id,platform,selected,status,scheduled_at")
      .eq("client_id", input.clientId)
      .eq("id", input.platformTargetId)
      .maybeSingle(),
    db.from("social_provider_connections")
      .select("id,client_id,platform,platform_account_id,status")
      .eq("client_id", input.clientId)
      .eq("id", text(input.accountSnapshot.connectionId))
      .maybeSingle(),
    db.from("social_content_items")
      .select("id,scheduled_at")
      .eq("client_id", input.clientId)
      .eq("id", input.socialContentItemId)
      .maybeSingle(),
  ]);
  if (targetError || connectionError || itemError) throw new Error(targetError?.message ?? connectionError?.message ?? itemError?.message ?? "Unable to verify the canonical Publishing target.");
  if (!target || text(target.social_content_item_id) !== input.socialContentItemId || text(target.platform) !== input.platform || target.selected !== true) {
    fail("The approved manifest target is no longer the selected canonical Publishing target.");
  }
  if (!connection || text(connection.platform) !== input.platform || text(connection.platform_account_id) !== text(input.accountSnapshot.accountId)) {
    fail("The approved manifest account no longer matches this client's canonical provider connection.");
  }
  if (!item || !sameInstant(item.scheduled_at, input.scheduledAt)) {
    fail("The canonical Publishing target schedule changed after Final Review approval.");
  }
  return { target: target as Row, connection: connection as Row };
}

async function requireExactExecutionAuthorization(clientId: string, authorizationId: string) {
  if (!isUuid(authorizationId)) fail("Execution authorization was not found.");
  const { data, error } = await db.from("content_lineage_execution_authorizations")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", authorizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) fail("Execution authorization was not found for this client.");
  return data as Row;
}

/**
 * Creates one durable dry-run or live authorization and reserves the matching
 * existing provider execution. It does not call the provider.
 */
export async function prepareLineageExecution(input: {
  clientId: string;
  manifestId: string;
  manifestTargetId: string;
  mode?: ExecutionMode;
  authorizedBy?: string;
}) {
  if (!isUuid(input.clientId) || !isUuid(input.manifestId)) fail("Client and Final Review manifest must be valid identifiers.");
  const mode = safeMode(input.mode);
  const approved = await requireCurrentApprovedFinalReviewManifest(input.clientId, input.manifestId);
  const manifest = approved.manifest;
  const manifestTarget = await requireManifestTarget(input.clientId, input.manifestId, input.manifestTargetId);
  await requireLinkedPublishingHandoff(input.clientId, input.manifestId);

  const accountSnapshot = record(manifestTarget.account_snapshot);
  const scheduledAt = text(manifestTarget.scheduled_at);
  const socialContentItemId = text(manifest.social_content_item_id);
  const platform = text(manifestTarget.platform);
  if (!socialContentItemId || !platform || !scheduledAt || !isUuid(text(manifestTarget.social_content_platform_target_id))) {
    fail("The approved Final Review target is incomplete and cannot create an execution.");
  }
  if (mode === "live" && !text(input.authorizedBy)) {
    fail("A named human authorization is required before a live provider execution can be prepared.");
  }
  const currentTarget = Array.isArray(approved.current.payload.targets)
    ? approved.current.payload.targets.map(record).find((target) => text(target.platformTargetId) === text(manifestTarget.social_content_platform_target_id))
    : null;
  if (!currentTarget || text(currentTarget.platform) !== platform
    || text(record(currentTarget.account).connectionId) !== text(accountSnapshot.connectionId)
    || text(record(currentTarget.account).accountId) !== text(accountSnapshot.accountId)
    || !sameInstant(approved.current.payload.schedule.scheduledAt, scheduledAt)) {
    fail("The Final Review target no longer matches the current canonical payload.");
  }
  const canonical = await requireCanonicalTarget({
    clientId: input.clientId,
    socialContentItemId,
    platformTargetId: text(manifestTarget.social_content_platform_target_id),
    platform,
    accountSnapshot,
    scheduledAt,
  });
  if (text(canonical.connection.status) !== "connected") fail("The canonical provider connection is not connected.");

  const { data: existing, error: existingError } = await db.from("content_lineage_execution_authorizations")
    .select("id,authorization_mode,authorization_state,social_provider_execution_id")
    .eq("client_id", input.clientId)
    .eq("final_review_manifest_id", input.manifestId)
    .eq("final_review_manifest_target_id", input.manifestTargetId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    if (text(existing.authorization_mode) !== mode) fail("This exact Final Review target already has a different execution authorization. Create a new approved manifest for another scope.");
    return { authorizationId: text(existing.id), executionId: text(existing.social_provider_execution_id) || null, mode, reused: true, state: text(existing.authorization_state) };
  }

  const idempotencyKey = randomUUID();
  const { data: inserted, error: insertError } = await db.from("content_lineage_execution_authorizations").insert({
    client_id: input.clientId,
    content_lineage_item_id: manifest.content_lineage_item_id,
    final_review_manifest_id: input.manifestId,
    final_review_manifest_target_id: input.manifestTargetId,
    social_content_item_id: socialContentItemId,
    social_content_platform_target_id: manifestTarget.social_content_platform_target_id,
    idempotency_key: idempotencyKey,
    manifest_version: manifest.manifest_version,
    manifest_payload_hash: manifest.payload_hash,
    platform,
    provider_connection_id: accountSnapshot.connectionId,
    provider_account_id: accountSnapshot.accountId,
    scheduled_at: scheduledAt,
    authorization_mode: mode,
    authorization_state: "authorized",
    authorized_by: mode === "live" ? text(input.authorizedBy).slice(0, 120) : null,
    provenance: { source: "content_lineage_phase3", manifest_payload_hash: manifest.payload_hash, mode },
  }).select("id").single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Unable to record the exact execution authorization.");
  const authorizationId = text(inserted.id);
  try {
    const reservation = await reserveSocialExecution({
      clientId: input.clientId,
      itemId: socialContentItemId,
      idempotencyKey,
      platforms: [platform as "instagram" | "facebook"],
    });
    const { error: linkError } = await db.from("content_lineage_execution_authorizations")
      .update({ social_provider_execution_id: reservation.executionId })
      .eq("id", authorizationId)
      .eq("client_id", input.clientId)
      .eq("authorization_state", "authorized");
    if (linkError) throw new Error(linkError.message);
    return { authorizationId, executionId: reservation.executionId, mode, reused: false, state: "authorized" as const, reservationReused: reservation.reused };
  } catch (error) {
    await db.from("content_lineage_execution_authorizations")
      .update({ authorization_state: "revoked", provenance: { source: "content_lineage_phase3", reservation_error: error instanceof Error ? error.message : "reservation failed" } })
      .eq("id", authorizationId)
      .eq("client_id", input.clientId)
      .eq("authorization_state", "authorized");
    throw error;
  }
}

/**
 * The sole live-dispatch entrypoint for Phase 3. It permits a global dry-run
 * deployment only when this exact manifest target already has a named,
 * one-time, server-recorded live authorization. Nothing calls this implicitly.
 */
export async function dispatchAuthorizedLineageExecution(input: { clientId: string; authorizationId: string }) {
  const authorization = await requireExactExecutionAuthorization(input.clientId, input.authorizationId);
  if (text(authorization.authorization_mode) !== "live" || text(authorization.authorization_state) !== "authorized") {
    fail("Only one current, named live authorization may dispatch an exact approved Final Review target.");
  }
  const executionId = text(authorization.social_provider_execution_id);
  if (!executionId) fail("This exact authorization has no reserved provider execution.");
  const approved = await requireCurrentApprovedFinalReviewManifest(input.clientId, text(authorization.final_review_manifest_id));
  if (text(approved.manifest.content_lineage_item_id) !== text(authorization.content_lineage_item_id)
    || approved.payloadHash !== text(authorization.manifest_payload_hash)) {
    fail("The approved Final Review manifest no longer matches this execution authorization.");
  }
  const result = await dispatchReservedSocialExecution({
    clientId: input.clientId,
    executionId,
    allowOneTimeLiveAuthorization: true,
  });
  if (result.dispatched) {
    const { error } = await db.from("content_lineage_execution_authorizations")
      .update({ authorization_state: "consumed", consumed_at: new Date().toISOString() })
      .eq("id", authorization.id)
      .eq("client_id", input.clientId)
      .eq("authorization_state", "authorized");
    if (error) throw new Error(error.message);
  }
  return { authorizationId: text(authorization.id), ...result };
}

export type ManifestPublishingLifecycle = {
  manifestId: string;
  targets: Array<{
    manifestTargetId: string;
    platform: string;
    accountLabel: string | null;
    scheduledAt: string | null;
    authorization: { id: string; mode: string; state: string; executionId: string | null } | null;
    execution: { status: string; providerPostId: string | null } | null;
    publication: { publishedAt: string | null; observationCount: number; observationState: "linked" | "unobserved" | "not_published" };
  }>;
};

/** Read-only lifecycle projection for Final Review and Content. */
export async function loadClientManifestPublishingLifecycles(clientId: string): Promise<ManifestPublishingLifecycle[]> {
  const { data: manifestTargets, error: targetError } = await db.from("content_final_review_manifest_targets")
    .select("id,final_review_manifest_id,platform,account_snapshot,scheduled_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (targetError) throw new Error(targetError.message);
  const targets = (manifestTargets ?? []) as Row[];
  const targetIds = targets.map((value) => text(value.id)).filter(Boolean);
  if (!targetIds.length) return [];
  const { data: authorizations, error: authorizationError } = await db.from("content_lineage_execution_authorizations")
    .select("id,final_review_manifest_target_id,authorization_mode,authorization_state,social_provider_execution_id")
    .eq("client_id", clientId)
    .in("final_review_manifest_target_id", targetIds);
  if (authorizationError) throw new Error(authorizationError.message);
  const authRows = (authorizations ?? []) as Row[];
  const executionIds = authRows.map((value) => text(value.social_provider_execution_id)).filter(Boolean);
  const [{ data: executions, error: executionError }, { data: executionTargets, error: executionTargetError }] = await Promise.all([
    executionIds.length ? db.from("social_provider_executions").select("id,status,provider_post_id").eq("client_id", clientId).in("id", executionIds) : Promise.resolve({ data: [], error: null }),
    executionIds.length ? db.from("social_provider_execution_targets").select("id,social_provider_execution_id,status,published_at").eq("client_id", clientId).in("social_provider_execution_id", executionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (executionError || executionTargetError) throw new Error(executionError?.message ?? executionTargetError?.message ?? "Unable to load provider execution lifecycle.");
  const executionTargetRows = (executionTargets ?? []) as Row[];
  const executionTargetIds = executionTargetRows.map((value) => text(value.id)).filter(Boolean);
  const { data: observations, error: observationError } = executionTargetIds.length
    ? await db.from("social_performance_post_observations").select("id,social_provider_execution_target_id").eq("client_id", clientId).in("social_provider_execution_target_id", executionTargetIds)
    : { data: [], error: null };
  if (observationError) throw new Error(observationError.message);
  const authByTarget = new Map(authRows.map((value) => [text(value.final_review_manifest_target_id), value]));
  const executionById = new Map(((executions ?? []) as Row[]).map((value) => [text(value.id), value]));
  const executionTargetsByExecution = new Map<string, Row[]>();
  for (const target of executionTargetRows) {
    const id = text(target.social_provider_execution_id);
    executionTargetsByExecution.set(id, [...(executionTargetsByExecution.get(id) ?? []), target]);
  }
  const observationCountByTarget = new Map<string, number>();
  for (const observation of (observations ?? []) as Row[]) {
    const id = text(observation.social_provider_execution_target_id);
    observationCountByTarget.set(id, (observationCountByTarget.get(id) ?? 0) + 1);
  }
  const grouped = new Map<string, ManifestPublishingLifecycle["targets"]>();
  for (const target of targets) {
    const authorization = authByTarget.get(text(target.id));
    const execution = authorization ? executionById.get(text(authorization.social_provider_execution_id)) : null;
    const executionTargetsForAuthorization = authorization ? executionTargetsByExecution.get(text(authorization.social_provider_execution_id)) ?? [] : [];
    const published = executionTargetsForAuthorization.find((value) => text(value.status) === "published") ?? null;
    const observationCount = published ? observationCountByTarget.get(text(published.id)) ?? 0 : 0;
    const state: "not_published" | "linked" | "unobserved" = !published ? "not_published" : observationCount ? "linked" : "unobserved";
    const account = record(target.account_snapshot);
    const row = {
      manifestTargetId: text(target.id), platform: text(target.platform),
      accountLabel: text(account.handle) || text(account.accountName) || null,
      scheduledAt: text(target.scheduled_at) || null,
      authorization: authorization ? { id: text(authorization.id), mode: text(authorization.authorization_mode), state: text(authorization.authorization_state), executionId: text(authorization.social_provider_execution_id) || null } : null,
      execution: execution ? { status: text(execution.status), providerPostId: text(execution.provider_post_id) || null } : null,
      publication: { publishedAt: published ? text(published.published_at) || null : null, observationCount, observationState: state },
    };
    const manifestId = text(target.final_review_manifest_id);
    grouped.set(manifestId, [...(grouped.get(manifestId) ?? []), row]);
  }
  return Array.from(grouped.entries()).map(([manifestId, targets]) => ({ manifestId, targets }));
}
