"use client";

import { useEffect, useRef, useState } from "react";
import { keepDialogFocus } from "./agent-modal";
import blueprint from "@/lib/agent-company-blueprint.json";
import styles from "./agents-branding.module.css";

type Role = typeof blueprint.offices[number]["departments"][number]["roles"][number];
type Department = typeof blueprint.cooDepartment;
const allDepartments = [blueprint.cooDepartment, ...blueprint.offices.flatMap(office => office.departments)];
const roleCount = allDepartments.reduce((total, department) => total + department.roles.length, 0);

export function CompanyBlueprint() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("all");
  const [officeFilter, setOfficeFilter] = useState("all");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selected, setSelected] = useState<{ role: Role; department: string; office: string; boundary: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!selected || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [selected]);
  const matches = (role: Role, department: Department) =>
    (phase === "all" || role.phase === phase) && `${role.name} ${role.purpose} ${role.output} ${department.name}`.toLowerCase().includes(query.trim().toLowerCase());
  const visibleOffices = blueprint.offices.filter(office => officeFilter === "all" || office.id === officeFilter);
  const shownDepartments = [...(officeFilter === "all" || officeFilter === "coo" ? [blueprint.cooDepartment] : []), ...visibleOffices.flatMap(office => office.departments)];
  const visibleCount = shownDepartments.reduce((total, department) => total + department.roles.filter(role => matches(role, department)).length, 0);
  function departmentView(department: Department, office: string, boundary: string) {
    const roles = department.roles.filter(role => matches(role, department));
    if (!roles.length) return null;
    const expanded = !collapsed.includes(department.id);
    return <section key={department.id} className={styles.department}>
      <h4><button type="button" className={styles.departmentToggle} aria-expanded={expanded} aria-controls={`blueprint-${department.id}`} onClick={() => setCollapsed(current => current.includes(department.id) ? current.filter(id => id !== department.id) : [...current, department.id])}>
        <span>{department.name}<small>{roles.length} planned roles</small></span><span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button></h4>
      <div id={`blueprint-${department.id}`} hidden={!expanded}>
        <p className={styles.departmentPurpose}>{department.purpose}</p>
        <ul className={styles.reports}>{roles.map(role => <li key={role.id}>
          <button type="button" data-blueprint-role={role.id} className={styles.node} onClick={() => setSelected({ role, department: department.name, office, boundary })}>
            <span className={styles.nodeName}>{role.name}<span aria-hidden="true">↗</span></span>
            <span className={styles.nodePurpose}>{role.purpose}</span>
            <span className={styles.tags}><span className={styles.tag}>Planned</span><span className={styles.phase}>{role.phase === "Next" ? "Build first" : "Later"}</span></span>
          </button>
        </li>)}</ul>
      </div>
    </section>;
  }
  return <section className={styles.blueprint} aria-labelledby="blueprint-title">
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>01 · Company blueprint</p><h2 id="blueprint-title">Built around you.</h2></div><span className={styles.tag}>Future structure · v{blueprint.version}</span></div>
    <p className={styles.intro}>One owner. OpenClaw coordinating the company. Specialist agents with clear responsibilities. These are planned job descriptions; existing organisation records and actual runs are shown separately below.</p>
    <div className={styles.controls}>
      <label className={styles.search}><span className={styles.srOnly}>Search planned roles</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setCollapsed([]); }} placeholder="Find a role, output or department…" /></label>
      <label className={styles.selectLabel}>Office<select aria-label="Office" value={officeFilter} onChange={event => setOfficeFilter(event.target.value)}><option value="all">All offices</option><option value="coo">COO · Operations</option>{blueprint.offices.map(office => <option key={office.id} value={office.id}>{office.id.toUpperCase()}</option>)}</select></label>
      <label className={styles.selectLabel}>Sequence<select aria-label="Sequence" value={phase} onChange={event => setPhase(event.target.value)}><option value="all">All phases</option><option value="Next">Build first</option><option value="Later">Later</option></select></label>
      <button type="button" className={styles.secondary} onClick={() => setCollapsed(collapsed.length === allDepartments.length ? [] : allDepartments.map(department => department.id))}>{collapsed.length === allDepartments.length ? "Expand teams" : "Collapse teams"}</button>
    </div>
    <div className={styles.stage}>
      <div className={styles.stageMeta}><span>Reporting structure</span><span>{allDepartments.length} departments · {roleCount} specialist roles · 3 planned chiefs</span></div>
      <div className={styles.authority}><span className={styles.officeCode}>CEO · Human owner</span><h3>Calvin</h3><p>Direction, client relationships and final decisions.</p></div>
      <div className={styles.connector} aria-hidden="true" />
      <div className={styles.coo}><span className={styles.officeCode}>COO</span><h3>OpenClaw</h3><p>Your operating partner. Coordinates priorities, delegates work and escalates decisions to you.</p><span className={styles.tag}>Assigned in blueprint · execution verified separately</span></div>

      {!!visibleOffices.length && <><div className={styles.bus} aria-hidden="true" /><div className={styles.offices} data-single={visibleOffices.length === 1}>
        {visibleOffices.map(office => <section key={office.id} className={styles.office} aria-labelledby={`office-${office.id}`}>
          <header className={styles.chief}><span className={styles.officeCode}>{office.id.toUpperCase()}</span><span className={styles.tag}>Planned chief</span><h3 id={`office-${office.id}`}>{office.name}</h3><p>{office.purpose}</p><small>Reports to OpenClaw · COO</small></header>
          {office.departments.map(department => departmentView(department, office.id.toUpperCase(), office.boundary))}
        </section>)}
      </div></>}
      {(officeFilter === "all" || officeFilter === "coo") && <div className={styles.directTeam}><p className={styles.eyebrow}>Reports directly to OpenClaw</p>{departmentView(blueprint.cooDepartment, "COO · OpenClaw", "Calvin approves client messages, commitments and changes to scope. This planned role does not send messages or assign work automatically.")}</div>}
      <p className={styles.resultCount} role="status">{visibleCount ? `${visibleCount} specialist roles match. Select a role for its inputs, output and boundaries.` : "No planned roles match these filters."}</p>
      {!visibleCount && <button className={styles.secondary} onClick={() => { setQuery(""); setPhase("all"); setOfficeFilter("all"); }}>Clear filters</button>}
    </div>
    <p className={styles.footnote}>Build first is a proposed implementation sequence, not a promise that a role is ready. Several roles can share one workflow or model; this chart does not require a separate paid agent for each job.</p>
    <dialog ref={dialog} onKeyDown={keepDialogFocus} className={styles.dialog} aria-labelledby="planned-role-title" onCancel={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      {selected && <div className={styles.dialogBody}><button type="button" autoFocus className={styles.close} aria-label="Close planned role" onClick={() => setSelected(null)}>×</button><p className={styles.eyebrow}>{selected.office} · {selected.department}</p><h2 id="planned-role-title">{selected.role.name}</h2><div className={styles.tags}><span className={styles.tag}>Planned · not activated</span><span className={styles.phase}>{selected.role.phase === "Next" ? "Build first" : "Later"}</span></div><p>{selected.role.purpose}</p><dl><dt>Inputs</dt><dd>{selected.role.inputs}</dd><dt>Expected output</dt><dd>{selected.role.output}</dd><dt>Reports through</dt><dd>{selected.department} → {selected.office} → {selected.office.startsWith("COO") ? "Calvin" : "OpenClaw → Calvin"}</dd><dt>Decision boundaries</dt><dd>{selected.boundary}</dd><dt>Before activation</dt><dd>Define the skill, data access, evaluation examples and approval gates; test the workflow and link a real runtime definition.</dd></dl><p className={styles.footnote}>This describes a future role. It does not create a database agent, call a model or enable automation.</p></div>}
    </dialog>
  </section>;
}
