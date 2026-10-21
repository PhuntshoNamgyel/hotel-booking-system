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

// Builds the app. The RabbitMQ broker is passed in, so tests can pass a fake one.
function createApp({ broker } = {}) {
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

      // 5. Publish BookingCreated. This starts the event chain:
      //    Hotel holds the room -> Payment charges -> we confirm.
      //    The event carries everything Hotel and Notification need, so they never call us back.
      try {
        await broker.publish('BookingCreated', {
          bookingId: booking.id,
          roomId: booking.roomId,
          hotelId: booking.hotelId,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          totalAmount: booking.totalAmount,
        });
      } catch (err) {
        // RabbitMQ is down: nobody will ever hear about this booking, so it cannot stay PENDING.
        await bookings.markPublishFailed(booking.id);
        logger.error('Could not publish BookingCreated, booking marked FAILED', {
          bookingId: booking.id,
          error: err.message,
        });
        return res.status(503).json({ error: 'Message broker unavailable' });
      }

      // 6. Answer the guest. The status is still PENDING; the frontend polls for the result.
      return res.status(201).json(booking);
    } catch (err) {
      return next(err); // unexpected error, handled at the bottom
    }
  });

  // List bookings, newest first. Optional ?guestEmail=
  app.get('/bookings', async (req, res, next) => {
    try {
      // ?guestEmail=a&guestEmail=b would arrive as a list, so only accept one plain value.
      const { guestEmail } = req.query;
      if (guestEmail !== undefined && typeof guestEmail !== 'string') {
        return res.status(400).json({ error: 'guestEmail must be a single value' });
      }
      return res.json(await bookings.listBookings(guestEmail));
    } catch (err) {
      return next(err);
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

  // Cancel a booking. Only CONFIRMED bookings can be cancelled (a PENDING one may still be paying).
  // The update and the publish happen in one transaction: if BookingCancelled cannot be published,
  // the update is rolled back, so the booking stays CONFIRMED and Hotel keeps the room.
  app.post('/bookings/:id/cancel', async (req, res, next) => {
    let client;
    try {
      client = await pool.connect(); // one connection for the whole transaction
      await client.query('BEGIN');
      const booking = await bookings.cancelConfirmedBooking(req.params.id, client);

      if (!booking) {
        // Nothing changed: either the booking does not exist, or it is not CONFIRMED.
        await client.query('ROLLBACK');
        const existing = await bookings.getBookingById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Booking not found' });
        return res.status(409).json({ error: 'Only confirmed bookings can be cancelled' });
      }

      try {
        // Hotel releases the room, Payment refunds, Notification tells the guest.
        await broker.publish('BookingCancelled', {
          bookingId: booking.id,
          roomId: booking.roomId,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Could not publish BookingCancelled, cancel undone', { bookingId: booking.id, error: err.message });
        return res.status(503).json({ error: 'Message broker unavailable' });
      }

      await client.query('COMMIT');
      logger.info('Booking cancelled', { bookingId: booking.id });
      return res.json(booking);
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {}); // undo anything half done
      return next(err);
    } finally {
      if (client) client.release(); // always give the connection back to the pool
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
