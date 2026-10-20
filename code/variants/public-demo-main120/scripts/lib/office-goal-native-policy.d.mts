import type {GoalBudgetConfig,GoalBudgetObservation,GoalBudgetResult,GoalBudgetMeter,SingleTaskQuotaScope} from './office-goal-budget.mjs';
import type {SubscriptionMeter} from './office-subscription-usage.mjs';
export interface GoalNativeBinding {privateDirectory:string;ledgerPath:string;goalId:string;}
export interface GoalNativeDecision {id:string;goalId:string;stage:'admission'|'modelPolicy';canDispatch:boolean;reason:string;observedAt:string;checkpointSaved:boolean;recheckQuota:()=>Promise<void>;sequence?:number;ledgerSha256?:string;}
export interface GoalNativeDependencies {now?:()=>number;readCodexUsage?:()=>Promise<SubscriptionMeter & {observedAt?:string}>;readClaudeUsage?:()=>Promise<SubscriptionMeter & {observedAt?:string}>;observeGoalBudget?:(config:GoalBudgetConfig,input:GoalBudgetObservation)=>Promise<GoalBudgetResult>;}
export function normalizeGoalNativeMeter(meter:unknown,provider:'codex'|'claude',completedAt:string):GoalBudgetMeter;
export function createGoalNativePolicy(binding:GoalNativeBinding,dependencies?:GoalNativeDependencies):Readonly<{check(stage:'admission'|'modelPolicy',singleTaskScope?:SingleTaskQuotaScope):Promise<Readonly<GoalNativeDecision>>;admission():Promise<Readonly<GoalNativeDecision>>;modelPolicy(context?:unknown):Promise<boolean>}>;

export function readGoalNativeBinding(privateDirectory:string):Promise<Readonly<GoalNativeBinding>>;
