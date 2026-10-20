import type {PaperclipOfficeSnapshot} from './office-paperclip';
import plan from './office-stack-plan.json';
export const roleDescriptions:Record<string,string>;
export const methodDescriptions:Record<string,string>;
export function officeAgentProfile(agent:PaperclipOfficeSnapshot['agents'][number],source:typeof plan,qaMethods:Record<string,string[]>):{roleName:string;purpose:string;departmentName:string;inputs:string[];methods:(typeof plan.skillLibrary[number]&{description:string})[];questions:{label:string;prompt:string}[]};
