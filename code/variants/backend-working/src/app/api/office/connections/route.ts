import {localOfficeEnabled} from '@/lib/office-runtime.mjs';
import {NextRequest,NextResponse} from 'next/server';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
import {probeSharedProvider,sharedProviderSpecs} from '../../../../../scripts/lib/office-shared-connections.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 try{
  if(!localOfficeEnabled())return NextResponse.json({error:'Private shared-connection verification is unavailable here.'},{status:403});
  requireInternalJarvisMutation(request);
  const body=await request.json();
  if(typeof body.provider!=='string'||!Object.hasOwn(sharedProviderSpecs,body.provider)||Object.keys(body).some(key=>key!=='provider'))return NextResponse.json({error:'Select a supported provider; credentials are configured securely outside this request.'},{status:400});
  return NextResponse.json(await probeSharedProvider(body.provider),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Internal shared connection check could not be completed.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
