import "server-only";

import { clientBrainV2ServerClient as db } from "@/lib/client-brain-v2-server-core";
import { loadContentLineageReadModel } from "@/lib/content-lineage-server";
import { measureServerLoader } from "@/lib/server-performance";

type Row = Record<string, unknown>;

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const bool = (value: unknown) => value === true;
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};

export type AgencyContentTone =
  "neutral" | "info" | "warning" | "danger" | "ready" | "done";

export type AgencyContentRow = {
  id: string;
  source: "publishing" | "planner";
  clientId: string;
  clientName: string;
  initials: string;
  title: string;
  format: string;
  stateLabel: string;
  stateTone: AgencyContentTone;
  dueDate: string | null;
  cycleLabel: string;
  lane: "overdue" | "today" | "week" | "later" | "unscheduled";
  blocker: string;
  blockerTone: AgencyContentTone;
  blocked: boolean;
  readiness: {
    media: "complete" | "missing" | "not_applicable";
    caption: "complete" | "missing" | "not_applicable";
    approval: "complete" | "pending" | "missing" | "not_applicable";
  };
  action: {
    label: "Planner" | "Calendar" | "Studio" | "Tasks" | "Review";
    href: string;
  };
  provenance: string;
  lineage: {
    id: string | null;
    state: "linked" | "unlinked";
    cycleLabel: string | null;
    hasPublishingDraft: boolean;
  };
};

export type AgencyContentClientCoverage = {
  id: string;
  name: string;
  initials: string;
  publishingCount: number;
  plannerOnlyCount: number;
  blockedCount: number;
};

export type AgencyContentData = {
  generatedAt: string;
  rows: AgencyContentRow[];
  coverage: AgencyContentClientCoverage[];
};

