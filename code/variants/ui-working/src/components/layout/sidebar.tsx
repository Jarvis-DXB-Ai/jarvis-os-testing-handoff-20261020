"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  isClientTreeRoute,
  resolveSidebarActiveHref,
} from "@/components/layout/sidebar-route-matching";

type IconName =
  | "dashboard"
  | "roadmap"
  | "pitch"
  | "clients"
  | "agents"
  | "tools"
  | "finance"
  | "packages"
  | "skills"
  | "org"
  | "models"
  | "system"
  | "inspector"
  | "content"
  | "tasks";
type NavItem = { label: string; href: string; badge?: string; icon: IconName };
type NavGroup = { section: string; items: NavItem[] };
type ClientNavigationEntry = {
  id: string;
  name: string;
  attentionCount: number;
  logoUrl: string | null;
};

type SidebarVariant = "default" | "client-workspace";

const SHARED_NAV_GROUPS: NavGroup[] = [
  {
    section: "Operate",
    items: [
      { label: "Home", href: "/", icon: "dashboard" },
      { label: "Clients", href: "/clients", icon: "clients" },
      { label: "Content", href: "/workspaces/social-media", icon: "content" },
      { label: "Finance", href: "/finance", icon: "finance" },
      { label: "Tasks", href: "/tasks", icon: "tasks" },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Roadmap", href: "/roadmap", icon: "roadmap" },
      { label: "Agents", href: "/agents", icon: "agents" },
    ],
  },
  {
    section: "Build",
    items: [
      { label: "Tools", href: "/build?tab=tools", icon: "tools" },
      { label: "Skills", href: "/build?tab=skills", icon: "skills" },
      { label: "AI Models", href: "/build?tab=models", icon: "models" },
      {
        label: "Prompt Inspector",
        href: "/prompt-inspector",
        icon: "inspector",
      },
      {
        label: "System Operations",
        href: "/system-operations",
        icon: "system",
      },
      {
        label: "Organisation Structure",
        href: "/organisation-structure",
        icon: "org",
      },
      { label: "Packages", href: "/packages", icon: "packages" },
      { label: "Pitch Deck", href: "/pitch-deck", icon: "pitch" },
    ],
  },
];

// Global navigation stays identical inside a client workspace.
const CLIENT_WORKSPACE_GROUPS = SHARED_NAV_GROUPS;

function NavIcon({ name }: { name: IconName }) {
  const common = "h-4 w-4";

  if (name === "dashboard") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 13.5 12 6l8 7.5" />
        <path d="M6.5 12.5V20h11v-7.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }

  if (name === "clients") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" />
        <circle cx="12" cy="9" r="3" />
        <path d="M4.5 18c.2-1.7 1.3-3 2.8-3.6" />
        <path d="M16.7 14.4c1.5.6 2.6 1.9 2.8 3.6" />
      </svg>
    );
  }

  if (name === "tasks") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 5h11" />
        <path d="M7 12h11" />
        <path d="M7 19h11" />
        <path d="m3.5 5 .7.7 1.5-1.6" />
        <path d="m3.5 12 .7.7 1.5-1.6" />
        <path d="m3.5 19 .7.7 1.5-1.6" />
      </svg>
    );
  }

  if (name === "content") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.4" />
        <path d="m6.5 16 3.4-3.3 2.4 2 2.3-2.1 2.5 3.4" />
      </svg>
    );
  }

  if (name === "roadmap") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 19V5" />
        <path d="M4 18h16" />
        <path d="m7 15 3.5-4 3 2 4-6" />
        <circle cx="7" cy="15" r="1" />
        <circle cx="10.5" cy="11" r="1" />
        <circle cx="13.5" cy="13" r="1" />
        <circle cx="17.5" cy="7" r="1" />
      </svg>
    );
  }

  if (name === "pitch") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 15v-3" />
        <path d="M12 15V9" />
        <path d="M16 15v-5" />
      </svg>
    );
  }

  if (name === "agents") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="6" y="8" width="12" height="10" rx="3" />
        <path d="M12 8V5" />
        <path d="M9.5 13h.01" />
        <path d="M14.5 13h.01" />
        <path d="M9 18v2" />
        <path d="M15 18v2" />
      </svg>
    );
  }

  if (name === "skills") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 4 5 8v8l7 4 7-4V8l-7-4Z" />
        <path d="m8.5 10.5 3.5 2 3.5-2" />
        <path d="M12 12.5V17" />
      </svg>
    );
  }

  if (name === "tools") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m14.7 6.3 3 3" />
        <path d="m5 19 6.1-6.1" />
        <path d="m4 20 2.2-.6.6-2.2-2.2.6L4 20Z" />
        <path d="M14.5 4.5a4 4 0 0 0-5.2 5.2l-4.8 4.8 5.6 5.6 4.8-4.8a4 4 0 0 0 5.2-5.2l-2.5 2.5-3.1-.6-.6-3.1 2.5-2.4Z" />
      </svg>
    );
  }

  if (name === "finance") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M7 15v-3" />
        <path d="M12 15V8" />
        <path d="M17 15v-6" />
      </svg>
    );
  }

  if (name === "packages") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4.5 7.5h15v12h-15z" />
        <path d="M4.5 10.5h15" />
        <path d="M8 7.5v12" />
        <path d="M12 14h4" />
      </svg>
    );
  }

  if (name === "org") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="4" width="6" height="5" rx="1.5" />
        <rect x="4" y="15" width="6" height="5" rx="1.5" />
        <rect x="14" y="15" width="6" height="5" rx="1.5" />
        <path d="M12 9v3" />
        <path d="M7 15v-3h10v3" />
      </svg>
    );
  }

  if (name === "models") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 8.5 12 4l7 4.5v7L12 20l-7-4.5v-7Z" />
        <path d="M12 12 5.4 8.7" />
        <path d="M12 12v7.5" />
        <path d="m12 12 6.6-3.3" />
      </svg>
    );
  }

  if (name === "inspector") {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="5.5" />
        <path d="m15.5 15.5 4 4" />
        <path d="M11 8.5v5" />
        <path d="M8.5 11h5" />
      </svg>
    );
  }

  return (
    <svg
      className={common}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1" />
      <path d="m16.3 16.3 2.1 2.1" />
      <path d="m18.4 5.6-2.1 2.1" />
      <path d="m7.7 16.3-2.1 2.1" />
    </svg>
  );
}

