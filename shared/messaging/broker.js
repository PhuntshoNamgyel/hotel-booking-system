const amqp = require('amqplib');
const { EXCHANGE, DLX, EVENTS } = require('./constants');
const { buildEvent } = require('./events');
const { createLogger } = require('./logger');

const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 3000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createBroker({ url, serviceName }) {
  const logger = createLogger(serviceName);
  let connection;
  let pubChannel; // confirm channel: we learn when RabbitMQ has really stored the message
  let subChannel;
  let closing = false;

  // Connects to RabbitMQ (retrying while it starts) and declares the two exchanges.
  async function connect() {
    for (let attempt = 1; ; attempt += 1) {
      try {
        connection = await amqp.connect(url);
        break;
      } catch (err) {
        if (attempt >= 20) throw err;
        logger.warn('RabbitMQ not reachable, retrying', { attempt, error: err.message });
        await sleep(3000);
      }
    }
    connection.on('error', (err) => logger.error('RabbitMQ connection error', { error: err.message }));
    connection.on('close', () => {
      if (closing) return;
      logger.error('RabbitMQ connection closed unexpectedly, exiting');
      process.exit(1);
    });

    pubChannel = await connection.createConfirmChannel();
    subChannel = await connection.createChannel();
    await subChannel.prefetch(1); // one message at a time keeps events in order
    for (const channel of [pubChannel, subChannel]) {
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await channel.assertExchange(DLX, 'direct', { durable: true });
    }
    logger.info('Connected to RabbitMQ');
  }

  // Publishes one event. Resolves only after RabbitMQ confirms it stored the message.
  function publish(eventType, data, options = {}) {
    const event = buildEvent(eventType, data, options);
    const routingKey = EVENTS[eventType];
    return new Promise((resolve, reject) => {
      pubChannel.publish(
        EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(event)),
        { persistent: true, contentType: 'application/json', messageId: event.eventId, type: eventType },
        (err) => {
          if (err) {
            logger.error('Publish failed', { eventType, eventId: event.eventId, error: err.message });
            return reject(err);
          }
          logger.info('Event published', {
            eventType,
            eventId: event.eventId,
            bookingId: event.correlationId,
            routingKey,
          });
          return resolve(event);
        }
      );
    });
  }

  // Creates the service's own durable queue (plus its dead-letter queue), binds it to the
  // routing keys, and starts consuming. handler(event) must throw if processing fails.
  async function subscribe({ queue, routingKeys, handler }) {
    const dlq = queue.replace(/\.q$/, '.dlq');

    await subChannel.assertQueue(dlq, { durable: true });
    await subChannel.bindQueue(dlq, DLX, dlq);
    await subChannel.assertQueue(queue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': dlq },
    });
    for (const key of routingKeys) {
      await subChannel.bindQueue(queue, EXCHANGE, key);
    }

    await subChannel.consume(
      queue,
      async (msg) => {
        if (!msg) return;

        let event;
        try {
          event = JSON.parse(msg.content.toString());
        } catch (err) {
          logger.error('Invalid JSON, sending to dead-letter queue', { queue, error: err.message });
          subChannel.nack(msg, false, false);
          return;
        }

        const meta = { queue, eventType: event.eventType, eventId: event.eventId, bookingId: event.correlationId };
        if (msg.fields.redelivered) logger.warn('Redelivered message', meta);
        logger.info('Event received', meta);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          try {
            await handler(event);
            subChannel.ack(msg); // acknowledge only after the work is done
            logger.info('Event processed', meta);
            return;
          } catch (err) {
            logger.warn('Handler failed', { ...meta, attempt, maxAttempts: MAX_ATTEMPTS, error: err.message });
            if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
          }
        }

        logger.error('Giving up, sending to dead-letter queue', { ...meta, dlq });
        subChannel.nack(msg, false, false); // routed to the dead-letter queue
      },
      { noAck: false }
    );
    logger.info('Subscribed', { queue, routingKeys });
  }

  async function close() {
    closing = true;
    try {
      await subChannel.close();
      await pubChannel.close();
      await connection.close();
    } catch (err) {
      logger.warn('Error while closing', { error: err.message });
    }
  }

  return { connect, publish, subscribe, close };
}

module.exports = { createBroker };