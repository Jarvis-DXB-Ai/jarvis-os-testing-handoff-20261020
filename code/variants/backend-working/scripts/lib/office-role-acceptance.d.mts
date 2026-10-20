export type RoleAcceptanceRecord = Record<string, unknown>;
export interface RoleAcceptanceInput {
  plan: any;
  jobs?: any[];
  nativeRuns?: any[];
  actors?: any[];
  clientId?: string | null;
  methodReceipts?: Record<string, any[]>;
  methodReadiness?: any[];
  toolCatalog?: Record<string, string[]>;
  /** Only integrity-reader verified receipts, never model-reported use. */
  toolReceipts?: any[];
  observedAt: string;
}
export interface RoleAcceptanceInventory {
  version: 1;
  observedAt: string;
  clientId: string | null;
  companyId: string;
  totals: {roles: number; scopedJobs: number; nativeCalls: number; rolesWithNativeCall: number;
    rolesWithCurrentMethodCall: number; rolesWithCurrentPartsQa: number; rolesWithCurrentPackageQa: number};
  roles: any[];
  rejectedCalls: any[];
  historicalMergedRoles: any[];
  limits: string[];
}
export function verifyRoleNativeCall(call: any, run: any, companyId: string): boolean;
export function roleDependencyAllocation(steps: any[]): {valid: boolean; reason: string | null; parts: any[]};
export function buildRoleAcceptanceInventory(input: RoleAcceptanceInput): RoleAcceptanceInventory;
