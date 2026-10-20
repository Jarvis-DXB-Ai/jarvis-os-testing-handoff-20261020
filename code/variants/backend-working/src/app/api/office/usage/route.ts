import {NextResponse} from 'next/server';
import {officeUsage} from '@/lib/office-usage-server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{return NextResponse.json(await officeUsage(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Subscription meters are unavailable.'},{status:503});}}
