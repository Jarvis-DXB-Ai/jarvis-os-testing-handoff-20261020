export type SubscriptionMeter={provider:string;name:string;plan:string|null;source:string;windows:{label:string;usedPercent:number;remainingPercent:number;resetsAt:string|null}[];resetCredits:number|null};
export function normaliseCodexUsage(value:Record<string,unknown>):SubscriptionMeter;
export function normaliseClaudeUsage(value:Record<string,unknown>,plan?:string|null):SubscriptionMeter;
export function readCodexUsage(options?:{binary?:string;timeoutMs?:number}):Promise<SubscriptionMeter>;
export function readClaudeUsage():Promise<SubscriptionMeter>;
