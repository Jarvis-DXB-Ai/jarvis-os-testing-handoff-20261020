export function rosterDepartments(plan) {
  return [...(plan.focusDepartments ?? []), ...(plan.supportDepartments ?? [])];
}

// Missing status preserves older saved configurations. Merged identities are
// retained for history, but never offered to a new team planner.
export function assignmentRoles(plan) {
  const qa=new Set(['test',...rosterDepartments(plan).map(d=>d.qaRoleId).filter(Boolean)]);
  return plan.roles.filter(r => !qa.has(r.id) && (!r.rosterStatus || r.rosterStatus === 'active'));
}

export function validateRoster(plan) {
  const roles = [...plan.executives, ...plan.roles];
  const byId = new Map(roles.map(r => [r.id, r]));
  if (byId.size !== roles.length) throw new Error('Duplicate roster identity.');
  const departments = rosterDepartments(plan);
  if (new Set(departments.map(d => d.id)).size !== departments.length) throw new Error('Duplicate department.');
  for (const department of departments) {
    if (byId.get(department.headRoleId)?.rosterStatus !== 'active' || !department.roles.includes(department.headRoleId)) throw new Error('Department needs an active head.');
    if (new Set(department.roles).size !== department.roles.length || department.roles.some(id => !byId.has(id)) || department.core.some(id => !department.roles.includes(id))) throw new Error('Invalid department members.');
    if(plan.departmentQaEnabled&&(!department.qaRoleId||department.qaRoleId===department.headRoleId||!department.roles.includes(department.qaRoleId)||byId.get(department.qaRoleId)?.rosterStatus!=='active'))throw new Error('Department needs its own active independent QA role.');
  }
  for (const role of roles) {
    if (role.rosterStatus === 'merged') {
      if (byId.get(role.mergedInto)?.rosterStatus !== 'active' || departments.some(d => d.roles.includes(role.id))) throw new Error('Invalid merged role.');
      continue;
    }
    if (role.rosterStatus !== 'active') throw new Error('Unknown roster status.');
    const memberships = departments.filter(d => d.roles.includes(role.id));
    if (memberships.length !== 1) throw new Error('Every active role needs one department.');
    const department = memberships[0];
    const parent = role.id === 'coo' ? null : role.id === department.headRoleId ? 'coo' : department.headRoleId;
    if (role.reportsTo !== parent || role.departmentId !== department.id || role.department !== department.name) throw new Error('Role hierarchy differs from department ownership.');
  }
  if (byId.get('test')?.rosterStatus !== 'active') throw new Error('Independent QA is required.');
  return roles.filter(r => r.rosterStatus === 'active');
}
