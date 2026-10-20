import blueprint from "./agent-company-blueprint.json";
import type { AgentsV2Snapshot } from "./agents-v2";
import type { AgentRunsSnapshot } from "./agent-runtime";

export type OfficeAgent = {
  id: string; name: string; role: string; purpose: string; departmentId: string;
  model: string | null; readiness: string; tools: string[]; skills: string[];
  operationalStatus: string;
  inputs: string[]; outputs: string[]; boundaries: string[]; approval: string | null;
  runtimeKey: string | null;
};
export type OfficeDepartment = { id: string; name: string; purpose: string; color: string };
export type OfficeRoster = { agents: OfficeAgent[]; departments: OfficeDepartment[] };
export const OFFICE_COLORS = ["#9ec6ff", "#bda4ed", "#eda78e", "#8fceb1", "#e1c681", "#90cdd3"];

export function blueprintRoster(): OfficeRoster {
  const departments: OfficeDepartment[] = [];
  const agents: OfficeAgent[] = [];
  const offices = [{ boundary: "Calvin approves client messages, commitments and scope changes.", departments: [blueprint.cooDepartment] }, ...blueprint.offices];
  for (const office of offices) for (const department of office.departments) {
    departments.push({ id: department.id, name: department.name, purpose: department.purpose, color: OFFICE_COLORS[departments.length % OFFICE_COLORS.length] });
    for (const role of department.roles) agents.push({
      id: role.id, name: role.name, role: role.name, purpose: role.purpose,
      departmentId: department.id, model: null, readiness: "Blueprint role", operationalStatus: "blueprint", tools: [], skills: [],
      inputs: [role.inputs], outputs: [role.output], boundaries: [office.boundary], approval: office.boundary, runtimeKey: null,
    });
  }
  return { agents, departments };
}

/** A room never mixes departments; larger departments receive additional rooms. */
export function officeDepartmentRooms(roster: OfficeRoster, department = "all", desks = 8) {
  if (!Number.isInteger(desks) || desks < 1) throw new Error("A room needs at least one desk.");
  const rooms: { name: string; departmentId: string; agents: OfficeAgent[] }[] = [];
  for (const group of roster.departments.filter(d => department === "all" || d.id === department)) {
    const members = roster.agents.filter(agent => agent.departmentId === group.id);
    for (let offset = 0; offset < members.length; offset += desks) rooms.push({ name: group.name, departmentId: group.id, agents: members.slice(offset, offset + desks) });
  }
  return rooms;
}

export function productionRoster(snapshot: AgentsV2Snapshot | null, runtime: AgentRunsSnapshot | null): OfficeRoster {
  if (!snapshot) return { agents: [], departments: [] };
  return {
    departments: snapshot.departments.map((d, i) => ({ id: d.id, name: d.name, purpose: d.purpose, color: OFFICE_COLORS[i % OFFICE_COLORS.length] })),
    agents: snapshot.agents.map(a => ({
      id: a.id, name: a.agent_name, role: a.profile.role_title, purpose: a.profile.purpose,
      departmentId: a.department.id, model: a.default_model,
      operationalStatus: a.profile.operational_status,
      readiness: a.profile.operational_status === "planned" ? "Planned" : a.readiness.label,
      tools: a.toolLinks.map(t => `${t.tool?.name ?? "Unavailable tool"} · ${t.tool?.connection_status ?? "unknown"}`),
      skills: a.skills.map(s => s.name), inputs: a.profile.input_requirements,
      outputs: a.profile.output_responsibilities, boundaries: a.profile.boundaries,
      approval: a.profile.approval_requirements,
      runtimeKey: runtime?.definitions.find(d => d.agent_id === a.id)?.agent_key ?? null,
    })),
  };
}

