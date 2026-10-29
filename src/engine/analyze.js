// Keystone analysis engine: pure functions, no Forge imports, so it is unit-testable.
// Input: normalized issues. Output: knowledge areas, people, bus factor and risk.

const DAY = 86400000;
export const HALF_LIFE_DAYS = 180;
const COMMENT_CAP = 3;

export const WEIGHTS = {
  resolvedAssignee: 3,
  openAssignee: 1.5,
  comment: 0.5,
  transition: 0.5,
  reporter: 0.5,
};

const decay = (ts, now) => {
  if (!ts) return 1;
  const ageDays = Math.max(0, (now - ts) / DAY);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
};

// An issue belongs to its components; if none, to its parent epic; if none, to its first label.
export function areasOf(issue) {
  if (issue.components?.length) return issue.components.map((c) => ({ id: `component:${c}`, name: c, kind: 'component' }));
  if (issue.parent) return [{ id: `epic:${issue.parent.key}`, name: issue.parent.summary || issue.parent.key, kind: 'epic' }];
  if (issue.labels?.length) return [{ id: `label:${issue.labels[0]}`, name: issue.labels[0], kind: 'label' }];
  return [{ id: 'unsorted', name: 'Uncategorised work', kind: 'other' }];
}

// Who contributed to one issue, and how much, before time decay.
export function contributions(issue, now = Date.now()) {
  const out = [];
  const add = (person, weight, ts) => {
    if (!person?.accountId || weight <= 0) return;
    out.push({ person, weight: weight * decay(ts, now), ts: ts || 0 });
  };
  const done = issue.statusCategory === 'done';
  if (issue.assignee) add(issue.assignee, done ? WEIGHTS.resolvedAssignee : WEIGHTS.openAssignee, issue.resolved || issue.updated);
  add(issue.reporter, WEIGHTS.reporter, issue.created);
  const perCommenter = new Map();
  for (const c of issue.comments || []) {
    const n = perCommenter.get(c.author?.accountId) || 0;
    if (n >= COMMENT_CAP) continue;
    perCommenter.set(c.author?.accountId, n + 1);
    add(c.author, WEIGHTS.comment, c.created);
  }
  for (const t of issue.transitions || []) add(t.author, WEIGHTS.transition, t.created);
  return out;
}

// Truck factor: fewest people whose combined share covers at least half the knowledge.
export function busFactor(shares) {
  const sorted = [...shares].sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i];
    if (sum >= 0.5 - 1e-9) return i + 1;
  }
  return sorted.length;
}

const isAway = (availability, accountId, now) => {
  const a = availability?.[accountId];
  if (!a || a.status === 'available') return false;
  if (a.status === 'leaving') return !a.from || Date.parse(a.from) <= now + 30 * DAY; // leaving within 30 days
  if (a.status === 'leave') return !a.until || Date.parse(a.until) >= now;
  return false;
};

export function riskOf({ topShare, bus, openCount, topHolderIdleDays, holdersAway, activeHolders }) {
  const reasons = [];
  let score = topShare * 45; // concentration
  if (bus === 1) { score += 20; reasons.push('One person holds most of the context'); }
  if (openCount > 0) score += Math.min(15, openCount * 2);
  if (topHolderIdleDays > 90) { score += 10; reasons.push(`Main context holder inactive here for ${Math.round(topHolderIdleDays)} days`); }
  if (holdersAway > 0) { score += activeHolders === 0 ? 25 : 12; reasons.push(activeHolders === 0 ? 'Every context holder is away or leaving' : 'A key context holder is away or leaving'); }
  if (topShare >= 0.7) reasons.push(`Top holder owns ${Math.round(topShare * 100)}% of the knowledge`);
  if (openCount > 0 && bus === 1) reasons.push(`${openCount} open work item${openCount > 1 ? 's' : ''} depend on that person`);
  score = Math.round(Math.min(100, score));
  const level = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, level, reasons };
}

