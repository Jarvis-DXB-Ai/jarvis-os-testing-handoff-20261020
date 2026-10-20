import {OfficeResearch} from '@/components/office/office-research';
export const dynamic='force-dynamic';
export default async function ResearchPage({searchParams}:{searchParams:Promise<{clientId?:string}>}){const {clientId}=await searchParams;return <OfficeResearch clientId={clientId&&/^[a-f0-9-]{36}$/i.test(clientId)?clientId:undefined}/>;}
