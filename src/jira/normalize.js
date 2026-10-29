// Map a Jira Cloud REST v3 issue (with changelog + comment fields) to the engine's shape.
const ts = (s) => (s ? Date.parse(s) : null);
const person = (u) => (u?.accountId ? { accountId: u.accountId, displayName: u.displayName || 'Unknown', avatarUrl: u.avatarUrls?.['48x48'] || null } : null);

export function normalizeIssue(raw) {
  const f = raw.fields || {};
  return {
    key: raw.key,
    summary: f.summary || '',
    statusCategory: f.status?.statusCategory?.key || 'new',
    components: (f.components || []).map((c) => c.name),
    labels: f.labels || [],
    parent: f.parent ? { key: f.parent.key, summary: f.parent.fields?.summary || f.parent.key } : null,
    assignee: person(f.assignee),
    reporter: person(f.reporter),
    created: ts(f.created),
    updated: ts(f.updated),
    resolved: ts(f.resolutiondate),
    comments: (f.comment?.comments || []).map((c) => ({ author: person(c.author), created: ts(c.created) })).filter((c) => c.author),
    transitions: (raw.changelog?.histories || [])
      .filter((h) => h.items?.some((i) => i.field === 'status'))
      .map((h) => ({ author: person(h.author), created: ts(h.created) }))
      .filter((t) => t.author),
  };
}
