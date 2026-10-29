// Local-only stand-in for @forge/bridge. Runs the real analysis engine on the sample workspace.
import { analyze, simulateAbsence, handoverPlan } from '../../../../src/engine/analyze.js';
import { sampleIssues, SAMPLE_PROJECT } from '../../../../src/engine/sample.js';

const params = new URLSearchParams(location.search);
const moduleKey = params.get('panel') ? 'keystone-issue-panel' : 'keystone-home';
let availability = {};
const result = () => ({ ...analyze(sampleIssues(), { availability }), projectKey: 'SAMPLE', sample: true, cachedAt: Date.now() });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const handlers = {
  bootstrap: () => ({ projects: [SAMPLE_PROJECT, { key: 'PAY', name: 'Payments Platform' }], settings: { defaultProject: null }, accountId: 's-lena', extension: {} }),
  analysis: () => result(),
  setDefaultProject: ({ projectKey }) => ({ defaultProject: projectKey }),
  setAvailability: ({ accountId, status, until, from }) => { if (status === 'available') delete availability[accountId]; else availability[accountId] = { status, until, from }; return availability; },
  simulate: ({ accountIds }) => simulateAbsence(result(), accountIds),
  handover: ({ accountId }) => handoverPlan(result(), accountId),
  createHandoverTasks: () => { throw new Error('Handover tasks can only be created in a real Jira project, not the sample workspace'); },
  issueContext: () => { const r = result(); const a = r.areas.find((x) => x.name === 'Payments Ledger'); return { issue: { key: 'PAY-104', summary: 'Fix settlement batch' }, areas: [a], people: a.holders.slice(0, 2), warning: null, generatedAt: r.generatedAt }; },
};

export const invoke = async (name, payload = {}) => {
  await delay(250);
  try { return { ok: true, data: handlers[name](payload) }; } catch (e) { return { ok: false, error: e.message }; }
};
export const view = { getContext: async () => ({ moduleKey, extension: { type: params.get('panel') ? 'jira:issuePanel' : 'jira:globalPage', issue: { key: 'PAY-104' }, project: { key: 'SAMPLE' } } }), theme: { enable: async () => {} } };
export const router = { open: (u) => console.log('open', u), navigate: (u) => console.log('navigate', u) };
