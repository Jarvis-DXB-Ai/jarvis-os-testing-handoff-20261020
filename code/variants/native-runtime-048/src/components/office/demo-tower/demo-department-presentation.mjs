// Demo presentation only: original department/task/role ownership stays unchanged.
export const demoPresentationDepartment=id=>id==='email'?'social':id??'all';
export const demoDepartmentIncludes=(group,id)=>group==='all'||demoPresentationDepartment(group)===demoPresentationDepartment(id);
export function demoDepartmentGroups(departments){return departments.filter(d=>d.id!=='email').map(d=>{const sources=d.id==='social'?departments.filter(s=>['social','email'].includes(s.id)):[d];return {...d,name:d.id==='social'?'Marketing':d.name,roles:[...new Set(sources.flatMap(s=>s.roles))],sourceDepartmentIds:sources.map(s=>s.id),headRoleIds:sources.map(s=>s.headRoleId),qaRoleIds:sources.map(s=>s.qaRoleId)};});}
