import {localOfficeEnabled} from '@/lib/office-runtime.mjs';
import {NextRequest,NextResponse} from 'next/server';
import plan from '@/lib/office-stack-plan.json';
import {researchCatalog,researchItem,saveResearchLink} from '../../../../../scripts/lib/office-research.mjs';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
export const runtime='nodejs';export const dynamic='force-dynamic';
function local(){if(!localOfficeEnabled())throw new Error('Research intake requires the private Mac environment.');}
export async function GET(request:NextRequest){try{local();const id=request.nextUrl.searchParams.get('id');return NextResponse.json(id?await researchItem(plan.storage,id):await researchCatalog(plan.storage),{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Research library unavailable.'},{status:400});}}
export async function POST(request:NextRequest){try{local();requireInternalJarvisMutation(request);return NextResponse.json(await saveResearchLink(plan.storage,await request.json()),{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Research link could not be saved.'},{status:400});}}
