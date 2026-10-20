import "server-only";
import { isClientDiscoverable } from "@/lib/client-discovery";
import { providerSnapshotHealth } from "@/lib/home-provider-health";
import { homeFinanceTotals, allocatedRevenueByClient } from "@/lib/home-finance-integrity";

import { createHash } from "crypto";

import { loadFinanceSnapshot } from "@/lib/finance-costs-server";
import { monthlyCost, type FinanceSnapshot } from "@/lib/finance-costs";
import {
  clientBrainV2ServerClient as db,
  isUuid,
} from "@/lib/client-brain-v2-server-core";
import {
  HOME_TASK_PRIORITIES,
  HOME_TASK_STATUSES,
  type HomeDashboardData,
  type HomeSuggestion,
  type HomeTask,
  type HomeTaskAction,
  type HomeTaskPriority,
  type HomeTaskStatus,
  type SocialDeltaMode,
} from "@/lib/home-dashboard";
import { measureServerLoader } from "@/lib/server-performance";
import {
  isTaskBoardStatus,
} from "@/lib/tasks-board";
import {
  compareMetric,
  readMetric,
} from "@/lib/social-analytics-metrics";
import type {
  SocialPerformancePlatform,
  SocialPerformanceSnapshot,
} from "@/lib/social-performance";

type Row = Record<string, unknown>;
type Candidate = HomeSuggestion;
const taskColumns =
  "id,title,description,status,priority,due_at,completed_at,reviewed_at,archived_at,client_id,linked_object_type,linked_object_id,origin,source,evidence,source_evidence_hash,dedupe_identity,manual_order,created_at,updated_at";
const priorityRank: Record<HomeTaskPriority, number> = { p1: 0, p2: 1, p3: 2 };

type FinanceSuggestionSummary = {
  selectedMonth: string;
  overdueInvoiceCount: number;
  unresolvedRevenueCount: number;
  overdueRevenueAed: number | null;
  unresolvedRevenueAed: number | null;
};

type SuggestionState = {
  finance: { summary: FinanceSuggestionSummary };
  roadmap: {
    activeBlockers: Array<{
      id: string;
      title: string;
      updated_at: string;
      blocker_reason: string | null;
      priority: string;
    }>;
  };
  reviewRecords: Row[];
  proposals: Row[];
  agentRuns: Row[];
  artifacts: Row[];
};

type HomeRoadmapSummary = {
  activeBlockers: Array<{ id: string; title: string; updated_at: string; blocker_reason: string | null; priority: string }>;
  totalProgress: number;
  buildPoints: number;
  primary: { title: string; progress: number; blockerReason: string | null } | null;
  next: { title: string } | null;
  phases: Array<{
    id: string;
    name: string;
    status: string;
    done: number;
    total: number;
    progress: number;
  }>;
  activePhase: { name: string; index: number; total: number } | null;
  capabilities: Array<{
    id: string;
    title: string;
    reward: string | null;
    status: "done" | "active" | "next" | "locked";
    stepsDone: number;
    stepsTotal: number;
    progress: number;
    blockedReason: string | null;
  }>;
  momentum: { shippedThisWeek: number; streakWeeks: number };
};

type HomeMoney = HomeDashboardData["money"];
type HomeNotification = HomeDashboardData["notifications"][number];

type SocialSnapshotRow = {
  provider_account_id: string;
  client_id: string;
  platform: SocialPerformancePlatform;
  period_key: "current_30d" | "previous_30d" | string;
  period_start: string;
  period_end: string;
  followers: number | null;
  post_reach: number | null;
  impressions: number | null;
  views: number | null;
  engagements: number | null;
  engagement_rate: number | null;
  link_clicks: number | null;
  posts_count: number | null;
  synced_at: string;
};

export class HomeDashboardError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const asRecord = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const valueArray = (value: unknown) => (Array.isArray(value) ? value : []);
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const todayDubai = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
    new Date(),
  );
const dayOf = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
        new Date(value),
      )
    : null;

