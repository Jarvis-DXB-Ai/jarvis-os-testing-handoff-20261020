import type {PaperclipOfficeSnapshot} from './office-paperclip';
export function clientOfficeHref(clientId?:string):string;
export function defaultOfficeClient(clients:{id:string;name:string}[],requested?:string,scope?:string):string;
export function scopedOfficeSnapshot(snapshot:PaperclipOfficeSnapshot|null,clientId:string):PaperclipOfficeSnapshot|null;
