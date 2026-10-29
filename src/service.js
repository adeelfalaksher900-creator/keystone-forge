// Shared application logic for the Custom UI resolvers and the Rovo/MCP actions.
import { kvs } from '@forge/kvs';
import { analyze, simulateAbsence, handoverPlan, findExperts, areasOf } from './engine/analyze.js';
import { sampleIssues, SAMPLE_PROJECT } from './engine/sample.js';
import * as jira from './jira/fetch.js';

const CACHE_MS = 6 * 3600 * 1000;
const SAMPLE = SAMPLE_PROJECT.key;
const STATUSES = ['available', 'leave', 'leaving'];

export const isSample = (projectKey) => projectKey === SAMPLE;

export async function getSettings() {
  return (await kvs.get('settings')) || { defaultProject: null };
}

export async function setDefaultProject(projectKey) {
  if (!isSample(projectKey)) await jira.assertCanBrowse(projectKey);
  const settings = { ...(await getSettings()), defaultProject: projectKey };
  await kvs.set('settings', settings);
  return settings;
}

export async function getAvailability() {
  return (await kvs.get('availability')) || {};
}

// Users may set their own availability; Jira admins may set anyone's. Sample people are open to all.
export async function setAvailability(callerId, { accountId, status, from, until, note }) {
  if (!STATUSES.includes(status)) throw new Error('Unknown availability status');
  if (!accountId?.startsWith('s-') && accountId !== callerId && !(await jira.isSiteAdmin())) {
    throw new Error('Only Jira admins can change availability for other people');
  }
  const availability = await getAvailability();
  if (status === 'available') delete availability[accountId];
  else availability[accountId] = { status, from: from || null, until: until || null, note: String(note || '').slice(0, 140), setBy: callerId, setAt: new Date().toISOString() };
  await kvs.set('availability', availability);
  return availability;
}

function trim(result) {
  // Keep the snapshot under the KVS value size limit.
  return { ...result, areas: result.areas.slice(0, 60).map((a) => ({ ...a, openIssues: a.openIssues.slice(0, 15) })) };
}

// Availability is applied at read time, so we cache normalized issues per project in chunks.
async function loadIssues(projectKey, refresh) {
  if (isSample(projectKey)) return { issues: sampleIssues(), cachedAt: Date.now() };
  await jira.assertCanBrowse(projectKey); // also guards cached data against users without access
  const meta = await kvs.get(`issues:${projectKey}:meta`);
  if (!refresh && meta && Date.now() - meta.cachedAt < CACHE_MS) {
    const chunks = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => kvs.get(`issues:${projectKey}:${i}`)));
    if (chunks.every(Boolean)) return { issues: chunks.flat(), cachedAt: meta.cachedAt };
  }
  const issues = await jira.fetchProjectIssues(projectKey);
  const slim = issues.map((i) => ({ ...i, comments: i.comments.slice(-12), transitions: i.transitions.slice(-6) }));
  const chunks = [];
  for (let i = 0; i < slim.length; i += 50) chunks.push(slim.slice(i, i + 50));
  await Promise.all(chunks.map((c, i) => kvs.set(`issues:${projectKey}:${i}`, c)));
  const cachedAt = Date.now();
  await kvs.set(`issues:${projectKey}:meta`, { cachedAt, chunks: chunks.length, count: slim.length });
  return { issues: slim, cachedAt };
}

export async function getAnalysis(projectKey, { refresh = false } = {}) {
  const [{ issues, cachedAt }, availability] = await Promise.all([loadIssues(projectKey, refresh), getAvailability()]);
  const result = trim(analyze(issues, { availability }));
  return { ...result, projectKey, sample: isSample(projectKey), cachedAt, truncated: issues.length >= jira.MAX_ISSUES };
}

export async function resolveProject(explicit, context) {
  const key = String(explicit || context?.jira?.projectKey || '').trim().toUpperCase();
  if (key) return key;
  return (await getSettings()).defaultProject || SAMPLE;
}

export function matchPerson(result, nameOrId) {
  const q = String(nameOrId || '').trim().toLowerCase();
  if (!q) return null;
  return result.people.find((p) => p.accountId.toLowerCase() === q)
    || result.people.find((p) => p.displayName.toLowerCase() === q)
    || result.people.find((p) => p.displayName.toLowerCase().includes(q))
    || result.people.find((p) => q.split(/\s+/).some((w) => w.length > 2 && p.displayName.toLowerCase().includes(w)))
    || null;
}

export async function issueContext(issueKey, projectKey) {
  const result = await getAnalysis(projectKey);
  const issue = await jira.getIssue(issueKey);
  const ids = new Set(areasOf(issue).map((a) => a.id));
  const areas = result.areas.filter((a) => ids.has(a.id));
  const onIssue = [issue.assignee, issue.reporter, ...issue.comments.map((c) => c.author)].filter(Boolean);
  const people = [...new Map(onIssue.map((p) => [p.accountId, p])).values()];
  const holdersAway = areas.flatMap((a) => a.holders.slice(0, a.busFactor)).filter((h) => h.away);
  return { issue: { key: issue.key, summary: issue.summary }, areas, people, warning: holdersAway.length ? `${holdersAway.map((h) => h.displayName).join(', ')} ${holdersAway.length > 1 ? 'are' : 'is'} away — line up a backup before this work starts.` : null, generatedAt: result.generatedAt };
}

export { simulateAbsence, handoverPlan, findExperts };

// Create one Jira task per handed-over area, assigned to the suggested successor when possible.
export async function createHandoverTasks(projectKey, accountId) {
  if (isSample(projectKey)) throw new Error('Handover tasks can only be created in a real Jira project, not the sample workspace');
  const plan = handoverPlan(await getAnalysis(projectKey), accountId);
  if (!plan?.items.length) return [];
  const types = await jira.issueTypes(projectKey);
  const type = types.find((t) => /^task$/i.test(t.name) && !t.subtask) || types.find((t) => !t.subtask);
  if (!type) throw new Error('No standard issue type available in this project');
  const doc = (lines) => ({ type: 'doc', version: 1, content: lines.map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) });
  const created = [];
  for (const item of plan.items.slice(0, 10)) {
    const successor = item.successors[0];
    const fields = {
      project: { key: projectKey },
      issuetype: { id: type.id },
      summary: `Knowledge handover: ${item.area} (${plan.person.displayName} → ${successor?.displayName || 'new owner needed'})`.slice(0, 250),
      labels: ['keystone-handover'],
      description: doc([
        `Created by Keystone. ${plan.person.displayName} holds ${Math.round(item.share * 100)}% of the recorded context for "${item.area}" (risk: ${item.riskLevel}).`,
        item.transferIssues.length ? `Open work to transfer: ${item.transferIssues.map((i) => i.key).join(', ')}` : 'No open work assigned to transfer.',
        item.readingList.length ? `Read first: ${item.readingList.map((i) => `${i.key} ${i.summary}`).join('; ')}` : '',
        'Suggested: a 30-minute walkthrough, then the successor drives the next change in this area with the current holder reviewing.',
      ]),
    };
    if (successor) fields.assignee = { accountId: successor.accountId };
    try {
      created.push(await jira.createIssue(fields));
    } catch (e) {
      if (!successor) throw e;
      delete fields.assignee; // successor may not be assignable in this project
      created.push(await jira.createIssue(fields));
    }
  }
  return created.map((c) => c.key);
}
