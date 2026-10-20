import {readFile,writeFile,lstat,realpath,mkdtemp,rm} from 'node:fs/promises';
import {StringDecoder} from 'node:string_decoder';
import {spawn} from 'node:child_process';
import {join,relative,isAbsolute,posix} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {verifyArtifactFormat} from './office-artifact-format.mjs';
const require=createRequire(import.meta.url),{parse}=require('next/dist/compiled/node-html-parser'),postcss=require('postcss'),values=require('next/dist/compiled/postcss-value-parser');
export const artifactDigest=b=>createHash('sha256').update(b).digest('hex');
const sha=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,slug=/^[a-z0-9][a-z0-9-]{0,63}$/,call=/^[a-f0-9]{32}$/;
export const clientArtifactFile=/^(?:editable\.html|editable\.css|data\.json|bundle\.json|render\.json|preview\.png|favicon\.png|layout\.js|asset-[a-f0-9]{64}\.(?:png|webp|jpg|jpeg|woff2))$/;
const favicon=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==",'base64');
const maxTotal=64*1024*1024,maxText=128000;
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Unexpected artifact fields.');};
const text=(v,max=maxText)=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=max;
const baseProps={profileId:{type:'string',pattern:slug.source},masterId:{type:'string',pattern:slug.source}};
const object=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
export const clientArtifactSchemas={
 artifact_read:object({...baseProps,sourceCall:{type:'string',pattern:call.source},revisionSha256:{type:'string',pattern:sha.source}},['profileId']),
 artifact_save:object({...baseProps,html:{type:'string',maxLength:maxText},css:{type:'string',maxLength:maxText},data:{type:'string',maxLength:64000},parent:object({sourceCall:{type:'string',pattern:call.source},revisionSha256:{type:'string',pattern:sha.source}},['sourceCall','revisionSha256'])},['profileId','masterId','html','css','data']),
 artifact_render:object({profileId:baseProps.profileId,sourceCall:{type:'string',pattern:call.source},revisionSha256:{type:'string',pattern:sha.source}},['profileId','sourceCall','revisionSha256']),
};
export function validateClientArtifact(name,args){
 const s=clientArtifactSchemas[name];if(!s)throw Error('Unknown artifact tool.');exact(args,Object.keys(s.properties));
 if(!slug.test(args.profileId??'')||(s.required??[]).some(k=>args[k]===undefined))throw Error('Artifact fields missing.');
 if(args.masterId!==undefined&&!slug.test(args.masterId))throw Error('Invalid master identity.');
 if(args.sourceCall!==undefined&&!call.test(args.sourceCall)||args.revisionSha256!==undefined&&!sha.test(args.revisionSha256))throw Error('Invalid revision identity.');
 if(name==='artifact_read'&&((!!args.masterId===!!args.sourceCall)||!!args.sourceCall!==!!args.revisionSha256))throw Error('Choose one pinned master or exact saved revision.');
 if(name==='artifact_save'){
  if(Buffer.byteLength(JSON.stringify(args))>28000)throw Error('Editable revision exceeds the current MCP request budget.');
  if(!text(args.html)||!text(args.css)||!text(args.data,64000))throw Error('Bounded editable HTML/CSS/JSON required.');JSON.parse(args.data);
  if(args.parent!==undefined){exact(args.parent,['sourceCall','revisionSha256']);if(!call.test(args.parent.sourceCall??'')||!sha.test(args.parent.revisionSha256??''))throw Error('Invalid parent revision.');}
 }
 return args;
}
// Profiles are operator-owned configuration, never supplied through tool arguments.
export const clientProfileHash=profile=>artifactDigest(JSON.stringify(profile));
export function artifactProfiles(plan,clientId){return Object.values(plan.toolBridge?.clientArtifactProfiles??{}).filter(p=>p.enabled===true&&p.clientId===clientId);}
async function safeFile(root,parts){
 if(await realpath(root)!==root)throw Error('Artifact root symlink denied.');let path=root;
 for(const part of parts){if(!part||part==='.'||part==='..'||part.includes('/')||part.includes('\\'))throw Error('Artifact path escape denied.');path=join(path,part);const stat=await lstat(path);if(stat.isSymbolicLink())throw Error('Artifact symlink denied.');}
 if(!relative(root,path)||relative(root,path).startsWith('..')||isAbsolute(relative(root,path))||!(await lstat(path)).isFile())throw Error('Artifact file required.');return path;
}
async function stored(storage,jobId,id,file){if(!uuid.test(jobId)||!call.test(id)||!clientArtifactFile.test(file)&&file!=='receipt.json')throw Error('Invalid stored artifact identity.');return safeFile(storage.recordsRoot,['tool-artifacts',jobId,id,file]);}
export function assertClientArtifactActor(ctx,args,tool){
 const current=ctx.job.calls?.find(c=>c.agentId===ctx.agentId&&c.runId===ctx.runId&&['queued','running','dispatching'].includes(c.status));
 const grant=current?.artifactGrant,profile=ctx.clientArtifactProfiles?.[args.profileId],clientId=ctx.job.knowledgeContext?.scope?.clientId;
 if(!current?.tools?.includes(tool)||current.roleId!==ctx.roleId||!ctx.allowed.includes(tool)||!uuid.test(ctx.jobId)||ctx.job.id!==ctx.jobId||!uuid.test(ctx.agentId)||!uuid.test(ctx.runId)||!uuid.test(clientId??'')||!current?.authority?.workOrderId||!profile||profile.id!==args.profileId||profile.enabled!==true||profile.clientId!==clientId||profile.workOrderId!==current.authority.workOrderId||!slug.test(profile.workOrderId)||grant?.clientId!==clientId||grant.workOrderId!==profile.workOrderId||grant.profileId!==profile.id||grant.profileSha256!==clientProfileHash(profile))throw Error('No exact client/work-order artifact grant.');
 if(!['conversation'].includes(current.stage)&&!current.stage.startsWith('specialist:')&&!current.stage.startsWith('department')&&!['qa','synthesis','planning','coo-release'].includes(current.stage))throw Error('Artifact stage is not allocated.');
 if(tool!=='artifact_read'&&current.stage!=='conversation'&&!current.stage.startsWith('specialist:'))throw Error('Only an allocated author may produce artifacts.');
 return {profile,clientId,workOrderId:profile.workOrderId};
}
export async function prepareClientArtifact(ctx,args,tool){
 const {profile,clientId}=assertClientArtifactActor(ctx,args,tool);
 if(typeof profile.root!=='string'||!isAbsolute(profile.root)||!Array.isArray(profile.masters)||!Array.isArray(profile.files)||profile.files.length>48||!profile.files.length)throw Error('Invalid artifact source profile.');
 const pins=[],resources=new Map(),sources=new Map();let total=0;
 for(const f of profile.files){
  if(!slug.test(f.sourceId??'')||!sha.test(f.sha256??'')||!['draft','approved','rejected','reference'].includes(f.status)||typeof f.path!=='string'||f.path!==posix.normalize(f.path)||f.path.startsWith('/')||f.path.split('/').some(p=>!p||p==='..'||p==='.')||/[^a-zA-Z0-9_./-]/.test(f.path)||sources.has(f.sourceId)||resources.has(f.path))throw Error('Invalid or duplicate pinned source.');
  const path=await safeFile(profile.root,f.path.split('/')),stat=await lstat(path);if(stat.size>32*1024*1024||(total+=stat.size)>maxTotal)throw Error('Artifact sources exceed budget.');
  const bytes=await readFile(path);if(artifactDigest(bytes)!==f.sha256)throw Error('Pinned artifact dependency changed.');
  const ext=f.path.split('.').at(-1).toLowerCase();if(!['html','css','json','js','png','webp','jpg','jpeg','woff2'].includes(ext))throw Error('Unsupported artifact dependency.');
  await verifyArtifactFormat(f.path,bytes);if(ext==='json'&&bytes.length>64000)throw Error('Editable source JSON exceeds the bounded input contract.');const source={sourceId:f.sourceId,path:f.path,sha256:f.sha256,bytes:bytes.length,status:f.status};pins.push(source);const entry={...source,bytes,ext};sources.set(f.sourceId,entry);resources.set(f.path,entry);
 }
 const master=args.masterId?profile.masters.find(m=>m.id===args.masterId):null;if(args.masterId&&!master)throw Error('Master is not selected.');
 if(master&&(!slug.test(master.id??'')||!sources.has(master.htmlSourceId)||sources.get(master.htmlSourceId).ext!=='html'||!sources.has(master.cssSourceId)||sources.get(master.cssSourceId).ext!=='css'||master.dataSourceId&&sources.get(master.dataSourceId)?.ext!=='json'||!Number.isSafeInteger(master.width)||!Number.isSafeInteger(master.height)||master.width<1||master.height<1||master.width>4096||master.height>4096||master.width*master.height>8000000))throw Error('Invalid selected master contract.');
 return {profile,profileSha256:clientProfileHash(profile),clientId,workOrderId:profile.workOrderId,pins,resources,sources,master};
}
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dependencyResolver(input){
 const aliases=new Map(),files=new Map(),used=new Set();
 const {master,sources,resources}=input;
 const html=sources.get(master.htmlSourceId),css=sources.get(master.cssSourceId);
 aliases.set(html.path,'editable.html');aliases.set(css.path,'editable.css');if(master.dataSourceId)aliases.set(sources.get(master.dataSourceId).path,'data.json');
 for(const r of resources.values())if(['png','webp','jpg','jpeg','woff2','js'].includes(r.ext)){const name=r.ext==='js'?'layout.js':`asset-${r.sha256}.${r.ext}`;if(files.has(name)&&!files.get(name).equals(r.bytes))throw Error('Conflicting dependency aliases.');aliases.set(r.path,name);files.set(name,r.bytes);}
 const resolve=(url,from,extensions)=>{
  if(typeof url!=='string'||!url||/[\\\s\x00-\x1f%?#:]/.test(url)||url.startsWith('/'))throw Error('External or encoded resource denied.');
  const flat=[...aliases.values()].includes(url)?url:aliases.get(posix.normalize(posix.join(posix.dirname(from),url)));
  if(!flat||!extensions.includes(flat.split('.').at(-1)))throw Error('Undeclared artifact resource.');used.add(flat);return flat;
 };
 return {files,resolve,used,htmlPath:html.path,cssPath:css.path};
}
function safeCss(css,from,resolve){
 if(!text(css)||/[\\\x00-\x08\x0b\x0c\x0e-\x1f<]/.test(css))throw Error('Unsupported CSS encoding.');
 const ast=postcss.parse(css);
 ast.walkAtRules(a=>{if(!['font-face','media','supports','keyframes','-webkit-keyframes','layer','container'].includes(a.name.toLowerCase())||/url\s*\(|https?:|\/\//i.test(a.params))throw Error('Unsupported CSS at-rule or external resource.');});
 ast.walkDecls(d=>{
  if(/^(?:behavior|-moz-binding)$/i.test(d.prop)||/expression\s*\(|(?:image-set|paint|element|local)\s*\(/i.test(d.value))throw Error('Executable/unsupported CSS denied.');
  const value=values(d.value);value.walk(n=>{if(n.type==='function'&&n.value.toLowerCase()==='url'){
   if(n.nodes.length!==1||!['string','word'].includes(n.nodes[0].type))throw Error('Invalid CSS resource.');n.nodes[0]={type:'string',quote:'"',value:resolve(n.nodes[0].value,from,['png','webp','jpg','jpeg','woff2'])};
  }});d.value=value.toString();
 });return ast.toString();
}
const tags=new Set('html head body meta title link style article section div span p h1 h2 h3 h4 h5 h6 br b strong i em small ul ol li figure figcaption img table thead tbody tfoot tr th td hr button a script'.split(' '));
const voidTags=new Set(['meta','link','br','img','hr']);
function safeHtml(html,input,deps){
 if(!text(html))throw Error('Bounded HTML required.');const ast=parse(html,{comment:true,blockTextElements:{script:true,style:true,pre:true}});let canvas=0,script=0,stylesheet=0,icons=0;
 const walk=n=>{
  if(n.nodeType===8)return '';if(n.nodeType===3){if(/^<!doctype html>$/i.test(n.rawText.trim()))return '<!doctype html>';return escape(n.text);}
  const tag=n.tagName?.toLowerCase();if(!tag)return n.childNodes.map(walk).join('');if(!tags.has(tag))throw Error('Unsupported HTML element: '+tag);
  const attrs=[];for(const [key,value] of Object.entries(n.attributes)){
   const k=key.toLowerCase();if(k.startsWith('on')||!['class','id','lang','charset','name','content','rel','href','src','alt','title','width','height','style','type','role','aria-label','aria-hidden','integrity','crossorigin','data-id','colspan','rowspan'].includes(k))throw Error('Unsupported HTML attribute: '+k);
   if(['integrity','crossorigin'].includes(k)){if(tag!=='script')throw Error('Unsupported resource attribute.');continue;}
   let v=value;if(k==='style')v=safeCss('x{'+v+'}',deps.htmlPath,deps.resolve).slice(2,-1);
   if(k==='src'){
    if(tag==='img')v=deps.resolve(v,deps.htmlPath,['png','webp','jpg','jpeg']);
    else if(tag==='script'){v=deps.resolve(v,deps.htmlPath,['js']);script++;}
    else throw Error('Unsupported HTML resource.');
   }
   if(k==='href'){
    if(tag==='link'&&n.getAttribute('rel')==='icon')return '';
  if(tag==='script'){const b=deps.files.get('layout.js');if(!b)throw Error('Reviewed layout missing.');attrs.push(`integrity="sha256-${createHash('sha256').update(b).digest('base64')}"`,'crossorigin="anonymous"');}
  if(tag==='link'&&n.getAttribute('rel')==='stylesheet'){v=deps.resolve(v,deps.htmlPath,['css']);stylesheet++;}
    else if(tag==='link'&&n.getAttribute('rel')==='icon'&&v==='favicon.png'){icons++;}
    else throw Error('Navigation is unsupported in renderable masters.');
   }
   if(tag==='meta'&&k==='name'&&!['viewport','description'].includes(v))throw Error('Unsupported metadata.');
   attrs.push(`${k}="${escape(v)}"`);
  }
  if(tag==='script'&&(!n.getAttribute('src')||n.childNodes.some(c=>c.rawText?.trim())||Object.keys(n.attributes).some(k=>!['src','integrity','crossorigin'].includes(k))))throw Error('Only the pinned reviewed layout dependency may execute.');
  if(tag==='link'&&n.getAttribute('rel')==='icon')return '';
  if(tag==='script'){const b=deps.files.get('layout.js');if(!b)throw Error('Reviewed layout missing.');attrs.push(`integrity="sha256-${createHash('sha256').update(b).digest('base64')}"`,'crossorigin="anonymous"');}
  if(tag==='link'&&(!['stylesheet','icon'].includes(n.getAttribute('rel'))||!n.getAttribute('href')))throw Error('Unsupported link dependency.');
  if(n.classList?.contains('canvas'))canvas++;
  const children=tag==='style'?safeCss(n.text,deps.htmlPath,deps.resolve):tag==='script'?'':n.childNodes.map(walk).join('');
  return `<${tag}${attrs.length?' '+attrs.join(' '):''}>${voidTags.has(tag)?'':children+`</${tag}>`}`;
 };
 const result=walk(ast);if(canvas!==1||stylesheet>1||script>1||icons>1)throw Error('One editable canvas and bounded layout dependencies required.');
 if(script&&!deps.files.has('layout.js'))throw Error('Reviewed layout dependency missing.');if(!/<html\b/i.test(result))throw Error('Complete HTML document required.');return result.replace(/<html\b[^>]*>/i,m=>m+'<link rel="icon" href="favicon.png">');
}
export function editableBundle(input,args){
 const deps=dependencyResolver(input),html=safeHtml(args.html,input,deps),css=safeCss(args.css,deps.cssPath,deps.resolve);JSON.parse(args.data);
 const files=new Map([['editable.html',Buffer.from(html)],['editable.css',Buffer.from(css)],['data.json',Buffer.from(args.data)],['favicon.png',favicon],...[...deps.files].filter(([name])=>deps.used.has(name))]);
 return {files,width:input.master.width,height:input.master.height};
}
export function sourceArtifact(input){
 const {master,sources}=input;const edited=editableBundle(input,{html:sources.get(master.htmlSourceId).bytes.toString('utf8'),css:sources.get(master.cssSourceId).bytes.toString('utf8'),data:master.dataSourceId?sources.get(master.dataSourceId).bytes.toString('utf8'):'{}'});
 return {profileId:input.profile.id,masterId:master.id,profileSha256:input.profileSha256,sourcePins:input.pins,width:master.width,height:master.height,html:edited.files.get('editable.html').toString(),css:edited.files.get('editable.css').toString(),data:edited.files.get('data.json').toString(),dependencies:[...edited.files].filter(([n])=>!['editable.html','editable.css','data.json'].includes(n)).map(([name,b])=>({name,sha256:artifactDigest(b),bytes:b.length})),status:'Read-only source evidence; input approval states preserved. Every derived revision is a draft.'};
}
export function artifactVisible(ctx,r,sourceJobId=ctx.jobId){
 const clientId=ctx.job.knowledgeContext?.scope?.clientId,meta=r.result?.clientArtifact;
 if(r.status!=='completed'||r.jobId!==sourceJobId||r.fixture!==ctx.fixture||!meta||meta.clientId!==clientId)throw Error('Artifact receipt scope differs.');
 if(sourceJobId!==ctx.jobId){const pin=ctx.job.selectedArtifacts?.files?.find(f=>f.sourceCall===r.id&&f.fileName==='bundle.json');if(ctx.job.selectedArtifacts?.jobId!==sourceJobId||ctx.job.selectedArtifacts?.agentId!==ctx.agentId||ctx.job.selectedArtifacts?.clientId!==clientId||!pin||pin.receiptSha256!==artifactDigest(JSON.stringify(r)))throw Error('Saved artifact is not selected.');return;}
 const source=ctx.job.calls?.find(c=>c.agentId===r.agentId&&c.runId===r.runId&&c.tools?.includes(r.tool));if(!source)throw Error('Artifact producer is not a saved tool actor.');
 const current=ctx.job.calls?.find(c=>c.runId===ctx.runId&&c.agentId===ctx.agentId),part=ctx.job.steps?.find(s=>s.agentId===ctx.agentId&&s.id===ctx.partId);
 const report=ctx.job.departmentReports?.find(d=>d.agentId===ctx.agentId&&current?.stage===`department:${d.departmentId}`||d.qa?.agentId===ctx.agentId&&current?.stage===`department-qa:${d.departmentId}`||d.partsQa?.agentId===ctx.agentId&&current?.stage===`department-parts-qa:${d.departmentId}`);
 const final=['qa','synthesis'].includes(current?.stage)&&ctx.job.steps?.some(s=>s.id===r.partId&&s.status==='completed');
 if(r.agentId!==ctx.agentId&&!part?.dependsOn?.includes(r.partId)&&!report?.stepIds?.includes(r.partId)&&!final)throw Error('Artifact is not an allocated dependency/review output.');
}
export async function readClientBundle(storage,jobId,id,receipt){
 receipt??=JSON.parse(await readFile(await stored(storage,jobId,id,'receipt.json'),'utf8'));
 const meta=receipt.result?.clientArtifact;
 if(receipt.status!=='completed'||receipt.id!==id||receipt.jobId!==jobId||!meta||!['artifact_save','artifact_render'].includes(receipt.tool)||!uuid.test(meta.clientId??'')||!slug.test(meta.workOrderId??'')||!sha.test(meta.profileSha256??'')||!sha.test(meta.revisionSha256??'')||!Array.isArray(receipt.files)||receipt.files.length>52)throw Error('Invalid client artifact receipt.');
 const files=new Map();let total=0;
 for(const f of receipt.files){if(!clientArtifactFile.test(f.name)||files.has(f.name)||!sha.test(f.sha256??'')||!Number.isSafeInteger(f.bytes)||f.bytes<1||(total+=f.bytes)>maxTotal+1024*1024)throw Error('Invalid bundle file pin.');const b=await readFile(await stored(storage,jobId,id,f.name));if(b.length!==f.bytes||artifactDigest(b)!==f.sha256)throw Error('Bundle file hash changed.');await verifyArtifactFormat(f.name,b);files.set(f.name,b);}
 const manifestBytes=files.get('bundle.json');if(!manifestBytes||artifactDigest(manifestBytes)!==meta.revisionSha256)throw Error('Editable revision mismatch.');
 const manifest=JSON.parse(manifestBytes);if(manifest.jobId!==receipt.jobId&&receipt.tool!=='artifact_render'||!uuid.test(manifest.agentId??'')||!uuid.test(manifest.runId??'')||manifest.version!==1||manifest.kind!=='editable-client-bundle'||manifest.clientId!==meta.clientId||receipt.tool==='artifact_save'&&(manifest.agentId!==receipt.agentId||manifest.runId!==receipt.runId||manifest.partId!==receipt.partId||manifest.roleId!==receipt.roleId)||manifest.workOrderId!==meta.workOrderId||manifest.profileSha256!==meta.profileSha256||manifest.profileId!==meta.profileId||manifest.masterId!==meta.masterId||!Array.isArray(manifest.files)||!['editable.html','editable.css','data.json'].every(n=>files.has(n))||manifest.files.length!==files.size-(receipt.tool==='artifact_render'?3:1))throw Error('Bundle manifest mismatch.');
 const seen=new Set();for(const f of manifest.files){if(seen.has(f.name)||!files.has(f.name)||artifactDigest(files.get(f.name))!==f.sha256||files.get(f.name).length!==f.bytes)throw Error('Manifest resource mismatch.');seen.add(f.name);}
 if(receipt.tool==='artifact_render'){
  const render=JSON.parse(files.get('render.json')??'null');if(!render||render.revisionSha256!==meta.revisionSha256||render.previewSha256!==artifactDigest(files.get('preview.png')??'')||render.fixture!==receipt.fixture||render.width!==manifest.width||render.height!==manifest.height||render.clientId!==meta.clientId||render.workOrderId!==meta.workOrderId)throw Error('Render/editable revision mismatch.');
 }
 return {receipt,manifest,files};
}
export async function allocatedClientBundle(ctx,id,revisionSha256){
 let b;try{b=await readClientBundle(ctx.storage,ctx.jobId,id);}catch(e){const scope=ctx.job.selectedArtifacts;if(e.code!=='ENOENT'||!scope?.files?.some(f=>f.sourceCall===id&&f.fileName==='bundle.json'))throw e;b=await readClientBundle(ctx.storage,scope.jobId,id);}
 artifactVisible(ctx,b.receipt,b.receipt.jobId);if(b.receipt.result.clientArtifact.revisionSha256!==revisionSha256)throw Error('Requested editable revision changed.');return b;
}
export async function saveClientBundle(ctx,input,args,id,out){
 if(args.parent){const p=await allocatedClientBundle(ctx,args.parent.sourceCall,args.parent.revisionSha256);if(p.manifest.profileSha256!==input.profileSha256||p.manifest.masterId!==args.masterId||p.manifest.workOrderId!==input.workOrderId)throw Error('Parent client/source/work-order mismatch.');}
 const {files,width,height}=editableBundle(input,args);
 const manifest={version:1,kind:'editable-client-bundle',status:'draft',clientId:input.clientId,workOrderId:input.workOrderId,profileId:input.profile.id,profileSha256:input.profileSha256,masterId:args.masterId,jobId:ctx.jobId,agentId:ctx.agentId,runId:ctx.runId,partId:ctx.partId,roleId:ctx.roleId,parent:args.parent??null,sourcePins:input.pins,width,height,files:[...files].map(([name,b])=>({name,bytes:b.length,sha256:artifactDigest(b)})),review:'Independent factual/visual review and owner opinion/publication approval remain separate.'};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)),revisionSha256=artifactDigest(bytes);files.set('bundle.json',bytes);
 await ctx.check();for(const [name,b] of files)await writeFile(join(out,name),b,{flag:'wx',mode:0o600});await ctx.check();
 return {files:[...files.keys()],result:{clientArtifact:{version:1,kind:'editable',clientId:input.clientId,workOrderId:input.workOrderId,profileId:input.profile.id,profileSha256:input.profileSha256,masterId:args.masterId,revisionSha256,status:'draft',parent:args.parent??null},note:'Immutable editable draft saved. No rendered output or review approval yet.',read:{tool:'artifact_read',arguments:{profileId:input.profile.id,sourceCall:id,revisionSha256}},render:{tool:'artifact_render',arguments:{profileId:input.profile.id,sourceCall:id,revisionSha256}}}};
}
/** Contract only. No renderer/browser is constructed or launched by this module. */
export async function renderClientBundle(ctx,input,args,id,out){
 const bundle=await allocatedClientBundle(ctx,args.sourceCall,args.revisionSha256),{manifest}=bundle;
 if(manifest.profileSha256!==input.profileSha256||manifest.profileId!==input.profile.id||manifest.workOrderId!==input.workOrderId)throw Error('Render source scope mismatch.');
 const renderer=ctx.clientArtifactRenderer;
 if(!renderer||renderer.contract!=='office-local-bundle-v1'||typeof renderer.render!=='function'||renderer.fixture!==ctx.fixture||!text(renderer.id,120)||!renderer.leaseId||!sha.test(renderer.sourceSha256??''))throw Error('Isolated renderer and current task lease unavailable; no render attempted.');
 const resources=new Map([...bundle.files].filter(([name])=>!['bundle.json','render.json','preview.png'].includes(name)).map(([name,b])=>[name,Buffer.from(b)]));
 const origin='https://office-artifact.invalid',resource=(url)=>{const u=new URL(url);if(u.origin!==origin||u.search||u.hash||u.pathname.slice(1).includes('/')||!resources.has(u.pathname==='/favicon.ico'?'favicon.png':u.pathname.slice(1)))throw Error('Renderer resource is undeclared or external.');return Buffer.from(resources.get(u.pathname==='/favicon.ico'?'favicon.png':u.pathname.slice(1)));};
 const scripts=[...resources].filter(([name])=>name.endsWith('.js')).map(([,b])=>`'sha256-${createHash('sha256').update(b).digest('base64')}'`).join(' ');
 const contract={version:1,requiredResources:[...resources.keys()].filter(n=>n!=='data.json'),origin,entry:origin+'/editable.html',revisionSha256:args.revisionSha256,width:manifest.width,height:manifest.height,resourceNames:[...resources.keys()],resource,check:ctx.check,csp:`default-src 'none'; img-src ${origin}; font-src ${origin}; style-src 'unsafe-inline' ${origin}; script-src ${scripts||"'none'"}; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'`,waitFor:['document.fonts.ready',...(resources.has('layout.js')?['window.DEMOCLIENTA_LAYOUT_READY']:[])],timeoutMs:15000,network:'deny-except-exact-memory-resources',serviceWorkers:'deny',downloads:'deny'};
 await ctx.check();const rendered=await renderer.render(contract);await ctx.check();
 if(!rendered||!Buffer.isBuffer(rendered.png)||rendered.revisionSha256!==args.revisionSha256||rendered.complete!==true||rendered.fontsReady!==true||rendered.layoutReady!==true||rendered.networkDenied!==true||!Array.isArray(rendered.errors)||rendered.errors.length||!Array.isArray(rendered.loadedResources)||[...resources.keys()].filter(n=>n!=='data.json').some(n=>!rendered.loadedResources.includes(n))||rendered.loadedResources.some(n=>!resources.has(n)))throw Error('Incomplete or mismatched render.');
 const verification=await verifyArtifactFormat('preview.png',rendered.png);if(verification.width!==manifest.width||verification.height!==manifest.height)throw Error('Render dimensions differ from editable contract.');
 const render={version:1,sourceCall:args.sourceCall,revisionSha256:args.revisionSha256,clientId:input.clientId,workOrderId:input.workOrderId,width:manifest.width,height:manifest.height,previewSha256:artifactDigest(rendered.png),renderer:{id:renderer.id,sourceSha256:renderer.sourceSha256,leaseId:renderer.leaseId},fixture:ctx.fixture,loadedResources:rendered.loadedResources,review:'Render completion evidence is not visual/factual acceptance or owner approval.'};
 const files=new Map([...bundle.files].filter(([name])=>!['preview.png','render.json'].includes(name)));files.set('preview.png',rendered.png);files.set('render.json',Buffer.from(JSON.stringify(render,null,2)));
 for(const [name,b] of files)await writeFile(join(out,name),b,{flag:'wx',mode:0o600});await ctx.check();
 return {files:[...files.keys()],result:{clientArtifact:{...bundle.receipt.result.clientArtifact,kind:'render',sourceCall:args.sourceCall},renderer:render.renderer,inspection:{tool:'image_view',arguments:{sourceCall:id,fileName:'preview.png'}},note:render.review}};
}

/** Explicit operator-only factory: constructing it launches nothing. Each render
 * rechecks its external task lease, creates one private profile/CDP pipe, and
 * destroys only that owned process group/profile. No renderer is auto-enabled. */
export async function createLeasedClientArtifactRenderer({leaseId,checkLease,temporaryRoot,fixture=false,executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',onProcess=()=>{}}){
 if(!slug.test(leaseId??'')||typeof checkLease!=='function'||!isAbsolute(temporaryRoot??'')||await realpath(temporaryRoot)!==temporaryRoot||typeof fixture!=='boolean'||typeof onProcess!=='function'||executable!=='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'||!(await lstat(executable)).isFile())throw Error('Explicit local renderer/lease configuration required.');
 const sourceSha256=artifactDigest(await readFile(new URL(import.meta.url)));
 let busy=false;
 return {contract:'office-local-bundle-v1',id:'chrome-cdp-pipe-v1',sourceSha256,leaseId,fixture,render:async contract=>{
  if(busy)throw Error('One renderer process at a time.');busy=true;
  let profile,child,exited,watch,deadline,sequence=0,sessionId,closed=false,buffer='',stderr='',fatal=null;const pending=new Map(),loaded=new Set(),errors=[],decoder=new StringDecoder('utf8');
  const fail=error=>{fatal??=error;for(const p of pending.values())p.reject(error);pending.clear();};
  const send=(method,params={},session=sessionId)=>new Promise((resolve,reject)=>{
   if(fatal||closed){reject(fatal??Error('Renderer pipe closed.'));return;}
   const id=++sequence;pending.set(id,{resolve,reject});child.stdio[3].write(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})})+'\0',error=>{if(error){pending.delete(id);reject(error);}});
  });
  try{
   await checkLease();await contract.check();profile=await mkdtemp(join(temporaryRoot,'office-render-profile-'));
   child=spawn(executable,['--headless=new','--remote-debugging-pipe',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-default-apps','--disable-quic','--disable-gpu','--renderer-process-limit=1','--host-resolver-rules=MAP * ~NOTFOUND','--metrics-recording-only','--mute-audio','--no-startup-window','--disable-crash-reporter','--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication,CertificateTransparencyComponentUpdater'],{stdio:['ignore','ignore','pipe','pipe','pipe'],detached:true,env:Object.fromEntries(['HOME','PATH','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
   exited=new Promise(resolve=>child.once('close',resolve));child.once('error',fail);child.once('exit',()=>{closed=true;fail(Error('Owned renderer exited.'));});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000);});child.stdio[3].on('error',fail);child.stdio[4].on('error',fail);
   try{onProcess({state:'started',pid:child.pid,profile});}catch{throw Error('Renderer observer refused process tracking.');}
   child.stdio[4].on('data',chunk=>{
    buffer+=decoder.write(chunk);if(buffer.length>24*1024*1024){fail(Error('Renderer protocol budget exceeded.'));return;}
    for(let end;(end=buffer.indexOf('\0'))>=0;){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);let event;try{event=JSON.parse(raw);}catch{fail(Error('Invalid renderer protocol response.'));return;}
     if(event.id){const p=pending.get(event.id);if(p){pending.delete(event.id);event.error?p.reject(Error('Renderer protocol refused '+event.error.message)):p.resolve(event.result);}continue;}
     if(event.sessionId!==sessionId)continue;
     if(event.method==='Fetch.requestPaused')void(async()=>{
      const p=event.params;try{
       if(p.request.method!=='GET')throw Error('Renderer request method denied.');
       const bytes=contract.resource(p.request.url),name=new URL(p.request.url).pathname==='/favicon.ico'?'favicon.png':new URL(p.request.url).pathname.slice(1),type=({html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',woff2:'font/woff2'})[name.split('.').at(-1)];
       await send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:type},{name:'Content-Security-Policy',value:contract.csp},{name:'X-Content-Type-Options',value:'nosniff'},{name:'Cache-Control',value:'no-store'}],body:bytes.toString('base64')});loaded.add(name);
      }catch(error){errors.push(error.message+' ['+p.request.url.slice(0,200)+']');await send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(fail);}
     })().catch(fail);
     if(event.method==='Runtime.exceptionThrown')errors.push('Page exception: '+(event.params.exceptionDetails.text??'unknown'));
     if(event.method==='Log.entryAdded'&&event.params.entry.level==='error')errors.push('Browser error: '+event.params.entry.text.slice(0,200));
    }
   });
   deadline=setTimeout(()=>fail(Error('Renderer deadline exceeded.')),Math.min(contract.timeoutMs,20000));
   let checking=false;watch=setInterval(()=>{if(checking)return;checking=true;Promise.all([checkLease(),contract.check()]).catch(fail).finally(()=>{checking=false;});},500);
   const browser=await send('Browser.getVersion',{},null),context=await send('Target.createBrowserContext',{disposeOnDetach:true},null),target=await send('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId},null);
   sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
   await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setDeviceMetricsOverride',{width:contract.width,height:contract.height,deviceScaleFactor:1,mobile:false});await send('Browser.setDownloadBehavior',{behavior:'deny',browserContextId:context.browserContextId},null);
   await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}],handleAuthRequests:false});
   const navigation=await send('Page.navigate',{url:contract.entry});if(navigation.errorText)throw Error('Renderer navigation failed: '+navigation.errorText);
   // Fixed trusted inspector; editable input never supplies evaluation code.
   const inspected=await send('Runtime.evaluate',{expression:`(async()=>{if(document.readyState!=='complete')await new Promise(resolve=>addEventListener('load',resolve,{once:true}));await document.fonts.ready;${contract.waitFor.includes('window.DEMOCLIENTA_LAYOUT_READY')?"if(!window.DEMOCLIENTA_LAYOUT_READY)throw Error('Pinned layout not started');await window.DEMOCLIENTA_LAYOUT_READY;":''}for(const font of document.fonts)if(font.status==='error')throw Error('Font failed to decode');for(const image of document.images){await image.decode();if(!image.naturalWidth)throw Error('Image missing');}await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const canvas=document.querySelector('.canvas');if(!canvas)throw Error('Canvas missing');const r=canvas.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,text:canvas.innerText,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),images:[...document.images].map(i=>({width:i.naturalWidth,height:i.naturalHeight})),layoutReady:${contract.waitFor.includes('window.DEMOCLIENTA_LAYOUT_READY')?'await window.DEMOCLIENTA_LAYOUT_READY':'true'}}})()`,awaitPromise:true,returnByValue:true});
   if(inspected.exceptionDetails)throw Error('Editable page failed fonts/images/layout readiness.');const metrics=inspected.result?.value;
   if(!metrics||metrics.width!==contract.width||metrics.height!==contract.height||metrics.x<0||metrics.y<0||metrics.layoutReady!==true||errors.length)throw Error('Editable canvas geometry or resource check failed: '+errors.join(';'));
   const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:metrics.x,y:metrics.y,width:contract.width,height:contract.height,scale:1}});await checkLease();await contract.check();
   if(fatal||errors.length||contract.requiredResources.some(n=>!loaded.has(n)))throw fatal??Error('Missing declared renderer dependencies.');
   return {png:Buffer.from(shot.data,'base64'),revisionSha256:contract.revisionSha256,complete:true,fontsReady:true,layoutReady:true,networkDenied:true,errors:[],loadedResources:[...loaded],evidence:{browser:browser.product,metrics,transport:'private-cdp-pipe',pid:child.pid}};
  }finally{
   clearInterval(watch);clearTimeout(deadline);
   let groupAlive=()=>false;
   if(child){
    groupAlive=()=>{try{process.kill(-child.pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
    if(!closed&&!fatal)await Promise.race([send('Browser.close',{},null).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,500))]);
    if(groupAlive()){try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1500))]);}
    if(groupAlive()){try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1500))]);}
    for(let i=0;i<10&&groupAlive();i++)await new Promise(resolve=>setTimeout(resolve,100));
    try{onProcess({state:closed&&!groupAlive()?'closed':'cleanup-incomplete',cleanupConfirmed:closed&&!groupAlive(),pid:child.pid,stderr});}catch{/* Cleanup must finish even if the evidence observer fails. */}
   }
   if(!child)try{onProcess({state:'not-started',cleanupConfirmed:true});}catch{/* Preserve cleanup even when observer fails. */}
   if(profile&&(!child||closed&&!groupAlive()))await rm(profile,{recursive:true,force:true});busy=false;
   if(child&&(!closed||groupAlive()))throw Error('Owned renderer cleanup incomplete; reconcile process before another render.');
  }
 }};
}

