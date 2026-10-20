"use client";
import {useEffect,useState} from 'react';
import {foundationFields,contextTaskTypes} from '@/lib/office-foundation-schema.mjs';
import type {OfficeFoundation,OfficeLesson,FoundationFields} from '../../../scripts/lib/office-foundations.mjs';
import type {OfficeKnowledgeCatalog} from '@/lib/office-foundations-server';
import styles from './office-foundations.module.css';
async function api(body?:unknown):Promise<OfficeKnowledgeCatalog>{
 const r=await fetch('/api/office/knowledge',{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),d=await r.json();if(!r.ok)throw new Error(d.error??'Knowledge unavailable.');return d;
}
const names:Record<keyof FoundationFields,string>={positioning:'Positioning and audience',facts:'Verified facts and messages',voice:'Voice and copy rules',visual:'Identity and art direction',production:'Layouts, motion and output rules',restrictions:'Factual and action boundaries'};
export function OfficeFoundations({scopeClientId}:{scopeClientId?:string}){
 const [rawData,setData]=useState<OfficeKnowledgeCatalog|null>(null),[selected,setSelected]=useState('jarvis-interface'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;api().then(d=>{if(alive)setData(d);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 async function change(body:unknown){setBusy(true);setError('');try{setData(await api(body));}catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}}
 const data=rawData&&scopeClientId?{...rawData,foundations:rawData.foundations.filter(f=>f.scope.clientId===scopeClientId),lessons:rawData.lessons.filter(l=>l.scope.clientId===scopeClientId),candidates:rawData.candidates.filter(c=>c.scope?.clientId===scopeClientId)}:rawData;
 const foundation=data?.foundations.find(f=>f.id===selected)??data?.foundations[0];
 return <section className={styles.panel} aria-label="Brand foundations and learning">
  <header><span className={styles.eyebrow}>COMPANY KNOWLEDGE</span><h2>Foundations and learning</h2><p>Give each assignment the correct brand, source evidence and relevant lessons. Approval applies to the exact saved revision.</p>{data?.foundations.length&&!data.lessons.some(l=>l.id==='source-process-claims')&&data.candidates.some(c=>c.sourceJobId==='37763ed3-2926-53ce-92bf-99b0ced2b8f2')?<button disabled={busy} onClick={()=>void change({action:'initialise'})}>Import saved QA correction draft</button>:null}</header>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {!data?<p>Reading MAC SSD knowledge…</p>:!data.enabled?<p>{data.message}</p>:!data.foundations.length?<div className={styles.empty}><h3>Start with separate foundations</h3><p>Create draft records for Jarvis’s interface, the agency/company and DemoClientC. Existing sources and artwork are preserved. No brand or lesson is approved by this action.</p><button disabled={busy} onClick={()=>void change({action:'initialise'})}>Create draft foundations</button></div>:<>
   <nav aria-label="Foundation scopes">{data.foundations.map(f=><button key={f.id} aria-pressed={foundation?.id===f.id} onClick={()=>setSelected(f.id)}>{f.title}<small>{f.status} · {f.scope.kind}</small></button>)}</nav>
   {foundation&&<FoundationEditor key={foundation.revision} foundation={foundation} busy={busy} onAction={change}/>}
   <section className={styles.learning}><h3>Lessons from saved work</h3><p>{data.candidates.length} preserved evidence candidates · {data.lessons.filter(l=>l.status==='approved').length} approved lessons. Candidates are evidence; only reviewed, matching lessons enter new tasks.</p>
    {data.candidates.map(c=><details key={c.id}><summary>{c.sourceKind==='owner-feedback'?'Owner feedback':'QA candidate'} · {c.scopeLabel}{c.reviewStages?.some(s=>s.departmentId)?' · '+c.reviewStages.map(s=>s.departmentId??'final').join(', '):''}</summary>{c.evidence.map((e,i)=><p key={i}><strong>{e.criterion}</strong><br/>{e.evidence}</p>)}<small>Evidence preserved in task {c.sourceJobId}; source version {c.sourceVersion.slice(0,12)}.</small></details>)}
    {data.candidates.length>0&&<LessonEditor key={data.checkedAt} data={data} selectedScope={foundation?.id} busy={busy} onAction={change}/>}
    {data.lessons.map(l=><LessonReview key={l.revision} lesson={l} busy={busy} onAction={change}/>)}
   </section>
  </>}
 </section>;
}
function FoundationEditor({foundation:f,busy,onAction}:{foundation:OfficeFoundation;busy:boolean;onAction:(body:unknown)=>Promise<void>}){
 const [fields,setFields]=useState(f.fields),[tokens,setTokens]=useState(JSON.stringify(f.tokens,null,2)),[gaps,setGaps]=useState(f.gaps.join('\n')),[note,setNote]=useState(''),[error,setError]=useState('');
 const dirty=JSON.stringify(fields)!==JSON.stringify(f.fields)||tokens!==JSON.stringify(f.tokens,null,2)||gaps!==f.gaps.join('\n');
 function download(){const u=URL.createObjectURL(new Blob([JSON.stringify(f,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=f.id+'-'+f.revision.slice(0,12)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 async function save(){try{const parsed=JSON.parse(tokens);setError('');await onAction({kind:'foundation',action:'save',id:f.id,expectedRevision:f.revision,fields,tokens:parsed,gaps:gaps.split('\n').map(s=>s.trim()).filter(Boolean)});}catch{setError('Use a valid JSON token document.');}}
 return <article className={styles.foundation}>
  <div className={styles.title}><div><h3>{f.title}</h3><p>{f.status} · revision {f.revision.slice(0,12)} · {f.sources.length} registered sources</p></div><button onClick={download}>Download saved foundation ↓</button></div>
  {f.status!=='approved'&&<p className={styles.notice}>Draft foundation. Approved-brand task mode is blocked until you review and approve a complete revision.</p>}
  {f.approvalNote&&<p>Approval scope: {f.approvalNote}</p>}
  <FoundationGuide foundation={f}/>
  <div className={styles.fields}>{foundationFields.map(key=><label key={key}>{names[key]}<textarea rows={3} maxLength={8000} value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}</div>
  <details><summary>Design values and portable tokens</summary><p>Exact colour, typography and spacing values. This document travels with design and QA context.</p><label>Token JSON<textarea className={styles.code} rows={10} value={tokens} maxLength={6000} onChange={e=>setTokens(e.target.value)}/></label><pre>{JSON.stringify(f.tokens,null,2)}</pre></details>
  <details><summary>Registered sources and assets · {f.sources.length} sources / {f.assets.length} assets</summary>{f.sources.map(s=><p key={s.id}><strong>{s.title}</strong><br/>{s.status} · hash {s.sha256.slice(0,12)}<br/><small>{s.path}</small></p>)}{f.assets.map(a=><p key={a.id}>{a.name} · {a.approvalStatus}<br/><small>{a.role} · {a.rightsStatus}</small></p>)}<p>Only assets marked approved with verified rights enter an agent’s production context. Historical references remain separate.</p>{f.sources.length>0&&<button disabled={busy||dirty} onClick={()=>void onAction({kind:'foundation',action:'reconcile',id:f.id,expectedRevision:f.revision})}>Reconcile source hashes · return to draft</button>}</details>
  <label>Unresolved gaps · one per line<textarea rows={3} value={gaps} maxLength={8000} onChange={e=>setGaps(e.target.value)}/></label>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.actions}><button disabled={busy||!dirty} onClick={()=>void save()}>Save new draft revision</button><small>Saving edits clears approval for the new revision and preserves earlier versions.</small></div>
  <label>Exact-version approval scope<textarea rows={2} value={note} maxLength={1500} placeholder="Describe what this foundation is approved for and which outputs you reviewed." onChange={e=>setNote(e.target.value)}/></label>
  <div className={styles.actions}><button disabled={busy||dirty||f.status==='approved'||f.gaps.length>0||foundationFields.some(k=>!f.fields[k])||!note.trim()} onClick={()=>void onAction({kind:'foundation',action:'approve',id:f.id,expectedRevision:f.revision,note})}>Approve this saved foundation</button>{f.status!=='retired'&&<button disabled={busy||dirty} onClick={()=>void onAction({kind:'foundation',action:'retire',id:f.id,expectedRevision:f.revision})}>Retire this foundation</button>}</div>
 </article>;
}
function LessonEditor({data,selectedScope,busy,onAction}:{data:OfficeKnowledgeCatalog;selectedScope?:string;busy:boolean;onAction:(body:unknown)=>Promise<void>}){
 const [candidate,setCandidate]=useState(data.candidates[0].id),[scopeId,setScopeId]=useState(selectedScope??data.foundations[0].id),[title,setTitle]=useState(''),[rule,setRule]=useState(''),[trigger,setTrigger]=useState(''),[counterexample,setCounterexample]=useState(''),[taskType,setTaskType]=useState('caption'),[roles,setRoles]=useState('copy, coo, test');
 const scope=data.foundations.find(f=>f.id===scopeId)?.scope;
 return <details><summary>Draft a correction from preserved evidence</summary><div className={styles.fields}>
  <label>Candidate<select value={candidate} onChange={e=>setCandidate(e.target.value)}>{data.candidates.map(c=><option key={c.id} value={c.id}>{c.scopeLabel} · {c.sourceJobId.slice(0,8)}</option>)}</select></label>
  <label>Applies to foundation<select value={scopeId} onChange={e=>setScopeId(e.target.value)}>{data.foundations.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
  <label>Lesson title<input maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label>Task type<select value={taskType} onChange={e=>setTaskType(e.target.value)}>{contextTaskTypes.map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Correction<textarea rows={3} maxLength={2000} value={rule} onChange={e=>setRule(e.target.value)}/></label>
  <label>When to apply<textarea rows={2} maxLength={600} value={trigger} onChange={e=>setTrigger(e.target.value)}/></label>
  <label>Valid exception or counterexample<textarea rows={2} maxLength={1200} value={counterexample} onChange={e=>setCounterexample(e.target.value)}/></label>
  <label>Role IDs · comma separated<input value={roles} maxLength={800} onChange={e=>setRoles(e.target.value)}/></label>
 </div><button disabled={busy||!title.trim()||!rule.trim()||!trigger.trim()||!counterexample.trim()} onClick={()=>void onAction({kind:'lesson',action:'save',id:'lesson-'+crypto.randomUUID(),expectedRevision:null,candidateId:candidate,scope,title,rule,trigger,counterexample,taskTypes:[taskType],roles:roles.split(',').map(x=>x.trim()).filter(Boolean)})}>Save lesson draft</button><p>Unscoped historical evidence can become a reviewed internal/company method; it cannot be silently attached to a client.</p></details>;
}
function LessonReview({lesson:l,busy,onAction}:{lesson:OfficeLesson;busy:boolean;onAction:(body:unknown)=>Promise<void>}){
 const [note,setNote]=useState(''),[rule,setRule]=useState(l.rule),[trigger,setTrigger]=useState(l.trigger),[exception,setException]=useState(l.counterexample);
 const dirty=rule!==l.rule||trigger!==l.trigger||exception!==l.counterexample;
 return <details><summary>{l.title} · {l.status} · {l.scope.id}</summary><details><summary>Preserved review evidence</summary>{l.evidence.map((e,i)=><p key={i}><strong>{e.criterion}</strong><br/>{e.evidence}</p>)}<small>Source task {l.sourceJobId} · version {l.sourceVersion.slice(0,12)}</small></details>{l.approvalNote&&<p>Review scope: {l.approvalNote}</p>}<label>Correction<textarea rows={3} maxLength={2000} value={rule} onChange={e=>setRule(e.target.value)}/></label><label>Apply when<textarea rows={2} maxLength={600} value={trigger} onChange={e=>setTrigger(e.target.value)}/></label><label>Exception<textarea rows={2} maxLength={1200} value={exception} onChange={e=>setException(e.target.value)}/></label><p>{l.taskTypes.join(', ')} · {l.roles.join(', ')||'All matching roles'} · revision {l.revision.slice(0,12)}</p><button disabled={busy||!dirty||!rule.trim()||!trigger.trim()||!exception.trim()} onClick={()=>void onAction({...l,kind:'lesson',action:'save',expectedRevision:l.revision,rule,trigger,counterexample:exception})}>Save revised lesson draft</button>{l.status==='draft'&&<><label>Review evidence and applicability<textarea rows={2} value={note} maxLength={1500} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy||dirty||!note.trim()} onClick={()=>void onAction({kind:'lesson',action:'approve',id:l.id,expectedRevision:l.revision,note})}>Approve this lesson</button></>}{l.status!=='retired'&&<button disabled={busy||dirty} onClick={()=>void onAction({kind:'lesson',action:'retire',id:l.id,expectedRevision:l.revision})}>Retire lesson</button>}</details>;
}
function FoundationGuide({foundation:f}:{foundation:OfficeFoundation}){
 const colours:{name:string;css:string}[]=[];
 function visit(value:unknown,path:string){if(!value||typeof value!=='object'||Array.isArray(value))return;const o=value as Record<string,unknown>;if(o.$type==='color'&&o.$value&&typeof o.$value==='object'){const v=o.$value as {colorSpace?:string;components?:number[]};if(v.colorSpace==='srgb'&&v.components?.length===3&&v.components.every(n=>Number.isFinite(n)&&n>=0&&n<=1))colours.push({name:path,css:'rgb('+v.components.map(n=>Math.round(n*255)).join(',')+')'});}else Object.entries(o).forEach(([k,v])=>visit(v,path?path+'.'+k:k));}
 visit(f.tokens,'');
 return <details open><summary>Visual foundation guide · saved {f.status} revision</summary><div className={styles.swatches}>{colours.map(c=><div key={c.name}><span style={{background:c.css}}/><small>{c.name}<br/>{c.css}</small></div>)}</div>{f.id==='jarvis-interface'?<div className={styles.examples}><div style={{background:colours.find(c=>c.name==='action.background')?.css}}><small>DRAFT SOCIAL APPLICATION</small><h3>Make work traceable.</h3><p>Assign one outcome.<br/>Review saved evidence.</p><strong>JARVIS OFFICE</strong></div><div><small>DRAFT REPORT APPLICATION</small><h3>Ready for your review</h3><p>Source evidence → saved output → independent QA → your decision.</p><strong>Editable work. Recorded versions.</strong></div></div>:<p>Complete the visual rules and tokens before creating brand applications. Historical reference assets do not establish the current identity.</p>}<p>These are deterministic guide examples, not model jobs or approved client deliverables. The Jarvis examples use the app’s existing Geist font.</p></details>;
}
