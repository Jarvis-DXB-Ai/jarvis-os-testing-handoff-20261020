import {NextResponse} from 'next/server';
import {refreshPostAnalytics} from '@/lib/social-performance-server';
export async function POST(_:Request,{params}:{params:Promise<{id:string;observationId:string}>}){
 const {id,observationId}=await params;
 if(![id,observationId].every(value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)))return NextResponse.json({error:'Invalid client or post identity.'},{status:400});
 try{return NextResponse.json({details:await refreshPostAnalytics(id,observationId)},{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Unable to refresh this client’s post reports. Check the account mapping and saved post identity.'},{status:409});}
}
