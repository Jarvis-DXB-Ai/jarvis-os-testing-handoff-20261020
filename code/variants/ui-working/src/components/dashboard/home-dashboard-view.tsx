/**
 * HomeDashboardView — complete presentation implementation of the approved Home Dashboard.
 * Presentation only: no fetch, Supabase, server actions, env vars, provider calls, or router
 * redirects. All data arrives via `model` (home-dashboard-view.model.ts, unchanged from Package
 * 24); every effect fires through `actions` callbacks that Codex wires to real Jarvis behavior.
 *
 * Every section from the approved design is present as presentation structure — Briefing,
 * Finance (incl. projection visuals), Clients, Tasks, Roadmap, System Health, right rail (Needs
 * you / Publishing today / Quick actions), and Notifications (trigger + panel). Codex decides,
 * per the existing ViewModel contract, whether each optional section receives real data, an
 * honest empty/unavailable state, or is hidden — the component already renders correctly for
 * all three since every section is gated on its own model shape (`kind === 'items'`,
 * `kind === 'known'`, empty arrays, etc.), never on a hardcoded flag.
 *
 * Shell assumptions (unchanged from Package 24, restated here because this file is now the
 * single presentation source of truth): shared Sidebar owns the 256px desktop offset and the
 * 768px mobile-shell breakpoint — this component adds neither a second offset nor a second
 * mobile header. Home has no page max-width. Fonts are Geist + Geist Mono only.
 */
import { useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  FinanceDelta, HomeDashboardActions, HomeDashboardViewProps, TaskCardViewModel,
  TaskLaneKey, TaskLaneViewModel,
} from './home-dashboard-view.model';
import styles from './home-dashboard-view.module.css';

// 'flat' (an exact 0% change) and display:'none' (no prior month to compare against) both
// render as the muted dot — only a genuine up/down move gets the colored pill.
// Evaluated once at module load, not during render: reading the clock while
// rendering is impure and would differ between the server and the client.
const COPYRIGHT_YEAR = new Date().getUTCFullYear();

function deltaClassName(delta: FinanceDelta) {
  if (delta.display === 'none' || delta.direction === 'flat') return styles.deltaNone;
  return delta.direction === 'up' ? styles.deltaUp : styles.deltaWarn;
}

function DisplayText({ value }: { value: { kind: string; text?: string } }) {
  switch (value.kind) {
    case 'known': return <>{value.text}</>;
    case 'loading': return <span aria-busy="true">…</span>;
    case 'error': return <span role="alert">{value.text || 'Unavailable'}</span>;
    case 'not_tracked': return <span className={styles.ghostText}>{value.text || 'Not allocated'}</span>;
    case 'unknown': return <span className={styles.ghostText}>{value.text || 'No data'}</span>;
    default: return null;
  }
}

function ActionButton({ action, onClick, className }: { action: { id: string; label: string; state: string; disabledReason?: string }; onClick?: () => void; className?: string }) {
  if (action.state === 'hidden') return null;
  return (
    <button
      type="button"
      className={className}
      disabled={action.state === 'disabled' || action.state === 'loading'}
      aria-busy={action.state === 'loading'}
      title={action.state === 'disabled' ? action.disabledReason : undefined}
      onClick={onClick}
    >
      {action.state === 'loading' ? '…' : action.label}
    </button>
  );
}

/* ── Tasks: drag between lanes, and a composer per lane ────────────────────
   These are presentation only. A drag reports its intent through
   `actions.onTaskMove`; the composer reports through `actions.onTaskCreate`.
   Neither one mutates anything here. */

/**
 * Lanes differ wildly in height, and centre-distance strategies compare whole
 * containers: a short lane's centre can sit closer to the cursor than the tall
 * lane the cursor is actually inside. Ask which droppable is under the pointer
 * first, and only fall back to rect overlap when it has left them all.
 */
const laneCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

function TaskRowBody({ task }: { task: TaskCardViewModel }) {
  return (
    <>
      <span className={styles.taskSpine} />
      <span className={styles.taskDot} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        <div className={styles.taskTitle}>{task.title}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className={`${styles.mono} ${styles.chipOwner}`}><DisplayText value={task.owner} /></span>
          <span className={`${styles.mono} ${task.isOverdue ? styles.chipDateLate : styles.chipDate}`}>
            <DisplayText value={task.dueLabel} />
          </span>
        </div>
      </div>
    </>
  );
}

