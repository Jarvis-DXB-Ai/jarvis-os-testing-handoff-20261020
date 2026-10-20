// Presentation-only prospective workflows. No account, provider or task schema changes.
const additions=[
 {id:'figma',name:'Figma',purpose:'Illustrative design-system, page-layout and handoff reviews for the fictional project.',departments:['design','web']},
 {id:'drive',name:'Google Drive',purpose:'Illustrative source folders, asset registers and versioned handoff documents; no files are accessed.',departments:['content','design','knowledge','operations']},
 {id:'google-analytics',name:'Google Analytics',purpose:'Illustrative traffic, conversion and measurement reviews using supplied mock data; no analytics account is accessed.',roles:['analytics','ads-analyst','audit','integrations'],match:'report|traffic|conversion|measurement|tracking|analytics|attribution|funnel'},
 {id:'google-ads',name:'Google Ads',purpose:'Prospective campaign briefs, creative tests and budget reviews. The listed tasks are fictional planning examples, not connected ad campaigns.',departments:['ads']},
 {id:'instagram',name:'Instagram',purpose:'Illustrative Reels, Stories, highlights and content-plan drafts; no profile is accessed or post published.',roles:['instagram','grid-planner'],match:'reel|instagram|highlight|stories|carousel'},
 {id:'linkedin',name:'LinkedIn',purpose:'Illustrative professional-content and campaign drafts awaiting review; no profile or ad account is accessed.',roles:['linkedin','linkedin-ads']},
 {id:'youtube',name:'YouTube',purpose:'Illustrative video scripts, edits and YouTube campaign planning; no upload or channel access.',roles:['youtube-ads','video','videographer']},
 {id:'tiktok',name:'TikTok',purpose:'Illustrative short-video and TikTok creative-test planning; no account access or publishing.',roles:['tiktok-ads']},
 {id:'whatsapp',name:'WhatsApp',purpose:'Five fictional enquiry reply drafts and sample booking/CRM handoffs only. Actual messaging remains deferred; nothing is sent.',roles:['community','bookings','crm'],match:'whatsapp|enquir|booking|reply|follow-up'},
 {id:'slack',name:'Slack',purpose:'Prospective internal brief, dependency and review handoffs for the fictional team; no workspace or message is accessed.',departments:['operations']},
 {id:'github',name:'GitHub',purpose:'Prospective code, integration, regression and accessibility reviews for the sample website; no repository is accessed.',roles:['implementation','integrations','web-qa','audit']},
 {id:'blender',name:'Blender',purpose:'Prospective 3D product and visual-reference planning from the supplied fictional geometry. No scene, render or Blender capability is claimed.',roles:['image-prompts'],match:'product|geometry|still-life|lighting|material'}
];
const localFiles={higgsfield:'higgsfield.png',figma:'figma.png',drive:'drive.svg','google-analytics':'google-analytics.svg','google-ads':'google-ads.svg',instagram:'instagram.png',linkedin:'linkedin.svg',youtube:'youtube.ico',tiktok:'tiktok.png',whatsapp:'whatsapp.webp',slack:'slack.png'};
export const demoAppIcon=id=>localFiles[id]?'/office-demo/apps/'+localFiles[id]:null;
const baseRelations={manychat:{roles:['community','crm','bookings'],match:'enquir|follow-up|conversation|reply|booking|handoff'}};
export function demoConnectedApps(base){return [...base.map(app=>({...app,...baseRelations[app.id],prospective:false})),...additions.map(app=>({...app,prospective:true}))];}
export function demoAppRelatedTasks(app,jobs){
 return jobs.filter(job=>{
  if(job.appIds.includes(app.id))return true;
  if(!app.roles&&!app.departments)return false;
  const roleMatch=app.roles?.some(role=>job.stages.some(stage=>stage.role===role));
  const departmentMatch=app.departments?.includes(job.department);
  const textMatch=app.match?new RegExp(app.match,'i').test([job.title,job.deliverable].filter(Boolean).join(' ')):false;
  return Boolean((roleMatch||departmentMatch)&&(app.match?textMatch:true));
 });
}
export function demoAppStripKey(event){
 if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const buttons=[...event.currentTarget.querySelectorAll('button')];if(!buttons.length)return;
 const current=buttons.indexOf(event.currentTarget.ownerDocument.activeElement);
 const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowRight'?Math.min(buttons.length-1,current+1):current<0?buttons.length-1:Math.max(0,current-1);
 event.preventDefault();buttons[index].focus({preventScroll:true});buttons[index].scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
}

export function demoAppStripFocus(event){
 const button=event.target?.closest?.('button');
 if(button&&event.currentTarget.contains(button))button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
}
