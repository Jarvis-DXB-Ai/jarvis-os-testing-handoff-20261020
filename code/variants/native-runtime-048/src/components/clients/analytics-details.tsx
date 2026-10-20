'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {analyticsMetricLabel, type AnalyticsResource} from '@/lib/social-analytics-catalog';
import styles from './client-suite.module.css';
const scalar=(value:unknown)=>value==null?'Unavailable':typeof value==='number'?new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value):typeof value==='boolean'?(value?'Yes':'No'):String(value);
export function AnalyticsData({value}:{value:unknown}) {
 const [limit,setLimit]=useState(20);
 if(Array.isArray(value))return value.length?<div>{value.slice(0,limit).map((item,index)=><div className={styles.analyticsEntry} key={index}><AnalyticsData value={item}/></div>)}{value.length>limit?<button className={styles.textLink} onClick={()=>setLimit(limit+40)} type="button">Show more ({value.length-limit} remaining)</button>:null}</div>:<p>No data returned.</p>;
 if(value&&typeof value==='object'&&Object.keys(value).length===1&&'total' in value)return <span>{scalar(value.total)}</span>;
 if(value&&typeof value==='object')return <dl className={styles.metricList}>{Object.entries(value).map(([key,item])=><div className={item&&typeof item==='object'&&!(Object.keys(item).length===1&&'total' in item)?styles.analyticsNested:undefined} key={key}><dt>{analyticsMetricLabel(key)}</dt><dd>{item&&typeof item==='object'?<AnalyticsData value={item}/>:scalar(item)}</dd></div>)}</dl>;
 return <span>{scalar(value)}</span>;
}
export function AnalyticsResourceCard({resource}:{resource:AnalyticsResource}) {
 const [open,setOpen]=useState(false);
 return <details className={styles.details} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{resource.title} · {resource.status==='available'?'Saved':resource.status==='error'?'Refresh failed':'Unavailable'}</summary>{open?<><p>{resource.scope}</p><p className={styles.legend}>Fetched {new Date(resource.fetchedAt).toLocaleString('en-GB')}. {resource.reason}</p>{resource.status==='available'?<AnalyticsData value={resource.data}/>:null}</>:null}</details>;
}
export function AnalyticsRefresh({clientId}:{clientId:string}) {
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function refresh(){setBusy(true);setMessage('');try {const response=await fetch(`/api/clients/${clientId}/social-performance`,{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Refresh failed.');const resources=(Object.values(data.performance.platforms) as Array<{current?:{analyticsResources?:AnalyticsResource[]}}>).flatMap(p=>p.current?.analyticsResources??[]);const failed=resources.filter(r=>r.status!=='available').length;setMessage(failed?`Saved available analytics. ${failed} reports were unavailable; expand them for details.`:'Analytics refreshed.');router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'Refresh failed.');}finally{setBusy(false);}}
 return <div><button type="button" className={styles.textLink} disabled={busy} onClick={refresh}>{busy?'Refreshing Zernio…':'Refresh analytics'}</button><p role="status">{message}</p></div>;
}
export function PostAnalyticsDetails({clientId,observationId,details}:{clientId:string;observationId:string;details:Record<string,unknown>}) {
 const [data,setData]=useState(details);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function refresh(){setBusy(true);try{const r=await fetch(`/api/clients/${clientId}/social-performance/posts/${observationId}`,{method:'POST'});const result=await r.json();if(!r.ok)throw new Error(result.error||'Unable to fetch post history.');setData(result.details);setMessage('Post reports saved.');}catch(e){setMessage(e instanceof Error?e.message:'Unable to fetch post history.');}finally{setBusy(false);}}
 return <><AnalyticsData value={data}/><p className={styles.legend}>Provider rates can use different denominators. Reel watch times are milliseconds; skip rate is estimated. A provider zero may indicate an unsupported media/login metric.</p><button type="button" className={styles.textLink} disabled={busy} onClick={refresh}>{busy?'Refreshing post reports…':'Refresh post timeline & extra reports'}</button><p role="status">{message}</p></>;
}
