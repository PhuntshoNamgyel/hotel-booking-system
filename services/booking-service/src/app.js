const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const bookings = require('./bookings');
const { validateBookingInput, countNights } = require('./validation');
const { createHotelClient, HotelUnavailableError } = require('./hotelClient');
const { createLogger } = require('./messaging');

const logger = createLogger('booking-service');

// createApp builds the Express app. Tests pass in a fake hotel client.
function createApp({ hotelClient = createHotelClient() } = {}) {
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

  // Create a booking. It starts as PENDING; events decide the final status.
  app.post('/bookings', async (req, res, next) => {
    try {
      const { value, errors } = validateBookingInput(req.body);
      if (errors) return res.status(400).json({ error: errors.join('; '), details: errors });

      // Ask the Hotel Service for the price. Availability is decided later through events.
      let room;
      try {
        room = await hotelClient.getRoom(value.roomId, value.checkIn, value.checkOut);
      } catch (err) {
        if (err instanceof HotelUnavailableError) {
          logger.warn('Hotel service unavailable', { roomId: value.roomId, error: err.message });
          return res.status(503).json({ error: 'Hotel service unavailable' });
        }
        throw err;
      }
      if (!room) return res.status(404).json({ error: 'Room not found' });

      const nights = countNights(value.checkIn, value.checkOut);
      const totalAmount = Math.round(room.pricePerNight * nights * 100) / 100;

      const booking = await bookings.insertBooking({
        id: crypto.randomUUID(),
        ...value,
        hotelId: room.hotelId,
        totalAmount,
      });
      logger.info('Booking created', { bookingId: booking.id, roomId: booking.roomId, totalAmount });

      return res.status(201).json(booking);
    } catch (err) {
      return next(err);
    }
  });

  // List bookings, newest first. Optional ?guestEmail= filter.
  app.get('/bookings', async (req, res, next) => {
    try {
      const guestEmail = typeof req.query.guestEmail === 'string' ? req.query.guestEmail.trim() : undefined;
      res.json(await bookings.listBookings({ guestEmail }));
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

  // Any error that was not handled above. Bad JSON in the body becomes a 400.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON' });
    }
    logger.error('Unhandled error', { error: err.message, path: req.path });
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
