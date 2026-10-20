import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOfficeCriteria, parseOfficeQa } from '../src/lib/office-acceptance.ts';

test('acceptance checks are bounded and canonical before they become part of a saved job', () => {
  assert.deepEqual(normalizeOfficeCriteria(['  Use only approved sources  ', 'Flag unknown details']), ['Use only approved sources', 'Flag unknown details']);
  assert.throws(() => normalizeOfficeCriteria(['Use approved sources', 'use approved sources']), /unique/);
  assert.throws(() => normalizeOfficeCriteria(['x'.repeat(181)]), /180/);
  assert.throws(() => normalizeOfficeCriteria(Array(6).fill('x')), /five/);
});

test('independent QA cannot pass a checked draft without complete ordered evidence', () => {
  const criteria = ['Source every factual claim', 'Include a call to action'];
  const valid = JSON.stringify({ pass: true, issues: [], checks: [
    { index: 1, pass: true, evidence: 'Draft cites approved source A.' },
    { index: 2, pass: true, evidence: 'The final line invites an enquiry.' },
  ] });
  assert.equal(parseOfficeQa(valid, criteria).pass, true);
  assert.equal(parseOfficeQa(JSON.stringify({ pass: true, issues: [] }), criteria).pass, false);
  assert.equal(parseOfficeQa(JSON.stringify({ pass: true, issues: [], checks: [{ index: 2, pass: true, evidence: 'yes' }, { index: 1, pass: true, evidence: 'yes' }] }), criteria).pass, false);
  assert.equal(parseOfficeQa(JSON.stringify({ pass: true, issues: [], checks: [{ index: 1, pass: true, evidence: '' }, { index: 2, pass: true, evidence: 'yes' }] }), criteria).pass, false);
  const failed = parseOfficeQa(JSON.stringify({ pass: true, issues: [], checks: [{ index: 1, pass: false, evidence: 'No source citation.' }, { index: 2, pass: true, evidence: 'CTA present.' }] }), criteria);
  assert.equal(failed.pass, false);
  assert.match(failed.issues.join(' '), /No source citation/);
});
