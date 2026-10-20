import{test}from'node:test';import assert from'node:assert/strict';
import{createPaperclipSnapshotReader}from'./lib/office-paperclip-snapshot.mjs';import{projectPaperclipSnapshot}from'../src/lib/office-paperclip.ts';
const companyId='013ec13f-583a-525c-b113-c2651409f3a5',config={base:'http://127.0.0.1:3100',companyId,local:true};
const data=path=>path==='/api/health'?{status:'ok',version:'fixture'}:path.endsWith('/agents')?Array.from({length:174},(_,i)=>({id:'actor-'+i,name:'Actor',adapterType:'claude_local',adapterConfig:{model:'fixture',env:{TOKEN:'secret'}}})):path.includes('/issues?')?[{id:'issue',title:'Fixture',description:'private text',parentId:'parent'}]:path.includes('/heartbeat-runs?')?[]:{id:companyId,name:'Fixture'};
test('concurrent pollers share five compact reads, retain all actors, and cached timestamps do not pretend to refresh',async()=>{
 let time=10000,calls=0;const paths=[];const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,clock:()=>time,fetchImpl:async url=>{calls++;paths.push(url.pathname+url.search);await new Promise(r=>setTimeout(r,5));return Response.json(data(url.pathname+url.search));}});
 const rows=await Promise.all(Array.from({length:20},()=>reader(config)));assert.equal(calls,5);assert.ok(rows.every(r=>r.status==='connected'));assert.equal(rows[0].agents.length,174);assert.ok(paths.includes('/api/companies/'+companyId+'/issues?view=compact&limit=100&sortField=updated&sortDir=desc'));assert.equal(rows[0].issues[0].parentId,'parent');assert.ok(!JSON.stringify(rows).includes('private text'));assert.ok(!JSON.stringify(rows).includes('secret'));const original=rows[0].checkedAt;
 time+=500;assert.equal((await reader(config)).checkedAt,original);assert.equal(calls,5);time+=501;assert.notEqual((await reader(config)).checkedAt,original);assert.equal(calls,10);
});
test('one transient GET timeout retries only the affected read and recovers without a 30-second outage',async()=>{
 let attempts=0;const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,wait:async()=>{},fetchImpl:async url=>{if(url.pathname.endsWith('/issues')&&attempts++===0)throw new DOMException('Fixture timeout','TimeoutError');return Response.json(data(url.pathname+url.search));}});assert.equal((await reader(config)).status,'connected');assert.equal(attempts,2);
});
test('actual authentication refusal is labelled accurately, never retried, and changed credentials invalidate cached failure',async()=>{
 let calls=0;const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,wait:async()=>{throw Error('Authentication must not retry');},fetchImpl:async(url,options)=>{calls++;return options.headers.Authorization==='Bearer corrected'?Response.json(data(url.pathname+url.search)):new Response('private server details',{status:401});}});
 const first=await reader({...config,token:'old'});assert.equal(first.connectionError,'authentication');assert.match(first.message,/HTTP 401/);assert.ok(!JSON.stringify(first).includes('private server'));assert.equal(calls,5);assert.equal((await reader({...config,token:'corrected'})).status,'connected');assert.equal(calls,10);
});
test('a failed refresh stays unknown rather than returning a healthy stale roster, and next poll recovers',async()=>{
 let time=10000,fail=false;const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,clock:()=>time,wait:async()=>{},fetchImpl:async url=>{if(fail)throw new TypeError('Private connection detail');return Response.json(data(url.pathname+url.search));}});
 assert.equal((await reader(config)).status,'connected');time+=1001;fail=true;const down=await reader(config);assert.equal(down.status,'unavailable');assert.equal(down.connectionError,'network');assert.deepEqual(down.agents,[]);assert.ok(!down.message.includes('authorised'));assert.ok(!down.message.includes('Private connection detail'));time+=1001;fail=false;assert.equal((await reader(config)).status,'connected');
});
test('bad payloads and foreign-company responses cannot establish a working connection',async()=>{
 for(const broken of ['json','company','agents']){const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,fetchImpl:async url=>{const path=url.pathname+url.search;if(broken==='json')return new Response('not JSON');let value=data(path);if(broken==='company'&&path.endsWith(companyId))value={id:'foreign',name:'Other'};if(broken==='agents'&&path.endsWith('/agents'))value={actors:[]};return Response.json(value);}});const result=await reader(config);assert.equal(result.status,'unavailable');assert.equal(result.connectionError,'response');assert.equal(result.company,null);}
});
test('invalid configuration and unauthenticated remote/production loopback connections make no network requests',async()=>{
 let calls=0;const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,fetchImpl:async()=>{calls++;throw Error('Unexpected request');}});
 for(const c of[{...config,local:false},{...config,base:'http://example.com'},{...config,base:'https://example.com'},{...config,base:'http://u:p@localhost:3100'},{...config,base:'http://127.0.0.1:3100/?token=private'},{...config,companyId:'bad'}])assert.equal((await reader(c)).connectionError,'configuration');assert.equal((await reader({...config,base:''})).status,'not_configured');assert.equal(calls,0);
});

test('an interrupted response body retries as a transport read, while malformed JSON does not',async()=>{
 let bodies=0;const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,wait:async()=>{},fetchImpl:async url=>{const path=url.pathname+url.search;if(path.endsWith('/agents'))return{ok:true,json:async()=>{if(bodies++===0)throw new TypeError('Body connection lost');return data(path);}};return Response.json(data(path));}});assert.equal((await reader(config)).status,'connected');assert.equal(bodies,2);
});
test('a failed endpoint does not release the shared request while its other reads remain in flight',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);const reader=createPaperclipSnapshotReader({project:projectPaperclipSnapshot,fetchImpl:async url=>{calls++;if(url.pathname==='/api/health')return new Response('',{status:403});await gate;return Response.json(data(url.pathname+url.search));}});const first=reader(config);await Promise.resolve();const second=reader(config);assert.equal(calls,5);release();const rows=await Promise.all([first,second]);assert.ok(rows.every(x=>x.connectionError==='authentication'));assert.equal(calls,5);
});
