const express = require('express');
const { optimize } = require('../services/optimizeService');

const router = express.Router();

router.post('/optimize', (req, res, next) => {
  try {
    const result = optimize(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
