// Reacts to the events on booking.q: the results from the Hotel and Payment services.
//
//   RoomReservationFailed -> booking FAILED (nothing published, Notification already got the event)
//   PaymentFailed         -> booking FAILED,    publish BookingFailed  (Hotel releases the room)
//   PaymentSucceeded      -> booking CONFIRMED, publish BookingConfirmed (event chaining)
const { processOnce, createLogger } = require('./messaging');
const bookings = require('./bookings');

const logger = createLogger('booking-service');

// Throws if a required field is missing. The shared library then retries 3 times
// and finally moves the message to the dead letter queue (booking.dlq).
function requireFields(data, fields) {
  const missing = fields.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
}

// The data of the event we publish next, taken from our own booking row
// (the Payment event does not carry room or dates).
function followUpData(eventType, booking) {
  if (eventType === 'BookingConfirmed') {
    return {
      bookingId: booking.id,
      roomId: booking.roomId,
      hotelId: booking.hotelId,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalAmount: booking.totalAmount,
    };
  }
  // BookingFailed
  return {
    bookingId: booking.id,
    roomId: booking.roomId,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    reason: booking.failureReason,
  };
}

function createHandlers({ pool, broker }) {
  // The shared steps of every handler:
  // 1. check the fields, 2. update the booking if it is PENDING, 3. publish the follow-up event.
  // Steps 2 and 3 run inside processOnce: one database transaction that also stores the eventId,
  // so the same event delivered twice changes nothing the second time.
  async function finishBooking(event, status, failureReason, followUpEvent, required) {
    const data = event.data || {};
    requireFields(data, required);
    const meta = { eventType: event.eventType, eventId: event.eventId, bookingId: data.bookingId };

    const outcome = await processOnce(pool, event, async (client) => {
      const booking = await bookings.finishPendingBooking(data.bookingId, status, failureReason, client);
      if (!booking) return null; // unknown booking, or already CONFIRMED/FAILED/CANCELLED

      if (followUpEvent) {
        // Published before the transaction commits. If publishing fails, the update is rolled back
        // and the retry starts clean. causedBy gives a retried publish the SAME eventId,
        // so the next service ignores the repeat.
        await broker.publish(followUpEvent, followUpData(followUpEvent, booking), { causedBy: event.eventId });
      }
      return booking;
    });

    if (outcome.duplicate) {
      logger.warn('Duplicate event ignored', meta);
    } else if (!outcome.result) {
      logger.warn('Booking not found or not PENDING, nothing changed', meta);
    } else {
      logger.info('Booking updated', { ...meta, status });
    }
  }

  // Failed events must carry a reason, because BookingFailed passes it on to Hotel and Notification.
  const handlers = {
    RoomReservationFailed: (event) =>
      finishBooking(event, 'FAILED', event.data && event.data.reason, null, ['bookingId', 'reason']),
    PaymentFailed: (event) =>
      finishBooking(event, 'FAILED', event.data && event.data.reason, 'BookingFailed', ['bookingId', 'reason']),
    PaymentSucceeded: (event) =>
      finishBooking(event, 'CONFIRMED', null, 'BookingConfirmed', ['bookingId']),
  };

  // Called by the shared library for every message on booking.q.
  async function handleEvent(event) {
    const handler = handlers[event.eventType];
    if (!handler) {
      logger.warn('Ignoring event type with no handler', { eventType: event.eventType, eventId: event.eventId });
      return;
    }
    await handler(event);
  }

  return { handleEvent };
}

module.exports = { createHandlers };
