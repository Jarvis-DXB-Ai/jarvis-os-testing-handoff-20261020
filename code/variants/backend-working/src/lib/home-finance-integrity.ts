/** Home totals must not mix a future revenue forecast with recorded profit. */
export function homeFinanceTotals(
  future: boolean,
  recorded: { revenueEur: number | null; expensesEur: number | null; profitEur: number | null },
  projection: { committedEur: number; weightedPipelineEur: number | null } | null,
) {
  if (!future) return recorded;
  return {
    revenueEur: projection?.weightedPipelineEur != null
      ? projection.committedEur + projection.weightedPipelineEur : null,
    // The current model has no independently validated forecast-cost series.
    expensesEur: null,
    profitEur: null,
  };
}

/** Never join finance allocations by mutable display names or guess a tenant. */
export function allocatedRevenueByClient(
  rows: Array<{ clientId?: string | null; amount: number | null }>,
) {
  const totals = new Map<string, number | null>();
  for (const row of rows) {
    if (!row.clientId) continue;
    const prior = totals.get(row.clientId) ?? (totals.has(row.clientId) ? null : 0);
    totals.set(row.clientId, prior === null || row.amount === null || !Number.isFinite(row.amount)
      ? null : prior + row.amount);
  }
  return totals;
}
