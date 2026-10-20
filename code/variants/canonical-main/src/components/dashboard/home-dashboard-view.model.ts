/**
 * Home Dashboard — ViewModel contract.
 * Presentation-only types. No Supabase/DB shapes, no server-action signatures.
 * Codex maps canonical Jarvis data into these shapes at the loader/server-component boundary.
 */

export type DisplayValue =
  | { kind: 'known'; text: string; numericValue?: number; tone?: 'default' | 'positive' | 'warning' | 'danger' }
  | { kind: 'not_tracked'; text?: string }
  | { kind: 'unknown'; text?: string }
  | { kind: 'loading' }
  | { kind: 'error'; text: string };

export type ActionState = 'enabled' | 'disabled' | 'loading' | 'hidden';

export type ViewAction = {
  id: string;
  label: string;
  state: ActionState;
  disabledReason?: string;
};

// ── Greeting ────────────────────────────────────────────────────────────────
export type GreetingViewModel = {
  userFirstName: DisplayValue;
  dateLine: DisplayValue;   // pre-formatted, e.g. 'Monday 31 August · Dubai' — no Date object
  timeOfDayGreeting: 'morning' | 'afternoon' | 'evening'; // resolved server-side, not computed client-side
};

// ── Briefing carousel ───────────────────────────────────────────────────────
export type BriefingItem = {
  id: string;
  eyebrow: DisplayValue;
  lead: string;         // bold clause — plain text, no markdown
  tail: string;
  metric: DisplayValue;
  metricLabel: DisplayValue;
  primaryAction: ViewAction;   // label varies per item: 'Add to tasks', 'Open studio', etc.
  openAction: ViewAction;      // always present, always the secondary
};

export type BriefingViewModel =
  | { kind: 'items'; items: BriefingItem[]; activeIndex: number }  // max 5 items
  | { kind: 'dismissed' }             // shows the "Restore briefing" affordance
  | { kind: 'empty' };                // no briefings — render nothing, not even the restore button

// ── Finance ─────────────────────────────────────────────────────────────────
export type FinanceMonthState = 'actual' | 'current' | 'projected';

export type FinanceDelta = DisplayValue & {
  direction?: 'up' | 'down' | 'flat';
  display?: 'percent' | 'absolute' | 'none';
};

export type FinanceMonthViewModel = {
  monthLabel: DisplayValue;         // 'August 2026'
  state: FinanceMonthState;
  canStepBack: boolean;
  canStepForward: boolean;
  revenue: { value: DisplayValue; delta: FinanceDelta; note: DisplayValue };
  expenses: { value: DisplayValue; delta: FinanceDelta; note: DisplayValue; split: { label: string; share: number }[] | null };
  profit: { value: DisplayValue; delta: FinanceDelta; marginPct: DisplayValue };
  sparkline: { values: number[]; projectedFromIndex: number | null } | null;   // null → no chart, not zeros
  projection: {
    committed: DisplayValue;
    pipeline: DisplayValue | null;      // null → pipeline UI (bar half + confidence chip) omitted entirely
    confidencePct: DisplayValue | null;
  } | null;                              // null on non-projected months
  entries: {
    id: string;
    name: string;
    meta: string;
    amount: DisplayValue;
    probabilityPct: number | null;
  }[];
  entriesTotalCount: number;             // UI shows first 3, "Show all N" for the rest
};

// ── Clients ─────────────────────────────────────────────────────────────────
export type ClientStatus = 'active' | 'onboarding' | 'inactive';

export type ClientStatViewModel = {
  key: 'followers' | 'reach_30d' | 'engagement';
  value: DisplayValue;               // 'not_tracked' or 'unknown' renders "No data", never 0
  delta: FinanceDelta;
};

export type ClientCardViewModel = {
  id: string;
  name: string;                      // realistic max length ~28 chars before truncation matters
  monogram: string;                  // 2 letters, always present as fallback
  logoUrl: string | null;
  status: ClientStatus;
  industry: DisplayValue;
  retainer: DisplayValue;            // 'not_tracked' → renders "Not allocated"
  adjustmentsCount: number;
  approvalsCount: number;
  workRequiredCount: number;         // 0 → "Nothing waiting" chip, not hidden
  stats: [ClientStatViewModel, ClientStatViewModel, ClientStatViewModel];
  reachSeries: number[] | null;      // exactly 8 points when present; null → no sparkline
  openAction: ViewAction;
};

export type ClientsViewModel = {
  cards: ClientCardViewModel[];      // pre-sorted by Codex; view renders in given order
};

// ── Tasks ───────────────────────────────────────────────────────────────────
export type TaskLaneKey = 'not_started' | 'in_progress' | 'completed' | 'reviewed';

export type TaskCardViewModel = {
  id: string;
  title: string;
  owner: DisplayValue;
  dueLabel: DisplayValue;    // 'No date' | '02 Sep' | 'Today' | 'Overdue'
  isOverdue: boolean;
  isActive: boolean;         // the one 'hot' amber-marked task, if any
  openAction: ViewAction;
};

export type TaskLaneViewModel = {
  key: TaskLaneKey;
  label: string;
  count: number;
  footerNote: DisplayValue;
  tasks: TaskCardViewModel[];
};

export type TasksViewModel = {
  lanes: [TaskLaneViewModel, TaskLaneViewModel, TaskLaneViewModel, TaskLaneViewModel];
  openBoardAction: ViewAction;
};

// ── Roadmap ─────────────────────────────────────────────────────────────────
export type MilestoneState = 'done' | 'active' | 'next' | 'locked';

