const app = require('./app');
const { pool } = require('./db');
const { createBroker, createLogger, EVENTS } = require('./messaging');
const { createHandlers } = require('./handlers');

const logger = createLogger('hotel-service');
const port = process.env.PORT || 3001;

// The REST API starts first, so it works even while RabbitMQ is still starting.
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});

async function startMessaging() {
  const broker = createBroker({ url: process.env.RABBITMQ_URL, serviceName: 'hotel-service' });
  await broker.connect();
  const { handleEvent } = createHandlers({ pool, broker });
  await broker.subscribe({
    queue: 'hotel.q',
    routingKeys: [EVENTS.BookingCreated, EVENTS.BookingConfirmed, EVENTS.BookingFailed, EVENTS.BookingCancelled],
    handler: handleEvent,
  });
}

startMessaging().catch((err) => {
  logger.error('Could not start messaging', { error: err.message });
  process.exit(1);
});