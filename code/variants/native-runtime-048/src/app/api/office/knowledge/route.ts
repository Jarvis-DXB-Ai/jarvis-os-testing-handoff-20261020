import {NextRequest,NextResponse} from 'next/server';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
import {officeKnowledge,mutateOfficeKnowledge,previewOfficeContext} from '@/lib/office-foundations-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{return NextResponse.json(await officeKnowledge(),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Knowledge unavailable.'},{status:503});}
}
export async function POST(request:NextRequest){
 try{
  requireInternalJarvisMutation(request);const value=await request.json();
  const result=value.action==='preview'?await previewOfficeContext(value.request,{roleId:value.roleId??'coo'}):await mutateOfficeKnowledge(value);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Knowledge action failed.'},{status:400});}
}
