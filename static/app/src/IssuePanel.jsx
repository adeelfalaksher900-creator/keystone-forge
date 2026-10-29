import { useEffect, useState } from 'react';
import { Icon, Level, Skeleton, call } from './ui.jsx';
import { Holders } from './sheets.jsx';

export default function IssuePanel({ ctx }) {
  const issueKey = ctx.extension?.issue?.key;
  const projectKey = ctx.extension?.project?.key;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    document.body.classList.add('panel');
    call('issueContext', { issueKey, projectKey }).then(setData, (e) => setError(e.message));
  }, [issueKey, projectKey]);

  if (error) return <div className="panel-wrap"><div className="callout" style={{ '--c': 'var(--critical)' }} role="alert"><Icon.alert /><span>{error}</span></div></div>;
  if (!data) return <div className="panel-wrap" aria-busy="true"><Skeleton h={18} style={{ width: '60%' }} /><Skeleton h={60} style={{ marginTop: 10 }} /></div>;

  return (
    <div className="panel-wrap">
      {data.warning && <div className="callout" style={{ '--c': 'var(--high)' }} role="status"><Icon.alert /><span>{data.warning}</span></div>}
      {!data.areas.length && <p className="muted">This work item has no component, epic or label yet, so Keystone can’t place it in an area. Add one to see who holds the context.</p>}
      {data.areas.map((a) => (
        <div key={a.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <b>{a.name}</b><Level level={a.risk.level} score={a.risk.score} /><span className="badge">Bus factor {a.busFactor}</span>
          </div>
          <Holders holders={a.holders} limit={3} />
          {a.busFactor === 1 && <p className="faint">Only one person holds most of this context. Consider pairing someone else on this work item.</p>}
        </div>
      ))}
      <p className="faint">Context = share of recorded Jira activity in the area, weighted to recent work. Open Keystone from the Apps menu for the full radar.</p>
    </div>
  );
}
