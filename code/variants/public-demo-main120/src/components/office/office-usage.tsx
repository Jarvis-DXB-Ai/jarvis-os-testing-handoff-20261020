'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {OfficeUsage as Usage} from '@/lib/office-usage-server';
import styles from './office-usage.module.css';
const when=(s:string)=>new Date(s).toLocaleString('en-GB',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' GST';
export function useOfficeUsage(){
 const [data,setData]=useState<Usage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[now,setNow]=useState(0);
 const pending=useRef(false);
 const load=useCallback(async()=>{if(pending.current)return;pending.current=true;setLoading(true);try{const r=await fetch('/api/office/usage',{cache:'no-store'}),v=await r.json();if(!r.ok)throw new Error(v.error??'Usage unavailable.');setData(v);setError('');}catch(e){setError(e instanceof Error?e.message:'Usage unavailable.');}finally{pending.current=false;setLoading(false);setNow(Date.now());}},[]);
 useEffect(()=>{const initial=setTimeout(()=>void load(),0);const visible=()=>{if(document.visibilityState==='visible'){setNow(Date.now());void load();}};const timer=setInterval(visible,120000);document.addEventListener('visibilitychange',visible);return()=>{clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[load]);
 return {data,error,loading,load,now};
}
type UsageState=ReturnType<typeof useOfficeUsage>;
export function OfficeUsageSummary({usage,onOpen}:{usage:UsageState;onOpen:()=>void}){
 const {data,error,now}=usage;
 const stale=!!data&&now-Date.parse(data.checkedAt)>300000;
 return <button className={styles.quickUsage} onClick={onOpen} aria-label="Open subscription plans and usage" title="Account-wide quota shared with all chats. The lowest remaining window for each provider is shown. Open for plans, all limits and reset times.">
  <span className={styles.quickHeading}>Plans & usage <span>{error||stale?'Check meters':'Account-wide'} ↗</span></span>
  <span className={styles.quickProviders}>{['codex','claude'].map(id=>{
   const p=data?.providers.find(p=>p.provider===id);
   const w=p?.status==='available'?p.windows.reduce<(typeof p.windows)[number]|undefined>((lowest,w)=>!lowest||w.remainingPercent<lowest.remainingPercent?w:lowest,undefined):undefined;
   const expired=!!w?.resetsAt&&Date.parse(w.resetsAt)<=now;
   const known=!!w&&!error&&!stale&&!expired;
   const value=known?Number(w.remainingPercent.toFixed(1)):null;
   const detail=known?`${p?.name} ${p?.plan??''}: ${value}% remaining · ${w.label}${w.resetsAt?' · resets '+when(w.resetsAt):''} · checked ${when(data!.checkedAt)}`:error?'Account meter unavailable. Open Plans & usage to retry.':!data?'Reading account meter':expired||stale?'Refresh needed':p?.message??'Account meter unavailable';
   return <span key={id} className={styles.quickProvider} title={detail} data-low={value!==null&&value<=20}>
    <span>{id==='codex'?'Codex':'Claude'} <strong>{value!==null?`${value}% left`:!data&&!error?'…':expired||stale?'Refresh':'Unknown'}</strong></span>
    <span className={styles.quickTrack} aria-hidden="true">{value!==null&&<span style={{width:`${value}%`}}/>}</span>
   </span>;
  })}</span>
 </button>;
}
export function OfficeUsage({clientId,usage}:{clientId?:string;usage:UsageState}){
 const {data,error,loading,load}=usage;
 const [provider,setProvider]=useState('all');
 const activity=data?.activity.filter(r=>(!clientId||r.clientId===clientId)&&(provider==='all'||r.provider===provider))??[];
 return <section className={styles.panel} aria-label="Subscription plans and usage"><header><div><small>ACCOUNT CAPACITY / OFFICE ACTIVITY</small><h2>Plans & usage</h2><p>See remaining subscription quota and which agents are using each plan.</p></div><button disabled={loading} onClick={()=>void load()}>{loading?'Reading account meters…':'Refresh usage'}</button></header>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Reading Codex and Claude account meters…</p>}{data&&<><p className={styles.note}>Account quota is shared with your other chats and apps. Office tokens below cover recorded Office runs only. Checked {when(data.checkedAt)} · meters refresh at most once a minute.</p><div className={styles.providers}>{data.providers.map(p=><article key={p.provider}><div className={styles.providerHead}><h3>{p.name}</h3><span>{p.plan??'Plan unknown'}</span></div><p>{p.message}</p>{p.status==='unavailable'&&<strong>Remaining quota unavailable</strong>}{p.windows.map((w,i)=><div className={styles.window} key={w.label+'-'+i}><div><strong>{Number(w.remainingPercent.toFixed(1))}% <small>remaining</small></strong><span>{w.label}</span></div><progress value={w.remainingPercent} max={100} aria-label={`${p.name} ${w.label}: ${w.remainingPercent}% remaining`}/><small>{Number(w.usedPercent.toFixed(1))}% used{w.resetsAt?' · resets '+when(w.resetsAt):' · reset time unavailable'}</small></div>)}{p.resetCredits!==null&&<p>{p.resetCredits} account reset credits available</p>}<small>{p.source}</small><a href={p.provider==='claude'?'https://claude.ai/settings/usage':'https://chatgpt.com/codex/settings/usage'} target="_blank" rel="noreferrer">Open account usage ↗</a></article>)}</div><div className={styles.activityHead}><div><h3>Agent activity</h3><p>{clientId?'This client’s':'Whole Office'} acknowledged model runs · saved receipts, including failed runs.</p></div><select aria-label="Activity provider" value={provider} onChange={e=>setProvider(e.target.value)}><option value="all">Both providers</option><option value="codex">Codex</option><option value="claude">Claude</option></select></div><div className={styles.totals}><span><strong>{activity.length}</strong> recorded calls</span><span><strong>{activity.reduce((n,r)=>n+(r.inputTokens??0),0).toLocaleString()}</strong> recorded input tokens</span><span><strong>{activity.reduce((n,r)=>n+(r.outputTokens??0),0).toLocaleString()}</strong> recorded output tokens</span></div><div className={styles.table}><table><thead><tr><th>Agent / task</th><th>Model</th><th>Input / output tokens</th><th>Status / saved time</th></tr></thead><tbody>{activity.map(r=><tr key={r.runId}><td><strong>{r.role}</strong><small>{r.brief}</small></td><td>{r.model}<small>{r.provider}</small></td><td>{r.inputTokens?.toLocaleString()??'Unknown'} / {r.outputTokens?.toLocaleString()??'Unknown'}</td><td>{r.status}<small>{when(r.at)}</small></td></tr>)}</tbody></table></div><p className={styles.note}>Recorded tokens are activity, not a calculation of subscription quota. Missing usage stays unknown. No credit reset, paid API fallback or plan change is triggered by this view.</p></>}</section>;
}
