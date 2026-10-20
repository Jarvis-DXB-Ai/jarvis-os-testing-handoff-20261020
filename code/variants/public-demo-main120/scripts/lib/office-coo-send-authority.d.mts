import type {OfficeCooBinding,OfficeCooApproval,OfficeCooSendRequest,OfficeCooWireReply} from './office-coo-whatsapp.mjs';
export interface OfficeCooSendAuthorityConfig {
 /** Fixed private host path, never HTTP input. Must already exist: direct/owned/mode0700. */
 privateDirectory:string;binding:OfficeCooBinding;now?:()=>string;
}
export interface OfficeCooSendAuthorityClaim {
 requestHash:string;wireHash:string;idempotencyKey:string;challenge:string;claimedAt:string;
}
export interface OfficeCooSendAuthorityRecord {
 version:1;revision:string;sequence:number;previousRevision:string|null;binding:OfficeCooBinding;
 approval:OfficeCooApproval;status:'pending'|'claimed'|'revoked';
 privacy:{cloudApiEventSharing:boolean;marketingOptimization:boolean;observedAt:string;evidenceSha256:string};
 operatorReview:{principal:string;issuedAt:string;expiresAt:string;evidenceSha256:string};
 claim:OfficeCooSendAuthorityClaim|null;
}
export interface OfficeCooSendAuthorityContext {
 binding:OfficeCooBinding;request:OfficeCooSendRequest;
 signedInbound:{id:string;platformConversationId:string;messageId:string;sentAt:string};
 wire:OfficeCooWireReply;requestHash:string;wireHash:string;challenge:string;
 /** Qualified separately by core/adapter and trusted creation-provenance verifier. */
 defaultControlEvidence?:unknown;
}
export interface OfficeCooSendAuthorityVerdict {
 approved:true;privacyVerified:true;requestHash:string;wireHash:string;challenge:string;
 checkedAt:string;authorityRevision:string;
}
/** Pure canonical revision. Does not write/initialize/approve anything. */
export function officeCooSendAuthorityRevision(record:Omit<OfficeCooSendAuthorityRecord,'revision'>|OfficeCooSendAuthorityRecord):string;
/** Full exact canonical wire hash. Does not send or grant a capability. */
export function officeCooSendAuthorityWireDigest(wire:OfficeCooWireReply):string;
/** Reads actual private coherent record; all inaccessible/invalid/claimed/revoked states returnfalse. */
export function verifyApproval(config:OfficeCooSendAuthorityConfig,approval:OfficeCooApproval,request:OfficeCooSendRequest):Promise<boolean>;
/** Exclusive durable one-use claim; final synchronous current-state fence after cleanup awaits.
 * Refuses retained locks/replays/revocations without clearing or retrying. */
export function claimCurrentSendAuthority(config:OfficeCooSendAuthorityConfig,context:OfficeCooSendAuthorityContext):Promise<Readonly<OfficeCooSendAuthorityVerdict>>;
