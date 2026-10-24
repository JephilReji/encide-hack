import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { fmt, hourLabel, dateOf, Loading, ErrorBox, Empty, Card } from './ui.jsx';
import { HourlyChart, DailyChart, PeriodBreakdown, PeriodLegend } from './Charts.jsx';
import Optimizer from './Optimizer.jsx';
import Insights from './Insights.jsx';

const PALETTE = ['#5b8aa6', '#d9791b', '#1f7a6d', '#8a6bb0'];
const TABS = [
  { id: 'home', label: 'Home', icon: '🏠', title: 'Your electricity' },
  { id: 'usage', label: 'Usage', icon: '📊', title: 'When you use power' },
  { id: 'save', label: 'Save', icon: '💰', title: 'Save on your bill' },
  { id: 'tips', label: 'Tips', icon: '💡', title: 'Advice for you' },
];
const warningParts = (w) => (typeof w === 'string'
  ? { title: w }
  : { title: w.title || w.message || w.id || 'Heads up', body: w.explanation || (w.title ? w.message : ''), severity: w.severity });

const tabFromHash = () => (TABS.find((t) => `#${t.id}` === window.location.hash) || TABS[0]).id;

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [boot, setBoot] = useState({ status: 'loading' });
  const [data, setData] = useState({ status: 'idle' });
  const [date, setDate] = useState('');
  const [mode, setMode] = useState('day');

  useEffect(() => { // hash routing so the phone/browser back button moves between pages
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (id) => { window.location.hash = id; window.scrollTo(0, 0); };

  const load = useCallback(async () => {
    setBoot({ status: 'loading' });
    setData({ status: 'loading' });
    try {
      const [, sc, tariff] = await Promise.all([api.health(), api.getScenarios(), api.getTariff()]);
      const scenarioId = sc.scenarios?.[0]?.id; // first scenario is the default per the contract
      if (!scenarioId) throw new Error('No usage data is available yet.');
      const [readings, analysis] = await Promise.all([api.getReadings(scenarioId), api.analyze(scenarioId, tariff.profileId)]);
      const withFlex = readings.records.find((r) => r.shiftableLoadKwh > 0);
      setDate(withFlex ? dateOf(withFlex.timestamp) : analysis.dailyTotals?.[0]?.date || '');
      setBoot({ status: 'ready', scenarioId, tariff });
      setData({ status: 'ready', readings, analysis });
    } catch (err) { setBoot({ status: 'error', error: err }); setData({ status: 'idle' }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tariff = boot.tariff;
  const colors = useMemo(() => Object.fromEntries((tariff?.periods || []).map((p, i) => [p.id, PALETTE[i % PALETTE.length]])), [tariff]);
  const a = data.analysis;
  const ready = boot.status === 'ready' && data.status === 'ready' && a;
  const current = TABS.find((t) => t.id === tab);
  const dayPicker = ready && (
    <label className="inline">Day
      <select value={date} onChange={(e) => setDate(e.target.value)}>
        {a.dailyTotals.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
      </select>
    </label>
  );

  return (
    <div className="app">
      <header className="top">
        <h1>{current.title}</h1>
        <span className="sim" role="status">SIMULATED DATA</span>
      </header>

      <main id="main">
        {boot.status === 'loading' && <Loading label="Getting your electricity details…" />}
        {boot.status === 'error' && <ErrorBox title="We couldn’t load your details" error={boot.error} onRetry={load} />}

        {ready && tab === 'home' && (
          <>
            <div className="hero-stat">
              <span>You used</span>
              <strong>{fmt(a.summary.totalKwh, 1)} units</strong>
              <span>of electricity (1 unit = 1 kWh)</span>
            </div>
            <div className="cards">
              <Stat label="Average per day" value={`${fmt(a.summary.averageDailyKwh)} units`} />
              <Stat label="Busiest time of day" value={hourLabel(a.summary.peakHour)} />
              <Stat label="Heaviest day" value={`${fmt(a.summary.highestDailyKwh)} units`} />
              {a.forecast?.available && <Stat label="Expected this bill cycle" value={`${fmt(a.forecast.projectedCycleKwh, 0)} units`} note={a.forecast.notice} />}
            </div>
            <Card id="h-warn" title="Alerts">
              {a.thresholdWarnings?.length ? (
                <ul className="warnings">
                  {a.thresholdWarnings.map((w, i) => { const p = warningParts(w); return <li key={i}><strong>{p.title}</strong>{p.body && <p className="small">{p.body}</p>}</li>; })}
                </ul>
              ) : <p className="good-msg">✅ No alerts. Your usage is within the limits we can check.</p>}
            </Card>
            <button className="nav-card" onClick={() => go('save')}>💰 <span><strong>See how to save money</strong><br /><span className="small muted">Try moving an appliance to a cheaper time</span></span></button>
            <button className="nav-card" onClick={() => go('tips')}>💡 <span><strong>Get advice</strong><br /><span className="small muted">Plain-language tips based on your usage</span></span></button>
            <p className="muted small">Costs are estimates of the energy charge only. They are not your official KSEB bill.{tariff.verificationStatus !== 'verified' && ' The rates used here are for illustration.'}</p>
          </>
        )}

        {ready && tab === 'usage' && (
          <>
            <Card id="h-hourly" title="Hour by hour"
              action={<div className="seg" role="group" aria-label="Hourly view">
                <button aria-pressed={mode === 'day'} onClick={() => setMode('day')}>One day</button>
                <button aria-pressed={mode === 'avg'} onClick={() => setMode('avg')}>Typical day</button>
              </div>}>
              {mode === 'day' && dayPicker}
              <p className="muted small">Taller bars mean more electricity used in that hour.</p>
              <PeriodLegend periods={tariff.periods} colors={colors} />
              <HourlyChart mode={mode} records={data.readings.records} date={date} hourlyAverages={a.hourlyAverages} tariff={tariff} colors={colors} />
            </Card>
            <Card id="h-daily" title="Day by day">
              <p className="muted small">Tap a day to see its hours.</p>
              <DailyChart dailyTotals={a.dailyTotals} date={date} onSelect={(d) => { setDate(d); setMode('day'); }} />
            </Card>
            <Card id="h-periods" title="Costly vs cheaper hours">
              <PeriodBreakdown periodTotals={a.periodTotals} colors={colors} />
            </Card>
          </>
        )}

        {ready && tab === 'save' && (
          <Card id="h-opt" title="Move power use to a cheaper time">
            <p className="muted small">Choose an appliance hour you could shift (like a washing machine run) and a new time. The same electricity is used; only the time changes.</p>
            {dayPicker}
            <Optimizer scenarioId={boot.scenarioId} tariff={tariff} records={data.readings.records} date={date} />
          </Card>
        )}

        {ready && tab === 'tips' && (
          <Card id="h-ai" title="Your advice">
            <Insights scenarioId={boot.scenarioId} tariffProfileId={tariff.profileId} findings={a.findings} />
          </Card>
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={t.id === tab ? 'page' : undefined}>
            <span aria-hidden="true">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Stat({ label, value, note }) {
  return <div className="stat"><span className="muted small">{label}</span><strong>{value}</strong>{note && <span className="small muted">{note}</span>}</div>;
}
