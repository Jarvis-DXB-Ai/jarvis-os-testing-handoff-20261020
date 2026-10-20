"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {useNotifications} from "@/components/notifications/notifications-provider";
import {needsYou, notificationGroups} from "@/components/notifications/notification-model";
import HomeDashboardView from "@/components/dashboard/home-dashboard-view";
import type {
  DisplayValue,
  FinanceDelta,
  HomeDashboardActions,
  HomeDashboardViewModel,
  HomeDashboardViewState,
  TaskLaneKey,
  ViewAction,
} from "@/components/dashboard/home-dashboard-view.model";
import type {
  HomeDashboardData,
  HomeSuggestion,
  HomeTask,
  SocialDeltaMode,
} from "@/lib/home-dashboard";

type Props = {
  data: HomeDashboardData;
  busy: string | null;
  error: string | null;
  onAccept: (item: HomeSuggestion) => void;
  onDismiss: (item: HomeSuggestion) => void;
  onClearError: () => void;
  onTaskMove: (move: { taskId: string; from: TaskLaneKey; to: TaskLaneKey; orderedTaskIds: string[] }) => Promise<unknown>;
  onTaskCreate: (lane: TaskLaneKey, title: string) => Promise<unknown>;
};

type Money = HomeDashboardData["money"];

const known = (text: string, numericValue?: number): DisplayValue => ({ kind: "known", text, numericValue });
const unknown = (text = "No data"): DisplayValue => ({ kind: "unknown", text });
const notTracked = (text = "Not allocated"): DisplayValue => ({ kind: "not_tracked", text });
const action = (id: string, label: string, state: ViewAction["state"] = "enabled", disabledReason?: string): ViewAction => ({ id, label, state, disabledReason });

const euro = (value: number | null) =>
  value === null
    ? unknown()
    : known(new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value), value);
const aed = (value: number | null) =>
  value === null
    ? notTracked()
    : known(new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(value), value);
