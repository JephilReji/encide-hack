/**
 * Statistical peak / unusual-usage detection from kwh_used only.
 * Never uses is_injected_spike as an input feature.
 *
 * Method: per hour-of-day mean and sample standard deviation across the
 * dataset; flag intervals with z-score >= threshold (default 2.5).
 */

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleStdDev(values, avg = mean(values)) {
  if (values.length < 2) return 0;
  const sumSq = values.reduce((acc, v) => acc + (v - avg) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

function buildHourlyBaselines(records) {
  const byHour = new Map();
  for (const r of records) {
    const hour = r.hourOfDay;
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(r.kwhUsed);
  }

  const baselines = new Map();
  for (const [hour, values] of byHour.entries()) {
    const avg = mean(values);
    const std = sampleStdDev(values, avg);
    baselines.set(hour, { mean: avg, std, count: values.length });
  }
  return baselines;
}

function detectAnomalies(records, options = {}) {
  const zThreshold = options.zThreshold ?? 2.5;
  const baselines = buildHourlyBaselines(records);
  const findings = [];
  let findingIndex = 1;

  for (const r of records) {
    const baseline = baselines.get(r.hourOfDay);
    if (!baseline || baseline.count < 3 || baseline.std <= 0) continue;

    const z = (r.kwhUsed - baseline.mean) / baseline.std;
    if (z < zThreshold) continue;

    const deviationPercent =
      baseline.mean > 0
        ? Math.round(((r.kwhUsed - baseline.mean) / baseline.mean) * 10000) /
          100
        : null;

    findings.push({
      id: `finding-${findingIndex}`,
      type: 'unusual_usage',
      severity: z >= 3.5 ? 'warning' : 'info',
      title: `Higher-than-usual use at hour ${r.hourOfDay}`,
      timestamp: r.timestamp,
      observedKwh: round4(r.kwhUsed),
      baselineKwh: round4(baseline.mean),
      deviationPercent,
      explanation:
        `Interval kWh is ${round4(z)} standard deviations above the ` +
        `hour-${r.hourOfDay} mean for this dataset (z-score threshold ${zThreshold}). ` +
        'Detection uses kwh_used only; injected-spike labels are not used as inputs.',
    });
    findingIndex += 1;
  }

  return { findings, baselines };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = {
  mean,
  sampleStdDev,
  buildHourlyBaselines,
  detectAnomalies,
};
