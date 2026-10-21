const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { listPayments, getPayment } = require('./payments');
const adminState = require('./adminState');

const app = express();
app.use(cors());
app.use(express.json());

// Health check: also confirms the database is reachable.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'payment-service' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'payment-service', error: err.message });
  }
});

// List payments, newest first (max 50). Optional ?bookingId=
app.get('/payments', async (req, res, next) => {
  try {
    const { bookingId } = req.query;
    if (bookingId !== undefined && typeof bookingId !== 'string') {
      return res.status(400).json({ error: 'bookingId must be a single text value' });
    }
    return res.json(await listPayments(bookingId || undefined));
  } catch (err) {
    return next(err);
  }
});

// One payment by id.
app.get('/payments/:id', async (req, res, next) => {
  try {
    const payment = await getPayment(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    return res.json(payment);
  } catch (err) {
    return next(err);
  }
});

// Demo switch: make every payment fail.
app.get('/admin/failure-mode', (req, res) => {
  res.json({ enabled: adminState.getFailureMode() });
});

app.post('/admin/failure-mode', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false' });
  }
  adminState.setFailureMode(enabled);
  return res.json({ enabled });
});

// Demo switch: the next N payment attempts throw a simulated error (to show retries).
app.get('/admin/transient-errors', (req, res) => {
  res.json({ remaining: adminState.getTransientErrors() });
});

app.post('/admin/transient-errors', (req, res) => {
  const { count } = req.body || {};
  if (!Number.isInteger(count) || count < 0 || count > 10) {
    return res.status(400).json({ error: 'count must be a whole number from 0 to 10' });
  }
  adminState.setTransientErrors(count);
  return res.json({ remaining: count });
});

// Unknown route.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Any error that was not handled above.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      service: 'payment-service',
      message: err.message,
    })
  );
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;