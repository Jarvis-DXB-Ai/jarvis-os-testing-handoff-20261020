import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {officeStorePath} from './office-archive.mjs';
export const pilotTaskTypes=['internal','strategy','web','report'];
export const pilotDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function verifyPilotSnapshot(bundle,current){
 const brain=bundle?.clientBrain,id=bundle?.scope?.clientId;
 if(!id||current?.id!==id||current.clientId!==id||current.executionMode!=='audit_only'||current.status!=='audit_ready'||current.brandConfirmed!==false||current.servicesConfirmed!==false||current.revision!==brain.officeTeamRevision||current.foundationId!==bundle.foundation.id||JSON.stringify(current.team)!==JSON.stringify(brain.officeTeam))throw new Error('The internal audit allocation changed after context was pinned.');
}
export async function readPilotSources(storage,id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid pilot client identity.');
 const base=`clients/${id}/sources/`;
 // A partial multi-store activation is unavailable until explicit reconciliation.
 // Do not parse/trust the marker: even an incomplete or corrupt fence must stop work.
 try{await lstat(await officeStorePath(storage.recordsRoot,base+'activation-fence.json'));throw new Error('Client source activation is pending. Reconcile its saved journal before assigning work.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const pointer=JSON.parse(await readFile(await officeStorePath(storage.recordsRoot,base+'current.json'),'utf8'));
 if(!/^[a-f0-9]{64}$/.test(pointer.sha256))throw new Error('Invalid source-pack revision.');
 const path=await officeStorePath(storage.recordsRoot,base+'versions/'+pointer.sha256+'/manifest.json');
 if(pointer.path!==path)throw new Error('Source-pack path is outside the scoped version.');
 const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==pointer.sha256)throw new Error('The pilot source register changed.');
 const manifest=JSON.parse(bytes);if(manifest.clientId!==id||manifest.executionMode!=='audit_only'||manifest.brandApproved!==false||manifest.paidServicesConfirmed!==false)throw new Error('The source pack does not belong to this audit.');
 for(const packet of Object.values(manifest.packets)){
  const allowed=await officeStorePath(storage.recordsRoot,base+'objects/'+packet.sha256+'/'+packet.path.split('/').at(-1));
  if(packet.path!==allowed||createHash('sha256').update(await readFile(allowed)).digest('hex')!==packet.sha256)throw new Error('A pinned audit packet changed.');
 }
 return {manifest,path,sha256:pointer.sha256};
}
