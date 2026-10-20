"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import HomeDashboardView from "@/components/dashboard/home-dashboard-view";
import type {
  DisplayValue,
  FinanceDelta,
  HomeDashboardActions,
  HomeDashboardViewModel,
  HomeDashboardViewState,
  NotificationKind,
  TaskLaneKey,
  ViewAction,
} from "@/components/dashboard/home-dashboard-view.model";
import type {
  HomeDashboardData,
  HomeNotification,
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

/** Reports when the snapshot was taken, rather than asserting it is current. */
const checkedAgoLabel = (generatedAt: string, nowMs: number) => {
  const generatedMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedMs)) return "Checked just now";
  const minutes = Math.max(0, Math.round((nowMs - generatedMs) / 60_000));
  if (minutes < 1) return "Checked just now";
  if (minutes < 60) return `Checked ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `Checked ${hours} hour${hours === 1 ? "" : "s"} ago` : `Checked ${Math.round(hours / 24)}d ago`;
};

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
  const monthPoint = money.history.find((point) => point.month === money.month);
  const projectedFromIndex = history.findIndex((point) => point.isProjected);
  return {
    monthLabel: known(monthLabel(money.month)),
    state: monthPoint?.isProjected ? "projected" : current ? "current" : "actual",
    canStepBack: money.month > (history[0]?.month ?? money.month),
    // Forward navigation reaches exactly as far as real forecast data goes, so
    // the 'projected' month state and confidence chip are reachable when — and
    // only when — there is something real to project.
    canStepForward: money.month < (money.forecastHorizonMonth || currentMonth()),
    revenue: { value: euro(money.revenueEur), delta: delta(money.revenueEur, money.previous?.revenueEur ?? null), note: known("Recorded net revenue in EUR") },
    expenses: { value: euro(money.expensesEur), delta: delta(money.expensesEur, money.previous?.expensesEur ?? null), note: known("Recorded costs in EUR"), split: expenseSegments },
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
      meta: [entry.detail, entry.date ? dateLabel(entry.date) : null].filter(Boolean).join(" · "),
      amount: known(`${entry.direction === "out" ? "−" : "+"}${new Intl.NumberFormat("en-IE", { style: "currency", currency: entry.currency, maximumFractionDigits: 0 }).format(entry.amount)}`, entry.amount),
      probabilityPct: null,
    })),
    entriesTotalCount: money.transactions.length,
  };
}

function needsYou(notifications: HomeNotification[]) {
  const kinds: NotificationKind[] = ["approval", "adjustment", "system", "finance"];
  const labels: Record<NotificationKind, string> = { approval: "Approvals waiting", adjustment: "Adjustments requested", system: "System attention", finance: "Finance attention" };
  return kinds.flatMap((kind) => {
    const items = notifications.filter((item) => item.kind === kind && item.isUnread);
    if (!items.length) return [];
    return [{ id: `needs-${kind}`, label: labels[kind], note: known(items[0].meta), value: known(String(items.length), items.length), tone: kind === "approval" ? "green" as const : kind === "adjustment" || kind === "finance" ? "amber" as const : "plain" as const, openAction: action(`needs-${kind}-open`, "Open") }];
  });
}

function notificationGroups(items: HomeNotification[], filter: "all" | NotificationKind) {
  const filtered = filter === "all" ? items : items.filter((item) => item.kind === filter);
  const date = today();
  return (["today", "earlier"] as const).flatMap((key) => {
    const groupItems = filtered.filter((item) => (item.occurredAt.slice(0, 10) === date ? "today" : "earlier") === key).map((item) => ({
      id: item.id,
      title: item.title,
      meta: item.meta,
      kind: item.kind,
      clientMonogram: item.clientName ? initials(item.clientName) : "J",
      clientLogoUrl: item.clientLogoUrl,
      isUnread: item.isUnread,
    }));
    return groupItems.length ? [{ key, items: groupItems }] : [];
  });
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | NotificationKind>("all");
  const [readNotificationSourceKeys, setReadNotificationSourceKeys] = useState<Set<string>>(() => new Set());
  const [notificationBusy, setNotificationBusy] = useState(false);
  // A drag re-orders locally straight away so the card lands where it was
  // dropped; the server call follows. Cleared whenever fresh server data
  // arrives, so the truth always wins in the end.
  const [taskDraft, setTaskDraft] = useState<HomeDashboardData["tasks"] | null>(null);
  const [taskMoveBusy, setTaskMoveBusy] = useState(false);
  // Ticks so "checked N ago" advances without a page load. Held in state rather
  // than read during render, which would be impure and would freeze the label.
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const moneyRef = useRef(money);
  const financeAnimationFrame = useRef<number | null>(null);

  useEffect(() => {
    moneyRef.current = money;
  }, [money]);

  useEffect(() => () => {
    if (financeAnimationFrame.current !== null) cancelAnimationFrame(financeAnimationFrame.current);
  }, []);

  useEffect(() => {
    const openNotifications = () => setNotificationsOpen(true);
    window.addEventListener("jarvis:home-notifications-open", openNotifications);
    return () => window.removeEventListener("jarvis:home-notifications-open", openNotifications);
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

  // Escape closes the panel, matching the scrim's click-away.
  useEffect(() => {
    if (!notificationsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notificationsOpen]);

  const notifications = useMemo(
    () => data.notifications.map((item) => readNotificationSourceKeys.has(item.sourceKey) ? { ...item, isUnread: false } : item),
    [data.notifications, readNotificationSourceKeys],
  );

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("jarvis:home-notification-state", {
      detail: { unreadCount: notifications.filter((item) => item.isUnread).length },
    }));
  }, [notifications]);

  const suggestions = data.suggestions.slice(0, 5);
  const briefingIndex = Math.min(activeBriefing, Math.max(0, suggestions.length - 1));
  const activeSuggestion = suggestions[briefingIndex] ?? null;
  const model = useMemo<HomeDashboardViewModel>(() => {
    const lanes: TaskLaneKey[] = ["not_started", "in_progress", "completed", "reviewed"];
    const activeTaskId = boardTasks.find((task) => task.status === "in_progress")?.id ?? null;
    const capabilitiesDone = data.roadmap.capabilities.filter((capability) => capability.status === "done").length;
    const notificationsForView = notificationGroups(notifications, notificationFilter);
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
              isActive: task.id === activeTaskId,
              openAction: action(`task-open-${task.id}`, "Open task"),
            })),
          };
        }) as HomeDashboardViewModel["tasks"]["lanes"],
        openBoardAction: action("open-task-board", "Open board →"),
      },
      roadmap: {
        levelLabel: data.roadmap.activePhase ? known(`Level ${data.roadmap.activePhase.index} of ${data.roadmap.activePhase.total} · ${data.roadmap.activePhase.name}`) : unknown("Roadmap unavailable"),
        completionPct: known(`${Math.round(data.roadmap.totalProgress)}%`, data.roadmap.totalProgress),
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
        verdict: known(data.systemHealth.score >= 90 ? "Healthy" : "Needs attention"),
        // Worst first. Showing the checks in declaration order buried the only
        // failing one behind "more checks", so the card could read "Needs
        // attention" while every check on screen was green.
        checks: [...data.systemHealth.checks]
          .sort((left, right) => healthCheckRank(left.state) - healthCheckRank(right.state))
          .slice(0, 3),
        moreChecksCount: Math.max(0, data.systemHealth.checks.length - 3),
        lastCheckedLabel: known(checkedAgoLabel(data.generatedAt, clockMs)),
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
  }, [activeSuggestion, boardTasks, briefingIndex, busy, data, money, notificationFilter, notifications, suggestions]);

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

  async function markNotificationsRead(ids: string[]) {
    const sourceKeys = notifications.filter((item) => ids.includes(item.id) && item.isUnread).map((item) => item.sourceKey);
    if (!sourceKeys.length || notificationBusy) return;
    setNotificationBusy(true);
    try {
      const response = await fetch("/api/home/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_read", sourceKeys }) });
      if (!response.ok) throw new Error("Notifications could not be updated.");
      setReadNotificationSourceKeys((current) => new Set([...current, ...sourceKeys]));
    } finally {
      setNotificationBusy(false);
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
    onRailRowOpen: (id) => {
      const kind = id.replace("needs-", "") as NotificationKind;
      const item = notifications.find((notification) => notification.kind === kind);
      if (item) router.push(item.href);
    },
    onPublishingItemOpen: (id) => {
      const item = data.publishingToday.find((publishing) => publishing.id === id);
      if (item) router.push(item.href);
    },
    onQuickAction: (id) => {
      const destinations: Record<string, string> = { "qa-new-task": "/tasks", "qa-log-expense": "/finance", "qa-system": "/system-operations" };
      if (destinations[id]) router.push(destinations[id]);
    },
    onNotificationsOpen: () => setNotificationsOpen(true),
    onNotificationsClose: () => setNotificationsOpen(false),
    onNotificationFilterChange: setNotificationFilter,
    onNotificationOpen: (id) => {
      const item = notifications.find((notification) => notification.id === id);
      if (!item) return;
      void markNotificationsRead([id]);
      setNotificationsOpen(false);
      router.push(item.href);
    },
    onMarkAllNotificationsRead: () => void markNotificationsRead(notifications.map((item) => item.id)),
  };
  const state: HomeDashboardViewState = { activeTaskLane, notificationsOpen, notificationFilter, financeEntriesExpanded, financeEntriesShowAll, taskDragDisabled: taskMoveBusy };

  return <>
    {error ? <div role="alert" style={{ padding: "12px 30px", color: "#F0564B" }}>{error} <button type="button" onClick={onClearError}>Dismiss</button></div> : null}
    <HomeDashboardView model={model} actions={actions} state={state} />
  </>;
}
