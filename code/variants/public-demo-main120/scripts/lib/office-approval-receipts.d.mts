export type ApprovalScope={clientId:string;foundationKey:string};
export type ApprovalReference={kind:string;id:string;sha256:string};
export type ApprovalKind='owner-approval'|'independent-review'|'tool-access';
export type ApprovalAuthority={type:'owner'|'reviewer'|'tool';subject:string;provider:string;verificationId:string};
export type ApprovalDecisionInput=
 |{kind:'owner-approval';decision:'approved'|'rejected'}
 |{kind:'independent-review';decision:'passed'|'rejected'}
 |{kind:'tool-access';decision:'verified'|'not-needed'|'rejected'};
export type ApprovalInput=ApprovalDecisionInput&{scope:ApprovalScope;subjects:ApprovalReference[];evidence:ApprovalReference[];expiresAt?:string|null;idempotencyKey:string;expectedRevision:string|null};
export type RevocationInput={scope:ApprovalScope;targetReceiptId:string;evidence:ApprovalReference[];idempotencyKey:string;expectedRevision:string|null};
/** Supply only from the authenticated server. Verify signature, principal permissions,
 * and exact operation/evidence. A request body's asserted identity is insufficient. */
export type ApprovalTrustedContext={authority:ApprovalAuthority;verifyAuthority:(authority:ApprovalAuthority,operation:{event:'decision'|'revocation'}&(ApprovalInput|RevocationInput))=>boolean|Promise<boolean>};
export type ApprovalReceipt=Readonly<{
 version:1;id:string;revision:string;sequence:number;event:'decision'|'revocation';scope:Readonly<ApprovalScope>;
 kind:ApprovalKind;decision:'approved'|'rejected'|'passed'|'verified'|'not-needed'|null;
 subjects:readonly Readonly<ApprovalReference>[];evidence:readonly Readonly<ApprovalReference>[];
 expiresAt:string|null;targetReceiptId:string|null;authority:Readonly<ApprovalAuthority>;
 createdAt:string;idempotencyKey:string;requestHash:string;
}>;
export type ApprovalLedger={revision:string|null;receipts:readonly ApprovalReceipt[]};
export type ApprovalMutationResult=ApprovalLedger&{receipt:ApprovalReceipt;replayed:boolean};
export function readApprovalReceipts(config:unknown,scope:ApprovalScope):Promise<ApprovalLedger>;
export function appendApprovalReceipt(config:unknown,input:ApprovalInput,context:ApprovalTrustedContext):Promise<ApprovalMutationResult>;
export function revokeApprovalReceipt(config:unknown,input:RevocationInput,context:ApprovalTrustedContext):Promise<ApprovalMutationResult>;
/** Use the complete current receipts array from a server store read. Copies,
 * filtered subsets and serialized/browser objects fail provenance validation.
 * All relevant source versions must be included as subjects. No file content or
 * signature verification occurs here; the issuing trusted caller owns that work. */
export function validateApprovalEvidence(input:{receipts:readonly ApprovalReceipt[];scope:ApprovalScope;kind:ApprovalKind;subjects:ApprovalReference[];now:string}):{
 valid:boolean;reason:'invalid-requirement'|'untrusted'|'missing'|'rejected'|'revoked'|'future'|'expired'|'stale-or-inexact-subjects'|'matched';receiptId:string|null;
};
