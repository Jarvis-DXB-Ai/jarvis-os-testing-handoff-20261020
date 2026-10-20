import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire,Module} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig,localAppEnvironment} from './isolated-home-config.mjs';
const config=localTestConfig();Object.assign(process.env,localAppEnvironment(config),{ZERNIO_API_KEY:'TEST-NEVER-SENT'});
const require=createRequire(import.meta.url),oldResolve=Module._resolveFilename,oldLoad=Module._load;
Module._resolveFilename=function(name,...args){if(name.startsWith('@/')){const base=resolve('src',name.slice(2));name=[base+'.ts',base+'.tsx',base+'/index.ts'].find(existsSync)||base;}return oldResolve.call(this,name,...args);};
Module._load=function(name,...args){if(name==='server-only')return {};return oldLoad.call(this,name,...args);};
Module._extensions['.ts']=function(module,path){module._compile(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,path);};
const db=createClient(config.API_URL,config.SERVICE_ROLE_KEY),clientId=randomUUID(),otherId=randomUUID();
const account='test-account-'+randomUUID(),facebookAccount='test-facebook-'+randomUUID();const realFetch=globalThis.fetch,calls=[];let failSecondPage=false;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.hostname==='127.0.0.1'){assert.ok(['55421','3101'].includes(url.port));return realFetch(input,init);}
 assert.equal(url.hostname,'zernio.com','No unmocked external network allowed');calls.push(url);
 assert.equal(init?.method,'GET');assert.ok([account,facebookAccount].includes(url.searchParams.get('accountId'))||[account,facebookAccount].includes(url.searchParams.get('accountIds'))||url.pathname.endsWith('/post-timeline'),'Every account query must be scoped');
 const p=url.pathname,q=url.searchParams,requestedAccount=q.get('accountId')||q.get('accountIds')||account,platform=q.get('platform')||'instagram';
 if(p.endsWith('/analytics')){const page=Number(q.get('page'));if(failSecondPage&&page===2)return json({error:'TEST page failure'},503);const metric={likes:0,shares:null,follows:8,reposts:2,igReelsAvgWatchTime:2100,igReelsVideoViewTotalTime:98765,reelsSkipRate:48.8,videoDurationSeconds:15,extraNewMetric:17,accessToken:'do not store',thumbnailUrl:'https://private.invalid'};return json({posts:[{_id:`TEST-${q.get('fromDate')}-${page}`,content:'Synthetic reel',mediaType:'reel',publishedAt:q.get('fromDate'),platform,accountId:requestedAccount,analytics:metric}],pagination:{page,pages:2,total:2,limit:100}});}
 if(p.endsWith('/follower-history'))return json({accountId:account,metrics:{follower_count:{values:[{date:'2026-09-01',value:99}]},followers_gained:{values:[{date:'2026-09-01',value:3}]}}});
 if(p.endsWith('/account-insights'))return json({accountId:account,platform:'instagram',metrics:{reach:{total:123,values:[{date:'2026-09-01',value:70}]},replies:{total:9},reposts:{total:4}},unavailableMetrics:[{metric:'views',reason:'no_data'}]});
 if(p.endsWith('/demographics'))return json({accountId:account,timeframe:'this_month',demographics:{city:Array.from({length:12},(_,i)=>({dimension:`City ${i}`,value:i+1})),gender:[{dimension:'F',value:75},{dimension:'M',value:25}]}});
 if(p.endsWith('/content-decay'))return json({error:'Analytics not available'},403);
 if(p.endsWith('/best-time'))return json({slots:[{day_of_week:6,hour:23,avg_engagement:55.5,post_count:8}]});
 if(p.endsWith('/post-timeline'))return json({postId:q.get('postId'),timeline:[{date:'2026-09-01',likes:20}]});
 return json({accountId:requestedAccount,metrics:{extra_metric:{total:42}}});
};
const save=async(table,rows)=>assert.ifError((await db.from(table).insert(rows)).error);
try{
 await save('clients',[{id:clientId,name:'TEST Analytics coverage'},{id:otherId,name:'TEST Analytics other'}]);
 await save('social_provider_connections',{client_id:clientId,provider:'zernio',platform:'instagram',provider_connection_id:account,platform_account_id:'external-platform-id',status:'connected'});
 const {syncSocialPerformance,getCachedSocialPerformance,refreshPostAnalytics}=require('../src/lib/social-performance-server.ts');
 const {analyticsRequests,safeAnalyticsData}=require('../src/lib/social-analytics-catalog.ts');
 assert.equal(analyticsRequests('facebook',account,'2026-08-01','2026-08-30').length,9);
 assert.deepEqual(safeAnalyticsData({x:null,zero:0,token:'secret',url:'https://private.invalid',replies:4}),{x:null,zero:0,replies:4});
 const result=await syncSocialPerformance(clientId);assert.equal(result.postObservations.length,2);assert.equal(result.platforms.facebook.current,null);
 const post=result.postObservations[0];assert.equal(post.likes,0);assert.equal(post.shares,null);assert.equal(post.analyticsDetails.reelsSkipRate,48.8);assert.equal(post.analyticsDetails.extraNewMetric,17);assert.ok(!('accessToken' in post.analyticsDetails));
 assert.equal(result.audience.topCities.length,12);const resources=result.platforms.instagram.current.analyticsResources;assert.equal(resources.length,11);assert.equal(resources.find(r=>r.key==='content_decay').status,'unavailable');assert.equal(resources.find(r=>r.key==='account').data.metrics.replies.total,9);
 const before=calls.length;await getCachedSocialPerformance(clientId);assert.equal(calls.length,before,'Page data must not trigger Zernio');
 await assert.rejects(()=>refreshPostAnalytics(otherId,post.id));assert.equal(calls.length,before,'Cross-client post must fail before provider read');
 const extra=await refreshPostAnalytics(clientId,post.id);assert.equal(extra.reports[0].data.timeline[0].likes,20);
 await save('social_provider_connections',{client_id:clientId,provider:'zernio',platform:'facebook',provider_connection_id:facebookAccount,platform_account_id:'facebook-external-id',status:'connected'});
 const both=await syncSocialPerformance(clientId);assert.equal(both.platforms.facebook.current.analyticsResources.length,9);assert.equal(both.platforms.facebook.current.providerAccountId,facebookAccount);assert.equal(both.postObservations.filter(p=>p.platform==='facebook').length,2);
 failSecondPage=true;await assert.rejects(()=>syncSocialPerformance(clientId));const afterFailure=await getCachedSocialPerformance(clientId);assert.equal(afterFailure.platforms.instagram.current.id,both.platforms.instagram.current.id,'Partial pagination must not replace the complete snapshot');
 console.log('PASS: mapped account scoping, single-platform sync, full pagination, future/native metric preservation, zero/null, complete demographics, isolated optional failure, cached reads, post timeline ownership, and partial-page failure preserving prior snapshots. No live provider calls.');
}finally{globalThis.fetch=realFetch;assert.ifError((await db.from('clients').delete().in('id',[clientId,otherId])).error);}