function sentenceCase(value: string | null | undefined) {
  const normalized = text(value).replace(/[_-]+/g, " ");
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : null;
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(value: string) {
  const start = `${value}-01`;
  const [year, month] = value.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function recurringInMonth(
  row: { active: boolean; billing_cycle: string; start_date: string | null; end_date?: string | null },
  month: string,
) {
  const { start, end } = monthBounds(month);
  return (
    row.active &&
    row.billing_cycle !== "one_off" &&
    (!row.start_date || row.start_date <= end) &&
    (!row.end_date || row.end_date >= start)
  );
}

function recordInMonth(
  row: {
    active: boolean;
    billing_cycle: string;
    start_date: string | null;
    end_date?: string | null;
    expense_date?: string | null;
  },
  month: string,
) {
  if (!row.active) return false;
  if (row.billing_cycle !== "one_off") return recurringInMonth(row, month);
  const { start, end } = monthBounds(month);
  const date = row.expense_date ?? row.start_date;
  return Boolean(date && date >= start && date <= end);
}

function eurValue(
  amount: number,
  currency: string,
  rate: number | null,
) {
  if (currency === "EUR") return amount;
  if (currency === "AED" && rate !== null) return amount * rate;
  return null;
}

function projectionForMonth(snapshot: FinanceSnapshot, month: string) {
  const committed = snapshot.upcomingRevenue.filter(
    (row) => row.status === "upcoming" && row.expected_start_date.startsWith(month),
  );
  // Keep the same active-opportunity definition used by Finance's
  // potentialPipelineEur calculation: won and lost rows are not pipeline.
  const pipeline = snapshot.pipeline.filter(
    (row) =>
      row.stage !== "won" &&
      row.stage !== "lost" &&
      row.expected_start_date?.startsWith(month),
  );
  // A projection is meaningful only when both independently sourced halves
  // exist. An empty half is not silently represented as a zero forecast.
  if (!committed.length || !pipeline.length) return null;

  const convert = (amount: number, currency: string) =>
    Number.isFinite(amount) && amount >= 0
      ? eurValue(amount, currency, snapshot.settings.aed_eur_rate)
      : null;
  const committedAmounts = committed.map((row) => convert(row.net_amount, row.currency));
  const pipelineAmounts = pipeline.map((row) => convert(row.net_amount, row.currency));
  // No FX conversion is inferred. If any contributing row cannot be expressed
  // in Finance's EUR display currency, the combined projection stays unknown.
  if (committedAmounts.some((amount) => amount === null) || pipelineAmounts.some((amount) => amount === null)) return null;

  const committedEur = committedAmounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const resolvedPipeline = pipeline.map((row, index) => ({
    amountEur: pipelineAmounts[index] ?? 0,
    probability: row.probability,
  }));
  const probabilityKnown = resolvedPipeline.every(
    (row) => row.probability !== null && Number.isFinite(row.probability) && row.probability >= 0 && row.probability <= 100,
  );
  const pipelineEur = resolvedPipeline.reduce((sum, row) => sum + row.amountEur, 0);
  const totalPipelineEur = pipelineEur;
  // Confidence = sum(net_amount_EUR × probability) / sum(net_amount_EUR),
  // across this month's contributing pipeline rows; omit it if any probability
  // is absent or the contributing pipeline has no value to weight.
  const confidencePct = probabilityKnown && totalPipelineEur > 0
    ? resolvedPipeline.reduce((sum, row) => sum + row.amountEur * (row.probability ?? 0), 0) / totalPipelineEur
    : null;
  const weightedPipelineEur = probabilityKnown
    ? resolvedPipeline.reduce((sum, row) => sum + row.amountEur * ((row.probability ?? 0) / 100), 0)
    : null;

  return { committedEur, pipelineEur, confidencePct, weightedPipelineEur };
}

/**
 * How far forward the month switcher may step.
 *
 * Walks forward one month at a time and stops at the first month with no real
 * two-sided projection, so every reachable future month renders an actual
 * forecast. The user is never stepped onto a month that can only say "No data".
 */
function forecastHorizon(snapshot: FinanceSnapshot, currentMonth: string) {
  let horizon = currentMonth;
  for (let ahead = 1; ahead <= 24; ahead += 1) {
    const month = shiftMonth(currentMonth, ahead);
    if (!projectionForMonth(snapshot, month)) break;
    horizon = month;
  }
  return horizon;
}

/**
 * The Finance snapshot already contains normalized source records. Reusing
 * those records avoids a second Finance loader just to compare the prior
 * calendar month, while preserving the exact recurring-record semantics used
 * by Finance for the current snapshot.
 */
function comparableFinancePeriod(snapshot: FinanceSnapshot, month: string) {
  const income = snapshot.income.filter((row) => recordInMonth(row, month));
  const expenses = snapshot.expenses.filter((row) => recordInMonth(row, month));
  const { end } = monthBounds(month);
  const subscriptions = snapshot.subscriptions.filter(
    (row) => row.status === "active" && (!row.start_date || row.start_date <= end),
  );
  if (!income.length && !expenses.length && !subscriptions.length) return null;

  const toEur = (rows: Array<{ amount: number; currency: string }>) =>
    rows.reduce<number | null>((sum, row) => {
      const converted = eurValue(row.amount, row.currency, snapshot.settings.aed_eur_rate);
      return sum === null || converted === null ? null : sum + converted;
    }, 0);
  const revenueEur = toEur(
    income.map((row) => ({ amount: row.net_amount, currency: row.currency })),
  );
  const expensesEur = toEur([
    ...expenses.map((row) => ({ amount: row.net_amount, currency: row.currency })),
    ...subscriptions.map((row) => ({ amount: monthlyCost(row), currency: row.currency })),
  ]);
  return {
    month,
    revenueEur,
    expensesEur,
    profitEur:
      revenueEur === null || expensesEur === null ? null : revenueEur - expensesEur,
  };
}

/**
 * Keeps the Home Finance block faithful to Finance's calculated snapshot while
 * intentionally exposing only the small operator-facing slice the dashboard
 * needs. Prefer settled business-bank records; when none exist, the feed
 * falls back to canonical Finance records and labels their payment state so
 * planned revenue or committed costs are never represented as settled cash.
 */
export function homeMoneyFromFinanceSnapshot(snapshot: FinanceSnapshot): HomeMoney {
  const { summary } = snapshot;
  const projection = projectionForMonth(snapshot, summary.selectedMonth);
  const currentMonth = todayDubai().slice(0, 7);
  const bankTransactions = snapshot.bankTransactions
    .filter(
      (row) =>
        row.transaction_date.startsWith(summary.selectedMonth) &&
        row.scope === "business" &&
        ["confirmed", "reconciled"].includes(row.classification_status),
    )
    .map((row) => {
      const signedAmount = Number(row.signed_amount ?? 0);
      const credit = Number(row.credit ?? 0);
      const debit = Number(row.debit ?? 0);
      const direction: "in" | "out" =
        credit > 0 || (credit === 0 && signedAmount > 0) ? "in" : "out";
      const amount = Math.abs(
        direction === "in"
          ? credit || signedAmount
          : debit || signedAmount,
      );
      return {
        id: row.id,
        direction,
        name: row.merchant || row.description || "Recorded bank transaction",
        detail:
          sentenceCase(row.category) ||
          (row.classification_status === "reconciled"
            ? "Reconciled bank transaction"
            : "Confirmed bank transaction"),
        date: row.transaction_date,
        amount,
        currency: row.currency,
      };
    })
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
  const fallbackTransactions = [
    ...snapshot.income
      .filter((row) => recordInMonth(row, summary.selectedMonth))
      .map((row) => ({
        id: `income:${row.id}`,
        direction: "in" as const,
        name: row.counterparty_name || "Income record",
        detail: `${sentenceCase(row.payment_status) || "Recorded"} revenue record`,
        date:
          row.payment_date ?? row.due_date ?? row.next_billing_date ?? row.start_date,
        amount: row.net_amount,
        currency: row.currency,
      })),
    ...snapshot.expenses
      .filter((row) => recordInMonth(row, summary.selectedMonth))
      .map((row) => ({
        id: `expense:${row.id}`,
        direction: "out" as const,
        name: row.vendor || "Expense record",
        detail: `${sentenceCase(row.payment_status) || "Recorded"} expense`,
        date: row.payment_date ?? row.expense_date ?? row.next_deduction_date ?? row.start_date,
        amount: row.net_amount,
        currency: row.currency,
      })),
    ...snapshot.subscriptions
      .filter(
        (row) =>
          row.status === "active" &&
          (!row.start_date || row.start_date <= monthBounds(summary.selectedMonth).end),
      )
      .map((row) => ({
        id: `subscription:${row.id}`,
        direction: "out" as const,
        name: row.vendor || "Active subscription",
        detail: "Configured subscription · payment not verified",
        date:
          row.billing_date_known && row.billing_day
            ? `${summary.selectedMonth}-${String(Math.min(row.billing_day, Number(monthBounds(summary.selectedMonth).end.slice(-2)))).padStart(2, "0")}`
            : null,
        amount: monthlyCost(row),
        currency: row.currency,
      })),
  ]
    .filter((row) => row.amount > 0)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 30);
  const transactions = bankTransactions.length ? bankTransactions : fallbackTransactions;
  const previous = comparableFinancePeriod(
    snapshot,
    shiftMonth(summary.selectedMonth, -1),
  );
  const history = Array.from({ length: 6 }, (_, index) => {
    const month = shiftMonth(summary.selectedMonth, index - 5);
    const forecast = month > currentMonth ? projectionForMonth(snapshot, month) : null;
    const period = month > currentMonth
      ? forecast?.weightedPipelineEur !== null && forecast?.weightedPipelineEur !== undefined
        ? { revenueEur: forecast.committedEur + forecast.weightedPipelineEur }
        : null
      : month === summary.selectedMonth
        ? { revenueEur: summary.revenueEur }
        : comparableFinancePeriod(snapshot, month);
    return {
      month,
      revenueEur: period?.revenueEur ?? null,
      // Only a future month with a real two-sided Finance projection is a
      // forecast point. Actual and unavailable points are never tagged so.
      isProjected: month > currentMonth && forecast?.weightedPipelineEur !== null && forecast?.weightedPipelineEur !== undefined,
    };
  });

  return {
    currency: "AED",
    month: summary.selectedMonth,
    ...homeFinanceTotals(summary.selectedMonth > currentMonth, {
      revenueEur: summary.revenueEur,
      expensesEur: summary.knownOperatingCostsEur,
      profitEur: summary.profitEur,
    }, projection),
    previous,
    history,
    projection,
    forecastHorizonMonth: forecastHorizon(snapshot, currentMonth),
    expectedAed: summary.expectedRevenueAed,
    collectedAed: summary.collectedRevenueAed,
    availableOwnerDrawAed: summary.availableOwnerDrawAed,
    committedAed: summary.committedBusinessExpensesAed,
    nextCharge: summary.upcomingExpenses[0]
      ? {
          label: summary.upcomingExpenses[0].vendor,
          amountAed: summary.upcomingExpenses[0].amountAed,
          date: summary.upcomingExpenses[0].deductionDate,
        }
      : null,
    unresolvedCount:
      summary.overdueInvoiceCount +
      summary.unresolvedRevenueCount +
      summary.bankReviewCount,
    unresolvedLabel: summary.overdueInvoiceCount
      ? `${summary.overdueInvoiceCount} overdue invoice${summary.overdueInvoiceCount === 1 ? "" : "s"}`
      : summary.bankReviewCount
        ? `${summary.bankReviewCount} bank item${summary.bankReviewCount === 1 ? "" : "s"} need review`
        : summary.unresolvedRevenueCount
          ? `${summary.unresolvedRevenueCount} revenue item${summary.unresolvedRevenueCount === 1 ? "" : "s"} unresolved`
          : null,
    costSegments: summary.expenseCategoryBreakdown
      .filter((item) => item.amountAed > 0)
      .slice(0, 5),
    transactions,
    activitySource: bankTransactions.length
      ? "settled_bank_records"
      : fallbackTransactions.length
        ? "finance_records"
        : "no_records",
    outstandingReceivables: summary.outstandingReceivableTotals,
  };
}

export async function getHomeFinanceData(month?: string): Promise<HomeMoney> {
  return homeMoneyFromFinanceSnapshot(await loadFinanceSnapshot(month));
}
const optionalIso = (value: unknown) => {
  const candidate = text(value);
  if (!candidate) return null;
  if (Number.isNaN(new Date(candidate).getTime()))
    throw new HomeDashboardError("Due date is invalid.");
  return new Date(candidate).toISOString();
};
function priority(
  value: unknown,
  fallback: HomeTaskPriority = "p3",
): HomeTaskPriority {
  return HOME_TASK_PRIORITIES.includes(value as HomeTaskPriority)
    ? (value as HomeTaskPriority)
    : fallback;
}
function taskStatus(value: unknown): HomeTaskStatus {
  return HOME_TASK_STATUSES.includes(value as HomeTaskStatus)
    ? (value as HomeTaskStatus)
    : "not_started";
}
function rowTask(row: Row, clientNames: Map<string, string>): HomeTask {
  const clientId = text(row.client_id) || null;
  return {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description) || null,
    status: taskStatus(row.status),
    priority: priority(row.priority),
    due_at: text(row.due_at) || null,
    completed_at: text(row.completed_at) || null,
    reviewed_at: text(row.reviewed_at) || null,
    archived_at: text(row.archived_at) || null,
    client_id: clientId,
    client_name: clientId ? (clientNames.get(clientId) ?? null) : null,
    linked_object_type: text(row.linked_object_type) || null,
    linked_object_id: text(row.linked_object_id) || null,
    origin: row.origin === "suggested" ? "suggested" : "manual",
    source: asRecord(row.source),
    evidence: asRecord(row.evidence),
    source_evidence_hash: text(row.source_evidence_hash) || null,
    dedupe_identity: text(row.dedupe_identity) || null,
    manual_order: Number(row.manual_order ?? 0),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}
function candidate(input: Omit<HomeSuggestion, "id" | "evidenceHash">) {
  const evidenceHash = hash(input.evidence);
  return {
    ...input,
    id: `${input.dedupeIdentity}:${evidenceHash.slice(0, 12)}`,
    evidenceHash,
  };
}
function titleFromArtifact(value: unknown) {
  const first = valueArray(value)[0];
  if (typeof first === "string") return first.slice(0, 140);
  const record = asRecord(first);
  return (
    text(record.title) ||
    text(record.recommendation) ||
    "Review Social Intelligence recommendation"
  );
}
function candidateOrder(a: Candidate, b: Candidate) {
  return (
    priorityRank[a.priority] - priorityRank[b.priority] ||
    a.title.localeCompare(b.title)
  );
}

export async function clientLogoUrls(logoRows: Row[]) {
  const logoRecordByClient = new Map<string, string>();
  for (const row of logoRows) {
    const clientId = text(row.client_id);
    const editorData = asRecord(asRecord(row.metadata).editor_data);
    const logos = valueArray(editorData.logos).map(asRecord);
    const primary =
      logos.find((item) => text(item.role) === "light_wordmark") ??
      logos.find((item) => text(item.role) === "wordmark") ??
      logos[0];
    const recordId = primary ? text(primary.assetId) : "";
    if (clientId && recordId && !logoRecordByClient.has(clientId))
      logoRecordByClient.set(clientId, recordId);
  }
  const recordIds = [...new Set(logoRecordByClient.values())];
  if (!recordIds.length) return new Map<string, string>();
  const assignments = await db
    .from("client_brain_v2_record_files")
    .select("record_id,file_object_id,sort_order")
    .in("record_id", recordIds)
    .order("sort_order");
  if (assignments.error) return new Map<string, string>();
  const fileIdByRecord = new Map<string, string>();
  for (const assignment of assignments.data ?? []) {
    const recordId = text(assignment.record_id);
    const fileId = text(assignment.file_object_id);
    if (recordId && fileId && !fileIdByRecord.has(recordId))
      fileIdByRecord.set(recordId, fileId);
  }
  const fileIds = [...new Set(fileIdByRecord.values())];
  if (!fileIds.length) return new Map<string, string>();
  const files = await db
    .from("client_brain_file_objects")
    .select("id,storage_bucket,storage_path")
    .in("id", fileIds);
  if (files.error) return new Map<string, string>();
  const fileById = new Map(
    (files.data ?? []).map((file) => [text(file.id), file]),
  );
  const resolved = await Promise.all(
    [...logoRecordByClient].map(async ([clientId, recordId]) => {
      const file = fileById.get(fileIdByRecord.get(recordId) ?? "");
      if (!file) return [clientId, null] as const;
      const { data } = await db.storage
        .from(text(file.storage_bucket))
        .createSignedUrl(text(file.storage_path), 60 * 60);
      return [clientId, data?.signedUrl ?? null] as const;
    }),
  );
  return new Map(
    resolved.filter((entry): entry is readonly [string, string] =>
      Boolean(entry[1]),
    ),
  );
}

async function loadHomeRoadmapSummary(): Promise<HomeRoadmapSummary> {
  return measureServerLoader("home.roadmap-summary", 3, async () => {
    const project = await db.from("roadmap_projects").select("id").eq("slug", "jarvis-os").maybeSingle();
    if (project.error || !project.data?.id) throw new HomeDashboardError("Roadmap summary could not be loaded.", 503);
    const [phases, items] = await Promise.all([
      db.from("roadmap_phases").select("id,name,weight,release_status,sort_order").eq("project_id", project.data.id).order("sort_order"),
      db.from("roadmap_items").select("id,phase_id,parent_item_id,title,description,metadata,status,priority,weight,progress,is_focus,blocker_reason,updated_at,item_type,created_at,completed_at").eq("project_id", project.data.id),
    ]);
    if (phases.error || items.error) throw new HomeDashboardError("Roadmap summary could not be loaded.", 503);
    const phaseRows = (phases.data ?? []) as Row[];
    const itemRows = (items.data ?? []) as Row[];
    const releaseIds = new Set(phaseRows.filter((phase) => ["active", "planned", "released"].includes(text(phase.release_status))).map((phase) => text(phase.id)));
    const activePhaseId = text(phaseRows.find((phase) => text(phase.release_status) === "active")?.id);
    const committed = itemRows.filter((item) => text(item.parent_item_id) && !["idea", "deferred"].includes(text(item.status)));
    const totalWeight = committed.reduce((sum, item) => sum + Number(item.weight ?? 0), 0);
    const completeWeight = committed.reduce((sum, item) => sum + Number(item.weight ?? 0) * Math.max(0, Math.min(100, Number(item.progress ?? 0))) / 100, 0);
    const activeItems = itemRows.filter((item) => text(item.phase_id) === activePhaseId && text(item.item_type) !== "capability");
    const current = activeItems.filter((item) => Boolean(item.is_focus) && !["completed", "blocked", "idea", "deferred"].includes(text(item.status))).sort((a, b) => Number(a.priority === "critical" ? 0 : a.priority === "high" ? 1 : 2) - Number(b.priority === "critical" ? 0 : b.priority === "high" ? 1 : 2))[0] ?? null;
    const next = activeItems.filter((item) => text(item.id) !== text(current?.id) && !["completed", "blocked", "idea", "deferred"].includes(text(item.status))).sort((a, b) => Number(a.created_at ?? "").toString().localeCompare(Number(b.created_at ?? "").toString()))[0] ?? null;
    const activePhase = phaseRows.find((phase) => text(phase.id) === activePhaseId) ?? null;
    const capabilities = itemRows
      .filter((item) => text(item.phase_id) === activePhaseId && text(item.item_type) === "capability")
      .map((capability) => {
        const children = itemRows.filter((item) => text(item.parent_item_id) === text(capability.id) && !["idea", "deferred"].includes(text(item.status)));
        const stepsTotal = children.length;
        const stepsDone = children.filter((item) => text(item.status) === "completed").length;
        const status = text(capability.status) === "completed"
          ? "done"
          : text(capability.status) === "blocked"
            ? "locked"
            : Boolean(capability.is_focus)
              ? "active"
              : "next";
        const metadata = asRecord(capability.metadata);
        return {
          id: text(capability.id),
          title: text(capability.title) || "Untitled capability",
          // Description is not a substitute for the explicitly authored
          // operator outcome in metadata.why_it_matters.
          reward: text(metadata.why_it_matters) || null,
          status: status as "done" | "active" | "next" | "locked",
          stepsDone,
          stepsTotal,
          progress: stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : Math.round(Number(capability.progress ?? 0)),
          blockedReason: text(capability.blocker_reason) || null,
        };
      });
    const completedByWeek = new Set(
      itemRows
        .filter((item) => text(item.item_type) === "capability" && text(item.status) === "completed" && text(item.completed_at))
        .map((item) => text(item.completed_at).slice(0, 10)),
    );
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const today = new Date();
    const shippedThisWeek = itemRows.filter((item) => text(item.item_type) === "capability" && text(item.status) === "completed" && text(item.completed_at) && today.getTime() - new Date(text(item.completed_at)).getTime() <= weekMs).length;
    let streakWeeks = 0;
    for (let offset = 0; offset < 52; offset += 1) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset * 7));
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() - 6);
      const hasCompletion = [...completedByWeek].some((date) => date >= end.toISOString().slice(0, 10) && date <= start.toISOString().slice(0, 10));
      if (!hasCompletion) break;
      streakWeeks += 1;
    }
    return {
      activeBlockers: itemRows.filter((item) => text(item.status) === "blocked" && releaseIds.has(text(item.phase_id))).map((item) => ({ id: text(item.id), title: text(item.title), updated_at: text(item.updated_at), blocker_reason: text(item.blocker_reason) || null, priority: text(item.priority) || "medium" })),
      totalProgress: totalWeight ? Math.round((completeWeight / totalWeight) * 100) : 0,
      buildPoints: Math.round(completeWeight * 100),
      primary: current ? { title: text(current.title), progress: Number(current.progress ?? 0), blockerReason: text(current.blocker_reason) || null } : null,
      next: next ? { title: text(next.title) } : null,
      phases: phaseRows
        .filter((phase) => ["active", "planned", "released"].includes(text(phase.release_status)))
        .map((phase) => {
          const capabilities = itemRows.filter(
            (item) => text(item.phase_id) === text(phase.id) && text(item.item_type) === "capability",
          );
          const done = capabilities.filter((item) => text(item.status) === "completed").length;
          return {
            id: text(phase.id),
            name: text(phase.name) || "Untitled phase",
            status: text(phase.release_status),
            done,
            total: capabilities.length,
            progress: capabilities.length ? Math.round((done / capabilities.length) * 100) : 0,
          };
        }),
      activePhase: activePhase
        ? { name: text(activePhase.name) || "Current release", index: phaseRows.findIndex((phase) => text(phase.id) === activePhaseId) + 1, total: phaseRows.length }
        : null,
      capabilities,
      momentum: { shippedThisWeek, streakWeeks },
    };
  });
}

