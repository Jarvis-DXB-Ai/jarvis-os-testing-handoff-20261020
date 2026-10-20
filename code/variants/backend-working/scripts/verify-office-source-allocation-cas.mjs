// Rollback-only real PostgreSQL verification. No seed, production env, providers,
// schema persistence, real-client writes, or automatically applied migration.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {localTestConfig} from './isolated-home-config.mjs';

const config=localTestConfig();
assert.equal(config.API_URL,'http://127.0.0.1:55421');
const dbUrl=new URL(config.DB_URL);assert.equal(dbUrl.hostname,'127.0.0.1');assert.equal(dbUrl.port,'55422');
const container=JSON.parse(execFileSync('docker',['inspect','supabase_db_jarvis-home-test']))[0];
assert.match(container.Config.Image,/supabase\/postgres:/);
assert.ok(Object.values(container.HostConfig.PortBindings).flat().some(b=>b.HostIp==='127.0.0.1'&&b.HostPort==='55422'));
const sql=await readFile(new URL('../supabase/office-source-allocation-cas.sql',import.meta.url),'utf8');
const signature='public.office_cas_source_allocation(uuid,uuid,text,timestamptz,text)';
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const psql=input=>execFileSync('docker',['exec','-i','supabase_db_jarvis-home-test','psql','-X','-U','postgres','-d','postgres','-At','--set','ON_ERROR_STOP=1'],{input,encoding:'utf8',maxBuffer:4*1024*1024});
const fingerprintSQL=`SELECT json_build_object(
 'clients',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.clients t),
 'records',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.client_brain_v2_records t),
 'versions',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.client_brain_v2_record_versions t),
 'publicFunctions',(SELECT md5(coalesce(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
 'triggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),'' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal),
 'casExists',to_regprocedure(${quote(signature)}) IS NOT NULL)::text;`;
const before=JSON.parse(psql(fingerprintSQL).trim());
assert.equal(before.casExists,false,'Do not replace a persistently installed function during this rollback-only test');
const id=randomUUID(),wrongId=randomUUID(),recordId=randomUUID(),otherRecordId=randomUUID(),activation=randomUUID();
const old={id,clientId:id,status:'audit_ready',executionMode:'audit_only',brandConfirmed:false,servicesConfirmed:false,sourceRevision:'a'.repeat(64),foundationId:'synthetic-old',revision:'b'.repeat(64),team:{agents:['synthetic-role'],capacity:1},scope:'SYNTHETIC ROLLBACK-ONLY '+ 'x'.repeat(12000)};
const next={...old,sourceRevision:'c'.repeat(64),foundationId:'synthetic-next',revision:'d'.repeat(64)};
const oldText=JSON.stringify(old),nextText=JSON.stringify(next);
assert.ok(Buffer.byteLength(oldText)>9902);
const rpcBody={p_client_id:id,p_activation_id:activation,p_expected_content:oldText,p_expected_updated_at:'2026-01-01T00:00:00Z',p_next_content:nextText};
// The uncommitted function is intentionally invisible to PostgREST. This proves
// large JSON reaches the real loopback transport (not RPC success or a DB write).
const transport=await fetch(config.API_URL+'/rest/v1/rpc/office_cas_source_allocation',{method:'POST',headers:{apikey:config.SERVICE_ROLE_KEY,authorization:'Bearer '+config.SERVICE_ROLE_KEY,'content-type':'application/json'},body:JSON.stringify(rpcBody),signal:AbortSignal.timeout(10000)});
const transportResult=await transport.json();
assert.equal(transport.status,404);assert.equal(transportResult.code,'PGRST202');
const call=(expected='old_text',time='old_time',content='next_text',client='client_id')=>`public.office_cas_source_allocation(${client},activation_id,${expected},${time},${content})`;
const checks=[];
const check=(label,body)=>{checks.push(label);return `\n-- ${label}\n${body}\nRAISE NOTICE 'PASS: ${label}';\n`;};
const testSQL=`BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
${sql}
CREATE FUNCTION pg_temp.office_cas_test_abort() RETURNS trigger LANGUAGE plpgsql AS $abort$
BEGIN IF NEW.client_id=${quote(id)}::uuid THEN RAISE EXCEPTION 'synthetic-after-update-failure'; END IF; RETURN NEW; END $abort$;
CREATE TRIGGER office_cas_synthetic_abort AFTER UPDATE ON public.client_brain_v2_records FOR EACH ROW EXECUTE FUNCTION pg_temp.office_cas_test_abort();
DO $test$
DECLARE
 client_id uuid := ${quote(id)}; wrong_id uuid := ${quote(wrongId)};
 rec_id uuid := ${quote(recordId)}; activation_id uuid := ${quote(activation)};
 old_text text := ${quote(oldText)}; next_text text := ${quote(nextText)};
 old_time timestamptz; next_time timestamptz; snapshot jsonb; count_before integer;
 actual_content text; actual_metadata jsonb; answer boolean; fault_seen boolean:=false;
BEGIN
 INSERT INTO public.clients(id,name) VALUES(client_id,'TEST rollback-only source CAS'),(wrong_id,'TEST rollback-only source CAS wrong tenant');
 INSERT INTO public.client_brain_v2_records(id,client_id,stable_key,top_section,subsection,record_type,title,knowledge_class,content,metadata,updated_at)
 VALUES(rec_id,client_id,'office:audit-pilot','intelligence','office','office_audit_pilot','TEST source CAS','operational',old_text,'{"preserved":"yes"}',clock_timestamp());
 INSERT INTO public.client_brain_v2_records(id,client_id,stable_key,top_section,subsection,record_type,title,knowledge_class,content)
 VALUES(${quote(otherRecordId)}::uuid,client_id,'office:unrelated','intelligence','office','office_audit_pilot','TEST unrelated CAS','operational','unchanged');
 SELECT updated_at INTO old_time FROM public.client_brain_v2_records WHERE id=rec_id;
${check('security invoker search path and service-only execute',`
 IF (SELECT prosecdef FROM pg_proc WHERE oid=${quote(signature)}::regprocedure) THEN RAISE EXCEPTION 'unexpected definer'; END IF;
 IF (SELECT proconfig FROM pg_proc WHERE oid=${quote(signature)}::regprocedure) IS DISTINCT FROM ARRAY['search_path=public, pg_temp'] THEN RAISE EXCEPTION 'unsafe search path'; END IF;
 IF has_function_privilege('anon',${quote(signature)},'EXECUTE') OR has_function_privilege('authenticated',${quote(signature)},'EXECUTE') OR NOT has_function_privilege('service_role',${quote(signature)},'EXECUTE') THEN RAISE EXCEPTION 'wrong execute privileges'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=${quote(signature)}::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC execute grant'; END IF;
 FOR count_before IN 1..2 LOOP
  BEGIN
   IF count_before=1 THEN EXECUTE 'SET LOCAL ROLE anon'; ELSE EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
   PERFORM ${call()};
   EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'untrusted role executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; END;
 END LOOP;
