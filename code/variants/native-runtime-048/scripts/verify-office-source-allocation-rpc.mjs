// PREPARED ONLY. Explicit root test-go is required before invoking the flag below.
// No install/migration/seed. This tests an already-reviewed installed RPC using
// committed synthetic fixtures, then deletes only its exact generated client.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {localTestConfig} from './isolated-home-config.mjs';

assert.deepEqual(process.argv.slice(2),['--execute-isolated-synthetic-rpc'],
 'Prepared harness only. Do not execute before explicit test-go; use --execute-isolated-synthetic-rpc after reviewed RPC installation.');
const config=localTestConfig();
assert.equal(config.API_URL,'http://127.0.0.1:55421');
const database=new URL(config.DB_URL);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'55422');
const identity=JSON.parse(execFileSync('docker',['inspect','supabase_db_jarvis-home-test']))[0];
assert.match(identity.Config.Image,/supabase\/postgres:/);
assert.ok(Object.values(identity.HostConfig.PortBindings).flat().some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='55422'));
const dockerArgs=['exec','-i','supabase_db_jarvis-home-test','psql','-X','-qAt','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=1'];
const psql=sql=>execFileSync('docker',dockerArgs,{input:sql,encoding:'utf8',maxBuffer:8*1024*1024});
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sqlSource=await readFile(new URL('../supabase/office-source-allocation-cas.sql',import.meta.url),'utf8');
const expectedBody=sqlSource.split('$function$')[1];assert.ok(expectedBody);
const signature='public.office_cas_source_allocation(uuid,uuid,text,timestamptz,text)';
const installed=JSON.parse(psql(`SELECT json_build_object('body',p.prosrc,'definer',p.prosecdef,'settings',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))::text FROM pg_proc p WHERE p.oid=to_regprocedure(${quote(signature)});`).trim()||'null');
assert.ok(installed,'Reviewed RPC must already be installed by root; this harness never installs it');
assert.equal(installed.body.trim(),expectedBody.trim(),'Installed RPC differs from reviewed source');
assert.equal(installed.definer,false);assert.deepEqual(installed.settings,['search_path=public, pg_temp']);
assert.equal(installed.anon,false);assert.equal(installed.authenticated,false);assert.equal(installed.publicExecute,false);assert.equal(installed.service,true);
const triggerState=JSON.parse(psql(`SELECT json_agg(json_build_object('name',t.tgname,'enabled',t.tgenabled,'body',pg_get_functiondef(t.tgfoid)))::text FROM pg_trigger t WHERE t.tgrelid='public.client_brain_v2_records'::regclass AND NOT t.tgisinternal;`).trim());
for(const name of ['touch_client_brain_v2_records','version_client_brain_v2_records'])assert.ok(triggerState.some(t=>t.name===name&&['O','A'].includes(t.enabled)),`Required normal trigger missing or disabled: ${name}`);
assert.ok(triggerState.find(t=>t.name==='version_client_brain_v2_records').body.includes('to_jsonb(old)'));
const fingerprintSQL=`SELECT json_build_object(
 'clients',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.clients t),
 'records',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.client_brain_v2_records t),
 'versions',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.client_brain_v2_record_versions t),
 'publicFunctions',(SELECT md5(coalesce(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
 'triggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),'' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal))::text;`;
