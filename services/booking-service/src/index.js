const { createApp } = require('./app');
const { createBroker, createLogger } = require('./messaging');

const logger = createLogger('booking-service');
const port = process.env.PORT || 3002;

const broker = createBroker({ url: process.env.RABBITMQ_URL, serviceName: 'booking-service' });

// The REST API starts first, so it answers even while RabbitMQ is still starting.
const app = createApp({ broker });
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});

// Then connect to RabbitMQ. connect() keeps retrying until RabbitMQ is reachable.
async function startMessaging() {
  await broker.connect();
}

startMessaging().catch((err) => {
  logger.error('Could not start messaging', { error: err.message });
  process.exit(1);
});
