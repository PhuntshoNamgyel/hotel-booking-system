// Sends one test event, standing in for the Booking Service until it exists.
//
// Usage (from services/hotel-service):
//   npm run send -- BookingCreated <bookingId> <roomId> <checkIn> <checkOut> [--seed=<text>]
//   npm run send -- BookingConfirmed <bookingId> <roomId>
//   npm run send -- BookingFailed <bookingId> <roomId>
//   npm run send -- BookingCancelled <bookingId> <roomId>
//
// Using the same --seed twice sends an event with the SAME eventId, which simulates a duplicate delivery.
const { createBroker } = require('../src/messaging');

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith('--seed='));
const [eventType, bookingId, roomId, checkIn, checkOut] = args.filter((a) => !a.startsWith('--'));

if (!eventType || !bookingId || !roomId) {
  console.error('Usage: npm run send -- <EventType> <bookingId> <roomId> [checkIn] [checkOut] [--seed=text]');
  process.exit(1);
}

const data = {
  bookingId,
  roomId: Number(roomId),
  hotelId: 1,
  guestName: 'Test Guest',
  guestEmail: 'test@example.com',
  checkIn,
  checkOut,
  totalAmount: 100,
  reason: 'PAYMENT_DECLINED',
};

async function main() {
  const broker = createBroker({ url: process.env.RABBITMQ_URL, serviceName: 'send-event-script' });
  await broker.connect();
  const options = seedArg ? { causedBy: seedArg.slice('--seed='.length) } : {};
  await broker.publish(eventType, data, options);
  await broker.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});