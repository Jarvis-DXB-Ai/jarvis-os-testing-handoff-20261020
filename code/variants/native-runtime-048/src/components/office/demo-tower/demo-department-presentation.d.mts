export function demoPresentationDepartment(id:string|null|undefined):string;
export function demoDepartmentIncludes(group:string,id:string|null|undefined):boolean;
export function demoDepartmentGroups<T extends {id:string;name:string;roles:string[];headRoleId:string;qaRoleId:string}>(departments:T[]):(T&{sourceDepartmentIds:string[];headRoleIds:string[];qaRoleIds:string[]})[];
