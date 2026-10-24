import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { fmt, hourLabel, hourOf, dateOf, periodForHour, Empty } from './ui.jsx';

const axis = { fontSize: 12, fill: '#4a5d66' };

export function PeriodLegend({ periods, colors }) {
  return (
    <ul className="legend" aria-label="Tariff periods">
      {periods.map((p) => (
        <li key={p.id}><i style={{ background: colors[p.id] }} aria-hidden="true" />{p.label} <span className="muted small">{p.startHour}:00–{p.endHour}:00</span></li>
      ))}
    </ul>
  );
}

export function HourlyChart({ mode, records, date, hourlyAverages, tariff, colors }) {
  const periods = tariff?.periods || [];
  let data = [];
  if (mode === 'day') {
    data = records.filter((r) => dateOf(r.timestamp) === date).map((r) => ({ hour: hourOf(r.timestamp), kwh: r.kwhUsed }));
  } else {
    data = (hourlyAverages || []).map((h) => ({ hour: h.hour, kwh: h.kwh }));
  }
  if (!data.length) return <Empty>No hourly readings for this selection.</Empty>;
  return (
    <div role="img" aria-label={`Bar chart of ${mode === 'day' ? `hourly kWh on ${date}` : 'average kWh by hour of day'}`} className="chart tall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#dbe4e2" />
          <XAxis dataKey="hour" tick={axis} tickFormatter={(h) => String(h).padStart(2, '0')} interval={1} />
          <YAxis tick={axis} unit=" kWh" width={64} />
          <Tooltip formatter={(v) => [`${fmt(v, 3)} kWh`, mode === 'day' ? 'Used' : 'Average']} labelFormatter={(h) => hourLabel(h)} />
          <Bar dataKey="kwh" radius={[3, 3, 0, 0]}>
            {data.map((d) => <Cell key={d.hour} fill={colors[periodForHour(d.hour, periods)?.id] || '#7a8f98'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ dailyTotals, date, onSelect }) {
  if (!dailyTotals?.length) return <Empty>No daily totals available.</Empty>;
  return (
    <div role="img" aria-label="Bar chart of daily kWh. Select a bar to inspect that day." className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dailyTotals} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#dbe4e2" />
          <XAxis dataKey="date" tick={axis} tickFormatter={(d) => d.slice(5)} minTickGap={16} />
          <YAxis tick={axis} unit=" kWh" width={64} />
          <Tooltip formatter={(v) => [`${fmt(v, 2)} kWh`, 'Day total']} />
          <Bar dataKey="kwh" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d) => onSelect(d.date)}>
            {dailyTotals.map((d) => <Cell key={d.date} fill={d.date === date ? '#14232b' : '#8fb3ad'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PeriodBreakdown({ periodTotals, colors }) {
  if (!periodTotals?.length) return <Empty>No tariff-period breakdown returned.</Empty>;
  return (
    <ul className="periods">
      {periodTotals.map((p) => (
        <li key={p.periodId}>
          <div className="row"><span><i className="dot" style={{ background: colors[p.periodId] }} aria-hidden="true" />{p.label}</span><strong>{fmt(p.kwh)} kWh</strong></div>
          <div className="bar" role="presentation"><span style={{ width: `${Math.min(100, p.sharePercent || 0)}%`, background: colors[p.periodId] }} /></div>
          <div className="row muted small">
            <span>{fmt(p.sharePercent, 1)}% of your use</span>
            <span>{p.estimatedEnergyCharge == null ? 'Cost not estimated' : `Est. cost ${fmt(p.estimatedEnergyCharge)}`}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
