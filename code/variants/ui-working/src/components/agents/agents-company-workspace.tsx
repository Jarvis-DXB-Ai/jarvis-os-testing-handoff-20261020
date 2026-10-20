"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { AgentRunsPanel } from "@/components/agents/agent-runs-panel";
import {
  AGENT_CAPABILITY_RELATIONSHIP_TYPES,
  AGENT_OPERATIONAL_STATUSES,
  AGENT_TOOL_ACCESS_TYPES,
  agentCapabilityRelationshipLabel,
  agentStatusLabel,
  agentToolAccessLabel,
  type AgentCapabilityLink,
  type AgentOperationalStatus,
  type AgentToolLink,
  type AgentWithRelations,
  type AgentsV2Snapshot,
} from "@/lib/agents-v2";
import type {
  AgentRunsSnapshot,
  AgentRuntimeDefinition,
} from "@/lib/agent-runtime";
import { toolLogoPath, toolOsLabel } from "@/lib/tools";

type DirectoryFilter = "all" | "runnable" | "attention";
type View = "organisation" | "runs";
type AgentDraft = {
  agent_name: string;
  agent_type: string;
  description: string;
  default_model: string;
  capabilities: string[];
  department_id: string;
  manager_agent_id: string;
  role_title: string;
  operational_status: AgentOperationalStatus;
  purpose: string;
  responsibilities: string[];
  boundaries: string[];
  input_requirements: string[];
  output_responsibilities: string[];
  context_access: string[];
  approval_requirements: string;
  escalation_path: string;
  os_release_overrides: string[];
  is_executive: boolean;
  sort_order: number;
  toolLinks: Array<Pick<AgentToolLink, "tool_id" | "access_type">>;
  capabilityLinks: Array<
    Pick<AgentCapabilityLink, "roadmap_item_id" | "relationship_type">
  >;
};

const organisationTone: Record<AgentOperationalStatus, string> = {
  active: "border-white/12 bg-white/[.035] text-white/66",
  experimental: "border-white/12 bg-white/[.035] text-white/60",
  planned: "border-white/12 bg-white/[.035] text-white/52",
  blocked: "border-rose-300/30 bg-rose-300/[.08] text-rose-100",
  deprecated: "border-white/10 bg-white/[.02] text-white/38",
};

