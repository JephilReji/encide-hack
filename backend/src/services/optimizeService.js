const { loadScenarioRecords, normalizeTimestamp } = require('./dataLoader');
const {
  getTariffById,
  periodForTimestamp,
  computeIllustrativeCharge,
  isVerified,
  roundMoney,
} = require('./tariffService');
const { ApiError } = require('./errors');

const KWH_TOLERANCE = 1e-9;

function normalizeFlexible(ts) {
  if (typeof ts !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'timestamp must be a string');
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(ts)) {
    return ts;
  }
  return normalizeTimestamp(ts);
}

function optimize(body) {
  const {
    scenarioId,
    tariffProfileId,
    date,
    sourceTimestamp,
    targetTimestamp,
    shiftKwh,
  } = body || {};

  if (!scenarioId || typeof scenarioId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'scenarioId is required');
  }
  if (!tariffProfileId || typeof tariffProfileId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'tariffProfileId is required');
  }
  if (!date || typeof date !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'date is required (YYYY-MM-DD)');
  }
  if (!sourceTimestamp || typeof sourceTimestamp !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'sourceTimestamp is required');
  }
  if (!targetTimestamp || typeof targetTimestamp !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'targetTimestamp is required');
  }
  if (typeof shiftKwh !== 'number' || Number.isNaN(shiftKwh) || shiftKwh <= 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'shiftKwh must be a positive number'
    );
  }

  const tariff = getTariffById(tariffProfileId);
  if (!tariff) {
    throw new ApiError(
      400,
      'UNKNOWN_TARIFF',
      `Unknown tariffProfileId: ${tariffProfileId}`
    );
  }

  let sourceTs;
  let targetTs;
  try {
    sourceTs = normalizeFlexible(sourceTimestamp);
    targetTs = normalizeFlexible(targetTimestamp);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      err.message || 'Invalid timestamp'
    );
  }

  if (sourceTs === targetTs) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'sourceTimestamp and targetTimestamp must differ'
    );
  }

  const { scenario, records } = loadScenarioRecords(scenarioId);
  const source = records.find((r) => r.timestamp === sourceTs);
  const target = records.find((r) => r.timestamp === targetTs);

  if (!source) {
    throw new ApiError(
      400,
      'SOURCE_NOT_FOUND',
      `No record for sourceTimestamp ${sourceTs}`
    );
  }
  if (!target) {
    throw new ApiError(
      400,
      'TARGET_NOT_FOUND',
      `No record for targetTimestamp ${targetTs}`
    );
  }

  if (source.date !== date && !sourceTs.startsWith(date)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `sourceTimestamp does not match date ${date}`
    );
  }

  if (shiftKwh - source.shiftableLoadKwh > KWH_TOLERANCE) {
    throw new ApiError(
      400,
      'INSUFFICIENT_SHIFTABLE_LOAD',
      `Requested shiftKwh ${shiftKwh} exceeds available shiftable_load_kwh ${source.shiftableLoadKwh} at source`
    );
  }

  const sourcePeriod = periodForTimestamp(sourceTs, tariff);
  const targetPeriod = periodForTimestamp(targetTs, tariff);

  if (!sourcePeriod || !targetPeriod) {
    throw new ApiError(
      400,
      'PERIOD_UNRESOLVED',
      'Could not map source or target hour to a configured tariff period'
    );
  }

  // Preserve total kWh: move shiftKwh from source to target.
  const totalKwhBefore = shiftKwh;
  const totalKwhAfter = shiftKwh;
  if (Math.abs(totalKwhBefore - totalKwhAfter) > KWH_TOLERANCE) {
    throw new ApiError(500, 'INVARIANT_VIOLATION', 'Total kWh not preserved');
  }

  const chargeBefore = computeIllustrativeCharge(
    shiftKwh,
    sourcePeriod,
    tariff
  );
  const chargeAfter = computeIllustrativeCharge(shiftKwh, targetPeriod, tariff);

  let estimatedSavings = null;
  if (chargeBefore != null && chargeAfter != null) {
    const delta = roundMoney(chargeBefore - chargeAfter);
    estimatedSavings = delta > 0 ? delta : 0;
  }

  const verified = isVerified(tariff);
  const noteParts = [
    'Flexible load moved between intervals; total shifted kWh unchanged.',
  ];
  if (!verified) {
    noteParts.push(
      `Tariff profile is ${tariff.verificationStatus}: charges use illustrativeBaseRateInrPerKwh × period multipliers from tariff.json — not official KSEB rates.`
    );
  }
  if (estimatedSavings === 0) {
    noteParts.push(
      'No savings claimed because the calculated charge did not decrease.'
    );
  }

  return {
    dataSource: scenario.dataSource,
    totalKwhBefore,
    totalKwhAfter,
    sourcePeriod: sourcePeriod.id,
    targetPeriod: targetPeriod.id,
    estimatedEnergyChargeBefore: chargeBefore,
    estimatedEnergyChargeAfter: chargeAfter,
    estimatedSavings,
    currency: tariff.currency || 'INR',
    note: noteParts.join(' '),
  };
}

module.exports = { optimize, KWH_TOLERANCE, normalizeFlexible };