/** Show unfinished work first, otherwise the latest outcome, never an obsolete failure. */
export function recordedOfficeStates(runtime: AgentRunsSnapshot | null): Record<string, string> {
  const states: Record<string, string> = {};
  if (!runtime) return states;
  for (const definition of runtime.definitions) {
    const runs = runtime.runs.filter(r => r.agent_runtime_definition_id === definition.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const current = runs.find(r => ["running", "observing", "queued", "waiting_for_approval", "waiting_for_external", "recovery_required"].includes(r.status)) ?? runs[0];
    if (current) states[definition.agent_id] = current.status;
  }
  return states;
}

export type OfficeStep = {
  id: string; agentId: string; agentName: string; assignment: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  output: string | null; error: string | null;
};
export type OfficeTestRun = {
  id: string; brief: string; modelPolicy: "quality" | "balanced" | "fast";
  concurrency: number; createdAt: string; updatedAt: string;
  status: "running" | "waiting_for_review" | "approved" | "failed" | "cancelled" | "interrupted";
  steps: OfficeStep[]; failAgentId: string | null; reviewNote: string;
};
export const MODEL_POLICIES = {
  quality: "Quality first", balanced: "Balanced", fast: "Fast drafts",
} as const;
export const MAX_TEST_RUNS = 20;

export function createTestRun(input: { id: string; brief: string; agents: OfficeAgent[]; modelPolicy: OfficeTestRun["modelPolicy"]; concurrency: number; failAgentId: string | null }): OfficeTestRun {
  const brief = input.brief.trim();
  if (!brief || brief.length > 2000) throw new Error("Write a brief between 1 and 2,000 characters.");
  const agents = [...new Map(input.agents.map(a => [a.id, a])).values()];
  if (!agents.length || agents.length > 6) throw new Error("Choose one to six specialists.");
  if (![1, 2, 3, 4].includes(input.concurrency)) throw new Error("Parallel limit must be between one and four.");
  if (!(Object.hasOwn(MODEL_POLICIES, input.modelPolicy))) throw new Error("Choose a model policy.");
  if (input.failAgentId && !agents.some(a => a.id === input.failAgentId)) throw new Error("The failure test must target a selected agent.");
  const now = new Date().toISOString();
  return { id: input.id, brief, modelPolicy: input.modelPolicy, concurrency: input.concurrency, createdAt: now, updatedAt: now,
    status: "running", failAgentId: input.failAgentId, reviewNote: "", steps: agents.map(a => ({
      id: `${input.id}:${a.id}`, agentId: a.id, agentName: a.name,
      assignment: a.outputs[0] || a.purpose, status: "queued", output: null, error: null,
    })),
  };
}

/** Executor injection keeps orchestration independent of UI and provider adapters. */
export async function runOfficeTeam(
  initial: OfficeTestRun,
  execute: (step: OfficeStep, signal: AbortSignal) => Promise<string>,
  signal: AbortSignal,
  onUpdate: (run: OfficeTestRun) => void,
): Promise<OfficeTestRun> {
  const run = structuredClone(initial);
  let cursor = 0;
  const emit = () => { run.updatedAt = new Date().toISOString(); onUpdate(structuredClone(run)); };
  const workers = Array.from({ length: Math.min(run.concurrency, run.steps.length) }, async () => {
    while (!signal.aborted) {
      const step = run.steps[cursor++];
      if (!step) return;
      step.status = "running"; emit();
      try {
        const result = await execute({ ...step }, signal);
        if (signal.aborted) step.status = "cancelled";
        else if (!result.trim()) throw new Error("The specialist returned no output.");
        else { step.output = result; step.status = "completed"; }
      } catch (error) {
        step.status = signal.aborted ? "cancelled" : "failed";
        step.error = signal.aborted ? null : error instanceof Error ? error.message : "Specialist failed.";
      }
      emit();
    }
  });
  await Promise.all(workers);
  if (signal.aborted) {
    run.steps = run.steps.map(s => s.status === "queued" || s.status === "running" ? { ...s, status: "cancelled" } : s);
    run.status = "cancelled";
  } else run.status = run.steps.every(s => s.status === "completed" && s.output?.trim()) ? "waiting_for_review" : "failed";
  emit();
  return run;
}

export function reviewTestRun(run: OfficeTestRun, reviewNote: string): OfficeTestRun {
  if (run.status !== "waiting_for_review" || !run.steps.every(s => s.status === "completed" && s.output?.trim())) throw new Error("Only a complete team result can be reviewed.");
  return { ...run, status: "approved", reviewNote: reviewNote.trim().slice(0, 2000), updatedAt: new Date().toISOString() };
}

export function parseSavedOfficeRuns(raw: string | null): OfficeTestRun[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Invalid Office test history.");
  const restored = parsed.slice(0, MAX_TEST_RUNS).filter((r): r is OfficeTestRun => {
    if (!r || typeof r !== "object") return false;
    const row = r as OfficeTestRun;
    return typeof row.id === "string" && typeof row.brief === "string" && typeof row.reviewNote === "string"
      && typeof row.createdAt === "string" && typeof row.updatedAt === "string"
      && ["running", "waiting_for_review", "approved", "failed", "cancelled", "interrupted"].includes(row.status)
      && Object.hasOwn(MODEL_POLICIES, row.modelPolicy) && [1, 2, 3, 4].includes(row.concurrency)
      && Array.isArray(row.steps) && row.steps.length > 0 && row.steps.length <= 6
      && row.steps.every(s => s && typeof s.id === "string" && typeof s.agentId === "string" && typeof s.agentName === "string"
        && typeof s.assignment === "string" && ["queued", "running", "completed", "failed", "cancelled"].includes(s.status)
        && (s.output === null || typeof s.output === "string") && (s.error === null || typeof s.error === "string"));
  });
  // A closed tab cannot have continued executing. Preserve evidence, never invent completion.
  return restored.map(r => r.status === "running" ? { ...r, status: "interrupted", steps: r.steps.map(s => s.status === "running" || s.status === "queued" ? { ...s, status: "cancelled" } : s) } : r);
}

export function testOutput(brief: string, step: OfficeStep): string {
  return `TEST WORKSHEET · ${step.agentName}\n\nBrief\n${brief}\n\nAssigned deliverable\n${step.assignment}\n\nBefore production\n• Confirm the approved client context and reference assets.\n• Prepare the deliverable against this brief.\n• Verify factual claims, brand consistency and output requirements.\n• Save the result with its sources for review.\n\nThis is a deterministic workflow test, not AI-generated client work. No model, media, publishing or messaging provider was called.`;
}
