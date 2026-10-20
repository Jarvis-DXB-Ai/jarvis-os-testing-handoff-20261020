"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import {clientOfficeHref} from "@/lib/office-client-view.mjs";
import officeNav from "./office-navigation.module.css";
import { usePathname, useSearchParams } from "next/navigation";
import {
  isClientTreeRoute,
  resolveSidebarActiveHref,
} from "@/components/layout/sidebar-route-matching";

type IconName =
  | "dashboard"
  | "office"
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
  isTestFixture?: boolean;
};

type SidebarVariant = "default" | "client-workspace" | "office";

const SHARED_NAV_GROUPS: NavGroup[] = [
  {
    section: "Operate",
    items: [
      { label: "Home", href: "/", icon: "dashboard" },
      { label: "Office", href: "/office", icon: "office" },
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

  if (name === "office") {
    return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 9-5 9 5v9l-9 5-9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v9M7 10v5m10-5v5" /></svg>;
  }

  if (name === "system") {
    return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" /></svg>;
  }

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
  const [officePinned, setOfficePinned] = useState(false), [officeHovered, setOfficeHovered] = useState(false);
  const officeTrigger = useRef<HTMLButtonElement>(null);
  const officeExpanded = officePinned || officeHovered;
  function navigate(href: string, event: MouseEvent<HTMLAnchorElement>) {
    setMobileOpen(false); setOfficePinned(false); setOfficeHovered(false);
    if (href === "/office" && pathname === "/office" && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      window.dispatchEvent(new Event("jarvis:office-home"));
      event.preventDefault();
    }
  }
  useEffect(() => {
    if (variant !== "office") return;
    document.body.classList.add("jarvis-office-rail-active");
    return () => document.body.classList.remove("jarvis-office-rail-active");
  }, [variant]);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const [dubaiTime, setDubaiTime] = useState("");
  const [clientTreeOpen, setClientTreeOpen] = useState(false);
  const [clientEntries, setClientEntries] = useState<ClientNavigationEntry[]>(
    [],
  );

  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = mobileDialog.current;
    const trigger = mobileTrigger.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
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
              isTestFixture: entry.isTestFixture === true,
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
  const renderClient = (client: ClientNavigationEntry) => {
                        const clientActive = pathname === '/office' && searchParams.get('clientId') === client.id ||
                          pathname === `/clients/${client.id}` ||
                          pathname.startsWith(`/clients/${client.id}/`);
                        return (
                          <Link
                            key={client.id}
                            href={clientOfficeHref(client.id)}
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
  };
  const actualClients = clientEntries.filter(client => !client.isTestFixture);
  const testClients = clientEntries.filter(client => client.isTestFixture);
  const navigation = (
    <nav
      aria-label="Main navigation"
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
                        onClick={event => navigate(href, event)}
                        aria-label={label} title={label} aria-current={active ? "page" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-3 px-3"
                      >
                        <NavIcon name={icon} />
                        <span className={officeNav.navLabel}>{label}</span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`${clientTreeVisible ? "Collapse" : "Expand"} clients`}
                        aria-expanded={clientTreeVisible}
                        onClick={() => { setClientTreeOpen(value => !value); if(variant === "office"){setOfficePinned(true);setOfficeHovered(false);} }}
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
                      onClick={event => navigate(href, event)}
                      aria-label={label} title={label} aria-current={active ? "page" : undefined}
                      className={`group/link relative flex h-10 items-center justify-between rounded-md px-3 text-sm font-medium transition duration-150 ${active ? "jarvis-nav-active text-emerald-50" : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200"}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <NavIcon name={icon} />
                        <span className={officeNav.navLabel}>{label}</span>
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
                  {isClients && clientTreeVisible && (variant !== "office" || officePinned) ? (
                    <div className="ml-5 mt-1 space-y-1 border-l border-white/[.09] pl-2">
                      <Link
                        href="/clients/new"
                        onClick={() => setMobileOpen(false)}
                        className={`flex h-8 items-center rounded px-2 text-xs font-semibold transition ${pathname === "/clients/new" ? "jarvis-nav-active text-emerald-50" : "text-emerald-100/75 hover:bg-emerald-300/[.07] hover:text-emerald-50"}`}
                      >
                        + New client
                      </Link>
                      <Link href="/office/demo" onClick={()=>setMobileOpen(false)} aria-current={pathname==='/office/demo'?'page':undefined} className={`flex min-h-8 items-center gap-2 rounded px-2 py-1.5 text-xs transition ${pathname==='/office/demo'?"jarvis-nav-active text-emerald-50":"text-white/52 hover:bg-white/[.04] hover:text-white/78"}`}><span className="flex h-4 w-4 items-center justify-center rounded bg-white/[.08] text-[8px]">D</span><span>Demo</span><small className="ml-auto text-[8px] opacity-60">Simulation</small></Link>
                      {actualClients.map(renderClient)}
                      {testClients.length > 0 && <details className={officeNav.fixtureGroup}><summary>Test clients · {testClients.length}</summary><p>Isolated QA records · not your client roster.</p>{testClients.map(renderClient)}</details>}
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
  if (variant === "office") return <aside
    className={officeNav.rail} data-expanded={officeExpanded} aria-label="Jarvis navigation"
    onPointerEnter={event => { if(event.pointerType === "mouse") setOfficeHovered(true); }}
    onPointerLeave={() => setOfficeHovered(false)}
    onKeyDown={event => { if(event.key === "Escape"){ event.preventDefault(); event.stopPropagation(); setOfficePinned(false); setOfficeHovered(false); officeTrigger.current?.focus(); } }}
    onBlur={event => { if(!event.currentTarget.contains(event.relatedTarget)) setOfficeHovered(false); }}
  >
    <div className={officeNav.railHead}><button ref={officeTrigger} type="button" aria-label={officePinned ? "Collapse navigation" : officeHovered ? "Keep navigation open" : "Expand navigation"} aria-expanded={officeExpanded} aria-controls="office-global-navigation" onClick={() => { setOfficePinned(value => !value); setOfficeHovered(false); }} title={officeExpanded ? "Collapse navigation" : "Expand navigation"}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m4-11 3 3-3 3"/></svg>
    </button><span className={officeNav.navLabel}>JARVIS</span></div>
    <div id="office-global-navigation" className={officeNav.railBody}>{navigation}</div>
    <div className={officeNav.railFoot}><span className={officeNav.navLabel}>Dubai{dubaiTime ? ` · ${dubaiTime}` : ""}</span><i aria-hidden="true"/></div>
  </aside>;
  return (
    <div data-jarvis-nav-trigger>
      <header className="fixed inset-x-0 top-0 z-50 flex h-[64px] items-center justify-between border-b border-white/[.08] bg-[#08080a]/85 px-4 text-white backdrop-blur-xl md:hidden">
        <button
          ref={mobileTrigger}
          onClick={() => setMobileOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/12 bg-[#050605]/80 text-white/80"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
        >
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2" aria-label="Jarvis">
          <span className="text-[13px] font-semibold tracking-[.2em] text-zinc-100">JARVIS</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
        </div>
        <span className="h-12 w-12" aria-hidden />
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
        <dialog
          ref={mobileDialog}
          aria-label="Navigation"
          className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[280px] max-w-[calc(100%-44px)] border-0 bg-transparent p-0 text-white backdrop:bg-black/65"
          onCancel={() => setMobileOpen(false)}
          onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className={`jarvis-sidebar ${variant === "client-workspace" ? "client-workspace-sidebar" : ""} flex h-full min-h-0 w-full flex-col px-4 py-5 text-white shadow-2xl`}
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
                className="min-h-11 min-w-11 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/65"
              >
                Close
              </button>
            </div>
            {navigation}
          </aside>
        </dialog>
      ) : null}
    </div>
  );
}
