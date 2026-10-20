import {assignmentRoles} from './office-roster.mjs';
import {clientAssignmentRoles,clientReportPlan} from './office-client-scope.mjs';
/** Routing narrows purchased/agency specialist scope; it cannot grant a new role. */
export function officeTaskRoute(plan,clientBrain,departmentId){
 const roles=clientAssignmentRoles(assignmentRoles(plan),clientBrain);
 if(!departmentId)return {department:null,plannerRoleId:'coo',roles};
 const departments=clientReportPlan(plan,clientBrain?.officeTeam).focusDepartments??[];
 const department=departments.find(d=>d.id===departmentId);
 if(!department?.headRoleId)throw new Error('This department is not available in the selected Office.');
 const selected=roles.filter(r=>department.roles.includes(r.id));
 if(!selected.length)throw new Error('This department has no available specialists.');
 return {department,plannerRoleId:department.headRoleId,roles:selected};
}
