import {NextRequest,NextResponse} from 'next/server';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
import {officeConversation,sendOfficeConversation,controlOfficeConversation} from '@/lib/office-conversations-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 try{return NextResponse.json(await officeConversation(request.nextUrl.searchParams.get('agentId')??'',request.nextUrl.searchParams.get('clientId')),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Conversation unavailable.'},{status:400});}
}
export async function POST(request:NextRequest){
 try{requireInternalJarvisMutation(request);const body=await request.json();const job=body.action?await controlOfficeConversation(body):await sendOfficeConversation(body);return NextResponse.json({job},{status:201,headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Message could not be saved.'},{status:400});}
}
