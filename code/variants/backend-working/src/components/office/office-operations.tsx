'use client';
import {useEffect,useState} from 'react';
import type {OfficeEnvironment} from '@/lib/office-environment.mjs';
import type {PaperclipOfficeSnapshot} from '@/lib/office-paperclip';
import styles from './office-campus.module.css';
export function OfficeOperations({clientName,environment,snapshot,onSelect}:{clientName?:string;environment:OfficeEnvironment;snapshot:PaperclipOfficeSnapshot|null;onSelect:(id:string,jobId?:string)=>void}){
 const [clock,setClock]=useState('—');
 useEffect(()=>{const update=()=>{if(document.visibilityState==='visible')setClock(new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai',hour12:false}));};update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[]);
 const event=environment.events[0];
 return <div className={styles.operations}>
  <header className={styles.operationsHead}><div><span className={styles.kicker}>{clientName?clientName.toUpperCase()+' / CLIENT COMMAND':'JARVIS / AGENCY COMMAND'}</span><h2>{clientName?clientName+' Office':'Headquarters'}<span>.01</span></h2></div><div className={styles.connection} data-live={environment.fresh}><span><i/>{environment.fresh?'Live board':snapshot?.status==='connected'?'Board stale':'Connecting'}</span><time>{clock}<small> GST</small></time></div></header>
  <div className={styles.telemetry} aria-label="Live Office operations"><div><strong>{environment.registered??'—'}</strong><span>Registered roles</span></div><div data-active={environment.runningAgentIds.length>0}><strong>{environment.fresh?environment.runningAgentIds.length:'—'}</strong><span>Running now</span></div><div><strong>{environment.queued}</strong><span>Queued parts</span></div><div><strong>{environment.review}</strong><span>Your review</span></div><div data-attention={environment.attention>0}><strong>{environment.attention}</strong><span>Task attention</span></div></div>
  <div className={styles.eventStrip} aria-label="Latest recorded activity"><span className={styles.eventLabel}>LAST RECEIPT</span>{event?<button onClick={()=>onSelect(event.agentId,event.jobId)} title={`${event.actor} · ${event.action} · ${event.status}`}><span className={styles.eventDot} data-live={event.live}/><strong>{event.actor}</strong><span>{event.action} · {event.status}</span><time>{new Date(event.at).toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST</time><span>↗</span></button>:<span className={styles.noEvent}>No recorded model activity in this office.</span>}</div>
 </div>;
}
