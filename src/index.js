import * as ResolverModule from '@forge/resolver';

// ESM/CJS interop: the bundler exposes the class on .default (possibly nested).
const Resolver = ResolverModule.default?.default || ResolverModule.default;
import * as svc from './service.js';
import { listProjects } from './jira/fetch.js';
import { SAMPLE_PROJECT } from './engine/sample.js';

// ---------- Custom UI resolvers ----------
const resolver = new Resolver();
const wrap = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req.payload || {}, req.context) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e.message || 'Something went wrong', status: e.status || 500 };
  }
};

resolver.define('bootstrap', wrap(async (_p, ctx) => {
  const [projects, settings] = await Promise.all([listProjects().catch(() => []), svc.getSettings()]);
  return { projects: [SAMPLE_PROJECT, ...projects], settings, accountId: ctx.accountId, extension: ctx.extension };
}));
resolver.define('analysis', wrap(({ projectKey, refresh }) => svc.getAnalysis(projectKey, { refresh })));
resolver.define('setDefaultProject', wrap(({ projectKey }) => svc.setDefaultProject(projectKey)));
resolver.define('setAvailability', wrap((p, ctx) => svc.setAvailability(ctx.accountId, p)));
resolver.define('simulate', wrap(async ({ projectKey, accountIds }) => svc.simulateAbsence(await svc.getAnalysis(projectKey), accountIds || [])));
resolver.define('handover', wrap(async ({ projectKey, accountId }) => svc.handoverPlan(await svc.getAnalysis(projectKey), accountId)));
resolver.define('createHandoverTasks', wrap(({ projectKey, accountId }) => svc.createHandoverTasks(projectKey, accountId)));
resolver.define('issueContext', wrap(({ issueKey, projectKey }) => svc.issueContext(issueKey, projectKey)));

export const handler = resolver.getDefinitions();

// ---------- Rovo agent actions (also exposed as MCP tools) ----------
const pct = (x) => `${Math.round(x * 100)}%`;
const note = (r) => (r.sample ? 'Note: this is the SAMPLE workspace (fictional team), not real Jira data.' : `Based on ${r.issueCount} Jira work items in ${r.projectKey}.`);
const safe = (fn) => async (payload, context) => {
  try {
    return await fn(payload || {}, context);
  } catch (e) {
    console.error(e);
    return { error: e.status === 403 || e.status === 404 ? 'You do not have access to that project, or it does not exist.' : e.message };
  }
};

export const riskReport = safe(async (payload) => {
  const projectKey = await svc.resolveProject(payload.projectKey, payload.context);
  const r = await svc.getAnalysis(projectKey);
  return {
    note: note(r),
    project: projectKey,
    summary: r.summary,
    riskiestAreas: r.areas.slice(0, 5).map((a) => ({ area: a.name, risk: `${a.risk.level} (${a.risk.score}/100)`, busFactor: a.busFactor, openWork: a.openCount, mainHolders: a.holders.slice(0, 2).map((h) => `${h.displayName} ${pct(h.share)}${h.away ? ' (away)' : ''}`), why: a.risk.reasons })),
    keystonePeople: r.people.slice(0, 3).map((p) => ({ name: p.displayName, keystoneIndex: p.keystoneIndex, soleKeeperOf: p.soleKeeperOf, away: p.away })),
  };
});

export const findExperts = safe(async (payload) => {
  const projectKey = await svc.resolveProject(payload.projectKey, payload.context);
  const r = await svc.getAnalysis(projectKey);
  const matches = svc.findExperts(r, payload.topic);
  return { note: note(r), topic: payload.topic, matches, hint: matches.length ? undefined : `No area matched. Known areas: ${r.areas.map((a) => a.name).join(', ')}` };
});

export const simulateAbsence = safe(async (payload) => {
  const projectKey = await svc.resolveProject(payload.projectKey, payload.context);
  const r = await svc.getAnalysis(projectKey);
  const person = svc.matchPerson(r, payload.person);
  if (!person) return { error: `No contributor matched "${payload.person}".`, people: r.people.map((p) => p.displayName) };
  const impact = svc.simulateAbsence(r, [person.accountId]);
  return { note: note(r), person: person.displayName, orphanedAreas: impact.filter((i) => i.orphaned).map((i) => i.name), weakenedAreas: impact.filter((i) => !i.orphaned).map((i) => ({ area: i.name, contextLost: pct(i.lostShare), nextBest: i.nextBest?.displayName || null })), openWorkAffected: impact.reduce((s, i) => s + i.openCount, 0) };
});

export const handoverPlan = safe(async (payload) => {
  const projectKey = await svc.resolveProject(payload.projectKey, payload.context);
  const r = await svc.getAnalysis(projectKey);
  const person = svc.matchPerson(r, payload.person);
  if (!person) return { error: `No contributor matched "${payload.person}".`, people: r.people.map((p) => p.displayName) };
  const plan = svc.handoverPlan(r, person.accountId);
  return { note: note(r), person: person.displayName, areas: plan.items.map((i) => ({ area: i.area, theirShare: pct(i.share), risk: i.riskLevel, successor: i.successors[0]?.displayName || 'nobody yet: pick a new owner', transferIssues: i.transferIssues.map((t) => `${t.key} ${t.summary}`), readFirst: i.readingList.map((t) => `${t.key} ${t.summary}`) })) };
});

export const issueContextHolders = safe(async (payload) => {
  const issueKey = String(payload.issueKey || payload.context?.jira?.issueKey || '').toUpperCase();
  if (!issueKey) return { error: 'Tell me which work item, for example PAY-123.' };
  const projectKey = issueKey.split('-')[0];
  const ctx = await svc.issueContext(issueKey, projectKey);
  return { issue: ctx.issue, warning: ctx.warning, areas: ctx.areas.map((a) => ({ area: a.name, busFactor: a.busFactor, risk: a.risk.level, holders: a.holders.slice(0, 3).map((h) => `${h.displayName} ${pct(h.share)}${h.away ? ' (away)' : ''}`) })), peopleOnThisIssue: ctx.people.map((p) => p.displayName) };
});
