import {readdir,lstat,readFile} from 'node:fs/promises';
import {basename,dirname,extname} from 'node:path';
import {officeStorePath,ensureStore} from './office-archive.mjs';
const allowed=new Set(['.md','.txt','.json','.csv','.pdf','.png','.jpg','.jpeg','.webp','.gif','.svg','.html','.css','.js','.mjs','.ts','.tsx','.pptx','.docx','.xlsx','.mp4','.mov']);
const excluded=/^(?:\.|node_modules$|database-exports$|backups$|credentials?(?:\.|$)|secrets?(?:\.|$)|auth(?:\.|$)|logins$)/i;
export function libraryCategory(path){const root=path.split('/')[0];return ({knowledge:'Foundations & learning',clients:'Client documents',tasks:'Tasks & deliverables',contexts:'Pinned task context',library:'Skills & references',agents:'Agent workspaces',objects:'Saved outputs'})[root]??'Office files';}
export async function indexOfficeFiles(config,{roots=['knowledge','clients','tasks','contexts','library/skills','agents','objects']}={}){
 await ensureStore(config,{create:false});const files=[],seen=new Set();
 async function walk(relative){if(seen.has(relative)||relative.split('/').some(p=>excluded.test(p)))return;seen.add(relative);let stat,path;try{path=await officeStorePath(config.recordsRoot,relative);stat=await lstat(path);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(stat.isSymbolicLink())return;
  if(stat.isDirectory()){for(const entry of await readdir(path,{withFileTypes:true})){if(entry.isSymbolicLink()||excluded.test(entry.name))continue;await walk(relative+'/'+entry.name);}return;}
  if(!stat.isFile()||!allowed.has(extname(relative).toLowerCase()))return;
  const clientId=relative.match(/^clients\/([^/]+)/)?.[1]??null;
  files.push({id:'local:'+relative,title:basename(relative),folder:dirname(relative),category:libraryCategory(relative),clientId,kind:'file',path:relative,bytes:stat.size,updatedAt:stat.mtime.toISOString(),format:extname(relative).slice(1).toLowerCase(),status:/\/versions\/|\/history\//.test(relative)?'Version history':'Saved'});
 }
 for(const root of roots)await walk(root);
 return files.sort((a,b)=>a.folder.localeCompare(b.folder)||a.title.localeCompare(b.title));
}
export async function readOfficeLibraryFile(config,path){
 if(typeof path!=='string'||!path||path.split('/').some(p=>excluded.test(p))||!['knowledge','clients','tasks','contexts','library','agents','objects'].includes(path.split('/')[0])||!allowed.has(extname(path).toLowerCase()))throw new Error('File is outside the indexed Office library.');
 const safe=await officeStorePath(config.recordsRoot,path),stat=await lstat(safe);if(!stat.isFile()||stat.size>25*1024*1024)throw new Error('File is unavailable for inline review (25 MB limit).');return {bytes:await readFile(safe),format:extname(path).slice(1).toLowerCase(),name:basename(path)};
}