`)}
${check('wrong tenant and missing allocation create no history',`
 IF ${call('old_text','old_time','next_text','wrong_id')} THEN RAISE EXCEPTION 'wrong tenant passed'; END IF;
 IF EXISTS(SELECT 1 FROM public.client_brain_v2_record_versions WHERE record_id=rec_id) THEN RAISE EXCEPTION 'false created history'; END IF;
`)}
${check('exact bytes and timestamp reject stale payloads',`
 IF ${call("old_text || ' '")} OR ${call('old_text',"old_time-interval '1 microsecond'")} THEN RAISE EXCEPTION 'stale passed'; END IF;
`)}
${check('identity audit boundaries and arbitrary field expansion reject',`
 IF ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{clientId}',to_jsonb(wrong_id::text))::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{id}',to_jsonb(wrong_id::text))::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{brandConfirmed}','true')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{servicesConfirmed}','true')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{status}','\"ready\"')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{executionMode}','\"approved\"')::text")}
 OR ${call('old_text','old_time',"(next_text::jsonb || '{\"unexpected\":true}')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{team,capacity}','2')::text")}
 OR ${call('old_text','old_time',"(next_text::jsonb-'scope')::text")}
 THEN RAISE EXCEPTION 'forbidden expansion passed'; END IF;
`)}
${check('malformed JSON null and revision formats reject',`
 IF ${call('old_text','old_time',"'{invalid'")} OR ${call('old_text','old_time',"'null'")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{sourceRevision}','\"bad\"')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{revision}','\"bad\"')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{foundationId}','\"../bad\"')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{brandConfirmed}','\"false\"')::text")}
 OR ${call('old_text','old_time','NULL')} OR ${call('NULL')}
 THEN RAISE EXCEPTION 'malformed input passed'; END IF;
 IF EXISTS(SELECT 1 FROM public.client_brain_v2_record_versions WHERE record_id=rec_id) THEN RAISE EXCEPTION 'rejection created history'; END IF;
`)}
${check('unchanged source foundation or revision is not a source activation',`
 IF ${call('old_text','old_time','old_text')}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{sourceRevision}',to_jsonb(repeat('a',64)))::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{foundationId}','\"synthetic-old\"')::text")}
 OR ${call('old_text','old_time',"jsonb_set(next_text::jsonb,'{revision}',to_jsonb(repeat('b',64)))::text")}
 THEN RAISE EXCEPTION 'nonactivation passed'; END IF;
 IF EXISTS(SELECT 1 FROM public.client_brain_v2_record_versions WHERE record_id=rec_id) THEN RAISE EXCEPTION 'nonactivation created history'; END IF;
