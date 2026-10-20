// This selects a retrieval profile only. The model planner still chooses agents,
// dependencies and parallelism from the actual scoped runtime catalogue.
const profiles={
 onboarding:/\bonboard(?:ing)?\b/i,
 caption:/\b(captions?|social media|instagram|carousels?|stories|linkedin posts?|facebook posts?)\b/i,
 photo:/\b(photos?|photograph\w*|images?|food studio|drink studio)\b/i,
 design:/\b(design system|brand(?:ing)? guidelines|graphic design|logos?|presentations?|pitch deck|visual identity)\b/i,
 video:/\b(videos?|reels?|videograph\w*|footage|motion graphics)\b/i,
 web:/\b(websites?|web design|backend|frontend|seo|landing pages?)\b/i,
 ads:/\b(ads?|advertis\w*|paid media|ad campaign|roas)\b/i,
 email:/\b(emails?|newsletters?|mailchimp|email marketing)\b/i,
 support:/\b(customer support|customer service|whatsapp|inbox|dm[’']?s|crm)\b/i,
 finance:/\b(financ\w*|invoic\w*|bookkeep\w*|cash flow|receivables|billing|bookings?)\b/i,
 report:/\b(reports?|analytics|performance|metrics)\b/i,
 strategy:/\b(strateg\w*|competitor\w*|research|positioning|marketing plan|tone of voice|brand voice|verbal identity|moodboard\w*)\b/i,
};
export const defaultCooCriteria=[
 'The deliverable answers the entire brief with actionable, complete work.',
 'Facts are grounded in the provided context; missing facts and unperformed actions are explicit.',
];
export function cooRetrievalProfile(brief,fallback='internal'){
 const matches=Object.entries(profiles).filter(([,pattern])=>pattern.test(brief)).map(([id])=>id);
 return matches.length===1?matches[0]:matches.length?'strategy':fallback;
}
export function cooMessageInput({id,brief,context='',criteria=defaultCooCriteria,contextRequest}){
 const message=typeof brief==='string'?brief.trim():'';
 if(!message||message.length>6000)throw new Error('Write a message of 1–6000 characters to your COO.');
 const profile=cooRetrievalProfile(message,contextRequest.taskType);
 // The existing internal audit allocation remains draft analysis only.
 const taskType=contextRequest.foundationId.startsWith('audit-')&&!['internal','strategy','web','report'].includes(profile)?'strategy':profile;
 return {id,brief:message,context,criteria,autoContext:true,departmentId:null,contextRequest:{...contextRequest,taskType}};
}
export function requireOfficeContextRevision(input,bundle){
 if(input?.autoContext===true)return; // The server has just read and will persist this exact bundle.
 if(!input||input.contextRevision!==bundle.revision)throw new Error('Context changed or was not previewed. Preview the selected foundation again before assigning.');
}
export function resolveCooFoundation(brief,request,foundations){
 const current=foundations.find(f=>f.id===request.foundationId&&f.status!=='retired');
 if(!current)throw new Error('The saved Office foundation is unavailable.');
 const clients=foundations.filter(f=>f.scope.kind==='client'&&f.status!=='retired');
 const matches=clients.filter(f=>{
  const name=f.title.split('·')[0].trim().toLowerCase();
  if(name.length<3)return false;
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])','i').test(brief);
 });
 if(matches.some(f=>!f.scope.clientId))throw new Error('The named client needs a connected Office setup before assigning team work.');
 const ids=[...new Set(matches.map(f=>f.scope.clientId))];
 if(ids.length>1)throw new Error('This message names more than one client. Send one client assignment at a time.');
 if(current.scope.kind==='client'&&ids.length&&current.scope.clientId!==ids[0])throw new Error('This message names a different client from the current client Office.');
 let foundation=current;
 if(current.scope.kind!=='client'&&ids.length){
  const options=clients.filter(f=>f.scope.clientId===ids[0]);
  const preferred=options.filter(f=>f.status==='approved'&&!f.id.startsWith('audit-'));
  const audits=options.filter(f=>f.id.startsWith('audit-'));
  const pool=preferred.length?preferred:audits.length?audits:options;
  if(pool.length!==1)throw new Error('The named client has no unambiguous current Office foundation.');
  foundation=pool[0];
 }
 const taskType=foundation.id.startsWith('audit-')&&!['internal','strategy','web','report'].includes(request.taskType)?'strategy':request.taskType;
 return {foundationId:foundation.id,taskType,mode:foundation.status==='approved'&&!foundation.id.startsWith('audit-')?'approved':'draft'};
}
