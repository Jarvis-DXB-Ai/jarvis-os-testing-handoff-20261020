import {pinnedSourceCatalog,readRegisteredSource} from './office-pinned-sources.mjs';
const imageName=p=>typeof p==='string'&&/\.(png|jpe?g|webp)$/i.test(p);
export async function pinnedImageCatalog(storage,job,role){
 const catalog=await pinnedSourceCatalog(storage,job,role,'visual');return {...catalog,entries:catalog.entries.filter(s=>imageName(s.canonical_path))};
}
export async function listPinnedImages(storage,job,role,query=''){
 const catalog=await pinnedImageCatalog(storage,job,role),matches=catalog.entries.filter(s=>s.canonical_path.split('/').at(-1).toLowerCase().includes(query.toLowerCase()));
 return {clientId:catalog.clientId,registerSha256:catalog.registerSha256,total:matches.length,images:matches.slice(0,20).map(s=>({sourceId:s.id,name:s.canonical_path.split('/').at(-1),family:s.family,sha256:s.sha256,bytes:s.bytes,status:s.status})),note:'Pinned working image references, not approved artwork or rights. Listing does not verify current pixels; image_view checks the selected bytes. Narrow the query if more than 20 match.'};
}
export async function readPinnedImage(storage,job,role,sourceId){
 const catalog=await pinnedImageCatalog(storage,job,role),source=catalog.entries.find(s=>s.id===sourceId);
 if(!source)throw Error('Image is not registered to this client task.');
 // Full 4K source PNGs can exceed 16 MiB. Decode/preview limits remain enforced
 // by image_view (64 MP input, 2048 px preview, 8 MiB transport).
 return readRegisteredSource(storage,catalog,source,32*1024*1024);
}
