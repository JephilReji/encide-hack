import React from 'react';

export const fmt = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—');
export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
export const hourOf = (ts) => parseInt(ts.slice(11, 13), 10);
export const dateOf = (ts) => ts.slice(0, 10);
export const money = (n, cur = 'INR') => {
  if (typeof n !== 'number') return '—';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(n); } catch { return `${cur} ${n.toFixed(2)}`; }
};
// Display-only: which configured period an hour falls in (used for colouring, never for cost).
export const periodForHour = (h, periods = []) =>
  periods.find((p) => (p.startHour < p.endHour ? h >= p.startHour && h < p.endHour : h >= p.startHour || h < p.endHour));

export function Loading({ label = 'Loading…' }) {
  return <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{label}</div>;
}
export function ErrorBox({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="error" role="alert">
      <strong>{title}</strong>
      <p>{error?.message || String(error)}</p>
      {error?.code && <p className="muted small">Code: {error.code}</p>}
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}
export function Empty({ children }) { return <p className="empty">{children}</p>; }
export function Card({ title, children, action, id, className = '' }) {
  return (
    <section className={`card ${className}`} aria-labelledby={id}>
      <header className="card-head"><h2 id={id}>{title}</h2>{action}</header>
      {children}
    </section>
  );
}