async function loadHomeTaskRows() {
  const rows: Row[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const result = await db.from("jarvis_tasks").select(taskColumns)
      .neq("status", "archived")
      .order("manual_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []) as Row[]);
    if ((result.data?.length ?? 0) < pageSize) return { data: rows, error: null };
  }
}

async function loadRawDashboardState(ownerId = "") {
  return measureServerLoader("home.summary", 14, async () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const [
    finance,
    roadmap,
    clientsResult,
    tasksResult,
    reviewRecordsResult,
    proposalsResult,
    agentRunsResult,
    artifactsResult,
    logoGuidelinesResult,
    socialSnapshotsResult,
    contentItemsResult,
    notificationReadsResult,
    providerConnectionsResult,
  ] = await Promise.all([
    loadFinanceSnapshot(),
    loadHomeRoadmapSummary(),
    db
      .from("clients")
      .select("id,name,industry,status,created_at")
      .order("name"),
    loadHomeTaskRows(),
    db
      .from("client_brain_v2_records")
      .select(
        "id,client_id,top_section,subsection,title,summary,status,updated_at",
      )
      .eq("status", "needs_review")
      .order("updated_at", { ascending: false })
      .limit(80),
    db
      .from("brain_update_proposals")
      .select("id,client_id,question_key,confidence,created_at,status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("agent_runs")
      .select("id,client_id,goal,status,error_diagnostic,updated_at,created_at")
      .gte("created_at", weekStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("social_intelligence_artifacts")
      .select("id,client_id,recommended_next_moves,needs_attention,updated_at")
      .order("updated_at", { ascending: false })
      .limit(32),
    db
      .from("client_brain_v2_records")
      .select("client_id,metadata")
      .eq("top_section", "brand_guidelines")
      .eq("subsection", "logos")
      .in("status", ["approved", "current"])
      .order("updated_at", { ascending: false })
      .limit(80),
    db
      .from("social_performance_snapshots")
      .select("client_id,provider_account_id,platform,period_key,period_start,period_end,followers,post_reach,impressions,views,engagements,engagement_rate,link_clicks,posts_count,synced_at")
      .eq("provider", "zernio")
      .in("period_key", ["current_30d", "previous_30d"])
      .order("synced_at", { ascending: false })
      .limit(1_000),
    db
      .from("social_content_items")
      .select("id,client_id,title,status,content_kind,scheduled_at,updated_at")
      .in("status", ["Ready for Review", "Failed", "Scheduled", "Publishing"])
      .order("scheduled_at", { ascending: true })
      .limit(400),
    db
      .from("home_owner_notification_reads")
      .select("source_key,read_at")
      .eq("owner_id", ownerId)
      .limit(2_000),
    db.from("social_provider_connections").select("id,client_id,platform,status,provider_connection_id,platform_account_id").eq("provider", "zernio"),
  ]);
  const failed = [
    clientsResult,
    tasksResult,
    reviewRecordsResult,
    proposalsResult,
    agentRunsResult,
    artifactsResult,
    logoGuidelinesResult,
    socialSnapshotsResult,
    contentItemsResult,
    notificationReadsResult,
    providerConnectionsResult,
  ].find((result) => result.error);
  if (failed?.error)
    throw new HomeDashboardError(
      "The Home operating state could not be loaded.",
      503,
    );
  return {
    finance,
    roadmap,
    clients: (clientsResult.data ?? []) as Row[],
    tasks: (tasksResult.data ?? []) as Row[],
    reviewRecords: (reviewRecordsResult.data ?? []) as Row[],
    proposals: (proposalsResult.data ?? []) as Row[],
    agentRuns: (agentRunsResult.data ?? []) as Row[],
    usage: finance.usage as Row[],
    artifacts: (artifactsResult.data ?? []) as Row[],
    logoGuidelines: (logoGuidelinesResult.data ?? []) as Row[],
    socialSnapshots: (socialSnapshotsResult.data ?? []) as SocialSnapshotRow[],
    contentItems: (contentItemsResult.data ?? []) as Row[],
    notificationReads: (notificationReadsResult.data ?? []) as Row[],
    providerConnections: providerConnectionsResult.data ?? [],

  };
  });
}

export function buildCandidates(
  input: SuggestionState,
  clientNames: Map<string, string>,
) {
  const candidates: Candidate[] = [];
  const summary = input.finance.summary;
  if (summary.overdueInvoiceCount > 0 || summary.unresolvedRevenueCount > 0) {
    const overdue = summary.overdueInvoiceCount > 0;
    const evidence = {
      month: summary.selectedMonth,
      overdueInvoiceCount: summary.overdueInvoiceCount,
      unresolvedRevenueCount: summary.unresolvedRevenueCount,
      ...(summary.overdueRevenueAed === null
        ? {}
        : { overdueRevenueAed: summary.overdueRevenueAed }),
      ...(summary.unresolvedRevenueAed === null
        ? {}
        : { unresolvedRevenueAed: summary.unresolvedRevenueAed }),
    };
    candidates.push(
      candidate({
        title: overdue
          ? "Resolve overdue revenue"
          : "Review unresolved revenue",
        detail: overdue
          ? `${summary.overdueInvoiceCount} overdue invoice${summary.overdueInvoiceCount === 1 ? "" : "s"} require a collection decision.`
          : `${summary.unresolvedRevenueCount} revenue record${summary.unresolvedRevenueCount === 1 ? "" : "s"} need resolution.`,
        priority: overdue ? "p1" : "p2",
        dedupeIdentity: `finance:revenue-resolution:${summary.selectedMonth}`,
        clientId: null,
        clientName: null,
        href: "/finance",
        linkedObject: null,
        source: { system: "finance", detector: "unresolved_revenue" },
        evidence,
      }),
    );
  }
  for (const run of input.agentRuns.filter((row) =>
    ["failed", "recovery_required"].includes(text(row.status)),
  )) {
    const runId = text(run.id);
    if (!runId) continue;
    const clientId = text(run.client_id) || null;
    const evidence = {
      runId,
      status: text(run.status),
      updatedAt: text(run.updated_at),
      diagnostic: asRecord(run.error_diagnostic),
    };
    candidates.push(
      candidate({
        title:
          text(run.status) === "failed"
            ? "Review failed agent run"
            : "Recover agent run awaiting input",
        detail: text(run.goal) || "A Jarvis agent run requires attention.",
        priority: "p1",
        dedupeIdentity: `agent-run:${runId}`,
        clientId,
        clientName: clientId ? (clientNames.get(clientId) ?? null) : null,
        href: "/agent-runs",
        linkedObject: { type: "agent_run", id: runId },
        source: { system: "agent_runtime", detector: "failed_or_recovery_run" },
        evidence,
      }),
    );
  }
  const reviewsByClient = new Map<string, Row>();
  for (const record of input.reviewRecords) {
    const clientId = text(record.client_id);
    if (clientId && !reviewsByClient.has(clientId))
      reviewsByClient.set(clientId, record);
  }
  for (const proposal of input.proposals) {
    const clientId = text(proposal.client_id);
    if (clientId && !reviewsByClient.has(clientId))
      reviewsByClient.set(clientId, proposal);
  }
  for (const [clientId, review] of reviewsByClient) {
    const recordId = text(review.id);
    const isProposal = Boolean(text(review.question_key));
    const label = isProposal
      ? text(review.question_key).replaceAll("_", " ")
      : text(review.title) || "Client Brain record";
    const evidence = {
      reviewId: recordId,
      kind: isProposal ? "brain_update_proposal" : "client_brain_record",
      updatedAt: text(review.updated_at) || text(review.created_at),
      status: text(review.status),
      title: label,
    };
    candidates.push(
      candidate({
        title: `Review ${clientNames.get(clientId) ?? "client"} context`,
        detail: `${label.slice(0, 120)} needs a conscious review before it can guide work.`,
        priority: "p2",
        dedupeIdentity: `client-review:${clientId}`,
        clientId,
        clientName: clientNames.get(clientId) ?? null,
        href: `/clients/${clientId}/brain`,
        linkedObject: {
          type: isProposal ? "brain_update_proposal" : "client_brain_record",
          id: recordId,
        },
        source: { system: "client_brain", detector: "needs_review" },
        evidence,
      }),
    );
  }
  const latestArtifactByClient = new Map<string, Row>();
  for (const artifact of input.artifacts) {
    const clientId = text(artifact.client_id);
    if (
      clientId &&
      !latestArtifactByClient.has(clientId) &&
      (valueArray(artifact.recommended_next_moves).length ||
        valueArray(artifact.needs_attention).length)
    )
      latestArtifactByClient.set(clientId, artifact);
  }
  for (const [clientId, artifact] of latestArtifactByClient) {
    const artifactId = text(artifact.id);
    const recommendation =
      titleFromArtifact(artifact.recommended_next_moves) ||
      titleFromArtifact(artifact.needs_attention);
    const evidence = {
      artifactId,
      updatedAt: text(artifact.updated_at),
      recommendation,
      recommendationCount: valueArray(artifact.recommended_next_moves).length,
      attentionCount: valueArray(artifact.needs_attention).length,
    };
    candidates.push(
      candidate({
        title: `Review ${clientNames.get(clientId) ?? "client"} social recommendation`,
        detail: recommendation.slice(0, 160),
        priority: "p3",
        dedupeIdentity: `social-intelligence:${artifactId}`,
        clientId,
        clientName: clientNames.get(clientId) ?? null,
        href: `/clients/${clientId}/social`,
        linkedObject: { type: "social_intelligence_artifact", id: artifactId },
        source: {
          system: "social_intelligence",
          detector: "recommendation_artifact",
        },
        evidence,
      }),
    );
  }
  for (const blocker of input.roadmap.activeBlockers) {
    const evidence = {
      roadmapItemId: blocker.id,
      updatedAt: blocker.updated_at,
      blockerReason: blocker.blocker_reason || null,
    };
    candidates.push(
      candidate({
        title: `Unblock: ${blocker.title}`,
        detail:
          blocker.blocker_reason || "A committed roadmap item is blocked.",
        priority:
          blocker.priority === "critical" || blocker.priority === "high"
            ? "p1"
            : "p2",
        dedupeIdentity: `roadmap-blocker:${blocker.id}`,
        clientId: null,
        clientName: null,
        href: "/roadmap",
        linkedObject: { type: "roadmap_item", id: blocker.id },
        source: { system: "roadmap", detector: "blocked_item" },
        evidence,
      }),
    );
  }
  return candidates.sort(candidateOrder);
}

function suggestionMonthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  return {
    key: start.toISOString().slice(0, 7),
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function incomeAppliesToMonth(row: Row, month: { start: string; end: string }) {
  if (row.active === false) return false;
  const billingCycle = text(row.billing_cycle);
  if (billingCycle !== "one_off")
    return (
      (!text(row.start_date) || text(row.start_date) <= month.end) &&
      (!text(row.end_date) || text(row.end_date) >= month.start)
    );
  const date = text(row.start_date);
  return Boolean(date && date >= month.start && date <= month.end);
}

async function loadFinanceSuggestionSummary(): Promise<FinanceSuggestionSummary> {
  return measureServerLoader("suggestions.finance-summary", 2, async () => {
    const month = suggestionMonthBounds();
    const [incomeResult, invoicesResult] = await Promise.all([
      db
        .from("jarvis_finance_income_records")
        .select("active,billing_cycle,start_date,end_date,payment_status")
        .limit(2_000),
      db
        .from("jarvis_finance_invoices")
        .select("sent_at,due_at,paid_at,paid_amount,amount")
        .eq("invoice_month", month.start)
        .limit(2_000),
    ]);
    if (incomeResult.error || invoicesResult.error)
      throw new HomeDashboardError(
        "Finance suggestion signals could not be loaded.",
        503,
      );
    const unresolvedRevenueCount = ((incomeResult.data ?? []) as Row[]).filter(
      (row) =>
        incomeAppliesToMonth(row, month) &&
        text(row.payment_status) === "not_set",
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    const overdueInvoiceCount = ((invoicesResult.data ?? []) as Row[]).filter(
      (row) => {
        const amount = Number(row.amount ?? 0);
        const paidAmount =
          row.paid_amount === null ? null : Number(row.paid_amount ?? 0);
        return Boolean(
          text(row.sent_at) &&
          text(row.due_at) &&
          !(text(row.paid_at) && (paidAmount ?? 0) >= amount) &&
          text(row.due_at) < today,
        );
      },
    ).length;
    return {
      selectedMonth: month.key,
      overdueInvoiceCount,
      unresolvedRevenueCount,
      overdueRevenueAed: null,
      unresolvedRevenueAed: null,
    };
  });
}

async function loadRoadmapSuggestionBlockers() {
  return measureServerLoader("suggestions.roadmap-blockers", 2, async () => {
    const projectResult = await db
      .from("roadmap_projects")
      .select("id")
      .eq("slug", "jarvis-os")
      .maybeSingle();
    if (projectResult.error || !projectResult.data?.id)
      throw new HomeDashboardError(
        "Roadmap suggestion signals could not be loaded.",
        503,
      );
    const blockersResult = await db
      .from("roadmap_items")
      .select("id,title,updated_at,blocker_reason,priority")
      .eq("project_id", projectResult.data.id)
      .eq("status", "blocked")
      .order("updated_at", { ascending: false })
      .limit(120);
    if (blockersResult.error)
      throw new HomeDashboardError(
        "Roadmap suggestion signals could not be loaded.",
        503,
      );
    return (blockersResult.data ?? []).map((row) => ({
      id: text(row.id),
      title: text(row.title),
      updated_at: text(row.updated_at),
      blocker_reason: text(row.blocker_reason) || null,
      priority: text(row.priority) || "medium",
    }));
  });
}

async function loadSuggestionState(options: {
  includeSystemSignals: boolean;
  includeAgentSignals: boolean;
  includeSocialSignals: boolean;
}): Promise<SuggestionState> {
  return measureServerLoader(
    options.includeSystemSignals
      ? "suggestions.full-inputs"
      : "suggestions.client-inputs",
    2 +
      (options.includeAgentSignals ? 1 : 0) +
      (options.includeSocialSignals ? 1 : 0) +
      (options.includeSystemSignals ? 4 : 0),
    async () => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const base = await Promise.all([
        db
          .from("client_brain_v2_records")
          .select(
            "id,client_id,top_section,subsection,title,summary,status,updated_at",
          )
          .eq("status", "needs_review")
          .order("updated_at", { ascending: false })
          .limit(240),
        db
          .from("brain_update_proposals")
          .select("id,client_id,question_key,confidence,created_at,status")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(120),
        ...(options.includeAgentSignals
          ? [
              db
                .from("agent_runs")
                .select(
                  "id,client_id,goal,status,error_diagnostic,updated_at,created_at",
                )
                .gte("created_at", weekStart.toISOString())
                .order("created_at", { ascending: false })
                .limit(180),
            ]
          : []),
        ...(options.includeSocialSignals
          ? [
              db
                .from("social_intelligence_artifacts")
                .select(
                  "id,client_id,recommended_next_moves,needs_attention,updated_at",
                )
                .order("updated_at", { ascending: false })
                .limit(80),
            ]
          : []),
      ]);
      const failed = base.find((result) => result.error);
      if (failed?.error)
        throw new HomeDashboardError(
          "Suggestion inputs could not be loaded.",
          503,
        );
      const [finance, blockers] = options.includeSystemSignals
        ? await Promise.all([
            loadFinanceSuggestionSummary(),
            loadRoadmapSuggestionBlockers(),
          ])
        : [
            {
              selectedMonth: suggestionMonthBounds().key,
              overdueInvoiceCount: 0,
              unresolvedRevenueCount: 0,
              overdueRevenueAed: null,
              unresolvedRevenueAed: null,
            },
            [],
          ];
      return {
        finance: { summary: finance },
        roadmap: { activeBlockers: blockers },
        reviewRecords: (base[0].data ?? []) as Row[],
        proposals: (base[1].data ?? []) as Row[],
        agentRuns: options.includeAgentSignals
          ? ((base[2].data ?? []) as Row[])
          : [],
        artifacts: options.includeSocialSignals
          ? ((base[options.includeAgentSignals ? 3 : 2].data ?? []) as Row[])
          : [],
      };
    },
  );
}

function suggestionKeysFromTasks(
  tasks: Array<Pick<HomeTask, "dedupe_identity" | "source_evidence_hash">>,
) {
  return new Set(
    tasks
      .filter((task) => task.dedupe_identity && task.source_evidence_hash)
      .map((task) => `${task.dedupe_identity}:${task.source_evidence_hash}`),
  );
}

export async function loadTaskSuggestions(
  clients: Array<{ id: string; name: string }>,
  tasks: Array<Pick<HomeTask, "dedupe_identity" | "source_evidence_hash">>,
) {
  const [state, dismissedResult] = await Promise.all([
    loadSuggestionState({
      includeSystemSignals: true,
      includeAgentSignals: true,
      includeSocialSignals: true,
    }),
    db
      .from("jarvis_task_suggestion_suppressions")
      .select("dedupe_identity,evidence_hash").eq("reason", "archived"),
  ]);
  if (dismissedResult.error)
    throw new HomeDashboardError("Suggestion state could not be loaded.", 503);
  const clientNames = new Map(
    clients.map((client) => [client.id, client.name]),
  );
  const dismissed = new Set(
    (dismissedResult.data ?? []).map(
      (row) => `${row.dedupe_identity}:${row.evidence_hash}`,
    ),
  );
  const accepted = suggestionKeysFromTasks(tasks);
  return buildCandidates(state, clientNames)
    .filter(
      (item) =>
        !dismissed.has(`${item.dedupeIdentity}:${item.evidenceHash}`) &&
        !accepted.has(`${item.dedupeIdentity}:${item.evidenceHash}`),
    )
    .slice(0, 5);
}

export type ClientIndexAttentionBase = {
  clients: Array<{
    id: string;
    name: string;
    industry: string | null;
    status: string;
    createdAt: string | null;
  }>;
  logoUrls: Map<string, string>;
  attention: HomeSuggestion[];
};

export async function loadClientAttentionBase(): Promise<
  Omit<ClientIndexAttentionBase, "logoUrls">
> {
  const [clientsResult, state] = await Promise.all([
    db
      .from("clients")
      .select("id,name,industry,status,created_at")
      .order("name"),
    loadSuggestionState({
      includeSystemSignals: false,
      includeAgentSignals: false,
      includeSocialSignals: false,
    }),
  ]);
  if (clientsResult.error)
    throw new HomeDashboardError(
      "Client attention signals could not be loaded.",
      503,
    );
  const rawClients = (clientsResult.data ?? []) as Row[];
  const clientNames = new Map(
    rawClients.map((client) => [text(client.id), text(client.name)]),
  );
  return {
    clients: rawClients
      .filter(
        (client) =>
          text(client.id) &&
          text(client.name) &&
          isClientDiscoverable(text(client.id)) &&
          text(client.status) !== "archived",
      )
      .map((client) => ({
        id: text(client.id),
        name: text(client.name),
        industry: text(client.industry) || null,
        status: text(client.status) || "unknown",
        createdAt: text(client.created_at) || null,
      })),
    attention: buildCandidates(state, clientNames).filter(
      (item) => item.clientId !== null,
    ),
  };
}

/**
 * Keeps the Client Index and Home's client badges tied to the same bounded,
 * deterministic detector set. The index adds only its own list-scale display
 * signals; it never recomputes an independent attention score.
 */
export async function loadClientIndexAttentionBase(): Promise<ClientIndexAttentionBase> {
  const [base, logoGuidelinesResult] = await Promise.all([
    loadClientAttentionBase(),
    db
      .from("client_brain_v2_records")
      .select("client_id,metadata")
      .eq("top_section", "brand_guidelines")
      .eq("subsection", "logos")
      .in("status", ["approved", "current"])
      .order("updated_at", { ascending: false })
      .limit(80),
  ]);
  if (logoGuidelinesResult.error)
    throw new HomeDashboardError(
      "Client attention signals could not be loaded.",
      503,
    );
  return {
    clients: base.clients,
    logoUrls: await clientLogoUrls((logoGuidelinesResult.data ?? []) as Row[]),
    attention: base.attention,
  };
}

function asSocialSnapshot(row: SocialSnapshotRow): SocialPerformanceSnapshot {
  return {
    id: `${row.client_id}:${row.platform}:${row.period_key}:${row.synced_at}`,
    clientId: row.client_id,
    provider: "zernio",
    platform: row.platform,
    providerAccountId: "",
    periodKey: row.period_key as SocialPerformanceSnapshot["periodKey"],
    periodStart: row.period_start,
    periodEnd: row.period_end,
    followers: row.followers,
    postReach: row.post_reach,
    impressions: row.impressions,
    views: row.views,
    engagements: row.engagements,
    engagementRate: row.engagement_rate,
    linkClicks: row.link_clicks,
    postsCount: row.posts_count ?? 0,
    topPosts: [],
    metricProvenance: {},
    syncedAt: row.synced_at,
  };
}

function latestSnapshotsForClient(rows: SocialSnapshotRow[], clientId: string) {
  const selected = rows.filter((row) => row.client_id === clientId);
  const latest = (period: "current_30d" | "previous_30d", platform: SocialPerformancePlatform) =>
    selected.find((row) => row.period_key === period && row.platform === platform) ?? null;
  return {
    current: {
      instagram: latest("current_30d", "instagram") ? asSocialSnapshot(latest("current_30d", "instagram")!) : null,
      facebook: latest("current_30d", "facebook") ? asSocialSnapshot(latest("current_30d", "facebook")!) : null,
    },
    previous: {
      instagram: latest("previous_30d", "instagram") ? asSocialSnapshot(latest("previous_30d", "instagram")!) : null,
      facebook: latest("previous_30d", "facebook") ? asSocialSnapshot(latest("previous_30d", "facebook")!) : null,
    },
  };
}

function socialSummaryForClient(rows: SocialSnapshotRow[], clientId: string) {
  const snapshots = latestSnapshotsForClient(rows, clientId);
  // Instagram is the headline account. Facebook is reported beside it rather
  // than summed into it: combining them produced a figure that matched neither
  // platform and disagreed with the client workspace, which reads Instagram.
  const followers = readMetric(snapshots.current, "audience", "instagram").value;
  const reach = compareMetric(snapshots.current, snapshots.previous, "reach", "instagram");
  const engagement = compareMetric(snapshots.current, snapshots.previous, "interactions", "instagram");
  const previousFollowers = readMetric(snapshots.previous, "audience", "instagram").value;
  const facebookFollowers = readMetric(snapshots.current, "audience", "facebook").value;
  const facebookReach = readMetric(snapshots.current, "reach", "facebook").value;
  const historyByEnd = new Map<string, Map<SocialPerformancePlatform, SocialSnapshotRow>>();
  for (const row of rows.filter((item) => item.client_id === clientId && item.period_key === "current_30d")) {
    const values = historyByEnd.get(row.period_end) ?? new Map<SocialPerformancePlatform, SocialSnapshotRow>();
    values.set(row.platform, row);
    historyByEnd.set(row.period_end, values);
  }
  // The series tracks Instagram alone, matching the headline figures. Requiring
  // a Facebook row at every point previously emptied the series for every
  // client, and the view then drew an invented shape in its place.
  const reachSeries = [...historyByEnd.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, values]) => {
      const instagram = values.get("instagram");
      return instagram && typeof instagram.post_reach === "number" ? [instagram.post_reach] : [];
    })
    .slice(-8);
  return {
    followers,
    reach30d: reach.current.value,
    engagements: engagement.current.value,
    facebookFollowers,
    facebookReach30d: facebookReach,
    // Deltas carry their own unit. compareMetric falls back to an absolute
    // change when the prior value is zero or the base is too small for a
    // percentage to mean anything, and the client must not append "%" to it.
    // Percentage where the prior window supports one, otherwise the raw change
    // in followers — the same rule the reach and engagement deltas follow.
    followerDelta:
      followers === null || previousFollowers === null
        ? null
        : previousFollowers > 0
          ? ((followers - previousFollowers) / previousFollowers) * 100
          : followers - previousFollowers,
    followerDeltaMode: (followers === null || previousFollowers === null
      ? "none"
      : previousFollowers > 0
        ? "percent"
        : "absolute") as SocialDeltaMode,
    reachDelta: reach.display === "percent" ? reach.percent : reach.absolute,
    reachDeltaMode: reach.display as SocialDeltaMode,
    engagementDelta: engagement.display === "percent" ? engagement.percent : engagement.absolute,
    engagementDeltaMode: engagement.display as SocialDeltaMode,
    // Two points is the minimum that can describe a direction; anything less
    // is reported as absent rather than padded.
    reachSeries: reachSeries.length >= 2 ? reachSeries : null,
  };
}

function notificationRows(input: {
  contentItems: Row[];
  agentRuns: Row[];
  suggestions: HomeSuggestion[];
  clientNames: Map<string, string>;
  clientLogoUrls: Map<string, string>;
  reads: Row[];
}) {
  const read = new Set(input.reads.map((row) => text(row.source_key)));
  const rows: HomeNotification[] = [];
  for (const item of input.contentItems) {
    const id = text(item.id);
    const clientId = text(item.client_id) || null;
    const status = text(item.status);
    if (!id || !clientId || !["Ready for Review", "Failed"].includes(status)) continue;
    const sourceKey = `social-content:${id}:${status}`;
    rows.push({
      id: sourceKey,
      sourceKey,
      title: status === "Ready for Review" ? `Review: ${text(item.title) || "Untitled content"}` : `Needs recovery: ${text(item.title) || "Untitled content"}`,
      meta: input.clientNames.get(clientId) ?? "Client content",
      kind: status === "Ready for Review" ? "approval" : "adjustment",
      href: `/clients/${clientId}/social`,
      clientName: input.clientNames.get(clientId) ?? null,
      clientId,
      clientLogoUrl: input.clientLogoUrls.get(clientId) ?? null,
      isUnread: !read.has(sourceKey),
      occurredAt: text(item.updated_at) || text(item.scheduled_at) || new Date(0).toISOString(),
    });
  }
  for (const run of input.agentRuns.filter((row) => ["failed", "recovery_required", "waiting_for_approval"].includes(text(row.status)))) {
    const id = text(run.id);
    if (!id) continue;
    const sourceKey = `agent-run:${id}:${text(run.status)}`;
    rows.push({
      id: sourceKey,
      sourceKey,
      title: text(run.status) === "waiting_for_approval" ? "Agent approval waiting" : "Agent run needs attention",
      meta: text(run.goal) || "Agent Runtime",
      kind: "system",
      href: "/agent-runs",
      clientName: text(run.client_id) ? input.clientNames.get(text(run.client_id)) ?? null : null,
      clientId: text(run.client_id) || null,
      clientLogoUrl: text(run.client_id) ? input.clientLogoUrls.get(text(run.client_id)) ?? null : null,
      isUnread: !read.has(sourceKey),
      occurredAt: text(run.updated_at) || text(run.created_at) || new Date(0).toISOString(),
    });
  }
  for (const suggestion of input.suggestions.filter((item) => text(asRecord(item.source).system) === "finance")) {
    const sourceKey = `suggestion:${suggestion.id}`;
    rows.push({
      id: sourceKey,
      sourceKey,
      title: suggestion.title,
      meta: suggestion.detail,
      kind: "finance",
      href: suggestion.href,
      clientName: null,
      clientId: null,
      clientLogoUrl: null,
      isUnread: !read.has(sourceKey),
      occurredAt: new Date().toISOString(),
    });
  }
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 40);
}

