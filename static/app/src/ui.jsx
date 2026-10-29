import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@forge/bridge';

export async function call(name, payload) {
  const res = await invoke(name, payload);
  if (!res?.ok) throw new Error(res?.error || 'Request failed');
  return res.data;
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const ago = (ts) => {
  if (!ts) return '—';
  const d = Math.round((Date.now() - ts) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
};

const PALETTE = ['#5e5ce6', '#0a84ff', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ac8e68'];
const hue = (s) => PALETTE[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];

export function Avatar({ person, size = '', away }) {
  const [broken, setBroken] = useState(false);
  const name = person?.displayName || '?';
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={`avatar ${size} ${away ? 'away' : ''}`} style={{ background: hue(person?.accountId || name) }} aria-hidden="true">
      {person?.avatarUrl && !broken ? <img src={person.avatarUrl} alt="" onError={() => setBroken(true)} /> : initials}
    </span>
  );
}

export function Level({ level, score }) {
  return <span className={`pill lvl-${level}`}>{level}{score != null ? ` · ${score}` : ''}</span>;
}

export function Ring({ value, size = 44, stroke = 5, color = 'var(--accent)', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setV(value)); return () => cancelAnimationFrame(t); }, [value]);
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || `${value} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, v) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.32,0.72,0,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3}>{value}</text>
    </svg>
  );
}

export const levelColor = (score) => (score >= 70 ? 'var(--critical)' : score >= 45 ? 'var(--high)' : score >= 25 ? 'var(--medium)' : 'var(--low)');

export function Segmented({ options, value, onChange, label }) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState({ left: 3, width: 0 });
  useLayoutEffect(() => {
    const el = ref.current?.querySelector(`[data-v="${value}"]`);
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  const onKey = (e) => {
    const i = options.findIndex((o) => o.value === value);
    const n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (n) { const next = options[(i + n + options.length) % options.length]; onChange(next.value); ref.current.querySelector(`[data-v="${next.value}"]`)?.focus(); }
  };
  return (
    <div className="segmented" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      <span className="thumb" style={thumb} aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} data-v={o.value} role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Sheet({ title, subtitle, onClose, children, leading }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header>
          {leading}
          <div className="grow"><h2>{title}</h2>{subtitle && <div className="muted" style={{ marginTop: 2 }}>{subtitle}</div>}</div>
          <button className="close" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </header>
        <div className="body">{children}</div>
      </section>
    </>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg];
}

const svg = (d, extra = {}) => (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra} {...p}>{d}</svg>
);
export const Icon = {
  x: svg(<path d="M6 6l12 12M18 6L6 18" />),
  chev: svg(<path d="M9 6l6 6-6 6" />),
  refresh: svg(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></>),
  alert: svg(<><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4M12 17.5v.01" /></>),
  users: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>),
  spark: svg(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  copy: svg(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>),
};

export function Skeleton({ h = 120, style }) {
  return <div className="skeleton" style={{ height: h, ...style }} aria-hidden="true" />;
}
