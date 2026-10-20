"use client";

import { useState, type CSSProperties } from "react";
import type { OfficeTeamJob } from "@/lib/office-team-server";
import type { OfficeAgent, OfficeRoster, OfficeTestRun } from "@/lib/office";
import { officeDepartmentRooms } from "@/lib/office";
import styles from "./office-spatial-floor.module.css";

const stations = [
  [12, 29], [25, 29], [38, 29], [51, 29],
  [12, 58], [25, 58], [38, 58], [51, 58],
];
const label = (state: string) => state === "idle" ? "Available" : state.replaceAll("_", " ");
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word[0] ?? "").join("").toUpperCase();
const short = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

function Architecture() {
  return <svg className={styles.architecture} viewBox="0 0 1200 670" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <pattern id="officeGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0v24" fill="none" stroke="#b3d8c3" strokeOpacity=".045" /></pattern>
      <pattern id="officeRug" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0" stroke="#c1e0c9" strokeOpacity=".055" /></pattern>
      <linearGradient id="officeFloor" x2="1" y2="1"><stop stopColor="#20332f" /><stop offset="1" stopColor="#142321" /></linearGradient>
      <linearGradient id="officeTable" x2="1" y2="1"><stop stopColor="#748175" /><stop offset="1" stopColor="#394e44" /></linearGradient>
      <linearGradient id="officeGlass"><stop stopColor="#c5eee3" stopOpacity=".46" /><stop offset=".5" stopColor="#a6d5c7" stopOpacity=".11" /><stop offset="1" stopColor="#c5eee3" stopOpacity=".4" /></linearGradient>
    </defs>
    <rect width="1200" height="670" fill="#0b1413" />
    <rect x="18" y="18" width="1164" height="630" rx="26" fill="url(#officeFloor)" stroke="#83aa98" strokeOpacity=".46" strokeWidth="2" />
    <rect x="34" y="34" width="1132" height="598" rx="16" fill="url(#officeGrid)" />
    <rect x="56" y="110" width="696" height="487" rx="20" fill="#223832" stroke="#9bbba9" strokeOpacity=".2" />
    <rect x="69" y="122" width="671" height="462" rx="14" fill="url(#officeRug)" />
    <rect x="782" y="110" width="354" height="276" rx="20" fill="#283b36" stroke="#b0d4c0" strokeOpacity=".3" />
    <rect x="782" y="409" width="354" height="188" rx="20" fill="#2a3931" stroke="#b0d4c0" strokeOpacity=".22" />
    <path d="M766 109v488M782 398h354" stroke="url(#officeGlass)" strokeWidth="8" />
    <path d="M765 337v44" stroke="#c5eee3" strokeWidth="2" strokeOpacity=".55" />
    <rect x="63" y="42" width="685" height="45" rx="8" fill="#0b1717" stroke="#8cc9ad" strokeOpacity=".28" />
    <path d="M88 70h130m20 0h74m20 0h184m20 0h70" stroke="#719d8c" strokeWidth="3" strokeLinecap="round" />
    <circle cx="86" cy="58" r="4" fill="#b5e6bd" /><circle cx="101" cy="58" r="4" fill="#5d8175" /><circle cx="116" cy="58" r="4" fill="#5d8175" />
    <rect x="795" y="42" width="340" height="45" rx="8" fill="#0b1717" stroke="#8cc9ad" strokeOpacity=".28" />
    <path d="M817 70h94m16 0h43m15 0h89" stroke="#719d8c" strokeWidth="3" strokeLinecap="round" />
    <rect x="840" y="164" width="230" height="132" rx="66" fill="url(#officeTable)" stroke="#b8c9b7" strokeOpacity=".38" strokeWidth="3" />
    <rect x="858" y="181" width="194" height="98" rx="50" fill="none" stroke="#d7e8d3" strokeOpacity=".12" />
    <path d="M955 182v97m-62-49h123" stroke="#d5e9d7" strokeOpacity=".12" />
    <rect x="878" y="137" width="48" height="16" rx="8" fill="#4a6559" /><rect x="981" y="137" width="48" height="16" rx="8" fill="#4a6559" />
    <rect x="878" y="307" width="48" height="16" rx="8" fill="#4a6559" /><rect x="981" y="307" width="48" height="16" rx="8" fill="#4a6559" />
    <rect x="803" y="204" width="17" height="47" rx="8" fill="#4a6559" /><rect x="1090" y="204" width="17" height="47" rx="8" fill="#4a6559" />
    <rect x="817" y="441" width="124" height="40" rx="14" fill="#718171" stroke="#b5d3bb" strokeOpacity=".38" />
    <rect x="817" y="484" width="124" height="17" rx="8" fill="#466354" />
    <rect x="986" y="441" width="124" height="40" rx="14" fill="#718171" stroke="#b5d3bb" strokeOpacity=".38" />
    <rect x="986" y="484" width="124" height="17" rx="8" fill="#466354" />
    <rect x="928" y="454" width="76" height="69" rx="13" fill="#345145" stroke="#a8cdb5" strokeOpacity=".38" />
    <rect x="939" y="465" width="54" height="47" rx="9" fill="#597961" />
    <circle cx="852" cy="545" r="24" fill="#334a3e" stroke="#91b99d" strokeOpacity=".5" /><circle cx="852" cy="545" r="10" fill="#79a580" />
    <circle cx="1080" cy="545" r="24" fill="#334a3e" stroke="#91b99d" strokeOpacity=".5" /><circle cx="1080" cy="545" r="10" fill="#79a580" />
    <path d="M72 332h674m-674 129h674" stroke="#a3ceb7" strokeOpacity=".1" strokeWidth="2" strokeDasharray="7 9" />
    <path d="M66 610h362m97 0h218m44 0h345" stroke="#b3dfc1" strokeOpacity=".2" strokeWidth="2" />
  </svg>;
}

