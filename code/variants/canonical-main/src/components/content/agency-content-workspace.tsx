"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import type {
  AgencyContentData,
  AgencyContentRow,
  AgencyContentTone,
} from "@/lib/agency-content-server";

type GroupMode = "due" | "client" | "blocker";

const toneClasses: Record<AgencyContentTone, string> = {
  neutral: "text-white/42",
  info: "text-sky-300",
  warning: "text-amber-200",
  danger: "text-rose-300",
  ready: "text-emerald-200",
  done: "text-violet-200",
};

function dueLabel(value: string | null) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    todayParts.find((item) => item.type === type)?.value ?? "";
  const todayDate = new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00Z`,
  );
  const delta = Math.round((date.getTime() - todayDate.getTime()) / 86_400_000);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
}

function Gate({
  label,
  state,
}: {
  label: string;
  state: AgencyContentRow["readiness"][keyof AgencyContentRow["readiness"]];
}) {
  const complete = state === "complete";
  const pending = state === "pending";
  const unavailable = state === "not_applicable";
  return (
    <span
      aria-label={`${label}: ${complete ? "complete" : pending ? "pending" : unavailable ? "not applicable" : "missing"}`}
      title={`${label}: ${complete ? "complete" : pending ? "pending" : unavailable ? "not applicable" : "missing"}`}
      className={`grid h-5 w-5 place-items-center rounded-md border text-[9px] font-bold ${
        complete
          ? "border-white/15 bg-white/[0.09] text-white/80"
          : pending
            ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
            : unavailable
              ? "border-transparent text-white/20"
              : "border-dashed border-white/15 text-white/30"
      }`}
    >
      {label}
    </span>
  );
}

function ContentRow({ row }: { row: AgencyContentRow }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lineageAction = row.blocker === "Prepare publishing draft"
    ? "prepare_publishing_draft"
    : row.blocker === "Ready for review"
      ? "create_final_review"
      : null;
  const actionLabel = lineageAction === "prepare_publishing_draft"
    ? "Prepare publishing"
    : lineageAction === "create_final_review"
      ? "Assemble review"
      : null;
  const runLineageAction = async () => {
    if (!lineageAction || !row.lineage.id) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${row.clientId}/content-lineage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: lineageAction, lineageItemId: row.lineage.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "Content lineage action failed.");
      window.location.assign(lineageAction === "create_final_review" ? `/clients/${row.clientId}/content-review` : "/workspaces/social-media");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Content lineage action failed.");
      setBusy(false);
    }
  };
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.055] bg-[#141416] px-3 py-3.5 transition hover:bg-white/[0.025] sm:grid-cols-[26px_minmax(180px,1fr)_minmax(130px,.7fr)_auto_auto] sm:gap-4 sm:px-4">
      <span className="grid h-6 w-6 place-items-center rounded-md border border-white/[0.09] bg-white/[0.025] text-[9px] font-semibold text-white/55">
        {row.initials}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {row.title}
          </h3>
          <span
            className={`text-[10px] font-bold uppercase tracking-[0.09em] ${toneClasses[row.stateTone]}`}
          >
            {row.stateLabel}
          </span>
          <span
            title={
              row.lineage.state === "linked"
                ? `Canonical operating cycle: ${row.lineage.cycleLabel}`
                : "No canonical lineage link has been established"
            }
            className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${
              row.lineage.state === "linked"
                ? "text-emerald-200"
                : "text-white/28"
            }`}
          >
            {row.lineage.state === "linked"
              ? `Lineage · ${row.lineage.cycleLabel}`
              : "Lineage unlinked"}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-white/42">
          {row.clientName} · {row.format}
        </p>
        <p
          className={`mt-1 text-xs font-semibold sm:hidden ${toneClasses[row.blockerTone]}`}
        >
          {row.blocker} · {dueLabel(row.dueDate)}
        </p>
      </div>
      <div className="hidden min-w-0 sm:block">
        <p
          className={`truncate text-xs font-semibold ${toneClasses[row.blockerTone]}`}
        >
          {row.blocker}
        </p>
        <p className="mt-1 truncate text-[11px] text-white/36">
          {dueLabel(row.dueDate)} · {row.cycleLabel}
        </p>
      </div>
      <div className="hidden items-center gap-1.5 lg:flex">
        <Gate label="M" state={row.readiness.media} />
        <Gate label="C" state={row.readiness.caption} />
        <Gate label="✓" state={row.readiness.approval} />
      </div>
      <div className="flex min-w-0 flex-col items-end gap-1">
        {lineageAction && row.lineage.id ? <button type="button" disabled={busy} onClick={() => void runLineageAction()} className="rounded-lg border border-emerald-200/25 bg-emerald-300/[.08] px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 disabled:opacity-45">{busy ? "Working…" : actionLabel}</button> : <Link href={row.action.href} className="rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-[11px] font-semibold text-white/66 transition hover:border-emerald-200/25 hover:text-emerald-100">{row.action.label}</Link>}
        {error && <span role="alert" className="max-w-40 text-right text-[10px] text-rose-200">{error}</span>}
      </div>
    </article>
  );
}

