// Sends one test event to the Booking Service, standing in for Hotel or Payment.
//
// Usage (from services/booking-service):
//   npm run send -- PaymentSucceeded <bookingId>
//   npm run send -- PaymentFailed <bookingId>
//   npm run send -- RoomReservationFailed <bookingId>
//
// Options:
//   --seed=<text>  the same seed always gives the same eventId, so sending twice simulates a duplicate
//   --bad          leaves out bookingId, so the handler fails (shows retries and the dead letter queue)
const { createBroker } = require('../src/messaging');

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith('--seed='));
const bad = args.includes('--bad');
const [eventType, bookingId] = args.filter((a) => !a.startsWith('--'));

// Fixed test data for each event, following docs/event-contracts.md.
const testData = {
  PaymentSucceeded: { paymentId: 'p-test', amount: 100, guestName: 'Test Guest', guestEmail: 'test@example.com' },
  PaymentFailed: {
    paymentId: 'p-test',
    amount: 100,
    guestName: 'Test Guest',
    guestEmail: 'test@example.com',
    reason: 'PAYMENT_DECLINED',
  },
  RoomReservationFailed: {
    roomId: 1,
    guestName: 'Test Guest',
    guestEmail: 'test@example.com',
    reason: 'ROOM_UNAVAILABLE',
  },
};

if (!testData[eventType] || !bookingId) {
  console.error('Usage: npm run send -- <PaymentSucceeded|PaymentFailed|RoomReservationFailed> <bookingId> [--seed=text] [--bad]');
  process.exit(1);
}

const data = bad ? testData[eventType] : { bookingId, ...testData[eventType] };

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
