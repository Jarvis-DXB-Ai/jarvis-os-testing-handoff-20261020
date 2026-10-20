import {NextRequest,NextResponse} from 'next/server';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
import {clientPilot,prepareClientPilot} from '@/lib/office-client-pilot-server';
import {changeClientSourceVersion} from '@/lib/office-source-activation-server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{return NextResponse.json({setup:await clientPilot(request.nextUrl.searchParams.get('id')??'')},{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Audit allocation unavailable.'},{status:400});}}
export async function POST(request:NextRequest){try{requireInternalJarvisMutation(request);const body=await request.json();if(body.action==='activate-sources'||body.action==='recover-sources')return NextResponse.json({activation:await changeClientSourceVersion(body)},{headers:{'Cache-Control':'no-store'}});if(body.action!=='prepare')throw new Error('Unknown pilot action.');return NextResponse.json({setup:await prepareClientPilot(body)},{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Audit preparation failed.'},{status:400});}}
