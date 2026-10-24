const express = require('express');
const {
  listScenarios,
  loadScenarioRecords,
  toPublicRecord,
} = require('../services/dataLoader');
const { ApiError } = require('../services/errors');

const router = express.Router();

router.get('/demo/scenarios', (_req, res) => {
  res.json({ scenarios: listScenarios() });
});

router.get('/demo/readings', (req, res, next) => {
  try {
    const scenarioId = req.query.scenarioId;
    if (!scenarioId || typeof scenarioId !== 'string') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Query parameter scenarioId is required'
      );
    }

    const { scenario, records } = loadScenarioRecords(scenarioId);
    res.json({
      scenarioId: scenario.id,
      dataSource: scenario.dataSource,
      intervalConvention: 'timestamp-is-interval-start',
      records: records.map(toPublicRecord),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
