import type {AuditSource} from '../../src/lib/office-client-team.mjs';
export function publicAddress(ip:string):boolean;
export function readPublicPage(url:string,options?:unknown):Promise<{url:string;html:string}>;
export function inspectPublicHtml(url:string,html:string):AuditSource;
export function auditPublicSources(urls:string[],options?:unknown):Promise<AuditSource[]>;
