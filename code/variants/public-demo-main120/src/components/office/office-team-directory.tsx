"use client";
import plan from '@/lib/office-stack-plan.json';
import {allOfficeDepartments} from '@/lib/office-departments';
import type {PaperclipOfficeSnapshot} from '@/lib/office-paperclip';
import styles from './office-command.module.css';
import directory from './office-team-directory.module.css';

export function OfficeTeamDirectory({snapshot,onInspect}:{snapshot:PaperclipOfficeSnapshot|null;onInspect:(id:string)=>void}) {
  const definitions=[...plan.executives,...plan.roles];
  const active=definitions.filter(r=>r.rosterStatus==='active');
  const live=snapshot?.status==='connected';
  function member(id:string,head:boolean,qa=false) {
    const role=definitions.find(r=>r.id===id)!;
    const agent=snapshot?.agents.find(a=>a.blueprintRoleId===id&&!a.spawnedForTask);
    const parent=definitions.find(r=>r.id===role.reportsTo)?.name??'Calvin';
    const registeredParent=snapshot?.agents.find(a=>a.id===agent?.reportsTo)?.blueprintRoleId??null;
    const aligned=agent&&agent.name===role.name&&registeredParent===role.reportsTo;
    return <button key={id} disabled={!agent} onClick={()=>agent&&onInspect(agent.id)}>
      <span>{role.name.split(' ').filter(s=>/^[A-Z]/.test(s)).slice(0,2).map(s=>s[0]).join('')}</span>
      <div><strong>{role.name}</strong><small>{head?'Department head':qa?'Department QA':id==='test'?'Independent final QA':'Task-selected specialist'} · Reports to {parent}</small>
        <small>{role.output}</small><small>{agent?.model??role.model} · {role.provider} · {live&&agent?agent.status:'Activity unknown'}{!agent?' · Registration pending':!aligned?' · Roster sync pending':''}</small></div>
    </button>;
  }
  return <section className={styles.directory} aria-label="Reviewed agent team">
    <header><h2>{active.length} roles. One accountable team.</h2><p>Eight service departments and two shared teams. The COO selects the smallest useful team for each task; these roles do not all run at once.</p><p>{plan.rosterReview.handoff}</p></header>
    <nav className={directory.index} aria-label="Jump to a department">{allOfficeDepartments.map(d=><a key={d.id} href={`#office-team-${d.id}`}><strong>{d.name}</strong><span>{d.roles.length} roles · {definitions.find(r=>r.id===d.headRoleId)?.name}</span></a>)}</nav>
    {allOfficeDepartments.map(department=><section key={department.id} id={`office-team-${department.id}`}>
      <h3>{department.name} · {department.roles.length} roles</h3><p>{department.purpose}</p>
      <div>{member(department.headRoleId,true)}{department.roles.filter(id=>id!==department.headRoleId).map(id=>member(id,false,id===department.qaRoleId))}</div>
      <p>{department.gaps}</p>
    </section>)}
    <details><summary>Eight responsibilities consolidated</summary><p>These former identities remain in saved history. New work goes to the responsible role below.</p>
      {plan.rosterReview.merges.map(m=><p key={m.from}><strong>{definitions.find(r=>r.id===m.from)?.name} → {definitions.find(r=>r.id===m.into)?.name}</strong><br/>{m.reason}</p>)}
    </details>
    <details><summary>Specialties to add when needed</summary>{plan.rosterReview.deferred.map(item=><p key={item}>{item}</p>)}</details>
    <details><summary>How models were selected</summary><p>{plan.modelResearch.mappingIs}</p>{plan.modelResearch.sources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><br/>{s.finding}</p>)}<p>Account-verified choices take precedence over catalog listings. These workers share your monthly subscription limits.</p></details>
  </section>;
}
