'use client';
import {useState} from 'react';
import Sidebar from '@/components/layout/sidebar';
import {PostPreview} from '@/components/clients/social-post-card';
import {scheduleSection,scheduleStatusTone,type AgencyContentData,type AgencyScheduleItem} from '@/lib/agency-content';
import styles from './agency-content.module.css';

const readable=(value:string)=>value.replaceAll('_',' ');
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
const groups=[
 {id:'today',title:'Today',note:'Planned or recorded for today.'},
 {id:'upcoming',title:'Coming up',note:'Future dates across your clients.'},
 {id:'past',title:'Earlier',note:'Published posts and unfinished items from past dates.'},
 {id:'undated',title:'Without a date',note:'Posts and concepts awaiting a date.'},
];
function PostCard({item}:{item:AgencyScheduleItem}){
 // Imported generator filenames are provenance, not useful editorial titles.
 // Keep the original visible in details; never invent a subject from the image.
 const fileTitle=/^hf[ _]\d{8}[ _]/i.test(item.title);
 const title=fileTitle?`${item.kind==='story'?'Story':item.kind==='reel'?'Reel':'Feed'} post`:item.title;
 return <article className={styles.card}>
  <div className={styles.preview}><PostPreview src={item.previewUrl}/></div>
  <div className={styles.cardBody}>
   <div className={styles.cardTop}><p className={styles.client}>{item.clientName}</p><span className={styles.status} data-tone={scheduleStatusTone(item.status)}>{readable(item.status)||'Status unavailable'}</span></div>
   <h3>{title}</h3>
   <div className={styles.metadata}><span className={styles.meta}>{readable(item.kind)}</span><span className={styles.time}>{item.time??'Time not set'}{item.time?' · Dubai':''}</span></div>
   <p className={styles.channels}>{item.platforms.length?item.platforms.map(p=>`${readable(p.name)}${p.status?` · ${readable(p.status)}`:''}`).join(' / '):'Platforms not selected'}</p>
   <details className={styles.detail}><summary>Post details<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"><path d="m4 6 4 4 4-4"/></svg></summary><div className={styles.detailBody}>
    {fileTitle?<p><strong>Source name</strong><br/>{item.title}</p>:null}
    <p>{item.source==='planner'?'Planned concept — not a scheduled post.':item.source==='observed'?'Published post from saved social analytics.':'Saved publishing record. A planned date alone does not confirm scheduling.'}</p>
    {item.caption?<p className={styles.caption}>{item.caption}</p>:<p>No caption saved.</p>}
   </div></details>
  </div>
 </article>;
}
function ScheduleSection({id,title,note,items}:{id:string;title:string;note:string;items:AgencyScheduleItem[]}){
 const [limit,setLimit]=useState(30);
 const shown=items.slice(0,limit),dates=[...new Set(shown.map(p=>p.date))];
 return <section id={id} className={styles.section} aria-labelledby={`${id}-heading`}>
  <header><h2 id={`${id}-heading`}>{title}<span>{items.length}</span></h2><p>{note}</p></header>
  {items.length?dates.map(day=><div className={styles.day} key={day??'undated'}>
   {day?<h3 className={styles.dayLabel}><time dateTime={day}>{dateLabel(day)}</time></h3>:null}
   <div className={styles.cards}>{shown.filter(item=>item.date===day).map(item=><PostCard key={item.id} item={item}/>)}</div>
  </div>):<p className={styles.empty}>No posts in this section.</p>}
  {items.length>limit?<button type="button" className={styles.more} onClick={()=>setLimit(limit+30)}>Show more <span>{items.length-limit} remaining</span></button>:null}
 </section>;
}
export default function AgencyContentWorkspace({data}:{data:AgencyContentData}){
 const [month,setMonth]=useState(data.today.slice(0,7)),[clientId,setClientId]=useState('all'),[kind,setKind]=useState('all'),[query,setQuery]=useState(''),[showHidden,setShowHidden]=useState(false);
 const clients=data.clients.filter(c=>showHidden||!c.hidden),ids=new Set(clients.map(c=>c.id));
 const months=[...new Set([data.today.slice(0,7),...data.items.flatMap(item=>item.date?[item.date.slice(0,7)]:item.month?[item.month]:[])])].sort().reverse();
 const needle=query.trim().toLowerCase();
 const filtered=data.items.filter(item=>ids.has(item.clientId)&&(clientId==='all'||item.clientId===clientId)&&(month==='all'||(item.date?.slice(0,7)??item.month)===month||(item.date===null&&item.month===null))&&(kind==='all'||(kind==='feed'?['feed','post','carousel','feed concept'].includes(item.kind):item.kind===kind))&&(!needle||`${item.title} ${item.clientName} ${item.caption??''}`.toLowerCase().includes(needle)));
 const clientCount=new Set(filtered.map(p=>p.clientId)).size;
 const sections=groups.map(g=>({...g,items:filtered.filter(item=>scheduleSection(item,data.today)===g.id)}));
 return <main className={styles.shell}><Sidebar/><div className={styles.content}>
  <header className={styles.header}><div><p className={styles.eyebrow}>Company overview</p><h1>Content</h1><p className={styles.subtitle}>Every client. One schedule.</p></div><span className={styles.readOnly}>Overview only <span aria-hidden="true">·</span> Dubai time</span></header>
  <div className={styles.controls}>
   <label>Month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All months</option>{months.map(m=><option key={m} value={m}>{new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${m}-01T00:00:00Z`))}</option>)}</select></label>
   <label>Client<select value={clientId} onChange={e=>setClientId(e.target.value)}><option value="all">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Format<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All formats</option><option value="feed">Feed & carousels</option><option value="story">Stories</option><option value="reel">Reels</option></select></label>
   <label className={styles.search}>Search<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Post or client name"/></label>
  </div>
  <div className={styles.overview}><p role="status"><strong>{filtered.length}</strong> {filtered.length===1?'post / concept':'posts / concepts'} <span aria-hidden="true">·</span> <strong>{clientCount}</strong> {clientCount===1?'client':'clients'}</p><label><input type="checkbox" checked={showHidden} onChange={e=>{setShowHidden(e.target.checked);setClientId('all');}}/> Include hidden / archived clients</label></div>
  {filtered.length>0?<nav className={styles.jump} aria-label="Schedule sections">{sections.map(g=><a key={g.id} href={`#${g.id}`} data-section={g.id}><span>{g.title}</span><strong>{g.items.length}</strong></a>)}</nav>:null}
  {!filtered.length?<div className={styles.empty}><h2>No posts match this view</h2><p>Try another month, client or format.</p><button className={styles.more} type="button" onClick={()=>{setMonth(data.today.slice(0,7));setClientId('all');setKind('all');setQuery('');setShowHidden(false);}}>Reset filters</button></div>:sections.map(g=><ScheduleSection key={`${g.id}:${month}:${clientId}:${kind}:${query}:${showHidden}`} {...g}/>)}
  <footer className={styles.footer}>Saved company schedule · loaded {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(data.generatedAt))}. Posts created outside Jarvis appear once their analytics have been retained.</footer>
 </div></main>;
}
