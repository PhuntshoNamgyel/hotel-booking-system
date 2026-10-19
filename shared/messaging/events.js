const crypto = require('crypto');
const { EVENTS } = require('./constants');

// Builds a UUID-shaped id from a seed. The same seed always gives the same id.
function deterministicUuid(seed) {
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Creates the standard event envelope from docs/event-contracts.md.
// Pass options.causedBy (the eventId of the event you are reacting to) when publishing
// from inside a consumer. If that consumer retries, the new event gets the SAME id,
// so downstream services recognise it as a duplicate instead of acting twice.
function buildEvent(eventType, data, options = {}) {
  if (!EVENTS[eventType]) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  const { correlationId, causedBy } = options;
  return {
    eventId: causedBy ? deterministicUuid(`${causedBy}:${eventType}`) : crypto.randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    correlationId: correlationId || (data && data.bookingId) || null,
    data,
  };
}

module.exports = { buildEvent };