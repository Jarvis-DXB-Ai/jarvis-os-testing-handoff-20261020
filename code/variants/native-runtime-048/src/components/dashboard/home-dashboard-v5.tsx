"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./home-dashboard-v5.module.css";
import type {
  HomeDashboardData,
  HomeSuggestion,
  HomeTask,
} from "@/lib/home-dashboard";

type Props = {
  data: HomeDashboardData;
  busy: string | null;
  error: string | null;
  onAccept: (item: HomeSuggestion) => void;
  onDismiss: (item: HomeSuggestion) => void;
  onClearError: () => void;
};
type Money = HomeDashboardData["money"];
type Lane = Extract<
  HomeTask["status"],
  "not_started" | "in_progress" | "completed" | "reviewed"
>;
const laneDefs: { key: Lane; label: string }[] = [
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "reviewed", label: "Reviewed" },
];
const euro = (value: number | null) =>
  value === null
    ? "Not available"
    : new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
const monthText = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};
const shiftMonth = (value: string, delta: number) => {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};
const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" })
    .format(new Date())
    .slice(0, 7);
const taskMeta = (task: HomeTask) =>
  task.client_name ||
  (task.due_at
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Dubai",
      }).format(new Date(task.due_at))
    : "No client or due date");
const compactNumber = (value: number | null) =>
  value === null
    ? "No data"
    : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const signedChange = (value: number | null, suffix = "%") =>
  value === null ? "—" : `${value >= 0 ? "+" : ""}${Math.round(value)}${suffix}`;
const financeDelta = (value: number | null, previous: number | null) =>
  value === null || previous === null || previous === 0
    ? null
    : ((value - previous) / Math.abs(previous)) * 100;

