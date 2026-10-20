import {officeReviewPackageResponse} from '@/lib/office-review-package-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Params={clientId:string;revision:string;asset:string[]};
export async function GET(request:Request,{params}:{params:Promise<Params>}){
 return officeReviewPackageResponse(request,await params);
}
export const HEAD=GET;
