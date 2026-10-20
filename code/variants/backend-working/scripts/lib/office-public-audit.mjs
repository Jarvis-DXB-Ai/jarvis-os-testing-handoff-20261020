import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {publicUrl} from '../../src/lib/office-client-team.mjs';
export function publicAddress(ip){
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224||a===198&&[18,19,51].includes(b)||a===192&&b===0||a===203&&b===0);}
 if(isIP(ip)===6){const x=ip.toLowerCase();return /^2[0-9a-f]{3}:/.test(x)&&!x.startsWith('2001:db8:');}return false;
}
export async function readPublicPage(value,{resolve=lookup,transport}={}){
 let url=new URL(publicUrl(value));
 for(let redirects=0;redirects<4;redirects++){
  const addresses=await resolve(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Research cannot reach private or reserved network addresses.');
  const selected=addresses[0];
  const read=transport??((u,address)=>new Promise((accept,reject)=>{
   const req=(u.protocol==='https:'?httpsRequest:httpRequest)(u,{method:'GET',headers:{'User-Agent':'Jarvis-Client-Audit/1.0','Accept':'text/html'},lookup:(_host,options,cb)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)},res=>{
    let size=0;const parts=[];res.on('data',chunk=>{size+=chunk.length;if(size>1500000){res.destroy();reject(new Error('Page exceeds the audit size limit.'));}else parts.push(chunk);});res.on('end',()=>accept({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString('utf8')}));res.on('error',reject);
   });req.setTimeout(10000,()=>req.destroy(new Error('Public website took too long to respond.')));req.on('error',reject);req.end();
  }));
  const response=await read(url,selected);
  if([301,302,303,307,308].includes(response.status)){if(!response.headers.location)throw new Error('Redirect had no destination.');url=new URL(publicUrl(new URL(response.headers.location,url).href));continue;}
  if(response.status!==200)throw new Error(`Public page returned HTTP ${response.status}.`);
  if(!String(response.headers['content-type']??'').includes('text/html'))throw new Error('Only public HTML pages can be audited.');return {url:url.href,html:response.body};
 }throw new Error('Public source redirected too many times.');
}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
export function inspectPublicHtml(url,html){
 const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'Untitled public page').replace(/<[^>]+>/g,'').trim().slice(0,200);
 const metas=[...html.matchAll(/<meta\b[^>]+>/gi)];const description=decode(metas.find(m=>/name=["']description["']/i.test(m[0]))?.[0].match(/content=["']([^"']*)/i)?.[1]??'').slice(0,1000);
 const text=decode(html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim().slice(0,10000);
 const colours=[...new Set([...html.matchAll(/#[0-9a-f]{6}\b/gi)].map(m=>m[0].toUpperCase()))].slice(0,8);
 const fonts=[...new Set([...html.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map(m=>m[1].replace(/["']/g,'').trim()))].slice(0,5);
 const socialLinks=[...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/^https:\/\/(?:www\.)?(?:instagram\.com|linkedin\.com|facebook\.com|tiktok\.com|youtube\.com)\//i.test(x)))].slice(0,5);
 const headings=[...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map(m=>decode(m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim()).filter(Boolean).slice(0,8);
 const findings=[{area:'Positioning',observation:description||title,recommendation:'Confirm that this public description matches the current offer and intended audience.'},{area:'Search presentation',observation:description?'A public page description was detected.':'No standard page description was detected in this HTML.',recommendation:description?'Check message consistency across search and social previews.':'Review search/social preview metadata on the rendered site.'},{area:'Content hierarchy',observation:headings.length?headings.join(' / '):'No readable main headings detected.',recommendation:'Check whether visitors can understand the offer and next step without relying on an animation.'},{area:'Visual system',observation:`${colours.length} colour candidates and ${fonts.length} font declarations found in public HTML.`,recommendation:'Compare these candidates against the supplied logo, brand files and actual rendered pages.'}];
 return {url,status:'read',title,description,text,colours,fonts,socialLinks,findings,checkedAt:new Date().toISOString(),sha256:createHash('sha256').update(html).digest('hex'),message:'Public HTML inspected. Colours and typography are candidates; no visual approval inferred.'};
}
export async function auditPublicSources(urls,options){return Promise.all([...new Set(urls)].map(async (url,index)=>{try{if(index>=10)throw new Error('Audit source limit reached; this reference still needs a separate read.');}catch(e){return{url,status:'unavailable',title:'Not read',description:'',text:'',colours:[],fonts:[],socialLinks:[],checkedAt:new Date().toISOString(),sha256:null,message:e.message};}try{const page=await readPublicPage(url,options);return inspectPublicHtml(page.url,page.html);}catch(e){return{url,status:'unavailable',title:'Source unavailable',description:'',text:'',colours:[],fonts:[],socialLinks:[],checkedAt:new Date().toISOString(),sha256:null,message:e.message};}}));}
