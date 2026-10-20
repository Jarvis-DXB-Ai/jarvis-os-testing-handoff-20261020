import type {OfficeFoundation} from './office-foundations.mjs';
import type {OnboardingRecord,OnboardingDraft} from '../../src/lib/office-onboarding.mjs';
export type OnboardingCatalog={foundations:OfficeFoundation[];records:OnboardingRecord[]};
export function readOnboarding(config:unknown,id:string):Promise<OnboardingRecord|null>;
export function onboardingCatalog(config:unknown):Promise<OnboardingCatalog>;
export function saveOnboarding(config:unknown,input:unknown):Promise<OnboardingRecord>;
export function prepareOnboarding(config:unknown,input:unknown):Promise<OnboardingDraft>;