export async function getHomeDashboardData(ownerId = ""): Promise<HomeDashboardData> {
  // Suppressions are independent of the dashboard reads. Start logo resolution
  // as soon as its source rows arrive, without waiting for suppressions.
  const rawPromise = loadRawDashboardState(ownerId);
  const [raw, logoUrls, dismissedResult, personalDismissals] = await Promise.all([
    rawPromise,
    rawPromise.then((state) => clientLogoUrls(state.logoGuidelines)),
    db
      .from("jarvis_task_suggestion_suppressions")
      .select("dedupe_identity,evidence_hash").eq("reason", "archived"),
    db.from("home_owner_suggestion_dismissals").select("dedupe_identity,evidence_hash")
      .eq("owner_id", ownerId).gt("expires_at", new Date().toISOString()),
  ]);
  const clientNames = new Map(
    raw.clients.map((client) => [text(client.id), text(client.name)]),
  );
  const tasks = raw.tasks.map((row) => rowTask(row, clientNames));
  if (dismissedResult.error || personalDismissals.error)
    throw new HomeDashboardError("Suggestion state could not be loaded.", 503);
  const dismissed = new Set(
    [...(dismissedResult.data ?? []), ...(personalDismissals.data ?? [])].map(
      (row) => `${row.dedupe_identity}:${row.evidence_hash}`,
    ),
  );
  const accepted = suggestionKeysFromTasks(tasks);
  const allCandidates = buildCandidates(raw, clientNames);
  const suggestions = allCandidates
    .filter(
      (item) =>
        !dismissed.has(`${item.dedupeIdentity}:${item.evidenceHash}`) &&
        !accepted.has(`${item.dedupeIdentity}:${item.evidenceHash}`),
    )
    .slice(0, 5);
  const attentionByClient = new Map<string, Candidate[]>();
  for (const item of allCandidates)
    if (item.clientId)
      attentionByClient.set(item.clientId, [
        ...(attentionByClient.get(item.clientId) ?? []),
        item,
      ]);
  const expectedRevenueAedByClient = allocatedRevenueByClient(
    raw.finance.summary.revenueReconciliation.map((item) => ({ clientId: item.clientId, amount: item.expectedAed })),
  );
  const revenueByClient = allocatedRevenueByClient(
    raw.finance.summary.incomeByClient.map((item) => ({ clientId: item.clientId, amount: item.netEur })),
  );
  const knownRevenueTotal = raw.finance.summary.incomeByClient.reduce(
    (total, item) => total + Math.max(0, item.netEur ?? 0),
    0,
  );
  const approvalsByClient = new Map<string, number>();
  const adjustmentsByClient = new Map<string, number>();
  for (const item of raw.contentItems) {
    const clientId = text(item.client_id);
    if (!clientId) continue;
    if (text(item.status) === "Ready for Review")
      approvalsByClient.set(clientId, (approvalsByClient.get(clientId) ?? 0) + 1);
    if (text(item.status) === "Failed")
      adjustmentsByClient.set(clientId, (adjustmentsByClient.get(clientId) ?? 0) + 1);
  }
  const clients = raw.clients
    .filter((client) => text(client.status) !== "archived" && isClientDiscoverable(text(client.id)))
    .map((client) => {
      const id = text(client.id);
      const signal = (attentionByClient.get(id) ?? [])[0];
      const name = text(client.name);
      const revenueEur = revenueByClient.get(id) ?? null;
      const revenueAed =
        expectedRevenueAedByClient.get(id) ?? null;
      const approvalsCount = approvalsByClient.get(id) ?? 0;
      const adjustmentsCount = adjustmentsByClient.get(id) ?? 0;
      const attentionCount = (attentionByClient.get(id) ?? []).length;
      const clientStatus = text(client.status);
      return {
        id,
        name,
        industry: text(client.industry) || null,
        attentionCount,
        latestSignal: signal?.detail ?? null,
        href: `/clients/${id}`,
        logoUrl: logoUrls.get(id) ?? null,
        revenueAed,
        revenueEur,
        revenueShare:
          revenueEur !== null && knownRevenueTotal > 0
            ? revenueEur / knownRevenueTotal
            : null,
        openTaskCount: tasks.filter(
          (task) =>
            task.client_id === id &&
            ["not_started", "in_progress"].includes(task.status),
        ).length,
        status: (clientStatus === "onboarding"
          ? "onboarding"
          : clientStatus === "active"
            ? "active"
            : "inactive") as HomeDashboardData["clients"][number]["status"],
        approvalsCount,
        adjustmentsCount,
        workRequiredCount: attentionCount + approvalsCount + adjustmentsCount,
        social: socialSummaryForClient(raw.socialSnapshots, id),
      };
    })
    .sort(
      (a, b) =>
        b.attentionCount - a.attentionCount || a.name.localeCompare(b.name),
    )
    .slice(0, 4);
  const failedRuns = raw.agentRuns.filter((row) =>
    ["failed", "recovery_required"].includes(text(row.status)),
  ).length;
  const usage = raw.usage;
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      hour: "numeric",
      hourCycle: "h23",
      }).format(now),
  );
  const today = todayDubai();
  const publishingToday = raw.contentItems
    .filter((item) => ["Scheduled", "Publishing"].includes(text(item.status)) && dayOf(text(item.scheduled_at)) === today)
    .slice(0, 6)
    .map((item) => ({
      id: text(item.id),
      title: text(item.title) || "Untitled content",
      clientName: clientNames.get(text(item.client_id)) ?? "Client",
      scheduledAt: text(item.scheduled_at) || null,
      kind: text(item.content_kind) === "story" ? "story" as const : "feed" as const,
      href: `/clients/${text(item.client_id)}/social`,
    }));
  const notifications = notificationRows({
    contentItems: raw.contentItems,
    agentRuns: raw.agentRuns,
    suggestions,
    clientNames,
    clientLogoUrls: logoUrls,
    reads: raw.notificationReads,
  });
  const financeIssues = raw.finance.summary.overdueInvoiceCount + raw.finance.summary.unresolvedRevenueCount + raw.finance.summary.bankReviewCount;
  const providerAccessCheck = {
    name: "Provider snapshots", href: "/workspaces/social-media",
    ...providerSnapshotHealth(raw.providerConnections, raw.socialSnapshots, now.getTime()),
  };
  const healthChecks: HomeDashboardData["systemHealth"]["checks"] = [
    { name: "Database reads", note: "Home reads completed; data consistency is not assessed by this check.", state: "ok", href: "/system-operations" },
    providerAccessCheck,
    { name: "Agent runtime", note: failedRuns ? `${failedRuns} recent run${failedRuns === 1 ? "" : "s"} need attention.` : "No failed or recovery-required runs this week.", state: failedRuns ? "warn" : "ok", href: "/agent-runs" },
    { name: "Ledger reconciliation", note: financeIssues ? `${financeIssues} Finance item${financeIssues === 1 ? "" : "s"} need review.` : "No Finance reconciliation issue is currently surfaced.", state: financeIssues ? "warn" : "ok", href: "/finance" },
  ];
  const healthScore = Math.round((healthChecks.filter((check) => check.state === "ok").length / healthChecks.length) * 100);
  return {
    generatedAt: now.toISOString(),
    greeting:
      hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening",
    dateLabel: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(now),
    tasks,
    suggestions,
    clients,
    money: homeMoneyFromFinanceSnapshot(raw.finance),
    system: {
      agentsThisWeek: raw.agentRuns.length,
      failedRuns,
      aiSpendUsd: usage.reduce(
        (sum, row) => sum + Number(row.cost_usd_actual ?? 0),
        0,
      ),
      aiCalls: usage.length,
      databaseState: "connected",
      latestEvent: raw.agentRuns[0]
        ? {
            label: text(raw.agentRuns[0].goal) || "Agent run updated",
            at:
              text(raw.agentRuns[0].updated_at) ||
              text(raw.agentRuns[0].created_at),
          }
        : null,
    },
    roadmap: {
      blockerCount: raw.roadmap.activeBlockers.length,
      totalProgress: raw.roadmap.totalProgress,
      buildPoints: raw.roadmap.buildPoints,
      primary: raw.roadmap.primary,
      next: raw.roadmap.next,
      phases: raw.roadmap.phases,
      activePhase: raw.roadmap.activePhase,
      capabilities: raw.roadmap.capabilities,
      momentum: raw.roadmap.momentum,
    },
    publishingToday,
    notifications,
    systemHealth: { score: healthScore, checks: healthChecks },
  };
}

