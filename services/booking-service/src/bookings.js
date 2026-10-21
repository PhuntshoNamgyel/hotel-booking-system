const { pool } = require('./db');

// Columns returned by the API. Dates become YYYY-MM-DD text and money becomes a number,
// because node-pg would otherwise give Date objects and strings.
const BOOKING_COLUMNS = `
  id,
  room_id          AS "roomId",
  hotel_id         AS "hotelId",
  guest_name       AS "guestName",
  guest_email      AS "guestEmail",
  check_in::text   AS "checkIn",
  check_out::text  AS "checkOut",
  total_amount::float AS "totalAmount",
  status,
  failure_reason   AS "failureReason",
  created_at       AS "createdAt",
  updated_at       AS "updatedAt"`;

// Every function takes an optional `db` so it can run inside a transaction (pass a client).

async function insertBooking(booking, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO bookings (id, room_id, hotel_id, guest_name, guest_email, check_in, check_out, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
     RETURNING ${BOOKING_COLUMNS}`,
    [
      booking.id,
      booking.roomId,
      booking.hotelId,
      booking.guestName,
      booking.guestEmail,
      booking.checkIn,
      booking.checkOut,
      booking.totalAmount,
    ]
  );
  return rows[0];
}

async function getBookingById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Newest first, at most 50. guestEmail is optional.
async function listBookings({ guestEmail } = {}, db = pool) {
  if (guestEmail) {
    const { rows } = await db.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE guest_email = $1 ORDER BY created_at DESC LIMIT 50`,
      [guestEmail]
    );
    return rows;
  }
  const { rows } = await db.query(`SELECT ${BOOKING_COLUMNS} FROM bookings ORDER BY created_at DESC LIMIT 50`);
  return rows;
}

module.exports = { BOOKING_COLUMNS, insertBooking, getBookingById, listBookings };
