import {NextResponse} from 'next/server';
import {clientLogo} from '@/lib/office-client-intake-server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const {id}=await context.params;return new Response(new Uint8Array(await clientLogo(id)),{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});}catch{return NextResponse.json({error:'No registered client logo.'},{status:404});}}
