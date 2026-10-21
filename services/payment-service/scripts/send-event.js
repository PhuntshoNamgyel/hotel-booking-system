// Sends one test event, standing in for the Hotel and Booking services.
//
// Usage (from services/payment-service):
//   npm run send -- RoomReserved <bookingId> [amount] [--seed=<text>] [--bad]
//   npm run send -- BookingCancelled <bookingId> [--seed=<text>] [--bad]
//
// --seed=<text>  gives a reproducible eventId, so sending twice simulates a duplicate delivery.
// --bad          leaves out bookingId, so the handler rejects the event.
const { createBroker } = require('../src/messaging');

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith('--seed='));
const bad = args.includes('--bad');
const [eventType, bookingId, amountArg] = args.filter((a) => !a.startsWith('--'));

if (!['RoomReserved', 'BookingCancelled'].includes(eventType) || (!bookingId && !bad)) {
  console.error('Usage: npm run send -- <RoomReserved|BookingCancelled> <bookingId> [amount] [--seed=text] [--bad]');
  process.exit(1);
}

const base = {
  bookingId,
  roomId: 1,
  hotelId: 1,
  guestName: 'Test Guest',
  guestEmail: 'test@example.com',
};

const data =
  eventType === 'RoomReserved'
    ? {
        ...base,
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        totalAmount: amountArg === undefined ? 100 : Number(amountArg),
      }
    : { ...base };

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