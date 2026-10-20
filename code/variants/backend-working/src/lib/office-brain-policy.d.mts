import structure from './office-brain-structure.json';
export const officeBrainStructure:typeof structure;
export function brainRolePolicy(role:string):{name:string;department:string;sections:string[];assetAccess:string};
export function brainTaskProfile(taskType:string):{label:string;clientBrainTaskType:'general_marketing'|'strategy_support'|'caption_writing'|'image_generation'|'video_generation'|'campaign_planning'|'client_response'};
