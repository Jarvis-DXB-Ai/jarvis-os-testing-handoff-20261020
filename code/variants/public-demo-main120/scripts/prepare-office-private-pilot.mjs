import {mkdir,mkdtemp,readFile,writeFile,statfs,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {localTestConfig,localAppEnvironment,root} from './isolated-home-config.mjs';

// Build an immutable source snapshot without touching the active development cache.
const base=join(homedir(),'Library/Application Support/Jarvis Office/private-pilot');
await mkdir(join(base,'releases'),{recursive:true,mode:0o700});
const disk=await statfs(base);
if(disk.bavail*disk.bsize<4*1024**3)throw new Error('Keep at least 4 GiB free on the Mac before preparing an Office release. The existing runtime is unchanged.');
const release=await mkdtemp(join(base,'releases/release-'));
function run(command,args,options={}) {const result=spawnSync(command,args,{stdio:'inherit',...options});if(result.status!==0)throw new Error('Private Office preparation failed; prior runtime is unchanged.');}
run('rsync',['-a','--exclude=.git','--exclude=.next','--exclude=node_modules','--exclude=.wrangler','--exclude=.env*','--exclude=.dev.vars*','--exclude=*.tsbuildinfo',root+'/',release+'/']);
run('cp',['-cR',join(root,'node_modules'),join(release,'node_modules')]);
run(process.execPath,[join(release,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:release,env:localAppEnvironment(localTestConfig())});
// Standalone needs its static assets and the native Mac worker entrypoints.
run('cp',['-cR',join(release,'public'),join(release,'.next/standalone/public')]);
run('cp',['-cR',join(release,'.next/static'),join(release,'.next/standalone/.next/static')]);
for(const folder of ['scripts','src','skills'])run('rsync',['-a',join(release,folder)+'/',join(release,'.next/standalone',folder)+'/']);
// A production server never uses the compiler cache. Retain the complete
// source and deployable output without accumulating this rebuild-only data.
await rm(join(release,'.next/cache'),{recursive:true,force:true});
const buildId=(await readFile(join(release,'.next/BUILD_ID'),'utf8')).trim();
await writeFile(join(release,'private-release.json'),JSON.stringify({buildId,release,preparedAt:new Date().toISOString(),source:root},null,2)+'\n',{mode:0o600});
await writeFile(join(base,'prepared-release.json'),JSON.stringify({release,buildId},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({release,buildId,started:false}));
