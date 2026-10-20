import 'server-only';
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {authorizeOwner} from '@/cloudflare/owner-access';
import {localOfficeEnabled} from './office-runtime.mjs';
import plan from './office-stack-plan.json';
import {ensureStore} from '../../scripts/lib/office-archive.mjs';
import {readOfficeReviewPackageFile,type OfficeReviewPackageConfig} from '../../scripts/lib/office-review-package.mjs';

const PUBLIC_ORIGIN='https://replace-with-your-test-worker.example.invalid';
const routeBase='/api/office/review/';
async function registry():Promise<OfficeReviewPackageConfig>{
 await ensureStore(plan.storage,{create:false});
 // Keep the access registry on the private host filesystem; the archival
 // volume need not support Unix ownership or permission bits.
 const directory=join(homedir(),'Library/Application Support/Jarvis Office/review-packages');
 const root=await lstat(directory);
 if(!root.isDirectory()||root.isSymbolicLink()||(root.mode&0o077)!==0||typeof process.getuid!=='function'||root.uid!==process.getuid()||await realpath(directory)!==resolve(directory))throw Error('Private registry directory unavailable.');
 const file=await open(join(directory,'registry.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size>65536||(stat.mode&0o077)!==0||typeof process.getuid!=='function'||stat.uid!==process.getuid())throw Error('Private registry unavailable.');
  const raw=await file.readFile('utf8');if(Buffer.byteLength(raw)>65536)throw Error('Registry bounds exceeded.');
  const value=JSON.parse(raw);
  if(value.version!==1||!Array.isArray(value.packages)||value.packages.length>64||Object.keys(value).some(k=>!['version','packages'].includes(k)))throw Error('Registry invalid.');
  return {storage:plan.storage,packages:value.packages};
 }finally{await file.close();}
}
/** All executable and network resources stay within this exact frozen package.
 * Use a fixed origin allowlist: Host/request headers never expand CSP authority. */
function packagePolicy(clientId:string,revision:string){
 const prefix=routeBase+clientId+'/'+revision+'/';
 const sources=[PUBLIC_ORIGIN,...[3101,3103,3105].map(port=>'http://127.0.0.1:'+port)].map(origin=>origin+prefix).join(' ');
 // Opaque origins prevent a reader from borrowing a parent/opener's ambient
 // owner authority. No CORS grant is made to arbitrary opaque origins.
 // Nested read-only readers need framing, but cannot access any parent realm.
 return ["default-src 'none'",`script-src 'unsafe-inline' ${sources}`,`style-src 'unsafe-inline' ${sources}`,`img-src data: ${sources}`,`font-src data: ${sources}`,`connect-src ${sources}`,`frame-src ${sources}`,"base-uri 'none'","form-action 'none'","object-src 'none'","worker-src 'none'","sandbox allow-scripts allow-downloads"].join('; ');
}
export async function officeReviewPackageResponse(request:Request,params:{clientId:string;revision:string;asset:string[]}){
 if(!localOfficeEnabled())return new Response('Unavailable.',{status:404});
 const identity=await authorizeOwner(request,{JARVIS_ACCESS_TEAM_DOMAIN:process.env.JARVIS_ACCESS_TEAM_DOMAIN??'',JARVIS_ACCESS_AUDIENCE:process.env.JARVIS_ACCESS_AUDIENCE??'',JARVIS_OWNER_EMAILS:process.env.JARVIS_OWNER_EMAILS??''});
 if(identity instanceof Response)return identity;
 try{
  if(new URL(request.url).search||!Array.isArray(params.asset)||!params.asset.length||params.asset.some(p=>!p||p.includes('/')||p.includes('\\')))throw Error('Invalid package request.');
  const file=await readOfficeReviewPackageFile(await registry(),{clientId:params.clientId,revision:params.revision,path:params.asset.join('/')});
  const headers=new Headers({'Content-Type':file.mime+'; charset='+(file.mime.startsWith('text/')||file.mime==='application/json'?'utf-8':'binary'),'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':packagePolicy(file.clientId,file.revision),'Cross-Origin-Resource-Policy':'same-origin'});
  // Binary MIME types have no charset; keep exact file type for native downloads.
  if(!file.mime.startsWith('text/')&&file.mime!=='application/json')headers.set('Content-Type',file.mime);
  if(file.download)headers.set('Content-Disposition','attachment; filename="'+file.path.split('/').at(-1)!.replace(/[^a-zA-Z0-9._-]/g,'_')+'"');
  return new Response(request.method==='HEAD'?null:file.bytes,{status:200,headers});
 }catch{return new Response('Review artifact unavailable.',{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}
