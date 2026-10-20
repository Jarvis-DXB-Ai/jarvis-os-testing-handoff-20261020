import {NextResponse} from 'next/server';
import {officeReadiness} from '@/lib/office-readiness-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try{return NextResponse.json(await officeReadiness(),{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Office readiness could not be verified. Restore the local services and try again.'},{status:503});}
}
