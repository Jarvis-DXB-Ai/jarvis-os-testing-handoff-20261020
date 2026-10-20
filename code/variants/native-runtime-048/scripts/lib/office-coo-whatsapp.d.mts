export interface OfficeCooBinding {
 channelId:string; profileId:string; accountId:string; senderPhone:string;
 /** Private server-side owner allowlist. Never take this mapping from HTTP input. */
 ownerParticipantId:string;
}
export interface OfficeCooConfig {
  /** Server-pinned Meta phone node ID; never a request/binding field. */
  providerPhoneNumberId?:string;
 storage:{recordsRoot:string;recordsVolume:string;testing?:boolean};
 binding:OfficeCooBinding;
 transportTimeoutMs?:number;
}
export interface OfficeCooSendRequest {
 requestId:string;profileId:string;accountId:string;senderPhone:string;
 participantId:string;conversationId:string;message:string;
}
export interface OfficeCooApproval {
 id:string;principal:string;requestHash:string;issuedAt:string;expiresAt:string;
}
declare const approvalBrand:unique symbol;
/** Opaque, single-use, in-process server capability; cannot be deserialized. */
export interface OfficeCooApprovalCapability {readonly [approvalBrand]:true}
export type OfficeCooStatus='prepared'|'attempting'|'ambiguous'|'accepted'|'sent'|'delivered'|'read'|'failed'|'conflicted';
export interface OfficeCooOutbox {
 request:OfficeCooSendRequest;requestHash:string;bodySha256:string;
 conversationBinding:{id:string;platformConversationId:string};
 approval:OfficeCooApproval;idempotencyKey:string;createdAt:string;
 status:OfficeCooStatus;providerMessageId:string|null;observations:Record<string,unknown>[];
}
export interface OfficeCooState {
 revision:string|null;
 state:{version:number;scope:OfficeCooBinding;sequence:number;previousRevision:string|null;
 events:{id:string;rawSha256:string;value:Record<string,unknown>}[];
 outbox:Record<string,OfficeCooOutbox>;disconnected:boolean};
}
export interface OfficeCooClock {now?:()=>string}
export function officeCooRequestDigest(config:OfficeCooConfig,request:OfficeCooSendRequest):string;
export function createOfficeCooApprovalCapability(config:OfficeCooConfig,request:OfficeCooSendRequest,context:OfficeCooClock&{
 approval:OfficeCooApproval;
 /** Trusted server verifier; rechecked immediately before a transport attempt. */
 verifyApproval:(approval:Readonly<OfficeCooApproval>,request:Readonly<OfficeCooSendRequest>)=>boolean|Promise<boolean>;
}):Promise<OfficeCooApprovalCapability>;
export function readOfficeCooState(config:OfficeCooConfig):Promise<Readonly<OfficeCooState>>;
/** Point-in-time capture probe: actual store guard, integrity read, no leases/recovery/sends. */
export function assertOfficeCooCaptureReady(config:OfficeCooConfig):Promise<Readonly<{revision:string|null}>>;
export function recoverOfficeCooLock(config:OfficeCooConfig,input:{expectedLockSha256:string}):Promise<{recovered:true;sendReplayed:false}>;
export function ingestOfficeCooWebhook(config:OfficeCooConfig,input:{rawBody:string|Uint8Array;signature:string;eventId:string},context:OfficeCooClock&{secret:string}):Promise<{duplicate:boolean;revision:string|null;event?:Record<string,unknown>}>;
export interface OfficeCooWireReply {
 method:'POST';path:string;headers:{'Idempotency-Key':string};body:{accountId:string;message:string};
}
export interface OfficeCooProviderMessage {
 id:string;conversationId:string;accountId:string;platform:'whatsapp';
 senderId:string;direction:'incoming'|'outgoing';createdAt?:string;
 metadata?:{standby?:boolean;[key:string]:unknown};[key:string]:unknown;
}
export interface OfficeCooMessagePage {
 cursor:string|null;
 response:{messages:OfficeCooProviderMessage[];sortOrderApplied:'desc';pagination:{hasMore:boolean;nextCursor:string|null}};
}
export interface OfficeCooConversationProof {
 checkedAt:string;profileId:string;
 conversation:{id:string;accountId:string;platform:'whatsapp';participantId:string;threadControl?:'app'|'ai_agent'|'other';[key:string]:unknown};
 messagePages:OfficeCooMessagePage[];
 defaultControlEvidence?:unknown;
}
export function sendOfficeCooReply(config:OfficeCooConfig,request:OfficeCooSendRequest,capability:OfficeCooApprovalCapability,context:OfficeCooClock&{
 /** Must attest current exact account mapping, privacy/health and required runtime gates. */
 verifyChannel:(binding:Readonly<OfficeCooBinding>)=>boolean|Promise<boolean>;
 /** Fresh actual provider row + contiguous DESC pages; never a Boolean or HTTP-supplied claim. */
 verifyConversation:(request:Readonly<OfficeCooSendRequest>,binding:Readonly<OfficeCooBinding>,signedInbound:Readonly<{id:string;platformConversationId:string;messageId:string;sentAt:string}>)=>Promise<OfficeCooConversationProof>;
 /** Required only if current exact row reports no threadControl. Missing is not explicit app ownership. */
 verifyDefaultControl?:(evidence:unknown,binding:{request:Readonly<OfficeCooSendRequest>;binding:OfficeCooBinding;conversation:OfficeCooConversationProof['conversation'];checkedAt:string;signedInbound:Record<string,unknown>})=>boolean|Promise<boolean>;
 /** No default HTTP client; caller owns private credentials and bounded response parsing. */
 transport:(request:Readonly<OfficeCooWireReply>,context:{signal:AbortSignal})=>Promise<{success:boolean;data?:{messageId:string;conversationId:string;partialFailure?:unknown};warnings?:unknown[]}>;
 /** Optional trusted test/fault checkpoint, never request payload. */
 checkpoint?:(phase:'prepared'|'attempting'|'transport-returned')=>void|Promise<void>;
}):Promise<{replayed:boolean;outbox:Readonly<OfficeCooOutbox>}>;
export interface OfficeCooObservation {
 evidenceId:string;accountId:string;profileId:string;participantId:string;
 conversationId:string;bodySha256:string;messageId:string;
 status:'sent'|'delivered'|'read'|'failed';observedAt:string;
}
export function reconcileOfficeCooOutbox(config:OfficeCooConfig,input:{requestId:string},context:OfficeCooClock&{
 /** Server-owned provider read/verification, never an HTTP-supplied observation. No resend operation. */
 observe:(outbox:Readonly<OfficeCooOutbox>)=>Promise<OfficeCooObservation>;
}):Promise<Readonly<OfficeCooOutbox>>;
declare const conversationBrand:unique symbol;
export interface OfficeCooConversation {readonly [conversationBrand]:true;readonly id:string;readonly [key:string]:unknown}
export interface OfficeCooReadRequest {readonly method:'GET';readonly path:string;readonly query:Readonly<Record<string,string|number>>}
export function officeCooScopedReadRequest(config:OfficeCooConfig,input:{resource:'health'}|{resource:'conversations';cursor?:string}|{resource:'messages';conversation:OfficeCooConversation;cursor?:string}):OfficeCooReadRequest;
export function validateOfficeCooScopedReadResponse(config:OfficeCooConfig,request:OfficeCooReadRequest,payload:unknown):Readonly<Record<string,unknown>>|readonly OfficeCooConversation[]|readonly Record<string,unknown>[];
export function officeCooReadCoverage(config:OfficeCooConfig,result:unknown):Readonly<{resource:'conversations'|'messages';firstPage:boolean;hasMore:boolean;nextCursor:string|null;complete:boolean;latestIncomingProven:boolean;sortOrderApplied?:'desc'}>;
