const { processOnce, createLogger } = require('./messaging');
const { buildNotification } = require('./messageTemplates');

const logger = createLogger('notification-service');

function createHandlers({ pool }) {
  // Called by the shared consumer for every message on notification.q.
  // Throwing makes the library retry, then send the message to notification.dlq.
  async function handleEvent(event) {
    if (!event || !event.eventId || !event.eventType) {
      throw new Error('Invalid event: eventId and eventType are required');
    }
    const data = event.data || {};
    const bookingId = data.bookingId || event.correlationId;
    if (!bookingId) throw new Error('Invalid event: bookingId is missing');

    const meta = { eventType: event.eventType, eventId: event.eventId, bookingId };

    const outcome = await processOnce(pool, event, async (client) => {
      const { title, message } = buildNotification(event);

      // Event log: feeds the event timeline in the UI.
      await client.query(
        `INSERT INTO event_log (event_id, event_type, booking_id, payload, occurred_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (event_id) DO NOTHING`,
        [event.eventId, event.eventType, bookingId, JSON.stringify(data), event.occurredAt || null]
      );

      // Notification: what the guest would be told.
      await client.query(
        `INSERT INTO notifications (event_id, booking_id, event_type, title, message)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (event_id) DO NOTHING`,
        [event.eventId, bookingId, event.eventType, title, message]
      );
      return { title };
    });

    if (outcome.duplicate) logger.warn('Duplicate event ignored', meta);
    else logger.info('Notification stored', { ...meta, title: outcome.result.title });
  }

  return { handleEvent };
}

module.exports = { createHandlers };