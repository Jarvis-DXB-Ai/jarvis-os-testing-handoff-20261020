import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,readdir,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {appendApprovalReceipt,readApprovalReceipts,revokeApprovalReceipt,validateApprovalEvidence} from './lib/office-approval-receipts.mjs';

// SYNTHETIC FIXTURES ONLY. This verifier deliberately trusts a fictional identity;
// it proves storage/matching contracts, never real owner approval or provider QC.
const sha=text=>createHash('sha256').update(text).digest('hex');
const scope={clientId:'synthetic-client-a',foundationKey:'synthetic-foundation'};
const subjects=[{kind:'proposal',id:'synthetic-proposal',sha256:sha('synthetic proposal v1')},{kind:'scope',id:'synthetic-scope',sha256:sha('synthetic scope v1')}];
const evidence=[{kind:'synthetic-evidence',id:'not-real-owner-approval',sha256:sha('fictional fixture assertion')}];
const context=(type='owner',subject='synthetic-owner')=>({authority:{type,subject,provider:'synthetic-test-only',verificationId:'synthetic-verification'},verifyAuthority:()=>true});
const input=(overrides={})=>({scope,kind:'owner-approval',decision:'approved',subjects,evidence,idempotencyKey:'synthetic-retry-1',expectedRevision:null,...overrides});
const check=(state,overrides={})=>validateApprovalEvidence({receipts:state.receipts,scope,kind:'owner-approval',subjects,now:new Date().toISOString(),...overrides});
async function fixture(t){
 const volume=await mkdtemp(join(tmpdir(),'office-synthetic-receipts-'));
 t.after(()=>rm(volume,{recursive:true,force:true}));
 const config={testing:true,recordsVolume:volume,recordsRoot:join(volume,'Office')};await mkdir(config.recordsRoot);
 return config;
}
async function storeBase(config){return join(config.recordsRoot,'approval-evidence',(await readdir(join(config.recordsRoot,'approval-evidence')))[0]);}

test('synthetic: missing ledger stays missing; typed legacy notes are never migrated',async t=>{
 const config=await fixture(t);await mkdir(join(config.recordsRoot,'knowledge'));
 await writeFile(join(config.recordsRoot,'knowledge','legacy-approved.json'),JSON.stringify({status:'approved',approvalNote:'Owner said ready',approvedAt:new Date().toISOString()}));
 const state=await readApprovalReceipts(config,scope);
 assert.equal(state.revision,null);assert.deepEqual(check(state),{valid:false,reason:'missing',receiptId:null});
 assert.deepEqual(await readdir(config.recordsRoot),['knowledge']);
});

test('synthetic: exact version approval roundtrips immutable server receipts',async t=>{
 const config=await fixture(t),saved=await appendApprovalReceipt(config,input(),context());
 assert.equal(saved.replayed,false);assert.match(saved.receipt.id,/^r-/);assert.match(saved.receipt.revision,/^[a-f0-9]{64}$/);
 assert.equal(check(saved).valid,true);assert.equal(check(await readApprovalReceipts(config,scope)).valid,true);
 assert.equal(Object.isFrozen(saved.receipt.authority),true);assert.equal(Object.isFrozen(saved.receipts),true);
 assert.throws(()=>{saved.receipt.authority.subject='another-owner';},TypeError);
 assert.equal(check(saved,{subjects:[...subjects].reverse()}).valid,true);
});

test('synthetic: current artifact hash and exact subject set invalidate prior approval',async t=>{
 const saved=await appendApprovalReceipt(await fixture(t),input(),context());
 assert.equal(check(saved,{subjects:[subjects[0],{...subjects[1],sha256:sha('changed scope')}]}).reason,'stale-or-inexact-subjects');
 assert.equal(check(saved,{subjects:[subjects[0]]}).reason,'stale-or-inexact-subjects');
 assert.equal(check(saved,{subjects:[...subjects,{kind:'asset',id:'extra',sha256:sha('extra')}]}).reason,'stale-or-inexact-subjects');
});

test('synthetic: cross-client/foundation and owner-versus-independent-QC isolation',async t=>{
 const config=await fixture(t),saved=await appendApprovalReceipt(config,input(),context());
 assert.equal(check(saved,{scope:{...scope,clientId:'synthetic-client-b'}}).reason,'missing');
 assert.equal(check(saved,{scope:{...scope,foundationKey:'other-foundation'}}).reason,'missing');
 assert.equal(check(saved,{kind:'independent-review'}).reason,'missing');
 await assert.rejects(appendApprovalReceipt(config,input({kind:'independent-review',decision:'passed',expectedRevision:saved.revision,idempotencyKey:'review'}),context()),/corresponding trusted authority/);
 const reviewed=await appendApprovalReceipt(config,input({kind:'independent-review',decision:'passed',expectedRevision:saved.revision,idempotencyKey:'review'}),context('reviewer','synthetic-independent-reviewer'));
 assert.equal(check(reviewed,{kind:'independent-review'}).valid,true);
 assert.equal((await readApprovalReceipts(config,{...scope,clientId:'synthetic-client-b'})).receipts.length,0);
});

