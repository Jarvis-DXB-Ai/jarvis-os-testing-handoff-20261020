"use client";

import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import type {HomeDashboardData} from '@/lib/home-dashboard';
import type {HomeDashboardActions, HomeDashboardViewModel, NotificationKind, ViewAction} from '@/components/dashboard/home-dashboard-view.model';
import {NotificationPanel} from './notification-panel';
import {needsYou, notificationGroups} from './notification-model';
import homeStyles from '@/components/dashboard/home-dashboard-view.module.css';
import styles from './notifications.module.css';

type Snapshot = Pick<HomeDashboardData, 'notifications' | 'publishingToday' | 'generatedAt'>;
const NotificationContext = createContext<{seed: (data: Snapshot) => void}>({seed: () => {}});
export const useNotifications = () => useContext(NotificationContext);
const known = (text: string) => ({kind: 'known' as const, text});
const action = (id: string, label: string, disabledReason?: string): ViewAction => ({id,label,state:disabledReason ? 'disabled' : 'enabled',disabledReason});

/** One owner-scoped, in-memory notification session across all app routes. */
export function NotificationsProvider({children}: {children: ReactNode}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const current = useRef<Snapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | NotificationKind>('all');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readKeys = useRef(new Set<string>());
  const readRequest = useRef<AbortController | null>(null);
  const writeRequest = useRef<AbortController | null>(null);
  const lastRead = useRef(0);
  const revision = useRef(0);
  const navigationIntent = useRef(0);

  const seed = useCallback((data: Snapshot) => {
    const next = {generatedAt:data.generatedAt, publishingToday:data.publishingToday, notifications: data.notifications.map(item => readKeys.current.has(item.sourceKey) ? {...item,isUnread:false} : item)};
    current.current = next; lastRead.current = Date.now(); revision.current += 1;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    if (readRequest.current) return;
    const controller = new AbortController(); readRequest.current = controller;
    const startedRevision = revision.current;
    setLoading(true); setError(null);
    try {
      // Reuse the established owner-checked read contract, asynchronously. Home
      // seeds this cache from its existing response; other routes fetch once.
      const response = await fetch('/api/home', {cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('Notifications could not be loaded. Please retry.');
      const data: HomeDashboardData = await response.json();
      if (!Array.isArray(data.notifications) || !Array.isArray(data.publishingToday)) throw new Error('Notification data is unavailable. Please retry.');
      if (revision.current === startedRevision) seed({notifications:data.notifications,publishingToday:data.publishingToday,generatedAt:data.generatedAt});
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Notifications are unavailable.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (readRequest.current === controller) readRequest.current = null;
    }
  }, [seed]);

  useEffect(() => {
    // Allow Home's existing response to seed before making a duplicate read.
    const timer = setTimeout(() => { if (!current.current) void refresh(); }, 250);
    return () => { clearTimeout(timer); readRequest.current?.abort(); writeRequest.current?.abort(); };
  }, [refresh]);

  const markRead = async (ids: string[]) => {
    if (writeRequest.current) return false;
    const sourceKeys = current.current?.notifications.filter(item => ids.includes(item.id) && item.isUnread).map(item => item.sourceKey) ?? [];
    if (!sourceKeys.length) return true;
    const controller = new AbortController(); writeRequest.current = controller;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/home/notifications', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mark_read',sourceKeys}),signal:controller.signal});
      if (!response.ok) throw new Error(response.status === 409 ? 'Notifications changed. Refresh and try again.' : 'Could not mark notifications as read. Please retry.');
      for (const key of sourceKeys) readKeys.current.add(key);
      if (current.current) seed(current.current);
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Notifications could not be updated.');
      return false;
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      writeRequest.current = null;
    }
  };

  const notifications = snapshot?.notifications ?? [];
  const unreadCount = notifications.filter(item => item.isUnread).length;
  const close = () => { navigationIntent.current += 1; setOpen(false); };
  const navigate = (href: string) => { close(); router.push(href); };
  const rightRail: HomeDashboardViewModel['rightRail'] = {
    needsYou: needsYou(notifications),
    publishingToday: (snapshot?.publishingToday ?? []).map(item => ({...item,timeLabel:known(item.scheduledAt ? new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'}).format(new Date(item.scheduledAt)) : 'No time'),openAction:action(`publishing-open-${item.id}`,'Open publishing')})),
    quickActions: [action('qa-new-task','New task'),action('qa-log-expense','Log expense'),action('qa-run-scanner','Run scanner','Open Social to run a scanner.'),action('qa-system','System operations')],
  };
  const actions: HomeDashboardActions = {
    onNotificationsClose: close,
    onNotificationFilterChange: setFilter,
    onQuickAction: id => {
      const href = ({'qa-new-task':'/tasks','qa-log-expense':'/finance','qa-system':'/system-operations'} as Record<string,string>)[id];
      if (href) navigate(href);
    },
    onRailRowOpen: id => { const item = notifications.find(item => item.isUnread && item.kind === id.replace('needs-','')); if (item) navigate(item.href); },
    onPublishingItemOpen: id => { const item = snapshot?.publishingToday.find(item => item.id === id); if (item) navigate(item.href); },
    onNotificationOpen: id => {
      const item = notifications.find(item => item.id === id);
      const intent = ++navigationIntent.current;
      if (item) void markRead([id]).then(saved => { if (saved && intent === navigationIntent.current) navigate(item.href); });
    },
    onMarkAllNotificationsRead: () => { void markRead(notifications.map(item => item.id)); },
  };

  return <NotificationContext.Provider value={{seed}}>{children}
    <div className={`${homeStyles.root} ${styles.scope}`}>
      <button type="button" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Notifications${snapshot && unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={() => { setOpen(true); if (!current.current || error || Date.now() - lastRead.current > 60_000) void refresh(); }}>
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 3h15z"/><path d="M10 21h4"/></svg>
        <span className={styles.label}>Notifications</span>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>
      <NotificationPanel notifications={{unreadCount,groups:notificationGroups(notifications,filter)}} rightRail={rightRail} actions={actions}
        state={{notificationsOpen:open,notificationFilter:filter}} loading={loading} loaded={!!snapshot} busy={busy} error={error} onRetry={() => void refresh()}/>
    </div>
  </NotificationContext.Provider>;
}
