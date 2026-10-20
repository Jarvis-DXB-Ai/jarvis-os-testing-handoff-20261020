import structure from '../../src/lib/office-brain-structure.json';
export const brainStructureRevision:string;
export type BrainStructureRecord={structure:typeof structure;structureRevision:string;revision:string;installedAt:string;matchesCurrent:boolean};
export function readBrainStructure(config:unknown):Promise<BrainStructureRecord|null>;
export function initialiseBrainStructure(config:unknown):Promise<BrainStructureRecord>;
export function brainStorageLocations(config:unknown):Promise<{id:string;available:boolean}[]>;
export function savedFeedbackTasks(config:unknown,jobs:import('../../src/lib/office-team-contract').OfficeTeamTask[],clientId?:string|null):Promise<{id:string;brief:string;version:string;status:string;scope:string}[]>;
