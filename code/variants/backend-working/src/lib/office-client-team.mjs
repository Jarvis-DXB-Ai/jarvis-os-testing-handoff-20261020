import {onboardingServices} from './office-onboarding.mjs';
export const serviceRoles={
 social:{head:'cmo',qa:'social-qa',roles:['grid-planner','copy','instagram','linkedin','facebook','scheduler','analytics']},
 content:{head:'video',qa:'content-qa',roles:['image-prompts','videographer','media']},
 design:{head:'creative-director',qa:'creative-qc',roles:['design-system','presentations','voice']},
 web:{head:'cto',qa:'web-qa',roles:['web-designer','implementation','web-research','audit','integrations']},
 ads:{head:'ads-lead',qa:'ads-qa',roles:['paid-ads','ads-analyst','meta-ads','linkedin-ads','youtube-ads','tiktok-ads']},
 email:{head:'email-lead',qa:'email-qa',roles:['email','email-design']},
 support:{head:'support-lead',qa:'support-qa',roles:['community','whatsapp','crm','bookings']},
 finance:{head:'cfo',qa:'finance-qa',roles:['bookkeeping','billing','margin','pricing','subscriptions']},
};
export const sharedClientRoles=['brand-strategist','competitors','librarian','delivery','success'];
export const sharedClientDepartments=[{id:'operations',name:'Client Onboarding & Operations',headRoleId:'coo',qaRoleId:'operations-qa',roles:['delivery','success'],headLabel:'Client Operations Lead',qaLabel:'Operations QA'},{id:'knowledge',name:'Research & Learning',headRoleId:'knowledge',qaRoleId:'research-qa',roles:['brand-strategist','competitors','librarian'],headLabel:'Research & Learning Lead',qaLabel:'Research QA'}];
export function buildClientTeam(services,capacity=2){
 if(!Array.isArray(services)||!services.length||services.some(id=>!serviceRoles[id])||new Set(services).size!==services.length)throw new Error('Confirm one or more purchased services.');
 if(!Number.isSafeInteger(capacity)||capacity<1||capacity>16)throw new Error('Choose between 1 and 16 simultaneous workers for this client.');
 const departments=services.map(id=>{const s=onboardingServices.find(s=>s.id===id),r=serviceRoles[id];return{id,name:s.name,headRoleId:r.head,qaRoleId:r.qa,roles:r.roles,headLabel:s.head,qaLabel:s.qa};});
 return {departments,sharedDepartments:sharedClientDepartments,roleIds:[...new Set([...sharedClientRoles,...departments.flatMap(d=>d.roles)])],maxConcurrentWorkers:capacity,permissions:'Existing task-scoped tool grants; service selection does not grant provider access.'};
}
export const intakeQuestions={name:'What is the company called? You can also start from DemoClientA’s existing source library.',website:'What is the official website? I will inspect its public content and separate observations from assumptions.',socials:'Which social profiles should I include? Paste the official links, or write “none” if they are not confirmed yet.',competitors:'Which competitors or aspirational references should I compare? Paste up to three public website links, or write “none” to leave competitor selection as a research gap.',goals:'What should our work achieve, for which audience and market? Include the main offer and decision maker.',services:'Which services are they paying for? Select the services and record their agreed deliverables. You can set the client’s team capacity here.',audit:'I have the source pack ready. Run the public audit, then review what I found.',brand:'Review the business facts, visual direction, tone and restrictions. Correct anything uncertain before confirming the brand.',ready:'Your client office is assembled. Account access and first-cycle QA still determine which delivery actions are available.'};
export function intakeStage(s){if(!s.name)return'name';if(!s.website)return'website';if(!s.socialsConfirmed)return'socials';if(!s.goals)return'goals';if(!s.competitorsConfirmed)return'competitors';if(!s.servicesConfirmed||!s.services.length||!s.scope)return'services';if(!s.audit.length)return'audit';if(!s.brandConfirmed)return'brand';return'ready';}
export function intakeReady(s){return intakeStage(s)==='ready'&&s.audit.some(a=>a.status==='read')&&Object.values(s.brand).every(x=>typeof x==='string'&&x.trim());}
export function changeIntake(s,input){
 if(s.status==='ready')throw new Error('This office is already assembled. Edit its scoped setup and reapprove changes there.');
 const allowed=['website','socials','competitors','goals','scope','services','capacity','brand','proposalSourcePaths'];const out={...s};
 for(const key of Object.keys(input))if(!allowed.includes(key))throw new Error('Unsupported intake field.');
 for(const key of ['name','goals','scope'])if(key in input){if(typeof input[key]!=='string'||input[key].length>(key==='name'?160:4000))throw new Error('Invalid intake answer.');out[key]=input[key].trim();}
 if('website' in input)out.website=publicUrl(input.website);
 if('socials' in input){if(!Array.isArray(input.socials)||input.socials.length>5)throw new Error('Use up to five official profiles.');out.socials=input.socials.map(publicUrl);out.socialsConfirmed=true;}
 if('competitors' in input){if(!Array.isArray(input.competitors)||input.competitors.length>3)throw new Error('Use up to three competitor sources.');out.competitors=input.competitors.map(publicUrl);out.competitorsConfirmed=true;}
 if('services' in input||'capacity' in input){const services=input.services??s.services,capacity=input.capacity??s.capacity;buildClientTeam(services,capacity);out.services=services;out.capacity=capacity;out.servicesConfirmed=true;}
 if('proposalSourcePaths' in input){if(!Array.isArray(input.proposalSourcePaths)||input.proposalSourcePaths.length>16||input.proposalSourcePaths.some(path=>typeof path!=='string'||!(s.sources??[]).some(source=>source.path===path)))throw new Error('Select the proposal from this client’s registered sources.');out.proposalSourcePaths=[...new Set(input.proposalSourcePaths)];}
 if('brand' in input){const fields=['positioning','facts','voice','visual','production','restrictions'];if(!input.brand||typeof input.brand!=='object')throw new Error('Invalid brand draft.');out.brand=Object.fromEntries(fields.map(k=>{const text=input.brand[k];if(typeof text!=='string'||text.length>4000)throw new Error('Invalid brand section.');return[k,text.trim()];}));}
 out.brandConfirmed=false;out.confirmedAt=null;
 if(out.website!==s.website||JSON.stringify(out.socials)!==JSON.stringify(s.socials)||JSON.stringify(out.competitors)!==JSON.stringify(s.competitors))out.audit=[];
 return out;
}
export function publicUrl(value){let u;try{u=new URL(value);}catch{throw new Error('Enter a complete public website URL.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hash||u.href.length>1800)throw new Error('Use a public HTTP/HTTPS URL without credentials or fragments.');if(u.port&&!['80','443'].includes(u.port))throw new Error('Use a standard public website port.');if(/^(localhost|.*\.(local|internal)|127\..*|0\.0\.0\.0|\[.*\])$/i.test(u.hostname))throw new Error('Private addresses are not research sources.');return u.href;}
export const departmentQaMethods={social:['jarvis-office-protocol','office-social-qa','brand-voice-review'],content:['jarvis-office-protocol','office-content-qa','mc-art-direction'],design:['jarvis-office-protocol','office-creative-qc','mc-art-direction'],web:['jarvis-office-protocol','office-web-qa','web-accessibility'],ads:['jarvis-office-protocol','office-ads-qa','ad-creative-review'],email:['jarvis-office-protocol','office-email-qa','humanizer'],support:['jarvis-office-protocol','office-support-qa','humanizer'],finance:['jarvis-office-protocol','office-finance-qa'],operations:['jarvis-office-protocol','office-operations-qa'],knowledge:['jarvis-office-protocol','office-research-qa']};
