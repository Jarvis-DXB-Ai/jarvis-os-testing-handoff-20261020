import sharp from 'sharp';
import {zstdDecompress,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
export const reviewedLayoutHashes=new Set(['d9eed552bc7c7a124e48ef265c6ea883816b31ffa3532a6786a8dd4e89b8666a']);
const unzipZstd=promisify(zstdDecompress),unzipGzip=promisify(gunzip);

// Format and decode evidence is separate from craft, rights and owner approval.
// Native producers still verify video codec/duration before creating a receipt.
export async function verifyArtifactFormat(name,bytes){
  if(name.endsWith('.png')){
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Output format mismatch: PNG bytes required.');
    const image=sharp(bytes,{limitInputPixels:64000000,failOn:'warning'});
    const metadata=await image.metadata();
    if(metadata.format!=='png'||!metadata.width||!metadata.height)throw new Error('Output PNG dimensions missing.');
    await image.stats(); // Decode pixels; a valid header alone is insufficient.
    return {format:'png',width:metadata.width,height:metadata.height,decoded:true};
  }
  if(/\.(?:webp|jpe?g)$/.test(name)){
    const expected=name.endsWith('.webp')?'webp':'jpeg',image=sharp(bytes,{limitInputPixels:64000000,failOn:'warning'}),m=await image.metadata();
    if(m.format!==expected||!m.width||!m.height||m.pages>1)throw Error('Output raster format mismatch.');await image.stats();return {format:expected,width:m.width,height:m.height,decoded:true};
  }
  if(name.endsWith('.woff2')){
    if(bytes.length<48||bytes.subarray(0,4).toString()!=='wOF2'||bytes.readUInt32BE(8)!==bytes.length||bytes.readUInt16BE(12)<1||bytes.readUInt32BE(16)>16000000)throw Error('Output font header mismatch.');return {format:'woff2',headerChecked:true};
  }
  if(/\.(?:html|css|js)$/.test(name)){
    const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!content.trim()||content.includes('\0')||bytes.length>128000)throw Error('Bounded UTF-8 editable source required.');
    const format=name.split('.').at(-1);if(format==='js'&&!reviewedLayoutHashes.has(createHash('sha256').update(bytes).digest('hex')))throw Error('Unreviewed executable dependency denied.');return {format,utf8Checked:true,...(format==='js'?{reviewedHash:true}:{})};
  }
  if(name.endsWith('.json')){JSON.parse(bytes.toString('utf8'));return {format:'json',parsed:true};}
  if(name.endsWith('.svg')){
    if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/.test(bytes.toString('utf8')))throw new Error('Output format mismatch: SVG root required.');
    return {format:'svg',rootChecked:true};
  }
  if(name.endsWith('.blend')){
    const compression=bytes.subarray(0,4).equals(Buffer.from([40,181,47,253]))?'zstd':bytes[0]===31&&bytes[1]===139?'gzip':null;
    const decoded=compression?await (compression==='zstd'?unzipZstd:unzipGzip)(bytes,{maxOutputLength:64000000}):bytes;
    if(decoded.subarray(0,7).toString()!=='BLENDER')throw new Error('Output format mismatch: Blender header required.');
    return {format:'blend',headerChecked:true,...(compression?{compression}: {})};
  }
  if(name.endsWith('.mp4')){
    if(bytes.subarray(4,8).toString()!=='ftyp')throw new Error('Output format mismatch: MP4 header required.');
    return {format:'mp4',headerChecked:true};
  }
  throw new Error('Unsupported output format.');
}