export default function HomeDashboardV5({
  data,
  busy,
  error,
  onAccept,
  onDismiss,
  onClearError,
}: Props) {
  const [active, setActive] = useState(0);
  const [money, setMoney] = useState<Money>(data.money);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [allActivity, setAllActivity] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(data.notifications);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const suggestion = data.suggestions[active] ?? data.suggestions[0] ?? null;
  const openTasks = useMemo(
    () =>
      data.tasks.filter(
        (task) =>
          task.status === "not_started" || task.status === "in_progress",
      ),
    [data.tasks],
  );
  const lanes = useMemo(
    () =>
      laneDefs.map((lane) => ({
        ...lane,
        tasks: data.tasks
          .filter((task) => task.status === lane.key)
          .sort((a, b) => a.manual_order - b.manual_order),
      })),
    [data.tasks],
  );
  const attention = data.clients.reduce(
    (total, client) => total + client.attentionCount,
    0,
  );
  async function loadMonth(month: string) {
    if (financeBusy || month === money.month) return;
    setFinanceBusy(true);
    setFinanceError(null);
    try {
      const response = await fetch(
        `/api/home/finance?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Finance could not be refreshed.");
      setMoney(body as Money);
    } catch (cause) {
      setFinanceError(
        cause instanceof Error
          ? cause.message
          : "Finance could not be refreshed.",
      );
    } finally {
      setFinanceBusy(false);
    }
  }
  async function markNotificationsRead(sourceKeys: string[]) {
    if (!sourceKeys.length || notificationBusy) return;
    setNotificationBusy(true);
    try {
      const response = await fetch("/api/home/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", sourceKeys }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Notifications could not be updated.");
      const read = new Set(sourceKeys);
      setNotifications((items) => items.map((item) => read.has(item.sourceKey) ? { ...item, isUnread: false } : item));
    } catch (cause) {
      setFinanceError(cause instanceof Error ? cause.message : "Notifications could not be updated.");
    } finally {
      setNotificationBusy(false);
    }
  }
  const unreadNotifications = notifications.filter((item) => item.isUnread);
  return (
    <main className={styles.app}>
      <div className={styles.mobileChrome} aria-hidden="true">
        <span>JARVIS</span>
        <i />
      </div>
      <div className={styles.main}>
        <div className={styles.texture} aria-hidden="true" />
        <div className={styles.bloom} aria-hidden="true" />
        <div className={styles.columns}>
          <div className={styles.column}>
            <header className={styles.pageHeader}>
              <p>{data.dateLabel} · Dubai</p>
              <h1>
                {data.greeting}, <strong>Calvin</strong>
              </h1>
              <span>
                {data.clients.length} active clients · {openTasks.length} open
                tasks
              </span>
              <button
                type="button"
                className={styles.notificationTrigger}
                onClick={() => setNotificationsOpen(true)}
                aria-label={`Notifications${unreadNotifications.length ? `, ${unreadNotifications.length} unread` : ""}`}
              >
                <span aria-hidden="true">⌁</span>
                {unreadNotifications.length ? <b>{unreadNotifications.length}</b> : null}
              </button>
            </header>
            {error ? (
              <div role="alert" className={styles.error}>
                <span>{error}</span>
                <button type="button" onClick={onClearError}>
                  Dismiss
                </button>
              </div>
            ) : null}
            <section className={styles.briefing}>
              <div className={styles.grain} aria-hidden="true" />
              {suggestion ? (
                <div className={styles.briefingInner}>
                  <div>
                    <p className={styles.kicker}>
                      What matters today · {active + 1}/
                      {data.suggestions.length}
                    </p>
                    <h2>{suggestion.title}</h2>
                    <p className={styles.briefCopy}>{suggestion.detail}</p>
                  </div>
                  <div className={styles.briefActions}>
                    <Link href={suggestion.href}>Open</Link>
                    <button
                      type="button"
                      disabled={busy?.startsWith(`suggestion:${suggestion.id}`)}
                      onClick={() => onAccept(suggestion)}
                    >
                      Add to tasks
                    </button>
                    <button
                      type="button"
                      disabled={busy?.startsWith(`suggestion:${suggestion.id}`)}
                      onClick={() => onDismiss(suggestion)}
                    >
                      Dismiss
                    </button>
                  </div>
                  {data.suggestions.length > 1 ? (
                    <div className={styles.dots}>
                      {data.suggestions.map((item, index) => (
                        <button
                          type="button"
                          key={item.id}
                          className={index === active ? styles.active : ""}
                          aria-label={`Show briefing ${index + 1}`}
                          onClick={() => setActive(index)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.briefingInner}>
                  <p className={styles.kicker}>What matters today</p>
                  <h2>No decision is waiting.</h2>
                  <p className={styles.briefCopy}>
                    Jarvis will surface evidence-backed items when the operating
                    state changes.
                  </p>
                </div>
              )}
            </section>
            <Section number="01" title="Finance">
              <div className={styles.monthSwitch}>
                <button
                  type="button"
                  disabled={financeBusy}
                  aria-label="Previous month"
                  onClick={() => loadMonth(shiftMonth(money.month, -1))}
                >
                  ‹
                </button>
                <span>
                  {monthText(money.month)}{" "}
                  <i
                    className={
                      money.month === currentMonth() ? styles.current : ""
                    }
                  >
                    {money.month === currentMonth() ? "Current" : "Recorded"}
                  </i>
                </span>
                <button
                  type="button"
                  disabled={financeBusy || money.month === currentMonth()}
                  aria-label="Next month"
                  onClick={() => loadMonth(shiftMonth(money.month, 1))}
                >
                  ›
                </button>
              </div>
              <div className={styles.financeGrid}>
                <Metric
                  className={styles.revenue}
                  label="Revenue"
                  value={euro(money.revenueEur)}
                  note="Recorded revenue"
                  delta={financeDelta(money.revenueEur, money.previous?.revenueEur ?? null)}
                  spark={money.history.map((point) => point.revenueEur).filter((value): value is number => value !== null)}
                />
                <Metric
                  label="Expenses"
                  value={euro(money.expensesEur)}
                  note="Recorded costs"
                  amber
                  delta={financeDelta(money.expensesEur, money.previous?.expensesEur ?? null)}
                />
                <Metric
                  label="Profit"
                  value={euro(money.profitEur)}
                  note="Revenue less expenses"
                  delta={financeDelta(money.profitEur, money.previous?.profitEur ?? null)}
                />
              </div>
              {financeError ? (
                <p role="alert" className={styles.inlineError}>
                  {financeError}
                </p>
              ) : null}
              <div className={styles.activity}>
                <div className={styles.activityHead}>
                  <b>Recent Finance activity</b>
                  <small>
                    {money.activitySource === "settled_bank_records"
                      ? "Settled business bank records"
                      : money.activitySource === "finance_records"
                        ? "Finance records"
                        : "No Finance activity is recorded"}
                  </small>
                </div>
                {money.transactions
                  .slice(0, allActivity ? money.transactions.length : 3)
                  .map((item) => (
                    <div className={styles.transaction} key={item.id}>
                      <span>
                        <b>{item.name}</b>
                        <small>{item.detail}</small>
                      </span>
                      <time>
                        {item.date
                          ? new Intl.DateTimeFormat("en-GB", {
                              day: "numeric",
                              month: "short",
                              timeZone: "Asia/Dubai",
                            }).format(new Date(item.date))
                          : "—"}
                      </time>
                      <strong
                        className={item.direction === "out" ? styles.out : ""}
                      >
                        {item.direction === "out" ? "−" : "+"}
                        {new Intl.NumberFormat("en-IE", {
                          style: "currency",
                          currency: item.currency,
                          maximumFractionDigits: 0,
                        }).format(item.amount)}
                      </strong>
                    </div>
                  ))}
                {money.transactions.length === 0 ? (
                  <p className={styles.empty}>
                    No activity is recorded for this month.
                  </p>
                ) : null}
                {money.transactions.length > 3 ? (
                  <button
                    type="button"
                    className={styles.showMore}
                    onClick={() => setAllActivity(!allActivity)}
                  >
                    {allActivity
                      ? "Show less"
                      : `Show all ${money.transactions.length} records →`}
                  </button>
                ) : null}
              </div>
            </Section>
            <Section
              number="02"
              title="Clients"
              action={<Link href="/clients">All clients →</Link>}
            >
              <div className={styles.clients}>
                {data.clients.map((client) => (
                  <Link
                    className={`${styles.clientCard} ${client.status === "inactive" ? styles.clientInactive : client.status === "onboarding" ? styles.clientOnboarding : ""}`}
                    href={client.href}
                    key={client.id}
                  >
                    <div className={styles.clientTop}>
                      <span className={styles.avatar}>
                        {client.logoUrl ? (
                          <>
                            {/* Client logos are remote signed URLs, not Next image-loader assets. */}
                            <img src={client.logoUrl} alt="" />
                          </>
                        ) : (
                          client.name
                            .split(/\s+/)
                            .map((word) => word[0])
                            .slice(0, 2)
                            .join("")
                        )}
                      </span>
                      <span className={styles.clientName}>
                        <b>{client.name} <i className={client.status === "active" ? styles.statusActive : ""}>{client.status === "active" ? "Active" : client.status === "onboarding" ? "Onboarding" : "Not active"}</i></b>
                        <small>
                          {client.industry ?? "Client"}
                          {client.revenueAed !== null
                            ? ` · ${new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(client.revenueAed)}`
                            : ""}
                        </small>
                      </span>
                      <em>
                        {client.workRequiredCount
                          ? `${client.workRequiredCount} items need you`
                          : "Nothing waiting"}
                      </em>
                    </div>
                    <div className={styles.clientFacts}>
                      <span>
                        <small>Followers</small>
                        <b>{compactNumber(client.social.followers)}</b>
                        <i>{signedChange(client.social.followerDelta, "")}</i>
                      </span>
                      <span>
                        <small>Reach 30d</small>
                        <b>{compactNumber(client.social.reach30d)}</b>
                        <i>{signedChange(client.social.reachDelta)}</i>
                      </span>
                      <span>
                        <small>Engagement</small>
                        <b>{compactNumber(client.social.engagements)}</b>
                        <i>{signedChange(client.social.engagementDelta)}</i>
                      </span>
                      {client.social.reachSeries ? <span className={styles.clientSpark} aria-label="Reach history">{client.social.reachSeries.map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max(5, Math.round((point / Math.max(...client.social.reachSeries!)) * 30))}px` }} />)}</span> : null}
                    </div>
                    <div className={styles.clientWork}><span>{client.approvalsCount} appr</span><span>{client.adjustmentsCount} adj</span><b>{client.latestSignal ?? "No other signal"}</b></div>
                  </Link>
                ))}
              </div>
            </Section>
            <Section
              number="03"
              title="Tasks"
              action={<Link href="/tasks">Open task board →</Link>}
            >
              <div className={styles.lanes}>
                {lanes.map((lane) => (
                  <article
                    className={`${styles.lane} ${styles[`lane_${lane.key}`]}`}
                    key={lane.key}
                  >
                    <header>
                      <span>{lane.label}</span>
                      <b>{lane.tasks.length}</b>
                    </header>
                    {lane.tasks.slice(0, 5).map((task) => (
                      <Link href="/tasks" key={task.id}>
                        <strong>{task.title}</strong>
                        <small>{taskMeta(task)}</small>
                      </Link>
                    ))}
                    {lane.tasks.length === 0 ? (
                      <p>No tasks in this lane.</p>
                    ) : null}
                    {lane.tasks.length > 5 ? (
                      <Link className={styles.laneMore} href="/tasks">
                        +{lane.tasks.length - 5} more
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            </Section>
            <Section
              number="04"
              title="Roadmap"
              action={<Link href="/roadmap">Open roadmap →</Link>}
            >
              <div className={styles.roadmap}>
                <article className={styles.levelCard}>
                  <small>{data.roadmap.activePhase ? `Level ${data.roadmap.activePhase.index} of ${data.roadmap.activePhase.total} · ${data.roadmap.activePhase.name}` : "Current capability"}</small>
                  <h2>
                    {data.roadmap.primary?.title ?? "No active capability"}
                  </h2>
                  <strong>{Math.round(data.roadmap.totalProgress)}%</strong>
                  <Progress value={data.roadmap.totalProgress} />
                  <p>{data.roadmap.momentum.shippedThisWeek} shipped this week{data.roadmap.momentum.streakWeeks ? ` · ${data.roadmap.momentum.streakWeeks}-week streak` : ""}</p>
                </article>
                <div className={styles.phaseList}>
                  {data.roadmap.capabilities.map((capability) => (
                    <article className={`${styles.capability} ${styles[`capability_${capability.status}`]}`} key={capability.id}>
                      <span>
                        <b>{capability.title}</b>
                        <small>
                          {capability.stepsDone}/{capability.stepsTotal}
                        </small>
                      </span>
                      {capability.reward ? <p>{capability.reward}</p> : null}
                      <Progress value={capability.progress} />
                      {capability.blockedReason ? <em>{capability.blockedReason}</em> : null}
                    </article>
                  ))}
                  {data.roadmap.next ? (
                    <p className={styles.next}>
                      Next: {data.roadmap.next.title}
                    </p>
                  ) : null}
                </div>
              </div>
            </Section>
            <footer className={styles.footer}>
              <span>JARVIS</span>
              <i /> <small>Marketing OS · Dubai</small>
              <Link href="/system-operations">System Operations →</Link>
            </footer>
            <section className={styles.health}>
              <header><span>System health</span><strong>{data.systemHealth.score}%</strong></header>
              <Progress value={data.systemHealth.score} />
              {data.systemHealth.checks.map((check) => <Link href={check.href} key={check.name} className={styles[`health_${check.state}`]}><i /> <span><b>{check.name}</b><small>{check.note}</small></span></Link>)}
            </section>
          </div>
          <aside className={styles.rail}>
            <RailHeading>Needs you</RailHeading>
            <RailRow
              href="/clients"
              label="Client attention"
              note="Recorded client signals"
              value={attention}
              green
            />
            <RailRow
              href="/tasks"
              label="Open tasks"
              note="Not started and in progress"
              value={openTasks.length}
              amber
            />
            <RailRow
              href="/tasks"
              label="Decisions waiting"
              note="Evidence-backed suggestions"
              value={data.suggestions.length}
            />
            {data.publishingToday.length ? <div className={styles.publishing}><RailHeading>Publishing today</RailHeading>{data.publishingToday.map((item) => <Link href={item.href} key={item.id}><time>{item.scheduledAt ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dubai" }).format(new Date(item.scheduledAt)) : "Time TBD"}</time><span><b>{item.title}</b><small>{item.clientName} · {item.kind}</small></span></Link>)}</div> : null}
            <div className={styles.quick}>
              <RailHeading>Quick actions</RailHeading>
              <Link href="/tasks">New task</Link>
              <Link href="/finance">Log expense</Link>
              <Link href="/clients">Open clients</Link>
              <Link href="/roadmap">Open roadmap</Link>
            </div>
          </aside>
        </div>
      </div>
      {notificationsOpen ? <div className={styles.notificationsBackdrop} onClick={() => setNotificationsOpen(false)}><aside className={styles.notifications} onClick={(event) => event.stopPropagation()} aria-label="Notifications"><header><div><span>Notifications</span><small>{unreadNotifications.length} unread</small></div><button type="button" onClick={() => setNotificationsOpen(false)}>Close</button></header><div className={styles.notificationActions}><button type="button" disabled={!unreadNotifications.length || notificationBusy} onClick={() => markNotificationsRead(unreadNotifications.map((item) => item.sourceKey))}>Mark all read</button></div>{notifications.length ? notifications.map((item) => <Link href={item.href} key={item.id} onClick={() => { if (item.isUnread) void markNotificationsRead([item.sourceKey]); setNotificationsOpen(false); }}><i className={styles[`notification_${item.kind}`]} /><span><b>{item.title}</b><small>{item.meta}</small></span>{item.isUnread ? <em>New</em> : null}</Link>) : <p>No current notifications.</p>}</aside></div> : null}
    </main>
  );
}
function Section({
  number,
  title,
  action,
  children,
}: {
  number: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <span>{number}</span>
        <h2>{title}</h2>
        <i />
        {action}
      </header>
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  note,
  amber,
  delta,
  spark,
  className = "",
}: {
  label: string;
  value: string;
  note: string;
  amber?: boolean;
  delta?: number | null;
  spark?: number[];
  className?: string;
}) {
  return (
    <article
      className={`${styles.metric} ${className} ${amber ? styles.metricAmber : ""}`}
    >
      <small>{label}</small>
      {delta !== undefined && delta !== null ? (
        <em className={delta >= 0 ? styles.metricUp : styles.metricDown}>{signedChange(delta)}</em>
      ) : (
        <em className={styles.metricDot}>—</em>
      )}
      <strong>{value}</strong>
      {spark && spark.length > 1 ? <span className={styles.metricSpark} aria-label="Revenue history">{spark.map((point, index) => {
        const max = Math.max(...spark);
        return <i key={`${point}-${index}`} style={{ height: `${Math.max(5, Math.round((point / max) * 28))}px` }} />;
      })}</span> : null}
      <span>{note}</span>
    </article>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <div className={styles.progress}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.railHead}>
      <span>{children}</span>
      <i />
    </div>
  );
}
function RailRow({
  href,
  label,
  note,
  value,
  green,
  amber,
}: {
  href: string;
  label: string;
  note: string;
  value: number;
  green?: boolean;
  amber?: boolean;
}) {
  return (
    <Link className={styles.railRow} href={href}>
      <i className={green ? styles.greenBar : amber ? styles.amberBar : ""} />
      <span>
        <b>{label}</b>
        <small>{note}</small>
      </span>
      <strong
        className={amber ? styles.amberText : green ? styles.greenText : ""}
      >
        {value}
      </strong>
    </Link>
  );
}
