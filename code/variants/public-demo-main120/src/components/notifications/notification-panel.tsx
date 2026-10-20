"use client";
import {useEffect, useRef} from 'react';
import {DisplayText} from '@/components/dashboard/home-display';
import type {HomeDashboardViewModel, HomeDashboardActions, HomeDashboardViewState} from '@/components/dashboard/home-dashboard-view.model';
import styles from '@/components/dashboard/home-dashboard-view.module.css';
import inbox from './notifications.module.css';

export function NotificationPanel({rightRail, notifications, actions, state, loading, loaded, busy, error, onRetry}: Pick<HomeDashboardViewModel,'rightRail'|'notifications'> & {actions: HomeDashboardActions; state: HomeDashboardViewState; loading: boolean; loaded: boolean; busy: boolean; error: string | null; onRetry: () => void}) {
  const notificationsRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = notificationsRef.current;
    if (!dialog || !state?.notificationsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.focus();
    document.body.style.overflow = 'hidden';
  return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [state?.notificationsOpen]);

    const items = notifications.groups.flatMap(group => group.items);
  const sections = [
    {kind: 'approval', title: 'Ready for your review', action: 'Review'},
    {kind: 'adjustment', title: 'Needs a fix', action: 'Resolve'},
    {kind: 'finance', title: 'Finance attention', action: 'Review finance'},
    {kind: 'system', title: 'System attention', action: 'Investigate'},
  ] as const;


  return (
      <dialog ref={notificationsRef} className={`${styles.slideover} ${state?.notificationsOpen ? styles.slideoverOpen : ''}`}
        aria-label="Notifications" aria-busy={busy} onCancel={event => { event.preventDefault(); actions.onNotificationsClose?.(); }}
        onClick={event => { if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) actions.onNotificationsClose?.();
        } }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
          const first = focusable[0]; const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className={styles.notifHead}>
          <div><b>Notifications</b><p className={inbox.subtitle}>Your decisions, issues and today&apos;s publishing.</p></div>
          <span style={{ flex: 1 }} />
          <button type="button" className={styles.notifCloseBtn} aria-label="Close" onClick={actions.onNotificationsClose}>×</button>
        </header>
        <div className={styles.panelScroll}>
          <div className={inbox.summary}>
            <strong>{loaded ? notifications.unreadCount : '—'}</strong><span>unread<br /><small>Opening an item marks it read, not resolved.</small></span>
            <button type="button" onClick={onRetry} disabled={loading || busy}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
          <div className={styles.notifFilters}>
            {(['all', 'approval', 'adjustment', 'finance', 'system'] as const).map(filter => (
              <button key={filter} type="button" className={(state.notificationFilter ?? 'all') === filter ? styles.filterChipActive : styles.filterChip}
                aria-pressed={(state.notificationFilter ?? 'all') === filter} onClick={() => actions.onNotificationFilterChange?.(filter)}>
                {{all:'All',approval:'Approvals',adjustment:'Issues',finance:'Finance',system:'System'}[filter]}
              </button>
            ))}
          </div>
          <div className={inbox.groups} aria-busy={loading}>
            {error ? <div role="alert" className={styles.emptyNote}>{error} <button type="button" onClick={onRetry} disabled={loading}>Retry</button></div> : loading && !loaded ? <p role="status">Loading your inbox…</p> : items.length === 0 ? <div className={inbox.empty}><strong>Nothing in this view</strong><p>No recorded notifications match this filter.</p></div> : null}
            {sections.map(section => {
              const rows = items.filter(item => item.kind === section.kind).sort((a,b) => Number(b.isUnread) - Number(a.isUnread));
              if (!rows.length) return null;
              return <section key={section.kind}>
                <h2 className={inbox.groupTitle}>{section.title}<span>{rows.length}</span></h2>
                {rows.map(item => <button key={item.id} type="button" className={inbox.item} disabled={busy} onClick={() => actions.onNotificationOpen?.(item.id)}>
                  <div className={inbox.itemTop}><span>{item.clientMonogram}</span><small>{item.timeLabel ?? ''}</small><em>{item.isUnread ? 'New' : 'Seen'}</em></div>
                  <strong>{item.title}</strong><p>{item.meta}</p><span className={inbox.itemAction}>{section.action}<span aria-hidden>↗</span></span>
                </button>)}
              </section>;
            })}
            {rightRail.publishingToday.length > 0 && <section className={inbox.schedule}>
              <h2 className={inbox.groupTitle}>Today&apos;s publishing<span>Dubai time</span></h2>
              {rightRail.publishingToday.map(item => <button key={item.id} type="button" className={styles.pubRow} onClick={() => actions.onPublishingItemOpen?.(item.id)}>
                <span className={styles.num}><DisplayText value={item.timeLabel} /></span><div><strong>{item.title}</strong><p>{item.clientName}</p></div>
              </button>)}
            </section>}
          </div>
        </div>
        <footer className={styles.notifFoot}>
          <button type="button" className={styles.markAllBtn} disabled={busy || loading || !notifications.unreadCount} onClick={actions.onMarkAllNotificationsRead}>Mark all read</button>
        </footer>
      </dialog>
  );
}
