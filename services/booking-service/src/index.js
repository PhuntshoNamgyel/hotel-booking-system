const { createApp } = require('./app');
const { pool } = require('./db');
const { createBroker, createLogger, EVENTS } = require('./messaging');
const { createHandlers } = require('./handlers');

const logger = createLogger('booking-service');
const port = process.env.PORT || 3002;

const broker = createBroker({ url: process.env.RABBITMQ_URL, serviceName: 'booking-service' });

// The REST API starts first, so it answers even while RabbitMQ is still starting.
const app = createApp({ broker });
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});

// Then connect to RabbitMQ (connect() keeps retrying) and start listening on booking.q.
// booking.q is durable: events that arrive while this service is stopped wait there.
async function startMessaging() {
  await broker.connect();
  const { handleEvent } = createHandlers({ pool, broker });
  await broker.subscribe({
    queue: 'booking.q',
    routingKeys: [EVENTS.RoomReservationFailed, EVENTS.PaymentSucceeded, EVENTS.PaymentFailed],
    handler: handleEvent,
  });
}

startMessaging().catch((err) => {
  logger.error('Could not start messaging', { error: err.message });
  process.exit(1);
});