function initials(name: string) {
  const values = name
    .split(/\s+/)
    .map((value) => value[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  return values || "?";
}

function monthLabel(value: string) {
  if (!/^\d{4}-\d{2}/.test(value)) return "Unassigned month";
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Unassigned month";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(date);
}

function dubaiToday() {
  const pieces = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    pieces.find((piece) => piece.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dayDelta(today: string, date: string) {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

function laneFor(dueDate: string | null, published: boolean, today: string) {
  if (!dueDate) return "unscheduled" as const;
  if (published) return "later" as const;
  const delta = dayDelta(today, dueDate);
  if (delta < 0) return "overdue" as const;
  if (delta === 0) return "today" as const;
  if (delta <= 7) return "week" as const;
  return "later" as const;
}

function contentLineagePlanItemId(value: unknown) {
  const context = record(value);
  const lineage = record(context.lineage);
  return text(lineage.monthlyPlanItemId);
}

function contentLineageArtifactId(value: unknown) {
  const context = record(value);
  const lineage = record(context.lineage);
  return text(lineage.individualProductionArtifactId);
}

function publishingStateTone(status: string): AgencyContentTone {
  if (status === "Published") return "done";
  if (["Approved", "Scheduled", "Publishing"].includes(status)) return "ready";
  if (status === "Failed") return "danger";
  if (status === "Ready for Review") return "warning";
  return "neutral";
}

function visiblePublishingTitle(value: unknown) {
  const title = text(value);
  // Some historical records carry an internal generated asset key rather than
  // editorial copy. Do not turn that implementation detail into a content
  // title in the operator view.
  if (
    !title ||
    /^(?:hf|img|image)[ _-]?\d{8}/i.test(title) ||
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(title)
  ) {
    return "Untitled publishing item";
  }
  return title;
}

/**
 * Agency-wide Content is deliberately a read model, not a new lifecycle.
 * Publishing records and planner concepts retain ownership of their own states.
 */
export async function loadAgencyContentData(): Promise<AgencyContentData> {
  return measureServerLoader("agency-content", 8, async () => {
    const [
      clientsResult,
      monthsResult,
      publishingResult,
      mediaResult,
      targetsResult,
      plansResult,
      planItemsResult,
      productionResult,
      lineage,
    ] = await Promise.all([
      db
        .from("clients")
        .select("id,name,status")
        .neq("status", "archived")
        .order("name")
        .limit(100),
      db
        .from("social_content_months")
        .select("id,client_id,month_start")
        .order("month_start", { ascending: false })
        .limit(1_000),
      db
        .from("social_content_items")
        .select(
          "id,client_id,social_content_month_id,source,content_kind,format,title,status,scheduled_date,final_caption,caption_approved_at,scheduled_payload_stale,content_context",
        )
        .order("scheduled_date", { ascending: true })
        .limit(2_000),
      db
        .from("social_content_media")
        .select("social_content_item_id")
        .limit(5_000),
      db
        .from("social_content_platform_targets")
        .select("social_content_item_id,selected,status")
        .limit(5_000),
      db
        .from("social_monthly_content_plans")
        .select("id,client_id,plan_month,status")
        .order("plan_month", { ascending: false })
        .limit(1_000),
      db
        .from("social_monthly_content_plan_items")
        .select(
          "id,client_id,monthly_plan_id,position,planned_date,pillar,subject,creative_concept,production_method,missing_asset_note,status",
        )
        .order("position")
        .limit(3_000),
      db
        .from("social_monthly_plan_production_artifacts")
        .select("id,monthly_plan_item_id,status,is_selected")
        .limit(3_000),
      loadContentLineageReadModel(),
    ]);

    const result = [
      clientsResult,
      monthsResult,
      publishingResult,
      mediaResult,
      targetsResult,
      plansResult,
      planItemsResult,
      productionResult,
    ].find((entry) => entry.error);
    if (result?.error) throw new Error("Agency Content could not be loaded.");

    const clientsById = new Map(
      ((clientsResult.data ?? []) as Row[]).map((client) => [
        text(client.id),
        { name: text(client.name), status: text(client.status) },
      ]),
    );
    const monthsById = new Map(
      ((monthsResult.data ?? []) as Row[]).map((month) => [
        text(month.id),
        {
          clientId: text(month.client_id),
          monthStart: text(month.month_start),
        },
      ]),
    );
    const plansById = new Map(
      ((plansResult.data ?? []) as Row[]).map((plan) => [
        text(plan.id),
        {
          clientId: text(plan.client_id),
          month: text(plan.plan_month),
          status: text(plan.status),
        },
      ]),
    );
    const mediaByItem = new Set(
      ((mediaResult.data ?? []) as Row[]).map((row) =>
        text(row.social_content_item_id),
      ),
    );
    const selectedTargetsByItem = new Map<string, Row[]>();
    for (const target of (targetsResult.data ?? []) as Row[]) {
      if (!bool(target.selected)) continue;
      const itemId = text(target.social_content_item_id);
      if (!itemId) continue;
      selectedTargetsByItem.set(itemId, [
        ...(selectedTargetsByItem.get(itemId) ?? []),
        target,
      ]);
    }
    const artifactPlanItemById = new Map<string, string>();
    const selectedArtifactByPlanItem = new Set<string>();
    for (const artifact of (productionResult.data ?? []) as Row[]) {
      const artifactId = text(artifact.id);
      const planItemId = text(artifact.monthly_plan_item_id);
      if (artifactId && planItemId)
        artifactPlanItemById.set(artifactId, planItemId);
      if (bool(artifact.is_selected) && planItemId)
        selectedArtifactByPlanItem.add(planItemId);
    }

    const today = dubaiToday();
    const linkedPlanItemIds = new Set<string>();
    const rows: AgencyContentRow[] = [];

    for (const item of (publishingResult.data ?? []) as Row[]) {
      const clientId = text(item.client_id);
      const client = clientsById.get(clientId);
      if (!client) continue;
      const itemId = text(item.id);
      const directPlanItemId = contentLineagePlanItemId(item.content_context);
      const artifactPlanItemId = artifactPlanItemById.get(
        contentLineageArtifactId(item.content_context),
      );
      if (directPlanItemId) linkedPlanItemIds.add(directPlanItemId);
      if (artifactPlanItemId) linkedPlanItemIds.add(artifactPlanItemId);

      const status = text(item.status) || "Draft";
      const dueDate = text(item.scheduled_date) || null;
      const hasMedia = mediaByItem.has(itemId);
      const hasCaption = Boolean(text(item.final_caption));
      const selectedTargets = selectedTargetsByItem.get(itemId) ?? [];
      const approved = [
        "Approved",
        "Scheduled",
        "Publishing",
        "Published",
      ].includes(status);
      const published = status === "Published";
      const stale = bool(item.scheduled_payload_stale);
      let blocker = "On track";
      let blockerTone: AgencyContentTone = "neutral";
      let action: AgencyContentRow["action"] = {
        label: "Calendar",
        href: `/clients/${clientId}/social`,
      };

      if (status === "Failed") {
        blocker = "Publishing requires review";
        blockerTone = "danger";
      } else if (stale) {
        blocker = "Calendar handoff is stale";
        blockerTone = "warning";
      } else if (!hasMedia) {
        blocker = "No final media";
        blockerTone = "danger";
        action = {
          label: "Studio",
          href: `/clients/${clientId}/ai-content/studio`,
        };
      } else if (item.content_kind !== "story" && !hasCaption) {
        blocker = "No final caption";
        blockerTone = "warning";
      } else if (status === "Ready for Review") {
        blocker = "Awaiting review";
        blockerTone = "warning";
      } else if (approved && selectedTargets.length === 0) {
        blocker = "No platform target selected";
        blockerTone = "warning";
      } else if (!dueDate) {
        blocker = "Needs a publish date";
        blockerTone = "info";
      } else if (published) {
        blocker = "Published";
        blockerTone = "done";
      } else if (status === "Approved") {
        blocker = "Ready for scheduling";
        blockerTone = "ready";
      } else if (["Scheduled", "Publishing"].includes(status)) {
        blocker = status === "Scheduled" ? "Scheduled" : "Publishing";
        blockerTone = "ready";
      }

      const month = monthsById.get(text(item.social_content_month_id));
      const canonicalLineage = lineage.bySocialContentItemId.get(itemId);
      if (canonicalLineage) {
        if (!canonicalLineage.hasMedia) {
          blocker = "Media needed";
          blockerTone = "danger";
          action = { label: "Studio", href: `/clients/${clientId}/ai-content/studio` };
        } else if (!canonicalLineage.hasPublishingDraft) {
          blocker = "Prepare publishing draft";
          blockerTone = "info";
          action = { label: "Calendar", href: `/clients/${clientId}/social` };
        } else if (!canonicalLineage.hasCaption) {
          blocker = "Caption needed";
          blockerTone = "warning";
          action = { label: "Calendar", href: `/clients/${clientId}/social` };
        } else if (["none", "stale", "superseded"].includes(canonicalLineage.reviewStatus)) {
          blocker = "Ready for review";
          blockerTone = "warning";
          action = { label: "Review", href: `/clients/${clientId}/content-review` };
        } else if (canonicalLineage.reviewStatus === "ready") {
          blocker = "Ready for review";
          blockerTone = "warning";
          action = { label: "Review", href: `/clients/${clientId}/content-review` };
        } else if (canonicalLineage.executionState === "published") {
          blocker = canonicalLineage.linkedObservationCount
            ? `Published · ${canonicalLineage.linkedObservationCount} linked observation${canonicalLineage.linkedObservationCount === 1 ? "" : "s"}`
            : "Published · no cached observation yet";
          blockerTone = "done";
        } else if (["scheduled", "publishing", "partial", "failed", "recovery_required", "cancelled"].includes(canonicalLineage.executionState)) {
          blocker = `Execution · ${canonicalLineage.executionState.replace(/_/g, " ")}`;
          blockerTone = ["failed", "recovery_required", "cancelled"].includes(canonicalLineage.executionState) ? "danger" : canonicalLineage.executionState === "partial" ? "warning" : "ready";
        } else if (canonicalLineage.executionState === "prepared") {
          blocker = "Dry-run execution prepared";
          blockerTone = "ready";
        } else if (canonicalLineage.publishingHandoff === "linked") {
          blocker = "Scheduling linked";
          blockerTone = "ready";
        } else {
          blocker = "Review approved";
          blockerTone = "ready";
          action = { label: "Review", href: `/clients/${clientId}/content-review` };
        }
      }
      rows.push({
        id: `publishing:${itemId}`,
        source: "publishing",
        clientId,
        clientName: client.name,
        initials: initials(client.name),
        title: visiblePublishingTitle(item.title),
        format: `${text(item.content_kind) || "content"} · ${text(item.format) || "format"}`,
        stateLabel: canonicalLineage ? `Lineage · ${blocker}` : `Publishing · ${status}`,
        stateTone: publishingStateTone(status),
        dueDate,
        cycleLabel: month ? monthLabel(month.monthStart) : "Month not linked",
        lane: laneFor(dueDate, published, today),
        blocker,
        blockerTone,
        blocked: ["warning", "danger"].includes(blockerTone),
        readiness: {
          media: canonicalLineage ? (canonicalLineage.hasMedia ? "complete" : "missing") : hasMedia ? "complete" : "missing",
          caption:
            item.content_kind === "story"
              ? "not_applicable"
              : canonicalLineage ? (canonicalLineage.hasCaption ? "complete" : "missing") : hasCaption
                ? "complete"
                : "missing",
          approval:
            canonicalLineage?.reviewStatus === "approved" || canonicalLineage?.publishingHandoff === "linked"
              ? "complete"
              : published || approved
              ? "complete"
              : status === "Ready for Review"
                ? "pending"
                : "missing",
        },
        action,
        provenance:
          canonicalLineage
            ? "Canonical lineage link"
            : directPlanItemId || artifactPlanItemId
            ? "Publishing item linked to a planner concept"
            : "Publishing item without a linked planner concept",
        lineage: {
          id: canonicalLineage?.id ?? null,
          state: canonicalLineage ? "linked" : "unlinked",
          cycleLabel: canonicalLineage?.cycleKey ?? null,
          hasPublishingDraft: canonicalLineage?.hasPublishingDraft ?? false,
        },
      });
    }

    for (const item of (planItemsResult.data ?? []) as Row[]) {
      const planItemId = text(item.id);
      if (!planItemId || linkedPlanItemIds.has(planItemId)) continue;
      const clientId = text(item.client_id);
      const client = clientsById.get(clientId);
      const plan = plansById.get(text(item.monthly_plan_id));
      if (!client || !plan) continue;
      const itemStatus = text(item.status) || "draft";
      const planApproved = plan.status === "approved";
      const selectedProduction = selectedArtifactByPlanItem.has(planItemId);
      const missingAssetNote = text(item.missing_asset_note);
      let blocker = "Needs visual production";
      let blockerTone: AgencyContentTone = "info";
      let action: AgencyContentRow["action"] = {
        label: "Studio",
        href: `/clients/${clientId}/ai-content/studio`,
      };
      if (!planApproved) {
        blocker = "Monthly plan approval required";
        blockerTone = "warning";
        action = { label: "Planner", href: `/clients/${clientId}/planner` };
      } else if (itemStatus === "blocked") {
        blocker = missingAssetNote || "Planner concept is blocked";
        blockerTone = "danger";
        action = { label: "Planner", href: `/clients/${clientId}/planner` };
      } else if (selectedProduction) {
        blocker = "Selected visual is not linked to publishing";
        blockerTone = "info";
      } else if (itemStatus === "draft") {
        blocker = "Planner concept needs detail";
        blockerTone = "warning";
        action = { label: "Planner", href: `/clients/${clientId}/planner` };
      }
      const dueDate = text(item.planned_date) || null;
      const canonicalLineage = lineage.byPlanItemId.get(planItemId);
      if (canonicalLineage) {
        if (!canonicalLineage.hasMedia) {
          blocker = "Media needed";
          blockerTone = "danger";
          action = { label: "Studio", href: `/clients/${clientId}/ai-content/studio` };
        } else if (!canonicalLineage.hasPublishingDraft) {
          blocker = "Prepare publishing draft";
          blockerTone = "info";
          action = { label: "Calendar", href: `/clients/${clientId}/social` };
        } else if (!canonicalLineage.hasCaption) {
          blocker = "Caption needed";
          blockerTone = "warning";
          action = { label: "Calendar", href: `/clients/${clientId}/social` };
        } else if (canonicalLineage.reviewStatus === "approved") {
          if (canonicalLineage.executionState === "published") {
            blocker = canonicalLineage.linkedObservationCount
              ? `Published · ${canonicalLineage.linkedObservationCount} linked observation${canonicalLineage.linkedObservationCount === 1 ? "" : "s"}`
              : "Published · no cached observation yet";
            blockerTone = "done";
          } else if (["scheduled", "publishing", "partial", "failed", "recovery_required", "cancelled"].includes(canonicalLineage.executionState)) {
            blocker = `Execution · ${canonicalLineage.executionState.replace(/_/g, " ")}`;
            blockerTone = ["failed", "recovery_required", "cancelled"].includes(canonicalLineage.executionState) ? "danger" : canonicalLineage.executionState === "partial" ? "warning" : "ready";
          } else if (canonicalLineage.executionState === "prepared") {
            blocker = "Dry-run execution prepared";
            blockerTone = "ready";
          } else {
            blocker = canonicalLineage.publishingHandoff === "linked" ? "Scheduling linked" : "Review approved";
            blockerTone = "ready";
          }
          action = { label: "Review", href: `/clients/${clientId}/content-review` };
        } else {
          blocker = "Ready for review";
          blockerTone = "warning";
          action = { label: "Review", href: `/clients/${clientId}/content-review` };
        }
      }
      rows.push({
        id: `planner:${planItemId}`,
        source: "planner",
        clientId,
        clientName: client.name,
        initials: initials(client.name),
        title:
          text(item.subject) ||
          text(item.creative_concept) ||
          "Untitled planner concept",
        format: `Planner concept · ${text(item.production_method).replace(/_/g, " ") || "method not set"}`,
        stateLabel: `Planner · ${itemStatus.replace(/_/g, " ")}`,
        stateTone:
          itemStatus === "blocked"
            ? "danger"
            : planApproved
              ? "info"
              : "warning",
        dueDate,
        cycleLabel: monthLabel(plan.month),
        lane: laneFor(dueDate, false, today),
        blocker,
        blockerTone,
        blocked: ["warning", "danger"].includes(blockerTone),
        readiness: {
          media: canonicalLineage ? (canonicalLineage.hasMedia ? "complete" : "missing") : selectedProduction ? "complete" : "missing",
          caption: canonicalLineage ? (canonicalLineage.hasCaption ? "complete" : "missing") : "not_applicable",
          approval: canonicalLineage?.reviewStatus === "approved" ? "complete" : planApproved ? "complete" : "pending",
        },
        action,
        provenance: canonicalLineage
          ? "Canonical lineage link"
          : "Planner concept without a canonical publishing-item link",
        lineage: {
          id: canonicalLineage?.id ?? null,
          state: canonicalLineage ? "linked" : "unlinked",
          cycleLabel: canonicalLineage?.cycleKey ?? null,
          hasPublishingDraft: canonicalLineage?.hasPublishingDraft ?? false,
        },
      });
    }

    rows.sort((left, right) => {
      const leftDate = left.dueDate ?? "9999-12-31";
      const rightDate = right.dueDate ?? "9999-12-31";
      return (
        leftDate.localeCompare(rightDate) ||
        left.title.localeCompare(right.title)
      );
    });

    const coverage = [...clientsById.entries()]
      .map(([id, client]) => {
        const clientRows = rows.filter((row) => row.clientId === id);
        return {
          id,
          name: client.name,
          initials: initials(client.name),
          publishingCount: clientRows.filter(
            (row) => row.source === "publishing",
          ).length,
          plannerOnlyCount: clientRows.filter((row) => row.source === "planner")
            .length,
          blockedCount: clientRows.filter((row) => row.blocked).length,
        };
      })
      .filter((client) => client.publishingCount || client.plannerOnlyCount);

    return { generatedAt: new Date().toISOString(), rows, coverage };
  });
}
