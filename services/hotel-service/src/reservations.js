// Database logic for reservations. Every function takes a transaction "client",
// so the caller decides when the transaction starts and commits.

// Tries to hold a room for a booking.
// Returns { ok: true } or { ok: false, reason: 'ROOM_UNAVAILABLE' }.
async function reserveRoom(client, { bookingId, roomId, checkIn, checkOut }) {
  // Lock this room's row. Anyone else reserving the same room waits here until we commit,
  // so two bookings can never both take the last unit.
  const room = await client.query('SELECT id, total_units FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
  if (room.rows.length === 0) return { ok: false, reason: 'ROOM_UNAVAILABLE' };

  // This booking may already have a reservation (for example after a retry).
  const existing = await client.query('SELECT status FROM reservations WHERE booking_id = $1', [bookingId]);
  if (existing.rows.length > 0) {
    return existing.rows[0].status === 'RELEASED'
      ? { ok: false, reason: 'ROOM_UNAVAILABLE' }
      : { ok: true, alreadyReserved: true };
  }

  // Count stays that overlap the requested dates.
  const overlap = await client.query(
    `SELECT COUNT(*)::int AS booked
       FROM reservations
      WHERE room_id = $1
        AND status IN ('HELD', 'CONFIRMED')
        AND check_in < $3::date
        AND check_out > $2::date`,
    [roomId, checkIn, checkOut]
  );
  if (overlap.rows[0].booked >= room.rows[0].total_units) {
    return { ok: false, reason: 'ROOM_UNAVAILABLE' };
  }

  await client.query(
    `INSERT INTO reservations (booking_id, room_id, check_in, check_out, status)
     VALUES ($1, $2, $3, $4, 'HELD')`,
    [bookingId, roomId, checkIn, checkOut]
  );
  return { ok: true };
}

// Moves a reservation to a new status, but only from the allowed current statuses.
// Returns how many rows changed (0 means nothing to do).
async function updateStatus(client, bookingId, newStatus, fromStatuses) {
  const result = await client.query(
    `UPDATE reservations
        SET status = $2, updated_at = NOW()
      WHERE booking_id = $1 AND status = ANY($3::text[])`,
    [bookingId, newStatus, fromStatuses]
  );
  return result.rowCount;
}

module.exports = { reserveRoom, updateStatus };