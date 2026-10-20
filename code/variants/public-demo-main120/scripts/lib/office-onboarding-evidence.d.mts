import type {OfficeFoundation} from './office-foundations.mjs';
import type {OnboardingRecord,OnboardingEvidence} from '../../src/lib/office-onboarding.mjs';
import type {IntakeState} from '../../src/lib/office-client-team.mjs';
export type EvidenceRequirement={id:string;kind:'owner-approval'|'independent-review'|'tool-access';subjects:{kind:string;id:string;sha256:string}[]};
export type EvidenceManifest={scope:{clientId:string;foundationKey:string};requirements:EvidenceRequirement[]};
export function onboardingEvidenceRequirements(record:OnboardingRecord,foundation:OfficeFoundation):EvidenceManifest;
export function intakeEvidenceRequirements(state:IntakeState):EvidenceManifest;
export function readOnboardingEvidence(config:unknown,record:OnboardingRecord,foundation:OfficeFoundation):Promise<OnboardingEvidence>;
export function requireIntakeApprovalEvidence(config:unknown,state:IntakeState):Promise<{ledgerRevision:string|null;requirements:EvidenceRequirement[]}>;