/** Derive only from trusted config + the task's exact pinned foundation. */
export function artifactGrantForContext(plan,context){
 const pins=context?.foundation?.sources??[],clientId=context?.scope?.clientId;
 const profiles=artifactProfiles(plan,clientId).filter(p=>p.files.every(f=>pins.some(pin=>pin.path===join(p.root,f.path)&&pin.sha256===f.sha256)));
 if(profiles.length>1)throw Error('Ambiguous artifact source assignment.');
 const profile=profiles[0];return profile?{profileId:profile.id,profileSha256:clientProfileHash(profile),clientId,workOrderId:profile.workOrderId}:null;
}
export function validateClientArtifactProfile(profile){
 exact(profile,['id','enabled','clientId','workOrderId','root','files','masters']);
 if(!slug.test(profile.id??'')||profile.enabled!==true||!uuid.test(profile.clientId??'')||!slug.test(profile.workOrderId??'')||!isAbsolute(profile.root??'')||!Array.isArray(profile.files)||!profile.files.length||profile.files.length>48||!Array.isArray(profile.masters)||!profile.masters.length||profile.masters.length>67)throw Error('Invalid artifact profile.');
 const ids=new Set(),paths=new Set();
 for(const f of profile.files){exact(f,['sourceId','path','sha256','status']);if(!slug.test(f.sourceId??'')||!sha.test(f.sha256??'')||!['draft','approved','rejected','reference'].includes(f.status)||typeof f.path!=='string'||f.path!==posix.normalize(f.path)||f.path.startsWith('/')||f.path.split('/').some(p=>!p||p==='..'||p==='.')||/[^a-zA-Z0-9_./-]/.test(f.path)||ids.has(f.sourceId)||paths.has(f.path))throw Error('Invalid artifact profile sources.');ids.add(f.sourceId);paths.add(f.path);}
 const masters=new Set();for(const m of profile.masters){exact(m,['id','htmlSourceId','cssSourceId','width','height',...(m.dataSourceId!==undefined?['dataSourceId']:[])]);if(!slug.test(m.id??'')||masters.has(m.id)||!ids.has(m.htmlSourceId)||!ids.has(m.cssSourceId)||m.dataSourceId&&!ids.has(m.dataSourceId)||!Number.isSafeInteger(m.width)||!Number.isSafeInteger(m.height)||m.width<1||m.height<1||m.width>4096||m.height>4096||m.width*m.height>8000000)throw Error('Invalid artifact profile master.');masters.add(m.id);}
 return profile;
}
