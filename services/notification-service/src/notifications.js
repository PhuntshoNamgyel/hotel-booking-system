const { pool } = require('./db');

// Newest first. A null bookingId means "all bookings".
const NOTIFICATIONS_SQL = `
  SELECT id,
         event_id   AS "eventId",
         booking_id AS "bookingId",
         event_type AS "eventType",
         title,
         message,
         created_at AS "createdAt"
    FROM notifications
   WHERE ($1::text IS NULL OR booking_id = $1)
   ORDER BY id DESC
   LIMIT $2`;

// Oldest first, so the list reads like the story of the booking.
const EVENTS_SQL = `
  SELECT event_id    AS "eventId",
         event_type  AS "eventType",
         booking_id  AS "bookingId",
         payload,
         occurred_at AS "occurredAt",
         received_at AS "receivedAt"
    FROM event_log
   WHERE booking_id = $1
   ORDER BY received_at ASC, event_id ASC`;

async function listNotifications({ bookingId, limit }) {
  const { rows } = await pool.query(NOTIFICATIONS_SQL, [bookingId, limit]);
  return rows;
}

async function listEvents(bookingId) {
  const { rows } = await pool.query(EVENTS_SQL, [bookingId]);
  return rows;
}

module.exports = { listNotifications, listEvents };