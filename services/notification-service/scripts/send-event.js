// Sends one test event, standing in for the other services.
//
// Usage (from services/notification-service):
//   npm run send -- <EventType> <bookingId> [--seed=<text>] [--bad]
//   Example: npm run send -- BookingConfirmed n-1
//
// Using the same --seed twice sends an event with the SAME eventId (a duplicate delivery).
// --bad leaves out the bookingId, so the handler rejects the event.
const { createBroker } = require('../src/messaging');

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith('--seed='));
const bad = args.includes('--bad');
const [eventType, bookingId] = args.filter((a) => !a.startsWith('--'));

if (!eventType || !bookingId) {
  console.error('Usage: npm run send -- <EventType> <bookingId> [--seed=text] [--bad]');
  process.exit(1);
}

const data = {
  bookingId,
  roomId: 1,
  hotelId: 1,
  guestName: 'Test Guest',
  guestEmail: 'test@example.com',
  checkIn: '2026-12-01',
  checkOut: '2026-12-03',
  totalAmount: 100,
  amount: 100,
  paymentId: 'p-test',
  reason: 'PAYMENT_DECLINED',
};
if (bad) delete data.bookingId;

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