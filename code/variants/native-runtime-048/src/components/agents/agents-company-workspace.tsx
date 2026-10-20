"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { AgentModal } from "./agent-modal";
import { CompanyBlueprint } from "./company-blueprint";
import styles from "./agents-branding.module.css";

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
  initialSnapshot: AgentsV2Snapshot | null;
  runtimeSnapshot: AgentRunsSnapshot | null;
  initialView?: View;
}) {
  const [snapshot, setSnapshot] = useState<AgentsV2Snapshot>(initialSnapshot ?? {agents: [], departments: [], tools: [], capabilities: [], generatedAt: ""});
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [selected, setSelected] = useState<AgentWithRelations | null>(null);
  const [composer, setComposer] = useState<"add" | "edit" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeByAgent = useMemo(() => {
    const result = new Map<string, AgentRuntimeDefinition[]>();
    for (const definition of runtimeSnapshot?.definitions ?? []) {
      result.set(definition.agent_id, [
        ...(result.get(definition.agent_id) ?? []),
        definition,
      ]);
    }
    return result;
  }, [runtimeSnapshot?.definitions]);
  const runsByDefinition = useMemo(() => {
    const result = new Map<string, AgentRunsSnapshot["runs"]>();
    for (const run of runtimeSnapshot?.runs ?? [])
      result.set(run.agent_runtime_definition_id, [
        ...(result.get(run.agent_runtime_definition_id) ?? []),
        run,
      ]);
    return result;
  }, [runtimeSnapshot?.runs]);
  const linkedAgents = snapshot.agents.filter((agent) =>
    runtimeByAgent.has(agent.id),
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
    <main className={styles.root}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div><p className={styles.eyebrow}>System · Company & execution</p><h1 className={styles.title}>Your company.<br /><b>Powered by agents.</b></h1></div>
            <button type="button" disabled={!initialSnapshot} onClick={() => { setError(null); setComposer("add"); }} className={styles.primary}>Add organisation record</button>
          </div>
          <p className={styles.intro}>The structure we’re building, the roles already recorded, and the work that actually runs.</p>
          <nav aria-label="Agents workspace views" className={styles.tabs}>
            <WorkspaceTab href="/agents" active={initialView === "organisation"} label="Organisation" />
            {initialView === "organisation" && <a className={styles.tab} href="#recorded-agents">Existing records</a>}
            <WorkspaceTab href="/agents?view=runs" active={initialView === "runs"} label="Runs" count={runtimeSnapshot?.runs.length} />
          </nav>
        </header>
        {error && <div role="alert" className={styles.notice}><p>{error}</p><button className={styles.secondary} onClick={() => setError(null)}>Dismiss</button></div>}
        {initialView === "runs" ? (
          runtimeSnapshot ? <div className="pt-7"><AgentRunsPanel initialSnapshot={runtimeSnapshot} /></div> : <RuntimeUnavailable />
        ) : <>
          <CompanyBlueprint />
          <section id="recorded-agents" className={styles.directory} aria-labelledby="agent-directory-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>02 · Recorded organisation</p><h2 id="agent-directory-title">Existing agents</h2></div>
              <div className={styles.controls} role="group" aria-label="Filter existing agents">
                {(["all", "runnable", "attention"] as DirectoryFilter[]).map(item => <button type="button" key={item} disabled={item === "runnable" && !runtimeSnapshot} aria-pressed={filter === item} className={filter === item ? styles.primary : styles.secondary} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "runnable" ? "Has runtime definition" : "Needs attention"}</button>)}
              </div>
            </div>
            <p className={styles.intro}>These records retain their saved departments and managers. The blueprint above does not silently reassign them or activate new agents.</p>
            {!initialSnapshot ? <div role="status" className={styles.notice}>Organisation records are unavailable. The blueprint remains visible; creating or editing records is unavailable until the connection recovers.</div> : <>
              <div className={styles.directoryList}>{visibleAgents.map(agent => <AgentLedgerRow key={agent.id} agent={agent} definition={runtimeByAgent.get(agent.id)?.[0]} runtimeAvailable={!!runtimeSnapshot} runs={runsForDefinitions(runtimeByAgent.get(agent.id), runsByDefinition)} onOpen={() => setSelected(agent)} />)}</div>
              {!visibleAgents.length && <p className={styles.notice}>{snapshot.agents.length ? "No existing agents match this filter." : "No organisation records yet. The planned roles above have not been activated."}</p>}
            </>}
          </section>
          {!runtimeSnapshot && <RuntimeUnavailable />}
          <section aria-label="Recorded organisation and runtime facts" className={styles.facts}>
            <Fact value={initialSnapshot ? snapshot.agents.length : null} label="Recorded roles" />
            <Fact value={initialSnapshot && runtimeSnapshot ? linkedAgents.length : null} label="Roles with a runtime definition" />
            <Fact value={runtimeSnapshot?.definitions.length ?? null} label="Runtime definitions" />
            <Fact value={runtimeSnapshot?.runs.length ?? null} label="Retained runs" />
          </section>
        </>}
        {selected && !composer && (
          <AgentDrawer
            agent={selected}
            runtimeAvailable={!!runtimeSnapshot}
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

function WorkspaceTab({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className={styles.tab}>{label}{count !== undefined && <span>{count}</span>}</Link>;
}
function Fact({value, label}: {value: number | null; label: string}) {
  return <div className={styles.fact}><strong>{value === null ? "Unavailable" : value}</strong><span>{label}</span></div>;
}
function RuntimeUnavailable() {
  return <div className={styles.notice} role="status"><strong>Runtime information is unavailable</strong><p>Runtime records or safety settings could not be loaded. Execution controls are unavailable; the company blueprint remains accessible.</p><a href="/agents?view=runs" className={styles.secondary}>Reload runtime view</a></div>;
}
function AgentLedgerRow({agent, definition, runs, runtimeAvailable, onOpen}: {agent: AgentWithRelations; definition?: AgentRuntimeDefinition; runs: AgentRunsSnapshot["runs"]; runtimeAvailable: boolean; onOpen: () => void}) {
  return <button type="button" onClick={onOpen} className={styles.record}>
    <span><strong>{agent.agent_name}</strong><span className={styles.tags}><OrganisationStatus agent={agent} /><span className={styles.tag}>Readiness: {agent.readiness.label}</span></span><small>{agent.profile.role_title} · {agent.department.name}</small></span>
    <span>{runtimeAvailable ? <RuntimeLinkBadge definition={definition} runs={runs} /> : <span className={styles.tag}>Runtime unavailable</span>}<small>{agent.default_model || "Model not assigned"}</small></span>
    <span>{runtimeAvailable ? definition ? `${runs.length} retained runs` : "No runtime linked" : "Run history unavailable"} ↗</span>
  </button>;
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
  runtimeAvailable,
  agent,
  definition,
  onClose,
  onEdit,
}: {
  runtimeAvailable: boolean;
  agent: AgentWithRelations;
  definition?: AgentRuntimeDefinition;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <AgentModal label={`${agent.agent_name} details`} onClose={onClose}>
      <div
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
          {runtimeAvailable ? <RuntimeLinkBadge definition={definition} runs={[]} /> : <span className={styles.tag}>Runtime unavailable</span>}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-white/64">
          {agent.profile.purpose}
        </p>
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Detail
            label="Runtime linkage"
            value={
              !runtimeAvailable ? "Runtime information unavailable" : definition
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
      </div>
    </AgentModal>
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
    <AgentModal label={editing ? `Edit ${agent?.agent_name}` : "Add agent"} onClose={onClose} busy={saving} wide>
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
            disabled={saving}
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
            disabled={saving}
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
    </AgentModal>
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
