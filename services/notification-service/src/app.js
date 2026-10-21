const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Health check: also confirms the database is reachable.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'notification-service' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'notification-service', error: err.message });
  }
});

// Unknown route.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Any error that was not handled above.
app.use((err, req, res, next) => {
  console.error(JSON.stringify({ level: 'error', service: 'notification-service', message: err.message }));
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;