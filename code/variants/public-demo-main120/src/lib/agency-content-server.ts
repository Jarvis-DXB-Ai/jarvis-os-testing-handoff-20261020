import 'server-only';
import {clientBrainV2ServerClient as db} from '@/lib/client-brain-v2-server-core';
import {isClientDiscoverable} from '@/lib/client-discovery';
import {dubaiDate,type AgencyContentData,type AgencyScheduleItem} from '@/lib/agency-content';
import {measureServerLoader} from '@/lib/server-performance';
type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==='string'?v:'';
const record=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const key=(client:unknown,id:unknown)=>`${text(client)}:${text(id)}`;
async function read(table:string,columns:string){const all:Row[]=[];for(let offset=0;;offset+=1000){const result=await db.from(table).select(columns).order('id').range(offset,offset+999);if(result.error)throw new Error('Content schedule could not be loaded.');const page=result.data as unknown as Row[];all.push(...page);if(page.length<1000)return all;}}
/** Owner-only, database-only agency recap. No lifecycle changes or provider reads. */
export async function loadAgencyContentData():Promise<AgencyContentData>{return measureServerLoader('agency-content',11,async()=>{
 const [clients,months,content,placements,targets,plans,ideas,lineage,artifacts,observations,executions]=await Promise.all([
 read('clients','id,name,status'),read('social_content_months','id,client_id,month_start'),
 read('social_content_items','id,client_id,social_content_month_id,title,content_kind,format,status,scheduled_date,scheduled_time,final_caption,content_context'),
 read('social_story_placements','id,client_id,social_content_item_id,scheduled_date,scheduled_time,status'),
 read('social_content_platform_targets','id,client_id,social_content_item_id,platform,selected,status,external_post_id,external_post_url'),
 read('social_monthly_content_plans','id,client_id,plan_month,is_current'),
 read('social_monthly_content_plan_items','id,client_id,monthly_plan_id,subject,creative_concept,planned_date,status'),
 read('content_lineage_items','id,client_id,social_content_item_id,monthly_plan_item_id'),
 read('social_monthly_plan_production_artifacts','id,client_id,monthly_plan_id,monthly_plan_item_id,is_selected,status,file_object_id'),
 read('social_performance_post_observations','id,client_id,platform,provider_post_id,published_at,post_type,title,caption_excerpt,thumbnail_path,post_url,observed_at,social_provider_execution_id'),
 read('social_provider_executions','id,client_id,social_content_item_id'),
 ]);
 const clientMap=new Map(clients.map(c=>[text(c.id),text(c.name)||'Unnamed client']));
 const monthMap=new Map(months.map(m=>[key(m.client_id,m.id),text(m.month_start).slice(0,7)]));
 const planMap=new Map(plans.map(p=>[key(p.client_id,p.id),p]));
 const itemMap=new Map(content.map(p=>[key(p.client_id,p.id),p]));
 const executionMap=new Map(executions.map(e=>[key(e.client_id,e.id),key(e.client_id,e.social_content_item_id)]));
 const linkedIdeas=new Set<string>();
 const artifactMap=new Map(artifacts.map(a=>[key(a.client_id,a.id),a]));
 for(const l of lineage)if(itemMap.has(key(l.client_id,l.social_content_item_id)))linkedIdeas.add(key(l.client_id,l.monthly_plan_item_id));
 const selected=new Set(artifacts.filter(a=>a.is_selected&&a.file_object_id&&['generated','selected'].includes(text(a.status))).map(a=>key(a.client_id,a.monthly_plan_item_id)));
 const targetsByItem=new Map<string,Row[]>();
 const representedPosts=new Set<string>();
 for(const target of targets){if(!itemMap.has(key(target.client_id,target.social_content_item_id)))continue;if(target.selected)targetsByItem.set(key(target.client_id,target.social_content_item_id),[...(targetsByItem.get(key(target.client_id,target.social_content_item_id))??[]),target]);for(const id of [target.external_post_id,target.external_post_url])if(id)representedPosts.add(`${key(target.client_id,target.platform)}:${text(id)}`);}
 const placementsByItem=new Map<string,Row[]>();for(const p of placements){const id=key(p.client_id,p.social_content_item_id);placementsByItem.set(id,[...(placementsByItem.get(id)??[]),p]);}
 const items:AgencyScheduleItem[]=[];
 for(const row of content){const clientId=text(row.client_id),id=text(row.id),clientName=clientMap.get(clientId);if(!clientName)continue;
  const context=record(record(row.content_context).lineage);if(context.monthlyPlanItemId)linkedIdeas.add(key(clientId,context.monthlyPlanItemId));const artifact=artifactMap.get(key(clientId,context.individualProductionArtifactId));if(artifact)linkedIdeas.add(key(clientId,artifact.monthly_plan_item_id));
  const base:AgencyScheduleItem={id:`publishing:${id}`,clientId,clientName,title:text(row.title)||'Untitled post',kind:text(row.format)||text(row.content_kind),status:text(row.status),date:text(row.scheduled_date)||null,time:text(row.scheduled_time)?.slice(0,5)||null,month:monthMap.get(key(clientId,row.social_content_month_id))??null,source:'publishing',previewUrl:`/api/clients/${clientId}/content/${id}/preview`,caption:text(row.final_caption)||null,platforms:(targetsByItem.get(key(clientId,id))??[]).map(t=>({name:text(t.platform),status:text(t.status)}))};
  const repeats=row.content_kind==='story'?placementsByItem.get(key(clientId,id))??[]:[];
  if(repeats.length)for(const p of repeats)items.push({...base,id:`story:${text(p.id)}`,date:text(p.scheduled_date)||null,time:text(p.scheduled_time).slice(0,5)||null,status:text(p.status),platforms:base.platforms.map(t=>({name:t.name,status:""}))});else items.push(base);
 }
 for(const row of ideas){const clientId=text(row.client_id),id=text(row.id),clientName=clientMap.get(clientId),plan=planMap.get(key(clientId,row.monthly_plan_id));if(!clientName||!plan||plan.is_current===false||linkedIdeas.has(key(clientId,id)))continue;
 items.push({id:`planner:${id}`,clientId,clientName,title:text(row.subject)||text(row.creative_concept)||'Untitled concept',kind:'feed concept',status:text(row.status),date:text(row.planned_date)||null,time:null,month:text(plan.plan_month).slice(0,7)||null,source:'planner',previewUrl:selected.has(key(clientId,id))?`/api/clients/${clientId}/monthly-plans/${text(plan.id)}/items/${id}/preview`:null,caption:null,platforms:[]});
 }
 const seen=new Set<string>();
 for(const row of observations.sort((a,b)=>text(b.observed_at).localeCompare(text(a.observed_at)))){const clientId=text(row.client_id),clientName=clientMap.get(clientId),identity=`${key(clientId,row.platform)}:${text(row.provider_post_id)}`;if(!clientName||seen.has(identity))continue;seen.add(identity);
  if(representedPosts.has(identity)||representedPosts.has(`${key(clientId,row.platform)}:${text(row.post_url)}`)||itemMap.has(executionMap.get(key(clientId,row.social_provider_execution_id))??''))continue;
  const stamp=text(row.published_at),valid=stamp&&Number.isFinite(Date.parse(stamp)),date=valid?dubaiDate(stamp):null;
  items.push({id:`observed:${text(row.id)}`,clientId,clientName,title:text(row.title)||text(row.caption_excerpt)||'Published post',kind:text(row.post_type),status:'Published',date,time:valid?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp)):null,month:date?.slice(0,7)??null,source:'observed',previewUrl:row.thumbnail_path?`/api/clients/${clientId}/social-performance/thumbnail?path=${encodeURIComponent(text(row.thumbnail_path))}`:null,caption:text(row.caption_excerpt)||null,platforms:[{name:text(row.platform),status:'Published'}]});
 }
 items.sort((a,b)=>(a.date??'9999').localeCompare(b.date??'9999')||(a.time??'99').localeCompare(b.time??'99')||a.clientName.localeCompare(b.clientName)||a.id.localeCompare(b.id));
 return {generatedAt:new Date().toISOString(),today:dubaiDate(new Date()),clients:clients.map(c=>({id:text(c.id),name:clientMap.get(text(c.id))!,hidden:c.status==='archived'||!isClientDiscoverable(text(c.id))})).sort((a,b)=>a.name.localeCompare(b.name)),items};
});}
