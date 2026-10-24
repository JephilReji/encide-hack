const express = require('express');
const { getPublicTariff } = require('../services/tariffService');

const router = express.Router();

router.get('/tariff', (_req, res) => {
  res.json(getPublicTariff());
});

module.exports = router;
