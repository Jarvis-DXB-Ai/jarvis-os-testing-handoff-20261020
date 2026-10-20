import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/home-finance-integrity.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { homeFinanceTotals, allocatedRevenueByClient } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const recorded = { revenueEur: 6892.3815, expensesEur: 480.55, profitEur: 6411.8315 };
assert.deepEqual(homeFinanceTotals(false, recorded, null), recorded);
assert.deepEqual(homeFinanceTotals(true, recorded, { committedEur: 1380, weightedPipelineEur: null }), { revenueEur: null, expensesEur: null, profitEur: null });
assert.deepEqual(homeFinanceTotals(true, recorded, { committedEur: 1380, weightedPipelineEur: 750 }), { revenueEur: 2130, expensesEur: null, profitEur: null });
assert.equal(homeFinanceTotals(true, recorded, { committedEur: 1380, weightedPipelineEur: 0 }).revenueEur, 1380);
assert.deepEqual(homeFinanceTotals(true, recorded, null), { revenueEur: null, expensesEur: null, profitEur: null });
const totals = allocatedRevenueByClient([
  { clientId: 'top1', amount: 6000 }, { clientId: 'top1', amount: 2000 },
  { clientId: 'democlientb', amount: 6000 }, { clientId: null, amount: 10000 },
  { clientId: 'unknown-fx', amount: 10 }, { clientId: 'unknown-fx', amount: null },
  { clientId: 'unknown-fx', amount: 20 }, { clientId: 'zero', amount: 0 },
]);
assert.equal(totals.get('top1'), 8000);
assert.equal(totals.get('democlientb'), 6000);
assert.equal(totals.get('unknown-fx'), null);
assert.equal(totals.get('zero'), 0);
assert.equal(totals.size, 4);
assert.equal(allocatedRevenueByClient([{ clientId: 'invalid', amount: NaN }]).get('invalid'), null);
console.log('Home finance integrity: 11 regression assertions passed.');