function SortableTaskRow({ task, disabled, onOpen }: {
  task: TaskCardViewModel; disabled?: boolean; onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${task.isActive ? styles.taskRowActive : styles.taskRow} ${isDragging ? styles.taskRowDragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <TaskRowBody task={task} />
    </button>
  );
}

function LaneComposer({ laneKey, label, onCreate }: {
  laneKey: TaskLaneKey; label: string; onCreate?: (lane: TaskLaneKey, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const close = () => { setOpen(false); setTitle(''); };
  if (!open) {
    return (
      <button type="button" className={styles.laneAdd} onClick={() => setOpen(true)}>
        + Add task<span className={styles.srOnly}> to {label}</span>
      </button>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    onCreate?.(laneKey, value);
    close();
  };
  // Escape closes the composer without also closing the drawer or panel behind it.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  };
  return (
    <form className={styles.laneComposer} onSubmit={submit}>
      <input
        autoFocus
        className={styles.laneComposerInput}
        value={title}
        placeholder={`New task in ${label}`}
        aria-label={`New task in ${label}`}
        onChange={event => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.laneComposerRow}>
        <button type="submit" className={styles.laneComposerAdd} disabled={!title.trim()}>Add</button>
        <button type="button" className={styles.laneComposerCancel} onClick={close}>Cancel</button>
      </div>
    </form>
  );
}

function TaskLane({ lane, actions, dragDisabled }: {
  lane: TaskLaneViewModel; actions: HomeDashboardActions; dragDisabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.key}` });
  return (
    <section
      ref={setNodeRef}
      className={`${styles.lane} ${styles['lane_' + lane.key]} ${isOver ? styles.laneOver : ''}`}
      aria-label={lane.label}
    >
      <span className={styles.laneAccent} />
      <header className={styles.laneHead}>
        <span className={styles.laneDot} />
        <span className={`${styles.mono} ${styles.laneName}`}>{lane.label}</span>
        <span style={{ flex: 1 }} />
        <span className={`${styles.num} ${styles.laneCount}`}>{lane.count}</span>
      </header>
      <SortableContext items={lane.tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        {lane.tasks.length === 0 ? (
          <div className={styles.laneEmpty}>Nothing here.</div>
        ) : lane.tasks.map(task => (
          <SortableTaskRow
            key={task.id}
            task={task}
            disabled={dragDisabled}
            onOpen={() => actions.onTaskOpen?.(task.id)}
          />
        ))}
      </SortableContext>
      <LaneComposer laneKey={lane.key} label={lane.label} onCreate={actions.onTaskCreate} />
      <footer className={styles.laneFoot}><DisplayText value={lane.footerNote} /></footer>
    </section>
  );
}

export function HomeDashboardView({ model, actions, state }: HomeDashboardViewProps) {
  const { greeting, briefing, finance, clients, tasks, roadmap, systemHealth, rightRail, notifications } = model;
  const activeBriefing = briefing.kind === 'items' ? briefing.items[briefing.activeIndex] : null;
  const hasRedundantBriefingMetric = activeBriefing?.metric.kind === 'known'
    && activeBriefing.metric.text.trim().toLowerCase() === activeBriefing.openAction.label.trim().toLowerCase();

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  // Mouse: 6px of travel before a drag starts, so a plain click still opens the
  // task. Touch: a 250ms press instead, because on mobile the lanes are a
  // horizontally snapping rail — a distance-based trigger would hijack every
  // swipe. A quick tap still opens the task; a press-and-hold picks it up.
  const taskSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const laneOfTask = (taskId: string) =>
    tasks.lanes.find(lane => lane.tasks.some(task => task.id === taskId))?.key ?? null;
  const draggingTask = draggingTaskId
    ? tasks.lanes.flatMap(lane => lane.tasks).find(task => task.id === draggingTaskId) ?? null
    : null;

  function onTaskDragStart(event: DragStartEvent) {
    setDraggingTaskId(String(event.active.id));
  }

  function onTaskDragEnd(event: DragEndEvent) {
    setDraggingTaskId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    const from = laneOfTask(taskId);
    if (!from) return;
    const to = (overId.startsWith('lane:') ? overId.slice(5) : laneOfTask(overId)) as TaskLaneKey | null;
    if (!to) return;

    if (from === to) {
      const ids = tasks.lanes.find(lane => lane.key === to)?.tasks.map(task => task.id) ?? [];
      const oldIndex = ids.indexOf(taskId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      actions.onTaskMove?.({ taskId, from, to, orderedTaskIds: arrayMove(ids, oldIndex, newIndex) });
      return;
    }

    // Across lanes: drop before whichever card you released over, or at the end
    // when the lane itself was the drop target.
    const destination = (tasks.lanes.find(lane => lane.key === to)?.tasks ?? [])
      .map(task => task.id)
      .filter(id => id !== taskId);
    const overIndex = overId.startsWith('lane:') ? -1 : destination.indexOf(overId);
    destination.splice(overIndex < 0 ? destination.length : overIndex, 0, taskId);
    actions.onTaskMove?.({ taskId, from, to, orderedTaskIds: destination });
  }

  return (
    <div className={styles.root}>
      {/* Notification trigger — bell + unread badge. Presentation-only; mounts here by default.
          Shared mobile chrome owns the trigger below 768px; this remains the desktop trigger. */}
      <div className={styles.notifTriggerWrap}>
        <button type="button" className={styles.notifTrigger}
          aria-label={`Notifications${notifications.unreadCount ? `, ${notifications.unreadCount} unread` : ''}`}
          onClick={actions.onNotificationsOpen}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 3h15z" /><path d="M10 21h4" />
          </svg>
          {notifications.unreadCount > 0 && <span className={styles.notifBadge}>{notifications.unreadCount}</span>}
        </button>
      </div>

      <div className={styles.cols}>
        <div className={styles.col}>

          {/* Greeting */}
          <div className={styles.greet}>
            <div>
              <div className={`${styles.greetMeta} ${styles.mono}`}><DisplayText value={greeting.dateLine} /></div>
              <h1 className={styles.greetHeading}>
                Good {greeting.timeOfDayGreeting}, <b><DisplayText value={greeting.userFirstName} /></b>
              </h1>
            </div>
          </div>

          {/* Briefing carousel */}
          {briefing.kind === 'items' && briefing.items.length > 0 && (
            <section className={styles.hero} aria-roledescription="carousel">
              <span aria-hidden className={styles.heroGrain} />
              <span aria-hidden className={styles.heroSheen} />
              <span aria-hidden className={styles.heroEdge} />
              <div className={styles.heroIn}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`${styles.mono} ${styles.heroEyebrow}`}><DisplayText value={briefing.items[briefing.activeIndex].eyebrow} /></span>
                  <span className={styles.heroDots}>
                    {briefing.items.map((_, i) => (
                      <span key={i} className={i === briefing.activeIndex ? styles.heroDotActive : styles.heroDot} />
                    ))}
                  </span>
                  <button type="button" className={styles.heroNavBtn} aria-label="Previous" onClick={actions.onBriefingPrev}>‹</button>
                  <button type="button" className={styles.heroNavBtn} aria-label="Next" onClick={actions.onBriefingNext}>›</button>
                  <button type="button" className={styles.heroCloseBtn} aria-label="Dismiss" onClick={actions.onBriefingDismiss}>×</button>
                </div>
                <div className={styles.heroBodyStack}>
                  {briefing.items.map((item, index) => (
                    <p key={item.id} className={styles.heroBody}
                      aria-hidden={index !== briefing.activeIndex}
                      style={{ visibility: index === briefing.activeIndex ? 'visible' : 'hidden' }}>
                      <b>{item.lead}</b> {item.tail}
                    </p>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
                  <ActionButton className={styles.heroCta} action={briefing.items[briefing.activeIndex].primaryAction}
                    onClick={() => actions.onBriefingPrimary?.(briefing.items[briefing.activeIndex].id)} />
                  <ActionButton className={styles.heroCtaGhost} action={briefing.items[briefing.activeIndex].openAction}
                    onClick={() => actions.onBriefingOpen?.(briefing.items[briefing.activeIndex].id)} />
                  {!hasRedundantBriefingMetric && (
                    <div className={styles.heroMetric}>
                      <span className={`${styles.num} ${styles.heroMetricValue}`}>
                        <DisplayText value={briefing.items[briefing.activeIndex].metric} />
                      </span>
                      <small className={`${styles.mono} ${styles.heroMetricLabel}`}>
                        <DisplayText value={briefing.items[briefing.activeIndex].metricLabel} />
                      </small>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
          {briefing.kind === 'dismissed' && (
            <button type="button" className={styles.heroRestore} onClick={actions.onBriefingRestore}>
              Restore briefing
            </button>
          )}
          {/* briefing.kind === 'empty' → intentionally renders nothing: no band, no restore button */}

          {/* 01 Finance */}
          <section className={styles.section} style={{ '--section-delay': '120ms' } as CSSProperties} aria-labelledby="finance-heading">
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionNum} ${styles.mono}`}>01</span>
              <h2 id="finance-heading" className={styles.sectionTitle}>Finance</h2>
              <span className={styles.sectionRule} />
              {finance.state === 'current' && <span className={`${styles.thisMonth} ${styles.mono}`}>This month</span>}
              <div className={styles.monthSwitcher}>
                <button type="button" aria-label="Previous month" disabled={!finance.canStepBack}
                  onClick={() => actions.onFinanceMonthChange?.('prev')}>‹</button>
                <span className={styles.num}><DisplayText value={finance.monthLabel} /></span>
                <button type="button" aria-label="Next month" disabled={!finance.canStepForward}
                  onClick={() => actions.onFinanceMonthChange?.('next')}>›</button>
              </div>
              {finance.state === 'projected' && finance.projection?.confidencePct && (
                <span className={styles.confidenceChip}>
                  Confidence <DisplayText value={finance.projection.confidencePct} />
                </span>
              )}
            </div>

            <div className={styles.financeGrid}>
              <article className={`${styles.card} ${styles.cardRevenue}`}>
                <span className={styles.cardAccent} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={styles.mono}>{finance.state === 'projected' ? 'Projected revenue' : 'Revenue'}</span>
                  <span style={{ flex: 1 }} />
                  <span className={`${styles.delta} ${deltaClassName(finance.revenue.delta)}`}>
                    <DisplayText value={finance.revenue.delta} />
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
                  <span className={`${styles.figure} ${styles.num}`}><DisplayText value={finance.revenue.value} /></span>
                  {finance.sparkline && (
                    <div className={styles.spark} style={{ marginLeft: 'auto' }}>
                      {finance.sparkline.values.map((v, i) => {
                        const max = Math.max(...finance.sparkline!.values);
                        const isProjected = finance.sparkline!.projectedFromIndex !== null && i >= finance.sparkline!.projectedFromIndex!;
                        const isLast = i === finance.sparkline!.values.length - 1;
                        return (
                          <span key={i} className={styles.sparkBar} data-last={isLast} data-projected={isProjected}
                            style={{ height: Math.max(3, Math.round((v / max) * 26)) }} />
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className={styles.cardNote}><DisplayText value={finance.revenue.note} /></p>

                {/* Projection visual: committed (solid) vs. weighted pipeline (dashed) */}
                {finance.projection && (
                  <div className={styles.projectionBlock}>
                    <div className={styles.projectionBar}>
                      <span className={styles.projectionCommitted} />
                      {finance.projection.pipeline && <span className={styles.projectionPipeline} />}
                    </div>
                    <div className={styles.projectionLegend}>
                      <span><i className={styles.swatchCommitted} />Committed <DisplayText value={finance.projection.committed} /></span>
                      {finance.projection.pipeline && (
                        <span><i className={styles.swatchPipeline} />{finance.projection.confidencePct ? 'Weighted pipeline ' : 'Pipeline '}<DisplayText value={finance.projection.pipeline} /></span>
                      )}
                    </div>
                  </div>
                )}
              </article>

              <article className={styles.card}>
                <span className={`${styles.cardAccent} ${styles.cardAccentAmber}`} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={styles.mono}>Expenses</span>
                  <span style={{ flex: 1 }} />
                  <span className={`${styles.delta} ${deltaClassName(finance.expenses.delta)}`}>
                    <DisplayText value={finance.expenses.delta} />
                  </span>
                </div>
                <span className={`${styles.figureSmall} ${styles.num}`}><DisplayText value={finance.expenses.value} /></span>
                {finance.expenses.split && (
                  <div className={styles.splitBar}>
                    {finance.expenses.split.map((s, i) => (
                      <span key={s.label} style={{ flex: s.share, background: i === 0 ? 'var(--amber)' : `rgba(240,178,74,${0.55 - i * 0.2})` }} />
                    ))}
                  </div>
                )}
                <p className={styles.cardNote}><DisplayText value={finance.expenses.note} /></p>
              </article>

              <article className={styles.card}>
                <span className={styles.cardAccent} style={{ background: 'linear-gradient(90deg, rgba(255,255,255,.7), rgba(255,255,255,.06))' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={styles.mono}>Profit</span>
                  <span style={{ flex: 1 }} />
                  <span className={`${styles.delta} ${deltaClassName(finance.profit.delta)}`}><DisplayText value={finance.profit.delta} /></span>
                </div>
                <span className={`${styles.figureSmall} ${styles.num}`}><DisplayText value={finance.profit.value} /></span>
                <p className={styles.cardNote}><DisplayText value={finance.profit.marginPct} /></p>
              </article>
            </div>

            <div className={styles.txList}>
              <button type="button" className={styles.txHead} aria-expanded={!!state?.financeEntriesExpanded}
                onClick={actions.onFinanceToggleEntries}>
                <span className={styles.mono}>{finance.state === 'projected' ? 'Projection breakdown' : 'Recent transactions'}</span>
                <span style={{ flex: 1 }} />
                <small>{finance.entriesTotalCount} entries</small>
                <span className={styles.chevron}>›</span>
              </button>
              {state?.financeEntriesExpanded !== false && (
                finance.entriesTotalCount === 0 ? (
                  <div className={styles.txEmpty}>No transactions this month.</div>
                ) : (
                  <>
                    {(state?.financeEntriesShowAll ? finance.entries : finance.entries.slice(0, 3)).map(e => (
                      <div key={e.id} className={styles.txRow}>
                        <span className={e.probabilityPct != null ? styles.txDotPipeline : styles.txDot} />
                        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{e.name}</span>
                        <span className={`${styles.mono} ${styles.txMeta}`}>{e.meta}</span>
                        <span className={styles.num} style={{ fontSize: 12.5, fontWeight: 500 }}><DisplayText value={e.amount} /></span>
                      </div>
                    ))}
                    {finance.entriesTotalCount > 3 && (
                      <button type="button" className={styles.txMore} onClick={actions.onFinanceShowAllEntries}>
                        {state?.financeEntriesShowAll ? 'Show less' : `Show all ${finance.entriesTotalCount} →`}
                      </button>
                    )}
                  </>
                )
              )}
            </div>
          </section>

          {/* 02 Clients */}
          <section className={styles.section} style={{ '--section-delay': '180ms' } as CSSProperties} aria-labelledby="clients-heading">
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionNum} ${styles.mono}`}>02</span>
              <h2 id="clients-heading" className={styles.sectionTitle}>Clients</h2>
              <span className={styles.sectionRule} />
              <button type="button" className={styles.clientsAll} onClick={actions.onClientsOpen}>All →</button>
            </div>
            <div className={styles.clientList}>
              {clients.cards.map(c => (
                <button key={c.id} type="button" className={`${styles.clientCard} ${
                    c.status === 'active' ? styles.clientActive : c.status === 'onboarding' ? styles.clientOnboarding : styles.clientInactive
                  }`}
                  onClick={() => actions.onClientOpen?.(c.id)}>
                  <div className={styles.clientTop}>
                    <span aria-hidden className={styles.clientMark} style={c.logoUrl ? { backgroundImage: `url(${c.logoUrl})` } : undefined}>
                      {!c.logoUrl && c.monogram}
                    </span>
                    <div className={styles.clientIdentity}>
                      <div className={styles.clientTitleRow}>
                        <b className={styles.clientName}>{c.name}</b>
                        <span className={`${styles.statusPill} ${
                            c.status === 'active' ? styles.statusPillActive : c.status === 'onboarding' ? styles.statusPillOnboarding : styles.statusPillInactive
                          }`}>
                          <span className={c.status === 'active' ? styles.statusDotPulse : styles.statusDot} />
                          {c.status === 'active' ? 'Active' : c.status === 'onboarding' ? 'Onboarding' : 'Not active'}
                        </span>
                      </div>
                      <div className={`${styles.clientMeta} ${styles.mono}`}>
                        <span className={`${styles.mono} ${styles.clientIndustry}`}><DisplayText value={c.industry} /></span>
                        <span className={`${styles.mono} ${styles.clientRetainer}`}><DisplayText value={c.retainer} /></span>
                      </div>
                    </div>
                    <span className={`${styles.totalBadge} ${c.adjustmentsCount + c.approvalsCount >= 4 ? styles.totalBadgeHot : styles.totalBadgeNeutral}`}>
                      {c.adjustmentsCount + c.approvalsCount}
                    </span>
                  </div>
                  <div className={styles.clientStatsRow}>
                    {c.stats.map(s => (
                      <div key={s.key} style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.mono} style={{ fontSize: 8, color: 'var(--faint)', textTransform: 'uppercase' }}>{s.key.replace('_', ' ')}</div>
                        <div className={styles.num} style={{ fontSize: 15 }}><DisplayText value={s.value} /></div>
                        <div style={{ fontSize: 10.5, fontWeight: 500 }}><DisplayText value={s.delta} /></div>
                      </div>
                    ))}
                    {/* Unknown history keeps a decorative, flat eight-bar slot;
                        it must never suggest a measured trend. */}
                    {c.reachSeries ? (
                      <div className={styles.trend}>
                        {c.reachSeries.map((v, i, series) => {
                          const max = Math.max(...series);
                          // An all-zero series must not divide by zero.
                          const height = max > 0 ? Math.max(3, Math.round((v / max) * 22)) : 3;
                          return <span key={i} data-last={i === series.length - 1} style={{ height }} />;
                        })}
                      </div>
                    ) : (
                      <div className={`${styles.trend} ${styles.trendEmpty}`} aria-hidden="true">
                        {Array.from({ length: 8 }, (_, index) => <span key={index} style={{ height: 8 }} />)}
                      </div>
                    )}
                  </div>
                  <div className={styles.clientFootRow}>
                    <span className={c.workRequiredCount > 0 ? styles.workChip : styles.workChipZero}>
                      <span className={c.workRequiredCount > 0 ? styles.workDotPulse : styles.workDot} />
                      {c.workRequiredCount > 0 ? `${c.workRequiredCount} items need you` : 'Nothing waiting'}
                    </span>
                    <span className={`${styles.chipAdj} ${c.adjustmentsCount === 0 ? styles.chipNeutral : ''}`}>{c.adjustmentsCount} adj</span>
                    <span className={`${styles.chipAppr} ${c.approvalsCount === 0 ? styles.chipNeutral : ''}`}>{c.approvalsCount} appr</span>
                  </div>
                </button>
              ))}
              {clients.cards.length === 0 && <p className={styles.emptyNote}>No clients yet.</p>}
            </div>
          </section>

          {/* 03 Tasks */}
          <section className={styles.section} style={{ '--section-delay': '240ms' } as CSSProperties} aria-labelledby="tasks-heading">
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionNum} ${styles.mono}`}>03</span>
              <h2 id="tasks-heading" className={styles.sectionTitle}>Tasks</h2>
              <span className={styles.sectionRule} />
              <ActionButton action={tasks.openBoardAction} onClick={actions.onOpenTaskBoard} />
            </div>
            <div className={styles.laneChips}>
              {tasks.lanes.map(l => (
                <button key={l.key} type="button" className={state?.activeTaskLane === l.key ? styles.laneChipActive : styles.laneChip}
                  aria-pressed={state?.activeTaskLane === l.key} onClick={() => actions.onTaskLaneSelect?.(l.key)}>{l.label}</button>
              ))}
            </div>
            <DndContext
              id="home-task-lanes"
              sensors={taskSensors}
              collisionDetection={laneCollisionDetection}
              onDragStart={onTaskDragStart}
              onDragCancel={() => setDraggingTaskId(null)}
              onDragEnd={onTaskDragEnd}
            >
              <div className={styles.laneGrid}>
                {tasks.lanes.map(l => (
                  <TaskLane key={l.key} lane={l} actions={actions} dragDisabled={state?.taskDragDisabled} />
                ))}
              </div>
              <DragOverlay>
                {draggingTask ? (
                  <div className={`${draggingTask.isActive ? styles.taskRowActive : styles.taskRow} ${styles.taskRowOverlay}`}>
                    <TaskRowBody task={draggingTask} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </section>

          {/* 04 Roadmap */}
          <section className={styles.section} style={{ '--section-delay': '300ms' } as CSSProperties} aria-labelledby="roadmap-heading">
            <div className={styles.sectionHead}>
              <span className={`${styles.sectionNum} ${styles.mono}`}>04</span>
              <h2 id="roadmap-heading" className={styles.sectionTitle}>Roadmap</h2>
              <span className={styles.sectionRule} />
              <span className={`${styles.mono} ${styles.roadmapCount}`}>
                {roadmap.capabilitiesDone} / {roadmap.capabilitiesTotal} capabilities
              </span>
            </div>
            <div className={styles.roadmapGrid}>
              <div className={styles.levelCard}>
                <span className={styles.levelBloom} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={styles.levelChip}><DisplayText value={roadmap.levelLabel} /></span>
                  <span style={{ flex: 1 }} />
                  <span className={styles.num} style={{ fontSize: 28, fontWeight: 200 }}><DisplayText value={roadmap.completionPct} /></span>
                </div>
                <div className={styles.xpBar} style={{ position: 'relative' }}>
                  <span style={{ width: `${roadmap.capabilitiesTotal ? (roadmap.capabilitiesDone / roadmap.capabilitiesTotal) * 100 : 0}%` }} />
                </div>
                <div className={styles.pipRow} style={{ position: 'relative' }}>
                  {Array.from({ length: roadmap.capabilitiesTotal }).map((_, i) => (
                    <span key={i} data-done={i < roadmap.capabilitiesDone} data-active={i === roadmap.capabilitiesDone} />
                  ))}
                </div>
                <p className={styles.momentumNote} style={{ position: 'relative' }}><DisplayText value={roadmap.momentumNote} /></p>
                <div className={styles.layerStrip} style={{ position: 'relative' }}>
                  {roadmap.layers.map(l => (
                    <div key={l.name}>
                      <span className={l.isActive ? styles.layerBarActive : styles.layerBar} />
                      <small className={`${styles.mono} ${l.isActive ? styles.layerNameActive : styles.layerName}`}>{l.name}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.ladder}>
                {roadmap.milestones.length === 0 ? (
                  <div className={styles.emptyNote}>Roadmap data is unavailable.</div>
                ) : roadmap.milestones.map(m => (
                  <button key={m.id} type="button"
                    className={`${styles.milestoneRow} ${m.state === 'done' ? styles.milestoneDone : m.state === 'active' ? styles.milestoneActive : m.state === 'locked' ? styles.milestoneLocked : styles.milestoneNext}`}
                    onClick={() => actions.onMilestoneOpen?.(m.id)}>
                    <span className={styles.milestoneMark}>{m.state === 'done' ? '✓' : m.state === 'active' ? '●' : m.state === 'next' ? '›' : ''}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <b className={styles.milestoneTitle}>{m.title}</b>
                        <span style={{ flex: 1 }} />
                        <span className={`${styles.mono} ${styles.milestoneSteps}`}>{m.stepsDone} / {m.stepsTotal}</span>
                      </div>
                      {m.stepsTotal > 0 && (
                        <div className={styles.milestoneBar}><span style={{ width: `${(m.stepsDone / m.stepsTotal) * 100}%` }} /></div>
                      )}
                      <p className={styles.milestoneReward}><DisplayText value={m.reward} /></p>
                      {m.blockedReason && (
                        <p className={styles.milestoneBlocked}><DisplayText value={m.blockedReason} /></p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Footer + System health */}
          <footer className={styles.footer}>
            <div className={styles.footerId}>
              <div className={styles.mono}>JARVIS</div>
              <small style={{ color: 'var(--faint)' }}>Marketing OS</small>
            </div>
            {systemHealth.kind === 'known' ? (
              <button type="button" className={styles.healthCard} onClick={actions.onSystemHealthOpen}>
                <div className={styles.healthSummary}>
                  <div className={styles.mono} style={{ fontSize: 9.5 }}>System health</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    <span className={styles.num} style={{ fontSize: 32, fontWeight: 200 }}>{systemHealth.scorePct}%</span>
                    <span style={{ fontSize: 11.5, fontWeight: 500 }}><DisplayText value={systemHealth.verdict} /></span>
                  </div>
                  <div className={styles.healthBar}><span style={{ width: `${systemHealth.scorePct}%` }} /></div>
                  <small className={styles.mono}><DisplayText value={systemHealth.lastCheckedLabel} /></small>
                </div>
                <div className={styles.healthChecks}>
                  {systemHealth.checks.map(c => (
                    <div key={c.name} className={styles.healthCheckRow}>
                      <span className={`${styles.healthMark} ${styles['healthMark_' + c.state]}`}>
                        {c.state === 'ok' ? '✓' : c.state === 'warn' ? '!' : '×'}
                      </span>
                      <div><b style={{ fontSize: 12 }}>{c.name}</b><p className={styles.healthNote}>{c.note}</p></div>
                    </div>
                  ))}
                </div>
                {systemHealth.moreChecksCount > 0 && (
                  <small className={styles.mono}>
                    {systemHealth.moreChecksCount} more check{systemHealth.moreChecksCount === 1 ? '' : 's'}
                  </small>
                )}
              </button>
            ) : (
              <div className={styles.healthUnavailable}>System health is unavailable.</div>
            )}
            <div className={styles.footerMeta}>
              <span className={styles.mono}>v5.0 · Dubai GST</span>
              <span className={styles.mono}>© {COPYRIGHT_YEAR}</span>
            </div>
          </footer>
        </div>

      </div>

      {/* Notifications slide-over */}
      <div className={`${styles.scrim} ${state?.notificationsOpen ? styles.scrimOpen : ''}`} onClick={actions.onNotificationsClose} />
      <aside className={`${styles.slideover} ${state?.notificationsOpen ? styles.slideoverOpen : ''}`} aria-hidden={!state?.notificationsOpen}>
        <header className={styles.notifHead}>
          <b>Notifications</b>
          <span className={styles.notifCountPill}>{notifications.unreadCount}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className={styles.notifCloseBtn} aria-label="Close" onClick={actions.onNotificationsClose}>×</button>
        </header>
          <div className={styles.panelScroll}>
          <div className={styles.railPanel}>
            {rightRail.needsYou.length > 0 && (
            <section>
              <div className={`${styles.mono} ${styles.railLabel}`}>Needs you</div>
              {rightRail.needsYou.map(r => (
                <button key={r.id} type="button" className={styles.railRow} onClick={() => actions.onRailRowOpen?.(r.id)}>
                  <span className={`${styles.railBar} ${r.tone === 'green' ? styles.railBarGreen : r.tone === 'amber' ? styles.railBarAmber : ''}`} />
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 12.5 }}>{r.label}</b>
                    <div style={{ fontSize: 10.5, color: 'var(--faint)' }}><DisplayText value={r.note} /></div>
                  </div>
                  <span className={styles.num} style={{ fontSize: 20, fontWeight: 200 }}><DisplayText value={r.value} /></span>
                </button>
              ))}
            </section>
            )}
            {rightRail.publishingToday.length > 0 && (
            <section>
              <div className={`${styles.mono} ${styles.railLabel}`}>Publishing today</div>
              {rightRail.publishingToday.map(p => (
                <button key={p.id} type="button" className={styles.pubRow} onClick={() => actions.onPublishingItemOpen?.(p.id)}>
                  <span className={styles.num} style={{ color: 'var(--green)' }}><DisplayText value={p.timeLabel} /></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <b style={{ fontSize: 12.5 }}>{p.title}</b>
                    <small style={{ color: 'var(--faint)' }}>{p.clientName}</small>
                  </div>
                </button>
              ))}
            </section>
            )}
            <section>
              <div className={`${styles.mono} ${styles.railLabel}`}>Quick actions</div>
              <div className={styles.quickActionsGrid}>
                {rightRail.quickActions.map(a => (
                  <ActionButton key={a.id} className={styles.quickActionBtn} action={a} onClick={() => actions.onQuickAction?.(a.id)} />
                ))}
              </div>
            </section>
          </div>
        <div className={styles.notifFilters}>
          {(['all', 'approval', 'adjustment', 'system'] as const).map(f => (
            <button key={f} type="button"
              className={(state?.notificationFilter ?? 'all') === f ? styles.filterChipActive : styles.filterChip}
              onClick={() => actions.onNotificationFilterChange?.(f)}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </button>
          ))}
        </div>
        <div className={styles.notifList}>
          {notifications.groups.length === 0 ? (
            <p className={styles.emptyNote}>No notifications.</p>
          ) : notifications.groups.map(g => (
            <div key={g.key}>
              <div className={`${styles.mono} ${styles.notifGroupLabel}`}>{g.key === 'today' ? 'Today' : 'Earlier'}</div>
              {g.items.map(n => (
                <button key={n.id} type="button" className={styles.notifRow} onClick={() => actions.onNotificationOpen?.(n.id)}>
                  <span aria-hidden className={styles.notifMark}>{n.clientMonogram}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: n.isUnread ? 600 : 400, fontSize: 12.5 }}>{n.title}</b>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <span className={`${styles.notifKind} ${styles['notifKind_' + n.kind]}`}>{n.kind}</span>
                      <small style={{ color: 'var(--faint)' }}>{n.meta}</small>
                    </div>
                  </div>
                  {n.isUnread && <span className={styles.notifDot} />}
                </button>
              ))}
            </div>
          ))}
        </div>
          </div>
        <footer className={styles.notifFoot}>
          <button type="button" className={styles.markAllBtn} onClick={actions.onMarkAllNotificationsRead}>Mark all read</button>
        </footer>
      </aside>
    </div>
  );
}

export default HomeDashboardView;