export default function AgencyContentWorkspace({
  data,
}: {
  data: AgencyContentData;
}) {
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("due");

  const clients = useMemo(
    () =>
      data.coverage.map((client) => ({
        id: client.id,
        initials: client.initials,
        name: client.name,
      })),
    [data.coverage],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return data.rows.filter((row) => {
      if (clientId && row.clientId !== clientId) return false;
      if (blockedOnly && !row.blocked) return false;
      if (!needle) return true;
      return [
        row.title,
        row.clientName,
        row.format,
        row.blocker,
        row.stateLabel,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [blockedOnly, clientId, data.rows, query]);

  const metrics = useMemo(() => {
    const activePublishing = data.rows.filter(
      (row) =>
        row.source === "publishing" &&
        row.stateLabel !== "Publishing · Published",
    );
    const nextWeek = activePublishing.filter((row) =>
      ["overdue", "today", "week"].includes(row.lane),
    );
    const ready = activePublishing.filter(
      (row) => row.blocker === "Ready for scheduling",
    );
    const blocked = data.rows.filter((row) => row.blocked);
    const awaiting = activePublishing.filter(
      (row) => row.blocker === "Awaiting review",
    );
    return [
      {
        label: "Publishes in 7 days",
        value: nextWeek.length,
        detail: "Scheduled publishing items, including overdue",
        tone: "text-white",
      },
      {
        label: "Ready for scheduling",
        value: ready.length,
        detail: "Approved items with a selected platform target",
        tone: "text-emerald-200",
      },
      {
        label: "Needs attention",
        value: blocked.length,
        detail: "Missing production, review, or a safe handoff",
        tone: "text-rose-300",
      },
      {
        label: "Awaiting review",
        value: awaiting.length,
        detail: "Publishing items currently in review",
        tone: "text-amber-200",
      },
    ];
  }, [data.rows]);

  const groups = useMemo(() => {
    if (groupMode === "client") {
      return clients.map((client) => ({
        id: client.id,
        title: client.name,
        note: "Client production queue",
        tone: "bg-sky-300",
        rows: filtered.filter((row) => row.clientId === client.id),
      }));
    }
    if (groupMode === "blocker") {
      const definitions: Array<{
        id: string;
        title: string;
        note: string;
        tone: string;
        match: (row: AgencyContentRow) => boolean;
      }> = [
        {
          id: "danger",
          title: "Blocked",
          note: "A production or publishing issue needs attention",
          tone: "bg-rose-400",
          match: (row) => row.blockerTone === "danger",
        },
        {
          id: "warning",
          title: "Waiting on review",
          note: "A review or planning decision is needed",
          tone: "bg-amber-300",
          match: (row) => row.blockerTone === "warning",
        },
        {
          id: "ready",
          title: "Ready",
          note: "Nothing outstanding in the represented record",
          tone: "bg-emerald-300",
          match: (row) => row.blockerTone === "ready",
        },
        {
          id: "other",
          title: "On track / unlinked",
          note: "No urgent operational block is represented",
          tone: "bg-white/35",
          match: (row) => ["neutral", "info", "done"].includes(row.blockerTone),
        },
      ];
      return definitions.map((definition) => ({
        ...definition,
        rows: filtered.filter(definition.match),
      }));
    }
    const definitions: Array<{
      id: AgencyContentRow["lane"];
      title: string;
      note: string;
      tone: string;
    }> = [
      {
        id: "overdue",
        title: "Overdue",
        note: "Past the recorded publish date",
        tone: "bg-rose-400",
      },
      {
        id: "today",
        title: "Today",
        note: "Recorded publish date is today",
        tone: "bg-amber-300",
      },
      {
        id: "week",
        title: "Next 7 days",
        note: "The immediate operating window",
        tone: "bg-emerald-300",
      },
      {
        id: "later",
        title: "Later",
        note: "Scheduled beyond the next seven days",
        tone: "bg-sky-300",
      },
      {
        id: "unscheduled",
        title: "Unscheduled",
        note: "A represented record has no date",
        tone: "bg-white/35",
      },
    ];
    return definitions.map((definition) => ({
      ...definition,
      rows: filtered.filter((row) => row.lane === definition.id),
    }));
  }, [clients, filtered, groupMode]);

  return (
    <main className="jarvis-dark-shell agency-content-shell min-h-screen bg-[#0a0a0b] text-white">
      <Sidebar />
      <section className="relative z-[1] min-w-0 pl-[var(--jarvis-sidebar-width,0px)]">
        <div className="mx-auto w-full max-w-[1520px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="jarvis-eyebrow pl-12 md:pl-0">Workspace</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">
                Content
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/48 sm:text-[15px]">
                Every represented social item in flight, across every client,
                ordered by what needs attention next. This is an agency-wide
                operating view; detailed work stays with the client workspace
                that owns it.
              </p>
            </div>
            <p className="shrink-0 text-xs text-white/35">
              Read-only operating view
            </p>
          </header>

          <section className="mt-6 rounded-2xl border border-amber-300/15 bg-[linear-gradient(90deg,rgba(80,52,21,.32),rgba(20,20,22,.72))] px-4 py-4 sm:px-5">
            <p className="text-sm leading-6 text-amber-100/80">
              <span className="mr-2 font-bold text-amber-200">ⓘ</span>Nothing is
              authored here. Content is planned in Planner, produced in Studio,
              and reviewed, approved, and scheduled in Social. This page reads
              the records that exist and routes work back to its canonical
              owner.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link
                href="/clients"
                className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-semibold text-white/55 hover:text-white"
              >
                Client Planner
              </Link>
              <Link
                href="/clients"
                className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-semibold text-white/55 hover:text-white"
              >
                Visual production
              </Link>
              <Link
                href="/clients"
                className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-semibold text-white/55 hover:text-white"
              >
                Calendar & approval
              </Link>
              <Link
                href="/tasks"
                className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-semibold text-white/55 hover:text-white"
              >
                Human work
              </Link>
            </div>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-white/[0.075] bg-[#141416] p-4 sm:p-5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/38">
                  {metric.label}
                </p>
                <p
                  className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${metric.tone}`}
                >
                  {metric.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-white/42">
                  {metric.detail}
                </p>
              </div>
            ))}
          </section>

          <section className="mt-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                <label className="flex h-9 w-full items-center rounded-lg border border-white/[0.09] bg-[#121214] px-3 sm:w-60">
                  <span className="mr-2 text-white/28">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search represented content"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  />
                </label>
                <button
                  onClick={() => setClientId(null)}
                  className={`h-9 rounded-lg border px-3 text-xs font-semibold ${!clientId ? "border-white/25 bg-white/[0.08] text-white" : "border-white/[0.09] text-white/45 hover:text-white"}`}
                >
                  All clients
                </button>
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() =>
                      setClientId(client.id === clientId ? null : client.id)
                    }
                    title={client.name}
                    className={`h-9 rounded-lg border px-3 text-xs font-semibold ${clientId === client.id ? "border-emerald-200/30 bg-emerald-300/[0.1] text-emerald-100" : "border-white/[0.09] text-white/45 hover:text-white"}`}
                  >
                    {client.initials}
                  </button>
                ))}
                <button
                  onClick={() => setBlockedOnly((value) => !value)}
                  className={`h-9 rounded-lg border px-3 text-xs font-semibold ${blockedOnly ? "border-rose-300/30 bg-rose-300/[0.1] text-rose-100" : "border-white/[0.09] text-white/45 hover:text-white"}`}
                >
                  ● Needs attention
                </button>
              </div>
              <div className="flex items-center gap-1 self-start rounded-lg border border-white/[0.08] bg-black/20 p-1">
                <span className="px-2 text-[10px] font-bold uppercase tracking-[0.13em] text-white/30">
                  Group
                </span>
                {(
                  [
                    ["due", "Due date"],
                    ["client", "Client"],
                    ["blocker", "Blocker"],
                  ] as Array<[GroupMode, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setGroupMode(value)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${groupMode === value ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/75"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {groups
                .filter((group) => group.rows.length)
                .map((group) => (
                  <section key={group.id}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span className={`h-2 w-2 rounded-full ${group.tone}`} />
                      <h2 className="text-sm font-semibold text-white">
                        {group.title}
                      </h2>
                      <span className="text-xs text-white/35">
                        {group.rows.length}{" "}
                        {group.rows.length === 1 ? "item" : "items"}
                      </span>
                      <span className="ml-auto hidden text-xs text-white/30 sm:inline">
                        {group.note}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-white/[0.075] bg-[#141416]">
                      {group.rows.map((row) => (
                        <ContentRow key={row.id} row={row} />
                      ))}
                    </div>
                  </section>
                ))}
              {!groups.some((group) => group.rows.length) ? (
                <div className="rounded-2xl border border-dashed border-white/[0.12] px-5 py-12 text-center text-sm text-white/45">
                  No represented content matches the current filters.
                </div>
              ) : null}
            </div>
          </section>

          <section className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-white/[0.075] bg-[#141416] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/38">
                Coverage by client
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-white">
                Represented publishing and planner records
              </h2>
              <div className="mt-5 space-y-4">
                {data.coverage.map((client) => {
                  const total =
                    client.publishingCount + client.plannerOnlyCount;
                  const publishingWidth = total
                    ? (client.publishingCount / total) * 100
                    : 0;
                  return (
                    <div key={client.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-white/78">
                          {client.name}
                        </p>
                        <p className="text-xs text-white/42">
                          {client.publishingCount} publishing ·{" "}
                          {client.plannerOnlyCount} planner-only
                        </p>
                      </div>
                      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                        <span
                          className="bg-emerald-300"
                          style={{ width: `${publishingWidth}%` }}
                        />
                        <span
                          className="bg-white/25"
                          style={{ width: `${100 - publishingWidth}%` }}
                        />
                      </div>
                      <p
                        className={`mt-1.5 text-xs ${client.blockedCount ? "text-amber-200/75" : "text-white/32"}`}
                      >
                        {client.blockedCount
                          ? `${client.blockedCount} represented item${client.blockedCount === 1 ? "" : "s"} need attention`
                          : "No represented blockers"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <aside className="rounded-2xl border border-white/[0.075] bg-[#141416] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/38">
                Readiness gates
              </p>
              <div className="mt-4 space-y-3 text-xs text-white/48">
                <p>
                  <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-md border border-white/15 bg-white/[0.09] text-[9px] font-bold text-white/80">
                    M
                  </span>
                  Final publishing media exists.
                </p>
                <p>
                  <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-md border border-white/15 bg-white/[0.09] text-[9px] font-bold text-white/80">
                    C
                  </span>
                  A final caption exists where applicable.
                </p>
                <p>
                  <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-md border border-amber-300/25 bg-amber-300/10 text-[9px] font-bold text-amber-200">
                    ✓
                  </span>
                  The represented record has reached its native approval state.
                </p>
              </div>
              <p className="mt-5 border-t border-white/[0.07] pt-4 text-xs leading-5 text-white/32">
                Gates are derived from canonical publishing and Planner records.
                Unlinked planner concepts remain visible rather than being
                presented as publishable content.
              </p>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
