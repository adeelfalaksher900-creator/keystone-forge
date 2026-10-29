import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, busFactor, areasOf, simulateAbsence, handoverPlan, findExperts, teamBusFactor } from '../src/engine/analyze.js';
import { sampleIssues } from '../src/engine/sample.js';
import { normalizeIssue } from '../src/jira/normalize.js';

const NOW = Date.parse('2026-10-29T00:00:00Z');
const p = (id) => ({ accountId: id, displayName: id.toUpperCase() });
const issue = (key, component, assignee, extra = {}) => ({
  key, summary: `${component} work ${key}`, statusCategory: 'done', components: [component], labels: [], parent: null,
  assignee: p(assignee), reporter: p(assignee), created: NOW - 10 * 86400000, updated: NOW, resolved: NOW - 86400000,
  comments: [], transitions: [], ...extra,
});

test('busFactor counts fewest people covering half', () => {
  assert.equal(busFactor([0.9, 0.1]), 1);
  assert.equal(busFactor([0.3, 0.3, 0.4]), 2);
  assert.equal(busFactor([0.25, 0.25, 0.25, 0.25]), 2);
  assert.equal(busFactor([]), 0);
});

test('areasOf falls back component -> epic -> label -> unsorted', () => {
  assert.equal(areasOf({ components: ['A'] })[0].id, 'component:A');
  assert.equal(areasOf({ components: [], parent: { key: 'E-1', summary: 'Epic' } })[0].id, 'epic:E-1');
  assert.equal(areasOf({ components: [], labels: ['x'] })[0].id, 'label:x');
  assert.equal(areasOf({})[0].id, 'unsorted');
});

test('single-owner area is critical and the owner is a keystone', () => {
  const issues = [
    ...Array.from({ length: 6 }, (_, i) => issue(`A-${i}`, 'Ledger', 'maya', { statusCategory: i < 3 ? 'new' : 'done' })),
    ...Array.from({ length: 6 }, (_, i) => issue(`B-${i}`, 'API', i % 2 ? 'raj' : 'lena')),
  ];
  const r = analyze(issues, { now: NOW });
  const ledger = r.areas.find((a) => a.name === 'Ledger');
  assert.equal(ledger.busFactor, 1);
  assert.ok(['critical', 'high'].includes(ledger.risk.level));
  assert.equal(r.areas[0].name, 'Ledger', 'riskiest area first');
  assert.equal(r.people[0].accountId, 'maya');
  const api = r.areas.find((a) => a.name === 'API');
  assert.equal(api.busFactor, 1 /* 50/50 split: one person reaches 0.5 */);
});

test('availability raises risk when holder is away', () => {
  const issues = Array.from({ length: 4 }, (_, i) => issue(`A-${i}`, 'Ledger', 'maya', { statusCategory: 'new' }));
  const base = analyze(issues, { now: NOW }).areas[0].risk.score;
  const away = analyze(issues, { now: NOW, availability: { maya: { status: 'leave', until: '2026-12-01' } } }).areas[0];
  assert.ok(away.risk.score > base);
  assert.ok(away.risk.reasons.some((x) => x.includes('away')));
});

test('simulateAbsence orphans areas only that person held', () => {
  const r = analyze(sampleIssues(NOW), { now: NOW });
  const sim = simulateAbsence(r, ['s-omar']);
  assert.ok(sim.some((x) => x.name === 'Fraud Rules Engine' && x.lostShare > 0.5));
  assert.ok(!sim.some((x) => x.name === 'Mobile SDK'));
});

test('handoverPlan lists areas and successors', () => {
  const r = analyze(sampleIssues(NOW), { now: NOW });
  const plan = handoverPlan(r, 's-maya');
  assert.ok(plan.items.length >= 2);
  assert.equal(plan.items[0].area, 'Payments Ledger');
  assert.ok(plan.items.every((i) => i.successors.every((s) => s.accountId !== 's-maya')));
  assert.equal(handoverPlan(r, 'nobody'), null);
});

test('findExperts matches topic words', () => {
  const r = analyze(sampleIssues(NOW), { now: NOW });
  const res = findExperts(r, 'who knows tax VAT?');
  assert.equal(res[0].area, 'Tax Engine');
  assert.equal(res[0].experts[0].displayName, 'Raj Patel');
  assert.deepEqual(findExperts(r, '??'), []);
});

test('sample workspace produces sensible summary', () => {
  const r = analyze(sampleIssues(NOW), { now: NOW });
  assert.equal(r.summary.areas, 9);
  assert.ok(r.summary.soloAreas >= 3);
  assert.ok(r.summary.teamBusFactor >= 1 && r.summary.teamBusFactor <= 8);
  assert.equal(teamBusFactor([]), 0);
});

test('normalizeIssue maps Jira REST shape', () => {
  const raw = {
    key: 'K-1',
    fields: {
      summary: 'S', status: { statusCategory: { key: 'done' } }, components: [{ name: 'C' }], labels: ['l'],
      parent: { key: 'E-1', fields: { summary: 'Epic' } },
      assignee: { accountId: 'a', displayName: 'A', avatarUrls: { '48x48': 'u' } }, reporter: null,
      created: '2026-01-01T00:00:00.000+0000', updated: '2026-01-02T00:00:00.000+0000', resolutiondate: '2026-01-02T00:00:00.000+0000',
      comment: { comments: [{ author: { accountId: 'b', displayName: 'B' }, created: '2026-01-01T10:00:00.000+0000' }] },
    },
    changelog: { histories: [{ author: { accountId: 'a', displayName: 'A' }, created: '2026-01-02T00:00:00.000+0000', items: [{ field: 'status' }] }, { author: { accountId: 'c' }, created: '2026-01-02T00:00:00.000+0000', items: [{ field: 'labels' }] }] },
  };
  const n = normalizeIssue(raw);
  assert.equal(n.statusCategory, 'done');
  assert.deepEqual(n.components, ['C']);
  assert.equal(n.assignee.avatarUrl, 'u');
  assert.equal(n.comments.length, 1);
  assert.equal(n.transitions.length, 1, 'only status changes count');
  assert.equal(n.parent.summary, 'Epic');
});
