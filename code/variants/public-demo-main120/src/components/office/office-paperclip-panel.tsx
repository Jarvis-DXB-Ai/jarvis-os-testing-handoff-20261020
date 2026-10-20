"use client";
import { useEffect, useState } from "react";
import type { PaperclipOfficeSnapshot } from "@/lib/office-paperclip";
import styles from "./office-paperclip.module.css";

export function OfficePaperclipPanel() {
  const [snapshot, setSnapshot] = useState<PaperclipOfficeSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/office/paperclip", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Read failed");
        const data = await response.json() as PaperclipOfficeSnapshot;
        if (!controller.signal.aborted) { setSnapshot(data); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { inFlight = false; }
    }
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [revision]);
  const connected = snapshot?.status === "connected" && !error;
  const agent = snapshot?.agents.find(a => a.id === selected);
  return <section className={styles.panel} aria-label="Paperclip team coordination">
    <div className={styles.header}><div><span className={styles.eyebrow}>EXECUTION / PAPERCLIP</span><h2>Your team’s actual work.</h2></div><button onClick={() => setRevision(r => r + 1)}>Refresh connection ↻</button></div>
    <p className={styles.connection} role="status" data-ready={connected}>{error ? "Connection interrupted. The records below are from the last successful read." : snapshot?.message ?? "Checking the private Paperclip connection…"}</p>
    {snapshot?.company && <>
      <div className={styles.metrics}><span><strong>{snapshot.agents.length}</strong> configured agents</span><span><strong>{snapshot.issues.length}</strong> recent tasks shown</span><span><strong>{snapshot.runs.filter(r => r.status === "running").length}</strong> running in recent history</span></div>
      <p className={styles.notice}>Current instance: {snapshot.company.name} · Recorded Paperclip budget: {snapshot.company.budgetMonthlyCents === null ? "unknown" : `$${(snapshot.company.budgetMonthlyCents / 100).toFixed(2)}/month`}. This field does not limit subscription usage. Model work uses monthly plans; quotas are shared and an unpriced run is not free usage.</p>
      <details><summary>Configured agents and their models ({snapshot.agents.length})</summary><div className={styles.agents}>{snapshot.agents.map(a => <button key={a.id} aria-pressed={selected === a.id} onClick={() => setSelected(a.id)}><small>{a.adapter === "claude_local" ? "CLAUDE" : a.adapter === "codex_local" ? "CODEX" : a.adapter.toUpperCase()}</small><strong>{a.name}</strong><span>{a.status} · {a.model ?? "Provider default"}</span><em>{a.blueprintRoleId ? `Jarvis role: ${a.blueprintRoleId}` : "Not mapped to a Jarvis role"}</em></button>)}</div></details>
      {agent && <div className={styles.inspector}><strong>{agent.name} / {agent.title}</strong><p>Reports to {snapshot.agents.find(a => a.id === agent.reportsTo)?.name ?? "Company owner"}. Status is recorded by Paperclip; idle does not prove provider readiness.</p><div>{snapshot.runs.filter(r => r.agentId === agent.id).slice(0, 5).map(r => <p key={r.id}>{r.status} · {r.billingType ?? "Billing unknown"} · {r.inputTokens ?? "?"} input / {r.outputTokens ?? "?"} output / {r.cachedInputTokens ?? "?"} cached tokens · {r.costUsd === null ? "Cost not priced" : `$${r.costUsd.toFixed(4)}`}</p>)}</div></div>}
      <details><summary>Saved tasks and reporting relationships</summary>{snapshot.issues.map(i => <div className={styles.issue} key={i.id}><span>{i.identifier}</span><strong>{i.title}</strong><span>{i.status}</span><small>{snapshot.agents.find(a => a.id === i.assigneeAgentId)?.name ?? "Unassigned"}{i.parentId ? " · child task" : ""}</small></div>)}</details>
      <p className={styles.notice}>This connection reads real records. Assigning teams, creative tools and owner approvals through Paperclip are the next integration stages.</p>
    </>}
  </section>;
}
