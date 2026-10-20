/**
 * HomeDashboardView — complete presentation implementation of the approved Home Dashboard.
 * Presentation only: no fetch, Supabase, server actions, env vars, provider calls, or router
 * redirects. All data arrives via `model` (home-dashboard-view.model.ts, unchanged from Package
 * 24); every effect fires through `actions` callbacks that Codex wires to real Jarvis behavior.
 *
 * Every section from the approved design is present as presentation structure — Briefing,
 * Finance (incl. projection visuals), Clients, Tasks, Roadmap and System Health. The
 * app layout now owns the shared Notifications trigger and right panel. Codex decides,
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
import { DisplayText, ActionButton } from './home-display';
import { BriefingSurface } from '@/components/design-system/briefing-surface';
import { memo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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

const TaskRowBody = memo(function TaskRowBody({ task }: { task: TaskCardViewModel }) {
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
});

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
      data-lane={lane.key}
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
  const { greeting, briefing, finance, clients, tasks, roadmap, systemHealth } = model;
  const activeBriefing = briefing.kind === 'items' ? briefing.items[briefing.activeIndex] : null;
  const hasRedundantBriefingMetric = activeBriefing?.metric.kind === 'known'
    && activeBriefing.metric.text.trim().toLowerCase() === activeBriefing.openAction.label.trim().toLowerCase();

  const taskRailRef = useRef<HTMLDivElement>(null);
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
            <BriefingSurface aria-roledescription="carousel">
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
            </BriefingSurface>
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
                <small>{finance.entriesTotalCount} {finance.entriesTotalCount === 1 ? "entry" : "entries"}</small>
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
              {clients.cards.map((c, index) => (
                <button key={c.id} type="button" style={{ "--item-delay": `${Math.min(index, 7) * 45}ms` } as CSSProperties} className={`${styles.clientCard} ${
                    c.status === 'active' ? styles.clientActive : c.status === 'onboarding' ? styles.clientOnboarding : styles.clientInactive
                  }`}
                  onClick={() => actions.onClientOpen?.(c.id)}>
                  <div className={styles.clientTop}>
                    <span aria-hidden className={styles.clientMark} style={c.logoUrl ? { backgroundImage: `url(${c.logoUrl})` } : undefined}>{!c.logoUrl && c.monogram}</span>
                    <div className={styles.clientIdentity}>
                      <b className={styles.clientName}>{c.name}</b>
                      <div className={styles.clientMeta}><DisplayText value={c.industry} /></div>
                    </div>
                    <span className={styles.statusPill}>{c.status === 'active' ? 'Active' : c.status === 'onboarding' ? 'Onboarding' : 'Inactive'}</span>
                  </div>
                  <div className={styles.clientFocus}>
                    <span className={styles.mono}>WORKSPACE PRIORITY</span>
                    <strong>{c.workRequiredCount ? `${c.workRequiredCount} item${c.workRequiredCount === 1 ? '' : 's'} need attention` : 'No flagged items'}</strong>
                    <p title={c.latestSignal || undefined}>{c.latestSignal || 'Open the workspace to plan the next content cycle.'}</p>
                  </div>
                  <div className={styles.clientOperations}>
                    <span><b>{c.openTaskCount ?? '—'}</b> Open tasks</span>
                    <span><b>{c.approvalsCount}</b> Approvals</span>
                    <span><b>{c.adjustmentsCount}</b> To fix</span>
                  </div>
                  <div className={styles.clientStatsRow}>
                    {c.stats.map(stat => <div key={stat.key} className={styles.clientStat}>
                      <div className={styles.clientStatLabel}>{stat.key === 'reach_30d' ? 'Reach · 30 days' : stat.key === 'engagement' ? 'Engagements' : 'Followers'}</div>
                      <div className={styles.clientStatValue}><DisplayText value={stat.value} /></div>
                      <div className={styles.clientStatDelta}><DisplayText value={stat.delta} /></div>
                    </div>)}
                  </div>
                  <div className={styles.clientFootRow}><span>Open workspace</span><span aria-hidden>↗</span></div>
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
                  aria-pressed={state?.activeTaskLane === l.key} onClick={() => {
                    actions.onTaskLaneSelect?.(l.key);
                    const rail = taskRailRef.current;
                    const lane = rail?.querySelector<HTMLElement>(`[data-lane="${l.key}"]`);
                    if (rail && lane) rail.scrollTo({
                      left: rail.scrollLeft + lane.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - lane.clientWidth) / 2,
                      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
                    });
                  }}>{l.label}</button>
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
              <div ref={taskRailRef} className={`${styles.laneGrid} ${draggingTaskId ? styles.laneGridDragging : ""}`} onScroll={event => {
                if (draggingTaskId) return;
                const rail = event.currentTarget;
                if (rail.scrollWidth <= rail.clientWidth) return;
                const centre = rail.getBoundingClientRect().left + rail.clientWidth / 2;
                const closest = [...rail.querySelectorAll<HTMLElement>('[data-lane]')].sort((a, b) => {
                  const distance = (element: HTMLElement) => Math.abs(element.getBoundingClientRect().left + element.clientWidth / 2 - centre);
                  return distance(a) - distance(b);
                })[0]?.dataset.lane as TaskLaneKey | undefined;
                if (closest && closest !== state?.activeTaskLane) actions.onTaskLaneSelect?.(closest);
              }}>
                {tasks.lanes.map(l => (
                  <TaskLane key={l.key} lane={l} actions={actions} dragDisabled={state?.taskDragDisabled} />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
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
                  <span style={{ width: `${roadmap.capabilitiesTotal ? (roadmap.completionPct.kind === "known" ? roadmap.completionPct.numericValue ?? 0 : 0) : 0}%` }} />
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
                        <span className={`${styles.mono} ${styles.milestoneSteps}`}>{m.state === "done" ? "Delivered" : m.state === "active" ? "In progress" : m.state === "locked" ? "Blocked" : "Up next"}</span>
                      </div>
                      {m.stepsTotal > 0 ? (<p className={styles.milestoneSteps}>{m.stepsDone} of {m.stepsTotal} steps complete</p>) : <p className={styles.milestoneSteps}>Steps not defined yet</p>}
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
                  <div className={styles.mono} style={{ fontSize: 11 }}>System health</div>
                  <strong className={styles.healthVerdict}><DisplayText value={systemHealth.verdict} /></strong>
                  <span className={styles.healthNote}>Open diagnostics →</span>
                  <small className={styles.mono}><DisplayText value={systemHealth.lastCheckedLabel} /></small>
                </div>
                <div className={styles.healthChecks}>
                  {systemHealth.checks.map(c => (
                    <div key={c.name} className={styles.healthCheckRow} title={c.note}>
                      <span className={`${styles.healthMark} ${styles['healthMark_' + c.state]}`}>
                        {c.state === 'ok' ? '✓' : c.state === 'warn' ? '!' : '×'}
                      </span>
                      <div><b style={{ fontSize: 12 }}>{c.name}</b>{c.state !== "ok" && <p className={styles.healthNote}>{c.note}</p>}</div>
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
              <span className={styles.mono}>Home · Dubai GST</span>
              <span className={styles.mono}>© {COPYRIGHT_YEAR}</span>
            </div>
          </footer>
        </div>

      </div>


    </div>
  );
}

export default HomeDashboardView;
