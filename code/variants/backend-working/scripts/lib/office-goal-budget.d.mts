export interface GoalBudgetConfig {ledgerPath:string;goalId:string;/** Pin only; owner-waived requires an appended owner waiver. */usageStopMode?:'enforced'|'owner-waived';/** Optional pin only;60 requires the recorded owner extension. */codexRemainingFloor?:70|60;maxAgeMs?:number;safetyMarginPoints?:number;/** Deterministic test clock; production callers should omit. */nowMs?:number;}
export interface GoalBudgetWindow {label:string;usedPercent:number;resetsAt:string|null;windowDurationMins:number;}
export interface GoalBudgetMeter {provider:'codex'|'claude';observedAt:string;source:string;windows:GoalBudgetWindow[];}
export interface GoalBudgetObservation {observedAt:string;initialise?:boolean;meters:GoalBudgetMeter[];}
export interface GoalBudgetResult {canDispatch:boolean;usageStopMode:'enforced'|'owner-waived';usageStatus:'observed'|'unknown';reason:'ready'|'usage_stop'|'meter_unavailable'|'accounting_uncertain'|'owner_waived_usage_unknown';detail:string;goalId:string;sequence:number;windows:Array<GoalBudgetWindow & {provider:string;initialUsedPercent:number;initialHeadroom:number;carriedUsage:number;remainingPercent:number;observedAt:string;segments:number;headroomRemaining:number}>;accountingHolds:string[];ledgerSha256:string;}
export function observeGoalBudget(config:GoalBudgetConfig,input:GoalBudgetObservation):Promise<GoalBudgetResult>;

export function reconcileResetJitterHold(config:GoalBudgetConfig,input:{expectedLedgerSha256:string;hold:string;observationSequence:number;note:string;codexProof?:{originHash:string;previousHash:string}}):Promise<GoalBudgetResult>;

export function extendGoalBudget(config:GoalBudgetConfig,input:{expectedLedgerSha256:string;codexRemainingFloor:60;authority:{kind:'owner-instruction';reference:string};note:string}):Promise<GoalBudgetResult>;

export function waiveGoalBudgetUsageStops(config:GoalBudgetConfig,input:{expectedLedgerSha256:string;authority:{kind:'owner-instruction';reference:string};note:string}):Promise<GoalBudgetResult>;

export function readGoalBudgetUsageMode(config:GoalBudgetConfig):Promise<Readonly<{goalId:string;usageStopMode:'enforced'|'owner-waived';ledgerSha256:string}>>;
export function recordGoalBudgetUsageUnavailable(config:GoalBudgetConfig,input:{attemptedAt:string;failureCategory:'authoritative_codex_meter_unavailable'|'authoritative_claude_meter_unavailable'|'meter_stale'|'meter_busy';meters?:unknown[]}):Promise<GoalBudgetResult>;
