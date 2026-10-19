// Proves one published event is delivered to two different queues (two "services").
const amqp = require('amqplib');
const { createBroker, EVENTS } = require('./index');

const url =
  process.env.RABBITMQ_URL ||
  `amqp://${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASS}@localhost:5672`;

const QUEUES = ['smoke-a.q', 'smoke-b.q'];

async function main() {
  const broker = createBroker({ url, serviceName: 'smoke-test' });
  await broker.connect();

  const received = new Set();
  let finish;
  const done = new Promise((resolve, reject) => {
    finish = resolve;
    setTimeout(() => reject(new Error('Timed out waiting for both queues')), 10000);
  });

  for (const queue of QUEUES) {
    await broker.subscribe({
      queue,
      routingKeys: [EVENTS.BookingCreated],
      handler: async (event) => {
        console.log(`  ${queue} received ${event.eventType} (${event.eventId})`);
        received.add(queue);
        if (received.size === QUEUES.length) finish();
      },
    });
  }

  await broker.publish('BookingCreated', { bookingId: 'smoke-1', roomId: 1 });
  await done;
  console.log('PASS: both queues received the same event');

  await broker.close();

  // Remove the temporary queues.
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  for (const q of QUEUES) {
    await ch.deleteQueue(q);
    await ch.deleteQueue(q.replace('.q', '.dlq'));
  }
  await conn.close();
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});