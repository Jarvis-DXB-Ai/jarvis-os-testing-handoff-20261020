export const OFFICE_READ_TIMEOUT_MS: number;
export const OFFICE_RECORD_MAX_AGE_MS: number;
export const OFFICE_READINESS_MAX_AGE_MS: number;
export function readOfficeJson<T>(path: string, options?: {fetchImpl?: typeof fetch; timeoutMs?: number}): Promise<T>;
export function readOfficeRecords(input: {onBoard: (board: import('@/lib/office-paperclip').PaperclipOfficeSnapshot) => void; onCatalog: (catalog: import('@/lib/office-team-contract').OfficeTeamTaskCatalog) => void; onBoardError: (error: unknown) => void; onCatalogError: (error: unknown) => void; fetchImpl?: typeof fetch; timeoutMs?: number}): Promise<void>;
export function officeReadState(input: {now: number; readiness: {checkedAt: string; canEnqueue: boolean} | null; boardConnected: boolean; observedAt: number; catalogReachable: boolean; recordsObservedAt: number}): {boardFresh: boolean; recordsFresh: boolean; readinessFresh: boolean; connected: boolean; canEnqueue: boolean};
