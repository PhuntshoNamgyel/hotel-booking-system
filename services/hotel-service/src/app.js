const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { hotelExists, listRooms, getRoom } = require('./rooms');
const { parseDateRange, parseId } = require('./validation');

const app = express();
app.use(cors());
app.use(express.json());

// Health check: also confirms the database is reachable.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'hotel-service' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'hotel-service', error: err.message });
  }
});

// List all hotels with the cheapest nightly price.
app.get('/hotels', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT h.id, h.name, h.city, h.description,
              MIN(r.price_per_night)::float AS "fromPrice"
         FROM hotels h
         LEFT JOIN rooms r ON r.hotel_id = h.id
        GROUP BY h.id
        ORDER BY h.id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Rooms of one hotel. With ?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD it also returns availableUnits.
app.get('/hotels/:id/rooms', async (req, res, next) => {
  try {
    const hotelId = parseId(req.params.id);
    if (!hotelId) return res.status(400).json({ error: 'Invalid hotel id' });

    const { range, error } = parseDateRange(req.query.checkIn, req.query.checkOut);
    if (error) return res.status(400).json({ error });

    if (!(await hotelExists(hotelId))) return res.status(404).json({ error: 'Hotel not found' });

    return res.json(await listRooms(hotelId, range));
  } catch (err) {
    return next(err);
  }
});

// One room type. Dates are optional, as above.
app.get('/rooms/:id', async (req, res, next) => {
  try {
    const roomId = parseId(req.params.id);
    if (!roomId) return res.status(400).json({ error: 'Invalid room id' });

    const { range, error } = parseDateRange(req.query.checkIn, req.query.checkOut);
    if (error) return res.status(400).json({ error });

    const room = await getRoom(roomId, range);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    return res.json(room);
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
  console.error(JSON.stringify({ level: 'error', service: 'hotel-service', message: err.message }));
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;