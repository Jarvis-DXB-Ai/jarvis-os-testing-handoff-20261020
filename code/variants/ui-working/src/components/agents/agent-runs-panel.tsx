"use client";

import { useMemo, useState } from "react";

import {
  agentRunStatusLabel,
  type AgentStepStatus,
  type AgentRunsSnapshot,
  type AgentRunStatus,
  type AgentRuntimeDefinition,
} from "@/lib/agent-runtime";

type RuntimeRun = AgentRunsSnapshot["runs"][number];

const runTone: Record<AgentRunStatus, string> = {
  queued: "border-white/12 bg-white/[.035] text-white/62",
  observing: "border-sky-300/30 bg-sky-300/[.08] text-sky-100",
  running: "border-emerald-300/35 bg-emerald-300/[.09] text-emerald-100",
  waiting_for_approval: "border-amber-300/30 bg-amber-300/[.08] text-amber-100",
  waiting_for_external: "border-amber-300/30 bg-amber-300/[.08] text-amber-100",
  recovery_required: "border-rose-300/35 bg-rose-300/[.1] text-rose-100",
  completed: "border-emerald-300/25 bg-emerald-300/[.055] text-emerald-100",
  failed: "border-rose-300/35 bg-rose-300/[.1] text-rose-100",
  cancelled: "border-white/12 bg-white/[.035] text-white/55",
};

