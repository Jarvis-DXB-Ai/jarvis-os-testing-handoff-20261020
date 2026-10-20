/** Explicit CLI only. No startup or I/O on import. Never launches capture or installs a grant. */
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {loadOfficeCooCapture} from './start-office-coo-capture.mjs';
import {createOfficeCooReactiveDaemon} from './lib/office-coo-reactive-daemon.mjs';
export async function startOfficeCooReactive(args=process.argv.slice(2)){
 if(args.length!==1||!['--check','--once','--daemon','--recovery-status'].includes(args[0]))throw Error('Use --check, --once, --daemon or --recovery-status.');
 const directory=join(homedir(),'Library/Application Support/Jarvis Office/coo-channel'),{config}=await loadOfficeCooCapture(directory),driver=createOfficeCooReactiveDaemon({directory,config});
 if(args[0]==='--check')return driver.check();if(args[0]==='--recovery-status')return driver.recoveryStatus();if(args[0]==='--once')return driver.tick();
 let stopped=false;const stop=()=>{stopped=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{while(!stopped){const result=await driver.tick();console.log(JSON.stringify({at:new Date().toISOString(),...result}));if(['stopped','busy'].includes(result.status))return result;await new Promise(resolve=>{let t;const wake=()=>{clearTimeout(t);process.removeListener('SIGTERM',wake);process.removeListener('SIGINT',wake);resolve();};t=setTimeout(wake,5000);process.once('SIGTERM',wake);process.once('SIGINT',wake);});}return {status:'stopped',reason:'signal'};}finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)startOfficeCooReactive().then(result=>console.log(JSON.stringify(result)),()=>{console.error('Private COO reactive runtime stopped. Review retained authority/task/outbox state; no automatic retry.');process.exitCode=1;});
