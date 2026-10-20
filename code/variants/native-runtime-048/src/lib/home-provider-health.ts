type Connection = { id: string; client_id: string; platform: string; status: string; provider_connection_id: string | null; platform_account_id: string };
type Snapshot = { client_id: string; platform: string; provider_account_id: string; period_key: string; synced_at: string };

/** Only configured organic accounts are expected to have retained snapshots. */
export function providerSnapshotHealth(connections: Connection[], snapshots: Snapshot[], now: number) {
  const expected = connections.filter(c => ["instagram", "facebook"].includes(c.platform)
    && ["connected", "needs_attention", "expired"].includes(c.status));
  if (!expected.length) return { state: "ok" as const, note: "No organic accounts are connected yet; snapshot monitoring is not applicable." };
  const affected = expected.filter(c => {
    if (c.status !== "connected") return true;
    const accountId = c.provider_connection_id || c.platform_account_id || c.id;
    const newest = snapshots.filter(s => s.client_id === c.client_id && s.platform === c.platform
      && s.provider_account_id === accountId && s.period_key === "current_30d")
      .reduce((latest,s) => Math.max(latest, Date.parse(s.synced_at) || 0),0);
    return !newest || now-newest > 48*60*60*1000 || newest > now+5*60*1000;
  });
  return affected.length
    ? { state: "warn" as const, note: `${affected.length} of ${expected.length} connected organic accounts have missing/stale snapshots or connection issues.` }
    : { state: "ok" as const, note: `All ${expected.length} connected organic accounts have snapshots from the last 48 hours.` };
}
