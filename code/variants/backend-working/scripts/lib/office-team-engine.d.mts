import type { OfficeTeamTask, OfficeTaskInput } from '../../src/lib/office-team-contract';
export const activeStates: string[];
export const jobDirectory: string;
export function createJob(input: unknown, directory?: string,options?:{departmentPackageReview?:boolean;selectedArtifacts?:import('./office-linked-artifacts.mjs').LinkedArtifactScope;specialistArtifacts?:boolean;queueManaged?:boolean;knowledgeContext?:import('./office-foundations.mjs').OfficeContextReceipt}): Promise<{ job: OfficeTeamTask; created: boolean }>;
export function listJobs(directory?: string, options?: {kind?:'team'|'conversation'|'all';agentId?:string|null;limit?:number}): Promise<OfficeTeamTask[]>;
export function readJob(id: string, directory?: string): Promise<OfficeTeamTask>;
export function stopJob(id: string, directory?: string): Promise<OfficeTeamTask>;
export function reviewJob(id: string, note: unknown, directory?: string, api?: ReturnType<typeof paperclipClient>): Promise<OfficeTeamTask>;
export function paperclipClient(base?: string): (path: string, body?: unknown, method?: string) => Promise<Record<string, unknown>>;
export function reconcileJob(id: string, api: ReturnType<typeof paperclipClient>, directory?: string): Promise<OfficeTeamTask>;
export function recoverDeliveryHandoff(id:string,plan:unknown,options?:{api?:ReturnType<typeof paperclipClient>;directory?:string;expectedUpdatedAt?:string}):Promise<OfficeTeamTask>;
export type DepartmentCorrection={partId:string;expectedOutputSha256:string;replacements:{from:string;to:string;occurrences?:number}[]};
export function prepareDepartmentRevision(id:string,input:{departmentId?:string;note?:string;expectedUpdatedAt?:string;corrections?:DepartmentCorrection[]},directory?:string):Promise<OfficeTeamTask>;
export function prepareDepartmentEvidenceReview(id:string,input:{departmentId?:string;note?:string;expectedUpdatedAt?:string;partHashes?:Record<string,string>;assignmentCorrections?:{partId:string;expectedAssignmentSha256:string;replacements:{from:string;to:string}[]}[]},directory?:string):Promise<OfficeTeamTask>;
export function recoverDepartmentQa(id:string,expectedUpdatedAt:string|undefined,plan:unknown,options?:{api?:ReturnType<typeof paperclipClient>;directory?:string}):Promise<OfficeTeamTask>;
export function validateTask(input: unknown): OfficeTaskInput;
export function savedAgentTaskContext(job:OfficeTeamTask,agentId:string):{brief:string;ownWork:{assignment:string;output:string|null;status:string}[];departmentSummaries:{department:string;partIds:string[];output:string|null;status:string}[];combinedDraft?:string|null}|null;

export function prepareFinalRevision(id:string,input:{note?:string;expectedUpdatedAt?:string;corrections?:DepartmentCorrection[]},directory?:string):Promise<OfficeTeamTask>;

export function recoverPlanning(id:string,expectedUpdatedAt:string|undefined,plan:unknown,options?:{api?:ReturnType<typeof paperclipClient>;directory?:string}):Promise<OfficeTeamTask>;
export function recoverUndispatchedStage(id:string,expectedUpdatedAt:string|undefined,plan:unknown,options?:{api?:ReturnType<typeof paperclipClient>;directory?:string}):Promise<OfficeTeamTask>;

type DepartmentReviewPart = {id:string;roleId?:string;agentId?:string;issueId?:string|null;issueIdentifier?:string|null;assignment:string;output:string;dependsOn?:string[];coordinatorCorrection?:{sourceSha256:string}};
export function departmentReviewParts(results:DepartmentReviewPart[],allSteps?:DepartmentReviewPart[]):{id:string;roleId?:string;authorAgentId?:string;authorIssueId:string|null;authorIssueIdentifier:string|null;assignment:string;output:string;outputSha256:string;wordCount:number;dependencies:{id:string;outputSha256:string|null;priorOutputSha256?:string}[]}[];

export function retryDepartmentQa(id:string,expectedUpdatedAt:string|undefined,plan:unknown,options?:{api?:ReturnType<typeof paperclipClient>;directory?:string}):Promise<OfficeTeamTask>;
export function specialistOutputContract(job:OfficeTeamTask,step:OfficeTeamTask["steps"][number]):string;

export function reviewedSingleArtifact(job:OfficeTeamTask):{output:string;receipt:Record<string,unknown>}|null;

export function reportsComplete(job:OfficeTeamTask):boolean;
/** New package jobs pin departmentPartsReviewVersion=1; historical jobs are not upgraded on replay. */
export function prepareDepartmentHeadRevision(id:string,input:{departmentId?:string;note?:string;expectedUpdatedAt?:string;continueOnly?:boolean},directory?:string):Promise<OfficeTeamTask>;
