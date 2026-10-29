// Deterministic SAMPLE workspace (fictional team) so judges can explore Keystone on an empty site.
// Always labelled "Sample data" in the UI and in Rovo/MCP answers.

const PEOPLE = [
  ['s-maya', 'Maya Chen'], ['s-omar', 'Omar Haddad'], ['s-lena', 'Lena Fischer'], ['s-raj', 'Raj Patel'],
  ['s-sofia', 'Sofia Alvarez'], ['s-kenji', 'Kenji Watanabe'], ['s-amara', 'Amara Okafor'], ['s-tom', 'Tom Becker'],
].map(([accountId, displayName]) => ({ accountId, displayName, avatarUrl: null }));

// [component, primary holders with weights, issue count, open ratio, topics]
const AREAS = [
  ['Payments Ledger', { 's-maya': 0.82, 's-raj': 0.18 }, 34, 0.3, ['ledger reconciliation', 'double-entry posting', 'settlement batch', 'idempotency keys', 'currency rounding']],
  ['Fraud Rules Engine', { 's-omar': 0.9, 's-tom': 0.1 }, 26, 0.35, ['velocity rule', 'chargeback signal', 'rule DSL parser', 'false positive tuning']],
  ['Checkout API', { 's-lena': 0.35, 's-raj': 0.3, 's-sofia': 0.2, 's-tom': 0.15 }, 40, 0.25, ['rate limiting', 'checkout session', 'webhook retries', 'API versioning', 'p95 latency']],
  ['Mobile SDK', { 's-kenji': 0.55, 's-amara': 0.45 }, 28, 0.3, ['iOS 3DS flow', 'Android crash', 'SDK size', 'Apple Pay sheet']],
  ['Payouts', { 's-maya': 0.6, 's-sofia': 0.4 }, 22, 0.2, ['payout schedule', 'bank file format', 'failed payout retry']],
  ['Observability', { 's-tom': 0.5, 's-lena': 0.3, 's-omar': 0.2 }, 18, 0.15, ['alert routing', 'tracing spans', 'SLO dashboard']],
  ['Merchant Onboarding', { 's-sofia': 0.4, 's-amara': 0.35, 's-raj': 0.25 }, 24, 0.25, ['KYC document upload', 'risk review queue', 'onboarding email']],
  ['Tax Engine', { 's-raj': 0.95, 's-maya': 0.05 }, 15, 0.4, ['VAT calculation', 'tax jurisdiction lookup', 'invoice tax lines']],
  ['Card Vault (PCI)', { 's-omar': 0.7, 's-kenji': 0.3 }, 14, 0.2, ['tokenisation', 'key rotation', 'PCI audit evidence']],
];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function sampleIssues(now = Date.now()) {
  const r = rng(42);
  const byId = Object.fromEntries(PEOPLE.map((p) => [p.accountId, p]));
  const pick = (weights) => {
    let x = r();
    for (const [id, w] of Object.entries(weights)) { if ((x -= w) <= 0) return byId[id]; }
    return byId[Object.keys(weights)[0]];
  };
  const issues = [];
  let n = 100;
  for (const [component, weights, count, openRatio, topics] of AREAS) {
    for (let i = 0; i < count; i++) {
      const open = r() < openRatio;
      const ageDays = Math.floor(r() * 330) + 3;
      const created = now - ageDays * 86400000;
      const assignee = pick(weights);
      const commenters = [assignee, pick(weights), PEOPLE[Math.floor(r() * PEOPLE.length)]];
      issues.push({
        key: `PAY-${n++}`,
        summary: `${['Fix', 'Improve', 'Investigate', 'Add', 'Refactor'][Math.floor(r() * 5)]} ${topics[i % topics.length]}`,
        statusCategory: open ? (r() < 0.5 ? 'indeterminate' : 'new') : 'done',
        components: [component],
        labels: [],
        parent: null,
        assignee,
        reporter: PEOPLE[Math.floor(r() * PEOPLE.length)],
        created,
        updated: created + Math.floor(r() * ageDays) * 86400000,
        resolved: open ? null : created + Math.floor(r() * Math.min(ageDays, 20)) * 86400000,
        comments: commenters.map((author, j) => ({ author, created: created + j * 86400000 })),
        transitions: open ? [] : [{ author: assignee, created: created + 86400000 }],
      });
    }
  }
  return issues;
}

export const SAMPLE_PROJECT = { key: 'SAMPLE', name: 'Northwind Payments (sample data)', sample: true };
export const SAMPLE_PEOPLE = PEOPLE;