export function analyze(issues, { now = Date.now(), availability = {} } = {}) {
  const areas = new Map();
  const people = new Map();

  for (const issue of issues) {
    const contribs = contributions(issue, now);
    for (const area of areasOf(issue)) {
      if (!areas.has(area.id)) areas.set(area.id, { ...area, issues: [], weights: new Map(), lastActive: new Map() });
      const a = areas.get(area.id);
      a.issues.push(issue);
      for (const { person, weight, ts } of contribs) {
        a.weights.set(person.accountId, (a.weights.get(person.accountId) || 0) + weight);
        a.lastActive.set(person.accountId, Math.max(a.lastActive.get(person.accountId) || 0, ts));
        if (!people.has(person.accountId)) people.set(person.accountId, { ...person });
      }
    }
  }

  const areaList = [];
  for (const a of areas.values()) {
    const total = [...a.weights.values()].reduce((s, w) => s + w, 0);
    if (total === 0) continue;
    const holders = [...a.weights.entries()]
      .map(([accountId, w]) => ({
        accountId,
        displayName: people.get(accountId)?.displayName || 'Unknown',
        avatarUrl: people.get(accountId)?.avatarUrl || null,
        share: w / total,
        lastActive: a.lastActive.get(accountId) || null,
        away: isAway(availability, accountId, now),
      }))
      .sort((x, y) => y.share - x.share);
    const bus = busFactor(holders.map((h) => h.share));
    const keyHolders = holders.slice(0, Math.max(bus, 1));
    const open = a.issues.filter((i) => i.statusCategory !== 'done');
    const top = holders[0];
    const risk = riskOf({
      topShare: top.share,
      bus,
      openCount: open.length,
      topHolderIdleDays: top.lastActive ? (now - top.lastActive) / DAY : 0,
      holdersAway: keyHolders.filter((h) => h.away).length,
      activeHolders: holders.filter((h) => !h.away && h.share >= 0.1).length,
    });
    areaList.push({
      id: a.id,
      name: a.name,
      kind: a.kind,
      issueCount: a.issues.length,
      openCount: open.length,
      busFactor: bus,
      risk,
      holders: holders.slice(0, 6),
      openIssues: open.slice(0, 25).map(({ key, summary, assignee }) => ({ key, summary, assignee: assignee?.displayName || null, assigneeId: assignee?.accountId || null })),
      recentIssues: a.issues
        .filter((i) => i.statusCategory === 'done')
        .sort((x, y) => (y.resolved || 0) - (x.resolved || 0))
        .slice(0, 5)
        .map(({ key, summary }) => ({ key, summary })),
    });
  }
  areaList.sort((x, y) => y.risk.score - x.risk.score);

  const peopleList = [...people.values()].map((p) => {
    const held = areaList
      .map((a) => ({ area: a, h: a.holders.find((h) => h.accountId === p.accountId) }))
      .filter(({ h }) => h && h.share >= 0.3);
    const soleKeeper = held.filter(({ area, h }) => area.busFactor === 1 && area.holders[0].accountId === p.accountId && h);
    return {
      accountId: p.accountId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl || null,
      away: isAway(availability, p.accountId, now),
      availability: availability[p.accountId] || null,
      areasHeld: held.map(({ area, h }) => ({ id: area.id, name: area.name, share: h.share, riskLevel: area.risk.level })),
      soleKeeperOf: soleKeeper.length,
      // Keystone index: how much risk would land on the team if this person vanished tomorrow.
      keystoneIndex: Math.round(Math.min(100, held.reduce((s, { area, h }) => s + h.share * area.risk.score * (area.openCount > 0 ? 1 : 0.6), 0) / 2)),
    };
  }).sort((x, y) => y.keystoneIndex - x.keystoneIndex);

  const atRisk = areaList.filter((a) => a.risk.level === 'critical' || a.risk.level === 'high');
  const openTotal = areaList.reduce((s, a) => s + a.openCount, 0);
  const openSingle = areaList.filter((a) => a.busFactor === 1).reduce((s, a) => s + a.openCount, 0);

  return {
    generatedAt: now,
    issueCount: issues.length,
    summary: {
      areas: areaList.length,
      areasAtRisk: atRisk.length,
      soloAreas: areaList.filter((a) => a.busFactor === 1).length,
      openWorkSingleHolderPct: openTotal ? Math.round((openSingle / openTotal) * 100) : 0,
      teamBusFactor: teamBusFactor(areaList),
      people: peopleList.length,
    },
    areas: areaList,
    people: peopleList,
  };
}

