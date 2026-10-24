const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../../data');

/** Available demo scenarios. First entry is the default 30-day dataset. */
const SCENARIOS = [
  {
    id: 'demo-30day',
    label: '30-day simulated household',
    description:
      '720 hourly simulated records with example peaks and flexible load',
    recordCount: 720,
    dataSource: 'simulated',
    fileName: 'cliff_guard_demo_30day_720_hourly_records.csv',
  },
  {
    id: 'dev-200',
    label: '200-row development/test dataset',
    description:
      'Four short synthetic patterns for testing, not a full-month forecast',
    recordCount: 200,
    dataSource: 'simulated',
    fileName: 'cliff_guard_dev_200_hourly_records.csv',
  },
];

function getScenario(scenarioId) {
  return SCENARIOS.find((s) => s.id === scenarioId) || null;
}

function getScenarioFilePath(scenarioId) {
  const scenario = getScenario(scenarioId);
  if (!scenario) return null;
  return path.join(DATA_DIR, scenario.fileName);
}

module.exports = {
  SCENARIOS,
  DATA_DIR,
  getScenario,
  getScenarioFilePath,
};
