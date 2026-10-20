export interface OfficeReviewPackageConfig {
 storage: { recordsRoot: string; recordsVolume: string; testing?: boolean };
 /** Trusted server registry, never accepted from HTTP JSON. */
 packages: Array<{clientId:string;packageRoot:string;manifestSha256:string}>;
}
export interface OfficeReviewPackageRevision {clientId:string;revision:string}
export interface OfficeReviewPackageProvenance extends OfficeReviewPackageRevision {
 version:1;sourceRoot:string;sourceManifest:{path:string;sha256:string;bytes:number};entry:string;packageRevision:string;fileCount:number;totalBytes:number;reused:boolean;
}
export function stageOfficeReviewPackage(config:OfficeReviewPackageConfig,input:OfficeReviewPackageRevision):Promise<OfficeReviewPackageProvenance>;
export function readOfficeReviewPackageFile(config:OfficeReviewPackageConfig,input:OfficeReviewPackageRevision & {path:string}):Promise<OfficeReviewPackageRevision & {path:string;mime:string;sha256:string;size:number;bytes:Uint8Array<ArrayBuffer>;download:boolean}>;
