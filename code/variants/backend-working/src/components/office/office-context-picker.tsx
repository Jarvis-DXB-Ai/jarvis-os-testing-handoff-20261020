"use client";
import {useEffect,useState} from 'react';
import type {OfficeContextRequest,OfficeContextBundle} from '../../../scripts/lib/office-foundations.mjs';
import type {OfficeKnowledgeCatalog} from '@/lib/office-foundations-server';
import {officeBrainStructure} from '@/lib/office-brain-policy.mjs';
import {contextTaskTypes} from '@/lib/office-foundation-schema.mjs';
export function OfficeContextPicker({value,onChange,onPreview,foundationId}:{foundationId?:string;value:OfficeContextRequest;onChange:(v:OfficeContextRequest)=>void;onPreview:(revision:string|null)=>void}){
 const [data,setData]=useState<OfficeKnowledgeCatalog|null>(null),[preview,setPreview]=useState<{bundle:OfficeContextBundle;roles:Record<string,unknown>}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[roleId,setRoleId]=useState('coo');
 useEffect(()=>{let alive=true;fetch('/api/office/knowledge',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(alive)setData(d);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 function change(v:OfficeContextRequest){setPreview(null);onPreview(null);setError('');onChange(v);}
 async function inspect(){setBusy(true);setError('');onPreview(null);try{const r=await fetch('/api/office/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview',request:value,roleId})}),d=await r.json();if(!r.ok)throw new Error(d.error);setPreview(d);onPreview(d.bundle.revision);}catch(e){setPreview(null);setError(e instanceof Error?e.message:'Preview unavailable.');}finally{setBusy(false);}}
 return <fieldset style={{border:'1px solid var(--j-hair-2)',borderRadius:8,padding:14,margin:'14px 0'}}><legend>Brand and task context</legend>
  {!data?.foundations.length?<p>Create draft foundations in the Foundations view before assigning new work.</p>:<>
   <label>Foundation<select value={value.foundationId} onChange={e=>change({...value,foundationId:e.target.value})}>{data.foundations.filter(f=>f.status!=='retired'&&(!foundationId||f.id===foundationId)).map(f=><option key={f.id} value={f.id}>{f.title} · {f.status}</option>)}</select></label>
   <label>Task type<select value={value.taskType} onChange={e=>change({...value,taskType:e.target.value as OfficeContextRequest['taskType']})}>{contextTaskTypes.map(t=><option key={t} value={t}>{officeBrainStructure.retrievalProfiles[t].label}</option>)}</select></label>
   <label>Preview what this agent receives<select value={roleId} onChange={e=>{setRoleId(e.target.value);setPreview(null);onPreview(null);}}>{Object.entries(officeBrainStructure.rolePolicies).map(([id,policy])=><option key={id} value={id}>{policy.name}</option>)}</select></label>
   <label>Foundation use<select value={value.mode} onChange={e=>change({...value,mode:e.target.value as OfficeContextRequest['mode']})}><option value="draft">Internal draft · proposals and gaps labelled</option><option value="approved">Approved brand · exact version required</option></select></label>
   <button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?'Reading context…':'Preview context · no agents run'}</button>
  </>}
  {error&&<p role="alert">{error}</p>}
  {preview&&<details open><summary>Context ready · {preview.bundle.foundation.title} · {preview.bundle.lessons.length} matching approved lessons</summary><p>{preview.bundle.mode==='draft'?'Internal draft. This does not establish brand or client approval.':'Approved foundation pinned.'} Revision {preview.bundle.revision.slice(0,12)}.</p>{preview.bundle.gaps.map(g=><p key={g}>Needs attention: {g}</p>)}{Object.entries(preview.roles).map(([role,payload])=><details key={role}><summary>{role} receives</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:220,overflow:'auto',fontSize:11}}>{JSON.stringify(payload,null,2)}</pre></details>)}</details>}
 </fieldset>;
}
