import structure from './office-brain-structure.json' with {type:'json'};
export {structure as officeBrainStructure};
export function brainRolePolicy(role){
 if(!Object.hasOwn(structure.rolePolicies,role))throw new Error('Unknown active Brain role.');
 return structure.rolePolicies[role];
}
export function brainTaskProfile(taskType){
 if(!Object.hasOwn(structure.retrievalProfiles,taskType))throw new Error('Unknown Brain task profile.');
 return structure.retrievalProfiles[taskType];
}
