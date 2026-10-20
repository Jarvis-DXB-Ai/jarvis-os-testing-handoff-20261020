"use client";
/* eslint-disable @next/next/no-img-element -- Registered client artwork is delivered through the existing private endpoint. */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PaperclipOfficeSnapshot} from '@/lib/office-paperclip';
import type {OfficeTeamTask} from '@/lib/office-team-contract';
import {officeDepartments,allOfficeDepartments,departmentForRole} from '@/lib/office-departments';
import {officeEnvironment} from '@/lib/office-environment.mjs';
import {OfficeOperations} from './office-operations';
import type {OfficeScene} from './office-scene';
import {officeSharedSpaces,officeCanTakeBreak,type SocialActivity} from './office-social.mjs';
import styles from './office-campus.module.css';
import {demoLabelPositions,demoRoleLabel} from './office-demo-labels.mjs';
type Agent=PaperclipOfficeSnapshot['agents'][number];
const roleIds=['coo',...allOfficeDepartments.flatMap(d=>d.roles)];
export function OfficeCampus({client,allowedDepartments,brainCounts,onBrain,onLibrary,simulation=false,simulationPaused=false,operations,focused=false,observedAt,snapshot,task,jobs,selected,department,onSelect,onDepartment}:{simulation?:boolean;simulationPaused?:boolean;operations?:ReactNode;client?:{id:string;name:string;logoUrl?:string};allowedDepartments?:string[];brainCounts?:{documents:number;files:number;curated?:number}|null;onLibrary?:()=>void;onBrain?:()=>void;focused?:boolean;observedAt:number;snapshot:PaperclipOfficeSnapshot|null;task:OfficeTeamTask|null;jobs:OfficeTeamTask[];selected:string|null;department:string;onSelect:(id:string,jobId?:string)=>void;onDepartment:(id:string)=>void}){
 const departments=officeDepartments.filter(d=>!allowedDepartments||allowedDepartments.includes(d.id));
 const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[freshAt,setFreshAt]=useState(observedAt),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[zoom,setZoom]=useState(1),[commonsOpen,setCommonsOpen]=useState(false),[social,setSocial]=useState(true),[sharedSpace,setSharedSpace]=useState<string|null>(null),[activity,setActivity]=useState<SocialActivity[]>([]);
 const focusedDemoDepartment=useRef(department);
 useEffect(()=>{focusedDemoDepartment.current=department;},[department]);
 const host=useRef<HTMLDivElement>(null),layer=useRef<HTMLDivElement>(null),engine=useRef<OfficeScene|null>(null),select=useRef(onSelect),libraryAction=useRef(onLibrary);
 useEffect(()=>{select.current=onSelect;libraryAction.current=onLibrary;},[onSelect,onLibrary]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{const timer=setInterval(()=>setFreshAt(Date.now()),3000);return()=>clearInterval(timer);},[]);
 const environment=officeEnvironment(snapshot,jobs,roleIds,Math.max(observedAt,freshAt)),motion=!paused&&!reduced&&!simulationPaused,connected=environment.fresh;
 const partFor=(j:OfficeTeamTask,id:string)=>{
  const specialist=j.steps.find(s=>s.agentId===id);if(specialist)return specialist;
  const head=j.departmentReports?.find(r=>r.agentId===id);if(head)return head;
  const report=j.departmentReports?.find(r=>r.qa?.agentId===id);if(!report?.qa)return undefined;
  const call=j.calls.find(c=>c.agentId===id&&c.stage==='department-qa:'+report.departmentId);
  return {...report,id:'qa:'+report.id,roleId:report.qa.roleId,agentId:id,name:report.qa.name,model:snapshot?.agents.find(a=>a.id===id)?.model??'Unknown',assignment:'Review '+report.departmentName+' outputs',status:report.qa.status,output:report.qa.result?JSON.stringify(report.qa.result,null,2):null,issueId:null,startedAt:call?.startedAt??null,finishedAt:call?.finishedAt??null};
 };
 const recordFor=(id:string)=>{const running=jobs.find(j=>partFor(j,id)?.status==='running'&&['working','reporting','stopping'].includes(j.status));const parent=running??(task&&partFor(task,id)?task:jobs.find(j=>partFor(j,id)));return {parent,step:parent?partFor(parent,id):undefined};};
 const state=(a:Agent)=>{if(!connected)return 'unknown';if(a.status==='running')return 'running';const {step}=recordFor(a.id);return step&&step.status!=='queued'?step.status:a.status;};

 const hasTask=(id:string)=>jobs.some(j=>['queued','planning','working','reporting','synthesising','checking','stopping','recovery_required'].includes(j.status)&&(Boolean(partFor(j,id))||j.calls.some(c=>c.agentId===id&&['dispatching','queued','running','scheduled_retry'].includes(c.status))));
 const agents=(snapshot?.agents??[]).filter(a=>roleIds.includes(a.blueprintRoleId??'')&&!a.spawnedForTask);
 useEffect(()=>{let cancelled=false;void (simulation?import('./office-demo-scene-loader'):import('./office-scene')).then(({createOfficeScene})=>{if(cancelled||!host.current)return;try{engine.current=createOfficeScene(host.current,id=>select.current(id),anchors=>{const elements=layer.current?.querySelectorAll<HTMLElement>('[data-anchor]');
 const focused=simulation&&focusedDemoDepartment.current!=='all';
 const detail=layer.current?.dataset.detail==='true';
 const obstacles=simulation?anchors.flatMap(a=>[a.monitor,a.body].filter((r):r is NonNullable<typeof r>=>Boolean(r))):[];
 const titles=simulation&&layer.current?demoLabelPositions(Array.from(elements??[]).filter(el=>focused?el.dataset.detail==='true':detail||el.dataset.selected==='true'||el.matches(':hover,:focus-visible')).flatMap(el=>{const a=anchors.find(a=>a.id===el.dataset.anchor);return a?[{...a,selected:el.dataset.selected==='true',...(focused?{labelWidth:Math.ceil((el.querySelector('span')?.scrollWidth??60)+20)}:{})}]:[];}),layer.current.clientWidth,layer.current.clientHeight,obstacles,{focused}):[];
 elements?.forEach(el=>{const anchor=anchors.find(a=>a.id===el.dataset.anchor);if(simulation&&anchor){el.dataset.headX=String(anchor.x);el.dataset.headY=String(anchor.y);if(anchor.monitor)el.dataset.monitorBox=JSON.stringify(anchor.monitor);else delete el.dataset.monitorBox;if(anchor.body)el.dataset.bodyBox=JSON.stringify(anchor.body);else delete el.dataset.bodyBox;}const title=titles.find(t=>t.id===el.dataset.anchor);el.style.visibility=focused?(title?'visible':'hidden'):anchor?.visible?'visible':'hidden';if(title){el.style.width=title.width+'px';el.dataset.labelChip='true';el.dataset.labelMuted=String(title.muted);if(focused&&anchor){const below=title.y-title.height>anchor.y,origin=below?title.y-title.height:title.y,dx=anchor.x-title.x,dy=anchor.y-5-origin;el.style.setProperty('--demo-label-leader-height',Math.hypot(dx,dy)+'px');el.style.setProperty('--demo-label-leader-angle',-Math.atan2(dx,dy)+'rad');el.style.setProperty('--demo-label-leader-top',below?'0%':'100%');}else{el.style.removeProperty('--demo-label-leader-height');el.style.removeProperty('--demo-label-leader-angle');el.style.removeProperty('--demo-label-leader-top');}el.style.transform=`translate(${title.x}px,${title.y}px) translate(-50%,-100%)`;}else{el.style.width='';delete el.dataset.labelChip;delete el.dataset.labelMuted;if(anchor)el.style.transform=`translate(${anchor.x}px,${anchor.y}px) translate(-50%,-100%)`;}});},value=>setZoom(previous=>Math.abs(previous-value)>.02?value:previous),id=>{if(id==='library'){libraryAction.current?.();return;}setSharedSpace(id);setCommonsOpen(true);},setActivity,{simulation,client,departmentIds:allowedDepartments});setReady(true);}catch{setError('3D graphics are unavailable in this browser. Use the department and agent controls below.');}}).catch(()=>setError('The 3D scene could not load. Agent controls remain available.'));return()=>{cancelled=true;engine.current?.dispose();engine.current=null;};},[client,allowedDepartments,simulation]);
 useEffect(()=>{engine.current?.update(agents.map(a=>({id:a.id,role:a.blueprintRoleId??'',name:a.name,state:state(a),running:environment.runningAgentIds.includes(a.id),available:officeCanTakeBreak({fresh:connected,status:a.status,state:state(a),running:environment.runningAgentIds.includes(a.id),assigned:hasTask(a.id),role:a.blueprintRoleId??''})})),selected,motion,simulation&&department!=='all'?false:social);});
 useEffect(()=>{if(ready)engine.current?.focus(department);},[department,ready]);
 useEffect(()=>{const home=()=>engine.current?.fit();window.addEventListener('jarvis:office-home',home);return()=>window.removeEventListener('jarvis:office-home',home);},[]);
 const visitSpace=(id:string)=>{setSharedSpace(id);engine.current?.focusSpace(id);};
 const coo=agents.find(a=>a.blueprintRoleId==='coo');
 return <section className={styles.campus} data-focus={focused} data-motion={motion} data-simulation={simulation} aria-label={simulation?"Simulated department office floor":"Live department office floor"}>
  {operations??<OfficeOperations clientName={client?.name} environment={environment} snapshot={snapshot} onSelect={onSelect}/>}
  {!simulation&&<nav className={styles.roomNav} aria-label="Department navigation">{departments.map((d,i)=><button key={d.id} aria-pressed={department===d.id} onClick={()=>onDepartment(d.id)}><span>{String(i+1).padStart(2,'0')}</span>{d.name}</button>)}</nav>}
  <div className={styles.sceneViewport} data-demo-viewport={simulation||undefined}>
   {client&&<div className={styles.clientPlaque} data-demo-plaque={simulation||undefined}>{client.logoUrl&&<img src={client.logoUrl} alt={`${client.name} registered logo`}/>}<span><strong>{client.name}</strong><small>{simulation?"Fictional client · simulation":"Dedicated client office"}</small></span></div>}
   <div className={styles.sceneHost} ref={host}/>
   <div className={styles.sceneLabels} ref={layer} data-demo-focused={simulation&&department!=='all'||undefined} data-detail={zoom>2} data-overview={department==='all'} aria-label="3D office departments and registered agents">
    {agents.map(a=>{const s=state(a),d=departmentForRole(a.blueprintRoleId);return <button key={a.id} data-anchor={a.id} className={styles.sceneAgent} data-selected={selected===a.id} data-social={activity.some(v=>v.agentId===a.id)} data-detail={department===d?.id} data-state={s} title={simulation?a.name:undefined} aria-label={`${a.name}, ${a.model}, ${s}`} onClick={()=>onSelect(a.id,recordFor(a.id).parent?.id)}><i/><span>{simulation?demoRoleLabel(a.name):a.name}</span></button>;})}
   </div>
   <div className={styles.knowledgeLinks} data-demo-shortcuts={simulation||undefined} aria-label="Office knowledge shortcuts">
    {coo&&<button aria-label="Open Office Brain and files" onClick={()=>onBrain?onBrain():onSelect(coo.id)}><strong>Brain · {brainCounts?.documents??'…'} documents</strong><small>{brainCounts?brainCounts.files.toLocaleString():'…'} files</small></button>}
    <button aria-label="Open Office library" onClick={onLibrary}><strong>Library</strong><small>{brainCounts?.curated??'…'} saved references</small></button>
   </div>
   {!ready&&!error&&<div className={styles.sceneLoading}>Building your 3D headquarters…</div>}
   {error&&<div className={styles.sceneFallback}><p>{error}</p>{agents.map(a=><button key={a.id} onClick={()=>onSelect(a.id)}>{a.name}</button>)}</div>}
  </div>
  {commonsOpen&&<aside className={styles.commonsPanel} aria-label="Shared spaces"><div className={styles.commonsHeading}><div><span>BETWEEN TASKS</span><h3>Shared spaces</h3></div><button aria-label="Close shared spaces" onClick={()=>setCommonsOpen(false)}>×</button></div><p>One idle agent can take an occasional visual break. Work assignments always take priority.</p><div className={styles.commonsRooms}>{officeSharedSpaces.map(space=><button key={space.id} aria-pressed={sharedSpace===space.id} onClick={()=>visitSpace(space.id)}><strong>{space.name}</strong><span>{space.description}</span><small>{activity.filter(a=>a.spaceId===space.id&&a.phase==='relaxing').length} here · {activity.filter(a=>a.spaceId===space.id&&a.phase!=='relaxing').length} on the way</small></button>)}</div><label className={styles.socialToggle}><input type="checkbox" checked={social} onChange={e=>setSocial(e.target.checked)}/>Allow idle visits <span>Visual activity only</span></label></aside>}
  <div className={styles.controls} data-demo-controls={simulation||undefined}><button className={styles.commonsButton} aria-label="Explore shared spaces" aria-expanded={commonsOpen} onClick={()=>setCommonsOpen(v=>!v)}>Shared spaces</button><button aria-label="Zoom out office" onClick={()=>engine.current?.zoom(simulation?1.08:1.2)}>−</button><output aria-label="Office zoom">{Math.round(zoom*100)}%</output><button aria-label="Zoom in office" onClick={()=>engine.current?.zoom(simulation?.925:.83)}>+</button><button className={styles.fit} aria-label="Fit whole office" onClick={()=>{engine.current?.fit();onDepartment('all');}}>Fit office</button><button className={styles.pause} aria-label="Pause ambient Office motion" aria-pressed={paused||reduced} disabled={reduced} onClick={()=>setPaused(v=>!v)}>{reduced?'Reduced motion':paused?'Resume motion':'Pause motion'}</button></div>
  <footer data-demo-footer={simulation||undefined}><span className={styles.sceneCredit}>Above the clouds · fixed daylight</span><span className={styles.ambientStatus}><i/>{motion?'Ambient office activity':'Motion paused'} · {simulation?`${environment.runningAgentIds.length} animated demo agents`:connected?`${environment.runningAgentIds.length} workers running`:'runtime status unknown'}</span><span>Drag to orbit · scroll to zoom · right-drag to pan</span></footer>
 </section>;
}
