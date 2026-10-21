const crypto = require('crypto');
const { processOnce, createLogger } = require('./messaging');
const { processPayment } = require('./paymentProcessor');
const { insertPayment } = require('./payments');
const adminState = require('./adminState');

// Throws if a required field is missing. The shared consumer retries, then dead-letters.
function requireFields(data, fields) {
  const missing = fields.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
}

function createHandlers({ pool, broker }) {
  const logger = createLogger('payment-service');
  const meta = (event) => ({
    eventType: event.eventType,
    eventId: event.eventId,
    bookingId: (event.data && event.data.bookingId) || event.correlationId,
  });

  // RoomReserved: decide the payment, save it, then publish the outcome (event chaining).
  async function handleRoomReserved(event) {
    const data = event.data || {};
    requireFields(data, ['bookingId', 'totalAmount', 'guestName', 'guestEmail']);

    const outcome = await processOnce(pool, event, async (client) => {
      // Demo switch: simulate a temporary failure so the retry logic can be shown.
      if (adminState.consumeTransientError()) {
        throw new Error('Simulated transient payment error');
      }

      const { status, reason } = processPayment(
        { amount: data.totalAmount },
        { failureMode: adminState.getFailureMode() }
      );
      // The database only accepts amounts of 0 or more, so an invalid amount is stored as 0.
      const amount = Number.isFinite(data.totalAmount) && data.totalAmount >= 0 ? data.totalAmount : 0;
      const paymentId = crypto.randomUUID();

      const inserted = await insertPayment(client, {
        id: paymentId,
        bookingId: data.bookingId,
        amount,
        status,
        reason,
      });
      // A payment for this booking already exists: publish nothing.
      if (!inserted) return { created: false };

      const payload = {
        bookingId: data.bookingId,
        paymentId,
        amount,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
      };
      if (status === 'SUCCESS') {
        await broker.publish('PaymentSucceeded', payload, { causedBy: event.eventId });
      } else {
        // The event reason is always PAYMENT_DECLINED (contract). The detailed reason stays in the database.
        await broker.publish('PaymentFailed', { ...payload, reason: 'PAYMENT_DECLINED' }, { causedBy: event.eventId });
      }
      return { created: true, status, reason };
    });

    if (outcome.duplicate) {
      logger.warn('Duplicate event ignored', meta(event));
    } else if (!outcome.result.created) {
      logger.warn('Payment already exists for this booking, nothing published', meta(event));
    } else {
      logger.info('Payment processed', { ...meta(event), status: outcome.result.status, reason: outcome.result.reason });
    }
  }

  const handlers = {
    RoomReserved: handleRoomReserved,
  };

  // Called by the shared consumer for every message on payment.q.
  async function handleEvent(event) {
    const handler = handlers[event.eventType];
    if (!handler) {
      logger.warn('Ignoring event type with no handler', meta(event));
      return;
    }
    await handler(event);
  }

  return { handleEvent };
}

module.exports = { createHandlers };