function cleanTitle(value: unknown) {
  const title = text(value);
  if (!title) throw new HomeDashboardError("Task title is required.");
  if (title.length > 240)
    throw new HomeDashboardError("Task title must be 240 characters or fewer.");
  return title;
}
function cleanDescription(value: unknown) {
  const description = text(value);
  if (description.length > 4000)
    throw new HomeDashboardError(
      "Task description must be 4,000 characters or fewer.",
    );
  return description || null;
}
async function clientNameMap() {
  const result = await db.from("clients").select("id,name");
  if (result.error)
    throw new HomeDashboardError("Client options could not be loaded.", 503);
  return new Map((result.data ?? []).map((row) => [row.id, row.name]));
}

export async function createHomeTask(input: Record<string, unknown>, targetStatus: HomeTaskStatus = "not_started") {
  const clientId = text(input.clientId) || null;
  if (clientId && !isUuid(clientId))
    throw new HomeDashboardError("Client is invalid.");
  const createdAt = new Date().toISOString();
  const insert = await db
    .from("jarvis_tasks")
    .insert({
      status: targetStatus,
      completed_at: ["completed", "reviewed"].includes(targetStatus) ? createdAt : null,
      reviewed_at: targetStatus === "reviewed" ? createdAt : null,
      archived_at: targetStatus === "archived" ? createdAt : null,
      title: cleanTitle(input.title),
      description: cleanDescription(input.description),
      priority: priority(input.priority),
      due_at: optionalIso(input.dueAt),
      client_id: clientId,
      manual_order: Date.now(),
      origin: "manual",
      source: { system: "home", detector: "manual" },
      evidence: {},
    })
    .select(taskColumns)
    .single();
  if (insert.error || !insert.data)
    throw new HomeDashboardError("Task could not be created.", 500);
  return rowTask(insert.data as Row, await clientNameMap());
}

