import plan from '../../src/lib/office-stack-plan.json';
export function officeTaskRoute(source:typeof plan,clientBrain:Record<string,unknown>|null|undefined,departmentId?:string|null):{department:typeof plan.focusDepartments[number]|null;plannerRoleId:string;roles:typeof plan.roles};
