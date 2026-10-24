const { loadScenarioRecords } = require('./dataLoader');
const {
  getTariffById,
  periodForHour,
  isVerified,
  computeEnergyCharge,
} = require('./tariffService');
const { detectAnomalies } = require('./anomalyDetection');
const { ApiError } = require('./errors');

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function analyze({ scenarioId, tariffProfileId }) {
  if (!scenarioId || typeof scenarioId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'scenarioId is required');
  }
  if (!tariffProfileId || typeof tariffProfileId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'tariffProfileId is required');
  }

  const tariff = getTariffById(tariffProfileId);
  if (!tariff) {
    throw new ApiError(
      400,
      'UNKNOWN_TARIFF',
      `Unknown tariffProfileId: ${tariffProfileId}`
    );
  }

  const { scenario, records } = loadScenarioRecords(scenarioId);
  if (records.length === 0) {
    throw new ApiError(500, 'DATA_ERROR', 'Scenario has no records');
  }

  const totalKwh = round4(records.reduce((s, r) => s + r.kwhUsed, 0));

  const dailyMap = new Map();
  for (const r of records) {
    dailyMap.set(r.date, (dailyMap.get(r.date) || 0) + r.kwhUsed);
  }
  const dailyTotals = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kwh]) => ({ date, kwh: round4(kwh) }));

  const uniqueDays = dailyTotals.length;
  const averageDailyKwh =
    uniqueDays > 0 ? round4(totalKwh / uniqueDays) : null;

  let highestDailyKwh = 0;
  for (const d of dailyTotals) {
    if (d.kwh > highestDailyKwh) highestDailyKwh = d.kwh;
  }

  const hourSums = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
  for (const r of records) {
    hourSums[r.hourOfDay].sum += r.kwhUsed;
    hourSums[r.hourOfDay].count += 1;
  }
  const hourlyAverages = hourSums.map((h, hour) => ({
    hour,
    kwh: h.count > 0 ? round4(h.sum / h.count) : 0,
  }));

  let peakHour = 0;
  let peakAvg = -1;
  for (const h of hourlyAverages) {
    if (h.kwh > peakAvg) {
      peakAvg = h.kwh;
      peakHour = h.hour;
    }
  }

  const periodAcc = new Map();
  for (const p of tariff.periods) {
    periodAcc.set(p.id, { period: p, kwh: 0 });
  }
  for (const r of records) {
    const period = periodForHour(r.hourOfDay, tariff.periods);
    if (!period) continue;
    const entry = periodAcc.get(period.id);
    if (entry) entry.kwh += r.kwhUsed;
  }

  const periodTotals = [...periodAcc.values()].map(({ period, kwh }) => {
    const rounded = round4(kwh);
    const sharePercent =
      totalKwh > 0 ? round2((rounded / totalKwh) * 100) : 0;
    return {
      periodId: period.id,
      label: period.label,
      kwh: rounded,
      sharePercent,
      estimatedEnergyCharge: computeEnergyCharge(rounded, period, tariff),
    };
  });

  const { findings } = detectAnomalies(records);

  const thresholdWarnings = buildThresholdWarnings(records, tariff);

  const forecast = buildForecast({
    scenario,
    uniqueDays,
    averageDailyKwh,
    tariff,
  });

  const assumptions = [
    'Simulated readings',
    `Configured tariff profile (${tariff.verificationStatus})`,
    'Timestamp is the start of each one-hour interval (Asia/Kolkata)',
    'Period totals mapped from tariff.json hour rules, not CSV tariff_period labels',
  ];
  if (!isVerified(tariff)) {
    assumptions.push(
      'Energy charges withheld (null) because tariff verificationStatus is not verified'
    );
  }

  return {
    scenarioId: scenario.id,
    dataSource: scenario.dataSource,
    recordCount: records.length,
    summary: {
      totalKwh,
      averageDailyKwh,
      peakHour,
      highestDailyKwh: round4(highestDailyKwh),
    },
    dailyTotals,
    hourlyAverages,
    periodTotals,
    findings,
    thresholdWarnings,
    forecast,
    assumptions,
  };
}

function buildThresholdWarnings(records, tariff) {
  // Only emit warnings when thresholds exist and rules are verified.
  if (!isVerified(tariff)) return [];
  const thresholds = tariff.thresholds || [];
  if (thresholds.length === 0) return [];

  const warnings = [];
  // Placeholder for verified threshold rules — none configured in illustrative MVP.
  void records;
  void thresholds;
  return warnings;
}

function buildForecast({ scenario, uniqueDays, averageDailyKwh, tariff }) {
  const cycleDays = tariff.billingCycleDays || 60;
  const adequateHistory = uniqueDays >= 7 && scenario.id === 'demo-30day';

  if (!adequateHistory || averageDailyKwh == null) {
    return {
      available: false,
      method: 'average-daily-usage projection',
      projectedCycleKwh: null,
      estimatedEnergyCharge: null,
      notice:
        'Forecast hidden: insufficient history or test-only dataset. ' +
        'dev-200 is not suitable for a 30-day / billing-cycle projection.',
    };
  }

  const projectedCycleKwh = round4(averageDailyKwh * cycleDays);
  return {
    available: true,
    method: 'average-daily-usage projection',
    projectedCycleKwh,
    estimatedEnergyCharge: null,
    notice:
      'Projection from synthetic data using mean daily kWh × billingCycleDays; not a guarantee.',
  };
}

module.exports = { analyze, buildForecast };
