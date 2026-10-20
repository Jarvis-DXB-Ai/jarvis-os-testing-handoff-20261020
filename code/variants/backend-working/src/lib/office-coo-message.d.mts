import type {OfficeContextRequest} from '../../scripts/lib/office-foundations.mjs';
export const defaultCooCriteria:string[];
export function cooRetrievalProfile(brief:string,fallback?:OfficeContextRequest['taskType']):OfficeContextRequest['taskType'];
export function cooMessageInput(input:{id:string;brief:string;context?:string;criteria?:string[];contextRequest:OfficeContextRequest}):{id:string;brief:string;context:string;criteria:string[];autoContext:true;departmentId:null;contextRequest:OfficeContextRequest};
export function requireOfficeContextRevision(input:unknown,bundle:{revision:string}):void;
export function resolveCooFoundation(brief:string,request:OfficeContextRequest,foundations:import('../../scripts/lib/office-foundations.mjs').OfficeFoundation[]):OfficeContextRequest;
