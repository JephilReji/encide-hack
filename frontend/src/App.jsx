import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { fmt, hourLabel, dateOf, Loading, ErrorBox, Empty, Card } from './ui.jsx';
import { HourlyChart, DailyChart, PeriodBreakdown, PeriodLegend } from './Charts.jsx';
import Optimizer from './Optimizer.jsx';
import Insights from './Insights.jsx';

const PALETTE = ['#5b8aa6', '#d9791b', '#1f7a6d', '#8a6bb0'];

const warningParts = (w) => (typeof w === 'string'
  ? { title: w }
  : { title: w.title || w.message || w.id || 'Threshold warning', body: w.explanation || (w.title ? w.message : ''), severity: w.severity, ts: w.timestamp });

export default function App() {
  const [boot, setBoot] = useState({ status: 'loading' });
  const [scenarioId, setScenarioId] = useState('');
  const [data, setData] = useState({ status: 'idle' });
  const [date, setDate] = useState('');
  const [mode, setMode] = useState('day');

  const init = useCallback(async () => {
    setBoot({ status: 'loading' });
    try {
      const [, sc, tariff] = await Promise.all([api.health(), api.getScenarios(), api.getTariff()]);
      setBoot({ status: 'ready', scenarios: sc.scenarios || [], tariff });
      setScenarioId((cur) => cur || sc.scenarios?.[0]?.id || '');
    } catch (err) { setBoot({ status: 'error', error: err }); }
  }, []);
  useEffect(() => { init(); }, [init]);

  const tariff = boot.tariff;
  const load = useCallback(async () => {
    if (!scenarioId || !tariff) return;
    setData({ status: 'loading' });
    try {
      const [readings, analysis] = await Promise.all([api.getReadings(scenarioId), api.analyze(scenarioId, tariff.profileId)]);
      const withFlex = readings.records.find((r) => r.shiftableLoadKwh > 0);
      setDate(withFlex ? dateOf(withFlex.timestamp) : analysis.dailyTotals?.[0]?.date || '');
      setData({ status: 'ready', readings, analysis });
    } catch (err) { setData({ status: 'error', error: err }); }
  }, [scenarioId, tariff]);
  useEffect(() => { load(); }, [load]);

  const colors = useMemo(() => Object.fromEntries((tariff?.periods || []).map((p, i) => [p.id, PALETTE[i % PALETTE.length]])), [tariff]);
  const scenario = boot.scenarios?.find((s) => s.id === scenarioId);
  const isTest = scenario && (/^dev/i.test(scenario.id) || /test/i.test(`${scenario.label} ${scenario.description}`));
  const a = data.analysis;
  const simulated = (a?.dataSource || scenario?.dataSource || 'simulated') === 'simulated';

  return (
    <>
      <a className="skip" href="#main">Skip to dashboard</a>
      <header className="top">
        <div>
          <h1>Cliff Guard</h1>
          <p className="muted">See when your home uses power, and what shifting it would cost.</p>
        </div>
        {simulated && <span className="sim" role="status">SIMULATED DATA</span>}
      </header>

      <main id="main">
        {boot.status === 'loading' && <Loading label="Connecting to the Cliff Guard API…" />}
        {boot.status === 'error' && <ErrorBox title="Can’t load Cliff Guard" error={boot.error} onRetry={init} />}

        {boot.status === 'ready' && (
          <>
            <div className="toolbar">
              <fieldset className="scenarios">
                <legend>Dataset</legend>
                {boot.scenarios.map((s) => (
                  <label key={s.id} className={s.id === scenarioId ? 'pick on' : 'pick'}>
                    <input type="radio" name="scenario" checked={s.id === scenarioId} onChange={() => setScenarioId(s.id)} />
                    <span><strong>{s.label}</strong><br /><span className="small muted">{s.description} · {s.recordCount} records</span></span>
                  </label>
                ))}
              </fieldset>
              <div className={tariff.verificationStatus === 'verified' ? 'tariff' : 'tariff warn'}>
                <strong>{tariff.displayName}</strong> <span className="badge">{tariff.verificationStatus}</span>
                <p className="small">{tariff.eligibilityNote}</p>
                {tariff.verificationStatus !== 'verified' && <p className="small"><strong>Not an official KSEB bill.</strong> Rates in this profile are illustrative and charges are estimates only.</p>}
                <p className="small muted">{tariff.sourceName} · effective {tariff.effectiveFrom} to {tariff.effectiveTo}</p>
              </div>
            </div>

            {isTest && <p className="notice" role="note">This is a short test dataset, not a full-month history. Use it to check patterns, not to forecast a 30-day bill.</p>}

            {data.status === 'loading' && <Loading label="Analysing readings…" />}
            {data.status === 'error' && <ErrorBox title="Could not analyse this dataset" error={data.error} onRetry={load} />}
            {data.status === 'ready' && a && (
              <>
                <div className="cards">
                  <Stat label="Total consumption" value={`${fmt(a.summary.totalKwh)} kWh`} sub={`${a.recordCount} hourly records`} />
                  <Stat label="Daily average" value={`${fmt(a.summary.averageDailyKwh)} kWh`} sub={`Highest day ${fmt(a.summary.highestDailyKwh)} kWh`} />
                  <Stat label="Peak usage hour" value={hourLabel(a.summary.peakHour)} sub="Highest average hour of day" />
                  {a.forecast && (
                    <Stat label="Cycle projection"
                      value={a.forecast.available ? `${fmt(a.forecast.projectedCycleKwh, 1)} kWh` : 'Not available'}
                      sub={a.forecast.notice || a.forecast.method} />
                  )}
                </div>

                <Card id="h-hourly" title="Hourly consumption" className="hero"
                  action={
                    <div className="controls">
                      <div className="seg" role="group" aria-label="Hourly view">
                        <button aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Selected day</button>
                        <button aria-pressed={mode === 'avg'} onClick={() => setMode('avg')}>Average by hour</button>
                      </div>
                      {mode === 'day' && (
                        <label className="inline">Day
                          <select value={date} onChange={(e) => setDate(e.target.value)}>
                            {a.dailyTotals.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  }>
                  <PeriodLegend periods={tariff.periods} colors={colors} />
                  <HourlyChart mode={mode} records={data.readings.records} date={date} hourlyAverages={a.hourlyAverages} tariff={tariff} colors={colors} />
                </Card>

                <div className="grid2">
                  <Card id="h-daily" title="Daily consumption"><DailyChart dailyTotals={a.dailyTotals} date={date} onSelect={(d) => { setDate(d); setMode('day'); }} /></Card>
                  <Card id="h-periods" title="Consumption by tariff period"><PeriodBreakdown periodTotals={a.periodTotals} colors={colors} /></Card>
                </div>

                <Card id="h-warn" title="Threshold warnings">
                  {a.thresholdWarnings?.length ? (
                    <ul className="warnings">
                      {a.thresholdWarnings.map((w, i) => {
                        const p = warningParts(w);
                        return <li key={i}><strong>{p.title}</strong>{p.severity && <span className="badge warn">{p.severity}</span>}{p.body && <p className="small">{p.body}</p>}{p.ts && <p className="small muted">{p.ts}</p>}</li>;
                      })}
                    </ul>
                  ) : <Empty>No threshold warnings for this dataset. {tariff.thresholds?.length ? '' : 'The active tariff profile has no confirmed thresholds configured, so none can be checked.'}</Empty>}
                </Card>

                <div className="grid2">
                  <Card id="h-opt" title="Try shifting flexible load">
                    <p className="muted small">Pick an hour with flexible load and a new hour on {date}. The backend recalculates the cost; total kWh stays the same.</p>
                    <Optimizer scenarioId={scenarioId} tariff={tariff} records={data.readings.records} date={date} />
                  </Card>
                  <Card id="h-ai" title="AI insights">
                    <Insights scenarioId={scenarioId} tariffProfileId={tariff.profileId} findings={a.findings} />
                  </Card>
                </div>

                {a.assumptions?.length > 0 && <p className="muted small foot">Assumptions: {a.assumptions.join(' · ')}. Costs shown are energy-charge estimates, not a complete bill.</p>}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, sub }) {
  return <div className="stat"><span className="muted small">{label}</span><strong>{value}</strong><span className="small muted">{sub}</span></div>;
}
