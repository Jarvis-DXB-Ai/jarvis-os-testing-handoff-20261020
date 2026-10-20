"use client";
import Image from 'next/image';
import {useEffect,useState} from 'react';
import type {PaperclipOfficeSnapshot} from '@/lib/office-paperclip';
import plan from '@/lib/office-stack-plan.json';
import iconSources from '../../../public/office-icons/sources.json';
import styles from './office-connection-icons.module.css';
import type {OfficeTeamTask} from '@/lib/office-team-contract';
import type {ToolConnection} from '../../../scripts/lib/office-tool-bridge.mjs';
import {appUse,plannedAppRoles} from '@/lib/office-observations.mjs';
type State='connected'|'registered'|'partial'|'needed'|'unknown';
type Item={id:string;name:string;label:string;icon:string;state:State;note:string;source?:string};
type Tools={sharedConnections?:import('@/lib/office-tools-server').OfficeSharedConnection[];knowledge?:{status:string;foundations:number;approvedFoundations:number;approvedLessons:number;clientBrainBindings:number};bridge?:{status:string;connections:ToolConnection[]};checkedAt:string;higgsfield:{status:string;message:string};archive?:{status:string;message:string};storage?:{status:string;message:string}};
const statusOrder:Record<State,number>={connected:0,registered:0,partial:1,needed:2,unknown:3};
const labels:Record<State,string>={connected:'Connected',registered:'Registered',partial:'Partial setup',needed:'Needs connection',unknown:'Status unknown'};
const iconFiles:Record<string,string>=Object.fromEntries(iconSources.icons.map(icon=>[icon.id,`/office-icons/${icon.file}`]));
function AppMark({id}:{id:string}){
 if(iconFiles[id])return <Image src={iconFiles[id]} width={28} height={28} alt="" unoptimized/>;
 if(!['assets','review'].includes(id))return <span className={styles.logoPending} title="Verified logo pending">{id}</span>;
 return <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  {id==='assets'?<><path d="M9 25V8h14v11q0 8-7 8h-3" strokeWidth="2.5"/><path d="M8 14h7M18 7v4" strokeOpacity=".45"/></>:
   id==='review'?<><rect x="5" y="5" width="22" height="24" rx="4"/><path d="M10 15l4 4 8-8M11 24h10"/></>:
   <><rect x="10" y="10" width="12" height="12" rx="3"/><path d="M3 5h6v6M29 5h-6v6M3 27h6v-6M29 27h-6v-6M3 5v5M29 5v5M3 27v-5M29 27v-5"/></>}
 </svg>;
}
export function OfficeConnectionIcons({snapshot,jobs,onSetup,onAgent}:{snapshot:PaperclipOfficeSnapshot|null;jobs:OfficeTeamTask[];onSetup:()=>void;onAgent:(id:string,jobId?:string)=>void}){
 const [tools,setTools]=useState<Tools|null>(null),[failed,setFailed]=useState(false),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{let alive=true;async function read(){try{const r=await fetch('/api/office/tools',{cache:'no-store'});if(!r.ok)throw new Error();const data=await r.json();if(alive){setTools(data);setFailed(false);}}catch{if(alive)setFailed(true);}}void read();const timer=setInterval(()=>{if(document.visibilityState==='visible')void read();},60000);window.addEventListener('jarvis:office-connections-changed',read);return()=>{alive=false;clearInterval(timer);window.removeEventListener('jarvis:office-connections-changed',read);};},[]);
 useEffect(()=>{const home=()=>setSelected(null);window.addEventListener('jarvis:office-home',home);return()=>window.removeEventListener('jarvis:office-home',home);},[]);
 const live=snapshot?.status==='connected',hasTools=tools&&!failed;
 function appState(id:string):State{
  if(['zernio','manychat','pinterest','canva','mailchimp'].includes(id)){const shared=hasTools?tools.sharedConnections?.find(c=>c.id===id):null;return !shared?'unknown':shared.status==='partial'?'partial':'needed';}
  if(id==='assets')return hasTools&&tools.knowledge?.status==='connected'?'partial':'needed';
  const native=hasTools?tools.bridge?.connections.find(c=>c.appId===id):null;
  if(native)return native.status==='connected'?(id==='cloud'?'partial':'connected'):native.status==='partial'?'partial':'unknown';
  if(id==='paperclip')return live?'connected':'unknown';
  if(id==='higgsfield')return !hasTools?'unknown':tools.higgsfield.status==='connected'?'partial':'needed';
  if(id==='review')return !hasTools?'unknown':tools.archive?.status==='connected'?'partial':'needed';
  return 'needed';
 }
 const shortNames:Record<string,string>={canva:'Canva',mailchimp:'Mailchimp',pinterest:'Pinterest',zernio:'Zernio',manychat:'Manychat',paperclip:'Paperclip',higgsfield:'Higgsfield',assets:'Brain',sharp:'Sharp',ffmpeg:'FFmpeg',meta:'Meta',review:'Review',cloud:'Cloudflare',blender:'Blender',github:'GitHub'};
 const apps:Item[]=plan.apps.filter(a=>a.priority==='Required'&&!['codex','claude'].includes(a.id)).map(a=>({id:a.id,name:a.name,label:shortNames[a.id]??a.name,icon:a.id,state:appState(a.id),note:hasTools&&tools.sharedConnections?.find(c=>c.id===a.id)?.message?tools.sharedConnections.find(c=>c.id===a.id)!.message:hasTools&&tools.bridge?.connections.find(c=>c.appId===a.id)?.message?tools.bridge.connections.find(c=>c.appId===a.id)!.message+' Task-scoped MCP route; media still needs visual owner review.':a.id==='assets'&&hasTools&&tools.knowledge?.status==='connected'?'Local foundation and lesson context API connected. '+tools.knowledge.approvedFoundations+' approved foundations; '+tools.knowledge.clientBrainBindings+' live-client bindings. Review sources and approvals in Foundations.':a.id==='higgsfield'&&hasTools?tools.higgsfield.message:a.id==='paperclip'?live?'Private Paperclip connection is responding. Saved team execution is available locally.':snapshot?.message??'Checking the private Office connection.':a.nextStep,source:a.source}));
 const orderedApps=[...apps].sort((a,b)=>statusOrder[a.state]-statusOrder[b.state]);
 const models:Item[]=[{id:'opus',label:'Opus',icon:'claude',provider:'claude_local',model:'opus'},{id:'sonnet',label:'Sonnet',icon:'claude',provider:'claude_local',model:'sonnet'},{id:'haiku',label:'Haiku',icon:'claude',provider:'claude_local',model:'haiku'},{id:'gpt-5.6-sol',label:'GPT-5.6',icon:'codex',provider:'codex_local',model:'gpt-5.6-sol'}].map(m=>{
  const count=snapshot?.agents.filter(a=>!a.spawnedForTask&&a.model===m.model&&a.adapter===m.provider).length??0;
  return {id:'model-'+m.id,name:m.icon==='claude'?`Claude ${m.label}`:'Codex GPT-5.6',label:m.label,icon:m.icon,state:live&&count?'registered':'unknown',note:live?`${count} permanent roles registered with this model through ${m.icon==='claude'?'Claude Code':'Codex CLI'}. Monthly subscription only. Availability also depends on subscription authentication and remaining quota. Actual resolved model names are saved with the run.`:'Model registration cannot be verified while Paperclip is unavailable.'};
 });
 const bridges:Item[]=[
  {id:'bridge-research',name:'Web research tool bridge',label:'Research',icon:'mcp',state:hasTools&&tools.bridge?.connections.some(c=>c.appId==='github'&&c.status==='connected')?'partial':'needed',note:'Public GitHub search is connected through task-scoped MCP with cited public links. General website browsing, social-account research and private repository access are not included.'},
  {id:'bridge-brain',name:'Client Brain tool bridge',label:'Brain tools',icon:'mcp',state:hasTools&&tools.knowledge?.status==='connected'?'partial':'needed',note:hasTools&&tools.knowledge?.status==='connected'?'Task context API connected: '+tools.knowledge.foundations+' foundations / '+tools.knowledge.approvedFoundations+' approved / '+tools.knowledge.approvedLessons+' approved lessons. Role-specific snapshots are pinned before model dispatch. '+tools.knowledge.clientBrainBindings+' registered Client Brain bindings. Local historical sources do not establish live client data or asset approval.':'Create separate brand foundations in the Foundations view, then preview scoped task context. Client bindings and asset approvals are verified separately.'},
  {id:'bridge-media',name:'Creative production tool bridge',label:'Creative tools',icon:'mcp',state:hasTools&&tools.bridge?.status==='verified'?'partial':'needed',note:'Local Sharp card export, Blender primitive scenes and FFmpeg still-based MP4 are connected via scoped MCP and tested with fixtures. Higgsfield paid generation, full footage editing, client asset ingestion and visual approval remain separate.'},
  {id:'bridge-meta',name:'Social publishing and messaging tool bridge',label:'Distribution',icon:'mcp',state:'needed',note:'Shared setup first: reuse the existing Zernio publishing and analytics adapter, register Manychat messaging, and verify authentication plus reusable worker routes. Client profiles, channel scopes and custom automations follow later. No Office messaging or publishing tools are granted yet.'}
 ];
 const optional:Item[]=plan.apps.filter(a=>a.priority!=='Required').map(a=>({id:a.id,name:a.name,label:a.name.split(' +')[0],icon:a.id,state:'needed',note:`${a.priority}, not committed to the launch stack. ${a.nextStep}`,source:a.source}));
 const item=[...apps,...models,...bridges,...optional].find(i=>i.id===selected);
 const observed=item?appUse(item.id,jobs,snapshot):[],assigned=item?plannedAppRoles(item.id,plan):[];
 const tile=(i:Item)=><button key={i.id} className={styles.tile} data-state={i.state} data-live={appUse(i.id,jobs,snapshot).some(r=>r.live)} aria-label={`${i.name}: ${labels[i.state]}`} aria-expanded={selected===i.id} onClick={()=>setSelected(v=>v===i.id?null:i.id)} title={`${i.name} · ${labels[i.state]}`}><span className={styles.mark} data-icon={i.icon}><AppMark id={i.icon}/><i className={styles.dot}/></span><span className={styles.iconLabel}>{i.label}</span></button>;
 return <section className={styles.overview} aria-label="App, model and MCP connection overview"><div className={styles.groups}>
  <div className={styles.group}><h2>APPS</h2><div className={styles.apps} role="group" aria-label="Apps ordered by status: connected, partial setup, needs connection, status unknown">{orderedApps.map(tile)}</div></div>
  <div className={styles.group}><h2>MODELS</h2><div className={styles.models}>{models.map(tile)}</div></div>
  <div className={styles.group}><h2>TOOLS / MCP</h2><div className={styles.bridges}>{bridges.map(tile)}</div></div>
 </div><details className={styles.foot}><summary aria-label="Connection legend and optional apps" title="Connection legend and optional apps">+</summary><div className={styles.dockExtras}><p><span data-state="connected">●</span>Connected <span data-state="registered">●</span>Registered model <span data-state="partial">●</span>Partial setup <span data-state="needed">○</span>Needs connection <span data-state="unknown">○</span>Status unknown</p><p>Orange: access or setup exists; the complete Office workflow is not verified. Connection status does not confirm a client’s purchased add-ons.</p><details><summary>Optional tools · {optional.length}</summary><div className={styles.optional}>{optional.map(tile)}</div></details></div></details>
 {item&&<div className={styles.detail} role="region" aria-label="Connection and app usage detail"><div><strong>{item.name}</strong><span data-state={item.state}>{labels[item.state]}</span><p>{item.note}</p><small>{item.id.startsWith('model-')||item.id==='paperclip'?`Paperclip read: ${snapshot?.checkedAt?new Date(snapshot.checkedAt).toLocaleTimeString():'unavailable'}`:['higgsfield','review','blender','sharp','ffmpeg','github','cloud','zernio','manychat','pinterest','canva','mailchimp'].includes(item.id)?`Tool read: ${hasTools?new Date(tools.checkedAt).toLocaleTimeString():'unavailable'}`:`Setup inventory: ${plan.checkedAt} · no working connection inferred`}</small>{hasTools&&tools.bridge?.connections.find(c=>c.appId===item.id)?.testedAt&&<p>Native connection tested: {new Date(tools.bridge.connections.find(c=>c.appId===item.id)!.testedAt!).toLocaleString()} · labelled fixture.</p>}<div className={styles.usage}><h3>Recorded team use · {observed.length} agents / coordinators</h3>{observed.length?observed.map(r=><button key={r.agentId??r.roleId} disabled={!r.agentId} onClick={()=>{if(r.agentId){onAgent(r.agentId,r.jobId);setSelected(null);}}}><span data-live={r.live}>●</span><strong>{r.name}</strong><small>{r.runs} recorded {item.id==='review'?'archives':'runs'} · {r.live?'active now':r.status} · {r.model??'SSD coordinator'}</small></button>):<p>No recorded use by an Office agent yet.</p>}<details><summary>Planned roles · {assigned.length}</summary><p>{assigned.map(r=>snapshot?.agents.find(a=>a.blueprintRoleId===r.id)?.name??r.id).join(' · ')||'Tool route remains to be assigned.'}</p><small>Role mapping is planned capability, not a permission grant or proof of use.</small></details></div></div><div className={styles.actions}><button onClick={()=>{setSelected(null);onSetup();}}>View setup ↗</button>{item.source&&<a href={item.source} target="_blank" rel="noreferrer">Source ↗</a>}<button aria-label="Close connection detail" onClick={()=>setSelected(null)}>×</button></div></div>}
 </section>;
}
