// Turns an event into the notification a guest would read.
// Pure function: no database, no network, so it is easy to test.

const REASONS = {
  ROOM_UNAVAILABLE: 'the room was no longer available',
  PAYMENT_DECLINED: 'the payment was declined',
};

function reasonText(reason) {
  return REASONS[reason] || 'an unexpected problem';
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
}

const TEMPLATES = {
  BookingCreated: (d) => ({
    title: 'Booking request received',
    message: `Hello ${d.guestName}, we received your request to stay from ${d.checkIn} to ${d.checkOut} (total ${money(d.totalAmount)}). We are checking the room now.`,
  }),
  RoomReserved: (d) => ({
    title: 'Room held',
    message: `A room is being held for ${d.guestName} from ${d.checkIn} to ${d.checkOut}. Waiting for payment.`,
  }),
  RoomReservationFailed: (d) => ({
    title: 'Room not available',
    message: `Sorry ${d.guestName}, ${reasonText(d.reason)}. Your booking could not be made.`,
  }),
  PaymentSucceeded: (d) => ({
    title: 'Payment received',
    message: `Payment of ${money(d.amount)} was received for ${d.guestName}.`,
  }),
  PaymentFailed: (d) => ({
    title: 'Payment failed',
    message: `Sorry ${d.guestName}, ${reasonText(d.reason)} (amount ${money(d.amount)}).`,
  }),
  BookingConfirmed: (d) => ({
    title: 'Booking confirmed',
    message: `Good news ${d.guestName}! Your stay from ${d.checkIn} to ${d.checkOut} is confirmed.`,
  }),
  BookingFailed: (d) => ({
    title: 'Booking failed',
    message: `Sorry ${d.guestName}, your booking failed because ${reasonText(d.reason)}.`,
  }),
  BookingCancelled: (d) => ({
    title: 'Booking cancelled',
    message: `${d.guestName}, your booking has been cancelled and any payment will be refunded.`,
  }),
};

function buildNotification(event) {
  const type = event && event.eventType;
  const data = (event && event.data) || {};
  const safe = { ...data, guestName: data.guestName || 'guest' };
  const template = TEMPLATES[type];
  if (!template) {
    return {
      title: type || 'Event received',
      message: `An event was received for booking ${data.bookingId || 'unknown'}.`,
    };
  }
  return template(safe);
}

module.exports = { buildNotification };