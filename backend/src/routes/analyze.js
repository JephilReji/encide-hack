const express = require('express');
const { analyze } = require('../services/analyzeService');

const router = express.Router();

router.post('/analyze', (req, res, next) => {
  try {
    const result = analyze(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
