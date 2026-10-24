import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { fmt, money, hourOf, periodForHour, Loading, ErrorBox, Empty } from './ui.jsx';

export default function Optimizer({ scenarioId, tariff, records, date }) {
  const dayRecords = useMemo(() => records.filter((r) => r.timestamp.startsWith(date)), [records, date]);
  const sources = useMemo(() => dayRecords.filter((r) => r.shiftableLoadKwh > 0), [dayRecords]);
  const [sourceTs, setSourceTs] = useState('');
  const [targetTs, setTargetTs] = useState('');
  const [shiftKwh, setShiftKwh] = useState(0);
  const [state, setState] = useState({ status: 'idle' });

  const source = sources.find((r) => r.timestamp === sourceTs);
  const periods = tariff?.periods || [];
  const periodName = (id) => periods.find((p) => p.id === id)?.label || id;
  const slot = (r) => {
    const h = hourOf(r.timestamp);
    return `${String(h).padStart(2, '0')}:00 · ${periodForHour(h, periods)?.label || r.tariffPeriodLabel}`;
  };

  useEffect(() => { // reset when the day changes
    setState({ status: 'idle' });
    const first = sources[0];
    setSourceTs(first ? first.timestamp : '');
  }, [sources]);

  useEffect(() => { // sensible defaults when the source changes
    if (!source) { setTargetTs(''); setShiftKwh(0); return; }
    const other = dayRecords.find((r) => r.timestamp !== source.timestamp && r.tariffPeriodLabel !== source.tariffPeriodLabel)
      || dayRecords.find((r) => r.timestamp !== source.timestamp);
    setTargetTs(other ? other.timestamp : '');
    setShiftKwh(source.shiftableLoadKwh);
    setState({ status: 'idle' });
  }, [sourceTs]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(e) {
    e.preventDefault();
    setState({ status: 'loading' });
    try {
      const result = await api.optimize({ scenarioId, tariffProfileId: tariff.profileId, date, sourceTimestamp: sourceTs, targetTimestamp: targetTs, shiftKwh: Number(shiftKwh) });
      setState({ status: 'done', result });
    } catch (err) { setState({ status: 'error', error: err }); }
  }

  if (!sources.length) return <Empty>No flexible load recorded on {date}. Pick another day in the chart above to test a shift.</Empty>;
  const max = source ? source.shiftableLoadKwh : 0;
  const invalid = !source || !targetTs || !(Number(shiftKwh) > 0) || Number(shiftKwh) > max + 1e-9;
  const r = state.result;

  return (
    <div>
      <form className="form" onSubmit={run}>
        <label>Move from
          <select value={sourceTs} onChange={(e) => setSourceTs(e.target.value)}>
            {sources.map((s) => <option key={s.timestamp} value={s.timestamp}>{slot(s)} ({fmt(s.shiftableLoadKwh, 3)} kWh flexible)</option>)}
          </select>
        </label>
        <label>Move to
          <select value={targetTs} onChange={(e) => setTargetTs(e.target.value)}>
            {dayRecords.filter((x) => x.timestamp !== sourceTs).map((t) => <option key={t.timestamp} value={t.timestamp}>{slot(t)}</option>)}
          </select>
        </label>
        <label>Shiftable energy: <strong>{fmt(Number(shiftKwh), 3)} kWh</strong>
          <input type="range" min="0.01" max={max || 1} step="0.01" value={shiftKwh} onChange={(e) => setShiftKwh(e.target.value)} />
          <span className="muted small">Up to {fmt(max, 3)} kWh available at the source hour</span>
        </label>
        <button className="btn primary" disabled={invalid || state.status === 'loading'}>Compare cost</button>
      </form>

      <div aria-live="polite">
        {state.status === 'loading' && <Loading label="Calculating on the server…" />}
        {state.status === 'error' && <ErrorBox title="Could not compare this shift" error={state.error} />}
        {state.status === 'done' && r && (
          <div className="result">
            <p className="muted small">{periodName(r.sourcePeriod)} → {periodName(r.targetPeriod)} · total energy {fmt(r.totalKwhBefore, 3)} kWh before, {fmt(r.totalKwhAfter, 3)} kWh after (unchanged load, only the time moves)</p>
            <div className="ba">
              <div><span className="muted small">Before</span><strong>{money(r.estimatedEnergyChargeBefore, r.currency)}</strong></div>
              <div><span className="muted small">After</span><strong>{money(r.estimatedEnergyChargeAfter, r.currency)}</strong></div>
              <div className={r.estimatedSavings > 0 ? 'save good' : 'save'}>
                <span className="muted small">Estimated saving</span>
                <strong>{typeof r.estimatedSavings === 'number' && r.estimatedSavings > 0 ? money(r.estimatedSavings, r.currency) : 'None'}</strong>
              </div>
            </div>
            {!(r.estimatedSavings > 0) && <p className="notice">This move does not reduce the estimated energy charge, so no saving is claimed.</p>}
            {(r.note || r.explanation || r.message) && <p className="small">{r.note || r.explanation || r.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
