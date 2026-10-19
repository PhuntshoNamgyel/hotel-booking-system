const { processOnce, createLogger } = require('./messaging');
const { reserveRoom, updateStatus } = require('./reservations');

// Throws if a required field is missing. The shared consumer retries, then dead-letters.
function requireFields(data, fields) {
  const missing = fields.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
}

function createHandlers({ pool, broker }) {
  const logger = createLogger('hotel-service');
  const meta = (event) => ({ eventType: event.eventType, eventId: event.eventId, bookingId: event.correlationId });

  // BookingCreated: try to hold the room, then publish the outcome (event chaining).
  async function handleBookingCreated(event) {
    const data = event.data || {};
    requireFields(data, ['bookingId', 'roomId', 'hotelId', 'guestName', 'guestEmail', 'checkIn', 'checkOut', 'totalAmount']);

    const outcome = await processOnce(pool, event, async (client) => {
      const result = await reserveRoom(client, data);
      if (result.ok) {
        await broker.publish(
          'RoomReserved',
          {
            bookingId: data.bookingId,
            roomId: data.roomId,
            hotelId: data.hotelId,
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            checkIn: data.checkIn,
            checkOut: data.checkOut,
            totalAmount: data.totalAmount,
          },
          { causedBy: event.eventId }
        );
      } else {
        await broker.publish(
          'RoomReservationFailed',
          {
            bookingId: data.bookingId,
            roomId: data.roomId,
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            reason: result.reason,
          },
          { causedBy: event.eventId }
        );
      }
      return result;
    });

    if (outcome.duplicate) logger.warn('Duplicate event ignored', meta(event));
    else logger.info('Reservation processed', { ...meta(event), reserved: outcome.result.ok });
  }

  // Builds a handler that moves a reservation to a new status.
  function statusHandler(newStatus, fromStatuses) {
    return async (event) => {
      const data = event.data || {};
      requireFields(data, ['bookingId']);
      const outcome = await processOnce(pool, event, (client) =>
        updateStatus(client, data.bookingId, newStatus, fromStatuses)
      );
      if (outcome.duplicate) logger.warn('Duplicate event ignored', meta(event));
      else logger.info('Reservation status updated', { ...meta(event), newStatus, rowsChanged: outcome.result });
    };
  }

  const handlers = {
    BookingCreated: handleBookingCreated,
    BookingConfirmed: statusHandler('CONFIRMED', ['HELD']),
    BookingFailed: statusHandler('RELEASED', ['HELD', 'CONFIRMED']),
    BookingCancelled: statusHandler('RELEASED', ['HELD', 'CONFIRMED']),
  };

  // Called by the shared consumer for every message on hotel.q.
  async function handleEvent(event) {
    const handler = handlers[event.eventType];
    if (!handler) {
      logger.warn('Ignoring unknown event type', meta(event));
      return;
    }
    await handler(event);
  }

  return { handleEvent };
}

module.exports = { createHandlers };