import {localOfficeEnabled} from './office-runtime.mjs';
import "server-only";
import {projectPaperclipSnapshot,type PaperclipOfficeSnapshot}from'./office-paperclip';
import{createPaperclipSnapshotReader}from'../../scripts/lib/office-paperclip-snapshot.mjs';
import plan from'./office-stack-plan.json';

// Coalesce concurrent Office/Brain/readiness reads and cache for one second.
// Never treat retained records as current after a failed refresh.
const readSnapshot=createPaperclipSnapshotReader({project:projectPaperclipSnapshot});
export async function loadPaperclipOfficeSnapshot({includeHistory=true}:{includeHistory?:boolean}={}):Promise<PaperclipOfficeSnapshot>{
 const local=localOfficeEnabled();
 return readSnapshot({base:process.env.JARVIS_PAPERCLIP_URL||(local?'http://127.0.0.1:3100':''),companyId:process.env.JARVIS_PAPERCLIP_COMPANY_ID||(local?plan.paperclipCompanyId:''),token:process.env.JARVIS_PAPERCLIP_TOKEN||'',local,includeHistory});
}
