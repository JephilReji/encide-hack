const express = require('express');
const { getAdvice } = require('../services/adviceService');

const router = express.Router();

router.post('/advice', async (req, res, next) => {
  try {
    const result = await getAdvice(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
