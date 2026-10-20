import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadOfficeCooCapture} from './start-office-coo-capture.mjs';

async function fixture(t){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'coo-capture-')));await chmod(directory,0o700);t.after(()=>rm(directory,{recursive:true,force:true}));
 const config={version:1,active:true,mode:'capture_only',storage:{recordsRoot:'/ABSOLUTE/TEST/OFFICE-DATA',recordsVolume:'/Volumes/MAC SSD'},ingress:{host:'127.0.0.1',port:3106,path:'/events'},binding:{channelId:'jarvis-office-coo',profileId:'6ad0a1605c9b88c22d6061d2',accountId:'6ad0a6b5a09618fd6392391c',senderPhone:'+00000000000',ownerParticipantId:'+00000000000'},outboundDefault:'disabled_pending_reviewed_credential_and_verified_owner_service_window'};
 const save=()=>writeFile(join(directory,'config.capture.json'),JSON.stringify(config),{mode:0o600});await save();await writeFile(join(directory,'webhook-secret.json'),JSON.stringify({version:1,secret:'a'.repeat(64)}),{mode:0o600});return{directory,config,save};
}
test('capture loads exact private files without loading a send credential or writing channel state',async t=>{const f=await fixture(t),r=await loadOfficeCooCapture(f.directory);assert.equal(r.config.mode,'capture_only');assert.equal(r.secret,'a'.repeat(64));assert.equal(r.config.binding.ownerParticipantId,'+00000000000');});
for(const [name,mutate] of [
 ['inactive configuration',c=>c.active=false],['outbound mode',c=>c.mode='reply'],['broad listener',c=>c.ingress.host='0.0.0.0'],['owner app port',c=>c.ingress.port=3104],['foreign account',c=>c.binding.accountId='other'],['owner equal to sender',c=>c.binding.ownerParticipantId=c.binding.senderPhone],['arbitrary store',c=>c.storage.recordsRoot='/tmp/other'],['test-mode store bypass',c=>c.storage.testing=true],['unknown store bypass',c=>c.storage.skipDeviceCheck=true],['send enabled',c=>c.outboundDefault='enabled']
])test('refuses '+name,async t=>{const f=await fixture(t);mutate(f.config);await f.save();await assert.rejects(()=>loadOfficeCooCapture(f.directory),/configuration/);});
test('refuses group-readable secret and directory',async t=>{const f=await fixture(t);await chmod(join(f.directory,'webhook-secret.json'),0o640);await assert.rejects(()=>loadOfficeCooCapture(f.directory),/permissions/);await chmod(join(f.directory,'webhook-secret.json'),0o600);await chmod(f.directory,0o750);await assert.rejects(()=>loadOfficeCooCapture(f.directory),/private/);});
test('refuses symlinked secret even when its target is private',async t=>{const f=await fixture(t);await rm(join(f.directory,'webhook-secret.json'));await writeFile(join(f.directory,'other.json'),JSON.stringify({version:1,secret:'a'.repeat(64)}),{mode:0o600});await symlink('other.json',join(f.directory,'webhook-secret.json'));await assert.rejects(()=>loadOfficeCooCapture(f.directory));});
test('bounds configuration before parsing',async t=>{const f=await fixture(t);await writeFile(join(f.directory,'config.capture.json'),' '.repeat(17000));await assert.rejects(()=>loadOfficeCooCapture(f.directory),/bounds/);});