let mountedSidebarCount = 0;

export default function Sidebar({
  variant = "default",
}: {
  variant?: SidebarVariant;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dubaiTime, setDubaiTime] = useState("");
  const [clientTreeOpen, setClientTreeOpen] = useState(false);
  const [clientEntries, setClientEntries] = useState<ClientNavigationEntry[]>(
    [],
  );
  const [homeUnreadCount, setHomeUnreadCount] = useState(0);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    mountedSidebarCount += 1;
    document.body.classList.add("jarvis-rail-active");
    return () => {
      mountedSidebarCount = Math.max(0, mountedSidebarCount - 1);
      if (mountedSidebarCount === 0)
        document.body.classList.remove("jarvis-rail-active");
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/") return;
    const receiveNotificationState = (event: Event) => {
      const unreadCount = (event as CustomEvent<{ unreadCount?: unknown }>).detail?.unreadCount;
      setHomeUnreadCount(typeof unreadCount === "number" ? unreadCount : 0);
    };
    window.addEventListener("jarvis:home-notification-state", receiveNotificationState);
    return () => window.removeEventListener("jarvis:home-notification-state", receiveNotificationState);
  }, [pathname]);

  useEffect(() => {
    const updateTime = () =>
      setDubaiTime(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Dubai",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
    updateTime();
    const interval = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/navigation")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.clients)) return;
        setClientEntries(
          data.clients
            .filter((entry: unknown): entry is ClientNavigationEntry =>
              Boolean(
                entry &&
                typeof entry === "object" &&
                typeof (entry as ClientNavigationEntry).id === "string" &&
                typeof (entry as ClientNavigationEntry).name === "string" &&
                typeof (entry as ClientNavigationEntry).attentionCount ===
                  "number",
              ),
            )
            .map((entry: ClientNavigationEntry) => ({
              id: entry.id,
              name: entry.name,
              attentionCount: entry.attentionCount,
              logoUrl: typeof entry.logoUrl === "string" ? entry.logoUrl : null,
            })),
        );
      })
      .catch(() => {
        // Unknown client signal state intentionally renders without a badge.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups =
    variant === "client-workspace"
      ? CLIENT_WORKSPACE_GROUPS
      : SHARED_NAV_GROUPS;
  const activeHref = resolveSidebarActiveHref(
    pathname,
    groups.flatMap(({ items }) => items.map(({ href }) => href)),
  );
  const activeBuildTab =
    pathname === "/build"
      ? ["tools", "skills", "models"].includes(searchParams.get("tab") ?? "")
        ? searchParams.get("tab")
        : "tools"
      : pathname === "/skills"
        ? "skills"
        : pathname === "/models"
          ? "models"
          : pathname === "/tools"
            ? "tools"
            : null;
  const clientTreeVisible = clientTreeOpen || isClientTreeRoute(pathname);
  const navigation = (
    <nav
      className={`${variant === "default" ? "mt-5" : "mt-4"} flex-1 space-y-5 overflow-y-auto`}
    >
      {groups.map(({ section, items }) => (
        <div key={section || "main"}>
          {section ? (
            <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[.16em] text-white/28">
              {section}
            </p>
          ) : null}
          <div className="space-y-1">
            {items.map(({ label, href, badge, icon }) => {
              const isClients = href === "/clients";
              const buildTab =
                href.match(/^\/build\?tab=(tools|skills|models)$/)?.[1] ?? null;
              const active = buildTab
                ? activeBuildTab === buildTab
                : activeHref === href;
              return (
                <div key={`${label}:${href}`}>
                  {isClients ? (
                    <div
                      className={`group/link relative flex h-10 items-center rounded-md text-sm font-medium transition duration-150 ${active ? "jarvis-nav-active text-emerald-50" : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200"}`}
                    >
                      <Link
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-3"
                      >
                        <NavIcon name={icon} />
                        <span className="truncate">{label}</span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`${clientTreeVisible ? "Collapse" : "Expand"} clients`}
                        aria-expanded={clientTreeVisible}
                        onClick={() => setClientTreeOpen((value) => !value)}
                        className="mr-1 flex h-8 w-8 items-center justify-center rounded text-white/45 hover:bg-white/[.06] hover:text-white"
                      >
                        <span
                          className={`text-sm transition-transform ${clientTreeVisible ? "rotate-90" : ""}`}
                        >
                          ›
                        </span>
                      </button>
                      {active ? (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.35)]" />
                      ) : null}
                    </div>
                  ) : (
                    <Link
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={`group/link relative flex h-10 items-center justify-between rounded-md px-3 text-sm font-medium transition duration-150 ${active ? "jarvis-nav-active text-emerald-50" : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200"}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <NavIcon name={icon} />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {badge ? (
                          <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                            {badge}
                          </span>
                        ) : null}
                        {active ? (
                          <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.35)]" />
                        ) : null}
                      </span>
                    </Link>
                  )}
                  {isClients && clientTreeVisible ? (
                    <div className="ml-5 mt-1 space-y-1 border-l border-white/[.09] pl-2">
                      <Link
                        href="/clients/new"
                        onClick={() => setMobileOpen(false)}
                        className={`flex h-8 items-center rounded px-2 text-xs font-semibold transition ${pathname === "/clients/new" ? "jarvis-nav-active text-emerald-50" : "text-emerald-100/75 hover:bg-emerald-300/[.07] hover:text-emerald-50"}`}
                      >
                        + New client
                      </Link>
                      {clientEntries.map((client) => {
                        const clientActive =
                          pathname === `/clients/${client.id}` ||
                          pathname.startsWith(`/clients/${client.id}/`);
                        return (
                          <Link
                            key={client.id}
                            href={`/clients/${client.id}`}
                            onClick={() => setMobileOpen(false)}
                            className={`flex min-h-8 items-center gap-2 rounded px-2 py-1.5 text-xs transition ${clientActive ? "jarvis-nav-active text-emerald-50" : "text-white/52 hover:bg-white/[.04] hover:text-white/78"}`}
                          >
                            {client.logoUrl ? (
                              <span
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 rounded-full bg-cover bg-center"
                                style={{
                                  backgroundImage: `url(${client.logoUrl})`,
                                }}
                              />
                            ) : (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[.08] text-[8px] font-bold text-white/65">
                                {client.name.slice(0, 1)}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">
                              {client.name}
                            </span>
                            {client.attentionCount > 0 ? (
                              <span className="rounded-full bg-amber-300/12 px-1.5 py-0.5 text-[9px] font-bold text-amber-100">
                                {client.attentionCount}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
  return (
    <div data-jarvis-nav-trigger>
      <header className="fixed inset-x-0 top-0 z-50 flex h-[52px] items-center justify-between border-b border-white/[.08] bg-[#08080a]/85 px-4 text-white backdrop-blur-xl md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-[#050605]/80 text-white/80"
          aria-label="Open navigation"
        >
          ☰
        </button>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2" aria-label="Jarvis">
          <span className="text-[13px] font-semibold tracking-[.2em] text-zinc-100">JARVIS</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
        </div>
        {pathname === "/" ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("jarvis:home-notifications-open"))}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-[#050605]/80 text-white/80"
            aria-label={`Notifications${homeUnreadCount ? `, ${homeUnreadCount} unread` : ""}`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 3h15z" /><path d="M10 21h4" />
            </svg>
            {homeUnreadCount > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-bold text-[#042b14]">{homeUnreadCount}</span> : null}
          </button>
        ) : <span className="h-9 w-9" aria-hidden />}
      </header>
      <aside
        className={`jarvis-sidebar ${variant === "client-workspace" ? "client-workspace-sidebar" : ""} fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-white/[.075] px-4 py-5 text-white md:flex`}
      >
        <div className="flex items-center gap-2.5">
          <p className="text-[14px] font-semibold tracking-[.14em] text-zinc-100">
            JARVIS
          </p>
          <span
            className="h-1.5 w-1.5 rounded-full bg-emerald-300"
            aria-label="Jarvis"
          />
        </div>
        <div className="mt-5">{navigation}</div>
        <div className="mt-4 border-t border-white/[.07] pt-3 text-[10px] tabular-nums text-zinc-500">
          Dubai{dubaiTime ? ` · ${dubaiTime}` : ""}
        </div>
      </aside>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-black/65 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className={`jarvis-sidebar ${variant === "client-workspace" ? "client-workspace-sidebar" : ""} flex h-full w-[280px] flex-col px-4 py-5 text-white shadow-2xl`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold tracking-[.14em]">
                  JARVIS
                </p>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/65"
              >
                Close
              </button>
            </div>
            {navigation}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