const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};
const shiftMonth = (value: string, delta: number) => {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};
const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()).slice(0, 7);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "J";
const compact = (value: number | null) => value === null ? unknown() : known(new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value), value);
const delta = (value: number | null, previous: number | null): FinanceDelta => {
  if (value === null || previous === null || previous === 0) return { ...unknown("—"), display: "none" };
  const percent = ((value - previous) / Math.abs(previous)) * 100;
  return { ...known(`${percent >= 0 ? "+" : ""}${Math.round(percent)}%`, percent), direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat", display: "percent" };
};
// A delta is only a percentage when the server says it is. When the prior value
// was zero — or the base was too small for a percentage to carry meaning — the
// server sends the absolute change instead, and labelling that with "%" turned
// a gain of 4,300 into "+4300%".
const socialDelta = (value: number | null, mode: SocialDeltaMode = "percent"): FinanceDelta => {
  if (value === null || mode === "none") return { ...unknown("—"), display: "none" };
  const sign = value >= 0 ? "+" : "";
  const text = mode === "percent"
    ? `${sign}${Math.round(value)}%`
    : `${sign}${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(value))}`;
  return { ...known(text, value), direction: value > 0 ? "up" : value < 0 ? "down" : "flat", display: mode };
};
/** Failing checks sort above warnings, which sort above passes. */
const healthCheckRank = (state: string) => (state === "fail" ? 0 : state === "warn" ? 1 : 2);

/** This is a page-data snapshot, not an independent uptime probe. */
const snapshotLabel = (value: string) => Number.isNaN(Date.parse(value)) ? "Snapshot time unavailable" : `Snapshot ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" }).format(new Date(value))} GST`;

const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" }).format(new Date(value))
  : "No date";
const timeLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" }).format(new Date(value))
  : "—";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const isOverdue = (task: HomeTask) => Boolean(task.due_at && task.due_at.slice(0, 10) < today() && ["not_started", "in_progress"].includes(task.status));

function financeModel(money: Money): HomeDashboardViewModel["finance"] {
  const history = money.history.filter((point) => point.revenueEur !== null);
  const expenseSegments = money.costSegments.length
    ? money.costSegments.map((segment) => ({ label: segment.category, share: segment.percentage }))
    : null;
  const current = money.month === currentMonth();
  const projectedFromIndex = history.findIndex((point) => point.isProjected);
  return {
    monthLabel: known(monthLabel(money.month)),
    state: money.month > currentMonth() ? "projected" : current ? "current" : "actual",
    canStepBack: money.month > (history[0]?.month ?? money.month),
    // Forward navigation reaches exactly as far as real forecast data goes, so
    // the 'projected' month state and confidence chip are reachable when — and
    // only when — there is something real to project.
    canStepForward: money.month < (money.forecastHorizonMonth || currentMonth()),
    revenue: { value: euro(money.revenueEur), delta: delta(money.revenueEur, money.previous?.revenueEur ?? null), note: known(money.month > currentMonth() ? "Projected revenue · incomplete inputs stay unknown" : "Recorded net revenue in EUR") },
    expenses: { value: euro(money.expensesEur), delta: delta(money.expensesEur, money.previous?.expensesEur ?? null), note: known(money.month > currentMonth() ? "Cost forecast not established" : "Recorded costs in EUR"), split: money.month > currentMonth() ? null : expenseSegments },
    profit: {
      value: euro(money.profitEur),
      delta: delta(money.profitEur, money.previous?.profitEur ?? null),
      marginPct: money.revenueEur && money.profitEur !== null ? known(`${Math.round((money.profitEur / money.revenueEur) * 100)}% margin`) : unknown("Margin unavailable"),
    },
    sparkline: history.length > 1 ? { values: history.map((point) => point.revenueEur as number), projectedFromIndex: projectedFromIndex === -1 ? null : projectedFromIndex } : null,
    projection: money.projection ? {
      committed: euro(money.projection.committedEur),
      // The legend says "Weighted pipeline" whenever confidence is known, so the
      // weighted figure is what must be shown. Falls back to the raw total only
      // when probabilities are missing — and the legend then says "Pipeline".
      pipeline: euro(money.projection.weightedPipelineEur ?? money.projection.pipelineEur),
      confidencePct: money.projection.confidencePct === null
        ? null
        : known(`${Math.round(money.projection.confidencePct)}%`, money.projection.confidencePct),
    } : null,
    entries: money.transactions.map((entry) => ({
      id: entry.id,
      name: entry.name,
      meta: dateLabel(entry.date),
      amount: known(`${entry.direction === "out" ? "−" : "+"}${new Intl.NumberFormat("en-IE", { style: "currency", currency: entry.currency, maximumFractionDigits: 0 }).format(entry.amount)}`, entry.amount),
      probabilityPct: null,
    })),
    entriesTotalCount: money.transactions.length,
  };
}


function reachableCapabilities(capabilities: HomeDashboardData["roadmap"]["capabilities"]) {
  const selected = new Set([
    ...capabilities.filter((capability) => capability.status === "done").slice(-2),
    ...capabilities.filter((capability) => capability.status === "active").slice(0, 1),
    ...capabilities.filter((capability) => capability.status === "next").slice(0, 2),
  ].map((capability) => capability.id));

  return capabilities.filter((capability) => selected.has(capability.id)).slice(0, 5);
}

export default function HomeDashboardProduction({ data, busy, error, onAccept, onDismiss, onClearError, onTaskMove, onTaskCreate }: Props) {
  const router = useRouter();
  const [money, setMoney] = useState<Money>(data.money);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeEntriesExpanded, setFinanceEntriesExpanded] = useState(true);
  const [financeEntriesShowAll, setFinanceEntriesShowAll] = useState(false);
  const [activeBriefing, setActiveBriefing] = useState(0);
  const [activeTaskLane, setActiveTaskLane] = useState<TaskLaneKey>("not_started");
  const {seed} = useNotifications();
  useEffect(() => { seed(data); }, [data, seed]);
  // A drag re-orders locally straight away so the card lands where it was
  // dropped; the server call follows. Cleared whenever fresh server data
  // arrives, so the truth always wins in the end.
  const [taskDraft, setTaskDraft] = useState<HomeDashboardData["tasks"] | null>(null);
  const [taskMoveBusy, setTaskMoveBusy] = useState(false);
  const moneyRef = useRef(money);
  const financeAnimationFrame = useRef<number | null>(null);

  useEffect(() => {
    moneyRef.current = money;
  }, [money]);

  useEffect(() => () => {
    if (financeAnimationFrame.current !== null) cancelAnimationFrame(financeAnimationFrame.current);
  }, []);

  // Adjust during render rather than in an effect: when a fresh server list
  // arrives it supersedes the optimistic one, with no cascading re-render.
  const [taskDraftBasis, setTaskDraftBasis] = useState(data.tasks);
  if (taskDraftBasis !== data.tasks) {
    setTaskDraftBasis(data.tasks);
    setTaskDraft(null);
  }

  const boardTasks = taskDraft ?? data.tasks;

  async function handleTaskMove(move: { taskId: string; from: TaskLaneKey; to: TaskLaneKey; orderedTaskIds: string[] }) {
    if (taskMoveBusy) return;
    const positions = new Map(move.orderedTaskIds.map((id, index) => [id, index]));
    setTaskDraft(
      boardTasks.map((task) => {
        const moved = task.id === move.taskId ? { ...task, status: move.to } : task;
        const position = positions.get(moved.id);
        return position === undefined ? moved : { ...moved, manual_order: position };
      }),
    );
    setTaskMoveBusy(true);
    try {
      await onTaskMove(move);
    } finally {
      setTaskMoveBusy(false);
    }
  }

  const notifications = data.notifications;
  const suggestions = data.suggestions.slice(0, 5);
  const briefingIndex = Math.min(activeBriefing, Math.max(0, suggestions.length - 1));
  const activeSuggestion = suggestions[briefingIndex] ?? null;
  const model = useMemo<HomeDashboardViewModel>(() => {
    const lanes: TaskLaneKey[] = ["not_started", "in_progress", "completed", "reviewed"];
    const capabilitiesDone = data.roadmap.capabilities.filter((capability) => capability.status === "done").length;
    const notificationsForView = notificationGroups(notifications, "all");
    return {
      greeting: { userFirstName: known("Calvin"), dateLine: known(`${data.dateLabel} · Dubai`), timeOfDayGreeting: data.greeting.replace("Good ", "").toLowerCase() as "morning" | "afternoon" | "evening" },
      briefing: activeSuggestion ? {
        kind: "items",
        activeIndex: briefingIndex,
        items: suggestions.map((suggestion) => ({
          id: suggestion.id,
          eyebrow: known(`${suggestion.priority.toUpperCase()} · ${suggestion.clientName ?? "Jarvis"}`),
          lead: suggestion.title,
          tail: suggestion.detail,
          metric: known("Open"),
          metricLabel: known("suggestion"),
          primaryAction: action(`suggestion-${suggestion.id}-accept`, "Add to tasks", busy?.startsWith(`suggestion:${suggestion.id}`) ? "loading" : "enabled"),
          openAction: action(`suggestion-${suggestion.id}-open`, "Open"),
        })),
      } : { kind: "empty" },
      finance: financeModel(money),
      clients: {
        cards: data.clients.map((client) => ({
          id: client.id,
          name: client.name,
          monogram: initials(client.name),
          logoUrl: client.logoUrl,
          status: client.status,
          industry: client.industry ? known(client.industry) : notTracked("Client"),
          retainer: aed(client.revenueAed),
          adjustmentsCount: client.adjustmentsCount,
          approvalsCount: client.approvalsCount,
          workRequiredCount: client.workRequiredCount,
          openTaskCount: client.openTaskCount,
          latestSignal: client.latestSignal,
          stats: [
            { key: "followers", value: compact(client.social.followers), delta: socialDelta(client.social.followerDelta, client.social.followerDeltaMode) },
            { key: "reach_30d", value: compact(client.social.reach30d), delta: socialDelta(client.social.reachDelta, client.social.reachDeltaMode) },
            { key: "engagement", value: compact(client.social.engagements), delta: socialDelta(client.social.engagementDelta, client.social.engagementDeltaMode) },
          ],
          reachSeries: client.social.reachSeries,
          openAction: action(`client-open-${client.id}`, "Open client"),
        })),
      },
      tasks: {
        lanes: lanes.map((lane) => {
          const tasks = boardTasks.filter((task) => task.status === lane).sort((a, b) => a.manual_order - b.manual_order);
          return {
            key: lane,
            label: ({ not_started: "Not started", in_progress: "In progress", completed: "Completed", reviewed: "Reviewed" } as const)[lane],
            count: tasks.length,
            footerNote: known(tasks.length ? `${tasks.length} shown` : "Nothing waiting"),
            tasks: tasks.map((task) => ({
              id: task.id,
              title: task.title,
              owner: task.client_name ? known(task.client_name) : notTracked("Jarvis"),
              dueLabel: known(isOverdue(task) ? "Overdue" : dateLabel(task.due_at)),
              isOverdue: isOverdue(task),
              isActive: task.status === "in_progress",
              openAction: action(`task-open-${task.id}`, "Open task"),
            })),
          };
        }) as HomeDashboardViewModel["tasks"]["lanes"],
        openBoardAction: action("open-task-board", "Open board →"),
      },
      roadmap: {
        levelLabel: data.roadmap.activePhase ? known(`Phase ${data.roadmap.activePhase.index} of ${data.roadmap.activePhase.total} · ${data.roadmap.activePhase.name}`) : unknown("Roadmap unavailable"),
        completionPct: known(`${Math.round(data.roadmap.totalProgress)}% overall`, data.roadmap.totalProgress),
        capabilitiesDone,
        capabilitiesTotal: data.roadmap.capabilities.length,
        momentumNote: known(`${data.roadmap.momentum.shippedThisWeek} shipped this week${data.roadmap.momentum.streakWeeks ? ` · ${data.roadmap.momentum.streakWeeks}-week streak` : ""}`),
        layers: data.roadmap.phases.map((phase) => ({ name: phase.name, isActive: data.roadmap.activePhase?.name === phase.name })),
        milestones: reachableCapabilities(data.roadmap.capabilities).map((capability) => ({
          id: capability.id,
          title: capability.title,
          reward: capability.reward ? known(capability.reward) : unknown("No authored reward is recorded."),
          state: capability.status,
          stepsDone: capability.stepsDone,
          stepsTotal: capability.stepsTotal,
          blockedReason: capability.blockedReason ? known(capability.blockedReason) : null,
          openAction: action(`milestone-open-${capability.id}`, "Open roadmap"),
        })),
      },
      systemHealth: {
        kind: "known",
        scorePct: data.systemHealth.score,
        verdict: known(data.systemHealth.checks.some(check => check.state !== "ok") ? `${data.systemHealth.checks.filter(check => check.state !== "ok").length} check${data.systemHealth.checks.filter(check => check.state !== "ok").length === 1 ? "" : "s"} ${data.systemHealth.checks.filter(check => check.state !== "ok").length === 1 ? "needs" : "need"} attention` : "Available checks passed"),
        // Worst first. Showing the checks in declaration order buried the only
        // failing one behind "more checks", so the card could read "Needs
        // attention" while every check on screen was green.
        checks: [...data.systemHealth.checks]
          .sort((left, right) => healthCheckRank(left.state) - healthCheckRank(right.state)),
        moreChecksCount: 0,
        lastCheckedLabel: known(snapshotLabel(data.generatedAt)),
        openAction: action("system-health-open", "Open system health"),
      },
      rightRail: {
        needsYou: needsYou(notifications),
        publishingToday: data.publishingToday.map((item) => ({ id: item.id, timeLabel: known(timeLabel(item.scheduledAt)), title: item.title, clientName: item.clientName, kind: item.kind, openAction: action(`publishing-open-${item.id}`, "Open publishing") })),
        quickActions: [
          action("qa-new-task", "New task"),
          action("qa-log-expense", "Log expense"),
          action("qa-run-scanner", "Run scanner", "disabled", "Open Social to run a scanner."),
          action("qa-system", "System operations"),
        ],
      },
      notifications: { unreadCount: notifications.filter((item) => item.isUnread).length, groups: notificationsForView },
    };
  }, [activeSuggestion, boardTasks, briefingIndex, busy, data, money, notifications, suggestions]);

  function animateFinanceMonth(nextMoney: Money) {
    const startMoney = moneyRef.current;
    if (financeAnimationFrame.current !== null) cancelAnimationFrame(financeAnimationFrame.current);
    const startedAt = performance.now();
    const duration = 560;
    const interpolate = (from: number | null, to: number | null, progress: number) =>
      from === null || to === null ? (progress === 1 ? to : from) : Math.round(from + (to - from) * progress);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setMoney({
        ...nextMoney,
        revenueEur: interpolate(startMoney.revenueEur, nextMoney.revenueEur, eased),
        expensesEur: interpolate(startMoney.expensesEur, nextMoney.expensesEur, eased),
        profitEur: interpolate(startMoney.profitEur, nextMoney.profitEur, eased),
      });
      if (progress < 1) {
        financeAnimationFrame.current = requestAnimationFrame(tick);
      } else {
        financeAnimationFrame.current = null;
      }
    };
    financeAnimationFrame.current = requestAnimationFrame(tick);
  }

  async function loadMonth(direction: "prev" | "next") {
    const nextMonth = shiftMonth(money.month, direction === "prev" ? -1 : 1);
    // Bounded by the same forecast horizon the switcher's arrows use, so the
    // control and the loader agree on how far forward the data actually goes.
    if (financeBusy || nextMonth === money.month || nextMonth > (money.forecastHorizonMonth || currentMonth())) return;
    setFinanceBusy(true);
    try {
      const response = await fetch(`/api/home/finance?month=${encodeURIComponent(nextMonth)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Finance could not be refreshed.");
      animateFinanceMonth(body as Money);
    } finally {
      setFinanceBusy(false);
    }
  }

  const actions: HomeDashboardActions = {
    onBriefingPrev: () => setActiveBriefing((index) => suggestions.length ? (index - 1 + suggestions.length) % suggestions.length : 0),
    onBriefingNext: () => setActiveBriefing((index) => suggestions.length ? (index + 1) % suggestions.length : 0),
    onBriefingDismiss: () => activeSuggestion && onDismiss(activeSuggestion),
    onBriefingPrimary: () => activeSuggestion && onAccept(activeSuggestion),
    onBriefingOpen: () => activeSuggestion && router.push(activeSuggestion.href),
    onFinanceMonthChange: (direction) => void loadMonth(direction),
    onFinanceToggleEntries: () => setFinanceEntriesExpanded((value) => !value),
    onFinanceShowAllEntries: () => setFinanceEntriesShowAll((value) => !value),
    onClientOpen: (id) => router.push(data.clients.find((client) => client.id === id)?.href ?? "/clients"),
    onClientsOpen: () => router.push("/clients"),
    onTaskLaneSelect: setActiveTaskLane,
    onTaskOpen: (id) => router.push(`/tasks/${id}`),
    onTaskMove: (move) => void handleTaskMove(move),
    onTaskCreate: (lane, title) => void onTaskCreate(lane, title),
    onOpenTaskBoard: () => router.push("/tasks"),
    onMilestoneOpen: () => router.push("/roadmap"),
    onSystemHealthOpen: () => router.push("/system-operations"),

  };
  const state: HomeDashboardViewState = { activeTaskLane, financeEntriesExpanded, financeEntriesShowAll, taskDragDisabled: taskMoveBusy };

  return <>
    {error ? <div role="alert" style={{ padding: "12px 30px", color: "#F0564B" }}>{error} <button type="button" onClick={onClearError}>Dismiss</button></div> : null}
    <HomeDashboardView model={model} actions={actions} state={state} />
  </>;
}
