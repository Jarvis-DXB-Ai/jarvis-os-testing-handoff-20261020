'use client'
/* eslint-disable @next/next/no-img-element -- Owner-authenticated private previews. */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { ClientWorkspaceChrome } from '@/lib/client-workspace-chrome-server';
import { percentageChange } from '@/lib/social-performance';
import styles from './client-profile.module.css';
const tabs=[['Overview',''],['Social','/social'],['Studio','/ai-content/studio'],['Planner','/planner'],['Brain','/brain']] as const;
const count=(n:number|null|undefined)=>n==null?'—':Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
export default function ClientWorkspaceHeader({clientId,data,loading=false}:{clientId:string;data?:ClientWorkspaceChrome|null;loading?:boolean;activeTab?:string}) {
 const path=usePathname(),router=useRouter(),input=useRef<HTMLInputElement>(null);
 const [platform,setPlatform]=useState<'instagram'|'facebook'>('instagram');
 const [slot,setSlot]=useState<'cover'|'avatar'>('cover');
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [saved,setSaved]=useState<Partial<Record<'cover'|'avatar',string>>>({});
 const [failed,setFailed]=useState<Partial<Record<'cover'|'avatar',string>>>({});
 const client=data?.client,name=client?.name||'Client workspace',root=`/clients/${clientId}`;
 const cover=saved.cover||client?.coverUrl,avatar=saved.avatar||client?.logoUrl;
 const stats=data?.performance?.[platform];
 async function upload(file:File|undefined) { if(!file)return; setError(null);setBusy(true); try { const body=new FormData();body.set('file',file); const res=await fetch(`/api/clients/${clientId}/profile-image?slot=${slot}`,{method:'POST',body});const json=await res.json();if(!res.ok||!json.url)throw new Error(json.error||'Unable to save image.');setSaved(value=>({...value,[slot]:json.url}));router.refresh(); }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);if(input.current)input.current.value='';} }
 function choose(kind:'cover'|'avatar'){setSlot(kind);input.current?.click();}
 return <header className={`${styles.profile} client-workspace-header`}>
  <div className="client-workspace-breadcrumb"><Link href="/clients">Clients</Link><span> / </span><span>{name}</span></div>
  <input ref={input} className={styles.file} aria-label="Upload client profile image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>void upload(event.target.files?.[0])}/>
  <div className={styles.cover}>{cover&&failed.cover!==cover?<img src={cover} alt={`${name} cover`} decoding="async" onError={()=>setFailed(value=>({...value,cover}))}/>:<span className={styles.coverEmpty}>Your client, at a glance.</span>}<button type="button" disabled={busy} onClick={()=>choose('cover')}>{busy?'Saving…':cover?'Replace cover':'Add cover photo'}</button></div>
  <div className={styles.identity}><button type="button" className={styles.avatar} disabled={busy} onClick={()=>choose('avatar')} aria-label="Replace client profile picture">{avatar&&failed.avatar!==avatar?<img src={avatar} alt={`${name} profile`} onError={()=>setFailed(value=>({...value,avatar}))}/>:<span>{name.split(/\s+/).slice(0,2).map(w=>w[0]).join('')}</span>}<small>Edit</small></button><div><h1>{loading?'Loading workspace…':name}</h1><p>{client?.industry}<span> · </span>{client?.status}</p></div></div>
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  <div className={styles.statsHeading}><div role="group" aria-label="Profile statistics platform">{(['instagram','facebook'] as const).map(value=><button type="button" key={value} aria-pressed={platform===value} onClick={()=>setPlatform(value)}>{value==='instagram'?'Instagram':'Facebook'}</button>)}</div><span>Last 30 days · change vs previous period</span></div>
  <div className={styles.stats}>{([['Followers','followers'],['Post reach (sum)','postReach'],['Post views','views'],['Post interactions','engagements']] as const).map(([label,key])=>{const change=percentageChange(stats?.[key]??null,stats?.previous?.[key]??null);return <div key={key}><span>{label}</span><strong>{count(stats?.[key])}</strong>{change!==null?<small data-direction={change>0?'up':change<0?'down':'flat'}>{change>0?'↑ +':change<0?'↓ ':''}{change.toFixed(1)}%</small>:<small title="No comparable previous period">—</small>}</div>;})}</div>
  {!stats?<p className={styles.note}>No retained {platform} metrics available.</p>:null}
  <nav aria-label="Client workspace" className={styles.nav}><Link href={`/office?clientId=${clientId}`} scroll={false}>Office</Link>{tabs.map(([label,suffix])=>{const href=root+suffix;const selected=suffix?path.startsWith(href):path===root;return <Link href={href} scroll={false} key={label} aria-current={selected?'page':undefined}>{label}</Link>;})}</nav>
 </header>
}
