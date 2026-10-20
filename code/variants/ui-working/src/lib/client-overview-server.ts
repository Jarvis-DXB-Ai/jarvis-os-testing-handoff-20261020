import "server-only";
import { sampleMedian } from "@/lib/client-overview-integrity";

import {
  clientBrainV2ServerClient,
  ClientBrainV2HttpError,
  isUuid,
} from "@/lib/client-brain-v2-server-core";
import { measureServerLoader } from "@/lib/server-performance";

type Row = Record<string, unknown>;

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const asRecord = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const countWhere = (rows: Row[], predicate: (row: Row) => boolean) =>
  rows.filter(predicate).length;
const currentMonthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function countBy<T extends string>(
  rows: Row[],
  key: string,
  values: readonly T[],
) {
  return Object.fromEntries(
    values.map((value) => [
      value,
      countWhere(rows, (row) => text(row[key]) === value),
    ]),
  ) as Record<T, number>;
}

async function signedUrl(bucket: string, path: string) {
  if (!bucket || !path) return null;
  const { data } = await clientBrainV2ServerClient.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function formatMonth(value: string) {
  if (!/^\d{4}-\d{2}-01$/.test(value)) return "This month";
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(new Date(`${value}T00:00:00Z`));
}

function mediaType(fileType: string) {
  return fileType.startsWith("video/")
    ? "video"
    : fileType.startsWith("image/")
      ? "image"
      : "other";
}

function contentTitle(row: Row) {
  const title = text(row.title);
  const scheduleLabel = text(row.schedule_label);
  const technical =
    /^(hf[ _-]|[a-f0-9]{8}[-_]|[a-z]+ \d{8})/i.test(title) || title.length > 72;
  if (title && !technical) return title;
  if (scheduleLabel) return scheduleLabel;
  const format = text(row.format) || text(row.content_kind) || "content";
  return `Planned ${format}`;
}

function activityLabel(actionType: string) {
  const labels: Record<string, string> = {
    plan_created: "Monthly plan created",
    context_saved: "Planning context updated",
    strategy_saved: "Monthly strategy updated",
    item_created: "Plan item added",
    item_updated: "Plan item updated",
    item_deleted: "Plan item removed",
    item_reordered: "Plan order updated",
    plan_ready: "Plan marked ready",
    plan_approved: "Plan approved",
    plan_reopened: "Plan reopened",
    snapshot_refreshed: "Client Brain snapshot refreshed",
    strategy_regenerated: "Monthly strategy refreshed",
    concept_regenerated: "Plan concept refreshed",
  };
  return labels[actionType] ?? "Social plan updated";
}

export type ClientOverview = {
  client: {
    id: string;
    name: string;
    industry: string | null;
    status: string;
    website: string | null;
    logoUrl: string | null;
    logoName: string | null;
  };
  pulse: {
    monthStart: string;
    label: string;
    formats: Record<"feed" | "reel" | "story", number>;
    statuses: Record<
      "Ready for Review" | "Approved" | "Scheduled" | "Published",
      number
    >;
    next: {
      id: string;
      title: string;
      date: string | null;
      time: string | null;
    } | null;
  };
  upcoming: Array<{
    id: string;
    title: string;
    format: string;
    status: string;
    date: string | null;
    time: string | null;
    platforms: string[];
    thumbnailUrl: string | null;
  }>;
  reviewQueue: Array<{
    id: string;
    title: string;
    format: string;
    date: string | null;
    time: string | null;
    platforms: string[];
    thumbnailUrl: string | null;
  }>;
  attention: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
    tone: "warning" | "neutral";
  }>;
  content: Array<{
    id: string;
    title: string;
    contentType: string;
    mediaType: string;
    createdAt: string;
    thumbnailUrl: string | null;
  }>;
  brain: {
    recordCount: number;
    openGapCount: number;
    products: number;
    assets: number;
    content: number;
    logins: number;
    brandGuidelines: number;
    updatedAt: string | null;
  };
  activity: Array<{
    id: string;
    title: string;
    detail: string;
    createdAt: string;
    href: string;
  }>;
  socialPerformance: {
    lastSyncedAt: string | null;
    instagram: {
      followers: number | null;
      postReach: number | null;
      views: number | null;
      engagements: number | null;
      trend: number | null;
      previous: { followers: number | null; postReach: number | null; views: number | null; engagements: number | null } | null;
    } | null;
    facebook: {
      followers: number | null;
      postReach: number | null;
      views: number | null;
      engagements: number | null;
      trend: number | null;
      previous: { followers: number | null; postReach: number | null; views: number | null; engagements: number | null } | null;
    } | null;
  };
  pipeline: {
    planned: { count: number; approvedAt: string | null };
    produced: { count: number; blocked: number; stale: number };
    captioned: { count: number };
    review: { count: number };
    scheduled: {
      count: number;
      executionConfirmed: number;
      missingExecution: number;
    };
    published: {
      count: number;
      failed: number;
      recoveryRequired: number;
      reach: number | null;
    };
    bottleneck: "review" | null;
    nextStep: string;
  };
  performance: {
    topPosts: Array<NonNullable<ClientOverview["performance"]["topPost"]>>;
    topPost: {
      platform: "instagram" | "facebook";
      publishedAt: string | null;
      postType: string;
      title: string | null;
      captionExcerpt: string | null;
      thumbnailUrl: string | null;
      postUrl: string | null;
      reach: number | null;
      views: number | null;
      interactions: number | null;
      reachVsMedian: number | null;
    } | null;
    lastPublishedAt: string | null;
  };
  brainGaps: Array<{
    id: string;
    title: string;
    detail: string | null;
    priority: string | null;
    href: string;
  }>;
};

