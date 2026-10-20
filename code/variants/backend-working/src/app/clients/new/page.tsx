import Link from 'next/link';
import Sidebar from '@/components/layout/sidebar';
import {ClientOnboardingChat} from '@/components/clients/client-onboarding-chat';
export default async function NewClientPage({searchParams}:{searchParams:Promise<{clientId?:string}>}){const {clientId}=await searchParams;return <main className="jarvis-dark-shell flex min-h-screen text-white"><Sidebar/><section className="jarvis-page flex-1"><Link href="/clients" className="jarvis-muted-button mb-3 inline-flex px-3 py-2 text-xs">← Back to clients</Link><ClientOnboardingChat initialId={clientId}/></section></main>;}
