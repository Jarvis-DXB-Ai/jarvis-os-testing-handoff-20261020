import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createOfficeCooOrigin,listenOfficeCooOrigin,closeOfficeCooOrigin} from './lib/office-coo-origin.mjs';
import {assertOfficeCooCaptureReady} from './lib/office-coo-whatsapp.mjs';

const privateDirectory=join(homedir(),'Library/Application Support/Jarvis Office/coo-channel');
async function privateJson(directory,name,maxBytes){
 const file=await open(join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size>maxBytes||(stat.mode&0o077)!==0||stat.uid!==process.getuid())throw Error('Private capture file permissions or bounds are invalid.');
  return JSON.parse(await file.readFile('utf8'));
 }finally{await file.close();}
}
/** Server-owned files only. No API credential, outbound adapter or model is loaded. */
export async function loadOfficeCooCapture(directory=privateDirectory){
 const stat=await lstat(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid()||await realpath(directory)!==resolve(directory))throw Error('Private capture directory must be owned, direct and private.');
 const config=await privateJson(directory,'config.capture.json',16384);
 if(config.version!==1||config.active!==true||config.mode!=='capture_only'
  ||!config.storage||Object.keys(config.storage).length!==2||!['recordsRoot','recordsVolume'].every(k=>Object.hasOwn(config.storage,k))
  ||config.storage?.recordsRoot!=='/ABSOLUTE/TEST/OFFICE-DATA'||config.storage.recordsVolume!=='/Volumes/MAC SSD'
  ||config.ingress?.host!=='127.0.0.1'||config.ingress.port!==3106||config.ingress.path!=='/events'
  ||config.binding?.channelId!=='jarvis-office-coo'||config.binding.profileId!=='6ad0a1605c9b88c22d6061d2'
  ||config.binding.accountId!=='6ad0a6b5a09618fd6392391c'||config.binding.senderPhone!=='+00000000000'
  ||!/^\+?[1-9][0-9]{7,14}$/.test(config.binding.ownerParticipantId??'')
  ||config.binding.ownerParticipantId.replace(/^\+/,'')==='14422051538'
  ||config.outboundDefault!=='disabled_pending_reviewed_credential_and_verified_owner_service_window')throw Error('Dedicated capture-only configuration is unavailable.');
 const secret=await privateJson(directory,'webhook-secret.json',256);
 if(secret.version!==1||typeof secret.secret!=='string'||!/^[a-f0-9]{64}$/.test(secret.secret)||Object.keys(secret).some(k=>!['version','secret'].includes(k)))throw Error('Private webhook secret is invalid.');
 return {config,secret:secret.secret};
}
export async function startOfficeCooCapture(){
 const {config,secret}=await loadOfficeCooCapture();
 await assertOfficeCooCaptureReady(config); // Refuse corrupt state or retained mutation/recovery locks before traffic.
 const server=createOfficeCooOrigin({config,secret});
 await listenOfficeCooOrigin(server);
 let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;closeOfficeCooOrigin(server).then(()=>process.exit(0),()=>{process.exitCode=1;});};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 console.log('Dedicated COO capture receiver ready on loopback3106; outbound and models disabled.');
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 startOfficeCooCapture().catch(()=>{console.error('COO capture receiver unavailable; private configuration or state requires review.');process.exitCode=1;});
}
