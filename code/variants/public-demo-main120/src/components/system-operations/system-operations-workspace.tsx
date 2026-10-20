"use client"

import { useMemo, useState, type CSSProperties } from "react"
import Link from "next/link"
import styles from "./system-operations-workspace.module.css"

type Operation = { title: string; description: string; href: string; purpose: string; writes?: boolean }
type Group = { title: string; description: string; colour: string; items: Operation[] }

export const OPERATION_GROUPS: Group[] = [
  { title: "Design", colour: "var(--j-text-3)", description: "Shared visual language and implementation references.", items: [
    { title: "Design system", href: "/design-system", purpose: "Reference", writes: false, description: "Live tokens, typography, reusable components and source differences." },
  ] },
  { title: "Execution", colour: "var(--j-text-3)", description: "Queues, run surfaces, command logs and task-level production controls.", items: [
    { title: "Queue", href: "/queue", purpose: "Operational control", writes: true, description: "Execution queue for pending and running operational work." },
    { title: "Sandbox", href: "/sandbox", purpose: "Operational control", writes: true, description: "Test runs and experimental execution spaces. AI execution remains policy controlled." },
    { title: "Execution reviews", href: "/reviews", purpose: "Historical record", writes: true, description: "Execution review records and detail." },
    { title: "Executions", href: "/executions", purpose: "Historical record", writes: true, description: "Execution run history and output inspection." },
    { title: "Commands", href: "/commands", purpose: "Operator diagnostic", writes: true, description: "Operator command log and command planning records." },
    { title: "Tasks", href: "/tasks", purpose: "Operational control", writes: true, description: "Structured work items for agents and operators." },
  ] },
  { title: "Workflow", colour: "var(--j-text-3)", description: "Campaign cycles, deliverable workspaces and production workflow views.", items: [
    { title: "Workflow", href: "/workflow", purpose: "Diagnostic", writes: false, description: "Workflow overview and linked workflow records." },
    { title: "Cycles", href: "/cycles", purpose: "Planning", writes: true, description: "Monthly cycle planning and production cadence." },
    { title: "Deliverables", href: "/workspaces/social-media", purpose: "Production", writes: true, description: "Social media deliverable workspace." },
  ] },
  { title: "Intelligence", colour: "var(--j-text-3)", description: "Review, learning, research and playbook maintenance.", items: [
    { title: "Audit reviews", href: "/audit-reviews", purpose: "Review", writes: true, description: "Review audit findings before promoting them into memory." },
    { title: "Playbooks", href: "/playbooks", purpose: "Maintenance", writes: true, description: "Brand playbooks and reusable platform rules." },
    { title: "Learning", href: "/learning", purpose: "Maintenance", writes: true, description: "Learning events, lessons and improvement records." },
    { title: "Research", href: "/research", purpose: "Reference", writes: true, description: "Research library and intelligence sources." },
  ] },
]

export function SystemOperationsWorkspace() {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => OPERATION_GROUPS.map(group => ({ ...group, items: group.items.filter(item => `${item.title} ${item.href} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter(group => group.items.length), [query])
  return <main className={styles.shell}><div className={styles.canvas}><header className={styles.header}><div><p className={styles.eyebrow}>Build</p><h1 className={styles.heading}>System operations</h1><p className={styles.intro}>{OPERATION_GROUPS.reduce((total, group) => total + group.items.length, 0)} workspaces for execution, planning and system maintenance.</p></div><Link href="/system" className={styles.health}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>System health</Link></header><aside className={styles.notice}><p><strong>Choose a workspace to continue.</strong> Labels describe each workspace’s purpose. “Writes records” means it includes controls that can change saved records; it does not confirm that an execution is running.</p></aside><label className="sr-only" htmlFor="operation-search">Search surfaces and routes</label><input id="operation-search" type="search" value={query} onChange={event => setQuery(event.target.value)} className={styles.search} placeholder="Search surfaces and routes" /><p className={styles.result} role="status">{groups.reduce((total, group) => total + group.items.length, 0)} of {OPERATION_GROUPS.reduce((total, group) => total + group.items.length, 0)} workspaces</p><section className={styles.groups}>{groups.map(group => <div key={group.title}><header className={styles.groupHead} style={{ "--group": group.colour } as CSSProperties}><i /><h2>{group.title}</h2><p>{group.description}</p><span>{group.items.length} {group.items.length === 1 ? "surface" : "surfaces"}</span></header><div className={styles.list}>{group.items.map(item => <Link key={item.href} href={item.href} className={styles.row}><span className={styles.rowCopy}><strong>{item.title}</strong><span className={styles.route}>{item.href}</span></span><span className={styles.description}>{item.description}</span><span className={styles.kind}>{item.purpose}{item.writes && <small className={styles.writes}>Writes records</small>}</span><span aria-hidden="true" className={styles.route}>›</span></Link>)}</div></div>)}</section>{!groups.length ? <div className={styles.empty}><h2>No workspaces found</h2><p>Try a different name or route.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div> : null}<section className={styles.fence}><h2>Not on this page</h2><div className={styles.fenceBody}><p><strong>Client workspaces.</strong> Reached through Clients, never from here.</p><p><strong>Agent runtime state.</strong> Agents owns that, including failed runs.</p><p><strong>Spend.</strong> Finance and the Models registry, not a system page.</p></div></section></div></main>
}
