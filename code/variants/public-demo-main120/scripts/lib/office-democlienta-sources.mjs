import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const knowledge='/ABSOLUTE/TEST/OWNER/MC-STUDIOS/knowledge/clients/democlienta';
const root='/ABSOLUTE/TEST/WORKSPACES/Workspaces/ChatGPT/DemoClientA';
const campaign=join(root,'campaigns/2026-11-social-system-r01');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function democlientaSourcePack(){
 const paths=[join(knowledge,'BRIEF.md'),...['00-START-HERE.md','01-CURRENT-STATE.md','02-FACTS-AND-BOUNDARIES.md','03-CAROUSEL-PLAYBOOK.md','05-REFERENCES-AND-PROVENANCE.md','LATEST.json','08-JARVIS-OFFICE-PILOT.md'].map(file=>join(root,'DEMOCLIENTA-AI-CONTEXT',file)),join(campaign,'qa/r11/README-R11.md')];
 const sources=await Promise.all(paths.map(async path=>({title:path.split('/').at(-1),path,sha256:hash(await readFile(path)),status:'Registered source; local draft, approval and publication not inferred'})));
 const legacy=JSON.parse(await readFile(join(knowledge,'assets.json'),'utf8'));
 const provenancePath=join(campaign,'assets/r11/provenance-r11.json'),provenanceBytes=await readFile(provenancePath),provenance=JSON.parse(provenanceBytes);
 sources.push({title:'R11 generated-asset provenance',path:provenancePath,sha256:hash(provenanceBytes),status:'Generated concepts; owner selection, exact-logo and rights QA pending'});
 const assets=legacy.assets.map(asset=>({key:'source-asset:'+asset.id,title:asset.role,metadata:{asset_category:asset.id.includes('logo')?'brand_files':asset.id.includes('card')?'product':'campaign',local_source_path:asset.path,sha256:asset.sha256,source_approval_status:asset.approval_status,rights_status:asset.rights_status,source_index:join(knowledge,'assets.json')}}));
 for(const asset of provenance.files){
  if(!/^[a-zA-Z0-9_-]+\.(png|webp)$/.test(asset.filename))throw new Error('Invalid registered R11 asset path.');
  const path=join(campaign,'assets/r11',asset.filename);
  if(hash(await readFile(path))!==asset.sha256)throw new Error('DemoClientA R11 asset changed and needs source review: '+asset.filename);
  assets.push({key:'source-asset:r11:'+asset.filename,title:'R11 concept · '+asset.filename,metadata:{asset_category:'campaign',local_source_path:path,sha256:asset.sha256,source_approval_status:'generated concept; owner selection pending',rights_status:'not_verified',version:'R11',slot_id:asset.slot_id,format:asset.format,dimensions:asset.dimensions,generation_model:asset.model_tool,generated_at:asset.date,provenance_path:provenancePath,provenance_sha256:hash(provenanceBytes),logo_qa:'Exact original mark must be composited before export'}});
 }
 return {sources,assets,logo:legacy.assets.find(asset=>asset.id==='democlienta-logo')};
}
