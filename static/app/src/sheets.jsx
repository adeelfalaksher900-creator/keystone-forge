import { useEffect, useState } from 'react';
import { router } from '@forge/bridge';
import { Avatar, Icon, Level, Ring, Sheet, Skeleton, ago, call, levelColor, pct } from './ui.jsx';

const openIssue = (key, sample) => { if (!sample) router.open(`/browse/${key}`); };

export function IssueRows({ issues, sample, empty }) {
  if (!issues?.length) return <p className="faint">{empty}</p>;
  return (
    <div>
      {issues.map((i) => (
        <button key={i.key} className="issue-link" onClick={() => openIssue(i.key, sample)} disabled={sample} title={sample ? 'Sample work item' : `Open ${i.key}`}>
          <code>{i.key}</code><span className="grow">{i.summary}</span>{i.assignee && <span className="faint">{i.assignee}</span>}
        </button>
      ))}
    </div>
  );
}

export function Holders({ holders, limit = 6 }) {
  return holders.slice(0, limit).map((h) => (
    <div className="holder" key={h.accountId}>
      <Avatar person={h} size="sm" away={h.away} />
      <span className="ellipsis">{h.displayName}{h.away && <span className="badge" style={{ marginLeft: 8 }}>Away</span>}</span>
      <span className="pct">{pct(h.share)}</span>
      <span />
      <div className="bar"><span style={{ width: pct(h.share), background: h.away ? 'var(--high)' : undefined }} /></div>
    </div>
  ));
}

export function AreaSheet({ area, sample, onClose }) {
  return (
    <Sheet title={area.name} subtitle={`${area.kind === 'component' ? 'Component' : area.kind === 'epic' ? 'Epic' : 'Label'} · ${area.issueCount} work items · ${area.openCount} open`} onClose={onClose}
      leading={<Ring value={area.risk.score} size={52} color={levelColor(area.risk.score)} label={`Risk ${area.risk.score} of 100`} />}>
      <div className="controls"><Level level={area.risk.level} /><span className="badge">Bus factor {area.busFactor}</span></div>
      {area.risk.reasons.length > 0 && (
        <div className="section"><h3>Why it's flagged</h3>
          {area.risk.reasons.map((r) => <div className="reason" key={r}><span className={`lvl lvl-${area.risk.level}`} style={{ paddingTop: 2 }}><Icon.alert /></span><span>{r}</span></div>)}
        </div>
      )}
      <div className="section"><h3>Who holds the context</h3><Holders holders={area.holders} />
        <p className="faint">Share of recorded Jira activity in this area (resolving, working, transitioning and discussing work), weighted toward the last 6 months. Last active: {area.holders[0]?.displayName} {ago(area.holders[0]?.lastActive)}.</p>
      </div>
      <div className="section"><h3>Open work</h3><IssueRows issues={area.openIssues} sample={sample} empty="Nothing open in this area." /></div>
      <div className="section"><h3>Read first</h3><IssueRows issues={area.recentIssues} sample={sample} empty="No resolved work yet." /></div>
    </Sheet>
  );
}

