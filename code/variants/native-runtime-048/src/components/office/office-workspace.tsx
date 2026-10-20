"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AgentsV2Snapshot } from "@/lib/agents-v2";
import type { AgentRunsSnapshot } from "@/lib/agent-runtime";
import { blueprintRoster, createTestRun, productionRoster, reviewTestRun, runOfficeTeam, testOutput, type OfficeTestRun } from "@/lib/office";
import { saveRun, serverSnapshot, snapshot, subscribe } from "./office-test-store";
import { OfficeView, type OfficeDraft } from "./office-view";
import { OfficeCommandCenter } from "./office-command-center";

async function readSnapshot<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Office records could not be refreshed. Displaying the last available snapshot.");
  return response.json() as Promise<T>;
}
function waitForTest(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Cancelled")); return; }
    const abort = () => { clearTimeout(timer); reject(new Error("Cancelled")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export default function OfficeWorkspace({ initialAgents, initialRuntime, initialMode, initialClientId }: { initialClientId?:string; initialMode?: "test"; initialAgents: AgentsV2Snapshot | null; initialRuntime: AgentRunsSnapshot | null }) {
  const [agents, setAgents] = useState(initialAgents);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [mode, setMode] = useState<"recorded" | "test">(initialMode ?? "recorded");
  const [department, setDepartment] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const testState = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const testRoster = useMemo(() => blueprintRoster(), []);
  const roster = useMemo(() => mode === "test" ? testRoster : productionRoster(agents, runtime), [mode, testRoster, agents, runtime]);
  const selected = roster.agents.find(a => a.id === selectedId && (department === "all" || a.departmentId === department))
    ?? roster.agents.find(a => department === "all" || a.departmentId === department) ?? null;
  const selectedRun = testState.runs.find(r => r.id === selectedRunId) ?? testState.runs[0] ?? null;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; active.current?.abort(); };
  }, []);


  useEffect(() => { const home = () => setMode("recorded"); window.addEventListener("jarvis:office-home", home); return () => window.removeEventListener("jarvis:office-home", home); }, []);

  async function refresh() {
    setRefreshing(true); setError(null);
    const [a, r] = await Promise.allSettled([readSnapshot<AgentsV2Snapshot>("/api/agents"), readSnapshot<AgentRunsSnapshot>("/api/agent-runs")]);
    if (!alive.current) return;
    if (a.status === "fulfilled") setAgents(a.value);
    if (r.status === "fulfilled") setRuntime(r.value);
    if (a.status === "rejected") setError("Agent roster could not be refreshed. Saved jobs below remain accessible.");
    else if (r.status === "rejected") setError("The older Agent Runtime ledger could not be refreshed. Saved Office jobs below still work.");
    setRefreshing(false);
  }
  async function startTest(draft: OfficeDraft) {
    if (active.current) return;
    try {
      const run = createTestRun({ ...draft, id: crypto.randomUUID(), agents: testRoster.agents.filter(a => draft.agentIds.includes(a.id)), failAgentId: draft.fail ? draft.agentIds[0] ?? null : null });
      const controller = new AbortController(); active.current = controller;
      setRunning(true); setError(null); setSelectedRunId(run.id); setSelectedId(run.steps[0]?.agentId ?? null); saveRun(run);
      await runOfficeTeam(run, async (step, signal) => {
        const index = run.steps.findIndex(s => s.id === step.id);
        await waitForTest(3500 + index * 1400, signal);
        if (step.agentId === run.failAgentId) throw new Error("Intentional test failure: a required reference is unavailable. No result was invented.");
        return testOutput(run.brief, step);
      }, controller.signal, saveRun);
    } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "Unable to start test."); }
    finally { active.current = null; if (alive.current) setRunning(false); }
  }
  function approve(run: OfficeTestRun, note: string) {
    try { saveRun(reviewTestRun(run, note)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Review failed."); }
  }
  function exportRun(run: OfficeTestRun) {
    const blob = new Blob([JSON.stringify({ mode: "workflow-test", providerCalls: 0, run }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `jarvis-office-test-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (mode === "recorded") return <OfficeCommandCenter key={initialClientId||"agency"} initialClientId={initialClientId} legacyAgents={agents} onTest={() => setMode("test")} />;
  return <OfficeView mode={mode} roster={roster} selected={selected} department={department} runtime={runtime}
    rosterAvailable={agents !== null} runs={testState.runs} selectedRun={selectedRun} running={running} refreshing={refreshing}
    error={error ?? testState.warning} onMode={next => { setMode(next); setDepartment("all"); setSelectedId(null); setError(null); }}
    onDepartment={setDepartment} onSelect={setSelectedId} onSelectRun={setSelectedRunId} onRefresh={refresh}
    onStart={startTest} onCancel={() => active.current?.abort()} onApprove={approve} onExport={exportRun} />;
}
