const { pool } = require('./db');

// amount is NUMERIC in Postgres (returned as text), so cast it to a number here.
const COLUMNS = `id,
  booking_id AS "bookingId",
  amount::float AS amount,
  status,
  reason,
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

// Newest first, maximum 50. Optional filter by booking.
async function listPayments(bookingId) {
  if (bookingId) {
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [bookingId]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM payments ORDER BY created_at DESC LIMIT 50`
  );
  return rows;
}

// One payment by id, or null when it does not exist.
async function getPayment(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM payments WHERE id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { listPayments, getPayment };