export async function loadClientOverview(
  clientId: string,
  options: { includeMedia?: boolean } = {},
): Promise<ClientOverview> {
  if (!isUuid(clientId))
    throw new ClientBrainV2HttpError("Invalid client ID.", 400);
  const includeMedia = options.includeMedia !== false;
  return measureServerLoader("client-overview.domain", 27, async () => {
    const [
      clientResult,
      assetCountResult,
      productCountResult,
      brandGuidelineCountResult,
      recordUpdatesResult,
      latestRecordResult,
      credentialsResult,
      contentResult,
      socialMonthsResult,
      socialItemsResult,
      socialMediaResult,
      socialTargetsResult,
      activityResult,
      monthlyItemsResult,
      logoGuidelineResult,
      performanceResult,
      monthlyPlansResult,
      monthlyPlanItemsResult,
      productionArtifactsResult,
      providerExecutionsResult,
      brainGapsResult,
      brainRecordCountResult,
    ] = await Promise.all([
      clientBrainV2ServerClient
        .from("clients")
        .select("id,name,industry,status,website")
        .eq("id", clientId)
        .maybeSingle(),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("top_section", "assets")
        .neq("status", "archived"),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("top_section", "products_offers")
        .in("status", ["current", "approved", "active"]),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("top_section", "brand_guidelines")
        .in("status", ["approved", "current"]),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("id,top_section,title,updated_at")
        .eq("client_id", clientId)
        .in("top_section", ["assets", "brand_guidelines"])
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(3),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("updated_at")
        .eq("client_id", clientId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      clientBrainV2ServerClient
        .from("client_secure_credentials")
        .select("id,status")
        .eq("client_id", clientId),
      clientBrainV2ServerClient
        .from("client_content_items")
        .select(
          "id,content_type,media_type,file_name,mime_type,storage_bucket,storage_path,created_at,updated_at",
        )
        .eq("client_id", clientId)
        .eq("final_state", "final")
        .order("created_at", { ascending: false })
        .limit(12),
      clientBrainV2ServerClient
        .from("social_content_months")
        .select("id,month_start")
        .eq("client_id", clientId)
        .order("month_start", { ascending: false }),
      clientBrainV2ServerClient
        .from("social_content_items")
        .select(
          "id,social_content_month_id,content_kind,format,title,schedule_label,status,scheduled_date,scheduled_time,scheduled_at,scheduled_payload_stale,created_at,updated_at",
        )
        .eq("client_id", clientId)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .order("sequence")
        .limit(120),
      includeMedia ? clientBrainV2ServerClient
        .from("social_content_media")
        .select(
          "social_content_item_id,storage_bucket,storage_path,file_name,mime_type,sort_order",
        )
        .eq("client_id", clientId)
        .order("sort_order") : Promise.resolve({ data: [], error: null }),
      clientBrainV2ServerClient
        .from("social_content_platform_targets")
        .select("social_content_item_id,platform,selected")
        .eq("client_id", clientId)
        .eq("selected", true),
      clientBrainV2ServerClient
        .from("social_monthly_plan_activity")
        .select("id,action_type,summary,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(5),
      clientBrainV2ServerClient
        .from("social_monthly_content_plan_items")
        .select("id,status")
        .eq("client_id", clientId)
        .eq("status", "blocked"),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("metadata")
        .eq("client_id", clientId)
        .eq("top_section", "brand_guidelines")
        .eq("subsection", "logos")
        .in("status", ["approved", "current"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      clientBrainV2ServerClient
        .from("social_performance_snapshots")
        .select(
          "id,platform,period_key,followers,post_reach,views,engagements,synced_at",
        )
        .eq("client_id", clientId)
        .eq("provider", "zernio")
        .order("synced_at", { ascending: false })
        .limit(20),
      clientBrainV2ServerClient
        .from("social_monthly_content_plans")
        .select("id,plan_month,status,approved_at,target_feed_count")
        .eq("client_id", clientId)
        .order("plan_month", { ascending: false })
        .limit(24),
      clientBrainV2ServerClient
        .from("social_monthly_content_plan_items")
        .select("monthly_plan_id,status")
        .eq("client_id", clientId)
        .limit(240),
      clientBrainV2ServerClient
        .from("social_monthly_plan_production_artifacts")
        .select("monthly_plan_id,monthly_plan_item_id,status")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(480),
      clientBrainV2ServerClient
        .from("social_provider_executions")
        .select("social_content_item_id,status")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(240),
      clientBrainV2ServerClient
        .from("client_brain_v2_records")
        .select("id,title,summary,priority", { count: "exact" })
        .eq("client_id", clientId)
        .eq("top_section", "intelligence")
        .eq("subsection", "knowledge_gaps")
        .in("status", ["active", "needs_review"])
        .order("priority", { ascending: true })
        .limit(4),
      clientBrainV2ServerClient.from("client_brain_v2_records")
        .select("id", { count: "exact", head: true }).eq("client_id", clientId).neq("status", "archived"),
    ]);

    const results = [
      clientResult,
      assetCountResult,
      productCountResult,
      brandGuidelineCountResult,
      recordUpdatesResult,
      latestRecordResult,
      credentialsResult,
      contentResult,
      socialMonthsResult,
      socialItemsResult,
      socialMediaResult,
      socialTargetsResult,
      activityResult,
      monthlyItemsResult,
      logoGuidelineResult,
      performanceResult,
      monthlyPlansResult,
      monthlyPlanItemsResult,
      productionArtifactsResult,
      providerExecutionsResult,
      brainGapsResult,
      brainRecordCountResult,
    ];
    const failed = results.find((result) => result.error);
    if (failed?.error)
      throw new ClientBrainV2HttpError(
        "Unable to load the client overview.",
        500,
      );
    if (!clientResult.data)
      throw new ClientBrainV2HttpError("Client not found.", 404);

    const client = clientResult.data as Row;
    const content = (contentResult.data ?? []) as Row[];
    const socialMonths = (socialMonthsResult.data ?? []) as Row[];
    const socialItems = (socialItemsResult.data ?? []) as Row[];
    const socialMedia = (socialMediaResult.data ?? []) as Row[];
    const socialTargets = (socialTargetsResult.data ?? []) as Row[];
    const performanceRows = (performanceResult.data ?? []) as Row[];
    const monthlyPlans = (monthlyPlansResult.data ?? []) as Row[];
    const monthlyPlanItems = (monthlyPlanItemsResult.data ?? []) as Row[];
    const productionArtifacts = (productionArtifactsResult.data ?? []) as Row[];
    const providerExecutions = (providerExecutionsResult.data ?? []) as Row[];
    const brainGapRows = (brainGapsResult.data ?? []) as Row[];
    const now = new Date().toISOString().slice(0, 10);
    const currentMonth =
      socialMonths.find(
        (month) => text(month.month_start) === currentMonthStart(),
      ) ??
      socialMonths.find(
        (month) => text(month.month_start) >= currentMonthStart(),
      ) ??
      socialMonths[0];
    const pulseItems = currentMonth
      ? socialItems.filter(
          (item) =>
            text(item.social_content_month_id) === text(currentMonth.id),
        )
      : [];
    const mediaByItem = new Map<string, Row>();
    for (const media of socialMedia)
      if (!mediaByItem.has(text(media.social_content_item_id)))
        mediaByItem.set(text(media.social_content_item_id), media);
    const platformsByItem = new Map<string, string[]>();
    for (const target of socialTargets) {
      const id = text(target.social_content_item_id);
      platformsByItem.set(id, [
        ...(platformsByItem.get(id) ?? []),
        text(target.platform),
      ]);
    }

    const logoData = asRecord(
      asRecord(logoGuidelineResult.data?.metadata).editor_data,
    );
    const logos: Row[] = Array.isArray(logoData.logos)
      ? logoData.logos.map(asRecord)
      : [];
    const primaryLogo =
      logos.find((item) => text(item.role) === "light_wordmark") ??
      logos.find((item) => text(item.role) === "wordmark") ??
      logos[0];
    let logoUrl: string | null = null;
    let logoName: string | null = null;
    if (primaryLogo && text(primaryLogo.assetId)) {
      const { data: assignment } = await clientBrainV2ServerClient
        .from("client_brain_v2_record_files")
        .select("file_object_id")
        .eq("client_id", clientId)
        .eq("record_id", text(primaryLogo.assetId))
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (assignment?.file_object_id) {
        const { data: file } = await clientBrainV2ServerClient
          .from("client_brain_file_objects")
          .select("storage_bucket,storage_path,file_name")
          .eq("id", assignment.file_object_id)
          .maybeSingle();
        if (file) {
          logoUrl = await signedUrl(
            text(file.storage_bucket),
            text(file.storage_path),
          );
          logoName = text(file.file_name) || null;
        }
      }
    }

    const upcomingRows = socialItems
      .filter((item) => {
        const date = text(item.scheduled_date);
        return Boolean(
          date &&
          date >= now &&
          ["Ready for Review", "Approved", "Scheduled"].includes(
            text(item.status),
          ),
        );
      })
      .slice(0, 7);
    const upcomingPromise = Promise.all(
      upcomingRows.map(async (item) => {
        const media = mediaByItem.get(text(item.id));
        return {
          id: text(item.id),
          title: contentTitle(item),
          format: text(item.format) || text(item.content_kind),
          status: text(item.status),
          date: text(item.scheduled_date) || null,
          time: text(item.scheduled_time).slice(0, 5) || null,
          platforms: platformsByItem.get(text(item.id)) ?? [],
          thumbnailUrl: includeMedia && media
            ? await signedUrl(
                text(media.storage_bucket),
                text(media.storage_path),
              )
            : null,
        };
      }),
    );
    const reviewQueuePromise = Promise.all(
      pulseItems
        .filter((item) => text(item.status) === "Ready for Review")
        .slice(0, 6)
        .map(async (item) => {
          const media = mediaByItem.get(text(item.id));
          return {
            id: text(item.id),
            title: contentTitle(item),
            format: text(item.format) || text(item.content_kind),
            date: text(item.scheduled_date) || null,
            time: text(item.scheduled_time).slice(0, 5) || null,
            platforms: platformsByItem.get(text(item.id)) ?? [],
            thumbnailUrl: includeMedia && media
              ? await signedUrl(
                  text(media.storage_bucket),
                  text(media.storage_path),
                )
              : null,
          };
        }),
    );
    const recentContentPromise = Promise.all(
      content
        .slice(0, 8)
        .map(async (item) => ({
          id: text(item.id),
          title: text(item.file_name) || "Final content",
          contentType: text(item.content_type),
          mediaType: text(item.media_type) || mediaType(text(item.mime_type)),
          createdAt: text(item.created_at),
          thumbnailUrl: includeMedia ? await signedUrl(
            text(item.storage_bucket),
            text(item.storage_path),
          ) : null,
        })),
    );

    const [upcoming, reviewQueue, recentContent] = await Promise.all([upcomingPromise, reviewQueuePromise, recentContentPromise]);

    const needsCaption = countWhere(
      socialItems,
      (item) => text(item.status) === "Needs Caption",
    );
    const stalePlanner = countWhere(
      socialItems,
      (item) => item.scheduled_payload_stale === true,
    );
    const blockedPlans = (monthlyItemsResult.data ?? []).length;
    const credentialReview = countWhere(
      (credentialsResult.data ?? []) as Row[],
      (item) => text(item.status) === "needs_review",
    );
    const attention = [
      needsCaption
        ? {
            id: "captions",
            title: `${needsCaption} post${needsCaption === 1 ? "" : "s"} need captions`,
            detail: "Publishing · loaded planning items",
            href: `/clients/${clientId}/social?tab=publishing`,
            tone: "warning" as const,
          }
        : null,
      stalePlanner
        ? {
            id: "planner-sync",
            title: `${stalePlanner} planner item${stalePlanner === 1 ? "" : "s"} need sync`,
            detail: "Publishing · loaded planning items",
            href: `/clients/${clientId}/social?tab=planner`,
            tone: "warning" as const,
          }
        : null,
      blockedPlans
        ? {
            id: "blocked-plan",
            title: `${blockedPlans} planned item${blockedPlans === 1 ? "" : "s"} blocked`,
            detail: "Monthly Plans",
            href: `/clients/${clientId}/social?tab=monthly_plans`,
            tone: "warning" as const,
          }
        : null,
      credentialReview
        ? {
            id: "credentials",
            title: `${credentialReview} credential${credentialReview === 1 ? "" : "s"} need review`,
            detail: "Client Brain",
            href: `/clients/${clientId}/brain`,
            tone: "neutral" as const,
          }
        : null,
      !logoUrl
        ? {
            id: "logo",
            title: "Canonical logo needs attention",
            detail: "Brand Guidelines",
            href: `/clients/${clientId}/brain`,
            tone: "neutral" as const,
          }
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    const recordUpdates = (recordUpdatesResult.data ?? []) as Row[];
    const activity = [
      ...((activityResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        title: activityLabel(text(row.action_type)),
        detail: "Social Media",
        createdAt: text(row.created_at),
        href: `/clients/${clientId}/social?tab=monthly_plans`,
      })),
      ...recentContent
        .slice(0, 2)
        .map((item) => ({
          id: `content-${item.id}`,
          title: "Final content added",
          detail: item.contentType.replace(/_/g, " "),
          createdAt: item.createdAt,
          href: `/clients/${clientId}/brain`,
        })),
      ...recordUpdates.map((row) => ({
        id: `record-${text(row.id)}`,
        title: `${text(row.title) || "Client Brain asset"} updated`,
        detail: text(row.top_section).replace(/_/g, " "),
        createdAt: text(row.updated_at),
        href: `/clients/${clientId}/brain`,
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6);

    const latestRecord = text(latestRecordResult.data?.updated_at) || null;
    const productCount = productCountResult.count ?? 0;
    const performanceFor = (platform: "instagram" | "facebook") => {
      const current = performanceRows.find(
        (row) =>
          text(row.platform) === platform &&
          text(row.period_key) === "current_30d",
      );
      const previous = performanceRows.find(
        (row) =>
          text(row.platform) === platform &&
          text(row.period_key) === "previous_30d",
      );
      if (!current) return null;
      const currentReach =
        typeof current.post_reach === "number" ? current.post_reach : null;
      const previousReach =
        typeof previous?.post_reach === "number" ? previous.post_reach : null;
      const trend =
        currentReach !== null && previousReach !== null && previousReach > 0
          ? ((currentReach - previousReach) / previousReach) * 100
          : null;
      return {
        followers:
          typeof current.followers === "number" ? current.followers : null,
        postReach: currentReach,
        views: typeof current.views === "number" ? current.views : null,
        engagements:
          typeof current.engagements === "number" ? current.engagements : null,
        trend,
        // The prior 30-day window travels with the current one so every headline
        // metric can state its own change, instead of reach alone carrying a
        // trend the other three silently lack.
        previous: previous
          ? {
              followers:
                typeof previous.followers === "number" ? previous.followers : null,
              postReach: previousReach,
              views: typeof previous.views === "number" ? previous.views : null,
              engagements:
                typeof previous.engagements === "number" ? previous.engagements : null,
            }
          : null,
      };
    };
    const lastSocialSync =
      performanceRows
        .map((row) => text(row.synced_at))
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    const dashboardMonth =
      text(currentMonth?.month_start) || currentMonthStart();
    const currentPlan =
      monthlyPlans.find((plan) => text(plan.plan_month) === dashboardMonth) ??
      monthlyPlans.find(
        (plan) => text(plan.plan_month) === currentMonthStart(),
      ) ??
      monthlyPlans[0] ??
      null;
    const currentPlanId = text(currentPlan?.id);
    const currentPlanApproved = text(currentPlan?.status) === "approved";
    const currentPlanItems = currentPlanId
      ? monthlyPlanItems.filter(
          (item) => text(item.monthly_plan_id) === currentPlanId,
        )
      : [];
    const currentArtifacts = currentPlanId
      ? productionArtifacts.filter(
          (item) => text(item.monthly_plan_id) === currentPlanId,
        )
      : [];
    const producedItemIds = new Set(
      currentArtifacts
        .filter((item) => ["generated", "selected"].includes(text(item.status)))
        .map((item) => text(item.monthly_plan_item_id))
        .filter(Boolean),
    );
    const blockedProduction = new Set(
      currentArtifacts
        .filter((item) => text(item.status) === "blocked")
        .map((item) => text(item.monthly_plan_item_id))
        .filter(Boolean),
    ).size;
    const staleProduction = new Set(
      currentArtifacts
        .filter((item) => text(item.status) === "stale")
        .map((item) => text(item.monthly_plan_item_id))
        .filter(Boolean),
    ).size;
    const captionedStatuses = new Set([
      "Ready for Review",
      "Approved",
      "Scheduled",
      "Publishing",
      "Published",
      "Failed",
    ]);
    const captionedCount = countWhere(pulseItems, (item) =>
      captionedStatuses.has(text(item.status)),
    );
    const reviewCount = countWhere(
      pulseItems,
      (item) => text(item.status) === "Ready for Review",
    );
    const scheduledItems = pulseItems.filter(
      (item) => text(item.status) === "Scheduled",
    );
    const executionStatusByItem = new Map<string, string>();
    for (const execution of providerExecutions) {
      const itemId = text(execution.social_content_item_id);
      if (itemId && !executionStatusByItem.has(itemId))
        executionStatusByItem.set(itemId, text(execution.status));
    }
    const confirmedExecutionStatuses = new Set([
      "scheduled",
      "publishing",
      "published",
      "partial",
    ]);
    const scheduledConfirmed = scheduledItems.filter((item) =>
      confirmedExecutionStatuses.has(
        executionStatusByItem.get(text(item.id)) ?? "",
      ),
    ).length;
    const [publishedResult, failedPublishingResult] = await Promise.all(
      ["Published", "Failed"].map(status => clientBrainV2ServerClient.from("social_content_items")
        .select("id", { count: "exact", head: true }).eq("client_id", clientId)
        .eq("social_content_month_id", text(currentMonth?.id) || "699a0a02-526c-5685-aaf6-b75afd9d3d8d")
        .eq("status", status))
    );
    if (publishedResult.error || failedPublishingResult.error)
      throw new ClientBrainV2HttpError("Unable to load publishing counts.", 500);
    const publishedCount = publishedResult.count ?? 0;
    const failedPublishing = failedPublishingResult.count ?? 0;
    const recoveryRequired = [...executionStatusByItem.values()].filter(
      (status) => status === "recovery_required" || status === "failed",
    ).length;
    const performanceSnapshotIds = ["instagram", "facebook"].map(platform =>
      performanceRows.find(row => text(row.platform) === platform && text(row.period_key) === "current_30d")
    ).filter(Boolean).map(row => text(row!.id));
    const postObservationResult = performanceSnapshotIds.length
      ? await clientBrainV2ServerClient
          .from("social_performance_post_observations")
          .select(
            "platform,provider_post_id,published_at,post_type,title,caption_excerpt,thumbnail_path,post_url,reach,views,interactions",
          )
          .eq("client_id", clientId)
          .in("snapshot_id", performanceSnapshotIds)
          .order("published_at", { ascending: false })
          .limit(160)
      : { data: [], error: null };
    if (postObservationResult.error)
      throw new ClientBrainV2HttpError(
        "Unable to load cached post observations.",
        500,
      );
    const postObservations = (postObservationResult.data ?? []) as Row[];
    // Ranked on reach alone. Falling back to views or interactions mixed three
    // different units into one ordering, so a post with views but no reach
    // outranked a genuine reach winner under a list labelled "by reach". A post
    // with no retained reach is not comparable and is left out.
    const metricValue = (row: Row) =>
      typeof row.reach === "number" ? row.reach : null;
    const rankedPosts = postObservations
      .filter((row) => metricValue(row) !== null)
      .sort(
        (left, right) =>
          (metricValue(right) ?? -Infinity) - (metricValue(left) ?? -Infinity),
      );
    // Overview ranks the leading posts, not just the single best one: one row
    // cannot show whether the top result is a pattern or an outlier. Capped at
    // five, and each row is measured against the median of its own platform.
    //
    // The observations table retains one row per sync, so the same post appears
    // repeatedly as its reach grows. Rank by post, not by observation, keeping
    // each post's strongest retained reading — rankedPosts is already sorted, so
    // the first occurrence of a key is that post's best.
    const postKey = (row: (typeof postObservations)[number]) =>
      `${text(row.platform)}::${text(row.provider_post_id) || text(row.post_url) || `${text(row.published_at)}::${text(row.title) || text(row.caption_excerpt)}`}`;
    const seenPosts = new Set<string>();
    const rankedUniquePosts = rankedPosts.filter((row) => {
      const key = postKey(row);
      if (seenPosts.has(key)) return false;
      seenPosts.add(key);
      return true;
    });
    const topPosts = rankedUniquePosts.slice(0, 5).map((row) => {
      const platform =
        text(row.platform) === "facebook"
          ? ("facebook" as const)
          : ("instagram" as const);
      // Median is per post, not per observation: counting every retained sync
      // of the same post would weight frequently-synced posts into the middle.
      const platformReach = rankedUniquePosts
        .filter(
          (item) =>
            text(item.platform) === platform && typeof item.reach === "number",
        )
        .map((item) => item.reach as number)
        .sort((left, right) => left - right);
      const platformMedian =
        platformReach.length >= 5
          ? sampleMedian(platformReach)
          : null;
      const reach = typeof row.reach === "number" ? row.reach : null;
      return {
        platform,
        publishedAt: text(row.published_at) || null,
        postType: text(row.post_type) || "Post",
        title: text(row.title) || null,
        captionExcerpt: text(row.caption_excerpt) || null,
        thumbnailUrl: text(row.thumbnail_path)
          ? `/api/clients/${clientId}/social-performance/thumbnail?path=${encodeURIComponent(text(row.thumbnail_path))}`
          : null,
        postUrl: text(row.post_url) || null,
        reach,
        views: typeof row.views === "number" ? row.views : null,
        interactions:
          typeof row.interactions === "number" ? row.interactions : null,
        reachVsMedian:
          reach !== null && platformMedian && platformMedian > 0
            ? reach / platformMedian
            : null,
      };
    });
    const topPost = topPosts[0] ?? null;
    const lastPublishedAt =
      postObservations
        .map((row) => text(row.published_at))
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    const plannedCount = currentPlanApproved ? currentPlanItems.length : 0;
    const bottleneck =
      reviewCount > 0 && captionedCount > 0 ? ("review" as const) : null;
    const nextStep = bottleneck
      ? "Approval is the remaining human gate before scheduling can continue."
      : !currentPlan
        ? "Create or select a monthly plan to begin the workflow."
        : !currentPlanApproved
          ? "Approve the monthly plan before production can move forward."
          : producedItemIds.size < plannedCount
            ? "Production is still completing for the approved plan."
            : captionedCount < producedItemIds.size
              ? "Caption work is the next dependency before review."
              : scheduledItems.length > 0 &&
                  scheduledConfirmed < scheduledItems.length
                ? "Scheduling is waiting for provider execution confirmation."
                : publishedCount > 0
                  ? "Published work is now collecting cached performance evidence."
                  : "No human bottleneck is currently recorded.";
    return {
      client: {
        id: text(client.id),
        name: text(client.name),
        industry: text(client.industry) || null,
        status: text(client.status),
        website: text(client.website) || null,
        logoUrl,
        logoName,
      },
      pulse: {
        monthStart: text(currentMonth?.month_start) || currentMonthStart(),
        label: formatMonth(
          text(currentMonth?.month_start) || currentMonthStart(),
        ),
        formats: countBy(pulseItems, "format", ["feed", "reel", "story"]),
        statuses: countBy(pulseItems, "status", [
          "Ready for Review",
          "Approved",
          "Scheduled",
          "Published",
        ]),
        next: upcoming[0]
          ? {
              id: upcoming[0].id,
              title: upcoming[0].title,
              date: upcoming[0].date,
              time: upcoming[0].time,
            }
          : null,
      },
      upcoming,
      reviewQueue,
      attention,
      content: recentContent,
      brain: {
        recordCount: brainRecordCountResult.count ?? 0,
        openGapCount: brainGapsResult.count ?? 0,
        products: productCount,
        assets: assetCountResult.count ?? 0,
        content: content.length,
        logins: countWhere(
          (credentialsResult.data ?? []) as Row[],
          (record) => text(record.status) !== "archived",
        ),
        brandGuidelines: brandGuidelineCountResult.count ?? 0,
        updatedAt: latestRecord,
      },
      activity,
      socialPerformance: {
        lastSyncedAt: lastSocialSync,
        instagram: performanceFor("instagram"),
        facebook: performanceFor("facebook"),
      },
      pipeline: {
        planned: {
          count: plannedCount,
          approvedAt: currentPlanApproved
            ? text(currentPlan?.approved_at) || null
            : null,
        },
        produced: {
          count: producedItemIds.size,
          blocked: blockedProduction,
          stale: staleProduction,
        },
        captioned: { count: captionedCount },
        review: { count: reviewCount },
        scheduled: {
          count: scheduledItems.length,
          executionConfirmed: scheduledConfirmed,
          missingExecution: Math.max(
            scheduledItems.length - scheduledConfirmed,
            0,
          ),
        },
        published: {
          count: publishedCount,
          failed: failedPublishing,
          recoveryRequired,
          reach: performanceFor("instagram")?.postReach ?? null,
        },
        bottleneck,
        nextStep,
      },
      performance: { topPost, topPosts, lastPublishedAt },
      brainGaps: brainGapRows.map((row) => ({
        id: text(row.id),
        title: text(row.title) || "Knowledge gap",
        detail: text(row.summary) || null,
        priority: text(row.priority) || null,
        href: `/clients/${clientId}/brain?section=intelligence&subsection=knowledge_gaps`,
      })),
    };
  });
}