test('synthetic: forged, JSON roundtripped, copied, or filtered receipt inputs are untrusted',async t=>{
 const saved=await appendApprovalReceipt(await fixture(t),input(),context());
 for(const receipts of [JSON.parse(JSON.stringify(saved.receipts)),[...saved.receipts],saved.receipts.filter(()=>true),[{status:'approved',note:'pass'}]])assert.equal(check({receipts}).reason,'untrusted');
});

test('synthetic: authority is mandatory separate server context, never request JSON',async t=>{
 const config=await fixture(t);
 await assert.rejects(appendApprovalReceipt(config,input({authority:context().authority}),context()),/Unexpected receipt fields/);
 await assert.rejects(appendApprovalReceipt(config,input(),{authority:context().authority,verifyAuthority:()=>false}),/verification failed/);
 await assert.rejects(appendApprovalReceipt(config,input(),{authority:context().authority}),/verification failed/);
 let verified;
 await appendApprovalReceipt(config,input(),{...context(),verifyAuthority:(identity,operation)=>{verified={identity,operation};return true;}});
 assert.deepEqual(verified.operation.subjects.map(item=>item.sha256).sort(),subjects.map(item=>item.sha256).sort());
 assert.equal(verified.operation.event,'decision');assert.equal(verified.identity.type,'owner');
});

test('synthetic: rejection on an overlapping subject supersedes older exact approval',async t=>{
 const config=await fixture(t),first=await appendApprovalReceipt(config,input(),context());
 const denied=await appendApprovalReceipt(config,input({decision:'rejected',subjects:[subjects[1]],idempotencyKey:'deny',expectedRevision:first.revision}),context());
 assert.equal(check(denied).reason,'rejected');
 const approved=await appendApprovalReceipt(config,input({idempotencyKey:'reapprove',expectedRevision:denied.revision}),context());
 assert.equal(check(approved).valid,true);assert.equal(approved.receipts.length,3);
});

test('synthetic: immutable revocation retained; no fallback to old approval; explicit reapproval required',async t=>{
 const config=await fixture(t),first=await appendApprovalReceipt(config,input(),context());
 const revoked=await revokeApprovalReceipt(config,{scope,targetReceiptId:first.receipt.id,evidence,idempotencyKey:'revoke',expectedRevision:first.revision},context());
 assert.equal(check(revoked).reason,'revoked');assert.equal(revoked.receipts[0].decision,'approved');assert.equal(revoked.receipts[1].event,'revocation');
 const replay=await revokeApprovalReceipt(config,{scope,targetReceiptId:first.receipt.id,evidence,idempotencyKey:'revoke',expectedRevision:first.revision},context());
 assert.equal(replay.replayed,true);assert.equal(replay.receipts.length,2);
 const reapproved=await appendApprovalReceipt(config,input({idempotencyKey:'new-approval',expectedRevision:revoked.revision}),context());
 assert.equal(check(reapproved).valid,true);assert.equal(reapproved.receipts.length,3);
 await assert.rejects(revokeApprovalReceipt(config,{scope,targetReceiptId:'r-699a0a02-526c-5685-aaf6-b75afd9d3d8d',evidence,idempotencyKey:'unknown',expectedRevision:reapproved.revision},context()),/Unknown receipt/);
});

test('synthetic: expiry and future-time checks fail closed',async t=>{
 const config=await fixture(t),expiresAt=new Date(Date.now()+60_000).toISOString();
 const saved=await appendApprovalReceipt(config,input({expiresAt}),context());
 assert.equal(check(saved,{now:expiresAt}).reason,'expired');
 assert.equal(check(saved,{now:'2000-01-01T00:00:00.000Z'}).reason,'future');
 assert.equal(check(saved,{now:'not-a-time'}).reason,'invalid-requirement');
 await assert.rejects(appendApprovalReceipt(config,input({expiresAt:'2000-01-01T00:00:00.000Z',idempotencyKey:'expired',expectedRevision:saved.revision}),context()),/future/);
});

test('synthetic: tool verification and explicit not-needed are separate from owner approval',async t=>{
 const config=await fixture(t);
 await assert.rejects(appendApprovalReceipt(config,input({kind:'tool-access',decision:'approved'}),context('tool')),/Invalid decision/);
 const saved=await appendApprovalReceipt(config,input({kind:'tool-access',decision:'not-needed'}),context('tool'));
 assert.equal(check(saved,{kind:'tool-access'}).valid,true);assert.equal(check(saved).reason,'missing');
});

test('synthetic: fresh-session idempotent retry keeps original receipt; changed request cannot reuse key',async t=>{
 const config=await fixture(t),saved=await appendApprovalReceipt(config,input(),context());
 const fresh=context();fresh.authority.verificationId='fresh-synthetic-session';
 const retry=await appendApprovalReceipt(config,input(),fresh);
 assert.equal(retry.replayed,true);assert.equal(retry.receipt.id,saved.receipt.id);assert.equal(retry.revision,saved.revision);
 assert.equal(retry.receipt.authority.verificationId,'synthetic-verification');
 await assert.rejects(appendApprovalReceipt(config,input({decision:'rejected'}),context()),/already used/);
 await assert.rejects(appendApprovalReceipt(config,input({idempotencyKey:'new-stale-request'}),context()),/ledger changed/);
});

