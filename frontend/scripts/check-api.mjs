// Contract smoke test: node scripts/check-api.mjs  (uses VITE_API_BASE_URL or http://localhost:3001)
import { api } from '../src/api.js';
let failed = 0;
const need = (label, obj, keys) => {
  const miss = keys.filter((k) => !(k in (obj || {})));
  console.log(`${miss.length ? 'FAIL' : 'ok  '} ${label}${miss.length ? ' missing: ' + miss.join(', ') : ''}`);
  if (miss.length) failed++;
};
try {
  need('GET /api/health', await api.health(), ['status', 'service']);
  const sc = await api.getScenarios();
  need('GET /api/demo/scenarios', sc.scenarios?.[0], ['id', 'label', 'description', 'recordCount', 'dataSource']);
  const id = sc.scenarios[0].id;
  const rd = await api.getReadings(id);
  need('GET /api/demo/readings', rd, ['scenarioId', 'dataSource', 'intervalConvention', 'records']);
  need('  record', rd.records[0], ['recordId', 'timestamp', 'kwhUsed', 'baseHouseholdKwh', 'shiftableLoadKwh', 'tariffPeriodLabel']);
  if ('is_injected_spike' in rd.records[0] || 'isInjectedSpike' in rd.records[0]) { console.log('FAIL readings expose injected-spike label'); failed++; }
  const t = await api.getTariff();
  need('GET /api/tariff', t, ['profileId', 'displayName', 'verificationStatus', 'effectiveFrom', 'effectiveTo', 'sourceName', 'eligibilityNote', 'billingCycleDays', 'periods', 'thresholds']);
  const an = await api.analyze(id, t.profileId);
  need('POST /api/analyze', an, ['scenarioId', 'dataSource', 'recordCount', 'summary', 'dailyTotals', 'hourlyAverages', 'periodTotals', 'findings', 'thresholdWarnings', 'forecast', 'assumptions']);
  need('  summary', an.summary, ['totalKwh', 'averageDailyKwh', 'peakHour', 'highestDailyKwh']);
  const src = rd.records.find((r) => r.shiftableLoadKwh > 0);
  const tgt = rd.records.find((r) => r.timestamp.slice(0, 10) === src.timestamp.slice(0, 10) && r.tariffPeriodLabel !== src.tariffPeriodLabel);
  const op = await api.optimize({ scenarioId: id, tariffProfileId: t.profileId, date: src.timestamp.slice(0, 10), sourceTimestamp: src.timestamp, targetTimestamp: tgt.timestamp, shiftKwh: Math.min(0.4, src.shiftableLoadKwh) });
  need('POST /api/optimize', op, ['dataSource', 'totalKwhBefore', 'totalKwhAfter', 'sourcePeriod', 'targetPeriod', 'estimatedEnergyChargeBefore', 'estimatedEnergyChargeAfter', 'estimatedSavings', 'currency']);
  const ad = await api.advice({ scenarioId: id, tariffProfileId: t.profileId, question: 'What should I try changing?', selectedFindingIds: an.findings.map((f) => f.id) });
  need('POST /api/advice', ad, ['provider', 'insights', 'disclaimer']);
  try { await api.optimize({ scenarioId: id, tariffProfileId: t.profileId, date: src.timestamp.slice(0, 10), sourceTimestamp: src.timestamp, targetTimestamp: tgt.timestamp, shiftKwh: 999 }); console.log('FAIL oversize shift was accepted'); failed++; }
  catch (e) { console.log(`ok   error shape -> ${e.code}: ${e.message}`); }
} catch (e) { console.log('FAIL', e.code || '', e.message); failed++; }
process.exit(failed ? 1 : 0);
