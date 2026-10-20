import {departmentQaMethods} from '../../src/lib/office-client-team.mjs';
import {roleSkillContext} from './office-skill-library.mjs';
export function clientDeskSkillContext(agent,library,directory,selection){
 const role=agent.metadata.jarvisBlueprintRoleId,slot=agent.metadata.jarvisClientSlot,department=slot?.startsWith('qa:')?slot.slice(3):agent.metadata.jarvisQaDepartment;
 if(!department)return roleSkillContext(role,library,directory,selection);
 const selected=departmentQaMethods[department];if(!selected)throw new Error('Unknown QA department.');
 const methods=selected.map(id=>{const method=library.find(s=>s.id===id);if(!method)throw new Error('A department QA method is missing: '+id);return method;});
 // A client reviewer may use the generic test actor, but its playbook and
 // per-role references belong to this department's effective QA role.
 const scopedRole=methods.find(s=>s.kind==='workflow')?.roles[0]??role;
 const entries=methods.map(method=>({...method,roles:[scopedRole]}));
 for(const method of library.filter(s=>s.kind==='supplement'&&s.roles.includes(scopedRole)))entries.push({...method,roles:[scopedRole]});
 return roleSkillContext(scopedRole,entries,directory,selection);
}
