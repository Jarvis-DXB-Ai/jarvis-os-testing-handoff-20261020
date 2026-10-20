import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDesignInventory} from './lib/design-inventory.mjs';
function cssFiles(folder) {return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?cssFiles(join(folder,entry.name)):entry.name.endsWith('.css')?[join(folder,entry.name)]:[]);}
const sources=cssFiles('src').sort().map(path=>({path,css:readFileSync(path,'utf8')}));
const output=JSON.stringify(createDesignInventory(sources),null,2)+'\n';
const target='src/generated/design-inventory.json';
if(process.argv.includes('--check')) {
 if(readFileSync(target,'utf8')!==output) {console.error('Design inventory is stale. Run npm run design:inventory.');process.exit(1);}
 console.log('Design inventory matches current CSS sources.');
} else {mkdirSync('src/generated',{recursive:true});writeFileSync(target,output);console.log(`Generated design inventory from ${sources.length} CSS files.`);}
