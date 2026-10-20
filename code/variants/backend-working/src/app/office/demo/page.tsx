import Sidebar from '@/components/layout/sidebar';
import {OfficeDemo} from '@/components/office/office-demo';
export const dynamic='force-dynamic';
export const metadata={title:'Demo Office · Jarvis OS'};
export default function DemoOfficePage(){return <><Sidebar variant="office"/><OfficeDemo/></>;}
