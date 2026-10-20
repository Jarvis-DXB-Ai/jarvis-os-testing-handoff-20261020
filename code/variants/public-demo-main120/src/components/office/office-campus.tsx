"use client";
/* eslint-disable @next/next/no-img-element -- Registered client artwork is delivered through the existing private endpoint. */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PaperclipOfficeSnapshot} from '@/lib/office-paperclip';
import type {OfficeTeamTask} from '@/lib/office-team-contract';
import {officeDepartments,allOfficeDepartments,departmentForRole} from '@/lib/office-departments';
import {officeEnvironment} from '@/lib/office-environment.mjs';
import {OfficeOperations} from './office-operations';
import type {OfficeScene} from './office-scene';
import type {DubaiDaylight,OfficeLightingMode} from '@/lib/office-daylight.mjs';
import {officeSharedSpaces,officeCanTakeBreak,type SocialActivity} from './office-social.mjs';
import styles from './office-campus.module.css';
import {seats,departmentGroups,displayDepartment,unseatedRoles} from './tower-v2/presentation';
import attribution from './tower-v2/attribution.json';
import {seatChipLabel} from './tower-v2/seat-labels';
import {useSceneVersion} from './tower-v2/version';
import {demoRoleLabel,demoAgentNamesEnabled} from './office-demo-labels.mjs';
import {demoDepartmentGroups,demoPresentationDepartment,demoDepartmentIncludes} from './demo-tower/demo-department-presentation.mjs';
type Agent=PaperclipOfficeSnapshot['agents'][number];
const roleIds=['coo',...allOfficeDepartments.flatMap(d=>d.roles)];
export function OfficeCampus({client,allowedDepartments,brainCounts,onBrain,onLibrary,simulation=false,simulationPaused=false,simulationReviewRoles=[],operations,focused=false,observedAt,snapshot,task,jobs,selected,department,onSelect,onClearSelection,onDepartment}:{simulation?:boolean;simulationPaused?:boolean;simulationReviewRoles?:string[];operations?:ReactNode;client?:{id:string;name:string;logoUrl?:string};allowedDepartments?:string[];brainCounts?:{documents:number;files:number;curated?:number}|null;onLibrary?:()=>void;onBrain?:()=>void;focused?:boolean;observedAt:number;snapshot:PaperclipOfficeSnapshot|null;task:OfficeTeamTask|null;jobs:OfficeTeamTask[];selected:string|null;department:string;onSelect:(id:string,jobId?:string)=>void;onClearSelection?:()=>void;onDepartment:(id:string)=>void}){
 const {version:sceneVersion,known:sceneVersionKnown,choose:chooseVersion}=useSceneVersion();const v2=sceneVersion==='v2';
 const presentedDepartment=v2?displayDepartment(department):simulation?demoPresentationDepartment(department):department;
 const departments=(v2?departmentGroups():simulation?demoDepartmentGroups(officeDepartments):officeDepartments).filter(d=>!allowedDepartments||(v2?allowedDepartments.some(id=>displayDepartment(id)===d.id):allowedDepartments.includes(d.id)));
 const [inspectedSeat,setInspectedSeat]=useState<string|null>(null),[creditsOpen,setCreditsOpen]=useState(false);
 const selectScene=(id:string,jobId?:string)=>{if(id.startsWith('seat:')||id.startsWith('role:')){clearSelection.current?.();setInspectedSeat(id);return;}setInspectedSeat(null);select.current(id,jobId);};
 const [paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[freshAt,setFreshAt]=useState(observedAt),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[zoom,setZoom]=useState(1),[commonsOpen,setCommonsOpen]=useState(false),[social,setSocial]=useState(true),[sharedSpace,setSharedSpace]=useState<string|null>(null),[activity,setActivity]=useState<SocialActivity[]>([]);
 const [lightingMode,setLightingMode]=useState<OfficeLightingMode>('live'),[daylight,setDaylight]=useState<DubaiDaylight|null>(null);
 const focusedDemoDepartment=useRef(presentedDepartment);
 useEffect(()=>{focusedDemoDepartment.current=presentedDepartment;},[presentedDepartment]);
 const lightingSelection=useRef<OfficeLightingMode>('live');
 const solarTime=(value:number)=>new Date(value).toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'});
 const host=useRef<HTMLDivElement>(null),layer=useRef<HTMLDivElement>(null),engine=useRef<OfficeScene|null>(null),select=useRef(onSelect),clearSelection=useRef(onClearSelection),libraryAction=useRef(onLibrary);
 useEffect(()=>{select.current=onSelect;clearSelection.current=onClearSelection;libraryAction.current=onLibrary;},[onSelect,onClearSelection,onLibrary]);
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
 const labelElements=useRef(new Map<string,HTMLElement>());
 const agents=(snapshot?.agents??[]).filter(a=>roleIds.includes(a.blueprintRoleId??'')&&!a.spawnedForTask);
 const rosterKey=agents.map(a=>a.id).join('|');
 useEffect(()=>{labelElements.current=new Map(Array.from(layer.current?.querySelectorAll<HTMLElement>('[data-anchor]')??[]).map(el=>[el.dataset.anchor!,el]));},[rosterKey,v2]);
 useEffect(()=>{const visibleLabels=new Set<string>();let cancelled=false;if(!sceneVersionKnown)return;queueMicrotask(()=>{if(!cancelled){setReady(false);setError(null);}});void (v2?import('./tower-v2/office-scene'):simulation?import('./office-demo-scene-loader'):import('./office-scene')).then(({createOfficeScene})=>{if(cancelled||!host.current)return;try{engine.current=createOfficeScene(host.current,id=>selectScene(id),anchors=>{
 const elements=labelElements.current;
 if(v2){
  const next=new Set<string>();let writes=0;
  for(const anchor of anchors){if(!['agent','coo'].includes(anchor.kind)||!anchor.visible)continue;const element=elements.get(anchor.id);if(!element)continue;next.add(anchor.id);const transform=`translate(${anchor.x.toFixed(2)}px,${anchor.y.toFixed(2)}px) translate(-50%,-100%)`;if(element.style.transform!==transform){element.style.transform=transform;element.style.setProperty('--label-x',anchor.x.toFixed(2)+'px');writes+=2;}if(element.style.visibility!=='visible'){element.style.visibility='visible';writes++;}}
  for(const id of visibleLabels)if(!next.has(id)){const element=elements.get(id);if(element&&element.style.visibility!=='hidden'){element.style.visibility='hidden';writes++;}}
  visibleLabels.clear();for(const id of next)visibleLabels.add(id);
  if(writes&&layer.current)layer.current.dataset.labelWrites=String(Number(layer.current.dataset.labelWrites??0)+writes);
 }else if(simulation){
  const showNames=demoAgentNamesEnabled(focusedDemoDepartment.current,Number(layer.current?.dataset.demoZoom??1));
  if(layer.current)layer.current.dataset.demoNames=String(showNames);
  const next=new Set<string>();
  if(showNames)for(const anchor of anchors){
   if(anchor.kind!=='agent'||!anchor.visible||!demoDepartmentIncludes(focusedDemoDepartment.current,departmentForRole(anchor.id.replace(/^demo:/,''))?.id))continue;
   const element=elements.get(anchor.id);if(!element)continue;
   next.add(anchor.id);element.style.visibility='visible';
   element.style.transform=`translate(${anchor.x.toFixed(2)}px,${anchor.y.toFixed(2)}px) translate(-50%,-100%)`;
  }
  for(const id of visibleLabels)if(!next.has(id)){const element=elements.get(id);if(element)element.style.visibility='hidden';}
  visibleLabels.clear();for(const id of next)visibleLabels.add(id);
 }else{const positions=new Map(anchors.map(anchor=>[anchor.id,anchor]));for(const [id,element]of elements){const anchor=positions.get(id);element.style.visibility=anchor?.visible?'visible':'hidden';if(anchor)element.style.transform=`translate(${anchor.x}px,${anchor.y}px) translate(-50%,-100%)`;}}
 },value=>{if(simulation&&layer.current)layer.current.dataset.demoZoom=String(value);setZoom(previous=>Math.abs(previous-value)>.02?value:previous);},id=>{if(id==='library'){libraryAction.current?.();return;}setSharedSpace(id);setCommonsOpen(true);},setActivity,{simulation,client,departmentIds:allowedDepartments,onLighting:setDaylight});if(!v2){host.current.dataset.sceneVersion='legacy';host.current.dataset.sceneState='ready';}if(simulation)host.current.querySelector('canvas')?.setAttribute('aria-label','Interactive 3D office');engine.current.setLighting(lightingSelection.current);setReady(true);}catch{setError('3D graphics are unavailable in this browser. Use the department and agent controls below.');}}).catch(()=>setError('The 3D scene could not load. Agent controls remain available.'));return()=>{cancelled=true;engine.current?.dispose();engine.current=null;};},[client,allowedDepartments,simulation,v2,sceneVersionKnown]);
 useEffect(()=>{engine.current?.update(agents.map(a=>({id:a.id,role:a.blueprintRoleId??'',name:a.name,state:simulation&&simulationReviewRoles.includes(a.blueprintRoleId??'')?'awaiting-review':state(a),running:environment.runningAgentIds.includes(a.id),available:officeCanTakeBreak({fresh:connected,status:a.status,state:state(a),running:environment.runningAgentIds.includes(a.id),assigned:hasTask(a.id),role:a.blueprintRoleId??''})})),selected,motion,simulation&&department!=='all'?false:social);});
 useEffect(()=>{if(ready)engine.current?.focus(presentedDepartment);},[presentedDepartment,ready]);
 const selectedDepartment=departmentForRole(agents.find(a=>a.id===selected)?.blueprintRoleId)?.id;
 useEffect(()=>{if(ready&&!v2&&simulation&&presentedDepartment==='social'&&selectedDepartment==='email')engine.current?.focus('email');},[ready,simulation,presentedDepartment,selectedDepartment,selected,v2]);
 useEffect(()=>{const home=()=>engine.current?.fit();window.addEventListener('jarvis:office-home',home);return()=>window.removeEventListener('jarvis:office-home',home);},[]);
 const visitSpace=(id:string)=>{setSharedSpace(id);engine.current?.focusSpace(id);};
 const coo=agents.find(a=>a.blueprintRoleId==='coo');
 useEffect(()=>{if(selected)queueMicrotask(()=>setInspectedSeat(null));},[selected]);
 const inspected=seats.find(s=>inspectedSeat===(s.appRole?'role:'+s.appRole:'seat:'+s.id));
 useEffect(()=>{if(!inspectedSeat&&!creditsOpen)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setInspectedSeat(null);setCreditsOpen(false);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[inspectedSeat,creditsOpen]);
 return <section className={styles.campus} data-focus={focused} data-scene-version={sceneVersion} data-motion={motion} data-simulation={simulation} aria-label={simulation?"Simulated department office floor":"Live department office floor"}>
  {operations??<OfficeOperations clientName={client?.name} environment={environment} snapshot={snapshot} onSelect={onSelect}/>}
  {!simulation&&<nav className={styles.roomNav} aria-label="Department navigation">{departments.map((d,i)=><button key={d.id} aria-pressed={department===d.id} onClick={()=>onDepartment(d.id)}><span>{String(i+1).padStart(2,'0')}</span>{d.name}</button>)}</nav>}
  <div className={styles.sceneViewport} data-demo-viewport={simulation||undefined}>
   {!simulation&&!v2&&<div className={styles.daylight} title="Astronomical lighting for Dubai city centre. Calculated locally from date and solar position; independent of demo tasks and your device timezone."><label><span>DUBAI LIGHT</span><select aria-label="Office lighting" value={lightingMode} onChange={e=>{const mode=e.target.value as OfficeLightingMode;setLightingMode(mode);lightingSelection.current=mode;engine.current?.setLighting(mode);}}><option value="live">Live Dubai{lightingMode==='live'&&daylight?' · '+daylight.phase:''}</option><option value="sunrise">Sunrise preview</option><option value="midday">Midday preview</option><option value="sunset">Sunset preview</option><option value="night">Night preview</option></select></label><small>{lightingMode==='live'?'Real Dubai time':'Preview only'}{daylight?` · rise ${solarTime(daylight.sunrise)} / set ${solarTime(daylight.sunset)} GST`:' · calculating…'}</small></div>}
   {client&&<div className={styles.clientPlaque} data-demo-plaque={simulation||undefined}>{client.logoUrl&&<img src={client.logoUrl} alt={`${client.name} registered logo`}/>}<span><strong>{client.name}</strong><small>{simulation?"Fictional client · simulation":"Dedicated client office"}</small></span></div>}
   <div className={styles.sceneHost} ref={host}/>
   <div className={styles.sceneLabels} ref={layer} data-demo-focused={simulation&&department!=='all'||undefined} data-detail={zoom>=2} data-demo-names={v2?true:simulation?demoAgentNamesEnabled(department,zoom):undefined} data-overview={department==='all'} aria-label="3D office departments and registered agents">
    {v2?seats.map(seat=>{const a=seat.appRole?agents.find(a=>a.blueprintRoleId===seat.appRole):undefined,id=a?.id??(seat.appRole?'role:'+seat.appRole:'seat:'+seat.id),review=Boolean(a&&simulation&&simulationReviewRoles.includes(a.blueprintRoleId??'')),label=seatChipLabel(seat.id,seat.role);return <button key={seat.id} data-anchor={id} data-seat={seat.id} className={styles.sceneAgent} data-label-chip data-v2-chip data-planned={!seat.appRole||undefined} data-awaiting-review={review||undefined} data-selected={selected===a?.id} data-state={a?state(a):seat.appRole?'unknown':'planned'} aria-label={`${seat.role}, ${seat.appRole?(a?review?'awaiting your review':state(a):'runtime status not observed'):'Planned role — not yet active'}`} title={seat.role+(!seat.appRole?' · Planned role — not yet active':'')} onClick={()=>selectScene(id,a?recordFor(a.id).parent?.id:undefined)}><i aria-hidden="true"/><span>{label}</span></button>;}):agents.map(a=>{const s=state(a),d=departmentForRole(a.blueprintRoleId);return <button key={a.id} data-anchor={a.id} className={styles.sceneAgent} data-label-chip={simulation||undefined} data-awaiting-review={simulation&&simulationReviewRoles.includes(a.blueprintRoleId??'')||undefined} data-selected={selected===a.id} data-social={activity.some(v=>v.agentId===a.id)} data-detail={simulation?demoDepartmentIncludes(presentedDepartment,d?.id):department===d?.id} data-state={s} title={simulation?a.name:undefined} aria-label={`${a.name}, ${a.model}, ${simulation&&simulationReviewRoles.includes(a.blueprintRoleId??'')?'awaiting your review':s}`} onClick={()=>onSelect(a.id,recordFor(a.id).parent?.id)}><i/><span>{simulation?demoRoleLabel(a.name):a.name}</span></button>;})}

   </div>
   <div className={styles.knowledgeLinks} data-demo-shortcuts={simulation||undefined} aria-label="Office knowledge shortcuts">
    {coo&&<button aria-label="Open Office Brain and files" onClick={()=>onBrain?onBrain():onSelect(coo.id)}><strong>Brain · {brainCounts?.documents??'…'} documents</strong><small>{brainCounts?brainCounts.files.toLocaleString():'…'} files</small></button>}
    <button aria-label="Open Office library" onClick={onLibrary}><strong>Library</strong><small>{brainCounts?.curated??'…'} saved references</small></button>
   </div>
  {v2&&!simulation&&<div className={styles.v2Tools} aria-label="Office v2 views"><button onClick={()=>engine.current?.focusSpace('plan')}>Plan</button><button onClick={()=>engine.current?.focusSpace('max_suite')}>Max suite</button><button onClick={()=>engine.current?.focusSpace('boardroom')}>Boardroom</button><button onClick={()=>engine.current?.focusSpace('arrival_lobby')}>Lobby</button><button onClick={()=>setCreditsOpen(true)}>Credits</button><label>Scene<select aria-label="Office scene version" value={sceneVersion} onChange={e=>{setInspectedSeat(null);setCreditsOpen(false);chooseVersion(e.target.value as 'v2'|'legacy');}}><option value="v2">Office v2</option><option value="legacy">Legacy</option></select></label></div>}
   {!ready&&!error&&<div className={styles.sceneLoading}>Building your 3D headquarters…</div>}
   {error&&<div className={styles.sceneFallback}><p>{error}</p>{agents.map(a=><button key={a.id} onClick={()=>selectScene(a.id)}>{a.name}</button>)}</div>}
  </div>
  {commonsOpen&&!v2&&<aside className={styles.commonsPanel} aria-label="Shared spaces"><div className={styles.commonsHeading}><div><span>BETWEEN TASKS</span><h3>Shared spaces</h3></div><button aria-label="Close shared spaces" onClick={()=>setCommonsOpen(false)}>×</button></div><p>One idle agent can take an occasional visual break. Work assignments always take priority.</p><div className={styles.commonsRooms}>{officeSharedSpaces.map(space=><button key={space.id} aria-pressed={sharedSpace===space.id} onClick={()=>visitSpace(space.id)}><strong>{space.name}</strong><span>{space.description}</span><small>{activity.filter(a=>a.spaceId===space.id&&a.phase==='relaxing').length} here · {activity.filter(a=>a.spaceId===space.id&&a.phase!=='relaxing').length} on the way</small></button>)}</div><label className={styles.socialToggle}><input type="checkbox" checked={social} onChange={e=>setSocial(e.target.checked)}/>Allow idle visits <span>Visual activity only</span></label></aside>}
  <div className={styles.controls} data-demo-controls={simulation||undefined}><button className={styles.commonsButton} aria-label="Explore shared spaces" aria-expanded={commonsOpen} onClick={()=>v2?engine.current?.focusSpace('lounge_bar'):setCommonsOpen(v=>!v)}>{v2?'Lounge':'Shared spaces'}</button><button aria-label="Zoom out office" onClick={()=>engine.current?.zoom(simulation?1.08:1.2)}>−</button><output aria-label="Office zoom">{Math.round(zoom*100)}%</output><button aria-label="Zoom in office" onClick={()=>engine.current?.zoom(simulation?.925:.83)}>+</button><button className={styles.fit} aria-label="Fit whole office" onClick={()=>{engine.current?.fit();onDepartment('all');}}>Fit office</button><button className={styles.pause} aria-label="Pause ambient Office motion" aria-pressed={paused||reduced} disabled={reduced} onClick={()=>setPaused(v=>!v)}>{reduced?'Reduced motion':paused?'Resume motion':'Pause motion'}</button></div>

  {!v2&&!simulation&&<button className={styles.v2Return} onClick={()=>chooseVersion('v2')}>Office v2</button>}
  {v2&&!simulation&&<details className={styles.v2Runtime}><summary>Runtime roles without a v2 seat ({agents.filter(a=>unseatedRoles.has(a.blueprintRoleId??'')).length})</summary><p>Existing tasks and authors remain unchanged. These runtime roles have no physical seat in this design.</p>{agents.filter(a=>unseatedRoles.has(a.blueprintRoleId??'')).map(a=><button key={a.id} onClick={()=>selectScene(a.id)}>{a.name} · {state(a)}</button>)}</details>}
  {v2&&inspected&&<aside className={styles.v2Inspector} role="dialog" aria-label="Office seat details"><button aria-label="Close seat details" onClick={()=>setInspectedSeat(null)}>×</button><small>{inspected.department}</small><h2>{inspected.role}</h2><p>{inspected.appRole?'Runtime status not observed. This seat is mapped to an existing role; no current agent was supplied.':'Planned role — not yet active'}</p><p>Seated cast. Planned or unavailable roles do not type. Selecting a seat creates no runtime agent or task.</p></aside>}
  {v2&&creditsOpen&&<aside className={styles.v2Inspector} role="dialog" aria-label="Office asset credits"><button aria-label="Close asset credits" onClick={()=>setCreditsOpen(false)}>×</button><h2>Office v2 · asset credits</h2><p>MPFB / MakeHuman system assets (CC0). Community assets were posed, combined with generated characters, and converted to GLB / Draco / WebP for Office v2. Original authors do not endorse this use.</p><ul>{attribution.map(asset=><li key={asset.id}><a href={"/office/v2/attribution.html#asset-"+asset.id} target="_blank" rel="noreferrer">{asset.title} · {asset.author} · #{asset.id}</a>{" · "}{asset.licenseUrl?<a href={asset.licenseUrl} target="_blank" rel="noreferrer">{asset.license}</a>:<span>{asset.license} · version unspecified</span>}{asset.id==='572'&&<small> · {asset.sourceNotice}</small>}</li>)}</ul><p><a href="http://www.makehumancommunity.org" target="_blank" rel="noreferrer">MakeHuman Community · source repository</a></p><iframe title="Office v2 complete asset attribution" src="/office/v2/CREDITS.txt"/><a href="/office/v2/CREDITS.txt" target="_blank" rel="noreferrer">Read complete credits ↗</a></aside>}
  <footer data-demo-footer={simulation||undefined}><a className={styles.sceneCredit} href={v2?"/office/v2/CREDITS.txt":"/office-environments/README.md"} target="_blank" rel="noreferrer" title={v2?"Office v2 complete asset attribution":"Dubai-inspired 3D setting · architecture and scene notes"}>{v2?"Office v2 · credits ↗":"Dubai · 3D city ↗"}</a><span className={styles.ambientStatus}><i/>{v2?(motion?'Working-role motion':'Motion paused'):motion?'Ambient breaks & city motion':'Motion paused'} · {simulation?`${environment.runningAgentIds.length} simulated working roles`:connected?`${environment.runningAgentIds.length} workers running`:'runtime status unknown'}</span><span>Drag to orbit · scroll to zoom · right-drag to pan</span></footer>
 </section>;
}
