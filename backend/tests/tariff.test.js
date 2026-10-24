const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  periodForHour,
  loadTariffConfig,
  computeEnergyCharge,
  computeIllustrativeCharge,
  isVerified,
} = require('../src/services/tariffService');

describe('tariff period boundaries', () => {
  const tariff = loadTariffConfig();
  const periods = tariff.periods;

  it('maps 6 inclusive to normal_daytime and 17 to normal_daytime', () => {
    assert.equal(periodForHour(6, periods).id, 'normal_daytime');
    assert.equal(periodForHour(17, periods).id, 'normal_daytime');
  });

  it('maps 18 inclusive to peak and 21 to peak; 22 starts off_peak', () => {
    assert.equal(periodForHour(18, periods).id, 'peak');
    assert.equal(periodForHour(21, periods).id, 'peak');
    assert.equal(periodForHour(22, periods).id, 'off_peak');
  });

  it('maps wrapping off_peak 22–5 and excludes 6', () => {
    assert.equal(periodForHour(23, periods).id, 'off_peak');
    assert.equal(periodForHour(0, periods).id, 'off_peak');
    assert.equal(periodForHour(5, periods).id, 'off_peak');
    assert.notEqual(periodForHour(6, periods).id, 'off_peak');
  });

  it('withholds verified energy charges when profile is illustrative', () => {
    assert.equal(isVerified(tariff), false);
    const peak = periodForHour(19, periods);
    assert.equal(computeEnergyCharge(1, peak, tariff), null);
    assert.ok(computeIllustrativeCharge(1, peak, tariff) > 0);
  });
});
