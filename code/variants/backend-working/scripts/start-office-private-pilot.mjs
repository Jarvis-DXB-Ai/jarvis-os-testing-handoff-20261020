import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {localTestConfig,localAppEnvironment} from './isolated-home-config.mjs';
import {createPrivateOfficeOrigin} from './lib/office-private-origin.mjs';
import {privateMacPilotEnabled} from '../src/lib/office-runtime.mjs';

async function start(){
const base=join(homedir(),'Library/Application Support/Jarvis Office/private-pilot');
const config=JSON.parse(await readFile(join(base,'config.json'),'utf8'));
const release=resolve(config.release);
if(!release.startsWith(join(base,'releases')+'/'))throw new Error('Unregistered private Office release.');
const manifest=JSON.parse(await readFile(join(release,'private-release.json'),'utf8'));
if(manifest.release!==release||(await readFile(join(release,'.next/BUILD_ID'),'utf8')).trim()!==manifest.buildId)throw new Error('Private Office build identity changed.');
const env={...localAppEnvironment(localTestConfig()),NODE_ENV:'production',JARVIS_PRIVATE_MAC_PILOT:'1',JARVIS_PRIVATE_ORIGIN_AUTH:'cloudflare_access',JARVIS_RUNTIME_WORKER_ORIGIN:config.origin,JARVIS_ACCESS_TEAM_DOMAIN:config.issuer,JARVIS_ACCESS_AUDIENCE:config.audience,JARVIS_OWNER_EMAILS:config.owners.join(',')};
delete env.JARVIS_ISOLATED_TEST;
if(!privateMacPilotEnabled(env))throw new Error('Private Mac origin configuration is incomplete.');
const gateway=createPrivateOfficeOrigin({env});
const child=spawn(process.execPath,[join(release,'.next/standalone/server.js')],{cwd:release,env:{...env,PORT:'3103',HOSTNAME:'127.0.0.1'},stdio:'inherit'});
let stopping=false;
function stop(){if(stopping)return;stopping=true;gateway.close();child.kill('SIGTERM');setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.on('error',()=>{console.error('Private application launch failed.');stop();process.exitCode=1;});
child.on('exit',code=>{gateway.close();process.exitCode=stopping?0:code||1;});
gateway.listen(3104,'127.0.0.1',()=>console.log('Private Office authentication gateway listening on loopback port 3104.'));

}
start().catch(()=>{console.error("Private Office startup failed. Check the mounted datastore, release and access configuration.");process.exitCode=1;});
