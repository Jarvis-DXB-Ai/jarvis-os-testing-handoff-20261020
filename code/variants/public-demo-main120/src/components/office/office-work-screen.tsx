import type {OfficeTeamTask} from '@/lib/office-team-contract';
import styles from './office-work-screen.module.css';
type Step=OfficeTeamTask['steps'][number];
const shorten=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
export function workScreenKind(role:string|null|undefined){
 if(['design-system','creative-director','creative-qc','image-prompts','metadata','presentations','web-designer','email-design'].includes(role??''))return 'layout';
 if(['video','media','repurpose','videographer','content-qa'].includes(role??''))return 'edit';
 if(['analytics','paid-ads','bookkeeping','billing','receipts','cash','margin','pricing','subscriptions','model-cost','cfo','ads-analyst','ads-lead','meta-ads','linkedin-ads','youtube-ads','tiktok-ads','ads-qa','finance-qa'].includes(role??''))return 'report';
 if(['coo','cmo','cto','brand-strategist','competitors','workflow-architect','capacity','audit'].includes(role??''))return 'plan';
 return 'document';
}
export function WorkScreenArtwork({role,step,brief,working=false}:{role:string|null|undefined;step?:Step;brief?:string;working?:boolean}){
 const kind=workScreenKind(role),content=(step?.output??step?.assignment??brief??'').replace(/[#*`]/g,'').trim();
 const lines=content.split(/\n+/).filter(Boolean).slice(0,3);
 const label=step?.output?'SAVED TEXT':step?'ASSIGNMENT':brief?'TASK BRIEF':'NO ASSIGNMENT';
 return <g aria-hidden="true" className={working?styles.working:undefined}>
  <rect width="100" height="64" rx="3" fill="var(--j-panel)"/>
  <rect width="100" height="11" rx="3" fill="var(--j-raised)"/><circle cx="5" cy="5.5" r="1.5" fill="var(--j-recommend)"/><text x="10" y="7" fill="var(--j-text-3)" fontSize="4.2" letterSpacing=".4">{label}</text>
  <path d="M23 11V64" stroke="var(--j-hair-2)"/><rect x="4" y="16" width="14" height="3" rx="1" fill="var(--j-rule)"/><path d="M4 25H17M4 32H13M4 39H17M4 46H11" stroke="var(--j-text-4)" strokeWidth="1.5"/>
  {kind==='layout'?<><rect x="29" y="16" width="29" height="31" rx="1" fill="var(--j-brand-ground-2)" stroke="var(--j-hair-2)"/><rect x="33" y="21" width="21" height="13" rx="1" fill="var(--j-brand-ground)"/><path d="M33 39H51M33 43H44" stroke="var(--j-recommend)" strokeWidth="1.5"/><rect x="63" y="16" width="30" height="31" rx="1" fill="var(--j-raised)"/><path d="M67 22H88M67 28H84M67 34H88M67 40H77" stroke="var(--j-text-3)"/><text x="29" y="55" fill="var(--j-text-3)" fontSize="4.3">LAYOUT BRIEF · NOT A RENDER</text></>:
   kind==='edit'?<><rect x="29" y="16" width="65" height="18" rx="1" fill="var(--j-raised)"/><text x="33" y="24" fill="var(--j-text-2)" fontSize="4.5">{shorten(lines[0]??'Edit plan awaits footage',23)}</text><text x="33" y="30" fill="var(--j-text-4)" fontSize="4">SCRIPT / CUTS / AUDIO</text><path d="M29 40H94M29 48H94M29 56H94" stroke="var(--j-hair-2)"/><rect x="30" y="38" width="18" height="5" rx="1" fill="var(--j-brand-ground)"/><rect x="50" y="38" width="21" height="5" rx="1" fill="var(--j-rule)"/><rect x="73" y="38" width="19" height="5" rx="1" fill="var(--j-brand-ground)"/><rect x="30" y="46" width="41" height="5" rx="1" fill="var(--j-rule)"/><text x="29" y="62" fill="var(--j-text-3)" fontSize="4">EDIT PLAN · NOT RENDERED VIDEO</text></>:
   kind==='report'?<><text x="29" y="21" fill="var(--j-text-2)" fontSize="4.3">{shorten(lines[0]??'Report awaits source data',26)}</text><path d="M29 27H94M29 36H94M29 45H94M29 54H94M61 27V54M79 27V54" stroke="var(--j-hair-2)"/>{[33,42,51].map((y,i)=><g key={y}><text x="30" y={y} fill="var(--j-text-3)" fontSize="3.9">{shorten(lines[i]??'Source needed',15)}</text><text x="66" y={y} fill="var(--j-text-4)" fontSize="4">—</text><text x="85" y={y} fill="var(--j-text-4)" fontSize="4">—</text></g>)}</>:
   kind==='plan'?<><path d="M42 27H79M42 27V47H79M61 27V47" fill="none" stroke="var(--j-rule)"/>{[[30,17],[68,17],[30,39],[68,39]].map(([x,y],i)=><g key={i}><rect x={x} y={y} width="25" height="15" rx="2" fill="var(--j-raised)" stroke="var(--j-hair-2)"/><path d={`M${x+4} ${y+6}h17m-17 4h10`} stroke={i===0?'var(--j-recommend)':'var(--j-text-4)'} strokeWidth="1.3"/></g>)}<text x="29" y="62" fill="var(--j-text-3)" fontSize="4.2">{shorten(lines[0]??'Strategy / dependencies',27)}</text></>:
   <>{lines.length?lines.map((line,i)=><text key={i} x="29" y={21+i*10} fill="var(--j-text-2)" fontSize="4.4">{shorten(line,26)}</text>):<text x="29" y="23" fill="var(--j-text-4)" fontSize="4.5">Ready for a scoped task</text>}<path d="M29 48H92M29 54H80" stroke="var(--j-rule)" strokeWidth="1.5"/><rect x="29" y="58" width="1" height="4" fill="var(--j-recommend)" className={working?styles.cursor:undefined}/></>}
 </g>;
}
export function OfficeWorkScreen({role,step,brief,working=false}:{role:string|null|undefined;step?:Step;brief?:string;working?:boolean}){
 return <div className={styles.preview}><svg viewBox="0 0 100 64" role="img" aria-label={`${workScreenKind(role)} view of ${step?.output?'saved text':step?'assigned work':'task context'}`}><WorkScreenArtwork role={role} step={step} brief={brief} working={working}/></svg><p>{step?.output?'Saved text preview':step?'Assignment preview':'No specialist assignment'} · {workScreenKind(role)==='layout'?'creative brief':workScreenKind(role)==='edit'?'edit plan':'work document'}</p>{step?.output&&<blockquote>{shorten(step.output.replace(/[#*`]/g,''),650)}</blockquote>}</div>;
}
