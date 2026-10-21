// Database queries for the bookings table.
const { pool } = require('./db');

// The columns the API returns, renamed to camelCase.
// ::text keeps dates as "2026-11-10" (otherwise node-pg makes a Date shifted by the time zone).
// ::float turns money into a number (otherwise node-pg gives the string "160.00").
const COLUMNS = `
  id,
  room_id             AS "roomId",
  hotel_id            AS "hotelId",
  guest_name          AS "guestName",
  guest_email         AS "guestEmail",
  check_in::text      AS "checkIn",
  check_out::text     AS "checkOut",
  total_amount::float AS "totalAmount",
  status,
  failure_reason      AS "failureReason",
  created_at          AS "createdAt",
  updated_at          AS "updatedAt"`;

// Saves a new booking with status PENDING. $1, $2 ... are filled in safely by pg (no SQL injection).
async function insertBooking(b) {
  const { rows } = await pool.query(
    `INSERT INTO bookings (id, room_id, hotel_id, guest_name, guest_email, check_in, check_out, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
     RETURNING ${COLUMNS}`,
    [b.id, b.roomId, b.hotelId, b.guestName, b.guestEmail, b.checkIn, b.checkOut, b.totalAmount]
  );
  return rows[0];
}

// One booking, or null if it does not exist.
async function getBookingById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM bookings WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Newest first, at most 50. If guestEmail is given, only that guest's bookings.
async function listBookings(guestEmail) {
  if (guestEmail) {
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM bookings WHERE guest_email = $1 ORDER BY created_at DESC LIMIT 50`,
      [guestEmail]
    );
    return rows;
  }
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM bookings ORDER BY created_at DESC LIMIT 50`);
  return rows;
}

// Used when BookingCreated could not be published: the booking can never continue, so mark it FAILED.
async function markPublishFailed(id) {
  const { rows } = await pool.query(
    `UPDATE bookings SET status = 'FAILED', failure_reason = 'PUBLISH_FAILED', updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id]
  );
  return rows[0];
}

// Finishes a booking (CONFIRMED or FAILED), but only while it is still PENDING.
// Returns the updated booking, or null if it does not exist or was already finished.
// `db` is the transaction client from processOnce, so this change commits together with the eventId.
async function finishPendingBooking(id, status, failureReason, db = pool) {
  const { rows } = await db.query(
    `UPDATE bookings SET status = $2, failure_reason = $3, updated_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING ${COLUMNS}`,
    [id, status, failureReason]
  );
  return rows[0] || null;
}

module.exports = {
  COLUMNS,
  insertBooking,
  getBookingById,
  listBookings,
  markPublishFailed,
  finishPendingBooking,
};
