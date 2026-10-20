"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MonthlyPlansStageOne from "@/components/social/monthly-plans-stage-one";
import type { SocialPlannerEntry } from "@/lib/social-publishing";

type MonthlyPlan = {
  id: string;
  plan_month: string;
  status: string;
  target_feed_count: number;
  item_count: number | null;
  monthly_context?: string | null;
  strategy?: Record<string, unknown> | null;
  updated_at: string;
};

type PlanItem = {
  id: string;
  position: number;
  pillar: string | null;
  subject: string | null;
  creative_concept: string | null;
  production_method: string | null;
  planned_date: string | null;
  visual_direction: string | null;
  visual_direction_source: string | null;
  required_assets: string[] | null;
  status: string;
};

type PlanDetail = { plan: MonthlyPlan; items: PlanItem[] };
const STAGES = [
  { id: "context", label: "Context" },
  { id: "strategy", label: "Strategy" },
  { id: "feed-plan", label: "Feed plan" },
  { id: "visual-direction", label: "Visual direction" },
  { id: "concept-grid", label: "Concept grid" },
  { id: "production", label: "Production" },
] as const;

type View = "four-weeks" | "month" | "week";

function calendarDays(monthStart: string, view: View) {
  const month = new Date(`${monthStart}T00:00:00Z`);
  const first = new Date(month);
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const count = view === "week" ? 7 : view === "four-weeks" ? 28 : 42;
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function planStageState(plan: MonthlyPlan, items: PlanItem[]) {
  const target = plan.target_feed_count || 0;
  const context = Boolean(plan.monthly_context?.trim());
  const strategy = Boolean(
    plan.strategy &&
    Object.values(plan.strategy).some((value) =>
      Array.isArray(value) ? value.length : Boolean(value),
    ),
  );
  const feed = items.length >= target && target > 0;
  const visual = items.filter(
    (item) =>
      item.visual_direction_source &&
      item.visual_direction_source !== "unassigned" &&
      item.visual_direction?.trim(),
  ).length;
  const concepts = items.filter(
    (item) => item.subject?.trim() && item.creative_concept?.trim(),
  ).length;
  const approved = plan.status === "approved";
  return {
    context: {
      complete: context,
      detail: context ? "Month brief recorded" : "Month brief needed",
    },
    strategy: {
      complete: strategy,
      detail: strategy ? "Strategy recorded" : "Strategy needed",
    },
    "feed-plan": {
      complete: feed,
      detail: `${items.length} of ${target || "—"} concepts`,
    },
    "visual-direction": {
      complete: target > 0 && visual >= target,
      detail: visual ? `${visual} of ${target} directed` : "Needs feed plan",
    },
    "concept-grid": {
      complete: target > 0 && concepts >= target,
      detail: concepts ? `${concepts} concepts written` : "Concepts needed",
    },
    production: {
      complete: approved,
      detail: approved
        ? "Available after approval"
        : "Locked until monthly approval",
    },
  };
}

function entryLabel(entry: SocialPlannerEntry) {
  if (entry.title && !/^hf[ _-]/i.test(entry.title)) return entry.title;
  if (entry.format === "carousel") return "Carousel";
  if (entry.contentKind === "reel") return "Reel";
  if (entry.contentKind === "story") return "Story";
  return "Feed post";
}

function EntryBadge({
  entry,
  approved,
}: {
  entry: SocialPlannerEntry;
  approved: boolean;
}) {
  const failure =
    entry.providerExecution?.status === "failed" ||
    entry.providerExecution?.status === "partial" ||
    entry.providerExecution?.status === "recovery_required";
  const published =
    entry.providerExecution?.status === "published" ||
    entry.status === "Published";
  const scheduled =
    entry.providerExecution?.status === "scheduled" ||
    entry.status === "Scheduled";
  const tone = failure
    ? "border-red-300/30 bg-red-400/10 text-red-100"
    : published || scheduled
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : approved
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-white/[0.08] bg-white/[0.035] text-white/48";
  const state = failure
    ? "Blocked"
    : published
      ? "Published"
      : scheduled
        ? "Scheduled"
        : approved
          ? "Awaiting review"
          : "Planned";
  return (
    <span
      className={`block rounded-md border-l-2 px-2 py-1 text-[10px] leading-4 ${tone}`}
    >
      <span className="block truncate font-semibold">{entryLabel(entry)}</span>
      <span className="block opacity-75">
        {failure
          ? entry.providerExecution?.failureDiagnostic ||
            "Provider follow-up required"
          : `${entry.scheduledTime || "No time"} · ${state}`}
      </span>
    </span>
  );
}

export default function ClientPlannerWorkspace({
  clientId,
  initial,
}: {
  clientId: string;
  initial: { detail: PlanDetail | null; entries: SocialPlannerEntry[] };
}) {
  const searchParams = useSearchParams();
  const selectedPlanId = searchParams.get("plan");
  const [detail] = useState<PlanDetail | null>(initial.detail);
  const [entries] = useState<SocialPlannerEntry[]>(initial.entries);
  const [view, setView] = useState<View>("four-weeks");

  const stageState = useMemo(
    () => (detail ? planStageState(detail.plan, detail.items) : null),
    [detail],
  );
  const days = useMemo(
    () => (detail ? calendarDays(detail.plan.plan_month, view) : []),
    [detail, view],
  );
  const entriesByDate = useMemo(
    () =>
      entries.reduce<Record<string, SocialPlannerEntry[]>>((result, entry) => {
        (result[entry.scheduledDate] ??= []).push(entry);
        return result;
      }, {}),
    [entries],
  );

  if (selectedPlanId) return <MonthlyPlansStageOne clientId={clientId} />;
  if (!detail || !stageState)
    return (
      <section className="rounded-[20px] border border-dashed border-white/[0.1] bg-white/[0.018] p-8 text-sm text-white/48">
        No monthly plan exists for this client yet.
      </section>
    );

  const { plan, items } = detail;
  const currentStage =
    STAGES.find((stage) => !stageState[stage.id].complete) ??
    STAGES[STAGES.length - 1];
  const incompleteConcepts = items.filter(
    (item) => !item.subject?.trim() || !item.creative_concept?.trim(),
  ).length;
  const completed = items.filter(
    (item) => item.subject?.trim() && item.creative_concept?.trim(),
  ).length;
  const approved = plan.status === "approved";

  return (
    <section className="space-y-6 pb-8">
      <div className="planner-hero relative overflow-hidden rounded-[22px] border border-emerald-200/[0.15] bg-[radial-gradient(120%_150%_at_0%_0%,rgba(74,222,128,.24),rgba(24,107,58,.54)_42%,rgba(12,23,16,.98)_100%)] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_22px_48px_-30px_rgba(34,197,94,.42)] sm:px-7 sm:py-7">
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-950/75">
              Content plan
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#062713] sm:text-[38px]">
              {monthLabel(plan.plan_month)}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-950/75">
              {approved
                ? "This approved monthly plan is ready for its controlled production workflow."
                : "Production remains locked until this monthly plan is approved."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/clients/${clientId}/planner?plan=${plan.id}&stage=${currentStage.id}`}
              className="rounded-xl bg-[#062713] px-3.5 py-2.5 text-xs font-semibold text-emerald-50 transition hover:bg-black"
            >
              Continue plan
            </Link>
            <Link
              href={`/clients/${clientId}/social?tab=publishing`}
              className="rounded-xl border border-emerald-950/20 bg-emerald-50/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-50/20"
            >
              Content calendar
            </Link>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-emerald-950/15 pt-4 text-xs text-emerald-950/70">
          <span className="font-semibold">
            {plan.target_feed_count} concepts
          </span>
          <span className="h-1 w-1 rounded-full bg-emerald-950/40" />
          <span className="capitalize">
            {cleanLabel(plan.status, "Planning")}
          </span>
          <span className="h-1 w-1 rounded-full bg-emerald-950/40" />
          <span>
            Updated{" "}
            {new Intl.DateTimeFormat("en-GB", {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            }).format(new Date(plan.updated_at))}
          </span>
        </div>
      </div>

      <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#111113]">
        <div className="flex flex-col gap-2 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
              Monthly workflow
            </p>
            <p className="mt-1 text-sm text-white/55">
              Stage{" "}
              {STAGES.findIndex((stage) => stage.id === currentStage.id) + 1} of{" "}
              {STAGES.length} · {currentStage.label}
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${approved ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}
          >
            {approved
              ? "Approved monthly plan"
              : "Approval required before production"}
          </span>
        </div>
        <nav
          aria-label="Monthly plan stages"
          className="grid min-w-[720px] grid-cols-6 divide-x divide-white/[0.07] overflow-x-auto"
        >
          {STAGES.map((stage, index) => {
            const state = stageState[stage.id];
            const selected = stage.id === currentStage.id;
            return (
              <Link
                key={stage.id}
                href={`/clients/${clientId}/planner?plan=${plan.id}&stage=${stage.id}`}
                className={`min-w-0 px-4 py-4 transition hover:bg-white/[0.035] ${selected ? "bg-emerald-300/[0.055]" : ""}`}
              >
                <p className="flex items-center gap-2 text-xs font-semibold text-white">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${state.complete ? "bg-emerald-300 text-black" : stage.id === "production" && !approved ? "bg-white/[0.08] text-white/45" : selected ? "bg-amber-300 text-black" : "bg-white/[0.09] text-white/60"}`}
                  >
                    {state.complete ? "✓" : index + 1}
                  </span>
                  {stage.label}
                </p>
                <p
                  className={`mt-2 text-[11px] leading-4 ${state.complete ? "text-emerald-100/65" : stage.id === "production" && !approved ? "text-amber-100/65" : "text-white/40"}`}
                >
                  {state.detail}
                </p>
              </Link>
            );
          })}
        </nav>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
        <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#111113]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
                Feed plan
              </p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-white">
                {completed} written concepts
              </h3>
            </div>
            <Link
              href={`/clients/${clientId}/planner?plan=${plan.id}&stage=feed-plan`}
              className="text-xs font-semibold text-emerald-200/80 hover:text-emerald-100"
            >
              Open full plan →
            </Link>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {items.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                href={`/clients/${clientId}/planner?plan=${plan.id}&stage=feed-plan`}
                className="grid grid-cols-[30px_minmax(0,1fr)_auto] gap-3 px-5 py-3.5 transition hover:bg-white/[0.025]"
              >
                <span className="pt-0.5 text-xs font-semibold tabular-nums text-white/35">
                  {String(item.position).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">
                    {item.subject?.trim() || "Concept needs a subject"}
                  </span>
                  <span className="mt-1 block truncate text-xs text-white/42">
                    {item.production_method
                      ? cleanLabel(item.production_method, "Production method")
                      : item.creative_concept?.trim() ||
                        "Add a production method and creative direction"}
                  </span>
                </span>
                <span
                  className={`self-start rounded-full border px-2 py-1 text-[10px] font-semibold ${item.subject?.trim() && item.creative_concept?.trim() ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100" : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"}`}
                >
                  {item.subject?.trim() && item.creative_concept?.trim()
                    ? "Ready"
                    : "Needs input"}
                </span>
              </Link>
            ))}
            {items.length > 6 && (
              <Link
                href={`/clients/${clientId}/planner?plan=${plan.id}&stage=feed-plan`}
                className="block px-5 py-3 text-xs font-semibold text-white/45 hover:bg-white/[0.025] hover:text-white/75"
              >
                Show all {items.length} concepts
              </Link>
            )}
          </div>
        </section>
        <aside className="rounded-[20px] border border-white/[0.08] bg-[#111113] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/75">
            Attention
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-white">
            {incompleteConcepts
              ? `${incompleteConcepts} concepts need input`
              : "Plan is structurally complete"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/46">
            {incompleteConcepts
              ? "Complete the remaining concept detail before progressing into locked production work."
              : approved
                ? "The monthly approval gate is open. Production actions retain their existing safeguards."
                : "Review this month deliberately before approving it for production."}
          </p>
          <Link
            href={`/clients/${clientId}/planner?plan=${plan.id}&stage=${currentStage.id}`}
            className="mt-5 inline-flex text-xs font-semibold text-emerald-200 hover:text-emerald-100"
          >
            {incompleteConcepts
              ? "Continue the plan →"
              : "Review current stage →"}
          </Link>
        </aside>
      </div>

      <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#111113]">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
              Publishing calendar
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-white">
              {view === "four-weeks"
                ? "Next four weeks"
                : view === "month"
                  ? monthLabel(plan.plan_month)
                  : "Selected week"}
            </h3>
          </div>
          <div className="flex rounded-lg border border-white/[0.1] bg-black/20 p-1">
            {(
              [
                { id: "four-weeks", label: "4 weeks" },
                { id: "month", label: "Month" },
                { id: "week", label: "Week" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${view === option.id ? "bg-white/[0.11] text-white" : "text-white/42 hover:text-white/75"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-white/[0.06]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/35"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const inMonth = day.slice(0, 7) === plan.plan_month.slice(0, 7);
                return (
                  <div
                    key={day}
                    className={`min-h-[116px] border-b border-r border-white/[0.055] p-2.5 ${inMonth ? "bg-transparent" : "bg-black/15"}`}
                  >
                    <p
                      className={`text-[11px] font-semibold ${inMonth ? "text-white/60" : "text-white/25"}`}
                    >
                      {String(Number(day.slice(-2)))}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {(entriesByDate[day] ?? []).slice(0, 3).map((entry) => (
                        <EntryBadge
                          key={entry.id}
                          entry={entry}
                          approved={approved}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-white/[0.07] bg-black/15 px-5 py-3 text-xs text-white/42 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {approved
              ? "Approved calendar entries retain their exact content and approval state."
              : "This is a planning view. The month remains the approval unit."}
          </span>
          <Link
            href={`/clients/${clientId}/social?tab=planner`}
            className="font-semibold text-white/60 hover:text-white"
          >
            Open placement editor →
          </Link>
        </div>
      </section>
    </section>
  );
}
