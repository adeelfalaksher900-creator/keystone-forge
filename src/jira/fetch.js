import { asUser, route } from '@forge/api';
import { normalizeIssue } from './normalize.js';

const FIELDS = 'summary,status,components,labels,parent,assignee,reporter,created,updated,resolutiondate,comment';
export const MAX_ISSUES = 300; // shortcut: newest 300 (25s resolver limit) issues of the last year; page through a scheduled job if teams need more

async function asJson(res, what) {
  if (!res.ok) {
    const err = new Error(`${what} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function listProjects() {
  const res = await asUser().requestJira(route`/rest/api/3/project/search?maxResults=50&orderBy=name`);
  const body = await asJson(res, 'Loading projects');
  return body.values.map((p) => ({ key: p.key, name: p.name, avatarUrl: p.avatarUrls?.['48x48'] || null }));
}

// Throws 403/404 when the current user cannot browse the project; used before serving cached snapshots.
export async function assertCanBrowse(projectKey) {
  const res = await asUser().requestJira(route`/rest/api/3/project/${projectKey}`);
  await asJson(res, `Opening project ${projectKey}`);
}

export async function fetchProjectIssues(projectKey) {
  const jql = `project = "${projectKey.replace(/"/g, '')}" AND updated >= -365d AND (labels IS EMPTY OR labels != keystone-handover) ORDER BY updated DESC`;
  const issues = [];
  let nextPageToken;
  do {
    const params = new URLSearchParams({ jql, fields: FIELDS, expand: 'changelog', maxResults: '100' });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    const res = await asUser().requestJira(route`/rest/api/3/search/jql?${params}`);
    const body = await asJson(res, 'Searching issues');
    issues.push(...body.issues.map(normalizeIssue));
    nextPageToken = body.nextPageToken;
  } while (nextPageToken && issues.length < MAX_ISSUES);
  return issues;
}

export async function getIssue(issueKey) {
  const params = new URLSearchParams({ fields: FIELDS, expand: 'changelog' });
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}?${params}`);
  return normalizeIssue(await asJson(res, `Loading ${issueKey}`));
}

export async function isSiteAdmin() {
  const res = await asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  const body = await asJson(res, 'Checking permissions');
  return Boolean(body.permissions?.ADMINISTER?.havePermission);
}

export async function createIssue(fields) {
  const res = await asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return asJson(res, 'Creating handover task');
}

export async function issueTypes(projectKey) {
  const res = await asUser().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const body = await asJson(res, 'Loading issue types');
  return body.issueTypes || body.values || [];
}
