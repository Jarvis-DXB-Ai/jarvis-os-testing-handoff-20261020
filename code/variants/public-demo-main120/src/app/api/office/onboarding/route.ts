import {localOfficeEnabled} from '@/lib/office-runtime.mjs';
import {NextRequest,NextResponse} from 'next/server';
import {requireInternalJarvisMutation} from '@/lib/internal-api-request';
import plan from '@/lib/office-stack-plan.json';
import {readOnboardingEvidence} from '../../../../../scripts/lib/office-onboarding-evidence.mjs';
import {readFoundation} from '../../../../../scripts/lib/office-foundations.mjs';
import {onboardingCatalog,saveOnboarding,prepareOnboarding} from '../../../../../scripts/lib/office-onboarding.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function local(){if(!localOfficeEnabled()||process.env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Onboarding requires the private isolated Mac Office.');}
export async function GET(){try{local();return NextResponse.json(await onboardingCatalog(plan.storage),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Onboarding unavailable.'},{status:503});}}
export async function POST(request:NextRequest){try{local();requireInternalJarvisMutation(request);const raw=await request.text();if(raw.length>80000)throw new Error('Onboarding request too large.');const input=JSON.parse(raw);if(input.action==='prepare')return NextResponse.json(await prepareOnboarding(plan.storage,input),{headers:{'Cache-Control':'no-store'}});if(input.action!=='save')throw new Error('Unknown onboarding action.');const record=await saveOnboarding(plan.storage,input);return NextResponse.json({record:{...record,evidence:await readOnboardingEvidence(plan.storage,record,await readFoundation(plan.storage,record.foundationId))}},{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Onboarding action failed.'},{status:400});}}