function toMarkdown(plan) {
  const lines = [`# Knowledge handover: ${plan.person.displayName}`, ''];
  for (const i of plan.items) {
    lines.push(`## ${i.area} (${pct(i.share)} of context, ${i.riskLevel} risk)`);
    lines.push(`- Successor: ${i.successors[0]?.displayName || 'new owner needed'}`);
    if (i.transferIssues.length) lines.push(`- Transfer: ${i.transferIssues.map((t) => `${t.key} ${t.summary}`).join('; ')}`);
    if (i.readingList.length) lines.push(`- Read first: ${i.readingList.map((t) => `${t.key} ${t.summary}`).join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function PersonSheet({ person, projectKey, sample, me, onClose, onAvailability, toast }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [status, setStatus] = useState(person.availability?.status || 'available');
  const [date, setDate] = useState(person.availability?.until || person.availability?.from || '');

  useEffect(() => { call('handover', { projectKey, accountId: person.accountId }).then(setPlan, (e) => setErr(e.message)); }, [projectKey, person.accountId]);

  const saveAvailability = async () => {
    setBusy(true);
    try {
      await call('setAvailability', { accountId: person.accountId, status, ...(status === 'leave' ? { until: date } : status === 'leaving' ? { from: date } : {}) });
      toast(status === 'available' ? `${person.displayName} marked available` : `Availability saved for ${person.displayName}`);
      onAvailability();
      call('handover', { projectKey, accountId: person.accountId }).then(setPlan, () => {});
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const createTasks = async () => {
    setBusy(true);
    try {
      const keys = await call('createHandoverTasks', { projectKey, accountId: person.accountId });
      setCreated(keys);
      toast(keys.length ? `Created ${keys.length} handover task${keys.length > 1 ? 's' : ''}: ${keys.join(', ')}` : 'Nothing to hand over');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toMarkdown(plan)); toast('Handover plan copied as Markdown'); } catch { toast('Copy is blocked here — select the text instead'); }
  };

  return (
    <Sheet title={person.displayName} subtitle={`Keystone index ${person.keystoneIndex} · sole keeper of ${person.soleKeeperOf} area${person.soleKeeperOf === 1 ? '' : 's'}`} onClose={onClose}
      leading={<Avatar person={person} away={person.away} />}>
      <div className="section" style={{ marginTop: 0 }}><h3>Availability</h3>
        <div className="avail">
          <label className="sr" htmlFor="st">Status</label>
          <select id="st" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="available">Available</option><option value="leave">On leave</option><option value="leaving">Leaving the team</option>
          </select>
          {status !== 'available' && <><label className="faint" htmlFor="dt">{status === 'leave' ? 'Back on' : 'Last day'}</label><input id="dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></>}
          <button className="btn" onClick={saveAvailability} disabled={busy}>Save</button>
        </div>
        <p className="faint">{person.accountId === me ? 'You can set your own availability.' : sample ? 'Sample people can be edited by anyone.' : 'Changing someone else’s availability needs Jira admin permission.'} Away holders raise an area’s risk.</p>
      </div>

      <div className="section"><h3>Handover plan</h3>
        {err && <p className="lvl lvl-critical">{err}</p>}
        {!plan && !err && <><Skeleton h={70} /><Skeleton h={70} style={{ marginTop: 10 }} /></>}
        {plan && !plan.items.length && <p className="muted">{person.displayName} isn’t a major context holder anywhere — no handover needed.</p>}
        {plan?.items.map((i) => (
          <div className="card" key={i.areaId} style={{ boxShadow: 'none', background: 'var(--card-2)', border: '1px solid var(--line)', padding: 14 }}>
            <div className="card-head" style={{ marginBottom: 8 }}><h3>{i.area}</h3><span className="controls"><span className="badge">{pct(i.share)} of context</span><Level level={i.riskLevel} /></span></div>
            <div className="reason"><Icon.users /><span>{i.needsNewOwner ? <b className="lvl lvl-high">No one else has meaningful context — pick a new owner.</b> : <>Hand over to <b>{i.successors.map((s) => `${s.displayName} (${pct(s.share)})`).join(' or ')}</b>{i.lowContext && <span className="muted"> · little context yet, plan a full walkthrough</span>}</>}</span></div>
            {i.transferIssues.length > 0 && <div className="reason"><Icon.chev /><span>Transfer {i.transferIssues.slice(0, 6).map((t) => t.key).join(', ')}{i.transferIssues.length > 6 ? ` and ${i.transferIssues.length - 6} more` : ''}</span></div>}
            {i.readingList.length > 0 && <div className="reason"><Icon.info /><span className="muted">Read first: {i.readingList.slice(0, 3).map((t) => t.key).join(', ')}</span></div>}
          </div>
        ))}
        {plan?.items.length > 0 && (
          <div className="controls" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={createTasks} disabled={busy || sample || Boolean(created)} title={sample ? 'Switch to a real project to create Jira tasks' : undefined}><Icon.check /> Create handover tasks in Jira</button>
            <button className="btn" onClick={copy}><Icon.copy /> Copy as Markdown</button>
          </div>
        )}
        {created?.length > 0 && <p className="lvl lvl-low" role="status" style={{ marginTop: 10 }}>Created {created.join(', ')} in Jira, labelled keystone-handover.</p>}
        {sample && plan?.items.length > 0 && <p className="faint">Task creation is disabled for the sample workspace.</p>}
      </div>
    </Sheet>
  );
}
