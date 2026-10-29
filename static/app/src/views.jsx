import { useEffect, useMemo, useState } from 'react';
import { Avatar, Icon, Level, Ring, Skeleton, call, levelColor, pct } from './ui.jsx';

export function Overview({ data, openArea, openPerson }) {
  const s = data.summary;
  return (
    <div className="fade-in">
      <div className="card stats" role="group" aria-label="Summary">
        <div className="stat"><div className="l">Team bus factor</div><div className="v">{s.teamBusFactor}<small>people</small></div><div className="h">Lose them and over half your areas lose every key holder</div></div>
        <div className="stat"><div className="l">Areas at risk</div><div className="v" style={{ color: s.areasAtRisk ? 'var(--high)' : undefined }}>{s.areasAtRisk}<small>/ {s.areas}</small></div><div className="h">High or critical knowledge risk</div></div>
        <div className="stat"><div className="l">Single-holder areas</div><div className="v">{s.soloAreas}</div><div className="h">Bus factor of 1</div></div>
        <div className="stat"><div className="l">Open work on one person</div><div className="v">{s.openWorkSingleHolderPct}<small>%</small></div><div className="h">Open items in single-holder areas</div></div>
      </div>
      <div className="grid two">
        <section className="card" aria-labelledby="map-h">
          <div className="card-head"><h2 id="map-h">Risk map</h2><span className="faint">{data.areas.length} areas · sorted by risk</span></div>
          {data.areas.length ? (
            <div className="map">
              {data.areas.map((a) => (
                <button key={a.id} className={`tile lvl-${a.risk.level}`} onClick={() => openArea(a)} aria-label={`${a.name}, ${a.risk.level} risk ${a.risk.score}, bus factor ${a.busFactor}`}>
                  <span className="name">{a.name}</span>
                  <span className="row"><span className="score">{a.risk.score}</span><span>BF {a.busFactor} · {a.openCount} open</span></span>
                  <span className="row" style={{ justifyContent: 'flex-start', gap: 6 }}>
                    <Avatar person={a.holders[0]} size="sm" away={a.holders[0]?.away} /><span className="ellipsis">{a.holders[0]?.displayName.split(' ')[0]} {pct(a.holders[0]?.share || 0)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : <Empty title="No areas yet" text="Keystone groups work by component, then epic, then label. Add components or epics to your work items to see risk by area." />}
        </section>
        <section className="card" aria-labelledby="ks-h">
          <div className="card-head"><h2 id="ks-h">Keystone people</h2><span className="faint">If they vanished tomorrow</span></div>
          <ul className="list">
            {data.people.slice(0, 6).map((p) => (
              <li key={p.accountId}>
                <button className="row-btn" onClick={() => openPerson(p)}>
                  <Avatar person={p} away={p.away} />
                  <span className="grow"><span className="ellipsis" style={{ display: 'block', fontWeight: 600 }}>{p.displayName}</span>
                    <span className="faint">{p.soleKeeperOf ? `Sole keeper of ${p.soleKeeperOf} area${p.soleKeeperOf > 1 ? 's' : ''}` : `${p.areasHeld.length} area${p.areasHeld.length === 1 ? '' : 's'} with major share`}{p.away ? ' · away' : ''}</span></span>
                  <Ring value={p.keystoneIndex} size={40} stroke={4} color={levelColor(p.keystoneIndex)} label={`Keystone index ${p.keystoneIndex}`} />
                  <span className="chev"><Icon.chev /></span>
                </button>
              </li>
            ))}
          </ul>
          <p className="faint" style={{ marginTop: 10 }}>Keystone index = how much area risk rests on one person (0–100). It measures fragility, not performance.</p>
        </section>
      </div>
      {data.recommendations?.length > 0 && (
        <section className="card" aria-labelledby="next-h" style={{ marginTop: 16 }}>
          <div className="card-head"><h2 id="next-h">Next best actions</h2><span className="faint">Spread context before it's needed</span></div>
          <ol className="list actions">
            {data.recommendations.map((r, i) => (
              <li key={r.areaId}>
                <button className="row-btn" onClick={() => openArea(data.areas.find((a) => a.id === r.areaId))}>
                  <span className={`num lvl-${r.level}`}>{i + 1}</span>
                  <span className="grow"><b>{r.area}</b><span className="muted" style={{ display: 'block' }}>{r.text}</span></span>
                  <span className="chev"><Icon.chev /></span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function Areas({ data, openArea }) {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const rows = useMemo(() => data.areas.filter((a) => (level === 'all' || a.risk.level === level) && a.name.toLowerCase().includes(q.toLowerCase())), [data, q, level]);
  return (
    <section className="card fade-in" aria-label="Areas">
      <div className="controls" style={{ marginBottom: 12 }}>
        <div className="grow" style={{ minWidth: 200 }}><label className="sr" htmlFor="q">Search areas</label><input id="q" className="search" placeholder="Search components, epics, labels" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="sr" htmlFor="lv">Risk level</label>
        <select id="lv" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">All levels</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
      </div>
      {rows.length ? (
        <ul className="list">
          {rows.map((a) => (
            <li key={a.id}>
              <button className="row-btn" onClick={() => openArea(a)}>
                <Ring value={a.risk.score} size={40} stroke={4} color={levelColor(a.risk.score)} label={`Risk ${a.risk.score}`} />
                <span className="grow">
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b className="ellipsis">{a.name}</b><Level level={a.risk.level} /></span>
                  <span className="faint">{a.issueCount} items · {a.openCount} open · bus factor {a.busFactor} · {a.holders.slice(0, 2).map((h) => `${h.displayName} ${pct(h.share)}`).join(', ')}</span>
                </span>
                <span className="chev"><Icon.chev /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : <Empty title="No matching areas" text="Try a different search or risk level." />}
    </section>
  );
}

export function People({ data, openPerson }) {
  return (
    <section className="card fade-in" aria-label="People">
      <ul className="list">
        {data.people.map((p) => (
          <li key={p.accountId}>
            <button className="row-btn" onClick={() => openPerson(p)}>
              <Avatar person={p} away={p.away} />
              <span className="grow">
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b className="ellipsis">{p.displayName}</b>{p.away && <span className="badge">{p.availability?.status === 'leaving' ? 'Leaving' : 'On leave'}</span>}</span>
                <span className="faint ellipsis" style={{ display: 'block' }}>{p.areasHeld.length ? p.areasHeld.map((a) => `${a.name} ${pct(a.share)}`).join(' · ') : 'No area with a major share'}</span>
              </span>
              <Ring value={p.keystoneIndex} size={40} stroke={4} color={levelColor(p.keystoneIndex)} label={`Keystone index ${p.keystoneIndex}`} />
              <span className="chev"><Icon.chev /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WhatIf({ data, projectKey, openArea }) {
  const [sel, setSel] = useState([]);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!sel.length) { setRes(null); return; }
    let live = true;
    call('simulate', { projectKey, accountIds: sel }).then((r) => live && setRes(r), (e) => live && setErr(e.message));
    return () => { live = false; };
  }, [sel, projectKey]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const orphaned = res?.filter((r) => r.orphaned) || [];
  const weakened = res?.filter((r) => !r.orphaned) || [];
  return (
    <div className="fade-in">
      <section className="card">
        <div className="card-head"><h2>What if they were away?</h2><span className="faint">Pick people to simulate leave, a departure or a re-org</span></div>
        <div className="chips">
          {data.people.map((p) => (
            <button key={p.accountId} className="chip" aria-pressed={sel.includes(p.accountId)} onClick={() => toggle(p.accountId)}>
              <Avatar person={p} size="sm" />{p.displayName}
            </button>
          ))}
        </div>
      </section>
      {err && <p className="lvl lvl-critical">{err}</p>}
      {!sel.length && <section className="card"><Empty title="Select someone to see the blast radius" text="Keystone recalculates which areas lose all their context holders and how much open work is exposed." /></section>}
      {sel.length > 0 && !res && <Skeleton h={160} style={{ marginTop: 16 }} />}
      {res && (
        <>
          <div className="impact">
            <div className="card"><div className="faint">Areas left with no one</div><div className="stat" style={{ padding: 0, border: 0 }}><div className="v" style={{ color: orphaned.length ? 'var(--critical)' : undefined }}>{orphaned.length}</div></div></div>
            <div className="card"><div className="faint">Areas seriously weakened</div><div className="stat" style={{ padding: 0, border: 0 }}><div className="v" style={{ color: weakened.length ? 'var(--high)' : undefined }}>{weakened.length}</div></div></div>
            <div className="card"><div className="faint">Open work items exposed</div><div className="stat" style={{ padding: 0, border: 0 }}><div className="v">{res.reduce((s, r) => s + r.openCount, 0)}</div></div></div>
          </div>
          <section className="card">
            {res.length ? (
              <ul className="list">
                {res.map((r) => (
                  <li key={r.id}>
                    <button className="row-btn" onClick={() => openArea(data.areas.find((a) => a.id === r.id))}>
                      <span className={`dot lvl-fill ${r.orphaned ? 'lvl-critical' : 'lvl-high'}`} />
                      <span className="grow"><b>{r.name}</b><span className="faint" style={{ display: 'block' }}>
                        {r.orphaned ? 'No remaining key holder' : `Loses ${pct(r.lostShare)} of its context`} · {r.nextBest ? `next best: ${r.nextBest.displayName} (${pct(r.nextBest.share)})` : 'no one else has touched it'}</span></span>
                      <span className="faint">{r.openCount} open</span>
                      <span className="chev"><Icon.chev /></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <Empty title="The team absorbs this" text="No area loses 30% or more of its context. Nice redundancy." />}
          </section>
        </>
      )}
    </div>
  );
}

export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <div className="glyph"><Icon.spark width="24" height="24" /></div>
      <h3>{title}</h3>
      <p className="muted" style={{ maxWidth: 420, margin: '6px auto 14px' }}>{text}</p>
      {action}
    </div>
  );
}