async function loadSnapshot() {
  const response = await fetch("/api/agent-runs", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load Agent Runs.");
  return data as AgentRunsSnapshot;
}

function policyNumber(policy: Record<string, unknown>, key: string) {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function canRunNow(definition: AgentRuntimeDefinition) {
  return (
    definition.agent_key === "system-health" &&
    definition.operational_status === "active" &&
    definition.allowed_triggers.includes("manual")
  );
}

export function AgentRunsPanel({
  initialSnapshot,
}: {
  initialSnapshot: AgentRunsSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RuntimeRun | null>(null);

  const runtimeFacts = useMemo(() => {
    const active = snapshot.runs.filter((run) =>
      ["queued", "observing", "running"].includes(run.status),
    ).length;
    const awaitingApproval = snapshot.runs.filter(
      (run) => run.status === "waiting_for_approval",
    ).length;
    const actualCost = snapshot.runs.reduce(
      (total, run) => total + Number(run.cost_actual_usd || 0),
      0,
    );
    return { active, awaitingApproval, actualCost };
  }, [snapshot.runs]);

  async function refresh() {
    try {
      setError(null);
      setSnapshot(await loadSnapshot());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh Agent Runs.",
      );
    }
  }

  async function runSystemHealth() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentKey: "system-health",
          idempotencyKey: crypto.randomUUID(),
          resourceKey: "system-health:production",
          goal: "Produce one internal production health report.",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Unable to start System Health Agent.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start System Health Agent.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="pb-10" aria-label="Runtime execution">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/70">
            Runtime execution
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-.025em] text-white">
            What actually runs
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/48">
            A durable ledger of permissioned runtime work. It stores actions,
            evidence and outcomes — not private reasoning.
          </p>
        </div>
        <button
          onClick={refresh}
          className="w-fit rounded-lg border border-white/12 px-3.5 py-2 text-sm font-medium text-white/72 transition hover:border-white/25 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-300/30 bg-rose-300/[.08] px-4 py-3 text-sm text-rose-100"
        >
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
        <RuntimeFact
          label="Manual definitions"
          value={String(
            snapshot.definitions.filter((definition) =>
              definition.allowed_triggers.includes("manual"),
            ).length,
          )}
          detail="Policy-authorized entry points"
        />
        <RuntimeFact
          label="In progress"
          value={String(runtimeFacts.active)}
          detail="Queued, observing or running"
          tone={runtimeFacts.active ? "emerald" : "muted"}
        />
        <RuntimeFact
          label="Awaiting approval"
          value={String(runtimeFacts.awaitingApproval)}
          detail="Human decision still required"
          tone={runtimeFacts.awaitingApproval ? "amber" : "muted"}
        />
        <RuntimeFact
          label="Recorded runtime cost"
          value={formatUsd(runtimeFacts.actualCost)}
          detail="Exact retained-run total"
        />
      </div>

      <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
        <RuntimeFact
          label="Autonomous execution"
          value={
            snapshot.settings.autonomous_execution_enabled
              ? "Enabled"
              : "Disabled"
          }
          detail="Scheduled and event triggers follow this switch"
          tone={
            snapshot.settings.autonomous_execution_enabled ? "emerald" : "amber"
          }
        />
        <RuntimeFact
          label="External mutations"
          value={
            snapshot.settings.external_mutations_enabled
              ? "Enabled"
              : "Disabled"
          }
          detail="Runtime policy remains the final gate"
          tone={
            snapshot.settings.external_mutations_enabled ? "amber" : "muted"
          }
        />
        <RuntimeFact
          label="Definitions"
          value={String(snapshot.definitions.length)}
          detail="Canonical runtime configuration"
        />
        <RuntimeFact
          label="Safety settings updated"
          value={formatTimestamp(snapshot.settings.updated_at)}
          detail="Retained global runtime record"
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/65">
              Definitions
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Permissioned runtime surface
            </h3>
          </div>
          <p className="text-xs text-white/38">
            A definition is not an execution. Only its run ledger establishes
            runtime activity.
          </p>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {snapshot.definitions.map((definition) => (
            <RuntimeDefinitionCard
              key={definition.id}
              definition={definition}
              running={running}
              onRunNow={runSystemHealth}
            />
          ))}
        </div>
      </section>

      <section className="mt-9">
        <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/65">
              Execution ledger
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Recent retained runs
            </h3>
          </div>
          <span className="text-xs text-white/38">
            {snapshot.runs.length} in this view
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {snapshot.runs.map((run) => (
            <RunLedgerCard
              key={run.id}
              run={run}
              onOpen={() => setSelectedRun(run)}
            />
          ))}
          {!snapshot.runs.length && (
            <div className="rounded-xl border border-dashed border-white/15 px-5 py-14 text-center text-sm text-white/45">
              No retained Agent runs yet. A policy-authorized manual action
              appears only where an existing runtime definition permits it.
            </div>
          )}
        </div>
      </section>

      {selectedRun && (
        <RunDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </section>
  );
}

function RuntimeFact({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "emerald" | "amber" | "muted";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-100"
      : tone === "amber"
        ? "text-amber-100"
        : tone === "muted"
          ? "text-white/75"
          : "text-white";
  return (
    <div className="bg-[#0c0e0d] px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/38">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-[-.03em] ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-white/42">{detail}</p>
    </div>
  );
}

function RuntimeDefinitionCard({
  definition,
  running,
  onRunNow,
}: {
  definition: AgentRuntimeDefinition;
  running: boolean;
  onRunNow: () => void;
}) {
  const budget = policyNumber(definition.cost_policy, "max_run_cost_usd");
  const manual = definition.allowed_triggers.includes("manual");
  const runNow = canRunNow(definition);
  return (
    <article className="rounded-xl border border-white/10 bg-[#0c0e0d] p-5 transition hover:border-emerald-300/25">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-white">
              {definition.display_name}
            </h4>
            <DefinitionStatus status={definition.operational_status} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/53">
            {definition.purpose}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-white/35">
          {definition.definition_version}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <MiniPill>
          {manual ? "Manual trigger allowed" : "No manual trigger"}
        </MiniPill>
        <MiniPill>
          {definition.client_scope_requirement === "required"
            ? "Client scope required"
            : definition.client_scope_requirement === "optional"
              ? "Client scope optional"
              : "System scope"}
        </MiniPill>
        {budget !== null && <MiniPill>Run cap {formatUsd(budget)}</MiniPill>}
        {definition.mutation_policy.internal_write === true && (
          <MiniPill>Internal write policy</MiniPill>
        )}
      </div>
      <div className="mt-5 flex min-h-9 items-center justify-between gap-3 border-t border-white/8 pt-4">
        <p className="text-xs text-white/40">
          {definition.agent_key === "social-intelligence"
            ? "Manual start is scoped to a client Social workspace."
            : "Existing policy and approval rules remain in force."}
        </p>
        {runNow && (
          <button
            disabled={running}
            onClick={onRunNow}
            className="shrink-0 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#062016] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Starting…" : "Run now"}
          </button>
        )}
      </div>
    </article>
  );
}

function RunLedgerCard({
  run,
  onOpen,
}: {
  run: RuntimeRun;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-xl border border-white/10 bg-[#0c0e0d] p-4 text-left transition hover:border-emerald-300/25 hover:bg-[#0e1210] sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-white">
              {run.definition?.display_name ?? "Unavailable runtime definition"}
            </h4>
            <RunStatus status={run.status} />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-white/55">{run.goal}</p>
          <p className="mt-2 text-xs text-white/40">
            {run.clientName
              ? `Client scope: ${run.clientName}`
              : "System scope"}{" "}
            · {labelize(run.trigger_type)} trigger ·{" "}
            {formatTimestamp(run.created_at)}
          </p>
        </div>
        <div className="shrink-0 text-left lg:text-right">
          <p className="text-xs text-white/52">
            {run.modelCallCount} model call{run.modelCallCount === 1 ? "" : "s"}{" "}
            · {formatUsd(Number(run.cost_actual_usd || 0))}
          </p>
          <p className="mt-1 text-xs text-white/36">
            Stage: {labelize(run.current_stage)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3 text-[11px] text-white/42">
        <span>
          {run.steps.length} audited step{run.steps.length === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>Approval: {labelize(run.approval_state)}</span>
        {Object.keys(run.output_summary).length > 0 && (
          <>
            <span>·</span>
            <span className="text-emerald-100/85">Output recorded</span>
          </>
        )}
      </div>
    </button>
  );
}

function RunDrawer({ run, onClose }: { run: RuntimeRun; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/70">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Agent run details"
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/12 bg-[#0c0e0d] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
              Runtime record
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-[-.025em] text-white">
              {run.definition?.display_name ?? "Unavailable runtime definition"}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              {run.goal}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close run details"
            className="rounded-md p-2 text-2xl leading-none text-white/50 hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <RunStatus status={run.status} />
          <MiniPill>Approval: {labelize(run.approval_state)}</MiniPill>
          <MiniPill>
            {run.clientName ? `Client: ${run.clientName}` : "System scope"}
          </MiniPill>
        </div>
        <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">
          <Detail label="Created" value={formatTimestamp(run.created_at)} />
          <Detail
            label="Completed"
            value={
              run.finished_at
                ? formatTimestamp(run.finished_at)
                : "Not completed"
            }
          />
          <Detail label="Model calls" value={String(run.modelCallCount)} />
          <Detail
            label="Recorded cost"
            value={formatUsd(Number(run.cost_actual_usd || 0))}
          />
        </dl>
        <section className="mt-7 border-t border-white/10 pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
            Audited steps
          </p>
          <ol className="mt-4 space-y-3">
            {run.steps.length ? (
              run.steps.map((step) => (
                <li
                  key={step.id}
                  className="rounded-lg border border-white/10 bg-black/15 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-white/82">
                      {labelize(step.stage)}
                    </span>
                    <span className="text-white/25">·</span>
                    <span className="text-xs text-white/55">
                      {labelize(step.action_key)}
                    </span>
                    <StepStatus status={step.status} />
                  </div>
                  {step.diagnostic && (
                    <p className="mt-2 text-xs leading-relaxed text-amber-100/85">
                      {step.diagnostic}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <li className="rounded-lg border border-dashed border-white/12 px-3 py-4 text-sm text-white/42">
                No step records have been retained for this run.
              </li>
            )}
          </ol>
        </section>
        <RunOutput run={run} />
      </aside>
    </div>
  );
}

function RunOutput({ run }: { run: RuntimeRun }) {
  const output = run.output_summary;
  if (!Object.keys(output).length)
    return (
      <section className="mt-7 border-t border-white/10 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
          Output
        </p>
        <p className="mt-3 text-sm text-white/45">
          This run produced no persisted output.
        </p>
      </section>
    );
  const period =
    output.period && typeof output.period === "object"
      ? (output.period as Record<string, unknown>)
      : null;
  const summary =
    typeof output.executive_summary === "string"
      ? output.executive_summary
      : typeof output.status === "string"
        ? labelize(output.status)
        : "Recorded output";
  return (
    <section className="mt-7 border-t border-white/10 pt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
        Output
      </p>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{summary}</p>
      {period && (
        <p className="mt-2 text-xs text-white/45">
          Period: {formatPeriod(period)}
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-white/38">
        The full structured record is retained in the runtime ledger; this
        surface shows only readable, operator-relevant fields.
      </p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0d0f0e] p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/38">
        {label}
      </dt>
      <dd className="mt-1 text-xs leading-relaxed text-white/72">{value}</dd>
    </div>
  );
}
function MiniPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[10px] font-medium text-white/58">
      {children}
    </span>
  );
}
function DefinitionStatus({
  status,
}: {
  status: AgentRuntimeDefinition["operational_status"];
}) {
  const tone =
    status === "active"
      ? "border-emerald-300/30 bg-emerald-300/[.08] text-emerald-100"
      : status === "blocked"
        ? "border-rose-300/30 bg-rose-300/[.08] text-rose-100"
        : "border-white/12 bg-white/[.035] text-white/58";
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${tone}`}
    >
      Runtime {labelize(status)}
    </span>
  );
}
function RunStatus({ status }: { status: AgentRunStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${runTone[status]}`}
    >
      {agentRunStatusLabel(status)}
    </span>
  );
}
function StepStatus({ status }: { status: AgentStepStatus }) {
  return (
    <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.1em] text-white/48">
      {labelize(status)}
    </span>
  );
}
function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Recorded time unavailable"
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
function formatPeriod(period: Record<string, unknown>) {
  const start = typeof period.start === "string" ? period.start : null;
  const end = typeof period.end === "string" ? period.end : null;
  return start && end ? `${start} to ${end}` : "Period retained";
}