export async function createHomeTaskForBoardColumn(
  input: Record<string, unknown>,
) {
  const targetStatus = input.targetStatus;
  if (!isTaskBoardStatus(targetStatus))
    throw new HomeDashboardError("Task column is invalid.");

  // One insert persists the requested lane and lifecycle timestamps together.
  return createHomeTask(input, targetStatus);
}

export async function moveHomeTask(input: Record<string, unknown>) {
  const { taskId, from, to, expectedUpdatedAt, expectedDestinationIds, orderedTaskIds } = input;
  const validIds = (value: unknown): value is string[] => Array.isArray(value)
    && value.length <= 10000 && value.every(id => typeof id === "string" && isUuid(id))
    && new Set(value).size === value.length;
  if (typeof taskId !== "string" || !isUuid(taskId)
    || !isTaskBoardStatus(from) || from === "archived"
    || !isTaskBoardStatus(to) || to === "archived"
    || typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))
    || !validIds(expectedDestinationIds) || !validIds(orderedTaskIds) || !orderedTaskIds.length)
    throw new HomeDashboardError("Task move request is invalid.");
  const result = await db.rpc("move_jarvis_task", {
    p_task_id: taskId, p_expected_updated_at: expectedUpdatedAt, p_from: from, p_to: to,
    p_expected_destination_ids: expectedDestinationIds, p_ordered_task_ids: orderedTaskIds,
  });
  if (result.error) {
    if (result.error.message.includes("TASK_MOVE_NOT_FOUND"))
      throw new HomeDashboardError("Task was not found.", 404);
    if (/TASK_(MOVE|REORDER)_CONFLICT/.test(result.error.message))
      throw new HomeDashboardError("Task or column changed elsewhere. Refresh and try again.", 409);
    if (result.error.message.includes("TASK_MOVE_INPUT_INVALID"))
      throw new HomeDashboardError("Task move request does not match the column.");
    throw new HomeDashboardError("Task could not be moved.", 500);
  }
  return rowTask(result.data[0] as Row, await clientNameMap());
}

