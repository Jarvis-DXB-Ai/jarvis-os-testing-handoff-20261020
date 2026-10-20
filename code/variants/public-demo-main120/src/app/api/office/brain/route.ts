import {NextRequest,NextResponse} from 'next/server';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
import {officeBrainSnapshot,saveOfficeFeedback} from '@/lib/office-brain-server';
import {ClientBrainV2HttpError} from '@/lib/client-brain-v2-server-core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{return NextResponse.json(await officeBrainSnapshot(request.nextUrl.searchParams.get('clientId')??undefined),{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Brain unavailable.'},{status:error instanceof ClientBrainV2HttpError?error.status:503});}}
export async function POST(request:NextRequest){try{requireInternalJarvisMutation(request);const input=await request.json();if(input.action!=='feedback')throw new Error('Choose a feedback action.');const saved=await saveOfficeFeedback(input);return NextResponse.json(saved,{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Feedback was not saved.'},{status:error instanceof ClientBrainV2HttpError?error.status:400});}}
