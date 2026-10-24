const path = require('path');
const fs = require('fs');

const TARIFF_PATH = path.join(__dirname, '../config/tariff.json');

let cachedTariff = null;

function loadTariffConfig() {
  if (!cachedTariff) {
    const raw = fs.readFileSync(TARIFF_PATH, 'utf8');
    cachedTariff = JSON.parse(raw);
  }
  return cachedTariff;
}

/** Reset cache — used by tests. */
function resetTariffCache() {
  cachedTariff = null;
}

/**
 * Resolve ToD period for an hour-of-day (0–23).
 * Periods with startHour > endHour wrap midnight (e.g. 22→6).
 * Matching uses [startHour, endHour) for non-wrapping ranges.
 */
function periodForHour(hour, periods) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }
  for (const period of periods) {
    const { startHour, endHour } = period;
    if (startHour === endHour) {
      continue;
    }
    if (startHour < endHour) {
      if (hour >= startHour && hour < endHour) return period;
    } else if (hour >= startHour || hour < endHour) {
      return period;
    }
  }
  return null;
}

function periodForTimestamp(isoTimestamp, tariff = loadTariffConfig()) {
  const hour = extractHourOfDay(isoTimestamp);
  return periodForHour(hour, tariff.periods);
}

/**
 * Extract hour-of-day in Asia/Kolkata from an ISO-like timestamp string.
 * Prefers parsing the offset-bearing string; falls back to hour field in string.
 */
function extractHourOfDay(isoTimestamp) {
  if (typeof isoTimestamp !== 'string') {
    throw new Error('timestamp must be a string');
  }
  const match = isoTimestamp.match(/T(\d{2}):/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp: ${isoTimestamp}`);
  }
  // Convert to IST (+05:30)
  const istMs = d.getTime() + (5.5 * 60 * 60 * 1000 - d.getTimezoneOffset() * 60 * 1000);
  // Simpler: use UTC parts after shifting by +05:30 from absolute instant
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.getUTCHours();
}

function isVerified(tariff = loadTariffConfig()) {
  return tariff.verificationStatus === 'verified';
}

/**
 * Illustrative energy charge for kWh in a period.
 * Returns null when profile is not verified (analyze path).
 * Optimizer may still compute illustrative charges via computeIllustrativeCharge.
 */
function computeEnergyCharge(kwh, period, tariff = loadTariffConfig()) {
  if (!isVerified(tariff)) return null;
  return computeIllustrativeCharge(kwh, period, tariff);
}

function computeIllustrativeCharge(kwh, period, tariff = loadTariffConfig()) {
  if (!period || typeof kwh !== 'number' || Number.isNaN(kwh)) return null;
  const base = tariff.illustrativeBaseRateInrPerKwh;
  if (typeof base !== 'number') return null;
  return roundMoney(kwh * base * period.multiplier);
}

function roundMoney(value) {
  return Math.round(value * 10000) / 10000;
}

function getPublicTariff(tariff = loadTariffConfig()) {
  return {
    profileId: tariff.profileId,
    displayName: tariff.displayName,
    verificationStatus: tariff.verificationStatus,
    effectiveFrom: tariff.effectiveFrom,
    effectiveTo: tariff.effectiveTo,
    sourceName: tariff.sourceName,
    eligibilityNote: tariff.eligibilityNote,
    billingCycleDays: tariff.billingCycleDays,
    periods: tariff.periods.map((p) => ({
      id: p.id,
      label: p.label,
      startHour: p.startHour,
      endHour: p.endHour,
      multiplier: p.multiplier,
    })),
    thresholds: Array.isArray(tariff.thresholds) ? tariff.thresholds : [],
  };
}

function getTariffById(profileId) {
  const tariff = loadTariffConfig();
  if (profileId && profileId !== tariff.profileId) {
    return null;
  }
  return tariff;
}

module.exports = {
  loadTariffConfig,
  resetTariffCache,
  periodForHour,
  periodForTimestamp,
  extractHourOfDay,
  isVerified,
  computeEnergyCharge,
  computeIllustrativeCharge,
  getPublicTariff,
  getTariffById,
  roundMoney,
};
