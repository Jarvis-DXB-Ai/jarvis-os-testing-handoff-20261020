import type {OfficeCooConfig} from './office-coo-whatsapp.mjs';
import type {CooReactivePolicy,CooReactiveCaptured,CooReactiveScope} from './office-coo-reactive.mjs';
export interface CooCapturedIgnored {eventId:string;signedRawSha256:string;messageId?:string;reason:'frozen_exclusion'|'historical'|'unsupported_event'|'standby'|'unsupported_attachments'|'null_text'|'empty_text'|'oversize_text'|'unsupported_text_controls'|'unsupported_group';}
export interface CooCapturedInputs {revision:string|null;events:CooReactiveCaptured[];ignored:CooCapturedIgnored[];}
export function readOfficeCooCapturedEnvelope(config:OfficeCooConfig,event:{id:string;rawSha256:string}):Promise<Record<string,unknown>>;
export function createOfficeCooCapturedEnvelopeReader(config:OfficeCooConfig):Promise<Readonly<{revision:string|null;events:Array<{id:string;rawSha256:string;value:Record<string,unknown>}>;read(event:{id:string;rawSha256:string}):Promise<Record<string,unknown>>}>>;
export function readOfficeCooCapturedInputs(options:{config:OfficeCooConfig;policy:CooReactivePolicy;/** Trusted current-context resolver; no model/network defaults. */resolveScope:(text:string)=>Promise<CooReactiveScope>;now?:()=>number}):Promise<CooCapturedInputs>;
