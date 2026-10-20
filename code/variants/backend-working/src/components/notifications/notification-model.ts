import type {HomeNotification} from '@/lib/home-dashboard';
import type {DisplayValue, NotificationKind} from '@/components/dashboard/home-dashboard-view.model';
const known = (text: string, numericValue?: number): DisplayValue => ({kind:'known',text,numericValue});
const action = (id: string, label: string) => ({id,label,state:'enabled' as const});
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase() || 'J';
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai'}).format(new Date());
export function needsYou(notifications: HomeNotification[]) {
  const kinds: NotificationKind[] = ["approval", "adjustment", "system", "finance"];
  const labels: Record<NotificationKind, string> = { approval: "Approvals waiting", adjustment: "Adjustments requested", system: "System attention", finance: "Finance attention" };
  return kinds.flatMap((kind) => {
    const items = notifications.filter((item) => item.kind === kind && item.isUnread);
    if (!items.length) return [];
    return [{ id: `needs-${kind}`, label: labels[kind], note: known(items[0].meta), value: known(String(items.length), items.length), tone: kind === "approval" ? "green" as const : kind === "adjustment" || kind === "finance" ? "amber" as const : "plain" as const, openAction: action(`needs-${kind}-open`, "Open") }];
  });
}

export function notificationGroups(items: HomeNotification[], filter: "all" | NotificationKind) {
  const filtered = filter === "all" ? items : items.filter((item) => item.kind === filter);
  const date = today();
  return (["today", "earlier"] as const).flatMap((key) => {
    const groupItems = filtered.filter((item) => (!Number.isNaN(Date.parse(item.occurredAt)) && new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai'}).format(new Date(item.occurredAt)) === date ? "today" : "earlier") === key).map((item) => ({
      id: item.id,
      title: item.title,
      meta: item.meta,
      kind: item.kind,
      timeLabel: Number.isNaN(Date.parse(item.occurredAt)) ? 'Time unavailable' : new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Dubai'}).format(new Date(item.occurredAt)) + ' GST',
      clientMonogram: item.clientName ? initials(item.clientName) : "J",
      clientLogoUrl: item.clientLogoUrl,
      isUnread: item.isUnread,
    }));
    return groupItems.length ? [{ key, items: groupItems }] : [];
  });
}
