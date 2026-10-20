/** Native turn allowance, derived only from server-issued tool groups.
 * This does not grant tools, change their attempt caps, or enable retries.
 * workspaceToolNames MUST be the actual bridge workspaceTools export; every
 * other already-granted tool belongs to its existing production counter.
 */
export function officeRunTurnLimit(adapterType, grantedTools, workspaceToolNames) {
  if (typeof adapterType !== 'string' || !adapterType.trim()
    || !Array.isArray(grantedTools) || grantedTools.length > 64
    || !Array.isArray(workspaceToolNames) || workspaceToolNames.length > 64
    || [...grantedTools, ...workspaceToolNames].some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(name))) {
    throw new Error('Trusted adapter and bridge tool-group arrays required.');
  }
  if (!grantedTools.length) return adapterType === 'claude_local' ? 3 : 1;
  if (!workspaceToolNames.length) throw new Error('Actual bridge workspace classification required.');
  const workspace = new Set(workspaceToolNames);
  const hasWorkspace = grantedTools.some(name => workspace.has(name));
  const hasProduction = grantedTools.some(name => !workspace.has(name));
  // performTool currently enforces these two disjoint per-run counters.
  // One native turn per permitted serial tool attempt, then one final reply.
  // Image/video sublimits remain enforced by the bridge, not enlarged here.
  return Math.min((hasWorkspace ? 24 : 0) + (hasProduction ? 6 : 0) + 1, 31);
}
