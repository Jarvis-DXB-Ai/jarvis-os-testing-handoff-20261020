export type PaperclipOfficeSnapshot = {
  status: "connected" | "unavailable" | "not_configured";
  connectionError?: "configuration" | "authentication" | "timeout" | "network" | "http" | "response";
  message: string; checkedAt: string; version: string | null;
  company: { id: string; name: string; budgetMonthlyCents: number | null } | null;
  agents: { id: string; name: string; title: string; status: string; adapter: string; model: string | null; reportsTo: string | null; blueprintRoleId: string | null; clientId?:string|null;clientSlot?:string|null;qaDepartment?:string|null;spawnedForTask?: string | null }[];
  issues: { id: string; identifier: string; title: string; status: string; assigneeAgentId: string | null; parentId: string | null }[];
  runs: { id: string; agentId: string; status: string; startedAt: string | null; finishedAt: string | null; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; billingType: string | null; costUsd: number | null }[];
};
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.slice(0, 100).map(object) : [];
const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value.slice(0, 400) : fallback;
const nullable = (value: unknown): string | null => typeof value === "string" ? value.slice(0, 400) : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Explicit projections prevent adapter credentials, prompts and provider traces reaching the browser. */
export function projectPaperclipSnapshot(health: unknown, company: unknown, agents: unknown, issues: unknown, runs: unknown): PaperclipOfficeSnapshot {
  const h = object(health), c = object(company);
  if (h.status !== "ok" || !text(c.id) || ![agents, issues, runs].every(value => Array.isArray(value) && value.every(row => text(object(row).id)))) throw new Error("Paperclip did not return a valid company snapshot.");
  return {
    status: "connected", message: "Live Paperclip records. Registered roles and connection checks do not establish creative delivery readiness.", checkedAt: new Date().toISOString(), version: nullable(h.version),
    company: { id: text(c.id), name: text(c.name), budgetMonthlyCents: number(c.budgetMonthlyCents) },
    agents: (Array.isArray(agents)?agents.map(object):[]).map(a => {
      const config = object(a.adapterConfig), metadata = object(a.metadata);
      return { id: text(a.id), name: text(a.name), title: text(a.title), status: text(a.status, "unknown"), adapter: text(a.adapterType), model: nullable(config.model), reportsTo: nullable(a.reportsTo), blueprintRoleId: nullable(metadata.jarvisBlueprintRoleId), clientId:nullable(metadata.jarvisClientId),clientSlot:nullable(metadata.jarvisClientSlot),qaDepartment:nullable(metadata.jarvisQaDepartment),spawnedForTask: nullable(metadata.jarvisSpawnedForTask) };
    }),
    issues: rows(issues).map(i => ({ id: text(i.id), identifier: text(i.identifier), title: text(i.title), status: text(i.status), assigneeAgentId: nullable(i.assigneeAgentId), parentId: nullable(i.parentId) })),
    runs: rows(runs).map(r => {
      const u = object(r.usageJson);
      return { id: text(r.id), agentId: text(r.agentId), status: text(r.status), startedAt: nullable(r.startedAt), finishedAt: nullable(r.finishedAt), inputTokens: number(u.inputTokens), outputTokens: number(u.outputTokens), cachedInputTokens: number(u.cachedInputTokens), billingType: nullable(u.billingType), costUsd: number(r.costUsd) };
    }),
  };
}
