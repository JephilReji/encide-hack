const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { optimize } = require('../src/services/optimizeService');
const { loadScenarioRecords } = require('../src/services/dataLoader');
const { ApiError } = require('../src/services/errors');

describe('load shifting optimizer', () => {
  it('preserves total kWh and recalculates illustrative charges', () => {
    const { records } = loadScenarioRecords('demo-30day');
    const source = records.find(
      (r) =>
        r.shiftableLoadKwh > 0.2 &&
        r.hourOfDay >= 18 &&
        r.hourOfDay < 22
    );
    assert.ok(source, 'expected a peak-hour shiftable row');

    const target = records.find(
      (r) =>
        r.date === source.date &&
        (r.hourOfDay >= 22 || r.hourOfDay < 6) &&
        r.recordId !== source.recordId
    );
    assert.ok(target, 'expected off-peak target on the same calendar date');

    const shiftKwh = Math.round(source.shiftableLoadKwh * 10000) / 10000;
    const result = optimize({
      scenarioId: 'demo-30day',
      tariffProfileId: 'kseb-domestic-demo',
      date: source.date,
      sourceTimestamp: source.timestamp,
      targetTimestamp: target.timestamp,
      shiftKwh,
    });

    assert.equal(result.totalKwhBefore, shiftKwh);
    assert.equal(result.totalKwhAfter, shiftKwh);
    assert.equal(result.totalKwhBefore, result.totalKwhAfter);
    assert.equal(result.sourcePeriod, 'peak');
    assert.equal(result.targetPeriod, 'off_peak');
    assert.ok(result.estimatedEnergyChargeBefore > result.estimatedEnergyChargeAfter);
    assert.ok(result.estimatedSavings > 0);
    assert.match(result.note, /illustrative/i);
  });

  it('rejects shift larger than available shiftable load', () => {
    const { records } = loadScenarioRecords('demo-30day');
    const source = records.find((r) => r.shiftableLoadKwh > 0);
    const target = records.find(
      (r) => r.timestamp !== source.timestamp && r.date === source.date
    );

    assert.throws(
      () =>
        optimize({
          scenarioId: 'demo-30day',
          tariffProfileId: 'kseb-domestic-demo',
          date: source.date,
          sourceTimestamp: source.timestamp,
          targetTimestamp: target.timestamp,
          shiftKwh: source.shiftableLoadKwh + 1,
        }),
      (err) => err instanceof ApiError && err.code === 'INSUFFICIENT_SHIFTABLE_LOAD'
    );
  });
});
