import plan from './office-stack-plan.json';
export const officeDepartments = plan.focusDepartments;
export const allOfficeDepartments = [...plan.focusDepartments, ...plan.supportDepartments];
export const coreRoleIds = new Set(['coo', ...officeDepartments.flatMap(d => d.roles)]);
export function departmentForRole(id: string | null | undefined) {
  return allOfficeDepartments.find(d => d.roles.includes(id ?? ''));
}
