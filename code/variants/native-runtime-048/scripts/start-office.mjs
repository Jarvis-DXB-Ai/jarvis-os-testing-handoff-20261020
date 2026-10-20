import {spawn} from 'node:child_process';
import {openSync} from 'node:fs';
import {localTestConfig,localAppEnvironment,root} from './isolated-home-config.mjs';
// Reopen existing local data. Deliberately never applies migrations or seed SQL.
const origin='http://127.0.0.1:3101';
const existing=await fetch(origin+'/office',{signal:AbortSignal.timeout(2000)}).catch(()=>null);
if(existing?.ok){console.log(`Office is already serving: ${origin}/office`);process.exit(0);}
const env=localAppEnvironment(localTestConfig());
const log=openSync('/tmp/jarvis-office-preview-3101.log','a',0o600);
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3101'],{cwd:root,env,detached:true,stdio:['ignore',log,log]});
app.on('error',()=>{console.error('Office could not start. Inspect /tmp/jarvis-office-preview-3101.log.');process.exitCode=1;});
app.unref();
let ready=false;
for(let attempt=0;attempt<30;attempt++){
  const response=await fetch(origin+'/office',{signal:AbortSignal.timeout(2000)}).catch(()=>null);
  if(response?.ok){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));
}
if(!ready){console.error('Office has not become available. Inspect /tmp/jarvis-office-preview-3101.log. Existing data was not reseeded.');process.exitCode=1;}
else console.log(`Office opened at ${origin}/office. Existing data preserved. Run node scripts/verify-office-readiness.mjs to check execution services.`);
