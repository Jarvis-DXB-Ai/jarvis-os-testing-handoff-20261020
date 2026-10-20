"use client"
import { CompanyBlueprint } from "./company-blueprint"
import brand from "./agents-branding.module.css"
import { useState } from "react"
import Link from "next/link"
import { managerIssue, type OrganisationSnapshot, type OrganisationAgent } from "@/lib/organisation-structure"
import styles from "./organisation-structure.module.css"

const label = (value: string) => value.replaceAll("_", " ")
export function OrganisationStructure({ snapshot }: { snapshot: OrganisationSnapshot }) {
  const [department, setDepartment] = useState("all")
  const [status, setStatus] = useState("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [closed, setClosed] = useState<string[]>([])
  const visible = snapshot.agents.filter(agent => (department === "all" || agent.profile?.department_id === department) && (status === "all" || agent.profile?.operational_status === status))
  const selected = visible.find(row => row.id === selectedId) ?? visible[0]
  const statuses = [...new Set(snapshot.agents.flatMap(row => row.profile ? [row.profile.operational_status] : []))]
  const managerName = (agent: OrganisationAgent) => agent.profile?.manager_agent_id ? snapshot.agents.find(candidate => candidate.id === agent.profile?.manager_agent_id)?.agent_name ?? "Manager not found" : "Unassigned"
  const row = (agent: OrganisationAgent) => <button key={agent.id} type="button" className={styles.agent} aria-current={selected?.id === agent.id ? "true" : undefined} onClick={() => setSelectedId(agent.id)}><span><strong>{agent.agent_name}</strong><small>{agent.profile?.role_title || "Profile not recorded"}</small><small>Reports to: {managerName(agent)}</small>{managerIssue(agent, snapshot.agents) && <small className={styles.warning}>{managerIssue(agent, snapshot.agents)}</small>}</span><span className={styles.chip}>{agent.profile ? label(agent.profile.operational_status) : "Not recorded"}</span></button>
  const unassigned = visible.filter(agent => agent.profile && !agent.profile.manager_agent_id)
  const missingDepartment = visible.filter(agent => !snapshot.departments.some(dept => dept.id === agent.profile?.department_id))
  const fields = selected?.profile ? [
    ["Purpose", selected.profile.purpose], ["Responsibilities", selected.profile.responsibilities.join("\n")],
    ["Boundaries", selected.profile.boundaries.join("\n")], ["Required inputs", selected.profile.input_requirements.join("\n")],
    ["Expected outputs", selected.profile.output_responsibilities.join("\n")], ["Context access", selected.profile.context_access.join("\n")],
    ["Approval requirements", selected.profile.approval_requirements], ["Escalation path", selected.profile.escalation_path],
  ] : []
  return <main className={`${brand.root} ${styles.shell}`}>
    <header className={styles.header}><p className={styles.eyebrow}>Build · Calvin’s private workspace</p><h1>Organisation Structure</h1><p className={styles.muted}>How the AI roles are organised and report internally. Recorded status describes the role, not proof of a running agent.</p><Link href="/agents?view=runs">View agent runs →</Link></header>
    <CompanyBlueprint />
    <div className={styles.recordedHeading}><p className={styles.eyebrow}>02 · Recorded organisation</p><h2>Departments & reporting</h2><p className={styles.muted} role="status">{visible.length} of {snapshot.agents.length} recorded roles</p></div>
    <div className={styles.filters} role="group" aria-label="Filter by department"><button aria-pressed={department === "all"} onClick={() => setDepartment("all")}>All departments</button>{snapshot.departments.map(dept => <button key={dept.id} aria-pressed={department === dept.id} onClick={() => setDepartment(dept.id)}>{dept.name}</button>)}</div>
    <div className={styles.filters} role="group" aria-label="Filter by status"><button aria-pressed={status === "all"} onClick={() => setStatus("all")}>All statuses</button>{statuses.map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label(value)}</button>)}</div>
    {!snapshot.agents.length && <p className={styles.panel}>No agent roles recorded. Departments remain visible below.</p>}
    {!!snapshot.agents.length && !visible.length && <p className={styles.panel}>No roles match these filters.</p>}
    <div className={styles.layout}><section aria-label="Departments and reporting relationships">
      {!!unassigned.length && <div className={styles.panel}><h2 className={styles.eyebrow}>Unassigned — no manager recorded</h2>{unassigned.map(row)}</div>}
      {!!missingDepartment.length && <div className={styles.panel}><h2 className={styles.eyebrow}>Department or profile not recorded</h2>{missingDepartment.map(row)}</div>}
      {snapshot.departments.filter(dept => department === "all" || department === dept.id).map(dept => {
        const members = visible.filter(agent => agent.profile?.department_id === dept.id)
        const expanded = !closed.includes(dept.id)
        return <div key={dept.id} className={styles.department}><h2><button className={styles.departmentHead} aria-expanded={expanded} aria-controls={`department-${dept.id}`} onClick={() => setClosed(expanded ? [...closed, dept.id] : closed.filter(id => id !== dept.id))}><span aria-hidden="true">{expanded ? "⌄" : "›"}</span><span>{dept.name}<small>{dept.purpose || "Purpose not recorded"}{dept.is_future ? " · Planned" : ""}</small></span><small>{members.length} {members.length === 1 ? "role" : "roles"}</small></button></h2><div id={`department-${dept.id}`} hidden={!expanded}>{members.length ? members.map(row) : <p className={styles.muted}>No roles {status === "all" ? "recorded in this department" : "match this status"}.</p>}</div></div>
      })}
    </section><aside className={`${styles.panel} ${styles.detail}`} aria-label="Selected agent details">{selected ? <><h2>{selected.agent_name}</h2><p className={styles.muted}>{snapshot.departments.find(dept => dept.id === selected.profile?.department_id)?.name ?? "Department not recorded"}</p>{!selected.profile && <p>Profile not recorded.</p>}<dl>{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || "Not recorded"}</dd></div>)}<div><dt>Reports to</dt><dd>{managerName(selected)}</dd></div></dl>{managerIssue(selected, snapshot.agents) && <p className={styles.warning}>{managerIssue(selected, snapshot.agents)}</p>}<Link href="/agents">Open Agents editor →</Link></> : <p>Select an agent to inspect its role.</p>}</aside></div>
  </main>
}
