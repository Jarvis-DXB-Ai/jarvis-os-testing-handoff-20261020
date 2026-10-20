export const skillDirectory:string;
export type OfficeSkill={id:string;name:string;roles:string[];department:string;repo:string;path:string;ref:string;license:string;kind?:string;contextPath?:string;contextMode?:string;references?:string[];roleReferences?:boolean;triggers?:{always?:boolean;terms?:string[];stages?:string[]};fileHashes?:Record<string,string|undefined>};
export type OfficeSkillReceipt={id:string;repo:string;ref:string;sha256:string;contextSha256:string;contextPath:string;references:string[]};
export function skillReadiness(library:OfficeSkill[],directory?:string):Promise<(OfficeSkill&{installed:boolean;integrity:string})[]>;
export function roleSkillContext(roleId:string,library:OfficeSkill[],directory?:string,selection?:{brief?:string;assignment?:string;stage?:string}):Promise<{text:string;receipts:OfficeSkillReceipt[]}>;

export function selectRoleSkills(roleId:string,library:OfficeSkill[],selection?:{brief?:string;assignment?:string;stage?:string}):OfficeSkill[];
