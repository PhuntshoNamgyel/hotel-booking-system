const { createApp } = require('./app');
const { createLogger } = require('./messaging');

const logger = createLogger('booking-service');
const port = process.env.PORT || 3002;

// Step 1: REST API only. RabbitMQ is connected in a later step.
const app = createApp();
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});
