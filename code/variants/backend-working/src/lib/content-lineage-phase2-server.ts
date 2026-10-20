import "server-only";

import { createHash } from "crypto";

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value),
  );

function fail(message: string): never {
  throw new Error(message);
}

function hashPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function requireLineage(clientId: string, lineageItemId: string) {
  if (!isUuid(clientId) || !isUuid(lineageItemId)) fail("Content lineage item was not found.");
  const { data, error } = await db
    .from("content_lineage_items")
    .select("id,client_id,operating_cycle_id,monthly_plan_id,monthly_plan_item_id,social_content_item_id")
    .eq("id", lineageItemId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) fail("Content lineage item was not found for this client.");
  return data as Row;
}

async function requireFinalStudioContent(clientId: string, finalContentItemId: string) {
  if (!isUuid(finalContentItemId)) fail("Final Studio asset was not found.");
  const { data, error } = await db
    .from("client_content_items")
    .select("id,client_id,source,final_state,source_session_id,source_generation_id,storage_bucket,storage_path,file_name,mime_type,byte_size,width,height")
    .eq("id", finalContentItemId)
    .eq("client_id", clientId)
    .eq("source", "ai_content")
    .eq("final_state", "final")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !text(data.source_session_id) || !text(data.source_generation_id)) {
    fail("Only a finalized Studio asset can be attached to a content item.");
  }
  return data as Row;
}

