import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHmac,timingSafeEqual} from 'node:crypto';

export const OFFICE_COO_SERVICE_BODY_LIMIT=32768;

export async function readOfficeCooPrivateJson(directory,name,maxBytes=16384){
 if(resolve(directory)!==directory||!/^[-a-z0-9.]+\.json$/.test(name))throw Error('private_binding');
 for(let p=directory;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('private_directory');if(p===directory&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))throw Error('private_permissions');if(dirname(p)===p)break;}
 if(await realpath(directory)!==directory)throw Error('private_directory');
 const path=join(directory,name),f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await f.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o7777)!==0o600||s.nlink!==1||s.size>maxBytes)throw Error('private_permissions');const raw=await f.readFile('utf8'),end=await f.stat(),current=await lstat(path);if([end,current].some(v=>v.ino!==s.ino||v.dev!==s.dev||v.size!==s.size||v.mtimeMs!==s.mtimeMs||v.ctimeMs!==s.ctimeMs)||Buffer.byteLength(raw)!==s.size)throw Error('private_changed');return JSON.parse(raw);}finally{await f.close();}
}
function value(secret,at,body){
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret)||typeof at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at)||!Number.isFinite(Date.parse(at))||typeof body!=='string'||Buffer.byteLength(body)>OFFICE_COO_SERVICE_BODY_LIMIT)throw Error('service_auth');
 return createHmac('sha256',secret).update('jarvis-office-coo-service:v1\n'+at+'\n'+body).digest('hex');
}
export function signOfficeCooServiceRequest(secret,at,body){return value(secret,at,body);}
export function verifyOfficeCooServiceRequest(secret,{at,body,signature},now=Date.now()){
 try{if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!Number.isFinite(now)||Date.parse(at)>now||now-Date.parse(at)>30000)return false;return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(value(secret,at,body),'hex'));}catch{return false;}
}
