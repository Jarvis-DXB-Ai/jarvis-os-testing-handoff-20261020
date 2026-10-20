export interface SingleTaskQuotaScope {goalId:'G-REAL-OFFICE-001';workOrderId:string;jobId:string;authoritySha256:string;requestSha256:string;contextRevision:string;maxJobs:1;maxDispatchAttempts:8;maxConcurrentRuns:1;expiresAt:string;}
export interface SingleTaskQuotaApproval {scope:SingleTaskQuotaScope;approvalRef:{path:string;sha256:string};}
export interface GoalBudgetConfig {ledgerPath:string;goalId:string;/** Optional pin only;60 requires the recorded owner extension. */codexRemainingFloor?:70|60|10;/** Trusted current bounded-grant scope; required when observing a floor10 ledger. */singleTaskScope?:SingleTaskQuotaScope;maxAgeMs?:number;safetyMarginPoints?:number;/** Deterministic test clock; production callers should omit. */nowMs?:number;}
export interface GoalBudgetWindow {label:string;usedPercent:number;resetsAt:string|null;windowDurationMins:number;}
export interface GoalBudgetMeter {provider:'codex'|'claude';observedAt:string;source:string;windows:GoalBudgetWindow[];}
export interface GoalBudgetObservation {observedAt:string;initialise?:boolean;meters:GoalBudgetMeter[];}
export interface GoalBudgetResult {canDispatch:boolean;reason:'ready'|'usage_stop'|'meter_unavailable'|'accounting_uncertain';detail:string;goalId:string;sequence:number;windows:Array<GoalBudgetWindow & {provider:string;initialUsedPercent:number;initialHeadroom:number;carriedUsage:number;remainingPercent:number;observedAt:string;segments:number;headroomRemaining:number}>;accountingHolds:string[];ledgerSha256:string;}
export function observeGoalBudget(config:GoalBudgetConfig,input:GoalBudgetObservation):Promise<GoalBudgetResult>;

export function reconcileResetJitterHold(config:GoalBudgetConfig,input:{expectedLedgerSha256:string;hold:string;observationSequence:number;note:string;codexProof?:{originHash:string;previousHash:string}}):Promise<GoalBudgetResult>;

export function extendGoalBudget(config:GoalBudgetConfig,input:{expectedLedgerSha256:string;authority:{kind:'owner-instruction';reference:string};note:string}&({codexRemainingFloor:60}|{codexRemainingFloor:10;singleTaskQuota:SingleTaskQuotaApproval})):Promise<GoalBudgetResult>;

export function recheckSingleTaskQuota(config:GoalBudgetConfig):Promise<void>;
