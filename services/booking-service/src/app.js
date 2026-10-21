const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

// createApp builds the Express app. Later steps pass in the broker and the hotel client.
function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check: also confirms the database is reachable.
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'booking-service' });
    } catch (err) {
      res.status(503).json({ status: 'error', service: 'booking-service', error: err.message });
    }
  });

  // Unknown route.
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Any error that was not handled above. Bad JSON in the body becomes a 400.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON' });
    }
    console.error(JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      service: 'booking-service',
      message: err.message,
    }));
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