const before=JSON.parse(psql(fingerprintSQL).trim());
assert.equal(Number(psql(`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%office_cas_source_allocation%' AND pid<>pg_backend_pid();`).trim()),0,'Other RPC work already waiting; isolate this test first');
const id=randomUUID(),recordId=randomUUID(),activationIds=[randomUUID(),randomUUID()],fixtureName='TEST source CAS committed '+id;
const old={id,clientId:id,status:'audit_ready',executionMode:'audit_only',brandConfirmed:false,servicesConfirmed:false,sourceRevision:'a'.repeat(64),foundationId:'rpc-synthetic-old',revision:'b'.repeat(64),team:{capacity:1,agents:['synthetic-only']},scope:'SYNTHETIC READ-WRITE TEST ONLY '+ 'x'.repeat(12000)};
const nexts=[{...old,sourceRevision:'c'.repeat(64),foundationId:'rpc-synthetic-a',revision:'d'.repeat(64)},{...old,sourceRevision:'e'.repeat(64),foundationId:'rpc-synthetic-b',revision:'f'.repeat(64)}];
const oldText=JSON.stringify(old);assert.ok(Buffer.byteLength(oldText)>9902);
const readState=()=>JSON.parse(psql(`SELECT json_build_object('record',(SELECT to_jsonb(r) FROM public.client_brain_v2_records r WHERE r.id=${quote(recordId)}::uuid AND r.client_id=${quote(id)}::uuid),'versions',(SELECT coalesce(json_agg(to_jsonb(v) ORDER BY v.changed_at,v.id),'[]'::json) FROM public.client_brain_v2_record_versions v WHERE v.record_id=${quote(recordId)}::uuid AND v.client_id=${quote(id)}::uuid))::text;`).trim());
const rpc=async(body,token=config.SERVICE_ROLE_KEY)=>{const response=await fetch(config.API_URL+'/rest/v1/rpc/office_cas_source_allocation',{method:'POST',headers:{apikey:config.ANON_KEY,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json()};};
function authenticatedToken(){
 assert.equal(typeof config.JWT_SECRET,'string','Use only the existing isolated CLI JWT secret');
 assert.ok(config.JWT_SECRET.length>=16);
 const [header,payload,signature]=config.ANON_KEY.split('.');assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'HS256');
 assert.equal(createHmac('sha256',config.JWT_SECRET).update(header+'.'+payload).digest('base64url'),signature,'Local signing secret does not match isolated API');
 const now=Math.floor(Date.now()/1000),claims={iss:'supabase',aud:'authenticated',role:'authenticated',sub:randomUUID(),iat:now,exp:now+300};
 const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url'),signed=header+'.'+encoded;
 return signed+'.'+createHmac('sha256',config.JWT_SECRET).update(signed).digest('base64url');
}
async function holdRow(){
 const process=spawn('docker',dockerArgs,{stdio:['pipe','pipe','pipe']});
 let output='',errors='',released=false,exitCode=null;
 const done=new Promise((resolve,reject)=>{process.on('error',reject);process.on('close',code=>{exitCode=code;resolve(code)});});
 const ready=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Synthetic row-lock barrier did not become ready')),5000);
  process.stdout.on('data',chunk=>{output+=String(chunk);if(output.includes('CAS_LOCK_READY')){clearTimeout(timeout);resolve();}});
  process.stderr.on('data',chunk=>{errors+=String(chunk);});
  process.on('close',()=>{if(!output.includes('CAS_LOCK_READY')){clearTimeout(timeout);reject(Error('Row-lock session closed before ready: '+errors));}});
 });
 process.stdin.write(`BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='12s'; SELECT id FROM public.client_brain_v2_records WHERE client_id=${quote(id)}::uuid AND id=${quote(recordId)}::uuid AND stable_key='office:audit-pilot' FOR UPDATE;\n\\echo CAS_LOCK_READY\n`);
 const release=async()=>{if(!released){released=true;process.stdin.end('ROLLBACK;\n\\q\n');}await done;assert.equal(exitCode,0,'Row-lock session failed: '+errors);};
 try{await ready;}catch(error){await release().catch(()=>{});throw error;}
 return {release};
}
const signedAuthenticatedToken=authenticatedToken(); // validate local JWT config before fixture writes
let created=false,fixtureAttempted=false,holder,racing,bodyBytes,blockedPids=[],raceResults,winner,cleanupVerified=false;
const evidence=[];
try{
 fixtureAttempted=true;
 psql(`BEGIN; INSERT INTO public.clients(id,name) VALUES(${quote(id)}::uuid,${quote(fixtureName)}); INSERT INTO public.client_brain_v2_records(id,client_id,stable_key,top_section,subsection,record_type,title,knowledge_class,content,metadata) VALUES(${quote(recordId)}::uuid,${quote(id)}::uuid,'office:audit-pilot','intelligence','office','office_audit_pilot','TEST committed RPC CAS','operational',${quote(oldText)},'{"synthetic":"source-cas-rpc","preserved":"yes"}'); COMMIT;`);created=true;
 const original=readState();assert.equal(original.record.content,oldText);assert.equal(original.versions.length,0);
 const bodies=nexts.map((next,index)=>({p_client_id:id,p_activation_id:activationIds[index],p_expected_content:oldText,p_expected_updated_at:original.record.updated_at,p_next_content:JSON.stringify(next)}));bodyBytes=Buffer.byteLength(JSON.stringify(bodies[0]));
 const denied=await Promise.all([rpc(bodies[0],config.ANON_KEY),rpc(bodies[0],signedAuthenticatedToken)]);
 // PostgREST maps SQL permission denial to401 for anonymous and403 for authenticated.
 for(const [index,response] of denied.entries()){assert.equal(response.status,index===0?401:403,JSON.stringify({index,status:response.status,code:response.body.code,message:response.body.message}));assert.equal(response.body.code,'42501');}
 assert.deepEqual(readState(),original);evidence.push({check:'actual anonymous and valid authenticated JWT denied',status:denied.map(r=>r.status),dataAndHistoryUnchanged:true});
 holder=await holdRow();
 racing=Promise.allSettled(bodies.map(body=>rpc(body)));
 const deadline=Date.now()+4000;
 while(Date.now()<deadline){
  blockedPids=JSON.parse(psql(`SELECT coalesce(json_agg(pid),'[]'::json)::text FROM pg_stat_activity WHERE backend_type='client backend' AND usename='authenticator' AND state='active' AND wait_event_type='Lock' AND query LIKE '%office_cas_source_allocation%' AND pid<>pg_backend_pid();`).trim());
  if(new Set(blockedPids).size>=2)break;
  await sleep(50);
 }
 assert.equal(new Set(blockedPids).size,2,'Two distinct actual PostgREST database sessions must be blocked before releasing the row lock');
 await holder.release();holder=null;
 const settled=await racing;for(const response of settled)assert.equal(response.status,'fulfilled',response.reason?.message);
 raceResults=settled.map(response=>response.value);for(const response of raceResults)assert.equal(response.status,200);
 assert.deepEqual(raceResults.map(r=>r.body).sort(),[false,true]);winner=raceResults.findIndex(r=>r.body===true);
 const current=readState();assert.equal(current.record.content,bodies[winner].p_next_content);assert.equal(current.record.metadata.source_activation_id,activationIds[winner]);assert.equal(current.record.metadata.source_revision,nexts[winner].sourceRevision);assert.equal(current.record.metadata.preserved,'yes');
 assert.equal(current.versions.length,1);assert.deepEqual(current.versions[0].version_snapshot,original.record);
 evidence.push({check:'two blocked sessions large JSON race',blockedBackendPids:blockedPids,responses:raceResults,winner,historyRows:1,exactOldRowSnapshot:true});
 const stale=await Promise.all([rpc(bodies[0]),rpc(bodies[1])]);for(const response of stale){assert.equal(response.status,200);assert.equal(response.body,false);}assert.deepEqual(readState(),current);
 evidence.push({check:'stale and uncertain-ack retries',responses:stale,dataAndHistoryUnchanged:true});
 const forbidden={...bodies[winner],p_expected_content:current.record.content,p_expected_updated_at:current.record.updated_at,p_next_content:JSON.stringify({...nexts[1-winner],brandConfirmed:true})};
 const fieldExpansion=await rpc(forbidden);assert.equal(fieldExpansion.status,200);assert.equal(fieldExpansion.body,false);assert.deepEqual(readState(),current);
 const wrongClient=await rpc({...bodies[winner],p_client_id:randomUUID()});assert.equal(wrongClient.status,200);assert.equal(wrongClient.body,false);assert.deepEqual(readState(),current);
 evidence.push({check:'HTTP forbidden audit expansion and wrong tenant',responses:[fieldExpansion,wrongClient],dataAndHistoryUnchanged:true});
 }finally{
 const cleanupErrors=[];
 if(holder)await holder.release().catch(error=>cleanupErrors.push(error));
 if(racing)await racing; // settle both actual requests before fixture cleanup
 if(fixtureAttempted){
  try{
   const removed=psql(`BEGIN; DELETE FROM public.clients WHERE id=${quote(id)}::uuid AND name=${quote(fixtureName)} RETURNING id; COMMIT;`).trim();
   assert.ok(removed===id||(!created&&removed===''),'Cleanup must match only this exact generated client and tag');
   const remaining=JSON.parse(psql(`SELECT json_build_object('clients',(SELECT count(*) FROM public.clients WHERE id=${quote(id)}::uuid),'records',(SELECT count(*) FROM public.client_brain_v2_records WHERE client_id=${quote(id)}::uuid),'versions',(SELECT count(*) FROM public.client_brain_v2_record_versions WHERE client_id=${quote(id)}::uuid))::text;`).trim());
   assert.deepEqual(remaining,{clients:0,records:0,versions:0});cleanupVerified=true;
  }catch(error){cleanupErrors.push(error);}
 }
 try{const after=JSON.parse(psql(fingerprintSQL).trim());assert.deepEqual(after,before,'Existing real clients, records, versions, functions and triggers must remain byte-equivalent');}catch(error){cleanupErrors.push(error);}
 if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Cleanup or unchanged-data verification failed; inspect exact synthetic ID '+id);
}

console.log(JSON.stringify({status:'passed',executedAt:new Date().toISOString(),isolation:{api:config.API_URL,dbPort:database.port,container:'supabase_db_jarvis-home-test',image:identity.Config.Image},sqlSha256:hash(sqlSource),installedBodySha256:hash(installed.body),syntheticClientId:id,largeAllocationBytes:Buffer.byteLength(oldText),largeJsonPostBytes:bodyBytes,evidence,cleanupVerified,realClientDataAndSchemaFingerprintUnchanged:true,schemaInstalledByHarness:false,existingTriggersChanged:false,nativeModelCalls:0,limitations:['Tests the private-pilot RPC directly; does not establish complete filesystem/journal/fence activation or owner/source approval.','Existing normal touch trigger timestamp behavior retained; no strict monotonic timestamp promise.']},null,2));