async function activeMediaAttachment(clientId: string, lineageItemId: string) {
  const { data, error } = await db
    .from("content_lineage_media_attachments")
    .select("id,final_content_item_id,attachment_state")
    .eq("client_id", clientId)
    .eq("content_lineage_item_id", lineageItemId)
    .eq("attachment_state", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Row | null;
}

async function syncFinalMediaToPublishingItem(input: {
  clientId: string;
  socialContentItemId: string | null;
  finalContent: Row;
  replace: boolean;
}) {
  if (!input.socialContentItemId) return;
  const { data: media, error } = await db
    .from("social_content_media")
    .select("id,storage_bucket,storage_path,sort_order")
    .eq("client_id", input.clientId)
    .eq("social_content_item_id", input.socialContentItemId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  const rows = (media ?? []) as Row[];
  const same = rows.length === 1
    && text(rows[0].storage_bucket) === text(input.finalContent.storage_bucket)
    && text(rows[0].storage_path) === text(input.finalContent.storage_path);
  if (same) return;
  if (rows.length && !input.replace) {
    fail("This Publishing item already has different media. Use the explicit replacement action to change it.");
  }
  if (rows.length > 1) {
    fail("A multi-media Publishing item cannot be silently replaced by one Studio asset.");
  }
  const payload = {
    client_id: input.clientId,
    social_content_item_id: input.socialContentItemId,
    storage_bucket: text(input.finalContent.storage_bucket),
    storage_path: text(input.finalContent.storage_path),
    file_name: text(input.finalContent.file_name),
    mime_type: text(input.finalContent.mime_type),
    byte_size: Number(input.finalContent.byte_size),
    width: typeof input.finalContent.width === "number" ? input.finalContent.width : null,
    height: typeof input.finalContent.height === "number" ? input.finalContent.height : null,
    sort_order: 1,
    content_sha256: null,
  };
  if (rows.length === 1) {
    const { error: updateError } = await db
      .from("social_content_media")
      .update(payload)
      .eq("id", rows[0].id)
      .eq("client_id", input.clientId);
    if (updateError) throw new Error(updateError.message);
    return;
  }
  const { error: insertError } = await db.from("social_content_media").insert(payload);
  if (insertError) throw new Error(insertError.message);
}

/** Attach a finalized Studio asset without copying its binary. Replacement is explicit. */
export async function attachFinalStudioAssetToLineage(input: {
  clientId: string;
  lineageItemId: string;
  finalContentItemId: string;
  replace?: boolean;
}) {
  const lineage = await requireLineage(input.clientId, input.lineageItemId);
  const finalContent = await requireFinalStudioContent(
    input.clientId,
    input.finalContentItemId,
  );
  const existing = await activeMediaAttachment(input.clientId, input.lineageItemId);
  if (existing && text(existing.final_content_item_id) === text(finalContent.id)) {
    return { attachmentId: text(existing.id), reused: true };
  }
  if (existing && !input.replace) {
    fail("Final media is already attached. Choose Replace final media to make a deliberate change.");
  }
  await syncFinalMediaToPublishingItem({
    clientId: input.clientId,
    socialContentItemId: text(lineage.social_content_item_id) || null,
    finalContent,
    replace: Boolean(input.replace),
  });
  if (existing) {
    const { error } = await db
      .from("content_lineage_media_attachments")
      .update({ attachment_state: "replaced", replaced_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("client_id", input.clientId)
      .eq("attachment_state", "active");
    if (error) throw new Error(error.message);
  }
  const { data, error } = await db
    .from("content_lineage_media_attachments")
    .insert({
      client_id: input.clientId,
      content_lineage_item_id: input.lineageItemId,
      final_content_item_id: finalContent.id,
      studio_session_id: finalContent.source_session_id,
      studio_generation_id: finalContent.source_generation_id,
      provenance: {
        source: "studio_finalization",
        final_content_item_id: finalContent.id,
        studio_generation_id: finalContent.source_generation_id,
      },
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const active = await activeMediaAttachment(input.clientId, input.lineageItemId);
    if (active && text(active.final_content_item_id) === text(finalContent.id)) {
      return { attachmentId: text(active.id), reused: true };
    }
    fail("Final media changed concurrently. Refresh and review the current attachment.");
  }
  if (error || !data) throw new Error(error?.message ?? "Unable to attach final media.");
  const { error: lineageError } = await db
    .from("content_lineage_items")
    .update({
      studio_session_id: finalContent.source_session_id,
      studio_generation_id: finalContent.source_generation_id,
      final_content_item_id: finalContent.id,
    })
    .eq("id", input.lineageItemId)
    .eq("client_id", input.clientId);
  if (lineageError) throw new Error(lineageError.message);
  if (existing) {
    await db
      .from("content_lineage_media_attachments")
      .update({ replaced_by_attachment_id: data.id })
      .eq("id", existing.id)
      .eq("client_id", input.clientId);
  }
  return { attachmentId: text(data.id), reused: false };
}

/** Creates a Publishing draft from exact plan provenance; it never schedules or dispatches. */
export async function createPublishingDraftForLineage(input: {
  clientId: string;
  lineageItemId: string;
}) {
  const lineage = await requireLineage(input.clientId, input.lineageItemId);
  if (text(lineage.social_content_item_id)) return { socialContentItemId: text(lineage.social_content_item_id), reused: true };
  const cycleKeyResult = await db
    .from("client_operating_cycles")
    .select("cycle_key")
    .eq("id", lineage.operating_cycle_id)
    .eq("client_id", input.clientId)
    .maybeSingle();
  if (cycleKeyResult.error) throw new Error(cycleKeyResult.error.message);
  const cycleKey = text(cycleKeyResult.data?.cycle_key);
  if (!/^\d{4}-\d{2}$/.test(cycleKey)) fail("The operating cycle is not valid for Publishing.");
  const [planItemResult, monthResult] = await Promise.all([
    text(lineage.monthly_plan_item_id)
      ? db.from("social_monthly_content_plan_items").select("subject,creative_concept,planned_date,position").eq("id", lineage.monthly_plan_item_id).eq("client_id", input.clientId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("social_content_months").select("id").eq("client_id", input.clientId).eq("month_start", `${cycleKey}-01`).maybeSingle(),
  ]);
  if (planItemResult.error || monthResult.error) throw new Error("Unable to prepare the Publishing draft.");
  let monthId = text(monthResult.data?.id);
  if (!monthId) {
    const { data, error } = await db
      .from("social_content_months")
      .insert({ client_id: input.clientId, month_start: `${cycleKey}-01`, timezone: "Asia/Dubai" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    monthId = text(data?.id);
  }
  const { data: tail, error: tailError } = await db
    .from("social_content_items")
    .select("sequence")
    .eq("client_id", input.clientId)
    .eq("social_content_month_id", monthId)
    .eq("content_kind", "feed")
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tailError) throw new Error(tailError.message);
  const planItem = (planItemResult.data ?? {}) as Row;
  const title = text(planItem.subject) || text(planItem.creative_concept) || null;
  const { data: socialItem, error: insertError } = await db
    .from("social_content_items")
    .insert({
      client_id: input.clientId,
      social_content_month_id: monthId,
      source: "monthly_plan",
      content_kind: "feed",
      format: "feed",
      title,
      sequence: Number(tail?.sequence ?? 0) + 1,
      status: "Needs Caption",
      scheduled_date: text(planItem.planned_date) || null,
      scheduled_time: null,
      scheduled_at: null,
      time_selection_source: "unavailable",
      time_recommendation: { status: "unavailable", message: "Choose a publishing time before final review." },
      content_context: { lineage: { contentLineageItemId: input.lineageItemId, monthlyPlanItemId: text(lineage.monthly_plan_item_id) || null } },
    })
    .select("id")
    .single();
  if (insertError || !socialItem) throw new Error(insertError?.message ?? "Unable to create a Publishing draft.");
  const socialContentItemId = text(socialItem.id);
  const { error: targetsError } = await db.from("social_content_platform_targets").insert(
    ["instagram", "facebook", "linkedin"].map((platform) => ({
      client_id: input.clientId,
      social_content_item_id: socialContentItemId,
      platform,
      selected: platform === "instagram",
      status: "Draft",
    })),
  );
  if (targetsError) throw new Error(targetsError.message);
  const { data: linked, error: linkError } = await db
    .from("content_lineage_items")
    .update({ social_content_item_id: socialContentItemId })
    .eq("id", input.lineageItemId)
    .eq("client_id", input.clientId)
    .is("social_content_item_id", null)
    .select("id")
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!linked) {
    await db.from("social_content_items").delete().eq("id", socialContentItemId).eq("client_id", input.clientId);
    const refreshed = await requireLineage(input.clientId, input.lineageItemId);
    return { socialContentItemId: text(refreshed.social_content_item_id), reused: true };
  }
  const media = await activeMediaAttachment(input.clientId, input.lineageItemId);
  if (media) {
    const finalContent = await requireFinalStudioContent(input.clientId, text(media.final_content_item_id));
    await syncFinalMediaToPublishingItem({ clientId: input.clientId, socialContentItemId, finalContent, replace: false });
  }
  return { socialContentItemId, reused: false };
}

async function activeCaptionAttachment(clientId: string, lineageItemId: string) {
  const { data, error } = await db
    .from("content_lineage_caption_attachments")
    .select("id,social_content_item_id,caption_option_id")
    .eq("client_id", clientId)
    .eq("content_lineage_item_id", lineageItemId)
    .eq("attachment_state", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Row | null;
}

/** Idempotently records the caption system's current, approved final caption. */
export async function syncCaptionAttachmentForSocialItem(clientId: string, socialContentItemId: string) {
  const { data: lineage, error: lineageError } = await db
    .from("content_lineage_items")
    .select("id")
    .eq("client_id", clientId)
    .eq("social_content_item_id", socialContentItemId)
    .maybeSingle();
  if (lineageError) throw new Error(lineageError.message);
  if (!lineage) return { linked: false };
  const { data: item, error: itemError } = await db
    .from("social_content_items")
    .select("id,final_caption,caption_approved_at,selected_caption_option_id")
    .eq("id", socialContentItemId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item || !text(item.final_caption) || !item.caption_approved_at) return { linked: false };
  const lineageItemId = text(lineage.id);
  const existing = await activeCaptionAttachment(clientId, lineageItemId);
  const optionId = text(item.selected_caption_option_id) || null;
  if (existing && text(existing.social_content_item_id) === socialContentItemId && (text(existing.caption_option_id) || null) === optionId) {
    return { linked: true, attachmentId: text(existing.id), reused: true };
  }
  if (existing) {
    const { error } = await db.from("content_lineage_caption_attachments")
      .update({ attachment_state: "replaced", replaced_at: new Date().toISOString() })
      .eq("id", existing.id).eq("client_id", clientId).eq("attachment_state", "active");
    if (error) throw new Error(error.message);
  }
  const { data, error } = await db.from("content_lineage_caption_attachments").insert({
    client_id: clientId,
    content_lineage_item_id: lineageItemId,
    social_content_item_id: socialContentItemId,
    caption_option_id: optionId,
    provenance: { source: "social_caption_approval", caption_approved_at: item.caption_approved_at },
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to link the approved caption.");
  if (existing) await db.from("content_lineage_caption_attachments").update({ replaced_by_attachment_id: data.id }).eq("id", existing.id).eq("client_id", clientId);
  return { linked: true, attachmentId: text(data.id), reused: false };
}

async function manifestPayload(clientId: string, lineageItemId: string) {
  const lineage = await requireLineage(clientId, lineageItemId);
  const socialContentItemId = text(lineage.social_content_item_id);
  if (!socialContentItemId) fail("Prepare a client-scoped Publishing draft before final review.");
  const [mediaAttachment, captionAttachment, itemResult, finalContentResult, planResult] = await Promise.all([
    activeMediaAttachment(clientId, lineageItemId),
    activeCaptionAttachment(clientId, lineageItemId),
    db.from("social_content_items").select("id,client_id,final_caption,caption_approved_at,scheduled_date,scheduled_time,scheduled_at,format,status,publishing_payload_version").eq("id", socialContentItemId).eq("client_id", clientId).maybeSingle(),
    db.from("client_content_items").select("id,storage_bucket,storage_path,file_name,mime_type,byte_size,width,height,final_state").eq("client_id", clientId).eq("final_state", "final"),
    text(lineage.monthly_plan_item_id) ? db.from("social_monthly_content_plan_items").select("id,position,subject,creative_concept,objective,planned_date").eq("id", lineage.monthly_plan_item_id).eq("client_id", clientId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (itemResult.error || finalContentResult.error || planResult.error) throw new Error("Unable to assemble final review.");
  if (!mediaAttachment) fail("Final media must be attached before final review.");
  if (!captionAttachment) fail("An approved final caption must be linked before final review.");
  const item = itemResult.data as Row | null;
  if (!item || !text(item.final_caption) || !item.caption_approved_at) fail("Publishing has no current approved final caption.");
  if (text(captionAttachment.social_content_item_id) !== socialContentItemId) fail("The caption attachment no longer matches this Publishing item.");
  if (!text(item.scheduled_date) || !text(item.scheduled_time) || !text(item.scheduled_at)) fail("Planner date and time are required before final review.");
  const finalContent = ((finalContentResult.data ?? []) as Row[]).find((value) => text(value.id) === text(mediaAttachment.final_content_item_id));
  if (!finalContent) fail("The attached final Studio asset is no longer available.");
  const { data: targets, error: targetError } = await db
    .from("social_content_platform_targets")
    .select("id,platform,selected,status")
    .eq("client_id", clientId)
    .eq("social_content_item_id", socialContentItemId)
    .eq("selected", true)
    .order("platform");
  if (targetError) throw new Error(targetError.message);
  if (!(targets ?? []).length) fail("Select at least one platform before final review.");
  const platforms = (targets ?? []) as Row[];
  const { data: connections, error: connectionError } = await db
    .from("social_provider_connections")
    .select("id,platform,platform_account_id,account_name,handle,status")
    .eq("client_id", clientId)
    .eq("provider", "zernio");
  if (connectionError) throw new Error(connectionError.message);
  const connectionByPlatform = new Map(((connections ?? []) as Row[]).map((connection) => [text(connection.platform), connection]));
  const targetSnapshot = platforms.map((target) => {
    const connection = connectionByPlatform.get(text(target.platform));
    return {
      platformTargetId: text(target.id), platform: text(target.platform), status: text(target.status),
      account: connection ? { connectionId: text(connection.id), accountId: text(connection.platform_account_id), accountName: text(connection.account_name) || null, handle: text(connection.handle) || null, status: text(connection.status) } : { status: "not_mapped" },
    };
  });
  const payload = {
    media: { attachmentId: text(mediaAttachment.id), finalContentItemId: text(finalContent.id), storageBucket: text(finalContent.storage_bucket), storagePath: text(finalContent.storage_path), fileName: text(finalContent.file_name), mimeType: text(finalContent.mime_type), byteSize: Number(finalContent.byte_size), width: finalContent.width ?? null, height: finalContent.height ?? null },
    caption: { attachmentId: text(captionAttachment.id), socialContentItemId, captionOptionId: text(captionAttachment.caption_option_id) || null, text: text(item.final_caption), approvedAt: text(item.caption_approved_at) },
    targets: targetSnapshot,
    schedule: { date: text(item.scheduled_date), time: text(item.scheduled_time).slice(0, 5), scheduledAt: text(item.scheduled_at), timezone: "Asia/Dubai", publishingPayloadVersion: Number(item.publishing_payload_version) },
    plan: planResult.data ? { monthlyPlanId: text(lineage.monthly_plan_id) || null, monthlyPlanItemId: text(lineage.monthly_plan_item_id), position: (planResult.data as Row).position ?? null, objective: text((planResult.data as Row).objective) || null, subject: text((planResult.data as Row).subject) || null, creativeConcept: text((planResult.data as Row).creative_concept) || null, plannedDate: text((planResult.data as Row).planned_date) || null } : { monthlyPlanId: text(lineage.monthly_plan_id) || null, monthlyPlanItemId: null },
  };
  return { lineage, item, mediaAttachment, captionAttachment, platforms, payload };
}

export async function createFinalReviewManifest(clientId: string, lineageItemId: string) {
  const current = await manifestPayload(clientId, lineageItemId);
  const { data: latest, error: latestError } = await db.from("content_final_review_manifests")
    .select("id,manifest_version,review_status,payload_hash").eq("client_id", clientId).eq("content_lineage_item_id", lineageItemId)
    .order("manifest_version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new Error(latestError.message);
  const payloadHash = hashPayload(current.payload);
  if (latest && text(latest.payload_hash) === payloadHash && ["ready", "approved"].includes(text(latest.review_status))) return { manifestId: text(latest.id), version: Number(latest.manifest_version), reused: true };
  if (latest && ["ready", "approved"].includes(text(latest.review_status))) {
    const { error } = await db.from("content_final_review_manifests").update({ review_status: "superseded", stale_at: new Date().toISOString(), stale_reason: "A newer final-review payload was assembled." }).eq("id", latest.id).eq("client_id", clientId);
    if (error) throw new Error(error.message);
  }
  const version = Number(latest?.manifest_version ?? 0) + 1;
  const { data, error } = await db.from("content_final_review_manifests").insert({
    client_id: clientId, content_lineage_item_id: lineageItemId, operating_cycle_id: current.lineage.operating_cycle_id, manifest_version: version,
    review_status: "ready", media_attachment_id: current.mediaAttachment.id, caption_attachment_id: current.captionAttachment.id,
    social_content_item_id: current.item.id, media_snapshot: current.payload.media, caption_snapshot: current.payload.caption.text,
    target_snapshot: current.payload.targets, schedule_snapshot: current.payload.schedule, plan_snapshot: current.payload.plan,
    payload_hash: payloadHash, provenance: { source: "phase2_final_review", assembled_at: new Date().toISOString() },
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create the final review manifest.");
  const { error: targetsError } = await db.from("content_final_review_manifest_targets").insert(current.platforms.map((target) => {
    const matching = current.payload.targets.find((value) => value.platformTargetId === text(target.id));
    return { client_id: clientId, final_review_manifest_id: data.id, social_content_platform_target_id: target.id, platform: target.platform, account_snapshot: matching?.account ?? {}, scheduled_at: current.payload.schedule.scheduledAt };
  }));
  if (targetsError) throw new Error(targetsError.message);
  return { manifestId: text(data.id), version, reused: false };
}

async function requireManifest(clientId: string, manifestId: string) {
  const { data, error } = await db.from("content_final_review_manifests").select("*").eq("id", manifestId).eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) fail("Final review manifest was not found for this client.");
  return data as Row;
}

/**
 * Recomputes the canonical Final Review payload before an irreversible
 * downstream handoff. A changed payload makes the old approval stale; it is
 * never silently dispatched under a prior manifest hash.
 */
export async function requireCurrentApprovedFinalReviewManifest(clientId: string, manifestId: string) {
  const manifest = await requireManifest(clientId, manifestId);
  if (text(manifest.review_status) !== "approved") {
    fail("An approved, current Final Review manifest is required before provider execution.");
  }
  const current = await manifestPayload(clientId, text(manifest.content_lineage_item_id));
  const payloadHash = hashPayload(current.payload);
  if (payloadHash !== text(manifest.payload_hash)) {
    await db.from("content_final_review_manifests")
      .update({ review_status: "stale", stale_at: new Date().toISOString(), stale_reason: "The canonical payload changed before provider execution." })
      .eq("id", manifestId)
      .eq("client_id", clientId)
      .eq("review_status", "approved");
    fail("The canonical payload changed. Assemble and approve a new Final Review manifest before provider execution.");
  }
  return { manifest, current, payloadHash };
}

export async function approveFinalReviewManifest(input: { clientId: string; manifestId: string; reviewer: string }) {
  const manifest = await requireManifest(input.clientId, input.manifestId);
  if (text(manifest.review_status) === "approved") return { approved: true, reused: true };
  if (text(manifest.review_status) !== "ready") fail("This final review is stale or superseded. Assemble the current payload before approving it.");
  const reviewer = text(input.reviewer).slice(0, 120);
  if (!reviewer) fail("Record the human reviewer before approving final content.");
  const current = await manifestPayload(input.clientId, text(manifest.content_lineage_item_id));
  if (hashPayload(current.payload) !== text(manifest.payload_hash)) {
    await db.from("content_final_review_manifests").update({ review_status: "stale", stale_at: new Date().toISOString(), stale_reason: "The canonical payload changed before approval." }).eq("id", input.manifestId).eq("client_id", input.clientId);
    fail("The canonical payload changed before approval. Assemble a new final review.");
  }
  const { data, error } = await db.from("content_final_review_manifests").update({ review_status: "approved", approved_by: reviewer, approved_at: new Date().toISOString() }).eq("id", input.manifestId).eq("client_id", input.clientId).eq("review_status", "ready").select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) fail("This final review changed concurrently. Refresh before approving it.");
  return { approved: true, reused: false };
}

/** Links an approved immutable review to Planner without dispatching any provider call. */
export async function handoffApprovedManifestToPublishing(clientId: string, manifestId: string) {
  if (process.env.SOCIAL_PUBLISHING_MODE !== "dry_run") fail("Phase 2 publishing handoff is restricted to dry-run mode.");
  const manifest = await requireManifest(clientId, manifestId);
  if (text(manifest.review_status) !== "approved") fail("An approved final review manifest is required before the Publishing handoff.");
  const current = await manifestPayload(clientId, text(manifest.content_lineage_item_id));
  if (hashPayload(current.payload) !== text(manifest.payload_hash)) {
    await db.from("content_final_review_manifests").update({ review_status: "stale", stale_at: new Date().toISOString(), stale_reason: "The canonical payload changed before Publishing handoff." }).eq("id", manifestId).eq("client_id", clientId);
    fail("The canonical payload changed. Final review must be approved again before Publishing handoff.");
  }
  const { data: existing, error: existingError } = await db.from("content_lineage_publishing_handoffs").select("id,handoff_state").eq("client_id", clientId).eq("content_lineage_item_id", manifest.content_lineage_item_id).eq("final_review_manifest_id", manifestId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing && text(existing.handoff_state) === "linked") return { handoffId: text(existing.id), reused: true };
  const now = new Date().toISOString();
  const { error: publishStateError } = await db.from("social_content_items").update({ status: "Approved", planner_synced_payload_version: Number(current.payload.schedule.publishingPayloadVersion), planner_synced_at: now, scheduled_payload_version: Number(current.payload.schedule.publishingPayloadVersion), scheduled_payload_stale: false }).eq("id", current.item.id).eq("client_id", clientId);
  if (publishStateError) throw new Error(publishStateError.message);
  const { data, error } = await db.from("content_lineage_publishing_handoffs").upsert({
    client_id: clientId, content_lineage_item_id: manifest.content_lineage_item_id, final_review_manifest_id: manifestId,
    social_content_item_id: current.item.id, handoff_state: "linked", linked_at: now,
    provenance: { approved_manifest_version: manifest.manifest_version, payload_hash: manifest.payload_hash, mode: "dry_run" },
  }, { onConflict: "client_id,content_lineage_item_id,final_review_manifest_id" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to link the approved final review to Publishing.");
  return { handoffId: text(data.id), reused: false };
}

export type LineageAttachmentTarget = { id: string; label: string; cycleKey: string; hasMedia: boolean; hasPublishingDraft: boolean };

export async function listLineageAttachmentTargets(clientId: string): Promise<LineageAttachmentTarget[]> {
  const [{ data: items, error: itemError }, { data: cycles, error: cycleError }, { data: plans, error: planError }, { data: media, error: mediaError }] = await Promise.all([
    db.from("content_lineage_items").select("id,operating_cycle_id,monthly_plan_item_id,social_content_item_id").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200),
    db.from("client_operating_cycles").select("id,cycle_key").eq("client_id", clientId),
    db.from("social_monthly_content_plan_items").select("id,position,subject,creative_concept").eq("client_id", clientId),
    db.from("content_lineage_media_attachments").select("content_lineage_item_id").eq("client_id", clientId).eq("attachment_state", "active"),
  ]);
  if (itemError || cycleError || planError || mediaError) throw new Error("Unable to load content lineage targets.");
  const cycleById = new Map(((cycles ?? []) as Row[]).map((value) => [text(value.id), text(value.cycle_key)]));
  const planById = new Map(((plans ?? []) as Row[]).map((value) => [text(value.id), value]));
  const mediaByLineage = new Set(((media ?? []) as Row[]).map((value) => text(value.content_lineage_item_id)));
  return ((items ?? []) as Row[]).map((value) => {
    const plan = planById.get(text(value.monthly_plan_item_id));
    const position = plan?.position ? `Post ${plan.position}` : "Content item";
    const title = text(plan?.subject) || text(plan?.creative_concept) || position;
    return { id: text(value.id), label: `${position} · ${title}`, cycleKey: cycleById.get(text(value.operating_cycle_id)) ?? "Unassigned cycle", hasMedia: mediaByLineage.has(text(value.id)), hasPublishingDraft: Boolean(text(value.social_content_item_id)) };
  });
}

export async function loadClientFinalReviewManifests(clientId: string) {
  const { data, error } = await db.from("content_final_review_manifests")
    .select("id,content_lineage_item_id,manifest_version,review_status,caption_snapshot,media_snapshot,target_snapshot,schedule_snapshot,plan_snapshot,approved_by,approved_at,stale_reason,created_at")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return Promise.all(((data ?? []) as Row[]).map(async (manifest) => {
    const media = record(manifest.media_snapshot);
    const bucket = text(media.storageBucket);
    const path = text(media.storagePath);
    const { data: signed } = bucket && path
      ? await db.storage.from(bucket).createSignedUrl(path, 60 * 30)
      : { data: null };
    return { ...manifest, media_signed_url: signed?.signedUrl ?? null };
  }));
}