test('synthetic: concurrent writers cannot lose approvals; loser retries after reread',async t=>{
 const config=await fixture(t);let release,entered;
 const held=new Promise(resolve=>{release=resolve;}),inside=new Promise(resolve=>{entered=resolve;});
 const first=appendApprovalReceipt(config,input(),{...context(),verifyAuthority:async()=>{entered();await held;return true;}});
 await inside;
 await assert.rejects(appendApprovalReceipt(config,input({idempotencyKey:'writer-2'}),context()),/ledger is busy/);
 release();const saved=await first;
 const second=await appendApprovalReceipt(config,input({idempotencyKey:'writer-2',expectedRevision:saved.revision}),context());
 assert.equal(second.receipts.length,2);assert.equal(second.receipts[1].sequence,2);
});

test('synthetic: receipt bytes tamper is detected before any trusted records are returned',async t=>{
 const config=await fixture(t),saved=await appendApprovalReceipt(config,input(),context()),base=await storeBase(config);
 const path=join(base,'receipts',saved.receipt.id,saved.receipt.revision+'.json');
 const changed=JSON.parse(await readFile(path,'utf8'));changed.decision='rejected';await writeFile(path,JSON.stringify(changed));
 await assert.rejects(readApprovalReceipts(config,scope),/integrity failed/);
 await assert.rejects(appendApprovalReceipt(config,input({expectedRevision:saved.revision,idempotencyKey:'after-tamper'}),context()),/integrity failed/);
});

test('synthetic: ledger tamper and missing immutable records fail closed',async t=>{
 const config=await fixture(t),saved=await appendApprovalReceipt(config,input(),context()),base=await storeBase(config);
 const path=join(base,'ledgers',saved.revision+'.json'),original=await readFile(path,'utf8');
 await writeFile(path,original.replace(saved.receipt.id,'r-699a0a02-526c-5685-aaf6-b75afd9d3d8d'));
 await assert.rejects(readApprovalReceipts(config,scope),/ledger integrity/);
 await writeFile(path,original);await unlink(join(base,'receipts',saved.receipt.id,saved.receipt.revision+'.json'));
 await assert.rejects(readApprovalReceipts(config,scope),{code:'ENOENT'});
});

test('synthetic: symlink root, intermediate ledger directory, receipt, and lock are rejected',async t=>{
 const config=await fixture(t),saved=await appendApprovalReceipt(config,input(),context()),base=await storeBase(config);
 const receipt=join(base,'receipts',saved.receipt.id,saved.receipt.revision+'.json'),outside=join(config.recordsVolume,'outside.json');
 await writeFile(outside,await readFile(receipt));await unlink(receipt);await symlink(outside,receipt);
 await assert.rejects(readApprovalReceipts(config,scope),/symlinks/);
 await unlink(receipt);await writeFile(receipt,await readFile(outside));
 await symlink(outside,join(base,'mutation.lock'));
 await assert.rejects(appendApprovalReceipt(config,input({idempotencyKey:'symlink',expectedRevision:saved.revision}),context()),/symlinks/);
 await unlink(join(base,'mutation.lock'));
 const entries=await readFile(join(base,'ledgers',saved.revision+'.json'));await rm(join(base,'ledgers'),{recursive:true});
 const externalDir=join(config.recordsVolume,'external-ledgers');await mkdir(externalDir);await writeFile(join(externalDir,saved.revision+'.json'),entries);await symlink(externalDir,join(base,'ledgers'));
 await assert.rejects(readApprovalReceipts(config,scope),/symlinks/);
 const externalRoot=join(config.recordsVolume,'external-root');await mkdir(externalRoot);await symlink(externalRoot,join(config.recordsVolume,'linked-root'));
 await assert.rejects(readApprovalReceipts({...config,recordsRoot:join(config.recordsVolume,'linked-root')},scope),/symlinks/);
});

test('synthetic: bounded fields, duplicate source identities, statuses and notes cannot become decisions',async t=>{
 const config=await fixture(t);
 for(const invalid of [
  {subjects:[]},{subjects:Array.from({length:33},(_,i)=>({...subjects[0],id:String(i)}))},
  {subjects:[subjects[0],{...subjects[0],sha256:sha('another version')}]},
  {evidence:[{kind:'note',id:'typed',sha256:'ready'}]},
  {decision:'ready'},{note:'Owner approved'},{scope:{...scope,clientId:'../'}},
  {idempotencyKey:'x'.repeat(201)},{expectedRevision:'typed-ready'},
 ])await assert.rejects(appendApprovalReceipt(config,input(invalid),context()));
 assert.equal((await readApprovalReceipts(config,scope)).receipts.length,0);
});
