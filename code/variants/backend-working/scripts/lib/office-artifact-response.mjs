/** Transport only: callers must authenticate and verify complete artifact bytes first. */
export function artifactResponse(file,bytes,{method='GET',range=null}={}){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,100}$/.test(file))throw Error('Invalid artifact download filename.');
 const ext=file.split('.').at(-1),video=ext==='mp4',headers={
  'Content-Type':({png:'image/png',svg:'image/svg+xml',json:'application/json',mp4:'video/mp4',blend:'application/octet-stream',html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',woff2:'font/woff2'})[ext]??'application/octet-stream',
  'Content-Disposition':`${['blend','svg','json','html','css','js','woff2'].includes(ext)?'attachment':'inline'}; filename="${file}"`,
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  // Verified MP4 is inert media; its browser-native media document must load
  // its own URL. Script, object and other source types remain prohibited.
  'Content-Security-Policy':video?"default-src 'none'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'":"sandbox; default-src 'none'",
  ...(video?{'Accept-Ranges':'bytes'}:{}),'Content-Length':String(bytes.length),
 };
 if(method==='HEAD')return {status:200,headers,body:null};
 if(!video||!range)return {status:200,headers,body:new Uint8Array(bytes)};
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);let start,end;
 if(m&&(m[1]||m[2])){
  if(!m[1]){const length=Number(m[2]);if(Number.isSafeInteger(length)&&length>0){start=Math.max(0,bytes.length-length);end=bytes.length-1;}}
  else{start=Number(m[1]);end=m[2]?Number(m[2]):bytes.length-1;}
 }
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=bytes.length)return {status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`,'Content-Length':'0'},body:null};
 end=Math.min(end,bytes.length-1);const body=new Uint8Array(bytes.subarray(start,end+1));return {status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(body.length)},body};
}
