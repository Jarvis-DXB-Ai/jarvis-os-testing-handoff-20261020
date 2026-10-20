"use client"

import { useMemo, useState, type CSSProperties } from "react"
import Link from "next/link"
import styles from "./system-operations-workspace.module.css"

type Operation = { title: string; description: string; href: string; kind: "Live" | "Read-only" }
type Group = { title: string; description: string; colour: string; items: Operation[] }

export const OPERATION_GROUPS: Group[] = [
  { title: "Execution", colour: "#4ADE80", description: "Queues, run surfaces, command logs and task-level production controls.", items: [
    { title: "Queue", href: "/queue", kind: "Live", description: "Execution queue for pending and running operational work." },
    { title: "Sandbox", href: "/sandbox", kind: "Live", description: "Test runs and experimental execution spaces. AI execution remains policy controlled." },
    { title: "Executions", href: "/executions", kind: "Read-only", description: "Execution run history and output inspection." },
    { title: "Commands", href: "/commands", kind: "Read-only", description: "Operator command log and command planning records." },
    { title: "Tasks", href: "/tasks", kind: "Live", description: "Structured work items for agents and operators." },
  ] },
  { title: "Workflow", colour: "#F0B24A", description: "Campaign cycles, deliverable workspaces and production workflow views.", items: [
    { title: "Workflow", href: "/workflow", kind: "Read-only", description: "Workflow overview and linked workflow records." },
    { title: "Cycles", href: "/cycles", kind: "Read-only", description: "Monthly cycle planning and production cadence." },
    { title: "Deliverables", href: "/workspaces/social-media", kind: "Live", description: "Social media deliverable workspace." },
  ] },
  { title: "Intelligence", colour: "#5B9DF0", description: "Review, learning, research and playbook maintenance.", items: [
    { title: "Audit reviews", href: "/audit-reviews", kind: "Live", description: "Review audit findings before promoting them into memory." },
    { title: "Playbooks", href: "/playbooks", kind: "Read-only", description: "Brand playbooks and reusable platform rules." },
    { title: "Learning", href: "/learning", kind: "Read-only", description: "Learning events, lessons and improvement records." },
    { title: "Research", href: "/research", kind: "Read-only", description: "Research library and intelligence sources." },
  ] },
]

export function SystemOperationsWorkspace() {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => OPERATION_GROUPS.map(group => ({ ...group, items: group.items.filter(item => `${item.title} ${item.href} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter(group => group.items.length), [query])
  return <main className={styles.shell}><div className={styles.canvas}><header className={styles.header}><div><p className={styles.eyebrow}>Build</p><h1 className={styles.heading}>System operations</h1><p className={styles.intro}>Twelve internal surfaces kept out of the primary navigation. This is a directory, not a dashboard: it tells you where a surface lives, not what is inside it.</p></div><Link href="/system" className={styles.health}><i />System health</Link></header><aside className={styles.notice}><span aria-hidden="true">ⓘ</span><p><strong>Available means the route exists.</strong> It does not mean the surface has data or that anything is running behind it. Read-only routes are inspection views, not execution controls.</p></aside><label className="sr-only" htmlFor="operation-search">Search surfaces and routes</label><input id="operation-search" value={query} onChange={event => setQuery(event.target.value)} className={styles.search} placeholder="Search surfaces and routes" /><section className={styles.groups}>{groups.map(group => <div key={group.title}><header className={styles.groupHead} style={{ "--group": group.colour } as CSSProperties}><i /><h2>{group.title}</h2><p>{group.description}</p><span>{group.items.length} {group.items.length === 1 ? "surface" : "surfaces"}</span></header><div className={styles.list}>{group.items.map(item => <Link key={item.href} href={item.href} className={styles.row}><span className={styles.rowCopy}><strong>{item.title}</strong><span className={styles.route}>{item.href}</span></span><span className={styles.description}>{item.description}</span><span className={`${styles.kind} ${item.kind === "Live" ? styles.live : ""}`}>{item.kind}</span><span aria-hidden="true" className={styles.route}>›</span></Link>)}</div></div>)}</section>{!groups.length ? <div className={styles.empty}>No surface matches that search.</div> : null}<section className={styles.fence}><h2>Not on this page</h2><div className={styles.fenceBody}><p><strong>Client workspaces.</strong> Reached through Clients, never from here.</p><p><strong>Agent runtime state.</strong> Agents owns that, including failed runs.</p><p><strong>Spend.</strong> Finance and the Models registry, not a system page.</p></div></section></div></main>
}
