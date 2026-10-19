// One topic exchange carries every event. Each service binds its own queue to it.
const EXCHANGE = 'hotel.events';
// Messages that fail all retries are routed here and end up in "<service>.dlq".
const DLX = 'hotel.dlx';

// Event name -> routing key. Matches docs/event-contracts.md.
const EVENTS = {
  BookingCreated: 'booking.created',
  RoomReserved: 'room.reserved',
  RoomReservationFailed: 'room.reservation_failed',
  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  BookingConfirmed: 'booking.confirmed',
  BookingFailed: 'booking.failed',
  BookingCancelled: 'booking.cancelled',
};

module.exports = { EXCHANGE, DLX, EVENTS };