export async function acceptHomeSuggestion(
  dedupeIdentity: string,
  evidenceHash: string,
  ownerId = "",
) {
  const snapshot = await getHomeDashboardData(ownerId);
  const selected = snapshot.suggestions.find(
    (item) =>
      item.dedupeIdentity === dedupeIdentity &&
      item.evidenceHash === evidenceHash,
  );
  if (!selected)
    throw new HomeDashboardError(
      "That suggestion is no longer current. Refresh Home and try again.",
      409,
    );
  const insert = await db
    .from("jarvis_tasks")
    .insert({
      title: selected.title,
      description: selected.detail,
      priority: selected.priority,
      client_id: selected.clientId,
      linked_object_type: selected.linkedObject?.type ?? null,
      linked_object_id: selected.linkedObject?.id ?? null,
      origin: "suggested",
      source: selected.source,
      evidence: selected.evidence,
      source_evidence_hash: selected.evidenceHash,
      dedupe_identity: selected.dedupeIdentity,
      manual_order: Date.now(),
    })
    .select(taskColumns)
    .single();
  if (insert.error?.code === "23505")
    throw new HomeDashboardError("This suggestion already has a task.", 409);
  if (insert.error || !insert.data)
    throw new HomeDashboardError("Suggestion could not be accepted.", 500);
  return rowTask(insert.data as Row, await clientNameMap());
}

