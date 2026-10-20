"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { agentRunStatusLabel, type AgentRunsSnapshot } from "@/lib/agent-runtime";
import { recordedOfficeStates, MODEL_POLICIES, type OfficeAgent, type OfficeRoster, type OfficeTestRun } from "@/lib/office";
import { OfficeSpatialFloor } from "./office-spatial-floor";
import { OfficeLivePanel } from "./office-live-panel";
import { OfficePaperclipPanel } from "./office-paperclip-panel";
import { OfficeStackPanel } from "./office-stack-panel";
import type { OfficeTeamJob } from "@/lib/office-team-server";
import styles from "./office.module.css";

export type OfficeDraft = { brief: string; agentIds: string[]; modelPolicy: OfficeTestRun["modelPolicy"]; concurrency: number; fail: boolean };
type Props = {
  mode: "recorded" | "test"; roster: OfficeRoster; selected: OfficeAgent | null; department: string;
  runtime: AgentRunsSnapshot | null; rosterAvailable: boolean; runs: OfficeTestRun[]; selectedRun: OfficeTestRun | null;
  running: boolean; refreshing: boolean; error: string | null;
  onMode: (mode: "recorded" | "test") => void; onDepartment: (id: string) => void; onSelect: (id: string) => void;
  onSelectRun: (id: string) => void; onRefresh: () => void; onStart: (draft: OfficeDraft) => void;
  onCancel: () => void; onApprove: (run: OfficeTestRun, note: string) => void; onExport: (run: OfficeTestRun) => void;
};
const testStatus: Record<OfficeTestRun["status"], string> = {
  running: "Working", waiting_for_review: "Needs review", approved: "Test reviewed", failed: "Needs attention", cancelled: "Cancelled", interrupted: "Interrupted",
};
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}
function Composer({ roster, assigned, initial, onClose, onStart }: { roster: OfficeRoster; assigned: string | null; initial?: OfficeDraft; onClose: () => void; onStart: (draft: OfficeDraft) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<OfficeDraft>(initial ?? {
    brief: "Plan a launch campaign: define the content pillars, draft the captions and prepare the visual brief.",
    agentIds: assigned ? [assigned] : ["brand-strategist", "copy", "image-prompts"].filter(id => roster.agents.some(a => a.id === id)),
    modelPolicy: "quality", concurrency: 3, fail: false,
  });
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); onStart(draft); onClose(); }
  function toggle(id: string) { setDraft(d => ({ ...d, agentIds: d.agentIds.includes(id) ? d.agentIds.filter(a => a !== id) : d.agentIds.length < 6 ? [...d.agentIds, id] : d.agentIds })); }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="office-composer-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={submit}>
      <div className={styles.dialogHead}><div><p className={styles.eyebrow}>Test office / New assignment</p><h2 id="office-composer-title">Give your team a brief.</h2></div><button className={styles.iconButton} type="button" aria-label="Close assignment" onClick={onClose}>×</button></div>
      <p className={styles.notice}>Workflow simulation. Specialists return test worksheets; no AI model or external tool is called.</p>
      <label className={styles.field}>The brief<textarea autoFocus required maxLength={2000} rows={3} value={draft.brief} onChange={e => setDraft(d => ({ ...d, brief: e.target.value }))} /></label>
      <div className={styles.formRow}>
        <label className={styles.field}>Test model policy<select value={draft.modelPolicy} onChange={e => setDraft(d => ({ ...d, modelPolicy: e.target.value as OfficeDraft["modelPolicy"] }))}>{Object.entries(MODEL_POLICIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><small>Recorded as a preference; models are not invoked.</small></label>
        <label className={styles.field}>Work in parallel<select value={draft.concurrency} onChange={e => setDraft(d => ({ ...d, concurrency: Number(e.target.value) }))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? "1 specialist at a time" : `Up to ${n} specialists`}</option>)}</select></label>
      </div>
      <fieldset className={styles.teamPicker}><legend>Choose specialists <span>{draft.agentIds.length} / 6</span></legend>
        <div className={styles.teamOptions}>{roster.departments.map(dept => <div key={dept.id}><h3>{dept.name}</h3>{roster.agents.filter(a => a.departmentId === dept.id).map(a => <label key={a.id}><input type="checkbox" checked={draft.agentIds.includes(a.id)} disabled={!draft.agentIds.includes(a.id) && draft.agentIds.length >= 6} onChange={() => toggle(a.id)} /><span>{a.name}</span></label>)}</div>)}</div>
      </fieldset>
      <label className={styles.failureToggle}><input type="checkbox" checked={draft.fail} onChange={e => setDraft(d => ({ ...d, fail: e.target.checked }))} /> Simulate one failed specialist to test recovery</label>
      <div className={styles.dialogFoot}><span>Saved in this browser tab · 0 provider calls</span><button className={styles.primary} disabled={!draft.brief.trim() || !draft.agentIds.length} type="submit">Start team test <span>↗</span></button></div>
    </form>
  </dialog>;
}
function TestResult({ run, running, onCancel, onApprove, onExport, onRetry }: { run: OfficeTestRun; running: boolean; onCancel: () => void; onApprove: (run: OfficeTestRun, note: string) => void; onExport: (run: OfficeTestRun) => void; onRetry: () => void }) {
  const [note, setNote] = useState("");
  return <section id="office-result" className={styles.result} aria-label="Selected test result">
    <div className={styles.resultHead}><div><p className={styles.eyebrow}>Assignment / Test result</p><h3>{run.brief}</h3></div><Badge tone={run.status === "failed" ? "amber" : "green"}>{testStatus[run.status]}</Badge></div>
    <div className={styles.resultMeta}><span>{MODEL_POLICIES[run.modelPolicy]}</span><span>Parallel limit {run.concurrency}</span><span>0 provider calls</span></div>
    <ol className={styles.steps}>{run.steps.map(step => <li key={step.id} data-state={step.status}><div><span className={styles.stepDot} /><strong>{step.agentName}</strong><Badge>{step.status}</Badge></div><p>{step.assignment}</p>{step.error && <p className={styles.failure}>{step.error}</p>}{step.output && <details><summary>Read test output</summary><pre>{step.output}</pre></details>}</li>)}</ol>
    {run.status === "interrupted" && <p className={styles.notice}>This test was interrupted before completion. Start a fresh attempt to continue; completed step outputs are preserved above.</p>}
    {run.status === "waiting_for_review" && <div className={styles.review}><p>All test specialists returned an output. Inspect the worksheets above before marking this workflow test reviewed.</p><label className={styles.field}>Review notes<textarea maxLength={2000} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="What should we adjust before connecting real models?" /></label><button className={styles.primary} onClick={() => onApprove(run, note)}>Mark test reviewed</button></div>}
    {run.reviewNote && <p className={styles.notice}>Review note: {run.reviewNote}</p>}
    <div className={styles.resultActions}><button className={styles.secondary} onClick={() => onExport(run)}>Export test result ↓</button>{run.status === "running" && running ? <button className={styles.secondary} onClick={onCancel}>Cancel test</button> : <button disabled={running} className={styles.secondary} onClick={onRetry}>New attempt</button>}</div>
  </section>;
}
export function OfficeView(props: Props) {
  const { mode, roster, selected, department, runtime, runs, selectedRun } = props;
  const [view, setView] = useState<"floor" | "directory">("floor");
  const [composer, setComposer] = useState<{ assigned: string | null; initial?: OfficeDraft } | null>(null);
  const [recordedRunId, setRecordedRunId] = useState<string | null>(null);
  const [liveJobs, setLiveJobs] = useState<OfficeTeamJob[] | null>(null);
  const isTest = mode === "test";
  const activeRun = runs.find(r => r.status === "running") ?? null;
  const recordedRun = runtime?.runs.find(r => r.id === recordedRunId) ?? null;
  const agentStates = recordedOfficeStates(runtime);
  for (const job of [...(liveJobs ?? [])].reverse()) {
    for (const step of job.steps) if (!agentStates[step.agent_id] || job.status === "running") agentStates[step.agent_id] = step.status;
  }
  const selectedWork = selected && (isTest
    ? selectedRun?.steps.find(step => step.agentId === selected.id)
    : liveJobs?.flatMap(job => job.steps.map(step => ({ ...step, jobStatus: job.status, jobBrief: job.brief }))).find(step => step.agent_id === selected.id));
  const working = isTest ? activeRun?.steps.filter(s => s.status === "running").length ?? 0 : (runtime || liveJobs) ? (runtime?.runs.filter(r => ["running", "observing"].includes(r.status)).length ?? 0) + (liveJobs ?? []).reduce((count, job) => count + job.steps.filter(s => s.status === "running").length, 0) : undefined;
  const waiting = isTest ? runs.filter(r => r.status === "waiting_for_review").length : (runtime || liveJobs) ? (runtime?.runs.filter(r => r.status === "waiting_for_approval").length ?? 0) + (liveJobs ?? []).filter(j => j.status === "needs_review").length : undefined;
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Jarvis OS / Workspace</p><h1>Office<span className={styles.headerDot} /></h1><p>Your specialists. One shared workspace.</p></div><div className={styles.headerActions}><Link className={styles.textLink} href="/agents">Manage agents ↗</Link>{isTest ? <button className={styles.primary} onClick={() => setComposer({ assigned: null })} disabled={props.running}>＋ New team test</button> : <a className={styles.primary} href="#office-live">＋ New team job</a>}</div></header>
    <div className={styles.controlBar}><div className={styles.segment} aria-label="Office data source"><button aria-pressed={!isTest} onClick={() => props.onMode("recorded")}>Your office</button><button aria-pressed={isTest} onClick={() => props.onMode("test")}>Test office</button></div><div className={styles.facts}><span><i />{working ?? "—"} working</span><span>{waiting ?? "—"} awaiting review</span><span>{isTest ? `${roster.agents.length} blueprint roles` : props.rosterAvailable ? `${roster.agents.length} registered agents` : "Roster unavailable"}</span></div></div>
    {isTest ? <div className={styles.modeNotice}><Badge tone="amber">Test workspace</Badge><p>Explore the Jarvis role blueprint and run simulated team assignments. Results stay in this tab. No real client work or model calls.</p></div> : <div className={styles.modeNotice}><Badge tone="green">Recorded activity</Badge><p>Agent records and the latest runtime snapshot. A desk or configured role does not establish an active executor.</p><button className={styles.textButton} disabled={props.refreshing} onClick={props.onRefresh}>{props.refreshing ? "Refreshing…" : "Refresh ↻"}</button></div>}
    {props.error && <p role="alert" className={styles.error}>{props.error}</p>}
    {!isTest && !props.rosterAvailable && !props.error && <p className={styles.error}>Agent roster unavailable. Refresh to reconnect; saved team jobs below may still be accessible.</p>}
    {!isTest && props.rosterAvailable && !runtime && !props.error && <p className={styles.error}>The older Agent Runtime ledger is unavailable in this environment. Saved Office jobs below still work.</p>}
    {isTest && selectedRun && <div className={styles.activeStrip} role="status"><span><strong>{testStatus[selectedRun.status]}</strong> · {selectedRun.steps.filter(s => s.status === "completed").length}/{selectedRun.steps.length} specialist outputs</span><a href="#office-result">View test result ↓</a></div>}
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <section className={styles.officeCanvas} aria-label="Office floor">
          <div className={styles.floorToolbar}><div><span className={styles.eyebrow}>The workspace</span><h2>{department === "all" ? "Everyone has a place." : roster.departments.find(d => d.id === department)?.name}</h2></div><div className={styles.floorControls}><label className={styles.srOnly} htmlFor="office-department">Department</label><select id="office-department" value={department} onChange={e => props.onDepartment(e.target.value)}><option value="all">All departments</option>{roster.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><div className={styles.segment} aria-label="Office layout"><button aria-pressed={view === "floor"} onClick={() => setView("floor")}>Floor</button><button aria-pressed={view === "directory"} onClick={() => setView("directory")}>List</button></div></div></div>
          <div className={styles.hub}><span className={styles.hubMark}>J</span><div><strong>JARVIS</strong><span>{isTest ? "Test coordination space" : "Company coordination space"}</span></div><div className={styles.hubLine} /><span className={styles.hubNote}>Brief → Specialists → Review</span></div>
          <OfficeSpatialFloor key={`${mode}:${department}`} roster={roster} department={department} selected={selected} activeRun={isTest ? activeRun ?? selectedRun : null} agentStates={isTest ? {} : agentStates} jobs={isTest ? undefined : liveJobs ?? []} view={view} onSelect={props.onSelect} />
          <div className={styles.floorFoot}><span>Click a desk or room to explore · scroll the floor on smaller screens</span><span>{isTest ? "Visual test workspace" : `Snapshot ${runtime?.generatedAt ? new Date(runtime.generatedAt).toISOString().slice(11, 19) + " UTC" : "unavailable"}`}</span></div>
        </section>
        {!isTest && <OfficePaperclipPanel />}
        {!isTest && <OfficeStackPanel />}
        {!isTest && <OfficeLivePanel roster={roster} onJobsChange={setLiveJobs} />}
        <section className={styles.activity} aria-label="Office assignments"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Workstream</p><h2>{isTest ? "Team test history" : "Recorded runs"}</h2></div><span>{isTest ? "Latest 20 · this tab" : "Latest runtime records"}</span></div>
          {isTest ? runs.length ? <div className={styles.runList}>{runs.map(run => <button key={run.id} aria-pressed={selectedRun?.id === run.id} onClick={() => props.onSelectRun(run.id)}><span className={styles.runGlyph}>↗</span><span><strong>{run.brief}</strong><small>{run.steps.length} specialists · {run.steps.filter(s => s.status === "completed").length}/{run.steps.length} outputs</small></span><Badge tone={run.status === "failed" ? "amber" : "neutral"}>{testStatus[run.status]}</Badge></button>)}</div> : <div className={styles.empty}><span className={styles.emptyGlyph}>↗</span><h3>A brief becomes a team effort.</h3><p>Start with three specialists working on strategy, copy and a visual brief. Watch their progress, then review the test results.</p><button className={styles.secondary} onClick={() => setComposer({ assigned: null })}>Try a team assignment</button></div>
          : runtime?.runs.length ? <div className={styles.runList}>{runtime.runs.slice(0, 20).map(run => <button key={run.id} aria-pressed={recordedRunId === run.id} onClick={() => setRecordedRunId(run.id)}><span className={styles.runGlyph}>↗</span><span><strong>{run.goal}</strong><small>{run.definition?.display_name ?? "Unknown agent"} · {run.clientName ?? "Internal"}</small></span><Badge>{agentRunStatusLabel(run.status)}</Badge></button>)}</div> : <div className={styles.empty}><h3>{runtime ? "No recorded runs yet" : "Runtime records unavailable"}</h3><p>{runtime ? "Real activity appears here when the existing Jarvis runtime records work." : "Refresh to reconnect. Missing data is not evidence that the office is idle."}</p><Link className={styles.textLink} href="/agents?view=runs">Open runtime controls ↗</Link></div>}
        </section>
        {isTest && selectedRun && <TestResult key={selectedRun.id} run={selectedRun} running={props.running} onCancel={props.onCancel} onApprove={props.onApprove} onExport={props.onExport} onRetry={() => setComposer({ assigned: null, initial: { brief: selectedRun.brief, agentIds: selectedRun.steps.map(s => s.agentId), modelPolicy: selectedRun.modelPolicy, concurrency: selectedRun.concurrency, fail: false } })} />}
        {!isTest && recordedRun && <section className={styles.result}><div className={styles.sectionHead}><h3>{recordedRun.definition?.display_name ?? "Recorded run"}</h3><button className={styles.iconButton} aria-label="Close run details" onClick={() => setRecordedRunId(null)}>×</button></div><p>{recordedRun.goal}</p><Badge>{agentRunStatusLabel(recordedRun.status)}</Badge><p className={styles.muted}>{recordedRun.modelCallCount} recorded model calls · {recordedRun.steps.length} steps</p>{recordedRun.steps.map(s => <div key={s.id} className={styles.recordedStep}><strong>{s.action_key}</strong><span>{s.status}</span>{s.diagnostic && <p>{s.diagnostic}</p>}</div>)}<details><summary>Recorded output summary</summary><pre>{JSON.stringify(recordedRun.output_summary, null, 2)}</pre></details><Link className={styles.textLink} href="/agents?view=runs">Manage this run in Runtime ↗</Link></section>}
      </div>
      <aside className={styles.inspector} aria-label="Selected specialist">{selected ? <><div className={styles.inspectorTop}><p className={styles.eyebrow}>At this desk</p><span className={styles.portrait} style={{ backgroundColor: roster.departments.find(d => d.id === selected.departmentId)?.color }}>{selected.name.split(" ").slice(0, 2).map(n => n[0]).join("")}</span><h2>{selected.name}</h2><p>{roster.departments.find(d => d.id === selected.departmentId)?.name}</p><Badge>{selected.readiness}</Badge></div><div className={styles.inspectorBody}><p className={styles.purpose}>{selected.purpose}</p><dl className={styles.agentFacts}><div><dt>Model</dt><dd>{isTest ? "Simulated · no model calls" : selected.model ?? "Not configured"}</dd></div><div><dt>Runtime</dt><dd>{isTest ? "Test runner" : selected.runtimeKey ?? "No runtime definition"}</dd></div></dl>{selectedWork && <div className={styles.assignmentScreen}><span>WORK SCREEN · {selectedWork.status.replaceAll("_", " ")}</span><strong>{selectedWork.assignment}</strong><small>{isTest ? "Test assignment" : "Saved job assignment"}</small></div>}{[{ name: "Expected output", items: selected.outputs }, { name: "Required context", items: selected.inputs }, { name: "Connected tools", items: selected.tools }, { name: "Skills", items: selected.skills }, { name: "Boundaries", items: selected.boundaries }].map(group => <details key={group.name} open={group.name === "Expected output"}><summary>{group.name}<span>{group.items.length}</span></summary>{group.items.length ? <ul>{group.items.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p className={styles.muted}>None recorded.</p>}</details>)}{selected.approval && <div className={styles.approval}><span>Approval requirements</span><p>{selected.approval}</p></div>}{isTest ? <button className={styles.primary} disabled={props.running} onClick={() => setComposer({ assigned: selected.id })}>Assign a test ↗</button> : <Link className={styles.secondary} href="/agents?view=runs">Open runtime controls ↗</Link>}</div></> : <div className={styles.empty}><h3>Select a desk</h3><p>Role details and recorded tool connections appear here.</p></div>}</aside>
    </div>
    {composer && isTest && <Composer roster={roster} assigned={composer.assigned} initial={composer.initial} onClose={() => setComposer(null)} onStart={props.onStart} />}
  </main>;
}
