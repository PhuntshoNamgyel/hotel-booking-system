const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { listNotifications, listEvents } = require('./notifications');

const app = express();
app.use(cors());
app.use(express.json());

// Returns { value } (null when absent) or { error }.
function parseBookingId(raw) {
  if (raw === undefined) return { value: null };
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > 100) {
    return { error: 'Invalid bookingId' };
  }
  return { value: raw.trim() };
}

// Health check: also confirms the database is reachable.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'notification-service' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'notification-service', error: err.message });
  }
});

// Notification history, newest first. Optional ?bookingId= and ?limit=.
app.get('/notifications', async (req, res, next) => {
  try {
    const booking = parseBookingId(req.query.bookingId);
    if (booking.error) return res.status(400).json({ error: booking.error });

    let limit = 50;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ error: 'limit must be a whole number from 1 to 100' });
      }
    }
    return res.json(await listNotifications({ bookingId: booking.value, limit }));
  } catch (err) {
    return next(err);
  }
});

// Event timeline of one booking, oldest first. bookingId is required.
app.get('/events', async (req, res, next) => {
  try {
    const booking = parseBookingId(req.query.bookingId);
    if (booking.error) return res.status(400).json({ error: booking.error });
    if (booking.value === null) return res.status(400).json({ error: 'bookingId is required' });

    return res.json(await listEvents(booking.value));
  } catch (err) {
    return next(err);
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