export async function dismissHomeSuggestion(
  dedupeIdentity: string,
  evidenceHash: string,
  ownerId = "",
) {
  const snapshot = await getHomeDashboardData(ownerId);
  const selected = snapshot.suggestions.find(
    (item) =>
      item.dedupeIdentity === dedupeIdentity &&
      item.evidenceHash === evidenceHash,
  );
  if (!selected)
    throw new HomeDashboardError(
      "That suggestion is no longer current. Refresh Home and try again.",
      409,
    );
  if (!ownerId) throw new HomeDashboardError("Sign in to dismiss a suggestion.", 401);
  const dismissedAt = new Date();
  const result = await db.from("home_owner_suggestion_dismissals").upsert(
    {
      dedupe_identity: selected.dedupeIdentity,
      evidence_hash: selected.evidenceHash,
      owner_id: ownerId,
      dismissed_at: dismissedAt.toISOString(),
      expires_at: new Date(dismissedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "owner_id,dedupe_identity,evidence_hash" },
  );
  if (result.error)
    throw new HomeDashboardError("Suggestion could not be dismissed.", 500);
}

export async function markHomeNotificationsRead(sourceKeys: unknown, ownerId: string) {
  if (!ownerId) throw new HomeDashboardError("Sign in to read notifications.", 401);
  if (!Array.isArray(sourceKeys))
    throw new HomeDashboardError("Notification sources are invalid.");
  const keys = [...new Set(sourceKeys.filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 280))].slice(0, 100);
  if (!keys.length) return;
  const snapshot = await getHomeDashboardData(ownerId);
  const current = new Set(snapshot.notifications.map((notification) => notification.sourceKey));
  if (keys.some((key) => !current.has(key)))
    throw new HomeDashboardError("A notification is no longer current. Refresh Home and try again.", 409);
  const result = await db.from("home_owner_notification_reads").upsert(
    keys.map((source_key) => ({ owner_id: ownerId, source_key, read_at: new Date().toISOString() })),
    { onConflict: "owner_id,source_key" },
  );
  if (result.error)
    throw new HomeDashboardError("Notifications could not be marked as read.", 500);
}

export async function updateHomeTask(
  taskId: string,
  input: Record<string, unknown>,
) {
  if (!isUuid(taskId)) throw new HomeDashboardError("Task is invalid.");
  const currentResult = await db
    .from("jarvis_tasks")
    .select(taskColumns)
    .eq("id", taskId)
    .maybeSingle();
  if (currentResult.error || !currentResult.data)
    throw new HomeDashboardError("Task was not found.", 404);
  const current = rowTask(currentResult.data as Row, await clientNameMap());
  if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== current.updated_at)
    throw new HomeDashboardError("Task changed elsewhere. Refresh and try again.", 409);

  const action = text(input.action) as HomeTaskAction | "update";
  const patch: Row = {};
  if (action === "start") {
    patch.status = "in_progress";
    patch.completed_at = null;
    patch.reviewed_at = null;
    patch.archived_at = null;
  } else if (action === "complete") {
    patch.status = "completed";
    patch.completed_at = new Date().toISOString();
    patch.reviewed_at = null;
  } else if (action === "review") {
    if (current.status !== "completed")
      throw new HomeDashboardError(
        "Only completed tasks can be reviewed.",
        409,
      );
    patch.status = "reviewed";
    patch.reviewed_at = new Date().toISOString();
  } else if (action === "archive") {
    patch.status = "archived";
    patch.archived_at = new Date().toISOString();
  } else if (action === "reopen") {
    patch.status = "not_started";
    patch.completed_at = null;
    patch.reviewed_at = null;
    patch.archived_at = null;
  } else if (action === "update") {
    if (input.title !== undefined) patch.title = cleanTitle(input.title);
    if (input.description !== undefined)
      patch.description = cleanDescription(input.description);
    if (input.priority !== undefined) patch.priority = priority(input.priority);
    if (input.dueAt !== undefined) patch.due_at = optionalIso(input.dueAt);
    if (input.clientId !== undefined) {
      const clientId = text(input.clientId) || null;
      if (clientId && !isUuid(clientId))
        throw new HomeDashboardError("Client is invalid.");
      patch.client_id = clientId;
    }
  } else throw new HomeDashboardError("Task action is invalid.");
  const result = await db
    .from("jarvis_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("updated_at", current.updated_at)
    .select(taskColumns)
    .maybeSingle();
  if (result.error)
    throw new HomeDashboardError("Task could not be updated.", 500);
  if (!result.data)
    throw new HomeDashboardError("Task changed elsewhere. Refresh and try again.", 409);
  if (
    action === "archive" &&
    current.dedupe_identity &&
    current.source_evidence_hash
  ) {
    await db.from("jarvis_task_suggestion_suppressions").upsert(
      {
        dedupe_identity: current.dedupe_identity,
        evidence_hash: current.source_evidence_hash,
        reason: "archived",
        source: current.source,
      },
      { onConflict: "dedupe_identity,evidence_hash", ignoreDuplicates: true },
    );
  }
  return rowTask(result.data as Row, await clientNameMap());
}

export async function reviewCompletedHomeTasks() {
  const result = await db
    .from("jarvis_tasks")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
    .eq("status", "completed")
    .select(taskColumns);
  if (result.error)
    throw new HomeDashboardError("Completed tasks could not be reviewed.", 500);
  const names = await clientNameMap();
  return (result.data ?? []).map((row) => rowTask(row as Row, names));
}

export function homeDashboardErrorResponse(error: unknown) {
  const known =
    error instanceof HomeDashboardError
      ? error
      : new HomeDashboardError("Home request failed.", 500);
  return { message: known.message, status: known.status };
}

export function homeToday() {
  return todayDubai();
}
export function homeTaskDay(value: string | null) {
  return dayOf(value);
}
