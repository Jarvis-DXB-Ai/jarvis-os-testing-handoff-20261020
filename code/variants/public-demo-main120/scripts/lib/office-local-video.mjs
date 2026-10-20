import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {pinnedImageCatalog,readPinnedImage} from './office-pinned-images.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const escaped=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const draftVideoSchema={type:'object',additionalProperties:false,required:['profileId','scenes'],properties:{profileId:{type:'string',pattern:'^[a-z0-9-]{1,48}$'},secondsPerScene:{type:'integer',minimum:3,maximum:6},scenes:{type:'array',minItems:2,maxItems:3,items:{type:'object',additionalProperties:false,required:['sourceId','title'],properties:{sourceId:{type:'string',pattern:'^src-[a-f0-9]{16}$'},title:{type:'string',minLength:1,maxLength:64}}}}}};
export function validateDraftVideo(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(draftVideoSchema.properties,k))||typeof value.profileId!=='string'||!/^[a-z0-9-]{1,48}$/.test(value.profileId)||!Array.isArray(value.scenes)||value.scenes.length<2||value.scenes.length>3)throw Error('Use one configured profile and two or three registered scenes.');
 if(value.secondsPerScene!==undefined&&(!Number.isInteger(value.secondsPerScene)||value.secondsPerScene<3||value.secondsPerScene>6))throw Error('Scene duration must be three to six seconds.');
 const seen=new Set();for(const s of value.scenes){if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['sourceId','title'].includes(k))||!/^src-[a-f0-9]{16}$/.test(s.sourceId??'')||seen.has(s.sourceId)||typeof s.title!=='string'||!s.title.trim()||s.title.length>64||s.title.split('\n').length>2)throw Error('Use distinct registered image IDs and short one/two-line titles.');seen.add(s.sourceId);}
}
export async function prepareDraftVideo(ctx,args){
 const stage=ctx.job.calls?.find(c=>c.runId===ctx.runId&&c.agentId===ctx.agentId)?.stage;
 if(ctx.roleId!=='media'||!['conversation'].includes(stage)&&!stage?.startsWith('specialist:'))throw Error('Only an allocated video editor author may render a local draft.');
 const catalog=await pinnedImageCatalog(ctx.storage,ctx.job,ctx.knowledgeRoleId??ctx.roleId),profile=ctx.localVideoProfiles?.[args.profileId];
 if(!profile||profile.clientId!==catalog.clientId||profile.family!=='Inter Variable'||!/^#[a-f0-9]{6}$/i.test(profile.canvas??'')||!/^#[a-f0-9]{6}$/i.test(profile.text??'')||typeof profile.label!=='string'||profile.label.length>40)throw Error('A matching client render profile is required.');
 const rel=catalog.roots.map(r=>relative(r,profile.font.path));if(!rel.some(r=>r&&!r.startsWith('..')&&!isAbsolute(r))||!profile.font.path.endsWith('.ttf')||await realpath(profile.font.path)!==profile.font.path)throw Error('Configured font is outside the client source roots or uses a symlink.');
 const stat=await lstat(profile.font.path);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('Bounded configured font required.');const font=await readFile(profile.font.path);if(hash(font)!==profile.font.sha256||font.readUInt32BE(0)!==0x00010000)throw Error('Configured font bytes changed or are not the verified TrueType source.');
 const frames=[];for(const scene of args.scenes)frames.push({...await readPinnedImage(ctx.storage,ctx.job,ctx.knowledgeRoleId??ctx.roleId,scene.sourceId),title:scene.title});
 return {profile,font,frames,seconds:args.secondsPerScene??5};
}
export async function renderDraftVideo(input,out,native,check){
 const {profile,font,frames,seconds}=input,width=1080,height=1920,fps=30,fontPath=join(out,'source-font.ttf');await writeFile(fontPath,font);process.env.FONTCONFIG_FILE??='/opt/homebrew/etc/fonts/fonts.conf';
 const family=(await native('/opt/homebrew/bin/fc-scan',['--format','%{family}\n',fontPath])).stdout;if(!family.split('\n').includes(profile.family))throw Error('Configured font family could not be verified.');
 const text=async(value,size,color)=>sharp({text:{text:`<span foreground="${color}">${escaped(value)}</span>`,font:`${profile.family} ${size}`,fontfile:fontPath,width:900,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 const bases=[],patches=[];
 for(let i=0;i<frames.length;i++){
  await check();const item=frames[i],b=item.bytes;const format=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':b[0]===255&&b[1]===216&&b[2]===255?'jpeg':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;if(!format||!{png:['png'],jpeg:['jpg','jpeg'],webp:['webp']}[format].includes(item.source.name.split('.').at(-1).toLowerCase()))throw Error('Registered draft image format mismatch.');const meta=await sharp(item.bytes,{limitInputPixels:64000000,failOn:'warning'}).metadata();if(!['png','jpeg','webp'].includes(meta.format)||meta.pages>1)throw Error('A supported single-frame source image is required.');
  const art=await sharp(item.bytes,{limitInputPixels:64000000,failOn:'warning'}).rotate().resize(880,820,{fit:'inside',withoutEnlargement:true}).flatten({background:profile.canvas}).png().toBuffer({resolveWithObject:true});
  const patch=await sharp({create:{width:900,height:850,channels:3,background:profile.canvas}}).composite([{input:art.data,left:Math.floor((900-art.info.width)/2),top:Math.floor((850-art.info.height)/2)}]).png().toBuffer();
  const label=await text(profile.label+' / VISUAL STUDY',36,profile.text),title=await text(item.title,96,profile.text),footer=await text('INTERNAL DRAFT / SOURCE-BASED MOTION',36,profile.text);
  if(title.info.height>270||title.info.width>900)throw Error('Shorten the title; it exceeds the protected reading area.');
  const base=await sharp({create:{width,height,channels:3,background:profile.canvas}}).composite([{input:label.data,left:90,top:280},{input:title.data,left:90,top:370},{input:footer.data,left:90,top:1560}]).png().toBuffer();
  await writeFile(join(out,`base-${i+1}.png`),base);await writeFile(join(out,`art-${i+1}.png`),patch);bases.push(base);patches.push(patch);
 }
 const argv=['-hide_banner','-loglevel','error','-nostdin'];for(let i=0;i<frames.length;i++)argv.push('-loop','1','-framerate',String(fps),'-i',join(out,`base-${i+1}.png`),'-loop','1','-framerate',String(fps),'-i',join(out,`art-${i+1}.png`));
 const filters=[];for(let i=0;i<frames.length;i++){filters.push(`[${2*i+1}:v]zoompan=z='min(1+on*0.00014,1.02)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=900x850:fps=${fps},trim=duration=${seconds},setpts=PTS-STARTPTS[a${i}]`);filters.push(`[${2*i}:v]trim=duration=${seconds},setpts=PTS-STARTPTS[b${i}]`);filters.push(`[b${i}][a${i}]overlay=90:700:shortest=1,setsar=1,format=yuv420p[s${i}]`);}
 filters.push(frames.map((_,i)=>`[s${i}]`).join('')+`concat=n=${frames.length}:v=1:a=0[v]`);
 argv.push('-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map','[v]','-an','-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-pix_fmt','yuv420p','-r',String(fps),'-t',String(frames.length*seconds),'-movflags','+faststart','-y',join(out,'draft.mp4'));await native('/opt/homebrew/bin/ffmpeg',argv);
 const probe=JSON.parse((await native('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',join(out,'draft.mp4')])).stdout),video=probe.streams.find(s=>s.codec_type==='video');
 if(!video||video.width!==width||video.height!==height||video.codec_name!=='h264'||video.pix_fmt!=='yuv420p'||video.avg_frame_rate!=='30/1'||Number(video.nb_frames)!==frames.length*seconds*fps||probe.streams.some(s=>s.codec_type==='audio')||Math.abs(Number(probe.format.duration)-frames.length*seconds)>0.05)throw Error('Rendered clip failed its duration, geometry, codec, frame or silent-audio contract.');
 await native('/opt/homebrew/bin/ffmpeg',['-v','error','-nostdin','-i',join(out,'draft.mp4'),'-f','null','-']);
 const tiles=[];for(let i=0;i<frames.length;i++){const name=`frame-${i+1}.png`;await native('/opt/homebrew/bin/ffmpeg',['-v','error','-nostdin','-ss',String(i*seconds+seconds/2),'-i',join(out,'draft.mp4'),'-frames:v','1','-y',join(out,name)]);tiles.push(await sharp(join(out,name)).resize(360,640).png().toBuffer());}
 await sharp({create:{width:360*frames.length,height:640,channels:3,background:profile.canvas}}).composite(tiles.map((tile,i)=>({input:tile,left:360*i,top:0}))).png().toFile(join(out,'contact-sheet.png'));
 const manifest={kind:'source-based-local-silent-draft',profileId:profile.id,profileSha256:hash(JSON.stringify(profile)),font:{family:profile.family,sha256:profile.font.sha256,verification:'Exact operator-configured client font bytes and native family checked; licence retained with source kit.'},width,height,fps,duration:frames.length*seconds,codec:'h264',pixelFormat:video.pix_fmt,frames:Number(video.nb_frames),audio:'intentionally silent; no audio asset supplied',fullDecodeChecked:true,scenes:frames.map((f,i)=>({index:i+1,start:i*seconds,end:(i+1)*seconds,title:f.title,source:f.source,transform:'Source aspect contained with protected padding, artwork-only centre zoom up to1.02; typography static. No new footage or generative scene.'})),review:'Draft only. Sources unchanged; rights, copy, full motion/continuity and owner approval require review. Midpoint contact sheet is not a whole-video visual assessment.'};
 await writeFile(join(out,'edit.json'),JSON.stringify(manifest,null,2));await check();return {result:manifest,files:['contact-sheet.png','draft.mp4','edit.json',...frames.map((_,i)=>`frame-${i+1}.png`)]};
}
