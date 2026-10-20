import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createJob,executeJob,readJob} from './lib/office-team-engine.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'office-engine-init-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const jobPath=join(directory,'jobs'),storage={testing:true,recordsVolume:directory,recordsRoot:join(directory,'records')};await mkdir(join(storage.recordsRoot,'library/references'),{recursive:true});
 const plan={storage,roles:[{id:'copy',name:'Copy',output:'Synthetic text'}],executives:[],focusDepartments:[]},id=randomUUID();
 await createJob({id,brief:'Synthetic initialization regression',context:'No native model calls allowed.',criteria:['No native model calls.']},jobPath,{queueManaged:true});
 return {directory:jobPath,storage,plan,id};
}
async function noLock(directory){await assert.rejects(access(join(directory,'active-team.lock')),{code:'ENOENT'});}

test('corrupt research initialization saves a known failure and releases the execution slot before any native call',async t=>{
 const f=await fixture(t),catalogue=join(f.storage.recordsRoot,'library/references/catalogue.json');await writeFile(catalogue,'{corrupt');let apiCalls=0;
 const result=await executeJob(f.id,f.plan,{directory:f.directory,modelPolicy:()=>assert.fail('No model policy should be reached'),api:async()=>{apiCalls++;assert.fail('No native API should be reached');}});
 assert.equal(result.status,'failed');assert.match(result.error,/JSON|property/i);assert.equal(result.calls.length,0);assert.equal(apiCalls,0);assert.equal((await readJob(f.id,f.directory)).status,'failed');await noLock(f.directory);
 await writeFile(catalogue,JSON.stringify({version:1,items:[]}));const next=randomUUID();await createJob({id:next,brief:'Synthetic next queued task',context:'No native models.',criteria:['No model calls.']},f.directory,{queueManaged:true});
 const second=await executeJob(next,f.plan,{directory:f.directory,modelPolicy:()=>assert.fail('No models'),api:async()=>[]});assert.equal(second.status,'failed');assert.match(second.error,/roles must be connected/);await noLock(f.directory);
});

test('invalid actor response during initialization releases the slot without authorizing a model',async t=>{
 const f=await fixture(t);await writeFile(join(f.storage.recordsRoot,'library/references/catalogue.json'),JSON.stringify({version:1,items:[]}));
 const result=await executeJob(f.id,f.plan,{directory:f.directory,api:async()=>({unexpected:'actors'}),modelPolicy:()=>assert.fail('No models')});
 assert.equal(result.status,'failed');assert.match(result.error,/find/);assert.equal(result.calls.length,0);await noLock(f.directory);
});

test('failed operational save still releases the acquired slot when final persistence also fails',async t=>{
 const f=await fixture(t),jobPath=join(f.directory,f.id+'.json');let nativeCalls=0;
 // Simulate the operational target becoming unwritable after the initial read.
 const {storage:_storage,...plan}=f.plan;void _storage;
 await assert.rejects(executeJob(f.id,plan,{directory:f.directory,modelPolicy:()=>assert.fail('No models'),api:async()=>{nativeCalls++;await rm(jobPath);await mkdir(jobPath);return [];}}),/EISDIR|ENOTDIR|directory/i);
 assert.equal(nativeCalls,1);await noLock(f.directory);
 // The engine must not unlink a separately owned execution slot on contention.
 await rm(jobPath,{recursive:true});await createJob({id:f.id,brief:'Synthetic contention fixture',context:'No native models.',criteria:['No model calls.']},f.directory,{queueManaged:true});
 const lock=join(f.directory,'active-team.lock');await writeFile(lock,'existing owner');const result=await executeJob(f.id,plan,{directory:f.directory,api:async()=>assert.fail('Existing slot must block initialization')});assert.equal(result.status,'queued');assert.equal(await readFile(lock,'utf8'),'existing owner');
});