export type MilestoneViewModel = {
  id: string;
  title: string;
  reward: DisplayValue;              // authored outcome, or explicit unknown when not yet written
  state: MilestoneState;
  stepsDone: number;
  stepsTotal: number;
  blockedReason: DisplayValue | null;
  openAction: ViewAction;
};

export type RoadmapViewModel = {
  levelLabel: DisplayValue;          // 'Level 1 of 4 · OS 1 Create'
  completionPct: DisplayValue;
  capabilitiesDone: number;
  capabilitiesTotal: number;
  momentumNote: DisplayValue;        // '2 shipped this week · 3-week streak'
  layers: { name: string; isActive: boolean }[];
  milestones: MilestoneViewModel[];  // the reachable subset, not all capabilities
};

// ── System health (footer) ─────────────────────────────────────────────────
export type HealthCheckState = 'ok' | 'warn' | 'fail';

export type HealthCheckViewModel = {
  name: string;
  note: string;                      // human explanation — never render state with no note
  state: HealthCheckState;
};

export type SystemHealthViewModel =
  | { kind: 'known'; scorePct: number; verdict: DisplayValue; checks: HealthCheckViewModel[]; moreChecksCount: number; lastCheckedLabel: DisplayValue; openAction: ViewAction }
  | { kind: 'unavailable' };          // endpoint doesn't exist yet — hide the whole footer block

// ── Right rail ──────────────────────────────────────────────────────────────
export type RailRowViewModel = {
  id: string;
  label: string;
  note: DisplayValue;
  value: DisplayValue;
  tone: 'green' | 'amber' | 'plain';
  openAction: ViewAction;
};

export type PublishingItemViewModel = {
  id: string;
  timeLabel: DisplayValue;
  title: string;
  clientName: string;
  kind: 'feed' | 'story';
  openAction: ViewAction;
};

export type RightRailViewModel = {
  needsYou: RailRowViewModel[];              // empty array → section hidden
  publishingToday: PublishingItemViewModel[]; // empty array → section hidden
  quickActions: ViewAction[];                 // exactly 4, 2x2 grid
};

// ── Notifications (page-owned; see README §1) ───────────────────────────────
export type NotificationKind = 'approval' | 'adjustment' | 'system' | 'finance';

export type NotificationItemViewModel = {
  id: string;
  title: string;
  meta: string;
  kind: NotificationKind;
  clientMonogram: string;
  clientLogoUrl: string | null;
  isUnread: boolean;
};

export type NotificationsViewModel = {
  unreadCount: number;               // the bell badge — must equal filtered-list count, not a separate field
  groups: { key: 'today' | 'earlier'; items: NotificationItemViewModel[] }[]; // empty group → omit, not empty state
};

// ── Root ─────────────────────────────────────────────────────────────────────
export type HomeDashboardViewModel = {
  greeting: GreetingViewModel;
  briefing: BriefingViewModel;
  finance: FinanceMonthViewModel;
  clients: ClientsViewModel;
  tasks: TasksViewModel;
  roadmap: RoadmapViewModel;
  systemHealth: SystemHealthViewModel;
  rightRail: RightRailViewModel;
  notifications: NotificationsViewModel;
};

export type HomeDashboardActions = {
  onBriefingPrev?: () => void;
  onBriefingNext?: () => void;
  onBriefingDismiss?: () => void;
  onBriefingRestore?: () => void;
  onBriefingPrimary?: (itemId: string) => void;
  onBriefingOpen?: (itemId: string) => void;

  onFinanceMonthChange?: (direction: 'prev' | 'next') => void;
  onFinanceToggleEntries?: () => void;      // accordion open/close
  onFinanceShowAllEntries?: () => void;     // expand past the 3-row cap

  onClientOpen?: (clientId: string) => void;
  onClientsOpen?: () => void;

  onTaskLaneSelect?: (lane: TaskLaneKey) => void;   // mobile snap-rail chip
  onTaskOpen?: (taskId: string) => void;
  onOpenTaskBoard?: () => void;
  /**
   * A task was dragged. `orderedTaskIds` is the destination lane's full contents
   * in their new order, including the moved task, so the integration can persist
   * both the status change and the ordering in one intent.
   */
  onTaskMove?: (move: {
    taskId: string;
    from: TaskLaneKey;
    to: TaskLaneKey;
    orderedTaskIds: string[];
  }) => void;
  /** A new task was submitted from a lane's own composer. */
  onTaskCreate?: (lane: TaskLaneKey, title: string) => void;

  onMilestoneOpen?: (milestoneId: string) => void;

  onSystemHealthOpen?: () => void;

  onRailRowOpen?: (rowId: string) => void;
  onPublishingItemOpen?: (itemId: string) => void;
  onQuickAction?: (actionId: string) => void;

  onNotificationsOpen?: () => void;
  onNotificationsClose?: () => void;
  onNotificationFilterChange?: (filter: 'all' | NotificationKind) => void;
  onNotificationOpen?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
};

export type HomeDashboardViewState = {
  activeTaskLane?: TaskLaneKey;        // visual-only: which lane the mobile rail/chips show
  taskDragDisabled?: boolean;          // suppress dragging while a move is in flight
  activeMilestoneId?: string;
  notificationsOpen?: boolean;
  notificationFilter?: 'all' | NotificationKind;
  financeEntriesExpanded?: boolean;
  financeEntriesShowAll?: boolean;
};

export type HomeDashboardViewProps = {
  model: HomeDashboardViewModel;
  actions: HomeDashboardActions;
  state?: HomeDashboardViewState;
};
