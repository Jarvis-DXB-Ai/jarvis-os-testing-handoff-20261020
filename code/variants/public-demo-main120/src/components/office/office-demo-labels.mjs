// Short display names; the full registered role remains on the accessible agent button.
const roleNames={
 'Head of Social Media':'Social Lead','Head of Finance':'Finance Lead','Head of Web Design':'Web Lead','Head of Ads':'Ads Lead','Head of Email Marketing':'Email Lead','Head of Customer Support & CRM':'Support Lead','Content Creative Director':'Content Lead','Graphic Design Creative Director':'Design Lead',
 'Content & Calendar Strategist':'Strategy','Copywriter & Content Adaptation':'Copywriter','Performance & Measurement Analyst':'Analytics','Publishing & Scheduling Specialist':'Publishing','Instagram Manager':'Instagram','LinkedIn Manager':'LinkedIn','Facebook Manager':'Facebook','Social Media QA':'Social QA',
 'AI Photographer':'Photographer','AI Videographer':'Videographer','Video Editor & Motion Designer':'Video Editor','Photo & Video QA':'Photo QA','Brand Identity & Visual Systems Designer':'Brand Design','Presentation Designer':'Slides','Brand Voice Specialist':'Brand Voice','Creative Quality Reviewer':'Creative QA',
 'Web & Backend Engineer':'Engineer','Web Designer':'Designer','Integration Engineer':'Integrations','SEO & Website Auditor':'SEO Audit','Web & Backend QA':'Web QA','Paid Media Strategist':'Ad Strategy','Meta Ads Specialist':'Meta Ads','LinkedIn Ads Specialist':'LinkedIn Ads','YouTube Ads Specialist':'YouTube Ads','TikTok Ads Specialist':'TikTok Ads','Ads & Tracking QA':'Ads QA',
 'Email Copy & Automation Specialist':'Email Copy','Email Designer':'Email Design','Email Marketing QA':'Email QA','Social DM Support Specialist':'Social DMs','WhatsApp Support Specialist':'WhatsApp','CRM Specialist':'CRM','Bookings Coordinator':'Bookings','Customer Support QA':'Support QA',
 'Bookkeeping & Document Specialist':'Bookkeeping','Billing & Receivables Specialist':'Billing','Scope & Pricing Analyst':'Scope','Profitability & Cash-flow Analyst':'Cash Flow','Software & AI Spend Analyst':'AI Spend','Finance QA':'Finance QA',
};
export function demoRoleLabel(name){return roleNames[name]??name.replace(/ Specialist| Coordinator| Manager/g,'').replace(/^Head of /,'Lead · ').slice(0,14);}

// Explicit department selection controls captions; zoom alone never reveals them.
export function demoAgentNamesEnabled(department,zoom){return Number.isFinite(zoom)&&['social','email','content','design','web','ads','support','finance','operations','knowledge'].includes(department);}
export function demoInViewAgents(items,width,height){return items.filter(a=>a.visible===true&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.x>=0&&a.x<=width&&a.y>=0&&a.y<=height);}

/** An owner marker keeps responsibility with its preceding agent or catalogue head. */
export function demoWaitingRoleIds(waiting,registeredRoles,departmentHeads=[]){
 const valid=new Set(registeredRoles),roles=[];
 for(const job of waiting){
  const current=job.current;
  if(job.status!=='approval'||current?.status!=='approval'||current.kind!=='approval')continue;
  let role=current.role;
  if(role==='owner')role=job.timeline?.slice(0,current.index??0).reverse().find(stage=>valid.has(stage.role))?.role??departmentHeads.find(head=>head.department===job.department)?.head;
  if(valid.has(role))roles.push(role);
 }
 return [...new Set(roles)];
}

/** Fixed workstation anchor; actor poses, work status and selection never enter it. */
export function demoWorkstationLabelAnchor(seat,monitor,index){
 if(!monitor?.length)return {x:seat.x,y:seat.y+2.85,z:seat.z};
 return {x:monitor.reduce((sum,p)=>sum+p.x,0)/monitor.length,y:Math.max(...monitor.map(p=>p.y))+.9+(index%2)*.45,z:monitor.reduce((sum,p)=>sum+p.z,0)/monitor.length};
}

// Fixed design offsets calibrated across normal390/471/desktop department views.
const labelOffsets={"phone":{"margin":[4,0],"web-research":[4,0],"cmo":[0,-24],"copy":[-36,0],"scheduler":[0,-36],"instagram":[0,-72],"linkedin":[0,-64],"social-qa":[0,-48],"image-prompts":[0,-48],"video":[-44,0],"media":[-48,0],"videographer":[0,-72],"cto":[-4,0],"audit":[0,-36],"web-qa":[0,-16],"paid-ads":[0,-12],"ads-lead":[0,-8],"meta-ads":[-28,0],"ads-qa":[0,-60],"cfo":[-4,0],"bookkeeping":[0,-20],"billing":[0,-32],"subscriptions":[0,-36],"coo":[-24,0],"delivery":[0,-60],"success":[28,-36],"proposal":[0,-64],"workflow-architect":[0,-8],"brand-strategist":[0,-48],"competitors":[-4,-16],"librarian":[0,-52],"evaluation":[4,0],"knowledge":[-24,-36],"research-qa":[0,-40]},"desktop":{"cmo":[0,-36],"copy":[-32,0],"linkedin":[0,-40],"social-qa":[0,-24],"image-prompts":[0,-24],"video":[0,-16],"media":[0,-28],"videographer":[28,-20],"content-qa":[0,-36],"paid-ads":[0,-8],"billing":[-28,0],"coo":[-24,0],"delivery":[0,-36],"success":[0,-32],"proposal":[52,-40],"workflow-architect":[0,-32],"brand-strategist":[0,-20],"competitors":[-4,0],"librarian":[-32,-40],"knowledge":[0,-32],"research-qa":[60,-20]}};
export function demoLabelOffset(role,phone){return labelOffsets[phone?'phone':'desktop'][role]??[0,0];}