export function OfficeSpatialFloor({ roster, department, selected, activeRun, agentStates, jobs, view, onSelect }: {
  roster: OfficeRoster; department: string; selected: OfficeAgent | null; activeRun: OfficeTestRun | null;
  agentStates: Record<string, string>; jobs?: OfficeTeamJob[]; view: "floor" | "directory"; onSelect: (id: string) => void;
}) {
  const [wing, setWing] = useState(0);
  const [motionPreview, setMotionPreview] = useState(false);
  const [room, setRoom] = useState<"meeting" | "review" | null>(null);
  const agents = roster.agents.filter(agent => department === "all" || agent.departmentId === department);
  const rooms = officeDepartmentRooms(roster, department, stations.length);
  const pages = Math.max(1, rooms.length);
  const selectedRoom = rooms.findIndex(item => item.agents.some(agent => agent.id === selected?.id));
  const page = selectedRoom >= 0 ? selectedRoom : Math.min(wing, pages - 1);
  const visible = rooms[page]?.agents ?? [];
  const roomName = rooms[page]?.name ?? "No department assigned";
  const currentJob = jobs?.find(job => job.status === "running") ?? jobs?.find(job => job.status === "needs_review") ?? jobs?.[0];
  const brief = activeRun?.brief ?? currentJob?.brief;
  const jobStatus = activeRun?.status ?? currentJob?.status;
  const done = activeRun?.steps.filter(step => step.status === "completed").length ?? currentJob?.steps.filter(step => step.status === "completed").length ?? 0;
  const total = activeRun?.steps.length ?? currentJob?.steps.length ?? 0;
  const stateFor = (agent: OfficeAgent) => activeRun?.steps.find(step => step.agentId === agent.id)?.status ?? agentStates[agent.id] ?? (agent.operationalStatus === "blueprint" || agent.operationalStatus === "planned" ? "planned" : "unknown");
  const walkers = motionPreview ? visible.slice(0, 2) : visible.filter(agent => stateFor(agent) === "running").slice(0, 2);
  const moving = walkers.length > 0;
  const assignmentFor = (agent: OfficeAgent) => activeRun?.steps.find(step => step.agentId === agent.id)?.assignment ?? jobs?.flatMap(job => job.steps).find(step => step.agent_id === agent.id)?.assignment ?? agent.purpose;

  if (view === "directory") return <div className={styles.directory}><div className={styles.directoryHead}><span>AGENT DIRECTORY</span><strong>{agents.length} roles</strong></div>{agents.map(agent => {
    const color = roster.departments.find(item => item.id === agent.departmentId)?.color ?? "#b5d9c1";
    const state = stateFor(agent);
    return <button key={agent.id} type="button" className={styles.directoryAgent} aria-pressed={selected?.id === agent.id} onClick={() => onSelect(agent.id)}><span className={styles.avatarSmall} style={{ "--agent-color": color } as CSSProperties}>{initials(agent.name)}</span><span><strong>{agent.name}</strong><small>{agent.role}</small></span><em data-state={state}>{label(state)}</em></button>;
  })}{!agents.length && <p className={styles.empty}>No roles in this department.</p>}</div>;

  return <div className={styles.shell}>
    <div className={styles.toolbar}><div className={styles.location}><i /> LEVEL 01 <span>/</span> {short(roomName, 30).toUpperCase()}</div><button type="button" onClick={() => setMotionPreview(value => !value)} aria-pressed={motionPreview}>{motionPreview ? "◼ Pause visual tour" : "▷ Preview movement"}</button></div>
    <div className={styles.scroller}><div className={styles.scene}>
      <Architecture />
      <div className={styles.studioLabel}>01 / <strong>{short(roomName, 28).toUpperCase()}</strong><span>{visible.length} specialists in this department room</span></div>
      <div className={styles.operations} role="status"><div className={styles.operationsTop}><i /> LIVE WORK <span>{jobs ? "RECORDED" : "TEST"}</span></div><strong>{brief ? short(brief, 75) : "Awaiting the next brief"}</strong><div className={styles.operationsFoot}><span>{jobStatus ? label(jobStatus).toUpperCase() : "NO ACTIVE ASSIGNMENT"}</span><span>{total ? `${done}/${total} OUTPUTS` : "READY"}</span></div></div>
      <button type="button" className={`${styles.room} ${styles.meeting}`} aria-pressed={room === "meeting"} onClick={() => setRoom(value => value === "meeting" ? null : "meeting")}><span>02 / MEETING ROOM</span><strong>Strategy table</strong><small>Plans &amp; collaboration ↗</small></button>
      <button type="button" className={`${styles.room} ${styles.review}`} aria-pressed={room === "review"} onClick={() => setRoom(value => value === "review" ? null : "review")}><span>03 / REVIEW LOUNGE</span><strong>Decision space</strong><small>{jobStatus === "needs_review" || jobStatus === "waiting_for_review" ? "Draft awaiting review" : "Owner approvals"} ↗</small></button>
      {visible.map((agent, index) => { const color = roster.departments.find(item => item.id === agent.departmentId)?.color ?? "#b5d9c1"; const state = stateFor(agent); return <button key={agent.id} type="button" className={styles.station} data-state={state} aria-pressed={selected?.id === agent.id} style={{ left: `${stations[index][0]}%`, top: `${stations[index][1]}%`, "--agent-color": color } as CSSProperties} onClick={() => onSelect(agent.id)} aria-label={`${agent.name}, ${label(state)}. ${assignmentFor(agent)}`}><span className={styles.desk}><span className={styles.monitor}><i /><i /><i /></span><span className={styles.keyboard} /><span className={styles.lamp} /></span><span className={styles.chair} /><span className={styles.person}>{initials(agent.name)}</span><strong>{short(agent.name, 16)}</strong><small><i />{label(state)}</small></button>; })}
      {walkers.map((agent, index) => <div key={`walk-${agent.id}`} className={`${styles.walker} ${index ? styles.walkerSecond : ""}`} style={{ "--agent-color": roster.departments.find(item => item.id === agent.departmentId)?.color ?? "#b5d9c1" } as CSSProperties} aria-hidden="true"><span>{initials(agent.name)}</span></div>)}
      <div className={styles.compass}>N <span>↑</span></div>
      <div className={styles.key}><span><i data-kind="working" />Working</span><span><i data-kind="available" />Available</span><span><i data-kind="review" />Review</span></div>
    </div></div>
    <div className={styles.footer}><span>{visible.length} roles in {roomName} <b>·</b> {motionPreview ? "Visual movement preview · work state unchanged" : moving ? "Motion reflects active work" : "No active work recorded in this room"}</span><div><button type="button" disabled={page === 0} aria-label="Previous department room" onClick={() => { setWing(page - 1); onSelect(rooms[page - 1].agents[0].id); }}>←</button><span>ROOM {page + 1} / {pages}</span><button type="button" disabled={page >= pages - 1} aria-label="Next department room" onClick={() => { setWing(page + 1); onSelect(rooms[page + 1].agents[0].id); }}>→</button></div></div>
    {room && <div className={styles.roomDetails}><div><span>{room === "meeting" ? "STRATEGY TABLE" : "DECISION SPACE"}</span><strong>{room === "meeting" ? "Briefs become coordinated assignments here." : "Completed drafts wait here for an owner decision."}</strong><p>{room === "meeting" ? "Create a team job below to assign specialists and set parallel work." : total ? `${done} of ${total} specialist outputs recorded. Open the saved job below for the draft and QA.` : "The review queue is clear. Saved job history remains below."}</p></div><button type="button" onClick={() => setRoom(null)} aria-label="Close room details">×</button></div>}
  </div>;
}