// Team-level truck factor: how many people you can remove (most critical first)
// before more than half of all areas lose every key holder (>=20% share).
export function teamBusFactor(areaList) {
  if (!areaList.length) return 0;
  const holderSets = areaList.map((a) => new Set(a.holders.filter((h) => h.share >= 0.2).map((h) => h.accountId)));
  const removed = new Set();
  const everyone = new Set(holderSets.flatMap((s) => [...s]));
  let count = 0;
  while (removed.size < everyone.size) {
    const orphaned = holderSets.filter((s) => [...s].every((id) => removed.has(id))).length;
    if (orphaned > areaList.length / 2) return count;
    // Greedy: remove the person covering the most still-covered areas.
    let best = null, bestN = -1;
    for (const id of everyone) {
      if (removed.has(id)) continue;
      const n = holderSets.filter((s) => s.has(id)).length;
      if (n > bestN) { best = id; bestN = n; }
    }
    removed.add(best);
    count++;
  }
  return count;
}

// What-if: which areas lose all meaningful context if these people are unavailable.
export function simulateAbsence(result, accountIds) {
  const gone = new Set(accountIds);
  return result.areas
    .map((a) => {
      const meaningful = a.holders.filter((h) => h.share >= 0.1);
      const lost = meaningful.filter((h) => gone.has(h.accountId)).reduce((s, h) => s + h.share, 0);
      const remaining = a.holders.filter((h) => !gone.has(h.accountId));
      return { id: a.id, name: a.name, lostShare: lost, orphaned: meaningful.length > 0 && meaningful.every((h) => gone.has(h.accountId)), openCount: a.openCount, nextBest: remaining[0] || null };
    })
    .filter((x) => x.lostShare >= 0.3)
    .sort((x, y) => Number(y.orphaned) - Number(x.orphaned) || y.lostShare - x.lostShare);
}

// Handover plan for one person: per area they hold, who should take over and what to read.
export function handoverPlan(result, accountId) {
  const person = result.people.find((p) => p.accountId === accountId);
  if (!person) return null;
  const items = result.areas
    .map((a) => ({ a, h: a.holders.find((h) => h.accountId === accountId) }))
    .filter(({ h }) => h && h.share >= 0.2)
    .sort((x, y) => y.h.share * y.a.risk.score - x.h.share * x.a.risk.score)
    .map(({ a, h }) => {
      const successors = a.holders.filter((x) => x.accountId !== accountId && !x.away && x.share >= 0.05).slice(0, 2);
      return {
        areaId: a.id,
        area: a.name,
        share: h.share,
        riskLevel: a.risk.level,
        successors: successors.map((s) => ({ accountId: s.accountId, displayName: s.displayName, share: s.share })),
        needsNewOwner: successors.length === 0 || successors[0].share < 0.1,
        transferIssues: a.openIssues.filter((i) => i.assigneeId === accountId),
        readingList: a.recentIssues,
      };
    });
  return { person: { accountId, displayName: person.displayName }, generatedAt: result.generatedAt, items };
}

// Plain keyword match of a topic against area names and issue summaries.
export function findExperts(result, topic) {
  const words = String(topic || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return result.areas
    .map((a) => {
      const hay = [a.name, ...a.openIssues.map((i) => i.summary), ...a.recentIssues.map((i) => i.summary)].join(' ').toLowerCase();
      const score = words.reduce((s, w) => s + (a.name.toLowerCase().includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map(({ a }) => ({ area: a.name, busFactor: a.busFactor, riskLevel: a.risk.level, experts: a.holders.slice(0, 3).map((h) => ({ displayName: h.displayName, share: Math.round(h.share * 100), away: h.away })) }));
}
