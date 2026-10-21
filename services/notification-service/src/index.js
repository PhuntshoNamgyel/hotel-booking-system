const app = require('./app');
const { pool } = require('./db');
const { createBroker, createLogger } = require('./messaging');
const { createHandlers } = require('./handlers');

const logger = createLogger('notification-service');
const port = process.env.PORT || 3004;

// The REST API starts first, so it works even while RabbitMQ is still starting.
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});

async function startMessaging() {
  const broker = createBroker({ url: process.env.RABBITMQ_URL, serviceName: 'notification-service' });
  await broker.connect();
  const { handleEvent } = createHandlers({ pool });
  // '#' means every routing key: this service receives a copy of every event.
  await broker.subscribe({
    queue: 'notification.q',
    routingKeys: ['#'],
    handler: handleEvent,
  });
}

startMessaging().catch((err) => {
  logger.error('Could not start messaging', { error: err.message });
  process.exit(1);
});