function requestJson(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Agent request failed.");
    return data as AgentsV2Snapshot;
  });
}
function lines(value: string[]) {
  return value.join("\n");
}
function splitLines(value: string) {
  return [
    ...new Set(
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
function blankDraft(snapshot: AgentsV2Snapshot): AgentDraft {
  return {
    agent_name: "",
    agent_type: "",
    description: "",
    default_model: "",
    capabilities: [],
    department_id: snapshot.departments[0]?.id ?? "",
    manager_agent_id: "",
    role_title: "",
    operational_status: "planned",
    purpose: "",
    responsibilities: [],
    boundaries: [],
    input_requirements: [],
    output_responsibilities: [],
    context_access: [],
    approval_requirements: "",
    escalation_path: "",
    os_release_overrides: [],
    is_executive: false,
    sort_order: 999,
    toolLinks: [],
    capabilityLinks: [],
  };
}
function draftFromAgent(agent: AgentWithRelations): AgentDraft {
  return {
    agent_name: agent.agent_name,
    agent_type: agent.agent_type ?? "",
    description: agent.description ?? "",
    default_model: agent.default_model ?? "",
    capabilities: agent.capabilities,
    department_id: agent.department.id,
    manager_agent_id: agent.profile.manager_agent_id ?? "",
    role_title: agent.profile.role_title,
    operational_status: agent.profile.operational_status,
    purpose: agent.profile.purpose,
    responsibilities: agent.profile.responsibilities,
    boundaries: agent.profile.boundaries,
    input_requirements: agent.profile.input_requirements,
    output_responsibilities: agent.profile.output_responsibilities,
    context_access: agent.profile.context_access,
    approval_requirements: agent.profile.approval_requirements ?? "",
    escalation_path: agent.profile.escalation_path ?? "",
    os_release_overrides: agent.profile.os_release_overrides,
    is_executive: agent.profile.is_executive,
    sort_order: agent.profile.sort_order,
    toolLinks: agent.toolLinks.map((link) => ({
      tool_id: link.tool_id,
      access_type: link.access_type,
    })),
    capabilityLinks: agent.capabilityLinks.map((link) => ({
      roadmap_item_id: link.roadmap_item_id,
      relationship_type: link.relationship_type,
    })),
  };
}

export default function AgentsCompanyWorkspace({
  initialSnapshot,
  runtimeSnapshot,
  initialView = "organisation",
}: {
  initialSnapshot: AgentsV2Snapshot;
  runtimeSnapshot: AgentRunsSnapshot;
  initialView?: View;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [selected, setSelected] = useState<AgentWithRelations | null>(null);
  const [composer, setComposer] = useState<"add" | "edit" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeByAgent = useMemo(() => {
    const result = new Map<string, AgentRuntimeDefinition[]>();
    for (const definition of runtimeSnapshot.definitions) {
      result.set(definition.agent_id, [
        ...(result.get(definition.agent_id) ?? []),
        definition,
      ]);
    }
    return result;
  }, [runtimeSnapshot.definitions]);
  const runsByDefinition = useMemo(() => {
    const result = new Map<string, AgentRunsSnapshot["runs"]>();
    for (const run of runtimeSnapshot.runs)
      result.set(run.agent_runtime_definition_id, [
        ...(result.get(run.agent_runtime_definition_id) ?? []),
        run,
      ]);
    return result;
  }, [runtimeSnapshot.runs]);
  const linkedAgents = snapshot.agents.filter((agent) =>
    runtimeByAgent.has(agent.id),
  );
  const executive =
    snapshot.agents.find((agent) => agent.profile.is_executive) ?? null;
  const activeDepartments = snapshot.departments.filter(
    (department) => !department.is_future,
  );
  const futureDepartments = snapshot.departments.filter(
    (department) => department.is_future,
  );
  const visibleAgents = useMemo(() => {
    const base = snapshot.agents.filter(
      (agent) => agent.profile.operational_status !== "deprecated",
    );
    const visible =
      filter === "runnable"
        ? base.filter((agent) => Boolean(runtimeByAgent.get(agent.id)))
        : filter === "attention"
          ? base.filter(
              (agent) =>
                agent.profile.operational_status === "blocked" ||
                agent.readiness.status === "attention" ||
                agent.readiness.status === "blocked",
            )
          : base;
    return [...visible].sort(
      (left, right) =>
        directoryRank(left, runtimeByAgent) -
          directoryRank(right, runtimeByAgent) ||
        left.agent_name.localeCompare(right.agent_name),
    );
  }, [filter, runtimeByAgent, snapshot.agents]);
  function refresh(next: AgentsV2Snapshot) {
    setSnapshot(next);
    setSelected((current) =>
      current
        ? (next.agents.find((agent) => agent.id === current.id) ?? null)
        : null,
    );
  }
  async function save(draft: AgentDraft) {
    setSaving(true);
    setError(null);
    try {
      const next =
        composer === "add"
          ? await requestJson("/api/agents", {
              method: "POST",
              body: JSON.stringify(draft),
            })
          : await requestJson(`/api/agents/${selected?.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                expectedUpdatedAt: selected?.profile.updated_at,
                patch: draft,
              }),
            });
      refresh(next);
      setComposer(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save Agent.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#0a0a0b] pl-[72px] text-white">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-white/[.075] pb-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-200/70">
                System · Agent runtime
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] text-white sm:text-4xl">
                Agents
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/48">
                Organisation design and durable execution are intentionally
                shown together — without treating one as proof of the other.
              </p>
            </div>
            <button
              onClick={() => {
                setError(null);
                setComposer("add");
              }}
              className="w-fit rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#062016] transition hover:bg-emerald-200"
            >
              Add agent
            </button>
          </div>
          <nav
            aria-label="Agents workspace views"
            className="mt-6 flex w-fit gap-1 rounded-lg border border-white/10 bg-black/20 p-1"
          >
            <WorkspaceTab
              href="/agents"
              active={initialView === "organisation"}
              label="Organisation"
              count={snapshot.agents.length}
            />
            <WorkspaceTab
              href="/agents?view=runs"
              active={initialView === "runs"}
              label="Runs"
              count={runtimeSnapshot.runs.length}
            />
          </nav>
        </header>
        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-rose-300/25 bg-rose-300/[.08] px-4 py-3 text-sm text-rose-100"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-lg"
            >
              ×
            </button>
          </div>
        )}
        {initialView === "runs" ? (
          <div className="pt-7">
            <AgentRunsPanel initialSnapshot={runtimeSnapshot} />
          </div>
        ) : (
          <>
            <section className="mt-7 grid gap-5 rounded-2xl border border-white/[.09] bg-[radial-gradient(circle_at_72%_0%,rgba(74,222,128,.12),transparent_36%),#111412] p-5 sm:p-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,.65fr)]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-emerald-200/75">
                  Designed versus running
                </p>
                <h2 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-[-.035em] text-white sm:text-3xl">
                  {snapshot.agents.length} roles are specified.{" "}
                  {linkedAgents.length}{" "}
                  {linkedAgents.length === 1 ? "is" : "are"} linked to a runtime
                  definition.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/57">
                  An organisationally Active role is ready to be accountable in
                  the company structure. It does not mean the role is executing
                  now. Runtime activity is established only by its linked
                  definition and retained run ledger.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href="/agents?view=runs"
                    className="rounded-lg border border-emerald-300/30 bg-emerald-300/[.08] px-3.5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/60"
                  >
                    See what runs
                  </Link>
                  <button
                    onClick={() => {
                      setError(null);
                      setComposer("add");
                    }}
                    className="rounded-lg border border-white/12 px-3.5 py-2 text-sm font-medium text-white/68 transition hover:border-white/25 hover:text-white"
                  >
                    Add agent
                  </button>
                </div>
              </div>
              <div className="grid content-start gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-1">
                <HeroFact
                  value={`${linkedAgents.length} / ${snapshot.agents.length}`}
                  label="Organisation roles with a runtime"
                  tone={linkedAgents.length ? "emerald" : "muted"}
                />
                <HeroFact
                  value={String(runtimeSnapshot.definitions.length)}
                  label="Retained runtime definitions"
                />
                <HeroFact
                  value={String(runtimeSnapshot.runs.length)}
                  label="Retained runs in ledger"
                />
                <HeroFact
                  value={String(snapshot.departments.length)}
                  label="Organisation departments"
                />
              </div>
            </section>
            <OrganisationChart
              departments={activeDepartments}
              futureDepartments={futureDepartments}
              agents={snapshot.agents}
              executive={executive}
              runtimeByAgent={runtimeByAgent}
              runsByDefinition={runsByDefinition}
              onOpen={setSelected}
            />
            <RuntimeSummary
              definitions={runtimeSnapshot.definitions}
              agents={snapshot.agents}
              runsByDefinition={runsByDefinition}
            />
            <section className="mt-10 border-t border-white/[.075] pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/70">
                    Directory
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-.025em] text-white">
                    Every agent, organisation and runtime
                  </h2>
                  <p className="mt-1 text-sm text-white/45">
                    Runtime-linked records appear first; organisation status is
                    intentionally separate.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
                  {(["all", "runnable", "attention"] as DirectoryFilter[]).map(
                    (item) => (
                      <button
                        key={item}
                        onClick={() => setFilter(item)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === item ? "bg-white/[.09] text-white" : "text-white/48 hover:text-white/75"}`}
                      >
                        {item === "all"
                          ? "All"
                          : item === "runnable"
                            ? "Runtime linked"
                            : "Needs attention"}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <div className="hidden grid-cols-[minmax(230px,1.35fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_110px_145px] gap-4 border-b border-white/10 bg-white/[.025] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.13em] text-white/38 lg:grid">
                  <span>Agent</span>
                  <span>Role</span>
                  <span>Department</span>
                  <span>Runs</span>
                  <span>Runtime</span>
                </div>
                {visibleAgents.map((agent) => (
                  <AgentLedgerRow
                    key={agent.id}
                    agent={agent}
                    definition={runtimeByAgent.get(agent.id)?.[0]}
                    runs={runsForDefinitions(
                      runtimeByAgent.get(agent.id),
                      runsByDefinition,
                    )}
                    onOpen={() => setSelected(agent)}
                  />
                ))}
              </div>
            </section>
            <p className="mt-6 border-t border-white/[.075] pt-5 text-xs leading-relaxed text-white/38">
              Specified is not a failure state. Building an accountable
              organisation before every role has a runtime definition is valid;
              the interface makes the gap visible without overstating execution.
            </p>
          </>
        )}
        {selected && !composer && (
          <AgentDrawer
            agent={selected}
            definition={runtimeByAgent.get(selected.id)?.[0]}
            onClose={() => setSelected(null)}
            onEdit={() => {
              setError(null);
              setComposer("edit");
            }}
          />
        )}
        {composer && (
          <AgentEditor
            key={`${composer}-${selected?.id ?? "new"}`}
            agent={composer === "edit" ? selected : null}
            snapshot={snapshot}
            saving={saving}
            error={error}
            onClose={() => setComposer(null)}
            onSave={save}
          />
        )}
      </div>
    </main>
  );
}

function WorkspaceTab({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${active ? "bg-white/[.09] text-white" : "text-white/48 hover:text-white/75"}`}
    >
      {label}
      <span className="ml-2 text-xs text-white/38">{count}</span>
    </Link>
  );
}
function HeroFact({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "emerald" | "muted";
}) {
  return (
    <div className="bg-[#0c0e0d] px-4 py-3.5">
      <p
        className={`text-xl font-semibold tracking-[-.03em] ${tone === "emerald" ? "text-emerald-100" : tone === "muted" ? "text-white/70" : "text-white"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-white/42">{label}</p>
    </div>
  );
}

function OrganisationChart({
  departments,
  futureDepartments,
  agents,
  executive,
  runtimeByAgent,
  runsByDefinition,
  onOpen,
}: {
  departments: AgentsV2Snapshot["departments"];
  futureDepartments: AgentsV2Snapshot["departments"];
  agents: AgentWithRelations[];
  executive: AgentWithRelations | null;
  runtimeByAgent: Map<string, AgentRuntimeDefinition[]>;
  runsByDefinition: Map<string, AgentRunsSnapshot["runs"]>;
  onOpen: (agent: AgentWithRelations) => void;
}) {
  const people = (departmentId: string) =>
    agents.filter(
      (agent) =>
        agent.department.id === departmentId && agent.id !== executive?.id,
    );
  return (
    <section className="mt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/70">
            Designed organisation
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-.025em] text-white">
            Accountability has a shape
          </h2>
        </div>
        <p className="text-xs text-white/38">
          Connector motion is reserved for real runtime linkage; still lines
          describe organisation only.
        </p>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c0e0d] p-4 sm:p-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-white/12 bg-white/[.025] px-4 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
            Final human authority
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Calvin · MC Studios
          </h3>
          <p className="mt-1 text-xs text-white/45">
            Approves client-impacting, commercial, privacy, publishing and
            provider-spend decisions.
          </p>
        </div>
        <div className="mx-auto h-8 w-px bg-white/15" />
        {executive ? (
          <button
            onClick={() => onOpen(executive)}
            className="mx-auto block w-full max-w-xl rounded-xl border border-white/12 bg-[#121614] p-4 text-center transition hover:border-emerald-300/30"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/42">
              Orchestration
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {executive.agent_name}
            </h3>
            <p className="mt-1 text-xs text-white/48">
              {executive.profile.role_title}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <OrganisationStatus agent={executive} />
              <RuntimeLinkBadge
                definition={runtimeByAgent.get(executive.id)?.[0]}
                runs={runsForDefinitions(
                  runtimeByAgent.get(executive.id),
                  runsByDefinition,
                )}
              />
            </div>
          </button>
        ) : (
          <p className="text-center text-sm text-white/45">
            No executive organisation record is available.
          </p>
        )}
        <div className="mx-auto h-8 w-px bg-white/15" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {departments.map((department) => (
            <article
              key={department.id}
              className="min-w-0 rounded-xl border border-white/10 bg-[#0a0b0b] p-3.5"
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-emerald-200/65">
                    Department
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-white">
                    {department.name}
                  </h3>
                </div>
                <span className="text-xs text-white/35">
                  {people(department.id).length}
                </span>
              </div>
              <p className="mt-3 min-h-10 text-xs leading-relaxed text-white/42">
                {department.purpose}
              </p>
              <div className="mt-3 space-y-2">
                {people(department.id).map((agent) => {
                  const definitions = runtimeByAgent.get(agent.id);
                  const definition = definitions?.[0];
                  return (
                    <button
                      key={agent.id}
                      onClick={() => onOpen(agent)}
                      className="w-full rounded-lg border border-white/8 bg-white/[.018] p-3 text-left transition hover:border-emerald-300/25"
                    >
                      <p className="truncate text-sm font-medium text-white">
                        {agent.agent_name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/43">
                        {agent.profile.role_title}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <OrganisationStatus agent={agent} />
                        <RuntimeLinkBadge
                          definition={definition}
                          runs={runsForDefinitions(
                            definitions,
                            runsByDefinition,
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
                {!people(department.id).length && (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-white/38">
                    No role specified yet.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
      {futureDepartments.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/36">
                Future departments
              </p>
              <p className="mt-1 text-sm text-white/45">
                Organisation records exist, but these surfaces remain
                intentionally staged.
              </p>
            </div>
          </div>
          {futureDepartments.map((department) => (
            <article
              key={department.id}
              className="rounded-xl border border-dashed border-white/12 bg-white/[.015] p-3.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/36">
                Future department
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white/72">
                {department.name}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-white/40">
                {people(department.id)
                  .map((agent) => agent.agent_name)
                  .join(" · ") || "No role specified."}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function RuntimeSummary({
  definitions,
  agents,
  runsByDefinition,
}: {
  definitions: AgentRuntimeDefinition[];
  agents: AgentWithRelations[];
  runsByDefinition: Map<string, AgentRunsSnapshot["runs"]>;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-200/70">
            Runtime inventory
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-.025em] text-white">
            What actually runs
          </h2>
        </div>
        <Link
          href="/agents?view=runs"
          className="text-sm font-medium text-emerald-100 hover:text-emerald-50"
        >
          Open run ledger →
        </Link>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {definitions.map((definition) => {
          const linkedAgent = agents.find(
            (agent) => agent.id === definition.agent_id,
          );
          const runs = runsByDefinition.get(definition.id) ?? [];
          return (
            <article
              key={definition.id}
              className="rounded-xl border border-emerald-300/18 bg-emerald-300/[.035] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-emerald-200/70">
                    Runtime definition
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-white">
                    {definition.display_name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/52">
                    {definition.purpose}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-white/35">
                  {definition.definition_version}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3 text-xs">
                <span className="text-white/48">
                  {linkedAgent
                    ? `Linked to ${linkedAgent.agent_name}`
                    : "Not linked to an organisation role"}
                </span>
                <span className="text-white/20">·</span>
                <span className="text-white/48">
                  {runs.length} retained run{runs.length === 1 ? "" : "s"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {!definitions.length && (
        <p className="mt-4 rounded-xl border border-dashed border-white/12 px-4 py-8 text-sm text-white/45">
          No runtime definitions are retained.
        </p>
      )}
    </section>
  );
}
function AgentLedgerRow({
  agent,
  definition,
  runs,
  onOpen,
}: {
  agent: AgentWithRelations;
  definition?: AgentRuntimeDefinition;
  runs: AgentRunsSnapshot["runs"];
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="grid w-full gap-2 border-b border-white/[.075] px-4 py-4 text-left transition hover:bg-white/[.025] lg:grid-cols-[minmax(230px,1.35fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_110px_145px] lg:items-center lg:gap-4"
    >
      <span>
        <span className="block text-sm font-medium text-white">
          {agent.agent_name}
        </span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <OrganisationStatus agent={agent} />
          <RuntimeLinkBadge definition={definition} runs={runs} />
        </span>
      </span>
      <span className="text-xs text-white/52">{agent.profile.role_title}</span>
      <span className="text-xs text-white/45">{agent.department.name}</span>
      <span className="text-xs text-white/50">
        {definition ? `${runs.length} retained` : "—"}
      </span>
      <span className="text-xs text-white/50">
        {definition ? `Runtime ${definition.operational_status}` : "No runtime"}
      </span>
    </button>
  );
}
function OrganisationStatus({ agent }: { agent: AgentWithRelations }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em] ${organisationTone[agent.profile.operational_status]}`}
    >
      Org: {agentStatusLabel(agent.profile.operational_status)}
    </span>
  );
}
function RuntimeLinkBadge({
  definition,
  runs,
}: {
  definition?: AgentRuntimeDefinition;
  runs: AgentRunsSnapshot["runs"];
}) {
  const active = runs.some((run) =>
    ["queued", "observing", "running"].includes(run.status),
  );
  const waiting = runs.some((run) =>
    ["waiting_for_approval", "waiting_for_external"].includes(run.status),
  );
  const state = active
    ? "Executing"
    : waiting
      ? "Awaiting"
      : definition
        ? "Runtime linked"
        : "No runtime";
  const tone = active
    ? "border-emerald-300/30 bg-emerald-300/[.08] text-emerald-100"
    : waiting
      ? "border-amber-300/30 bg-amber-300/[.08] text-amber-100"
      : definition
        ? "border-emerald-300/20 bg-emerald-300/[.035] text-emerald-100/82"
        : "border-white/10 bg-white/[.02] text-white/42";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em] ${tone}`}
    >
      {state}
    </span>
  );
}
function directoryRank(
  agent: AgentWithRelations,
  runtimeByAgent: Map<string, AgentRuntimeDefinition[]>,
) {
  if (runtimeByAgent.has(agent.id)) return 0;
  if (
    agent.readiness.status === "blocked" ||
    agent.readiness.status === "attention" ||
    agent.profile.operational_status === "blocked"
  )
    return 1;
  if (agent.profile.operational_status === "active") return 2;
  return 3;
}
function runsForDefinitions(
  definitions: AgentRuntimeDefinition[] | undefined,
  runsByDefinition: Map<string, AgentRunsSnapshot["runs"]>,
) {
  return (
    definitions?.flatMap(
      (definition) => runsByDefinition.get(definition.id) ?? [],
    ) ?? []
  );
}

function AgentDrawer({
  agent,
  definition,
  onClose,
  onEdit,
}: {
  agent: AgentWithRelations;
  definition?: AgentRuntimeDefinition;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/70">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.agent_name} details`}
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/12 bg-[#0c0e0d] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
              Organisation record
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-.025em] text-white">
              {agent.agent_name}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {agent.profile.role_title} · {agent.department.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Agent details"
            className="rounded-md p-2 text-2xl leading-none text-white/50 hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <OrganisationStatus agent={agent} />
          <RuntimeLinkBadge definition={definition} runs={[]} />
        </div>
        <p className="mt-5 text-sm leading-relaxed text-white/64">
          {agent.profile.purpose}
        </p>
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Detail
            label="Runtime linkage"
            value={
              definition
                ? `${definition.display_name} · ${definition.operational_status}`
                : "No runtime definition linked to this organisation role."
            }
          />
          <Detail
            label="Readiness"
            value={agent.readiness.reason || agent.readiness.label}
          />
          <Detail label="Model" value={agent.default_model || "Not assigned"} />
          <Detail
            label="Organisation queue history"
            value={
              agent.execution.count
                ? `${agent.execution.count} record${agent.execution.count === 1 ? "" : "s"}`
                : "No organisation queue records"
            }
          />
        </section>
        <ListSection
          title="Responsibilities"
          items={agent.profile.responsibilities}
        />
        <ListSection title="Boundaries" items={agent.profile.boundaries} />
        <ListSection title="Inputs" items={agent.profile.input_requirements} />
        <ListSection
          title="Outputs"
          items={agent.profile.output_responsibilities}
        />
        <ListSection
          title="Allowed context"
          items={agent.profile.context_access}
        />
        <TextSection
          title="Approval requirements"
          value={agent.profile.approval_requirements}
        />
        <TextSection
          title="Escalation path"
          value={agent.profile.escalation_path}
        />
        <section className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-white">Skills</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {agent.skills.length ? (
              agent.skills.map((skill) => (
                <span
                  key={skill.id}
                  className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white/70"
                >
                  {skill.name}
                </span>
              ))
            ) : (
              <p className="text-sm text-white/45">
                No canonical Skills are assigned.
              </p>
            )}
          </div>
        </section>
        <section className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-white">Tools</h3>
          <div className="mt-3 space-y-2">
            {agent.toolLinks.length ? (
              agent.toolLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ToolMark
                      name={link.tool?.name ?? "Tool"}
                      logoKey={link.tool?.logo_key}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white/80">
                        {link.tool?.name ?? "Unavailable Tool"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-white/40">
                        {agentToolAccessLabel(link.access_type)} ·{" "}
                        {link.tool?.connection_status?.replaceAll("_", " ") ??
                          "unknown"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/45">
                No canonical Tool links are assigned.
              </p>
            )}
          </div>
        </section>
        <div className="mt-7 flex justify-end border-t border-white/10 pt-5">
          <button
            onClick={onEdit}
            className="rounded-lg bg-emerald-300 px-3.5 py-2 text-sm font-semibold text-[#062016] hover:bg-emerald-200"
          >
            Edit agent
          </button>
        </div>
      </aside>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/70">{value}</p>
    </div>
  );
}
function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-6 border-t border-white/10 pt-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/60">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-emerald-200">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-white/45">Not specified.</p>
      )}
    </section>
  );
}
function TextSection({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  return value ? (
    <section className="mt-6 border-t border-white/10 pt-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{value}</p>
    </section>
  ) : null;
}
function ToolMark({
  name,
  logoKey,
}: {
  name: string;
  logoKey?: string | null;
}) {
  const src = toolLogoPath(logoKey);
  const pale = [
    "anthropic",
    "github",
    "n8n",
    "posthog",
    "resend",
    "sentry",
  ].includes(logoKey ?? "");
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 ${pale ? "bg-white/90" : "bg-white/[.07]"} p-1`}
    >
      {src ? (
        <Image
          src={src}
          alt={`${name} logo`}
          width={32}
          height={32}
          unoptimized
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="text-[9px] font-bold text-emerald-100">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function AgentEditor({
  agent,
  snapshot,
  saving,
  error,
  onClose,
  onSave,
}: {
  agent: AgentWithRelations | null;
  snapshot: AgentsV2Snapshot;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: AgentDraft) => void;
}) {
  const [draft, setDraft] = useState<AgentDraft>(() =>
    agent ? draftFromAgent(agent) : blankDraft(snapshot),
  );
  const editing = Boolean(agent);
  function change<K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function listChange(
    key:
      | "capabilities"
      | "responsibilities"
      | "boundaries"
      | "input_requirements"
      | "output_responsibilities"
      | "context_access",
    value: string,
  ) {
    change(key, splitLines(value));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft);
  }
  function toggleTool(toolId: string) {
    change(
      "toolLinks",
      draft.toolLinks.some((link) => link.tool_id === toolId)
        ? draft.toolLinks.filter((link) => link.tool_id !== toolId)
        : [...draft.toolLinks, { tool_id: toolId, access_type: "allowed" }],
    );
  }
  function toggleCapability(capabilityId: string) {
    change(
      "capabilityLinks",
      draft.capabilityLinks.some(
        (link) => link.roadmap_item_id === capabilityId,
      )
        ? draft.capabilityLinks.filter(
            (link) => link.roadmap_item_id !== capabilityId,
          )
        : [
            ...draft.capabilityLinks,
            { roadmap_item_id: capabilityId, relationship_type: "supports" },
          ],
    );
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 sm:p-5">
      <form
        onSubmit={submit}
        className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-white/15 bg-[#0c0e0d] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
              Organisation editor
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {editing ? `Edit ${agent?.agent_name}` : "Add agent"}
            </h2>
            <p className="mt-1 text-xs text-white/45">
              This editor changes organisation records only. It never exposes
              credentials, system prompts or runtime policy controls.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Agent editor"
            className="text-2xl text-white/50 hover:text-white"
          >
            ×
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm text-rose-100"
          >
            {error}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Agent name">
            <input
              required
              value={draft.agent_name}
              onChange={(event) => change("agent_name", event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Agent type">
            <input
              value={draft.agent_type}
              onChange={(event) => change("agent_type", event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Department">
            <select
              value={draft.department_id}
              onChange={(event) => change("department_id", event.target.value)}
              className={fieldClass}
            >
              {snapshot.departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role title">
            <input
              required
              value={draft.role_title}
              onChange={(event) => change("role_title", event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Organisation status">
            <select
              value={draft.operational_status}
              onChange={(event) =>
                change(
                  "operational_status",
                  event.target.value as AgentOperationalStatus,
                )
              }
              className={fieldClass}
            >
              {AGENT_OPERATIONAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {agentStatusLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reports to">
            <select
              value={draft.manager_agent_id}
              onChange={(event) =>
                change("manager_agent_id", event.target.value)
              }
              className={fieldClass}
            >
              <option value="">No manager / executive</option>
              {snapshot.agents
                .filter((item) => item.id !== agent?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.agent_name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Legacy description">
          <textarea
            value={draft.description}
            onChange={(event) => change("description", event.target.value)}
            rows={2}
            className={fieldClass}
          />
        </Field>
        <Field label="Purpose">
          <textarea
            required
            value={draft.purpose}
            onChange={(event) => change("purpose", event.target.value)}
            rows={3}
            className={fieldClass}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default model">
            <input
              value={draft.default_model}
              onChange={(event) => change("default_model", event.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </Field>
          <Field label="Sort order">
            <input
              type="number"
              value={draft.sort_order}
              onChange={(event) =>
                change("sort_order", Number(event.target.value))
              }
              className={fieldClass}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TextList
            label="Responsibilities"
            value={lines(draft.responsibilities)}
            onChange={(value) => listChange("responsibilities", value)}
          />
          <TextList
            label="Boundaries"
            value={lines(draft.boundaries)}
            onChange={(value) => listChange("boundaries", value)}
          />
          <TextList
            label="Input requirements"
            value={lines(draft.input_requirements)}
            onChange={(value) => listChange("input_requirements", value)}
          />
          <TextList
            label="Output responsibilities"
            value={lines(draft.output_responsibilities)}
            onChange={(value) => listChange("output_responsibilities", value)}
          />
          <TextList
            label="Allowed context"
            value={lines(draft.context_access)}
            onChange={(value) => listChange("context_access", value)}
          />
          <TextList
            label="Legacy capabilities"
            value={lines(draft.capabilities)}
            onChange={(value) => listChange("capabilities", value)}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Approval requirements">
            <textarea
              value={draft.approval_requirements}
              onChange={(event) =>
                change("approval_requirements", event.target.value)
              }
              rows={3}
              className={fieldClass}
            />
          </Field>
          <Field label="Escalation path">
            <textarea
              value={draft.escalation_path}
              onChange={(event) =>
                change("escalation_path", event.target.value)
              }
              rows={3}
              className={fieldClass}
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-white/65">
          <input
            type="checkbox"
            checked={draft.is_executive}
            onChange={(event) => change("is_executive", event.target.checked)}
          />{" "}
          Executive role
        </label>
        <section className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-white">Tool access</h3>
          <p className="mt-1 text-xs text-white/45">
            Required links affect deterministic organisation readiness; they do
            not create runtime access.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {snapshot.tools.map((tool) => {
              const link = draft.toolLinks.find(
                (item) => item.tool_id === tool.id,
              );
              return (
                <div
                  key={tool.id}
                  className={`rounded-md border p-3 ${link ? "border-emerald-300/30 bg-emerald-300/[.06]" : "border-white/10 bg-black/20"}`}
                >
                  <label className="flex items-center gap-2 text-xs text-white/75">
                    <input
                      type="checkbox"
                      checked={Boolean(link)}
                      onChange={() => toggleTool(tool.id)}
                    />
                    <ToolMark name={tool.name} logoKey={tool.logo_key} />{" "}
                    <span>{tool.name}</span>
                  </label>
                  {link && (
                    <select
                      value={link.access_type}
                      onChange={(event) =>
                        change(
                          "toolLinks",
                          draft.toolLinks.map((item) =>
                            item.tool_id === tool.id
                              ? {
                                  ...item,
                                  access_type: event.target
                                    .value as AgentToolLink["access_type"],
                                }
                              : item,
                          ),
                        )
                      }
                      className={`${fieldClass} mt-2`}
                    >
                      {AGENT_TOOL_ACCESS_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {agentToolAccessLabel(value)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-white">
            Roadmap capabilities
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {snapshot.capabilities.map((capability) => {
              const link = draft.capabilityLinks.find(
                (item) => item.roadmap_item_id === capability.id,
              );
              return (
                <div
                  key={capability.id}
                  className={`rounded-md border p-3 ${link ? "border-emerald-300/30 bg-emerald-300/[.06]" : "border-white/10 bg-black/20"}`}
                >
                  <label className="flex items-start gap-2 text-xs text-white/75">
                    <input
                      type="checkbox"
                      checked={Boolean(link)}
                      onChange={() => toggleCapability(capability.id)}
                    />
                    <span>
                      {capability.title}{" "}
                      <span className="text-white/40">
                        · {toolOsLabel(capability.os_slug)}
                      </span>
                    </span>
                  </label>
                  {link && (
                    <select
                      value={link.relationship_type}
                      onChange={(event) =>
                        change(
                          "capabilityLinks",
                          draft.capabilityLinks.map((item) =>
                            item.roadmap_item_id === capability.id
                              ? {
                                  ...item,
                                  relationship_type: event.target
                                    .value as AgentCapabilityLink["relationship_type"],
                                }
                              : item,
                          ),
                        )
                      }
                      className={`${fieldClass} mt-2`}
                    >
                      {AGENT_CAPABILITY_RELATIONSHIP_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {agentCapabilityRelationshipLabel(value)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <div className="mt-7 flex justify-end gap-2 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-white/65 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-md bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#062016] disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add agent"}
          </button>
        </div>
      </form>
    </div>
  );
}
const fieldClass =
  "mt-1.5 w-full rounded-md border border-white/15 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50";
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3 block text-xs text-white/55">
      {label}
      {children}
    </label>
  );
}
function TextList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={`${label} (one per line)`}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className={fieldClass}
      />
    </Field>
  );
}