`)}
${check('update failure rolls back trigger history and exact content',`
 BEGIN PERFORM ${call()}; EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'synthetic-after-update-failure' THEN RAISE; END IF; fault_seen:=true;
 END;
 IF NOT fault_seen THEN RAISE EXCEPTION 'fault was not exercised'; END IF;
 IF (SELECT content FROM public.client_brain_v2_records WHERE id=rec_id) IS DISTINCT FROM old_text OR EXISTS(SELECT 1 FROM public.client_brain_v2_record_versions WHERE record_id=rec_id) THEN RAISE EXCEPTION 'failed update left data or history'; END IF;
 DROP TRIGGER office_cas_synthetic_abort ON public.client_brain_v2_records;
`)}
${check('service role large-content winner creates one exact trigger snapshot',`
 EXECUTE 'SET LOCAL ROLE service_role'; answer:=${call()}; EXECUTE 'RESET ROLE';
 IF NOT answer THEN RAISE EXCEPTION 'large CAS failed'; END IF;
 SELECT content,metadata,updated_at INTO actual_content,actual_metadata,next_time FROM public.client_brain_v2_records WHERE id=rec_id;
 IF actual_content IS DISTINCT FROM next_text OR actual_metadata->>'preserved'<>'yes' OR actual_metadata->>'source_revision'<>repeat('c',64) OR actual_metadata->>'source_activation_id'<>activation_id::text THEN RAISE EXCEPTION 'saved content or metadata mismatch'; END IF;
 IF (SELECT count(*) FROM public.client_brain_v2_record_versions WHERE record_id=rec_id)<>1 THEN RAISE EXCEPTION 'duplicate or missing history'; END IF;
 SELECT version_snapshot INTO snapshot FROM public.client_brain_v2_record_versions WHERE record_id=rec_id;
 IF snapshot->>'content' IS DISTINCT FROM old_text OR snapshot->'metadata' IS DISTINCT FROM '{"preserved":"yes"}'::jsonb OR (snapshot->>'updated_at')::timestamptz IS DISTINCT FROM old_time OR snapshot->>'id'<>rec_id::text OR snapshot->>'client_id'<>client_id::text THEN RAISE EXCEPTION 'history not exact previous row'; END IF;
 IF next_time IS DISTINCT FROM now() THEN RAISE EXCEPTION 'existing touch trigger contract changed'; END IF;
 IF (SELECT content FROM public.client_brain_v2_records WHERE id=${quote(otherRecordId)}::uuid)<>'unchanged' THEN RAISE EXCEPTION 'unrelated stable key changed'; END IF;
`)}
${check('stale loser and uncertain-ack retry create no additional history',`
 IF ${call()} OR ${call('old_text','next_time')} THEN RAISE EXCEPTION 'stale loser passed'; END IF;
 IF (SELECT count(*) FROM public.client_brain_v2_record_versions WHERE record_id=rec_id)<>1 THEN RAISE EXCEPTION 'stale loser created history'; END IF;
`)}
${check('explicit inverse CAS supports rollback with another exact snapshot',`
 IF NOT ${call('next_text','next_time','old_text')} THEN RAISE EXCEPTION 'inverse CAS failed'; END IF;
 IF (SELECT content FROM public.client_brain_v2_records WHERE id=rec_id) IS DISTINCT FROM old_text OR (SELECT count(*) FROM public.client_brain_v2_record_versions WHERE record_id=rec_id)<>2 THEN RAISE EXCEPTION 'inverse CAS or history mismatch'; END IF;
`)}
END $test$;
ROLLBACK;
`;
let output;
try{output=psql(testSQL);}finally{const after=JSON.parse(psql(fingerprintSQL).trim());assert.deepEqual(after,before,'Rollback must preserve original data, functions and triggers exactly');}
assert.ok(output.includes('ROLLBACK'));
console.log(JSON.stringify({status:'passed',isolation:{api:config.API_URL,dbPort:dbUrl.port,container:'supabase_db_jarvis-home-test',image:container.Config.Image},sqlSha256:createHash('sha256').update(sql).digest('hex'),checks,largeAllocationBytes:Buffer.byteLength(oldText),largeJsonPostBytes:Buffer.byteLength(JSON.stringify(rpcBody)),transport:{status:transport.status,code:transportResult.code,meaning:'large JSON accepted by actual local transport; uncommitted RPC deliberately invisible, no HTTP RPC success claimed'},dataAndSchemaFingerprintUnchanged:true,rollback:true,realClientWrites:0,nativeModelCalls:0,limitations:['True concurrent committed-winner race not tested: uncommitted function/fixtures invisible to another connection; rowlock plus serial winner/stale loser exercised.','RPC HTTP success not tested without persistent function installation.','Existing touch trigger owns updated_at=now(); no stronger monotonic timestamp guarantee.']},null,2));
