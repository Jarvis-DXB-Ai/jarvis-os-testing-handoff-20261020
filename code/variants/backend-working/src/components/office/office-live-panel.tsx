"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MODEL_POLICIES, type OfficeRoster } from "@/lib/office";
import type { OfficeTeamCatalog, OfficeTeamJob } from "@/lib/office-team-server";
import styles from "./office-live.module.css";

const LABELS: Record<OfficeTeamJob["status"], string> = {
  queued: "Queued", running: "Working", cancel_requested: "Stopping", needs_review: "Needs review", reviewed: "Reviewed",
  failed: "Failed", recovery_required: "Recovery needed", cancelled: "Cancelled",
};
function statusLabel(job: OfficeTeamJob): string {
  if (job.execution_mode === "fixture" && job.status === "needs_review") return "Test ready";
  if (job.execution_mode === "fixture" && job.status === "reviewed") return "Test inspected";
  return LABELS[job.status];
}
async function jsonRequest<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Office request failed (${response.status}).`);
  return payload;
}
export function OfficeLivePanel({ roster, onJobsChange, selectedJobId, onSelectJob }: { roster: OfficeRoster; onJobsChange: (jobs: OfficeTeamJob[]) => void; selectedJobId?:string|null;onSelectJob?:(id:string|null)=>void }) {
  const [catalog, setCatalog] = useState<OfficeTeamCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [clientId, setClientId] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState(2);
  const [policy, setPolicy] = useState<"quality" | "balanced" | "fast">("balanced");
  const [localSelectedId,setLocalSelectedId]=useState<string|null>(null);
  const selectedId=selectedJobId??localSelectedId;
  function setSelectedId(id:string|null){if(onSelectJob)onSelectJob(id);else setLocalSelectedId(id);}
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string | null>(null);
  const current = catalog?.jobs.find(j => j.id === selectedId) ?? catalog?.jobs[0] ?? null;
  const trace = current?.context_manifest.model_trace as { planner?: { model: string } | null; lead?: { model: string } | null; checker?: { model: string } | null } | undefined;
  const load = useCallback(async () => {
    try { const data = await jsonRequest<OfficeTeamCatalog>("/api/office/jobs"); setCatalog(data); onJobsChange(data.jobs); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Office jobs could not be loaded."); }
  }, [onJobsChange]);
  useEffect(() => { const initial = setTimeout(() => { void load(); }, 0); const interval = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000); return () => { clearTimeout(initial); clearInterval(interval); }; }, [load]);
  useEffect(() => {
    const openFromHeader = () => { if (window.location.hash === "#office-live") setDraftOpen(true); };
    openFromHeader();
    window.addEventListener("hashchange", openFromHeader);
    return () => window.removeEventListener("hashchange", openFromHeader);
  }, []);
  function updateBrief(value: string) { setBrief(value); requestKey.current = null; }
  function chooseAgent(id: string) { setAgentIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : ids.length < 6 ? [...ids, id] : ids); requestKey.current = null; }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !catalog || catalog.availability.mode === "unavailable") return;
    setBusy(true); setError(null);
    try {
      const key = requestKey.current ?? crypto.randomUUID(); requestKey.current = key;
      const acceptanceCriteria = criteriaText.split("\n").map(item => item.trim()).filter(Boolean);
      const { job } = await jsonRequest<{ job: OfficeTeamJob }>("/api/office/jobs", { brief, acceptanceCriteria, clientId: clientId || null, agentIds, concurrency, modelPolicy: policy, idempotencyKey: key, autoStart: true });
      requestKey.current = null; setSelectedId(job.id); setDraftOpen(false); await load();
      // The server owns the dispatch; polling continues after this tab closes.
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Team job failed."); await load(); }
    finally { setBusy(false); }
  }
  async function review(job: OfficeTeamJob) {
    setBusy(true); setError(null);
    try { await jsonRequest(`/api/office/jobs/${job.id}/review`, { note }); setNote(""); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Review failed."); }
    finally { setBusy(false); }
  }
  async function cancel(job: OfficeTeamJob) {
    setBusy(true); setError(null);
    try { await jsonRequest(`/api/office/jobs/${job.id}/cancel`, {}); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Stop request failed."); }
    finally { setBusy(false); }
  }
  function retry(job: OfficeTeamJob) {
    const issues = (job.context_manifest.qa as { issues?: string[] } | undefined)?.issues ?? [];
    const revision = [job.review_note, ...issues].filter(Boolean).join(" ").trim();
    setBrief((revision ? `${job.brief}\n\nRevision notes: ${revision}` : job.brief).slice(0, 2000));
    setCriteriaText(Array.isArray(job.context_manifest.acceptance_criteria) ? job.context_manifest.acceptance_criteria.join("\n") : "");
    setClientId(job.client_id ?? ""); setAgentIds(job.selected_agent_ids);
    setConcurrency(job.concurrency); setPolicy(job.model_policy); requestKey.current = null;
    setDraftOpen(true); document.getElementById("office-team-brief")?.focus();
  }
  function exportJob(job: OfficeTeamJob) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: "jarvis-office-team-job", job }, null, 2)], { type: "application/json" }));
    link.href = url; link.download = `jarvis-office-${job.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section id="office-live" className={styles.panel} aria-label="Saved team jobs">
    <div className={styles.head}><div><p className={styles.eyebrow}>Workstream / Server</p><h2>Saved team jobs</h2><p>Specialists work in parallel; the lead assembles a draft and a separate reviewer checks it.</p></div><button type="button" className={styles.primary} disabled={busy || catalog?.availability.mode === "unavailable"} onClick={() => { setDraftOpen(value => !value); if (draftOpen && window.location.hash === "#office-live") window.history.replaceState(null, "", window.location.pathname + window.location.search); }}>{draftOpen ? "Close brief" : "＋ New job"}</button></div>
    <div className={styles.availability}><span data-mode={catalog?.availability.mode ?? "unavailable"}>{catalog?.availability.mode === "fixture" ? "Local test" : catalog?.availability.mode === "codex_cli" ? "Local models ready" : catalog?.availability.mode === "anthropic" ? "Model execution ready" : "Unavailable"}</span><p>{catalog?.availability.reason ?? (catalog?.availability.mode === "anthropic" ? "Tasks send the brief and selected approved Client Brain facts to the configured Anthropic account." : "Checking execution setup…")}</p></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {draftOpen && <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>Assignment brief<textarea id="office-team-brief" required maxLength={2000} rows={4} value={brief} onChange={event => updateBrief(event.target.value)} placeholder="Describe the result, context and what a good draft should contain." /></label>
      <label className={styles.field}>Acceptance checks · one per line, up to five<textarea rows={3} maxLength={904} value={criteriaText} onChange={event => { setCriteriaText(event.target.value); requestKey.current = null; }} placeholder="Example: Every factual claim is supported by approved client context." /></label>
      <div className={styles.options}><label className={styles.field}>Scope<select value={clientId} onChange={event => { setClientId(event.target.value); requestKey.current = null; }}><option value="">Internal company work</option>{catalog?.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className={styles.field}>Model policy<select value={policy} onChange={event => { setPolicy(event.target.value as typeof policy); requestKey.current = null; }}>{Object.entries(MODEL_POLICIES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className={styles.field}>Parallel workers<select value={concurrency} onChange={event => { setConcurrency(Number(event.target.value)); requestKey.current = null; }}>{[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
      <fieldset className={styles.team}><legend>Specialists <span>{agentIds.length}/6 selected</span></legend><div className={styles.teamList}>{roster.departments.map(d => <div key={d.id}><h3>{d.name}</h3>{roster.agents.filter(a => a.departmentId === d.id).map(a => { const modelReady = ["active", "experimental"].includes(a.operationalStatus); const modelMode = catalog?.availability.mode === "anthropic" || catalog?.availability.mode === "codex_cli"; return <label key={a.id}><input type="checkbox" checked={agentIds.includes(a.id)} disabled={(modelMode && !modelReady) || (agentIds.length >= 6 && !agentIds.includes(a.id))} onChange={() => chooseAgent(a.id)} /><span>{a.name}<small>{a.role}{modelMode && !modelReady ? " · not enabled for model work" : ""}</small></span></label>; })}</div>)}</div></fieldset>
      <div className={styles.formFoot}><span>{catalog?.availability.mode === "fixture" ? "No provider calls in this isolated preview." : "One planner call, up to one per specialist, plus lead and QA. Draft only; no external action."}</span><button className={styles.primary} disabled={busy || !brief.trim() || !agentIds.length || catalog?.availability.mode === "unavailable"} type="submit">{busy ? "Starting…" : "Start team job ↗"}</button></div>
    </form>}
    {!catalog?.jobs.length && <div className={styles.empty}><h3>No saved team jobs yet</h3><p>Choose a brief and specialists to test the complete workflow.</p></div>}
    {!!catalog?.jobs.length && <div className={styles.jobLayout}><div className={styles.jobList}>{catalog.jobs.map(job => <button type="button" key={job.id} aria-pressed={current?.id === job.id} onClick={() => setSelectedId(job.id)}><span className={styles.jobBrief}>{job.brief}</span><small>{job.client_name ?? "Internal"} · {job.steps.filter(s => s.status === "completed").length}/{job.steps.length} outputs</small><b data-status={job.status}>{statusLabel(job)}</b></button>)}</div>{current && <div className={styles.detail}>
      <div className={styles.detailHead}><h3>{current.brief}</h3><span data-status={current.status}>{statusLabel(current)}</span></div>
      <div className={styles.meta}><span>{current.client_name ?? "Internal"}</span><span>{current.execution_mode === "fixture" ? "Local fixture" : current.execution_mode === "codex_cli" ? `Local Codex · ${MODEL_POLICIES[current.model_policy]}` : MODEL_POLICIES[current.model_policy]}</span><span>{current.provider_calls} recorded provider calls</span><span>{current.input_tokens + current.output_tokens} tokens</span>{trace?.planner?.model && <span>Plan {trace.planner.model}</span>}{trace?.lead?.model && <span>Lead {trace.lead.model}</span>}{trace?.checker?.model && <span>QA {trace.checker.model}</span>}</div>
      {current.client_id && <details><summary>Approved client context · {Array.isArray(current.context_manifest.source_ids) ? current.context_manifest.source_ids.length : 0} sources</summary><pre>{String(current.context_manifest.excerpt ?? "No approved current Brain facts found.")}</pre></details>}
      {Array.isArray(current.context_manifest.acceptance_criteria) && current.context_manifest.acceptance_criteria.length > 0 && <details open><summary>Saved acceptance checks · {current.context_manifest.acceptance_criteria.length}</summary><ol>{current.context_manifest.acceptance_criteria.map((criterion, index) => <li key={index}>{String(criterion)}</li>)}</ol></details>}
      {current.status === "recovery_required" && <p className={styles.warning}>{current.steps.every(step => step.status === "queued") ? "Dispatch did not start or its outcome is unknown. Check the Workflow before starting a new attempt." : "Execution outcome is uncertain. Inspect provider usage and saved outputs before starting a new attempt."}</p>}
      {current.error_message && <p className={styles.warning}>{current.error_message}</p>}
      <ol className={styles.steps}>{current.steps.map(step => <li key={step.id}><div><strong>{step.agent_name}</strong><span data-status={step.status}>{step.status}</span></div><p>{step.assignment}</p>{step.error_message && <p className={styles.warning}>{step.error_message}</p>}{step.output && <details><summary>Read output · {step.model_id ?? "unknown model"}</summary><pre>{step.output}</pre></details>}</li>)}</ol>
      {current.synthesis && <details open={current.status === "needs_review"}><summary>Team draft</summary><pre>{current.synthesis}</pre></details>}
      {Boolean(current.context_manifest.qa) && <div className={styles.qa}><strong>{current.execution_mode === "fixture" ? "Local completeness check" : "Independent QA"}</strong><p>{(current.context_manifest.qa as { pass: boolean }).pass ? current.execution_mode === "fixture" ? "Every step saved an output. No factual or creative quality was assessed." : "No issue found in the bounded check. Review the draft before use." : "Issues found; this job cannot be marked reviewed."}</p>{((current.context_manifest.qa as { checks?: { index: number; pass: boolean | null; evidence: string }[] }).checks ?? []).map(check => <p key={check.index}><strong>Check {check.index}: {check.pass === null ? "Not assessed" : check.pass ? "Passed" : "Failed"}.</strong> {check.evidence}</p>)}{((current.context_manifest.qa as { issues?: string[] }).issues ?? []).map((issue,i) => <p key={i}>{issue}</p>)}</div>}
      {current.status === "needs_review" && <div className={styles.review}><label className={styles.field}>Review note<textarea rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Record any edits or caveats." /></label><button className={styles.primary} disabled={busy} onClick={() => review(current)}>{current.execution_mode === "fixture" ? "Mark test inspected" : "Mark reviewed"}</button></div>}
      {current.review_note && <p className={styles.reviewedNote}>Review note: {current.review_note}</p>}
      <div className={styles.actions}><button onClick={() => exportJob(current)}>Export record ↓</button>{["queued", "running"].includes(current.status) && <button disabled={busy} onClick={() => cancel(current)}>Stop job</button>}{!["queued", "running", "cancel_requested"].includes(current.status) && <button disabled={busy} onClick={() => retry(current)}>Revise / new attempt ↗</button>}</div>
    </div>}</div>}
  </section>;
}
