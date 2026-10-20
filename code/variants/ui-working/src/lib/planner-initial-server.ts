import "server-only";

import { clientBrainV2ServerClient as db, isUuid } from "@/lib/client-brain-v2-server-core";
import type { SocialPlannerEntry } from "@/lib/social-publishing";
import { measureServerLoader } from "@/lib/server-performance";

type MonthlyPlanRef = { id: string; plan_month: string };

type PlannerPlanDetail = {
  plan: {
    id: string;
    plan_month: string;
    status: string;
    target_feed_count: number;
    item_count: number | null;
    monthly_context: string | null;
    strategy: Record<string, unknown> | null;
    updated_at: string;
  };
  items: Array<{
    id: string;
    position: number;
    pillar: string | null;
    subject: string | null;
    creative_concept: string | null;
    production_method: string | null;
    planned_date: string | null;
    visual_direction: string | null;
    visual_direction_source: string | null;
    required_assets: string[] | null;
    status: string;
  }>;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Calendar badges need placement state, not captions, media, or signed URLs. */
async function loadPlannerCalendarEntries(clientId: string, monthStart: string) {
  const month = await db
    .from("social_content_months")
    .select("id")
    .eq("client_id", clientId)
    .eq("month_start", `${monthStart.slice(0, 7)}-01`)
    .maybeSingle();
  if (month.error || !month.data?.id) return [] as SocialPlannerEntry[];
  const [items, executions] = await Promise.all([
    db
      .from("social_content_items")
      .select("id,content_kind,format,title,status,scheduled_date,scheduled_time,scheduled_at,scheduled_payload_stale,publishing_payload_version,planner_synced_payload_version,planner_synced_at")
      .eq("client_id", clientId)
      .eq("social_content_month_id", month.data.id)
      .not("planner_synced_at", "is", null),
    db
      .from("social_provider_executions")
      .select("id,social_content_item_id,status,provider_post_id,failure_diagnostic,scheduled_for_utc")
      .eq("client_id", clientId),
  ]);
  if (items.error || executions.error) throw new Error("Planner calendar state could not be loaded.");
  const executionByItem = new Map((executions.data ?? []).map((row) => [text(row.social_content_item_id), row]));
  return (items.data ?? []).flatMap((row) => {
    if (!row.scheduled_date || !row.scheduled_time || !row.scheduled_at) return [];
    const execution = executionByItem.get(text(row.id));
    return [{
      id: `content:${row.id}`,
      contentItemId: text(row.id),
      contentKind: row.content_kind,
      format: row.format,
      title: row.title,
      status: row.status,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      scheduledAt: row.scheduled_at,
      finalCaption: null,
      platformTargets: [],
      media: [],
      scheduledPayloadStale: Boolean(row.scheduled_payload_stale),
      publishingPayloadVersion: Number(row.publishing_payload_version ?? 1),
      plannerSyncedPayloadVersion: typeof row.planner_synced_payload_version === "number" ? row.planner_synced_payload_version : null,
      plannerSyncedAt: row.planner_synced_at,
      providerExecution: execution ? {
        id: text(execution.id), status: execution.status, provider: "zernio", providerPostId: execution.provider_post_id, failureDiagnostic: execution.failure_diagnostic, scheduledForUtc: execution.scheduled_for_utc,
      } : null,
    } as SocialPlannerEntry];
  });
}

async function loadPlannerPlanDetail(clientId: string, planId: string): Promise<PlannerPlanDetail | null> {
  const [plan, items] = await Promise.all([
    db.from("social_monthly_content_plans").select("id,plan_month,status,target_feed_count,monthly_context,strategy,updated_at").eq("id", planId).eq("client_id", clientId).maybeSingle(),
    db.from("social_monthly_content_plan_items").select("id,position,pillar,subject,creative_concept,production_method,planned_date,visual_direction,visual_direction_source,required_assets,status").eq("monthly_plan_id", planId).eq("client_id", clientId).order("position"),
  ]);
  if (plan.error || items.error) throw new Error("Planner detail could not be loaded.");
  if (!plan.data) return null;
  const mappedItems = (items.data ?? []) as PlannerPlanDetail["items"];
  return { plan: { ...(plan.data as Omit<PlannerPlanDetail["plan"], "item_count">), item_count: mappedItems.length }, items: mappedItems };
}

export async function loadInitialPlannerData(
  clientId: string,
  requestedPlanId: string | null,
) {
  if (!isUuid(clientId)) throw new Error("Invalid client ID.");
  return measureServerLoader("planner.initial", 5, async () => {
    const result = await db.from("social_monthly_content_plans").select("id,plan_month").eq("client_id", clientId).eq("is_current", true).order("plan_month", { ascending: false });
    if (result.error) throw new Error("Planner plans could not be loaded.");
    const plans = (result.data ?? []) as MonthlyPlanRef[];
    const plan =
      plans.find((candidate) => candidate.id === requestedPlanId) ??
      plans[0] ??
      null;

    if (!plan) return { plans, detail: null, entries: [] };

    const [detail, entries] = await Promise.all([
      loadPlannerPlanDetail(clientId, plan.id),
      loadPlannerCalendarEntries(clientId, plan.plan_month),
    ]);

    return {
      plans,
      detail,
      entries,
    };
  });
}
