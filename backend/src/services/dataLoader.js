const fs = require('fs');
const { parse } = require('csv-parse/sync');
const {
  getScenario,
  getScenarioFilePath,
  SCENARIOS,
} = require('../config/scenarios');
const { ApiError } = require('./errors');

const cache = new Map();

/**
 * Normalize CSV timestamp to contract form with seconds: YYYY-MM-DDTHH:mm:ss+05:30
 */
function normalizeTimestamp(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new ApiError(500, 'DATA_ERROR', 'Missing timestamp in dataset');
  }
  // Already has seconds: 2026-09-01T00:00:00+05:30
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }
  // CSV form: 2026-09-01T00:00+05:30
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})([+-]\d{2}:\d{2})$/
  );
  if (m) {
    return `${m[1]}:00${m[2]}`;
  }
  throw new ApiError(500, 'DATA_ERROR', `Unrecognized timestamp format: ${raw}`);
}

function extractDate(normalizedTimestamp) {
  return normalizedTimestamp.slice(0, 10);
}

function toNumber(value, field) {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) {
    throw new ApiError(500, 'DATA_ERROR', `Invalid numeric field ${field}`);
  }
  return n;
}

function cell(row, key) {
  if (row[key] !== undefined) return row[key];
  // Tolerate BOM-prefixed first column if a parser leaves it intact.
  const bomKey = `\uFEFF${key}`;
  if (row[bomKey] !== undefined) return row[bomKey];
  return undefined;
}

function mapRow(row) {
  const timestamp = normalizeTimestamp(cell(row, 'timestamp'));
  return {
    recordId: cell(row, 'record_id'),
    timestamp,
    date: cell(row, 'date') || extractDate(timestamp),
    hourOfDay: Number.parseInt(cell(row, 'hour_of_day'), 10),
    kwhUsed: toNumber(cell(row, 'kwh_used'), 'kwh_used'),
    baseHouseholdKwh: toNumber(
      cell(row, 'base_household_kwh'),
      'base_household_kwh'
    ),
    shiftableLoadKwh: toNumber(
      cell(row, 'shiftable_load_kwh'),
      'shiftable_load_kwh'
    ),
    tariffPeriodLabel: cell(row, 'tariff_period'),
    dataSource: cell(row, 'data_source') || 'simulated',
    // is_injected_spike intentionally omitted from public records;
    // retained only for optional test evaluation via internal flag.
    _isInjectedSpike:
      cell(row, 'is_injected_spike') === '1' ||
      cell(row, 'is_injected_spike') === 'true' ||
      cell(row, 'is_injected_spike') === true,
  };
}

function toPublicRecord(record) {
  return {
    recordId: record.recordId,
    timestamp: record.timestamp,
    kwhUsed: record.kwhUsed,
    baseHouseholdKwh: record.baseHouseholdKwh,
    shiftableLoadKwh: record.shiftableLoadKwh,
    tariffPeriodLabel: record.tariffPeriodLabel,
  };
}

function loadScenarioRecords(scenarioId) {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    throw new ApiError(
      400,
      'UNKNOWN_SCENARIO',
      `Unknown scenarioId: ${scenarioId}`
    );
  }

  if (cache.has(scenarioId)) {
    return { scenario, records: cache.get(scenarioId) };
  }

  const filePath = getScenarioFilePath(scenarioId);
  if (!fs.existsSync(filePath)) {
    throw new ApiError(
      500,
      'DATA_MISSING',
      `Dataset file not found for scenario ${scenarioId}`
    );
  }

  // Strip UTF-8 BOM so the first column header is exactly "record_id".
  const csvText = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const records = rows.map(mapRow);
  cache.set(scenarioId, records);
  return { scenario, records };
}

function listScenarios() {
  return SCENARIOS.map(
    ({ id, label, description, recordCount, dataSource }) => ({
      id,
      label,
      description,
      recordCount,
      dataSource,
    })
  );
}

function clearCache() {
  cache.clear();
}

module.exports = {
  loadScenarioRecords,
  listScenarios,
  toPublicRecord,
  normalizeTimestamp,
  extractDate,
  clearCache,
};
