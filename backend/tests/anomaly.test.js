const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { detectAnomalies } = require('../src/services/anomalyDetection');
const { loadScenarioRecords } = require('../src/services/dataLoader');
const { analyze } = require('../src/services/analyzeService');

describe('anomaly detection', () => {
  it('detects spikes from kwh_used and never requires is_injected_spike', () => {
    const records = [
      // hour 19 baseline ~0.5
      ...Array.from({ length: 10 }, (_, i) => ({
        hourOfDay: 19,
        kwhUsed: 0.5,
        timestamp: `2026-09-${String(i + 1).padStart(2, '0')}T19:00:00+05:30`,
        _isInjectedSpike: false,
      })),
      {
        hourOfDay: 19,
        kwhUsed: 2.5,
        timestamp: '2026-09-15T19:00:00+05:30',
        _isInjectedSpike: false, // even without injected label
      },
    ];

    const { findings } = detectAnomalies(records, { zThreshold: 2.5 });
    assert.ok(findings.length >= 1);
    assert.equal(findings[0].timestamp, '2026-09-15T19:00:00+05:30');
    assert.equal(findings[0].type, 'unusual_usage');
  });

  it('does not use is_injected_spike as detection input on demo data', () => {
    const { records } = loadScenarioRecords('demo-30day');
    const injected = records.filter((r) => r._isInjectedSpike);
    assert.ok(injected.length > 0, 'demo dataset should contain injected spikes for eval only');

    const { findings } = detectAnomalies(records);
    // Detector must run solely on kwh; findings should reference observedKwh
    for (const f of findings) {
      assert.ok(typeof f.observedKwh === 'number');
      assert.ok(typeof f.baselineKwh === 'number');
      assert.match(f.explanation, /kwh_used only/i);
    }
  });

  it('analyze returns dynamically computed totals that sum to totalKwh', () => {
    const result = analyze({
      scenarioId: 'demo-30day',
      tariffProfileId: 'kseb-domestic-demo',
    });
    assert.equal(result.recordCount, 720);
    assert.ok(result.summary.totalKwh > 0);
    const periodSum = result.periodTotals.reduce((s, p) => s + p.kwh, 0);
    assert.ok(Math.abs(periodSum - result.summary.totalKwh) < 0.01);
    assert.equal(
      result.periodTotals.every((p) => p.estimatedEnergyCharge === null),
      true
    );
  });
});
