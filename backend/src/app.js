const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { errorBody } = require('./services/errors');

const healthRoutes = require('./routes/health');
const demoRoutes = require('./routes/demo');
const tariffRoutes = require('./routes/tariff');
const analyzeRoutes = require('./routes/analyze');
const optimizeRoutes = require('./routes/optimize');
const adviceRoutes = require('./routes/advice');

function createApp() {
  const app = express();

  app.use(cors({ origin: [
    'http://localhost:5173',
    'https://localhost',        // Capacitor Android
    'http://localhost'
  ]}));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRoutes);
  app.use('/api', demoRoutes);
  app.use('/api', tariffRoutes);
  app.use('/api', analyzeRoutes);
  app.use('/api', optimizeRoutes);
  app.use('/api', adviceRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody('NOT_FOUND', 'API route not found'));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
