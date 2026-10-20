export type CooReleaseEvidence={artifactSha256:string;departmentEvidenceSha256:string;criteriaSha256:string;requestSha256:string};
export function requiresCooReleaseReview(job:any):boolean;
export function cooReleaseEvidence(job:any):CooReleaseEvidence;
export function cooReleaseReviewCurrent(job:any):boolean;
