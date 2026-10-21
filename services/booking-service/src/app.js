// The REST API of the Booking Service.
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const bookings = require('./bookings');
const hotelClient = require('./hotelClient');
const { validateBooking, countNights } = require('./validation');
const { createLogger } = require('./messaging');

const logger = createLogger('booking-service');

// Builds the app. It is a function so later steps can pass in the RabbitMQ broker.
function createApp() {
  const app = express();
  app.use(cors()); // lets the React frontend (another port) call this API
  app.use(express.json()); // reads JSON request bodies into req.body

  // Health check: also confirms the database is reachable.
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'booking-service' });
    } catch (err) {
      res.status(503).json({ status: 'error', service: 'booking-service', error: err.message });
    }
  });

  // Create a booking. It starts as PENDING; events from Hotel and Payment decide the final status.
  app.post('/bookings', async (req, res, next) => {
    try {
      // 1. Check the input.
      const { errors, input } = validateBooking(req.body);
      if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

      // 2. Ask the Hotel Service for the price.
      let room;
      try {
        room = await hotelClient.getRoom(input.roomId, input.checkIn, input.checkOut);
      } catch (err) {
        logger.warn('Hotel service unavailable', { error: err.message });
        return res.status(503).json({ error: 'Hotel service unavailable' });
      }
      if (!room) return res.status(404).json({ error: 'Room not found' });
      // We do not check availableUnits here: the Hotel Service decides that through events.

      // 3. Price x nights, rounded to 2 decimals.
      const nights = countNights(input.checkIn, input.checkOut);
      const totalAmount = Math.round(room.pricePerNight * nights * 100) / 100;

      // 4. Save it as PENDING.
      const booking = await bookings.insertBooking({
        ...input,
        id: crypto.randomUUID(),
        hotelId: room.hotelId,
        totalAmount,
      });
      logger.info('Booking created', { bookingId: booking.id, totalAmount });

      return res.status(201).json(booking);
    } catch (err) {
      return next(err); // unexpected error, handled at the bottom
    }
  });

  // List bookings, newest first. Optional ?guestEmail=
  app.get('/bookings', async (req, res, next) => {
    try {
      res.json(await bookings.listBookings(req.query.guestEmail));
    } catch (err) {
      next(err);
    }
  });

  // One booking.
  app.get('/bookings/:id', async (req, res, next) => {
    try {
      const booking = await bookings.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      return res.json(booking);
    } catch (err) {
      return next(err);
    }
  });

  // Unknown route.
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Any error not handled above. A broken JSON body is the client's fault, so 400.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON' });
    }
    logger.error('Unhandled error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
