/** Internal only: tool arrays come from toolAdapterOptions and the actual
 * workspaceTools bridge export, never request fields. Does not grant tools. */
export function officeRunTurnLimit(adapterType:string,grantedTools:readonly string[],workspaceToolNames:readonly string[]):number;
