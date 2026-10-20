import type { CSSProperties } from "react";
import type { OfficeAgent, OfficeRoster, OfficeTestRun } from "@/lib/office";
import styles from "./office.module.css";

function Desk({ color, working, variant }: { color: string; working: boolean; variant: number }) {
  return <svg viewBox="0 0 120 100" aria-hidden="true" className={styles.deskArt}>
    <ellipse cx="61" cy="86" rx="43" ry="8" fill="#000" opacity=".14" />
    <path d="m18 51 50-25 37 20-50 27Z" fill="#52635c" /><path d="m18 51 37 22v6L18 57Z" fill="#31443b" /><path d="m55 73 50-27v6L55 79Z" fill="#3c5147" />
    <path d="M23 59v16m35 3v13m40-33v14" stroke="#293b31" strokeWidth="5" />
    <path d="m46 24 29 12v24L46 47Z" fill="#20392c" stroke="#627d6c" strokeWidth="1.5" />
    <path d="m49 29 22 9v16l-22-9Z" fill={working ? color : "#709585"} opacity={working ? ".9" : ".4"} />
    <path d="m52 34 12 5m-12-1 16 7m-16-3 9 4" stroke="#dff8e8" strokeWidth="1.5" opacity=".7" />
    <path d="m59 54 1 7-7 3m22-5 13-7 7 4-13 7Z" stroke="#859b8f" fill="#6c8376" />
    <path d="m27 71 12-7 14 8v14l-11 6-15-8Z" fill="#263c30" />
    <path d="M42 60c-10 0-15 9-15 16l24 10c4-8 2-20-9-26Z" fill={color} />
    <path d="m42 75 14-7" stroke={color} strokeWidth="7" strokeLinecap="round" />
    <ellipse cx="40" cy="55" rx="10" ry="12" fill={["#c59271", "#e0b08c", "#926952"][variant % 3]} />
    <path d="M30 55c-5-17 22-24 21-4l-7-5-14 9Z" fill={["#28362e", "#533c31", "#263f46"][variant % 3]} />
    <path d="m30 83 3 9m14-6 2 8" stroke="#233329" strokeWidth="5" strokeLinecap="round" />
    {working && <g className={styles.thinking}><circle cx="88" cy="23" r="3" fill={color} /><circle cx="98" cy="18" r="2" fill={color} /></g>}
  </svg>;
}
export function OfficeFloor({ roster, department, selected, activeRun, agentStates, view, onSelect }: {
  roster: OfficeRoster; department: string; selected: OfficeAgent | null; activeRun: OfficeTestRun | null;
  agentStates: Record<string, string>; view: "floor" | "directory"; onSelect: (id: string) => void;
}) {
  const departments = roster.departments.filter(d => department === "all" || department === d.id);
  return <div className={view === "floor" ? styles.floor : styles.directory}>
    {departments.map((d, index) => {
      const agents = roster.agents.filter(a => a.departmentId === d.id);
      return <section key={d.id} className={styles.room} style={{ "--room-accent": d.color } as CSSProperties} aria-label={d.name}>
        <div className={styles.roomHeader}><div><span className={styles.roomNumber}>{String(index + 1).padStart(2, "0")} /</span><h3>{d.name}</h3></div><span>{agents.length} {agents.length === 1 ? "desk" : "desks"}</span></div>
        <div className={styles.desks}>{agents.map((a, i) => {
          const step = activeRun?.steps.find(s => s.agentId === a.id);
          const state = step?.status ?? agentStates[a.id] ?? "idle";
          const working = ["running", "observing"].includes(state);
          return <button key={a.id} type="button" className={`${styles.desk} ${selected?.id === a.id ? styles.selectedDesk : ""} ${working ? styles.workingDesk : ""}`}
            aria-label={`${a.name}, ${state === "idle" ? a.readiness : state}`} aria-pressed={selected?.id === a.id} onClick={() => onSelect(a.id)}>
            {view === "floor" && <Desk color={d.color} working={working} variant={i + index} />}
            <strong>{a.name}</strong><span className={styles.deskStatus}><i data-state={state} />{state === "idle" ? a.readiness : state.replaceAll("_", " ")}</span>
          </button>;
        })}</div>
        {!agents.length && <p className={styles.muted}>No desks assigned.</p>}
      </section>;
    })}
    {!departments.length && <div className={styles.empty}><h3>No roster available</h3><p>Refresh the records or open the Test office to explore the Jarvis role blueprint.</p></div>}
  </div>;
}
