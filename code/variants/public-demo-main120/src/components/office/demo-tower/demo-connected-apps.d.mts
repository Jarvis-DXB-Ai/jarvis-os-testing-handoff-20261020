import type {DemoTask} from '@/lib/office-demo.mjs';
export type DemoConnectedApp={id:string;name:string;purpose:string;prospective:boolean;departments?:string[];roles?:string[];match?:string};
export function demoAppIcon(id:string):string|null;
export function demoConnectedApps(base:{id:string;name:string;purpose:string}[]):DemoConnectedApp[];
export function demoAppRelatedTasks(app:DemoConnectedApp,jobs:DemoTask[]):DemoTask[];
export function demoAppStripKey(event:{key:string;altKey:boolean;ctrlKey:boolean;metaKey:boolean;currentTarget:HTMLDivElement;preventDefault():void}):void;
export function demoAppStripFocus(event:{currentTarget:HTMLDivElement;target:EventTarget}):void;
