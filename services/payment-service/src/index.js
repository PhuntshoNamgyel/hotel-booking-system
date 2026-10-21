const app = require('./app');
const { pool } = require('./db');
const { createBroker, createLogger, EVENTS } = require('./messaging');
const { createHandlers } = require('./handlers');

const logger = createLogger('payment-service');
const port = process.env.PORT || 3003;

// The REST API starts first, so it works even while RabbitMQ is still starting.
app.listen(port, () => {
  logger.info('Listening', { port: Number(port) });
});

async function startMessaging() {
  const broker = createBroker({ url: process.env.RABBITMQ_URL, serviceName: 'payment-service' });
  await broker.connect();
  const { handleEvent } = createHandlers({ pool, broker });
  await broker.subscribe({
    queue: 'payment.q',
    routingKeys: [EVENTS.RoomReserved, EVENTS.BookingCancelled],
    handler: handleEvent,
  });
}

startMessaging().catch((err) => {
  logger.error('Could not start messaging', { error: err.message });
  process.exit(1);
});