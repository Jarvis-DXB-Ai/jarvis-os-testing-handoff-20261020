import {NextRequest,NextResponse} from 'next/server';
import {officeCooServiceCall,OFFICE_COO_SERVICE_BODY_LIMIT} from '@/lib/office-coo-reactive-server';
import {privateMacPilotEnabled} from '@/lib/office-runtime.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function readBoundedBody(request:NextRequest){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>OFFICE_COO_SERVICE_BODY_LIMIT)throw Error('Service size');chunks.push(value);}return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}
 finally{await reader.cancel().catch(()=>{});}
}
export async function POST(request:NextRequest){
 try{
  // NextURL canonicalizes loopback hostnames, including 127.0.0.1, to localhost.
  const origin=privateMacPilotEnabled()?'http://localhost:3103':'http://localhost:3101';
  if(request.nextUrl.origin!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('Service boundary');
  const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>OFFICE_COO_SERVICE_BODY_LIMIT))throw Error('Service size');
  const body=await readBoundedBody(request);
  const result=await officeCooServiceCall(body,{at:request.headers.get('x-jarvis-coo-at')??'',signature:request.headers.get('x-jarvis-coo-signature')??''});
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'The private COO service request could not be verified. No request was replayed.'},{status:403,headers:{'Cache-Control':'no-store'}});}
}
