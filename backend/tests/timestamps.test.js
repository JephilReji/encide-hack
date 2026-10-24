const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTimestamp,
  loadScenarioRecords,
} = require('../src/services/dataLoader');
const { extractHourOfDay, periodForTimestamp } = require('../src/services/tariffService');

describe('timestamp interval-start convention', () => {
  it('normalizes CSV timestamps to include seconds', () => {
    assert.equal(
      normalizeTimestamp('2026-09-01T00:00+05:30'),
      '2026-09-01T00:00:00+05:30'
    );
    assert.equal(
      normalizeTimestamp('2026-09-01T19:00:00+05:30'),
      '2026-09-01T19:00:00+05:30'
    );
  });

  it('extracts hour-of-day from IST offset strings without shifting to UTC day', () => {
    assert.equal(extractHourOfDay('2026-09-01T00:00:00+05:30'), 0);
    assert.equal(extractHourOfDay('2026-09-01T19:00:00+05:30'), 19);
    assert.equal(extractHourOfDay('2026-09-01T22:00+05:30'), 22);
  });

  it('treats timestamp as interval start for period mapping', () => {
    // Hour 18 starts peak window [18, 22)
    assert.equal(
      periodForTimestamp('2026-09-01T18:00:00+05:30').id,
      'peak'
    );
    // Hour 22 starts off-peak
    assert.equal(
      periodForTimestamp('2026-09-01T22:00:00+05:30').id,
      'off_peak'
    );
  });

  it('loads demo-30day with 720 records and no is_injected_spike on public shape', () => {
    const { records } = loadScenarioRecords('demo-30day');
    assert.equal(records.length, 720);
    assert.equal(records[0].timestamp, '2026-09-01T00:00:00+05:30');
    assert.ok(!('is_injected_spike' in records[0]));
    assert.ok(!('isInjectedSpike' in records[0]));
  });
});
