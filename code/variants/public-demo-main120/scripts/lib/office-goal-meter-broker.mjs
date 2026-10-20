import {constants} from 'node:fs';
import {open,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readCodexUsage,readClaudeUsage} from './office-subscription-usage.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const MAX_AGE=60000;
async function directory(path){
 if(resolve(path)!==path)throw Error('meter_directory');
 for(let p=path;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('meter_directory');if(p===path&&(s.uid!==process.getuid()||(s.mode&0o7777)!==0o700))throw Error('meter_permissions');if(dirname(p)===p)break;}
 if(await realpath(path)!==path)throw Error('meter_directory');
}
async function read(path){
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await f.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o7777)!==0o600||s.nlink!==1||s.size>32768)throw Error('meter_permissions');
  const raw=await f.readFile('utf8'),end=await f.stat(),at=await lstat(path);
  if([end,at].some(t=>t.ino!==s.ino||t.dev!==s.dev||t.size!==s.size||t.mtimeMs!==s.mtimeMs||t.ctimeMs!==s.ctimeMs)||Buffer.byteLength(raw)!==s.size)throw Error('meter_changed');return JSON.parse(raw);
 }finally{await f.close();}
}
/** Trusted local broker: coalesces authoritative account reads across processes.
 * Reuse lasts at most60s; original per-provider observation times are preserved.
 * There is no stale-on-error fallback, timestamp renewal or quota allowance here.
 */
export async function readGoalSharedUsage(privateDirectory,{now=Date.now,readers=[readCodexUsage,readClaudeUsage]}={}){
 await directory(privateDirectory);const path=join(privateDirectory,'goal-native-meters.json');
 const cached=async()=>{
  let value;try{value=await read(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const {integrity,...body}=value;
  if(value.version!==1||integrity!==hash(body)||!Array.isArray(value.meters)||value.meters.length!==2||value.meters[0]?.provider!=='codex'||value.meters[1]?.provider!=='claude')throw Error('meter_integrity');
  if(!value.meters.every(m=>typeof m.observedAt==='string'&&Number.isFinite(Date.parse(m.observedAt))))throw Error('meter_timestamp');
  if(value.meters.some(m=>Date.parse(m.observedAt)>now()))throw Error('meter_future');
  return value.meters.every(m=>now()-Date.parse(m.observedAt)<MAX_AGE)?value.meters:null;
 };
 const prior=await cached();if(prior)return prior;
 // A competing reader owns the current observation; fail closed rather than
 // produce duplicate account requests or wait behind an unknown old process.
 const lockPath=join(privateDirectory,'goal-native-meters.lock');
 const lock=await open(lockPath,'wx',0o600);
 try{
  const second=await cached();if(second)return second;
  const results=await Promise.allSettled(readers.map(async reader=>{const meter=await reader();return {...meter,observedAt:meter.observedAt===undefined?new Date(now()).toISOString():meter.observedAt};}));
  const unavailable=results.findIndex(r=>r.status!=='fulfilled');
  if(unavailable>=0)throw Error('authoritative_'+(unavailable===0?'codex':'claude')+'_meter_unavailable');
  const meters=results.map(r=>r.value);
  if(meters.some(m=>typeof m.observedAt!=='string'||!Number.isFinite(Date.parse(m.observedAt))||now()-Date.parse(m.observedAt)>=MAX_AGE||Date.parse(m.observedAt)>now()))throw Error('meter_stale');
  const body={version:1,meters},value={...body,integrity:hash(body)},tmp=path+'.'+randomUUID()+'.tmp';
  try{const f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(value)+'\n');await f.sync();}finally{await f.close();}await rename(tmp,path);const d=await open(privateDirectory,'r');try{await d.sync();}finally{await d.close();}}finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  const reread=await cached();if(!reread)throw Error('meter_readback');return reread;
 }finally{await lock.close();await unlink(lockPath);}
}
