import {NextResponse} from 'next/server';
import {officeTools} from '@/lib/office-tools-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json(await officeTools(),{headers:{'Cache-Control':'no-store'}});}
