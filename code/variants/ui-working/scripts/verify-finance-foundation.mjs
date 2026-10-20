import assert from 'node:assert/strict'

const response = await fetch('http://localhost:3000/api/finance')
assert.equal(response.ok, true, `Finance API returned ${response.status}`)
const snapshot = await response.json()
const subscriptions = new Map(snapshot.subscriptions.map((row) => [row.vendor, row]))

assert.equal(snapshot.settings.source_currency, 'AED')
assert.equal(snapshot.settings.display_currency, 'aed')
assert.equal(snapshot.fxRates.some((rate) => rate.base_currency === 'USD' && rate.quote_currency === 'AED' && rate.rate === 3.6725), true)
assert.equal(snapshot.fxRates.some((rate) => rate.base_currency === 'USD' && rate.quote_currency === 'EUR' && rate.rate > 0), true)

const zernio = subscriptions.get('Zernio')
assert.deepEqual({ currency: zernio.currency, amount: zernio.amount, billingDay: zernio.billing_day, renewal: zernio.next_renewal_date }, { currency: 'USD', amount: 6, billingDay: 1, renewal: '2026-09-01' })
const chatgpt = subscriptions.get('ChatGPT Pro')
assert.deepEqual({ currency: chatgpt.currency, amount: chatgpt.amount, known: chatgpt.billing_date_known, renewal: chatgpt.next_renewal_date }, { currency: 'AED', amount: 385, known: false, renewal: null })
const supabase = subscriptions.get('Supabase')
assert.deepEqual({ currency: supabase.currency, amount: supabase.amount, billingDay: supabase.billing_day }, { currency: 'USD', amount: 25, billingDay: 28 })
const higgsfield = subscriptions.get('Higgsfield')
assert.deepEqual({ currency: higgsfield.currency, amount: higgsfield.amount, base: higgsfield.base_amount, discount: higgsfield.discount_percent, temporary: higgsfield.discount_temporary, billingDay: higgsfield.billing_day }, { currency: 'USD', amount: 44.25, base: 59, discount: 25, temporary: true, billingDay: 24 })

assert.equal(snapshot.summary.expectedRevenueAed >= snapshot.summary.collectedRevenueAed, true)
assert.equal(snapshot.summary.availableOwnerDrawAed, Math.round((snapshot.summary.collectedRevenueAed - snapshot.summary.committedBusinessExpensesAed) * 100) / 100)
assert.equal(snapshot.summary.personalNetCashFlowAed, Math.round((snapshot.summary.paidOwnerDrawAed - snapshot.summary.personalExpensesAed) * 100) / 100)
assert.equal(snapshot.summary.unresolvedRevenueCount, 5)
assert.equal(snapshot.summary.unresolvedRevenueAed, snapshot.summary.expectedRevenueAed)
assert.equal(snapshot.summary.invoicedRevenueAed, 0)
assert.equal(snapshot.summary.collectedRevenueAed, 0)
assert.equal(snapshot.summary.paidBusinessExpensesAed, 0)
assert.equal(snapshot.summary.upcomingCommittedObligationsAed, snapshot.summary.totalBusinessCostsAed)
assert.equal(snapshot.summary.expenseBreakdown.some((row) => row.name === 'Recorded AI / API usage' && row.paymentStatus === 'unresolved'), true)
assert.equal(snapshot.summary.revenueReconciliation.every((row) => row.unresolved), true)

console.log('Finance foundation fixture passed: canonical seeds, FX, owner-draw capacity, and personal-finance separation are consistent.')
